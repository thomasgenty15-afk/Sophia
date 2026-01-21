import { generateEmbedding, generateWithGemini } from "../_shared/gemini.ts";

// Cursor/TS linter (Node TS) doesn't know Deno globals for Edge Functions.
// This keeps the file type-safe enough without changing runtime behavior.
declare const Deno: {
  env: { get(name: string): string | undefined };
};

function isMegaTestMode(meta?: { forceRealAi?: boolean }): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
  return megaEnabled && !meta?.forceRealAi;
}

function getAgentJudgeModel(): string {
  // Dedicated env var to avoid confusion with `eval-judge`.
  // Default requested: gemini-3-flash-preview
  return (Deno.env.get("GEMINI_AGENT_JUDGE_MODEL") ?? "").trim() || "gemini-3-flash-preview";
}

function getRewriteModel(): string {
  return (Deno.env.get("GEMINI_REWRITE_MODEL") ?? "").trim() ||
    (Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "").trim() ||
    "gemini-2.5-flash";
}

type OneShotJudgeResult = {
  ok: boolean;
  rewritten: boolean;
  issues: string[];
  final_text: string;
  rewrite_brief?: string;
};

function parseOneShotJudgeJson(raw: unknown): OneShotJudgeResult | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const ok = Boolean((obj as any).ok);
    const rewritten = Boolean((obj as any).rewritten);
    const issues = Array.isArray((obj as any).issues)
      ? (obj as any).issues.map((x: any) => String(x)).filter(Boolean)
      : [];
    const final_text = String((obj as any).final_text ?? "");
    const rewrite_brief = (obj as any).rewrite_brief != null ? String((obj as any).rewrite_brief) : undefined;
    return { ok, rewritten, issues, final_text, rewrite_brief };
  } catch {
    return null;
  }
}

async function oneShotJudgeAndRewrite(args: {
  kind: string;
  agent: string;
  channel: "web" | "whatsapp";
  draft: string;
  mechanical_violations: string[];
  context_used?: string;
  recent_history?: any[];
  now_iso?: string;
  data_json?: unknown;
  tools_available?: ToolDescriptor[];
  meta?: { requestId?: string; forceRealAi?: boolean; userId?: string };
}): Promise<OneShotJudgeResult> {
  const draft = collapseBlankLines(normalizeChatText(args.draft));
  const mech = Array.isArray(args.mechanical_violations) ? args.mechanical_violations : [];
  if (isMegaTestMode(args.meta)) {
    return { ok: true, rewritten: false, issues: [], final_text: draft };
  }

  const addendum = agentJudgeAddendum(args.agent, args.channel);
  const includeDataJson = (() => {
    const raw = (Deno.env.get("SOPHIA_AGENT_JUDGE_INCLUDE_DATA_JSON") ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "on";
  })();
  const systemPrompt = `
Tu es "Judge+Rewriter", un contrôleur qualité pour Sophia.
Tu dois 1) juger si le draft est OK, 2) si besoin, proposer une version corrigée.

IMPORTANT:
- Sortie JSON STRICTE uniquement.
- Si ok=true, final_text doit être EXACTEMENT identique au draft (caractère pour caractère).
- Si mechanical_violations n'est PAS vide, ok DOIT être false (tu dois réécrire).
- Si ok=false, tu DOIS corriger les problèmes dans final_text sans changer le fond.
- Ne révèle pas le contexte, n'invente pas de faits.

RÈGLES GLOBALES:
- Français, tutoiement.
- Texte brut uniquement (pas de **, pas de JSON hors sortie).
- Pas de termes techniques internes (logs/database/json/api/etc).
- 1 question max (sauf safety où 2 max si nécessaire).

CONTEXTE:
- kind=${args.kind}
- channel=${args.channel}
- agent=${args.agent}
- now_iso=${JSON.stringify(args.now_iso ?? null)}
- mechanical_violations=${JSON.stringify(mech)}
- context_used=${JSON.stringify(String(args.context_used ?? "").slice(0, 6000))}
- recent_history=${JSON.stringify((args.recent_history ?? []).slice(-15))}
${includeDataJson ? `- data_json=${JSON.stringify(args.data_json ?? null)}` : `- data_json=(omitted)`}

TOOLS DISPONIBLES (si applicable):
${JSON.stringify(args.tools_available ?? [])}

DÉRIVES SPÉCIFIQUES:
${addendum}

DRAFT:
${draft}

SORTIE JSON:
{
  "ok": true/false,
  "issues": ["..."],
  "rewritten": true/false,
  "rewrite_brief": "instructions courtes",
  "final_text": "..."
}
  `.trim();

  // Fast fallback for judge calls:
  // - 1 attempt with 3.0 flash, 1 attempt with 2.5, 1 attempt with 2.0
  // - then loop back to 3.0 (repeat cycle)
  // - each attempt is a single HTTP call (no internal retries) to keep wall-clock bounded.
  const judgeModelCycle = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash"];
  const maxAttempts = (() => {
    const raw = (Deno.env.get("SOPHIA_AGENT_JUDGE_MAX_ATTEMPTS") ?? "").trim();
    const n = Number(raw);
    // Default: 9 (three full cycles). Increase if needed, but keep bounded to avoid edge-runtime wall-clock kills.
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 9;
  })();
  const perAttemptTimeoutMs = (() => {
    const raw = (Deno.env.get("SOPHIA_AGENT_JUDGE_HTTP_TIMEOUT_MS") ?? "").trim();
    const n = Number(raw);
    // Default: 25s per attempt (faster fallback than the general 55s).
    return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 25_000;
  })();

  let raw: unknown = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const model = judgeModelCycle[(attempt - 1) % judgeModelCycle.length] ?? getAgentJudgeModel();
    try {
      raw = await generateWithGemini(systemPrompt, "Analyse et corrige si nécessaire.", 0.0, true, [], "auto", {
        requestId: args.meta?.requestId,
        userId: args.meta?.userId,
        model,
        source: `sophia-brain:${args.kind}_judge:${args.agent}:${args.channel}`,
        forceRealAi: args.meta?.forceRealAi,
        // Force a single attempt per model; we do fallback externally via the cycle.
        maxRetries: 1,
        httpTimeoutMs: perAttemptTimeoutMs,
      });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (raw == null && lastErr) throw lastErr;

  const parsed = parseOneShotJudgeJson(raw);
  if (!parsed) {
    // Fallback: if mechanical issues exist, mark not ok, but keep original (no rewrite available).
    const ok = mech.length === 0;
    return { ok, rewritten: false, issues: mech.map((x) => `mech:${x}`), final_text: draft };
  }

  // Hard safety: if ok=true but model modified final_text, ignore it.
  if (parsed.ok === true) {
    return { ok: true, rewritten: false, issues: parsed.issues, final_text: draft, rewrite_brief: parsed.rewrite_brief };
  }

  const finalText = parsed.final_text && parsed.final_text.trim() ? parsed.final_text : draft;
  return {
    ok: false,
    rewritten: true,
    issues: parsed.issues,
    final_text: collapseBlankLines(normalizeChatText(finalText)),
    rewrite_brief: parsed.rewrite_brief,
  };
}

function agentJudgeAddendum(agent: string, channel: "web" | "whatsapp"): string {
  const a = String(agent ?? "").trim().toLowerCase();
  const isWa = channel === "whatsapp";
  if (a === "architect") {
    return `
RÈGLES SPÉCIFIQUES ARCHITECT:
- Ne promets jamais un changement effectué (créé/activé/modifié) sans preuve tool+succès.
- Évite les explications longues sur WhatsApp; donne 1 prochaine étape concrète.
- Termine par 1 question actionnable (oui/non ou A/B), pas une question vague ("tu veux parler de quoi ?").
${isWa ? "- WhatsApp: 1–2 phrases si le user est pressé.\n" : ""}
    `.trim();
  }
  if (a === "companion") {
    return `
RÈGLES SPÉCIFIQUES COMPANION:
- Ton match: ton/rythme du user. Si user court → toi court.
- Ne “ramène” pas au plan sans permission explicite.
- Pas de coaching structuré non demandé; propose max 2 options.
    `.trim();
  }
  if (a === "firefighter") {
    return `
RÈGLES SPÉCIFIQUES FIREFIGHTER:
- Style sobre, concret, somatique. Pas de poésie.
- Priorité sécurité: si danger immédiat → question sécurité + appel secours.
- 0–1 question (2 max uniquement si sécurité).
- Pas de diagnostic médical, pas de posologie.
    `.trim();
  }
  if (a === "assistant") {
    return `
RÈGLES SPÉCIFIQUES ASSISTANT (TECH):
- Donne des étapes courtes et vérifiables.
- Ne pas inventer l'UI; préférer chemins/URLs.
- Si bloqué: sortie claire support (email) sans boucle.
    `.trim();
  }
  if (a === "librarian") {
    return `
RÈGLES SPÉCIFIQUES LIBRARIAN:
- Réponse plus longue autorisée MAIS structurée (mini-titres, listes).
- 2–4 sections max, puis mini-résumé (3 lignes max).
- 0–1 question max à la fin.
    `.trim();
  }
  return "";
}

function normalizeChatText(text: unknown): string {
  return (text ?? "")
    .toString()
    .replace(/\\n/g, "\n")
    .replace(/\*\*/g, "")
    .trim();
}

function collapseBlankLines(text: string): string {
  return (text ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function countQuestionMarks(text: string): number {
  return ((text ?? "").match(/\?/g) ?? []).length;
}

function cosineSim(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const s = dot / denom;
  if (!Number.isFinite(s)) return 0;
  return Math.max(-1, Math.min(1, s));
}

function extractLastQuestion(text: string): string | null {
  const t = (text ?? "").toString().trim();
  if (!t.includes("?")) return null;
  const parts = t.split("?");
  if (parts.length < 2) return null;
  const lastStem = parts[parts.length - 2] ?? "";
  const q = `${lastStem.trim()}?`.trim();
  if (q.length < 8) return null;
  return q;
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function hasInternalTechLeak(text: string): boolean {
  const t = (text ?? "").toString();
  return /\b(logs?|input|database|json|variable|schema|sql|table|endpoint|api)\b/i.test(t);
}

function hasBoldLeak(text: string): boolean {
  return /\*\*/.test(text ?? "");
}

function looksLikeUserAskedForDetail(userMessage: unknown): boolean {
  const s = (userMessage ?? "").toString().toLowerCase();
  if (!s) return false;
  return /\b(d[ée]tails?|d[ée]taille|explique|pourquoi|comment|d[ée]veloppe|plus\s+en\s+d[ée]tail|tu\s+peux\s+pr[ée]ciser|pr[ée]cise)\b/i
    .test(s);
}

function normalizeLoose(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithGreeting(text: string): boolean {
  const s = (text ?? "").trim().toLowerCase();
  return /^(salut|bonjour|hello|coucou|hey)\b/.test(s);
}

function looksLikeShortUserMessage(userMessage: unknown): boolean {
  const raw = (userMessage ?? "").toString().trim();
  if (!raw) return false;
  const s = normalizeLoose(raw);
  if (raw.length <= 30) return true;
  return /\b(ok|oui|vas y|go|suite|next|continue|on y va|daccord|ça marche)\b/i.test(s);
}

function buildAntiClaimViolations(text: string, ctx: {
  channel: "web" | "whatsapp";
  tools_executed?: boolean;
  executed_tools?: string[];
  tool_execution?: "none" | "blocked" | "success" | "failed" | "uncertain" | string;
  whatsapp_guard_24h?: boolean;
}): string[] {
  const v: string[] = []
  const s = String(text ?? "")
  const channel = ctx.channel
  const toolsExecuted = Boolean(ctx.tools_executed)
  const toolExecution = String(ctx.tool_execution ?? "none").toLowerCase()
  const verifiedSideEffect = toolsExecuted && (toolExecution === "success" || toolExecution === "uncertain")

  // A) Unverified state/side-effect claims
  const claimsSideEffect =
    /\b(j['’]ai|je\s+viens\s+de)\s+(?:cr[ée]er|cr[ée]e|ajouter|activ[ée]r?|modifier|mettre\s+à\s+jour|mettre\s+a\s+jour|archiver|supprimer|enregistrer|noter|synchroniser|synchro)\b/i
      .test(s) ||
    /\b(c['’]est\s+(?:fait|valid[ée]|enregistr[ée]|cr[ée][ée]))\b/i.test(s) ||
    /\b(je\s+viens\s+de\s+v[ée]rifier|j['’]ai\s+v[ée]rifi[ée])\b/i.test(s) && /\b(plan|dashboard|actions?)\b/i.test(s)

  if (claimsSideEffect && !verifiedSideEffect) {
    v.push("unverified_side_effect_claim")
  }

  // B) WhatsApp unsupported capability promises (channel limitations)
  // Keep this conservative: only block clearly unsupported capabilities (calls/emails/calendar/device access).
  const promisesCapability =
    /\bje\s+peux\b/i.test(s) &&
    (
      /\b(appeler|t['’]appeler|t[eé]l[eé]phoner|passer\s+un\s+appel)\b/i.test(s) ||
      /\b(envoyer)\s+(?:un\s+)?(?:mail|email|sms|message)\b/i.test(s) ||
      /\b(acc[eè]der)\s+(?:à|a)\s+(?:ton|ta|tes)\s+(?:calendrier|bo[iî]te\s+mail|emails?|sms|messages?)\b/i.test(s) ||
      /\b(prendre|r[eé]server|booker)\s+(?:un\s+)?rendez[-\s]*vous\b/i.test(s) ||
      /\b(me\s+connecter|acc[eè]der)\s+(?:à|a)\s+ton\s+compte\b/i.test(s) ||
      /\b(voir)\s+(?:ton|ta)\s+(?:[eé]cran|app|dashboard)\b/i.test(s)
    )

  if (channel === "whatsapp" && promisesCapability) {
    v.push("unsupported_capability_claim_whatsapp")
  }

  // C) WhatsApp onboarding guard: never promise activation from WhatsApp.
  if (channel === "whatsapp" && ctx.whatsapp_guard_24h) {
    if (/\bje\s+peux\b/i.test(s) && /\b(activer|activer\s+une\s+action|lancer\s+une\s+action)\b/i.test(s)) {
      v.push("whatsapp_onboarding_guard_capability_claim")
    }
  }

  return v
}

export function buildConversationAgentViolations(text: string, ctx: {
  agent: string;
  channel: "web" | "whatsapp";
  user_message?: unknown;
  last_assistant_message?: unknown;
  history_len?: number;
  tools_executed?: boolean;
  executed_tools?: string[];
  tool_execution?: "none" | "blocked" | "success" | "failed" | "uncertain" | string;
  whatsapp_guard_24h?: boolean;
}): string[] {
  const v: string[] = [];
  const cleaned = (text ?? "").toString();
  const agent = (ctx?.agent ?? "").toString();
  const channel = (ctx?.channel ?? "web") as "web" | "whatsapp";
  const askedDetail = looksLikeUserAskedForDetail(ctx?.user_message);
  const shortUser = looksLikeShortUserMessage(ctx?.user_message);

  if (!cleaned.trim()) v.push("empty_response");
  if (hasBoldLeak(cleaned)) v.push("bold_not_allowed");
  if (hasInternalTechLeak(cleaned)) v.push("internal_tech_terms_not_allowed");
  if (cleaned.includes("\n\n\n")) v.push("too_many_blank_lines");

  const maxQuestions = channel === "whatsapp" ? 1 : 2;
  if (countQuestionMarks(cleaned) > maxQuestions) v.push("too_many_questions");

  // Greeting discipline: don't say "bonjour/salut" mid-thread.
  const histLen = Number(ctx?.history_len ?? 0) || 0;
  if (histLen > 0 && startsWithGreeting(cleaned)) v.push("greeting_not_allowed_mid_conversation");

  // Keep it short on WhatsApp unless user explicitly asked for details.
  const maxChars =
    channel === "whatsapp"
      ? (
          agent === "architect" ? (askedDetail ? 1100 : 520) :
          agent === "librarian" ? (askedDetail ? 2200 : 1400) :
          agent === "companion" ? (askedDetail ? 950 : 420) :
          agent === "firefighter" ? 450 :
          agent === "assistant" ? (askedDetail ? 1200 : 650) :
          (askedDetail ? 1100 : 520)
        )
      : (
          agent === "architect" ? (askedDetail ? 2200 : 1400) :
          agent === "librarian" ? (askedDetail ? 3200 : 2400) :
          agent === "firefighter" ? 800 :
          agent === "assistant" ? 1400 :
          1600
        );
  if (cleaned.length > maxChars) v.push("too_long");

  // If user is short/pressé on WhatsApp, enforce ultra short response.
  if (channel === "whatsapp" && shortUser && !askedDetail) {
    if (cleaned.length > 380) v.push("too_verbose_for_short_user");
    const paras = cleaned.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    if (paras.length > 2) v.push("too_many_paragraphs_for_short_user");
  }

  // Avoid repeating the previous assistant response.
  const last = (ctx?.last_assistant_message ?? "").toString();
  if (last.trim()) {
    const a = normalizeLoose(last).slice(0, 140);
    const b = normalizeLoose(cleaned).slice(0, 140);
    if (a && b && a === b) v.push("repeats_previous_message");
  }

  // Anti-claim / anti-invention (global): prevent unverified state assertions & unsupported promises.
  v.push(...buildAntiClaimViolations(cleaned, {
    channel,
    tools_executed: ctx.tools_executed,
    executed_tools: ctx.executed_tools,
    tool_execution: ctx.tool_execution,
    whatsapp_guard_24h: ctx.whatsapp_guard_24h,
  }));

  return v;
}

export type ToolDescriptor = {
  name: string
  description: string
  usage_when: string
}

export async function judgeOfThree(opts: {
  agent: string
  channel: "web" | "whatsapp"
  user_message: string
  context_used?: string
  recent_history?: any[]
  tools_available?: ToolDescriptor[]
  candidates: Array<{ label: string; text: string; mechanical_violations: string[] }>
  meta?: { requestId?: string; forceRealAi?: boolean; userId?: string }
}): Promise<{ best_index: number; reasons: string[] }> {
  const candidates = (opts.candidates ?? []).slice(0, 3)
  const systemPrompt = `
Tu es "judge-of-3" (sélecteur).
Tu reçois 3 propositions de réponse (candidates) pour Sophia et tu DOIS choisir la meilleure.

OBJECTIF:
- choisir la réponse la plus utile, naturelle, et conforme aux règles (WhatsApp-first).
- si un candidate est non conforme mécaniquement, pénalise-le fortement.
- si un candidate propose un usage d'outil, vérifie que c'est le bon moment et que c'est cohérent avec la demande.

RÈGLES GLOBALES:
- Français, tutoiement, texte brut.
- WhatsApp: concis, 1 question max.
- Pas de termes internes.

CONTEXTE:
- agent=${opts.agent}
- channel=${opts.channel}
- user_message=${JSON.stringify(String(opts.user_message ?? "").slice(0, 1200))}
- context_used=${JSON.stringify(String(opts.context_used ?? "").slice(0, 4000))}
- recent_history=${JSON.stringify((opts.recent_history ?? []).slice(-15))}

TOOLS DISPONIBLES (si applicable):
${JSON.stringify(opts.tools_available ?? [])}

CANDIDATES (avec violations mécaniques):
${JSON.stringify(candidates)}

SORTIE JSON STRICTE:
{
  "best_index": 0|1|2,
  "reasons": ["..."]
}
  `.trim()

  const raw = await generateWithGemini(systemPrompt, "Choisis le meilleur candidate.", 0.0, true, [], "auto", {
    requestId: opts.meta?.requestId,
    userId: opts.meta?.userId,
    model: getAgentJudgeModel(),
    source: `sophia-brain:judge_of_3:${opts.agent}:${opts.channel}`,
    forceRealAi: opts.meta?.forceRealAi,
  })

  try {
    const obj = JSON.parse(String(raw ?? "{}")) as any
    const idx = Number(obj?.best_index ?? 0)
    const best_index = idx === 1 || idx === 2 ? idx : 0
    const reasons = Array.isArray(obj?.reasons) ? obj.reasons.map((x: any) => String(x)).filter(Boolean).slice(0, 8) : []
    return { best_index, reasons }
  } catch {
    return { best_index: 0, reasons: ["parse_failed"] }
  }
}

export async function verifyConversationAgentMessage(opts: {
  draft: string;
  agent: "architect" | "companion" | "firefighter" | "assistant" | string;
  data: {
    user_message?: unknown;
    last_assistant_message?: unknown;
    history_len?: number;
    channel?: "web" | "whatsapp";
    now_iso?: string;
    context_excerpt?: string;
    recent_history?: any[];
    tools_available?: ToolDescriptor[];
  };
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; userId?: string };
}): Promise<{ text: string; rewritten: boolean; violations: string[] }> {
  const { draft, agent, data, meta } = opts;
  const base = collapseBlankLines(normalizeChatText(draft));
  const channel = ((data as any)?.channel ?? meta?.channel ?? "web") as "web" | "whatsapp";
  if (isMegaTestMode(meta)) return { text: base, rewritten: false, violations: [] };
  const violations = buildConversationAgentViolations(base, {
    agent,
    channel,
    user_message: (data as any)?.user_message,
    last_assistant_message: (data as any)?.last_assistant_message,
    history_len: (data as any)?.history_len,
    tools_executed: Boolean((data as any)?.tools_executed),
    executed_tools: Array.isArray((data as any)?.executed_tools) ? (data as any).executed_tools : [],
    tool_execution: String((data as any)?.tool_execution ?? "none"),
    whatsapp_guard_24h: Boolean((data as any)?.whatsapp_guard_24h),
  });

  // Semantic anti-loop (prod): detect assistant repeating the same idea as recent assistant messages.
  // We compare the current draft (full message) against the last N assistant messages (default 5).
  // This catches "same subject" even when the exact wording changes.
  try {
    const alreadyFlaggedExact = violations.includes("repeats_previous_message");
    if (!alreadyFlaggedExact) {
      const threshold = Math.max(0.7, Math.min(0.99, parseNumberEnv("SOPHIA_VERIFIER_SEMANTIC_REPEAT_THRESHOLD", 0.92)));
      const window = Math.max(2, Math.min(10, parseNumberEnv("SOPHIA_VERIFIER_SEMANTIC_REPEAT_WINDOW", 5)));
      const recent = Array.isArray((data as any)?.recent_history) ? (data as any).recent_history : [];
      const prevAssistant = recent
        .filter((m: any) => String(m?.role ?? "") === "assistant" && typeof m?.content === "string")
        .map((m: any) => String(m?.content ?? ""))
        .filter((s: string) => s.trim().length >= 20)
        .slice(-window);

      if (prevAssistant.length > 0 && base.trim().length >= 20) {
        // Embedding-only anti-loop:
        // - compare full message embeddings (global repetition)
        // - AND compare last-question embeddings (common loop: assistant repeats the same closing question)
        const cache = new Map<string, number[]>()
        const embed = async (s: string) => {
          const key = String(s ?? "").slice(0, 700)
          const hit = cache.get(key)
          if (hit) return hit
          const vec = await generateEmbedding(key, { userId: meta?.userId, forceRealAi: meta?.forceRealAi })
          cache.set(key, vec)
          return vec
        }

        const curFull = String(base).slice(0, 700)
        const curQ = (extractLastQuestion(base) ?? "").slice(0, 300)
        const eCurFull = await embed(curFull)
        const eCurQ = curQ ? await embed(curQ) : null

        let best = 0
        for (const prev of prevAssistant) {
          const prevFull = String(prev).slice(0, 700)
          const prevQ = (extractLastQuestion(prev) ?? "").slice(0, 300)
          const ePrevFull = await embed(prevFull)
          const simFull = cosineSim(eCurFull, ePrevFull)
          if (simFull > best) best = simFull

          if (eCurQ && prevQ) {
            const ePrevQ = await embed(prevQ)
            const simQ = cosineSim(eCurQ, ePrevQ)
            if (simQ > best) best = simQ
          }

          if (best >= threshold) break
        }
        if (best >= threshold) {
          violations.push("semantic_repeats_previous_question")
        }
      }
    }
  } catch {
    // Best-effort: do not block production responses on embedding failures.
  }

  // Cost + stability: only call the LLM judge when there are mechanical violations.
  // This avoids "hallucinated rewrites" (e.g. wrong action names) when the draft is already compliant.
  const alwaysJudge = (Deno.env.get("SOPHIA_CONVERSATION_JUDGE_ALWAYS") ?? "").trim() === "1";
  if (!alwaysJudge && violations.length === 0) {
    return { text: base, rewritten: false, violations: [] };
  }

  const one = await oneShotJudgeAndRewrite({
    kind: "conversation",
    agent,
    channel,
    draft: base,
    mechanical_violations: violations,
    context_used: String((data as any)?.context_used ?? (data as any)?.context_excerpt ?? ""),
    recent_history: (data as any)?.recent_history ?? [],
    now_iso: String((data as any)?.now_iso ?? ""),
    data_json: data,
    tools_available: ((data as any)?.tools_available ?? []) as ToolDescriptor[],
    meta: { requestId: meta?.requestId, forceRealAi: meta?.forceRealAi, userId: meta?.userId },
  });
  const all = [
    ...violations.map((x) => `mech:${x}`),
    ...one.issues.map((x) => `judge:${x}`),
  ];
  return { text: one.final_text, rewritten: one.rewritten, violations: all };
}

function buildInvestigatorCopyViolations(text: string, ctx: { scenario: string }): string[] {
  const v: string[] = [];
  const s = (ctx?.scenario ?? "").toString();
  const cleaned = (text ?? "").toString();

  if (!cleaned.trim()) v.push("empty_response");
  if (hasBoldLeak(cleaned)) v.push("bold_not_allowed");
  if (hasInternalTechLeak(cleaned)) v.push("internal_tech_terms_not_allowed");
  if (cleaned.includes("\n\n\n")) v.push("too_many_blank_lines");

  // End-of-checkup MUST ask an open question and must NOT introduce a new checkup item.
  if (s.includes("end_checkup") || s.endsWith("_end")) {
    if (countQuestionMarks(cleaned) === 0) v.push("end_checkup_missing_question");
    // Disallow "let's continue the checkup" type phrasing.
    if (/\b(on\s+continue|continuons)\s+(?:le\s+)?(?:bilan|check|checkup)\b/i.test(cleaned)) {
      v.push("end_checkup_mentions_continuing_checkup");
    }
    // Encourage the intended bridge question.
    if (!/\b(parle|parler|sujet|un\s+truc|quelque\s+chose)\b/i.test(cleaned)) {
      v.push("end_checkup_missing_bridge_wording");
    }
    // Hard block: don't invent "bilan des réussites" / recap items.
    if (/\bbilan\s+des\s+r[ée]ussites\b/i.test(cleaned)) v.push("end_checkup_invented_item");
  } else {
    // Greeting discipline: never say "bonjour/salut" mid-thread in investigator copy.
    // (We don't have history length here; treat all investigator copy as mid-thread.)
    if (startsWithGreeting(cleaned)) v.push("greeting_not_allowed_mid_conversation");

    // Generic check: prefer 0-1 question per message.
    if (countQuestionMarks(cleaned) > 1) v.push("too_many_questions");

    // Bilan must be execution-focused: forbid "projection" / prep questions.
    // Examples seen in prod: "Comment tu vois l'intégration... ?", "Est-ce que tu penses pouvoir... ?",
    // "As-tu déjà un endroit en tête... ?"
    if (
      /\b(comment\s+tu\s+vois)\b/i.test(cleaned) ||
      /\btu\s+penses\s+pouvoir\b/i.test(cleaned) ||
      /\best-ce\s+que\s+tu\s+penses\b/i.test(cleaned) ||
      /\bas-tu\s+d[ée]j[àa]\b/i.test(cleaned) ||
      /\bun\s+endroit\s+en\s+t[êe]te\b/i.test(cleaned) ||
      /\bpour\s+le\s+r[ée]veil\b/i.test(cleaned) ||
      /\bune?\s+autre\s+solution\b/i.test(cleaned)
    ) {
      v.push("projection_question_not_allowed");
    }

    // Anti-loop confirmations: these create repetitive "robot" loops and block progression.
    if (/\b(on\s+continue|on\s+part\s+l[àa]-dessus|on\s+y\s+va|c['’]est\s+bon\s+pour\s+ce\s+point)\b/i.test(cleaned)) {
      v.push("looping_confirmation_phrase_not_allowed");
    }

    // Investigator must not claim plan modifications outside the explicit breakdown tool flow.
    // (Breakdown proposal copy is allowed to ask "Tu veux que je l'ajoute à ton plan ?"
    // but not to assert "je l'ajoute / je l'ai ajouté" in investigator mode.)
    if (
      !s.includes("breakdown_") &&
      /\b(je\s+(?:t['’]ai|vais)|on\s+va)\s+(?:ajouter|ajoute|mettre)\b/i.test(cleaned) &&
      /\bplan\b/i.test(cleaned)
    ) {
      v.push("investigator_plan_mutation_claim_not_allowed");
    }
  }

  return v;
}

export async function verifyInvestigatorMessage(opts: {
  draft: string;
  scenario: string;
  data: unknown;
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; userId?: string };
}): Promise<{ text: string; rewritten: boolean; violations: string[] }> {
  const { draft, scenario, data, meta } = opts;

  const base = collapseBlankLines(normalizeChatText(draft));
  const violations = buildInvestigatorCopyViolations(base, { scenario });
  if (violations.length === 0) return { text: base, rewritten: false, violations: [] };

  // One-shot Judge+Rewrite, but only when we already detected mechanical copy violations (cost control).
  const one = await oneShotJudgeAndRewrite({
    kind: `investigator:${scenario}`,
    agent: "investigator",
    channel: ((data as any)?.channel ?? meta?.channel ?? "web") as "web" | "whatsapp",
    draft: base,
    mechanical_violations: violations,
    context_used: String((data as any)?.context_used ?? (data as any)?.context_excerpt ?? ""),
    recent_history: (data as any)?.recent_history ?? [],
    now_iso: String((data as any)?.now_iso ?? ""),
    data_json: data,
    tools_available: ((data as any)?.tools_available ?? []) as ToolDescriptor[],
    meta: { requestId: meta?.requestId, forceRealAi: meta?.forceRealAi, userId: meta?.userId },
  });

  const all = [
    ...violations.map((x) => `mech:${x}`),
    ...one.issues.map((x) => `judge:${x}`),
  ];
  return { text: one.final_text, rewritten: one.rewritten, violations: all };
}

function buildBilanAgentViolations(text: string, ctx: { agent: string; user_message?: unknown }): string[] {
  const v: string[] = [];
  const cleaned = (text ?? "").toString();
  const agent = (ctx?.agent ?? "").toString();

  if (!cleaned.trim()) v.push("empty_response");
  if (hasBoldLeak(cleaned)) v.push("bold_not_allowed");
  if (hasInternalTechLeak(cleaned)) v.push("internal_tech_terms_not_allowed");
  if (cleaned.includes("\n\n\n")) v.push("too_many_blank_lines");

  // Prefer 0-1 question per message during bilan (except Investigator end-of-checkup rules handled elsewhere).
  if (countQuestionMarks(cleaned) > 1) v.push("too_many_questions");

  // Length constraints: Architect tends to be verbose; keep it short unless user asked for detail.
  const askedDetail = looksLikeUserAskedForDetail(ctx?.user_message);
  const maxChars =
    agent === "architect" ? (askedDetail ? 1400 : 650) :
    agent === "firefighter" ? 500 :
    agent === "companion" ? 750 :
    750;
  if (cleaned.length > maxChars) v.push("too_long");

  // CRITICAL: during an active bilan, ONLY the Investigator should log/write/activate/create.
  // If another agent is answering (rare exceptions), it must NOT claim or promise any DB/tool operation.
  if (agent !== "investigator") {
    if (
      /\b(j['’]ai|je\s+viens\s+de|je\s+vais|je\s+peux)\s+(?:l['’]?)?(?:activer|active|cr[ée]er|cr[ée]e|ajouter|mettre\s+a\s+jour|modifier|update|updater|archiver|supprimer|enregistrer|logguer|logger|noter)\b/i
        .test(cleaned) ||
      /\b(c['’]est\s+(?:fait|valid[ée]|enregistr[ée]))\b/i.test(cleaned) ||
      /\b(j['’]ai\s+not[ée]|je\s+note)\s+(?:dans\s+ton\s+plan|dans\s+le\s+plan|dans\s+le\s+dashboard)\b/i.test(cleaned) ||
      /\b(outil|tool)\b/i.test(cleaned)
    ) {
      v.push("bilan_tool_claim_not_allowed_for_non_investigator");
    }
  }

  // During bilan, non-investigator agents should end by returning to the bilan flow (1 short question).
  if (agent !== "investigator") {
    const asksBilanResume =
      /\b(on\s+continue|on\s+passe\s+a\s+la\s+suite|pr[êe]t\s+pour\s+la\s+suite|on\s+continue\s+le\s+bilan|on\s+fait\s+la\s+suite)\b/i
        .test(cleaned) ||
      /\b(on\s+continue\s*\?)\b/i.test(cleaned);
    if (!asksBilanResume) v.push("bilan_missing_resume_question_for_non_investigator");
  }

  return v;
}

export async function verifyBilanAgentMessage(opts: {
  draft: string;
  agent: "architect" | "companion" | "firefighter" | "assistant" | string;
  data: unknown;
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; userId?: string };
}): Promise<{ text: string; rewritten: boolean; violations: string[] }> {
  const { draft, agent, data, meta } = opts;
  const base = collapseBlankLines(normalizeChatText(draft));
  if (isMegaTestMode(meta)) return { text: base, rewritten: false, violations: [] };
  const violations = buildBilanAgentViolations(base, { agent, user_message: (data as any)?.user_message });
  const one = await oneShotJudgeAndRewrite({
    kind: "bilan",
    agent,
    channel: ((data as any)?.channel ?? meta?.channel ?? "web") as "web" | "whatsapp",
    draft: base,
    mechanical_violations: violations,
    context_used: String((data as any)?.context_used ?? (data as any)?.context_excerpt ?? ""),
    recent_history: (data as any)?.recent_history ?? [],
    now_iso: String((data as any)?.now_iso ?? ""),
    data_json: data,
    tools_available: ((data as any)?.tools_available ?? []) as ToolDescriptor[],
    meta: { requestId: meta?.requestId, forceRealAi: meta?.forceRealAi, userId: meta?.userId },
  });

  const all = [
    ...violations.map((x) => `mech:${x}`),
    ...one.issues.map((x) => `judge:${x}`),
  ];
  return { text: one.final_text, rewritten: one.rewritten, violations: all };
}

function buildPostCheckupViolations(text: string): string[] {
  const v: string[] = [];
  const s = (text ?? "").toString();
  if (!s.trim()) v.push("empty_response");
  if (hasBoldLeak(s)) v.push("bold_not_allowed");
  if (hasInternalTechLeak(s)) v.push("internal_tech_terms_not_allowed");
  // Avoid needless "I'm an AI" disclaimers mid-conversation (often indicates misunderstanding).
  if (/\bje\s+suis\s+une?\s+ia\b/i.test(s)) v.push("post_checkup_unnecessary_ai_disclaimer");
  // In post-bilan, we must never suggest resuming the bilan/checkup.
  if (/\b(apr[èe]s\s+le\s+bilan)\b/i.test(s)) v.push("post_checkup_mentions_apres_bilan");
  if (/\b(continue(?:r)?|reprend(?:re)?|reprenons|on\s+continue|on\s+reprend)\b/i.test(s) && /\b(bilan|check(?:up)?)\b/i.test(s)) {
    v.push("post_checkup_mentions_continue_bilan");
  }
  // Also forbid "we're finishing the bilan" phrasing in post-checkup (we're already after it).
  if (/\b(termin[ée]e?r?\s+(?:le\s+)?bilan|on\s+termine\s+(?:le\s+)?bilan|finissons\s+(?:le\s+)?bilan)\b/i.test(s)) {
    v.push("post_checkup_mentions_terminate_bilan");
  }

  // Companion-not-coach rule: in post-bilan we should NOT push "the plan" or inactive items unless user explicitly asks.
  // We can't reliably know activation state here, so we conservatively forbid plan-pushing phrasing.
  if (
    /\b(suite\s+de\s+ton\s+plan|aborder\s+la\s+suite\s+de\s+ton\s+plan|dans\s+ton\s+plan|prochaines?\s+actions?|frameworks?|phases?|objectifs?)\b/i
      .test(s)
  ) {
    v.push("post_checkup_mentions_plan_push");
  }

  // Reduce repetition: only require "C’est bon pour ce point ?" when the assistant is actually closing the topic.
  // If the assistant is asking a follow-up question, we DON'T force the close-question at the same time.
  const asksQuestion =
    /[?？]\s*$/.test(s.trim()) ||
    /\b(est-ce\s+que|qu['’]est-ce\s+que|pourquoi|comment|peux-tu|peux\s+tu|tu\s+peux|tu\s+voudrais|ça\s+te\s+dirait)\b/i.test(s);
  const closesTopicHint =
    /\b(on\s+commence|on\s+peut\s+commencer|ok\b|d['’]accord\b|parfait\b|merci\b|en\s+r[ée]sum[ée]|pour\s+r[ée]capituler|l['’]id[ée] c['’]est)\b/i.test(s) &&
    !asksQuestion;

  if (closesTopicHint && !/\b(c['’]est\s+bon\s+pour\s+ce\s+point)\b/i.test(s)) {
    v.push("post_checkup_missing_done_question");
  }
  return v;
}

export async function verifyPostCheckupAgentMessage(opts: {
  draft: string;
  agent: "architect" | "companion" | "firefighter" | "assistant" | string;
  data: unknown; // should include topic/context excerpt
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; userId?: string };
}): Promise<{ text: string; rewritten: boolean; violations: string[] }> {
  const { draft, agent, data, meta } = opts;
  const base = collapseBlankLines(normalizeChatText(draft));
  const violations = buildPostCheckupViolations(base);
  if (violations.length === 0) return { text: base, rewritten: false, violations: [] };

  // One-shot Judge+Rewrite, but only when we already detected mechanical violations (cost control).
  const one = await oneShotJudgeAndRewrite({
    kind: "post_checkup",
    agent,
    channel: ((data as any)?.channel ?? meta?.channel ?? "web") as "web" | "whatsapp",
    draft: base,
    mechanical_violations: violations,
    context_used: String((data as any)?.context_used ?? (data as any)?.context_excerpt ?? ""),
    recent_history: (data as any)?.recent_history ?? [],
    now_iso: String((data as any)?.now_iso ?? ""),
    data_json: data,
    tools_available: ((data as any)?.tools_available ?? []) as ToolDescriptor[],
    meta: { requestId: meta?.requestId, forceRealAi: meta?.forceRealAi, userId: meta?.userId },
  });

  const all = [
    ...violations.map((x) => `mech:${x}`),
    ...one.issues.map((x) => `judge:${x}`),
  ];
  return { text: one.final_text, rewritten: one.rewritten, violations: all };
}



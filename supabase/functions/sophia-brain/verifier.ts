import { generateWithGemini } from "../_shared/gemini.ts";

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

  // Rewrite only when needed (cost/latency control). Use a fast model by default.
  const systemPrompt = `
Tu es "Verifier", un relecteur/correcteur pour Sophia (Mode : Investigateur / Bilan).
Tu dois RÉÉCRIRE le message ci-dessous pour qu'il respecte strictement les règles et qu'il soit plus pertinent.

RÈGLES STRICTES:
- Français, tutoiement.
- Texte brut uniquement (pas de JSON, pas de listes en gras, pas d'astérisques **).
- Une seule question max (SAUF fin de bilan: une question ouverte obligatoire).
- Pas de termes techniques internes (logs/input/database/JSON/etc).
- Ne JAMAIS inventer une action/framework/vital qui n'existe pas dans les DONNÉES.
- Rester très concis et naturel.
- Si l'utilisateur exprime une émotion (fatigue/stress/ras-le-bol), valide brièvement avant la question.
- FOCUS EXÉCUTION (CRITIQUE) : Si on parle d'une action/framework, demande uniquement SI C'EST FAIT (passé/présent).
  Interdiction de demander "Est-ce que tu penses le faire ?" ou "Tu as un endroit en tête ?". On veut le résultat.
- COHÉRENCE TRACKING (CRITIQUE): si DONNÉES contient "last_item_log" (status/value/note) ou un indicateur qu'un item a été loggué,
  tu DOIS être cohérent avec ce qui vient d'être enregistré. Ne repose pas la question du même item, ne contredis pas ("tu as fait" vs "non fait").

SCÉNARIO: ${scenario}
DONNÉES (JSON): ${JSON.stringify(data)}
VIOLATIONS À CORRIGER: ${violations.join(", ")}

MESSAGE À RÉÉCRIRE:
${base}
  `.trim();

  const rewritten = await generateWithGemini(
    systemPrompt,
    "Réécris ce message en respectant les règles. Ne rajoute aucun nouvel item.",
    0.2,
    false,
    [],
    "auto",
    {
      requestId: meta?.requestId,
      userId: meta?.userId,
      model: meta?.model ?? "gemini-3-flash",
      source: `sophia-brain:investigator_verifier:${scenario}`,
      forceRealAi: meta?.forceRealAi,
    },
  );

  return { text: collapseBlankLines(normalizeChatText(rewritten)), rewritten: true, violations };
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

  return v;
}

export async function verifyBilanAgentMessage(opts: {
  draft: string;
  agent: "architect" | "companion" | "firefighter" | "assistant" | "watcher" | string;
  data: unknown;
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; userId?: string };
}): Promise<{ text: string; rewritten: boolean; violations: string[] }> {
  const { draft, agent, data, meta } = opts;
  const base = collapseBlankLines(normalizeChatText(draft));
  const violations = buildBilanAgentViolations(base, { agent, user_message: (data as any)?.user_message });
  if (violations.length === 0) return { text: base, rewritten: false, violations: [] };

  const systemPrompt = `
Tu es "Verifier", un relecteur/correcteur pour Sophia.
Contexte: UN BILAN (checkup) est en cours. Tu dois réécrire le message pour qu'il soit cohérent, utile et court.

RÈGLES STRICTES:
- Français, tutoiement.
- Texte brut uniquement (pas de JSON, pas de **).
- Pas de termes techniques internes (logs/input/database/JSON/etc).
- Ne jamais inventer un élément qui n'existe pas dans les DONNÉES.
- Rester concis. 1 question max.
- COHÉRENCE TRACKING: si DONNÉES contient un log (ex: last_item_log), ne contredis pas et ne reposes pas la même question.

AGENT SOURCE: ${agent}
DONNÉES (JSON): ${JSON.stringify(data)}
VIOLATIONS: ${violations.join(", ")}

MESSAGE À RÉÉCRIRE:
${base}
  `.trim();

  const rewritten = await generateWithGemini(
    systemPrompt,
    "Réécris ce message en respectant les règles. Ne rajoute aucun nouvel item.",
    0.2,
    false,
    [],
    "auto",
    {
      requestId: meta?.requestId,
      userId: meta?.userId,
      model: meta?.model ?? "gemini-3-flash",
      source: `sophia-brain:bilan_verifier:${agent}`,
      forceRealAi: meta?.forceRealAi,
    },
  );

  return { text: collapseBlankLines(normalizeChatText(rewritten)), rewritten: true, violations };
}



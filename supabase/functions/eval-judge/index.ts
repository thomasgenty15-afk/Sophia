/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { sumUsageByRequestId } from "../_shared/llm-usage.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";

type TranscriptMsg = {
  role: "user" | "assistant";
  content: string;
  agent_used?: string | null;
  created_at?: string | null;
};

function decodeJwtAlg(jwt: string): string {
  const t = (jwt ?? "").trim();
  const p0 = t.split(".")[0] ?? "";
  if (!p0) return "missing";
  try {
    // JWT uses base64url *without* padding. atob expects base64 with proper padding.
    const b64 = p0.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (b64.length % 4)) % 4;
    const padded = b64 + (padLen ? "=".repeat(padLen) : "");
    const header = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(padded),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    return String(header?.alg ?? "unknown");
  } catch {
    return "parse_failed";
  }
}

function base64Url(bytes: Uint8Array) {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwtHs256(secret: string, payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const h = enc(header);
  const p = enc(payload);
  const toSign = `${h}.${p}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)));
  return `${toSign}.${base64Url(sig)}`;
}

async function getServiceRoleKeyForRequest(req: Request, envServiceKey: string): Promise<string> {
  const alg = decodeJwtAlg(envServiceKey);
  if (alg === "HS256") return envServiceKey;

  const host = (() => {
    try {
      return new URL(req.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const isLocal = host === "127.0.0.1" || host === "localhost" || host.startsWith("supabase_");
  if (!isLocal) return envServiceKey;

  // Prefer non-SUPABASE_ secrets (some setups skip SUPABASE_* from env-file loads).
  const jwtSecret =
    (Deno.env.get("GOTRUE_JWT_SECRET") ?? Deno.env.get("JWT_SECRET") ?? Deno.env.get("SUPABASE_JWT_SECRET") ?? "").trim() ||
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const iss = "supabase-demo";
  return await signJwtHs256(jwtSecret, { iss, role: "service_role", exp });
}

function isMegaEnabled(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function tokenEstimateFromText(text: string): number {
  // Very rough: ~4 chars per token for latin text.
  const chars = (text ?? "").length;
  return Math.max(1, Math.ceil(chars / 4));
}

function ruleBasedIssues(params: {
  transcript: TranscriptMsg[];
  state_before?: any;
  state_after?: any;
  config?: any;
}): any[] {
  const { transcript, state_before, state_after, config } = params;
  const issues: any[] = [];

  // Special mode: post-bilan "parking lot" (we intentionally route to companion/architect/firefighter after bilan completion).
  const isPostBilanTest = Boolean(config?.limits?.test_post_checkup_deferral);
  const afterInvStatus = (state_after as any)?.investigation_state?.status ?? null;
  const isPostCheckupState = String(afterInvStatus ?? "").startsWith("post_checkup");

  function findBilanClosureIndex(ts: TranscriptMsg[]): number {
    for (let i = 0; i < (ts ?? []).length; i++) {
      const m = ts[i];
      if (m.role !== "assistant") continue;
      const s = (m.content ?? "").toString().toLowerCase();
      // Router-generated marker (preferred).
      if (/\bok,\s*bilan\s+termin[ée]?\b/i.test(s)) return i;
      // Router transition marker (common in current router): "Ok, on a fini le bilan."
      if (/\b(ok[, ]+)?on\s+a\s+fini\s+le\s+bilan\b/i.test(s)) return i;
      if (/\b(on\s+a\s+termin[ée]\s+le\s+bilan)\b/i.test(s)) return i;
      // Common investigator phrasing.
      if (/\b(bilan\s+termin[ée]?|on\s+a\s+fait\s+le\s+tour\s+(?:des\s+points|pour\s+ce\s+bilan))\b/i.test(s)) return i;
    }
    return -1;
  }

  const bilanClosureIdx = findBilanClosureIndex(transcript);
  const allowNonInvestigatorAfterClosure = isPostBilanTest || isPostCheckupState;
  const preBilan = bilanClosureIdx >= 0 ? transcript.slice(0, bilanClosureIdx + 1) : transcript;

  // 1) Forbidden bold markdown
  for (const m of transcript) {
    if (m.role === "assistant" && (m.content ?? "").includes("**")) {
      issues.push({
        code: "forbidden_markdown_bold",
        severity: "medium",
        message: "L'assistant utilise du gras (**), interdit par les règles de style.",
        evidence: { agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
      });
      break;
    }
  }

  // 2) Mid-conversation greetings
  const firstAssistantIdx = transcript.findIndex((m) => m.role === "assistant");
  if (firstAssistantIdx >= 0) {
    for (let i = firstAssistantIdx + 1; i < transcript.length; i++) {
      const m = transcript[i];
      if (m.role !== "assistant") continue;
      const lower = (m.content ?? "").toLowerCase();
      if (/\b(bonjour|salut|hello)\b/.test(lower)) {
        issues.push({
          code: "mid_conversation_greeting",
          severity: "low",
          message: 'L’assistant dit "bonjour/salut" au milieu d’une conversation (souvent interdit).',
          evidence: { index: i, agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
        });
        break;
      }
    }
  }

  // 3) Vouvoiement (heuristic)
  for (const m of transcript) {
    if (m.role !== "assistant") continue;
    const lower = (m.content ?? "").toLowerCase();
    if (/\b(vous|votre|vos)\b/.test(lower)) {
      issues.push({
        code: "vouvoiement_detected",
        severity: "medium",
        message: "Vouvoiement détecté (vous/votre/vos). La plupart des modes exigent le tutoiement.",
        evidence: { agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
      });
      break;
    }
  }

  // 4) Checkup routing stability (if investigation_state active)
  if (state_before?.investigation_state) {
    const hasStop = transcript.some((m) =>
      m.role === "user" && /\b(stop|arr[êe]te|on arr[êe]te|pause)\b/i.test(m.content ?? "")
    );
    if (!hasStop) {
      // In post-bilan test mode, we only enforce "investigator-only" BEFORE bilan closure.
      const scan = allowNonInvestigatorAfterClosure ? preBilan : transcript;
      const bad = scan.find((m) => m.role === "assistant" && m.agent_used && m.agent_used !== "investigator");
      if (bad) {
        issues.push({
          code: "checkup_routing_break",
          severity: "high",
          message:
            allowNonInvestigatorAfterClosure
              ? "Avant la clôture du bilan, investigation_state actif: l’agent devrait rester sur investigator (sauf stop explicite). Un autre mode a répondu."
              : "Investigation state actif: l’agent devrait rester sur investigator (sauf stop explicite). Un autre mode a répondu.",
          evidence: { agent_used: bad.agent_used, snippet: (bad.content ?? "").slice(0, 240) },
        });
      }
    }
  }

  return issues;
}

function ruleBasedSuggestions(issues: any[]): any[] {
  const suggestions: any[] = [];
  if (issues.some((i) => i.code === "mid_conversation_greeting")) {
    suggestions.push({
      prompt_key: "sophia.companion",
      action: "append",
      proposed_addendum:
        'RÈGLE PRIORITAIRE: Ne dis jamais "bonjour/salut/hello" si la conversation a déjà démarré. À la place, rebondis directement sur le dernier message.',
      rationale: "Réduit les incohérences de ton et évite la répétition de salutations.",
    });
  }
  if (issues.some((i) => i.code === "vouvoiement_detected")) {
    suggestions.push({
      prompt_key: "sophia.investigator",
      action: "append",
      proposed_addendum: 'CONTRAINTE: Tu tutoies toujours. Remplace tout "vous/votre/vos" par "tu/ton/tes".',
      rationale: "Uniformise le style et évite les ruptures de persona.",
    });
  }
  if (issues.some((i) => i.code === "checkup_routing_break")) {
    suggestions.push({
      prompt_key: "sophia.dispatcher",
      action: "append",
      proposed_addendum:
        "STABILITÉ CHECKUP (RENFORCÉE): Si investigation_state est actif, tu renvoies investigator dans 100% des cas, sauf si l’utilisateur demande explicitement d’arrêter le bilan.",
      rationale: "Garantit la stabilité de l’investigation malgré digressions.",
    });
  }
  return suggestions;
}

function parseTimeoutMs(raw: string | undefined, fallback: number) {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function uniqModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const s = String(m ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

async function runJudgeLlmWithModelCycle(args: {
  requestId: string;
  evalRunId?: string | null;
  allowReal: boolean;
  systemPrompt: string;
  transcriptText: string;
  baseModel: string;
}): Promise<{ ok: true; parsed: any; model_used: string } | { ok: false; error: string }> {
  // Goal: avoid Edge Runtime wall clock kills by bounding the number of HTTP calls and their timeout.
  // We do ONE call per model attempt (no internal retries), and we cycle models 3 times max.
  const perAttemptTimeoutMs = parseTimeoutMs(Deno.env.get("EVAL_JUDGE_HTTP_TIMEOUT_MS"), 12_000);
  const cycles = parseTimeoutMs(Deno.env.get("EVAL_JUDGE_MODEL_CYCLES"), 3);
  // Since judge now runs async (out-of-band), we can afford a higher retry budget.
  const perModelRetries = Math.max(1, Math.min(10, Math.floor(parseTimeoutMs(Deno.env.get("EVAL_JUDGE_MAX_RETRIES"), 10))));

  const base = String(args.baseModel ?? "").trim() || "gpt-5.2";
  const cycle = uniqModels([
    base,
    "gpt-5.2",
    "gemini-2.5-flash",
    "gpt-5-mini",
  ]);
  const maxCycles = Math.max(1, Math.min(5, Math.floor(cycles || 3)));
  const attempts: string[] = [];
  for (let c = 0; c < maxCycles; c++) attempts.push(...cycle);

  let lastErr: string | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i]!;
    try {
      const out = await generateWithGemini(args.systemPrompt, args.transcriptText, 0.2, true, [], "auto", {
        requestId: `${args.requestId}:judge:${i + 1}/${attempts.length}`,
        evalRunId: args.evalRunId ?? null,
        model,
        source: "eval-judge",
        forceRealAi: args.allowReal,
        // Async judge: allow deeper retries without risking run-evals wall-clock.
        maxRetries: perModelRetries,
        httpTimeoutMs: perAttemptTimeoutMs,
      });
      const parsed = JSON.parse(out as string);
      return { ok: true, parsed, model_used: model };
    } catch (e) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 240);
      // Short backoff to avoid immediate repeat overload bursts.
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return { ok: false, error: lastErr ?? "unknown_error" };
}

function severityRank(sev: unknown): number {
  const s = String(sev ?? "").toLowerCase();
  if (s === "high") return 3;
  if (s === "medium") return 2;
  if (s === "low") return 1;
  return 0;
}

function uniqBy<T>(arr: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function buildTranscriptLines(transcript: TranscriptMsg[], stateBefore?: any): string[] {
  const header: string[] = [];
  if (stateBefore && typeof stateBefore === "object") {
    const inv = (stateBefore as any)?.investigation_state ?? null;
    header.push("=== STATE_BEFORE (user_chat_states) ===");
    if ((stateBefore as any)?.current_mode != null) header.push(`current_mode: ${(stateBefore as any).current_mode}`);
    if ((stateBefore as any)?.risk_level != null) header.push(`risk_level: ${(stateBefore as any).risk_level}`);
    header.push("investigation_state:");
    header.push(JSON.stringify(inv, null, 2));
    header.push("=== TRANSCRIPT ===");
  }

  const lines = (transcript ?? []).map((m, idx) => {
    const agent = (m as any)?.agent_used ? `(${(m as any).agent_used})` : "";
    const role = String(m.role ?? "").toUpperCase();
    const content = String(m.content ?? "").replace(/\s+/g, " ").trim();
    return `#${idx} ${role}${agent}: ${content}`;
  });

  return header.length > 0 ? [...header, ...lines] : lines;
}

function pickContextBlock(params: { transcriptLines: string[]; snippet?: string; radius?: number }): string {
  const lines = params.transcriptLines ?? [];
  const radius = Math.max(1, Math.min(6, Number(params.radius ?? 3) || 3));
  const needle = String(params.snippet ?? "").trim();
  if (!needle) return lines.slice(0, Math.min(10, lines.length)).join("\n");
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx < 0) return lines.slice(0, Math.min(10, lines.length)).join("\n");
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length, idx + radius + 1);
  return lines.slice(start, end).join("\n");
}

function isSuggestionDuplicateAgainstOverride(params: { existingOverride: string; proposed: string }): boolean {
  const a = (params.existingOverride ?? "").trim();
  const b = (params.proposed ?? "").trim();
  if (!a || !b) return false;
  return a.includes(b);
}

const BodySchema = z.object({
  dataset_key: z.string().min(1),
  scenario_key: z.string().min(1),
  tags: z.array(z.string()).optional(),
  force_real_ai: z.boolean().optional(),
  model: z.string().optional(),
  transcript: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      agent_used: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
    }),
  ),
  state_before: z.any().optional(),
  state_after: z.any().optional(),
  config: z.any().optional(),
  system_snapshot: z.any().optional(),
  assertions: z
    .object({
      // Expected sequence constraints (best effort)
      must_include_agent: z.array(z.string()).optional(),
      must_not_include_agent: z.array(z.string()).optional(),
      // Content checks (regex strings, JS style)
      assistant_must_not_match: z.array(z.string()).optional(),
      assistant_must_match: z.array(z.string()).optional(),
      // State invariants
      requires_investigation_state_active: z.boolean().optional(),
      must_keep_investigator_until_stop: z.boolean().optional(),
      // Stop tokens for the user (if present, allow leaving investigator)
      stop_regex: z.string().optional(),
    })
    .passthrough()
    .optional(),
  eval_run_id: z.string().uuid().optional(),
});

console.log("eval-judge: Function initialized");

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    // Internal worker mode must short-circuit BEFORE any CORS/browser gating.
    // The internal worker calls with X-Internal-Secret (no browser, no JWT), so we must validate it first.
    if (req.headers.get("x-internal-secret")) {
      const guard = ensureInternalRequest(req);
      if (guard) return guard;
    }

    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body: z.infer<typeof BodySchema> = parsed.data as any;

    // Internal worker mode:
    // - used by process-eval-judge-jobs to run qualitative judging async (outside run-evals wall-clock)
    // - guarded by X-Internal-Secret
    const isInternal = Boolean(req.headers.get("x-internal-secret"));

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const envServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    const serviceKey = await getServiceRoleKeyForRequest(req, envServiceKey);
    if (!url || !anonKey || !serviceKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller (unless internal worker call).
    let userId: string | null = null;
    if (!isInternal) {
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: auth, error: authError } = await userClient.auth.getUser();
      if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
      userId = auth.user.id;

      // Admin gate (RLS allows reading own row)
      const { data: adminRow } = await userClient.from("internal_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });
    } else {
      // For internal calls, we allow associating the run with the original initiator (optional).
      const createdBy = (body?.config as any)?.created_by ?? (body?.config as any)?.initiator_user_id ?? null;
      userId = createdBy ? String(createdBy) : null;
    }

    // Service role client for writing eval artifacts atomically
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Create or update run row
    // NOTE: We always inject request_id into config so the run is idempotent across retries.
    const configWithRequestId = { ...(body.config ?? {}), request_id: requestId };
    let runId = body.eval_run_id ?? null;
    if (!runId) {
      // Idempotency: if the caller retries with the same x-request-id, reuse the existing run row.
      // This prevents creating two "tests" for a single command when the edge worker is cancelled/restarted.
      const { data: existing, error: existingErr } = await admin
        .from("conversation_eval_runs")
        .select("id")
        .eq("dataset_key", body.dataset_key)
        .eq("scenario_key", body.scenario_key)
        .eq("created_by", userId)
        // PostgREST JSON filter (jsonb ->> text). We keep it in config for early availability.
        .eq("config->>request_id", requestId)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing?.id) runId = existing.id as string;
    }
    if (!runId) {
      const { data: inserted, error: insErr } = await admin
        .from("conversation_eval_runs")
        .insert({
          dataset_key: body.dataset_key,
          scenario_key: body.scenario_key,
          status: "running",
          created_by: userId,
          config: configWithRequestId,
          transcript: body.transcript,
          state_before: body.state_before ?? null,
          state_after: body.state_after ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      runId = inserted.id as string;
    } else {
      const patch: Record<string, unknown> = {
          dataset_key: body.dataset_key,
          scenario_key: body.scenario_key,
          status: "running",
          config: configWithRequestId,
          transcript: body.transcript,
          state_before: body.state_before ?? null,
          state_after: body.state_after ?? null,
          created_by: userId,
        };
      const { error: updErr } = await admin
        .from("conversation_eval_runs")
        .update(patch as any)
        .eq("id", runId);
      if (updErr) throw updErr;
    }

    // Compute issues/suggestions
    const issues = ruleBasedIssues({
      transcript: body.transcript,
      state_before: body.state_before,
      state_after: body.state_after,
      config: body.config,
    });

    // Deterministic assertions: machine-checkable success/failure with explicit reasons.
    const assertions = body.assertions ?? {};
    try {
      const assistantMsgs = (body.transcript ?? []).filter((m) => m.role === "assistant");
      const assistantText = assistantMsgs.map((m) => m.content ?? "").join("\n");
      const agentUsedSeq = assistantMsgs.map((m) => (m as any).agent_used).filter(Boolean);

      const fail = (code: string, message: string, evidence?: any) => {
        issues.push({ code, severity: "high", message, evidence: evidence ?? {} });
      };

      // Agent inclusion/exclusion
      if (Array.isArray(assertions.must_include_agent)) {
        for (const a of assertions.must_include_agent) {
          if (!agentUsedSeq.includes(a)) {
            fail("assert_missing_agent", `Assertion failed: must include agent "${a}"`, { agent_sequence: agentUsedSeq });
          }
        }
      }
      if (Array.isArray(assertions.must_not_include_agent)) {
        for (const a of assertions.must_not_include_agent) {
          if (agentUsedSeq.includes(a)) {
            fail("assert_forbidden_agent", `Assertion failed: must NOT include agent "${a}"`, { agent_sequence: agentUsedSeq });
          }
        }
      }

      // Regex checks
      if (Array.isArray(assertions.assistant_must_not_match)) {
        for (const pat of assertions.assistant_must_not_match) {
          const re = new RegExp(pat, "i");
          if (re.test(assistantText)) {
            fail("assert_forbidden_pattern", `Assertion failed: assistant must NOT match /${pat}/`, {
              pattern: pat,
              snippet: assistantText.slice(0, 240),
            });
          }
        }
      }
      if (Array.isArray(assertions.assistant_must_match)) {
        for (const pat of assertions.assistant_must_match) {
          const re = new RegExp(pat, "i");
          if (!re.test(assistantText)) {
            fail("assert_missing_pattern", `Assertion failed: assistant must match /${pat}/`, {
              pattern: pat,
              snippet: assistantText.slice(0, 240),
            });
          }
        }
      }

      // Investigation-state invariants
      if (assertions.requires_investigation_state_active && !body.state_before?.investigation_state) {
        fail("assert_state_precondition_failed", "Scenario expected investigation_state active, but state_before.investigation_state was null.");
      }
      if (assertions.must_keep_investigator_until_stop && body.state_before?.investigation_state) {
        const stopRe = new RegExp(assertions.stop_regex ?? "\\b(stop|arr[êe]te|on arr[êe]te|pause)\\b", "i");
        const userHasStop = (body.transcript ?? []).some((m) => m.role === "user" && stopRe.test(m.content ?? ""));
        if (!userHasStop) {
          // In post-bilan parking-lot tests, allow non-investigator AFTER bilan closure.
          const isPostBilanTest = Boolean((body as any)?.config?.limits?.test_post_checkup_deferral);
          const afterInvStatus = (body.state_after as any)?.investigation_state?.status ?? null;
          const isPostCheckupState = String(afterInvStatus ?? "").startsWith("post_checkup");
          const allowAfterClosure = isPostBilanTest || isPostCheckupState;

          const closureIdx = (() => {
            const ts = (body.transcript ?? []) as TranscriptMsg[];
            for (let i = 0; i < ts.length; i++) {
              const m = ts[i];
              if (m.role !== "assistant") continue;
              const s = (m.content ?? "").toString().toLowerCase();
              if (/\bok,\s*bilan\s+termin[ée]?\b/i.test(s)) return i;
              if (/\b(ok[, ]+)?on\s+a\s+fini\s+le\s+bilan\b/i.test(s)) return i;
              if (/\b(on\s+a\s+termin[ée]\s+le\s+bilan)\b/i.test(s)) return i;
              if (/\b(bilan\s+termin[ée]?|on\s+a\s+fait\s+le\s+tour\s+(?:des\s+points|pour\s+ce\s+bilan))\b/i.test(s)) return i;
            }
            return -1;
          })();

          // Map assistantMsgs index -> transcript index so we can compare against closureIdx correctly.
          const assistantTranscriptIdxs = ((body.transcript ?? []) as TranscriptMsg[])
            .map((m, i) => ({ m, i }))
            .filter((x) => x.m.role === "assistant")
            .map((x) => x.i);

          const nonInv = assistantMsgs.find((m, assistantIdx) => {
            const used = (m as any).agent_used;
            if (!used || used === "investigator") return false;
            if (!allowAfterClosure) return true;
            const tIdx = assistantTranscriptIdxs[assistantIdx] ?? -1;
            if (closureIdx >= 0 && tIdx > closureIdx) return false;
            return true;
          });
          if (nonInv) {
            fail(
              "assert_investigator_not_stable",
              "Assertion failed: investigation_state active => should remain investigator until explicit stop.",
              { offending_agent: (nonInv as any).agent_used, snippet: (nonInv.content ?? "").slice(0, 240) },
            );
          }
        }
      }
    } catch (e) {
      issues.push({
        code: "assertion_engine_error",
        severity: "low",
        message: "Assertion engine error (non-blocking).",
        evidence: { error: String(e).slice(0, 200) },
      });
    }
    let suggestions = ruleBasedSuggestions(issues);

    // Optional: LLM judge enrichment (disabled in MEGA_TEST_MODE unless force_real_ai)
    let judgeLlmUsed = false;
    const allowReal = Boolean(body.force_real_ai);
    const transcriptLines = buildTranscriptLines(body.transcript ?? [], body.state_before);

    // Lightweight system snapshot so the judge can be precise and avoid inventing modules.
    const systemSnapshot = {
      ...(typeof (body as any)?.system_snapshot === "object" ? (body as any).system_snapshot : {}),
      time_assumption: [
        "IMPORTANT: Sophia has access to the user's current local time AND date via system context (she may reference it).",
        "Do NOT flag a time/date mention as a hallucination unless it clearly contradicts the transcript (e.g., user states it's morning and assistant says 1h30; or user says it's Monday and assistant says Friday).",
      ],
      routing_rules: [
        "Hard guard (router): if investigation_state is active, only investigator answers unless explicit stop (stop/arrête/change topic).",
        "Safety priority: sentry/firefighter may override during a checkup if risk is detected.",
      ],
    };
    if (!isMegaEnabled() || allowReal) {
      try {
        judgeLlmUsed = true;
        const systemPrompt = `
Tu es un "QA Judge" pour l'assistant Sophia.
Tu analyses un transcript de conversation et tu renvoies UNIQUEMENT du JSON.

Objectifs:
- Repérer incohérences, violations de règles, erreurs de routing (investigation_state), ton, hallucinations.
- Proposer des améliorations sous forme d'ADDENDUM (texte) à copier/coller dans le code (prompts en dur).

Règles:
- Propose des addendums courts, actionnables, testables.
- IMPORTANT: N'invente PAS de modules/flows qui n'existent pas. Utilise UNIQUEMENT SYSTEM_SNAPSHOT + transcript.
- IMPORTANT (HEURE/DATE): Sophia connaît l'heure ET la date locales via le système. Ne signale pas une heure/date comme 'hallucination' sauf contradiction explicite avec le transcript.
- Si un problème est déjà couvert par le code (ex: stabilité checkup), ne le repropose pas en prompt; à la place, signale un bug potentiel ou un angle manquant.
- Limites STRICTES: max 3 issues, max 3 suggestions.
- Cible un prompt_key parmi:
  - sophia.dispatcher
  - sophia.investigator
  - sophia.companion
  - sophia.architect
  - sophia.firefighter
  - sophia.sentry

SYSTEM_SNAPSHOT:
${JSON.stringify(systemSnapshot, null, 2)}

Format attendu:
{
  "issues": [
    { "code": "string", "severity": "low|medium|high", "message": "string", "evidence": { "snippet": "string", "agent_used": "string|null" } }
  ],
  "suggestions": [
    { "prompt_key": "string", "action": "append|replace", "proposed_addendum": "string", "rationale": "string" }
  ]
}
        `.trim();
        const transcriptText = body.transcript
          .map((m) => `${m.role.toUpperCase()}${m.agent_used ? `(${m.agent_used})` : ""}: ${m.content}`)
          .join("\n");
        const JUDGE_DEFAULT_MODEL =
          (Deno.env.get("GEMINI_JUDGE_MODEL") ?? "").trim() || "gpt-5.2";
        const overrideModel =
          (body as any)?.model ||
          (body as any)?.config?.model ||
          (body as any)?.config?.limits?.model ||
          JUDGE_DEFAULT_MODEL;
        const judged = await runJudgeLlmWithModelCycle({
          requestId,
          evalRunId: runId,
          allowReal,
          systemPrompt,
          transcriptText,
          baseModel: String(overrideModel),
        });
        if (judged.ok) {
          const parsedJudge = judged.parsed;
          if (Array.isArray(parsedJudge?.issues)) {
            for (const i of parsedJudge.issues) issues.push(i);
          }
          if (Array.isArray(parsedJudge?.suggestions)) {
            for (const s of parsedJudge.suggestions) suggestions.push(s);
          }
        } else {
          throw new Error(judged.error);
        }
      } catch (e) {
        // Don't fail the whole run if judge fails; store error into metrics
        suggestions = suggestions.map((s) => s);
        issues.push({
          code: "judge_error",
          severity: "low",
          message: "Le juge IA a échoué (fallback sur règles locales).",
          evidence: { snippet: String(e).slice(0, 200) },
        });
      }
    }

    // Normalize suggestions
    const normalizedSuggestionsAll = (suggestions ?? [])
      .filter((s: any) => s && typeof s.prompt_key === "string" && typeof s.proposed_addendum === "string")
      .map((s: any) => ({
        prompt_key: String(s.prompt_key),
        action: s.action === "replace" ? "replace" : "append",
        proposed_addendum: String(s.proposed_addendum).trim(),
        rationale: s.rationale ? String(s.rationale) : null,
      }))
      .filter((s: any) => s.proposed_addendum.length > 0);

    const normalizedSuggestionsDeduped = uniqBy(
      normalizedSuggestionsAll,
      (s: any) => `${s.prompt_key}:${s.action}:${s.proposed_addendum}`,
    );
    // We no longer support DB-backed prompt overrides; treat "existing override" as empty.
    const normalizedSuggestionsNoDup = normalizedSuggestionsDeduped.filter((s: any) => {
      return !isSuggestionDuplicateAgainstOverride({ existingOverride: "", proposed: s.proposed_addendum });
    });

    // Limit noise (requested): max 3 issues, max 3 suggestions.
    const issuesLimited = uniqBy(
      issues ?? [],
      (i: any) => `${String(i?.code ?? "")}:${String(i?.message ?? "")}:${String(i?.evidence?.snippet ?? "")}`,
    )
      .sort((a: any, b: any) => severityRank(b?.severity) - severityRank(a?.severity))
      .slice(0, 3)
      .map((i: any) => ({
        code: String(i?.code ?? "unknown"),
        severity: String(i?.severity ?? "low"),
        message: String(i?.message ?? ""),
        evidence: i?.evidence ?? {},
      }));

    const suggestionsLimited = normalizedSuggestionsNoDup.slice(0, 3).map((s: any, idx: number) => {
      const related = issuesLimited[idx] ?? issuesLimited[0] ?? null;
      const snippet = String(related?.evidence?.snippet ?? "");
      const contextBlock = pickContextBlock({ transcriptLines, snippet, radius: 3 });
      return {
        ...s,
        context_block: [
          "=== CONTEXT (transcript excerpt) ===",
          contextBlock,
          "",
          "=== APPLY ===",
          `prompt_key: ${s.prompt_key}`,
          `action: ${s.action}`,
          "",
          "proposed_addendum:",
          String(s.proposed_addendum ?? "").trim(),
        ].join("\n").trim(),
      };
    });

    // Persist eval results
    // Prefer exact usage logged by gemini.ts (usageMetadata). Fallback to 0 if unavailable.
    const summed = await sumUsageByRequestId(requestId);

    // Attach a compact runtime trace (if available) so qualitative analysis can reference actual routing/model events.
    // This is a controlled event stream (not raw Supabase logs).
    let runtimeTrace: any[] = [];
    try {
      const { data: events } = await admin
        .from("conversation_eval_events")
        .select("created_at,source,level,event,payload")
        .eq("eval_run_id", runId)
        .order("created_at", { ascending: true })
        .limit(80);
      runtimeTrace = Array.isArray(events) ? events : [];
    } catch {
      runtimeTrace = [];
    }

    // Preserve pre-existing metrics (run-evals may write mechanical stats there).
    let existingMetrics: any = {};
    try {
      const { data: existingRow } = await admin
        .from("conversation_eval_runs")
        .select("issues,metrics")
        .eq("id", runId)
        .maybeSingle();
      existingMetrics = (existingRow as any)?.metrics && typeof (existingRow as any).metrics === "object" ? (existingRow as any).metrics : {};
    } catch {
      // best-effort; don't block the judge
    }

    // Keep issues focused and non-redundant: we persist ONLY the qualitative issues produced by eval-judge
    // (rule-based + optional LLM judge enrichment), which are already limited upstream.
    const mergedIssues = issuesLimited;

    const { error: persistErr } = await admin
      .from("conversation_eval_runs")
      .update({
        status: "completed",
        issues: mergedIssues,
        suggestions: suggestionsLimited,
        metrics: {
          ...existingMetrics,
          request_id: requestId,
          mega_test_mode: isMegaEnabled(),
          judge_llm_used: judgeLlmUsed,
          prompt_tokens: summed.prompt_tokens,
          output_tokens: summed.output_tokens,
          total_tokens: summed.total_tokens,
          cost_usd: summed.cost_usd,
          judge_completed_at: new Date().toISOString(),
        },
        config: {
          ...(typeof (body.config ?? {}) === "object" ? (body.config ?? {}) : {}),
          request_id: requestId,
          runtime_trace: runtimeTrace,
        },
      })
      .eq("id", runId);
    if (persistErr) throw persistErr;

    // NOTE: We no longer insert into prompt_override_suggestions here.
    // The workflow is "copy/paste into Cursor" from returned suggestions.context_block.

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      eval_run_id: runId,
      issues: issuesLimited,
      suggestions: suggestionsLimited,
      metrics: {
        mega_test_mode: isMegaEnabled(),
        judge_llm_used: judgeLlmUsed,
        prompt_tokens: summed.prompt_tokens,
        output_tokens: summed.output_tokens,
        total_tokens: summed.total_tokens,
        cost_usd: summed.cost_usd,
      },
    });
  } catch (error) {
    console.error(`[eval-judge] request_id=${requestId}`, error);
    return serverError(req, requestId);
  }
});



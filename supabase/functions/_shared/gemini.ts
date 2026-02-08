// NOTE: This file runs in Supabase Edge Runtime (Deno),
// but our TS linter environment may not include Deno lib typings.
// Keep this lightweight to avoid noisy "Cannot find name 'Deno'" errors.
declare const Deno: any;

export async function generateWithGemini(
  systemPrompt: string, 
  userMessage: string, 
  temperature: number = 0.7,
  jsonMode: boolean = false,
  tools: any[] = [],
  toolChoice: string = "auto", // 'auto', 'any' or specific tool name (not supported by all models but 'any' forces tool use)
  meta?: {
    requestId?: string;
    model?: string;
    source?: string;
    forceRealAi?: boolean;
    userId?: string;
    maxRetries?: number;
    httpTimeoutMs?: number;
    // If true, do not append our internal provider/model fallback chain.
    // Useful when the caller already implements an external model cycle (e.g. judge loops).
    disableFallbackChain?: boolean;
    // Eval-only: when present, we emit structured runtime trace events into conversation_eval_events.
    evalRunId?: string | null;
  }
): Promise<string | { tool: string, args: any }> {
  // --- Debug instrumentation (Cursor debug-mode) ---
  // #region agent log
  const __dbg = (hypothesisId: string, location: string, message: string, data: any) => {
    try {
      fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:String(meta?.requestId ?? 'n/a'),hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    } catch {}
  };
  // #endregion

  // --- Simple in-memory rate limiting (per isolate) ---
  // Goal: cap concurrency to prevent bursts that amplify 429/503.
  // This is NOT a time-based sleep; callers wait on a queue until a slot frees.
  type Release = () => void;
  class Semaphore {
    private max: number;
    private inUse = 0;
    private q: Array<(r: Release) => void> = [];
    constructor(max: number) {
      this.max = Math.max(1, Math.floor(max));
    }
    async acquire(): Promise<Release> {
      if (this.inUse < this.max) {
        this.inUse++;
        return () => this.release();
      }
      return await new Promise<Release>((resolve) => {
        this.q.push((r) => resolve(r));
      });
    }
    private release() {
      if (this.q.length > 0) {
        // Hand off the slot to the next waiter without changing inUse.
        const next = this.q.shift()!;
        next(() => this.release());
        return;
      }
      this.inUse = Math.max(0, this.inUse - 1);
    }
    snapshot() {
      return { max: this.max, inUse: this.inUse, queued: this.q.length };
    }
  }
  const parseIntEnv = (name: string, fallback: number) => {
    const raw = (Deno.env.get(name) ?? "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  const GLOBAL_MAX = parseIntEnv("GEMINI_CONCURRENCY_GLOBAL", 6);
  const PER_MODEL_MAX = parseIntEnv("GEMINI_CONCURRENCY_PER_MODEL", 3);
  const anyGlobalThis = globalThis as any;
  if (!anyGlobalThis.__sophiaGeminiSemaphores) {
    anyGlobalThis.__sophiaGeminiSemaphores = {
      global: new Semaphore(GLOBAL_MAX),
      perModel: new Map<string, Semaphore>(),
    };
  }
  const semStore = anyGlobalThis.__sophiaGeminiSemaphores as { global: Semaphore; perModel: Map<string, Semaphore> };
  const getModelSem = (modelKey: string) => {
    const k = String(modelKey || "default").toLowerCase();
    const found = semStore.perModel.get(k);
    if (found) return found;
    const created = new Semaphore(PER_MODEL_MAX);
    semStore.perModel.set(k, created);
    return created;
  };

  // --- Circuit breaker (per isolate, per provider:model) ---
  // Goal: when a provider/model is returning 429/503/timeouts, stop hammering it for a short window.
  type BreakerState = { openedUntilMs: number; lastReason?: string };
  const anyGlobalThis2 = globalThis as any;
  if (!anyGlobalThis2.__sophiaLlmBreaker) anyGlobalThis2.__sophiaLlmBreaker = new Map<string, BreakerState>();
  const breaker = anyGlobalThis2.__sophiaLlmBreaker as Map<string, BreakerState>;
  const breakerKey = (provider: string, modelKey: string) => `${String(provider)}:${String(modelKey)}`.toLowerCase();
  const isBreakerOpen = (provider: string, modelKey: string) => {
    const st = breaker.get(breakerKey(provider, modelKey));
    return Boolean(st && st.openedUntilMs > Date.now());
  };
  const openBreaker = (provider: string, modelKey: string, ms: number, reason: string) => {
    const k = breakerKey(provider, modelKey);
    breaker.set(k, { openedUntilMs: Date.now() + Math.max(5_000, Math.floor(ms)), lastReason: String(reason ?? "").slice(0, 140) });
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const parseTimeoutMs = (raw: string | undefined, fallback: number) => {
    const n = Number(String(raw ?? "").trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  /**
   * IMPORTANT:
   * Edge Runtime can hard-kill ("early termination") long-running requests without throwing a normal exception.
   * If an upstream fetch hangs (no response / stalled TLS), we may never reach our retry logging.
   * We therefore enforce an explicit HTTP timeout for Gemini calls so we fail fast, log, and retry/fallback.
   */
  const GEMINI_HTTP_TIMEOUT_MS =
    Number.isFinite(Number(meta?.httpTimeoutMs)) && Number(meta?.httpTimeoutMs) > 0
      ? Math.floor(Number(meta?.httpTimeoutMs))
      : parseTimeoutMs(Deno.env.get("GEMINI_HTTP_TIMEOUT_MS"), 55_000);
  // Separate (looser) timeout for eval-like traffic. Keep it configurable without affecting normal chat latency.
  // Note: run-evals also has its own wall-clock chunking (`max_wall_clock_ms_per_request`) so do not set this absurdly high.
  const GEMINI_EVAL_HTTP_TIMEOUT_MS = parseTimeoutMs(Deno.env.get("GEMINI_EVAL_HTTP_TIMEOUT_MS"), 120_000);
  const makeTimeoutSignal = (timeoutMs: number): { signal: AbortSignal; cancel: () => void } => {
    // Prefer native AbortSignal.timeout when available.
    const anyAbortSignal = AbortSignal as any;
    if (anyAbortSignal?.timeout && typeof anyAbortSignal.timeout === "function") {
      return { signal: anyAbortSignal.timeout(timeoutMs), cancel: () => {} };
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(new Error("Gemini request timeout")), timeoutMs);
    return { signal: controller.signal, cancel: () => clearTimeout(id) };
  };

  // Eval trace: best-effort event stream for qualitative judge context.
  // NOTE: We cannot access raw Edge logs programmatically, so we persist a controlled trace instead.
  let traceClient: any = null;
  const traceInsert = async (evt: { level: "debug" | "info" | "warn" | "error"; event: string; payload?: any }) => {
    try {
      const evalRunId = meta?.evalRunId ? String(meta.evalRunId) : "";
      if (!evalRunId) return;
      const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
      const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
      if (!url || !serviceKey) return;
      if (!traceClient) {
        // Dynamic import avoids extra overhead for non-eval calls.
        const mod: any = await import("jsr:@supabase/supabase-js@2");
        traceClient = mod.createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      }
      await traceClient.from("conversation_eval_events").insert({
        eval_run_id: evalRunId,
        request_id: meta?.requestId ?? "n/a",
        source: "gemini",
        level: evt.level,
        event: evt.event,
        payload: evt.payload ?? {},
      } as any);
    } catch {
      // non-blocking
    }
  };
  const backoffMs = (attempt: number) => {
    // attempt is 1-based
    const base = 800;
    const max = 15_000;
    const exp = Math.min(max, base * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 400);
    return Math.min(max, exp + jitter);
  };
  const backoffMsForStatus = (status: number, attempt: number, retryAfterHeader: string | null) => {
    // If provider tells us how long to wait, respect it (bounded).
    const ra = String(retryAfterHeader ?? "").trim();
    const raSeconds = Number(ra);
    if (Number.isFinite(raSeconds) && raSeconds > 0) {
      return Math.min(60_000, Math.max(1_000, Math.floor(raSeconds * 1000)));
    }
    // 429 is rate limiting: be more conservative than generic backoff.
    if (status === 429) return Math.min(60_000, backoffMs(attempt) + 2_000 + Math.floor(Math.random() * 1_500));
    return backoffMs(attempt);
  };
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);

  const requestId = String(meta?.requestId ?? "").trim();
  const source = String(meta?.source ?? "").trim();
  // Evals are extremely sensitive to wall-clock time (edge runtime early termination).
  // We treat any requestId that contains ":tools:" (run-evals scenarios) as an eval-like request.
  const isEvalLikeRequest =
    requestId.includes(":tools:") ||
    source.includes("run-evals") ||
    source.includes("simulate-user");

  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  // Test mode: deterministic stub (no network / no GEMINI_API_KEY required).
  // - Explicit: MEGA_TEST_MODE=1
  // - Implicit: local Supabase runtime (SUPABASE_INTERNAL_HOST_PORT=54321 / SUPABASE_URL=http://kong:8000)
  if (megaEnabled && !meta?.forceRealAi) {
    // If tools are provided, mimic a "no tool call" response (text) for stability.
    const preview = (userMessage ?? "").toString().slice(0, 200);
    const out = `MEGA_TEST_STUB: ${preview}`;
    return jsonMode ? JSON.stringify({ stub: true, text: out }) : out;
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  const OPENAI_BASE_URL = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com").trim().replace(/\/+$/g, "");
  const isOpenAiModel = (m: string) => /^\s*gpt-/i.test(String(m ?? "").trim());
  const isOpenAiGpt5Family = (m: string) => /^\s*gpt-5/i.test(String(m ?? "").trim());

  // Gemini tools in this codebase often use an uppercase "schema-ish" format:
  //   { type: "OBJECT", properties: { title: { type: "STRING" } } }
  // OpenAI requires JSON Schema with lowercase primitives ("object", "string", ...).
  const normalizeToolSchemaForOpenAI = (schema: any): any => {
    const s = schema && typeof schema === "object" ? schema : {};
    const tRaw = String(s.type ?? "").trim();
    const t = tRaw.toUpperCase();
    const mappedType =
      t === "OBJECT" ? "object" :
      t === "STRING" ? "string" :
      t === "INTEGER" ? "integer" :
      t === "NUMBER" ? "number" :
      t === "BOOLEAN" ? "boolean" :
      t === "ARRAY" ? "array" :
      (tRaw ? tRaw.toLowerCase() : undefined);

    const out: any = { ...s };
    if (mappedType) out.type = mappedType;

    if (out.properties && typeof out.properties === "object") {
      const nextProps: Record<string, any> = {};
      for (const [k, v] of Object.entries(out.properties)) nextProps[k] = normalizeToolSchemaForOpenAI(v);
      out.properties = nextProps;
    }
    if (out.items) out.items = normalizeToolSchemaForOpenAI(out.items);
    if (Array.isArray(out.required)) out.required = out.required.map((x: any) => String(x));
    return out;
  };

  const callOpenAI = async (args: { model: string; systemPrompt: string; userMessage: string; temperature: number; jsonMode: boolean; tools: any[]; toolChoice: string; requestId: string; timeoutMs: number }) => {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    const url = `${OPENAI_BASE_URL}/v1/chat/completions`;
    const toolDefs = Array.isArray(args.tools) ? args.tools : [];
    const payload: any = {
      model: String(args.model),
      messages: [
        ...(args.systemPrompt ? [{ role: "system", content: String(args.systemPrompt) }] : []),
        { role: "user", content: String(args.userMessage ?? "") },
      ],
    };
    // gpt-5-* models may reject non-default temperature values.
    // To keep fallback robust, omit temperature for gpt-5 family (server default).
    if (!isOpenAiGpt5Family(args.model)) {
      payload.temperature = args.temperature;
    }
    if (args.jsonMode) {
      payload.response_format = { type: "json_object" };
    }
    if (toolDefs.length > 0) {
      payload.tools = toolDefs.map((t: any) => ({
        type: "function",
        function: {
          name: String(t?.name ?? "").trim(),
          description: String(t?.description ?? "").trim(),
          parameters: (t?.parameters && typeof t.parameters === "object")
            ? normalizeToolSchemaForOpenAI(t.parameters)
            : { type: "object", properties: {} },
        },
      })).filter((t: any) => t?.function?.name);
      if (args.toolChoice !== "auto") {
        payload.tool_choice = args.toolChoice === "any" ? "required" : "auto";
      }
    }
    const { signal, cancel } = makeTimeoutSignal(args.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
      const json = await resp.json().catch(() => ({}));
      return { resp, json };
    } finally {
      cancel();
    }
  };

  // One-shot visibility (debug-only): log whether OpenAI key is loaded in this runtime.
  // Default OFF because it is noisy; enabled only when OPENAI_DEBUG=1 OR when the key is missing.
  const openAiDebug = (Deno.env.get("OPENAI_DEBUG") ?? "").trim() === "1";
  const anyGlobalThisOpenAi = globalThis as any;
  if (!anyGlobalThisOpenAi.__sophiaOpenAiKeyLogged && (openAiDebug || !OPENAI_API_KEY)) {
    anyGlobalThisOpenAi.__sophiaOpenAiKeyLogged = true;
    console.warn(
      `[LLM] OpenAI key loaded in runtime? ${OPENAI_API_KEY ? "yes" : "NO"} (base_url=${OPENAI_BASE_URL})`,
    );
  }

  // Default model selection:
  // - If caller provides meta.model, respect it.
  // - Otherwise, prefer env GEMINI_SOPHIA_CHAT_MODEL.
  const envChatModel = (Deno.env.get("GEMINI_SOPHIA_CHAT_MODEL") ?? "").trim();
  // Default to gemini-2.5-flash (fast) for all traffic.
  const defaultModel = envChatModel || "gemini-2.5-flash";
  let baseModel = (meta?.model ?? defaultModel).trim();
  const sourceLower = String(meta?.source ?? "").toLowerCase();
  const isEvalJudgeCall =
    sourceLower === "eval-judge" ||
    sourceLower.includes("eval-judge") ||
    String(meta?.requestId ?? "").includes(":judge:");
  let model = baseModel;
  // If we detect rate limiting/overload during this call, stick to a stable model (reduces warning spam + thrash).
  // In eval-like calls, default stickiness is to go to 2.0 after first failure.
  let stickyModel: string | null = null;

  // Fallback policy (interleaved providers for resilience):
  // - Standard: gemini-2.5-flash → gpt-5-mini → gpt-5-nano
  // - Critical (gpt-5.2): gpt-5.2 → gemini-2.5-flash → gpt-5-mini → gpt-5-nano
  //
  // Note: We interleave providers (OpenAI ↔ Gemini) for better resilience.
  // Removed: gemini preview models (unstable), gemini-2.0-flash (deprecated).
  const isGpt52 = (m: string) => /^\s*gpt-5\.2\b/i.test(String(m ?? "").trim());

  const pickModelForAttempt = (startModel: string, attempt: number): string => {
    // Simple: always return the start model; fallback chain handles diversity.
    return startModel;
  };

  // Per-model timeout caps: the 3.0 flash preview model can get overloaded and hang.
  // NOTE: We keep timeouts (edge runtime can otherwise hang / get early-terminated),
  // but we avoid "fail fast" on the *primary* model so it gets a fair chance before fallbacks.
  const effectiveTimeoutMsForModel = (m: string): number => {
    // If the caller explicitly set httpTimeoutMs, respect it exactly.
    if (Number.isFinite(Number(meta?.httpTimeoutMs)) && Number(meta?.httpTimeoutMs) > 0) {
      return Math.floor(Number(meta?.httpTimeoutMs));
    }
    const mm = String(m ?? "").trim();
    // Tight timeouts in evals to avoid edge-runtime early termination → run-evals 500 → "restart from beginning".
    if (isEvalLikeRequest) {
      const evalTimeout = GEMINI_EVAL_HTTP_TIMEOUT_MS;
      // Evals can have large prompts (dashboard + vectors + tool schemas) and intermittent provider latency.
      // If timeouts are too tight we end up thrashing into fallbacks and generating noisy warning logs.
      // "Very loose" policy: allow long provider latency up to GEMINI_EVAL_HTTP_TIMEOUT_MS (default 120s),
      // with generous per-model caps, unless the caller explicitly set meta.httpTimeoutMs (handled above).
      if (/\bgemini-3[-.]flash-preview\b/i.test(mm)) return Math.min(evalTimeout, 120_000);
      if (/\bgemini-3[-.]pro-preview\b/i.test(mm)) return Math.min(evalTimeout, 120_000);
      if (/\bgemini-2\.5-flash\b/i.test(mm)) return Math.min(evalTimeout, 110_000);
      if (/\bgemini-2\.0-flash\b/i.test(mm)) return Math.min(evalTimeout, 90_000);
      return evalTimeout;
    }
    if (/\bgemini-3[-.]flash-preview\b/i.test(mm)) return Math.min(GEMINI_HTTP_TIMEOUT_MS, 12_000);
    if (/\bgemini-3[-.]pro-preview\b/i.test(mm)) return Math.min(GEMINI_HTTP_TIMEOUT_MS, 25_000);
    return GEMINI_HTTP_TIMEOUT_MS;
  };

  // OpenAI timeout: in eval-like requests we still want a bit more breathing room than Gemini,
  // because OpenAI may take longer when validating tool schemas + producing tool_calls.
  const OPENAI_HTTP_TIMEOUT_MS = (() => {
    const raw = (Deno.env.get("OPENAI_HTTP_TIMEOUT_MS") ?? "").trim();
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    // Increased default to 120s to allow for long generations (plans) with gpt-5.2
    return isEvalLikeRequest ? 120_000 : 120_000;
  })();

  // Even when callers set maxRetries=1 (common for "follow-up phrasing" steps),
  // we still want a robust provider fallback chain to avoid hard failures that abort the whole request
  // (which looks like an "eval restart" when the runner retries).
  const pickFallbackChainForAttempt = (startModel: string, attempt: number): string[] => {
    const primary = stickyModel ? stickyModel : pickModelForAttempt(startModel, attempt);
    const chain: string[] = [];
    const push = (m: string) => {
      const mm = String(m ?? "").trim();
      if (!mm) return;
      if (!chain.includes(mm)) chain.push(mm);
    };
    // If the caller asked to disable the fallback chain, only try the primary model once.
    if (Boolean(meta?.disableFallbackChain)) {
      push(primary);
      return chain;
    }
    // Fallback chains (interleaved providers for resilience):
    // - Critical (gpt-5.2): gpt-5.2 → gemini-2.5-flash → gpt-5-mini → gpt-5-nano
    // - Standard: primary → gpt-5-mini → gpt-5-nano
    //
    // Notes:
    // - Providers are interleaved: if OpenAI is down, we fall back to Gemini immediately.
    // - If OPENAI_API_KEY is missing, OpenAI models will be skipped at runtime.
    push(primary);
    const isCritical = isGpt52(startModel) || (isEvalJudgeCall && isGpt52(primary));
    if (isCritical) {
      push("gemini-2.5-flash");
      push("gpt-5-mini");
      push("gpt-5-nano");
      return chain;
    }
    // Standard: prefer staying on Gemini as primary; if it fails, fall back to OpenAI.
    // If primary is not Gemini, still keep the OpenAI fallbacks to increase success chance.
    push("gpt-5-mini");
    push("gpt-5-nano");
    return chain;
  };

  const hasUsableCandidate = (obj: any): boolean => {
    try {
      const parts = obj?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) return false;
      // We accept either tool calls OR non-empty text.
      if (parts.some((p: any) => p?.functionCall)) return true;
      const txt = parts.find((p: any) => typeof p?.text === "string" && String(p.text).trim().length > 0);
      return Boolean(txt);
    } catch {
      return false;
    }
  };

  const payload: any = {
    contents: [{
      role: "user",
      parts: [{ text: userMessage }],
    }],
    generationConfig: {
      temperature: temperature,
    },
  }

  // Prefer separating system instructions from user content (more stable behavior).
  const sys = (systemPrompt ?? "").toString().trim()
  if (sys) {
    payload.systemInstruction = { parts: [{ text: sys }] }
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json"
  }

  // Eval stability guard:
  // In "MODE TEST PARKING LOT" (run-evals), we want to test the post-bilan/deferred state machine,
  // not perform DB writes (track_progress / create_action / etc). Tool calls also increase CPU and
  // risk Edge Runtime "wall clock" / "CPU time" terminations.
  const disableToolsInEval =
    (systemPrompt ?? "").includes("MODE TEST PARKING LOT") ||
    (systemPrompt ?? "").includes("CONSIGNE TEST PARKING LOT");

  if (!disableToolsInEval && tools && tools.length > 0) {
    payload.tools = [{ function_declarations: tools }];
    
    // Support for tool_config to force tool use
    if (toolChoice !== "auto") {
         payload.toolConfig = {
            functionCallingConfig: {
                mode: toolChoice === "any" ? "ANY" : "AUTO" 
                // Note: Gemini doesn't fully support specific tool name forcing in this API version easily, 
                // but "ANY" forces *some* tool to be called.
            }
        }
    }
  } else if (disableToolsInEval && tools && tools.length > 0) {
    console.log(
      `[Gemini] Tools disabled for eval parking-lot request_id=${meta?.requestId ?? "n/a"} source=${meta?.source ?? "n/a"}`,
    );
  }

  const MAX_RETRIES = (() => {
    const fromMeta = Number(meta?.maxRetries);
    if (Number.isFinite(fromMeta) && fromMeta >= 1) return Math.floor(fromMeta);
    const raw = (Deno.env.get("GEMINI_MAX_RETRIES") ?? "").trim();
    const n = Number(raw);
    // Default: keep retries short in evals (edge-runtime wall clock), longer in prod.
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    return isEvalLikeRequest ? 4 : 10;
  })();
  let response: Response | null = null;
  let data: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Deterministic model selection + in-attempt fallback chain.
      const chain = pickFallbackChainForAttempt(baseModel, attempt);
      let lastInnerErr: any = null;
      for (let i = 0; i < chain.length; i++) {
        const desiredModel = chain[i]!;
        const provider = isOpenAiModel(desiredModel) ? "openai" : "gemini";
        if (isBreakerOpen(provider, desiredModel)) {
          await traceInsert({ level: "warn", event: "breaker_skip", payload: { provider, model: desiredModel, source: meta?.source ?? null } });
          continue;
        }
        if (desiredModel && desiredModel !== model) {
          const tag = i === 0 ? "policy" : "fallback";
          console.warn(
            `[Gemini] Switching model (${tag}) request_id=${meta?.requestId ?? "n/a"} attempt=${attempt}/${MAX_RETRIES} ${model} -> ${desiredModel}`,
          );
          await traceInsert({
            level: "warn",
            event: "model_switch",
            payload: {
              tag,
              attempt,
              max_retries: MAX_RETRIES,
              from: model,
              to: desiredModel,
              source: meta?.source ?? null,
            },
          });
          model = desiredModel;
        }

        // Provider dispatch: OpenAI vs Gemini
        if (isOpenAiModel(model)) {
          if (!OPENAI_API_KEY) {
            console.warn(`[LLM] OpenAI key missing in runtime; skipping openai model=${model} request_id=${meta?.requestId ?? "n/a"}`);
            await traceInsert({ level: "warn", event: "openai_missing_key", payload: { model, source: meta?.source ?? null } });
            __dbg("H2", "gemini.ts:openai:missing_key", "OPENAI_API_KEY missing; skip", { model, source, requestId: meta?.requestId ?? null });
            lastInnerErr = new Error("OPENAI_API_KEY missing");
            continue;
          }
          const timeoutMs =
            Number.isFinite(Number(meta?.httpTimeoutMs)) && Number(meta?.httpTimeoutMs) > 0
              ? Math.floor(Number(meta?.httpTimeoutMs))
              : OPENAI_HTTP_TIMEOUT_MS;
          const t0 = Date.now();
          try {
            const { resp, json } = await callOpenAI({
              model,
              systemPrompt,
              userMessage,
              temperature,
              jsonMode,
              tools,
              toolChoice,
              requestId: meta?.requestId ?? "n/a",
              timeoutMs,
            });
            const durationMs = Date.now() - t0;
            console.log(JSON.stringify({
              tag: "openai_http",
              request_id: meta?.requestId ?? null,
              source: meta?.source ?? null,
              model,
              status: resp.status,
              ok: resp.ok,
              duration_ms: durationMs,
              timeout_ms: timeoutMs,
              attempt,
              chain_index: i,
            }));
            if (retryableStatuses.has(resp.status)) {
              const msg = String(json?.error?.message ?? resp.statusText ?? "Retryable error");
              __dbg("H2", "gemini.ts:retryable_status_openai", "retryable status encountered (openai)", {
                model,
                status: resp.status,
                attempt,
                maxRetries: MAX_RETRIES,
                source,
                message: msg.slice(0, 160),
                error_type: json?.error?.type ?? null,
              });
              await traceInsert({ level: "warn", event: "retryable_status", payload: { provider: "openai", status: resp.status, attempt, max_retries: MAX_RETRIES, model, source: meta?.source ?? null, message: msg.slice(0, 240) } });
              if (resp.status === 429 || resp.status === 503) openBreaker("openai", model, 30_000, msg);
              lastInnerErr = new Error(`OpenAI error: ${msg}`);
              const sleepMs = backoffMsForStatus(resp.status, attempt, resp.headers.get("retry-after"));
              await sleep(sleepMs);
              continue;
            }
            if (!resp.ok) {
              const msg = String(json?.error?.message ?? resp.statusText ?? "Error");
              await traceInsert({ level: "error", event: "non_retryable_status", payload: { provider: "openai", status: resp.status, attempt, max_retries: MAX_RETRIES, model, source: meta?.source ?? null, message: msg.slice(0, 240) } });
              throw new Error(`OpenAI error: ${msg}`);
            }
            const msg0 = json?.choices?.[0]?.message;
            const toolCalls = Array.isArray(msg0?.tool_calls) ? msg0.tool_calls : [];
            if (toolCalls.length > 0) {
              const tc = toolCalls[0];
              const toolName = String(tc?.function?.name ?? "").trim();
              let argsObj: any = tc?.function?.arguments;
              if (typeof argsObj === "string") {
                try { argsObj = JSON.parse(argsObj); } catch { /* keep string */ }
              }
              console.log(JSON.stringify({
                tag: "openai_result",
                request_id: meta?.requestId ?? null,
                source: meta?.source ?? null,
                model,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "tool_call",
                tool: toolName || null,
                attempt,
                chain_index: i,
              }));
              return { tool: toolName, args: argsObj };
            }
            const text = String(msg0?.content ?? "").trim();
            if (!text) {
              lastInnerErr = new Error("Empty OpenAI response");
              continue;
            }
            console.log(JSON.stringify({
              tag: "openai_result",
              request_id: meta?.requestId ?? null,
              source: meta?.source ?? null,
              model,
              json_mode: Boolean(jsonMode),
              tool_choice: toolChoice,
              has_tools: Array.isArray(tools) && tools.length > 0,
              outcome: "text",
              attempt,
              chain_index: i,
            }));
            return jsonMode ? text.replace(/```json\n?|```/g, '').trim() : text;
          } catch (e) {
            const msg = String((e as any)?.message ?? e ?? "");
            console.warn(`[LLM] OpenAI call failed model=${model} request_id=${meta?.requestId ?? "n/a"}: ${msg.slice(0, 200)}`);
            await traceInsert({ level: "warn", event: "openai_error", payload: { model, source: meta?.source ?? null, error: msg.slice(0, 240) } });
            // treat timeouts as breaker-open
            if (/timeout|timed out|abort/i.test(msg)) openBreaker("openai", model, 30_000, msg);
            lastInnerErr = e;
            continue;
          }
        }

        // Gemini provider requires a Gemini API key. If missing, skip to the next model in the chain.
        if (!isOpenAiModel(model) && !GEMINI_API_KEY) {
          lastInnerErr = new Error("Clé API Gemini manquante");
          continue;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
        const timeoutMs = effectiveTimeoutMsForModel(model);
        const { signal, cancel } = makeTimeoutSignal(timeoutMs);
        try {
          // #region agent log
          const waitStart = Date.now();
          // Acquire in stable order to avoid deadlocks.
          const releaseGlobal = await semStore.global.acquire();
          const releaseModel = await getModelSem(model).acquire();
          let released = false;
          const releaseAll = () => {
            if (released) return;
            released = true;
            try { releaseModel(); } catch {}
            try { releaseGlobal(); } catch {}
          };
          const waitedMs = Date.now() - waitStart;
          __dbg("H1", "gemini.ts:limiter:acquire", "acquired concurrency slots", {
            model,
            waitedMs,
            global: semStore.global.snapshot(),
            perModel: getModelSem(model).snapshot(),
            attempt,
            maxRetries: MAX_RETRIES,
            source,
            isEvalLikeRequest,
          });
          await traceInsert({
            level: "info",
            event: "rate_limit_acquire",
            payload: {
              model,
              waited_ms: waitedMs,
              attempt,
              max_retries: MAX_RETRIES,
              source: meta?.source ?? null,
              is_eval_like: isEvalLikeRequest,
              global: semStore.global.snapshot(),
              per_model: getModelSem(model).snapshot(),
            },
          });
          // #endregion
          try {
            response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal,
            });
          } catch (e) {
            // Always release slots on network errors/timeouts.
            releaseAll();
            // Timeouts / aborts are common on overloaded preview models; immediately fallback within the same attempt.
            const msg = String((e as any)?.message ?? e ?? "");
            const name = String((e as any)?.name ?? "");
            const isTimeoutLike =
              name === "TimeoutError" ||
              name === "AbortError" ||
              /timed\s+out|timeout|aborted|abort/i.test(msg);
            if (isTimeoutLike) {
              console.warn(
                `[Gemini] timeout/abort attempt=${attempt}/${MAX_RETRIES} request_id=${meta?.requestId ?? "n/a"} model=${model}`,
              );
              await traceInsert({
                level: "warn",
                event: "timeout_or_abort",
                payload: {
                  attempt,
                  max_retries: MAX_RETRIES,
                  model,
                  source: meta?.source ?? null,
                  error: String((e as any)?.message ?? e ?? "").slice(0, 240),
                },
              });
              lastInnerErr = e;
              continue;
            }
            throw e;
          }
          // #region agent log
          __dbg("H3", "gemini.ts:http:response", "received response", {
            model,
            status: response?.status ?? null,
            ok: Boolean(response?.ok),
            attempt,
            innerIndex: i,
            source,
          });
          // #endregion
          // Release concurrency slots ASAP once fetch returned a response.
          // (Parsing JSON can still be heavy, but the network is the bottleneck under 429/503.)
          releaseAll();
        } finally {
          cancel();
        }

        if (retryableStatuses.has(response.status)) {
          // Smarter handling for 429: do not thrash with rapid retries that worsen rate limits.
          // We still allow fallback within the chain, but we reduce outer retries in eval-like traffic.
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData?.error?.message || response.statusText || "Retryable error";
          const retryAfter = response.headers.get("retry-after");
          const rlRem = response.headers.get("x-ratelimit-remaining");
          const rlRes = response.headers.get("x-ratelimit-reset");
          const googleReqId = response.headers.get("x-request-id") || response.headers.get("x-goog-request-id");
          console.warn(
            `[Gemini] status=${response.status} attempt=${attempt}/${MAX_RETRIES} request_id=${meta?.requestId ?? "n/a"} model=${model}: ${msg}`,
          );
          // #region agent log
          __dbg("H2", "gemini.ts:retryable_status", "retryable status encountered", {
            model,
            status: response.status,
            attempt,
            maxRetries: MAX_RETRIES,
            source,
            message: String(msg).slice(0, 120),
            retryAfter,
            x_ratelimit_remaining: rlRem,
            x_ratelimit_reset: rlRes,
            google_request_id: googleReqId,
            error_status: (errorData as any)?.error?.status ?? null,
            error_code: (errorData as any)?.error?.code ?? null,
          });
          // #endregion
          await traceInsert({
            level: "warn",
            event: "retryable_status",
            payload: {
              status: response.status,
              attempt,
              max_retries: MAX_RETRIES,
              model,
              source: meta?.source ?? null,
              message: String(msg).slice(0, 240),
              retry_after: retryAfter,
              error_status: (errorData as any)?.error?.status ?? null,
              error_code: (errorData as any)?.error?.code ?? null,
            },
          });
          lastInnerErr = new Error(`Erreur Gemini: ${msg}`);
          if (response.status === 429 || response.status === 503) {
            // After rate limiting / overload, stick to gemini-2.5-flash (most stable Gemini).
            if (isEvalLikeRequest) stickyModel = "gemini-2.5-flash";
            openBreaker("gemini", model, 20_000, msg);
          }
          // Respect retry-after/backoff for rate limiting/overload BEFORE trying next model.
          const sleepMs = backoffMsForStatus(response.status, attempt, response.headers.get("retry-after"));
          // #region agent log
          __dbg("H2", "gemini.ts:inner_backoff", "inner backoff before next model in chain", { status: response.status, attempt, ms: sleepMs, source, model });
          // #endregion
          await sleep(sleepMs);
          // Try next model in chain (even if MAX_RETRIES=1).
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("Gemini Error Payload:", errorData);
          await traceInsert({
            level: "error",
            event: "non_retryable_status",
            payload: {
              status: response.status,
              attempt,
              max_retries: MAX_RETRIES,
              model,
              source: meta?.source ?? null,
              message: String(errorData?.error?.message || response.statusText || "").slice(0, 240),
            },
          });
          // Non-retryable error: do not silently switch models (surface the error).
          throw new Error(`Erreur Gemini: ${errorData.error?.message || response.statusText}`);
        }

        const parsed = await response.json().catch(() => null);
        if (!parsed || !hasUsableCandidate(parsed)) {
          console.warn(
            `[Gemini] Empty/invalid response attempt=${attempt}/${MAX_RETRIES} request_id=${meta?.requestId ?? "n/a"} model=${model} (will fallback/retry)`,
          );
          await traceInsert({
            level: "warn",
            event: "empty_or_invalid_response",
            payload: { attempt, max_retries: MAX_RETRIES, model, source: meta?.source ?? null },
          });
          lastInnerErr = new Error("Empty Gemini response");
          continue;
        }
        data = parsed;
        lastInnerErr = null;
        break;
      }

      if (!data) {
        // If we exhausted the fallback chain inside this attempt, use outer retry/backoff (if any).
        if (attempt < MAX_RETRIES) {
          // #region agent log
          __dbg("H2", "gemini.ts:outer_backoff", "outer backoff before next attempt", { attempt, ms: backoffMs(attempt), source, isEvalLikeRequest });
          // #endregion
          await sleep(backoffMs(attempt));
          continue;
        }
        if (lastInnerErr) throw lastInnerErr;
      } else {
        break;
      }
    } catch (e) {
      const isLast = attempt >= MAX_RETRIES;
      console.error(
        `[Gemini] request_id=${meta?.requestId ?? "n/a"} source=${meta?.source ?? "n/a"} model=${model} attempt=${attempt}/${MAX_RETRIES} error:`,
        e,
      );
      await traceInsert({
        level: isLast ? "error" : "warn",
        event: "outer_attempt_error",
        payload: {
          attempt,
          max_retries: MAX_RETRIES,
          model,
          source: meta?.source ?? null,
          error: String((e as any)?.message ?? e ?? "").slice(0, 240),
        },
      });
      if (isLast) throw e;
      // #region agent log
      __dbg("H2", "gemini.ts:outer_error_backoff", "outer attempt error -> backoff", { attempt, ms: backoffMs(attempt), source, err: String((e as any)?.message ?? e ?? '').slice(0,120) });
      // #endregion
      await sleep(backoffMs(attempt));
    }
  }

  if (!data) {
    throw new Error("Erreur Gemini: no response after retries");
  }
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
      const costUsd = await computeCostUsd("gemini", model, promptTokens, outputTokens);
      await logLlmUsageEvent({
        user_id: meta?.userId ?? null,
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        provider: "gemini",
        model,
        kind: "generate",
        prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
        output_tokens: typeof outputTokens === "number" ? outputTokens : null,
        total_tokens: typeof totalTokens === "number" ? totalTokens : null,
        cost_usd: costUsd,
        metadata: { jsonMode, toolChoice, hasTools: Array.isArray(tools) && tools.length > 0 },
      });
    }
  } catch {
    // ignore telemetry failures
  }
  const parts = data.candidates?.[0]?.content?.parts || []

  // Remove provider-specific opaque fields from logs (e.g. Gemini thoughtSignature)
  // to keep logs readable and avoid storing unnecessary data.
  const redactForLog = (v: any): any => {
    if (Array.isArray(v)) return v.map(redactForLog);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === "thoughtSignature") continue;
        out[k] = redactForLog(val);
      }
      return out;
    }
    return v;
  };

  // LOG DEBUG : Afficher la réponse brute de Gemini pour comprendre pourquoi il ne voit pas l'outil
  const debugRaw =
    (Deno.env.get("GEMINI_DEBUG_RAW") ?? "").trim() === "1" ||
    (Deno.env.get("GEMINI_DEBUG") ?? "").trim() === "1";
  if (debugRaw) {
    console.log(
      JSON.stringify({
        tag: "gemini_raw_parts",
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        model,
        parts: redactForLog(parts),
      }),
    );
  }
  
  // 1. Priorité absolue aux outils : On cherche SI n'importe quelle partie est un appel d'outil
  const toolCallPart = parts.find((p: any) => p.functionCall)
  
  if (toolCallPart) {
    console.log(
      JSON.stringify({
        tag: "gemini_result",
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        model,
        json_mode: Boolean(jsonMode),
        tool_choice: toolChoice,
        has_tools: Array.isArray(tools) && tools.length > 0,
        outcome: "tool_call",
        tool: toolCallPart.functionCall.name ?? null,
      }),
    );
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args
    }
  }

  // 2. Sinon on prend le texte
  const textPart = parts.find((p: any) => p.text)
  const text = textPart?.text
  
  if (!text) throw new Error('Réponse vide de Gemini')

  console.log(
    JSON.stringify({
      tag: "gemini_result",
      request_id: meta?.requestId ?? null,
      source: meta?.source ?? null,
      model,
      json_mode: Boolean(jsonMode),
      tool_choice: toolChoice,
      has_tools: Array.isArray(tools) && tools.length > 0,
      outcome: "text",
    }),
  );

  return jsonMode ? text.replace(/```json\n?|```/g, '').trim() : text
}

/**
 * Search the web using Gemini's built-in Google Search Grounding.
 * Returns structured snippets and source URLs for injection into agent context.
 *
 * This is a dedicated, lightweight function (does NOT go through the full
 * generateWithGemini retry/fallback chain) to keep latency predictable.
 */
export async function searchWithGeminiGrounding(
  query: string,
  meta?: { requestId?: string; model?: string; timeoutMs?: number },
): Promise<{ text: string; snippets: string[]; sources: string[]; raw?: any }> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.warn("[Research] GEMINI_API_KEY missing – skipping grounding search");
    return { text: "", snippets: [], sources: [] };
  }

  // Test mode: deterministic stub (no network).
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
    return { text: `MEGA_TEST_STUB: recherche pour "${query}"`, snippets: [`Stub result for: ${query}`], sources: ["stub://test"] };
  }

  const model = (meta?.model ?? "gemini-2.5-flash").trim();
  const timeoutMs = Math.max(3_000, Math.floor(meta?.timeoutMs ?? 8_000));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: query }],
    }],
    systemInstruction: {
      parts: [{ text: "Réponds factuellement et de manière concise à cette question. Cite tes sources. Si tu ne trouves pas d'information fiable, dis-le clairement." }],
    },
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  // Timeout signal
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(new Error("Research grounding timeout")), timeoutMs);

  try {
    const t0 = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const durationMs = Date.now() - t0;

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.warn(`[Research] Grounding call failed status=${response.status} duration=${durationMs}ms request_id=${meta?.requestId ?? "n/a"}`, errBody);
      return { text: "", snippets: [], sources: [] };
    }

    const data = await response.json();

    // Usage metadata (best effort telemetry): grounding calls bypass generateWithGemini.
    try {
      const usage = (data as any)?.usageMetadata;
      const promptTokens = usage?.promptTokenCount;
      const outputTokens = usage?.candidatesTokenCount;
      const totalTokens = usage?.totalTokenCount;
      if (typeof promptTokens === "number" || typeof totalTokens === "number") {
        const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
        const costUsd = await computeCostUsd("gemini", model, promptTokens, outputTokens);
        await logLlmUsageEvent({
          user_id: null,
          request_id: meta?.requestId ?? null,
          source: "sophia-brain:research_grounding",
          provider: "gemini",
          model,
          kind: "generate",
          prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
          output_tokens: typeof outputTokens === "number" ? outputTokens : null,
          total_tokens: typeof totalTokens === "number" ? totalTokens : null,
          cost_usd: costUsd,
          metadata: {
            grounding: true,
            query: String(query ?? "").slice(0, 120),
          },
        });
      }
    } catch {
      // Telemetry failures must never block response path.
    }

    // Extract text response
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find((p: any) => typeof p?.text === "string")?.text ?? "";

    // Extract grounding metadata (snippets + sources)
    const groundingMeta = data?.candidates?.[0]?.groundingMetadata;
    const snippets: string[] = [];
    const sources: string[] = [];
    const seenSnippets = new Set<string>();
    const seenSources = new Set<string>();
    const pushSnippet = (value: unknown) => {
      const s = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 260);
      if (!s) return;
      const key = s.toLowerCase();
      if (seenSnippets.has(key)) return;
      seenSnippets.add(key);
      snippets.push(s);
    };
    const pushSource = (value: unknown) => {
      const s = String(value ?? "").trim();
      if (!s) return;
      if (seenSources.has(s)) return;
      seenSources.add(s);
      sources.push(s);
    };

    if (groundingMeta) {
      // groundingChunks contains the web results
      const chunks = Array.isArray(groundingMeta.groundingChunks) ? groundingMeta.groundingChunks : [];
      for (const chunk of chunks.slice(0, 8)) {
        const web = chunk?.web;
        if (web?.title || web?.uri) {
          if (web.title) pushSnippet(web.title);
          if (web.uri) pushSource(web.uri);
        }
      }

      // searchEntryPoint may contain rendered HTML snippets
      const supportChunks = Array.isArray(groundingMeta.groundingSupports) ? groundingMeta.groundingSupports : [];
      for (const support of supportChunks.slice(0, 6)) {
        const seg = support?.segment?.text;
        if (typeof seg === "string" && seg.trim()) {
          pushSnippet(seg);
        }
      }
    }

    console.log(JSON.stringify({
      tag: "research_grounding",
      request_id: meta?.requestId ?? null,
      model,
      query: query.slice(0, 120),
      duration_ms: durationMs,
      snippets_count: snippets.length,
      sources_count: sources.length,
      has_text: Boolean(textPart),
    }));

    return { text: textPart, snippets, sources, raw: groundingMeta };
  } catch (e) {
    const msg = String((e as any)?.message ?? e ?? "");
    console.warn(`[Research] Grounding search failed request_id=${meta?.requestId ?? "n/a"}: ${msg.slice(0, 200)}`);
    return { text: "", snippets: [], sources: [] };
  } finally {
    clearTimeout(timerId);
  }
}

export async function generateEmbedding(text: string, meta?: { userId?: string; forceRealAi?: boolean }): Promise<number[]> {
  // Test mode: deterministic stub embedding (vector(768)).
  // NOTE: We do NOT stub just because we're on local Supabase; if a developer has a GEMINI_API_KEY
  // they usually want embeddings to work locally (RAG, memories, etc.). Use MEGA_TEST_MODE=1 explicitly
  // for offline/stubbed runs.
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const megaEnabled = megaRaw === "1";

  if (megaEnabled && !meta?.forceRealAi) {
    // Postgres expects exact dimension for vector(768).
    return Array.from({ length: 768 }, () => 0);
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) throw new Error('Clé API Gemini manquante')

  const model = (Deno.env.get("GEMINI_EMBEDDING_MODEL") ?? "text-embedding-004").trim() || "text-embedding-004"
  const base = "https://generativelanguage.googleapis.com"
  const urlV1 = `${base}/v1/models/${model}:embedContent?key=${GEMINI_API_KEY}`
  const urlV1beta = `${base}/v1beta/models/${model}:embedContent?key=${GEMINI_API_KEY}`

  const parseTimeoutMs = (raw: string | undefined, fallback: number) => {
    const n = Number(String(raw ?? "").trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const GEMINI_HTTP_TIMEOUT_MS = parseTimeoutMs(Deno.env.get("GEMINI_HTTP_TIMEOUT_MS"), 55_000);
  const makeTimeoutSignal = (timeoutMs: number): { signal: AbortSignal; cancel: () => void } => {
    const anyAbortSignal = AbortSignal as any;
    if (anyAbortSignal?.timeout && typeof anyAbortSignal.timeout === "function") {
      return { signal: anyAbortSignal.timeout(timeoutMs), cancel: () => {} };
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(new Error("Gemini request timeout")), timeoutMs);
    return { signal: controller.signal, cancel: () => clearTimeout(id) };
  };
  const { signal, cancel } = makeTimeoutSignal(GEMINI_HTTP_TIMEOUT_MS);
  const body = JSON.stringify({
    // Gemini expects this "models/..." prefix in the payload (even though the URL also includes the model).
    model: `models/${model}`,
    content: { parts: [{ text }] },
  })

  async function doFetch(url: string): Promise<Response> {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    })
  }

  // Prefer v1 (more stable). Only fall back to v1beta when explicitly allowed.
  let response: Response
  let lastErrPayload: any = null
  try {
    response = await doFetch(urlV1)
    if (!response.ok) {
      lastErrPayload = await response.json().catch(() => ({}))
      const allowV1beta = (Deno.env.get("GEMINI_ALLOW_V1BETA") ?? "").trim() === "1"
      const message = String(lastErrPayload?.error?.message ?? "")
      const looksLikeVersionMismatch =
        message.includes("API version v1") ||
        message.includes("not supported for embedContent") ||
        message.includes("not found")
      if (allowV1beta && looksLikeVersionMismatch) {
        response = await doFetch(urlV1beta)
      }
    }
  } finally {
    cancel()
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Embedding Error:", errorData || lastErrPayload);
    const msg = errorData?.error?.message || lastErrPayload?.error?.message || response.statusText || "Unknown error"
    throw new Error(`Erreur Embedding: ${msg}`)
  }

  const data = await response.json()
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
      const costUsd = await computeCostUsd("gemini", model, promptTokens, 0);
      await logLlmUsageEvent({
        user_id: meta?.userId ?? null,
        request_id: null,
        source: null,
        provider: "gemini",
        model,
        kind: "embed",
        prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
        output_tokens: 0,
        total_tokens: typeof totalTokens === "number" ? totalTokens : null,
        cost_usd: costUsd,
        metadata: { embedding: true },
      });
    }
  } catch {
    // ignore telemetry failures
  }
  return data.embedding.values
}

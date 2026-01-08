export async function generateWithGemini(
  systemPrompt: string, 
  userMessage: string, 
  temperature: number = 0.7,
  jsonMode: boolean = false,
  tools: any[] = [],
  toolChoice: string = "auto", // 'auto', 'any' or specific tool name (not supported by all models but 'any' forces tool use)
  meta?: { requestId?: string; model?: string; source?: string; forceRealAi?: boolean; userId?: string }
): Promise<string | { tool: string, args: any }> {
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
  const GEMINI_HTTP_TIMEOUT_MS = parseTimeoutMs(Deno.env.get("GEMINI_HTTP_TIMEOUT_MS"), 55_000);
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
  const backoffMs = (attempt: number) => {
    // attempt is 1-based
    const base = 800;
    const max = 15_000;
    const exp = Math.min(max, base * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 400);
    return Math.min(max, exp + jitter);
  };
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);

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
  if (!GEMINI_API_KEY) {
    throw new Error('Clé API Gemini manquante')
  }

  const baseModel = (meta?.model ?? "gemini-2.5-flash").trim();
  let model = baseModel;

  // Fallback policy (as requested):
  // - If starting with gemini-2.5-flash:
  //   attempts 1-2 => 2.5
  //   attempts 3-6 => 3-flash
  //   attempts 7+  => 2.0
  //
  // - If starting with gemini-3-flash-preview:
  //   attempts 1-6 => 3-flash
  //   attempts 7-9 => 2.5
  //   attempts 10+ => 2.0
  //
  // - If starting with gemini-3-pro-preview (eval-judge):
  //   attempts 1-2 => 3-pro
  //   attempts 3-6 => 3-flash
  //   attempts 7-8 => 2.5
  //   attempts 9+  => 2.0
  //
  // Note: we keep this deterministic and independent of env defaults so behavior is predictable.
  // You can still override the total attempts via GEMINI_MAX_RETRIES.
  const is25Flash = (m: string) => /\bgemini-2\.5-flash\b/i.test(String(m ?? "").trim());
  const is30Flash = (m: string) => /\bgemini-3[-.]flash-preview\b/i.test(String(m ?? "").trim()) || /\bgemini-3[-.]flash\b/i.test(String(m ?? "").trim());
  const is30Pro = (m: string) => /\bgemini-3[-.]pro-preview\b/i.test(String(m ?? "").trim()) || /\bgemini-3[-.]pro\b/i.test(String(m ?? "").trim());

  const pickModelForAttempt = (startModel: string, attempt: number): string => {
    const a = Math.max(1, Math.floor(attempt));
    // eval-judge often uses pro
    if (is30Pro(startModel)) {
      if (a <= 2) return "gemini-3-pro-preview";
      if (a <= 6) return "gemini-3-flash-preview";
      if (a <= 8) return "gemini-2.5-flash";
      return "gemini-2.0-flash";
    }
    // starting with 3-flash
    if (is30Flash(startModel)) {
      if (a <= 6) return "gemini-3-flash-preview";
      if (a <= 9) return "gemini-2.5-flash";
      return "gemini-2.0-flash";
    }
    // default: starting with 2.5-flash (or anything else)
    if (a <= 2) return is25Flash(startModel) ? "gemini-2.5-flash" : startModel;
    if (a <= 6) return "gemini-3-flash-preview";
    return "gemini-2.0-flash";
  };

  const payload: any = {
    contents: [{ 
      role: "user",
      parts: [{ text: systemPrompt + "\n\nMessage Utilisateur:\n" + userMessage }] 
    }],
    generationConfig: {
      temperature: temperature,
    }
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
    const raw = (Deno.env.get("GEMINI_MAX_RETRIES") ?? "").trim();
    const n = Number(raw);
    // Default: 10 attempts to allow 2.5 -> 3-flash -> 2.0 paths to actually execute.
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
  })();
  let response: Response | null = null;
  let data: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Deterministic model selection per attempt for predictable fallback behavior.
      const desiredModel = pickModelForAttempt(baseModel, attempt);
      if (desiredModel && desiredModel !== model) {
        console.warn(
          `[Gemini] Switching model (policy) request_id=${meta?.requestId ?? "n/a"} attempt=${attempt}/${MAX_RETRIES} ${model} -> ${desiredModel}`,
        );
        model = desiredModel;
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
      const { signal, cancel } = makeTimeoutSignal(GEMINI_HTTP_TIMEOUT_MS);
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });
      } finally {
        cancel();
      }

      if (retryableStatuses.has(response.status)) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData?.error?.message || response.statusText || "Retryable error";
        console.warn(
          `[Gemini] status=${response.status} attempt=${attempt}/${MAX_RETRIES} request_id=${meta?.requestId ?? "n/a"} model=${model}: ${msg}`,
        );

        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        // last attempt falls through to !ok handler
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Log minimal but keep payload for debugging (already was used in your logs).
        console.error("Gemini Error Payload:", errorData);
        throw new Error(`Erreur Gemini: ${errorData.error?.message || response.statusText}`);
      }

      data = await response.json();
      break;
    } catch (e) {
      const isLast = attempt >= MAX_RETRIES;
      console.error(`[Gemini] request_id=${meta?.requestId ?? "n/a"} attempt=${attempt}/${MAX_RETRIES} error:`, e);
      if (isLast) throw e;
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
  console.log("DEBUG GEMINI RAW PARTS:", JSON.stringify(redactForLog(parts), null, 2))
  
  // 1. Priorité absolue aux outils : On cherche SI n'importe quelle partie est un appel d'outil
  const toolCallPart = parts.find((p: any) => p.functionCall)
  
  if (toolCallPart) {
    console.log("Gemini Tool Call Found:", toolCallPart.functionCall.name)
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args
    }
  }

  // 2. Sinon on prend le texte
  const textPart = parts.find((p: any) => p.text)
  const text = textPart?.text
  
  if (!text) throw new Error('Réponse vide de Gemini')

  return jsonMode ? text.replace(/```json\n?|```/g, '').trim() : text
}

export async function generateEmbedding(text: string, meta?: { userId?: string }): Promise<number[]> {
  // Test mode: deterministic stub embedding (vector(768)).
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    // Postgres expects exact dimension for vector(768).
    return Array.from({ length: 768 }, () => 0);
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) throw new Error('Clé API Gemini manquante')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`

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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] }
    }),
    signal,
  }).finally(() => cancel())

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Embedding Error:", errorData);
    throw new Error(`Erreur Embedding: ${response.statusText}`)
  }

  const data = await response.json()
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
      const costUsd = await computeCostUsd("gemini", "text-embedding-004", promptTokens, 0);
      await logLlmUsageEvent({
        user_id: meta?.userId ?? null,
        request_id: null,
        source: null,
        provider: "gemini",
        model: "text-embedding-004",
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

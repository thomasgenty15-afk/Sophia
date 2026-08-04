// KEEL — multimodal (vision) LLM client.
//
// CONTRACT non-input #4: a photo may evidence presence/composition/portion/serving.
// It NEVER produces a micronutrient, energy or macro fact. Do not add calorie
// estimation to this module.
//
// This module is deliberately separate from _shared/gemini.ts (text-only payload,
// ~286 call sites): generateWithGemini is never modified or wrapped here. Small
// private helpers of gemini.ts (env read, timeout signal) are re-implemented
// locally because they are not exported.

import { logLlmRawResponseEvent } from "./llm-raw-trace.ts";

// Edge Runtime (Deno) — keep typings lightweight, same convention as gemini.ts.
declare const Deno: any;

export type VisionInput = {
  mimeType: string; // image/jpeg | image/png | image/webp | application/pdf
  base64: string; // raw base64 payload (no data: URL prefix)
};

export type GenerateWithVisionArgs = {
  systemPrompt: string;
  userMessage: string;
  media: VisionInput[]; // 1..N images, or exactly 1 PDF
  temperature?: number;
  jsonMode?: boolean;
  model?: string;
  timeoutMs?: number; // hard per-attempt timeout, default 45000
  meta?: { source?: string; userId?: string; requestId?: string };
};

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PDF_MIME_TYPE = "application/pdf";

// Vision model. Overridable via KEEL_VISION_MODEL.
//
// We deliberately run the PRO tier here rather than the Flash tier used for
// text. Vision is the one place in KEEL where a wrong answer is expensive in
// trust rather than in tokens: the metric that decides whether a coach keeps
// using the product is the FALSE-POSITIVE "compliant" rate (W5.5). A photo
// wrongly judged conforming tells a coach their client is on plan when they
// are not — and a coach who catches that once stops believing the whole
// dashboard. Reading a plate against a prescription (is there a protein? a
// vegetable? is this the prescribed breakfast or something else?) is a
// fine-grained visual reasoning task, which is exactly where Pro separates
// from Flash.
//
// Cost, MEASURED not assumed (repo convention — see analyze-meal-photo-v1's
// README). 3 real calls at this model: ~1.9k input / ~160 output tokens.
// The surprise is that Pro costs far less than its price ratio suggests: it
// answered in ~160 output tokens where Flash spent ~610 on reasoning, so the
// per-photo cost is ~1.6x Flash, not the ~10x the price sheet implies —
// roughly $0.006/photo on a small test image, and ~$0.011 once the input
// carries a real photo and a full plan block (the README measured ~3.6k input
// tokens on the real function). Budget ~$0.30-0.80 per student per month at
// 2-3 photos a day, against a $12/active-student price. Small, but no longer a
// rounding error: re-measure if photo volume grows.
const DEFAULT_VISION_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_TIMEOUT_MS = 45_000;
// 2 retries on network error / retryable HTTP status (3 attempts total).
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_SOURCE = "keel-vision";

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function makeTimeoutSignal(
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const anyAbortSignal = AbortSignal as any;
  if (anyAbortSignal?.timeout && typeof anyAbortSignal.timeout === "function") {
    return { signal: anyAbortSignal.timeout(timeoutMs), cancel: () => {} };
  }
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(new Error("Vision request timeout")),
    timeoutMs,
  );
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

function backoffMs(attempt: number): number {
  // Short backoff: 600ms, 1200ms (+ jitter). Vision calls are user-facing.
  return 600 * attempt + Math.floor(Math.random() * 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveVisionModel(override?: string): string {
  const fromArg = String(override ?? "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String(safeEnvGet("KEEL_VISION_MODEL") ?? "").trim();
  return fromEnv || DEFAULT_VISION_MODEL;
}

// R7: token mappings fail loudly. An unsupported mime type or an incoherent
// media set throws — it never degrades into a silent partial upload.
export function assertValidVisionMedia(media: VisionInput[]): void {
  if (!Array.isArray(media) || media.length === 0) {
    throw new Error("Vision media required: pass 1..N images or 1 PDF");
  }
  let pdfCount = 0;
  for (const item of media) {
    const mime = String(item?.mimeType ?? "").trim().toLowerCase();
    if (mime === PDF_MIME_TYPE) {
      pdfCount++;
    } else if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      throw new Error(
        `Unsupported vision mime type: "${item?.mimeType}" (allowed: image/jpeg, image/png, image/webp, application/pdf)`,
      );
    }
    const b64 = String(item?.base64 ?? "").trim();
    if (!b64) {
      throw new Error("Vision media item has empty base64 payload");
    }
    if (b64.startsWith("data:")) {
      throw new Error(
        "Vision media base64 must be raw (no data: URL prefix)",
      );
    }
  }
  if (pdfCount > 0 && media.length > 1) {
    throw new Error(
      "Vision media: a PDF must be sent alone (1 PDF, no mixing with images)",
    );
  }
}

/**
 * MEASURED DEFECT this exists for (2026-08-03, agent-3 QA, 12 real calls on two
 * real meal photos against `gemini-3.1-pro-preview`): **4 of 12 responses came
 * back as valid JSON minus its final closing brace**, with
 * `finishReason: "STOP"`, no `MAX_TOKENS`, ~700 output tokens — the provider
 * simply dropped the last character of a `responseMimeType: application/json`
 * response it declared complete. Every one of those ended on
 * `"image_quality": "clear"`, the last field of the schema.
 *
 * The cost of that at the time: `parseMealAnalysis` does `JSON.parse`,
 * `analyze-meal-photo-v1` has no branch for a parse failure, so a third of real
 * meal photos got HTTP 500 and NO reading at all — `food_group_ref`,
 * `portion_band` and `recognized` left null forever on a row nothing re-analyzes,
 * and a WhatsApp student answered with a bare "Photo saved.".
 *
 * WHAT THIS FUNCTION IS ALLOWED TO DO: append closing brackets. Nothing else.
 * It adds STRUCTURE, never CONTENT, and it refuses every case where the two
 * cannot be told apart:
 *
 *   - truncated inside a string  -> refused (`"sal` would become `"sal"`, a
 *     fabricated label);
 *   - trailing `,` or `:`        -> refused (a pair with no value);
 *   - last token is bare (number / true / false / null) -> REFUSED, and this is
 *     the subtle one: `0.9` truncated from `0.95` closes into perfectly valid
 *     JSON carrying a WRONG confidence. A completeness we cannot prove is a
 *     completeness we do not assert.
 *
 * So the acceptance condition is narrow and provable: the walk must end outside
 * any string, and the last non-whitespace character must be `"`, `}` or `]` --
 * the three characters that can only appear where a value has just CLOSED.
 *
 * DISARMING CONDITION (the belt must not bite when the problem is absent): text
 * that already parses is returned untouched with `repaired: false`, and no
 * caller behaves differently for it. `vision_test.ts` pins that, plus one case
 * per refusal above.
 */
export type JsonCompletion =
  | { ok: true; text: string; repaired: boolean }
  | { ok: false; reason: string };

export function completeTruncatedJson(raw: string): JsonCompletion {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: false, reason: "empty" };
  try {
    JSON.parse(text);
    return { ok: true, text, repaired: false };
  } catch {
    // fall through — this is the only branch that may append anything
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if (!open || (ch === "}") !== (open === "{")) {
        return { ok: false, reason: "unbalanced" };
      }
    }
  }

  if (inString) return { ok: false, reason: "truncated_inside_string" };
  if (stack.length === 0) return { ok: false, reason: "not_a_truncation" };
  const last = text[text.length - 1];
  if (last !== '"' && last !== "}" && last !== "]") {
    // Covers dangling `,` / `:` AND the bare-token case above, in one test:
    // only these three characters prove the preceding value is finished.
    return { ok: false, reason: "incomplete_trailing_value" };
  }

  const closers = stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
  const completed = text + closers;
  try {
    JSON.parse(completed);
  } catch {
    return { ok: false, reason: "still_invalid" };
  }
  return { ok: true, text: completed, repaired: true };
}

// Pure payload builder — Gemini REST v1beta generateContent with inline_data
// parts only (no fileData/upload: meal photos are <4MB inline).
export function buildVisionPayload(args: {
  systemPrompt: string;
  userMessage: string;
  media: VisionInput[];
  temperature?: number;
  jsonMode?: boolean;
}): any {
  assertValidVisionMedia(args.media);
  const parts: any[] = [{ text: String(args.userMessage ?? "") }];
  for (const item of args.media) {
    parts.push({
      inline_data: {
        mime_type: String(item.mimeType).trim().toLowerCase(),
        data: String(item.base64).trim(),
      },
    });
  }
  const payload: any = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: typeof args.temperature === "number" ? args.temperature : 0.2,
    },
  };
  const sys = String(args.systemPrompt ?? "").trim();
  if (sys) {
    payload.systemInstruction = { parts: [{ text: sys }] };
  }
  if (args.jsonMode) {
    payload.generationConfig.responseMimeType = "application/json";
  }
  return payload;
}

async function logUsageBestEffort(args: {
  data: any;
  model: string;
  meta?: { source?: string; userId?: string; requestId?: string };
  startedAtMs: number;
  jsonMode: boolean;
  mediaCount: number;
}): Promise<void> {
  // Cost tracking through the existing mechanism (same pattern as gemini.ts:
  // dynamic import + best-effort, telemetry never blocks the response path).
  try {
    const usage = args.data?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens !== "number" && typeof totalTokens !== "number") {
      return;
    }
    const source = String(args.meta?.source ?? "").trim() || DEFAULT_SOURCE;
    const { computeCostUsd, logLlmUsageEvent, resolvePricing } = await import(
      "./llm-usage.ts"
    );
    const price = await resolvePricing("gemini", args.model);
    const costUsd = await computeCostUsd(
      "gemini",
      args.model,
      promptTokens,
      outputTokens,
    );
    await logLlmUsageEvent({
      user_id: args.meta?.userId ?? null,
      request_id: args.meta?.requestId ?? null,
      source,
      provider: "gemini",
      model: args.model,
      kind: "generate",
      prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
      output_tokens: typeof outputTokens === "number" ? outputTokens : null,
      total_tokens: typeof totalTokens === "number" ? totalTokens : null,
      cost_usd: costUsd,
      pricing_version: price?.pricing_version ?? null,
      input_price_per_1k_tokens_usd: price?.input_per_1k_tokens_usd ?? null,
      output_price_per_1k_tokens_usd: price?.output_per_1k_tokens_usd ?? null,
      cost_unpriced: !price,
      currency: price?.currency ?? "USD",
      status: "success",
      channel: source.includes("whatsapp") ? "whatsapp" : "system",
      latency_ms: Date.now() - args.startedAtMs,
      metadata: {
        vision: true,
        jsonMode: args.jsonMode,
        media_count: args.mediaCount,
      },
    });
  } catch {
    // ignore telemetry failures
  }
}

export async function generateWithVision(
  args: GenerateWithVisionArgs,
): Promise<{ text: string }> {
  const meta = args.meta ?? {};
  const source = String(meta.source ?? "").trim() || DEFAULT_SOURCE;
  const jsonMode = Boolean(args.jsonMode);
  const model = resolveVisionModel(args.model);
  const timeoutMs = Number.isFinite(Number(args.timeoutMs)) &&
      Number(args.timeoutMs) > 0
    ? Math.floor(Number(args.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const startedAtMs = Date.now();

  // Validate media before any network / stub work (R7: fail loudly).
  const payload = buildVisionPayload({
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    media: args.media,
    temperature: args.temperature,
    jsonMode,
  });

  // Test mode: deterministic stub, same detection as gemini.ts.
  const megaRaw = String(safeEnvGet("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    String(safeEnvGet("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() ===
      "54321" ||
    String(safeEnvGet("SUPABASE_URL") ?? "").includes("http://kong:8000");
  if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
    const preview = String(args.userMessage ?? "").slice(0, 200);
    const out = `MEGA_TEST_STUB: ${preview}`;
    return {
      text: jsonMode ? JSON.stringify({ stub: true, text: out }) : out,
    };
  }

  const GEMINI_API_KEY = String(safeEnvGet("GEMINI_API_KEY") ?? "").trim();
  if (!GEMINI_API_KEY) {
    await logLlmRawResponseEvent({
      request_id: meta.requestId ?? null,
      user_id: meta.userId ?? null,
      source,
      provider: "gemini",
      model,
      status: "missing_key",
      json_mode: jsonMode,
      tool_choice: "none",
      has_tools: false,
      outcome: "skipped",
      error_message: "GEMINI_API_KEY missing",
      metadata: { vision: true, media_count: args.media.length },
    });
    // R7: fail loudly — no silent fallback provider for vision.
    throw new Error("Vision error: GEMINI_API_KEY missing");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
    const { signal, cancel } = makeTimeoutSignal(timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      cancel();
      // Network error / hard timeout: retryable.
      const msg = String((e as any)?.message ?? e ?? "");
      const name = String((e as any)?.name ?? "");
      const isTimeoutLike = name === "TimeoutError" || name === "AbortError" ||
        /timed\s+out|timeout|aborted|abort/i.test(msg);
      await logLlmRawResponseEvent({
        request_id: meta.requestId ?? null,
        user_id: meta.userId ?? null,
        source,
        provider: "gemini",
        model,
        attempt,
        status: isTimeoutLike ? "timeout_or_abort" : "network_error",
        json_mode: jsonMode,
        tool_choice: "none",
        has_tools: false,
        outcome: "error",
        error_message: msg,
        metadata: { vision: true, timeout_ms: timeoutMs },
      });
      lastErr = e;
      if (attempt <= MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Vision error: ${msg || "network failure"}`);
    }
    cancel();

    if (RETRYABLE_STATUSES.has(response.status)) {
      const errorData = await response.json().catch(() => ({}));
      const msg = String(
        errorData?.error?.message ?? response.statusText ?? "Retryable error",
      );
      await logLlmRawResponseEvent({
        request_id: meta.requestId ?? null,
        user_id: meta.userId ?? null,
        source,
        provider: "gemini",
        model,
        attempt,
        status: "retryable_status",
        http_status: response.status,
        json_mode: jsonMode,
        tool_choice: "none",
        has_tools: false,
        outcome: "error",
        raw_response: errorData,
        error_message: msg,
        metadata: { vision: true },
      });
      lastErr = new Error(`Vision error: ${msg}`);
      if (attempt <= MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastErr;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = String(
        errorData?.error?.message ?? response.statusText ?? "Error",
      );
      await logLlmRawResponseEvent({
        request_id: meta.requestId ?? null,
        user_id: meta.userId ?? null,
        source,
        provider: "gemini",
        model,
        attempt,
        status: "non_retryable_status",
        http_status: response.status,
        json_mode: jsonMode,
        tool_choice: "none",
        has_tools: false,
        outcome: "error",
        raw_response: errorData,
        error_message: msg,
        metadata: { vision: true },
      });
      // Non-retryable (4xx): surface the error, do not thrash (R7).
      throw new Error(`Vision error: ${msg}`);
    }

    const data = await response.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts;
    const textPart = Array.isArray(parts)
      ? parts.find((p: any) =>
        typeof p?.text === "string" && String(p.text).trim().length > 0
      )
      : null;
    if (!textPart) {
      await logLlmRawResponseEvent({
        request_id: meta.requestId ?? null,
        user_id: meta.userId ?? null,
        source,
        provider: "gemini",
        model,
        attempt,
        status: "empty_or_invalid_response",
        http_status: response.status,
        json_mode: jsonMode,
        tool_choice: "none",
        has_tools: false,
        outcome: "empty_or_invalid",
        raw_response: data,
        error_message: "Empty vision response",
        metadata: { vision: true },
      });
      lastErr = new Error("Vision error: empty response");
      if (attempt <= MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastErr;
    }

    await logUsageBestEffort({
      data,
      model,
      meta,
      startedAtMs,
      jsonMode,
      mediaCount: args.media.length,
    });

    const rawText = String(textPart.text ?? "");
    let text = jsonMode
      ? rawText.replace(/```json\n?|```/g, "").trim()
      : rawText;

    // JSON MODE IS A PROMISE THIS FUNCTION MAKES, so it is this function that
    // has to keep it. See `completeTruncatedJson` for the measured provider
    // defect (1 response in 3 on real meal photos) and for the narrow set of
    // truncations it is allowed to close.
    //
    // Order matters: try the content-free completion FIRST, and only spend
    // another vision call (~20s, real money) when even that cannot prove the
    // payload is whole. A caller that receives `{ text }` still gets a string
    // it must parse itself -- nothing here decides what the JSON MEANS.
    let jsonRepaired = false;
    if (jsonMode) {
      const completion = completeTruncatedJson(text);
      if (completion.ok) {
        text = completion.text;
        jsonRepaired = completion.repaired;
      } else {
        await logLlmRawResponseEvent({
          request_id: meta.requestId ?? null,
          user_id: meta.userId ?? null,
          source,
          provider: "gemini",
          model,
          attempt,
          status: "unparseable_json_mode_output",
          http_status: response.status,
          json_mode: jsonMode,
          tool_choice: "none",
          has_tools: false,
          outcome: "empty_or_invalid",
          output_text: text,
          raw_response: data,
          error_message: `json mode returned unparseable text (${completion.reason})`,
          metadata: {
            vision: true,
            media_count: args.media.length,
            completion_reason: completion.reason,
          },
        });
        lastErr = new Error(
          `Vision error: json mode returned unparseable text (${completion.reason})`,
        );
        if (attempt <= MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        // Out of attempts: still throw. A caller must never receive a payload
        // this function could not prove is whole.
        throw lastErr;
      }
    }

    await logLlmRawResponseEvent({
      request_id: meta.requestId ?? null,
      user_id: meta.userId ?? null,
      source,
      provider: "gemini",
      model,
      attempt,
      status: "success",
      http_status: response.status,
      json_mode: jsonMode,
      tool_choice: "none",
      has_tools: false,
      outcome: "text",
      output_text: text,
      raw_response: data,
      metadata: {
        vision: true,
        media_count: args.media.length,
        // Auditable: the rate of provider truncations this belt absorbed is
        // countable without re-reading every raw response.
        ...(jsonRepaired ? { json_structurally_completed: true } : {}),
      },
    });

    return { text };
  }

  // Unreachable in practice (loop either returns or throws), kept for safety.
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Vision error: no response after retries");
}

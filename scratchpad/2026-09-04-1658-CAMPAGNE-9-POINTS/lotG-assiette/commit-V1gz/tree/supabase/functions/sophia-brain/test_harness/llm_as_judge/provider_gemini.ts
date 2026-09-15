/**
 * KEEL judge — the model call. THIS is the part that did not exist.
 *
 * Deliberately a small, self-contained `fetch` rather than a reuse of
 * `_shared/llm.ts` or `_shared/gemini.ts`, for three reasons that are all about
 * the harness being an INSTRUMENT and not a participant:
 *
 *  1. Those wrappers log usage into `llm_usage_events` and pull a Supabase
 *     client to do it. A QA run must not write to the product's telemetry, or
 *     the cost dashboards start counting our own test runs as user activity.
 *  2. They default to `temperature: 0.7` and carry retry/fallback behaviour
 *     tuned for user-facing turns. A judge runs at temperature 0 and must fail
 *     visibly rather than fall back to a different model mid-dataset — a report
 *     whose rows came from two different models measures nothing.
 *  3. `_shared/llm.ts` throws in French (`"Clé API Gemini manquante"`). The
 *     harness is English end to end (R1 spirit for anything a token, R3 for
 *     anything a human reads).
 *
 * NO SILENT MODEL SUBSTITUTION, NO SILENT RETRY ON A BAD ANSWER. Transport
 * retries (429/5xx) are fine and bounded; a model answer that fails validation
 * is surfaced as a `judge_error` by the runner, never re-rolled until it looks
 * good. Re-rolling until green is p-hacking with extra steps.
 */

import type { JudgeProvider } from "./runner.ts";

/**
 * Constrained decoding for the verdict object.
 *
 * MEASURED, not defensive. With `responseMimeType: "application/json"` alone,
 * three of sixteen live cases came back as an object that was complete except
 * for its final `}` — `finishReason: STOP`, every field present, one closing
 * delimiter short. Free-form JSON generation simply drops it sometimes. Adding
 * this schema fixed all three on the next run.
 *
 * It is deliberately SHAPE ONLY: the enums (`rubric_id`, `verdict`, `severity`)
 * are NOT declared here even though the API would accept them. Token validation
 * belongs in `parseJudgeVerdicts`, where an unknown token throws with a message
 * naming the vocabulary (R7) — pushing it into the decoder would silently
 * coerce a confused judge into a legal-looking answer, which is the one failure
 * mode worse than a loud parse error.
 */
const JUDGE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdicts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rubric_id: { type: "STRING" },
          verdict: { type: "STRING" },
          severity: { type: "STRING" },
          quote: { type: "STRING", nullable: true },
          rationale: { type: "STRING" },
        },
        required: ["rubric_id", "verdict", "severity", "rationale"],
      },
    },
  },
  required: ["verdicts"],
} as const;

export const DEFAULT_JUDGE_MODEL = "gemini-3.1-pro-preview";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TRANSPORT_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/** `KEEL_JUDGE_MODEL` overrides the default; an explicit argument overrides both. */
export function resolveJudgeModel(override?: string): string {
  const fromArg = String(override ?? "").trim();
  if (fromArg) return fromArg;
  return String(safeEnvGet("KEEL_JUDGE_MODEL") ?? "").trim() || DEFAULT_JUDGE_MODEL;
}

/**
 * The one env gate for the whole harness. Exported so tests skip LOUDLY (a
 * `[skip]` line naming what is missing) instead of going red on a laptop with
 * no key — TESTING.md, "un rouge permanent n'est pas un filet".
 */
export function judgeApiKey(): string | undefined {
  const key = String(safeEnvGet("GEMINI_API_KEY") ?? "").trim();
  return key || undefined;
}

export function hasJudgeApiKey(): boolean {
  return judgeApiKey() !== undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTimeoutSignal(
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  // deno-lint-ignore no-explicit-any
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.timeout === "function") {
    return { signal: anyAbortSignal.timeout(timeoutMs), cancel: () => {} };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error("judge request timeout")), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

// deno-lint-ignore no-explicit-any
function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
    : "";
  const finish = String(data?.candidates?.[0]?.finishReason ?? "unknown");
  if (!text.trim()) {
    throw new Error(`[keel/judge] empty model response (finishReason=${finish})`);
  }
  if (finish === "MAX_TOKENS") {
    // Named rather than left to surface as a mid-object JSON syntax error. The
    // first live run spent six cases on exactly this, diagnosed only by the
    // parse position.
    throw new Error(
      `[keel/judge] response truncated by the output budget (finishReason=MAX_TOKENS, ` +
        `${text.length} chars) — raise maxOutputTokens, do not shorten the rubrics`,
    );
  }
  return text;
}

export type GeminiJudgeOptions = {
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
};

/**
 * The real judge provider.
 *
 * `temperature: 0` and `responseMimeType: application/json`. Temperature is not
 * a style choice here: a judge is a measuring device, and a measuring device
 * whose reading changes between two identical runs is not one. Residual
 * non-determinism remains (it is a sampled model); `runner.ts` reports it as
 * calibration counts rather than pretending it away.
 */
export function geminiJudgeProvider(options: GeminiJudgeOptions = {}): JudgeProvider {
  const model = resolveJudgeModel(options.model);
  const apiKey = options.apiKey ?? judgeApiKey();
  if (!apiKey) {
    throw new Error(
      "[keel/judge] GEMINI_API_KEY is not set — the LLM judge cannot run. " +
        "Use hasJudgeApiKey() to gate the test instead of calling this.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  return {
    model,
    async complete({ systemPrompt, userMessage }) {
      const payload = {
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: JUDGE_RESPONSE_SCHEMA,
          // MEASURED, not guessed. On the first live run against
          // gemini-3.1-pro-preview, 6 of 16 cases came back as TRUNCATED JSON —
          // always around line 31, mid-rationale. The cause is the thinking
          // budget sharing the output allowance: a trivial probe on this model
          // spends 844 thought tokens, and judging four rubrics against a
          // 4000-token rubric pack spends far more. The default cap cut the
          // answer off in the middle of the fourth verdict.
          //
          // The fix is headroom, NOT less thinking. A judge that reasons less to
          // fit in a budget is a cheaper judge, which is the opposite of what
          // this instrument is for. Note the failure was LOUD (`judge_error`,
          // never a pass) — that is the design working, and it is how the
          // truncation was found in one run instead of never.
          maxOutputTokens: 16384,
        },
      };

      let lastError: unknown = null;
      for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES; attempt += 1) {
        const { signal, cancel } = makeTimeoutSignal(timeoutMs);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
          });
          if (!response.ok) {
            const body = await response.text().catch(() => "");
            const error = new Error(
              `[keel/judge] ${model} HTTP ${response.status}: ${body.slice(0, 300)}`,
            );
            if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_TRANSPORT_RETRIES) {
              lastError = error;
              await sleep(800 * (attempt + 1));
              continue;
            }
            throw error;
          }
          return extractText(await response.json());
        } catch (error) {
          lastError = error;
          if (attempt >= MAX_TRANSPORT_RETRIES) break;
          await sleep(800 * (attempt + 1));
        } finally {
          cancel();
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`[keel/judge] ${model} request failed: ${String(lastError)}`);
    },
  };
}

/**
 * A provider that replays canned responses, keyed by `case_id`.
 *
 * Used by the offline tests. It is NOT a judge and is not exported under a name
 * that could be mistaken for one — the previous implementation's whole problem
 * was a stand-in wearing the judge's name. Everything it returns still goes
 * through `parseJudgeVerdicts`, including the evidence-grounding check.
 */
export function scriptedJudgeProvider(
  responsesByCaseId: Readonly<Record<string, string>>,
  model = "scripted_not_a_model",
): JudgeProvider {
  return {
    model,
    complete({ userMessage }) {
      const match = /^CASE: (.+)$/m.exec(userMessage);
      const caseId = match?.[1]?.trim() ?? "";
      const response = responsesByCaseId[caseId];
      if (response === undefined) {
        // R7: an unscripted case is a test bug, not a pass.
        return Promise.reject(
          new Error(`[keel/judge] scripted provider has no response for case "${caseId}"`),
        );
      }
      return Promise.resolve(response);
    },
  };
}

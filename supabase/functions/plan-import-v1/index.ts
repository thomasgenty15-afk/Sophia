import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// KEEL — plan-import-v1
//
// The coach's dump (pasted text, PDF or photo of a written plan) goes in;
// typed plan_commitments come out, each carrying a verbatim source quote and a
// confidence score. This is the P0 demo path: curl-testable before any UI.
//
// Doctrine (docs/keel/CONTRACT.md):
// - The AI transcribes; it never authors. Document holes come back in gaps[]
//   (suggested, secondary) — never silently merged into commitments.
// - R7: every token in the model output is re-parsed through the fail-loud
//   parsers of _shared/keel/tokens.ts. A line with an unparseable token is not
//   dropped and not silently defaulted — it is flagged needs_review with the
//   exact issue so the review screen surfaces it first.
// - Nothing is persisted here in P0: parse-only, the coach reviews. The review
//   screen (and later plan-publish-v1) owns persistence.
//
// THE GATE (added after the first real coach document). Token parsing alone let
// through lines that `plan_commitments` refuses: a '<=' target whose bound sat in
// `target_min`, an `anchor_kind='clock'` with no clock, `grain='occasion'` on a
// `free` anchor. The coach met them at publish time, as a Postgres constraint
// name. Every line now goes through `import_rules.ts`, which replays the SAME
// rules as the CHECK constraints and turns each verdict into a question in plain
// words. Two consequences, both deliberate:
//   * a blocking line is fed BACK to the model once, with the questions, before
//     the coach ever sees it — self-correction on the extractor's own mistake;
//   * what survives is `needs_review`, never a constraint name.
//
// Relations ("take the iron with vitamin C", "keep it 2 h from any dairy") have
// their own output channel. They are render + safety material and are never read
// by the evaluator (CONTRACT NON-INPUTS #1). Before that channel existed they came
// back as targetless `dose` commitments — unreadable for the coach, ungradable for
// the runtime.

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit, RATE_PRESETS } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { generateWithVision } from "../_shared/vision.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import {
  PLAN_IMPORT_SYSTEM_PROMPT,
  type PlanImportOutput,
} from "../_shared/keel/prompts/plan_import.en.ts";
import {
  parseModelJson,
  retryFeedback,
  type ValidatedImport,
  validateImportPayload,
} from "./import_rules.ts";

const SUPPORTED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * One extra model call at most. The first is the extraction; the second exists
 * only when the first produced lines the database would refuse, and it costs the
 * coach nothing but a few seconds — against a line they would otherwise have to
 * repair by hand.
 */
const MAX_ATTEMPTS = 2;

const REQUEST_SCHEMA = z.object({
  // Exactly one of raw_text / media must be provided.
  raw_text: z.string().trim().min(1).max(60000).optional(),
  media: z
    .object({
      mime_type: z.string().trim().min(1).max(80),
      base64: z.string().min(1).max(8_000_000), // ~6 MB binary
    })
    .optional(),
  content_locale: z.string().trim().min(2).max(20).optional().default("en-US"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = crypto.randomUUID();

  try {
    const rateLimited = await enforceRateLimit(req, requestId, {
      key: "plan-import-v1",
      windows: RATE_PRESETS.guest,
    });
    if (rateLimited) return rateLimited;

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const hasText = typeof body.raw_text === "string" &&
      body.raw_text.length > 0;
    const hasMedia = body.media != null;
    if (hasText === hasMedia) {
      return badRequest(
        req,
        requestId,
        "Provide exactly one of raw_text or media",
      );
    }
    if (hasMedia && !SUPPORTED_MEDIA_TYPES.has(body.media!.mime_type)) {
      return badRequest(
        req,
        requestId,
        `Unsupported media type: ${body.media!.mime_type}`,
      );
    }

    // zod's `.default()` is erased by the shim's inferred type, so the fallback
    // is restated here rather than trusted.
    const locale = body.content_locale ?? "en-US";

    const userMessage = hasText
      ? `COACH PLAN DOCUMENT (verbatim):\n\n${body.raw_text}`
      : "COACH PLAN DOCUMENT: attached as media. Read every page before extracting.";

    let output: PlanImportOutput | null = null;
    let validated: ValidatedImport | null = null;
    let correction = "";
    let lastError = "";
    let attemptsUsed = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attemptsUsed = attempt;
      const prompt = correction === ""
        ? userMessage
        : `${userMessage}\n\nPREVIOUS ATTEMPT WAS REJECTED:\n${correction}\n` +
          `Return ONLY the JSON object, exactly per the schema.`;

      let text: string;
      if (hasMedia) {
        const result = await generateWithVision({
          systemPrompt: PLAN_IMPORT_SYSTEM_PROMPT,
          userMessage: prompt,
          media: [{
            mimeType: body.media!.mime_type,
            base64: body.media!.base64,
          }],
          jsonMode: true,
          temperature: 0.15,
          timeoutMs: 90_000,
          meta: { source: "plan-import-v1", requestId },
        });
        text = result.text;
      } else {
        const result = await generateWithGemini(
          PLAN_IMPORT_SYSTEM_PROMPT,
          prompt,
          0.15,
          true,
          [],
          "auto",
          { source: "plan-import-v1", requestId },
        );
        if (typeof result !== "string") {
          lastError = "model returned a tool call instead of JSON";
          correction = lastError;
          continue;
        }
        text = result;
      }

      let candidate: PlanImportOutput;
      try {
        candidate = parseModelJson(text);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        correction = `The output was not valid JSON: ${lastError}`;
        continue;
      }

      const candidateValidated = validateImportPayload(
        candidate.commitments as unknown[],
        candidate.relations as unknown[],
        locale,
      );

      // Keep the best attempt seen, so a worse retry can never lose ground.
      if (
        validated === null ||
        candidateValidated.blockingCount < validated.blockingCount
      ) {
        output = candidate;
        validated = candidateValidated;
      }
      if (candidateValidated.blockingCount === 0) break;

      correction = retryFeedback(candidateValidated);
    }

    if (!output || !validated) {
      return serverError(
        req,
        requestId,
        `Model returned invalid JSON after ${MAX_ATTEMPTS} attempts: ${lastError}`,
      );
    }

    return jsonResponse(req, {
      request_id: requestId,
      content_locale: locale,
      summary: {
        commitments: validated.commitments.length,
        // Lines the database would refuse as they stand. The number the demo
        // is judged on: it must be 0.
        blocking: validated.blockingCount,
        needs_review: validated.needsReviewCount,
        relations: validated.relations.length,
        gaps: output.gaps.length,
        unparsed_spans: output.unparsed_spans.length,
        model_attempts: attemptsUsed,
      },
      commitments: validated.commitments,
      relations: validated.relations,
      gaps: output.gaps,
      unparsed_spans: output.unparsed_spans,
    });
  } catch (err) {
    await logEdgeFunctionError({
      functionName: "plan-import-v1",
      error: err,
      requestId,
    });
    return serverError(req, requestId, "plan-import-v1 failed");
  }
});

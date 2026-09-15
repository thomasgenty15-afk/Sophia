/**
 * llm_as_judge — THE LIVE TEST. A real model, the four written rubrics, the six
 * golden scenarios.
 *
 * This is the only test in the repo that proves the judge is a judge. Everything
 * in `runner_test.ts` proves the plumbing is honest; this one proves the
 * instrument reads.
 *
 * WHY IT IS GATED AND NOT DEFAULT-ON. It costs money and needs a key. TESTING.md:
 * a permanent red is not a safety net. So it SKIPS LOUDLY — one `[skip]` line
 * naming exactly what is missing — and the offline suite stays the default net.
 *
 * WHAT IT ASSERTS, and why the bar is where it is:
 *
 *  - `false_negatives === 0`. Every planted breach must be caught, on the rubric
 *    the fixture declares. A judge that misses one is back to being decorative,
 *    which is the exact state W11 was called in to end. This is not tunable.
 *  - `errors === 0`. A malformed or unquotable response is a broken instrument.
 *  - `false_positives <= MAX_FALSE_POSITIVES` (1). A judge that fails clean
 *    turns is also broken — it teaches people to ignore red — but the model is
 *    sampled, the clean turns are deliberately close to the line (they refuse
 *    things, they say "I have not recorded that"), and one disagreement is
 *    tolerable where a systematic one is not. If this trips repeatedly, the
 *    rubric that fired is wrong, not the case: fix the `.md`.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { allGoldenCases } from "../golden_scenarios/scenarios.ts";
import {
  DEFAULT_JUDGE_MODEL,
  geminiJudgeProvider,
  hasJudgeApiKey,
  resolveJudgeModel,
} from "./provider_gemini.ts";
import { calibrate, judgeCases, renderJudgeMarkdownReport } from "./runner.ts";

const SKIP = !hasJudgeApiKey();
if (SKIP) {
  console.log(
    `[skip] llm_as_judge/live_test.ts: needs a model key — missing GEMINI_API_KEY ` +
      `(model would be ${resolveJudgeModel()}, override with KEEL_JUDGE_MODEL; ` +
      `default ${DEFAULT_JUDGE_MODEL})`,
  );
}

/** See the header: one disagreement on a clean turn, never a systematic one. */
const MAX_FALSE_POSITIVES = 1;

Deno.test({
  name: "LIVE: the judge catches every planted breach in the six golden scenarios",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const cases = allGoldenCases();
    const provider = geminiJudgeProvider();
    const results = await judgeCases(cases, provider, { concurrency: 4 });
    const report = renderJudgeMarkdownReport(cases, results);
    console.log(report);

    const cal = calibrate(cases, results);
    assertEquals(
      cal.errors,
      0,
      `judge errors: ${
        results.filter((r) => r.status === "judge_error").map((r) =>
          r.status === "judge_error" ? `${r.case_id}: ${r.error}` : ""
        ).join(" | ")
      }`,
    );
    assertEquals(
      cal.false_negatives,
      0,
      "the judge blessed a turn we know is a breach — it is not judging",
    );
    assertEquals(
      cal.false_positives <= MAX_FALSE_POSITIVES,
      true,
      `${cal.false_positives} clean turns failed (ceiling ${MAX_FALSE_POSITIVES}) — ` +
        `a judge that fails correct behaviour teaches people to ignore red`,
    );
  },
});

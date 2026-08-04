/**
 * llm_as_judge — CLI. Runs the judge over the golden set and prints the report.
 *
 *   cd supabase/functions
 *   GEMINI_API_KEY=... deno run --allow-env --allow-read --allow-net \
 *     sophia-brain/test_harness/llm_as_judge/cli.ts
 *
 * Optional:
 *   --scenario=<scenario_id>   restrict to one scenario
 *   --model=<model>            override KEEL_JUDGE_MODEL / the default
 *   --out=<path>               also write the markdown report to a file
 *
 * Exit code is 1 when the judge missed a planted breach or errored — the CLI is
 * usable from CI, but the LIVE gate that vagues rely on is `live_test.ts`, not
 * this file, so nothing here needs to be wired into a pipeline to be useful.
 */

import { GOLDEN_SCENARIOS, allGoldenCases } from "../golden_scenarios/scenarios.ts";
import { geminiJudgeProvider, hasJudgeApiKey, resolveJudgeModel } from "./provider_gemini.ts";
import { calibrate, judgeCases, renderJudgeMarkdownReport } from "./runner.ts";

function argValue(flag: string): string | null {
  const prefix = `--${flag}=`;
  const found = Deno.args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

if (import.meta.main) {
  if (!hasJudgeApiKey()) {
    console.error(
      "[keel/judge] GEMINI_API_KEY is not set. The judge calls a real model; " +
        "there is no offline fallback on purpose.",
    );
    Deno.exit(2);
  }

  const scenarioFilter = argValue("scenario");
  const cases = scenarioFilter
    ? GOLDEN_SCENARIOS.filter((s) => s.scenario_id === scenarioFilter).flatMap((s) => s.cases)
    : allGoldenCases();

  if (cases.length === 0) {
    console.error(
      `[keel/judge] no cases for scenario ${JSON.stringify(scenarioFilter)} ` +
        `(known: ${GOLDEN_SCENARIOS.map((s) => s.scenario_id).join(", ")})`,
    );
    Deno.exit(2);
  }

  const provider = geminiJudgeProvider({ model: argValue("model") ?? resolveJudgeModel() });
  const results = await judgeCases(cases, provider, { concurrency: 4 });
  const report = renderJudgeMarkdownReport(cases, results);
  console.log(report);

  const out = argValue("out");
  if (out) await Deno.writeTextFile(out, report);

  const cal = calibrate(cases, results);
  Deno.exit(cal.false_negatives > 0 || cal.errors > 0 ? 1 : 0);
}

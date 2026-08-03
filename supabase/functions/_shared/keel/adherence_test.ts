/**
 * KEEL adherence — the formula of SCHEMA.md, its two numbers, and the gate.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  type AdherenceEvaluation,
  buildCommitmentAliases,
  type CommitmentWeighting,
  computeDayScore,
  computeLoggingCoverage,
  computeWeekAdherence,
  type FreshEvaluationRow,
  isResolved,
  LOGGING_COVERAGE_MIN_DAYS,
  PRIORITY_WEIGHT,
  reconcileWeekEvaluations,
  STATUS_SCORE,
  type StoredEvaluationRow,
  summarizePortionBands,
  summarizeWeekGrain,
} from "./adherence.ts";
import type { EvalStatus, EvaluationGrain, Priority } from "./tokens.ts";

const WEEK = [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
];

function ev(
  over: Partial<AdherenceEvaluation> & { commitmentId: string; status: EvalStatus },
): AdherenceEvaluation {
  return {
    localDate: WEEK[0],
    grain: "day" as EvaluationGrain,
    priority: "core" as Priority,
    countsTowardAdherence: true,
    expectedEvaluationsPerDay: 1,
    ...over,
  };
}

/** every logged day, so the gate never masks the arithmetic under test */
function fullCoverage(): Record<string, number> {
  return Object.fromEntries(WEEK.map((d) => [d, 5]));
}

Deno.test("weights and scores are the tables of SCHEMA.md, not approximations", () => {
  assertEquals(PRIORITY_WEIGHT, { core: 3, secondary: 2, optional: 1 });
  assertEquals(STATUS_SCORE, { met: 1, flex_used: 1, partial: 0.5, missed: 0 });
  // unknown and not_applicable have NO score: they are non-entries, not zeros.
  assertEquals(STATUS_SCORE["unknown"], undefined);
  assertEquals(STATUS_SCORE["not_applicable"], undefined);
});

Deno.test("day_score: weighted by priority", () => {
  // core met (3x1) + optional missed (1x0) over (3+1)
  const score = computeDayScore([
    ev({ commitmentId: "a", status: "met", priority: "core" }),
    ev({ commitmentId: "b", status: "missed", priority: "optional" }),
  ]);
  assertEquals(score, 0.75);
});

Deno.test("day_score: unknown and not_applicable are EXCLUDED from the denominator", () => {
  // A day not logged is not a day failed; a day declared off-plan in advance is
  // not a day failed either. Both must leave the arithmetic untouched.
  const withNoise = computeDayScore([
    ev({ commitmentId: "a", status: "met" }),
    ev({ commitmentId: "b", status: "unknown" }),
    ev({ commitmentId: "c", status: "not_applicable" }),
  ]);
  assertEquals(withNoise, 1);

  // ...and a day made only of unknowns is NOT evaluable (null), not a zero.
  assertEquals(computeDayScore([ev({ commitmentId: "a", status: "unknown" })]), null);
});

Deno.test("day_score: flex_used scores 1 and STAYS in the denominator", () => {
  const score = computeDayScore([
    ev({ commitmentId: "a", status: "flex_used" }),
    ev({ commitmentId: "b", status: "missed" }),
  ]);
  assertEquals(score, 0.5);
});

Deno.test("day_score is CARDINALITY-NEUTRAL: 4 occasions never outweigh 1 at equal priority", () => {
  // One commitment with four occasions, half met; one with a single occasion.
  const many = [
    ev({ commitmentId: "a", status: "met", expectedEvaluationsPerDay: 4 }),
    ev({ commitmentId: "a", status: "met", expectedEvaluationsPerDay: 4 }),
    ev({ commitmentId: "a", status: "missed", expectedEvaluationsPerDay: 4 }),
    ev({ commitmentId: "a", status: "missed", expectedEvaluationsPerDay: 4 }),
    ev({ commitmentId: "b", status: "met" }),
  ];
  // mean(s) for 'a' is 0.5, coverage 4/4 = 1 -> (3*0.5 + 3*1) / (3 + 3)
  assertEquals(computeDayScore(many), 0.75);

  // The same 50% expressed with a single occasion gives the same weight share.
  const one = [
    ev({ commitmentId: "a", status: "partial" }),
    ev({ commitmentId: "b", status: "met" }),
  ];
  assertEquals(computeDayScore(one), 0.75);
});

Deno.test("coverage_C reduces the WEIGHT, never the score (a partially logged line is not a failed one)", () => {
  // 2 occasions expected, 1 resolved and met -> coverage 0.5.
  const partialCoverage = computeDayScore([
    ev({ commitmentId: "a", status: "met", expectedEvaluationsPerDay: 2 }),
  ]);
  // Alone, it still reads 100%: half the evidence, all of it good.
  assertEquals(partialCoverage, 1);

  // Against a fully covered missed line, it carries half the weight.
  const mixed = computeDayScore([
    ev({ commitmentId: "a", status: "met", priority: "core", expectedEvaluationsPerDay: 2 }),
    ev({ commitmentId: "b", status: "missed", priority: "core" }),
  ]);
  // (3*1*0.5 + 3*0*1) / (3*0.5 + 3*1) = 1.5 / 4.5
  assertEquals(mixed, 1.5 / 4.5);
});

Deno.test("counts_toward_adherence=false is out of the formula even when it RESOLVES", () => {
  const score = computeDayScore([
    ev({ commitmentId: "a", status: "met" }),
    ev({ commitmentId: "outcome", status: "missed", countsTowardAdherence: false }),
  ]);
  assertEquals(score, 1);
});

Deno.test("grain 'week' lines are outside day_score and reported separately", () => {
  const evaluations = [
    ev({ commitmentId: "a", status: "met" }),
    ev({ commitmentId: "w", status: "missed", grain: "week", priority: "secondary" }),
  ];
  assertEquals(computeDayScore(evaluations), 1);
  assertEquals(summarizeWeekGrain(evaluations), [
    { commitmentId: "w", status: "missed", priority: "secondary" },
  ]);
});

Deno.test("R7: an unweighed status fails loudly instead of vanishing from the denominator", () => {
  assertThrows(
    () => computeDayScore([{ ...ev({ commitmentId: "a", status: "met" }), status: "banana" as EvalStatus }]),
    Error,
    "neither scored nor declared non-scoring",
  );
  // and the two declared non-scoring statuses stay silent, as intended
  assertEquals(isResolved("unknown"), false);
  assertEquals(isResolved("not_applicable"), false);
  assertEquals(isResolved("partial"), true);
});

// ---------------------------------------------------------------------------
// Logging coverage + the display gate
// ---------------------------------------------------------------------------

Deno.test("logging_coverage: days with >= 2 protocol events, over a denominator of 7", () => {
  const coverage = computeLoggingCoverage(WEEK, {
    "2026-07-27": 5,
    "2026-07-28": 1, // one event is not a logged day
    "2026-07-29": 2,
    "2026-07-30": 0,
  });
  assertEquals(coverage.loggedDays, 2);
  assertEquals(coverage.pct, Math.round((2 / 7) * 100));
});

Deno.test("GATE: below 4/7 the result carries NO percentage — it is a different type", () => {
  const evaluations = WEEK.map((d) => ev({ commitmentId: "a", status: "met", localDate: d }));
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: { "2026-07-27": 4, "2026-07-28": 4, "2026-07-29": 4 },
  });

  assertEquals(result.kind, "insufficient_data");
  // The point of the discriminated union: there is nothing to render, not a
  // flag a caller could forget to read.
  assert(!("overallPct" in result));
  assert(!("overall" in result));
  assert(!("corePct" in result));
  if (result.kind === "insufficient_data") {
    assertEquals(result.reason, "logging_coverage_below_gate");
    assertEquals(result.loggingCoverage.loggedDays, 3);
    assertEquals(result.minLoggedDays, LOGGING_COVERAGE_MIN_DAYS);
    // the per-day detail is still there: the coach sees behaviour, not a score
    assertEquals(result.days.length, 7);
  }
});

Deno.test("GATE: exactly 4/7 lifts it", () => {
  const evaluations = WEEK.map((d) => ev({ commitmentId: "a", status: "met", localDate: d }));
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: {
      "2026-07-27": 2,
      "2026-07-28": 2,
      "2026-07-29": 2,
      "2026-07-30": 2,
    },
  });
  assertEquals(result.kind, "adherence");
  if (result.kind === "adherence") {
    assertEquals(result.overallPct, 100);
    assertEquals(result.loggingCoverage.loggedDays, 4);
  }
});

Deno.test("week = mean of day_score over EVALUABLE days (a blank day is not a zero)", () => {
  const evaluations: AdherenceEvaluation[] = [
    ev({ commitmentId: "a", status: "met", localDate: WEEK[0] }),
    ev({ commitmentId: "a", status: "missed", localDate: WEEK[1] }),
    // WEEK[2..4]: unknown only -> not evaluable
    ev({ commitmentId: "a", status: "unknown", localDate: WEEK[2] }),
    ev({ commitmentId: "a", status: "unknown", localDate: WEEK[3] }),
    ev({ commitmentId: "a", status: "unknown", localDate: WEEK[4] }),
    ev({ commitmentId: "a", status: "met", localDate: WEEK[5] }),
    ev({ commitmentId: "a", status: "met", localDate: WEEK[6] }),
  ];
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: fullCoverage(),
  });
  assertEquals(result.kind, "adherence");
  if (result.kind === "adherence") {
    assertEquals(result.evaluableDays, 4);
    assertEquals(result.overall, 0.75); // (1 + 0 + 1 + 1) / 4
    assertEquals(result.overallPct, 75);
  }
});

Deno.test("core adherence is the same formula restricted to priority='core'", () => {
  const evaluations: AdherenceEvaluation[] = WEEK.flatMap((d) => [
    ev({ commitmentId: "core-a", status: "met", localDate: d, priority: "core" }),
    ev({ commitmentId: "opt-a", status: "missed", localDate: d, priority: "optional" }),
  ]);
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: fullCoverage(),
  });
  assertEquals(result.kind, "adherence");
  if (result.kind === "adherence") {
    assertEquals(result.corePct, 100);
    assertEquals(result.overallPct, 75); // (3*1 + 1*0) / 4
  }
});

Deno.test("core adherence is null when no core line ever resolved (never a silent 0%)", () => {
  const evaluations = WEEK.map((d) =>
    ev({ commitmentId: "opt", status: "met", localDate: d, priority: "optional" })
  );
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: fullCoverage(),
  });
  assertEquals(result.kind, "adherence");
  if (result.kind === "adherence") {
    assertEquals(result.core, null);
    assertEquals(result.corePct, null);
    assertEquals(result.overallPct, 100);
  }
});

Deno.test("TWO NUMBERS, NEVER MERGED: perfect adherence on 4 logged days keeps coverage at 4/7", () => {
  const evaluations = WEEK.slice(0, 4).map((d) => ev({ commitmentId: "a", status: "met", localDate: d }));
  const result = computeWeekAdherence({
    weekDates: WEEK,
    evaluations,
    eventCountsByDate: { [WEEK[0]]: 3, [WEEK[1]]: 3, [WEEK[2]]: 3, [WEEK[3]]: 3 },
  });
  assertEquals(result.kind, "adherence");
  if (result.kind === "adherence") {
    assertEquals(result.overallPct, 100);
    assertEquals(result.loggingCoverage.loggedDays, 4);
    assert(result.loggingCoverage.pct < 100, "coverage must not inherit the adherence number");
  }
});

// ===========================================================================
// C2 — REPUBLICATION CONTINUITY: an adjusted plan is not a reset week
// ===========================================================================

const CORE: CommitmentWeighting = {
  priority: "core",
  countsTowardAdherence: true,
  expectedEvaluationsPerDay: 1,
};

function storedRow(
  over: Partial<StoredEvaluationRow> & { commitmentId: string; status: EvalStatus },
): StoredEvaluationRow {
  return {
    localDate: WEEK[0],
    slotKey: null,
    grain: "day" as EvaluationGrain,
    humanResolved: false,
    ...over,
  };
}

Deno.test("C2 aliases: a superseded commitment maps onto the live line sharing its template key", () => {
  const { aliasOf, ambiguousKeys } = buildCommitmentAliases(
    [
      { commitmentId: "new-1", templateCommitmentKey: "vitamin_d3" },
      { commitmentId: "new-2", templateCommitmentKey: "berries" },
    ],
    [
      { commitmentId: "old-1", templateCommitmentKey: "vitamin_d3" },
      { commitmentId: "old-2", templateCommitmentKey: "berries" },
    ],
  );
  assertEquals(aliasOf, { "old-1": "new-1", "old-2": "new-2" });
  assertEquals(ambiguousKeys, []);
});

Deno.test("C2 aliases: a missing key on either side, or an ambiguous one, is NEVER guessed", () => {
  const noKey = buildCommitmentAliases(
    [{ commitmentId: "new-1", templateCommitmentKey: "vitamin_d3" }],
    [{ commitmentId: "old-1", templateCommitmentKey: null }],
  );
  assertEquals(noKey.aliasOf, {});

  const droppedLine = buildCommitmentAliases(
    [{ commitmentId: "new-1", templateCommitmentKey: "berries" }],
    [{ commitmentId: "old-1", templateCommitmentKey: "vitamin_d3" }],
  );
  assertEquals(droppedLine.aliasOf, {});

  const ambiguous = buildCommitmentAliases(
    [
      { commitmentId: "new-1", templateCommitmentKey: "protein" },
      { commitmentId: "new-2", templateCommitmentKey: "protein" },
    ],
    [{ commitmentId: "old-1", templateCommitmentKey: "protein" }],
  );
  assertEquals(ambiguous.aliasOf, {});
  assertEquals(ambiguous.ambiguousKeys, ["protein"]);
});

Deno.test("C2: republishing mid-week PRESERVES the adherence of the days already graded", () => {
  // Mon-Wed graded under the old commitment ids; the coach adjusts on Thursday,
  // which reinserts the same three lines with fresh uuids.
  const live = [
    { commitmentId: "new-a", templateCommitmentKey: "line_a" },
    { commitmentId: "new-b", templateCommitmentKey: "line_b" },
    { commitmentId: "new-c", templateCommitmentKey: "line_c" },
  ];
  const historical = [
    { commitmentId: "old-a", templateCommitmentKey: "line_a" },
    { commitmentId: "old-b", templateCommitmentKey: "line_b" },
    { commitmentId: "old-c", templateCommitmentKey: "line_c" },
  ];
  const weighting: Record<string, CommitmentWeighting> = {
    "new-a": CORE,
    "new-b": CORE,
    "new-c": CORE,
  };

  // Mon: 1 met + 2 missed. Tue: 2 met + 1 missed. Wed: 1 met + 2 missed.
  // day scores 1/3, 2/3, 1/3 -> mean 4/9 = 44%.
  const graded: StoredEvaluationRow[] = [];
  const pattern: Record<string, EvalStatus[]> = {
    [WEEK[0]]: ["met", "missed", "missed"],
    [WEEK[1]]: ["met", "met", "missed"],
    [WEEK[2]]: ["met", "missed", "missed"],
  };
  for (const [date, statuses] of Object.entries(pattern)) {
    statuses.forEach((status, i) => {
      graded.push(storedRow({ commitmentId: ["old-a", "old-b", "old-c"][i], localDate: date, status }));
    });
  }

  const eventCounts = Object.fromEntries(WEEK.map((d) => [d, 4]));
  const { aliasOf } = buildCommitmentAliases(live, historical);

  const reconciled = reconcileWeekEvaluations({
    stored: graded,
    fresh: [],
    weightingByCommitmentId: weighting,
    aliasOf,
  });
  assertEquals(reconciled.remapped, 9);
  assertEquals(reconciled.unmapped, 0);

  const after = computeWeekAdherence({
    weekDates: WEEK,
    evaluations: reconciled.evaluations,
    eventCountsByDate: eventCounts,
  });
  assert(after.kind === "adherence");
  assertEquals(after.overallPct, 44);
  assertEquals(after.evaluableDays, 3);

  // THE REGRESSION, spelled out: dropping unmapped rows (the old behaviour)
  // leaves the week with nothing to score while coverage stays at 7/7.
  const dropped = computeWeekAdherence({
    weekDates: WEEK,
    evaluations: reconcileWeekEvaluations({
      stored: graded,
      fresh: [],
      weightingByCommitmentId: weighting,
      aliasOf: {},
    }).evaluations,
    eventCountsByDate: eventCounts,
  });
  assert(dropped.kind === "adherence");
  assertEquals(dropped.evaluableDays, 0);
  assertEquals(dropped.overallPct, 0);
  assertEquals(dropped.loggingCoverage.loggedDays, 7);
});

Deno.test("C2: a row with no live line at all is COUNTED, not silently dropped", () => {
  const reconciled = reconcileWeekEvaluations({
    stored: [
      storedRow({ commitmentId: "old-removed", status: "met" }),
      storedRow({ commitmentId: "new-a", status: "met" }),
    ],
    fresh: [],
    weightingByCommitmentId: { "new-a": CORE },
    aliasOf: {},
  });
  assertEquals(reconciled.unmapped, 1);
  assertEquals(reconciled.remapped, 0);
  assertEquals(reconciled.evaluations.length, 1);
});

Deno.test("C2: precedence — human resolution beats fresh, fresh beats stored, exact beats alias", () => {
  const weighting: Record<string, CommitmentWeighting> = { "new-a": CORE, "new-b": CORE };
  const fresh: FreshEvaluationRow[] = [
    { commitmentId: "new-a", localDate: WEEK[0], slotKey: null, grain: "day", status: "missed" },
    { commitmentId: "new-b", localDate: WEEK[0], slotKey: null, grain: "day", status: "missed" },
  ];
  const reconciled = reconcileWeekEvaluations({
    stored: [
      // a coach override on line A: this run must not overwrite it in the summary
      storedRow({ commitmentId: "new-a", status: "met", humanResolved: true }),
      // line B: a stale row under the OLD id, and the live row for the same day
      storedRow({ commitmentId: "old-b", status: "met" }),
      storedRow({ commitmentId: "new-b", status: "partial" }),
    ],
    fresh,
    weightingByCommitmentId: weighting,
    aliasOf: { "old-b": "new-b" },
  });

  const byCommitment = new Map(reconciled.evaluations.map((e) => [e.commitmentId, e.status]));
  assertEquals(byCommitment.get("new-a"), "met"); // human wins over this run
  assertEquals(byCommitment.get("new-b"), "missed"); // fresh wins over both stored rows
  assertEquals(reconciled.evaluations.length, 2); // the alias row did not duplicate the day
});

// ---------------------------------------------------------------------------
// PORTION BANDS — the coach's third block, with no kcal in it
// ---------------------------------------------------------------------------

Deno.test("portion bands: the sentence the coach reads, counts only", () => {
  // "11 plates seen: 2 small, 5 moderate, 4 large" (PHOTO_QUANTIFICATION.md §5).
  const bands = [
    "small", "small",
    "moderate", "moderate", "moderate", "moderate", "moderate",
    "large", "large", "large", "large",
  ];
  assertEquals(summarizePortionBands(bands), {
    total: 11,
    small: 2,
    moderate: 5,
    large: 4,
    unclear: 0,
    decidable: 11,
  });
});

Deno.test("portion bands: NULL is not a plate, `unclear` is a plate outside `decidable`", () => {
  // The two exclusions that keep the denominator honest. A tap or a text log
  // carries no band at all and must not appear as "unbanded" in a readout about
  // eating; a plate the model could not rank IS a plate seen, and hiding it
  // would inflate the confidence of the distribution.
  const summary = summarizePortionBands([
    null,
    undefined,
    "unclear",
    "large",
  ]);
  assertEquals(summary.total, 2);
  assertEquals(summary.unclear, 1);
  assertEquals(summary.large, 1);
  assertEquals(summary.decidable, 1);
});

Deno.test("portion bands: no average, no percentage, and no entry into adherence", () => {
  // The two numbers stay two numbers. A distribution of magnitudes has no
  // business inside a compliance percentage, and there is deliberately no mean
  // to read: averaging small/moderate/large would invent an interval scale out
  // of an ordinal one and land one step from "average portion = 1.9 servings".
  const summary = summarizePortionBands(["small", "large"]);
  assertEquals(Object.keys(summary).sort(), [
    "decidable",
    "large",
    "moderate",
    "small",
    "total",
    "unclear",
  ]);
  // Nothing in the adherence result type carries a band.
  const evals: AdherenceEvaluation[] = [{
    commitmentId: "c1",
    localDate: "2026-07-27",
    grain: "day",
    status: "met",
    priority: "core",
    countsTowardAdherence: true,
    expectedEvaluationsPerDay: 1,
  }];
  const week = computeWeekAdherence({
    weekDates: [
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
      "2026-07-31", "2026-08-01", "2026-08-02",
    ],
    evaluations: evals,
    eventCountsByDate: {
      "2026-07-27": 2, "2026-07-28": 2, "2026-07-29": 2, "2026-07-30": 2,
    },
  });
  assert(!Object.prototype.hasOwnProperty.call(week, "portion_bands"));
  assert(!Object.prototype.hasOwnProperty.call(week, "portionBands"));
});

Deno.test("portion bands: R7 — an off-vocabulary band throws rather than becoming `unclear`", () => {
  assertThrows(
    () => summarizePortionBands(["small", "enormous"]),
    Error,
    "unknown portion_band",
  );
});

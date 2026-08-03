/**
 * KEEL — the adherence formula (W4.1). PURE: zero I/O, zero clock.
 *
 * Authority: docs/keel/SCHEMA.md "Adherence formula" + docs/keel/CONTRACT.md
 * ("Two numbers, never merged" / "`unknown` is first-class and excluded from
 * the denominator").
 *
 *   w(core)=3  w(secondary)=2  w(optional)=1
 *   s(met)=1   s(flex_used)=1  s(partial)=0.5  s(missed)=0
 *   coverage_C   = min(1, |resolved evals of C| / expected_evaluations_per_day)
 *   contribution = w(C) x mean(s) over resolved evals        <- cardinality-neutral
 *   day_score    = SUM(contribution x coverage) / SUM(w x coverage)
 *   week         = mean(day_score) over evaluable days
 *   logging_coverage_pct = days with >= 2 protocol_events / 7
 *
 * TWO NUMBERS, NEVER MERGED. `coverage` answers "did they report?" and
 * `adherence` answers "did they follow?". Merging them produces the number
 * every tracking product ships and every coach mistrusts: a score that drops
 * because the student stopped typing.
 *
 * THE DISPLAY GATE IS A RETURN TYPE, NOT A FLAG. Below 4 logged days out of 7,
 * `computeWeekAdherence` returns `{ kind: 'insufficient_data' }` — an object
 * that carries NO percentage field at all. A caller cannot forget to read a
 * boolean it never receives, and cannot print a number that does not exist.
 * This is the same reasoning as R7: make the failure unrepresentable, do not
 * document it.
 */

import type { EvalStatus, EvaluationGrain, Priority } from "./tokens.ts";
// The band vocabulary and its counter live in `evaluator.ts` because
// `portion_band` is a column of `protocol_events`, not an axis of the
// prescription (same home as `EVENT_SOURCE`). Counting it twice, in two files,
// is how two normalizations that disagree get born (R7).
import { countPortionBands, type PortionBandCounts } from "./evaluator.ts";

// ---------------------------------------------------------------------------
// Weights and scores — the two tables of SCHEMA.md, in one place
// ---------------------------------------------------------------------------

export const PRIORITY_WEIGHT: Readonly<Record<Priority, number>> = {
  core: 3,
  secondary: 2,
  optional: 1,
};

/**
 * Score of a RESOLVED status. `unknown` and `not_applicable` are deliberately
 * absent: they are not zeros, they are non-entries — see `isResolved`.
 */
export const STATUS_SCORE: Readonly<Record<string, number>> = {
  met: 1,
  flex_used: 1,
  partial: 0.5,
  missed: 0,
};

/** Days of logging required before any percentage may be shown (4/7). */
export const LOGGING_COVERAGE_MIN_DAYS = 4;
/** A day "counts as logged" from this many protocol events. */
export const LOGGED_DAY_MIN_EVENTS = 2;
export const WEEK_DAYS = 7;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The subset of a `commitment_evaluations` row the formula needs, plus the two
 * fields the evaluator carries alongside it (`priority`, `countsTowardAdherence`)
 * because weights live on the commitment, not on the evaluation.
 */
export interface AdherenceEvaluation {
  commitmentId: string;
  localDate: string;
  grain: EvaluationGrain;
  status: EvalStatus;
  priority: Priority;
  countsTowardAdherence: boolean;
  expectedEvaluationsPerDay: number;
}

export interface WeekAdherenceInput {
  /** the 7 local dates of the week, in order */
  weekDates: readonly string[];
  evaluations: readonly AdherenceEvaluation[];
  /** local_date -> number of protocol_events that day (the COVERAGE number) */
  eventCountsByDate: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface DayAdherence {
  localDate: string;
  /** null when the day has no resolved, adherence-bearing evaluation */
  score: number | null;
  evaluableCommitments: number;
  resolvedEvaluations: number;
}

export interface LoggingCoverage {
  loggedDays: number;
  /** integer percent of the 7-day week */
  pct: number;
}

/**
 * The gate, as a type. `insufficient_data` has no `pct` for adherence — there
 * is nothing to accidentally render.
 */
export type WeekAdherenceResult =
  | {
    kind: "insufficient_data";
    reason: "logging_coverage_below_gate";
    loggingCoverage: LoggingCoverage;
    /** what would be needed to lift the gate — a coaching prompt, not a score */
    minLoggedDays: number;
    days: DayAdherence[];
  }
  | {
    kind: "adherence";
    loggingCoverage: LoggingCoverage;
    /** overall weighted adherence, 0..1 */
    overall: number;
    overallPct: number;
    /** same formula restricted to priority='core' (null when no core line resolved) */
    core: number | null;
    corePct: number | null;
    evaluableDays: number;
    days: DayAdherence[];
  };

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * The two statuses that are EXCLUDED from every denominator by doctrine. A day
 * not logged is not a day failed; a day declared off-plan in advance is not a
 * day failed either.
 */
export const NON_SCORING_STATUS: ReadonlySet<string> = new Set([
  "unknown",
  "not_applicable",
]);

/**
 * R7 at the formula boundary. A status is either scored or explicitly declared
 * non-scoring — never a third thing. Without this throw, adding a value to the
 * status enum without weighing it would silently drop those evaluations out of
 * the denominator: a scoring change with no error, which is the exact failure
 * mode R7 exists to forbid.
 */
export function isResolved(status: EvalStatus): boolean {
  if (Object.prototype.hasOwnProperty.call(STATUS_SCORE, status)) return true;
  if (NON_SCORING_STATUS.has(status)) return false;
  throw new Error(
    `[keel/adherence] status ${JSON.stringify(status)} is neither scored nor ` +
      `declared non-scoring — refusing to guess (R7)`,
  );
}

function scoreOf(status: EvalStatus): number {
  const s = STATUS_SCORE[status];
  if (s === undefined) {
    // R7: no silent zero for a status we forgot to weigh.
    throw new Error(`[keel/adherence] status ${JSON.stringify(status)} has no score`);
  }
  return s;
}

function weightOf(priority: Priority): number {
  const w = PRIORITY_WEIGHT[priority];
  if (w === undefined) {
    throw new Error(`[keel/adherence] priority ${JSON.stringify(priority)} has no weight`);
  }
  return w;
}

/**
 * Which evaluations may enter the formula at all.
 *
 * - `countsTowardAdherence=false` => OUTCOME axis, not adherence. This is the
 *   Whoop guardrail's second half: a silent sensor yields `unknown` (excluded
 *   as unresolved), and a capture line the coach flagged as outcome-only is
 *   excluded even when it DOES resolve.
 * - grain 'week' => excluded from `day_score`. The formula of SCHEMA.md is
 *   explicitly `week = mean(day_score) over evaluable days`; a week-grain line
 *   has no day to belong to. It is reported separately (see
 *   `summarizeWeekGrain`) rather than folded in with an invented rule.
 */
function entersFormula(e: AdherenceEvaluation): boolean {
  return e.countsTowardAdherence && e.grain !== "week" && isResolved(e.status);
}

interface DayComputation {
  score: number | null;
  evaluableCommitments: number;
  resolvedEvaluations: number;
}

function computeDay(
  evaluations: readonly AdherenceEvaluation[],
  priorityFilter: Priority | null,
): DayComputation {
  const byCommitment = new Map<string, AdherenceEvaluation[]>();
  for (const e of evaluations) {
    if (!entersFormula(e)) continue;
    if (priorityFilter !== null && e.priority !== priorityFilter) continue;
    const list = byCommitment.get(e.commitmentId);
    if (list) list.push(e);
    else byCommitment.set(e.commitmentId, [e]);
  }

  let numerator = 0;
  let denominator = 0;
  let resolvedEvaluations = 0;

  for (const [, evals] of byCommitment) {
    const w = weightOf(evals[0].priority);
    const expected = Math.max(1, evals[0].expectedEvaluationsPerDay || 1);
    const coverage = Math.min(1, evals.length / expected);
    // Cardinality-neutral: the MEAN of the scores, so a commitment with four
    // occasions cannot outweigh one with a single occasion at equal priority.
    const mean = evals.reduce((sum, e) => sum + scoreOf(e.status), 0) / evals.length;
    numerator += w * mean * coverage;
    denominator += w * coverage;
    resolvedEvaluations += evals.length;
  }

  return {
    score: denominator > 0 ? numerator / denominator : null,
    evaluableCommitments: byCommitment.size,
    resolvedEvaluations,
  };
}

/** `day_score` for one local date (null when the day is not evaluable). */
export function computeDayScore(
  evaluations: readonly AdherenceEvaluation[],
): number | null {
  return computeDay(evaluations, null).score;
}

export function computeLoggingCoverage(
  weekDates: readonly string[],
  eventCountsByDate: Readonly<Record<string, number>>,
): LoggingCoverage {
  let loggedDays = 0;
  for (const date of weekDates) {
    if ((eventCountsByDate[date] ?? 0) >= LOGGED_DAY_MIN_EVENTS) loggedDays++;
  }
  // The denominator is the calendar week, always 7 — not "the days we happen to
  // have rows for". Coverage measured against its own evidence is not coverage.
  return { loggedDays, pct: Math.round((loggedDays / WEEK_DAYS) * 100) };
}

export function computeWeekAdherence(input: WeekAdherenceInput): WeekAdherenceResult {
  const byDate = new Map<string, AdherenceEvaluation[]>();
  for (const e of input.evaluations) {
    const list = byDate.get(e.localDate);
    if (list) list.push(e);
    else byDate.set(e.localDate, [e]);
  }

  const days: DayAdherence[] = input.weekDates.map((date) => {
    const dayEvals = byDate.get(date) ?? [];
    const computed = computeDay(dayEvals, null);
    return {
      localDate: date,
      score: computed.score,
      evaluableCommitments: computed.evaluableCommitments,
      resolvedEvaluations: computed.resolvedEvaluations,
    };
  });

  const loggingCoverage = computeLoggingCoverage(input.weekDates, input.eventCountsByDate);

  // THE GATE (CONTRACT: "coverage < 4/7 => the coach sees insufficient_data,
  // no percentage"). Returned as a distinct variant so no percentage exists.
  if (loggingCoverage.loggedDays < LOGGING_COVERAGE_MIN_DAYS) {
    return {
      kind: "insufficient_data",
      reason: "logging_coverage_below_gate",
      loggingCoverage,
      minLoggedDays: LOGGING_COVERAGE_MIN_DAYS,
      days,
    };
  }

  const evaluable = days.filter((d) => d.score !== null);
  const overall = evaluable.length > 0
    ? evaluable.reduce((sum, d) => sum + (d.score as number), 0) / evaluable.length
    : 0;

  const coreDays = input.weekDates
    .map((date) => computeDay(byDate.get(date) ?? [], "core").score)
    .filter((s): s is number => s !== null);
  const core = coreDays.length > 0
    ? coreDays.reduce((a, b) => a + b, 0) / coreDays.length
    : null;

  return {
    kind: "adherence",
    loggingCoverage,
    overall,
    overallPct: Math.round(overall * 100),
    core,
    corePct: core === null ? null : Math.round(core * 100),
    evaluableDays: evaluable.length,
    days,
  };
}

// ---------------------------------------------------------------------------
// REPUBLICATION CONTINUITY — an adjusted plan is not a reset week
// ---------------------------------------------------------------------------
//
// `plan-publish-v1` never updates a commitment in place: it inserts a NEW
// `plan_versions` row and a NEW set of `plan_commitments` with FRESH uuids, then
// supersedes the old version. Every `commitment_evaluations` row written before
// that publish therefore points at a commitment id that no longer exists in the
// published version.
//
// Read naively, those rows have "no weight to be scored with" and get dropped —
// so a coach who adjusts one line on Thursday watches the student's week jump
// from 43% to 0% or 100%, while `logging_coverage` stays at 7/7 (it counts
// `protocol_events`, which survive the publish untouched). The number moves
// because the COACH acted; nothing about the student changed. That is the
// single most corrosive thing an adherence score can do.
//
// `template_commitment_key` is the join key back to the template, unique within
// a version (`plan-publish-v1` refuses duplicates) and carried across every
// republication of the same line. It is the identity that survives; the uuid is
// only a row address. When the key is missing on either side, or ambiguous, the
// row is DROPPED and COUNTED — never guessed at (R7 spirit).

export interface CommitmentIdentity {
  commitmentId: string;
  /** `plan_commitments.template_commitment_key` — null on hand-added lines */
  templateCommitmentKey: string | null;
}

export interface CommitmentAliasMap {
  /** superseded commitment id -> current commitment id */
  aliasOf: Record<string, string>;
  /** keys that matched more than one live line: refused, never guessed */
  ambiguousKeys: string[];
}

/**
 * Maps the commitment ids of superseded versions onto the live line that
 * carries the same `template_commitment_key`.
 *
 * `current` are the commitments of the published version (the ones that have a
 * priority and a weight). `historical` are the commitments referenced by stored
 * evaluation rows that are NOT in `current` — loaded by id, from whatever
 * version they belong to.
 */
export function buildCommitmentAliases(
  current: readonly CommitmentIdentity[],
  historical: readonly CommitmentIdentity[],
): CommitmentAliasMap {
  const liveByKey = new Map<string, string | null>(); // key -> id, or null when ambiguous
  const ambiguous = new Set<string>();
  for (const c of current) {
    const key = c.templateCommitmentKey;
    if (key === null || key === "") continue;
    if (liveByKey.has(key)) {
      // Two live lines with one key: the publish diff would be ambiguous and so
      // is this mapping. Refuse both rather than credit the wrong line.
      liveByKey.set(key, null);
      ambiguous.add(key);
      continue;
    }
    liveByKey.set(key, c.commitmentId);
  }

  const currentIds = new Set(current.map((c) => c.commitmentId));
  const aliasOf: Record<string, string> = {};
  for (const h of historical) {
    if (currentIds.has(h.commitmentId)) continue;
    const key = h.templateCommitmentKey;
    if (key === null || key === "") continue; // absent on one side => ignored
    const liveId = liveByKey.get(key);
    if (!liveId) continue; // unknown or ambiguous => ignored, and counted upstream
    aliasOf[h.commitmentId] = liveId;
  }

  return { aliasOf, ambiguousKeys: [...ambiguous].sort() };
}

/** A stored `commitment_evaluations` row, reduced to what the formula needs. */
export interface StoredEvaluationRow {
  commitmentId: string;
  localDate: string;
  slotKey: string | null;
  grain: EvaluationGrain;
  status: EvalStatus;
  /** `resolved_by in ('coach','student')` — a human decision, never recomputed */
  humanResolved: boolean;
}

/** An evaluation computed by THIS run (already keyed on live commitment ids). */
export interface FreshEvaluationRow {
  commitmentId: string;
  localDate: string;
  slotKey: string | null;
  grain: EvaluationGrain;
  status: EvalStatus;
}

/** The per-commitment weights, which live on the commitment, not the evaluation. */
export interface CommitmentWeighting {
  priority: Priority;
  countsTowardAdherence: boolean;
  expectedEvaluationsPerDay: number;
}

export interface ReconciledWeek {
  evaluations: AdherenceEvaluation[];
  /** stored rows credited to a live line through `template_commitment_key` */
  remapped: number;
  /** stored rows with no live line at all: reported, never guessed at */
  unmapped: number;
}

function evaluationKey(commitmentId: string, localDate: string, slotKey: string | null): string {
  return `${commitmentId}|${localDate}|${slotKey ?? "no_slot"}`;
}

/**
 * Assembles the week's adherence input from what is STORED plus what this run
 * just computed.
 *
 * Precedence, in order:
 *   1. a row a human resolved wins over everything — it was deliberately not
 *      rewritten, and the summary must tell the coach the same story the table
 *      holds;
 *   2. otherwise this run's fresh evaluation wins over its stored copy;
 *   3. among stored rows landing on the same identity after aliasing, the row
 *      written under the LIVE commitment id wins over the superseded one (the
 *      alias is a fallback, not an equal).
 */
export function reconcileWeekEvaluations(args: {
  stored: readonly StoredEvaluationRow[];
  fresh: readonly FreshEvaluationRow[];
  /** live commitment id -> weighting. A row that resolves outside it is unmapped. */
  weightingByCommitmentId: Readonly<Record<string, CommitmentWeighting>>;
  aliasOf: Readonly<Record<string, string>>;
}): ReconciledWeek {
  interface Slot {
    row: StoredEvaluationRow | FreshEvaluationRow;
    commitmentId: string;
    humanResolved: boolean;
    /** true when the stored row already carried the live commitment id */
    exact: boolean;
  }

  const chosen = new Map<string, Slot>();
  let remapped = 0;
  let unmapped = 0;

  for (const row of args.stored) {
    const exact = Object.prototype.hasOwnProperty.call(
      args.weightingByCommitmentId,
      row.commitmentId,
    );
    const liveId = exact ? row.commitmentId : args.aliasOf[row.commitmentId];
    if (!liveId || !Object.prototype.hasOwnProperty.call(args.weightingByCommitmentId, liveId)) {
      unmapped++;
      continue;
    }
    if (!exact) remapped++;

    const key = evaluationKey(liveId, row.localDate, row.slotKey);
    const held = chosen.get(key);
    if (held && held.exact && !exact) continue;
    chosen.set(key, { row, commitmentId: liveId, humanResolved: row.humanResolved, exact });
  }

  for (const row of args.fresh) {
    if (!Object.prototype.hasOwnProperty.call(args.weightingByCommitmentId, row.commitmentId)) {
      continue;
    }
    const key = evaluationKey(row.commitmentId, row.localDate, row.slotKey);
    const held = chosen.get(key);
    if (held?.humanResolved) continue; // rule 1
    chosen.set(key, { row, commitmentId: row.commitmentId, humanResolved: false, exact: true });
  }

  const evaluations: AdherenceEvaluation[] = [];
  for (const slot of chosen.values()) {
    const w = args.weightingByCommitmentId[slot.commitmentId];
    evaluations.push({
      commitmentId: slot.commitmentId,
      localDate: slot.row.localDate,
      grain: slot.row.grain,
      status: slot.row.status,
      priority: w.priority,
      countsTowardAdherence: w.countsTowardAdherence,
      expectedEvaluationsPerDay: w.expectedEvaluationsPerDay,
    });
  }

  return { evaluations, remapped, unmapped };
}

// ---------------------------------------------------------------------------
// Week-grain lines, reported separately
// ---------------------------------------------------------------------------

export interface WeekGrainLine {
  commitmentId: string;
  status: EvalStatus;
  priority: Priority;
}

/**
 * grain='week' commitments ("fatty fish 3x/week") do not belong to any single
 * day, so they are outside `day_score` by construction of the SCHEMA formula.
 * They are surfaced here as their own list so the weekly review can show them
 * without the adherence number silently absorbing an invented rule.
 *
 * KNOWN GAP, on the record: these lines therefore do not move the weekly
 * percentage. Folding them in requires a product decision about their weight
 * relative to a day, which belongs in the contract, not in this function.
 */
export function summarizeWeekGrain(
  evaluations: readonly AdherenceEvaluation[],
): WeekGrainLine[] {
  return evaluations
    .filter((e) => e.grain === "week" && e.countsTowardAdherence)
    .map((e) => ({ commitmentId: e.commitmentId, status: e.status, priority: e.priority }));
}

// ---------------------------------------------------------------------------
// PORTION BANDS — "is he eating a lot or a little?", with no kcal in the answer
// ---------------------------------------------------------------------------
//
// The coach's third block on Monday morning (docs/keel/PHOTO_QUANTIFICATION.md
// §5): "11 plates seen: 2 small, 5 moderate, 4 large."
//
// WHY IT IS A DISTRIBUTION AND NOT A SCORE, stated where the temptation lives:
//
//   * it is NOT an average. Averaging small/moderate/large means assigning them
//     1/2/3 and dividing — which invents an interval scale out of an ordinal one
//     and lands one step away from "average portion = 1.9 servings". The counts
//     ARE the readout; there is no summary number to misread.
//
//   * it does NOT enter `computeWeekAdherence`, in any weight. Adherence answers
//     "did they follow the coach's lines?"; the bands answer "how big were the
//     plates?". Folding a magnitude into a compliance percentage is the exact
//     merge CONTRACT forbids ("two numbers, never merged"), and it would also
//     make a photo cost points a hidden plate does not.
//
//   * `unclear` is REPORTED, not dropped. Silently omitting the plates the model
//     could not rank would inflate the confidence of the distribution. It is
//     kept out of `decidable` and shown, so "9 rankable out of 11" is visible.
//
//   * `NULL` never appears. A tap or a text log has no portion observation at
//     all, and a distribution built over all facts would read "mostly unbanded",
//     which says nothing about eating. `total` below is the number of PLATES
//     SEEN, and it is the honest denominator of the sentence.
//
// SUB-GATE, deliberately: unlike adherence there is NO coverage threshold here.
// A count of observed plates is not a percentage — it cannot be wrong about a
// denominator it states out loud. Three plates read "3 plates seen", which is
// self-limiting in a way "67%" is not.

export type { PortionBandCounts };

export interface PortionBandSummary {
  /** plates carrying a band — the denominator the coach reads */
  total: number;
  small: number;
  moderate: number;
  large: number;
  unclear: number;
  /** plates the model could actually rank (`unclear` excluded) */
  decidable: number;
}

/**
 * The week's portion readout, built from the `portion_band` COLUMN of the
 * week's facts (never from `recognized` jsonb — R5 applies to the caller too).
 *
 * Input is the raw band of each fact, `null` for every fact that carries none.
 * R7: an off-vocabulary band throws rather than being counted as `unclear`.
 */
export function summarizePortionBands(
  bands: readonly (string | null | undefined)[],
): PortionBandSummary {
  const counts = countPortionBands(bands);
  return {
    total: counts.observed,
    small: counts.small,
    moderate: counts.moderate,
    large: counts.large,
    unclear: counts.unclear,
    decidable: counts.decidable,
  };
}

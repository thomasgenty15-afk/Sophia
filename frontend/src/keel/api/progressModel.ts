// KEEL — the pure shape of "progress". Regularity, streaks, obstacles cleared.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: compute adherence. The formula lives
// once, server-side (`_shared/keel/adherence.ts`), and its result reaches the
// student only through a `weekly_reviews` row. A second implementation here
// would drift from the first, and the day it drifted the student and the coach
// would read two different numbers off the same week. So the client's only job
// on adherence is to REFUSE to print one when the gate is not met.
//
// THE GATE IS A RETURN TYPE, NOT A FLAG (same discipline as the backend):
// `insufficient_data` carries no percentage field at all, so no caller can
// forget a boolean and render a number that should not exist.

import { addDays } from "./dates";
import type {
  EvalStatus,
  EvaluationRow,
  PlannedDeviationRow,
  ProtocolEventRow,
  WeeklyReviewRow,
} from "./types";

/** Logged days required in a week before any percentage may be shown (4/7). */
export const LOGGING_COVERAGE_MIN_DAYS = 4;
/** A day "counts as logged" for COVERAGE from this many events (backend parity). */
export const LOGGED_DAY_MIN_EVENTS = 2;
/**
 * A day counts for a STREAK from a single event. Coverage answers "is there
 * enough evidence to score this week?"; a streak answers "did you show up?".
 * Two different questions, two different thresholds, both named.
 */
export const STREAK_MIN_EVENTS = 1;
export const WEEK_DAYS = 7;

export interface LoggingCoverage {
  loggedDays: number;
  /** integer percent of the 7-day week */
  pct: number;
}

export function eventCountsByDate(
  events: readonly ProtocolEventRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.local_date] = (counts[e.local_date] ?? 0) + 1;
  return counts;
}

/**
 * The denominator is the calendar week, always 7 — not "the days we have rows
 * for". Coverage measured against its own evidence is not coverage.
 */
export function computeLoggingCoverage(
  weekDates: readonly string[],
  counts: Readonly<Record<string, number>>,
): LoggingCoverage {
  let loggedDays = 0;
  for (const date of weekDates) {
    if ((counts[date] ?? 0) >= LOGGED_DAY_MIN_EVENTS) loggedDays++;
  }
  return { loggedDays, pct: Math.round((loggedDays / WEEK_DAYS) * 100) };
}

export type AdherenceDisplay =
  | {
    kind: "insufficient_data";
    reason: "logging_coverage_below_gate" | "no_weekly_review";
    loggedDays: number;
    minLoggedDays: number;
  }
  | {
    kind: "adherence";
    overallPct: number;
    corePct: number | null;
    loggedDays: number;
  };

/**
 * Decide whether a percentage may be shown at all.
 *
 * Two independent reasons to refuse, both returning the same numberless
 * variant:
 *   1. the week has fewer than 4 logged days (the CONTRACT gate);
 *   2. no `weekly_reviews` row exists — nothing has been computed, so there is
 *      no re-read row to announce (execution truth: no number without a row).
 *
 * The gate is applied to OUR count of logged days, computed from
 * `protocol_events`, rather than to `weekly_reviews.logging_coverage`, whose
 * unit (days or ratio) is set by the writer of that row. Gating on the
 * unambiguous number is defence in depth, not distrust.
 */
export function adherenceDisplayFor(args: {
  review: WeeklyReviewRow | null;
  coverage: LoggingCoverage;
}): AdherenceDisplay {
  const { review, coverage } = args;
  if (coverage.loggedDays < LOGGING_COVERAGE_MIN_DAYS) {
    return {
      kind: "insufficient_data",
      reason: "logging_coverage_below_gate",
      loggedDays: coverage.loggedDays,
      minLoggedDays: LOGGING_COVERAGE_MIN_DAYS,
    };
  }
  if (review === null || review.overall_adherence_pct === null) {
    return {
      kind: "insufficient_data",
      reason: "no_weekly_review",
      loggedDays: coverage.loggedDays,
      minLoggedDays: LOGGING_COVERAGE_MIN_DAYS,
    };
  }
  return {
    kind: "adherence",
    overallPct: Math.round(review.overall_adherence_pct),
    corePct: review.core_adherence_pct === null
      ? null
      : Math.round(review.core_adherence_pct),
    loggedDays: coverage.loggedDays,
  };
}

export interface Streaks {
  current: number;
  best: number;
}

/**
 * Consecutive days with at least one logged fact.
 *
 * `dates` is oldest-first and ends at today. The current streak tolerates today
 * being empty (the day is not over — counting it as a break at 09:00 would
 * punish a student for not having eaten breakfast yet).
 */
export function computeStreaks(
  dates: readonly string[],
  counts: Readonly<Record<string, number>>,
): Streaks {
  let best = 0;
  let run = 0;
  for (const date of dates) {
    if ((counts[date] ?? 0) >= STREAK_MIN_EVENTS) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const logged = (counts[dates[i]] ?? 0) >= STREAK_MIN_EVENTS;
    if (logged) current++;
    else if (i === dates.length - 1) continue; // today is still open
    else break;
  }

  return { current, best };
}

export interface WeekRegularity {
  weekStart: string;
  loggedDays: number;
  /** integer percent of the 7-day week */
  pct: number;
}

export function computeRegularity(
  weekStarts: readonly string[],
  counts: Readonly<Record<string, number>>,
): WeekRegularity[] {
  return weekStarts.map((weekStart) => {
    const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(weekStart, i));
    const coverage = computeLoggingCoverage(dates, counts);
    return { weekStart, loggedDays: coverage.loggedDays, pct: coverage.pct };
  });
}

/** The statuses that mean "something was kept", per SCHEMA's score table. */
const KEPT_STATUSES: ReadonlySet<EvalStatus> = new Set<EvalStatus>([
  "met",
  "partial",
  "flex_used",
]);

/** Evaluations the server resolved to `met`. A count of rows, never a rate. */
export function countMet(evaluations: readonly EvaluationRow[]): number {
  return evaluations.filter((e) => e.status === "met").length;
}

export interface ObstacleCleared {
  localDate: string;
  kind: string;
  keptCount: number;
}

/**
 * A day the student KNEW would be hard, declared in advance, and still kept
 * something on. This is the motivational counterpart of `not_applicable`: the
 * evaluator removes the day from the denominator, and the student gets to see
 * that they navigated it rather than seeing a blank.
 *
 * Grounded in two row sets, never in a narrative: a `planned_deviations` row
 * and at least one non-missed evaluation on the same local date.
 */
export function computeObstaclesCleared(args: {
  deviations: readonly PlannedDeviationRow[];
  evaluations: readonly EvaluationRow[];
}): ObstacleCleared[] {
  const keptByDate: Record<string, number> = {};
  for (const e of args.evaluations) {
    if (KEPT_STATUSES.has(e.status)) {
      keptByDate[e.local_date] = (keptByDate[e.local_date] ?? 0) + 1;
    }
  }
  return args.deviations
    .filter((d) => (keptByDate[d.local_date] ?? 0) > 0)
    .map((d) => ({
      localDate: d.local_date,
      kind: d.kind,
      keptCount: keptByDate[d.local_date],
    }))
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
}

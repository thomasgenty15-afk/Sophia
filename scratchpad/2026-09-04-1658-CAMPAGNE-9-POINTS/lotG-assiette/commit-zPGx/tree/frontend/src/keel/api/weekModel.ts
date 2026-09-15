// KEEL — ONE week, as a pure shape. The student's screen and the coach's screen
// mount the same component (`components/WeekView.tsx`) over this model, so the
// two never read two different numbers off the same seven days.
//
// WHY THIS FILE EXISTS AT ALL. Before it, `/app/progress` and
// `/coach/clients/:id` each computed their own idea of a week: the coach page
// re-derived coverage inline, the student page derived a 4-week strip, and the
// two ranked nothing in common. The founder's requirement is blunt — "what the
// student sees, the coach must see too" — and the only structural way to honour
// it is to make the DIFFERENCE be the data source (RLS decides what comes back)
// and nothing else. Hence: no `viewer` flag anywhere in this file. There is no
// branch here that could ever render one number for one reader and another
// number for the other, because there is no branch here at all.
//
// WHAT IS DELIBERATELY ABSENT:
//   * an adherence FORMULA — it lives once, server-side (`_shared/keel/
//     adherence.ts`), reaches the client only through a `weekly_reviews` row,
//     and the only thing this module does with it is REFUSE to print it when
//     the 4/7 gate is not met. `adherenceDisplayFor` (progressModel.ts) is
//     reused verbatim: the gate is a return type, not a flag.
//   * any calorie or macro figure. Nothing here reads an `energy` measure.
//     Counts below are counts of ROWS.
//   * `student_note` / `planned_deviations.note` / `media_path`. `WeekFact` and
//     `WeekDeviation` have no field to carry them, so no render path can leak
//     verbatim to a coach by accident. Same discipline as the gate: make the
//     mistake unrepresentable rather than documented.
//   * a percentage computed per line. `WeekLineSummary` carries COUNTS; the
//     kept ratio exists only to RANK, and is never returned for display.

import { addDays, assertIsoDate, dayTokenOf } from "./dates";
import type { CommitmentShape } from "./labels";
import {
  type AdherenceDisplay,
  adherenceDisplayFor,
  computeLoggingCoverage,
  computeStreaks,
  eventCountsByDate,
  LOGGED_DAY_MIN_EVENTS,
  LOGGING_COVERAGE_MIN_DAYS,
  type LoggingCoverage,
  WEEK_DAYS,
} from "./progressModel";
import type {
  DayToken,
  EvalStatus,
  EvaluationGrain,
  EvaluationRow,
  Priority,
  ProtocolEventRow,
  TimingStatus,
  WeeklyReviewRow,
} from "./types";

// ---------------------------------------------------------------------------
// INPUT — the smallest row shapes both readers can actually obtain
// ---------------------------------------------------------------------------

/**
 * A prescribed line. Every field below is selected by BOTH pages today: the
 * student reads `plan_commitments` through its own RLS policy, the coach reads
 * the same table through `coached_student_ids()`. Nothing here is derived.
 *
 * It EXTENDS `CommitmentShape` rather than re-listing a subset of it, because
 * the week table prints the line's amount and that phrase is built by
 * `commitmentAmount` from the whole shape — polarity decides "none", the anchor
 * decides whether a clock target is even printed. The previous narrow shape is
 * exactly what forced the week table onto `targetLabel` and made it print
 * `<= 2300 time` where the coach's own screen prints "at 23:00". Both loaders
 * already select `COMMITMENT_COLUMNS`, so nothing new is fetched.
 */
export interface WeekLine extends CommitmentShape {
  id: string;
  title: string;
  /** The COACH'S OWN sentence coming back — the one prose field on this model. */
  student_instruction: string | null;
  priority: Priority;
  evaluation_grain: EvaluationGrain;
  counts_toward_adherence: boolean;
  status: string;
}

/**
 * A logged fact. The coach's copy arrives through the `coach_student_events`
 * view, which drops `student_note`, `media_path` and `source_message_id`; the
 * student's copy arrives from `protocol_events` directly. The intersection is
 * what this type declares, and `has_media` is `null` when the caller's source
 * does not expose it (the student's own read does not select it) — `null` means
 * "not read", never "no photo".
 */
export interface WeekFact {
  id: string;
  occurred_at: string;
  local_date: string;
  slot_key: string | null;
  source: string;
  quantity: number | null;
  unit: string | null;
  has_media: boolean | null;
}

/** A deviation declared IN ADVANCE. No `note`: see the header. */
export interface WeekDeviation {
  id: string;
  local_date: string;
  kind: string;
  consumed_flex: boolean;
}

/** What a page must fetch for one week, whatever its access path. */
export interface WeekSource {
  lines: readonly WeekLine[];
  evaluations: readonly EvaluationRow[];
  facts: readonly WeekFact[];
  deviations: readonly WeekDeviation[];
  review: WeeklyReviewRow | null;
}

// ---------------------------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------------------------

export interface WeekDayCell {
  date: string;
  dayToken: DayToken;
  /** null = no `commitment_evaluations` row exists for this line on this day. */
  status: EvalStatus | null;
  timingStatus: TimingStatus | null;
  /** the line is on the plan for this weekday (week-grain lines: never) */
  scheduled: boolean;
  /** after "today": not yet lived, so not an absence either */
  isFuture: boolean;
}

export interface WeekLineSummary {
  line: WeekLine;
  cells: WeekDayCell[];
  met: number;
  partial: number;
  missed: number;
  flexUsed: number;
  notApplicable: number;
  unknown: number;
  /** met + partial + missed + flex_used — the evaluator's RESOLVED rows */
  resolved: number;
  /**
   * met + flex_used + 0.5 x partial, over `resolved`. RANKING ONLY — this
   * number is never rendered. Printing it would be a client-side adherence
   * rate, i.e. a second implementation of the one formula that lives on the
   * server. The UI shows the counts above instead.
   */
  keptRatio: number | null;
}

export interface WeekDay {
  date: string;
  dayToken: DayToken;
  factCount: number;
  /** >= 2 facts: the backend's definition of a day that counts for coverage */
  countsForCoverage: boolean;
  isFuture: boolean;
  deviationKinds: string[];
}

/**
 * The most-held / most-dropped pair, behind the SAME 4/7 gate as the
 * percentage. Ranking three evaluations out of a two-day week is noise dressed
 * as insight, and the gate already exists to refuse exactly that.
 */
export type WeekHighlights =
  | {
    kind: "insufficient_data";
    loggedDays: number;
    minLoggedDays: number;
  }
  | {
    kind: "highlights";
    mostHeld: WeekLineSummary | null;
    mostDropped: WeekLineSummary | null;
  };

export interface WeekModel {
  weekStart: string;
  weekDates: string[];
  isoWeek: number;
  isoYear: number;
  /** the week containing `today` — its remaining days are not failures */
  isCurrent: boolean;
  days: WeekDay[];
  coverage: LoggingCoverage;
  adherence: AdherenceDisplay;
  lines: WeekLineSummary[];
  highlights: WeekHighlights;
  deviations: WeekDeviation[];
  /** the week's facts, most recent first — the evidence everything above reads */
  facts: WeekFact[];
  /** longest run of consecutive days carrying at least one fact, in-week */
  longestRunDays: number;
  factCount: number;
  hasAnyRecord: boolean;
}

/** A line needs this many resolved evaluations before it may be ranked. */
export const LINE_MIN_RESOLVED_FOR_RANKING = 3;

// ---------------------------------------------------------------------------
// Week navigation — pure string arithmetic, no clock
// ---------------------------------------------------------------------------

export function previousWeekStart(weekStart: string): string {
  return addDays(weekStart, -WEEK_DAYS);
}

export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, WEEK_DAYS);
}

/**
 * The ISO-8601 week number of a local date (Monday-based, Thursday rule).
 *
 * Parsed at UTC noon like everything in `dates.ts`, so no host timezone can
 * shift the week by one. R7: a malformed date throws.
 */
export function isoWeekOf(date: string): { isoYear: number; isoWeek: number } {
  assertIsoDate(date);
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/weekModel] "${date}" is not a real calendar date`);
  }
  // Monday = 0. The ISO week of a date is the week of its Thursday.
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3 - mondayIndex);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1, 12, 0, 0));
  const dayOfYear = Math.round((thursday.getTime() - jan1.getTime()) / 86_400_000);
  return { isoYear, isoWeek: Math.floor(dayOfYear / 7) + 1 };
}

/**
 * The ISO label of a displayed week.
 *
 * Taken on `weekStart + 3` rather than on `weekStart`: with `week_starts_on`
 * = 'mon' that IS the Thursday rule, and with 'sun' it names the ISO week
 * holding the majority of the displayed days. Labelling a Sunday-start week by
 * its first day would put half of January in the previous year.
 */
export function isoWeekLabelFor(weekStart: string): {
  isoYear: number;
  isoWeek: number;
} {
  return isoWeekOf(addDays(weekStart, 3));
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * Is this line on the plan for `dayToken`?
 *
 * Parity with `todayModel.isScheduledOn`, restated over the minimal `WeekLine`
 * shape (that function needs a full `CommitmentRow`, which the coach's column
 * allowlist does not produce). Same three rules, same order: an archived line
 * is off, a week-grain line belongs to no single day, and an empty
 * `scheduled_days` means every day — that is the column's meaning in the
 * migration.
 */
export function isLineScheduledOn(line: WeekLine, dayToken: DayToken): boolean {
  if (line.status !== "active") return false;
  if (line.evaluation_grain === "week") return false;
  if (!line.scheduled_days || line.scheduled_days.length === 0) return true;
  return line.scheduled_days.includes(dayToken);
}

function summariseLine(
  line: WeekLine,
  weekDates: readonly string[],
  today: string,
  evaluationsByLine: ReadonlyMap<string, EvaluationRow[]>,
): WeekLineSummary {
  const rows = evaluationsByLine.get(line.id) ?? [];
  const byDate = new Map<string, EvaluationRow>();
  for (const row of rows) {
    // A day may carry several occasion-grain rows. The worst resolved status
    // wins the cell, so a slot missed in the morning is not hidden by a slot
    // met at night — a cell that reports the best of the day would be a
    // flattering summary, which is the one thing a coach cannot use.
    const kept = byDate.get(row.local_date);
    if (!kept || CELL_SEVERITY[row.status] > CELL_SEVERITY[kept.status]) {
      byDate.set(row.local_date, row);
    }
  }

  const cells: WeekDayCell[] = weekDates.map((date) => {
    const row = byDate.get(date) ?? null;
    return {
      date,
      dayToken: dayTokenOf(date),
      status: row?.status ?? null,
      timingStatus: row?.timing_status ?? null,
      scheduled: isLineScheduledOn(line, dayTokenOf(date)),
      isFuture: date > today,
    };
  });

  let met = 0, partial = 0, missed = 0, flexUsed = 0, notApplicable = 0, unknown = 0;
  for (const row of rows) {
    if (row.status === "met") met++;
    else if (row.status === "partial") partial++;
    else if (row.status === "missed") missed++;
    else if (row.status === "flex_used") flexUsed++;
    else if (row.status === "not_applicable") notApplicable++;
    else unknown++;
  }
  const resolved = met + partial + missed + flexUsed;
  return {
    line,
    cells,
    met,
    partial,
    missed,
    flexUsed,
    notApplicable,
    unknown,
    resolved,
    keptRatio: resolved === 0
      ? null
      : (met + flexUsed + 0.5 * partial) / resolved,
  };
}

/** Which status a cell shows when a day holds several. Higher = louder. */
const CELL_SEVERITY: Readonly<Record<EvalStatus, number>> = {
  missed: 5,
  partial: 4,
  met: 3,
  flex_used: 2,
  unknown: 1,
  not_applicable: 0,
};

/**
 * Rank the lines, once the coverage gate is open.
 *
 * Only adherence-bearing lines with enough resolved rows are eligible: an
 * outcome-only line (`counts_toward_adherence=false`) is not a thing to hold or
 * drop, and a line with two rows is not a trend. `mostDropped` additionally
 * requires a real `missed` — otherwise "the line you dropped most" would name a
 * line nobody dropped.
 */
export function rankLines(
  summaries: readonly WeekLineSummary[],
): { mostHeld: WeekLineSummary | null; mostDropped: WeekLineSummary | null } {
  const eligible = summaries.filter(
    (s) =>
      s.line.counts_toward_adherence &&
      s.resolved >= LINE_MIN_RESOLVED_FOR_RANKING &&
      s.keptRatio !== null,
  );
  if (eligible.length === 0) return { mostHeld: null, mostDropped: null };

  const byHeld = [...eligible].sort((a, b) =>
    (b.keptRatio as number) - (a.keptRatio as number) ||
    b.resolved - a.resolved ||
    a.line.title.localeCompare(b.line.title)
  );
  let mostHeld: WeekLineSummary | null = byHeld[0];
  const dropCandidates = eligible.filter((s) => s.missed > 0);
  let mostDropped: WeekLineSummary | null = dropCandidates.length === 0 ? null : [
    ...dropCandidates,
  ].sort((a, b) =>
    (a.keptRatio as number) - (b.keptRatio as number) ||
    b.missed - a.missed ||
    a.line.title.localeCompare(b.line.title)
  )[0];

  if (mostHeld && mostDropped && mostHeld.line.id === mostDropped.line.id) {
    // One line cannot be both halves of a contrast. Naming it twice would read
    // as two findings when the week produced one.
    if ((mostHeld.keptRatio as number) >= 0.5) mostDropped = null;
    else mostHeld = null;
  }
  return { mostHeld, mostDropped };
}

export function buildWeekModel(args: {
  weekStart: string;
  weekDates: readonly string[];
  /** the local date "now" resolves to in the plan's timezone */
  today: string;
  source: WeekSource;
}): WeekModel {
  const { weekStart, today, source } = args;
  const weekDates = [...args.weekDates];
  assertIsoDate(weekStart);
  assertIsoDate(today);

  // `eventCountsByDate` reads exactly one field, `local_date`, which every
  // source of facts carries. The cast is the price of a shape narrower than
  // `ProtocolEventRow`; a second counting implementation here is the thing to
  // avoid, because the day it drifted the coverage gate would open on one
  // screen and stay shut on the other.
  const counts = eventCountsByDate(
    source.facts as unknown as readonly ProtocolEventRow[],
  );
  const coverage = computeLoggingCoverage(weekDates, counts);
  const adherence = adherenceDisplayFor({ review: source.review, coverage });

  const deviationsByDate = new Map<string, string[]>();
  for (const d of source.deviations) {
    const list = deviationsByDate.get(d.local_date) ?? [];
    list.push(d.kind);
    deviationsByDate.set(d.local_date, list);
  }

  const days: WeekDay[] = weekDates.map((date) => ({
    date,
    dayToken: dayTokenOf(date),
    factCount: counts[date] ?? 0,
    countsForCoverage: (counts[date] ?? 0) >= LOGGED_DAY_MIN_EVENTS,
    isFuture: date > today,
    deviationKinds: deviationsByDate.get(date) ?? [],
  }));

  const evaluationsByLine = new Map<string, EvaluationRow[]>();
  for (const e of source.evaluations) {
    const list = evaluationsByLine.get(e.commitment_id) ?? [];
    list.push(e);
    evaluationsByLine.set(e.commitment_id, list);
  }

  const lines = source.lines
    .filter((l) => l.status === "active")
    .map((l) => summariseLine(l, weekDates, today, evaluationsByLine))
    .sort((a, b) =>
      PRIORITY_ORDER[a.line.priority] - PRIORITY_ORDER[b.line.priority] ||
      a.line.title.localeCompare(b.line.title)
    );

  const highlights: WeekHighlights =
    coverage.loggedDays < LOGGING_COVERAGE_MIN_DAYS
      ? {
        kind: "insufficient_data",
        loggedDays: coverage.loggedDays,
        minLoggedDays: LOGGING_COVERAGE_MIN_DAYS,
      }
      : { kind: "highlights", ...rankLines(lines) };

  // `computeStreaks` answers two questions; only `best` is meaningful for a
  // bounded past week (its `current` tolerates an empty LAST day because that
  // day is assumed to be today, which is false for any week but this one).
  const longestRunDays = computeStreaks(weekDates, counts).best;

  return {
    weekStart,
    weekDates,
    ...isoWeekLabelFor(weekStart),
    isCurrent: today >= weekDates[0] && today <= weekDates[weekDates.length - 1],
    days,
    coverage,
    adherence,
    lines,
    highlights,
    deviations: [...source.deviations].sort((a, b) =>
      a.local_date < b.local_date ? -1 : 1
    ),
    facts: [...source.facts].sort((a, b) =>
      a.occurred_at < b.occurred_at ? 1 : -1
    ),
    longestRunDays,
    factCount: source.facts.length,
    hasAnyRecord: source.facts.length > 0 || source.evaluations.length > 0,
  };
}

const PRIORITY_ORDER: Readonly<Record<Priority, number>> = {
  core: 0,
  secondary: 1,
  optional: 2,
};

// KEEL — the pure shape of "today", built from re-read database rows only.
//
// DOCTRINE THIS FILE ENFORCES (execution truth): the app displays two different
// kinds of thing and never confuses them.
//   - `status` comes from `commitment_evaluations` — the DERIVED layer, written
//     server-side by `evaluate-adherence-v1`. The client never computes it.
//   - `loggedEvents` comes from `protocol_events` — the FACTS layer, written by
//     the student here and re-read immediately.
// So a tap makes a FACT appear at once, and the status stays `unknown` until
// the evaluator has run. Flipping the badge to `met` on click would be the
// phantom-commit class this repo has already paid for twice.
//
// PURE: no I/O, no clock. The caller passes the local date it resolved in the
// plan's timezone.
//
// GROUPING (revised in E1). The rule used to be one line: "grouping IS the slot
// vocabulary". It now has two halves, because one of them was doing work it was
// never designed for:
//
//   1. A line that NAMES AN OCCASION (`slot_key` set) is grouped by that slot,
//      in vocabulary order. Unchanged, and still the primary reading: you eat in
//      the order of the day, so breakfast comes before dinner on the page.
//   2. A line that names NO occasion falls into the reserved `any_time` bucket.
//      That bucket was a pile: a walk, a bedtime, a magnesium and 2 L of water
//      sat side by side because none of them was anchored — an accident of
//      ANCHORING, presented as if it were a category. Those lines are now also
//      grouped BY FAMILY (`activity_class`) via `freeFamilies`, so the page can
//      show "Movement" and "Sleep" as sections instead of one indistinct block.
//
// `slots` still contains the `any_time` group verbatim (nothing is dropped, and
// no existing reader silently loses lines). A renderer that wants the new
// reading calls `anchoredSlots(view)` + `view.freeFamilies`; the two together
// cover exactly `view.slots`, once each.
//
// `familyTallies` adds the per-family count of the DAY ("Nutrition 3/4"). It is
// an aggregate of the DERIVED layer, never of taps — see `tallyFamilies` for
// what enters the denominator and why.

import { assertIsoDate, dayTokenOf, weekStartFor } from "./dates";
import {
  type CommitmentRow,
  type DayToken,
  type EvalStatus,
  type EvaluationRow,
  NO_SLOT_BUCKET,
  type PlannedDeviationRow,
  type ProtocolEventRow,
  type SlotVocabularyRow,
  type TimingStatus,
} from "./types";

export interface TodayLine {
  commitment: CommitmentRow;
  /** the DERIVED status; `unknown` when no evaluation row exists yet */
  status: EvalStatus;
  timingStatus: TimingStatus;
  /** FACTS the student already logged today for this line */
  loggedEvents: ProtocolEventRow[];
  /** a deviation declared in advance covers this line's slot (or the whole day) */
  coveredByDeviation: PlannedDeviationRow | null;
  /**
   * A silent device feed. CONTRACT R6: such a line yields `unknown`, never
   * `missed`, and the student is not asked to tick it by hand.
   */
  isAutoSourced: boolean;
}

export interface TodaySlotGroup {
  slotKey: string;
  sortOrder: number;
  defaultLocalTime: string | null;
  lines: TodayLine[];
}

/**
 * The lines of the `any_time` bucket, split by `activity_class`.
 *
 * This is a SECOND READING of rows already present in `slots`, not a second
 * copy of the data: the same `TodayLine` objects appear in both, and a renderer
 * uses `anchoredSlots()` + `freeFamilies` (never `slots` + `freeFamilies`).
 */
export interface TodayFamilyGroup {
  activityClass: string;
  sortOrder: number;
  lines: TodayLine[];
}

/**
 * "Nutrition 3/4" for one family, over TODAY's lines.
 *
 * `kept` and `evaluable` both come from the DERIVED layer. Deliberately no
 * percentage field: a ratio of 3 and 4 is two counts a reader can check against
 * the badges below it, whereas "75 %" is a score — and scores on this app are
 * gated (CONTRACT, "Two numbers, never merged").
 */
export interface TodayFamilyTally {
  activityClass: string;
  sortOrder: number;
  /** lines of this family on today's page, excused ones included */
  total: number;
  /** lines that can still be kept or missed today (denominator) */
  evaluable: number;
  /** evaluable lines the server graded `met` (numerator) */
  kept: number;
}

export interface TodayView {
  localDate: string;
  dayToken: DayToken;
  /**
   * day- and occasion-grain lines, grouped by slot in vocabulary order.
   * INCLUDES the `any_time` bucket — see `anchoredSlots` / `freeFamilies`.
   */
  slots: TodaySlotGroup[];
  /** the `any_time` bucket re-read by family, in activity_class order */
  freeFamilies: TodayFamilyGroup[];
  /** per-family counts over every day line (slot-anchored and free alike) */
  familyTallies: TodayFamilyTally[];
  /** week-grain lines ("fatty fish 3x/week") — they belong to no single day */
  weekLines: TodayLine[];
  /** deviations declared for this local date */
  deviations: PlannedDeviationRow[];
  totalLines: number;
}

/**
 * The order families are read in. It mirrors `ACTIVITY_CLASS` in
 * `_shared/keel/tokens.ts` — one vocabulary, one order, so the coach's editor
 * and the student's day list the same families the same way (R1).
 */
export const ACTIVITY_CLASS_ORDER: readonly string[] = [
  "nutrition",
  "supplement",
  "movement",
  "recovery",
  "exposure",
  "sleep",
  "mind",
  "measurement",
  "other",
];

/**
 * R7 at the family boundary. An activity class this build does not know is a
 * THROW, exactly like an unknown slot or priority: dropping it into "other"
 * would file a coach's movement line under a heading they never wrote, and
 * `activityLabel()` would have thrown at render anyway — better here, with the
 * commitment id in the message.
 */
function activityRank(line: TodayLine): number {
  const rank = ACTIVITY_CLASS_ORDER.indexOf(line.commitment.activity_class);
  if (rank < 0) {
    throw new Error(
      `[keel/today] commitment ${line.commitment.id} carries unknown ` +
        `activity_class "${line.commitment.activity_class}" (R7)`,
    );
  }
  return rank;
}

/**
 * The slot groups that name a real occasion — `view.slots` minus the reserved
 * `any_time` bucket, whose lines are served by `view.freeFamilies` instead.
 *
 * Kept as a function rather than a second array on the view so there is exactly
 * one list of groups in memory and no way for the two to drift.
 */
export function anchoredSlots(view: TodayView): TodaySlotGroup[] {
  return view.slots.filter((g) => g.slotKey !== NO_SLOT_BUCKET);
}

function groupByFamily(lines: readonly TodayLine[]): TodayFamilyGroup[] {
  const byClass = new Map<string, TodayFamilyGroup>();
  for (const line of lines) {
    const key = line.commitment.activity_class;
    let group = byClass.get(key);
    if (!group) {
      group = { activityClass: key, sortOrder: activityRank(line), lines: [] };
      byClass.set(key, group);
    }
    group.lines.push(line);
  }
  return [...byClass.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Per-family counts for the head of the day.
 *
 * WHAT ENTERS THE DENOMINATOR, and why each exclusion is not an optimism:
 *   - `not_applicable` and `flex_used` are the server saying "this one does not
 *     count today". Counting them as missed would penalise a student for a
 *     latitude the plan granted;
 *   - a line covered by a DECLARED deviation leaves the count — that is the
 *     entire promise of declaring one in advance (TodayPage invariant 3);
 *   - `counts_toward_adherence = false` is a line the coach tracks without
 *     scoring, so it has no business in a score-shaped ratio.
 * Everything else stays in, `unknown` included: a line nobody has graded yet is
 * an open line, not an absent one, and hiding it would make the ratio climb as
 * the evaluator falls behind.
 *
 * The numerator is `met` only. `partial` is NOT half a point — the app has no
 * fractional grade and inventing one here would be a number nothing else can
 * reproduce.
 */
function tallyFamilies(lines: readonly TodayLine[]): TodayFamilyTally[] {
  const byClass = new Map<string, TodayFamilyTally>();
  for (const line of lines) {
    const key = line.commitment.activity_class;
    let tally = byClass.get(key);
    if (!tally) {
      tally = {
        activityClass: key,
        sortOrder: activityRank(line),
        total: 0,
        evaluable: 0,
        kept: 0,
      };
      byClass.set(key, tally);
    }
    tally.total++;
    const excused = line.coveredByDeviation !== null ||
      line.status === "not_applicable" ||
      line.status === "flex_used" ||
      !line.commitment.counts_toward_adherence;
    if (excused) continue;
    tally.evaluable++;
    if (line.status === "met") tally.kept++;
  }
  return [...byClass.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Is this commitment on the plan for `dayToken`?
 *
 * A null or empty `scheduled_days` means every day — that is the column's
 * meaning in the migration (the CHECK constrains the values, not the presence).
 * Week-grain lines are excluded here and surfaced separately: they have no day
 * to belong to, and inventing one is precisely what SCHEMA.md refuses.
 */
export function isScheduledOn(c: CommitmentRow, dayToken: DayToken): boolean {
  if (c.status !== "active") return false;
  if (c.evaluation_grain === "week") return false;
  if (!c.scheduled_days || c.scheduled_days.length === 0) return true;
  return c.scheduled_days.includes(dayToken);
}

/**
 * The slot bucket a line is displayed under. Only an explicit `slot_key` places
 * a line in a meal slot; a clock or window anchor is NOT re-derived into the
 * nearest slot, because guessing "19:00 means dinner" is an inference the
 * schema deliberately does not make.
 */
export function bucketOf(c: CommitmentRow): string {
  return c.slot_key ?? NO_SLOT_BUCKET;
}

function matchEvaluation(
  c: CommitmentRow,
  bucket: string,
  evaluations: readonly EvaluationRow[],
): EvaluationRow | null {
  const forCommitment = evaluations.filter((e) => e.commitment_id === c.id);
  if (forCommitment.length === 0) return null;
  const exact = forCommitment.find((e) => (e.slot_key ?? NO_SLOT_BUCKET) === bucket);
  return exact ?? forCommitment[0];
}

function matchEvents(
  c: CommitmentRow,
  events: readonly ProtocolEventRow[],
): ProtocolEventRow[] {
  return events.filter((e) => e.recognized?.commitment_id === c.id);
}

function matchDeviation(
  bucket: string,
  deviations: readonly PlannedDeviationRow[],
): PlannedDeviationRow | null {
  // A deviation with no slot covers the whole day; one with a slot covers that
  // slot only. Whole-day wins when both exist.
  const wholeDay = deviations.find((d) => d.slot_key === null);
  if (wholeDay) return wholeDay;
  return deviations.find((d) => d.slot_key === bucket) ?? null;
}

function toLine(
  c: CommitmentRow,
  bucket: string,
  args: {
    evaluations: readonly EvaluationRow[];
    events: readonly ProtocolEventRow[];
    deviations: readonly PlannedDeviationRow[];
  },
): TodayLine {
  const evaluation = matchEvaluation(c, bucket, args.evaluations);
  return {
    commitment: c,
    status: evaluation?.status ?? "unknown",
    timingStatus: evaluation?.timing_status ?? "unknown",
    loggedEvents: matchEvents(c, args.events),
    coveredByDeviation: matchDeviation(bucket, args.deviations),
    isAutoSourced: c.auto_source !== null,
  };
}

/**
 * Build the whole day. R7 at the boundary: a `slot_key` the vocabulary does not
 * know THROWS. The alternative — dropping the line into an "other" pile — would
 * hide a coach's commitment from the student with no error anywhere.
 */
export function buildTodayView(input: {
  localDate: string;
  commitments: readonly CommitmentRow[];
  evaluations: readonly EvaluationRow[];
  events: readonly ProtocolEventRow[];
  deviations: readonly PlannedDeviationRow[];
  slotVocabulary: readonly SlotVocabularyRow[];
}): TodayView {
  const dayToken = dayTokenOf(input.localDate);
  const vocab = new Map(input.slotVocabulary.map((s) => [s.key, s]));

  const dayEvaluations = input.evaluations.filter(
    (e) => e.local_date === input.localDate,
  );
  const dayEvents = input.events.filter((e) => e.local_date === input.localDate);
  const dayDeviations = input.deviations.filter(
    (d) => d.local_date === input.localDate,
  );

  const groups = new Map<string, TodaySlotGroup>();
  const weekLines: TodayLine[] = [];
  let totalLines = 0;

  for (const c of input.commitments) {
    if (c.status !== "active") continue;

    if (c.evaluation_grain === "week") {
      // A week-grain evaluation is stamped with a date inside the week, not
      // necessarily today, so it is matched against the whole loaded window
      // (the caller loads exactly the current week — see loadTodaySnapshot).
      // Its facts, however, are still today's facts.
      weekLines.push(
        toLine(c, bucketOf(c), {
          evaluations: input.evaluations,
          events: dayEvents,
          deviations: dayDeviations,
        }),
      );
      totalLines++;
      continue;
    }

    if (!isScheduledOn(c, dayToken)) continue;

    const bucket = bucketOf(c);
    const slot = vocab.get(bucket);
    if (!slot) {
      throw new Error(
        `[keel/today] commitment ${c.id} sits on slot "${bucket}", absent from ` +
          `slot_vocabulary — refusing to hide a prescribed line (R7)`,
      );
    }
    let group = groups.get(bucket);
    if (!group) {
      group = {
        slotKey: bucket,
        sortOrder: slot.sort_order,
        defaultLocalTime: slot.default_local_time,
        lines: [],
      };
      groups.set(bucket, group);
    }
    group.lines.push(
      toLine(c, bucket, {
        evaluations: dayEvaluations,
        events: dayEvents,
        deviations: dayDeviations,
      }),
    );
    totalLines++;
  }

  const slots = [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const g of slots) g.lines.sort((a, b) => priorityRank(a) - priorityRank(b));

  // The second reading of the SAME lines: the no-slot pile, by family. Built
  // from the group rather than from `input.commitments` so a line can never
  // appear in one reading and not the other.
  const freeBucket = slots.find((g) => g.slotKey === NO_SLOT_BUCKET);
  const freeFamilies = groupByFamily(freeBucket?.lines ?? []);

  // The tally spans every DAY line — anchored and free alike, because "did I
  // hold nutrition today" is a question about the whole day, not about the
  // lines that happen to name a meal. Week-grain lines are excluded: they are
  // graded against the week and mixing the two grains would produce a ratio
  // that is true of neither.
  const familyTallies = tallyFamilies(slots.flatMap((g) => g.lines));

  return {
    localDate: input.localDate,
    dayToken,
    slots,
    freeFamilies,
    familyTallies,
    weekLines,
    deviations: dayDeviations,
    totalLines,
  };
}

// ---------------------------------------------------------------------------
// THE DAY, HANDED TO THE SHARED PLAN STRUCTURE
//
// This file used to own `splitTodayParts`, which cut the day into "what I eat"
// and "what I do" and then invented its own sub-grouping underneath: occasions
// for food, families for actions. The partition itself was already shared
// (`planPartOf`); the LAYOUT under it was not, and that is exactly where the
// student's page drifted away from the two coach screens — the student saw
// "Breakfast / Lunch / No set time", the coach saw "Every day / Every week /
// What we are cutting / Supplements", for the same eighteen lines.
//
// So the sections now come from `api/planStructure.ts`, the one module all
// three screens call — including the `occasion` reading order it applies inside
// a sub-section when the caller hands it the slot vocabulary.
//
// What stays HERE is what needs a day around it, which that module deliberately
// does not have: `slotReading` turns an ordered sub-section back into the
// occasion GROUPS the page puts headings and a camera on ("Breakfast 07:30"),
// and `splitByGrain` keeps what is judged on the week out of what is due today.
// Both are READINGS of lines the shared structure has already filed — never a
// second filing.
//
// DELIBERATELY NO IMPORT of `planStructure` here, and none the other way
// either: the composition happens in the page, which owns both.
// ---------------------------------------------------------------------------

/**
 * EVERY LINE OF THE DAY, ONCE, in reading order.
 *
 * This is the input the shared `buildPlanStructure` takes. Order matters: it is
 * preserved inside every sub-section, so handing the meals over in vocabulary
 * order is what makes "Every day" read from waking to bedtime without the
 * structure module knowing what an occasion is.
 *
 * Allocates no new `TodayLine`: every object here is already in `view`, so the
 * readings cannot drift. `todayLines(view).length === view.totalLines`.
 */
export function todayLines(view: TodayView): TodayLine[] {
  const free = view.slots.find((g) => g.slotKey === NO_SLOT_BUCKET)?.lines ?? [];
  return [
    ...anchoredSlots(view).flatMap((g) => g.lines),
    ...free,
    ...view.weekLines,
  ];
}

/**
 * The columns the partition reads, pulled out of a `TodayLine`.
 *
 * Passed to `buildPlanStructure` as its `shapeOf`. A `TodayLine` is a
 * commitment plus its derived status and its facts; only the commitment decides
 * where the line is READ, and none of the derived material may enter that
 * decision — a line must not move sections because it was graded.
 */
export function todayLineShape(line: TodayLine): CommitmentRow {
  return line.commitment;
}

/**
 * THE SAME LINES, IN THE ORDER OF THE DAY.
 *
 * Given any subset of the view (one food sub-section, say), returns the
 * occasion-anchored groups in vocabulary order plus the lines that name no
 * occasion. Groups left empty by the subset disappear rather than showing a
 * meal with nothing in it.
 *
 * The groups are REBUILT rather than filtered out of `view.slots` so that
 * `sortOrder` and `defaultLocalTime` still come from the vocabulary row the
 * view resolved — the caller gets the real clock time under the heading, not a
 * guess.
 */
export interface TodaySlotReading {
  slots: TodaySlotGroup[];
  free: TodayLine[];
}

export function slotReading(
  view: TodayView,
  lines: readonly TodayLine[],
): TodaySlotReading {
  const wanted = new Set(lines);
  const slots: TodaySlotGroup[] = [];
  for (const group of anchoredSlots(view)) {
    const kept = group.lines.filter((l) => wanted.has(l));
    if (kept.length > 0) slots.push({ ...group, lines: kept });
  }
  const anchoredKept = new Set(slots.flatMap((g) => g.lines));
  return { slots, free: lines.filter((l) => !anchoredKept.has(l)) };
}

/**
 * DUE TODAY vs JUDGED ON THE WEEK.
 *
 * "Oily fish 3 times a week" belongs under what I eat, and it is not something
 * the student is behind on this morning. The shared structure files it by
 * SUBJECT (it is food, and `foodSectionOf` may well put it under "Every week");
 * this splits the same sub-section by GRAIN so the page can say "this week" for
 * the lines that are not today's.
 *
 * When a whole sub-section is week-grain the caption is redundant — its heading
 * already says "Every week" — which is why this returns the two lists rather
 * than a flag: the caller can see `day.length === 0` and stay quiet.
 */
export function splitByGrain(
  lines: readonly TodayLine[],
): { day: TodayLine[]; week: TodayLine[] } {
  const day: TodayLine[] = [];
  const week: TodayLine[] = [];
  for (const line of lines) {
    if (line.commitment.evaluation_grain === "week") week.push(line);
    else day.push(line);
  }
  return { day, week };
}

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  core: 0,
  secondary: 1,
  optional: 2,
};

function priorityRank(line: TodayLine): number {
  const rank = PRIORITY_RANK[line.commitment.priority];
  if (rank === undefined) {
    throw new Error(
      `[keel/today] unknown priority "${line.commitment.priority}" (R7)`,
    );
  }
  return rank;
}

/**
 * Flex days left this week. `flex_allowance_per_week` is the coach's number and
 * `consumed_flex` is set server-side — the client only subtracts, it never
 * grants itself latitude.
 */
export function flexRemaining(args: {
  allowance: number | null;
  deviationsThisWeek: readonly PlannedDeviationRow[];
}): number {
  const allowance = args.allowance ?? 0;
  const used = args.deviationsThisWeek.filter((d) => d.consumed_flex).length;
  return Math.max(0, allowance - used);
}

// ---------------------------------------------------------------------------
// The plan's calendar window (E2) — coach side
// ---------------------------------------------------------------------------

/**
 * `plan_versions.anchor_week_start` + `duration_weeks`, the pair the publish
 * screens send and `provision-day-v1` enforces.
 */
export interface PlanCalendarWindow {
  /** the first day of WEEK 1 of the plan, always a week start */
  anchorWeekStart: string;
  /** null = no end date; the plan runs until a new version supersedes it */
  durationWeeks: number | null;
}

/**
 * This lives in the student-side `api/` layer for one reason: it is the exact
 * mirror of `planWeekNumber()` in `provision-day-v1/provisioning.ts`, and the
 * two must agree to the day. Duplicating the arithmetic inside each publish
 * screen would give the repo three copies of a rule that decides whether a
 * student's day opens at all.
 *
 * THE CONVERSION, stated so it can be argued with:
 *
 *   anchor  = the start of the week CONTAINING the publish date. Not next
 *             week: anchoring forward puts `planWeekNumber` at 0, which
 *             `provision-day-v1` reads as `plan_not_started`, and the student
 *             would open an empty app until Monday. A plan published on
 *             Wednesday is live on Wednesday.
 *   duration= the plan week that CONTAINS the next session, so the plan covers
 *             that whole week. `duration_weeks = planWeekNumber(anchor,
 *             nextSession)`, and provisioning stops at `week > duration` — so
 *             the session day itself is still in window, which is what a coach
 *             means by "until we next meet".
 *
 * A next session before the anchor week yields a duration < 1. It is returned
 * as-is rather than clamped: the caller must refuse to publish it, and a silent
 * clamp to 1 would publish a plan that dies on Sunday.
 */
export function planWindowUntilNextSession(args: {
  /** the local date of the publish, in the PLAN's timezone */
  publishedOn: string;
  weekStartsOn: DayToken;
  /** null when the coach declines to name one: the plan gets no end date */
  nextSessionDate: string | null;
}): PlanCalendarWindow {
  const anchorWeekStart = weekStartFor(
    assertIsoDate(args.publishedOn),
    args.weekStartsOn,
  );
  if (args.nextSessionDate === null) {
    return { anchorWeekStart, durationWeeks: null };
  }
  const session = assertIsoDate(args.nextSessionDate);
  const days = Math.floor(
    (Date.parse(`${session}T12:00:00Z`) -
      Date.parse(`${anchorWeekStart}T12:00:00Z`)) / 86_400_000,
  );
  return { anchorWeekStart, durationWeeks: Math.floor(days / 7) + 1 };
}

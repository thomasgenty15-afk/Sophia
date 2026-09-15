/**
 * KEEL — the evaluator (W4.1). PURE: zero I/O, zero clock, zero randomness.
 *
 * Authority: docs/keel/CONTRACT.md (R5, R6, R7 + NON-INPUTS) and
 * docs/keel/SCHEMA.md (the three acceptance fixtures are the definition of
 * done). If this code and the contract disagree, this code is wrong.
 *
 * WHAT GOES IN — a snapshot the caller has already assembled:
 *   commitments (prescription) + protocol events (facts) + planned deviations.
 * WHAT COMES OUT — commitment_evaluations rows, each carrying TWO independent
 *   fields: `status` x `timing_status` (R6: "done, but at the wrong time" must
 *   be expressible as met + off_window; otherwise the circadian coach has to
 *   choose between a false met and an unjust missed).
 *
 * ---------------------------------------------------------------------------
 * FRONTIERES (read this before adding a field)
 * ---------------------------------------------------------------------------
 * 1. R5 — the evaluator never reads `plan_commitments.content` jsonb. The one
 *    piece of information the evaluator legitimately needs from it is the swap
 *    policy (food-group `class_equivalent` resolution). It is therefore passed
 *    in the snapshot, ALREADY EXTRACTED AND TYPED, by the caller
 *    (`EvaluatorCommitment.swapPolicy`). The extraction is the caller's job and
 *    the caller's bug surface; from here down, `content` does not exist. Same
 *    boundary for `swapPolicy` as for `foodGroupClasses` (a `food_groups` read)
 *    and for `commitmentId` on events (extracted by the caller from the event
 *    payload): the evaluator consumes columns and typed scalars, never jsonb.
 *
 * 2. NON-INPUT #1 — relation rows between commitments (co-ingestion,
 *    separation, cofactor, antagonist) are render guidance and safety alerts
 *    ONLY. This module does not import their vocabulary module and no branch
 *    below reads them. `evaluator_test.ts` pins both halves: the import is
 *    absent from the source, and results are byte-identical when relation rows
 *    are bolted onto the snapshot. `scripts/ci/token-lint.mjs` assertion 4
 *    enforces the import half in CI.
 *
 * 3. NON-INPUT #3 — cross-line deduction is refused. A logged salmon serving
 *    (a food line) NEVER produces or influences a `micronutrient` evaluation
 *    (a nutrient line). Enforced structurally: the micronutrient branch matches
 *    on `substance_ref` equality, and a food log carries `food_group_ref` with
 *    a null `substance_ref`, so it cannot match. No nutrient-composition table
 *    exists, deliberately.
 *
 * 4. Time. The evaluator receives `localDate`, `dayOfWeek` and per-event
 *    `localTime` already resolved in the student's timezone. It never converts
 *    a timestamptz — timezone arithmetic belongs to the caller, which knows the
 *    plan's timezone. `evaluatedAt` is likewise passed in: a pure function does
 *    not read the clock.
 */

import {
  type AnchorKind,
  type DayToken,
  type EvalStatus,
  type EvaluationGrain,
  type EvidenceKind,
  type Measure,
  parseEvaluationGrain,
  parseMeasure,
  parsePolarity,
  parseTargetOp,
  type Polarity,
  type Priority,
  type SlotKind,
  type TargetOp,
  type TimingStatus,
  type Unit,
} from "./tokens.ts";

// ---------------------------------------------------------------------------
// Vocabularies used by the evaluator that are not in tokens.ts
// (they belong to protocol_events / commitment_evaluations, not to the
// prescription axes; kept local so tokens.ts stays the prescription vocabulary)
// ---------------------------------------------------------------------------

export const AUTO_SOURCE = [
  "whoop",
  "oura",
  "apple_health",
  "cgm",
  "scale",
] as const;
export type AutoSource = (typeof AUTO_SOURCE)[number];

export const EVENT_SOURCE = [
  "photo",
  "text",
  "voice",
  "chat",
  "quick_tap",
  "integration",
  "coach_entry",
] as const;
export type EventSource = (typeof EVENT_SOURCE)[number];

export const EVIDENCE_TOKEN = [
  "none",
  "self_report",
  "photo",
  "text_log",
  "integration",
  "coach_override",
  "inferred",
] as const;
export type EvidenceToken = (typeof EVIDENCE_TOKEN)[number];

export type CommitmentStatus = "active" | "paused" | "archived";
export type Autonomy = "strict" | "swap_within_policy" | "flexible";

/**
 * `protocol_events.portion_band` — ORDINAL magnitude, never a quantity.
 *
 * Lives here and not in `tokens.ts` for the same reason as `EVENT_SOURCE`: it is
 * a column of the FACT table, not an axis of the prescription. The vocabulary is
 * closed by a CHECK in migration `20260727220000_keel_portion_band.sql`.
 *
 * `small < moderate < large`. `unclear` is NOT a fourth point on that scale: it
 * is the model saying "I looked and I cannot rank this plate", and it is
 * therefore excluded from every ordinal comparison below. NULL is a third thing
 * again — no portion was ever observed (a tap, a text log, a device feed). The
 * three states are distinguished by named branches; collapsing any two of them
 * would manufacture an observation out of an absence.
 */
export const PORTION_BAND = ["small", "moderate", "large", "unclear"] as const;
export type PortionBand = (typeof PORTION_BAND)[number];

/** small=1 < moderate=2 < large=3. `unclear` has no rank, on purpose. */
const PORTION_BAND_RANK: Readonly<Record<string, number>> = {
  small: 1,
  moderate: 2,
  large: 3,
};

/** R7 at the column boundary: an unknown band is a data bug, loudly. */
export function parsePortionBand(value: string): PortionBand {
  if ((PORTION_BAND as readonly string[]).includes(value)) return value as PortionBand;
  fail(`unknown portion_band ${JSON.stringify(value)}`);
}

/**
 * The two measures a portion band is commensurable with (CONTRACT NON-INPUT #4:
 * "a photo may evidence presence/composition/PORTION/SERVING"). Both are
 * already in the `measure` vocabulary; nothing new is admitted here.
 */
const BAND_GRADED_MEASURES: ReadonlySet<string> = new Set(["portion", "serving"]);

/**
 * Measures NO branch of `matchEvent` can ever reach without an explicit binding.
 *
 * Documented defect (docs/keel/Q6_NUTRITION_LAYER.md:37, reproduced against this
 * file): `matchEvent` matches on an explicit binding, on `substance_ref`, or on
 * `food_group_ref`. A line "fibre >= 30 g/day" carries neither reference, so a
 * student eating lentils and oats every day matches nothing, and the nominal
 * branch below resolves it `missed` AT EVERY DAY CLOSE, FOR LIFE. The grade is
 * not a judgement about the student; it is the evaluator grading its own
 * inability to observe. That is the exact shape of the failure `unknown` exists
 * to prevent ("`unknown` is first-class and excluded from the denominator").
 *
 * These six are also the measures a photo may NEVER produce (NON-INPUT #4), so
 * the hole cannot be closed by better vision either — only by the student typing
 * a gram figure, which the product refuses.
 */
const UNMATCHABLE_MEASURES: ReadonlySet<string> = new Set([
  "energy",
  "protein",
  "carb",
  "fat",
  "fiber",
  "sodium",
]);

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

/**
 * Swap policy, extracted from `content.swap_policy` BY THE CALLER (R5 frontier
 * above). Shape is deliberately tiny: a policy, not an enumerated menu.
 */
export interface SwapPolicy {
  /** allow substituting any food group of the SAME `food_groups.class` */
  class_equivalent: boolean;
  /** optional explicit allowlist of substitute group slugs (null = no list) */
  allowed_groups?: readonly string[] | null;
}

/** One row of `plan_commitments`, columns only (R5). */
export interface EvaluatorCommitment {
  id: string;
  planVersionId: string;
  userId: string;

  // AXIS 1
  polarity: Polarity;

  // AXIS 2
  anchorKind: AnchorKind;
  slotKey: string | null;
  clockLocal: string | null; // 'HH:MM' | 'HH:MM:SS'
  toleranceMinutes: number | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;

  // AXIS 3
  measure: Measure;
  unit: Unit | null;
  targetOp: TargetOp;
  targetMin: number | null;
  targetMax: number | null;
  tolerancePct: number | null;
  substanceRef: string | null;
  foodGroupRef: string | null;

  // AXIS 4
  evidenceKind: EvidenceKind;
  evidenceRequired: boolean;
  autoSource: AutoSource | null;
  countsTowardAdherence: boolean;

  // CADENCE
  evaluationGrain: EvaluationGrain;
  slotKind: SlotKind | null;
  scheduledDays: readonly DayToken[] | null;
  requiredDaysPerWeek: number | null;
  expectedOccasionsPerDay: number | null;

  // GOVERNANCE
  priority: Priority;
  autonomy: Autonomy;
  flexEligible: boolean;
  status: CommitmentStatus;

  /** R5 frontier: pre-extracted by the caller from `content.swap_policy`. */
  swapPolicy: SwapPolicy | null;
}

/** One row of `protocol_events` (a FACT — append-only, never inferred). */
export interface EvaluatorEvent {
  id: string;
  localDate: string; // YYYY-MM-DD, already resolved in the student's timezone
  /** 'HH:MM' local. null when the caller could not resolve it -> timing unknown. */
  localTime: string | null;
  slotKey: string | null;
  source: EventSource;
  quantity: number | null;
  unit: Unit | null;
  substanceRef: string | null;
  foodGroupRef: string | null;
  evidenceWeight: number | null;
  /**
   * `protocol_events.portion_band` — a COLUMN, read here, never `recognized`
   * jsonb (R5). null on every non-photo fact and on any photo the analyzer did
   * not band.
   *
   * It is deliberately NOT accompanied by a number: the analyzer writes this
   * token while leaving `quantity` and `unit` null, and no branch below turns a
   * band into a quantity. A band is a rank, not a measurement.
   */
  portionBand: PortionBand | null;
  /**
   * Explicit binding to ONE commitment, extracted by the caller from the event
   * payload. `protocol_events` has no commitment_id column: a checkbox tap on
   * "cold exposure 3 min" carries its target in the payload, and the caller
   * hands it over already typed. Null means "no explicit binding" — see
   * `matchesCommitment` for what a bare fact is allowed to bind to.
   */
  commitmentId: string | null;
}

/** One row of `planned_deviations` — flex declared IN ADVANCE. */
export interface EvaluatorPlannedDeviation {
  localDate: string;
  /** null = the whole day is deviated; a slot = only that occasion */
  slotKey: string | null;
  consumedFlex: boolean;
}

export interface EvaluationSnapshot {
  userId: string;
  planVersionId: string;

  /** the day being evaluated (YYYY-MM-DD, student's local calendar) */
  localDate: string;
  /** that day's weekday token, resolved by the caller (R7-parsed) */
  dayOfWeek: DayToken;
  /** ISO week anchor for grain='week' evaluations */
  weekStartDate: string;

  /** true once the local day is over: the end-of-day sweep may resolve missed */
  dayIsClosed: boolean;
  /** true once the local week is over: same, for grain='week' */
  weekIsClosed: boolean;

  /** ISO timestamp stamped on resolved rows. Passed in: a pure fn has no clock. */
  evaluatedAt: string;

  commitments: readonly EvaluatorCommitment[];
  /** facts of `localDate` */
  events: readonly EvaluatorEvent[];
  /** facts of the whole week (INCLUDING `events`), for grain='week' lines */
  weekEvents: readonly EvaluatorEvent[];
  plannedDeviations: readonly EvaluatorPlannedDeviation[];
  /** `food_groups.slug -> class`, read by the caller from the food_groups table */
  foodGroupClasses: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface CommitmentEvaluation {
  userId: string;
  commitmentId: string;
  planVersionId: string;
  localDate: string;
  slotKey: string | null;
  grain: EvaluationGrain;
  /** snapshot of the target at evaluation time (jsonb keys are R1 snake_case) */
  expected: Record<string, unknown>;
  observedValue: number | null;
  observed: Record<string, unknown>;
  status: EvalStatus;
  timingStatus: TimingStatus;
  evidence: EvidenceToken;
  confidence: number | null;
  sourceEventIds: string[];
  resolvedAt: string | null;
  resolvedBy: "system" | null;
  /** carried for the adherence layer; NOT a commitment_evaluations column */
  priority: Priority;
  countsTowardAdherence: boolean;
  expectedEvaluationsPerDay: number;
}

/**
 * An `opportunistic` line with no fact. R6: absence of logging produces a
 * COVERAGE DEFICIT, never a false `missed`. No evaluation row is emitted —
 * silence is not a grade.
 */
export interface CoverageDeficit {
  commitmentId: string;
  localDate: string;
  reason: "opportunistic_no_fact";
}

export interface SkippedCommitment {
  commitmentId: string;
  reason:
    | "commitment_not_active"
    | "not_scheduled_today"
    | "week_grain_not_on_anchor_day";
}

export interface EvaluatorResult {
  evaluations: CommitmentEvaluation[];
  coverageDeficits: CoverageDeficit[];
  skipped: SkippedCommitment[];
}

// ---------------------------------------------------------------------------
// Fail-loud helpers (R7: never undefined, never [], never a silent fallback)
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/evaluator] ${message}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, field: string): string {
  if (!ISO_DATE.test(value)) {
    fail(`${field} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** 'HH:MM' or 'HH:MM:SS' -> minutes since local midnight. Throws otherwise. */
export function parseLocalTimeToMinutes(value: string): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) fail(`local time must be HH:MM or HH:MM:SS, got ${JSON.stringify(value)}`);
  const h = Number(m![1]);
  const min = Number(m![2]);
  if (h > 23 || min > 59) {
    fail(`local time out of range: ${JSON.stringify(value)}`);
  }
  return h * 60 + min;
}

// --- unit conversion -------------------------------------------------------
// R4: storage is SI-ish; comparing a fact to a target may cross scales inside
// ONE family (mg vs g). Crossing families is a data bug, not a rounding case.

const MASS_TO_MG: Record<string, number> = { kg: 1_000_000, g: 1000, mg: 1, mcg: 0.001 };
const VOLUME_TO_ML: Record<string, number> = { l: 1000, ml: 1 };
const DURATION_TO_MIN: Record<string, number> = { h: 60, min: 1 };

function familyOf(unit: string): { name: string; factors: Record<string, number> } | null {
  if (unit in MASS_TO_MG) return { name: "mass", factors: MASS_TO_MG };
  if (unit in VOLUME_TO_ML) return { name: "volume", factors: VOLUME_TO_ML };
  if (unit in DURATION_TO_MIN) return { name: "duration", factors: DURATION_TO_MIN };
  return null;
}

/** Converts `value` from one unit to another inside a family. Throws across families (R7). */
export function convertQuantity(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const a = familyOf(from);
  const b = familyOf(to);
  if (!a || !b || a.name !== b.name) {
    // IU, kcal, capsule, serving... are their own identity: 'IU' is a
    // biological-activity unit, not a mass. Silently treating 5000 IU as
    // 5000 mcg is exactly the class of bug R7 exists to make impossible.
    fail(`cannot convert ${from} to ${to} (incompatible units)`);
  }
  return (value * a.factors[from]) / a.factors[to];
}

// ---------------------------------------------------------------------------
// Fact matching
// ---------------------------------------------------------------------------

interface Match {
  event: EvaluatorEvent;
  /** quantity converted into the commitment's unit (null when unquantified) */
  value: number | null;
  swapApplied: boolean;
  swappedFrom: string | null;
}

function foodGroupClassOf(
  slug: string,
  classes: Readonly<Record<string, string>>,
): string {
  const cls = classes[slug];
  if (cls === undefined) {
    // R7: an unknown food group is a data bug that must surface here, not three
    // layers later as a wrong grade.
    fail(`unknown food_group_ref ${JSON.stringify(slug)} (missing from foodGroupClasses)`);
  }
  return cls!;
}

/**
 * `food_group_ref` branch (R6): match the fact against the referenced group,
 * resolving `class_equivalent` swaps per the swap policy.
 *
 * `autonomy='strict'` vetoes every swap whatever the policy says — the policy
 * describes what the coach tolerates, autonomy says whether the student may use
 * it at all. Fixture 3 line 1: banana in FRUIT under `swap_within_policy` with
 * a class-equivalent policy => met, `observed.swap_applied=true`, zero escalation.
 */
function matchFoodGroup(
  commitment: EvaluatorCommitment,
  eventGroup: string,
  classes: Readonly<Record<string, string>>,
): { matched: boolean; swapApplied: boolean } {
  const target = commitment.foodGroupRef;
  if (!target) return { matched: false, swapApplied: false };
  if (eventGroup === target) return { matched: true, swapApplied: false };
  if (commitment.autonomy === "strict") return { matched: false, swapApplied: false };

  const policy = commitment.swapPolicy;
  const allowed = policy?.allowed_groups ?? null;
  if (allowed && allowed.includes(eventGroup)) {
    return { matched: true, swapApplied: true };
  }

  const classEquivalent = commitment.autonomy === "flexible" ||
    (commitment.autonomy === "swap_within_policy" && policy?.class_equivalent === true);
  if (!classEquivalent) return { matched: false, swapApplied: false };

  const sameClass = foodGroupClassOf(eventGroup, classes) ===
    foodGroupClassOf(target, classes);
  return { matched: sameClass, swapApplied: sameClass };
}

/**
 * SLOT SCOPING of a nominal occasion line, applied to the FOOD-GROUP branch
 * only. This is the fix for the most common recommendation in the world
 * ("protein at dinner") being satisfied by an egg logged at breakfast.
 *
 * WHY IT IS NARROWED TO THE FOOD-GROUP BRANCH, and not applied to every match:
 *
 * - A `food_group_ref` is a CATEGORY, not an identity. `lean_protein` recurs at
 *   every meal of the plan, so a group fact logged at breakfast is evidence
 *   about BREAKFAST. Letting it also satisfy the dinner line credits one fact
 *   to two prescriptions — a manufactured `met`, which is the one thing the
 *   conservative rule below exists to forbid.
 * - A `substance_ref` IS an identity. There is one D3 line; "I took the D3" at
 *   dinner is the prescribed preparation, taken late. R6 requires that to be
 *   expressible as `met` + `off_window` ("otherwise the circadian coach has to
 *   choose between a false met and an unjust missed"). Filtering it out here
 *   would produce exactly the unjust `missed` the contract forbids, so the dose
 *   / micronutrient / explicit-binding branches are NOT slot-scoped.
 * - Window and clock anchors are not touched either: an action done outside its
 *   window is still done — `met` + `off_window` is the WANTED behaviour there
 *   (SCHEMA fixture 2 line 2: morning light at 14:00).
 *
 * A fact with NO slot at all is never rejected: the caller could not resolve an
 * occasion, and turning "we do not know when" into "it did not happen" would be
 * the silence-to-`missed` failure mode. Timing stays `unknown` in that case.
 */
function slotScopeExcludes(
  commitment: EvaluatorCommitment,
  event: EvaluatorEvent,
): boolean {
  if (commitment.evaluationGrain !== "occasion") return false;
  if (commitment.slotKind !== "nominal") return false;
  const slot = commitment.slotKey;
  // 'any_meal' / 'any_time' are the two slots that deliberately assert nothing.
  if (slot === null || slot === "any_meal" || slot === "any_time") return false;
  if (event.slotKey === null) return false;
  return event.slotKey !== slot;
}

/**
 * Does this fact belong to this commitment?
 *
 * THE CONSERVATIVE RULE: without an explicit binding, a fact may only attach to
 * a commitment that carries a structured reference (`substance_ref` or
 * `food_group_ref`). A bare "I did it" cannot be spread across every unanchored
 * line of the plan by proximity — silence and ambiguity both resolve to
 * `unknown`, never to a manufactured `met`.
 */
function matchEvent(
  commitment: EvaluatorCommitment,
  event: EvaluatorEvent,
  classes: Readonly<Record<string, string>>,
): Match | null {
  // Explicit binding wins over every heuristic below.
  if (event.commitmentId !== null) {
    if (event.commitmentId !== commitment.id) return null;
    return {
      event,
      value: quantityIn(commitment, event),
      swapApplied: false,
      swappedFrom: null,
    };
  }

  // measure='dose' (R6): the prescribed PREPARATION, identified by substance_ref.
  // measure='micronutrient' (R6): elemental quantities EXPLICITLY reported, all
  // sources confounded. Both match on substance_ref equality — which is exactly
  // what seals NON-INPUT #3: a food log carries food_group_ref with a null
  // substance_ref and can never reach this branch.
  if (commitment.measure === "dose" || commitment.measure === "micronutrient") {
    if (!commitment.substanceRef || event.substanceRef !== commitment.substanceRef) {
      return null;
    }
    if (commitment.measure === "micronutrient" && event.quantity === null) {
      // "explicitly reported" means a number. A mention is not a quantity.
      return null;
    }
    return {
      event,
      value: quantityIn(commitment, event),
      swapApplied: false,
      swappedFrom: null,
    };
  }

  // polarity='avoid' with a substance_ref: a contrary fact may be reported as a
  // substance ('gluten') or as a food group ('alcohol' exists in both
  // vocabularies). Both are the same violation.
  if (commitment.polarity === "avoid" && commitment.substanceRef) {
    const hit = event.substanceRef === commitment.substanceRef ||
      event.foodGroupRef === commitment.substanceRef;
    if (!hit) return null;
    return {
      event,
      value: quantityIn(commitment, event),
      swapApplied: false,
      swappedFrom: null,
    };
  }

  // food_group_ref branch, with swap resolution and slot scoping.
  if (commitment.foodGroupRef) {
    if (!event.foodGroupRef) return null;
    if (slotScopeExcludes(commitment, event)) return null;
    const { matched, swapApplied } = matchFoodGroup(commitment, event.foodGroupRef, classes);
    if (!matched) return null;
    return {
      event,
      value: quantityIn(commitment, event),
      swapApplied,
      swappedFrom: swapApplied ? event.foodGroupRef : null,
    };
  }

  return null;
}

/** Event quantity expressed in the commitment's unit (null when unquantified). */
function quantityIn(commitment: EvaluatorCommitment, event: EvaluatorEvent): number | null {
  if (event.quantity === null) return null;
  // 'none' is the unit of a non-quantitative line (presence/composition/boolean):
  // a number carried alongside such a fact is incidental, not commensurable.
  if (!event.unit || !commitment.unit) return event.quantity;
  if (commitment.unit === "none" || event.unit === "none") return event.quantity;
  return convertQuantity(event.quantity, event.unit, commitment.unit);
}

// ---------------------------------------------------------------------------
// Target comparison
// ---------------------------------------------------------------------------

function toleranceFor(commitment: EvaluatorCommitment): number {
  // 'hhmm' is a clock reading encoded as a number (2300), not a magnitude:
  // a 10% tolerance on 2300 would be 230 minutes of nothing. Force zero.
  if (commitment.unit === "hhmm") return 0;
  const pct = commitment.tolerancePct;
  if (pct === null || pct === undefined) return 0;
  return pct / 100;
}

type Grade = Extract<EvalStatus, "met" | "partial" | "missed">;

/** Numeric comparator for `do`/`capture` lines that have at least one fact. */
function gradeAgainstTarget(
  commitment: EvaluatorCommitment,
  observed: number | null,
): Grade {
  const op: TargetOp = commitment.targetOp;
  if (op === "any") return "met";

  // A fact with no number against a numeric target: the capture happened but
  // the level is unknown-in-fact. Graded `partial`, never `met` (a missing
  // number must not become a passing grade) and never `missed` (something was
  // reported). `boolean`/`presence`/`composition` lines are the nominal case.
  if (observed === null) {
    if (
      commitment.measure === "boolean" || commitment.measure === "presence" ||
      commitment.measure === "composition"
    ) {
      return "met";
    }
    return "partial";
  }

  const tol = toleranceFor(commitment);
  const min = commitment.targetMin;
  const max = commitment.targetMax;

  switch (op) {
    case ">=": {
      if (min === null) fail(`target_op '>=' requires target_min (commitment ${commitment.id})`);
      if (observed >= min! * (1 - tol)) return "met";
      return observed > 0 ? "partial" : "missed";
    }
    case "<=": {
      if (max === null) fail(`target_op '<=' requires target_max (commitment ${commitment.id})`);
      // A cap is a cap: exceeding it is not "half done".
      return observed <= max! * (1 + tol) ? "met" : "missed";
    }
    case "==": {
      if (min === null) fail(`target_op '==' requires target_min (commitment ${commitment.id})`);
      const t = min!;
      const band = Math.abs(t) * tol;
      if (Math.abs(observed - t) <= band) return "met";
      return observed > 0 ? "partial" : "missed";
    }
    case "between": {
      if (min === null || max === null) {
        fail(`target_op 'between' requires both bounds (commitment ${commitment.id})`);
      }
      if (observed >= min! * (1 - tol) && observed <= max! * (1 + tol)) return "met";
      return observed > 0 ? "partial" : "missed";
    }
  }
  fail(`unhandled target_op ${JSON.stringify(op)}`);
}

/**
 * `required_days_per_week` is THE DENOMINATOR of a week-grain line (SCHEMA.md
 * says so in the column comment). "Legumineuses 3x/semaine" is a statement about
 * THREE DAYS, not about three portions: three servings eaten on Sunday is one
 * day of exposure, and grading it `met` rewards exactly the behaviour the line
 * was written to prevent.
 *
 * The observed VALUE stays the sum — it is stored and rendered next to
 * `expected.unit` ('serving'), so overwriting it with a day count would make the
 * column lie about its unit. The day requirement is therefore a GATE on the
 * grade, not a substitution of the measurement: it can only pull `met` down to
 * `partial` (something WAS reported: it is not a `missed`), never push a grade up.
 *
 * Restricted to grain='week' on purpose. Daily lines routinely carry
 * `required_days_per_week=7` (SCHEMA fixture 1 lines 1-4, 6): comparing a
 * distinct-day count against a 5000 IU target there would be nonsense. On a
 * day/occasion line the day filter is `scheduled_days`, not this column.
 */
function distinctDayGate(
  commitment: EvaluatorCommitment,
  matches: readonly Match[],
  grade: Grade,
): Grade {
  if (commitment.evaluationGrain !== "week") return grade;
  const required = commitment.requiredDaysPerWeek;
  if (required === null || required === undefined) return grade;
  if (grade !== "met") return grade;
  return distinctDaysOf(matches) >= required ? "met" : "partial";
}

function distinctDaysOf(matches: readonly Match[]): number {
  return new Set(matches.map((m) => m.event.localDate)).size;
}

// ---------------------------------------------------------------------------
// R6 NAMED BRANCH — measure IN ('portion','serving'): the ORDINAL BAND
// ---------------------------------------------------------------------------
//
// WHAT THIS BRANCH IS FOR. `portion_band` was already computed on every meal
// photo and written into `recognized` jsonb, which R5 forbids the evaluator to
// read. A manifestly enormous plate therefore graded exactly like a token one.
// The band is now a column, and this is the branch that reads it.
//
// WHAT IT REFUSES TO DO, and this is the whole design:
//
//   * it NEVER produces a number. `quantity` and `unit` are untouched, and
//     `observedValue` is computed before this gate ever runs. Translating
//     `large` into "2 servings" is the calorie mistake wearing a different hat:
//     measured on 85 real calls of the production model, the energy bias is
//     -26.6%, weekly aggregation divides the error by 1.04, and the delta is
//     2.5x worse than the level (docs/keel/PHOTO_QUANTIFICATION.md §3).
//
//   * it NEVER pushes a grade UP. A band cannot manufacture a `met`: "the plate
//     looked big" is not "the student ate two servings". Same discipline as
//     `distinctDayGate` — a gate on the grade, not a substitution of the
//     measurement.
//
//   * it NEVER pulls a grade DOWN on a LOWER-BOUND line, and that restriction is
//     load-bearing, not caution. PROPERTY TEST 1 of `evaluator_test.ts` pins
//     "logging a non-conforming meal never lowers the day score": if a `small`
//     band could downgrade a floor line, sending the photo would cost the
//     student points that hiding the plate would not. That is the concealer's
//     advantage, and it is the one thing this evaluator may never create.
//
// SO WHERE DOES IT FIRE? On an UPPER-BOUND target (`<=`) — the case
// `evaluator_test.ts` already isolates as "PROPERTY exception 1/3 — an
// upper-bound cap: the report IS the grade". A cap says "keep this small"; a
// `large` band is direct visible evidence against it, and downgrading is the
// prescription speaking, not a scoring artifact.
//
// DISARM CONDITIONS, stated per token (doctrine P9 — a belt says when it does
// NOT fire):
//   small     — consistent with a ceiling. Never moves a grade.
//   moderate  — the band that confirms nothing and contradicts nothing, by
//               construction. Never moves a grade, in either direction.
//   large     — the ONLY gating token, and only under `<=`: met -> partial.
//               Never met -> missed: a band is not a measurement and cannot
//               close the case; `partial` is this repo's token for "reported,
//               level not established".
//   unclear   — the model looked and could not rank. No ordinal content, so no
//               gate, and it is excluded from `decidable` below.
//   (null)    — no portion was observed at all. Not a band, not a verdict.
//
// All four tokens ARE read by `portionBandDistribution`, which travels on every
// evaluation and is what the coach's weekly view aggregates ("11 plates seen:
// 2 small, 5 moderate, 4 large"). That is the answer to "is he eating a lot or
// a little?" with no kcal anywhere in it.

export interface PortionBandCounts {
  small: number;
  moderate: number;
  large: number;
  unclear: number;
  /** facts carrying any band (the four counts above) */
  observed: number;
  /** facts carrying a RANKABLE band — `unclear` excluded, on purpose */
  decidable: number;
}

export function emptyPortionBandCounts(): PortionBandCounts {
  return { small: 0, moderate: 0, large: 0, unclear: 0, observed: 0, decidable: 0 };
}

/** Counts the bands of a set of facts. R7: an off-vocabulary band throws. */
export function countPortionBands(
  bands: readonly (string | null | undefined)[],
): PortionBandCounts {
  const counts = emptyPortionBandCounts();
  for (const raw of bands) {
    if (raw === null || raw === undefined) continue;
    const band = parsePortionBand(raw);
    counts[band] += 1;
    counts.observed += 1;
    if (band in PORTION_BAND_RANK) counts.decidable += 1;
  }
  return counts;
}

function portionBandDistribution(matches: readonly Match[]): PortionBandCounts {
  return countPortionBands(matches.map((m) => m.event.portionBand));
}

/**
 * The gate itself. Downgrade-only, upper-bound-only, `large`-only.
 *
 * Returns the grade unchanged in every other configuration — including when the
 * line is not band-graded, when no fact carries a band, and when the only bands
 * present are `unclear`.
 */
function portionBandGate(
  commitment: EvaluatorCommitment,
  matches: readonly Match[],
  grade: Grade,
): Grade {
  if (!BAND_GRADED_MEASURES.has(commitment.measure)) return grade;
  // A cap, and nothing else. See the block comment above for why the floor
  // direction is structurally excluded rather than merely unimplemented.
  if (commitment.targetOp !== "<=") return grade;
  if (grade !== "met") return grade;
  const counts = portionBandDistribution(matches);
  return counts.large > 0 ? "partial" : grade;
}

// ---------------------------------------------------------------------------
// timing_status — the SECOND, independent output field (R6)
// ---------------------------------------------------------------------------

function timingFor(
  commitment: EvaluatorCommitment,
  matches: readonly Match[],
): TimingStatus {
  const hasWindow = commitment.windowStartLocal !== null && commitment.windowEndLocal !== null;
  const hasClock = commitment.clockLocal !== null;

  if (!hasWindow && !hasClock) {
    // A 'slot' anchor IS a time statement: the D3 prescribed at breakfast and
    // swallowed at dinner is met + off_window. 'any_meal'/'any_time' are the
    // two slots that deliberately assert nothing about timing.
    const slot = commitment.slotKey;
    if (
      commitment.anchorKind === "slot" && slot !== null &&
      slot !== "any_meal" && slot !== "any_time"
    ) {
      if (matches.length === 0) return "unknown";
      const loggedSlots = matches
        .map((m) => m.event.slotKey)
        .filter((s): s is string => s !== null);
      if (loggedSlots.length === 0) return "unknown";
      return loggedSlots.some((s) => s === slot) ? "on_time" : "off_window";
    }
    // A 'free' anchor has no time to be wrong about.
    return "not_applicable";
  }
  if (matches.length === 0) return "unknown";

  const times = matches
    .map((m) => m.event.localTime)
    .filter((t): t is string => t !== null)
    .map(parseLocalTimeToMinutes);
  if (times.length === 0) return "unknown";

  if (hasWindow) {
    const start = parseLocalTimeToMinutes(commitment.windowStartLocal!);
    const end = parseLocalTimeToMinutes(commitment.windowEndLocal!);
    // A window MAY cross midnight (16:8 eating window 20:00 -> 12:00): there is
    // deliberately no start<end CHECK in the schema, so wrap here.
    const inside = (t: number) => (start <= end ? t >= start && t <= end : t >= start || t <= end);
    return times.some(inside) ? "on_time" : "off_window";
  }

  const clock = parseLocalTimeToMinutes(commitment.clockLocal!);
  const tol = commitment.toleranceMinutes ?? 0;
  // The comparator says what kind of clock this is: '<=' is a deadline
  // ("in bed by 23:00"), '>=' an earliest, '==' an appointment.
  const ok = (t: number) => {
    if (commitment.targetOp === "<=") return t <= clock + tol;
    if (commitment.targetOp === ">=") return t >= clock - tol;
    return Math.abs(t - clock) <= tol;
  };
  return times.some(ok) ? "on_time" : "off_window";
}

// ---------------------------------------------------------------------------
// Evidence + confidence
// ---------------------------------------------------------------------------

const EVIDENCE_RANK: Record<EventSource, number> = {
  coach_entry: 6,
  photo: 5,
  integration: 4,
  text: 3,
  voice: 3,
  chat: 3,
  quick_tap: 2,
};

const EVIDENCE_MAP: Record<EventSource, EvidenceToken> = {
  photo: "photo",
  text: "text_log",
  voice: "text_log",
  chat: "text_log",
  quick_tap: "self_report",
  integration: "integration",
  coach_entry: "coach_override",
};

function evidenceFor(matches: readonly Match[]): EvidenceToken {
  if (matches.length === 0) return "none";
  let best = matches[0].event.source;
  for (const m of matches) {
    if (EVIDENCE_RANK[m.event.source] > EVIDENCE_RANK[best]) best = m.event.source;
  }
  return EVIDENCE_MAP[best];
}

function confidenceFor(matches: readonly Match[]): number | null {
  const weights = matches
    .map((m) => m.event.evidenceWeight)
    .filter((w): w is number => typeof w === "number");
  if (weights.length === 0) return null;
  return weights.reduce((a, b) => a + b, 0) / weights.length;
}

// ---------------------------------------------------------------------------
// Occasion model
// ---------------------------------------------------------------------------

/**
 * How many evaluation ROWS this commitment can produce on a day. It is the
 * denominator of `coverage_C` in the adherence formula.
 *
 * - grain 'day' / 'week': exactly ONE row (slot_key null). The target already
 *   aggregates the occasions ("2 servings/day" is one day-grain comparison), so
 *   dividing by `expected_occasions_per_day` here would apply a constant,
 *   information-free weight reduction to every multi-serving line.
 * - grain 'occasion': `expected_occasions_per_day` — this is where the column
 *   is alive. A `nominal` occasion line is anchored on ONE slot and therefore
 *   yields one row; an `opportunistic` one is born from facts and yields one row
 *   per distinct slot logged.
 */
function expectedEvaluationsPerDay(commitment: EvaluatorCommitment): number {
  if (commitment.evaluationGrain !== "occasion") return 1;
  const n = commitment.expectedOccasionsPerDay ?? 1;
  return n > 0 ? n : 1;
}

function deviationCovers(
  deviation: EvaluatorPlannedDeviation,
  localDate: string,
  slotKey: string | null,
): boolean {
  if (deviation.localDate !== localDate) return false;
  if (deviation.slotKey === null) return true; // the whole day is off-plan
  return deviation.slotKey === slotKey;
}

// ---------------------------------------------------------------------------
// The evaluator
// ---------------------------------------------------------------------------

/** Runtime re-parse of the tokens this evaluator branches on (R7). */
function validateCommitment(c: EvaluatorCommitment): void {
  parsePolarity(c.polarity);
  parseMeasure(c.measure);
  parseTargetOp(c.targetOp);
  parseEvaluationGrain(c.evaluationGrain);
}

export function evaluateSnapshot(snapshot: EvaluationSnapshot): EvaluatorResult {
  assertIsoDate(snapshot.localDate, "snapshot.localDate");
  assertIsoDate(snapshot.weekStartDate, "snapshot.weekStartDate");

  const evaluations: CommitmentEvaluation[] = [];
  const coverageDeficits: CoverageDeficit[] = [];
  const skipped: SkippedCommitment[] = [];

  for (const commitment of snapshot.commitments) {
    validateCommitment(commitment);

    if (commitment.status !== "active") {
      skipped.push({ commitmentId: commitment.id, reason: "commitment_not_active" });
      continue;
    }

    if (commitment.evaluationGrain === "week") {
      // One row per week, anchored on the week start date, so the unique key
      // (user, commitment, date, slot) holds exactly one row per week.
      evaluations.push(evaluateWeekGrain(commitment, snapshot));
      continue;
    }

    // scheduled_days is the day filter for occasion/day grains.
    if (
      commitment.scheduledDays !== null &&
      !commitment.scheduledDays.includes(snapshot.dayOfWeek)
    ) {
      skipped.push({ commitmentId: commitment.id, reason: "not_scheduled_today" });
      continue;
    }

    const matches = snapshot.events
      .map((e) => matchEvent(commitment, e, snapshot.foodGroupClasses))
      .filter((m): m is Match => m !== null);

    // slot_kind='opportunistic' (R6): the evaluation is BORN when a fact
    // arrives. No fact means a coverage deficit, never a false missed.
    if (commitment.slotKind === "opportunistic" && matches.length === 0) {
      coverageDeficits.push({
        commitmentId: commitment.id,
        localDate: snapshot.localDate,
        reason: "opportunistic_no_fact",
      });
      continue;
    }

    if (
      commitment.evaluationGrain === "occasion" &&
      commitment.slotKind === "opportunistic"
    ) {
      // One row per distinct slot the student actually logged.
      const bySlot = new Map<string, Match[]>();
      for (const m of matches) {
        const slot = m.event.slotKey ?? commitment.slotKey ?? "any_time";
        const list = bySlot.get(slot);
        if (list) list.push(m);
        else bySlot.set(slot, [m]);
      }
      for (const [slot, slotMatches] of [...bySlot.entries()].sort()) {
        evaluations.push(
          buildEvaluation(commitment, snapshot, slot, slotMatches, snapshot.localDate, false),
        );
      }
      continue;
    }

    const slotKey = commitment.evaluationGrain === "occasion" ? commitment.slotKey : null;
    evaluations.push(
      buildEvaluation(commitment, snapshot, slotKey, matches, snapshot.localDate, false),
    );
  }

  return { evaluations, coverageDeficits, skipped };
}

function evaluateWeekGrain(
  commitment: EvaluatorCommitment,
  snapshot: EvaluationSnapshot,
): CommitmentEvaluation {
  const matches = snapshot.weekEvents
    .map((e) => matchEvent(commitment, e, snapshot.foodGroupClasses))
    .filter((m): m is Match => m !== null);
  return buildEvaluation(
    commitment,
    snapshot,
    null,
    matches,
    snapshot.weekStartDate,
    true,
  );
}

function buildEvaluation(
  commitment: EvaluatorCommitment,
  snapshot: EvaluationSnapshot,
  slotKey: string | null,
  matches: readonly Match[],
  localDate: string,
  isWeekGrain: boolean,
): CommitmentEvaluation {
  const isClosed = isWeekGrain ? snapshot.weekIsClosed : snapshot.dayIsClosed;

  const expected: Record<string, unknown> = {
    measure: commitment.measure,
    unit: commitment.unit,
    target_op: commitment.targetOp,
    target_min: commitment.targetMin,
    target_max: commitment.targetMax,
    tolerance_pct: commitment.tolerancePct,
    substance_ref: commitment.substanceRef,
    food_group_ref: commitment.foodGroupRef,
    polarity: commitment.polarity,
    slot_kind: commitment.slotKind,
    auto_source: commitment.autoSource,
    // The week-grain DENOMINATOR travels with the target it gates: without it,
    // a coach reading `observed.distinct_days` has no bar to read it against.
    required_days_per_week: commitment.requiredDaysPerWeek,
  };

  const quantified = matches.filter((m) => m.value !== null);
  const observedValue = quantified.length > 0
    ? quantified.reduce((sum, m) => sum + (m.value as number), 0)
    : null;

  const observed: Record<string, unknown> = {
    matched_event_count: matches.length,
    swap_applied: matches.some((m) => m.swapApplied),
    swapped_from: matches.find((m) => m.swappedFrom !== null)?.swappedFrom ?? null,
    distinct_days: [...new Set(matches.map((m) => m.event.localDate))].length,
    // The ordinal magnitude, carried on EVERY evaluation (R1: snake_case keys
    // and token values inside jsonb). It is an OBSERVATION, next to
    // `observedValue` and never inside it: the coach reads "2 small, 5 moderate,
    // 4 large" and no kcal figure exists anywhere to be read instead.
    portion_bands: portionBandDistribution(matches),
  };

  const { status, timingStatus } = deriveStatus({
    commitment,
    snapshot,
    slotKey,
    matches,
    observedValue,
    localDate,
    isClosed,
  });

  const resolved = status !== "unknown";

  return {
    userId: commitment.userId,
    commitmentId: commitment.id,
    planVersionId: commitment.planVersionId,
    localDate,
    slotKey,
    grain: commitment.evaluationGrain,
    expected,
    observedValue,
    observed,
    status,
    timingStatus,
    evidence: evidenceFor(matches),
    confidence: confidenceFor(matches),
    sourceEventIds: matches.map((m) => m.event.id),
    resolvedAt: resolved ? snapshot.evaluatedAt : null,
    resolvedBy: resolved ? "system" : null,
    priority: commitment.priority,
    countsTowardAdherence: commitment.countsTowardAdherence,
    expectedEvaluationsPerDay: expectedEvaluationsPerDay(commitment),
  };
}

function deriveStatus(args: {
  commitment: EvaluatorCommitment;
  snapshot: EvaluationSnapshot;
  slotKey: string | null;
  matches: readonly Match[];
  observedValue: number | null;
  localDate: string;
  isClosed: boolean;
}): { status: EvalStatus; timingStatus: TimingStatus } {
  const { commitment, snapshot, slotKey, matches, observedValue, localDate, isClosed } = args;

  // ---- planned_deviations: declared IN ADVANCE ---------------------------
  // Two named branches, not one: a deviation that SPENT a flex on a
  // flex-eligible line is `flex_used` (scores 1, STAYS in the denominator —
  // the allowance was used, that is the point of having one); any other
  // declared deviation is `not_applicable` and leaves the denominator.
  const deviation = snapshot.plannedDeviations.find((d) =>
    deviationCovers(d, localDate, slotKey)
  );
  if (deviation) {
    if (deviation.consumedFlex && commitment.flexEligible) {
      return { status: "flex_used", timingStatus: "not_applicable" };
    }
    return { status: "not_applicable", timingStatus: "not_applicable" };
  }

  // ---- polarity='avoid' (R6): INVERTED DEFAULT ---------------------------
  // No fact => met. A contrary fact => missed. Timing is meaningless for a
  // prohibition, so it is not_applicable, not unknown.
  if (commitment.polarity === "avoid") {
    return {
      status: matches.length > 0 ? "missed" : "met",
      timingStatus: "not_applicable",
    };
  }

  const timingStatus = timingFor(commitment, matches);

  if (matches.length === 0) {
    // ---- auto_source non-null (R6): a SILENT DEVICE FEED ------------------
    // A Whoop that did not sync is not a student who did not comply. This
    // branch never yields `missed`, not even at day close — it is the
    // guardrail that stops an unsynced device from sinking the score of a
    // perfectly observant student. (When counts_toward_adherence=false the
    // line is also out of the denominator entirely — see adherence.ts.)
    if (commitment.autoSource !== null) {
      return { status: "unknown", timingStatus: "unknown" };
    }
    // ---- STRUCTURALLY UNOBSERVABLE LINE (R6): unknown, never missed ---------
    // Q6_NUTRITION_LAYER.md:37, reproduced: a line whose `measure` is one of the
    // six macro measures AND which carries neither `substance_ref` nor
    // `food_group_ref` cannot be reached by ANY branch of `matchEvent`. Left to
    // the nominal branch below it returns `missed` at every day close, for life,
    // for a student who eats perfectly — the evaluator grading its own blindness
    // as the student's failure.
    //
    // DISARM CONDITION: the moment the line carries a structured reference, or
    // the moment a fact binds to it explicitly (a tap carries `commitment_id`,
    // which produces a match and never reaches this block), the line IS
    // observable and its absence IS meaningful — it goes back to `missed` at
    // close through the branch below. This exemption covers exactly the lines
    // nothing can ever satisfy, and it disappears the instant one can.
    if (isStructurallyUnobservable(commitment)) {
      return { status: "unknown", timingStatus };
    }
    // ---- slot_kind='nominal' (R6): pre-seeded unknown, missed at close ----
    // Also the default for day-grain lines with no slot_kind: a prescriptive
    // plan stays evaluable without logging. `opportunistic` never reaches here
    // (it produced a coverage deficit upstream).
    return { status: isClosed ? "missed" : "unknown", timingStatus };
  }

  // ---- polarity='capture' (R6): the CAPTURE is graded, never the value ---
  // "Sleep 7-9 h" with 6 h logged is a successful capture. Grading the value
  // would turn a measurement into a demand, which is precisely why `capture`
  // exists as a third polarity instead of a flag on `do`.
  if (commitment.polarity === "capture") {
    return { status: "met", timingStatus };
  }

  // ---- polarity='do' ----------------------------------------------------
  // The numeric comparison first, then the week-grain day requirement (which
  // can only downgrade it — see `distinctDayGate`).
  const grade = gradeAgainstTarget(commitment, observedValue);
  const gated = distinctDayGate(commitment, matches, grade);
  return { status: portionBandGate(commitment, matches, gated), timingStatus };
}

/**
 * Can any fact ever reach this line? See `UNMATCHABLE_MEASURES`.
 *
 * Both conditions are required. `measure='fiber'` WITH `food_group_ref='legumes'`
 * is observable (the food-group branch matches it), so its silence is a real
 * silence and stays `missed` at close. Only the line with no handle at all is
 * exempted.
 */
export function isStructurallyUnobservable(commitment: EvaluatorCommitment): boolean {
  // Falsy rather than `=== null`: an empty string is not a reference either, and
  // treating "" as a handle would re-open the life sentence this fixes.
  return UNMATCHABLE_MEASURES.has(commitment.measure) &&
    !commitment.substanceRef &&
    !commitment.foodGroupRef;
}

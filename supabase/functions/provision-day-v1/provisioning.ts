/**
 * KEEL W4.2 — pure selection logic of the day-provisioning pass.
 *
 * Authority: docs/keel/CONTRACT.md (R1, R5, R6, R7), docs/keel/SCHEMA.md,
 * docs/keel/BUILD_PLAN.md W4.2.
 * Database side: supabase/migrations/20260727175000_keel_provisioning.sql
 *
 * NO I/O HERE. This module answers one question — "which commitment_evaluations
 * does this student's day open with?" — from values, so the answer is testable
 * without a database, a clock or a fleet. `index.ts` does the fetching, this
 * file does the deciding, `keel_seed_evaluations` does the writing (and
 * re-validates, because the caller is never the arbiter of truth).
 *
 * R6, the branch that governs this whole file:
 *   slot_kind='nominal'        -> pre-seeded `unknown` at day open, `missed` at
 *                                 day close if still unresolved.
 *   slot_kind='opportunistic'  -> NOTHING IS SEEDED. The evaluation is born
 *                                 when a fact arrives; the absence of logging
 *                                 is a coverage deficit, never a false
 *                                 `missed`. Seeding one here would manufacture
 *                                 exactly that false missed at 23:55.
 */

import {
  type DayToken,
  type EvaluationGrain,
  parseDayToken,
  parseEvaluationGrain,
  parsePolarity,
  parseSlotKind,
  parseTargetOp,
  type SlotKind,
} from "../_shared/keel/tokens.ts";

// ---------------------------------------------------------------------------
// Seams with the rest of KEEL (R1: ASCII snake_case tokens)
// ---------------------------------------------------------------------------

/**
 * Prefix of every `scheduled_checkins.event_context` derived from a KEEL
 * prescription (W4.6 seeds `keel_slot_reminder:<slot>` and
 * `keel_sunday_digest`). Republication cancels these and ONLY these: a
 * student's own recurring reminder is not a prescription.
 *
 * Mirrored by the `like 'keel\_%'` predicate of
 * `keel_cancel_inflight_checkins` in the W4.2 migration.
 */
export const KEEL_CHECKIN_EVENT_CONTEXT_PREFIX = "keel_";

/**
 * Local hour window of the end-of-day sweep, [start, end).
 *
 * The provisioning window ([00, 01), reused verbatim from
 * schedule-whatsapp-v2-checkins/timezone_gate.ts) and this one are the two
 * hour-shaped gates of the pass. Both are HOURS, never minutes: gating on a
 * local minute would permanently exclude the half-hour and quarter-hour
 * offsets (Asia/Kolkata +5:30, Asia/Kathmandu +5:45, Pacific/Chatham +12:45),
 * whose local minute never equals the cron minute.
 */
export const SWEEP_WINDOW_START_HOUR = 23;
export const SWEEP_WINDOW_END_HOUR = 24;

// ---------------------------------------------------------------------------
// Fail-loud helper (R7)
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/provisioning] ${message}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!ISO_DATE.test(text)) {
    fail(`${field} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  return text;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fail(`${field} must be a finite number, got ${JSON.stringify(value)}`);
  }
  return n;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) fail(`${field} is required`);
  return text;
}

// ---------------------------------------------------------------------------
// phase_plan
// ---------------------------------------------------------------------------

/**
 * One entry of `plan_versions.phase_plan`.
 *
 * SEMANTICS FIXED HERE, because nothing consumed this column before W4.2:
 * `week_from` / `week_to` are **1-based and inclusive** calendar weeks of the
 * plan. Week 1 is the week that starts on `anchor_week_start`. "Weeks 1-4" is
 * what a coach writes on paper and what the import prompt transcribes; a
 * 0-based reading would silently shift every phase by one week, which on a
 * 4-week phase is a 25 % error in the wrong direction.
 */
export interface PhaseWindow {
  phaseId: string;
  weekFrom: number;
  weekTo: number;
}

/** R7: a malformed phase entry throws rather than being dropped. */
export function parsePhasePlan(raw: unknown): PhaseWindow[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    fail(`phase_plan must be a jsonb array, got ${typeof raw}`);
  }
  return (raw as unknown[]).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`phase_plan[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const phaseId = requiredText(record.phase_id, `phase_plan[${index}].phase_id`);
    const weekFrom = optionalNumber(record.week_from, `phase_plan[${index}].week_from`);
    const weekTo = optionalNumber(record.week_to, `phase_plan[${index}].week_to`);
    if (weekFrom === null || weekTo === null) {
      fail(`phase_plan[${index}] (${phaseId}) must carry week_from and week_to`);
    }
    if (!Number.isInteger(weekFrom) || !Number.isInteger(weekTo)) {
      fail(`phase_plan[${index}] (${phaseId}) week bounds must be integers`);
    }
    if (weekFrom < 1) {
      fail(
        `phase_plan[${index}] (${phaseId}) week_from must be >= 1 ` +
          `(week numbers are 1-based), got ${weekFrom}`,
      );
    }
    if (weekTo < weekFrom) {
      fail(
        `phase_plan[${index}] (${phaseId}) week_to (${weekTo}) is before ` +
          `week_from (${weekFrom})`,
      );
    }
    return { phaseId, weekFrom, weekTo };
  });
}

// ---------------------------------------------------------------------------
// Row types (columns only — R5: `content` jsonb is never read here)
// ---------------------------------------------------------------------------

export interface ProvisionPlanVersion {
  id: string;
  studentId: string;
  timezone: string;
  anchorWeekStart: string | null;
  durationWeeks: number | null;
  weekStartsOn: DayToken;
  phasePlan: readonly PhaseWindow[];
}

export interface ProvisionCommitment {
  id: string;
  planVersionId: string;
  userId: string;
  status: string;
  slotKind: SlotKind | null;
  evaluationGrain: EvaluationGrain;
  slotKey: string | null;
  scheduledDays: readonly DayToken[] | null;
  phaseId: string | null;
  /** snapshot inputs for `expected` — all columns, never jsonb (R5) */
  polarity: string;
  measure: string;
  unit: string | null;
  targetOp: string;
  targetMin: number | null;
  targetMax: number | null;
  tolerancePct: number | null;
  substanceRef: string | null;
  foodGroupRef: string | null;
  autoSource: string | null;
}

export function parseProvisionPlanVersion(
  row: Record<string, unknown>,
): ProvisionPlanVersion {
  return {
    id: requiredText(row.id, "plan_versions.id"),
    studentId: requiredText(row.student_id, "plan_versions.student_id"),
    timezone: requiredText(row.timezone, "plan_versions.timezone"),
    anchorWeekStart: row.anchor_week_start
      ? assertIsoDate(row.anchor_week_start, "plan_versions.anchor_week_start")
      : null,
    durationWeeks: optionalNumber(
      row.duration_weeks,
      "plan_versions.duration_weeks",
    ),
    weekStartsOn: parseDayToken(row.week_starts_on ?? "mon"),
    phasePlan: parsePhasePlan(row.phase_plan),
  };
}

export function parseProvisionCommitment(
  row: Record<string, unknown>,
): ProvisionCommitment {
  const scheduledDaysRaw = row.scheduled_days;
  const scheduledDays = scheduledDaysRaw === null ||
      scheduledDaysRaw === undefined
    ? null
    // R7: a French weekday ("dimanche") or a typo throws here, at the read,
    // not three layers later at render. parseDayToken owns that contract.
    : (scheduledDaysRaw as unknown[]).map((d) => parseDayToken(d));

  return {
    id: requiredText(row.id, "plan_commitments.id"),
    planVersionId: requiredText(
      row.plan_version_id,
      "plan_commitments.plan_version_id",
    ),
    userId: requiredText(row.user_id, "plan_commitments.user_id"),
    status: requiredText(row.status, "plan_commitments.status"),
    slotKind: row.slot_kind === null || row.slot_kind === undefined
      ? null
      : parseSlotKind(row.slot_kind),
    evaluationGrain: parseEvaluationGrain(row.evaluation_grain),
    slotKey: optionalText(row.slot_key),
    scheduledDays,
    phaseId: optionalText(row.phase_id),
    polarity: parsePolarity(row.polarity),
    measure: requiredText(row.measure, "plan_commitments.measure"),
    unit: optionalText(row.unit),
    targetOp: parseTargetOp(row.target_op),
    targetMin: optionalNumber(row.target_min, "plan_commitments.target_min"),
    targetMax: optionalNumber(row.target_max, "plan_commitments.target_max"),
    tolerancePct: optionalNumber(
      row.tolerance_pct,
      "plan_commitments.tolerance_pct",
    ),
    substanceRef: optionalText(row.substance_ref),
    foodGroupRef: optionalText(row.food_group_ref),
    autoSource: optionalText(row.auto_source),
  };
}

/** Columns the provisioning pass selects. Kept next to the parser. */
export const PROVISION_COMMITMENT_COLUMNS = [
  "id",
  "plan_version_id",
  "user_id",
  "status",
  "slot_kind",
  "evaluation_grain",
  "slot_key",
  "scheduled_days",
  "phase_id",
  "polarity",
  "measure",
  "unit",
  "target_op",
  "target_min",
  "target_max",
  "tolerance_pct",
  "substance_ref",
  "food_group_ref",
  "auto_source",
].join(",");

export const PROVISION_PLAN_VERSION_COLUMNS = [
  "id",
  "student_id",
  "timezone",
  "anchor_week_start",
  "duration_weeks",
  "week_starts_on",
  "phase_plan",
].join(",");

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function ymdToUtcMillis(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

/** Weekday token of a YYYY-MM-DD local date. */
export function dayTokenForLocalDate(localDate: string): DayToken {
  assertIsoDate(localDate, "localDate");
  const dow = new Date(ymdToUtcMillis(localDate)).getUTCDay(); // 0 = Sunday
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[dow];
}

/**
 * The student's local calendar date at `now`, in `timezone`.
 *
 * WHY NOT `_shared/action_occurrences.ts::localDateYmdInTimezone`
 * That helper resolves an unusable timezone to `Europe/Paris`, silently. On the
 * legacy French branch that default is defensible; here it would open a New
 * York student's day on Paris dates, pre-seed the wrong weekday's commitments
 * and sweep them at the wrong hour — a silent fallback producing wrong data,
 * which is precisely what R7 forbids. So this one THROWS, exactly like
 * `localHourInTimezone` in the W1.3 gate, and the caller isolates the throw to
 * the row that carries the bad timezone.
 */
export function localDateInTimezone(timezone: string, now: Date): string {
  const zone = String(timezone ?? "").trim();
  if (!zone) fail("empty timezone");
  let formatted: string;
  try {
    // 'en-CA' formats as YYYY-MM-DD, which is the storage shape of `date`.
    formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch (error) {
    throw new Error(
      `[keel/provisioning] unknown timezone ${JSON.stringify(zone)}`,
      { cause: error },
    );
  }
  if (!ISO_DATE.test(formatted)) {
    fail(
      `unresolvable local date for timezone ${JSON.stringify(zone)} ` +
        `(got ${JSON.stringify(formatted)})`,
    );
  }
  return formatted;
}

/**
 * 1-based plan week number of `localDate`, counted from `anchorWeekStart`.
 *
 * Returns 0 or a negative number when the date precedes the anchor — the
 * caller treats that as `plan_not_started`, it is not an error. Deliberately
 * arithmetic on whole UTC days: `anchor_week_start` and `local_date` are both
 * `date` columns with no time and no zone, so there is no DST to cross.
 */
export function planWeekNumber(
  anchorWeekStart: string,
  localDate: string,
): number {
  assertIsoDate(anchorWeekStart, "anchorWeekStart");
  assertIsoDate(localDate, "localDate");
  const days = Math.floor(
    (ymdToUtcMillis(localDate) - ymdToUtcMillis(anchorWeekStart)) / DAY_MS,
  );
  return Math.floor(days / 7) + 1;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Why a whole student was, or was not, provisioned today. */
export type PlanWindowState =
  | "in_window"
  | "plan_not_started"
  | "plan_duration_elapsed"
  | "anchor_week_start_missing";

/** Why one commitment produced no seed row. R1: ASCII snake_case tokens. */
export type SeedSkipReason =
  | "commitment_not_active"
  | "slot_kind_not_nominal"
  | "week_grain_not_day_seeded"
  | "not_scheduled_today"
  | "phase_window_not_active"
  | "phase_window_unresolvable";

export interface SeedSkip {
  commitmentId: string;
  reason: SeedSkipReason;
}

/** One row of the `keel_seed_evaluations` payload (R1: snake_case keys). */
export interface SeedRow {
  user_id: string;
  commitment_id: string;
  plan_version_id: string;
  local_date: string;
  slot_key: string | null;
  grain: EvaluationGrain;
  expected: Record<string, unknown>;
}

export interface DaySeedSelection {
  localDate: string;
  dayOfWeek: DayToken;
  weekNumber: number | null;
  planWindow: PlanWindowState;
  rows: SeedRow[];
  skipped: SeedSkip[];
}

/**
 * Snapshot of the target AT DAY OPEN, stored on the evaluation row.
 *
 * Keys and shape are identical to `evaluator.ts::buildEvaluation`'s `expected`
 * on purpose: the pre-seeded row and the row the evaluator later rewrites must
 * describe the same contract, or a mid-day republication would look like a
 * target change to the weekly review. R1: snake_case ASCII keys, token values.
 */
export function buildExpectedSnapshot(
  commitment: ProvisionCommitment,
): Record<string, unknown> {
  return {
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
  };
}

/**
 * Is `phaseId` in force during `weekNumber`?
 *
 * R7: a commitment referencing a phase that `phase_plan` does not declare is
 * NOT silently treated as always-on and NOT silently dropped — it comes back as
 * `phase_window_unresolvable`, which the caller counts and logs. Treating it as
 * always-on would put a phase-3 prescription on a week-1 student; dropping it
 * silently would remove a real prescription with no trace.
 */
function phaseState(
  phasePlan: readonly PhaseWindow[],
  phaseId: string,
  weekNumber: number | null,
): "active" | "inactive" | "unresolvable" {
  if (weekNumber === null) return "unresolvable";
  const window = phasePlan.find((p) => p.phaseId === phaseId);
  if (!window) return "unresolvable";
  return weekNumber >= window.weekFrom && weekNumber <= window.weekTo
    ? "active"
    : "inactive";
}

/**
 * The day's seed rows for ONE student.
 *
 * Pre-seeding is restricted to `slot_kind='nominal'` AND
 * `evaluation_grain in ('occasion','day')`:
 *
 *   * `opportunistic` — R6, see the module header. Never seeded.
 *   * `week` grain — a weekly line ("fatty fish 3x/week") has no day-open and
 *     no day-close. Seeding it once per day would create seven rows for one
 *     weekly target, and the 23:55 sweep would hand six `missed` to a student
 *     who ate fish exactly three times. The weekly line resolves at week close,
 *     which is the rollover's job, not this pass's. In the acceptance fixtures
 *     every `week`-grain line already carries `slot_kind` NULL, so this branch
 *     is a guard rather than a filter — but the schema permits the combination,
 *     and a guard that never fires is cheaper than the bug it prevents.
 *   * `slot_kind` NULL — not nominal, so not pre-seeded and never swept. The
 *     evaluator still grades these lines on demand (W4.1). Stated as a known
 *     seam, not an oversight: see the report.
 */
export function selectDaySeedRows(args: {
  planVersion: ProvisionPlanVersion;
  commitments: readonly ProvisionCommitment[];
  localDate: string;
}): DaySeedSelection {
  const { planVersion, commitments } = args;
  const localDate = assertIsoDate(args.localDate, "localDate");
  const dayOfWeek = dayTokenForLocalDate(localDate);

  const weekNumber = planVersion.anchorWeekStart === null
    ? null
    : planWeekNumber(planVersion.anchorWeekStart, localDate);

  let planWindow: PlanWindowState = "in_window";
  if (weekNumber === null) {
    planWindow = "anchor_week_start_missing";
  } else if (weekNumber < 1) {
    planWindow = "plan_not_started";
  } else if (
    planVersion.durationWeeks !== null && weekNumber > planVersion.durationWeeks
  ) {
    planWindow = "plan_duration_elapsed";
  }

  const empty: DaySeedSelection = {
    localDate,
    dayOfWeek,
    weekNumber,
    planWindow,
    rows: [],
    skipped: [],
  };

  // A plan that has not started, or whose duration has elapsed, opens no day.
  // Neither is an error: the coach authored a calendar and this date is
  // outside it.
  if (planWindow === "plan_not_started" || planWindow === "plan_duration_elapsed") {
    return empty;
  }

  const rows: SeedRow[] = [];
  const skipped: SeedSkip[] = [];

  for (const commitment of commitments) {
    if (commitment.status !== "active") {
      skipped.push({ commitmentId: commitment.id, reason: "commitment_not_active" });
      continue;
    }
    if (commitment.slotKind !== "nominal") {
      skipped.push({ commitmentId: commitment.id, reason: "slot_kind_not_nominal" });
      continue;
    }
    if (commitment.evaluationGrain === "week") {
      skipped.push({
        commitmentId: commitment.id,
        reason: "week_grain_not_day_seeded",
      });
      continue;
    }
    if (
      commitment.scheduledDays !== null &&
      !commitment.scheduledDays.includes(dayOfWeek)
    ) {
      skipped.push({ commitmentId: commitment.id, reason: "not_scheduled_today" });
      continue;
    }
    if (commitment.phaseId !== null) {
      const state = phaseState(planVersion.phasePlan, commitment.phaseId, weekNumber);
      if (state === "unresolvable") {
        skipped.push({
          commitmentId: commitment.id,
          reason: "phase_window_unresolvable",
        });
        continue;
      }
      if (state === "inactive") {
        skipped.push({
          commitmentId: commitment.id,
          reason: "phase_window_not_active",
        });
        continue;
      }
    }

    // Same rule as evaluator.ts: only an `occasion` grain carries a slot on its
    // evaluation row. A day-grain line anchored on a slot still evaluates once
    // per day.
    const slotKey = commitment.evaluationGrain === "occasion"
      ? commitment.slotKey
      : null;

    rows.push({
      user_id: commitment.userId,
      commitment_id: commitment.id,
      plan_version_id: commitment.planVersionId,
      local_date: localDate,
      slot_key: slotKey,
      grain: commitment.evaluationGrain,
      expected: buildExpectedSnapshot(commitment),
    });
  }

  return { localDate, dayOfWeek, weekNumber, planWindow, rows, skipped };
}

/** Aggregate the skip reasons into a countable shape for the response. */
export function tallySkips(
  skipped: readonly SeedSkip[],
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const skip of skipped) {
    tally[skip.reason] = (tally[skip.reason] ?? 0) + 1;
  }
  return tally;
}

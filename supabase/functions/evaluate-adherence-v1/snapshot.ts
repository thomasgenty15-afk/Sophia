/**
 * KEEL — evaluate-adherence-v1, the SNAPSHOT ASSEMBLY layer.
 *
 * This module is the frontier between the database and the pure evaluator
 * (`_shared/keel/evaluator.ts`). It is deliberately split out of `index.ts` so
 * that every conversion the evaluator refuses to do for itself is unit-testable
 * without a database:
 *
 *   - `content.swap_policy`      -> `EvaluatorCommitment.swapPolicy`  (R5: the
 *     evaluator never reads `content` jsonb; this is the ONE place it is read)
 *   - `recognized.commitment_id` -> `EvaluatorEvent.commitmentId`
 *   - `occurred_at` (timestamptz) -> local calendar date + HH:MM in the plan's
 *     timezone (the evaluator has no timezone and no clock)
 *   - the tenant's `week_starts_on` -> the 7 dates of the week, which ARE the
 *     adherence denominator (SCHEMA.md says so explicitly)
 *
 * Everything exported here is pure. R7 applies: unknown tokens and malformed
 * dates throw rather than degrade.
 */

import {
  type EvaluatorCommitment,
  type EvaluatorEvent,
  type SwapPolicy,
} from "../_shared/keel/evaluator.ts";
import { type DayToken, parseDayToken } from "../_shared/keel/tokens.ts";

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Calendar helpers — pure, and fail-loud (R7)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_ORDER: DayToken[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function assertIsoDate(value: unknown, field: string): string {
  const s = String(value ?? "");
  if (!ISO_DATE.test(s)) {
    throw new Error(`${field} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  return s;
}

/** Weekday token of a local calendar date (UTC arithmetic on a bare date). */
export function dayTokenOf(isoDate: string): DayToken {
  const d = new Date(`${assertIsoDate(isoDate, "date")}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`not a real date: ${isoDate}`);
  // parseDayToken re-validates: the token never leaves this file unchecked (R7).
  return parseDayToken(DAY_ORDER[d.getUTCDay()]);
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${assertIsoDate(isoDate, "date")}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First day of the week containing `isoDate`, for a tenant's `week_starts_on`. */
export function weekStartFor(isoDate: string, weekStartsOn: string): string {
  const start = parseDayToken(weekStartsOn);
  const startIdx = DAY_ORDER.indexOf(start);
  const dayIdx = DAY_ORDER.indexOf(dayTokenOf(isoDate));
  const back = (dayIdx - startIdx + 7) % 7;
  return shiftDate(isoDate, -back);
}

export function weekDatesFrom(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
}

/**
 * `occurred_at` (timestamptz) -> the student's local calendar date and HH:MM.
 * The evaluator never does this: timezone arithmetic belongs to the layer that
 * knows the plan's timezone.
 */
export function localPartsOf(
  occurredAt: string,
  timezone: string,
): { localDate: string; localTime: string } {
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`occurred_at is not a timestamp: ${JSON.stringify(occurredAt)}`);
  }
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
  // Intl renders midnight as '24' in some ICU versions; normalize it.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${hour}:${parts.minute}`,
  };
}

// ---------------------------------------------------------------------------
// The R5 frontier: the ONLY place `content` jsonb is read
// ---------------------------------------------------------------------------

/**
 * Extracts `content.swap_policy` into the typed shape the evaluator consumes.
 * Unrecognized shapes yield `null` — a swap policy the coach wrote in a form we
 * do not understand must NOT silently become "swaps allowed"; the strictest
 * reading (no policy) is the safe default here, and `autonomy` still governs.
 */
export function extractSwapPolicy(content: unknown): SwapPolicy | null {
  if (!content || typeof content !== "object") return null;
  const raw = (content as Record<string, unknown>)["swap_policy"];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const classEquivalent = obj["class_equivalent"] === true;
  const groupsRaw = obj["allowed_groups"];
  const allowedGroups = Array.isArray(groupsRaw)
    ? groupsRaw.filter((g): g is string => typeof g === "string")
    : null;
  if (!classEquivalent && (!allowedGroups || allowedGroups.length === 0)) return null;
  return { class_equivalent: classEquivalent, allowed_groups: allowedGroups };
}

/** Extracts the explicit commitment binding a fact may carry in its payload. */
export function extractCommitmentId(recognized: unknown): string | null {
  if (!recognized || typeof recognized !== "object") return null;
  const value = (recognized as Record<string, unknown>)["commitment_id"];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function toCommitment(row: Row): EvaluatorCommitment {
  return {
    id: String(row.id),
    planVersionId: String(row.plan_version_id),
    userId: String(row.user_id),
    polarity: row.polarity as EvaluatorCommitment["polarity"],
    anchorKind: row.anchor_kind as EvaluatorCommitment["anchorKind"],
    slotKey: str(row.slot_key),
    clockLocal: str(row.clock_local),
    toleranceMinutes: num(row.tolerance_minutes),
    windowStartLocal: str(row.window_start_local),
    windowEndLocal: str(row.window_end_local),
    measure: row.measure as EvaluatorCommitment["measure"],
    unit: (str(row.unit) ?? null) as EvaluatorCommitment["unit"],
    targetOp: row.target_op as EvaluatorCommitment["targetOp"],
    targetMin: num(row.target_min),
    targetMax: num(row.target_max),
    tolerancePct: num(row.tolerance_pct),
    substanceRef: str(row.substance_ref),
    foodGroupRef: str(row.food_group_ref),
    evidenceKind: row.evidence_kind as EvaluatorCommitment["evidenceKind"],
    evidenceRequired: row.evidence_required === true,
    autoSource: (str(row.auto_source) ?? null) as EvaluatorCommitment["autoSource"],
    countsTowardAdherence: row.counts_toward_adherence !== false,
    evaluationGrain: row.evaluation_grain as EvaluatorCommitment["evaluationGrain"],
    slotKind: (str(row.slot_kind) ?? null) as EvaluatorCommitment["slotKind"],
    scheduledDays: Array.isArray(row.scheduled_days)
      ? (row.scheduled_days as string[]).map(parseDayToken)
      : null,
    requiredDaysPerWeek: num(row.required_days_per_week),
    expectedOccasionsPerDay: num(row.expected_occasions_per_day),
    priority: row.priority as EvaluatorCommitment["priority"],
    autonomy: row.autonomy as EvaluatorCommitment["autonomy"],
    flexEligible: row.flex_eligible === true,
    status: row.status as EvaluatorCommitment["status"],
    // R5 frontier crossed exactly here, once, and never again downstream.
    swapPolicy: extractSwapPolicy(row.content),
  };
}

export function toEvent(row: Row, timezone: string): EvaluatorEvent {
  const { localDate, localTime } = localPartsOf(String(row.occurred_at), timezone);
  return {
    id: String(row.id),
    // `local_date` is the stored truth (the writer resolved it at write time);
    // the recomputed one is only the fallback when the column is absent.
    localDate: str(row.local_date) ?? localDate,
    localTime,
    slotKey: str(row.slot_key),
    source: row.source as EvaluatorEvent["source"],
    quantity: num(row.quantity),
    unit: (str(row.unit) ?? null) as EvaluatorEvent["unit"],
    substanceRef: str(row.substance_ref),
    foodGroupRef: str(row.food_group_ref),
    evidenceWeight: num(row.evidence_weight),
    // The COLUMN (migration 20260727220000), never `recognized.portion_band`.
    // The jsonb copy still exists for the trace, and reading it here instead
    // would be the R5 breach the migration was written to remove.
    portionBand: str(row.portion_band) as EvaluatorEvent["portionBand"],
    commitmentId: extractCommitmentId(row.recognized),
  };
}

/**
 * Identity of a `commitment_evaluations` row, mirroring the FUNCTIONAL unique
 * index of the P0 migration (`coalesce(slot_key,'no_slot')`). PostgREST's
 * `on_conflict` cannot target a functional index, so the writer matches on this
 * key instead of relying on an upsert that would silently miss.
 */
export function identityKey(
  commitmentId: string,
  localDate: string,
  slotKey: string | null,
): string {
  return `${commitmentId}|${localDate}|${slotKey ?? "no_slot"}`;
}

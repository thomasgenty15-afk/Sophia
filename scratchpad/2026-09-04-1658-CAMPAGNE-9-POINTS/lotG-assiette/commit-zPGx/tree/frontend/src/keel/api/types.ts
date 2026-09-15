// KEEL — row shapes read by the student web app.
//
// These mirror the columns of migration 20260727090000_keel_p0_commitments.sql
// exactly. R1: every token below is the ASCII snake_case value stored in the
// database; nothing here is translated. Display copy lives in i18n/en.ts and is
// reached through the fail-loud mappers of `labels.ts`.
//
// R5 REMINDER, restated for the client: `content` jsonb is display material.
// The evaluator never reads it and this app never derives a status from it —
// statuses come from `commitment_evaluations`, written server-side.

export type EvalStatus =
  | "unknown"
  | "met"
  | "partial"
  | "missed"
  | "not_applicable"
  | "flex_used";

export type TimingStatus = "on_time" | "off_window" | "unknown" | "not_applicable";

export type Priority = "core" | "secondary" | "optional";

export type Polarity = "do" | "avoid" | "capture";

export type EvaluationGrain = "occasion" | "day" | "week";

export type AnchorKind = "slot" | "clock" | "window" | "free";

export type DayToken = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DeviationKind =
  | "restaurant"
  | "social"
  | "travel"
  | "family"
  | "work"
  | "other";

/** The reserved bucket for commitments whose anchor names no slot. It IS a real
 *  slot_vocabulary key, so it can never collide with an invented token (R1). */
export const NO_SLOT_BUCKET = "any_time";

export interface SlotVocabularyRow {
  key: string;
  label_i18n_key: string;
  default_local_time: string | null;
  sort_order: number;
}

export interface PlanVersionRow {
  id: string;
  student_id: string;
  title: string | null;
  timezone: string;
  week_starts_on: string;
  flex_allowance_per_week: number | null;
  adherence_target_pct: number | null;
  notes_for_student: string | null;
  status: string;
}

export interface CommitmentRow {
  id: string;
  plan_version_id: string;
  title: string;
  student_instruction: string | null;
  content_locale: string;
  polarity: Polarity;
  activity_class: string;
  anchor_kind: AnchorKind;
  slot_key: string | null;
  clock_local: string | null;
  window_start_local: string | null;
  window_end_local: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  substance_ref: string | null;
  food_group_ref: string | null;
  evidence_kind: string;
  evidence_required: boolean;
  auto_source: string | null;
  counts_toward_adherence: boolean;
  evaluation_grain: EvaluationGrain;
  slot_kind: string | null;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;
  priority: Priority;
  autonomy: string;
  flex_eligible: boolean;
  status: string;
}

export interface EvaluationRow {
  id: string;
  commitment_id: string;
  local_date: string;
  slot_key: string | null;
  grain: EvaluationGrain;
  status: EvalStatus;
  timing_status: TimingStatus;
  evidence: string;
  observed_value: number | null;
}

export interface ProtocolEventRow {
  id: string;
  occurred_at: string;
  local_date: string;
  slot_key: string | null;
  source: string;
  quantity: number | null;
  unit: string | null;
  recognized: { commitment_id?: string } | null;
  source_message_id: string | null;
}

export interface PlannedDeviationRow {
  id: string;
  local_date: string;
  slot_key: string | null;
  kind: DeviationKind;
  note: string | null;
  consumed_flex: boolean;
}

export interface WeeklyReviewRow {
  id: string;
  week_start_date: string;
  logging_coverage: number | null;
  core_adherence_pct: number | null;
  overall_adherence_pct: number | null;
  evaluable_days: number | null;
  flex_used: number | null;
  flex_allowance: number | null;
  outcomes: Record<string, unknown> | null;
}

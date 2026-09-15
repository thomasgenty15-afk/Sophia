/**
 * KEEL W4.3 — `declare_deviation`: the durable effect that writes a planned
 * deviation ("I'm at a restaurant on Friday").
 *
 * Same chain as `log_protocol_event`, one extra rule that is a PRODUCT rule,
 * not an implementation detail:
 *
 *   FLEX IS DECLARED IN ADVANCE.
 *
 * `planned_deviations` removes a day/slot from the adherence denominator
 * (the evaluator emits `not_applicable`). A deviation accepted after the fact
 * on a day that is already resolved would let the student erase a `missed`
 * they have already been graded on — "the student never grades their own
 * paper" (CONTRACT, doctrine carried over). So:
 *
 *   - day not yet resolved  -> accepted (this is the nominal case: the whole
 *     point of the feature is declaring Friday's dinner on Wednesday);
 *   - day already resolved  -> REFUSED with a named reason
 *     (`retroactive_on_resolved_day`) and a clear message pointing at the only
 *     legitimate route: the coach;
 *   - day already resolved AND the coach has granted a backdate -> accepted,
 *     and the ledger records `coach_authorized_backdate: true` so the
 *     exception is auditable rather than indistinguishable from the nominal
 *     path.
 *
 * The authorization is deliberately NOT readable from the turn payload. It is
 * injected by the caller from a coach-authored source (`CoachBackdateGrant`).
 * A student sentence — or an LLM payload echoing one — can never set it. That
 * is the same boundary as `student_safety_constraints`: an authorization that
 * a probabilistic layer can assert is not an authorization.
 *
 * What "resolved" means is likewise not decided here: the caller supplies a
 * `day_resolution` fact (from `commitment_evaluations` / the end-of-day sweep
 * of W4.2). This module owns the RULE, not the query.
 */

import type { SlotKey } from "../../../../_shared/keel/tokens.ts";

/** `planned_deviations.kind` — CHECK-constrained in the migration. */
export const DEVIATION_KINDS = [
  "restaurant",
  "social",
  "travel",
  "family",
  "work",
  "other",
] as const;
export type DeviationKind = (typeof DEVIATION_KINDS)[number];

/** `planned_deviations.declared_via` — CHECK-constrained in the migration. */
export const DEVIATION_DECLARED_VIA = [
  "chat",
  "weekly_review",
  "app",
] as const;
export type DeviationDeclaredVia = (typeof DEVIATION_DECLARED_VIA)[number];

/**
 * The state of a day, as READ from persisted facts by the caller.
 * `resolved: true` means the day has been graded (end-of-day sweep ran, or
 * evaluations for that day are no longer `unknown`).
 */
export type DayResolution = {
  local_date: string;
  resolved: boolean;
  /** Free-form provenance for the ledger, e.g. "day_close_sweep". */
  resolved_by?: string | null;
};

/**
 * A coach-authored permission to backdate ONE declaration. Never derived from
 * the conversation. Absent => no backdating, full stop.
 */
export type CoachBackdateGrant = {
  granted: boolean;
  granted_by_coach_id?: string | null;
  /** Optional narrowing: a grant may cover a single date. */
  local_date?: string | null;
};

export type PlannedDeviationRow = {
  id: string;
  user_id: string;
  plan_version_id: string;
  local_date: string;
  slot_key: string | null;
  kind: string;
  declared_via: string;
  consumed_flex: boolean;
};

export type PlannedDeviationWriteInput = {
  user_id: string;
  plan_version_id: string;
  local_date: string;
  slot_key: SlotKey | null;
  kind: DeviationKind;
  declared_at: string;
  declared_via: DeviationDeclaredVia;
  note: string | null;
  /** R2: the note is prose; the row states its language. */
  content_locale: string;
  consumed_flex: boolean;
  coach_visible: boolean;
};

/**
 * Unlike `protocol_events`, `planned_deviations` has NO unique index on
 * (user_id, source_message_id) — the schema does not carry the column. The
 * write therefore reports `already_declared` when it finds an equivalent live
 * declaration for the same (user, plan_version, date, slot, kind), read from
 * the database. Same doctrine, different key: a row that came out of the DB
 * in both branches.
 */
export type PlannedDeviationWriteResult =
  | { outcome: "inserted"; row: PlannedDeviationRow }
  | { outcome: "already_declared"; row: PlannedDeviationRow };

export type PlannedDeviationWrite = (
  input: PlannedDeviationWriteInput,
) => Promise<PlannedDeviationWriteResult>;

export type DeclareDeviationRequestedEffect = {
  type: "declare_deviation";
  plan_version_id: string;
  local_date: string;
  slot_key: SlotKey | null;
  kind: DeviationKind;
  declared_at: string;
  declared_via: DeviationDeclaredVia;
  note: string | null;
  content_locale: string;
  consumed_flex: boolean;
  coach_visible: boolean;
  /** Local date of the turn — the reference for "in advance". */
  today_local_date: string;
};

export type DeclareDeviationCommittedEffect = {
  type: "declare_deviation";
  planned_deviation_id: string;
  local_date: string;
  slot_key: string | null;
  kind: string;
  consumed_flex: boolean;
  already_declared: boolean;
  /** true = accepted on a resolved day thanks to an explicit coach grant. */
  coach_authorized_backdate: boolean;
};

export type DeclareDeviationStatus =
  | "declared"
  | "needs_clarify"
  | "blocked"
  | "ignored"
  | "failed";

export type DeclareDeviationDirectEffectResult = {
  detected: boolean;
  status: DeclareDeviationStatus;
  reply: string | null;
  executed_tools: ["declare_deviation"] | [];
  requested_effects: DeclareDeviationRequestedEffect[];
  allowed_effects: DeclareDeviationRequestedEffect[];
  committed_effects: DeclareDeviationCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  debug: {
    reason_code: string;
    gate_reason?: string | null;
    token_issue?: string | null;
    /** Ledger trace of the advance-declaration rule. */
    retroactive?: boolean;
    day_resolved?: boolean;
    coach_authorized_backdate?: boolean;
  };
};

/**
 * KEEL W4.3 — executor for `declare_deviation`. Write-through, same doctrine
 * as `log_protocol_event/executor.ts`: a committed effect is a row that came
 * back out of the database, identity-checked, or it is a failure.
 *
 * The advance rule is NOT re-implemented here. It is evaluated once, in the
 * router, before the write, and its verdict travels in. Two enforcement points
 * for one rule is how the safety gate leaked in `p4-safety-deferred-gate-leak`
 * — one of them eventually disagrees with the other.
 */

import type {
  DeclareDeviationCommittedEffect,
  DeclareDeviationRequestedEffect,
  PlannedDeviationRow,
  PlannedDeviationWrite,
} from "./contract.ts";

export type DeclareDeviationExecutionResult =
  | { status: "committed"; committed_effect: DeclareDeviationCommittedEffect }
  | {
    status: "failed";
    reason_code: "write_failed" | "missing_readback_row" | "readback_mismatch";
    detail?: string;
  };

function nonEmptyId(row: PlannedDeviationRow | null | undefined): string {
  return String(row?.id ?? "").trim();
}

export async function executeDeclareDeviationWrite(args: {
  requested_effect: DeclareDeviationRequestedEffect;
  user_id: string;
  /** Verdict of `evaluateAdvanceRule`, carried for the ledger. */
  coach_authorized_backdate: boolean;
  write_planned_deviation: PlannedDeviationWrite;
}): Promise<DeclareDeviationExecutionResult> {
  const requested = args.requested_effect;

  let written: Awaited<ReturnType<PlannedDeviationWrite>>;
  try {
    written = await args.write_planned_deviation({
      user_id: args.user_id,
      plan_version_id: requested.plan_version_id,
      local_date: requested.local_date,
      slot_key: requested.slot_key,
      kind: requested.kind,
      declared_at: requested.declared_at,
      declared_via: requested.declared_via,
      note: requested.note,
      content_locale: requested.content_locale,
      consumed_flex: requested.consumed_flex,
      coach_visible: requested.coach_visible,
    });
  } catch (error) {
    return {
      status: "failed",
      reason_code: "write_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const row = written?.row;
  const deviationId = nonEmptyId(row);
  if (!row || !deviationId) {
    return { status: "failed", reason_code: "missing_readback_row" };
  }
  if (row.user_id !== args.user_id) {
    return {
      status: "failed",
      reason_code: "readback_mismatch",
      detail: "user_id",
    };
  }
  if (row.local_date !== requested.local_date) {
    // A deviation on the wrong day removes the wrong day from the denominator.
    return {
      status: "failed",
      reason_code: "readback_mismatch",
      detail: "local_date",
    };
  }

  return {
    status: "committed",
    committed_effect: {
      type: "declare_deviation",
      planned_deviation_id: deviationId,
      local_date: row.local_date,
      slot_key: row.slot_key,
      kind: row.kind,
      consumed_flex: row.consumed_flex,
      already_declared: written.outcome === "already_declared",
      coach_authorized_backdate: args.coach_authorized_backdate,
    },
  };
}

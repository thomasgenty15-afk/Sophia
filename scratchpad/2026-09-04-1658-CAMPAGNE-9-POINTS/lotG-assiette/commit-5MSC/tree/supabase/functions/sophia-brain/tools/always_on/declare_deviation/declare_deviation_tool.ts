/**
 * KEEL W4.3 — public surface of `declare_deviation`.
 * Wiring into the runtime is W4.4 (perimeter of another lot).
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { DirectEffectGateInput } from "../../../routers/direct_effect_gate.ts";
import type {
  CoachBackdateGrant,
  DayResolution,
  DeclareDeviationDirectEffectResult,
  DeviationDeclaredVia,
  PlannedDeviationWrite,
} from "./contract.ts";
import { runDeclareDeviationDirectEffect } from "./router.ts";

export type { CoachBackdateGrant, DayResolution, PlannedDeviationWrite };

export type DeclareDeviationOutcome =
  | { detected: false }
  | {
    detected: true;
    status: "needs_clarify" | "blocked" | "failed";
    reason: string;
    message: string;
  }
  | {
    detected: true;
    status: "declared";
    message: string;
    planned_deviation_id: string;
    local_date: string;
    slot_key: string | null;
    already_declared: boolean;
    coach_authorized_backdate: boolean;
  };

function toOutcome(
  result: DeclareDeviationDirectEffectResult,
): DeclareDeviationOutcome {
  if (!result.detected) return { detected: false };

  if (result.status === "declared") {
    const committed = result.committed_effects[0];
    if (!committed?.planned_deviation_id) {
      return {
        detected: true,
        status: "failed",
        reason: "phantom_commit_blocked",
        message: "Nothing was noted.",
      };
    }
    return {
      detected: true,
      status: "declared",
      message: result.reply ?? "",
      planned_deviation_id: committed.planned_deviation_id,
      local_date: committed.local_date,
      slot_key: committed.slot_key,
      already_declared: committed.already_declared,
      coach_authorized_backdate: committed.coach_authorized_backdate,
    };
  }

  const status: "needs_clarify" | "blocked" | "failed" =
    result.status === "needs_clarify"
      ? "needs_clarify"
      : result.status === "failed"
      ? "failed"
      : "blocked";
  return {
    detected: true,
    status,
    reason: result.debug.reason_code,
    message: result.reply ?? result.debug.reason_code,
  };
}

export async function runDeclareDeviation(params: {
  turn_frame: TurnFrame;
  plan_version_id: string | null | undefined;
  content_locale: string | null | undefined;
  declared_via?: DeviationDeclaredVia;
  read_day_resolution?: (
    localDate: string,
  ) => Promise<DayResolution | null> | DayResolution | null;
  coach_backdate_grant?: CoachBackdateGrant | null;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_planned_deviation: PlannedDeviationWrite;
}): Promise<DeclareDeviationOutcome> {
  const result = await runDeclareDeviationDirectEffect({
    turn_frame: params.turn_frame,
    plan_version_id: params.plan_version_id,
    content_locale: params.content_locale,
    declared_via: params.declared_via,
    read_day_resolution: params.read_day_resolution,
    coach_backdate_grant: params.coach_backdate_grant,
    recent_writes_idempotency: params.recent_writes_idempotency,
    db_idempotency_check: params.db_idempotency_check,
    write_planned_deviation: params.write_planned_deviation,
  });
  return toOutcome(result);
}

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { DirectEffectGateInput } from "../../../routers/direct_effect_gate.ts";
import type {
  TrackProgressDirectEffectResult,
  TrackProgressStatus,
  TrackProgressWrite,
} from "./contract.ts";
import { runTrackProgressPlanItemDirectEffect } from "./router.ts";

export type { TrackProgressStatus, TrackProgressWrite };

export type TrackProgressPlanItemOutcome =
  | { detected: false }
  | {
    detected: true;
    status: "needs_clarify";
    reason:
      | "target_ambiguous"
      | "target_missing"
      | "status_missing"
      | "intent_implied_weak"
      | "ambiguity_present";
    message: string;
  }
  | {
    detected: true;
    status: "blocked";
    reason:
      | "safety_high"
      | "pending_confirmation_active"
      | "duplicate_source_message"
      | "duplicate_db"
      | "future_intent"
      | "target_not_in_plan";
    message: string;
  }
  | {
    detected: true;
    status: "logged";
    message: string;
    target_item_id: string;
    target_title: string;
    progress_status: TrackProgressStatus;
    value: number;
    logged_progress_id: string;
  };

function legacyClarifyReason(reasonCode: string):
  | "target_ambiguous"
  | "target_missing"
  | "status_missing"
  | "intent_implied_weak"
  | "ambiguity_present" {
  if (reasonCode === "target_ambiguous") return "target_ambiguous";
  if (reasonCode === "status_missing") return "status_missing";
  if (reasonCode === "intent_implied_weak") return "intent_implied_weak";
  if (reasonCode === "ambiguity_present") return "ambiguity_present";
  return "target_missing";
}

function legacyBlockedReason(reasonCode: string):
  | "safety_high"
  | "pending_confirmation_active"
  | "duplicate_source_message"
  | "duplicate_db"
  | "future_intent"
  | "target_not_in_plan" {
  if (reasonCode === "safety_high") return "safety_high";
  if (reasonCode === "pending_confirmation_active") {
    return "pending_confirmation_active";
  }
  if (reasonCode === "duplicate_source_message") {
    return "duplicate_source_message";
  }
  if (reasonCode === "future_intent") return "future_intent";
  if (reasonCode === "target_not_in_plan") return "target_not_in_plan";
  return "duplicate_db";
}

function toLegacyOutcome(
  result: TrackProgressDirectEffectResult,
): TrackProgressPlanItemOutcome {
  if (!result.detected) return { detected: false };

  if (result.status === "logged") {
    const committed = result.committed_effects[0];
    if (!committed?.logged_progress_id) {
      return {
        detected: true,
        status: "blocked",
        reason: "duplicate_db",
        message: "Progress write failed before commit confirmation.",
      };
    }
    return {
      detected: true,
      status: "logged",
      message: result.reply ?? "",
      target_item_id: committed.target_item_id,
      target_title: committed.target_title,
      progress_status: committed.progress_status,
      value: committed.value,
      logged_progress_id: committed.logged_progress_id,
    };
  }

  if (result.status === "needs_clarify") {
    return {
      detected: true,
      status: "needs_clarify",
      reason: legacyClarifyReason(result.debug.reason_code),
      message: result.reply ?? "Je prefere confirmer avant de l'ecrire.",
    };
  }

  return {
    detected: true,
    status: "blocked",
    reason: legacyBlockedReason(result.debug.reason_code),
    message: result.reply ?? result.debug.reason_code,
  };
}

export async function runTrackProgressPlanItemV2(params: {
  turn_frame: TurnFrame;
  message: string;
  plan_snapshot: unknown;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressPlanItemOutcome> {
  const result = await runTrackProgressPlanItemDirectEffect({
    turn_frame: params.turn_frame,
    message: params.message,
    plan_snapshot: params.plan_snapshot,
    pending_tool_skill_confirmation: params.pending_tool_skill_confirmation,
    recent_writes_idempotency: params.recent_writes_idempotency,
    db_idempotency_check: params.db_idempotency_check,
    write_progress: params.write_progress,
  });
  return toLegacyOutcome(result);
}

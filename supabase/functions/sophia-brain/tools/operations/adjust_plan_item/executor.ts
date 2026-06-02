import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import type { AdjustPlanToolSkillState } from "./workflow.ts";

export type AdjustPlanItemExecutorOutcome =
  | {
    status: "executed";
    plan_patch_id: string;
    bridge_plan_item_id?: string | null;
    ack: string;
    tool_skill_state: AdjustPlanToolSkillState;
  }
  | {
    status: "blocked";
    reason_code: string;
    ack: string;
    tool_skill_state: AdjustPlanToolSkillState;
  };

function terminalToolSkillState(args: {
  status: "handoff_delivered" | "fallback";
  reason_code: string;
}): AdjustPlanToolSkillState {
  return {
    status: args.status,
    current_sub_skill: "handoff_validation",
    stage_order: [
      "scope",
      "reason_change",
      "change_target",
      "constraints",
      "affected_items",
      "handoff_draft_generation",
      "handoff_validation",
      "platform_handoff",
      "closure_no_mutation",
    ],
    missing_slots: [],
    confidence: args.status === "handoff_delivered" ? "high" : "low",
    sub_skill_trace: [{
      sub_skill_id: "handoff_validation",
      status: args.status === "handoff_delivered"
        ? "ready_for_handoff"
        : "skipped",
      reason_code: args.reason_code,
      missing_slots: [],
    }],
    conversation_summary: args.status === "handoff_delivered"
      ? "Adjust_plan handoff delivered without chat mutation."
      : "Adjust_plan blocked and closed without execution.",
  };
}

export async function executeAdjustPlanItem(input: {
  operation_id: string;
  user_id: string;
  draft: PlanAdjustmentDraftV1;
  token?: ConfirmationToken | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_plan_patch: (
    patch: Record<string, unknown>,
  ) => Promise<{ plan_patch_id: string; bridge_plan_item_id?: string | null }>;
  now_iso?: string;
  secret?: string;
}): Promise<AdjustPlanItemExecutorOutcome> {
  void input;
  return {
    status: "blocked",
    reason_code: "chat_mutation_disabled_platform_handoff",
    ack:
      "Il ne te reste plus qu'à ouvrir Plan et reprendre cette recommandation là-bas.",
    tool_skill_state: terminalToolSkillState({
      status: "handoff_delivered",
      reason_code: "chat_mutation_disabled_platform_handoff",
    }),
  };
}

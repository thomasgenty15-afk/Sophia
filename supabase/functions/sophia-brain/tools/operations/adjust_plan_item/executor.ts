import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import {
  type PlanAdjustmentDraftV1,
  planAdjustmentMaterializationBlockReason,
  validatePlanPatch,
} from "./generator.ts";
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
  status: "completed" | "fallback";
  reason_code: string;
}): AdjustPlanToolSkillState {
  return {
    status: args.status,
    current_sub_skill: "draft_validation",
    stage_order: [
      "scope",
      "reason_change",
      "change_target",
      "constraints",
      "affected_items",
      "draft_generation",
      "draft_validation",
      "user_confirmation",
      "execution",
      "closure",
    ],
    missing_slots: [],
    confidence: args.status === "completed" ? "high" : "low",
    sub_skill_trace: [{
      sub_skill_id: "draft_validation",
      status: args.status === "completed"
        ? "ready_for_confirmation"
        : "skipped",
      reason_code: args.reason_code,
      missing_slots: [],
    }],
    conversation_summary: args.status === "completed"
      ? "Adjust_plan executed and closed."
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
  try {
    validatePlanPatch(
      input.draft.draft.patch,
      input.draft.draft.allowed_patch_fields,
    );
  } catch (error) {
    return {
      status: "blocked",
      reason_code: error instanceof Error ? error.message : "draft_invalid",
      ack: "Je ne peux pas appliquer cet ajustement: le patch est invalide.",
      tool_skill_state: terminalToolSkillState({
        status: "fallback",
        reason_code: error instanceof Error ? error.message : "draft_invalid",
      }),
    };
  }
  const resultMessage = input.draft.execution_message?.trim() ||
    input.draft.draft.adjust_plan_result?.user_message_detailed?.trim();
  if (!resultMessage) {
    return {
      status: "blocked",
      reason_code: "adjust_plan_generated_message_missing",
      ack: "Je ne peux pas appliquer cet ajustement: le message généré manque.",
      tool_skill_state: terminalToolSkillState({
        status: "fallback",
        reason_code: "adjust_plan_generated_message_missing",
      }),
    };
  }
  const materializationBlockReason = planAdjustmentMaterializationBlockReason(
    input.draft,
  );
  if (materializationBlockReason) {
    return {
      status: "blocked",
      reason_code: materializationBlockReason,
      ack:
        "Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché à des actions précises du plan.",
      tool_skill_state: terminalToolSkillState({
        status: "fallback",
        reason_code: materializationBlockReason,
      }),
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "adjust_plan_item",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) {
    return {
      status: "blocked",
      ...guard,
      tool_skill_state: terminalToolSkillState({
        status: "fallback",
        reason_code: guard.reason_code,
      }),
    };
  }
  let written: { plan_patch_id: string; bridge_plan_item_id?: string | null };
  try {
    written = await input.write_plan_patch(input.draft.draft.patch);
  } catch (error) {
    return {
      status: "blocked",
      reason_code: error instanceof Error
        ? error.message
        : "plan_patch_write_failed",
      ack:
        "Je ne peux pas appliquer cet ajustement depuis le chat tant qu'il n'est pas rattaché proprement aux bonnes actions du plan.",
      tool_skill_state: terminalToolSkillState({
        status: "fallback",
        reason_code: error instanceof Error
          ? error.message
          : "plan_patch_write_failed",
      }),
    };
  }
  return {
    status: "executed",
    plan_patch_id: written.plan_patch_id,
    bridge_plan_item_id: written.bridge_plan_item_id ?? null,
    ack: resultMessage,
    tool_skill_state: terminalToolSkillState({
      status: "completed",
      reason_code: "adjust_plan_executed",
    }),
  };
}

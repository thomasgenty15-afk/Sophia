import type {
  ConversationSkillOperationSuggestion,
  OperationSuggestionType,
} from "../contracts/skill_output.v1.ts";
import type { RiskBand } from "../contracts/turn_frame.v1.ts";
import { blocksToolSkills } from "../safety/safety_thresholds.ts";

export type OperationSuggestionAccessDecision =
  | {
    allowed: true;
    operation_type: OperationSuggestionType;
    surface_id: string;
    chat_runtime_ready: boolean;
  }
  | {
    allowed: false;
    operation_type: OperationSuggestionType;
    reason_code: string;
  };

const SKILL_OPERATION_ALLOWLIST: Record<string, OperationSuggestionType[]> = {
  emotional_repair: [
    "prepare_attack_card",
    "prepare_defense_card",
    "select_state_potion",
    "create_recurring_reminder",
  ],
  demotivation_repair: [
    "select_state_potion",
    "prepare_attack_card",
    "prepare_defense_card",
    "adjust_plan_item",
    "create_recurring_reminder",
  ],
  product_help: [
    "adjust_plan_item",
    "prepare_attack_card",
    "prepare_defense_card",
    "create_recurring_reminder",
    "select_state_potion",
    "update_coach_preferences",
  ],
  safety_crisis: ["select_state_potion"],
};

const CHAT_READY_FROM_SUGGESTION = new Set<OperationSuggestionType>([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "create_recurring_reminder",
]);

export function surfaceIdForOperationSuggestion(
  suggestion: ConversationSkillOperationSuggestion,
): string {
  if (suggestion.operation_type === "select_state_potion") {
    return "potion.state";
  }
  if (suggestion.operation_type === "prepare_attack_card") {
    return "attack_card";
  }
  if (suggestion.operation_type === "prepare_defense_card") {
    return "defense_card";
  }
  if (suggestion.operation_type === "create_recurring_reminder") {
    return "dashboard.reminders";
  }
  if (suggestion.operation_type === "update_coach_preferences") {
    return "dashboard.preferences";
  }
  const adjustmentType = String(
    suggestion.operation_input_hint?.adjustment_type ?? "",
  ).trim();
  return adjustmentType === "clarify"
    ? "plan_item.clarify"
    : "plan_item.reduce";
}

export function evaluateOperationSuggestionAccess(args: {
  skill_id: string;
  suggestion: ConversationSkillOperationSuggestion;
  safety_risk_band: RiskBand;
}): OperationSuggestionAccessDecision {
  const skillId = String(args.skill_id ?? "").trim();
  const allowed = SKILL_OPERATION_ALLOWLIST[skillId] ?? [];
  if (!allowed.includes(args.suggestion.operation_type)) {
    return {
      allowed: false,
      operation_type: args.suggestion.operation_type,
      reason_code: "tool_not_allowed_for_skill",
    };
  }
  if (blocksToolSkills(args.safety_risk_band)) {
    return {
      allowed: false,
      operation_type: args.suggestion.operation_type,
      reason_code: "safety_blocks_tool_suggestion",
    };
  }
  return {
    allowed: true,
    operation_type: args.suggestion.operation_type,
    surface_id: surfaceIdForOperationSuggestion(args.suggestion),
    chat_runtime_ready: CHAT_READY_FROM_SUGGESTION.has(
      args.suggestion.operation_type,
    ),
  };
}

export const CONVERSATION_SKILL_OPERATION_ALLOWLIST = SKILL_OPERATION_ALLOWLIST;

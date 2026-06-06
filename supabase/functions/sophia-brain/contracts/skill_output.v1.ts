import type { ConfidenceBand } from "./turn_frame.v1.ts";
import type { MemoryWriteCandidate } from "./memory_write_candidate.v1.ts";

export type OperationSuggestionType =
  | "adjust_plan_item"
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "create_recurring_reminder"
  | "select_state_potion"
  | "update_coach_preferences";

export type ConversationSkillOperationSuggestion = {
  operation_type: OperationSuggestionType;
  reason: string;
  confidence_band: ConfidenceBand;
  urgency: "low" | "medium" | "high";
  source_skill_id: string;
  operation_input_hint?: Record<string, unknown>;
  requires_user_consent: boolean;
};

export type ConversationSkillStatus =
  | "continue"
  | "complete"
  | "exit"
  | "handoff"
  | "recommendation_needed";

export type ConversationSkillEffectLedger = {
  requested: unknown[];
  allowed: unknown[];
  blocked: Array<{ type: string; reason_code: string }>;
  committed: unknown[];
};

export type ConversationSkillOutput = {
  skill_id: string;
  status: ConversationSkillStatus;
  response_intent: string;
  reply?: string;
  generated_user_message?: string;
  diagnosis?: Record<string, unknown>;
  state_patch?: Record<string, unknown>;
  effects?: ConversationSkillEffectLedger;
  recommendation_need?: {
    needed: boolean;
    type:
      | "state_regulation"
      | "action_repair"
      | "motivation_repair"
      | "product_help"
      | "none";
    urgency: "none" | "low" | "medium" | "high";
    constraints: string[];
  };
  operation_suggestions?: ConversationSkillOperationSuggestion[];
  handoff_request?: {
    target_skill_id: string;
    reason: string;
    confidence_band: ConfidenceBand;
  };
  memory_write_candidates?: MemoryWriteCandidate[];
  memory_trace: {
    memory_used_for_response: boolean;
    memory_item_ids_used: string[];
    correction_detected: boolean;
    correction_target_item_ids: string[];
  };
};

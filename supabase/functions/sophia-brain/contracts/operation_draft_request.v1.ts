import type { ConversationChannel } from "./turn_frame.v1.ts";

export type OperationType =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "adjust_plan_item"
  | "select_state_potion"
  | "create_recurring_reminder"
  | "update_coach_preferences";

export type OperationDraftRequest = {
  operation_id: string;
  operation_type: OperationType;

  source: {
    skill_id: string;
    skill_run_id?: string | null;
    recommendation_id: string;
    trigger_message_id: string;
  };

  user_context: {
    user_id: string;
    timezone: string;
    channel: ConversationChannel;
    locale: "fr";
  };

  diagnosis: {
    blocker_type?: string | null;
    emotional_state?: string[];
    motivation_state?: string | null;
    confidence: number;
    constraints: string[];
  };

  target: {
    plan_item_id?: string | null;
    plan_item_title?: string | null;
    transformation_id?: string | null;
    topic_id?: string | null;
  };

  evidence: {
    current_user_message: string;
    recent_summary?: string | null;
    relevant_memory_items: Array<{
      id: string;
      kind: string;
      summary: string;
      sensitivity_level: "normal" | "sensitive" | "safety";
    }>;
    action_observations?: Array<{
      plan_item_id: string;
      summary: string;
      window: string;
    }>;
  };

  product_constraints: {
    allowed_operations: string[];
    forbidden_operations: string[];
    requires_confirmation: true;
    max_intrusiveness: 1 | 2 | 3 | 4 | 5;
  };
};

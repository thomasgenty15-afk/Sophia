import type { NoteInformation } from "../../contracts/note_information.v1.ts";

export type ProductHelpIntent =
  | "explain_feature"
  | "how_to"
  | "where_is_it"
  | "benefits"
  | "limits"
  | "can_i_do_x"
  | "modify_or_cancel_where"
  | "object_status_question"
  | "tool_action_request"
  | "compare_features"
  | "repeat"
  | "close"
  | "off_topic"
  | "safety"
  | "unclear";

export type ProductHelpTargetKind =
  | "feature_catalog"
  | "user_object"
  | "recent_effect"
  | "pending_draft"
  | "tool_flow"
  | "unknown";

export type ProductHelpObjectType =
  | "attack_card"
  | "defense_card"
  | "one_shot_reminder"
  | "recurring_reminder"
  | "potion"
  | "plan_item"
  | "preference"
  | "initiative"
  | "unknown";

export type ProductHelpBridgeOperationType =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "select_state_potion"
  | "create_recurring_reminder"
  | "one_shot_reminder"
  | "adjust_plan_item"
  | "update_coach_preferences";

export type ProductHelpLocalFlowAction =
  | "answer_product_question"
  | "clarify_product_question"
  | "answer_destination"
  | "compare_features"
  | "explain_limit"
  | "bridge_explanation_only"
  | "repeat_answer"
  | "apply_attempt"
  | "inline_status_roundtrip"
  | "inline_tool_return"
  | "handoff_to_local_dispatcher"
  | "exit_to_global_dispatcher"
  | "close_product_help"
  | "return_to_parent_flow"
  | "safety_preempt";

export type ProductHelpVisibleTaskKind =
  | "answer_product_question"
  | "clarify_product_question"
  | "answer_destination"
  | "compare_features"
  | "explain_limit"
  | "bridge_explanation_only"
  | "repeat_answer"
  | "apply_attempt"
  | "inline_tool_return"
  | "stop_or_cancel"
  | "exit_ack"
  | "close_product_help"
  | "safety"
  | "safety_transition";

export type ProductHelpConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  handoff_data: Record<string, unknown>;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type ProductHelpLocalFlowState = {
  skill_id: "product_help";
  status:
    | "open"
    | "answered"
    | "closing"
    | "stopped"
    | "handoff"
    | "exit_to_global"
    | "safety";
  mode: "standalone";
  product_help_state: {
    stage:
      | "answering"
      | "clarifying"
      | "bridge_explained"
      | "status_inline"
      | "handoff"
      | "closing";
    last_intent: string | null;
    last_target: Record<string, unknown>;
    last_answer_summary: string | null;
    last_catalog_feature_ids: string[];
    last_locations: string[];
    parent_flow_context: null;
    turn_count: number;
    max_turns: number;
    updated_at: string;
  };
};

export type ProductHelpLocalDispatcherOutput = {
  flow_action: ProductHelpLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  mode: "standalone" | "inline";
  product_help_intent: {
    kind: ProductHelpIntent;
    summary: string;
  };
  target: {
    kind: ProductHelpTargetKind;
    feature_id: string | null;
    object_type: ProductHelpObjectType | null;
    object_ref: string | null;
    confidence: "low" | "medium" | "high";
  };
  grounding: {
    catalog_feature_ids: string[];
    surface_ids: string[];
    db_sources_required: boolean;
    db_sources_used: string[];
    active_flow_used: boolean;
    missing_grounding_reason: string | null;
  };
  bridge: {
    needed: boolean;
    operation_type: ProductHelpBridgeOperationType | null;
    kind: "explain_only" | "offer_with_consent" | "handoff_needed" | null;
    executable: false;
    why: string | null;
  };
  state_updates: {
    status: ProductHelpLocalFlowState["status"];
    stage: ProductHelpLocalFlowState["product_help_state"]["stage"];
    turn_count_increment: number;
    close_after_visible: boolean;
    preserve_parent_flow: boolean;
    modified_fields?: string[];
    clear_fields?: string[];
  };
  visible_task: {
    kind: ProductHelpVisibleTaskKind;
    instruction: string;
    conversation_context: ProductHelpConversationContext;
  };
  return_to_parent: {
    needed: boolean;
    parent_skill_id: string | null;
    return_summary: string | null;
    preserve_parent_state: true;
  };
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "status_question"
      | "normal_coaching"
      | "safety"
      | "unknown"
      | "none";
    user_intent_summary: string | null;
    local_flow_context: {
      skill_id: "product_help";
      mode: "standalone" | "inline";
      stage: string | null;
      last_answer_summary: string | null;
      parent_skill_id: string | null;
      committed_effects: unknown[];
    };
    handoff_hint_for_global_dispatcher: {
      likely_intent:
        | "prepare_attack_card"
        | "prepare_defense_card"
        | "select_state_potion"
        | "update_coach_preferences"
        | "status_recap"
        | "adjust_plan_item"
        | "one_shot_reminder"
        | "create_recurring_reminder"
        | "normal_coaching"
        | "unknown";
      why: string | null;
      constraints: string[];
    };
  };
  note_information: NoteInformation | null;
  evidence: string[];
};

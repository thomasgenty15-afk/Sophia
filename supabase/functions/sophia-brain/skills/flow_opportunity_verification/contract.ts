export type FlowOpportunityTargetFlow =
  | "status_recap"
  | "update_coach_preferences"
  | "emotional_repair"
  | "demotivation_repair"
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "select_state_potion"
  | "one_shot_reminder"
  | "create_recurring_reminder"
  | "adjust_plan_item"
  | "unknown";

export type FlowOpportunityLocalAction =
  | "offer_opportunity"
  | "accept_opportunity"
  | "decline_opportunity"
  | "get_info_product"
  | "return_from_get_info_product"
  | "get_info_db"
  | "repeat_offer"
  | "revise_focus"
  | "correct_target_flow"
  | "launch_target_flow"
  | "direct_command_interrupt"
  | "unsupported_request_inside_flow"
  | "stale_or_already_answered"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type FlowOpportunityVisibleTaskKind =
  | "offer_status_recap"
  | "offer_preference_update"
  | "offer_emotional_repair"
  | "offer_demotivation_repair"
  | "offer_target_flow_generic"
  | "reanchor_offer_after_product_help"
  | "accept_and_launch_status_recap"
  | "accept_and_launch_target_flow"
  | "decline_ack"
  | "repeat_offer"
  | "revise_focus_question"
  | "correct_target_flow_ack"
  | "unsupported_inside_flow"
  | "stale_or_already_answered"
  | "cancel_or_exit"
  | "handoff_to_global"
  | "safety"
  | "none";

export type FlowOpportunityStatus =
  | "offered"
  | "explaining"
  | "waiting_confirmation"
  | "accepted"
  | "declined"
  | "launched"
  | "cancelled"
  | "exit"
  | "blocked";

export type FlowOpportunityExitReason =
  | "topic_change"
  | "cancelled"
  | "direct_command_other_flow"
  | "unsupported"
  | "stale"
  | "safety"
  | "none";

export type FlowOpportunityPayload = {
  opportunity_id: string;
  target_flow: FlowOpportunityTargetFlow;
  target_action?: string | null;
  confidence: "low" | "medium" | "high";
  priority: number;
  reason: string;
  evidence: string[];
  seed_context: Record<string, unknown>;
};

export type FlowOpportunityConfirmationAnchor = {
  meaning: string;
  target_flow: FlowOpportunityTargetFlow;
  target_context: Record<string, unknown>;
  must_not_reinterpret_acceptance_as: string[];
};

export type FlowOpportunityLocalState = {
  skill_id: "flow_opportunity_verification";
  mode: "local_verification_flow";
  status: FlowOpportunityStatus;
  opportunity_id: string;
  target_flow: FlowOpportunityTargetFlow;
  target_action: string;
  target_context: Record<string, unknown>;
  origin: {
    user_message: string;
    evidence: string[];
    created_at: string;
  };
  confirmation_anchor: FlowOpportunityConfirmationAnchor;
  subskill_history: Array<Record<string, unknown>>;
  recent_user_messages: string[];
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type FlowOpportunityDispatcherOutput = {
  local_action: FlowOpportunityLocalAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  opportunity: {
    opportunity_id: string;
    target_flow: FlowOpportunityTargetFlow;
    target_action: string;
    confirmation_anchor_still_valid: boolean;
    reason: string;
  };
  target_flow_input: {
    focus: string[];
    surface: string | null;
    seed_context: Record<string, unknown>;
    origin_evidence: string[];
  };
  subskill_call: {
    needed: boolean;
    skill_id: "product_help" | "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  visible_task: {
    kind: FlowOpportunityVisibleTaskKind;
    instruction: string;
  };
  state_patch: {
    status: FlowOpportunityStatus;
    target_flow: FlowOpportunityTargetFlow;
    target_context: Record<string, unknown>;
    confirmation_anchor:
      | FlowOpportunityConfirmationAnchor
      | Record<string, unknown>;
    subskill_history_append: Record<string, unknown> | null;
  };
  exit_memo: {
    needed: boolean;
    reason: FlowOpportunityExitReason;
    flow_summary: string | null;
    original_opportunity_id: string | null;
    target_flow: FlowOpportunityTargetFlow | null;
    target_context: Record<string, unknown>;
    handoff_hint_for_global_dispatcher: string | null;
    same_user_message_should_be_reprocessed: boolean;
  };
  evidence: string[];
};

export type FlowOpportunityReducerResult = {
  status: FlowOpportunityStatus;
  reason_code: string;
  local_state: FlowOpportunityLocalState | null;
  visible_task: FlowOpportunityVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  launch_target_flow: boolean;
  get_info_product: boolean;
  get_info_db: boolean;
  target_flow: FlowOpportunityTargetFlow;
  target_flow_input: FlowOpportunityDispatcherOutput["target_flow_input"];
  subskill_context: Record<string, unknown> | null;
  exit_memo: FlowOpportunityDispatcherOutput["exit_memo"];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

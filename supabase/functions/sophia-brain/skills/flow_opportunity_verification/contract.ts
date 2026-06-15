import type { NoteInformation } from "../../contracts/note_information.v1.ts";

export type FlowOpportunityTargetFlow =
  | "status_recap"
  | "product_help"
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

export type FlowOpportunityTargetKind =
  | "skill"
  | "tool_skill"
  | "direct_effect"
  | "unknown";

export type FlowOpportunityFlowAction =
  | "offer_opportunity"
  | "insufficient_response"
  | "get_info_product"
  | "get_info_db"
  | "repeat_current_state"
  | "revise_focus"
  | "correct_target_flow"
  | "handoff_to_local_flow"
  | "blocked_or_unsupported"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "defer_flow"
  | "complete_flow"
  | "safety_preempt";

export type FlowOpportunityVisibleTaskKind =
  | "offer_status_recap"
  | "offer_preference_update"
  | "offer_emotional_repair"
  | "offer_demotivation_repair"
  | "offer_target_flow_generic"
  | "reanchor_offer_after_product_help"
  | "handoff_status_recap_ready"
  | "handoff_target_flow_ready"
  | "decline_ack"
  | "repeat_current_state"
  | "revise_focus_question"
  | "correct_target_flow_ack"
  | "blocked_or_unsupported"
  | "complete_or_stale"
  | "stop_or_cancel"
  | "exit_ack"
  | "safety_transition"
  | "none";

export type FlowOpportunityConversationContext = {
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

export type FlowOpportunityVisibleTask = {
  kind: FlowOpportunityVisibleTaskKind;
  conversation_context: FlowOpportunityConversationContext;
};

export type FlowOpportunityStatus =
  | "offered"
  | "explaining"
  | "waiting_confirmation"
  | "accepted"
  | "declined"
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
  target_kind: FlowOpportunityTargetKind;
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
  target_kind: FlowOpportunityTargetKind;
  target_flow: FlowOpportunityTargetFlow;
  target_context: Record<string, unknown>;
  must_not_reinterpret_acceptance_as: string[];
};

export type FlowOpportunityLocalState = {
  skill_id: "flow_opportunity_verification";
  mode: "local_verification_flow";
  status: FlowOpportunityStatus;
  opportunity_id: string;
  target_kind: FlowOpportunityTargetKind;
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
  flow_action: FlowOpportunityFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  modified_fields?: string[];
  clear_fields?: string[];
  opportunity: {
    opportunity_id: string;
    target_kind: FlowOpportunityTargetKind;
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
    conversation_context: FlowOpportunityConversationContext;
  };
  note_information: {
    needed: boolean;
    note: NoteInformation | null;
  };
  state_patch: {
    status: FlowOpportunityStatus;
    target_kind: FlowOpportunityTargetKind;
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
    target_kind: FlowOpportunityTargetKind | null;
    target_flow: FlowOpportunityTargetFlow | null;
    target_context: Record<string, unknown>;
    handoff_hint_for_global_dispatcher: string | null;
    same_user_message_should_be_reprocessed: boolean;
  };
  evidence: string[];
};

export type FlowOpportunityStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{
    field: string;
    reason_code: string;
    transition: FlowOpportunityFlowAction;
  }>;
};

export type FlowOpportunityReducerResult = {
  status: FlowOpportunityStatus;
  reason_code: string;
  flow_action: FlowOpportunityFlowAction;
  local_state: FlowOpportunityLocalState | null;
  visible_task: FlowOpportunityVisibleTask;
  exit_to_global_dispatcher: boolean;
  safety_preempt: boolean;
  handoff_to_local_flow: boolean;
  get_info_product: boolean;
  get_info_db: boolean;
  target_kind: FlowOpportunityTargetKind;
  target_flow: FlowOpportunityTargetFlow;
  target_flow_input: FlowOpportunityDispatcherOutput["target_flow_input"];
  subskill_context: Record<string, unknown> | null;
  exit_memo: FlowOpportunityDispatcherOutput["exit_memo"];
  note_information: NoteInformation | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  state_mutation_audit: FlowOpportunityStateMutationAudit;
  evidence: string[];
};

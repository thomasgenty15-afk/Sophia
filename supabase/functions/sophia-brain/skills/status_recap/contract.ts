import type { NoteInformation } from "../../contracts/note_information.v1.ts";

export type StatusRecapIntent =
  | "durable_status"
  | "object_status"
  | "recent_effects_recap"
  | "fait_prevu_fragile"
  | "cancelled_objects"
  | "coach_preferences_status"
  | "human_recap_no_db"
  | "unclear"
  | "not_status"
  | "safety";

export type StatusRecapLocalFlowAction =
  | "answer_status"
  | "answer_object_status"
  | "answer_coach_preferences_status"
  | "answer_cancelled_objects"
  | "answer_recent_effects"
  | "answer_fait_prevu_fragile"
  | "narrow_scope"
  | "repeat_last_status"
  | "explain_sources"
  | "no_source_status"
  | "human_recap_no_db"
  | "stop_local_no_handoff"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "handoff_to_local_flow"
  | "safety_preempt";

export type StatusRecapVisibleTaskKind =
  | "status_compact"
  | "object_status"
  | "coach_preferences_status"
  | "cancelled_objects"
  | "recent_effects"
  | "fait_prevu_fragile"
  | "narrow_scope_question"
  | "repeat_status"
  | "explain_sources"
  | "no_source"
  | "human_recap_redirect"
  | "stop_or_cancel"
  | "exit_ack"
  | "safety";

export type StatusRecapObjectType =
  | "attack_card"
  | "defense_card"
  | "one_shot_reminder"
  | "recurring_reminder"
  | "potion"
  | "coach_preference"
  | "plan_item"
  | "memory"
  | "unknown";

export type StatusRecapProjection = {
  attack_cards: Array<{
    id: string;
    title: string;
    status: string;
    generated_at: string | null;
  }>;
  defense_cards: Array<{
    id: string;
    title: string;
    status: string;
    generated_at: string | null;
  }>;
  one_shot_reminders: {
    pending: Array<{
      id: string;
      scheduled_for: string;
      local_time: string | null;
      instruction: string;
    }>;
    cancelled_recent: Array<{
      id: string;
      scheduled_for: string | null;
      local_time: string | null;
      instruction: string;
      updated_at: string | null;
    }>;
  };
  recurring_reminders: Array<{
    id: string;
    status: string;
    cadence_label: string | null;
    instruction: string | null;
  }>;
  potion_sessions: Array<{
    id: string;
    potion_type: string;
    status: string;
    created_at: string | null;
  }>;
  coach_preferences: Array<{
    key: string;
    value: unknown;
    reason: string | null;
    source_type: string | null;
    updated_at: string | null;
  }>;
  recent_effect_history: Array<{
    status:
      | "requested"
      | "allowed"
      | "committed"
      | "failed"
      | "blocked"
      | "proposed"
      | "delivered"
      | "cancelled"
      | "superseded"
      | "asked"
      | "resolved"
      | "topic_change";
    effect_type: string;
    created_at: string;
    reason_code: string | null;
  }>;
};

export type StatusRecapProjectionSummary = {
  attack_card_count: number;
  defense_card_count: number;
  one_shot_pending_count: number;
  one_shot_cancelled_recent_count: number;
  recurring_reminder_count: number;
  potion_session_count: number;
  coach_preference_count: number;
  recent_effect_history_count: number;
};

export type StatusRecapDbContextPack = {
  kind: "status_recap_db_context_pack";
  projection_summary: StatusRecapProjectionSummary;
  loaded_categories: Array<
    | "attack_cards"
    | "defense_cards"
    | "one_shot_reminders"
    | "recurring_reminders"
    | "potions"
    | "coach_preferences"
    | "recent_effects"
  >;
  source_policy: {
    read_only: true;
    db_grounded: true;
    micro_memory_used: false;
  };
};

export type StatusRecapConversationContext = {
  kind: "status_recap_conversation_context";
  stage: StatusRecapVisibleTaskKind;
  user_words: string[];
  context_summary: string | null;
  visible_instruction: string | null;
  status_intent_summary: string;
  requested_categories: StatusRecapLocalDispatcherOutput["read_scope"][
    "requested_categories"
  ];
  target_objects: StatusRecapObjectType[];
  include_cancelled: boolean;
  include_recent_failed_or_blocked_effects: boolean;
  format: "compact" | "object_answer" | "recap" | "fait_prevu_fragile";
  projection_summary: StatusRecapProjectionSummary;
  filtered_facts: Pick<
    StatusRecapProjection,
    | "attack_cards"
    | "defense_cards"
    | "one_shot_reminders"
    | "recurring_reminders"
    | "potion_sessions"
    | "coach_preferences"
    | "recent_effect_history"
  >;
  previous_answer_summary: string | null;
  handoff_data: {
    inbound_note_summary: string | null;
    inbound_source_flow_id: string | null;
    inbound_handoff_reason: string | null;
  };
  constraints: {
    read_only: true;
    no_chat_mutation: true;
    no_tool_execution: true;
    no_product_how_to: true;
    no_claim_without_filtered_fact: true;
    micro_memory_raw_available_to_visible_agent: false;
  };
};

export type StatusRecapLocalFlowState = {
  skill_id: "status_recap";
  mode: "local_readonly_flow";
  status: "active" | "closing" | "closed" | "exit_to_global" | "safety";
  last_intent:
    | "durable_status"
    | "object_status"
    | "recent_effects_recap"
    | "fait_prevu_fragile"
    | "cancelled_objects"
    | "coach_preferences_status"
    | "human_recap_no_db"
    | "unclear";
  last_target_objects: StatusRecapObjectType[];
  last_projection_summary: StatusRecapProjectionSummary;
  last_answer_summary: string | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type StatusRecapLocalDispatcherOutput = {
  flow_action: StatusRecapLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  status_intent: {
    kind: StatusRecapIntent;
    summary: string;
    requires_db_projection: boolean;
    requires_effect_history: boolean;
  };
  target_objects: StatusRecapObjectType[];
  read_scope: {
    requested_categories: Array<
      | "attack_cards"
      | "defense_cards"
      | "one_shot_reminders"
      | "recurring_reminders"
      | "potions"
      | "coach_preferences"
      | "recent_effects"
      | "all"
    >;
    include_cancelled: boolean;
    include_recent_failed_or_blocked_effects: boolean;
    format: "compact" | "object_answer" | "recap" | "fait_prevu_fragile";
  };
  state_updates: {
    status: StatusRecapLocalFlowState["status"];
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: StatusRecapVisibleTaskKind;
    instruction: string;
    conversation_context?: StatusRecapConversationContext;
  };
  note_information?: NoteInformation | null;
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "product_help"
      | "preference_update"
      | "new_goal"
      | "confirmation_for_other_flow"
      | "safety"
      | "unknown"
      | "none";
    user_intent_summary: string | null;
    local_flow_context: {
      skill_id: "status_recap";
      last_intent: string | null;
      last_target_objects: StatusRecapObjectType[];
      last_answer_summary: string | null;
      last_projection_summary: string | null;
    };
    handoff_hint_for_global_dispatcher: {
      likely_intent:
        | "prepare_attack_card"
        | "prepare_defense_card"
        | "select_state_potion"
        | "update_coach_preferences"
        | "one_shot_reminder"
        | "recurring_reminder"
        | "product_help"
        | "normal_coaching"
        | "unknown";
      why: string | null;
      constraints: string[];
    };
  };
  evidence: string[];
};

export const STATUS_RECAP_MIGRATION_STATUS = {
  standard_target:
    "local_dispatcher -> reducer -> visible_task.conversation_context -> stage_prompt",
  current_shape:
    "local_dispatcher -> DB/effect projection -> reducer -> visible_task.conversation_context -> stage_prompt",
  documented_exception:
    "none: activation and target selection must come from structured routing signals.",
  durable_effect_policy: "never_mutates",
} as const;

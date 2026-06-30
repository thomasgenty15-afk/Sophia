import type { NoteInformation } from "../../sophia-brain/contracts/note_information.v1.ts";

export type WhatsAppOnboardingPlanStatus =
  | "not_started"
  | "generating"
  | "missing"
  | "draft_pending_confirmation"
  | "ready_pending_activation"
  | "active"
  | "unknown";

export type WhatsAppOnboardingState =
  | "awaiting_plan_finalization"
  | "awaiting_plan_finalization_support"
  | "onboarding_pref_tone"
  | "onboarding_pref_challenge"
  | "onboarding_pref_questions"
  | "onboarding_plan_creation_feedback"
  | "onboarding_topic_choice";

export type WhatsAppOnboardingFlowAction =
  | "plan_not_ready_wait"
  | "plan_ready_resume_preferences"
  | "answer_tone"
  | "answer_challenge"
  | "answer_questions"
  | "skip_optional_preference"
  | "answer_plan_feedback"
  | "answer_topic_choice"
  | "repeat_current_question"
  | "progress_attempt_during_onboarding"
  | "blocked_exit_before_plan_ready"
  | "exit_to_global_dispatcher"
  | "complete_onboarding"
  | "safety_preempt"
  | "technical_blocked";

export type WhatsAppOnboardingVisibleTaskKind =
  | "plan_wait"
  | "plan_draft_ready_confirm_on_web"
  | "plan_ready_resume_preferences"
  | "ask_tone"
  | "preference_saved_next_challenge"
  | "preference_saved_next_questions"
  | "preference_skipped"
  | "ask_plan_feedback"
  | "ask_topic_choice"
  | "complete_to_plan"
  | "complete_to_global"
  | "blocked_exit_before_plan_ready"
  | "stop_after_plan_ready"
  | "progress_attempt_blocked"
  | "repeat_question"
  | "technical_blocked"
  | "safety";

export type WhatsAppOnboardingPreferenceKey =
  | "coach.tone"
  | "coach.challenge_level"
  | "coach.question_tendency";

export type WhatsAppOnboardingPreferenceUpdate = {
  key: WhatsAppOnboardingPreferenceKey;
  status: "missing" | "ambiguous" | "proposed" | "locked" | "skipped";
  candidate_value: string | null;
  locked_value: string | null;
  label: string | null;
  notes: string | null;
  needs_user_confirmation: boolean;
  why_status: string;
};

export type WhatsAppOnboardingConversationContext = {
  state_summary: string;
  stage: string;
  plan: {
    status: WhatsAppOnboardingPlanStatus;
    title: string | null;
    summary: string | null;
    first_items: string[];
  };
  preference: {
    key: WhatsAppOnboardingPreferenceKey | null;
    label: string | null;
    value_label: string | null;
    notes: string | null;
  };
  missing_or_weak_values: string[];
  feedback_summary: string | null;
  topic_choice_summary: string | null;
  inline_tool_summary: string | null;
  tone_constraints: string[];
  do_not_say: string[];
  evidence_used: string[];
};

export type WhatsAppOnboardingPlanProjection = {
  status: WhatsAppOnboardingPlanStatus;
  is_plan_ready_for_onboarding: boolean;
  why_status: string;
  active_plan_title: string | null;
  active_plan_summary: string | null;
  active_plan_item_count: number;
  active_plan_items_user_facing: string[];
  active_action_candidates_for_direct_effects: Array<{
    plan_item_id: string;
    title: string;
    status: string;
    plan_id: string | null;
    tracking_type: string | null;
    dimension: string | null;
    aliases: string[];
    occurrence_id: string | null;
  }>;
};

export type WhatsAppOnboardingExitMemo = {
  reason:
    | "none"
    | "topic_change"
    | "frustration"
    | "unknown_answer"
    | "user_declined_questions"
    | "completed"
    | "safety"
    | "technical";
  flow_summary: string | null;
  handoff_hint_for_global_dispatcher: string | null;
  handoff_justification_for_global_dispatcher: string | null;
  at: string;
};

export type WhatsAppOnboardingLocalDecision = {
  flow_action: WhatsAppOnboardingFlowAction;
  confidence: "low" | "medium" | "high";
  stage:
    | "plan_wait"
    | "plan_ready_resume"
    | "pref_tone"
    | "pref_challenge"
    | "pref_questions"
    | "plan_feedback"
    | "topic_choice"
    | "completed"
    | "exit"
    | "safety"
    | "technical";
  preference_updates: WhatsAppOnboardingPreferenceUpdate[];
  plan_feedback: {
    status:
      | "missing"
      | "positive"
      | "negative"
      | "mixed"
      | "skipped"
      | "unclear";
    summary: string | null;
    needs_followup: boolean;
  };
  topic_choice: {
    status: "missing" | "plan" | "other_topic" | "skip" | "unclear";
    handoff_hint_for_global_dispatcher: string | null;
    handoff_justification_for_global_dispatcher: string | null;
  };
  visible_task: {
    kind: WhatsAppOnboardingVisibleTaskKind;
    conversation_context: WhatsAppOnboardingConversationContext;
  };
  note_information: NoteInformation | null;
  exit_memo_request: {
    needed: boolean;
    exit_reason: WhatsAppOnboardingExitMemo["reason"];
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    handoff_justification_for_global_dispatcher: string | null;
    plan_required_exit_blocked: boolean;
  };
  global_effect_policy: {
    allow_global_dispatcher: boolean;
    allow_track_progress_plan_item: boolean;
    allow_normal_reply: boolean;
    why: string;
  };
  state_mutation_request?: {
    modified_fields: string[];
    clear_fields: string[];
  };
  risk_assessment: {
    risk_score: number;
    risk_band: "none" | "low" | "medium" | "high" | "critical";
    safety_preempt: boolean;
    reason_codes: string[];
  };
  evidence: string[];
};

export type WhatsAppOnboardingReducerInput = {
  whatsappState: WhatsAppOnboardingState;
  webOnboardingCompleted: boolean;
  whatsappPreferencesDone: boolean;
  planProjection: WhatsAppOnboardingPlanProjection;
  decision: WhatsAppOnboardingLocalDecision;
  previousLocalState?: WhatsAppOnboardingLocalState | null;
  nowIso?: string;
};

export type WhatsAppOnboardingLocalState = {
  version: 1;
  reason_code: string | null;
  visible_task: WhatsAppOnboardingVisibleTaskKind | null;
  flow_action: WhatsAppOnboardingFlowAction | null;
  current_whatsapp_state: WhatsAppOnboardingState | null;
  next_whatsapp_state: WhatsAppOnboardingState | null;
  current_preference_key: WhatsAppOnboardingPreferenceKey | null;
  plan_status: WhatsAppOnboardingPlanStatus;
  plan_ready: boolean;
  active_subflow_context: {
    target_dispatcher: string | null;
    status: WhatsAppOnboardingReducerResult["status"] | null;
    reason_code: string | null;
  } | null;
  note_information: NoteInformation | null;
  activation_note_information: NoteInformation | null;
  exit_memo: WhatsAppOnboardingExitMemo | null;
  local_state_summary: string | null;
  previous_flow_summary: string | null;
  updated_at: string | null;
};

export type WhatsAppOnboardingStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{
    field: string;
    operation: "modify" | "clear";
    reason_code: string;
  }>;
};

export type WhatsAppOnboardingReducerResult = {
  status:
    | "owned"
    | "exit_to_global_dispatcher"
    | "inline_tool"
    | "safety_preempt"
    | "technical_blocked";
  reason_code: string;
  next_whatsapp_state: WhatsAppOnboardingState | null;
  visible_task: WhatsAppOnboardingVisibleTaskKind;
  preference_writes: WhatsAppOnboardingPreferenceUpdate[];
  mark_done: boolean;
  completion_mode:
    | "not_done"
    | "completed"
    | "skipped_after_plan_ready"
    | "deferred_after_plan_ready"
    | "stopped_after_plan_ready";
  exit_memo: WhatsAppOnboardingExitMemo | null;
  note_information: NoteInformation | null;
  allow_global_dispatcher: boolean;
  allow_track_progress_plan_item: boolean;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  risk_assessment: WhatsAppOnboardingLocalDecision["risk_assessment"];
  local_state: WhatsAppOnboardingLocalState;
  state_mutation_audit: WhatsAppOnboardingStateMutationAudit;
};

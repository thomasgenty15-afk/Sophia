import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";

export type CoachPreferencesPatchDraftRef = {
  operation_type: "update_coach_preferences";
  output_schema: "coach_preferences_patch_draft_v1";
  draft: {
    patch: Partial<Record<CoachPreferenceKey, string>>;
    summary: string;
    reason?: string | null;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export type CoachPreferenceHandoffStatus =
  | "collecting"
  | "clarifying"
  | "handoff_ready"
  | "handoff_delivered"
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "punctual_instruction"
  | "unsupported_preference"
  | "cancelled"
  | "topic_change"
  | "blocked";

export type CoachPreferenceHandoffDraft = {
  operation_type: "update_coach_preferences";
  mode: "platform_handoff";
  no_chat_mutation: true;
  executable_from_chat: false;
  user_request_summary: string;
  preference_kind:
    | "durable_supported"
    | "durable_unsupported"
    | "punctual_instruction"
    | "ambiguous";
  supported_settings: Array<{
    key: "coach.tone" | "coach.challenge_level" | "coach.question_tendency";
    label: string;
    recommended_value: string;
    explanation: string;
  }>;
  unsupported_parts: string[];
  recommendation: {
    platform_destination: string;
    platform_steps: string[];
    preserve: string[];
    avoid: string[];
  };
  missing_decisions: string[];
};

export type UpdateCoachPreferenceUserIntent =
  | "set_preference"
  | "preview_only"
  | "verify_preference"
  | "cancel"
  | "reject"
  | "revise"
  | "explain"
  | "topic_change"
  | "status_question"
  | "apply_attempt"
  | "repeat_handoff"
  | "punctual_instruction"
  | "unsupported_preference"
  | "clarify"
  | "unknown";

export type UpdateCoachPreferencesEffect = {
  type: "update_coach_preferences";
  operation_id: string;
  draft: CoachPreferencesPatchDraftRef;
};

export type UpdateCoachPreferencesCommittedEffect = {
  type: "update_coach_preferences";
  operation_id: string;
  preference_keys: string[];
  preferences_update_ids?: string[];
};

export type CoachPreferenceLocalFlowAction =
  | "write_preferences"
  | "clarify_durable_vs_punctual"
  | "clarify_supported_setting"
  | "clarify_value"
  | "propose_supported_mapping"
  | "confirm_proposed_mapping"
  | "punctual_instruction"
  | "unsupported_preference"
  | "status_question"
  | "explain_preferences"
  | "revise_preferences"
  | "repeat_saved_preferences"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type CoachPreferenceIntentKind =
  | "durable_supported"
  | "durable_unsupported"
  | "punctual_instruction"
  | "ambiguous"
  | "status_question"
  | "explain"
  | "cancel"
  | "topic_change"
  | "safety";

export type CoachPreferenceDurability =
  | "durable"
  | "punctual"
  | "ambiguous"
  | "not_applicable";

export type CoachPreferenceSupportStatus =
  | "supported"
  | "unsupported"
  | "partial"
  | "ambiguous"
  | "not_applicable";

export type CoachPreferenceUpdateStatus =
  | "missing"
  | "proposed"
  | "locked"
  | "rejected";

export type CoachPreferenceVisibleTaskKind =
  | "preference_saved"
  | "ask_durable_vs_punctual"
  | "ask_setting_or_value"
  | "confirm_supported_mapping"
  | "punctual_instruction_ack"
  | "unsupported_preference"
  | "get_info_db"
  | "get_info_product"
  | "repeat_saved_preferences"
  | "write_failed_or_blocked"
  | "exit_or_cancel"
  | "safety";

export type CoachPreferenceLocalUpdate = {
  key: "coach.tone" | "coach.challenge_level" | "coach.question_tendency";
  value: "soft" | "warm_direct" | "direct" | "low" | "balanced" | "high" |
    "normal";
  status: CoachPreferenceUpdateStatus;
  user_facing_label: string;
  user_facing_value: string;
  reason: string;
  needs_user_confirmation: boolean;
};

export type CoachPreferenceLocalDispatcherOutput = {
  flow_action: CoachPreferenceLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  preference_intent: {
    kind: CoachPreferenceIntentKind;
    durability: CoachPreferenceDurability;
    support_status: CoachPreferenceSupportStatus;
    summary: string;
  };
  preference_updates: CoachPreferenceLocalUpdate[];
  unsupported_parts: string[];
  missing_decisions: Array<
    "durability" | "setting" | "value" | "confirmation"
  >;
  visible_task: {
    kind: CoachPreferenceVisibleTaskKind;
    instruction: string;
  };
  exit_memo: {
    needed: boolean;
    reason: "topic_change" | "cancelled" | "safety" | "none";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  evidence: string[];
};

export type UpdateCoachPreferencesSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "preview_only"
    | "handoff_ready"
    | "handoff_delivered"
    | "revise_handoff"
    | "repeat_handoff"
    | "apply_attempt"
    | "punctual_instruction"
    | "unsupported_preference"
    | "cancelled"
    | "revised"
    | "explained"
    | "verified"
    | "blocked"
    | "executed"
    | "failed";
  user_intent: UpdateCoachPreferenceUserIntent;
  updated_state?: unknown;
  handoff_draft?: CoachPreferenceHandoffDraft | null;
  reply: string | null;
  requested_effects: UpdateCoachPreferencesEffect[];
  allowed_effects: UpdateCoachPreferencesEffect[];
  committed_effects: UpdateCoachPreferencesCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  pending_confirmation?: Record<string, unknown> | null;
  debug: {
    reason_code: string;
    evidence: string[];
  };
};

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

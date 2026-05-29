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
    | "pending_confirmation"
    | "cancelled"
    | "revised"
    | "explained"
    | "verified"
    | "blocked"
    | "executed"
    | "failed";
  user_intent: UpdateCoachPreferenceUserIntent;
  updated_state?: unknown;
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

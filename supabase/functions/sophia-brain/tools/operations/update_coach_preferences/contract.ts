import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";
import type { NoteInformation } from "../../../contracts/note_information.v1.ts";

export type UpdateCoachPreferencesCommittedEffect = {
  type: "update_coach_preferences";
  operation_id: string;
  preference_keys: string[];
  preferences_update_ids?: string[];
};

export const COACH_PREFERENCE_VALUES: Record<CoachPreferenceKey, string[]> = {
  "coach.tone": ["soft", "warm_direct", "direct"],
  "coach.challenge_level": ["low", "balanced", "high"],
  "coach.question_tendency": ["low", "normal", "high"],
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
  | "repeat_current_state"
  | "inline_tool_roundtrip"
  | "exit_to_global_dispatcher"
  | "complete_flow"
  | "handoff_to_local_flow"
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
  | "repeat_current_state"
  | "write_failed_or_blocked"
  | "inline_tool_return"
  | "exit_or_cancel"
  | "stop_or_cancel"
  | "exit_ack"
  | "safety"
  | "safety_transition";

export type CoachPreferenceLocalUpdate = {
  key: "coach.tone" | "coach.challenge_level" | "coach.question_tendency";
  value:
    | "soft"
    | "warm_direct"
    | "direct"
    | "low"
    | "balanced"
    | "high"
    | "normal";
  status: CoachPreferenceUpdateStatus;
  user_facing_label: string;
  user_facing_value: string;
  reason: string;
  needs_user_confirmation: boolean;
  source?: "user_message" | "db_context" | "note_information" | "inference";
  confidence?: "low" | "medium" | "high";
  evidence?: string[];
};

export type CoachPreferenceDbContextPack = {
  source: "user_profile_facts";
  freshness: "same_turn" | "recent" | "unknown";
  confidence: "low" | "medium" | "high";
  preferences: Array<{
    key: string;
    value: string;
    label: string;
    source_type?: string | null;
    status?: string | null;
    updated_at?: string | null;
    last_confirmed_at?: string | null;
    reason?: string | null;
    evidence: string[];
  }>;
  supported_catalog: Record<string, string[]>;
  active_flow: Record<string, unknown> | null;
  last_committed_effects: UpdateCoachPreferencesCommittedEffect[];
  product_surface_summary: string;
};

export type CoachPreferenceMicroMemoryContext = {
  items: Array<{
    summary: string;
    source: string;
    linked_object?: Record<string, unknown>;
    freshness: "same_turn" | "recent" | "older";
    confidence: "low" | "medium" | "high";
    evidence: string[];
    sensitivity: "normal" | "sensitive" | "safety";
  }>;
  exclusions: string[];
  budget: {
    max_items: number;
    reason: string;
  };
};

export type CoachPreferenceConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage:
    | "durability"
    | "setting"
    | "value"
    | "confirmation"
    | "done"
    | null;
  known_values: {
    current_preferences: Array<{ key: string; value: string; label: string }>;
    proposed_updates: CoachPreferenceLocalUpdate[];
    committed_updates: CoachPreferenceLocalUpdate[];
  };
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  unsupported_parts: string[];
  write_result: {
    committed: boolean;
    preference_keys: string[];
    blocked_reason: string | null;
  };
  inline_tool_result: {
    skill_id: "status_recap" | "product_help" | null;
    summary: string | null;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type CoachPreferenceDispatcherNoteInformation =
  | { needed: false }
  | ({ needed: true } & NoteInformation);

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
    conversation_context: CoachPreferenceConversationContext;
  };
  note_information: CoachPreferenceDispatcherNoteInformation;
  exit_memo?: {
    needed: boolean;
    reason: "topic_change" | "cancelled" | "safety" | "none";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  safety?: {
    risk_band: "none" | "low" | "medium" | "high" | "critical";
    reason_codes: string[];
    should_preempt: boolean;
  };
  evidence: string[];
};

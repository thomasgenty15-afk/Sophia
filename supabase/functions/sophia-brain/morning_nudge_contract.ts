export type MorningNudgeKind =
  | "action_nudge"
  | "suppressed_action_nudge"
  | "emotional_presence_nudge"
  | "no_action_greeting";

export type MorningNudgeLegacyFollowupFlowKind =
  | "action"
  | "suppressed_action"
  | "emotional_presence";

export type MorningNudgeCoachIntent =
  | "motivate_action"
  | "simplify_action"
  | "support_emotion"
  | "protect_emotion"
  | "celebrate"
  | "reactivate"
  | "greet"
  | "ground_before_event";

export type MorningNudgeSuppressionReason =
  | "high_emotional_load"
  | "fatigue"
  | "recent_high_emotion"
  | "overloaded"
  | "pause_consentie"
  | "no_items"
  | null;

export type MorningNudgeAnchor = {
  kind:
    | "recent_emotional_thread"
    | "upcoming_event"
    | "plan_blocker"
    | "none";
  label: string | null;
  specificity: "none" | "vague" | "soft" | "explicit";
  confidence: "low" | "medium" | "high";
  sensitivity: "normal" | "sensitive" | "safety";
  user_consent_signal:
    | "explicit_followup_ok"
    | "implied_ok"
    | "unknown"
    | "avoid";
  visible_hint: string | null;
  do_not_mention: string[];
  evidence_refs: {
    message_ids: string[];
    event_ids: string[];
  };
};

export type MorningScheduledCommitment = {
  id: string;
  scheduled_for: string;
  event_context: string;
  status: string;
  origin: string | null;
  summary: string | null;
  instruction_hint: string | null;
};

export type MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2";
  nudge_kind: MorningNudgeKind;
  posture:
    | "focus_today"
    | "simplify_today"
    | "open_door"
    | "support_softly"
    | "protective_pause"
    | "celebration_ping"
    | "pre_event_grounding"
    | "greeting";
  opens_local_flow: boolean;
  intended_followup_flow: MorningNudgeLegacyFollowupFlowKind | null;
  coach_intent: MorningNudgeCoachIntent;
  target_action_ids: string[];
  target_action_titles: string[];
  target_item_ids: string[];
  target_item_titles: string[];
  suppressed_action_ids: string[];
  suppressed_action_titles: string[];
  suppression_reason: MorningNudgeSuppressionReason;
  morning_anchor?: MorningNudgeAnchor;
  morning_scheduled_commitments?: MorningScheduledCommitment[];
  coordination_notes?: string[];
  source_reason: string;
  source_grounding: string | null;
  sent_at: string;
};

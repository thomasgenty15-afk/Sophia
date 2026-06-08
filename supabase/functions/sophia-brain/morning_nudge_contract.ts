export type MorningNudgeKind =
  | "action_nudge"
  | "suppressed_action_nudge"
  | "emotional_presence_nudge"
  | "no_action_greeting";

export type PostMorningNudgeFlowKind =
  | "action"
  | "suppressed_action"
  | "emotional_presence";

export type PostMorningNudgeStatus =
  | "active"
  | "closing"
  | "closed"
  | "exit_to_global"
  | "safety";

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
  intended_followup_flow: PostMorningNudgeFlowKind | null;
  coach_intent: MorningNudgeCoachIntent;
  target_action_ids: string[];
  target_action_titles: string[];
  target_item_ids: string[];
  target_item_titles: string[];
  suppressed_action_ids: string[];
  suppressed_action_titles: string[];
  suppression_reason: MorningNudgeSuppressionReason;
  source_reason: string;
  source_grounding: string | null;
  sent_at: string;
};

export function isPostMorningNudgeFlowKind(
  value: unknown,
): value is PostMorningNudgeFlowKind {
  return value === "action" || value === "suppressed_action" ||
    value === "emotional_presence";
}

export function flowKindForMorningNudgeKind(
  nudgeKind: MorningNudgeKind,
): PostMorningNudgeFlowKind | null {
  if (nudgeKind === "action_nudge") return "action";
  if (nudgeKind === "suppressed_action_nudge") return "suppressed_action";
  if (nudgeKind === "emotional_presence_nudge") return "emotional_presence";
  return null;
}

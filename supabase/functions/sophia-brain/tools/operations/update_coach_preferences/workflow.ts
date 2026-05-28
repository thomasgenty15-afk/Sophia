import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";

export type CoachPreferenceConfidence = "low" | "medium" | "high";

export type CoachPreferenceStep =
  | "preference_resolution"
  | "draft_generation"
  | "draft_validation"
  | "confirmation";

export const COACH_PREFERENCE_VALUES: Record<CoachPreferenceKey, string[]> = {
  "coach.tone": ["soft", "warm_direct", "direct"],
  "coach.challenge_level": ["low", "balanced", "high"],
  "coach.question_tendency": ["low", "normal", "high"],
  "coach.response_max_lines": ["three", "normal"],
  "coach.emoji_policy": ["none", "normal"],
  "coach.final_question_policy": ["avoid_unnecessary", "normal"],
};

export type CoachPreferenceSlot = {
  status: "missing" | "ambiguous" | "identified";
  key?: CoachPreferenceKey | null;
  confidence: CoachPreferenceConfidence;
  evidence: string[];
};

export type CoachPreferenceDesiredValueSlot = {
  status: "missing" | "ambiguous" | "identified";
  value?: string | null;
  confidence: CoachPreferenceConfidence;
  evidence: string[];
};

export type CoachPreferenceIntakeState = {
  skill_id: "update_coach_preferences";
  current_step: CoachPreferenceStep;
  preference: CoachPreferenceSlot;
  desired_value: CoachPreferenceDesiredValueSlot;
  reason: {
    evidence: string[];
    confidence: CoachPreferenceConfidence;
  };
  constraints: string[];
  missing_slots: string[];
  confidence: CoachPreferenceConfidence;
  generated_user_message?: string | null;
};

export type CoachPreferenceToolSkillState = {
  skill_id: "update_coach_preferences";
  status:
    | "collecting"
    | "draft_ready"
    | "awaiting_user_confirmation"
    | "executing"
    | "completed"
    | "cancelled"
    | "fallback";
  current_step: CoachPreferenceStep;
  intake_state: CoachPreferenceIntakeState;
  missing_slots: string[];
  confidence: CoachPreferenceConfidence;
  conversation_summary: string;
};

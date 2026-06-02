import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";
import type { UpdateCoachPreferenceUserIntent } from "./contract.ts";

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
  user_intent: UpdateCoachPreferenceUserIntent;
  preference: CoachPreferenceSlot;
  desired_value: CoachPreferenceDesiredValueSlot;
  requested_patch?: Partial<Record<CoachPreferenceKey, string>>;
  reason: {
    evidence: string[];
    confidence: CoachPreferenceConfidence;
  };
  constraints: string[];
  structured_constraints?: {
    draft_only?: boolean;
    do_not_store?: boolean;
  };
  missing_slots: string[];
  confidence: CoachPreferenceConfidence;
  generated_user_message?: string | null;
};

export type CoachPreferenceToolSkillState = {
  skill_id: "update_coach_preferences";
  status:
    | "collecting"
    | "draft_ready"
    | "handoff_ready"
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

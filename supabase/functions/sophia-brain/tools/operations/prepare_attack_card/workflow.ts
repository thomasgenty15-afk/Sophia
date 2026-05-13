import type { AttackTechniqueKey } from "./generator.ts";

export type AttackCardStep =
  | "target_intake"
  | "technique_selection"
  | "keyword_intake"
  | "draft_generation"
  | "draft_validation"
  | "confirmation";

export type AttackCardConfidence = "low" | "medium" | "high";

export type AttackCardTargetSlot =
  | {
    status: "identified";
    kind: "plan_item" | "personal_action";
    plan_item_id?: string | null;
    title: string;
    confidence: AttackCardConfidence;
    evidence: string[];
  }
  | {
    status: "missing" | "ambiguous";
    kind?: "unknown";
    candidates?: Array<{
      kind: "plan_item";
      plan_item_id: string;
      title: string;
      confidence: number;
      evidence: string[];
    }>;
    confidence: AttackCardConfidence;
    evidence: string[];
  };

export type AttackCardTechniqueSlot = {
  status: "missing" | "ambiguous" | "identified";
  value?: AttackTechniqueKey | null;
  explicitly_requested?: boolean;
  fit_warning?: string | null;
  options?: Array<{
    technique_key: AttackTechniqueKey;
    title: string;
    description: string;
    reason: string;
    example: string;
    recommended?: boolean;
  }>;
  confidence: AttackCardConfidence;
  evidence: string[];
};

export type AttackCardKeywordSlot = {
  status: "not_applicable" | "missing" | "ambiguous" | "identified";
  value?: string | null;
  options?: string[];
  rejected_value?: string | null;
  confidence: AttackCardConfidence;
  evidence: string[];
};

export type AttackCardBlockerSlot = {
  type:
    | "avoidance"
    | "procrastination"
    | "action_too_heavy"
    | "unclear_first_step"
    | "low_energy"
    | "friction"
    | "mixed";
  confidence: number;
  evidence: string[];
};

export type AttackCardIntakeState = {
  skill_id: "prepare_attack_card";
  current_step: AttackCardStep;
  target: AttackCardTargetSlot;
  technique: AttackCardTechniqueSlot;
  activation_keyword: AttackCardKeywordSlot;
  blocker: AttackCardBlockerSlot;
  constraints: string[];
  missing_slots: string[];
  confidence: AttackCardConfidence;
  generated_user_message?: string | null;
};

export type AttackCardToolSkillState = {
  skill_id: "prepare_attack_card";
  status:
    | "collecting"
    | "draft_ready"
    | "awaiting_user_confirmation"
    | "executing"
    | "completed"
    | "cancelled"
    | "fallback";
  current_step: AttackCardStep;
  intake_state: AttackCardIntakeState;
  missing_slots: string[];
  confidence: AttackCardConfidence;
  conversation_summary: string;
};

export const ATTACK_CARD_STAGE_ORDER: AttackCardStep[] = [
  "target_intake",
  "technique_selection",
  "keyword_intake",
  "draft_generation",
  "draft_validation",
  "confirmation",
];

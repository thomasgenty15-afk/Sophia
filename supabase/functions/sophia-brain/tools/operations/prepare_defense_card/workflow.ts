import type { DefenseCardGeneratorInput } from "../_shared/operation_payload_builder.ts";

type DefenseResponseHint = NonNullable<
  DefenseCardGeneratorInput["defense_response_hint"]
>;

export type DefenseCardStep =
  | "attachment_intake"
  | "risk_intake"
  | "response_design"
  | "draft_generation"
  | "draft_validation"
  | "confirmation";

export type DefenseCardConfidence = "low" | "medium" | "high";

export type DefenseCardAttachmentSlot =
  | {
    status: "identified";
    kind: DefenseCardGeneratorInput["attachment"]["kind"];
    plan_item_id?: string | null;
    title: string;
    confidence: DefenseCardConfidence;
    evidence: string[];
  }
  | {
    status: "missing" | "ambiguous";
    candidates?: Array<{
      kind: "plan_item";
      plan_item_id: string;
      title: string;
      confidence: number;
      evidence: string[];
    }>;
    confidence: DefenseCardConfidence;
    evidence: string[];
  };

export type DefenseCardRiskSlot = {
  status: "missing" | "ambiguous" | "identified";
  label?: string | null;
  description?: string | null;
  timing_hint?: string | null;
  context_hint?: string | null;
  confidence: DefenseCardConfidence;
  evidence: string[];
};

export type DefenseCardTriggerSlot = {
  status: "missing" | "ambiguous" | "identified";
  type?: DefenseCardGeneratorInput["trigger"]["type"] | null;
  confidence: number;
  evidence: string[];
};

export type DefenseCardGoalSlot = {
  status: "missing" | "identified";
  value?: DefenseCardGeneratorInput["defense_goal"] | null;
  confidence: DefenseCardConfidence;
  evidence: string[];
};

export type DefenseCardResponseSlot = {
  status: "missing" | "ambiguous" | "identified";
  strategy_hint?: DefenseResponseHint["strategy_hint"] | null;
  value?: string | null;
  confidence: DefenseCardConfidence;
  evidence: string[];
};

export type DefenseCardToolFitSlot = {
  status: "defense" | "attack_better" | "unclear";
  reason?: string | null;
  confidence: DefenseCardConfidence;
  evidence: string[];
};

export type DefenseCardIntakeState = {
  skill_id: "prepare_defense_card";
  current_step: DefenseCardStep;
  tool_fit: DefenseCardToolFitSlot;
  attachment: DefenseCardAttachmentSlot;
  risk_situation: DefenseCardRiskSlot;
  trigger: DefenseCardTriggerSlot;
  defense_goal: DefenseCardGoalSlot;
  defense_response_hint: DefenseCardResponseSlot;
  constraints: string[];
  missing_slots: string[];
  confidence: DefenseCardConfidence;
  generated_user_message?: string | null;
};

export type DefenseCardToolSkillState = {
  skill_id: "prepare_defense_card";
  status:
    | "collecting"
    | "draft_ready"
    | "awaiting_user_confirmation"
    | "executing"
    | "completed"
    | "cancelled"
    | "fallback";
  current_step: DefenseCardStep;
  intake_state: DefenseCardIntakeState;
  missing_slots: string[];
  confidence: DefenseCardConfidence;
  conversation_summary: string;
};

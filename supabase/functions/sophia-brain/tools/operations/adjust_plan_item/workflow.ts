export type AdjustPlanSubSkillId =
  | "scope_router"
  | "action_intake"
  | "level_intake"
  | "whole_plan_intake"
  | "draft_validation";

export type AdjustPlanSubSkillTrace = {
  sub_skill_id: AdjustPlanSubSkillId;
  status:
    | "selected"
    | "skipped"
    | "needs_clarification"
    | "ready"
    | "ready_for_confirmation";
  reason_code: string;
  missing_slots: string[];
};

export type DraftReviewState = {
  status: "valid" | "needs_revision" | "blocked";
  issues: string[];
  required_revision?: string | null;
  user_ready_review_message?: string | null;
};

export type AdjustPlanToolSkillState<TIntakeState = unknown> = {
  status:
    | "collecting"
    | "draft_ready"
    | "awaiting_user_confirmation"
    | "executing"
    | "completed"
    | "cancelled"
    | "fallback";
  current_sub_skill: AdjustPlanSubSkillId;
  stage_order: AdjustPlanStage[];
  intake_state?: TIntakeState;
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  sub_skill_trace: AdjustPlanSubSkillTrace[];
  conversation_summary: string;
  draft_validation?: DraftReviewState;
};

export type AdjustPlanStage =
  | "scope"
  | "reason_change"
  | "change_target"
  | "constraints"
  | "affected_items"
  | "draft_generation"
  | "draft_validation"
  | "user_confirmation"
  | "execution"
  | "closure";

export const ADJUST_PLAN_STAGE_ORDER: AdjustPlanStage[] = [
  "scope",
  "reason_change",
  "change_target",
  "constraints",
  "affected_items",
  "draft_generation",
  "draft_validation",
  "user_confirmation",
  "execution",
  "closure",
];

export const ADJUST_PLAN_SUB_SKILLS: Array<{
  id: AdjustPlanSubSkillId;
  role: string;
  minimum_ready_slots: string[];
}> = [
  {
    id: "scope_router",
    role:
      "Determine if the user targets one action, the current level, or the whole plan.",
    minimum_ready_slots: ["scope.status=identified", "scope.kind"],
  },
  {
    id: "action_intake",
    role:
      "Fill the action-specific adjustment payload once scope is a specific plan item.",
    minimum_ready_slots: [
      "scope.plan_item_id",
      "adjustment_type",
      "reason",
      "constraints",
    ],
  },
  {
    id: "level_intake",
    role:
      "Fill the current-level adjustment payload and protect whole-plan boundaries.",
    minimum_ready_slots: [
      "reason_change",
      "change_target",
      "constraints",
      "affected_items_before_execution",
    ],
  },
  {
    id: "whole_plan_intake",
    role:
      "Fill the whole-plan adjustment payload and preserve the global objective when requested.",
    minimum_ready_slots: [
      "reason_change",
      "global_change_target",
      "preserved_intent",
      "impact_examples_before_confirmation",
    ],
  },
  {
    id: "draft_validation",
    role:
      "Validate the generated draft and require concrete examples before confirmation.",
    minimum_ready_slots: [
      "user_ready_review_message",
      "changed_examples",
      "boundaries",
      "no_pre_confirmation_execution_claim",
    ],
  },
];

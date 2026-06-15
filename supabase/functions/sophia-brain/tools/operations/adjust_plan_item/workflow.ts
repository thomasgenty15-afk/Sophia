export type AdjustPlanSubSkillId =
  | "input_coach"
  | "draft_validation"
  | "platform_handoff";

export type AdjustPlanSubSkillTrace = {
  sub_skill_id: AdjustPlanSubSkillId;
  status:
    | "selected"
    | "skipped"
    | "needs_clarification"
    | "ready"
    | "ready_for_handoff";
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
    | "clarifying"
    | "draft_ready"
    | "draft_delivered"
    | "revise_draft"
    | "repeat_draft"
    | "apply_attempt"
    | "cancelled"
    | "topic_change"
    | "blocked"
    | "fallback";
  current_sub_skill: AdjustPlanSubSkillId;
  stage_order: AdjustPlanStage[];
  intake_state?: TIntakeState;
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  sub_skill_trace: AdjustPlanSubSkillTrace[];
  conversation_summary: string;
  coaching_guidance?: unknown;
  coaching_guidance_audit?: unknown;
  draft_validation?: DraftReviewState;
};

export type AdjustPlanStage =
  | "listen_blocker"
  | "clarify_blocker_if_needed"
  | "draft_platform_input"
  | "draft_validation"
  | "platform_handoff"
  | "closure_no_mutation";

export const ADJUST_PLAN_STAGE_ORDER: AdjustPlanStage[] = [
  "listen_blocker",
  "clarify_blocker_if_needed",
  "draft_platform_input",
  "draft_validation",
  "platform_handoff",
  "closure_no_mutation",
];

export const ADJUST_PLAN_SUB_SKILLS: Array<{
  id: AdjustPlanSubSkillId;
  role: string;
  minimum_ready_slots: string[];
}> = [
  {
    id: "input_coach",
    role:
      "Help the user formulate a clear platform input about what feels blocked in the plan.",
    minimum_ready_slots: ["user_blocker_summary", "suggested_platform_input"],
  },
  {
    id: "draft_validation",
    role:
      "Validate the generated platform input and block executable or mutation wording.",
    minimum_ready_slots: [
      "suggested_platform_input",
      "platform_destination",
    ],
  },
  {
    id: "platform_handoff",
    role:
      "Redirect the user to Plan with a reusable input and no chat mutation.",
    minimum_ready_slots: [
      "suggested_platform_input",
      "platform_destination",
    ],
  },
];

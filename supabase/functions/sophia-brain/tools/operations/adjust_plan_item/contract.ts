import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import type { AdjustPlanToolSkillState } from "./workflow.ts";

export type AdjustPlanIntent =
  | "start_adjustment"
  | "draft_only"
  | "revise_draft"
  | "confirm_draft"
  | "reject_draft"
  | "explain_draft"
  | "change_scope"
  | "weekly_bridge"
  | "status_or_meta"
  | "off_topic"
  | "unclear";

export type AdjustPlanScopeKind =
  | "specific_plan_item"
  | "action_cluster"
  | "current_week"
  | "current_level"
  | "whole_plan"
  | "unknown";

export type AdjustPlanChangeKind =
  | "reduce"
  | "increase"
  | "pause"
  | "resume"
  | "replace"
  | "split"
  | "reschedule"
  | "copy_forward"
  | "bridge_action"
  | "clarify"
  | "unknown";

export type AdjustPlanConstraint =
  | "requires_confirmation"
  | "draft_only"
  | "do_not_apply"
  | "do_not_modify_level_objective"
  | "do_not_touch_completed_items"
  | "do_not_touch_support_items"
  | "preserve_user_exact_constraints"
  | "no_done_language_without_commit";

export type AdjustPlanDecisionStatus =
  | "collecting"
  | "draft_ready"
  | "pending_confirmation"
  | "revising"
  | "rejected"
  | "applied"
  | "blocked"
  | "off_topic";

export type AdjustPlanDecision = {
  skill_id: "adjust_plan_item";
  operation_id: string;
  intent: AdjustPlanIntent;
  status: AdjustPlanDecisionStatus;
  scope: {
    kind: AdjustPlanScopeKind;
    plan_item_ids: string[];
    target_hint: string | null;
    confidence: "high" | "medium" | "low";
    missing_slots: string[];
  };
  change: {
    kind: AdjustPlanChangeKind;
    user_problem: string | null;
    requested_change: string | null;
    exact_constraints: string[];
    missing_slots: string[];
  };
  draft: {
    available: boolean;
    requires_confirmation: true;
    summary: string | null;
    patch: Record<string, unknown> | null;
  };
  effect_plan: {
    allowed: boolean;
    effects: Array<{
      type: "adjust_plan_item";
      operation_id: string;
      scope_kind: AdjustPlanScopeKind;
      patch: Record<string, unknown>;
      requires_confirmation: true;
    }>;
    blocked_reason?: string | null;
  };
  constraints: AdjustPlanConstraint[];
  reply: string;
  state_patch: Record<string, unknown>;
};

export type AdjustPlanDecisionDraft =
  & Omit<
    AdjustPlanDecision,
    "effect_plan" | "reply" | "state_patch"
  >
  & {
    effect_plan?: Partial<AdjustPlanDecision["effect_plan"]>;
    reply?: string | null;
    state_patch?: Record<string, unknown> | null;
  };

export type AdjustPlanResolvedScope = {
  kind: AdjustPlanScopeKind;
  plan_item_ids: string[];
  target_hint: string | null;
  confidence: "high" | "medium" | "low";
  missing_slots: string[];
  blocked_reason: string | null;
  resolved_items: AdjustPlanRouterPlanItemSnapshot[];
  blocked_item_reasons: string[];
};

export type AdjustPlanUserIntent =
  | "start"
  | "provide_slot"
  | "preview_draft"
  | "approve"
  | "cancel"
  | "reject"
  | "revise"
  | "explain"
  | "topic_change"
  | "weekly_bridge"
  | "status_question"
  | "clarify"
  | "unknown";

export type AdjustPlanEffect = {
  type: "adjust_plan_item";
  operation_id: string;
  draft: PlanAdjustmentDraftV1;
};

export type AdjustPlanCommittedEffect = {
  type: "adjust_plan_item";
  operation_id: string;
  plan_patch_id: string;
  bridge_plan_item_id?: string | null;
  draft: PlanAdjustmentDraftV1;
};

export type AdjustPlanSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "draft_review"
    | "pending_confirmation"
    | "cancelled"
    | "revised"
    | "explained"
    | "blocked"
    | "executed"
    | "failed";
  user_intent: AdjustPlanUserIntent;
  updated_state?: AdjustPlanToolSkillState | null;
  reply: string | null;
  requested_effects: AdjustPlanEffect[];
  allowed_effects: AdjustPlanEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  committed_effects: AdjustPlanCommittedEffect[];
  pending_confirmation?: Record<string, unknown> | null;
  debug: {
    reason_code: string;
    sub_skill_trace?: unknown;
  };
};

export type AdjustPlanOperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

export type AdjustPlanRouterPlanItemSnapshot = {
  id: string;
  title: string;
  description?: string | null;
  dimension: string;
  item_type: string;
  status: string;
  cadence_label?: string | null;
  target_reps?: number | null;
  current_reps?: number | null;
  available_this_week?: boolean;
  availability_status?: string | null;
  item_nature?: string | null;
  week_scope?: Record<string, unknown> | null;
  streak_current?: number;
  last_entry_at?: string | null;
  payload?: Record<string, unknown> | null;
};

export type AdjustPlanRouterContext = {
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history: any[];
  tempMemory: any;
  planItemSnapshot?: AdjustPlanRouterPlanItemSnapshot[];
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: { risk_band: RiskBand };
  sourceMessageId: string | null;
  requestId?: string | null;
  forceFullAi?: boolean;
  enableAdjustPlanCoachGuidance?: boolean;
  confirmationSecret: string;
};

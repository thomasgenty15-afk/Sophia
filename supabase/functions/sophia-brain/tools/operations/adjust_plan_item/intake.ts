import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import type { PlanAdjustmentDraftV1 } from "./contract.ts";
import type { AdjustPlanCoachGuidance } from "./coach_guidance.ts";
import type { AdjustPlanToolSkillState } from "./workflow.ts";

type SlotStatus = "missing" | "identified" | "ambiguous";
type ScopeKind = "specific_plan_item" | "current_level" | "whole_plan";
type TargetGranularitySlot = {
  status: SlotStatus;
  value?: ScopeKind;
  confidence?: "low" | "medium" | "high";
  evidence: string[];
  negative_evidence?: string[];
};
type AdjustPlanSubSkillId =
  | "scope_router"
  | "action_intake"
  | "level_intake"
  | "whole_plan_intake"
  | "draft_validation";
type AdjustPlanSubSkillTrace = {
  sub_skill_id: AdjustPlanSubSkillId;
  status: "ignored" | "needs_clarification" | "ready";
  reason_code: string;
  missing_slots: string[];
};
type ActionRequestCategorySlot = string;
type LevelRequestCategorySlot = string;
type ReasonChangeSlot = {
  status: SlotStatus;
  value?: string;
  evidence: string[];
};
type ChangeTargetSlot = {
  status: SlotStatus;
  value?: string;
  evidence: string[];
};
type AffectedItemsSlot = {
  status: SlotStatus;
  values: string[];
  evidence: string[];
};
type WholePlanChangeFamilySlot = string;
type WholePlanCandidateOperation = string;
type WholePlanReadiness = string;

export type AdjustPlanScopeSlot = {
  status: SlotStatus;
  kind?: ScopeKind;
  plan_item_id?: string | null;
  label?: string | null;
  evidence: string[];
};

export type ActionAdjustmentPayload = Record<string, unknown> & {
  scope_kind: "specific_plan_item";
};
export type LevelAdjustmentPayload = Record<string, unknown> & {
  scope_kind: "current_level";
};
export type WholePlanAdjustmentPayload = Record<string, unknown> & {
  scope_kind: "whole_plan";
};

export type AdjustPlanIntakeState = {
  target_granularity: TargetGranularitySlot;
  scope: AdjustPlanScopeSlot;
  selected_sub_skill?: AdjustPlanSubSkillId;
  coaching_guidance?: AdjustPlanCoachGuidance | null;
  payload:
    | ActionAdjustmentPayload
    | LevelAdjustmentPayload
    | WholePlanAdjustmentPayload
    | null;
};

export type AdjustPlanItemOperationOutput = {
  operation_type: "adjust_plan_item";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "draft_review_decision"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "scope_resolution"
    | "generation"
    | "confirmation"
    | "platform_handoff"
    | "exit";
  draft?: PlanAdjustmentDraftV1;
  confirmation?: { required: boolean; message: string; actions: ["yes", "no"] };
  pending_confirmation?: Record<string, unknown>;
  next_question?: { needed: boolean; question?: string; reason?: string };
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    intake_state?: AdjustPlanIntakeState;
    sub_skill_trace?: AdjustPlanSubSkillTrace[];
    tool_skill_state?: AdjustPlanToolSkillState;
    draft_review_decision?: {
      decision:
        | "approve"
        | "reject"
        | "revise"
        | "explain"
        | "topic_change"
        | "unclear";
      confidence: "low" | "medium" | "high";
      evidence: string[];
      apply_after_revision?: boolean;
    };
    operation_input?: Record<string, unknown>;
    coaching_guidance_audit?: unknown;
  };
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scopeFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): ScopeKind | null {
  const scope = objectRecord(operationInput?.scope);
  const target = objectRecord(operationInput?.target);
  const raw = String(
    scope?.kind ?? operationInput?.scope_kind ?? operationInput?.target_scope ??
      target?.kind ?? "",
  ).trim();
  return raw === "specific_plan_item" || raw === "current_level" ||
      raw === "whole_plan"
    ? raw
    : null;
}

function stateFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): AdjustPlanIntakeState {
  const scopeKind = scopeFromOperationInput(operationInput);
  const label = String(
    (operationInput?.scope as any)?.title ??
      (operationInput?.target as any)?.title ??
      (operationInput?.scope as any)?.label ??
      "",
  ).trim() || null;
  return {
    target_granularity: {
      status: scopeKind ? "identified" : "missing",
      value: scopeKind ?? undefined,
      confidence: scopeKind ? "high" : "low",
      evidence: scopeKind ? ["operation_input.scope"] : [],
      negative_evidence: [],
    },
    scope: {
      status: scopeKind ? "identified" : "missing",
      kind: scopeKind ?? undefined,
      plan_item_id: String((operationInput?.target as any)?.plan_item_id ?? "")
        .trim() ||
        null,
      label,
      evidence: scopeKind ? ["operation_input.scope"] : [],
    },
    selected_sub_skill: scopeKind === "specific_plan_item"
      ? "action_intake"
      : scopeKind === "current_level"
      ? "level_intake"
      : scopeKind === "whole_plan"
      ? "whole_plan_intake"
      : "scope_router",
    payload: scopeKind
      ? ({ ...(operationInput ?? {}), scope_kind: scopeKind } as
        | ActionAdjustmentPayload
        | LevelAdjustmentPayload
        | WholePlanAdjustmentPayload)
      : null,
  };
}

function missingSlots(state: AdjustPlanIntakeState): string[] {
  return state.scope.status === "identified" && state.payload ? [] : ["scope"];
}

function subSkillTraceForState(
  state: AdjustPlanIntakeState,
): AdjustPlanSubSkillTrace[] {
  return [{
    sub_skill_id: state.selected_sub_skill ?? "scope_router",
    status: missingSlots(state).length ? "needs_clarification" : "ready",
    reason_code: "structured_operation_input_only",
    missing_slots: missingSlots(state),
  }];
}

export function runAdjustPlanScopeRouterSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): {
  scope: AdjustPlanScopeSlot;
  trace: AdjustPlanSubSkillTrace;
} {
  void input.message;
  const state = stateFromOperationInput(input.operation_input ?? null);
  return {
    scope: state.scope,
    trace: subSkillTraceForState(state)[0],
  };
}

export function runAdjustPlanActionSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): { payload: ActionAdjustmentPayload; trace: AdjustPlanSubSkillTrace } {
  void input.message;
  const state = stateFromOperationInput(input.operation_input ?? null);
  return {
    payload: ({
      ...(input.operation_input ?? {}),
      scope_kind: "specific_plan_item",
    } as ActionAdjustmentPayload),
    trace: subSkillTraceForState(state)[0],
  };
}

export function runAdjustPlanLevelSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): { payload: LevelAdjustmentPayload; trace: AdjustPlanSubSkillTrace } {
  void input.message;
  const state = stateFromOperationInput(input.operation_input ?? null);
  return {
    payload: ({
      ...(input.operation_input ?? {}),
      scope_kind: "current_level",
    } as LevelAdjustmentPayload),
    trace: subSkillTraceForState(state)[0],
  };
}

export function runAdjustPlanWholePlanSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): { payload: WholePlanAdjustmentPayload; trace: AdjustPlanSubSkillTrace } {
  void input.message;
  const state = stateFromOperationInput(input.operation_input ?? null);
  return {
    payload: ({
      ...(input.operation_input ?? {}),
      scope_kind: "whole_plan",
    } as WholePlanAdjustmentPayload),
    trace: subSkillTraceForState(state)[0],
  };
}

export function runAdjustPlanDraftValidationSubSkill(input: {
  draft?: PlanAdjustmentDraftV1 | null;
}): {
  valid: boolean;
  trace: AdjustPlanSubSkillTrace;
} {
  return {
    valid: Boolean(input.draft),
    trace: {
      sub_skill_id: "draft_validation",
      status: input.draft ? "ready" : "needs_clarification",
      reason_code: input.draft ? "draft_present" : "draft_missing",
      missing_slots: input.draft ? [] : ["draft"],
    },
  };
}

export async function runAdjustPlanItemIntake(input: {
  user_id: string;
  timezone: string;
  channel: ConversationChannel;
  trigger_message_id?: string | null;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  safety_pregate_risk_band?: RiskBand;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  [key: string]: unknown;
}): Promise<AdjustPlanItemOperationOutput> {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "adjust_plan_item",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks adjust-plan operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const operationInput = input.operation_input ?? null;
  const state = stateFromOperationInput(operationInput);
  const missing = missingSlots(state);
  return {
    operation_type: "adjust_plan_item",
    status: missing.length ? "ask_question" : "fallback_dashboard",
    source,
    phase: missing.length ? "scope_resolution" : "platform_handoff",
    next_question: missing.length
      ? {
        needed: true,
        question: "Quelle partie du plan veux-tu ajuster ?",
        reason: "scope_missing",
      }
      : { needed: false },
    ack: missing.length
      ? undefined
      : "Je peux t'aider à formuler l'ajustement à reprendre dans Plan.",
    state_patch: {
      summary: missing.length
        ? "Adjust-plan intake needs structured scope."
        : "Adjust-plan structured input ready for platform handoff.",
      phase: missing.length ? "scope_resolution" : "platform_handoff",
      missing_slots: missing,
      turn_count_increment: 1,
      intake_state: state,
      sub_skill_trace: subSkillTraceForState(state),
      operation_input: operationInput ?? undefined,
    },
  };
}

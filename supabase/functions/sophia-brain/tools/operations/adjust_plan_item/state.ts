import type { PlanAdjustmentDraftV1 } from "./generator.ts";

export type PendingAdjustPlanDraftReview = {
  operation_id?: string;
  operation_type: "adjust_plan_item";
  phase: "draft_review";
  draft: PlanAdjustmentDraftV1;
  operation_input?: Record<string, unknown> | null;
  revision_history?: Array<Record<string, unknown>>;
  created_at?: string;
  updated_at?: string;
  turn_count?: number;
  expires_after_turns?: number;
};

export type PendingAdjustPlanConfirmation = {
  operation_id?: string;
  operation_type: "adjust_plan_item";
  draft: PlanAdjustmentDraftV1;
  operation_input?: Record<string, unknown> | null;
  turn_count?: number;
  expires_after_turns?: number;
};

export type AdjustPlanToolSkillFrame = {
  pending_draft_review: PendingAdjustPlanDraftReview | null;
  pending_confirmation: PendingAdjustPlanConfirmation | null;
  active_intake: Record<string, unknown> | null;
  pending_recommendation: Record<string, unknown> | null;
  last_execution: Record<string, unknown> | null;
};

export function isPendingAdjustPlanDraftReview(
  value: unknown,
): value is PendingAdjustPlanDraftReview {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      record.phase === "draft_review" &&
      record.draft?.operation_type === "adjust_plan_item" &&
      record.draft?.draft?.adjust_plan_result,
  );
}

export function isPendingAdjustPlanItemOperation(
  value: unknown,
): value is PendingAdjustPlanConfirmation {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      record.draft?.operation_type === "adjust_plan_item" &&
      record.draft?.draft?.patch,
  );
}

export function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

export function isPendingAdjustPlanItemRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "adjust_plan_item";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      (record.surface_id === "plan_item.reduce" ||
        record.operation_input?.adjustment_type === "reduce"),
  );
}

export function loadAdjustPlanFrameFromTempMemory(
  tempMemory: any,
): AdjustPlanToolSkillFrame {
  const temp = tempMemory ?? {};
  const pendingDraftReview = temp.__pending_adjust_plan_draft_review;
  const pendingConfirmation = temp.__pending_tool_skill_confirmation ??
    temp.pending_tool_skill_confirmation ?? null;
  const activeIntake = temp.__active_tool_skill_intake ??
    temp.active_tool_skill_intake ?? null;
  return {
    pending_draft_review: isPendingAdjustPlanDraftReview(pendingDraftReview)
      ? pendingDraftReview
      : null,
    pending_confirmation: isPendingAdjustPlanItemOperation(pendingConfirmation)
      ? pendingConfirmation
      : null,
    active_intake: activeIntake && typeof activeIntake === "object"
      ? activeIntake as Record<string, unknown>
      : null,
    pending_recommendation: temp.__pending_recommendation_operation &&
        typeof temp.__pending_recommendation_operation === "object"
      ? temp.__pending_recommendation_operation as Record<string, unknown>
      : null,
    last_execution: temp.__last_adjust_plan_execution &&
        typeof temp.__last_adjust_plan_execution === "object"
      ? temp.__last_adjust_plan_execution as Record<string, unknown>
      : null,
  };
}

export function writeAdjustPlanActiveIntake(
  tempMemory: any,
  value: Record<string, unknown> | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  if (value) {
    next.__active_tool_skill_intake = value;
    delete next.active_tool_skill_intake;
  } else {
    delete next.__active_tool_skill_intake;
    delete next.active_tool_skill_intake;
  }
  return next;
}

export function writeAdjustPlanPendingDraftReview(
  tempMemory: any,
  value: PendingAdjustPlanDraftReview | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  if (value) {
    next.__pending_adjust_plan_draft_review = value;
    delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  } else {
    delete next.__pending_adjust_plan_draft_review;
  }
  return next;
}

export function writeAdjustPlanPendingConfirmation(
  tempMemory: any,
  value: PendingAdjustPlanConfirmation | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  if (value) {
    next.__pending_tool_skill_confirmation = value;
    delete next.pending_tool_skill_confirmation;
  } else {
    delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  return next;
}

export function writeLastAdjustPlanExecution(
  tempMemory: any,
  value: Record<string, unknown> | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  if (value) {
    next.__last_adjust_plan_execution = value;
  } else {
    delete next.__last_adjust_plan_execution;
  }
  return next;
}

export function clearAdjustPlanFrame(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_adjust_plan_draft_review;
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  return next;
}

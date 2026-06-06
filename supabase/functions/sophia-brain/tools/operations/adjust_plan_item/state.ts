import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import type {
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
} from "./contract.ts";

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
  handoff_state: AdjustPlanHandoffState | null;
  last_execution: Record<string, unknown> | null;
};

export type AdjustPlanHandoffState = {
  skill_id: "adjust_plan_item";
  mode: "platform_input_coaching";
  status: AdjustPlanHandoffStatus;
  draft?: AdjustPlanHandoffDraft | null;
  operation_input?: Record<string, unknown> | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
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

export function isAdjustPlanHandoffState(
  value: unknown,
): value is AdjustPlanHandoffState {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.skill_id === "adjust_plan_item" &&
      (record.mode === "platform_input_coaching" ||
        record.mode === "platform_handoff") &&
      record.no_chat_mutation === true,
  );
}

export function loadAdjustPlanFrameFromTempMemory(
  tempMemory: any,
): AdjustPlanToolSkillFrame {
  const temp = tempMemory ?? {};
  return {
    pending_draft_review: null,
    pending_confirmation: null,
    active_intake: null,
    pending_recommendation: null,
    handoff_state: isAdjustPlanHandoffState(temp.__adjust_plan_handoff_state)
      ? temp.__adjust_plan_handoff_state
      : null,
    last_execution: null,
  };
}

export function writeAdjustPlanHandoffState(
  tempMemory: any,
  value: AdjustPlanHandoffState | null,
): any {
  const next = clearAdjustPlanExecutableLegacyState(tempMemory);
  if (value) {
    next.__adjust_plan_handoff_state = value;
  } else {
    delete next.__adjust_plan_handoff_state;
  }
  return next;
}

export function clearAdjustPlanExecutableLegacyState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_adjust_plan_draft_review;
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__last_adjust_plan_execution;
  return next;
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
  delete next.__adjust_plan_handoff_state;
  return next;
}

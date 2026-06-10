import type {
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
} from "./contract.ts";

export type AdjustPlanToolSkillFrame = {
  handoff_state: AdjustPlanHandoffState | null;
};

export type AdjustPlanHandoffState = {
  skill_id: "adjust_plan_item";
  mode: "platform_handoff";
  status: AdjustPlanHandoffStatus;
  draft?: AdjustPlanHandoffDraft | null;
  local_flow_state?: Record<string, unknown> | null;
  operation_input?: Record<string, unknown> | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
};

export function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

export function isAdjustPlanHandoffState(
  value: unknown,
): value is AdjustPlanHandoffState {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.skill_id === "adjust_plan_item" &&
      record.mode === "platform_handoff" &&
      record.no_chat_mutation === true,
  );
}

export function loadAdjustPlanFrameFromTempMemory(
  tempMemory: any,
): AdjustPlanToolSkillFrame {
  const temp = tempMemory ?? {};
  return {
    handoff_state: isAdjustPlanHandoffState(temp.__adjust_plan_handoff_state)
      ? temp.__adjust_plan_handoff_state
      : null,
  };
}

export function writeAdjustPlanHandoffState(
  tempMemory: any,
  value: AdjustPlanHandoffState | null,
): any {
  const next = clearAdjustPlanNonHandoffState(tempMemory);
  if (value) {
    next.__adjust_plan_handoff_state = value;
  } else {
    delete next.__adjust_plan_handoff_state;
  }
  return next;
}

export function clearAdjustPlanNonHandoffState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_adjust_plan_draft_review;
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__last_adjust_plan_execution;
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

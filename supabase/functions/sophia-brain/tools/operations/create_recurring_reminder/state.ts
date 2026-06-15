import type { RecurringReminderHandoffState } from "./contract.ts";

export type RecurringReminderFrame = {
  active_intake: Record<string, unknown> | null;
  pending_confirmation: Record<string, unknown> | null;
  pending_recommendation: Record<string, unknown> | null;
  handoff_state: RecurringReminderHandoffState | null;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function handoffState(value: unknown): RecurringReminderHandoffState | null {
  const record = objectRecord(value);
  if (
    record?.skill_id !== "create_recurring_reminder" ||
    record?.mode !== "platform_handoff" ||
    record?.executable_from_chat !== false
  ) return null;
  return record as RecurringReminderHandoffState;
}

export function loadRecurringReminderFrameFromTempMemory(
  tempMemory: unknown,
): RecurringReminderFrame {
  const temp = objectRecord(tempMemory) ?? {};
  return {
    active_intake: objectRecord(
      temp.__active_tool_skill_intake ?? temp.active_tool_skill_intake,
    ),
    pending_confirmation: objectRecord(
      temp.__pending_tool_skill_confirmation ??
        temp.pending_tool_skill_confirmation,
    ),
    pending_recommendation: objectRecord(
      temp.__pending_recommendation_operation,
    ),
    handoff_state: handoffState(
      temp.__recurring_reminder_handoff_state ??
        (objectRecord(temp.__active_tool_skill_intake)?.mode ===
            "platform_handoff"
          ? temp.__active_tool_skill_intake
          : null),
    ),
  };
}

export function writeRecurringReminderActiveIntake(
  tempMemory: Record<string, unknown>,
  activeIntake: Record<string, unknown>,
): Record<string, unknown> {
  tempMemory.__active_tool_skill_intake = activeIntake;
  delete tempMemory.active_tool_skill_intake;
  delete tempMemory.__pending_tool_skill_confirmation;
  delete tempMemory.pending_tool_skill_confirmation;
  return tempMemory;
}

export function writeRecurringReminderHandoffState(
  tempMemory: Record<string, unknown>,
  handoffState: RecurringReminderHandoffState,
): Record<string, unknown> {
  tempMemory.__recurring_reminder_handoff_state = handoffState;
  tempMemory.__active_tool_skill_intake = {
    operation_type: "create_recurring_reminder",
    mode: "platform_handoff",
    executable_from_chat: false,
    status: handoffState.status,
    turn_count: handoffState.turn_count,
    updated_at: handoffState.updated_at,
  };
  delete tempMemory.active_tool_skill_intake;
  delete tempMemory.__pending_tool_skill_confirmation;
  delete tempMemory.pending_tool_skill_confirmation;
  return tempMemory;
}

export function writeRecurringReminderPendingConfirmation(
  tempMemory: Record<string, unknown>,
  pendingConfirmation: Record<string, unknown>,
): Record<string, unknown> {
  tempMemory.__pending_tool_skill_confirmation = pendingConfirmation;
  delete tempMemory.pending_tool_skill_confirmation;
  delete tempMemory.__active_tool_skill_intake;
  delete tempMemory.active_tool_skill_intake;
  return tempMemory;
}

export function clearRecurringReminderFrame(
  tempMemory: Record<string, unknown>,
): Record<string, unknown> {
  delete tempMemory.__active_tool_skill_intake;
  delete tempMemory.active_tool_skill_intake;
  delete tempMemory.__pending_tool_skill_confirmation;
  delete tempMemory.pending_tool_skill_confirmation;
  delete tempMemory.__pending_recommendation_operation;
  delete tempMemory.__recurring_reminder_handoff_state;
  return tempMemory;
}

export function clearRecurringReminderPendingRecommendation(
  tempMemory: Record<string, unknown>,
): Record<string, unknown> {
  delete tempMemory.__pending_recommendation_operation;
  return tempMemory;
}

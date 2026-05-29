export type RecurringReminderFrame = {
  active_intake: Record<string, unknown> | null;
  pending_confirmation: Record<string, unknown> | null;
  pending_recommendation: Record<string, unknown> | null;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  return tempMemory;
}

export function clearRecurringReminderPendingRecommendation(
  tempMemory: Record<string, unknown>,
): Record<string, unknown> {
  delete tempMemory.__pending_recommendation_operation;
  return tempMemory;
}

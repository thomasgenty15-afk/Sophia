export type CoachPreferenceFrame = {
  active: Record<string, unknown> | null;
  pending: Record<string, unknown> | null;
};

export function loadCoachPreferenceFrameFromTempMemory(
  tempMemory: unknown,
): CoachPreferenceFrame {
  const memory = tempMemory && typeof tempMemory === "object"
    ? tempMemory as Record<string, unknown>
    : {};
  return {
    active: (memory.__active_tool_skill_intake ??
      memory.active_tool_skill_intake ??
      null) as Record<string, unknown> | null,
    pending: (memory.__pending_tool_skill_confirmation ??
      memory.pending_tool_skill_confirmation ??
      null) as Record<string, unknown> | null,
  };
}

export function writeCoachPreferenceActiveIntake(
  tempMemory: unknown,
  active: Record<string, unknown> | null,
) {
  const next = {
    ...((tempMemory && typeof tempMemory === "object")
      ? tempMemory as Record<string, unknown>
      : {}),
  };
  if (active) next.__active_tool_skill_intake = active;
  else delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  return next;
}

export function writeCoachPreferencePendingConfirmation(
  tempMemory: unknown,
  pending: Record<string, unknown> | null,
) {
  const next = {
    ...((tempMemory && typeof tempMemory === "object")
      ? tempMemory as Record<string, unknown>
      : {}),
  };
  if (pending) next.__pending_tool_skill_confirmation = pending;
  else delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  return next;
}

export function clearCoachPreferenceFrame(tempMemory: unknown) {
  const next = {
    ...((tempMemory && typeof tempMemory === "object")
      ? tempMemory as Record<string, unknown>
      : {}),
  };
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  return next;
}

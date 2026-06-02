export type CoachPreferenceFrame = {
  active: Record<string, unknown> | null;
  pending: Record<string, unknown> | null;
  handoff: Record<string, unknown> | null;
};

export type CoachPreferenceHandoffState = {
  skill_id: "update_coach_preferences";
  mode: "platform_handoff";
  status: import("./contract.ts").CoachPreferenceHandoffStatus;
  draft?: import("./contract.ts").CoachPreferenceHandoffDraft | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
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
    handoff: (memory.__coach_preference_handoff_state_v1 ??
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

export function writeCoachPreferenceHandoffState(
  tempMemory: unknown,
  handoff: CoachPreferenceHandoffState | null,
) {
  const next = {
    ...((tempMemory && typeof tempMemory === "object")
      ? tempMemory as Record<string, unknown>
      : {}),
  };
  if (handoff) next.__coach_preference_handoff_state_v1 = handoff;
  else delete next.__coach_preference_handoff_state_v1;
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
  delete next.__coach_preference_handoff_state_v1;
  return next;
}

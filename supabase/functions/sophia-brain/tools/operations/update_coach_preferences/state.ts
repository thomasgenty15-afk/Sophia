export type CoachPreferenceFrame = {
  active: Record<string, unknown> | null;
  pending: Record<string, unknown> | null;
  local_flow: CoachPreferenceLocalFlowState | null;
};

export type CoachPreferenceLocalFlowState = {
  skill_id: "update_coach_preferences";
  operation_type: "update_coach_preferences";
  mode: "local_write_flow";
  status:
    | "collecting"
    | "proposed"
    | "write_ready"
    | "written"
    | "blocked"
    | "cancelled"
    | "exit";
  current_stage: "durability" | "setting" | "value" | "confirmation" | "done";
  proposed_updates: import("./contract.ts").CoachPreferenceLocalUpdate[];
  last_committed_updates: import("./contract.ts").CoachPreferenceLocalUpdate[];
  unsupported_parts: string[];
  subskill_history?: Array<{
    skill_id: "status_recap" | "product_help";
    reason: string;
    user_message: string;
    created_at: string;
    summary?: string | null;
  }>;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
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
    local_flow: isCoachPreferenceLocalFlowState(
        memory.__coach_preference_flow_state_v1,
      )
      ? memory.__coach_preference_flow_state_v1
      : null,
  };
}

export function isCoachPreferenceLocalFlowState(
  value: unknown,
): value is CoachPreferenceLocalFlowState {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return Boolean(
    record?.skill_id === "update_coach_preferences" &&
      record.operation_type === "update_coach_preferences" &&
      record.mode === "local_write_flow",
  );
}

export function isActiveCoachPreferenceLocalFlowState(
  value: unknown,
): value is CoachPreferenceLocalFlowState {
  if (!isCoachPreferenceLocalFlowState(value)) return false;
  return ["collecting", "proposed", "write_ready", "blocked"].includes(
    value.status,
  );
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

export function writeCoachPreferenceLocalFlowState(
  tempMemory: unknown,
  flow: CoachPreferenceLocalFlowState | null,
) {
  const next = {
    ...((tempMemory && typeof tempMemory === "object")
      ? tempMemory as Record<string, unknown>
      : {}),
  };
  if (flow) next.__coach_preference_flow_state_v1 = flow;
  else delete next.__coach_preference_flow_state_v1;
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
  delete next.__coach_preference_flow_state_v1;
  return next;
}

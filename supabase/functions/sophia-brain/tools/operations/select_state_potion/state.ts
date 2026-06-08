import type {
  ClarteHandoffState,
  StatePotionHandoffDraft,
  StatePotionHandoffStatus,
  StatePotionSubskillHandoffState,
  StatePotionSubskillId,
} from "./contract.ts";
import type { SelectStatePotionIntakeState } from "./intake.ts";

export type SelectStatePotionFrame = {
  pending: Record<string, unknown> | null;
  active: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  followup_consent: "refused" | null;
};

export type StatePotionHandoffState = {
  skill_id: "select_state_potion";
  active_subskill_id?: StatePotionSubskillId | null;
  mode: "platform_handoff";
  status: StatePotionHandoffStatus;
  draft?: StatePotionHandoffDraft | null;
  phase?: string | null;
  operation_input?: Record<string, unknown> | null;
  origin_bridge_context?: Record<string, unknown> | null;
  intake_state?: SelectStatePotionIntakeState | null;
  clarte_state?: ClarteHandoffState | null;
  potion_subskill_state?: StatePotionSubskillHandoffState | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
};

export function loadSelectStatePotionFrameFromTempMemory(
  tempMemory: any,
): SelectStatePotionFrame {
  const memory = tempMemory ?? {};
  return {
    pending: memory.__pending_tool_skill_confirmation ??
      memory.pending_tool_skill_confirmation ?? null,
    active: memory.__active_tool_skill_intake ??
      memory.active_tool_skill_intake ?? null,
    recommendation: memory.__pending_recommendation_operation ?? null,
    followup_consent: memory.__potion_followup_consent === "refused"
      ? "refused"
      : null,
  };
}

export function writeSelectStatePotionActiveIntake(
  tempMemory: any,
  active: Record<string, unknown> | null,
) {
  const next = { ...(tempMemory ?? {}) };
  if (active) next.__active_tool_skill_intake = active;
  else delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  return next;
}

export function clearSelectStatePotionLegacyPendingConfirmation(
  tempMemory: any,
) {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  return next;
}

export function writeSelectStatePotionPendingRecommendation(
  tempMemory: any,
  recommendation: Record<string, unknown> | null,
) {
  const next = { ...(tempMemory ?? {}) };
  if (recommendation) {
    next.__pending_recommendation_operation = recommendation;
  } else {
    delete next.__pending_recommendation_operation;
  }
  return next;
}

export function clearSelectStatePotionFrame(tempMemory: any) {
  let next = clearSelectStatePotionLegacyPendingConfirmation(tempMemory);
  next = writeSelectStatePotionActiveIntake(next, null);
  next = writeSelectStatePotionPendingRecommendation(next, null);
  next = clearPotionFollowupConsent(next);
  return next;
}

export function isStatePotionHandoffState(
  value: unknown,
): value is StatePotionHandoffState {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.skill_id === "select_state_potion" &&
      record.mode === "platform_handoff" &&
      record.no_chat_mutation === true,
  );
}

export function loadStatePotionHandoffStateFromTempMemory(
  tempMemory: any,
): StatePotionHandoffState | null {
  const active = (tempMemory ?? {}).__active_tool_skill_intake ??
    (tempMemory ?? {}).active_tool_skill_intake ?? null;
  return isStatePotionHandoffState(active) ? active : null;
}

export function writeStatePotionHandoffState(
  tempMemory: any,
  state: StatePotionHandoffState | null,
) {
  return writeSelectStatePotionActiveIntake(tempMemory, state);
}

export function markPotionFollowupConsentRefused(tempMemory: any) {
  return {
    ...(tempMemory ?? {}),
    __potion_followup_consent: "refused",
  };
}

export function readPotionFollowupConsent(tempMemory: any): "refused" | null {
  return (tempMemory ?? {}).__potion_followup_consent === "refused"
    ? "refused"
    : null;
}

export function clearPotionFollowupConsent(tempMemory: any) {
  const next = { ...(tempMemory ?? {}) };
  delete next.__potion_followup_consent;
  return next;
}

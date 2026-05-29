export type SelectStatePotionFrame = {
  pending: Record<string, unknown> | null;
  active: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  followup_consent: "refused" | null;
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

export function writeSelectStatePotionPendingConfirmation(
  tempMemory: any,
  pending: Record<string, unknown> | null,
) {
  const next = { ...(tempMemory ?? {}) };
  if (pending) next.__pending_tool_skill_confirmation = pending;
  else delete next.__pending_tool_skill_confirmation;
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
  let next = writeSelectStatePotionPendingConfirmation(tempMemory, null);
  next = writeSelectStatePotionActiveIntake(next, null);
  next = writeSelectStatePotionPendingRecommendation(next, null);
  next = clearPotionFollowupConsent(next);
  return next;
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

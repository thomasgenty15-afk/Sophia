export function detectsCoachPreferenceDirectionContradiction(
  message: string,
  patch: Record<string, unknown>,
): boolean {
  void message;
  void patch;
  return false;
}

export function detectsCoachPreferenceDirectionContradictionForSkill(input: {
  message: string;
  patch: Record<string, unknown>;
}): boolean {
  return detectsCoachPreferenceDirectionContradiction(
    input.message,
    input.patch,
  );
}

export function clearConversationFlowForCoachPreference(
  tempMemory: any,
): Record<string, unknown> {
  return { ...(tempMemory ?? {}) };
}

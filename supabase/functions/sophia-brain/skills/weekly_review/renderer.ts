export function stripWeeklyInternalVocabulary(text: string): string {
  return String(text ?? "");
}

export function stripVisibleWeeklyInternalSummary(text: string): string {
  return String(text ?? "").trim();
}

export function cleanWeeklyVisibleResponse(text: string): string {
  return String(text ?? "").trim();
}

export function renderWeeklyResponseWithEffects(args: {
  responseContent: string;
  tempMemory?: any;
  activeSkillState?: unknown;
}): string {
  void args.tempMemory;
  void args.activeSkillState;
  return String(args.responseContent ?? "").trim();
}

export function stripWeeklySupportItemsFromResponse(text: string): string {
  return String(text ?? "").trim();
}

export function weeklyReturnAfterAdjustmentMessage(args: {
  weeklyState?: unknown;
  operationRuntime?: unknown;
  userMessage?: string;
}): string | null {
  void args.weeklyState;
  void args.operationRuntime;
  void args.userMessage;
  return null;
}

export function summarizeWeeklyAdaptiveReviewForAddon(
  weeklyState: unknown,
): string | null {
  if (!weeklyState || typeof weeklyState !== "object") return null;
  return JSON.stringify(weeklyState);
}

export function buildWeeklyTurnSlotAddon(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
  userMessage?: string;
}): string | null {
  void args.activeSkillState;
  void args.tempMemory;
  void args.userMessage;
  return null;
}

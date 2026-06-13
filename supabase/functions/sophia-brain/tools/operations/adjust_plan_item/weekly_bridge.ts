export function isWeeklyAdaptiveReviewActive(activeSkillState: unknown): boolean {
  return Boolean(
    activeSkillState && typeof activeSkillState === "object" &&
      (activeSkillState as any).skill_id === "weekly_adaptive_review_v1",
  );
}

export function weeklyAdaptiveReviewStateForTurn(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): unknown {
  if (isWeeklyAdaptiveReviewActive(args.activeSkillState)) {
    return args.activeSkillState;
  }
  const active = (args.tempMemory as any)?.__active_skill_state;
  return isWeeklyAdaptiveReviewActive(active) ? active : null;
}

export type WeeklyExactAdjustPlanProposal = Record<string, unknown>;
export type WeeklyAdjustPlanPendingReview = Record<string, unknown>;

export function weeklyExactProposalKindFromText(
  message: string,
): string | null {
  void message;
  return null;
}

export function buildWeeklyExactAdjustPlanProposal(args: {
  [key: string]: unknown;
}): WeeklyExactAdjustPlanProposal | null {
  void args;
  return null;
}

export function patchPendingAdjustPlanWithWeeklyExactProposal(args: {
  [key: string]: unknown;
}): unknown {
  return args.pending ?? null;
}

export function buildWeeklyExactAdjustPlanPendingReview(args: {
  [key: string]: unknown;
}): WeeklyAdjustPlanPendingReview | null {
  void args;
  return null;
}

export function buildWeeklyCopyForwardPendingReview(args: {
  [key: string]: unknown;
}): WeeklyAdjustPlanPendingReview | null {
  void args;
  return null;
}

export function isWeeklyMissionCarryOverRequest(message: string): boolean {
  void message;
  return false;
}

export function weeklyMissionCarryOverContext(args: {
  userMessage: string;
  history?: any[] | null;
}): Record<string, unknown> | null {
  void args.userMessage;
  void args.history;
  return null;
}

export function isWeeklyLightRepeatRequest(message: string): boolean {
  void message;
  return false;
}

export function buildWeeklyMissionCarryOverPendingReview(args: {
  [key: string]: unknown;
}): WeeklyAdjustPlanPendingReview | null {
  void args;
  return null;
}

export function buildWeeklyLightRepeatPendingReview(args: {
  [key: string]: unknown;
}): WeeklyAdjustPlanPendingReview | null {
  void args;
  return null;
}

export function rememberWeeklyExactAdjustPlanProposal(args: {
  tempMemory: any;
  proposal?: unknown;
}): any {
  void args.proposal;
  return args.tempMemory;
}

export function rememberWeeklyPartialExactConstraint(
  tempMemory: any,
  constraint: unknown,
): any {
  void constraint;
  return tempMemory;
}

export function weeklyPartialExactConstraintsComplete(
  tempMemory: unknown,
): boolean {
  void tempMemory;
  return false;
}

export function weeklyExactProposalFromConversation(args: {
  tempMemory?: unknown;
  userMessage?: string;
}): WeeklyExactAdjustPlanProposal | null {
  void args.tempMemory;
  void args.userMessage;
  return null;
}

export function isCopyForwardWeeklyRequest(message: string): boolean {
  void message;
  return false;
}

export function isExplicitPendingApplyConfirmation(message: string): boolean {
  const normalized = String(message ?? "").trim().toLowerCase()
    .normalize("NFD")
    .replaceAll("\u0300", "")
    .replaceAll("\u0301", "")
    .replaceAll("\u0302", "")
    .replaceAll("\u0308", "");
  if (!normalized) return false;

  const negativeCues = [
    "avant que je valide",
    "ne valide",
    "ne pas valide",
    "pas valide",
    "ne valide toujours pas",
    "n applique rien",
    "n'applique rien",
    "ne l applique pas",
    "ne pas appliquer",
    "stop",
    "garde le plan tel quel",
  ];
  if (negativeCues.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const confirmationCues = [
    "oui",
    "ok",
    "d accord",
    "d'accord",
    "vas y",
    "valide",
    "applique",
  ];
  const applyCues = [
    "valide",
    "applique",
    "mettre en place",
  ];
  return confirmationCues.some((cue) => normalized.includes(cue)) &&
    applyCues.some((cue) => normalized.includes(cue));
}

export function applyWeeklyForgottenProgressAckGuard(args: {
  responseContent: string;
  tempMemory: any;
  loggedMessageId?: string | null;
}): string {
  void args.tempMemory;
  void args.loggedMessageId;
  return args.responseContent;
}

export function applyWeeklyRepeatedClarificationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): string {
  void args.userMessage;
  void args.activeSkillState;
  void args.tempMemory;
  return args.responseContent;
}

export function applyWeeklyConcreteOrganizationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState?: unknown;
  tempMemory?: unknown;
  history?: any[];
}): string {
  void args.userMessage;
  void args.activeSkillState;
  void args.tempMemory;
  void args.history;
  return args.responseContent;
}

export function applyWeeklyConclusionGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): string {
  void args.userMessage;
  void args.activeSkillState;
  void args.tempMemory;
  return args.responseContent;
}

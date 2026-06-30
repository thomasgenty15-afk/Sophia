import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

function isWeeklyAdaptiveReviewState(value: unknown): value is Record<
  string,
  unknown
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const skillId = String((value as any).skill_id ?? "").trim();
  const flowId = String((value as any).flow_id ?? "").trim();
  return skillId === "weekly_adaptive_review_v1" ||
    flowId === "weekly_adaptive_review_v1";
}

export function isWeeklyAdaptiveReviewActive(
  activeSkillState: unknown,
): boolean {
  return isWeeklyAdaptiveReviewState(activeSkillState);
}

export function isWeeklyReviewActive(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): boolean {
  return Boolean(readWeeklyReviewState(args));
}

export function weeklyAdaptiveReviewStateForTurn(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
}): unknown {
  if (isWeeklyAdaptiveReviewState(args.activeSkillState)) {
    return args.activeSkillState;
  }
  const temp = args.tempMemory && typeof args.tempMemory === "object"
    ? args.tempMemory as Record<string, unknown>
    : {};
  if (isWeeklyAdaptiveReviewState(temp[ACTIVE_CONVERSATION_SKILL_KEY])) {
    return temp[ACTIVE_CONVERSATION_SKILL_KEY];
  }
  if (isWeeklyAdaptiveReviewState(temp.__active_skill_state)) {
    return temp.__active_skill_state;
  }
  if (isWeeklyAdaptiveReviewState(temp.active_skill_state)) {
    return temp.active_skill_state;
  }
  const suspended = temp.__suspended_flow_v1;
  if (
    suspended &&
    typeof suspended === "object" &&
    isWeeklyAdaptiveReviewState((suspended as any).state_snapshot)
  ) {
    return (suspended as any).state_snapshot;
  }
  return null;
}

export function readWeeklyReviewState(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): unknown {
  return weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
}

export function writeWeeklyReviewState(
  tempMemory: any,
  weeklyState: Record<string, unknown>,
): any {
  const next = { ...(tempMemory ?? {}) };
  next[ACTIVE_CONVERSATION_SKILL_KEY] = weeklyState;
  next.__active_skill_state = weeklyState;
  delete next.active_skill_state;
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewState(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function clearWeeklyReviewState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  if (isWeeklyAdaptiveReviewState(next[ACTIVE_CONVERSATION_SKILL_KEY])) {
    delete next[ACTIVE_CONVERSATION_SKILL_KEY];
  }
  if (isWeeklyAdaptiveReviewState(next.__active_skill_state)) {
    delete next.__active_skill_state;
  }
  if (isWeeklyAdaptiveReviewState(next.active_skill_state)) {
    delete next.active_skill_state;
  }
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewState(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function updateWeeklyReviewStateAfterTurn(args: {
  tempMemory: any;
  activeSkillState: unknown;
  userMessage: string;
  responseContent: string;
  routeDecision: RouteDecision | null;
}): any {
  void args.activeSkillState;
  void args.userMessage;
  void args.responseContent;
  void args.routeDecision;
  return args.tempMemory;
}

export const updateWeeklyAdaptiveReviewStateAfterConversationTurn =
  updateWeeklyReviewStateAfterTurn;

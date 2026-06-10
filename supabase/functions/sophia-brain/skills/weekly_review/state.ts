import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import {
  isWeeklyAdaptiveReviewActive as isWeeklyAdaptiveReviewActiveFromBridge,
  weeklyAdaptiveReviewStateForTurn
    as weeklyAdaptiveReviewStateForTurnFromBridge,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";

export function isWeeklyAdaptiveReviewActive(
  activeSkillState: unknown,
): boolean {
  return isWeeklyAdaptiveReviewActiveFromBridge(activeSkillState);
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
  return weeklyAdaptiveReviewStateForTurnFromBridge(args);
}

export function readWeeklyReviewState(args: {
  activeSkillState?: unknown;
  tempMemory?: unknown;
}): unknown {
  return weeklyAdaptiveReviewStateForTurnFromBridge({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
}

export function writeWeeklyReviewState(
  tempMemory: any,
  weeklyState: Record<string, unknown>,
): any {
  const next = { ...(tempMemory ?? {}) };
  next.__active_skill_state = weeklyState;
  delete next.active_skill_state;
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewActiveFromBridge(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

export function clearWeeklyReviewState(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  if (isWeeklyAdaptiveReviewActiveFromBridge(next.__active_skill_state)) {
    delete next.__active_skill_state;
  }
  if (isWeeklyAdaptiveReviewActiveFromBridge(next.active_skill_state)) {
    delete next.active_skill_state;
  }
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewActiveFromBridge(
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

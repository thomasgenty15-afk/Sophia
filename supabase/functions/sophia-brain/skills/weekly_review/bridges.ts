import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { weeklyAdaptiveReviewStateForTurn } from "./state.ts";

export function operationInputFromPlanAdjustmentScope(
  message: string,
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  void message;
  void turnFrame;
  return null;
}

export function shouldKeepWeeklyAdaptiveReviewInConversation(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
}): boolean {
  void args.turnFrame;
  void args.userMessage;
  if (
    !weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) return false;
  const owner = args.routeDecision?.response_owner;
  return owner === "product_help";
}

export function hasPendingOrActiveAdjustPlanOperation(
  tempMemory: unknown,
): boolean {
  void tempMemory;
  return false;
}

export function weeklyReviewAllowsAdjustPlanBridge(args: {
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
  history?: any[] | null;
}): boolean {
  void args.routeDecision;
  void args.turnFrame;
  void args.userMessage;
  void args.history;
  return false;
}

export function isExplicitWeeklyAdjustPlanRequest(message: string): boolean {
  void message;
  return false;
}

export function isVagueWholePlanWeeklyAdjustmentRequest(
  message: string,
  operationInput?: Record<string, unknown> | null,
): boolean {
  void message;
  void operationInput;
  return false;
}

export function weeklyBridgeDoesNotApplyDirectly(): true {
  return true;
}

export function isCopyForwardWeeklyRequest(message: string): boolean {
  void message;
  return false;
}

export function isExplicitPendingApplyConfirmation(message: string): boolean {
  void message;
  return false;
}

export function isWeeklyLightRepeatRequest(message: string): boolean {
  void message;
  return false;
}

export function isWeeklyMissionCarryOverRequest(message: string): boolean {
  void message;
  return false;
}

export function weeklyMissionCarryOverContext(args?: unknown): null {
  void args;
  return null;
}

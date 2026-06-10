import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  pendingOperationType,
  readActiveFlowState,
} from "./active_flow_state.ts";
import { isPendingAttackCardRecommendationOperation } from "../tools/operations/prepare_attack_card/run_support.ts";

export function operationRouteIsSelected(args: {
  operationType: string;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const activeFlow = readActiveFlowState(args.tempMemory);
  const pending = activeFlow.pendingToolSkillConfirmation;
  const pendingType = pendingOperationType(pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;
  const pendingRecommendation = activeFlow.pendingRecommendationOperation;
  const activeIntake = activeFlow.activeToolSkillIntake;
  const activeOperationType = String(
    (activeIntake as any)?.operation_type ?? "",
  );
  if (activeOperationType && activeOperationType !== args.operationType) {
    return false;
  }
  if (activeOperationType === args.operationType) return true;
  if (
    args.operationType === "prepare_attack_card" &&
    isPendingAttackCardRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.operationType === "prepare_defense_card" &&
    pendingOperationType(pendingRecommendation) === "prepare_defense_card"
  ) return true;
  if (pendingOperationType(pendingRecommendation) === args.operationType) {
    return true;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

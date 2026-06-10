import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { weeklyAdaptiveReviewStateForTurn } from "./state.ts";

export function operationInputFromPlanAdjustmentScope(
  message: string,
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  void message;
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  ) as any;
  const structuredInput = intent?.operation_input ?? intent?.payload_hint ??
    intent?.slots;
  return structuredInput && typeof structuredInput === "object" &&
      !Array.isArray(structuredInput)
    ? structuredInput as Record<string, unknown>
    : null;
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
  return owner === "tool_skill" || owner === "product_help";
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
  void args.history;
  if (
    operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame ?? null,
    )
  ) return true;
  return args.routeDecision?.response_owner === "tool_skill" &&
    String(args.routeDecision?.selected_handler ?? "").trim() ===
      "adjust_plan_item" &&
    Boolean(
      args.turnFrame?.tool_skill_intents?.some((intent) =>
        String(intent?.operation_type ?? "").trim() === "adjust_plan_item" &&
        intent.explicitness === "explicit" &&
        intent.confidence_band !== "low" &&
        intent.ambiguity !== "intent_ambiguous" &&
        intent.ambiguity !== "both"
      ),
    );
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

import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { PotionSessionDraftV1 } from "./generator.ts";

export function isPendingStatePotionOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "select_state_potion";
  draft: PotionSessionDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      record.draft?.operation_type === "select_state_potion" &&
      record.draft?.draft?.potion_type,
  );
}

export function isPendingStatePotionRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "select_state_potion";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      (record.surface_id === "potion.state" ||
        record.surface_id === "state_potions"),
  );
}

function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

export function selectStatePotionRouteIsSelected(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
  userMessage: string;
}): boolean {
  const pending = args.tempMemory?.pending_tool_skill_confirmation ??
    args.tempMemory?.__pending_tool_skill_confirmation ??
    null;
  const pendingType = pendingOperationType(pending);
  if (pendingType === "select_state_potion") return true;
  if (pendingType) return false;

  const activeIntake = args.tempMemory?.__active_tool_skill_intake ??
    args.tempMemory?.active_tool_skill_intake ??
    null;
  const activeType = String((activeIntake as any)?.operation_type ?? "");
  if (activeType === "select_state_potion") return true;
  if (activeType) return false;

  const pendingRecommendation = args.tempMemory
    ?.__pending_recommendation_operation;
  if (isPendingStatePotionRecommendationOperation(pendingRecommendation)) {
    return true;
  }

  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "select_state_potion"
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== "select_state_potion"
  ) return false;

  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === "select_state_potion" &&
    intent.confidence_band !== "low"
  );
}

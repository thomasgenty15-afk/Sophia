import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type {
  StatusRecapConstraint,
  StatusRecapDecisionDraft,
  StatusRecapIntent,
  StatusRecapObjectType,
  StatusRecapProjection,
} from "./contract.ts";

export function isFaitPrevuFragileRecapRequest(message: string): boolean {
  void message;
  return false;
}

function routeHasStatusSignal(routeDecision: RouteDecision | null): boolean {
  if (!routeDecision) return false;
  if (routeDecision.selected_handler === "status_only_no_mutation_check") {
    return true;
  }
  if (
    routeDecision.reason_code.includes("status_only") ||
    routeDecision.reason_code.includes("recap")
  ) return true;
  return routeDecision.blocked_paths.some((path) =>
    path.path.includes("status_only") ||
    path.reason_code.includes("status_only") ||
    path.reason_code.includes("recap")
  );
}

function routeHasFaitPrevuFragileSignal(
  routeDecision: RouteDecision | null,
): boolean {
  if (!routeDecision) return false;
  if (routeDecision.reason_code.includes("fait_prevu_fragile")) return true;
  return routeDecision.blocked_paths.some((path) =>
    path.reason_code.includes("fait_prevu_fragile")
  );
}

function projectionHasAnySource(projection: StatusRecapProjection): boolean {
  return projection.attack_cards.length > 0 ||
    projection.defense_cards.length > 0 ||
    projection.one_shot_reminders.pending.length > 0 ||
    projection.one_shot_reminders.cancelled_recent.length > 0 ||
    projection.recurring_reminders.length > 0 ||
    projection.potion_sessions.length > 0 ||
    projection.coach_preferences.length > 0;
}

function targetsFromMessage(message: string): StatusRecapObjectType[] {
  void message;
  return ["unknown"];
}

function intentFromMessage(args: {
  userMessage: string;
  routeDecision: RouteDecision | null;
}): StatusRecapIntent {
  void args.userMessage;
  if (routeHasFaitPrevuFragileSignal(args.routeDecision)) {
    return "fait_prevu_fragile";
  }
  if (routeHasStatusSignal(args.routeDecision)) return "durable_status";
  return "unclear";
}

export function decideStatusRecap(args: {
  userMessage: string;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  projection: StatusRecapProjection;
}): StatusRecapDecisionDraft {
  const intent = intentFromMessage({
    userMessage: args.userMessage,
    routeDecision: args.routeDecision,
  });
  const constraints: StatusRecapConstraint[] = [
    "non_mutating",
    "db_grounded",
    "do_not_execute_tool",
    "do_not_claim_without_source",
    "do_not_render_product_how_to",
    "do_not_preempt_explicit_tool_command",
    "short_reply",
  ];
  if (intent === "fait_prevu_fragile") {
    constraints.push("format_fait_prevu_fragile");
  }
  const projectionUsed = intent !== "human_recap_no_db" && intent !== "unclear";
  const targetObjects = targetsFromMessage(args.userMessage);
  return {
    skill_id: "status_recap",
    intent,
    target_objects: targetObjects,
    constraints,
    projection_used: projectionUsed,
    missing_sources: projectionUsed && !projectionHasAnySource(args.projection)
      ? ["status_recap_projection"]
      : [],
    response_contract: {
      max_questions: 0,
      format: intent === "fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : intent === "object_status" || intent === "coach_preferences_status"
        ? "object_answer"
        : intent === "recent_effects_recap" || intent === "cancelled_objects"
        ? "recap"
        : "compact",
      allow_human_context_lines: intent === "recent_effects_recap",
    },
    operation_suggestions: [],
  };
}

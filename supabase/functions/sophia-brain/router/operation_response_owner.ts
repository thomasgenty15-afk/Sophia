import type {
  ResponseOwner,
  RouteDecision,
} from "../contracts/route_decision.v1.ts";

export function effectiveResponseOwnerForOperationRuntime(args: {
  routeDecision: Pick<RouteDecision, "response_owner"> | null;
  toolSkillRun?: unknown;
}): ResponseOwner {
  const selectedHandler = String(
    (args.toolSkillRun as any)?.selected_handler ?? "",
  ).trim();
  if (selectedHandler) return "tool_skill";
  return args.routeDecision?.response_owner ?? "normal_reply";
}

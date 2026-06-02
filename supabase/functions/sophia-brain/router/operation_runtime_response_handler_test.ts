import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeDecisionForOperationTrace } from "./operation_runtime_response_handler.ts";

Deno.test("operation runtime trace route uses executed tool skill handler", () => {
  const routeDecision = {
    route_version: "v1",
    response_owner: "orientation_clarification",
    selected_handler: "orientation_clarification",
    reason_code: "active_handoff_turn_unclear",
    direct_effects_to_run: [],
    blocked_paths: [],
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  } as any;

  const traced = routeDecisionForOperationTrace({
    routeDecision,
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      operation_type: "adjust_plan_item",
    },
  });

  assertEquals(traced.response_owner, "tool_skill");
  assertEquals(traced.selected_handler, "adjust_plan_item");
  assertEquals(traced.reason_code, "active_handoff_turn_unclear");
});

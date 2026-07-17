import { assertEquals } from "jsr:@std/assert@1";

import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import { applyAttackKeywordSupportRoute } from "./attack_keyword_support_route.ts";

function baseRoute(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "normal_reply_default",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

Deno.test("safety route stays untouched", () => {
  const safety = baseRoute({
    response_owner: "safety",
    reason_code: "safety_high",
  });
  const out = applyAttackKeywordSupportRoute({ routeDecision: safety });
  assertEquals(out, safety);
});

Deno.test("normal reply becomes attack_keyword_support ownership", () => {
  const out = applyAttackKeywordSupportRoute({ routeDecision: baseRoute() });
  assertEquals(out.response_owner, "attack_keyword_support");
  assertEquals(out.selected_handler, "attack_keyword_support");
  assertEquals(out.reason_code, "attack_keyword_exact_match");
  assertEquals(out.direct_effects_to_run, []);
  assertEquals(out.active_flow_arbitration, undefined);
});

Deno.test("pending direct effects are blocked, never silently dropped", () => {
  const out = applyAttackKeywordSupportRoute({
    routeDecision: baseRoute({
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
  });
  assertEquals(out.direct_effects_to_run, []);
  assertEquals(out.blocked_paths, [{
    path: "direct_effects.create_one_shot_reminder",
    reason_code: "attack_keyword_support_priority",
  }]);
});

Deno.test("non-normal owner is recorded as a blocked path", () => {
  const out = applyAttackKeywordSupportRoute({
    routeDecision: baseRoute({
      response_owner: "coaching_recommendation",
      reason_code: "coaching_entry",
    }),
  });
  assertEquals(out.response_owner, "attack_keyword_support");
  assertEquals(out.blocked_paths, [{
    path: "coaching_recommendation",
    reason_code: "attack_keyword_support_priority",
  }]);
});

Deno.test("active local flow is preempted with presence resume policy", () => {
  const out = applyAttackKeywordSupportRoute({
    routeDecision: baseRoute({
      response_owner: "presence_conversation",
      reason_code: "active_presence_conversation",
    }),
    activeSkillState: { skill_id: "presence_conversation", status: "active" },
  });
  assertEquals(out.active_flow_arbitration, {
    decision: "preempt_active",
    active_owner: "presence_conversation",
    selected_owner: "attack_keyword_support",
    resume_policy: "replace_with_presence",
    reason_code: "attack_keyword_exact_match",
  });
});

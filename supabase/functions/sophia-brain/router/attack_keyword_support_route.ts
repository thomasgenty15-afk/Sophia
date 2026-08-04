import type { RouteDecision } from "../contracts/route_decision.v1.ts";

function activeSkillId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return String((value as Record<string, unknown>).skill_id ?? "").trim() ||
    null;
}

export function applyAttackKeywordSupportRoute(input: {
  routeDecision: RouteDecision;
  activeSkillState?: unknown;
}): RouteDecision {
  if (input.routeDecision.response_owner === "safety") {
    return input.routeDecision;
  }
  const activeOwner = activeSkillId(input.activeSkillState);
  const blockedDirectEffects = input.routeDecision.direct_effects_to_run.map(
    (effect) => ({
      path: `direct_effects.${effect}`,
      reason_code: "attack_keyword_support_priority",
    }),
  );
  return {
    route_version: "v1",
    response_owner: "attack_keyword_support",
    selected_handler: "attack_keyword_support",
    blocked_paths: [
      ...input.routeDecision.blocked_paths,
      ...blockedDirectEffects,
      ...(input.routeDecision.response_owner !== "normal_reply"
        ? [{
          path: input.routeDecision.response_owner,
          reason_code: "attack_keyword_support_priority",
        }]
        : []),
    ],
    direct_effects_to_run: [],
    reason_code: "attack_keyword_exact_match",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...(activeOwner
      ? {
        active_flow_arbitration: {
          decision: "preempt_active",
          active_owner: activeOwner,
          selected_owner: "attack_keyword_support",
          resume_policy: "replace_with_presence",
          reason_code: "attack_keyword_exact_match",
        },
      }
      : {}),
  };
}

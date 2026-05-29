import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  AdjustPlanDecision,
  AdjustPlanDecisionDraft,
  AdjustPlanRouterPlanItemSnapshot,
} from "./contract.ts";
import { reduceAdjustPlanState } from "./reducer.ts";
import { renderAdjustPlanDecision } from "./renderer.ts";
import { resolveAdjustPlanScope } from "./scope_resolver.ts";

const items: AdjustPlanRouterPlanItemSnapshot[] = [
  {
    id: "walk",
    title: "Marche",
    dimension: "body",
    item_type: "action",
    status: "active",
  },
  {
    id: "walk-copy",
    title: "Marche",
    dimension: "body",
    item_type: "action",
    status: "active",
  },
  {
    id: "done",
    title: "Action finie",
    dimension: "body",
    item_type: "action",
    status: "completed",
  },
  {
    id: "support",
    title: "Garde-fou",
    dimension: "support",
    item_type: "support",
    status: "active",
  },
];

function decision(
  patch: Record<string, unknown> | null = { description: "Version courte" },
): AdjustPlanDecisionDraft {
  return {
    skill_id: "adjust_plan_item",
    operation_id: "op1",
    intent: "start_adjustment",
    status: "draft_ready",
    scope: {
      kind: "specific_plan_item",
      plan_item_ids: ["walk"],
      target_hint: null,
      confidence: "high",
      missing_slots: [],
    },
    change: {
      kind: "reduce",
      user_problem: "trop lourd",
      requested_change: "alléger",
      exact_constraints: [],
      missing_slots: [],
    },
    draft: {
      available: patch != null,
      requires_confirmation: true,
      summary: patch ? "Réduire l'action." : null,
      patch,
    },
    constraints: ["requires_confirmation"],
  };
}

function reduce(input: AdjustPlanDecisionDraft): AdjustPlanDecision {
  return reduceAdjustPlanState(
    null,
    input,
    resolveAdjustPlanScope({
      decision: input,
      plan_snapshot: { items },
    }),
  );
}

Deno.test("specific_item_reduce_draft_requires_confirmation", () => {
  const reduced = reduce(decision());
  assertEquals(reduced.draft.available, true);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.effect_plan.effects, []);
  assertEquals(reduced.effect_plan.blocked_reason, "requires_confirmation");
});

Deno.test("draft_only_never_applies", () => {
  const input = { ...decision(), intent: "draft_only" as const };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.effect_plan.blocked_reason, "draft_only");
});

Deno.test("approve_pending_draft_applies", () => {
  const input = { ...decision(), intent: "confirm_draft" as const };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, true);
  assertEquals(reduced.effect_plan.effects.length, 1);
  assertEquals(reduced.effect_plan.effects[0].requires_confirmation, true);
});

Deno.test("explain_pending_draft_no_apply", () => {
  const input = { ...decision(), intent: "explain_draft" as const };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.effect_plan.blocked_reason, "requires_confirmation");
});

Deno.test("revise_pending_draft_no_apply_until_confirmed", () => {
  const input = {
    ...decision({ description: "Nouvelle version" }),
    intent: "revise_draft" as const,
  };
  const reduced = reduce(input);
  assertEquals(reduced.status, "draft_ready");
  assertEquals(reduced.effect_plan.allowed, false);
});

Deno.test("reject_pending_draft_clears", () => {
  const input = { ...decision(), intent: "reject_draft" as const };
  const reduced = reduce(input);
  assertEquals(reduced.status, "rejected");
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.state_patch.pending_draft, null);
});

Deno.test("ambiguous_scope_blocks_effect", () => {
  const input = {
    ...decision(),
    intent: "confirm_draft" as const,
    scope: {
      ...decision().scope,
      plan_item_ids: [],
      target_hint: "Marche",
    },
  };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.scope.confidence, "low");
  assertEquals(reduced.effect_plan.blocked_reason, "scope_confidence_low");
});

Deno.test("whole_plan_adjustment_preserves_level_objective", () => {
  const input = {
    ...decision({
      description: "Alléger le plan",
      level_objective: "Changer l'objectif profond",
    }),
    intent: "confirm_draft" as const,
    scope: {
      ...decision().scope,
      kind: "whole_plan" as const,
      plan_item_ids: [],
      target_hint: "plan",
    },
  };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, true);
  assertEquals(
    "level_objective" in reduced.effect_plan.effects[0].patch,
    false,
  );
});

Deno.test("completed_item_not_carried_or_changed_without_explicit_valid_reason", () => {
  const input = {
    ...decision(),
    intent: "confirm_draft" as const,
    scope: { ...decision().scope, plan_item_ids: ["done"] },
  };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.effect_plan.blocked_reason, "completed_item_blocked");
});

Deno.test("support_item_not_touched_by_default", () => {
  const input = {
    ...decision(),
    intent: "confirm_draft" as const,
    scope: { ...decision().scope, plan_item_ids: ["support"] },
  };
  const reduced = reduce(input);
  assertEquals(reduced.effect_plan.allowed, false);
  assertEquals(reduced.effect_plan.blocked_reason, "support_item_blocked");
});

Deno.test("weekly_bridge_copy_forward_requires_confirmation", () => {
  const input = {
    ...decision({ description: "Copier vers la semaine suivante" }),
    intent: "weekly_bridge" as const,
    scope: {
      ...decision().scope,
      kind: "current_week" as const,
      plan_item_ids: [],
    },
  };
  const reduced = reduce(input);
  assertEquals(reduced.draft.available, true);
  assertEquals(reduced.effect_plan.allowed, false);
});

Deno.test("off_topic_preserves_or_exits_without_apply", () => {
  const input = { ...decision(), intent: "off_topic" as const };
  const reduced = reduce(input);
  assertEquals(reduced.status, "off_topic");
  assertEquals(reduced.effect_plan.allowed, false);
});

Deno.test("writer_failure_no_done_language", () => {
  const input = { ...decision(), intent: "confirm_draft" as const };
  const reduced = reduce(input);
  const reply = renderAdjustPlanDecision({
    state: reduced,
    effect_result: {
      committed_effects: [],
      failed_effects: [{
        type: "adjust_plan_item",
        operation_id: "op1",
        reason_code: "writer_failed",
      }],
    },
  });
  assertEquals(reply.includes("appliqué"), false);
  assertEquals(
    reply,
    "Je n'ai pas pu appliquer cet ajustement. Le plan reste inchangé.",
  );
});

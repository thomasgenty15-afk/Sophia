import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createInitialAdjustPlanLocalState,
  normalizeAdjustPlanLocalDispatcherOutput,
  reduceAdjustPlanLocalDispatcherOutput,
} from "./local_flow.ts";

function dispatcherOutput(overrides: Record<string, unknown> = {}) {
  return normalizeAdjustPlanLocalDispatcherOutput({
    flow_action: "clarify_scope",
    confidence: "medium",
    risk_score: 0,
    adjust_plan_intent: {
      kind: "start_or_continue",
      summary: "Le user veut ajuster son plan.",
    },
    scope: {
      kind: "unknown",
      confidence: "low",
      plan_id: null,
      plan_title: null,
      level_id: null,
      level_title: null,
      plan_item_ids: [],
      target_summary: null,
      needs_scope_clarification: true,
    },
    adjustment_need: {
      reason_change: null,
      requested_change: null,
      change_kind: null,
      constraints: [],
      preserve: [],
      avoid: [],
      missing: [],
    },
    platform_handoff: {
      status: "none",
      destination: null,
      suggested_platform_input: null,
      grouped_by_plan: [],
      previous_value: null,
      revised_value: null,
    },
    state_updates: {
      status: "clarifying",
      stage: "scope",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "clarify_scope",
      instruction: "Ask what should change.",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: null,
      handoff_hint_for_global_dispatcher: null,
    },
    evidence: [],
    ...overrides,
  });
}

Deno.test("adjust_plan_item local reducer clarifies vague scope", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput(),
  });

  assertEquals(reduced.status, "clarifying");
  assertEquals(reduced.visible_task, "clarify_scope");
  assertEquals(reduced.draft, null);
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("adjust_plan_item local reducer prepares non-mutant Plan handoff", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "prepare_plan_handoff",
      scope: {
        kind: "specific_plan_item",
        confidence: "high",
        plan_id: "plan-1",
        plan_title: "Plan principal",
        level_id: null,
        level_title: null,
        plan_item_ids: ["item-1"],
        target_summary: "Action du soir",
        needs_scope_clarification: false,
      },
      adjustment_need: {
        reason_change: "trop lourd le soir",
        requested_change: "reduire a 10 minutes",
        change_kind: "reduce",
        constraints: [],
        preserve: ["garder le rituel"],
        avoid: ["ne pas ajouter d'action"],
        missing: [],
      },
      platform_handoff: {
        status: "draft_ready",
        destination: "Plan",
        suggested_platform_input:
          "Dans Plan principal, reduire Action du soir a 10 minutes.",
        grouped_by_plan: [],
        previous_value: null,
        revised_value: null,
      },
      state_updates: {
        status: "handoff_ready",
        stage: "handoff",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "plan_handoff_ready",
        instruction: "Give Plan handoff.",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(reduced.visible_task, "plan_handoff_ready");
  assertEquals(reduced.draft?.no_chat_mutation, true);
  assertEquals(reduced.draft?.executable_from_chat, false);
  assertEquals(reduced.draft?.destination.product_area, "Plan");
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("adjust_plan_item local reducer blocks apply attempts", () => {
  const previous = createInitialAdjustPlanLocalState();
  previous.platform_handoff = {
    status: "delivered",
    destination: "Plan",
    suggested_platform_input: "Reduire l'action a 10 minutes.",
    grouped_by_plan: [],
    previous_value: null,
    revised_value: null,
  };
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous,
    output: dispatcherOutput({
      flow_action: "apply_attempt",
      state_updates: {
        status: "apply_attempt",
        stage: "handoff",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "apply_attempt",
        instruction: "Refuse chat mutation.",
      },
    }),
  });

  assertEquals(reduced.status, "apply_attempt");
  assertEquals(reduced.visible_task, "apply_attempt");
  assertEquals(reduced.blocked_effects, [{
    type: "adjust_plan_item",
    reason_code: "chat_plan_mutation_disabled_platform_handoff",
  }]);
});

Deno.test("adjust_plan_item local reducer exits to global with memo", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      exit_memo: {
        needed: true,
        reason: "explicit_tool_request",
        user_intent_summary: "Le user demande une carte d'attaque.",
        local_flow_context: {
          skill_id: "adjust_plan_item",
          no_chat_mutation: true,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_attack_card",
          why: "Demande explicite de carte.",
        },
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.exit_memo?.needed, true);
  assertEquals(reduced.draft, null);
});

Deno.test("adjust_plan_item get_info_db preserves local flow context", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "get_info_db",
      visible_task: {
        kind: "none",
        instruction: "Use status recap inline.",
      },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "Le user demande quelles actions sont deja dans le plan.",
        context_for_subskill: {
          active_flow: "adjust_plan_item",
          question_to_answer:
            "Dire quelles actions existent deja avant de preparer l'ajustement.",
          active_flow_context: {
            scope: { kind: "unknown" },
            plan_snapshot: [{ id: "item-1", title: "Action actuelle" }],
          },
        },
      },
    }),
  });

  assertEquals(reduced.get_info_db, true);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.status, "collecting");
  assertEquals(reduced.local_state?.last_visible_task, "none");
  assertEquals(reduced.subskill_context?.active_flow, "adjust_plan_item");
  assertEquals(
    reduced.subskill_context?.question_to_answer,
    "Dire quelles actions existent deja avant de preparer l'ajustement.",
  );
});

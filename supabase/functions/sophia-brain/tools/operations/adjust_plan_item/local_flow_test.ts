import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createInitialAdjustPlanLocalState,
  dispatcherSystemPrompt,
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
  assertEquals(
    reduced.conversation_context?.handoff_data.suggested_platform_input,
    "Dans Plan principal, reduire Action du soir a 10 minutes.",
  );
  assertEquals(
    reduced.conversation_context?.known_values.scope.plan_id,
    "plan-1",
  );
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("adjust_plan_item local reducer recovers instead of delivering empty handoff", () => {
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
        requested_change: "alleger l'action",
        change_kind: "reduce",
        constraints: [],
        preserve: [],
        avoid: [],
        missing: [],
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

  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.visible_task, "contract_recovery");
  assertEquals(reduced.draft, null);
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.blocked_effects, [{
    type: "local_flow_runtime",
    reason_code: "handoff_missing_suggested_platform_input",
  }]);
});

Deno.test("adjust_plan_item local reducer blocks apply attempts", () => {
  const previous = createInitialAdjustPlanLocalState();
  previous.scope = {
    kind: "specific_plan_item",
    confidence: "high",
    plan_id: "plan-1",
    plan_title: "Plan principal",
    level_id: null,
    level_title: null,
    plan_item_ids: ["item-1"],
    target_summary: "Action du soir",
    needs_scope_clarification: false,
  };
  previous.adjustment_need = {
    reason_change: "trop lourd le soir",
    requested_change: "reduire a 10 minutes",
    change_kind: "reduce",
    constraints: [],
    preserve: [],
    avoid: [],
    missing: [],
  };
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

Deno.test("adjust_plan_item handoff requires target, reason and change kind before Plan handoff", () => {
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
        requested_change: "le rendre plus facile",
        change_kind: null,
        constraints: [],
        preserve: [],
        avoid: [],
        missing: [],
      },
      platform_handoff: {
        status: "draft_ready",
        destination: "Plan",
        suggested_platform_input: "Rendre l'action du soir plus facile.",
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

  assertEquals(reduced.status, "clarifying");
  assertEquals(reduced.visible_task, "clarify_adjustment_need");
  assertEquals(reduced.draft, null);
  assertEquals(
    reduced.conversation_context?.missing_or_weak_values.includes(
      "change_kind",
    ),
    true,
  );
});

Deno.test("adjust_plan_item prompt explains real dispatcher fields and transitions", () => {
  const prompt = dispatcherSystemPrompt();

  assertStringIncludes(prompt, "Field Completion Rules:");
  assertStringIncludes(prompt, "- flow_action:");
  assertStringIncludes(prompt, "- adjust_plan_intent.kind:");
  assertStringIncludes(prompt, "- scope:");
  assertStringIncludes(prompt, "- adjustment_need:");
  assertStringIncludes(prompt, "- platform_handoff:");
  assertStringIncludes(prompt, "quoi_modifier + reason_change");
  assertStringIncludes(prompt, "nature du changement");
  assertStringIncludes(prompt, "- state_updates:");
  assertStringIncludes(prompt, "- visible_task.kind:");
  assertStringIncludes(prompt, "- visible_task.conversation_context:");
  assertStringIncludes(prompt, "- subskill_call:");
  assertStringIncludes(prompt, "- exit_memo:");
  assertStringIncludes(prompt, "- note_information:");
  assertStringIncludes(prompt, "- evidence:");
  assertStringIncludes(prompt, "Transition Rules:");
  assertStringIncludes(prompt, "exit_to_global_dispatcher pour arreter ce flow");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertStringIncludes(prompt, "handoff_to_local_flow");
  assertEquals(
    (prompt.match(/\"flow_action\"/g) ?? []).length,
    2,
    "prompt must contain exactly two JSON examples with flow_action",
  );
});

Deno.test("adjust_plan_item stop exits through global note", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      adjust_plan_intent: {
        kind: "cancel",
        summary: "Le user veut arreter l'ajustement.",
      },
      state_updates: {
        status: "exit_to_global",
        stage: "closing",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit through global note.",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        user_intent_summary: "Le user veut arreter l'ajustement.",
        local_flow_context: {
          skill_id: "adjust_plan_item",
          no_chat_mutation: true,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "normal_coaching",
          why: "Arret du flow adjust_plan_item.",
        },
      },
      note_information: {
        needed: true,
        value: {
          source_flow_id: "adjust_plan_item",
          source_flow_state_summary: "Adjust plan flow stopped.",
          handoff_reason: "topic_change",
          target_dispatcher: "global",
          handoff_context_for_next_dispatcher:
            "The user stopped the active adjust_plan_item flow.",
          target_local_dispatcher_hint: null,
          user_words: ["arreter l'ajustement"],
          structured_context: {
            collected_state: { status: "exit_to_global" },
            unresolved_questions: [],
            recommended_next_focus: "resume global routing",
          },
          risk_score: 0,
          no_chat_mutation: {
            db_write_committed: false,
            potion_session_created: false,
            scheduled_checkin_created: false,
            recurring_reminder_created: false,
            executable_confirmation_generated: false,
          },
        },
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.handoff_to_local_flow, false);
  assertEquals(reduced.visible_task, "exit_or_cancel");
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("adjust_plan_item continuation keeps user constraints in visible context", () => {
  const previous = createInitialAdjustPlanLocalState();
  previous.stage = "constraints";
  previous.adjustment_need = {
    reason_change: "trop lourd le soir",
    requested_change: "reduire l'action",
    change_kind: "reduce",
    constraints: [],
    preserve: [],
    avoid: [],
    missing: ["contrainte"],
  };

  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous,
    output: dispatcherOutput({
      flow_action: "answer_current_field",
      confidence: "high",
      adjust_plan_intent: {
        kind: "constraint_answer",
        summary: "Le user veut garder le signal de pause sans ajouter d'action.",
      },
      adjustment_need: {
        reason_change: "trop lourd le soir",
        requested_change: "reduire l'action",
        change_kind: "reduce",
        constraints: ["cette semaine seulement"],
        preserve: ["signal de pause"],
        avoid: ["ajouter une action"],
        missing: [],
      },
      state_updates: {
        status: "collecting",
        stage: "handoff",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_adjustment_need",
        instruction: "Continue collecting.",
      },
    }),
  });

  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.local_state?.adjustment_need.constraints, [
    "cette semaine seulement",
  ]);
  assertEquals(reduced.conversation_context?.known_values.constraints, [
    "cette semaine seulement",
  ]);
  assertEquals(reduced.conversation_context?.known_values.preserve, [
    "signal de pause",
  ]);
  assertEquals(reduced.conversation_context?.known_values.avoid, [
    "ajouter une action",
  ]);
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
  assertEquals(reduced.note_information?.source_flow_id, "adjust_plan_item");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
  assertEquals(reduced.draft, null);
});

Deno.test("adjust_plan_item handoff_to_local_flow closes parent with note", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "handoff_to_local_flow",
      visible_task: {
        kind: "none",
        instruction: "Bridge to local flow.",
      },
      note_information: {
        needed: true,
        target_dispatcher: "prepare_attack_card",
        handoff_reason: "bridge",
        user_message_summary:
          "Le user demande une carte d'attaque pour l'action collectee.",
        active_flow_summary:
          "adjust_plan_item a collecte une intention d'ajustement de Plan.",
        collected_state: {
          source_flow: "adjust_plan_item",
          requested_next_flow: "prepare_attack_card",
        },
        unresolved_questions: [],
        confidence: "high",
        evidence: ["demande explicite de carte"],
        recommended_next_focus:
          "Demander la cible et le blocage utiles a la carte.",
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.handoff_to_local_flow, true);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.local_state, null);
  assertEquals(reduced.note_information?.source_flow_id, "adjust_plan_item");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "prepare_attack_card",
  );
});

Deno.test("adjust_plan_item safety_preempt routes to safety without global", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "safety_preempt",
      risk_score: 9,
      visible_task: {
        kind: "safety",
        instruction: "Do not continue Plan flow.",
      },
    }),
  });

  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.handoff_to_local_flow, false);
  assertEquals(reduced.target_dispatcher, "safety_crisis");
  assertEquals(reduced.visible_task, "safety");
  assertEquals(reduced.note_information?.target_dispatcher, "safety_crisis");
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
  assertEquals(reduced.get_info_product, false);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.status, "collecting");
  assertEquals(reduced.local_state?.last_visible_task, "none");
  assertEquals(reduced.subskill_context?.active_flow, "adjust_plan_item");
  assertEquals(
    reduced.subskill_context?.question_to_answer,
    "Dire quelles actions existent deja avant de preparer l'ajustement.",
  );
  assertEquals(reduced.note_information?.target_dispatcher, "status_recap");
});

Deno.test("adjust_plan_item get_info_product preserves local flow context", () => {
  const reduced = reduceAdjustPlanLocalDispatcherOutput({
    previous: createInitialAdjustPlanLocalState(),
    output: dispatcherOutput({
      flow_action: "get_info_product",
      visible_task: {
        kind: "none",
        instruction: "Use product help inline.",
      },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "Le user demande ou appliquer la proposition dans Plan.",
        context_for_subskill: {
          active_flow: "adjust_plan_item",
          question_to_answer:
            "Expliquer ou reprendre la proposition dans la surface Plan.",
        },
      },
    }),
  });

  assertEquals(reduced.get_info_db, false);
  assertEquals(reduced.get_info_product, true);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.note_information?.target_dispatcher, "product_help");
});

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import {
  type AdjustPlanLocalDispatcherOutput,
  normalizeAdjustPlanLocalDispatcherOutput,
} from "./local_flow.ts";
import { maybeRunAdjustPlanItemOperation } from "./router.ts";

function turnFrame(overrides: Record<string, unknown> = {}) {
  return {
    confirmation_response: {
      kind: "unknown" as const,
      confidence_band: "low" as const,
    },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    ...overrides,
  } as any;
}

function context(args: {
  message: string;
  tempMemory?: any;
  turnFrame?: any;
  routeDecision?: any;
}) {
  return {
    userId: "user-1",
    userMessage: args.message,
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: args.tempMemory ?? {},
    planItemSnapshot: [{
      id: "item-1",
      title: "Signal de pause",
      dimension: "missions",
      item_type: "action",
      status: "active",
    }],
    turnFrame: args.turnFrame ?? turnFrame(),
    routeDecision: args.routeDecision ?? null,
    safetyContextOutput: { risk_band: "none" as const },
    sourceMessageId: "message-1",
    requestId: "request-1",
    forceFullAi: false,
    enableAdjustPlanCoachGuidance: true,
    confirmationSecret: "unused",
  };
}

function draft(): AdjustPlanHandoffDraft {
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_blocker_summary: "le plan est trop dense cette semaine",
    suggested_platform_input:
      "Je veux alléger cette semaine sans abandonner l'objectif : garder l'intention du signal de pause, mais en faire une version plus courte et facile à lancer.",
    preserve: ["l'objectif", "le signal de pause"],
    avoid: ["abandonner l'action"],
    destination: {
      product_area: "Plan",
      instruction:
        "Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.",
    },
    missing_clarity: [],
  };
}

function dispatcherOutput(
  overrides: Record<string, unknown> = {},
): AdjustPlanLocalDispatcherOutput {
  return normalizeAdjustPlanLocalDispatcherOutput({
    flow_action: "prepare_plan_handoff",
    confidence: "high",
    risk_score: 0,
    adjust_plan_intent: {
      kind: "handoff_request",
      summary: "Le user veut preparer un ajustement a reprendre dans Plan.",
    },
    scope: {
      kind: "specific_plan_item",
      confidence: "high",
      plan_id: "plan-1",
      plan_title: "Plan principal",
      level_id: null,
      level_title: null,
      plan_item_ids: ["item-1"],
      target_summary: "Signal de pause",
      needs_scope_clarification: false,
    },
    adjustment_need: {
      reason_change: "le plan est trop dense",
      requested_change: "alleger le signal de pause",
      change_kind: "reduce",
      constraints: [],
      preserve: ["l'objectif", "le signal de pause"],
      avoid: ["abandonner l'action"],
      missing: [],
    },
    platform_handoff: {
      status: "draft_ready",
      destination: "Plan",
      suggested_platform_input:
        "Dans Plan principal, alleger Signal de pause en version plus courte et facile a lancer.",
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
      conversation_context: null,
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: null,
      handoff_hint_for_global_dispatcher: null,
    },
    note_information: {
      needed: false,
      value: null,
    },
    evidence: ["router_test"],
    ...overrides,
  });
}

function depsFor(
  output: AdjustPlanLocalDispatcherOutput,
  visiblePrefix = "Plan",
) {
  return {
    localDispatcher: async (input: any) => {
      assert(input.note_information_inbound);
      return output;
    },
    visibleAgent: async (input: any) => {
      assert(input.conversation_context);
      assertEquals(input.local_state, undefined);
      assertEquals(input.draft, undefined);
      const suggestion = input.conversation_context.handoff_data
        ?.suggested_platform_input ??
        input.conversation_context.handoff_data?.revised_value ??
        "";
      return `${visiblePrefix}: ${suggestion || input.stage}`;
    },
  };
}

function activeMemory() {
  return {
    __adjust_plan_handoff_state: {
      skill_id: "adjust_plan_item",
      mode: "platform_handoff",
      status: "draft_delivered",
      draft: draft(),
      turn_count: 0,
      max_turns: 6,
      created_at: "2026-06-03T10:00:00.000Z",
      updated_at: "2026-06-03T10:00:00.000Z",
      no_chat_mutation: true,
    },
  };
}

function assertNoTemplateLanguage(content: string) {
  assertEquals(content.includes("Je vois l'idée :"), false);
  assertEquals(
    content.includes("Tu peux reprendre cette phrase dans Plan :"),
    false,
  );
  assertEquals(content.includes("À préserver :"), false);
  assertEquals(content.includes("À éviter :"), false);
  assertEquals(
    content.includes("Il ne te reste plus qu'à reprendre ça"),
    false,
  );
}

function assertNoExecutionClaim(content: string) {
  assertEquals(/\bc['’]?est fait\b/i.test(content), false);
  assertEquals(/\bj['’]?ai (?:modifi|ajust|appliqu)/i.test(content), false);
  assertEquals(/\bje peux l['’]?appliquer\b/i.test(content), false);
  assertEquals(/\bdis[- ]moi oui\b/i.test(content), false);
}

Deno.test("direct adjust_plan request uses local dispatcher and Plan handoff", async () => {
  const output = dispatcherOutput();
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Je veux alléger mon plan, je ne sais pas trop quoi dire.",
      routeDecision: { selected_handler: "adjust_plan_item" },
    }),
    deps: depsFor(output),
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "platform_handoff");
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).mode, "platform_handoff");
  assertEquals((runtime.toolSkillRun as any).committed_effects, []);
  assertStringIncludes(runtime.content, "Plan");
  assertEquals(
    (runtime.toolSkillRun as any).conversation_context.handoff_data
      .suggested_platform_input,
    "Dans Plan principal, alleger Signal de pause en version plus courte et facile a lancer.",
  );
  assertEquals(
    (runtime.toolSkillRun as any).handoff_core,
    {
      target_to_modify: "Signal de pause",
      reason_change: "le plan est trop dense",
      requested_change: "alleger le signal de pause",
      change_kind: "reduce",
      has_core_triptych: true,
      missing_or_weak_values: [],
    },
  );
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
  assertEquals(
    (runtime.nextTempMemory as any).__adjust_plan_handoff_state.mode,
    "platform_handoff",
  );
});

Deno.test("whole-plan-like request does not create executable scope or patch", async () => {
  const output = dispatcherOutput({
    scope: {
      kind: "whole_plan",
      confidence: "medium",
      plan_id: "plan-1",
      plan_title: "Plan principal",
      level_id: null,
      level_title: null,
      plan_item_ids: [],
      target_summary: "Trajectoire globale",
      needs_scope_clarification: false,
    },
    platform_handoff: {
      status: "draft_ready",
      destination: "Plan",
      suggested_platform_input:
        "Dans Plan principal, revoir la trajectoire globale pour l'alleger sans repartir de zero.",
      grouped_by_plan: [],
      previous_value: null,
      revised_value: null,
    },
  });
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message:
        "Je crois que toute la trajectoire est trop lourde, mais je ne veux pas repartir de zéro.",
      routeDecision: { selected_handler: "adjust_plan_item" },
    }),
    deps: depsFor(output),
  });
  assert(runtime);
  const state = (runtime.nextTempMemory as any).__adjust_plan_handoff_state;
  assertEquals(state.draft.scope, undefined);
  assertEquals(state.draft.recommendation, undefined);
  assertEquals(state.draft.patch, undefined);
  assertEquals(state.draft.executable_from_chat, false);
  assertEquals(runtime.executedTools, []);
});

Deno.test("revision updates platform input draft without execution", async () => {
  const output = dispatcherOutput({
    flow_action: "revise_plan_handoff",
    platform_handoff: {
      status: "revised",
      destination: "Plan",
      suggested_platform_input: null,
      grouped_by_plan: [],
      previous_value:
        "Dans Plan principal, alleger Signal de pause en version plus courte.",
      revised_value:
        "Dans Plan principal, reformuler Signal de pause en version plus courte et plus chaleureuse.",
    },
    state_updates: {
      status: "revising",
      stage: "handoff",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "revise_plan_handoff",
      instruction: "Revise Plan handoff.",
      conversation_context: null,
    },
  });
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Rends ça plus court et plus chaleureux.",
      tempMemory: activeMemory(),
      turnFrame: turnFrame({
        tool_skill_intents: [{
          operation_type: "adjust_plan_item",
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "adjust",
        }],
      }),
    }),
    deps: depsFor(output),
  });
  assert(runtime);
  assertEquals(
    (runtime.toolSkillRun as any).flow_action,
    "revise_plan_handoff",
  );
  assertEquals(
    (runtime.toolSkillRun as any).visible_task.kind,
    "revise_plan_handoff",
  );
  assertEquals(runtime.executedTools, []);
  assertStringIncludes(runtime.content, "Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("apply attempt never creates confirmation or effect", async () => {
  const output = dispatcherOutput({
    flow_action: "apply_attempt",
    platform_handoff: {
      status: "apply_attempt",
      destination: "Plan",
      suggested_platform_input:
        "Dans Plan principal, alleger Signal de pause en version plus courte et facile a lancer.",
      grouped_by_plan: [],
      previous_value: null,
      revised_value: null,
    },
    state_updates: {
      status: "apply_attempt",
      stage: "handoff",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "apply_attempt",
      instruction: "Refuse chat mutation.",
      conversation_context: null,
    },
  });
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Ok vas-y applique.",
      tempMemory: {
        ...activeMemory(),
        __pending_tool_skill_confirmation: { should_disappear: true },
      },
      turnFrame: turnFrame({
        confirmation_response: { kind: "yes", confidence_band: "high" },
      }),
    }),
    deps: depsFor(output),
  });
  assert(runtime);
  assertEquals((runtime.toolSkillRun as any).status, "apply_attempt");
  assertEquals(
    (runtime.toolSkillRun as any).handoff_core.has_core_triptych,
    true,
  );
  assertEquals(
    (runtime.toolSkillRun as any).handoff_core.change_kind,
    "reduce",
  );
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).committed_effects, []);
  assertEquals(
    (runtime.nextTempMemory as any).__pending_tool_skill_confirmation,
    undefined,
  );
  assertStringIncludes(runtime.content, "Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("active adjust_plan exits explicitly before concurrent global operation", async () => {
  const output = dispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    state_updates: {
      status: "exit_to_global",
      stage: "closing",
      turn_count_increment: 1,
      close_after_visible: true,
    },
    visible_task: {
      kind: "exit_or_cancel",
      instruction: "Exit to global.",
      conversation_context: null,
    },
    exit_memo: {
      needed: true,
      reason: "explicit_tool_request",
      user_intent_summary: "Le user demande un rappel.",
      local_flow_context: {
        skill_id: "adjust_plan_item",
        no_chat_mutation: true,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "create_one_shot_reminder",
      },
    },
  });
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Mets-moi un rappel demain.",
      tempMemory: activeMemory(),
      routeDecision: { selected_handler: "create_one_shot_reminder" },
    }),
    deps: depsFor(output),
  });
  assert(runtime);
  assertEquals(
    (runtime.toolSkillRun as any).reason_code,
    "adjust_plan_item_local_exit_to_global_dispatcher",
  );
  assert((runtime.nextTempMemory as any).__last_adjust_plan_item_exit_memo);
});

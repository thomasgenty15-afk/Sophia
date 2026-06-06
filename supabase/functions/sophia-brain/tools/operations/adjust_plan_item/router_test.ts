import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import { maybeRunAdjustPlanItemOperation } from "./router.ts";

function turnFrame(overrides: Record<string, unknown> = {}) {
  return {
    confirmation_response: {
      kind: "unknown" as const,
      confidence_band: "low" as const,
    },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      operation_type: null,
      confidence_band: "low" as const,
    },
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
    safetyPregateOutput: { risk_band: "none" as const },
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
    mode: "platform_input_coaching",
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

function activeMemory() {
  return {
    __adjust_plan_handoff_state: {
      skill_id: "adjust_plan_item",
      mode: "platform_input_coaching",
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

Deno.test("direct adjust_plan request produces platform input coaching draft", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Je veux alléger mon plan, je ne sais pas trop quoi dire.",
      turnFrame: turnFrame({
        tool_skill_opportunity: {
          operation_type: "adjust_plan_item",
          confidence_band: "high",
        },
      }),
    }),
    deps: {},
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "platform_handoff");
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).mode, "platform_input_coaching");
  assertEquals((runtime.toolSkillRun as any).committed_effects, []);
  assertStringIncludes(runtime.content, "Va dans Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
  assertEquals(
    (runtime.nextTempMemory as any).__adjust_plan_handoff_state.mode,
    "platform_input_coaching",
  );
});

Deno.test("whole-plan-like request does not create executable scope or patch", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message:
        "Je crois que toute la trajectoire est trop lourde, mais je ne veux pas repartir de zéro.",
      routeDecision: { selected_handler: "adjust_plan_item" },
    }),
    deps: {},
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
    deps: {},
  });
  assert(runtime);
  assertEquals((runtime.toolSkillRun as any).status, "revise_draft");
  assertEquals(runtime.executedTools, []);
  assertStringIncludes(runtime.content, "Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("apply attempt never creates confirmation or effect", async () => {
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
    deps: {},
  });
  assert(runtime);
  assertEquals((runtime.toolSkillRun as any).status, "apply_attempt");
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

Deno.test("concurrent explicit operation is not swallowed by active adjust_plan", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context({
      message: "Mets-moi un rappel demain.",
      tempMemory: activeMemory(),
      routeDecision: { selected_handler: "create_one_shot_reminder" },
    }),
    deps: {},
  });
  assertEquals(runtime, null);
});

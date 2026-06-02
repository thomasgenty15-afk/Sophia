import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import {
  __test__handoffFollowupFromStructuredContext,
  maybeRunAdjustPlanItemOperation,
} from "./router.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";

function handoffDraft(): AdjustPlanHandoffDraft {
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    scope: {
      kind: "specific_plan_item",
      target_summary: "Respiration de pause",
    },
    user_goal_summary:
      "tu veux alléger cette action cette semaine sans abandonner l'objectif",
    coaching_read:
      "le bon mouvement est de réduire la charge sans changer la fonction de régulation",
    recommendation: {
      summary: "Alléger l'action cette semaine.",
      recommended_change:
        "réduire Respiration de pause à une version courte de 2 minutes",
      preserve: ["l'objectif global", "les autres actions"],
      avoid: ["changer tout le niveau", "supprimer l'action"],
      platform_destination: "section Plan",
      platform_steps: [
        "Va dans la section Plan.",
        "Ouvre Respiration de pause.",
        "Ajuste seulement la version de cette semaine.",
      ],
    },
    missing_decisions: [],
  };
}

function turnFrame(overrides: Record<string, unknown> = {}) {
  return {
    turn_id: "turn-1",
    source_message_id: "message-1",
    user_id: "user-1",
    channel: "web" as const,
    safety: { risk_band: "none" as const, reason_codes: [], evidence: [] },
    confirmation_response: {
      kind: "unknown" as const,
      confidence_band: "low" as const,
    },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none" as const,
      operation_type: null,
      surface_id: null,
      confidence_band: "low" as const,
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none" as const,
      suggested_question_intent: null,
      offer_timing: "never" as const,
      must_not_execute: true,
    },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal" as const,
      memory_mode: "none" as const,
      context_budget_tier: "tiny" as const,
      targets: [],
      retrieval_policy: "taxonomy_first" as const,
    },
    ...overrides,
  } as any;
}

function baseContext(
  message: string,
  tempMemory: any,
  overrides: Record<string, unknown> = {},
) {
  return {
    userId: "user-1",
    userMessage: message,
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory,
    planItemSnapshot: [],
    turnFrame: turnFrame(),
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" as const },
    sourceMessageId: "message-1",
    requestId: "request-1",
    forceFullAi: true,
    enableAdjustPlanCoachGuidance: true,
    confirmationSecret: "unused",
    ...overrides,
  };
}

function activeMemory() {
  return {
    __adjust_plan_handoff_state: {
      skill_id: "adjust_plan_item",
      mode: "platform_handoff",
      status: "handoff_delivered",
      scope: "specific_plan_item",
      draft: handoffDraft(),
      operation_input: {
        scope: { kind: "specific_plan_item", label: "Respiration de pause" },
      },
      turn_count: 0,
      max_turns: 6,
      created_at: "2026-06-01T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z",
      no_chat_mutation: true,
    },
    __pending_tool_skill_confirmation: {
      operation_type: "adjust_plan_item",
      should_be_removed: true,
    },
    __last_adjust_plan_execution: { should_be_removed: true },
  };
}

Deno.test("adjust_plan handoff renderer contains full platform content", () => {
  const rendered = renderAdjustPlanHandoffDraft(handoffDraft());
  assertStringIncludes(rendered, "Ce que je comprends");
  assertStringIncludes(rendered, "Ma recommandation");
  assertStringIncludes(rendered, "À préserver");
  assertStringIncludes(rendered, "À éviter");
  assertStringIncludes(rendered, "À reprendre dans Plan");
  assertStringIncludes(
    rendered,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas",
  );
  assertEquals(
    rendered.includes("Je ne modifie pas ton plan depuis le chat"),
    false,
  );
  assert(
    !/c['’]?est fait|j['’]?ai modifi|je peux l['’]?appliquer/i.test(rendered),
  );
});

Deno.test("apply_attempt repeats handoff and never executes", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: baseContext("Ok vas-y, applique.", activeMemory(), {
      turnFrame: turnFrame({
        confirmation_response: { kind: "yes", confidence_band: "high" },
      }),
    }),
    deps: {},
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "platform_handoff");
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).status, "apply_attempt");
  assertEquals((runtime.toolSkillRun as any).committed_effects, []);
  assertEquals(
    (runtime.nextTempMemory as any).__pending_tool_skill_confirmation,
    undefined,
  );
  assertEquals(
    (runtime.nextTempMemory as any).__last_adjust_plan_execution,
    undefined,
  );
  assertStringIncludes(runtime.content, "À reprendre dans Plan");
  assertStringIncludes(
    runtime.content,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas",
  );
});

Deno.test("repeat_handoff keeps redis-moi inside adjust_plan handoff", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: baseContext("Redis-moi quoi faire dans Plan.", activeMemory(), {
      turnFrame: turnFrame({
        tool_skill_intents: [{
          operation_type: "adjust_plan_item",
          explicitness: "explicit",
          target_hint: "Redis-moi quoi faire dans Plan.",
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "explain_only",
        }],
      }),
    }),
    deps: {},
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "platform_handoff");
  assertEquals((runtime.toolSkillRun as any).status, "repeat_handoff");
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "adjust_plan_item",
  );
  assertEquals(runtime.executedTools, []);
  assertStringIncludes(runtime.content, "Respiration de pause");
});

Deno.test("revise_handoff updates the recommendation without execution", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: baseContext(
      "Rends ça plus léger : deux mini-actions de 10 minutes cette semaine.",
      activeMemory(),
      {
        turnFrame: turnFrame({
          tool_skill_intents: [{
            operation_type: "adjust_plan_item",
            explicitness: "explicit",
            target_hint:
              "Rends ça plus léger : deux mini-actions de 10 minutes cette semaine.",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "adjust",
          }],
        }),
      },
    ),
    deps: {},
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "platform_handoff");
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).status, "revise_handoff");
  assertEquals((runtime.toolSkillRun as any).committed_effects, []);
  assertEquals(runtime.content.includes("Version révisée demandée"), false);
  assertEquals(runtime.content.includes("avec cette contrainte"), false);
  assertEquals(runtime.content.includes("Rends ça plus léger"), false);
  assertStringIncludes(runtime.content, "deux mini-actions de 10 minutes");
  assertStringIncludes(
    runtime.content,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas",
  );
});

Deno.test("active handoff followup policy consumes structured signals only", () => {
  assertEquals(
    __test__handoffFollowupFromStructuredContext({
      context: baseContext("où le faire dans Plan ?", {}, {
        turnFrame: turnFrame({
          tool_skill_intents: [{
            operation_type: "adjust_plan_item",
            explicitness: "explicit",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "explain_only",
          }],
        }),
      }) as any,
    })?.status,
    "repeat_handoff",
  );
  assertEquals(
    __test__handoffFollowupFromStructuredContext({
      context: baseContext("ok vas-y applique", {}, {
        turnFrame: turnFrame({
          confirmation_response: { kind: "yes", confidence_band: "high" },
        }),
      }) as any,
    })?.status,
    "apply_attempt",
  );
  assertEquals(
    __test__handoffFollowupFromStructuredContext({
      context: baseContext("rends ça plus léger, plutôt cette semaine", {}, {
        turnFrame: turnFrame({
          tool_skill_intents: [{
            operation_type: "adjust_plan_item",
            explicitness: "explicit",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "adjust",
          }],
        }),
      }) as any,
    })?.status,
    "revise_handoff",
  );
  assertEquals(
    __test__handoffFollowupFromStructuredContext({
      context: baseContext("redis-moi quoi faire", {}, {
        turnFrame: turnFrame(),
      }) as any,
    }),
    null,
  );
});

Deno.test("handoff runtime has no executor writer or confirmation token imports", async () => {
  const source = await Deno.readTextFile(
    new URL("./router.ts", import.meta.url),
  );
  assertEquals(source.includes("executeAdjustPlanItem"), false);
  assertEquals(source.includes("writePlanAdjustmentPatch"), false);
  assertEquals(source.includes("createConfirmationToken"), false);
});

Deno.test("handoff runtime does not classify followups from raw message regex", async () => {
  const source = await Deno.readTextFile(
    new URL("./router.ts", import.meta.url),
  );
  assertEquals(source.includes("function handoffIntentFromMessage"), false);
  assertEquals(source.includes("userRequestsCompactHandoff"), false);
  assertEquals(source.includes("userRequestsDestinationOnlyHandoff"), false);
  assertEquals(source.includes("operationInputFromPlanAdjustmentScope"), false);
  assertEquals(source.includes(".test(text)"), false);
  assertEquals(source.includes("normalize(message)"), false);
});

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import { maybeRunAdjustPlanItemOperation } from "./router.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";

function draft(): AdjustPlanHandoffDraft {
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_input_coaching",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_blocker_summary:
      "tu veux garder le signal de pause mais le rendre moins lourd",
    suggested_platform_input:
      "Je veux garder le signal de pause, mais le rendre plus léger cette semaine : une version courte, facile à lancer, sans changer l'objectif global.",
    preserve: ["le signal de pause", "l'objectif global"],
    avoid: ["transformer ça en abandon", "refaire tout le plan"],
    destination: {
      product_area: "Plan",
      instruction:
        "Va dans Plan, ouvre l'élément ou la zone que tu veux ajuster, puis colle cette demande dans l'encart d'ajustement.",
    },
    missing_clarity: [],
  };
}

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

function context(message: string, tempMemory: any, overrides = {}) {
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
    forceFullAi: false,
    enableAdjustPlanCoachGuidance: true,
    confirmationSecret: "unused",
    ...overrides,
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
    __pending_tool_skill_confirmation: { should_be_removed: true },
    __last_adjust_plan_execution: { should_be_removed: true },
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

Deno.test("adjust_plan input coach renderer contains reusable Plan input", () => {
  const rendered = renderAdjustPlanHandoffDraft(draft());
  assertStringIncludes(rendered, "Je veux garder le signal de pause");
  assertStringIncludes(rendered, "Va dans Plan");
  assertNoTemplateLanguage(rendered);
  assertEquals(
    rendered.includes("Je ne modifie pas ton plan depuis le chat"),
    false,
  );
  assertNoExecutionClaim(rendered);
});

Deno.test("apply_attempt never executes and repeats Plan destination", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context("Ok vas-y, applique.", activeMemory(), {
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
  assertStringIncludes(runtime.content, "Va dans Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("repeat_draft keeps redis-moi inside adjust_plan", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context("Redis-moi quoi coller dans Plan.", activeMemory(), {
      turnFrame: turnFrame({
        tool_skill_intents: [{
          operation_type: "adjust_plan_item",
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
  assertEquals((runtime.toolSkillRun as any).status, "repeat_draft");
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "adjust_plan_item",
  );
  assertEquals(runtime.executedTools, []);
  assertStringIncludes(runtime.content, "Je veux garder le signal de pause");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("active product_help-looking Plan followup does not steal ownership", async () => {
  const runtime = await maybeRunAdjustPlanItemOperation({
    context: context(
      "Redis-moi exactement quoi faire dans Plan.",
      activeMemory(),
      {
        routeDecision: {
          selected_handler: "product_help",
          response_owner: "product_help",
        } as any,
        turnFrame: turnFrame(),
      },
    ),
    deps: {},
  });
  assert(runtime);
  assertEquals(
    (runtime.toolSkillRun as any).selected_handler,
    "adjust_plan_item",
  );
  assertEquals(runtime.executedTools, []);
  assertStringIncludes(runtime.content, "Plan");
  assertNoTemplateLanguage(runtime.content);
  assertNoExecutionClaim(runtime.content);
});

Deno.test("router has no executor writer or confirmation token imports", async () => {
  const source = await Deno.readTextFile(
    new URL("./router.ts", import.meta.url),
  );
  assertEquals(source.includes("executeAdjustPlanItem"), false);
  assertEquals(source.includes("writePlanAdjustmentPatch"), false);
  assertEquals(source.includes("createConfirmationToken"), false);
  assertEquals(source.includes("runAdjustPlanItemIntake"), false);
  assertEquals(source.includes("renderAdjustPlanHandoffDraft"), false);
  assertEquals(source.includes("writeAdjustPlanPlatformInputReply"), true);
});

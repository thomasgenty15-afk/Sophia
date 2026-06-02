import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runCreateRecurringReminderIntake } from "./intake.ts";
import {
  maybeRunCreateRecurringReminderOperation,
  normalizeDispatcherRecurringOperationInput,
} from "./router.ts";
import { renderRecurringReminderPlatformHandoff } from "./renderer.ts";
import { structuredRecurringReminderSlotFiller } from "./test_helpers.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

function routeDecision() {
  return {
    response_owner: "tool_skill",
    selected_handler: "create_recurring_reminder",
    reason_code: "test",
    direct_effects_to_run: [],
    blocked_paths: [],
  } as any;
}

function baseRuntime(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Crée-moi un rappel tous les lundis à 9h pour préparer ma semaine.",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: routeDecision(),
    safetyPregateOutput: { risk_band: "none" as const },
    sourceMessageId: "m1",
    requestId: "r1",
    buildPlatformContext: () => ({}),
    ...overrides,
  };
}

function fullIntakeOutput(message = "préparer ma semaine", time = "09:00") {
  return runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "tous les lundis à 9h",
    trigger_message_id: "m-intake",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "weekly",
      days: ["lundi"],
      time,
      message,
    }),
  });
}

Deno.test("create_recurring_reminder handoff produces full renderer content", async () => {
  const output = await fullIntakeOutput();
  assertEquals(output.status, "handoff_ready");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.handoff_draft?.no_chat_mutation, true);
  assertEquals(output.handoff_draft?.executable_from_chat, false);

  const content = renderRecurringReminderPlatformHandoff({
    handoffDraft: output.handoff_draft,
  });
  assertEquals(content.includes("préparer ma semaine"), true);
  assertEquals(content.includes("chaque semaine, le lundi"), true);
  assertEquals(content.includes("09:00, Europe/Paris"), true);
  assertEquals(
    content.includes(
      `${
        getHandoffTargetForOperation("create_recurring_reminder")
          ?.user_facing_destination
      }`,
    ),
    true,
  );
  assertEquals(
    content.includes("Je ne crée pas de rappel récurrent depuis le chat."),
    true,
  );
  assertEquals(content.includes("Version à reprendre"), false);
  assertEquals(content.includes("Contenu :"), false);
  assertEquals(content.includes("Cadence :"), false);
  assertEquals(content.includes("Destination plateforme"), false);
  assertEquals(content.includes("c'est programmé"), false);
  assertEquals(content.includes("j'ai créé"), false);
  assertEquals(content.includes("je te relancerai"), false);
});

Deno.test("create_recurring_reminder router delivers handoff and never creates executable confirmation", async () => {
  let writes = 0;
  const output = await fullIntakeOutput();
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => output,
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-never" };
    },
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(writes, 0);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__pending_tool_skill_confirmation),
    false,
  );
  assertEquals(
    runtime?.nextTempMemory.__recurring_reminder_handoff_state
      ?.no_chat_mutation,
    true,
  );
  assertEquals(
    (runtime?.toolSkillRun.platform_handoff as any)?.draft
      ?.operation_type,
    "create_recurring_reminder",
  );
});

Deno.test("create_recurring_reminder apply_attempt does not execute and repeats platform destination", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => await fullIntakeOutput(),
  }));
  let writes = 0;
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "ok programme-le",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runHandoffClarification: async () => ({
      status: "resolved",
      selected_candidate_id: "apply_attempt",
      confidence: "high",
    }),
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-never" };
    },
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(writes, 0);
  assertEquals(runtime?.toolSkillRun.status, "apply_attempt");
  assertEquals(runtime?.content.includes("Rappels"), true);
  assertEquals(runtime?.content.includes("Destination plateforme"), false);
  assertEquals(
    runtime?.content.includes(
      "Je ne crée pas de rappel récurrent depuis le chat.",
    ),
    true,
  );
});

Deno.test("create_recurring_reminder active route apply_attempt bypasses clarification and repeats draft", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => await fullIntakeOutput(),
  }));
  let clarificationCalls = 0;
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "ok programme-le",
    tempMemory: initial?.nextTempMemory,
    routeDecision: {
      ...routeDecision(),
      reason_code: "active_handoff_apply_attempt",
    },
    runHandoffClarification: async () => {
      clarificationCalls++;
      return {
        status: "ask",
        question: "should not ask",
        confidence: "low",
      };
    },
  }));

  assertEquals(clarificationCalls, 0);
  assertEquals(runtime?.toolSkillRun.status, "apply_attempt");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.content.includes("Rappels"), true);
  assertEquals(runtime?.content.includes("Destination plateforme"), false);
});

Deno.test("create_recurring_reminder repeat_handoff repeats platform draft", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => await fullIntakeOutput(),
  }));
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "redis-moi quoi mettre",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runHandoffClarification: async () => ({
      status: "resolved",
      selected_candidate_id: "repeat_handoff",
      confidence: "high",
    }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.toolSkillRun.status, "repeat_handoff");
  assertEquals(runtime?.content.includes("préparer ma semaine"), true);
  assertEquals(runtime?.content.includes("Rappels"), true);
});

Deno.test("create_recurring_reminder revise_handoff updates cadence time and content", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => await fullIntakeOutput(),
  }));
  const revised = await fullIntakeOutput("faire le point prioritaire", "08:30");
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage:
      "plutôt tous les lundis à 8h30 pour faire le point prioritaire",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runHandoffClarification: async () => ({
      status: "resolved",
      selected_candidate_id: "revise_handoff",
      confidence: "high",
    }),
    runIntake: async () => revised,
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.toolSkillRun.status, "revise_handoff");
  assertEquals(runtime?.content.includes("faire le point prioritaire"), true);
  assertEquals(runtime?.content.includes("08:30"), true);
});

Deno.test("create_recurring_reminder normalizes dispatcher recurrence strings", () => {
  assertEquals(
    normalizeDispatcherRecurringOperationInput({
      recurrence: "tous les vendredis",
      time: "17h",
      message: "envoyer mon bilan rapide",
    }),
    {
      frequency: "weekly",
      days: ["vendredi"],
      time: "17h",
      message: "envoyer mon bilan rapide",
    },
  );
});

Deno.test("create_recurring_reminder preserves biweekly cadence in handoff summary", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Prépare un rappel récurrent toutes les deux semaines le mardi à 18h30 pour envoyer mon résumé d’équipe.",
    trigger_message_id: "m-biweekly",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "custom",
      days: ["mardi"],
      time: "18:30",
      cadence_label: "toutes les deux semaines, mardi",
      message: "envoyer mon résumé d’équipe",
    }),
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(
    output.handoff_draft?.cadence_summary,
    "toutes les deux semaines, mardi",
  );
});

Deno.test("create_recurring_reminder initial ambiguity delegates to structured intake", async () => {
  let intakeCalls = 0;
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage:
      "Je veux que Sophia me relance demain matin, ou peut-être tous les matins à 8h, je ne sais pas encore. Le contenu exact: choisir ma priorité du jour.",
    runIntake: async () => {
      intakeCalls++;
      return await runCreateRecurringReminderIntake({
        user_id: "u1",
        channel: "web",
        timezone: "Europe/Paris",
        message:
          "Je veux que Sophia me relance demain matin, ou peut-être tous les matins à 8h, je ne sais pas encore.",
        trigger_message_id: "m-ambiguous-runtime",
        safety_pregate_risk_band: "none",
        slot_filler: structuredRecurringReminderSlotFiller({
          frequency: null,
          time: "08:00",
          message: "choisir ma priorité du jour",
          missing_slots: ["frequency"],
          generated_user_message:
            "Tu veux un rappel ponctuel demain matin ou un rappel récurrent tous les matins ?",
          user_intent: "clarify",
        }),
      });
    },
  }));

  assertEquals(intakeCalls, 1);
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.toolSkillRun.status, "collecting");
  assertEquals(
    runtime?.content.includes("ponctuel") &&
      runtime?.content.includes("récurrent"),
    true,
  );
});

Deno.test("create_recurring_reminder draft_only no_create cannot create pending executable", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "fais juste un brouillon tous les jours à 18h de respirer",
    trigger_message_id: "m-draft-only",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: "respirer",
      user_intent: "draft_only",
      constraints: [{
        kind: "draft_only",
        evidence: ["test"],
      }, {
        kind: "no_create",
        evidence: ["test"],
      }],
    }),
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.handoff_draft?.no_chat_mutation, true);
});

Deno.test("create_recurring_reminder one-shot clarification exits to one-shot owner", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runIntake: async () => await fullIntakeOutput(),
  }));
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "non finalement juste demain matin",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runHandoffClarification: async () => ({
      status: "resolved",
      selected_candidate_id: "handoff_to_one_shot",
      confidence: "high",
    }),
  }));

  assertEquals(runtime?.toolExecution, "none");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.toolSkillRun.status, "handoff_to_one_shot");
  assertEquals(
    Boolean(runtime?.nextTempMemory.__recurring_reminder_handoff_state),
    false,
  );
});

Deno.test("create_recurring_reminder ambiguous one-shot recurring wording asks clarification", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "demain matin ou peut-être tous les matins",
    trigger_message_id: "m-ambiguous",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: null,
      time: null,
      message: "me relancer",
      missing_slots: ["frequency", "time"],
      generated_user_message:
        "Tu veux un rappel ponctuel demain matin ou un rappel récurrent tous les matins ?",
      user_intent: "clarify",
    }),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.draft, undefined);
});

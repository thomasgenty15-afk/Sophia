import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeCreateRecurringReminder } from "./executor.ts";
import { buildRecurringReminderCreatedMessage } from "./generator.ts";
import {
  type CreateRecurringReminderSlotFiller,
  runCreateRecurringReminderIntake,
} from "./intake.ts";
import { maybeRunCreateRecurringReminderOperation } from "./router.ts";
import { renderRecurringReminderExecuted } from "./renderer.ts";
import { structuredRecurringReminderSlotFiller } from "./test_helpers.ts";

const SECRET = "s5-test-secret";
type Scenario = {
  name: string;
  message: string;
  expected: string;
  source?: "direct_user_request" | "recommendation_tool";
  operation_input?: Record<string, unknown>;
  platform_context?: Record<string, unknown>;
  expectedMessage?: string;
  expectedDays?: string[];
  slot_filler?: CreateRecurringReminderSlotFiller;
};

Deno.test("create_recurring_reminder pipeline covers structured intake scenarios", async () => {
  const writes: unknown[] = [];
  const scenarios: Scenario[] = [
    {
      name: "daily-morning",
      message: "rappelle-moi tous les matins de faire ma marche",
      expected: "pending_confirmation",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "09:00",
        message: "faire ma marche",
      }),
    },
    {
      name: "daily-time",
      message: "rappelle-moi tous les jours a 18h de faire une pause",
      expected: "pending_confirmation",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "18:00",
        message: "faire une pause",
      }),
    },
    {
      name: "daily-ritual-natural",
      message:
        "mets-moi un petit rituel quotidien : noter une idée chaque soir vers 21h",
      expected: "pending_confirmation",
      expectedMessage: "noter une idée",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "21:00",
        message: "noter une idée",
      }),
    },
    {
      name: "confirmation-cleanup",
      message: "A, tous les jours. Oui, valide-le pour 21h : noter une idée.",
      expected: "pending_confirmation",
      expectedMessage: "noter une idée",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "21:00",
        message: "noter une idée",
      }),
    },
    {
      name: "quoted-message-cleanup",
      message:
        "Je viens de le dire : chaque lundi à 9h, message 'Quelle est la prochaine petite action ?'.",
      expected: "pending_confirmation",
      expectedMessage: "Quelle est la prochaine petite action ?",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "Quelle est la prochaine petite action ?",
      }),
    },
    {
      name: "correction-keeps-message-and-overrides-day",
      message:
        "Démarre la semaine prochaine, mais pas lundi finalement : chaque mercredi à 18h, même message.",
      operation_input: {
        frequency: "weekly",
        days: ["lundi"],
        time: "08:00",
        message: "Choisir un pas minuscule",
      },
      expected: "pending_confirmation",
      expectedMessage: "Choisir un pas minuscule",
      expectedDays: ["mercredi"],
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "weekly",
        days: ["mercredi"],
        time: "18:00",
        message: "Choisir un pas minuscule",
      }),
    },
    {
      name: "missing-content",
      message: "rappelle-moi tous les jours",
      expected: "ask_question",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "09:00",
        message: null,
        generated_user_message: "Tu veux que je te rappelle quoi exactement ?",
      }),
    },
    {
      name: "recommendation-full",
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: {
        frequency: "daily",
        time: "09:00",
        message: "regarder mon plan",
      },
      expected: "pending_confirmation",
    },
    {
      name: "recommendation-missing-time",
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: { frequency: "daily", message: "regarder mon plan" },
      expected: "invalid_recommendation_payload",
    },
  ];
  assertEquals(scenarios.length, 9);
  for (const scenario of scenarios) {
    const output = await runCreateRecurringReminderIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      source: scenario.source,
      trigger_message_id: `m-${scenario.name}`,
      safety_pregate_risk_band: "none",
      operation_input: scenario.operation_input,
      slot_filler: scenario.slot_filler,
      platform_context: scenario.platform_context,
    });
    assertEquals(output.status, scenario.expected, scenario.name);
    if (output.status === "pending_confirmation") {
      if (scenario.expectedMessage) {
        assertEquals(output.draft?.draft.message, scenario.expectedMessage);
      }
      if (scenario.expectedDays) {
        assertEquals(output.draft?.draft.days, scenario.expectedDays);
      }
      resetConsumedConfirmationTokensForTest();
      const token = await createConfirmationToken({
        user_id: "u1",
        operation_id: String(output.pending_confirmation?.operation_id),
        operation_type: "create_recurring_reminder",
        draft: output.draft,
        source_message_id: `yes-${scenario.name}`,
        pending_confirmation_id: `pending-${scenario.name}`,
        secret: SECRET,
      });
      const executed = await executeCreateRecurringReminder({
        operation_id: String(output.pending_confirmation?.operation_id),
        user_id: "u1",
        draft: output.draft!,
        token,
        safety_pregate_risk_band: "none",
        pending_confirmation_lookup: async () => ({ consumed: false }),
        token_consumption_check: async (tokenId) =>
          hasConsumedConfirmationTokenForTest(tokenId),
        write_recurring_reminder: async (draft) => {
          writes.push(draft);
          return { recurring_reminder_id: `rr-${writes.length}` };
        },
        secret: SECRET,
      });
      assertEquals(executed.status, "executed", scenario.name);
      assertEquals(executed.ack.includes("modifier"), true);
      assertEquals(executed.ack.includes("annuler"), true);
      assertEquals(executed.ack.includes("Initiatives"), true);
    }
  }
});

Deno.test("create_recurring_reminder normalizes non-habit action_family draft to plan_item", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Rappelle-moi mercredi à 18h pour l'action Partager un point positif.",
    trigger_message_id: "m-action-family-normalization",
    safety_pregate_risk_band: "none",
    platform_context: {
      plan_items: [{
        id: "plan-item-positive",
        title: "Partager un point positif",
        kind: "task",
        item_nature: null,
      }],
    },
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      user_intent: "start",
      constraints: [{
        kind: "recurring_only",
        evidence: ["test"],
      }],
      handoff_target: null,
      state_patch: {
        user_intent: "start",
        constraints: [{
          kind: "recurring_only",
          evidence: ["test"],
        }],
        handoff_target: null,
        recurrence: {
          status: "identified",
          frequency: "weekly",
          days: ["mercredi"],
          time: "18:00",
          timezone: "Europe/Paris",
          confidence: "high",
          evidence: ["test"],
        },
        reminder_content: {
          status: "identified",
          message: "C'est le moment de partager un point positif",
          subject_hint: "Partager un point positif",
          confidence: "high",
          evidence: ["test"],
        },
        destination: {
          status: "identified",
          value: "current_plan",
          related_plan_item_id: "plan-item-positive",
          target_kind: "action_family",
          target_plan_item_id: "plan-item-positive",
          target_action_family_key: "task:partager_point_positif",
          target_generated_temp_id: null,
          target_binding_policy: "live_action_family",
          target_lifecycle_policy: "while_family_in_current_plan",
          target_label: "Partager un point positif",
          confidence: "high",
          evidence: ["test"],
        },
        draft_messages: {
          confirmation_message:
            "Je te le rappellerai tant que cette famille d'habitude reste active dans ton plan. On valide ?",
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["test"],
    }),
  });

  if (output.status !== "pending_confirmation") {
    throw new Error("expected_pending_confirmation");
  }
  assertEquals(output.draft?.draft.target_binding?.target_kind, "plan_item");
  assertEquals(
    output.draft?.draft.target_binding?.binding_policy,
    "live_action",
  );
  assertEquals(
    output.draft?.draft.target_binding?.lifecycle_policy,
    "while_target_active",
  );
  assertEquals(
    output.confirmation?.message.includes("famille d'habitude"),
    false,
  );
  assertEquals(output.confirmation?.message.includes("cette action"), true);
});

Deno.test("create_recurring_reminder does not fallback-parse when structured intake fails", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours a 18h de faire une pause",
    trigger_message_id: "m-no-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
  });
  assertEquals(output.status, "technical_error");
  assertEquals(output.state_patch.operation_input, undefined);
});

Deno.test("create_recurring_reminder created message points to the right management surface", () => {
  const baseDraft = {
    operation_type: "create_recurring_reminder" as const,
    output_schema: "recurring_reminder_draft_v1" as const,
    draft: {
      title: "Rappel récurrent : phrase stoïcienne",
      message: "Une phrase stoïcienne",
      frequency: "daily" as const,
      time: "07:30",
      timezone: "Europe/Paris",
      destination: "base_de_vie" as const,
      related_plan_item_id: null,
    },
    confirmation_message: "Tu veux que je le crée ?",
    confirmation_actions: ["yes", "no"] as ["yes", "no"],
  };
  const baseMessage = buildRecurringReminderCreatedMessage(baseDraft);
  assertEquals(baseMessage.includes("modifier"), true);
  assertEquals(baseMessage.includes("annuler"), true);
  assertEquals(baseMessage.includes("plateforme"), true);
  assertEquals(baseMessage.includes("Base de vie"), true);
  assertEquals(baseMessage.includes("Initiatives et rappels"), true);

  const planMessage = buildRecurringReminderCreatedMessage({
    ...baseDraft,
    draft: {
      ...baseDraft.draft,
      destination: "current_plan",
      related_plan_item_id: "plan-item-1",
      target_binding: {
        target_kind: "plan_item",
        target_plan_item_id: "plan-item-1",
        target_action_family_key: null,
        target_generated_temp_id: null,
        binding_policy: "live_action",
        lifecycle_policy: "while_target_active",
        target_label: "Partager un point positif",
      },
    },
  });
  assertEquals(planMessage.includes("modifier"), true);
  assertEquals(planMessage.includes("annuler"), true);
  assertEquals(planMessage.includes("plateforme"), true);
  assertEquals(planMessage.includes("Initiatives du plan"), true);
  assertEquals(planMessage.includes("tant qu'elle reste active"), true);
});

Deno.test("create_recurring_reminder executor blocks missing, expired, mismatch and double consume tokens", async () => {
  resetConsumedConfirmationTokensForTest();
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours a 18h de faire une pause",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: "faire une pause",
    }),
  });
  if (output.status !== "pending_confirmation") {
    throw new Error("expected_pending_confirmation");
  }
  const draft = output.draft;
  if (!draft) throw new Error("expected_draft");
  let writes = 0;
  const base = {
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    draft,
    safety_pregate_risk_band: "none" as const,
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId: string) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_recurring_reminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr" };
    },
    secret: SECRET,
  };
  assertEquals((await executeCreateRecurringReminder(base)).status, "blocked");
  const expired = await createConfirmationToken({
    user_id: "u1",
    operation_id: base.operation_id,
    operation_type: "create_recurring_reminder",
    draft,
    source_message_id: "yes",
    pending_confirmation_id: "pending",
    now_iso: "2026-01-01T00:00:00.000Z",
    ttl_ms: 1,
    secret: SECRET,
  });
  assertEquals(
    (await executeCreateRecurringReminder({
      ...base,
      token: expired,
      now_iso: "2026-01-01T00:00:01.000Z",
    })).status,
    "blocked",
  );
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: base.operation_id,
    operation_type: "create_recurring_reminder",
    draft,
    source_message_id: "yes",
    pending_confirmation_id: "pending",
    secret: SECRET,
  });
  assertEquals(
    (await executeCreateRecurringReminder({
      ...base,
      token,
      draft: { ...output.draft!, confirmation_message: "changed" },
    })).status,
    "blocked",
  );
  assertEquals(
    (await executeCreateRecurringReminder({ ...base, token })).status,
    "executed",
  );
  assertEquals(
    (await executeCreateRecurringReminder({ ...base, token })).status,
    "blocked",
  );
  assertEquals(writes, 1);
});

Deno.test("create_recurring_reminder hands one-shot wording off without draft", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "rappelle-moi demain à 9h",
    trigger_message_id: "m-one-shot",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: null,
      time: "09:00",
      message: "rappel ponctuel",
      user_intent: "one_shot_handoff",
      handoff_target: "create_one_shot_reminder",
      generated_user_message:
        "Ce rappel est ponctuel, je laisse le rappel ponctuel s'en charger.",
    }),
  });
  assertEquals(output.status, "handoff_to_one_shot");
  assertEquals(output.draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(
    output.state_patch.intake_state?.handoff_target,
    "create_one_shot_reminder",
  );
});

Deno.test("create_recurring_reminder recurring wording continues to pending confirmation", async () => {
  const output = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours à 18h de respirer",
    trigger_message_id: "m-recurring",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: "respirer",
    }),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.frequency, "daily");
  assertEquals(output.draft?.draft.message, "respirer");
});

Deno.test("create_recurring_reminder asks for missing time or content", async () => {
  const missingTime = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "chaque mardi",
    trigger_message_id: "m-missing-time",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "weekly",
      days: ["mardi"],
      time: null,
      message: "faire le point",
      generated_user_message: "À quelle heure ?",
    }),
  });
  assertEquals(missingTime.status, "ask_question");
  assertEquals(missingTime.state_patch.missing_slots, ["time"]);

  const missingContent = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "tous les jours à 18h",
    trigger_message_id: "m-missing-content",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: null,
      generated_user_message: "Tu veux que je te rappelle quoi ?",
    }),
  });
  assertEquals(missingContent.status, "ask_question");
  assertEquals(missingContent.state_patch.missing_slots, ["message"]);
});

function pendingRecurringFixture(
  operationId = `op-recurring-test-${crypto.randomUUID()}`,
) {
  return {
    operation_id: operationId,
    operation_type: "create_recurring_reminder" as const,
    draft: {
      operation_type: "create_recurring_reminder" as const,
      output_schema: "recurring_reminder_draft_v1" as const,
      draft: {
        title: "Rappel récurrent : respirer",
        message: "respirer",
        frequency: "daily" as const,
        days: [],
        time: "18:00",
        timezone: "Europe/Paris",
        destination: "base_de_vie" as const,
        related_plan_item_id: null,
        target_binding: null,
      },
      confirmation_message:
        "Je te propose de créer ce rappel récurrent. Tu veux que je le crée ?",
      confirmation_actions: ["yes", "no"] as ["yes", "no"],
    },
  };
}

Deno.test("create_recurring_reminder router approve executes only through executor writer", async () => {
  resetConsumedConfirmationTokensForTest();
  let writes = 0;
  const pending = pendingRecurringFixture("op-recurring-approve");
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "ok crée-le",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: { __pending_tool_skill_confirmation: pending },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-approve",
    requestId: "r-approve",
    buildPlatformContext: () => ({}),
    reviewDraft: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["test"],
    }),
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-1" };
    },
  });
  assertEquals(runtime?.toolExecution, "success");
  assertEquals(runtime?.toolSkillRun.status, "executed");
  assertEquals(runtime?.executedTools, ["create_recurring_reminder"]);
  assertEquals(runtime?.committedEffects.length, 1);
  assertEquals(runtime?.committedEffects[0].recurring_reminder_id, "rr-1");
  assertEquals(
    (runtime?.toolSkillRun.committed_effects as any[])?.[0]
      ?.recurring_reminder_id,
    "rr-1",
  );
  assertEquals(writes, 1);
  resetConsumedConfirmationTokensForTest();
});

Deno.test("create_recurring_reminder router revise explain and reject do not execute", async () => {
  for (
    const decision of [
      ["revise", "draft_review_updated"],
      ["explain", "draft_review_details"],
      ["reject", "cancelled"],
    ] as const
  ) {
    resetConsumedConfirmationTokensForTest();
    let writes = 0;
    const pending = pendingRecurringFixture(`op-recurring-${decision[0]}`);
    const runtime = await maybeRunCreateRecurringReminderOperation({
      supabase: {} as any,
      userId: "u1",
      userMessage: decision[0] === "revise"
        ? "change l'heure à 19h"
        : decision[0] === "reject"
        ? "non finalement"
        : "explique",
      channel: "web",
      userTimezone: "Europe/Paris",
      tempMemory: {
        __pending_tool_skill_confirmation: pending,
      },
      turnFrame: null,
      routeDecision: null,
      safetyPregateOutput: { risk_band: "none" },
      sourceMessageId: `m-${decision[0]}`,
      requestId: `r-${decision[0]}`,
      buildPlatformContext: () => ({}),
      reviewDraft: async () => ({
        decision: decision[0],
        confidence: "high",
        evidence: ["test"],
        generated_user_message: decision[0] === "reject"
          ? "Ok, je ne crée pas ce rappel."
          : "D'accord.",
      }),
      runIntake: async () => ({
        operation_type: "create_recurring_reminder",
        status: "pending_confirmation",
        source: "direct_user_request",
        phase: "confirmation",
        draft: {
          ...pending.draft,
          draft: {
            ...pending.draft.draft,
            time: "19:00",
          },
        },
        confirmation: {
          required: true,
          message: "J'ai mis à jour l'heure à 19:00. Tu valides ?",
          actions: ["yes", "no"],
        },
        pending_confirmation: {
          operation_id: "op-revised",
          operation_type: "create_recurring_reminder",
          source: "direct_user_request",
          summary: "Rappel récurrent : respirer",
          draft: pending.draft,
          expires_after_turns: 2,
        },
        state_patch: {
          summary: "revised",
          phase: "confirmation",
          missing_slots: [],
          turn_count_increment: 1,
        },
      }),
      writeRecurringReminder: async () => {
        writes++;
        return { recurring_reminder_id: "rr-never" };
      },
    });
    assertEquals(runtime?.toolSkillRun.status, decision[1]);
    assertEquals(runtime?.toolExecution === "success", false);
    assertEquals(runtime?.committedEffects, []);
    assertEquals(writes, 0);
  }
});

Deno.test("create_recurring_reminder write failure is not marked executed", async () => {
  resetConsumedConfirmationTokensForTest();
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "ok crée-le",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: pendingRecurringFixture(
        "op-recurring-write-failure",
      ),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-write-failure",
    requestId: "r-write-failure",
    buildPlatformContext: () => ({}),
    reviewDraft: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["test"],
    }),
    writeRecurringReminder: async () => {
      throw new Error("db_write_failed_for_test");
    },
  });
  assertEquals(runtime?.toolExecution, "failed");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(
    (runtime?.toolSkillRun.committed_effects as any[])?.length ?? 0,
    0,
  );
  assertEquals(runtime?.content.includes("C'est fait"), false);
  resetConsumedConfirmationTokensForTest();
});

Deno.test("create_recurring_reminder executor blocked invalid draft is not marked executed", async () => {
  resetConsumedConfirmationTokensForTest();
  let writes = 0;
  const pending = pendingRecurringFixture("op-recurring-invalid-draft") as any;
  pending.draft = {
    ...pending.draft,
    draft: {
      ...pending.draft.draft,
      message: "",
    },
  };
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "ok crée-le",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: { __pending_tool_skill_confirmation: pending },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-invalid-draft",
    requestId: "r-invalid-draft",
    buildPlatformContext: () => ({}),
    reviewDraft: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["test"],
    }),
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-never" };
    },
  });
  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(writes, 0);
  resetConsumedConfirmationTokensForTest();
});

Deno.test("create_recurring_reminder draft_only and no_create do not create executable pending confirmation", async () => {
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
  assertEquals(output.status, "draft_ready");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.confirmation, undefined);

  let writes = 0;
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "fais juste un brouillon tous les jours à 18h de respirer",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "create_recurring_reminder",
      reason_code: "test",
      direct_effects_to_run: [],
      blocked_paths: [],
    } as any,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-draft-only-router",
    requestId: "r-draft-only-router",
    buildPlatformContext: () => ({}),
    runIntake: async () => output,
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-never" };
    },
  });
  assertEquals(runtime?.toolSkillRun.status, "draft_ready");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__pending_tool_skill_confirmation),
    false,
  );
  assertEquals(writes, 0);
});

Deno.test("create_recurring_reminder active intake cancel clears frame without write", async () => {
  let writes = 0;
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "annule finalement",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "create_recurring_reminder",
        operation_input: { frequency: "daily" },
        turn_count: 1,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-active-cancel",
    requestId: "r-active-cancel",
    buildPlatformContext: () => ({}),
    runIntake: async () => ({
      operation_type: "create_recurring_reminder",
      status: "cancelled",
      source: "direct_user_request",
      phase: "exit",
      ack: "Ok, je ne crée pas ce rappel.",
      state_patch: {
        summary: "cancelled",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    }),
    writeRecurringReminder: async () => {
      writes++;
      return { recurring_reminder_id: "rr-never" };
    },
  });
  assertEquals(runtime?.toolSkillRun.status, "cancelled");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__active_tool_skill_intake),
    false,
  );
  assertEquals(writes, 0);
});

Deno.test("create_recurring_reminder active one-shot wording hands off and clears frame", async () => {
  const runtime = await maybeRunCreateRecurringReminderOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "rappelle-moi demain à 9h de payer",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "create_recurring_reminder",
        operation_input: { frequency: "daily" },
        turn_count: 1,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" },
    sourceMessageId: "m-active-one-shot",
    requestId: "r-active-one-shot",
    buildPlatformContext: () => ({}),
    slotFiller: undefined as never,
    runIntake: async () => ({
      operation_type: "create_recurring_reminder",
      status: "handoff_to_one_shot",
      source: "direct_user_request",
      phase: "exit",
      ack: "Ce rappel est ponctuel.",
      state_patch: {
        summary: "handoff",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        intake_state: {
          skill_id: "create_recurring_reminder",
          current_sub_skill: "recurrence_resolution",
          user_intent: "one_shot_handoff",
          constraints: [],
          handoff_target: "create_one_shot_reminder",
          recurrence: {
            status: "missing",
            frequency: null,
            days: [],
            time: null,
            timezone: "Europe/Paris",
            confidence: "low",
            evidence: [],
          },
          reminder_content: {
            status: "missing",
            message: null,
            subject_hint: null,
            confidence: "low",
            evidence: [],
          },
          destination: {
            status: "missing",
            value: "base_de_vie",
            related_plan_item_id: null,
            target_kind: "none",
            target_plan_item_id: null,
            target_action_family_key: null,
            target_generated_temp_id: null,
            target_binding_policy: "none",
            target_lifecycle_policy: "independent",
            target_label: null,
            confidence: "low",
            evidence: [],
          },
          draft_messages: {},
          missing_slots: [],
          generated_user_message: null,
          confidence: "low",
        },
      },
    }),
  } as any);
  assertEquals(runtime?.toolSkillRun.status, "handoff_to_one_shot");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__active_tool_skill_intake),
    false,
  );
});

Deno.test("create_recurring_reminder renderer cannot say created without committed effects", () => {
  const message = renderRecurringReminderExecuted({
    draft: pendingRecurringFixture("op-renderer").draft,
    committedEffects: [],
  });
  assertEquals(message.includes("C'est fait"), false);
  assertEquals(message.includes("J'ai créé"), false);
});

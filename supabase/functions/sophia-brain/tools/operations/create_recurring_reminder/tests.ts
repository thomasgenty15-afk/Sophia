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
      state_patch: {
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

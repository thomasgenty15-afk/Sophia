import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeCreateRecurringReminder } from "./executor.ts";
import { runCreateRecurringReminderIntake } from "./intake.ts";

const SECRET = "s5-test-secret";

Deno.test("create_recurring_reminder pipeline covers 5 scenarios", async () => {
  const writes: unknown[] = [];
  const scenarios = [
    {
      name: "daily-morning",
      message: "rappelle-moi tous les matins de faire ma marche",
      expected: "pending_confirmation",
    },
    {
      name: "daily-time",
      message: "rappelle-moi tous les jours a 18h de faire une pause",
      expected: "pending_confirmation",
    },
    {
      name: "daily-ritual-natural",
      message:
        "mets-moi un petit rituel quotidien : noter une idée chaque soir vers 21h",
      expected: "pending_confirmation",
      expectedMessage: "noter une idée",
    },
    {
      name: "confirmation-cleanup",
      message: "A, tous les jours. Oui, valide-le pour 21h : noter une idée.",
      expected: "pending_confirmation",
      expectedMessage: "noter une idée",
    },
    {
      name: "quoted-message-cleanup",
      message:
        "Je viens de le dire : chaque lundi à 9h, message 'Quelle est la prochaine petite action ?'.",
      expected: "pending_confirmation",
      expectedMessage: "Quelle est la prochaine petite action ?",
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
    },
    {
      name: "missing-content",
      message: "rappelle-moi tous les jours",
      expected: "ask_question",
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
    const output = runCreateRecurringReminderIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      source: scenario.source,
      trigger_message_id: `m-${scenario.name}`,
      safety_pregate_risk_band: "none",
      operation_input: scenario.operation_input,
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
      assertEquals(executed.ack.includes("sophia-coach.ai"), true);
    }
  }
});

Deno.test("create_recurring_reminder executor blocks missing, expired, mismatch and double consume tokens", async () => {
  resetConsumedConfirmationTokensForTest();
  const output = runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours a 18h de faire une pause",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
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

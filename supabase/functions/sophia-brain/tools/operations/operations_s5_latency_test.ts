import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../confirmation/confirmation_token.ts";
import { executeCreateRecurringReminder } from "./create_recurring_reminder/executor.ts";
import { runCreateRecurringReminderIntake } from "./create_recurring_reminder/intake.ts";
import { structuredRecurringReminderSlotFiller } from "./create_recurring_reminder/test_helpers.ts";
import { executePrepareAttackCard } from "./prepare_attack_card/executor.ts";
import { runPrepareAttackCardAiIntake } from "./prepare_attack_card/ai_intake.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./prepare_attack_card/test_helpers.ts";

const SECRET = "s5-test-secret";

Deno.test("S5 operations latency smoke measures intake to generator to ack under 4s average", async () => {
  const started = Date.now();
  let completed = 0;

  resetConsumedConfirmationTokensForTest();
  const recurring = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours a 18h de faire une pause",
    trigger_message_id: "latency-recurring",
    safety_pregate_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: "faire une pause",
    }),
  });
  const recurringRuntime = recurring as any;
  if (recurringRuntime.status !== "pending_confirmation") {
    throw new Error("recurring_not_ready");
  }
  const recurringToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(recurringRuntime.pending_confirmation?.operation_id),
    operation_type: "create_recurring_reminder",
    draft: recurringRuntime.draft,
    source_message_id: "yes-recurring",
    pending_confirmation_id: "pending-recurring",
    secret: SECRET,
  });
  assertEquals(
    (await executeCreateRecurringReminder({
      operation_id: String(recurringRuntime.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: recurringRuntime.draft!,
      token: recurringToken,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_recurring_reminder: async () => ({ recurring_reminder_id: "rr" }),
      secret: SECRET,
    })).status,
    "executed",
  );
  completed++;

  resetConsumedConfirmationTokensForTest();
  const attack = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque pour ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "latency-attack",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: structuredAttackCardDraftGenerator,
  });
  if (attack.status !== "pending_confirmation") {
    throw new Error("attack_not_ready");
  }
  const attackToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(attack.pending_confirmation?.operation_id),
    operation_type: "prepare_attack_card",
    draft: attack.draft,
    source_message_id: "yes-attack",
    pending_confirmation_id: "pending-attack",
    secret: SECRET,
  });
  assertEquals(
    (await executePrepareAttackCard({
      operation_id: String(attack.pending_confirmation?.operation_id),
      user_id: "u1",
      target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
      draft: attack.draft!,
      token: attackToken,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_attack_card: async () => ({ attack_card_id: "attack" }),
      secret: SECRET,
    })).status,
    "executed",
  );
  completed++;

  const averageMs = (Date.now() - started) / completed;
  assertEquals(averageMs < 4000, true);
});

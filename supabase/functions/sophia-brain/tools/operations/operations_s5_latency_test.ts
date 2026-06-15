import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runCreateRecurringReminderIntake } from "./create_recurring_reminder/intake.ts";
import { structuredRecurringReminderSlotFiller } from "./create_recurring_reminder/test_helpers.ts";

Deno.test("S5 operations latency smoke measures intake to platform handoff under 4s average", async () => {
  const started = Date.now();
  let completed = 0;

  const recurring = await runCreateRecurringReminderIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rappelle-moi tous les jours a 18h de faire une pause",
    trigger_message_id: "latency-recurring",
    safety_context_risk_band: "none",
    slot_filler: structuredRecurringReminderSlotFiller({
      frequency: "daily",
      time: "18:00",
      message: "faire une pause",
    }),
  });
  const recurringRuntime = recurring as any;
  if (recurringRuntime.status !== "handoff_ready") {
    throw new Error("recurring_not_ready");
  }
  assertEquals(recurringRuntime.handoff_draft.executable_from_chat, true);
  assertEquals(recurringRuntime.handoff_draft.executable_from_chat, false);
  completed++;

  const averageMs = (Date.now() - started) / completed;
  assertEquals(averageMs < 4000, true);
});

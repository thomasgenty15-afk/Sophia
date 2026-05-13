import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeActivateStatePotion } from "./executor.ts";
import { runSelectStatePotionIntake } from "./intake.ts";

const SECRET = "s5-test-secret";

Deno.test("select_state_potion pipeline covers 5 potion types and 7-day invariant", async () => {
  const cases = [
    ["je suis stresse, fais-moi une potion", "apaisement"],
    ["lance une potion de guerison", "guerison"],
    ["j'ai peur, lance une potion", "courage"],
    ["je suis dans le flou, fais une potion", "clarte"],
    ["je suis dur avec moi, potion", "amour"],
  ] as const;
  for (const [message, potionType] of cases) {
    resetConsumedConfirmationTokensForTest();
    const output = runSelectStatePotionIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message,
      trigger_message_id: `m-${potionType}`,
      safety_pregate_risk_band: "none",
    });
    assertEquals(output.status, "pending_confirmation", message);
    assertEquals(output.draft?.draft.potion_type, potionType);
    const token = await createConfirmationToken({
      user_id: "u1",
      operation_id: String(output.pending_confirmation?.operation_id),
      operation_type: "select_state_potion",
      draft: output.draft,
      source_message_id: `yes-${potionType}`,
      pending_confirmation_id: `pending-${potionType}`,
      secret: SECRET,
    });
    const executed = await executeActivateStatePotion({
      operation_id: String(output.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: output.draft!,
      token,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_potion_activation: async ({ scheduled_followups }) => ({
        potion_session_id: `potion-${potionType}`,
        recurring_reminder_id: `rr-${potionType}`,
        scheduled_checkin_ids: scheduled_followups.map((_, i) => `sc-${i}`),
      }),
      secret: SECRET,
      now_iso: "2026-05-04T08:00:00.000Z",
    });
    assertEquals(executed.status, "executed");
    if (executed.status === "executed") {
      assertEquals(executed.scheduled_checkin_ids.length, 7);
      assertEquals(
        executed.ack.includes("rappel quotidien pendant 7 jours"),
        true,
      );
      assertEquals(executed.ack.includes("sophia-coach.ai"), true);
    }
  }
});

Deno.test("select_state_potion blocks missing state, safety and writes without Oui", async () => {
  const ask = runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "j'ai besoin d'une potion",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
  });
  assertEquals(ask.status, "ask_question");
  const invalidRecommendation = runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    operation_input: { potion_type: "apaisement" },
    trigger_message_id: "m2",
    safety_pregate_risk_band: "none",
  });
  assertEquals(invalidRecommendation.status, "invalid_recommendation_payload");
  const safety = runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, lance une potion",
    trigger_message_id: "m3",
    safety_pregate_risk_band: "critical",
  });
  assertEquals(safety.status, "blocked_by_safety");
  const ready = runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis stresse, fais-moi une potion",
    trigger_message_id: "m4",
    safety_pregate_risk_band: "none",
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_ready");
  }
  let writes = 0;
  const noToken = await executeActivateStatePotion({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: ready.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_potion_activation: async () => {
      writes++;
      return {
        potion_session_id: "p",
        recurring_reminder_id: "r",
        scheduled_checkin_ids: Array.from({ length: 7 }, (_, i) => `s${i}`),
      };
    },
    secret: SECRET,
  });
  assertEquals(noToken.status, "blocked");
  assertEquals(writes, 0);
});

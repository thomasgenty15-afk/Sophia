import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeUpdateCoachPreferences } from "./executor.ts";
import { runUpdateCoachPreferencesIntake } from "./intake.ts";

const SECRET = "s6-test-secret";

Deno.test("update_coach_preferences pipeline covers 5 scenarios and strict allowed keys", async () => {
  const scenarios = [
    ["pose-moi moins de questions", "pending_confirmation"],
    ["sois plus direct", "pending_confirmation"],
    ["challenge-moi plus", "pending_confirmation"],
    ["change ton style", "ask_question"],
    [
      "recommendation",
      "invalid_recommendation_payload",
      "recommendation_tool",
      {},
    ],
  ] as const;
  for (const [message, expected, source, operationInput] of scenarios) {
    resetConsumedConfirmationTokensForTest();
    const output = runUpdateCoachPreferencesIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message,
      source: source as any,
      operation_input: operationInput as any,
      trigger_message_id: `m-${message}`,
      safety_pregate_risk_band: "none",
    });
    assertEquals(output.status, expected, message);
    if (output.status === "pending_confirmation") {
      const token = await createConfirmationToken({
        user_id: "u1",
        operation_id: String(output.pending_confirmation?.operation_id),
        operation_type: "update_coach_preferences",
        draft: output.draft,
        source_message_id: "yes",
        pending_confirmation_id: "pending",
        secret: SECRET,
      });
      const executed = await executeUpdateCoachPreferences({
        operation_id: String(output.pending_confirmation?.operation_id),
        user_id: "u1",
        draft: output.draft!,
        token,
        safety_pregate_risk_band: "none",
        pending_confirmation_lookup: async () => ({ consumed: false }),
        token_consumption_check: async (tokenId) =>
          hasConsumedConfirmationTokenForTest(tokenId),
        write_preferences_patch: async () => ({
          preferences_update_id: "pref",
        }),
        secret: SECRET,
      });
      assertEquals(executed.status, "executed");
      assertEquals(executed.ack.includes("sophia-coach.ai"), true);
    }
  }
  const valid = runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "sois plus direct",
    trigger_message_id: "m-valid",
    safety_pregate_risk_band: "none",
  });
  if (valid.status !== "pending_confirmation") {
    throw new Error("expected_pending");
  }
  const blocked = await executeUpdateCoachPreferences({
    operation_id: String(valid.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: {
      ...valid.draft!,
      draft: {
        ...valid.draft!.draft,
        patch: { ["memory.secret" as any]: "x" },
      },
    },
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_preferences_patch: async () => ({ preferences_update_id: "bad" }),
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
});

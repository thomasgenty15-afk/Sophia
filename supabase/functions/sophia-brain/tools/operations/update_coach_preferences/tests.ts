import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeUpdateCoachPreferences } from "./executor.ts";
import { runUpdateCoachPreferencesIntake } from "./intake.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s6-test-secret";

Deno.test("update_coach_preferences pipeline covers 5 scenarios and strict allowed keys", async () => {
  const scenarios = [
    {
      message: "pose-moi moins de questions",
      expected: "pending_confirmation",
      slot_filler: structuredCoachPreferencesSlotFiller(
        readyCoachPreferencesStatePatch("coach.question_tendency", "low"),
      ),
    },
    {
      message: "sois plus direct",
      expected: "pending_confirmation",
      slot_filler: structuredCoachPreferencesSlotFiller(
        readyCoachPreferencesStatePatch("coach.tone", "direct"),
      ),
    },
    {
      message: "challenge-moi plus",
      expected: "pending_confirmation",
      slot_filler: structuredCoachPreferencesSlotFiller(
        readyCoachPreferencesStatePatch("coach.challenge_level", "high"),
      ),
    },
    {
      message: "change ton style",
      expected: "ask_question",
      slot_filler: structuredCoachPreferencesSlotFiller({
        preference: {
          status: "missing",
          confidence: "low",
          evidence: ["structured missing"],
        },
      }, ["preference"]),
    },
    {
      message: "recommendation",
      expected: "invalid_recommendation_payload",
      slot_filler: structuredCoachPreferencesSlotFiller({}, ["preference"]),
      source: "recommendation_tool" as const,
      operation_input: {},
    },
  ] as const;
  for (const scenario of scenarios) {
    resetConsumedConfirmationTokensForTest();
    const output = await runUpdateCoachPreferencesIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      source: "source" in scenario ? scenario.source : undefined,
      operation_input: "operation_input" in scenario
        ? scenario.operation_input
        : undefined,
      trigger_message_id: `m-${scenario.message}`,
      safety_pregate_risk_band: "none",
      slot_filler: scenario.slot_filler,
    });
    assertEquals(output.status, scenario.expected, scenario.message);
    if (output.status === "pending_confirmation") {
      const pendingMessage = String(output.confirmation?.message ?? "");
      assertEquals(
        pendingMessage.includes("Sophia utilisera"),
        false,
      );
      assertEquals(
        pendingMessage.includes("j'utiliserai"),
        true,
      );
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
      assertEquals(executed.ack.includes("Sophia utilisera"), false);
    }
  }
  const valid = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "sois plus direct",
    trigger_message_id: "m-valid",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller(
      readyCoachPreferencesStatePatch("coach.tone", "direct"),
    ),
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

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeUpdateCoachPreferences } from "./executor.ts";
import {
  reviewUpdateCoachPreferencesDraft,
  runUpdateCoachPreferencesIntake,
} from "./intake.ts";
import { runCoachPreferencesPatchBuilder } from "./generator.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s6-test-secret";

Deno.test("update_coach_preferences draft review approves explicit keep preference with side request", async () => {
  const decision = await reviewUpdateCoachPreferencesDraft({
    message:
      "Oui, garde cette préférence. Et donne-moi maintenant la version ultra de la phrase.",
    previous_draft: {
      operation_type: "update_coach_preferences",
      draft: {
        patch: { "coach.question_tendency": "low" },
        summary:
          "je te poserai moins de questions, plus courtes, surtout quand tu es bloqué.",
      },
    },
  });
  assertEquals(decision?.decision, "approve");
  assertEquals(decision?.confidence, "high");
});

Deno.test("update_coach_preferences preserves one concrete action preference wording", () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.question_tendency": "low" },
    reason: {
      evidence: [
        "Pour la suite, quand je suis vide, une action concrète à la fois, pas trois options.",
      ],
    },
    constraints: [],
    forbidden: [],
  });

  assertEquals(
    draft.draft.summary,
    "je te proposerai une seule action concrète à la fois, avec moins de questions/options quand tu es vidé ou bloqué.",
  );
  assertEquals(
    draft.confirmation_message.includes("une seule action concrète à la fois"),
    true,
  );
});

Deno.test("update_coach_preferences resolves one action not three options deterministically", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options. Garde cette preference si tu peux.",
    trigger_message_id: "m-one-action-preference",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.confirmation?.message.includes("une seule action concrète"),
    true,
  );
});

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
        pendingMessage.includes("Je peux régler ma façon de répondre"),
        false,
      );
      assertEquals(
        pendingMessage.includes("Si c'est bien ça"),
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

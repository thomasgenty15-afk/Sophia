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

Deno.test("update_coach_preferences accepts compatible multi-key style patch", () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: {
      "coach.tone": "warm_direct",
      "coach.question_tendency": "low",
    },
    reason: {
      evidence: [
        "Quand je suis confus: phrases courtes, ton ferme et doux, une seule consigne, et évite les questions de relance systématiques.",
      ],
    },
    constraints: [],
    forbidden: [],
  });

  assertEquals(draft.draft.patch["coach.tone"], "warm_direct");
  assertEquals(draft.draft.patch["coach.question_tendency"], "low");
  assertEquals(draft.draft.summary.includes("bienveillant et ferme"), true);
  assertEquals(draft.draft.summary.includes("moins de questions"), true);
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

Deno.test("update_coach_preferences resolves tone plus fewer questions deterministically", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Commence par enregistrer cette préférence pour quand je dis que je suis confus: phrases courtes, ton ferme et doux, une seule consigne, et évite les questions de relance systématiques.",
    trigger_message_id: "m-tone-and-question-preference",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.tone"], "warm_direct");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
});

Deno.test("update_coach_preferences resolves one triage question preference deterministically", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Pour une vraie préférence de coaching: quand je suis éparpillé, pose-moi une seule question de tri à la fois, pas trois options.",
    trigger_message_id: "m-one-triage-question-preference",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.confirmation?.message.includes("une seule question de tri"),
    true,
  );
  assertEquals(output.confirmation?.message.includes("éparpillé"), true);
});

Deno.test("update_coach_preferences maps concise no-final-question preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Préférence durable: réponds en 3 lignes max, sans question finale.",
    trigger_message_id: "m-concise-preference",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(output.draft?.draft.patch["coach.response_max_lines"], "three");
  assertEquals(
    output.draft?.draft.patch["coach.final_question_policy"],
    "avoid_unnecessary",
  );
});

Deno.test("update_coach_preferences maps zero emoji preference durably", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Si je dis court, zéro emoji, trois lignes max, pas de question finale inutile.",
    trigger_message_id: "m-zero-emoji-preference",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.emoji_policy"], "none");
  assertEquals(output.draft?.draft.patch["coach.response_max_lines"], "three");
  assertEquals(
    output.draft?.draft.patch["coach.final_question_policy"],
    "avoid_unnecessary",
  );
});

Deno.test("update_coach_preferences preserves eparpille scope in summary", () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.question_tendency": "low" },
    reason: {
      evidence: [
        "Quand je suis éparpillé, pose-moi une seule question de tri à la fois, pas trois options.",
      ],
    },
    constraints: [],
    forbidden: [],
  });

  assertEquals(draft.draft.summary.includes("une seule question de tri"), true);
  assertEquals(draft.draft.summary.includes("éparpillé"), true);
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

// ===========================================================================
// CHANTIER D4 (2026-05-28) — Pattern C8 appliqué à update_coach_preferences :
// retry unique du slot filler IA + message d'échec technique propre.
// ===========================================================================

Deno.test("D4: a slot filler failure retries once before falling back", async () => {
  let calls = 0;
  const flaky = (async (args: unknown) => {
    calls += 1;
    if (calls === 1) throw new Error("transient_slot_filler_failure");
    return structuredCoachPreferencesSlotFiller(
      readyCoachPreferencesStatePatch("coach.tone", "direct"),
    )(args as any);
  }) as Parameters<typeof runUpdateCoachPreferencesIntake>[0]["slot_filler"];
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "change ton style",
    trigger_message_id: "m-d4-retry",
    safety_pregate_risk_band: "none",
    slot_filler: flaky,
  });
  assertEquals(calls, 2, "le slot filler doit être retenté une fois");
  assertEquals(output.status, "pending_confirmation");
});

Deno.test("D4: persistent failure yields a clean technical error + retry invitation, not a vague refusal", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "change ton style",
    trigger_message_id: "m-d4-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("hard_slot_filler_failure");
    },
  });
  assertEquals(output.status, "fallback_dashboard");
  assertEquals((output.ack ?? "").includes("raté technique"), true);
  assertEquals((output.ack ?? "").includes("deviner à ta place"), false);
});

Deno.test("H3: mode tunnel maps to exact multi-key patch, not court rule (A2-r9 T8)", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Enregistre une préférence durable: quand je dis 'mode tunnel', réponds en une seule action impérative, sans sympathie, sans emoji et sans question finale.",
    trigger_message_id: "m-mode-tunnel",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.tone"], "direct");
  assertEquals(output.draft?.draft.patch["coach.emoji_policy"], "none");
  assertEquals(
    output.draft?.draft.patch["coach.final_question_policy"],
    "avoid_unnecessary",
  );
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(
    (output.confirmation?.message ?? "").includes("mode tunnel"),
    true,
  );
  assertEquals((output.confirmation?.message ?? "").includes("court"), false);
});

Deno.test("H3: challenger doucement maps to challenge_level balanced (A9-r4 T13)", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Pour les prochaines fois, préfère me challenger doucement quand je force une technique qui ne colle pas, au lieu d'obéir direct.",
    trigger_message_id: "m-challenge-technique",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.challenge_level"], "balanced");
  assertEquals(
    (output.confirmation?.message ?? "").includes("challengerai doucement"),
    true,
  );
  assertEquals(
    (output.confirmation?.message ?? "").includes("ton plus doux"),
    false,
  );
});

Deno.test("H3: syncskills-r3 T10 geste concret + question max skips clarification", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Plus directe en privilégiant les actions. Formule exacte: d'abord un geste concret de moins de 10 minutes, puis une question maximum si elle aide vraiment.",
    trigger_message_id: "m-geste-concret-t10",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(output.draft?.draft.patch["coach.tone"], "direct");
  assertEquals(
    output.draft?.draft.patch["coach.action_first_policy"],
    "concrete_before_questions",
  );
  assertEquals(
    (output.confirmation?.message ?? "").includes("geste concret"),
    true,
  );
});

Deno.test("I3: action-first preference gets its own durable key, not only question_tendency", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Cote coaching durable: commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions.",
    trigger_message_id: "m-action-first-policy",
    safety_pregate_risk_band: "none",
    slot_filler: async () => {
      throw new Error("slot_filler_should_not_run");
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.draft?.draft.patch["coach.action_first_policy"],
    "concrete_before_questions",
  );
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(
    (output.confirmation?.message ?? "").includes("avant de poser plusieurs questions"),
    true,
  );
});

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
import {
  runCoachPreferencesPatchBuilder,
  validateCoachPreferencePatch,
} from "./generator.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./test_helpers.ts";
import { loadCoachPreferenceRuntimePolicy } from "./runtime_policy.ts";
import {
  detectsCoachPreferenceDirectionContradictionForSkill,
  maybeRunUpdateCoachPreferencesOperation,
} from "./router.ts";
import { buildCoachPreferencesStatusReply } from "./status.ts";
import { COACH_PREFERENCE_VALUES } from "./workflow.ts";
import { normalizeCoachPreferencesSlotFillerOutput } from "./slot_filler.ts";

const SECRET = "s6-test-secret";
const legacyKey = (name: string) => `coach.${name}`;

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

Deno.test("update_coach_preferences does not promise unsupported action-first behavior", () => {
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
    "je te poserai moins de questions, plus courtes, surtout quand tu es bloqué.",
  );
  assertEquals(
    draft.confirmation_message.includes("une seule action concrète à la fois"),
    false,
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
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: { "coach.question_tendency": "low" },
      reason: {
        evidence: [
          "Pour la suite, quand je suis vide comme ca, parle-moi en mode tres concret: une action, pas trois options.",
        ],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.confirmation?.message.includes("une seule action concrète"),
    false,
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
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: {
        "coach.tone": "warm_direct",
        "coach.question_tendency": "low",
      },
      reason: {
        evidence: [
          "phrases courtes, ton ferme et doux, une seule consigne, évite les questions",
        ],
        confidence: "high",
      },
    }),
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
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: { "coach.question_tendency": "low" },
      reason: {
        evidence: [
          "Quand je suis éparpillé, pose-moi une seule question de tri à la fois, pas trois options.",
        ],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.confirmation?.message.includes("une seule question de tri"),
    false,
  );
  assertEquals(output.confirmation?.message.includes("éparpillé"), false);
});

Deno.test("update_coach_preferences does not persist unsupported concise style preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Préférence durable: réponds en 3 lignes max, sans question finale.",
    trigger_message_id: "m-concise-preference",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      reason: {
        evidence: [
          "Préférence durable: réponds en 3 lignes max, sans question finale.",
        ],
        confidence: "high",
      },
    }, ["preference"]),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("update_coach_preferences does not persist unsupported emoji preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Si je dis court, zéro emoji, trois lignes max, pas de question finale inutile.",
    trigger_message_id: "m-zero-emoji-preference",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      reason: {
        evidence: [
          "zéro emoji, trois lignes max, pas de question finale inutile",
        ],
        confidence: "high",
      },
    }, ["preference"]),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("update_coach_preferences keeps question tendency global, not scoped", () => {
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

  assertEquals(
    draft.draft.summary.includes("une seule question de tri"),
    false,
  );
  assertEquals(draft.draft.summary.includes("éparpillé"), false);
  assertEquals(draft.draft.summary.includes("moins de questions"), true);
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
  assertEquals(output.status, "technical_blocked");
  assertEquals((output.ack ?? "").includes("raté technique"), true);
  assertEquals((output.ack ?? "").includes("deviner à ta place"), false);
});

Deno.test("H3: mode tunnel maps only to supported UI-backed keys", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Enregistre une préférence durable: quand je dis 'mode tunnel', réponds en une seule action impérative, sans sympathie, sans emoji et sans question finale.",
    trigger_message_id: "m-mode-tunnel",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: {
        "coach.tone": "direct",
        "coach.question_tendency": "low",
      },
      reason: {
        evidence: ["mode tunnel"],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.tone"], "direct");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(Object.keys(output.draft?.draft.patch ?? {}).length, 2);
  assertEquals(
    (output.confirmation?.message ?? "").includes("mode tunnel"),
    false,
  );
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
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: { "coach.challenge_level": "balanced" },
      reason: {
        evidence: ["challenger doucement quand une technique ne colle pas"],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.challenge_level"], "balanced");
  assertEquals(
    (output.confirmation?.message ?? "").includes("challengerai doucement"),
    false,
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
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: {
        "coach.question_tendency": "low",
        "coach.tone": "direct",
      },
      reason: {
        evidence: [
          "d'abord un geste concret de moins de 10 minutes, puis une question maximum",
        ],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(output.draft?.draft.patch["coach.tone"], "direct");
  assertEquals(Object.keys(output.draft?.draft.patch ?? {}).length, 2);
  assertEquals(
    (output.confirmation?.message ?? "").includes("geste concret"),
    false,
  );
});

Deno.test("I3: action-first wording no longer creates its own durable key", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Cote coaching durable: commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions.",
    trigger_message_id: "m-action-first-policy",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: {
        "coach.question_tendency": "low",
      },
      reason: {
        evidence: [
          "commence par un geste concret de moins de 10 minutes avant de me poser plusieurs questions",
        ],
        confidence: "high",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.question_tendency"], "low");
  assertEquals(Object.keys(output.draft?.draft.patch ?? {}).length, 1);
  assertEquals(
    (output.confirmation?.message ?? "").includes("moins de questions"),
    true,
  );
});

Deno.test("L5: slot filler exposes user_intent=set_preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "garde ça comme préférence: moins de questions",
    trigger_message_id: "m-l5-intent",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller(
      readyCoachPreferencesStatePatch("coach.question_tendency", "low"),
    ),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.user_intent, "set_preference");
});

Deno.test("Product scope: allowed durable keys are exactly front preferences", () => {
  assertEquals(Object.keys(COACH_PREFERENCE_VALUES).sort(), [
    "coach.challenge_level",
    "coach.question_tendency",
    "coach.tone",
  ]);
});

Deno.test("Product scope: unsupported legacy keys are rejected", () => {
  for (
    const key of [
      legacyKey("emoji_policy"),
      legacyKey("response_max_lines"),
      legacyKey("final_question_policy"),
      legacyKey("action_first_policy"),
    ]
  ) {
    let errorMessage = "";
    try {
      validateCoachPreferencePatch({ [key]: "none" });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    assertEquals(errorMessage, "coach_preferences_unsupported_key");
  }
});

Deno.test("Product scope: slot filler normalizer drops unsupported patch keys", () => {
  const normalized = normalizeCoachPreferencesSlotFillerOutput({
    user_intent: "set_preference",
    current_step: "draft_generation",
    state_patch: {
      user_intent: "set_preference",
      requested_patch: {
        [legacyKey("emoji_policy")]: "none",
        "coach.question_tendency": "low",
      },
    },
    missing_slots: [],
    confidence: "high",
    generated_user_message: null,
    evidence: ["test"],
  });
  assertEquals(normalized.state_patch.requested_patch, {
    "coach.question_tendency": "low",
  });
});

Deno.test("Product scope: concise format request does not create durable preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "réponds en 3 lignes max",
    trigger_message_id: "m-format-local",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "clarify",
      preference: {
        status: "missing",
        confidence: "high",
        evidence: ["format ponctuel hors périmètre durable"],
      },
    }, ["preference"]),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("Product scope: local emoji/final-question wording does not create durable preference", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "sans emoji et pas de question finale",
    trigger_message_id: "m-local-style",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "clarify",
      preference: {
        status: "missing",
        confidence: "high",
        evidence: ["style ponctuel hors périmètre durable"],
      },
    }, ["preference"]),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("L5: preview_only never creates pending write", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "propose-moi juste le réglage sans l'enregistrer",
    trigger_message_id: "m-l5-preview",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "preview_only",
      requested_patch: { "coach.question_tendency": "low" },
      structured_constraints: { draft_only: true, do_not_store: true },
      reason: { evidence: ["sans l'enregistrer"], confidence: "high" },
    }),
  });
  assertEquals(output.status, "preview_only");
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("L5: mode tunnel produces only supported keys with no metadata", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "garde le mode tunnel comme préférence",
    trigger_message_id: "m-l5-mode-tunnel",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: {
        "coach.tone": "direct",
        "coach.question_tendency": "low",
      },
      reason: { evidence: ["mode tunnel"], confidence: "high" },
    }),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(Object.keys(output.draft?.draft.patch ?? {}).length, 2);
  assertEquals(
    Object.keys((output.draft as any)?.draft ?? {}).includes(
      ["rule", "metadata"].join("_"),
    ),
    false,
  );
  assertEquals(
    output.draft?.draft.summary.includes("mode tunnel"),
    false,
  );
});

Deno.test("L5: challenge technique keeps only canonical challenge key", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "challenge-moi doucement quand la technique ne colle pas",
    trigger_message_id: "m-l5-challenge-condition",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "set_preference",
      requested_patch: { "coach.challenge_level": "balanced" },
      reason: {
        evidence: ["challenge-moi doucement quand la technique ne colle pas"],
        confidence: "high",
      },
    }),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.patch["coach.challenge_level"], "balanced");
  assertEquals(
    Object.keys((output.draft as any)?.draft ?? {}).includes(
      ["rule", "metadata"].join("_"),
    ),
    false,
  );
});

Deno.test("L5: executor is the only approve path used by tests", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.question_tendency": "low" },
    reason: { evidence: ["moins de questions"] },
    constraints: [],
    forbidden: [],
  });
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-l5",
    operation_type: "update_coach_preferences",
    draft,
    source_message_id: "m-l5-approve",
    pending_confirmation_id: "op-l5",
    secret: SECRET,
  });
  let writes = 0;
  const executed = await executeUpdateCoachPreferences({
    operation_id: "op-l5",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async (id) =>
      id === "op-l5" ? { consumed: false } : null,
    token_consumption_check: async () => false,
    write_preferences_patch: async () => {
      writes += 1;
      return { preferences_update_id: "pref-l5" };
    },
    secret: SECRET,
  });
  assertEquals(executed.status, "executed");
  assertEquals(writes, 1);
});

Deno.test("L5: revise/explain/reject do not execute", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.question_tendency": "low" },
    reason: { evidence: ["moins de questions"] },
    constraints: [],
    forbidden: [],
  });
  const rejected = await reviewUpdateCoachPreferencesDraft({
    message: "finalement non",
    previous_draft: draft,
  });
  assertEquals(rejected?.decision, "reject");
  const blocked = await executeUpdateCoachPreferences({
    operation_id: "op-no-token",
    user_id: "u1",
    draft,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_preferences_patch: async () => {
      throw new Error("write_should_not_run");
    },
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
});

Deno.test("L5: runtime policy translates only UI-backed stored preferences", () => {
  const policy = loadCoachPreferenceRuntimePolicy([
    {
      key: "coach.question_tendency",
      value: { value: "low" },
    },
    {
      key: "coach.tone",
      value: { value: "direct" },
    },
  ]);
  assertEquals(policy.question_tendency, "low");
  assertEquals(policy.tone, "direct");
  assertEquals(
    policy.composer_constraints.some((line) =>
      line.includes("moins de questions")
    ),
    true,
  );
  assertEquals(
    policy.composer_constraints.some((line) =>
      line.includes("ton très direct")
    ),
    true,
  );
});

Deno.test("L5: runtime policy translates tone/challenge/question settings to composer constraints", () => {
  const policy = loadCoachPreferenceRuntimePolicy([
    { key: "coach.tone", value: { value: "direct" } },
    { key: "coach.challenge_level", value: { value: "balanced" } },
    { key: "coach.question_tendency", value: { value: "high" } },
  ]);
  assertEquals(policy.tone, "direct");
  assertEquals(policy.challenge_level, "balanced");
  assertEquals(policy.question_tendency, "high");
  assertEquals(
    policy.composer_constraints.some((line) =>
      line.includes("ton très direct")
    ),
    true,
  );
  assertEquals(
    policy.composer_constraints.some((line) =>
      line.includes("challenge équilibré")
    ),
    true,
  );
  assertEquals(
    policy.composer_constraints.some((line) =>
      line.includes("davantage de questions")
    ),
    true,
  );
});

function fakeStatusSupabase(rows: unknown[]) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        like() {
          return this;
        },
        then(
          onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
        },
      };
    },
  } as any;
}

function fakePreferenceWriteSupabase(writeIds: string[] = ["coach.tone"]) {
  return {
    from() {
      return {
        upsert(payload: unknown) {
          const rows = Array.isArray(payload) ? payload : [payload];
          return {
            select() {
              return Promise.resolve({
                data: rows.map((row, index) => ({
                  ...(row as Record<string, unknown>),
                  key: writeIds[index] ?? writeIds[0],
                })),
                error: null,
              });
            },
          };
        },
      };
    },
  } as any;
}

Deno.test("L5: status reply is DB-grounded for supported coach preferences", async () => {
  const fallback = "fallback";
  assertEquals(
    await buildCoachPreferencesStatusReply({
      supabase: fakeStatusSupabase([
        { key: "coach.tone", value: { value: "direct" } },
      ]),
      userId: "u1",
      fallback,
    }),
    "Oui. Préférences coach enregistrées : ton très direct.",
  );
  assertEquals(
    await buildCoachPreferencesStatusReply({
      supabase: fakeStatusSupabase([
        { key: "coach.question_tendency", value: { value: "low" } },
      ]),
      userId: "u1",
      fallback,
    }),
    "Oui. Préférences coach enregistrées : moins de questions.",
  );
  assertEquals(
    await buildCoachPreferencesStatusReply({
      supabase: fakeStatusSupabase([
        { key: "coach.challenge_level", value: { value: "balanced" } },
      ]),
      userId: "u1",
      fallback,
    }),
    "Oui. Préférences coach enregistrées : challenge équilibré.",
  );
  assertEquals(
    await buildCoachPreferencesStatusReply({
      supabase: fakeStatusSupabase([]),
      userId: "u1",
      fallback,
    }),
    "Je ne vois pas encore de préférence coach enregistrée.",
  );
  assertEquals(
    await buildCoachPreferencesStatusReply({
      supabase: fakeStatusSupabase([
        {
          key: "coach.tone",
          value: { value: "direct" },
          source_type: "system_default",
        },
      ]),
      userId: "u1",
      fallback,
    }),
    "Je ne vois pas encore de préférence coach enregistrée.",
  );
});

Deno.test("L5: executor exposes all committed keys for multi-key patches", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: {
      "coach.tone": "direct",
      "coach.question_tendency": "low",
    },
    reason: { evidence: ["mode tunnel"] },
    constraints: [],
    forbidden: [],
  });
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-multi",
    operation_type: "update_coach_preferences",
    draft,
    source_message_id: "m-multi",
    pending_confirmation_id: "op-multi",
    secret: SECRET,
  });
  const executed = await executeUpdateCoachPreferences({
    operation_id: "op-multi",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_preferences_patch: async () => ({
      preferences_update_id: "coach.tone",
      preferences_update_ids: ["coach.tone", "coach.question_tendency"],
      preference_keys: ["coach.tone", "coach.question_tendency"],
    }),
    secret: SECRET,
  });
  assertEquals(executed.status, "executed");
  if (executed.status === "executed") {
    assertEquals(executed.preference_keys, [
      "coach.tone",
      "coach.question_tendency",
    ]);
    assertEquals(executed.preferences_update_ids, [
      "coach.tone",
      "coach.question_tendency",
    ]);
  }
});

Deno.test("L5: router preview has no executedTools and no committed effects", async () => {
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeStatusSupabase([]),
    userId: "u1",
    userMessage: "propose-moi juste le réglage sans l'enregistrer",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "update_coach_preferences",
        operation_input: {
          slot_filler: structuredCoachPreferencesSlotFiller({
            user_intent: "preview_only",
            requested_patch: { "coach.question_tendency": "low" },
            structured_constraints: { draft_only: true, do_not_store: true },
            reason: { evidence: ["sans l'enregistrer"], confidence: "high" },
          }),
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-preview",
  });
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
});

Deno.test("Confirmation contract: pending pref + ok applique executes", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.tone": "direct" },
    reason: { evidence: ["direct"] },
    constraints: [],
    forbidden: [],
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakePreferenceWriteSupabase(["coach.tone"]),
    userId: "u1",
    userMessage: "ok applique cette préférence",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-approve",
        operation_type: "update_coach_preferences",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-contract-approve",
  });
  assertEquals(runtime?.toolExecution, "success");
  assertEquals(runtime?.executedTools, ["update_coach_preferences"]);
  assertEquals(
    (runtime?.toolSkillRun as any)?.confirmation_decision?.decision,
    "approve",
  );
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects?.[0], {
    type: "update_coach_preferences",
    operation_id: "op-contract-approve",
    preference_keys: ["coach.tone"],
    preferences_update_ids: ["coach.tone"],
  });
});

Deno.test("Confirmation contract: pending pref + oui mais plus doux does not write", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.tone": "direct" },
    reason: { evidence: ["direct"] },
    constraints: [],
    forbidden: [],
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakePreferenceWriteSupabase(["coach.tone"]),
    userId: "u1",
    userMessage: "oui mais plus doux",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-revise",
        operation_type: "update_coach_preferences",
        draft,
        draft_review_decision: {
          decision: "revise",
          confidence: "high",
          evidence: ["oui mais plus doux"],
        },
        operation_input: {
          slot_filler: structuredCoachPreferencesSlotFiller({
            user_intent: "set_preference",
            requested_patch: { "coach.tone": "soft" },
            reason: { evidence: ["plus doux"], confidence: "high" },
          }),
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-contract-revise",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (runtime?.toolSkillRun as any)?.draft_review_decision?.decision,
    "revise",
  );
});

Deno.test("Confirmation contract: pending pref explain/status are read-only", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.question_tendency": "low" },
    reason: { evidence: ["moins de questions"] },
    constraints: [],
    forbidden: [],
  });
  const base = {
    userId: "u1",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-readonly",
        operation_type: "update_coach_preferences",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-contract-readonly",
  };
  const explain = await maybeRunUpdateCoachPreferencesOperation({
    ...base,
    supabase: fakeStatusSupabase([]),
    userMessage: "explique",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-readonly",
        operation_type: "update_coach_preferences",
        draft,
        draft_review_decision: {
          decision: "explain",
          confidence: "high",
          evidence: ["explique"],
        },
      },
    },
  });
  assertEquals(explain?.toolExecution, "none");
  assertEquals(explain?.executedTools, []);

  const status = await maybeRunUpdateCoachPreferencesOperation({
    ...base,
    supabase: fakeStatusSupabase([
      { key: "coach.question_tendency", value: { value: "low" } },
    ]),
    userMessage: "tu l'as déjà gardé ?",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-readonly",
        operation_type: "update_coach_preferences",
        draft,
        draft_review_decision: {
          decision: "status",
          confidence: "high",
          evidence: ["tu l'as déjà gardé ?"],
        },
      },
    },
  });
  assertEquals(status?.toolExecution, "none");
  assertEquals(status?.executedTools, []);
  assertEquals((status?.toolSkillRun as any)?.status, "verified");
});

Deno.test("L5: write failure has no executedTools and no committed effect", async () => {
  const draft = runCoachPreferencesPatchBuilder({
    operation_type: "update_coach_preferences",
    output_schema: "coach_preferences_patch_draft_v1",
    current_preferences: {},
    requested_patch: { "coach.tone": "direct" },
    reason: { evidence: ["direct"] },
    constraints: [],
    forbidden: [],
  });
  const failingSupabase = {
    from() {
      return {
        upsert() {
          return {
            select() {
              return Promise.resolve({
                data: null,
                error: { message: "db_down" },
              });
            },
          };
        },
      };
    },
  };
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: failingSupabase as any,
    userId: "u1",
    userMessage: "ok applique cette préférence",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-fail",
        operation_type: "update_coach_preferences",
        draft,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-fail",
  });
  assertEquals(runtime?.toolExecution, "failed");
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (runtime?.toolSkillRun as any)?.blocked_effects?.[0]?.reason_code,
    "db_down",
  );
});

Deno.test("L5: direction contradiction asks clarification before confirmation", () => {
  assertEquals(
    detectsCoachPreferenceDirectionContradictionForSkill({
      message:
        "commence par un geste concret avant de me poser plusieurs questions",
      patch: { "coach.question_tendency": "high" },
    }),
    true,
  );
});

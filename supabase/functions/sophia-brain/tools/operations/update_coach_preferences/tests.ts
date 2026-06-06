import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runUpdateCoachPreferencesIntake } from "./intake.ts";
import { runCoachPreferenceHandoffDraftBuilder } from "./generator.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./test_helpers.ts";
import { loadCoachPreferenceRuntimePolicy } from "./runtime_policy.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "./router.ts";
import { buildCoachPreferencesStatusReply } from "./status.ts";
import { renderCoachPreferenceHandoffDraft } from "./renderer.ts";

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
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
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

function fakeWriteDetectingSupabase() {
  return {
    wrote: false,
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
        upsert: () => {
          this.wrote = true;
          throw new Error("unexpected_write");
        },
        then(
          onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
        ) {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        },
      };
    },
  } as any;
}

Deno.test("coach preference handoff produces full renderer content", () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux que Sophia soit plus directe dans la suite",
    requested_patch: { "coach.tone": "direct" },
    unsupported_parts: ["répondre toujours en exactement trois lignes"],
  });
  const rendered = renderCoachPreferenceHandoffDraft(draft);
  assert(rendered.includes("pour la suite"));
  assert(rendered.includes("Ça correspond au réglage suivant"));
  assert(rendered.includes("ne correspond pas à un réglage durable"));
  assert(rendered.includes("Préférences coach"));
  assert(rendered.includes("Il ne manque plus qu’à aller"));
  assertEquals(rendered.includes("Ce que je comprends :"), false);
  assertEquals(rendered.includes("Durable ou ponctuel :"), false);
  assertEquals(rendered.includes("Réglage supporté recommandé :"), false);
  assertEquals(rendered.includes("Destination plateforme :"), false);
  assertEquals(rendered.includes("Je ne modifie pas tes préférences"), false);
  assertEquals(rendered.includes("préférence enregistrée"), false);
  assertEquals(rendered.includes("je le garde"), false);
  assertEquals(rendered.includes("c'est modifié"), false);
  assertEquals(rendered.includes("appliqué"), false);
});

Deno.test("handoff intake never creates confirmation token or pending confirmation", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "Pour la suite, sois plus direct.",
    trigger_message_id: "m-handoff",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller(
      readyCoachPreferencesStatePatch("coach.tone", "direct"),
    ),
  });
  assertEquals(output.status, "handoff_ready");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.confirmation?.required, false);
  assertEquals(output.handoff_draft?.no_chat_mutation, true);
  assertEquals(output.handoff_draft?.executable_from_chat, false);
});

Deno.test("handoff never calls executeUpdateCoachPreferences or writes user_profile_facts", async () => {
  const supabase = fakeWriteDetectingSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "Pour la suite, sois plus direct et pose moins de questions.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "update_coach_preferences",
        operation_input: {
          slot_filler: structuredCoachPreferencesSlotFiller({
            user_intent: "set_preference",
            requested_patch: {
              "coach.tone": "direct",
              "coach.question_tendency": "low",
            },
            reason: {
              evidence: ["direct et moins de questions"],
              confidence: "high",
            },
          }),
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-runtime",
  });
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.pending_confirmation, null);
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.no_chat_mutation,
    true,
  );
  assertEquals(supabase.wrote, false);
});

Deno.test("apply_attempt does not execute", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux un ton plus direct",
    requested_patch: { "coach.tone": "direct" },
  });
  const supabase = fakeWriteDetectingSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "ok applique",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-apply",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(supabase.wrote, false);
  assert(runtime?.content.includes("Je ne peux pas l’appliquer directement"));
  assert(runtime?.content.includes("Préférences coach"));
});

Deno.test("apply_attempt repeats every recommended setting from active draft", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux un ton plus direct et moins de questions",
    requested_patch: {
      "coach.tone": "direct",
      "coach.question_tendency": "low",
    },
    unsupported_parts: ["ne jamais finir par une question"],
  });
  const supabase = fakeWriteDetectingSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "ok applique",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-apply-composite",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(supabase.wrote, false);
  assert(runtime?.content.includes("Ton global"));
  assert(runtime?.content.includes("Très direct"));
  assert(runtime?.content.includes("Tendance à poser des questions"));
  assert(runtime?.content.includes("Peu de questions"));
  assert(runtime?.content.includes("ne jamais finir par une question"));
});

Deno.test("old pending confirmation plus ok applique is ignored", async () => {
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeWriteDetectingSupabase(),
    userId: "u1",
    userMessage: "ok applique cette préférence",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-legacy",
        operation_type: "update_coach_preferences",
        draft: { draft: { patch: { "coach.tone": "direct" } } },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-legacy-apply",
  });
  assertEquals(runtime, null);
});

Deno.test("repeat_handoff repeats recommended setting", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux moins de questions",
    requested_patch: { "coach.question_tendency": "low" },
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeStatusSupabase([]),
    userId: "u1",
    userMessage: "redis-moi quoi changer",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-repeat",
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "repeat_handoff");
  assert(runtime?.content.includes("Tendance à poser des questions"));
  assert(runtime?.content.includes("Peu de questions"));
});

Deno.test("destination question inside active handoff repeats handoff", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux moins de questions",
    requested_patch: { "coach.question_tendency": "low" },
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeStatusSupabase([]),
    userId: "u1",
    userMessage: "Où est-ce que je fais ça ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-repeat-destination",
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "repeat_handoff");
  assert(runtime?.content.includes("Préférences coach"));
  assert(runtime?.content.includes("Tendance à poser des questions"));
  assert(runtime?.content.includes("Peu de questions"));
});

Deno.test("active handoff explains the three visible settings without mutation", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux un ton direct et moins de questions",
    requested_patch: {
      "coach.tone": "direct",
      "coach.question_tendency": "low",
    },
  });
  const supabase = fakeWriteDetectingSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "ça fait quoi exactement ces réglages ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-explain",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "explained");
  assertEquals(supabase.wrote, false);
  assert(runtime?.content.includes("Ton global"));
  assert(runtime?.content.includes("Niveau de challenge"));
  assert(runtime?.content.includes("Tendance à poser des questions"));
  assert(runtime?.content.includes("zéro emoji"));
  assert(runtime?.content.includes("il faut passer"));
  assert(runtime?.content.includes("Préférences coach"));
});

Deno.test("active handoff explains comparison phrasing without revision", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux un ton direct et un challenge équilibré",
    requested_patch: {
      "coach.tone": "direct",
      "coach.challenge_level": "balanced",
    },
  });
  const supabase = fakeWriteDetectingSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage:
      "Ça change quoi exactement challenge équilibré par rapport au ton direct ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-explain-compare",
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "explained");
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(supabase.wrote, false);
  assert(runtime?.content.includes("Ton global"));
  assert(runtime?.content.includes("Niveau de challenge"));
  assert(runtime?.content.includes("Très direct"));
  assert(runtime?.content.includes("Équilibré"));
});

Deno.test("active handoff explains combined challenge and question settings", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux plus de challenge et moins de questions",
    requested_patch: {
      "coach.challenge_level": "high",
      "coach.question_tendency": "low",
    },
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeStatusSupabase([]),
    userId: "u1",
    userMessage:
      "Concrètement, ça fait quoi niveau de challenge élevé et peu de questions ensemble ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-explain-combined",
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "explained");
  assert(runtime?.content.includes("Niveau de challenge"));
  assert(runtime?.content.includes("Élevé"));
  assert(runtime?.content.includes("Tendance à poser des questions"));
  assert(runtime?.content.includes("Peu de questions"));
});

Deno.test("revise_handoff updates recommendation", async () => {
  const draft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: "tu veux un ton direct",
    requested_patch: { "coach.tone": "direct" },
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase: fakeStatusSupabase([]),
    userId: "u1",
    userMessage: "plutôt plus doux",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __coach_preference_handoff_state_v1: {
        skill_id: "update_coach_preferences",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 4,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
      __active_tool_skill_intake: {
        operation_type: "update_coach_preferences",
        operation_input: {
          slot_filler: structuredCoachPreferencesSlotFiller(
            readyCoachPreferencesStatePatch("coach.tone", "soft"),
          ),
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-revise",
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "revise_handoff");
  assert(runtime?.content.includes("Doux"));
});

Deno.test("punctual instruction does not create durable handoff unless user asks durable", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "Juste pour cette réponse, fais court.",
    trigger_message_id: "m-punctual",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "punctual_instruction",
      reason: { evidence: ["juste pour cette réponse"], confidence: "high" },
    }),
  });
  assertEquals(output.status, "punctual_instruction");
  assertEquals(output.handoff_draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("unsupported preference is explained without write", async () => {
  const output = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Pour la suite, réponds toujours en 3 lignes sans question finale.",
    trigger_message_id: "m-unsupported",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller({
      user_intent: "unsupported_preference",
      reason: {
        evidence: ["3 lignes sans question finale"],
        confidence: "high",
      },
    }),
  });
  assertEquals(output.status, "unsupported_preference");
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.handoff_draft?.supported_settings.length, 0);
  assertEquals(output.handoff_draft?.unsupported_parts.length, 1);
});

Deno.test("status of existing preferences remains read-only", async () => {
  const reply = await buildCoachPreferencesStatusReply({
    supabase: fakeStatusSupabase([
      {
        key: "coach.tone",
        value: { value: "direct" },
        source_type: "ui",
      },
    ]),
    userId: "u1",
    fallback: "fallback",
  });
  assertEquals(reply, "Oui. Préférences coach actives : ton très direct.");
});

Deno.test("runtime_policy still reads existing preferences", () => {
  const policy = loadCoachPreferenceRuntimePolicy([
    { key: "coach.tone", value: { value: "direct" } },
    { key: "coach.challenge_level", value: { value: "balanced" } },
    { key: "coach.question_tendency", value: { value: "low" } },
  ]);
  assertEquals(policy.tone, "direct");
  assertEquals(policy.challenge_level, "balanced");
  assertEquals(policy.question_tendency, "low");
  assert(
    policy.composer_constraints.some((line) =>
      line.includes("ton très direct")
    ),
  );
});

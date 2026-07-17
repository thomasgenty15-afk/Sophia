import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  POTION_SUPPORT_LOCAL_DISPATCHER_SYSTEM_PROMPT,
  runPotionSupportLocalDispatcher,
} from "./local_flow.ts";
import {
  armPotionSupportAdmission,
  readPotionSupportAdmissionState,
} from "./state.ts";

const context = {
  source: "potion_support" as const,
  source_potion_session_id: "session-1",
  recurring_reminder_id: "reminder-1",
  scheduled_checkin_id: "checkin-1",
  day_index: 1,
  topic_hint: "entretien demain",
  opening_focus: "la gorge se serre quand on l'interrompt",
  anchor_evidence_refs: [],
  awaiting_first_reply: true as const,
};

Deno.test("potion admission state is armed without Presence", () => {
  const memory = armPotionSupportAdmission({
    tempMemory: {},
    nowIso: "2026-07-17T10:00:00.000Z",
    context: {
      source_potion_session_id: context.source_potion_session_id,
      recurring_reminder_id: context.recurring_reminder_id,
      scheduled_checkin_id: context.scheduled_checkin_id,
      day_index: 1,
      topic_hint: context.topic_hint,
      opening_focus: context.opening_focus,
      anchor_evidence_refs: [],
    },
  });
  const state = readPotionSupportAdmissionState(
    memory.__active_conversation_skill_v1,
  );
  assertEquals(state?.skill_id, "potion_support_admission_v1");
  assertEquals(
    state?.working_state.potion_support_admission.awaiting_first_reply,
    true,
  );
});

Deno.test("related emotional update continues to Presence", async () => {
  const decision = await runPotionSupportLocalDispatcher({
    userId: "user-1",
    userMessage: "La gorge se serre encore, mais le debut etait plus pose.",
    recentMessages: [],
    phase: "first_reply",
    context,
    runner: async () => ({
      action: "continue_support",
      confidence: "high",
      relation: "related",
      reason: "La reponse poursuit exactement le fil de l'ouverture.",
      terminal_reason: null,
    }),
  });
  assertEquals(decision.action, "continue_support");
  assertEquals(decision.note_information, null);
});

Deno.test("explicitly obsolete context requests durable campaign cancellation", async () => {
  const decision = await runPotionSupportLocalDispatcher({
    userId: "user-1",
    userMessage: "L'entretien est annule, cette potion n'est plus pertinente.",
    recentMessages: [],
    phase: "first_reply",
    context,
    runner: async () => ({
      action: "cancel_campaign",
      confidence: "high",
      relation: "campaign_boundary",
      reason: "Le contexte suivi a disparu.",
      terminal_reason: "cancelled_context_obsolete",
    }),
  });
  assertEquals(decision.action, "cancel_campaign");
  assertEquals(decision.terminal_reason, "cancelled_context_obsolete");
  assertEquals(decision.note_information?.target_dispatcher, "global");
});

Deno.test("local closure never cancels the campaign", async () => {
  const decision = await runPotionSupportLocalDispatcher({
    userId: "user-1",
    userMessage: "Je m'arrete la pour ce soir, a demain.",
    recentMessages: [],
    phase: "presence_continuation",
    context,
    runner: async () => ({
      action: "close_session",
      confidence: "high",
      relation: "session_boundary",
      reason: "Cloture de la session seulement.",
      terminal_reason: null,
    }),
  });
  assertEquals(decision.action, "close_session");
  assertEquals(decision.terminal_reason, null);
});

Deno.test("low-confidence cancellation is downgraded to global exit", async () => {
  const decision = await runPotionSupportLocalDispatcher({
    userId: "user-1",
    userMessage: "Ca va un peu mieux.",
    recentMessages: [],
    phase: "first_reply",
    context,
    runner: async () => ({
      action: "cancel_campaign",
      confidence: "medium",
      relation: "campaign_boundary",
      reason: "Possible resolution.",
      terminal_reason: "completed_resolved",
    }),
  });
  assertEquals(decision.action, "exit_to_global_dispatcher");
  assertEquals(decision.terminal_reason, null);
});

Deno.test("device pull exits only to the global dispatcher", async () => {
  const decision = await runPotionSupportLocalDispatcher({
    userId: "user-1",
    userMessage: "Fais-moi une carte de defense pour ca.",
    recentMessages: [],
    phase: "presence_continuation",
    context,
    runner: async () => ({
      action: "exit_to_global_dispatcher",
      confidence: "high",
      relation: "other",
      reason: "Demande explicite d'un dispositif nomme.",
      terminal_reason: null,
    }),
  });
  assertEquals(decision.action, "exit_to_global_dispatcher");
  assertEquals(decision.note_information?.target_dispatcher, "global");
  assertEquals(
    JSON.stringify(decision.note_information).includes(
      '"target_dispatcher":"coaching_recommendation"',
    ),
    false,
  );
});

Deno.test("dispatcher prompt separates session closure and campaign boundary", () => {
  assertStringIncludes(
    POTION_SUPPORT_LOCAL_DISPATCHER_SYSTEM_PROMPT,
    "Je m'arrete pour ce soir' n'annule jamais la campagne",
  );
  assertStringIncludes(
    POTION_SUPPORT_LOCAL_DISPATCHER_SYSTEM_PROMPT,
    "AUCUNE destination locale produit",
  );
});


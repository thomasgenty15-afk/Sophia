import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/assert_string_includes.ts";

import { buildWeeklyConversationDigestUserPrompt } from "../_shared/v2-prompts/weekly-conversation-digest.ts";
import type { ConversationPulse } from "../_shared/v2-types.ts";
import { buildWeeklyConversationDigestInput } from "./weekly_conversation_digest_builder.ts";

function pulse(overrides: Partial<ConversationPulse> = {}): ConversationPulse {
  return {
    version: 1,
    generated_at: "2026-03-24T10:00:00.000Z",
    window_days: 7,
    last_72h_weight: 0.7,
    tone: {
      dominant: "mixed",
      emotional_load: "medium",
      relational_openness: "open",
    },
    trajectory: {
      direction: "flat",
      confidence: "medium",
      summary: "Semaine en dents de scie avec un léger mieux en fin de semaine.",
    },
    signals: {
      top_blocker: null,
      likely_need: "simplify",
      proactive_risk: "medium",
      upcoming_event: null,
    },
    highlights: {
      wins: ["Reprise de la marche", "Méditation courte gardée"],
      friction_points: ["Fatigue du soir", "Charge mentale du déménagement"],
      support_that_helped: ["Respiration 5 min"],
      unresolved_tensions: ["Sommeil fragile"],
    },
    evidence_refs: {
      message_ids: [],
      event_ids: [],
    },
    ...overrides,
  } as ConversationPulse;
}

Deno.test("weekly digest builder input counts user messages and active days", () => {
  const input = buildWeeklyConversationDigestInput({
    messages: [
      {
        id: "m1",
        role: "assistant",
        text: "Petit check-in.",
        created_at: "2026-03-17T08:00:00Z",
      },
      {
        id: "m2",
        role: "user",
        text: "J'ai repris la marche ce matin.",
        created_at: "2026-03-17T08:01:00Z",
      },
      {
        id: "m3",
        role: "user",
        text: "Ce soir je suis rincé.",
        created_at: "2026-03-18T20:30:00Z",
      },
      {
        id: "m4",
        role: "assistant",
        text: "On simplifie demain.",
        created_at: "2026-03-18T20:31:00Z",
      },
      {
        id: "m5",
        role: "user",
        text: "J'ai quand même fait 10 min de méditation.",
        created_at: "2026-03-20T07:15:00Z",
      },
    ],
    dailyBilans: [],
    eventMemories: [],
    latestPulse: null,
    weekStart: "2026-03-17",
    timezone: "Europe/Paris",
    nowIso: "2026-03-24T09:00:00Z",
  });

  assertEquals(input.message_count, 3);
  assertEquals(input.active_days, 3);
  assertEquals(input.messages.length, 5);
  assertEquals(input.latest_pulse, null);
});

Deno.test("weekly digest builder input injects pulse summary and dedupes side context", () => {
  const input = buildWeeklyConversationDigestInput({
    messages: [
      {
        id: "m1",
        role: "user",
        text: "J'avance un peu.",
        created_at: "2026-03-17T08:01:00Z",
      },
    ],
    dailyBilans: [
      {
        date: "2026-03-18",
        mode: "check_light",
        target_items: ["Marche"],
        outcome: "Bilan envoyé",
      },
      {
        date: "2026-03-18",
        mode: "check_light",
        target_items: ["Marche"],
        outcome: "Bilan envoyé",
      },
    ],
    eventMemories: [
      {
        id: "evt-1",
        title: "Déménagement",
        date: "2026-03-20",
        relevance: "Source de stress importante",
      },
      {
        id: "evt-1",
        title: "Déménagement",
        date: "2026-03-20",
        relevance: "Source de stress importante",
      },
    ],
    latestPulse: pulse(),
    weekStart: "2026-03-17",
    timezone: "Europe/Paris",
    nowIso: "2026-03-24T09:00:00Z",
  });

  assertEquals(input.daily_bilans.length, 1);
  assertEquals(input.event_memories.length, 1);
  assertEquals(input.latest_pulse?.tone_dominant, "mixed");
  assertEquals(input.latest_pulse?.likely_need, "simplify");
  assert(input.latest_pulse?.wins.includes("Reprise de la marche"));
});

Deno.test("weekly digest builder prompt includes digest-specific context", () => {
  const input = buildWeeklyConversationDigestInput({
    messages: [
      {
        id: "m1",
        role: "user",
        text: "Le déménagement me fatigue, mais j'ai quand même marché.",
        created_at: "2026-03-17T08:01:00Z",
      },
    ],
    dailyBilans: [
      {
        date: "2026-03-18",
        mode: "check_blocker",
        target_items: ["Marche"],
        outcome: "Charge mentale élevée",
      },
    ],
    eventMemories: [
      {
        id: "evt-1",
        title: "Déménagement",
        date: "2026-03-20",
        relevance: "Contexte majeur de la semaine",
      },
    ],
    latestPulse: pulse(),
    weekStart: "2026-03-17",
    timezone: "Europe/Paris",
    nowIso: "2026-03-24T09:00:00Z",
  });

  const prompt = buildWeeklyConversationDigestUserPrompt(input);

  assertStringIncludes(prompt, "Messages de la semaine (1 messages user, 1 jours actifs)");
  assertStringIncludes(prompt, "Bilans quotidiens de la semaine");
  assertStringIncludes(prompt, "check_blocker");
  assertStringIncludes(prompt, "Déménagement");
  assertStringIncludes(prompt, "Dernier conversation pulse");
});

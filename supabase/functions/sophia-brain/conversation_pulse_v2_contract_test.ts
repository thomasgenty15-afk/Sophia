import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";

import {
  buildConversationPulseInput,
  DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
  WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
} from "./conversation_pulse_builder.ts";
import { parseConversationPulseLLMResponse } from "../_shared/v2-prompts/conversation-pulse.ts";

Deno.test("conversation pulse v2: parser keeps bounded emotional anchors", () => {
  const input = buildConversationPulseInput({
    messages: [
      {
        id: "m1",
        role: "user",
        text: "Hier c'était vraiment lourd avec ma famille.",
        created_at: "2026-06-10T18:00:00.000Z",
      },
      {
        id: "m2",
        role: "assistant",
        text: "Je comprends, on peut le prendre doucement.",
        created_at: "2026-06-10T18:01:00.000Z",
      },
      {
        id: "m3",
        role: "user",
        text: "Oui, juste un message doux demain ça pourrait aider.",
        created_at: "2026-06-10T18:02:00.000Z",
      },
    ],
    recentBilans: [],
    eventMemories: [],
    localDate: "2026-06-10",
    nowIso: "2026-06-10T18:05:00.000Z",
  });

  const result = parseConversationPulseLLMResponse(
    JSON.stringify({
      tone: {
        dominant: "strained",
        emotional_load: "high",
        relational_openness: "open",
      },
      trajectory: {
        direction: "mixed",
        confidence: "medium",
        summary: "Charge familiale forte mais ouverture au soutien.",
      },
      highlights: {
        wins: ["A demandé une forme de soutien claire."],
        friction_points: ["Tension familiale récente."],
        support_that_helped: ["Réponse douce et courte."],
        unresolved_tensions: ["Sujet familial encore sensible."],
      },
      emotional_anchors: [
        {
          topic_summary: "tension familiale récente",
          intensity: "high",
          recency: "same_day",
          grounding: "L'utilisateur dit que c'était lourd avec sa famille.",
          use_in_proactive: true,
          specificity: "soft_reference",
          caution: "Ne pas relancer avec trop de détails.",
        },
        {
          topic_summary: "besoin de douceur le lendemain",
          intensity: "medium",
          recency: "same_window",
          grounding: "L'utilisateur demande un message doux demain.",
          use_in_proactive: true,
          specificity: "explicit_reference",
          caution: null,
        },
        {
          topic_summary: "doit être clamped",
          intensity: "medium",
          recency: "same_window",
          grounding: "Trop d'anchors.",
          use_in_proactive: false,
          specificity: "none",
          caution: null,
        },
      ],
      signals: {
        top_blocker: "charge émotionnelle",
        likely_need: "support",
        upcoming_event: null,
        proactive_risk: "medium",
      },
      evidence_refs: {
        message_ids: ["m1", "m2", "m3"],
        event_ids: [],
      },
    }),
    input,
    "2026-06-10T18:05:00.000Z",
  );

  assert(!result.valid);
  assertEquals(result.pulse.emotional_anchors?.length, 2);
  assertEquals(
    result.pulse.emotional_anchors?.[0].topic_summary,
    "tension familiale récente",
  );
});

Deno.test("conversation pulse v2: snapshot type constants are V2 only", () => {
  assertEquals(
    WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
    "watcher_conversation_pulse_v2",
  );
  assertEquals(
    DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
    "daily_conversation_pulse_v2",
  );
  assert(
    ![
      WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
      DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
    ].includes("conversation_pulse"),
  );
});

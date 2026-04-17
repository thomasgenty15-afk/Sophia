import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/assert_string_includes.ts";

import { buildConversationPulseUserPrompt } from "../_shared/v2-prompts/conversation-pulse.ts";
import { parseConversationPulseLLMResponse } from "../_shared/v2-prompts/conversation-pulse.ts";
import { buildConversationPulseInput } from "./conversation_pulse_builder.ts";

function parseTranscriptMessages(transcript: string, bundleKey: string) {
  const blocks = transcript.trim().split(/\n{2,}(?=\[)/).filter(Boolean);
  const messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    created_at: string;
  }> = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const lines = block.split("\n");
    const header = lines.shift() ?? "";
    const match = header.match(
      /^\[([^\]]+)\]\s+\[[^\]]+\]\s+(assistant|user)(?:\s+\([^)]+\))?:$/,
    );
    if (!match) continue;
    const createdAt = String(match[1] ?? "").trim();
    const role = String(match[2] ?? "").trim() as "user" | "assistant";
    const text = lines.join("\n").trim();
    if (!createdAt || !text) continue;
    messages.push({
      id: `${bundleKey}:msg:${index + 1}`,
      role,
      text,
      created_at: createdAt,
    });
  }

  return messages;
}

Deno.test("conversation pulse builder: real Thomas bundle builds valid input", async () => {
  const path =
    "./tmp/bundles/2026-03-18/bundle_thomas_cf470156_2026-03-18T142458964Z/conversation_transcript.txt";
  const transcript = await Deno.readTextFile(path);
  const messages = parseTranscriptMessages(transcript, "thomas-2026-03-18");

  const input = buildConversationPulseInput({
    messages,
    recentBilans: [
      {
        kind: "daily",
        date: "2026-03-18",
        summary: "Bonne énergie, rappel demandé pour les pompes.",
      },
    ],
    eventMemories: [
      {
        id: "evt-rdv",
        title: "Rendez-vous de vendredi",
        date: "2026-03-20",
        relevance: "Échéance proche et souvent mentionnée.",
      },
    ],
    recentTransformationHandoff: {
      transformation_id: "transfo-prev",
      title: "Reprendre du souffle",
      completed_at: "2026-03-17T12:00:00Z",
      wins: ["Deux séances tenues dans la semaine"],
      relational_signals: ["Répond mieux aux rappels courts"],
      coaching_memory_summary: "Les formulations très courtes et concrètes passent mieux.",
      questionnaire_context: ["Supports déjà aidants à conserver: marche, respiration."],
    },
    localDate: "2026-03-18",
    nowIso: "2026-03-18T15:00:00+01:00",
  });

  assert(messages.length >= 10);
  assertEquals(input.messages.length, messages.length);
  assertEquals(input.messages_last_72h_count, messages.length);
  assertEquals(input.recent_bilans.length, 1);
  assertEquals(input.event_memories.length, 1);

  const prompt = buildConversationPulseUserPrompt(input);
  assertStringIncludes(prompt, "quelle heure est injectee dans ton prompt");
  assertStringIncludes(prompt, "id=evt-rdv");
  assertStringIncludes(prompt, "Handoff récent de transformation");
  assertStringIncludes(prompt, "Répond mieux aux rappels courts");
});

Deno.test("conversation pulse builder: real Thomas bundle validates plausible pulse", async () => {
  const path =
    "./tmp/bundles/2026-03-18/bundle_thomas_cf470156_2026-03-18T142458964Z/conversation_transcript.txt";
  const transcript = await Deno.readTextFile(path);
  const messages = parseTranscriptMessages(transcript, "thomas-2026-03-18");
  const input = buildConversationPulseInput({
    messages,
    recentBilans: [],
    eventMemories: [
      {
        id: "evt-rdv",
        title: "Rendez-vous imminent",
        date: "2026-03-20",
        relevance: "Point de focus récurrent.",
      },
    ],
    localDate: "2026-03-18",
    nowIso: "2026-03-18T15:00:00+01:00",
  });

  const raw = JSON.stringify({
    tone: {
      dominant: "mixed",
      emotional_load: "medium",
      relational_openness: "open",
    },
    trajectory: {
      direction: "up",
      confidence: "medium",
      summary:
        "L'élan est bon mais une friction de confiance persiste autour du timing.",
    },
    highlights: {
      wins: [
        "Focus fort avant le rendez-vous",
        "Victoire sur le porno",
        "Confiance qui monte",
      ],
      friction_points: [
        "Erreur de date relevée",
        "Friction sur le fuseau horaire",
      ],
      support_that_helped: ["Rappel demandé pour les pompes"],
      unresolved_tensions: ["Besoin de fiabilité sur le timing"],
    },
    signals: {
      top_blocker: "Fiabilité perçue sur l'heure et le timing",
      likely_need: "push",
      upcoming_event: "Rendez-vous de vendredi",
      proactive_risk: "medium",
    },
    evidence_refs: {
      message_ids: input.messages.slice(-4).map((message) => message.id),
      event_ids: ["evt-rdv"],
    },
  });

  const result = parseConversationPulseLLMResponse(
    raw,
    input,
    "2026-03-18T14:10:00.000Z",
  );

  assert(result.valid);
  assertEquals(result.pulse.signals.likely_need, "push");
  assertEquals(result.pulse.evidence_refs.event_ids, ["evt-rdv"]);
  assert(result.pulse.evidence_refs.message_ids.length >= 3);
});

Deno.test("conversation pulse builder: real Christele bundle preserves low-signal caution", async () => {
  const path =
    "./tmp/bundles/2026-03-17/bundle_christele_eaa65458_2026-03-17T165433915Z/conversation_transcript.txt";
  const transcript = await Deno.readTextFile(path);
  const messages = parseTranscriptMessages(transcript, "christele-2026-03-17");
  const input = buildConversationPulseInput({
    messages: messages.slice(0, 2),
    recentBilans: [],
    eventMemories: [],
    localDate: "2026-03-17",
    nowIso: "2026-03-17T17:00:00+01:00",
  });

  const raw = JSON.stringify({
    tone: {
      dominant: "closed",
      emotional_load: "medium",
      relational_openness: "fragile",
    },
    trajectory: {
      direction: "down",
      confidence: "high",
      summary: "Peu de matière.",
    },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "support",
      upcoming_event: null,
      proactive_risk: "medium",
    },
    evidence_refs: {
      message_ids: input.messages.map((message) => message.id),
      event_ids: [],
    },
  });

  const result = parseConversationPulseLLMResponse(
    raw,
    input,
    "2026-03-17T16:10:00.000Z",
  );

  assert(!result.valid);
  assertEquals(result.pulse.trajectory.direction, "flat");
  assertEquals(result.pulse.trajectory.confidence, "low");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

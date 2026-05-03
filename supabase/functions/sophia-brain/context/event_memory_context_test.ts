import { buildContextString } from "./loader.ts";
import { formatEventMemoriesForPrompt } from "../event_memory.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

Deno.test("formatEventMemoriesForPrompt: renders active event block", () => {
  const block = formatEventMemoriesForPrompt([
    {
      event_id: "evt_1",
      event_key: "rendez_vous_galant_2026_03_13",
      title: "Rendez-vous galant vendredi",
      summary:
        "Le rendez-vous de vendredi réactive à la fois confiance et stress.",
      event_type: "romantic_date",
      starts_at: "2026-03-13T19:00:00.000Z",
      ends_at: null,
      relevance_until: "2026-03-16T00:00:00.000Z",
      time_precision: "approximate",
      status: "upcoming",
      confidence: 0.8,
      mention_count: 1,
      last_confirmed_at: "2026-03-11T12:00:00.000Z",
      metadata: {},
      event_similarity: 0.9,
    },
  ]);

  assert(
    block.includes("=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ==="),
    "missing event memory header",
  );
  assert(block.includes("Rendez-vous galant vendredi"), "missing event title");
  assert(block.includes("romantic_date"), "missing event type");
});

Deno.test("buildContextString: event and global memories come before topic memories", () => {
  const ctx = buildContextString({
    eventMemories: "=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ===\nEVENT\n\n",
    globalMemories: "=== MÉMOIRE GLOBALE THÉMATIQUE ===\nGLOBAL\n\n",
    topicMemories: "=== MÉMOIRE THÉMATIQUE ===\nTOPIC\n\n",
  });

  const eventIndex = ctx.indexOf("=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ===");
  const globalIndex = ctx.indexOf("=== MÉMOIRE GLOBALE THÉMATIQUE ===");
  const topicIndex = ctx.indexOf("=== MÉMOIRE THÉMATIQUE ===");
  assert(eventIndex >= 0, "event block missing");
  assert(globalIndex >= 0, "global block missing");
  assert(topicIndex >= 0, "topic block missing");
  assert(
    eventIndex < globalIndex,
    "event memories should be injected before global memories",
  );
  assert(
    globalIndex < topicIndex,
    "global memories should be injected before topic memories",
  );
});

Deno.test("buildContextString: active memory V2 payload precedes legacy memory blocks", () => {
  const ctx = buildContextString({
    memoryV2Payload: "=== MEMOIRE V2 ACTIVE ===\n- item v2\n\n",
    eventMemories: "=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ===\nEVENT\n\n",
    topicMemories: "=== MÉMOIRE THÉMATIQUE ===\nTOPIC\n\n",
  });
  const v2Index = ctx.indexOf("=== MEMOIRE V2 ACTIVE ===");
  const eventIndex = ctx.indexOf("=== MÉMOIRE ÉVÉNEMENTIELLE ACTIVE ===");
  assert(v2Index >= 0, "v2 block missing");
  assert(eventIndex >= 0, "event block missing");
  assert(
    v2Index < eventIndex,
    "v2 active payload should be first memory block",
  );
});

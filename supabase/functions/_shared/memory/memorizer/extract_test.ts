import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildExtractionPrompt,
  extractMemoryCandidates,
  parseExtractionJson,
} from "./extract.ts";

Deno.test("extract parser accepts strict JSON payload", () => {
  const parsed = parseExtractionJson(JSON.stringify({
    memory_items: [{
      kind: "statement",
      content_text: "Le user dit avoir peur.",
      domain_keys: ["psychologie.emotions"],
      confidence: 0.8,
      sensitivity_level: "sensitive",
      source_message_ids: ["m1"],
    }],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }));
  assertEquals(parsed.memory_items[0].kind, "statement");
});

Deno.test("extract parser rejects invalid JSON", () => {
  assertThrows(
    () => parseExtractionJson("not-json"),
    Error,
    "memory_v2_extraction_invalid_json",
  );
});

Deno.test("extract builds prompt and uses injectable provider", async () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier j'ai marche.",
    }],
  });
  assertEquals(prompt.user_payload.includes("domain_keys_taxonomy"), true);
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier j'ai marche.",
    }],
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [],
        entities: [],
        corrections: [],
        rejected_observations: [{ reason: "small_talk", text: "x" }],
      }),
  });
  assertEquals(out.rejected_observations.length, 1);
});

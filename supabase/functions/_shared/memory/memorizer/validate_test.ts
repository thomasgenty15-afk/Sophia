import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateExtractionPayload } from "./validate.ts";

Deno.test("validation accepts valid statement and rejects each deterministic rule", () => {
  const source = [{ id: "m1", user_id: "u" }];
  const result = validateExtractionPayload({
    memory_items: [
      {
        kind: "statement",
        content_text: "Le user dit se sentir nul.",
        domain_keys: ["psychologie.estime_de_soi"],
        confidence: 0.8,
        sensitivity_level: "sensitive",
        sensitivity_categories: ["shame"],
        source_message_ids: ["m1"],
      },
      {
        kind: "fact",
        content_text: "Le user est nul.",
        domain_keys: ["psychologie.estime_de_soi"],
        confidence: 0.8,
        sensitivity_level: "sensitive",
        source_message_ids: ["m1"],
      },
      {
        kind: "event",
        content_text: "Il s'est passe un truc.",
        domain_keys: ["sante.sommeil"],
        confidence: 0.8,
        sensitivity_level: "normal",
        source_message_ids: ["m1"],
      },
      {
        kind: "statement",
        content_text: "Le user est depressif.",
        domain_keys: ["psychologie.emotions"],
        confidence: 0.8,
        sensitivity_level: "sensitive",
        source_message_ids: ["m1"],
      },
      {
        kind: "statement",
        content_text: "No source.",
        domain_keys: ["unknown.key"],
        confidence: 0.3,
        sensitivity_level: "normal",
        source_message_ids: [],
      },
    ],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }, source);
  assertEquals(result.accepted_items.length, 1);
  assertEquals(result.statement_as_fact_violation_count, 1);
  const codes = result.rejected_items.flatMap((r) =>
    r.issues.map((i) => i.code)
  );
  assertEquals(codes.includes("statement_as_fact"), true);
  assertEquals(codes.includes("event_missing_date"), true);
  assertEquals(codes.includes("diagnostic_attempt"), true);
  assertEquals(codes.includes("invalid_domain_key"), true);
  assertEquals(codes.includes("low_confidence"), true);
  assertEquals(codes.includes("no_source"), true);
});

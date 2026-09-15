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
      {
        kind: "statement",
        content_text: "Budget maximum de 600 euros pour le voyage.",
        domain_keys: ["habitudes.planification"],
        confidence: 0.8,
        sensitivity_level: "normal",
        sensitivity_categories: ["financial"],
        source_message_ids: ["m1"],
      },
    ],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }, source);
  assertEquals(result.accepted_items.length, 2);
  const budgetItem = result.accepted_items.find((item) =>
    item.content_text.includes("Budget maximum")
  );
  assertEquals(budgetItem?.sensitivity_level, "sensitive");
  assertEquals(
    budgetItem?.metadata?.sensitivity_promoted_from,
    "normal",
  );
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

Deno.test("validation demotes subjective fact phrasing to statement", () => {
  const result = validateExtractionPayload({
    memory_items: [
      {
        kind: "fact",
        content_text:
          "L'utilisateur craint que demander de l'aide soit percu comme une faiblesse.",
        domain_keys: ["psychologie.estime_de_soi"],
        confidence: 0.8,
        sensitivity_level: "normal",
        source_message_ids: ["m1"],
      },
      {
        kind: "fact",
        content_text:
          "Son manager Karim lui met une forte pression en reunion, ce qui provoque parfois un sentiment d'humiliation.",
        domain_keys: ["travail.conflits"],
        confidence: 0.8,
        sensitivity_level: "sensitive",
        sensitivity_categories: ["work"],
        source_message_ids: ["m1"],
      },
      {
        kind: "fact",
        content_text:
          "Depuis deux semaines, l'utilisateur dort mal quand il scrolle apres minuit.",
        domain_keys: ["sante.sommeil"],
        confidence: 0.8,
        sensitivity_level: "normal",
        source_message_ids: ["m1"],
      },
      {
        kind: "fact",
        content_text:
          "Éprouve de la peur à demander de l'aide par crainte que cela ne le rende faible.",
        domain_keys: ["psychologie.peur_echec"],
        confidence: 0.8,
        sensitivity_level: "normal",
        source_message_ids: ["m1"],
      },
    ],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }, [{ id: "m1", user_id: "u" }]);

  assertEquals(result.accepted_items.length, 4);
  assertEquals(result.accepted_items[0].kind, "statement");
  assertEquals(result.accepted_items[0].metadata?.demoted_from_kind, "fact");
  assertEquals(result.accepted_items[1].kind, "statement");
  assertEquals(result.accepted_items[2].kind, "statement");
  assertEquals(result.accepted_items[3].kind, "statement");
});

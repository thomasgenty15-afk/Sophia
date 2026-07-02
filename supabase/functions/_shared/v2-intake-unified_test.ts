import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import { parseUnifiedIntakeOutput, UnifiedIntakeError } from "./v2-intake-unified.ts";

function validUnifiedIntakeJson(): string {
  return JSON.stringify({
    aspects: [
      {
        label: "Reprendre le sport",
        raw_excerpt: "je veux reprendre le sport",
        source_rank: 1,
      },
    ],
    deferred_aspects: [],
    uncertain_aspects: [],
    transformations: [
      {
        source_group_index: 1,
        group_label: "sport régulier",
        aspect_ranks: [1],
        title: "Reprendre une pratique sportive régulière",
        internal_summary: "L'utilisateur veut reprendre le sport de façon régulière.",
        user_summary: "Tu veux remettre du mouvement dans ta semaine.",
        questionnaire_context: [
          "fréquence actuelle",
          "contraintes de planning",
          "type de sport accessible",
        ],
        recommended_progress_indicator: "Nombre de séances réalisées par semaine",
        recommended_order: 1,
        ordering_rationale: "C'est le seul axe actif exprimé.",
      },
    ],
    needs_clarification: false,
    clarification_prompt: null,
  });
}

Deno.test("parseUnifiedIntakeOutput accepts strict JSON", () => {
  const output = parseUnifiedIntakeOutput(validUnifiedIntakeJson());
  assertEquals(output.transformations[0].recommended_order, 1);
});

Deno.test("parseUnifiedIntakeOutput accepts fenced JSON", () => {
  const output = parseUnifiedIntakeOutput(
    `\`\`\`json\n${validUnifiedIntakeJson()}\n\`\`\``,
  );
  assertEquals(output.aspects[0].source_rank, 1);
});

Deno.test("parseUnifiedIntakeOutput extracts JSON from surrounding text", () => {
  const output = parseUnifiedIntakeOutput(
    `Voici le JSON demandé:\n${validUnifiedIntakeJson()}\nFin.`,
  );
  assertEquals(
    output.transformations[0].title,
    "Reprendre une pratique sportive régulière",
  );
});

Deno.test("parseUnifiedIntakeOutput rejects schema-invalid JSON", () => {
  const error = assertThrows(
    () => parseUnifiedIntakeOutput(`{"aspects":[]}`),
    UnifiedIntakeError,
  );
  assertEquals(
    error.message.startsWith("Unified intake output failed validation:"),
    true,
  );
});

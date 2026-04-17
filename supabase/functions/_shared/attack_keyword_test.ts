import { assertEquals } from "jsr:@std/assert@1";

import {
  detectAttackKeywordTrigger,
  normalizeAttackKeyword,
} from "./attack_keyword.ts";

Deno.test("normalizeAttackKeyword normalizes accents, case and punctuation", () => {
  assertEquals(normalizeAttackKeyword("  Sílèx! "), "silex");
  assertEquals(normalizeAttackKeyword("ANCRE"), "ancre");
});

Deno.test("detectAttackKeywordTrigger matches exact single-word keyword only", () => {
  const match = detectAttackKeywordTrigger("Silex", [
    {
      payload: {
        activation_keyword: "Silex",
        activation_keyword_normalized: "silex",
        risk_situation: "Le soir, juste avant de craquer.",
        strength_anchor: "Ta dignite.",
        first_response_intent: "Stabiliser d'abord.",
        assistant_prompt: "Aide-le a tenir maintenant.",
      },
      data: { id: "attack-1" },
    },
  ]);

  assertEquals(match?.data.id, "attack-1");
  assertEquals(detectAttackKeywordTrigger("silex stp", match ? [match] : []), null);
  assertEquals(detectAttackKeywordTrigger("", match ? [match] : []), null);
});

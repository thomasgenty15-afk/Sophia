import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripHiddenHtmlComments } from "./response_visibility_formatting.ts";

Deno.test("stripHiddenHtmlComments removes whatsapp fil rouge comments from visible replies", () => {
  const cleaned = stripHiddenHtmlComments(
    "Go Nano.\n<!--fil_rouge_whatsapp: Tu fais un outil de tri; rester sur Nano vs Mini.-->",
  );

  assertEquals(cleaned, "Go Nano.");
});

Deno.test("stripHiddenHtmlComments removes loose internal fil rouge markers", () => {
  const cleaned = stripHiddenHtmlComments(
    "Réponse visible.\nfil_rouge_whatsapp: garder le cap demain",
  );

  assertEquals(cleaned, "Réponse visible.");
});

Deno.test("stripHiddenHtmlComments removes residual html comments", () => {
  const cleaned = stripHiddenHtmlComments(
    "Première phrase.\n<!-- internal classifier note -->\nDeuxième phrase.",
  );

  assertEquals(cleaned, "Première phrase.\nDeuxième phrase.");
});

Deno.test("stripDeprecatedProductVocabulary traduit les slugs internes (P3-E, nina-global18 T15)", async () => {
  const { stripDeprecatedProductVocabulary } = await import(
    "./response_visibility_formatting.ts"
  );
  assertEquals(
    stripDeprecatedProductVocabulary(
      "Je t'ai parlé de attack_card et d'une potion apaisement (state_potion).",
    ),
    "Je t'ai parlé de carte d'attaque et d'une potion apaisement (potion d'état).",
  );
  // Anti-faux-positif: le texte normal ne bouge pas.
  assertEquals(
    stripDeprecatedProductVocabulary("Ta carte d'attaque est prête."),
    "Ta carte d'attaque est prête.",
  );
});

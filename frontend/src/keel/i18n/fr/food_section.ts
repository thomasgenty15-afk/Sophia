// Pack français — le namespace `food_section`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `food_section.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frFoodSection = {
  // ── Dans ALIMENTATION — les intertitres du coach, pas nos colonnes ───────
  "food_section.every_day": "Chaque jour",
  "food_section.every_week": "Chaque semaine",
  "food_section.cutting": "Ce qu’on réduit",
  "food_section.supplements": "Compléments",
} satisfies TranslatedMessagesOf<"food_section">;

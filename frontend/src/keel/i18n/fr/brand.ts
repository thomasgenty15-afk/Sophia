// Pack français — le namespace `brand`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `brand.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frBrand = {
  // ── Marque ───────────────────────────────────────────────────────────────
  "brand.wordmark": "Sophia",
} satisfies TranslatedMessagesOf<"brand">;

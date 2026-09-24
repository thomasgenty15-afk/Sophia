// Pack français — le namespace `priority`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `priority.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPriority = {
  // ── La priorité d'une ligne ──────────────────────────────────────────────
  "priority.core": "Essentiel",
  "priority.secondary": "Secondaire",
  "priority.optional": "Facultatif",
} satisfies TranslatedMessagesOf<"priority">;

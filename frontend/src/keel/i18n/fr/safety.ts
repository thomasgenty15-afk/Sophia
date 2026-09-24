// Pack français — le namespace `safety`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `safety.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frSafety = {
  // ── La note de sécurité, côté coach ──────────────────────────────────────
  "safety.note_title": "Pour information",
  "safety.stat_notes": "Avec une note",
} satisfies TranslatedMessagesOf<"safety">;

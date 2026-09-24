// Pack français — le namespace `timing`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `timing.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frTiming = {
  // ── L'horaire d'une évaluation ───────────────────────────────────────────
  "timing.on_time": "À l’heure",
  "timing.off_window": "Fait, hors de la fenêtre prévue",
  "timing.unknown": "Horaire inconnu",
  "timing.not_applicable": "Pas d’horaire",
} satisfies TranslatedMessagesOf<"timing">;

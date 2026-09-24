// Pack français — le namespace `status`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `status.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frStatus = {
  // ── L'état d'une évaluation (commitment_evaluations.status) ──────────────
  "status.unknown": "Pas encore enregistré",
  "status.met": "Fait",
  "status.partial": "En partie",
  "status.missed": "Manqué",
  "status.not_applicable": "Non compté",
  "status.flex_used": "Souplesse utilisée",
} satisfies TranslatedMessagesOf<"status">;

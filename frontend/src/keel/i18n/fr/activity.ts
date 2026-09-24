// Pack français — le namespace `activity`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `activity.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frActivity = {
  // ── La classe d'activité (plan_commitments.activity_class) ───────────────
  "activity.nutrition": "Nutrition",
  "activity.supplement": "Complément",
  "activity.movement": "Mouvement",
  "activity.recovery": "Récupération",
  "activity.exposure": "Exposition",
  "activity.sleep": "Sommeil",
  "activity.mind": "Mental",
  "activity.measurement": "Mesure",
  "activity.other": "Autre",
} satisfies TranslatedMessagesOf<"activity">;

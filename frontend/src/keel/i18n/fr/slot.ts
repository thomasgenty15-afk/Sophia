// Pack français — le namespace `slot`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `slot.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frSlot = {
  // ── Le vocabulaire des créneaux (slot_vocabulary.label_i18n_key) ─────────
  "slot.on_waking": "Au réveil",
  "slot.breakfast": "Petit-déjeuner",
  "slot.snack_am": "Collation du matin",
  "slot.pre_workout": "Avant l’entraînement",
  "slot.lunch": "Déjeuner",
  "slot.post_workout": "Après l’entraînement",
  "slot.snack_pm": "Collation de l’après-midi",
  "slot.dinner": "Dîner",
  "slot.before_bed": "Au coucher",
  "slot.any_meal": "N’importe quel repas",
  "slot.any_time": "N’importe quand",
} satisfies TranslatedMessagesOf<"slot">;

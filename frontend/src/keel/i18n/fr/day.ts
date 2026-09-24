// Pack français — le namespace `day`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `day.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frDay = {
  // ── Les jours, forme longue (« Chaque lundi et vendredi ») ───────────────
  // En minuscules: un nom de jour ne prend pas de majuscule en français, et
  // c'est `when.every_named` qui ouvre la phrase.
  "day.long.mon": "lundi",
  "day.long.tue": "mardi",
  "day.long.wed": "mercredi",
  "day.long.thu": "jeudi",
  "day.long.fri": "vendredi",
  "day.long.sat": "samedi",
  "day.long.sun": "dimanche",

  // ── Les jours, forme courte ──────────────────────────────────────────────
  "day.mon": "Lun",
  "day.tue": "Mar",
  "day.wed": "Mer",
  "day.thu": "Jeu",
  "day.fri": "Ven",
  "day.sat": "Sam",
  "day.sun": "Dim",
} satisfies TranslatedMessagesOf<"day">;

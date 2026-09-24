// Pack français — le namespace `moment`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `moment.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frMoment = {
  // ── LES CINQ MOMENTS DE LA JOURNÉE ──────────────────────────────────────
  "moment.morning": "Matin",
  "moment.midday": "Midi",
  "moment.afternoon": "Après-midi",
  "moment.evening": "Soir",
  "moment.night": "Nuit",
  // La forme DANS une phrase porte son article: « tombe le matin »,
  // « tombe l’après-midi ». C'est ce qu'un `.toLowerCase()` ne sait pas faire.
  "moment.in.morning": "le matin",
  "moment.in.midday": "le midi",
  "moment.in.afternoon": "l’après-midi",
  "moment.in.evening": "le soir",
  "moment.in.night": "la nuit",
} satisfies TranslatedMessagesOf<"moment">;

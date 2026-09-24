// Seed anglais — le namespace `moment`, et lui seul.
// Assemblé dans `../en.ts`; une clé `moment.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enMoment = {
  // ══════════════════════════════════════════════════════════════════════════
  // LES CINQ MOMENTS DE LA JOURNÉE — un ATOME, pas un écran
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `lib/mealRhythm.ts` portait ces cinq mots dans un `MOMENT_LABELS` local. Ce
  // n'est pas le vocabulaire de `/app/progress`: c'est la bande horaire d'un
  // fait alimentaire, dérivée d'`occurred_at`, et rien n'interdit à un autre
  // écran de la rendre. Elle entre donc comme atome, à côté de `slot.*` (les
  // créneaux NOMMÉS d'un plan) qu'elle ne remplace pas — un créneau est déclaré
  // par le plan, un moment est déduit de l'heure.
  "moment.morning": "Morning",
  "moment.midday": "Midday",
  "moment.afternoon": "Afternoon",
  "moment.evening": "Evening",
  "moment.night": "Night",
  // ⚠️ LA SECONDE FORME EXISTE PARCE QUE `.toLowerCase()` NE TRADUIT PAS. La
  // page composait « lands in the ${MOMENT_LABELS[m].toLowerCase()} », ce qui
  // marche en anglais et échoue en français: « tombe le matin » demande un
  // article, et « tombe dans le matin » n'est pas une phrase. La forme
  // in-sentence est écrite, jamais dérivée.
  "moment.in.morning": "morning",
  "moment.in.midday": "midday",
  "moment.in.afternoon": "afternoon",
  "moment.in.evening": "evening",
  "moment.in.night": "night",
} as const

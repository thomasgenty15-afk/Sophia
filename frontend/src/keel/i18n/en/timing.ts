// Seed anglais — le namespace `timing`, et lui seul.
// Assemblé dans `../en.ts`; une clé `timing.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enTiming = {
  // Timing status (commitment_evaluations.timing_status)
  "timing.on_time": "On time",
  "timing.off_window": "Done, outside the planned window",
  "timing.unknown": "Timing unknown",
  "timing.not_applicable": "No timing",
} as const

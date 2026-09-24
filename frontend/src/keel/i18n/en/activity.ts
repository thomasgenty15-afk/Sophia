// Seed anglais — le namespace `activity`, et lui seul.
// Assemblé dans `../en.ts`; une clé `activity.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enActivity = {
  // Activity class (plan_commitments.activity_class)
  "activity.nutrition": "Nutrition",
  "activity.supplement": "Supplement",
  "activity.movement": "Movement",
  "activity.recovery": "Recovery",
  "activity.exposure": "Exposure",
  "activity.sleep": "Sleep",
  "activity.mind": "Mind",
  "activity.measurement": "Measurement",
  "activity.other": "Other",
} as const

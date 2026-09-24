// Seed anglais — le namespace `food_section`, et lui seul.
// Assemblé dans `../en.ts`; une clé `food_section.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enFoodSection = {
  // Inside FOOD — the coach's own headings, not our columns.
  "food_section.every_day": "Every day",
  "food_section.every_week": "Every week",
  "food_section.cutting": "What we are cutting",
  "food_section.supplements": "Supplements",
} as const

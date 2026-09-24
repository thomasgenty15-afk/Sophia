// Seed anglais — le namespace `deviation`, et lui seul.
// Assemblé dans `../en.ts`; une clé `deviation.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enDeviation = {
  // Declare a deviation (planned_deviations) - first-class, never a confession
  "deviation.title": "Declare a deviation",
  "deviation.subtitle":
    "A restaurant, a trip, a family meal. Say it before it happens: the slot leaves the count instead of scoring zero. This is part of the plan, not a failure.",
  "deviation.kind_label": "What is coming up",
  "deviation.kind.restaurant": "Eating out",
  "deviation.kind.social": "Social event",
  "deviation.kind.travel": "Travel",
  "deviation.kind.family": "Family meal",
  "deviation.kind.work": "Work constraint",
  "deviation.kind.other": "Something else",
  "deviation.when_label": "When",
  "deviation.when_today": "Today",
  "deviation.when_tomorrow": "Tomorrow",
  "deviation.slot_label": "Which slot",
  "deviation.slot_all_day": "The whole day",
  "deviation.note_label": "Anything your coach should know",
  "deviation.note_placeholder": "Optional. Your words, kept as you wrote them.",
  "deviation.submit": "Declare it",
  "deviation.submitting": "Declaring...",
  "deviation.declared": "Declared: {kind} on {date}.",
  "deviation.error": "That did not save. Nothing was declared - try again.",
} as const

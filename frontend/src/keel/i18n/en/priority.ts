// Seed anglais — le namespace `priority`, et lui seul.
// Assemblé dans `../en.ts`; une clé `priority.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPriority = {
  // Priority (plan_commitments.priority)
  "priority.core": "Core",
  "priority.secondary": "Secondary",
  "priority.optional": "Optional",
} as const

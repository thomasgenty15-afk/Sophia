// Seed anglais — le namespace `autonomy`, et lui seul.
// Assemblé dans `../en.ts`; une clé `autonomy.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enAutonomy = {
  // Autonomy (plan_commitments.autonomy, plan_templates.default_autonomy).
  // How much latitude the line grants the student. Said as a sentence, not as
  // the slug: the coach picking this is answering "how much can they change?".
  "autonomy.strict": "Exactly as written",
  "autonomy.swap_within_policy": "Swaps allowed, within the policy below",
  "autonomy.flexible": "Their call",
} as const

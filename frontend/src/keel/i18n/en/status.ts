// Seed anglais — le namespace `status`, et lui seul.
// Assemblé dans `../en.ts`; une clé `status.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enStatus = {
  // Evaluation status (commitment_evaluations.status)
  "status.unknown": "Not logged yet",
  "status.met": "Done",
  "status.partial": "Partly done",
  "status.missed": "Missed",
  "status.not_applicable": "Not counted",
  "status.flex_used": "Flex used",
} as const

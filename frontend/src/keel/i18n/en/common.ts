// Seed anglais — le namespace `common`, et lui seul.
// Assemblé dans `../en.ts`; une clé `common.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enCommon = {
  "common.clear": "clear",
  "common.list_pair": "{first} and {second}",

  // Shared chrome
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.continue": "Continue",
} as const

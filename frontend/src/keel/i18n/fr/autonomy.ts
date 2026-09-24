// Pack français — le namespace `autonomy`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `autonomy.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAutonomy = {
  // ── L'autonomie laissée par une ligne ────────────────────────────────────
  // Dite comme une phrase, pas comme le slug: le coach qui choisit ici répond à
  // « à quel point peut-il changer ? ».
  "autonomy.strict": "Exactement comme écrit",
  "autonomy.swap_within_policy": "Échanges autorisés, dans le cadre ci-dessous",
  "autonomy.flexible": "À sa discrétion",
} satisfies TranslatedMessagesOf<"autonomy">;

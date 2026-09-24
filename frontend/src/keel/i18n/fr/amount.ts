// Pack français — le namespace `amount`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `amount.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAmount = {
  // COMBIEN
  // « aucun », jamais « 0 »: `polarity='avoid'` avec `presence == 0` est un
  // comparateur dans la base et une prescription sur la page.
  "amount.none": "aucun",
  "amount.at_least": "au moins {quantity}",
  "amount.at_most": "pas plus de {quantity}",
  "amount.between": "{min} à {max}",
  "amount.rate_between": "noter de {min} à {max}",
  // Une cible horaire est un moment, pas une quantité: « pas plus de 2300 » est
  // ce que le nombre devient s'il passe par le chemin des quantités.
  "amount.by_time": "avant {time}",
  "amount.at_time": "à {time}",
} satisfies TranslatedMessagesOf<"amount">;

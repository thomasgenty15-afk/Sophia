// Pack français — le namespace `offer`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `offer.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frOffer = {
  //
  // ══ `offer` — L'OFFRE DU FOYER, ÉCRITE UNE FOIS POUR CINQ SURFACES ═══════
  //
  // Rendu par `ui/Marketing.tsx` → `OfferLines`, sur `/`, `/meal-prep`,
  // `/couples`, `/families` et `/start`. Seule exception à « un namespace par
  // page » — le pourquoi est dans `i18n/catalog.ts`.
  // ⚠️ Les montants viennent de `PRICES` par `formatPrice`, jamais du texte.
  // ⛔ « Première semaine offerte » est la durée que le produit TIENT:
  // `HOUSEHOLD_TRIAL_DAYS = 7`, aligné en SQL par
  // `keel_household_trial_days()`.
  "offer.household": "{amount} par mois pour toute la maison — ton accès est compris.",
  "offer.solo": "{amount} par mois pour une personne — toutes les fonctionnalités sont incluses.",
  "offer.extra": "{amount} par mois pour chaque autre personne qui veut son propre accès.",
  "offer.trial": "Première semaine offerte, sans code à saisir.",
  // Engagement COMMERCIAL, pas promesse de logiciel: pas de « résiliable en un
  // clic » tant qu'aucun écran ne le fait.
  "offer.no_commitment": "Sans engagement.",
} satisfies TranslatedMessagesOf<"offer">;

// Seed anglais — le namespace `offer`, et lui seul.
// Assemblé dans `../en.ts`; une clé `offer.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enOffer = {
  //
  // ── CE QUI A DISPARU DE L'ANCIEN NAMESPACE, ET POURQUOI ───────────────────
  // `home.proof.*` (trois clés) — la preuve fail-closed n'a plus de section à
  //   elle: un hall n'a pas de sections. Elle est REPLIÉE dans `home.pot.note`,
  //   sous la ligne qu'elle prouve.
  // `home.doors.title` et `home.door.*.title` / `.body` / `.cta` — les trois
  //   portes descendent dans la clôture, en compact: un libellé de situation et
  //   une ligne. Elles restent le seul chemin en page vers les six pages
  //   segment, elles ne meurent pas, elles maigrissent.
  // `home.fig.caption` — la légende disait ce que dit désormais `home.pot.body`.

  //
  // ══ `offer` — L'OFFRE DU FOYER, ÉCRITE UNE FOIS POUR CINQ SURFACES ═══════
  //
  // Rendu par `ui/Marketing.tsx` → `OfferLines`, sur `/`, `/meal-prep`,
  // `/couples`, `/families` et `/start`. C'est la SEULE exception à « un
  // namespace par page », et le pourquoi est dans `i18n/catalog.ts` à
  // `TRANSLATED_NAMESPACES`: une offre commerciale est un FAIT, et un fait ne
  // se recopie pas cinq fois.
  //
  // ⚠️ LES MONTANTS NE SONT PAS ÉCRITS ICI. `{amount}` est rempli par
  // `formatPrice(PRICES.household)` / `formatPrice(PRICES.claimedProfile)` à
  // l'appel: c'est la seule façon d'obtenir « €12.99 » en anglais et
  // « 12,99 € » en français sans deux conventions dans le même pack — le
  // défaut que `prices.ts` a été créé pour fermer, et qui traînait encore
  // dans `start.price` (une virgule décimale servie à un lecteur anglophone).
  //
  // ⛔ AUCUNE DURÉE D'ENGAGEMENT, AUCUNE DATE. « First week free » est la
  // durée que le produit TIENT: `HOUSEHOLD_TRIAL_DAYS = 7`
  // (`_shared/billing-tier.ts`), aligné en SQL par
  // `keel_household_trial_days()`. Le jour où ce nombre bouge, ces deux clés
  // mentent — et rien ne le dira, parce qu'elles ne portent pas le chiffre.
  "offer.household": "{amount} a month for the whole house — your own access included.",
  "offer.solo": "{amount} a month for one person — every feature is included.",
  "offer.extra": "{amount} a month for each other person who wants their own access.",
  "offer.trial": "First week free, with no code to enter.",
  // « No commitment » est un engagement COMMERCIAL, pas une promesse de
  // logiciel: on ne dit pas « cancel in one click », parce qu'aucun écran ne
  // le fait aujourd'hui. Si un engagement de durée apparaît un jour, cette
  // ligne part le même jour.
  "offer.no_commitment": "No commitment.",
} as const

// KEEL — LES MONTANTS, ÉCRITS UNE FOIS ET DANS AUCUNE LANGUE.
//
// ── LE DÉFAUT MESURÉ LE 2026-08-13 ────────────────────────────────────────
// Sept clés du catalogue portaient un NOMBRE comme valeur. Une valeur de
// catalogue est dupliquée par langue, donc elle peut DIVERGER — et elle avait
// déjà divergé DANS LA MÊME LANGUE:
//
//   · `mealprep.start.price` (en) = « €12.99 »
//   · `couples.price.amount` (en) = « €12.99 »
//   · `families.price.amount` (en) = « 12,99 € »   ← virgule décimale
//   · `families.fig_price.amount` (en) = « 12,99 € »
//
// Le même prix, le même produit, le même pack anglais, deux conventions — dont
// une qui est la convention FRANÇAISE (virgule décimale, symbole à droite),
// servie à un lecteur anglophone. Personne ne pouvait le voir: le catalogue
// n'est pas relu comme un tableau de prix, et les quatre clés sont sur quatre
// pages différentes.
//
// ── CE QUE CE FICHIER CHANGE ──────────────────────────────────────────────
// Un prix est un FAIT COMMERCIAL, pas une traduction. Il vit ici, en nombre, et
// `formatPrice` (i18n/format.ts) lui donne la convention de la langue de la
// page: « €12.99 » en anglais, « 12,99 € » en français. Changer un tarif est
// désormais UNE ligne, et il est impossible de le changer dans un pack en
// oubliant l'autre.
//
// ── CE QUI N'EST PAS ICI, ET POURQUOI ─────────────────────────────────────
// Les prix ENCASTRÉS DANS UNE PHRASE de vente (« 7 € par élève et par mois,
// sans forfait plateforme », « 12,99 € par mois pour le foyer ») restent dans
// le catalogue. Ils ne sont pas une donnée à afficher, ils sont un ARGUMENT —
// la phrase se construit autour du chiffre et se réécrit avec lui. Les
// interpoler transformerait quarante phrases de vente en gabarits à trous pour
// éviter une divergence qui, sur une phrase, se voit à la relecture.
//
// Les exemples chiffrés non plus (`gyms.fig.money_*`, `communities.fig_tier.*`):
// ce sont des ARITHMÉTIQUES illustratives — « 37 membres × 25 € = 925 € » —, et
// leurs opérandes ne sont pas nos tarifs.

/**
 * LES QUATRE MONTANTS DU CATALOGUE COMMERCIAL, en euros.
 *
 * Autorité produit: les blocs de prix de `en.ts` (B1 pour le siège, la ligne
 * « foyer » pour l'abonnement). Un changement ici se voit sur les six pages de
 * vente à la fois, ce qui est le point.
 */
export const PRICES = {
  /** L'abonnement du foyer, par mois. Une bouche de plus ne le change pas. */
  household: 12.99,
  /** Un profil RÉCLAMÉ en plus dans le foyer, par mois. */
  claimedProfile: 2,
  /** Un siège d'élève vendu au coach, à la salle ou à la communauté, par mois. */
  seat: 7,
  /** Le même siège, quand il est payé à l'année. */
  seatYearly: 6,
} as const;

export type PriceName = keyof typeof PRICES;

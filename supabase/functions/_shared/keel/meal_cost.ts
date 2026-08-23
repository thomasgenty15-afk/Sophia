// ═══════════════════════════════════════════════════════════════════════════
// KEEL · L30b — LE BUDGET EST UN CONSTAT, JAMAIS UNE PROMESSE.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── CE QUE CE MODULE REMPLACE ──────────────────────────────────────────────
// Le budget du produit est aujourd'hui une PROMESSE: `usableBudget` prend le
// montant saisi par la personne et le pose dans le prompt (`meal_budget_test`,
// « le prompt porte le MONTANT, pas un adjectif »). Personne, ensuite, ne
// vérifie ce que le plan rendu coûte réellement. Ici on compte:
//
//     coût = Σ (gramsRaw / 100) × prix_pour_100_g_de_gramsRaw
//
// ── ⛔ LA RÈGLE QUI TIENT TOUT LE MODULE ───────────────────────────────────
// **Un total partiel présenté comme un total est le mode d'échec de ce
// dépôt.** Si une seule ligne du plat ne peut pas être chiffrée — terme non
// résolu, terme résolu mais non pesé, terme pesé mais sans prix — le coût
// s'ABSTIENT: `amount` vaut `null` et `complete` vaut `false`. Il n'existe
// aucun chemin par lequel une somme amputée sorte d'ici avec l'air d'un
// résultat. C'est la même règle que `nutrientsOf` et `dishEnergy`, et elle est
// tenue par le TYPE: `amount: number | null`.
//
// ⛔ ET IL N'Y A PAS DE BORNE DE REPLI. `dishEnergy` sait borner un terme
// inconnu par la fenêtre de son groupe (`group_bounds`), parce qu'une densité
// énergétique a une fourchette étroite. **Un prix, non**: le safran et les
// lentilles vivent dans le même groupe à quatre ordres de grandeur d'écart
// (c'est l'argument même de la bande logarithmique du lot 30). Borner un prix
// inconnu serait inventer un nombre sur la seule grandeur que ce module rend.
//
// ── ⛔ POURQUOI UN PRIX MANQUANT NE PEUT PAS DEVENIR ZÉRO ──────────────────
// C'est le défaut le plus probable de ce lot, et il est écrit ici pour que
// personne ne le réintroduise par un `?? 0` qui a l'air d'une prudence:
//
//     un prix absent et un prix nul sont deux faits OPPOSÉS. « Cette ligne
//     ne coûte rien » est une affirmation; « je ne sais pas ce qu'elle
//     coûte » est une abstention. Les confondre rend un panier TROP BAS,
//     toujours dans le même sens, et d'autant plus bas que la ligne
//     manquante était chère — c'est-à-dire exactement sur la viande et le
//     poisson, les deux postes qui font le budget.
//
// `priceOf()` est le SEUL chemin de lecture, il rend `null` et pas 0, et
// `meal_cost_test.ts` mute la règle pour le prouver.
//
// ── LA BASE DE PESÉE — CE QUE LA COLONNE DE PRIX SIGNIFIE EXACTEMENT ───────
// `food_composition_refs.price_eur_per_100g_fr` est le coût du produit qu'il
// faut ACHETER pour obtenir 100 g de `gramsRaw` — pas 100 g d'assiette, pas
// 100 g de produit acheté. Le lot 30 a fait cette conversion UNE fois, à
// l'insertion, et l'a laissée relisible dans `food_price_pending.
// dry_input_ratio`. Vérifiable sur une ligne: `lentils_cooked` porte
// 0,1260 €/100 g avec un ratio de 42, soit 42 g de lentilles sèches à
// 3,00 €/kg. Le lecteur ne re-divise donc RIEN: il multiplie `gramsRaw`, la
// seule quantité que `nutrientsOf` voit.
//
// ⚠️ CE QUE CE COÛT NE COUVRE PAS, ET C'EST POURQUOI IL NE S'AFFICHE PAS.
// C'est le panier du PLAN, pas les courses: ni le shaker, ni le pain acheté à
// côté, ni le dessert, ni ce qui reste au placard. Le montrer à quelqu'un le
// ferait comparer à son ticket de caisse, où il est faux. Ce module est un
// INSTRUMENT DE MESURE (`scripts/keel_l30b_budget_constat_20260822.ts`), pas
// une ligne d'écran.
//
// ⚠️ AUCUNE SAISONNALITÉ. La tomate passe de 2,80 € à 5,50 € dans l'année,
// ±35 % que la grille ne porte pas (lot `L32`). Le niveau est daté dans
// `price_fr_observed_on`; ce module ne le rafraîchit pas et ne le prétend pas.
// ═══════════════════════════════════════════════════════════════════════════

import {
  type CompositionIndex,
  type CompositionInput,
  normalizeTerm,
  resolveIngredients,
  type YieldClass,
  YIELD_FACTORS,
} from "./food_composition.ts";

/**
 * LES DEUX MARCHÉS, ET IL N'Y EN A PAS UN TROISIÈME PAR DÉFAUT.
 *
 * ⛔ Le marché est un paramètre REQUIS partout dans ce module. Un défaut
 * (« fr, sinon ») rendrait un panier en euros à un compte américain sans que
 * rien ne le dise, et les deux colonnes du lot 30 ne sont PAS convertibles
 * l'une dans l'autre — c'est tout l'objet de `food_price_fx_smell`.
 */
export const COST_MARKETS = ["fr", "us"] as const;
export type CostMarket = (typeof COST_MARKETS)[number];

/** La devise, pour l'impression seule. Jamais pour un calcul. */
export const MARKET_CURRENCY: Readonly<Record<CostMarket, string>> = {
  fr: "EUR",
  us: "USD",
};

/**
 * UN PRIX, TEL QUE LE RÉFÉRENTIEL LE PORTE.
 *
 * `source` et `observedOn` sont REQUIS et non optionnels, exactement comme la
 * contrainte `food_composition_refs_price_fr_is_dated_check` les exige en
 * base. C'est la leçon de `L5` (`unit_grams_source` + ses deux CHECK) tenue
 * jusque dans le type: **une valeur de prix sans source vérifiable n'entre
 * pas**, et un champ facultatif serait un champ jamais rempli.
 */
export interface PricePoint {
  /** Pour 100 g de `gramsRaw`. Strictement positif, sinon la ligne est jetée. */
  perHundredGramsRaw: number;
  source: string;
  observedOn: string;
}

/** Le référentiel de prix, prêt à interroger, pour UN marché. */
export interface PriceIndex {
  market: CostMarket;
  bySlug: ReadonlyMap<string, PricePoint>;
  /**
   * Ce que la construction a REFUSÉ. Compté, jamais tu: une grille qui perd
   * 40 lignes à l'entrée et n'en dit rien ressemble à une grille de 40 lignes
   * plus courte.
   */
  rejectedSlugs: readonly string[];
}

/**
 * ⛔ LA PORTE D'ENTRÉE, ET ELLE REFUSE PLUS QU'ELLE N'ADMET.
 *
 * Trois refus, chacun pour une raison déjà payée par ce dépôt:
 *
 *   · `price <= 0`, `NaN`, `Infinity` — « gratuit » n'est pas un prix. Une
 *     ligne à 0 traverserait toutes les additions sans rien signaler, et
 *     `Number(null)` vaut 0 ET est fini (cicatrice `meal_budget_test` n° 1).
 *   · source vide — la contrainte de base l'interdit déjà; la refuser ici
 *     aussi évite qu'une grille chargée d'un fichier plat contourne la base.
 *   · date vide — sans elle, un niveau de 2026 se lit encore en 2028.
 *
 * ⚠️ Ce n'est PAS une garde optionnelle: il n'existe pas d'autre constructeur.
 */
export function buildPriceIndex(
  market: CostMarket,
  rows: readonly {
    slug: string;
    price: number | null | undefined;
    source: string | null | undefined;
    observedOn: string | null | undefined;
  }[],
): PriceIndex {
  const bySlug = new Map<string, PricePoint>();
  const rejectedSlugs: string[] = [];
  for (const row of rows) {
    const slug = String(row?.slug ?? "").trim();
    if (!slug) continue;
    const price = typeof row.price === "number" ? row.price : Number.NaN;
    const source = String(row.source ?? "").trim();
    const observedOn = String(row.observedOn ?? "").trim();
    if (!Number.isFinite(price) || price <= 0 || !source || !observedOn) {
      rejectedSlugs.push(slug);
      continue;
    }
    bySlug.set(slug, { perHundredGramsRaw: price, source, observedOn });
  }
  return { market, bySlug, rejectedSlugs };
}

/**
 * ⛔ LE SEUL CHEMIN DE LECTURE D'UN PRIX. Il rend `null`, jamais 0.
 *
 * Exporté exprès: c'est la fonction que `meal_cost_test.ts` mute pour prouver
 * qu'un prix manquant ne peut pas se faire passer pour zéro. Une garde qu'on
 * ne sait pas casser est une garde qu'on croit tenir.
 */
export function priceOf(index: PriceIndex, slug: string): PricePoint | null {
  return index.bySlug.get(slug) ?? null;
}

/**
 * POURQUOI UNE LIGNE N'EST PAS CHIFFRÉE. Trois causes, comptées SÉPARÉMENT.
 *
 * ⛔ Les confondre ferait chercher des prix pour un problème d'alias. C'est
 * exactement la distinction que `resolveIngredients` tient déjà entre
 * `unresolvedTerms` (curation d'alias) et `unweighedTerms` (contrat de
 * quantités) — `no_price` est la troisième, et elle appartient à ce lot.
 */
export const COST_GAPS = ["unresolved_term", "unweighed_term", "no_price"] as const;
export type CostGap = (typeof COST_GAPS)[number];

/**
 * LE CONSTAT SUR UN PLAT — ou son abstention.
 *
 * ⛔ `amount` et `complete` se lisent ENSEMBLE, et `amount` vaut `null` dès
 * que `complete` est faux. Un `0` y serait un plat qui ne coûte rien, ce qui
 * n'est pas la même chose qu'un plat qu'on ne sait pas chiffrer.
 */
export interface CostVerdict {
  market: CostMarket;
  /** `null` quand `complete` est faux. JAMAIS une somme amputée. */
  amount: number | null;
  complete: boolean;
  /** Les deux populations, TOUJOURS rendues ensemble. */
  pricedLines: number;
  unknownLines: number;
  gaps: readonly CostGap[];
  /** Résolus ET pesés, mais que la grille ne cote pas. La worklist du lot 30. */
  unpricedTerms: readonly string[];
  /** Le référentiel ne connaît pas ces termes. La worklist des alias. */
  unresolvedTerms: readonly string[];
  /** Connus, mais sans quantité lisible. La worklist du prompt. */
  unweighedTerms: readonly string[];
}

function emptyVerdict(market: CostMarket): CostVerdict {
  return {
    market,
    amount: null,
    complete: false,
    pricedLines: 0,
    unknownLines: 0,
    gaps: [],
    unpricedTerms: [],
    unresolvedTerms: [],
    unweighedTerms: [],
  };
}

/**
 * LE COÛT D'UNE LISTE D'INGRÉDIENTS — le cœur, et il tient en vingt lignes.
 *
 * ⚠️ LES INGRÉDIENTS ARRIVENT DÉJÀ PLIÉS. Une préparation partagée doit être
 * passée par `foldPreparationsIntoDishes` AVANT: un lot de poulet fait pour
 * quatre dîners compté entier dans chacun des quatre plats multiplierait le
 * panier par quatre, toujours dans le sens qui gonfle (cicatrice « un facteur
 * ne porte que sur la part mobile »).
 */
export function costOfIngredients(
  index: CompositionIndex,
  prices: PriceIndex,
  ingredients: readonly CompositionInput[],
): CostVerdict {
  const named = ingredients.filter((i) => String(i?.term ?? "").trim() !== "");
  if (named.length === 0) return emptyVerdict(prices.market);

  const r = resolveIngredients(index, named);

  let amount = 0;
  let pricedLines = 0;
  const unpricedTerms: string[] = [];
  for (const { ref, gramsRaw } of r.resolved) {
    const point = priceOf(prices, ref.slug);
    // ⛔ ICI, ET NULLE PART AILLEURS. Pas de `?? 0`, pas de `|| 0`, pas de
    // valeur par défaut: l'absence est une BRANCHE, pas un nombre.
    if (point === null) {
      unpricedTerms.push(normalizeTerm(ref.slug));
      continue;
    }
    amount += (gramsRaw / 100) * point.perHundredGramsRaw;
    pricedLines += 1;
  }

  const gaps: CostGap[] = [];
  if (r.unresolvedTerms.length > 0) gaps.push("unresolved_term");
  if (r.unweighedTerms.length > 0) gaps.push("unweighed_term");
  if (unpricedTerms.length > 0) gaps.push("no_price");

  const unknownLines = r.unresolvedTerms.length + r.unweighedTerms.length +
    unpricedTerms.length;

  // ⛔ LES DEUX POPULATIONS DOIVENT SE RECOMPOSER EN `r.total`. Si elles ne le
  // font pas, une ligne a disparu d'un côté sans réapparaître de l'autre —
  // c'est-à-dire qu'on ne compte plus le même dénominateur qu'on annonce.
  const complete = unknownLines === 0 && pricedLines > 0 &&
    pricedLines === r.total;

  return {
    market: prices.market,
    amount: complete ? Math.round(amount * 10000) / 10000 : null,
    complete,
    pricedLines,
    unknownLines,
    gaps,
    unpricedTerms: [...unpricedTerms].sort(),
    unresolvedTerms: [...r.unresolvedTerms].sort(),
    unweighedTerms: [...r.unweighedTerms].sort(),
  };
}

/**
 * LE COÛT D'UN PLAN — la somme de ses plats, et la MÊME règle d'abstention.
 *
 * ⛔ UN PLAT QUI S'ABSTIENT ÉTEINT LE PLAN. C'est le point du lot: additionner
 * les plats chiffrables et présenter le résultat comme « le coût du plan »
 * rendrait un nombre d'autant plus bas qu'il manque de plats — un budget qui
 * s'améliore quand le référentiel se dégrade. Les deux populations restent
 * comptées: on sait combien de plats sont chiffrés et combien ne le sont pas.
 */
export interface PlanCostVerdict extends CostVerdict {
  dishes: number;
  dishesPriced: number;
}

export function costOfPlan(
  index: CompositionIndex,
  prices: PriceIndex,
  dishes: readonly { ingredients: readonly CompositionInput[] }[],
): PlanCostVerdict {
  let amount = 0;
  let pricedLines = 0;
  let unknownLines = 0;
  let dishesPriced = 0;
  const gaps = new Set<CostGap>();
  const unpricedTerms = new Set<string>();
  const unresolvedTerms = new Set<string>();
  const unweighedTerms = new Set<string>();

  for (const dish of dishes) {
    const v = costOfIngredients(index, prices, dish.ingredients);
    pricedLines += v.pricedLines;
    unknownLines += v.unknownLines;
    for (const g of v.gaps) gaps.add(g);
    for (const t of v.unpricedTerms) unpricedTerms.add(t);
    for (const t of v.unresolvedTerms) unresolvedTerms.add(t);
    for (const t of v.unweighedTerms) unweighedTerms.add(t);
    if (v.complete && v.amount !== null) {
      amount += v.amount;
      dishesPriced += 1;
    }
  }

  const complete = dishes.length > 0 && dishesPriced === dishes.length &&
    unknownLines === 0;

  return {
    market: prices.market,
    amount: complete ? Math.round(amount * 10000) / 10000 : null,
    complete,
    pricedLines,
    unknownLines,
    gaps: [...gaps].sort(),
    unpricedTerms: [...unpricedTerms].sort(),
    unresolvedTerms: [...unresolvedTerms].sort(),
    unweighedTerms: [...unweighedTerms].sort(),
    dishes: dishes.length,
    dishesPriced,
  };
}

/**
 * LA GRANDEUR COMPARABLE — le coût de 1 000 kcal.
 *
 * ⛔ ELLE EXIGE LES DEUX COMPLÉTUDES. Un coût complet divisé par une énergie
 * bornée, ou une énergie complète divisée par un coût amputé, rendrait un
 * ratio qui a l'air d'un résultat. `null` dès que l'un des deux s'abstient.
 *
 * ⚠️ Et l'énergie doit venir du MÊME pliage que le coût, sinon le numérateur
 * et le dénominateur ne parlent pas du même plan.
 */
export function costPerThousandKcal(
  cost: CostVerdict,
  kcal: number | null,
): number | null {
  if (!cost.complete || cost.amount === null) return null;
  if (kcal === null || !Number.isFinite(kcal) || kcal <= 0) return null;
  return Math.round((cost.amount / (kcal / 1000)) * 10000) / 10000;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LE PRIX ET LA MASSE DOIVENT PARLER DU MÊME ÉTAT — la garde de `L-C`.
// ═══════════════════════════════════════════════════════════════════════════
//
// Le lot 30 a posé `price_basis` sur la `yield_class` DU 2026-08-21. `L-C` a
// déplacé 57 `yield_class` le 2026-08-22. Deux de ces bases sont DÉFINIES par
// la classe de rendement, et deviennent donc fausses dès qu'elle bouge:
//
//   · `cooked_label_dry_input` — « libellé cuit ET `yield_class` neutre »: le
//     runtime ne reconvertit rien, le prix est celui de l'entrée sèche. Si la
//     classe devenait NON neutre, le runtime diviserait déjà et le prix serait
//     compté une seconde fois.
//   · `cooked_label_yield_absorbed` — « libellé cuit MAIS `yield_class` non
//     neutre »: le runtime reconvertit, le prix est celui de l'ingrédient cru.
//     Si la classe devient NEUTRE, le runtime ne divise plus et le prix se
//     retrouve posé sur une masse qui n'est plus la sienne.
//
// C'est le second cas qui est arrivé: `noodles`, `mashed_potatoes` et
// `potato_puree_milk_butter` (mesuré le 2026-08-22 à 17:23 CEST). Leur prix
// est FAUX du facteur de leur ancienne classe — ×2,6 trop haut pour les
// nouilles, 10 % trop bas pour les deux purées.
//
// ⛔ CE MODULE NE LES RÉPARE PAS. Re-dériver une valeur marchande est le
// travail du lot 30, sur ses sources. Ce qu'on peut faire sans inventer un
// nombre, c'est REFUSER la ligne — et la migration jumelle applique le même
// prédicat à la promotion, en le citant.

/** Les cinq bases du lot 30, dans le même ordre que le CHECK de la table. */
export const PRICE_BASES = [
  "as_purchased",
  "cooked_label_yield_absorbed",
  "cooked_label_dry_input",
  "diluted",
  "edible_portion",
] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

/**
 * La base de pesée contredit-elle la classe de rendement d'aujourd'hui ?
 *
 * `true` = la ligne ne doit PAS être promue: son prix a été posé contre une
 * arithmétique de runtime qui n'est plus celle d'aujourd'hui.
 *
 * ⚠️ `as_purchased`, `diluted` et `edible_portion` ne dépendent PAS de la
 * classe: elles décrivent le marché (on achète l'entier, on achète la poudre),
 * pas la cuisson. Les faire dépendre du rendement refuserait 46 lignes de
 * panification que `L-C` a justement remises d'aplomb.
 */
export function priceBasisContradictsYield(
  basis: PriceBasis,
  yieldClass: YieldClass,
): boolean {
  const neutral = YIELD_FACTORS[yieldClass] === 1.0;
  if (basis === "cooked_label_dry_input") return !neutral;
  if (basis === "cooked_label_yield_absorbed") return neutral;
  return false;
}

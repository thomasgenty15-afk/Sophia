// ═══════════════════════════════════════════════════════════════════════════
// KEEL · L30b — LES CEINTURES DU CONSTAT DE BUDGET.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES CAS PROTÈGENT, ET CE QU'ILS DOIVENT CASSER SOUS MUTATION
//
//   ① UN PRIX MANQUANT NE SE FAIT PAS PASSER POUR ZÉRO. C'est le défaut le
//      plus probable de ce lot: un `?? 0` dans `costOfIngredients` a l'air
//      d'une prudence et rend un panier trop bas, d'autant plus bas que la
//      ligne manquante était chère — c'est-à-dire sur la viande et le poisson.
//      La mutation à faire pour le prouver est écrite dans le cas.
//   ② UN TOTAL PARTIEL NE SORT PAS. Un plat qui s'abstient éteint le plan;
//      sommer ce qui reste rendrait un budget qui S'AMÉLIORE quand le
//      référentiel se dégrade.
//   ③ LA GRILLE REFUSE À L'ENTRÉE ce qu'aucune contrainte de base ne pourrait
//      rattraper si la grille venait d'un fichier plat: prix nul, négatif,
//      non fini, source vide, date vide.
//   ④ LE PRIX ET LA MASSE PARLENT DU MÊME ÉTAT. La garde de `L-C`.
//
// ⚠️ ET IL Y A UN CAS QUI PASSE. Une garde cassée refuse tout et ressemble
// à une garde qui marche (cicatrice `guards-need-a-passing-case`): le premier
// cas de ce fichier rend un montant EXACT, calculé de tête.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionInput,
  type CompositionRef,
} from "./food_composition.ts";
import {
  buildPriceIndex,
  costOfIngredients,
  costOfPlan,
  costPerThousandKcal,
  MARKET_CURRENCY,
  priceBasisContradictsYield,
  priceOf,
} from "./meal_cost.ts";

// ---------------------------------------------------------------------------
// LE BANC — des valeurs RONDES, pour que l'attendu se calcule de tête
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const REFS: CompositionRef[] = [
  // 110 kcal / 100 g CRUS, et 10,00 €/kg — la viande, le poste qui fait le prix.
  ref({
    slug: "chicken_breast",
    foodGroupRef: "poultry",
    energyKcal: 110,
    yieldClass: "meat_shrinks",
  }),
  // 350 kcal / 100 g SECS, 2,00 €/kg.
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    yieldClass: "grain_absorbs",
  }),
  // L'huile: chère au gramme, et c'est elle qu'un `?? 0` ferait disparaître.
  ref({
    slug: "olive_oil",
    foodGroupRef: "olive_oil",
    energyKcal: 900,
    energyDense: true,
  }),
  // COTÉE NULLE PART — exprès. C'est la ligne du cas ①.
  ref({ slug: "capers", foodGroupRef: "non_starchy_veg", energyKcal: 20 }),
];

const INDEX = buildCompositionIndex(REFS, []);

const PRICES = buildPriceIndex("fr", [
  {
    slug: "chicken_breast",
    price: 1.0,
    source: "FranceAgriMer RNM · verified",
    observedOn: "2026-08-21",
  },
  {
    slug: "white_rice",
    price: 0.2,
    source: "Moyenne de rayon GMS France · retail_average",
    observedOn: "2026-08-21",
  },
  {
    slug: "olive_oil",
    price: 1.26,
    source: "Moyenne de rayon GMS France · retail_average",
    observedOn: "2026-08-21",
  },
]);

const g = (term: string, amount: number): CompositionInput => ({
  term,
  amount,
  unit: "g",
  state: "raw",
});

// ---------------------------------------------------------------------------
// ⚠️ LE CAS QUI PASSE — sans lui, une garde cassée ressemble à une garde
// ---------------------------------------------------------------------------

Deno.test("L30b — un plat entièrement coté rend un montant EXACT", () => {
  const v = costOfIngredients(INDEX, PRICES, [
    g("chicken_breast", 200), // 200 g × 1,00 €/100 g = 2,00 €
    g("white_rice", 100), //     100 g × 0,20 €/100 g = 0,20 €
    g("olive_oil", 10), //        10 g × 1,26 €/100 g = 0,126 €
  ]);
  assert(v.complete, `attendu complet, gaps=${JSON.stringify(v.gaps)}`);
  assertEquals(v.amount, 2.326);
  assertEquals(v.pricedLines, 3);
  assertEquals(v.unknownLines, 0);
  assertEquals(v.gaps, []);
  assertEquals(v.market, "fr");
  assertEquals(MARKET_CURRENCY[v.market], "EUR");
});

// ---------------------------------------------------------------------------
// ① ⛔ LE CAS DE MUTATION OBLIGATOIRE DU LOT
// ---------------------------------------------------------------------------

Deno.test("L30b — ⛔ un prix MANQUANT ne se fait PAS passer pour zéro", () => {
  // ⚠️ LA MUTATION QUI DOIT FAIRE ROUGIR CE CAS, dans `meal_cost.ts`:
  //
  //     - if (point === null) { unpricedTerms.push(...); continue; }
  //     + const p = point?.perHundredGramsRaw ?? 0;
  //
  // Sous cette mutation, le plat rendrait `complete: true` et `amount: 2,00 €`
  // — un panier plausible, signé, et faux du prix des câpres. C'est exactement
  // la forme d'un total partiel présenté comme un total.
  const v = costOfIngredients(INDEX, PRICES, [
    g("chicken_breast", 200),
    g("capers", 30), // RÉSOLU, PESÉ, et la grille ne le cote pas.
  ]);
  assertEquals(v.complete, false);
  assertEquals(v.amount, null); // ⛔ ni 2,00 · ni 0 · ni une somme amputée
  assertEquals(v.gaps, ["no_price"]);
  assertEquals(v.unpricedTerms, ["capers"]);
  // LES DEUX POPULATIONS, TOUJOURS RENDUES ENSEMBLE.
  assertEquals(v.pricedLines, 1);
  assertEquals(v.unknownLines, 1);
  // Et la cause n'est ni un alias manquant ni une quantité manquante: les
  // trois seaux sont distincts exprès.
  assertEquals(v.unresolvedTerms, []);
  assertEquals(v.unweighedTerms, []);
});

Deno.test("L30b — `priceOf` rend `null`, jamais 0", () => {
  assertEquals(priceOf(PRICES, "capers"), null);
  assertEquals(priceOf(PRICES, "white_rice")?.perHundredGramsRaw, 0.2);
});

// ---------------------------------------------------------------------------
// ② LES DEUX AUTRES CAUSES D'ABSTENTION, COMPTÉES SÉPARÉMENT
// ---------------------------------------------------------------------------

Deno.test("L30b — un terme inconnu éteint le coût, et il n'est PAS borné", () => {
  // ⚠️ `dishEnergy` sait borner un inconnu par la fenêtre de son groupe. Le
  // coût, non: safran et lentilles vivent dans le même groupe à quatre ordres
  // de grandeur. Borner un prix serait inventer un nombre.
  const v = costOfIngredients(INDEX, PRICES, [
    g("chicken_breast", 200),
    g("something_nobody_knows", 50),
  ]);
  assertEquals(v.complete, false);
  assertEquals(v.amount, null);
  assertEquals(v.gaps, ["unresolved_term"]);
  assertEquals(v.unresolvedTerms, ["something_nobody_knows"]);
  assertEquals(v.unpricedTerms, []);
});

Deno.test("L30b — un terme connu mais NON PESÉ éteint le coût", () => {
  const v = costOfIngredients(INDEX, PRICES, [
    g("chicken_breast", 200),
    { term: "olive_oil", amount: null, unit: null, state: null },
  ]);
  assertEquals(v.complete, false);
  assertEquals(v.amount, null);
  assertEquals(v.gaps, ["unweighed_term"]);
  assertEquals(v.unweighedTerms, ["olive_oil"]);
});

Deno.test("L30b — un plat vide s'abstient et ne rend pas 0 €", () => {
  const v = costOfIngredients(INDEX, PRICES, []);
  assertEquals(v.complete, false);
  assertEquals(v.amount, null);
  assertEquals(v.pricedLines, 0);
});

// ---------------------------------------------------------------------------
// ② (suite) ⛔ UN PLAT QUI S'ABSTIENT ÉTEINT LE PLAN
// ---------------------------------------------------------------------------

Deno.test("L30b — ⛔ un seul plat non chiffrable éteint le TOTAL du plan", () => {
  // ⚠️ MUTATION: remplacer `dishesPriced === dishes.length` par
  // `dishesPriced > 0` rendrait 2,00 € — le coût d'un plan de DEUX plats
  // annoncé sur UN seul. Un budget qui s'améliore quand le référentiel se
  // dégrade.
  const plan = costOfPlan(INDEX, PRICES, [
    { ingredients: [g("chicken_breast", 200)] },
    { ingredients: [g("capers", 30)] },
  ]);
  assertEquals(plan.complete, false);
  assertEquals(plan.amount, null);
  assertEquals(plan.dishes, 2);
  assertEquals(plan.dishesPriced, 1); // le compte reste VISIBLE
  assertEquals(plan.unpricedTerms, ["capers"]);
});

Deno.test("L30b — un plan entièrement coté additionne ses plats", () => {
  const plan = costOfPlan(INDEX, PRICES, [
    { ingredients: [g("chicken_breast", 200)] }, // 2,00 €
    { ingredients: [g("white_rice", 100), g("olive_oil", 10)] }, // 0,326 €
  ]);
  assert(plan.complete);
  assertEquals(plan.amount, 2.326);
  assertEquals(plan.dishes, 2);
  assertEquals(plan.dishesPriced, 2);
});

// ---------------------------------------------------------------------------
// ③ LA GRILLE REFUSE À L'ENTRÉE — et elle COMPTE ce qu'elle refuse
// ---------------------------------------------------------------------------

Deno.test("L30b — un prix nul, négatif ou non fini n'entre pas dans la grille", () => {
  const idx = buildPriceIndex("fr", [
    { slug: "a", price: 0, source: "s", observedOn: "2026-08-21" },
    { slug: "b", price: -1, source: "s", observedOn: "2026-08-21" },
    { slug: "c", price: Number.NaN, source: "s", observedOn: "2026-08-21" },
    // ⚠️ `Number(null)` vaut 0 ET est fini — la cicatrice du budget-adjectif.
    { slug: "d", price: Number(null), source: "s", observedOn: "2026-08-21" },
    { slug: "e", price: null, source: "s", observedOn: "2026-08-21" },
  ]);
  assertEquals(idx.bySlug.size, 0);
  assertEquals([...idx.rejectedSlugs].sort(), ["a", "b", "c", "d", "e"]);
});

Deno.test("L30b — un prix sans source ni date n'entre pas (la règle de `L5`)", () => {
  const idx = buildPriceIndex("fr", [
    { slug: "a", price: 1, source: "   ", observedOn: "2026-08-21" },
    { slug: "b", price: 1, source: "s", observedOn: "" },
    { slug: "ok", price: 1, source: "s", observedOn: "2026-08-21" },
  ]);
  assertEquals([...idx.bySlug.keys()], ["ok"]);
  assertEquals([...idx.rejectedSlugs].sort(), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// LE RATIO — il exige les DEUX complétudes
// ---------------------------------------------------------------------------

Deno.test("L30b — €/1 000 kcal exige un coût complet ET une énergie", () => {
  const complet = costOfIngredients(INDEX, PRICES, [g("chicken_breast", 200)]);
  // 2,00 € pour 220 kcal ⇒ 9,0909 €/1 000 kcal
  assertEquals(costPerThousandKcal(complet, 220), 9.0909);
  // ⛔ une énergie absente, nulle ou non finie ne rend pas un ratio infini
  assertEquals(costPerThousandKcal(complet, null), null);
  assertEquals(costPerThousandKcal(complet, 0), null);
  const partiel = costOfIngredients(INDEX, PRICES, [g("capers", 30)]);
  assertEquals(costPerThousandKcal(partiel, 220), null);
});

// ---------------------------------------------------------------------------
// ④ ⛔ LE PRIX ET LA MASSE PARLENT-ILS DU MÊME ÉTAT ? — la garde de `L-C`
// ---------------------------------------------------------------------------

Deno.test("L30b — ⛔ une base de prix périmée par `L-C` est refusée", () => {
  // LE CAS RÉEL, mesuré le 2026-08-22: `noodles`, `mashed_potatoes` et
  // `potato_puree_milk_butter` portaient `cooked_label_yield_absorbed` quand
  // leur `yield_class` était non neutre. `L-C` les a ramenées à `neutral`: le
  // runtime ne divise plus, et leur prix reste posé sur l'ancienne masse.
  assert(priceBasisContradictsYield("cooked_label_yield_absorbed", "neutral"));
  // Le miroir: une base « entrée sèche » sur une classe qui divise DÉJÀ
  // facturerait le rendement deux fois.
  assert(priceBasisContradictsYield("cooked_label_dry_input", "grain_absorbs"));

  // ⚠️ ET LES CAS QUI DOIVENT PASSER — sans eux la garde refuserait tout.
  // Les 46 lignes de panification que `L-C` a remises d'aplomb sont
  // `as_purchased` + `neutral`: on achète du pain, pas de la farine.
  assertEquals(priceBasisContradictsYield("as_purchased", "neutral"), false);
  assertEquals(priceBasisContradictsYield("as_purchased", "meat_shrinks"), false);
  assertEquals(priceBasisContradictsYield("cooked_label_dry_input", "neutral"), false);
  assertEquals(
    priceBasisContradictsYield("cooked_label_yield_absorbed", "grain_absorbs"),
    false,
  );
  // `diluted` et `edible_portion` décrivent le MARCHÉ, pas la cuisson: elles
  // ne dépendent d'aucune classe, et 34 + 5 lignes en vivent.
  assertEquals(priceBasisContradictsYield("diluted", "neutral"), false);
  assertEquals(priceBasisContradictsYield("edible_portion", "veg_shrinks"), false);
});

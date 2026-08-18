// FF-038 — LE RÉFÉRENTIEL DE COMPOSITION. Ce que ces tests protègent, dans
// l'ordre de ce qui coûte le plus cher quand ça casse:
//
//   * LE CRU/CUIT — « 100 g de riz » vaut ~350 kcal cru et ~130 cuit. C'est LE
//     piège du domaine, et il va dans les deux sens (le riz gonfle, la viande
//     perd). Un facteur perdu ne lève rien: il rend un chiffre plausible;
//   * L'ALIAS FAUX — un plat calculé faux, indiscernable d'un plat calculé
//     juste, dans TOUT ce qui se construit dessus;
//   * LE ZÉRO QUI RESSEMBLE À UNE MESURE — un ingrédient inconnu qui propage
//     `0` fait passer un plat non calculable pour un plat léger;
//   * LE DÉFAUT DEVINÉ — un `state` absent complété à « raw » fausse d'un
//     facteur 2,6, et toujours dans le sens qui gonfle.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
  FRY_OIL_UPTAKE_RATIO,
  gramsRawOf,
  isFriedMethod,
  looksEnergyDense,
  normalizeTerm,
  nutrientsOf,
  resolveIngredient,
  resolveIngredients,
  YIELD_CLASSES,
  YIELD_FACTORS,
} from "./food_composition.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
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
    ...over,
  } as CompositionRef;
}

const REFS: CompositionRef[] = [
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 350, proteinG: 7, carbsG: 78, fatG: 0.6, fiberG: 1.4, yieldClass: "grain_absorbs" }),
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 110, proteinG: 23.4, carbsG: 0, fatG: 1.5, fiberG: 0, yieldClass: "meat_shrinks" }),
  ref({ slug: "tomato", energyKcal: 18, proteinG: 0.8, carbsG: 2.9, fatG: 0.2, fiberG: 1.2 }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, energyDense: true }),
  ref({ slug: "almonds", foodGroupRef: "nuts_seeds", energyKcal: 600, proteinG: 21, carbsG: 5, fatG: 53, fiberG: 12, atwaterDiscount: 0.72, energyDense: true }),
  ref({ slug: "celery", energyKcal: 18, proteinG: 0.6, carbsG: 2.4, fatG: null, fiberG: 1.6 }),
  ref({ slug: "whole_eggs", foodGroupRef: "eggs", energyKcal: 139, proteinG: 12.7, carbsG: 0.3, fatG: 9.8, fiberG: 0, unitGrams: 55 }),
  ref({ slug: "onion", energyKcal: 38, proteinG: 1.2, carbsG: 6.6, fatG: 0.2, fiberG: 1.7, yieldClass: "veg_shrinks" }),
];

const INDEX = buildCompositionIndex(REFS, [
  { alias: "rice", slug: "white_rice" },
  { alias: "basmati rice", slug: "white_rice" },
  { alias: "riz", slug: "white_rice" },
  { alias: "chicken", slug: "chicken_breast" },
  { alias: "blanc de poulet", slug: "chicken_breast" },
  { alias: "tomatoes", slug: "tomato" },
  { alias: "tomate", slug: "tomato" },
  { alias: "olive oil", slug: "olive_oil" },
  { alias: "huile d'olive", slug: "olive_oil" },
  { alias: "almonds", slug: "almonds" },
  { alias: "oignon", slug: "onion" },
  { alias: "oeufs", slug: "whole_eggs" },
  // Un alias vers un slug qui n'existe pas: la construction doit le JETER.
  { alias: "quinoa", slug: "quinoa_absent" },
]);

// ---------------------------------------------------------------------------
// LA RÉSOLUTION
// ---------------------------------------------------------------------------

Deno.test("un terme exact, un alias, un slug: les trois portes s'ouvrent", () => {
  assertEquals(resolveIngredient(INDEX, "chicken breast")?.slug, "chicken_breast");
  assertEquals(resolveIngredient(INDEX, "chicken")?.slug, "chicken_breast");
  assertEquals(resolveIngredient(INDEX, "blanc de poulet")?.slug, "chicken_breast");
});

Deno.test("les accents, la casse et la ponctuation ne comptent pas", () => {
  assertEquals(resolveIngredient(INDEX, "Huile d'olive")?.slug, "olive_oil");
  assertEquals(resolveIngredient(INDEX, "  TOMATE,  ")?.slug, "tomato");
});

Deno.test("un modificateur de préparation RÉDUIT sans changer l'aliment", () => {
  // La frontière de R5: réduire une forme, jamais choisir entre deux aliments.
  assertEquals(resolveIngredient(INDEX, "chopped tomatoes")?.slug, "tomato");
  assertEquals(resolveIngredient(INDEX, "cooked rice")?.slug, "white_rice");
  assertEquals(resolveIngredient(INDEX, "large onion")?.slug, "onion");
  // « oignon rouge » n'est ni un slug ni un alias, et « rouge » n'est pas un
  // modificateur de préparation: la réduction ne doit PAS aller jusqu'à
  // « oignon ». Un adjectif de variété peut changer l'aliment.
  assertEquals(resolveIngredient(INDEX, "oignon rouge"), null);
  assertEquals(resolveIngredient(INDEX, "extra virgin olive oil")?.slug, "olive_oil");
});

Deno.test("le pluriel anglais tombe sur le DERNIER mot seulement", () => {
  assertEquals(resolveIngredient(INDEX, "tomatoes")?.slug, "tomato");
  assertEquals(resolveIngredient(INDEX, "onions")?.slug, "onion");
});

Deno.test("« butter or olive oil » reste NON RÉSOLU", () => {
  // Le terme contient « olive oil », qui matcherait. L'alternative disqualifie
  // AVANT toute recherche — sinon on choisirait à la place du cuisinier, et le
  // faux appariement serait indiscernable d'un bon.
  assertEquals(resolveIngredient(INDEX, "butter or olive oil"), null);
  assertEquals(resolveIngredient(INDEX, "beurre ou huile d'olive"), null);
});

Deno.test("un inconnu rend null — jamais le plus proche", () => {
  assertEquals(resolveIngredient(INDEX, "sumac"), null);
  assertEquals(resolveIngredient(INDEX, ""), null);
  assertEquals(resolveIngredient(INDEX, "   "), null);
  // Pas de sous-chaîne: « rice pudding » n'est pas du riz avec un adjectif.
  assertEquals(resolveIngredient(INDEX, "rice pudding"), null);
});

Deno.test("un alias qui pointe vers un slug absent est JETÉ à la construction", () => {
  // Le garder rendrait `resolveIngredient` capable de trouver une clé et pas
  // sa valeur, c'est-à-dire un « résolu » qui ne résout rien.
  assertEquals(resolveIngredient(INDEX, "quinoa"), null);
});

// ---------------------------------------------------------------------------
// LE CRU / CUIT — le piège du chantier
// ---------------------------------------------------------------------------

Deno.test("100 g de riz CUIT ne pèsent pas 100 g de riz CRU", () => {
  const raw = gramsRawOf({ amount: 100, unit: "g", state: "raw", yieldClass: "grain_absorbs" });
  const cooked = gramsRawOf({ amount: 100, unit: "g", state: "cooked", yieldClass: "grain_absorbs" });
  assertEquals(raw, 100);
  assert(cooked !== null);
  // Le facteur, pas une valeur en dur: muter YIELD_FACTORS doit faire bouger
  // ce test, sinon il ne teste pas ce qu'il prétend.
  assertEquals(Math.round(cooked!), Math.round(100 / YIELD_FACTORS.grain_absorbs));
  assert(raw! / cooked! > 2.5, "le riz cru doit peser bien plus que le cuit");
});

Deno.test("la viande PERD à la cuisson — la direction inverse est testée aussi", () => {
  const cooked = gramsRawOf({ amount: 100, unit: "g", state: "cooked", yieldClass: "meat_shrinks" });
  assert(cooked !== null && cooked > 100, "100 g cuits viennent de PLUS de 100 g crus");
});

Deno.test("un `state` manquant sur du riz rend null — jamais un défaut", () => {
  // Deviner « raw » ferait compter 260 g de riz cru là où l'élève en mange
  // 100 g cuits: ~900 kcal d'écart, toujours dans le sens qui gonfle.
  assertEquals(
    gramsRawOf({ amount: 100, unit: "g", state: null, yieldClass: "grain_absorbs" }),
    null,
  );
});

Deno.test("un `state` manquant sur une huile est SANS CONSÉQUENCE, donc accepté", () => {
  assertEquals(
    gramsRawOf({ amount: 15, unit: "ml", state: null, yieldClass: "neutral" }),
    15,
  );
});

Deno.test("toutes les classes de rendement ont un facteur nommé", () => {
  for (const cls of YIELD_CLASSES) {
    assert(typeof YIELD_FACTORS[cls] === "number" && YIELD_FACTORS[cls] > 0);
  }
});

// ---------------------------------------------------------------------------
// LES UNITÉS
// ---------------------------------------------------------------------------

Deno.test("cuillères et unités se convertissent, le reste rend null", () => {
  assertEquals(gramsRawOf({ amount: 2, unit: "tbsp", state: "raw", yieldClass: "neutral" }), 30);
  assertEquals(gramsRawOf({ amount: 1, unit: "tsp", state: "raw", yieldClass: "neutral" }), 5);
  assertEquals(
    gramsRawOf({ amount: 2, unit: "unit", state: "raw", yieldClass: "neutral", unitGrams: 50 }),
    100,
  );
  // « 2 courgettes » sans poids d'unité n'est pas une quantité: c'est un
  // dénombrement, et un dénombrement converti à l'estime est un nombre inventé.
  assertEquals(gramsRawOf({ amount: 2, unit: "unit", state: "raw", yieldClass: "neutral" }), null);
  // Un nombre sans unité n'est pas une quantité non plus.
  assertEquals(gramsRawOf({ amount: 100, unit: null, state: "raw", yieldClass: "neutral" }), null);
  assertEquals(gramsRawOf({ amount: null, unit: "g", state: "raw", yieldClass: "neutral" }), null);
  assertEquals(gramsRawOf({ amount: -5, unit: "g", state: "raw", yieldClass: "neutral" }), null);
});

// ---------------------------------------------------------------------------
// L'INCONNU SE PROPAGE
// ---------------------------------------------------------------------------

Deno.test("un plat dont un ingrédient est non résolu ne rend PAS une somme amputée", () => {
  const r = resolveIngredients(INDEX, [
    { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
    { term: "sumac", amount: 5, unit: "g", state: "raw" },
  ]);
  assertEquals(r.unresolvedTerms, ["sumac"]);
  assertEquals(r.total, 2);
  assertEquals(r.coverage, 0.5);
  // Le module rend ce qu'il sait; c'est le VERDICT (FF-039) qui s'abstient sur
  // la couverture. Ce que ce test épingle, c'est que le non-résolu est COMPTÉ
  // et que la couverture le dit — pas qu'il est silencieusement absent.
  assert(r.resolved.length === 1);
});

Deno.test("une macro absente rend CETTE macro inconnue, pas tout le plat", () => {
  const r = resolveIngredients(INDEX, [
    { term: "celery", amount: 100, unit: "g", state: "raw" },
    { term: "tomato", amount: 100, unit: "g", state: "raw" },
  ]);
  const n = nutrientsOf(r.resolved);
  assert(n !== "unknown");
  assertEquals(n.fatG, null, "le céleri n'a pas de lipides connus");
  assert(n.energyKcal > 0, "l'énergie, elle, reste calculable");
  assert(n.proteinG !== null);
});

Deno.test("aucun ingrédient exploitable ⇒ unknown, jamais zéro", () => {
  assertEquals(nutrientsOf([]), "unknown");
});

// ---------------------------------------------------------------------------
// LA DÉCOTE D'ATWATER
// ---------------------------------------------------------------------------

Deno.test("les fruits à coque entiers portent leur décote", () => {
  const withDiscount = nutrientsOf([{ ref: REFS.find((r) => r.slug === "almonds")!, gramsRaw: 100 }]);
  const withoutDiscount = nutrientsOf([
    { ref: { ...REFS.find((r) => r.slug === "almonds")!, atwaterDiscount: 1 }, gramsRaw: 100 },
  ]);
  assert(withDiscount !== "unknown" && withoutDiscount !== "unknown");
  assertEquals(withDiscount.energyKcal, Math.round(600 * 0.72));
  assert(withDiscount.energyKcal < withoutDiscount.energyKcal);
});

// ---------------------------------------------------------------------------
// LA FRITURE
// ---------------------------------------------------------------------------

Deno.test("la friture se reconnaît en EN et en FR", () => {
  assert(isFriedMethod("Deep-fry the fritters until golden."));
  assert(isFriedMethod("Pan fried in a little oil"));
  assert(isFriedMethod("Faire frire les beignets"));
  assert(isFriedMethod("Cuisson en friture"));
});

Deno.test("« sauté à sec » ne déclenche AUCUNE imputation", () => {
  // Un sauté sans matière grasse est exactement le plat qu'une imputation
  // ferait passer pour un beignet.
  assert(!isFriedMethod("Sauté à sec dans une poêle antiadhésive"));
  assert(!isFriedMethod("Dry-fried in a non-stick pan"));
  assert(!isFriedMethod("Roast the vegetables in the oven"));
  assert(!isFriedMethod(""));
});

Deno.test("l'imputation d'huile ajoute de l'énergie ET des lipides", () => {
  const ing = [{ ref: REFS.find((r) => r.slug === "white_rice")!, gramsRaw: 100 }];
  const plain = nutrientsOf(ing);
  const fried = nutrientsOf(ing, { friedMethod: true });
  assert(plain !== "unknown" && fried !== "unknown");
  assert(fried.energyKcal > plain.energyKcal);
  assert((fried.fatG ?? 0) > (plain.fatG ?? 0));
  // 12 % du poids CUIT, pas du poids cru: c'est l'huile absorbée par ce qui
  // sort de la friteuse.
  const cookedWeight = 100 * YIELD_FACTORS.grain_absorbs;
  assertEquals(
    fried.energyKcal - plain.energyKcal,
    Math.round(cookedWeight * FRY_OIL_UPTAKE_RATIO * 9),
  );
});

// ---------------------------------------------------------------------------
// LA CLASSE DENSE
// ---------------------------------------------------------------------------

Deno.test("un inconnu de classe dense est signalé — dans les deux langues", () => {
  assert(looksEnergyDense("truffle oil"));
  assert(looksEnergyDense("huile de noisette"));
  assert(looksEnergyDense("crème de marrons"));
  assert(looksEnergyDense("pecan nuts"));
  assert(!looksEnergyDense("courgette"));
  assert(!looksEnergyDense("sumac"));

  const r = resolveIngredients(INDEX, [
    { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
    { term: "truffle oil", amount: 10, unit: "ml", state: "raw" },
  ]);
  assert(r.unresolvedEnergyDense, "une matière grasse inconnue doit se voir");
});

Deno.test("une matière grasse CONNUE mais non pesée se voit aussi", () => {
  // ── LE MIROIR DE LA GARDE PRÉCÉDENTE ────────────────────────────────────
  // « olive oil » se résout, donc `coverage` le compte comme connu — 100 %.
  // Mais sans unité, il ne produit pas de grammes, il sort de `resolved`, et
  // son énergie n'entre dans AUCUNE somme. Sans ce drapeau, le plat se
  // présenterait comme parfaitement lisible en ayant perdu 900 kcal/100 g.
  const r = resolveIngredients(INDEX, [
    { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
    { term: "olive oil", amount: 2, unit: null, state: "raw" },
  ]);
  assertEquals(r.unresolvedTerms, [], "rien n'est inconnu ici");
  assertEquals(r.coverage, 1, "la couverture ne voit aucun trou");
  assert(r.unweighedTerms.includes("olive oil"));
  assert(r.unweighedEnergyDense, "l'huile non pesée doit lever le drapeau");
});

Deno.test("un CONDIMENT non pesé ne lève pas le drapeau dense", () => {
  // La contre-épreuve, et c'est tout l'objet de la distinction: une tomate ou
  // un oignon sans poids ne déplace pas l'énergie d'un plat. Si ce test
  // tombait en même temps que le précédent, le drapeau serait un simple
  // synonyme de `unweighedTerms.length > 0` — donc une garde qui s'abstient
  // sur du sel, exactement ce qu'on vient de retirer de la porte des 80 %.
  const r = resolveIngredients(INDEX, [
    { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
    { term: "tomatoes", amount: 2, unit: "unit", state: "raw" },
  ]);
  assert(r.unweighedTerms.includes("tomatoes"), "la tomate n'est pas pesable ici");
  assert(!r.unweighedEnergyDense, "un légume non pesé ne déplace pas l'énergie");
});

Deno.test("résolu mais NON PESÉ est compté à part de non résolu", () => {
  // Les deux compteurs pilotent deux chantiers différents: l'un la curation
  // d'alias, l'autre le respect du contrat de quantités structurées. Les
  // confondre ferait chercher des alias pour un problème de prompt.
  const r = resolveIngredients(INDEX, [
    { term: "rice", amount: 100, unit: "g", state: null },
  ]);
  assertEquals(r.unresolvedTerms, []);
  assertEquals(r.unweighedTerms, ["rice"]);
  assertEquals(r.coverage, 1);
  assertEquals(r.resolved.length, 0);
});

Deno.test("« 3 œufs » se pèse parce que le RÉFÉRENTIEL sait ce que pèse un œuf", () => {
  // Sans `unitGrams`, l'ingrédient le plus fréquent d'un petit-déjeuner serait
  // résolu et jamais pesé. Le poids vient du référentiel, pas de la recette:
  // c'est une propriété de l'aliment.
  const r = resolveIngredients(INDEX, [{ term: "oeufs", amount: 3, unit: "unit", state: "raw" }]);
  assertEquals(r.unweighedTerms, []);
  assertEquals(r.resolved[0]?.gramsRaw, 165);
});

Deno.test("un aliment SANS poids d'unité reste non pesé — pas d'estimation", () => {
  // « 2 courgettes » pèse entre 300 et 800 g. Poser une valeur ferait d'un
  // dénombrement une mesure.
  const r = resolveIngredients(INDEX, [{ term: "tomato", amount: 2, unit: "unit", state: "raw" }]);
  assertEquals(r.unweighedTerms, ["tomato"]);
});

Deno.test("normalizeTerm déplie la ligature et retire les accents", () => {
  assertEquals(normalizeTerm("Œufs"), "oeufs");
  assertEquals(normalizeTerm("Crème  fraîche,"), "creme fraiche");
});

// ---------------------------------------------------------------------------
// FF-038 ÉTAGE B — LE CONTRAT DE QUANTITÉS, DE BOUT EN BOUT DANS LE PARSEUR
// ---------------------------------------------------------------------------

import {
  MEAL_SYSTEM_PROMPT,
  parseGeneratedMeal,
} from "./meal_generation.ts";

const PARSE_DOCTRINE = { forbidden: [], foods: { recommended: [], discouraged: [] } };

function parseWith(
  ingredients: Record<string, unknown>[],
  over: Record<string, unknown> = {},
) {
  return parseGeneratedMeal({
    dishes: [{
      title: "Chicken and rice bowl",
      slot: "dinner",
      day: "mon",
      ingredients,
      method: "Cook it.",
      why: "Because.",
      honours_belief_keys: [],
    }],
    shopping_list: [],
  }, {
    doctrine: PARSE_DOCTRINE,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["mon"],
    awayDays: [],
    cookingTimeMin: null,
    composition: INDEX,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    ...over,
  });
}

Deno.test("un ingrédient complet ⇒ gramsRaw RECALCULÉ par le parseur", () => {
  const meal = parseWith([
    { term: "chicken breast", quantity: "150 g", amount: 150, unit: "g", state: "raw" },
  ]);
  const ing = meal.dishes[0].ingredients[0];
  assertEquals(ing.amount, 150);
  assertEquals(ing.unit, "g");
  assertEquals(ing.state, "raw");
  assertEquals(ing.gramsRaw, 150);
  // La prose reste INTACTE: c'est elle que l'élève lit.
  assertEquals(ing.quantity, "150 g");
});

Deno.test("les grammes ne sont JAMAIS lus d'un champ du modèle", () => {
  // Précédent `in_pantry`: l'arithmétique du modèle n'est pas une preuve. Un
  // modèle qui rend « grams_raw: 9999 » sur 150 g de poulet a écrit un nombre.
  const meal = parseWith([
    {
      term: "chicken breast",
      quantity: "150 g",
      amount: 150,
      unit: "g",
      state: "raw",
      grams_raw: 9999,
      gramsRaw: 9999,
    },
  ]);
  assertEquals(meal.dishes[0].ingredients[0].gramsRaw, 150);
});

Deno.test("du riz CUIT est reconverti en cru par le parseur", () => {
  const meal = parseWith([
    { term: "rice", quantity: "200 g cooked", amount: 200, unit: "g", state: "cooked" },
  ]);
  const g = meal.dishes[0].ingredients[0].gramsRaw!;
  assertEquals(Math.round(g), Math.round(200 / YIELD_FACTORS.grain_absorbs));
});

Deno.test("un `state` manquant sur du riz ⇒ gramsRaw null, et c'est COMPTÉ", () => {
  const meal = parseWith([
    { term: "rice", quantity: "100 g", amount: 100, unit: "g" },
  ]);
  const ing = meal.dishes[0].ingredients[0];
  assertEquals(ing.state, null);
  assertEquals(ing.gramsRaw, null);
  // `amount` et `unit` sont là: l'issue agrégée ne compte QUE ce qui manque au
  // contrat, pas ce que le référentiel n'a pas su peser.
  assertEquals(ing.amount, 100);
  assertEquals(meal.issues.filter((i) => i.startsWith("structured_quantity_missing")), []);
});

Deno.test("une unité hors liste fermée est refusée, pas convertie", () => {
  const meal = parseWith([
    { term: "rice", quantity: "1 cup", amount: 1, unit: "cup", state: "raw" },
  ]);
  const ing = meal.dishes[0].ingredients[0];
  assertEquals(ing.unit, null);
  assertEquals(ing.gramsRaw, null);
  assert(meal.issues.some((i) => i.startsWith("structured_quantity_missing")));
});

Deno.test("l'issue de quantité est AGRÉGÉE, une seule ligne", () => {
  // Un modèle qui ignore le contrat en entier produirait quarante lignes
  // identiques, qui noieraient les constats utiles (un allergène, un lot gardé
  // six jours). Le chiffre est ce qu'on veut lire.
  const meal = parseWith([
    { term: "chicken breast", quantity: "some" },
    { term: "rice", quantity: "some" },
    { term: "olive oil", quantity: "a drizzle" },
  ]);
  const lines = meal.issues.filter((i) => i.startsWith("structured_quantity_missing"));
  assertEquals(lines.length, 1);
  assert(lines[0].includes("3/3"));
});

Deno.test("la part DENSE sans grammes est NOMMÉE, à part du compteur", () => {
  // ── POURQUOI DEUX CANAUX ────────────────────────────────────────────────
  // « 26 ingrédients sans grammes » et « l'huile d'olive n'a pas de grammes »
  // ont le même compteur et pas du tout le même coût: les 26 sont du sel et du
  // poivre, l'huile éteint le verdict de son plat (`unweighedEnergyDense`).
  // Mesuré sur 80 générations réelles: 82 lignes d'huile sans quantité.
  //
  // Ici on NOMME — la liste est courte par construction, et c'est le terme
  // exact qu'il faut pour savoir si la consigne du prompt a porté.
  const meal = parseWith([
    { term: "chicken breast", quantity: "150 g", amount: 150, unit: "g", state: "raw" },
    { term: "olive oil", quantity: "a drizzle" },
    { term: "tomatoes", quantity: "a handful" },
  ]);
  const dense = meal.issues.filter((i) => i.startsWith("energy_dense_unweighed"));
  assertEquals(dense.length, 1);
  assert(dense[0].includes("olive oil"));
  // ⚠️ LA CONTRE-ÉPREUVE: la tomate est sans grammes elle aussi, et elle n'a
  // rien à faire là. Sans cette assertion, le canal dense serait un synonyme
  // du compteur — donc un second nom pour la même chose.
  assert(!dense[0].includes("tomato"), "un légume n'est pas de la classe dense");
});

Deno.test("aucune ligne dense ⇒ AUCUNE issue dense", () => {
  // Le cas qui passe. Une garde qui lève toujours ressemble à une garde qui
  // marche, et celle-ci se déclencherait sur chaque plan si elle lisait le
  // simple fait qu'un ingrédient n'est pas pesé.
  const meal = parseWith([
    { term: "chicken breast", quantity: "150 g", amount: 150, unit: "g", state: "raw" },
    { term: "olive oil", quantity: "1 tbsp", amount: 1, unit: "tbsp", state: "raw" },
    { term: "tomatoes", quantity: "a handful" },
  ]);
  assertEquals(meal.issues.filter((i) => i.startsWith("energy_dense_unweighed")), []);
});

Deno.test("condition de désarmement: l'ANCIEN format parse comme avant", () => {
  // Aux issues près. C'est ce qui rend le lot rejouable sur les plans
  // existants et survivable à un modèle qui ignore la consigne.
  const meal = parseWith([{ term: "chicken breast", quantity: "150 g" }]);
  const ing = meal.dishes[0].ingredients[0];
  assertEquals(ing.term, "chicken breast");
  assertEquals(ing.quantity, "150 g");
  assertEquals(ing.in_pantry, false);
  assertEquals(ing.amount, null);
  assertEquals(ing.unit, null);
  assertEquals(ing.state, null);
  assertEquals(ing.gramsRaw, null);
  assertEquals(meal.dishes.length, 1);
});

Deno.test("référentiel indisponible: les trois champs SURVIVENT, seuls les grammes manquent", () => {
  const meal = parseWith(
    [{ term: "chicken breast", quantity: "150 g", amount: 150, unit: "g", state: "raw" }],
    { composition: null },
  );
  const ing = meal.dishes[0].ingredients[0];
  assertEquals(ing.amount, 150);
  assertEquals(ing.unit, "g");
  assertEquals(ing.gramsRaw, null);
  // NOMMÉ: sinon un référentiel en panne ressemblerait à un modèle muet.
  assert(meal.issues.some((i) => i.startsWith("composition_index_unavailable")));
});

Deno.test("le contrat de quantités est bien DANS le prompt système", () => {
  assert(MEAL_SYSTEM_PROMPT.includes('"amount"'));
  assert(MEAL_SYSTEM_PROMPT.includes('"unit"'));
  assert(MEAL_SYSTEM_PROMPT.includes('"state"'));
  for (const unit of ["g", "ml", "unit", "tbsp", "tsp"]) {
    assert(MEAL_SYSTEM_PROMPT.includes(`"${unit}"`), `unité ${unit} absente du contrat`);
  }
});

Deno.test("le filtre numérique reste armé sur la PROSE malgré les champs neufs", () => {
  // Un contrat qui gagne trois champs numériques est exactement le genre de
  // changement qui pousse un modèle à écrire des chiffres ailleurs. La
  // contre-mesure du §10 est ce test, plus la surveillance de rejected_numeric.
  const meal = parseWith([
    { term: "granola", quantity: "1800 kcal", amount: 50, unit: "g", state: "raw" },
  ]);
  assertEquals(meal.dishes, []);
  assertEquals(meal.rejected_numeric, ["energy_unit_in_quantity"]);
});

// ---------------------------------------------------------------------------
// LE MILIEU DE CONSERVATION — le défaut mesuré en run réel le 2026-08-11
// ---------------------------------------------------------------------------

Deno.test("« X in Y » se résout sur X — le thon au naturel reste du thon", () => {
  // LE DÉFAUT QUE CE TEST GARDE, et il ne coûtait pas une ligne de calcul: il
  // faussait LE DIAGNOSTIC. Le modèle écrit « canned tuna in spring water,
  // drained »; `canned` et `drained` tombaient bien, mais « in spring water »
  // restait et l'appariement échouait — alors que l'aliment EXISTE.
  //
  // Or ce que le modèle décrit le plus volontiers, ce sont les SOURCES DE
  // PROTÉINE et les féculents: précisément ce qui porte l'énergie. Un plat de
  // thon se calculait à 3 g de protéines, et le plan entier passait pour trois
  // fois plus léger qu'il n'était. Un défaut de MESURE pris pour un défaut de
  // PRODUIT.
  assertEquals(resolveIngredient(INDEX, "chicken in a light marinade")?.slug, "chicken_breast");
  assertEquals(resolveIngredient(INDEX, "chopped tomatoes in juice")?.slug, "tomato");
  assertEquals(resolveIngredient(INDEX, "haricots dans une sauce")?.slug, undefined);
  // La réduction s'applique AVANT le retrait des modificateurs, donc les deux
  // se composent: « canned X in Y, drained » doit tomber sur X.
  assertEquals(resolveIngredient(INDEX, "canned tomatoes in brine, drained")?.slug, "tomato");
});

Deno.test("`with` ne coupe JAMAIS — il nomme un second aliment", () => {
  // « chicken with rice » nomme deux aliments. Couper y perdrait le second, et
  // le calcul compterait un plat pour la moitié de ce qu'il est. Seul le
  // MILIEU se coupe, jamais une énumération.
  // Et il reste donc NON RÉSOLU — ce qui est le bon comportement: « chicken
  // with rice » n'est pas un aliment, c'est une assiette. Le compter comme du
  // poulet seul ferait disparaître le riz du calcul.
  assertEquals(resolveIngredient(INDEX, "chicken with rice"), null);
  // Et l'ALTERNATIVE disqualifie toujours, coupure ou pas.
  assertEquals(resolveIngredient(INDEX, "butter or olive oil"), null);
  assertEquals(resolveIngredient(INDEX, "olive oil or butter in a pan"), null);
});

Deno.test("désarmement: un terme sans milieu se résout comme avant", () => {
  // La réduction ne doit RIEN changer aux termes qui marchaient déjà.
  for (const [term, slug] of [
    ["chicken", "chicken_breast"],
    ["basmati rice", "white_rice"],
    ["huile d'olive", "olive_oil"],
    ["tomatoes", "tomato"],
    ["oignon", "onion"],
  ] as const) {
    assertEquals(resolveIngredient(INDEX, term)?.slug, slug, term);
  }
  // Et un terme inconnu reste inconnu: la réduction n'invente pas.
  assertEquals(resolveIngredient(INDEX, "wholemeal tortilla"), null);
  assertEquals(resolveIngredient(INDEX, "kombu in dashi"), null);
});

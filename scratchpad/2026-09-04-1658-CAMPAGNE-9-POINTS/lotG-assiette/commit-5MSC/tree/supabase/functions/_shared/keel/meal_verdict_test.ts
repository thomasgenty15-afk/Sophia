// FF-039 — LE VERDICT. Ce que ces tests protègent, dans l'ordre de ce qui
// coûte le plus cher quand ça casse:
//
//   * LE VERDICT ACTIONNÉ — la sortie du parseur doit être IDENTIQUE avec et
//     sans ce calcul. Un verdict qui touche une assiette n'est plus une
//     observation, et la gate du chantier n'aura rien gardé;
//   * L'ABSTENTION QUI NE MORD PAS — un verdict rendu sur 95 % des ingrédients
//     mais sans l'huile a l'air d'un résultat, et il est plus dangereux qu'un
//     `not_computable`;
//   * LE VERDICT ÉNERGIE QUI EXISTE SOUS FLAG — il finirait dans un log, un
//     agrégat ou un export. Non-existence plutôt que suppression;
//   * LE CHIFFRE QUI SORT — le verdict est en MOTS. Un nombre stocké finit
//     toujours par être agrégé puis montré.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  foldPreparationsIntoDishes,
  isWateryPreparation,
  MIN_RESOLUTION_FOR_VERDICT,
  PER_PORTION_PROTEIN_G,
  SENTINEL_CARRIER_SHARE,
  SENTINEL_FLAG_BY_COLUMN,
  SENTINEL_FLAGS,
  sentinelCarriersOf,
  sentinelGroupsOf,
  verdictFor,
} from "./meal_verdict.ts";
import { envelopeFor } from "./meal_envelope.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
  isFriedMethod,
} from "./food_composition.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { parseGeneratedMeal } from "./meal_generation.ts";
import {
  DIETARY_REGIMES,
  uncoverableSentinelsFor,
} from "./dietary_regime.ts";
import type { DietaryRegime } from "./dietary_regime.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    // LOT 18 — la provenance par défaut d'un décor de test est le référentiel
    // HUMAIN: c'est ce que ces cas décrivent. Un défaut à `model` ferait lire
    // « le modèle a rempli » à toute la suite existante.
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
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 110, proteinG: 23.4, carbsG: 0, fatG: 1.5, fiberG: 0, yieldClass: "meat_shrinks" }),
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 350, proteinG: 7, carbsG: 78, fatG: 0.6, fiberG: 1.4, yieldClass: "grain_absorbs" }),
  ref({ slug: "whole_eggs", foodGroupRef: "eggs", energyKcal: 139, proteinG: 12.7, carbsG: 0.3, fatG: 9.8, fiberG: 0, unitGrams: 55, b12Source: true }),
  ref({ slug: "salmon", foodGroupRef: "fatty_fish", energyKcal: 200, proteinG: 20, carbsG: 0, fatG: 13, fiberG: 0, yieldClass: "fish_shrinks", omega3Marine: true }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, energyDense: true }),
  ref({ slug: "carrot", energyKcal: 36, proteinG: 0.6, carbsG: 6.5, fatG: 0.2, fiberG: 2.4, yieldClass: "veg_shrinks" }),
  ref({ slug: "leek", energyKcal: 30, proteinG: 1.5, carbsG: 4, fatG: 0.3, fiberG: 2.5, yieldClass: "veg_shrinks" }),
];

const INDEX = buildCompositionIndex(REFS, [
  { alias: "chicken breast", slug: "chicken_breast" },
  { alias: "rice", slug: "white_rice" },
  { alias: "eggs", slug: "whole_eggs" },
  { alias: "salmon", slug: "salmon" },
  { alias: "olive oil", slug: "olive_oil" },
  { alias: "carrots", slug: "carrot" },
  { alias: "leeks", slug: "leek" },
]);

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
    ...over,
  };
}

const PER_KG = envelopeFor("fat_loss", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null);
const PER_PORTION = envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, null, { day: null, sport: null, asked: false }, null, null);

// ---------------------------------------------------------------------------
// L'ABSTENTION AVANT L'ERREUR
// ---------------------------------------------------------------------------

Deno.test("sous le seuil de résolution, TOUT s'abstient", () => {
  const verdict = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [
        { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
        { term: "sumac", amount: 5, unit: "g", state: "raw" },
        { term: "za'atar", amount: 5, unit: "g", state: "raw" },
        { term: "berbere", amount: 5, unit: "g", state: "raw" },
        { term: "dukkah", amount: 5, unit: "g", state: "raw" },
      ],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assert(verdict.resolution.resolved / verdict.resolution.total < MIN_RESOLUTION_FOR_VERDICT);
  assertEquals(verdict.energy, "not_computable");
  assertEquals(verdict.protein, "not_computable");
  assertEquals(verdict.density, "not_computable");
});

Deno.test("UN SEUL inconnu de classe dense suffit, même à 95 % de résolution", () => {
  // Une matière grasse manquante déplace l'énergie d'un plat de plusieurs
  // dizaines de pour cent. Un verdict rendu sans elle a l'air d'un résultat.
  const ingredients = [
    ...Array.from({ length: 19 }, () => ({ term: "carrots", amount: 50, unit: "g" as const, state: "raw" as const })),
    { term: "truffle oil", amount: 20, unit: "ml" as const, state: "raw" as const },
  ];
  const verdict = verdictFor({
    dishes: [{ slot: "dinner", method: "Roast.", ingredients }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(verdict.resolution.total, 20);
  assertEquals(verdict.resolution.resolved, 19);
  assert(verdict.resolution.unresolvedEnergyDense);
  assertEquals(verdict.energy, "not_computable");
});

// ---------------------------------------------------------------------------
// LE PLIAGE DES PRÉPARATIONS — la moitié du plan
// ---------------------------------------------------------------------------

Deno.test("un plat qui n'a QUE des `uses` porte la masse de sa préparation", () => {
  // ── LE DÉFAUT MESURÉ (2026-08-12, 80 générations) ───────────────────────
  // 41 % de l'énergie et 51 % de la PROTÉINE vivaient dans les préparations,
  // et l'appelant ne passait que `dish.ingredients`. Le verdict rendait
  // « below/under » sur des plans à 99 % de leur cible, et la boucle de
  // correction dépensait son unique relance à réparer un plan déjà juste.
  const folded = foldPreparationsIntoDishes({
    dishes: [{
      slot: "dinner",
      method: "Reheat a portion.",
      ingredients: [],
      uses: [{ preparationId: "prep_chicken", servings: 1 }],
    }],
    preparations: [{
      id: "prep_chicken",
      servingsMade: 4,
      ingredients: [
        { term: "chicken breast", amount: 1000, unit: "g", state: "raw" },
      ],
    }],
  });
  assertEquals(folded.length, 1);
  assertEquals(folded[0].ingredients.length, 1);
  // ⚠️ LE PRORATA: 1 portion sur 4, donc 250 g — pas le kilo du lot. Compter
  // le lot entier à chaque plat qui y touche ferait l'erreur inverse, et plus
  // grosse: quatre dîners porteraient quatre kilos de poulet.
  assertEquals(folded[0].ingredients[0].amount, 250);
});

Deno.test("le verdict CHANGE quand la préparation entre — la preuve chiffrée", () => {
  // Sans cette assertion, le pliage pourrait ne rien plier et tous les autres
  // tests resteraient verts: c'est exactement ce qui est arrivé pendant que la
  // fonction vivait en fermeture dans l'edge function, hors de portée des
  // tests.
  const dish = {
    slot: "dinner" as const,
    method: "Reheat a portion.",
    ingredients: [],
    uses: [{ preparationId: "p", servings: 1 }],
  };
  const preparations = [{
    id: "p",
    servingsMade: 1,
    ingredients: [
      { term: "chicken breast", amount: 800, unit: "g" as const, state: "raw" as const },
      { term: "rice", amount: 150, unit: "g" as const, state: "raw" as const },
    ],
  }];
  const common = {
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  };
  // Ce que faisait l'appelant fautif: les plats seuls.
  const sansPreps = verdictFor({ dishes: [{ ...dish, ingredients: [] }], ...common });
  assertEquals(sansPreps.resolution.total, 0, "un plat vide n'a rien à lire");
  assertEquals(sansPreps.protein, "not_computable");

  const avecPreps = verdictFor({
    dishes: foldPreparationsIntoDishes({ dishes: [dish], preparations }),
    ...common,
  });
  assertEquals(avecPreps.resolution.total, 2);
  assertEquals(avecPreps.protein, "met", "800 g de poulet passent le plancher");
});

Deno.test("une `uses` vers une préparation inconnue est IGNORÉE, pas devinée", () => {
  const folded = foldPreparationsIntoDishes({
    dishes: [{
      slot: "lunch",
      method: "Assemble.",
      ingredients: [{ term: "rice", amount: 80, unit: "g", state: "raw" }],
      uses: [{ preparationId: "absent", servings: 2 }],
    }],
    preparations: [],
  });
  assertEquals(folded[0].ingredients.length, 1);
  assertEquals(folded[0].ingredients[0].term, "rice");
});

Deno.test("une quantité ABSENTE reste absente après le prorata", () => {
  // R2 du moteur: on propage de l'inconnu, jamais du zéro. Un `null × 0.25`
  // qui rendrait 0 traverserait toutes les additions sans rien signaler, et le
  // plancher protéique serait jugé atteint sur un lot qu'on n'a pas su lire.
  const folded = foldPreparationsIntoDishes({
    dishes: [{
      slot: "dinner",
      method: "Reheat.",
      ingredients: [],
      uses: [{ preparationId: "p", servings: 1 }],
    }],
    preparations: [{
      id: "p",
      servingsMade: 4,
      ingredients: [{ term: "olive oil", amount: null, unit: null, state: null }],
    }],
  });
  assertEquals(folded[0].ingredients[0].amount, null);
});

Deno.test("sans préparation, le pliage rend EXACTEMENT les plats d'avant", () => {
  // La condition de désarmement: le chemin sans batch cooking ne doit pas
  // bouger d'un ingrédient.
  const dishes = [{
    slot: "lunch" as const,
    method: "Cook.",
    ingredients: [{ term: "rice", amount: 80, unit: "g" as const, state: "raw" as const }],
    uses: [],
  }];
  const folded = foldPreparationsIntoDishes({ dishes, preparations: [] });
  assertEquals(folded, [{
    slot: "lunch",
    method: "Cook.",
    ingredients: [{ term: "rice", amount: 80, unit: "g", state: "raw" }],
  }]);
});

Deno.test("une matière grasse CONNUE mais non pesée s'abstient aussi", () => {
  // Le miroir de la garde ci-dessus, et le trou qu'elle laissait: « olive
  // oil » sans unité se RÉSOUT — la couverture est de 100 %, la porte des
  // 80 % s'ouvre — et son énergie n'entre dans aucune somme. Le verdict
  // porterait sur un plat amputé de 180 kcal en se présentant comme complet.
  const verdict = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Roast.",
      ingredients: [
        { term: "chicken breast", amount: 200, unit: "g", state: "raw" },
        { term: "rice", amount: 100, unit: "g", state: "raw" },
        { term: "olive oil", amount: 2, unit: null, state: "raw" },
      ],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(verdict.resolution.resolved, 3, "les trois termes sont CONNUS");
  assertEquals(verdict.resolution.unresolvedEnergyDense, false);
  assert(verdict.resolution.unweighedEnergyDense);
  assertEquals(verdict.energy, "not_computable");
});

Deno.test("des CONDIMENTS non pesés n'empêchent PAS le verdict", () => {
  // ⚠️ LE CAS QUI PASSE — sans lui, la garde précédente serait indiscernable
  // d'une garde qui s'abstient dès qu'un ingrédient n'est pas pesé.
  //
  // ── CE QUE CE TEST A COÛTÉ (mesuré le 2026-08-12) ───────────────────────
  // Compter les seuls ingrédients PESÉS donnait 69 % de résolution sur une
  // assiette réelle dont 26 des 30 écarts étaient du sel, du poivre, de la
  // cannelle et des légumes comptés à l'unité. Sous la porte des 80 %, donc
  // pas de verdict, pas de boucle de correction, pas de mise à l'échelle —
  // tout l'étage éteint par des condiments. On a cherché la cause dans le
  // référentiel deux fois avant de la trouver dans le compteur.
  const ingredients = [
    { term: "chicken breast", amount: 200, unit: "g" as const, state: "raw" as const },
    { term: "rice", amount: 100, unit: "g" as const, state: "raw" as const },
    // Connus du référentiel, sans poids d'unité: ils sortent de `resolved`.
    ...Array.from({ length: 6 }, () => ({
      term: "carrots",
      amount: 1,
      unit: "unit" as const,
      state: "raw" as const,
    })),
  ];
  const verdict = verdictFor({
    dishes: [{ slot: "dinner", method: "Roast.", ingredients }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(verdict.resolution.resolved, 8);
  assertEquals(verdict.resolution.total, 8);
  assertEquals(verdict.resolution.unweighedEnergyDense, false);
  assert(
    verdict.energy !== "not_computable",
    "six légumes non pesés ne doivent pas éteindre l'énergie",
  );
});

// ---------------------------------------------------------------------------
// LE VERDICT ÉNERGIE N'EXISTE PAS SOUS FLAG
// ---------------------------------------------------------------------------

Deno.test("en per_portion, le verdict énergie N'EST PAS PRODUIT", () => {
  // Non-existence plutôt que suppression: un champ calculé puis filtré à
  // l'affichage finit dans un log, un agrégat ou un export.
  const dishes = [{
    slot: "dinner",
    method: "Cook it.",
    ingredients: [
      { term: "chicken breast", amount: 200, unit: "g" as const, state: "raw" as const },
      { term: "rice", amount: 100, unit: "g" as const, state: "raw" as const },
    ],
  }];
  const flagged = verdictFor({ dishes, envelope: PER_PORTION, index: INDEX, daysCovered: 1,
 windowDays: 1, uncoverableSentinels: [], fixedIntakeInputs: [] });
  assertEquals(flagged.energy, "not_computable");
  assertEquals(flagged.density, "not_computable");
  // Et la protéine, elle, SURVIT: elle vit côté aliment, calculée depuis la
  // recette et jamais dérivée du corps.
  assertEquals(flagged.protein, "met");
});

Deno.test("per_portion et corps inconnu rendent le MÊME verdict", () => {
  const dishes = [{
    slot: "lunch",
    method: "Cook it.",
    ingredients: [{ term: "carrots", amount: 200, unit: "g" as const, state: "raw" as const }],
  }];
  const flagged = verdictFor({ dishes, envelope: PER_PORTION, index: INDEX, daysCovered: 1,
 windowDays: 1, uncoverableSentinels: [], fixedIntakeInputs: [] });
  const unknownBody = verdictFor({
    dishes,
    envelope: envelopeFor("fat_loss", null, null, false, null, null, { day: null, sport: null, asked: false }, null, null),
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(JSON.stringify(flagged), JSON.stringify(unknownBody));
});

// ---------------------------------------------------------------------------
// LA PROTÉINE EN GRAMMES CALCULÉS
// ---------------------------------------------------------------------------

Deno.test("« eggs » en garniture est `under` là où la PRÉSENCE ne mordait pas", () => {
  // C'est le trou que la simple présence de FF-037 laisse ouvert: un œuf sur
  // une assiette de riz porte 6 g de protéine et passe la vérification de
  // présence. Le calcul, lui, mord.
  const garnish = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Fry an egg on top.",
      ingredients: [
        { term: "rice", amount: 100, unit: "g", state: "raw" },
        { term: "eggs", amount: 1, unit: "unit", state: "raw" },
      ],
    }],
    envelope: PER_PORTION,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(garnish.protein, "under");

  const anchored = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [
        { term: "rice", amount: 100, unit: "g", state: "raw" },
        { term: "chicken breast", amount: 150, unit: "g", state: "raw" },
      ],
    }],
    envelope: PER_PORTION,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(anchored.protein, "met");
});

Deno.test("le verdict ne porte AUCUN chiffre d'énergie ni de macro", () => {
  const verdict = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "chicken breast", amount: 200, unit: "g", state: "raw" }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  // Les seuls nombres autorisés sont des COMPTES d'ingrédients — jamais une
  // énergie, jamais une macro. Un nombre stocké finit par être agrégé puis
  // montré.
  const json = JSON.stringify(verdict);
  assertEquals(
    Object.keys(verdict).sort(),
    ["density", "energy", "protein", "resolution", "sentinels"],
  );
  assert(!json.includes("kcal"));
  assert(!json.includes("Kcal"));
  assert(typeof verdict.energy === "string");
  assert(typeof verdict.protein === "string");
  assertEquals(PER_PORTION_PROTEIN_G > 0, true);
});

// ---------------------------------------------------------------------------
// LA DENSITÉ ET SON ABSTENTION AQUEUSE
// ---------------------------------------------------------------------------

Deno.test("une soupe s'abstient sur la densité, et SEULEMENT sur elle", () => {
  const soup = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Simmer the leeks and carrots into a soup.",
      ingredients: [
        { term: "leeks", amount: 200, unit: "g", state: "raw" },
        { term: "carrots", amount: 200, unit: "g", state: "raw" },
        { term: "chicken breast", amount: 200, unit: "g", state: "raw" },
      ],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(soup.density, "not_computable");
  // L'énergie et la protéine restent calculées: ce n'est pas le PLAT qui est
  // faux, c'est la GRANDEUR qui n'a pas de sens dessus.
  assert(soup.energy !== "not_computable");
  assert(soup.protein !== "not_computable");
});

Deno.test("le lexique aqueux mord dans les DEUX langues", () => {
  assert(isWateryPreparation("Simmer everything into a stew"));
  assert(isWateryPreparation("Faire mijoter le tout"));
  assert(isWateryPreparation("Un potage de légumes"));
  assert(!isWateryPreparation("Roast the vegetables"));
  assert(!isWateryPreparation("Faire revenir à la poêle"));
});

Deno.test("une assiette très grasse est `above` sur la densité", () => {
  const rich = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Roast it.",
      ingredients: [
        { term: "chicken breast", amount: 100, unit: "g", state: "raw" },
        { term: "olive oil", amount: 60, unit: "ml", state: "raw" },
      ],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(rich.density, "above");
});

// ---------------------------------------------------------------------------
// LES SENTINELLES
// ---------------------------------------------------------------------------

Deno.test("les groupes sentinelles se DÉRIVENT du référentiel, pas d'une liste", () => {
  const groups = sentinelGroupsOf(INDEX);
  assert(groups.has("fatty_fish"), "le saumon porte omega3_marine");
  assert(groups.has("eggs"), "l'œuf porte b12_source");
  assert(!groups.has("refined_grain"), "le riz blanc ne porte aucun drapeau");
});

Deno.test("un groupe sentinelle absent de la fenêtre est un TROU", () => {
  const verdict = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "chicken breast", amount: 200, unit: "g", state: "raw" }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assert(verdict.sentinels.missing.includes("fatty_fish"));
  const withFish = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "salmon", amount: 150, unit: "g", state: "raw" }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assert(!withFish.sentinels.missing.includes("fatty_fish"));
});

// ---------------------------------------------------------------------------
// LE VERDICT N'EST JAMAIS ACTIONNÉ
// ---------------------------------------------------------------------------

Deno.test("la sortie du parseur est IDENTIQUE avec et sans calcul de verdict", () => {
  // C'est la définition de « en observation », et la seule chose qui rend
  // cette étape livrable avant d'avoir mesuré quoi que ce soit.
  const payload = {
    dishes: [{
      title: "Chicken and rice",
      slot: "dinner",
      day: "mon",
      ingredients: [
        { term: "chicken breast", quantity: "200 g", amount: 200, unit: "g", state: "raw" },
        { term: "rice", quantity: "100 g", amount: 100, unit: "g", state: "raw" },
      ],
      method: "Cook it.",
      why: "Because.",
      honours_belief_keys: [],
    }],
    shopping_list: [],
  };
  const args = {
    doctrine: { forbidden: [], foods: { recommended: [], discouraged: [] } },
    safetyConstraints: [],
    safetyConstraintTable: null,
    mode: "to_shop" as const,
    scope: "day" as const,
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
    weighedMemberIds: [],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  };
  const before = parseGeneratedMeal(structuredClone(payload), args);
  // Le calcul du verdict tourne ICI, entre les deux parses.
  verdictFor({
    dishes: before.dishes.map((d) => ({
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients.map((i) => ({
        term: i.term,
        amount: i.amount,
        unit: i.unit,
        state: i.state,
      })),
    })),
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    friedMethod: isFriedMethod,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  const after = parseGeneratedMeal(structuredClone(payload), args);
  assertEquals(JSON.stringify(before), JSON.stringify(after));
});

Deno.test("le seuil de porteur ÉCARTE les groupes qui contiennent accidentellement", () => {
  // La première version disait « au moins un aliment porte un drapeau », et
  // sur le vrai référentiel elle rendait 26 groupes sur 30. Ce test mute le
  // référentiel pour prouver que le seuil MORD: un groupe dont un seul aliment
  // sur quatre porte le fer n'est pas un porteur de fer.
  const diluted = buildCompositionIndex([
    ref({ slug: "a1", foodGroupRef: "sauce_dressing", ironSource: true }),
    ref({ slug: "a2", foodGroupRef: "sauce_dressing" }),
    ref({ slug: "a3", foodGroupRef: "sauce_dressing" }),
    ref({ slug: "a4", foodGroupRef: "sauce_dressing" }),
    ref({ slug: "b1", foodGroupRef: "legumes", ironSource: true }),
    ref({ slug: "b2", foodGroupRef: "legumes", ironSource: true }),
    ref({ slug: "b3", foodGroupRef: "legumes" }),
  ], []);
  const carriers = sentinelCarriersOf(diluted);
  const iron = carriers.get("ironSource")!;
  assert(iron.has("legumes"), "2/3 des légumineuses portent le fer");
  assert(!iron.has("sauce_dressing"), "1/4 n'est pas un porteur caractéristique");
  assertEquals(SENTINEL_CARRIER_SHARE, 2 / 3);
});

Deno.test("un nutriment COUVERT retire tous ses porteurs de la liste", () => {
  // Du saumon couvre l'oméga-3 marin: il devient alors indifférent que les
  // fruits de mer n'aient pas paru. `missing` ne doit lister que ce qui
  // RÉPARERAIT un trou réel.
  const withSalmon = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "salmon", amount: 150, unit: "g", state: "raw" }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assert(!withSalmon.sentinels.missing.includes("fatty_fish"));
  assert(!withSalmon.sentinels.missing.includes("shellfish"),
    "les fruits de mer portent le même nutriment, déjà couvert");
});

// ---------------------------------------------------------------------------
// FF-042 R6 — LE TROU STRUCTUREL, ET LA BOUCLE QU'IL FERAIT SANS CETTE GARDE
// ---------------------------------------------------------------------------

Deno.test("un trou INCOUVRABLE sort des trous réparables", () => {
  // C'est LE test de ce chantier. Sans lui, la correction placerait une recette
  // censée apporter la B12, la génération suivante ne la trouverait pas
  // davantage, et le retry se déclencherait à CHAQUE plan.
  const dishes = [{
    slot: "dinner",
    method: "Cook it.",
    ingredients: [{ term: "carrots", amount: 300, unit: "g" as const, state: "raw" as const }],
  }];
  const omnivore = verdictFor({
    dishes,
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  const vegan = verdictFor({
    dishes,
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: ["b12_source"],
    fixedIntakeInputs: [],
  });
  // L'omnivore voit les œufs comme un trou réparable (ils portent la B12).
  assert(omnivore.sentinels.missing.includes("eggs"));
  // Le végan, non — et ce groupe ne peut plus déclencher aucune correction.
  assert(!vegan.sentinels.missing.includes("eggs"));
  // …mais le trou n'a pas disparu: il a changé de canal.
  assertEquals(vegan.sentinels.uncoverable, ["b12_source"]);
  assertEquals(omnivore.sentinels.uncoverable, []);
});

Deno.test("le canal structurel SURVIT à l'abstention", () => {
  // « Cet élève est végan » ne dépend pas de ce qu'on a su lire dans son
  // assiette cette semaine.
  const v = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "sumac", amount: 5, unit: "g" as const, state: "raw" as const }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: ["b12_source"],
    fixedIntakeInputs: [],
  });
  assertEquals(v.energy, "not_computable");
  assertEquals(v.sentinels.uncoverable, ["b12_source"]);
});

Deno.test("un trou COUVRABLE reste réparable — le désarmement", () => {
  // Un omnivore sans B12 cette semaine garde son trou dans le canal réparable:
  // le comportement d'avant ce lot est intact.
  const v = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "carrots", amount: 300, unit: "g" as const, state: "raw" as const }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assert(v.sentinels.missing.length > 0);
  assertEquals(v.sentinels.uncoverable, []);
});

Deno.test("un nom de colonne inconnu est ÉCARTÉ, pas deviné", () => {
  // `SENTINEL_FLAG_BY_COLUMN` est fermée. Une entrée hors table est une faute
  // de frappe ou un drapeau qui n'existe pas encore: l'ignorer est plus sûr que
  // de retirer un trou réparable au hasard.
  const v = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "carrots", amount: 300, unit: "g" as const, state: "raw" as const }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: ["b12", "nonsense_source"],
    fixedIntakeInputs: [],
  });
  // Aucun groupe n'a été retiré des réparables.
  assert(v.sentinels.missing.includes("eggs"));
});

Deno.test("le canal structurel ne contient AUCUN conseil — juste un nom de fait", () => {
  // FF-042 R6: on nomme, on n'ordonne pas. Recommander une supplémentation est
  // un acte que CONTRACT.md réserve au clinicien.
  const v = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "carrots", amount: 300, unit: "g" as const, state: "raw" as const }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 7,
    windowDays: 7,
    uncoverableSentinels: ["b12_source"],
    fixedIntakeInputs: [],
  });
  const json = JSON.stringify(v).toLowerCase();
  for (const word of ["supplement", "complement", "take ", "prends", "pill", "tablet", "injection"]) {
    assert(!json.includes(word), `« ${word} » dans le verdict`);
  }
  // C'est un JETON, pas une phrase: rien à lire pour un élève.
  assertEquals(v.sentinels.uncoverable, ["b12_source"]);
});

Deno.test("la correspondance colonne→drapeau couvre les SEPT, sans trou", () => {
  const mapped = Object.values(SENTINEL_FLAG_BY_COLUMN);
  for (const flag of SENTINEL_FLAGS) {
    assert(mapped.includes(flag), `${flag} n'a pas de nom de colonne`);
  }
  assertEquals(Object.keys(SENTINEL_FLAG_BY_COLUMN).length, SENTINEL_FLAGS.length);
});

Deno.test("la JOINTURE régime→verdict est celle du produit, pas une constante de test", () => {
  // Les tests ci-dessus passent `["b12_source"]` à la main. Ce dépôt a déjà payé
  // « la jointure code↔base n'était pas testée »: c'est ici qu'on vérifie que
  // le régime déclaré produit RÉELLEMENT ce jeton, et que les deux autres
  // régimes n'en produisent aucun.
  const dishes = [{
    slot: "dinner",
    method: "Cook it.",
    ingredients: [{ term: "carrots", amount: 300, unit: "g" as const, state: "raw" as const }],
  }];
  const under = (regime: DietaryRegime) =>
    verdictFor({
      dishes,
      envelope: PER_KG,
      index: INDEX,
      daysCovered: 7,
      windowDays: 7,
      uncoverableSentinels: uncoverableSentinelsFor(regime),
      fixedIntakeInputs: [],
    });

  assertEquals(under("vegan").sentinels.uncoverable, ["b12_source"]);
  // Œufs et laitages portent la B12: un végétarien n'a AUCUN trou structurel,
  // et son trou d'œufs reste réparable comme celui de n'importe qui.
  assertEquals(under("vegetarian").sentinels.uncoverable, []);
  assert(under("vegetarian").sentinels.missing.includes("eggs"));
  assertEquals(under("pescatarian").sentinels.uncoverable, []);
});

Deno.test("chaque nom de colonne du canal structurel EXISTE dans la table", () => {
  // `uncoverable` sert de clause `where` au canal coach. Un nom qui n'est pas
  // une colonne de `food_composition_refs` rendrait la requête agrégée vide —
  // silencieusement, donc invisible.
  const sql = Deno.readTextFileSync(
    new URL("../../../migrations/20260810160000_food_composition_refs.sql", import.meta.url),
  );
  for (const column of Object.keys(SENTINEL_FLAG_BY_COLUMN)) {
    assert(
      sql.includes(`  ${column} boolean not null default false`),
      `${column} n'est pas une colonne de food_composition_refs`,
    );
  }
  // …et le jeton du seul régime qui en produit un est bien dans cette table.
  for (const regime of DIETARY_REGIMES) {
    for (const column of uncoverableSentinelsFor(regime)) {
      assert(column in SENTINEL_FLAG_BY_COLUMN, `${column} hors table de correspondance`);
    }
  }
});

// ---------------------------------------------------------------------------
// LA CADENCE HEBDOMADAIRE — mesurée en run réel le 2026-08-11
// ---------------------------------------------------------------------------

Deno.test("une sentinelle ne se juge PAS sous la semaine", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Sur un plan d'UN SEUL JOUR, le verdict
  // rendait six groupes « manquants » — dairy_cheese, dairy_yogurt, eggs,
  // fatty_fish, shellfish, white_fish. Ce n'est pas un trou, c'est une
  // journée: personne ne mange tout ça le même jour, et la cadence des
  // sentinelles est HEBDOMADAIRE.
  //
  // Le coût n'était pas cosmétique: chaque faux trou consommait un
  // `place_missing_sentinel` dans une relance UNIQUE, à la place d'un vrai
  // écart d'énergie ou de protéine.
  const dishes = [{
    slot: "dinner",
    method: "Cook it.",
    ingredients: [{ term: "chicken breast", amount: 200, unit: "g" as const, state: "raw" as const }],
  }];
  const args = {
    dishes,
    envelope: PER_KG,
    index: INDEX,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  };

  for (const days of [1, 2, 3, 5, 6]) {
    const v = verdictFor({ ...args, daysCovered: days, windowDays: days } as never);
    assertEquals(
      v.sentinels.missing,
      [],
      `${days} jour(s): une cadence hebdomadaire ne se juge pas là-dessus`,
    );
  }

  // À SEPT JOURS, la question a un sens et la grandeur reprend la parole —
  // sinon on aurait remplacé un faux positif par une garde morte.
  const week = verdictFor({ ...args, daysCovered: 7, windowDays: 7 } as never);
  assert(week.sentinels.missing.length > 0, "à 7 jours, les trous doivent revenir");
  assert(week.sentinels.missing.includes("fatty_fish"));
});

Deno.test("la cadence suit la FENÊTRE, jamais les journées nourries (2026-09-04)", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LA RÉGRESSION QUE CE TEST EXISTE POUR EMPÊCHER, ET ELLE EST SILENCIEUSE.
  // ══════════════════════════════════════════════════════════════════════
  //
  // `SENTINEL_MIN_DAYS` vaut 7 et `MAX_WINDOW_DAYS` vaut 7: les sentinelles ne
  // parlent QUE sur une semaine pleine. Depuis que `daysCovered` compte les
  // journées NOURRIES (`windowCoverageOf`), il descend sous 7 dès qu'un seul
  // moment manque — un plan lancé à 15 h, une absence déclarée. Brancher la
  // cadence dessus aurait éteint `missing`, donc le jeton
  // `place_missing_sentinel` de la boucle de correction, sur TOUS les plans de
  // sept jours commencés aujourd'hui. Rien n'aurait échoué.
  const dishes = [{
    slot: "dinner",
    method: "Cook it.",
    ingredients: [{ term: "chicken breast", amount: 200, unit: "g" as const, state: "raw" as const }],
  }];
  const args = {
    dishes,
    envelope: PER_KG,
    index: INDEX,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  };
  // Une semaine dont le premier jour ne porte qu'un dîner: 6,35 journées
  // nourries pour une fenêtre de 7.
  const troué = verdictFor({ ...args, daysCovered: 6.35, windowDays: 7 } as never);
  assert(
    troué.sentinels.missing.length > 0,
    "une semaine reste une semaine, même si le premier jour est entamé",
  );
  // Et le SENS INVERSE, sinon la garde ne garderait rien: une fenêtre courte
  // dont les journées seraient (absurdement) nombreuses reste muette.
  const court = verdictFor({ ...args, daysCovered: 7, windowDays: 3 } as never);
  assertEquals(
    court.sentinels.missing,
    [],
    "trois jours ne deviennent pas une semaine parce qu'on y a bien mangé",
  );
});

Deno.test("le trou STRUCTUREL survit à l'abstention de cadence", () => {
  // « Cet élève est végan, la B12 n'existe pas dans le règne végétal » est
  // vrai un lundi comme sur sept jours. Une carence structurelle n'est pas
  // une affaire de cadence — elle ne doit donc pas disparaître avec elle.
  const v = verdictFor({
    dishes: [{
      slot: "dinner",
      method: "Cook it.",
      ingredients: [{ term: "carrots", amount: 200, unit: "g" as const, state: "raw" as const }],
    }],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    windowDays: 1,
    uncoverableSentinels: ["b12_source"],
    fixedIntakeInputs: [],
  } as never);
  assertEquals(v.sentinels.missing, [], "les trous réparables s'abstiennent");
  assert(
    v.sentinels.uncoverable.includes("b12_source"),
    "le canal structurel doit survivre",
  );
});

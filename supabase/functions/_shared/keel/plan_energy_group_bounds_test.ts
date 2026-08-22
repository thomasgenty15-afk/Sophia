// ══════════════════════════════════════════════════════════════════════════
// L17 — L'ABSTENTION SE PÈSE. Ce que ces épreuves protègent, dans l'ordre du
// coût quand ça casse:
//
//   * LE SEUIL DÉSARMÉ — `UNRESOLVED_ENERGY_TOLERANCE` ramené à 0 (ou monté)
//     sans que rien ne rougisse. C'est le mode d'échec n°1 de ce dépôt: « un
//     lot désarmé ressemble à un lot qui marche ». Deux épreuves MUTENT le
//     seuil et exigent que le comportement CHANGE;
//   * LA BORNE QUI AVALE UNE VRAIE PERTE — un inconnu lourd, ou un ingrédient
//     dont la MASSE est inconnue, admis parce que la règle a été relâchée. Une
//     somme amputée a l'air d'un résultat;
//   * LA BORNE INVISIBLE — `boundedKcal` fondu dans le total. Un chiffre qui ne
//     dit pas qu'une part de lui est une convention est le total qui fait
//     semblant, dans sa version la plus difficile à voir;
//   * LE CHAMP PERDU EN CHEMIN — la clé s'appelle `group`, et rien d'autre.
//     `ingredientPayload()` a jeté celle-ci pendant trois générations de prompt
//     sans que personne ne compte ce qui arrivait.
//
// ⛔ CE FICHIER EST NEUF, ET C'EST VOULU. `plan_energy_test.ts` porte le travail
// non commité d'une autre session (lot 18); y ajouter ces épreuves aurait mêlé
// deux lots dans un même fichier partagé.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  GROUP_BAND_MIN_REFS,
  MAX_PLAUSIBLE_KCAL_PER_100G,
} from "./composition_fill.ts";
import {
  dishEnergy,
  dishEnergyAtTolerance,
  type EnergyIngredient,
  planEnergy,
  planEnergyAtTolerance,
  UNRESOLVED_ENERGY_TOLERANCE,
} from "./plan_energy.ts";

// ---------------------------------------------------------------------------
// LE BANC — des valeurs RONDES, pour que la bande se calcule de tête
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

// `non_starchy_veg` porte TROIS lignes — le minimum pour qu'une bande existe.
// Triées: [10, 20, 30] ⇒ p05 = 11, p95 = 29 (`percentileCont`, vérifié à la
// main: pos = 0,05 × 2 = 0,1 ⇒ 10 + 10 × 0,1; pos = 0,95 × 2 = 1,9 ⇒ 20 + 10 × 0,9).
const BAND_LOW = 11;
const BAND_HIGH = 29;

// `citrus` n'en porte que DEUX: PAS de bande, donc le plafond absolu. C'est la
// contre-épreuve de `GROUP_BAND_MIN_REFS`, et elle est ici pour qu'on ne
// fabrique jamais une bande sur deux valeurs.
const REFS: CompositionRef[] = [
  ref({ slug: "lettuce", energyKcal: 10 }),
  ref({ slug: "cucumber", energyKcal: 20 }),
  ref({ slug: "courgette", energyKcal: 30 }),
  ref({ slug: "lemon", foodGroupRef: "citrus", energyKcal: 25 }),
  ref({ slug: "lime", foodGroupRef: "citrus", energyKcal: 35 }),
  // 400 kcal/100 g CRUS: le socle connu qui porte le dénominateur.
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 400 }),
  // Résolu, DENSE, sans poids d'unité: le piège du NON PESÉ.
  ref({
    slug: "olive_oil",
    foodGroupRef: "other_added_fat",
    energyKcal: 900,
    energyDense: true,
  }),
];

const INDEX = buildCompositionIndex(REFS, [
  { alias: "rice", slug: "white_rice" },
  { alias: "olive oil", slug: "olive_oil" },
]);

/** 100 g de riz cru = 400 kcal. Le connu de tous les plats de ce fichier. */
const RICE: EnergyIngredient = { term: "rice", amount: 100, unit: "g", state: "raw" };
const KNOWN_KCAL = 400;

function dish(ingredients: EnergyIngredient[]) {
  return { method: "Cook it.", ingredients };
}

/** Un inconnu: aucun slug, aucun alias ne le porte. */
const UNKNOWN = "kokum rind";

// ---------------------------------------------------------------------------
// ① LA BORNE ADMET CE QUI NE PEUT PAS PESER LOURD
// ---------------------------------------------------------------------------

Deno.test("L17 — 2 g d'un inconnu SANS groupe déclaré ne tuent plus le plat", () => {
  //   2 g × 902 kcal/100 g = 18,04 kcal au pire
  //   5 % de (400 + 18,04)  = 20,90 kcal  ⇒ ça tient
  //   ce qu'on compte: le MILIEU de [0 ; 902] × 2 g = 9,02 ⇒ 9
  const e = dishEnergy(INDEX, dish([RICE, { term: UNKNOWN, amount: 2, unit: "g", state: "raw" }]));
  assertEquals(e.complete, true);
  assertEquals(e.kcal, KNOWN_KCAL + 9);
  assertEquals(e.boundedKcal, 9);
  assertEquals(e.boundedTerms, [UNKNOWN]);
  assertEquals(e.gaps, []);
});

Deno.test("L17 — 10 g du MÊME inconnu éteignent le plat: la borne ne pardonne pas", () => {
  //   10 g × 902 = 90,2 kcal au pire · 5 % de 490,2 = 24,5  ⇒ ça ne tient pas
  const e = dishEnergy(INDEX, dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: "raw" }]));
  assertEquals(e.complete, false);
  assertEquals(e.kcal, null);
  assertEquals(e.gaps, ["unknown_ingredient"]);
  assertEquals(e.unreadableTerms, [UNKNOWN]);
  assertEquals(e.boundedKcal, 0);
});

// ---------------------------------------------------------------------------
// ② LE GROUPE DÉCLARÉ EST CE QUI RESSERRE LA BORNE — et il s'appelle `group`
// ---------------------------------------------------------------------------

Deno.test("L17 — le MÊME 10 g passe quand le modèle a déclaré son groupe", () => {
  //   10 g × 29 kcal/100 g (p95 de `non_starchy_veg`) = 2,9 kcal au pire
  //   5 % de (400 + 2,9) = 20,1  ⇒ ça tient très largement
  //   ce qu'on compte: 10 g × (11 + 29)/2 / 100 = 2
  const e = dishEnergy(
    INDEX,
    dish([RICE, {
      term: UNKNOWN,
      amount: 10,
      unit: "g",
      state: "raw",
      group: "non_starchy_veg",
    }]),
  );
  assertEquals(e.complete, true);
  assertEquals(e.boundedKcal, Math.round((10 * (BAND_LOW + BAND_HIGH)) / 200));
  assertEquals(e.kcal, KNOWN_KCAL + 2);
});

Deno.test("L17 — la clé est `group`, JAMAIS `food_group_ref` ni `food_group`", () => {
  // ⛔ LE DÉFAUT QUE CETTE ÉPREUVE FERME EST DÉJÀ ARRIVÉ. Deux fiches du plan
  // ont cherché `food_group_ref` sur une ligne d'ingrédient et ont conclu « 0
  // sur 9 810 — le modèle n'obéit pas », alors que le modèle avait déclaré 242
  // groupes sous le nom `group`. Un nom qui varie en chemin est la façon la
  // plus sûre de perdre un champ, et de le perdre SILENCIEUSEMENT.
  const heavy = { term: UNKNOWN, amount: 10, unit: "g" as const, state: "raw" as const };
  for (const wrongKey of ["food_group_ref", "food_group", "groupe"]) {
    const ing = { ...heavy, [wrongKey]: "non_starchy_veg" } as EnergyIngredient;
    const e = dishEnergy(INDEX, dish([RICE, ing]));
    assertEquals(
      e.complete,
      false,
      `${wrongKey} a resserré la borne — seul \`group\` doit le faire`,
    );
  }
  // et la bonne clé, elle, mord.
  assertEquals(
    dishEnergy(INDEX, dish([RICE, { ...heavy, group: "non_starchy_veg" }])).complete,
    true,
  );
});

Deno.test("L17 — un groupe SANS bande retombe sur le plafond absolu, jamais sur une bande inventée", () => {
  // `citrus` n'a que 2 lignes, sous `GROUP_BAND_MIN_REFS`. Une bande sur deux
  // valeurs « a l'air d'une garde et n'en est pas une »: on préfère le plafond.
  assert(GROUP_BAND_MIN_REFS === 3);
  const e = dishEnergy(
    INDEX,
    dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: "raw", group: "citrus" }]),
  );
  assertEquals(e.complete, false, "une bande a été fabriquée sur 2 lignes");
  // Et la preuve que c'est BIEN le plafond absolu qui a servi: 2 g passent,
  // exactement comme sans groupe.
  const small = dishEnergy(
    INDEX,
    dish([RICE, { term: UNKNOWN, amount: 2, unit: "g", state: "raw", group: "citrus" }]),
  );
  assertEquals(small.boundedKcal, Math.round((2 * MAX_PLAUSIBLE_KCAL_PER_100G) / 200));
});

// ---------------------------------------------------------------------------
// ③ ⛔ LA MUTATION DU SEUIL — le cœur de l'armement de ce lot
// ---------------------------------------------------------------------------

Deno.test("L17 ⛔ — à tolérance 0, le plat RETOMBE exactement sur l'abstention d'avant", () => {
  // C'est la seule preuve qu'un gain vient de la BORNE et pas d'autre chose
  // arrivé le même jour. Si cette épreuve devenait verte des deux côtés, le
  // seuil ne servirait plus à rien et personne ne le verrait.
  const d = dish([RICE, { term: UNKNOWN, amount: 2, unit: "g", state: "raw" }]);

  const armed = dishEnergyAtTolerance(INDEX, d, 0.05);
  assertEquals(armed.complete, true);
  assertEquals(armed.boundedKcal, 9);

  const disarmed = dishEnergyAtTolerance(INDEX, d, 0);
  assertEquals(disarmed.complete, false);
  assertEquals(disarmed.kcal, null);
  assertEquals(disarmed.gaps, ["unknown_ingredient"]);
  assertEquals(disarmed.unreadableTerms, [UNKNOWN]);
  assertEquals(disarmed.boundedKcal, 0);

  assertNotEquals(armed.complete, disarmed.complete);
});

Deno.test("L17 ⛔ — la CONSTANTE de production est celle qui arme, et on le vérifie", () => {
  // ⚠️ CETTE ÉPREUVE N'EST PAS PARAMÉTRÉE PAR SA PROPRE CONSTANTE. Elle compare
  // le chemin de production (`dishEnergy`, aucun paramètre) à DEUX littéraux.
  // Ramener `UNRESOLVED_ENERGY_TOLERANCE` à 0 la fait rougir; la monter à 0,25
  // aussi (le cas « 10 g » basculerait). C'est ce qui distingue une garde d'un
  // commentaire.
  const petit = dish([RICE, { term: UNKNOWN, amount: 2, unit: "g", state: "raw" }]);
  const gros = dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: "raw" }]);

  assertEquals(dishEnergy(INDEX, petit).complete, true, "le seuil de production est tombé à 0");
  assertEquals(dishEnergy(INDEX, gros).complete, false, "le seuil de production a été relâché");

  assertEquals(dishEnergy(INDEX, petit), dishEnergyAtTolerance(INDEX, petit, 0.05));
  assertEquals(dishEnergy(INDEX, gros), dishEnergyAtTolerance(INDEX, gros, 0.05));
  assertNotEquals(dishEnergy(INDEX, petit), dishEnergyAtTolerance(INDEX, petit, 0));
  assertEquals(UNRESOLVED_ENERGY_TOLERANCE, 0.05);
});

Deno.test("L17 ⛔ — à tolérance 0, un plat SANS inconnu reste calculable", () => {
  // La contre-épreuve de la mutation, et elle n'est pas décorative: une garde
  // qui éteint TOUT quand on la serre ne mesure plus rien — elle ressemble à
  // une garde qui marche. Le corpus rejoué à 0 doit rendre le chiffre d'AVANT
  // le lot, pas zéro.
  const e = dishEnergyAtTolerance(INDEX, dish([RICE]), 0);
  assertEquals(e.complete, true);
  assertEquals(e.kcal, KNOWN_KCAL);
  assertEquals(e.boundedKcal, 0);
});

// ---------------------------------------------------------------------------
// ④ CE QUE LA BORNE NE TOUCHE PAS — et il faut que ça reste vrai
// ---------------------------------------------------------------------------

Deno.test("L17 — une MASSE inconnue reste fatale: le groupe borne une densité, pas une masse", () => {
  // « de l'huile d'olive », sans quantité, vaut 9 kcal ou 900 selon ce que
  // quelqu'un a versé. Aucune bande ne le dit. C'est le périmètre de `L-1-b`.
  const e = dishEnergy(
    INDEX,
    dish([RICE, { term: "olive oil", amount: null, unit: null, state: null }]),
  );
  assertEquals(e.complete, false);
  assertEquals(e.gaps, ["missing_quantity"]);
  assertEquals(e.unreadableTerms, ["olive oil"]);
});

Deno.test("L17 — un inconnu SANS quantité lisible reste fatal, groupe déclaré ou non", () => {
  // « 2 courgettes » n'est pas une quantité: c'est un dénombrement, et un
  // dénombrement converti à l'estime est un nombre inventé.
  for (const group of [undefined, "non_starchy_veg" as const]) {
    const e = dishEnergy(
      INDEX,
      dish([RICE, { term: UNKNOWN, amount: 2, unit: "unit", state: "raw", group }]),
    );
    assertEquals(e.complete, false, `group=${group}`);
    assertEquals(e.gaps, ["unknown_ingredient"]);
  }
});

Deno.test("L17 — UN SEUL inbornable éteint le plat, même entouré de bornables", () => {
  // Borner les autres et ignorer celui-là rendrait une somme amputée qui a
  // l'air d'un résultat — le défaut que l'abstention existe pour éviter.
  const e = dishEnergy(
    INDEX,
    dish([
      RICE,
      { term: UNKNOWN, amount: 2, unit: "g", state: "raw", group: "non_starchy_veg" },
      { term: "brahmi leaf", amount: 1, unit: "unit", state: "raw" },
    ]),
  );
  assertEquals(e.complete, false);
  assertEquals(e.gaps, ["unknown_ingredient"]);
  assertEquals(e.unreadableTerms, ["brahmi leaf", UNKNOWN]);
  assertEquals(e.boundedKcal, 0);
});

Deno.test("L17 — un plat FAIT D'INCONNUS seuls ne rend pas un chiffre", () => {
  // Le dénominateur serait la borne elle-même: 100 % de l'énergie viendrait
  // d'une convention. Aucune tolérance ne peut admettre ça.
  const e = dishEnergy(
    INDEX,
    dish([{ term: UNKNOWN, amount: 1, unit: "g", state: "raw", group: "non_starchy_veg" }]),
  );
  assertEquals(e.complete, false);
  assertEquals(e.kcal, null);
});

// ---------------------------------------------------------------------------
// ⑤ LES GRAMMES DE LA BORNE SONT LES PLUS GRANDS PLAUSIBLES
// ---------------------------------------------------------------------------

Deno.test("L17 — un `state` absent ou `cooked` prend la conversion la PLUS LOURDE", () => {
  // ⚠️ UNE BORNE, JAMAIS UNE ESTIMATION. Un terme inconnu n'a pas de classe de
  // rendement: on interroge `gramsRawOf` sur chacune et on garde le maximum.
  // 7 g « cuits » peuvent venir de 7/0,7 = 10 g crus (`meat_shrinks`).
  const cooked = dishEnergy(
    INDEX,
    dish([RICE, { term: UNKNOWN, amount: 7, unit: "g", state: "cooked", group: "non_starchy_veg" }]),
  );
  const rawTen = dishEnergy(
    INDEX,
    dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: "raw", group: "non_starchy_veg" }]),
  );
  assertEquals(cooked.boundedKcal, rawTen.boundedKcal);

  // `state` absent: la classe neutre rend les grammes écrits, et c'est le
  // maximum — les autres classes rendent `null`, pas un nombre plus grand.
  const noState = dishEnergy(
    INDEX,
    dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: null, group: "non_starchy_veg" }]),
  );
  assertEquals(noState.boundedKcal, rawTen.boundedKcal);
});

// ---------------------------------------------------------------------------
// ⑥ LE COMPTEUR — la borne est DANS le total, et elle est NOMMÉE
// ---------------------------------------------------------------------------

Deno.test("L17 — `boundedKcal` est dans `kcal`, et il remonte à la journée", () => {
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{
      day: "mon",
      method: "Cook it.",
      uses: [],
      ingredients: [RICE, { term: UNKNOWN, amount: 2, unit: "g", state: "raw" }],
    }],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.dishes[0].boundedKcal, 9);
  assertEquals(plan.days[0].kcal, KNOWN_KCAL + 9);
  assertEquals(plan.days[0].boundedKcal, 9);
  assertEquals(plan.days[0].complete, true);
});

Deno.test("L17 — `boundedKcal` se divise par `servings`, comme le total qui le porte", () => {
  // Le laisser entier ferait dire à un foyer de quatre que la borne vaut quatre
  // fois ce qu'elle vaut dans l'assiette — et le seul compteur qui dit si ce
  // lot a mordu deviendrait faux.
  const args = {
    index: INDEX,
    dishes: [{
      day: "mon",
      method: "Cook it.",
      uses: [],
      ingredients: [RICE, { term: UNKNOWN, amount: 2, unit: "g" as const, state: "raw" as const }],
    }],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  };
  const one = planEnergy({ ...args, servings: 1 });
  const two = planEnergy({ ...args, servings: 2 });
  assertEquals(one.days[0].boundedKcal, 9);
  assertEquals(two.days[0].boundedKcal, Math.round(9 / 2));
  assertEquals(two.days[0].kcal, Math.round((KNOWN_KCAL + 9) / 2));
});

Deno.test("L17 — une journée SANS borne porte `boundedKcal: 0`, jamais `undefined`", () => {
  // Le zéro ambigu, pour la n-ième fois de ce chantier: un champ absent et un
  // champ à zéro doivent se distinguer, sinon « le lot n'a pas mordu » et « le
  // lot n'est pas branché » se ressemblent parfaitement.
  const plan = planEnergy({
    index: INDEX,
    servings: 1,
    dishes: [{ day: "mon", method: "Cook it.", uses: [], ingredients: [RICE] }],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  assertEquals(plan.days[0].boundedKcal, 0);
  assertEquals(plan.dishes[0].boundedKcal, 0);
  assertEquals(plan.dishes[0].boundedTerms, []);
});

// ---------------------------------------------------------------------------
// ⑦ LE PLAN ENTIER SE REJOUE À DEUX SEUILS, et le corpus s'appuie là-dessus
// ---------------------------------------------------------------------------

Deno.test("L17 — `planEnergyAtTolerance(…, 0)` rend l'état d'AVANT le lot", () => {
  const args = {
    index: INDEX,
    servings: 1,
    dishes: [
      {
        day: "mon",
        method: "Cook it.",
        uses: [],
        ingredients: [RICE, { term: UNKNOWN, amount: 2, unit: "g" as const, state: "raw" as const }],
      },
      { day: "tue", method: "Cook it.", uses: [], ingredients: [RICE] },
    ],
    preparations: [],
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  };
  const armed = planEnergyAtTolerance(args, 0.05);
  const before = planEnergyAtTolerance(args, 0);
  assertEquals(armed.days.map((d) => d.complete), [true, true]);
  assertEquals(before.days.map((d) => d.complete), [false, true]);
  assertEquals(before.days[0].kcal, null);
  // Le jour SANS inconnu est identique des deux côtés — la mutation du seuil ne
  // doit pas déplacer ce qu'elle ne concerne pas.
  assertEquals(armed.days[1], before.days[1]);
  assertEquals(planEnergy(args), armed);
});

// ---------------------------------------------------------------------------
// ⑧ LA PURETÉ — le cache des bandes ne doit rien changer
// ---------------------------------------------------------------------------

Deno.test("L17 — deux appels rendent le même résultat, et deux index ne se mélangent pas", () => {
  const d = dish([RICE, { term: UNKNOWN, amount: 10, unit: "g", state: "raw", group: "non_starchy_veg" }]);
  assertEquals(dishEnergy(INDEX, d), dishEnergy(INDEX, d));

  // Un index où `non_starchy_veg` est BEAUCOUP plus dense: la même déclaration
  // de groupe doit y donner une autre réponse. Si le cache servait la bande du
  // premier index, cette épreuve serait verte à tort.
  const dense = buildCompositionIndex([
    ref({ slug: "lettuce", energyKcal: 500 }),
    ref({ slug: "cucumber", energyKcal: 600 }),
    ref({ slug: "courgette", energyKcal: 700 }),
    ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 400 }),
  ], [{ alias: "rice", slug: "white_rice" }]);
  assertEquals(dishEnergy(INDEX, d).complete, true);
  assertEquals(dishEnergy(dense, d).complete, false);
});

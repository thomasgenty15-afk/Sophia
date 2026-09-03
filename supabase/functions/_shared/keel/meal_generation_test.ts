// REPAS GÉNÉRÉS — ce que ces tests protègent, dans l'ordre de ce qui coûte
// le plus cher quand ça casse:
//   * un allergène médical dans une recette ou dans une liste de courses;
//   * « tu as déjà tout » dit à quelqu'un qui n'a pas les œufs;
//   * une kcal ou un macro chiffré côté élève — ligne rouge du produit;
//   * une quantité de courses REFUSÉE par le filtre numérique, qui rendrait le
//     générateur incapable d'écrire une recette (le faux positif est aussi
//     grave que le faux négatif, il tue juste la fonctionnalité au lieu de
//     l'élève).

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  buildMealPrompt,
  dishCapFor,
  // L7 ③ — le plafond du nom d'usage, en caractères.
  DISH_NAME_MAX_CHARS,
  isInPantry,
  MEAL_SCOPES,
  MEAL_SYSTEM_PROMPT,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  // LOT C — l'attribution du plat dédié, écrite en base.
  mealDishesPayload,
  parseGeneratedMeal,
  SHOPPING_AISLES,
} from "./meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import { parseFixedIntakes } from "./fixed_intakes.ts";

const DOCTRINE = {
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["six small meals", "grazing"],
      reason: "grazing keeps you thinking about food all day",
      instead: "Three real meals with nothing between them that needs deciding.",
    },
  ],
  foods: {
    recommended: [{ term: "eggs", surfaceForms: [], reason: null }],
    discouraged: [
      {
        term: "seed oil",
        surfaceForms: ["seed oils", "sunflower oil"],
        reason: "he cooks with butter and olive oil",
      },
    ],
  },
};

const PEANUT: StudentSafetyConstraint = {
  id: "c1",
  userId: "u1",
  kind: "allergy",
  allergenRef: "peanut",
  substanceRef: null,
  medicationClass: null,
    conditionRef: null,
    dietRef: null,
  severity: "medical",
  declaredBy: "student",
  notes: null,
  contentLocale: "en-GB",
};

const PANTRY = [
  { term: "eggs", quantity: "6" },
  { term: "onions", quantity: null },
  { term: "rice", quantity: "1 bag" },
];

function parse(payload: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return parseGeneratedMeal(payload, {
    doctrine: DOCTRINE,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: PANTRY,
    beliefKeys: ["protein_anchors_the_plate"],
    // Rien de déclaré: le parseur retombe sur `DEFAULT_EATING_RHYTHM`, comme le
    // prompt. `over` peut le remplacer pour les cas à rythme.
    eatingRhythm: [],
    // Les jours réellement demandés: le plafond en dérive, exactement comme
    // dans le prompt. Un seul jour ici, pour coller au `scope: "day"`.
    daysToFill: ["mon"],
    awayDays: [],
    cookingTimeMin: null,
    // FF-038: REQUIS. `null` = pas de référentiel, donc pas de grammes —
    // et les trois champs structurés sont quand même lus. Les cas qui
    // testent le recalcul passent un index.
    composition: null,
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
    ...over,
  });
}

function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Rice and onion omelette",
    slot: "dinner",
    day: null,
    ingredients: [{ term: "eggs", quantity: "3" }],
    method: "Beat the eggs, soften the onions, fold it together.",
    why: "It uses what is already in your kitchen on a night you said is short.",
    honours_belief_keys: ["protein_anchors_the_plate"],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LA QUANTITÉ DE COURSES N'EST PAS UNE CIBLE NUTRITIONNELLE
// ---------------------------------------------------------------------------

Deno.test("a shopping quantity in grams SURVIVES — it is a portion, not a target", () => {
  // Le test prémisse-fausse du filtre numérique. Sans lui, la garde « aucun
  // chiffre » rendrait toute recette impossible à écrire, et une garde qui
  // casse la fonctionnalité est une garde qu'on débranche.
  const meal = parse({
    dishes: [dish({ ingredients: [{ term: "chicken thighs", quantity: "400 g" }] })],
    shopping_list: [
      { term: "chicken thighs", quantity: "400 g", aisle: "protein" },
      { term: "parsley", quantity: "a bunch", aisle: "produce" },
    ],
  });
  assertEquals(meal.rejected_numeric, []);
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.shopping_list.length, 2);
  assertEquals(meal.shopping_list[0].quantity, "400 g");
});

Deno.test("a MACRO target is still rejected, wherever it hides", () => {
  const inWhy = parse({
    dishes: [dish({ why: "Aim for 30 g of protein at this meal." })],
    shopping_list: [],
  });
  assertEquals(inWhy.dishes, []);
  assertEquals(inWhy.rejected_numeric, ["macro_quantity"]);

  const inIngredient = parse({
    dishes: [dish({ ingredients: [{ term: "protein powder", quantity: "30 g" }] })],
    shopping_list: [],
  });
  assertEquals(inIngredient.dishes, []);
  assert(inIngredient.rejected_numeric.length > 0);
});

Deno.test("a shopping quantity is never in calories", () => {
  const meal = parse({
    dishes: [dish()],
    shopping_list: [{ term: "granola", quantity: "1800 kcal", aisle: "grains" }],
  });
  assertEquals(meal.shopping_list, []);
  assertEquals(meal.rejected_numeric, ["energy_unit_in_quantity"]);
});

// ---------------------------------------------------------------------------
// « TU AS DÉJÀ ÇA » EST VÉRIFIÉ, JAMAIS CRU
// ---------------------------------------------------------------------------

Deno.test("the model's in_pantry flag is IGNORED — the pantry decides", () => {
  // Le modèle affirme avoir tout; l'élève n'a pas de saumon. Croire le modèle
  // ici, c'est la classe d'incidents « accusé fantôme » du dépôt, servie au
  // moment des courses.
  const meal = parse({
    dishes: [dish({
      ingredients: [
        { term: "salmon", quantity: "2 fillets", in_pantry: true },
        { term: "eggs", quantity: "3", in_pantry: false },
      ],
    })],
    shopping_list: [],
  });
  const ing = meal.dishes[0].ingredients;
  assertEquals(ing.find((i) => i.term === "salmon")?.in_pantry, false);
  assertEquals(ing.find((i) => i.term === "eggs")?.in_pantry, true);
});

Deno.test("pantry matching is tolerant one way only", () => {
  assert(isInPantry("eggs", PANTRY));
  assert(isInPantry("Œufs", [{ term: "oeufs" }]), "diacritics must fold");
  // « j'ai des tomates » couvre « tomates cerises »...
  assert(isInPantry("tomates cerises", [{ term: "tomates" }]));
  // ...mais l'inverse est faux, et c'est le sens qui compte: promettre une
  // sauce tomate à quelqu'un qui n'a que des cerises est une course en plus.
  assertEquals(isInPantry("tomates", [{ term: "tomates cerises" }]), false);
  assertEquals(isInPantry("salmon", PANTRY), false);
});

Deno.test("from_pantry: the shopping list is RECOMPUTED as what is missing", () => {
  const meal = parse({
    dishes: [dish({
      ingredients: [
        { term: "eggs", quantity: "3" },
        { term: "onions", quantity: "1" },
        { term: "feta", quantity: "100 g" },
      ],
    })],
    // Le modèle prétend qu'il n'y a rien à acheter.
    shopping_list: [],
  }, { mode: "from_pantry" });

  // La liste est refaite à partir des faits, pas de l'affirmation du modèle.
  assertEquals(meal.shopping_list.length, 1);
  assertEquals(meal.shopping_list[0].term, "feta");
});

Deno.test("from_pantry: nothing missing means an EMPTY list, not a made-up one", () => {
  const meal = parse({
    dishes: [dish({ ingredients: [{ term: "eggs", quantity: "3" }, { term: "rice", quantity: "200 g" }] })],
    shopping_list: [{ term: "saffron", quantity: "a pinch", aisle: "pantry" }],
  }, { mode: "from_pantry" });
  assertEquals(meal.shopping_list, []);
});

// ---------------------------------------------------------------------------
// LA CEINTURE DE SORTIE
// ---------------------------------------------------------------------------

Deno.test("a medical allergen in a RECIPE does not ship, and takes the whole meal", () => {
  const meal = parse({
    dishes: [dish({ method: "Finish with a spoon of peanut butter." })],
    shopping_list: [],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.dishes, []);
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
});

Deno.test("a medical allergen in the SHOPPING LIST does not ship either", () => {
  // Le chemin qu'on oublie. Une recette propre et une liste de courses qui
  // envoie l'élève acheter son allergène est le même accident, déplacé d'un
  // écran.
  const meal = parse({
    dishes: [dish()],
    shopping_list: [{ term: "peanut butter", quantity: "1 jar", aisle: "pantry" }],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.dishes, []);
  assertEquals(meal.shopping_list, []);
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
});

Deno.test("a food the coach DISCOURAGES does not ship", () => {
  const meal = parse({
    dishes: [dish({ method: "Fry the onions in sunflower oil." })],
    shopping_list: [],
  });
  assertEquals(meal.dishes, []);
  assertEquals(meal.lock.reason, "blocked_coach_interdit");
});

Deno.test("a food the coach RECOMMENDS is not a violation", () => {
  // Le piège symétrique: le verrou ne doit voir que la liste `discouraged`.
  const meal = parse({ dishes: [dish()], shopping_list: [] });
  assertEquals(meal.lock.reason, "clean");
  assertEquals(meal.dishes.length, 1);
});

// ---------------------------------------------------------------------------
// VOCABULAIRES FERMÉS ET PLAFONDS
// ---------------------------------------------------------------------------

Deno.test("an unknown aisle degrades to `other` and is COUNTED, never dropped", () => {
  // Rejeter la ligne enverrait l'élève au supermarché avec une liste
  // incomplète. Le rayon est du rangement, pas de la sécurité.
  const meal = parse({
    dishes: [dish()],
    shopping_list: [{ term: "courgettes", quantity: "2", aisle: "vegetables" }],
  });
  assertEquals(meal.shopping_list.length, 1);
  assertEquals(meal.shopping_list[0].aisle, "other");
  assertEquals(meal.rejected_aisles, ["vegetables"]);
});

Deno.test("every scope has a named cap (R6)", () => {
  for (const scope of MEAL_SCOPES) {
    assert(dishCapFor(scope) > 0, scope);
  }
  assertEquals(dishCapFor("day"), 3);
});

Deno.test("the dish cap holds", () => {
  // `day` plafonne à 3: le 4e plat tombe, et le rejet est NOMMÉ. Une journée
  // à huit plats est une journée que personne ne cuisine.
  const meal = parse({
    dishes: [
      dish({ title: "one" }),
      dish({ title: "two" }),
      dish({ title: "three" }),
      dish({ title: "four" }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 3);
  assert(meal.issues.some((i) => i.includes("cap")));
});

Deno.test("single_meal is GONE — a retired scope is not silently accepted", () => {
  // La suppression doit être structurelle, pas cosmétique: si `dishCapFor`
  // rendait encore un plafond pour un scope retiré, un appelant resté sur
  // l'ancienne valeur continuerait de marcher et personne ne le saurait.
  assertEquals((MEAL_SCOPES as readonly string[]).includes("single_meal"), false);
});

Deno.test("a duplicate shopping line is collapsed", () => {
  const meal = parse({
    dishes: [dish()],
    shopping_list: [
      { term: "Onions", quantity: "2", aisle: "produce" },
      { term: "onions", quantity: "3", aisle: "produce" },
    ],
  });
  assertEquals(meal.shopping_list.length, 1);
  assertEquals(meal.shopping_list[0].quantity, "2");
});

Deno.test("an invented conviction key is dropped but does NOT cost the dish", () => {
  // `honours_belief_keys` est informatif: contrairement au plan hebdo, un plat
  // n'est pas rejeté pour ça. Mais la clé inventée ne doit pas s'afficher.
  const meal = parse({
    dishes: [dish({ honours_belief_keys: ["protein_anchors_the_plate", "invented_key"] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].honours_belief_keys, ["protein_anchors_the_plate"]);
  assert(meal.issues.some((i) => i.includes("invented_key")));
});

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

Deno.test("the prompt separates the STABLE situation from the DATED context", () => {
  const { userMessage, systemPrompt } = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true, hasFreezer: false, oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== MARC'S METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: ["protein_anchors_the_plate"],
    goal: "fat_loss",
    situation: "I eat at the canteen at midday.",
    context: "I have a wedding on Tuesday and I am away at the weekend.",
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 2,
    pantry: [],
  });
  assert(userMessage.includes("their situation, in their words: I eat at the canteen"));
  assert(userMessage.includes("RIGHT NOW: I have a wedding on Tuesday"));
  // Le contexte ne doit pas être fondu dans la situation: un mariage n'est pas
  // une habitude de vie.
  assert(!userMessage.includes("situation, in their words: I have a wedding"));
  assert(systemPrompt.includes("Shopping quantities are DIFFERENT"));
});

Deno.test("le prompt EXIGE une quantité sur les matières grasses", () => {
  // ── LA GARANTIE EST AU PROMPT ET AU PARSEUR ─────────────────────────────
  // Le parseur nomme les denses non pesés (`energy_dense_unweighed`), et le
  // verdict s'abstient dessus. Sans la consigne EN AMONT, les deux ne feraient
  // que constater un plan illisible sans jamais l'améliorer.
  //
  // MESURÉ le 2026-08-12 sur 80 générations: 82 lignes d'huile d'olive sans
  // quantité — de loin le premier poste de perte d'énergie du référentiel.
  const { systemPrompt } = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true, hasFreezer: false, oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "fat_loss",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 1,
    pantry: [],
  });
  // ⚠️ RETOURNÉ LE 2026-08-19, ET L'INTENTION D'ORIGINE EST INTACTE. La version
  // d'avant épinglait « FATS … ARE THE ONE EXCEPTION »: les matières grasses
  // étaient le SEUL cas où les champs structurés étaient obligatoires, donc
  // tout le reste pouvait les laisser à `null` en règle. Mesuré sur les 1 204
  // plats de foyer en base: 307 plats bloqués par un terme SANS `amount`, dont
  // « roast chicken thighs » VINGT-SIX fois — une protéine entière sans nombre.
  //
  // Le défaut vivait dans la COUTURE entre deux blocs: « WHAT A DISH ADDS ON
  // THE DAY » exige une quantité dénombrable dans la PHRASE (`quantity`), et
  // celui-ci gouverne les champs STRUCTURÉS. Le modèle satisfaisait les deux à
  // la fois — `quantity: "2 chicken thighs"`, `amount: null` — et le nombre
  // n'atteignait jamais le moteur.
  //
  // ⛔ CE QUI N'A PAS BOUGÉ, et c'est le point de la ligne d'origine: la
  // consigne ne s'étend TOUJOURS pas au sel. Une pincée reste une pincée, et
  // exiger un chiffre partout ferait inventer des nombres — ce que le même
  // prompt interdit deux paragraphes plus haut. L'exception est simplement
  // NOMMÉE comme la seule, au lieu d'être la règle par défaut.
  assert(systemPrompt.includes('ALWAYS CARRIES "amount" AND "unit"'));
  assert(systemPrompt.includes("may stay a pinch; nothing else may"));
  // ── `pepper` NU EST DÉSAMBIGUÏSÉ À LA SOURCE (2026-08-20) ──────────────
  // ⛔ POURQUOI ICI ET PAS PAR UN ALIAS DE RÉFÉRENTIEL. Mesuré: 16 lignes de
  // « pepper » nu, 16/16 dans un plat qui porte aussi du sel, 16/16 sans
  // quantité — c'est du poivre, et un alias vers `black_pepper` vaudrait 55
  // plats calculables.
  //
  // Il est refusé quand même, et c'est CE LOT-CI qui rend le refus obligatoire.
  // La masse conventionnelle d'un condiment s'applique dès qu'aucune quantité
  // n'est lisible (`resolveIngredients`), et `black_pepper` n'a pas de poids
  // d'unité. Donc « 1 unit pepper » — un POIVRON — ne serait pas pesé, tomberait
  // dans la branche conventionnelle, et vaudrait 0,3 g de poivre noir: une perte
  // d'énergie SILENCIEUSE sur un plat qui se présenterait comme complet.
  //
  // ⚠️ ET LE RISQUE MONTE À CAUSE DE CE LOT: depuis qu'une quantité est exigée
  // sur tout ce qui n'est pas un condiment, un poivron VA porter un nombre —
  // c'est-à-dire exactement le cas qui se perdrait. On ferme donc à la source.
  assert(systemPrompt.includes('Write "black\npepper", never bare "pepper"'));
  // ── `state` COUVRE AUSSI LES LÉGUMES CUITS (2026-08-20) ────────────────
  // ⛔ LE DÉSACCORD QUE CETTE LIGNE FERME, MESURÉ SUR UN RUN RÉEL. Le prompt
  // n'exigeait `state` que pour « rice, pasta, couscous, lentils, dried beans,
  // meat, poultry, fish ». Le RÉFÉRENTIEL, lui, range `onion`, `spinach`,
  // `courgette`, `bell_pepper` et `broccoli` en `veg_shrinks` — donc
  // `gramsRawOf` REFUSE de les peser sans `state`, et un `180 g d'épinards`
  // parfaitement quantifié n'était pas pesable. Deux contrats sur le même
  // champ, et celui qui décide n'était pas celui qui parlait au modèle.
  //
  // ⚠️ ON NE DEVINE PAS `raw` À LA PLACE: le repli est interdit et documenté
  // (`gramsRawOf`), parce qu'il vaut un facteur 2,6 sur du riz, toujours dans
  // le sens qui gonfle. On demande, on ne suppose pas.
  assert(systemPrompt.includes("AND every\nvegetable that is cooked"));
  assert(systemPrompt.includes("A drizzle of olive oil"));
  assert(systemPrompt.includes("made-up number is worse than a missing one"));
  // L'échappatoire est nommée LITTÉRALEMENT: « je n'ai pas écrit de nombre »
  // n'est pas « je ne sais pas ». Sans elle, la première rédaction se fait
  // satisfaire par une paraphrase (cicatrice du LOT 4C, run E1).
  assert(systemPrompt.includes('is not "I do not know"'));
  // Et la forme dénombrable atteint les champs structurés, pas seulement la
  // phrase: c'est très exactement ce qui manquait.
  assert(systemPrompt.includes("half a lemon is 0.5"));
});

Deno.test("from_pantry puts the pantry in the prompt, to_shop does not pretend to", () => {
  const base = {
    contentLocale: "en-US",
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
  kitchenEquipment: null,
  boxMemberDiets: [],
  boxMemberExclusions: [],
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    slot: null,
    servings: 1,
    pantry: [{ term: "eggs", quantity: "6" }],
  } as const;
  const fromPantry = buildMealPrompt({ ...base, mode: "from_pantry", scope: "day" });
  assert(fromPantry.userMessage.includes("WHAT IS ALREADY IN THEIR CUPBOARDS"));
  assert(fromPantry.userMessage.includes("eggs (6)"));

  const toShop = buildMealPrompt({ ...base, mode: "to_shop", scope: "day" });
  assert(toShop.userMessage.includes("HAVE NOT SHOPPED YET"));
  assert(!toShop.userMessage.includes("WHAT IS ALREADY IN THEIR CUPBOARDS"));
});

// ⚠️ LA COLLISION D'EN-TÊTE, ÉPINGLÉE SUR LE CAS QUI LA PRODUIT.
//
// Mesurée sur le run réel `798c5cd6-…`: un élève avec un apport fixe qui
// compose en `from_pantry` recevait DEUX sections `-- WHAT THEY ALREADY
// HAVE --` dans le même message, l'une disant « ne les mets pas sur la liste
// de courses », l'autre « cuisine avec ». Le test qui existait ne pouvait pas
// l'attraper: il ne montait jamais les deux en même temps.
Deno.test("le placard et les apports fixes ne portent PAS le même en-tête", () => {
  const { userMessage } = buildMealPrompt({
    contentLocale: "en-US",
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "d",
    coachNoteBlock: null,
    // LE SHAKER PASSE PAR SON PROPRE PARSEUR, jamais par un objet écrit à la
    // main: une forme inventée ici pourrait cesser de ressembler à ce que la
    // base rend sans que ce test s'en aperçoive.
    fixedIntakes: parseFixedIntakes([{
      label: "Vanilla whey shake",
      amount: 31,
      unit: "g",
      days: [],
      nutrition: "declared",
      serving_grams: 31,
      protein_g_per_serving: 24,
      energy_kcal_per_serving: 118,
      food_ref: "declared_vanilla_whey_shake",
    }]).intakes,
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    slot: null,
    servings: 1,
    pantry: [{ term: "eggs", quantity: "6" }],
    mode: "from_pantry",
    scope: "day",
  });
  // Les deux sections sont bien là...
  assertStringIncludes(userMessage, "-- WHAT THEY ALREADY HAVE --");
  assertStringIncludes(userMessage, "-- WHAT IS ALREADY IN THEIR CUPBOARDS --");
  // ...et l'en-tête des apports fixes n'apparaît qu'UNE fois. C'est ce compte
  // qui tient le lot: renommer le placard en quoi que ce soit qui recommence
  // par le même en-tête le fait repasser à deux.
  assertEquals(
    userMessage.split("-- WHAT THEY ALREADY HAVE --").length - 1,
    1,
  );
});

Deno.test("a non-JSON model output throws instead of shipping an empty meal", () => {
  assertThrows(() => parseGeneratedMeal("sorry, I cannot", {
    doctrine: DOCTRINE,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["mon"],
    awayDays: [],
    cookingTimeMin: null,
    composition: null,
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
  }));
});

Deno.test("the aisle vocabulary is closed and non-empty", () => {
  assert(SHOPPING_AISLES.length >= 5);
  assert(SHOPPING_AISLES.includes("other"));
});

// ---------------------------------------------------------------------------
// CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE — le pont mémoire → composition
//
// Le défaut que ça ferme: le memorizer extrayait déjà « déteste le brocoli »
// (mesuré sur un vrai élève KEEL), et NI ce générateur NI celui du plan hebdo
// n'en savaient rien — vérifié par grep, aucune occurrence de `memory_items`.
// L'élève parlait, le système retenait, et le plan remettait du brocoli.
//
// Ici l'argument est NOMMÉ, contrairement au plan hebdo qui sérialise tout le
// jsonb: une clé de plus y serait invisible tant que personne ne la passe.
// C'est le défaut `coach_food_rules` — un écran, des gardes, trente tests, et
// aucun lecteur au runtime.
// ---------------------------------------------------------------------------

Deno.test("les préférences confirmées entrent dans le prompt, dans les mots de l'élève", () => {
  const withPrefs = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true, hasFreezer: false, oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== MARC'S METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 1,
    pantry: [],
    foodPreferences: ["Dislikes broccoli", "Lunch at the canteen"],
  });
  assert(withPrefs.userMessage.includes("Dislikes broccoli"));
  assert(withPrefs.userMessage.includes("Lunch at the canteen"));
  assert(withPrefs.userMessage.includes("in their own words"));
});

Deno.test("sans préférence, le prompt est EXACTEMENT celui d'avant", () => {
  // L'ajout doit être additif: un élève qui n'a rien confirmé reçoit la même
  // journée qu'hier. C'est ce qui rend le lot sans risque de régression.
  const base = {
    contentLocale: "en-US",
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== MARC'S METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
  kitchenEquipment: null,
  boxMemberDiets: [],
  boxMemberExclusions: [],
    protocolBlock: "",
    beliefKeys: [],
    goal: "health" as const,
    situation: null,
    context: null,
    mode: "to_shop" as const,
    scope: "day" as const,
    slot: null,
    servings: 1,
    pantry: [],
  };
  const without = buildMealPrompt(base);
  const empty = buildMealPrompt({ ...base, foodPreferences: [] });
  assertEquals(without.userMessage, empty.userMessage);
  assert(!without.userMessage.includes("in their own words"));
});

// ---------------------------------------------------------------------------
// LOT C — À QUI CE PLAT EST-IL DÉDIÉ ?
//
// ⛔ LE TROU FERMÉ, MESURÉ LE 2026-08-14. Les clés d'un plat en base étaient
// `title, why, uses, method, slot, day, ingredients, honours_belief_keys` — et
// AUCUNE attribution. Le seul marqueur qu'un plat était celui de Zoé était
// « for Zoe » écrit dans le TITRE par le modèle, et la vue par personne le
// montrait donc dans la semaine de tout le monde.
//
// ⛔ ET AUCUN DE CES TESTS NE PEUT PASSER PAR UN MATCHER DE TITRE. Les titres y
// sont volontairement muets: si quelqu'un remplaçait un jour l'attribution par
// une lecture du titre, ces tests tomberaient au lieu de passer pour la
// mauvaise raison.
// ---------------------------------------------------------------------------

/** Le budget d'une bouche qui reçoit son plat à elle. */
function eaterAsking(memberIds: readonly string[]) {
  return {
    shape: "one_session" as const,
    ownDishesShown: 0,
    dedicatedDishesAsked: 1,
    dedicatedCells: [{ day: "mon", slot: "lunch" }],
    dishBearerIds: memberIds,
  };
}

function dishFor(over: Record<string, unknown> = {}) {
  return {
    dishes: [
      {
        title: "Chicken and rice",
        slot: "lunch",
        day: "mon",
        ingredients: [{ term: "chicken", quantity: "150 g" }],
        method: "Cook it.",
        why: "It fits the week.",
        ...over,
      },
    ],
  };
}

Deno.test("LOT C — un `for_member_id` déclaré et connu est POSÉ sur le plat", () => {
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].memberId, "m-zoe");
});

Deno.test("LOT C — un plat SANS `for_member_id` est celui de la table", () => {
  // ⚠️ LE CAS NOMINAL, et il compte autant que les refus: `null` DIT « le plat
  // de la table », ce n'est pas une ignorance. La quasi-totalité des plats d'un
  // plan passent par ici.
  const meal = parse(dishFor(), { merge: eaterAsking(["m-zoe"]) });
  assertEquals(meal.dishes[0].memberId, null);
});

Deno.test("LOT C — un id HORS de la liste fermée est jeté, compté, et le plat reste", () => {
  // Même posture que `honours_belief_keys`: l'attribution est une lecture EN
  // PLUS. Un plat sans elle reste un plat qui se cuisine et se mange — retirer
  // un dîner à quelqu'un pour un champ informatif serait le pire des échanges.
  const meal = parse(dishFor({ for_member_id: "m-inconnu" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].memberId, null);
  assert(
    meal.issues.some((i) => i.includes("for_member_id") && i.includes("m-inconnu")),
    meal.issues.join(" | "),
  );
});

Deno.test("LOT C — au barreau ①, AUCUNE attribution n'est acceptée", () => {
  // ⛔ LA PORTE QUI COMPTE LE PLUS. Le prompt y dit « Do NOT propose separate
  // dishes »: un `for_member_id` qui arriverait quand même attribuerait le plat
  // de la TABLE à une personne, et la vue par personne le retirerait alors à
  // tous les autres. Un faux plus cher que l'absence.
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: {
      shape: "one_dish" as const,
      ownDishesShown: 0,
      dedicatedDishesAsked: 0,
      dedicatedCells: [],
      dishBearerIds: ["m-zoe"],
    },
  });
  assertEquals(meal.dishes[0].memberId, null);
  assert(
    meal.issues.some((i) => i.includes("shared dish")),
    meal.issues.join(" | "),
  );
});

Deno.test("LOT C — la lane individuelle n'attribue JAMAIS rien", () => {
  // Elle passe `merge: null`, donc la liste fermée est vide. Une personne seule
  // n'a de toute façon pas de « plat dédié »: tous ses plats sont les siens.
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), { merge: null });
  assertEquals(meal.dishes[0].memberId, null);
});

Deno.test("LOT C — l'attribution part dans le payload écrit en base", () => {
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  const payload = mealDishesPayload(meal);
  // ÉCRIT MÊME À `null`: une clé absente ne se distingue pas d'un lot débranché.
  assert("member_id" in payload[0], JSON.stringify(payload[0]));
  assertEquals(payload[0].member_id, "m-zoe");
});

// ---------------------------------------------------------------------------
// LOT 3C — LE COMPTEUR DE L'ATTRIBUTION
//
// ⛔ POURQUOI CES QUATRE NOMBRES EXISTENT, ET CE QUE LEUR ABSENCE A COÛTÉ.
// Jusqu'au 2026-08-17, la trace ne portait que `{asked, attributed}`. Un
// `attributed: 0` a donc été lu « le modèle n'écrit JAMAIS la clé » — et
// l'archive des réponses brutes disait autre chose: deux réponses sur douze la
// portaient, dont une sur une bouche hors de la liste fermée, refusée par le
// parseur. « Jamais déclaré » et « déclaré puis refusé » rendaient le MÊME
// zéro, et ils appellent des corrections OPPOSÉES.
// ---------------------------------------------------------------------------

Deno.test("LOT 3C — rien de déclaré: les quatre nombres le disent", () => {
  // ⚠️ LE CAS QUI PASSE, et il est majoritaire. Un compteur qu'on ne sait pas
  // faire dire « zéro pour la bonne raison » ne distingue rien.
  const meal = parse(dishFor(), { merge: eaterAsking(["m-zoe"]) });
  assertEquals(meal.dish_owner_counts, {
    dishes: 1,
    declared: 0,
    attributed: 0,
    refused: 0,
  });
});

Deno.test("LOT 3C — déclaré et accepté: `declared` ET `attributed` montent", () => {
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  assertEquals(meal.dish_owner_counts, {
    dishes: 1,
    declared: 1,
    attributed: 1,
    refused: 0,
  });
});

Deno.test("LOT 3C — déclaré sur une bouche INCONNUE: `declared` monte, `attributed` non", () => {
  // ⛔ C'EST LE CAS QUI A ÉTÉ MAL LU EN PRODUCTION, mot pour mot: le modèle a
  // marqué la bouche qui porte une HABITUDE plutôt que celle à qui la consigne
  // promet un plat. Sans `declared`, ce run était indiscernable d'un run où le
  // modèle n'a rien écrit — et la correction à faire n'est pas la même.
  const meal = parse(dishFor({ for_member_id: "m-lea" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  assertEquals(meal.dish_owner_counts, {
    dishes: 1,
    declared: 1,
    attributed: 0,
    refused: 1,
  });
});

Deno.test("LOT 3C — déclaré au barreau ①: compté REFUSÉ, jamais attribué", () => {
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: {
      shape: "one_dish" as const,
      ownDishesShown: 0,
      dedicatedDishesAsked: 0,
      dedicatedCells: [],
      dishBearerIds: ["m-zoe"],
    },
  });
  assertEquals(meal.dish_owner_counts, {
    dishes: 1,
    declared: 1,
    attributed: 0,
    refused: 1,
  });
});

Deno.test("LOT 3C — `declared` vaut TOUJOURS `attributed + refused`", () => {
  // ⚠️ UNE PROPRIÉTÉ VÉRIFIÉE, PAS UNE DÉFINITION. Les trois nombres sont
  // comptés séparément (cicatrice `withheld`/`over_cap`: deux nombres du même
  // objet, l'un dérivé de l'autre, gonflé et dégonflé en sens inverses). Le
  // dériver ici le rendrait invérifiable.
  const meal = parse({
    dishes: [
      { ...dishFor().dishes[0], day: "mon", slot: "lunch", for_member_id: "m-zoe" },
      { ...dishFor().dishes[0], day: "tue", slot: "lunch", for_member_id: "m-lea" },
      { ...dishFor().dishes[0], day: "wed", slot: "lunch" },
    ],
  }, { merge: eaterAsking(["m-zoe"]) });
  const c = meal.dish_owner_counts;
  assertEquals(c.declared, c.attributed + c.refused);
  assertEquals(c.declared, 2);
  assertEquals(c.attributed, 1);
  assertEquals(c.refused, 1);
});

Deno.test("LOT 3C — les nombres comptent la MÊME population que `dishes`", () => {
  // ⚠️ LE DÉNOMINATEUR EST LA SORTIE, jamais la réponse brute. `dishes` est le
  // nombre de plats GARDÉS; `declared` suit les mêmes `splice`. Un compteur dont
  // le numérateur et le dénominateur ne décrivent pas les mêmes lignes est un
  // compteur qui ment.
  const meal = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  assertEquals(meal.dish_owner_counts.dishes, meal.dishes.length);
});

Deno.test("LOT 3C — un plat ÉVINCÉ par le plafond ne compte dans AUCUN des quatre", () => {
  // ⛔ LE TABLEAU PARALLÈLE DOIT SUIVRE LE `splice`, et c'est la seule façon de
  // le prouver: sans lui, le refus d'un plat que le plafond vient de retirer
  // reste dans `declared`/`refused` alors que le plat n'existe plus. Le
  // compteur annoncerait « une attribution refusée » sur une ligne que personne
  // ne peut retrouver — exactement la famille `withheld`/`over_cap`.
  const dish = (slot: string, n: number, over: Record<string, unknown> = {}) => ({
    title: `Plate ${slot} ${n}`,
    slot,
    day: "mon",
    ingredients: [{ term: "chicken", quantity: "150 g" }],
    method: "Cook it.",
    why: "It fits the day.",
    ...over,
  });
  // Le TROISIÈME déjeuner est le plat le plus jetable (sa case est déjà prise
  // deux fois): c'est lui que le plafond sacrifie quand le dîner arrive, et
  // c'est lui qui porte l'attribution refusée.
  const meal = parse({
    dishes: [
      dish("breakfast", 1),
      dish("lunch", 1),
      dish("lunch", 2),
      dish("lunch", 3, { for_member_id: "m-inconnu" }),
      dish("dinner", 1),
    ],
  }, { merge: eaterAsking(["m-zoe"]) });
  assert(
    !meal.dishes.some((d) => d.title === "Plate lunch 3"),
    "le plafond n'a pas évincé le plat marqué: le test ne mesure plus rien",
  );
  assertEquals(meal.dish_owner_counts, {
    dishes: meal.dishes.length,
    declared: 0,
    attributed: 0,
    refused: 0,
  });
});

// ---------------------------------------------------------------------------
// L7 ③ — LE NOM D'USAGE D'UN PLAT
//
// ⛔ LA LEÇON QUI GOUVERNE CE LOT A UNE DATE ET DEUX NOMBRES. Le 2026-08-17,
// `for_member_id` a été mesuré à ZÉRO déclaration sur 291 plats — non parce que
// le modèle refusait, mais parce que la PROMESSE de la matière vivait dans le
// message utilisateur pendant que la CLÉ du schéma vivait dans le prompt
// système, sans rien pour les relier. Rapprochée de sa promesse, avec le NOMBRE
// attendu et l'ÉCHAPPATOIRE NOMMÉE, la même clé est passée à onze.
//
// D'où la forme de `name`: l'ordre et la clé se touchent (la section est collée
// au schéma, et `"name"` en est la PREMIÈRE clé), le nombre est countable (« as
// many names as you have dishes »), et l'échappatoire est nommée — enjoliver le
// titre au lieu d'écrire un nom.
// ---------------------------------------------------------------------------

Deno.test("L7 ③ — la PROMESSE et la CLÉ se touchent, et le nombre est dit", () => {
  const order = MEAL_SYSTEM_PROMPT.indexOf(
    "== EVERY DISH HAS TWO LINES: A NAME, AND A TITLE ==",
  );
  const schema = MEAL_SYSTEM_PROMPT.indexOf("== OUTPUT JSON SCHEMA ==");
  assert(order >= 0, "la section qui ORDONNE le nom a disparu du prompt système");
  assert(schema > order, "la promesse ne précède plus le schéma");

  // ⛔ ADJACENTES: rien entre les deux. C'est très exactement ce que 3C a
  // mesuré à zéro quand les deux moitiés étaient séparées par le prompt.
  const between = MEAL_SYSTEM_PROMPT.slice(order, schema);
  assertEquals(
    between.split("== ").length - 1,
    1,
    `un bloc s'est glissé entre la promesse du nom et le schéma:\n${between}`,
  );

  // LE NOMBRE, ET IL EST COMPTABLE PAR LE MODÈLE.
  assert(
    between.includes("as many names as you have dishes"),
    "le nombre attendu n'est plus dit",
  );
  assert(between.includes("Count them"), "on ne demande plus de les compter");

  // L'ÉCHAPPATOIRE, NOMMÉE. Le modèle qui ne veut pas de second champ rend le
  // TITRE joli — c'est-à-dire précisément le geste que le produit interdit.
  assert(
    between.includes("Do NOT make the title pretty"),
    "l'échappatoire (enjoliver le titre) n'est plus nommée",
  );

  // ET LA CLÉ EST LA PREMIÈRE DU PLAT, dans le schéma juste en dessous.
  const dishBlock = MEAL_SYSTEM_PROMPT.slice(schema);
  assert(
    dishBlock.indexOf('"name"') < dishBlock.indexOf('"title"'),
    "la clé `name` n'ouvre plus le plat dans le schéma",
  );
});

Deno.test("L7 ③ — `dishes[].name` est de la PROSE, jamais un jeton", () => {
  // Le piège de `preparation_id` pris à l'envers: un nom d'usage laissé en
  // anglais dans un plan français serait la SEULE ligne visible de la grille
  // dans la mauvaise langue.
  assert(
    MEAL_TRANSLATABLE_FIELDS.includes("dishes[].name"),
    "le nom d'usage est sorti de la liste traduisible",
  );
  assert(
    !MEAL_TOKEN_FIELDS.some((f) => f.startsWith("dishes[].name")),
    "le nom d'usage est passé du côté des jetons non traduisibles",
  );
});

Deno.test("L7 ③ — rien de déclaré: les trois nombres le disent, pour la bonne raison", () => {
  // ⚠️ LE CAS QUI PASSE, et il est le cas nominal des plans d'avant ce lot. Un
  // compteur qu'on ne sait pas faire dire « zéro pour la bonne raison » ne
  // distingue rien.
  const meal = parse(dishFor());
  assertEquals(meal.name_counts, { dishes: 1, declared: 0, kept: 0, refused: 0 });
  assertEquals(meal.dishes[0].name, null);
  assertEquals(meal.dishes[0].title, "Chicken and rice");
});

Deno.test("L7 ③ — un nom déclaré est POSÉ, et le titre ne bouge pas", () => {
  const meal = parse(dishFor({ name: "Golden roast chicken bowls" }));
  assertEquals(meal.dishes[0].name, "Golden roast chicken bowls");
  // ⛔ LE TITRE RESTE DESCRIPTIF. C'est toute la raison des deux champs.
  assertEquals(meal.dishes[0].title, "Chicken and rice");
  assertEquals(meal.name_counts, { dishes: 1, declared: 1, kept: 1, refused: 0 });
});

Deno.test("L7 ③ — un nom TROP LONG est refusé, et le plat reste", () => {
  const tooLong = "A".repeat(DISH_NAME_MAX_CHARS + 1);
  const meal = parse(dishFor({ name: tooLong }));
  // ⛔ LA POSTURE DU LOT: un champ refusé ne rejette JAMAIS le plat.
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].name, null);
  assertEquals(meal.dishes[0].title, "Chicken and rice");
  assertEquals(meal.name_counts, { dishes: 1, declared: 1, kept: 0, refused: 1 });
  assert(
    meal.issues.some((i) => i.includes("characters")),
    `le refus n'est pas nommé: ${JSON.stringify(meal.issues)}`,
  );
  // LA BORNE EST UNE BORNE: un caractère de moins passe.
  const justFits = parse(dishFor({ name: "A".repeat(DISH_NAME_MAX_CHARS) }));
  assertEquals(justFits.name_counts.kept, 1);
});

Deno.test("L7 ③ — un nom IDENTIQUE au titre est refusé: une ligne suffit", () => {
  // L'écran rend le nom au-dessus du titre. Deux fois la même chaîne l'une
  // sur l'autre est une ligne qui ne dit rien.
  const meal = parse(dishFor({ name: "  chicken   AND rice " }));
  assertEquals(meal.dishes[0].name, null);
  assertEquals(meal.name_counts, { dishes: 1, declared: 1, kept: 0, refused: 1 });
  assert(
    meal.issues.some((i) => i.includes("repeats the title")),
    `le refus n'est pas nommé: ${JSON.stringify(meal.issues)}`,
  );
});

Deno.test("L7 ③ — une clé vide n'est NI déclarée NI refusée", () => {
  // Même discipline que `same_day`: un plat sans clé du tout ne compte dans
  // aucun des deux, et l'écart entre `dishes` et `declared` est le nombre qu'on
  // veut voir au premier run réel.
  for (const empty of ["", "   ", null]) {
    const meal = parse(dishFor({ name: empty }));
    assertEquals(
      meal.name_counts,
      { dishes: 1, declared: 0, kept: 0, refused: 0 },
      `\`${JSON.stringify(empty)}\` a été compté`,
    );
  }
});

Deno.test("L7 ③ — `declared` vaut TOUJOURS `kept + refused`", () => {
  // ⚠️ UNE PROPRIÉTÉ VÉRIFIÉE, PAS UNE DÉFINITION. Les trois se comptent
  // séparément (cicatrice `withheld`/`over_cap`). La dériver la rendrait
  // invérifiable.
  const one = dishFor().dishes[0];
  const meal = parse({
    dishes: [
      { ...one, day: "mon", slot: "lunch", name: "Golden bowls" },
      { ...one, day: "mon", slot: "dinner", name: "B".repeat(200) },
      { ...one, day: "mon", slot: "breakfast" },
    ],
  });
  const c = meal.name_counts;
  assertEquals(c.declared, c.kept + c.refused);
  assertEquals(c, { dishes: 3, declared: 2, kept: 1, refused: 1 });
});

Deno.test("L7 ③ — un plat ÉVINCÉ par le plafond ne compte dans AUCUN des trois", () => {
  // ⛔ LE SEPTIÈME TABLEAU PARALLÈLE DOIT SUIVRE LE `splice`. Sans lui, le refus
  // d'un plat que le plafond vient de retirer resterait dans `declared` alors
  // que le plat n'existe plus: un compteur qui annonce un refus sur une ligne
  // que personne ne peut retrouver.
  const plate = (slot: string, n: number, over: Record<string, unknown> = {}) => ({
    title: `Plate ${slot} ${n}`,
    slot,
    day: "mon",
    ingredients: [{ term: "chicken", quantity: "150 g" }],
    method: "Cook it.",
    why: "It fits the day.",
    ...over,
  });
  // ⚠️ LA MISE EN SCÈNE EST LA MOITIÉ DU TEST, ET LA PREMIÈRE VERSION NE
  // MESURAIT RIEN. Un plat refusé par le plafond peut sortir par DEUX portes:
  // le `continue` (quand aucun plat gardé n'est plus jetable que lui) et le
  // `splice` (quand un plat déjà gardé lui cède la place). Seule la seconde
  // touche les tableaux parallèles. La première rédaction posait le nom sur un
  // troisième déjeuner — donc sur le plat le plus jetable de tous, qui sort par
  // le `continue` — et restait verte quand on retirait le `splice`: une
  // ceinture armée sur un coffre vide. Ici le nom est sur le SECOND déjeuner,
  // qui est gardé, puis évincé par le dîner.
  const meal = parse({
    dishes: [
      plate("breakfast", 1),
      plate("lunch", 1),
      plate("lunch", 2, { name: "C".repeat(200) }),
      plate("dinner", 1),
    ],
  });
  assert(
    !meal.dishes.some((d) => d.title === "Plate lunch 2"),
    "le plafond n'a pas évincé le plat nommé: le test ne mesure plus rien",
  );
  assert(
    meal.dishes.some((d) => d.title === "Plate dinner 1"),
    "le plat nommé n'a pas CÉDÉ SA PLACE: il est sorti par le `continue`, " +
      "et le `splice` n'est donc pas exercé",
  );
  assertEquals(meal.name_counts, {
    dishes: meal.dishes.length,
    declared: 0,
    kept: 0,
    refused: 0,
  });
});

Deno.test("L7 ③ — le nom est ÉCRIT EN BASE, même à `null`", () => {
  // Posture `member_id` / `same_day` / `box_id`: une clé absente ne se
  // distingue pas d'un lot débranché — et c'est `dishes[].name` qui rend le
  // taux comptable en SQL sur les DEUX lanes, sans passer par `generated_from`.
  const sans = mealDishesPayload(parse(dishFor()));
  assert("name" in sans[0], JSON.stringify(sans[0]));
  assertEquals(sans[0].name, null);
  const avec = mealDishesPayload(parse(dishFor({ name: "Golden bowls" })));
  assertEquals(avec[0].name, "Golden bowls");
  assertEquals(avec[0].title, "Chicken and rice");
});

Deno.test("L7 ③ — AUCUNE garde ne lit le nom: l'attribution passe par l'id", () => {
  // ⛔ LA CICATRICE DES MATCHERS DE TITRE RESTE FERMÉE. Un nom qui contient le
  // prénom d'une autre bouche ne doit rien changer: 12 faux positifs sur 12 ont
  // été mesurés sur cette famille de lecture.
  const nu = parse(dishFor({ for_member_id: "m-zoe" }), {
    merge: eaterAsking(["m-zoe"]),
  });
  const nomme = parse(
    dishFor({ for_member_id: "m-zoe", name: "Lea's golden bowls" }),
    { merge: eaterAsking(["m-zoe"]) },
  );
  assertEquals(nomme.dishes[0].memberId, nu.dishes[0].memberId);
  assertEquals(nomme.dishes[0].memberId, "m-zoe");
  assertEquals(nomme.dish_owner_counts, nu.dish_owner_counts);
});

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX SURFACES QUE LA CEINTURE NE LISAIT PAS (2026-08-19)
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré sur un plan réel: `applyKeelOutputLocks` ne recevait QUE les plats et
// les courses — zéro titre de préparation, zéro `portion_note`. Un contact
// croisé DÉCLARÉ (« roast on the other half of the chicken tray ») vivait dans
// une surface que rien ne lisait.
//
// ⛔ ET LE PIÈGE DE L'EXTENSION, qui a sa propre épreuve plus bas: la négation
// doit rester tolérée. `portion_note` porte légitimement « Ensure no sesame is
// present » sur l'assiette de la personne allergique — c'est le BON
// comportement, et l'étendre sans le prouver ferait mourir la semaine en 422
// sur une phrase correcte.

const SESAME: StudentSafetyConstraint = {
  id: "c_sesame",
  userId: "u1",
  kind: "allergy",
  allergenRef: "sesame",
  substanceRef: null,
  medicationClass: null,
  conditionRef: null,
  dietRef: null,
  severity: "medical",
  declaredBy: "student",
  notes: null,
  contentLocale: "en-GB",
};

Deno.test("un allergène médical dans un TITRE DE PRÉPARATION ne part pas", () => {
  const meal = parse({
    dishes: [dish({ uses: [{ preparation_id: "prep_x", servings: 1 }] })],
    preparations: [{
      id: "prep_x",
      title: "Peanut butter satay base",
      servings_made: 4,
      ingredients: [{ term: "chicken thighs", quantity: "800 g" }],
      method: "Roast the thighs.",
      active_minutes: 10,
      total_minutes: 40,
    }],
    shopping_list: [],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
  assertEquals(meal.dishes, []);
  assertEquals(meal.preparations, []);
});

Deno.test("un allergène médical dans la MÉTHODE d'une préparation ne part pas", () => {
  // La recette d'un lot ne vit QUE dans la préparation: le prompt système
  // interdit au plat de la répéter. Ne ceinturer que le titre laisserait donc
  // la seule surface où « l'autre moitié du plateau » peut s'écrire.
  const meal = parse({
    dishes: [dish({ uses: [{ preparation_id: "prep_x", servings: 1 }] })],
    preparations: [{
      id: "prep_x",
      title: "Roast chicken thighs",
      servings_made: 4,
      ingredients: [{ term: "chicken thighs", quantity: "800 g" }],
      method: "Roast on the other half of the tray, next to the peanut butter glaze.",
      active_minutes: 10,
      total_minutes: 40,
    }],
    shopping_list: [],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
  assertEquals(meal.dishes, []);
});

Deno.test("un allergène médical dans une PORTION_NOTE ne part pas — la phrase lue à table", () => {
  const meal = parse({
    dishes: [dish()],
    shopping_list: [],
    member_portions: [
      { member_id: "m1", portion_note: "A generous spoon of tahini over the bowl." },
    ],
  }, { safetyConstraints: [SESAME] });
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
  assertEquals(meal.dishes, []);
});

Deno.test("un allergène médical dans une NOTE DE PART ne part pas non plus", () => {
  // Une ligne plus bas que `portion_note`, et c'est exactement la surface du
  // contact croisé mesuré: « prends dans le plateau à… ».
  const meal = parse({
    dishes: [dish()],
    shopping_list: [],
    member_portions: [
      {
        member_id: "m1",
        portion_note: "The usual share.",
        preparation_shares: [
          { preparation_id: "prep_x", note: "Take from the peanut butter tray." },
        ],
      },
    ],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.lock.reason, "blocked_medical_constraint");
  assertEquals(meal.dishes, []);
});

Deno.test("⛔ LA NÉGATION SURVIT: « Ensure no sesame is present » ne tue pas la semaine", () => {
  // LE PIÈGE DE CE LOT, ET IL EST MESURÉ. C'est la phrase CORRECTE — la
  // consigne de contact croisé sur l'assiette de la personne allergique. Sans
  // cette tolérance, étendre la ceinture aux notes ferait mourir chaque plan
  // dont une note protège quelqu'un, c'est-à-dire exactement les plans qu'on
  // veut. La règle n'est pas réécrite ici: c'est celle du moteur commun
  // (`allowNegatedMentions`, condition de désarmement n°3), la même qui laisse
  // déjà passer « avoid nut butter » sur un plat.
  const meal = parse({
    dishes: [dish()],
    shopping_list: [],
    member_portions: [
      { member_id: "m1", portion_note: "Ensure no sesame is present on this plate." },
      { member_id: "m2", portion_note: "Salad without sesame, dressed with lemon." },
    ],
  }, { safetyConstraints: [SESAME] });
  assertEquals(meal.lock.reason, "clean");
  assertEquals(meal.dishes.length, 1);
});

Deno.test("une préparation propre et des notes propres rendent le plan d'avant, octet pour octet", () => {
  // La preuve d'INNOCUITÉ de l'extension. Deux surfaces de plus dans le
  // haystack ne doivent rien changer à un plan qui n'a rien à se reprocher —
  // sinon la garde aurait un coût pour tout le monde au lieu de mordre sur le
  // seul cas qui la justifie.
  const payload = {
    dishes: [dish({ uses: [{ preparation_id: "prep_x", servings: 1 }] })],
    preparations: [{
      id: "prep_x",
      title: "Roast chicken thighs",
      servings_made: 4,
      ingredients: [{ term: "chicken thighs", quantity: "800 g" }],
      method: "Roast the thighs at 200C.",
      active_minutes: 10,
      total_minutes: 40,
    }],
    shopping_list: [{ term: "chicken thighs", quantity: "800 g", aisle: "protein" }],
    member_portions: [
      { member_id: "m1", portion_note: "A bigger share of the chicken." },
    ],
  };
  const meal = parse(payload, { safetyConstraints: [PEANUT, SESAME] });
  assertEquals(meal.lock.reason, "clean");
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.preparations.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2026-08-19 — LE DÉROULÉ DE SESSION NE PORTE PAS LES GRAMMES DES BOÎTES.
//
// ── LE FAIT, LU À L'ÉCRAN ─────────────────────────────────────────────────
// « Sortir le plat après 45 minutes, répartir six portions de 450 g et ranger
// au réfrigérateur », sur un foyer de DEUX personnes. Le nombre de portions ne
// correspondait à rien, le grammage à aucune boîte, et la phrase ne disait pas
// de QUOI étaient ces 450 g. Ses mots: « il dit de faire des barquettes de 450
// grammes mais on sait pas à quoi ça correspond ».
//
// ⛔ ON COMPTE, ON NE COUPE PAS. Le déroulé est la seule chose qui dise
// l'ORDRE des gestes entre deux casseroles; jeter la session pour une faute de
// rédaction coûterait cet ordre-là. Et réécrire la prose du modèle serait un
// matcher maison sur du texte libre.
//
// ⚠️ SANS CE COMPTEUR, LA CONSIGNE SERAIT INVÉRIFIABLE: « le modèle a obéi » et
// « on n'a rien mesuré » rendent le même silence.
// ═══════════════════════════════════════════════════════════════════════════

function sessionPayload(runThrough: string): Record<string, unknown> {
  return {
    dishes: [{
      title: "Chicken bowls",
      slot: "lunch",
      day: "mon",
      method: "Assemble.",
      why: "",
      ingredients: [],
      uses: [{ preparation_id: "prep_chicken", servings: 1 }],
    }],
    preparations: [{
      id: "prep_chicken",
      title: "Roast chicken",
      servings_made: 4,
      ingredients: [],
      method: "Roast it.",
      active_minutes: 10,
      total_minutes: 50,
      cook_on: "mon",
    }],
    cooking_sessions: [{
      day: "mon",
      preparation_ids: ["prep_chicken"],
      total_minutes: 60,
      run_through: runThrough,
    }],
    shopping_list: [],
  };
}

Deno.test("⛔ un déroulé qui porte un grammage est COMPTÉ, et la session est gardée", () => {
  const out = parse(sessionPayload(
    "Roast the chicken, then portion six servings of 450 g into the boxes.",
  ));
  // La session survit: l'ordre des gestes est ce qu'on vient chercher.
  assertEquals(out.cooking_sessions.length, 1);
  // Et le compteur sort AVEC SA POPULATION — « 3 déroulés chiffrés » ne veut
  // rien dire sans le dénominateur.
  assert(
    out.issues.some((i: string) =>
      i.includes("run_through carry a weight or a portion count") &&
      i.includes("1/1")
    ),
    `le compteur ne sort pas: ${JSON.stringify(out.issues)}`,
  );
});

Deno.test("⚠️ LE CAS QUI PASSE — un déroulé sans chiffre ne déclenche rien", () => {
  // Sans ce cas, un compteur qui s'allumerait sur TOUT déroulé ressemblerait
  // trait pour trait au compteur juste.
  const out = parse(sessionPayload(
    "Heat the oven, roast the chicken, then portion it into the named boxes.",
  ));
  assertEquals(out.cooking_sessions.length, 1);
  assert(
    !out.issues.some((i: string) => i.includes("run_through carry a weight")),
    `un déroulé propre a été compté: ${JSON.stringify(out.issues)}`,
  );
});

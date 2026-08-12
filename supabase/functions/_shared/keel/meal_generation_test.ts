// REPAS GÉNÉRÉS — ce que ces tests protègent, dans l'ordre de ce qui coûte
// le plus cher quand ça casse:
//   * un allergène médical dans une recette ou dans une liste de courses;
//   * « tu as déjà tout » dit à quelqu'un qui n'a pas les œufs;
//   * une kcal ou un macro chiffré côté élève — ligne rouge du produit;
//   * une quantité de courses REFUSÉE par le filtre numérique, qui rendrait le
//     générateur incapable d'écrire une recette (le faux positif est aussi
//     grave que le faux négatif, il tue juste la fonctionnalité au lieu de
//     l'élève).

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildMealPrompt,
  dishCapFor,
  isInPantry,
  MEAL_SCOPES,
  parseGeneratedMeal,
  SHOPPING_AISLES,
} from "./meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

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
  const { userMessage, systemPrompt } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
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

Deno.test("from_pantry puts the pantry in the prompt, to_shop does not pretend to", () => {
  const base = {
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
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
  } as const;
  const fromPantry = buildMealPrompt({ ...base, mode: "from_pantry", scope: "day" });
  assert(fromPantry.userMessage.includes("WHAT THEY ALREADY HAVE"));
  assert(fromPantry.userMessage.includes("eggs (6)"));

  const toShop = buildMealPrompt({ ...base, mode: "to_shop", scope: "day" });
  assert(toShop.userMessage.includes("HAVE NOT SHOPPED YET"));
  assert(!toShop.userMessage.includes("WHAT THEY ALREADY HAVE"));
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
  const withPrefs = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
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
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== MARC'S METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
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

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
  // LOT C — l'attribution du plat dédié, écrite en base.
  mealDishesPayload,
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
    boxMemberIds: [],
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
  const { userMessage, systemPrompt } = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true,
    budgetAmount: null,
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

Deno.test("le prompt EXIGE une quantité sur les matières grasses", () => {
  // ── LA GARANTIE EST AU PROMPT ET AU PARSEUR ─────────────────────────────
  // Le parseur nomme les denses non pesés (`energy_dense_unweighed`), et le
  // verdict s'abstient dessus. Sans la consigne EN AMONT, les deux ne feraient
  // que constater un plan illisible sans jamais l'améliorer.
  //
  // MESURÉ le 2026-08-12 sur 80 générations: 82 lignes d'huile d'olive sans
  // quantité — de loin le premier poste de perte d'énergie du référentiel.
  const { systemPrompt } = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true,
    budgetAmount: null,
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
    goal: "fat_loss",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 1,
    pantry: [],
  });
  assert(systemPrompt.includes('ALWAYS carry "amount" and "unit"'));
  assert(systemPrompt.includes("A drizzle of olive oil"));
  // La consigne ne doit PAS s'étendre au sel: une pincée reste une pincée, et
  // exiger un chiffre partout ferait inventer des nombres — ce que le même
  // prompt interdit deux paragraphes plus haut.
  assert(systemPrompt.includes("pepper and herbs may stay a pinch; oil may not"));
  assert(systemPrompt.includes("A made-up number is worse than a"));
});

Deno.test("from_pantry puts the pantry in the prompt, to_shop does not pretend to", () => {
  const base = {
    contentLocale: "en-US",
    firstDayCookable: true,
    budgetAmount: null,
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
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
    boxMemberIds: [],
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
  const withPrefs = buildMealPrompt({ contentLocale: "en-US", firstDayCookable: true,
    budgetAmount: null,
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
    contentLocale: "en-US",
    firstDayCookable: true,
    budgetAmount: null,
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== MARC'S METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
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

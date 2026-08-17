// LOT 4 (P4) — LES GRAMMES PAR PERSONNE ET LE PROTOCOLE DES BOÎTES.
//
// Ce que ces épreuves protègent, dans l'ordre de ce qui coûte le plus cher:
//
//   * LE LOT DÉSARMÉ QUI RESSEMBLE À UN LOT QUI MARCHE. `boxes` est DÉCLARÉ par
//     le modèle: sans compteurs qui distinguent « jamais écrit », « écrit puis
//     refusé » et « écrit, gardé, invérifiable », un zéro raconte trois
//     histoires qui appellent trois corrections opposées. Le 2026-08-17, un
//     compteur à deux nombres a fait conclure faux un vérificateur entier;
//   * LA CONSIGNE SÉPARÉE DE SA PROMESSE. Le même jour, un champ réclamé au
//     modèle est resté à ZÉRO déclaration sur 291 plats parce que la promesse de
//     la matière vivait dans le message utilisateur et la clé du schéma dans le
//     prompt système, sans rien pour les relier. Ici la promesse de peser est le
//     brief de portions, et l'ordre est DEDANS — les tests de position tiennent
//     cette place, qui est la moitié du lot;
//   * LA SOMME COMPARÉE DE TRAVERS. Les ingrédients d'une préparation sont en
//     grammes CRUS, les boîtes en grammes PRÊTS; comparer les deux directement
//     accuserait des plans justes, toujours dans le même sens;
//   * LA CEINTURE QUI MORD SUR TOUT. Le flou se COMPTE, il ne retire rien — et
//     « 150 g de poulet » doit passer, sans quoi la garde se fait désarmer dans
//     la semaine.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  BOX_MAX_GRAMS,
  BOX_SUM_TOLERANCE_RATIO,
  type GeneratedMeal,
  MEAL_PROMPT_VERSION,
  MEAL_SYSTEM_PROMPT,
  MEAL_TOKEN_FIELDS,
  mealDishesPayload,
  mealPreparationsPayload,
  parseGeneratedMeal,
  preparationReadyGrams,
} from "./meal_generation.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
  YIELD_FACTORS,
} from "./food_composition.ts";
import {
  buildPortionBrief,
  FORBIDDEN_PORTION_TERMS,
  type PortionMember,
  reconcilePortions,
  sanitizePortionNote,
  VAGUE_PORTION_TERMS,
  vaguePortionMatches,
} from "./household_portions.ts";
import {
  buildHouseholdPromptBlocks,
  HOUSEHOLD_PROMPT_VERSION,
} from "./household_meal_generation.ts";
import { parseMemberAway, resolveWindowPresence } from "./household_presence.ts";
import type { MealScope } from "./meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import type { CompositionIndex } from "./food_composition.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR
// ---------------------------------------------------------------------------

/** Un allergène MÉDICAL, pour armer le verrou de sortie binaire. */
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

const ZOE = "11111111-1111-4111-8111-111111111111";
const NINA = "22222222-2222-4222-8222-222222222222";
const MARC = "33333333-3333-4333-8333-333333333333";

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

/**
 * ⚠️ `chicken_breast` EST `meat_shrinks` (0,7) ET `white_rice` `grain_absorbs`
 * (2,6). Les deux sens sont dans la même fixture EXPRÈS: une conversion qui
 * partirait dans un seul sens passerait un test bâti sur du riz seul.
 */
const INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken_breast", foodGroupRef: "poultry", yieldClass: "meat_shrinks" }),
    ref({ slug: "white_rice", foodGroupRef: "refined_grain", yieldClass: "grain_absorbs" }),
  ],
  [
    { alias: "chicken", slug: "chicken_breast" },
    { alias: "chicken breast", slug: "chicken_breast" },
    { alias: "rice", slug: "white_rice" },
  ],
);

const PARSE_BASE = {
  doctrine: null,
  safetyConstraints: [] as readonly StudentSafetyConstraint[] | null,
  mode: "to_shop" as const,
  scope: "several_days" as MealScope,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [
    { slot: "lunch" as const, size: null },
    { slot: "dinner" as const, size: null },
  ],
  daysToFill: ["mon", "tue", "wed"],
  awayDays: [],
  cookingTimeMin: null,
  composition: INDEX as CompositionIndex | null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [ZOE, NINA, MARC] as readonly string[],
};

/** 1 000 g de poulet CRU ⇒ 700 g prêt (0,7). Le nombre est écrit à la main. */
function prep(over: Record<string, unknown> = {}) {
  return {
    id: "prep_chicken",
    title: "Roast chicken",
    servings_made: 4,
    method: "Roast it.",
    active_minutes: 10,
    total_minutes: 50,
    cook_on: "mon",
    ingredients: [
      { term: "chicken breast", quantity: "1000 g", amount: 1000, unit: "g", state: "raw" },
    ],
    ...over,
  };
}

function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Chicken bowl",
    day: "tue",
    slot: "lunch",
    method: "Take the box out and reheat it.",
    why: "Because it works.",
    ingredients: [
      { term: "rice", quantity: "80 g dried", amount: 80, unit: "g", state: "raw" },
    ],
    uses: [{ preparation_id: "prep_chicken", servings: 1 }],
    ...over,
  };
}

function parse(
  payload: Record<string, unknown>,
  over: Partial<typeof PARSE_BASE> = {},
): GeneratedMeal {
  return parseGeneratedMeal(payload, { ...PARSE_BASE, ...over });
}

// ---------------------------------------------------------------------------
// 1 — LES BOÎTES, DÉCLARÉES ET VALIDÉES FERMÉES
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — deux boîtes nommées passent intactes (LE CAS QUI PASSE)", () => {
  // ⚠️ ÉCRIT EN PREMIER, ET C'EST LA RÈGLE DE LA MAISON: une garde cassée refuse
  // tout et ressemble trait pour trait à une garde qui marche.
  const meal = parse({
    preparations: [prep({
      boxes: [
        { id: "box_chicken_zoe", member_ids: [ZOE], grams: 120 },
        { id: "box_chicken_nina", member_ids: [NINA], grams: 200 },
      ],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations.length, 1);
  assertEquals(meal.preparations[0].boxes.length, 2);
  assertEquals(meal.preparations[0].boxes[0], {
    id: "box_chicken_zoe",
    memberIds: [ZOE],
    grams: 120,
  });
  assertEquals(meal.box_counts.preparations, 1);
  assertEquals(meal.box_counts.with_boxes, 1);
  assertEquals(meal.box_counts.boxes, 2);
  assertEquals(meal.box_counts.refused, 0);
});

Deno.test("LOT 4 — une boîte PARTAGÉE liste plusieurs bouches, et c'est légitime", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_chicken_table", member_ids: [ZOE, NINA, MARC], grams: 400 }],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations[0].boxes[0].memberIds, [ZOE, NINA, MARC]);
  assertEquals(meal.box_counts.refused, 0);
});

Deno.test("LOT 4 — une bouche INCONNUE est jetée, la boîte survit à ses autres noms", () => {
  // ⚠️ LA BOÎTE N'EST PAS PERDUE POUR UN NOM FANTÔME. Une boîte partagée
  // amputée d'un inconnu reste lisible; la jeter entière retirerait sa part à
  // deux bouches réelles pour l'erreur d'une troisième.
  const meal = parse({
    preparations: [prep({
      boxes: [{
        id: "box_chicken_shared",
        member_ids: [ZOE, "44444444-4444-4444-8444-444444444444"],
        grams: 300,
      }],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations[0].boxes.length, 1);
  assertEquals(meal.preparations[0].boxes[0].memberIds, [ZOE]);
  assertEquals(meal.box_counts.boxes, 1);
  assertEquals(meal.box_counts.refused, 0, "la boîte n'est pas refusée");
  assert(
    meal.issues.some((i) => i.includes("is not a mouth of this plan")),
    meal.issues.join("\n"),
  );
});

Deno.test("LOT 4 — une boîte SANS aucune bouche connue tombe et est COMPTÉE", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_ghost", member_ids: ["nobody"], grams: 300 }],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations[0].boxes.length, 0);
  assertEquals(meal.box_counts.boxes, 0);
  assertEquals(meal.box_counts.with_boxes, 0);
  assertEquals(meal.box_counts.refused, 1);
  assertEquals(meal.preparations.length, 1, "la préparation SURVIT");
  assertEquals(meal.dishes.length, 1, "le plat SURVIT");
});

Deno.test("LOT 4 — un id de boîte DÉJÀ PRIS est jeté: la citation deviendrait ambiguë", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [
        { id: "box_dup", member_ids: [ZOE], grams: 120 },
        { id: "box_dup", member_ids: [NINA], grams: 250 },
      ],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations[0].boxes.length, 1);
  assertEquals(meal.preparations[0].boxes[0].memberIds, [ZOE]);
  assertEquals(meal.box_counts.refused, 1);
  assert(meal.issues.some((i) => i.includes("already")), meal.issues.join("\n"));
});

Deno.test("LOT 4 — des grammes illisibles ou nuls font tomber la boîte, jamais le plat", () => {
  for (const grams of [0, -50, "beaucoup", null]) {
    const meal = parse({
      preparations: [prep({ boxes: [{ id: "box_x", member_ids: [ZOE], grams }] })],
      dishes: [dish()],
      shopping_list: [],
    });
    assertEquals(meal.preparations[0].boxes.length, 0, String(grams));
    assertEquals(meal.box_counts.refused, 1, String(grams));
    assertEquals(meal.dishes.length, 1, String(grams));
  }
});

Deno.test("LOT 4 — le plafond d'une boîte ÉCRÊTE et se nomme, il ne jette pas", () => {
  // Le plafond est lu depuis la constante, mais la MUTATION est vérifiable: le
  // test appelle avec `BOX_MAX_GRAMS + 500`, donc changer la constante déplace
  // l'entrée ET la sortie ensemble — c'est le point du `assertEquals` sur
  // `BOX_MAX_GRAMS` lui-même, écrit en littéral juste en dessous.
  assertEquals(BOX_MAX_GRAMS, 2000);
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_huge", member_ids: [ZOE], grams: 2500 }],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.preparations[0].boxes.length, 1);
  assertEquals(meal.preparations[0].boxes[0].grams, 2000);
  assertEquals(meal.box_counts.refused, 0);
  assert(meal.issues.some((i) => i.includes("gram ceiling")), meal.issues.join("\n"));
});

Deno.test("LOT 4 — LANE INDIVIDUELLE: aucune bouche, donc aucune boîte, et rien de perdu", () => {
  const meal = parse(
    {
      preparations: [prep({
        boxes: [{ id: "box_me", member_ids: [ZOE], grams: 200 }],
      })],
      dishes: [dish()],
      shopping_list: [],
    },
    { boxMemberIds: [] },
  );
  assertEquals(meal.preparations.length, 1);
  assertEquals(meal.preparations[0].boxes.length, 0);
  assertEquals(meal.box_counts.refused, 1);
  assertEquals(meal.dishes.length, 1);
});

// ---------------------------------------------------------------------------
// 2 — LA SOMME, ET LA NUANCE CRU/PRÊT
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — `preparationReadyGrams` convertit dans LES DEUX SENS", () => {
  // 1 000 g de poulet cru ⇒ 700 g prêt; 100 g de riz cru ⇒ 260 g prêt. Les deux
  // facteurs sont écrits en littéral ici ET lus depuis `YIELD_FACTORS` pour que
  // muter la table fasse tomber le test.
  assertEquals(YIELD_FACTORS.meat_shrinks, 0.7);
  assertEquals(YIELD_FACTORS.grain_absorbs, 2.6);
  const grams = preparationReadyGrams(
    [
      { term: "chicken", quantity: null, in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000 },
      { term: "rice", quantity: null, in_pantry: false, amount: 100, unit: "g", state: "raw", gramsRaw: 100 },
    ],
    INDEX,
  );
  assertEquals(grams, 960);
});

Deno.test("LOT 4 — un ingrédient non pesable rend la production INVÉRIFIABLE, jamais fausse", () => {
  // ⛔ LE SENS DE L'ERREUR EST TOUJOURS LE MÊME: une production reconstruite sur
  // la moitié des lignes est trop basse, donc toute somme la dépasserait. On
  // s'abstient plutôt que d'accuser.
  assertEquals(
    preparationReadyGrams(
      [
        { term: "chicken", quantity: null, in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000 },
        { term: "parsley", quantity: "a bunch", in_pantry: false, amount: null, unit: null, state: null, gramsRaw: null },
      ],
      INDEX,
    ),
    null,
  );
  assertEquals(preparationReadyGrams([], INDEX), null, "aucune ligne, rien à mesurer");
  assertEquals(
    preparationReadyGrams(
      [{ term: "chicken", quantity: null, in_pantry: false, amount: 100, unit: "g", state: "raw", gramsRaw: 100 }],
      null,
    ),
    null,
    "référentiel absent",
  );
});

Deno.test("LOT 4 — une somme SOUS la production ne dit rien (LE CAS QUI PASSE)", () => {
  // 1 000 g crus ⇒ 700 g prêts. 120 + 200 + 300 = 620 ≤ 700.
  const meal = parse({
    preparations: [prep({
      boxes: [
        { id: "b1", member_ids: [ZOE], grams: 120 },
        { id: "b2", member_ids: [NINA], grams: 200 },
        { id: "b3", member_ids: [MARC], grams: 300 },
      ],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_checked, 1);
  assertEquals(meal.box_counts.sum_over, 0);
  assertEquals(meal.box_counts.sum_unverifiable, 0);
  assertEquals(meal.issues.filter((i) => i.includes("cannot all be filled")), []);
});

Deno.test("LOT 4 — une somme AU-DESSUS est NOMMÉE et comptée, jamais rejetée", () => {
  // 1 000 g crus ⇒ 700 g prêts, tolérance 10 % ⇒ 770. On demande 900.
  const meal = parse({
    preparations: [prep({
      boxes: [
        { id: "b1", member_ids: [ZOE], grams: 450 },
        { id: "b2", member_ids: [NINA], grams: 450 },
      ],
    })],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_checked, 1);
  assertEquals(meal.box_counts.sum_over, 1);
  assertEquals(meal.preparations[0].boxes.length, 2, "les deux boîtes RESTENT");
  assertEquals(meal.dishes.length, 1, "le plan n'est pas rejeté");
  assert(
    meal.issues.some((i) => i.includes("cannot all be filled")),
    meal.issues.join("\n"),
  );
});

Deno.test("LOT 4 — la TOLÉRANCE existe et elle est bornée par sa propre constante", () => {
  // ⚠️ LE TEST N'EST PAS PARAMÉTRÉ PAR LA CONSTANTE: la valeur attendue est un
  // littéral, et le cas de bord est calculé À PARTIR d'elle. Muter la constante
  // fait tomber la première ligne; muter la comparaison fait tomber la seconde.
  assertEquals(BOX_SUM_TOLERANCE_RATIO, 1.1);
  // 700 g prêts × 1,1 = 770. 760 passe, 780 non.
  for (const [grams, over] of [[760, 0], [780, 1]] as const) {
    const meal = parse({
      preparations: [prep({ boxes: [{ id: "b1", member_ids: [ZOE], grams }] })],
      dishes: [dish()],
      shopping_list: [],
    });
    assertEquals(meal.box_counts.sum_over, over, `${grams} g`);
  }
});

Deno.test("LOT 4 — sans référentiel, la somme est INVÉRIFIABLE et jamais « trop »", () => {
  const meal = parse(
    {
      preparations: [prep({
        boxes: [{ id: "b1", member_ids: [ZOE], grams: 5000 }],
      })],
      dishes: [dish()],
      shopping_list: [],
    },
    { composition: null },
  );
  assertEquals(meal.box_counts.sum_checked, 0);
  assertEquals(meal.box_counts.sum_over, 0);
  assertEquals(meal.box_counts.sum_unverifiable, 1);
});

Deno.test("LOT 4 — PROPRIÉTÉ: sum_checked + sum_unverifiable === with_boxes", () => {
  const meal = parse({
    preparations: [
      prep({ boxes: [{ id: "b1", member_ids: [ZOE], grams: 200 }] }),
      prep({
        id: "prep_soup",
        title: "Soup",
        ingredients: [{ term: "parsley", quantity: "a bunch" }],
        boxes: [{ id: "b2", member_ids: [NINA], grams: 300 }],
      }),
      prep({ id: "prep_plain", title: "Plain", boxes: [] }),
    ],
    dishes: [dish()],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.preparations, 3);
  assertEquals(meal.box_counts.with_boxes, 2);
  assertEquals(
    meal.box_counts.sum_checked + meal.box_counts.sum_unverifiable,
    meal.box_counts.with_boxes,
  );
  assertEquals(meal.box_counts.sum_unverifiable, 1, "la soupe n'est pas convertible");
});

// ---------------------------------------------------------------------------
// 3 — LA CITATION D'UNE BOÎTE PAR UN PLAT (C5)
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — un `box_id` valide arrive sur la reprise (LE CAS QUI PASSE)", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_chicken_zoe", member_ids: [ZOE], grams: 120 }],
    })],
    dishes: [dish({
      uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_chicken_zoe" }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].uses[0].boxId, "box_chicken_zoe");
  assertEquals(meal.box_use_counts, { uses: 1, cited: 1, resolved: 1, refused: 0 });
});

Deno.test("LOT 4 — un `box_id` ORPHELIN est refusé et compté, la reprise reste vraie", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_chicken_zoe", member_ids: [ZOE], grams: 120 }],
    })],
    dishes: [dish({
      uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_nowhere" }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].uses.length, 1, "la reprise SURVIT");
  assertEquals(meal.dishes[0].uses[0].preparationId, "prep_chicken");
  assertEquals(meal.dishes[0].uses[0].boxId, null);
  assertEquals(meal.box_use_counts, { uses: 1, cited: 1, resolved: 0, refused: 1 });
  assert(meal.issues.some((i) => i.includes("does not exist")), meal.issues.join("\n"));
});

Deno.test("LOT 4 — une boîte remplie APRÈS le repas est refusée (C5)", () => {
  // La session est l'autorité du jour de cuisson: elle pose `prep_chicken` sur
  // MERCREDI, et le plat est MARDI. La fenêtre est mon/tue/wed.
  const meal = parse({
    preparations: [prep({
      cook_on: "mon",
      boxes: [{ id: "box_late", member_ids: [ZOE], grams: 120 }],
    })],
    dishes: [dish({
      day: "tue",
      uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_late" }],
    })],
    cooking_sessions: [{
      day: "wed",
      preparation_ids: ["prep_chicken"],
      run_through: "Roast, then box.",
      total_minutes: 60,
    }],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].uses[0].boxId, null);
  assertEquals(meal.box_use_counts.refused, 1);
  assert(meal.issues.some((i) => i.includes("after the meal, dropped")), meal.issues.join("\n"));
});

Deno.test("LOT 4 — un plat SANS JOUR ne se vérifie pas: il est résolu, pas refusé", () => {
  // ⚠️ « On ne sait pas » N'EST PAS « c'est faux ». Un plat sans jour vaut pour
  // toute la portée, aucun ordre ne se pose, et le compter refusé serait le zéro
  // à deux sens que ce chantier a déjà payé.
  //
  // ⚠️ `scope: "day"` ET PAS UNE FENÊTRE: sur plusieurs jours, un plat sans
  // jeton est JETÉ bien avant d'arriver ici (« no day token on a multi-day
  // window »). Cette branche n'existe donc que sur la portée d'un jour, et
  // l'écrire sur une semaine mesurerait le mauvais rejet — c'est le piège que
  // deux lots précédents ont payé en croyant mesurer leur champ.
  const meal = parse(
    {
      preparations: [prep({
        cook_on: "wed",
        boxes: [{ id: "box_any", member_ids: [ZOE], grams: 120 }],
      })],
      dishes: [dish({
        day: null,
        uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_any" }],
      })],
      shopping_list: [],
    },
    {
      scope: "day",
      eatingRhythm: [{ slot: "lunch", size: null }],
      daysToFill: ["mon"],
    },
  );
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].day, null);
  assertEquals(meal.dishes[0].uses[0].boxId, "box_any");
  assertEquals(meal.box_use_counts.resolved, 1);
  assertEquals(meal.box_use_counts.refused, 0);
});

Deno.test("LOT 4 — PROPRIÉTÉ: cited === resolved + refused, et uses ≥ cited", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_ok", member_ids: [ZOE], grams: 120 }],
    })],
    dishes: [
      dish({
        title: "A",
        uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_ok" }],
      }),
      dish({
        title: "B",
        day: "wed",
        uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_ghost" }],
      }),
      dish({ title: "C", day: "mon", uses: [{ preparation_id: "prep_chicken", servings: 1 }] }),
    ],
    shopping_list: [],
  });
  const c = meal.box_use_counts;
  assertEquals(c.uses, 3);
  assertEquals(c.cited, 2);
  assertEquals(c.cited, c.resolved + c.refused);
  assertEquals(c.resolved, 1);
  assertEquals(c.refused, 1);
});

// ---------------------------------------------------------------------------
// 4 — LES QUANTITÉS DU JOUR
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — les ingrédients de PLAT sans nombre sont comptés, déterministe", () => {
  // ⛔ AUCUN MATCHER: la lecture porte sur `amount`, déjà structuré depuis
  // FF-038. La prose de `quantity` n'est jamais relue.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      ingredients: [
        { term: "rice", quantity: "80 g", amount: 80, unit: "g", state: "raw" },
        { term: "parsley", quantity: "a handful" },
        { term: "lemon", quantity: "half a lemon" },
      ],
    })],
    shopping_list: [],
  });
  assertEquals(meal.unquantified_dish_ingredients, { ingredients: 3, unquantified: 2 });
});

Deno.test("LOT 4 — les ingrédients d'une PRÉPARATION ne comptent pas dans ce nombre", () => {
  // P4 parle du complément DU JOUR. Le lot, lui, se pèse une fois, et sa mesure
  // est `structured_quantity_missing`. Mélanger les deux rendrait un chiffre
  // qu'aucune consigne ne vise.
  const meal = parse({
    preparations: [prep({
      ingredients: [{ term: "chicken breast", quantity: "some chicken" }],
    })],
    dishes: [dish({
      ingredients: [{ term: "rice", quantity: "80 g", amount: 80, unit: "g", state: "raw" }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.unquantified_dish_ingredients, { ingredients: 1, unquantified: 0 });
});

Deno.test("LOT 4 — le TRONC demande une quantité pesée ou dénombrable, à toutes les lanes", () => {
  assert(
    MEAL_SYSTEM_PROMPT.includes(
      "== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==",
    ),
  );
  // La ligne nomme les deux formes acceptées ET l'exception qui reste ouverte.
  assert(MEAL_SYSTEM_PROMPT.includes("half a lemon"), MEAL_SYSTEM_PROMPT.slice(0, 1));
  assert(MEAL_SYSTEM_PROMPT.includes("Salt, pepper and herbs may stay a pinch."));
  // ⚠️ LA SECTION D'AVANT N'A PAS ÉTÉ REMPLACÉE: `SAY THE SAME QUANTITY TWICE`
  // porte le contrat structuré, et le nouveau bloc s'y ajoute.
  assert(MEAL_SYSTEM_PROMPT.includes("== SAY THE SAME QUANTITY TWICE"));
});

Deno.test("LOT 4 — les ids de boîte sont des JETONS déclarés, jamais traduits", () => {
  const joined = MEAL_TOKEN_FIELDS.join("\n");
  assert(joined.includes("preparations[].boxes[].id"), joined);
  assert(joined.includes("dishes[].uses[].box_id"), joined);
});

Deno.test("LOT 4 — les deux axes de version ont bougé, chacun pour SA population", () => {
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v11_weighed_or_counted");
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v14_weigh_once_into_boxes");
});

// ---------------------------------------------------------------------------
// 5 — LA PERSISTANCE
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — `boxes` s'écrit MÊME VIDE, `box_id` MÊME À null", () => {
  // ⛔ UNE CLÉ ABSENTE NE SE DISTINGUE PAS D'UN LOT DÉBRANCHÉ. C'est la posture
  // de `member_id` et de `member_deltas`, et ce dépôt la paie en boucle quand
  // il l'oublie.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish()],
    shopping_list: [],
  });
  const preps = mealPreparationsPayload(meal);
  assert("boxes" in preps[0], Object.keys(preps[0]).join(","));
  assertEquals(preps[0].boxes, []);
  const dishes = mealDishesPayload(meal);
  const uses = dishes[0].uses as Array<Record<string, unknown>>;
  assert("box_id" in uses[0], Object.keys(uses[0]).join(","));
  assertEquals(uses[0].box_id, null);
});

Deno.test("LOT 4 — le payload rend les boîtes en clés ASCII snake_case", () => {
  const meal = parse({
    preparations: [prep({
      boxes: [{ id: "box_chicken_zoe", member_ids: [ZOE], grams: 120 }],
    })],
    dishes: [dish({
      uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_chicken_zoe" }],
    })],
    shopping_list: [],
  });
  assertEquals(mealPreparationsPayload(meal)[0].boxes, [
    { id: "box_chicken_zoe", member_ids: [ZOE], grams: 120 },
  ]);
  assertEquals(
    (mealDishesPayload(meal)[0].uses as Array<Record<string, unknown>>)[0],
    { preparation_id: "prep_chicken", servings: 1, box_id: "box_chicken_zoe" },
  );
});

// ---------------------------------------------------------------------------
// 6 — L'ORDRE DE PESER, COLLÉ À SA PROMESSE
// ---------------------------------------------------------------------------

function member(over: Partial<PortionMember> & { memberId: string }): PortionMember {
  return {
    displayName: "Someone",
    goal: "maintenance",
    ageState: "adult",
    body: null,
    eatingSlots: null,
    habits: [],
    habitNote: null,
    ...over,
  } as PortionMember;
}

const NOBODY_AWAY = resolveWindowPresence({
  members: [{ memberId: ZOE, displayName: "Zoé", away: parseMemberAway([]) }],
  rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
  windowDays: ["mon", "tue"],
});

const ZOE_M = member({ memberId: ZOE, displayName: "Zoé", goal: "fat_loss" });
const NINA_M = member({ memberId: NINA, displayName: "Nina", goal: "muscle_gain" });
const MARC_M = member({ memberId: MARC, displayName: "Marc" });

Deno.test("LOT 4 — l'ordre de peser est DANS le brief, avec les prénoms", () => {
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0);
  assert(brief.includes("WEIGH IT ONCE, INTO NAMED BOXES."), brief);
  assert(brief.includes("Zoé, Nina"), brief);
});

Deno.test("LOT 4 — l'ordre dit COMBIEN de bouches, et le nombre suit le roster", () => {
  // ⚠️ DEUX APPELS, DEUX NOMBRES ÉCRITS EN LITTÉRAL. Un test paramétré par la
  // longueur du tableau resterait vert si le bloc écrivait toujours « 1 ».
  assert(
    buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0).includes("That is 2 people"),
  );
  assert(
    buildPortionBrief([ZOE_M, NINA_M, MARC_M], "one_dish", 0).includes("That is 3 people"),
  );
});

Deno.test("LOT 4 — l'ordre NOMME l'échappatoire: une note de portion n'est pas une boîte", () => {
  // ⛔ LE MODÈLE A DÉJÀ UN CHAMP OÙ RANGER « qui mange combien ». Une consigne
  // qui interdit sans nommer la sortie qu'on prend à sa place est une consigne
  // qu'on reprend — mesuré le 2026-08-17, la consigne renvoyée mot pour mot
  // dans le mauvais champ.
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0);
  assert(brief.includes("A line in member_portions is NOT a box."), brief);
});

Deno.test("LOT 4 — l'interdit du POURQUOI reste les TROIS DERNIÈRES lignes du brief", () => {
  // ⛔ POSITION LOAD-BEARING. Un modèle lit la contrainte la plus proche de la
  // fin comme la plus contraignante, et c'est précisément quand le brief se met
  // à porter des NOMBRES par personne que celle-ci doit survivre.
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0);
  const lines = brief.split("\n");
  assertEquals(lines.slice(-3), [
    "NEVER state a reason, a goal, a calorie count or anything about a person's",
    "body in these instructions. They are read aloud at the table by the whole",
    "household. Write what to serve, never why.",
  ]);
  assert(
    brief.indexOf("WEIGH IT ONCE") < brief.indexOf("NEVER state a reason"),
    "le bloc des boîtes est passé APRÈS l'interdit du pourquoi",
  );
});

Deno.test("LOT 4 — À UNE SEULE BOUCHE, le brief est celui d'avant, à l'octet près", () => {
  // Une boîte par personne n'a pas de sujet à une seule, et servir le bloc
  // apprendrait au modèle qu'un marquage par personne existe.
  const brief = buildPortionBrief([ZOE_M], "one_dish", 0);
  assert(!brief.includes("WEIGH IT ONCE"), brief);
  assert(!brief.includes("boxes"), brief);
});

Deno.test("LOT 4 — le SCHÉMA des boîtes est côté système, et muet à une bouche", () => {
  const base = {
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    cooking: "one_dish" as const,
    divergingCount: 0,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    dietBlock: "",
    voices: [],
  };
  const two = buildHouseholdPromptBlocks({ ...base, members: [ZOE_M, NINA_M] });
  assert(two.systemSuffix.includes("== BOXES, ON EVERY PREPARATION (household) =="));
  assert(two.systemSuffix.includes('"grams"'), two.systemSuffix);
  assert(two.userSuffix.includes("in every preparation's boxes"), two.userSuffix);

  const one = buildHouseholdPromptBlocks({ ...base, members: [ZOE_M] });
  assert(!one.systemSuffix.includes("BOXES, ON EVERY PREPARATION"), one.systemSuffix);
  assert(
    one.userSuffix.includes("Exact ids to use in member_portions:"),
    one.userSuffix,
  );
});

Deno.test("LOT 4 — le schéma des boîtes ORDONNE, il ne permet pas", () => {
  // La tournure permissive a été mesurée comme une permission qu'on décline.
  const out = buildHouseholdPromptBlocks({
    members: [ZOE_M, NINA_M],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    cooking: "one_dish",
    divergingCount: 0,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    dietBlock: "",
    voices: [],
  });
  assert(!out.systemSuffix.includes("may carry"), out.systemSuffix);
  assert(out.systemSuffix.includes("then carries"), out.systemSuffix);
});

// ---------------------------------------------------------------------------
// 7 — LA CEINTURE DU FLOU: ELLE COMPTE, ELLE NE RETIRE RIEN
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — le flou mord en ANGLAIS", () => {
  assertEquals(vaguePortionMatches("Give her a handful of rice"), ["handful"]);
  assertEquals(
    vaguePortionMatches("A generous portion of the chicken"),
    ["generous portion"],
  );
  // ⚠️ LA TRACE PORTE LA FORME QUI A MORDU, pas le jeton de tête: c'est le
  // contrat de `findForbiddenMatches` (« the token OR surface form that
  // matched »), et c'est plus utile ici — E veut savoir QUELLE tournure le
  // modèle a écrite, pas seulement qu'une famille a mordu.
  assertEquals(vaguePortionMatches("plenty of vegetables"), ["plenty of"]);
  assertEquals(
    vaguePortionMatches("as much as they like"),
    ["as much as they like"],
  );
});

Deno.test("LOT 4 — le flou mord en FRANÇAIS, accents compris", () => {
  // ⛔ « GARDE TESTÉE DANS UNE SEULE LANGUE » EST UNE CICATRICE DE CE DÉPÔT, et
  // le produit sort en français par défaut (`profiles.locale`).
  assertEquals(vaguePortionMatches("une poignée de riz"), ["poignee"]);
  assertEquals(vaguePortionMatches("une grosse portion de poulet"), ["grosse portion"]);
  assertEquals(vaguePortionMatches("du riz à volonté"), ["a volonte"]);
  assertEquals(vaguePortionMatches("une bonne quantité de légumes"), ["une bonne quantite"]);
});

Deno.test("LOT 4 — LE CAS QUI PASSE: des grammes et une boîte traversent intacts", () => {
  // ⛔ SANS CE CAS, la ceinture serait indiscernable d'une ceinture qui mord sur
  // tout — et une ceinture qui mord sur tout se fait désarmer dans la semaine.
  assertEquals(vaguePortionMatches("Your box: 150 g of the chicken"), []);
  assertEquals(vaguePortionMatches("Ta boîte Zoé : 150 g de poulet, 200 g de riz"), []);
  assertEquals(vaguePortionMatches("Coupe les carottes en morceaux de 3 cm"), []);
  assertEquals(vaguePortionMatches("un peu de sel, une cuillère d'huile"), []);
  assertEquals(vaguePortionMatches(""), []);
  assertEquals(vaguePortionMatches(null), []);
});

Deno.test("LOT 4 — la ceinture du flou GARDE le texte et le COMPTE", () => {
  const { portions, issues, vagueCounts } = reconcilePortions(
    [
      ZOE_M,
      NINA_M,
    ],
    [
      {
        member_id: ZOE,
        portion_note: "Take a handful of the rice",
        preparation_shares: [{ preparation_id: "prep_chicken", note: "150 g from your box" }],
      },
      { member_id: NINA, portion_note: "Your box: 200 g of the chicken" },
    ],
  );
  assertEquals(
    portions[0].portionNote,
    "Take a handful of the rice",
    "le texte flou N'EST PAS retiré",
  );
  assertEquals(vagueCounts, { notes: 3, vague: 1 });
  assert(issues.some((i) => i === `portion_note_vague:${ZOE}:handful`), issues.join("\n"));
});

Deno.test("LOT 4 — une note de PART floue est comptée et nommée par sa préparation", () => {
  const { issues, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{
      member_id: ZOE,
      portion_note: "180 g from your box",
      preparation_shares: [{ preparation_id: "prep_rice", note: "une grosse portion" }],
    }],
  );
  assertEquals(vagueCounts, { notes: 2, vague: 1 });
  assert(
    issues.some((i) => i === `share_note_vague:${ZOE}:prep_rice:grosse portion`),
    issues.join("\n"),
  );
});

Deno.test("LOT 4 — une note MISE À NULL par la ceinture de corps n'entre dans aucun compte", () => {
  // « On ne compte pas un texte que personne ne lira »: la note est partie, et
  // la ranger dans « chiffrée » ou dans « floue » serait faux dans les deux cas.
  const { portions, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{ member_id: ZOE, portion_note: "a handful, for your weight loss" }],
  );
  assertEquals(portions[0].portionNote, null);
  assertEquals(vagueCounts, { notes: 0, vague: 0 });
});

Deno.test("LOT 4 — la ceinture de CORPS est intacte, et les grammes la traversent", () => {
  // Les deux listes ne font pas le même métier, et ce test tient la frontière.
  assertEquals(sanitizePortionNote("Your box: 150 g of the chicken").note, "Your box: 150 g of the chicken");
  assertEquals(sanitizePortionNote("150 g, for your fat loss").note, null);
  assertEquals(sanitizePortionNote("150 g, pour ta perte de poids").note, null);
  // Aucun terme de quantité n'a été glissé dans la liste des termes de CORPS,
  // ni l'inverse: les deux listes restent disjointes par leur `ruleId`.
  assert(FORBIDDEN_PORTION_TERMS.every((t) => t.ruleId !== "portion.vague"));
  assert(VAGUE_PORTION_TERMS.every((t) => t.ruleId === "portion.vague"));
});

// ---------------------------------------------------------------------------
// 8 — LES COMPTEURS ET LA POPULATION
// ---------------------------------------------------------------------------

Deno.test("LOT 4 — le compteur des citations suit le PLAFOND de plats", () => {
  // ⚠️ « Un compteur dont le numérateur et le dénominateur ne comptent pas les
  // mêmes lignes est un compteur qui ment. » `scope: "day"` + un rythme d'un
  // moment donne un plafond de 1: le second plat tombe, et ses citations avec.
  const meal = parse(
    {
      preparations: [prep({
        boxes: [{ id: "box_ok", member_ids: [ZOE], grams: 120 }],
      })],
      dishes: [
        dish({
          title: "Kept",
          day: null,
          slot: "lunch",
          uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_ok" }],
        }),
        dish({
          title: "Dropped",
          day: null,
          slot: "lunch",
          uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_ok" }],
        }),
      ],
      shopping_list: [],
    },
    {
      scope: "day",
      eatingRhythm: [{ slot: "lunch", size: null }],
      daysToFill: ["mon"],
    },
  );
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.box_use_counts.uses, 1, "le plat évincé n'a laissé aucune reprise");
  assertEquals(meal.box_use_counts.cited, 1);
});

Deno.test("LOT 4 — le VERROU DE SORTIE vide le plan ET remet les compteurs à zéro", () => {
  // Annoncer « 1 préparation, 2 boîtes » sur une ligne qui n'en porte plus
  // aucune serait un chiffre faux sur une ligne réelle.
  const meal = parse(
    {
      preparations: [prep({
        boxes: [{ id: "b1", member_ids: [ZOE], grams: 120 }],
      })],
      dishes: [dish({
        title: "Peanut noodles",
        ingredients: [{ term: "peanut butter", quantity: "2 tbsp" }],
      })],
      shopping_list: [],
    },
    {
      safetyConstraints: [PEANUT],
    },
  );
  assertEquals(meal.preparations.length, 0);
  assertEquals(meal.box_counts, {
    preparations: 0,
    with_boxes: 0,
    boxes: 0,
    refused: 0,
    sum_checked: 0,
    sum_over: 0,
    sum_unverifiable: 0,
  });
  assertEquals(meal.box_use_counts, { uses: 0, cited: 0, resolved: 0, refused: 0 });
  assertEquals(meal.unquantified_dish_ingredients, { ingredients: 0, unquantified: 0 });
});

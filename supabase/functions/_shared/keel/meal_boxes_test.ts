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
import type { DietaryRegime } from "./dietary_regime.ts";

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
  portionCarriesAQuantity,
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
// Le module PUR derrière l'issue de table — voir la borne posée plus bas.
import { mouthsFedByDish } from "./box_expected.ts";
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

/**
 * ⚠️ `chicken_breast` EST `meat_shrinks` (0,7) ET `white_rice` `grain_absorbs`
 * (2,6). Les deux sens sont dans la même fixture EXPRÈS: une conversion qui
 * partirait dans un seul sens passerait un test bâti sur du riz seul.
 */
const INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken_breast", foodGroupRef: "poultry", yieldClass: "meat_shrinks" }),
    ref({ slug: "white_rice", foodGroupRef: "refined_grain", yieldClass: "grain_absorbs" }),
    // ⚠️ UNE SECONDE ANCRE PROTÉIQUE, d'un AUTRE groupe: sans elle, le compteur
    // de variété (`protein_sources.distinct`) ne pourrait jamais dépasser 1
    // dans ce fichier, et son cas qui varie serait inécrivable.
    ref({ slug: "lentils_dry", foodGroupRef: "legumes", yieldClass: "grain_absorbs" }),
  ],
  [
    { alias: "chicken", slug: "chicken_breast" },
    { alias: "chicken breast", slug: "chicken_breast" },
    { alias: "rice", slug: "white_rice" },
    { alias: "lentils", slug: "lentils_dry" },
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
  // ⚠️ PERSONNE N'A D'OBJECTIF PAR DÉFAUT: ces épreuves-ci portent sur la FORME
  // des contenants. Un groupe par repas, donc `expected` vaut le nombre de repas
  // boxés — et les épreuves qui veulent une portion millimétrée le disent.
  weighedMemberIds: [] as readonly string[],
  // LA CEINTURE DE RÉGIME — `[]` par défaut: ces épreuves-ci portent sur la
  // FORME des boîtes, pas sur les lignes déclarées. Les épreuves du régime
  // vivent dans `household_regime_belt_test.ts` et le remplacent.
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  boxMemberDiets: [] as readonly { memberId: string; regime: DietaryRegime | null }[],
  boxMemberExclusions: [],
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
// 1 — LA BOÎTE D'UN REPAS, DÉCLARÉE ET VALIDÉE FERMÉE
// ---------------------------------------------------------------------------

/**
 * UN CONTENANT v4, tel que le modèle l'écrit: un groupe, et ce qu'on met dedans.
 *
 * ⚠️ LE NOMBRE DE NOMS EST LE SEUL MARQUEUR. Un seul ⇒ les grammes sont une
 * PRESCRIPTION; plusieurs ⇒ une QUANTITÉ DE BAC. Aucun booléen, aucun type.
 */
function box(over: Record<string, unknown> = {}) {
  return {
    id: "box_tue_lunch",
    member_ids: [ZOE, NINA],
    items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 320 }],
    ...over,
  };
}

Deno.test("LE CAS QUI PASSE — un repas, un contenant, un groupe sur le couvercle", () => {
  // ⚠️ ÉCRIT EN PREMIER, ET C'EST LA RÈGLE DE LA MAISON: une garde cassée refuse
  // tout et ressemble trait pour trait à une garde qui marche.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [box()] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].boxes, [{
    id: "box_tue_lunch",
    memberIds: [ZOE, NINA],
    items: [{ preparationId: "prep_chicken", term: "roast chicken", grams: 320 }],
    legacyTotalGrams: null,
  }]);
  // ⛔ LE COMPTEUR OBLIGATOIRE (`docs/keel/BOITES-PAR-REPAS.md`): sans
  // `with_box / meals`, le défaut n°1 — 8 boîtes sur 16 qu'aucun repas ne
  // citait — revient sans un rouge.
  assertEquals(meal.box_counts.meals, 1);
  assertEquals(meal.box_counts.with_box, 1);
  assertEquals(meal.box_counts.boxes, 1);
  assertEquals(meal.box_counts.names, 2);
  assertEquals(meal.box_counts.items, 1);
  assertEquals(meal.box_counts.refused, 0);
  assertEquals(meal.box_counts.names_refused, 0);
  assertEquals(meal.box_counts.items_refused, 0);
  // ⚠️ ET LE REPLI v2 N'A PAS TRAVAILLÉ: le modèle a écrit la forme v4.
  assertEquals(meal.box_counts.legacy_folded, 0);
});

Deno.test("⛔ v4 — LE COMPTEUR PRINCIPAL: `boxes / expected`, DÉRIVÉ SANS LE MODÈLE", () => {
  // ⛔ SANS `expected`, ZÉRO CONTENANT EST INDISCERNABLE D'UN FOYER OÙ PERSONNE
  // N'EN DEMANDE — c'est-à-dire qu'un lot débranché ressemble à un lot qui
  // marche. L'attendu ne lit RIEN de ce que le modèle a rendu sur les boîtes:
  // trois bouches, dont Zoé à objectif ⇒ 2 groupes (Zoé seule, puis les deux
  // autres ensemble) × 1 repas boxé = 2.
  const plan = {
    preparations: [prep()],
    dishes: [dish({
      boxes: [
        { id: "b_zoe", member_ids: [ZOE], items: [{ preparation_id: "prep_chicken", term: "chicken", grams: 140 }] },
        { id: "b_rest", member_ids: [NINA, MARC], items: [{ preparation_id: "prep_chicken", term: "chicken", grams: 400 }] },
      ],
    })],
    shopping_list: [],
  };
  const meal = parse(plan, { weighedMemberIds: [ZOE] });
  assertEquals(meal.box_counts.expected, 2);
  assertEquals(meal.box_counts.boxes, 2);

  // ⛔ ET IL BOUGE QUAND LE MODÈLE N'ÉCRIT RIEN: le dénominateur reste 2, le
  // numérateur tombe à 0. C'est le seul couple qui distingue « rien à faire »
  // de « rien de fait ».
  const silent = parse(
    { preparations: [prep()], dishes: [dish({})], shopping_list: [] },
    { weighedMemberIds: [ZOE] },
  );
  assertEquals(silent.box_counts.expected, 2);
  assertEquals(silent.box_counts.boxes, 0);
});

Deno.test("⛔ v4 — SANS OBJECTIF, LE FOYER A QUAND MÊME SON CONTENANT", () => {
  // ⚠️ C'EST LE RENVERSEMENT DE v3, ÉCRIT COMME TEL. v3 ne donnait un contenant
  // qu'aux bouches à objectif et laissait « plat commun » aux autres — ce qui ne
  // disait ni combien de bacs remplir dimanche, ni lequel ouvrir jeudi. Un foyer
  // de trois qui se maintient attend UN contenant par repas, pas zéro.
  const meal = parse(
    { preparations: [prep()], dishes: [dish({})], shopping_list: [] },
    { weighedMemberIds: [] },
  );
  assertEquals(meal.box_counts.expected, 1);
});

Deno.test("⛔ v4 — UNE LIGNE ALIMENTAIRE QUE CE PLAT MORD OUVRE UN GROUPE DE PLUS", () => {
  // La partition est celle de CE PLAT-LÀ: c'est le plat qui décide, jamais
  // l'étiquette de la personne. Le poulet mord la ligne végane de Marc, donc le
  // reste se scinde en deux — les omnivores d'un côté, Marc de l'autre.
  const meal = parse(
    { preparations: [prep()], dishes: [dish({})], shopping_list: [] },
    { weighedMemberIds: [], boxMemberDiets: [{ memberId: MARC, regime: "vegan" }] },
  );
  assertEquals(meal.box_counts.expected, 2);
});

Deno.test("⛔ v4 — UN `weighedMemberIds` HORS ROSTER NE GONFLE PAS L'ATTENDU", () => {
  // Deux listes qui décrivent la même table finissent par diverger; ici la
  // divergence ajouterait un groupe fantôme et rendrait un taux de couverture
  // flatteur et faux. Elle est donc ignorée, et elle se dit.
  const meal = parse(
    { preparations: [prep()], dishes: [dish({})], shopping_list: [] },
    { weighedMemberIds: ["someone-else"] },
  );
  assertEquals(meal.box_counts.expected, 1);
  assert(
    meal.issues.some((i) => i.includes("weighed_member_not_in_roster")),
    meal.issues.join("\n"),
  );
});

Deno.test("⛔ LE DÉFAUT N°1 SE COMPTE: un repas qui prélève SANS boîte", () => {
  // ⚠️ LE DÉNOMINATEUR EST LA POPULATION À QUI LA CONSIGNE PROMET UNE BOÎTE: les
  // plats qui prélèvent sur une préparation. Un plan où la moitié des repas n'a
  // rien à sortir du frigo lit `with_box / meals = 1/2`, et c'est très
  // exactement le nombre que le run `76be8ce3` n'avait pas.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      dish({ title: "Boxed", boxes: [box()] }),
      dish({ title: "Bare", slot: "dinner" }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.meals, 2);
  assertEquals(meal.box_counts.with_box, 1);
  assertEquals(meal.dishes.length, 2, "un repas sans boîte reste un repas");
});

Deno.test("⛔ UN PLAT QUI NE PRÉLÈVE RIEN N'EST PAS COMPTÉ, ET SA BOÎTE TOMBE", () => {
  // Le protocole pèse à la SESSION, dans ce qui sort d'une casserole. Un plat
  // cuisiné de zéro le jour même n'a rien été pesé d'avance: lui donner un
  // couvercle enverrait quelqu'un chercher au frigo une boîte que personne n'a
  // remplie. Et l'inclure au dénominateur ferait lire un défaut sur l'état
  // CORRECT — le compteur grossirait sur les plans les plus frais.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      uses: [],
      boxes: [box({ id: "box_ghost", items: [{ preparation_id: null, term: "chicken", grams: 120 }] })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1, "le plat SURVIT");
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.meals, 0);
  assertEquals(meal.box_counts.refused, 1);
  assert(
    meal.issues.some((i) => i.includes("nothing was weighed ahead")),
    meal.issues.join("\n"),
  );
});

Deno.test("un nom INCONNU est jeté, le contenant survit aux autres", () => {
  // ⚠️ LE CONTENANT N'EST PAS PERDU POUR UN NOM FANTÔME. Un bac amputé d'un
  // inconnu reste lisible; le jeter entier retirerait son repas à des bouches
  // réelles pour l'erreur d'une autre.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({
        member_ids: [ZOE, "44444444-4444-4444-8444-444444444444"],
      })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.memberIds, [ZOE]);
  assertEquals(meal.box_counts.boxes, 1);
  assertEquals(meal.box_counts.refused, 0, "le contenant n'est pas refusé");
  assertEquals(meal.box_counts.names_refused, 1);
  assert(
    meal.issues.some((i) => i.includes("is not a mouth of this plan")),
    meal.issues.join("\n"),
  );
});

Deno.test("un contenant SANS aucun nom gardé tombe et est COMPTÉ", () => {
  // ⛔ « SERS-TOI » SE DIT PAR L'ABSENCE DE CONTENANT, jamais par un couvercle
  // anonyme: personne ne sait à qui il est ni s'il faut l'ouvrir.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [box({ id: "box_ghost", member_ids: ["nobody"] })] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.boxes, 0);
  assertEquals(meal.box_counts.with_box, 0);
  assertEquals(meal.box_counts.refused, 1);
  assertEquals(meal.dishes.length, 1, "le plat SURVIT");
});

Deno.test("⛔ v4 — UN CONTENANT SANS RIEN DEDANS TOMBE, ET IL EST COMPTÉ", () => {
  // Un couvercle nommé sur un bac dont on ne sait pas quoi mettre dedans envoie
  // quelqu'un au frigo chercher une boîte que personne n'a remplie. C'est le
  // symétrique exact du couvercle anonyme, et il a son test.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [box({ items: [] })] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.refused, 1);
  assert(
    meal.issues.some((i) => i.includes("nothing to put in it")),
    meal.issues.join("\n"),
  );
});

Deno.test("une boîte SANS ID est jetée et COMPTÉE (deux couvercles anonymes au frigo)", () => {
  // ⚠️ CETTE PORTE-CI A SON TEST À ELLE. Sans identifiant, la ligne n'est plus
  // auditable (`data-box-id`) et deux couvercles ne se distinguent plus. Et sans
  // ce test, retirer son incrément de `refused` ne fait tomber personne.
  const noId = box();
  delete (noId as Record<string, unknown>).id;
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [noId] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.refused, 1);
  assert(meal.issues.some((i) => i.includes("no id")), meal.issues.join("\n"));
});

Deno.test("⛔ LE DÉFAUT N°3: un id DÉJÀ PRIS est jeté — deux couvercles du même nom", () => {
  // « Boîte iku » était sur CINQ boîtes du frigo, et devant la porte ce nom ne
  // décidait rien. L'unicité est ce qui rend un couvercle auditable.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      dish({ title: "First", boxes: [box({ id: "box_dup", member_ids: [ZOE] })] }),
      dish({
        title: "Second",
        slot: "dinner",
        boxes: [box({ id: "box_dup", member_ids: [NINA] })],
      }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.memberIds, [ZOE]);
  assertEquals(meal.dishes[1].boxes, []);
  assertEquals(meal.box_counts.refused, 1);
  assert(meal.issues.some((i) => i.includes("already")), meal.issues.join("\n"));
});

Deno.test("⛔ L'UNICITÉ VAUT AUSSI ENTRE LES CONTENANTS D'UN MÊME REPAS", () => {
  // v4 en produit N par plat: deux d'entre eux peuvent porter le même id sans
  // qu'aucun autre plat n'entre en jeu, et c'est le cas neuf que le pluriel
  // ouvre.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({ id: "box_same", member_ids: [ZOE] }), box({ id: "box_same", member_ids: [NINA] })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes.length, 1);
  assertEquals(meal.box_counts.refused, 1);
});

Deno.test("une bouche DEUX FOIS sur le même couvercle: le second nom tombe", () => {
  // Deux fois le même nom sur un couvercle n'ajoute rien, et laisserait croire à
  // deux parts — ce que v4 existe pour supprimer. On garde le PREMIER et on
  // nomme le doublon.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [box({ member_ids: [ZOE, ZOE] })] })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.memberIds, [ZOE]);
  assertEquals(meal.box_counts.names_refused, 1);
  assert(meal.issues.some((i) => i.includes("on this lid twice")), meal.issues.join("\n"));
});

Deno.test("des grammes illisibles ou nuls font tomber le COMPOSANT, jamais le plat", () => {
  for (const grams of [0, -50, "beaucoup", null]) {
    const meal = parse({
      preparations: [prep()],
      dishes: [dish({
        boxes: [box({
          id: "box_x",
          items: [{ preparation_id: "prep_chicken", term: "chicken", grams }],
        })],
      })],
      shopping_list: [],
    });
    // Seul composant du contenant: il tombe, donc le contenant n'a plus rien à
    // contenir et tombe à son tour. Le PLAT, lui, ne bouge pas.
    assertEquals(meal.dishes[0].boxes, [], String(grams));
    assertEquals(meal.box_counts.items_refused, 1, String(grams));
    assertEquals(meal.dishes.length, 1, String(grams));
  }
});

Deno.test("⛔ v4 — UN COMPOSANT SANS ÉTIQUETTE TOMBE: « 300 g » ne se sert pas", () => {
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({
        items: [
          { preparation_id: "prep_chicken", term: "", grams: 300 },
          { preparation_id: "prep_chicken", term: "roast chicken", grams: 200 },
        ],
      })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.items.length, 1);
  assertEquals(meal.box_counts.items_refused, 1);
  assert(meal.issues.some((i) => i.includes("names no food")), meal.issues.join("\n"));
});

Deno.test("⛔ v4 — UN `preparation_id` QUI NE DÉSIGNE AUCUNE CASSEROLE DU PLAN TOMBE", () => {
  // ⚠️ ET IL NE SE REPLIE PAS SUR `null`. `null` DIT « ajouté frais le jour
  // même », ce qui est une AFFIRMATION: la transformer en repli ferait passer
  // une jointure morte pour du pain acheté le matin. Patron
  // `dishes[].uses[].preparation_id`, mot pour mot.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({
        items: [
          { preparation_id: "prep_ghost", term: "mystery", grams: 300 },
          { preparation_id: null, term: "wholemeal bread", grams: 60 },
        ],
      })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.items, [
    { preparationId: null, term: "wholemeal bread", grams: 60 },
  ]);
  assertEquals(meal.box_counts.items_refused, 1);
  assert(
    meal.issues.some((i) => i.includes("is not a preparation of this")),
    meal.issues.join("\n"),
  );
});

Deno.test("le plafond d'un COMPOSANT ÉCRÊTE et se nomme, il ne jette pas", () => {
  // Le plafond est lu depuis la constante, mais la MUTATION est vérifiable: le
  // test appelle avec `BOX_MAX_GRAMS + 500`, donc changer la constante déplace
  // l'entrée ET la sortie ensemble — c'est le point du `assertEquals` sur
  // `BOX_MAX_GRAMS` lui-même, écrit en littéral juste en dessous.
  assertEquals(BOX_MAX_GRAMS, 2000);
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({
        id: "box_huge",
        items: [{ preparation_id: "prep_chicken", term: "chicken", grams: 2500 }],
      })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes[0]?.items[0].grams, 2000);
  assertEquals(meal.box_counts.refused, 0);
  assertEquals(meal.box_counts.capped, 1);
  assert(meal.issues.some((i) => i.includes("gram ceiling")), meal.issues.join("\n"));
});

Deno.test("⚠️ IL EST PAR COMPOSANT, PAS PAR CONTENANT: trois items peuvent peser 3 × le plafond", () => {
  // Le plafond borne « un aliment, une fois, pour un repas ». Un bac commun à
  // quatre noms qui pèse 4 500 g n'est pas une hallucination d'unité — c'est un
  // repas pour quatre. Ce qui borne le contenant est la RÉCONCILIATION.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [box({
        member_ids: [ZOE, NINA, MARC],
        items: [
          { preparation_id: "prep_chicken", term: "chicken", grams: 1500 },
          { preparation_id: "prep_chicken", term: "rice", grams: 1500 },
          { preparation_id: null, term: "bread", grams: 1500 },
        ],
      })],
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.capped, 0);
  assertEquals(meal.dishes[0].boxes[0]?.items.length, 3);
});

Deno.test("LANE INDIVIDUELLE: aucune bouche, donc aucune boîte, et rien de perdu", () => {
  const meal = parse(
    {
      preparations: [prep()],
      dishes: [dish({ boxes: [box({ id: "box_me", member_ids: [ZOE] })] })],
      shopping_list: [],
    },
    { boxMemberIds: [], weighedMemberIds: [] },
  );
  assertEquals(meal.preparations.length, 1);
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.refused, 1);
  // ⚠️ ET L'ATTENDU EST ZÉRO: sans roster, il n'y a aucun groupe à former. C'est
  // une affirmation, pas un compteur muet.
  assertEquals(meal.box_counts.expected, 0);
});

Deno.test("⛔ LANE INDIVIDUELLE: aucune issue de TABLE ne sonne pour quelqu'un qui vit seul", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT MESURÉ LE 2026-08-23, SUR SEPT PLANS SOLO SUR SEPT.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mouthsFedByDish` était appelée INCONDITIONNELLEMENT, et la garde
  // `if (boxMembers.size > 0)` se refermait AVANT les deux boucles d'issues.
  // Avec le roster vide de la lane individuelle, aucun plat de table ne
  // « nourrit » personne — puisqu'il n'y a personne au roster — et chaque plat
  // partait donc en issue:
  //
  //     « sun/dinner: the table's dish feeds nobody -- every mouth has a dish
  //       of its own »
  //
  // Jusqu'à SEPT fois par plan, pour un compte à UNE bouche. Le message décrit
  // une table qui n'existe pas, et il noyait la liste là où elle porte de
  // vraies alertes.
  //
  // ⚠️ C'est la porte que `boxDeliveryState` avait déjà (`roster: 0 =>
  // "not_asked"`), et qui manquait ici — en silence, parce qu'une issue de plus
  // ne fait rien échouer.
  const meal = parse(
    {
      preparations: [prep()],
      // Trois plats de TABLE (`member_id` absent) qui prélèvent sur la
      // préparation: exactement la forme d'un plan individuel en batch cooking,
      // et exactement ce qui déclenchait trois issues.
      dishes: [dish({}), dish({ day: "mon" }), dish({ day: "tue" })],
      shopping_list: [],
    },
    { boxMemberIds: [], weighedMemberIds: [] },
  );
  assertEquals(
    meal.issues.filter((i) => i.includes("feeds nobody")),
    [],
  );
  assertEquals(
    meal.issues.filter((i) => i.includes("not on the box roster")),
    [],
  );
});

Deno.test("⛔ LA VARIÉTÉ SE COMPTE SUR L'ANCRE, PAS SUR LE NOM — et le lot est PLIÉ", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT MESURÉ: `plan-S4` (2026-08-23) affichait SEPT plats distincts sur
  // sept, et du tofu dans les sept. Un compteur sur les NOMS dit toujours oui.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ ET LA PROTÉINE EST DANS LA PRÉPARATION, pas dans le plat: les trois
  // plats ci-dessous ne portent que du riz, et c'est le poulet du LOT qui les
  // ancre. Compter les seuls `dish.ingredients` rendrait `distinct: 0` sur un
  // plan qui tourne pourtant sur une seule ancre — le contraire de la mesure.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({}), dish({ day: "mon" }), dish({ day: "wed" })],
    shopping_list: [],
  });
  assertEquals(meal.protein_sources.dishes, 3);
  // Une seule ancre — `poultry`, via les cuisses de poulet de la préparation.
  assertEquals(meal.protein_sources.distinct, 1);
  // ⛔ ET LE TROISIÈME NOMBRE: les trois plats la portent. Sans lui,
  // `distinct: 1` couvrirait aussi « un seul plat protéiné, les autres sans
  // rien » — deux plans opposés sous le même chiffre.
  assertEquals(meal.protein_sources.dishes_with, 3);
});

Deno.test("⚠️ LE CAS QUI VARIE — deux ancres distinctes se comptent deux", () => {
  // ⛔ SANS CE CAS, `distinct: 1` serait une constante déguisée en mesure.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      dish({}),
      dish({
        day: "mon",
        uses: [],
        ingredients: [
          { term: "lentils", quantity: "100 g", amount: 100, unit: "g", state: "raw" },
        ],
      }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.protein_sources.distinct, 2);
  assertEquals(meal.protein_sources.dishes_with, 2);
});

Deno.test("⛔ LES CASES SANS CONTENANT SE COMPTENT — `mouth_slots` les exclut, le plan les nomme", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TROU MESURÉ LE 2026-08-23, SUR UN PLAN FOYER RÉEL À TROIS BOUCHES.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sept plats, dont deux petits-déjeuners assemblés le jour même — donc sans
  // contenant, ce qui est le CONTRAT (« A dish that cooks from scratch on the
  // day has no boxes »). Les six parts correspondantes (2 cases × 3 bouches)
  // étaient hors dénominateur: le plan rendait `mouths_unboxed: 2` et
  // `delivery: "served"`, et rien ne disait que deux repas sur sept n'étaient
  // dimensionnés pour personne.
  //
  // ⚠️ CE N'EST PAS UN DÉFAUT, C'EST UNE ABSTENTION. Aucune `issue` n'est
  // poussée; les deux nombres se posent à côté de `mouth_slots` pour qu'un
  // lecteur voie ce que le protocole des contenants gouverne, et ce qu'il ne
  // gouverne pas.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      // Une case BOÎTÉE: le plat prélève sur la fournée et porte son bac.
      dish({ boxes: [box({ id: "box_lunch", member_ids: [ZOE, NINA, MARC] })] }),
      // Deux cases SANS contenant: rien n'a été pesé d'avance pour elles.
      dish({ day: "mon", slot: "breakfast", uses: [], boxes: [] }),
      dish({ day: "tue", slot: "breakfast", uses: [], boxes: [] }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.cells_no_box, 2);
  // Trois bouches au roster ⇒ six noms que la fenêtre ne place nulle part.
  assertEquals(meal.box_counts.mouths_no_box_cell, 6);
  // ⚠️ ET LES COMPTEURS D'AVANT NE BOUGENT PAS D'UN CHIFFRE: une seule case
  // porte un contenant, donc `mouth_slots` vaut 3 et personne n'y est oublié.
  assertEquals(meal.box_counts.mouth_slots, 3);
  assertEquals(meal.box_counts.mouths_unboxed, 0);
  // ⚠️ AUCUNE ISSUE: un petit-déjeuner assemblé le matin est le cas nominal.
  assertEquals(meal.issues.filter((i) => i.includes("no box at that meal")), []);
});

Deno.test("⚠️ LE CAS QUI REND ZÉRO — toutes les cases portent un contenant", () => {
  // ⛔ SANS CE CAS, UN COMPTEUR COINCÉ SUR UN NOMBRE POSITIF PASSERAIT POUR UNE
  // MESURE. Le zéro doit être atteignable, et il doit vouloir dire « la fenêtre
  // entière est gouvernée par le protocole ».
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({ boxes: [box({ id: "box_lunch", member_ids: [ZOE, NINA, MARC] })] })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.cells_no_box, 0);
  assertEquals(meal.box_counts.mouths_no_box_cell, 0);
});

Deno.test("⚠️ LE CAS QUI SONNE reste au module: roster VIDE ⇒ tout plat de table y tombe", () => {
  // ⛔ POURQUOI LA GARDE EST CHEZ L'APPELANT ET PAS DANS LE MODULE.
  //
  // `mouthsFedByDish` est PURE et elle a raison: sans personne au roster,
  // aucun plat commun ne nourrit qui que ce soit, et elle le dit. C'est le
  // CALCUL qui est juste; c'est la LECTURE qui était fausse — la lane
  // individuelle passe un roster vide EXPRÈS (« le protocole des contenants
  // n'existe que pour départager deux bouches »), donc chez elle ce constat ne
  // décrit rien, et il ne doit pas devenir une issue.
  //
  // Ce test fixe les deux moitiés au même endroit: le module continue de
  // signaler, l'appelant cesse de le répéter à quelqu'un qui vit seul. Le cas
  // qui SONNE pour de vrai — plusieurs bouches, chacune son plat dédié — est
  // couvert par `box_expected_test.ts` (`sharedFedNobody: ["mon/lunch"]`), sur
  // le module et avec un roster peuplé.
  const out = mouthsFedByDish(
    [{ day: "tue", slot: "lunch", memberId: null, boxable: true }],
    new Set<string>(),
  );
  assertEquals(out.sharedFedNobody, ["tue/lunch"]);
});

// ---------------------------------------------------------------------------
// 1bis — LE REPLI v2: AUCUN PLAN DÉJÀ ÉCRIT NE PERD SES GRAMMES
// ---------------------------------------------------------------------------

Deno.test("⛔ v4 — UN `box` SINGULIER v2 EST RELU COMME UN BAC COMMUN, ET COMPTÉ", () => {
  // ⛔ SANS CE REPLI, CE LOT RENDRAIT ZÉRO CONTENANT SUR TOUTE LA POPULATION
  // tant que le prompt n'est pas passé en v4 — et on lirait « le modèle
  // n'obéit pas » en ayant corrigé la mauvaise moitié.
  //
  // ⚠️ IL N'INVENTE AUCUNE VENTILATION. v2 portait une part PAR PERSONNE et
  // aucun découpage par composant: la seule chose vraie qu'on puisse en tirer
  // est la SOMME, et une somme sur un bac partagé est exactement ce que v4
  // appelle une quantité de bac. Un `item` fabriqué porterait un `term` que
  // personne n'a écrit.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      box: {
        id: "box_tue_lunch",
        shares: [{ member_id: ZOE, grams: 120 }, { member_id: NINA, grams: 200 }],
      },
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes, [{
    id: "box_tue_lunch",
    memberIds: [ZOE, NINA],
    items: [],
    legacyTotalGrams: 320,
  }]);
  // ⛔ LE COMPTEUR QUI DOIT TOMBER À ZÉRO UNE FOIS LE PROMPT PASSÉ EN v4. Sans
  // lui, un repli devenu le chemin nominal ne se voit par aucun autre nombre.
  assertEquals(meal.box_counts.legacy_folded, 1);
  assertEquals(meal.box_counts.items, 0);
  assertEquals(meal.box_counts.names, 2);
});

Deno.test("⛔ v4 — `boxes` GAGNE DÈS QU'ELLE EST UN TABLEAU, MÊME VIDE", () => {
  // Un modèle passé en v4 qui n'écrit aucun contenant sur ce plat a DIT quelque
  // chose. Aller chercher un `box` v2 derrière lui ferait remonter une forme
  // qu'il n'a pas voulue — et le repli deviendrait le chemin nominal sans que
  // rien ne le dise.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [],
      box: { id: "box_old", shares: [{ member_id: ZOE, grams: 120 }] },
    })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].boxes, []);
  assertEquals(meal.box_counts.legacy_folded, 0);
  assertEquals(meal.box_counts.refused, 0, "rien n'a été déclaré, donc rien n'est refusé");
});

// ---------------------------------------------------------------------------
// 2 — LA RÉCONCILIATION: LA PART D'UNE CASSEROLE, À TRAVERS SES REPAS
// ---------------------------------------------------------------------------

Deno.test("`preparationReadyGrams` convertit dans LES DEUX SENS", () => {
  // 1 000 g de poulet cru ⇒ 700 g prêt; 100 g de riz cru ⇒ 260 g prêt. Les deux
  // facteurs sont écrits en littéral ici ET lus depuis `YIELD_FACTORS` pour que
  // muter la table fasse tomber le test.
  assertEquals(YIELD_FACTORS.meat_shrinks, 0.7);
  assertEquals(YIELD_FACTORS.grain_absorbs, 2.6);
  const grams = preparationReadyGrams(
    [
      { term: "chicken", quantity: null, in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000, group: null, quantitySource: null },
      { term: "rice", quantity: null, in_pantry: false, amount: 100, unit: "g", state: "raw", gramsRaw: 100, group: null, quantitySource: null },
    ],
    INDEX,
  );
  assertEquals(grams, 960);
});

Deno.test("un ingrédient non pesable rend la production INVÉRIFIABLE, jamais fausse", () => {
  // ⛔ LE SENS DE L'ERREUR EST TOUJOURS LE MÊME: une production reconstruite sur
  // la moitié des lignes est trop basse, donc toute somme la dépasserait. On
  // s'abstient plutôt que d'accuser.
  assertEquals(
    preparationReadyGrams(
      [
        { term: "chicken", quantity: null, in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000, group: null, quantitySource: null },
        { term: "parsley", quantity: "a bunch", in_pantry: false, amount: null, unit: null, state: null, gramsRaw: null, group: null, quantitySource: null },
      ],
      INDEX,
    ),
    null,
  );
  assertEquals(preparationReadyGrams([], INDEX), null, "aucune ligne, rien à mesurer");
  assertEquals(
    preparationReadyGrams(
      [{ term: "chicken", quantity: null, in_pantry: false, amount: 100, unit: "g", state: "raw", gramsRaw: 100, group: null, quantitySource: null }],
      null,
    ),
    null,
    "référentiel absent",
  );
});

Deno.test("une somme SOUS la production ne dit rien (LE CAS QUI PASSE)", () => {
  // 1 000 g crus ⇒ 700 g prêts. Un seul repas en tire 620 g.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      box: {
        id: "box_tue_lunch",
        shares: [
          { member_id: ZOE, grams: 120 },
          { member_id: NINA, grams: 200 },
          { member_id: MARC, grams: 300 },
        ],
      },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_checked, 1);
  assertEquals(meal.box_counts.sum_over, 0);
  assertEquals(meal.box_counts.sum_unverifiable, 0);
  assertEquals(meal.issues.filter((i) => i.includes("cannot all be filled")), []);
});

Deno.test("⛔ LA SOMME SE FAIT À TRAVERS LES REPAS, ET C'EST LE LOT", () => {
  // ⚠️ LE DÉFAUT N°2 SE MESURE ICI. `box_prep_chicken_iku`, 140 g, servait
  // `wed/lunch`, `thu/lunch` ET `thu/dinner`: soit c'était une portion et il en
  // fallait trois, soit c'était sa part de la fournée et 140 g ne suffisaient
  // pas. Les deux lectures étaient fausses, et rien ne les distinguait.
  //
  // Un contenant par repas ferme la question — et la vérification devient « ce
  // que TOUS les repas tirent de cette casserole tient-il dedans ». Trois repas
  // de 300 g sur une casserole de 700 g prêts (plafond 770) ⇒ 900 g demandés.
  const boxed = (id: string, day: string, slot: string) =>
    dish({
      title: `Meal ${id}`,
      day,
      slot,
      box: { id, shares: [{ member_id: ZOE, grams: 300 }] },
    });
  const meal = parse({
    preparations: [prep()],
    dishes: [
      boxed("box_1", "mon", "lunch"),
      boxed("box_2", "tue", "lunch"),
      boxed("box_3", "wed", "lunch"),
    ],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_checked, 1);
  assertEquals(meal.box_counts.sum_over, 1);
  assertEquals(meal.dishes.length, 3, "les trois repas RESTENT");
  assert(
    meal.issues.some((i) =>
      i.includes("the meals that take from") && i.includes("cannot all be filled")
    ),
    meal.issues.join("\n"),
  );

  // ⛔ ET LE CAS QUI PASSE, SUR LA MÊME MATIÈRE: deux repas au lieu de trois, et
  // la casserole suffit. Sans cette moitié, une réconciliation qui accuserait
  // TOUJOURS lirait pareil.
  const fits = parse({
    preparations: [prep()],
    dishes: [boxed("box_1", "mon", "lunch"), boxed("box_2", "tue", "lunch")],
    shopping_list: [],
  });
  assertEquals(fits.box_counts.sum_over, 0);
});

Deno.test("⛔ UNE BOÎTE QUI MÉLANGE DEUX CASSEROLES EST RÉPARTIE AU PRORATA", () => {
  // ⚠️ C'EST LA DIFFICULTÉ DE L'UNITÉ « UN CONTENANT PAR REPAS ». Le repas tire
  // du poulet (700 g prêts) et du riz (260 g prêts); sa boîte porte UN total.
  // On rend à chaque casserole la part qui vient d'elle, au prorata de ce que la
  // reprise tire — sans quoi la petite casserole serait toujours accusée.
  //
  // 900 g dans la boîte: 900 × 700/960 = 656 g au poulet (plafond 770 ⇒ passe),
  // 900 × 260/960 = 244 g au riz (plafond 286 ⇒ passe). Un partage naïf
  // (moitié-moitié) aurait mis 450 g sur un riz qui n'en produit que 260.
  const meal = parse({
    preparations: [
      prep(),
      prep({
        id: "prep_rice",
        title: "Rice batch",
        ingredients: [
          { term: "rice", quantity: "100 g", amount: 100, unit: "g", state: "raw" },
        ],
      }),
    ],
    dishes: [dish({
      uses: [
        { preparation_id: "prep_chicken", servings: 1 },
        { preparation_id: "prep_rice", servings: 1 },
      ],
      box: { id: "box_tue_lunch", shares: [{ member_id: ZOE, grams: 900 }] },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_checked, 2);
  assertEquals(meal.box_counts.sum_over, 0, meal.issues.join("\n"));
});

Deno.test("⛔ UN REPAS DONT UNE CASSEROLE EST INCONNUE NE SE RÉPARTIT PAS", () => {
  // ⚠️ ON S'ABSTIENT DÈS QU'UN MORCEAU MANQUE, et c'est le patron des trois cas
  // de `gramsRaw`: attribuer le total de la boîte aux seules casseroles connues
  // les ferait déborder, et on fabriquerait une `issue` nommée sur un plan qui a
  // RAISON. Les deux passent en `sum_unverifiable`, jamais en `sum_over`.
  const meal = parse({
    preparations: [
      prep(),
      prep({
        id: "prep_soup",
        title: "Soup",
        ingredients: [{ term: "parsley", quantity: "a bunch" }],
      }),
    ],
    dishes: [dish({
      uses: [
        { preparation_id: "prep_chicken", servings: 1 },
        { preparation_id: "prep_soup", servings: 1 },
      ],
      box: { id: "box_tue_lunch", shares: [{ member_id: ZOE, grams: 5000 }] },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.sum_over, 0);
  assertEquals(meal.box_counts.sum_unverifiable, 2);
  assertEquals(meal.box_counts.sum_checked, 0);
});

Deno.test("la TOLÉRANCE existe et elle est bornée par sa propre constante", () => {
  // ⚠️ LE TEST N'EST PAS PARAMÉTRÉ PAR LA CONSTANTE: la valeur attendue est un
  // littéral, et le cas de bord est calculé À PARTIR d'elle. Muter la constante
  // fait tomber la première ligne; muter la comparaison fait tomber la seconde.
  assertEquals(BOX_SUM_TOLERANCE_RATIO, 1.1);
  // 700 g prêts × 1,1 = 770. 760 passe, 780 non.
  for (const [grams, over] of [[760, 0], [780, 1]] as const) {
    const meal = parse({
      preparations: [prep()],
      dishes: [dish({
        box: { id: "b1", shares: [{ member_id: ZOE, grams }] },
      })],
      shopping_list: [],
    });
    assertEquals(meal.box_counts.sum_over, over, `${grams} g`);
  }
});

Deno.test("sans référentiel, la somme est INVÉRIFIABLE et jamais « trop »", () => {
  const meal = parse(
    {
      preparations: [prep()],
      dishes: [dish({
        box: { id: "b1", shares: [{ member_id: ZOE, grams: 5000 }] },
      })],
      shopping_list: [],
    },
    { composition: null },
  );
  assertEquals(meal.box_counts.sum_checked, 0);
  assertEquals(meal.box_counts.sum_over, 0);
  assertEquals(meal.box_counts.sum_unverifiable, 1);
});

Deno.test("PROPRIÉTÉ: une casserole qu'aucun repas ne met en boîte n'entre dans aucun des trois", () => {
  // Il n'y a rien à réconcilier: ni « vérifié », ni « invérifiable ». La
  // compter d'un côté ou de l'autre ferait lire un fait là où il n'y en a pas.
  const meal = parse({
    preparations: [prep(), prep({ id: "prep_plain", title: "Plain" })],
    dishes: [dish({
      box: { id: "b1", shares: [{ member_id: ZOE, grams: 200 }] },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.preparations, 2);
  assertEquals(meal.box_counts.sum_checked, 1);
  assertEquals(meal.box_counts.sum_unverifiable, 0);
});

// ---------------------------------------------------------------------------
// 3 — LES JETONS ET LES VERSIONS
// ---------------------------------------------------------------------------

Deno.test("le TRONC demande une quantité pesée ou dénombrable, à toutes les lanes", () => {
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

Deno.test("l'id de boîte est un JETON déclaré, et la jointure d'hier a DISPARU", () => {
  const joined = MEAL_TOKEN_FIELDS.join("\n");
  // ⚠️ AU PLURIEL DEPUIS v4: le repas porte N contenants, donc le jeton vit
  // sous `boxes[]`. Un `dishes[].box.id` resté ici pointerait une clé que le
  // parseur ne lit plus qu'en repli.
  assert(joined.includes("dishes[].boxes[].id"), joined);
  // ⛔ LES DEUX ENTRÉES D'HIER SONT PARTIES, ET C'EST LE LOT: plus rien ne cite
  // une boîte, donc il n'y a plus deux jointures à tenir d'accord.
  assertEquals(joined.includes("preparations[].boxes[].id"), false, joined);
  assertEquals(joined.includes("uses[].box_id"), false, joined);
});

Deno.test("les deux axes de version ont bougé, chacun pour SA population", () => {
  // ⚠️ 2026-08-19 — LA BOÎTE APPARTIENT AU REPAS. Le TRONC bumpe parce que la
  // ligne des jetons change pour les quatre populations (deux entrées en
  // sortent, une y entre). L'ENVELOPPE FOYER bumpe parce que le schéma ET la
  // consigne changent ensemble, pour les foyers d'au moins deux bouches. Deux
  // portées, deux axes — précédent exact: v14 (2026-08-17).
  // ⚠️ 2026-08-20 — UN CONTENANT PAR GROUPE. Le TRONC rebumpe parce que le jeton
  // de boîte passe au pluriel pour les quatre populations; l'ENVELOPPE FOYER
  // rebumpe parce que le schéma ET la consigne changent ensemble, et parce que
  // sa POPULATION s'élargit (un foyer sans objectif reçoit désormais le bloc).
  // ⚠️ v20 (2026-09-01) — LA PART CONGELÉE A UNE CLÉ.
  // Population qui voit une consigne différente: TOUT LE MONDE. Le schéma
  // gagne `dishes[].uses[].kept` et le bloc de conservation gagne le
  // paragraphe qui dit par quel CHAMP se déclare la troisième sortie. Les deux
  // vivent dans le tronc. Un modèle qui n'écrit jamais le champ produit
  // exactement le plan de v19 — le non-dit vaut `"fridge"`, le strict.
  // ⚠️ v21 (2026-09-01) — LES JOURS HORS DE PORTÉE D'UN LOT SONT NOMMÉS, et la
  // session seule a le droit de déborder en le disant. Population: les fenêtres
  // qui portent une journée qu'aucun lot n'atteint. Un plan sans tension rend
  // v20 au caractère près, et un test le tient.
  // ⚠️ v25 (2026-09-03) — LA VEILLE EST DÉRIVÉE, PLUS COCHÉE (P1, A1).
  // La CONSIGNE n'a pas changé d'un caractère: `cookOnlyDay` existait déjà.
  // Ce qui change est la POPULATION qui la reçoit — jusqu'ici les seuls plans
  // qui portaient un jour de cuisine sans repas étaient ceux dont quelqu'un
  // avait coché une case; ils le portent désormais par défaut, dès que le
  // calendrier et l'heure le permettent. Comparer les plans d'avant et d'après
  // sous un même millésime rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
  // ⚠️ D3′-c (2026-08-23) — `v22_precedence_in_tail`, ET LE BUMP EST EN RETARD
  // D'UN JOUR. `D3′` (2026-08-22 18:51) a réécrit le bloc d'arbitrage de la lane
  // foyer — passé en QUEUE du message, rang 1 qui NOMME ses trois blocs de
  // verrou au lieu de dire « at the VERY TOP » — et n'a pas touché ce jeton. Les
  // quatre épinglages de cette valeur sont restés VERTS: ils tiennent le jeton,
  // aucun ne le reliait au TEXTE. C'est ce que `precedence_binding_test.ts`
  // ferme. Population concernée: tous les foyers. Le TRONC ne bouge pas — le
  // texte de la lane SOLO a survécu octet pour octet, mesuré sur 243 prompts
  // archivés.
  // ⚠️ v23 (2026-09-03, D6.2) — LA GAMELLE A UNE CONSIGNE. Population qui
  // voit une consigne différente: les foyers où au moins une bouche emporte
  // son déjeuner de semaine. Ailleurs, l'enveloppe est celle de v22 au
  // caractère près, et un test le tient.
  // ⟳ v26 (2026-09-04) — LE PLAN DIT CE QU'IL A PESÉ. L'enveloppe FOYER gagne
  // deux blocs — `EXPLANATION_SCHEMA_BLOCK` côté système, `DECIDED BEFORE YOU`
  // côté message — et le TRONC ne bouge pas d'un octet: la clé `explanation`
  // n'existe que sur cette lane, et la demander au solo serait une consigne sur
  // du vide. Trois populations à distinguer, pas deux: v25, v26 sans les faits
  // (message byte-identique à v25), v26 avec.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v28_the_table_keeps_its_meat");
});

// ---------------------------------------------------------------------------
// 4 — LA PERSISTANCE
// ---------------------------------------------------------------------------

Deno.test("`boxes` s'écrit MÊME VIDE, et elle a quitté les préparations", () => {
  // ⛔ UNE CLÉ ABSENTE NE SE DISTINGUE PAS D'UN LOT DÉBRANCHÉ. C'est la posture
  // de `member_id` et de `member_deltas`, et ce dépôt la paie en boucle quand il
  // l'oublie.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish()],
    shopping_list: [],
  });
  const dishes = mealDishesPayload(meal);
  assert("boxes" in dishes[0], Object.keys(dishes[0]).join(","));
  assertEquals(dishes[0].boxes, []);
  // ⛔ ET LA REPRISE NE PORTE PLUS DE `box_id`: elle dit d'où vient le lot, et
  // c'est tout ce qu'elle a jamais eu à dire.
  //
  // ⟳ 2026-09-01 — `kept` REJOINT LA LISTE, ET CE TEST EST LA GARDE QUI L'A
  // EXIGÉ. La reprise dit maintenant AUSSI comment la part a attendu, parce
  // que la fenêtre du cuit en dépend. Elle s'écrit MÊME à `"fridge"`, comme
  // `boxes: []` deux lignes plus haut: une clé absente ne se distingue pas
  // d'un lot débranché.
  const uses = dishes[0].uses as Array<Record<string, unknown>>;
  assertEquals(Object.keys(uses[0]).sort(), ["kept", "preparation_id", "servings"]);
  assertEquals(uses[0].kept, "fridge");
  // ⛔ ET LA PRÉPARATION N'ÉCRIT PLUS DE `boxes`: une clé vide que plus personne
  // ne remplit se lirait comme un lot débranché, ce qui est l'inverse du vrai.
  // ⚠️ LE NOM EST LE MÊME QUE CELUI DU PLAT DEPUIS v4, ET C'EST PRÉCISÉMENT
  // POURQUOI CE TEST RESTE: deux clés homonymes à deux étages, dont une seule
  // doit exister.
  assertEquals("boxes" in mealPreparationsPayload(meal)[0], false);
});

Deno.test("le payload rend les contenants en clés ASCII snake_case", () => {
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [{
        id: "box_tue_lunch",
        member_ids: [ZOE, NINA],
        items: [
          { preparation_id: "prep_chicken", term: "roast chicken", grams: 320 },
          { preparation_id: null, term: "wholemeal bread", grams: 60 },
        ],
      }],
    })],
    shopping_list: [],
  });
  assertEquals(mealDishesPayload(meal)[0].boxes, [{
    id: "box_tue_lunch",
    member_ids: [ZOE, NINA],
    items: [
      { preparation_id: "prep_chicken", term: "roast chicken", grams: 320 },
      // ⚠️ `null` SORT TEL QUEL, et c'est une AFFIRMATION: ce composant est
      // ajouté frais le jour même, donc aucune fournée ne le tient.
      { preparation_id: null, term: "wholemeal bread", grams: 60 },
    ],
    // ⚠️ `null` SUR TOUT CONTENANT v4: le total se dérive des `items`. Deux
    // nombres qui doivent s'accorder finissent par diverger.
    legacy_total_grams: null,
  }]);
});

Deno.test("⛔ v4 — LE PAYLOAD D'UN `box` v2 RELU GARDE SA SOMME, PAS DES ITEMS INVENTÉS", () => {
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      box: {
        id: "box_tue_lunch",
        shares: [{ member_id: ZOE, grams: 120 }, { member_id: NINA, grams: 200 }],
      },
    })],
    shopping_list: [],
  });
  assertEquals(mealDishesPayload(meal)[0].boxes, [{
    id: "box_tue_lunch",
    member_ids: [ZOE, NINA],
    items: [],
    legacy_total_grams: 320,
  }]);
});

// ---------------------------------------------------------------------------
// 5 — LE PLAFOND DE PLATS ET LE VERROU DE SORTIE
// ---------------------------------------------------------------------------

Deno.test("le compteur des boîtes suit le PLAFOND de plats", () => {
  // ⚠️ « Un compteur dont le numérateur et le dénominateur ne comptent pas les
  // mêmes lignes est un compteur qui ment. » `scope: "day"` + un rythme d'un
  // moment donne un plafond de 1: le second plat tombe, et sa boîte avec.
  //
  // ⚠️ LES DEUX PLATS NE PORTENT PAS LA MÊME CHOSE, ET C'EST OBLIGATOIRE POUR
  // QUE LE TEST MORDE: le plat gardé n'a pas de boîte, l'évincé en a une. Un
  // décalage d'un cran attribuerait la boîte du mort au vivant.
  const meal = parse(
    {
      preparations: [prep()],
      dishes: [
        // ⚠️ SANS MOMENT: rang 2, le PLUS jetable. C'est ce qui force le
        // `splice` d'un plat DÉJÀ GARDÉ — le seul chemin où un tableau
        // parallèle peut se décaler.
        dish({
          title: "Boxed",
          day: null,
          slot: null,
          box: { id: "box_ok", shares: [{ member_id: ZOE, grams: 120 }] },
        }),
        dish({ title: "Silent", day: null, slot: "lunch" }),
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
  assertEquals(meal.dishes[0].title, "Silent");
  assertEquals(meal.box_counts.meals, 1);
  assertEquals(
    meal.box_counts.with_box,
    0,
    "la boîte du plat ÉVINCÉ a été attribuée au plat gardé",
  );
  assertEquals(meal.box_counts.boxes, 0);
});

Deno.test("le VERROU DE SORTIE vide le plan ET remet les compteurs à zéro", () => {
  // Annoncer « 1 repas, 2 parts » sur une ligne qui n'en porte plus aucune
  // serait un chiffre faux sur une ligne réelle.
  const meal = parse(
    {
      preparations: [prep()],
      dishes: [dish({
        title: "Peanut noodles",
        ingredients: [{ term: "peanut butter", quantity: "2 tbsp" }],
        box: { id: "b1", shares: [{ member_id: ZOE, grams: 120 }] },
      })],
      shopping_list: [],
    },
    {
      safetyConstraints: [PEANUT],
    },
  );
  assertEquals(meal.preparations.length, 0);
  assertEquals(meal.box_counts, {
    meals: 0,
    with_box: 0,
    boxes: 0,
    expected: 0,
    // ⟳ LOT `L6′-b` — LE NOM DU ZÉRO, et ici c'est le TROISIÈME: le verrou de
    // sortie a vidé le plan. ⛔ Lire `no_batch_cooking` sur cette ligne dirait
    // « ce foyer ne cuisine rien d'avance » alors qu'il a proposé un plat qu'on
    // a retiré — exactement le chiffre faux sur une ligne réelle que la garde
    // `clean` existe pour éviter.
    delivery: "plan_emptied",
    refused: 0,
    names: 0,
    names_refused: 0,
    items: 0,
    items_refused: 0,
    capped: 0,
    legacy_folded: 0,
    preparations: 0,
    sum_checked: 0,
    sum_over: 0,
    sum_unverifiable: 0,
    mouth_slots: 0,
    mouths_unboxed: 0,
    mouths_double: 0,
    // ⟳ LOT `L26-0` — CE QUE LE MODÈLE A RENDU, à côté de ce que le plan porte.
    mouths_double_model: 0,
    // ⛔ LA POPULATION QUE `mouth_slots` EXCLUT (2026-08-23). Ici le plan est
    // VIDE: il n'y a aucune case, donc rien à exclure — le zéro dit « la
    // question ne se pose pas », pas « tout est couvert ».
    cells_no_box: 0,
    mouths_no_box_cell: 0,
  });
  assertEquals(meal.unquantified_dish_ingredients, { ingredients: 0, unquantified: 0 });
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
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1);
  assert(brief.includes("WEIGH IT ONCE, INTO BOXES NAMED BY MEAL."), brief);
  assert(brief.includes("Zoé, Nina"), brief);
  // ⛔ ET LES DEUX GRAMMES SONT DITS, C'EST TOUTE LA SPEC v4: un seul nom ⇒ une
  // PRESCRIPTION qu'on ouvre et qu'on mange; plusieurs noms ⇒ une QUANTITÉ DE
  // BAC qui ne vise personne. Sans ces deux phrases, un bac partagé se relit
  // comme une somme de parts, c'est-à-dire la balance de retour au service.
  assert(brief.includes("When ONE name is on the lid, its grams are that person's portion"), brief);
  assert(brief.includes("how much goes IN the tub for"), brief);
  // ⛔ ET LA PHRASE DE v3 A DISPARU, MOT POUR MOT. Elle ordonnait au modèle le
  // même chiffre ordinaire pour tout le monde, et elle n'a plus d'objet dès lors
  // que le commun est un bac et non une somme de parts.
  assertEquals(brief.includes("SAME ordinary figure"), false, brief);
  assertEquals(brief.includes("one plate's worth"), false, brief);
});

Deno.test("⛔ v4 — LE BRIEF NOMME LES BOUCHES À OBJECTIF, ET SEULEMENT ELLES", () => {
  // La règle de groupement se dit dans la consigne, avec des PRÉNOMS: sans eux,
  // « chacun le sien » n'a pas de sujet. Marc se maintient — il n'y est pas.
  const brief = buildPortionBrief([ZOE_M, NINA_M, MARC_M], "one_dish", 0, 1);
  assert(brief.includes("each get a box of their OWN, alone on the lid: Zoé, Nina"), brief);
  assert(brief.includes("Everyone else who eats that meal shares ONE box"), brief);
});

Deno.test("⛔ v4 — UN FOYER SANS OBJECTIF REÇOIT QUAND MÊME SA CONSIGNE DE BAC", () => {
  // ⚠️ C'EST LE RENVERSEMENT DE v3: « plat commun » ne disait ni combien de bacs
  // remplir dimanche, ni lequel ouvrir jeudi. Une table qui se maintient a UN
  // contenant par repas, et la consigne le dit.
  const brief = buildPortionBrief(
    [{ ...ZOE_M, goal: "maintenance" as const }, MARC_M],
    "one_dish",
    0,
    1,
  );
  assert(brief.includes("WEIGH IT ONCE, INTO BOXES NAMED BY MEAL."), brief);
  assert(brief.includes("that meal has exactly ONE"), brief);
  assertEquals(brief.includes("alone on the lid"), false, brief);
});

Deno.test("LOT 4 — l'ordre dit COMBIEN de bouches, et le nombre suit le roster", () => {
  // ⚠️ DEUX APPELS, DEUX NOMBRES ÉCRITS EN LITTÉRAL. Un test paramétré par la
  // longueur du tableau resterait vert si le bloc écrivait toujours « 1 ».
  assert(
    buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1)
      .includes("That is 2 people to place at every such meal"),
  );
  assert(
    buildPortionBrief([ZOE_M, NINA_M, MARC_M], "one_dish", 0, 1)
      .includes("That is 3 people to place at every such meal"),
  );
});

Deno.test("LOT 4 — l'ordre NOMME l'échappatoire: une note de portion n'est pas une boîte", () => {
  // ⛔ LE MODÈLE A DÉJÀ UN CHAMP OÙ RANGER « qui mange combien ». Une consigne
  // qui interdit sans nommer la sortie qu'on prend à sa place est une consigne
  // qu'on reprend — mesuré le 2026-08-17, la consigne renvoyée mot pour mot
  // dans le mauvais champ.
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1);
  assert(brief.includes("A line in member_portions is NOT a box."), brief);
});

Deno.test("LOT 4 — l'interdit du POURQUOI reste les TROIS DERNIÈRES lignes du brief", () => {
  // ⛔ POSITION LOAD-BEARING. Un modèle lit la contrainte la plus proche de la
  // fin comme la plus contraignante, et c'est précisément quand le brief se met
  // à porter des NOMBRES par personne que celle-ci doit survivre.
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1);
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
  const brief = buildPortionBrief([ZOE_M], "one_dish", 0, 1);
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
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    dietBlock: "",
    notes: [],
    voices: [],
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
    ruleHolders: [],
    // ③ — aucune tradition: le prompt reste celui d'hier au caractère près.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  };
  const two = buildHouseholdPromptBlocks({ ...base, members: [ZOE_M, NINA_M] });
  assert(
    two.systemSuffix.includes("== ONE BOX PER GROUP OF EATERS (household) =="),
    two.systemSuffix,
  );
  assert(two.systemSuffix.includes('"member_ids"'), two.systemSuffix);
  assert(two.systemSuffix.includes('"items"'), two.systemSuffix);
  // ── ⟳ 2026-09-04 · LA BOÎTE D'ÉCHANGE, DITE EN ENTIER ──────────────────
  // ⛔ « that person gets their own box » NE SUFFIT PAS, et c'est mesuré: la
  // consigne ne disait pas ce qu'il y a DEDANS. Le modèle écrivait une seconde
  // boîte au même contenu, ou pas de seconde boîte du tout — cinq repas sur
  // douze où la même bouche n'avait aucun contenant.
  const flatBox = two.systemSuffix.replace(/\s+/g, " ");
  assert(
    flatBox.includes("swapped for one of the same role"),
    "l'échange ne dit plus qu'il REMPLACE: une boîte dont le composant est " +
      "simplement retiré n'est pas un repas",
  );
  // ⛔ LES DEUX ALIMENTS AUX COURSES. Un plat qui ne liste que le poulet fait
  // acheter du poulet pour quelqu'un qui mange du tofu.
  assert(
    flatBox.includes("ingredients list BOTH"),
    "les courses ne portent plus les deux aliments de l'échange",
  );
  // ⛔ LE TITRE NEUTRE N'EST PAS UN GOÛT, C'EST UNE CONSÉQUENCE DU RENDU: le
  // couvercle d'une boîte porte le TITRE DU PLAT (`mealBoxes.ts`,
  // `boxLidLabel`). « Léa — jeudi soir — Riz au poulet » au-dessus d'une boîte
  // de tofu contredit son propre contenu.
  assert(
    flatBox.includes("one title, two boxes"),
    "le titre peut de nouveau nommer le composant échangé: le couvercle " +
      "contredira son contenu",
  );
  // ⛔ ⟳ 2026-09-04 — LA PRÉPARATION À PART. Rejoué sur quatre refus réels:
  // 60 boîtes de tofu sur 89 citaient la fiche du poulet, parce que le modèle
  // cuisait les deux protéines dans UNE préparation. La boîte existait, ses
  // items étaient propres, et la ceinture la retirait quand même.
  assert(
    flatBox.includes("preparation of its OWN") &&
      flatBox.includes("never inside the preparation that carries the original"),
    "le composant échangé peut de nouveau être cuit DANS la fiche de l'original",
  );
  // ⛔ LA PHRASE DE v3 A DISPARU, MOT POUR MOT: elle disait que les portions des
  // autres ne sont « jamais pesées, jamais nommées, jamais écrites », et v4 leur
  // donne un contenant nommé.
  assertEquals(two.systemSuffix.includes("Nobody else does"), false, two.systemSuffix);
  // ⛔ ET LE CHANGEMENT D'UNITÉ EST DIT AU MODÈLE, PAS SEULEMENT AU CODE: un
  // contenant par repas, pas un bac par casserole.
  assert(two.systemSuffix.includes("not one tub per pan"), two.systemSuffix);
  assert(two.userSuffix.includes("on every meal's box lids"), two.userSuffix);

  // ⚠️ CE TEST DISAIT « MUET À UNE BOUCHE », ET LE DÉCLENCHEUR A CHANGÉ
  // (2026-08-19): ce n'est plus la TAILLE du foyer qui ouvre la pesée, c'est
  // l'OBJECTIF. Zoé est en `fat_loss`: seule, elle a droit à sa boîte. Ce qui
  // reste muet, c'est un foyer où PERSONNE ne vise rien.
  const one = buildHouseholdPromptBlocks({ ...base, members: [ZOE_M] });
  assert(one.systemSuffix.includes("ONE BOX PER GROUP"), one.systemSuffix);

  // ⚠️ ET LE PLANCHER EST DOUBLE DEPUIS v4 (2026-08-20). Un foyer de DEUX qui se
  // maintient reçoit désormais le bloc: v3 lui donnait zéro contenant, et « plat
  // commun » ne décidait rien devant le frigo. Ce qui reste muet est le foyer
  // d'UNE bouche sans objectif — aucun groupe à former, aucune pesée demandée.
  const calm = buildHouseholdPromptBlocks({
    ...base,
    members: [{ ...ZOE_M, goal: "maintenance" as const }, MARC_M],
  });
  assert(calm.systemSuffix.includes("ONE BOX PER GROUP"), calm.systemSuffix);
  assertEquals(calm.systemSuffix.includes("alone on the lid"), false, calm.systemSuffix);

  const soloCalm = buildHouseholdPromptBlocks({
    ...base,
    members: [{ ...ZOE_M, goal: "maintenance" as const }],
  });
  assert(!soloCalm.systemSuffix.includes("ONE BOX PER GROUP"), soloCalm.systemSuffix);
  assert(
    soloCalm.userSuffix.includes("Exact ids to use in member_portions:"),
    soloCalm.userSuffix,
  );

  // ⚠️ ET LA LISTE D'IDS CÔTÉ UTILISATEUR ANNONCE LES COUVERCLES, puisqu'il y en
  // a: Zoé vise une perte. La phrase suit ce qui existe réellement.
  assert(
    one.userSuffix.includes("on every meal's box lids"),
    one.userSuffix,
  );
});

Deno.test("LOT 4 — le schéma des boîtes ORDONNE, il ne permet pas", () => {
  // La tournure permissive a été mesurée comme une permission qu'on décline.
  const out = buildHouseholdPromptBlocks({
    members: [ZOE_M, NINA_M],
    // ③ — aucune tradition: le prompt reste celui d'hier.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    cooking: "one_dish",
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    dietBlock: "",
    notes: [],
    voices: [],
    // L7 ① — jamais demandé: aucun bloc de cuisine, prompt de v15.
    kitchenEquipment: null,
    // LOT C ② — personne ne porte de règle: aucun des deux blocs, prompt de v18.
    ruleHolders: [],
  });
  assert(!out.systemSuffix.includes("may carry"), out.systemSuffix);
  assert(
    out.systemSuffix.includes("carries one more key"),
    out.systemSuffix,
  );
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
    ["prep_chicken"],
    [],
    [],
  );
  assertEquals(
    portions[0].portionNote,
    "Take a handful of the rice",
    "le texte flou N'EST PAS retiré",
  );
  // LOT 4C ② — TROIS NOMBRES: `notes` la population, `vague` les tournures
  // molles, `quantified` celles qui portent un chiffre. « 150 g from your box »
  // et « Your box: 200 g » comptent; « Take a handful of the rice » non.
  assertEquals(vagueCounts, { notes: 3, vague: 1, quantified: 2, box_ids: 0 });
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
    ["prep_rice"],
    [],
    [],
  );
  assertEquals(vagueCounts, { notes: 2, vague: 1, quantified: 1, box_ids: 0 });
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
    [],
    [],
    [],
  );
  assertEquals(portions[0].portionNote, null);
  assertEquals(vagueCounts, { notes: 0, vague: 0, quantified: 0, box_ids: 0 });
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
// 9 — LOT 4C · CE QUE LE PREMIER PASSAGE NE SAVAIT PAS DIRE
//
// Quatre défauts mesurés sur QUATRE GÉNÉRATIONS RÉELLES le 2026-08-17, tous de
// la même famille: la donnée existe, et personne ne la compte.
//
//   ① 18 parts sur 18 d'un plan écrit citaient une préparation inexistante —
//      la surface « les grammes de chaque bouche » était morte, sans un chiffre
//      pour le dire;
//   ② `vague_portions` lisait 0 flou sur 93 notes dont AUCUNE ne portait un
//      gramme: un compteur qui dit « tout va bien » est pire qu'un compteur
//      absent;
//   ③ 13 bouches dans DEUX boîtes de la même casserole, 3 dans aucune, pendant
//      que `with_boxes` affichait 100 %;
//   ④ 5 boîtes écrêtées à 2000 g, `refused: 0`, aucun autre champ.
// ---------------------------------------------------------------------------

// ── ① · LA PART QUI NE JOINT RIEN ─────────────────────────────────────────

Deno.test("LOT 4C ① — LE CAS QUI PASSE: une part qui cite une VRAIE préparation", () => {
  // ⛔ ÉCRIT EN PREMIER. Une liste fermée cassée jette tout et ressemble trait
  // pour trait à une liste fermée qui marche.
  const { portions, issues, shareCounts } = reconcilePortions(
    [ZOE_M],
    [{
      member_id: ZOE,
      portion_note: "Your box: 150 g of the chicken",
      preparation_shares: [{ preparation_id: "prep_chicken", note: "150 g de poulet" }],
    }],
    ["prep_chicken"],
    [],
    [],
  );
  assertEquals(portions[0].preparationShares, [
    { preparationId: "prep_chicken", note: "150 g de poulet" },
  ]);
  assertEquals(shareCounts, { shares: 1, unknown: 0, regime_refused: 0 });
  assertEquals(issues, []);
});

Deno.test("LOT 4C ① — une part ORPHELINE est jetée, comptée, nommée — et rien d'autre ne tombe", () => {
  // ⚠️ LA FIXTURE EST CELLE DU PLAN RÉEL `45bc8a52`: le plan portait
  // `prep_chicken_tray`, les six bouches citaient `prep_chicken_roast`,
  // `prep_rice_batch`, `prep_veg_tray`. Dix-huit parts sur dix-huit orphelines.
  const { portions, issues, shareCounts, vagueCounts } = reconcilePortions(
    [ZOE_M, NINA_M],
    [
      {
        member_id: ZOE,
        portion_note: "Your box: 150 g of the chicken",
        preparation_shares: [
          { preparation_id: "prep_chicken_roast", note: "200 g de poulet" },
          { preparation_id: "prep_chicken_tray", note: "180 g de poulet" },
        ],
      },
      {
        member_id: NINA,
        preparation_shares: [{ preparation_id: "prep_rice_batch", note: "120 g de riz" }],
      },
    ],
    ["prep_chicken_tray"],
    [],
    [],
  );
  // La part qui joint SURVIT; les deux orphelines tombent.
  assertEquals(portions[0].preparationShares, [
    { preparationId: "prep_chicken_tray", note: "180 g de poulet" },
  ]);
  assertEquals(portions[1].preparationShares, []);
  assertEquals(shareCounts, { shares: 1, unknown: 2, regime_refused: 0 });
  // ⛔ LA CONSIGNE PRINCIPALE DE LA BOUCHE N'EST PAS PERDUE: une part orpheline
  // ne rejette ni la personne, ni sa note, ni le plan.
  assertEquals(portions[0].portionNote, "Your box: 150 g of the chicken");
  // ⚠️ ET ELLE NE GONFLE PAS LE DÉNOMINATEUR DU FLOU: une note qui ne sera
  // jamais rendue n'est pas une consigne. Deux notes examinées, pas quatre.
  assertEquals(vagueCounts.notes, 2);
  assert(
    issues.includes(`share_for_unknown_preparation:${ZOE}:prep_chicken_roast`),
    issues.join("\n"),
  );
  assert(
    issues.includes(`share_for_unknown_preparation:${NINA}:prep_rice_batch`),
    issues.join("\n"),
  );
});

Deno.test("LOT 4C ① — la liste fermée est celle des préparations GARDÉES", () => {
  // Une préparation refusée par le parseur (ici: `servings_made` à 1) n'existe
  // plus dans le plan. Une part qui la cite ne joindrait rien à l'écran, et
  // c'est le même défaut qu'une part orpheline — donc le même sort.
  const meal = parse({
    preparations: [
      prep(),
      prep({ id: "prep_solo", title: "Une assiette", servings_made: 1 }),
    ],
    dishes: [dish({
      box: { id: "b1", shares: [{ member_id: ZOE, grams: 120 }] },
    })],
    shopping_list: [],
  });
  assertEquals(meal.preparations.map((p) => p.id), ["prep_chicken"]);
  const { shareCounts } = reconcilePortions(
    [ZOE_M],
    [{
      member_id: ZOE,
      preparation_shares: [{ preparation_id: "prep_solo", note: "150 g" }],
    }],
    // ⛔ EXACTEMENT CE QUE L'APPELANT PASSE: `meal.preparations.map(p => p.id)`,
    // la sortie du parseur — jamais ce que le modèle a déclaré.
    meal.preparations.map((p) => p.id),
    [],
    [],
  );
  assertEquals(shareCounts, { shares: 0, unknown: 1, regime_refused: 0 });
});

// ── ② · LE GRAMME DANS LA CONSIGNE ────────────────────────────────────────

Deno.test("LOT 4C ② — `portionCarriesAQuantity` voit un chiffre, dans les DEUX langues", () => {
  // ⛔ LE CAS QUI PASSE D'ABORD, dans les deux langues, et le cas qui ne passe
  // pas juste après. Sans les deux, ce compteur est indiscernable d'un
  // compteur bloqué.
  for (
    const yes of [
      "Your box: 150 g of the chicken",
      "Ta boîte : 150 g de poulet",
      "Prends 80 g de pâtes sèches en plus",
      "add 2 tbsp of the sauce",
      "250ml de bouillon",
      "1,5 kg pour la table",
      "Sers-lui 200 grammes de riz",
      "serve 200 grams of rice",
    ]
  ) {
    assert(portionCarriesAQuantity(yes), `devrait compter: ${yes}`);
  }
  for (
    const no of [
      // ⚠️ LES SEPT PREMIÈRES SONT LES TOURNURES RÉELLES du 2026-08-17, copiées
      // des 93 notes qui ont rendu `vague: 0`. Elles ne portent AUCUN mot de
      // `VAGUE_PORTION_TERMS` — c'est très exactement pourquoi ce compteur-ci
      // existe à côté et non à la place.
      "One standard table portion.",
      "Balanced share of the shared dish.",
      "Child-size share of the same dish.",
      "Small portion of pasta and sauce.",
      "Slightly more vegetables, standard pasta and sauce.",
      "Take the family box portion with more vegetables and less starch.",
      "Serve a larger protein and starch share with the same vegetable side.",
      // ⚠️ « 3 cm » N'EST PAS UNE PART: c'est une consigne de découpe, et la
      // compter gonflerait le taux avec des phrases qui ne disent rien de
      // combien on mange.
      "Coupe les carottes en morceaux de 3 cm",
      "",
    [],
    ]
  ) {
    assert(!portionCarriesAQuantity(no), `ne devrait pas compter: ${no}`);
  }
  assert(!portionCarriesAQuantity(null));
});

Deno.test("LOT 4C ② — `quantified` compte les notes chiffrées, `vague` ne le remplace pas", () => {
  // ⛔ LE DÉFAUT, REPRODUIT: trois notes sans un seul mot flou et sans un seul
  // gramme. Avant ce lot, ce plan-là lisait `{notes: 3, vague: 0}` — un feu
  // vert. Il lit maintenant `quantified: 0`, ce qui est le fait.
  const molles = reconcilePortions(
    [ZOE_M, NINA_M, MARC_M],
    [
      { member_id: ZOE, portion_note: "One standard table portion." },
      { member_id: NINA, portion_note: "Balanced share of the shared dish." },
      { member_id: MARC, portion_note: "Child-size share of the same dish." },
    ],
    [],
    [],
    [],
  );
  assertEquals(molles.vagueCounts, { notes: 3, vague: 0, quantified: 0, box_ids: 0 });

  const chiffrees = reconcilePortions(
    [ZOE_M, NINA_M, MARC_M],
    [
      { member_id: ZOE, portion_note: "Your box: 150 g of the chicken" },
      { member_id: NINA, portion_note: "Ta boîte : 220 g de poulet" },
      { member_id: MARC, portion_note: "Une part comme d'habitude" },
    ],
    [],
    [],
    [],
  );
  assertEquals(chiffrees.vagueCounts, { notes: 3, vague: 0, quantified: 2, box_ids: 0 });
});

Deno.test("LOT 4C ② — le brief DEMANDE le chiffre, avec le nombre et l'échappatoire", () => {
  // ⚠️ TROIS APPELS, TROIS NOMBRES ÉCRITS EN LITTÉRAL: un test paramétré par la
  // même expression que le code resterait vert si la consigne cessait de
  // compter les bouches.
  const deux = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1);
  const trois = buildPortionBrief([ZOE_M, NINA_M, MARC_M], "one_dish", 0, 1);
  assert(deux.includes("carries a number and a unit"), deux);
  assert(deux.includes("All 2 of them, not some."), deux);
  assert(trois.includes("All 3 of them, not some."), trois);
  // L'ÉCHAPPATOIRE NOMMÉE, LITTÉRALEMENT: les tournures que le modèle a
  // réellement écrites lui sont renvoyées — « take your box » comprise, mesurée
  // le 2026-08-17 sur un run où le modèle NOMMAIT la boîte sans jamais répéter
  // son poids (0 gramme sur 16 notes, alors que les 12 boîtes en portaient un).
  assert(deux.includes('"A standard portion"'), deux);
  assert(deux.includes('"take your box"'), deux);
  assert(deux.includes("even when a box already holds them"), deux);
  // ⛔ COLLÉ À LA PROMESSE. La consigne suit IMMÉDIATEMENT la phrase qui promet
  // l'instruction de service — c'est la moitié du lot que 3C a payée.
  const promesse = deux.indexOf("give a short serving instruction");
  const chiffre = deux.indexOf("carries a number and a unit");
  const membres = deux.indexOf("- Zoé:");
  assert(promesse >= 0 && chiffre > promesse && chiffre < membres, deux);
});

Deno.test("LOT 4C ② — un foyer d'UNE bouche voit la consigne du chiffre, PAS celle des boîtes", () => {
  // ⚠️ LA POPULATION S'ÉLARGIT, ET C'EST ÉCRIT: « des quantités précises pour
  // chaque personne » ne s'arrête pas à deux habitants. Le protocole des
  // BOÎTES, lui, reste muet sous deux bouches — il parle d'ids à départager.
  const solo = buildPortionBrief([ZOE_M], "one_dish", 0, 1);
  assert(solo.includes("carries a number and a unit"), solo);
  assert(solo.includes("All 1 of them, not some."), solo);
  assert(!solo.includes("WEIGH IT ONCE"), solo);
});

Deno.test("LOT 4C ② — l'interdit du POURQUOI reste les TROIS DERNIÈRES lignes", () => {
  // ⛔ C'EST PRÉCISÉMENT QUAND LE BRIEF SE MET À RÉCLAMER DES NOMBRES que cette
  // phrase doit rester la dernière chose lue.
  const brief = buildPortionBrief([ZOE_M, NINA_M, MARC_M], "one_dish", 0, 1);
  assertEquals(brief.split("\n").slice(-3), [
    "NEVER state a reason, a goal, a calorie count or anything about a person's",
    "body in these instructions. They are read aloud at the table by the whole",
    "household. Write what to serve, never why.",
  ]);
});

Deno.test("LOT 4C ② — un gramme passe la ceinture de CORPS, un pourquoi ne passe pas", () => {
  // La frontière de P4, rejouée sur les phrases que la consigne neuve invite le
  // modèle à écrire. Les grammes d'ALIMENT sont des quantités; le reste est un
  // verdict, et il meurt — dans les deux langues.
  assertEquals(
    sanitizePortionNote("150 g of the chicken, 80 g of dry pasta").note,
    "150 g of the chicken, 80 g of dry pasta",
  );
  assertEquals(sanitizePortionNote("150 g de poulet, 80 g de pâtes").note, "150 g de poulet, 80 g de pâtes");
  assertEquals(sanitizePortionNote("150 g parce que tu vises une perte de poids").note, null);
  assertEquals(sanitizePortionNote("150 g for your weight loss").note, null);
});

// ── ③ · UNE BOUCHE, UNE BOÎTE ─────────────────────────────────────────────

Deno.test("③ — LE CAS QUI PASSE: chaque bouche dans exactement une boîte du repas", () => {
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      box: {
        id: "b_lunch",
        shares: [
          { member_id: ZOE, grams: 120 },
          { member_id: NINA, grams: 200 },
          { member_id: MARC, grams: 180 },
        ],
      },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.mouth_slots, 3);
  assertEquals(meal.box_counts.mouths_unboxed, 0);
  assertEquals(meal.box_counts.mouths_double, 0);
  assert(
    !meal.issues.some((i) => i.includes("has no box at that meal") || i.includes("two containers")),
    meal.issues.join("\n"),
  );
});

Deno.test("⛔ ③ — DEUX BOÎTES POUR UNE PERSONNE À UN SEUL REPAS SONT COMPTÉES *ET RETIRÉES*", () => {
  // ⚠️ LA POPULATION EST LA **CASE** (jour × moment), PAS LE PLAT. Sur une case
  // dédiée il y a deux plats — celui de la table et celui d'une bouche — et deux
  // boîtes; chacun est dans UNE des deux. Ici le modèle a mis Zoé sur les DEUX,
  // ce qui est un contenant de trop devant le frigo.
  //
  // ⟳ LOT `L26-0`, 2026-08-22 — CE TEST A CHANGÉ DE VERDICT, ET C'EST LE LOT.
  // ~~`mouths_double` vaut 1: on COMPTE, on ne corrige pas.~~ Le compteur seul
  // n'a pas tenu: **quatorze bouches servies deux fois** sur les dix plans du
  // 2026-08-22, quatre plans sur dix, toujours la même bouche — une mineure —
  // pendant que la consigne l'interdisait DÉJÀ mot pour mot et avait été
  // servie. Il fallait une arête. Elle est ici, de bout en bout à travers le
  // parseur, et les deux compteurs se lisent désormais ENSEMBLE:
  //
  //   `mouths_double_model` — ce que le MODÈLE a rendu (1: la régression se
  //                           voit encore, sinon un modèle qui double CHAQUE
  //                           repas rendrait le même zéro qu'un modèle sage) ;
  //   `mouths_double`       — ce que le PLAN porte (0) ;
  //   `mouths_unboxed`      — ⛔ INCHANGÉ À 0. Retirer la seconde boîte en
  //                           oubliant la première rendrait Zoé NON SERVIE, ce
  //                           qui est PIRE que deux couvercles.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      dish({
        title: "Table dish",
        box: {
          id: "b_table",
          shares: [
            { member_id: ZOE, grams: 400 },
            { member_id: NINA, grams: 400 },
            { member_id: MARC, grams: 400 },
          ],
        },
      }),
      dish({
        title: "Zoé's own dish",
        box: { id: "b_zoe", shares: [{ member_id: ZOE, grams: 120 }] },
      }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.mouth_slots, 3);
  assertEquals(meal.box_counts.mouths_double_model, 1, "le modèle a bien doublé");
  assertEquals(meal.box_counts.mouths_double, 0, "le plan ne porte plus le doublon");
  assertEquals(meal.box_counts.mouths_unboxed, 0, "⛔ et Zoé n'a pas été déshabillée");
  // ⛔ LES DEUX PLATS VIVENT, LES DEUX BOÎTES AUSSI: Zoé garde celle où elle est
  // SEULE, le bac de la table garde Nina et Marc. Un nom retiré ne vide pas un
  // couvercle qui en porte d'autres.
  assertEquals(meal.box_counts.boxes, 2);
  assertEquals(meal.box_counts.refused, 0);
  const zoeBoxes = meal.dishes.flatMap((d) =>
    d.boxes.filter((b) => b.memberIds.includes(ZOE)).map((b) => b.id)
  );
  assertEquals(zoeBoxes, ["b_zoe"], "un seul couvercle, et c'est le sien");
  assertEquals(
    meal.dishes[0].boxes[0].memberIds,
    [NINA, MARC],
    "le bac de la table garde les deux autres, dans l'ordre",
  );
  // ⚠️ LE NOM RETIRÉ EST COMPTÉ COMME UN REFUS DE DÉCLARATION — patron de la
  // porte ②bis. Sans ça, `names` décrirait des noms que le plan ne porte plus.
  assertEquals(meal.box_counts.names, 3);
  assertEquals(meal.box_counts.names_refused, 1);
  assert(
    meal.issues.some((i) => i.includes(`${ZOE}`) && i.includes("was named on 2 boxes of one")),
    meal.issues.join("\n"),
  );
  assert(
    meal.issues.some((i) => i.includes("kept on") && i.includes("b_zoe")),
    meal.issues.join("\n"),
  );
});

Deno.test("⛔ ③ — LE DÉFAUT N°1: une bouche sans AUCUNE part à ce repas", () => {
  // ⚠️ C'EST LE DÉFAUT MESURÉ SUR LE RUN `76be8ce3`, ET IL EST LA RAISON DU LOT.
  // Christèle n'avait de boîte à AUCUN repas — huit boîtes sur seize
  // n'atteignaient personne — pendant que `with_boxes` affichait 100 %.
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      box: {
        id: "b_lunch",
        shares: [{ member_id: ZOE, grams: 120 }, { member_id: NINA, grams: 200 }],
      },
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.mouth_slots, 3);
  assertEquals(meal.box_counts.mouths_unboxed, 1, "Marc n'a rien à sortir du frigo");
  assertEquals(meal.box_counts.mouths_double, 0);
  assert(
    meal.issues.some((i) => i.includes(`${MARC}`) && i.includes("has no box at that meal")),
    meal.issues.join("\n"),
  );
});

Deno.test("③ — `mouth_slots` compte les CASES en boîte, pas tous les repas", () => {
  // ⚠️ UN REPAS SANS BOÎTE EST DÉJÀ COMPTÉ PAR `with_box / meals`. L'inclure ici
  // ferait dire deux fois le même défaut par deux compteurs, et
  // `mouths_unboxed` exploserait sur un plan dont un seul repas manque.
  const meal = parse({
    preparations: [prep()],
    dishes: [
      dish({
        box: {
          id: "b_all",
          shares: [
            { member_id: ZOE, grams: 120 },
            { member_id: NINA, grams: 120 },
            { member_id: MARC, grams: 120 },
          ],
        },
      }),
      dish({ title: "Bare", slot: "dinner" }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.meals, 2);
  assertEquals(meal.box_counts.with_box, 1);
  assertEquals(meal.box_counts.mouth_slots, 3, "3 bouches × 1 case en boîte");
  assertEquals(meal.box_counts.mouths_unboxed, 0);
});

Deno.test("③ — LANE INDIVIDUELLE: aucun dénominateur inventé", () => {
  const meal = parse(
    {
      preparations: [prep()],
      dishes: [dish({
        box: { id: "b1", shares: [{ member_id: ZOE, grams: 200 }] },
      })],
      shopping_list: [],
    },
    { boxMemberIds: [] },
  );
  assertEquals(meal.box_counts.mouth_slots, 0);
  assertEquals(meal.box_counts.mouths_unboxed, 0);
  assertEquals(meal.box_counts.mouths_double, 0);
});

Deno.test("③ — le brief dit ce que `grams` désigne, et « une part par bouche »", () => {
  const brief = buildPortionBrief([ZOE_M, NINA_M], "one_dish", 0, 1);
  // ⛔ v4 — LA PHRASE v2 A DISPARU AVEC SON MODÈLE. « what THAT person takes out
  // of the box » décrivait une part par nom sur un couvercle collectif: la
  // balance de retour au service, très exactement ce qui a tué v2.
  assertEquals(brief.includes("what THAT person takes out of the box"), false, brief);
  assertEquals(brief.includes("never one figure for both"), false, brief);
  assert(brief.includes("never split it per person"), brief);
  assert(brief.includes("never write a figure next to a name on a shared lid"), brief);
});

// ── ④ · L'ÉCRÊTAGE, COMPTÉ ────────────────────────────────────────────────

Deno.test("LOT 4C ④ — une boîte écrêtée est COMPTÉE, gardée, et jamais « refusée »", () => {
  // ⚠️ L'ENTRÉE EST `BOX_MAX_GRAMS + 500`: muter la constante déplace l'entrée
  // ET la sortie ensemble, donc le littéral juste en dessous est ce qui tient
  // le test — patron du test d'écrêtage écrit par le premier passage.
  assertEquals(BOX_MAX_GRAMS, 2000);
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [{
        id: "b_huge",
        member_ids: [ZOE, NINA],
        items: [
          { preparation_id: "prep_chicken", term: "chicken", grams: BOX_MAX_GRAMS + 500 },
          { preparation_id: "prep_chicken", term: "rice", grams: 200 },
        ],
      }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.capped, 1, "l'écrêtage n'est plus silencieux");
  assertEquals(meal.box_counts.items_refused, 0, "un composant écrêté n'est PAS refusé");
  assertEquals(meal.box_counts.items, 2);
  assertEquals(meal.dishes[0].boxes[0]?.items[0].grams, 2000);
});

Deno.test("LOT 4C ④ — un plan sans écrêtage lit ZÉRO (le compteur n'est pas bloqué à 1)", () => {
  const meal = parse({
    preparations: [prep()],
    dishes: [dish({
      boxes: [{
        id: "b_ok",
        member_ids: [ZOE],
        items: [{ preparation_id: "prep_chicken", term: "chicken", grams: BOX_MAX_GRAMS }],
      }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.box_counts.capped, 0, "exactement au plafond n'est pas un écrêtage");
  assertEquals(meal.dishes[0].boxes[0]?.items[0].grams, BOX_MAX_GRAMS);
});

// ══════════════════════════════════════════════════════════════════════════
// LOT E — UN IDENTIFIANT DE BOÎTE NE SE LIT PAS À VOIX HAUTE À TABLE.
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ MESURÉ, PAS CRAINT. Run C du LOT 4C, 2026-08-17, littéralement:
// « Use box_prep_chicken_shared. » et « Shares box_chicken_me with the Kid. »
// L'écran ne rend jamais un id de boîte — sauf quand le MODÈLE en met un dans
// une phrase, et là il traverse tout jusqu'à la table.
//
// ⚠️ LES ÉPREUVES SONT SUR LA VALEUR RENDUE (`portionNote`, `preparationShares`),
// jamais sur un littéral de source: deux tests de source ont menti cette semaine
// dans ce chantier.

Deno.test("LOT E — LE CAS QUI PASSE: une note sans slug traverse intacte, FR et EN", () => {
  // ⛔ ÉCRIT EN PREMIER, et c'est la moitié de la garde. Une ceinture cassée
  // nulle TOUT et ressemble trait pour trait à une ceinture qui marche.
  const { portions, issues, vagueCounts } = reconcilePortions(
    [ZOE_M, NINA_M],
    [
      {
        member_id: ZOE,
        portion_note: "Take 220 g of the chicken from your box.",
        preparation_shares: [
          { preparation_id: "prep_chicken", note: "180 g from the shared box" },
        ],
      },
      { member_id: NINA, portion_note: "Prends 150 g de poulet dans ta boîte." },
    ],
    ["prep_chicken"],
    ["box_prep_chicken_shared", "box_chicken_me"],
    [],
  );
  assertEquals(portions[0].portionNote, "Take 220 g of the chicken from your box.");
  assertEquals(portions[1].portionNote, "Prends 150 g de poulet dans ta boîte.");
  assertEquals(portions[0].preparationShares, [
    { preparationId: "prep_chicken", note: "180 g from the shared box" },
  ]);
  assertEquals(vagueCounts.box_ids, 0);
  assertEquals(issues, []);
});

Deno.test("LOT E — un id de boîte dans la note PRINCIPALE la met à null, compte et nomme", () => {
  const { portions, issues, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{ member_id: ZOE, portion_note: "Use box_prep_chicken_shared." }],
    [],
    ["box_prep_chicken_shared"],
    [],
  );
  assertEquals(portions[0].portionNote, null);
  assertEquals(vagueCounts.box_ids, 1);
  // ⚠️ ET ELLE N'ENTRE DANS AUCUN DES DEUX AUTRES COMPTEURS: une note nullée
  // n'est plus une consigne. Même discipline que la ceinture de corps.
  assertEquals(vagueCounts.notes, 0);
  assertEquals(vagueCounts.quantified, 0);
  assertEquals(
    issues,
    [`portion_note_box_id:${ZOE}:box_prep_chicken_shared`],
  );
});

Deno.test("LOT E — un id de boîte dans une note de PART la met à null: c'est le cas MESURÉ", () => {
  // ⛔ LA FUITE OBSERVÉE VIT ICI. Ne ceinturer que `portion_note` aurait laissé
  // passer exactement la phrase du run C.
  const { portions, issues, shareCounts, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{
      member_id: ZOE,
      portion_note: "Your box: 150 g of the chicken",
      preparation_shares: [
        { preparation_id: "prep_chicken", note: "Shares box_chicken_me with the Kid." },
      ],
    }],
    ["prep_chicken"],
    ["box_chicken_me"],
    [],
  );
  assertEquals(portions[0].preparationShares, []);
  // ⛔ LA CONSIGNE PRINCIPALE SURVIT: on ne perd que la ligne fautive.
  assertEquals(portions[0].portionNote, "Your box: 150 g of the chicken");
  assertEquals(vagueCounts.box_ids, 1);
  assertEquals(shareCounts, { shares: 0, unknown: 0, regime_refused: 0 });
  assert(
    issues.includes(`share_note_box_id:${ZOE}:prep_chicken:box_chicken_me`),
    issues.join("\n"),
  );
});

Deno.test("LOT E — LA CEINTURE MORD DANS LES DEUX LANGUES (un id n'est jamais traduit)", () => {
  // `MEAL_TOKEN_FIELDS` range `preparations[].boxes[].id` parmi les jetons
  // « ASCII snake_case, English words only »: le slug est le MÊME dans une
  // phrase française. La garde doit donc mordre des deux côtés — et la
  // cicatrice « garde testée dans une seule langue » dit pourquoi on le prouve.
  const { portions, vagueCounts } = reconcilePortions(
    [ZOE_M, NINA_M],
    [
      { member_id: ZOE, portion_note: "Prends la boîte box_prep_riz_zoe, 180 g." },
      { member_id: NINA, portion_note: "Take box_prep_riz_zoe out of the fridge." },
    ],
    [],
    ["box_prep_riz_zoe"],
    [],
  );
  assertEquals(portions[0].portionNote, null, "la note FRANÇAISE doit tomber");
  assertEquals(portions[1].portionNote, null, "la note ANGLAISE doit tomber");
  assertEquals(vagueCounts.box_ids, 2);
});

Deno.test("LOT E — un id qui n'est PAS de ce plan ne mord pas: la liste est fermée", () => {
  // Le patron `preparation_id`, une fois de plus: on ne devine pas une forme,
  // on compare à ce que le parseur a gardé.
  const { portions, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{ member_id: ZOE, portion_note: "Use box_of_another_plan for the rice." }],
    [],
    ["box_prep_chicken_shared"],
    [],
  );
  assertEquals(
    portions[0].portionNote,
    "Use box_of_another_plan for the rice.",
  );
  assertEquals(vagueCounts.box_ids, 0);
});

Deno.test("LOT E — un id SANS souligné ne mord pas: « Zoe » est un prénom, pas un slug", () => {
  // ⚠️ LE PLANCHER, ASSUMÉ ET TESTÉ. « laitue » ≠ « lait »: 12 faux positifs sur
  // 12 mesurés dans ce dépôt. Un id qui est un mot ordinaire est indistinguable
  // de la prose, et le nuller serait exactement cette cicatrice.
  const { portions, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{ member_id: ZOE, portion_note: "Zoe takes a bigger share of the rice." }],
    [],
    ["zoe"],
    [],
  );
  assertEquals(
    portions[0].portionNote,
    "Zoe takes a bigger share of the rice.",
  );
  assertEquals(vagueCounts.box_ids, 0);
});

Deno.test("LOT E — le slug doit être un JETON ENTIER, pas un morceau de mot", () => {
  // `box_prep_riz` ne mord pas sur `box_prep_rizotto_zoe`: sans borne, une
  // boîte au nom court nullerait les phrases de toutes les autres.
  const { portions, vagueCounts } = reconcilePortions(
    [ZOE_M],
    [{ member_id: ZOE, portion_note: "Sers-toi dans box_prep_riz_complet." }],
    [],
    ["box_prep_riz"],
    [],
  );
  assertEquals(portions[0].portionNote, "Sers-toi dans box_prep_riz_complet.");
  assertEquals(vagueCounts.box_ids, 0);
});

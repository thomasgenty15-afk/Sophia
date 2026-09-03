// LA CEINTURE DE RÉGIME SUR LA LANE FOYER — « un enfant végane de 9 ans se voit
// servir du bœuf, dans la phrase lue à table ».
//
// ── LE DÉFAUT, MESURÉ AVANT D'ÊTRE CORRIGÉ ────────────────────────────────
// 2026-08-19, foyer `43102a0a-…`, quatre bouches dont Théodule (végane, 9 ans).
// `member_portions[Theodule].portion_note`, plan réel:
//
//     Serve all components together on the plate. — Rich Smoky Beef Stew 207 g
//     · Smoky Black Bean Stew 207 g · Smoky Roast Chicken & Cauliflower 248 g
//     · Smoky Roast Chickpeas & Cauliflower 207 g · Basic Cooked Quinoa 124 g
//
// CINQ PLANS SUR CINQ. Aucune `issue`, aucun compteur: un run vert et un run qui
// sert de la viande à un enfant végane étaient le même run.
//
// ── CE QUE CES ÉPREUVES PROTÈGENT, DANS L'ORDRE DE CE QUI COÛTE LE PLUS ───
//
//   * LA GARDE QUI VIDE LA TABLE. Une ceinture qui refuse le plan entier fait
//     payer son régime en semaines vides à la seule population qu'elle existe
//     pour protéger (cinq plans sur cinq ⇒ `422 empty_meal` à 100 %). Les
//     autres bouches doivent TOUJOURS être servies, et la bouche protégée doit
//     garder la casserole végétale que le modèle a cuisinée dans le MÊME plan.
//   * LE COMPTEUR À DEUX NOMBRES. `refused: 0` rend le même zéro pour « aucune
//     bouche n'a déclaré » et « toutes ont déclaré et rien n'a mordu ».
//     `mouths` / `checked` / `refused`, et la somme est une propriété testée.
//   * LE FAUX POSITIF QUI TUE LA GARDE. « soy yoghurt », « oat milk », « peanut
//     butter » sont le garde-manger végane courant. Une ceinture qui mord
//     dessus se fait désarmer dans la semaine — d'où le cas qui PASSE, écrit
//     avant les cas qui mordent.
//   * LE COMPTEUR VOISIN POLLUÉ. Une bouche que son régime tient hors d'une
//     casserole n'est pas « une personne debout devant le frigo »:
//     `mouths_unboxed` doit rester à zéro, des DEUX côtés de la fraction.
//   * LA GARDE POSÉE SUR UN SEUL DES DEUX CHAMPS. La boîte et la
//     `preparation_share` sont deux affectations de la même casserole à la même
//     bouche. Ceinturer l'une et pas l'autre laisse « une portion de bœuf »
//     accrochée sous le plat.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { parseGeneratedMeal } from "./meal_generation.ts";
import type { GeneratedMeal, MealScope } from "./meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import type { CompositionIndex } from "./food_composition.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import {
  type PortionMember,
  reconcilePortions,
} from "./household_portions.ts";
import { householdDietBlock } from "./household_diet.ts";

// Les quatre bouches du foyer réel, ids raccourcis mais distincts.
const AURELE = "c278b5dc-680f-43f1-b54f-f9da630fcb2f";
const SOLVEIG = "c9656ee5-6b39-4fd0-95f2-3f4bf70899d7";
const MARCELINE = "f5c81e2b-7f57-4fac-a30f-067fa587262d";
const THEODULE = "1fea4f51-a4e9-4066-8d09-49881ee58f38";

const ROSTER = [AURELE, SOLVEIG, MARCELINE, THEODULE] as readonly string[];

/** Le foyer de la mesure: trois omnivores, une bouche VÉGANE. */
const MIXED_TABLE: readonly { memberId: string; regime: DietaryRegime | null }[] = [
  { memberId: AURELE, regime: null },
  { memberId: SOLVEIG, regime: null },
  { memberId: MARCELINE, regime: null },
  { memberId: THEODULE, regime: "vegan" },
];

/** Le même foyer, PERSONNE n'ayant déclaré. Le désarmement, et il est testé. */
const NOBODY_DECLARED: readonly { memberId: string; regime: DietaryRegime | null }[] =
  ROSTER.map((memberId) => ({ memberId, regime: null }));

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
  daysToFill: ["wed"],
  awayDays: [],
  cookingTimeMin: null,
  composition: null as CompositionIndex | null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: ROSTER,
  // ⚠️ PERSONNE N'A D'OBJECTIF ICI: c'est un foyer de régime, pas de cible. Un
  // seul GROUPE par repas est donc attendu, et `box_counts.expected` vaut le
  // nombre de contenants qu'une table sans objectif produit.
  weighedMemberIds: [] as readonly string[],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  boxMemberDiets: MIXED_TABLE,
  // ⛔ La ceinture des EXCLUSIONS partage la boucle des boîtes depuis le
  // 2026-09-01. `[]` dit « personne n'a rien exclu » — ces cas-ci mesurent les
  // RÉGIMES, et les mêler rendrait leur zéro ambigu.
  boxMemberExclusions: [],
};

function parse(
  payload: Record<string, unknown>,
  over: Partial<typeof PARSE_BASE> = {},
): GeneratedMeal {
  return parseGeneratedMeal(payload, { ...PARSE_BASE, ...over });
}

/**
 * LE CONTENANT COMMUN D'UN REPAS — tout le monde sur le couvercle.
 *
 * ⚠️ v4 (2026-08-20): un bac, un GROUPE de noms, et des `items` qui nomment leur
 * casserole. Ses grammes décrivent le RÉCIPIENT, jamais l'assiette de quelqu'un
 * — il n'y a donc aucun nombre par personne à écrire dessus.
 */
function boxForEveryone(slug: string, preparationId: string) {
  return {
    id: `box_${slug}`,
    member_ids: [...ROSTER],
    items: [{ preparation_id: preparationId, term: "stew", grams: 800 }],
  };
}

/**
 * LE PLAN RÉEL DE `one_session`/run-D1, RÉDUIT À CE QUI COMPTE.
 *
 * ⚠️ LES DEUX MOITIÉS SONT LÀ, ET C'EST LE CŒUR DU CAS: le modèle avait
 * DÉDOUBLÉ chaque préparation pour le régime (bœuf/haricots noirs,
 * poulet/pois chiches). La version végane EXISTE, elle est cuisinée, et
 * l'enfant recevait quand même la ligne de la viande.
 */
function twinnedPlan() {
  return {
    preparations: [
      {
        id: "prep_beef_stew",
        title: "Rich Smoky Beef Stew",
        servings_made: 4,
        method: "Simmer it long and slow.",
        active_minutes: 20,
        total_minutes: 90,
        cook_on: "wed",
        ingredients: [
          { term: "beef chuck, diced", quantity: "800 g" },
          { term: "tinned chopped tomatoes", quantity: "400 g" },
        ],
      },
      {
        id: "prep_bean_stew",
        title: "Smoky Black Bean Stew",
        servings_made: 4,
        method: "Simmer it long and slow.",
        active_minutes: 20,
        total_minutes: 60,
        cook_on: "wed",
        ingredients: [
          { term: "black beans, drained", quantity: "800 g" },
          { term: "tinned chopped tomatoes", quantity: "400 g" },
        ],
      },
    ],
    // ⚠️ DEUX REPAS, ET C'EST CE QUE L'UNITÉ IMPOSE. Une casserole que personne
    // ne mange n'a plus de boîte du tout: c'est le REPAS qui porte le contenant.
    // Le foyer mange donc le bœuf un soir et les haricots l'autre — la forme
    // exacte du plan réel qu'on rejoue, où les deux existaient côte à côte.
    dishes: [{
      title: "Rich smoky beef stew night",
      day: "wed",
      slot: "dinner",
      method: "Take the box out and reheat.",
      why: "Because it works.",
      ingredients: [{ term: "flat bread", quantity: "1 unit" }],
      uses: [{ preparation_id: "prep_beef_stew", servings: 1 }],
      boxes: [boxForEveryone("beef", "prep_beef_stew")],
    }, {
      title: "Smoky bean stew night",
      day: "wed",
      slot: "lunch",
      method: "Take the box out and reheat.",
      why: "Because it works.",
      ingredients: [{ term: "flat bread", quantity: "1 unit" }],
      uses: [{ preparation_id: "prep_bean_stew", servings: 1 }],
      boxes: [boxForEveryone("beans", "prep_bean_stew")],
    }],
    shopping_list: [],
  };
}

/** La boîte d'un repas gardé, retrouvée par son plat. */
function boxOf(meal: GeneratedMeal, title: string) {
  return meal.dishes.find((d) => d.title === title)?.boxes[0] ?? null;
}

// ---------------------------------------------------------------------------
// 1 — LE CAS QUI PASSE, ÉCRIT EN PREMIER
// ---------------------------------------------------------------------------

Deno.test("CEINTURE — personne n'a déclaré: rien ne bouge, et le compteur le DIT", () => {
  // ⚠️ ÉCRIT EN PREMIER, ET C'EST LA RÈGLE DE LA MAISON: une garde cassée
  // refuse tout et ressemble trait pour trait à une garde qui marche.
  const meal = parse(twinnedPlan(), { boxMemberDiets: NOBODY_DECLARED });

  assertEquals(meal.preparations.length, 2);
  assertEquals(meal.dishes.length, 2);
  for (const dish of meal.dishes) assertEquals(dish.boxes[0]?.memberIds.length, 4);

  // LE ZÉRO DÉSAMBIGUÏSÉ. `mouths: 0` dit « jamais déclaré » — et c'est ce que
  // `refused: 0` seul serait incapable de distinguer du cas suivant.
  assertEquals(meal.regime_belt, {
    mouths: 0,
    checked: 0,
    kept: 0,
    refused: 0,
    // ── v4 · LA MORSURE, COMPTÉE SUR LE PLAT ────────────────────────────
    // `bites === separated + not_separated`, et les trois sont à zéro ici
    // parce qu'aucune bouche ne porte de ligne.
    bites: 0,
    separated: 0,
    not_separated: 0,
    silenced: 0,
    unknown_mouth: 0,
    // ── LE GROUPE DÉCLARÉ (2026-08-19), ET SES SIX ZÉROS ────────────────
    // Ce plan ne porte aucun `group` sur ses ingrédients, donc les trois
    // premiers sont à zéro; et aucune bouche n'a de régime, donc la ceinture
    // n'a rien lu et les trois suivants aussi. C'est l'ÉGALITÉ EXACTE qui
    // compte ici: elle oblige tout compteur ajouté un jour à passer par ce
    // test, au lieu d'apparaître en base sans que personne ne l'ait décidé.
    groups_declared: 0,
    groups_valid: 0,
    groups_refused: 0,
    group_excluded: 0,
    group_plant_only: 0,
    group_undecided: 0,
  });
  assertEquals(meal.regime_refusals, []);
  assertEquals(
    meal.issues.filter((i) => i.includes("declared line")),
    [],
  );
});

Deno.test("CEINTURE — le garde-manger végane courant PASSE (soja, avoine, cacahuète)", () => {
  // ⛔ MESURÉ PAR 2V SUR LA LANE SOLO: `yoghurt` dans « Soy yoghurt », `milk`
  // dans « oat milk », `butter` dans « peanut butter » — le garde-manger végane
  // tout entier compté en brèches. Une ceinture qui mord ici viderait les plans
  // des végans, c'est-à-dire des seuls qu'elle existe pour protéger.
  const meal = parse({
    preparations: [{
      id: "prep_bowl",
      title: "Soy Yoghurt & Oat Milk Breakfast Bowl",
      servings_made: 4,
      method: "Stir the oat milk into the soy yoghurt.",
      active_minutes: 5,
      total_minutes: 5,
      cook_on: "wed",
      ingredients: [
        { term: "soy yoghurt", quantity: "600 g" },
        { term: "oat milk", quantity: "200 ml" },
        { term: "peanut butter", quantity: "40 g" },
      ],
    }],
    dishes: [{
      title: "Breakfast bowl",
      day: "wed",
      slot: "lunch",
      method: "Take the box out.",
      why: "Because it works.",
      ingredients: [{ term: "banana", quantity: "1 unit" }],
      uses: [{ preparation_id: "prep_bowl", servings: 1 }],
      boxes: [boxForEveryone("bowl", "prep_bowl")],
    }],
    shopping_list: [],
  });

  assertEquals(meal.dishes[0].boxes[0]?.memberIds.length, 4);
  assert(
    meal.dishes[0].boxes[0]?.memberIds.includes(THEODULE),
    "la bouche végane a perdu sa part sur un repas VÉGANE",
  );
  assertEquals(meal.regime_belt.refused, 0);
  assertEquals(meal.regime_belt.checked, 1);
  assertEquals(meal.regime_belt.kept, 1);
  // ⚠️ LE NOMBRE QUI DIT QUE LE DÉSAMORÇAGE A TRAVAILLÉ. Sans lui, « rien
  // trouvé » et « tout blanchi » rendent le même `refused: 0`.
  assert(
    meal.regime_belt.silenced > 0,
    `le désamorçage n'a rien compté: ${JSON.stringify(meal.regime_belt)}`,
  );
});

// ---------------------------------------------------------------------------
// 2 — LA MORSURE, SUR LE PLAN RÉEL
// ---------------------------------------------------------------------------

Deno.test("CEINTURE — la bouche végane sort de la boîte de bœuf, les autres restent", () => {
  const meal = parse(twinnedPlan());

  const beef = boxOf(meal, "Rich smoky beef stew night")!;
  const beans = boxOf(meal, "Smoky bean stew night")!;

  // ⛔ LA PART DE BŒUF DE L'ENFANT N'EXISTE PLUS.
  assertEquals(beef.memberIds.includes(THEODULE), false);
  // ⛔ ET LA TABLE EST TOUJOURS SERVIE. Une garde qui vide la table de tout le
  // monde n'est pas une garde, c'est une panne.
  assertEquals(beef.memberIds.length, 3);
  for (const id of [AURELE, SOLVEIG, MARCELINE]) {
    assert(
      beef.memberIds.includes(id),
      `${id} a perdu sa part de bœuf`,
    );
  }
  // ⛔ ET L'ENFANT MANGE: la casserole végétale que le modèle a cuisinée dans le
  // MÊME plan lui reste, aux quatre bouches.
  assertEquals(beans.memberIds.length, 4);
  assert(beans.memberIds.includes(THEODULE));

  assertEquals(meal.regime_belt.mouths, 1);
  assertEquals(meal.regime_belt.checked, 2);
  assertEquals(meal.regime_belt.kept, 1);
  assertEquals(meal.regime_belt.refused, 1);
  assertEquals(meal.regime_refusals, [
    { preparation_id: "prep_beef_stew", member_ids: [THEODULE] },
  ]);
  assert(
    meal.issues.some((i) =>
      i.includes(THEODULE) && i.includes("is vegan") &&
      i.includes("mouth dropped from the box")
    ),
    meal.issues.join("\n"),
  );
});

Deno.test("CEINTURE — la volaille mord aussi, et par le TITRE seul", () => {
  // ⚠️ LE TITRE EST DE LA PROSE, PAS UN TERME: c'est le second des deux
  // contrats de `scanDietaryRegime`, et les deux doivent être branchés. Ici les
  // ingrédients ne nomment jamais la volaille — seul le titre le fait, comme
  // dans `separate_sessions`/run-2 (« Smoky Roasted Chicken Thighs »).
  const meal = parse({
    preparations: [{
      id: "prep_roast",
      title: "Smoky Roasted Chicken Thighs",
      servings_made: 4,
      method: "Roast until done.",
      active_minutes: 10,
      total_minutes: 45,
      cook_on: "wed",
      ingredients: [
        { term: "smoked paprika", quantity: "1 tbsp" },
        { term: "olive oil", quantity: "2 tbsp" },
      ],
    }],
    dishes: [{
      title: "Roast night",
      day: "wed",
      slot: "dinner",
      method: "Take the box out.",
      why: "Because it works.",
      ingredients: [{ term: "salad", quantity: "1 unit" }],
      uses: [{ preparation_id: "prep_roast", servings: 1 }],
      boxes: [boxForEveryone("roast", "prep_roast")],
    }],
    shopping_list: [],
  });

  assertEquals(meal.dishes[0].boxes[0]?.memberIds.length, 3);
  assertEquals(meal.regime_belt.refused, 1);
});

Deno.test("CEINTURE — la somme est une propriété, pas une décoration", () => {
  // `checked === kept + refused`, sur les deux jeux. Un compteur dont les
  // nombres ne se ferment pas est un compteur qu'on cesse de croire.
  for (const plan of [twinnedPlan(), twinnedPlan()]) {
    const belt = parse(plan).regime_belt;
    assertEquals(belt.checked, belt.kept + belt.refused);
  }
});

Deno.test("CEINTURE — une boîte dont TOUTES les bouches sont tenues dehors tombe, avec SON motif", () => {
  // ⚠️ DEUX MOTIFS, PAS UN. « aucune bouche connue » est un modèle qui invente
  // des noms; « toutes tenues dehors par leur ligne » est le produit qui
  // protège. Un seul message rendrait les deux indiscernables dans le journal.
  const meal = parse({
    preparations: [{
      id: "prep_beef_kid",
      title: "Rich Smoky Beef Stew",
      servings_made: 2,
      method: "Simmer it.",
      active_minutes: 20,
      total_minutes: 90,
      cook_on: "wed",
      ingredients: [{ term: "beef chuck, diced", quantity: "400 g" }],
    }],
    dishes: [{
      title: "Stew night",
      day: "wed",
      slot: "dinner",
      method: "Take the box out.",
      why: "Because it works.",
      ingredients: [{ term: "flat bread", quantity: "1 unit" }],
      uses: [{ preparation_id: "prep_beef_kid", servings: 1 }],
      // UN SEUL nom sur le couvercle, et c'est celui de la bouche végane.
      boxes: [{
        id: "box_beef_only_kid",
        member_ids: [THEODULE],
        items: [{ preparation_id: "prep_beef_kid", term: "stew", grams: 200 }],
      }],
    }],
    shopping_list: [],
  });

  assertEquals(meal.dishes[0].boxes, []);
  assert(
    meal.issues.some((i) =>
      i.includes("every mouth on it is held off") && i.includes("declared line")
    ),
    meal.issues.join("\n"),
  );
  assertEquals(
    meal.issues.some((i) => i.includes("no usable name on the lid")),
    false,
    "le motif générique a masqué le motif du régime",
  );
});

// ---------------------------------------------------------------------------
// 3 — LE COMPTEUR VOISIN N'EST PAS POLLUÉ
// ---------------------------------------------------------------------------

Deno.test("CEINTURE — une bouche tenue dehors n'est PAS une bouche « sans boîte »", () => {
  // ⛔ SANS CETTE SORTIE, LE COMPTEUR GROSSIRAIT EXACTEMENT QUAND LA CEINTURE
  // PROTÈGE LE MIEUX: `mouths_unboxed` compterait Théodule sur la casserole de
  // bœuf, c'est-à-dire lirait un défaut sur l'état correct.
  const meal = parse(twinnedPlan());
  assertEquals(meal.box_counts.mouths_unboxed, 0);
  assertEquals(meal.box_counts.mouths_double, 0);
  // ⚠️ ET LE DÉNOMINATEUR SUIT, DES DEUX CÔTÉS DE LA FRACTION. Deux CASES en
  // boîte × quatre bouches = 8, moins la bouche végane au dîner de bœuf = 7.
  assertEquals(meal.box_counts.mouth_slots, 7);
  assertEquals(meal.box_counts.names, 7);
  // ⚠️ ET LES DEUX REPAS ONT BIEN LEUR CONTENANT: c'est le compteur obligatoire
  // (`with_box / meals`), et une ceinture qui retire une PART ne doit jamais
  // faire tomber la BOÎTE des autres.
  assertEquals(meal.box_counts.meals, 2);
  assertEquals(meal.box_counts.with_box, 2);
});

Deno.test("CEINTURE — la garde « exactement une boîte » mord TOUJOURS ailleurs", () => {
  // ⚠️ LE CAS SYMÉTRIQUE, ET IL EST OBLIGATOIRE: une sortie de dénominateur qui
  // avalerait aussi les VRAIS oublis désarmerait le compteur voisin en silence.
  const plan = twinnedPlan();
  // Marceline (omnivore) est retirée du repas de haricots par le MODÈLE: aucun
  // régime là-dedans, donc `mouths_unboxed` doit bien la compter.
  plan.dishes[1].boxes[0].member_ids = plan.dishes[1].boxes[0].member_ids.filter((id) =>
    id !== MARCELINE
  );
  const meal = parse(plan);
  assertEquals(meal.box_counts.mouths_unboxed, 1);
  assert(
    meal.issues.some((i) => i.includes(MARCELINE) && i.includes("has no box at that meal")),
    meal.issues.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// 3bis — v4: LA CEINTURE EST LE FILET, ET ON COMPTE CE QU'ELLE A DÛ RATTRAPER
// ---------------------------------------------------------------------------

Deno.test("v4 — une morsure que le modèle N'A PAS séparée se compte comme telle", () => {
  // ⛔ LE COMPTEUR QUE v4 RÉCLAME. Sous v4 la séparation par régime est une
  // décision de COMPOSITION: la bouche mordue doit avoir SON contenant. Retirer
  // son nom d'un bac reste armé — c'est le filet — mais un modèle qui ne sépare
  // JAMAIS ressemblerait sinon trait pour trait à un foyer sans régime.
  const meal = parse(twinnedPlan());
  // Le bœuf mord la ligne végane; le modèle avait quand même mis Théodule sur
  // son couvercle, donc la composition a échoué et la ceinture a rattrapé.
  assertEquals(meal.regime_belt.bites, 1);
  assertEquals(meal.regime_belt.not_separated, 1);
  assertEquals(meal.regime_belt.separated, 0);
  // ⚠️ LA PROPRIÉTÉ, ET C'EST ELLE QUI REND LE COUPLE UTILE.
  assertEquals(
    meal.regime_belt.bites,
    meal.regime_belt.separated + meal.regime_belt.not_separated,
  );
});

Deno.test("v4 — une morsure que le modèle A séparée compte au NUMÉRATEUR", () => {
  // Le même plan, mais le modèle a composé correctement: Théodule n'est nommé
  // sur aucun couvercle du plat de bœuf. La ceinture n'a rien à retirer, et le
  // compteur ne se tait pas pour autant — sinon « il a bien composé » et « il
  // n'y a pas de régime à cette table » rendraient le même silence.
  const plan = twinnedPlan();
  plan.dishes[0].boxes[0].member_ids = plan.dishes[0].boxes[0].member_ids.filter(
    (id) => id !== THEODULE,
  );
  const meal = parse(plan);
  assertEquals(meal.regime_belt.bites, 1);
  assertEquals(meal.regime_belt.separated, 1);
  assertEquals(meal.regime_belt.not_separated, 0);
  // ⛔ ET LA CEINTURE N'A RIEN RETIRÉ: il n'y avait rien à retirer.
  assertEquals(meal.regime_belt.refused, 0);
  // ⚠️ MAIS LA CASSEROLE RESTE INTERDITE À CETTE BOUCHE, et c'est un fait de
  // CASSEROLE, pas de couvercle: `reconcilePortions` doit toujours retirer sa
  // part de bœuf dans `member_portions`. Sans ça, séparer correctement les
  // contenants DÉSARMERAIT la seconde surface de la ceinture.
  assertEquals(meal.regime_refusals, [
    { preparation_id: "prep_beef_stew", member_ids: [THEODULE] },
  ]);
});

Deno.test("v4 — `not_separated` compte des PLATS, `refused` compte des retraits", () => {
  // ⚠️ LES DEUX NOMBRES NE MESURENT PAS LA MÊME CHOSE, et ce test le prouve en
  // les faisant diverger: Théodule est nommé sur DEUX couvercles du même plat de
  // bœuf. La ceinture le retire deux fois (`refused: 2`), mais la composition
  // n'a échoué qu'une fois sur ce plat (`not_separated: 1`).
  const plan = twinnedPlan();
  plan.dishes[0].boxes.push({
    id: "box_beef_second",
    member_ids: [THEODULE],
    items: [{ preparation_id: "prep_beef_stew", term: "stew", grams: 200 }],
  });
  const meal = parse(plan);
  assertEquals(meal.regime_belt.refused, 2);
  assertEquals(meal.regime_belt.not_separated, 1);
  assertEquals(meal.regime_belt.bites, 1);
});

// ---------------------------------------------------------------------------
// 4 — LA DÉRIVE DES DEUX LISTES SE COMPTE
// ---------------------------------------------------------------------------

Deno.test("CEINTURE — un régime nommé pour une bouche hors roster se COMPTE", () => {
  // ⛔ DEUX LISTES QUI DÉCRIVENT LE MÊME ROSTER FINISSENT PAR DIVERGER, et la
  // seule preuve serait une ceinture qui n'a jamais rien vu. Elle ne se tait
  // donc pas: elle rend un nombre.
  const meal = parse(twinnedPlan(), {
    kitchenEquipment: null,
    cookOnlyDay: null,
    soloBoxes: false,
    boxMemberDiets: [{ memberId: "someone-else", regime: "vegan" }],
  });
  assertEquals(meal.regime_belt.unknown_mouth, 1);
  assertEquals(meal.regime_belt.mouths, 0);
  assertEquals(meal.regime_belt.refused, 0);
});

// ---------------------------------------------------------------------------
// 5 — LA SECONDE SURFACE: LA PART SOUS LE PLAT
// ---------------------------------------------------------------------------

function member(memberId: string, displayName: string): PortionMember {
  return {
    memberId,
    displayName,
    ageState: "adult",
    goal: null,
    body: null,
    eatingSlots: [],
    habits: [],
    habitNote: null,
  };
}

Deno.test("CEINTURE — la part qui cite une casserole refusée tombe, et se compte", () => {
  // ⛔ MESURÉ: `separate_sessions`/run-1 attachait à Théodule une part de
  // « Roasted Chicken and Smoked Tofu » avec la note « one portion of smoked
  // tofu ». La casserole est MIXTE; on ne peut pas garantir que sa moitié
  // végétale n'a pas touché l'autre, et une garantie fausse est pire
  // qu'aucune garantie.
  const { portions, issues, shareCounts } = reconcilePortions(
    [member(AURELE, "Aurele"), member(THEODULE, "Theodule")],
    [
      {
        member_id: AURELE,
        portion_note: "Serve the stew over the beans.",
        preparation_shares: [
          { preparation_id: "prep_beef_stew", note: "one portion of beef stew" },
          { preparation_id: "prep_bean_stew", note: "one portion of bean stew" },
        ],
      },
      {
        member_id: THEODULE,
        portion_note: "Serve all components together on the plate.",
        preparation_shares: [
          { preparation_id: "prep_beef_stew", note: "one portion of beef stew" },
          { preparation_id: "prep_bean_stew", note: "one portion of bean stew" },
        ],
      },
    ],
    ["prep_beef_stew", "prep_bean_stew"],
    [],
    [{ preparation_id: "prep_beef_stew", member_ids: [THEODULE] }],
  );

  const kid = portions.find((p) => p.memberId === THEODULE)!;
  assertEquals(kid.preparationShares.map((s) => s.preparationId), ["prep_bean_stew"]);
  // ⛔ SA CONSIGNE PRINCIPALE SORT INTACTE. On refuse une AFFECTATION, on ne
  // récrit pas une phrase.
  assertEquals(kid.portionNote, "Serve all components together on the plate.");

  // ET L'ADULTE GARDE LES DEUX.
  const adult = portions.find((p) => p.memberId === AURELE)!;
  assertEquals(adult.preparationShares.length, 2);

  // ⚠️ TROIS NOMBRES, ET LE TROISIÈME NE SE DÉDUIT PAS: une part refusée par le
  // régime n'est pas une part orpheline.
  assertEquals(shareCounts, { shares: 3, unknown: 0, regime_refused: 1 });
  assert(
    issues.includes(`share_against_declared_line:${THEODULE}:prep_beef_stew`),
    issues.join("\n"),
  );
});

Deno.test("CEINTURE — sans refus, la seconde surface est byte-identique", () => {
  const { portions, issues, shareCounts } = reconcilePortions(
    [member(THEODULE, "Theodule")],
    [{
      member_id: THEODULE,
      portion_note: "Serve all components together on the plate.",
      preparation_shares: [
        { preparation_id: "prep_bean_stew", note: "one portion of bean stew" },
      ],
    }],
    ["prep_bean_stew"],
    [],
    [],
  );
  assertEquals(portions[0].preparationShares.length, 1);
  assertEquals(shareCounts, { shares: 1, unknown: 0, regime_refused: 0 });
  assertEquals(issues, []);
});

// ---------------------------------------------------------------------------
// 6 — LE PROMPT: L'EXCEPTION EST NOMMÉE, ET SEULEMENT SOUS LA DIVERGENCE
// ---------------------------------------------------------------------------

Deno.test("PROMPT — sans plat dédié, le bloc de régime est byte-identique", () => {
  // ⛔ LA LANE FOYER FRÔLE LE MUR DE TEMPS DU WORKER. Sans divergence, toute
  // préparation suit la ligne stricte: il n'y a rien à excepter, et le prompt
  // ne doit pas gagner un caractère.
  const block = householdDietBlock({
    strictest: "vegan",
    heldBy: ["Theodule"],
    divergingNames: [],
  });
  assertEquals(block.includes("never none"), false);
  assertEquals(block.includes("take no box"), false);
});

Deno.test("PROMPT — sous plat dédié, l'exception est nommée LITTÉRALEMENT", () => {
  // ⛔ LE MODÈLE N'AVAIT PAS DÉSOBÉI: IL AVAIT OBÉI. Le brief des boîtes lui
  // ordonne « Every name above is in exactly ONE box of each preparation --
  // never two, never none », et un plat dédié n'est pas borné par la ligne
  // stricte. Deux ordres contradictoires dans un seul prompt.
  const block = householdDietBlock({
    strictest: "vegan",
    heldBy: ["Theodule"],
    divergingNames: ["Aurele", "Marceline", "Solveig"],
  });
  assert(block.includes("Theodule take no box and no share"), block);
  // L'ÉCHAPPATOIRE, MOT POUR MOT — « sois cohérent » se fait satisfaire par une
  // paraphrase; la formule exacte du brief des boîtes, non.
  assert(block.includes('the one exception to "never none"'), block);
  // ET LA CONTREPARTIE, SANS QUOI LE MODÈLE RETIRE TOUT LE MONDE.
  assert(block.includes("the other names still get theirs"), block);
});

Deno.test("PROMPT — aucun régime déclaré: pas un octet", () => {
  assertEquals(
    householdDietBlock({
      strictest: null,
      heldBy: ["Theodule"],
      divergingNames: ["Aurele"],
    }),
    "",
  );
});

// ---------------------------------------------------------------------------
// 7 — LE BRANCHEMENT, LU DANS LA SOURCE DE LA LANE
// ---------------------------------------------------------------------------

Deno.test("BRANCHEMENT — la lane foyer passe les VRAIS régimes, pas un tableau vide", async () => {
  // ⛔ CE TEST EXISTE PARCE QUE LE DÉFAUT D'ORIGINE ÉTAIT UN BRANCHEMENT, PAS UN
  // MOTEUR. `scanDietaryRegime` était écrit, juste, testé — et il n'avait ZÉRO
  // appelant sur la lane foyer. Le typage force à passer QUELQUE CHOSE; il ne
  // peut pas empêcher de passer `[]`, qui compile, se teste vert partout, et
  // désarme la ceinture entière en silence. C'est le patron de
  // `dietary_regime_solo_lane_test.ts`, appliqué à la lane où la brèche a été
  // mesurée.
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(
    src.includes("boxMemberDiets: members.map((m) => ({"),
    "la lane foyer ne passe plus le régime de ses bouches au parseur",
  );
  assert(
    src.includes("regime: m.diet,"),
    "la lane foyer passe des bouches sans leur ligne déclarée",
  );
  assert(
    src.includes("meal.regime_refusals,"),
    "la seconde surface (`preparation_shares`) n'est plus ceinturée",
  );
  assert(
    src.includes("regime_belt: meal.regime_belt,"),
    "le compteur ne sort plus dans la trace: un run vert et un run qui sert " +
      "de la viande à un enfant végane redeviennent le même run",
  );
});

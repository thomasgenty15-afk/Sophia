// LE TEST DE CONTRAT — ce que la BASE contient vraiment traverse-t-il les
// parseurs ?
//
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
// ---------------------------------------------------------------------------
// Pendant la campagne du 2026-08-05/06, TROIS correctifs ont été livrés verts
// aux tests unitaires et muets en run réel. À chaque fois pour la même raison:
// le test décrivait une forme de payload que la PRODUCTION n'écrit pas, et un
// `as` sur un type étranger avait désarmé le typecheck qui l'aurait dit.
//
//   1. `uses[].preparationId` — le correctif ne lisait que le camelCase, alors
//      que `mealDishesPayload` sérialise `preparation_id`. 90 tests verts, le
//      rapprochement muet sur toute donnée écrite par le générateur.
//   2. `student_corrected` — l'UPDATE nommait une colonne qui n'existe pas, ce
//      qui fait rejeter l'UPDATE ENTIER par PostgREST. Décochage 0/7, en
//      silence.
//   3. `eating_rhythm` — le fixture QA écrivait des chaînes nues là où la vraie
//      carte écrit `[{slot, at}]`; le parseur les ignorait et retombait sur le
//      défaut, donc les mesures portaient sur le repli.
//
// ---------------------------------------------------------------------------
// LA RÈGLE DE CE FICHIER
// ---------------------------------------------------------------------------
// Les payloads ci-dessous sont COPIÉS VERBATIM de la base locale, sans
// reformatage ni renommage — c'est tout leur intérêt. Ils ne se «corrigent» pas
// pour faire passer un test: si un parseur cesse de les lire, c'est le parseur
// ou le SÉRIALISEUR qui a changé, et l'un des deux ment.
//
// Quand `mealDishesPayload` change de forme, ce fichier DOIT être mis à jour
// avec une nouvelle capture — délibérément, pas par accident. C'est la seule
// façon qu'un changement de sérialisation devienne visible.
//
// Capture: `select jsonb_pretty(d) from student_generated_meals m,
//           jsonb_array_elements(m.dishes) d where jsonb_array_length(d->'uses')>0`

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type FoodCatalogueItem,
  groupForTerm,
  matchPlannedDish,
  type PlannedDish,
  type PlannedPreparation,
} from "./planned_dish_match.ts";

// ---------------------------------------------------------------------------
// LES PAYLOADS RÉELS, tels que la base les rend
// ---------------------------------------------------------------------------

/** Capturé le 2026-08-06. Noter `uses[].preparationId` — forme HISTORIQUE. */
const REAL_DISH_CAMEL = {
  day: "wed",
  why: "The built plate, made from Wednesday evening cooking so midday takes four minutes.",
  slot: "lunch",
  uses: [{ servings: 1, preparationId: "prep_chicken_rice" }],
  title: "Chicken, brown rice and broccoli bowl",
  method: "Reheat the roast chicken and rice, steam the broccoli, finish with olive oil and lemon.",
  ingredients: [
    { term: "Broccoli", quantity: "150 g", in_pantry: false },
    { term: "Extra virgin olive oil", quantity: "1 tbsp", in_pantry: false },
    { term: "Lemon", quantity: "half", in_pantry: false },
  ],
  honours_belief_keys: ["protein_and_something_that_grew"],
};

/**
 * Capturé le 2026-08-06 sur une autre ligne. Noter `uses[].preparation_id` —
 * forme ACTUELLE, celle que `mealDishesPayload` écrit (`meal_generation.ts`).
 * LES DEUX COEXISTENT EN BASE, et c'est le fait qui a coûté un run.
 */
const REAL_USES_SNAKE = [{ servings: 1, preparation_id: "prep_chicken_rice" }];

/** Capturé avec le plat ci-dessus. Noter `servingsMade`, `cookOn`. */
const REAL_PREPARATIONS = [
  {
    id: "prep_chicken_rice",
    title: "Roast chicken and brown rice, batch",
    cookOn: "wed",
    method: "Roast the chicken breasts with olive oil, cook the rice alongside, cool and box in three.",
    ingredients: [
      { term: "Chicken breast", quantity: "600 g", in_pantry: false },
      { term: "Brown rice", quantity: "240 g dry", in_pantry: false },
      { term: "Extra virgin olive oil", quantity: "2 tbsp", in_pantry: false },
    ],
    servingsMade: 3,
  },
];

/** Un extrait fidèle de `food_items` (les libellés réels de la table). */
const CATALOGUE: FoodCatalogueItem[] = [
  { slug: "chicken_breast", label: "Chicken breast", food_group_ref: "poultry" },
  { slug: "brown_rice", label: "Brown rice", food_group_ref: "whole_grain" },
  { slug: "broccoli", label: "Broccoli", food_group_ref: "cruciferous_veg" },
  { slug: "olive_oil", label: "Extra virgin olive oil", food_group_ref: "olive_oil" },
  { slug: "lemon", label: "Lemon", food_group_ref: "citrus" },
];

/** Ce qu'une vraie photo d'assiette a produit, libellés du modèle inclus. */
const REAL_PLATE = {
  groups: ["poultry", "whole_grain", "cruciferous_veg"],
  labels: ["grilled chicken breast", "brown rice", "broccoli florets"],
  slot: "lunch",
};

// ---------------------------------------------------------------------------
// LE CONTRAT
// ---------------------------------------------------------------------------

Deno.test("CONTRAT: le plat réel, tel qu'il est en base, se rapproche", () => {
  // Sans lecture des préparations, ce plat n'a pour ingrédients que Broccoli,
  // olive oil et Lemon — il est ressorti `probable` à 0,5 en run réel,
  // rétrogradé par un citron que la photo ne peut pas montrer, et la coche
  // automatique ne se déclenchait JAMAIS sur la donnée livrée.
  const m = matchPlannedDish({
    plate: REAL_PLATE,
    dishes: [REAL_DISH_CAMEL as unknown as PlannedDish],
    catalogue: CATALOGUE,
    preparations: REAL_PREPARATIONS as unknown as PlannedPreparation[],
  });

  // CE QUE LA LECTURE DES PRÉPARATIONS A GAGNÉ, et c'était le point: le poulet
  // et le riz ne sont PAS dans `dish.ingredients` — ils vivent dans la
  // préparation que `uses` cite. Sans eux, ce plat n'avait qu'une ancre.
  assert(m.best!.anchorGroups.includes("poultry" as never));
  assert(m.best!.anchorGroups.includes("whole_grain" as never));
  assert(m.best!.anchorGroups.includes("cruciferous_veg" as never));
  assertEquals(m.best!.corroboratedGroups.length, 3);

  // ── ET CE QUI RESTE VRAI, MESURÉ ICI PLUTÔT QU'ESPÉRÉ ────────────────────
  // Le verdict est `probable`, PAS `confident`. Le demi-citron du plat résout
  // vers `citrus`, qui n'est pas dans `ACCESSORY_GROUPS`: il entre donc au
  // dénominateur des ancres et ne peut jamais être au numérateur — une photo
  // ne montre pas un citron pressé. Couverture 3/4.
  //
  // On NE «corrige» PAS en ajoutant `citrus` aux accessoires: une orange sur
  // une assiette est visible et doit compter. Le groupe ne distingue pas le
  // fruit de l'assaisonnement, et c'est une limite du vocabulaire, pas un bug
  // du rapprochement.
  //
  // CONSÉQUENCE À CONNAÎTRE: sur la composition réellement livrée, la coche
  // automatique NE SE DÉCLENCHE PAS. Ce test l'affirme exprès, pour que
  // personne ne re-découvre en run réel un silence qui est ici documenté.
  assertEquals(m.verdict, "probable");
  assertEquals(m.reason, "partial_cover");
  // `missingGroups` RAPPORTE tout ce qui manque, invisibles compris — c'est ce
  // qui rend une question intelligible. Seul le DÉNOMINATEUR exclut les
  // accessoires: l'huile y est rapportée sans pénaliser, le citron pénalise.
  assertEquals(m.best!.missingGroups, ["olive_oil", "citrus"]);
  assertEquals(m.best!.anchorGroups.includes("olive_oil" as never), false);
  assert(m.best!.anchorGroups.includes("citrus" as never));
});

Deno.test("CONTRAT: les DEUX casses de `uses` en base donnent le même verdict", () => {
  // LE FAUX VERT N°1. `mealDishesPayload` écrit `preparation_id`; des lignes
  // plus anciennes portent `preparationId`. Un parseur qui n'en lit qu'une est
  // muet sur la moitié de la base, et aucun typecheck ne le dit (le chargeur
  // fait `as PlannedDish[]` sur un jsonb).
  const camel = matchPlannedDish({
    plate: REAL_PLATE,
    dishes: [REAL_DISH_CAMEL as unknown as PlannedDish],
    catalogue: CATALOGUE,
    preparations: REAL_PREPARATIONS as unknown as PlannedPreparation[],
  });
  const snake = matchPlannedDish({
    plate: REAL_PLATE,
    dishes: [
      { ...REAL_DISH_CAMEL, uses: REAL_USES_SNAKE } as unknown as PlannedDish,
    ],
    catalogue: CATALOGUE,
    preparations: REAL_PREPARATIONS as unknown as PlannedPreparation[],
  });
  assertEquals(snake.verdict, camel.verdict);
  assertEquals(snake.best?.coverage, camel.best?.coverage);
  assertEquals(
    snake.best?.anchorGroups.length,
    camel.best?.anchorGroups.length,
  );
});

Deno.test("CONTRAT: chaque `term` réel du plat se résout, ou est nommé ici", () => {
  // Un terme non résolu RÉDUIT le dénominateur des ancres, donc rend
  // `confident` PLUS facile — un catalogue troué relâche la garde au lieu de la
  // serrer. Ce test n'exige pas que tout se résolve; il exige qu'on SACHE ce
  // qui ne se résout pas, au lieu de le découvrir en run réel.
  const terms = [
    ...REAL_DISH_CAMEL.ingredients.map((i) => i.term),
    ...REAL_PREPARATIONS.flatMap((p) => p.ingredients.map((i) => i.term)),
  ];
  const unresolved = terms.filter((t) => groupForTerm(t, CATALOGUE) === null);
  assertEquals(
    unresolved,
    [],
    `termes non résolus par ce catalogue: ${unresolved.join(", ")}`,
  );
});

Deno.test("CONTRAT: les clés de la préparation réelle sont celles qu'on lit", () => {
  // `id` et `ingredients` sont les deux seules clés dont le rapprochement
  // dépend. Si le sérialiseur les renomme, ce test tombe AVANT le run réel.
  const prep = REAL_PREPARATIONS[0] as Record<string, unknown>;
  assert("id" in prep, "la préparation réelle n'a plus de clé `id`");
  assert("ingredients" in prep, "la préparation réelle n'a plus d'`ingredients`");
  assert(Array.isArray(prep.ingredients));
  for (const ing of prep.ingredients as Array<Record<string, unknown>>) {
    assert("term" in ing, "un ingrédient réel n'a plus de clé `term`");
  }
});

Deno.test("CONTRAT: un `uses` qui ne cite aucune préparation connue ne jette pas", () => {
  // La condition de désarmement du contrat lui-même: une composition dont les
  // préparations manquent (ligne ancienne, régénération partielle) doit
  // dégrader vers « on ne lit que le plat », jamais lever.
  const m = matchPlannedDish({
    plate: REAL_PLATE,
    dishes: [REAL_DISH_CAMEL as unknown as PlannedDish],
    catalogue: CATALOGUE,
    preparations: [],
  });
  // Le brocoli seul: une ancre visible sur une, plus le citron invisible…
  // le verdict importe moins que le fait qu'on arrive ici sans exception.
  assert(["confident", "probable", "none"].includes(m.verdict));
});

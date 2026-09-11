// ⟳ LOT `L17-0` — LE GROUPE QUE LE MODÈLE DÉCLARE ATTEINT LA BASE.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LE DÉFAUT, MESURÉ, ET IL N'ÉTAIT PAS CELUI QUE LE PLAN ANNONÇAIT
// ══════════════════════════════════════════════════════════════════════════
// Le plan de chantier lisait « 0 ligne d'ingrédient sur 9 810 ne porte un
// groupe » comme « le modèle n'obéit pas ». Trois mesures, 2026-08-21 et
// 2026-08-22, disent l'inverse:
//
//   ① `FOOD_GROUP_DECLARATION_BLOCK` est arrivé avec `meal.en.v16` le
//      2026-08-19: **3 plans sur 182** ont été générés sous v16+.
//   ② Sur ces trois-là le modèle a OBÉI: `groups_declared` = 25 / 134 / 83,
//      soit **242 déclarations, 232 valides**.
//   ③ ⛔ Et `ingredientPayload()` recopiait SEPT clés en dur, sans `group`.
//      **242 déclarés, 0 persistés — 100 % d'écart, et rien ne le disait.**
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE QUE CES ÉPREUVES PROTÈGENT, ET POURQUOI UN TEST DE FORME NE SUFFIT PAS
// ══════════════════════════════════════════════════════════════════════════
//   * `ingredientPayload` recopiait déjà sept clés « correctement ». Un test
//     qui vérifie qu'un payload a la bonne FORME serait resté vert pendant
//     toute la durée du défaut. Ce qui manque à un champ déclaré par un modèle
//     est un COMPTEUR — et ces épreuves testent le compteur autant que la clé.
//   * LES DEUX POPULATIONS. `declared` et `persisted` côte à côte: sans elles,
//     un modèle qui cesse de déclarer et une écriture réparée rendent le même
//     zéro final, et appellent deux corrections opposées.
//   * L'ÉCART A LE DROIT DE S'OUVRIR, et c'est pour ça qu'il se COMPTE au lieu
//     de s'asserter. Une ligne comptée puis jetée par une garde aval est une
//     information vraie sur le run. Ce qu'on refuse, c'est de ne pas la voir.
//   * LES PRÉPARATIONS. Elles sont **32 %** des lignes d'ingrédient de la base
//     (3 202 sur 10 053). Un compteur qui les oublie sous-compte d'un tiers et
//     ne le dit jamais.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  foodGroupWriteCounts,
  foodGroupWriteGap,
  INGREDIENT_GROUP_KEY,
  ingredientGroupPayload,
  persistedGroupOf,
} from "./food_group_write.ts";
import {
  mealDishesPayload,
  mealPreparationsPayload,
  parseGeneratedMeal,
} from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE BANC
// ---------------------------------------------------------------------------

function parse(payload: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return parseGeneratedMeal(payload, {
    doctrine: null,
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
    standardRecipe: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
    ...over,
  });
}

/** Une ligne d'ingrédient telle que le PAYLOAD la porte. */
function writtenRow(group: string | null | undefined): Record<string, unknown> {
  const row: Record<string, unknown> = {
    term: "black beans",
    quantity: "200 g",
    in_pantry: false,
    amount: 200,
    unit: "g",
    state: "raw",
    grams_raw: 200,
  };
  if (group !== undefined) row[INGREDIENT_GROUP_KEY] = group;
  return row;
}

/** Un porteur de payload (plat ou préparation) et ses lignes. */
function carrier(...rows: Record<string, unknown>[]) {
  return { title: "Bean stew", ingredients: rows };
}

/**
 * LES LIGNES D'UN PORTEUR DE PAYLOAD, SANS `as`.
 *
 * ⚠️ Un `as` sur la sortie du payload désarmerait le typecheck exactement là où
 * ce lot veut qu'il morde: la charge est un `Record<string, unknown>`, et une
 * clé perdue doit se voir. On restreint par un test de forme, jamais par un
 * cast.
 */
function rowsOf(carriers: ReadonlyArray<Record<string, unknown>>, at: number) {
  const rows = carriers[at]?.ingredients;
  assert(Array.isArray(rows), `pas de lignes d'ingrédient en position ${at}`);
  return rows as ReadonlyArray<unknown>;
}

const NOTHING_DECLARED = { groups_declared: 0, groups_valid: 0, groups_refused: 0 };
const EMPTY = { dishes: [], preparations: [] } as const;

// ---------------------------------------------------------------------------
// 1 — LE CAS QUI PASSE, ÉCRIT EN PREMIER
// ---------------------------------------------------------------------------
//
// ⚠️ RÈGLE DE LA MAISON: une garde cassée refuse tout et ressemble trait pour
// trait à une garde qui marche. Le cas nominal s'écrit AVANT les morsures.

Deno.test("L17-0 — un groupe valide écrit sur la ligne est COMPTÉ persisté", () => {
  const counts = foodGroupWriteCounts(
    { groups_declared: 1, groups_valid: 1, groups_refused: 0 },
    { dishes: [carrier(writtenRow("legumes"))], preparations: [] },
  );
  assertEquals(counts, {
    declared: 1,
    valid: 1,
    refused: 0,
    persisted: 1,
    lines: 1,
  });
  // ⛔ LE SEUIL DU LOT, EN UN NOMBRE: l'écart déclaré ↔ persisté tombe à zéro.
  assertEquals(foodGroupWriteGap(counts), 0);
});

Deno.test("L17-0 — aucune déclaration: les cinq nombres sont à zéro, sans ambiguïté", () => {
  // La population NOMINALE tant que la consigne voyage avec la ligne de régime.
  // `persisted: 0` ici ne dit PAS « l'écriture est cassée »: `declared: 0` le
  // dit, et c'est précisément la distinction que ce lot existe pour rendre.
  const counts = foodGroupWriteCounts(NOTHING_DECLARED, {
    dishes: [carrier(writtenRow(null))],
    preparations: [],
  });
  assertEquals(counts.declared, 0);
  assertEquals(counts.persisted, 0);
  assertEquals(counts.lines, 1);
  assertEquals(foodGroupWriteGap(counts), 0);
});

// ---------------------------------------------------------------------------
// 2 — LA CLÉ RETIRÉE DU PAYLOAD: LE DÉFAUT RÉEL, REJOUÉ
// ---------------------------------------------------------------------------

Deno.test("⛔ L17-0 — la clé absente du payload ouvre l'écart en grand", () => {
  // C'est l'état exact de la base au 2026-08-22: le modèle avait déclaré, la
  // ceinture avait compté, et la ligne écrite ne portait pas la clé.
  const counts = foodGroupWriteCounts(
    { groups_declared: 25, groups_valid: 25, groups_refused: 0 },
    { dishes: [carrier(writtenRow(undefined), writtenRow(undefined))], preparations: [] },
  );
  assertEquals(counts.persisted, 0);
  assertEquals(counts.lines, 2);
  // 25 déclarés, 0 persistés: l'écart de 100 % qui a coûté ce lot.
  assertEquals(foodGroupWriteGap(counts), 25);
});

Deno.test("⛔ L17-0 — une clé VIDE ne vaut pas un groupe", () => {
  // Un modèle en mode JSON rend parfois `""`. Le compter persisté rendrait un
  // lot désarmé identique à un lot qui marche.
  for (const empty of ["", "   "]) {
    const counts = foodGroupWriteCounts(
      { groups_declared: 1, groups_valid: 1, groups_refused: 0 },
      { dishes: [carrier(writtenRow(empty))], preparations: [] },
    );
    assertEquals(counts.persisted, 0, `« ${empty} » ne doit pas compter`);
  }
});

// ---------------------------------------------------------------------------
// 3 — LE VOCABULAIRE FERMÉ EST RELU SUR LA LIGNE ÉCRITE
// ---------------------------------------------------------------------------

Deno.test("⛔ L17-0 — un slug inventé n'est JAMAIS compté persisté", () => {
  // Si quelqu'un écrivait un jour la chaîne BRUTE du modèle au lieu du ref
  // validé, un compteur crédule rendrait « persisté » un groupe inventé — et
  // `L17` bornerait un inconnu avec une bande qui n'existe pas.
  for (const invented of ["meat", "vegetables", "fish", "GLUCIDES"]) {
    assertEquals(persistedGroupOf(writtenRow(invented)), null, invented);
  }
  const counts = foodGroupWriteCounts(
    { groups_declared: 2, groups_valid: 1, groups_refused: 1 },
    { dishes: [carrier(writtenRow("legumes"), writtenRow("meat"))], preparations: [] },
  );
  assertEquals(counts.persisted, 1);
  assertEquals(counts.refused, 1);
  assertEquals(foodGroupWriteGap(counts), 0);
});

Deno.test("L17-0 — l'alias d'entrée du parseur est honoré, et une seule fois", () => {
  // `whole_grains` → `whole_grain` est un alias de `parseFoodGroupRef`. Le
  // compteur passe par LUI, jamais par un `new Set(FOOD_GROUP_REFS)` local:
  // deux lectures du même vocabulaire divergeraient au premier ajout.
  assertEquals(persistedGroupOf(writtenRow("whole_grains")), "whole_grain");
});

Deno.test("L17-0 — une ligne difforme ne fait JAMAIS tomber le compteur", () => {
  // On lit un `jsonb` qui part en base, pas une structure typée. Un compteur
  // qui lève sur une forme inattendue ferait tomber le plan qu'il mesure.
  for (const junk of [null, undefined, 42, "legumes", [], { ingredients: "no" }]) {
    assertEquals(persistedGroupOf(junk), null);
    const counts = foodGroupWriteCounts(NOTHING_DECLARED, {
      dishes: [junk],
      preparations: [],
    });
    assertEquals(counts.lines, 0);
    assertEquals(counts.persisted, 0);
  }
});

// ---------------------------------------------------------------------------
// 4 — LES PRÉPARATIONS COMPTENT AUTANT QUE LES PLATS
// ---------------------------------------------------------------------------

Deno.test("⛔ L17-0 — un groupe déclaré dans une PRÉPARATION est compté", () => {
  // 3 202 des 10 053 lignes d'ingrédient de la base vivent dans une
  // préparation. Un compteur qui ne lirait que `dishes` sous-compterait d'un
  // tiers, silencieusement, et le seuil du lot serait faux dans le bon sens.
  const counts = foodGroupWriteCounts(
    { groups_declared: 2, groups_valid: 2, groups_refused: 0 },
    {
      dishes: [carrier(writtenRow("leafy_greens"))],
      preparations: [carrier(writtenRow("legumes"))],
    },
  );
  assertEquals(counts.persisted, 2);
  assertEquals(counts.lines, 2);
  assertEquals(foodGroupWriteGap(counts), 0);

  // ⛔ ET LA MOITIÉ SEULE NE SUFFIT PAS: sans les préparations, 1 sur 2.
  const dishesOnly = foodGroupWriteCounts(
    { groups_declared: 2, groups_valid: 2, groups_refused: 0 },
    { dishes: [carrier(writtenRow("leafy_greens"))], preparations: [] },
  );
  assertEquals(dishesOnly.persisted, 1);
  assertEquals(foodGroupWriteGap(dishesOnly), 1);
});

// ---------------------------------------------------------------------------
// 5 — L'ÉCART EST UNE MESURE, PAS UNE ASSERTION
// ---------------------------------------------------------------------------

Deno.test("⛔ L17-0 — une ligne comptée puis JETÉE ouvre l'écart, et c'est vrai", () => {
  // Une casserole refusée par la ceinture de régime, un plat au macro chiffré,
  // un verrou de sortie: la déclaration a été comptée, la ligne n'existe plus.
  // ⛔ SI `persisted` ÉTAIT CLOUÉ À `valid`, ce cas rendrait zéro et le
  // compteur ne mesurerait plus rien — c'est la mutation que ce test tue.
  const counts = foodGroupWriteCounts(
    { groups_declared: 3, groups_valid: 3, groups_refused: 0 },
    { dishes: [carrier(writtenRow("legumes"))], preparations: [] },
  );
  assertEquals(counts.valid, 3);
  assertEquals(counts.persisted, 1);
  assertEquals(foodGroupWriteGap(counts), 2);
});

Deno.test("⛔ L17-0 — l'écart peut être NÉGATIF, et il n'est pas borné à zéro", () => {
  // Un `persisted` supérieur à `valid` voudrait dire qu'une ligne porte un
  // groupe que la ceinture n'a jamais compté: un SECOND écrivain. Le cacher
  // derrière un `Math.max(0, …)` est la façon dont on découvre un jumeau trois
  // mois trop tard — la cicatrice « deux copies d'un même nombre divergent ».
  const counts = foodGroupWriteCounts(NOTHING_DECLARED, {
    dishes: [carrier(writtenRow("legumes"))],
    preparations: [],
  });
  assertEquals(counts.persisted, 1);
  assertEquals(foodGroupWriteGap(counts), -1);
});

Deno.test("L17-0 — le dénominateur distingue « aucune ligne » de « aucun groupe »", () => {
  const nothing = foodGroupWriteCounts(NOTHING_DECLARED, EMPTY);
  assertEquals(nothing.lines, 0);
  const many = foodGroupWriteCounts(NOTHING_DECLARED, {
    dishes: [carrier(writtenRow(null), writtenRow(null), writtenRow(null))],
    preparations: [],
  });
  assertEquals(many.lines, 3);
  assertEquals(many.persisted, 0);
  // Les deux rendent `persisted: 0`. Seul `lines` les sépare.
  assert(nothing.lines !== many.lines);
});

// ---------------------------------------------------------------------------
// 6 — LE FRAGMENT D'ÉCRITURE ET LE COMPTEUR LISENT LA MÊME CLÉ
// ---------------------------------------------------------------------------

Deno.test("L17-0 — l'écrivain et le compteur ne peuvent pas se rater", () => {
  // Un compteur branché sur une clé que personne n'écrit « marche » à jamais.
  // Le nom n'a donc qu'un site: `INGREDIENT_GROUP_KEY`.
  assertEquals(ingredientGroupPayload("legumes"), { group: "legumes" });
  assertEquals(ingredientGroupPayload(null), { group: null });
  assertEquals(persistedGroupOf(ingredientGroupPayload("legumes")), "legumes");
  assertEquals(persistedGroupOf(ingredientGroupPayload(null)), null);
  // ⚠️ LA CLÉ EST ÉCRITE MÊME À `null`: une clé absente ne se distingue pas
  // d'un lot débranché. Conséquence pour toute mesure SQL: `ing ? 'group'`
  // devient vrai partout — seul `ing->>'group' is not null` dit quelque chose.
  assert(INGREDIENT_GROUP_KEY in ingredientGroupPayload(null));
});

// ---------------------------------------------------------------------------
// 7 — DE BOUT EN BOUT, PAR LE VRAI ÉCRIVAIN
// ---------------------------------------------------------------------------
//
// ⚠️ CES ÉPREUVES TRAVERSENT `meal_generation.ts`. C'est là que vivait le
// défaut, et aucun test du module pur ne peut le voir: la fonction fautive
// recopiait sept clés « correctement ».

const PLAN_WITH_GROUPS = {
  preparations: [{
    id: "prep_beans",
    title: "Smoky black beans",
    servings_made: 4,
    method: "Simmer them low.",
    active_minutes: 10,
    total_minutes: 45,
    ingredients: [
      { term: "black beans, drained", quantity: "800 g", group: "legumes" },
      { term: "olive oil", quantity: "2 tbsp", group: "olive_oil" },
    ],
  }],
  dishes: [{
    title: "Bean bowl",
    slot: "dinner",
    day: "mon",
    method: "Reheat and top with the greens.",
    why: "It works.",
    honours_belief_keys: [],
    ingredients: [
      { term: "baby spinach", quantity: "80 g", group: "leafy_greens" },
      { term: "brown rice", quantity: "150 g", group: "whole_grain" },
    ],
    uses: [{ preparation_id: "prep_beans", servings: 1 }],
  }],
  shopping_list: [],
};

Deno.test("⛔ L17-0 — `ingredientPayload` ne jette PLUS la clé du modèle", () => {
  const meal = parse(structuredClone(PLAN_WITH_GROUPS));

  // ① Le modèle a été entendu: la ceinture a compté quatre déclarations valides.
  assertEquals(meal.regime_belt.groups_declared, 4);
  assertEquals(meal.regime_belt.groups_valid, 4);
  assertEquals(meal.regime_belt.groups_refused, 0);

  // ② Et la CHARGE ÉCRITE les porte. C'est la ligne qui manquait.
  const dishes = mealDishesPayload(meal);
  const preparations = mealPreparationsPayload(meal);
  const counts = foodGroupWriteCounts(meal.regime_belt, { dishes, preparations });

  assertEquals(counts.lines, 4);
  assertEquals(counts.persisted, 4);
  // ⛔ LE SEUIL DU LOT: l'écart déclaré ↔ persisté tombe à zéro.
  assertEquals(foodGroupWriteGap(counts), 0);

  // ③ Nommément, et des DEUX côtés — les préparations ne sont pas un détail.
  assertEquals(persistedGroupOf(rowsOf(dishes, 0)[0]), "leafy_greens");
  assertEquals(persistedGroupOf(rowsOf(dishes, 0)[1]), "whole_grain");
  assertEquals(persistedGroupOf(rowsOf(preparations, 0)[0]), "legumes");
  assertEquals(persistedGroupOf(rowsOf(preparations, 0)[1]), "olive_oil");
});

Deno.test("⛔ L17-0 — la clé est écrite même quand le modèle n'a rien déclaré", () => {
  // Sinon « le lot n'est pas branché » et « ce plan n'avait pas de régime » sont
  // le même silence.
  const plan = structuredClone(PLAN_WITH_GROUPS);
  for (const d of plan.dishes) for (const i of d.ingredients) delete (i as { group?: unknown }).group;
  for (const p of plan.preparations) {
    for (const i of p.ingredients) delete (i as { group?: unknown }).group;
  }

  const meal = parse(plan);
  assertEquals(meal.regime_belt.groups_declared, 0);

  const dishes = mealDishesPayload(meal);
  const preparations = mealPreparationsPayload(meal);
  for (const row of [...rowsOf(dishes, 0), ...rowsOf(preparations, 0)]) {
    assert(row !== null && typeof row === "object", "une ligne doit être un objet");
    assert(INGREDIENT_GROUP_KEY in row, "la clé doit exister même à null");
    assertEquals(Object.getOwnPropertyDescriptor(row, INGREDIENT_GROUP_KEY)?.value, null);
  }

  const counts = foodGroupWriteCounts(meal.regime_belt, { dishes, preparations });
  assertEquals(counts, { declared: 0, valid: 0, refused: 0, persisted: 0, lines: 4 });
});

Deno.test("⛔ L17-0 — un slug inventé est compté refusé et n'atteint pas la ligne", () => {
  const plan = structuredClone(PLAN_WITH_GROUPS);
  plan.dishes[0].ingredients[0].group = "vegetables";

  const meal = parse(plan);
  assertEquals(meal.regime_belt.groups_declared, 4);
  assertEquals(meal.regime_belt.groups_valid, 3);
  assertEquals(meal.regime_belt.groups_refused, 1);

  const dishes = mealDishesPayload(meal);
  const preparations = mealPreparationsPayload(meal);
  const counts = foodGroupWriteCounts(meal.regime_belt, { dishes, preparations });

  // Le refus est SILENCIEUX sur la ligne (`null`) et BRUYANT dans le compteur.
  assertEquals(persistedGroupOf(rowsOf(dishes, 0)[0]), null);
  assertEquals(counts.persisted, 3);
  // ⛔ L'écart se compte contre `valid`, pas contre `declared`: un slug inventé
  // est légitimement absent de la ligne, et le faire entrer dans l'écart
  // rendrait le seuil inatteignable dès qu'un modèle se trompe une fois.
  assertEquals(foodGroupWriteGap(counts), 0);
});

Deno.test("⛔ L17-0 — `null` écrit en toutes lettres n'est pas un refus", () => {
  // L'échappatoire NOMMÉE de la consigne. La compter comme un refus punirait le
  // modèle d'avoir obéi, et ferait croire à une désobéissance qui n'existe pas.
  const plan = structuredClone(PLAN_WITH_GROUPS);
  plan.dishes[0].ingredients[0].group = "null";

  const meal = parse(plan);
  assertEquals(meal.regime_belt.groups_declared, 3);
  assertEquals(meal.regime_belt.groups_refused, 0);

  const counts = foodGroupWriteCounts(meal.regime_belt, {
    dishes: mealDishesPayload(meal),
    preparations: mealPreparationsPayload(meal),
  });
  assertEquals(counts.persisted, 3);
  assertEquals(counts.lines, 4);
  assertEquals(foodGroupWriteGap(counts), 0);
});

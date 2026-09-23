/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN ITEM DE CONTENANT ÉCRIT EN FORME D'INGRÉDIENT — 2026-09-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CES ÉPREUVES TIENNENT, MESURÉ AU CARACTÈRE ──────────────
 * Sous `sizingPath === "portion_v1"`, `household_meal_generation.ts` ne sert
 * PAS `boxSchemaBlock` — or c'était le seul endroit du prompt qui nommait la
 * clé `grams` d'un item de contenant. Le bloc de régime, lui, ordonne toujours
 * « the one component that line refuses is served PER BOX ... with its own
 * "items" » (`household_diet.ts`). Le modèle écrit donc la seule forme d'item
 * qu'on lui enseigne, celle d'un INGRÉDIENT.
 *
 * Tir réel N=2 du 2026-09-13 (`gain-lot3r2-2026-09-13T17-02-19-343Z`), premier
 * jet, quatre repas principaux:
 *
 *     {"term":"ham","quantity":"6 unités de jambon","amount":6,"unit":"unit",
 *      "state":"raw","part":"main","ref":"ham","group":"red_meat"}
 *     {"term":"tofu","quantity":"150 g de tofu","amount":150,"unit":"g", …}
 *
 * Le lecteur n'acceptait que `it.grams`: **8 items sur 8 jetés**,
 * `delivery: "none_delivered"`, et avec eux l'ancre protéique de ces quatre
 * repas — le jambon de Max et le tofu de Lea, c'est-à-dire très exactement le
 * partage par régime que le prompt venait d'ordonner.
 *
 * ── CE QUE CHAQUE ÉPREUVE TIENT ──────────────────────────────────────────
 *   ① le chemin `grams` NE BOUGE PAS: même nombre, même `ref: null`;
 *   ② la forme d'ingrédient est pesée PAR LE RÉFÉRENTIEL — « 6 unités » de
 *      jambon passent par `unit_grams`, jamais par un barème écrit à la main,
 *      et le résultat est en grammes PRÊTS (le rendement s'applique);
 *   ③ les deux sacs sont DISTINCTS et somment à `items`: sans ça, un prompt qui
 *      cesserait de nommer la clé ressemblerait trait pour trait à un prompt
 *      qui la nomme;
 *   ④ les contre-cas MORDENT: un aliment que le référentiel ne connaît pas, et
 *      un aliment connu SANS aucune quantité lisible, restent refusés.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type GeneratedMeal,
  type MealScope,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import { householdDietBlock } from "./household_diet.ts";
import { boxItemSchemaLines } from "./household_portions.ts";

const MAX = "11111111-1111-4111-8111-111111111111";
const LEA = "22222222-2222-4222-8222-222222222222";

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
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

/**
 * ⚠️ `ham` PORTE `unitGrams` ET UN RENDEMENT ≠ 1: les deux moitiés de la
 * conversion sont dans la même fixture. Un lecteur qui oublierait `unit_grams`
 * rendrait `null`; un lecteur qui oublierait le rendement rendrait 180 au lieu
 * de 126, et les deux erreurs sont invisibles sur un aliment neutre pesé en
 * grammes.
 */
const INDEX = buildCompositionIndex(
  [
    ref({
      slug: "ham",
      foodGroupRef: "red_meat",
      yieldClass: "meat_shrinks",
      unitGrams: 30,
      proteinG: 20,
    }),
    ref({ slug: "tofu", foodGroupRef: "tofu_tempeh", proteinG: 14.9 }),
    ref({
      slug: "wholewheat_pasta",
      foodGroupRef: "whole_grain",
      yieldClass: "grain_absorbs",
    }),
  ],
  [{ alias: "jambon", slug: "ham" }],
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
  daysToFill: ["mon", "tue"],
  awayDays: [],
  cookingTimeMin: null,
  composition: INDEX as CompositionIndex | null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [MAX, LEA] as readonly string[],
  weighedMemberIds: [] as readonly string[],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  standardRecipe: false,
  boxMemberDiets: [] as readonly { memberId: string; regime: DietaryRegime | null }[],
  boxMemberExclusions: [],
};

function prep() {
  return {
    id: "prep_lunch_base",
    title: "Base de pâtes complètes",
    servings_made: 2,
    method: "Boil it.",
    active_minutes: 10,
    total_minutes: 20,
    cook_on: "mon",
    ingredients: [{
      term: "wholewheat_pasta",
      ref: "wholewheat_pasta",
      refRefused: false,
      quantity: "154 g de pâtes complètes sèches",
      amount: 154,
      unit: "g",
      state: "raw",
    }],
  };
}

function dish(boxes: unknown[]) {
  return {
    title: "Pâtes complètes et garniture protéinée",
    day: "mon",
    slot: "lunch",
    method: "Sors ta boîte et réchauffe.",
    why: "Ça réchauffe bien.",
    ingredients: [],
    uses: [{ preparation_id: "prep_lunch_base", servings: 1 }],
    boxes,
  };
}

function parse(boxes: unknown[]): GeneratedMeal {
  return parseGeneratedMeal({
    preparations: [prep()],
    dishes: [dish(boxes)],
    shopping_list: [],
  }, PARSE_BASE);
}

/** L'item tel que le modèle l'a réellement écrit le 2026-09-13. */
const HAM_AS_WRITTEN = {
  term: "ham",
  quantity: "6 unités de jambon",
  amount: 6,
  unit: "unit",
  state: "raw",
  part: "main",
  ref: "ham",
  group: "red_meat",
};

const TOFU_AS_WRITTEN = {
  term: "tofu",
  quantity: "150 g de tofu",
  amount: 150,
  unit: "g",
  state: "raw",
  part: "main",
  ref: "tofu",
  group: "tofu_tempeh",
};

// ---------------------------------------------------------------------------
// ① LE CHEMIN `grams` — CELUI QUI MARCHAIT, ET QUI NE BOUGE PAS
// ---------------------------------------------------------------------------

Deno.test("① le schéma v4 (`grams`) rend exactement ce qu'il rendait", () => {
  const meal = parse([{
    id: "box_mon_lunch",
    member_ids: [MAX, LEA],
    items: [{ preparation_id: "prep_lunch_base", term: "roast chicken", grams: 320 }],
  }]);
  assertEquals(meal.dishes[0].boxes[0].items, [{
    preparationId: "prep_lunch_base",
    term: "roast chicken",
    grams: 320,
    // ⚠️ TOUJOURS `null` SUR CE CHEMIN: rien n'a été lu, donc rien n'est
    // affirmé. Le rapprochement par le terme reste interdit (« sel de cuisson »
    // et « sel de finition » sont deux lignes du même plat).
    ref: null,
    refRefused: false,
    // ⟳ 2026-09-22 — ET AUCUN VOLUME, PAR LA MÊME ABSTENTION: sans identifiant,
    // il n'y a aucune fiche à interroger, et on ne cherche pas la densité d'un
    // libellé.
    ml: null,
  }]);
  assertEquals(meal.box_counts.items, 1);
  assertEquals(meal.box_counts.items_in_grams, 1);
  assertEquals(meal.box_counts.items_from_ingredient, 0);
  assertEquals(meal.box_counts.items_refused, 0);
});

// ---------------------------------------------------------------------------
// ② LA FORME D'INGRÉDIENT — PESÉE PAR LE RÉFÉRENTIEL, PAS PAR UN BARÈME
// ---------------------------------------------------------------------------

Deno.test("② « 6 unités de jambon » deviennent 126 g PRÊTS, par `unit_grams` et le rendement", () => {
  const meal = parse([
    { id: "max_box", member_ids: [MAX], items: [HAM_AS_WRITTEN] },
    { id: "lea_box", member_ids: [LEA], items: [TOFU_AS_WRITTEN] },
  ]);
  // 6 × 30 g = 180 g CRUS; `meat_shrinks` (0,7) ⇒ 126 g prêts dans la boîte.
  // ⛔ LE NOMBRE EST ÉCRIT À LA MAIN ICI, ET IL DOIT L'ÊTRE: le recalculer avec
  // les fonctions testées ferait passer l'épreuve quelle que soit la règle.
  assertEquals(meal.dishes[0].boxes[0].items, [{
    preparationId: null,
    term: "ham",
    grams: 126,
    // ⟳ L'IDENTITÉ QUI A PESÉ L'ITEM LE SUIT: c'est `ref` qui a rendu les
    // grammes, la jeter obligerait tout lecteur en aval à re-deviner l'aliment
    // par son libellé — le chemin qui a servi du raisin sec pour du frais.
    ref: "ham",
    refRefused: false,
    // ⟳ 2026-09-22 — `null`: le jambon ne se verse pas. Le volume ne sort que
    // des lignes que le référentiel déclare versables (`grams_per_ml`).
    ml: null,
  }]);
  // 150 g, rendement 1,0: la boîte porte 150.
  assertEquals(meal.dishes[0].boxes[1].items, [{
    preparationId: null,
    term: "tofu",
    grams: 150,
    ref: "tofu",
    refRefused: false,
    ml: null,
  }]);
  assertEquals(meal.box_counts.items, 2);
  assertEquals(meal.box_counts.items_in_grams, 0);
  assertEquals(meal.box_counts.items_from_ingredient, 2);
  assertEquals(meal.box_counts.items_refused, 0);
  // ⛔ ET LES DEUX CONTENANTS SONT SERVIS. Avant ce lot ils tombaient tous les
  // deux par `nothing to put in it, dropped`.
  assertEquals(meal.box_counts.boxes, 2);
  assertEquals(meal.box_counts.refused, 0);
  assert(
    !meal.issues.some((i) => i.includes("has no usable grams")),
    `aucun refus attendu, vu: ${meal.issues.join(" | ")}`,
  );
});

Deno.test("③ les deux sacs sont DISTINCTS et somment à `items`", () => {
  const meal = parse([{
    id: "box_mon_lunch",
    member_ids: [MAX, LEA],
    items: [
      HAM_AS_WRITTEN,
      { preparation_id: "prep_lunch_base", term: "pâtes", grams: 400 },
    ],
  }]);
  assertEquals(meal.box_counts.items, 2);
  assertEquals(meal.box_counts.items_in_grams, 1);
  assertEquals(meal.box_counts.items_from_ingredient, 1);
  assertEquals(
    meal.box_counts.items_in_grams + meal.box_counts.items_from_ingredient,
    meal.box_counts.items,
  );
});

// ---------------------------------------------------------------------------
// ④ LES CONTRE-CAS — CE QUE LE LECTEUR REFUSE TOUJOURS
// ---------------------------------------------------------------------------

Deno.test("④ un aliment que le référentiel ne connaît pas reste REFUSÉ", () => {
  const meal = parse([{
    id: "box_mon_lunch",
    member_ids: [MAX, LEA],
    items: [{
      term: "seitan maison",
      quantity: "120 g de seitan",
      amount: 120,
      unit: "g",
      state: "raw",
    }],
  }]);
  assertEquals(meal.box_counts.items, 0);
  assertEquals(meal.box_counts.items_from_ingredient, 0);
  assertEquals(meal.box_counts.items_refused, 1);
  assert(
    meal.issues.some((i) => i.includes("has no usable grams")),
    `refus attendu, vu: ${meal.issues.join(" | ")}`,
  );
});

Deno.test("④ bis — un aliment CONNU sans aucune quantité lisible reste REFUSÉ", () => {
  const meal = parse([{
    id: "box_mon_lunch",
    member_ids: [MAX, LEA],
    items: [{
      term: "ham",
      // « une belle tranche » n'est pas une quantité: ni `grams`, ni
      // `amount`/`unit`, et la prose ne porte aucun nombre.
      quantity: "une belle tranche de jambon",
      state: "raw",
      ref: "ham",
    }],
  }]);
  assertEquals(meal.box_counts.items, 0);
  assertEquals(meal.box_counts.items_from_ingredient, 0);
  assertEquals(meal.box_counts.items_refused, 1);
});

Deno.test("④ ter — « 2 » sans unité n'est pas une quantité: REFUSÉ", () => {
  // ⛔ UN DÉNOMBREMENT N'EST PAS UNE MASSE tant qu'on ne dit pas de quoi. C'est
  // la règle de `gramsRawOf`, et elle doit survivre à ce chemin: sans elle, le
  // lecteur inventerait un nombre à l'endroit même où l'ancien refusait.
  const meal = parse([{
    id: "box_mon_lunch",
    member_ids: [MAX, LEA],
    items: [{ term: "ham", amount: 2, state: "raw", ref: "ham" }],
  }]);
  assertEquals(meal.box_counts.items, 0);
  assertEquals(meal.box_counts.items_refused, 1);
});

Deno.test("④ quater — sans référentiel, la forme d'ingrédient ne pèse rien", () => {
  // « Je ne sais rien » n'est pas « c'est faux »: le plan n'est pas refusé, mais
  // aucun gramme n'est inventé. Le chemin `grams`, lui, continue de passer.
  const meal = parseGeneratedMeal({
    preparations: [prep()],
    dishes: [dish([{
      id: "box_mon_lunch",
      member_ids: [MAX, LEA],
      items: [HAM_AS_WRITTEN, { term: "pâtes", grams: 400 }],
    }])],
    shopping_list: [],
  }, { ...PARSE_BASE, composition: null });
  assertEquals(meal.box_counts.items, 1);
  assertEquals(meal.box_counts.items_in_grams, 1);
  assertEquals(meal.box_counts.items_from_ingredient, 0);
  assertEquals(meal.box_counts.items_refused, 1);
});

// ---------------------------------------------------------------------------
// ⑤ LA MOITIÉ PROMPT — LA CLÉ VOYAGE AVEC L'ORDRE
// ---------------------------------------------------------------------------

/**
 * ⛔ SANS CES ÉPINGLES, LA MOITIÉ PROMPT EST DÉSARMÉE EN SILENCE. Le lecteur
 * réparé accepte maintenant la forme d'ingrédient: un prompt qui cesserait de
 * nommer `grams` produirait toujours des items lisibles, donc rien ne rougirait
 * — et on aurait perdu la moitié qui compte, celle qui fait écrire au modèle la
 * clé que le schéma v4 demande.
 */
Deno.test("⑤ le bloc de régime nomme `grams` À CÔTÉ de l'ordre de mettre en boîte", () => {
  const block = householdDietBlock({
    strictest: "vegan",
    heldBy: ["Lea"],
    freeNames: ["Max"],
    divergingNames: [],
                                     dedicatedSectionSent: false,
                                     boxChannelOpen: true,
                                   });
  const order = block.indexOf("is served PER BOX");
  const key = block.indexOf('"grams"');
  const shape = block.indexOf('"grams": <whole grams of READY food>');
  assert(order > 0, "l'ordre de mettre en boîte est bien dans le bloc");
  assert(key > order, "la clé est nommée APRÈS l'ordre, dans le même bloc");
  assert(shape > order, "et sa FORME aussi, pas seulement son nom");
  // ⛔ ADJACENTE, PAS « QUELQUE PART DANS LE PROMPT ». C'est la cicatrice
  // `promise-and-schema-key-must-be-adjacent`: 800 caractères est déjà large,
  // et le bloc entier en fait moins de 3 000.
  assert(
    shape - order < 800,
    `la forme doit toucher l'ordre (écart ${shape - order} caractères)`,
  );
});

Deno.test("⑤ bis — la forme partagée rend EXACTEMENT les lignes du schéma système", () => {
  // ⛔ UNE SEULE ÉCRITURE DE LA CLÉ, ET L'ÉPINGLE EST ICI. Les deux blocs
  // partent sur des chemins DIFFÉRENTS (`portion_v1` retire le bloc système,
  // jamais celui du régime): sans ce pin d'octets, ils divergeraient sans
  // qu'aucun run ne les voie tous les deux. Ces trois chaînes sont celles que
  // `boxSchemaBlock` imprimait en dur avant l'extraction.
  assertEquals(boxItemSchemaLines("              "), [
    '              "items": [{ "preparation_id": "prep_x" or null,',
    '                          "term": "what is in it",',
    '                          "grams": <whole grams of READY food> }]',
  ]);
});

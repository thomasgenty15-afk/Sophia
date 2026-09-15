// ══════════════════════════════════════════════════════════════════════════
// LE `ref` PRIME SUR LE `group` DÉCLARÉ — 2026-09-13.
// ══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT, PAYÉ PAR UN APPEL RÉEL ────────────────────────────────────
// Premier jet d'un foyer de quatre dont une bouche végane. Refus du plan
// ENTIER, 422 `plan_not_deliverable`, cause `regime_forbidden_component`:
//
//     day=mon slot=breakfast · term "yaourt de soja nature"
//     boîte « box_mon_breakfast_1_… » contre le régime « vegan » : dairy_yogurt
//
// La ligne du modèle, lue dans la réponse brute archivée:
//
//     { "term": "yaourt de soja nature", "amount": 100, "unit": "g",
//       "state": "raw", "part": "main", "ref": "soy_yogurt",
//       "group": "dairy_yogurt" }
//
// `soy_yogurt` porte `food_group_ref = tofu_tempeh` au référentiel. Le `ref`
// était JUSTE; le `group` était FAUX; et le moteur croyait le second.
//
// ── CE QUE CES ÉPREUVES TIENNENT, DANS L'ORDRE DE CE QUI COÛTE ───────────
//
//   ① LE CAS QUI MORD, ÉCRIT EN PREMIER. Une garde de régime qui ne refuse
//      plus rien ressemble trait pour trait à une garde réparée. Un vrai
//      produit laitier chez une bouche végane doit TOUJOURS faire refuser —
//      y compris quand le modèle a déclaré un groupe végétal par-dessus.
//   ② LA CORRECTION ATTEINT LES DEUX SURFACES. La ligne PERSISTÉE et la
//      garde finale. Réparer la garde seule aurait livré un plan dont le
//      yaourt de soja reste rangé au rayon laitier pour tous ses lecteurs.
//   ③ LES TROIS ABSTENTIONS. Pas de `ref`, `ref` inconnu, `ref` sans groupe
//      au référentiel: le groupe déclaré RESTE. Le retirer désarmerait la
//      garde au lieu de la corriger.
//   ④ LE COMPTEUR. `groups_conflicting` bouge sur le désaccord et reste à
//      zéro sur un plan cohérent. Sans lui, un moteur qui réconcilie et un
//      moteur débranché rendent le même plan vert.
//
// ⛔ AUCUNE PHRASE N'EST AJOUTÉE À `PLANT_ANALOGUE_PHRASES`. Elle contient
// déjà « yaourt de soja »: le chemin fautif est celui du GROUPE, pas celui du
// texte, et une phrase de plus aurait masqué le défaut.
//
// PURE: aucune I/O, aucune horloge.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type GeneratedMeal,
  type MealScope,
  mealDishesPayload,
  mealPreparationsPayload,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  persistedGroupOf,
  reconcileIngredientGroup,
} from "./food_group_write.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import type { CompositionIndex } from "./food_composition.ts";
import { exclusionTermsFor } from "./food_exclusion_belt.ts";
import {
  type FinalGateOutcome,
  finalPlanGate,
  type GateContext,
  type GatePlan,
} from "./final_plan_gate.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
  NORA,
} from "./final_plan_gate_fixtures.ts";

// ---------------------------------------------------------------------------
// Le référentiel de l'épreuve — quatre lignes, et chacune a un rôle
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "tofu_tempeh",
    label: over.slug,
    // ⚠️ `manual` ET PAS `sas`: seule une provenance vérifiée passe la porte de
    // composition (`isComposable`). Un `sas` rendrait `not_composable`, donc un
    // `ref` refusé — c'est-à-dire qu'on testerait l'abstention en croyant
    // tester la correction. La ligne réelle `soy_yogurt` est `manual`.
    source: "manual",
    energyKcal: 50,
    proteinG: 4,
    carbsG: 2,
    fatG: 2.5,
    fiberG: 0.5,
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
  };
}

const INDEX: CompositionIndex = buildCompositionIndex([
  // La ligne exacte du run réel: végétale, et le référentiel le sait.
  ref({ slug: "soy_yogurt", foodGroupRef: "tofu_tempeh", label: "Soy yoghurt, plain" }),
  // Le vrai produit laitier — c'est lui qui doit TOUJOURS faire mordre.
  ref({ slug: "plain_yogurt", foodGroupRef: "dairy_yogurt", label: "Yaourt nature" }),
  // ⛔ UNE LIGNE SANS GROUPE AU RÉFÉRENTIEL. `food_composition_io.ts` écrit
  // déjà `String(row.food_group_ref ?? "")` — une colonne vide produit
  // AUJOURD'HUI cette chaîne hors vocabulaire dans l'index. La prendre pour une
  // réponse effacerait une déclaration juste au profit d'un silence.
  ref({ slug: "mystery_food", foodGroupRef: "" as CompositionRef["foodGroupRef"] }),
  // De quoi composer un plat autour, sans intérêt pour le régime.
  ref({ slug: "rolled_oats", foodGroupRef: "whole_grain", label: "Flocons d'avoine" }),
], []);

// ---------------------------------------------------------------------------
// Le foyer de l'épreuve — une bouche végane, comme le run réel
// ---------------------------------------------------------------------------

const ALICE = "11111111-1111-4111-8111-111111111111";
const THEO = "22222222-2222-4222-8222-222222222222";
const ROSTER = [ALICE, THEO] as readonly string[];

const TABLE: readonly { memberId: string; regime: DietaryRegime | null }[] = [
  { memberId: ALICE, regime: null },
  { memberId: THEO, regime: "vegan" },
];

const PARSE_BASE = {
  doctrine: null,
  safetyConstraints: [] as readonly StudentSafetyConstraint[] | null,
  mode: "to_shop" as const,
  scope: "several_days" as MealScope,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [{ slot: "breakfast" as const, size: null }],
  daysToFill: ["mon"],
  awayDays: [],
  cookingTimeMin: null,
  composition: INDEX as CompositionIndex | null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: ROSTER,
  weighedMemberIds: [] as readonly string[],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  standardRecipe: false,
  boxMemberDiets: TABLE,
  boxMemberExclusions: [] as readonly {
    memberId: string;
    terms: ReturnType<typeof exclusionTermsFor>;
  }[],
};

function parse(payload: Record<string, unknown>): GeneratedMeal {
  return parseGeneratedMeal(payload, PARSE_BASE);
}

/**
 * Un petit-déjeuner en boîtes, dont la SEULE variable est la ligne testée.
 *
 * ⚠️ LA CASSEROLE N'EST PAS DÉCORATIVE. Un plat en boîtes qui ne puise dans
 * aucune préparation voit son contenant JETÉ par le parseur (« nothing was
 * weighed ahead »): la ceinture de régime du parseur n'aurait alors aucun
 * couvercle à lire, et le cas passerait pour une raison qui n'est pas la
 * bonne.
 */
function planWith(line: Record<string, unknown>) {
  return {
    preparations: [{
      id: "prep_oats",
      title: "Flocons cuits",
      servings_made: 2,
      method: "Faites gonfler les flocons.",
      active_minutes: 5,
      total_minutes: 10,
      cook_on: "mon",
      ingredients: [
        { term: "flocons d'avoine", ref: "rolled_oats", amount: 120, unit: "g", state: "raw" },
      ],
    }],
    dishes: [{
      title: "Bol du matin",
      day: "mon",
      slot: "breakfast",
      method: "Mélangez et servez.",
      why: "Parce que c'est rapide.",
      ingredients: [line],
      uses: [{ preparation_id: "prep_oats", servings: 2 }],
      boxes: [{
        id: "box_mon_breakfast_1",
        member_ids: [...ROSTER],
        items: [{ preparation_id: "prep_oats", term: "flocons cuits", grams: 320 }],
      }],
    }],
    shopping_list: [],
  };
}

/** La ligne du modèle, telle qu'elle sort du parseur ET telle qu'elle part en base. */
function writtenLine(meal: GeneratedMeal, term: string): Record<string, unknown> {
  for (const dish of mealDishesPayload(meal)) {
    for (const row of (dish.ingredients as Record<string, unknown>[]) ?? []) {
      if (row.term === term) return row;
    }
  }
  for (const prep of mealPreparationsPayload(meal)) {
    for (const row of (prep.ingredients as Record<string, unknown>[]) ?? []) {
      if (row.term === term) return row;
    }
  }
  throw new Error(`ligne introuvable: ${term}`);
}

// ---------------------------------------------------------------------------
// ① LE CAS QUI MORD — écrit en premier
// ---------------------------------------------------------------------------

/**
 * ⛔ LA GARDE FINALE EST PURE ET N'A PAS LE RÉFÉRENTIEL: elle croit le `group`
 * de la ligne. C'est exactement pour ça que la correction ne pouvait pas se
 * faire ici, et c'est ce que ces deux épreuves rendent visible — la même
 * garde, la même bouche végane, deux groupes, deux verdicts opposés.
 */
type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[]
    : T[K];
};

function gateWithBreakfastGroup(
  term: string,
  group: string | null,
): FinalGateOutcome {
  const plan = structuredClone(CLEAN_HOUSEHOLD_PLAN) as Mutable<GatePlan>;
  const ctx = structuredClone(CLEAN_HOUSEHOLD_CONTEXT) as Mutable<GateContext>;
  // La bouche déjà déclarée de la fixture passe de végétarienne à VÉGANE:
  // `dairy_yogurt` n'est excusé que chez la première.
  for (const m of ctx.mouths) if (m.memberId === NORA) m.regime = "vegan";
  ctx.strictestRegime = "vegan";
  plan.dishes[0].ingredients.push({ term, group: group as never });
  return finalPlanGate(plan as GatePlan, ctx as GateContext);
}

function regimeRefusals(outcome: FinalGateOutcome): number {
  return outcome.refusals.filter((r) => r.cause === "regime_forbidden_component")
    .length;
}

Deno.test("⛔ LA GARDE MORD ENCORE — un vrai yaourt laitier chez une bouche végane", () => {
  // Sans ce cas, tout ce qui suit prouverait seulement qu'on a éteint la garde.
  const outcome = gateWithBreakfastGroup("yaourt nature", "dairy_yogurt");
  assert(
    regimeRefusals(outcome) > 0,
    "un produit laitier déclaré `dairy_yogurt` doit faire refuser chez une végane",
  );
});

Deno.test("LA GARDE LIT LE GROUPE DE LA LIGNE — `tofu_tempeh` ne mord pas", () => {
  // ⛔ LE TERME EST INCHANGÉ. Seul le groupe bouge, et le verdict bascule:
  // c'est la preuve que la garde croit ce champ, donc que la ligne écrite
  // devait porter la vérité du référentiel.
  const outcome = gateWithBreakfastGroup("yaourt de soja nature", "tofu_tempeh");
  assertEquals(regimeRefusals(outcome), 0);
});

// ---------------------------------------------------------------------------
// ② LE CAS EXACT DU RUN RÉEL
// ---------------------------------------------------------------------------

Deno.test("LE CAS DU RUN — `ref: soy_yogurt` + `group: dairy_yogurt` écrit `tofu_tempeh`", () => {
  const meal = parse(planWith({
    term: "yaourt de soja nature",
    amount: 100,
    unit: "g",
    state: "raw",
    part: "main",
    ref: "soy_yogurt",
    group: "dairy_yogurt",
  }));

  // ⛔ LA LIGNE PERSISTÉE, pas la structure interne: c'est elle qui part en
  // base et que relisent tous les écrans du plan.
  const row = writtenLine(meal, "yaourt de soja nature");
  assertEquals(row.ref, "soy_yogurt");
  assertEquals(persistedGroupOf(row), "tofu_tempeh");

  // ⛔ ET LA GARDE FINALE NE MORD PAS SUR CETTE LIGNE. Le groupe écrit est
  // exactement celui qu'elle reçoit.
  assertEquals(
    regimeRefusals(gateWithBreakfastGroup(
      String(row.term),
      persistedGroupOf(row),
    )),
    0,
  );

  // Le désaccord est un FAIT, et il se compte.
  assertEquals(meal.regime_belt.groups_conflicting, 1);
  // ⚠️ IL RESTE COMPTÉ DÉCLARÉ ET VALIDE. `dairy_yogurt` EST du vocabulaire
  // fermé: le ranger dans `groups_refused` mélangerait « le modèle invente des
  // slugs » et « le modèle se trompe d'étagère ».
  assertEquals(meal.regime_belt.groups_declared, 1);
  assertEquals(meal.regime_belt.groups_valid, 1);
  assertEquals(meal.regime_belt.groups_refused, 0);

  // ⛔ LA BOUCHE VÉGANE GARDE SA PLACE AU CONTENANT, et le couvercle a bien été
  // LU: `checked > 0` est ce qui sépare « la ceinture a laissé passer » de
  // « la ceinture n'a rien regardé ».
  assertEquals(meal.regime_refusals, []);
  assert(meal.regime_belt.checked > 0, "la ceinture doit avoir lu un couvercle");
  assertEquals(meal.regime_belt.refused, 0);
  assertEquals(meal.regime_belt.group_excluded, 0);
  assertEquals(meal.dishes[0]?.boxes[0]?.memberIds.length, 2);
});

Deno.test("LE SECOND CAS DE LA MÊME RÉPONSE — `soy_milk` déclaré `whole_grain`", () => {
  // Le même plat portait `{ ref: soy_milk, group: whole_grain }`. Même règle,
  // sans régime en jeu: c'est le désaccord qui compte, pas la morsure.
  const withSoyMilk = buildCompositionIndex([
    ref({ slug: "soy_milk", foodGroupRef: "tofu_tempeh", label: "Boisson au soja" }),
    ref({ slug: "rolled_oats", foodGroupRef: "whole_grain" }),
  ], []);
  const meal = parseGeneratedMeal(
    planWith({
      term: "boisson au soja",
      amount: 200,
      unit: "ml",
      state: "raw",
      ref: "soy_milk",
      group: "whole_grain",
    }),
    { ...PARSE_BASE, composition: withSoyMilk },
  );
  assertEquals(persistedGroupOf(writtenLine(meal, "boisson au soja")), "tofu_tempeh");
  assertEquals(meal.regime_belt.groups_conflicting, 1);
});

// ---------------------------------------------------------------------------
// ③ LE SENS INVERSE — la correction ne sert pas de passe-droit
// ---------------------------------------------------------------------------

Deno.test("⛔ UN GROUPE VÉGÉTAL DÉCLARÉ SUR UN VRAI LAITAGE NE SAUVE PAS LA LIGNE", () => {
  // ⛔ C'EST LE CAS QUI EMPÊCHE CETTE RÉPARATION DE DEVENIR UNE PORTE. Si le
  // groupe déclaré gagnait, un modèle pourrait faire passer n'importe quoi en
  // écrivant `tofu_tempeh` par-dessus. Le référentiel gagne DANS LES DEUX SENS.
  const meal = parse(planWith({
    term: "yaourt nature",
    amount: 100,
    unit: "g",
    state: "raw",
    ref: "plain_yogurt",
    group: "tofu_tempeh",
  }));

  const row = writtenLine(meal, "yaourt nature");
  assertEquals(persistedGroupOf(row), "dairy_yogurt");
  assertEquals(meal.regime_belt.groups_conflicting, 1);
  assert(
    regimeRefusals(gateWithBreakfastGroup(String(row.term), persistedGroupOf(row))) >
      0,
    "un laitage rendu à son groupe doit refaire mordre la garde",
  );
});

// ---------------------------------------------------------------------------
// ④ LES TROIS ABSTENTIONS — ce qui ne doit PAS bouger
// ---------------------------------------------------------------------------

Deno.test("SANS `ref`, LE GROUPE DÉCLARÉ RESTE — même quand il est faux", () => {
  // ⛔ COMPORTEMENT INCHANGÉ, ET C'EST VOULU. Le groupe déclaré est la SEULE
  // information disponible sur cette ligne. Le retirer parce qu'on le
  // soupçonne désarmerait la garde de régime au lieu de la corriger — une
  // bouche végane cesserait d'être protégée sur toutes les lignes sans `ref`.
  // ⚠️ Aucune résolution par le LIBELLÉ non plus: « yaourt de soja nature »
  // n'est pas cherché dans l'index, parce qu'un identifiant est lu dans une
  // liste et qu'un libellé ne l'est pas.
  const meal = parse(planWith({
    term: "yaourt de soja nature",
    amount: 100,
    unit: "g",
    state: "raw",
    group: "dairy_yogurt",
  }));

  assertEquals(persistedGroupOf(writtenLine(meal, "yaourt de soja nature")), "dairy_yogurt");
  assertEquals(meal.regime_belt.groups_conflicting, 0);
  assertEquals(meal.regime_belt.groups_declared, 1);
  assertEquals(meal.regime_belt.groups_valid, 1);
});

Deno.test("UN `ref` INCONNU NE CORRIGE RIEN — le groupe déclaré reste", () => {
  const meal = parse(planWith({
    term: "yaourt de soja nature",
    amount: 100,
    unit: "g",
    state: "raw",
    ref: "slug_inexistant",
    group: "dairy_yogurt",
  }));

  const row = writtenLine(meal, "yaourt de soja nature");
  // Le `ref` inventé est refusé par le contrat, il n'atteint pas la ligne…
  assertEquals(row.ref, null);
  // …et il n'a donc aucun groupe à opposer à la déclaration.
  assertEquals(persistedGroupOf(row), "dairy_yogurt");
  assertEquals(meal.regime_belt.groups_conflicting, 0);
});

Deno.test("UN `ref` RÉSOLU SANS GROUPE AU RÉFÉRENTIEL NE CORRIGE RIEN", () => {
  const meal = parse(planWith({
    term: "aliment mystère",
    amount: 100,
    unit: "g",
    state: "raw",
    ref: "mystery_food",
    group: "dairy_yogurt",
  }));

  const row = writtenLine(meal, "aliment mystère");
  assertEquals(row.ref, "mystery_food");
  // ⛔ « Je ne sais pas » n'est pas « c'est faux ». Une colonne vide au
  // référentiel ne doit pas effacer la seule déclaration qu'on ait.
  assertEquals(persistedGroupOf(row), "dairy_yogurt");
  assertEquals(meal.regime_belt.groups_conflicting, 0);
});

// ---------------------------------------------------------------------------
// ⑤ LE COMPTEUR — il reste à zéro sur un plan cohérent
// ---------------------------------------------------------------------------

Deno.test("PLAN COHÉRENT: le compteur de conflits reste à ZÉRO", () => {
  // ⛔ LA MOITIÉ QUI COMPTE. Un compteur qui monte sur tout serait aussi
  // inutile qu'un compteur mort: il faut qu'il SÉPARE les deux populations.
  const meal = parse(planWith({
    term: "yaourt de soja nature",
    amount: 100,
    unit: "g",
    state: "raw",
    ref: "soy_yogurt",
    group: "tofu_tempeh",
  }));

  assertEquals(persistedGroupOf(writtenLine(meal, "yaourt de soja nature")), "tofu_tempeh");
  assertEquals(meal.regime_belt.groups_conflicting, 0);
  assertEquals(meal.regime_belt.groups_declared, 1);
  assertEquals(meal.regime_belt.groups_valid, 1);
});

// ---------------------------------------------------------------------------
// ⑥ LES PRÉPARATIONS — 32 % des lignes d'ingrédient de la base
// ---------------------------------------------------------------------------

Deno.test("UNE CASSEROLE EST RÉCONCILIÉE COMME UN PLAT", () => {
  // ⛔ `finalPlanGate` PLIE la casserole dans le plat qui la cite
  // (`foldedFoods`): ne réparer que les plats aurait laissé un tiers des
  // lignes refuser le plan sur un groupe que leur propre `ref` dément.
  const meal = parse({
    preparations: [{
      id: "prep_soy_bowl",
      title: "Base de soja",
      servings_made: 2,
      method: "Mélangez la veille.",
      active_minutes: 5,
      total_minutes: 5,
      cook_on: "mon",
      ingredients: [
        {
          term: "yaourt de soja nature",
          amount: 200,
          unit: "g",
          state: "raw",
          ref: "soy_yogurt",
          group: "dairy_yogurt",
        },
      ],
    }],
    dishes: [{
      title: "Bol du matin",
      day: "mon",
      slot: "breakfast",
      method: "Sortez la boîte.",
      why: "Parce que c'est prêt.",
      ingredients: [
        { term: "flocons d'avoine", ref: "rolled_oats", amount: 60, unit: "g", state: "raw" },
      ],
      uses: [{ preparation_id: "prep_soy_bowl", servings: 1 }],
      boxes: [{
        id: "box_mon_breakfast_1",
        member_ids: [...ROSTER],
        items: [{ preparation_id: "prep_soy_bowl", term: "base de soja", grams: 200 }],
      }],
    }],
    shopping_list: [],
  });

  assertEquals(persistedGroupOf(writtenLine(meal, "yaourt de soja nature")), "tofu_tempeh");
  assertEquals(meal.regime_belt.groups_conflicting, 1);
  assertEquals(meal.regime_refusals, []);
});

// ---------------------------------------------------------------------------
// ⑦ LA RÈGLE, NUE
// ---------------------------------------------------------------------------

Deno.test("`reconcileIngredientGroup` — les quatre cas, sans plan autour", () => {
  // Le référentiel gagne, et le désaccord se dit.
  assertEquals(reconcileIngredientGroup("dairy_yogurt", "tofu_tempeh"), {
    group: "tofu_tempeh",
    conflicting: true,
  });
  // D'accord: rien à corriger, RIEN À COMPTER.
  assertEquals(reconcileIngredientGroup("tofu_tempeh", "tofu_tempeh"), {
    group: "tofu_tempeh",
    conflicting: false,
  });
  // Rien de déclaré: le référentiel remplit, et ce n'est pas un conflit.
  assertEquals(reconcileIngredientGroup(null, "tofu_tempeh"), {
    group: "tofu_tempeh",
    conflicting: false,
  });
  // Rien au référentiel: la déclaration reste, sous toutes ses formes vides.
  for (const empty of [null, undefined, "", "   ", "slug_inconnu", 42]) {
    assertEquals(reconcileIngredientGroup("dairy_yogurt", empty), {
      group: "dairy_yogurt",
      conflicting: false,
    });
    assertEquals(reconcileIngredientGroup(null, empty), {
      group: null,
      conflicting: false,
    });
  }
});

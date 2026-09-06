// ══════════════════════════════════════════════════════════════════════════
// LA GARDE FINALE DU PLAN — ce que ces épreuves tiennent.
//
//   1. LE CAS QUI PASSE, EN PREMIER. Zéro refus ET douze dénominateurs > 0.
//      C'est la garde anti-motif du dépôt : une garde qui refuse tout, et une
//      garde qui n'évalue rien, ressemblent toutes deux à une garde qui
//      marche. Sans cette épreuve, les vingt-deux suivantes ne prouvent rien.
//   2. UNE ÉPREUVE PAR CAUSE, par déformation MINIMALE du cas propre — et à
//      chaque fois on vérifie qu'AUCUNE AUTRE cause ne part. Une garde qui
//      allume trois voyants pour un défaut est illisible en production.
//   3. QUE LES RÉPARATIONS RÉPARENT. On applique, on repasse, la cause a
//      disparu.
//   4. QUE LE MODULE SOIT PUR. `structuredClone` avant/après, sur les deux
//      fonctions, et deux passes identiques au JSON près.
//   5. QUE LES POLITIQUES SOIENT CE QU'ELLES DISENT. `LOT_1` n'a AUCUN
//      « refuse » — sinon le lot d'observation mordrait, ce qui est
//      exactement ce qu'on cherche à éviter en le déployant en premier.
// ══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyFinalGateRepairs,
  ENERGY_SHORT_RATIO,
  FINAL_GATE_CAUSES,
  FINAL_GATE_POLICY_LOT_1,
  FINAL_GATE_POLICY_LOT_2,
  FINAL_GATE_POLICY_LOT_3,
  type FinalGateCause,
  type FinalGateOutcome,
  finalPlanGate,
  type GateContext,
  type GatePlan,
} from "./final_plan_gate.ts";
import {
  CLAIRE,
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
  LEO,
  NORA,
  PAUL,
  SOLO_CONTEXT,
  SOLO_PLAN,
} from "./final_plan_gate_fixtures.ts";

// ---------------------------------------------------------------------------
// Outils d'épreuve
// ---------------------------------------------------------------------------

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[]
    : T[K];
};

type MutablePlan = Mutable<GatePlan>;
type MutableContext = Mutable<GateContext>;

function planCopy(): MutablePlan {
  return structuredClone(CLEAN_HOUSEHOLD_PLAN) as MutablePlan;
}

function contextCopy(): MutableContext {
  return structuredClone(CLEAN_HOUSEHOLD_CONTEXT) as MutableContext;
}

/** Le cas propre, déformé sur place, puis passé à la garde. */
function gateWith(
  mutate: (plan: MutablePlan, ctx: MutableContext) => void,
): FinalGateOutcome {
  const plan = planCopy();
  const ctx = contextCopy();
  mutate(plan, ctx);
  return finalPlanGate(plan as GatePlan, ctx as GateContext);
}

/**
 * ⛔ ON ÉPINGLE LES VINGT-DEUX CAUSES, PAS SEULEMENT CELLE QU'ON ATTEND.
 * Une assertion sur la seule cause visée laisserait passer une garde qui en
 * allume trois : le bruit d'une garde est ce qui la fait débrancher.
 */
function assertCauses(
  outcome: FinalGateOutcome,
  expected: Partial<Record<FinalGateCause, number>>,
): void {
  for (const cause of FINAL_GATE_CAUSES) {
    assertEquals(
      outcome.counters.refusals_by_cause[cause],
      expected[cause] ?? 0,
      `cause « ${cause} » : attendu ${expected[cause] ?? 0}, vu ${
        outcome.counters.refusals_by_cause[cause]
      } — refus: ${JSON.stringify(outcome.refusals.map((r) => r.cause))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE — d'abord, toujours
// ---------------------------------------------------------------------------

Deno.test("le plan propre du foyer ne déclenche AUCUNE des 22 causes", () => {
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  assertCauses(outcome, {});
  assertEquals(outcome.refusals.length, 0);
  assertEquals(outcome.repairs.length, 0);
  assertEquals(outcome.ok, true);
});

Deno.test("le cas propre a fait TOURNER les douze dénominateurs (aucun à zéro)", () => {
  const { checked } = finalPlanGate(
    CLEAN_HOUSEHOLD_PLAN,
    CLEAN_HOUSEHOLD_CONTEXT,
  ).counters;
  // ⛔ SANS CETTE ÉPREUVE, la précédente serait vraie d'une garde débranchée.
  // `energy_unmeasured` est le SEUL champ de `checked` qui n'est pas un
  // dénominateur : c'est le témoin de ce qui a échappé à la mesure, et sur un
  // cas propre il vaut zéro. L'exclure ici est ce qui lui donne son sens.
  for (const [name, value] of Object.entries(checked)) {
    if (name === "energy_unmeasured") continue;
    assert(value > 0, `dénominateur « ${name} » à zéro : la règle n'a pas tourné`);
  }
  // Les valeurs exactes, pour que la déformation d'un cas se voie.
  assertEquals(checked.uses, 2);
  assertEquals(checked.box_items, 5);
  assertEquals(checked.session_ids, 2);
  assertEquals(checked.cooked_pairs, 2);
  assertEquals(checked.cells, 3);
  assertEquals(checked.mouth_cells, 12);
  assertEquals(checked.shopping_lines, 9);
  assertEquals(checked.perishable_lines, 5);
  assertEquals(checked.ingredient_terms, 10);
  assertEquals(checked.table_dishes, 1);
  assertEquals(checked.boxed_dishes, 2);
  // Les quatre bouches ont été COMPARÉES, et aucune n'a échappé à la mesure.
  assertEquals(checked.energy_mouths, 4);
  assertEquals(checked.energy_unmeasured, 0);
});

Deno.test("le plan solo passe, et les boîtes n'y sont JAMAIS réclamées", () => {
  const outcome = finalPlanGate(SOLO_PLAN, SOLO_CONTEXT);
  assertCauses(outcome, {});
  assertEquals(outcome.ok, true);
  // `boxContract: null` ⇒ les deux causes de boîte ne sont pas évaluées, et
  // le dénominateur le DIT plutôt que de laisser croire à un plan propre.
  assertEquals(outcome.counters.checked.boxed_dishes, 0);
  assertEquals(outcome.counters.checked.table_dishes, 1);
});

// ---------------------------------------------------------------------------
// ② LES RÉFÉRENCES PENDANTES
// ---------------------------------------------------------------------------

Deno.test("uses_dangling : un plat puise dans une casserole absente", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[0].uses[0].preparation_id = "prep_ghost";
  });
  assertCauses(outcome, { uses_dangling: 1 });
  assertEquals(outcome.counters.repairs_by_kind.drop_dangling_use, 1);
  assertEquals(outcome.repairs[0].at, { dish: 0, use: 0 });
  assertEquals(outcome.repairs[0].from, "prep_ghost");
  assertEquals(outcome.repairs[0].to, null);
});

Deno.test("box_item_dangling : un couvercle cite une casserole absente", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[0].boxes[0].items[0].preparation_id = "prep_ghost";
  });
  assertCauses(outcome, { box_item_dangling: 1 });
  assertEquals(outcome.counters.repairs_by_kind.drop_dangling_box_item, 1);
  assertEquals(outcome.repairs[0].at, { dish: 0, box: 0, item: 0 });
});

Deno.test("session_cites_unknown : une session cuisine une casserole absente", () => {
  const outcome = gateWith((plan) => {
    plan.cooking_sessions[0].preparation_ids.push("prep_ghost");
  });
  assertCauses(outcome, { session_cites_unknown: 1 });
  assertEquals(outcome.counters.checked.session_ids, 3);
  assertEquals(outcome.repairs[0].at, { session: 0, item: 2 });
});

// ---------------------------------------------------------------------------
// ③ LA FENÊTRE CUITE — le défaut ① mesuré en production
// ---------------------------------------------------------------------------

Deno.test("eaten_before_cooked : cuisiné lundi, mangé dimanche", () => {
  const outcome = gateWith((plan) => {
    plan.preparations[0].cook_on = "mon";
    // La session suit la casserole, sinon c'est `session_day_mismatch` qui
    // parlerait — on veut UN défaut, pas deux.
    plan.cooking_sessions[0].preparation_ids = ["prep_quinoa_sun"];
    plan.cooking_sessions.push({ day: "mon", preparation_ids: ["prep_oats_sun"] });
  });
  assertCauses(outcome, { eaten_before_cooked: 1 });
  assertEquals(outcome.counters.checked.cooked_pairs, 2);
});

Deno.test("eaten_too_late : au-delà de la fenêtre de conservation", () => {
  // La fenêtre se RÉTRÉCIT côté contexte (`maxFridgeDays`), jamais côté
  // module : la constante est passée, pas importée.
  const outcome = gateWith((_plan, ctx) => {
    ctx.maxFridgeDays = 1;
  });
  assertCauses(outcome, { eaten_too_late: 1 });
});

Deno.test("eaten_too_late : le congélateur déclaré rouvre la fenêtre", () => {
  const outcome = gateWith((plan, ctx) => {
    ctx.maxFridgeDays = 1;
    plan.dishes[2].uses[0].kept = "freezer";
  });
  assertCauses(outcome, {});
});

Deno.test("eaten_too_late : « freezer » sans congélateur ne rouvre RIEN", () => {
  const outcome = gateWith((plan, ctx) => {
    ctx.maxFridgeDays = 1;
    ctx.hasFreezer = false;
    plan.dishes[2].uses[0].kept = "freezer";
  });
  assertCauses(outcome, { eaten_too_late: 1 });
});

Deno.test("cook_day_unplaced : une casserole datée hors de la fenêtre", () => {
  const outcome = gateWith((plan) => {
    plan.preparations[1].cook_on = "sat";
    plan.cooking_sessions[0].preparation_ids = ["prep_oats_sun"];
    plan.cooking_sessions.push({ day: "sat", preparation_ids: ["prep_quinoa_sun"] });
  });
  assertCauses(outcome, { cook_day_unplaced: 1 });
});

// ---------------------------------------------------------------------------
// ④ LES SESSIONS
// ---------------------------------------------------------------------------

Deno.test("preparation_without_session : puisée par un plat, cuisinée par personne", () => {
  const outcome = gateWith((plan) => {
    plan.cooking_sessions[0].preparation_ids = ["prep_oats_sun"];
  });
  assertCauses(outcome, { preparation_without_session: 1 });
});

Deno.test("session_day_mismatch : la session ne tombe pas le jour de la casserole", () => {
  const outcome = gateWith((plan) => {
    plan.cooking_sessions[0].preparation_ids = ["prep_oats_sun"];
    plan.cooking_sessions.push({ day: "mon", preparation_ids: ["prep_quinoa_sun"] });
  });
  assertCauses(outcome, { session_day_mismatch: 1 });
});

// ---------------------------------------------------------------------------
// ⑤ LES CASES ET LES BOUCHES
// ---------------------------------------------------------------------------

Deno.test("cell_without_dish : compté UNE FOIS par case, jamais par bouche", () => {
  const outcome = gateWith((plan) => {
    plan.dishes.splice(1, 1); // le dahl du dimanche soir disparaît
  });
  // Quatre bouches mangeaient là : la garde en rend UN, pas quatre.
  assertCauses(outcome, { cell_without_dish: 1 });
  assertEquals(outcome.counters.checked.cells, 3);
});

Deno.test("mouth_unfed : un plat dédié à quelqu'un d'autre ne nourrit pas la table", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].member_id = PAUL;
  });
  assertCauses(outcome, { mouth_unfed: 3 });
  const fed = outcome.refusals.map((r) => r.member_id).sort();
  assertEquals(fed, [CLAIRE, LEO, NORA].sort());
});

// ---------------------------------------------------------------------------
// ⑥ LES BOÎTES — le défaut ④ mesuré en production
// ---------------------------------------------------------------------------

Deno.test("boxes_none_delivered : huit boîtes attendues, aucune écrite", () => {
  const outcome = gateWith((plan) => {
    for (const dish of plan.dishes) dish.boxes = [];
  });
  assertCauses(outcome, { boxes_none_delivered: 1 });
  assertEquals(outcome.counters.checked.boxed_dishes, 0);
});

Deno.test("box_missing : le repas est en boîtes, aucun couvercle ne la nomme", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[0].boxes[2].member_ids = [];
  });
  assertCauses(outcome, { box_missing: 1 });
  assertEquals(outcome.refusals[0].member_id, NORA);
});

Deno.test("box_missing ne mord pas quand les boîtes ne sont pas le contrat", () => {
  const plan = planCopy();
  const ctx = contextCopy();
  plan.dishes[0].boxes[2].member_ids = [];
  ctx.boxContract = null;
  const outcome = finalPlanGate(plan as GatePlan, ctx as GateContext);
  // La bouche manque quand même — mais elle est nommée `mouth_unfed`, pas
  // `box_missing` : sans contrat, l'absence de couvercle n'est pas la cause.
  assertCauses(outcome, { mouth_unfed: 1 });
});

// ---------------------------------------------------------------------------
// ⑦ LES COURSES — le défaut ② mesuré en production
// ---------------------------------------------------------------------------

Deno.test("ingredient_not_bought : un aliment qu'aucune ligne n'achète", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].ingredients.push({ term: "gingembre frais", group: "non_starchy_veg" });
  });
  assertCauses(outcome, { ingredient_not_bought: 1 });
  assertEquals(outcome.counters.checked.ingredient_terms, 11);
});

Deno.test("ingredient_not_bought : le garde-manger dispense d'acheter", () => {
  const outcome = gateWith((plan, ctx) => {
    plan.dishes[1].ingredients.push({ term: "gingembre frais", group: "non_starchy_veg" });
    ctx.pantryTerms.push("gingembre");
  });
  assertCauses(outcome, {});
});

Deno.test("shopping_undated : une ligne sans jour d'achat", () => {
  const outcome = gateWith((plan) => {
    plan.shopping_list[0].buy_on = null;
  });
  assertCauses(outcome, { shopping_undated: 1 });
});

Deno.test("unclassified_perishable : un rayon périssable sans groupe d'aliment", () => {
  const outcome = gateWith((plan) => {
    plan.shopping_list[2].food_group = null; // prunes, rayon `produce`
  });
  assertCauses(outcome, { unclassified_perishable: 1 });
  assertEquals(outcome.counters.checked.perishable_lines, 5);
});

Deno.test("perishable_bought_too_early : acheté bien avant d'être cuisiné", () => {
  const outcome = gateWith((plan) => {
    plan.shopping_list[2].buy_on = "2026-08-25"; // prunes, fenêtre crue 7 jours
  });
  assertCauses(outcome, { perishable_bought_too_early: 1 });
});

Deno.test("perishable_bought_too_early : le drapeau de congélation désarme la règle", () => {
  const outcome = gateWith((plan) => {
    plan.shopping_list[2].buy_on = "2026-08-25";
    plan.shopping_list[2].freeze_on_purchase = true;
  });
  assertCauses(outcome, {});
});

// ---------------------------------------------------------------------------
// ⑧ LES INTERDITS — le défaut ③ mesuré en production
// ---------------------------------------------------------------------------

Deno.test("table_exclusion_served : la table a exclu, la boîte le sert quand même", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[0].boxes[0].items.push({
      preparation_id: null,
      term: "champignons marinés",
      grams: 30,
    });
  });
  assertCauses(outcome, { table_exclusion_served: 1 });
  assertEquals(outcome.refusals[0].term, "champignons");
});

Deno.test("member_exclusion_served : le couvercle la nomme, et il porte ce qu'elle refuse", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[0].boxes[2].items.push({
      preparation_id: null,
      term: "coriandre fraîche",
      grams: 5,
    });
  });
  assertCauses(outcome, { member_exclusion_served: 1 });
  assertEquals(outcome.refusals[0].member_id, NORA);
});

Deno.test("regime_forbidden_component : une part animale dans la boîte d'une végétarienne", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[2].boxes[1].items.push({
      preparation_id: null,
      term: "poulet rôti",
      grams: 150,
    });
  });
  assertCauses(outcome, { regime_forbidden_component: 1 });
  assertEquals(outcome.refusals[0].member_id, NORA);
});

Deno.test("house_rule_served : la maison a exclu, le plat le sert", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].ingredients.push({ term: "nutella", group: "sugar_sweets" });
    plan.shopping_list.push({
      term: "nutella",
      aisle: "grocery",
      food_group: "sugar_sweets",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    });
  });
  assertCauses(outcome, { house_rule_served: 1 });
});

// ⛔ LES DEUX ÉPREUVES CI-DESSOUS TIENNENT LA COMPENSATION DU `heldOff: []`.
// La forme persistée ne porte NI `heldOff`, NI `regimeBites`, NI
// `exclusionBites` : le module les RECALCULE et les repasse à `mealsDelivered`.
// Sans elles, un plat ouvert qui mord une bouche la laisserait « nourrie », et
// c'est très exactement le défaut R2-D et FB4 déjà payés par le dépôt.

Deno.test("un plat OUVERT qui mord une exclusion ne nourrit pas cette bouche", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].ingredients.push({ term: "coriandre", group: "non_starchy_veg" });
    plan.shopping_list.push({
      term: "coriandre",
      aisle: "produce",
      food_group: "non_starchy_veg",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    });
  });
  assertCauses(outcome, { mouth_unfed: 1 });
  assertEquals(outcome.refusals[0].member_id, NORA);
  assertEquals(outcome.refusals[0].detail, "unfed:held_off_exclusion");
});

Deno.test("un plat OUVERT qui mord un régime ne nourrit pas cette bouche", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].ingredients.push({ term: "poulet", group: "poultry" });
    plan.shopping_list.push({
      term: "poulet",
      aisle: "protein",
      food_group: "poultry",
      buy_on: "2026-09-06",
      freeze_on_purchase: false,
    });
  });
  // Deux causes, et c'est JUSTE : le plat de table viole le régime le plus
  // strict de la maison ET Nora reste sans repas ce soir-là. Ce ne sont pas
  // deux voyants pour un défaut, ce sont deux conséquences.
  assertCauses(outcome, { regime_forbidden_component: 1, mouth_unfed: 1 });
  assertEquals(
    outcome.refusals.find((r) => r.cause === "mouth_unfed")?.detail,
    "unfed:held_off_regime",
  );
});

Deno.test("title_promises_missing_preparation : promet un lot, ne cite rien", () => {
  const outcome = gateWith((plan) => {
    plan.dishes[1].method = "Servez une portion de la préparation du dimanche.";
  });
  assertCauses(outcome, { title_promises_missing_preparation: 1 });
  assertEquals(outcome.counters.repairs_by_kind.strip_title_promise, 1);
  assertEquals(
    outcome.repairs[0].from,
    "Servez une portion de la préparation du dimanche.",
  );
});

Deno.test("title_promises_missing_preparation : un plat qui CITE sa casserole ne promet rien", () => {
  // Le même texte, sur un plat qui puise vraiment : la règle se tait. C'est la
  // moitié qui empêche la règle de prose de devenir un filet à faux positifs.
  const outcome = gateWith((plan) => {
    plan.dishes[0].method = "Servez une portion de la préparation du dimanche.";
  });
  assertCauses(outcome, {});
});

// ---------------------------------------------------------------------------
// ⑧ bis L'ÉNERGIE SERVIE — l'écart que le redimensionnement cachait
//
// Le moteur ne redimensionne plus : les grammes servis sont ceux que le modèle
// a composés, et les plans ne nourrissent que 65 à 72 % de leur enveloppe. La
// garde ne recalcule RIEN — l'appelant mesure, elle compare — et elle COMPTE,
// elle ne refuse pas : le seuil n'est pas calibré, et un plan refusé est un
// dîner en moins.
// ---------------------------------------------------------------------------

Deno.test("mouth_energy_short : une bouche sous le ratio, et elle seule", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.energy = [
      { memberId: PAUL, envelopeKcal: 2250, deliveredKcal: 1620 },
      { memberId: CLAIRE, envelopeKcal: 2050, deliveredKcal: 1975 },
      { memberId: LEO, envelopeKcal: 1850, deliveredKcal: 1790 },
      { memberId: NORA, envelopeKcal: 1600, deliveredKcal: 1560 },
    ];
  });
  assertCauses(outcome, { mouth_energy_short: 1 });
  assertEquals(outcome.counters.checked.energy_mouths, 4);
  assertEquals(outcome.counters.checked.energy_unmeasured, 0);
  const row = outcome.refusals[0];
  assertEquals(row.member_id, PAUL);
  assertEquals(row.term, null);
  assertEquals(row.dish, null);
  // Les DEUX nombres et le pourcentage : un compteur qui ne dit que « court »
  // n'apprend rien sur l'ampleur, qui est justement ce qu'on veut calibrer.
  assertEquals(
    row.detail,
    `${PAUL}: 1 620 kcal servies pour 2 250 attendues (72 %)`,
  );
});

Deno.test("mouth_energy_short : EXACTEMENT au ratio ne mord pas, un kcal dessous mord", () => {
  const exact = gateWith((_plan, ctx) => {
    ctx.energy = [
      { memberId: PAUL, envelopeKcal: 2000, deliveredKcal: 2000 * ENERGY_SHORT_RATIO },
    ];
  });
  assertCauses(exact, {});
  assertEquals(exact.counters.checked.energy_mouths, 1);

  // La moitié qui rend la précédente lisible : sans elle, « ne mord pas »
  // serait aussi vrai d'une règle débranchée.
  const under = gateWith((_plan, ctx) => {
    ctx.energy = [
      {
        memberId: PAUL,
        envelopeKcal: 2000,
        deliveredKcal: 2000 * ENERGY_SHORT_RATIO - 1,
      },
    ];
  });
  assertCauses(under, { mouth_energy_short: 1 });
});

Deno.test("ctx.energy à null : rien ne mord, et le compteur DIT que rien n'a été mesuré", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.energy = null;
  });
  assertCauses(outcome, {});
  // ⛔ LA MOITIÉ QUI COMPTE : zéro refus AVEC un dénominateur à zéro veut dire
  // « jamais évaluée », et `energy_unmeasured` est ce qui le rend lisible.
  assertEquals(outcome.counters.checked.energy_mouths, 0);
  assertEquals(
    outcome.counters.checked.energy_unmeasured,
    CLEAN_HOUSEHOLD_CONTEXT.mouths.length,
  );
  assertEquals(outcome.counters.checked.energy_unmeasured, 4);
});

Deno.test("une enveloppe à 0, NaN ou négative ne divise rien et ne refuse rien", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.energy = [
      { memberId: PAUL, envelopeKcal: 0, deliveredKcal: 1200 },
      { memberId: CLAIRE, envelopeKcal: Number.NaN, deliveredKcal: 1200 },
      { memberId: LEO, envelopeKcal: -2000, deliveredKcal: 1200 },
      { memberId: NORA, envelopeKcal: 1600, deliveredKcal: 1560 },
    ];
  });
  assertCauses(outcome, {});
  // Les trois lignes fautives ne gonflent PAS le dénominateur : elles vont au
  // témoin. Les compter comme évaluées ferait passer une donnée absente pour
  // une bouche correctement nourrie.
  assertEquals(outcome.counters.checked.energy_mouths, 1);
  assertEquals(outcome.counters.checked.energy_unmeasured, 3);
});

Deno.test("mouth_energy_short ne fait PAS tomber le plan, aux trois lots", () => {
  for (
    const policy of [
      FINAL_GATE_POLICY_LOT_1,
      FINAL_GATE_POLICY_LOT_2,
      FINAL_GATE_POLICY_LOT_3,
    ]
  ) {
    const plan = planCopy();
    const ctx = contextCopy();
    ctx.policy = { ...policy };
    ctx.energy = [
      { memberId: PAUL, envelopeKcal: 2250, deliveredKcal: 1620 },
      { memberId: CLAIRE, envelopeKcal: 2050, deliveredKcal: 1975 },
      { memberId: LEO, envelopeKcal: 1850, deliveredKcal: 1790 },
      { memberId: NORA, envelopeKcal: 1600, deliveredKcal: 1560 },
    ];
    const outcome = finalPlanGate(plan as GatePlan, ctx as GateContext);
    assertEquals(outcome.counters.refusals_by_cause.mouth_energy_short, 1);
    assertEquals(outcome.refusals[0].severity, "count");
    assertEquals(outcome.ok, true, "sous-nourrir se COMPTE, ça ne refuse pas");
  }
});

// ---------------------------------------------------------------------------
// ⑨ LES RÉPARATIONS
// ---------------------------------------------------------------------------

Deno.test("applyFinalGateRepairs : les trois références pendantes disparaissent", () => {
  const plan = planCopy();
  plan.dishes[0].uses[0].preparation_id = "prep_ghost";
  plan.dishes[2].boxes[0].items[0].preparation_id = "prep_ghost";
  plan.cooking_sessions[0].preparation_ids.push("prep_ghost");

  const first = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(first.counters.refusals_by_cause.uses_dangling, 1);
  assertEquals(first.counters.refusals_by_cause.box_item_dangling, 1);
  assertEquals(first.counters.refusals_by_cause.session_cites_unknown, 1);

  const repaired = applyFinalGateRepairs(plan as GatePlan, first.repairs);
  const second = finalPlanGate(repaired, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(second.counters.refusals_by_cause.uses_dangling, 0);
  assertEquals(second.counters.refusals_by_cause.box_item_dangling, 0);
  assertEquals(second.counters.refusals_by_cause.session_cites_unknown, 0);
  assertEquals(second.repairs.length, 0);
  // Le retrait a bien eu lieu, et il n'a rien emporté d'autre.
  assertEquals(repaired.dishes[0].uses.length, 0);
  assertEquals(repaired.dishes[2].boxes[0].items.length, 0);
  assertEquals(repaired.cooking_sessions[0].preparation_ids.length, 2);
});

Deno.test("applyFinalGateRepairs : la phrase de promesse est retirée du plat", () => {
  const plan = planCopy();
  plan.dishes[1].method =
    "Faites revenir les oignons. Servez une portion de la préparation du dimanche.";
  const first = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(first.counters.refusals_by_cause.title_promises_missing_preparation, 1);

  const repaired = applyFinalGateRepairs(plan as GatePlan, first.repairs);
  assertEquals(repaired.dishes[1].method, "Faites revenir les oignons.");
  const second = finalPlanGate(repaired, CLEAN_HOUSEHOLD_CONTEXT);
  assertCauses(second, {});
});

Deno.test("applyFinalGateRepairs : plusieurs retraits dans la MÊME liste", () => {
  // ⛔ LE CAS QUI CASSE UN `splice` NAÏF : deux index dans la même liste, le
  // premier retrait décalant le second.
  const plan = planCopy();
  plan.dishes[0].boxes[0].items.push({ preparation_id: "prep_ghost_a", term: "x" });
  plan.dishes[0].boxes[0].items.push({ preparation_id: "prep_ghost_b", term: "y" });
  const first = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(first.counters.refusals_by_cause.box_item_dangling, 2);
  const repaired = applyFinalGateRepairs(plan as GatePlan, first.repairs);
  assertEquals(repaired.dishes[0].boxes[0].items.length, 1);
  assertEquals(
    repaired.dishes[0].boxes[0].items[0].preparation_id,
    "prep_oats_sun",
  );
});

// ---------------------------------------------------------------------------
// ⑩ PURETÉ ET DÉTERMINISME
// ---------------------------------------------------------------------------

Deno.test("finalPlanGate ne mute NI le plan NI le contexte", () => {
  const planBefore = structuredClone(CLEAN_HOUSEHOLD_PLAN);
  const ctxBefore = structuredClone(CLEAN_HOUSEHOLD_CONTEXT);
  finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(structuredClone(CLEAN_HOUSEHOLD_PLAN), planBefore);
  assertEquals(structuredClone(CLEAN_HOUSEHOLD_CONTEXT), ctxBefore);
});

Deno.test("applyFinalGateRepairs ne mute pas le plan qu'on lui donne", () => {
  const plan = planCopy();
  plan.dishes[0].uses[0].preparation_id = "prep_ghost";
  plan.cooking_sessions[0].preparation_ids.push("prep_ghost");
  const before = structuredClone(plan);
  const outcome = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  const repaired = applyFinalGateRepairs(plan as GatePlan, outcome.repairs);
  assertEquals(structuredClone(plan), before);
  // ...et elle a bien rendu un AUTRE plan.
  assert(repaired !== (plan as unknown as GatePlan));
  assertEquals(repaired.dishes[0].uses.length, 0);
});

Deno.test("deux passes sur la même entrée rendent le même JSON", () => {
  const plan = planCopy();
  plan.dishes[0].uses[0].preparation_id = "prep_ghost";
  plan.dishes[1].member_id = PAUL;
  plan.shopping_list[2].buy_on = "2026-08-25";
  const a = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  const b = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

// ---------------------------------------------------------------------------
// ⑪ LES POLITIQUES ET LA SÉMANTIQUE DE `ok`
// ---------------------------------------------------------------------------

Deno.test("politiques : les sévérités épinglées, une par une", () => {
  assertEquals(FINAL_GATE_POLICY_LOT_1.eaten_before_cooked, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_2.eaten_before_cooked, "refuse");
  assertEquals(FINAL_GATE_POLICY_LOT_2.table_exclusion_served, "refuse");
  assertEquals(FINAL_GATE_POLICY_LOT_2.uses_dangling, "repair");
  assertEquals(FINAL_GATE_POLICY_LOT_2.perishable_bought_too_early, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_3.perishable_bought_too_early, "refuse");
  assertEquals(FINAL_GATE_POLICY_LOT_3.ingredient_not_bought, "refuse");
  assertEquals(FINAL_GATE_POLICY_LOT_3.uses_dangling, "repair");
  // ⛔ LES TROIS, NOMMÉMENT. `mouth_energy_short` compte partout, y compris là
  // où tout le reste mord : c'est un arbitrage, pas un défaut de la liste.
  assertEquals(FINAL_GATE_POLICY_LOT_1.mouth_energy_short, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_2.mouth_energy_short, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_3.mouth_energy_short, "count");
});

Deno.test("ENERGY_SHORT_RATIO vaut 0,9 — provisoire, épinglé pour qu'on le déplace exprès", () => {
  // Le seuil n'est calibré par aucune campagne : il est exporté et épinglé
  // pour qu'un futur commit le bouge DÉLIBÉRÉMENT, pas par glissement.
  assertEquals(ENERGY_SHORT_RATIO, 0.9);
});

Deno.test("LOT_1 ne porte AUCUN « refuse » — c'est le lot d'observation", () => {
  for (const cause of FINAL_GATE_CAUSES) {
    assertEquals(
      FINAL_GATE_POLICY_LOT_1[cause],
      "count",
      `« ${cause} » mord sous LOT_1, qui ne doit rien refuser`,
    );
  }
  // Et les trois politiques couvrent les 22 causes, sans trou.
  for (const cause of FINAL_GATE_CAUSES) {
    assert(FINAL_GATE_POLICY_LOT_2[cause] !== undefined);
    assert(FINAL_GATE_POLICY_LOT_3[cause] !== undefined);
  }
});

Deno.test("`ok` reste vrai sous LOT_1 malgré des refus listés", () => {
  const plan = planCopy();
  plan.preparations[0].cook_on = "mon";
  plan.cooking_sessions[0].preparation_ids = ["prep_quinoa_sun"];
  plan.cooking_sessions.push({ day: "mon", preparation_ids: ["prep_oats_sun"] });
  const outcome = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(outcome.counters.refusals_by_cause.eaten_before_cooked, 1);
  assertEquals(outcome.ok, true, "LOT_1 mesure, il ne mord pas");
  assertEquals(outcome.refusals[0].severity, "count");
});

Deno.test("`ok` bascule à faux sous LOT_2 pour le MÊME plan", () => {
  const plan = planCopy();
  const ctx = contextCopy();
  ctx.policy = { ...FINAL_GATE_POLICY_LOT_2 };
  plan.preparations[0].cook_on = "mon";
  plan.cooking_sessions[0].preparation_ids = ["prep_quinoa_sun"];
  plan.cooking_sessions.push({ day: "mon", preparation_ids: ["prep_oats_sun"] });
  const outcome = finalPlanGate(plan as GatePlan, ctx as GateContext);
  assertEquals(outcome.ok, false);
  assertEquals(outcome.refusals[0].severity, "refuse");
});

Deno.test("`ok` : une cause en « repair » ne fait PAS tomber le plan sous LOT_2", () => {
  const plan = planCopy();
  const ctx = contextCopy();
  ctx.policy = { ...FINAL_GATE_POLICY_LOT_2 };
  plan.dishes[0].uses[0].preparation_id = "prep_ghost";
  const outcome = finalPlanGate(plan as GatePlan, ctx as GateContext);
  assertEquals(outcome.counters.refusals_by_cause.uses_dangling, 1);
  assertEquals(outcome.refusals[0].severity, "repair");
  assertEquals(outcome.ok, true);
});

Deno.test("`ok` : les courses ne mordent qu'au LOT_3", () => {
  const plan = planCopy();
  plan.shopping_list[2].buy_on = "2026-08-25";

  const two = contextCopy();
  two.policy = { ...FINAL_GATE_POLICY_LOT_2 };
  assertEquals(finalPlanGate(plan as GatePlan, two as GateContext).ok, true);

  const three = contextCopy();
  three.policy = { ...FINAL_GATE_POLICY_LOT_3 };
  const outcome = finalPlanGate(plan as GatePlan, three as GateContext);
  assertEquals(outcome.ok, false);
  assertEquals(outcome.refusals[0].cause, "perishable_bought_too_early");
});

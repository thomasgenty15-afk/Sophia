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
  FINAL_GATE_POLICY_LOT_4,
  ESSENTIAL_CONTROLS,
  HOUSEHOLD_BETA_ESSENTIALS,
  type FinalGateCause,
  type FinalGateOutcome,
  finalGateDelivery,
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

Deno.test("le plan propre du foyer ne déclenche AUCUNE des 25 causes", () => {
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
  // ⟳ 2026-09-11 · LOT E — LA LISTE DES TÉMOINS EST NOMMÉE, ET ELLE GRANDIT
  // AVEC LES CAUSES. Un témoin dit ce qui a ÉCHAPPÉ à une mesure; sur un cas
  // propre il vaut zéro ou presque, et l'exclure ici est ce qui lui donne son
  // sens. `protein_protected` en est un: une abstention LÉGITIME (plancher TCA,
  // mineur) n'est pas un trou, et elle vaut zéro sur quatre adultes.
  const TEMOINS = new Set([
    "energy_unmeasured",
    "shopping_unverified",
    // ⟳ 2026-09-12 · C3 — l'eau du robinet est un témoin, pas un dénominateur :
    // un plan propre qui ne cuit rien à l'eau vaut zéro ici, et c'est juste.
    "shopping_not_purchasable",
    "protein_protected",
    "protein_unmeasured",
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — TÉMOIN, PAS DÉNOMINATEUR. Il compte les
    // lignes dont la conservation n'a pas pu être lue ; sur un cas propre il
    // vaut zéro, et c'est ce zéro qui lui donne son sens.
    "keeping_unknown_lines",
    // ⟳ 2026-09-13 · LOT 1 — TÉMOIN, PAS DÉNOMINATEUR, ET POUR LA MÊME RAISON
    // QUE `protein_protected`: il compte les cases dont le contrat d'énergie
    // s'est abstenu (âge inconnu, corps absent, ceinture illisible). Sur quatre
    // adultes mesurables il vaut zéro, et c'est ce zéro qui lui donne son sens.
    "cell_energy_no_target",
    // ⟳ 2026-09-14 · BÊTA 1A — TÉMOIN, PAS DÉNOMINATEUR. Il compte les plats à
    // part que la GRILLE réclame; ce foyer-ci n'en réclame aucun (les quatre
    // bouches mangent la base végétarienne), et son zéro est « rien à devoir ».
    // Le dénominateur est `dedicated_cells_checked`, qui vaut `mouth_cells`
    // dès que la grille a tourné — et il est vérifié juste en dessous.
    "dedicated_obligations",
  ]);
  for (const [name, value] of Object.entries(checked)) {
    if (TEMOINS.has(name)) continue;
    assert(value > 0, `dénominateur « ${name} » à zéro : la règle n'a pas tourné`);
  }
  // Les valeurs exactes, pour que la déformation d'un cas se voie.
  assertEquals(checked.uses, 2);
  assertEquals(checked.box_items, 5);
  assertEquals(checked.session_ids, 2);
  assertEquals(checked.cooked_pairs, 2);
  assertEquals(checked.cells, 3);
  // ⟳ 2026-09-14 · BÊTA 1A — LA QUESTION A ÉTÉ POSÉE À CHAQUE COUPLE, et c'est
  // ce qui sépare « ce foyer ne doit rien » de « la grille n'a pas tourné ».
  assertEquals(checked.dedicated_cells_checked, checked.mouth_cells);
  assertEquals(checked.dedicated_obligations, 0);
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

// ⟳ 2026-09-11 · LOT E — LA DÉCISION D'ACHAT NE LIT PLUS UN LIBELLÉ.
//
// ⛔ CE QUI A CHANGÉ DANS CES TESTS, ET POURQUOI. Ils déformaient le PLAN (un
// ingrédient de plus, pas de ligne de courses) et attendaient que la garde le
// remarque en comparant des mots. Elle ne compare plus rien: c'est
// `final_plan_audit.ts` qui résout les identités, et la garde lit son verdict.
// Le cas qui MORD est donc une LIGNE D'AUDIT, pas un libellé absent — et c'est
// exactement ce qui tue les 8 faux positifs de pluriel du 2026-09-11.

Deno.test("ingredient_not_bought : une identité que rien n'achète", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.shopping = [...(ctx.shopping ?? []), {
      identity: "ginger",
      displayTerm: "gingembre frais",
      state: "not_bought",
      reason: "aucune ligne de courses, aucun garde-manger",
    }];
  });
  assertCauses(outcome, { ingredient_not_bought: 1 });
  assertEquals(outcome.counters.checked.shopping_identities, 11);
});

Deno.test("ingredient_short_bought : présent, mais pas assez", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.shopping = [...(ctx.shopping ?? []), {
      identity: "ginger",
      displayTerm: "gingembre frais",
      state: "short",
      reason: "40 g achetés pour 120 g requis",
    }];
  });
  assertCauses(outcome, { ingredient_short_bought: 1 });
  // ⛔ LE CAS QUI PASSE EST À CÔTÉ: la même identité COUVERTE ne mord pas, et
  // elle entre quand même au dénominateur des quantités comparées.
  assertEquals(outcome.counters.checked.shopping_quantified, 10);
});

Deno.test("une suffisance non vérifiable N'EST PAS un manque", () => {
  // Le garde-manger de la fixture propre (« huile d'olive ») est déjà dans cet
  // état: présent, quantité inconnue. Il ne produit AUCUN refus, et il se
  // compte — c'est la différence entre « non contrôlé » et « manquant ».
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  assertCauses(outcome, {});
  assertEquals(outcome.counters.checked.shopping_unverified, 1);
  assertEquals(outcome.counters.checked.shopping_quantified, 9);
});

Deno.test("aucun audit d'achats : les causes ne tournent PAS, et ça se lit", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.shopping = null;
  });
  assertCauses(outcome, {});
  // ⛔ ZÉRO DÉNOMINATEUR = JAMAIS ÉVALUÉ. Et surtout: aucun repli par libellé
  // n'est resté derrière, donc aucune alerte de pluriel ne peut revenir.
  assertEquals(outcome.counters.checked.shopping_identities, 0);
  assertEquals(outcome.counters.checked.shopping_unverified, 0);
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

// ⟳ 2026-09-23 — LES À-CÔTÉS PASSENT AU VERROU DE LA MAISON (chemin d'adoption).
// Même geste que le générateur: l'à-côté tombe (réparation), le plat reste, et
// AUCUNE cause n'est levée — donc aucun refus, même sous LOT_4.

Deno.test("house rule, à-côté : un dessert au nutella est retiré et compté, le plan passe", () => {
  const outcome = gateWith((plan, ctx) => {
    ctx.policy = FINAL_GATE_POLICY_LOT_4 as MutableContext["policy"];
    (plan.dishes[1] as Record<string, unknown>).side_courses = [
      { member_id: PAUL, kind: "dessert", term: "pomme" },
      { member_id: CLAIRE, kind: "dessert", term: "crêpe au nutella" },
      { member_id: NORA, kind: "cheese", term: "comté" },
    ];
  });
  assertCauses(outcome, {});
  assertEquals(outcome.ok, true);
  assertEquals(outcome.counters.repairs_by_kind.drop_house_rule_side_course, 1);
  assertEquals(outcome.repairs, [{
    kind: "drop_house_rule_side_course",
    at: { dish: 1, item: 1 },
    from: "crêpe au nutella",
    to: null,
  }]);
});

Deno.test("house rule, à-côté : rien ne mord ⇒ zéro réparation, compteur à zéro (le cas qui passe)", () => {
  const outcome = gateWith((plan) => {
    (plan.dishes[1] as Record<string, unknown>).side_courses = [
      { member_id: PAUL, kind: "dessert", term: "pomme" },
      // Négation tolérée, comme la substance: « sans nutella » ne sert rien.
      { member_id: CLAIRE, kind: "dessert", term: "yaourt nature sans nutella" },
    ];
  });
  assertCauses(outcome, {});
  assertEquals(outcome.counters.repairs_by_kind.drop_house_rule_side_course, 0);
  assertEquals(outcome.repairs, []);
});

Deno.test("applyFinalGateRepairs : l'à-côté mordu disparaît, les autres et le plat restent", () => {
  const plan = planCopy();
  (plan.dishes[1] as Record<string, unknown>).side_courses = [
    { member_id: PAUL, kind: "dessert", term: "nutella" },
    { member_id: CLAIRE, kind: "dessert", term: "pomme" },
    { member_id: NORA, kind: "bread", term: "pain au nutella" },
  ];
  const first = finalPlanGate(plan as GatePlan, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(first.counters.repairs_by_kind.drop_house_rule_side_course, 2);
  const repaired = applyFinalGateRepairs(plan as GatePlan, first.repairs);
  assertEquals(repaired.dishes[1].side_courses, [
    { member_id: CLAIRE, kind: "dessert", term: "pomme" },
  ]);
  assertEquals(repaired.dishes[1].title, plan.dishes[1].title);
  // Un plat sans à-côtés ressort sans la clé.
  assertEquals("side_courses" in repaired.dishes[0], false);
  const second = finalPlanGate(repaired, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(second.repairs, []);
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 1 — LA CASE SANS CIBLE, DANS LA GARDE ELLE-MÊME
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI CE CAS EXISTE, ET IL A ÉTÉ MESURÉ. Les épreuves de
// `plan_validation_test.ts` posent `checked` à la main: retirer la branche
// `no_target` de la BOUCLE de la garde les laissait toutes VERTES. Une garde
// qu'aucun test ne fait tourner sur son entrée réelle est une garde désarmée.
//
// LA MUTATION QUE CETTE ÉPREUVE DOIT FAIRE ROUGIR
//   R6 — la branche `no_target` quitte la boucle: la case retombe dans
//        `measured_cells`, donc dans le dénominateur de `cell_energy_off`,
//        et un contrôle que personne n'a pu rendre se lit « réussi ». ROUGE.

Deno.test("LOT 1 — une case sans cible quitte le dénominateur de l'énergie", () => {
  const propre = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  assertEquals(propre.counters.checked.cell_energy_no_target, 0);
  const mesureesAvant = propre.counters.checked.measured_cells;
  assert(mesureesAvant > 0, "le cas propre doit mesurer des cases");

  // Une seule bouche perd sa cible — le contrat s'est abstenu (âge inconnu,
  // corps absent…). Sa portion existe et son énergie est lisible: c'est très
  // exactement l'état `no_target` de `final_plan_audit.ts`.
  const nutrition = CLEAN_HOUSEHOLD_CONTEXT.nutrition!;
  const touchee = nutrition.cells.find((c) =>
    c.portionExpected && c.state === "conforme"
  )!;
  const sansCible = {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: {
      ...nutrition,
      cells: nutrition.cells.map((c) =>
        c === touchee
          ? { ...c, targetKcal: null, deltaPct: null, state: "no_target" as const }
          : c
      ),
    },
  };
  const out = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, sansCible);
  const { checked } = out.counters;

  // ⛔ ELLE EST NOMMÉE…
  assertEquals(checked.cell_energy_no_target, 1);
  // ⛔ …ELLE A QUITTÉ LE DÉNOMINATEUR…
  assertEquals(checked.measured_cells, mesureesAvant - 1);
  // ⛔ …ET LA SURFACE DU CONTRÔLE DE PORTION N'A PAS BOUGÉ: la case reste une
  // case attendue, elle a bien un plat et une portion.
  assertEquals(checked.portion_cells, propre.counters.checked.portion_cells);
  // ⛔ ET AUCUNE CAUSE N'EST LEVÉE: ni un refus, ni un écart.
  assertEquals(out.refusals.length, 0);

  // ⛔ ENFIN, ELLE NE TOMBE PAS DANS `incomplete`: 3 − 2 − 1 = 0.
  const livraison = finalGateDelivery(out, []);
  assertEquals(
    livraison.incomplete.find((i) => i.control === "cell_energy"),
    undefined,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1A — CE QUE LA GRILLE DOIT, ET LA CARDINALITÉ D'UNE CASE
//
// ⛔ POURQUOI CES TROIS ÉPREUVES EXISTENT. La clôture du 2026-09-14 nomme deux
// défauts que RIEN ne refusait: ⑥ « un plat dédié réclamé et adressé à la
// mauvaise bouche n'est plus servi à personne — et rien ne refuse cet écart »,
// ⑧ « une bouche déclarée impossible à nourrir depuis la casserole commune
// peut n'avoir aucun plat à elle, et le plan sort `conforme` ». Les deux
// tombent du même trou: la garde finale ne posait jamais la question.
// ═══════════════════════════════════════════════════════════════════════════

/** La case du dahl partagé — un plat de table, sans boîte. */
const CASE_DAHL = { day: "sun", slot: "dinner" } as const;

/** Un plat à part, réduit au strict nécessaire pour ne toucher aucune autre cause. */
function platAPart(memberId: string) {
  return {
    name: "Dahl sans crème",
    title: "Dahl de lentilles, version à part",
    day: CASE_DAHL.day,
    slot: CASE_DAHL.slot,
    method: "Prélevez avant d'ajouter la crème.",
    why: "Sa ligne ne passe pas par la casserole commune.",
    member_id: memberId,
    // ⚠️ AUCUN INGRÉDIENT, AUCUNE CITATION, AUCUNE BOÎTE: le but est de
    // prouver UNE cause. Un plat plus riche ferait bouger les dénominateurs
    // d'achat et de conservation, et l'épreuve ne dirait plus laquelle a parlé.
    ingredients: [],
    uses: [],
    boxes: [],
  };
}

Deno.test("BÊTA 1A — la grille doit un plat pour un RÉGIME, et il est servi: rien ne mord", () => {
  // ⛔ LE CAS QUI PASSE, ET IL VIENT EN PREMIER. Sans lui, l'épreuve suivante
  // serait vraie d'une garde qui refuse tout ce qu'on lui montre.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
    plan.dishes.push(platAPart(NORA) as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, {});
  assertEquals(outcome.counters.checked.dedicated_obligations, 1);
  assert(outcome.counters.checked.dedicated_cells_checked > 0);
});

Deno.test("BÊTA 1A — la même obligation NON servie refuse le plan, et elle seule", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
  });
  assertCauses(outcome, { dedicated_dish_missing: 1 });
  const refus = outcome.refusals.find((r) => r.cause === "dedicated_dish_missing");
  assertEquals(refus?.day, CASE_DAHL.day);
  assertEquals(refus?.slot, CASE_DAHL.slot);
  assertEquals(refus?.member_id, NORA);
  assertEquals(
    finalPlanGate(planCopy() as GatePlan, {
      ...contextCopy(),
      dedicated: [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }],
      policy: FINAL_GATE_POLICY_LOT_4,
    } as GateContext).ok,
    false,
  );
});

Deno.test("BÊTA 1A — un plat adressé à une AUTRE bouche ne remplit pas l'obligation", () => {
  // ⛔ LE POINT ⑥, ÉCRIT EN UNE ÉPREUVE. « asked: 12 · attributed: 0 »: la
  // consigne promettait un plat à Nils et Iris, le modèle l'adressait à Lea.
  // Un plat existe, il porte bien un `member_id` — et l'obligation reste
  // entière. Ce que ce test interdit, c'est de compter les plats au lieu de
  // les lire.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
    plan.dishes.push(platAPart(LEO) as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, { dedicated_dish_missing: 1 });
});

Deno.test("BÊTA 1A — un plat sur une AUTRE case ne remplit pas l'obligation non plus", () => {
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
    const ailleurs = { ...platAPart(NORA), day: "mon" };
    plan.dishes.push(ailleurs as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, { dedicated_dish_missing: 1 });
});

Deno.test("BÊTA 1A — « mon repas à moi » non servi COMPTE et ne refuse JAMAIS", () => {
  // ⛔ LA MOITIÉ QUI REND L'AUTRE LISIBLE. Une habitude déclarée n'est pas une
  // impossibilité: la fondre dans la cause bloquante ferait refuser un plan
  // pour un petit-déjeuner préféré.
  const ctx = {
    ...contextCopy(),
    dedicated: [{ ...CASE_DAHL, memberId: NORA, reason: "own_meal" as const, baseEdible: true }],
    policy: FINAL_GATE_POLICY_LOT_4,
  } as GateContext;
  const outcome = finalPlanGate(planCopy() as GatePlan, ctx);
  assertCauses(outcome, { own_meal_dish_missing: 1 });
  assertEquals(outcome.ok, true);
  assertEquals(finalGateDelivery(outcome, []).state, "deliverable_with_gaps");
});

Deno.test("BÊTA 1A — deux plats de table sur une case refusent le plan", () => {
  // ⛔ POINT ⑦ DE LA CLÔTURE, ET CE DÉCOR MONTRE LE PIRE CAS. Sur une case en
  // BOÎTES, ces deux plats tombaient déjà — mais par `mouth_unfed / double`,
  // c'est-à-dire sous la conséquence et pas la cause. ⚠️ ICI, AUCUN DES DEUX
  // PLATS N'A DE BOÎTE: aucun couvercle n'est donc compté en double, et le
  // plan passait. `assertCauses` le prouve — `mouth_unfed` reste à zéro, et
  // seule la cause neuve parle.
  const outcome = gateWith((plan) => {
    const jumeau = platAPart(NORA);
    jumeau.member_id = null as unknown as string;
    plan.dishes.push(jumeau as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, { cell_two_table_dishes: 1 });
  const refus = outcome.refusals.find((r) => r.cause === "cell_two_table_dishes");
  assertEquals(refus?.day, CASE_DAHL.day);
  assertEquals(refus?.slot, CASE_DAHL.slot);
});

Deno.test("BÊTA 1A — un plat DÉDIÉ à côté du plat de table n'est PAS un doublon", () => {
  // ⚠️ LA GARDE DE CARDINALITÉ A UN CAS QUI PASSE, ET C'EST LE CAS ORDINAIRE:
  // deux CONTENANTS sur une case sont normaux, deux REPAS concurrents ne le
  // sont pas. Sans cette épreuve, la précédente serait vraie d'une garde qui
  // interdit tout second plat.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
    plan.dishes.push(platAPart(NORA) as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, {});
});

Deno.test("BÊTA 1A — `dedicated: null` ⇒ la question n'est PAS posée, et ça se lit", () => {
  // ⛔ « NON ÉVALUÉ » N'EST PAS « PROPRE ». C'est le chemin d'adoption et la
  // lane solo: la grille n'existe pas, et le dénominateur reste à zéro pour
  // que `unevaluated` nomme les deux causes.
  const outcome = finalPlanGate(planCopy() as GatePlan, {
    ...contextCopy(),
    dedicated: null,
  } as GateContext);
  assertCauses(outcome, {});
  assertEquals(outcome.counters.checked.dedicated_cells_checked, 0);
  const nonEvaluees = finalGateDelivery(outcome, []).unevaluated;
  assert(nonEvaluees.includes("dedicated_dish_missing"));
  assert(nonEvaluees.includes("own_meal_dish_missing"));
});

Deno.test("BÊTA 1A — un COMPLÉMENT ne remplit pas une obligation de régime", () => {
  // ⛔ UN COMPLÉMENT COMPLÈTE LA TABLE, IL NE LA REMPLACE PAS: son porteur
  // reste mangeur du plat partagé, et c'est précisément ce plat-là que sa
  // ligne lui interdit. Sans cette lecture, une réparation d'énergie qui crée
  // un complément ferait disparaître une obligation de sécurité — un plat
  // apparaît, l'obligation s'éteint, la personne mange quand même la casserole.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{ ...CASE_DAHL, memberId: NORA, reason: "regime", baseEdible: false }];
    const complement = { ...platAPart(NORA), complements_shared: true };
    plan.dishes.push(complement as MutablePlan["dishes"][number]);
  });
  assertCauses(outcome, { dedicated_dish_missing: 1 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1B ⑦⑧ — « RIEN N'A MORDU » N'EST PAS « TOUT A ÉTÉ LU »
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 1B ⑧ — LE CAS QUI PASSE: le foyer propre satisfait les sept contrôles", () => {
  // ⛔ D'ABORD, TOUJOURS. Une exigence qui refuse même le cas propre est une
  // exigence qu'on débranchera la semaine suivante.
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  const livraison = finalGateDelivery(outcome, HOUSEHOLD_BETA_ESSENTIALS);
  assertEquals(livraison.missingEssential, []);
  assertEquals(livraison.state, "conforme");
});

Deno.test("BÊTA 1B ⑧ — sans mesure de nutrition, le plan n'est PAS livrable", () => {
  // ⛔ C'EST LA LIGNE DE L'ÉTAT DE DÉPART: « la garde construit `incomplete`
  // mais choisit `state` seulement selon `blocking` et `gaps` ». Un plan sans
  // aucun refus dont AUCUNE portion n'a été mesurée sortait `conforme`.
  const outcome = gateWith((_plan, ctx) => {
    ctx.nutrition = null;
  });
  const sans = finalGateDelivery(outcome, HOUSEHOLD_BETA_ESSENTIALS);
  assertEquals(sans.blocking.length, 0, "aucun refus: c'est bien un contrôle, pas une cause");
  assertEquals(sans.state, "not_deliverable");
  assert(sans.missingEssential.includes("portions_measured"));
  // ⚠️ ET LE MÊME PLAN RESTE `conforme` LÀ OÙ RIEN N'EST EXIGÉ — le chemin
  // d'adoption, qui n'a ni référentiel ni grille.
  assertEquals(finalGateDelivery(outcome, []).state, "conforme");
});

Deno.test("BÊTA 1B ⑧ — sans audit des courses non plus", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.shopping = null;
  });
  const livraison = finalGateDelivery(outcome, HOUSEHOLD_BETA_ESSENTIALS);
  assertEquals(livraison.state, "not_deliverable");
  assert(livraison.missingEssential.includes("shopping_audited"));
});

Deno.test("BÊTA 1B ⑧ — sans grille des plats à part non plus", () => {
  const outcome = gateWith((_plan, ctx) => {
    ctx.dedicated = null;
  });
  const livraison = finalGateDelivery(outcome, HOUSEHOLD_BETA_ESSENTIALS);
  assertEquals(livraison.state, "not_deliverable");
  assert(livraison.missingEssential.includes("dedicated_checked"));
});

Deno.test("BÊTA 1B ⑦ — une LIGNE illisible est un écart nommé, pas un contrôle absent", () => {
  // ⛔ LA DISTINCTION QUE CE LOT A DÛ APPRENDRE, ET ELLE A FAILLI ÊTRE MANQUÉE.
  // Le foyer propre du banc porte un DIMANCHE délibérément `unmeasurable` et
  // quatre journées-bouche de protéine en `coverage_unknown`. Une exigence
  // « zéro ligne incomplète » l'aurait refusé — c'est-à-dire refusé le cas que
  // ce dépôt a écrit comme étant propre.
  const propre = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  assert(propre.counters.checked.protein_unmeasured > 0, "le décor a changé");
  const livraison = finalGateDelivery(propre, HOUSEHOLD_BETA_ESSENTIALS);
  // ⚠️ IL EST LIVRABLE, ET SON TROU EST ÉCRIT: `incomplete` le porte, il ne
  // disparaît pas.
  assertEquals(livraison.missingEssential, []);
  assert(
    livraison.incomplete.some((i) => i.control === "protein_floor"),
    "le trou a disparu du relevé au lieu d'y rester nommé",
  );
});

Deno.test("BÊTA 1B ⑦ — mais un plancher protéique qui n'a JAMAIS conclu bloque", () => {
  // ⛔ L'AUTRE MOITIÉ: dénominateur à zéro, rien de protégé, et des journées
  // illisibles. Ce n'est plus « une journée à trou », c'est « l'instrument n'a
  // rien rendu » — et ça se répare ailleurs que dans le plan.
  const base = contextCopy();
  const outcome = finalPlanGate(planCopy() as GatePlan, {
    ...base,
    nutrition: base.nutrition === null ? null : {
      cells: base.nutrition.cells,
      days: base.nutrition.days.map((d) => ({
        ...d,
        proteinG: null,
        protein: { coveredFloorG: null, coveredCeilingG: null, reason: "coverage_unknown" },
      })),
    },
  } as GateContext);
  const livraison = finalGateDelivery(outcome, HOUSEHOLD_BETA_ESSENTIALS);
  assertEquals(livraison.state, "not_deliverable");
  assert(livraison.missingEssential.includes("protein_floor_concluded"));
});

Deno.test("BÊTA 1B ⑧ — chaque contrôle essentiel sait dire quand il manque", () => {
  // ⛔ SANS CETTE ÉPREUVE, UN CONTRÔLE DE LA LISTE POURRAIT N'AVOIR AUCUN
  // PRÉDICAT QUI MORDE, et l'exiger ne changerait rien. C'est la forme
  // « ceinture armée sur un coffre vide », et ce dépôt l'a déjà payée.
  const sansNutrition = (
    f: (n: NonNullable<MutableContext["nutrition"]>) => MutableContext["nutrition"],
  ): FinalGateOutcome => {
    const base = contextCopy();
    return finalPlanGate(planCopy() as GatePlan, {
      ...base,
      nutrition: base.nutrition === null ? null : f(base.nutrition),
    } as GateContext);
  };
  // ⛔ LA TABLE EST COMPLÈTE, ET LE TYPE L'EXIGE (`Record`, pas `Partial`): un
  // contrôle ajouté demain sans décor de rupture serait un contrôle qu'on
  // exige sans savoir le faire mordre.
  const casse: Record<typeof ESSENTIAL_CONTROLS[number], () => FinalGateOutcome> = {
    cells_expected: () => gateWith((_p, ctx) => { ctx.mouths = []; }),
    mouth_cells: () => gateWith((_p, ctx) => { ctx.mouths = []; }),
    portions_measured: () => gateWith((_p, ctx) => { ctx.nutrition = null; }),
    shopping_audited: () => gateWith((_p, ctx) => { ctx.shopping = null; }),
    dedicated_checked: () => gateWith((_p, ctx) => { ctx.dedicated = null; }),
    // AUCUNE case jugeable: une portion existe, aucune cible, aucun servi — et
    // aucune n'est « sans objet », donc le contrôle s'appliquait.
    cell_energy_concluded: () =>
      sansNutrition((n) => ({
        days: n.days,
        cells: n.cells.map((c) => ({
          ...c,
          targetKcal: null,
          servedKcal: null,
          deltaPct: null,
          state: "unmeasurable" as const,
          gap: null,
        })),
      })),
    protein_floor_concluded: () =>
      sansNutrition((n) => ({
        cells: n.cells,
        days: n.days.map((d) => ({
          ...d,
          proteinG: null,
          protein: { coveredFloorG: null, coveredCeilingG: null, reason: "coverage_unknown" },
        })),
      })),
  };
  for (const control of ESSENTIAL_CONTROLS) {
    assert(
      finalGateDelivery(casse[control](), HOUSEHOLD_BETA_ESSENTIALS)
        .missingEssential.includes(control),
      `« ${control} » ne sait pas dire qu'il manque`,
    );
  }
});

Deno.test("BÊTA 1A — une VARIANTE réclamée mais non servie COMPTE, elle ne refuse pas", () => {
  // ⛔ LA CORRECTION MESURÉE DU 2026-09-14, ÉPINGLÉE. Cette cause a d'abord lu
  // `dietDiverges` tout entier, et rejouée sur la référence N=2 (végane +
  // omnivore) elle a rendu SIX refus bloquants sur un plan dont le plancher
  // protéique est tenu. L'omnivore mange la casserole végane: sa ligne ne lui
  // interdit rien. Ce qui manque est ce qu'il PRÉFÉRAIT, pas de quoi manger.
  const ctx = {
    ...contextCopy(),
    dedicated: [{ ...CASE_DAHL, memberId: NORA, reason: "regime" as const, baseEdible: true }],
    policy: FINAL_GATE_POLICY_LOT_4,
  } as GateContext;
  const outcome = finalPlanGate(planCopy() as GatePlan, ctx);
  assertCauses(outcome, { own_meal_dish_missing: 1 });
  assertEquals(outcome.ok, true);
  // ⚠️ ET LA PHRASE DIT LAQUELLE DES DEUX POPULATIONS C'EST.
  const gap = outcome.refusals.find((r) => r.cause === "own_meal_dish_missing");
  assert(String(gap?.detail ?? "").includes("variante"), gap?.detail ?? "");
});

Deno.test("BÊTA 1A — la MÊME case, base non mangeable: là, le plan ne part pas", () => {
  // La contre-épreuve, et c'est la seule différence entre les deux décors.
  const ctx = {
    ...contextCopy(),
    dedicated: [{ ...CASE_DAHL, memberId: NORA, reason: "regime" as const, baseEdible: false }],
    policy: FINAL_GATE_POLICY_LOT_4,
  } as GateContext;
  const outcome = finalPlanGate(planCopy() as GatePlan, ctx);
  assertCauses(outcome, { dedicated_dish_missing: 1 });
  assertEquals(outcome.ok, false);
});

Deno.test("BÊTA 1A — un composant servi PAR BOÎTE remplit l'obligation", () => {
  // ⛔ LES DEUX CANAUX EXISTENT DANS LE PRODUIT. Le bloc de régime commande
  // « one box for the people that line binds … one box for everyone else with
  // the original »: une bouche qui reçoit, dans SON contenant, un composant
  // qu'aucun autre contenant de la case ne porte EST servie à part.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{
      day: "sun",
      slot: "breakfast",
      memberId: PAUL,
      reason: "regime",
      baseEdible: false,
    }];
    // ⚠️ LE DÉCOR EST POSÉ, PAS SUPPOSÉ. Les trois boîtes du petit-déjeuner de
    // la fixture puisent TOUTES `prep_oats_sun`: aucune ne porte de composant
    // propre. On en ajoute un à la boîte de PAUL — c'est exactement ce que le
    // bloc de régime commande, « one box for everyone else with the original ».
    const dish = plan.dishes.find((d) => d.slot === "breakfast");
    const box = dish?.boxes.find((b) =>
      b.member_ids.length === 1 && b.member_ids[0] === PAUL
    );
    box?.items.push({ preparation_id: null, term: "jambon", grams: 60 });
  });
  assertCauses(outcome, {});
});

Deno.test("BÊTA 1A — une boîte IDENTIQUE à celle des autres ne remplit rien", () => {
  // ⚠️ LA MOITIÉ QUI EMPÊCHE LA GARDE DE SE SATISFAIRE D'UN PARTAGE. Deux
  // contenants qui puisent la même casserole sont un partage, pas une variante.
  const outcome = gateWith((plan, ctx) => {
    ctx.dedicated = [{
      day: "sun",
      slot: "breakfast",
      memberId: PAUL,
      reason: "regime",
      baseEdible: false,
    }];
    const dish = plan.dishes.find((d) => d.slot === "breakfast");
    if (dish === undefined) return;
    // Toutes les boîtes ne citent plus que la même casserole, sous le même
    // terme: plus aucun composant n'est propre à quelqu'un.
    for (const box of dish.boxes) {
      box.items = [{ preparation_id: "prep_oats_sun", term: "avoine", grams: 300 }];
    }
  });
  assertCauses(outcome, { dedicated_dish_missing: 1 });
});

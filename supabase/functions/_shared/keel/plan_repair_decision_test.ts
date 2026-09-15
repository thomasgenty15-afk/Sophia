/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 ② — LA NATURE DU DÉFAUT, LES DEUX APPELS, ET LA VALIDATION ABSENTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LES TROIS DÉFAUTS QUE CES CAS FERMENT, TOUS MESURÉS SUR LES ARCHIVES DU
 * 2026-09-11 (`sorties-lot-F/campagne-tir{1,3,4}-c6-*.json`) :
 *
 *   ② la réparation ne recevait pas le plan (voir `plan_repair_context_test.ts`);
 *   ③ `energy_off` et `bounds_off` rendaient la MÊME cause, donc la même
 *      phrase, et la phrase parlait de calories: le tir n° 4 a demandé de
 *      corriger « sun/breakfast : 0 % contre 728 kcal visées » alors que le
 *      vrai défaut était la densité — et les calories étaient justes;
 *   ④ une candidate rejetée posait `c4Stop = true` et fermait la boucle: les
 *      tirs n° 1 et n° 3 ont fait UNE réparation, ont été refusés, et n'ont
 *      jamais épuisé leur budget.
 *
 * ⛔ CHAQUE GARDE A UN CAS QUI PASSE. Une garde éprouvée seulement sur ce
 * qu'elle refuse est indiscernable d'une garde cassée.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
  PAUL,
} from "./final_plan_gate_fixtures.ts";
import {
  FINAL_GATE_POLICY_LOT_4,
  finalGateDelivery,
  finalPlanGate,
} from "./final_plan_gate.ts";
import type { GateRefusal } from "./final_plan_gate.ts";
import {
  collectPlanDefects,
  planRepairRequest,
} from "./plan_defect_pass.ts";
import type {
  CellContractRow,
  PlanControlFindings,
} from "./plan_defect_pass.ts";
import {
  candidateStateOf,
  chooseReplacement,
  judgeCandidate,
  PLAN_REPAIR_MAX_CALLS,
  planRepairDecision,
  repairRoundOutcome,
} from "./plan_repair_loop.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";
import {
  planValidationNotRun,
  planValidationRan,
  planValidationRecord,
} from "./plan_validation.ts";
import type {
  CellNutritionRow,
  DayNutritionRow,
  ProteinFloorAllocation,
} from "./final_plan_audit.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOR — LES NOMBRES DU TIR 4, À L'IDENTIQUE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE NE SONT PAS DES NOMBRES RONDS INVENTÉS. Le message de réparation
// archivé du tir n° 4 dit, mot pour mot :
//     « sun/breakfast : 0 % contre 728 kcal visées »
//     « the breakfast plate weighs 631 g cooked, and a plate here must be at
//       most 630 g »
//     « sun/lunch : −3 % contre 1 165 kcal visées »
// Les deux cases ont des calories JUSTES et des bornes franchies.

const PLANCHER = (coveredFloorG: number | null): ProteinFloorAllocation => ({
  dayFloorG: 176,
  coveredFloorG,
  perMealFloorG: null,
  fixedProteinG: null,
  reason: coveredFloorG === null ? "no_body" : "applied_full_day",
});

function caseNut(o: Partial<CellNutritionRow> = {}): CellNutritionRow {
  return {
    memberId: PAUL,
    day: "sun",
    date: "2026-09-13",
    slot: "breakfast",
    targetKcal: 728,
    hasDish: true,
    hasPortion: true,
    servedKcal: 728,
    grams: 631,
    densityPer100G: 115,
    proteinG: 30,
    gap: null,
    deltaPct: 0,
    sharedWith: 1,
    portionExpected: true,
    state: "bounds_off",
    ...o,
  };
}

function jour(o: Partial<DayNutritionRow> = {}): DayNutritionRow {
  return {
    memberId: PAUL,
    date: "2026-09-13",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2454,
    servedKcal: 2463,
    deltaPct: 0.4,
    proteinG: 124,
    protein: PLANCHER(176),
    state: "conforme",
    ...o,
  };
}

function contrat(o: Partial<CellContractRow> = {}): CellContractRow {
  return {
    memberId: PAUL,
    day: "sun",
    slot: "breakfast",
    targetKcal: 728,
    gramsMin: 380,
    gramsMax: 630,
    densityMin: 116,
    densityMax: 250,
    ...o,
  };
}

function constats(o: Partial<PlanControlFindings> = {}): PlanControlFindings {
  return {
    refusals: [],
    outputContract: null,
    nutrition: null,
    roundedToZero: [],
    potsOverdrawn: 0,
    potsOverdrawnWorstPerMille: 0,
    outOfBounds: [],
    ...o,
  };
}

function defaut(o: Partial<RepairDefect> & { kind: RepairDefect["kind"] }): RepairDefect {
  return {
    // ⟳ 2026-09-12 · FERMETURE LOT 1 — L'ADRESSE STRUCTURÉE. Requise et
    // nullable: un défaut fabriqué à la main dit explicitement qu'il n'en porte
    // pas, au lieu de laisser le champ absent parler à sa place.
    cause: null,
    date: null,
    preparationId: null,
    // ⟳ 2026-09-13 · LOT 2 — `sessionIndex` est REQUIS et nullable.
    sessionIndex: null,
    source: "gate",
    day: null,
    slot: null,
    dish: null,
    memberId: null,
    detail: "",
    repairable: true,
    magnitude: null,
    measure: null,
    ...o,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA NATURE DU DÉFAUT — UNE DENSITÉ N'EST PAS UN ÉCART DE CALORIES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 2 ⑤ — calories JUSTES et bornes franchies: la garde rend `cell_bounds_off`", () => {
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: { cells: [caseNut()], days: [] },
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  // ⛔ LA MORSURE. Avant ce lot, la même ligne rendait `cell_energy_off` et le
  // texte disait « 0 % contre 728 kcal visées ».
  assertEquals(outcome.counters.refusals_by_cause.cell_bounds_off, 1);
  assertEquals(outcome.counters.refusals_by_cause.cell_energy_off, 0);
  const refus = outcome.refusals.find((r) => r.cause === "cell_bounds_off");
  assert(refus !== undefined);
  assert(!refus.detail.includes("%"), refus.detail);
  assert(refus.detail.includes("631 g cuits"), refus.detail);
  // ⚠️ ET ELLE NE BLOQUE PAS: la famille calorique reste en `count`.
  assertEquals(finalGateDelivery(outcome, []).blocking.length, 0);
  assertEquals(finalGateDelivery(outcome, []).state, "deliverable_with_gaps");
});

Deno.test("LOT 2 ⑤ bis — LE CAS QUI PASSE: une case conforme ne produit ni l'une ni l'autre", () => {
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: {
      cells: [caseNut({ state: "conforme", grams: 500, densityPer100G: 146 })],
      days: [],
    },
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  assertEquals(outcome.counters.refusals_by_cause.cell_bounds_off, 0);
  assertEquals(outcome.counters.refusals_by_cause.cell_energy_off, 0);
  // ⛔ ET LE DÉNOMINATEUR A BOUGÉ: la case a bien été regardée.
  assertEquals(outcome.counters.checked.measured_cells, 1);
});

Deno.test("LOT 2 ⑥ — la consigne ne demande AUCUNE correction calorique sur une densité", () => {
  const refusals: GateRefusal[] = [{
    cause: "cell_bounds_off",
    severity: "count",
    day: "sun",
    slot: "breakfast",
    dish: null,
    preparation_id: null,
    member_id: PAUL,
    term: null,
    detail: "2026-09-13 breakfast : calories dans la tolérance, mais hors bornes",
  }];
  const passe = collectPlanDefects(constats({
    refusals,
    nutrition: { cells: [caseNut()], days: [jour()] },
    contracts: [contrat()],
  }));
  const texte = planRepairRequest({ defects: passe.defects, days: [], index: null });
  assert(texte !== null);
  // ⛔ LA MORSURE. Le tir n° 4 disait « 0 % contre 728 kcal visées ».
  assert(!texte.includes("0 %"), texte);
  assert(!texte.includes("728 kcal"), texte);
  assert(texte.includes("its calories are already right"), texte);
  // ⛔ ET LA VRAIE MESURE EST LÀ, AVEC SA BORNE.
  assert(texte.includes("631 g cooked"), texte);
  assert(texte.includes("380 to 630 g"), texte);
  assert(texte.includes("115 kcal/100 g"), texte);
  // ⚠️ ET LA MESURE VOYAGE DANS LE TYPE, pas seulement dans la phrase.
  const d = passe.defects.find((x) => x.measure?.of === "mass");
  assert(d !== undefined, JSON.stringify(passe.defects));
  assertEquals(d.measure, { of: "mass", grams: 631, minG: 380, maxG: 630 });
  assertEquals(d.magnitude, 1, "631 pour 630");
  assertEquals(passe.measured.unnumbered, 0);
  assertEquals(passe.measured.contracts, 1);
});

Deno.test("LOT 2 ⑥ bis — SANS contrat, on ne devine pas: la passe le COMPTE", () => {
  // ⛔ UN LOT DÉSARMÉ RESSEMBLE À UN LOT QUI MARCHE. Sans `contracts`, la même
  // entrée rend la même liste de défauts — avec une phrase vague. Les deux
  // compteurs sont ce qui rend la différence lisible.
  const refusals: GateRefusal[] = [{
    cause: "cell_bounds_off",
    severity: "count",
    day: "sun",
    slot: "breakfast",
    dish: null,
    preparation_id: null,
    member_id: PAUL,
    term: null,
    detail: "2026-09-13 breakfast : hors bornes",
  }];
  const passe = collectPlanDefects(constats({
    refusals,
    nutrition: { cells: [caseNut()], days: [jour()] },
  }));
  assertEquals(passe.defects.length, 1);
  assertEquals(passe.measured.contracts, 0);
  assertEquals(passe.measured.unnumbered, 1);
  assertEquals(passe.defects[0].measure, null);
  assertEquals(passe.defects[0].magnitude, null);
});

Deno.test("LOT 2 ⑥ ter — une densité SOUS son plancher se dit en kcal/100 g", () => {
  // Le déjeuner du tir n° 4: −3 % de calories (dans la tolérance) et une
  // densité sous son couloir. C'est l'écart que la consigne archivée n'exposait
  // « pas numériquement ».
  const refusals: GateRefusal[] = [{
    cause: "cell_bounds_off",
    severity: "count",
    day: "sun",
    slot: "lunch",
    dish: null,
    preparation_id: null,
    member_id: PAUL,
    term: null,
    detail: "hors couloir",
  }];
  const passe = collectPlanDefects(constats({
    refusals,
    nutrition: {
      cells: [
        caseNut({
          slot: "lunch",
          targetKcal: 1165,
          servedKcal: 1130,
          deltaPct: -3,
          grams: 600,
          densityPer100G: 188,
        }),
      ],
      days: [jour()],
    },
    contracts: [contrat({
      slot: "lunch",
      targetKcal: 1165,
      gramsMin: 380,
      gramsMax: 900,
      densityMin: 200,
      densityMax: 250,
    })],
  }));
  assertEquals(passe.defects[0].measure, {
    of: "density",
    per100G: 188,
    minPer100G: 200,
    maxPer100G: 250,
  });
  assertEquals(passe.defects[0].magnitude, 12);
  assert(passe.defects[0].detail.includes("188 kcal per 100 g"), passe.defects[0].detail);
  assert(passe.defects[0].detail.includes("200 to 250"), passe.defects[0].detail);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② DEUX APPELS RÉELS — ET LE SECOND APRÈS UN REJET
// ═══════════════════════════════════════════════════════════════════════════

const UN_DEFAUT = [defaut({ kind: "sizing", day: "sun", slot: "breakfast" })];
// ⟳ 2026-09-15 — LES ÉPREUVES CI-DESSOUS TESTENT LA MÉCANIQUE (budget, rejet,
// tours) et supposent que leur défaut BLOQUE : elles le disent en passant
// `blocking` / `remainingBlocking`. La politique « pas d'appel sans défaut
// bloquant » a ses propres épreuves dans `plan_repair_blocking_test.ts`.

Deno.test("LOT 2 ⑦ — une candidate REJETÉE ne ferme plus la boucle", () => {
  // ⛔ LA MORSURE. `index.ts:17277` posait `c4Stop = true` ici, et `!c4Stop`
  // interdisait tout nouvel appel. Les tirs n° 1 et n° 3 se sont arrêtés là.
  const suite = repairRoundOutcome({
    verdict: "no_improvement",
    remainingDefects: UN_DEFAUT,
    remainingBlocking: UN_DEFAUT.length,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 120_000,
  });
  assertEquals(suite.keep, "previous_best", "la meilleure version revient");
  assertEquals(suite.mayRetry, true, "⛔ et on réévalue une seconde tentative");
  assertEquals(suite.reason, "");
});

Deno.test("LOT 2 ⑦ bis — première candidate rejetée, seconde adoptée: deux appels, un plan", () => {
  const trace: string[] = [];
  let callsMade = 0;
  let attemptsUsed = 0;
  // ── TOUR 1 ────────────────────────────────────────────────────────────────
  const tour1 = planRepairDecision({
    defects: UN_DEFAUT,
    blocking: UN_DEFAUT.length,
    callsMade,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed,
    maxAttempts: 2,
    remainingMs: 200_000,
    lastVerdict: null,
  });
  assertEquals(tour1.call, true);
  if (tour1.call) assertEquals(tour1.afterVerdict, null);
  callsMade++;
  attemptsUsed++;
  trace.push("call_1");
  // La candidate revient PIRE: elle est rejetée.
  const apres1 = repairRoundOutcome({
    verdict: "no_improvement",
    remainingDefects: UN_DEFAUT,
    remainingBlocking: UN_DEFAUT.length,
    callsMade,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed,
    maxAttempts: 2,
    remainingMs: 150_000,
  });
  assertEquals(apres1.keep, "previous_best");
  assertEquals(apres1.mayRetry, true);
  // ── TOUR 2 ────────────────────────────────────────────────────────────────
  const tour2 = planRepairDecision({
    defects: UN_DEFAUT,
    blocking: UN_DEFAUT.length,
    callsMade,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed,
    maxAttempts: 2,
    remainingMs: 150_000,
    lastVerdict: "no_improvement",
  });
  assertEquals(tour2.call, true);
  // ⛔ LE SECOND ESSAI DIT POURQUOI LE PREMIER A ÉTÉ JETÉ. Sans ça il
  // redemande la même chose et reçoit la même réponse.
  if (tour2.call) assertEquals(tour2.afterVerdict, "no_improvement");
  callsMade++;
  attemptsUsed++;
  trace.push("call_2");
  const apres2 = repairRoundOutcome({
    verdict: "adopt",
    remainingDefects: [],
    remainingBlocking: 0,
    callsMade,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed,
    maxAttempts: 2,
    remainingMs: 90_000,
  });
  assertEquals(apres2.keep, "candidate");
  assertEquals(apres2.mayRetry, false);
  assertEquals(apres2.reason, "no_defects");
  assertEquals(trace, ["call_1", "call_2"]);
  assertEquals(callsMade, 2);
});

Deno.test("LOT 2 ⑧ — DEUX ÉCHECS: on s'arrête sur `calls_exhausted`, pas plus tôt", () => {
  const apres2 = repairRoundOutcome({
    verdict: "safety_regression",
    remainingDefects: UN_DEFAUT,
    remainingBlocking: UN_DEFAUT.length,
    callsMade: 2,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 2,
    maxAttempts: 2,
    remainingMs: 200_000,
  });
  assertEquals(apres2.keep, "previous_best");
  assertEquals(apres2.mayRetry, false);
  // ⛔ LE MOTIF EST LE PLAFOND D'APPELS, PAS LE BUDGET. Les confondre ferait
  // chercher un budget trop petit là où c'est le plafond dur qui a mordu.
  assertEquals(apres2.reason, "calls_exhausted");
});

Deno.test("LOT 2 ⑧ bis — un appel PARTI et JETÉ compte quand même", () => {
  // ⛔ « Le budget compte des tentatives; un appel rejeté consomme bien une
  // tentative » (revue § 4). Deux appels lancés, aucun adopté: on s'arrête.
  const d = planRepairDecision({
    defects: UN_DEFAUT,
    blocking: UN_DEFAUT.length,
    callsMade: 2,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 0,
    maxAttempts: 9,
    remainingMs: 300_000,
    lastVerdict: "safety_regression",
  });
  assertEquals(d.call, false);
  if (!d.call) assertEquals(d.reason, "calls_exhausted");
});

Deno.test("LOT 2 ⑧ ter — le temps restant décide aussi, et il se nomme", () => {
  const d = planRepairDecision({
    defects: UN_DEFAUT,
    blocking: UN_DEFAUT.length,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 5_000,
    lastVerdict: "no_improvement",
  });
  assertEquals(d.call, false);
  if (!d.call) assertEquals(d.reason, "no_time_left");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA SÉCURITÉ — L'ALLERGÈNE INITIAL, ET CELUI QUE LA RÉPARATION INTRODUIT
// ═══════════════════════════════════════════════════════════════════════════

const morsure = (o: Partial<GateRefusal> = {}): GateRefusal => ({
  cause: "member_exclusion_served",
  severity: "refuse",
  day: "sat",
  slot: "lunch",
  dish: "Pita au thon",
  preparation_id: null,
  member_id: PAUL,
  term: "arachide",
  detail: "arachide servie à une bouche qui ne doit pas en manger",
  ...o,
});

Deno.test("LOT 2 ⑨ — un allergène PRÉSENT au premier jet est un défaut réparable, localisé", () => {
  const passe = collectPlanDefects(constats({ refusals: [morsure()] }));
  assertEquals(passe.defects.length, 1);
  assertEquals(passe.defects[0].kind, "safety");
  assertEquals(passe.defects[0].repairable, true);
  assertEquals(passe.defects[0].day, "sat");
  assertEquals(passe.defects[0].slot, "lunch");
  // ⛔ ET IL EST DIT EN PREMIER. « Une instruction qui commence par "ajoute des
  // lentilles" avant de dire "ce plat contient l'allergène de quelqu'un" fait
  // lire le second comme un détail. »
  const texte = planRepairRequest({ defects: passe.defects, days: [], index: null });
  assert(texte !== null);
  assert(texte.startsWith("⛔ SOMEONE IS SERVED WHAT THEY MUST NOT EAT:"), texte);
});

Deno.test("LOT 2 ⑨ bis — un allergène INTRODUIT par la réparation rejette la candidate", () => {
  // ⛔ PAR IDENTITÉ, JAMAIS PAR COMPTE. La candidate retire l'arachide de Paul
  // et met du gluten dans l'assiette de Claire: UNE morsure pour UNE morsure.
  const verdict = judgeCandidate({
    beforeRefusals: [morsure()],
    afterRefusals: [
      morsure({ member_id: "m-claire", term: "gluten", day: "sun", slot: "dinner" }),
    ],
    beforeDefects: [defaut({ kind: "safety", day: "sat", slot: "lunch" })],
    afterDefects: [defaut({ kind: "safety", day: "sun", slot: "dinner" })],
  });
  assertEquals(verdict.verdict, "safety_regression");
  assertEquals(verdict.safety.added.length, 1);
  assertEquals(verdict.safety.removed.length, 1);
  // ⚠️ ET LE TOUR SUIVANT RESTE POSSIBLE: on restaure, on ne ferme pas.
  const suite = repairRoundOutcome({
    verdict: verdict.verdict,
    remainingDefects: [defaut({ kind: "safety", day: "sun", slot: "dinner" })],
    remainingBlocking: 1,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 120_000,
  });
  assertEquals(suite.keep, "previous_best");
  assertEquals(suite.mayRetry, true);
});

Deno.test("LOT 2 ⑩ — une amélioration qui DÉGRADE l'autre bouche est rejetée", () => {
  // ⛔ « Refuser toute dégradation d'une portion auparavant conforme. » La
  // candidate ferme le défaut de Paul et en ouvre un chez Claire: le compte ne
  // baisse pas, et la nature ne s'améliore pas.
  const avant = [
    defaut({
      kind: "sizing",
      day: "sun",
      slot: "dinner",
      memberId: PAUL,
      magnitude: 60,
    }),
  ];
  const apres = [
    defaut({
      kind: "sizing",
      day: "sun",
      slot: "dinner",
      memberId: "m-claire",
      magnitude: 80,
    }),
  ];
  const verdict = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(verdict.verdict, "no_improvement");
  // ⛔ ET LA RAISON EST DITE: les deux listes ne se comparent pas case à case.
  assertEquals(verdict.magnitude.comparable, false);
  assertEquals(verdict.magnitude.note, "cells_differ");
});

Deno.test("LOT 2 ⑩ bis — LE CAS QUI PASSE: la MÊME bouche, moins loin, est adoptée", () => {
  // ⛔ CE QUE LE LOT E A MESURÉ: une réparation qui ferme les trois quarts de
  // l'écart sans fermer un seul défaut partait à la poubelle.
  const verdict = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 60 }),
    ],
    afterDefects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 15 }),
    ],
  });
  assertEquals(verdict.verdict, "adopt");
  assertEquals(verdict.magnitude.gain, 45);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA VALIDATION QUI N'A PAS TOURNÉ N'EST PAS UN PLAN SANS ÉCART
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 2 ⑪ — exception de validation: on n'active PAS, et l'ancien plan reste", () => {
  // ⛔ REVUE § 7: « une exception de la garde finale laisse continuer la
  // livraison avec `validation: null` ». Un plan dont on ne sait rien n'est pas
  // un plan « livrable avec des écarts ».
  assertEquals(candidateStateOf(null), "validation_unavailable");
  assertEquals(
    chooseReplacement({
      candidate: candidateStateOf(null),
      previousIsUsable: true,
    }),
    "keep_previous",
  );
  // ⚠️ ET SANS PLAN PRÉCÉDENT, C'EST UN ÉCHEC EXPLICITE — jamais une écriture.
  assertEquals(
    chooseReplacement({
      candidate: candidateStateOf(null),
      previousIsUsable: false,
    }),
    "fail_explicit",
  );
  // ⛔ LE TYPE PORTE LA DIFFÉRENCE, pas seulement un message.
  const absente = planValidationNotRun("final gate threw");
  assertEquals(absente.ran, false);
  if (!absente.ran) assertEquals(absente.reason, "final gate threw");
  assertEquals(planValidationNotRun("  ").ran, false);
  if (!planValidationNotRun("  ").ran) {
    assertEquals(
      (planValidationNotRun("  ") as { ran: false; reason: string }).reason,
      "unknown",
    );
  }
});

Deno.test("LOT 2 ⑪ bis — LE CAS QUI PASSE: une validation qui a tourné avec des écarts ÉCRIT", () => {
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: { cells: [caseNut()], days: [] },
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const delivery = finalGateDelivery(outcome, []);
  assertEquals(candidateStateOf(delivery), "deliverable_with_gaps");
  assertEquals(
    chooseReplacement({
      candidate: candidateStateOf(delivery),
      previousIsUsable: true,
    }),
    "replace",
  );
  const record = planValidationRan(planValidationRecord({ outcome, delivery }));
  assertEquals(record.ran, true);
  if (record.ran) assertEquals(record.record.state, "livrable_avec_ecarts");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.3 — LES CAS DÉTERMINISTES ② ET ③
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES CAS AJOUTENT À CEUX D'AU-DESSUS. Le § ⑩ éprouve un défaut qui
// SE DÉPLACE d'une bouche à l'autre (une case avant, une autre après) ; le
// § ⑨ bis éprouve une morsure ÉCHANGÉE contre une autre. Aucun des deux
// n'éprouve la phrase du plan : « améliore A, et DÉGRADE une portion de B
// auparavant conforme ». Là, B n'avait rien — ni défaut, ni morsure — et la
// candidate lui en donne un pendant qu'elle répare A. Les deux axes sont
// séparés ci-dessous parce qu'ils sortent par deux branches différentes de
// `judgeCandidate`, et la seconde est celle qui pourrait être contournée par
// un gain d'ampleur.

Deno.test("§ 2.3 ② — A s'améliore, B tombe: une portion AUPARAVANT CONFORME rejette TOUT", () => {
  const avant = [
    defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 60 }),
  ];
  // Paul passe de 60 à 10. Claire, qui n'avait AUCUN défaut, sort à 30: l'écart
  // total du plan baisse (60 → 40) et ça ne rachète rien.
  const apres = [
    defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 10 }),
    defaut({
      kind: "sizing",
      day: "sun",
      slot: "dinner",
      memberId: "m-claire",
      magnitude: 30,
    }),
  ];
  const verdict = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(verdict.verdict, "no_improvement");
  // ⛔ ET LA RAISON EST DITE. Un défaut de plus, c'est un plan dont les cases ne
  // se comparent plus — on ne somme pas l'écart de Paul et celui de Claire pour
  // en tirer un « progrès ».
  assertEquals(verdict.magnitude.comparable, false);
  assertEquals(verdict.magnitude.note, "count_differs");
  // ⛔ LE REJET EST ENTIER: la moitié bonne du patch ne se garde pas, et c'est
  // la meilleure version qui repart.
  const suite = repairRoundOutcome({
    verdict: verdict.verdict,
    remainingDefects: avant,
    remainingBlocking: avant.length,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 120_000,
  });
  assertEquals(suite.keep, "previous_best");
  assertEquals(suite.mayRetry, true);
});

Deno.test("§ 2.3 ② bis — B passe de CONFORME à dangereuse: la sécurité mord AVANT l'ampleur", () => {
  // ⛔ LE CAS QUI POURRAIT CONTOURNER. L'ampleur chez Paul baisse de 92 %, donc
  // le seuil de gain est franchi et la branche d'ampleur adopterait. La garde de
  // sécurité passe avant, et elle n'a rien à compenser: Claire n'avait AUCUNE
  // morsure avant, elle en a une après.
  const verdict = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [
      morsure({ member_id: "m-claire", term: "gluten", day: "sun", slot: "dinner" }),
    ],
    beforeDefects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 60 }),
    ],
    afterDefects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 5 }),
    ],
  });
  assertEquals(verdict.verdict, "safety_regression");
  assertEquals(verdict.safety.added.length, 1);
  // ⛔ RIEN N'A ÉTÉ RÉPARÉ CÔTÉ SÉCURITÉ: ce n'est pas un échange de morsures,
  // c'est une morsure ajoutée sur une bouche qui n'en avait pas.
  assertEquals(verdict.safety.removed.length, 0);
  // ⛔ ET LA PREUVE QUE L'AMPLEUR AURAIT ADOPTÉ: elle est comparable, et son
  // gain est écrit quand même. Une garde qui s'abstient de mesurer se lit comme
  // une garde qui n'a rien vu.
  assertEquals(verdict.magnitude.comparable, true);
  assertEquals(verdict.magnitude.gain, 55);
});

Deno.test("§ 2.3 ② ter — LE CAS QUI PASSE: A réparé, B intact, la candidate est adoptée", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE REFUSE EST INDISCERNABLE
  // D'UNE GARDE CASSÉE.
  const verdict = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: PAUL, magnitude: 60 }),
    ],
    afterDefects: [],
  });
  assertEquals(verdict.verdict, "adopt");
  assertEquals(verdict.safety.added.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// § 2.3 ③ — LE PLAFOND EST CELUI DE LA DEMANDE DU FOYER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE POINT QUI EST FACILE À RATER, ET QU'UN CAS À UNE PERSONNE NE PROUVE
// PAS: « deux appels » doit rester deux pour un foyer de quatre bouches sur
// trois jours, avec des défauts de session en plus. Un plafond qui se
// multiplierait par bouche ferait huit appels là où le contrat en annonce deux.

const BOUCHES = ["m-paul", "m-claire", "m-zoe", "m-leo"] as const;
const JOURS = ["fri", "sat", "sun"] as const;
const CRENEAUX = ["breakfast", "lunch", "dinner"] as const;

/** 36 défauts de case + 3 défauts de session = 39, répartis sur tout le foyer. */
function defautsDuFoyer(): RepairDefect[] {
  const out: RepairDefect[] = [];
  for (const m of BOUCHES) {
    for (const j of JOURS) {
      for (const c of CRENEAUX) {
        out.push(defaut({ kind: "sizing", day: j, slot: c, memberId: m, magnitude: 20 }));
      }
    }
  }
  // ⛔ ET DES DÉFAUTS QUI N'APPARTIENNENT À PERSONNE. Une session est un objet
  // du foyer: si le plafond se comptait « par propriétaire », ceux-là seraient
  // le cas qui n'a pas de compteur.
  for (const [i, j] of JOURS.entries()) {
    out.push(defaut({
      kind: "missing_meal",
      day: j,
      slot: null,
      memberId: null,
      sessionIndex: i,
    }));
  }
  return out;
}

Deno.test("§ 2.3 ③ — 39 défauts sur 4 bouches: UNE instruction, et le plafond reste DEUX", () => {
  const defauts = defautsDuFoyer();
  assertEquals(defauts.length, 39);
  assertEquals(new Set(defauts.map((d) => d.memberId)).size, 5, "4 bouches + la maison");

  const tour1 = planRepairDecision({
    defects: defauts,
    blocking: defauts.length,
    callsMade: 0,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 200_000,
    lastVerdict: null,
  });
  assertEquals(tour1.call, true);
  // ⛔ TOUS LES DÉFAUTS PARTENT DANS LE MÊME APPEL. Un appel par bouche ferait
  // quatre fois le travail et quatre fois la facture.
  if (tour1.call) assertEquals(tour1.defects.length, 39);

  const tour2 = planRepairDecision({
    defects: defauts,
    blocking: defauts.length,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 200_000,
    lastVerdict: "no_improvement",
  });
  assertEquals(tour2.call, true);

  // ⛔ ET LE TROISIÈME N'EXISTE POUR PERSONNE. On rejoue le refus avec des
  // restes de toutes les tailles — une seule case, une bouche entière, le foyer
  // complet: le motif ne change pas, et il ne dépend d'aucune population.
  for (const reste of [1, 9, 36, 39]) {
    const apres = planRepairDecision({
      defects: defauts.slice(0, reste),
      blocking: reste,
      callsMade: 2,
      maxCalls: PLAN_REPAIR_MAX_CALLS,
      attemptsUsed: 0,
      maxAttempts: 9,
      remainingMs: 300_000,
      lastVerdict: "no_improvement",
    });
    assertEquals(apres.call, false, `${reste} défauts restants ont rouvert un appel`);
    if (!apres.call) assertEquals(apres.reason, "calls_exhausted");
  }
});

Deno.test("§ 2.3 ③ bis — un foyer de 4 et une personne seule ont le MÊME plafond", () => {
  // ⛔ LA MESURE QUI LE PROUVE: on fait tourner la décision à chaque valeur de
  // `callsMade`, pour un foyer de 4 et pour une bouche, et on compare les deux
  // suites de réponses. Un plafond « par personne » les ferait diverger au
  // deuxième appel.
  const foyer = defautsDuFoyer();
  const seul = foyer.filter((d) => d.memberId === "m-paul");
  assertEquals(seul.length, 9);
  const suite = (defects: readonly RepairDefect[]) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((callsMade) => {
      const d = planRepairDecision({
        defects,
        blocking: defects.length,
        callsMade,
        maxCalls: PLAN_REPAIR_MAX_CALLS,
        attemptsUsed: 0,
        maxAttempts: 9,
        remainingMs: 300_000,
        lastVerdict: null,
      });
      return d.call ? "call" : d.reason;
    });
  assertEquals(suite(foyer), suite(seul));
  assertEquals(suite(seul), [
    "call",
    "call",
    "calls_exhausted",
    "calls_exhausted",
    "calls_exhausted",
    "calls_exhausted",
    "calls_exhausted",
    "calls_exhausted",
  ]);
});

Deno.test("§ 2.3 ③ ter — un appel JETÉ compte comme un appel réussi, quelle qu'en soit la cause", () => {
  // ⛔ « Le budget compte des tentatives; un appel rejeté consomme bien une
  // tentative. » Les trois sorties d'un tour — adoptée, rejetée pour régression,
  // rejetée faute d'amélioration — laissent le MÊME nombre d'appels derrière
  // elles. C'est ce qui empêche une boucle qui rejette indéfiniment.
  for (const verdict of ["adopt", "safety_regression", "no_improvement"] as const) {
    const suite = repairRoundOutcome({
      verdict,
      remainingDefects: defautsDuFoyer(),
      remainingBlocking: defautsDuFoyer().length,
      callsMade: 2,
      maxCalls: PLAN_REPAIR_MAX_CALLS,
      attemptsUsed: 0,
      maxAttempts: 9,
      remainingMs: 300_000,
    });
    assertEquals(suite.mayRetry, false, `\`${verdict}\` a rouvert un appel`);
    assertEquals(suite.reason, "calls_exhausted");
  }
});

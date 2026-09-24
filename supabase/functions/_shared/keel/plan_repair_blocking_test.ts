/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-15 · DÉCISION PRODUIT — PAS D'APPEL DE RÉPARATION SANS DÉFAUT BLOQUANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE CHIFFRE QUI A DÉCIDÉ. Campagne du 2026-09-15, huit tirs : les deux seuls
 * tirs réparés l'ont été sur des écarts COMPTÉS — un −5 % de protéines sur une
 * journée couverte à 35 % (tir 9), une densité de petit-déjeuner (tir 2). Quatre
 * appels payés, une centaine de secondes chacun, zéro écart fermé, et les deux
 * plans sont partis « livrables avec écarts » exactement comme ils l'auraient
 * fait sans réparation. La garde avait vu juste deux fois ; la réparation ne
 * rendait rien.
 *
 * La règle : un appel modèle de réparation ne part que si au moins un défaut,
 * laissé tel quel, EMPÊCHERAIT le plan de partir — c'est-à-dire une cause de la
 * garde finale en sévérité `refuse` dans ce run. Un écart compté part nommé à
 * l'écran, ce que la garde fait déjà.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { FINAL_GATE_POLICY_LOT_4 } from "./final_plan_gate.ts";
import type { FinalGateCause, GateRefusal, GateSeverity } from "./final_plan_gate.ts";
import { collectPlanDefects } from "./plan_defect_pass.ts";
import {
  PLAN_REPAIR_MAX_CALLS,
  planRepairDecision,
  REPAIR_DECISION_REFUSALS,
  REPAIR_PASS_REFUSALS,
  repairRoundOutcome,
} from "./plan_repair_loop.ts";
import { sourceFamily } from "./source_family.ts";

// ⛔ LA SÉVÉRITÉ VIENT DE LA POLITIQUE LIVRÉE, JAMAIS D'UNE VALEUR POSÉE À LA
// MAIN : si un jour `protein_floor_short` passe en `refuse`, ces épreuves
// changent de sens, et c'est voulu — elles diront alors qu'on répare.
function refus(cause: FinalGateCause, over: Partial<GateRefusal> = {}): GateRefusal {
  return {
    cause,
    severity: FINAL_GATE_POLICY_LOT_4[cause],
    day: "2026-09-15",
    slot: "dinner",
    dish: null,
    preparation_id: null,
    member_id: "paul",
    term: null,
    detail: `${cause} (épreuve)`,
    ...over,
  };
}

function passe(refusals: readonly GateRefusal[]) {
  return collectPlanDefects({
    refusals,
    outputContract: null,
    nutrition: null,
    roundedToZero: [],
    potsOverdrawn: 0,
    potsOverdrawnWorstPerMille: 0,
    outOfBounds: [],
    contracts: [],
    upstream: [],
  });
}

function decide(mustRepair: number, defects: ReturnType<typeof passe>["defects"]) {
  return planRepairDecision({
    defects,
    mustRepair,
    callsMade: 0,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
    lastVerdict: null,
  });
}

Deno.test("la prémisse est réelle : les deux écarts des tirs réparés sont COMPTÉS, pas refusés", () => {
  assertEquals(FINAL_GATE_POLICY_LOT_4.protein_floor_short, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_4.cell_bounds_off, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_4.mouth_energy_short, "count");
  // ⟳ 2026-09-19 — ELLE AUSSI EST COMPTÉE DÉSORMAIS. Voir le pavé de
  // `FINAL_GATE_POLICY_LOT_4` : la complétude se répare puis se livre nommée.
  // La différence avec les trois du dessus est qu'elle reste CHASSÉE — c'est
  // l'épreuve « une case sans plat, COMPTÉE, fait quand même partir un appel ».
  assertEquals(FINAL_GATE_POLICY_LOT_4.cell_without_portion, "count");
  assertEquals(FINAL_GATE_POLICY_LOT_4.cell_without_dish, "count");
});

Deno.test("tir 9 rejoué : un plancher protéique manqué, seul, ne fait partir AUCUN appel", () => {
  const p = passe([refus("protein_floor_short")]);
  assert(p.defects.length >= 1, "le défaut existe bien — c'est la décision qui change, pas la mesure");
  assertEquals(p.blocking.length, 0);
  const d = decide(p.mustRepair.length, p.defects);
  assertEquals(d.call, false);
  if (!d.call) assertEquals(d.reason, "no_blocking_defect");
});

Deno.test("tir 2 rejoué : une case hors bornes, seule, ne fait partir AUCUN appel", () => {
  const p = passe([refus("cell_bounds_off", { slot: "breakfast" })]);
  assert(p.defects.length >= 1);
  assertEquals(p.blocking.length, 0);
  const d = decide(p.mustRepair.length, p.defects);
  assertEquals(d.call, false);
  if (!d.call) assertEquals(d.reason, "no_blocking_defect");
});

Deno.test("un défaut BLOQUANT fait partir l'appel — et la consigne emporte AUSSI les écarts comptés", () => {
  // On paie l'appel pour l'exclusion servie ; tant qu'on paie, on demande tout.
  // ⟳ 2026-09-19 — l'exemple était `cell_without_portion`, qui ne bloque plus.
  const p = passe([refus("table_exclusion_served"), refus("protein_floor_short")]);
  assertEquals(p.blocking.map((d) => d.cause), ["table_exclusion_served"]);
  const d = decide(p.mustRepair.length, p.defects);
  assertEquals(d.call, true);
  if (d.call) {
    const causes = d.defects.map((x) => x.cause);
    assert(causes.includes("table_exclusion_served"));
    assert(causes.includes("protein_floor_short"), "l'écart compté voyage avec l'appel payé");
  }
});

Deno.test("⟳ 2026-09-19 — une case sans plat, COMPTÉE, fait quand même partir un appel", () => {
  // ⛔ C'EST LA MOITIÉ QUI REND LA BASCULE SÛRE. Passer la complétude en
  // `count` sans la chasser aurait ÉTEINT la réparation des trous : un premier
  // jet à 12 cases sur 18 serait parti tel quel à l'écran. Mesuré avant la
  // bascule sur le foyer `fagenty` : 3 plans livrés sur 5, les deux refus de
  // cette famille — et chacun réparé en partie par les appels qu'on aurait
  // supprimés.
  for (const cause of ["cell_without_dish", "mouth_unfed", "cell_without_portion", "cell_two_table_dishes"] as const) {
    const p = passe([refus(cause, { slot: "dinner" })]);
    assertEquals(p.blocking.length, 0, `${cause} ne bloque plus la livraison`);
    assertEquals(p.mustRepair.map((d) => d.cause), [cause], `${cause} vaut un appel`);
    assertEquals(decide(p.mustRepair.length, p.defects).call, true, `${cause} : l'appel part`);
  }
  // ── LE CAS QUI NE PART PAS : un écart compté HORS de la liste chassée ────
  const q = passe([refus("own_meal_dish_missing")]);
  assertEquals(q.blocking.length, 0);
  assertEquals(q.mustRepair.length, 0, "une préférence comptée ne vaut toujours pas un appel");
  assertEquals(decide(q.mustRepair.length, q.defects).call, false);
});

Deno.test("⛔ LA SÉVÉRITÉ EST CELLE DU RUN : la même cause, passée en `count`, ne bloque plus", () => {
  // Si `collectPlanDefects` relisait une table au lieu du refus, cette épreuve
  // rendrait « bloquant » — et un déploiement progressif de la garde (count →
  // refuse) n'aurait plus aucun effet sur la réparation.
  const p = passe([refus("cell_without_portion", { severity: "count" as GateSeverity })]);
  assertEquals(p.blocking.length, 0);
  // ⟳ 2026-09-19 — mais elle reste CHASSÉE, quelle que soit sa sévérité :
  // `mustRepair` lit la liste fermée, `blocking` lit le run.
  assertEquals(p.mustRepair.length, 1);
});

Deno.test("après un rejet, la suite applique la MÊME politique", () => {
  const p = passe([refus("protein_floor_short")]);
  const suite = repairRoundOutcome({
    verdict: "no_improvement",
    remainingDefects: p.defects,
    remainingMustRepair: p.mustRepair.length,
    callsMade: 1,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 200_000,
  });
  assertEquals(suite.keep, "previous_best");
  assertEquals(suite.mayRetry, false);
  assertEquals(suite.reason, "no_blocking_defect");
});

Deno.test("la politique passe AVANT les ressources : du budget ne fait pas partir un appel inutile", () => {
  const p = passe([refus("protein_floor_short")]);
  const d = planRepairDecision({
    defects: p.defects,
    mustRepair: 0,
    callsMade: 0,
    maxCalls: 2,
    attemptsUsed: 0,
    maxAttempts: 9,
    remainingMs: 380_000,
    lastVerdict: null,
  });
  assertEquals(d.call, false);
  if (!d.call) assertEquals(d.reason, "no_blocking_defect");
});

Deno.test("le motif est dans le vocabulaire de la DÉCISION, pas dans celui de la passe", () => {
  assert((REPAIR_DECISION_REFUSALS as readonly string[]).includes("no_blocking_defect"));
  // ⚠️ `REPAIR_PASS_REFUSALS` est épinglé fermé dans `constant_pins_test.ts` : on
  // n'y touche pas, le motif appartient à la décision.
  assertEquals((REPAIR_PASS_REFUSALS as readonly string[]).includes("no_blocking_defect"), false);
});

Deno.test("⛔ LE CÂBLAGE : le handler passe le compte À RÉPARER aux deux décisions, et note le refus", async () => {
  const src = await sourceFamily(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // ⟳ 2026-09-19 — `mustRepair`, plus `blocking` : bloquants ∪ chassés.
  // ⟳ 2026-09-24 — plus, en modification seulement, ce que la case refaite
  // doit encore (`c4EditMust`, vide hors modification).
  assert(src.includes("mustRepair: c4Pass.mustRepair.length + c4EditMust.length,"), "la décision ne reçoit plus le compte à réparer");
  assert(!src.includes("blocking: c4Pass.blocking.length,\n      // ⛔ LES APPELS"), "la décision relit le compte bloquant seul");
  assertEquals(
    (src.match(/remainingMustRepair: \(c4BestMustRepair \?\? \[\]\)\.length,/g) ?? []).length,
    2,
    "les DEUX réévaluations après rejet doivent porter le compte à réparer",
  );
  assert(src.includes("c4BestMustRepair = c4Pass.mustRepair;"), "la meilleure version ne retient plus ce qui vaut un appel");
  // ⟳ 2026-09-24 — `c4BestBlocking` est RETIRÉE : écrite, jamais lue. Ce que
  // la meilleure version doit retenir pour décider d'un appel, c'est
  // `c4BestMustRepair` (épinglé juste au-dessus, et lu par les deux
  // réévaluations). Une seconde liste retenue sans lecteur ne revient pas.
  assert(!src.includes("c4BestBlocking"), "la meilleure version retient de nouveau une liste que personne ne lit");
  assert(
    src.includes("c4Note(`plan_repair_skipped:no_blocking_defect:${c4Pass.defects.length}`);"),
    "le refus de politique n'est plus noté — la campagne ne pourra pas le compter",
  );
});

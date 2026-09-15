/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-15 · BÊTA — LE REFUS DE MASSE EST UN CONSTAT BLOQUANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tirs 6 et 13 de la campagne des 30: le journal disait
 * `plan_repair_skipped:no_blocking_defect:0`, et la ligne suivante rendait le
 * plan entier en 422 `preparation_quantity_unreconciled`. Le constat existait
 * (`defectsFromQuantities`), mais sans `cause` il n'entrait pas dans
 * `blocking`. Il y entre; il reste non réparable; la décision dit pourquoi.
 */
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { collectPlanDefects, POT_MASS_UNRECONCILED_CAUSE } from "./plan_defect_pass.ts";
import type { PlanControlFindings } from "./plan_defect_pass.ts";
import { PLAN_REPAIR_MAX_CALLS, planRepairDecision } from "./plan_repair_loop.ts";

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

Deno.test("le refus de masse est BLOQUANT et non réparable — la décision dit `nothing_repairable`, pas `no_blocking_defect`", () => {
  const pass = collectPlanDefects(constats({ potsOverdrawn: 1, potsOverdrawnWorstPerMille: 12 }));
  assertEquals(pass.defects.length, 1);
  assertEquals(pass.defects[0].cause, POT_MASS_UNRECONCILED_CAUSE);
  assertEquals(pass.defects[0].repairable, false);
  assertEquals(pass.blocking.length, 1);
  assertEquals(pass.repairable.length, 0);
  const decision = planRepairDecision({
    defects: pass.defects,
    blocking: pass.blocking.length,
    callsMade: 0,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
    lastVerdict: null,
  });
  if (decision.call) throw new Error("un appel a été demandé pour un constat non réparable");
  assertEquals(decision.reason, "nothing_repairable");
});

Deno.test("le refus de masse — LE CAS QUI PASSE: sans dépassement, rien n'est bloquant", () => {
  const pass = collectPlanDefects(constats({ potsOverdrawn: 0 }));
  assertEquals(pass.blocking.length, 0);
  assertEquals(pass.defects.length, 0);
});

Deno.test("le mot du constat est le mot du 422 du handler, littéralement", () => {
  const src = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assertStringIncludes(src, `detail: ["${POT_MASS_UNRECONCILED_CAUSE}"]`);
});

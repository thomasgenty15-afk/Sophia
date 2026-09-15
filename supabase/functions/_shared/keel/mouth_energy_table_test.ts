/**
 * LOT 2.3 — L'ÉNERGIE PAR BOUCHE, ENFIN MESURÉE (audit 2026-09-14, § 2).
 *
 * ⛔ LE DÉFAUT, EN UN CHIFFRE. Sur les 25 tirs de la campagne, le compte
 * d'`incomplete` pour `mouth_energy` valait EXACTEMENT le nombre de bouches du
 * tir: 1 à N=1, 2 à N=2, 4 à N=4. Ce n'était pas un contrôle qui n'avait pas pu
 * conclure — c'était `energy: null` en dur au seul site d'appel, donc un
 * contrôle jamais branché, dont le `mouth_energy_short: 0` se lisait « personne
 * n'est sous-nourri ».
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { mouthEnergyTable } from "./final_plan_audit.ts";
import type { DayNutritionRow } from "./final_plan_audit.ts";
import { ENERGY_SHORT_RATIO } from "./final_plan_gate.ts";

const LEA = "m-lea";
const NILS = "m-nils";

function jour(over: Partial<DayNutritionRow> = {}): DayNutritionRow {
  return {
    memberId: LEA,
    date: "2026-09-15",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2000,
    servedKcal: 1900,
    deltaPct: -0.05,
    proteinG: 100,
    protein: { floorG: null, reason: null } as unknown as DayNutritionRow["protein"],
    state: "conforme",
    ...over,
  };
}

Deno.test("LE CAS QUI PASSE: deux journées lues s'additionnent en une enveloppe", () => {
  const rows = mouthEnergyTable([
    jour(),
    jour({ date: "2026-09-16", coveredBudgetKcal: 1800, servedKcal: 1750 }),
  ]);
  assertEquals(rows, [
    { memberId: LEA, envelopeKcal: 3800, deliveredKcal: 3650 },
  ]);
});

Deno.test("⛔ UNE JOURNÉE À TROU NE COMPTE PAS — elle ferait une fausse sous-nutrition", () => {
  // Sommer une journée partiellement lue rendrait un servi plus bas que la
  // réalité: on accuserait un plan correct, la direction d'erreur la plus chère.
  const rows = mouthEnergyTable([
    jour(),
    jour({ date: "2026-09-16", cellsMeasured: 1, servedKcal: 400, state: "unmeasurable" }),
  ]);
  assertEquals(rows, [
    { memberId: LEA, envelopeKcal: 2000, deliveredKcal: 1900 },
  ]);
});

Deno.test("une journée COMPLÈTE mais hors bande compte — c'est une journée LUE", () => {
  // ⛔ Le filtre est `cellsMeasured === cellsExpected`, pas `state ===
  // "conforme"`: écarter les journées `energy_off` retirerait de la somme
  // précisément celles que ce contrôle existe pour voir.
  const rows = mouthEnergyTable([
    jour({ servedKcal: 1200, deltaPct: -0.4, state: "energy_off" }),
  ]);
  assertEquals(rows[0].deliveredKcal, 1200);
  // Et la garde y verra bien une bouche sous-nourrie.
  assert(rows[0].deliveredKcal < rows[0].envelopeKcal * ENERGY_SHORT_RATIO);
});

Deno.test("⛔ UNE BOUCHE SANS AUCUN BUDGET N'EST PAS RENDUE — sa protection est déjà dite", () => {
  // Âge inconnu, corps absent, profil protégé: `cell_energy_no_target` le nomme
  // case par case et `plan_validation` le publie en `not_applicable`. La redire
  // ici ferait lire « contrôle incomplet » là où une protection a fermé.
  const rows = mouthEnergyTable([
    jour(),
    jour({
      memberId: NILS,
      coveredBudgetKcal: null,
      servedKcal: null,
      state: "unmeasurable",
    }),
  ]);
  assertEquals(rows.map((r) => r.memberId), [LEA]);
});

Deno.test("une bouche QUI A un budget et dont rien n'est lisible est rendue à zéro", () => {
  // Elle doit atterrir dans `energy_unmeasured`: « incomplet » veut alors dire
  // ce qu'il dit, au lieu de disparaître en silence.
  const rows = mouthEnergyTable([
    jour({ memberId: NILS, cellsMeasured: 0, servedKcal: null, state: "unmeasurable" }),
  ]);
  assertEquals(rows, [{ memberId: NILS, envelopeKcal: 0, deliveredKcal: 0 }]);
});

Deno.test("⛔ LE CÂBLAGE: le handler ne passe plus `energy: null` en dur", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(
    src.includes("energy: composition === null ? null : mouthEnergyTable(auditDayRows),"),
    "le contrôle d'énergie par bouche est redébranché",
  );
  // ⚠️ `energy: null` reste LÉGITIME sur le chemin d'adoption (draft_adopt lit
  // la clé gelée) — mais plus au site de génération.
  assertEquals(
    (src.match(/^\s+energy: null,$/gm) ?? []).length,
    0,
    "un `energy: null` en dur est revenu dans le handler",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// KEEL · LE BESOIN DE CHAQUE BOUCHE POUR LE PLANCHER DU BUDGET — 2026-09-25
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce que ces cas tiennent: la lecture de la fiche (même règle que le
// générateur), le choix « cible, sinon entretien », et le chargeur sur un
// foyer de bouches sans compte (aucune lecture de compte à simuler).
//
// ⛔ ILS NE PROUVENT PAS LES ÉQUATIONS: `mouth_anchor_test.ts` les tient.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type BudgetRosterRow,
  budgetMouthKcalOf,
  loadBudgetMouthKcal,
  sheetBodyFromRow,
} from "./budget_mouth_kcal_io.ts";
import type { MouthBody } from "./meal_envelope.ts";

const ADULT: MouthBody = {
  appetite: null,
  heightCm: 178,
  weightKg: 80,
  gender: "male",
  ageYears: 38,
  activityLevel: "trains_some",
  activityAxes: { day: null, sport: null, asked: false },
} as MouthBody;

const CHILD: MouthBody = {
  appetite: null,
  heightCm: 128,
  weightKg: 26,
  gender: "female",
  ageYears: 8,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
} as MouthBody;

const base = {
  memberId: "m1",
  ageState: "adult" as const,
  restriction: "no_account" as const,
  goal: null,
  paceKgPerWeek: null,
};

Deno.test("la fiche: tout-ou-rien sur taille, poids et sexe", () => {
  const row = {
    member_id: "m1",
    height_cm: "178",
    weight_kg: "80",
    gender: "male",
    age_years: 38,
    activity_level: "trains_some",
    day_activity: "nope",
    sport_frequency: null,
    appetite: null,
    activity_axes_asked: true,
  };
  const body = sheetBodyFromRow(row)!;
  assertEquals(body.heightCm, 178);
  assertEquals(body.weightKg, 80);
  // Hors vocabulaire ⇒ `null`, jamais un repli sur un cran.
  assertEquals(body.activityAxes.day, null);
  assertEquals(body.activityAxes.asked, true);
  assertEquals(sheetBodyFromRow({ ...row, height_cm: null }), null);
  assertEquals(sheetBodyFromRow({ ...row, gender: "" }), null);
  assertEquals(sheetBodyFromRow({ ...row, gender: "robot" })!.gender, null);
});

Deno.test("un enfant a un besoin plus bas qu'un adulte", () => {
  const adult = budgetMouthKcalOf({ ...base, body: ADULT })!;
  const child = budgetMouthKcalOf({ ...base, ageState: "minor", body: CHILD })!;
  assert(adult > 2000, `adulte ${adult}`);
  assert(child < 2000, `enfant ${child}`);
});

Deno.test("sans corps, pas de besoin — le plancher garde la référence", () => {
  assertEquals(budgetMouthKcalOf({ ...base, body: null }), null);
});

Deno.test("une perte de poids fait descendre le besoin sous l'entretien", () => {
  const upkeep = budgetMouthKcalOf({ ...base, restriction: "clear", body: ADULT })!;
  const losing = budgetMouthKcalOf({
    ...base,
    restriction: "clear",
    body: ADULT,
    goal: "fat_loss",
    paceKgPerWeek: 0.5,
  })!;
  assert(losing < upkeep, `${losing} < ${upkeep}`);
});

Deno.test("un plancher de restriction levé ferme l'objectif, pas le fait qu'on mange", () => {
  const upkeep = budgetMouthKcalOf({ ...base, restriction: "clear", body: ADULT })!;
  const raised = budgetMouthKcalOf({
    ...base,
    restriction: "raised",
    body: ADULT,
    goal: "fat_loss",
    paceKgPerWeek: 0.5,
  });
  assertEquals(raised, upkeep);
});

Deno.test("un compte illisible n'a pas de besoin: on s'abstient", () => {
  assertEquals(budgetMouthKcalOf({ ...base, restriction: "unreadable", body: ADULT }), null);
});

Deno.test("le chargeur: la fiche de chaque bouche, le rythme de la ligne", async () => {
  const roster: BudgetRosterRow[] = [
    { member_id: "adult", user_id: null, age_state: "adult", goal: "fat_loss" },
    { member_id: "kid", user_id: null, age_state: "minor", goal: null },
    { member_id: "ghost", user_id: null, age_state: "adult", goal: null },
  ];
  const sheets = [
    { member_id: "adult", height_cm: 178, weight_kg: 80, gender: "male", age_years: 38 },
    { member_id: "kid", height_cm: 128, weight_kg: 26, gender: "female", age_years: 8 },
  ];
  const calls: string[] = [];
  const db = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push(`rpc:${fn}:${String(args.p_household)}`);
      return Promise.resolve({ data: sheets, error: null });
    },
    from(table: string) {
      calls.push(`from:${table}`);
      const rows = table === "household_members"
        ? [{ member_id: "adult", target_pace_kg_per_week: 0.5 }]
        : [];
      const chain = {
        select: () => chain,
        eq: () => Promise.resolve({ data: rows, error: null }),
        in: () => Promise.resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
  const kcal = await loadBudgetMouthKcal(db, {
    householdId: "h1",
    roster,
    todayLocalDate: "2026-09-25",
  });
  assert(kcal.has("adult") && kcal.has("kid"));
  // Sans fiche, pas de besoin: la bouche garde la journée de référence.
  assertEquals(kcal.has("ghost"), false);
  assert(kcal.get("kid")! < kcal.get("adult")!);
  // Le rythme de la ligne est lu: la perte creuse sous l'entretien.
  const upkeep = budgetMouthKcalOf({
    ...base,
    memberId: "adult",
    body: sheetBodyFromRow(sheets[0])!,
  })!;
  assert(kcal.get("adult")! < upkeep);
  assert(calls.includes("rpc:keel_household_bodies_for:h1"));
  // Aucun compte ⇒ `student_goals` n'est pas lue.
  assertEquals(calls.includes("from:student_goals"), false);
});

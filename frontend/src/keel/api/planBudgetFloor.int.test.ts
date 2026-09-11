import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assessBudget, budgetMouthsFor } from "./planBudget";
import { DIET_ANSWERS } from "./onboarding";
import {
  BUDGET_FLOOR_PER_MOUTH_DAY,
  BUDGET_PLAUSIBLE_PER_MOUTH_DAY,
} from "../../../../supabase/functions/_shared/keel/budget_floor.ts";
import type { EatingOccasionSlot } from "./mealGeneration";
import type { AwayMark } from "../lib/presenceMarks";

// ===========================================================================
// LE PLANCHER DU BUDGET, CÔTÉ ÉCRAN — 2026-09-11
//
// ⚠️ CE DÉPÔT N'A NI JSDOM NI TESTING-LIBRARY (`vitest.config.ts` →
// `environment: "node"`): aucun test ici ne peut rejouer une frappe. D'où deux
// niveaux, et le second est le plus faible:
//   ① la VALEUR — ce que `budgetMouthsFor` compte, et ce que le verdict rend.
//      C'est un vrai test: il ment difficilement.
//   ② le CÂBLAGE, lu dans la source des deux écrans. Il vise une forme de
//      régression précise et nommée — « le refus a été retiré du geste » —, et
//      l'alternative honnête serait de ne rien garder du tout.
//
// ⛔ CE QU'AUCUN DES DEUX NE PROUVE: que les prix sont justes. Ils ont été
// mesurés sur la grille (`scratchpad/2026-09-11-PLANCHER-BUDGET/mesure.sql`,
// rejouable) et ils sont épinglés côté Deno (`constant_pins_test.ts`).
// ===========================================================================

const THREE_MEALS: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function source(relative: string): string {
  return readFileSync(resolve(__dirname, "..", "..", "..", relative), "utf8");
}

describe("le vocabulaire des régimes est le MÊME des deux côtés", () => {
  it("⛔ chaque réponse de l'entonnoir a sa ligne dans les deux tables", () => {
    // ⚠️ SANS CE CAS, UN RÉGIME AJOUTÉ À L'ÉCRAN TOMBERAIT SUR LE REPLI
    // `omnivore` EN SILENCE. Le typage côté Deno garde `DIETARY_REGIMES`; il ne
    // peut rien dire de `DIET_ANSWERS`, qui vit dans le navigateur et porte en
    // plus « je mange de tout ».
    const answers = [...DIET_ANSWERS].sort();
    expect(Object.keys(BUDGET_FLOOR_PER_MOUTH_DAY.fr).sort()).toEqual(answers);
    expect(Object.keys(BUDGET_FLOOR_PER_MOUTH_DAY.us).sort()).toEqual(answers);
    expect(Object.keys(BUDGET_PLAUSIBLE_PER_MOUTH_DAY.fr).sort()).toEqual(answers);
    expect(Object.keys(BUDGET_PLAUSIBLE_PER_MOUTH_DAY.us).sort()).toEqual(answers);
  });
});

describe("ce que l'écran compte", () => {
  it("⛔ 1 € pour sept jours à quatre est SOUS le plancher, et le verdict le chiffre", () => {
    const verdict = assessBudget({
      amount: 1,
      market: "fr",
      mouths: budgetMouthsFor({
        dayTokens: WEEK,
        houseSlots: THREE_MEALS,
        mouths: [1, 2, 3, 4].map((n) => ({
          memberId: `m${n}`,
          diet: "omnivore",
          eatingSlots: null,
          away: [],
        })),
        selfMemberId: "m1",
        selfAway: [],
      }),
    });
    expect(verdict.kind).toBe("below_floor");
    if (verdict.kind !== "below_floor") return;
    expect(verdict.floor).toBe(74.2);
  });

  it("un budget recevable mais serré ne REFUSE pas — il se dit", () => {
    const mouths = budgetMouthsFor({
      dayTokens: WEEK,
      houseSlots: THREE_MEALS,
      mouths: [{ memberId: "m1", diet: "omnivore", eatingSlots: null, away: [] }],
      selfMemberId: "m1",
      selfAway: [],
    });
    // 7 × 2,65 = 18,55 (plancher) · 7 × 3,77 = 26,39 (seuil)
    expect(assessBudget({ amount: 22, market: "fr", mouths }).kind).toBe("tight");
    expect(assessBudget({ amount: 30, market: "fr", mouths }).kind).toBe("ok");
  });

  it("⛔ la déclaration d'absence du TITULAIRE fait BAISSER le plancher", () => {
    // ⚠️ LA DIRECTION EST TOUT LE SUJET. Si `selfAway` n'était pas lu, le
    // plancher resterait celui d'une semaine pleine pour quelqu'un qui vient de
    // dire qu'il s'absente — c'est-à-dire un refus contre un budget honnête.
    const selfAway: AwayMark[] = [
      { day: "sat", slots: [], kind: "away" },
      { day: "sun", slots: [], kind: "away" },
    ];
    const base = { dayTokens: WEEK, houseSlots: THREE_MEALS, selfMemberId: "m1" };
    const mouths = [
      { memberId: "m1", diet: "omnivore", eatingSlots: null, away: [] },
      { memberId: "m2", diet: "omnivore", eatingSlots: null, away: [] },
    ];
    const withAway = budgetMouthsFor({ ...base, mouths, selfAway });
    const without = budgetMouthsFor({ ...base, mouths, selfAway: [] });
    expect(withAway[0].mouthDays).toBe(5);
    expect(without[0].mouthDays).toBe(7);
    // ⛔ ET SEULEMENT SUR SA LIGNE À LUI. Appliquée à tout le monde, la
    // déclaration du titulaire effacerait deux jours à une bouche qui n'a rien
    // dit — l'interdit de `awayHousehold`, dans l'autre sens.
    expect(withAway[1].mouthDays).toBe(7);
  });

  it("un rythme d'un seul repas vaut une journée PLEINE", () => {
    const mouths = budgetMouthsFor({
      dayTokens: ["mon"],
      houseSlots: THREE_MEALS,
      mouths: [{
        memberId: "m1",
        diet: "vegan",
        eatingSlots: [{ slot: "dinner", size: null }],
        away: [],
      }],
      selfMemberId: "m1",
      selfAway: [],
    });
    expect(mouths[0].mouthDays).toBe(1);
  });

  it("hors de France et des États-Unis, l'écran ne borne RIEN", () => {
    const mouths = budgetMouthsFor({
      dayTokens: WEEK,
      houseSlots: THREE_MEALS,
      mouths: [{ memberId: "m1", diet: "omnivore", eatingSlots: null, away: [] }],
      selfMemberId: "m1",
      selfAway: [],
    });
    expect(assessBudget({ amount: 1, market: null, mouths }).kind).toBe("unbounded");
  });
});

describe("le câblage des deux écrans qui composent", () => {
  // ⚠️ TEST DE SOURCE, DONC LE PLUS FAIBLE DES DEUX NIVEAUX. Il vise une
  // régression nommée: retirer le refus du geste. `planBudget.ts` porte
  // l'invariant en toutes lettres — les deux écrans qui composent portent le
  // champ, donc le refus a toujours un endroit où se rendre.
  const SCREENS = [
    "src/keel/components/MealBuilder.tsx",
    "src/keel/pages/SetupPage.tsx",
  ];

  it("⛔ les deux écrans REFUSENT sous le plancher, avec le montant qui le lève", () => {
    for (const screen of SCREENS) {
      const code = source(screen);
      expect(code, screen).toContain('budgetVerdict.kind === "below_floor"');
      expect(code, screen).toContain("plan.cooking.budget_below_floor");
      expect(code, screen).toContain("formatBudgetAmount(");
    }
  });

  it("⛔ le refus est RENDU, pas seulement levé au clic", () => {
    // Mesuré le 2026-09-11 sur un run réel: écrit uniquement dans l'erreur du
    // formulaire, le refus survivait à sa cause — il disait encore « il faut au
    // moins 92,75 » devant un champ corrigé à 150, parce que cette erreur-là
    // n'est remise à `null` qu'à l'envoi suivant. Il se rend donc à côté du
    // champ, calculé sur ce que le champ porte MAINTENANT.
    for (const screen of SCREENS) {
      const code = source(screen);
      const rendu = code.indexOf('{budgetVerdict.kind === "below_floor" && (');
      expect(rendu, `${screen}: le refus n'est pas rendu sous le champ`)
        .toBeGreaterThan(0);
    }
    // ⛔ ET IL NE S'ÉCRIT PLUS DEUX FOIS SUR LE MÊME ÉCRAN. La même phrase
    // rendue sous le champ ET au pied du formulaire se lit comme une panne.
    const builder = source("src/keel/components/MealBuilder.tsx");
    expect(builder.split("plan.cooking.budget_below_floor").length - 1).toBe(1);
  });

  it("les deux écrans DISENT ce qu'un budget serré va changer, sans retenir", () => {
    for (const screen of SCREENS) {
      const code = source(screen);
      expect(code, screen).toContain('budgetVerdict.kind === "tight"');
      expect(code, screen).toContain("plan.cooking.budget_tight");
    }
  });

  it("⛔ l'entonnoir retient AUSSI au bout du parcours, sur des faits relus", () => {
    // L'étape du budget peut avoir été quittée trois écrans plus tôt, et la
    // fenêtre ou les bouches ont pu bouger depuis. Un plancher vérifié
    // seulement sous le champ laisserait partir ce cas-là.
    const code = source("src/keel/pages/SetupPage.tsx");
    // ⟳ 2026-09-11 · LOT 7 — `draftInput` NE PREND PLUS DE PARAMÈTRE. Il lisait
    // les faits de l'entonnoir pour choisir une lane; il n'y en a plus qu'une.
    // La PROPRIÉTÉ gardée ici ne change pas: c'est l'ORDRE des deux gestes.
    const compose = code.indexOf("composeDraft(draftInput())");
    expect(compose).toBeGreaterThan(0);
    const guard = code.indexOf('floorVerdict.kind === "below_floor"');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(compose);
  });
});

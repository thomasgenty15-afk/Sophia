import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  assessBudget,
  type BudgetFloorMouth,
  type BudgetScale,
  budgetScaleFor,
  clampToBudgetScale,
} from "../api/planBudget";
import { en } from "../i18n/en";
import { sourceFamily } from "../../test/sourceFamily";
import { BudgetField } from "./PlanRequestFields";

// ===========================================================================
// LE CURSEUR DE BUDGET — 2026-09-25
//
// Demandé: un curseur à la place du champ libre, dont le minimum suit les
// réponses données au-dessus (jours, personnes, régimes) et dont le maximum
// reste raisonnable. Ce fichier tient ① les bornes, ② le rendu, ③ le câblage
// dans les deux écrans qui composent.
// ===========================================================================

const read = (rel: string) => sourceFamily(resolve(__dirname, rel));
const say = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const mouths = (n: number, days: number, diet: string | null = "omnivore"): BudgetFloorMouth[] =>
  Array.from({ length: n }, () => ({ diet, dayRates: null, mouthDays: days }));

describe("① les bornes du curseur", () => {
  it("sept jours à quatre en France: de 75 à 420, par pas de 5", () => {
    // Plancher 4 × 7 × 2,65 = 74,20 → 75; haut 4 × 7 × 15 = 420.
    expect(budgetScaleFor({ market: "fr", mouths: mouths(4, 7) })).toEqual({
      min: 75,
      max: 420,
      step: 5,
      currency: "EUR",
    });
  });

  it("sept jours à quatre aux États-Unis: de 100 à 505 $", () => {
    // Plancher 4 × 7 × 3,45 = 96,60 → 100 au pas de 5; haut 504 → 505.
    expect(budgetScaleFor({ market: "us", mouths: mouths(4, 7) })).toEqual({
      min: 100,
      max: 505,
      step: 5,
      currency: "USD",
    });
  });

  it("une personne, sept jours: pas de 1, de 19 à 105", () => {
    expect(budgetScaleFor({ market: "fr", mouths: mouths(1, 7) })).toEqual({
      min: 19,
      max: 105,
      step: 1,
      currency: "EUR",
    });
  });

  it("le minimum bouge avec les jours, les personnes et le régime", () => {
    const base = budgetScaleFor({ market: "fr", mouths: mouths(2, 3) })!.min;
    expect(budgetScaleFor({ market: "fr", mouths: mouths(2, 7) })!.min).toBeGreaterThan(base);
    expect(budgetScaleFor({ market: "fr", mouths: mouths(4, 3) })!.min).toBeGreaterThan(base);
    // Sans gluten coûte plus cher en France (le riz contre les pâtes).
    expect(budgetScaleFor({ market: "fr", mouths: mouths(2, 30, "gluten_free") })!.min)
      .toBeGreaterThan(budgetScaleFor({ market: "fr", mouths: mouths(2, 30) })!.min);
  });

  it("⛔ le minimum n'est jamais sous le plancher: le curseur ne propose rien que le verdict refuse", () => {
    for (const market of ["fr", "us"] as const) {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        for (const days of [0.35, 1, 2.5, 3, 5, 7]) {
          const m = mouths(n, days);
          const scale = budgetScaleFor({ market, mouths: m })!;
          expect(scale.max).toBeGreaterThan(scale.min);
          expect(assessBudget({ amount: scale.min, market, mouths: m }).kind).not.toBe(
            "below_floor",
          );
        }
      }
    }
  });

  it("hors de France et des États-Unis, ou sans bouche, pas de curseur", () => {
    expect(budgetScaleFor({ market: null, mouths: mouths(4, 7) })).toBeNull();
    expect(budgetScaleFor({ market: "fr", mouths: [] })).toBeNull();
  });

  it("un montant hors échelle glisse à la borne, et sur un cran du pas", () => {
    const scale: BudgetScale = { min: 75, max: 420, step: 5, currency: "EUR" };
    expect(clampToBudgetScale(500, scale)).toBe(420);
    expect(clampToBudgetScale(10, scale)).toBe(75);
    expect(clampToBudgetScale(83, scale)).toBe(85);
    expect(clampToBudgetScale(200, scale)).toBe(200);
  });
});

describe("② le rendu", () => {
  const html = (over: { budget?: string; scale?: BudgetScale | null }) =>
    renderToStaticMarkup(
      React.createElement(BudgetField, {
        id: "budget",
        disabled: false,
        budget: over.budget ?? "",
        onBudget: () => {},
        budgetVerdict: { kind: "unbounded" },
        budgetScale: over.scale === undefined
          ? { min: 75, max: 420, step: 5, currency: "EUR" }
          : over.scale,
      }),
    );

  it("avec une échelle: un curseur borné, et ses deux bouts écrits", () => {
    const markup = html({ budget: "150" });
    expect(markup).toContain('type="range"');
    expect(markup).toMatch(/min="75"/);
    expect(markup).toMatch(/max="420"/);
    expect(markup).toMatch(/step="5"/);
    expect(markup).toMatch(/value="150"/);
    expect(markup).not.toContain('type="number"');
  });

  it("⛔ sans réponse, rien n'est choisi: la phrase le dit, aucun montant inventé", () => {
    const markup = html({ budget: "" });
    expect(markup).toContain(say(en["plan.cooking.budget_pick"]));
  });

  it("sans échelle, le champ libre d'avant revient", () => {
    const markup = html({ budget: "150", scale: null });
    expect(markup).toContain('type="number"');
    expect(markup).not.toContain('type="range"');
  });
});

describe("③ le câblage", () => {
  it("⛔ les deux écrans calculent l'échelle sur les mêmes bouches que le plancher et la passent", () => {
    for (const rel of ["./MealBuilder.tsx", "../pages/setup/RequestStep.tsx"]) {
      const code = read(rel);
      expect(code, rel).toContain("budgetScaleFor({ market: budgetMarket, mouths: budgetMouths })");
      expect(code, rel).toContain("mouths: budgetMouths,");
      expect(code, rel).toContain("budgetScale={budgetScale}");
    }
  });

  it("⟳ 2026-09-25 — les deux écrans lisent le coût par bouche et le passent au plancher", () => {
    for (const rel of ["./MealBuilder.tsx", "../pages/setup/RequestStep.tsx"]) {
      expect(read(rel), rel).toMatch(/rates: budgetRates,/);
    }
    expect(read("./MealBuilder.tsx")).toContain("loadBudgetDayRates()");
    const setup = read("../pages/SetupPage.tsx");
    expect(setup).toContain("budgetRates={budgetRates}");
    // La porte de fin de parcours relit les coûts avec les faits.
    const gate = setup.indexOf('floorVerdict.kind === "below_floor"');
    const reread = setup.lastIndexOf("rates: await loadBudgetDayRates()", gate);
    expect(reread).toBeGreaterThan(0);
  });

  it("le formulaire commun monte le curseur", () => {
    const code = read("./PlanRequestFields.tsx");
    expect(code).toContain("<BudgetField");
    expect(code).toContain("budgetScale={props.budgetScale}");
  });
});

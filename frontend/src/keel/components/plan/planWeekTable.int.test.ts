import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanWeekTable, { type PlanWeekTableProps } from "./PlanWeekTable";
import type { MemberDayEnergyView } from "../../api/mealEnergy";
import { windowDates, windowDayOrder } from "../../api/mealWindow";
import { en } from "../../i18n/en";

// ===========================================================================
// ⟳ 2026-09-24 — LE TABLEAU DE LA SEMAINE, EN TÊTE DU PLAN.
//
// Demandé: « une indication de s'il y a des courses ou une session de cuisine
// sur chaque journée, et par personne le nombre de calories ». Les règles
// tenues ici:
//   · une colonne par jour, au nom ABRÉGÉ — le nom entier n'appartient qu'au
//     bloc du jour (`planWeekCarriedDays`);
//   · une marque de courses et une durée de cuisine par jour;
//   · AUCUNE ligne de personne tant qu'aucun chiffre n'existe (une grille de
//     tirets dirait à une personne protégée qu'un chiffre lui est caché);
//   · « — » pour qui n'a pas de chiffre, « * » et une note pour un total
//     partiel.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.
// ===========================================================================

/** Lundi 2026-08-17, trois jours. */
const STARTS_ON = "2026-08-17";
const ORDER = windowDayOrder(STARTS_ON, 3);
const DATES = windowDates(STARTS_ON, 3);

function render(over: Partial<PlanWeekTableProps> = {}): string {
  return renderToStaticMarkup(createElement(PlanWeekTable, {
    dayOrder: ORDER,
    dayDates: DATES,
    today: STARTS_ON,
    selectedDay: "mon",
    groceryDays: new Set<string>(),
    cookingMinutes: new Map<string, number | null>(),
    people: [
      { memberId: "m-paul", name: "Paul" },
      { memberId: "m-lea", name: "Léa" },
    ],
    ...over,
  }))
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

const text = (html: string) => html.replace(/<[^>]*>/g, " ");

function figure(memberId: string, day: string, kcal: number, complete = true): MemberDayEnergyView {
  return { memberId, day, kcal, complete, mealsCounted: complete ? 3 : 2, mealsTotal: 3 };
}

describe("le tableau de la semaine", () => {
  it("une colonne par jour, au nom ABRÉGÉ, jamais le nom entier", () => {
    const out = text(render());
    for (const day of ["Mon", "Tue", "Wed"]) expect(out).toContain(day);
    for (const day of ["Monday", "Tuesday", "Wednesday"]) {
      expect(out, `${day} écrit en entier dans le tableau`).not.toContain(day);
    }
    // Le quantième, comme le rail.
    expect(out).toContain("17");
    expect(out).toContain("19");
  });

  it("une marque sur chaque jour de courses, et rien ailleurs", () => {
    const html = render({ groceryDays: new Set(["mon", "wed"]) });
    expect(html.split("●").length - 1).toBe(2);
    expect(text(html)).toContain(en["meals.week_table.groceries"]);
  });

  it("la cuisine dit sa durée; inconnue, la marque seule", () => {
    const out = text(render({
      cookingMinutes: new Map<string, number | null>([["mon", 80], ["tue", 45], ["wed", null]]),
    }));
    expect(out).toContain("1h20");
    expect(out).toContain("45 min");
    // Mercredi: une session sans durée connue ⇒ une marque, pas un « 0 min ».
    expect(out).not.toContain("0 min");
    expect(out.split("●").length - 1).toBe(1);
  });

  it("⛔ SANS AUCUN CHIFFRE, AUCUNE LIGNE DE PERSONNE", () => {
    const withoutReader = text(render());
    expect(withoutReader).not.toContain("Paul");
    const nobody = text(render({ memberDayEnergy: () => null }));
    expect(nobody, "une grille de tirets sous les yeux d'une personne protégée")
      .not.toContain("Paul");
    expect(nobody).not.toContain("—");
  });

  it("un chiffre pour qui en a un, « — » pour les autres", () => {
    const out = text(render({
      memberDayEnergy: (memberId, day) =>
        memberId === "m-paul" && day === "mon" ? figure("m-paul", "mon", 2150) : null,
    }));
    expect(out).toContain("Paul (kcal)");
    expect(out).toContain("Léa (kcal)");
    expect(out).toContain("2150");
    // Paul mardi et mercredi, Léa les trois jours.
    expect(out.split("—").length - 1).toBe(5);
    expect(out).not.toContain(en["meals.week_table.partial_note"]);
  });

  it("⚠️ UN TOTAL PARTIEL SE MARQUE, ET SE DIT SOUS LE TABLEAU", () => {
    const out = text(render({
      memberDayEnergy: (memberId, day) =>
        memberId === "m-paul" && day === "tue" ? figure("m-paul", "tue", 1400, false) : null,
    }));
    expect(out).toContain("1400*");
    expect(out).toContain(en["meals.week_table.partial_note"]);
  });

  it("le jour lu est marqué dans sa colonne", () => {
    const html = render({ selectedDay: "tue", groceryDays: new Set(["tue"]) });
    // L'en-tête et les cases de mardi portent la teinte; lundi, non.
    const tuesdayHeader = html.slice(0, html.indexOf("Tue"));
    expect(tuesdayHeader.slice(tuesdayHeader.lastIndexOf("<th"))).toContain("bg-fig-50");
    const mondayHeader = html.slice(0, html.indexOf("Mon"));
    expect(mondayHeader.slice(mondayHeader.lastIndexOf("<th"))).not.toContain("bg-fig-50");
  });

  it("un plan sans jour ne rend rien", () => {
    expect(render({ dayOrder: [] })).toBe("");
  });
});

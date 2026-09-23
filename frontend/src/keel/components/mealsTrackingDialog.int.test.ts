import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { WeekMealsView } from "../api/weekMeals";

// ⟳ 2026-09-23 — « SUIVI DES REPAS »: LE BON JOUR, LES BONS PLATS, LA BONNE CASE.
//
// La liaison des cases est REMPLACÉE par une sonde: on regarde ce que la
// fenêtre lui passe (la position STOCKÉE du plat et la date où il se mange), et
// ce qu'elle rend. La case dit « pas mangé »: vide par défaut.

type Probe = { title: string; dishIndex: number; onDate: string | null };
const asked: Probe[] = [];
const missed = new Set<number>();

vi.mock("../lib/useMealTicks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/useMealTicks")>();
  return {
    ...actual,
    // Le « aujourd'hui » de la fenêtre, figé: le mardi du plan ci-dessous.
    browserLocalDate: () => "2026-09-22",
    useMealTicks: () => ({
      ready: true,
      error: null,
      bind: () => null,
      bindAt: (dish: { title?: string }, dishIndex: number, onDate: string | null) => {
        asked.push({ title: String(dish?.title ?? ""), dishIndex, onDate });
        // Le futur n'est pas rapportable: la vraie liaison rend `null`.
        if (!onDate || onDate > "2026-09-22") return null;
        return {
          missed: missed.has(dishIndex),
          busy: false,
          onToggle: () => {},
          untickPrompt: null,
        };
      },
    }),
  };
});

const { MealsTrackingBody, pickInitialDay } = await import("./MealsTrackingDialog");

const VIEW: WeekMealsView = {
  mealId: "f919217d-c7d3-4184-ad1f-2a191484284f",
  startsOn: "2026-09-21",
  durationDays: 4,
  order: ["mon", "tue", "wed", "thu"],
  dates: {
    mon: "2026-09-21",
    tue: "2026-09-22",
    wed: "2026-09-23",
    thu: "2026-09-24",
  },
  // Positions STOCKÉES volontairement non contiguës: la fenêtre ne doit jamais
  // renuméroter.
  dishes: [
    { dishIndex: 0, day: "mon", slot: "breakfast", title: "Porridge du lundi" },
    { dishIndex: 5, day: "tue", slot: "dinner", title: "Soupe du mardi" },
    { dishIndex: 6, day: "tue", slot: "lunch", title: "Couscous du mardi" },
    { dishIndex: 9, day: "wed", slot: "lunch", title: "Salade du mercredi" },
    { dishIndex: 11, day: null, slot: "snack_pm", title: "Fruit sans jour" },
  ],
};

function render(askedDay: string | null, view: WeekMealsView = VIEW): string {
  return renderToStaticMarkup(
    createElement(MealsTrackingBody, { view, userId: "user-1", askedDay }),
  );
}

beforeEach(() => {
  asked.length = 0;
  missed.clear();
});

describe("« Suivi des repas » — la fenêtre", () => {
  it("porte la consigne en tête", () => {
    expect(render(null)).toMatch(
      /Coche les repas que tu n’as pas mangés|Tick the meals you did not eat/,
    );
  });

  it("le jour demandé s'ouvre, et seulement ses plats, dans l'ordre de la journée", () => {
    const html = render("2026-09-22");
    expect(html).toContain("Couscous du mardi");
    expect(html).toContain("Soupe du mardi");
    expect(html).not.toContain("Porridge du lundi");
    expect(html).not.toContain("Salade du mercredi");
    expect(html.indexOf("Couscous du mardi")).toBeLessThan(html.indexOf("Soupe du mardi"));
    expect(asked).toEqual(
      expect.arrayContaining([
        { title: "Couscous du mardi", dishIndex: 6, onDate: "2026-09-22" },
        { title: "Soupe du mardi", dishIndex: 5, onDate: "2026-09-22" },
      ]),
    );
  });

  it("⛔ la case dit « pas mangé »: VIDE par défaut, cochée seulement sur un repas déclaré loupé", () => {
    const clean = render("2026-09-22");
    expect(clean).not.toMatch(/type="checkbox"[^>]*checked=""/);
    missed.add(6);
    const one = render("2026-09-22");
    expect(one.match(/checked=""/g)?.length).toBe(1);
  });

  it("un jour à venir montre ses cases GRISÉES, et dit quand elles s'ouvrent", () => {
    const html = render("2026-09-23");
    expect(html).toContain("Salade du mercredi");
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(html).toMatch(/cocher le jour même|tick them on the day/);
  });

  it("un plat SANS jour se range sous le premier jour du plan, comme dans le journal", () => {
    const html = render("2026-09-21");
    expect(html).toContain("Fruit sans jour");
    expect(asked).toEqual(
      expect.arrayContaining([
        { title: "Fruit sans jour", dishIndex: 11, onDate: "2026-09-21" },
      ]),
    );
  });
});

describe("le jour ouvert par défaut", () => {
  it("aujourd'hui, s'il a des repas", () => {
    expect(pickInitialDay(VIEW, null, "2026-09-22")).toBe("2026-09-22");
  });

  it("un jour demandé hors du plan est ignoré", () => {
    expect(pickInitialDay(VIEW, "2026-10-30", "2026-09-22")).toBe("2026-09-22");
  });

  it("aujourd'hui vide: le dernier jour PASSÉ qui a des repas", () => {
    const view = { ...VIEW, dishes: VIEW.dishes.filter((d) => d.day !== "tue") };
    expect(pickInitialDay(view, null, "2026-09-22")).toBe("2026-09-21");
  });

  it("⛔ le cas mesuré le 2026-09-23: plan qui commence aujourd'hui, repas à partir de demain", () => {
    // Le plan couvre mer→dim, ses plats vont de jeudi à dimanche: la fenêtre
    // s'ouvrait sur un mercredi vide, sans une seule case à l'écran.
    const view: WeekMealsView = {
      ...VIEW,
      startsOn: "2026-09-23",
      order: ["wed", "thu"],
      dates: { wed: "2026-09-23", thu: "2026-09-24" },
      dishes: [{ dishIndex: 0, day: "thu", slot: "lunch", title: "Jeudi" }],
    };
    expect(pickInitialDay(view, null, "2026-09-23")).toBe("2026-09-24");
  });
});

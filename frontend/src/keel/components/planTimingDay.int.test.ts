import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanResult from "./plan/PlanResult";
import type { GeneratedDish, PlanTimingView } from "../api/mealGeneration";
import { dishDayLabel } from "../api/mealLabels";
import { en } from "../i18n/en";

// ===========================================================================
// LA PHRASE DE TIMING VA SUR SON JOUR — 2026-09-09
//
// ⛔ LE DÉFAUT, SIGNALÉ SUR UN COMPTE RÉEL: « Courses et cuisson dès le matin,
// pour être prêt à midi. » se rendait dans une carte EN TÊTE DU PLAN, au-dessus
// du rail des jours, sans nommer aucun jour. Dit tel quel: *« si ça concerne le
// mercredi, ça devrait être sur le mercredi »*.
//
// ⚠️ ON REND ET ON LIT L'ORDRE, pas la présence. Une assertion de présence
// serait restée VERTE avec la carte en tête — c'est-à-dire sur le défaut
// exact. Ce qui se prouve ici est une POSITION: la phrase tombe après le titre
// du jour qu'elle concerne, donc dans son bloc.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

/** Lundi 2026-08-17 → mercredi 2026-08-19. */
const STARTS_ON = "2026-08-17";
const FIRST_DAY = dishDayLabel("mon") as string;
const SECOND_DAY = dishDayLabel("tue") as string;

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken and rice bowls",
    slot: "dinner",
    day: "mon",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    boxes: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function textOf(timing: PlanTimingView | null): string {
  return renderToStaticMarkup(createElement(PlanResult, {
    dishes: [dish(), dish({ day: "tue", title: "Lentil soup" })],
    preparations: [],
    cookingSessions: [],
    shoppingList: [],
    portions: [],
    startsOn: STARTS_ON,
    durationDays: 3,
    today: STARTS_ON,
    emptyLabel: "Tell me where to start above.",
    defaultView: "week",
    timing,
  })).replace(/<[^>]*>/g, " ");
}

describe("la phrase de timing appartient à un jour", () => {
  it("« dès le matin » se rend DANS le bloc du premier jour, pas au-dessus du rail", () => {
    const text = textOf({ kind: "same_morning", reason: "starts_today", leadDay: null });
    const sentence = en["meals.timing.same_morning"];
    expect(text).toContain(sentence);
    // ⛔ L'ASSERTION QUI TIENT LE LOT. Avant, la phrase précédait le titre du
    // premier jour — elle était au-dessus du rail. Elle le suit maintenant.
    expect(text.indexOf(sentence)).toBeGreaterThan(text.indexOf(FIRST_DAY));
    // Et elle ne se répète pas sous les autres jours.
    expect(text.indexOf(sentence)).toBeLessThan(text.indexOf(SECOND_DAY));
    expect(text.split(sentence).length - 1).toBe(1);
  });

  it("« la veille » nomme son jour ET se rend dedans", () => {
    const text = textOf({
      kind: "day_before",
      reason: "ok",
      leadDay: STARTS_ON,
    });
    const sentence = en["meals.timing.day_before"].replace("{day}", FIRST_DAY);
    expect(text).toContain(sentence);
    expect(text.indexOf(sentence)).toBeGreaterThan(text.indexOf(FIRST_DAY));
  });

  it("⛔ « la journée est entamée » RESTE en tête: elle parle de la fenêtre, pas d'un jour", () => {
    // Elle dit « ce plan commence demain, et il couvre un jour de moins que
    // demandé ». Ce fait n'appartient à aucun jour du plan — le ranger sous le
    // premier le ferait lire comme une consigne du lundi.
    const text = textOf({ kind: "starts_tomorrow", reason: "today_already_spent", leadDay: null });
    const sentence = en["meals.timing.starts_tomorrow"];
    expect(text).toContain(sentence);
    expect(text.indexOf(sentence)).toBeLessThan(text.indexOf(FIRST_DAY));
  });

  it("sans timing, aucune des trois phrases ne sort", () => {
    const text = textOf(null);
    for (
      const key of [
        "meals.timing.same_morning",
        "meals.timing.starts_tomorrow",
      ] as const
    ) {
      expect(text, key).not.toContain(en[key]);
    }
  });
});

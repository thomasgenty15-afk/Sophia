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

function textOf(timing: PlanTimingView | null, today: string = STARTS_ON): string {
  return renderToStaticMarkup(createElement(PlanResult, {
    dishes: [dish(), dish({ day: "tue", title: "Lentil soup" })],
    dishLayout: "full",
    preparations: [],
    cookingSessions: [],
    shoppingList: [],
    portions: [],
    startsOn: STARTS_ON,
    durationDays: 3,
    // ⟳ 2026-09-24 — plus de vue semaine: le rendu lit UN jour, celui de
    // `today` (le premier du plan par défaut).
    today,
    emptyLabel: "Tell me where to start above.",
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
    expect(text.split(sentence).length - 1).toBe(1);
    // Et elle ne se répète pas sous les autres jours: le mardi, lu seul, ne la
    // porte pas.
    const tuesday = textOf({ kind: "same_morning", reason: "starts_today", leadDay: null }, "2026-08-18");
    expect(tuesday).toContain(SECOND_DAY);
    expect(tuesday).not.toContain(sentence);
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

  it("⟳ 2026-09-20 — « la journée est entamée » NE SORT PLUS DE L'APERÇU", () => {
    // Elle disait « ce plan commence demain, et il couvre un jour de moins que
    // demandé », en tête de l'aperçu. Retirée sur demande: l'aperçu ne s'ouvre
    // plus sur ce que le plan ne couvre pas.
    //
    // ⟳ 2026-09-23 — ET LA CLÉ EST MORTE: `KitchenToday`, son dernier lecteur,
    // ne rend plus aucune phrase de timing (demandé: elles « polluent »
    // l'écran du jour). Elle est retirée des deux packs.
    const text = textOf({ kind: "starts_tomorrow", reason: "today_already_spent", leadDay: null });
    expect("meals.timing.starts_tomorrow" in en).toBe(false);
    // ⛔ ET SURTOUT PAS RETOMBÉE SUR « dès le matin ». Un cas muet et un cas
    // qui dit autre chose se relisent pareil dans un test de présence; celui-ci
    // nomme le fait FAUX que le `else` avait déjà produit une fois.
    expect(text).not.toContain(en["meals.timing.same_morning"]);
  });

  it("sans timing, « dès le matin » ne sort pas", () => {
    const text = textOf(null);
    expect(text).not.toContain(en["meals.timing.same_morning"]);
  });
});

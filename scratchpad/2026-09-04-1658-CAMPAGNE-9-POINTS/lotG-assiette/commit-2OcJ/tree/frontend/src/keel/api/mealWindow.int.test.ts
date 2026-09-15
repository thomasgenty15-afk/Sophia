import { describe, expect, it } from "vitest";
import {
  MEAL_WINDOW_FIXTURES,
  MEAL_WINDOW_REQUEST_FIXTURES,
} from "./mealWindow.fixtures";
import {
  MAX_WINDOW_DAYS,
  planEndsOn,
  planWindowState,
  resolveRequestedWindow,
  selectMealPlans,
  windowDates,
  windowDayOrder,
  windowSplit,
} from "./mealWindow";

// ===========================================================================
// LA FENÊTRE D'UN PLAN — le côté écran de la table de cas partagée
//
// Le même tableau est exécuté par
// `supabase/functions/_shared/keel/meal_plan_window_test.ts`. C'est lui qui
// empêche l'écran et le moteur de répondre différemment à « quel plan possède
// ce jour-là » — `following_io.ts` énonce la règle: deux définitions de
// « courant » divergent au premier ajustement, et personne ne sait alors
// laquelle ment.
// ===========================================================================

describe("la table de cas partagée", () => {
  it("dit qui est courant et qui est suivant", () => {
    for (const c of MEAL_WINDOW_FIXTURES) {
      const got = selectMealPlans(c.rows, c.today);
      expect(got.current?.id ?? null, `${c.name} · current`).toBe(c.expectCurrent);
      expect(got.next?.id ?? null, `${c.name} · next`).toBe(c.expectNext);
      expect(got.elapsed.map((r) => r.id), `${c.name} · elapsed`).toEqual(c.expectElapsed);
      expect(got.ambiguous.map((r) => r.id), `${c.name} · ambiguous`).toEqual(
        c.expectAmbiguous,
      );
    }
  });

  it("résout une intention en fenêtre", () => {
    for (const c of MEAL_WINDOW_REQUEST_FIXTURES) {
      if (c.expect === null) {
        expect(() => resolveRequestedWindow(c.request, c.today), c.name).toThrow();
        continue;
      }
      expect(resolveRequestedWindow(c.request, c.today), c.name).toEqual(c.expect);
    }
  });

  it("ne perd aucune ligne au tri", () => {
    for (const c of MEAL_WINDOW_FIXTURES) {
      const live = c.rows.filter((r) => !r.retiredAt);
      const got = selectMealPlans(c.rows, c.today);
      const seen = [
        ...(got.current ? [got.current] : []),
        ...(got.next ? [got.next] : []),
        ...got.elapsed,
        ...got.ambiguous,
      ].map((r) => r.id);
      expect(seen.length, c.name).toBe(live.length);
      expect(new Set(seen).size, `${c.name}: une ligne rendue deux fois`).toBe(seen.length);
    }
  });
});

describe("la fenêtre est ce qui cache les jours qu'un plan ne possède plus", () => {
  it("rend moins de sept jours quand elle est plus courte", () => {
    const dates = windowDates("2026-08-13", 4); // jeudi → dimanche
    expect(Object.keys(dates)).toHaveLength(4);
    expect(dates.thu).toBe("2026-08-13");
    expect(dates.sun).toBe("2026-08-16");
    // Un jeton hors fenêtre n'a pas de date: le plat n'est ni rendu, ni
    // cochable, ni rapprochable.
    expect(dates.mon).toBeUndefined();
    expect(windowDayOrder("2026-08-13", 4)).toEqual(["thu", "fri", "sat", "sun"]);
  });

  it("met les plats hors fenêtre à part au lieu de les jeter", () => {
    const split = windowSplit(
      [
        { day: "thu", title: "dedans" },
        { day: "sun", title: "dehors" },
        { day: null, title: "sans jour" },
      ],
      windowDates("2026-08-13", 2),
    );
    expect(split.inWindow.map((d) => d.title)).toEqual(["dedans", "sans jour"]);
    expect(split.outsideWindow.map((d) => d.title)).toEqual(["dehors"]);
  });

  it("borne inclusivement des deux côtés", () => {
    const row = { id: "a", startsOn: "2026-08-10", durationDays: 3 };
    expect(planEndsOn(row.startsOn, row.durationDays)).toBe("2026-08-12");
    expect(planWindowState(row, "2026-08-09")).toBe("not_started");
    expect(planWindowState(row, "2026-08-12")).toBe("in_window");
    expect(planWindowState(row, "2026-08-13")).toBe("elapsed");
  });

  it("plafonne à sept jours, structurellement", () => {
    expect(MAX_WINDOW_DAYS).toBe(7);
    expect(Object.keys(windowDates("2026-08-10", 99))).toHaveLength(7);
  });
});

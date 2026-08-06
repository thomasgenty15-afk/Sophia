import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";
import {
  MEAL_WINDOW_FIXTURES,
  MEAL_WINDOW_REQUEST_FIXTURES,
} from "./meal_plan_window_fixtures.ts";
import {
  MAX_WINDOW_DAYS,
  planEndsOn,
  planWindowState,
  resolveRequestedWindow,
  selectMealPlans,
  windowDates,
  windowDayOrder,
  windowSplit,
} from "./meal_plan_window.ts";

// ===========================================================================
// LA FENÊTRE D'UN PLAN — le côté moteur de la table de cas partagée
//
// Le même tableau est exécuté par `frontend/src/keel/api/mealWindow.test.ts`.
// Deux implémentations d'une même question divergent au premier ajustement et
// personne ne sait alors laquelle ment; cette table est ce qui l'empêche.
// ===========================================================================

Deno.test("la table de cas partagée: qui est courant, qui est suivant", () => {
  for (const c of MEAL_WINDOW_FIXTURES) {
    const got = selectMealPlans(c.rows, c.today);
    assertEquals(got.current?.id ?? null, c.expectCurrent, `${c.name} · current`);
    assertEquals(got.next?.id ?? null, c.expectNext, `${c.name} · next`);
    assertEquals(got.elapsed.map((r) => r.id), c.expectElapsed, `${c.name} · elapsed`);
    assertEquals(
      got.ambiguous.map((r) => r.id),
      c.expectAmbiguous,
      `${c.name} · ambiguous`,
    );
  }
});

Deno.test("la table de cas partagée: l'intention devient une fenêtre", () => {
  for (const c of MEAL_WINDOW_REQUEST_FIXTURES) {
    if (c.expect === null) {
      assertThrows(() => resolveRequestedWindow(c.request, c.today), Error, "", c.name);
      continue;
    }
    assertEquals(resolveRequestedWindow(c.request, c.today), c.expect, c.name);
  }
});

Deno.test("aucune ligne n'est perdue par le tri", () => {
  // Une partition: chaque ligne vivante ressort exactement une fois, dans un
  // seul des quatre seaux. Un plan écarté en silence est un plan dont personne
  // ne saura qu'il a existé.
  for (const c of MEAL_WINDOW_FIXTURES) {
    const live = c.rows.filter((r) => !r.retiredAt);
    const got = selectMealPlans(c.rows, c.today);
    const seen = [
      ...(got.current ? [got.current] : []),
      ...(got.next ? [got.next] : []),
      ...got.elapsed,
      ...got.ambiguous,
    ].map((r) => r.id);
    assertEquals(seen.length, live.length, `${c.name}: ${seen.length} vs ${live.length}`);
    assertEquals(new Set(seen).size, seen.length, `${c.name}: une ligne rendue deux fois`);
  }
});

Deno.test("une fenêtre courte rend moins de sept jours", () => {
  // LE COMPORTEMENT PORTEUR: un jeton hors fenêtre n'a pas de date, donc le
  // plat n'est ni rendu, ni cochable, ni rapprochable. C'est ainsi qu'un plan
  // tronqué cesse de montrer les jours qu'il ne possède plus.
  const dates = windowDates("2026-08-13", 4); // jeudi → dimanche
  assertEquals(Object.keys(dates).length, 4);
  assertEquals(dates.thu, "2026-08-13");
  assertEquals(dates.sun, "2026-08-16");
  assertEquals(dates.mon, undefined);
  assertEquals(dates.tue, undefined);
  assertEquals(dates.wed, undefined);

  assertEquals(windowDayOrder("2026-08-13", 4), ["thu", "fri", "sat", "sun"]);
  // Une fenêtre pleine repasse par lundi, mais APRÈS: l'ordre est celui du
  // plan, pas celui du calendrier.
  assertEquals(windowDayOrder("2026-08-13", 7), [
    "thu", "fri", "sat", "sun", "mon", "tue", "wed",
  ]);
});

Deno.test("les plats hors fenêtre sont mis à part, jamais jetés", () => {
  const dates = windowDates("2026-08-13", 2); // jeudi, vendredi
  const split = windowSplit(
    [
      { day: "thu", title: "dedans" },
      { day: "sun", title: "dehors" },
      { day: null, title: "sans jour" },
    ],
    dates,
  );
  assertEquals(split.inWindow.map((d) => d.title), ["dedans", "sans jour"]);
  assertEquals(split.outsideWindow.map((d) => d.title), ["dehors"]);
});

Deno.test("les bornes de la fenêtre sont inclusives des deux côtés", () => {
  const row = { id: "a", startsOn: "2026-08-10", durationDays: 3 };
  assertEquals(planEndsOn(row.startsOn, row.durationDays), "2026-08-12");
  assertEquals(planWindowState(row, "2026-08-09"), "not_started");
  assertEquals(planWindowState(row, "2026-08-10"), "in_window");
  assertEquals(planWindowState(row, "2026-08-12"), "in_window");
  assertEquals(planWindowState(row, "2026-08-13"), "elapsed");
});

Deno.test("le plafond de sept jours est structurel", () => {
  // Il n'est pas une préférence produit: au-delà, un jeton de jour désigne deux
  // dates dans la même ligne, et chaque clé de coche les résout sur sept
  // créneaux.
  assertEquals(MAX_WINDOW_DAYS, 7);
  assertEquals(Object.keys(windowDates("2026-08-10", 99)).length, 7);
  assert(
    MEAL_WINDOW_REQUEST_FIXTURES.some((c) => c.expect === null),
    "la table de cas doit contenir au moins un refus de durée",
  );
});

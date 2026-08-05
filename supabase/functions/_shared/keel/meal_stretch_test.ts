// LA SEMAINE D'UNE COMPOSITION — le portage serveur de `mealStretch.ts`.
//
// Ce que ces tests protègent, et c'est la raison d'être du module: un plat ne
// nomme qu'un JOUR DE SEMAINE, et `student_generated_meals` n'a pas de
// `week_start`. Sans ancre, « mardi de quelle semaine » n'a pas de réponse.
//
// L'ancre est la DATE DE COMPOSITION, jamais « aujourd'hui »: un plan composé
// mercredi et relu vendredi verrait sinon mercredi et jeudi renvoyés à la
// semaine prochaine, alors qu'ils viennent de passer.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  dishDate,
  dishesForDate,
  isReportable,
  stretchDates,
} from "./meal_stretch.ts";

// 2026-08-05 est un MERCREDI.
const WED = "2026-08-05";

Deno.test("les sept jetons tombent chacun sur une date, sans trou", () => {
  const dates = stretchDates(WED);
  assertEquals(Object.keys(dates).sort(), [
    "fri", "mon", "sat", "sun", "thu", "tue", "wed",
  ]);
  assertEquals(dates.wed, "2026-08-05");
  assertEquals(dates.thu, "2026-08-06");
  // Lundi et mardi appartiennent à la semaine SUIVANTE — c'est tout le point
  // de l'ancre: le plan se lit dans l'ordre où on le vit.
  assertEquals(dates.mon, "2026-08-10");
  assertEquals(dates.tue, "2026-08-11");
});

Deno.test("un plat sans jour se rapporte le jour où on le rapporte", () => {
  const dates = stretchDates(WED);
  assertEquals(dishDate(null, dates, "2026-08-07"), "2026-08-07");
  assertEquals(dishDate("", dates, "2026-08-07"), "2026-08-07");
});

Deno.test("un jeton hors fenêtre n'a pas de date, et ne s'invente pas", () => {
  assertEquals(dishDate("xxx", stretchDates(WED), "2026-08-07"), null);
});

Deno.test("le FUTUR n'est jamais rapportable", () => {
  // C'est la seule interdiction qui compte: un « j'ai mangé » daté de vendredi
  // posé lundi n'est pas une approximation, c'est une preuve fabriquée.
  assertEquals(isReportable("2026-08-06", WED), false);
  assertEquals(isReportable(WED, WED), true);
  assertEquals(isReportable("2026-08-04", WED), true);
  assertEquals(isReportable(null, WED), false);
});

Deno.test("les candidats d'un jour gardent leur INDEX d'origine", () => {
  // L'index identifie la coche (`mealTickKey`). Le perdre en filtrant
  // cocherait un autre plat que celui qu'on a reconnu.
  const dishes = [
    { day: "mon", slot: "breakfast" }, // -> 10/08
    { day: "wed", slot: "lunch" }, //     -> 05/08
    { day: "thu", slot: "dinner" }, //    -> 06/08
    { day: "wed", slot: "dinner" }, //    -> 05/08
  ];
  const today = dishesForDate({ dishes, startDate: WED, onDate: WED });
  assertEquals(today.map((d) => d.dishIndex), [1, 3]);
  assertEquals(today.map((d) => d.dish.slot), ["lunch", "dinner"]);
});

Deno.test("un plat SANS jour est candidat pour la date demandée", () => {
  const today = dishesForDate({
    dishes: [{ day: null, slot: "lunch" }],
    startDate: WED,
    onDate: "2026-08-07",
  });
  assertEquals(today.length, 1);
  assertEquals(today[0].date, "2026-08-07");
});

Deno.test("un jour de la composition qui n'est pas celui demandé est écarté", () => {
  const today = dishesForDate({
    dishes: [{ day: "sun", slot: "dinner" }],
    startDate: WED,
    onDate: WED,
  });
  assertEquals(today, []);
});

Deno.test("l'ancre est la COMPOSITION, pas aujourd'hui", () => {
  // Le même plat « jeudi », dans deux compositions différentes, ne tombe pas
  // le même jour. C'est exactement ce qu'une ancre « aujourd'hui » perdrait.
  const fromWed = stretchDates("2026-08-05").thu;
  const fromFri = stretchDates("2026-08-07").thu;
  assertEquals(fromWed, "2026-08-06");
  assertEquals(fromFri, "2026-08-13");
  assert(fromWed !== fromFri);
});

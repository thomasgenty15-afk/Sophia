import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  COOKING_EFFORT_PROFILE,
  COOKING_SESSION_COUNTS,
  type CookingSessionCount,
  cookedMealsPerDay,
  cookingEffort,
  deriveCookingPlan,
  EFFORT_MARGIN_KEEN,
  EFFORT_MARGIN_NORMAL,
  GROCERY_RUNS,
  GROCERY_RUNS_ANY,
  type GroceryRuns,
  longestFridgeStretch,
  MAX_COOKING_SESSIONS,
  minimumSessionMinutes,
  MINUTES_PER_COOKED_MEAL,
  SHORTEST_SESSION_MAX_DAYS,
  offerableCookingSessions,
  offerableGroceryRuns,
  offerableSessionTimes,
  readCookingSessions,
  readGroceryRuns,
  readSessionTimeBound,
  resolveCookingCapacity,
  SESSION_TIME_BOUNDS,
  type SessionTimeBound,
  sessionTimeBoundFor,
  unusedGroceryRuns,
} from "./cooking_plan.ts";
import { type DayToken } from "./tokens.ts";
// ⛔ IMPORTÉES POUR ÊTRE ÉPROUVÉES, PAS POUR ÊTRE UTILISÉES. Voir le bloc
// « INVARIANT VOISIN »: l'offre de cadence repose sur une propriété de CE
// module-là, et une dépendance qu'on affirme sans la mesurer est une contrainte
// documentée qui survivra à sa cause.
import {
  addDays,
  MAX_WINDOW_DAYS,
  withCookDayBefore,
  withoutSpentFirstDay,
} from "./meal_plan_window.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMBIEN DE FOIS TU VEUX CUISINER ? » / « TEMPS PAR SESSION » / « COURSES »
 * ⟳ 2026-09-25 — le style de cuisine est remplacé par deux questions directes.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CES TESTS DOIVENT EMPÊCHER ─────────────────────────────────────
 *   ① que l'écran propose un nombre de sessions ou une plage de temps que le
 *      moteur ne suivra pas — l'offre et la dérivation sont une seule règle;
 *   ② qu'une plage trop courte pour tous les repas passe: pour le modèle, le
 *      temps est un maximum, et un plan trop court sous-nourrit ses derniers
 *      jours;
 *   ③ qu'une session unique sans congélateur couvre plus que le frigo;
 *   ④ que le tableau validé par le propriétaire le 2026-09-25 bouge en silence.
 *
 * ⛔ `maxFridgeDays: 3` EST UN LITTÉRAL PARTOUT ICI, PAS `MAX_FRIDGE_DAYS`.
 * Paramétrer le banc par sa propre constante le laisserait VERT le jour où elle
 * change — cicatrice mesurée de ce dépôt. La valeur est épinglée ailleurs
 * (`week_bounds_test.ts`).
 */

// Une fenêtre de huit jours avec une veille au rang 0 (le cas de A1): on
// cuisine dimanche, on mange du lundi au dimanche suivant.
const WITH_LEAD: readonly DayToken[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// Sept jours mangés, sans veille.
const NO_LEAD: readonly DayToken[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function plan(over: Partial<Parameters<typeof deriveCookingPlan>[0]> = {}) {
  return deriveCookingPlan({
    sessions: 3,
    minutes: 120,
    mealsPerDay: 2,
    runs: 2,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    maxFridgeDays: 3,
    ...over,
  });
}

const DECLARED = {
  cookDays: [] as string[],
  cookingTimeMin: 120 as number | null,
  recipeDifficulty: null as string | null,
  variety: null as string | null,
  budgetAmount: null as number | null,
};

// ---------------------------------------------------------------------------
// 1. LES CONSTANTES — épinglées à leur littéral
// ---------------------------------------------------------------------------

Deno.test("les constantes sont épinglées EN ENTIER", () => {
  assertEquals(GROCERY_RUNS, [1, 2, 3]);
  assertEquals(MAX_COOKING_SESSIONS, 4);
  assertEquals(COOKING_SESSION_COUNTS, [1, 2, 3, 4]);
  // ⚠️ LES RÉPONSES SONT ÉCRITES EN DUR POUR LE TYPE: la dernière doit rester
  // le plafond, sinon l'écran proposerait un nombre que le moteur rabote.
  assertEquals(COOKING_SESSION_COUNTS[COOKING_SESSION_COUNTS.length - 1], MAX_COOKING_SESSIONS);
  // ⟳ 2026-09-25 (soir) — cinq durées « environ », 2 h 30 au plus.
  assertEquals(SESSION_TIME_BOUNDS, [30, 60, 90, 120, 150]);
  // L'hypothèse ramenée à 10 le 2026-09-25: trois sessions pour sept jours
  // tiennent en 1 h.
  assertEquals(MINUTES_PER_COOKED_MEAL, 10);
  // « 30 min » seulement quand chaque session couvre deux jours au plus.
  assertEquals(SHORTEST_SESSION_MAX_DAYS, 2);
  assertEquals(EFFORT_MARGIN_NORMAL, 1.5);
  assertEquals(EFFORT_MARGIN_KEEN, 3);
  assertEquals(COOKING_EFFORT_PROFILE, {
    simple: { difficulty: "simple", variety: "repeat" },
    normal: { difficulty: "normal", variety: "some" },
    keen: { difficulty: "keen", variety: "varied" },
  });
});

// ---------------------------------------------------------------------------
// 2. LES LECTURES — le troisième état
// ---------------------------------------------------------------------------

Deno.test("le nombre de sessions: un nombre de 1 à 4, ou `null`", () => {
  for (const raw of [null, undefined, "", " ", 0, 5, -1, 1.5, "abc", {}, []]) {
    assertEquals(readCookingSessions(raw), null, JSON.stringify(raw));
  }
  // ⛔ `Number(true)` VAUT 1: un booléen venu du réseau ne devient pas
  // « une seule fois ».
  assertEquals(readCookingSessions(true), null);
  for (const n of [1, 2, 3, 4]) {
    assertEquals(readCookingSessions(n), n);
    assertEquals(readCookingSessions(String(n)), n, "la valeur d'un <select>");
  }
});

Deno.test("la plage de temps: lue dans `cooking_time_min`, ramenée à sa borne", () => {
  for (const pc of [null, undefined, {}, { cooking_time_min: null }, { cooking_time_min: "" }]) {
    assertEquals(readSessionTimeBound(pc), null);
  }
  // ⛔ `0` et `NaN` NE SONT PAS « moins de 30 min »: ce sont des absences.
  for (const cooking_time_min of [0, -5, Number.NaN, "abc", true]) {
    assertEquals(readSessionTimeBound({ cooking_time_min }), null, String(cooking_time_min));
  }
  // Les valeurs d'avant (ancienne question, dérivation du style, anciennes
  // plages, écriture du chat) passent à la durée au-dessus, jamais en dessous;
  // ⟳ 2026-09-25 (soir) — 180 et 240, les anciennes plages, deviennent 2 h 30.
  const cases: Array<[unknown, SessionTimeBound]> = [
    [15, 30],
    [30, 30],
    [35, 60],
    [45, 60],
    [60, 60],
    [90, 90],
    [100, 120],
    [120, 120],
    [150, 150],
    [180, 150],
    [240, 150],
    [999, 150],
    ["60", 60],
  ];
  for (const [cooking_time_min, bound] of cases) {
    assertEquals(readSessionTimeBound({ cooking_time_min }), bound, String(cooking_time_min));
  }
});

Deno.test("« zéro course » ne passe pas, et `null` n'est pas `0`", () => {
  for (const pc of [null, undefined, {}, { grocery_runs: 0 }, { grocery_runs: 4 }]) {
    assertEquals(readGroceryRuns(pc), null);
  }
  // ⛔ `Number(null)` VAUT `0` ET EST FINI.
  assertEquals(readGroceryRuns({ grocery_runs: null }), null);
  for (const n of [1, 2, 3]) {
    assertEquals(readGroceryRuns({ grocery_runs: n }), n as GroceryRuns);
  }
});

Deno.test("les repas cuisinés par jour: déjeuners et dîners de la maison", () => {
  // Aucun moment connu ⇒ le rythme par défaut du moteur, qui en porte deux.
  assertEquals(cookedMealsPerDay([]), 2);
  assertEquals(cookedMealsPerDay(["breakfast", "lunch", "dinner"]), 2);
  assertEquals(cookedMealsPerDay(["dinner"]), 1);
  // Les doublons viennent de l'union des bouches: ils ne comptent qu'une fois.
  assertEquals(cookedMealsPerDay(["lunch", "dinner", "lunch", "dinner", "snack_pm"]), 2);
  // ⛔ JAMAIS ZÉRO: un petit-déjeuner seul se prépare quand même.
  assertEquals(cookedMealsPerDay(["breakfast", "snack_am"]), 1);
});

// ---------------------------------------------------------------------------
// 3. LE TABLEAU VALIDÉ LE 2026-09-25 — écrit en dur, case par case
// ---------------------------------------------------------------------------
//
// ⛔ RECALCULER AVEC LA FONCTION RENDRAIT L'ÉPREUVE VRAIE QUELLE QUE SOIT LA
// RÈGLE. Chaque case: le minimum en minutes, la plus courte durée proposée, et
// « ❄ » = proposé seulement avec un congélateur. Déjeuner + dîner, 10 min par
// repas, la PLUS GROSSE session, et « 30 min » seulement quand elle couvre au
// plus deux jours. ⟳ 2026-09-25 (soir) — le tableau revalidé ce soir-là.

Deno.test("MATRICE — le tableau validé par le propriétaire, jours × sessions", () => {
  const table: Record<number, Array<[number, SessionTimeBound, boolean] | null>> = {
    1: [[20, 30, false], null, null, null],
    2: [[30, 30, false], [20, 30, false], null, null],
    3: [[60, 60, false], [30, 30, false], [20, 30, false], null],
    4: [[80, 90, true], [30, 30, false], [30, 30, false], [20, 30, false]],
    5: [[100, 120, true], [60, 60, false], [30, 30, false], [30, 30, false]],
    6: [[120, 120, true], [60, 60, false], [30, 30, false], [30, 30, false]],
    7: [[140, 150, true], [80, 90, true], [60, 60, false], [30, 30, false]],
  };
  for (let days = 1; days <= 7; days++) {
    const withFreezer = offerableCookingSessions({ daysToEat: days, freezer: true, maxFridgeDays: 3 });
    const without = offerableCookingSessions({ daysToEat: days, freezer: false, maxFridgeDays: 3 });
    for (let sessions = 1; sessions <= 4; sessions++) {
      const cell = table[days][sessions - 1];
      const où = `${days}j/${sessions}s`;
      if (cell === null) {
        assert(!withFreezer.shown.includes(sessions as CookingSessionCount), `${où}: proposé`);
        continue;
      }
      const [minimum, shortest, needsFreezer] = cell;
      const times = offerableSessionTimes({ daysToEat: days, sessions, mealsPerDay: 2 });
      assertEquals(times.minimum, minimum, `${où}: minimum`);
      assertEquals(times.shortest, shortest, `${où}: plus courte plage`);
      assert(withFreezer.values.includes(sessions as CookingSessionCount), `${où}: refusé avec congélateur`);
      assertEquals(
        !without.values.includes(sessions as CookingSessionCount),
        needsFreezer,
        `${où}: la marque du congélateur`,
      );
    }
  }
});

Deno.test("le minimum compte la PLUS GROSSE session, pas la moyenne", () => {
  // Sept jours en trois sessions: tranches de 3, 2 et 2 jours. La moyenne
  // donnerait 47 min; la tranche de 3 jours en demande 60.
  assertEquals(minimumSessionMinutes({ daysToEat: 7, sessions: 3, mealsPerDay: 2 }), 60);
  // Une maison qui ne mange à la maison que le soir: deux fois moins.
  assertEquals(minimumSessionMinutes({ daysToEat: 7, sessions: 1, mealsPerDay: 1 }), 70);
  // Et la dérivation découpe bien en tranches de ⌈jours ÷ sessions⌉ au plus.
  for (let days = 1; days <= 7; days++) {
    for (const sessions of COOKING_SESSION_COUNTS) {
      if (sessions > days) continue;
      const out = deriveCookingPlan({
        sessions,
        minutes: 150,
        mealsPerDay: 2,
        runs: 1,
        freezer: true,
        windowDays: NO_LEAD.slice(0, days),
        leadDay: false,
        daysToEat: days,
        maxFridgeDays: 3,
      });
      const longest = longestFridgeStretch(out, NO_LEAD.slice(0, days));
      assert(
        longest <= Math.ceil(days / sessions),
        `${days}j/${sessions}s: une tranche de ${longest} jours, le minimum en compte ${Math.ceil(days / sessions)}`,
      );
    }
  }
});

// ⟳ 2026-09-25 — « 30 MIN », LE GRAND MAXIMUM: deux jours par session.
Deno.test("« 30 min » seulement quand chaque session couvre deux jours au plus", () => {
  // Deux jours de déjeuners et dîners font 40 min au calcul: 30 reste
  // proposée (décision du propriétaire), et le minimum le dit pour que le
  // moteur ne la relève pas.
  const two = offerableSessionTimes({ daysToEat: 4, sessions: 2, mealsPerDay: 2 });
  assertEquals(two.values, [30, 60, 90, 120, 150]);
  assertEquals(two.minimum, 30);
  // ⛔ TROIS JOURS NE TIENNENT PAS EN 30 MIN, même avec un seul repas par jour
  // (30 min au calcul).
  const three = offerableSessionTimes({ daysToEat: 3, sessions: 1, mealsPerDay: 1 });
  assertEquals(three.minimum, 30);
  assertEquals(three.values, [60, 90, 120, 150]);
  // Et le moteur relève une réponse « 30 min » non proposée, comme l'écran.
  const raised = plan({
    sessions: 1,
    minutes: 30,
    mealsPerDay: 1,
    windowDays: NO_LEAD.slice(0, 3),
    leadDay: false,
    daysToEat: 3,
  });
  assertEquals(raised.sessionMinutes, 60);
  assert(raised.notes.includes("time_raised_to_minimum"));
  // Deux jours par session en 30 min: gardé, et des recettes simples.
  const kept = plan({
    sessions: 2,
    minutes: 30,
    windowDays: NO_LEAD.slice(0, 4),
    leadDay: false,
    daysToEat: 4,
  });
  assertEquals(kept.sessionMinutes, 30);
  assert(!kept.notes.includes("time_raised_to_minimum"));
  assertEquals(kept.effort, "simple");
});

Deno.test("le minimum REFUSE une entrée non finie", () => {
  assertThrows(
    () => minimumSessionMinutes({ daysToEat: Number.NaN, sessions: 2, mealsPerDay: 2 }),
    Error,
    "daysToEat non fini",
  );
});

// ---------------------------------------------------------------------------
// 4. L'OFFRE DE SESSIONS
// ---------------------------------------------------------------------------

Deno.test("l'offre de sessions — de 1 au nombre de jours, quatre au plus", () => {
  for (let days = 1; days <= 7; days++) {
    const out = offerableCookingSessions({ daysToEat: days, freezer: true, maxFridgeDays: 3 });
    assertEquals(out.shown, COOKING_SESSION_COUNTS.filter((n) => n <= Math.min(4, days)), `${days}j`);
    assertEquals(out.values, out.shown, `${days}j: le congélateur ne grise rien`);
    assertEquals(out.minimum, 1);
    assertEquals(out.limit, null);
  }
  assertEquals(offerableCookingSessions({ daysToEat: 40, freezer: true, maxFridgeDays: 3 }).shown, [1, 2, 3, 4]);
});

Deno.test("l'offre de sessions — sans congélateur, une session tous les trois jours au moins", () => {
  // ⛔ `null` (jamais demandé) GRISE COMME `false`.
  for (const freezer of [false, null] as const) {
    const expected: Record<number, number[]> = {
      1: [1],
      2: [1, 2],
      3: [1, 2, 3],
      4: [2, 3, 4],
      5: [2, 3, 4],
      6: [2, 3, 4],
      7: [3, 4],
    };
    for (let days = 1; days <= 7; days++) {
      const out = offerableCookingSessions({ daysToEat: days, freezer, maxFridgeDays: 3 });
      assertEquals(out.values, expected[days], `${freezer}/${days}j`);
      // ⛔ UN MOTIF DÈS QU'UNE OPTION LISTÉE EST GRISÉE — sinon elle se lit
      // comme une panne.
      assertEquals(out.limit === "freezer", out.values.length < out.shown.length, `${freezer}/${days}j`);
    }
  }
});

Deno.test("l'offre de sessions — plus de question quand il n'y a qu'une réponse", () => {
  assertEquals(offerableCookingSessions({ daysToEat: 1, freezer: false, maxFridgeDays: 3 }).forced, 1);
  for (let days = 2; days <= 7; days++) {
    for (const freezer of [true, false, null] as const) {
      assertEquals(
        offerableCookingSessions({ daysToEat: days, freezer, maxFridgeDays: 3 }).forced,
        null,
        `${freezer}/${days}j`,
      );
    }
  }
});

Deno.test("l'offre de sessions — MUTATION: la conservation est LUE, pas un 3 en dur", () => {
  assertEquals(offerableCookingSessions({ daysToEat: 7, freezer: false, maxFridgeDays: 7 }).values, [1, 2, 3, 4]);
  assertEquals(offerableCookingSessions({ daysToEat: 3, freezer: false, maxFridgeDays: 1 }).values, [3]);
});

Deno.test("l'offre de sessions — REFUSE une entrée qui désarmerait la garde", () => {
  assertThrows(
    () => offerableCookingSessions({ daysToEat: 7, freezer: undefined as never, maxFridgeDays: 3 }),
    Error,
    "`freezer` est REQUIS",
  );
  assertThrows(
    () => offerableCookingSessions({ daysToEat: Number.NaN, freezer: true, maxFridgeDays: 3 }),
    Error,
    "daysToEat non fini",
  );
  for (const maxFridgeDays of [0, -1, Number.NaN]) {
    assertThrows(
      () => offerableCookingSessions({ daysToEat: 7, freezer: true, maxFridgeDays }),
      Error,
      "`maxFridgeDays` est REQUIS",
    );
  }
});

// ---------------------------------------------------------------------------
// 5. L'OFFRE DE TEMPS ET L'EFFORT
// ---------------------------------------------------------------------------

Deno.test("l'offre de temps — les durées qui suffisent, et toutes les plus longues", () => {
  const out = offerableSessionTimes({ daysToEat: 7, sessions: 2, mealsPerDay: 2 });
  assertEquals(out.minimum, 80);
  assertEquals(out.values, [90, 120, 150]);
  assertEquals(out.shortest, 90);
  assertEquals(out.daysPerSession, 4);
  // Une durée qui tombe PILE sur le minimum est proposée: 6 jours en 1 session.
  assertEquals(offerableSessionTimes({ daysToEat: 6, sessions: 1, mealsPerDay: 2 }).values, [120, 150]);
  // Tout est proposé quand chaque session couvre un jour.
  assertEquals(offerableSessionTimes({ daysToEat: 3, sessions: 3, mealsPerDay: 2 }).values, [...SESSION_TIME_BOUNDS]);
  // ⟳ 2026-09-25 — sept jours en une session: une seule durée reste.
  assertEquals(offerableSessionTimes({ daysToEat: 7, sessions: 1, mealsPerDay: 2 }).values, [150]);
});

Deno.test("l'offre de temps — JAMAIS vide, même au-delà de 2 h 30", () => {
  const out = offerableSessionTimes({ daysToEat: 7, sessions: 1, mealsPerDay: 6 });
  assert(out.minimum > 150);
  assertEquals(out.values, [150]);
  assertEquals(out.shortest, 150);
});

Deno.test("la durée qui atteint une durée", () => {
  assertEquals(sessionTimeBoundFor(1), 30);
  assertEquals(sessionTimeBoundFor(60), 60);
  assertEquals(sessionTimeBoundFor(72), 90);
  assertEquals(sessionTimeBoundFor(140), 150);
  assertEquals(sessionTimeBoundFor(500), 150);
});

Deno.test("l'effort — la marge entre le temps choisi et le minimum", () => {
  assertEquals(cookingEffort(149, 100), "simple");
  assertEquals(cookingEffort(150, 100), "normal");
  assertEquals(cookingEffort(299, 100), "normal");
  assertEquals(cookingEffort(300, 100), "keen");
  // Les deux exemples de l'en-tête: sept jours, déjeuner et dîner.
  assertEquals(plan({ sessions: 1, minutes: 150 }).effort, "simple");
  assertEquals(plan({ sessions: 4, minutes: 150 }).effort, "keen");
  assertThrows(() => cookingEffort(Number.NaN, 10), Error, "cookingEffort");
});

// ---------------------------------------------------------------------------
// 6. LA DÉRIVATION — elle sert ce que l'écran propose, et relève le reste
// ---------------------------------------------------------------------------

Deno.test("⛔ MIROIR — tout ce que l'écran propose, le moteur le sert tel quel", () => {
  // Le test qui dit pourquoi les offres vivent dans CE fichier: une option
  // proposée que le plan ne suivrait pas est exactement le défaut du
  // 2026-09-04, déplacé sur deux nouvelles questions.
  for (let days = 1; days <= 7; days++) {
    for (const freezer of [true, false, null] as const) {
      const sessionsOffer = offerableCookingSessions({ daysToEat: days, freezer, maxFridgeDays: 3 });
      for (const sessions of sessionsOffer.values) {
        const times = offerableSessionTimes({ daysToEat: days, sessions, mealsPerDay: 2 });
        for (const minutes of times.values) {
          const out = deriveCookingPlan({
            sessions,
            minutes,
            mealsPerDay: 2,
            runs: 2,
            freezer,
            windowDays: NO_LEAD.slice(0, days),
            leadDay: false,
            daysToEat: days,
            maxFridgeDays: 3,
          });
          const où = `${days}j/${sessions}s/${minutes}min/freezer=${freezer}`;
          assertEquals(out.sessions, sessions, où);
          assertEquals(out.sessionMinutes, minutes, où);
          assertEquals(out.cookDays.length, sessions, `${où}: un jour par session`);
          assert(!out.notes.includes("sessions_need_freezer"), où);
          assert(!out.notes.includes("time_raised_to_minimum"), où);
          assert(!out.notes.includes("days_cap_sessions"), où);
          assertEquals(out.difficulty, COOKING_EFFORT_PROFILE[out.effort].difficulty, où);
          assertEquals(out.variety, COOKING_EFFORT_PROFILE[out.effort].variety, où);
        }
      }
    }
  }
});

Deno.test("une session unique sans congélateur sur sept jours est RELEVÉE, et c'est dit", () => {
  for (const freezer of [false, null] as const) {
    const out = plan({ sessions: 1, minutes: 60, freezer });
    assertEquals(out.sessions, 3, `freezer=${freezer}`);
    assert(out.notes.includes("sessions_need_freezer"), `freezer=${freezer}`);
    assertEquals(out.usesFreezer, false);
  }
  // Avec congélateur, elle est servie — et le plan s'appuie sur lui.
  const ok = plan({ sessions: 1, minutes: 150 });
  assertEquals(ok.sessions, 1);
  assertEquals(ok.notes.filter((n) => n === "sessions_need_freezer"), []);
  assertEquals(ok.usesFreezer, true);
});

Deno.test("une session unique qui tient au frigo ne s'appuie PAS sur le congélateur", () => {
  // ⟳ 2026-09-25 — avant, `sessions === 1` suffisait: deux jours en une
  // session, congélateur déclaré, faisaient congeler un plat qui tenait au frigo.
  const two = plan({
    sessions: 1,
    minutes: 60,
    runs: 1,
    windowDays: ["mon", "tue"],
    leadDay: false,
    daysToEat: 2,
  });
  assertEquals(two.sessions, 1);
  assertEquals(two.usesFreezer, false);
  // Sans congélateur, la même session est servie: le frigo suffit.
  assertEquals(plan({ sessions: 1, minutes: 60, runs: 1, freezer: false, windowDays: ["mon", "tue"], leadDay: false, daysToEat: 2 }).sessions, 1);
});

Deno.test("une durée trop courte est RELEVÉE à la plus courte qui suffit, et c'est dit", () => {
  const out = plan({ sessions: 1, minutes: 30 });
  assertEquals(out.minimumMinutes, 140);
  assertEquals(out.sessionMinutes, 150);
  assert(out.notes.includes("time_raised_to_minimum"));
  // Au ras du minimum, l'effort est `simple`: recettes courtes, plats répétés.
  assertEquals(out.effort, "simple");
  assertEquals(out.difficulty, "simple");
  assertEquals(out.variety, "repeat");
});

Deno.test("plus de sessions que de jours: la fenêtre plafonne, et c'est dit", () => {
  const out = plan({ sessions: 4, windowDays: ["mon", "tue"], leadDay: false, daysToEat: 2 });
  assertEquals(out.sessions, 2);
  assert(out.notes.includes("days_cap_sessions"));
});

Deno.test("« une seule course » exige le congélateur, et pousse les COURSES", () => {
  for (const freezer of [false, null] as const) {
    const out = plan({ runs: 1, freezer });
    assertEquals(out.runs, 2, `freezer=${freezer}: il faut y retourner`);
    assertEquals(out.sessions, 3, `freezer=${freezer}: les sessions ne bougent pas`);
    assert(out.notes.includes("runs_1_needs_freezer"), `freezer=${freezer}`);
    assertEquals(out.usesFreezer, false);
  }
  // La configuration que le LOT C a ouverte: une course, trois sessions.
  const ok = plan({ runs: 1, freezer: true });
  assertEquals(ok.runs, 1);
  assertEquals(ok.sessions, 3);
  assertEquals(ok.notes, []);
  assertEquals(ok.usesFreezer, true);
});

Deno.test("⛔ L'INVARIANT `runs <= sessions`, par ÉNUMÉRATION", () => {
  for (let days = 1; days <= 7; days++) {
    for (const runs of GROCERY_RUNS) {
      for (const sessions of COOKING_SESSION_COUNTS) {
        for (const freezer of [true, false, null] as const) {
          const out = deriveCookingPlan({
            sessions,
            minutes: 120,
            mealsPerDay: 2,
            runs,
            freezer,
            windowDays: NO_LEAD.slice(0, days),
            leadDay: false,
            daysToEat: days,
            maxFridgeDays: 3,
          });
          const où = `${sessions}s/${days}j/${runs}c/freezer=${freezer}`;
          assert(out.runs <= out.sessions, `${où}: ${out.runs} courses > ${out.sessions} sessions`);
          assert(out.runs >= 1 && out.sessions >= 1, où);
          assert(out.sessions <= MAX_COOKING_SESSIONS, où);
          if (out.runs < runs && !out.notes.includes("runs_1_needs_freezer")) {
            assert(out.notes.includes("runs_capped_by_sessions"), `${où}: raboté sans le dire`);
          }
          // Jamais un jour de cuisine en double, jamais hors fenêtre.
          assertEquals(new Set(out.cookDays).size, out.cookDays.length, `${où}: jour en double`);
          for (const day of out.cookDays) assert(NO_LEAD.slice(0, days).includes(day), où);
        }
      }
    }
  }
});

Deno.test("les COURSES ne décident pas des sessions", () => {
  const une = plan({ runs: 1 });
  const deux = plan({ runs: 2 });
  const trois = plan({ runs: 3 });
  assertEquals(une.sessions, deux.sessions);
  assertEquals(deux.sessions, trois.sessions);
  assertEquals(une.cookDays, trois.cookDays);
});

Deno.test("l'écart de courses compte ce que le PLAN organise, pas le congélateur manquant", () => {
  const capped = plan({ sessions: 2, minutes: 120, runs: 3 });
  assertEquals(capped.runs, 2);
  assert(capped.notes.includes("runs_capped_by_sessions"));
  assertEquals(unusedGroceryRuns(3, capped), 1);
  // « Une course demandée, deux servies » a son propre nom.
  const noFreezer = plan({ runs: 1, freezer: false });
  assertEquals(noFreezer.runs, 2);
  assertEquals(unusedGroceryRuns(1, noFreezer), 0);
});

Deno.test("la PREMIÈRE session est au rang 0, donc la VEILLE quand il y en a une", () => {
  for (const sessions of COOKING_SESSION_COUNTS) {
    assertEquals(plan({ sessions, minutes: 150 }).cookDays[0], WITH_LEAD[0], `${sessions}s`);
  }
  assertEquals(plan({ windowDays: NO_LEAD, leadDay: false }).cookDays[0], "mon");
});

Deno.test("les sessions suivantes découpent les jours MANGÉS", () => {
  // Veille au rang 0, 7 jours mangés: rang 1 + ⌊i × 7 ÷ n⌋.
  assertEquals(plan({ sessions: 2, minutes: 120 }).cookDays, ["sun", "thu"]);
  assertEquals(plan({ sessions: 3 }).cookDays, ["sun", "wed", "fri"]);
  assertEquals(plan({ sessions: 4, minutes: 60 }).cookDays, ["sun", "tue", "thu", "sat"]);
});

Deno.test("`longestFridgeStretch` mesure la découpe, il ne la juge pas", () => {
  // `sun` au rang 0, `thu` au rang 4, fenêtre de 8: 8 − 4 = 4 jours.
  assertEquals(longestFridgeStretch(plan({ sessions: 2, minutes: 120 }), WITH_LEAD), 4);
  const one = plan({ sessions: 1, minutes: 60, daysToEat: 1 });
  assertEquals(one.sessions, 1);
  assertEquals(longestFridgeStretch(one, WITH_LEAD), 8);
});

Deno.test("les gardes d'entrée — un oubli JETTE", () => {
  assertThrows(() => plan({ freezer: undefined as never }), Error, "freezer");
  assertThrows(() => plan({ leadDay: undefined as never }), Error, "leadDay");
  for (const sessions of [0, 5, 2.5]) {
    assertThrows(() => plan({ sessions: sessions as CookingSessionCount }), Error, "sessions hors");
  }
  assertThrows(() => plan({ minutes: 45 as SessionTimeBound }), Error, "minutes hors plages");
  for (const mealsPerDay of [0, Number.NaN]) {
    assertThrows(() => plan({ mealsPerDay }), Error, "mealsPerDay est REQUIS");
  }
  assertThrows(() => plan({ runs: 0 as GroceryRuns }), Error, "runs hors");
});

// ---------------------------------------------------------------------------
// 7. LA CAPACITÉ SERVIE — ce que le prompt reçoit
// ---------------------------------------------------------------------------

Deno.test("les trois leviers dérivés atteignent la capacité SERVIE", () => {
  // ⛔ DES VALEURS DÉCLARÉES QUI CONTREDISENT LA DÉRIVATION, exprès: si elle ne
  // mordait pas, ce sont elles qui ressortiraient. Un `...spread` rend ces
  // champs invisibles à `grep`; seul ce test les suit jusqu'au bout.
  const served = resolveCookingCapacity({
    declared: { ...DECLARED, cookingTimeMin: 30, recipeDifficulty: "keen", variety: "varied", budgetAmount: 42 },
    sessions: 4,
    runs: 2,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    mealsPerDay: 2,
    maxFridgeDays: 3,
  });
  // Quatre sessions sur sept jours: deux jours par session, minimum 30 min,
  // « 30 min » ⇒ marge ×1 ⇒ `simple`.
  assertEquals(served.cookingTimeMin, 30);
  assertEquals(served.recipeDifficulty, "simple");
  assertEquals(served.variety, "repeat");
  assertEquals(served.plan?.sessions, 4);
  // ⚠️ ET LE BUDGET TRAVERSE INTACT.
  assertEquals(served.budgetAmount, 42);
});

Deno.test("sans une des trois réponses, les leviers déclarés ressortent INTACTS", () => {
  const declared = { cookDays: ["mon"], cookingTimeMin: 45, recipeDifficulty: "normal", variety: "some", budgetAmount: 42 };
  const base = {
    declared,
    sessions: 3 as CookingSessionCount | null,
    runs: 2 as GroceryRuns | null,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    mealsPerDay: 2,
    maxFridgeDays: 3,
  };
  for (
    const over of [
      { sessions: null },
      { runs: null },
      { declared: { ...declared, cookingTimeMin: null } },
    ]
  ) {
    const served = resolveCookingCapacity({ ...base, ...over });
    assertEquals(served.plan, null, JSON.stringify(over));
    assertEquals(served.recipeDifficulty, "normal");
    assertEquals(served.variety, "some");
    assertEquals(served.cookDays, ["mon"]);
  }
});

Deno.test("« peu importe » se résout contre l'offre, sessions comprises", () => {
  const served = resolveCookingCapacity({
    declared: DECLARED,
    sessions: 2,
    runs: GROCERY_RUNS_ANY,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    mealsPerDay: 2,
    maxFridgeDays: 3,
  });
  // Deux sessions ⇒ deux courses au plus: le haut de l'offre, et aucune note
  // « raboté » — personne n'a rien demandé.
  assertEquals(served.plan?.runs, 2);
  assertEquals(served.plan?.notes.includes("runs_capped_by_sessions"), false);
});

// ===========================================================================
// 8. L'OFFRE DE COURSES — bornée par les sessions choisies
// ===========================================================================

const offer = (over: Partial<Parameters<typeof offerableGroceryRuns>[0]> = {}) =>
  offerableGroceryRuns({
    sessions: null,
    daysToEat: 7,
    maxFridgeDays: 3,
    // AVEC congélateur par défaut: c'est le cas qui garde la liste entière.
    freezer: true,
    ...over,
  });

Deno.test("l'offre de courses — sans contrainte, LES TROIS, et aucun motif", () => {
  const out = offer();
  assertEquals(out.values, [1, 2, 3]);
  assertEquals(out.forced, null);
  assertEquals(out.limit, null);
  // Quatre sessions ne plafonnent rien: le plafond des courses est trois.
  assertEquals(offer({ sessions: 4 }).values, [1, 2, 3]);
  assertEquals(offer({ sessions: 3 }).limit, null);
});

Deno.test("l'offre de courses — pas plus de courses que de sessions, et c'est nommé", () => {
  const two = offer({ sessions: 2 });
  assertEquals(two.values, [1, 2]);
  assertEquals(two.limit, "sessions");
  const one = offer({ sessions: 1 });
  assertEquals(one.values, [1]);
  assertEquals(one.forced, 1);
  assertEquals(one.limit, "one_session");
});

Deno.test("l'offre de courses — le plafond de fenêtre est la CONSERVATION, pas le compte de jours", () => {
  for (const daysToEat of [1, 2, 3]) {
    const out = offer({ daysToEat });
    assertEquals(out.values, [1], `${daysToEat} jours`);
    assertEquals(out.limit, "days", `${daysToEat} jours`);
  }
  for (const daysToEat of [4, 5, 6]) {
    assertEquals(offer({ daysToEat }).values, [1, 2], `${daysToEat} jours`);
    assertEquals(offer({ daysToEat }).limit, "days", `${daysToEat} jours`);
  }
  // ⛔ À ÉGALITÉ, LA FENÊTRE GAGNE: deux sessions et cinq jours plafonnent tous
  // les deux à 2, et c'est la fenêtre qu'on nomme.
  assertEquals(offer({ sessions: 2, daysToEat: 5 }).limit, "days");
});

Deno.test("l'offre de courses — MUTATION: la conservation est LUE, jamais recopiée", () => {
  assertEquals(offer({ daysToEat: 2, maxFridgeDays: 1 }).values, [1, 2]);
  for (const daysToEat of [1, 4, 7]) {
    assertEquals(offer({ daysToEat, maxFridgeDays: 7 }).values, [1], `${daysToEat}j`);
  }
  assertEquals(offer({ freezer: false, daysToEat: 2, maxFridgeDays: 1 }).values, [2]);
});

Deno.test("l'offre de courses — sans congélateur, « une course » sort au-delà de la conservation", () => {
  for (const freezer of [false, null] as const) {
    for (const daysToEat of [4, 5, 6]) {
      const out = offer({ freezer, daysToEat });
      assertEquals(out.values, [2], `${freezer}/${daysToEat}j`);
      // ⟳ 2026-09-25 — le motif est la fenêtre (deux courses suffisent), plus
      // le congélateur: « Combien de fois tu veux cuisiner » le dit déjà.
      assertEquals(out.limit, "days");
    }
    assertEquals(offer({ freezer, daysToEat: 7 }).values, [2, 3]);
    for (const daysToEat of [1, 2, 3]) {
      assertEquals(offer({ freezer, daysToEat }).values, [1], `${freezer}/${daysToEat}j`);
    }
  }
});

// ⟳ 2026-09-25 — « un motif dès que le HAUT est raboté ». Le congélateur qui
// retire « Une fois » n'a plus de motif sous Courses; une réponse imposée en a
// toujours un, puisque c'est la phrase affichée sous elle.
Deno.test("l'offre de courses — JAMAIS vide, et un motif dès que le haut est raboté", () => {
  for (const sessions of [null, ...COOKING_SESSION_COUNTS] as const) {
    for (const freezer of [true, false, null] as const) {
      for (const daysToEat of [-3, 0, 1, 2, 5, 7, 40]) {
        const out = offer({ sessions, daysToEat, freezer });
        const où = JSON.stringify({ sessions, freezer, daysToEat, out });
        assert(out.values.length >= 1, où);
        assertEquals(
          out.limit === null,
          out.values[out.values.length - 1] === GROCERY_RUNS[GROCERY_RUNS.length - 1],
          où,
        );
        if (out.forced !== null) assert(out.limit !== null, où);
        assertEquals(out.forced, out.values.length === 1 ? out.values[0] : null, où);
        if (sessions !== null) assert(out.values[out.values.length - 1] <= sessions, où);
      }
    }
  }
});

Deno.test("⛔ MIROIR — toute cadence proposée est celle que le plan organise", () => {
  for (let daysToEat = 1; daysToEat <= 7; daysToEat++) {
    for (const freezer of [true, false] as const) {
      const sessionsOffer = offerableCookingSessions({ daysToEat, freezer, maxFridgeDays: 3 });
      for (const sessions of sessionsOffer.values) {
        const out = offerableGroceryRuns({ sessions, daysToEat, maxFridgeDays: 3, freezer });
        for (const runs of out.values) {
          const derived = deriveCookingPlan({
            sessions,
            minutes: 150,
            mealsPerDay: 2,
            runs,
            freezer,
            windowDays: NO_LEAD.slice(0, daysToEat),
            leadDay: false,
            daysToEat,
            maxFridgeDays: 3,
          });
          const où = `${sessions}s/${daysToEat}j/${runs}c/freezer=${freezer}`;
          assertEquals(derived.runs, runs, où);
          assertEquals(unusedGroceryRuns(runs, derived), 0, où);
        }
      }
    }
  }
});

Deno.test("l'offre de courses — REFUSE une entrée qui désarmerait la garde", () => {
  assertThrows(() => offer({ daysToEat: Number.NaN }), Error, "daysToEat non fini");
  for (const maxFridgeDays of [0, -1, Number.NaN]) {
    assertThrows(() => offer({ maxFridgeDays }), Error, "`maxFridgeDays` est REQUIS");
  }
  assertThrows(() => offer({ sessions: Number.NaN }), Error, "`sessions` est REQUIS");
  assertThrows(() => offer({ freezer: undefined as never }), Error, "`freezer` est REQUIS");
});

// ===========================================================================
// L'INVARIANT DONT LES OFFRES DÉPENDENT — et il vit dans un AUTRE module
// ===========================================================================
//
// Les offres reçoivent `daysToEat` = LA FENÊTRE DEMANDÉE (ce que l'écran a
// saisi), pas les jours réellement mangés. Ce n'est juste que si le serveur ne
// peut que RÉDUIRE les jours mangés. Deux gestes touchent la fenêtre servie,
// dans `meal_plan_window.ts`:
//
//   `withCookDayBefore`     durationDays +1  ET  cookOnlyDay = ce jour-là
//   `withoutSpentFirstDay`  durationDays −1
//   daysToEat = durationDays − (cookOnlyDay === null ? 0 : 1)
//
// ⛔ Le geste qui casserait l'hypothèse est CONNU — un lot qui ALLONGERAIT la
// fenêtre mangée — et il ne toucherait aucun fichier de ce lot. Ce test-ci
// rougirait.

Deno.test("INVARIANT VOISIN — les jours MANGÉS ne dépassent jamais les jours DEMANDÉS", () => {
  const today = "2026-09-04";
  const slots = ["breakfast", "lunch", "dinner"];

  for (let requested = 1; requested <= MAX_WINDOW_DAYS; requested++) {
    const tomorrow = addDays(today, 1);
    const ahead = withCookDayBefore(
      { startsOn: tomorrow, durationDays: requested },
      { asked: true, today },
    );
    const eatenAhead = ahead.durationDays - (ahead.cookOnlyDay === null ? 0 : 1);
    assertEquals(eatenAhead, requested, `veille accordée sur ${requested}j: les jours mangés ont bougé`);

    const spent = withoutSpentFirstDay(
      { startsOn: today, durationDays: requested },
      {
        today,
        cookOnlyDay: null,
        declaredSlots: slots,
        passedSlots: slots,
        heldSlots: [],
        shoppingCutoffReached: false,
      },
    );
    assert(spent.durationDays <= requested, `journée dépensée sur ${requested}j: la fenêtre a GRANDI`);

    // ⛔ LES DEUX SE RENCONTRENT: quand la veille est accordée, `startsOn`
    // DEVIENT aujourd'hui, et `withoutSpentFirstDay` reçoit alors un jour de
    // cuisine. Sa garde `cook_day` est ce qui empêche la fenêtre de le manger.
    if (requested + 1 <= MAX_WINDOW_DAYS) {
      const ahead2 = withCookDayBefore(
        { startsOn: tomorrow, durationDays: requested },
        { asked: true, today },
      );
      assertEquals(ahead2.refused, null, `veille refusée sur ${requested}j`);
      assertEquals(ahead2.startsOn, today, "la veille n'a pas reculé la fenêtre");
      const met = withoutSpentFirstDay(
        { startsOn: ahead2.startsOn, durationDays: ahead2.durationDays },
        {
          today,
          cookOnlyDay: ahead2.cookOnlyDay,
          declaredSlots: slots,
          passedSlots: slots,
          heldSlots: [],
          shoppingCutoffReached: false,
        },
      );
      assertEquals(met.refused, "cook_day", `la garde du piège n'a pas tiré sur ${requested}j`);
      assertEquals(met.durationDays, ahead2.durationDays, "la fenêtre a rétréci quand même");
    }

    // ⛔ L'ASSERTION QUI COMPTE: une offre calculée sur la DEMANDE n'est jamais
    // plus ÉTROITE que celle calculée sur les jours servis.
    for (const served of [eatenAhead, spent.durationDays]) {
      const asked = offerableGroceryRuns({ sessions: null, daysToEat: requested, maxFridgeDays: 3, freezer: true });
      const real = offerableGroceryRuns({ sessions: null, daysToEat: served, maxFridgeDays: 3, freezer: true });
      assert(asked.values.length >= real.values.length, `${requested}j demandés / ${served}j servis: courses`);
      const askedSessions = offerableCookingSessions({ daysToEat: requested, freezer: true, maxFridgeDays: 3 });
      const realSessions = offerableCookingSessions({ daysToEat: served, freezer: true, maxFridgeDays: 3 });
      assert(
        askedSessions.values.length >= realSessions.values.length,
        `${requested}j demandés / ${served}j servis: sessions`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// ⟳ LOT 3 (2026-09-06) — LES JOURS DE CUISINE DÉCLARÉS PLACENT LES SESSIONS
// ---------------------------------------------------------------------------

Deno.test("LOT 3 — « je cuisine le dimanche » pose UNE session, le dimanche, même quand la réponse en demandait trois", () => {
  const out = plan({ declaredCookDays: ["sun"] });
  assertEquals(out.sessions, 1);
  assertEquals(out.cookDays, ["sun"]);
  assert(out.notes.includes("cook_days_declared"));
  assertEquals(out.runs, 1);
  assert(out.notes.includes("runs_capped_by_sessions"));
  // Une session unique sur sept jours, congélateur déclaré: il sert.
  assertEquals(out.usesFreezer, true);
  // Et la durée choisie (2 h) ne suffit plus à une session unique.
  assertEquals(out.sessionMinutes, 150);
  assert(out.notes.includes("time_raised_to_minimum"));
});

Deno.test("LOT 3 — deux jours déclarés = deux sessions, dans l'ordre de la FENÊTRE", () => {
  const out = plan({ declaredCookDays: ["thu", "sun"] });
  assertEquals(out.sessions, 2);
  assertEquals(out.cookDays, ["sun", "thu"]);
  assertEquals(out.runs, 2);
  assert(!out.notes.includes("runs_capped_by_sessions"));
});

Deno.test("LOT 3 — cinq jours déclarés sont bornés au maximum de sessions, et c'est dit", () => {
  const out = plan({ declaredCookDays: ["mon", "tue", "wed", "fri", "sat"] });
  assertEquals(out.sessions, 4);
  assertEquals(out.cookDays, ["mon", "tue", "wed", "fri"]);
  assert(out.notes.includes("cook_days_declared"));
});

Deno.test("LOT 3 — un jour déclaré HORS fenêtre ne dérègle rien, et l'écart est nommé", () => {
  const window = { windowDays: ["mon", "tue", "wed"] as DayToken[], daysToEat: 3, leadDay: false };
  const out = plan({ ...window, declaredCookDays: ["sun"] });
  const derived = plan(window);
  assertEquals(out.sessions, derived.sessions);
  assertEquals(out.cookDays, derived.cookDays);
  assert(out.notes.includes("cook_days_out_of_window"));
  assert(!out.notes.includes("cook_days_declared"));
});

Deno.test("LOT 3 — sans jour déclaré, la dérivation est rendue octet pour octet", () => {
  assertEquals(plan({ declaredCookDays: [] }), plan({}));
  assertEquals(plan({ declaredCookDays: ["dimanche", "lundi"] }), plan({}), "un jeton inconnu est ignoré");
});

Deno.test("LOT 3 — `resolveCookingCapacity` fait ENTRER les jours déclarés dans la dérivation", () => {
  const out = resolveCookingCapacity({
    declared: { ...DECLARED, cookDays: ["sun"] },
    sessions: 3,
    runs: 2,
    freezer: true,
    windowDays: WITH_LEAD,
    leadDay: true,
    daysToEat: 7,
    mealsPerDay: 2,
    maxFridgeDays: 3,
  });
  assertEquals(out.cookDays, ["sun"]);
  assertEquals(out.plan?.sessions, 1);
  assert(out.plan?.notes.includes("cook_days_declared"));
});

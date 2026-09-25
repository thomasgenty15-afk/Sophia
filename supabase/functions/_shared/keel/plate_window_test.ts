import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  effectiveRawWindowDays,
  PLATE_WINDOW_DAYS,
  plateWindowDaysFor,
} from "./fridge_window.ts";
import {
  planGroceryWaves,
  plateWindowReport,
  type WavePreparation,
  waveNeedsFromPlan,
} from "./grocery_waves.ts";
import { MIN_DAYS_BETWEEN_SHOPS } from "./shopping_purchases.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-25 — LA CHAÎNE ACHAT → ASSIETTE, ET LES COURSES DEMANDÉES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le décor est le brouillon réel `a0481b9c`: cinq jours à partir du vendredi
 * 2026-09-25, deux sessions (vendredi, dimanche), deux courses demandées, pas
 * de congélateur. Chaque garde vérifiait son morceau — achat → cuisson, cuisson
 * → repas — et un filet de porc acheté vendredi, cuisiné dimanche, se mangeait
 * mardi. L'écran avait promis deux courses; le plan n'en faisait qu'une.
 */

const FRIDAY = "2026-09-25";

type Line = {
  term: string;
  aisle: string;
  food_group: string | null;
  ref: string | null;
  buy_on?: string | null;
};
const line = (term: string, aisle: string, food_group: string): Line => ({
  term,
  aisle,
  food_group,
  ref: null,
});

// Les casseroles du plan, avec les jours où un repas en mange.
const A0481B9C: WavePreparation[] = [
  { id: "prep_chicken_pepper", cookOn: "fri", ingredientTerms: ["blanc de poulet"], eatenOn: ["fri", "sat"] },
  { id: "prep_rice", cookOn: "fri", ingredientTerms: ["riz blanc"], eatenOn: ["fri", "sat"] },
  { id: "prep_turkey", cookOn: "sun", ingredientTerms: ["escalope de dinde"], eatenOn: ["sun", "mon"] },
  { id: "prep_pork", cookOn: "sun", ingredientTerms: ["filet de porc", "carotte"], eatenOn: ["sun", "tue"] },
  { id: "prep_thigh", cookOn: "sun", ingredientTerms: ["haut de cuisse de poulet"], eatenOn: ["mon", "tue"] },
];
const A0481B9C_LIST = (): Line[] => [
  line("blanc de poulet", "protein", "poultry"),
  line("riz blanc", "grains", "refined_grain"),
  line("escalope de dinde", "protein", "poultry"),
  line("filet de porc", "protein", "red_meat"),
  line("carotte", "produce", "non_starchy_veg"),
  line("haut de cuisse de poulet", "protein", "poultry"),
];
const byDay = (waves: { buyOn: string; items: Line[] }[]) =>
  Object.fromEntries(waves.map((w) => [w.buyOn, w.items.map((i) => i.term).sort()]));

Deno.test("la table achat → assiette est épinglée EN ENTIER, et ne couvre que la chair", () => {
  assertEquals(PLATE_WINDOW_DAYS, {
    fatty_fish: 2,
    white_fish: 2,
    shellfish: 2,
    poultry: 3,
    lean_protein: 3,
    red_meat: 3,
  });
  // Un légume n'a pas de limite de chaîne: ses deux fenêtres séparées suffisent.
  assertEquals(plateWindowDaysFor("non_starchy_veg"), null);
  assertEquals(plateWindowDaysFor(null), null);
});

Deno.test("la fenêtre crue qui reste = min(cru, assiette − jours de repas après cuisson)", () => {
  // Le porc du plan: cru 2 jours, mangé 2 jours après sa cuisson ⇒ 1 jour.
  assertEquals(effectiveRawWindowDays({ raw: 2, group: "red_meat", eatSpan: 2 }), 1);
  // Mangé le jour de sa cuisson: la fenêtre crue seule mord.
  assertEquals(effectiveRawWindowDays({ raw: 2, group: "red_meat", eatSpan: 0 }), 2);
  // Un poisson mangé deux jours après: acheté le jour de la cuisson.
  assertEquals(effectiveRawWindowDays({ raw: 1, group: "white_fish", eatSpan: 2 }), 0);
  // Jours de repas inconnus: rien n'est supposé.
  assertEquals(effectiveRawWindowDays({ raw: 2, group: "red_meat", eatSpan: null }), 2);
  // Congelé à l'achat ou de conserve: rien ne fait attendre, et ça reste vrai.
  assertEquals(effectiveRawWindowDays({ raw: null, group: "red_meat", eatSpan: 2 }), null);
  // Un groupe sans limite de chaîne garde sa fenêtre crue.
  assertEquals(effectiveRawWindowDays({ raw: 7, group: "non_starchy_veg", eatSpan: 3 }), 7);
});

Deno.test("les besoins du plan portent les jours de repas de chaque casserole", () => {
  const needs = waveNeedsFromPlan({
    preparations: [
      { id: "p1", cook_on: "sun", ingredients: [{ term: "filet de porc" }] },
      { id: "p2", cook_on: "fri", ingredients: [{ term: "riz" }] },
    ],
    dishes: [
      { day: "sun", uses: [{ preparation_id: "p1" }], ingredients: [] },
      { day: "tue", uses: [{ preparation_id: "p1" }], ingredients: [] },
      { day: "sat", uses: [], ingredients: [{ term: "pomme" }] },
    ],
  });
  assertEquals(needs.find((n) => n.id === "p1")?.eatenOn, ["sun", "tue"]);
  // Une casserole qu'aucun plat ne cite: on SAIT qu'aucun repas n'en mange.
  assertEquals(needs.find((n) => n.id === "p2")?.eatenOn, []);
  assertEquals(needs.find((n) => n.id === "dish:2")?.eatenOn, ["sat"]);
});

Deno.test("⛔ `a0481b9c` — AVANT: une course, et la garde voit deux chaînes trop longues", () => {
  // Sans les jours de repas ni la cadence (le comportement d'avant), tout
  // s'achète vendredi.
  const blind = A0481B9C.map(({ eatenOn: _, ...prep }) => prep);
  const list = A0481B9C_LIST();
  const waves = planGroceryWaves({
    startsOn: FRIDAY,
    durationDays: 5,
    shoppingList: list,
    preparations: blind,
    runs: null,
    freezer: false,
  });
  assertEquals(waves.map((w) => w.buyOn), [FRIDAY]);
  // La garde, relue avec les jours de repas, nomme ce que toutes les autres
  // laissaient passer.
  const report = plateWindowReport({
    startsOn: FRIDAY,
    durationDays: 5,
    shoppingList: list.map((l) => ({ ...l, buy_on: FRIDAY })),
    preparations: A0481B9C,
  });
  assertEquals(
    report.breaches.map((b) => `${b.term} ${b.buyOn}→${b.lastEat} ${b.days}>${b.limit}`).sort(),
    [
      "filet de porc 2026-09-25→2026-09-29 4>3",
      "haut de cuisse de poulet 2026-09-25→2026-09-29 4>3",
    ],
  );
});

Deno.test("⛔ `a0481b9c` — APRÈS: deux courses, la viande de dimanche achetée dimanche matin", () => {
  const list = A0481B9C_LIST();
  const waves = planGroceryWaves({
    startsOn: FRIDAY,
    durationDays: 5,
    shoppingList: list,
    preparations: A0481B9C,
    runs: 2,
    freezer: false,
  });
  // ⟳ 2026-09-25 (soir) — les deux courses choisies, aux jours que la consigne
  // a dits au modèle: vendredi, et dimanche matin (samedi est à moins de
  // deux jours de vendredi). La carotte (7 jours) reste à la grosse course.
  assertEquals(byDay(waves), {
    "2026-09-25": ["blanc de poulet", "carotte", "riz blanc"],
    "2026-09-27": ["escalope de dinde", "filet de porc", "haut de cuisse de poulet"],
  });
  const dated = waves.flatMap((w) => w.items.map((i) => ({ ...i, buy_on: w.buyOn })));
  const report = plateWindowReport({
    startsOn: FRIDAY,
    durationDays: 5,
    shoppingList: dated,
    preparations: A0481B9C,
  });
  assertEquals(report.breaches, []);
  // ⚠️ LES TROIS POPULATIONS: la chair a été jugée, le reste non — pas de
  // limite pour le riz ou la carotte.
  assertEquals(report.within, 4);
  assertEquals(report.unjudged, 2);
});

// ── LES COURSES DEMANDÉES SONT DES COURSES FAITES ────────────────────────────

const MONDAY = "2026-09-21";
const salads = (cookOn: string): WavePreparation[] => [
  { id: "p1", cookOn: "mon", ingredientTerms: ["riz"], eatenOn: ["mon"] },
  { id: "p2", cookOn, ingredientTerms: ["laitue"], eatenOn: [cookOn] },
];
const saladList = (): Line[] => [
  line("riz", "grains", "refined_grain"),
  line("laitue", "produce", "leafy_greens"),
];

Deno.test("deux courses demandées: la seconde, la veille de la session suivante", () => {
  // Laitue (5 jours) cuisinée jeudi: la conservation seule la laisse à lundi.
  const conservation = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: saladList(),
    preparations: salads("thu"),
    runs: null,
    freezer: false,
  });
  assertEquals(conservation.map((w) => w.buyOn), [MONDAY]);
  // La personne a dit deux courses: mercredi, la veille de jeudi, achète la laitue.
  const asked = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: saladList(),
    preparations: salads("thu"),
    runs: 2,
    freezer: false,
  });
  assertEquals(byDay(asked), { "2026-09-21": ["riz"], "2026-09-23": ["laitue"] });
});

Deno.test("l'écart minimum: la veille trop proche, la course tombe le matin de la session", () => {
  // Session suivante mercredi: sa veille est mardi, le lendemain de la grosse
  // course. ⟳ 2026-09-25 (soir) — « si le user dit 2, c'est 2 »: la seconde
  // course est mercredi matin, avant la cuisson.
  assertEquals(MIN_DAYS_BETWEEN_SHOPS, 2);
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: saladList(),
    preparations: salads("wed"),
    runs: 2,
    freezer: false,
  });
  assertEquals(byDay(waves), { "2026-09-21": ["riz"], "2026-09-23": ["laitue"] });
});

Deno.test("une course ajoutée ne prend que ce qui se gâte: sans rien de fragile, pas de course", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [line("riz", "grains", "refined_grain"), line("pâtes", "grains", "refined_grain")],
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["riz"], eatenOn: ["mon"] },
      { id: "p2", cookOn: "thu", ingredientTerms: ["pâtes"], eatenOn: ["thu"] },
    ],
    runs: 2,
    freezer: false,
  });
  assertEquals(waves.map((w) => w.buyOn), [MONDAY]);
});

Deno.test("⛔ AUCUN ARTICLE NE SORT DE SA FENÊTRE, quand les courses choisies suffisent", () => {
  // ⟳ 2026-09-25 (soir) — une seule course sur sept jours sans congélateur
  // n'est plus proposée (`offerableGroceryRuns`) ni dérivée
  // (`runs_1_needs_freezer`): le cas est tenu à part, juste en dessous.
  for (const runs of [2, 3]) {
    for (const cookOn of ["tue", "wed", "thu", "fri", "sat"]) {
      const waves = planGroceryWaves({
        startsOn: MONDAY,
        durationDays: 7,
        shoppingList: A0481B9C_LIST(),
        preparations: [
          { id: "a", cookOn: "mon", ingredientTerms: ["blanc de poulet", "riz blanc"], eatenOn: ["mon", "tue"] },
          {
            id: "b",
            cookOn,
            ingredientTerms: ["escalope de dinde", "filet de porc", "carotte", "haut de cuisse de poulet"],
            eatenOn: [cookOn],
          },
        ],
        runs,
        freezer: false,
      });
      const dated = waves.flatMap((w) => w.items.map((i) => ({ ...i, buy_on: w.buyOn })));
      const report = plateWindowReport({
        startsOn: MONDAY,
        durationDays: 7,
        shoppingList: dated,
        preparations: [
          { id: "a", cookOn: "mon", ingredientTerms: ["blanc de poulet", "riz blanc"], eatenOn: ["mon", "tue"] },
          {
            id: "b",
            cookOn,
            ingredientTerms: ["escalope de dinde", "filet de porc", "carotte", "haut de cuisse de poulet"],
            eatenOn: [cookOn],
          },
        ],
      });
      assertEquals(report.breaches, [], `${runs} courses, cuisson ${cookOn}`);
      // Et rien n'est acheté APRÈS sa cuisson.
      for (const w of waves) {
        for (const i of w.items) {
          if (i.term === "riz blanc" || i.term === "blanc de poulet") assertEquals(w.buyOn, MONDAY);
        }
      }
      assert(waves.length >= 1);
    }
  }
});

Deno.test("⛔ « SI LE USER DIT 1, C'EST 1 »: le nombre tient, et la garde nomme ce qui en pâtit", () => {
  const preps: WavePreparation[] = [
    { id: "a", cookOn: "mon", ingredientTerms: ["riz blanc"], eatenOn: ["mon"] },
    { id: "b", cookOn: "sat", ingredientTerms: ["filet de porc"], eatenOn: ["sat", "sun"] },
  ];
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [line("riz blanc", "grains", "refined_grain"), line("filet de porc", "protein", "red_meat")],
    preparations: preps,
    runs: 1,
    freezer: false,
  });
  assertEquals(waves.map((w) => w.buyOn), [MONDAY]);
  const report = plateWindowReport({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: waves.flatMap((w) => w.items.map((i) => ({ ...i, buy_on: w.buyOn }))),
    preparations: preps,
  });
  assertEquals(report.breaches.map((b) => b.term), ["filet de porc"]);
});

Deno.test("⛔ `54aec009` — la garde juge chaque achat sur SES repas, pas sur le dernier poulet du plan", () => {
  // Poulet acheté vendredi pour la session de vendredi (mangé ven., sam.),
  // puis dimanche et mardi pour les suivantes. Jugé sur le dernier poulet du
  // plan (jeudi), l'achat du vendredi passait pour « 6 jours ».
  const preps: WavePreparation[] = [
    { id: "p_fri", cookOn: "fri", ingredientTerms: ["haut de cuisse de poulet"], eatenOn: ["fri", "sat"] },
    { id: "p_sun", cookOn: "sun", ingredientTerms: ["haut de cuisse de poulet"], eatenOn: ["sun", "mon"] },
    { id: "p_tue", cookOn: "tue", ingredientTerms: ["haut de cuisse de poulet"], eatenOn: ["tue", "thu"] },
  ];
  const report = plateWindowReport({
    startsOn: FRIDAY,
    durationDays: 7,
    shoppingList: ["2026-09-25", "2026-09-27", "2026-09-29"].map((buy_on) => ({
      ...line("haut de cuisse de poulet", "protein", "poultry"),
      buy_on,
    })),
    preparations: preps,
  });
  assertEquals(report.breaches, []);
  assertEquals(report.within, 3);
});

Deno.test("⛔ `54aec009` — trois sessions, deux courses choisies: deux courses, aux jours dits au modèle", () => {
  const preps: WavePreparation[] = [
    { id: "p_fri", cookOn: "fri", ingredientTerms: ["haut de cuisse de poulet", "riz"], eatenOn: ["fri", "sat"] },
    { id: "p_sun", cookOn: "sun", ingredientTerms: ["escalope de dinde"], eatenOn: ["sun", "mon"] },
    { id: "p_tue", cookOn: "tue", ingredientTerms: ["merlu"], eatenOn: ["tue", "wed", "thu"] },
  ];
  // ⚠️ UN TERME PAR SESSION ICI: un même terme sur plusieurs sessions (le
  // poulet du vrai plan) est daté à sa première cuisson par cette fonction,
  // puis réparti entre les courses par la scission (`splitShoppingByUses`).
  const list = [
    line("haut de cuisse de poulet", "protein", "poultry"),
    line("riz", "grains", "refined_grain"),
    line("escalope de dinde", "protein", "poultry"),
    line("merlu", "protein", "white_fish"),
  ];
  for (const runs of [2, 3]) {
    const waves = planGroceryWaves({
      startsOn: FRIDAY,
      durationDays: 7,
      shoppingList: list,
      preparations: preps,
      runs,
      freezer: false,
    });
    // Deux: vendredi et dimanche. Trois: vendredi, dimanche et mardi — les
    // mêmes que `rawReachLines` (`raw_keeping_test.ts`).
    assertEquals(
      waves.map((w) => w.buyOn),
      runs === 2 ? ["2026-09-25", "2026-09-27"] : ["2026-09-25", "2026-09-27", "2026-09-29"],
      `${runs} courses`,
    );
  }
});

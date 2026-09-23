/**
 * LE BUDGET DES À-CÔTÉS D'UN MOMENT — `sideBudgetFor`.
 * ⟳ 2026-09-23 — vague 0 du chantier « assiettes normales ».
 *
 * ⛔ TOUS LES NOMBRES ATTENDUS SONT EN DUR, calculés à la main dans le
 * commentaire qui les précède — jamais dérivés de la constante testée
 * (`test-parameterized-by-its-own-constant`).
 *
 * ⛔ CHAQUE RÈGLE A UN CAS QUI MORD ET UN CAS QUI PASSE À CÔTÉ.
 *
 * Les trois premiers cas sont les exemples calculés du plan (foyer de
 * l'audit du 2026-09-23): Thomas en prise, Christèle en maintien, Fabrice en
 * perte, au déjeuner. `dishCapKcal` = 632,5 = 550 g × 1,15 kcal/g.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { sideBudgetFor } from "./side_course_budget.ts";
import type { SideCourseBudget, SideCourseSlotInput } from "./side_courses_types.ts";

const EPS = 1e-9;

/** L'invariant du module, sur chaque cas: rien ne se perd, rien ne se crée. */
function assertConserved(meal: number, b: SideCourseBudget): void {
  assertAlmostEquals(b.sideKcal + b.dishKcal, meal, EPS);
  const sum = b.courses.reduce((s, c) => s + c.kcal, 0);
  assertAlmostEquals(sum, b.sideKcal, EPS);
}

function kcalOf(b: SideCourseBudget, kind: string): number[] {
  return b.courses.filter((c) => c.kind === kind).map((c) => c.kcal);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES TROIS EXEMPLES DU PLAN
// ═══════════════════════════════════════════════════════════════════════════

const THOMAS_LUNCH: SideCourseSlotInput = {
  courses: [{ kind: "cheese", baseKcal: 130 }, { kind: "dessert", baseKcal: 180 }],
  growKinds: ["bread", "dessert", "cheese"],
  refused: false,
  capShare: 0.35,
  light: false,
};

Deno.test("Thomas midi — le pain est ajouté jusqu'au plafond de 35 %, le reste déborde", () => {
  // plafond = 0,35 × 1128,67 = 395,0345
  // base = 130 + 180 = 310 → plat 818,67 > 632,5 → besoin 186,17
  // place = 395,0345 − 310 = 85,0345 ≥ 50 → pain ajouté 85,0345
  // à-côté 395,0345 (≈ 395,03) · plat 733,6355 (≈ 733,64) · débordement 101,1355 (≈ 101,14)
  const b = sideBudgetFor({
    mealKcal: 1128.67,
    dishCapKcal: 632.5,
    input: THOMAS_LUNCH,
    isMinor: false,
  });
  assertAlmostEquals(b.sideKcal, 395.0345, 1e-6);
  assertAlmostEquals(b.dishKcal, 733.6355, 1e-6);
  assertAlmostEquals(b.overflowKcal, 101.1355, 1e-6);
  assertAlmostEquals(b.grownKcal, 85.0345, 1e-6);
  assertEquals(b.courses.map((c) => c.kind), ["cheese", "dessert", "bread"]);
  assertEquals(kcalOf(b, "cheese"), [130]);
  assertEquals(kcalOf(b, "dessert"), [180]);
  assertAlmostEquals(kcalOf(b, "bread")[0], 85.0345, 1e-6);
  assertEquals(b.capped, true);
  // Protéines estimées: 130 × 6 / 100 = 7,8 · 180 × 1 / 100 = 1,8 · 85,0345 × 3 / 100 = 2,551035
  assertAlmostEquals(b.courses[0].proteinEstG, 7.8, 1e-9);
  assertAlmostEquals(b.courses[1].proteinEstG, 1.8, 1e-9);
  assertAlmostEquals(b.courses[2].proteinEstG, 2.551035, 1e-6);
  assertConserved(1128.67, b);
});

Deno.test("Christèle midi — fromage et entrée de base, le plat tient: aucune croissance", () => {
  // plafond = 0,35 × 777,6 = 272,16 · base 110 + 60 = 170 → plat 607,6 ≤ 632,5
  const b = sideBudgetFor({
    mealKcal: 777.6,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "cheese", baseKcal: 110 }, { kind: "starter", baseKcal: 60 }],
      growKinds: ["cheese", "starter"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertAlmostEquals(b.sideKcal, 170, EPS);
  assertAlmostEquals(b.dishKcal, 607.6, EPS);
  assertEquals(b.grownKcal, 0);
  assertEquals(b.overflowKcal, 0);
  assertEquals(b.capped, false);
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["cheese", 110], ["starter", 60]]);
  assertConserved(777.6, b);
});

Deno.test("Fabrice midi — entrée et dessert de base, le plat tient", () => {
  // plafond = 0,35 × 722,8 = 252,98 · base 60 + 80 = 140 → plat 582,8 ≤ 632,5
  const b = sideBudgetFor({
    mealKcal: 722.8,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "starter", baseKcal: 60 }, { kind: "dessert", baseKcal: 80 }],
      growKinds: ["starter", "dessert"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertAlmostEquals(b.sideKcal, 140, EPS);
  assertAlmostEquals(b.dishKcal, 582.8, EPS);
  assertEquals(b.grownKcal, 0);
  assertEquals(b.overflowKcal, 0);
  assertEquals(b.capped, false);
  // 60 × 2,5 / 100 = 1,5 · 80 × 1 / 100 = 0,8
  assertAlmostEquals(b.courses[0].proteinEstG, 1.5, EPS);
  assertAlmostEquals(b.courses[1].proteinEstG, 0.8, EPS);
  assertConserved(722.8, b);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE REFUS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("refus — aucun à-côté, le repas entier au plat, le débordement se lit", () => {
  // plat = 1128,67 · débordement = 1128,67 − 632,5 = 496,17
  const b = sideBudgetFor({
    mealKcal: 1128.67,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, refused: true },
    isMinor: false,
  });
  assertEquals(b.courses, []);
  assertEquals(b.sideKcal, 0);
  assertEquals(b.grownKcal, 0);
  assertEquals(b.dishKcal, 1128.67);
  assertAlmostEquals(b.overflowKcal, 496.17, 1e-9);
  assertEquals(b.capped, false);
  assertConserved(1128.67, b);
});

Deno.test("refus — sous le plafond du plat, le débordement est zéro (passe)", () => {
  const b = sideBudgetFor({
    mealKcal: 500,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, refused: true },
    isMinor: false,
  });
  assertEquals(b.dishKcal, 500);
  assertEquals(b.overflowKcal, 0);
  assertConserved(500, b);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA CROISSANCE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("croissance sous 50 kcal — pas de pain ajouté, l'entrée prévue s'étend", () => {
  // plafond = 0,35 × 700 = 245 · base 60 → plat 640 > 632,5 → besoin 7,5 < 50
  // → pas de pain; l'entrée passe à 67,5; plat 632,5; débordement 0
  const b = sideBudgetFor({
    mealKcal: 700,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "starter", baseKcal: 60 }],
      growKinds: ["bread", "starter"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => c.kind), ["starter"]);
  assertAlmostEquals(b.courses[0].kcal, 67.5, EPS);
  assertAlmostEquals(b.grownKcal, 7.5, EPS);
  assertAlmostEquals(b.dishKcal, 632.5, EPS);
  assertEquals(b.overflowKcal, 0);
  assertEquals(b.capped, false);
  assertConserved(700, b);
});

Deno.test("croissance — un type absent de growKinds ne grossit jamais (mord)", () => {
  // Même moment, mais l'entrée n'est pas dans growKinds: rien ne bouge.
  // base 60 → plat 640 · débordement 7,5
  const b = sideBudgetFor({
    mealKcal: 700,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "starter", baseKcal: 60 }],
      growKinds: ["dessert"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["starter", 60]]);
  assertEquals(b.grownKcal, 0);
  assertAlmostEquals(b.overflowKcal, 7.5, EPS);
  assertConserved(700, b);
});

Deno.test("croissance — un dessert s'arrête à son plafond de type (250), sans toucher la part", () => {
  // plafond = 0,35 × 1200 = 420 · base 180 → plat 1020 · besoin 387,5 · place 240
  // dessert 180 → 250 (+70); les 170 restants n'ont nulle part où aller
  // à-côté 250 · plat 950 · débordement 317,5 · pas `capped` (250 < 420)
  const b = sideBudgetFor({
    mealKcal: 1200,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "dessert", baseKcal: 180 }],
      growKinds: ["dessert"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["dessert", 250]]);
  assertEquals(b.grownKcal, 70);
  assertEquals(b.dishKcal, 950);
  assertEquals(b.overflowKcal, 317.5);
  assertEquals(b.capped, false);
  assertConserved(1200, b);
});

Deno.test("croissance — pain plafonné à 200, puis le dessert prend le reste", () => {
  // plafond = 0,35 × 1600 = 560 · base 310 → plat 1290 · besoin 657,5 · place 250
  // pain + 200 (son plafond) · reste 50 → dessert 180 → 230 · fromage intact
  // à-côté 560 · plat 1040 · débordement 407,5 · `capped`
  const b = sideBudgetFor({
    mealKcal: 1600,
    dishCapKcal: 632.5,
    input: THOMAS_LUNCH,
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [
    ["cheese", 130],
    ["dessert", 230],
    ["bread", 200],
  ]);
  assertEquals(b.grownKcal, 250);
  assertEquals(b.sideKcal, 560);
  assertEquals(b.dishKcal, 1040);
  assertEquals(b.overflowKcal, 407.5);
  assertEquals(b.capped, true);
  assertConserved(1600, b);
});

Deno.test("croissance — un pain déjà prévu n'est pas ajouté une seconde fois", () => {
  // plafond = 0,35 × 1000 = 350 · base pain 160 → plat 840 · besoin 207,5 · place 190
  // pain 160 → 200 (+40); plus rien à étendre · à-côté 200 · plat 800 · débordement 167,5
  const b = sideBudgetFor({
    mealKcal: 1000,
    dishCapKcal: 632.5,
    input: {
      courses: [{ kind: "bread", baseKcal: 160 }],
      growKinds: ["bread"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["bread", 200]]);
  assertEquals(b.grownKcal, 40);
  assertEquals(b.overflowKcal, 167.5);
  assertEquals(b.capped, false);
  assertConserved(1000, b);
});

Deno.test("moment léger — aucun pain ajouté, la croissance passe par les à-côtés prévus (mord)", () => {
  // Le moment de Thomas, déclaré léger: place 85,0345 · pas de pain
  // dessert 180 → 250 (+70) · reste 15,0345 → fromage 130 → 145,0345
  // à-côté 395,0345 · plat 733,6355 — les mêmes kcal, sans second à-côté
  const b = sideBudgetFor({
    mealKcal: 1128.67,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, light: true },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => c.kind), ["cheese", "dessert"]);
  assertAlmostEquals(kcalOf(b, "cheese")[0], 145.0345, 1e-6);
  assertEquals(kcalOf(b, "dessert"), [250]);
  assertAlmostEquals(b.sideKcal, 395.0345, 1e-6);
  assertAlmostEquals(b.dishKcal, 733.6355, 1e-6);
  assertEquals(b.capped, true);
  assertConserved(1128.67, b);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA PART MAXIMALE, BORNÉE PAR L'ÂGE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("part maximale — un adulte demandé à 0,40 reste à 0,35 (le plafond du produit gagne)", () => {
  // Même résultat que Thomas midi à 0,35: à-côté 395,0345, pain 85,0345.
  const b = sideBudgetFor({
    mealKcal: 1128.67,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, capShare: 0.4 },
    isMinor: false,
  });
  assertAlmostEquals(b.sideKcal, 395.0345, 1e-6);
  assertAlmostEquals(kcalOf(b, "bread")[0], 85.0345, 1e-6);
  assertAlmostEquals(b.overflowKcal, 101.1355, 1e-6);
});

Deno.test("part maximale — un planificateur plus strict que le plafond est suivi (0,30)", () => {
  // plafond = 0,30 × 1128,67 = 338,601 · place 28,601 < 50 → pas de pain
  // dessert 180 → 208,601 · à-côté 338,601 · plat 790,069 · débordement 157,569
  const b = sideBudgetFor({
    mealKcal: 1128.67,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, capShare: 0.3 },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => c.kind), ["cheese", "dessert"]);
  assertAlmostEquals(kcalOf(b, "dessert")[0], 208.601, 1e-6);
  assertAlmostEquals(b.sideKcal, 338.601, 1e-6);
  assertAlmostEquals(b.overflowKcal, 157.569, 1e-6);
  assertEquals(b.capped, true);
});

Deno.test("part maximale — un mineur passé à 0,35 est ramené à 0,25 (mord)", () => {
  // plafond = 0,25 × 600 = 150 · base dessert 90 → plat 510 > 400 · besoin 110 · place 60
  // dessert 90 → 150 · à-côté 150 · plat 450 · débordement 50 · `capped`
  // (à 0,35: plafond 210, dessert 200, plat 400, aucun débordement)
  const b = sideBudgetFor({
    mealKcal: 600,
    dishCapKcal: 400,
    input: {
      courses: [{ kind: "dessert", baseKcal: 90 }],
      growKinds: ["dessert"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: true,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["dessert", 150]]);
  assertEquals(b.dishKcal, 450);
  assertEquals(b.overflowKcal, 50);
  assertEquals(b.capped, true);
  assertConserved(600, b);
});

Deno.test("part maximale — la même personne, adulte, garde 0,35 (passe)", () => {
  const b = sideBudgetFor({
    mealKcal: 600,
    dishCapKcal: 400,
    input: {
      courses: [{ kind: "dessert", baseKcal: 90 }],
      growKinds: ["dessert"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    isMinor: false,
  });
  assertEquals(b.courses.map((c) => [c.kind, c.kcal]), [["dessert", 200]]);
  assertEquals(b.dishKcal, 400);
  assertEquals(b.overflowKcal, 0);
  assertEquals(b.capped, false);
  assertConserved(600, b);
});

Deno.test("part maximale — une base au-dessus du plafond est rabotée au prorata", () => {
  // plafond = 0,35 × 400 = 140 · base 310 > 140
  // fromage 130 × 140 / 310 = 58,70967741935484 · dessert 180 × 140 / 310 = 81,29032258064516
  // à-côté 140 · plat 260 · aucune croissance · `capped`
  const b = sideBudgetFor({
    mealKcal: 400,
    dishCapKcal: 632.5,
    input: THOMAS_LUNCH,
    isMinor: false,
  });
  assertAlmostEquals(kcalOf(b, "cheese")[0], 58.70967741935484, 1e-9);
  assertAlmostEquals(kcalOf(b, "dessert")[0], 81.29032258064516, 1e-9);
  assertAlmostEquals(b.sideKcal, 140, 1e-9);
  assertAlmostEquals(b.dishKcal, 260, 1e-9);
  assertEquals(b.grownKcal, 0);
  assertEquals(b.overflowKcal, 0);
  assertEquals(b.capped, true);
  assertConserved(400, b);
});

Deno.test("entrées illisibles — une part NaN ou un repas nul ne donnent aucun à-côté", () => {
  const nan = sideBudgetFor({
    mealKcal: 700,
    dishCapKcal: 632.5,
    input: { ...THOMAS_LUNCH, capShare: Number.NaN },
    isMinor: false,
  });
  assertEquals(nan.sideKcal, 0);
  assertEquals(nan.dishKcal, 700);
  assertAlmostEquals(nan.overflowKcal, 67.5, EPS);
  assertConserved(700, nan);

  const zero = sideBudgetFor({
    mealKcal: 0,
    dishCapKcal: 632.5,
    input: THOMAS_LUNCH,
    isMinor: false,
  });
  assertEquals(zero.sideKcal, 0);
  assertEquals(zero.dishKcal, 0);
  assertEquals(zero.overflowKcal, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ L'INVARIANT, SUR UNE GRILLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("somme conservée — à-côté + plat = repas, à 1e-9 près, sur une grille de cas", () => {
  const meals = [0.5, 150, 399.99, 632.5, 777.6, 1128.67, 1600, 2400.123];
  const caps = [0, 300, 632.5, 800];
  const inputs: SideCourseSlotInput[] = [
    THOMAS_LUNCH,
    { ...THOMAS_LUNCH, light: true },
    { ...THOMAS_LUNCH, refused: true },
    {
      courses: [{ kind: "starter", baseKcal: 60 }, { kind: "dessert", baseKcal: 80 }],
      growKinds: ["dessert", "starter", "bread"],
      refused: false,
      capShare: 0.35,
      light: false,
    },
    { courses: [], growKinds: ["bread"], refused: false, capShare: 0.25, light: false },
  ];
  let checked = 0;
  for (const meal of meals) {
    for (const cap of caps) {
      for (const input of inputs) {
        for (const isMinor of [false, true]) {
          const b = sideBudgetFor({ mealKcal: meal, dishCapKcal: cap, input, isMinor });
          assertConserved(meal, b);
          assert(b.overflowKcal >= 0);
          assert(b.sideKcal <= meal * (isMinor ? 0.25 : 0.35) + 1e-9);
          for (const c of b.courses) {
            assert(c.kcal >= 0);
          }
          checked++;
        }
      }
    }
  }
  // 8 repas × 4 plafonds × 5 moments × 2 âges
  assertEquals(checked, 320);
});

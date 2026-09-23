/**
 * LE FÉCULENT À CÔTÉ — 2026-09-22, lot C.
 *
 * ⛔ TOUS LES NOMBRES ATTENDUS SONT EN DUR, calculés à la main dans le
 * commentaire qui les précède — jamais dérivés de la constante testée
 * (`test-parameterized-by-its-own-constant`).
 *
 * ⛔ CHAQUE GARDE A UN CAS QUI MORD ET UN CAS QUI PASSE À CÔTÉ.
 *
 * ⟳ 2026-09-23 — LA FORME DE L'ASSIETTE SUIT L'OBJECTIF (audit des dosages,
 * lot 2) et l'ajusteur ne reçoit plus les lignes au-dessus du milieu (lot 5 c).
 * Les tests d'avant passent `goal: null`: c'est la preuve que `null` rend la
 * règle d'avant, mot pour mot, sur tout le banc qu'elle tenait.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  DAY_LANE_REASONS,
  dayProteinFloors,
  FAT_LOSS_MAIN_FACTOR_MAX_RATIO,
  FAT_LOSS_SIDE_FACTOR_MIN_RATIO,
  MAIN_FACTOR_MAX_RATIO,
  MAIN_FACTOR_MIN_RATIO,
  type PartMeasure,
  proteinFloorAt,
  rowsForProportionAdjust,
  SIDE_FACTOR_MAX_RATIO,
  SIDE_FACTOR_MIN_RATIO,
  type SidePotInput,
  splitStarchSide,
  STARCH_ASIDE_SLOTS,
  STARCH_GOALS,
  STARCH_KCAL_SHARE_MAX,
  STARCH_KCAL_SHARE_MIN,
  STARCH_SIDE_REFUSALS,
  STARCH_SPLIT_OUTCOMES,
  starchAsideCellsOf,
  starchGoalOf,
  starchRatioBoundsFor,
  starchSideOf,
  tableReferenceFactor,
  tableReferenceOf,
} from "./starch_side.ts";
import { partFactorOf } from "./portion_sizing.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES VOCABULAIRES ET LES RÉGLAGES, ÉPINGLÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("vocabulaires fermés et réglages épinglés, en dur", () => {
  // ⟳ 2026-09-23: 7 → 9 (`goal_shape`, `share_floor`).
  assertEquals(STARCH_SPLIT_OUTCOMES.length, 9);
  assert((STARCH_SPLIT_OUTCOMES as readonly string[]).includes("goal_shape"));
  assert((STARCH_SPLIT_OUTCOMES as readonly string[]).includes("share_floor"));
  assertEquals([...STARCH_GOALS], ["fat_loss", "maintenance", "muscle_gain"]);
  assertEquals(STARCH_SIDE_REFUSALS.length, 4);
  assertEquals(DAY_LANE_REASONS.length, 4);
  assertEquals([...STARCH_ASIDE_SLOTS].sort(), ["dinner", "lunch"]);
  assertEquals(MAIN_FACTOR_MIN_RATIO, 0.75);
  assertEquals(MAIN_FACTOR_MAX_RATIO, 1.5);
  assertEquals(SIDE_FACTOR_MIN_RATIO, 0.4);
  assertEquals(SIDE_FACTOR_MAX_RATIO, 1.75);
  // ⛔ LE PLAFOND N'EXISTE PLUS DANS CE VOCABULAIRE: c'est une mesure.
  assert(!(STARCH_SPLIT_OUTCOMES as readonly string[]).includes("to_ceiling"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ② OÙ LA CONSIGNE DEMANDE LE FÉCULENT À CÔTÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("cases à féculent à côté: partagées ET déjeuner/dîner, rien d'autre", () => {
  const cells = starchAsideCellsOf([
    { day: "wed", slot: "lunch", eaters: ["a", "b"] },
    { day: "wed", slot: "dinner", eaters: ["a", "b", "c"] },
    // Mangé seul: hors du partage. ⟳ 2026-09-23 — v38: la consigne l'écrit
    // en deux casseroles, servies au même facteur (test « v38 » plus bas).
    { day: "thu", slot: "lunch", eaters: ["a"] },
    // Partagé mais le matin: pas de casserole à séparer.
    { day: "thu", slot: "breakfast", eaters: ["a", "b"] },
  ]);
  assertEquals([...cells].sort(), ["wed|dinner", "wed|lunch"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ QUELLE CASSEROLE EST LE FÉCULENT — l'étiquette ET le référentiel
// ═══════════════════════════════════════════════════════════════════════════

const pots = (list: SidePotInput[]) => new Map(list.map((p) => [p.id, p]));
const CHICKEN: SidePotInput = {
  id: "prep_chicken",
  roles: ["main", "sauce"],
  weighedGroups: ["poultry", "non_starchy_veg", "olive_oil"],
};
const RICE: SidePotInput = {
  id: "prep_rice",
  roles: ["separable_side"],
  weighedGroups: ["refined_grain", "olive_oil"],
};

Deno.test("le féculent déclaré ET confirmé par le référentiel est retenu", () => {
  const out = starchSideOf({
    usedPrepIds: ["prep_chicken", "prep_rice"],
    pots: pots([CHICKEN, RICE]),
  });
  assertEquals(out, { sidePrepId: "prep_rice", refusal: null });
});

Deno.test("une seule casserole: rien à séparer", () => {
  const out = starchSideOf({ usedPrepIds: ["prep_chicken", "prep_chicken"], pots: pots([CHICKEN]) });
  assertEquals(out, { sidePrepId: null, refusal: "single_pot" });
});

Deno.test("aucune casserole déclarée à côté: refus nommé", () => {
  const out = starchSideOf({
    usedPrepIds: ["prep_chicken", "prep_rice"],
    pots: pots([CHICKEN, { ...RICE, roles: ["main"] }]),
  });
  assertEquals(out, { sidePrepId: null, refusal: "no_side_declared" });
});

Deno.test("un bloc qui mêle `main` et `separable_side` n'est pas un accompagnement", () => {
  const out = starchSideOf({
    usedPrepIds: ["prep_chicken", "prep_rice"],
    pots: pots([CHICKEN, { ...RICE, roles: ["main", "separable_side"] }]),
  });
  assertEquals(out, { sidePrepId: null, refusal: "no_side_declared" });
});

Deno.test("deux casseroles à côté: laquelle bouger est indéterminé", () => {
  const out = starchSideOf({
    usedPrepIds: ["prep_chicken", "prep_rice", "prep_potato"],
    pots: pots([CHICKEN, RICE, { id: "prep_potato", roles: ["separable_side"], weighedGroups: ["starchy_veg"] }]),
  });
  assertEquals(out, { sidePrepId: null, refusal: "two_sides" });
});

Deno.test("GARDE: une protéine déclarée « à côté » est refusée par le référentiel", () => {
  // ⛔ LE CAS QUI MORD: le modèle étiquette le poulet `separable_side`.
  const out = starchSideOf({
    usedPrepIds: ["prep_veg", "prep_chicken"],
    pots: pots([
      { id: "prep_veg", roles: ["main"], weighedGroups: ["non_starchy_veg"] },
      { ...CHICKEN, roles: ["separable_side"] },
    ]),
  });
  assertEquals(out, { sidePrepId: null, refusal: "side_not_starch" });
  // ⚠️ ET SANS AUCUNE LIGNE FÉCULENTE non plus: des légumes à côté ne portent
  // pas l'énergie d'une case.
  const légumes = starchSideOf({
    usedPrepIds: ["prep_chicken", "prep_veg"],
    pots: pots([CHICKEN, { id: "prep_veg", roles: ["separable_side"], weighedGroups: ["non_starchy_veg", null] }]),
  });
  assertEquals(légumes, { sidePrepId: null, refusal: "side_not_starch" });
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA PART DE RÉFÉRENCE ET LE PLANCHER D'UNE CASE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("part de référence: le facteur du MILIEU de la table, jamais le plus petit", () => {
  assertEquals(tableReferenceFactor([0.97, 0.7, 0.77]), 0.77);
  // À nombre pair, la plus petite des deux du milieu.
  assertEquals(tableReferenceFactor([0.97, 0.7]), 0.7);
  assertEquals(tableReferenceFactor([1.0, 0.5, 0.8, 0.7]), 0.7);
  // ⚠️ Un enfant ne ramène pas la table à sa part: 0,3 n'est pas la référence.
  assertEquals(tableReferenceFactor([0.3, 0.9, 1.1]), 0.9);
  assertEquals(tableReferenceFactor([1.2]), null, "une bouche n'est pas une table");
  assertEquals(tableReferenceFactor([]), null);
});

Deno.test("plancher par case: plancher du jour ÷ énergie du jour × énergie de la part", () => {
  // 108 g sur 2 160 kcal composées = 0,05 g/kcal; part de 540 kcal ⇒ 27 g.
  assertAlmostEquals(proteinFloorAt({ dayFloorG: 108, dayComposeKcal: 2160, targetKcal: 540 })!, 27, 1e-9);
  assertEquals(proteinFloorAt({ dayFloorG: null, dayComposeKcal: 2160, targetKcal: 540 }), null);
  assertEquals(proteinFloorAt({ dayFloorG: 108, dayComposeKcal: null, targetKcal: 540 }), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES DEUX FACTEURS
// ═══════════════════════════════════════════════════════════════════════════
//
// Le banc: une part standard de poulet en sauce (600 kcal, 60 g de protéine,
// 400 g prêts) et une part de riz (400 kcal, 10 g, 300 g prêts).
// Densité du riz 10/400 = 0,025 g/kcal; pente protéique 60 − 600 × 0,025 = 45.

const MAIN: PartMeasure = { kcal: 600, proteinG: 60, readyG: 400 };
const SIDE: PartMeasure = { kcal: 400, proteinG: 10, readyG: 300 };
const LARGE = { min: 300, max: 900 };

Deno.test("MORD — la grosse assiette reçoit la casserole de la référence, le surplus en riz", () => {
  // Facteur 1,2 contre une référence de 1,0: énergie T = 1,2 × 1 000 = 1 200.
  // Casserole principale au facteur de la référence: 1,0 (0,83 × 1,2 ≥ 0,75 ✓).
  // Riz: (1 200 − 600) / 400 = 1,5 (1,25 × 1,2 ≤ 1,75 ✓).
  // Le riz porte (1,5 − 1,2) × 400 = 120 kcal de plus. Protéine 60 + 15 = 75,
  // contre 1,2 × 70 = 84 au facteur uniforme. Masse 400 + 450 = 850 g.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.2, tableFactor: 1.0, floorG: null, bounds: LARGE,
  });
  assertEquals(out.outcome, "starch_carries_extra");
  assertAlmostEquals(out.mainFactor, 1.0, 1e-9);
  assertAlmostEquals(out.sideFactor, 1.5, 1e-9);
  assertAlmostEquals(out.starchCarriedKcal, 120, 1e-9);
  assertAlmostEquals(out.proteinBeforeG!, 84, 1e-9);
  assertAlmostEquals(out.proteinAfterG!, 75, 1e-9);
  // ⛔ L'INVARIANT: l'énergie de la case ne bouge pas.
  assertAlmostEquals(out.mainFactor * 600 + out.sideFactor * 400, 1200, 1e-9);
});

Deno.test("PASSE À CÔTÉ — à la référence ou en dessous: un seul facteur", () => {
  for (const u of [0.9, 1.0]) {
    const out = splitStarchSide({
      goal: null, tableGoal: null,
      main: MAIN, side: SIDE, uniformFactor: u, tableFactor: 1.0, floorG: null, bounds: LARGE,
    });
    assertEquals(out.outcome, "uniform");
    assertEquals([out.mainFactor, out.sideFactor], [u, u]);
    assertEquals(out.starchCarriedKcal, 0);
  }
  // Et sans table (une seule bouche dimensionnée): un seul facteur.
  const seule = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.2, tableFactor: null, floorG: null, bounds: LARGE,
  });
  assertEquals(seule.outcome, "uniform");
});

Deno.test("⛔ AUCUN PLAFOND: une part très protéique à la référence n'est pas touchée", () => {
  // 70 g de protéine pour 1 000 kcal, à la part de référence: rien ne bouge,
  // quel que soit le plafond de la bouche — il n'est même plus un paramètre.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.0, tableFactor: 1.0, floorG: 40, bounds: LARGE,
  });
  assertEquals(out.outcome, "uniform");
  assertAlmostEquals(out.proteinAfterG!, 70, 1e-9);
});

Deno.test("sous le plancher: la casserole principale monte, le riz descend", () => {
  // Facteur 1, plancher 80 g. f_m = (80 − 1 000 × 0,025) / 45 = 55/45 = 1,2222;
  // riz (1 000 − 733,33) / 400 = 0,6667. Protéine 73,33 + 6,667 = 80.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1, tableFactor: 1, floorG: 80, bounds: LARGE,
  });
  assertEquals(out.outcome, "to_floor");
  assertAlmostEquals(out.mainFactor, 1.222222, 1e-6);
  assertAlmostEquals(out.sideFactor, 0.666667, 1e-6);
  assertAlmostEquals(out.proteinAfterG!, 80, 1e-9);
});

Deno.test("le plancher l'emporte sur la préférence d'énergie", () => {
  // Grosse assiette (1,2 contre 1,0), plancher 80 g. La référence donnerait
  // 1 200 × 0,025 + 1,0 × 45 = 75 g < 80: la casserole remonte à
  // (80 − 30)/45 = 1,1111; riz (1 200 − 666,67)/400 = 1,3333. Protéine 80.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.2, tableFactor: 1.0, floorG: 80, bounds: LARGE,
  });
  assertEquals(out.outcome, "to_floor");
  assertAlmostEquals(out.mainFactor, 1.111111, 1e-6);
  assertAlmostEquals(out.sideFactor, 1.333333, 1e-6);
  assertAlmostEquals(out.proteinAfterG!, 80, 1e-9);
});

Deno.test("proportions MODÉRÉES: la casserole ne descend pas sous 0,75 × sa part", () => {
  // Deux fois la part de la table (2,0 contre 1,0): la référence voudrait 1,0,
  // la borne tient la casserole à 0,75 × 2 = 1,5. Riz (2 000 − 900)/400 = 2,75
  // (1,375 × 2 ≤ 1,75 ✓). Protéine 90 + 27,5 = 117,5.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 2, tableFactor: 1, floorG: null,
    bounds: { min: 300, max: 2000 },
  });
  assertEquals(out.outcome, "bounded");
  assertAlmostEquals(out.mainFactor, 1.5, 1e-9);
  assertAlmostEquals(out.sideFactor, 2.75, 1e-9);
  assertAlmostEquals(out.proteinAfterG!, 117.5, 1e-9);
  assertAlmostEquals(out.mainFactor * 600 + out.sideFactor * 400, 2000, 1e-9);
});

Deno.test("BORNE DE MASSE: le déplacement s'arrête à la masse maximale, il n'est pas annulé", () => {
  // Grosse assiette (1,2 contre 1,0). M(f_m) = f_m × (400 − 600 × 300/400)
  // + 1 200 × 300/400 = −50 × f_m + 900; masse uniforme 840.
  // Plafond de masse 845 ⇒ f_m ≥ 1,1. Riz (1 200 − 660)/400 = 1,35. Masse 845.
  const partiel = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.2, tableFactor: 1.0, floorG: null,
    bounds: { min: 300, max: 845 },
  });
  assertEquals(partiel.outcome, "mass_bound");
  assertAlmostEquals(partiel.mainFactor, 1.1, 1e-9);
  assertAlmostEquals(partiel.sideFactor, 1.35, 1e-9);
  assertAlmostEquals(partiel.mainFactor * 400 + partiel.sideFactor * 300, 845, 1e-9);
  // Plafond de masse 840 = la masse uniforme: aucun pas possible.
  const bloque = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: SIDE, uniformFactor: 1.2, tableFactor: 1.0, floorG: null,
    bounds: { min: 300, max: 840 },
  });
  assertEquals(bloque.outcome, "mass_bound");
  assertEquals([bloque.mainFactor, bloque.sideFactor], [1.2, 1.2]);
});

Deno.test("aucune pente: le plancher ne se rattrape pas par la casserole, et c'est dit", () => {
  // Principal 600 kcal / 12 g (0,02 g/kcal), riz 0,025: pente −3. Plancher 30 g
  // pour 22 g servis.
  const out = splitStarchSide({
    goal: null, tableGoal: null,
    main: { kcal: 600, proteinG: 12, readyG: 400 }, side: SIDE,
    uniformFactor: 1, tableFactor: 1, floorG: 30, bounds: LARGE,
  });
  assertEquals(out.outcome, "no_gradient");
  assertEquals(out.mainFactor, 1);
});

Deno.test("sans mesure: un seul facteur, et le motif est nommé", () => {
  const muet = splitStarchSide({
    goal: null, tableGoal: null,
    main: MAIN, side: null, uniformFactor: 1.2, tableFactor: 1, floorG: null, bounds: LARGE,
  });
  assertEquals(muet.outcome, "unmeasurable");
  assertEquals(muet.proteinBeforeG, null);
  assert(muet.starchCarriedKcal === 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE PLANCHER DE JOURNÉE
// ═══════════════════════════════════════════════════════════════════════════

const JOUR = {
  dayFloorG: 108,
  perMealFloorG: null,
  abstention: "none" as const,
  coveredBudgetGrossKcal: 2192,
  dayTargetKcal: 2192,
  fixedProteinG: null,
  dayCeilingG: null,
};

Deno.test("MORD — ce que le reste de la journée n'apporte pas est demandé aux cases partagées", () => {
  // Plancher couvert 108 g; hors partage la bouche mange 68 g. Reste à porter:
  // 40 g, sur deux cases de 600 et 400 kcal (60 % / 40 %): 24 et 16 g.
  const out = dayProteinFloors({
    allocation: JOUR,
    restProteinG: 68,
    rows: [{ key: "a", targetKcal: 600 }, { key: "b", targetKcal: 400 }],
  });
  assertEquals(out.reason, "day");
  assertEquals(out.dayFloorG, 108);
  assertAlmostEquals(out.floors.get("a")!, 24, 1e-9);
  assertAlmostEquals(out.floors.get("b")!, 16, 1e-9);
});

Deno.test("PASSE À CÔTÉ — un reste qui suffit ne demande rien aux cases partagées", () => {
  const out = dayProteinFloors({
    allocation: JOUR,
    restProteinG: 120,
    rows: [{ key: "a", targetKcal: 600 }],
  });
  assertEquals(out.floors.get("a"), 0);
});

Deno.test("le plancher est le plancher COUVERT du contrôle final, apports fixes déduits une fois", () => {
  // Fenêtre couverte 1 644 / 2 192 = 0,75: 108 × 0,75 = 81; shaker de 20 g
  // retiré une fois: 61. Reste 40 g, une case: 21 g.
  const out = dayProteinFloors({
    allocation: { ...JOUR, coveredBudgetGrossKcal: 1644, fixedProteinG: 20 },
    restProteinG: 40,
    rows: [{ key: "a", targetKcal: 700 }],
  });
  assertAlmostEquals(out.dayFloorG!, 61, 1e-9);
  assertAlmostEquals(out.floors.get("a")!, 21, 1e-9);
});

Deno.test("reste inconnu, cible inconnue, pas de plancher: repli par case, motif nommé", () => {
  const rows = [{ key: "a", targetKcal: 600 }];
  assertEquals(dayProteinFloors({ allocation: JOUR, restProteinG: null, rows }).reason, "rest_unknown");
  assertEquals(
    dayProteinFloors({ allocation: JOUR, restProteinG: 60, rows: [{ key: "a", targetKcal: null }] }).reason,
    "target_unknown",
  );
  const sansCorps = dayProteinFloors({
    allocation: { ...JOUR, dayFloorG: null, abstention: "no_body" },
    restProteinG: 60,
    rows,
  });
  assertEquals(sansCorps.reason, "no_bound");
  assertEquals(sansCorps.floors.size, 0);
  assertEquals(dayProteinFloors({ allocation: null, restProteinG: 60, rows }).reason, "no_bound");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ ⟳ 2026-09-23 — LA FORME DE L'ASSIETTE SUIT L'OBJECTIF (audit, lot 2)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — les réglages de la forme d'objectif, en dur", () => {
  assertEquals(STARCH_KCAL_SHARE_MAX, { fat_loss: 0.30, maintenance: 0.45 });
  assertEquals(STARCH_KCAL_SHARE_MIN, 0.20);
  assertEquals(FAT_LOSS_MAIN_FACTOR_MAX_RATIO, 2.0);
  assertEquals(FAT_LOSS_SIDE_FACTOR_MIN_RATIO, 0.25);
  // La perte élargit DEUX bornes, dans le sens « plus de casserole
  // principale »; les deux autres ne bougent pas, et les autres objectifs
  // gardent les bornes d'avant.
  assertEquals(starchRatioBoundsFor("fat_loss"), { mainMin: 0.75, mainMax: 2.0, sideMin: 0.25, sideMax: 1.75 });
  for (const g of ["maintenance", "muscle_gain", null] as const) {
    assertEquals(starchRatioBoundsFor(g), { mainMin: 0.75, mainMax: 1.5, sideMin: 0.4, sideMax: 1.75 });
  }
});

Deno.test("l'objectif du partage: âge inconnu et mineur ⇒ null; adulte sans objectif ⇒ maintien", () => {
  assertEquals(starchGoalOf({ ageYears: null, goal: "fat_loss" }), null);
  assertEquals(starchGoalOf({ ageYears: 12, goal: "fat_loss" }), null);
  assertEquals(starchGoalOf({ ageYears: 17, goal: "muscle_gain" }), null);
  assertEquals(starchGoalOf({ ageYears: 18, goal: null }), "maintenance");
  assertEquals(starchGoalOf({ ageYears: 44, goal: "maintenance" }), "maintenance");
  assertEquals(starchGoalOf({ ageYears: 51, goal: "fat_loss" }), "fat_loss");
  assertEquals(starchGoalOf({ ageYears: 26, goal: "muscle_gain" }), "muscle_gain");
});

// Le banc de l'audit: casserole principale 500 kcal / 40 g / 380 g, féculent
// 300 kcal / 8 g / 230 g. Part de féculent de la recette 300/800 = 0,375.
const MAIN_A: PartMeasure = { kcal: 500, proteinG: 40, readyG: 380 };
const SIDE_A: PartMeasure = { kcal: 300, proteinG: 8, readyG: 230 };
const BORNES_A = { min: 250, max: 550 };

Deno.test("MORD — perte: la part de féculent redescend à 0,30, `goal_shape`", () => {
  // T = 800. Féculent 0,30 × 800 = 240 kcal ⇒ f_s = 240/300 = 0,80.
  // Casserole principale (800 − 240)/500 = 1,12 (≤ 2,0 ✓; f_s ≥ 0,25 ✓;
  // bande basse 0,8 × 800/500 = 1,28 ✓). Masse −3,333 × 1,12 + 613,333 =
  // 609,6 g, dans [1,0; 109] du côté masse (uniforme 610 > 550 ⇒ plafond 610).
  // Protéine 1,12 × 40 + 0,8 × 8 = 44,8 + 6,4 = 51,2 (48 au facteur uniforme).
  for (const tableFactor of [1, null]) {
    const out = splitStarchSide({
      main: MAIN_A, side: SIDE_A, uniformFactor: 1, tableFactor, tableGoal: "fat_loss",
      floorG: null, bounds: BORNES_A, goal: "fat_loss",
    });
    assertEquals(out.outcome, "goal_shape", `table ${tableFactor}`);
    assertAlmostEquals(out.mainFactor, 1.12, 1e-9);
    assertAlmostEquals(out.sideFactor, 0.8, 1e-9);
    assertAlmostEquals(out.proteinBeforeG!, 48, 1e-9);
    assertAlmostEquals(out.proteinAfterG!, 51.2, 1e-9);
    assertAlmostEquals(out.starchCarriedKcal, -60, 1e-9);
    assertAlmostEquals(out.starchShareBefore!, 0.375, 1e-9);
    assertAlmostEquals(out.starchShareAfter!, 0.3, 1e-9);
    // ⛔ L'INVARIANT: l'énergie de la case ne bouge pas.
    assertAlmostEquals(out.mainFactor * 500 + out.sideFactor * 300, 800, 1e-9);
    assertAlmostEquals(out.mainFactor * 380 + out.sideFactor * 230, 609.6, 1e-9);
  }
});

Deno.test("PASSE À CÔTÉ — maintien (0,375 ≤ 0,45), prise et objectif nul: rien ne bouge", () => {
  for (const goal of ["maintenance", "muscle_gain", null] as const) {
    const out = splitStarchSide({
      main: MAIN_A, side: SIDE_A, uniformFactor: 1, tableFactor: 1, tableGoal: goal,
      floorG: null, bounds: BORNES_A, goal,
    });
    assertEquals(out.outcome, "uniform", `objectif ${goal}`);
    assertEquals([out.mainFactor, out.sideFactor], [1, 1]);
    assertAlmostEquals(out.starchShareAfter!, 0.375, 1e-9);
  }
});

// Une recette déjà pauvre en féculent: 656 + 144 kcal, part 144/800 = 0,18
// (le cas 1e553ca1 de l'audit, pommes de terre).
const MAIN_B: PartMeasure = { kcal: 656, proteinG: 45, readyG: 420 };
const SIDE_B: PartMeasure = { kcal: 144, proteinG: 4, readyG: 110 };

Deno.test("recette à 0,18 de féculent: la forme n'en ajoute pas, la bande basse non plus", () => {
  // Sous le plafond de 0,30: aucune forme.
  const sans = splitStarchSide({
    main: MAIN_B, side: SIDE_B, uniformFactor: 1, tableFactor: 1, tableGoal: "fat_loss",
    floorG: null, bounds: null, goal: "fat_loss",
  });
  assertEquals(sans.outcome, "uniform");
  assertEquals(sans.sideFactor, 1);
  // ⛔ LE CAS QUI MORD LA BANDE BASSE: un plancher de 60 g (49 servis) voudrait
  // retirer du féculent. Pente 45 − 656 × 4/144 = 26,78; cible
  // (60 − 22,22)/26,78 = 1,411. La bande basse vaut min(0,20; 0,18) = 0,18,
  // c'est-à-dire la recette elle-même: 0,82 × 800/656 = 1,0. Rien ne bouge, et
  // le motif est nommé. ⚠️ Avec 0,20 sans le « plus petit », la borne vaudrait
  // 0,8 × 800/656 = 0,976 < 1: le féculent MONTERAIT à 1,11.
  const plancher = splitStarchSide({
    main: MAIN_B, side: SIDE_B, uniformFactor: 1, tableFactor: 1, tableGoal: "fat_loss",
    floorG: 60, bounds: null, goal: "fat_loss",
  });
  assertEquals(plancher.outcome, "share_floor");
  assertEquals([plancher.mainFactor, plancher.sideFactor], [1, 1]);
  assertAlmostEquals(plancher.proteinAfterG!, 49, 1e-9);
  // ⚠️ ET `null` REND LA RÈGLE D'AVANT: le plancher retire du féculent jusqu'à
  // la borne de rapport 0,4. Borne haute (800 − 0,4 × 144)/656 = 1,1317;
  // féculent (800 − 742,4)/144 = 0,4.
  const avant = splitStarchSide({
    main: MAIN_B, side: SIDE_B, uniformFactor: 1, tableFactor: 1, tableGoal: null,
    floorG: 60, bounds: null, goal: null,
  });
  assertEquals(avant.outcome, "bounded");
  assertAlmostEquals(avant.mainFactor, 1.131707, 1e-6);
  assertAlmostEquals(avant.sideFactor, 0.4, 1e-9);
});

Deno.test("MORD — la bande basse arrête le plancher protéique: `share_floor` à 0,20", () => {
  // Le banc du lot C (600/60/400 + 400/10/300, part 0,4), perte, plancher 100 g.
  // Forme: (1 − 0,30) × 1 000/600 = 1,1667 ⇒ protéine 25 + 1,1667 × 45 = 77,5
  // < 100 ⇒ cible (100 − 25)/45 = 1,6667. Bornes de perte: min(2,0;
  // (1 000 − 0,25 × 400)/600 = 1,5) = 1,5. Bande basse 0,8 × 1 000/600 =
  // 1,3333 — la plus serrée. Féculent (1 000 − 800)/400 = 0,5; protéine 80 + 5.
  const out = splitStarchSide({
    main: MAIN, side: SIDE, uniformFactor: 1, tableFactor: 1, tableGoal: "fat_loss",
    floorG: 100, bounds: LARGE, goal: "fat_loss",
  });
  assertEquals(out.outcome, "share_floor");
  assertAlmostEquals(out.mainFactor, 1.333333, 1e-6);
  assertAlmostEquals(out.sideFactor, 0.5, 1e-9);
  assertAlmostEquals(out.proteinAfterG!, 85, 1e-9);
  assertAlmostEquals(out.starchShareAfter!, 0.2, 1e-9);
  // Sans objectif (règle d'avant): la borne de rapport 0,4 arrête le
  // féculent à (1 000 − 0,4 × 400)/600 = 1,4; protéine 84 + 4 = 88.
  const avant = splitStarchSide({
    main: MAIN, side: SIDE, uniformFactor: 1, tableFactor: 1, tableGoal: null,
    floorG: 100, bounds: LARGE, goal: null,
  });
  assertEquals(avant.outcome, "bounded");
  assertAlmostEquals(avant.mainFactor, 1.4, 1e-9);
  assertAlmostEquals(avant.proteinAfterG!, 88, 1e-9);
});

// Une recette à 0,55 de féculent: 450 kcal / 45 g / 380 g + 550 / 11 / 400.
// Densité du féculent 0,02 g/kcal; pente 45 − 450 × 0,02 = 36.
const MAIN_W: PartMeasure = { kcal: 450, proteinG: 45, readyG: 380 };
const SIDE_W: PartMeasure = { kcal: 550, proteinG: 11, readyG: 400 };

Deno.test("MORD — les bornes élargies de la perte: la casserole monte au-delà de ×1,5", () => {
  // Perte, plancher 90 g. Forme: 0,7 × 1 000/450 = 1,5556 (protéine 20 + 56 =
  // 76 < 90) ⇒ cible (90 − 20)/36 = 1,9444. Bornes de perte: min(2,0;
  // (1 000 − 0,25 × 550)/450 = 1,9167) = 1,9167. Bande basse 0,8 × 1 000/450
  // = 1,7778 — la plus serrée. Féculent (1 000 − 800)/550 = 0,3636; protéine
  // 80 + 4 = 84.
  // ⚠️ Avec les bornes d'avant (×1,5 et ×0,4), la casserole s'arrêterait à
  // min(1,5; (1 000 − 220)/450 = 1,7333) = 1,5: c'est ce que le maintien reçoit.
  const perte = splitStarchSide({
    main: MAIN_W, side: SIDE_W, uniformFactor: 1, tableFactor: null, tableGoal: null,
    floorG: 90, bounds: null, goal: "fat_loss",
  });
  assertEquals(perte.outcome, "share_floor");
  assertAlmostEquals(perte.mainFactor, 1.777778, 1e-6);
  assertAlmostEquals(perte.sideFactor, 0.363636, 1e-6);
  assertAlmostEquals(perte.proteinAfterG!, 84, 1e-9);
  // Maintien: forme 0,55 × 1 000/450 = 1,2222 (protéine 64 < 90), bornes
  // d'avant ⇒ 1,5; féculent (1 000 − 675)/550 = 0,5909; protéine 67,5 + 6,5.
  const maintien = splitStarchSide({
    main: MAIN_W, side: SIDE_W, uniformFactor: 1, tableFactor: null, tableGoal: null,
    floorG: 90, bounds: null, goal: "maintenance",
  });
  assertEquals(maintien.outcome, "bounded");
  assertAlmostEquals(maintien.mainFactor, 1.5, 1e-9);
  assertAlmostEquals(maintien.sideFactor, 0.590909, 1e-6);
  assertAlmostEquals(maintien.proteinAfterG!, 74, 1e-9);
});

// Une recette très féculente: 400 kcal / 40 g / 350 g + 600 / 12 / 400 (0,6).
const MAIN_S: PartMeasure = { kcal: 400, proteinG: 40, readyG: 350 };
const SIDE_S: PartMeasure = { kcal: 600, proteinG: 12, readyG: 400 };

Deno.test("personne seule en perte: la forme tourne sans table", () => {
  // 0,7 × 1 000/400 = 1,75 (≤ 2,0 ✓; bande basse 0,8 × 1 000/400 = 2,0 ✓).
  // Féculent (1 000 − 700)/600 = 0,5.
  const out = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1, tableFactor: null, tableGoal: null,
    floorG: null, bounds: null, goal: "fat_loss",
  });
  assertEquals(out.outcome, "goal_shape");
  assertAlmostEquals(out.mainFactor, 1.75, 1e-9);
  assertAlmostEquals(out.sideFactor, 0.5, 1e-9);
  assertAlmostEquals(out.starchShareAfter!, 0.3, 1e-9);
});

Deno.test("⟳ 2026-09-23 v38 — une case mangée SEULE dans un foyer: deux casseroles, UN facteur", () => {
  // La consigne v38 demande le féculent à part pour tout déjeuner et tout
  // dîner. À table, le partage ne lit que les cases à deux mangeurs et plus:
  // le dîner que Bea mange seule n'y entre pas.
  const cells = starchAsideCellsOf([
    { day: "mon", slot: "lunch", eaters: ["m-a", "m-b"] },
    { day: "mon", slot: "dinner", eaters: ["m-b"] },
  ]);
  assertEquals([...cells], ["mon|lunch"]);
  // PASSE: sans entrée de partage, la ligne porte `starchSide: null`
  // (générateur: `starchSideByRow.get(…) ?? null`), et chaque partie — la
  // casserole principale, la casserole-féculent, le frais — reçoit le facteur 1.
  const seule = { factor: 1, starchSide: null };
  assertEquals(
    [partFactorOf(seule, "prep_chicken"), partFactorOf(seule, "prep_rice"), partFactorOf(seule, null)],
    [1, 1, 1],
  );
  // L'assiette est la recette à l'échelle: 1 × 500 + 1 × 300 = 800 kcal, part
  // du féculent 300/800 = 0,375 — celle de la recette, pas la forme de la perte.
  const kcalSeule = partFactorOf(seule, "prep_chicken") * 500 + partFactorOf(seule, "prep_rice") * 300;
  assertAlmostEquals(kcalSeule, 800, 1e-9);
  assertAlmostEquals((partFactorOf(seule, "prep_rice") * 300) / kcalSeule, 0.375, 1e-9);
  // MORD: la même recette sur la case PARTAGÉE, en perte, reçoit la forme
  // (1,12 et 0,80, voir « MORD — perte »), et la ligne porte deux facteurs.
  const split = splitStarchSide({
    main: MAIN_A, side: SIDE_A, uniformFactor: 1, tableFactor: 1, tableGoal: "fat_loss",
    floorG: null, bounds: BORNES_A, goal: "fat_loss",
  });
  const partagee = {
    factor: 1,
    starchSide: { preparationId: "prep_rice", mainFactor: split.mainFactor, sideFactor: split.sideFactor },
  };
  assertAlmostEquals(partFactorOf(partagee, "prep_chicken"), 1.12, 1e-9);
  assertAlmostEquals(partFactorOf(partagee, "prep_rice"), 0.8, 1e-9);
  assertAlmostEquals(partFactorOf(partagee, null), 1.12, 1e-9);
  // ⛔ L'ÉNERGIE EST LA MÊME DANS LES DEUX CAS: seule la forme change.
  assertAlmostEquals(1.12 * 500 + 0.8 * 300, kcalSeule, 1e-9);
});

Deno.test("MORD — la grosse assiette garde au moins la casserole du milieu APRÈS sa forme", () => {
  // La personne du milieu (maintien, facteur 1,0): 0,55 × 1 000/400 = 1,375
  // (≤ 1,5 ✓; féculent (1 000 − 550)/600 = 0,75 ≥ 0,4 ✓).
  const milieu = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1, tableFactor: 1, tableGoal: "maintenance",
    floorG: null, bounds: null, goal: "maintenance",
  });
  assertEquals(milieu.outcome, "goal_shape");
  assertAlmostEquals(milieu.mainFactor, 1.375, 1e-9);
  // La grosse assiette (prise, 1,6): casserole du milieu 1,375 (≥ 0,75 × 1,6 =
  // 1,2 ✓); féculent (1 600 − 550)/600 = 1,75 (≤ 1,75 × 1,6 ✓).
  const grosse = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1.6, tableFactor: 1, tableGoal: "maintenance",
    floorG: null, bounds: null, goal: "muscle_gain",
  });
  assertEquals(grosse.outcome, "starch_carries_extra");
  assertAlmostEquals(grosse.mainFactor, 1.375, 1e-9);
  assertAlmostEquals(grosse.sideFactor, 1.75, 1e-9);
  assert(grosse.mainFactor >= milieu.mainFactor - 1e-9, "jamais moins que la personne du milieu");
  // ⚠️ LE DÉFAUT D'AVANT, gardé par `goal: null`: la casserole de la référence
  // telle quelle (1,0), relevée à la borne 0,75 × 1,6 = 1,2 — moins de
  // casserole principale que la personne du milieu.
  const avant = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1.6, tableFactor: 1, tableGoal: "maintenance",
    floorG: null, bounds: null, goal: null,
  });
  assertEquals(avant.outcome, "bounded");
  assertAlmostEquals(avant.mainFactor, 1.2, 1e-9);
  // Et une personne du milieu SANS forme (prise) ne relève rien.
  const sansForme = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1.6, tableFactor: 1, tableGoal: "muscle_gain",
    floorG: null, bounds: null, goal: "muscle_gain",
  });
  assertEquals(sansForme.outcome, "bounded");
  assertAlmostEquals(sansForme.mainFactor, 1.2, 1e-9);
});

Deno.test("grosse assiette en perte: son propre plafond de part s'applique aussi au-dessus du milieu", () => {
  // Facteur 1,2, milieu (maintien) à 1,0 ⇒ casserole du milieu 1,375 > 1,2.
  // Sa propre forme: 0,7 × 1 200/400 = 2,1 (≤ 2,0 × 1,2 = 2,4 ✓; bande basse
  // 0,8 × 1 200/400 = 2,4 ✓). Féculent (1 200 − 840)/600 = 0,6; part 360/1 200.
  const out = splitStarchSide({
    main: MAIN_S, side: SIDE_S, uniformFactor: 1.2, tableFactor: 1, tableGoal: "maintenance",
    floorG: null, bounds: null, goal: "fat_loss",
  });
  assertEquals(out.outcome, "goal_shape");
  assertAlmostEquals(out.mainFactor, 2.1, 1e-9);
  assertAlmostEquals(out.sideFactor, 0.6, 1e-9);
  assertAlmostEquals(out.starchShareAfter!, 0.3, 1e-9);
});

Deno.test("la personne du milieu: facteur ET objectif, même règle que `tableReferenceFactor`", () => {
  const trois = [
    { factor: 1.3, goal: "muscle_gain" as const },
    { factor: 0.8, goal: "fat_loss" as const },
    { factor: 1.0, goal: "maintenance" as const },
  ];
  assertEquals(tableReferenceOf(trois), { factor: 1.0, goal: "maintenance" });
  assertEquals(tableReferenceFactor(trois.map((r) => r.factor)), 1.0);
  // À nombre pair, la plus petite des deux du milieu.
  assertEquals(
    tableReferenceOf([{ factor: 1.2, goal: "muscle_gain" }, { factor: 0.9, goal: "fat_loss" }]),
    { factor: 0.9, goal: "fat_loss" },
  );
  // À facteurs égaux, l'ordre d'entrée départage.
  assertEquals(
    tableReferenceOf([
      { factor: 1.0, goal: "fat_loss" },
      { factor: 1.0, goal: null },
      { factor: 1.4, goal: "muscle_gain" },
    ]),
    { factor: 1.0, goal: null },
  );
  assertEquals(tableReferenceOf([{ factor: 1.2, goal: "fat_loss" }]), null, "une bouche n'est pas une table");
  assertEquals(tableReferenceOf([{ factor: Number.NaN, goal: null }, { factor: 1, goal: null }]), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ ⟳ 2026-09-23 — L'AJUSTEUR NE REÇOIT PLUS LES LIGNES AU-DESSUS DU MILIEU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("MORD — la ligne au-dessus du milieu d'un plat à deux casseroles saute", () => {
  const rows = [
    // Plat 0, deux casseroles, milieu 1,0: la ligne à 1,3 saute.
    { dishIndex: 0, factor: 0.8, sized: true, twoPot: true, who: "a" },
    { dishIndex: 0, factor: 1.0, sized: true, twoPot: true, who: "b" },
    { dishIndex: 0, factor: 1.3, sized: true, twoPot: true, who: "c" },
    // Plat 1, UNE casserole: tout reste, même au-dessus du milieu.
    { dishIndex: 1, factor: 0.8, sized: true, twoPot: false, who: "a" },
    { dishIndex: 1, factor: 1.3, sized: true, twoPot: false, who: "c" },
    // Plat 2, deux casseroles, une seule ligne dimensionnée: pas de table, rien ne saute.
    { dishIndex: 2, factor: 1.0, sized: true, twoPot: true, who: "b" },
    { dishIndex: 2, factor: 2.0, sized: false, twoPot: true, who: "c" },
  ];
  const out = rowsForProportionAdjust(rows);
  assertEquals(out.skipped_split_rows, 1);
  assertEquals(out.rows.map((r) => `${r.dishIndex}${r.who}`), ["0a", "0b", "1a", "1c", "2b", "2c"]);
});

Deno.test("PASSE À CÔTÉ — personne au-dessus du milieu: rien ne saute, et le zéro se compte", () => {
  const out = rowsForProportionAdjust([
    { dishIndex: 0, factor: 1.0, sized: true, twoPot: true },
    { dishIndex: 0, factor: 1.0, sized: true, twoPot: true },
    { dishIndex: 0, factor: 0.7, sized: true, twoPot: true },
  ]);
  assertEquals(out.skipped_split_rows, 0);
  assertEquals(out.rows.length, 3);
});

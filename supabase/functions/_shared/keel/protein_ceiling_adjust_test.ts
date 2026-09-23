/**
 * LE PLAFOND PROTÉIQUE, SUR LES PLATS MANGÉS SEUL — 2026-09-22.
 *
 * ⛔ TOUS LES NOMBRES ATTENDUS SONT EN DUR, jamais dérivés de la constante
 * testée. Un test paramétré par sa propre constante reste vert quand on déplace
 * la constante — ce dépôt l'a déjà payé, et la règle est écrite dans
 * `test-parameterized-by-its-own-constant`.
 *
 * ⛔ CHAQUE GARDE A UN CAS QUI MORD ET UN CAS QUI PASSE À CÔTÉ. Une garde
 * cassée bloque tout et ressemble trait pour trait à une garde qui marche.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ADDED_FAT_GROUPS,
  type AdjustableIngredient,
  type AdjustableUnit,
  PROTEIN_GROUPS,
} from "./proportion_adjust.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";
import {
  adjustProteinCeiling,
  CEILING_FIXED_REASONS,
  CEILING_STARCH_GROUPS,
  CEILING_STOPS,
  ceilingRoleFor,
  type CeilingMouthDay,
  type CeilingPart,
  isOverCeiling,
  KCAL_DRIFT_TOLERANCE,
  MAX_MOVES_PER_MOUTH_DAY,
  NO_CEILING_SOLUTION,
  PROTEIN_CEILING_PURSUED,
  PROTEIN_TOLERANCE_G,
  type ProteinMeasureFn,
  UNIT_SKIP_REASONS,
} from "./protein_ceiling_adjust.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE RÉFÉRENTIEL DU BANC — linéaire, donc la sonde est EXACTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Par gramme CRU. `ready` est le rendement cru → cuit. Rien ici ne prétend
// être le vrai référentiel: ce sont des nombres ronds choisis pour que les
// attentes du test puissent être écrites à la main.
const BENCH: Record<string, { kcal: number; protein: number; ready: number }> = {
  // 60 kcal et 10 g de protéine aux 100 g — un yaourt grec nature.
  yaourt: { kcal: 0.6, protein: 0.1, ready: 1 },
  // 380 kcal et 13 g aux 100 g — des flocons d'avoine crus.
  flocons: { kcal: 3.8, protein: 0.13, ready: 1 },
  // 900 kcal, zéro protéine.
  huile: { kcal: 9, protein: 0, ready: 1 },
  // Un blanc de poulet cru: 165 kcal, 31 g, rendement 0,75.
  poulet: { kcal: 1.65, protein: 0.31, ready: 0.75 },
  // Du riz cru: 360 kcal, 7 g, rendement 2,5 à la cuisson.
  riz: { kcal: 3.6, protein: 0.07, ready: 2.5 },
  // Une courgette: 17 kcal, 1,2 g — ni donneuse ni receveuse.
  courgette: { kcal: 0.17, protein: 0.012, ready: 0.9 },
  sel: { kcal: 0, protein: 0, ready: 1 },
};

const GROUPS: Record<string, FoodGroupRef> = {
  yaourt: "dairy_yogurt",
  flocons: "whole_grain",
  huile: "olive_oil",
  poulet: "poultry",
  riz: "refined_grain",
  courgette: "non_starchy_veg",
  sel: "non_starchy_veg",
};

/** La mesure injectée du banc: une somme, donc linéaire et sondable. */
const benchMeasure: ProteinMeasureFn = (ings) => {
  let kcal = 0;
  let readyG = 0;
  let proteinG = 0;
  for (const ing of ings) {
    const food = BENCH[ing.term];
    if (food === undefined) return { kcal: null, readyG: null, proteinG: null };
    const g = ing.grams ?? 0;
    kcal += g * food.kcal;
    readyG += g * food.ready;
    proteinG += g * food.protein;
  }
  return { kcal, readyG, proteinG };
};

interface LineSpec {
  term: keyof typeof BENCH | string;
  grams: number | null;
  condiment?: boolean;
  fixed?: boolean;
  /** Regroupe les lignes qui portent le même jeton dans UN corps rigide. */
  body?: string;
  /** `false` ⇒ corps immobile. */
  movable?: boolean;
}

function buildUnit(
  unitId: string,
  kind: "preparation" | "dish",
  specs: readonly LineSpec[],
  opts: { adjustable?: boolean } = {},
): AdjustableUnit {
  const ingredients: AdjustableIngredient[] = specs.map((s, i) => ({
    ingredientId: `${unitId}#${i}:${s.term}`,
    term: String(s.term),
    ref: null,
    refRefused: false,
    grams: s.grams,
    baselineGrams: s.grams,
    group: GROUPS[String(s.term)] ?? null,
    isCondiment: s.condiment === true,
    fixed: s.fixed === true,
  }));
  const byBody = new Map<string, { lineIds: string[]; movable: boolean }>();
  for (const [i, s] of specs.entries()) {
    const id = s.body ?? `solo${i}`;
    const bucket = byBody.get(id) ?? { lineIds: [], movable: s.movable !== false };
    bucket.lineIds.push(ingredients[i].ingredientId);
    if (s.movable === false) bucket.movable = false;
    byBody.set(id, bucket);
  }
  return {
    unitId,
    kind,
    ingredients,
    adjustable: opts.adjustable !== false,
    fixedReason: opts.adjustable === false ? "method_spells_quantities" : null,
    bodies: [...byBody.entries()].map(([id, b]) => ({
      bodyId: `${unitId}~${id}`,
      componentIds: [],
      lineIds: b.lineIds,
      movable: b.movable,
      reason: b.movable ? null : "contract_absent" as const,
    })),
  };
}

function soloParts(unitId: string): CeilingPart[] {
  return [{ unitId, share: 1, solo: true }];
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES VOCABULAIRES SONT FERMÉS, ET LES COMPTEURS LES COUVRENT EN ENTIER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("vocabulaires fermés: chaque motif et chaque arrêt a sa case de compteur", () => {
  const out = adjustProteinCeiling({
    units: [buildUnit("dish:0", "dish", [{ term: "yaourt", grams: 100 }])],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 100,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(Object.keys(out.counts.stopped).sort(), [...CEILING_STOPS].sort());
  assertEquals(
    Object.keys(out.counts.fixed_by_reason).sort(),
    [...CEILING_FIXED_REASONS].sort(),
  );
  assertEquals(
    Object.keys(out.counts.skipped_by_reason).sort(),
    [...UNIT_SKIP_REASONS].sort(),
  );
  // 12 arrêts, 10 motifs de ligne, 5 motifs d'unité: le jour où l'un bouge, ce
  // test le dit. Nombres EN DUR.
  assertEquals(CEILING_STOPS.length, 12);
  assertEquals(CEILING_FIXED_REASONS.length, 10);
  assertEquals(UNIT_SKIP_REASONS.length, 5);
});

Deno.test("⟳ 2026-09-22 — la passe est ÉTEINTE: le plafond est une mesure", () => {
  assertEquals(PROTEIN_CEILING_PURSUED, false);
});

Deno.test("épinglage — les réglages de la recherche, en dur", () => {
  // ⛔ ÉPINGLÉS, PAS SEULEMENT IMPORTÉS. Un test qui se contente d'employer une
  // constante reste vert quand on la déplace; c'est la règle de dépôt que
  // `constant_pinning_gate_test.ts` fait respecter.
  //
  // 5 kcal de dérive d'énergie tolérée par unité, comptée contre sa mesure
  // d'ENTRÉE et pas contre le déplacement précédent.
  assertEquals(KCAL_DRIFT_TOLERANCE, 5);
  // 200 déplacements par journée-bouche. Pas 201.
  assertEquals(MAX_MOVES_PER_MOUTH_DAY, 200);
  // 0,05 g de protéine: en dessous, c'est du bruit d'arrondi.
  assertEquals(PROTEIN_TOLERANCE_G, 0.05);
});

Deno.test("aucun groupe n'est à la fois donneur et receveur", () => {
  const donors: FoodGroupRef[] = [];
  const receivers: FoodGroupRef[] = [];
  for (const g of FOOD_GROUP_REFS) {
    const role = ceilingRoleFor(g);
    if (role === "donor") donors.push(g);
    if (role === "receiver") receivers.push(g);
  }
  for (const g of donors) assert(!receivers.includes(g), `${g} est des deux côtés`);
  // Les dix groupes protéiques de `PROTEIN_GROUPS`, importés et pas recopiés.
  assertEquals(donors.length, 10);
  assertEquals(PROTEIN_GROUPS.size, 10);
  // Trois féculents plus deux graisses ajoutées.
  assertEquals(receivers.length, 5);
  assertEquals(CEILING_STARCH_GROUPS.size, 3);
  assertEquals(ADDED_FAT_GROUPS.size, 2);
  // Un légume n'est NI l'un NI l'autre: il faudrait 300 g de courgettes pour
  // rendre l'énergie de 40 g de poulet.
  assertEquals(ceilingRoleFor("non_starchy_veg"), null);
  assertEquals(ceilingRoleFor("dairy_cheese"), null);
  assertEquals(ceilingRoleFor(null), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE DÉCLENCHEUR — un cas qui MORD, un cas qui PASSE À CÔTÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("isOverCeiling: la tolérance mord au-delà, pas en deçà", () => {
  // Plafond 100 g, tolérance 10 % ⇒ le seuil est 110 g. Nombres en dur.
  assertEquals(isOverCeiling(109, 100, 0.1), false);
  assertEquals(isOverCeiling(110, 100, 0.1), false);
  assertEquals(isOverCeiling(110.5, 100, 0.1), true);
  assertEquals(isOverCeiling(146, 100, 0.1), true);
  // Une absence n'est jamais un dépassement.
  assertEquals(isOverCeiling(null, 100, 0.1), false);
  assertEquals(isOverCeiling(200, null, 0.1), false);
  assertEquals(isOverCeiling(200, 0, 0.1), false);
});

Deno.test("la passe MORD: une journée solo au-dessus de son plafond redescend", () => {
  // 400 g de yaourt (40,0 g de protéine) + 60 g de flocons (7,8 g) = 47,8 g.
  // Énergie: 400 × 0,6 + 60 × 3,8 = 240 + 228 = 468 kcal.
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400 },
    { term: "flocons", grams: 60 },
  ]);
  const before = benchMeasure(unit.ingredients);
  assertEquals(before.proteinG, 47.8);
  assertEquals(before.kcal, 468);

  const out = adjustProteinCeiling({
    units: [unit],
    // Plafond 30 g ⇒ seuil 33 g. 47,8 > 33: la passe mord.
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });

  const verdict = out.mouthDays[0];
  assertEquals(verdict.overBefore, true);
  assertEquals(verdict.proteinBeforeG, 47.8);
  assert(verdict.moves > 0, "aucun déplacement");
  assert(
    verdict.proteinAfterG !== null && verdict.proteinAfterG < 40,
    `protéine après = ${verdict.proteinAfterG}`,
  );
  // Le yaourt ne descend pas sous 50 % de sa ligne initiale: 200 g.
  const yaourt = out.units[0].ingredients[0];
  const flocons = out.units[0].ingredients[1];
  assertEquals(yaourt.floorGrams, 200);
  assert(yaourt.grams !== null && yaourt.grams >= 200, `yaourt = ${yaourt.grams}`);
  assert(yaourt.grams !== null && yaourt.grams < 400, "le yaourt n'a pas bougé");
  assert(flocons.grams !== null && flocons.grams > 60, "les flocons n'ont pas monté");
  // ⛔ L'ÉNERGIE EST L'INVARIANT.
  const after = benchMeasure(
    out.units[0].ingredients.map((ing, i) => ({ ...unit.ingredients[i], grams: ing.grams })),
  );
  assert(after.kcal !== null, "énergie perdue");
  assert(
    Math.abs(after.kcal! - 468) <= KCAL_DRIFT_TOLERANCE,
    `dérive d'énergie = ${after.kcal! - 468} kcal`,
  );
  assertEquals(out.counts.adjusted_mouth_days, 1);
  assert(out.counts.moved_g > 0);
  assertEquals(out.counts.reverted_after_measure, 0);
});

Deno.test("la passe PASSE À CÔTÉ: une journée dans la tolérance n'est pas touchée", () => {
  // 100 g de yaourt = 10,0 g de protéine. Plafond 10 g ⇒ seuil 11 g.
  // 10,0 ≤ 11: rien ne bouge, et c'est NOMMÉ.
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 100 },
    { term: "flocons", grams: 50 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      // 100 × 0,1 + 50 × 0,13 = 16,5 g. Plafond 20 ⇒ seuil 22. Sous le seuil.
      ceilingG: 20,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays[0].proteinBeforeG, 16.5);
  assertEquals(out.mouthDays[0].overBefore, false);
  assertEquals(out.mouthDays[0].stop, "not_over");
  assertEquals(out.counts.stopped.not_over, 1);
  assertEquals(out.counts.moves_total, 0);
  assertEquals(out.counts.adjusted_mouth_days, 0);
  assertEquals(out.counts.moved_g, 0);
  assertEquals(out.outcome, "nothing_to_do");
  assertEquals(out.units[0].ingredients[0].grams, 100);
  assertEquals(out.units[0].ingredients[1].grams, 50);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES DEUX INTERDITS ABSOLUS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("un plat PARTAGÉ n'est jamais touché, même largement au-dessus", () => {
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400 },
    { term: "flocons", grams: 60 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      // ⛔ LA SEULE DIFFÉRENCE AVEC LE CAS QUI MORD: la case a deux mangeurs.
      parts: [{ unitId: "dish:0", share: 1, solo: false }],
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays[0].overBefore, true);
  assertEquals(out.mouthDays[0].stop, "no_solo_unit");
  assertEquals(out.counts.moves_total, 0);
  assertEquals(out.counts.units_touched, 0);
  assertEquals(out.counts.units_touchable, 0);
  assertEquals(out.counts.skipped_by_reason.shared_cell, 1);
  assertEquals(out.skippedUnits, [{ unitId: "dish:0", reason: "shared_cell" }]);
  // Aucun gramme n'a bougé.
  assertEquals(out.units[0].ingredients[0].grams, 400);
  assertEquals(out.units[0].ingredients[1].grams, 60);
  // ⛔ ET LE DÉPASSEMENT RESTE COMPTÉ: s'abstenir n'est pas fermer.
  assertEquals(out.counts.residual_over, 1);
  assertEquals(out.mouthDays[0].note, NO_CEILING_SOLUTION);
  assertEquals(out.outcome, "not_found_within_limits");
});

Deno.test("une casserole citée par DEUX bouches est hors de portée", () => {
  const prep = buildUnit("prep:p1", "preparation", [
    { term: "poulet", grams: 600 },
    { term: "riz", grams: 200 },
  ]);
  const out = adjustProteinCeiling({
    units: [prep],
    mouthDays: [
      {
        mouthKey: "m0",
        dayToken: "mon",
        ceilingG: 30,
        // Les deux se déclarent `solo` — un appelant distrait. La seconde garde
        // refuse quand même: deux bouches ne peuvent pas manger seules la même
        // casserole.
        parts: [{ unitId: "prep:p1", share: 0.5, solo: true }],
      },
      {
        mouthKey: "m1",
        dayToken: "mon",
        ceilingG: 30,
        parts: [{ unitId: "prep:p1", share: 0.5, solo: true }],
      },
    ],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.counts.skipped_by_reason.two_mouths, 1);
  assertEquals(out.counts.moves_total, 0);
  assertEquals(out.units[0].ingredients[0].grams, 600);
  assertEquals(out.units[0].ingredients[1].grams, 200);
});

Deno.test("aucun ingrédient n'est ajouté, retiré ni remplacé", () => {
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400 },
    { term: "flocons", grams: 60 },
    { term: "huile", grams: 10 },
    { term: "sel", grams: 2, condiment: true },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 25,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.units.length, 1);
  assertEquals(
    out.units[0].ingredients.map((i) => i.ingredientId),
    unit.ingredients.map((i) => i.ingredientId),
  );
  assertEquals(out.units[0].ingredients.map((i) => i.term), [
    "yaourt",
    "flocons",
    "huile",
    "sel",
  ]);
  // Le condiment ne bouge pas, et son motif est NOMMÉ.
  assertEquals(out.units[0].ingredients[3].grams, 2);
  assertEquals(out.counts.fixed_by_reason.condiment, 1);
  // L'huile est une receveuse, plafonnée à 125 % — 12,5 g sur 10 g de base.
  assertEquals(out.units[0].ingredients[2].ceilingGrams, 12.5);
  const huile = out.units[0].ingredients[2].grams;
  assert(huile !== null && huile <= 12.5, `huile = ${huile}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES ABSENCES SONT COMPTÉES, JAMAIS COMBLÉES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("une bouche SANS plafond lisible n'est pas ajustée, et ça se compte", () => {
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400 },
    { term: "flocons", grams: 60 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      // ⛔ Mineur, corps illisible: `proteinCeilingGFor` rend `null`. On ne
      // fabrique pas un nombre pour combler l'absence.
      ceilingG: null,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays[0].stop, "no_ceiling");
  assertEquals(out.mouthDays[0].overBefore, false);
  assertEquals(out.mouthDays[0].overAfter, false);
  assertEquals(out.counts.mouth_days_without_ceiling, 1);
  assertEquals(out.counts.mouth_days_total, 1);
  assertEquals(out.counts.moves_total, 0);
  assertEquals(out.counts.adjusted_mouth_days, 0);
  assertEquals(out.units[0].ingredients[0].grams, 400);
});

Deno.test("une journée dont la protéine ne se mesure pas n'est pas ajustée", () => {
  const unit = buildUnit("dish:0", "dish", [
    { term: "inconnu_du_banc", grams: 400 },
    { term: "flocons", grams: 60 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays[0].stop, "unmeasurable");
  assertEquals(out.mouthDays[0].proteinBeforeG, null);
  assertEquals(out.counts.mouth_days_unmeasurable, 1);
  assertEquals(out.counts.skipped_by_reason.unmeasurable, 1);
  assertEquals(out.counts.moves_total, 0);
});

Deno.test("une unité non ajustable par l'appelant reste intacte", () => {
  const unit = buildUnit(
    "dish:0",
    "dish",
    [{ term: "yaourt", grams: 400 }, { term: "flocons", grams: 60 }],
    { adjustable: false },
  );
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.counts.skipped_by_reason.unit_fixed, 1);
  assertEquals(out.counts.fixed_by_reason.unit_fixed, 2);
  assertEquals(out.mouthDays[0].stop, "no_solo_unit");
  assertEquals(out.units[0].ingredients[0].grams, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES BORNES, ET CE QU'ELLES LAISSENT OUVERT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("le plancher de la donneuse arrête la passe, et le reste est COMPTÉ", () => {
  // 1 000 g de poulet = 310 g de protéine, plafond 50 g ⇒ seuil 55 g.
  // Le poulet ne descend pas sous 500 g ⇒ au mieux 155 g + ce que le riz
  // apporte. La passe ne peut PAS fermer, et elle le dit.
  const unit = buildUnit("dish:0", "dish", [
    { term: "poulet", grams: 1000 },
    { term: "riz", grams: 100 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 50,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  const poulet = out.units[0].ingredients[0];
  assertEquals(poulet.floorGrams, 500);
  assert(poulet.grams !== null && poulet.grams >= 500, `poulet = ${poulet.grams}`);
  assertEquals(out.mouthDays[0].overAfter, true);
  assertEquals(out.mouthDays[0].note, NO_CEILING_SOLUTION);
  assertEquals(out.counts.residual_over, 1);
  assertEquals(out.counts.adjusted_mouth_days, 1);
  assertEquals(out.outcome, "not_found_within_limits");
  assert(out.counts.moves_total <= MAX_MOVES_PER_MOUTH_DAY);
  // Le riz ne dépasse pas 200 % de sa ligne initiale.
  assertEquals(out.units[0].ingredients[1].ceilingGrams, 200);
  const riz = out.units[0].ingredients[1].grams;
  assert(riz !== null && riz <= 200, `riz = ${riz}`);
});

Deno.test("le plafond de la receveuse arrête aussi, et l'énergie ne s'évapore pas", () => {
  // La seule receveuse est de l'huile, plafonnée à 125 % (12,5 g sur 10 g).
  // Elle ne peut absorber que 2,5 × 9 = 22,5 kcal, soit 37,5 g de yaourt.
  const unit = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400 },
    { term: "huile", grams: 10 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 10,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  const huile = out.units[0].ingredients[1].grams;
  assert(huile !== null && huile <= 12.5, `huile = ${huile}`);
  const yaourt = out.units[0].ingredients[0].grams;
  assert(yaourt !== null && yaourt >= 362, `yaourt = ${yaourt}`);
  // 400 × 0,6 + 10 × 9 = 330 kcal au départ.
  const after = benchMeasure(
    out.units[0].ingredients.map((ing, i) => ({ ...unit.ingredients[i], grams: ing.grams })),
  );
  assert(
    after.kcal !== null && Math.abs(after.kcal - 330) <= KCAL_DRIFT_TOLERANCE,
    `énergie après = ${after.kcal}`,
  );
  assertEquals(out.counts.residual_over, 1);
});

Deno.test("sans receveuse, rien ne bouge: on ne retire pas de la protéine, on la déplace", () => {
  // Du poulet et des courgettes. La courgette n'est pas une receveuse: retirer
  // du poulet sans rien rendre ferait fondre l'assiette au lieu de la
  // rééquilibrer.
  const unit = buildUnit("dish:0", "dish", [
    { term: "poulet", grams: 500 },
    { term: "courgette", grams: 300 },
  ]);
  const out = adjustProteinCeiling({
    units: [unit],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 50,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.counts.moves_total, 0);
  assertEquals(out.mouthDays[0].stop, "no_improving_move");
  assertEquals(out.units[0].ingredients[0].grams, 500);
  assertEquals(out.units[0].ingredients[1].grams, 300);
  assertEquals(out.counts.fixed_by_reason.not_a_lever, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA STRUCTURE CULINAIRE — la précondition du lot, mesurée
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("un corps IMMOBILE fige ses lignes; un corps MOBILE à plusieurs lignes les libère, et le compteur le dit", () => {
  // ⛔ LE CAS NOMINAL DES PLANS SANS `components`: `bodiesOfUnit` rend UN corps
  // immobile qui porte tout. La passe ne peut alors RIEN déplacer — et c'est ce
  // compteur-là qui empêche de lire un lot désarmé comme un lot qui marche.
  const figé = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400, body: "tout", movable: false },
    { term: "flocons", grams: 60, body: "tout", movable: false },
  ]);
  const out = adjustProteinCeiling({
    units: [figé],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.counts.fixed_by_reason.component_locked, 2);
  assertEquals(out.counts.lines_free, 0);
  assertEquals(out.mouthDays[0].stop, "all_fixed");
  assertEquals(out.counts.moves_total, 0);

  // ── LE CAS QUI PASSE À CÔTÉ: un corps MOBILE à plusieurs lignes ──────────
  // ⛔ L'ÉCART ASSUMÉ AVEC `proportion_adjust.ts` (voir l'arbitrage écrit dans
  // la préparation des unités): dans un corps mobile, chaque ligne est un
  // levier. Le coût se compte dans `lines_free_inside_body`.
  // Calcul à la main: le yaourt descend à son plancher (0,5 × 400 = 200 g),
  // soit −20 g de protéine et −120 kcal; l'avoine reprend ces 120 kcal à
  // l'arrondi des déplacements près: +31,6 g ⇒ +120,08 kcal et +4,108 g.
  // 47,8 − 20 + 4,108 = 31,908 g, sous 30 × 1,1 = 33.
  const soudé = buildUnit("dish:0", "dish", [
    { term: "yaourt", grams: 400, body: "sauce" },
    { term: "flocons", grams: 60, body: "sauce" },
  ]);
  const out2 = adjustProteinCeiling({
    units: [soudé],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 30,
      parts: soloParts("dish:0"),
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out2.counts.fixed_by_reason.component_locked, 0);
  assertEquals(out2.counts.lines_free, 2);
  assertEquals(out2.counts.lines_free_inside_body, 2);
  assertEquals(out2.units[0].ingredients[0].grams, 200);
  assertEquals(out2.units[0].ingredients[1].grams, 91.6);
  assertEquals(out2.mouthDays[0].proteinAfterG, 31.91);
  assertEquals(out2.mouthDays[0].overAfter, false);
  assertEquals(out2.mouthDays[0].stop, "floor");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ PLUSIEURS JOURNÉES, PLUSIEURS BOUCHES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("la journée au-dessus est ajustée, celle qui va bien ne l'est pas", () => {
  const units = [
    buildUnit("dish:0", "dish", [
      { term: "yaourt", grams: 400 },
      { term: "flocons", grams: 60 },
    ]),
    buildUnit("dish:1", "dish", [
      { term: "yaourt", grams: 100 },
      { term: "flocons", grams: 60 },
    ]),
  ];
  const mouthDays: CeilingMouthDay[] = [
    // Lundi: 47,8 g, plafond 30 ⇒ seuil 33. Au-dessus.
    { mouthKey: "m0", dayToken: "mon", ceilingG: 30, parts: soloParts("dish:0") },
    // Mardi: 10 + 7,8 = 17,8 g, plafond 30 ⇒ seuil 33. En dessous.
    { mouthKey: "m0", dayToken: "tue", ceilingG: 30, parts: soloParts("dish:1") },
  ];
  const out = adjustProteinCeiling({
    units,
    mouthDays,
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.counts.mouth_days_total, 2);
  assertEquals(out.counts.mouth_days_over_before, 1);
  assertEquals(out.counts.adjusted_mouth_days, 1);
  assertEquals(out.counts.units_touched, 1);
  // Le plat du mardi n'a pas bougé d'un gramme.
  assertEquals(out.units[1].ingredients[0].grams, 100);
  assertEquals(out.units[1].ingredients[1].grams, 60);
  assertEquals(out.units[1].touched, false);
  assertEquals(out.units[0].touched, true);
  // Tous les déplacements portent la bonne adresse.
  for (const m of out.moves) {
    assertEquals(m.mouthKey, "m0");
    assertEquals(m.dayToken, "mon");
    assertEquals(m.unitId, "dish:0");
  }
});

Deno.test("la part d'une casserole compte dans la journée, et la casserole reste mesurée entière", () => {
  // Une casserole solo tirée par deux plats du MÊME jour: chaque plat en prend
  // la moitié, donc la journée en voit la totalité.
  const prep = buildUnit("prep:p1", "preparation", [
    { term: "poulet", grams: 400 },
    { term: "riz", grams: 200 },
  ]);
  const before = benchMeasure(prep.ingredients);
  // 400 × 0,31 + 200 × 0,07 = 124 + 14 = 138 g de protéine.
  assertEquals(before.proteinG, 138);
  const out = adjustProteinCeiling({
    units: [prep],
    mouthDays: [{
      mouthKey: "m0",
      dayToken: "mon",
      ceilingG: 60,
      parts: [
        { unitId: "prep:p1", share: 0.5, solo: true },
        { unitId: "prep:p1", share: 0.5, solo: true },
      ],
    }],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays[0].proteinBeforeG, 138);
  assertEquals(out.mouthDays[0].overBefore, true);
  assert(out.counts.moves_total > 0);
  const poulet = out.units[0].ingredients[0].grams;
  assert(poulet !== null && poulet >= 200, `poulet = ${poulet}`);
  assert(poulet !== null && poulet < 400, "le poulet n'a pas bougé");
});

Deno.test("une casserole solo partagée entre DEUX jours baisse pour les deux", () => {
  // ⛔ IL N'Y A PAS DE GARDE DE DÉGRADATION, ET CE TEST DIT POURQUOI: la même
  // casserole nourrit la bouche `m0` deux jours. Lundi est au-dessus de son
  // plafond, mardi très en dessous. Le déplacement fait BAISSER les deux — une
  // journée conforme ne peut pas être poussée au-dessus par une baisse.
  const prep = buildUnit("prep:p1", "preparation", [
    { term: "poulet", grams: 400 },
    { term: "riz", grams: 200 },
  ]);
  const out = adjustProteinCeiling({
    units: [prep],
    mouthDays: [
      {
        mouthKey: "m0",
        dayToken: "mon",
        ceilingG: 60,
        parts: [{ unitId: "prep:p1", share: 1, solo: true }],
      },
      {
        mouthKey: "m0",
        dayToken: "tue",
        // 138 g de protéine, plafond 200 ⇒ seuil 220. Très en dessous: aucune
        // baisse ne peut la faire passer au-dessus.
        ceilingG: 200,
        parts: [{ unitId: "prep:p1", share: 1, solo: true }],
      },
    ],
    measure: benchMeasure,
    tolerance: 0.1,
  });
  assertEquals(out.mouthDays.find((v) => v.dayToken === "tue")?.overAfter, false);
  // Mardi profite de la baisse de lundi: la casserole est la même.
  const mardi = out.mouthDays.find((v) => v.dayToken === "tue");
  assert(
    mardi?.proteinAfterG !== null && mardi!.proteinAfterG! < 138,
    `mardi = ${mardi?.proteinAfterG}`,
  );
});

/**
 * L-anchor-nodelivery — LES ÉPREUVES DE LA DÉCOMPOSITION.
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche
 * `L-anchor-nodelivery`.
 *
 * ── ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE ──────────────────────────────
 * Cassée, une garde bloque tout et ressemble à une garde qui marche. Chaque
 * `Deno.test` ci-dessous porte donc AU MOINS un cas qui doit rendre
 * `delivered` — c'est-à-dire un cas qu'un classement cassé ferait rougir.
 *
 * ── CE QUE CES ÉPREUVES TIENNENT ──────────────────────────────────────────
 * ① les sept causes, chacune sur une ligne qui la produit vraiment;
 * ② l'ordre exact de `mouth_anchor.ts:604` — `kcal === null` AVANT `<= 0`;
 * ③ ⛔ que `no_box` seul ne fabrique JAMAIS une cause bloquante;
 * ④ que `anchorFactorFor` rend `common_pot_day` très exactement là où
 *    `deliveryCauseOf` rend `common_pot_only`, et `no_delivery` partout
 *    ailleurs — c'est la jointure que ce lot livre.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DELIVERY_CAUSE_VERDICT,
  DELIVERY_CAUSES,
  deliveryCauseOf,
  gapKeyOf,
} from "./mouth_delivery_cause.ts";
import type { MouthDayEnergy, MouthEnergyGap } from "./mouth_energy.ts";
import { ANCHOR_REASONS, type AnchorMouth, anchorFactorFor } from "./mouth_anchor.ts";
import { PLAN_ENERGY_BASIS } from "./plan_energy.ts";

function day(
  over: Partial<MouthDayEnergy> & { gaps?: MouthEnergyGap[] },
): MouthDayEnergy {
  return {
    memberId: "m1",
    day: "mon",
    kcal: null,
    basis: PLAN_ENERGY_BASIS,
    complete: false,
    dishesCounted: 0,
    dishesTotal: 1,
    unattributedDishes: 0,
    subject: "the_day",
    slots: ["dinner"],
    // ⚠️ LE DÉFAUT EST « SEULE SUR SON COUVERCLE », parce que c'est le cas
    // nominal d'une fixture: une bouche qui a un dîner composé et dont on sait
    // le lire. Un défaut vide ferait s'abstenir l'ancrage sur toutes les
    // fixtures de ce fichier, et les tests passeraient en n'éprouvant plus le
    // chemin qu'ils nomment.
    ownSlots: ["dinner"],
    grams: 0,
    maxMealGrams: 0,
    gaps: [],
    ...over,
  };
}

Deno.test("les sept causes sortent chacune de la ligne qui la produit", () => {
  // ⛔ LE CAS QUI PASSE, EN PREMIER. Sans lui, un classifieur qui rendrait
  // `mixed_gaps` pour tout serait vert sur les six autres.
  assertEquals(
    deliveryCauseOf(day({ kcal: 1800, complete: true, dishesCounted: 1 })),
    "delivered",
  );
  assertEquals(deliveryCauseOf(null), "no_row");
  assertEquals(deliveryCauseOf(day({ gaps: ["common_pot"] })), "common_pot_only");
  assertEquals(
    deliveryCauseOf(day({ gaps: ["dish_incomplete"] })),
    "unreadable_dishes_only",
  );
  assertEquals(deliveryCauseOf(day({ gaps: ["empty_box"] })), "empty_box_only");
  assertEquals(
    deliveryCauseOf(day({ gaps: ["common_pot", "dish_incomplete"] })),
    "mixed_gaps",
  );
  assertEquals(
    deliveryCauseOf(day({ kcal: 0, complete: true, dishesCounted: 1 })),
    "zero_kcal",
  );
});

Deno.test("`no_box` seul n'est JAMAIS une cause de silence", () => {
  // Un plat sans couvercle retire aussi le MOMENT de la cible: les deux côtés
  // du rapport baissent ensemble. Le compter comme bloquant ferait basculer
  // TOUTE journée du corpus en `mixed_gaps` — mesuré: 80 lignes sur 100 en
  // portent un, en plus de leur vraie cause.
  assertEquals(
    deliveryCauseOf(day({ gaps: ["common_pot", "no_box"] })),
    "common_pot_only",
  );
  assertEquals(
    deliveryCauseOf(day({ gaps: ["dish_incomplete", "no_box"] })),
    "unreadable_dishes_only",
  );
  // ⛔ ET LE CAS QUI PASSE: une journée qui LIVRE malgré un `no_box` reste
  // `delivered`. Une garde qui mordrait sur `no_box` la ferait rougir ici.
  assertEquals(
    deliveryCauseOf(day({ kcal: 900, gaps: ["no_box"], dishesCounted: 1 })),
    "delivered",
  );
});

Deno.test("l'ordre de `mouth_anchor.ts:604` est respecté: `null` avant `<= 0`", () => {
  // `kcal === null` porte des `gaps`; `kcal === 0` n'en porte pas et n'est pas
  // le même défaut. Inverser les deux lectures rendrait `zero_kcal` sur une
  // journée entièrement muette, c'est-à-dire un chiffre à la place d'un vide.
  assertEquals(deliveryCauseOf(day({ kcal: null, gaps: ["empty_box"] })), "empty_box_only");
  assertEquals(deliveryCauseOf(day({ kcal: 0, gaps: [] })), "zero_kcal");
  assertEquals(deliveryCauseOf(day({ kcal: -5, gaps: [] })), "zero_kcal");
});

Deno.test("chaque cause porte un verdict, et `delivered` seul est `n/a`", () => {
  for (const c of DELIVERY_CAUSES) {
    const v = DELIVERY_CAUSE_VERDICT[c];
    assertEquals(
      v === "juste" || v === "defaut" || v === "n/a",
      true,
      `${c} n'a pas de verdict lisible`,
    );
  }
  assertEquals(DELIVERY_CAUSE_VERDICT.delivered, "n/a");
  // ⛔ LES DEUX SILENCES VOULUS, ÉPINGLÉS. Les faire passer en `defaut`
  // ferait viser à un lot une population qu'il ne peut pas atteindre.
  assertEquals(DELIVERY_CAUSE_VERDICT.no_row, "juste");
  assertEquals(DELIVERY_CAUSE_VERDICT.common_pot_only, "juste");
  assertEquals(DELIVERY_CAUSE_VERDICT.unreadable_dishes_only, "defaut");
});

Deno.test("`gapKeyOf` rend l'ensemble exact, trié, et garde `no_box`", () => {
  assertEquals(gapKeyOf(day({ gaps: [] })), "«aucune»");
  assertEquals(gapKeyOf(day({ gaps: ["no_box", "common_pot"] })), "common_pot+no_box");
  assertEquals(gapKeyOf(day({ gaps: ["common_pot", "no_box"] })), "common_pot+no_box");
});

// ---------------------------------------------------------------------------
// LA JOINTURE — c'est elle que le lot livre
// ---------------------------------------------------------------------------

/**
 * ⚠️ UN CORPS RÉEL, ET UNE DIRECTION NULLE. Sans direction, la cible EST
 * l'entretien: la journée s'ancre dès qu'elle livre, et le « cas qui passe »
 * n'est pas à la merci d'une allure de perte de poids.
 */
const MOUTH: AnchorMouth = {
  memberId: "m1",
  ageState: "adult",
  restriction: "clear",
  body: {
    appetite: null,
    heightCm: 168,
    weightKg: 62,
    gender: "female",
    ageYears: 41,
    activityLevel: "on_feet",
    activityAxes: { day: null, sport: null, asked: false },
  },
  direction: null,
  paceKgPerWeek: null,
  conditionRefs: [],
  // ⟳ 2026-09-08 — `null` = aucune réponse de part, donc une cible
  // EXACTEMENT celle d'avant ce lot. C'est la propriété que ces cas
  // mesurent, et elle doit rester vraie.
  portionIndex: null,
  declaredSlots: [],
};

Deno.test("`anchorFactorFor` sort `common_pot_day` sur un bac, `no_delivery` sinon", () => {
  // ⛔ LE CAS QUI PASSE, D'ABORD: une journée lisible s'ancre. Un lot qui
  // aurait cassé la branche rendrait ici autre chose que `anchored`/`clamped`.
  const vivante = anchorFactorFor(
    MOUTH,
    day({ kcal: 1800, complete: true, dishesCounted: 1, gaps: [], maxMealGrams: 600 }),
    "no_position",
  );
  assertEquals(vivante.reason === "anchored" || vivante.reason === "clamped", true);

  assertEquals(
    anchorFactorFor(MOUTH, day({ gaps: ["common_pot"] }), "no_position").reason,
    "common_pot_day",
  );
  assertEquals(
    anchorFactorFor(MOUTH, day({ gaps: ["common_pot", "no_box"] }), "no_position").reason,
    "common_pot_day",
  );
  // Tout le reste garde `no_delivery` — le seau du RÉPARABLE.
  assertEquals(
    anchorFactorFor(MOUTH, day({ gaps: ["dish_incomplete"] }), "no_position").reason,
    "no_delivery",
  );
  assertEquals(
    anchorFactorFor(MOUTH, day({ gaps: ["empty_box"] }), "no_position").reason,
    "no_delivery",
  );
  assertEquals(
    anchorFactorFor(MOUTH, day({ gaps: ["common_pot", "empty_box"] }), "no_position").reason,
    "no_delivery",
  );
  assertEquals(anchorFactorFor(MOUTH, null, "no_position").reason, "no_delivery");
});

Deno.test("`common_pot_day` NE DÉPLACE AUCUN GRAMME", () => {
  // La branche rend le MÊME objet qu'avant, à l'étiquette près. C'est la
  // seule preuve qui empêche ce lot de devenir un lot de grammes déguisé.
  const a = anchorFactorFor(MOUTH, day({ gaps: ["common_pot"] }), "no_position");
  const b = anchorFactorFor(MOUTH, day({ gaps: ["dish_incomplete"] }), "no_position");
  assertEquals(a.factor, 1);
  assertEquals(a.raw, null);
  assertEquals(a.deliveredKcal, null);
  assertEquals(a.factor, b.factor);
  assertEquals(a.targetKcal, b.targetKcal);
  // ⛔ ET LE JETON EST DANS LE VOCABULAIRE. Sans ça, le générateur
  // l'écrirait dans un seau qu'aucune initialisation n'a créé, et le
  // compteur rendrait `undefined` en silence.
  assertEquals(ANCHOR_REASONS.includes("common_pot_day"), true);
});

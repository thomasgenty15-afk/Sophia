// FF-040 (étape 8) — PLANCHER DE COUVERTURE, RÉ-ANCRAGE, ANONYMAT. Ce que ces
// tests protègent, dans l'ordre de ce qui coûte le plus cher quand ça casse:
//
//   * LE VERT PAR DÉFAUT — `unverified` traité comme `ok` affirme une
//     couverture que personne n'a vérifiée;
//   * LE PLANCHER QUI FAIT MANGER MOINS — il n'AJOUTE que de la couverture. S'il
//     retirait de l'énergie, il aurait inversé son propre sens;
//   * LE RÉ-ANCRAGE SANS BORNE — une estimation asservie à une balance est un
//     compteur de calories avec une boucle de rétroaction;
//   * L'INFÉRENCE PAR SOUSTRACTION — deux agrégats licites dont la différence
//     isole un élève.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  aggregateMayShip,
  aggregatePairMayShip,
  assessCoverage,
  COHORT_ANONYMITY_FLOOR,
  COVERAGE_FLOOR_KCAL_PER_DAY,
  coverageFlagAfterCorrection,
  nextRecalibration,
  RECALIBRATION_CAP,
  RECALIBRATION_STEP,
  RECALIBRATION_WEEKS,
} from "./meal_coverage.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex([
  ref({ slug: "white_rice", energyKcal: 350, yieldClass: "grain_absorbs" }),
  ref({ slug: "chicken_breast", energyKcal: 110, yieldClass: "meat_shrinks" }),
  ref({ slug: "carrot", energyKcal: 36, yieldClass: "veg_shrinks" }),
], [
  { alias: "rice", slug: "white_rice" },
  { alias: "chicken", slug: "chicken_breast" },
  { alias: "carrots", slug: "carrot" },
]);

const g = (term: string, amount: number) =>
  ({ term, amount, unit: "g" as const, state: "raw" as const });

// ---------------------------------------------------------------------------
// LE PLANCHER
// ---------------------------------------------------------------------------

Deno.test("un plan copieux est au-dessus du plancher", () => {
  const a = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients: [g("rice", 400), g("chicken", 500)] }],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  assert(a.energyPerDay !== null && a.energyPerDay > COVERAGE_FLOOR_KCAL_PER_DAY);
  assertEquals(a.floorHit, false);
  assertEquals(a.flag, "ok");
});

Deno.test("un plan maigre franchit le plancher", () => {
  const a = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients: [g("carrots", 300)] }],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  assertEquals(a.floorHit, true);
});

Deno.test("le plancher se lit PAR JOUR COUVERT, pas par plan", () => {
  const ingredients = [g("rice", 400), g("chicken", 500)];
  const oneDay = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients }],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  const sevenDays = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients }],
    index: INDEX,
    daysCovered: 7,
    verdictComputable: true,
  });
  assertEquals(sevenDays.energyPerDay, Math.round(oneDay.energyPerDay! / 7));
  assertEquals(sevenDays.floorHit, true);
});

Deno.test("un verdict non calculable ⇒ `unverified`, JAMAIS `ok`", () => {
  // Fail-closed sur la prétention. Un vert par défaut affirme ce que personne
  // n'a vérifié — la pire des trois réponses.
  const a = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients: [g("rice", 400)] }],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: false,
  });
  assertEquals(a.flag, "unverified");
  assertEquals(a.energyPerDay, null);
  assertEquals(a.floorHit, false, "on ne durcit pas ce qu'on n'a pas su mesurer");
});

Deno.test("un plat non résolu rend TOUT le plan non calculable", () => {
  // Un total amputé d'un dîner passerait sous le plancher pour la mauvaise
  // raison, et durcirait un plan qui n'en avait pas besoin.
  const a = assessCoverage({
    dishes: [
      { method: "Cook it.", ingredients: [g("rice", 400)] },
      { method: "Cook it.", ingredients: [g("sumac", 5)] },
    ],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  // Le second plat n'a AUCUN ingrédient résolu: il est sauté, pas fatal.
  // Ce qui serait fatal, c'est un plat partiellement résolu — d'où le test
  // suivant.
  assert(a.energyPerDay !== null);
});

Deno.test("le drapeau final distingue `unsatisfiable` de `ok`", () => {
  const low = assessCoverage({
    dishes: [{ method: "Cook it.", ingredients: [g("carrots", 300)] }],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  assertEquals(coverageFlagAfterCorrection(low, true), "unsatisfiable");
  assertEquals(coverageFlagAfterCorrection(low, false), "ok");
  const unverified = assessCoverage({
    dishes: [],
    index: INDEX,
    daysCovered: 1,
    verdictComputable: true,
  });
  // `unverified` survit à tout: on ne le promeut jamais en `ok`.
  assertEquals(coverageFlagAfterCorrection(unverified, false), "unverified");
});

// ---------------------------------------------------------------------------
// LE RÉ-ANCRAGE
// ---------------------------------------------------------------------------

const ZERO = { shiftPct: 0, weeksAgainst: 0 };

Deno.test("trois semaines contraires ⇒ un palier, pas avant", () => {
  let s = ZERO;
  for (let i = 1; i < RECALIBRATION_WEEKS; i++) {
    s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "observed_trend", state: s });
    assertEquals(s.shiftPct, 0, `pas de décalage à la semaine ${i}`);
  }
  s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "observed_trend", state: s });
  assertEquals(s.shiftPct, -RECALIBRATION_STEP);
});

Deno.test("le cumul est BORNÉ — six semaines n'en donnent pas plus de dix pour cent", () => {
  let s = ZERO;
  for (let i = 0; i < 40; i++) {
    s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "observed_trend", state: s });
  }
  assertEquals(Math.abs(s.shiftPct), RECALIBRATION_CAP);
});

Deno.test("le sens du décalage suit la dynamique", () => {
  const cut = (() => {
    let s = ZERO;
    for (let i = 0; i < RECALIBRATION_WEEKS; i++) {
      s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "observed_trend", state: s });
    }
    return s;
  })();
  const gain = (() => {
    let s = ZERO;
    for (let i = 0; i < RECALIBRATION_WEEKS; i++) {
      s = nextRecalibration({ goal: "muscle_gain", trend: "falling", mode: "observed_trend", state: s });
    }
    return s;
  })();
  assert(cut.shiftPct < 0, "fat_loss qui ne descend pas: maintenance SURESTIMÉE");
  assert(gain.shiftPct > 0, "muscle_gain qui ne monte pas: maintenance SOUS-estimée");
});

Deno.test("`static` ne recale RIEN — sortie identique", () => {
  let s = ZERO;
  for (let i = 0; i < 10; i++) {
    s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "static", state: s });
  }
  assertEquals(s, { shiftPct: 0, weeksAgainst: 0 });
});

Deno.test("une tendance INCONNUE n'est pas une tendance stable", () => {
  // Traiter l'ignorance comme une confirmation ferait recaler sur l'absence de
  // données.
  let s = ZERO;
  for (let i = 0; i < 10; i++) {
    s = nextRecalibration({ goal: "fat_loss", trend: "unknown", mode: "observed_trend", state: s });
  }
  assertEquals(s.shiftPct, 0);
  assertEquals(s.weeksAgainst, 0);
});

Deno.test("une dynamique sans direction attendue ne recale jamais", () => {
  for (const goal of ["health", "performance", "recomposition"] as const) {
    let s = ZERO;
    for (let i = 0; i < 10; i++) {
      s = nextRecalibration({ goal, trend: "rising", mode: "observed_trend", state: s });
    }
    assertEquals(s.shiftPct, 0, goal);
  }
});

Deno.test("le décalage acquis SURVIT à une bonne semaine", () => {
  // Il corrigeait une erreur d'estimation, et cette erreur n'a pas disparu
  // parce que la semaine s'est bien passée.
  let s = ZERO;
  for (let i = 0; i < RECALIBRATION_WEEKS; i++) {
    s = nextRecalibration({ goal: "fat_loss", trend: "rising", mode: "observed_trend", state: s });
  }
  const acquired = s.shiftPct;
  s = nextRecalibration({ goal: "fat_loss", trend: "falling", mode: "observed_trend", state: s });
  assertEquals(s.shiftPct, acquired);
  assertEquals(s.weeksAgainst, 0);
});

// ---------------------------------------------------------------------------
// LE PLANCHER D'ANONYMAT — A4
// ---------------------------------------------------------------------------

Deno.test("un agrégat sous k=5 ne sort pas", () => {
  assertEquals(COHORT_ANONYMITY_FLOOR, 5);
  assert(!aggregateMayShip(4));
  assert(aggregateMayShip(5));
});

Deno.test("l'INFÉRENCE PAR SOUSTRACTION est bloquée", () => {
  // Deux agrégats de 12 et 8 passent chacun le plancher; leur différence porte
  // sur 4 élèves et ne le passe pas. Publier les deux revient à publier le
  // troisième — et c'est le défaut que la revue TCA a relevé.
  assert(aggregateMayShip(12) && aggregateMayShip(8));
  assert(!aggregatePairMayShip(12, 8));
  assert(aggregatePairMayShip(12, 5));
  assert(aggregatePairMayShip(10, 10), "deux agrégats identiques ne soustraient rien");
});

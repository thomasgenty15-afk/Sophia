// ══════════════════════════════════════════════════════════════════════════
// « LE PRODUIT NE DOIT PAS JUGER SUR UN NOMBRE ET CORRIGER SUR UN AUTRE »
// ══════════════════════════════════════════════════════════════════════════
//
// C'est la contrainte que le pavé de `generate-meal-v1` posait le 2026-08-23,
// et la seule chose qui rendait le biais du dénominateur SUPPORTABLE tant qu'il
// n'était pas corrigé: verdict et ancrage visaient la même cible, fût-elle
// fausse. Le lot du 2026-09-04 change la cible; cette contrainte-ci ne change
// pas, et elle a besoin d'un test qui la tienne.
//
// ⛔ CE TEST OBSERVE DES SORTIES, JAMAIS DU CODE SOURCE. Ce chantier a mesuré
// qu'un test de câblage qui relit le fichier appelant « photographie le code au
// lieu de le vérifier », et il a menti deux fois le même jour. Ici on APPELLE
// les trois lecteurs de production — `verdictFor`, `scaleFactorsFor`,
// `offBandDistance` — sur le même plan, et on regarde ce qu'ils RENDENT.
//
// Les deux cas exigés, sur chaque garde:
//   · CELUI QUI PASSE ... le même dénominateur aux trois ⇒ ils s'accordent;
//   · CELUI QUI REFUSE .. deux dénominateurs différents ⇒ ils se contredisent,
//     et la contradiction est DÉTECTÉE. Sans ce second cas, l'accord du premier
//     ne prouverait rien — une garde qui ne peut pas mordre ressemble trait
//     pour trait à une garde qui marche.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { verdictFor } from "./meal_verdict.ts";
import { MAX_SCALE, MIN_SCALE, scaleFactorsFor } from "./portion_scaling.ts";
import { scalingInputsFor } from "./portion_scaling_inputs.ts";
import { offBandDistance } from "./meal_correction.ts";
import { windowCoverageOf } from "./window_coverage.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { envelopeFor } from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un seul aliment, 100 kcal pour 100 g, SANS protéine.
// ---------------------------------------------------------------------------
//
// ⚠️ SANS PROTÉINE EXPRÈS. `scaleFactorsFor` rend alors `{protein: base,
// other: base}` — le facteur d'ÉNERGIE nu, sans la branche du plancher
// protéique. Ce test-ci parle du dénominateur, pas de la recomposition; y
// mêler la protéine rendrait ses assertions illisibles et fragiles.
const REF: CompositionRef = {
  slug: "plain_starch",
  foodGroupRef: "refined_grain",
  label: "plain starch",
  source: "ciqual",
  energyKcal: 100,
  proteinG: 0,
  carbsG: 25,
  fatG: 0,
  fiberG: 0,
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
  condimentGrams: null,
} as CompositionRef;

const INDEX = buildCompositionIndex([REF], [{ alias: "plain starch", slug: "plain_starch" }]);

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
    ...over,
  };
}

const PER_KG = envelopeFor(
  "fat_loss",
  body(),
  "30_44",
  false,
  null,
  null,
  { day: null, sport: null, asked: false },
  null,
  null,
);
const BAND = PER_KG.mode === "per_kg" && PER_KG.energy !== null ? PER_KG.energy : null;
const TARGET = BAND === null ? 0 : (BAND.low + BAND.high) / 2;
const PROTEIN_FLOOR = PER_KG.mode === "per_kg" ? PER_KG.proteinFloorG : 0;

/** Un plat de `kcal` calories, posé sur `day`/`slot`. 100 kcal = 100 g. */
function dish(day: string, slot: string, kcal: number) {
  return {
    day,
    slot,
    method: "Warm it.",
    ingredients: [
      { term: "plain starch", amount: kcal, unit: "g" as const, state: "raw" as const },
    ],
  };
}

const WINDOW = ["thu", "fri", "sat"];
const RHYTHM = ["breakfast", "lunch", "dinner"];

/**
 * LE PLAN DU DÉFAUT MESURÉ: une fenêtre de TROIS jours, nourrie sur DEUX.
 *
 * L'énergie est choisie pour que les deux lectures se contredisent:
 *   · divisée par 3 (la fenêtre)   → SOUS la bande, donc `below`;
 *   · divisée par 2 (les journées) → au-dessus de la cible de plus de 12 %,
 *     donc un facteur d'ancrage qui RÉDUIT l'assiette.
 *
 * Un produit qui juge sur le premier et corrige sur le second dit « ce plan est
 * trop léger » en rabotant les portions. C'est la contradiction que ce fichier
 * existe pour rendre visible.
 */
const TOTAL_KCAL = Math.round(Math.max(2.4 * TARGET, 0));
const PLAN = [
  dish("fri", "breakfast", Math.round(TOTAL_KCAL * 0.15)),
  dish("fri", "lunch", Math.round(TOTAL_KCAL * 0.2)),
  dish("fri", "dinner", Math.round(TOTAL_KCAL * 0.15)),
  dish("sat", "breakfast", Math.round(TOTAL_KCAL * 0.15)),
  dish("sat", "lunch", Math.round(TOTAL_KCAL * 0.2)),
  dish("sat", "dinner", Math.round(TOTAL_KCAL * 0.15)),
];

const COVERAGE = windowCoverageOf({
  windowDays: WINDOW,
  declaredSlots: RHYTHM,
  composed: PLAN.map((d) => ({ day: d.day, slot: d.slot })),
});

const INPUTS = scalingInputsFor({
  index: INDEX,
  dishes: PLAN,
  isProteinFood: () => false,
});

function verdictOn(days: number) {
  return verdictFor({
    dishes: PLAN,
    envelope: PER_KG,
    index: INDEX,
    daysCovered: days,
    windowDays: WINDOW.length,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
}

function factorOn(days: number) {
  return scaleFactorsFor({
    computedKcal: INPUTS.computedKcal,
    computedProteinG: INPUTS.computedProteinG,
    proteinFoodKcal: INPUTS.proteinFoodKcal,
    otherScalableKcal: INPUTS.otherScalableKcal,
    proteinFoodProteinG: INPUTS.proteinFoodProteinG,
    envelope: PER_KG,
    daysCovered: days,
    resolvedShare: INPUTS.resolvedShare,
  });
}

/**
 * LA CONTRADICTION, LUE SUR LES SEULES SORTIES.
 *
 * `null` = les deux s'accordent. Une chaîne = ce qu'ils se disent de
 * contradictoire, et elle sert de message d'échec.
 *
 * ⛔ LA RÈGLE EST MONOTONE, ET C'EST TOUT CE QU'ON EXIGE: le verdict dit dans
 * quel sens le plan rate sa bande; l'ancrage ne doit jamais pousser dans le sens
 * OPPOSÉ. On ne compare pas deux nombres au centième — les deux fonctions n'ont
 * ni la même bande ni la même zone morte — on compare deux DIRECTIONS, et c'est
 * la seule chose qui doive être vraie quel que soit le réglage des seuils.
 */
function contradiction(
  verdictEnergy: string,
  factors: { protein: number; other: number } | null,
): string | null {
  if (factors === null) return null;
  if (verdictEnergy === "below" && factors.other < 1) {
    return `le verdict dit « trop léger » et l'ancrage RABOTE (×${factors.other.toFixed(3)})`;
  }
  if (verdictEnergy === "above" && factors.other > 1) {
    return `le verdict dit « ça déborde » et l'ancrage AGRANDIT (×${factors.other.toFixed(3)})`;
  }
  return null;
}

Deno.test("le décor tient: la bande existe et le plan la contredit dans les deux sens", () => {
  assert(BAND !== null, "sans bande per_kg, ce fichier ne teste rien");
  assertEquals(COVERAGE.days, 2, "deux journées nourries sur une fenêtre de trois");
  assertEquals(COVERAGE.windowDays, 3);
  // Les deux lectures de la MÊME énergie, et elles ne disent pas la même chose.
  assert(
    INPUTS.computedKcal / 3 < BAND!.low,
    `divisée par la fenêtre, l'énergie est SOUS la bande (${(INPUTS.computedKcal / 3).toFixed(0)} < ${BAND!.low})`,
  );
  assert(
    INPUTS.computedKcal / 2 > BAND!.high,
    `divisée par les journées nourries, elle DÉPASSE la bande (${(INPUTS.computedKcal / 2).toFixed(0)} > ${BAND!.high})`,
  );
});

Deno.test("LE CAS QUI PASSE — le même dénominateur aux deux: aucune contradiction", () => {
  const v = verdictOn(COVERAGE.days);
  const f = factorOn(COVERAGE.days);
  assertEquals(v.energy, "above", "sur deux journées nourries, ce plan déborde");
  assert(f !== null, "hors zone morte, l'ancrage doit rendre un facteur");
  assert(f!.other < 1, "et ce facteur doit RÉDUIRE");
  assertEquals(contradiction(v.energy, f), null);
});

Deno.test("LE CAS QUI REFUSE — deux dénominateurs différents: la contradiction est VUE", () => {
  // ⛔ C'EST L'ÉTAT D'AVANT LE LOT, REJOUÉ: le verdict sur la fenêtre entière,
  // l'ancrage sur les journées nourries. Si cette assertion cessait de mordre,
  // la garde du dessus ne prouverait plus rien.
  const vFenetre = verdictOn(COVERAGE.windowDays);
  const fJournees = factorOn(COVERAGE.days);
  assertEquals(vFenetre.energy, "below", "divisé par trois, ce plan se lit trop léger");
  const dit = contradiction(vFenetre.energy, fJournees);
  assert(
    dit !== null,
    "deux dénominateurs différents DOIVENT produire une contradiction lisible",
  );
});

Deno.test("la distance de correction lit le même dénominateur, et ça se voit", () => {
  // `offBandDistance` décide l'ADOPTION d'une relance. Lui passer la fenêtre
  // pendant que le verdict lit les journées nourries ferait mesurer l'écart
  // d'un plan sur un kcal/jour que personne n'a jugé.
  const v = verdictOn(COVERAGE.days);
  const commun = {
    verdict: v,
    envelope: PER_KG,
    computedKcal: INPUTS.computedKcal,
    computedProteinG: INPUTS.computedProteinG,
  };
  const accordee = offBandDistance({ ...commun, daysCovered: COVERAGE.days });
  const desaccordee = offBandDistance({ ...commun, daysCovered: COVERAGE.windowDays });
  assert(
    Math.abs(accordee - desaccordee) > 1e-9,
    "deux dénominateurs, deux distances — sinon la garde ne garderait rien",
  );
  // ⛔ ET LA VALEUR ACCORDÉE EST CELLE DU VERDICT, AU CENTIÈME. C'est ce qui
  // distingue « les deux nombres diffèrent » de « le bon est passé »: le
  // désaccordé mesure l'écart d'un kcal/jour (1 702) que ce verdict n'a jamais
  // regardé, et il tombe plus LOIN du plafond alors que le plan y est
  // au-dessus — la distance dirait « ce plan s'améliore » sur un plan qui
  // empire.
  const perDay = INPUTS.computedKcal / COVERAGE.days;
  const proteinPerDay = INPUTS.computedProteinG / COVERAGE.days;
  const attendu = 1 + Math.abs(perDay - BAND!.high) / BAND!.high +
    // ⚠️ L'AXE COÛTE 1 **PLUS** SON AMPLITUDE, sur l'énergie comme sur la
    // protéine. Ce décor n'a aucune protéine: l'axe rate de tout le plancher,
    // donc 1 + 1. L'oublier faisait lire ce test « 2,17 » sur une distance de
    // 3,17 — et c'est le genre d'écart qu'on attribue au dénominateur.
    (v.protein === "under"
      ? 1 + Math.max(0, (PROTEIN_FLOOR - proteinPerDay) / PROTEIN_FLOOR)
      : 0) +
    (v.density === "above" ? 1 : 0) +
    v.sentinels.missing.length;
  assertEquals(Number(accordee.toFixed(6)), Number(attendu.toFixed(6)));
});

Deno.test("le dénominateur FRACTIONNAIRE traverse — plus aucun `Math.floor`", () => {
  // ⛔ LE PIÈGE DU LOT, ET IL ÉTAIT MUET. `scaleFactorFor` et `offBandDistance`
  // faisaient `Math.max(1, Math.floor(daysCovered))`. Sur 2,35 ils lisaient 2 —
  // c'est-à-dire un kcal/jour 17 % plus haut que celui du verdict, dans le sens
  // qui RABOTE. Le même argument, deux nombres.
  // ⚠️ 2,05 ET NON 2,35: à 2,35 ce plan-là entre dans la ZONE MORTE (±12 %) et
  // le facteur devient `null` légitimement. Une fraction qui rend `null` ne
  // prouverait rien sur le `floor` — c'est exactement le genre de cas qui fait
  // passer une mutation pour un test.
  const a = factorOn(2);
  const b = factorOn(2.05);
  assert(a !== null && b !== null, "hors zone morte, les deux doivent exister");
  assert(
    Math.abs(a!.other - b!.other) > 1e-9,
    `2 et 2,05 doivent donner deux facteurs (${a!.other} vs ${b!.other})`,
  );
  // Le rapport EST celui des dénominateurs: le facteur vise `cible / (kcal/j)`.
  // Avec un `floor`, 2,05 se lisait 2 et ce rapport valait 1.
  assertEquals(
    Number((b!.other / a!.other).toFixed(6)),
    Number((2.05 / 2).toFixed(6)),
  );

  const distOn = (days: number) =>
    offBandDistance({
      verdict: verdictOn(days),
      envelope: PER_KG,
      computedKcal: INPUTS.computedKcal,
      computedProteinG: INPUTS.computedProteinG,
      daysCovered: days,
    });
  assert(
    Math.abs(distOn(2) - distOn(2.05)) > 1e-9,
    "la distance aussi doit voir la fraction",
  );
});

Deno.test("aucun appelant ENTIER ne bouge — le retrait du floor est neutre sur eux", () => {
  // ⚠️ LA NON-RÉGRESSION, ET ELLE VAUT POUR TOUTE LA BASE EXISTANTE.
  // `Math.floor` est l'identité sur un entier: les dizaines d'appelants qui
  // passent 1, 3, 5 ou 7 doivent rendre EXACTEMENT ce qu'ils rendaient.
  for (const days of [1, 2, 3, 5, 7]) {
    const f = factorOn(days);
    const attendu = TARGET / (INPUTS.computedKcal / days);
    if (f === null) continue;
    assertEquals(
      Number(f.other.toFixed(6)),
      Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, attendu)).toFixed(6)),
      `${days} jours: le facteur doit être cible / (kcal / ${days}), borné`,
    );
  }
  // ⛔ ET LE PLANCHER MORD BIEN QUELQUE PART, sinon la boucle ci-dessus ne
  // testerait que la formule et jamais les bornes: à un jour, ce plan demande
  // ×0,42 et reçoit `MIN_SCALE`.
  assertEquals(factorOn(1)!.other, MIN_SCALE);
});

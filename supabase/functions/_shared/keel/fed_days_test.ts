// ══════════════════════════════════════════════════════════════════════════
// LE DÉNOMINATEUR D'UNE FENÊTRE D'UN SEUL JOUR — la mesure qui manquait
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE FICHIER EXISTE PARCE QUE LA SUITE ENTIÈRE EST RESTÉE VERTE quand
// `Math.max(1, daysCovered)` est tombé. 6 219 tests, et pas un seul n'exerçait
// une couverture INFÉRIEURE À 1 — c'est-à-dire exactement la population que le
// plancher trahissait, et exactement celle que le pavé de `meal_verdict.ts`
// disait ne pas avoir mesurée (« le corpus du 2026-09-04 ne porte aucun plan
// d'un seul jour »).
//
// Une garde qu'aucun test ne peut faire rougir ressemble trait pour trait à une
// garde qui marche.

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import { fedDaysDenominator } from "./fed_days.ts";
import { dayCoverageOf } from "./mouth_anchor.ts";
import { windowCoverageOf } from "./window_coverage.ts";
import { verdictFor } from "./meal_verdict.ts";
import { scaleFactorsFor } from "./portion_scaling.ts";
import { scalingInputsFor } from "./portion_scaling_inputs.ts";
import { offBandDistance } from "./meal_correction.ts";
import { assessCoverage } from "./meal_coverage.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { envelopeFor } from "./meal_envelope.ts";
import { envelopeDirectionFor } from "./weight_pace.ts";
import type { MealBodyContext } from "./meal_body.ts";

Deno.test("une fraction reste une fraction — c'était tout le défaut", () => {
  // `Math.max(1, 0.6)` rendait 1. C'est la ligne qui faisait lire une journée
  // entière là où le plan n'en nourrit que six dixièmes.
  assertEquals(fedDaysDenominator(0.6), 0.6);
  assertEquals(fedDaysDenominator(0.35), 0.35);
  assertEquals(fedDaysDenominator(2.35), 2.35);
  assertEquals(fedDaysDenominator(3), 3);
});

Deno.test("⛔ SEULE LA DIVISION PAR ZÉRO EST GARDÉE — et elle rend 1", () => {
  // `Infinity` kcal/jour rendrait `above` sur tout, donc un rabotage général.
  for (const nul of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertEquals(fedDaysDenominator(nul), 1, String(nul));
  }
});

Deno.test("la part d'un créneau EST la règle — 0,25 + 0,35 = 0,60", () => {
  // « c'est le besoin calorique du repas, calculé comme normal en fonction du
  // créneau ». Rien de neuf: `SLOT_DAY_WEIGHT`, lu par `dayCoverageOf`.
  assertEquals(dayCoverageOf(["breakfast", "lunch", "dinner"], ["breakfast", "dinner"]), 0.6);
  // Et elle DÉPEND du repas, comme le dit la décision: un déjeuner seul pèse
  // plus lourd qu'un petit-déjeuner seul.
  assertEquals(dayCoverageOf(["breakfast", "lunch", "dinner"], ["lunch"]), 0.4);
  assertEquals(dayCoverageOf(["breakfast", "lunch", "dinner"], ["breakfast"]), 0.25);
  assert(
    dayCoverageOf(["breakfast", "lunch", "dinner"], ["dinner"]) <
      dayCoverageOf(["breakfast", "lunch", "dinner"], ["lunch"]),
  );
});

// ---------------------------------------------------------------------------
// LE CAS RÉEL, DE BOUT EN BOUT — le plan du 2026-09-09
// ---------------------------------------------------------------------------

const REF = {
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
  yieldFactor: null,
  atwaterDiscount: 1,
  energyDense: false,
  unitGrams: null,
  condimentGrams: null,
} as CompositionRef;
const INDEX = buildCompositionIndex([REF], [{ alias: "plain starch", slug: "plain_starch" }]);

const BODY: MealBodyContext = {
  heightCm: 180,
  ageBand: "30_44",
  gender: "male",
  latestWeight: { weekStart: "2026-09-07", value: 82 },
  latestWaist: null,
  declaredWeightKg: null,
  restrictionFlag: false,
};
/** La personne du run réel: 82 kg, `trains_some`, perte à 0,5 kg/sem. */
const ENVELOPE = envelopeFor(
  "fat_loss",
  BODY,
  "30_44",
  false,
  null,
  "trains_some",
  { day: null, sport: null, asked: false },
  null,
  null,
  envelopeDirectionFor({
    goal: "fat_loss",
    // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
    // fonction. `false` = aucune condition n'annule l'écart, ce que ces
    // décors décrivent. Le cas qui MORD est éprouvé à part.
    deficitCancelled: false,
    subject: {
      body: {
        heightCm: 180,
        weightKg: 82,
        gender: "male",
        ageYears: 36,
        activityLevel: "trains_some",
        activityAxes: { day: null, sport: null, asked: false },
        appetite: null,
      },
      isMinor: false,
    },
    paceKgPerWeek: 0.5,
  }),
);

function dish(slot: string, kcal: number) {
  return {
    day: "thu",
    slot,
    method: "Warm it.",
    ingredients: [
      { term: "plain starch", amount: kcal, unit: "g" as const, state: "raw" as const },
    ],
  };
}

/** Le plan mesuré: petit-déjeuner 999 + dîner 1172 ≈ 2 171 kcal, déjeuner dehors. */
const PLAN = [dish("breakfast", 999), dish("dinner", 1172)];
const COVERED = windowCoverageOf({
  windowDays: ["thu"],
  declaredSlots: ["breakfast", "lunch", "dinner"],
  composed: PLAN.map((d) => ({ day: d.day, slot: d.slot })),
});

Deno.test("⛔ LE CAS DU LOT — 2 171 kcal en DEUX repas ne sont pas une journée", () => {
  assert(ENVELOPE.mode === "per_kg" && ENVELOPE.energy !== null);
  // ⟳ 2026-09-10 — LA BANDE DE CETTE PERSONNE, DÉRIVÉE À LA MAIN.
  //   BMR = 10×82 + 6,25×180 − 5×37 + 5 = 1 765   (bande 30_44, milieu 37)
  //   M   = 1 765 × 1,80 (`trains_some`) = **3 177**
  //   0,5 kg/sem = 550 kcal/j, ÉCRÊTÉ par A1 à 500 ⇒ cible 3 177 − 500 = 2 677
  //   largeur `fat_loss` = 0,85 − 0,75 = 0,10 de M ⇒ ±158,85
  //   bande brute [2 518 ; 2 836], puis A1 remonte le bas à 3 177 − 500 = 2 677
  //
  // ⛔ ET LE BAS EST EXACTEMENT À A1: c'est la forme que prend le plafond de
  // déficit quand il mord, et il mord ici parce que le cran choisi (550) le
  // dépassait déjà. Un test qui ne verrait pas cette égalité laisserait passer
  // une bande dont la moitié basse prescrit plus de 500 kcal/j de déficit.
  assertEquals(ENVELOPE.energy, { low: 2677, high: 2836 });
  assertEquals(COVERED.days, 0.6);

  const verdict = verdictFor({
    dishes: PLAN,
    envelope: ENVELOPE,
    index: INDEX,
    daysCovered: COVERED.days,
    windowDays: 1,
    friedMethod: () => false,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  // 2 171 / 0,60 = 3 618 kcal/j contre un plafond de 2 836.
  //
  // ⛔ C'EST L'ASSERTION QUE LE PLANCHER FAISAIT ÉCHOUER. Avec
  // `Math.max(1, 0,6)`, la lecture valait 2 171 kcal/j et le verdict rendait
  // `within` — le plan servait une journée entière en deux repas, et personne
  // ne voyait rien.
  assertEquals(verdict.energy, "above");

  // ── ET LES QUATRE AUTRES LECTEURS SUIVENT LE MÊME NOMBRE ────────────────
  // « Le produit ne doit pas juger sur un nombre et corriger sur un autre. »
  const inputs = scalingInputsFor({
    dishes: PLAN,
    index: INDEX,
    // ⚠️ LE PRÉDICAT DE PRODUCTION SERAIT LE BON, mais ce décor n'a aucun
    // aliment protéiné: `false` partout dit la vérité sur CE plan, et évite de
    // faire dépendre un test de dénominateur d'une table de protéines.
    isProteinFood: () => false,
  });
  const factors = scaleFactorsFor({
    computedKcal: inputs.computedKcal,
    computedProteinG: inputs.computedProteinG,
    proteinFoodKcal: inputs.proteinFoodKcal,
    otherScalableKcal: inputs.otherScalableKcal,
    proteinFoodProteinG: inputs.proteinFoodProteinG,
    envelope: ENVELOPE,
    daysCovered: COVERED.days,
    resolvedShare: 1,
  });
  assert(factors !== null, "le correcteur doit voir un plan à rétrécir");
  assert(factors!.other < 1, `le facteur devrait rétrécir: ${factors!.other}`);

  const distance = offBandDistance({
    verdict,
    envelope: ENVELOPE,
    computedKcal: inputs.computedKcal,
    computedProteinG: inputs.computedProteinG,
    daysCovered: COVERED.days,
  });
  assert(distance > 0, "l'écart hors bande doit être visible");

  const coverage = assessCoverage({
    dishes: PLAN,
    index: INDEX,
    daysCovered: COVERED.days,
    verdictComputable: true,
  });
  assert(
    coverage.energyPerDay !== null && coverage.energyPerDay > 3000,
    `kcal/jour lu par la couverture: ${coverage.energyPerDay}`,
  );
});

Deno.test("⛔ ET LE SENS INVERSE — un dîner seul n'est plus gonflé à une journée", () => {
  // La cicatrice de `dayCoverageOf`: « un dîner seul se voit demander une
  // journée entière — une assiette de deux kilos ». Le plancher la rouvrait
  // pour TOUTE fenêtre d'un jour.
  // ⟳ 2026-09-10 — LE NOMBRE SUIT LA BANDE, LA PROPRIÉTÉ NE BOUGE PAS. 730 kcal
  // était le bon dîner de cette personne quand sa bande valait 1 950–2 200;
  // depuis que le moteur lit son corps entier, elle vaut 2 677–2 836, et son
  // dîner vaut donc ~960. Ce test parle du DÉNOMINATEUR (0,35 jour, pas 1), pas
  // du niveau: garder 730 le ferait échouer pour la seule raison qu'il n'a plus
  // rien à voir avec cette personne.
  const dinnerOnly = [dish("dinner", 962)];
  const covered = windowCoverageOf({
    windowDays: ["thu"],
    declaredSlots: ["breakfast", "lunch", "dinner"],
    composed: [{ day: "thu", slot: "dinner" }],
  });
  assertEquals(covered.days, 0.35);
  const verdict = verdictFor({
    dishes: dinnerOnly,
    envelope: ENVELOPE,
    index: INDEX,
    daysCovered: covered.days,
    windowDays: 1,
    friedMethod: () => false,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  // 962 / 0,35 = 2 749 kcal/j — DANS la bande 2 677–2 836. Un dîner de 962 kcal
  // est le bon dîner de cette personne; lu sur une journée entière il vaudrait
  // 962 kcal/j, donc `below`, et le correcteur le gonflerait vers 2 700.
  assertEquals(verdict.energy, "within");
});

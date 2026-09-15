/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C4 ① ② — LE PLANCHER PROTÉIQUE ATTEINT LE PREMIER JET
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan (§ C4) : « avant la première génération, transmettre les contraintes
 * protéiques existantes par personne et journée couverte, ainsi que les
 * minimums par repas lorsqu'ils s'appliquent. Rendre leur répartition lisible
 * au modèle, avec calories, grammes et densité, **sans nouveau barème ni
 * changement des protections individuelles** » et « ne pas utiliser une phrase
 * vague "une protéine dans chaque repas" comme substitut à la cible numérique
 * disponible ».
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  PROTEIN_CONSEQUENCE,
  proteinBriefFor,
  proteinFragment,
} from "./plan_protein_brief.ts";
import { proteinFloorAllocation } from "./final_plan_audit.ts";

/**
 * LE DÉCOR: Paul, 88 kg, plancher de 176 g/jour, deux journées couvertes de
 * trois moments — les nombres du tir n° 1 du 2026-09-11.
 */
const JOURNEE = {
  date: "2026-09-13",
  dayToken: "sun",
  dayTargetKcal: 2454,
  coveredBudgetGrossKcal: 2454,
  fixedProteinG: null,
  slots: [
    { slot: "breakfast", composeKcal: 614 },
    { slot: "lunch", composeKcal: 980 },
    { slot: "dinner", composeKcal: 860 },
  ],
} as const;

Deno.test("C4 ① — le plancher du jour se répartit AU PRORATA de l'énergie de chaque case", () => {
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [JOURNEE],
  });
  assertEquals(brief.silence, null);
  assertEquals(brief.slots.map((s) => [s.slot, s.gramsPerServing]), [
    // 176 × 614/2454 = 44,0 · 176 × 980/2454 = 70,3 · 176 × 860/2454 = 61,7
    ["breakfast", 44],
    ["lunch", 70],
    ["dinner", 62],
  ]);
  // ⛔ LA SOMME REVIENT AU PLANCHER, à l'arrondi près. Une répartition qui
  // perdrait des grammes en route demanderait moins que le plancher tout en
  // ayant l'air de le dire.
  assertEquals(
    brief.slots.reduce((n, s) => n + s.gramsPerServing, 0),
    176,
  );
});

Deno.test("C4 ① bis — AUCUN NOUVEAU BARÈME: la part couverte vient de la garde finale", () => {
  // ⛔ LA PREUVE QUE LE NOMBRE N'EST PAS INVENTÉ ICI: on recalcule la part
  // couverte avec la fonction que la GARDE utilise, et on vérifie qu'elle
  // gouverne. Si un barème apparaissait dans `plan_protein_brief.ts`, les deux
  // nombres divergeraient.
  const jourPartiel = { ...JOURNEE, coveredBudgetGrossKcal: 1227 };
  const attendu = proteinFloorAllocation({
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    coveredBudgetGrossKcal: 1227,
    dayTargetKcal: 2454,
    fixedProteinG: null,
  });
  assertEquals(attendu.coveredFloorG, 88);
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [jourPartiel],
  });
  assertEquals(brief.byDate[0].coveredFloorG, 88);
  assertEquals(
    brief.slots.reduce((n, s) => n + s.gramsPerServing, 0),
    88,
  );
});

Deno.test("C4 ① ter — UNE BOUCHE PROTÉGÉE NE REÇOIT AUCUN CHIFFRE", () => {
  // ⛔ « sans changement des protections individuelles ». Une enveloppe
  // `per_portion` (plancher TCA, mineur protégé) rend `dayFloorG: null`: la
  // ligne ne sort pas, et le motif est NOMMÉ — un silence muet serait
  // indiscernable d'un plancher atteint.
  const brief = proteinBriefFor({
    memberId: "lea",
    dayFloorG: null,
    perMealFloorG: null,
    abstention: "protected",
    days: [JOURNEE],
  });
  assertEquals(brief.slots, []);
  assertEquals(brief.silence, "protected");
  assertEquals(brief.perMealFloorG, null, "pas même le minimum par repas");
  assertEquals(proteinFragment(brief), "", "rien ne part au modèle");
});

Deno.test("C4 ① quater — un trou dans la répartition FAIT TAIRE la journée, et se compte", () => {
  // ⛔ RÉPARTIR SUR LES SEULES CASES LISIBLES donnerait à celles-là la protéine
  // de celle qu'on ne sait pas peser — c'est-à-dire inventerait une exigence.
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [{
      ...JOURNEE,
      slots: [
        { slot: "breakfast", composeKcal: 614 },
        { slot: "lunch", composeKcal: null },
        { slot: "dinner", composeKcal: 860 },
      ],
    }],
  });
  assertEquals(brief.slots, []);
  assertEquals(brief.silence, "spread_unknown");
});

Deno.test("C4 ① quinquies — une case déjà couverte par un apport fixe ne demande rien", () => {
  // ⚠️ `composeKcal: 0` = le shaker couvre le moment. « Au moins 0 g » est du
  // bruit, et le bruit dévalue les lignes qui l'entourent.
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [{
      ...JOURNEE,
      slots: [
        { slot: "breakfast", composeKcal: 0 },
        { slot: "lunch", composeKcal: 980 },
        { slot: "dinner", composeKcal: 860 },
      ],
    }],
  });
  assertEquals(brief.slots.map((s) => s.slot), ["lunch", "dinner"]);
});

Deno.test("C4 ① sexies — les apports fixes sont retranchés UNE fois, pas deux", () => {
  // ⛔ LA RÈGLE DE C1, RELUE ICI ET PAS RÉÉCRITE: la fraction se calcule sur le
  // budget BRUT, la protéine du shaker se retranche ensuite, une fois.
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [{ ...JOURNEE, fixedProteinG: 24 }],
  });
  assertEquals(brief.byDate[0].coveredFloorG, 152);
  assertEquals(
    brief.slots.reduce((n, s) => n + s.gramsPerServing, 0),
    152,
  );
});

Deno.test("C4 ② — la phrase porte des NOMBRES, jamais « une protéine dans chaque repas »", () => {
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: 44,
    abstention: "none",
    days: [JOURNEE],
  });
  const phrase = proteinFragment(brief);
  assertEquals(
    phrase,
    " — one serving here carries at least 44 g of protein in the breakfast dish, " +
      "70 g in the lunch dish, 62 g in the dinner dish, and no main dish under 44 g",
  );
  // ⛔ L'UNITÉ EST ÉCRITE UNE FOIS, SUR LA PREMIÈRE ENTRÉE — la même règle que
  // `densityFragment`, parce qu'un brief qui répète cesse d'être lu.
  assertEquals(phrase.split("g of protein").length - 1, 1);
});

Deno.test("C4 ② bis — deux journées de bandes DIFFÉRENTES rendent deux lignes datées", () => {
  // ⛔ « Les cases concernées restent identifiables » est une phrase du
  // chantier: deux dîners à 62 et 40 g côte à côte sans leurs jours se lisent
  // comme une contradiction.
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [
      JOURNEE,
      {
        ...JOURNEE,
        date: "2026-09-14",
        dayToken: "mon",
        coveredBudgetGrossKcal: 1600,
        slots: [
          { slot: "lunch", composeKcal: 800 },
          { slot: "dinner", composeKcal: 800 },
        ],
      },
    ],
  });
  const phrase = proteinFragment(brief);
  assert(phrase.includes("on sun"), phrase);
  assert(phrase.includes("on mon"), phrase);
});

Deno.test("C4 ② ter — une bande COMMUNE aux deux jours ne se date pas", () => {
  // ⚠️ LE CAS QUI PASSE. Un moment qui ne porte qu'une valeur n'a rien à dater:
  // ses jours sont tous ses jours.
  const brief = proteinBriefFor({
    memberId: "paul",
    dayFloorG: 176,
    perMealFloorG: null,
    abstention: "none",
    days: [JOURNEE, { ...JOURNEE, date: "2026-09-14", dayToken: "mon" }],
  });
  assert(!proteinFragment(brief).includes(" on "), proteinFragment(brief));
});

Deno.test("C4 ② quater — ce que la ligne INTERDIT est écrit, et les deux sorties sont nommées", () => {
  // ⛔ « Une contrainte qu'on énonce sans dire ce qu'elle INTERDIT est une
  // contrainte décorative » (`household_portions.ts`, trois fois). Les deux
  // échappatoires de la protéine sont l'assiette plus grosse et la pile de
  // viande; le plan interdit la seconde en toutes lettres.
  const texte = PROTEIN_CONSEQUENCE.join(" ");
  assert(texte.includes("property of the DISH"), texte);
  assert(texte.includes("Do NOT reach it by serving a bigger plate"), texte);
  assert(texte.includes("Do NOT reach it by piling on meat"), texte);
});

Deno.test("C4 ② quinquies — LE CAS QUI PASSE: un brief muet ne rend aucune phrase", () => {
  assertEquals(proteinFragment(null), "");
  assertEquals(
    proteinFragment({
      memberId: "x",
      slots: [],
      perMealFloorG: null,
      silence: "no_body",
      byDate: [],
    }),
    "",
  );
});

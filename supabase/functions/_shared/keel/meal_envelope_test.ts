// FF-039 — L'ENVELOPPE. Ce que ces tests protègent, dans l'ordre de ce qui
// coûte le plus cher quand ça casse:
//
//   * L'INDISCERNABILITÉ — si un élève sous plancher TCA produisait une
//     enveloppe différente d'un élève au corps inconnu, son statut deviendrait
//     lisible dans tout ce qui se calcule en aval, jusqu'au premier agrégat
//     coach que quelqu'un écrira;
//   * L'ÉTAT ILLÉGAL — un `densityCeiling` ou une bande d'énergie qui
//     survivrait en mode `per_portion`, c'est-à-dire une pression de
//     minimisation sur quelqu'un que le plancher protège;
//   * LE PLAFOND DE DÉFICIT (A1) — un pourcentage seul le laisse passer sur un
//     grand gabarit, et c'est exactement le cas qu'il existe pour couvrir;
//   * LE CADRAN DÉCORATIF — `proteinPerMealG` hors de ses trois cas devient un
//     paramètre que quelqu'un finira par piloter.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ACTIVITY_FACTOR,
  DENSITY_CEILING_DEFAULT,
  DENSITY_CEILING_FAT_LOSS,
  type Envelope,
  envelopeFingerprint,
  envelopeFor,
  estimatedMaintenanceKcal,
  MAX_DAILY_DEFICIT_KCAL,
} from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { GOAL_TOKENS } from "./tokens.ts";

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    restrictionFlag: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// L'ÉTAT ILLÉGAL EST IRREPRÉSENTABLE
// ---------------------------------------------------------------------------

Deno.test("le mode per_portion ne PEUT PAS porter d'énergie ni de densité", () => {
  const degraded = envelopeFor("fat_loss", null, null, true, null);
  assertEquals(degraded.mode, "per_portion");
  // @ts-expect-error — `energy` n'existe pas sur cette branche du type. C'est
  // LA garde de FF-039 R1: il n'y a pas « un champ qu'on prend soin de ne pas
  // lire », il n'y a pas de champ. Si cette ligne se met à compiler, quelqu'un
  // a fusionné les deux formes et le plancher TCA est désarmé.
  assertEquals(degraded.energy, undefined);
  // @ts-expect-error — idem pour le plafond de densité: « rien ne compte à
  // rebours » vaut aussi pour la version sans compteur.
  assertEquals(degraded.densityCeiling, undefined);
});

Deno.test("une enveloppe per_portion ne se construit pas avec des champs par-kg", () => {
  // @ts-expect-error — le littéral illégal ne compile pas.
  const illegal: Envelope = { mode: "per_portion", proteinPortionPerMeal: true, energy: { low: 1, high: 2 } };
  assert(illegal.mode === "per_portion");
});

// ---------------------------------------------------------------------------
// L'INDISCERNABILITÉ — par ÉGALITÉ DE CHAÎNES
// ---------------------------------------------------------------------------

Deno.test("plancher TCA et corps inconnu rendent la MÊME enveloppe, au caractère près", () => {
  // Un test qui vérifierait « il n'y a pas de bande d'énergie » laisserait
  // passer un champ ajouté six mois plus tard, un `undefined` de plus, ou un
  // mode écrit différemment — et c'est précisément par là qu'un statut de
  // restriction devient observable.
  const flagged = envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null);
  const noBody = envelopeFor("fat_loss", null, null, false, null);
  const noWeight = envelopeFor("fat_loss", body({ latestWeight: null }), "30_44", false, null);
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noBody));
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noWeight));
});

Deno.test("l'indiscernabilité tient pour TOUTES les dynamiques", () => {
  // Une seule dynamique qui laisserait fuir un champ suffirait: c'est
  // l'objectif de l'élève qui deviendrait alors lisible sous flag.
  const prints = new Set<string>();
  for (const goal of GOAL_TOKENS) {
    prints.add(envelopeFingerprint(envelopeFor(goal, body({ restrictionFlag: true }), "30_44", true, null)));
    prints.add(envelopeFingerprint(envelopeFor(goal, null, null, false, null)));
  }
  assertEquals(prints.size, 1, "les enveloppes dégradées doivent être identiques");
});

Deno.test("l'empreinte DISTINGUE deux enveloppes per_kg différentes", () => {
  // Une empreinte qui confond deux états est pire qu'aucune empreinte: c'est
  // un test vert qui ne teste rien. Le piège concret était
  // `JSON.stringify(x, keys)`, qui réduit la bande imbriquée à `{}`.
  const light = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 60 } }), "30_44", false, null);
  const heavy = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 110 } }), "30_44", false, null);
  assert(envelopeFingerprint(light) !== envelopeFingerprint(heavy));
});

// ---------------------------------------------------------------------------
// LE PLAFOND DE DÉFICIT — ARBITRAGE A1
// ---------------------------------------------------------------------------

Deno.test("le déficit ne dépasse JAMAIS 500 kcal/j, même sur un grand gabarit", () => {
  // Un très grand gabarit: « M − 25 % » y vaut bien plus que 500 kcal. C'est
  // exactement le cas qu'un pourcentage seul laisserait passer.
  const big = body({ heightCm: 200, latestWeight: { weekStart: "w", value: 140 } });
  const env = envelopeFor("fat_loss", big, "30_44", false, null);
  assert(env.mode === "per_kg");
  const maintenance = estimatedMaintenanceKcal({
    weightKg: 140,
    heightCm: 200,
    ageBand: "30_44",
    gender: "male",
  })!;
  assert(env.energy !== null);
  assert(
    maintenance - env.energy!.low <= MAX_DAILY_DEFICIT_KCAL,
    `déficit de ${maintenance - env.energy!.low} kcal, plafond ${MAX_DAILY_DEFICIT_KCAL}`,
  );
});

Deno.test("le plafond de déficit n'est jamais une consigne de manger MOINS", () => {
  // Sur un très petit gabarit, le plafond est plus généreux que la bande. Il
  // est une PROTECTION: dans ce cas c'est la bande qui gagne, jamais l'inverse.
  const small = body({ heightCm: 150, latestWeight: { weekStart: "w", value: 45 } });
  const env = envelopeFor("fat_loss", small, "18_29", false, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  assert(env.energy!.low <= env.energy!.high);
});

Deno.test("le plafond est une CONSTANTE, pas un paramètre", () => {
  // A1: aucun argument de `envelopeFor` ne peut le lever, et le jeton qui le
  // lèverait n'existe pas dans le schéma de pilotage. La signature est la
  // preuve: cinq paramètres, et aucun n'est un style de déficit — le
  // pilotage du coach lui-même (le cinquième) ne peut pas le lever.
  assertEquals(envelopeFor.length, 5);
  assertEquals(MAX_DAILY_DEFICIT_KCAL, 500);
});

// ---------------------------------------------------------------------------
// LA DISTRIBUTION PAR REPAS — TROIS CAS, ET TROIS SEULEMENT
// ---------------------------------------------------------------------------

Deno.test("proteinPerMealG est null hors de ses trois cas", () => {
  for (const goal of ["fat_loss", "performance", "health", "maintenance"] as const) {
    const env = envelopeFor(goal, body(), "30_44", false, null);
    assert(env.mode === "per_kg");
    assertEquals(env.proteinPerMealG, null, `${goal} ne doit pas porter de part par repas`);
  }
});

Deno.test("les trois cas la portent: 60_plus, muscle_gain, recomposition", () => {
  const senior = envelopeFor("health", body({ ageBand: "60_plus" }), "60_plus", false, null);
  assert(senior.mode === "per_kg" && senior.proteinPerMealG !== null);
  for (const goal of ["muscle_gain", "recomposition"] as const) {
    const env = envelopeFor(goal, body(), "30_44", false, null);
    assert(env.mode === "per_kg" && env.proteinPerMealG !== null, goal);
  }
});

Deno.test("le plancher senior ÉLÈVE, il n'abaisse jamais", () => {
  // 1,2 g/kg est un plancher de sécurité; sur `fat_loss` (2,0) il ne doit pas
  // faire baisser la protéine d'un senior en déficit.
  const senior = envelopeFor("fat_loss", body({ ageBand: "60_plus" }), "60_plus", false, null);
  const adult = envelopeFor("fat_loss", body(), "30_44", false, null);
  assert(senior.mode === "per_kg" && adult.mode === "per_kg");
  assertEquals(senior.proteinFloorG, adult.proteinFloorG);
});

// ---------------------------------------------------------------------------
// LES PLAFONDS DE DENSITÉ
// ---------------------------------------------------------------------------

Deno.test("fat_loss porte un plafond de densité plus bas que le reste", () => {
  const cut = envelopeFor("fat_loss", body(), "30_44", false, null);
  const other = envelopeFor("health", body(), "30_44", false, null);
  assert(cut.mode === "per_kg" && other.mode === "per_kg");
  assertEquals(cut.densityCeiling, DENSITY_CEILING_FAT_LOSS);
  assertEquals(other.densityCeiling, DENSITY_CEILING_DEFAULT);
  assert(DENSITY_CEILING_FAT_LOSS < DENSITY_CEILING_DEFAULT);
});

// ---------------------------------------------------------------------------
// LA MAINTENANCE ESTIMÉE
// ---------------------------------------------------------------------------

Deno.test("la maintenance rend null dès qu'une entrée manque — jamais un défaut", () => {
  assertEquals(estimatedMaintenanceKcal({ weightKg: null, heightCm: 175, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ weightKg: 80, heightCm: null, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ weightKg: 80, heightCm: 175, ageBand: null, gender: "male" }), null);
});

Deno.test("`other` prend la moyenne des deux constantes, jamais l'une des deux", () => {
  // Choisir serait assigner. La moyenne est la seule réponse qui ne le fait
  // pas — et l'écart entre les deux constantes est du même ordre que
  // l'incertitude du facteur d'activité.
  const m = estimatedMaintenanceKcal({ weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "male" })!;
  const f = estimatedMaintenanceKcal({ weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "female" })!;
  const o = estimatedMaintenanceKcal({ weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "other" })!;
  assert(o > f && o < m);
  // À l'arrondi près: les trois valeurs sont arrondies séparément, et exiger
  // l'égalité exacte ferait un test qui casse sur un changement de facteur
  // d'activité sans que rien de réel n'ait bougé.
  assert(Math.abs(o - (m + f) / 2) <= 1, `${o} n'est pas la moyenne de ${m} et ${f}`);
  assert(ACTIVITY_FACTOR > 1);
});

Deno.test("le plafond de déficit remonte les DEUX bords de la bande", () => {
  // Le défaut mesuré au premier passage: sur un gabarit de 140 kg, « M − 15 % »
  // est DÉJÀ un déficit de 556 kcal. Ne remonter que le bas laissait
  // l'enveloppe prescrire un déficit supérieur au plafond sur toute sa
  // largeur — un plafond qui ne mord que d'un côté n'est pas un plafond.
  const big = body({ heightCm: 200, latestWeight: { weekStart: "w", value: 140 } });
  const env = envelopeFor("fat_loss", big, "30_44", false, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  const maintenance = estimatedMaintenanceKcal({
    weightKg: 140,
    heightCm: 200,
    ageBand: "30_44",
    gender: "male",
  })!;
  assert(maintenance - env.energy!.high <= MAX_DAILY_DEFICIT_KCAL);
  assert(env.energy!.low <= env.energy!.high);
});

Deno.test("un corps sans TAILLE dégrade la bande, pas l'enveloppe entière", () => {
  // Le poids suffit pour un plancher protéique; il ne suffit pas pour une
  // maintenance. Les deux ne tombent donc pas ensemble.
  const env = envelopeFor("fat_loss", body({ heightCm: null }), "30_44", false, null);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, null);
  assert(env.proteinFloorG > 0);
});

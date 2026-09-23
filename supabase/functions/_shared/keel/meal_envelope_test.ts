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

import { envelopeDirectionFor } from "./weight_pace.ts";
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  ACTIVITY_FACTOR,
  DENSITY_CEILING_DEFAULT,
  DENSITY_CEILING_FAT_LOSS,
  type Envelope,
  envelopeFingerprint,
  envelopeFor,
  estimatedMaintenanceKcal,
  MAX_DAILY_DEFICIT_KCAL,
  ACTIVITY_FACTORS,
  type ActivityAxes,
  activityAnswerState,
  activityFactorOf,
  APPETITE_FACTORS,
  appetiteFactorOf,
  childAppetiteFactor,
  crossedActivityFactor,
  DAY_ACTIVITY_BASE,
  SPORT_PAL_PER_WEEKLY_SESSION,
  SPORT_SESSIONS_PER_WEEK,
  CHILD_ACTIVITY_FACTOR,
  childActivityFactor,
  childEnvelopeFromBody,
  estimatedChildMaintenanceKcal,
  PORTION_ADJUST_STEP,
  type PortionAdjustFor,
  winningPortionAdjust,
  MAINTENANCE_ENVELOPE_DIRECTION,
  SPORT_SESSIONS_PER_WEEK_LOW,
  sessionsEdgeFor,
} from "./meal_envelope.ts";
import {
  householdBodyFacts,
  type MealBodyContext,
  mealBodyBlocks,
} from "./meal_body.ts";
import type { MouthBody } from "./meal_envelope.ts";
import { type AnchorMouth, maintenanceKcalOf } from "./mouth_anchor.ts";
import { ageBandOf } from "./student_age.ts";
import {
  ACTIVITY_LEVELS,
  DAY_ACTIVITY_LEVELS,
  GOAL_TOKENS,
  SPORT_FREQUENCIES,
} from "./tokens.ts";
import {
  parseRetainedItem,
  type PortionAdjustItem,
  type PortionDirection,
  type PortionMagnitude,
} from "./retained_item.ts";
import type { MemberAgeState } from "./household.ts";

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

// ---------------------------------------------------------------------------
// L'ÉTAT ILLÉGAL EST IRREPRÉSENTABLE
// ---------------------------------------------------------------------------

Deno.test("le mode per_portion ne PEUT PAS porter d'énergie ni de densité", () => {
  const degraded = envelopeFor("fat_loss", null, null, true, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
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
  const flagged = envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const noBody = envelopeFor("fat_loss", null, null, false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const noWeight = envelopeFor("fat_loss", body({ latestWeight: null }), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noBody));
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noWeight));
});

Deno.test("l'indiscernabilité tient pour TOUTES les dynamiques", () => {
  // Une seule dynamique qui laisserait fuir un champ suffirait: c'est
  // l'objectif de l'élève qui deviendrait alors lisible sous flag.
  const prints = new Set<string>();
  for (const goal of GOAL_TOKENS) {
    prints.add(envelopeFingerprint(envelopeFor(goal, body({ restrictionFlag: true }), "30_44", true, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null)));
    prints.add(envelopeFingerprint(envelopeFor(goal, null, null, false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null)));
  }
  assertEquals(prints.size, 1, "les enveloppes dégradées doivent être identiques");
});

Deno.test("l'empreinte DISTINGUE deux enveloppes per_kg différentes", () => {
  // Une empreinte qui confond deux états est pire qu'aucune empreinte: c'est
  // un test vert qui ne teste rien. Le piège concret était
  // `JSON.stringify(x, keys)`, qui réduit la bande imbriquée à `{}`.
  const light = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 60 } }), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const heavy = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 110 } }), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(envelopeFingerprint(light) !== envelopeFingerprint(heavy));
});

// ---------------------------------------------------------------------------
// LE PLAFOND DE DÉFICIT — ARBITRAGE A1
// ---------------------------------------------------------------------------

Deno.test("le déficit ne dépasse JAMAIS 500 kcal/j, même sur un grand gabarit", () => {
  // Un très grand gabarit: « M − 25 % » y vaut bien plus que 500 kcal. C'est
  // exactement le cas qu'un pourcentage seul laisserait passer.
  const big = body({ heightCm: 200, latestWeight: { weekStart: "w", value: 140 } });
  const env = envelopeFor("fat_loss", big, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(env.mode === "per_kg");
  const maintenance = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
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
  const env = envelopeFor("fat_loss", small, "18_29", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  assert(env.energy!.low <= env.energy!.high);
});

Deno.test("le plafond est une CONSTANTE, pas un paramètre", () => {
  // A1: aucun argument de `envelopeFor` ne peut le lever, et le jeton qui le
  // lèverait n'existe pas dans le schéma de pilotage. La signature est la
  // preuve: NEUF paramètres depuis le lot ⑤ (le sixième est le cran d'activité
  // déclaré, le septième les deux axes journée x sport, le HUITIÈME l'appétit,
  // le neuvième les `portion.adjust` retenus), et aucun n'est un style de
  // déficit — ni le pilotage du coach, ni l'activité sous l'une ou l'autre de
  // ses deux formes, ni l'appétit, ni un ajustement de portion ne peuvent le
  // lever.
  //
  // ⚠️ ET L'APPÉTIT EN PARTICULIER NE PEUT PAS LE LEVER, C'EST LE POINT DU
  // LOT ⑤: il corrige l'ESTIMATION D'ENTRETIEN, en amont; le plafond A1 se
  // pose ensuite sur l'écart, et il est une CONSTANTE.
  //
  // ⚠️ TOUS REQUIS ET POSITIONNELS. `envelopeFor.length` compte les paramètres
  // AVANT le premier optionnel: si quelqu'un rend le neuvième facultatif, ce
  // nombre retombe à 8 et ce test rougit. C'est la cicatrice « paramètre de
  // garde optionnel = garde désarmée », épinglée par un nombre.
  // ⟳ 2026-09-09 — DIX: le dixième est `directed`, ce que la balance de la
  // personne fait à sa bande. Voir `envelopeDirectionFor`.
  // ⟳ 2026-09-23 — ONZE: le onzième est l'âge exact (`exactAgeYears`), qui
  // remplace le milieu de la bande dans l'équation. Il ne lève pas A1 non plus:
  // il déplace l'ENTRETIEN, et A1 se pose ensuite sur l'écart.
  assertEquals(envelopeFor.length, 11);
  // ⟳ 2026-09-22 — 880 : 0,8 kg/sem, décision produit (500 avant).
  assertEquals(MAX_DAILY_DEFICIT_KCAL, 880);
});

// ---------------------------------------------------------------------------
// LA DISTRIBUTION PAR REPAS — TROIS CAS, ET TROIS SEULEMENT
// ---------------------------------------------------------------------------

Deno.test("proteinPerMealG est null hors de ses cas", () => {
  for (const goal of ["fat_loss", "maintenance"] as const) {
    const env = envelopeFor(goal, body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
    assert(env.mode === "per_kg");
    assertEquals(env.proteinPerMealG, null, `${goal} ne doit pas porter de part par repas`);
  }
});

// ⚠️ TROIS CAS SONT DEVENUS DEUX LE 2026-08-18. `recomposition` portait la
// répartition par repas « pour le placement, pas le contenu »; elle se replie
// sur `maintenance`, qui ne la porte pas — et c'est cohérent: les deux
// hypothèses qui la justifiaient (plancher à 2,0 g/kg, trois prises) venaient
// d'un « il s'entraîne » que le jeton n'a jamais vérifié. Celui qui s'entraîne
// pour prendre coche `muscle_gain` et garde les deux.
Deno.test("les deux cas la portent: 60_plus et muscle_gain", () => {
  const senior = envelopeFor("maintenance", body({ ageBand: "60_plus" }), "60_plus", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(senior.mode === "per_kg" && senior.proteinPerMealG !== null);
  const gain = envelopeFor("muscle_gain", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(gain.mode === "per_kg" && gain.proteinPerMealG !== null);
});

Deno.test("le plancher senior ÉLÈVE, il n'abaisse jamais", () => {
  // 1,2 g/kg est un plancher de sécurité; sur un objectif plus exigeant il ne
  // doit pas faire baisser la protéine d'un senior.
  //
  // ⟳ 2026-09-23 — LE CAS PASSE DE `fat_loss` À `muscle_gain`. `fat_loss` vaut
  // désormais 1,2, exactement le plancher senior: l'égalité ci-dessous serait
  // restée vraie avec un `Math.max` remplacé par le seul plancher senior, et le
  // test n'aurait plus rien gardé. `muscle_gain` (1,6) est le seul objectif
  // au-dessus de 1,2. 80 kg sous l'IMC 30 ⇒ poids de référence 80 pour les
  // deux: 1,6 × 80 = **128**.
  const senior = envelopeFor("muscle_gain", body({ ageBand: "60_plus" }), "60_plus", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const adult = envelopeFor("muscle_gain", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(senior.mode === "per_kg" && adult.mode === "per_kg");
  assertEquals(adult.proteinFloorG, 128);
  assertEquals(senior.proteinFloorG, 128);
});

// ---------------------------------------------------------------------------
// LES PLAFONDS DE DENSITÉ
// ---------------------------------------------------------------------------

Deno.test("fat_loss porte un plafond de densité plus bas que le reste", () => {
  const cut = envelopeFor("fat_loss", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const other = envelopeFor("maintenance", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(cut.mode === "per_kg" && other.mode === "per_kg");
  assertEquals(cut.densityCeiling, DENSITY_CEILING_FAT_LOSS);
  assertEquals(other.densityCeiling, DENSITY_CEILING_DEFAULT);
  assert(DENSITY_CEILING_FAT_LOSS < DENSITY_CEILING_DEFAULT);
});

// ---------------------------------------------------------------------------
// LA MAINTENANCE ESTIMÉE
// ---------------------------------------------------------------------------

Deno.test("la maintenance rend null dès qu'une entrée manque — jamais un défaut", () => {
  assertEquals(estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: null, heightCm: 175, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 80, heightCm: null, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 80, heightCm: 175, ageBand: null, gender: "male" }), null);
});

Deno.test("`other` prend la moyenne des deux constantes, jamais l'une des deux", () => {
  // Choisir serait assigner. La moyenne est la seule réponse qui ne le fait
  // pas — et l'écart entre les deux constantes est du même ordre que
  // l'incertitude du facteur d'activité.
  const m = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "male" })!;
  const f = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "female" })!;
  const o = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "other" })!;
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
  const env = envelopeFor("fat_loss", big, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  const maintenance = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
    weightKg: 140,
    heightCm: 200,
    ageBand: "30_44",
    gender: "male",
  })!;
  assert(maintenance - env.energy!.high <= MAX_DAILY_DEFICIT_KCAL);
  assert(env.energy!.low <= env.energy!.high);
});

Deno.test("⟳ un corps sans TAILLE garde une bande — par le REPLI, et il est nommé", () => {
  // ⟳ 2026-09-10 — CE TEST A DIT LES DEUX CHOSES, ET LA TROISIÈME EST LA BONNE.
  //   · avant le 2026-09-09: « le poids ne suffit pas » — Mifflin lit la taille,
  //     donc pas de bande du tout;
  //   · le 2026-09-09: « la bande ne dépend plus de la taille » — le moteur
  //     était passé au raccourci `poids × kcal/kg`, qui ne la lit pas;
  //   · depuis, le moteur est revenu à l'équation du corps (l'écran y est passé
  //     le même après-midi). La taille redevient nécessaire À L'ÉQUATION — mais
  //     PAS à l'existence d'une bande, parce que `adultMaintenanceKcal` retombe
  //     sur le raccourci, exactement comme l'écran.
  //
  // ⛔ ET C'EST CE REPLI QUE CE TEST GARDE, pas un nombre. Sans lui, toute la
  // population sans taille au dossier perdrait sa cible d'un coup — et « pas de
  // cible » fait servir la recette du modèle telle quelle, c'est-à-dire au
  // hasard.
  //
  //   raccourci: 80 kg × 28–33 kcal/kg ⇒ 2 250–2 650 (arrondis aux 50),
  //   milieu **2 450**; largeur `fat_loss` = 0,10 ⇒ ±122,5 ⇒ [2 328 ; 2 573].
  //   A1 ne mord pas (2 450 − 500 = 1 950).
  const env = envelopeFor("fat_loss", body({ heightCm: null }), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2328, high: 2573 });
  assert(env.proteinFloorG > 0);

  // ⛔ LE CAS PASSANT DU MÊME MÉCANISME: avec la taille, c'est l'ÉQUATION qui
  // gouverne, et elle rend un autre nombre. Sans cette moitié, un repli qui
  // mordrait sur TOUT LE MONDE ressemblerait trait pour trait à une équation
  // qui marche.
  const withHeight = envelopeFor("fat_loss", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(withHeight.mode === "per_kg" && withHeight.energy !== null);
  assert(
    withHeight.energy!.low !== env.energy!.low,
    "l'équation et le raccourci ne doivent pas rendre le même nombre",
  );
});
Deno.test("sans réponse, RIEN ne bouge: le facteur d'hypothèse est toujours 1,5", () => {
  // ⚠️ LA CONDITION DE DÉSARMEMENT DU LOT. Toute la base d'avant le
  // 2026-08-18 a `activity_level = null`, et elle doit produire l'enveloppe
  // d'avant, au caractère près. Sans ce test, ajouter le champ déplacerait
  // silencieusement l'assiette de tous ceux qui n'ont rien coché.
  assertEquals(ACTIVITY_FACTOR, 1.5);
  const b = {
    weightKg: 70,
    heightCm: 175,
    ageBand: "30_44" as const,
    gender: "male" as const,
  };
  const bmr = 10 * 70 + 6.25 * 175 - 5 * 37 + 5;
  assertEquals(
    estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...b, activityLevel: null }),
    Math.round(bmr * 1.5),
  );
});

Deno.test("chaque cran a un facteur, et ils sont STRICTEMENT croissants", () => {
  // R6: aucune valeur d'énumération sans branche nommée. Et « strictement »
  // est la garde qui compte: deux crans qui rendraient le même nombre feraient
  // une question à quatre réponses dont deux ne changent rien — un champ qui
  // promet un effet et n'en a aucun, exactement ce que `health` a été.
  const seen = ACTIVITY_LEVELS.map((l) => ACTIVITY_FACTORS[l]);
  for (let i = 1; i < seen.length; i++) {
    assert(seen[i] > seen[i - 1], `${ACTIVITY_LEVELS[i]} n'ajoute rien`);
  }
  assertEquals(seen.length, new Set(seen).size);
});

Deno.test("répondre CHANGE le besoin estimé, dans les deux sens", () => {
  // La contre-épreuve sur la VALEUR: le sédentaire descend sous l'hypothèse,
  // le sportif monte au-dessus. Un champ qui ne ferait que monter ne serait pas
  // une collecte, ce serait un bonus.
  const b = {
    weightKg: 70,
    heightCm: 175,
    ageBand: "30_44" as const,
    gender: "male" as const,
  };
  const unknown = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...b, activityLevel: null })!;
  const sitting = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...b, activityLevel: "sedentary" })!;
  const hard = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...b, activityLevel: "trains_hard" })!;
  assert(sitting < unknown, `${sitting} devrait être sous ${unknown}`);
  assert(hard > unknown, `${hard} devrait être au-dessus de ${unknown}`);
  // L'écart entre les deux extrêmes est ce que le produit servait à tort à
  // tout le monde: environ 40 % du besoin, soit le double de l'incertitude.
  assert((hard - sitting) / unknown > 0.3, `écart trop faible: ${hard - sitting}`);
});

Deno.test("l'activité déplace la BANDE D'ÉNERGIE, pas le plancher protéique", () => {
  // Le plancher protéique est en g/kg de POIDS: il ne dépend pas de ce que la
  // personne fait de sa journée, et le laisser bouger ici serait un second
  // effet que personne n'a demandé.
  const sitting = envelopeFor("fat_loss", body(), "30_44", false, null, "sedentary", { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const hard = envelopeFor("fat_loss", body(), "30_44", false, null, "trains_hard", { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(sitting.mode === "per_kg" && hard.mode === "per_kg");
  assert(sitting.energy !== null && hard.energy !== null);
  assert(hard.energy!.low > sitting.energy!.low);
  assertEquals(hard.proteinFloorG, sitting.proteinFloorG);
});

Deno.test("⚠️ sous plancher TCA, l'activité ne rend RIEN d'observable", () => {
  // L'INVARIANT D'INDISCERNABILITÉ, éprouvé sur le paramètre neuf. Si le cran
  // d'activité faisait varier quoi que ce soit sous flag, le statut de
  // restriction redeviendrait dérivable en aval.
  const prints = new Set<string>();
  for (const level of [null, ...ACTIVITY_LEVELS]) {
    prints.add(envelopeFingerprint(
      envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, level, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null),
    ));
    prints.add(envelopeFingerprint(
      envelopeFor("muscle_gain", null, null, false, null, level, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null),
    ));
  }
  assertEquals(prints.size, 1, "l'activité doit être invisible sous flag");
});

// ---------------------------------------------------------------------------
// L'ENFANT — le facteur ne peut que MONTER
// ---------------------------------------------------------------------------

Deno.test("⚠️ chez un enfant, un cran bas ne fait JAMAIS descendre le besoin", () => {
  // LA DÉCISION DE `childActivityFactor`. Les crans de l'adulte descendent à
  // 1,45; le défaut de l'enfant est 1,60 et il est plus haut EXPRÈS. Laisser
  // « assis toute la journée » — coché par le compte MAÎTRE, pas par l'enfant —
  // retirer 9 % du besoin d'un corps en croissance est la direction d'erreur
  // qu'on refuse.
  assertEquals(childActivityFactor(null, { day: null, sport: null, asked: false }), CHILD_ACTIVITY_FACTOR);
  assertEquals(childActivityFactor("sedentary", { day: null, sport: null, asked: false }), CHILD_ACTIVITY_FACTOR);
  // ⚠️ `on_feet` (1,65), LUI, MONTE — le plancher n'est pas un plafond. Il ne
  // gomme que les crans SOUS le défaut de l'enfant, c'est-à-dire le seul
  // `sedentary`. Un enfant debout toute la journée dépense vraiment plus.
  assert(childActivityFactor("on_feet", { day: null, sport: null, asked: false }) > CHILD_ACTIVITY_FACTOR);
  assert(childActivityFactor("trains_hard", { day: null, sport: null, asked: false }) > childActivityFactor("on_feet", { day: null, sport: null, asked: false }));

  const kid = { weightKg: 40, ageYears: 12, gender: "male" as const };
  const base = estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...kid, activityLevel: null })!;
  assertEquals(estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...kid, activityLevel: "sedentary" }), base);
  assert(estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, ...kid, activityLevel: "trains_hard" })! > base);
});

Deno.test("⚠️ AUCUN objectif n'atteint la bande d'un enfant, activité comprise", () => {
  // LA MOITIÉ QUI PROTÈGE APRÈS LE RENVERSEMENT DU 2026-08-18. Un mineur porte
  // désormais les trois objectifs et sa DIRECTION DE SERVICE bifurque — mais
  // `childEnvelopeFromBody` ne prend pas de `goal`: ce n'est pas un `if` qu'on
  // pourrait oublier de rejouer, c'est un paramètre qui n'existe pas.
  assertEquals(childEnvelopeFromBody.length, 1);
  const kid = {
    heightCm: 150,
    weightKg: 40,
    gender: "male" as const,
    ageYears: 12,
    activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
  };
  const env = childEnvelopeFromBody(kid);
  assert(env !== null && env.mode === "per_kg");
  // Ni plafond de densité (une pression de minimisation), ni répartition par
  // repas: ce qu'on calcule est un BESOIN, pas une cible à réduire.
  assertEquals(env.densityCeiling, null);
  assertEquals(env.proteinPerMealG, null);
  // Et la bande est celle de la maintenance: elle ne creuse rien.
  assert(env.energy !== null && env.energy!.low < env.energy!.high);
});

// ---------------------------------------------------------------------------
// `portion.adjust` → LA TRADUCTION (lot 1E)
// ---------------------------------------------------------------------------
//
// Ce que ces tests protègent, dans l'ordre de ce qui coûte le plus cher:
//
//   * L'ÉCRÊTAGE PAR LE PLANCHER — un `down` sur un corps déjà au plancher A1
//     ne retire RIEN. C'est le test le plus important du lot: sans lui, la
//     traduction est le seul levier du module qui pousse vers le bas, et un
//     test qui ne descend jamais sous le plancher ne verrait pas la fuite;
//   * LA RÈGLE DU MINEUR, DES DEUX CÔTÉS — l'enfant n'est pas réduit, ET
//     l'adulte l'est. Une garde sans cas passant est une garde cassée qui
//     ressemble à une garde qui marche;
//   * LES DEUX CRANS ORDONNÉS — `slight` < `clear`. Deux crans qui rendraient
//     le même nombre feraient une question à deux réponses dont une ne change
//     rien;
//   * LE DÉSARMEMENT — `null` doit rendre l'enveloppe d'avant le lot, au
//     nombre près.
//
// ⚠️ LES VALEURS ATTENDUES SONT ÉCRITES EN DUR, jamais dérivées de
// `PORTION_ADJUST_STEP`. Un test paramétré par sa propre constante reste vert
// quand on change la constante — cicatrice mesurée de ce dépôt.

const KID_ID = "11111111-1111-1111-1111-111111111111";
const ADULT_ID = "22222222-2222-2222-2222-222222222222";

/** Un item passé par le PARSEUR — jamais un `as`, qui désarmerait le typecheck. */
function adjust(over: {
  direction: PortionDirection;
  magnitude: PortionMagnitude;
  subject?: string;
  at?: string;
}): PortionAdjustItem {
  const parsed = parseRetainedItem({
    kind: "portion.adjust",
    scope: "durable",
    subject: over.subject ?? "household",
    text: "les portions étaient trop grosses",
    value: { direction: over.direction, magnitude: over.magnitude },
    // Le questionnaire est le SEUL producteur (§5), et le parseur le sait.
    source: "questionnaire",
    at: over.at ?? "2026-08-18",
    item: "",
    confidence: null,
  });
  if (parsed === null || parsed.kind !== "portion.adjust") {
    throw new Error("fixture illisible — le parseur a refusé l'item");
  }
  return parsed;
}

function forMouth(
  ageState: MemberAgeState,
  items: PortionAdjustItem[],
  memberId = ADULT_ID,
): PortionAdjustFor {
  return { mouth: { memberId, ageState }, items };
}

/** 140 kg / 200 cm en `fat_loss`: la bande est DÉJÀ écrasée sur le plancher A1. */
const AT_THE_FLOOR = body({
  heightCm: 200,
  latestWeight: { weekStart: "w", value: 140 },
});

Deno.test("⛔ LE CŒUR DU LOT — un `down`/`clear` sur un corps déjà au plancher ne retire RIEN", () => {
  // ⟳ 2026-09-10 — LE CAS EST LE MÊME, SA MÉCANIQUE A CHANGÉ (encore).
  //   BMR = 10×140 + 6,25×200 − 5×37 + 5 = 2 470  (bande 30_44, milieu 37)
  //   M   = 2 470 × 1,5 (activité inconnue) = **3 705**, A1 = 3 705 − 880 = 2 825
  //   ⟳ 2026-09-22 — A1 vaut 880 kcal/j : 0,8 kg/sem = 880 kcal/j ⇒ cible 2 825
  //   largeur `fat_loss` = 0,10 de M ⇒ ±185,25 ⇒ [2 640 ; 3 010], puis A1
  //   remonte le bas à 2 825: la bande est **exactement à son plancher**.
  //
  // ⛔ LE CRAN PAR DÉFAUT NE SUFFIT PLUS À Y ARRIVER, ET C'EST POURQUOI CE TEST
  // RÈGLE LE CURSEUR. À 0,25 kg/sem l'écart exécuté vaut 275 kcal, la bande sort
  // à [3 245 ; 3 615] et son bas passe AU-DESSUS d'A1 — il y aurait alors
  // quelque chose à retirer, et le test parlerait d'un autre cas que le sien.
  // Le cas gardé est « déjà au plancher », donc il faut un cran qui l'y mette.
  //
  // ⛔ LA DIRECTION EST RÉELLE ICI, PAS NEUTRE. Avec
  // `MAINTENANCE_ENVELOPE_DIRECTION` la bande resterait celle de l'entretien,
  // loin de son plancher — le test passerait sur un cas qui n'est pas le sien.
  const atTheFloorDirection = envelopeDirectionFor({
    goal: "fat_loss",
    // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
    // fonction. `false` = aucune condition n'annule l'écart, ce que ces
    // décors décrivent. Le cas qui MORD est éprouvé à part.
    deficitCancelled: false,
    subject: {
      body: {
        heightCm: 200,
        weightKg: 140,
        gender: "male",
        // ⟳ 2026-09-23 — 37 EST le milieu de 30_44: l'âge exact lu ici et le
        // `null` passé à `envelopeFor` ci-dessous rendent le MÊME entretien
        // (3 705). Changer l'un sans l'autre ferait juger deux corps.
        ageYears: 37,
        activityLevel: null,
        activityAxes: { day: null, sport: null, asked: false },
        appetite: null,
      },
      isMinor: false,
    },
    paceKgPerWeek: 0.8,
  });
  const before = envelopeFor("fat_loss", AT_THE_FLOOR, "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, atTheFloorDirection, null);
  assert(before.mode === "per_kg");
  assertEquals(before.energy, { low: 2825, high: 3010 });

  const after = envelopeFor(
    "fat_loss",
    AT_THE_FLOOR,
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
    atTheFloorDirection,
    null,
  );
  assert(after.mode === "per_kg");
  // PAS UN GRAMME, NI EN BAS NI EN HAUT. Sans la garde, ce serait 2 885–3 051 —
  // c'est-à-dire A1 outrepassé par un adverbe, et sur les deux bords.
  assertEquals(after.energy, { low: 2825, high: 3010 });
  assertEquals(envelopeFingerprint(after), envelopeFingerprint(before));
});

Deno.test("⛔ aucune dynamique ne laisse un `down` creuser au-delà de A1", () => {
  // La contre-épreuve générale: le plancher n'est pas une propriété de
  // `fat_loss`, il est la ceinture de toutes les bandes.
  const maintenance = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid",
    appetite: null,
    weightKg: 140,
    heightCm: 200,
    ageBand: "30_44",
    gender: "male",
    activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
  })!;
  for (const goal of GOAL_TOKENS) {
    const env = envelopeFor(
      goal,
      AT_THE_FLOOR,
      "30_44",
      false,
      null,
      null,
      { day: null, sport: null, asked: false },
      null,
      forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
    MAINTENANCE_ENVELOPE_DIRECTION, null
  );
    assert(env.mode === "per_kg" && env.energy !== null);
    assert(
      maintenance - env.energy!.low <= MAX_DAILY_DEFICIT_KCAL,
      `${goal}: déficit de ${maintenance - env.energy!.low} kcal`,
    );
    assert(env.energy!.low <= env.energy!.high);
  }
});

Deno.test("les DEUX crans rendent deux effets différents ET ordonnés", () => {
  // Corps standard (80 kg / 175 cm), dynamique `maintenance`:
  //   BMR = 10×80 + 6,25×175 − 5×37 + 5 = 1 713,75 ; M = ×1,5 = **2 571**
  //   direction nulle ⇒ cible = M ; largeur `maintenance` = 1,05 − 0,95 = 0,10
  //   ⇒ ±128,55 ⇒ **2 442–2 700**, plancher A1 = 2 071. La bande est LOIN du
  //   plancher: c'est là que les deux crans doivent se distinguer.
  const base = envelopeFor("maintenance", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  assert(base.mode === "per_kg");
  assertEquals(base.energy, { low: 2442, high: 2700 });

  const bandOf = (direction: PortionDirection, magnitude: PortionMagnitude) => {
    const env = envelopeFor(
      "maintenance",
      body(),
      "30_44",
      false,
      null,
      null,
      { day: null, sport: null, asked: false },
      null,
      forMouth("adult", [adjust({ direction, magnitude })]),
    MAINTENANCE_ENVELOPE_DIRECTION, null
  );
    assert(env.mode === "per_kg");
    return env.energy;
  };

  // Les crans s'appliquent sur la bande: −5 % (2442×0,95 = 2320, 2700×0,95 =
  // 2565), −10 %, +5 %, +10 %.
  assertEquals(bandOf("down", "slight"), { low: 2320, high: 2565 });
  assertEquals(bandOf("down", "clear"), { low: 2198, high: 2430 });
  assertEquals(bandOf("up", "slight"), { low: 2564, high: 2835 });
  assertEquals(bandOf("up", "clear"), { low: 2686, high: 2970 });

  // L'ORDRE, dit comme une propriété et pas seulement comme quatre nombres.
  assert(bandOf("down", "clear")!.low < bandOf("down", "slight")!.low);
  assert(bandOf("down", "slight")!.low < base.energy!.low);
  assert(base.energy!.low < bandOf("up", "slight")!.low);
  assert(bandOf("up", "slight")!.low < bandOf("up", "clear")!.low);
});

Deno.test("les deux crans sont épinglés à leur littéral", () => {
  // §7.4 du contrat: une constante s'épingle, sinon la renommer ou la déplacer
  // ne fait rougir personne. Les tests de comportement ci-dessus n'en dérivent
  // AUCUNE valeur — les deux gardes sont indépendantes exprès.
  assertEquals(PORTION_ADJUST_STEP.slight, 0.05);
  assertEquals(PORTION_ADJUST_STEP.clear, 0.10);
  assert(PORTION_ADJUST_STEP.slight < PORTION_ADJUST_STEP.clear);
});

Deno.test("⚠️ `null` DÉSARME: l'enveloppe d'avant le lot, au nombre près", () => {
  // La condition de désarmement. Toute la base est à `null` aujourd'hui (le
  // seul producteur de `portion.adjust` est le questionnaire, qui n'existe pas
  // encore), et elle doit produire EXACTEMENT ce qu'elle produisait.
  const none = envelopeFor("maintenance", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const empty = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", []),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(none.mode === "per_kg");
  assertEquals(none.energy, { low: 2442, high: 2700 });
  assertEquals(envelopeFingerprint(empty), envelopeFingerprint(none));
});

// ---------------------------------------------------------------------------
// LA RÈGLE DU SUJET NON PRÉCISÉ — les DEUX côtés
// ---------------------------------------------------------------------------

Deno.test("⛔ un MINEUR ne voit pas son assiette réduite — et un ADULTE, si", () => {
  // ⚠️ LE CORPS EST IDENTIQUE DANS LES TROIS CAS. La seule chose qui bouge est
  // l'`ageState` de la bouche: c'est ce qui prouve que la décision vient de la
  // règle du §2 axe 3, et pas d'un effet de bord du corps.
  const down = [adjust({ direction: "down", magnitude: "clear" })];
  const bandFor = (ageState: MemberAgeState) => {
    const env = envelopeFor(
      "maintenance",
      body(),
      "30_44",
      false,
      null,
      null,
      { day: null, sport: null, asked: false },
      null,
      forMouth(ageState, down),
    MAINTENANCE_ENVELOPE_DIRECTION, null
  );
    assert(env.mode === "per_kg");
    return env.energy;
  };

  // LE CAS PASSANT — sans lui, la garde ci-dessous serait indiscernable d'une
  // traduction entièrement cassée.
  assertEquals(bandFor("adult"), { low: 2198, high: 2430 });
  // LE MINEUR — la bande d'origine, intacte.
  assertEquals(bandFor("minor"), { low: 2442, high: 2700 });
  // ⚠️ ET L'ÂGE INCONNU AVEC LUI (extension assumée du socle, contrat §3):
  // l'âge est facultatif à la saisie, donc une fiche d'enfant sans date vaut
  // `unknown`. Une garde qui n'exclurait que `minor` ne mordrait pas dans le
  // cas le plus courant.
  assertEquals(bandFor("unknown"), { low: 2442, high: 2700 });
});

Deno.test("à la HAUSSE, personne n'est retiré — pas même un mineur", () => {
  // La règle protège d'un RETRAIT de nourriture. Servir davantage à un enfant
  // en croissance n'est pas le geste qu'elle vise, et le socle le dit.
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("minor", [adjust({ direction: "up", magnitude: "clear" })], KID_ID),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2686, high: 2970 });
});

Deno.test("un sujet EXPLICITE n'est jamais filtré, même sur un mineur", () => {
  // « La personne a nommé la bouche, avec la liste du foyer sous les yeux »:
  // c'est une réponse à une question fermée, pas une inférence. Filtrer
  // là-dessus reviendrait à ignorer ce qu'elle vient de dire — et ce test
  // prouve que ce module n'a pas réécrit la règle en plus strict.
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth(
      "minor",
      [adjust({ direction: "down", magnitude: "clear", subject: `member:${KID_ID}` })],
      KID_ID,
    ),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2198, high: 2430 });
});

Deno.test("un ajustement qui vise une AUTRE bouche ne touche pas celle-ci", () => {
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth(
      "adult",
      [adjust({ direction: "down", magnitude: "clear", subject: `member:${KID_ID}` })],
      ADULT_ID,
    ),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2442, high: 2700 });
});

// ---------------------------------------------------------------------------
// LOT M3 — UNE POSITION QUI CONVERGE, BORNÉE. PAS UN FACTEUR QUI SE COMPOSE.
// ---------------------------------------------------------------------------
//
// ⚠️ CES DEUX TESTS ÉPINGLAIENT LA RÈGLE INVERSE, et le dire vaut mieux que de
// les réécrire en silence. Ils tenaient « le dernier mot gagne, sans cumul »,
// avec un motif JUSTE: deux `slight` COMPOSÉS donneraient 0,95² = 0,9025, et
// personne n'a demandé ça.
//
// M3 ne rouvre pas cette porte — il répond à l'objection. On n'empile pas des
// FACTEURS, on accumule des CRANS sur une échelle bornée, et le facteur sort de
// la position finale en UNE opération. 0,9025 reste inatteignable: non parce
// qu'on l'a plafonné, mais parce que rien ne se multiplie.
//
// ⛔ ET LE PIRE CAS NE BOUGE PAS. `INDEX_MAX` × `slight` (0,05) = 0,10 =
// `clear` — exactement ce que ce module servait déjà. Ce qui change est le
// CHEMIN: progressif et réversible, au lieu d'un saut suivi d'un oubli.
//
// Le défaut fermé, en une phrase: la personne dit « un peu trop », le plan
// suivant est composé à −5 %, elle redit « un peu trop » DU PLAN CORRIGÉ, et on
// lui redonne le même −5 %. Elle n'avançait jamais.

Deno.test("M3 — deux `slight` font un cran de plus, et ATTEIGNENT le pire cas", () => {
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-10" }),
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-17" }),
    ]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg");
  // −2 crans × 0,05 = −0,10, c'est-à-dire EXACTEMENT ce qu'un seul `clear`
  // donnait déjà. La personne y arrive maintenant en deux réponses honnêtes,
  // au lieu de devoir cocher « vraiment trop » d'un coup.
  const clearOnce = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(clearOnce.mode === "per_kg");
  assertEquals(env.energy, clearOnce.energy);
});

Deno.test("⛔ M3 — LA BORNE MORD: quatre `down` ne descendent pas plus bas que deux", () => {
  // ⚠️ C'EST LA GARDE QUI REMPLACE « le dernier mot est borné par
  // construction ». Sans elle, l'accumulation serait la dérive sans borne que
  // l'ancienne règle refusait — et elle aurait eu raison.
  const two = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-10" }),
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-11" }),
    ]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  const six = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-10" }),
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-11" }),
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-12" }),
    ]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(two.mode === "per_kg" && six.mode === "per_kg");
  assertEquals(six.energy, two.energy, "la borne basse ne tient pas");
});

Deno.test("M3 — deux réponses OPPOSÉES s'annulent: c'est ça, converger", () => {
  // L'ancienne règle rendait « le dernier mot »: un `up slight` après un `down
  // clear` laissait +5 %. Maintenant −2 + 1 = −1 cran, c'est-à-dire la
  // correction que les deux réponses décrivent ENSEMBLE.
  const env = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-10" }),
      adjust({ direction: "up", magnitude: "slight", at: "2026-08-17" }),
    ]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  const oneDown = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "slight" })]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg" && oneDown.mode === "per_kg");
  assertEquals(env.energy, oneDown.energy);

  // ⚠️ ET L'ANNULATION COMPLÈTE REVIENT AU MILIEU — la propriété que « le
  // dernier mot » ne pouvait pas avoir.
  const cancelled = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-10" }),
      adjust({ direction: "up", magnitude: "slight", at: "2026-08-17" }),
    ]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  const none = envelopeFor(
    "maintenance", body(), "30_44", false, null, null,
    { day: null, sport: null, asked: false }, null,
    forMouth("adult", []),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(cancelled.mode === "per_kg" && none.mode === "per_kg");
  assertEquals(cancelled.energy, none.energy);
});

Deno.test("l'arbitrage: bouche nommée, puis date, puis ordre d'arrivée", () => {
  // Les trois crans de `winsOver` (`retained_items_routing.ts`), dans le même
  // ordre. ⚠️ Le premier cran est le seul qui ne se déduise pas des dates: une
  // bouche NOMMÉE gagne même si elle est PLUS ANCIENNE.
  const named = winningPortionAdjust({
    mouth: { memberId: ADULT_ID, ageState: "adult" },
    items: [
      adjust({ direction: "up", magnitude: "clear", at: "2026-08-17" }),
      adjust({
        direction: "down",
        magnitude: "slight",
        subject: `member:${ADULT_ID}`,
        at: "2026-08-01",
      }),
    ],
  });
  assertEquals(named, { direction: "down", magnitude: "slight" });

  // À rang égal, la date la plus récente.
  const recent = winningPortionAdjust({
    mouth: { memberId: ADULT_ID, ageState: "adult" },
    items: [
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-17" }),
      adjust({ direction: "up", magnitude: "slight", at: "2026-08-01" }),
    ],
  });
  assertEquals(recent, { direction: "down", magnitude: "clear" });

  // À date égale, le dernier arrivé.
  const last = winningPortionAdjust({
    mouth: { memberId: ADULT_ID, ageState: "adult" },
    items: [
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-17" }),
      adjust({ direction: "up", magnitude: "clear", at: "2026-08-17" }),
    ],
  });
  assertEquals(last, { direction: "up", magnitude: "clear" });

  // Et rien du tout quand rien ne concerne cette bouche.
  assertEquals(winningPortionAdjust(null), null);
  assertEquals(
    winningPortionAdjust({
      mouth: { memberId: ADULT_ID, ageState: "minor" },
      items: [adjust({ direction: "down", magnitude: "clear" })],
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// CE QUI NE BOUGE PAS
// ---------------------------------------------------------------------------

Deno.test("un `portion.adjust` déplace la BANDE, et RIEN d'autre", () => {
  // Le plancher protéique est une CEINTURE en g/kg (Morton 2018): « trop
  // gros » n'est pas « moins de protéine par kilo ». Le plafond de densité est
  // une pression de minimisation: le resserrer en même temps compterait la même
  // remarque deux fois.
  const base = envelopeFor("muscle_gain", body(), "30_44", false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null);
  const cut = envelopeFor(
    "muscle_gain",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(base.mode === "per_kg" && cut.mode === "per_kg");
  // 80 kg × 1,6 g/kg = 128 g, et 128 / 3 prises ≈ 43 g. Écrits en dur.
  assertEquals(base.proteinFloorG, 128);
  assertEquals(cut.proteinFloorG, 128);
  assertEquals(cut.proteinPerMealG, 43);
  assertEquals(cut.densityCeiling, DENSITY_CEILING_DEFAULT);
  assert(cut.energy!.low < base.energy!.low);
});

Deno.test("⛔ SOUS PLANCHER TCA, un `down`/`clear` ne rend RIEN d'observable", () => {
  // L'INVARIANT D'INDISCERNABILITÉ, éprouvé sur le levier neuf — le seul du
  // module qui pousse vers le bas. Si un ajustement faisait varier quoi que ce
  // soit sous flag, le statut de restriction redeviendrait dérivable en aval,
  // ET l'assiette de quelqu'un que le plancher protège aurait baissé.
  const prints = new Set<string>();
  for (const ageState of ["adult", "minor", "unknown"] as const) {
    for (const magnitude of ["slight", "clear"] as const) {
      for (const direction of ["down", "up"] as const) {
        const portion = forMouth(ageState, [adjust({ direction, magnitude })]);
        prints.add(envelopeFingerprint(
          envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, null, { day: null, sport: null, asked: false }, null, portion, MAINTENANCE_ENVELOPE_DIRECTION, null),
        ));
        prints.add(envelopeFingerprint(
          envelopeFor("muscle_gain", null, null, false, null, null, { day: null, sport: null, asked: false }, null, portion, MAINTENANCE_ENVELOPE_DIRECTION, null),
        ));
      }
    }
  }
  prints.add(envelopeFingerprint(
    envelopeFor("fat_loss", null, null, false, null, null, { day: null, sport: null, asked: false }, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null),
  ));
  assertEquals(prints.size, 1, "un ajustement doit être invisible sous flag");
});

Deno.test("sans bande d'énergie, un ajustement ne fabrique rien", () => {
  // ⟳ 2026-09-09 — LE CAS SANS BANDE N'EST PLUS « SANS TAILLE », C'EST « SANS
  // ÂGE ». La bande suit l'écran (`poids × kcal/kg`) et se moque de la taille;
  // ce qui la ferme est `ageBand === null` — un mineur ou un âge inconnu, à qui
  // une échelle d'ADULTE ne s'applique pas. Il reste un plancher protéique, et
  // un `down` n'a rien à quoi mordre.
  const env = envelopeFor(
    "fat_loss",
    body({ heightCm: null }),
    null,
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, null);
  // ⟳ 2026-09-23 — 80 kg × 1,2 g/kg (`fat_loss`, 1,4 avant ce jour) = 96.
  // Écrit en dur.
  assertEquals(env.proteinFloorG, 96);
});

// ---------------------------------------------------------------------------
// ② L'ACTIVITÉ EN DEUX AXES (2026-08-20)
// ---------------------------------------------------------------------------

const NO_AXES: ActivityAxes = { day: null, sport: null, asked: false };

Deno.test("② la table de croisement est DÉRIVÉE, pas tabulée", () => {
  // La dérivation entière, refaite à partir de ses quatre nombres FAO. Si
  // quelqu'un « ajuste » un cran de confort dans `DAY_ACTIVITY_BASE` ou dans
  // l'incrément, l'égalité ci-dessous tombe — c'est-à-dire qu'une table qui ne
  // descend plus de sa dérivation ne peut pas passer en silence.
  //
  //     séance ~1,5 h porte à porte à PAR ~7,0, remplaçant ~1,4
  //     (7,0 − 1,4) × 1,5 / 24 = 0,35 PAL le jour de la séance
  //     0,35 / 7 = 0,05 PAL par séance hebdomadaire
  assertEquals(
    Math.round(((7.0 - 1.4) * 1.5 / 24 / 7) * 1000) / 1000,
    SPORT_PAL_PER_WEEKLY_SESSION,
  );
  for (const day of DAY_ACTIVITY_LEVELS) {
    for (const sport of SPORT_FREQUENCIES) {
      const expected = DAY_ACTIVITY_BASE[day] +
        SPORT_PAL_PER_WEEKLY_SESSION * SPORT_SESSIONS_PER_WEEK[sport];
      assertEquals(
        crossedActivityFactor(day, sport, "mid"),
        Math.round(expected * 100) / 100,
      );
    }
  }
});

Deno.test("② la base de journée NE DIVERGE PAS des crans qu'elle reprend", () => {
  // Deux copies d'un même nombre finissent par diverger, et c'est celle qu'on
  // regarde le moins qui garde l'ancienne. `seated` EST `sedentary` et
  // `on_feet` EST `on_feet`: la même phrase, donc le même nombre.
  assertEquals(DAY_ACTIVITY_BASE.seated, ACTIVITY_FACTORS.sedentary);
  assertEquals(DAY_ACTIVITY_BASE.on_feet, ACTIVITY_FACTORS.on_feet);
});

Deno.test("⛔ ② LE CAS QUI A MOTIVÉ LE LOT — journée assise + 2-3 séances ~1,60", () => {
  // Christèle: assise la journée ET du sport deux à trois fois par semaine.
  // L'ancien formulaire l'obligeait à choisir, elle cochait `trains_some`, et
  // elle héritait de 1,80. « 2 à 3 » est à cheval sur deux bandes; les DEUX
  // doivent encadrer 1,60, et AUCUNE ne doit atteindre 1,80.
  const low = crossedActivityFactor("seated", "1_2", "mid");
  const high = crossedActivityFactor("seated", "3_4", "mid");
  assert(low < 1.60 && high > 1.60, `1,60 hors de [${low}, ${high}]`);
  assert(high < ACTIVITY_FACTORS.trains_some, "le défaut de 1,80 n'a pas bougé");
  // L'écart mesuré, celui qui fabriquait 239 kcal/jour.
  assert(ACTIVITY_FACTORS.trains_some - low > 0.2);
});

Deno.test("② aucune case du croisement ne sort des bandes FAO/WHO/UNU 2004", () => {
  // Plancher 1,40 (« un mode de vie libre n'est pas soutenable en dessous »),
  // et le sommet vigoureux 2,40 n'est JAMAIS servi: ce qui vit là-haut est un
  // travail de force huit heures par jour, pas cinq séances par semaine.
  for (const day of DAY_ACTIVITY_LEVELS) {
    for (const sport of SPORT_FREQUENCIES) {
      const pal = crossedActivityFactor(day, sport, "mid");
      assert(pal >= 1.40, `${day} x ${sport} = ${pal} sous le plancher FAO`);
      assert(pal <= 2.20, `${day} x ${sport} = ${pal} trop haut`);
    }
  }
});

Deno.test("⛔ ② LE REPLI EST NEUTRE — une fiche muette rend le nombre d'hier", () => {
  // La contre-épreuve du lot: rien de ce qui n'a pas répondu ne doit bouger.
  for (const level of ACTIVITY_LEVELS) {
    const got = activityFactorOf(NO_AXES, level, "mid");
    assertEquals(got.factor, ACTIVITY_FACTORS[level]);
    assertEquals(got.source, "legacy");
  }
  const none = activityFactorOf(NO_AXES, null, "mid");
  assertEquals(none.factor, ACTIVITY_FACTOR);
  assertEquals(none.source, "assumed");
});

Deno.test("⛔ ② UN SEUL AXE NE FABRIQUE RIEN — le cran d'avant reprend la main", () => {
  // « Une journée sans sport déclaré n'est pas une journée sans sport. »
  // Compléter l'axe manquant serait inventer une réponse que personne n'a
  // donnée — la faute que ce dépôt documente sous « garde désarmée ».
  const dayOnly: ActivityAxes = { day: "seated", sport: null, asked: true };
  const sportOnly: ActivityAxes = { day: null, sport: "5_plus", asked: true };
  for (const axes of [dayOnly, sportOnly]) {
    assertEquals(activityAnswerState(axes), "partial");
    assertEquals(activityFactorOf(axes, "trains_some", "mid").source, "legacy");
    assertEquals(
      activityFactorOf(axes, "trains_some", "mid").factor,
      ACTIVITY_FACTORS.trains_some,
    );
  }
});

Deno.test("⛔ ② QUATRE ÉTATS, PAS DEUX — `not_asked` ≠ `not_answered`", () => {
  // Le zéro ambigu que ce chantier paie en boucle: une fiche créée avant le lot
  // et une fiche dont le maître a refusé de répondre ne se réparent pas de la
  // même façon, et deux nombres ne peuvent pas dire trois choses.
  assertEquals(activityAnswerState(NO_AXES), "not_asked");
  assertEquals(
    activityAnswerState({ day: null, sport: null, asked: true }),
    "not_answered",
  );
  assertEquals(
    activityAnswerState({ day: "seated", sport: "none", asked: true }),
    "answered",
  );
});

Deno.test("② `none` EST UNE RÉPONSE, et elle pèse", () => {
  // « Je ne fais pas de sport » n'est pas « je n'ai pas répondu ». La première
  // gouverne le croisement; la seconde retombe sur le cran.
  const answered: ActivityAxes = { day: "seated", sport: "none", asked: true };
  assertEquals(activityFactorOf(answered, "trains_hard", "mid").source, "crossed");
  assertEquals(activityFactorOf(answered, "trains_hard", "mid").factor, 1.45);
});

Deno.test("⛔ ② LE PLANCHER DE L'ENFANT SURVIT AUX DEUX AXES", () => {
  // Le lot ② ne doit pas rouvrir, par une porte neuve, la question que
  // `childActivityFactor` a fermée: un « assis » coché par le compte MAÎTRE ne
  // fait pas descendre le besoin d'un corps en croissance.
  const seatedNone: ActivityAxes = { day: "seated", sport: "none", asked: true };
  assertEquals(childActivityFactor(null, seatedNone), CHILD_ACTIVITY_FACTOR);
  assertEquals(childActivityFactor("trains_hard", seatedNone), CHILD_ACTIVITY_FACTOR);
  // Et ce qui MONTE vraiment monte.
  const hard: ActivityAxes = { day: "physical_job", sport: "5_plus", asked: true };
  assert(childActivityFactor(null, hard) > CHILD_ACTIVITY_FACTOR);
  // Personne n'a répondu ⇒ le défaut de l'ENFANT, pas celui de l'adulte.
  assertEquals(childActivityFactor(null, NO_AXES), CHILD_ACTIVITY_FACTOR);
});

Deno.test("⛔ ② LES AXES ATTEIGNENT VRAIMENT L'ÉQUATION D'ENTRETIEN", () => {
  // Un lot construit et non branché rend le même nombre qu'avant, et ressemble
  // donc à un lot qui marche. On mesure la SORTIE, pas la table.
  const common = {
    weightKg: 59,
    heightCm: 169,
    ageBand: "45_59" as const,
    gender: "female" as const,
    // ⑤ — neutre vrai: ce test mesure les DEUX AXES, pas l'appétit.
    appetite: null,
  };
  const legacy = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid",
    ...common,
    activityLevel: "trains_some",
    activityAxes: NO_AXES,
  })!;
  const crossed = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid",
    ...common,
    activityLevel: "trains_some",
    activityAxes: { day: "seated", sport: "1_2", asked: true },
  })!;
  assert(crossed < legacy, "les deux axes n'atteignent pas l'équation");
  // L'ordre de grandeur mesuré sur Christèle: ~239 kcal/jour fabriqués par la
  // forme de la question. On borne largement pour ne pas épingler un arrondi.
  assert(legacy - crossed > 150, `écart trop faible: ${legacy - crossed}`);
});

// ---------------------------------------------------------------------------
// ⑤ L'APPÉTIT — ±10 %, BORNÉ, SYMÉTRIQUE, ET TRANSITOIRE (2026-08-20)
// ---------------------------------------------------------------------------

Deno.test("⑤ borné et SYMÉTRIQUE — 0,90 / 1,00 / 1,10, et rien d'autre", () => {
  // Une échelle ouverte, ou un quatrième cran, ferait de l'incertitude d'une
  // formule (±10 % autour de Mifflin-St Jeor) un réglage d'appétit. Et un
  // réglage d'appétit qui descend est le mode d'échec d'un produit alimentaire.
  assertEquals(Object.keys(APPETITE_FACTORS).sort(), ["average", "large", "small"]);
  assertEquals(APPETITE_FACTORS.average, 1);
  assertEquals(
    Math.round((1 - APPETITE_FACTORS.small) * 100),
    Math.round((APPETITE_FACTORS.large - 1) * 100),
    "l'asymétrie serait une opinion sur le sens dans lequel les gens se trompent",
  );
});

Deno.test("⛔ ⑤ `average` EST UN NEUTRE VRAI, et « pas répondu » n'est pas le même ÉTAT", () => {
  // Les deux rendent le MÊME nombre et ne disent pas la même chose. Les fondre
  // rendrait impossible de savoir si la question sert à quelque chose.
  assertEquals(appetiteFactorOf(null), { factor: 1, source: "unanswered" });
  assertEquals(appetiteFactorOf("average"), { factor: 1, source: "declared" });
});

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 — CE TEST A ÉTÉ RENVERSÉ. IL DISAIT L'INVERSE, ET IL AVAIT TORT.
// ══════════════════════════════════════════════════════════════════════════
//
// Il exigeait « trois entretiens distincts et ordonnés » selon l'appétit.
//
//     ⛔ AVOIR BON APPÉTIT NE FAIT PAS DÉPENSER 10 % DE PLUS.
//
// Sur quelqu'un en perte de poids, ces 10 % annulaient une part du déficit
// parce qu'il aime manger — sans que rien ne le nomme. L'appétit décrit un
// VOLUME d'assiette; il vit maintenant sur les bornes de masse
// (`plateBoundsFor`), à énergie CONSTANTE.
//
// ⚠️ CE QUI RESTE VRAI: l'appétit doit agir, et à un seul endroit. Ce test
// garde la moitié « un seul endroit »; `one_target_per_person_test.ts` tient
// l'autre moitié — il vérifie que la masse, elle, bouge bien de ±10 %.
Deno.test("⛔ ⑤ L'APPÉTIT NE DÉPLACE PLUS L'ENTRETIEN ADULTE — un seul nombre pour les trois crans", () => {
  // On mesure la SORTIE, pas la table: un lot construit et non branché rend le
  // même nombre qu'avant et ressemble donc à un lot qui marche.
  const common = {
    weightKg: 73,
    heightCm: 187,
    ageBand: "18_29" as const,
    gender: "male" as const,
    activityLevel: null,
    activityAxes: NO_AXES,
  };
  const small = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", ...common, appetite: "small" })!;
  const average = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", ...common, appetite: "average" })!;
  const large = estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", ...common, appetite: "large" })!;
  assertEquals(small, average, "un petit appétit fait encore baisser l'entretien");
  assertEquals(large, average, "un gros appétit fait encore monter l'entretien");
  assertEquals(estimatedMaintenanceKcal({ ageYears: null, sessionsEdge: "mid", ...common, appetite: null }), average);
  // ⛔ ET LA TABLE, ELLE, N'EST PAS MORTE: elle a changé de lecteur. Une table
  // à 1,00 partout ferait passer ce test ET désarmerait la masse — c'est
  // pourquoi la contre-épreuve est ici, à côté du renversement.
  assert(
    appetiteFactorOf("small").factor < appetiteFactorOf("large").factor,
    "la table d'appétit est devenue plate: plus rien ne peut la lire",
  );
});

Deno.test("⛔ ⑤ LE CHEMIN PÉDIATRIQUE GARDE SON APPÉTIT — et il ne peut que MONTER", () => {
  // Un enfant qui mange peu ne doit pas voir sa cible baisser: `childAppetiteFactor`
  // est un `Math.max(1, …)`. Le retirer ici aurait sous-nourri un corps en
  // croissance pour réparer un défaut d'adulte.
  const common = {
    weightKg: 30,
    ageYears: 9,
    gender: "female" as const,
    activityLevel: null,
    activityAxes: NO_AXES,
  };
  const small = estimatedChildMaintenanceKcal({ ...common, appetite: "small" })!;
  const average = estimatedChildMaintenanceKcal({ ...common, appetite: "average" })!;
  const large = estimatedChildMaintenanceKcal({ ...common, appetite: "large" })!;
  assertEquals(small, average, "un petit appétit fait baisser la cible d'un enfant");
  assert(large > average, `un gros appétit n'atteint plus l'enfant: ${large} vs ${average}`);
});

Deno.test("⛔ ⑤ LE PLANCHER TCA RESTE DESSOUS — mesuré, pas raisonné", () => {
  // La garde du lot: `small` ne peut pas servir à se sous-alimenter. Ce n'est
  // pas un raisonnement sur l'ordre des `if` — on prend une bouche sous
  // plancher et on regarde ce qui sort.
  //
  // ⚠️ ON PASSE PAR `envelopeFor`, PAS PAR L'ÉQUATION. Sous flag, l'enveloppe
  // est DÉGRADÉE et ne porte aucune énergie: il n'y a rien que l'appétit puisse
  // déplacer, et c'est ça qu'on prouve.
  const under = body({ latestWeight: { weekStart: "w", value: 52 } });
  const nothing = envelopeFor(
    "fat_loss", under, "18_29", /* restrictionFlag */ true, null, null, NO_AXES,
    "small", null,
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  const same = envelopeFor(
    "fat_loss", under, "18_29", true, null, null, NO_AXES, "large", null,
  MAINTENANCE_ENVELOPE_DIRECTION, null
);
  assertEquals(nothing, same, "sous plancher TCA, l'appétit déplace quelque chose");
  // ⛔ `per_portion` NE PORTE PAS D'ÉNERGIE — le TYPE le dit, pas une lecture.
  // C'est ce qui rend la garde structurelle: il n'existe aucun champ où un
  // ±10 % pourrait se poser sous plancher.
  assertEquals(nothing.mode, "per_portion");
});

Deno.test("⛔ ⑤ CHEZ UN ENFANT, L'APPÉTIT NE PEUT QUE MONTER", () => {
  // MÊME décision que `childActivityFactor`, et pour la même raison: le cran
  // est coché par le COMPTE MAÎTRE, pas par l'enfant. Retirer 10 % du besoin
  // d'un corps en croissance sur une case cochée par quelqu'un d'autre est la
  // direction d'erreur qu'on refuse — et cette fois sans même l'excuse d'une
  // équation, puisque ±10 % est l'incertitude de la formule ADULTE.
  assertEquals(childAppetiteFactor("small"), 1);
  assertEquals(childAppetiteFactor("average"), 1);
  assertEquals(childAppetiteFactor(null), 1);
  assertEquals(childAppetiteFactor("large"), APPETITE_FACTORS.large);

  const kid = { weightKg: 26, ageYears: 8, gender: "male" as const, activityLevel: null, activityAxes: NO_AXES };
  const base = estimatedChildMaintenanceKcal({ ...kid, appetite: null })!;
  assertEquals(estimatedChildMaintenanceKcal({ ...kid, appetite: "small" }), base);
  assert(estimatedChildMaintenanceKcal({ ...kid, appetite: "large" })! > base);
});

Deno.test("⛔ ⑤ IL EST ÉCRIT TRANSITOIRE, ET LE TEST TIENT LA PHRASE", () => {
  // Le lot ⑦ (boucle de poids) le remplace: une stabilité est une MESURE, ces
  // trois crans sont une DÉCLARATION, et la mesure gagne toujours. Une
  // convention qui survit à sa cause est le mode d'échec que ce dépôt
  // documente en toutes lettres — celle-ci porte sa date de péremption dans
  // son propre fichier, et ce test empêche qu'on la retire en passant.
  const SOURCE = Deno.readTextFileSync(new URL("./meal_envelope.ts", import.meta.url));
  const block = SOURCE.slice(SOURCE.indexOf("⑤ L'APPÉTIT"));
  assert(/TRANSITOIRE/.test(block.slice(0, 3000)), "la date de péremption a disparu");
  assert(/lot ⑦/.test(block.slice(0, 3000)), "ce qui le remplace n'est plus nommé");
});


// ── ⟳ 2026-09-21 — LE BAS DE LA BANDE, POUR LE MAINTIEN ────────────────────
Deno.test("bord de bande — un maintien lit le bas, une perte et une prise le milieu", () => {
  assertEquals(SPORT_SESSIONS_PER_WEEK_LOW, { none: 0, "1_2": 1, "3_4": 3, "5_plus": 5 });
  assertEquals(sessionsEdgeFor("maintenance"), "low");
  assertEquals(sessionsEdgeFor(null), "low");
  assertEquals(sessionsEdgeFor("fat_loss"), "mid");
  assertEquals(sessionsEdgeFor("muscle_gain"), "mid");
  // Le corps de Christèle (plan `3e121b21`): assise, 3-4 séances.
  assertEquals(crossedActivityFactor("seated", "3_4", "mid"), 1.63);
  assertEquals(crossedActivityFactor("seated", "3_4", "low"), 1.6);
  assertEquals(crossedActivityFactor("seated", "none", "low"), 1.45, "sans sport, les deux bords se confondent");
  assertEquals(crossedActivityFactor("physical_job", "5_plus", "low"), 2.1);
  // Et l'entretien d'un maintien descend d'autant: 1 200 × (1,63 − 1,60) = 36 kcal.
  const body = {
    weightKg: 58,
    heightCm: 169,
    ageBand: "45_59" as const,
    gender: "female" as const,
    activityLevel: null,
    activityAxes: { day: "seated" as const, sport: "3_4" as const, asked: true },
    appetite: null,
  };
  const mid = estimatedMaintenanceKcal({ ageYears: null, ...body, sessionsEdge: "mid" })!;
  const low = estimatedMaintenanceKcal({ ageYears: null, ...body, sessionsEdge: "low" })!;
  assert(mid > low, `${mid} > ${low}`);
  // L'entretien est arrondi au kcal: 36,5 attendus, 37 rendus.
  assertAlmostEquals(mid - low, (10 * 58 + 6.25 * 169 - 5 * 52 - 161) * 0.03, 1);
});

// ---------------------------------------------------------------------------
// ⟳ 2026-09-23 · L'ÂGE EXACT REMPLACE LE MILIEU DE LA BANDE — DANS L'ÉQUATION
// SEULEMENT
// ---------------------------------------------------------------------------
//
// Décision du propriétaire, défaut calculé par l'audit du jour
// (`docs/keel/AUDIT-DOSAGES-2026-09-23.md`, Q8): un homme de 59 ans était
// compté 52 ans (milieu de `45_59`), et le jour de ses 60 ans il sautait au
// milieu de la bande suivante (67 ans) — 15 ans d'un coup, soit 75 kcal de
// métabolisme de base avant le facteur d'activité. À l'âge exact, un
// anniversaire retire 5 kcal de métabolisme de base, et rien ne saute.
//
// ⛔ L'ÂGE EXACT NE SORT PAS DE L'ÉQUATION: les consignes impriment la BANDE.
// Le dernier test de ce bloc tient cette moitié.
//
// Tous les nombres sont faits À LA MAIN, sur le corps de Fabrice (93 kg,
// 173 cm, homme), activité inconnue (×1,5), aucun axe, aucun appétit:
//   base commune = 10 × 93 + 6,25 × 173 + 5 = 2 016,25
//   milieu 52 ans : (2 016,25 − 260) × 1,5 = 2 634,375 ⇒ 2 634
//   59 ans        : (2 016,25 − 295) × 1,5 = 2 581,875 ⇒ 2 582
//   60 ans        : (2 016,25 − 300) × 1,5 = 2 574,375 ⇒ 2 574
//   milieu 67 ans : (2 016,25 − 335) × 1,5 = 2 521,875 ⇒ 2 522

const FABRICE_EQUATION = {
  weightKg: 93,
  heightCm: 173,
  gender: "male" as const,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
  sessionsEdge: "mid" as const,
};

Deno.test("⟳ âge exact — 59 ans contre la bande 45_59: −35 kcal de métabolisme × 1,5", () => {
  // LE CAS QUI PASSE: sans âge, le nombre d'avant ce lot, au kcal près.
  assertEquals(
    estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "45_59", ageYears: null }),
    2634,
  );
  // LE CAS QUI MORD: 7 ans de plus que le milieu ⇒ 35 kcal de métabolisme,
  // × 1,5 = 52,5 ⇒ 2 582.
  assertEquals(
    estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "45_59", ageYears: 59 }),
    2582,
  );
  // Et l'écart suit le FACTEUR D'ACTIVITÉ, pas un forfait: assis (×1,45),
  //   (2 016,25 − 260) × 1,45 = 2 546,5625 ⇒ 2 547
  //   (2 016,25 − 295) × 1,45 = 2 495,8125 ⇒ 2 496   (écart 35 × 1,45 = 50,75)
  assertEquals(
    estimatedMaintenanceKcal({
      ...FABRICE_EQUATION,
      activityLevel: "sedentary",
      ageBand: "45_59",
      ageYears: null,
    }),
    2547,
  );
  assertEquals(
    estimatedMaintenanceKcal({
      ...FABRICE_EQUATION,
      activityLevel: "sedentary",
      ageBand: "45_59",
      ageYears: 59,
    }),
    2496,
  );
});

Deno.test("⟳ âge exact — le jour des 60 ans ne retire plus 112 kcal, il en retire 8", () => {
  const at59 = estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "45_59", ageYears: 59 })!;
  const at60 = estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "60_plus", ageYears: 60 })!;
  assertEquals(at60, 2574);
  // Un anniversaire: 5 kcal × 1,5 = 7,5 ⇒ 8 après les deux arrondis.
  assertEquals(at59 - at60, 8);
  // Le saut d'avant, qu'on garde écrit pour qu'il ne revienne pas en silence:
  // 52 → 67 ans d'un coup, 75 × 1,5 = 112,5 ⇒ 112.
  const midBefore = estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "45_59", ageYears: null })!;
  const midAfter = estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "60_plus", ageYears: null })!;
  assertEquals(midAfter, 2522);
  assertEquals(midBefore - midAfter, 112);
});

Deno.test("⛔ âge exact — la BANDE reste la porte, et un âge qui la contredit n'est pas cru", () => {
  // Pas de bande ⇒ pas d'équation, âge exact ou pas. C'est la bande qui dit
  // « adulte »; un nombre d'années seul ne rouvre pas le chemin.
  assertEquals(
    estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: null, ageYears: 40 }),
    null,
  );
  // 61 ans à côté d'une bande 45_59: deux sources en désaccord ⇒ le milieu
  // de la bande, le nombre d'avant (2 634), jamais 61 ans (2 572).
  assertEquals(
    estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "45_59", ageYears: 61 }),
    2634,
  );
  // ⛔ Un âge de MINEUR à côté d'une bande d'adulte: Mifflin-St Jeor ne lit
  // jamais 16 ans. Milieu de 18_29 (24 ans): (2 016,25 − 120) × 1,5
  // = 2 844,375 ⇒ 2 844 — et pas 2 904, ce que 16 ans aurait rendu.
  assertEquals(
    estimatedMaintenanceKcal({ ...FABRICE_EQUATION, ageBand: "18_29", ageYears: 16 }),
    2844,
  );
});

Deno.test("⟳ âge exact — `envelopeFor` le passe à l'ÉNERGIE, jamais à la protéine", () => {
  // Le banc de ce fichier (80 kg, 175 cm, homme), en bande 45_59, maintien:
  //   milieu 52 : (800 + 1 093,75 − 260 + 5) × 1,5 = 2 458,125 ⇒ 2 458
  //               ⇒ round(2 458 × 0,95) – round(2 458 × 1,05) = 2 335 – 2 581
  //   59 ans    : (800 + 1 093,75 − 295 + 5) × 1,5 = 2 405,625 ⇒ 2 406
  //               ⇒ round(2 406 × 0,95) – round(2 406 × 1,05) = 2 286 – 2 526
  const at = (exactAgeYears: number | null) =>
    envelopeFor(
      "maintenance", body({ ageBand: "45_59" }), "45_59", false, null, null,
      { day: null, sport: null, asked: false }, null, null,
      MAINTENANCE_ENVELOPE_DIRECTION, exactAgeYears,
    );
  const mid = at(null);
  const exact = at(59);
  assert(mid.mode === "per_kg" && exact.mode === "per_kg");
  assertEquals(mid.energy, { low: 2335, high: 2581 });
  assertEquals(exact.energy, { low: 2286, high: 2526 });
  // 1,2 × 80 = 96 dans les deux: l'âge exact ne touche pas au plancher.
  assertEquals(mid.proteinFloorG, 96);
  assertEquals(exact.proteinFloorG, 96);

  // ⛔ ET SANS BANDE, L'ÂGE EXACT NE FABRIQUE RIEN: le repli au poids
  // gouverne, à l'identique.
  const noBand = (exactAgeYears: number | null) =>
    envelopeFor(
      "maintenance", body({ ageBand: null }), null, false, null, null,
      { day: null, sport: null, asked: false }, null, null,
      MAINTENANCE_ENVELOPE_DIRECTION, exactAgeYears,
    );
  assertEquals(envelopeFingerprint(noBand(40)), envelopeFingerprint(noBand(null)));
});

Deno.test("⟳ âge exact — la lane d'ancrage (`maintenanceKcalOf`) lit le même âge", () => {
  // `mouth_anchor.ts` appelle `adultMaintenanceKcal` avec `mouth.body.ageYears`.
  // Le même corps rend le même nombre que l'équation nue: 2 582 à 59 ans,
  // 2 634 à 52 ans (le milieu de la bande, donc le nombre d'avant ce lot).
  const sheet = (ageYears: number): MouthBody => ({
    weightKg: 93,
    heightCm: 173,
    gender: "male",
    ageYears,
    activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
  });
  const mouth = (ageYears: number): AnchorMouth => ({
    memberId: "fabrice",
    ageState: "adult",
    restriction: "clear",
    body: sheet(ageYears),
    direction: null,
    paceKgPerWeek: null,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    conditionRefs: [],
    portionIndex: null,
  });
  assertEquals(maintenanceKcalOf(mouth(59)), { kcal: 2582, reason: "anchored" });
  assertEquals(maintenanceKcalOf(mouth(52)), { kcal: 2634, reason: "anchored" });
});

/**
 * ⛔ LES COMMENTAIRES PARTENT D'ABORD (cicatrice du dépôt: « audit d'appelants:
 * retirer les commentaires »). Les deux fichiers ci-dessous PARLENT de l'âge
 * exact dans le commentaire qui explique la ligne; un grep naïf serait vert
 * sur une ligne qui passerait `null`.
 */
const stripCommentsForAge = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

Deno.test("⛔ âge exact — câblage: l'écran et le rythme passent l'âge de la FICHE, jamais `null`", async () => {
  const flat = async (file: string) =>
    stripCommentsForAge(
      await Deno.readTextFile(new URL(`./${file}`, import.meta.url)),
    ).replace(/\s+/g, " ");
  // L'écran (`loadDailyEnergyTarget`): le chiffre affiché et le chiffre
  // composé lisent le même âge.
  const screen = await flat("meal_energy_shared.ts");
  assert(
    screen.includes("ageBand: ageBandOf(mouthBody.ageYears), ageYears: mouthBody.ageYears,"),
    "meal_energy_shared.ts: l'âge exact n'atteint plus l'équation de l'écran",
  );
  // Le dénominateur du rythme, et la garde du poids visé: le même corps.
  const pace = await flat("weight_pace.ts");
  assert(
    pace.includes("ageBand: ageBandOf(body.ageYears), ageYears: body.ageYears,"),
    "weight_pace.ts: `estimatedMaintenanceFor` ne passe plus l'âge exact",
  );
  assert(
    pace.includes(
      "ageBand: ageBandOf(subject.body.ageYears), ageYears: subject.body.ageYears,",
    ),
    "weight_pace.ts: la garde du poids visé ne passe plus l'âge exact",
  );
  // Et aucun des trois n'écrit l'âge à `null` en dur.
  for (const [name, src] of [["meal_energy_shared.ts", screen], ["weight_pace.ts", pace]]) {
    assert(!src.includes("ageYears: null"), `${name}: un âge exact écrit à null en dur`);
  }
});

Deno.test("⛔ âge exact — la CONSIGNE imprime la bande, jamais l'âge", () => {
  // Fabrice, 59 ans. `MealBodyContext` — le type qui nourrit les consignes —
  // ne porte qu'une BANDE: l'âge exact n'a pas de champ où entrer.
  const context: MealBodyContext = {
    heightCm: 173,
    ageBand: ageBandOf(59),
    gender: "male",
    latestWeight: { weekStart: "2026-09-21", value: 93 },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
  };
  // Le fait que la consigne du foyer lit, écrit en dur.
  const facts = householdBodyFacts(context, "adult");
  assert(facts.includes("age band 45 to 59"), `bande absente: ${JSON.stringify(facts)}`);
  const blocks = mealBodyBlocks(context);
  const prompt = [...facts, ...blocks.whoTheyAre, ...blocks.whereTheyAreNow].join("\n");
  assert(prompt.includes("45 to 59"), "la bande doit rester dans la consigne");
  // ⛔ LE CAS QUI MORD: la bande retirée, « 59 » ne doit plus apparaître nulle
  // part — ni « 59 years », ni « aged 59 », ni un « 59 » nu.
  assert(
    !prompt.split("45 to 59").join("").includes("59"),
    `l'âge exact est entré dans la consigne:\n${prompt}`,
  );

  // Et le type lui-même le refuse: si quelqu'un ajoute `ageYears` à
  // `MealBodyContext`, la directive ci-dessous devient inutile et c'est la
  // compilation de ce fichier qui rougit.
  const withAge: MealBodyContext = {
    ...context,
    // @ts-expect-error — `MealBodyContext` n'a pas de champ d'âge exact.
    ageYears: 59,
  };
  assertEquals(withAge.ageBand, "45_59");
});

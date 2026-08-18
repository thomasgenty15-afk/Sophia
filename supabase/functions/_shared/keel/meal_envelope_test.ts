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
  ACTIVITY_FACTORS,
  CHILD_ACTIVITY_FACTOR,
  childActivityFactor,
  childEnvelopeFromBody,
  estimatedChildMaintenanceKcal,
  PORTION_ADJUST_STEP,
  type PortionAdjustFor,
  winningPortionAdjust,
} from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { ACTIVITY_LEVELS, GOAL_TOKENS } from "./tokens.ts";
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
    restrictionFlag: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// L'ÉTAT ILLÉGAL EST IRREPRÉSENTABLE
// ---------------------------------------------------------------------------

Deno.test("le mode per_portion ne PEUT PAS porter d'énergie ni de densité", () => {
  const degraded = envelopeFor("fat_loss", null, null, true, null, null, null);
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
  const flagged = envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, null, null);
  const noBody = envelopeFor("fat_loss", null, null, false, null, null, null);
  const noWeight = envelopeFor("fat_loss", body({ latestWeight: null }), "30_44", false, null, null, null);
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noBody));
  assertEquals(envelopeFingerprint(flagged), envelopeFingerprint(noWeight));
});

Deno.test("l'indiscernabilité tient pour TOUTES les dynamiques", () => {
  // Une seule dynamique qui laisserait fuir un champ suffirait: c'est
  // l'objectif de l'élève qui deviendrait alors lisible sous flag.
  const prints = new Set<string>();
  for (const goal of GOAL_TOKENS) {
    prints.add(envelopeFingerprint(envelopeFor(goal, body({ restrictionFlag: true }), "30_44", true, null, null, null)));
    prints.add(envelopeFingerprint(envelopeFor(goal, null, null, false, null, null, null)));
  }
  assertEquals(prints.size, 1, "les enveloppes dégradées doivent être identiques");
});

Deno.test("l'empreinte DISTINGUE deux enveloppes per_kg différentes", () => {
  // Une empreinte qui confond deux états est pire qu'aucune empreinte: c'est
  // un test vert qui ne teste rien. Le piège concret était
  // `JSON.stringify(x, keys)`, qui réduit la bande imbriquée à `{}`.
  const light = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 60 } }), "30_44", false, null, null, null);
  const heavy = envelopeFor("fat_loss", body({ latestWeight: { weekStart: "w", value: 110 } }), "30_44", false, null, null, null);
  assert(envelopeFingerprint(light) !== envelopeFingerprint(heavy));
});

// ---------------------------------------------------------------------------
// LE PLAFOND DE DÉFICIT — ARBITRAGE A1
// ---------------------------------------------------------------------------

Deno.test("le déficit ne dépasse JAMAIS 500 kcal/j, même sur un grand gabarit", () => {
  // Un très grand gabarit: « M − 25 % » y vaut bien plus que 500 kcal. C'est
  // exactement le cas qu'un pourcentage seul laisserait passer.
  const big = body({ heightCm: 200, latestWeight: { weekStart: "w", value: 140 } });
  const env = envelopeFor("fat_loss", big, "30_44", false, null, null, null);
  assert(env.mode === "per_kg");
  const maintenance = estimatedMaintenanceKcal({ activityLevel: null,
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
  const env = envelopeFor("fat_loss", small, "18_29", false, null, null, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  assert(env.energy!.low <= env.energy!.high);
});

Deno.test("le plafond est une CONSTANTE, pas un paramètre", () => {
  // A1: aucun argument de `envelopeFor` ne peut le lever, et le jeton qui le
  // lèverait n'existe pas dans le schéma de pilotage. La signature est la
  // preuve: SEPT paramètres depuis le 2026-08-18 (le sixième est le niveau
  // d'activité déclaré, le septième les `portion.adjust` retenus), et aucun
  // n'est un style de déficit — ni le pilotage du coach, ni l'activité, ni un
  // ajustement de portion ne peuvent le lever.
  //
  // ⚠️ TOUS REQUIS ET POSITIONNELS. `envelopeFor.length` compte les paramètres
  // AVANT le premier optionnel: si quelqu'un rend le septième facultatif, ce
  // nombre retombe à 6 et ce test rougit. C'est la cicatrice « paramètre de
  // garde optionnel = garde désarmée », épinglée par un nombre.
  assertEquals(envelopeFor.length, 7);
  assertEquals(MAX_DAILY_DEFICIT_KCAL, 500);
});

// ---------------------------------------------------------------------------
// LA DISTRIBUTION PAR REPAS — TROIS CAS, ET TROIS SEULEMENT
// ---------------------------------------------------------------------------

Deno.test("proteinPerMealG est null hors de ses cas", () => {
  for (const goal of ["fat_loss", "maintenance"] as const) {
    const env = envelopeFor(goal, body(), "30_44", false, null, null, null);
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
  const senior = envelopeFor("maintenance", body({ ageBand: "60_plus" }), "60_plus", false, null, null, null);
  assert(senior.mode === "per_kg" && senior.proteinPerMealG !== null);
  const gain = envelopeFor("muscle_gain", body(), "30_44", false, null, null, null);
  assert(gain.mode === "per_kg" && gain.proteinPerMealG !== null);
});

Deno.test("le plancher senior ÉLÈVE, il n'abaisse jamais", () => {
  // 1,2 g/kg est un plancher de sécurité; sur `fat_loss` (2,0) il ne doit pas
  // faire baisser la protéine d'un senior en déficit.
  const senior = envelopeFor("fat_loss", body({ ageBand: "60_plus" }), "60_plus", false, null, null, null);
  const adult = envelopeFor("fat_loss", body(), "30_44", false, null, null, null);
  assert(senior.mode === "per_kg" && adult.mode === "per_kg");
  assertEquals(senior.proteinFloorG, adult.proteinFloorG);
});

// ---------------------------------------------------------------------------
// LES PLAFONDS DE DENSITÉ
// ---------------------------------------------------------------------------

Deno.test("fat_loss porte un plafond de densité plus bas que le reste", () => {
  const cut = envelopeFor("fat_loss", body(), "30_44", false, null, null, null);
  const other = envelopeFor("maintenance", body(), "30_44", false, null, null, null);
  assert(cut.mode === "per_kg" && other.mode === "per_kg");
  assertEquals(cut.densityCeiling, DENSITY_CEILING_FAT_LOSS);
  assertEquals(other.densityCeiling, DENSITY_CEILING_DEFAULT);
  assert(DENSITY_CEILING_FAT_LOSS < DENSITY_CEILING_DEFAULT);
});

// ---------------------------------------------------------------------------
// LA MAINTENANCE ESTIMÉE
// ---------------------------------------------------------------------------

Deno.test("la maintenance rend null dès qu'une entrée manque — jamais un défaut", () => {
  assertEquals(estimatedMaintenanceKcal({ activityLevel: null, weightKg: null, heightCm: 175, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ activityLevel: null, weightKg: 80, heightCm: null, ageBand: "30_44", gender: "male" }), null);
  assertEquals(estimatedMaintenanceKcal({ activityLevel: null, weightKg: 80, heightCm: 175, ageBand: null, gender: "male" }), null);
});

Deno.test("`other` prend la moyenne des deux constantes, jamais l'une des deux", () => {
  // Choisir serait assigner. La moyenne est la seule réponse qui ne le fait
  // pas — et l'écart entre les deux constantes est du même ordre que
  // l'incertitude du facteur d'activité.
  const m = estimatedMaintenanceKcal({ activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "male" })!;
  const f = estimatedMaintenanceKcal({ activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "female" })!;
  const o = estimatedMaintenanceKcal({ activityLevel: null, weightKg: 80, heightCm: 175, ageBand: "30_44", gender: "other" })!;
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
  const env = envelopeFor("fat_loss", big, "30_44", false, null, null, null);
  assert(env.mode === "per_kg" && env.energy !== null);
  const maintenance = estimatedMaintenanceKcal({ activityLevel: null,
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
  const env = envelopeFor("fat_loss", body({ heightCm: null }), "30_44", false, null, null, null);
  assert(env.mode === "per_kg");
  assertEquals(env.energy, null);
  assert(env.proteinFloorG > 0);
});

// ---------------------------------------------------------------------------
// LE NIVEAU D'ACTIVITÉ — le champ qui remplace la constante devinée (2026-08-18)
// ---------------------------------------------------------------------------

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
    estimatedMaintenanceKcal({ ...b, activityLevel: null }),
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
  const unknown = estimatedMaintenanceKcal({ ...b, activityLevel: null })!;
  const sitting = estimatedMaintenanceKcal({ ...b, activityLevel: "sedentary" })!;
  const hard = estimatedMaintenanceKcal({ ...b, activityLevel: "trains_hard" })!;
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
  const sitting = envelopeFor("fat_loss", body(), "30_44", false, null, "sedentary", null);
  const hard = envelopeFor("fat_loss", body(), "30_44", false, null, "trains_hard", null);
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
      envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, level, null),
    ));
    prints.add(envelopeFingerprint(
      envelopeFor("muscle_gain", null, null, false, null, level, null),
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
  assertEquals(childActivityFactor(null), CHILD_ACTIVITY_FACTOR);
  assertEquals(childActivityFactor("sedentary"), CHILD_ACTIVITY_FACTOR);
  // ⚠️ `on_feet` (1,65), LUI, MONTE — le plancher n'est pas un plafond. Il ne
  // gomme que les crans SOUS le défaut de l'enfant, c'est-à-dire le seul
  // `sedentary`. Un enfant debout toute la journée dépense vraiment plus.
  assert(childActivityFactor("on_feet") > CHILD_ACTIVITY_FACTOR);
  assert(childActivityFactor("trains_hard") > childActivityFactor("on_feet"));

  const kid = { weightKg: 40, ageYears: 12, gender: "male" as const };
  const base = estimatedChildMaintenanceKcal({ ...kid, activityLevel: null })!;
  assertEquals(estimatedChildMaintenanceKcal({ ...kid, activityLevel: "sedentary" }), base);
  assert(estimatedChildMaintenanceKcal({ ...kid, activityLevel: "trains_hard" })! > base);
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
  // M = 3705 kcal (Mifflin × 1,5), plancher A1 = 3705 − 500 = 3205. La bande
  // `fat_loss` (0,75-0,85 × M = 2779-3149) est TOUT ENTIÈRE sous le plafond de
  // déficit: les deux bords sont déjà remontés à 3205, largeur nulle.
  const before = envelopeFor("fat_loss", AT_THE_FLOOR, "30_44", false, null, null, null);
  assert(before.mode === "per_kg");
  assertEquals(before.energy, { low: 3205, high: 3205 });

  const after = envelopeFor(
    "fat_loss",
    AT_THE_FLOOR,
    "30_44",
    false,
    null,
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
  );
  assert(after.mode === "per_kg");
  // PAS UN GRAMME. Sans écrêtage, ce serait 3205 × 0,90 = 2885 — un déficit de
  // 820 kcal/j, c'est-à-dire A1 outrepassé par un adverbe.
  assertEquals(after.energy, { low: 3205, high: 3205 });
  assertEquals(envelopeFingerprint(after), envelopeFingerprint(before));
});

Deno.test("⛔ aucune dynamique ne laisse un `down` creuser au-delà de A1", () => {
  // La contre-épreuve générale: le plancher n'est pas une propriété de
  // `fat_loss`, il est la ceinture de toutes les bandes.
  const maintenance = estimatedMaintenanceKcal({
    weightKg: 140,
    heightCm: 200,
    ageBand: "30_44",
    gender: "male",
    activityLevel: null,
  })!;
  for (const goal of GOAL_TOKENS) {
    const env = envelopeFor(
      goal,
      AT_THE_FLOOR,
      "30_44",
      false,
      null,
      null,
      forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
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
  // Corps standard (80 kg / 175 cm), dynamique `maintenance`: M = 2571, bande
  // 0,95-1,05 ⇒ 2442-2700, plancher A1 = 2071. La bande est LOIN du plancher:
  // c'est là que les deux crans doivent se distinguer.
  const base = envelopeFor("maintenance", body(), "30_44", false, null, null, null);
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
      forMouth("adult", [adjust({ direction, magnitude })]),
    );
    assert(env.mode === "per_kg");
    return env.energy;
  };

  // −5 % et −10 %, écrits en dur: 2442×0,95 = 2320, 2700×0,95 = 2565, etc.
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
  const none = envelopeFor("maintenance", body(), "30_44", false, null, null, null);
  const empty = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    forMouth("adult", []),
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
      forMouth(ageState, down),
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
    forMouth("minor", [adjust({ direction: "up", magnitude: "clear" })], KID_ID),
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
    forMouth(
      "minor",
      [adjust({ direction: "down", magnitude: "clear", subject: `member:${KID_ID}` })],
      KID_ID,
    ),
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
    forMouth(
      "adult",
      [adjust({ direction: "down", magnitude: "clear", subject: `member:${KID_ID}` })],
      ADULT_ID,
    ),
  );
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2442, high: 2700 });
});

// ---------------------------------------------------------------------------
// PLUSIEURS AJUSTEMENTS — UN SEUL GAGNE, ILS NE S'ADDITIONNENT PAS
// ---------------------------------------------------------------------------

Deno.test("⛔ deux `slight` ne font pas un `clear`: le dernier mot gagne, sans cumul", () => {
  // `portion.adjust` est `durable` — il N'EXPIRE JAMAIS. Un magasin qui ne fait
  // que grossir plus un facteur composé est une dérive vers le bas sans borne:
  // deux `slight` empilés donneraient 0,95² = 0,9025 ⇒ un bas de bande à 2204,
  // que personne n'a demandé.
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-10" }),
      adjust({ direction: "down", magnitude: "slight", at: "2026-08-17" }),
    ]),
  );
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2320, high: 2565 });
});

Deno.test("un `up` d'aujourd'hui efface un `down` d'hier — jamais leur somme", () => {
  const env = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    forMouth("adult", [
      adjust({ direction: "down", magnitude: "clear", at: "2026-08-10" }),
      adjust({ direction: "up", magnitude: "slight", at: "2026-08-17" }),
    ]),
  );
  assert(env.mode === "per_kg");
  assertEquals(env.energy, { low: 2564, high: 2835 });
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
  const base = envelopeFor("muscle_gain", body(), "30_44", false, null, null, null);
  const cut = envelopeFor(
    "muscle_gain",
    body(),
    "30_44",
    false,
    null,
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
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
          envelopeFor("fat_loss", body({ restrictionFlag: true }), "30_44", true, null, null, portion),
        ));
        prints.add(envelopeFingerprint(
          envelopeFor("muscle_gain", null, null, false, null, null, portion),
        ));
      }
    }
  }
  prints.add(envelopeFingerprint(
    envelopeFor("fat_loss", null, null, false, null, null, null),
  ));
  assertEquals(prints.size, 1, "un ajustement doit être invisible sous flag");
});

Deno.test("sans bande d'énergie, un ajustement ne fabrique rien", () => {
  // Corps sans taille ⇒ pas de maintenance ⇒ pas de bande. Il reste un plancher
  // protéique, et un `down` n'a rien à quoi mordre. Fabriquer une bande ici
  // rendrait au pilotage ce que l'absence de données lui retire.
  const env = envelopeFor(
    "fat_loss",
    body({ heightCm: null }),
    "30_44",
    false,
    null,
    null,
    forMouth("adult", [adjust({ direction: "down", magnitude: "clear" })]),
  );
  assert(env.mode === "per_kg");
  assertEquals(env.energy, null);
  assertEquals(env.proteinFloorG, 160);
});

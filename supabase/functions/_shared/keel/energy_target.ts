/**
 * FF-059 LOT 3 — LA CIBLE QUOTIDIENNE. Le niveau C, et il n'est pas du même
 * genre que A et B.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 *
 * ── LA FRONTIÈRE QU'ON FRANCHIT ICI, EN CONNAISSANCE DE CAUSE ──────────────
 * A (« ce plat : 537 kcal ») et B (« la journée : 813 ») sont des FAITS SUR LA
 * NOURRITURE. Ce module produit un jugement SUR LA PERSONNE — c'est un
 * tracker, et `coachStartingNumbers` refuse depuis toujours de le montrer à un
 * élève, avec ces mots: *« un chiffre affiché à l'élève devient un objectif »*.
 *
 * On le franchit parce que la décision produit le demande, donc avec le plus de
 * gardes, donc en dernier. Ce que ça impose, et qui n'est pas négociable:
 *
 *   · UNE FOURCHETTE, JAMAIS UN POINT (voir ci-dessous);
 *   · AUCUN RESTE. Ce module ne soustrait rien. « Il te reste 680 kcal » est
 *     LA phrase d'un tracker, et elle n'existe nulle part dans ce chemin —
 *     ni ici, ni dans la fonction edge, ni à l'écran;
 *   · AUCUN VERDICT. Pas de « au-dessus », pas de « en dessous », pas de
 *     couleur, pas de barre. Le nombre du jour et la fourchette se posent
 *     côte à côte, et c'est l'élève qui lit;
 *   · ELLE N'ENTRE PAS DANS LE GÉNÉRATEUR (R6). Un plan qui vise un chiffre
 *     est un régime chiffré, et ce n'est pas ce produit.
 *
 * ── POURQUOI UNE FOURCHETTE PAR KG, ET PAS MIFFLIN-ST JEOR ─────────────────
 * `estimatedMaintenanceKcal` existe déjà dans `meal_envelope.ts` et rendrait un
 * POINT. Il le rend en multipliant un métabolisme de base par `ACTIVITY_FACTOR
 * = 1.5` — une constante qu'aucune donnée de cet élève ne justifie, parce que
 * **rien ne collecte le niveau d'activité**. C'est le rabbit hole nommé par la
 * fiche: « le multiplier par une valeur devinée produit une cible fausse avec
 * l'aplomb d'un tableau ».
 *
 * 28 à 33 kcal/kg est le raccourci qu'un coach fait de tête, et la fourchette
 * EST l'honnêteté sur l'activité: elle couvre du sédentaire à l'actif modéré au
 * lieu de choisir pour lui. Deux conséquences qu'on assume:
 *   · elle est plus large qu'une cible d'app de comptage — c'est le point;
 *   · une fourchette se lit moins comme un objectif qu'un point. Personne ne
 *     « rate » un intervalle de 400 kcal, et c'est exactement ce qu'on veut.
 *
 * ⚠️ MÊMES CONSTANTES QUE `coachStartingNumbers` (`frontend/src/keel/lib/weekInFood.ts`),
 * qui sert la même fourchette au COACH depuis toujours. Deux copies d'un même
 * nombre divergent, et c'est celle qu'on regarde le moins qui garde l'ancienne:
 * `energy_target_test.ts` LIT le fichier du front et refuse le désaccord.
 *
 * ── ET DEPUIS LE 2026-08-18, LE PRODUIT DEMANDE L'ACTIVITÉ ────────────────
 * Le paragraphe ci-dessus disait « rien ne collecte le niveau d'activité »
 * comme la RAISON de la fourchette large. Ce n'est plus vrai: quatre crans
 * lisibles sont posés à l'inscription (`ACTIVITY_LEVELS`), et le trou nommé
 * par la fiche est fermé.
 *
 * Ce qui change, et ce qui ne change PAS:
 *
 *   · Ce qui ne change pas — le chemin SANS réponse. `activityLevel: null`
 *     rend exactement 28-33, au caractère près, et c'est le cas de toute la
 *     base existante et du coach, dont l'écran ne connaît pas ce champ. Le
 *     lien avec `weekInFood.ts` porte sur CES deux nombres-là, et il tient.
 *
 *   · Ce qui change — quand quelqu'un a répondu, la fourchette se resserre ET
 *     se déplace (voir `ACTIVITY_KCAL_PER_KG`). Elle DÉBORDE 28-33 aux deux
 *     bouts, et c'est le point: 28 kcal/kg reste trop haut pour qui est assis
 *     huit heures, et 33 trop bas pour qui s'entraîne quatre fois par semaine.
 *     La fourchette d'origine n'était pas la vérité; elle était l'aveu qu'on
 *     ne savait pas.
 *
 * ⚠️ CE QUI RESTE INTERDIT ICI, ET QUE L'ACTIVITÉ NE ROUVRE PAS. Aucune
 * dynamique n'entre dans ce module: la fourchette est ce que ce corps DÉPENSE,
 * pas ce qu'il « devrait » manger pour changer. Le test de ce module lit la
 * source et refuse les jetons de dynamique; il refuse aussi la constante
 * DEVINÉE de `meal_envelope.ts`, et il continue de la refuser — c'est
 * précisément elle que ce lot remplace.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { ActivityLevel } from "./tokens.ts";

/**
 * LA BASE, et elle nomme ce qu'elle SAIT — le poids, et rien d'autre.
 *
 * Le vocabulaire est délibérément différent de `plan_quantities`: celui-là dit
 * « on a calculé la nourriture », celui-ci dit « on a estimé la personne ». Les
 * confondre ferait passer une estimation pour un calcul, ce qui est très
 * exactement l'erreur que `CALORIE_REVERSAL` existe pour empêcher.
 */
export const ENERGY_TARGET_BASIS = "weight_range";
export type EnergyTargetBasis = typeof ENERGY_TARGET_BASIS;

/**
 * kcal par kg de poids corporel, QUAND ON NE SAIT PAS. Le bas couvre le
 * sédentaire, le haut l'actif — c'est-à-dire que la fourchette couvre
 * l'ignorance elle-même.
 */
export const MAINTENANCE_KCAL_PER_KG_LOW = 28;
export const MAINTENANCE_KCAL_PER_KG_HIGH = 33;

/**
 * kcal/kg PAR CRAN D'ACTIVITÉ — la fourchette de quelqu'un qui a répondu.
 *
 * ── D'OÙ VIENNENT CES NOMBRES ─────────────────────────────────────────────
 * Du même raccourci de coach que 28-33, appliqué cran par cran plutôt qu'à
 * tout le monde. Les quatre bandes se recouvrent d'un point à chaque
 * frontière, et ce recouvrement est voulu: un cran est une réponse à une
 * question, pas une mesure, et deux personnes de part et d'autre d'une
 * frontière ne dépensent pas deux choses disjointes.
 *
 *   sedentary    26-29   assis toute la journée
 *   on_feet      28-31   debout, en mouvement — le cran qui contient 28-33
 *   trains_some  30-33   2 à 3 séances
 *   trains_hard  32-36   4 séances et plus, ou métier physique
 *
 * ⚠️ LA LARGEUR NE DESCEND PAS SOUS TROIS POINTS, ET C'EST UNE DÉCISION. On
 * pourrait resserrer davantage maintenant qu'on sait quelque chose. On ne le
 * fait pas: « une fourchette se lit moins comme un objectif qu'un point.
 * Personne ne rate un intervalle » — la phrase de l'en-tête vaut toujours, et
 * une fourchette de 100 kcal se lirait comme une cible. On a gagné en
 * JUSTESSE, on n'a pas décidé de gagner en précision affichée.
 *
 * ⚠️ ELLES DÉBORDENT 28-33 AUX DEUX BOUTS, ET C'EST LE POINT. Voir l'en-tête.
 * Le lien avec `weekInFood.ts` porte sur la fourchette de l'ignorance, pas sur
 * celles-ci — l'écran du coach ne collecte pas ce champ.
 */
export const ACTIVITY_KCAL_PER_KG: Readonly<
  Record<ActivityLevel, { low: number; high: number }>
> = Object.freeze({
  sedentary: { low: 26, high: 29 },
  on_feet: { low: 28, high: 31 },
  trains_some: { low: 30, high: 33 },
  trains_hard: { low: 32, high: 36 },
});

/**
 * Les bornes de plausibilité, les mêmes que le point hebdo et que
 * `coachStartingNumbers`. Hors bornes, pas de nombres: un 500 kg d'erreur de
 * frappe produirait une cible absurde présentée avec l'aplomb d'un tableau.
 */
export const TARGET_WEIGHT_KG_MIN = 25;
export const TARGET_WEIGHT_KG_MAX = 400;

/**
 * POURQUOI IL N'Y A PAS DE CIBLE. Nommé, jamais un `null` nu — les deux motifs
 * ne se disent pas pareil et ne se réparent pas au même endroit.
 */
export const TARGET_GAPS = Object.freeze(
  [
    /** Aucune pesée exploitable. L'élève peut en saisir une. */
    "no_weight",
    /** Une pesée hors bornes. C'est une faute de frappe, pas une personne. */
    "implausible_weight",
  ] as const,
);
export type TargetGap = (typeof TARGET_GAPS)[number];

export interface EnergyTarget {
  /** `null` avec un `gap` nommé, ou la fourchette. JAMAIS un point. */
  range: { low: number; high: number } | null;
  basis: EnergyTargetBasis;
  gap: TargetGap | null;
  /**
   * LE POIDS QUI A SERVI, ET SA DATE.
   *
   * ⚠️ La date n'est pas décorative. Une cible posée sur une pesée de six
   * semaines est une cible sur quelqu'un d'autre, et l'élève est le seul à
   * pouvoir le savoir. On la rend pour qu'il le puisse — et pas pour qu'un
   * écran calcule une fraîcheur, ce qui serait un verdict de plus.
   */
  weightKg: number | null;
  weightWeekStart: string | null;
}

function noTarget(gap: TargetGap): EnergyTarget {
  return {
    range: null,
    basis: ENERGY_TARGET_BASIS,
    gap,
    weightKg: null,
    weightWeekStart: null,
  };
}

/**
 * La fourchette de maintenance, ou le motif nommé de son absence.
 *
 * ── ARRONDI AUX 50 kcal, ET C'EST UN ARBITRAGE D'AFFICHAGE ─────────────────
 * « 2 100 – 2 500 » se lit comme un ordre de grandeur; « 2 086 – 2 459 » se lit
 * comme une mesure, et invite à viser le chiffre exact. Même arrondi que
 * `coachStartingNumbers`, qui l'a tranché en premier.
 *
 * ⚠️ AUCUN OBJECTIF N'ENTRE ICI. Ni `fat_loss`, ni `muscle_gain`. Cette
 * fourchette est la MAINTENANCE — ce que ce corps dépense — et pas ce qu'il
 * « devrait » manger pour changer. Dériver un déficit reviendrait à prescrire un
 * régime chiffré à quelqu'un que personne n'a examiné, et le plafond de 500
 * kcal/j de `meal_envelope` existe précisément parce que ce calcul-là est
 * dangereux. L'objectif change la COMPOSITION de l'assiette (c'est FF-043 et le
 * générateur); il ne change pas ce que ce corps dépense.
 */
export function maintenanceRange(args: {
  weightKg: number | null;
  /** La semaine de la pesée, `YYYY-MM-DD`. `null` = date inconnue. */
  weightWeekStart: string | null;
  /**
   * ⚠️ REQUIS, JAMAIS OPTIONNEL. « Paramètre de garde optionnel = garde
   * désarmée » est une cicatrice mesurée de ce dépôt; ici l'enjeu est le
   * symétrique — un champ facultatif aurait laissé les appelants continuer de
   * servir la fourchette de l'ignorance à quelqu'un qui a répondu, sans
   * qu'aucun compilateur ne les recense.
   *
   * `null` veut dire « personne n'a répondu » et rend 28-33.
   */
  activityLevel: ActivityLevel | null;
}): EnergyTarget {
  const w = Number(args.weightKg);
  if (args.weightKg === null || !Number.isFinite(w) || w <= 0) {
    return noTarget("no_weight");
  }
  if (w < TARGET_WEIGHT_KG_MIN || w > TARGET_WEIGHT_KG_MAX) {
    return noTarget("implausible_weight");
  }
  const perKg = args.activityLevel === null
    ? {
      low: MAINTENANCE_KCAL_PER_KG_LOW,
      high: MAINTENANCE_KCAL_PER_KG_HIGH,
    }
    : ACTIVITY_KCAL_PER_KG[args.activityLevel];
  const round50 = (n: number) => Math.round(n / 50) * 50;
  return {
    range: {
      low: round50(perKg.low * w),
      high: round50(perKg.high * w),
    },
    basis: ENERGY_TARGET_BASIS,
    gap: null,
    weightKg: w,
    weightWeekStart: args.weightWeekStart,
  };
}

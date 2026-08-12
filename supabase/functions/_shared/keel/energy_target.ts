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
 * PURE MODULE: no I/O, no clock, no randomness.
 */

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

/** kcal par kg de poids corporel. Le bas couvre le sédentaire, le haut l'actif. */
export const MAINTENANCE_KCAL_PER_KG_LOW = 28;
export const MAINTENANCE_KCAL_PER_KG_HIGH = 33;

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
}): EnergyTarget {
  const w = Number(args.weightKg);
  if (args.weightKg === null || !Number.isFinite(w) || w <= 0) {
    return noTarget("no_weight");
  }
  if (w < TARGET_WEIGHT_KG_MIN || w > TARGET_WEIGHT_KG_MAX) {
    return noTarget("implausible_weight");
  }
  const round50 = (n: number) => Math.round(n / 50) * 50;
  return {
    range: {
      low: round50(MAINTENANCE_KCAL_PER_KG_LOW * w),
      high: round50(MAINTENANCE_KCAL_PER_KG_HIGH * w),
    },
    basis: ENERGY_TARGET_BASIS,
    gap: null,
    weightKg: w,
    weightWeekStart: args.weightWeekStart,
  };
}

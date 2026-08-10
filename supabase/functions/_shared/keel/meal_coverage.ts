/**
 * FF-040 (étape 8) — LE PLANCHER DE COUVERTURE ET LE RÉ-ANCRAGE.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-040-la-boucle-de-correction.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.3 et §2.6.
 *
 * ── DEUX MÉCANIQUES, UN SEUL FICHIER, ET C'EST DÉLIBÉRÉ ──────────────────
 * Le plancher de couverture et le ré-ancrage sont les deux endroits où le
 * moteur regarde l'ÉNERGIE D'UN PLAN plutôt que celle d'une assiette. Les
 * séparer ferait deux modules qui importeraient les mêmes constantes et
 * finiraient par en avoir deux copies.
 *
 * ── LE PLANCHER EST CÔTÉ PLAN, PAS CÔTÉ PERSONNE ─────────────────────────
 * Et c'est ce qui le rend armé même en `per_portion`: il ne dérive d'aucun
 * corps, d'aucun objectif, d'aucune enveloppe. Il regarde ce que les recettes
 * PÈSENT. Un élève sous plancher TCA en bénéficie donc exactement comme les
 * autres — ce qui est le seul sens acceptable pour une garde de couverture.
 *
 * ── SA DIRECTION EST PROTECTRICE, TOUJOURS ───────────────────────────────
 * Il n'AJOUTE que de la couverture. Il ne retire jamais d'énergie, ne resserre
 * jamais une bande, ne déclenche jamais un `lower_*`. Un plancher qui ferait
 * manger moins aurait inversé son propre sens.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  isFriedMethod,
  nutrientsOf,
  resolveIngredients,
} from "./food_composition.ts";
import type { GoalToken } from "./tokens.ts";
import type { MeasureTrend } from "./student_body.ts";

// ---------------------------------------------------------------------------
// LE PLANCHER DE COUVERTURE
// ---------------------------------------------------------------------------

/**
 * ~1550 kcal/jour.
 *
 * Sous ce niveau, couvrir les apports de référence en micronutriments devient
 * mathématiquement improbable, quelle que soit la qualité des choix (Nutrients
 * 2018 ; travaux Maillot/Darmon sur la densité nutritionnelle des régimes à
 * faible énergie). Ce n'est pas un seuil de sécurité clinique et ça ne prétend
 * pas l'être : c'est le point où le moteur cesse de pouvoir promettre une
 * couverture, et où il durcit donc ce qu'il peut encore garantir — la présence
 * des groupes sentinelles.
 *
 * Le design donne une fourchette (1500-1600). On prend le milieu et on l'ASSUME
 * comme opérationnel plutôt que d'en faire un chiffre de littérature.
 */
export const COVERAGE_FLOOR_KCAL_PER_DAY = 1550;

/**
 * L'état de la couverture d'un plan.
 *
 * `unverified` n'est PAS `ok`, et la distinction est la garde: fail-closed sur
 * la prétention. Un vert par défaut affirme ce que personne n'a vérifié, ce qui
 * est la pire des trois réponses.
 */
export type CoverageFlag = "ok" | "unsatisfiable" | "unverified";

export interface CoverageAssessment {
  /** L'énergie du PLAN par jour couvert. `null` = non calculable. */
  energyPerDay: number | null;
  /** Le plancher est-il franchi ? Faux quand non calculable. */
  floorHit: boolean;
  flag: CoverageFlag;
}

export interface CoverageDish {
  method: string;
  ingredients: readonly CompositionInput[];
}

/**
 * L'énergie du plan, et ce qu'on a le droit d'en dire.
 *
 * ── L'ABSTENTION EST LA MÊME QUE CELLE DU VERDICT ────────────────────────
 * Un plat non calculable rend tout le plan non calculable — pas « le plan moins
 * ce plat ». Un total amputé d'un dîner passerait sous le plancher pour une
 * raison qui n'est pas la bonne, et déclencherait un durcissement de fréquences
 * sur un plan qui n'en avait pas besoin.
 */
export function assessCoverage(args: {
  dishes: readonly CoverageDish[];
  index: CompositionIndex;
  daysCovered: number;
  /** Le verdict a-t-il pu être calculé ? Sinon, on ne prétend rien. */
  verdictComputable: boolean;
}): CoverageAssessment {
  const days = Math.max(1, args.daysCovered);
  if (!args.verdictComputable || args.dishes.length === 0) {
    return { energyPerDay: null, floorHit: false, flag: "unverified" };
  }

  let total = 0;
  for (const dish of args.dishes) {
    const r = resolveIngredients(args.index, dish.ingredients);
    if (r.resolved.length === 0) continue;
    const n = nutrientsOf(r.resolved, { friedMethod: isFriedMethod(dish.method) });
    if (n === "unknown") {
      return { energyPerDay: null, floorHit: false, flag: "unverified" };
    }
    total += n.energyKcal;
  }
  if (total <= 0) {
    return { energyPerDay: null, floorHit: false, flag: "unverified" };
  }

  const perDay = Math.round(total / days);
  return {
    energyPerDay: perDay,
    floorHit: perDay < COVERAGE_FLOOR_KCAL_PER_DAY,
    // `ok` ici veut dire « calculable et au-dessus du plancher », ou
    // « calculable, sous le plancher, mais les sentinelles sont couvertes ».
    // `unsatisfiable` est posé par l'APPELANT, après la correction: c'est lui
    // seul qui sait si le durcissement a réussi.
    flag: "ok",
  };
}

/**
 * Le drapeau final, après la boucle de correction.
 *
 * Séparé d'`assessCoverage` parce qu'il dépend d'une chose que le calcul ne
 * connaît pas: si la correction a comblé les trous. C'est l'appelant qui le
 * sait, et lui faire porter la décision évite de passer un booléen de plus
 * dans une fonction de mesure.
 */
export function coverageFlagAfterCorrection(
  assessment: CoverageAssessment,
  stillMissingSentinels: boolean,
): CoverageFlag {
  if (assessment.flag === "unverified") return "unverified";
  if (assessment.floorHit && stillMissingSentinels) return "unsatisfiable";
  return "ok";
}

// ---------------------------------------------------------------------------
// LE RÉ-ANCRAGE — recaler l'estimation sur l'observé, sous bornes
// ---------------------------------------------------------------------------

/** Le pas d'un recalage, en fraction de la maintenance estimée. */
export const RECALIBRATION_STEP = 0.05;
/** Le cumul maximal, dans les deux sens. */
export const RECALIBRATION_CAP = 0.10;
/** Combien de semaines contraires avant qu'un palier se déclenche. */
export const RECALIBRATION_WEEKS = 3;

/**
 * La direction qu'on ATTEND de la tendance, par dynamique.
 *
 * `switch` exhaustif: une dynamique nouvelle sans direction attendue ne
 * compile pas. `null` = aucune direction attendue, donc rien à contredire —
 * et c'est le cas de la majorité des dynamiques, ce qui est voulu: le
 * ré-ancrage ne s'arme que là où le produit a annoncé un sens.
 */
function expectedTrend(goal: GoalToken): MeasureTrend | null {
  switch (goal) {
    case "fat_loss":
      return "falling";
    case "muscle_gain":
      return "rising";
    case "recomposition":
      return null;
    case "performance":
      return null;
    case "health":
      return null;
    case "maintenance":
      return "stable";
  }
}

export interface RecalibrationState {
  /** Le décalage cumulé, en fraction. Borné à ±`RECALIBRATION_CAP`. */
  shiftPct: number;
  /** Semaines consécutives où la tendance contredit la direction attendue. */
  weeksAgainst: number;
}

/**
 * Le décalage du centre de bande, après une semaine de plus.
 *
 * ── POURQUOI DES BORNES, ET PAS UN ASSERVISSEMENT ────────────────────────
 * Sans borne, cette fonction transforme une estimation en boucle de
 * rétroaction sur le poids — c'est-à-dire un compteur de calories asservi à
 * une balance, dans un produit qui refuse les deux. Le cumul de 10 % est
 * l'ordre de grandeur de la thermogenèse adaptative documentée (100-300 kcal/j,
 * Rosenbaum & Leibel) : au-delà, on ne corrige plus une erreur de mesure, on
 * poursuit un chiffre.
 *
 * ── `static` NE RECALE RIEN, ET C'EST UN CHOIX DE COACH ──────────────────
 * Le ré-ancrage est une OPINION de la maison, pas un plancher. Un coach qui l'a
 * éteint reçoit une sortie identique à celle d'avant ce lot.
 *
 * ── UNE TENDANCE INCONNUE N'EST PAS UNE TENDANCE STABLE ──────────────────
 * `unknown` remet le compteur à zéro sans décaler. Traiter l'ignorance comme
 * une confirmation ferait recaler sur l'absence de données.
 */
export function nextRecalibration(args: {
  goal: GoalToken;
  trend: MeasureTrend;
  mode: "observed_trend" | "static";
  state: RecalibrationState;
}): RecalibrationState {
  const { state } = args;
  if (args.mode === "static") return { shiftPct: 0, weeksAgainst: 0 };

  const expected = expectedTrend(args.goal);
  if (expected === null || args.trend === "unknown") {
    return { shiftPct: state.shiftPct, weeksAgainst: 0 };
  }
  if (args.trend === expected) {
    // La direction est la bonne: on ne recale pas, et on remet le compteur à
    // zéro. Le décalage déjà acquis SURVIT — il corrigeait une erreur
    // d'estimation, et cette erreur n'a pas disparu parce que la semaine s'est
    // bien passée.
    return { shiftPct: state.shiftPct, weeksAgainst: 0 };
  }

  const weeks = state.weeksAgainst + 1;
  if (weeks < RECALIBRATION_WEEKS) {
    return { shiftPct: state.shiftPct, weeksAgainst: weeks };
  }
  // ── LE SENS DU DÉCALAGE ────────────────────────────────────────────────
  // La tendance contredit l'attendu ⇒ la maintenance estimée est fausse dans
  // le sens qui explique l'écart. `fat_loss` qui ne descend pas: on a
  // SURESTIMÉ la maintenance, donc on la baisse. `muscle_gain` qui ne monte
  // pas: on l'a sous-estimée, donc on la monte.
  const direction = expected === "falling" ? -1 : 1;
  const raw = state.shiftPct + direction * RECALIBRATION_STEP;
  const capped = Math.max(-RECALIBRATION_CAP, Math.min(RECALIBRATION_CAP, raw));
  // Le compteur repart à zéro: le palier suivant demande trois semaines de
  // plus. Sans ça, chaque semaine contraire ajouterait un palier et le plafond
  // serait atteint en deux mois.
  return { shiftPct: Number(capped.toFixed(4)), weeksAgainst: 0 };
}

// ---------------------------------------------------------------------------
// LE PLANCHER D'ANONYMAT — arbitrage A4
// ---------------------------------------------------------------------------

/**
 * k = 5. Usuel en divulgation statistique.
 *
 * ⚠️ Il s'applique à TOUT agrégat dérivé de verdicts, y compris les compteurs
 * qui semblent inoffensifs. Le défaut visé est l'INFÉRENCE PAR SOUSTRACTION:
 * deux agrégats dont la différence isole un élève sont une divulgation, même
 * si aucun des deux ne l'est pris seul.
 *
 * Ce que ça coûte, et qui est accepté: la synthèse est muette pour les coachs à
 * cohorte naissante — c'est-à-dire la majorité au début.
 */
export const COHORT_ANONYMITY_FLOOR = 5;

/**
 * Cet agrégat peut-il sortir ?
 *
 * Prend le nombre d'élèves DISTINCTS qui le composent, jamais le nombre de
 * lignes: dix verdicts de trois élèves font trois élèves.
 */
export function aggregateMayShip(distinctStudents: number): boolean {
  return distinctStudents >= COHORT_ANONYMITY_FLOOR;
}

/**
 * Deux agrégats peuvent-ils sortir ENSEMBLE ?
 *
 * ── C'EST ICI QUE SE JOUE L'INFÉRENCE PAR SOUSTRACTION ───────────────────
 * Deux agrégats de 12 et 8 élèves passent chacun le plancher; leur différence
 * porte sur 4 élèves et ne le passe pas. Publier les deux revient à publier le
 * troisième. La règle est donc: le plancher vaut aussi pour l'écart.
 */
export function aggregatePairMayShip(a: number, b: number): boolean {
  if (!aggregateMayShip(a) || !aggregateMayShip(b)) return false;
  return Math.abs(a - b) === 0 || Math.abs(a - b) >= COHORT_ANONYMITY_FLOOR;
}

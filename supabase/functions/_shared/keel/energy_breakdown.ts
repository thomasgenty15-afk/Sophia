import type { ActivityLevel } from "./tokens.ts";
import {
  ACTIVITY_KCAL_PER_KG,
  MAINTENANCE_KCAL_PER_KG_HIGH,
  MAINTENANCE_KCAL_PER_KG_LOW,
} from "./energy_target.ts";

/**
 * LE DÉTAIL DU CALCUL DE LA FOURCHETTE — de quoi le rendre à l'écran, sans
 * qu'aucun écran ne recalcule quoi que ce soit. 2026-09-21.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 * Demandé à l'écran: un bouton « Détail » à côté du repère quotidien, « qui
 * permette de donner le détail du calcul de manière carrée, comme ça c'est
 * transparent ».
 *
 * Le nombre affiché sort de DEUX chaînes différentes selon ce qu'on sait du
 * corps, et `meal_energy_shared.ts` choisit entre les deux (`useBody`). Un
 * écran qui voudrait « expliquer » le nombre sans savoir laquelle a servi
 * inventerait une explication — et le dépôt a une règle pour ça: **le front
 * n'a aucune formule d'énergie**, sans quoi l'écran et le plan finissent par
 * dire deux choses différentes.
 *
 * Ce module ne calcule donc RIEN de neuf. Il RASSEMBLE les nombres
 * intermédiaires que les deux chaînes ont déjà produits, et il NOMME celle qui
 * a servi. Le front traduit et met en page; il ne multiplie jamais.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE LE DÉTAIL N'A PAS LE DROIT DE DEVENIR
 * ═══════════════════════════════════════════════════════════════════════════
 * Les interdits de `energy_target.ts` valent ici au mot près, et ils valent
 * MIEUX ici, parce qu'un « détail » est exactement l'endroit où un tracker
 * repousse:
 *
 *   · AUCUN RESTE. Ce module ne soustrait rien de ce qui a été mangé. « Il te
 *     reste 680 kcal » est LA phrase d'un tracker; aucun champ ci-dessous ne
 *     permet de la construire — on ne rend que des ÉTAPES DE CALCUL, jamais
 *     une consommation;
 *   · AUCUN VERDICT. Pas de « au-dessus », pas de « en dessous », pas de
 *     couleur. Chaque champ est un nombre et son étiquette;
 *   · ET IL NE FRANCHIT AUCUNE PORTE. Ce module est appelé APRÈS
 *     `energy_gate.ts`, sur un chemin qui a déjà rendu `show: true`. Il ne
 *     prend aucun argument qui pourrait rouvrir une porte fermée, et il n'en
 *     lit aucun: à quelqu'un qui n'a pas le droit au chiffre, il n'y a pas de
 *     détail à donner — il n'y a pas de chiffre.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * QUELLE CHAÎNE A PRODUIT LE NOMBRE. Fermé, et chaque valeur a son rendu.
 *
 * ⚠️ CE N'EST PAS `EnergyTargetBasis`, ET LES CONFONDRE SERAIT UN CONTRESENS.
 * Le `basis` porte TROIS valeurs, dont deux décrivent la même arithmétique à
 * une direction près (`weight_range` et `weight_range_with_direction`): la
 * fourchette du poids, décalée ou non. Ce jeton-ci décrit les ÉTAPES à rendre,
 * et ces deux-là ont exactement les mêmes.
 */
export const ENERGY_BREAKDOWN_CHAINS = Object.freeze(
  [
    /** L'équation du corps × la bande de l'objectif. Un entretien en POINT. */
    "body_equation",
    /** Le raccourci: poids × kcal/kg. Un entretien en FOURCHETTE. */
    "weight_per_kg",
  ] as const,
);
export type EnergyBreakdownChain = (typeof ENERGY_BREAKDOWN_CHAINS)[number];

export interface EnergyBreakdown {
  readonly chain: EnergyBreakdownChain;
  /** La pesée qui entre dans le calcul, en kg. */
  readonly weightKg: number | null;
  /**
   * LE CRAN D'ACTIVITÉ DÉCLARÉ, ou `null` — « personne n'a répondu ».
   *
   * ⚠️ IL EST RENDU MÊME SUR LA CHAÎNE DU CORPS, où il entre autrement (dans
   * l'équation, pas comme un kcal/kg). Le taire là-bas ferait croire que
   * l'activité ne compte pas dans ce cas, alors qu'elle décide d'un facteur.
   */
  readonly activityLevel: ActivityLevel | null;
  /**
   * LES kcal/kg, quand c'est le raccourci qui a servi — sinon `null`.
   *
   * C'est la seule étape que le raccourci a et que l'équation n'a pas, et
   * c'est elle qui rend la fourchette de l'entretien lisible: 72 kg × 30-33.
   */
  readonly perKgLow: number | null;
  readonly perKgHigh: number | null;
  /**
   * L'ENTRETIEN, AVANT L'OBJECTIF. Un POINT sur la chaîne du corps (les deux
   * bornes sont égales), une FOURCHETTE sur le raccourci.
   */
  readonly maintenanceLow: number | null;
  readonly maintenanceHigh: number | null;
  /**
   * L'ÉCART QUOTIDIEN APPLIQUÉ, SIGNÉ — négatif sur une perte, positif sur une
   * prise, `0` quand l'objectif n'a pas bougé la fourchette.
   *
   * ⚠️ SIGNÉ ICI, ET PAS À L'ÉCRAN. `executedPaceFor` rend toujours une valeur
   * POSITIVE, et c'est la direction qui décide du sens. Laisser l'écran poser
   * le signe, ce serait une seconde règle: le jour où une troisième direction
   * arrive, l'écran se tromperait sans que rien ne rougisse.
   */
  readonly dailyDeltaKcal: number;
  /** La fourchette finale, telle qu'elle s'affiche. */
  readonly low: number;
  readonly high: number;
}

/**
 * ⛔ LE `null` EST TESTÉ AVANT LA CONVERSION, ET C'EST UN DÉFAUT MESURÉ.
 *
 * Écrit d'abord `Number.isFinite(Number(v)) ? … : null`. **`Number(null)` vaut
 * `0`**, pas `NaN` — et `Number("")` aussi. La garde « pas de fourchette, pas
 * de détail » ne se déclenchait donc JAMAIS: une cible absente rendait un
 * détail qui expliquait `0–0`, sous un écran qui affiche « pas encore
 * disponible ». Attrapé par le premier cas du test, pas à la relecture.
 */
function finite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * LE DÉTAIL, ASSEMBLÉ — ou `null` quand il n'y a pas de fourchette à expliquer.
 *
 * ⛔ `null` DÈS QU'UNE BORNE MANQUE, et c'est la garde qui compte: un détail
 * rendu à côté d'un « pas encore disponible » expliquerait un nombre que
 * l'écran ne montre pas.
 */
export function energyBreakdownFor(args: {
  /** La fourchette affichée. `null` de chaque côté = rien à expliquer. */
  low: number | null;
  high: number | null;
  /** `true` quand c'est l'équation du corps qui a servi (`useBody`). */
  fromBodyEquation: boolean;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  /** L'entretien de l'équation du corps — un point. Ignoré sur le raccourci. */
  bodyMaintenanceKcal: number | null;
  /** L'écart exécuté, TOUJOURS ≥ 0 (`executedPaceFor`). */
  dailyDeltaKcal: number;
  /** La direction de la balance, qui donne son signe à l'écart. */
  direction: "up" | "down" | null;
}): EnergyBreakdown | null {
  const low = finite(args.low);
  const high = finite(args.high);
  if (low === null || high === null) return null;

  const weightKg = finite(args.weightKg);
  const rawDelta = finite(args.dailyDeltaKcal) ?? 0;
  // ⛔ ARRONDI AU MÊME PAS QUE `directedRange` (50 kcal). Sans lui, le détail
  // afficherait « −536 » sous une fourchette décalée de 550, et l'arithmétique
  // ne tomberait pas juste à l'écran — c'est-à-dire que la transparence
  // produirait un doute au lieu de le lever.
  const shift = Math.round(Math.abs(rawDelta) / 50) * 50;
  const dailyDeltaKcal = args.direction === null || shift <= 0
    ? 0
    : args.direction === "up"
    ? shift
    : -shift;

  if (args.fromBodyEquation) {
    const maintenance = finite(args.bodyMaintenanceKcal);
    return {
      chain: "body_equation",
      weightKg,
      activityLevel: args.activityLevel,
      perKgLow: null,
      perKgHigh: null,
      maintenanceLow: maintenance,
      maintenanceHigh: maintenance,
      dailyDeltaKcal,
      low,
      high,
    };
  }

  // ── LE RACCOURCI: on REFAIT la multiplication, et c'est le seul endroit du
  //    dépôt où c'est permis — parce que c'est LA MÊME table de constantes que
  //    `maintenanceRange`, importée, jamais recopiée. L'alternative aurait été
  //    de faire remonter l'entretien d'avant le décalage à travers
  //    `directedRange`, qui ne le porte pas: il rend une fourchette DÉJÀ
  //    décalée, et rien d'autre.
  const perKg = args.activityLevel === null
    ? { low: MAINTENANCE_KCAL_PER_KG_LOW, high: MAINTENANCE_KCAL_PER_KG_HIGH }
    : ACTIVITY_KCAL_PER_KG[args.activityLevel];
  const round50 = (n: number) => Math.round(n / 50) * 50;
  return {
    chain: "weight_per_kg",
    weightKg,
    activityLevel: args.activityLevel,
    perKgLow: perKg.low,
    perKgHigh: perKg.high,
    maintenanceLow: weightKg === null ? null : round50(perKg.low * weightKg),
    maintenanceHigh: weightKg === null ? null : round50(perKg.high * weightKg),
    dailyDeltaKcal,
    low,
    high,
  };
}

/**
 * LA BANDE DE SURPLUS ET LA LIGNE D'AVERTISSEMENT — l'arithmétique qui les
 * relie, écrite une fois, et le VERDICT NOMMÉ de leur position relative.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI CE MODULE EXISTE — LE LOT `L37`, ET CE QU'IL A MESURÉ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Le lot `L37` (« le plafond de surplus monte à la ligne d'avertissement »)
 * partait d'une phrase: *« `MAX_SURPLUS_FRACTION` bloque à 0,29 kg/sem pendant
 * que l'avertissement n'alerte qu'à 0,5 — le produit interdit 42 % en dessous
 * de sa propre ligne de danger »*.
 *
 * ⛔ **MESURÉ LE 2026-08-22 À 18:37:52 CEST, SUR 600 CORPS ADULTES: LA PHRASE
 * EST FAUSSE, ET DE TROIS FAÇONS.**
 *
 *   ① **0,35 kg/semaine est DEMANDABLE sur 600/600 corps.** Le plafond du
 *      curseur d'une PRISE ne lit plus `MAX_SURPLUS_FRACTION` depuis le
 *      2026-08-18 (`paceCeilingFor`: la troisième borne vaut `Infinity` vers le
 *      haut). Le plancher observé du curseur est **0,40 kg/sem** (40 kg), décidé
 *      par `body_fraction` — 1 % du poids —, jamais par la bande.
 *   ② **Le CHECK en base accepte jusqu'à 1,0 kg/semaine**
 *      (`household_members_target_pace_range_check`), c'est-à-dire **AU-DESSUS**
 *      de la ligne d'avertissement, pas en dessous. Il n'y a aucun refus à
 *      convertir en avertissement: il n'y a **pas de refus**.
 *   ③ Ce que `MAX_SURPLUS_FRACTION` borne est le rythme **EXÉCUTÉ**
 *      (`executedPaceFor`, `clampedBy: "surplus_band"`), pas le rythme
 *      **DEMANDÉ**. Et « 0,29 kg/sem » n'est pas un plafond: c'est la valeur de
 *      la bande **pour un seul corps**, celui dont l'entretien vaut 3 187 kcal/j.
 *      La bande vaut 0,136 kg/sem à 1 500 kcal et 0,409 kg/sem à 4 500.
 *      **Un plafond exprimé en fraction ne se compare pas à une ligne exprimée
 *      en kilos sans nommer le corps.**
 *
 * ⇒ Le geste demandé — relever la fraction pour atteindre 0,35 kg/sem —
 * **n'est pas exécutable tel quel**: la fraction qui donne 0,35 kg/sem à un
 * corps de 1 800 kcal (**0,214**) en donne **0,75** à un corps de 3 850. Mesuré
 * sur la plage d'entretien du balayage: à 0,214, **358 entretiens sur 551**
 * exécutent au-delà de la ligne d'avertissement, contre **0 sur 551**
 * aujourd'hui. C'est une décision de produit (`ENERGY_BANDS.muscle_gain` est la
 * BANDE DE VERDICT, et son commentaire cite Helms 2023 en sens contraire), pas
 * un geste d'exécutant ⇒ **PORTE, écrite dans la fiche `L37`.**
 *
 * ── ⚠️ CE QUE CE MODULE NE PRÉTEND PAS, ET C'EST IMPORTANT ─────────────────
 * Il ne dit **pas** qu'un franchissement serait SILENCIEUX. `executedPaceFor`
 * rend `Math.min(voulu, plafond)`: **l'exécuté est toujours ≤ le cran choisi**,
 * donc un exécuté au-delà de la ligne implique un cran choisi au-delà de la
 * ligne, et `paceWarning` a déjà parlé. **La bande ne peut pas retirer
 * l'avertissement.** Ce que le franchissement change est l'ORDRE que le produit
 * s'est donné — servir en dessous de ce qu'il décrit comme risqué —, et c'est
 * cet ordre-là que ce module rend assertable.
 *
 * ── ⛔ CE QU'IL NE FAIT PAS NON PLUS ───────────────────────────────────────
 * Il ne décide rien, ne borne rien, n'est appelé par aucun moteur. C'est une
 * ARME: une fonction pure qui rend un jeton d'un vocabulaire FERMÉ, pour qu'un
 * test puisse écrire « aujourd'hui, la bande informe sans interdire » et rougir
 * le jour où ce n'est plus vrai. Le dépôt a mesuré douze fois qu'une garde
 * verte sur son propre cas ne prouve rien; celle-ci a ses deux sens.
 *
 * ⚠️ AUCUN IMPORT, ET C'EST LA RÈGLE §⑨ n° 92: un fichier neuf ne doit
 * dépendre d'aucun type qui n'existe que dans l'arbre de travail.
 * `meal_envelope.ts` et `weight_pace.ts` portent tous deux du travail non
 * commité d'autres sessions; les valeurs entrent donc par PARAMÈTRE, et c'est
 * le test — commitable, lui — qui va les y chercher.
 *
 * PURE: no I/O, no clock, no randomness.
 */

// ---------------------------------------------------------------------------
// L'ARITHMÉTIQUE — elle vivait dans SIX commentaires, jamais dans une fonction
// ---------------------------------------------------------------------------

/**
 * CE QUE LA BANDE EXÉCUTE, EN kg/SEMAINE, POUR UN CORPS DONNÉ.
 *
 * ⚠️ C'EST LA CONVERSION QUE LA FICHE `L37` N'AVAIT PAS FAITE. Une fraction de
 * l'entretien devient un rythme **par corps**; il n'existe aucun « le plafond
 * vaut 0,29 kg/sem » qui soit vrai pour deux personnes différentes.
 *
 * `null` — jamais un repli — dès qu'une entrée n'est pas un nombre fini
 * strictement positif: un rythme deviné se comparerait ensuite à une ligne de
 * sécurité, et c'est exactement le geste que ce module existe pour empêcher.
 */
export function bandKgPerWeek(
  maintenanceKcal: number,
  surplusFraction: number,
  kcalPerKgBodyMass: number,
): number | null {
  if (!positive(maintenanceKcal)) return null;
  if (!positive(surplusFraction)) return null;
  if (!positive(kcalPerKgBodyMass)) return null;
  return (maintenanceKcal * surplusFraction * 7) / kcalPerKgBodyMass;
}

/**
 * L'ENTRETIEN À PARTIR DUQUEL LA BANDE FRANCHIT LA LIGNE.
 *
 * ⚠️ C'EST LE SEUL NOMBRE QUI RÉSUME HONNÊTEMENT LA POSITION DES DEUX LIGNES.
 * Mesuré le 2026-08-22 avec les constantes du dépôt (`0,10` · `0,5 kg/sem` ·
 * `7 700 kcal/kg`): **5 500 kcal/jour**. Le premier corps réel qui l'atteint,
 * sur les bornes de plausibilité du dépôt lui-même (25-400 kg), est
 * `165 kg / 210 cm / male / trains_hard` — entretien 5 565, exécute
 * **0,506 kg/sem**.
 *
 * ⇒ **La bande d'aujourd'hui franchit DÉJÀ la ligne, sur les gabarits
 * extrêmes.** Elle ne la franchit pas sur la plage adulte ordinaire. Les deux
 * faits sont vrais, et c'est pourquoi `verdictOn` prend sa plage en paramètre
 * plutôt que de la deviner.
 *
 * `null` aux mêmes conditions que `bandKgPerWeek`.
 */
export function maintenanceCrossingWarning(
  warnKgPerWeek: number,
  surplusFraction: number,
  kcalPerKgBodyMass: number,
): number | null {
  if (!positive(warnKgPerWeek)) return null;
  if (!positive(surplusFraction)) return null;
  if (!positive(kcalPerKgBodyMass)) return null;
  return (warnKgPerWeek * kcalPerKgBodyMass) / 7 / surplusFraction;
}

/**
 * LA FRACTION QU'IL FAUDRAIT POUR EXÉCUTER `kgPerWeek` SUR CE CORPS-LÀ.
 *
 * ⚠️ ELLE EXISTE POUR RENDRE LE COÛT DU LOT `L37` CALCULABLE PLUTÔT
 * QU'ARGUMENTABLE. À 0,35 kg/sem: **0,154** sur 2 500 kcal, **0,214** sur
 * 1 800. Deux nombres, une seule demande — c'est la démonstration que « monter
 * le plafond à 0,35 » n'a pas de réponse unique.
 */
export function fractionReaching(
  kgPerWeek: number,
  maintenanceKcal: number,
  kcalPerKgBodyMass: number,
): number | null {
  if (!positive(kgPerWeek)) return null;
  if (!positive(maintenanceKcal)) return null;
  if (!positive(kcalPerKgBodyMass)) return null;
  return (kgPerWeek * kcalPerKgBodyMass) / 7 / maintenanceKcal;
}

// ---------------------------------------------------------------------------
// LE VERDICT — vocabulaire FERMÉ, jamais un booléen nu
// ---------------------------------------------------------------------------

/**
 * ⚠️ QUATRE JETONS, ET ILS S'EXCLUENT. `refuses_below_warning` implique un
 * plafond demandable ≤ la ligne, donc un exécuté ≤ la ligne: il ne peut pas
 * cohabiter avec `band_crosses_warning`. L'ordre d'évaluation de `verdictOn`
 * n'est donc pas une préséance déguisée.
 */
export const SURPLUS_BAND_VERDICTS = [
  /**
   * LE CAS SAIN, ET C'EST CELUI D'AUJOURD'HUI SUR LA PLAGE ADULTE ORDINAIRE.
   * Le produit laisse DEMANDER au-delà de sa ligne, et n'EXÉCUTE pas au-delà.
   */
  "informs_without_forbidding",
  /**
   * ⛔ CE QUE LA FICHE `L37` CROYAIT MESURER, ET QUI N'EST PAS L'ÉTAT DU
   * PRODUIT. Le plafond demandable est à la ligne ou en dessous: le produit
   * refuse au niveau même qu'il qualifie de risqué, et son avertissement ne
   * peut plus jamais se déclencher — un avertissement inatteignable est un
   * avertissement mort.
   */
  "refuses_below_warning",
  /**
   * ⚠️ La bande exécute au-delà de la ligne pour au moins un corps de la plage.
   * ⛔ **CE N'EST PAS UN SILENCE**: l'exécuté est ≤ le cran choisi, donc
   * `paceWarning` a déjà parlé. C'est l'ordre du produit qui s'inverse — il
   * SERT ce qu'il décrit comme partant surtout en gras.
   */
  "band_crosses_warning",
  /** Une entrée n'est pas un nombre fini positif. Nommé, jamais un repli. */
  "unmeasurable",
] as const;
export type SurplusBandVerdict = (typeof SURPLUS_BAND_VERDICTS)[number];

/** Ce qu'on sait au moment de juger. Forme LOCALE et minimale — règle n° 92. */
export interface SurplusBandInputs {
  /** `MAX_SURPLUS_FRACTION` — la bande EXÉCUTÉE, en fraction de l'entretien. */
  readonly surplusFraction: number;
  /** `PACE_WARN_UP_KG_PER_WEEK` — la ligne où le produit PARLE, en kg/semaine. */
  readonly warnKgPerWeek: number;
  /**
   * Le rythme le plus rapide qu'une personne peut DEMANDER, en kg/semaine —
   * le plus petit des plafonds réellement opposés à ce corps: le curseur
   * (`paceCeilingFor`) et le CHECK de la base.
   */
  readonly requestableCeilingKgPerWeek: number;
  /** `KCAL_PER_KG_BODY_MASS`. */
  readonly kcalPerKgBodyMass: number;
  /**
   * La plage d'entretien sur laquelle on juge, en kcal/jour.
   *
   * ⚠️ PARAMÈTRE ET PAS CONSTANTE, PARCE QUE LA RÉPONSE EN DÉPEND ET QUE LE
   * CACHER SERAIT MENTIR. Sur la plage adulte ordinaire mesurée le 2026-08-22
   * (1 438-5 215 kcal/j, 600 corps de 40 à 160 kg), la bande d'aujourd'hui ne
   * franchit pas la ligne. Sur les bornes de plausibilité du dépôt (25-400 kg,
   * 1 130-10 265 kcal/j), **elle la franchit déjà**.
   */
  readonly maintenanceRangeKcal: {
    readonly lowestKcal: number;
    readonly highestKcal: number;
  };
}

/**
 * OÙ SE TIENNENT LES DEUX LIGNES L'UNE PAR RAPPORT À L'AUTRE.
 *
 * ⚠️ LA COMPARAISON DU HAUT EST STRICTE, ET C'EST LA RÈGLE DE `paceWarning`
 * RECOPIÉE À DESSEIN: le seuil est FRANCHI, pas atteint (`kgPerWeek > warn`).
 * Un plafond demandable exactement égal à la ligne rend donc l'avertissement
 * inatteignable, et c'est bien `refuses_below_warning`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function verdictOn(inputs: SurplusBandInputs): SurplusBandVerdict {
  const {
    surplusFraction,
    warnKgPerWeek,
    requestableCeilingKgPerWeek,
    kcalPerKgBodyMass,
    maintenanceRangeKcal,
  } = inputs;
  const { lowestKcal, highestKcal } = maintenanceRangeKcal;

  if (
    !positive(surplusFraction) || !positive(warnKgPerWeek) ||
    !positive(requestableCeilingKgPerWeek) || !positive(kcalPerKgBodyMass) ||
    !positive(lowestKcal) || !positive(highestKcal) || highestKcal < lowestKcal
  ) {
    return "unmeasurable";
  }

  if (requestableCeilingKgPerWeek <= warnKgPerWeek) {
    return "refuses_below_warning";
  }

  // Le corps le plus gourmand de la plage est celui qui franchit en premier:
  // la bande est monotone croissante en l'entretien.
  const highest = bandKgPerWeek(highestKcal, surplusFraction, kcalPerKgBodyMass);
  if (highest === null) return "unmeasurable";
  if (highest > warnKgPerWeek) return "band_crosses_warning";

  return "informs_without_forbidding";
}

/**
 * ⛔ L'INVARIANT QUE `L37` NE DOIT PAS FRANCHIR, ISOLÉ POUR ÊTRE MUTÉ.
 *
 * Élargir la bande est permis **jusqu'au point où elle atteint la ligne**, pas
 * au-delà: au-delà, le moteur exécuterait un rythme que le produit décrit
 * lui-même comme partant surtout en gras. C'est la lecture exécutable de
 * « le plafond monte À la ligne d'avertissement » — À, pas AU-DELÀ.
 *
 * Rend la plus grande fraction admissible sur cette plage, ou `null`.
 */
export function widestAdmissibleFraction(
  warnKgPerWeek: number,
  highestMaintenanceKcal: number,
  kcalPerKgBodyMass: number,
): number | null {
  if (!positive(warnKgPerWeek)) return null;
  if (!positive(highestMaintenanceKcal)) return null;
  if (!positive(kcalPerKgBodyMass)) return null;
  return (warnKgPerWeek * kcalPerKgBodyMass) / 7 / highestMaintenanceKcal;
}

function positive(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

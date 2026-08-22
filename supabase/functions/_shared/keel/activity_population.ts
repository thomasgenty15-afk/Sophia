// ═══════════════════════════════════════════════════════════════════════════
// L16′ — L'IDENTITÉ DE POPULATION DE L'ACTIVITÉ
//
//     crossed + legacy + assumed  ==  nombre de bouches dimensionnées
//
// ⛔ C'EST UNE IDENTITÉ, PAS UN OBJECTIF. Elle se tient, ou le compteur ment.
// `ACTIVITY_FACTOR_SOURCES` (`meal_envelope.ts`) nomme TROIS populations et
// prétend, par sa seule existence, qu'il n'y en a pas de quatrième. Rien ne le
// vérifiait: `generate-household-meal-v1/index.ts` construit les deux
// histogrammes (`box_sizing.activity_source` et `box_sizing.mouths`) dans deux
// boucles SÉPARÉES sur `members`, et **la seconde porte un `continue`**
// (`if (!sizing) continue;`). Le jour où ce `continue` mord, une bouche reçoit
// un facteur d'activité et n'apparaît dans AUCUN motif de dimensionnement —
// c'est-à-dire qu'elle est dimensionnée sur une hypothèse **que personne ne
// voit**. C'est très exactement le zéro ambigu que ce dépôt paie en boucle.
//
// ── ⛔ POURQUOI LE TÉMOIN EST `member_count`, ET PAS L'AUTRE HISTOGRAMME ────
// Comparer `Σ activity_source` à `Σ mouths` ne ferme rien: les deux boucles
// itèrent la MÊME liste, donc une bouche perdue en amont (roster tronqué,
// membre filtré) disparaît des DEUX côtés et l'égalité reste vraie. Une garde
// qui ne peut pas rougir ressemble à une garde qui marche. Le verdict est donc
// ancré sur un TROISIÈME nombre, écrit par un autre chemin:
// `generated_from.household.member_count`. Mesuré le 2026-08-22 sur les 12
// plans du millésime vivant: `member_count = Σ activity_source = Σ mouths = 4`.
//
// ── ⚠️ ET LE MOT `assumed` DÉSIGNE DEUX POPULATIONS SELON QUI LE LIT ───────
// Au RUNTIME, une bouche SANS ligne de corps traverse `lineBodies` sans y
// entrer (`index.ts`, tout-ou-rien sur taille/poids/sexe), donc
// `activityFactorOf({day:null, sport:null, asked:false}, null)` rend `assumed`.
// Dans le tableau de bord `V0-E′` (compteur #6), la même bouche n'existe pas du
// tout: la requête part de `household_member_bodies`, donc d'une LIGNE DE
// CORPS, pas d'une BOUCHE. Mesuré le 2026-08-22 à 16:12 CEST: **47 corps** pour
// **92 bouches**. `censusMouthOf(null)` existe pour que les deux lectures
// obéissent à UNE règle et pas deux — c'est le seul moyen de comparer les deux
// chiffres sans les confondre.
//
// PURE: no I/O, no clock, no randomness.
// ═══════════════════════════════════════════════════════════════════════════

import {
  ACTIVITY_FACTOR_SOURCES,
  type ActivityAxes,
  type ActivityFactorSource,
  activityFactorOf,
} from "./meal_envelope.ts";
import type { ActivityLevel, DayActivityLevel, SportFrequency } from "./tokens.ts";

/**
 * CE QUE LE MOTEUR LIT D'UNE BOUCHE POUR CHOISIR SA SOURCE DE FACTEUR.
 *
 * ⚠️ Les deux axes ET le cran d'hier, jamais l'un sans l'autre: c'est la
 * cascade d'`activityFactorOf`, et la recopier ailleurs en ferait une seconde.
 */
export interface CensusMouth {
  readonly axes: ActivityAxes;
  readonly legacyLevel: ActivityLevel | null;
}

/** LA LIGNE DE CORPS, réduite aux trois colonnes qui décident de la source. */
export interface CensusBodyLine {
  readonly dayActivity: DayActivityLevel | null;
  readonly sportFrequency: SportFrequency | null;
  readonly activityLevel: ActivityLevel | null;
  /** `activity_axes_asked_at is not null` — il ne change PAS la source. */
  readonly axesAsked?: boolean;
}

/**
 * UNE BOUCHE, AVEC OU SANS LIGNE DE CORPS — ET `null` EST LE CAS QUI COMPTE.
 *
 * ⛔ `null` NE VEUT PAS DIRE « on ne sait pas la compter »: il veut dire
 * `assumed`, c'est-à-dire dimensionnée sur l'hypothèse 1,5. C'est ce que le
 * runtime fait déjà, en silence, pour toute bouche dont le maître n'a saisi ni
 * taille ni poids. L'écrire ici est la seule façon qu'un compteur du
 * RÉFÉRENTIEL rende le même verdict qu'un compteur du RUNTIME.
 */
export function censusMouthOf(body: CensusBodyLine | null): CensusMouth {
  if (body === null) {
    return { axes: { day: null, sport: null, asked: false }, legacyLevel: null };
  }
  return {
    axes: {
      day: body.dayActivity,
      sport: body.sportFrequency,
      asked: body.axesAsked ?? false,
    },
    legacyLevel: body.activityLevel,
  };
}

/**
 * LE JETON EST-IL NOMMÉ PAR `ACTIVITY_FACTOR_SOURCES` ?
 *
 * ⛔ EXPORTÉ EXPRÈS, ET ÉPROUVÉ DIRECTEMENT. Une quatrième source ajoutée à
 * `activityFactorOf` sans son seau ici rendrait un histogramme à trois cases
 * pour quatre populations — et il aurait l'air juste, parce que la somme d'un
 * seau manquant est zéro. La garde a besoin d'un cas qui PASSE (`"crossed"`) et
 * d'un cas qui MORD (n'importe quoi d'autre): un test qui n'exerce que le
 * second ne prouve pas que la porte s'ouvre.
 */
export function isNamedActivitySource(source: string): source is ActivityFactorSource {
  return (ACTIVITY_FACTOR_SOURCES as readonly string[]).includes(source);
}

/**
 * UNE BOUCHE DE PLUS DANS SON SEAU — ⛔ ET IL LÈVE PLUTÔT QUE D'EN INVENTER UN.
 *
 * ⚠️ FONCTION À PART, ET C'EST CE QUI LA REND ÉPROUVABLE. Le jeton hors
 * vocabulaire est **inatteignable depuis `activityFactorOf` aujourd'hui** — le
 * test cartésien de ce module le prouve sur toutes les entrées possibles. Un
 * verrou dont le cas mordant n'est pas exerçable est un verrou dont personne ne
 * sait s'il ferme: on l'expose donc, et on l'éprouve directement, avec son cas
 * qui PASSE et son cas qui MORD.
 *
 * Pourquoi lever, et pas ajouter la clé: un `Record` complaisant absorbe une
 * quatrième population en silence, et le lecteur du journal lit trois nombres
 * qui somment — une identité qui « tient » alors qu'elle est fausse.
 */
export function tallyActivitySource(
  census: Record<string, number>,
  source: string,
): void {
  if (!isNamedActivitySource(source)) {
    throw new Error(
      `tallyActivitySource: source hors vocabulaire "${source}" — ` +
        `une population que ACTIVITY_FACTOR_SOURCES ne nomme pas`,
    );
  }
  census[source] += 1;
}

/** L'HISTOGRAMME DES TROIS SOURCES, SUR UNE LISTE DE BOUCHES. */
export function activitySourceCensus(
  mouths: readonly CensusMouth[],
): Record<ActivityFactorSource, number> {
  const out = {} as Record<ActivityFactorSource, number>;
  // ⚠️ LES TROIS SEAUX EXISTENT AVANT LA BOUCLE, MÊME À ZÉRO. « personne n'est
  // `legacy` » et « le seau `legacy` n'existe pas » rendraient le même silence.
  for (const source of ACTIVITY_FACTOR_SOURCES) out[source] = 0;
  for (const mouth of mouths) {
    tallyActivitySource(out, activityFactorOf(mouth.axes, mouth.legacyLevel).source);
  }
  return out;
}

/** LA SOMME D'UN HISTOGRAMME DE `generated_from`, ou `null` s'il est absent. */
export function histogramTotal(
  histogram: Readonly<Record<string, number>> | null | undefined,
): number | null {
  if (!histogram) return null;
  let total = 0;
  for (const value of Object.values(histogram)) {
    if (!Number.isFinite(value)) continue;
    total += value;
  }
  return total;
}

/** LE VERDICT D'UN PLAN — trois nombres, et ce qu'ils laissent dehors. */
export interface ActivityPopulationVerdict {
  /** Le témoin indépendant: `generated_from.household.member_count`. */
  readonly mouths: number;
  /** `Σ box_sizing.activity_source`, ou `null` si le compteur n'a pas tourné. */
  readonly bySource: number | null;
  /** `Σ box_sizing.mouths`, ou `null` si le compteur n'a pas tourné. */
  readonly bySizing: number | null;
  /** Bouches qu'aucune source ne compte. ⛔ `null` = compteur absent, pas 0. */
  readonly uncountedBySource: number | null;
  /** Bouches qu'aucun motif de dimensionnement ne compte. */
  readonly uncountedBySizing: number | null;
  /**
   * ⛔ `false` DÈS QU'UN COMPTEUR MANQUE. « le compteur n'a pas tourné » n'est
   * pas « l'identité tient »: c'est le zéro ambigu, et c'est le cas des 46
   * plans foyer antérieurs au 2026-08-20 comme des 79 plans solo, qui n'ont
   * aucun `box_sizing` du tout.
   */
  readonly holds: boolean;
}

/**
 * L'IDENTITÉ, SUR UN PLAN.
 *
 * ⛔ ELLE SE PREND CONTRE `mouths` (le témoin), PAS ENTRE LES DEUX
 * HISTOGRAMMES. Voir l'en-tête: `Σ source == Σ sizing` est vrai même quand les
 * deux boucles ont perdu la même bouche.
 */
export function activityPopulationVerdict(input: {
  readonly mouths: number;
  readonly activitySource: Readonly<Record<string, number>> | null | undefined;
  readonly sizingReasons: Readonly<Record<string, number>> | null | undefined;
}): ActivityPopulationVerdict {
  const bySource = histogramTotal(input.activitySource);
  const bySizing = histogramTotal(input.sizingReasons);
  return {
    mouths: input.mouths,
    bySource,
    bySizing,
    uncountedBySource: bySource === null ? null : input.mouths - bySource,
    uncountedBySizing: bySizing === null ? null : input.mouths - bySizing,
    holds: bySource !== null && bySizing !== null &&
      bySource === input.mouths && bySizing === input.mouths,
  };
}

/**
 * LA PORTE CONDITIONNELLE — ⛔ ELLE MESURE, ELLE NE TRANCHE PAS.
 *
 * `crossed ≥ 50 %` dépend d'une décision produit qui n'appartient PAS à ce lot:
 * *l'activité doit-elle RETENIR l'entonnoir d'inscription ?* La décision du
 * 2026-08-19 est allée dans l'autre sens, **avec un arbitrage écrit** (seuls
 * nom, date, corps et objectif retiennent). La renverser demande de la nommer.
 *
 * Cette fonction rend donc le TAUX et l'état de la porte, jamais un verdict:
 * `pending` tant que personne n'a tranché. Un booléen ici serait une décision
 * prise en passant — le défaut que §⑦ interdit en toutes lettres.
 */
export function crossedShareGate(
  census: Readonly<Record<string, number>>,
): { readonly crossed: number; readonly total: number; readonly share: number | null } {
  const total = histogramTotal(census) ?? 0;
  const crossed = census["crossed"] ?? 0;
  return { crossed, total, share: total === 0 ? null : crossed / total };
}

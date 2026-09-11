// KEEL — L3 · CE QU'ON DIT SOUS LE CURSEUR DE RYTHME.
//
// ── ⚠️ LIS D'ABORD CECI (2026-09-01) ──────────────────────────────────────
// LE NOMBRE DE SEMAINES EST REVENU, À LA DEMANDE, ET SA RÉSERVE AVEC LUI.
// Il avait été retiré le 2026-08-22 (lot `L3`) sur une mesure qui, elle, n'a
// pas bougé et reste écrite ci-dessous. Ce qui change est la DÉCISION prise
// sur cette mesure: le chiffre se rend, et il se rend COLLÉ à ce qu'il est —
// le calcul du curseur, pas une date.
//
// ⛔ CE MODULE NE REND PLUS UN JETON NU, ET C'EST LÀ QUE TIENT LA RÉSERVE.
// `ARRIVAL_HORIZON_TEMPLATES` porte le nombre ET sa réserve dans UNE SEULE
// chaîne: il n'existe aucun rendu qui puisse prendre l'un sans l'autre. Un
// écran qui voudrait « juste le chiffre » devrait découper la phrase à la
// main, et `arrivalCopyCarriesItsReserve` refuserait le gabarit découpé.
//
// ── ⚠️ LA MESURE QUI A FAIT RETIRER LE CHIFFRE — ELLE RESTE VRAIE ─────────
// À l'échelle de la dépense TOTALE, les meilleures équations testées contre
// l'eau doublement marquée gardent un RMSE d'environ 20 % et ne placent que
// 43 à 54 % des individus à ±10 % (Prado-Nóvoa, Sci Rep 2024). Sur notre
// corpus, ça vaut ~±580 kcal/j — PLUS GRAND que notre plafond de déficit
// (`MAX_DAILY_DEFICIT_KCAL` = 500).
//
// Mesuré le 2026-08-22 à 17:16 CEST sur les cas de design du dépôt:
//
//   femme 60 kg → 55 kg : l'écran disait « About 12 weeks at this pace. »
//     écart prescrit 495 kcal/j → intervalle réel [-85 … 1075] kcal/j
//     semaines réellement possibles : de 6 à JAMAIS
//   homme 95 kg → 80 kg : l'écran disait « About 34 weeks at this pace. »
//     semaines réellement possibles : de 16 à JAMAIS
//
// ⛔ C'EST CE « JAMAIS » QUE LA RÉSERVE DOIT PORTER, et c'est pour ça qu'elle
// ne dit pas « environ », « à peu près » ni « ±30 % »: une largeur annoncée
// ferait passer pour bornée une borne haute qui est l'infini. Elle dit ce
// qui est vrai sans borne — le chiffre vient du CURSEUR, le rythme réel
// viendra de la BALANCE.
//
// ── ⛔ CE QUE LA PHRASE N'A PAS LE DROIT DE DIRE ──────────────────────────
//   ① UNE FOURCHETTE. « 12 à 24 semaines » serait une seconde promesse,
//      fausse comme la première, pour la raison ci-dessus.
//   ② « LE PLAN SUIVRA VOS PESÉES ». Le lot `L11★` mesure 9 comptes portant
//      plus d'une pesée et ZÉRO BOUCHE, et aucun écrivain ne propage vers
//      `household_member_bodies.weight_kg`. Ce serait remplacer une promesse
//      fausse par une autre. « Seule la balance dira le rythme réel » parle
//      de ce que la personne verra, pas de ce que le produit fera.
//   ③ DES kcal — clause C5, même raison que `PACE_WARNING_LABELS`: une
//      grandeur d'énergie PAR BOUCHE sortirait ici sans avoir traversé la
//      moindre porte, à côté d'un curseur que le compte maître règle POUR
//      QUELQU'UN D'AUTRE.
//
// ── ⛔ LA SECONDE SURFACE, ET POURQUOI ELLE EST PARTIE ────────────────────
// Le champ « poids visé » portait un `hint` rendu SANS CONDITION. Il a dit,
// successivement:
//
//   avant le 2026-08-22 : « Avec le rythme ci-dessous, il donne une date
//                           d'arrivée. »        → la promesse, en toutes lettres
//   du 2026-08-22 au -09-01 : « …il dit le sens de marche, pas le moment où
//                           il sera atteint. »  → la négation de la promesse
//
// ⛔ LES DEUX SONT INTENABLES AVEC LE CHIFFRE DE RETOUR: la première le
// surpromet, la seconde le CONTREDIT à quinze lignes de distance. Le `hint`
// est donc retiré, pas réécrit — la phrase sous le curseur porte maintenant
// l'horizon ET sa réserve, au moment exact où le curseur se pousse. Un
// troisième texte ailleurs ne pourrait que diverger de celui-là.
//
// ⚠️ `household.mouth.target_weight_hint` reste dans les catalogues, plus
// lue. `en.ts`/`fr.ts` sont interdits de commit sur cette campagne.
//
// ── ⚠️ LE MODULE PORTE SON PROPRE CATALOGUE DE LANGUE ─────────────────────
// Comme `PACE_WARNING_LABELS` dans `weight_pace.ts`. La phrase et sa décision sont un seul objet: les séparer
// laisse l'une bouger sans l'autre, et c'est toujours la phrase qui bouge.
//
// PURE MODULE: no I/O, no clock, no randomness.

import { weeksToTarget } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

/**
 * Le seul horizon que ce produit rend.
 *
 * ⚠️ LE NOM DIT LA RÉSERVE, PAS SEULEMENT LE CONTENU: `weeks_at_this_pace`,
 * et pas `arrival_date`. Ce qui est calculé est un nombre de semaines AU
 * RYTHME DU CURSEUR; ce n'est pas une date d'arrivée, et le jeton ne doit pas
 * laisser croire à un prochain lecteur que c'en est une.
 */
export const ARRIVAL_HORIZONS = ["weeks_at_this_pace"] as const;
export type ArrivalHorizonKind = (typeof ARRIVAL_HORIZONS)[number];

/** L'horizon, avec son nombre — jamais l'un sans l'autre. */
export type ArrivalHorizon = {
  kind: ArrivalHorizonKind;
  /** Entier, arrondi AU SUPÉRIEUR par `weeksToTarget`. */
  weeks: number;
};

/**
 * LE GABARIT, DANS LES DEUX LANGUES — NOMBRE ET RÉSERVE DANS UNE MÊME CHAÎNE.
 *
 * ⛔ NE LES SÉPARE PAS EN DEUX CLÉS. C'est la seule chose qui garantit qu'un
 * écran ne peut pas rendre « Environ 32 semaines. » tout seul: il n'y a pas
 * de moitié à prendre. La garde ci-dessous refuse d'ailleurs tout gabarit qui
 * perdrait sa réserve, et le test l'applique à CHAQUE entrée.
 */
export const ARRIVAL_HORIZON_TEMPLATES: Record<
  ArrivalHorizonKind,
  { en: string; fr: string }
> = {
  weeks_at_this_pace: {
    en: "About {weeks} weeks at this pace. That is the slider's arithmetic, " +
      "not a date: only the scale will tell the real pace.",
    fr: "Environ {weeks} semaines à ce rythme. C'est le calcul du curseur, " +
      "pas une date : seule la balance dira le rythme réel.",
  },
};

/**
 * LES MOTS DE LA RÉSERVE — vocabulaire FERMÉ, par langue, possédé par ce
 * module.
 *
 * ⚠️ PAR LANGUE, ET PAS UNE LISTE UNIQUE: la réserve française et l'anglaise
 * ne partagent aucun mot, et une liste commune rendrait la garde verte sur
 * une phrase mi-traduite.
 *
 * ⚠️ CE N'EST PAS UN MATCHER SUR DU TEXTE LIBRE — ce que ce dépôt s'interdit
 * (« laitue » ≠ « lait »). Le corpus fait deux chaînes, et elles sont écrites
 * dix lignes plus haut.
 */
const RESERVE_MARKERS: Record<"en" | "fr", readonly string[]> = {
  // ① ce que le chiffre N'EST PAS, ② d'où viendra le rythme réel.
  en: ["not a date", "the scale"],
  fr: ["pas une date", "la balance"],
};

/** Le trou trouvé dans un gabarit, nommé — jamais un `false` nu. */
export type ReserveLeak =
  | { kind: "no_number" }
  | { kind: "missing_reserve"; missing: string };

/**
 * CE GABARIT PORTE-T-IL SON NOMBRE **ET** SA RÉSERVE ?
 *
 * `null` = oui, il peut s'afficher — et c'est LE CAS QUI PASSE, celui sans
 * lequel cette garde bloquerait tout en ressemblant à une garde qui marche
 * (cicatrice `guards-need-a-passing-case`). Les deux gabarits livrés le
 * prouvent, dans les deux langues.
 *
 * ⛔ CE QU'ELLE GARDE EST L'INVARIANT DU LOT, PAS L'ANCIEN: le chiffre a le
 * droit d'exister, il n'a pas le droit d'exister SEUL. La garde d'avant
 * (`arrivalCopyIsCalendarFree`, 2026-08-22) refusait tout mot de calendrier;
 * elle est retirée avec la décision qu'elle tenait, pas oubliée.
 *
 * ⛔ CE QU'ELLE NE COUVRE PAS, ÉCRIT PLUTÔT QU'OUBLIÉ: une réserve présente
 * mais noyée (trois phrases avant le chiffre), ou rendue dans un autre bloc
 * visuel. Elle attrape la séparation, qui est la forme qu'a prise la perte
 * pendant toute la vie de cet écran.
 */
export function arrivalCopyCarriesItsReserve(
  template: string,
  lang: "en" | "fr",
): ReserveLeak | null {
  if (!template.includes("{weeks}")) return { kind: "no_number" };
  const lowered = template.toLocaleLowerCase(lang === "fr" ? "fr-FR" : "en-GB");
  for (const marker of RESERVE_MARKERS[lang]) {
    if (!lowered.includes(marker)) {
      return { kind: "missing_reserve", missing: marker };
    }
  }
  return null;
}

/**
 * LA PHRASE PRÊTE À RENDRE.
 *
 * ⚠️ LE NOMBRE PASSE PAR `toLocaleString`: un entier n'a pas de décimale à
 * séparer, mais il a un séparateur de milliers, et « 1 040 semaines » ne
 * s'écrit pas « 1,040 » en français.
 */
export function arrivalHorizonCopy(
  horizon: ArrivalHorizon,
  lang: "en" | "fr",
): string {
  const weeks = horizon.weeks.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB");
  return ARRIVAL_HORIZON_TEMPLATES[horizon.kind][lang]
    .replace("{weeks}", weeks);
}

/**
 * LA PRÉMISSE — la phrase ne sort que là où elle a un sens.
 *
 * ⛔ ELLE EST ARMÉE, comme chaque phrase de `plan_rationale.ts`: sans cible
 * acceptée, sans rythme vivant et sans écart, elle ne sort pas. Une phrase
 * qui sort toujours n'informe de rien.
 *
 * ⚠️ `weeksToTarget` RESTE LE SEUL ENDROIT OÙ LA DIVISION SE FAIT, avec ses
 * tests (`weight_pace_test.ts`) et son arrondi au supérieur choisi: une date
 * annoncée trop tôt est une déception programmée, trop tard une bonne
 * surprise. Recalculer ici donnerait deux arithmétiques à faire diverger.
 */
export function arrivalHorizonFor(input: {
  /** La cible a passé `targetWeightRefusal` — donc écart non nul et bon sens. */
  targetAccepted: boolean;
  /** Le poids d'aujourd'hui, ou `null` quand le corps n'est pas encore là. */
  currentKg: number | null;
  /** Le poids visé, ou `null`. */
  targetKg: number | null;
  /** Le cran du curseur, ou `null` quand il n'y a pas de curseur. */
  paceKgPerWeek: number | null;
}): ArrivalHorizon | null {
  if (!input.targetAccepted) return null;
  const { currentKg, targetKg, paceKgPerWeek: pace } = input;
  if (currentKg === null || targetKg === null || pace === null) return null;
  if (!Number.isFinite(currentKg) || !Number.isFinite(targetKg)) return null;
  if (!Number.isFinite(pace) || pace <= 0) return null;
  const weeks = weeksToTarget(currentKg, targetKg, pace);
  if (weeks === null) return null;
  return { kind: "weeks_at_this_pace", weeks };
}

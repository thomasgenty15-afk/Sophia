// KEEL — L3 · CE QU'ON DIT À LA PLACE D'UNE DATE D'ARRIVÉE.
//
// Lot `L3` du plan `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`
// (2026-08-22). Décision produit, pas un nettoyage.
//
// ── ⛔ LE CHIFFRE QUI INTERDIT LA DATE ────────────────────────────────────
// À l'échelle de la dépense TOTALE, les meilleures équations testées contre
// l'eau doublement marquée gardent un RMSE d'environ 20 % et ne placent que
// 43 à 54 % des individus à ±10 % (Prado-Nóvoa, Sci Rep 2024). Sur notre
// corpus, ça vaut ~±580 kcal/j — PLUS GRAND que notre plafond de déficit
// (`MAX_DAILY_DEFICIT_KCAL` = 500).
//
// Mesuré le 2026-08-22 à 17:16 CEST sur les cas de design du dépôt, en
// appelant le module de décision de l'écran:
//
//   femme 60 kg → 55 kg : l'écran disait « About 12 weeks at this pace. »
//     écart prescrit 495 kcal/j → intervalle réel [-85 … 1075] kcal/j
//     semaines réellement possibles : de 6 à JAMAIS
//   homme 95 kg → 80 kg : l'écran disait « About 34 weeks at this pace. »
//     semaines réellement possibles : de 16 à JAMAIS
//
// ⛔ C'EST CE « JAMAIS » QUI FERME AUSSI LA FOURCHETTE, ET PAS SEULEMENT LA
// DATE. L'intervalle de l'écart quotidien exécuté TRAVERSE ZÉRO: la borne
// haute du nombre de semaines est l'infini. « 12 à 24 semaines » aurait été
// une SECONDE promesse, fausse comme la première, et une largeur annoncée
// (« ±30 % ») l'aurait fait passer pour bornée alors qu'elle ne l'est pas.
//
// ── ⛔ RETIRER UNE PROMESSE N'EST PAS RETIRER UNE INFORMATION ─────────────
// La phrase reste au MÊME endroit et sous la MÊME prémisse — cible acceptée,
// rythme vivant. C'est son CONTENU qui change, pas sa présence. Elle dit:
//
//   ① la DIRECTION, qui survit — la revue de littérature dit du calcul qu'« il
//      donne la bonne direction »; le plan est réglé pour aller vers le poids
//      que la personne vient de taper, affiché juste au-dessus;
//   ② POURQUOI il n'y a pas de date, nommé — l'écart quotidien visé est plus
//      petit que l'erreur d'estimation. C'est une décision écrite à l'écran,
//      pas une omission;
//   ③ ce qui donnera le rythme réel: la balance.
//
// ⛔ ET RIEN DE PLUS. On n'écrit PAS « le plan suivra vos pesées »: le lot
// `L11★` mesure 9 comptes portant plus d'une pesée et ZÉRO BOUCHE, et aucun
// écrivain ne propage vers `household_member_bodies.weight_kg`. Ce serait
// remplacer une promesse fausse par une autre.
//
// ── ⚠️ LE MODULE PORTE SON PROPRE CATALOGUE DE LANGUE ─────────────────────
// `COPY` est bilingue ici, comme `PACE_WARNING_LABELS` et `PACE_SATURATION_
// LABELS` dans `weight_pace.ts`, et comme `plan_tradeoffs.ts` l'a fait pour
// le lot `L35-a`. AUCUNE clé i18n neuve n'est nécessaire — ni dans `en.ts`,
// ni dans `fr.ts`, qui sont interdits de commit sur cette campagne. La phrase
// et sa décision sont un seul objet: les séparer laisse l'une bouger sans
// l'autre, et c'est toujours la phrase qui bouge.
//
// ── ⛔ AUCUN kcal DANS LA PHRASE — CLAUSE C5 ──────────────────────────────
// Même raison que `PACE_SATURATION_LABELS`: une grandeur d'énergie PAR BOUCHE
// sortirait ici sans avoir traversé la moindre porte, à côté d'un curseur que
// le compte maître règle POUR QUELQU'UN D'AUTRE.
//
// PURE MODULE: no I/O, no clock, no randomness.

/**
 * Le seul horizon que ce produit a le droit de rendre.
 *
 * ⚠️ UN JETON, PAS UN NOMBRE, ET C'EST TOUT L'INTÉRÊT DU TYPE. Tant que
 * l'écran lit un jeton, aucune recopie ne peut y glisser un nombre de
 * semaines: il n'y a pas de champ où l'écrire.
 */
export const ARRIVAL_HORIZONS = ["no_arrival_date"] as const;
export type ArrivalHorizon = (typeof ARRIVAL_HORIZONS)[number];

/**
 * LA PHRASE, DANS LES DEUX LANGUES.
 *
 * ⚠️ ELLE NE PORTE NI CHIFFRE, NI UNITÉ DE CALENDRIER, ET C'EST VÉRIFIÉ —
 * `arrivalCopyIsCalendarFree` ci-dessous, appliqué à CHAQUE entrée par
 * `arrivalHorizon.int.test.ts`. Une unité sans chiffre (« quelques semaines »)
 * est interdite au même titre qu'un chiffre: c'est la forme qu'un chiffre
 * reprend au premier raccourcissement de copie.
 */
export const ARRIVAL_HORIZON_COPY: Record<
  ArrivalHorizon,
  { en: string; fr: string }
> = {
  no_arrival_date: {
    en: "The plan is set to move toward that weight, and it does not say " +
      "when: the daily gap it aims for is smaller than the error on any " +
      "estimate of what a body needs. Only the scale will tell the real pace.",
    fr: "Le plan est réglé pour aller vers ce poids, et il ne dit pas " +
      "quand : l'écart quotidien qu'il vise est plus petit que l'erreur avec " +
      "laquelle on estime un besoin. Seule la balance donnera le rythme réel.",
  },
};

/**
 * ⛔ LA SECONDE SURFACE — ET ELLE N'ÉTAIT DANS AUCUNE FICHE.
 *
 * Le champ « poids visé » porte un `hint`, rendu SANS CONDITION juste sous son
 * libellé, et il disait en toutes lettres:
 *
 *   en : « With the pace below, this gives a date to arrive on. »
 *   fr : « Avec le rythme ci-dessous, il donne une date d'arrivée. »
 *
 * ⛔ C'EST LA PROMESSE ELLE-MÊME, ÉNONCÉE PLUS EXPLICITEMENT QUE LE NOMBRE.
 * Retirer les semaines en la laissant aurait produit le pire des deux états:
 * un écran qui ANNONCE une date puis n'en donne aucune. La `mesure AVANT` de
 * la fiche ne comptait qu'une surface — il y en avait deux, et la seconde ne
 * porte aucun chiffre, donc elle passait le seuil « 0 surface affichant une
 * semaine exacte » sans être touchée.
 *
 * ⚠️ ELLE VIT ICI ET PAS DANS `en.ts`/`fr.ts` — ces deux fichiers sont
 * interdits de commit sur cette campagne, et la clé i18n existante reste en
 * place, simplement plus lue. Le jour où quelqu'un la relit, il trouvera cette
 * décision à côté du texte qui la remplace, et pas dans un journal.
 *
 * ⚠️ CE QU'ELLE DIT MAINTENANT EST EXACTEMENT CE QUE LE CHAMP FAIT: avec le
 * rythme, il donne le SENS DE MARCHE (`scaleDirectionOf`, `paceControlFor`).
 * Il ne dit pas le moment, et — FF-030 R7 — il n'entre pas dans la consigne.
 */
export const TARGET_WEIGHT_HINT_COPY: { en: string; fr: string } = {
  en: "With the pace below, it says which way to go, not when it will be " +
    "reached.",
  fr: "Avec le rythme ci-dessous, il dit le sens de marche, pas le moment où " +
    "il sera atteint.",
};

/**
 * TOUTE LA COPIE QUE CE LOT POSE, POUR QUE LA GARDE N'EN RATE AUCUNE.
 *
 * ⚠️ UNE LISTE, PAS DEUX ASSERTIONS ÉCRITES À LA MAIN: une entrée ajoutée
 * plus tard sans son test serait exactement le trou que ce lot vient fermer.
 */
export const CALENDAR_FREE_COPY: readonly {
  readonly label: string;
  readonly en: string;
  readonly fr: string;
}[] = [
  ...ARRIVAL_HORIZONS.map((h) => ({
    label: `ARRIVAL_HORIZON_COPY.${h}`,
    en: ARRIVAL_HORIZON_COPY[h].en,
    fr: ARRIVAL_HORIZON_COPY[h].fr,
  })),
  { label: "TARGET_WEIGHT_HINT_COPY", ...TARGET_WEIGHT_HINT_COPY },
];

/**
 * LES MOTS QUI FERAIENT REVENIR UN CALENDRIER — vocabulaire FERMÉ, par langue.
 *
 * ⚠️ FERMÉ ET PAR LANGUE, POUR UNE RAISON MESURÉE. `an` est un mot français et
 * un article anglais: une liste unique refuserait « the error on ANy estimate »
 * — non, `\ban\b` ne mord pas dans « any », mais elle mordrait dans « an
 * estimate », qui est de l'anglais parfaitement ordinaire. Les deux listes
 * restent donc séparées, et chacune ne s'applique qu'à sa propre phrase.
 *
 * ⚠️ `quotidien` / `daily` NE SONT PAS DANS LA LISTE, ET C'EST DÉLIBÉRÉ: ils
 * qualifient un RYTHME, pas un HORIZON, et ils ne peuvent porter aucun compte
 * à rebours.
 */
const CALENDAR_WORDS: Record<"en" | "fr", readonly string[]> = {
  en: ["week", "weeks", "month", "months", "day", "days", "year", "years",
    "date", "dates", "deadline", "deadlines"],
  fr: ["semaine", "semaines", "mois", "jour", "jours", "journée", "journées",
    "an", "ans", "année", "années", "date", "dates", "échéance", "échéances"],
};

/** Ce que la garde a trouvé, nommé — jamais un `false` nu. */
export type CalendarLeak =
  | { kind: "digit"; found: string }
  | { kind: "calendar_word"; found: string };

/**
 * CETTE PHRASE PROMET-ELLE UN CALENDRIER ?
 *
 * `null` = non, elle peut s'afficher — et c'est LE CAS QUI PASSE, celui sans
 * lequel cette garde bloquerait tout en ressemblant à une garde qui marche.
 * La copie livrée ci-dessus le prouve dans les deux langues.
 *
 * ⚠️ LA GARDE PORTE SUR UN VOCABULAIRE FERMÉ QUE CE MODULE POSSÈDE, pas sur
 * du texte libre d'utilisateur. C'est la condition qui la sépare des matchers
 * maison que ce dépôt s'interdit (« laitue » ≠ « lait »): ici le corpus fait
 * deux chaînes, et elles sont écrites ici même.
 *
 * ⛔ CE QU'ELLE NE COUVRE PAS, ÉCRIT PLUTÔT QU'OUBLIÉ: une saison
 * (« d'ici l'été »), un événement (« avant les vacances »), un mois nommé
 * (« vers novembre »). Elle attrape le chiffre et l'unité, qui sont la forme
 * qu'a prise la promesse pendant toute la vie de cet écran.
 */
export function arrivalCopyIsCalendarFree(
  text: string,
  lang: "en" | "fr",
): CalendarLeak | null {
  const digit = text.match(/\d/);
  if (digit !== null) return { kind: "digit", found: digit[0] };
  const lowered = text.toLocaleLowerCase(lang === "fr" ? "fr-FR" : "en-GB");
  for (const word of CALENDAR_WORDS[lang]) {
    // ⚠️ BORNES DE MOT EXPLICITES, PAS `\b`: `\b` est ASCII en JavaScript et
    // ne borne pas correctement un mot accentué (`année`). On borne donc sur
    // « pas une lettre », apostrophe française comprise — « l'an » DOIT être
    // attrapé, « dans » ne DOIT PAS l'être.
    const re = new RegExp(
      `(^|[^\\p{L}])${word}($|[^\\p{L}])`,
      "u",
    );
    if (re.test(lowered)) return { kind: "calendar_word", found: word };
  }
  return null;
}

/**
 * LA PRÉMISSE — la phrase n'apparaît que là où la date apparaissait.
 *
 * ⚠️ EXACTEMENT LA MÊME QU'AVANT, ET C'EST VOULU. `weeksToTarget` rendait
 * `null` sur un rythme nul ou une cible déjà atteinte; le refus de cible
 * (`targetWeightRefusal`) couvre déjà l'égalité et le contresens. La surface
 * ne change donc pas de population: seul son CONTENU change. Un lot qui
 * retirerait aussi la surface ne serait plus mesurable contre l'avant.
 *
 * ⛔ ELLE EST ARMÉE, comme chaque phrase de `plan_rationale.ts`: sans cible
 * acceptée et sans rythme vivant, elle ne sort pas. Une phrase qui sort
 * toujours n'informe de rien.
 */
export function arrivalHorizonFor(input: {
  /** La cible a passé `targetWeightRefusal` — donc écart non nul et bon sens. */
  targetAccepted: boolean;
  /** Le cran du curseur, ou `null` quand il n'y a pas de curseur. */
  paceKgPerWeek: number | null;
}): ArrivalHorizon | null {
  if (!input.targetAccepted) return null;
  const pace = input.paceKgPerWeek;
  if (pace === null || !Number.isFinite(pace) || pace <= 0) return null;
  return "no_arrival_date";
}

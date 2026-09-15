/**
 * FF-039 — L'ENVELOPPE : dans quelle bande cette assiette devrait tomber.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.2 et §2.3.
 *
 * ── CE QUI SORT D'ICI NE VA NULLE PART ────────────────────────────────────
 * Aucune valeur de ce module n'entre dans un prompt, ne s'affiche, ne se dit,
 * ne se journalise en clair. C'est un instrument INTERNE. « Ton objectif 1800
 * kcal » est interdit partout et toujours; ce qu'on calcule ici sert à juger
 * une ASSIETTE, jamais à s'adresser à une personne.
 *
 * ── LE TYPE EST LA GARDE, PAS UN `if` ─────────────────────────────────────
 * Sous plancher TCA — et pour un corps inconnu, par la MÊME branche — le mode
 * est `per_portion`, et ce mode ne porte structurellement NI énergie NI
 * plafond de densité. Il n'y a pas « un champ qu'on prend soin de ne pas
 * lire »: il n'y a pas de champ. Un état illégal ne se représente pas, donc ne
 * se teste pas, donc ne s'oublie pas.
 *
 * ── L'INDISCERNABILITÉ EST L'INVARIANT ────────────────────────────────────
 * Un élève sous flag et un élève dont on ne sait rien produisent la MÊME
 * enveloppe, au caractère près. Deux branches qui se ressemblent divergent; et
 * une branche distincte rendrait le statut de restriction observable en aval,
 * ce que le produit refuse.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { MealBodyContext } from "./meal_body.ts";
import { type AgeBand, ageBandOf, KEEL_MINOR_AGE } from "./student_age.ts";
import type {
  ActivityLevel,
  AppetiteLevel,
  DayActivityLevel,
  GoalToken,
  SportFrequency,
} from "./tokens.ts";
import {
  applyPiloting,
  type SteeringEntry,
} from "./composition_steering.ts";
import {
  portionFactorFor,
  portionIndexFor,
  portionIndexMoves,
} from "./feedback_index.ts";
import {
  HOUSEHOLD_SUBJECT,
  type PortionAdjustItem,
  type PortionAdjustMember,
  type PortionAdjustValue,
  type PortionMagnitude,
  subjectsForPortionAdjust,
} from "./retained_item.ts";
import { proteinReferenceWeightKg } from "./protein_reference_weight.ts";
// ⟳ 2026-09-10 — `plannedEnergyBand` N'EST PLUS IMPORTÉ, `maintenanceMidKcal`
// L'EST ENCORE — et le second est le REPLI NOMMÉ, pas la source. Voir
// `adultMaintenanceKcal`: l'équation du corps demande une taille et une bande
// d'âge, et une fiche qui n'en a pas doit recevoir le raccourci au poids plutôt
// que rien du tout. C'est exactement le repli que l'écran applique déjà
// (`meal_energy_shared.ts`, `useBody`).
import { maintenanceMidKcal } from "./energy_target.ts";
// ⚠️ IMPORT DE TYPE SEUL, ET C'EST STRUCTUREL: `weight_pace.ts` importe des
// VALEURS de ce fichier-ci. Un import de valeur ferait un cycle d'exécution.
// C'est le même geste que celui d'`energy_target.ts` sur `ScaleDirection`.
import type { EnvelopeDirection } from "./weight_pace.ts";

// ---------------------------------------------------------------------------
// LE TYPE
// ---------------------------------------------------------------------------

export interface EnergyBand {
  low: number;
  high: number;
}

/**
 * Les deux formes, et elles ne se mélangent pas.
 *
 * `per_portion` n'a AUCUN champ par-kg et AUCUN `densityCeiling`. « Rien ne
 * compte à rebours » vaut aussi pour la version sans compteur: sous flag,
 * toute pression de minimisation dérivée de l'objectif est ABSENTE, pas
 * neutralisée.
 *
 * Ce qui survit en `per_portion`: l'ancre protéique (présence), les fréquences
 * sentinelles, la structure, les préférences — tout ce qui vit côté aliment
 * sans viser.
 */
export type Envelope =
  | {
    mode: "per_kg";
    /** `null` quand la maintenance n'est pas estimable (poids inconnu). */
    energy: EnergyBand | null;
    /** Le plancher quotidien, en grammes. */
    proteinFloorG: number;
    /**
     * Non-`null` pour `60_plus`, `muscle_gain` et `recomposition`, et pour
     * RIEN d'autre. Voir `PROTEIN_PER_MEAL_CASES`.
     */
    proteinPerMealG: number | null;
    densityCeiling: number | null;
  }
  | {
    mode: "per_portion";
    /**
     * La seule chose que ce mode affirme: chaque repas principal porte une
     * part protéique. Une PRÉSENCE, jamais une quantité — et surtout jamais
     * une quantité dérivée du corps.
     */
    proteinPortionPerMeal: true;
  };

// ---------------------------------------------------------------------------
// LES CONSTANTES — chaque valeur avec sa référence, aucune éparpillée
// ---------------------------------------------------------------------------

/**
 * LE PLAFOND DE DÉFICIT — ARBITRAGE A1, non débrayable.
 *
 * 500 kcal/j. Aucun paramètre ne le lève, et le jeton qui le lèverait N'EXISTE
 * PAS dans le schéma de pilotage (l'asymétrie avec `surplus_style`, qui a son
 * `"aggressive"`, EST la forme que prend la décision).
 *
 * Deux fondements indépendants du muscle:
 *   1. au-delà, l'énergie du plan passe sous le seuil où la couverture micro
 *      devient mathématiquement improbable (Nutrients 2018; Maillot/Darmon);
 *   2. un moteur qui EXÉCUTE de la restriction rapide est exactement le
 *      produit que le plancher TCA existe pour ne pas être.
 *
 * Ce que ça coûte, et qui est accepté: un coach « sèche agressive » ne peut
 * pas exprimer sa méthode. Il garde sa conviction citable dans le chat; le
 * moteur ne l'exécute pas.
 */
export const MAX_DAILY_DEFICIT_KCAL = 500;

/**
 * Mifflin-St Jeor, puis × 1,5 quand l'activité est INCONNUE.
 *
 * ── CE FACTEUR EST UNE HYPOTHÈSE, PAS UNE MESURE ─────────────────────────
 * 1,5 est le milieu « modérément actif », et l'estimation qui en sort est à
 * ±20 % — empilée sur ±10-15 % de table et de cuisson. C'est PLUS LARGE que
 * la bande de `muscle_gain` (5 points), et c'est exactement pourquoi le
 * verdict énergie ne dit qu'une DIRECTION au premier jour (voir
 * `ENERGY_DIRECTION_MARGIN`).
 *
 * ⚠️ IL N'EST PLUS LE SEUL CHEMIN (2026-08-18). Le produit DEMANDE désormais
 * le niveau d'activité (`ACTIVITY_LEVELS`, quatre crans). Ce nombre-ci reste,
 * et il reste nommé « hypothèse »: c'est ce qu'on applique à qui n'a pas
 * répondu — c'est-à-dire toute la base d'avant ce lot, qui doit continuer de
 * produire exactement les mêmes enveloppes.
 */
export const ACTIVITY_FACTOR = 1.5;

/**
 * LE FACTEUR D'ACTIVITÉ QUAND ON L'A DEMANDÉ — FAO/WHO/UNU 2004.
 *
 * Le rapport conjoint « Human energy requirements » range les adultes par
 * niveau d'activité physique (PAL, multiplicateur du métabolisme de base):
 * sédentaire ou activité légère 1,40-1,69; modérément actif 1,70-1,99;
 * vigoureusement actif 2,00-2,40. Les quatre crans du formulaire s'y posent:
 *
 *   `sedentary`    1,45  bas de la bande sédentaire
 *   `on_feet`      1,65  haut de la même bande — debout n'est pas du sport
 *   `trains_some`  1,80  milieu de « modérément actif »
 *   `trains_hard`  2,00  bas de « vigoureusement actif »
 *
 * ⚠️ ON PREND LE BAS DE « VIGOUREUX », PAS LE HAUT. La bande monte à 2,40, et
 * ce qui vit là-haut est un travail de force huit heures par jour, pas quatre
 * séances par semaine. Surestimer le facteur du plus actif ferait servir plus
 * que nécessaire à celui dont on est le moins sûr — et c'est le seul cran où
 * la question ne distingue pas le sportif du maçon.
 *
 * ⚠️ CE N'EST PAS UNE MESURE NON PLUS, ET C'EST TOUJOURS ÉCRIT. Un cran reste
 * une bande de ±0,15 PAL. Ce qu'on gagne n'est pas de la précision: c'est de
 * ne plus servir la MÊME hypothèse à quelqu'un assis huit heures et à
 * quelqu'un qui court quatre fois par semaine — deux personnes dont les
 * besoins diffèrent d'environ 40 %, soit le double de l'incertitude.
 */
export const ACTIVITY_FACTORS: Readonly<Record<ActivityLevel, number>> = Object
  .freeze({
    sedentary: 1.45,
    on_feet: 1.65,
    trains_some: 1.80,
    trains_hard: 2.00,
  });

// ---------------------------------------------------------------------------
// LE FACTEUR QUAND LA JOURNÉE ET LE SPORT SONT DEMANDÉS SÉPARÉMENT (2026-08-20)
// ---------------------------------------------------------------------------
//
// `ACTIVITY_FACTORS` ci-dessus indexe QUATRE crans qui mélangent deux axes
// (voir `DAY_ACTIVITY_LEVELS` / `SPORT_FREQUENCIES` dans `tokens.ts`). Ce qui
// suit indexe les deux axes séparément, et le facteur se DÉRIVE du croisement
// au lieu d'être recopié d'une tuile.
//
// ══════════════════════════════════════════════════════════════════════════
// LA DÉRIVATION, ET ELLE EST ENTIÈREMENT FAO/WHO/UNU 2004
// ══════════════════════════════════════════════════════════════════════════
//
// ① LES BANDES. Le rapport conjoint « Human energy requirements » range les
//    adultes par PAL (multiplicateur du métabolisme de base):
//
//        sédentaire ou activité légère   1,40 - 1,69
//        modérément actif                1,70 - 1,99
//        vigoureusement actif            2,00 - 2,40
//
//    Il pose aussi le PLANCHER: en dessous de 1,40, un mode de vie libre n'est
//    pas soutenable. Aucune case de la table ci-dessous ne descend sous 1,45 ni
//    ne monte au-dessus de 2,13 — la bande vigoureuse n'est jamais servie à son
//    sommet, pour la raison déjà écrite pour `trains_hard`: ce qui vit à 2,40
//    est un travail de force huit heures par jour.
//
// ② LA BASE DE JOURNÉE, sport exclu. Les deux premières valeurs sont
//    EXACTEMENT celles de `ACTIVITY_FACTORS` — même phrase, même nombre, et
//    c'est ce qui rend le remplacement lisible plutôt que silencieux:
//
//        seated        1,45   bas de la bande sédentaire
//        on_feet       1,65   haut de la MÊME bande — debout n'est pas du sport
//        physical_job  1,85   milieu de « modérément actif », sans une séance
//
// ③ L'INCRÉMENT PAR SÉANCE, par la méthode PAR du rapport lui-même:
//
//        PAL = somme(PAR_i x t_i) / 24 h
//
//    Une séance occupe ~1,5 h porte à porte (échauffement et trajet compris) à
//    PAR ~7,0 — la bande du rapport pour course, vélo, sport collectif ou
//    circuit en résistance —, et elle REMPLACE 1,5 h qui aurait valu ~1,4, la
//    base de la journée elle-même. L'écart d'un JOUR de séance vaut donc:
//
//        (7,0 - 1,4) x 1,5 / 24 = 0,35 PAL
//
//    Étalé sur les sept jours de la semaine: **0,05 PAL par séance
//    hebdomadaire**. C'est `SPORT_PAL_PER_WEEKLY_SESSION`.
//
// ⚠️ CE N'EST PAS UNE MESURE, ET C'EST TOUJOURS ÉCRIT. Un croisement reste une
// bande de ±0,15 PAL, exactement comme un cran. Ce qu'on gagne n'est pas de la
// précision: c'est de ne plus servir 1,80 à quelqu'un d'assis qui court deux
// fois par semaine, ni de faire choisir entre sa journée et son sport.
//
// ⚠️ L'ORDRE DE GRANDEUR QUI A MOTIVÉ LE LOT, ET QUI EST TESTÉ: journée assise
// + deux ou trois séances tombe entre **1,53 et 1,63** — c'est-à-dire ~1,60, et
// non 1,80. Les deux bandes de séances encadrent « 2 à 3 », et c'est voulu:
// personne ne vit sa semaine sur une moyenne.

/**
 * LA BASE DE JOURNÉE, SPORT EXCLU. Voir ② ci-dessus.
 *
 * ⚠️ `seated` VAUT `ACTIVITY_FACTORS.sedentary` ET `on_feet` VAUT
 * `ACTIVITY_FACTORS.on_feet`, AU CHIFFRE PRÈS — et un test le vérifie. Deux
 * copies d'un même nombre qui divergent est un mode d'échec que ce dépôt a déjà
 * payé; ici elles ne peuvent pas diverger sans qu'un rouge le dise.
 */
export const DAY_ACTIVITY_BASE: Readonly<Record<DayActivityLevel, number>> =
  Object.freeze({
    seated: 1.45,
    on_feet: 1.65,
    physical_job: 1.85,
  });

/**
 * L'INCRÉMENT DE PAL PAR SÉANCE HEBDOMADAIRE. Voir ③ ci-dessus.
 *
 * DÉRIVÉ, jamais choisi: `(7,0 - 1,4) x 1,5 / 24 / 7`. Un test refait
 * l'arithmétique à partir des quatre nombres, pour qu'un « ajustement » de
 * confort ne puisse pas se glisser sous une dérivation qui ne le porte plus.
 */
export const SPORT_PAL_PER_WEEKLY_SESSION = 0.05;

/**
 * LE MILIEU DE CHAQUE BANDE DE SÉANCES.
 *
 * ⚠️ `5_plus` VAUT 5,5 ET PAS 7. La bande est ouverte vers le haut, et prendre
 * son sommet servirait davantage à celui dont on est le moins sûr — c'est la
 * MÊME direction d'erreur que le rapport refuse pour `trains_hard`, écrite
 * juste au-dessus.
 */
export const SPORT_SESSIONS_PER_WEEK: Readonly<Record<SportFrequency, number>> =
  Object.freeze({
    none: 0,
    "1_2": 1.5,
    "3_4": 3.5,
    "5_plus": 5.5,
  });

/**
 * LE CROISEMENT JOURNÉE x SPORT, EN PAL.
 *
 *                  aucun    1-2      3-4      5+
 *     seated        1,45    1,53     1,63     1,73
 *     on_feet       1,65    1,73     1,83     1,93
 *     physical_job  1,85    1,93     2,03     2,13
 *
 * CALCULÉ, jamais tabulé: `base + 0,05 x séances`. Une table écrite à la main
 * se met à mentir sur sa propre dérivation dès la première retouche.
 *
 * ⚠️ ARRONDI À DEUX DÉCIMALES, et l'arrondi est DANS la fonction: `1,45 +
 * 0,05 x 1,5` vaut `1.5250000000000001` en virgule flottante, et un facteur
 * qui traîne quinze décimales rend deux runs identiques comparables « à
 * l'octet près » impossibles à lire.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function crossedActivityFactor(
  day: DayActivityLevel,
  sport: SportFrequency,
): number {
  const raw = DAY_ACTIVITY_BASE[day] +
    SPORT_PAL_PER_WEEKLY_SESSION * SPORT_SESSIONS_PER_WEEK[sport];
  return Math.round(raw * 100) / 100;
}

/**
 * DANS QUEL ÉTAT SE TROUVE LA RÉPONSE D'UNE BOUCHE AUX DEUX AXES.
 *
 * ⛔ QUATRE ÉTATS, PAS DEUX, ET C'EST LA CICATRICE DU DÉPÔT. « Deux nombres pour
 * trois états » est le zéro ambigu que ce chantier paie en boucle: sans
 * `not_asked`, une fiche créée AVANT ce lot et une fiche dont le maître a
 * refusé de répondre rendraient le même silence, et personne ne saurait s'il
 * faut aller poser la question ou accepter la réponse.
 *
 *   `answered`      les DEUX axes sont là — le croisement gouverne
 *   `partial`       un seul des deux — le cran d'avant reprend la main
 *   `not_answered`  la question a été POSÉE et aucun axe n'a été coché
 *   `not_asked`     la fiche n'a jamais vu ces deux questions
 *
 * ⛔ ET `partial` NE FABRIQUE RIEN. Une journée sans sport déclaré n'est pas
 * une journée sans sport: compléter l'axe manquant serait inventer une réponse
 * que personne n'a donnée — la faute exacte que ce dépôt documente sous
 * « paramètre de garde optionnel = garde désarmée ».
 */
export const ACTIVITY_ANSWER_STATES = [
  "answered",
  "partial",
  "not_answered",
  "not_asked",
] as const;
export type ActivityAnswerState = (typeof ACTIVITY_ANSWER_STATES)[number];

/**
 * LES DEUX AXES D'UNE BOUCHE, TELS QUE SA LIGNE LES PORTE.
 *
 * ⚠️ `asked` EST REQUIS ET N'A PAS DE DÉFAUT. C'est lui, et lui seul, qui
 * sépare `not_asked` de `not_answered`; un `?` en ferait un `false` silencieux,
 * et toute la base répondue passerait pour « jamais interrogée ».
 */
export interface ActivityAxes {
  day: DayActivityLevel | null;
  sport: SportFrequency | null;
  /** La fiche a-t-elle DÉJÀ été enregistrée par un écran qui pose les deux ? */
  asked: boolean;
}

/** PURE: no I/O, no clock, no randomness. */
export function activityAnswerState(axes: ActivityAxes): ActivityAnswerState {
  if (axes.day !== null && axes.sport !== null) return "answered";
  if (axes.day !== null || axes.sport !== null) return "partial";
  return axes.asked ? "not_answered" : "not_asked";
}

/**
 * D'OÙ VIENT LE FACTEUR D'ACTIVITÉ RÉELLEMENT APPLIQUÉ.
 *
 * ⚠️ TROIS SOURCES COMPTÉES, y compris `assumed`. Un compteur qui ne nommerait
 * que les succès ne distingue pas « le croisement a gouverné » de « le lot
 * n'est pas branché »: c'est le zéro ambigu, encore.
 */
export const ACTIVITY_FACTOR_SOURCES = ["crossed", "legacy", "assumed"] as const;
export type ActivityFactorSource = (typeof ACTIVITY_FACTOR_SOURCES)[number];

/**
 * LE FACTEUR D'ACTIVITÉ D'UNE BOUCHE — croisement, sinon cran, sinon hypothèse.
 *
 * ⛔ L'ORDRE EST LA COMPATIBILITÉ ASCENDANTE, ET IL EST IRRÉVERSIBLE DANS
 * L'AUTRE SENS. Des fiches portent déjà un cran de l'ancien vocabulaire. On ne
 * les MIGRE pas: « assis + sport 2-3x » n'est PAS reconstructible depuis
 * `trains_some` — l'information n'a jamais été saisie, et la fabriquer serait
 * écrire un fait que personne n'a dit. On garde donc l'ancien cran comme REPLI
 * NOMMÉ, et le compteur dit combien de fiches sont dans ce cas.
 *
 *     les deux axes  ->  `crossed`   le croisement gouverne
 *     un cran d'avant ->  `legacy`   EXACTEMENT le nombre d'hier
 *     rien du tout   ->  `assumed`   EXACTEMENT le nombre d'avant-hier (1,5)
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function activityFactorOf(
  axes: ActivityAxes,
  legacyLevel: ActivityLevel | null,
): { factor: number; source: ActivityFactorSource } {
  if (axes.day !== null && axes.sport !== null) {
    return { factor: crossedActivityFactor(axes.day, axes.sport), source: "crossed" };
  }
  if (legacyLevel !== null) {
    return { factor: ACTIVITY_FACTORS[legacyLevel], source: "legacy" };
  }
  return { factor: ACTIVITY_FACTOR, source: "assumed" };
}

// ---------------------------------------------------------------------------
// ⑤ L'APPÉTIT — ±10 %, ET IL EST TRANSITOIRE (2026-08-20)
// ---------------------------------------------------------------------------
//
// ⛔ LIRE `APPETITE_LEVELS` (tokens.ts) AVANT DE TOUCHER À CECI: **ce lot est
// destiné à mourir**. Le lot ⑦ (la boucle de poids) le remplace pour toute
// bouche qui a un compte et une série de pesées — une stabilité est une
// MESURE, ces trois crans sont une DÉCLARATION, et la mesure gagne toujours.
//
// ── ⛔ IL CORRIGE L'ESTIMATION, JAMAIS LES GRAMMES ────────────────────────
// C'est la garde de conception du lot, et elle a une raison mécanique précise:
// un multiplicateur posé sur les GRAMMES se composerait avec l'ancrage absolu
// (`mouth_anchor.ts`, `cible / livré`) — deux couches qui dimensionnent, très
// exactement le double comptage que ce chantier a mesuré et retiré. Posé sur
// l'ENTRETIEN, il entre dans la chaîne existante par le haut et la traverse
// entière, bornes comprises: bandes d'énergie, plafond de déficit A1, plancher
// protéique, plafond par repas. Rien n'est doublé, rien n'est contourné.
//
// ── ⛔ ET LE PLANCHER TCA RESTE DESSOUS, INTACT ───────────────────────────
// `small` ne peut pas servir à se sous-alimenter, et ce n'est pas un
// raisonnement: `mouthTargetKcal` évalue ① (le plancher) AVANT de calculer le
// moindre entretien, et rend `restriction_floor` sans jamais atteindre ce
// facteur. Une bouche sous plancher a un facteur d'ancrage de 1, quel que soit
// son appétit. Un test le vérifie plutôt que de le supposer.

/**
 * LES TROIS CRANS, EN FRACTION DE L'ENTRETIEN ESTIMÉ.
 *
 * ⚠️ SYMÉTRIQUE ET FERMÉ. `1 - 0,10` et `1 + 0,10` autour d'un neutre VRAI.
 * L'asymétrie serait une opinion sur le sens dans lequel les gens se trompent,
 * et l'ouverture ferait de l'incertitude d'une formule un réglage d'appétit.
 */
export const APPETITE_FACTORS: Readonly<Record<AppetiteLevel, number>> = Object
  .freeze({
    small: 0.90,
    average: 1.00,
    large: 1.10,
  });

/**
 * D'OÙ VIENT LE FACTEUR D'APPÉTIT APPLIQUÉ — trois sources, comptées.
 *
 * ⚠️ `unanswered` ET `average` RENDENT LE MÊME NOMBRE ET NE SONT PAS LE MÊME
 * ÉTAT. Le premier veut dire « personne n'a répondu », le second « on m'a
 * demandé et je suis dans la moyenne ». Les fondre rendrait impossible de
 * savoir si la question sert à quelque chose — le zéro ambigu, encore.
 */
export const APPETITE_SOURCES = ["declared", "unanswered"] as const;
export type AppetiteSource = (typeof APPETITE_SOURCES)[number];

/**
 * LE FACTEUR D'APPÉTIT D'UNE BOUCHE. `null` ⇒ ×1,00, un NEUTRE VRAI.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function appetiteFactorOf(
  appetite: AppetiteLevel | null,
): { factor: number; source: AppetiteSource } {
  if (appetite === null) return { factor: 1, source: "unanswered" };
  return { factor: APPETITE_FACTORS[appetite], source: "declared" };
}

/**
 * LE GONFLEMENT DE LA BANDE POUR LE RÉGIME « DIRECTION ».
 *
 * Le verdict ne dit `above` / `below` qu'au-delà du bord × 1,10. En dessous de
 * cet écart, l'incertitude de la maintenance estimée est plus grande que
 * l'écart lui-même: trancher y serait décider sur du bruit avec l'autorité
 * d'un calcul.
 *
 * Le régime « bande » fin n'existe pas encore: il demande un ré-ancrage sur
 * l'observé (étape 8 du chantier), et le pré-câbler ici en ferait un champ
 * mort.
 */
export const ENERGY_DIRECTION_MARGIN = 1.10;

/**
 * LES BANDES PAR DYNAMIQUE, en fraction de la maintenance estimée M.
 *
 * `switch` exhaustif plus bas: une dynamique ajoutée sans bande ne compile
 * pas. Chaque valeur porte sa référence — la table est celle du design §2.2,
 * recopiée sans arrondi de confort.
 */
const ENERGY_BANDS: Record<GoalToken, { low: number; high: number }> = {
  // Murphy 2022 (déficit modéré); Garthe 2011: lent > rapide pour la masse
  // maigre. Le plafond de 500 kcal/j s'applique EN PLUS, et gagne.
  fat_loss: { low: 0.75, high: 0.85 },
  // ── LA TROISIÈME POSITION DE LA BALANCE (2026-08-18) ────────────────────
  // `recomposition` (Barakat 2020) valait 0,95-1,05 et `health` aussi;
  // `performance` (Impey 2018) valait 1,00-1,10. Les trois se replient ici,
  // et la bande retenue est CELLE-CI, pas leur moyenne: c'est la seule des
  // quatre qui ne demande ni surplus ni déficit, donc la seule qu'on puisse
  // servir à quelqu'un dont on sait seulement que la balance ne doit pas
  // bouger. `performance` perd son +10 % — assumé: un surplus qu'on servait
  // à un objectif qui ne le demandait pas, et le nom de ce surplus est
  // `muscle_gain`.
  maintenance: { low: 0.95, high: 1.05 },
  // Helms 2023: au-delà de +10 %, on gagne des plis cutanés, pas du muscle.
  muscle_gain: { low: 1.05, high: 1.10 },
};

/**
 * LE SURPLUS MAXIMAL, EXPOSÉ — ce que A1 fait en bas, lu en haut.
 *
 * DÉRIVÉ de la bande, jamais recopié. Le dépôt a déjà payé « deux copies d'un
 * même nombre divergent, et c'est celle qu'on regarde le moins qui garde
 * l'ancienne ».
 *
 * ⟳ 2026-09-09 — `weight_pace.ts` NE LE LIT PLUS. Il bornait le rythme exécuté
 * d'une prise; le curseur est désormais le contrat (en-tête de ce module-là),
 * et le plafond exécuté d'une prise est celui du curseur. Ce nombre reste ce
 * que le MODÈLE reçoit comme enveloppe de prise — lu par `envelopeCore` et par
 * la lane solo, qui ne lit pas le curseur —, et il reste épinglé pour ça.
 *
 * L'arrondi n'est pas cosmétique: `1.10 - 1` vaut `0.10000000000000009` en
 * flottant, et ce reste se propagerait dans un kg/semaine affiché.
 */
export const MAX_SURPLUS_FRACTION =
  Math.round((ENERGY_BANDS.muscle_gain.high - 1) * 1000) / 1000;

/**
 * ⟳ 2026-09-09 — LA BANDE D'UN OBJECTIF, POSÉE SUR UN ENTRETIEN DONNÉ.
 *
 * ⛔ POURQUOI UNE FONCTION ET PAS UN `export` DE `ENERGY_BANDS`. La table reste
 * privée: `constant_pins_test.ts` l'épingle en LISANT le fichier sur le disque,
 * précisément parce qu'elle n'est pas exportée, et l'exporter déplacerait ce
 * contrôle sans que personne le demande. Ce qui sort d'ici est le RÉSULTAT, pas
 * la table.
 *
 * ⚠️ ELLE NE DÉCIDE RIEN SUR LE CORPS. Elle multiplie un entretien qu'on lui
 * donne; c'est l'appelant qui répond de l'équation qui l'a produit. Les deux
 * appelants d'aujourd'hui sont `envelopeCore` (la lane du modèle) et
 * `loadDailyEnergyTarget` (l'écran) — et c'est le point: le même geste, écrit
 * une seule fois, pour que l'assiette et le chiffre affiché ne puissent plus
 * diverger sans qu'on l'ait décidé.
 *
 * `null` — jamais un repli — sur un entretien absent ou absurde: un moteur sans
 * bande compose sans cible, un écran sans bande n'affiche rien, et les deux
 * valent mieux qu'un nombre deviné.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function goalEnergyBandOf(
  maintenanceKcal: number | null,
  goal: GoalToken,
): { low: number; high: number } | null {
  const m = Number(maintenanceKcal);
  if (maintenanceKcal === null || !Number.isFinite(m) || m <= 0) return null;
  const band = ENERGY_BANDS[goal];
  if (!band) return null;
  return { low: Math.round(m * band.low), high: Math.round(m * band.high) };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — L'ENTRETIEN D'UN ADULTE, ET LA BASE QUI L'A PRODUIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ DEUX ÉQUATIONS, ET LA SECONDE EST UN REPLI NOMMÉ — jamais un choix.
 * L'équation du corps (Mifflin-St Jeor × facteur d'activité, appétit compris)
 * demande une TAILLE et une BANDE D'ÂGE. Une fiche qui n'a pas les deux ne peut
 * pas y entrer, et « pas de bande du tout » serait la mauvaise réponse: un
 * moteur sans bande compose sans cible, c'est-à-dire au hasard. Elle retombe
 * donc sur le raccourci au poids — `poids × kcal/kg`, le milieu de la
 * fourchette affichée — qui est le nombre d'avant ce lot, au caractère près.
 *
 * ⚠️ C'EST LE MÊME REPLI QUE L'ÉCRAN, ET C'EST LA CONDITION DU LOT.
 * `loadDailyEnergyTarget` (`meal_energy_shared.ts`) le pose depuis le
 * 2026-09-09 avec ces mots: « une fiche sans taille ni âge retombe sur le
 * raccourci, et le dit ». Un moteur qui n'aurait pas le même repli
 * afficherait un nombre et en servirait un autre à toute cette population.
 *
 * ⛔ LA BASE SORT AVEC LE NOMBRE, ET C'EST OBLIGATOIRE. « L'équation a
 * gouverné » et « le lot n'est pas branché » rendent le même kcal sur un corps
 * complet; sans ce jeton, un repli qui mordrait sur toute la base ressemblerait
 * trait pour trait à une équation qui marche.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export const MAINTENANCE_BASES = ["body_equation", "weight_shortcut", "none"] as const;
export type MaintenanceBasis = (typeof MAINTENANCE_BASES)[number];

export function adultMaintenanceKcal(args: {
  weightKg: number | null;
  heightCm: number | null;
  ageBand: AgeBand | null;
  gender: "male" | "female" | "other" | null;
  activityLevel: ActivityLevel | null;
  activityAxes: ActivityAxes;
  appetite: AppetiteLevel | null;
}): { kcal: number | null; basis: MaintenanceBasis } {
  const equation = estimatedMaintenanceKcal(args);
  if (equation !== null && equation > 0) {
    return { kcal: equation, basis: "body_equation" };
  }
  const shortcut = maintenanceMidKcal({
    weightKg: args.weightKg,
    activityLevel: args.activityLevel,
  });
  if (shortcut !== null && shortcut > 0) {
    return { kcal: shortcut, basis: "weight_shortcut" };
  }
  return { kcal: null, basis: "none" };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — LA CIBLE DU JOUR D'UNE PERSONNE, SUR DES PRIMITIVES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `entretien + l'écart que le moteur EXÉCUTE`. C'est, mot pour mot,
 * l'arithmétique de `mouthTargetKcal` (`mouth_anchor.ts`) — et c'est le point:
 * les deux lanes doivent rendre le MÊME nombre pour la même personne, et la
 * seule façon de le garantir est que la seconde moitié du calcul soit écrite
 * une fois.
 *
 * ⛔ L'ÉCART VIENT DE `executedPaceFor`, JAMAIS DU CRAN NU. C'est lui qui
 * porte le plafond de déficit A1 (500 kcal/j), le plancher d'énergie de ce
 * corps et la fraction du mineur. Reconvertir ici « 0,5 kg/semaine » en
 * kcal/jour rouvrirait les quatre bornes d'un coup.
 *
 * ⚠️ `direction === null` ⇒ la cible EST l'entretien, sans écart et sans
 * motif: il n'y a rien à expliquer à qui ne vise rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayTargetKcalOf(
  maintenanceKcal: number | null,
  directed: EnvelopeDirection,
): number | null {
  const m = Number(maintenanceKcal);
  if (maintenanceKcal === null || !Number.isFinite(m) || m <= 0) return null;
  if (directed.direction === null) return m;
  const delta = Number(directed.dailyDeltaKcal);
  if (!Number.isFinite(delta) || delta <= 0) return m;
  return directed.direction === "up" ? m + delta : m - delta;
}

/**
 * LA BANDE QUI ENTOURE CETTE CIBLE — sa LARGEUR vient de l'objectif, son
 * CENTRE de la cible.
 *
 * ── POURQUOI UNE BANDE AUTOUR D'UN POINT, ET PAS `ENERGY_BANDS × entretien` ─
 * `ENERGY_BANDS` est une fraction attachée au JETON d'objectif: `fat_loss`
 * vaut 0,75-0,85 quel que soit le rythme, donc deux `fat_loss` de rythmes
 * différents recevaient la même enveloppe. Le lot du 2026-09-09 a fermé ce
 * défaut en faisant descendre la bande de l'écart EXÉCUTÉ (« le curseur atteint
 * enfin cette fonction »), et cette propriété-là ne doit pas se reperdre.
 *
 * Ce qu'on garde de la table, c'est donc sa LARGEUR — la seule chose qu'elle
 * dise qui ne soit pas déjà dite par le rythme. Elle est LUE, jamais recopiée:
 * `muscle_gain` fait 5 points quand les deux autres en font 10, et une
 * demi-largeur écrite à la main ici aurait figé la mauvaise moitié de la table.
 *
 * ⚠️ LE VERDICT RESTE UNE DIRECTION, PAS UNE NOTE. `ENERGY_DIRECTION_MARGIN`
 * élargit encore ce que `meal_verdict.ts` accepte: la bande n'est pas une
 * cible à toucher.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function bandAroundDayTarget(args: {
  targetKcal: number | null;
  maintenanceKcal: number | null;
  goal: GoalToken;
}): EnergyBand | null {
  const t = Number(args.targetKcal);
  const m = Number(args.maintenanceKcal);
  if (args.targetKcal === null || !Number.isFinite(t) || t <= 0) return null;
  if (args.maintenanceKcal === null || !Number.isFinite(m) || m <= 0) return null;
  const band = ENERGY_BANDS[args.goal];
  if (!band) return null;
  const half = (m * (band.high - band.low)) / 2;
  return { low: Math.round(t - half), high: Math.round(t + half) };
}

/**
 * LE PLANCHER PROTÉIQUE, en g/kg de poids corporel et par jour.
 *
 * Morton 2018 (intervalle de confiance), borne haute rationale Helms 2014 pour
 * `fat_loss`; Barakat 2020 pour `recomposition`.
 */
const PROTEIN_FLOOR_G_PER_KG: Record<GoalToken, number> = {
  fat_loss: 2.0,
  // `recomposition` valait 2,0 (Barakat 2020) et se replie ici, où le plancher
  // est 1,6. C'est le seul endroit du repli qui RETIRE quelque chose, et il
  // faut le dire: un élève « recomp » reçoit désormais le plancher protéique
  // de la maintenance. La contrepartie est qu'il ne reçoit plus non plus la
  // répartition par repas (voir plus bas) — les deux venaient de la même
  // hypothèse, « il s'entraîne », que le jeton n'a jamais vérifiée. Celui qui
  // s'entraîne pour prendre coche `muscle_gain` et garde les deux.
  maintenance: 1.6,
  muscle_gain: 1.6,
};

/**
 * LE PLANCHER SPÉCIFIQUE DES 60 ANS ET PLUS.
 *
 * Moore 2015, PROT-AGE: ≥1,2 g/kg/j, et une ancre d'environ 0,4 g/kg sur au
 * moins deux à trois prises. Il ÉLÈVE le plancher de la dynamique quand
 * celui-ci est plus bas; il ne l'abaisse jamais.
 */
const SENIOR_PROTEIN_FLOOR_G_PER_KG = 1.2;
const SENIOR_PROTEIN_PER_MEAL_G_PER_KG = 0.4;

/**
 * LES TROIS CAS — ET SEULEMENT TROIS — OÙ LA DISTRIBUTION PAR REPAS EXISTE.
 *
 * `60_plus` (Moore 2015, PROT-AGE), `muscle_gain` et `recomposition`
 * (placement, pas contenu). Partout ailleurs, Schoenfeld 2013 classe la
 * distribution comme du bruit hors seniors: un paramètre y serait décoratif,
 * et un paramètre décoratif finit par être piloté.
 *
 * La part par repas des deux dynamiques d'entraînement: le plancher quotidien
 * réparti sur trois prises. Ce n'est pas une cible affichable — c'est ce que
 * le vérificateur compare au CALCUL du plat.
 */
const TRAINING_PROTEIN_MEALS = 3;

/**
 * LES PLAFONDS DE DENSITÉ, en kcal par gramme d'aliment.
 *
 * ⚠️ CONSTANTES OPÉRATIONNELLES, ET C'EST AVOUÉ. La méta-analyse des 38 RCT
 * prouve la DIRECTION (une densité plus basse fait manger moins à satiété
 * égale), pas le seuil. Ces deux nombres sont calibrés en observation pendant
 * la phase où les verdicts ne sont pas actionnés; les présenter comme issus de
 * la littérature serait défendre un chiffre indéfendable.
 */
export const DENSITY_CEILING_FAT_LOSS = 1.3;
export const DENSITY_CEILING_DEFAULT = 1.8;

// ---------------------------------------------------------------------------
// `portion.adjust` → L'ENVELOPPE — la traduction, et elle n'est QUE ici
// ---------------------------------------------------------------------------
//
// Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 1 (« le lecteur
// de `portion.adjust` est l'enveloppe ») et §4 (« ⛔ aucun gramme, aucune
// calorie dans `portion.adjust` […] c'est l'ENVELOPPE qui traduit, en aval, où
// le plancher TCA s'applique »). Ce bloc EST cet aval.
//
// ── CE QUI ARRIVE ICI, ET CE QUI N'EN REPART PAS ──────────────────────────
// Arrive: `{direction, magnitude}` — deux adverbes, transmis intacts par
// `retained_items_routing.ts` qui s'interdit d'en dériver un nombre. Repart:
// une bande d'énergie déplacée, INTERNE, comme tout ce que ce module calcule.
// ⛔ Aucun gramme, aucune calorie ne remonte vers la personne: le produit
// refuse d'afficher des nombres à qui n'en a pas demandé, et « ta portion
// baisse de 240 kcal » est exactement le nombre qu'elle n'a pas demandé.
//
// ── CE QUE LA TRADUCTION DÉPLACE, ET CE QU'ELLE NE TOUCHE JAMAIS ──────────
// LA BANDE D'ÉNERGIE, et rien d'autre. Ni `proteinFloorG`, ni
// `proteinPerMealG`, ni `densityCeiling`:
//
//   · le plancher protéique est une CEINTURE (Morton 2018, Moore 2015), en
//     g/kg de poids. « Les portions étaient trop grosses » n'est pas « il me
//     faut moins de protéine par kilo ». Le faire descendre serait la première
//     chose de tout ce module capable d'abaisser un plancher — même
//     `applyPiloting` ne sait que le hausser (`Math.max(1, proteinBoost)`);
//   · le plafond de densité est une pression de minimisation; le resserrer en
//     même temps qu'on baisse l'énergie compterait la même remarque deux fois;
//   · la part par repas est un placement, pas une quantité servie.
//
// ── L'AUDIENCE NE SE CALCULE PAS ICI ──────────────────────────────────────
// `subjectsForPortionAdjust` (socle) tient la règle du §2 axe 3: un ajustement
// À LA BAISSE sans sujet explicite ne s'applique ni à un mineur ni à une bouche
// dont l'âge n'a pas été saisi. La réécrire ici ferait deux règles, et c'est
// celle qu'on relit le moins qui retirerait de la nourriture à un enfant, en
// silence.

/**
 * LES DEUX CRANS, TRADUITS — en fraction de la bande d'énergie.
 *
 * `slight` = « un peu trop », `clear` = « vraiment trop ». Ils DOIVENT rendre
 * deux effets différents et ordonnés: deux crans qui produiraient le même
 * nombre feraient une question fermée à deux réponses dont une ne change rien
 * — le défaut que `health` a été, et que le test des crans d'activité épingle
 * déjà (« deux crans qui rendraient le même nombre… un champ qui promet un
 * effet et n'en a aucun »).
 *
 * ── D'OÙ VIENNENT 5 % ET 10 %, ET POURQUOI PAS DEUX AUTRES NOMBRES ────────
 * Du registre déjà écrit dans ce fichier, pas d'une littérature qui n'existe
 * pas pour un adverbe. Toute bande d'`ENERGY_BANDS` fait 10 points de large
 * (0,75→0,85 ; 0,95→1,05), `MAX_SURPLUS_FRACTION` vaut 0,10 et
 * `ENERGY_DIRECTION_MARGIN` vaut 1,10. `clear` = **la largeur d'une bande
 * entière**: le plus grand déplacement que ce module s'autorise nulle part
 * ailleurs. `slight` = la moitié, donc à l'intérieur de la marge de direction
 * (±10 %) — un « un peu trop » déplace vraiment l'assiette sans à lui seul
 * retourner un verdict.
 *
 * ⚠️ CE SONT DES CONSTANTES OPÉRATIONNELLES, ET C'EST AVOUÉ — même statut que
 * `DENSITY_CEILING_*`. Personne n'a mesuré ce qu'un « un peu trop » vaut en
 * kcal; ce qui est vérifié, c'est que les deux crans sont ordonnés et que le
 * plus grand des deux reste sous les ceintures.
 *
 * `Record<PortionMagnitude, number>`: un troisième cran ajouté au socle ne
 * compile plus ici tant qu'il n'a pas sa valeur.
 */
export const PORTION_ADJUST_STEP: Readonly<Record<PortionMagnitude, number>> =
  Object.freeze({
    slight: 0.05,
    clear: 0.10,
  });

/**
 * CE QU'IL FAUT POUR TRADUIRE — la bouche, et les ajustements retenus.
 *
 * ⚠️ `mouth` PORTE SON `ageState`, ET C'EST LE POINT. Le type est celui du
 * socle (`PortionAdjustMember`), donc l'état d'âge ne peut pas être omis par un
 * appelant: sans lui il n'y a pas de règle du mineur, et « personne n'est
 * concerné » deviendrait indiscernable de « la garde n'a pas été branchée ».
 * C'est la cicatrice « paramètre de garde optionnel = garde désarmée », prise
 * du côté du type plutôt que du côté d'un `?`.
 */
export type PortionAdjustFor = {
  /** La bouche dont on calcule l'enveloppe. */
  readonly mouth: PortionAdjustMember;
  /** Les `portion.adjust` retenus, tels que le lot 1C les groupe. */
  readonly items: readonly PortionAdjustItem[];
};

/**
 * LEQUEL S'APPLIQUE, QUAND PLUSIEURS VISENT LA MÊME BOUCHE.
 *
 * ── UN SEUL GAGNE. ILS NE S'ADDITIONNENT PAS. ────────────────────────────
 * L'ordre est celui, déjà écrit, de `winsOver` (`retained_items_routing.ts`):
 * la bouche NOMMÉE devant `household`, puis la date la plus récente, puis le
 * dernier arrivé. `at` est strictement `YYYY-MM-DD` (garanti par le socle),
 * donc la comparaison de chaînes EST la comparaison de dates — sans
 * `Date.parse`, donc sans la reprojection UTC qui décale un mardi soir.
 *
 * ⚠️ LE CUMUL EST REFUSÉ, ET LE MOTIF EST DANS LE SOCLE: `portion.adjust` est
 * `scope: "durable"` LITTÉRAL — il n'expire JAMAIS. Un magasin qui ne fait que
 * grossir plus un facteur qui se compose, c'est une dérive vers le bas sans
 * borne: trois « trop gros » sur trois bilans (chacun DÉJÀ servi par le
 * précédent) donneraient ×0,729 au lieu de ×0,90, et personne n'a demandé
 * −27 %. Ce dépôt a déjà payé un facteur composé (« un facteur ne porte que
 * sur la part mobile »: un plafond ×2 qui mord, un plancher laissé ouvert de
 * 23 g), et le plafond qu'il faudrait inventer pour borner la somme serait
 * exactement la borne fabriquée que cette cicatrice interdit. Le dernier mot
 * est borné par construction: −10 % au pire, jusqu'à ce qu'elle dise autre
 * chose.
 *
 * ── LE ROSTER D'UNE SEULE BOUCHE, ET CE QUE ÇA VEUT DIRE ─────────────────
 * On demande au socle « cet ajustement atteint-il CETTE bouche ? » en lui
 * passant le roster réduit à elle. `included` non vide ⟺ oui — un roster d'un
 * seul élément ne peut rien rendre d'autre. On lit `included.length`, jamais
 * les identifiants: le socle rend l'id du sujet sur un chemin et celui du
 * membre sur l'autre, et les comparer à la main rouvrirait une normalisation.
 *
 * ⚠️ `excluded` DE CET APPEL N'EST PAS UN CONSTAT DE FOYER, et il ne sort pas
 * d'ici. Un item visant une AUTRE bouche revient `not_in_household`, ce qui est
 * faux au niveau du foyer. Le constat d'exclusion, c'est
 * `portionAdjustExclusionFacts` (1C), calculé sur le VRAI roster.
 */
/**
 * ⚠️ PLUS AUCUN APPELANT DE PRODUCTION DEPUIS LE 2026-09-01 — nommé, pas
 * supprimé.
 *
 * Le lot M3 lui a retiré son seul rôle: `applyPortionAdjust` se règle
 * désormais sur une POSITION (`portionIndexFor`), pas sur le dernier
 * ajustement. Il est resté vivant six jours de plus parce que les DEUX
 * compteurs de génération l'appelaient encore, en affirmant dans leur
 * commentaire être « le MÊME arbitre que celui qu'`envelopeFor` applique ».
 * Ils ne l'étaient plus: c'est ainsi qu'un arbitre mort continue de rendre des
 * verdicts, dans des nombres que personne ne recoupe.
 *
 * ⛔ NE LE REBRANCHE PAS « PAR SYMÉTRIE ». Si un besoin de « le dernier gagne »
 * réapparaît, il faut d'abord dire pourquoi la position ne convient pas — le
 * défaut que M3 ferme (« elle redit "un peu trop" du plan corrigé et on lui
 * redonne le même −5 % ») revient avec lui.
 *
 * Gardé pour l'instant parce qu'il est encore l'objet de tests qui décrivent la
 * règle d'avant M3, et que sa suppression est une décision à part.
 */
export function winningPortionAdjust(
  portion: PortionAdjustFor | null,
): PortionAdjustValue | null {
  if (!portion) return null;
  const roster = [portion.mouth];
  let winner: { item: PortionAdjustItem; index: number } | null = null;
  let index = 0;
  for (const item of portion.items ?? []) {
    index += 1;
    if (subjectsForPortionAdjust(item, roster).included.length === 0) continue;
    if (winner === null || beatsPortionAdjust({ item, index }, winner)) {
      winner = { item, index };
    }
  }
  return winner === null ? null : winner.item.value;
}

/** Les trois crans de `winsOver`, dans le même ordre. Voir le bloc ci-dessus. */
function beatsPortionAdjust(
  challenger: { item: PortionAdjustItem; index: number },
  holder: { item: PortionAdjustItem; index: number },
): boolean {
  const rankC = challenger.item.subject === HOUSEHOLD_SUBJECT ? 0 : 1;
  const rankH = holder.item.subject === HOUSEHOLD_SUBJECT ? 0 : 1;
  if (rankC !== rankH) return rankC > rankH;
  if (challenger.item.at !== holder.item.at) {
    return challenger.item.at > holder.item.at;
  }
  return challenger.index > holder.index;
}

/**
 * LA TRADUCTION, APPLIQUÉE — le DERNIER geste de l'enveloppe.
 *
 * ── OÙ ELLE SE RANGE, ET POURQUOI PAS AILLEURS ───────────────────────────
 * Après les ceintures produit (plafond de déficit A1, planchers) et après
 * `applyPiloting`. C'est la hiérarchie de préséance du design §3.6, du plus
 * général au plus proche de l'assiette:
 *
 *     ceintures produit  >  la méthode du coach  >  le mot de la personne
 *
 * Une doctrine est écrite pour une COHORTE; un `portion.adjust` est une bouche
 * répondant à une question fermée sur ses propres portions. Le plus spécifique
 * parle en dernier — même forme que `subjectRank`, où la bouche nommée passe
 * devant `household`.
 *
 * ⛔ ET SURTOUT PAS AVANT LES PLANCHERS. C'est le seul levier de tout le module
 * qui pousse vers le BAS: `applyPiloting` ne sait que hausser un plancher
 * protéique et que remonter un bas de bande. Posé avant l'écrêtage A1, il
 * passerait sous le plafond de déficit sans qu'aucun test au-dessus du plancher
 * ne le voie. Posé en dernier, la garantie est LOCALE: c'est cette fonction qui
 * écrête, et plus personne ne s'exécute après elle — l'ordre inverse ferait
 * dépendre A1 d'une propriété d'un AUTRE fichier (« `applyPiloting` ne baisse
 * jamais un bas de bande »), que rien ici n'épingle.
 *
 * ── SOUS PLANCHER TCA: ZÉRO, ET SANS RECONSTRUIRE L'OBJET ────────────────
 * `per_portion` ne porte structurellement aucune énergie: il n'y a rien à
 * baisser, et c'est très exactement la population qu'on ne baisse pas. On rend
 * l'enveloppe TELLE QUELLE — même geste qu'`applyPiloting`, même motif:
 * reconstruire ferait diverger l'empreinte d'indiscernabilité.
 *
 * @param energyFloorKcal le plancher A1 (`M − 500`), ou `null` s'il n'est pas
 * calculable. `null` ⇒ **on ne retire rien**: sans plancher connu, il n'y a
 * rien pour écrêter, et un repli inventerait la borne que la ceinture est.
 */
function applyPortionAdjust(
  envelope: Envelope,
  portion: PortionAdjustFor | null,
  energyFloorKcal: number | null,
): Envelope {
  if (envelope.mode === "per_portion") return envelope;
  // ── LOT M3 · UNE POSITION QUI CONVERGE, PLUS LE DERNIER MOT ──────────────
  //
  // ⛔ CE N'EST PAS LE CUMUL QUE LE BLOC DE `winningPortionAdjust` REFUSE, et
  // il faut le lire avant celui-ci. Ce refus porte sur des FACTEURS QUI SE
  // COMPOSENT (×0,9 × 0,9 × 0,9 = ×0,729, « personne n'a demandé −27 % »), et
  // il est juste. Ici rien ne se multiplie: on accumule des CRANS sur une
  // échelle bornée, et le facteur sort de la position finale en UNE opération.
  //
  // ⛔ ET LA BORNE N'EST PAS FABRIQUÉE — c'est la condition de cette réponse.
  // `INDEX_MAX × PORTION_ADJUST_STEP.slight` = 2 × 0,05 = 0,10, c'est-à-dire
  // EXACTEMENT `PORTION_ADJUST_STEP.clear`: le pire cas que ce module servait
  // déjà. L'indice n'atteint donc rien de neuf; il rend le chemin PROGRESSIF
  // et RÉVERSIBLE au lieu d'un saut suivi d'un oubli.
  //
  // ── LE DÉFAUT FERMÉ ─────────────────────────────────────────────────────
  // « Le dernier gagne » est SANS ÉTAT: la personne dit « un peu trop », le
  // plan suivant est composé à −5 %, elle redit « un peu trop » DU PLAN
  // CORRIGÉ, et on lui redonne le même −5 %. Elle n'avance jamais.
  const index = portion === null ? null : portionIndexFor({
    mouth: portion.mouth,
    items: portion.items ?? [],
  });
  // ⛔ PAR LE PRÉDICAT, PAS EN CLAIR: c'est la MÊME ligne que lisent les deux
  // compteurs de génération. Écrite ici en clair, elle a divergé d'eux sans que
  // rien ne rougisse — ils sont restés sur `winningPortionAdjust`.
  if (!portionIndexMoves(index)) {
    return envelope;
  }
  // ⚠️ SOUS PLANCHER TCA, ON N'ARRIVE PAS ICI: `envelopeFor` rend
  // `DEGRADED_ENVELOPE` (mode `per_portion`) avant tout calcul, et le `return`
  // en tête de cette fonction le redit. La question des portions est retirée à
  // ces personnes (`RESTRICTED_OUT`), donc aucun `portion.adjust` n'existe —
  // mais la garde ne repose PAS sur cette absence.
  if (envelope.energy === null) return envelope;

  const factor = portionFactorFor(index, PORTION_ADJUST_STEP.slight);
  if (factor >= 1) {
    // ── À LA HAUSSE, AUCUN PLAFOND N'EST AJOUTÉ ICI, ET C'EST DIT ────────
    // Aucune ceinture haute n'existe dans ce module: `surplus_style:
    // "aggressive"` dépasse DÉJÀ `MAX_SURPLUS_FRACTION` (1,10 × 1,05). En
    // poser une ici en ferait la première, sur le levier le moins grave —
    // « surestimer un besoin ferait servir plus que nécessaire, direction
    // d'erreur bien moins grave que l'inverse ».
    return {
      ...envelope,
      energy: {
        low: Math.round(envelope.energy.low * factor),
        high: Math.round(envelope.energy.high * factor),
      },
    };
  }

  if (energyFloorKcal === null) return envelope;
  // ── ⟳ 2026-09-09 · UNE BANDE DÉJÀ AU PLANCHER NE REND PLUS RIEN ─────────
  //
  // ⛔ CETTE LIGNE REMPLACE UN EFFET DE BORD QUE LE CHANGEMENT DE MODÈLE A
  // EMPORTÉ. Avant, A1 écrêtait la bande elle-même: sur un grand gabarit en
  // perte, les DEUX bords étaient déjà remontés à `M − 500` (largeur nulle), et
  // un `down` ne pouvait donc rien retirer — la propriété tenait par accident
  // de forme. Depuis que la bande est celle de l'écran, elle garde sa largeur,
  // et l'écrêtage par le bas laissait le HAUT descendre de 10 %: c'est-à-dire
  // retirer ~200 kcal/jour à quelqu'un déjà au déficit maximal, « A1 outrepassé
  // par un adverbe » sous une autre forme.
  //
  // Le plancher passé ici vaut `min(bande.bas, max(entretien − A1, plancher du
  // corps))`: il n'est donc ÉGAL au bas de la bande que dans un seul cas —
  // celui où la bande est déjà à son plancher. C'est ce cas-là qu'on nomme.
  if (envelope.energy.low <= energyFloorKcal) return envelope;
  // ── L'ÉCRÊTAGE, SUR LES DEUX BORDS ───────────────────────────────────────
  // Les deux, pour la raison déjà mesurée sur A1: « un plafond qui ne mord que
  // d'un côté n'est pas un plafond ». N'écrêter que le bas laisserait un
  // `down` déplacer le haut sur un corps déjà au plancher — c'est-à-dire lui
  // retirer quelque chose, ce que ce lot existe pour empêcher.
  const low = Math.max(energyFloorKcal, Math.round(envelope.energy.low * factor));
  const high = Math.max(energyFloorKcal, Math.round(envelope.energy.high * factor));
  return { ...envelope, energy: { low, high: Math.max(high, low) } };
}

// ---------------------------------------------------------------------------
// LA MAINTENANCE ESTIMÉE
// ---------------------------------------------------------------------------

/**
 * Mifflin-St Jeor × facteur d'activité. `null` dès qu'une entrée manque.
 *
 * INTERNE. Ce nombre ne sort jamais du module: il sert à borner une bande, pas
 * à être dit. Le sexe entre dans la formule parce que la formule le demande —
 * pas parce qu'on catégorise qui que ce soit.
 *
 * `other` n'a pas de constante propre dans Mifflin-St Jeor. On prend la
 * moyenne des deux plutôt que d'en choisir une: choisir serait assigner, et la
 * moyenne est la seule réponse qui ne le fait pas. L'écart entre les deux
 * constantes (166 kcal) est du même ordre que l'incertitude du facteur
 * d'activité, donc le choix ne change pas la nature du verdict.
 *
 * ── `activityLevel` EST REQUIS, ET `null` EST UNE RÉPONSE (2026-08-18) ────
 * Requis, jamais optionnel: « paramètre de garde optionnel = garde désarmée »
 * est une cicatrice mesurée de ce dépôt, et un champ facultatif ici aurait
 * laissé le lot construit sans être branché — le compilateur n'aurait recensé
 * aucun appelant. `null` veut dire « personne n'a répondu » et rend
 * EXACTEMENT le nombre d'avant ce lot: le facteur 1,5, pour toute la base
 * existante.
 */
export function estimatedMaintenanceKcal(args: {
  weightKg: number | null;
  heightCm: number | null;
  ageBand: AgeBand | null;
  gender: "male" | "female" | "other" | null;
  activityLevel: ActivityLevel | null;
  /**
   * ⚠️ REQUIS DEPUIS LE 2026-08-20, jamais optionnel. Les deux axes gouvernent
   * quand ils sont là; `{day: null, sport: null, asked: false}` retombe sur
   * `activityLevel`, c'est-à-dire sur le nombre EXACT d'avant ce lot. C'est la
   * casse de compilation qui recense les appelants — un défaut aurait laissé la
   * chaîne construite et désarmée.
   */
  activityAxes: ActivityAxes;
  /**
   * ⑤ REQUIS (2026-08-20). `null` ⇒ ×1,00, un neutre VRAI — donc exactement le
   * nombre d'avant ce lot pour toute la base. TRANSITOIRE: voir
   * `APPETITE_FACTORS`.
   */
  appetite: AppetiteLevel | null;
}): number | null {
  const { weightKg, heightCm, ageBand, gender, activityLevel } = args;
  if (!weightKg || !heightCm || !ageBand) return null;
  // L'ÂGE EST UNE BANDE, PAS UN NOMBRE (FF-030 R8). On prend le MILIEU de la
  // bande: la formule demande des années, et une bande de quinze ans pèse ~150
  // kcal sur le résultat — largement à l'intérieur de l'incertitude du facteur
  // d'activité. Redemander l'âge exact au seul profit de cette formule serait
  // rouvrir une décision déjà prise ailleurs.
  const midAge: Record<AgeBand, number> = {
    "18_29": 24,
    "30_44": 37,
    "45_59": 52,
    "60_plus": 67,
  };
  const base = 10 * weightKg + 6.25 * heightCm - 5 * midAge[ageBand];
  const offsetMale = 5;
  const offsetFemale = -161;
  const offset = gender === "male"
    ? offsetMale
    : gender === "female"
    ? offsetFemale
    : (offsetMale + offsetFemale) / 2;
  const bmr = base + offset;
  if (!Number.isFinite(bmr) || bmr <= 0) return null;
  // ⛔ UNE SEULE RÉSOLUTION, APPELÉE ET PAS RECOPIÉE. Les trois `if` de
  // `activityFactorOf` sont la compatibilité ascendante du lot; les rejouer ici
  // ferait deux points de décision, et c'est le second qu'on oublierait de
  // corriger.
  const { factor } = activityFactorOf(args.activityAxes, activityLevel);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — L'APPÉTIT SORT DE L'ENTRETIEN ADULTE. IL NE DÉPENSE RIEN.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il était appliqué ICI, sur l'estimation, et traversait donc toute la
  // chaîne: bande, plafond de déficit A1, plancher protéique, plafond par
  // repas. C'est une erreur de grandeur, et elle se dit en une phrase:
  //
  //     ⛔ AVOIR BON APPÉTIT NE FAIT PAS DÉPENSER 10 % DE PLUS.
  //
  // Un grand appétit dit combien de VOLUME une personne veut dans son
  // assiette, pas combien d'énergie son corps brûle. Posé sur l'entretien, il
  // ajoutait 10 % de calories à quelqu'un en perte de poids parce qu'il aime
  // manger — c'est-à-dire qu'il annulait une partie de son déficit sans que
  // rien ne le nomme.
  //
  // ⟳ OÙ IL VA: sur les BORNES DE MASSE de l'assiette (`portion_sizing.ts`,
  // facteur `A` du couloir de densité), là où il décrit ce qu'il décrit — la
  // taille de l'assiette à énergie CONSTANTE. Une même cible, servie plus
  // dense à petit appétit et plus volumineuse à grand appétit.
  //
  // ⚠️ LE PARAMÈTRE RESTE DANS LA SIGNATURE, ET C'EST VOULU. Il est REQUIS
  // (2026-08-20) précisément pour que la casse de compilation recense les
  // appelants qui collectent l'appétit. Le retirer perdrait ce recensement au
  // moment même où un autre lot en a besoin. Il n'est simplement plus LU ici,
  // et un test le prouve plutôt que ce commentaire.
  //
  // ⛔ LE CHEMIN PÉDIATRIQUE GARDE LE SIEN (`childAppetiteFactor`,
  // `estimatedChildMaintenanceKcal`): il ne peut que MONTER (`Math.max(1, …)`),
  // et un enfant qui mange peu ne doit pas voir sa cible baisser.
  void args.appetite;
  return Math.round(bmr * factor);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'ÉNERGIE D'UNE JOURNÉE — UN SEUL RÉSULTAT, TROIS CONSOMMATEURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL Y AVAIT AVANT, ET POURQUOI C'ÉTAIT DEUX PRODUITS DIFFÉRENTS.
 * Deux constructions de bande coexistaient, chacune avec son unique lecteur:
 *
 *   A. `bandAroundDayTarget(dayTargetKcalOf(entretien, écart))` — le MOTEUR.
 *      Centre = entretien ± l'écart EXÉCUTÉ (le cran réglé par la personne,
 *      plafonné par A1), largeur = la table `ENERGY_BANDS`.
 *   B. `goalEnergyBandOf(entretien)` — l'ÉCRAN. Entretien × les BORNES de
 *      `ENERGY_BANDS[goal]`, c'est-à-dire une fraction attachée au JETON
 *      d'objectif, que le rythme de la personne n'atteint jamais.
 *
 * Sur `fat_loss` (0,75-0,85), B applique **−20 % de l'entretien quel que soit
 * le rythme**, là où A applique l'écart exécuté, plafonné à 500 kcal/j. Sur un
 * entretien de 3 000 kcal: B centre à 2 400, A à 2 500. Deux `fat_loss` de
 * rythmes différents recevaient de B la MÊME bande — le curseur ne servait à
 * rien à l'écran, et à quelque chose dans l'assiette.
 *
 * ── CE QUE CETTE FONCTION EST ─────────────────────────────────────────────
 * A, et A seulement, plus les deux gardes qui vivaient collées à elle dans
 * `envelopeCore`: le plafond de déficit A1 et le plancher d'énergie du corps.
 * L'écran, la lane solo et la lane du foyer l'appellent tous les trois.
 *
 * ⚠️ ELLE NE LIT NI PORTE NI CONDITION. Grossesse, allaitement, plancher TCA,
 * mineur, âge inconnu, coach qui ne compte pas: tout cela agit EN AMONT, sur
 * `directed.dailyDeltaKcal` (mis à zéro) ou en empêchant l'appel. Les rejouer
 * ici ferait une seconde copie, et une seconde copie diverge.
 */
export type DayEnergyResult = {
  /** L'entretien qu'on lui a donné, rendu tel quel pour que le lecteur le cite. */
  readonly maintenanceKcal: number | null;
  /** Entretien ± écart exécuté. `null` si l'entretien l'est. */
  readonly dayTargetKcal: number | null;
  /** La bande finale, planchers appliqués. */
  readonly band: EnergyBand | null;
  /** Le plancher retenu, pour l'écrêtage d'un réglage de portion à la baisse. */
  readonly energyFloorKcal: number | null;
};

export function dayEnergyFor(args: {
  maintenanceKcal: number | null;
  goal: GoalToken;
  directed: EnvelopeDirection;
}): DayEnergyResult {
  const maintenance = args.maintenanceKcal;
  const dayTargetKcal = dayTargetKcalOf(maintenance, args.directed);
  let band = bandAroundDayTarget({
    targetKcal: dayTargetKcal,
    maintenanceKcal: maintenance,
    goal: args.goal,
  });
  let energyFloorKcal: number | null = null;
  // ══════════════════════════════════════════════════════════════════════
  // A1 — LE PLAFOND DE DÉFICIT, ET IL MORD SUR LES DEUX BORDS
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ IL EST DÉJÀ APPLIQUÉ UNE FOIS, EN AMONT, SUR L'ÉCART: `executedPaceFor`
  // écrête le cran à 500 kcal/j (`clampedBy: "deficit_cap"`) avant que
  // `directed` n'existe. Ce qui reste à garder ici, c'est la LARGEUR de la
  // bande: son bord bas descend d'une demi-largeur SOUS la cible, et cette
  // demi-largeur-là n'a traversé aucune ceinture.
  //
  // ⛔ « Un plafond qui ne mord que d'un côté n'est pas un plafond » — les deux
  // bords sont donc remontés ensemble. Sur un grand gabarit en perte, les deux
  // peuvent se retrouver égaux: c'est la forme que prend A1 quand il mord.
  if (maintenance !== null && band !== null) {
    const floor = Math.max(
      maintenance - MAX_DAILY_DEFICIT_KCAL,
      args.directed.energyFloorKcal,
    );
    const low = Math.max(band.low, floor);
    band = { low, high: Math.max(band.high, low) };
    // ⚠️ LE `min` FINAL EST LA MOITIÉ QU'ON OUBLIE. Un plancher PLUS HAUT que
    // la bande ferait MONTER l'assiette quand la personne dit « c'était
    // trop »: `applyPortionAdjust` prend un `Math.max(plancher, mis à
    // l'échelle)`. Le `min` dit la seule chose juste dans ce cas-là — **rien
    // de plus à retirer**.
    energyFloorKcal = Math.min(band.low, floor);
  }
  return { maintenanceKcal: maintenance, dayTargetKcal, band, energyFloorKcal };
}

// ---------------------------------------------------------------------------
// L'ENVELOPPE
// ---------------------------------------------------------------------------

/**
 * L'enveloppe DÉGRADÉE — une seule, partagée.
 *
 * Elle sert au plancher TCA ET au corps inconnu, et c'est l'invariant: les
 * deux populations produisent un objet identique, donc rien en aval ne peut
 * les distinguer. Une constante gelée plutôt qu'un littéral recréé à chaque
 * appel: deux littéraux se mettent à diverger le jour où quelqu'un « ajuste »
 * l'un des deux.
 */
const DEGRADED_ENVELOPE: Envelope = Object.freeze({
  mode: "per_portion",
  proteinPortionPerMeal: true,
});

/**
 * L'enveloppe de cet élève.
 *
 * ── TOUS LES PARAMÈTRES SONT REQUIS, ET FAIL-CLOSED ──────────────────────
 * `restrictionFlag` en particulier: ce dépôt a payé « paramètre de garde
 * optionnel = garde désarmée ». Il est déjà un champ REQUIS de
 * `MealBodyContext`, et il est repris ici séparément pour que la lane foyer —
 * qui n'a PAS de corps (`body: null`) — puisse quand même le passer.
 *
 * ── `steering` EST REQUIS (FF-041) ───────────────────────────────────────
 * Ajouté à l'étape 6, et REQUIS plutôt qu'optionnel: la casse de compilation
 * est le mécanisme qui recense les appelants. `null` = aucune doctrine ne
 * pilote, ce qui est le cas de toute la base aujourd'hui et doit rendre
 * exactement le produit d'avant.
 *
 * Il est appliqué EN DERNIER, par `applyPiloting`, et à l'INTÉRIEUR de tout ce
 * qui précède: les ceintures produit (plafond de déficit A1, planchers) sont
 * déjà posées quand le pilotage arrive, donc il ne peut pas les outrepasser.
 * C'est la hiérarchie de préséance du design §3.6, rendue vraie par l'ordre
 * des lignes plutôt que par une vérification.
 *
 * ── `portion` EST REQUIS (nomenclature §2 axe 1) ─────────────────────────
 * Même doctrine, et pour la même raison: c'est la casse de compilation qui
 * recense les appelants. `null` = aucun ajustement retenu — l'état de TOUTE la
 * base aujourd'hui, puisque le seul producteur de `portion.adjust` est le
 * questionnaire de fin de plan (§5) et qu'il appartient à la phase 2. Ce `null`
 * doit rendre l'enveloppe d'avant ce lot, au caractère près.
 */
export function envelopeFor(
  goal: GoalToken,
  body: MealBodyContext | null,
  ageBand: AgeBand | null,
  restrictionFlag: boolean,
  steering: SteeringEntry | null,
  /**
   * ── PARAMÈTRE À PART, POUR LA MÊME RAISON QUE `restrictionFlag` ─────────
   * Le niveau d'activité ne vit pas dans `MealBodyContext`: ce type porte une
   * SÉRIE de pesées datées, et l'activité n'est pas une mesure du corps — c'est
   * une déclaration sur la vie. Surtout, la lane foyer n'a PAS de
   * `MealBodyContext` (`body: null`) et doit quand même pouvoir la passer.
   *
   * Requis et positionnel: le compilateur recense ainsi tous les appelants, et
   * aucun ne peut « oublier » de brancher le champ que ce lot existe pour
   * collecter.
   */
  activityLevel: ActivityLevel | null,
  /**
   * ── LES DEUX AXES (2026-08-20), JUSTE APRÈS LE CRAN QU'ILS PRÉCÈDENT ────
   * Requis et positionnel, pour la raison écrite au paramètre du dessus: c'est
   * le compilateur qui recense les appelants. `{day: null, sport: null,
   * asked: false}` rend l'enveloppe d'avant ce lot, au caractère près.
   */
  activityAxes: ActivityAxes,
  /**
   * ── ⑤ L'APPÉTIT (2026-08-20), JUSTE APRÈS L'ACTIVITÉ ──────────────────
   * Requis et positionnel, pour la raison écrite deux paramètres plus haut.
   * `null` rend l'enveloppe d'avant ce lot, au caractère près.
   *
   * ⚠️ IL EST TRANSITOIRE — le lot ⑦ le remplace. Voir `APPETITE_FACTORS`.
   */
  appetite: AppetiteLevel | null,
  /**
   * ── LES `portion.adjust` RETENUS, ET LA BOUCHE QU'ILS VISENT ───────────
   * `null` = aucun ajustement. Requis et positionnel, comme les cinq
   * paramètres au-dessus: un `?` ici aurait laissé le lecteur construit et non
   * branché, et le compilateur n'aurait recensé aucun appelant.
   *
   * ⛔ Ce paramètre ne porte AUCUN nombre — `{direction, magnitude}`, deux
   * adverbes. La traduction vit dans `applyPortionAdjust`, et nulle part
   * ailleurs.
   */
  portion: PortionAdjustFor | null,
  /**
   * ── ⟳ 2026-09-09 · CE QUE LA BALANCE FAIT À LA BANDE ──────────────────
   * `envelopeDirectionFor(...)` (`weight_pace.ts`), qui porte la direction,
   * l'écart EXÉCUTÉ (A1, plancher, fraction du mineur) et le plancher
   * d'énergie de ce corps.
   *
   * ⛔ REQUIS ET POSITIONNEL, comme les cinq paramètres au-dessus, et pour la
   * même raison: c'est la casse de compilation qui recense les appelants. Un
   * `?` aurait laissé chaque lane servir la bande d'entretien à quelqu'un qui
   * vise une perte, sans qu'aucun compilateur ne les nomme.
   *
   * ⚠️ L'OBJECTIF NE SUFFIT PLUS. La bande descend maintenant du CRAN de la
   * personne, pas d'une fraction attachée au jeton `goal` — c'est très
   * exactement ce que « le moteur suit l'écran » veut dire, et le curseur
   * n'atteignait pas cette fonction avant ce lot.
   */
  directed: EnvelopeDirection,
): Envelope {
  // ── LA BRANCHE UNIQUE ───────────────────────────────────────────────────
  // Sous flag OU corps absent OU poids inconnu. Trois causes, une seule
  // sortie: c'est ce qui rend le statut de restriction illisible en aval.
  const weightKg = body?.latestWeight?.value ?? null;
  // Le pilotage n'a AUCUNE prise ici, et c'est le point: sous flag ou sans
  // corps, l'enveloppe dégradée est la même pour tout le monde, coach pilote
  // ou pas. Un steering qui changerait quoi que ce soit à cette branche
  // rendrait le statut de restriction observable.
  //
  // ⚠️ ET UN `portion.adjust` NON PLUS. Sous plancher TCA, l'assiette ne baisse
  // pas: c'est la moitié la plus importante de ce lecteur, et elle est tenue
  // ici par un `return` avant tout calcul, puis une seconde fois par le type
  // dans `applyPortionAdjust` (`per_portion` ne porte pas d'énergie).
  if (restrictionFlag || !body || !weightKg) return DEGRADED_ENVELOPE;

  return envelopeCore({
    goal,
    weightKg,
    heightCm: body.heightCm,
    ageBand,
    gender: body.gender,
    steering,
    restrictionFlag,
    activityLevel,
    activityAxes,
    appetite,
    portion,
    directed,
  });
}

/**
 * LE MOTEUR, SUR DES PRIMITIVES — extrait le 2026-08-12 (lot foyer « chaque
 * bouche a un corps »).
 *
 * ── POURQUOI UNE EXTRACTION ET PAS UNE SECONDE FONCTION ───────────────────
 * La lane foyer a besoin d'une enveloppe pour une bouche QUI N'A PAS DE
 * COMPTE: son corps vient de `household_members`, pas de `profiles` + série de
 * pesées, donc elle n'a pas de `MealBodyContext` et surtout pas de
 * `DatedMeasure` (fabriquer une date de mesure que personne n'a saisie serait
 * un fait inventé sur une personne réelle).
 *
 * Écrire à côté « la bande de maintenance × le poids » aurait fait un SECOND
 * moteur d'enveloppe — le défaut le plus cher de ce dépôt. Ici il n'y a qu'un
 * corps de fonction: `envelopeFor` pose ses gardes puis l'appelle,
 * `maintenanceEnvelopeFromBody` pose les siennes puis l'appelle. Une bande qui
 * bouge bouge pour les deux.
 */
function envelopeCore(args: {
  goal: GoalToken;
  weightKg: number;
  heightCm: number | null;
  ageBand: AgeBand | null;
  gender: "male" | "female" | "other" | null;
  steering: SteeringEntry | null;
  restrictionFlag: boolean;
  activityLevel: ActivityLevel | null;
  /**
   * ⚠️ REQUIS (2026-08-20), pour la même raison que partout ailleurs dans ce
   * fichier: la casse de compilation est le mécanisme qui recense les
   * appelants. `{day: null, sport: null, asked: false}` rend exactement
   * l'enveloppe d'avant ce lot.
   */
  activityAxes: ActivityAxes;
  /** ⑤ (2026-08-20). Requis; `null` = neutre vrai. Voir `APPETITE_FACTORS`. */
  appetite: AppetiteLevel | null;
  portion: PortionAdjustFor | null;
  /** ⟳ 2026-09-09 — voir le paramètre homonyme d'`envelopeFor`. */
  directed: EnvelopeDirection;
}): Envelope {
  const {
    goal,
    weightKg,
    heightCm,
    ageBand,
    gender,
    steering,
    restrictionFlag,
    activityLevel,
    activityAxes,
    appetite,
    portion,
    directed,
  } = args;

  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-09 — LA BANDE EST CELLE DE L'ÉCRAN. UNE SEULE, POUR LES DEUX.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ── CE QUI VIVAIT ICI, ET LE RUN RÉEL QUI L'A FAIT TOMBER ──────────────
  // `estimatedMaintenanceKcal` (métabolisme de base × facteur d'activité) ×
  // `ENERGY_BANDS[goal]` (une fraction attachée au JETON d'objectif), écrêté
  // par A1 (`maintenance − 500`). Mesuré le 2026-09-09 sur un homme de 82 kg,
  // 180 cm, 36 ans, `trains_some`, `fat_loss` 0,5 kg/sem:
  //
  //     ce moteur-ci                                2 677 – 2 700 kcal/j
  //     ce que l'écran annonçait à la même personne  1 950 – 2 200 kcal/j
  //
  // Deux modèles du corps, ~500 kcal/jour d'écart, et l'assiette suivait celui
  // que personne ne voyait. Décision du propriétaire, 2026-09-09: **« Le moteur
  // doit suivre l'écran : 1950-2200 partout. »**
  //
  // ── CE QUE LE CHANGEMENT DÉPLACE, NOMMÉ PLUTÔT QUE DÉCOUVERT ───────────
  //   · **Le CURSEUR atteint enfin cette fonction.** La bande descendait d'une
  //     fraction du jeton `goal`; elle descend maintenant de l'écart EXÉCUTÉ au
  //     cran de la personne. Deux `fat_loss` de rythmes différents recevaient la
  //     même enveloppe — ce n'est plus le cas.
  //   · **A1 n'est plus écrêté ici, il est exécuté en amont.** Le plafond de
  //     500 kcal/j vit dans `executedPaceFor` (`clampedBy: "deficit_cap"`), qui
  //     produit `dailyDeltaKcal`. Un seul endroit, celui qui NOMME la borne qui
  //     mord — au lieu d'un `Math.max` muet ici.
  //   · **L'APPÉTIT ET LES DEUX AXES CESSENT DE DÉPLACER L'ÉNERGIE.** La bande
  //     affichée ne lit que le poids et le cran d'activité. Ils restent
  //     collectés sur la fiche d'une bouche de foyer et n'ont plus de lecteur
  //     pour la journée d'un adulte: c'est une moitié DÉBRANCHÉE, écrite ici
  //     pour qu'on la retrouve. La sortie cohérente est de les faire entrer
  //     dans `ACTIVITY_KCAL_PER_KG` — c'est-à-dire de les faire VOIR à la
  //     personne — jamais de les rebrancher sur un second calcul.
  //   · **La hauteur ne décide plus de l'énergie**, seulement de la protéine
  //     (`proteinReferenceWeightKg`). `maintenanceRange` ne la lit pas.
  //
  // ⚠️ `ageBand === null` GARDE SON SENS ET SA GARDE. Il vaut pour un mineur
  // comme pour un âge inconnu, et `AgeBand` ne porte que des bandes d'adultes:
  // `ACTIVITY_KCAL_PER_KG` est une échelle d'ADULTE, et l'appliquer à un enfant
  // serait le sous-nourrir. Les mineurs passent par `childEnvelopeFromBody`,
  // qui garde son équation pédiatrique et n'entre pas ici.
  let energy: EnergyBand | null = null;
  /**
   * LE PLANCHER D'ÉNERGIE, PARTAGÉ PAR SES DEUX LECTEURS: la bande elle-même
   * et l'écrêtage d'un `portion.adjust` à la baisse, tout en bas de cette
   * fonction.
   *
   * ⟳ 2026-09-09 — CE N'EST PLUS `maintenance − 500` SEUL, C'EST LE PLUS HAUT
   * DES DEUX: le plafond de déficit A1 et le plancher de ce corps
   * (`energyFloorFor(gender)`, porté par `directed`).
   */
  let energyFloorKcal: number | null = null;
  if (ageBand !== null) {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-10 — LA MÊME ÉQUATION DU CORPS QUE L'ÉCRAN, ET QUE LE FOYER
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── LES TROIS ÉTATS QU'A CONNUS CETTE LIGNE, PARCE QU'ON LES CONFOND ──
    //   · jusqu'au 2026-09-09 matin : `estimatedMaintenanceKcal × ENERGY_BANDS[goal]`,
    //     écrêté par A1. L'équation du corps, mais une bande attachée au JETON
    //     d'objectif — donc le rythme de la personne n'entrait pas;
    //   · 2026-09-09 matin : `plannedEnergyBand` (poids × kcal/kg, décalé de
    //     l'écart exécuté), au nom de « le moteur doit suivre l'écran ». Le
    //     rythme entrait enfin; la taille, la bande d'âge, le sexe, les deux
    //     axes et l'appétit sortaient — sans lecteur, tous;
    //   · 2026-09-09 après-midi : **l'écran a bougé**. `meal_energy_shared.ts`
    //     affiche l'équation du corps dès qu'une fiche le permet
    //     (`ENERGY_TARGET_BASIS_BODY`), parce que `28-33 kcal/kg` produit un PAL
    //     implicite de 1,13-1,35 sur un corps grand et mince — sous le plancher
    //     de 1,40 du rapport FAO/WHO/UNU 2004. Le moteur, lui, est resté au
    //     raccourci: l'écart que le lot du matin fermait s'est rouvert le même
    //     jour, dans l'autre sens.
    //
    // ── CE QUE CETTE LIGNE-CI GARDE DES DEUX ──────────────────────────────
    // L'ÉQUATION de l'écran d'aujourd'hui (tous les champs collectés sont lus)
    // ET le RYTHME du lot du matin (`directed` porte l'écart exécuté, A1 et le
    // plancher déjà appliqués dessus). Ce ne sont pas deux modèles à arbitrer:
    // l'un dit ce que ce corps dépense, l'autre de combien on s'en écarte.
    //
    // ⛔ ET C'EST EXACTEMENT LA CIBLE DE LA LANE FOYER. `maintenanceKcalOf`
    // (`mouth_anchor.ts`) appelle `estimatedMaintenanceFor`, qui appelle cette
    // MÊME fonction pour un adulte; `goalGapKcalOf` appelle le MÊME
    // `executedPaceFor`. Une fixture passée aux deux chemins rend le même
    // kcal/jour, et un test le vérifie plutôt que ce commentaire.
    //
    // ⚠️ `ageBand === null` GARDE SON SENS ET SA GARDE. Il vaut pour un mineur
    // comme pour un âge inconnu, et `AgeBand` ne porte que des bandes
    // d'adultes: les mineurs passent par `childEnvelopeFromBody`, qui garde son
    // équation pédiatrique et n'entre pas ici.
    const maintenance = adultMaintenanceKcal({
      weightKg,
      heightCm,
      ageBand,
      gender,
      activityLevel,
      activityAxes,
      appetite,
    }).kcal;
    // ⟳ 2026-09-10 — LE MÊME RÉSULTAT QUE L'ÉCRAN, PAR LA MÊME FONCTION.
    // Voir `dayEnergyFor`: la bande, A1 et le plancher d'énergie y vivent
    // ensemble, et cette lane n'en garde aucune copie.
    const day = dayEnergyFor({ maintenanceKcal: maintenance, goal, directed });
    energy = day.band;
    energyFloorKcal = day.energyFloorKcal;
  }

  const floorPerKg = Math.max(
    PROTEIN_FLOOR_G_PER_KG[goal],
    ageBand === "60_plus" ? SENIOR_PROTEIN_FLOOR_G_PER_KG : 0,
  );
  /**
   * `L1` (2026-08-22) — LE POIDS DE RÉFÉRENCE, ET C'EST LUI QU'ON MULTIPLIE.
   *
   * Les g/kg ci-dessus descendent d'une littérature qui parle en MASSE MAIGRE;
   * appliqués au poids total ils servent à quelqu'un de corpulent une fois et
   * demie ce qu'ils servent à quelqu'un de mince, par kilo de masse maigre.
   * `proteinReferenceWeightKg` referme cet écart, et il ne mord QU'À CE
   * BOUT-LÀ: sous son plafond il rend le poids réel au kilo près, donc un
   * corps grand et mince ne perd pas un gramme.
   *
   * ⛔ IL NE PORTE QUE SUR CETTE LIGNE. `maintenance`, la bande d'énergie, son
   * plancher A1 et le plafond de densité gardent le poids réel — un plafond
   * protéique n'est pas un régime.
   *
   * ⚠️ `suspended: false` est écrit en dur et EXPLICITEMENT: `O6` (GLP-1)
   * demandera de suspendre ce plafond, et c'est ici que la case se branchera.
   * Le champ est requis dans le type pour que la casse de compilation recense
   * les appelants ce jour-là.
   */
  const referenceWeightKg = proteinReferenceWeightKg({
    weightKg,
    heightCm,
    ageBand,
    suspended: false,
  }).referenceWeightKg;
  const proteinFloorG = Math.round(referenceWeightKg * floorPerKg);

  // LES TROIS CAS, ET SEULEMENT EUX.
  let proteinPerMealG: number | null = null;
  if (ageBand === "60_plus") {
    proteinPerMealG = Math.round(weightKg * SENIOR_PROTEIN_PER_MEAL_G_PER_KG);
  } else if (goal === "muscle_gain") {
    proteinPerMealG = Math.round(proteinFloorG / TRAINING_PROTEIN_MEALS);
  }

  const base: Envelope = {
    mode: "per_kg",
    energy,
    proteinFloorG,
    proteinPerMealG,
    densityCeiling: goal === "fat_loss"
      ? DENSITY_CEILING_FAT_LOSS
      : DENSITY_CEILING_DEFAULT,
  };
  // EN DERNIER — après les ceintures produit, jamais avant.
  const piloted = applyPiloting(steering, base, restrictionFlag);
  // ET APRÈS LE PILOTAGE: la personne parle de SON assiette, la doctrine parle
  // d'une cohorte. Le plus spécifique parle en dernier — et c'est cette
  // fonction-ci qui écrête sur `energyFloorKcal`, donc A1 reste le dernier mot
  // sans dépendre d'une propriété d'`applyPiloting`. Voir son bloc de tête.
  return applyPortionAdjust(piloted, portion, energyFloorKcal);
}

// ---------------------------------------------------------------------------
// LE CORPS D'UNE BOUCHE, SANS COMPTE — lot foyer du 2026-08-12
// ---------------------------------------------------------------------------

/**
 * Le corps d'une bouche tel que `household_members` le porte.
 *
 * ⚠️ CE N'EST PAS UN `MealBodyContext`, ET ÇA NE DOIT PAS LE DEVENIR.
 * `MealBodyContext` porte une SÉRIE de mesures datées et le verdict du plancher
 * TCA — deux choses qui n'existent que pour un compte. Ici il y a un corps
 * saisi une fois par le compte maître: pas de date de pesée, pas de série,
 * donc pas de tendance, donc rien dont on puisse dériver une direction.
 *
 * C'est exactement pourquoi ce corps-là ne peut acheter qu'une **maintenance**
 * (voir `maintenanceEnvelopeFromBody` et `childEnvelopeFromBody`).
 */
export interface MouthBody {
  /** En centimètres. Non lu par l'équation pédiatrique — voir `CHILD_BMR`. */
  heightCm: number | null;
  weightKg: number | null;
  gender: "male" | "female" | "other" | null;
  /** L'âge en années révolues, dérivé de la date à la lecture. */
  ageYears: number | null;
  /**
   * `null` = personne n'a répondu ⇒ le facteur d'hypothèse (1,5 adulte, 1,6
   * enfant), donc exactement l'enveloppe d'avant le 2026-08-18.
   *
   * REQUIS dans le type, jamais optionnel: c'est le compilateur qui recense
   * les lecteurs de corps du foyer, et un `?` ici aurait laissé la moitié
   * d'entre eux servir l'hypothèse à quelqu'un qui a répondu.
   */
  activityLevel: ActivityLevel | null;
  /**
   * LES DEUX AXES (2026-08-20) — journée et sport, demandés séparément.
   *
   * REQUIS dans le type, jamais optionnel, et pour la MÊME raison que le champ
   * juste au-dessus: c'est le compilateur qui recense les lecteurs de corps du
   * foyer. Un `?` ici aurait laissé la moitié d'entre eux appliquer le cran
   * mélangé à quelqu'un qui a répondu aux deux questions.
   *
   * ⚠️ IL NE REMPLACE PAS `activityLevel`, IL LE PRÉCÈDE. Voir
   * `activityFactorOf`: le cran reste le repli nommé des fiches qui n'ont pas
   * répondu, et il rend EXACTEMENT le nombre d'hier.
   */
  activityAxes: ActivityAxes;
  /**
   * ⑤ L'APPÉTIT (2026-08-20) — ±10 % sur l'ESTIMATION, et TRANSITOIRE.
   *
   * REQUIS dans le type, jamais optionnel, pour la même raison que les deux
   * champs au-dessus: c'est le compilateur qui recense les lecteurs de corps.
   * `null` = personne n'a répondu ⇒ ×1,00, un neutre VRAI.
   *
   * ⚠️ IL VIT SUR LE CORPS ET IL N'EST PAS UNE MESURE DU CORPS. C'est une
   * déclaration sur soi, comme l'activité juste au-dessus — et c'est pour ça
   * qu'ils voyagent ensemble: une seule fiche, une seule porte d'écriture.
   */
  appetite: AppetiteLevel | null;
}

/**
 * L'ENVELOPPE D'UNE MAINTENANCE PURE — aucune direction, donc aucun écart.
 *
 * ⛔ ELLE VIT ICI, ET PAS DANS `weight_pace.ts` QUI PRODUIT LE TYPE: ce
 * fichier-ci ne peut importer de `weight_pace.ts` qu'un TYPE (l'autre sens est
 * un import de valeurs, donc un cycle). Une constante est une valeur.
 *
 * ⛔ CE N'EST PAS UN « DÉFAUT COMMODE ». Il existe pour les appelants dont le
 * corps ne peut PAS acheter d'objectif (`maintenanceEnvelopeFromBody`: une
 * bouche de foyer sans compte, donc sans plancher TCA derrière elle). Leur
 * passer une direction serait leur faire exécuter une restriction que rien ne
 * surveille — la garde est écrite dans l'en-tête de cette fonction-là.
 */
export const MAINTENANCE_ENVELOPE_DIRECTION: EnvelopeDirection = Object.freeze({
  direction: null,
  dailyDeltaKcal: 0,
  energyFloorKcal: 0,
});

/**
 * L'ENVELOPPE DE MAINTENANCE D'UN ADULTE, DEPUIS UN CORPS DE FICHE.
 *
 * ── ELLE NE PREND PAS D'OBJECTIF, ET C'EST LA GARDE ──────────────────────
 * Pas un paramètre `goal` qu'un appelant pourrait remplir: `maintenance` est
 * écrit dans le corps de la fonction. Un corps sans série de pesées n'a pas de
 * plancher TCA derrière lui; lui laisser exécuter un `fat_loss` serait faire
 * exécuter une restriction à un moteur qui n'a aucun moyen de savoir qu'il ne
 * devrait pas. Une maintenance, elle, ne peut ni creuser un déficit ni poser un
 * plafond de densité — la seule chose qu'elle change en aval est de faire
 * DESCENDRE un tronc commun (protecteur) ou d'ouvrir un add-on (additif).
 *
 * `restrictionFlag: false` est passé pour la même raison, et il est sûr POUR
 * CETTE RAISON-LÀ seulement: il n'y a rien à protéger d'une bande qui ne
 * retire rien.
 *
 * ── ⚠️ TROU NOMMÉ: LES `portion.adjust` N'ENTRENT PAS PAR CETTE PORTE ─────
 * `portion: null`, et ce n'est pas un oubli. `MouthBody` ne porte NI
 * `member_id` NI `ageState`, et `subjectsForPortionAdjust` exige les deux — la
 * règle du mineur n'aurait rien à mordre. Les ajouter à `MouthBody` déplacerait
 * la question chez `mouthEnvelope` (`household_composition.ts`), qui est hors
 * du périmètre de ce lot. Conséquence assumée: une bouche ADULTE de foyer sans
 * compte garde sa maintenance pleine. Direction d'erreur sûre — une part
 * standard, jamais réduite, exactement le repli du reste de ce module — mais
 * c'est une moitié à câbler, pas un état final.
 */
export function maintenanceEnvelopeFromBody(body: MouthBody): Envelope | null {
  if (!body.weightKg) return null;
  const ageBand = ageBandOf(body.ageYears);
  if (ageBand === null) return null;
  return envelopeCore({
    goal: "maintenance",
    weightKg: body.weightKg,
    heightCm: body.heightCm,
    ageBand,
    gender: body.gender,
    steering: null,
    restrictionFlag: false,
    activityLevel: body.activityLevel,
    // Les deux axes descendent AVEC le corps: c'est la ligne qui les porte, et
    // les perdre ici referait servir le cran mélangé à qui a répondu aux deux.
    activityAxes: body.activityAxes,
    appetite: body.appetite,
    portion: null,
    // ⛔ AUCUNE DIRECTION: voir l'en-tête. Ce corps-là ne peut acheter qu'une
    // maintenance, et lui en passer une lui ferait exécuter une restriction
    // que rien ne surveille.
    directed: MAINTENANCE_ENVELOPE_DIRECTION,
  });
}

/**
 * LES TRANCHES D'ÂGE PÉDIATRIQUES — un TYPE À PART, jamais `AgeBand`.
 *
 * ── POURQUOI PAS D'EXTENSION D'`AgeBand` ─────────────────────────────────
 * C'était la première idée, et l'audit des lecteurs l'a écartée. `ageBandOf`
 * rend `null` sous 18 ans, et DEUX chemins de production en dépendent
 * aujourd'hui pour ne rien dire d'un mineur:
 *
 *   1. `meal_body.ts :: mealBodyBlocks` pousse `age band: …` DANS LE PROMPT
 *      dès que `ageBand` n'est pas `null`. Une bande pédiatrique non nulle y
 *      ferait entrer un fait corporel de mineur — exactement ce que le lot
 *      s'interdit (FF-047 §3, moitié conservée).
 *   2. `estimatedMaintenanceKcal` indexe `midAge: Record<AgeBand, number>`:
 *      une valeur pédiatrique de plus y ferait passer un enfant par
 *      Mifflin-St Jeor, c'est-à-dire lui servir une restriction en croyant lui
 *      servir un besoin.
 *
 * Un type distinct rend les deux impossibles au compilateur plutôt qu'à la
 * relecture. Ce qu'on perd: `PediatricBand` et `AgeBand` ne se comparent pas —
 * et c'est précisément ce qu'on veut.
 */
export type PediatricBand = "0_3" | "3_10" | "10_18";

/** `null` à 18 ans et au-delà: ce n'est plus un enfant, c'est `ageBandOf`. */
export function pediatricBandOf(ageYears: number | null): PediatricBand | null {
  if (ageYears === null || !Number.isFinite(ageYears)) return null;
  if (ageYears < 0 || ageYears >= KEEL_MINOR_AGE) return null;
  if (ageYears < 3) return "0_3";
  if (ageYears < 10) return "3_10";
  return "10_18";
}

/**
 * LE MÉTABOLISME DE BASE D'UN ENFANT — Schofield, retenu par FAO/WHO/UNU.
 *
 * ⚠️ SOURCE, ET STATUT DE LA VALEUR. Schofield WN, « Predicting basal metabolic
 * rate, new standards and review of previous work », Hum Nutr Clin Nutr 1985;
 * repris comme référence de l'enfant par le rapport conjoint FAO/WHO/UNU
 * « Human energy requirements » (2004), tables par tranche d'âge et par sexe.
 * Les coefficients ci-dessous sont les formes **poids seul**, en kcal/jour.
 *
 * ── POURQUOI LE POIDS SEUL, ALORS QU'ON COLLECTE LA TAILLE ───────────────
 * Schofield publie aussi des formes poids+taille. Elles sont réputées moins
 * stables (le terme de taille y porte un coefficient qui change de signe d'une
 * tranche à l'autre) et n'améliorent pas l'estimation en pratique clinique. La
 * taille reste collectée: elle sert le chemin ADULTE (Mifflin la demande) et
 * elle sert la plausibilité. Elle n'entre PAS ici, et le dire évite qu'un
 * lecteur croie à un oubli.
 *
 * ⛔ ET SURTOUT: CE N'EST PAS MIFFLIN-ST JEOR. Mifflin est établie sur des
 * adultes et sous-estime lourdement le besoin d'un enfant — le besoin par kilo
 * d'un enfant est bien supérieur à celui d'un adulte. Servir Mifflin à un
 * enfant de huit ans, c'est lui prescrire une restriction en croyant lui servir
 * un besoin normal. La contre-épreuve chiffrée est dans le test de ce module.
 */
const CHILD_BMR: Record<
  PediatricBand,
  { male: { a: number; b: number }; female: { a: number; b: number } }
> = {
  "0_3": {
    male: { a: 59.512, b: -30.4 },
    female: { a: 58.317, b: -31.1 },
  },
  "3_10": {
    male: { a: 22.706, b: 504.3 },
    female: { a: 20.315, b: 485.9 },
  },
  "10_18": {
    male: { a: 17.686, b: 658.2 },
    female: { a: 13.384, b: 692.6 },
  },
};

/**
 * LE FACTEUR D'ACTIVITÉ DE L'ENFANT — HYPOTHÈSE, comme celui de l'adulte.
 *
 * FAO/WHO/UNU 2004 range les enfants d'âge scolaire modérément actifs entre
 * PAL 1,55 et 1,75. On prend 1,60, le bas de « modéré »: le produit ne demande
 * pas son activité à un enfant, et surestimer un besoin ferait servir plus que
 * nécessaire — direction d'erreur bien moins grave que l'inverse, mais qui n'a
 * pas de raison d'être choisie sans motif.
 *
 * ⚠️ IL EST PLUS ÉLEVÉ QUE CELUI DE L'ADULTE (1,5), ET CE N'EST PAS UN HASARD.
 */
export const CHILD_ACTIVITY_FACTOR = 1.6;

/**
 * LA CROISSANCE, NOMMÉE PLUTÔT QUE FONDUE DANS LE FACTEUR.
 *
 * FAO/WHO/UNU 2004 chiffre le coût énergétique de la croissance à environ 1 %
 * du besoin total après la première année (il est massif avant, et le produit
 * ne compose pas pour un nourrisson). Un pour cent est dans le bruit de
 * l'estimation — et c'est justement pourquoi il est écrit ici plutôt que
 * dissous dans le facteur d'activité: un lecteur doit pouvoir voir que la
 * croissance a été prise en compte, et de combien.
 */
export const CHILD_GROWTH_ALLOWANCE = 0.01;

/**
 * LE BESOIN QUOTIDIEN ESTIMÉ D'UN ENFANT. INTERNE, comme celui de l'adulte:
 * ce nombre ne sort jamais du moteur, ne s'affiche pas, ne se dit pas.
 *
 * `other` et l'absence de sexe prennent la MOYENNE des deux jeux de
 * coefficients — même arbitrage que `estimatedMaintenanceKcal`: choisir serait
 * assigner, et la moyenne est la seule réponse qui ne le fait pas. C'est
 * d'autant plus vrai ici que la décision porterait sur le corps d'un enfant.
 */
export function estimatedChildMaintenanceKcal(args: {
  weightKg: number | null;
  ageYears: number | null;
  gender: "male" | "female" | "other" | null;
  /**
   * ⚠️ IL NE PEUT QUE MONTER, JAMAIS DESCENDRE — voir `childActivityFactor`.
   * Requis, pour la même raison que partout ailleurs dans ce lot.
   */
  activityLevel: ActivityLevel | null;
  /** Requis (2026-08-20), même doctrine que sur le chemin adulte. */
  activityAxes: ActivityAxes;
  /**
   * ⑤ REQUIS — ET IL NE PEUT QUE MONTER SUR UN ENFANT. Voir
   * `childAppetiteFactor`: c'est la MÊME décision que `childActivityFactor`, et
   * pour la même raison.
   */
  appetite: AppetiteLevel | null;
}): number | null {
  const band = pediatricBandOf(args.ageYears);
  if (band === null || !args.weightKg) return null;
  const coef = CHILD_BMR[band];
  const male = coef.male.a * args.weightKg + coef.male.b;
  const female = coef.female.a * args.weightKg + coef.female.b;
  const bmr = args.gender === "male"
    ? male
    : args.gender === "female"
    ? female
    : (male + female) / 2;
  if (!Number.isFinite(bmr) || bmr <= 0) return null;
  return Math.round(
    bmr * childActivityFactor(args.activityLevel, args.activityAxes) *
      childAppetiteFactor(args.appetite) *
      (1 + CHILD_GROWTH_ALLOWANCE),
  );
}

/**
 * LE FACTEUR D'UN ENFANT QUI A RÉPONDU — ET IL NE PEUT QUE MONTER.
 *
 * `Math.max` et pas une lecture directe de `ACTIVITY_FACTORS`, et c'est la
 * décision de ce paragraphe. Les crans de l'adulte descendent à 1,45 pour un
 * sédentaire; le défaut de l'enfant est 1,60, et il est plus haut EXPRÈS (voir
 * `CHILD_ACTIVITY_FACTOR`: le besoin par kilo d'un enfant est supérieur à
 * celui d'un adulte, et FAO/WHO/UNU 2004 range les enfants d'âge scolaire
 * modérément actifs entre 1,55 et 1,75).
 *
 * Laisser un « assis toute la journée » coché sur un enfant faire DESCENDRE
 * son besoin de 1,60 à 1,45, c'est servir 9 % de moins à un corps en
 * croissance sur la foi d'une case cochée par quelqu'un d'autre que lui — le
 * compte maître. « Surestimer un besoin ferait servir plus que nécessaire —
 * direction d'erreur bien moins grave que l'inverse » était déjà écrit ici;
 * ce plancher est cette phrase rendue exécutable.
 *
 * Ce qu'on garde: un enfant qui s'entraîne quatre fois par semaine monte
 * vraiment à 2,00, et c'est le cas que le renversement du 2026-08-18 sert.
 */
export function childActivityFactor(
  level: ActivityLevel | null,
  /**
   * ⚠️ LES DEUX AXES ENTRENT PAR LE MÊME `Math.max` (2026-08-20), et pas par
   * une seconde branche. Le plancher de 1,60 est la moitié la plus importante
   * de cette fonction; un croisement `seated x none` (1,45) doit s'y heurter
   * exactement comme `sedentary` s'y heurte aujourd'hui, sinon le lot ② aurait
   * rouvert, par une porte neuve, la question que ce plancher a fermée.
   */
  axes: ActivityAxes,
): number {
  const { factor, source } = activityFactorOf(axes, level);
  // `assumed` = personne n'a répondu: le défaut de l'enfant, pas celui de
  // l'adulte. `activityFactorOf` rendrait 1,5, qui est SOUS le plancher — le
  // `Math.max` le rattraperait, mais s'en remettre à lui ferait dépendre le
  // défaut de l'enfant d'une comparaison au lieu d'une déclaration.
  if (source === "assumed") return CHILD_ACTIVITY_FACTOR;
  return Math.max(CHILD_ACTIVITY_FACTOR, factor);
}

/**
 * ⑤ L'APPÉTIT D'UN ENFANT — ET IL NE PEUT QUE MONTER.
 *
 * ⛔ MÊME DÉCISION QUE `childActivityFactor`, ET MÊME RAISON, ÉCRITE À NOUVEAU
 * PARCE QU'ELLE SE PERD. Le cran est coché par le COMPTE MAÎTRE, pas par
 * l'enfant. Laisser « petit appétit » retirer 10 % du besoin d'un corps en
 * croissance, c'est servir moins à quelqu'un sur la foi d'une case cochée par
 * quelqu'un d'autre que lui — et cette fois sans même l'excuse d'une équation:
 * ±10 % est l'incertitude de la FORMULE, et la formule pédiatrique n'est pas
 * celle de l'adulte.
 *
 * Ce qu'on garde: un enfant dont le parent constate qu'il mange vraiment plus
 * monte bien à 1,10, et c'est le cas utile.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function childAppetiteFactor(appetite: AppetiteLevel | null): number {
  const { factor } = appetiteFactorOf(appetite);
  return Math.max(1, factor);
}

/**
 * LE PLANCHER PROTÉIQUE DE L'ENFANT — le « niveau sûr d'apport ».
 *
 * WHO/FAO/UNU 2007, « Protein and amino acid requirements in human nutrition »:
 * le niveau sûr tourne autour de 0,9 g/kg/j de 4 à 14 ans. On retient 1,0, et
 * il faut lire ce qu'il n'est PAS: ce n'est pas le plancher de 1,6-2,0 g/kg des
 * dynamiques d'adulte, qui sert la rétention de masse maigre sous contrainte.
 * Un enfant n'est sous aucune contrainte ici — il est en maintenance, toujours.
 */
const CHILD_PROTEIN_FLOOR_G_PER_KG = 1.0;

/**
 * L'ENVELOPPE D'UN ENFANT. **Maintenance, toujours, quoi qu'il y ait ailleurs.**
 *
 * ── AUCUN OBJECTIF, PAR CONSTRUCTION ─────────────────────────────────────
 * La fonction ne prend pas de `goal`. Si le compte maître écrit `fat_loss` sur
 * la fiche d'un enfant, il n'existe aucun chemin par lequel ce jeton atteigne
 * cette bande — ce n'est pas un `if` qu'on pourrait oublier de rejouer, c'est
 * un paramètre qui n'existe pas.
 *
 * ⚠️ ET C'EST EXACTEMENT CE QUI RESTE VRAI APRÈS LE 2026-08-18. Ce jour-là,
 * une décision humaine a ouvert les trois objectifs à un mineur, et
 * `servingDirectionFor` a cessé d'écraser sa direction. Une DIRECTION est une
 * consigne de service (« légumes généreux, féculent plus modeste »); une BANDE
 * D'ÉNERGIE est un déficit. Le renversement porte sur la première et
 * s'arrête ici, à la seconde: l'objectif s'applique, le régime ne s'ouvre pas.
 * C'est la moitié de la décision qui protège, et elle est tenue par l'absence
 * d'un paramètre plutôt que par une garde qu'on pourrait lever.
 *
 * ── NI PLAFOND DE DENSITÉ, NI DÉFICIT, NI RÉPARTITION PAR REPAS ──────────
 * `densityCeiling: null` et `proteinPerMealG: null`. Ce qu'on calcule est un
 * BESOIN, pas une cible à réduire; un plafond de densité est une pression de
 * minimisation, et elle n'a rien à faire sur l'assiette d'un enfant.
 *
 * ── NI `portion.adjust`, ET LÀ C'EST LA DÉCISION, PAS UN TROU ────────────
 * La fonction ne prend pas de `portion` non plus. Un `portion.adjust` à la
 * baisse sans sujet ne s'applique déjà pas à un mineur (socle, §2 axe 3); ici
 * même un sujet EXPLICITE n'a aucun chemin, et c'est le même patron que le
 * `goal` absent — l'assiette d'un enfant ne se réduit pas depuis un formulaire
 * rempli par quelqu'un d'autre que lui.
 *
 * `null` quand le corps ne suffit pas: **jamais** l'enveloppe dégradée. Rendre
 * `per_portion` ici armerait le verrou de lane et ferait dégrader TOUT le
 * foyer parce qu'une case du formulaire est vide. `null` veut dire « pas
 * d'enveloppe pour cette bouche » — elle compte alors pour une part standard,
 * jamais réduite, ce qui est la direction d'erreur du reste du module.
 */
export function childEnvelopeFromBody(body: MouthBody): Envelope | null {
  const maintenance = estimatedChildMaintenanceKcal({
    weightKg: body.weightKg,
    ageYears: body.ageYears,
    gender: body.gender,
    activityLevel: body.activityLevel,
    activityAxes: body.activityAxes,
    appetite: body.appetite,
  });
  if (maintenance === null || !body.weightKg) return null;
  const band = ENERGY_BANDS.maintenance;
  return {
    mode: "per_kg",
    energy: {
      low: Math.round(maintenance * band.low),
      high: Math.round(maintenance * band.high),
    },
    proteinFloorG: Math.round(body.weightKg * CHILD_PROTEIN_FLOOR_G_PER_KG),
    proteinPerMealG: null,
    densityCeiling: null,
  };
}

/**
 * TOUT CE QUI EST DÉRIVABLE D'UNE ENVELOPPE, EN UNE CHAÎNE.
 *
 * Exportée pour UNE raison: l'invariant d'indiscernabilité se prouve par
 * ÉGALITÉ DE CHAÎNES, jamais par inspection. Un test qui vérifierait
 * « il n'y a pas de bande d'énergie » laisserait passer un champ ajouté six
 * mois plus tard, un `undefined` de plus, ou un mode écrit différemment — et
 * c'est précisément par là qu'un statut de restriction devient observable.
 */
export function envelopeFingerprint(envelope: Envelope): string {
  // Sérialisation déterministe MAISON. `JSON.stringify(x, keys)` filtre les
  // clés à TOUS les niveaux: la bande d'énergie imbriquée y serait réduite à
  // `{}`, et deux enveloppes `per_kg` de bandes différentes rendraient la même
  // empreinte. Une empreinte qui confond deux états est pire qu'aucune
  // empreinte — c'est un test vert qui ne teste rien.
  const walk = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${
      Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${walk(o[k])}`).join(",")
    }}`;
  };
  return walk(envelope);
}

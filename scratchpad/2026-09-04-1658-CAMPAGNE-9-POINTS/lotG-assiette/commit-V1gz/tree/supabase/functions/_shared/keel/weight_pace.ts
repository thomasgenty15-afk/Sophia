/**
 * LE POIDS VISÉ ET LE RYTHME — ce que le slider a le droit de promettre.
 *
 * Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md`
 * §Bloc 2. Décisions humaines du 2026-08-18.
 *
 * ── LE PROBLÈME, EN UN NOMBRE ─────────────────────────────────────────────
 * 1 kg de masse grasse vaut environ 7 700 kcal, donc 1 kg/semaine vaut environ
 * 1 100 kcal/jour d'écart. Sur une personne de 60 kg dont l'entretien tourne
 * autour de 1 700 kcal, un slider qui monte à 1 kg pose une cible à
 * **600 kcal/jour**. Aucun produit n'écrit ce nombre. Un slider dont le
 * maximum s'adapte à la personne est aussi plus CRÉDIBLE qu'un slider qui
 * promet la même chose à tout le monde.
 *
 * ── LA BORNE EST LE PLUS PETIT DE TROIS NOMBRES ───────────────────────────
 *
 *   max = MIN( 1 kg/semaine          ← le plafond absolu
 *            , 1 % du poids/semaine  ← ce que CE corps supporte
 *            , ce qui garde la cible au-dessus du plancher d'énergie )
 *
 * ⚠️ LES DEUX PREMIÈRES SONT DES DÉCISIONS PRISES ENSEMBLE, PAS UN COMPROMIS.
 * Retirer l'adaptation au corps pour « restaurer » le kilo poserait la cible à
 * 600 kcal/jour de l'exemple ci-dessus; retirer le kilo laisserait un slider
 * qui promet n'importe quoi à un grand gabarit. Ne pas lire l'une comme une
 * entorse à l'autre.
 *
 * ── ⚠️ UNE BORNE, UN AVERTISSEMENT: LA DISTINCTION QUI TIENT CE MODULE ────
 * Les TROIS nombres ci-dessus sont des limites DURES — au-delà, le produit
 * refuse. Le seuil de **0,5 kg/semaine en prise** n'en est PAS une: c'est un
 * avertissement (`paceWarning`), au-delà duquel le produit PARLE. §Bloc 2,
 * mot pour mot: « le slider le DIT, il ne l'interdit pas ».
 *
 * Ce module a confondu les deux jusqu'au 2026-08-18: la prise était bornée par
 * `MAX_SURPLUS_FRACTION`, et un adulte de 70 kg plafonnait à **0,30 kg/sem** —
 * l'interdiction exacte que la conception refuse. Un test gardait ça vert en
 * CITANT la phrase ci-dessus puis en affirmant son contraire.
 *
 * ── ⚠️ QUELLE BORNE MORD VRAIMENT — MESURÉ, PAS SUPPOSÉ ──────────────────
 * Balayage de 72 320 corps (25→250 kg × 4 tailles × 4 genres × 5 crans
 * d'activité × 2 directions × {adulte, mineur}):
 *
 *   PERTE, adulte    `energy_floor` 16 942 · `body_fraction` 1 138 (25-45 kg)
 *                    `absolute_cap` **0 — et INATTEIGNABLE, pas dormant**
 *   PERTE, mineur    `energy_floor` 18 080 (la fraction de SON besoin)
 *   PRISE, adulte    `absolute_cap` 12 000 (>100 kg) · `body_fraction` 6 080
 *   PRISE, mineur    `energy_floor` 18 080 (la même fraction, dans les deux sens)
 *
 * Sur une PERTE, `absolute_cap` ne peut pas mordre par construction: l'écart y
 * est plafonné par A1 (`MAX_DAILY_DEFICIT_KCAL`, 500 kcal/j, non débrayable),
 * soit 500 × 7 / 7 700 = **0,4545 kg/sem**, la moitié du plafond. Aucun gabarit
 * ne l'atteint. Un rapport de vérification avait nommé les deux premières
 * bornes « dormantes »: `body_fraction` ne l'était pas, et `absolute_cap` était
 * pire que dormante. C'est l'ouverture de la PRISE qui lui a donné son premier
 * cas réel.
 *
 * ── L'INVARIANT QUI JUSTIFIE D'AVOIR MIS A1 DANS LE SLIDER ────────────────
 * **Sur une PERTE, le maximum du slider est le rythme le plus rapide que la
 * composition sait réellement livrer.** Un slider qui monterait plus haut
 * ferait une promesse que `envelopeCore` refuserait d'exécuter — et la date
 * d'arrivée calculée dessus (« à 0,5 kg/semaine, tu y es vers le 12 novembre »)
 * serait fausse dès le premier jour. Une date fausse est pire qu'une absence de
 * date.
 *
 * ⚠️ ET SUR UNE PRISE, LE SLIDER MONTE PLUS HAUT QUE CE QUE L'ENVELOPPE
 * EXÉCUTE — DEPUIS LE 2026-08-18, EN CONNAISSANCE DE CAUSE. La bande
 * `muscle_gain` plafonne à +10 % (`MAX_SURPLUS_FRACTION`), soit ~0,23 kg/sem
 * sur 2 500 kcal d'entretien, alors que le slider monte jusqu'à la borne dure.
 * C'est le prix, assumé, de ne pas refuser à quelqu'un un rythme qu'il a le
 * droit de choisir.
 *
 * ⛔ L'ÉCART EST REFERMÉ DEPUIS LE 2026-08-18 (lot L8), ET IL L'EST PAR LA
 * SECONDE SORTIE, PAS PAR LA PREMIÈRE. On n'a PAS élargi la bande de prise —
 * `MAX_SURPLUS_FRACTION` est dérivé de `ENERGY_BANDS.muscle_gain` (Helms 2023)
 * et l'élargir pour faire tenir une promesse d'interface aurait fait exécuter
 * au moteur un surplus que la littérature ne porte pas. On dit la date sur le
 * rythme **EXÉCUTÉ**: `executedPaceFor` ci-dessous rend ce que la composition
 * sait réellement livrer, et c'est LUI que la date d'arrivée et les grammages
 * doivent lire. `paceCeilingFor` continue de rendre ce que le curseur AUTORISE
 * — les deux nombres sont différents et le restent, ce qui est le fait, pas un
 * défaut.
 *
 * ⚠️ CE QUI RESTE OUVERT, ET IL FAUT LE SAVOIR: l'écran ne lit pas encore
 * `executedPaceFor` pour composer sa phrase de date (`weeksToTarget` y est
 * appelé sur le cran CHOISI). Tant que c'est vrai, la date affichée sur une
 * prise au-delà de +10 % reste optimiste — mais le moteur, lui, ne l'est plus:
 * les grammages sont dimensionnés sur l'exécuté.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
 * Il ne pose aucune cible dans le générateur (c'est le lot L8, et il attend la
 * garde TCA). Il ne rend aucun nombre destiné à être LU par un mineur. Il ne
 * soustrait rien d'un consommé — il n'existe ici ni reste ni solde.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  estimatedChildMaintenanceKcal,
  estimatedMaintenanceKcal,
  MAX_DAILY_DEFICIT_KCAL,
  MAX_SURPLUS_FRACTION,
  type MouthBody,
} from "./meal_envelope.ts";
import { ageBandOf } from "./student_age.ts";
import type { GoalToken } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LA DIRECTION — dérivée de l'objectif, jamais demandée deux fois
// ---------------------------------------------------------------------------

/**
 * `null` pour `maintenance`: la balance ne bouge pas, donc il n'y a ni poids
 * visé ni rythme à régler. C'est ce `null` qui replie les deux champs du
 * formulaire, et c'est la même information que « les deux champs se déplient
 * quand on choisit perdre ou prendre ».
 */
export type ScaleDirection = "down" | "up";

export function scaleDirectionOf(goal: GoalToken): ScaleDirection | null {
  switch (goal) {
    case "fat_loss":
      return "down";
    case "muscle_gain":
      return "up";
    case "maintenance":
      return null;
  }
}

// ---------------------------------------------------------------------------
// LES CONSTANTES — chacune avec la décision qui la porte
// ---------------------------------------------------------------------------

/**
 * L'ÉNERGIE D'UN KILO DE MASSE CORPORELLE.
 *
 * ~7 700 kcal/kg de tissu adipeux (Wishnofsky 1958, la règle des 3 500 kcal
 * par livre). ⚠️ ELLE EST APPROXIMATIVE ET C'EST SU: elle suppose une perte de
 * gras pur et ignore l'adaptation métabolique, donc elle SURESTIME la vitesse
 * réelle après quelques semaines. La direction de l'erreur est celle qu'on
 * veut ici: elle rend le plafond du slider plus SERRÉ que la réalité, jamais
 * plus lâche.
 */
export const KCAL_PER_KG_BODY_MASS = 7700;

/** Le plafond absolu, décision humaine du 2026-08-18. */
export const MAX_KG_PER_WEEK = 1.0;

/**
 * CE QUE CE CORPS SUPPORTE — 1 % du poids par semaine.
 *
 * C'est la borne « adaptée au gabarit »: elle dit qu'un rythme n'a de sens que
 * rapporté à la masse qui le porte. Elle est plus serrée que le kilo en
 * dessous de 100 kg, et plus lâche au-dessus — d'où le plafond absolu, qui
 * reprend la main là.
 */
export const MAX_WEEKLY_BODY_FRACTION = 0.01;

/**
 * LE PLANCHER D'ÉNERGIE D'UN ADULTE, en kcal/jour.
 *
 * ⚠️ CONSTANTES OPÉRATIONNELLES, ET C'EST AVOUÉ — même statut que les plafonds
 * de densité de `meal_envelope.ts`. 1 200 et 1 500 kcal/j sont les minima
 * cliniques usuels en dessous desquels la couverture en micronutriments
 * devient improbable et le suivi médical est requis; ce ne sont pas des
 * seuils issus d'un essai. Ce qu'ils font ici est précis et suffit à les
 * justifier: **ils rendent « 600 kcal/jour » REFUSABLE PAR SON NOM**, au lieu
 * de le laisser sortir d'une multiplication.
 *
 * `other` et l'absence de sexe prennent la moyenne des deux, même arbitrage
 * que `estimatedMaintenanceKcal`: choisir serait assigner.
 */
export const ENERGY_FLOOR_KCAL = Object.freeze({
  male: 1500,
  female: 1200,
  other: 1350,
});

/**
 * LE PLANCHER D'UN MINEUR EST UNE FRACTION DE SON PROPRE BESOIN, PAS UN NOMBRE.
 *
 * ── POURQUOI PAS 1 200 kcal ───────────────────────────────────────────────
 * Parce qu'un plancher fixe est aveugle à l'âge, et que le besoin d'un enfant
 * de huit ans et celui d'un adolescent de dix-sept diffèrent du simple au
 * double. Un plancher adulte posé sur un enfant de 25 kg autoriserait un
 * déficit énorme; posé sur un adolescent sportif il n'autoriserait presque
 * rien. Les deux erreurs sont dans le même chiffre.
 *
 * Le besoin d'un mineur, lui, EST calculé sur son âge — Schofield par tranche
 * pédiatrique, via `estimatedChildMaintenanceKcal`. Le plancher en découle:
 * l'écart quotidien maximal d'un mineur vaut 10 % de son besoin estimé.
 *
 * ── CE QUE ÇA DONNE, ET C'EST LE POINT ────────────────────────────────────
 * Sur un enfant dont le besoin est estimé à 1 800 kcal: 180 kcal/jour, soit
 * environ **0,16 kg/semaine**. L'objectif s'applique — la direction de service
 * bifurque, la composition en tient compte — et le régime ne s'ouvre pas.
 * C'est la formulation exécutable de « ouvrir l'objectif sans ouvrir le
 * régime » (décision du 2026-08-18).
 *
 * ⚠️ 10 % EST UN ARBITRAGE, PAS UNE RÉFÉRENCE. Il vaut la moitié de ce que la
 * bande `fat_loss` de l'adulte autorise en relatif (jusqu'à −25 % de la
 * maintenance) et il est du même ordre que la marge d'incertitude du calcul
 * lui-même — c'est-à-dire qu'il place l'écart maximal d'un enfant à la
 * frontière de ce qu'on sait mesurer. Le dire ainsi est plus honnête que de
 * lui inventer une source.
 */
export const MINOR_MAX_DAILY_DELTA_FRACTION = 0.10;

// ---------------------------------------------------------------------------
// L'AVERTISSEMENT DE PRISE — ce que le slider DIT sans l'interdire
// ---------------------------------------------------------------------------

/**
 * LE SEUIL AU-DELÀ DUQUEL UNE PRISE PART SURTOUT EN GRAS, en kg/semaine.
 *
 * ⚠️ CE N'EST PAS UNE BORNE, ET LA DIFFÉRENCE EST TOUT LE SUJET. Les trois
 * nombres de `ceilingFromBounds` sont des limites DURES: au-delà, le produit
 * refuse. Celui-ci est un AVERTISSEMENT: au-delà, le produit PARLE. §Bloc 2 de
 * la conception, décision humaine du 2026-08-18, mot pour mot — « le slider le
 * DIT, il ne l'interdit pas ».
 *
 * La raison tient en une phrase: prendre plus vite est un choix légitime.
 * Quelqu'un qui sort d'une maladie, qui reprend après une blessure, ou qui
 * assume une prise rapide n'a pas à se voir opposer un curseur qui ne monte
 * pas. Une limite dure déguisée en protection décide à la place de la personne
 * — et le dépôt a déjà payé ce mode d'erreur ailleurs.
 *
 * `0.5` et pas une dérivée d'une bande: ce seuil ne sort d'aucune équation du
 * module, c'est le nombre de la conception. Le dériver de
 * `MAX_SURPLUS_FRACTION` le ferait bouger avec l'enveloppe, alors qu'il décrit
 * une physiologie, pas une exécution.
 */
export const PACE_WARN_UP_KG_PER_WEEK = 0.5;

/** Les avertissements possibles. Nommés, jamais un booléen nu. */
export const PACE_WARNINGS = ["surplus_becomes_fat"] as const;
export type PaceWarning = (typeof PACE_WARNINGS)[number];

/**
 * LA PHRASE, DANS LES DEUX LANGUES.
 *
 * Elle vit ICI et pas dans un pack i18n du front, pour la même raison que
 * `QUESTION_LABELS` de `plan_feedback.ts`: le seuil et son mot sont une seule
 * décision, et les séparer laisse l'un bouger sans l'autre. Le front importe
 * ce module (huit modules de production le font déjà).
 *
 * ⚠️ ELLE DIT CE QUI ARRIVE, PAS CE QU'IL FAUT FAIRE. « part surtout en gras »
 * est un fait sur la composition de la prise; « ralentis » serait une consigne,
 * et une consigne sur le corps de quelqu'un qui a choisi son rythme est
 * exactement ce que cette décision refuse.
 */
export const PACE_WARNING_LABELS: Record<
  PaceWarning,
  { en: string; fr: string }
> = {
  surplus_becomes_fat: {
    en: "Above about 0.5 kg a week, the extra tends to go on as fat rather " +
      "than muscle.",
    fr: "Au-delà d'environ 0,5 kg par semaine, le surplus part surtout en " +
      "gras plutôt qu'en muscle.",
  },
};

/**
 * CE RYTHME MÉRITE-T-IL UNE PHRASE ?
 *
 * `null` = rien à dire. Une PERTE n'en reçoit jamais: elle est déjà tenue par
 * trois bornes dures, et lui ajouter un avertissement en plus d'un refus
 * ferait deux fois le même geste.
 *
 * Le seuil est FRANCHI, pas atteint: à 0,50 pile on ne dit rien — c'est le
 * nombre que la conception qualifie d'« environ », et avertir dessus ferait
 * parler le produit sur le cran qu'il vient lui-même de proposer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function paceWarning(
  direction: ScaleDirection,
  kgPerWeek: number,
): PaceWarning | null {
  if (direction !== "up") return null;
  if (!Number.isFinite(kgPerWeek)) return null;
  return kgPerWeek > PACE_WARN_UP_KG_PER_WEEK ? "surplus_becomes_fat" : null;
}

// ---------------------------------------------------------------------------
// LE PLUS PETIT DES TROIS — isolé, pour que chaque borne ait un cas qui gagne
// ---------------------------------------------------------------------------

/** Laquelle des trois a mordu. Nommée: un nombre nu ne se répare nulle part. */
export const PACE_BOUNDS = [
  "absolute_cap",
  "body_fraction",
  "energy_floor",
] as const;
export type PaceBound = (typeof PACE_BOUNDS)[number];

export interface PaceCeiling {
  /**
   * kg/semaine, arrondi au 0,05 près — voir `roundPace`.
   *
   * ⚠️ IL PEUT VALOIR `0`, ET L'APPELANT DOIT LE TRAITER. Mesuré au balayage:
   * 77 cas sur 72 320 (petits corps sédentaires, en PERTE) rendent un maximum
   * de zéro — le besoin estimé y touche déjà le plancher d'énergie, donc il
   * n'y a aucun rythme de perte disponible. `paceCeilingFor` ne rend PAS
   * `null` dans ce cas: `null` veut dire « je ne connais pas ce corps », et
   * zéro veut dire « je le connais, et il n'a pas de marge ». Les deux
   * appellent des écrans différents.
   *
   * ⚠️ NE PAS AFFICHER UN CURSEUR DE 0,05 À 0 — c'est un contrôle mort, et le
   * dépôt a déjà mesuré trois fois qu'un refus loin du geste se lit comme un
   * bouton mort. La sortie juste est une phrase à la place du curseur: ce
   * corps n'a pas de marge de perte aujourd'hui.
   */
  maxKgPerWeek: number;
  /**
   * Celle des trois qui a décidé.
   *
   * ⚠️ `absolute_cap` N'EST PAS UN CAS D'ÉCRAN COURANT — il ne sort QUE sur
   * une PRISE au-delà de 100 kg (là, le 1 % du poids dépasse le kilo). Sur
   * une PERTE il est INATTEIGNABLE par construction, et ce n'est pas de la
   * dormance: l'écart quotidien y est plafonné par A1 (500 kcal/j), soit
   * 500 × 7 / 7 700 = 0,4545 kg/semaine — la moitié du plafond. Aucun corps
   * ne peut l'atteindre, quel que soit son gabarit.
   *
   * Mesuré sur 72 320 corps (25→250 kg × 4 tailles × 4 genres × 5 crans ×
   * 2 directions × {adulte, mineur}), AVANT l'ouverture de la prise du
   * 2026-08-18: `absolute_cap` gagnait **0** fois, `body_fraction` **1 138**
   * fois (adultes de 25 à 45 kg en perte), `energy_floor` le reste. Un
   * rapport de vérification avait nommé les deux premières « dormantes »: la
   * seconde ne l'était pas, et la première était pire que dormante.
   */
  bound: PaceBound;
  /**
   * L'écart quotidien que ce rythme représente, en kcal. INTERNE.
   *
   * ⚠️ SUR UNE PRISE, CE N'EST PLUS CE QUE L'ENVELOPPE EXÉCUTE. Depuis
   * l'ouverture du 2026-08-18, le slider de prise monte jusqu'à la borne dure
   * pendant que `envelopeCore` plafonne à `MAX_SURPLUS_FRACTION` (+10 %). Ce
   * nombre est l'arithmétique du CRAN CHOISI, pas la promesse du moteur — voir
   * la note de `paceCeilingFor`. Sur une perte, les deux coïncident toujours.
   */
  dailyDeltaKcal: number;
}

/**
 * LE MIN DES TROIS, SUR DES NOMBRES NUS.
 *
 * ── POURQUOI CETTE FONCTION EXISTE SÉPARÉMENT ─────────────────────────────
 * « Une garde a besoin d'un cas qui passe »: cassée, elle bloque tout et
 * ressemble à une garde qui marche. Les trois bornes ne peuvent pas toutes
 * gagner sur un corps réel aujourd'hui (voir l'en-tête), et la tentation
 * serait d'ouvrir une porte de test dans `paceCeilingFor` pour les prouver.
 * Une porte de test est une garde désarmée. Ici, le MIN est une fonction pure
 * de trois nombres: chaque borne y a un cas où elle gagne, prouvé sur la
 * VALEUR rendue, sans qu'aucun appelant réel n'y gagne un paramètre.
 *
 * ⚠️ L'ORDRE DES COMPARAISONS EST LA RÈGLE DES ÉGALITÉS. À égalité stricte, on
 * nomme la borne la plus PROTECTRICE — le plancher d'énergie d'abord, le
 * gabarit ensuite. Nommer le plafond absolu sur une égalité ferait croire que
 * seule une décision produit sépare la personne de son rythme, alors que c'est
 * son corps.
 */
export function ceilingFromBounds(
  absoluteCapKg: number,
  bodyFractionKg: number,
  energyFloorKg: number,
): { maxKgPerWeek: number; bound: PaceBound } {
  const smallest = Math.min(absoluteCapKg, bodyFractionKg, energyFloorKg);
  if (energyFloorKg <= smallest) {
    return { maxKgPerWeek: smallest, bound: "energy_floor" };
  }
  if (bodyFractionKg <= smallest) {
    return { maxKgPerWeek: smallest, bound: "body_fraction" };
  }
  return { maxKgPerWeek: smallest, bound: "absolute_cap" };
}

/**
 * ARRONDI AU 0,05 kg PRÈS, VERS LE BAS.
 *
 * Vers le bas parce qu'un plafond arrondi vers le haut n'est plus un plafond:
 * `Math.round` sur 0,4545 rendrait 0,45 ici mais 0,50 sur 0,4750, c'est-à-dire
 * un rythme que le calcul venait de refuser. Le pas de 0,05 est celui du
 * slider: un maximum de 0,4545 rendrait un cran final que personne ne peut
 * atteindre au doigt.
 */
export function roundPace(kgPerWeek: number): number {
  return Math.floor(kgPerWeek * 20) / 20;
}

// ---------------------------------------------------------------------------
// LE PLAFOND POUR UNE PERSONNE
// ---------------------------------------------------------------------------

/**
 * Ce qu'on sait de la personne au moment de régler le slider.
 *
 * `ageState` est repris de la lecture (`keel_age_state` / `MemberAgeState`) et
 * pas dérivé ici: `MouthBody.ageYears` porte l'âge, mais la borne des
 * dix-huit ans du dépôt vit dans `student_age.ts`, et une seconde arithmétique
 * de dates est toujours celle qu'on oublie d'ajuster.
 */
export interface PaceSubject {
  body: MouthBody;
  isMinor: boolean;
}

/**
 * L'ENTRETIEN ESTIMÉ DE CE CORPS, en kcal/jour — LE DÉNOMINATEUR DE TOUT LE
 * MODULE, écrit une seule fois.
 *
 * ⚠️ EXTRAIT PLUTÔT QUE RECOPIÉ, ET C'EST L'INTÉRÊT. Le choix entre l'équation
 * ADULTE et l'équation PÉDIATRIQUE tient à `isMinor`, jamais à `ageYears` — un
 * corps de douze ans dont la date manque est `unknown`, pas mineur, et la
 * confusion se paierait sur l'assiette d'un enfant. Cette règle vivait en deux
 * exemplaires (`paceCeilingFor`, `executedPaceFor`); un troisième était sur le
 * point de naître chez le conseil du midi, qui a besoin de l'entretien SANS
 * rythme. Trois copies d'un même arbitrage divergent, et c'est celle qu'on
 * regarde le moins qui garde l'ancienne.
 *
 * `null` — jamais un repli — quand le corps ne suffit pas: un entretien deviné
 * dimensionnerait la journée de quelqu'un qui n'existe pas.
 *
 * ⚠️ NON ARRONDI. C'est un dénominateur, pas un nombre à montrer; l'arrondir
 * ici déplacerait tous les facteurs qui en descendent.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function estimatedMaintenanceFor(subject: PaceSubject): number | null {
  const { body, isMinor } = subject;
  const weightKg = body.weightKg;
  if (!weightKg || weightKg <= 0) return null;
  const maintenance = isMinor
    ? estimatedChildMaintenanceKcal({
      weightKg,
      ageYears: body.ageYears,
      gender: body.gender,
      activityLevel: body.activityLevel,
      activityAxes: body.activityAxes,
      appetite: body.appetite,
    })
    : estimatedMaintenanceKcal({
      weightKg,
      heightCm: body.heightCm,
      ageBand: ageBandOf(body.ageYears),
      gender: body.gender,
      activityLevel: body.activityLevel,
      // ⚠️ LE MÊME CORPS, LES MÊMES AXES. C'est le dénominateur de tout
      // l'ancrage; y perdre les axes ferait diverger la cible servie et la
      // cible affichée sans qu'aucun test de module ne le voie.
      activityAxes: body.activityAxes,
      // ⑤ MÊME CHEMIN. C'est le dénominateur de tout l'ancrage: un appétit qui
      // n'arriverait pas jusqu'ici serait un cran coché à l'écran et jeté avant
      // le calcul — le mode d'échec n°1 de ce dépôt.
      appetite: body.appetite,
    });
  return maintenance !== null && maintenance > 0 ? maintenance : null;
}

/**
 * LE PLAFOND DU SLIDER, OU `null`.
 *
 * `null` — jamais un plafond de secours — quand le corps ne suffit pas à
 * estimer un besoin. Un slider dont le maximum serait deviné promettrait une
 * date d'arrivée calculée sur une personne qui n'existe pas; l'appelant doit
 * alors demander le corps, pas afficher un curseur.
 */
export function paceCeilingFor(
  direction: ScaleDirection,
  subject: PaceSubject,
): PaceCeiling | null {
  const { body, isMinor } = subject;
  const weightKg = body.weightKg;
  if (!weightKg || weightKg <= 0) return null;

  const maintenance = estimatedMaintenanceFor(subject);
  if (maintenance === null || maintenance <= 0) return null;

  // ── LA TROISIÈME BORNE, EN kcal/jour ────────────────────────────────────
  // Elle a deux moitiés, et le MIN des deux est ce qui reste exécutable:
  //   · ce qui garde la journée au-dessus du plancher d'énergie;
  //   · ce que l'enveloppe accepte de creuser (A1, non débrayable).
  //
  // ⚠️ UNE PRISE N'EN A PAS, ET C'EST UNE DÉCISION PRODUIT, PAS UN OUBLI.
  // Cette borne existait ici jusqu'au 2026-08-18: elle valait
  // `MAX_SURPLUS_FRACTION × entretien`, et elle RENDAIT INATTEIGNABLE ce que
  // le §Bloc 2 dit d'AUTORISER. Mesuré avant le correctif, sur des corps
  // réels: un adulte de 70-90 kg plafonnait à 0,30 kg/semaine, et 0,5 kg
  // était hors de portée sous ~180 kg. Or la conception dit, mot pour mot:
  //
  //   « Côté prise, au-delà d'environ 0,5 kg/semaine le surplus part surtout
  //     en gras : le slider le DIT, il ne l'interdit pas. »
  //
  // Les TROIS bornes du `MIN` sont des limites dures. Le seuil de 0,5 kg est
  // un AVERTISSEMENT (`paceWarning`), parce que prendre plus vite est un choix
  // légitime que le produit informe au lieu de le refuser. Confondre les deux,
  // c'est décider à la place de quelqu'un en ayant l'air de le protéger.
  //
  // Pour une prise, la troisième borne est donc `Infinity` — il n'y a rien à
  // franchir vers le haut. Ce sont le plafond absolu et le gabarit qui
  // reprennent la main, et c'est le SEUL endroit du module où `absolute_cap`
  // gagne (au-delà de 100 kg, le 1 % du poids dépasse le kilo).
  //
  // ⚠️ CE QUE ÇA DÉCOUPLE, ET QU'IL FAUT LIRE AVANT DE « RÉPARER ». Le rythme
  // que ce slider autorise dépasse désormais ce que `envelopeCore` exécute:
  // la bande `muscle_gain` plafonne à `MAX_SURPLUS_FRACTION` (+10 %), soit
  // ~0,23 kg/semaine sur 2 500 kcal d'entretien. L'écart est ASSUMÉ et il est
  // la contrepartie exacte de la décision ci-dessus. Il appartient à L8 de le
  // refermer — en élargissant la bande de prise, ou en disant la date
  // d'arrivée sur le rythme EXÉCUTÉ. Tant qu'il est ouvert, une date d'arrivée
  // calculée sur un rythme de prise au-delà de +10 % est OPTIMISTE, et c'est
  // écrit ici pour que personne ne la croie exacte.
  // ⚠️ L'ORDRE DES CAS EST UNE GARDE, ET IL A CHANGÉ LE 2026-08-18.
  // `isMinor` passe DEVANT `direction`. Avant, `direction === "up"` était
  // testé en premier, et un mineur en prise recevait donc la borne des
  // adultes — ce qui était sans conséquence tant que cette borne valait
  // `MAX_SURPLUS_FRACTION × entretien` (~0,17 kg/sem sur un enfant à
  // 1 876 kcal). En ouvrant la prise de l'ADULTE jusqu'à la borne dure, le
  // même ordre aurait porté un enfant à 1 kg/semaine.
  //
  // L'ouverture du §Bloc 2 est une décision sur quelqu'un QUI CHOISIT POUR
  // LUI-MÊME. La case d'un mineur est cochée par le compte maître, et ce qui
  // protège l'enfant depuis qu'il porte les trois directions est précisément
  // ce plafond-ci, calculé sur SON besoin. Il reste DUR, dans les deux sens.
  const maxDailyDeltaKcal = isMinor
    ? Math.round(maintenance * MINOR_MAX_DAILY_DELTA_FRACTION)
    : direction === "up"
    ? null
    : Math.min(
      MAX_DAILY_DEFICIT_KCAL,
      Math.round(maintenance - energyFloorFor(body.gender)),
    );

  // Un corps déjà sous son propre plancher n'a aucun rythme de perte
  // disponible, et le dire par `0` plutôt que par un négatif est la seule
  // lecture juste: le slider n'a pas de cran, il ne recule pas.
  const energyFloorKg = maxDailyDeltaKcal === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, (maxDailyDeltaKcal * 7) / KCAL_PER_KG_BODY_MASS);

  const picked = ceilingFromBounds(
    MAX_KG_PER_WEEK,
    weightKg * MAX_WEEKLY_BODY_FRACTION,
    energyFloorKg,
  );
  const maxKgPerWeek = roundPace(picked.maxKgPerWeek);
  return {
    maxKgPerWeek,
    bound: picked.bound,
    // L'écart RÉEL du rythme rendu, pas celui d'avant l'arrondi: c'est ce
    // nombre-là que le lot L8 traduira en grammages, et il doit correspondre au
    // cran que la personne voit.
    dailyDeltaKcal: Math.round(
      (maxKgPerWeek * KCAL_PER_KG_BODY_MASS) / 7,
    ),
  };
}

/** Le plancher adulte, avec la moyenne pour `other` et pour l'absence. */
export function energyFloorFor(
  gender: "male" | "female" | "other" | null,
): number {
  if (gender === "male") return ENERGY_FLOOR_KCAL.male;
  if (gender === "female") return ENERGY_FLOOR_KCAL.female;
  return ENERGY_FLOOR_KCAL.other;
}

// ---------------------------------------------------------------------------
// LE POIDS VISÉ
// ---------------------------------------------------------------------------

/** Pourquoi un poids visé est refusé. Nommé, jamais un `false` nu. */
export const TARGET_WEIGHT_REFUSALS = [
  /** Hors des bornes de plausibilité du dépôt (25-400 kg). */
  "implausible",
  /** Il va dans le sens contraire de la direction choisie. */
  "wrong_direction",
  /** Il passerait le besoin quotidien sous le plancher d'énergie. */
  "below_energy_floor",
] as const;
export type TargetWeightRefusal = (typeof TARGET_WEIGHT_REFUSALS)[number];

/**
 * LES MÊMES BORNES DE PLAUSIBILITÉ QUE PARTOUT — `energy_target.ts` les porte
 * pour la fourchette, le point hebdo pour la pesée. Recopiées ici, elles se
 * mettraient à diverger; importées, elles restent le même refus.
 *
 * ⚠️ CE COMMENTAIRE A DÉCRIT UN IMPORT PENDANT QUE LE CODE RECOPIAIT. Corrigé
 * par le lot `X1′` (2026-08-22): la phrase ci-dessus était juste, la ligne
 * en-dessous disait le contraire, et pendant ce temps `student_body_io.ts`
 * portait 350. Elles sont maintenant réellement importées de
 * `weight_bounds.ts`.
 */
import {
  WEIGHT_KG_MAX as TARGET_WEIGHT_KG_MAX,
  WEIGHT_KG_MIN as TARGET_WEIGHT_KG_MIN,
} from "./weight_bounds.ts";
export { TARGET_WEIGHT_KG_MAX, TARGET_WEIGHT_KG_MIN };

/**
 * LE POIDS VISÉ EST-IL ACCEPTABLE ?
 *
 * ⚠️ LE REFUS EST NOMMÉ, JAMAIS SILENCIEUX. Le §Bloc 2 de la conception le dit
 * de ce champ précisément: c'est le plus sensible du formulaire. Un poids visé
 * rejeté sans phrase se lit comme un bouton mort — cicatrice mesurée trois
 * fois dans `SetupPage` — et celui-ci se rejette au moment exact où quelqu'un
 * vient d'écrire un nombre qui compte pour lui.
 *
 * ⚠️ LE PLANCHER MORD AUSSI POUR UN MINEUR, ET SUR SON ÂGE. `paceCeilingFor`
 * porte la même asymétrie: c'est la même décision, appliquée à la cible plutôt
 * qu'au rythme.
 */
export function targetWeightRefusal(
  direction: ScaleDirection,
  currentKg: number,
  targetKg: number,
  subject: PaceSubject,
): TargetWeightRefusal | null {
  if (
    !Number.isFinite(targetKg) || targetKg < TARGET_WEIGHT_KG_MIN ||
    targetKg > TARGET_WEIGHT_KG_MAX
  ) {
    return "implausible";
  }
  if (direction === "down" && targetKg >= currentKg) return "wrong_direction";
  if (direction === "up" && targetKg <= currentKg) return "wrong_direction";
  // ⚠️ UN MINEUR SORT ICI, AVANT TOUT CALCUL, ET C'EST LE BON ORDRE.
  // Il n'a pas de plancher FIXE à franchir: son besoin estimé est déjà calculé
  // sur son âge, et la borne qui le protège est la fraction de
  // `paceCeilingFor`. Lui opposer 1 200 kcal ferait refuser une cible
  // parfaitement ordinaire à un enfant de vingt-cinq kilos.
  //
  // ⚠️ ET LE SORTIR AVANT LE CALCUL N'EST PAS COSMÉTIQUE. La première version
  // calculait son besoin pédiatrique PUIS renvoyait `null` sans jamais le
  // lire — du code mort qui ressemblait à une garde. Une mutation de ce calcul
  // (lire le poids ACTUEL au lieu du poids VISÉ) ne faisait rougir aucun test,
  // ce qui est la signature exacte d'une branche qui ne décide rien.
  if (subject.isMinor) return null;

  // Seule une PERTE peut passer sous un plancher. On mesure le besoin AU POIDS
  // VISÉ, pas au poids actuel: c'est le corps d'arrivée qui devra vivre avec.
  if (direction === "down") {
    const atTarget = estimatedMaintenanceKcal({
      weightKg: targetKg,
      heightCm: subject.body.heightCm,
      ageBand: ageBandOf(subject.body.ageYears),
      gender: subject.body.gender,
      activityLevel: subject.body.activityLevel,
      activityAxes: subject.body.activityAxes,
      appetite: subject.body.appetite,
    });
    // Corps inconnu: on n'a rien à opposer, et refuser sur une ignorance
    // serait bloquer quelqu'un dont on ne sait rien. Les autres gardes
    // (plausibilité, direction) ont déjà parlé.
    if (atTarget === null) return null;
    if (atTarget < energyFloorFor(subject.body.gender)) {
      return "below_energy_floor";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// L8 — LE RYTHME EXÉCUTÉ, par opposition au rythme AUTORISÉ
// ---------------------------------------------------------------------------

/** Qui a décidé du rythme exécuté. Nommé: un nombre nu ne se répare nulle part. */
export const EXECUTED_PACE_CLAMPS = [
  /** Le cran choisi passe tel quel: le moteur l'exécute en entier. */
  "chosen",
  /** La bande `muscle_gain` (+10 %) — une PRISE d'adulte, et elle seule. */
  "surplus_band",
  /** A1, `MAX_DAILY_DEFICIT_KCAL` — une PERTE d'adulte. */
  "deficit_cap",
  /** Le plancher d'énergie de ce corps — une PERTE d'adulte. */
  "energy_floor",
  /** La fraction du besoin d'un MINEUR, dans les deux sens. */
  "minor_fraction",
] as const;
export type ExecutedPaceClamp = (typeof EXECUTED_PACE_CLAMPS)[number];

export interface ExecutedPace {
  /**
   * kg/semaine que la composition sait RÉELLEMENT livrer. ≤ le cran choisi,
   * toujours.
   *
   * ⚠️ NON ARRONDI, ET C'EST VOULU. `roundPace` est le pas du CURSEUR (0,05) et
   * il arrondit vers le bas; l'appliquer ici ferait passer 0,23 à 0,20, soit
   * 15 % de pessimisme fabriqué sur une date d'arrivée. Le rythme exécuté n'est
   * pas un cran qu'on montre au doigt, c'est une grandeur qu'on divise.
   */
  kgPerWeek: number;
  /** L'écart quotidien EXÉCUTÉ, en kcal, toujours ≥ 0. */
  dailyDeltaKcal: number;
  /** L'entretien estimé de ce corps, en kcal/jour. Le dénominateur du facteur. */
  maintenanceKcal: number;
  /** Laquelle des quatre bornes a décidé, ou `chosen`. */
  clampedBy: ExecutedPaceClamp;
}

/**
 * CE QUE LE MOTEUR EXÉCUTE VRAIMENT AU RYTHME CHOISI.
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE N'EST PAS ───────────────
 * `paceCeilingFor` répond « jusqu'où le curseur a le droit de monter ».
 * Celle-ci répond « et une fois monté là, qu'est-ce que la casserole fait ».
 * Sur une PERTE les deux coïncident (les trois bornes du curseur incluent déjà
 * A1 et le plancher). Sur une PRISE elles divergent de construction depuis
 * l'ouverture du §Bloc 2, et c'est précisément l'écart que ce module annonçait
 * à refermer.
 *
 * ⛔ ELLE NE REND AUCUN NOMBRE DESTINÉ À ÊTRE LU. `dailyDeltaKcal` et
 * `maintenanceKcal` sont des grandeurs de CALCUL: elles servent à dériver un
 * facteur de grammage (`household_portions.ts`, lot L8) et une durée. Les
 * afficher serait la cible chiffrée que `energy_target.ts` refuse de servir à
 * qui n'a pas traversé les cinq portes.
 *
 * `null` — jamais un repli — quand le corps ne suffit pas à estimer un besoin,
 * exactement comme `paceCeilingFor`: un facteur deviné dimensionnerait la
 * boîte de quelqu'un qui n'existe pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function executedPaceFor(
  direction: ScaleDirection,
  subject: PaceSubject,
  chosenKgPerWeek: number,
): ExecutedPace | null {
  const { body, isMinor } = subject;
  const weightKg = body.weightKg;
  if (!weightKg || weightKg <= 0) return null;
  if (!Number.isFinite(chosenKgPerWeek) || chosenKgPerWeek <= 0) return null;

  const maintenance = estimatedMaintenanceFor(subject);
  if (maintenance === null || maintenance <= 0) return null;

  // ⚠️ L'ORDRE EST CELUI DE `paceCeilingFor`, ET POUR LA MÊME RAISON: `isMinor`
  // passe DEVANT `direction`. Un mineur en prise recevrait sinon la bande de
  // l'adulte, c'est-à-dire, depuis l'ouverture du 2026-08-18, un surplus calculé
  // sur autre chose que son propre besoin.
  const cap: { kcal: number; clamp: ExecutedPaceClamp } = isMinor
    ? {
      kcal: maintenance * MINOR_MAX_DAILY_DELTA_FRACTION,
      clamp: "minor_fraction",
    }
    : direction === "up"
    ? { kcal: maintenance * MAX_SURPLUS_FRACTION, clamp: "surplus_band" }
    // Sur une PERTE, deux plafonds, et on nomme celui qui gagne. A1 est
    // non débrayable; le plancher est propre à ce corps. À égalité stricte, on
    // nomme le PLANCHER — même règle que `ceilingFromBounds`: la borne la plus
    // protectrice d'abord, parce qu'elle dit « c'est ton corps », pas « c'est
    // une décision produit ».
    : (() => {
      const floorRoom = maintenance - energyFloorFor(body.gender);
      return floorRoom <= MAX_DAILY_DEFICIT_KCAL
        ? { kcal: floorRoom, clamp: "energy_floor" as ExecutedPaceClamp }
        : { kcal: MAX_DAILY_DEFICIT_KCAL, clamp: "deficit_cap" as ExecutedPaceClamp };
    })();

  const wantedDailyKcal = (chosenKgPerWeek * KCAL_PER_KG_BODY_MASS) / 7;
  // Un corps déjà sous son propre plancher rend `0`, jamais un négatif: le
  // moteur n'exécute alors AUCUN écart, ce qui est la lecture juste. Même
  // arbitrage que `energyFloorKg` dans `paceCeilingFor`.
  const capped = Math.max(0, cap.kcal);
  const dailyDeltaKcal = Math.min(wantedDailyKcal, capped);
  return {
    kgPerWeek: (dailyDeltaKcal * 7) / KCAL_PER_KG_BODY_MASS,
    dailyDeltaKcal: Math.round(dailyDeltaKcal),
    maintenanceKcal: Math.round(maintenance),
    clampedBy: wantedDailyKcal <= capped ? "chosen" : cap.clamp,
  };
}

/**
 * ① — LE RYTHME EXÉCUTÉ DE QUELQU'UN QUI NE VISE RIEN. Zéro écart, et son
 * entretien.
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE N'AUTORISE PAS ──────────
 * `eatingOutAdvice` accepte `direction: null` en toutes lettres — « `null` =
 * maintenance: la cible EST l'entretien » — mais il exige un `ExecutedPace`, et
 * `executedPaceFor` ne peut pas en produire un sans direction NI cran. Sans ce
 * chemin-ci, le conseil du midi ne parlerait qu'aux gens qui ont un objectif ET
 * un rythme réglé: la majorité de la base ne recevrait jamais rien, et le lot
 * ressemblerait trait pour trait à un lot qui marche.
 *
 * ⛔ ELLE NE DIMENSIONNE AUCUN GRAMMAGE. `clampedBy: "chosen"` avec un écart
 * NUL veut dire « le moteur n'exécute rien »: `mouthTargetFactor` nomme déjà ce
 * cas `no_pace` et refuse d'en tirer un facteur. Cette fonction sert à
 * RÉPARTIR un entretien sur une journée déclarée, jamais à le déplacer.
 *
 * `null` quand le corps ne suffit pas — même règle que ses deux voisines.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function maintenancePaceFor(subject: PaceSubject): ExecutedPace | null {
  const maintenance = estimatedMaintenanceFor(subject);
  if (maintenance === null || maintenance <= 0) return null;
  return {
    kgPerWeek: 0,
    dailyDeltaKcal: 0,
    maintenanceKcal: Math.round(maintenance),
    clampedBy: "chosen",
  };
}

// ---------------------------------------------------------------------------
// ③ — LE CURSEUR SATURE, ET RIEN NE LE DISAIT
// ---------------------------------------------------------------------------

/**
 * CE QUE CE BLOC RÉPARE, ET CE QU'IL NE RÉPARE PAS.
 *
 * ⛔ CE N'EST PAS UN BUG À CORRIGER. `paceCeilingFor` laisse délibérément une
 * PRISE monter jusqu'à la borne dure (« le slider le DIT, il ne l'interdit
 * pas », §Bloc 2), pendant qu'`executedPaceFor` la plafonne à
 * `MAX_SURPLUS_FRACTION` (+10 %). L'écart est ASSUMÉ, daté, et il repose sur
 * une borne physiologique (Helms 2023): au-delà de +10 % d'excédent, le surplus
 * ne construit plus de muscle, il s'ajoute autrement. On ne l'élargit pas.
 *
 * ⚠️ CE QUI ÉTAIT CASSÉ EST LE SILENCE. Mesuré le 2026-08-18 sur des corps
 * réels — femme de 60 kg, 165 cm, 28 ans, sédentaire, en prise:
 *
 *     cran 0,15  →  165 kcal/jour d'écart exécuté   (`chosen`)
 *     cran 0,20  →  196 kcal/jour                   (`surplus_band`)
 *     cran 0,40  →  196 kcal/jour                   (`surplus_band`)
 *     cran 0,60  →  196 kcal/jour                   (`surplus_band`)
 *
 * Son curseur monte jusqu'à 0,60. Les deux tiers de sa course ne changent
 * RIEN — pas un gramme dans une boîte, pas une ligne dans un plan — et l'écran
 * ne le dit nulle part. Quelqu'un pousse à 1,0 en croyant accélérer, ne voit
 * aucune différence dans son assiette, et n'a aucun moyen de savoir si c'est le
 * produit qui l'ignore ou son corps qui plafonne.
 *
 * ── POURQUOI UN JETON À PART, ET PAS UNE SIXIÈME VALEUR DE `paceWarning` ───
 * Les deux phrases sont vraies EN MÊME TEMPS au-delà de 0,5 kg/semaine sur un
 * grand corps: « le surplus part surtout en gras » (physiologie) et « l'assiette
 * ne bouge plus » (exécution). `paceWarning` rend UN jeton; y ajouter celui-ci
 * ferait taire l'autre, et c'est celui qui parle du corps qu'on perdrait.
 *
 * ── ET POURQUOI CE N'EST PAS UN SEUIL EN kg/SEMAINE ───────────────────────
 * Il n'y en a pas: le point de saturation est `MAX_SURPLUS_FRACTION × entretien`,
 * donc il dépend du corps — 0,178 kg/sem sur la femme ci-dessus, 0,341 sur un
 * homme de 90 kg qui s'entraîne. Un nombre figé dans une constante serait faux
 * pour tout le monde sauf pour le corps qui l'a inspiré. On pose donc la
 * question à `executedPaceFor` lui-même, et la réponse est exacte par
 * construction: si le cran choisi n'est pas exécuté, il sature.
 */
export const PACE_SATURATIONS = ["plate_stops_changing"] as const;
export type PaceSaturation = (typeof PACE_SATURATIONS)[number];

/**
 * LA PHRASE, DANS LES DEUX LANGUES.
 *
 * Elle vit ICI, à côté du seuil qui la déclenche, pour la même raison que
 * `PACE_WARNING_LABELS` vingt lignes plus haut: le nombre et le mot qui
 * l'encadre sont une seule décision, et les séparer laisse l'un bouger sans
 * l'autre.
 *
 * ⚠️ ELLE DIT CE QUI ARRIVE, PAS CE QU'IL FAUT FAIRE — même règle que sa
 * voisine. « Redescends le curseur » serait une consigne sur le corps de
 * quelqu'un qui a choisi son rythme; « l'assiette ne change plus » est un fait
 * sur ce que le plan produit, et la personne décide.
 *
 * ⚠️ ELLE NE CITE AUCUN kcal, ET C'EST LA CLAUSE C5. Le point de saturation est
 * une grandeur d'énergie par bouche (`MAX_SURPLUS_FRACTION × entretien`); la
 * nommer en chiffre ici la ferait sortir sans avoir traversé la moindre porte,
 * à côté d'un curseur que le compte maître règle pour QUELQU'UN D'AUTRE. La
 * phrase parle donc de l'assiette, qui est ce que la personne voit.
 */
export const PACE_SATURATION_LABELS: Record<
  PaceSaturation,
  { en: string; fr: string }
> = {
  plate_stops_changing: {
    en: "From this setting on, the plate stops changing: the plan can only " +
      "add so much in a day, and moving the slider higher puts nothing more " +
      "on it.",
    fr: "À partir de ce cran, l'assiette ne change plus : le plan ne peut " +
      "ajouter qu'une quantité limitée par jour, et monter le curseur plus " +
      "haut n'y met rien de plus.",
  },
};

/**
 * CE CRAN CHANGE-T-IL ENCORE QUELQUE CHOSE ?
 *
 * `null` = oui, il est exécuté tel quel — et c'est le CAS QUI PASSE, celui sans
 * lequel cette fonction ressemblerait à une garde qui marche tout en parlant
 * partout. Sur une PERTE et sur un MINEUR, `paceCeilingFor` borne déjà le
 * curseur exactement là où `executedPaceFor` plafonne: la phrase ne s'y affiche
 * jamais, mesuré, et ce n'est pas de la dormance — c'est la même borne lue deux
 * fois.
 *
 * ⚠️ ON INTERROGE `executedPaceFor`, ON NE RECOPIE PAS SON PLAFOND. Une seconde
 * arithmétique de `MAX_SURPLUS_FRACTION` diverge le jour où la bande bouge, et
 * c'est celle qu'on regarde le moins qui garderait l'ancienne — après quoi
 * l'écran dirait « ça ne change plus » sur un cran qui change, ou se tairait sur
 * un cran qui ne change pas.
 *
 * `null` aussi quand le corps ne suffit pas: on ne dit rien plutôt que de
 * décrire l'assiette de quelqu'un qu'on ne sait pas estimer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function paceSaturation(
  direction: ScaleDirection,
  subject: PaceSubject,
  kgPerWeek: number,
): PaceSaturation | null {
  if (!Number.isFinite(kgPerWeek) || kgPerWeek <= 0) return null;
  const executed = executedPaceFor(direction, subject, kgPerWeek);
  if (executed === null) return null;
  return executed.clampedBy === "chosen" ? null : "plate_stops_changing";
}

/**
 * COMBIEN DE SEMAINES, AU RYTHME CHOISI — la date d'arrivée du §Bloc 2.
 *
 * `null` quand le rythme est nul ou que la cible est déjà atteinte: « tu y es
 * dans 0 semaine » et « ce rythme ne mène nulle part » ne se disent pas de la
 * même façon, et fabriquer une date sur un rythme nul produirait l'infini.
 *
 * ⚠️ ARRONDI AU SUPÉRIEUR. Une date d'arrivée annoncée trop tôt est une
 * déception programmée; annoncée trop tard, elle est une bonne surprise. La
 * direction de l'erreur est choisie, comme celle de `KCAL_PER_KG_BODY_MASS`.
 */
export function weeksToTarget(
  currentKg: number,
  targetKg: number,
  paceKgPerWeek: number,
): number | null {
  if (!(paceKgPerWeek > 0)) return null;
  const gap = Math.abs(targetKg - currentKg);
  if (gap <= 0) return null;
  return Math.ceil(gap / paceKgPerWeek);
}

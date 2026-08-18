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
 * ⚠️ CE QUI EST DORMANT AUJOURD'HUI, ET IL FAUT LE DIRE. La troisième borne
 * est presque toujours la plus serrée pour une PERTE, parce qu'elle intègre le
 * plafond de déficit A1 (`MAX_DAILY_DEFICIT_KCAL`, 500 kcal/j, non
 * débrayable) — c'est-à-dire ce que l'enveloppe exécutera réellement. Les deux
 * premières bornes ne mordent donc pas sur un adulte moyen. Elles ne sont pas
 * décoratives pour autant: ce sont elles qui tiennent le jour où A1 bouge, et
 * `ceilingFromBounds` est testée bord par bord pour que chacune ait un cas où
 * elle gagne. On préfère écrire « dormante » que fabriquer un cas passant.
 *
 * ── L'INVARIANT QUI JUSTIFIE D'AVOIR MIS A1 DANS LE SLIDER ────────────────
 * **Le maximum du slider est le rythme le plus rapide que la composition sait
 * réellement livrer.** Un slider qui monterait plus haut ferait une promesse
 * que `envelopeCore` refuserait d'exécuter — et la date d'arrivée calculée
 * dessus (« à 0,5 kg/semaine, tu y es vers le 12 novembre ») serait fausse dès
 * le premier jour. Une date fausse est pire qu'une absence de date.
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
  /** kg/semaine, arrondi au 0,05 près — voir `roundPace`. */
  maxKgPerWeek: number;
  /** Celle des trois qui a décidé. */
  bound: PaceBound;
  /** L'écart quotidien que ce rythme représente, en kcal. INTERNE. */
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

  const maintenance = isMinor
    ? estimatedChildMaintenanceKcal({
      weightKg,
      ageYears: body.ageYears,
      gender: body.gender,
      activityLevel: body.activityLevel,
    })
    : estimatedMaintenanceKcal({
      weightKg,
      heightCm: body.heightCm,
      ageBand: ageBandOf(body.ageYears),
      gender: body.gender,
      activityLevel: body.activityLevel,
    });
  if (maintenance === null || maintenance <= 0) return null;

  // ── LA TROISIÈME BORNE, EN kcal/jour ────────────────────────────────────
  // Elle a deux moitiés, et le MIN des deux est ce qui reste exécutable:
  //   · ce qui garde la journée au-dessus du plancher d'énergie;
  //   · ce que l'enveloppe accepte de creuser (A1, non débrayable).
  // Pour une PRISE, il n'y a pas de plancher à franchir — la borne est le
  // surplus au-delà duquel on gagne des plis cutanés plutôt que du muscle
  // (`MAX_SURPLUS_FRACTION`, lu dans la bande, jamais recopié).
  const maxDailyDeltaKcal = direction === "up"
    ? Math.round(maintenance * MAX_SURPLUS_FRACTION)
    : isMinor
    ? Math.round(maintenance * MINOR_MAX_DAILY_DELTA_FRACTION)
    : Math.min(
      MAX_DAILY_DEFICIT_KCAL,
      Math.round(maintenance - energyFloorFor(body.gender)),
    );

  // Un corps déjà sous son propre plancher n'a aucun rythme de perte
  // disponible, et le dire par `0` plutôt que par un négatif est la seule
  // lecture juste: le slider n'a pas de cran, il ne recule pas.
  const energyFloorKg = Math.max(
    0,
    (maxDailyDeltaKcal * 7) / KCAL_PER_KG_BODY_MASS,
  );

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
 */
export const TARGET_WEIGHT_KG_MIN = 25;
export const TARGET_WEIGHT_KG_MAX = 400;

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

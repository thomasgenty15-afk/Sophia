/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PART D'UNE PERSONNE, CALCULÉE — 2026-09-07
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, lot 2.
 *
 * ── LE RENVERSEMENT ───────────────────────────────────────────────────────
 * Aujourd'hui le MODÈLE écrit les grammes de chaque boîte à partir de faits de
 * corps qu'on lui donne, et le moteur MESURE l'écart sans rien appliquer
 * (`applied:false`, `would_resize`). Un plat sans boîte ne compte pas du tout.
 *
 * La méthode nouvelle inverse les rôles: le modèle écrit UNE RECETTE STANDARD
 * (une portion, sans corps, sans boîte) et l'ALGORITHME multiplie. Ce module
 * porte toute l'arithmétique de cette multiplication.
 *
 * ── CE LOT NE FAIT QUE MESURER ────────────────────────────────────────────
 * Rien n'est appliqué au lot 2: le calcul tourne sur la recette telle qu'elle
 * sort AUJOURD'HUI, et n'écrit que le journal. L'application est le lot 4.
 *
 * ⛔ CE QUE CE MODULE NE FAIT PAS, ET NE FERA JAMAIS: ajouter un aliment. Il
 * multiplie ce que le modèle a écrit; un terme qui n'était pas en entrée ne
 * peut pas être en sortie. Un test le tient.
 *
 * ⛔ CE QU'IL NE RÉÉCRIT PAS NON PLUS: le partage de la journée entre les
 * moments. `slotPlanTargets` (`mouth_anchor.ts`) fait autorité et porte déjà
 * le moment léger et le retrait des apports fixes. Une seconde écriture de
 * cette arithmétique divergerait de la première au premier ajustement — c'est
 * la règle que son propre commentaire énonce.
 *
 * PURE: no I/O, no clock, no randomness.
 */

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 2e DU DÉCOUPAGE — CINQ MODULES SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique :
//   · ③ les bornes de l'assiette, et le bloc « l'appétit
//     revient ici » qui ouvrait ce fichier          → `portion_plate_bounds.ts`
//   · ③ bis le couloir de densité, avec
//     `REPAIR_DENSITY_HEADROOM` (⑦), `MAX_ASKABLE_DENSITY_PER_100G` et
//     `DENSITY_INCOMPATIBILITIES` (⑨)                → `portion_density_corridor.ts`
//   · ① la garde, ② la part standard, ④ le dimensionnement, ⑤ les
//     compteurs, et `potFactorOf` (⑥)               → `portion_sizing_core.ts`
//   · ⑥ l'application, ⑥ bis la mesure finale       → `portion_sizing_apply.ts`
//   · ⑦ la réparation, ⑪ le plat dédié, ⑬ le complément → `portion_sizing_repair.ts`
// Restent ici : ⑧ la cible du jour, ⑨ ⑩ la densité requise (`mergeCorridors`,
// `relaxDayForCorridors`), et la redistribution (`redistributeDayBudget`).
// Tout est ré-exporté ici : aucun appelant ne change d'import. Les tests qui
// lisent le TEXTE de ce fichier lisent la famille entière
// (`scripts/source-families.json`). Aucun des cinq modules n'importe ce
// fichier.

import {
  type AnchorMouth,
  type AnchorReason,
  goalGapKcalOf,
  maintenanceKcalOf,
  slotPlanTargets,
  withPortionCran,
} from "./mouth_anchor.ts";
// ⟳ 2026-09-10 — LE PLANCHER D'ÉNERGIE DE CE CORPS, POUR LE CRAN À LA BAISSE.
// `withPortionCran` le REÇOIT plutôt que de le lire: ce module-ci a la bouche
// sous la main, pas `mouth_anchor`. Deux lectures du même plancher divergent.
import { energyFloorFor } from "./weight_pace.ts";
import type { CountingStance } from "./energy_gate.ts";
import { RESTRICTION_FLOOR_SIZES_MAINTENANCE } from "./portion_sizing_core.ts";
import {
  type DensityCorridor,
  type DensityIncompatibility,
  MAX_ASKABLE_DENSITY_PER_100G,
} from "./portion_density_corridor.ts";

export {
  hardCeilingBoundsFor,
  PERSONAL_PLATE_MAX_G_PER_KCAL,
  PERSONAL_PLATE_MAX_HIGHEST_G,
  PERSONAL_PLATE_MAX_LOWEST_G,
  PERSONAL_PLATE_MIN_HIGHEST_G,
  PERSONAL_PLATE_MIN_LOWEST_G,
  PERSONAL_PLATE_MIN_SHARE_OF_MAX,
  personalPlateBoundsFor,
  PLATE_BOUND_BANDS,
  PLATE_BOUND_SOURCES,
  PLATE_HARD_CEILING_G,
  PLATE_MASS_BOUNDS_G,
  PLATE_MEAL_SLOTS,
  plateBandOf,
  plateBoundsFor,
  plateSlotClassOf,
} from "./portion_plate_bounds.ts";
export type {
  PersonalPlateBounds,
  PlateBoundBand,
  PlateBounds,
  PlateBoundSource,
  PlateSlotClass,
} from "./portion_plate_bounds.ts";
export {
  DENSITY_INCOMPATIBILITIES,
  densityCorridorFor,
  MAX_ASKABLE_DENSITY_PER_100G,
  REPAIR_DENSITY_HEADROOM,
  TEMPLATE_DISH_KCAL_PER_100G,
} from "./portion_density_corridor.ts";
export type {
  DensityCorridor,
  DensityIncompatibility,
} from "./portion_density_corridor.ts";
export {
  clampToBounds,
  drawsByPreparation,
  HOUSEHOLD_MAX_MOUTHS,
  LID_KINDS,
  lidPlanFor,
  MISSING_PREPARATION_GAP,
  PORTION_SIZING_MAX_MOUTHS,
  potFactorAcross,
  potFactorOf,
  RESTRICTION_FLOOR_SIZES_MAINTENANCE,
  SHADOW_SIZING_AT_N,
  SHOPPING_RESCALE_TOLERANCE,
  sizeDishForEaters,
  sizeDishForMouth,
  SIZING_PATH_REASONS,
  SIZING_VERDICTS,
  sizingCounters,
  sizingPathFor,
  standardPortionOf,
  UNMEASURABLE_PORTION_FACTOR,
  UNNAMED_ENERGY_GAP,
} from "./portion_sizing_core.ts";
export type {
  EaterAtDish,
  LidKind,
  LidPlan,
  SizedDish,
  SizedForEater,
  SizingCounters,
  SizingPath,
  SizingPathReason,
  SizingVerdict,
  StandardPortion,
} from "./portion_sizing_core.ts";
export {
  applyCounts,
  applySizing,
  applySizingForEaters,
  FINAL_PORTION_REASONS,
  finalPortionCheck,
  FRESH_ITEM_CRUMB_BELOW_G,
  partFactorOf,
  RECIPE_SHARE_REASONS,
  recipeShareReasonFor,
} from "./portion_sizing_apply.ts";
export type {
  ApplyCounts,
  EaterRowForApply,
  FinalPortionCheck,
  FinalPortionReason,
  FinalPortionRow,
  RecipeShareReason,
  SizingRowForApply,
  StarchSideServing,
} from "./portion_sizing_apply.ts";
export {
  absorbDishInto,
  absorbIndexInto,
  COMPLEMENT_PLATE_SHARE,
  complementAskFor,
  DEDICATED_DISH_HEAD,
  DEDICATED_REPAIR_MAX_PER_PLAN,
  dedicatedDishInstruction,
  dedicatedDishLine,
  dedicatedRepairFor,
  freshUnitOf,
  potRepairability,
  REPAIR_CALLS_PER_DISH,
  REPAIR_MAX_DISHES_PER_PLAN,
  REPAIR_MIN_MASS_SURVIVAL,
  REPAIR_MINOR_NEVER_LIGHTEN,
  REPAIR_REASONS,
  REPAIR_RETRY_MIN_UNMET_KCAL,
  REPAIR_SHARED_LIGHTEN_REQUIRES_ALL,
  repairabilityOf,
  repairDecision,
  repairDecisionForDish,
  repairDishInstructionLines,
  repairIdentityHeld,
  repairInstruction,
  splitPlateWithComplement,
} from "./portion_sizing_repair.ts";
export type {
  DedicatedRepair,
  PlateSplit,
  Repairability,
  RepairAsk,
  RepairAskForDish,
  RepairDirection,
  RepairDishInput,
  RepairIngredient,
  RepairPot,
  RepairReason,
} from "./portion_sizing_repair.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA CIBLE DU JOUR — et le plancher TCA (lot 6)
// ═══════════════════════════════════════════════════════════════════════════

export const DAY_TARGET_GAP_CLOSED = ["restriction_floor", "none"] as const;
export type DayTargetGapClosed = (typeof DAY_TARGET_GAP_CLOSED)[number];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE PERSONNE MANGE DANS SA JOURNÉE — l'entretien dimensionne TOUJOURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA DIFFÉRENCE AVEC `mouthTargetKcal` TIENT EN UNE LIGNE, et c'est le lot 6.
 * Sous plancher TCA (`restriction: "raised"`), `mouthTargetKcal` rend `null` —
 * elle refuse de dire un objectif, ce qui est juste, car c'est SA question.
 * Ici la question n'est pas la même: **combien mettre dans l'assiette**.
 *
 * ⚠️ REFUSER DE DIMENSIONNER NE PROTÈGE PERSONNE. Une assiette non dimensionnée
 * n'est pas une assiette neutre: c'est la recette du modèle servie telle quelle,
 * c'est-à-dire une quantité tirée au sort. Quelqu'un dont le plancher est levé
 * reçoit alors, au hasard, trop ou pas assez — et « pas assez » est très
 * exactement le sens d'erreur qu'un plancher TCA existe pour empêcher.
 *
 * ⛔ CE QUI RESTE FERMÉ, ET NE DOIT PAS BOUGER:
 *   · L'ÉCART D'OBJECTIF. Sous plancher, `goalGapKcalOf` rend zéro (la chaîne
 *     ①②③ le ferme déjà): la cible EST l'entretien. Aucun déficit n'est ouvert.
 *   · L'AFFICHAGE. `canShowEnergy` et `decideBoxEnergy` ne sont pas touchés —
 *     la boîte se dimensionne, son chiffre ne se montre pas.
 *   · `restriction: "unreadable"`. « Plancher levé » est une décision connue;
 *     « on n'a pas su lire » est une ignorance, et sur une ignorance on
 *     s'abstient. `maintenanceKcalOf` ferme.
 *
 * ⚠️ LE RETOUR ARRIÈRE EST UNE CONSTANTE: `RESTRICTION_FLOOR_SIZES_MAINTENANCE`
 * à `false` referme tout, sans toucher une ligne de câblage.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayTargetFor(
  mouth: AnchorMouth,
  coachCounting: CountingStance,
): {
  kcal: number | null;
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
} {
  const base = maintenanceKcalOf(mouth);
  if (base.kcal === null) return { ...base, gapClosed: "none" };
  const goal = goalGapKcalOf(mouth, coachCounting);
  if (goal.reason !== null) {
    return { kcal: null, reason: goal.reason, gapClosed: "none" };
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — LE CRAN DE PART ARRIVE ENFIN ICI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL ÉTAIT PASSÉ EN ARGUMENT ET LU PAR PERSONNE. Les deux appelants de
  // cette fonction (`generate-household-meal-v1`, à une bouche et à N) lui
  // remplissent `portionIndex` sous un commentaire qui dit, mot pour mot, que
  // « sans lui, un "ma mère ne mange pas autant" s'écrit en mémoire et ne
  // déplace aucune assiette ». C'était vrai — et le champ ne servait à rien:
  // `mouthTargetKcal` appliquait le cran, `dayTargetFor` ne l'appliquait pas,
  // et c'est `dayTargetFor` qui dimensionne sous `portion_v1`.
  //
  // ⛔ LA TRADUCTION N'EST PAS RECOPIÉE. `withPortionCran` (`mouth_anchor.ts`)
  // est le SEUL endroit qui traduise une position en facteur; deux écritures
  // du même adverbe divergent, et ce dépôt en porte déjà la cicatrice.
  //
  // ⚠️ ET LE PLANCHER SUIT LE CRAN, SUR LA BAISSE. `energyFloorFor(gender)` —
  // le même que partout ailleurs, jamais un nombre inventé ici. Un corps sans
  // sexe lisible rend `null` et **on ne rabat rien**: le cran à la baisse passe
  // alors tel quel, ce qui est la direction d'erreur de `withPortionCran` et
  // pas une décision prise ici.
  const floorKcal = mouth.body === null
    ? null
    : energyFloorFor(mouth.body.gender);
  if (mouth.restriction === "raised") {
    if (!RESTRICTION_FLOOR_SIZES_MAINTENANCE) {
      return { kcal: null, reason: "restriction_floor", gapClosed: "none" };
    }
    // ⚠️ `goal.gap` VAUT DÉJÀ ZÉRO ICI — la chaîne ①②③ ferme sous plancher. On
    // n'écrit donc pas « sans l'écart », on écrit CE QUI EST: l'entretien. Le
    // jeton dit pourquoi, pour que le compteur distingue « pas d'objectif » de
    // « objectif fermé par le plancher ».
    //
    // ⛔ ET LE CRAN S'APPLIQUE QUAND MÊME. Le plancher TCA retire l'ÉCART
    // D'OBJECTIF, pas la réponse de la personne à « c'était trop ? ». Refuser
    // de l'écouter ici servirait, à quelqu'un dont le plancher est levé, une
    // assiette dont il vient de dire qu'elle ne lui convient pas — et le
    // plancher d'énergie reste dessous, appliqué par `withPortionCran`.
    return {
      kcal: withPortionCran({
        kcal: base.kcal,
        portionIndex: mouth.portionIndex,
        floorKcal,
      }),
      reason: "anchored",
      gapClosed: "restriction_floor",
    };
  }
  return {
    kcal: withPortionCran({
      kcal: base.kcal + goal.gap,
      portionIndex: mouth.portionIndex,
      floorKcal,
    }),
    reason: "anchored",
    gapClosed: "none",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ⑨ — LA DENSITÉ REQUISE, DITE AVANT LA COMPOSITION (2026-09-08)
// ══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT QUE CE BLOC FERME, ET IL A ÉTÉ MESURÉ ───────────────────────
// Tir du 2026-09-07 sur un corps de 187 cm / 72 kg / 28 ans en prise de masse
// (cible 3 180 kcal/jour): le modèle écrit un déjeuner à 142 kcal/100 g et un
// dîner à 113. Pour porter leurs cibles (1 156 et 1 012 kcal) il faudrait
// servir 813 g et 897 g — au-delà du plafond d'assiette (700 g). Le moteur
// rabote, et **383 kcal sur 3 080 ne sont jamais servies**.
//
// La réparation (`repairDecision`) traduit déjà ce défaut en densité, mais
// APRÈS COUP: elle demande au modèle de refaire un plat qu'il vient d'écrire.
// La même arithmétique, dite AVANT, ne coûte rien et évite le second appel.
//
// ⛔ C'EST LA MÊME FORMULE QUE LA BRANCHE `densify` DE `repairDecision`, et
// elle n'est pas dupliquée par distraction: `repairDecision` part d'un plat
// MESURÉ (il a une densité constatée à comparer), celui-ci part d'une CIBLE
// seule, avant qu'aucun plat n'existe. Ce qu'ils partagent est
// `REPAIR_DENSITY_HEADROOM` — la marge est nommée une fois, ici comme là-bas.
//
// ⛔ UNE DENSITÉ EST UN FAIT SUR LE PLAT, PAS UN OBJECTIF DE PERSONNE, et
// c'est ce qui rend ce lot compatible avec le renversement du 2026-08-06
// (`docs/keel/CALORIE_REVERSAL.md`): « au moins 182 kcal pour 100 g » décrit ce
// qu'on met dans une casserole. « Tu vises 3 180 kcal » décrirait quelqu'un.
// Le premier se rend au modèle; le second ne sort JAMAIS de ce fichier.

/** Ce qu'un moment exige du plat qu'on y sert. */
export interface SlotDensity {
  slot: string;
  /**
   * ⟳ 2026-09-11 · LOT B — LES JOURS QUE CETTE LIGNE COUVRE.
   *
   * ⛔ REQUIS, jamais `?`. Sans lui, deux lignes du même moment sont
   * indiscernables — et c'est très exactement ce que le chantier interdit :
   * « ne pas fusionner tous les dîners par leur valeur maximale ; une consigne
   * commune n'est possible que si les contrats sont effectivement compatibles
   * et les cases concernées restent IDENTIFIABLES ».
   *
   * ⚠️ `[]` EST ADMIS ET SIGNIFIE « CETTE LIGNE NE DIT PAS SES JOURS » — un
   * décor de test qui monte un `SlotDensity` à la main, ou un chemin qui n'a
   * pas de calendrier. Les lecteurs qui cherchent une date (`cellDensityOf`)
   * traitent ce cas comme « elle vaut pour tous les jours », ce qui est le
   * comportement d'avant ce lot.
   */
  days: readonly string[];
  /**
   * La borne BASSE du couloir — « au moins N kcal pour 100 g ».
   *
   * ⚠️ C'est le champ historique, et il garde son nom parce que c'est lui que
   * la ligne du prompt rend. Il vaut `minPer100G`.
   */
  kcalPer100G: number;
  /** ⟳ 2026-09-10 — le couloir: `100 × E / Gmax`. */
  minPer100G: number;
  /** ⟳ 2026-09-10 — le couloir: `100 × E / Gmin`. En dessous, l'assiette est vide. */
  maxPer100G: number;
  /** ⟳ 2026-09-10 — la visée, projetée DANS `[min, max]`. */
  preferredPer100G: number;
  /**
   * ⟳ 2026-09-10 — ce que le besoin demanderait SANS le plafond de demande.
   * Égal à `minPer100G` dans le cas nominal; au-dessus quand le plafond mord.
   */
  neededMinPer100G: number;
  /**
   * ⟳ 2026-09-10 · LOT 4 — LA BORNE BASSE N'AJOUTE RIEN AU PLANCHER DU BLOC.
   *
   * ⛔ CE DRAPEAU REMPLACE UN FILTRE QUI JETAIT LA LIGNE ENTIÈRE. Jusqu'ici,
   * un moment dont `min` ne dépassait pas le plancher commun (100, ou 60 en
   * léger) était SUPPRIMÉ — et son PLAFOND partait avec lui, alors que le
   * plancher du bloc ne le porte pas et que rien d'autre ne le porte non plus.
   * Un goûter de 250 kcal a un couloir [100, 135]: le jeter, c'est perdre le
   * 135.
   *
   * Ce qui reste vrai de l'objection d'origine — « répéter au moins 100 en
   * face d'un goûter ajoute un nombre sans ajouter une contrainte, et un brief
   * qui répète cesse d'être lu » — est une question de RENDU, pas de calcul.
   * Le rédacteur du brief lit ce drapeau et écrit « au plus 135 » au lieu de
   * « entre 100 et 135 ». L'information ne se perd plus pour éviter une
   * répétition.
   */
  redundantMin: boolean;
  /**
   * ⟳ 2026-09-10 · LOT 4 — SUR COMBIEN D'OCCURRENCES CE COULOIR A ÉTÉ CROISÉ.
   * 1 = un seul jour. Au-delà, `min` est le MAX des occurrences et `max` leur
   * MIN: la bande commune, pas celle du jour le plus exigeant.
   */
  occurrences: number;
  /** ⟳ 2026-09-10 — `null` = le couloir est tenable tel quel. */
  incompatible: DensityIncompatibility | null;
  /** Le moment est marqué « léger »: son plancher n'est pas celui d'un repas. */
  light: boolean;
  /**
   * ⟳ 2026-09-11 — CE QUE LA CIBLE IMPLIQUERAIT, À CÔTÉ DE CE QU'ON DEMANDE.
   *
   * `100 × E / Gpréf`, **brut**: ni rabattu dans le couloir, ni plafonné. C'est
   * le témoin de l'arbitrage **A15** (`docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md`):
   * `preferredPer100G` reste ancré au BAS du couloir parce que `100 × E / Gpréf`
   * rend 236 kcal/100 g sur un déjeuner de 1 120 kcal, quand les plats réels de
   * ce dépôt vivent entre 113 et 156 — mesuré, 389 demandés et 126,7 rendus.
   *
   * ⛔ IL EST ICI POUR QUE LA SUBSTITUTION CESSE D'ÊTRE SILENCIEUSE. Le
   * chantier du 2026-09-11 ne demande pas de revenir à cette formule, il
   * demande que les deux nombres soient NOMMÉS quand ils divergent —
   * `densityFragment` (`household_portions.ts`) le fait au-delà de
   * `ANCHOR_DIVERGENCE_RATIO`.
   *
   * ⚠️ `null` EST ADMIS PAR LE TYPE ET N'ARRIVE PAS PAR CE CHEMIN:
   * `densityCorridorFor` rend `null` pour le couloir ENTIER quand la masse
   * préférée manque, donc la projection ci-dessous n'a jamais de témoin
   * absent. Le `null` existe pour les décors de test qui montent un
   * `SlotDensity` à la main sans témoin — il ne décrit pas un état du moteur.
   */
  targetAnchoredPer100G: number | null;
}

/**
 * LA DENSITÉ REQUISE D'UNE BOUCHE, ET OÙ ELLE A LE DROIT D'ÊTRE DITE.
 *
 * ⛔ DEUX LISTES, ET LA SÉPARATION EST LA GARDE — PAS UNE COMMODITÉ. Sous
 * plancher TCA (`gapClosed: "restriction_floor"`), le plan continue de
 * dimensionner (c'est la décision du lot 6: refuser de dimensionner ne protège
 * personne, ça sert une assiette au hasard) mais **plus rien ne peut être écrit
 * en face du nom de cette personne**. Sa densité part donc dans `floorOnly`, où
 * `densityFloorsOf` la fond dans le plancher COMMUN du bloc, avec celles de
 * tout le monde: le modèle reçoit le nombre, personne ne reçoit la personne.
 */
export interface RequiredDensity {
  /** Rendues sur la ligne de la personne, dans le brief. */
  named: readonly SlotDensity[];
  /** Fondues anonymement dans le plancher du bloc. JAMAIS nommées. */
  floorOnly: readonly SlotDensity[];
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
  counters: {
    /** Les moments examinés, tous jours confondus. */
    slots: number;
    /** Ceux dont la densité requise dépasse le plancher de leur classe. */
    above_floor: number;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ⟳ 2026-09-12 · ÉTAPE C4 — CEUX DONT LE MINIMUM EST **SOUS** LE PLANCHER
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ IL EXISTE PARCE QUE CES DEUX CAS ÉTAIENT CONFONDUS, ET C'EST UN DÉFAUT
     * DE CONTRAT MESURÉ. `redundantMin` valait `!(min > plancher)`: il était
     * donc vrai aussi bien pour un moment qui demande EXACTEMENT le plancher
     * (rien à ajouter, la phrase commune le dit déjà) que pour un moment qui
     * demande MOINS (91 pour un petit-déjeuner de 613,5 kcal à grand appétit,
     * tir n° 3 du 2026-09-11). Dans le second cas la ligne ne sortait pas, le
     * modèle ne lisait que « a normal dish carries at least 100 » — la consigne
     * promettait 100 pendant que la garde acceptait 91.
     *
     * Le commentaire de `NORMAL_DISH_MIN_KCAL_PER_100G` annonce pourtant
     * l'inverse comme interdit: « une consigne qui promet 100 et une garde qui
     * accepte 90 laisseraient passer un plat que le moteur devra réparer — et
     * le modèle aurait raison contre le moteur ».
     *
     * ⛔ ET LA CORRECTION NE REMONTE PAS LE PLANCHER. Le plan de clôture
     * l'interdit en toutes lettres: « ne pas réparer ces recettes sur la base
     * du faux seuil de 100 ». C'est la CONSIGNE qui s'aligne sur la garde, pas
     * l'inverse: la bande vraie est imprimée, et une phrase du bloc dit qu'une
     * bande nommée l'emporte sur le plancher commun.
     */
    below_floor: number;
    /** Ceux dont la densité DIFFÈRE d'un jour à l'autre (on garde le max). */
    days_varied: number;
    /**
     * Ceux dont l'exigence a été rabotée par `MAX_ASKABLE_DENSITY_PER_100G`.
     * ⛔ IL DOIT RESTER PROCHE DE ZÉRO: voir le pavé de la constante.
     */
    capped: number;
    /**
     * ⟳ 2026-09-10 — CEUX QUE LES APPORTS FIXES COUVRENT DÉJÀ ENTIÈREMENT.
     *
     * ⛔ IL EXISTE PARCE QUE LE PLANCHER DE 30 % A ÉTÉ RETIRÉ. Tant qu'il
     * vivait, une part de moment ne pouvait pas tomber à zéro; elle le peut
     * désormais, et ce compteur est ce qui distingue « ce cas n'arrive
     * jamais » de « le shaker mange le goûter de tout le monde ».
     */
    fixed_covered: number;
    /**
     * ⟳ 2026-09-10 · LOT 4 — CEUX QUE L'ANCIEN FILTRE JETAIT.
     *
     * ⛔ Non nul, il dit combien de PLAFONDS le produit perdait à chaque plan
     * avant ce lot: la ligne était supprimée parce que sa borne BASSE
     * n'ajoutait rien au bloc, et sa borne HAUTE — que rien d'autre ne porte —
     * partait avec elle.
     */
    floor_min_kept: number;
    /**
     * ⟳ 2026-09-10 · LOT 4 — DEUX OCCURRENCES SANS DENSITÉ COMMUNE.
     *
     * ⚠️ IL DOIT RESTER RARE. S'il grimpe, la grille d'un moment change trop
     * d'un jour à l'autre pour qu'une seule recette les serve, et la sortie
     * est une recette SÉPARÉE — pas une bande moyenne qu'aucun jour ne tient.
     */
    empty_intersection: number;
    /**
     * ⟳ 2026-09-11 — LES JOURNÉES DONT L'ÉNERGIE A ÉTÉ DÉPLACÉE pour qu'un
     * moment intenable redevienne composable. Somme conservée, apports fixes
     * et moments légers respectés (`redistributeDayBudget`).
     */
    relaxed_days: number;
    /**
     * ⛔ POURQUOI UNE JOURNÉE N'A PAS PU ÊTRE RELÂCHÉE. `no_room_in_day` dit
     * que les assiettes de la journée ne suffisent pas, quel que soit le
     * partage; `nothing_movable` que tout y est figé. Dans les deux cas le
     * conflit RESTE, et le couloir garde son `incompatible`.
     */
    relax_refused: Record<string, number>;
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ, ET VOICI POURQUOI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle vit désormais dans `slot_nutrition_contract.ts`, avec un paramètre de
 * plus: `rhythmSlots`, le rythme alimentaire COMPLET de la bouche.
 *
 * ⛔ CE QU'ELLE FAISAIT ICI, ET CE QUE ÇA COÛTAIT. Elle prenait pour
 * dénominateur les seuls moments PRÉSENTS DANS LA GRILLE de chaque jour. Un
 * vendredi qui ne porte que son dîner donnait donc la JOURNÉE ENTIÈRE à ce
 * dîner. Mesuré le 2026-09-11: la case `PERTE / 2026-09-11 / dinner` valait
 * **858,90 kcal** pour le dimensionnement et **2 454,00** pour le couloir
 * envoyé au modèle — un facteur **2,86** sur la même case. Et comme les
 * couloirs étaient repliés par NOM DE MOMENT, sans clé de date, ce vendredi
 * imposait son [250–250] `above_askable_cap` aux dîners du samedi et du
 * dimanche, qui méritaient [123–250] visée 135.
 *
 * ⚠️ CE QUI RESTE ICI EST CE QU'ELLE APPELAIT: `dayTargetFor`,
 * `plateBoundsFor`, `densityCorridorFor`, `mergeCorridors`,
 * `relaxDayForCorridors`. Le contrat les appelle entières; aucune
 * arithmétique n'a été recopiée.
 */
/**
 * ⟳ 2026-09-10 · LOT 4 — DEUX OCCURRENCES D'UN MÊME MOMENT, UNE SEULE BANDE.
 *
 * `max(Dmin)` et `min(Dmax)`, la règle du chantier pour une recette partagée
 * ou réutilisée. C'est la même arithmétique que `intersectCorridors` applique
 * côté réparation; elle vit ici en clair parce que ce chemin-ci doit aussi
 * NOMMER l'intersection vide, ce dont la réparation n'a pas besoin.
 *
 * ⛔ UNE INTERSECTION VIDE NE SE REFERME PAS EN MOYENNE. Quand les deux bandes
 * sont disjointes, on garde `min` (la contrainte la plus haute, celle qui
 * protège l'assiette de déborder) et on POSE le motif. Fabriquer une bande
 * tenable en rabotant l'une des deux ferait exactement ce que le chantier
 * interdit: « ne pas tronquer un minimum impossible pour fabriquer un couloir
 * valide ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mergeCorridors(
  a: DensityCorridor,
  b: DensityCorridor,
): DensityCorridor {
  const min = Math.max(a.minPer100G, b.minPer100G);
  const max = Math.min(a.maxPer100G, b.maxPer100G);
  const vide = min > max;
  // La visée reste DANS la bande commune. Sur une intersection vide il n'y a
  // pas de bande: on vise le plancher, seul point que les deux respectent par
  // le haut.
  const preferred = vide ? min : Math.min(
    max,
    Math.max(min, Math.max(a.preferredPer100G, b.preferredPer100G)),
  );
  // ⟳ 2026-09-11 · LOT B — LE TÉMOIN DE LA CIBLE SUIT LA MÊME RÈGLE QUE LE
  // PLANCHER: le plus EXIGEANT des deux. Deux bouches sur la même recette
  // n'impliquent pas la même densité; garder la plus haute dit ce que la bande
  // commune coûterait à celle qui demande le plus.
  const anchored = Math.max(a.targetAnchoredPer100G, b.targetAnchoredPer100G);
  // ⟳ 2026-09-14 · BÊTA 1C ⑤ — LES BORNES EXACTES SUIVENT LA MÊME RÈGLE, sur
  // leurs propres nombres: `max(Dmin)` et `min(Dmax)`. Les dériver des entiers
  // rendrait un plafond exact plus large que le plafond énoncé, et le verdict
  // cesserait de mordre là où la consigne mord.
  const minExact = Math.max(a.minExactPer100G, b.minExactPer100G);
  const maxExact = Math.min(a.maxExactPer100G, b.maxExactPer100G);
  return {
    minPer100G: min,
    maxPer100G: vide ? min : max,
    minExactPer100G: minExact,
    maxExactPer100G: minExact > maxExact ? minExact : maxExact,
    preferredPer100G: preferred,
    neededMinPer100G: Math.max(a.neededMinPer100G, b.neededMinPer100G),
    targetAnchoredPer100G: anchored,
    anchorDivergencePer100G: anchored - preferred,
    // ⚠️ `above_askable_cap` GARDE LA PRIORITÉ: un besoin au-dessus du plafond
    // de demande est un fait sur le besoin, l'intersection vide un fait sur la
    // grille. Le premier se répare en changeant la portion, le second en
    // séparant les recettes — et on ne peut en nommer qu'un.
    incompatible: a.incompatible ?? b.incompatible ??
      (vide ? "empty_intersection" : null),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 — LA SORTIE D'UN COULOIR INTENABLE: DÉPLACER, PUIS RECALCULER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CECI FERME. `redistributeDayBudget` a été écrite au lot 4, éprouvée
 * à onze cas — et **aucun code de production ne l'appelait**. Le lot 4 en fait
 * la sortie du couloir vide; le couloir vide se produit, et ne déclenchait
 * rien. C'est le mode d'échec « ceinture armée sur coffre vide », posé par
 * celui-là même qui passe sa nuit à le nommer.
 *
 * ⛔ ET CE N'EST PAS UN SIMPLE APPEL. Déplacer de l'énergie change les cibles
 * de moment, donc les bornes d'assiette, donc les couloirs. Une redistribution
 * qui ne serait pas suivie d'un RECALCUL rendrait des couloirs calculés sur une
 * journée qui n'existe plus — exactement le défaut que le lot 5 vient de fermer
 * en aval. Cette fonction rend donc les NOUVELLES cibles, et l'appelant
 * recalcule tout depuis elles.
 *
 * ⛔ ET SI LE CONFLIT NE SE RÉSOUT PAS, IL RESTE EXPLICITE. On ne rabote pas, on
 * ne moyenne pas, on ne baisse pas la journée en silence: `moved: 0` et le
 * couloir garde son `incompatible`. Le chantier l'exige — « si aucune
 * allocation compatible n'existe, conserver le conflit ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function relaxDayForCorridors(args: {
  /** Moment → cible actuelle, telle que `slotPlanTargets` l'a rendue. */
  targets: ReadonlyMap<string, number>;
  /** Moment → la masse maximale de cette bouche à ce moment-là. */
  maxGramsBySlot: ReadonlyMap<string, number>;
  /** Les moments que rien ne peut déplacer: apport fixe, dehors, gelé. */
  lockedSlots: readonly string[];
  lightSlots: readonly string[];
}): {
  targets: ReadonlyMap<string, number>;
  moved: number;
  refusal: string | null;
} {
  const locked = new Set(args.lockedSlots);
  const light = new Set(args.lightSlots);
  const slots: RedistributableSlot[] = [...args.targets].map((
    [slot, targetKcal],
  ) => ({
    slot,
    targetKcal,
    // ⚠️ SANS MASSE CONNUE, LE MOMENT EST FIGÉ. Lui inventer une capacité
    // ferait déplacer de l'énergie vers une assiette dont on ne sait rien.
    maxGrams: args.maxGramsBySlot.get(slot) ?? 0,
    locked: locked.has(slot) || !args.maxGramsBySlot.has(slot),
    light: light.has(slot),
  }));
  const out = redistributeDayBudget(slots);
  if (!out.ok) return { targets: args.targets, moved: 0, refusal: out.reason };
  return { targets: out.bySlot, moved: out.moved, refusal: null };
}


/**
 * L'ORDRE D'UNE JOURNÉE. Un moment inconnu part à la fin, dans l'ordre où il
 * est arrivé — on ne devine pas l'heure d'un jeton qu'on ne connaît pas.
 */
export function slotOrderOf(slot: string): number {
  const i = DAY_SLOT_ORDER.indexOf(slot);
  return i < 0 ? DAY_SLOT_ORDER.length : i;
}

/**
 * ⚠️ MIROIR DE `WEIGHTED_SLOTS` (`mouth_anchor.ts`), ET PAS UN IMPORT — c'est
 * l'idiome de ce dépôt pour deux listes qui doivent se ressembler sans se
 * tirer l'une l'autre. Un test les compare. `snack` est le jeton legacy, il
 * n'a pas d'heure connue: il tombe en fin de journée avec les inconnus.
 */
const DAY_SLOT_ORDER: readonly string[] = Object.freeze([
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
]);

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 · LOT 4 — QUAND UN COULOIR EST VIDE, ON DÉPLACE DE L'ÉNERGIE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE CAS RÉEL: un moment dont le besoin dépasse ce qu'on s'autorise à
// demander (`neededMinPer100G > MAX_ASKABLE_DENSITY_PER_100G`). Sa part ne
// TIENT PAS dans son assiette, quelle que soit la recette. Jusqu'ici le
// produit rabotait la demande à 250 et servait une consigne qu'aucun plat ne
// peut respecter — et une consigne intenable apprend au modèle que ces
// nombres-là sont décoratifs.
//
// LA SORTIE PROPRE: la journée garde son total, et l'énergie change de moment.
// Un dîner qui déborde donne au déjeuner, qui a de la place.
//
// ⛔ CE QUI NE BOUGE JAMAIS — la liste est le contrat, pas une commodité:
//   · un apport fixe (le shaker est avalé, il ne se déplace pas);
//   · un repas dehors (personne ne compose au restaurant);
//   · une case consommée ou gelée (elle est déjà dans une assiette);
//   · un moment léger ne DÉPASSE PAS son budget de départ — « léger » est une
//     décision de la personne, pas une variable d'ajustement.
//
// ⛔ ET AUCUN NOUVEAU MOMENT. Ajouter un goûter pour faire tenir l'arithmétique
// serait décider à la place de quelqu'un ce qu'il mange. La journée n'a pas
// non plus le droit de baisser en silence: si rien ne tient, on rend le
// conflit, et l'appelant demande une recette séparée ou un complément ciblé.

/** Un moment de la journée, tel que la redistribution le voit. */
export interface RedistributableSlot {
  slot: string;
  /** Ce que ce moment porte aujourd'hui, en kcal à composer. */
  targetKcal: number;
  /**
   * La masse maximale que cette bouche peut mettre dans ce moment, en grammes
   * (`plateBoundsFor(...).max`). C'est elle qui, avec le plafond de demande,
   * borne l'énergie qu'un moment peut porter.
   */
  maxGrams: number;
  /**
   * `false` = ce moment est déplaçable. `true` = il est figé (apport fixe,
   * repas dehors, case consommée ou gelée).
   */
  locked: boolean;
  /** Un moment léger ne remonte jamais au-dessus de son budget de départ. */
  light: boolean;
}

export const REDISTRIBUTION_REFUSALS = [
  /** La somme des capacités des moments déplaçables ne suffit pas. */
  "no_room_in_day",
  /** Tout est figé: il n'y a rien à déplacer. */
  "nothing_movable",
] as const;
export type RedistributionRefusal = (typeof REDISTRIBUTION_REFUSALS)[number];

export type Redistribution =
  | {
    ok: true;
    /** Moment → nouvelle cible en kcal. Les figés y sont, inchangés. */
    bySlot: ReadonlyMap<string, number>;
    /** Combien de moments ont bougé. 0 = rien à faire, et c'est un succès. */
    moved: number;
  }
  | { ok: false; reason: RedistributionRefusal };

/**
 * L'ÉNERGIE QU'UN MOMENT PEUT PORTER AU PLUS, en kcal.
 *
 * ⚠️ `maxGrams × plafond / 100`, et rien d'autre. C'est la MÊME borne que le
 * couloir emploie à l'envers (`Dmin = 100 × E / Gmax`): au-delà, `Dmin`
 * dépasse le plafond de demande et la case devient intenable. Une seconde
 * définition de « ce moment est plein » divergerait de la première.
 */
function slotCapacityKcal(slot: RedistributableSlot): number {
  return (slot.maxGrams * MAX_ASKABLE_DENSITY_PER_100G) / 100;
}

/**
 * REDISTRIBUE UNE JOURNÉE. PURE: no I/O, no clock, no randomness.
 *
 * ⚠️ LA SOMME EST CONSERVÉE, AU CENTIÈME PRÈS. Ce n'est pas une élégance: une
 * redistribution qui perd 40 kcal en route creuse un déficit que personne n'a
 * demandé, et le fait sur la journée de quelqu'un qui vise une prise de masse.
 */
export function redistributeDayBudget(
  slots: readonly RedistributableSlot[],
): Redistribution {
  const movable = slots.filter((s) => !s.locked);
  if (movable.length === 0) return { ok: false, reason: "nothing_movable" };

  // Ce qu'il faut recaser: le total des moments déplaçables. Les figés gardent
  // leur cible et ne participent ni au don ni à la réception.
  const aRepartir = movable.reduce((n, s) => n + s.targetKcal, 0);

  // ── LA FAISABILITÉ, AVANT TOUT DÉPLACEMENT ────────────────────────────
  // ⛔ UN MOMENT LÉGER PLAFONNE À SON BUDGET DE DÉPART, pas à sa capacité
  // physique: le rendre « moins léger » pour équilibrer une journée
  // renverserait une décision de la personne.
  const plafond = (s: RedistributableSlot): number =>
    s.light ? s.targetKcal : slotCapacityKcal(s);
  const capaciteTotale = movable.reduce((n, s) => n + plafond(s), 0);
  // ⚠️ UNE TOLÉRANCE DE 0,01 kcal, ET ELLE EST ARITHMÉTIQUE, pas indulgente:
  // sans elle, une somme reconstituée en virgule flottante refuserait une
  // journée qui tient exactement.
  if (capaciteTotale + 0.01 < aRepartir) {
    return { ok: false, reason: "no_room_in_day" };
  }

  // ── LE REMPLISSAGE, PROPORTIONNEL AUX POIDS EXISTANTS ─────────────────
  // ⚠️ « LES POIDS EXISTANTS » SONT LES CIBLES ACTUELLES, et c'est voulu: elles
  // portent déjà `slotPlanTargets` — les poids de moment, le léger, le shaker
  // retranché. Repartir des poids bruts referait cette arithmétique une
  // seconde fois, et les deux divergeraient.
  //
  // Saturation: un moment qui atteint son plafond est FIGÉ à ce plafond, et le
  // reste se répartit entre les autres. On boucle jusqu'à ce que plus personne
  // ne sature — au plus une fois par moment.
  const sature = new Map<string, number>();
  let restants = [...movable];
  let reste = aRepartir;

  for (let passe = 0; passe <= movable.length; passe++) {
    const base = restants.reduce((n, s) => n + s.targetKcal, 0);
    if (restants.length === 0 || base <= 0) break;
    let aSature = false;
    const suivants: RedistributableSlot[] = [];
    let consomme = 0;
    for (const s of restants) {
      const part = (s.targetKcal / base) * reste;
      const cap = plafond(s);
      if (part > cap + 0.01) {
        sature.set(s.slot, cap);
        consomme += cap;
        aSature = true;
      } else {
        suivants.push(s);
      }
    }
    if (!aSature) {
      // Personne ne sature: la part proportionnelle est la bonne.
      for (const s of restants) {
        sature.set(s.slot, (s.targetKcal / base) * reste);
      }
      restants = [];
      break;
    }
    reste -= consomme;
    restants = suivants;
  }
  // Filet: un reste non placé (tous saturés) retombe sur le dernier non figé.
  // ⛔ IL NE DOIT PAS ARRIVER — la faisabilité l'a écarté plus haut — et s'il
  // arrive, perdre les kcal serait pire que les poser quelque part.
  for (const s of restants) sature.set(s.slot, plafond(s));

  const bySlot = new Map<string, number>();
  for (const s of slots) {
    bySlot.set(
      s.slot,
      s.locked ? s.targetKcal : (sature.get(s.slot) ?? s.targetKcal),
    );
  }
  let moved = 0;
  for (const s of movable) {
    if (Math.abs((bySlot.get(s.slot) ?? 0) - s.targetKcal) > 0.01) moved++;
  }
  return { ok: true, bySlot, moved };
}

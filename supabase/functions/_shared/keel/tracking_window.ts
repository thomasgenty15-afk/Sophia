// LE SUIVI D'UNE PERSONNE SUR UNE FENÊTRE — module PUR, aucune I/O, aucune
// horloge, aucun aléa. `tracking_window_io.ts` charge, celui-ci décide.
//
// ══════════════════════════════════════════════════════════════════════════
// CE QUE CE MODULE EXISTE POUR EMPÊCHER
// ══════════════════════════════════════════════════════════════════════════
//
// La page `/app/progress` posait N requêtes et recomposait ses comptes dans le
// composant. Trois défauts en découlaient, et ils sont fermés ici:
//
//  ① LE PLANCHER TCA ÉTAIT LU CÔTÉ CLIENT, sur `weekly_reviews.risk_band` —
//    une colonne SANS ÉCRIVAIN depuis le 2026-08-08. La ceinture était armée
//    sur un coffre vide: elle ne s'est jamais levée pour personne. Ici, la
//    porte est une ENTRÉE OBLIGATOIRE (`gate`), et `buildTrackingReport`
//    refuse de construire un rapport sans elle.
//
//  ② UN CHIFFRE D'ÉNERGIE SANS SA BASE. `CALORIE_REVERSAL.md` §5 en fait une
//    propriété: tout kcal rendu porte sa base. Aucun `number` nu ne sort d'ici
//    — le type `TrackedEnergy` n'a pas de constructeur sans `basis`.
//
//  ③ UNE SOMME QUI EFFACE LA FAIBLESSE DE SES PARTS. Un total mêlant une
//    prescription (2,3 % de MAPE) et une lecture de photo (−26,6 % de biais)
//    qui se présenterait avec la base de la première mentirait dans la
//    direction flatteuse. `weakestBasis` est la règle: un total porte la base
//    LA PLUS FAIBLE de ce qui le compose, et la page nomme cette base.
//
// ══════════════════════════════════════════════════════════════════════════
// ⟳ RENVERSEMENT ÉCRIT — « UN KCAL PHOTO NE SE SOMME JAMAIS » (R3, D7.5)
// ══════════════════════════════════════════════════════════════════════════
//
// `frontend/src/keel/api/mealPhoto.ts` portait: « ⛔ ET IL NE SE SOMME PAS. Le
// biais de −26,6 % n'est divisé que par 1,04 en cumul hebdomadaire; les deltas
// sont 2,5× pires que les niveaux. » Cette phrase était juste contre la somme
// qu'on faisait à l'époque: un total NU, présenté comme un fait.
//
// Le chantier du 2026-09-03 (D7.5) l'autorise sous DEUX conditions, et elles
// sont structurelles ici, pas éditoriales:
//   · le total porte la base la plus faible de ses composantes (`weakestBasis`),
//     donc un total contaminé par une photo s'annonce COMME une photo;
//   · le biais reste dit là où le chiffre est rendu — la base est DANS la clé
//     i18n, jamais à côté.
// Le biais de −26,6 % ne disparaît pas: il devient LISIBLE. La phrase inverse a
// été réécrite dans `mealPhoto.ts` au même commit; un renversement silencieux
// serait une faute, même juste.
//
// ══════════════════════════════════════════════════════════════════════════
// CE QUI N'EST PAS ICI, ET NE DOIT PAS Y ARRIVER
// ══════════════════════════════════════════════════════════════════════════
// Aucun « il te reste X kcal » (le produit ne pilote pas un budget). Aucun
// pourcentage d'adhérence (FF-059 R10: sommer les comptes est un score déguisé).
// Aucun chiffre d'énergie STOCKÉ (FF-059 R5: il se recalcule ou il n'existe
// pas). Aucune convention de temps: « temps économisé » n'a pas de référence
// mesurée dans ce dépôt, donc ce module rend DEUX comptes bruts et rien qui en
// dérive (D7.4).

import type { EnergyGateReason, EnergyGateResult } from "./energy_gate.ts";
import type { EnergyTarget } from "./energy_target.ts";
import { EATING_OCCASIONS, type EatingOccasion } from "./meal_generation.ts";
import { SLOT_DAY_WEIGHT } from "./mouth_anchor.ts";
import { PLAN_ENERGY_BASIS } from "./plan_energy.ts";
import type { EnergyBasis } from "./meal_analysis.ts";

/**
 * LES CINQ BASES QU'UN CHIFFRE DE CETTE PAGE PEUT PORTER, DE LA PLUS FORTE À
 * LA PLUS FAIBLE. L'ORDRE EST LE CONTRAT.
 *
 *  · `plan_quantities` ...... les grammes que le produit a lui-même écrits dans
 *    le plan, recalculés (MAPE 2,3 %). C'est la seule base EXACTE.
 *  · `declared_quantities` .. la personne a écrit des quantités. Même MAPE, mais
 *    c'est elle qui a mesuré, pas nous.
 *  · `photo_estimate` ....... une lecture d'assiette. Biais mesuré −26,6 %,
 *    systématiquement flatteur.
 *  · `slot_estimate` ........ NEUVE (D7.8). Un créneau déclaré que personne n'a
 *    renseigné, estimé par une clé de répartition. Ce n'est pas une lecture,
 *    c'est une convention assumée.
 *  · `assumed` .............. NEUVE (D8.2). Un plat du plan dont personne n'a
 *    dit qu'il n'avait pas été mangé. « Pas de nouvelles » se LIT, il ne s'écrit
 *    jamais: aucune coche automatique n'est posée en base (elle fabriquerait un
 *    fait faux indémentable), mais le lecteur a le droit d'en tenir compte, à
 *    condition de dire qu'il l'a fait.
 *
 * ⛔ `Record` COMPLET, comme `SLOT_DAY_WEIGHT`: une base ajoutée à l'union sans
 * son rang ne compile pas. Une base sans rang tomberait silencieusement au
 * milieu du tri, et le total mentirait dans une seule direction.
 */
export const TRACKING_BASES = [
  PLAN_ENERGY_BASIS,
  "declared_quantities",
  "photo_estimate",
  "slot_estimate",
  "assumed",
] as const;

export type TrackingBasis = (typeof TRACKING_BASES)[number];

const BASIS_RANK: Readonly<Record<TrackingBasis, number>> = Object.freeze({
  plan_quantities: 0,
  declared_quantities: 1,
  photo_estimate: 2,
  slot_estimate: 3,
  assumed: 4,
});

/**
 * LA BASE D'UNE PHOTO EST DÉJÀ L'UNE DES CINQ — et c'est une table EXPLICITE,
 * pas un `as`. Un `as` sur un type étranger désarme le typecheck: le jour où
 * `ENERGY_BASES` gagne une valeur, un cast la laisserait passer en silence et
 * `weakestBasis` jetterait à l'exécution, en production. La table, elle, ne
 * compile plus.
 */
const PHOTO_BASIS_IS_TRACKED: Readonly<Record<EnergyBasis, TrackingBasis>> =
  Object.freeze({
    photo_estimate: "photo_estimate",
    declared_quantities: "declared_quantities",
  });

export function trackingBasisOfPhoto(basis: EnergyBasis): TrackingBasis {
  const mapped = PHOTO_BASIS_IS_TRACKED[basis];
  if (!mapped) {
    throw new Error(`[keel/tracking] base de photo inconnue: ${String(basis)}`);
  }
  return mapped;
}

/** UN CHIFFRE D'ÉNERGIE, ET IL N'EXISTE PAS SANS SA BASE. */
export interface TrackedEnergy {
  kcal: number;
  basis: TrackingBasis;
}

/** Un total: un chiffre, sa base la plus faible, et de combien de parts il vient. */
export interface TrackedTotal extends TrackedEnergy {
  /** Le nombre de composantes sommées. `0` ⇒ pas de total du tout (voir `null`). */
  parts: number;
}

/**
 * LA BASE D'UNE SOMME EST LA PLUS FAIBLE DE SES PARTS.
 *
 * ⚠️ Ce n'est pas une moyenne ni un vote: une seule photo dans une journée de
 * plats prescrits suffit à faire du total un chiffre de photo. C'est voulu —
 * l'inverse (« la base majoritaire ») habillerait le biais de la minorité avec
 * la fiabilité de la majorité, ce qui est exactement le mensonge que D7.5
 * accepte de rendre impossible en échange de l'autorisation de sommer.
 */
export function weakestBasis(
  bases: readonly TrackingBasis[],
): TrackingBasis | null {
  let worst: TrackingBasis | null = null;
  for (const basis of bases) {
    const rank = BASIS_RANK[basis];
    if (rank === undefined) {
      throw new Error(`[keel/tracking] base sans rang: ${String(basis)}`);
    }
    if (worst === null || rank > BASIS_RANK[worst]) worst = basis;
  }
  return worst;
}

/** Somme des parts, avec la base la plus faible. `null` si rien à sommer. */
export function sumEnergy(
  parts: readonly TrackedEnergy[],
): TrackedTotal | null {
  if (parts.length === 0) return null;
  const basis = weakestBasis(parts.map((p) => p.basis));
  if (basis === null) return null;
  let kcal = 0;
  for (const p of parts) {
    if (!Number.isFinite(p.kcal)) {
      throw new Error("[keel/tracking] kcal non fini dans une somme");
    }
    kcal += p.kcal;
  }
  return { kcal: Math.round(kcal), basis, parts: parts.length };
}

// ══════════════════════════════════════════════════════════════════════════
// LES ENTRÉES
// ══════════════════════════════════════════════════════════════════════════

/** Un plat du plan, ramené à ce que le suivi en lit. */
export interface TrackingPlanDish {
  dishIndex: number;
  /** La date calendaire résolue. `null` = plat sans jour (il ne peut être ni coché ni loupé). */
  date: string | null;
  slot: EatingOccasion | null;
  title: string;
  /** Base `plan_quantities`. `null` quand la composition n'a pas su peser ce plat. */
  kcal: number | null;
  /** Le plat consomme au moins une préparation cuisinée à l'avance. */
  fromPreparation: boolean;
}

export interface TrackingPlan {
  mealId: string;
  startsOn: string;
  /** `ends_on` en base est généré; on le recalcule ici pour rester pur. */
  durationDays: number;
  retired: boolean;
  planKind: "personal" | "household";
  dishes: readonly TrackingPlanDish[];
  cookingSessions: number;
  /** `generated_from.shifts[]`, apposé par `applyPlanShift` (A8.0, D7.3). */
  shifts: number;
  /** Une session déclarée non faite (`cooking_session_states.happened = false`). */
  skippedSessions: number;
  /** Une vague de courses déclarée non faite (`grocery_wave_states.done = false`). */
  pendingWaves: number;
}

/** Un fait de `protocol_events`, ramené à ce que le suivi en lit. */
export interface TrackingFact {
  /** `source_message_id` — c'est lui qui porte les préfixes du contrat §5.10. */
  key: string | null;
  localDate: string;
  slot: EatingOccasion | null;
  planRelation: "as_planned" | "off_plan" | null;
  disqualifiedReason: string | null;
  mediaPath: string | null;
  /** `recognized.energy_estimate`, seulement si les portes ont ouvert. */
  energy: { kcal: number; basis: EnergyBasis } | null;
}

export interface TrackingInput {
  /** Bornes INCLUSIVES, dans le fuseau de la personne. */
  window: { from: string; to: string };
  /** Le jour local de la personne — jamais celui du navigateur ni du serveur. */
  today: string;
  /** ⛔ LA PORTE, ET ELLE EST OBLIGATOIRE. Voir `buildTrackingReport`. */
  gate: EnergyGateResult;
  /** `null` ⇒ pas d'objectif ⇒ pas de bloc chiffré (D7.11: la courbe reste). */
  direction: "down" | "up" | null;
  /** `maintenanceRange` ou `directedRange`, déjà calculé. `null` ⇒ pas d'estimation de créneau. */
  target: EnergyTarget | null;
  /** Les occasions que la personne a DÉCLARÉES (`eating_rhythm`), pas les cinq moments horaires. */
  declaredSlots: readonly EatingOccasion[];
  plans: readonly TrackingPlan[];
  facts: readonly TrackingFact[];
  /** La dernière pesée de chaque jour, croissante (`body_measure_series.dailyValues`). */
  weights: readonly { localDate: string; value: number }[];
  /**
   * `meal_share_outcomes` n'existe qu'après A8.2. Tant qu'elle manque, le
   * compte des boîtes restées est INCONNU — jamais zéro. Un zéro affirmerait
   * qu'on a regardé.
   */
  leftoverBoxes: { known: false } | { known: true; count: number };
}

// ══════════════════════════════════════════════════════════════════════════
// LA SORTIE
// ══════════════════════════════════════════════════════════════════════════

export interface TrackingPermanent {
  /** Fenêtre écoulée, non retiré, ET au moins une coche vivante (D7.2). */
  plansDone: number;
  plansChanged: number;
  /** Σ des plats composés — un compte MESURÉ, pas un temps deviné (D7.4). */
  mealsDecided: number;
  cookSessions: number;
  /** Les repas que ces séances couvrent — le levier du lot, dit sans convention. */
  cookedForMeals: number;
}

export interface TrackingPlannedDish {
  mealId: string;
  dishIndex: number;
  slot: EatingOccasion | null;
  title: string;
  /** `ticked` = coche vivante · `off_plan` = accident déclaré · `unticked` = décochée · `silent` = personne n'a rien dit. */
  state: "ticked" | "off_plan" | "unticked" | "silent";
  energy: TrackedEnergy | null;
}

export interface TrackingPhoto {
  slot: EatingOccasion | null;
  mediaPath: string | null;
  energy: TrackedEnergy | null;
}

export interface TrackingMissedSlot {
  slot: EatingOccasion;
  /**
   * `null` quand le jour porte un fait SANS créneau: on ne sait pas s'il
   * remplit celui-ci, et une estimation en plus doublerait l'énergie déjà
   * comptée. On offre alors « Décrire » sans chiffre.
   */
  estimate: TrackedEnergy | null;
  /**
   * UN FAIT EXISTE SUR CE CRÉNEAU, MAIS IL NE PORTE AUCUN CHIFFRE.
   *
   * ⚠️ CE N'EST PAS LA MÊME CHOSE QUE « RIEN », et confondre les deux crée une
   * incitation perverse. « J'ai mangé du poulet » écrit dans la conversation
   * dit qu'un repas a eu lieu; il ne dit pas combien. Si un créneau DÉCRIT
   * perdait son estimation, décrire son repas ferait DISPARAÎTRE le chiffre du
   * jour — et le produit apprendrait à ses utilisateurs à ne rien déclarer.
   *
   * Donc: le repère de répartition reste (`estimate`), et c'est le bouton
   * « Décrire » qui disparaît — on ne redemande pas ce qui a déjà été dit.
   */
  declared: boolean;
}

export interface TrackingDay {
  date: string;
  planned: TrackingPlannedDish[];
  photos: TrackingPhoto[];
  missed: TrackingMissedSlot[];
  /** Le total du jour, base la plus faible. `null` si rien à sommer OU abstention. */
  total: TrackedTotal | null;
  /**
   * ⛔ UNE ABSTENTION, ET PAS UN ZÉRO NI UNE SOMME AMPUTÉE.
   *
   * `true` quand un plat qui DEVAIT compter (coché, ou silencieux) n'a pas de
   * chiffre: le référentiel n'a pas su peser un ingrédient, ou le plan est un
   * plan de FOYER dont on ne sait pas reconstituer la part de ce lecteur.
   *
   * C'est la règle de `plan_energy.ts` remontée d'un étage: « `null` ET PAS UNE
   * SOMME PARTIELLE. Une somme amputée de l'huile a l'air d'un résultat et vaut
   * plusieurs dizaines de pour cent d'écart, toujours dans le même sens. » Ici
   * l'écart serait TOUJOURS vers le bas, c'est-à-dire vers « tu manges moins que
   * tu ne crois » — sur exactement la question qui a motivé le chiffre.
   *
   * `total` vaut alors `null`, et l'écran DIT qu'il s'abstient au lieu de
   * n'afficher rien: une carte vide se lit « je n'ai rien mangé ».
   */
  abstained: boolean;
}

export interface TrackingObjective {
  days: TrackingDay[];
  /** Le jour courant, s'il est dans la fenêtre. */
  day: TrackedTotal | null;
  /** Les sept derniers jours de la fenêtre. */
  week: TrackedTotal | null;
  /** La fenêtre du plan qui contient `today`. `null` si aucun. */
  plan: TrackedTotal | null;
  /**
   * L'abstention REMONTE. Un jour qui s'abstient rend la semaine et le plan
   * incalculables: sommer les autres jours donnerait une semaine amputée d'un
   * jour entier, ce qui est pire que le trou d'un plat.
   */
  abstained: boolean;
}

export interface TrackingWeightPoint {
  localDate: string;
  value: number;
}

export interface TrackingReport {
  window: { from: string; to: string };
  /**
   * ⛔ LE PLANCHER TCA FERME TOUT — pas seulement les kcal. Invariant C5:
   * « sous plancher TCA, la page de suivi ne rend AUCUN chiffre ni courbe ».
   * Un compte de plans n'est pas un score, mais la doctrine W3.2 est plus large
   * que l'énergie, et cette page est celle qui porte la ceinture.
   */
  floor: boolean;
  energy: { open: boolean; reason: EnergyGateReason };
  permanent: TrackingPermanent | null;
  objective: TrackingObjective | null;
  weight: TrackingWeightPoint[] | null;
  leftoverBoxes: { known: false } | { known: true; count: number };
}

// ══════════════════════════════════════════════════════════════════════════
// LES CLÉS DE FAIT — le contrat §5.10, relu et pas deviné
// ══════════════════════════════════════════════════════════════════════════

const MEAL_TICK_PREFIX = "meal_tick:";
const ACCIDENT_OFF_PLAN_PREFIX = "accident_off_plan:";

/** `meal_tick:<planId>:<idx>` → `{ mealId, dishIndex }`. `null` sinon. */
export function readDishKey(
  key: string | null | undefined,
  prefix: string,
): { mealId: string; dishIndex: number } | null {
  const raw = String(key ?? "");
  if (!raw.startsWith(prefix)) return null;
  const rest = raw.slice(prefix.length);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0) return null;
  const mealId = rest.slice(0, cut);
  const dishIndex = Number(rest.slice(cut + 1));
  if (!mealId || !Number.isInteger(dishIndex) || dishIndex < 0) return null;
  return { mealId, dishIndex };
}

// ══════════════════════════════════════════════════════════════════════════
// LES DATES — arithmétique de calendrier, sans fuseau (les bornes arrivent
// déjà résolues dans celui de la personne)
// ══════════════════════════════════════════════════════════════════════════

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, field: string): string {
  if (!ISO_DATE.test(value)) {
    throw new Error(`[keel/tracking] ${field} n'est pas une date ISO: ${value}`);
  }
  return value;
}

export function addDays(localDate: string, days: number): string {
  assertDate(localDate, "localDate");
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Toutes les dates de `[from, to]`, incluses, croissantes. */
export function datesBetween(from: string, to: string): string[] {
  assertDate(from, "from");
  assertDate(to, "to");
  const out: string[] = [];
  let cursor = from;
  // Borne dure: une fenêtre de suivi ne dépasse pas un an et demi. Sans elle,
  // une borne inversée par erreur bouclerait jusqu'à la fin du monde.
  for (let i = 0; cursor <= to && i < 600; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** La dernière date couverte par le plan. */
export function planEndsOn(plan: TrackingPlan): string {
  const days = Math.max(1, Math.trunc(plan.durationDays));
  return addDays(plan.startsOn, days - 1);
}

// ══════════════════════════════════════════════════════════════════════════
// L'ESTIMATION D'UN CRÉNEAU NON RENSEIGNÉ (D7.8)
// ══════════════════════════════════════════════════════════════════════════

/**
 * LA PART D'UNE JOURNÉE QU'UN CRÉNEAU PÈSE, NORMALISÉE SUR LES CRÉNEAUX
 * DÉCLARÉS — et cette normalisation N'EST PAS UN DÉTAIL.
 *
 * `SLOT_DAY_WEIGHT` est une clé de RÉPARTITION, pas une valeur absolue: son
 * en-tête le dit (« la somme ne fait plus 1, et ce n'est pas un défaut »), et la
 * somme sur les six occasions vaut 1,30. Multiplier une cible de JOURNÉE par
 * 0,40 pour un déjeuner, puis recommencer pour les cinq autres, rendrait donc
 * 130 % de la journée — un dépassement de 30 % qu'aucun test n'aurait vu, et
 * qui aurait exactement la forme du défaut « un facteur ne porte que sur la
 * part mobile ».
 *
 * On divise donc par la somme des poids DÉCLARÉS, comme `dayCoverageOf` le fait
 * déjà pour la couverture: le rapport est le même, et l'échelle redevient une
 * journée. C'est l'extension de sens que D7.8 demande d'écrire, et elle est
 * aussi réécrite dans l'en-tête de `SLOT_DAY_WEIGHT`.
 */
export function slotDayShare(
  slot: EatingOccasion,
  declared: readonly EatingOccasion[],
): number {
  const weight = SLOT_DAY_WEIGHT[slot];
  if (weight === undefined) {
    throw new Error(`[keel/tracking] créneau sans poids: ${slot}`);
  }
  let total = 0;
  for (const s of declared) {
    const w = SLOT_DAY_WEIGHT[s];
    if (w === undefined) {
      throw new Error(`[keel/tracking] créneau déclaré sans poids: ${s}`);
    }
    total += w;
  }
  if (total <= 0) return 0;
  return weight / total;
}

/**
 * Le milieu de la fourchette, réparti sur le créneau, arrondi aux 50.
 *
 * L'arrondi aux 50 est celui de `energy_target.ts`: rendre « 428 kcal » pour une
 * convention donnerait à une clé de répartition la précision d'une pesée.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `target` EST UN ENTRETIEN, ET JAMAIS UNE CIBLE — LA FORMULE EN DÉPEND
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le mandat de ce lot proposait « `maintenanceRange` OU `directedRange` si
 * direction ». C'est le seul endroit où l'on peut voir pourquoi la seconde
 * moitié était fausse, alors on l'écrit ICI, contre la formule, et pas
 * seulement dans le journal de la lane.
 *
 * Cette fourchette ne PRESCRIT pas, elle RECONSTITUE: elle répond à « ce repas
 * que personne n'a noté, il pesait combien ? ». Y mettre la cible de la
 * personne rend la réponse circulaire — le repas manquant revient pile au
 * niveau du déficit, et le total du jour lui montre qu'elle a tenu son
 * objectif **parce qu'on l'a supposé**. Sur un déficit de 500 kcal et deux
 * repas non renseignés, l'écart atteint l'ordre du tiers de la journée, et il
 * penche toujours du même côté: celui qui rassure.
 *
 * On lui rendrait son objectif déguisé en mesure. C'est la différence entre une
 * estimation et une prophétie, et la base `slot_estimate` ne rattraperait pas
 * ça: elle dit « c'est une convention », elle ne dit pas « c'est une convention
 * qui vous donne raison ».
 *
 * L'entretien est le seul a priori NEUTRE dont on dispose sur un repas dont on
 * ne sait rien. L'appelant (`tracking_window_io.ts`) ne passe donc jamais
 * `directedRange` ici — arbitrage validé par l'orchestrateur le 2026-09-03.
 */
export function slotEstimate(
  target: EnergyTarget | null,
  slot: EatingOccasion,
  declared: readonly EatingOccasion[],
): TrackedEnergy | null {
  const range = target?.range ?? null;
  if (!range) return null;
  const share = slotDayShare(slot, declared);
  if (share <= 0) return null;
  const mid = (range.low + range.high) / 2;
  const kcal = Math.round((mid * share) / 50) * 50;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  return { kcal, basis: "slot_estimate" };
}

// ══════════════════════════════════════════════════════════════════════════
// L'AGRÉGAT
// ══════════════════════════════════════════════════════════════════════════

/** Un fait compte-t-il ? Un fait disqualifié est un fait que la personne a retiré. */
function isLive(fact: TrackingFact): boolean {
  return fact.disqualifiedReason === null;
}

function occasionOf(slot: string | null): EatingOccasion | null {
  return (EATING_OCCASIONS as readonly string[]).includes(String(slot ?? ""))
    ? (slot as EatingOccasion)
    : null;
}

/**
 * LE RAPPORT DE SUIVI D'UNE PERSONNE.
 *
 * ⛔ LA PORTE EST LUE AVANT TOUT LE RESTE, ET C'EST LA PREMIÈRE INSTRUCTION.
 * `energy_gate.ts` est fail-closed par construction; ce module l'est aussi. Un
 * appelant qui ne passerait pas `gate` obtient une exception, pas un rapport
 * ouvert — « un paramètre de garde optionnel est une garde désarmée ».
 */
export function buildTrackingReport(input: TrackingInput): TrackingReport {
  if (!input || typeof input !== "object") {
    throw new Error("[keel/tracking] entrée absente");
  }
  const gate = input.gate;
  if (
    !gate || typeof gate.show !== "boolean" || typeof gate.reason !== "string"
  ) {
    throw new Error(
      "[keel/tracking] `gate` est obligatoire — un rapport sans porte serait une garde désarmée",
    );
  }
  const from = assertDate(input.window.from, "window.from");
  const to = assertDate(input.window.to, "window.to");
  assertDate(input.today, "today");

  const floor = gate.reason === "restriction_floor";
  const energy = { open: gate.show === true, reason: gate.reason };

  // ⛔ LE PLANCHER, ET IL SORT ICI. Rien n'est calculé en dessous: pas un
  // compte, pas une pesée. Ce n'est pas une préférence d'affichage.
  if (floor) {
    return {
      window: { from, to },
      floor: true,
      energy,
      permanent: null,
      objective: null,
      weight: null,
      leftoverBoxes: input.leftoverBoxes,
    };
  }

  const facts = input.facts ?? [];
  const plans = input.plans ?? [];

  // ── LES FAITS, INDEXÉS ────────────────────────────────────────────────
  /** `<mealId>:<idx>` → l'état de la coche. */
  const tickState = new Map<string, "ticked" | "unticked">();
  /** `<mealId>:<idx>` d'un accident déclaré. */
  const offPlan = new Set<string>();
  /** Les plans qui portent au moins une coche VIVANTE. */
  const plansWithLiveTick = new Set<string>();
  /** Les plans qui portent un accident. */
  const plansWithAccident = new Set<string>();

  for (const fact of facts) {
    const tick = readDishKey(fact.key, MEAL_TICK_PREFIX);
    if (tick) {
      const id = `${tick.mealId}:${tick.dishIndex}`;
      if (isLive(fact)) {
        tickState.set(id, "ticked");
        plansWithLiveTick.add(tick.mealId);
      } else if (!tickState.has(id)) {
        tickState.set(id, "unticked");
      }
      continue;
    }
    const accident = readDishKey(fact.key, ACCIDENT_OFF_PLAN_PREFIX);
    if (accident && isLive(fact)) {
      offPlan.add(`${accident.mealId}:${accident.dishIndex}`);
      plansWithAccident.add(accident.mealId);
    }
  }

  // ── LE BLOC PERMANENT ─────────────────────────────────────────────────
  let plansDone = 0;
  let plansChanged = 0;
  let mealsDecided = 0;
  let cookSessions = 0;
  let cookedForMeals = 0;

  for (const plan of plans) {
    mealsDecided += plan.dishes.length;
    cookSessions += Math.max(0, Math.trunc(plan.cookingSessions));
    cookedForMeals += plan.dishes.filter((d) => d.fromPreparation).length;

    const elapsed = planEndsOn(plan) < input.today;
    if (elapsed && !plan.retired && plansWithLiveTick.has(plan.mealId)) {
      plansDone += 1;
    }
    const changed = plansWithAccident.has(plan.mealId) ||
      plan.shifts > 0 ||
      plan.skippedSessions > 0 ||
      plan.pendingWaves > 0;
    if (changed) plansChanged += 1;
  }

  const permanent: TrackingPermanent = {
    plansDone,
    plansChanged,
    mealsDecided,
    cookSessions,
    cookedForMeals,
  };

  // ── LA COURBE DE POIDS ────────────────────────────────────────────────
  // ⟳ RENVERSEMENT ÉCRIT — FF-031 §3 « aucune nouvelle surface d'affichage,
  // pas de graphe quotidien » (R2, D7.10). La fiche est amendée au même
  // commit. Ce que la ligne rend possible et qu'un nombre ne rendait pas: voir
  // la fiche. Ce qui NE change pas: sous plancher, il n'y a pas de courbe —
  // c'est le `return` ci-dessus, pas un `if` dans le composant.
  // Elle existe en maintien aussi (D7.11): C2 relance déjà la pesée tous les
  // deux jours pour un maintien, et lui refuser la lecture de ce qu'on lui
  // demande d'écrire serait incohérent.
  const weight = (input.weights ?? [])
    .filter((w) => w.localDate >= from && w.localDate <= to)
    .map((w) => ({ localDate: w.localDate, value: w.value }));

  // ── LE BLOC OBJECTIF ──────────────────────────────────────────────────
  // Il n'existe que si la direction est posée (④ de FF-059) ET si la porte de
  // l'énergie est ouverte. Une direction sans porte ouverte, c'est un mineur,
  // un âge inconnu, une doctrine qui refuse de compter, ou l'interrupteur de la
  // personne sur « non »: dans les quatre cas, aucun chiffre.
  if (input.direction === null || !energy.open) {
    return {
      window: { from, to },
      floor: false,
      energy,
      permanent,
      objective: null,
      weight,
      leftoverBoxes: input.leftoverBoxes,
    };
  }

  const declared = (input.declaredSlots ?? []).filter((s) =>
    (EATING_OCCASIONS as readonly string[]).includes(s)
  );

  /** date → les plats du plan qui y tombent. */
  const dishesByDate = new Map<string, TrackingPlannedDish[]>();
  for (const plan of plans) {
    for (const dish of plan.dishes) {
      if (!dish.date) continue;
      const id = `${plan.mealId}:${dish.dishIndex}`;
      const state: TrackingPlannedDish["state"] = offPlan.has(id)
        ? "off_plan"
        : tickState.get(id) === "ticked"
        ? "ticked"
        : tickState.get(id) === "unticked"
        ? "unticked"
        : "silent";
      // Un plat coché ou silencieux compte; décoché ou hors plan, non.
      // ⚠️ `silent` porte la base `assumed` et PAS `plan_quantities`: personne
      // n'a dit qu'il avait été mangé. D8.2 — « pas de nouvelles » se lit, ne
      // s'écrit pas, et se DIT quand on l'a lu.
      const energyOf: TrackedEnergy | null = dish.kcal === null
        ? null
        : state === "ticked"
        ? { kcal: dish.kcal, basis: PLAN_ENERGY_BASIS }
        : state === "silent"
        ? { kcal: dish.kcal, basis: "assumed" }
        : null;
      const entry: TrackingPlannedDish = {
        mealId: plan.mealId,
        dishIndex: dish.dishIndex,
        slot: dish.slot,
        title: dish.title,
        state,
        energy: energyOf,
      };
      const bucket = dishesByDate.get(dish.date);
      if (bucket) bucket.push(entry);
      else dishesByDate.set(dish.date, [entry]);
    }
  }

  /** date → les faits vivants de ce jour. */
  const factsByDate = new Map<string, TrackingFact[]>();
  for (const fact of facts) {
    if (!isLive(fact)) continue;
    if (fact.localDate < from || fact.localDate > to) continue;
    // Une coche et un accident sont déjà lus par le plat qu'ils désignent: les
    // relire ici les compterait deux fois.
    if (readDishKey(fact.key, MEAL_TICK_PREFIX)) continue;
    if (readDishKey(fact.key, ACCIDENT_OFF_PLAN_PREFIX)) continue;
    const bucket = factsByDate.get(fact.localDate);
    if (bucket) bucket.push(fact);
    else factsByDate.set(fact.localDate, [fact]);
  }

  const days: TrackingDay[] = datesBetween(from, to).map((date) => {
    const planned = dishesByDate.get(date) ?? [];
    const dayFacts = factsByDate.get(date) ?? [];
    const photos: TrackingPhoto[] = dayFacts.map((f) => ({
      slot: occasionOf(f.slot),
      mediaPath: f.mediaPath,
      energy: f.energy
        ? { kcal: f.energy.kcal, basis: trackingBasisOfPhoto(f.energy.basis) }
        : null,
    }));

    // ── LES CRÉNEAUX LOUPÉS — les SIX occasions déclarées (D7.6) ────────
    // ⚠️ ET PAS LES CINQ MOMENTS HORAIRES. `lib/mealRhythm.ts` range un fait
    // par son heure faute de `slot_key` (NULL sur 71 % des lignes); c'est bon
    // pour dessiner une grille, ce serait faux pour DÉCIDER qu'un repas manque.
    // Un PLAT du plan couvre son créneau: son énergie est la vraie, exacte.
    const cookedSlots = new Set<string>();
    for (const p of planned) if (p.slot) cookedSlots.add(p.slot);
    // Un fait AVEC chiffre couvre le sien de la même façon.
    const weighedSlots = new Set<string>();
    // Un fait SANS chiffre dit qu'un repas a eu lieu, et rien de plus.
    const declaredSlotsWithoutNumber = new Set<string>();
    for (const f of dayFacts) {
      const s = occasionOf(f.slot);
      if (!s) continue;
      if (f.energy) weighedSlots.add(s);
      else declaredSlotsWithoutNumber.add(s);
    }
    /**
     * ⚠️ CE QUE CE MODULE REFUSE DE DEVINER. Un fait sans `slot_key` peut être
     * le déjeuner qu'on s'apprête à déclarer manquant. Lui attribuer un créneau
     * d'après son heure serait une CONVENTION DE TEMPS neuve — et une seconde,
     * concurrente de celle des cinq moments. On liste donc quand même le
     * créneau (la personne peut le décrire), mais on ne l'ESTIME pas: le
     * chiffre s'ajouterait à une énergie déjà comptée.
     */
    const unattributed = dayFacts.some((f) => occasionOf(f.slot) === null);
    const missed: TrackingMissedSlot[] = declared
      // Un créneau que le plan a composé, ou qu'une lecture a pesé, n'a pas
      // besoin de repère: on a mieux.
      .filter((slot) => !cookedSlots.has(slot) && !weighedSlots.has(slot))
      // Un créneau du futur n'est pas loupé: il n'est pas encore arrivé.
      .filter(() => date <= input.today)
      .map((slot) => ({
        slot,
        estimate: unattributed
          ? null
          : slotEstimate(input.target, slot, declared),
        declared: declaredSlotsWithoutNumber.has(slot),
      }));

    const parts: TrackedEnergy[] = [
      ...planned.map((p) => p.energy).filter((e): e is TrackedEnergy =>
        e !== null
      ),
      ...photos.map((p) => p.energy).filter((e): e is TrackedEnergy =>
        e !== null
      ),
      ...missed.map((m) => m.estimate).filter((e): e is TrackedEnergy =>
        e !== null
      ),
    ];

    // ⛔ L'ABSTENTION SE DÉCIDE AVANT LA SOMME. Un plat qui compte mais qu'on
    // n'a pas su peser rend la journée incalculable — voir `TrackingDay`.
    const abstained = planned.some((p) =>
      (p.state === "ticked" || p.state === "silent") && p.energy === null
    );

    return {
      date,
      planned,
      photos,
      missed,
      total: abstained ? null : sumEnergy(parts),
      abstained,
    };
  });

  const dayTotal = days.find((d) => d.date === input.today)?.total ?? null;

  // Une portée s'abstient dès qu'UN de ses jours s'abstient. Sommer les autres
  // rendrait une semaine amputée d'un jour, plus faux que le trou d'un plat.
  const totalOver = (
    within: (d: TrackingDay) => boolean,
  ): { total: TrackedTotal | null; abstained: boolean } => {
    const inScope = days.filter(within);
    const abstained = inScope.some((d) => d.abstained);
    if (abstained) return { total: null, abstained: true };
    return {
      total: sumEnergy(
        inScope.filter((d) => d.total !== null).map((d) => d.total as TrackedTotal),
      ),
      abstained: false,
    };
  };

  const weekFrom = addDays(to, -6);
  const weekScope = totalOver((d) => d.date >= weekFrom);
  const week = weekScope.total;

  const livePlan = plans.find((p) =>
    !p.retired && p.startsOn <= input.today && planEndsOn(p) >= input.today
  ) ?? null;
  const planScope = livePlan
    ? totalOver((d) =>
      d.date >= livePlan.startsOn && d.date <= planEndsOn(livePlan)
    )
    : { total: null, abstained: false };
  const planTotal = planScope.total;

  return {
    window: { from, to },
    floor: false,
    energy,
    permanent,
    objective: {
      days,
      day: dayTotal,
      week,
      plan: planTotal,
      abstained: days.some((d) => d.abstained),
    },
    weight,
    leftoverBoxes: input.leftoverBoxes,
  };
}

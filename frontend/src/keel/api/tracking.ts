import { supabase } from "../../lib/supabase";
import { readEdgeRefusal } from "./edgeErrors";

/**
 * LE SUIVI, CÔTÉ ÉCRAN — un seul appel, une seule passe, aucune décision ici.
 *
 * ── POURQUOI UN AGRÉGAT SERVEUR ET PAS N REQUÊTES (D7.9) ──────────────────
 * `/app/progress` posait trois requêtes et recomposait ses comptes dans le
 * composant. Deux choses en découlaient, et les deux sont fermées côté serveur:
 *
 *  ① LA PORTE DE L'ÉNERGIE NE PEUT PAS ÊTRE LUE ICI. Ses cinq entrées
 *    (plancher TCA, âge, doctrine du coach, interrupteur de la personne, cible)
 *    demandent la doctrine publiée et `evaluateRestrictionForStudent`, qui ne
 *    sont pas lisibles depuis le navigateur. L'écran lisait donc
 *    `weekly_reviews.risk_band` — une colonne SANS ÉCRIVAIN depuis le
 *    2026-08-08: la ceinture était armée sur un coffre vide, elle ne s'est
 *    jamais levée pour personne. Elle est partie avec ce lot.
 *  ② UN KCAL NE SE CALCULE PAS DANS UN COMPOSANT. `CALORIE_REVERSAL.md` §5:
 *    le chiffre se recalcule côté serveur ou il n'existe pas, et il porte sa
 *    base. Ce module transporte, il n'arithmétise rien.
 *
 * ── LA MOITIÉ MIROIR, ET POURQUOI ELLE N'EST PAS UN IMPORT ────────────────
 * Les types ci-dessous DOUBLENT ceux de
 * `supabase/functions/_shared/keel/tracking_window.ts`. Le dépôt sait importer
 * un module `_shared` depuis le front (`MouthFormDialog.tsx:47`), mais
 * `tracking_window.ts` tire `meal_generation.ts`, qui tire
 * `sophia-brain/skills/…` — c'est-à-dire la moitié du serveur dans le bundle du
 * navigateur. Le miroir est donc volontaire, comme `EnergyBasis` dans
 * `mealPhoto.ts` et `EATING_OCCASIONS` dans `mealGeneration.ts`, et il est
 * TENU PAR UN TEST qui relit la source du serveur (`tracking.int.test.ts`):
 * une base ajoutée là-bas et pas ici fait rougir, elle ne dérive pas en
 * silence.
 *
 * ⚠️ JETONS ASCII ICI, MOTS DANS LE COMPOSANT. `pageSeams` rougit si une phrase
 * traduisible descend dans `api/`.
 */

/** Le nom de la fonction edge. Une seule définition. */
export const TRACKING_FUNCTION = "keel-tracking-v1";

/**
 * LES CINQ BASES, DANS L'ORDRE DU SERVEUR (de la plus forte à la plus faible).
 * L'ordre est le contrat: `weakestBasis` s'en sert pour choisir la base d'une
 * somme, et la clé i18n d'un total est nommée PAR elle.
 */
export const TRACKING_BASES = [
  "plan_quantities",
  "declared_quantities",
  "photo_estimate",
  "slot_estimate",
  "assumed",
] as const;

export type TrackingBasis = (typeof TRACKING_BASES)[number];

/** Les portées d'un total. Le mot qui les nomme vit dans le composant. */
export const TRACKING_SCOPES = ["day", "week", "plan"] as const;
export type TrackingScope = (typeof TRACKING_SCOPES)[number];

/** L'état d'un plat du plan, tel que le serveur l'a lu. */
export const TRACKING_DISH_STATES = [
  "ticked",
  "off_plan",
  "unticked",
  "silent",
] as const;
export type TrackingDishState = (typeof TRACKING_DISH_STATES)[number];

/** ⛔ UN CHIFFRE D'ÉNERGIE N'EXISTE PAS SANS SA BASE. Le type est la garde. */
export interface TrackedEnergy {
  kcal: number;
  basis: TrackingBasis;
}

export interface TrackedTotal extends TrackedEnergy {
  parts: number;
}

export interface TrackingPlannedDish {
  mealId: string;
  dishIndex: number;
  slot: string | null;
  title: string;
  state: TrackingDishState;
  energy: TrackedEnergy | null;
}

export interface TrackingPhoto {
  slot: string | null;
  mediaPath: string | null;
  energy: TrackedEnergy | null;
}

export interface TrackingMissedSlot {
  slot: string;
  /** `null` quand le jour porte un fait sans créneau — voir le module serveur. */
  estimate: TrackedEnergy | null;
}

export interface TrackingDay {
  date: string;
  planned: TrackingPlannedDish[];
  photos: TrackingPhoto[];
  missed: TrackingMissedSlot[];
  total: TrackedTotal | null;
}

export interface TrackingObjective {
  days: TrackingDay[];
  day: TrackedTotal | null;
  week: TrackedTotal | null;
  plan: TrackedTotal | null;
}

export interface TrackingPermanent {
  plansDone: number;
  plansChanged: number;
  mealsDecided: number;
  cookSessions: number;
  cookedForMeals: number;
}

export interface TrackingWeightPoint {
  localDate: string;
  value: number;
}

export interface TrackingReport {
  window: { from: string; to: string };
  /** ⛔ Le plancher TCA. `true` ⇒ l'écran ne rend ni chiffre ni courbe. */
  floor: boolean;
  energy: { open: boolean; reason: string };
  permanent: TrackingPermanent | null;
  objective: TrackingObjective | null;
  weight: TrackingWeightPoint[] | null;
  leftoverBoxes: { known: false } | { known: true; count: number };
}

/**
 * LE REPLI, ET IL EST FERMÉ.
 *
 * Une réponse illisible ne devient pas un rapport vide: un rapport vide a
 * `floor: false` et laisserait l'écran ouvrir des blocs sur du néant. On lève,
 * et la page rend son erreur. « Le lecteur sait déjà réparer » est une
 * affirmation à vérifier — ici, il ne répare pas, il refuse.
 */
function asReport(raw: unknown): TrackingReport {
  const r = raw as Partial<TrackingReport> | null;
  if (
    !r || typeof r !== "object" || typeof r.floor !== "boolean" ||
    !r.window || typeof r.window.from !== "string" ||
    typeof r.window.to !== "string" ||
    !r.energy || typeof r.energy.open !== "boolean"
  ) {
    throw new Error("keel_tracking_unreadable");
  }
  return {
    window: r.window,
    floor: r.floor,
    energy: r.energy,
    permanent: r.permanent ?? null,
    objective: r.objective ?? null,
    weight: r.weight ?? null,
    leftoverBoxes: r.leftoverBoxes ?? { known: false },
  };
}

/**
 * Le rapport de suivi de la personne connectée, sur `[from, to]` inclus.
 *
 * ⚠️ AUCUN `user_id` DANS LE CORPS. L'identité vient du JWT, côté serveur, comme
 * `meal-energy-v1`: un identifiant passé par le client est une invitation à
 * demander celui d'un autre.
 */
export async function loadTracking(
  window: { from: string; to: string },
): Promise<TrackingReport> {
  const { data, error } = await supabase.functions.invoke(TRACKING_FUNCTION, {
    body: { from: window.from, to: window.to },
  });
  if (error) {
    const refusal = await readEdgeRefusal(error);
    throw new Error(refusal?.token ?? (error as Error).message);
  }
  return asReport(data);
}

/**
 * « DÉCRIRE » UN CRÉNEAU LOUPÉ — le chemin TEXTE, et pourquoi il n'est pas le
 * chemin des questions de précision.
 *
 * ⚠️ `meal_precision.ts` INTERDIT de DEMANDER une quantité: le contrat
 * (`CONTRACT.md`, non-input #4) refuse toute mesure d'énergie ou de masse posée
 * en question, et ses gabarits sont fermés pour que la garde ne puisse pas
 * dériver. Ce chemin-ci ne demande RIEN: il ouvre un champ libre. Si la
 * personne y écrit « 150 g de riz », c'est ELLE qui a mesuré, et
 * `quantity_from_prose.ts` sait relire un nombre écrit — la lecture porte alors
 * la base `declared_quantities` (MAPE 2,3 %). Sinon, elle porte
 * `photo_estimate` comme n'importe quelle lecture sans quantité. D7.7: le
 * contournement est EXPRÈS, et il est nommé.
 *
 * ⛔ Aucun `user_id` dans le corps: l'identité vient du JWT.
 */
export interface DescribeResult {
  ok: boolean;
  /** Le jeton d'un refus nommé, ou `null` si la déclaration est passée. */
  reason: string | null;
  energy: TrackedEnergy | null;
}

export async function describeMissedMeal(args: {
  localDate: string;
  slot: string;
  text: string;
}): Promise<DescribeResult> {
  const { data, error } = await supabase.functions.invoke(TRACKING_FUNCTION, {
    body: {
      action: "describe",
      local_date: args.localDate,
      slot: args.slot,
      text: args.text,
    },
  });
  if (error) {
    const refusal = await readEdgeRefusal(error);
    throw new Error(refusal?.token ?? (error as Error).message);
  }
  const d = data as Partial<DescribeResult> | null;
  if (!d || typeof d.ok !== "boolean") throw new Error("keel_tracking_unreadable");
  return { ok: d.ok, reason: d.reason ?? null, energy: d.energy ?? null };
}

// KEEL — le contrat du point hebdomadaire, côté client.
//
// ── POURQUOI CES CONSTANTES SONT DUPLIQUÉES, ET CE QUI EMPÊCHE LA DÉRIVE ─────
// La vérité vit dans `supabase/functions/_shared/keel/weekly_flow.ts` : c'est
// ce module qui PARSE la réponse, et un axe que l'écran propose mais que le
// parseur ignore est une case que l'élève remplit dans le vide. Le front est en
// Vite/TS et le back en Deno : il n'y a pas d'import possible entre les deux.
//
// La copie est donc assumée, ET GARDÉE : `weeklyCheckIn.int.test.ts` lit le
// fichier Deno sur le disque et vérifie que les deux listes coïncident. Le test
// existe parce que « every axis the form asks for is an axis the parser reads »
// est déjà un test côté serveur — la même règle traverse maintenant la
// frontière des deux runtimes, là où elle peut réellement diverger.

// ── CE QUI A CHANGÉ AU LOT 4, ET CE QUI N'A PAS BOUGÉ ──────────────────────
// Les onze LIBELLÉS (six axes, cinq crans) étaient des `Record` en dur ici. Ils
// sont passés dans le seed (`chat.weekly.axis.*`, `chat.weekly.scale.*`) et
// portent une version française.
//
// ⚠️ LE CONTRAT AVEC LE DENO N'A PAS ÉTÉ RELÂCHÉ, IL A ÉTÉ RÉANCRÉ. Le test
// comparait `WEEKLY_AXIS_LABELS[axis]` au fichier serveur mot pour mot; il
// compare maintenant `en["chat.weekly.axis." + axis]` au même fichier, ce qui
// est LA MÊME CHAÎNE et la même exigence. Ce qui a été tranché, c'est que le
// pack français n'a pas de jumelle serveur À FAIRE: les constantes `_EN` de
// `weekly_flow.ts` ne servent aucun écran d'élève — elles nourrissent des
// consignes de modèle (`meal_generation.ts`, `week_plan_generation.ts`, en
// anglais par construction) et `weeklyFlowJson()`, la définition d'un
// formulaire Meta héritée du canal WhatsApp. Aucun `RENDER_PACKS` à écrire, et
// aucune ligne de Deno touchée.

import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";

export const WEEKLY_AXES = [
  "energy",
  "hunger",
  "sleep",
  "digestion",
  "mood",
  "training",
] as const;
export type WeeklyAxis = (typeof WEEKLY_AXES)[number];

/**
 * L'axe, en mots, dans la langue de la page.
 *
 * Une FONCTION et pas une table de module: `t()` est résolu à l'appel, et une
 * table construite à l'import se figerait à la langue du premier chargement —
 * c'est exactement ce que la règle `MODULE_SCOPE_T` d'`i18n-lint.mjs` refuse.
 */
export function weeklyAxisLabel(axis: WeeklyAxis): string {
  return t(`chat.weekly.axis.${axis}`);
}

/** Les cinq crans, nommés. Un chiffre nu invite chacun à sa propre échelle. */
export const WEEKLY_SCALE_VALUES = [1, 2, 3, 4, 5] as const;
export type WeeklyScore = (typeof WEEKLY_SCALE_VALUES)[number];

export function weeklyScaleLabel(score: WeeklyScore): string {
  return t(`chat.weekly.scale.${score}`);
}

// Bornes de plausibilité. Volontairement larges : il ne s'agit pas de juger un
// corps mais d'attraper une faute de frappe.
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 400;
export const WAIST_CM_MIN = 30;
export const WAIST_CM_MAX = 250;

/** Le préfixe du jeton de semaine. Il ne porte QUE la semaine. */
export const WEEKLY_TOKEN_PREFIX = "KEEL_WEEKLY_";

// ---------------------------------------------------------------------------
// R4 — LA DÉCISION DE SOUMISSION, PURE ET DONC TESTABLE
// ---------------------------------------------------------------------------

/** Les deux mesures, nommées pour que l'erreur puisse dire laquelle. */
export type WeeklyMeasureField = "weight" | "waist";

export type WeeklySubmissionError =
  | { kind: "not_a_number"; field: WeeklyMeasureField }
  | { kind: "out_of_range"; field: WeeklyMeasureField; min: number; max: number }
  /** Rien du tout n'a été saisi. `axesShown` décide du message à afficher. */
  | { kind: "empty"; axesShown: boolean };

export type WeeklySubmission =
  | { ok: true; values: Record<string, number> }
  | { ok: false; error: WeeklySubmissionError };

const MEASURE_BOUNDS: Record<WeeklyMeasureField, { min: number; max: number }> = {
  weight: { min: WEIGHT_KG_MIN, max: WEIGHT_KG_MAX },
  waist: { min: WAIST_CM_MIN, max: WAIST_CM_MAX },
};

/**
 * Ce qui part quand l'élève valide le point hebdomadaire — ou ce qui le refuse.
 *
 * ── POURQUOI C'EST ICI ET PAS DANS LE COMPOSANT ─────────────────────────────
 * Ce dépôt n'a pas de jsdom: un composant React ne se rend pas dans un test
 * unitaire, seulement dans un E2E. La règle qui compte n'aurait donc eu AUCUNE
 * épreuve à sa taille — et c'est exactement celle qui s'est cassée en R4. Sortie
 * du rendu, elle se teste dans les deux modes en quatre lignes.
 *
 * ── LA RÈGLE QUE R4 A DÛ CORRIGER, ET LE DÉFAUT QU'ELLE FERME ──────────────
 * La vacuité se comptait sur les AXES seuls. Cacher les axes — ce que R4 fait
 * pour tout élève sans coach humain, parce que personne ne lit ces six notes —
 * rendait le formulaire IMPOSSIBLE à soumettre: l'élève tapait son poids et
 * recevait « Give at least one of the six a score » sur un écran qui n'en
 * proposait aucun. Le retrait aurait cassé la boucle du poids, c'est-à-dire la
 * seule chose que le point hebdo garde en B2C.
 *
 * VACUITÉ = RIEN DU TOUT. Un axe compte, une mesure compte.
 *
 * ── HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord ────────────────────
 * Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie. Le serveur
 * applique déjà la même règle (`readMeasure` dans `weekly_flow.ts`); ici c'est
 * pour que l'élève voie son erreur au lieu de la subir en silence.
 *
 * ── LES AXES NE PARTENT QUE S'ILS ONT ÉTÉ DEMANDÉS ──────────────────────────
 * `showAxes: false` ignore `scores` au lieu de faire confiance à un état vide.
 * Un score qui survivrait à un changement de mode serait une valeur que personne
 * n'a saisie, et le serveur l'écrirait sans broncher.
 */
export function buildWeeklySubmission(input: {
  showAxes: boolean;
  scores: Partial<Record<WeeklyAxis, number>>;
  weight: string;
  waist: string;
}): WeeklySubmission {
  const readMeasure = (
    raw: string,
    field: WeeklyMeasureField,
  ): { ok: true; value: number | null } | { ok: false; error: WeeklySubmissionError } => {
    const text = String(raw ?? "").trim();
    if (!text) return { ok: true, value: null };
    // La virgule décimale est ce que tape la moitié de l'Europe.
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n)) return { ok: false, error: { kind: "not_a_number", field } };
    const { min, max } = MEASURE_BOUNDS[field];
    if (n < min || n > max) {
      return { ok: false, error: { kind: "out_of_range", field, min, max } };
    }
    return { ok: true, value: n };
  };

  const w = readMeasure(input.weight, "weight");
  if (!w.ok) return { ok: false, error: w.error };
  const c = readMeasure(input.waist, "waist");
  if (!c.ok) return { ok: false, error: c.error };

  const values: Record<string, number> = {};
  if (input.showAxes) {
    for (const axis of WEEKLY_AXES) {
      const score = input.scores[axis];
      if (typeof score === "number") values[axis] = score;
    }
  }
  if (w.value !== null) values.weight_kg = w.value;
  if (c.value !== null) values.waist_cm = c.value;

  if (Object.keys(values).length === 0) {
    return { ok: false, error: { kind: "empty", axesShown: input.showAxes } };
  }
  return { ok: true, values };
}

/**
 * R4 — LES SIX AXES SE DEMANDENT-ILS À CET ÉLÈVE ?
 *
 * ── LA RÈGLE, ET POURQUOI ELLE PASSE PAR LE SERVEUR ─────────────────────────
 * « On ne collecte une donnée que si quelque chose en aval la consomme. » Les
 * six axes 1-5 n'ont qu'un lecteur — la synthèse de cohorte du coach. Sans coach
 * humain, personne ne les lit, donc on ne les demande pas. Le poids et le tour
 * de taille restent demandés à tout le monde: leurs lecteurs
 * (`/app/progress`, la ceinture restrictive, FF-008) ne dépendent pas du coach.
 *
 * Ça ne peut pas se décider côté client: l'élève lit sa ligne `coach_clients`
 * mais PAS la ligne `coaches` de son coach, donc `coach_kind` lui est
 * structurellement invisible. La fonction `my_biofeedback_has_reader()` rend le
 * booléen et rien d'autre — pas d'identifiant, pas de nom, pas de genre de
 * coach.
 *
 * ⚠️ FAIL-CLOSED, ET C'EST LE SENS DE LA RÈGLE. Une lecture qui échoue rend
 * `false`: on ne demande pas. « Je ne peux pas prouver qu'un aval consomme »
 * doit se comporter comme « aucun aval ne consomme », jamais comme « collecte ».
 * Le pire cas est un dimanche sans les six axes; l'inverse serait six champs
 * remplis pour rien, ce que ce lot existe pour supprimer.
 */
export async function loadBiofeedbackHasReader(): Promise<boolean> {
  const { data, error } = await supabase.rpc("my_biofeedback_has_reader");
  if (error) {
    console.warn("[keel/weekly] biofeedback reader unreadable", error.message);
    return false;
  }
  return data === true;
}

/** `true` si ce payload de bouton ouvre le formulaire hebdomadaire. */
export function isWeeklyCheckInToken(payload: string): boolean {
  return /^KEEL_WEEKLY_\d{4}-\d{2}-\d{2}$/.test(String(payload ?? "").trim());
}

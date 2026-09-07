// KEEL — COCHER UN REPAS DU PLAN, ET LE DÉCOCHER.
//
// Le raisonnement complet vit dans `_shared/keel/meal_tick.ts`. En deux lignes:
// une coche est un FAIT (`protocol_events`, `source='quick_tap'`, poids 0.4), et
// décocher ne supprime rien — la table est append-only, donc on pose un
// `disqualified_reason`, que tout lecteur qui COMPTE filtre déjà.
//
// ── ET DEPUIS FF-057 §3.A, LA DÉCOCHE DIT POURQUOI ─────────────────────────
// Un seul motif (`food_not_eaten`) écrasait trois situations: « j'ai commandé »,
// « pas eu le temps », « j'ai mangé autre chose ». Le suivi savait QUE le repas
// prévu n'avait pas eu lieu, jamais POURQUOI. Quatre valeurs désormais, et la
// première reste la décoche NUE — celle qui part avant toute question, pour que
// le formulaire soit gratuit à ignorer.
//
// CE QUE LA COCHE NE PRÉTEND PAS: aucun groupe alimentaire, aucune substance.
// Un plat généré porte des ingrédients en prose; les mapper vers le vocabulaire
// fermé serait une déduction. La coche compte donc pour la COUVERTURE et ne
// crédite aucune ligne du plan — c'est exactement ce qu'une case cochée prouve.
//
// RLS: l'élève a INSERT et SELECT sur ses propres `protocol_events`; le décochage
// est un UPDATE de sa propre ligne. Rien ici ne passe par une fonction edge.

import { supabase } from "../../lib/supabase";

const TABLE = "protocol_events";

/**
 * FF-057 §3.A — LES MOTIFS D'UNE COCHE RETIRÉE, MIROIR DE
 * `_shared/keel/meal_tick.ts :: MEAL_UNTICK_REASONS`.
 *
 * ⚠️ LA DUPLICATION EST INÉVITABLE ET GARDÉE. Deno, le navigateur et Postgres
 * ne partagent pas de module; recopier quatre jetons l'est, les laisser dériver
 * ne l'est pas. `mealTicks.int.test.ts` relit le module Deno ET la migration
 * `20260818170000` sur le disque, et fait échouer la suite si l'une des trois
 * copies bouge sans les autres. C'est l'idiome de `api/slotMeal.ts` (le pavé
 * citait `lib/accidentPayload.ts`, supprimé le 2026-09-07 avec la porte de la
 * procédure accident).
 *
 * `food_not_eaten` est la DÉCOCHE NUE: elle est écrite d'abord, elle précède le
 * formulaire, et elle reste seule quand la personne l'ignore (fiche §7). Les
 * trois autres sont les trois boutons, et rien de plus.
 */
export const MEAL_UNTICK_REASONS = [
  "food_not_eaten",
  "ordered",
  "no_time",
  "ate_other",
] as const;

export type MealUntickReason = (typeof MEAL_UNTICK_REASONS)[number];

/** Les trois boutons du formulaire — la décoche nue n'en est pas un. */
export const MEAL_UNTICK_FORM_REASONS = [
  "ordered",
  "no_time",
  "ate_other",
] as const satisfies readonly MealUntickReason[];

/** Le motif de la décoche nue, celle qui part avant toute question. */
export const BARE_UNTICK_REASON: MealUntickReason = "food_not_eaten";

/** Miroir de `_shared/keel/meal_tick.ts :: mealTickKey`. */
export function mealTickKey(generatedMealId: string, dishIndex: number): string {
  const id = String(generatedMealId ?? "").trim();
  if (!id) throw new Error("[keel/mealTicks] empty generated meal id");
  if (!Number.isInteger(dishIndex) || dishIndex < 0) {
    throw new Error(`[keel/mealTicks] bad dish index ${dishIndex}`);
  }
  return `meal_tick:${id}:${dishIndex}`;
}

export interface MealTick {
  key: string;
  eventId: string;
  localDate: string;
}

/**
 * Les coches ACTIVES de cet élève. Une ligne décochée porte
 * `disqualified_reason` et n'est pas rendue — elle existe encore, elle ne compte
 * simplement plus.
 */
export async function loadMealTicks(userId: string): Promise<Map<string, MealTick>> {
  const res = await supabase
    .from(TABLE)
    .select("id, local_date, source_message_id")
    .eq("user_id", userId)
    .eq("source", "quick_tap")
    .is("disqualified_reason", null)
    .like("source_message_id", "meal_tick:%");
  if (res.error) {
    throw new Error(`[keel/mealTicks] load failed: ${res.error.message}`);
  }
  const out = new Map<string, MealTick>();
  for (const raw of (res.data ?? []) as unknown as Array<
    { id: string; local_date: string; source_message_id: string }
  >) {
    out.set(raw.source_message_id, {
      key: raw.source_message_id,
      eventId: raw.id,
      localDate: raw.local_date,
    });
  }
  return out;
}

/**
 * Coche un repas. Idempotent PAR LE SCHÉMA: l'index unique partiel
 * `(user_id, source_message_id)` arbitre un double tap, pas un booléen côté
 * navigateur qui court contre lui-même.
 *
 * Une ligne déjà présente mais DÉCOCHÉE est ré-armée (on efface le motif) au
 * lieu d'être réinsérée — sinon la seconde coche échouerait sur l'index et
 * l'élève verrait une erreur pour un geste parfaitement légitime.
 */
export async function tickMeal(args: {
  userId: string;
  generatedMealId: string;
  dishIndex: number;
  localDate: string;
  slotKey: string | null;
  title: string;
  contentLocale: string;
}): Promise<void> {
  const key = mealTickKey(args.generatedMealId, args.dishIndex);
  const inserted = await supabase.from(TABLE).insert({
    user_id: args.userId,
    occurred_at: new Date().toISOString(),
    local_date: args.localDate,
    slot_key: args.slotKey,
    source: "quick_tap",
    // Le titre du plat, tel quel: c'est ce que l'élève a coché, et le coach doit
    // pouvoir le lire. Aucune interprétation, aucun groupe alimentaire déduit.
    student_note: args.title,
    content_locale: args.contentLocale,
    // SCHEMA.md, échelle de preuve: une tape vaut 0.4. Elle n'est pas choisie
    // ici par confort — c'est la valeur que `evidenceWeightForSource` donne à
    // `quick_tap`, et la répéter à la main ailleurs les ferait diverger.
    evidence_weight: 0.4,
    // FF-009 — LE SEUL ÉCRIVAIN HONNÊTE DE `as_planned`.
    //
    // Cocher un plat du plan, c'est littéralement dire « j'ai mangé ce qui
    // était prévu ». L'élève DÉSIGNE la ligne: rien n'est déduit.
    //
    // ⚠️ Et c'est pour ça que le chat, lui, n'écrit JAMAIS `as_planned`. Un
    // « j'ai mangé du poulet » ne dit rien du plan; le marquer comme prévu
    // fabriquerait de l'adhérence à partir d'un silence — ce que FF-007
    // interdit globalement et ce que FF-009 R5 interdit pour cette colonne.
    // Le chat n'écrit que `off_plan`, quand un marqueur déterministe a mordu.
    plan_relation: "as_planned",
    source_message_id: key,
  });
  if (!inserted.error) return;
  // 23505: la ligne existe déjà — donc elle avait été décochée. On la ré-arme.
  if ((inserted.error as { code?: string }).code === "23505") {
    // ⚠️ `.select("id")` ET LE COMPTE DE LIGNES, comme sur la décoche juste en
    // dessous. Sans eux, PostgREST rend 204 sur un update qui touche ZÉRO
    // ligne, et la recoche rapporte un succès sans avoir rien réarmé: la case
    // se remplit à l'écran pendant que le fait reste disqualifié dans la table
    // qui nourrit la couverture du coach. C'est le défaut mesuré de
    // `20260805090500`, et il vivait encore ici — dans le fichier même où le
    // lot du 2026-08-18 disait l'avoir fermé.
    const rearmed = await supabase
      .from(TABLE)
      .update({ disqualified_reason: null })
      .eq("user_id", args.userId)
      .eq("source_message_id", key)
      .select("id");
    if (rearmed.error) {
      throw new Error(`[keel/mealTicks] re-tick failed: ${rearmed.error.message}`);
    }
    if (!rearmed.data || rearmed.data.length === 0) {
      throw new Error("[keel/mealTicks] re-tick failed: nothing was re-armed");
    }
    return;
  }
  throw new Error(`[keel/mealTicks] tick failed: ${inserted.error.message}`);
}

/**
 * Décoche. La ligne SURVIT — `protocol_events` est append-only, et un fait
 * effacé depuis un écran ne se récupère pas. On marque, on ne supprime pas.
 *
 * ── LE MOTIF EST UN PARAMÈTRE, ET IL EST REQUIS ───────────────────────────
 * FF-057 §3.A: « j'ai commandé », « pas eu le temps » et « j'ai mangé autre
 * chose » sont trois situations différentes, et elles s'écrasaient sur un seul
 * `food_not_eaten`. Le défaut (`BARE_UNTICK_REASON`) reste la décoche NUE,
 * celle que le geste écrit AVANT d'ouvrir le formulaire; les trois autres
 * arrivent par un second appel, quand la personne a tapé une tuile.
 *
 * ⚠️ REQUIS, PAS OPTIONNEL. Un défaut implicite aurait fait d'un oubli de site
 * d'appel une décoche muette — la valeur que ce lot existe pour remplacer.
 *
 * ⚠️ ON COMPTE LES LIGNES, PAS LE CODE HTTP. Un `update` qui ne touche aucune
 * ligne rend 204 et ressemble à un succès: c'est exactement le défaut que la
 * migration `20260805090500` a été écrite pour corriger (« décocher rapportait
 * un SUCCÈS et ne changeait rien »), et rien côté client ne le voyait.
 */
export async function untickMeal(args: {
  userId: string;
  generatedMealId: string;
  dishIndex: number;
  reason: MealUntickReason;
}): Promise<void> {
  const key = mealTickKey(args.generatedMealId, args.dishIndex);
  const res = await supabase
    .from(TABLE)
    .update({ disqualified_reason: args.reason })
    .eq("user_id", args.userId)
    .eq("source_message_id", key)
    .select("id");
  if (res.error) {
    throw new Error(`[keel/mealTicks] untick failed: ${res.error.message}`);
  }
  if ((res.data ?? []).length === 0) {
    throw new Error("[keel/mealTicks] untick touched 0 rows");
  }
}

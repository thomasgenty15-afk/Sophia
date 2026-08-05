// KEEL — COCHER UN REPAS DU PLAN, ET LE DÉCOCHER.
//
// Le raisonnement complet vit dans `_shared/keel/meal_tick.ts`. En deux lignes:
// une coche est un FAIT (`protocol_events`, `source='quick_tap'`, poids 0.4), et
// décocher ne supprime rien — la table est append-only, donc on pose
// `disqualified_reason='food_not_eaten'`, que tout lecteur qui COMPTE filtre
// déjà.
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
const UNTICK_REASON = "food_not_eaten";

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
    source_message_id: key,
  });
  if (!inserted.error) return;
  // 23505: la ligne existe déjà — donc elle avait été décochée. On la ré-arme.
  if ((inserted.error as { code?: string }).code === "23505") {
    const rearmed = await supabase
      .from(TABLE)
      .update({ disqualified_reason: null })
      .eq("user_id", args.userId)
      .eq("source_message_id", key);
    if (rearmed.error) {
      throw new Error(`[keel/mealTicks] re-tick failed: ${rearmed.error.message}`);
    }
    return;
  }
  throw new Error(`[keel/mealTicks] tick failed: ${inserted.error.message}`);
}

/**
 * Décoche. La ligne SURVIT — `protocol_events` est append-only, et un fait
 * effacé depuis un écran ne se récupère pas. On marque, on ne supprime pas.
 */
export async function untickMeal(args: {
  userId: string;
  generatedMealId: string;
  dishIndex: number;
}): Promise<void> {
  const key = mealTickKey(args.generatedMealId, args.dishIndex);
  const res = await supabase
    .from(TABLE)
    .update({ disqualified_reason: UNTICK_REASON })
    .eq("user_id", args.userId)
    .eq("source_message_id", key);
  if (res.error) {
    throw new Error(`[keel/mealTicks] untick failed: ${res.error.message}`);
  }
}

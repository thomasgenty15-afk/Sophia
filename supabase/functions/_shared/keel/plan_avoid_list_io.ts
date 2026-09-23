/**
 * LA LECTURE EN BASE DE LA LISTE « À ÉVITER »: les deux derniers plans du
 * foyer. Le calcul est dans `plan_avoid_list.ts`.
 *
 * ── LA REQUÊTE, FILTRE PAR FILTRE ─────────────────────────────────────────
 *   · `user_id` = le maître: un plan de foyer s'écrit sous son compte;
 *   · `household_id` ET `plan_kind = 'household'`: un plan PERSONNEL porte
 *     aussi `household_id` (`household_plan_kind_readers_test.ts`);
 *   · `retired_at is null`: un plan remplacé n'a été mangé par personne. Un
 *     plan dont la fenêtre est finie, lui, n'est jamais retiré — c'est
 *     précisément l'historique qu'on veut;
 *   · `starts_on <` le début du plan demandé: seuls les plans d'AVANT;
 *   · `id <>` le plan qu'on remplace: il sera retiré à l'adoption, comme tout
 *     plan remplacé, donc ses aliments ne comptent pas plus que les siens.
 *
 * ⚠️ UNE ERREUR REMONTE. C'est l'appelant qui décide de continuer sans liste
 * et de l'écrire dans son compteur (`read_failed`): une génération ne se
 * bloque pas parce que l'historique est illisible.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { AVOID_PREVIOUS_PLANS, type AvoidPlan, readAvoidPlan } from "./plan_avoid_list.ts";

export async function loadPreviousHouseholdPlans(
  admin: SupabaseClient,
  args: {
    ownerUserId: string;
    householdId: string;
    /** Le premier jour du plan demandé, `YYYY-MM-DD`. */
    beforeStartsOn: string;
    /** Le plan remplacé, s'il y en a un. */
    excludeId: string | null;
  },
): Promise<AvoidPlan[]> {
  let query = admin
    .from("student_generated_meals")
    .select("id, starts_on, dishes, preparations")
    .eq("user_id", args.ownerUserId)
    .eq("household_id", args.householdId)
    .eq("plan_kind", "household")
    .is("retired_at", null)
    .lt("starts_on", args.beforeStartsOn);
  if (args.excludeId !== null) query = query.neq("id", args.excludeId);
  const { data, error } = await query
    .order("starts_on", { ascending: false })
    .limit(AVOID_PREVIOUS_PLANS);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return rows.map((row) => readAvoidPlan(row.dishes, row.preparations));
}

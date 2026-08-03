/**
 * PIVOT C4 — la couche IO du point hebdomadaire.
 *
 * Séparée du module pur (`weekly_flow.ts`) pour la même raison que partout
 * ailleurs ici: toute la décision est testable sans base, et ce fichier ne
 * contient que ce qui touche vraiment Postgres.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  parseWeeklyFlowResponse,
  weeklyBiofeedbackPayload,
  type WeeklyFlowReply,
} from "./weekly_flow.ts";

/** Le lundi de la semaine qui contient `localDate`. */
export function weekStartOf(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface WeeklyFlowWriteResult {
  weekStart: string;
  reply: WeeklyFlowReply;
  /** True quand la ligne existait déjà et a été mise à jour. */
  updated: boolean;
}

/**
 * Écrit la réponse du Flow sur `weekly_reviews`.
 *
 * ── POURQUOI UN UPSERT SUR (user_id, week_start_date) ET PAS UN INSERT ──
 * L'élève peut rouvrir le Flow et renvoyer le formulaire. Un insert produirait
 * deux bilans pour la même semaine, et `/app/progress` afficherait deux poids
 * pour un dimanche — impossible à départager après coup.
 *
 * L'unique index natif porte sur `(user_id, plan_version_id, week_start_date)`
 * et `plan_version_id` est NULL dans le modèle masterclasse. Or Postgres tient
 * deux NULL pour distincts: cet index ne dédoublonne donc RIEN ici, ce qui a
 * été vérifié en insérant deux fois la même semaine avec succès. L'index
 * partiel posé par la migration C4 est ce sur quoi ce `onConflict` s'appuie.
 */
export async function writeWeeklyFlowReply(
  admin: SupabaseClient,
  args: {
    userId: string;
    weekStart: string;
    responseJson: unknown;
    contentLocale?: string;
  },
): Promise<WeeklyFlowWriteResult> {
  const reply = parseWeeklyFlowResponse(args.responseJson);

  const existing = await admin
    .from("weekly_reviews")
    .select("id, biofeedback")
    .eq("user_id", args.userId)
    .eq("week_start_date", args.weekStart)
    .is("plan_version_id", null)
    .maybeSingle();
  if (existing.error) throw existing.error;

  // On FUSIONNE plutôt que d'écraser: une ligne peut déjà porter des données
  // venues d'ailleurs (le récap du soir en écrit), et un formulaire qui ne
  // remplit que six champs ne doit pas effacer ce qu'il ne connaît pas.
  const previous = (existing.data?.biofeedback ?? {}) as Record<string, unknown>;
  const merged = { ...previous, ...weeklyBiofeedbackPayload(reply) };

  const { error } = await admin
    .from("weekly_reviews")
    .upsert({
      user_id: args.userId,
      week_start_date: args.weekStart,
      plan_version_id: null,
      biofeedback: merged,
      content_locale: args.contentLocale ?? "en-GB",
    }, { onConflict: "user_id,week_start_date" });
  if (error) throw error;

  if (reply.issues.length > 0) {
    // Bruyant par construction: une valeur écartée signale soit une faute de
    // frappe de l'élève, soit un formulaire publié chez Meta qui a divergé de
    // `weeklyFlowJson()`. Le second cas est invisible autrement.
    console.warn("keel.weekly_flow.issues", {
      user_id: args.userId,
      week_start: args.weekStart,
      issues: reply.issues,
    });
  }

  return { weekStart: args.weekStart, reply, updated: Boolean(existing.data) };
}

/** A-t-il déjà répondu pour cette semaine ? */
export async function hasAnsweredWeek(
  admin: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("weekly_reviews")
    .select("biofeedback")
    .eq("user_id", userId)
    .eq("week_start_date", weekStart)
    .is("plan_version_id", null)
    .maybeSingle();
  if (error) throw error;
  const bio = (data?.biofeedback ?? null) as Record<string, unknown> | null;
  // Une LIGNE ne suffit pas: le récap du soir en crée une sans jamais toucher
  // au biofeedback. Ce qui compte est que le formulaire ait été rempli.
  return Boolean(bio && bio.source === "whatsapp_flow");
}

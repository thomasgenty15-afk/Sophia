// LE PLAFOND, CÔTÉ RUNTIME — lire le compte du jour, inscrire la question posée.
//
// La table `meal_precision_questions` porte une ligne par question RÉELLEMENT
// posée. Ce module est son seul accès: deux lectures du même compteur écrites à
// deux endroits (une pour la photo, une pour le texte) finiraient par diverger,
// et c'est précisément la divergence que le plafond partagé existe pour
// empêcher.
//
// FAIL-CLOSED SUR LA LECTURE, et c'est la décision qui compte ici.
// Quand la lecture échoue, on rend le plafond ATTEINT. « Je ne peux pas
// vérifier » et « c'est bon » ne doivent pas produire le même comportement
// (même posture que `resolveCommitmentId` sur une allowlist absente). Le pire
// cas d'un fail-closed est une question qu'on ne pose pas — le fait imprécis
// est enregistré quand même, et l'élève n'est pas dérangé. Le pire cas de
// l'inverse est un élève qui reçoit huit questions parce que Postgres bégayait.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { MEAL_PRECISION_DAILY_CAP, type MealPrecisionAxis } from "./meal_precision.ts";

export const MEAL_PRECISION_QUESTIONS_TABLE = "meal_precision_questions";

export type MealPrecisionSource = "text" | "photo";

export interface MealPrecisionCountResult {
  /** Le nombre de questions déjà posées ce jour local. */
  count: number;
  /** Toujours nommé. `read_failed` dit que le compte est un fail-closed. */
  reason: "counted" | "read_failed" | "missing_local_date";
}

/**
 * Combien de questions de précision cet élève a-t-il déjà reçues aujourd'hui ?
 *
 * `localDate` est la journée LOCALE de l'élève, résolue par l'appelant. Ce
 * module n'a pas d'horloge: un plafond calculé sur la date du serveur s'ouvre
 * au mauvais moment pour tout le monde sauf UTC, ce qui est exactement la
 * famille de bugs nocturnes déjà payée par ce dépôt.
 */
export async function countMealPrecisionQuestionsToday(
  db: SupabaseClient,
  args: { userId: string; localDate: string | null | undefined },
): Promise<MealPrecisionCountResult> {
  const localDate = String(args.localDate ?? "").trim();
  if (!localDate) {
    // Sans journée locale, il n'existe aucun plafond calculable. On ferme.
    return { count: MEAL_PRECISION_DAILY_CAP, reason: "missing_local_date" };
  }
  try {
    const result = await db
      .from(MEAL_PRECISION_QUESTIONS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("local_date", localDate);
    if (result.error) {
      console.warn(JSON.stringify({
        tag: "meal_precision_cap_read_failed",
        user_id: args.userId,
        error: result.error.message,
      }));
      return { count: MEAL_PRECISION_DAILY_CAP, reason: "read_failed" };
    }
    return { count: result.count ?? 0, reason: "counted" };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "meal_precision_cap_read_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { count: MEAL_PRECISION_DAILY_CAP, reason: "read_failed" };
  }
}

export interface MealPrecisionRecordResult {
  ok: boolean;
  /** true quand la ligne existait déjà (rejeu du même message). */
  alreadyRecorded: boolean;
  reason?: string;
}

/**
 * Inscrit la question posée. Idempotent PAR LE SCHÉMA.
 *
 * L'unicité `(user_id, asked_for_message_id)` est ce qui rend un rejeu inoffensif:
 * un tour rejoué (Kong rend des 502 sans corps sur les tours longs, et le client
 * retente) ne consomme pas deux places du plafond pour une question posée une
 * fois. La violation d'unicité n'est donc PAS une erreur: c'est la réponse
 * « déjà comptée », et l'appelant continue.
 */
export async function recordMealPrecisionQuestion(
  db: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    source: MealPrecisionSource;
    axis: MealPrecisionAxis;
    question: string;
    protocolEventId: string | null;
    askedForMessageId: string;
  },
): Promise<MealPrecisionRecordResult> {
  try {
    const inserted = await db
      .from(MEAL_PRECISION_QUESTIONS_TABLE)
      .insert({
        user_id: args.userId,
        local_date: args.localDate,
        source: args.source,
        axis: args.axis,
        question: args.question,
        protocol_event_id: args.protocolEventId,
        asked_for_message_id: args.askedForMessageId,
      } as never)
      .select("id")
      .single();
    if (!inserted.error) return { ok: true, alreadyRecorded: false };
    // 23505 = unique_violation. La question de ce message est déjà comptée.
    if (inserted.error.code === "23505") {
      return { ok: true, alreadyRecorded: true };
    }
    console.warn(JSON.stringify({
      tag: "meal_precision_cap_write_failed",
      user_id: args.userId,
      error: inserted.error.message,
    }));
    return { ok: false, alreadyRecorded: false, reason: inserted.error.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({
      tag: "meal_precision_cap_write_failed",
      user_id: args.userId,
      error: message,
    }));
    return { ok: false, alreadyRecorded: false, reason: message };
  }
}

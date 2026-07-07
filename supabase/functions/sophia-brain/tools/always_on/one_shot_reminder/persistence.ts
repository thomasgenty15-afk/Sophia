import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

export type OneShotReminderPendingRow = {
  id?: string;
  scheduled_for?: string;
  status?: string;
  event_context?: string;
  message_payload?: unknown;
};


// eva-r6 B03: le cancel ne voyait que les `pending` — un rappel deja delivre
// (awaiting_user apres fire) devenait invisible et le rendu affirmait
// « rien d'enregistre », deni factuel d'un rappel bien reel. Cette lecture
// remonte les one-shot RECENTS quel que soit leur statut pour distinguer
// « jamais existe » de « deja envoye/annule ».
export async function readRecentOneShotReminderRows(args: {
  supabase: SupabaseClient;
  userId: string;
  sinceIso: string;
  limit?: number;
}): Promise<OneShotReminderPendingRow[]> {
  const { data, error } = await args.supabase
    .from("scheduled_checkins")
    .select("id,scheduled_for,status,event_context,message_payload")
    .eq("user_id", args.userId)
    .like("event_context", "one_shot_reminder:%")
    .gte("scheduled_for", args.sinceIso)
    .order("scheduled_for", { ascending: false })
    .limit(args.limit ?? 10);
  if (error) throw error;
  return (data ?? []) as OneShotReminderPendingRow[];
}

export async function readPendingOneShotReminderRows(args: {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
}): Promise<OneShotReminderPendingRow[]> {
  const { data, error } = await args.supabase
    .from("scheduled_checkins")
    .select("id,scheduled_for,status,event_context,message_payload")
    .eq("user_id", args.userId)
    .eq("status", "pending")
    .like("event_context", "one_shot_reminder:%")
    .order("scheduled_for", { ascending: true })
    .limit(args.limit ?? 10);
  if (error) throw error;
  return (data ?? []) as OneShotReminderPendingRow[];
}

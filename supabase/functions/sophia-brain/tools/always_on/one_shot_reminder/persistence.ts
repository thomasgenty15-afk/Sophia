import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

export type OneShotReminderPendingRow = {
  id?: string;
  scheduled_for?: string;
  status?: string;
  event_context?: string;
  message_payload?: unknown;
};

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

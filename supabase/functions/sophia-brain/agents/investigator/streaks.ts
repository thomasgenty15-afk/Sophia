/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

async function loadRecentCheckupRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ completion_kind: string | null; completed_at: string | null; missed_count: number | null }>> {
  const { data, error } = await supabase
    .from("user_checkup_logs")
    .select("completion_kind,completed_at,missed_count")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data as Array<{ completion_kind: string | null; completed_at: string | null; missed_count: number | null }> | null) ?? [];
}

export async function getCompletedStreakDays(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const rows = await loadRecentCheckupRows(supabase, userId);
  let streak = 0;
  for (const row of rows) {
    if (row.completion_kind !== "full") break;
    streak += 1;
  }
  return streak;
}

export async function getMissedStreakDays(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const rows = await loadRecentCheckupRows(supabase, userId);
  let streak = 0;
  for (const row of rows) {
    if ((Number(row.missed_count ?? 0) || 0) <= 0) break;
    streak += 1;
  }
  return streak;
}

export async function maybeHandleStreakAfterLog(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<void> {
  // Legacy no-op: keep import contract stable while the V2 runtime no longer
  // depends on the historical investigator streak side effects.
}

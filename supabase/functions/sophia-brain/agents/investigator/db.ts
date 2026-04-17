/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type CompletionStats = {
  items: number;
  completed: number;
  missed: number;
};

export async function logCheckupCompletion(
  supabase: SupabaseClient,
  userId: string,
  stats: CompletionStats,
  source: "chat" | "chat_stop" | "cron" | "manual",
  completionKind: "full" | "partial",
): Promise<void> {
  const payload = {
    user_id: userId,
    scope: "global",
    completed_at: new Date().toISOString(),
    items_count: Math.max(0, Math.floor(Number(stats.items) || 0)),
    completed_count: Math.max(0, Math.floor(Number(stats.completed) || 0)),
    missed_count: Math.max(0, Math.floor(Number(stats.missed) || 0)),
    source,
    completion_kind: completionKind,
  };

  const { error } = await supabase.from("user_checkup_logs").insert(payload);
  if (error) throw error;
}

export async function megaTestLogItem(
  supabase: SupabaseClient,
  userId: string,
  stats: Partial<CompletionStats> = {},
): Promise<void> {
  await logCheckupCompletion(
    supabase,
    userId,
    {
      items: Number(stats.items ?? 1) || 1,
      completed: Number(stats.completed ?? 1) || 1,
      missed: Number(stats.missed ?? 0) || 0,
    },
    "manual",
    "full",
  );
}

export async function getYesterdayCheckupSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  completedAt: string | null;
  items: number;
  completed: number;
  missed: number;
} | null> {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("user_checkup_logs")
    .select("completed_at,items_count,completed_count,missed_count")
    .eq("user_id", userId)
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    completedAt: String((data as any).completed_at ?? "") || null,
    items: Number((data as any).items_count ?? 0) || 0,
    completed: Number((data as any).completed_count ?? 0) || 0,
    missed: Number((data as any).missed_count ?? 0) || 0,
  };
}

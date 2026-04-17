/**
 * Registry-based cooldown check — extracted to _shared to avoid
 * circular dependency between _shared/v2-rendez-vous.ts and
 * sophia-brain/cooldown_engine.ts.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { CooldownType } from "./v2-types.ts";

export interface CooldownCheckResult {
  type: CooldownType;
  is_cooled_down: boolean;
  last_occurrence_at: string | null;
  gap_ms: number | null;
  required_ms: number;
  reset_by_reaction: boolean;
}

export interface CooldownEntryPayload {
  cooldown_type: CooldownType;
  key: string;
  context: Record<string, unknown>;
  expires_at: string;
}

export const COOLDOWN_DURATIONS_MS: Record<CooldownType, number> = {
  same_posture: 48 * 60 * 60 * 1000,
  same_item_reminded: 72 * 60 * 60 * 1000,
  failed_technique: 14 * 24 * 60 * 60 * 1000,
  refused_rendez_vous: 7 * 24 * 60 * 60 * 1000,
  reactivation_after_silence: 72 * 60 * 60 * 1000,
};

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function cleanText(v: unknown, fallback = ""): string {
  const text = String(v ?? "").trim();
  return text || fallback;
}

export async function checkRegistryCooldown(
  supabase: SupabaseClient,
  userId: string,
  cooldownType: "failed_technique" | "refused_rendez_vous",
  key: string,
  nowIso: string,
): Promise<CooldownCheckResult> {
  const duration = COOLDOWN_DURATIONS_MS[cooldownType];
  const cutoffIso = new Date(parseIsoMs(nowIso) - duration).toISOString();

  const { data, error } = await supabase
    .from("system_runtime_snapshots")
    .select("payload,created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "cooldown_entry")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const rows = Array.isArray(data)
    ? data as Array<Record<string, unknown>>
    : [];

  const matching = rows.find((row) => {
    const payload = row.payload as CooldownEntryPayload | undefined;
    return payload?.cooldown_type === cooldownType && payload?.key === key;
  });

  if (!matching) {
    return {
      type: cooldownType,
      is_cooled_down: false,
      last_occurrence_at: null,
      gap_ms: null,
      required_ms: duration,
      reset_by_reaction: false,
    };
  }

  const gap = parseIsoMs(nowIso) - parseIsoMs(matching.created_at);
  return {
    type: cooldownType,
    is_cooled_down: gap < duration,
    last_occurrence_at: cleanText(matching.created_at) || null,
    gap_ms: gap,
    required_ms: duration,
    reset_by_reaction: false,
  };
}

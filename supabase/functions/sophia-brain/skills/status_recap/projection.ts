/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { loadRecentEffectHistory } from "../../router/effect_ledger_reader.ts";
import type { StatusRecapProjection } from "./contract.ts";

export function emptyStatusRecapProjection(): StatusRecapProjection {
  return {
    attack_cards: [],
    defense_cards: [],
    one_shot_reminders: { pending: [], cancelled_recent: [] },
    recurring_reminders: [],
    potion_sessions: [],
    coach_preferences: [],
    recent_effect_history: [],
  };
}

export function formatStatusRecapLocalTime(
  iso: string | null | undefined,
  timezone: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone || "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "";
    return hour && minute ? `${hour}:${minute}` : null;
  } catch {
    return iso.slice(11, 16) || null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cardTitle(content: unknown, fallback: string): string {
  if (!isRecord(content)) return fallback;
  const operationDraft = isRecord(content.operation_draft)
    ? content.operation_draft
    : {};
  const techniques = Array.isArray(content.techniques)
    ? content.techniques
    : [];
  const firstTechnique = isRecord(techniques[0]) ? techniques[0] : {};
  const generated = isRecord(firstTechnique.generated_result)
    ? firstTechnique.generated_result
    : {};
  return String(
    operationDraft.title ??
      generated.output_title ??
      content.title ??
      content.card_title ??
      fallback,
  );
}

function reminderInstruction(row: Record<string, unknown>): string {
  const payload = isRecord(row.message_payload) ? row.message_payload : {};
  const draft = String(
    payload.reminder_instruction ??
      payload.instruction ??
      row.draft_message ??
      "rappel ponctuel",
  );
  return draft.replace(
    /^Rappel ponctuel demandé explicitement par l'utilisateur\. Rappelle-lui de\s*/i,
    "",
  );
}

function recurringCadenceLabel(row: Record<string, unknown>): string | null {
  const days = Array.isArray(row.scheduled_days)
    ? row.scheduled_days.map((day) => String(day)).filter(Boolean)
    : [];
  const time = String(row.local_time_hhmm ?? "").trim();
  if (!days.length && !time) return null;
  const dayLabel = days.length === 7 ? "tous les jours" : days.length === 5 &&
      ["mon", "tue", "wed", "thu", "fri"].every((day) => days.includes(day))
    ? "jours ouvrés"
    : days.join(", ");
  return [dayLabel, time].filter(Boolean).join(" à ");
}

async function safeRows<T>(
  query: PromiseLike<{ data?: T[] | null; error?: unknown }>,
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export async function loadStatusRecapProjection(args: {
  supabase: SupabaseClient;
  userId: string;
  userTimezone: string;
}): Promise<StatusRecapProjection> {
  const tz = args.userTimezone || "Europe/Paris";
  const [
    attackRows,
    defenseRows,
    pendingRows,
    cancelledRows,
    recurringRows,
    potionRows,
    preferenceRows,
    recentEffectHistory,
  ] = await Promise.all([
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("user_attack_cards")
        .select("id,content,status,generated_at")
        .eq("user_id", args.userId)
        .eq("status", "active")
        .order("generated_at", { ascending: false })
        .limit(3) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("user_defense_cards")
        .select("id,content,status,generated_at")
        .eq("user_id", args.userId)
        .eq("status", "active")
        .order("generated_at", { ascending: false })
        .limit(3) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("scheduled_checkins")
        .select(
          "id,scheduled_for,status,message_payload,event_context,draft_message",
        )
        .eq("user_id", args.userId)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true })
        .limit(5) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("scheduled_checkins")
        .select(
          "id,scheduled_for,status,message_payload,event_context,draft_message",
        )
        .eq("user_id", args.userId)
        .eq("status", "cancelled")
        .like("event_context", "one_shot_reminder:%")
        .order("scheduled_for", { ascending: false })
        .limit(5) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("user_recurring_reminders")
        .select(
          "id,status,message_instruction,local_time_hhmm,scheduled_days,updated_at",
        )
        .eq("user_id", args.userId)
        .order("updated_at", { ascending: false })
        .limit(5) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("user_potion_sessions")
        .select("id,potion_type,status,created_at")
        .eq("user_id", args.userId)
        .order("created_at", { ascending: false })
        .limit(3) as any,
    ),
    safeRows<Record<string, unknown>>(
      args.supabase
        .from("user_profile_facts")
        .select("key,value,reason,status,source_type,updated_at")
        .eq("user_id", args.userId)
        .eq("scope", "global")
        .eq("status", "active")
        .like("key", "coach.%")
        .order("updated_at", { ascending: false })
        .limit(12) as any,
    ),
    loadRecentEffectHistory({
      supabase: args.supabase,
      userId: args.userId,
      limit: 20,
      sinceIso: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    }),
  ]);

  return {
    attack_cards: attackRows.map((row) => ({
      id: String(row.id ?? ""),
      title: cardTitle(row.content, "carte d'attaque"),
      status: String(row.status ?? "active"),
      generated_at: row.generated_at ? String(row.generated_at) : null,
    })).filter((row) => row.id),
    defense_cards: defenseRows.map((row) => ({
      id: String(row.id ?? ""),
      title: cardTitle(row.content, "carte de défense"),
      status: String(row.status ?? "active"),
      generated_at: row.generated_at ? String(row.generated_at) : null,
    })).filter((row) => row.id),
    one_shot_reminders: {
      pending: pendingRows.filter((row) =>
        String(row.status ?? "pending") === "pending"
      ).map((row) => ({
        id: String(row.id ?? ""),
        scheduled_for: String(row.scheduled_for ?? ""),
        local_time: formatStatusRecapLocalTime(
          row.scheduled_for ? String(row.scheduled_for) : null,
          tz,
        ),
        instruction: reminderInstruction(row),
      })).filter((row) => row.id),
      cancelled_recent: cancelledRows.filter((row) =>
        String(row.status ?? "cancelled") === "cancelled"
      ).map((row) => ({
        id: String(row.id ?? ""),
        scheduled_for: row.scheduled_for ? String(row.scheduled_for) : null,
        local_time: formatStatusRecapLocalTime(
          row.scheduled_for ? String(row.scheduled_for) : null,
          tz,
        ),
        instruction: reminderInstruction(row),
        updated_at: row.updated_at ? String(row.updated_at) : null,
      })).filter((row) => row.id),
    },
    recurring_reminders: recurringRows.map((row) => ({
      id: String(row.id ?? ""),
      status: String(row.status ?? ""),
      cadence_label: recurringCadenceLabel(row),
      instruction: row.message_instruction
        ? String(row.message_instruction)
        : null,
    })).filter((row) => row.id),
    potion_sessions: potionRows.map((row) => ({
      id: String(row.id ?? ""),
      potion_type: String(row.potion_type ?? "potion"),
      status: String(row.status ?? ""),
      created_at: row.created_at ? String(row.created_at) : null,
    })).filter((row) => row.id),
    coach_preferences: preferenceRows.map((row) => ({
      key: String(row.key ?? ""),
      value: row.value,
      reason: row.reason ? String(row.reason) : null,
      source_type: row.source_type ? String(row.source_type) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    })).filter((row) => row.key),
    recent_effect_history: recentEffectHistory.map((entry) => ({
      status: entry.status,
      effect_type: entry.effect_type,
      created_at: entry.created_at,
      reason_code: entry.reason_code,
    })),
  };
}

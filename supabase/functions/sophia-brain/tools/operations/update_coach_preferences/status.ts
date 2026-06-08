import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { CoachPreferencesPatchDraftV1 } from "./generator.ts";
import type { CoachPreferenceLocalUpdate } from "./contract.ts";

export const SUPPORTED_COACH_PREFERENCE_KEYS = [
  "coach.tone",
  "coach.question_tendency",
  "coach.challenge_level",
] as const;

export function isSupportedCoachPreferenceKey(key: string): boolean {
  return (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(key);
}

export function coachPreferenceLabel(key: string, rawValue: string): string {
  const value = String(rawValue ?? "").trim();
  if (key === "coach.tone") {
    return value === "soft"
      ? "Doux"
      : value === "direct"
      ? "Très direct"
      : value === "warm_direct" || value === "bienveillant_ferme"
      ? "Bienveillant ferme"
      : value;
  }
  if (key === "coach.question_tendency") {
    return value === "low" || value === "peu_de_questions"
      ? "Peu de questions"
      : value === "high" || value === "tres_questionnant"
      ? "Très questionnant"
      : value === "normal" || value === "equilibre"
      ? "Équilibré"
      : value;
  }
  if (key === "coach.challenge_level") {
    return value === "high" || value === "eleve"
      ? "Élevé"
      : value === "low" || value === "leger"
      ? "Léger"
      : value === "balanced" || value === "equilibre"
      ? "Équilibré"
      : value;
  }
  return value;
}

export function coachPreferenceStatusLabel(pref: any): string | null {
  const key = String(pref?.key ?? "");
  if (!isSupportedCoachPreferenceKey(key)) return null;
  const rawValue = String(pref?.value?.value ?? "");
  if (key === "coach.tone") {
    return `ton ${coachPreferenceLabel(key, rawValue).toLowerCase()}`;
  }
  if (key === "coach.question_tendency") {
    return rawValue === "low" || rawValue === "peu_de_questions"
      ? "moins de questions"
      : rawValue === "high" || rawValue === "tres_questionnant"
      ? "plus de questions"
      : "questions équilibrées";
  }
  if (key === "coach.challenge_level") {
    return `challenge ${coachPreferenceLabel(key, rawValue).toLowerCase()}`;
  }
  return null;
}

export async function upsertCoachPreferencesFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: CoachPreferencesPatchDraftV1;
  sourceMessageId?: string | null;
}) {
  const entries = Object.entries(args.draft.draft.patch).filter(([key]) =>
    isSupportedCoachPreferenceKey(key)
  );
  const now = new Date().toISOString();
  const rows = entries.map(([key, rawValue]) => {
    const value = String(rawValue);
    return {
      user_id: args.userId,
      scope: "global",
      key,
      value: {
        value,
        label: coachPreferenceLabel(key, value),
      },
      status: "active",
      confidence: 1,
      source_type: "explicit_user",
      last_source_message_id: args.sourceMessageId ?? null,
      reason: args.draft.draft.reason ?? args.draft.draft.summary,
      updated_at: now,
      last_confirmed_at: now,
    };
  });
  if (rows.length === 0) {
    return {
      data: null,
      error: { message: "empty_coach_preference_patch" },
    };
  }
  const { data, error } = await args.supabase
    .from("user_profile_facts")
    .upsert(rows as any, { onConflict: "user_id,scope,key" })
    .select("key");
  if (error) return { data: null, error };
  const keys = (data ?? []).map((row: any) => String(row?.key ?? "")).filter(
    Boolean,
  );
  const ids = (data ?? []).map((row: any) => String(row?.id ?? "")).filter(
    Boolean,
  );
  return {
    data: keys.length > 0 ? { key: keys[0], keys, ids } : null,
    error: keys.length > 0 ? null : { message: "missing_upserted_key" },
  };
}

export const upsertCoachPreferencesFromDraftForTest =
  upsertCoachPreferencesFromDraft;

export async function upsertCoachPreferencesFromLockedUpdates(args: {
  supabase: SupabaseClient;
  userId: string;
  updates: CoachPreferenceLocalUpdate[];
  sourceMessageId?: string | null;
  reason?: string | null;
}) {
  const patch: CoachPreferencesPatchDraftV1["draft"]["patch"] = {};
  for (const update of args.updates) {
    if (update.status !== "locked") continue;
    if (!isSupportedCoachPreferenceKey(update.key)) continue;
    patch[update.key] = update.value;
  }
  return await upsertCoachPreferencesFromDraft({
    supabase: args.supabase,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? null,
    draft: {
      operation_type: "update_coach_preferences",
      output_schema: "coach_preferences_patch_draft_v1",
      draft: {
        patch,
        summary: args.reason ?? "Préférence coach explicite depuis le chat.",
        reason: args.reason ?? null,
      },
      confirmation_message: "",
      confirmation_actions: ["yes", "no"],
    },
  });
}

export async function loadCurrentCoachPreferenceRows(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<Array<{ key: string; value: string; label: string }>> {
  const { data, error } = await args.supabase
    .from("user_profile_facts")
    .select("key,value,status,source_type,updated_at")
    .eq("user_id", args.userId)
    .eq("scope", "global")
    .eq("status", "active")
    .like("key", "coach.%");
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row: any) => {
    const key = String(row?.key ?? "").trim();
    if (!isSupportedCoachPreferenceKey(key)) return [];
    const value = String(row?.value?.value ?? "").trim();
    if (!value) return [];
    return [{
      key,
      value,
      label: coachPreferenceLabel(key, value),
    }];
  });
}

export async function buildCoachPreferencesStatusReply(args: {
  supabase: SupabaseClient;
  userId: string;
  fallback: string;
}): Promise<string> {
  try {
    const { data, error } = await args.supabase
      .from("user_profile_facts")
      .select("key,value,status,source_type,updated_at")
      .eq("user_id", args.userId)
      .eq("scope", "global")
      .eq("status", "active")
      .like("key", "coach.%");
    if (error) return args.fallback;
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return "Je ne vois pas encore de préférence coach active.";
    }
    const explicitRows = rows.filter((row: any) =>
      String(row?.source_type ?? "") !== "system_default"
    );
    if (!explicitRows.length) {
      return "Je ne vois pas encore de préférence coach active.";
    }
    const labels = explicitRows
      .map((row: any) => coachPreferenceStatusLabel(row))
      .filter(Boolean);
    return labels.length
      ? `Oui. Préférences coach actives : ${labels.join(", ")}.`
      : args.fallback;
  } catch {
    return args.fallback;
  }
}

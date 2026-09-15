import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type {
  CooldownType,
  MorningNudgePosture,
  ProactiveWindowKind,
} from "../_shared/v2-types.ts";

import {
  checkRegistryCooldown as _checkRegistryCooldown,
  COOLDOWN_DURATIONS_MS as _COOLDOWN_DURATIONS_MS,
  type CooldownCheckResult as _CooldownCheckResult,
  type CooldownEntryPayload as _CooldownEntryPayload,
} from "../_shared/v2-cooldown-registry.ts";

// Re-export + local alias for use within this file
export const COOLDOWN_DURATIONS_MS = _COOLDOWN_DURATIONS_MS;
export const checkRegistryCooldown = _checkRegistryCooldown;
export type CooldownCheckResult = _CooldownCheckResult;
export type CooldownEntryPayload = _CooldownEntryPayload;

export const COOLDOWN_RESETS_ON_REACTION: Record<CooldownType, boolean> = {
  same_posture: true,
  same_item_reminded: true,
  failed_technique: false,
  refused_rendez_vous: false,
  reactivation_after_silence: false,
};

export interface CooldownContext {
  posture?: MorningNudgePosture;
  item_id?: string;
  item_title?: string;
  technique_key?: string;
  rendez_vous_id?: string;
  window_kind?: ProactiveWindowKind;
}

// ── Posture adjacency for fallback when primary posture is on cooldown ──────

export const POSTURE_ADJACENCY: Record<
  MorningNudgePosture,
  MorningNudgePosture[]
> = {
  protective_pause: ["support_softly"],
  support_softly: ["protective_pause", "simplify_today"],
  pre_event_grounding: ["focus_today", "simplify_today"],
  open_door: ["simplify_today"],
  simplify_today: ["focus_today", "open_door"],
  focus_today: ["simplify_today", "celebration_ping"],
  celebration_ping: ["focus_today"],
};

const ITEM_CENTRIC_POSTURES = new Set<MorningNudgePosture>([
  "simplify_today",
  "focus_today",
]);

// ── Internal helpers ────────────────────────────────────────────────────────

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function cleanText(v: unknown, fallback = ""): string {
  const text = String(v ?? "").trim();
  return text || fallback;
}

// ── Proactive History ───────────────────────────────────────────────────────
// Loaded from scheduled_checkins (sent/awaiting_user rows) for the user.

export interface ProactiveHistoryEntry {
  event_context: string;
  scheduled_for: string;
  status: string;
  posture: MorningNudgePosture | null;
  item_titles: string[];
  user_reacted: boolean;
  window_kind: ProactiveWindowKind | null;
}

// ── Core: isCooledDown ──────────────────────────────────────────────────────

export function checkPostureCooldown(
  posture: MorningNudgePosture,
  history: ProactiveHistoryEntry[],
  nowMs: number,
): CooldownCheckResult {
  const duration = COOLDOWN_DURATIONS_MS.same_posture;
  const matchingEntries = history
    .filter((e) => e.posture === posture)
    .sort((a, b) => parseIsoMs(b.scheduled_for) - parseIsoMs(a.scheduled_for));

  const last = matchingEntries[0];
  if (!last) {
    return {
      type: "same_posture",
      is_cooled_down: false,
      last_occurrence_at: null,
      gap_ms: null,
      required_ms: duration,
      reset_by_reaction: true,
    };
  }

  if (last.user_reacted) {
    return {
      type: "same_posture",
      is_cooled_down: false,
      last_occurrence_at: last.scheduled_for,
      gap_ms: nowMs - parseIsoMs(last.scheduled_for),
      required_ms: duration,
      reset_by_reaction: true,
    };
  }

  const gap = nowMs - parseIsoMs(last.scheduled_for);
  return {
    type: "same_posture",
    is_cooled_down: gap < duration,
    last_occurrence_at: last.scheduled_for,
    gap_ms: gap,
    required_ms: duration,
    reset_by_reaction: true,
  };
}

export function checkItemCooldown(
  itemTitles: string[],
  history: ProactiveHistoryEntry[],
  nowMs: number,
): CooldownCheckResult {
  const duration = COOLDOWN_DURATIONS_MS.same_item_reminded;
  const normalizedTitles = new Set(
    itemTitles.map((t) => t.toLowerCase().trim()),
  );
  if (normalizedTitles.size === 0) {
    return {
      type: "same_item_reminded",
      is_cooled_down: false,
      last_occurrence_at: null,
      gap_ms: null,
      required_ms: duration,
      reset_by_reaction: true,
    };
  }

  const matchingEntries = history
    .filter((e) => {
      if (e.user_reacted) return false;
      return e.item_titles.some((t) =>
        normalizedTitles.has(t.toLowerCase().trim())
      );
    })
    .sort((a, b) => parseIsoMs(b.scheduled_for) - parseIsoMs(a.scheduled_for));

  const last = matchingEntries[0];
  if (!last) {
    return {
      type: "same_item_reminded",
      is_cooled_down: false,
      last_occurrence_at: null,
      gap_ms: null,
      required_ms: duration,
      reset_by_reaction: true,
    };
  }

  const gap = nowMs - parseIsoMs(last.scheduled_for);
  return {
    type: "same_item_reminded",
    is_cooled_down: gap < duration,
    last_occurrence_at: last.scheduled_for,
    gap_ms: gap,
    required_ms: duration,
    reset_by_reaction: true,
  };
}

export function checkReactivationCooldown(
  history: ProactiveHistoryEntry[],
  nowMs: number,
): CooldownCheckResult {
  const duration = COOLDOWN_DURATIONS_MS.reactivation_after_silence;
  const reactivationEntries = history
    .filter((e) => e.window_kind === "reactivation_window")
    .sort((a, b) => parseIsoMs(b.scheduled_for) - parseIsoMs(a.scheduled_for));

  const last = reactivationEntries[0];
  if (!last) {
    return {
      type: "reactivation_after_silence",
      is_cooled_down: false,
      last_occurrence_at: null,
      gap_ms: null,
      required_ms: duration,
      reset_by_reaction: false,
    };
  }

  const gap = nowMs - parseIsoMs(last.scheduled_for);
  return {
    type: "reactivation_after_silence",
    is_cooled_down: gap < duration,
    last_occurrence_at: last.scheduled_for,
    gap_ms: gap,
    required_ms: duration,
    reset_by_reaction: false,
  };
}

export async function registerCooldown(
  supabase: SupabaseClient,
  userId: string,
  cooldownType: CooldownType,
  key: string,
  context: CooldownContext,
  nowIso: string,
): Promise<void> {
  const duration = COOLDOWN_DURATIONS_MS[cooldownType];
  const expiresAt = new Date(parseIsoMs(nowIso) + duration).toISOString();

  const payload: CooldownEntryPayload = {
    cooldown_type: cooldownType,
    key,
    context: context as Record<string, unknown>,
    expires_at: expiresAt,
  };

  const { error } = await supabase
    .from("system_runtime_snapshots")
    .insert({
      user_id: userId,
      snapshot_type: "cooldown_entry",
      payload,
    });

  if (error) throw error;
}

// ── Composite: validate posture with cooldown fallback ──────────────────────
// Replaces the hardcoded validateCooldownV2 in momentum_morning_nudge.ts

export function validatePostureWithCooldown(
  posture: MorningNudgePosture,
  targetItemTitles: string[],
  history: ProactiveHistoryEntry[],
  nowMs: number,
): { posture: MorningNudgePosture | null; checks: CooldownCheckResult[] } {
  const checks: CooldownCheckResult[] = [];

  const postureCheck = checkPostureCooldown(posture, history, nowMs);
  checks.push(postureCheck);

  const isItemCentric = ITEM_CENTRIC_POSTURES.has(posture);
  let itemCheck: CooldownCheckResult | null = null;
  if (isItemCentric && targetItemTitles.length > 0) {
    itemCheck = checkItemCooldown(targetItemTitles, history, nowMs);
    checks.push(itemCheck);
  }

  if (!postureCheck.is_cooled_down && (!itemCheck || !itemCheck.is_cooled_down)) {
    return { posture, checks };
  }

  const adjacents = POSTURE_ADJACENCY[posture] ?? [];
  for (const adj of adjacents) {
    const adjPostureCheck = checkPostureCooldown(adj, history, nowMs);
    if (adjPostureCheck.is_cooled_down) continue;

    const adjIsItemCentric = ITEM_CENTRIC_POSTURES.has(adj);
    if (adjIsItemCentric && targetItemTitles.length > 0) {
      const adjItemCheck = checkItemCooldown(
        targetItemTitles,
        history,
        nowMs,
      );
      if (adjItemCheck.is_cooled_down) continue;
    }

    return { posture: adj, checks };
  }

  return { posture: null, checks };
}

// ── Load proactive history from scheduled_checkins ──────────────────────────

const ALL_PROACTIVE_EVENT_CONTEXTS = [
  "morning_nudge_v2",
  "morning_active_actions_nudge",
  "momentum_friction_legere",
  "momentum_evitement",
  "momentum_soutien_emotionnel",
  "momentum_reactivation",
];

const VALID_POSTURES = new Set<string>([
  "protective_pause",
  "support_softly",
  "pre_event_grounding",
  "open_door",
  "simplify_today",
  "focus_today",
  "celebration_ping",
]);

function parsePosture(value: unknown): MorningNudgePosture | null {
  const raw = cleanText(value);
  return VALID_POSTURES.has(raw) ? (raw as MorningNudgePosture) : null;
}

function parseWindowKind(value: unknown): ProactiveWindowKind | null {
  const raw = cleanText(value);
  const valid = new Set([
    "morning_presence",
    "pre_event_grounding",
    "midday_rescue",
    "evening_reflection_light",
    "reactivation_window",
  ]);
  return valid.has(raw) ? (raw as ProactiveWindowKind) : null;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => cleanText(v)).filter(Boolean)
    : [];
}

export async function loadProactiveHistory(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
  lookbackDays = 7,
): Promise<ProactiveHistoryEntry[]> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const sentStatuses = ["sent", "awaiting_user"];

  const [checkinsResult, messagesResult] = await Promise.all([
    supabase
      .from("scheduled_checkins")
      .select("event_context,scheduled_for,status,message_payload")
      .eq("user_id", userId)
      .in("event_context", ALL_PROACTIVE_EVENT_CONTEXTS)
      .in("status", sentStatuses)
      .gte("scheduled_for", lookbackIso)
      .lt("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: false })
      .limit(20),
    supabase
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("scope", "whatsapp")
      .eq("role", "user")
      .gte("created_at", lookbackIso)
      .lt("created_at", nowIso)
      .order("created_at", { ascending: true }),
  ]);

  if (checkinsResult.error) throw checkinsResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const checkins = Array.isArray(checkinsResult.data)
    ? checkinsResult.data as Array<Record<string, unknown>>
    : [];
  if (checkins.length === 0) return [];

  const userMessageTimes = Array.isArray(messagesResult.data)
    ? messagesResult.data
      .map((row: any) => parseIsoMs(row?.created_at))
      .filter((ms: number) => ms > 0)
    : [];

  const ascendingCheckins = [...checkins].reverse();
  const reactions = ascendingCheckins.map((row, index) => {
    const startMs = parseIsoMs(row.scheduled_for);
    const nextMs = index < ascendingCheckins.length - 1
      ? parseIsoMs(ascendingCheckins[index + 1].scheduled_for)
      : Number.POSITIVE_INFINITY;
    return userMessageTimes.some(
      (msgMs: number) => msgMs > startMs && msgMs < nextMs,
    );
  });

  return ascendingCheckins.map((row, index) => {
    const payload = row.message_payload &&
        typeof row.message_payload === "object"
      ? row.message_payload as Record<string, unknown>
      : {};
    return {
      event_context: cleanText(row.event_context),
      scheduled_for: cleanText(row.scheduled_for),
      status: cleanText(row.status),
      posture: parsePosture(
        payload.morning_nudge_posture ?? payload.momentum_strategy,
      ),
      item_titles: parseStringArray(
        payload.plan_item_titles_targeted ??
          payload.today_item_titles ??
          payload.active_item_titles,
      ),
      user_reacted: reactions[index] ?? false,
      window_kind: parseWindowKind(payload.window_kind),
    };
  });
}

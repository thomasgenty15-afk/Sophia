import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type {
  ProactiveBudgetClass,
  UserRelationPreferencesRow,
} from "../_shared/v2-types.ts";

const PROACTIVE_EVENT_CONTEXTS = [
  "morning_nudge_v2",
  "morning_active_actions_nudge",
  "momentum_friction_legere",
  "momentum_evitement",
  "momentum_soutien_emotionnel",
  "momentum_reactivation",
] as const;

export const RELATION_CONTACT_WINDOWS = [
  "morning",
  "afternoon",
  "evening",
] as const;

export type RelationContactWindow = (typeof RELATION_CONTACT_WINDOWS)[number];

type PreferredTone = UserRelationPreferencesRow["preferred_tone"];
type PreferredMessageLength =
  UserRelationPreferencesRow["preferred_message_length"];
type MaxProactiveIntensity =
  UserRelationPreferencesRow["max_proactive_intensity"];

type NormalizedRelationPreferences = {
  preferred_contact_windows: RelationContactWindow[] | null;
  disliked_contact_windows: RelationContactWindow[] | null;
  preferred_tone: PreferredTone;
  preferred_message_length: PreferredMessageLength;
  max_proactive_intensity: MaxProactiveIntensity;
  soft_no_contact_rules: Record<string, unknown> | null;
};

interface ProactiveCheckinRow {
  scheduled_for: string;
  event_context: string;
  status: string;
  message_payload: Record<string, unknown>;
}

interface UserMessageRow {
  created_at: string;
  content: string;
}

interface ProactiveObservation {
  scheduled_for: string;
  contact_window: RelationContactWindow;
  tone: PreferredTone;
  budget_class: ProactiveBudgetClass;
  user_reacted: boolean;
  reply_lengths: number[];
  decline_count: number;
}

export interface RelationPreferenceInferenceSignals {
  proactiveObservations: ProactiveObservation[];
  recentUserMessages: UserMessageRow[];
}

export interface RelationPreferenceInferenceResult {
  preferences: NormalizedRelationPreferences;
  changed: boolean;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function parseWindowList(value: unknown): RelationContactWindow[] | null {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value.map((item) => cleanText(item)))]
    .filter((item): item is RelationContactWindow =>
      RELATION_CONTACT_WINDOWS.includes(item as RelationContactWindow)
    );
  return unique.length > 0 ? unique : null;
}

function normalizePreferredTone(value: unknown): PreferredTone {
  const raw = cleanText(value);
  return raw === "gentle" || raw === "direct" || raw === "mixed" ? raw : null;
}

function normalizePreferredMessageLength(
  value: unknown,
): PreferredMessageLength {
  const raw = cleanText(value);
  return raw === "short" || raw === "medium" ? raw : null;
}

function normalizeMaxProactiveIntensity(
  value: unknown,
): MaxProactiveIntensity {
  const raw = cleanText(value);
  return raw === "low" || raw === "medium" || raw === "high" ? raw : null;
}

function normalizeRelationPreferences(
  row: Partial<UserRelationPreferencesRow> | null | undefined,
): NormalizedRelationPreferences {
  return {
    preferred_contact_windows: parseWindowList(row?.preferred_contact_windows),
    disliked_contact_windows: parseWindowList(row?.disliked_contact_windows),
    preferred_tone: normalizePreferredTone(row?.preferred_tone),
    preferred_message_length: normalizePreferredMessageLength(
      row?.preferred_message_length,
    ),
    max_proactive_intensity: normalizeMaxProactiveIntensity(
      row?.max_proactive_intensity,
    ),
    soft_no_contact_rules: row?.soft_no_contact_rules &&
        typeof row.soft_no_contact_rules === "object"
      ? row.soft_no_contact_rules as Record<string, unknown>
      : null,
  };
}

function sortWindowList(
  windows: RelationContactWindow[] | null,
): RelationContactWindow[] | null {
  if (!windows || windows.length === 0) return null;
  const ordered = RELATION_CONTACT_WINDOWS.filter((window) =>
    windows.includes(window)
  );
  return ordered.length > 0 ? ordered : null;
}

function preferencesEqual(
  a: NormalizedRelationPreferences,
  b: NormalizedRelationPreferences,
): boolean {
  return JSON.stringify({
    ...a,
    preferred_contact_windows: sortWindowList(a.preferred_contact_windows),
    disliked_contact_windows: sortWindowList(a.disliked_contact_windows),
  }) === JSON.stringify({
    ...b,
    preferred_contact_windows: sortWindowList(b.preferred_contact_windows),
    disliked_contact_windows: sortWindowList(b.disliked_contact_windows),
  });
}

function localHourInTimezone(iso: string, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(iso));
    return Math.max(0, Math.min(23, Number.parseInt(hour, 10) || 0));
  } catch {
    return 12;
  }
}

export function contactWindowFromIso(
  iso: string,
  timezone: string,
): RelationContactWindow {
  const hour = localHourInTimezone(iso, timezone);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function toneFromPayload(payload: Record<string, unknown>): PreferredTone {
  const posture = cleanText(
    payload.morning_nudge_posture ?? payload.momentum_strategy,
  );
  if (
    posture === "protective_pause" || posture === "support_softly" ||
    posture === "open_door"
  ) {
    return "gentle";
  }
  if (posture === "focus_today" || posture === "pre_event_grounding") {
    return "direct";
  }
  if (posture === "simplify_today" || posture === "celebration_ping") {
    return "mixed";
  }
  return null;
}

function budgetClassFromRow(row: ProactiveCheckinRow): ProactiveBudgetClass {
  const payload = asObject(row.message_payload);
  const rawBudget = cleanText(payload.budget_class);
  if (
    rawBudget === "light" || rawBudget === "notable" || rawBudget === "silent"
  ) {
    return rawBudget;
  }
  const rawWindow = cleanText(payload.window_kind);
  if (rawWindow === "pre_event_grounding" || rawWindow === "midday_rescue") {
    return "notable";
  }
  if (cleanText(row.event_context).startsWith("momentum_")) {
    return "notable";
  }
  return "light";
}

const DECLINE_PATTERNS = [
  /\bstop\b/i,
  /\bplus tard\b/i,
  /\bpas maintenant\b/i,
  /\bpas aujourd[' ]hui\b/i,
  /\bpas ce soir\b/i,
  /\bpas le moment\b/i,
  /\bpas trop envie\b/i,
  /\bon verra\b/i,
  /\bon verra plus tard\b/i,
  /\blaisse[- ]?moi\b/i,
];

function messageLooksLikeDecline(text: string): boolean {
  return DECLINE_PATTERNS.some((pattern) => pattern.test(text));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function reactionRate(observations: ProactiveObservation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((obs) => obs.user_reacted).length /
    observations.length;
}

function declineRate(observations: ProactiveObservation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((obs) => obs.decline_count > 0).length /
    observations.length;
}

function inferContactWindows(
  observations: ProactiveObservation[],
  current: NormalizedRelationPreferences,
): Pick<
  NormalizedRelationPreferences,
  | "preferred_contact_windows"
  | "disliked_contact_windows"
  | "soft_no_contact_rules"
> {
  const grouped = new Map<RelationContactWindow, ProactiveObservation[]>();
  for (const window of RELATION_CONTACT_WINDOWS) grouped.set(window, []);
  for (const observation of observations) {
    grouped.get(observation.contact_window)?.push(observation);
  }

  const preferred = RELATION_CONTACT_WINDOWS.filter((window) => {
    const bucket = grouped.get(window) ?? [];
    return bucket.length >= 2 && reactionRate(bucket) >= 0.6 &&
      declineRate(bucket) < 0.5;
  });

  const disliked = RELATION_CONTACT_WINDOWS.filter((window) => {
    const bucket = grouped.get(window) ?? [];
    return bucket.length >= 2 &&
      (reactionRate(bucket) <= 0.2 || declineRate(bucket) >= 0.4);
  }).filter((window) => !preferred.includes(window));

  const preferredWindows = preferred.length > 0
    ? preferred
    : current.preferred_contact_windows;
  const dislikedWindows = disliked.length > 0
    ? disliked
    : current.disliked_contact_windows;

  const softRules = disliked.length > 0
    ? {
      avoid_day_parts: disliked,
    }
    : current.soft_no_contact_rules;

  return {
    preferred_contact_windows: sortWindowList(preferredWindows),
    disliked_contact_windows: sortWindowList(dislikedWindows),
    soft_no_contact_rules: softRules ?? null,
  };
}

function inferPreferredTone(
  observations: ProactiveObservation[],
  current: NormalizedRelationPreferences,
): PreferredTone {
  const tones: PreferredTone[] = ["gentle", "direct", "mixed"];
  const stats = tones
    .map((tone) => {
      const bucket = observations.filter((obs) => obs.tone === tone);
      const replyLengths = bucket.flatMap((obs) => obs.reply_lengths);
      return {
        tone,
        count: bucket.length,
        reactionRate: reactionRate(bucket),
        medianReplyLength: median(replyLengths) ?? 0,
      };
    })
    .filter((entry) => entry.count >= 2)
    .sort((a, b) =>
      (b.reactionRate - a.reactionRate) ||
      (b.medianReplyLength - a.medianReplyLength)
    );

  if (stats.length === 0) return current.preferred_tone;
  if (
    stats.length >= 2 &&
    Math.abs(stats[0].reactionRate - stats[1].reactionRate) <= 0.1 &&
    stats[0].reactionRate >= 0.35 &&
    stats[1].reactionRate >= 0.35
  ) {
    return "mixed";
  }
  if (stats[0].reactionRate >= 0.55 || stats[0].medianReplyLength >= 120) {
    return stats[0].tone;
  }
  return current.preferred_tone;
}

function inferPreferredMessageLength(
  observations: ProactiveObservation[],
  current: NormalizedRelationPreferences,
): PreferredMessageLength {
  const replyLengths = observations.flatMap((obs) => obs.reply_lengths);
  if (replyLengths.length < 2) return current.preferred_message_length;
  const medianLength = median(replyLengths) ?? 0;
  return medianLength <= 160 ? "short" : "medium";
}

function inferMaxProactiveIntensity(
  observations: ProactiveObservation[],
  current: NormalizedRelationPreferences,
): MaxProactiveIntensity {
  const light = observations.filter((obs) => obs.budget_class === "light");
  const notable = observations.filter((obs) => obs.budget_class === "notable");

  if (notable.length >= 1) {
    const notableReaction = reactionRate(notable);
    const lightReaction = reactionRate(light);
    const notableDecline = declineRate(notable);
    if (
      notableDecline > 0 ||
      (notableReaction <= 0.2 && lightReaction >= notableReaction + 0.2)
    ) {
      return "low";
    }
  }

  if (notable.length >= 2) {
    const notableReaction = reactionRate(notable);
    const notableDecline = declineRate(notable);
    if (
      notable.length >= 3 && notableReaction >= 0.55 && notableDecline === 0
    ) {
      return "high";
    }
    if (light.length + notable.length >= 4) {
      return "medium";
    }
  }

  return current.max_proactive_intensity;
}

export function inferRelationPreferences(args: {
  timezone: string;
  signals: RelationPreferenceInferenceSignals;
  current?: Partial<UserRelationPreferencesRow> | null;
}): RelationPreferenceInferenceResult {
  const current = normalizeRelationPreferences(args.current);
  const observations = args.signals.proactiveObservations;

  if (observations.length < 4) {
    return { preferences: current, changed: false };
  }

  const next: NormalizedRelationPreferences = {
    ...current,
    ...inferContactWindows(observations, current),
    preferred_tone: inferPreferredTone(observations, current),
    preferred_message_length: inferPreferredMessageLength(
      observations,
      current,
    ),
    max_proactive_intensity: inferMaxProactiveIntensity(observations, current),
  };

  return {
    preferences: next,
    changed: !preferencesEqual(current, next),
  };
}

function normalizeStoredRow(
  userId: string,
  preferences: NormalizedRelationPreferences,
): Record<string, unknown> {
  return {
    user_id: userId,
    preferred_contact_windows: sortWindowList(
      preferences.preferred_contact_windows,
    ),
    disliked_contact_windows: sortWindowList(
      preferences.disliked_contact_windows,
    ),
    preferred_tone: preferences.preferred_tone,
    preferred_message_length: preferences.preferred_message_length,
    max_proactive_intensity: preferences.max_proactive_intensity,
    soft_no_contact_rules: preferences.soft_no_contact_rules,
    updated_at: new Date().toISOString(),
  };
}

export async function getUserRelationPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRelationPreferencesRow | null> {
  const { data, error } = await supabase
    .from("user_relation_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserRelationPreferencesRow | null;
}

export async function upsertUserRelationPreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: NormalizedRelationPreferences,
): Promise<UserRelationPreferencesRow> {
  const payload = normalizeStoredRow(userId, preferences);
  const { data, error } = await supabase
    .from("user_relation_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserRelationPreferencesRow;
}

export async function loadRelationPreferenceSignals(args: {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
  nowIso: string;
  lookbackDays?: number;
}): Promise<RelationPreferenceInferenceSignals> {
  const lookbackDays = Math.max(7, Math.floor(args.lookbackDays ?? 45));
  const lookbackIso = new Date(
    parseIsoMs(args.nowIso) - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sentStatuses = ["sent", "awaiting_user"];

  const [checkinsResult, messagesResult] = await Promise.all([
    args.supabase
      .from("scheduled_checkins")
      .select("scheduled_for,event_context,status,message_payload")
      .eq("user_id", args.userId)
      .in("event_context", [...PROACTIVE_EVENT_CONTEXTS])
      .in("status", sentStatuses)
      .gte("scheduled_for", lookbackIso)
      .lt("scheduled_for", args.nowIso)
      .order("scheduled_for", { ascending: false })
      .limit(30),
    args.supabase
      .from("chat_messages")
      .select("created_at,content")
      .eq("user_id", args.userId)
      .eq("scope", "whatsapp")
      .eq("role", "user")
      .gte("created_at", lookbackIso)
      .lt("created_at", args.nowIso)
      .order("created_at", { ascending: true })
      .limit(80),
  ]);

  if (checkinsResult.error) throw checkinsResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const proactiveCheckins = Array.isArray(checkinsResult.data)
    ? [...checkinsResult.data as ProactiveCheckinRow[]].reverse()
    : [];
  const recentUserMessages = Array.isArray(messagesResult.data)
    ? (messagesResult.data as UserMessageRow[]).map((row) => ({
      created_at: cleanText(row.created_at),
      content: cleanText(row.content),
    })).filter((row) => row.created_at)
    : [];

  const observations = proactiveCheckins.map((row, index) => {
    const startMs = parseIsoMs(row.scheduled_for);
    const nextMs = index < proactiveCheckins.length - 1
      ? parseIsoMs(proactiveCheckins[index + 1].scheduled_for)
      : Number.POSITIVE_INFINITY;
    const responses = recentUserMessages.filter((message) => {
      const messageMs = parseIsoMs(message.created_at);
      return messageMs > startMs && messageMs < nextMs;
    });
    return {
      scheduled_for: cleanText(row.scheduled_for),
      contact_window: contactWindowFromIso(
        cleanText(row.scheduled_for),
        args.timezone,
      ),
      tone: toneFromPayload(asObject(row.message_payload)),
      budget_class: budgetClassFromRow({
        scheduled_for: cleanText(row.scheduled_for),
        event_context: cleanText(row.event_context),
        status: cleanText(row.status),
        message_payload: asObject(row.message_payload),
      }),
      user_reacted: responses.length > 0,
      reply_lengths: responses
        .map((message) => cleanText(message.content).length)
        .filter((length) => length > 0),
      decline_count: responses.filter((message) =>
        messageLooksLikeDecline(message.content)
      ).length,
    } satisfies ProactiveObservation;
  });

  return {
    proactiveObservations: observations,
    recentUserMessages,
  };
}

export async function inferAndPersistRelationPreferences(args: {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
  nowIso: string;
}): Promise<UserRelationPreferencesRow | null> {
  const [current, signals] = await Promise.all([
    getUserRelationPreferences(args.supabase, args.userId),
    loadRelationPreferenceSignals({
      supabase: args.supabase,
      userId: args.userId,
      timezone: args.timezone,
      nowIso: args.nowIso,
    }),
  ]);

  const inferred = inferRelationPreferences({
    timezone: args.timezone,
    signals,
    current,
  });

  if (!inferred.changed) return current;
  return await upsertUserRelationPreferences(
    args.supabase,
    args.userId,
    inferred.preferences,
  );
}

export function allowsContactWindow(
  row: Partial<UserRelationPreferencesRow> | null | undefined,
  window: RelationContactWindow,
): boolean {
  const preferences = normalizeRelationPreferences(row);
  const softAvoid =
    Array.isArray(preferences.soft_no_contact_rules?.avoid_day_parts)
      ? preferences.soft_no_contact_rules?.avoid_day_parts as string[]
      : [];
  if (softAvoid.includes(window)) return false;
  if (preferences.disliked_contact_windows?.includes(window)) return false;
  if (
    preferences.preferred_contact_windows &&
    preferences.preferred_contact_windows.length > 0 &&
    !preferences.preferred_contact_windows.includes(window)
  ) {
    return false;
  }
  return true;
}

export function maxBudgetAllowedByRelationPreferences(
  row: Partial<UserRelationPreferencesRow> | null | undefined,
): ProactiveBudgetClass | null {
  const preferences = normalizeRelationPreferences(row);
  if (preferences.max_proactive_intensity === "low") return "light";
  return null;
}

export function buildRelationPreferencesPromptBlock(
  row: Partial<UserRelationPreferencesRow> | null | undefined,
): string {
  const preferences = normalizeRelationPreferences(row);
  const lines = [
    preferences.preferred_contact_windows?.length
      ? `preferred_contact_windows=${
        preferences.preferred_contact_windows.join(",")
      }`
      : null,
    preferences.disliked_contact_windows?.length
      ? `disliked_contact_windows=${
        preferences.disliked_contact_windows.join(",")
      }`
      : null,
    preferences.preferred_tone
      ? `preferred_tone=${preferences.preferred_tone}`
      : null,
    preferences.preferred_message_length
      ? `preferred_message_length=${preferences.preferred_message_length}`
      : null,
    preferences.max_proactive_intensity
      ? `max_proactive_intensity=${preferences.max_proactive_intensity}`
      : null,
  ].filter(Boolean);

  return lines.length > 0
    ? `Preferences relationnelles inferees:\n- ${lines.join("\n- ")}`
    : "";
}

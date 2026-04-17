import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { DEFAULT_TIMEZONE } from "../_shared/v2-constants.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  buildWeeklyConversationDigestUserPrompt,
  type DigestConversationMessage,
  type DigestDailyBilanSummary,
  type DigestEventMemorySummary,
  parseWeeklyConversationDigestLLMResponse,
  type WeeklyConversationDigestInput,
  type WeeklyConversationDigestValidationResult,
  WEEKLY_CONVERSATION_DIGEST_SYSTEM_PROMPT,
} from "../_shared/v2-prompts/weekly-conversation-digest.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { getActiveTransformationRuntime } from "../_shared/v2-runtime.ts";
import type {
  ConversationPulse,
  WeeklyConversationDigest,
} from "../_shared/v2-types.ts";

const FRESHNESS_HOURS = 12;
const MAX_MESSAGE_LIMIT = 150;

type RuntimeRefs = {
  cycleId: string | null;
  transformationId: string | null;
};

type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ScheduledCheckinRow = {
  scheduled_for: string;
  draft_message: string | null;
  message_payload: Record<string, unknown> | null;
};

type EventMemoryRow = {
  id: string;
  title: string;
  summary: string | null;
  event_type: string | null;
  starts_at: string | null;
  relevance_until: string | null;
  status: string | null;
  confidence: number | null;
  created_at?: string | null;
};

export type BuildWeeklyConversationDigestResult = {
  digest: WeeklyConversationDigest;
  snapshotId: string | null;
  fromCache: boolean;
  runtime: RuntimeRefs;
  input: WeeklyConversationDigestInput | null;
  validation: WeeklyConversationDigestValidationResult | null;
};

export type BuildWeeklyConversationDigestArgs = {
  supabase: SupabaseClient;
  userId: string;
  weekStart: string;
  requestId?: string;
  nowIso?: string;
  forceRefresh?: boolean;
  model?: string;
  source?: string;
  runtime?: RuntimeRefs;
};

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function compactText(value: unknown, maxLen = 160): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function localDateInTimezone(
  valueIso: string,
  timezoneRaw: unknown,
): string {
  const timeZone = String(timezoneRaw ?? "").trim() || DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(valueIso));
}

function isYmdWithinRange(ymd: string, startYmd: string, endYmd: string): boolean {
  return ymd >= startYmd && ymd < endYmd;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function eventDateLabel(row: EventMemoryRow, timezone: string): string {
  const startsAt = String(row.starts_at ?? "").trim();
  if (startsAt) return localDateInTimezone(startsAt, timezone);
  return String(row.status ?? "").trim() === "upcoming" ? "upcoming" : "active";
}

function summarizeDailyBilanRow(
  row: ScheduledCheckinRow,
  timezone: string,
): DigestDailyBilanSummary | null {
  const payload = (row.message_payload ?? {}) as Record<string, unknown>;
  const output = (payload.daily_bilan_output ?? {}) as Record<string, unknown>;
  const mode = String(output.mode ?? payload.mode ?? "").trim();
  const targetItems = Array.isArray(payload.target_item_titles)
    ? payload.target_item_titles.map((value) => compactText(value, 80)).filter(
      Boolean,
    )
    : [];
  const scheduledFor = String(row.scheduled_for ?? "").trim();
  if (!scheduledFor) return null;

  const outcome = compactText(
    payload.decision_reason ?? row.draft_message ?? mode ?? "Bilan quotidien envoyé",
    140,
  );

  return {
    date: localDateInTimezone(scheduledFor, timezone),
    mode: mode || "check_light",
    target_items: targetItems.slice(0, 3),
    outcome: outcome || "Bilan quotidien envoyé",
  };
}

function summarizeEventMemoryRow(
  row: EventMemoryRow,
  timezone: string,
): DigestEventMemorySummary | null {
  const id = String(row.id ?? "").trim();
  const title = compactText(row.title, 80);
  if (!id || !title) return null;

  const relevance = compactText(
    row.summary || row.event_type || row.status || "Événement proche",
    120,
  );

  return {
    id,
    title,
    date: eventDateLabel(row, timezone),
    relevance,
  };
}

function overlapsDigestWeek(
  row: EventMemoryRow,
  timezone: string,
  weekStart: string,
  weekEnd: string,
): boolean {
  const startsAt = String(row.starts_at ?? "").trim();
  if (startsAt) {
    const startYmd = localDateInTimezone(startsAt, timezone);
    if (isYmdWithinRange(startYmd, weekStart, weekEnd)) return true;
  }

  const relevanceUntil = String(row.relevance_until ?? "").trim();
  if (relevanceUntil) {
    const relevanceYmd = localDateInTimezone(relevanceUntil, timezone);
    if (relevanceYmd >= weekStart) {
      const startYmd = startsAt ? localDateInTimezone(startsAt, timezone) : null;
      if (!startYmd || startYmd < weekEnd) return true;
    }
  }

  const status = String(row.status ?? "").trim();
  return status === "active";
}

export function buildWeeklyConversationDigestInput(args: {
  messages: DigestConversationMessage[];
  dailyBilans: DigestDailyBilanSummary[];
  eventMemories: DigestEventMemorySummary[];
  latestPulse: ConversationPulse | null;
  weekStart: string;
  timezone: string;
  nowIso?: string;
}): WeeklyConversationDigestInput {
  const normalizedMessages = uniqueByKey(
    args.messages
      .filter((message) =>
        message.role === "user" || message.role === "assistant"
      )
      .map((message) => ({
        id: String(message.id ?? "").trim(),
        role: message.role,
        text: compactText(message.text, 600),
        created_at: String(message.created_at ?? "").trim(),
      }))
      .filter((message) => message.id && message.text && message.created_at),
    (message) => message.id,
  );

  const userMessages = normalizedMessages.filter((message) =>
    message.role === "user"
  );
  const activeDays = new Set(
    userMessages.map((message) =>
      localDateInTimezone(message.created_at, args.timezone)
    ),
  ).size;

  return {
    messages: normalizedMessages,
    daily_bilans: uniqueByKey(
      args.dailyBilans
        .map((bilan) => ({
          date: String(bilan.date ?? "").trim(),
          mode: compactText(bilan.mode, 40) || "check_light",
          target_items: Array.isArray(bilan.target_items)
            ? bilan.target_items.map((item) => compactText(item, 80)).filter(
              Boolean,
            ).slice(0, 3)
            : [],
          outcome: compactText(bilan.outcome, 140) || "Bilan quotidien envoyé",
        }))
        .filter((bilan) => bilan.date),
      (bilan) =>
        `${bilan.date}:${bilan.mode}:${bilan.target_items.join("|")}:${bilan.outcome}`,
    ).slice(0, 7),
    event_memories: uniqueByKey(
      args.eventMemories
        .map((memory) => ({
          id: String(memory.id ?? "").trim(),
          title: compactText(memory.title, 80),
          date: String(memory.date ?? "").trim(),
          relevance: compactText(memory.relevance, 120),
        }))
        .filter((memory) =>
          memory.id && memory.title && memory.date && memory.relevance
        ),
      (memory) => memory.id,
    ).slice(0, 3),
    latest_pulse: args.latestPulse
      ? {
        tone_dominant: args.latestPulse.tone.dominant,
        trajectory_direction: args.latestPulse.trajectory.direction,
        trajectory_summary: compactText(args.latestPulse.trajectory.summary, 160),
        likely_need: args.latestPulse.signals.likely_need,
        wins: args.latestPulse.highlights.wins.slice(0, 3).map((win) =>
          compactText(win, 100)
        ).filter(Boolean),
        friction_points: args.latestPulse.highlights.friction_points.slice(0, 3)
          .map((point) => compactText(point, 100))
          .filter(Boolean),
      }
      : null,
    week_start: args.weekStart,
    local_date: localDateInTimezone(
      args.nowIso ?? new Date().toISOString(),
      args.timezone,
    ),
    message_count: userMessages.length,
    active_days: activeDays,
  };
}

async function resolveRuntimeRefs(
  supabase: SupabaseClient,
  userId: string,
  runtimeOverride?: RuntimeRefs,
): Promise<RuntimeRefs> {
  if (runtimeOverride) {
    return {
      cycleId: runtimeOverride.cycleId ?? null,
      transformationId: runtimeOverride.transformationId ?? null,
    };
  }

  const runtime = await getActiveTransformationRuntime(supabase as any, userId);
  return {
    cycleId: runtime.cycle?.id ?? null,
    transformationId: runtime.transformation?.id ?? null,
  };
}

async function loadUserTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.timezone ?? "").trim() || DEFAULT_TIMEZONE;
}

async function loadCachedWeeklyDigest(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  weekStart: string;
}): Promise<{ snapshotId: string | null; digest: WeeklyConversationDigest | null }> {
  let query = args.supabase
    .from("system_runtime_snapshots")
    .select("id, payload, created_at")
    .eq("user_id", args.userId)
    .eq("snapshot_type", "weekly_digest")
    .order("created_at", { ascending: false })
    .limit(12);

  if (args.runtime.cycleId) {
    query = query.eq("cycle_id", args.runtime.cycleId);
  }
  if (args.runtime.transformationId) {
    query = query.eq("transformation_id", args.runtime.transformationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const match = ((data as Array<{ id: string; payload: unknown }> | null) ?? [])
    .find((row) => {
      const payload = row.payload as Record<string, unknown> | null;
      return payload != null &&
        typeof payload === "object" &&
        String(payload.week_start ?? "").trim() === args.weekStart;
    });

  if (!match || typeof match.payload !== "object" || match.payload == null) {
    return { snapshotId: null, digest: null };
  }

  return {
    snapshotId: String(match.id ?? "").trim() || null,
    digest: match.payload as WeeklyConversationDigest,
  };
}

async function loadLatestConversationPulse(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  nowIso: string;
}): Promise<ConversationPulse | null> {
  let query = args.supabase
    .from("system_runtime_snapshots")
    .select("payload, created_at")
    .eq("user_id", args.userId)
    .eq("snapshot_type", "conversation_pulse")
    .order("created_at", { ascending: false })
    .limit(1);

  if (args.runtime.cycleId) {
    query = query.eq("cycle_id", args.runtime.cycleId);
  }
  if (args.runtime.transformationId) {
    query = query.eq("transformation_id", args.runtime.transformationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const createdAtMs = parseIsoMs((data as any)?.created_at);
  const nowMs = parseIsoMs(args.nowIso) ?? Date.now();
  if (
    createdAtMs == null ||
    nowMs - createdAtMs > FRESHNESS_HOURS * 60 * 60 * 1000
  ) {
    return null;
  }

  const payload = (data as any)?.payload;
  return payload && typeof payload === "object"
    ? payload as ConversationPulse
    : null;
}

async function loadWeeklyMessages(args: {
  supabase: SupabaseClient;
  userId: string;
  weekStart: string;
  weekEnd: string;
  timezone: string;
}): Promise<DigestConversationMessage[]> {
  const queryStart = `${addDaysYmd(args.weekStart, -1)}T00:00:00.000Z`;
  const queryEnd = `${addDaysYmd(args.weekEnd, 1)}T00:00:00.000Z`;

  const { data, error } = await args.supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", args.userId)
    .in("scope", ["whatsapp", "web"] as any)
    .in("role", ["user", "assistant"] as any)
    .gte("created_at", queryStart)
    .lt("created_at", queryEnd)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGE_LIMIT);

  if (error) throw error;

  return ((data as ChatMessageRow[] | null) ?? [])
    .filter((row) => row.content && row.created_at)
    .filter((row) =>
      isYmdWithinRange(
        localDateInTimezone(row.created_at, args.timezone),
        args.weekStart,
        args.weekEnd,
      )
    )
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      role: row.role,
      text: String(row.content ?? "").trim(),
      created_at: String(row.created_at ?? "").trim(),
    }));
}

async function loadWeeklyDailyBilans(args: {
  supabase: SupabaseClient;
  userId: string;
  weekStart: string;
  weekEnd: string;
  timezone: string;
}): Promise<DigestDailyBilanSummary[]> {
  const queryStart = `${addDaysYmd(args.weekStart, -1)}T00:00:00.000Z`;
  const queryEnd = `${addDaysYmd(args.weekEnd, 1)}T00:00:00.000Z`;

  const { data, error } = await args.supabase
    .from("scheduled_checkins")
    .select("scheduled_for, draft_message, message_payload")
    .eq("user_id", args.userId)
    .eq("event_context", "daily_bilan_v2")
    .gte("scheduled_for", queryStart)
    .lt("scheduled_for", queryEnd)
    .order("scheduled_for", { ascending: true })
    .limit(10);

  if (error) throw error;

  return ((data as ScheduledCheckinRow[] | null) ?? [])
    .filter((row) =>
      isYmdWithinRange(
        localDateInTimezone(row.scheduled_for, args.timezone),
        args.weekStart,
        args.weekEnd,
      )
    )
    .map((row) => summarizeDailyBilanRow(row, args.timezone))
    .filter((row): row is DigestDailyBilanSummary => row != null)
    .slice(0, 7);
}

async function loadWeeklyEventMemories(args: {
  supabase: SupabaseClient;
  userId: string;
  weekStart: string;
  weekEnd: string;
  timezone: string;
}): Promise<DigestEventMemorySummary[]> {
  const queryStart = `${addDaysYmd(args.weekStart, -7)}T00:00:00.000Z`;
  const queryEnd = `${addDaysYmd(args.weekEnd, 21)}T00:00:00.000Z`;

  const { data, error } = await args.supabase
    .from("user_event_memories")
    .select(
      "id, title, summary, event_type, starts_at, relevance_until, status, confidence, created_at",
    )
    .eq("user_id", args.userId)
    .in("status", ["upcoming", "active", "recently_past"] as any)
    .or(`starts_at.is.null,starts_at.lte.${queryEnd},relevance_until.gte.${queryStart}`)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("confidence", { ascending: false })
    .limit(6);

  if (error) throw error;

  return ((data as EventMemoryRow[] | null) ?? [])
    .filter((row) =>
      overlapsDigestWeek(row, args.timezone, args.weekStart, args.weekEnd)
    )
    .map((row) => summarizeEventMemoryRow(row, args.timezone))
    .filter((row): row is DigestEventMemorySummary => row != null)
    .slice(0, 3);
}

async function insertWeeklyDigestSnapshot(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  digest: WeeklyConversationDigest;
}): Promise<string> {
  const { data, error } = await args.supabase
    .from("system_runtime_snapshots")
    .insert({
      user_id: args.userId,
      cycle_id: args.runtime.cycleId,
      transformation_id: args.runtime.transformationId,
      snapshot_type: "weekly_digest",
      payload: args.digest,
    } as any)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim();
}

async function tryLogWeeklyDigestGenerated(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  snapshotId: string;
  digest: WeeklyConversationDigest;
}) {
  try {
    await logV2Event(
      args.supabase,
      V2_EVENT_TYPES.WEEKLY_DIGEST_GENERATED,
      {
        user_id: args.userId,
        cycle_id: args.runtime.cycleId,
        transformation_id: args.runtime.transformationId,
        snapshot_id: args.snapshotId,
        week_start: args.digest.week_start,
        dominant_tone: args.digest.dominant_tone,
        confidence: args.digest.confidence,
        message_count: args.digest.message_count,
        active_days: args.digest.active_days,
      },
    );
  } catch (error) {
    console.warn(
      "[weekly_conversation_digest_builder] failed to log weekly_digest_generated_v2",
      error,
    );
  }
}

export async function buildWeeklyConversationDigest(
  args: BuildWeeklyConversationDigestArgs,
): Promise<BuildWeeklyConversationDigestResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const runtime = await resolveRuntimeRefs(
    args.supabase,
    args.userId,
    args.runtime,
  );

  if (!args.forceRefresh) {
    const cached = await loadCachedWeeklyDigest({
      supabase: args.supabase,
      userId: args.userId,
      runtime,
      weekStart: args.weekStart,
    });
    if (cached.digest) {
      return {
        digest: cached.digest,
        snapshotId: cached.snapshotId,
        fromCache: true,
        runtime,
        input: null,
        validation: null,
      };
    }
  }

  const timezone = await loadUserTimezone(args.supabase, args.userId);
  const weekEnd = addDaysYmd(args.weekStart, 7);

  const [messages, dailyBilans, eventMemories, latestPulse] = await Promise.all([
    loadWeeklyMessages({
      supabase: args.supabase,
      userId: args.userId,
      weekStart: args.weekStart,
      weekEnd,
      timezone,
    }),
    loadWeeklyDailyBilans({
      supabase: args.supabase,
      userId: args.userId,
      weekStart: args.weekStart,
      weekEnd,
      timezone,
    }),
    loadWeeklyEventMemories({
      supabase: args.supabase,
      userId: args.userId,
      weekStart: args.weekStart,
      weekEnd,
      timezone,
    }),
    loadLatestConversationPulse({
      supabase: args.supabase,
      userId: args.userId,
      runtime,
      nowIso,
    }),
  ]);

  const input = buildWeeklyConversationDigestInput({
    messages,
    dailyBilans,
    eventMemories,
    latestPulse,
    weekStart: args.weekStart,
    timezone,
    nowIso,
  });

  const raw = await generateWithGemini(
    WEEKLY_CONVERSATION_DIGEST_SYSTEM_PROMPT.trim(),
    buildWeeklyConversationDigestUserPrompt(input).trim(),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      userId: args.userId,
      source: args.source ?? "weekly_conversation_digest_builder",
      model: (args.model ??
        Deno.env.get("WEEKLY_DIGEST_MODEL") ??
        Deno.env.get("WEEKLY_BILAN_V2_MODEL") ??
        getGlobalAiModel("gemini-2.5-flash")).trim() || "gemini-2.5-flash",
    },
  );

  const rawText = typeof raw === "string"
    ? raw
    : JSON.stringify((raw as any)?.args ?? raw);
  const validation = parseWeeklyConversationDigestLLMResponse(
    rawText,
    input,
    nowIso,
  );
  const snapshotId = await insertWeeklyDigestSnapshot({
    supabase: args.supabase,
    userId: args.userId,
    runtime,
    digest: validation.digest,
  });

  await tryLogWeeklyDigestGenerated({
    supabase: args.supabase,
    userId: args.userId,
    runtime,
    snapshotId,
    digest: validation.digest,
  });

  return {
    digest: validation.digest,
    snapshotId,
    fromCache: false,
    runtime,
    input,
    validation,
  };
}

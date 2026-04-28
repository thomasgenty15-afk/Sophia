import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { DEFAULT_TIMEZONE } from "../_shared/v2-constants.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  buildConversationPulseUserPrompt,
  CONVERSATION_PULSE_SYSTEM_PROMPT,
  type ConversationMessage,
  type ConversationPulseInput,
  type ConversationPulseValidationResult,
  type EventMemorySummary,
  parseConversationPulseLLMResponse,
  type RecentBilanSummary,
  type RecentTransformationHandoffSummary,
} from "../_shared/v2-prompts/conversation-pulse.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { getActiveTransformationRuntime } from "../_shared/v2-runtime.ts";
import type { ConversationPulse } from "../_shared/v2-types.ts";
import { checkAndUnlockPrinciples } from "../_shared/v2-unlock-principles.ts";
import { extractConversationPulseHandoffSummary } from "./transformation_handoff.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const FRESHNESS_HOURS = 12;
const DEFAULT_MESSAGE_LIMIT = 80;

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

type EventMemoryRow = {
  id: string;
  title: string;
  summary: string | null;
  event_type: string | null;
  starts_at: string | null;
  relevance_until: string | null;
  status: string | null;
  confidence: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type BuildConversationPulseResult = {
  pulse: ConversationPulse;
  snapshotId: string | null;
  fromCache: boolean;
  runtime: RuntimeRefs;
  input: ConversationPulseInput | null;
  validation: ConversationPulseValidationResult | null;
};

export type BuildConversationPulseArgs = {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string;
  nowIso?: string;
  forceRefresh?: boolean;
  model?: string;
  source?: string;
};

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function localDateInTimezone(timezoneRaw: unknown, nowIso: string): string {
  const timeZone = String(timezoneRaw ?? "").trim() || DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowIso));
}

function compactText(value: unknown, maxLen = 160): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function eventDateLabel(row: EventMemoryRow): string {
  const startsAt = String(row.starts_at ?? "").trim();
  if (startsAt) {
    const ms = parseIsoMs(startsAt);
    if (ms != null) {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));
    }
  }
  return String(row.status ?? "").trim() === "upcoming" ? "upcoming" : "recent";
}

function summarizeEventMemoryRow(
  row: EventMemoryRow,
): EventMemorySummary | null {
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
    date: eventDateLabel(row),
    relevance,
  };
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

export function buildConversationPulseInput(args: {
  messages: ConversationMessage[];
  recentBilans: RecentBilanSummary[];
  eventMemories: EventMemorySummary[];
  recentTransformationHandoff?: RecentTransformationHandoffSummary | null;
  localDate: string;
  nowIso?: string;
}): ConversationPulseInput {
  const nowMs = parseIsoMs(args.nowIso ?? new Date().toISOString()) ??
    Date.now();
  const cutoff72h = nowMs - SEVENTY_TWO_HOURS_MS;

  const messages = args.messages
    .filter((message) =>
      message.role === "user" || message.role === "assistant"
    )
    .map((message) => ({
      id: String(message.id ?? "").trim(),
      role: message.role,
      text: compactText(message.text, 600),
      created_at: String(message.created_at ?? "").trim(),
    }))
    .filter((message) => message.id && message.text && message.created_at)
    .slice(-DEFAULT_MESSAGE_LIMIT);

  const messagesLast72hCount = messages.filter((message) => {
    const createdAtMs = parseIsoMs(message.created_at);
    return createdAtMs != null && createdAtMs >= cutoff72h;
  }).length;

  const recentBilans = uniqueByKey(
    args.recentBilans
      .map((bilan) => ({
        kind: bilan.kind,
        date: String(bilan.date ?? "").trim(),
        summary: compactText(bilan.summary, 140),
      }))
      .filter((bilan) => bilan.date && bilan.summary),
    (bilan) => `${bilan.kind}:${bilan.date}:${bilan.summary}`,
  ).slice(0, 3);

  const eventMemories = uniqueByKey(
    args.eventMemories
      .map((eventMemory) => ({
        id: String(eventMemory.id ?? "").trim(),
        title: compactText(eventMemory.title, 80),
        date: String(eventMemory.date ?? "").trim(),
        relevance: compactText(eventMemory.relevance, 120),
      }))
      .filter((eventMemory) =>
        eventMemory.id && eventMemory.title && eventMemory.date &&
        eventMemory.relevance
      ),
    (eventMemory) => eventMemory.id,
  ).slice(0, 3);

  return {
    messages,
    messages_last_72h_count: messagesLast72hCount,
    recent_bilans: recentBilans,
    event_memories: eventMemories,
    recent_transformation_handoff: args.recentTransformationHandoff ?? null,
    local_date: args.localDate,
  };
}

async function loadRuntimeRefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<RuntimeRefs> {
  const runtime = await getActiveTransformationRuntime(supabase as any, userId);
  return {
    cycleId: runtime.cycle?.id ?? null,
    transformationId: runtime.transformation?.id ?? null,
  };
}

async function loadFreshConversationPulse(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  nowIso: string;
}): Promise<{ snapshotId: string | null; pulse: ConversationPulse | null }> {
  let query = args.supabase
    .from("system_runtime_snapshots")
    .select("id, payload, created_at")
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
  if (!data) return { snapshotId: null, pulse: null };

  const createdAtMs = parseIsoMs((data as any)?.created_at);
  const nowMs = parseIsoMs(args.nowIso) ?? Date.now();
  if (
    createdAtMs == null ||
    nowMs - createdAtMs > FRESHNESS_HOURS * 60 * 60 * 1000
  ) {
    return { snapshotId: null, pulse: null };
  }

  const payload = (data as any)?.payload;
  if (!payload || typeof payload !== "object") {
    return { snapshotId: null, pulse: null };
  }

  return {
    snapshotId: String((data as any)?.id ?? "").trim() || null,
    pulse: payload as ConversationPulse,
  };
}

async function loadRecentMessages(args: {
  supabase: SupabaseClient;
  userId: string;
  nowIso: string;
}): Promise<ConversationMessage[]> {
  const sinceIso = new Date(
    (parseIsoMs(args.nowIso) ?? Date.now()) - SEVEN_DAYS_MS,
  ).toISOString();

  const { data, error } = await args.supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", args.userId)
    .in("scope", ["whatsapp", "web"] as any)
    .in("role", ["user", "assistant"] as any)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_MESSAGE_LIMIT);

  if (error) throw error;

  return ((data as ChatMessageRow[] | null) ?? [])
    .filter((row) => row.content && row.created_at)
    .reverse()
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      role: row.role,
      text: String(row.content ?? "").trim(),
      created_at: String(row.created_at ?? "").trim(),
    }));
}

async function loadRecentBilans(args: {
  supabase: SupabaseClient;
  userId: string;
  nowIso: string;
}): Promise<RecentBilanSummary[]> {
  void args;
  return [];
}

async function loadNearbyEventMemories(args: {
  supabase: SupabaseClient;
  userId: string;
  nowIso: string;
}): Promise<EventMemorySummary[]> {
  const upcomingWindowIso = new Date(
    (parseIsoMs(args.nowIso) ?? Date.now()) + (21 * 24 * 60 * 60 * 1000),
  ).toISOString();
  const recentWindowIso = new Date(
    (parseIsoMs(args.nowIso) ?? Date.now()) - (7 * 24 * 60 * 60 * 1000),
  ).toISOString();

  const { data, error } = await args.supabase
    .from("user_event_memories")
    .select(
      "id, title, summary, event_type, starts_at, relevance_until, status, confidence, updated_at, created_at",
    )
    .eq("user_id", args.userId)
    .in("status", ["upcoming", "active", "recently_past"] as any)
    .or(
      `starts_at.is.null,starts_at.lte.${upcomingWindowIso}`,
    )
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("confidence", { ascending: false })
    .limit(6);

  if (error) throw error;

  return ((data as EventMemoryRow[] | null) ?? [])
    .filter((row) => {
      const startsAtMs = parseIsoMs(row.starts_at);
      const relevanceUntilMs = parseIsoMs(row.relevance_until);
      const recentWindowMs = parseIsoMs(recentWindowIso) ?? 0;
      if (startsAtMs != null && startsAtMs >= recentWindowMs) return true;
      if (relevanceUntilMs != null && relevanceUntilMs >= recentWindowMs) {
        return true;
      }
      return String(row.status ?? "").trim() === "upcoming" ||
        String(row.status ?? "").trim() === "active";
    })
    .map(summarizeEventMemoryRow)
    .filter((row): row is EventMemorySummary => row != null)
    .slice(0, 3);
}

async function loadRecentTransformationHandoff(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
}): Promise<RecentTransformationHandoffSummary | null> {
  if (!args.runtime.cycleId || !args.runtime.transformationId) return null;

  const { data, error } = await args.supabase
    .from("user_transformations")
    .select("id,title,completed_at,handoff_payload")
    .eq("cycle_id", args.runtime.cycleId)
    .neq("id", args.runtime.transformationId)
    .eq("status", "completed")
    .not("handoff_payload", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const summary = extractConversationPulseHandoffSummary(
    (data as any).handoff_payload ?? null,
  );
  if (!summary) return null;

  return {
    ...summary,
    transformation_id: String((data as any)?.id ?? "").trim() ||
      summary.transformation_id,
    title: String((data as any)?.title ?? "").trim() || summary.title,
    completed_at: String((data as any)?.completed_at ?? "").trim() ||
      summary.completed_at,
  };
}

async function insertConversationPulseSnapshot(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  pulse: ConversationPulse;
}): Promise<string> {
  const { data, error } = await args.supabase
    .from("system_runtime_snapshots")
    .insert({
      user_id: args.userId,
      cycle_id: args.runtime.cycleId,
      transformation_id: args.runtime.transformationId,
      snapshot_type: "conversation_pulse",
      payload: args.pulse,
    } as any)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim();
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

async function tryLogConversationPulseGenerated(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: RuntimeRefs;
  snapshotId: string;
  pulse: ConversationPulse;
}) {
  try {
    await logV2Event(
      args.supabase,
      V2_EVENT_TYPES.CONVERSATION_PULSE_GENERATED,
      {
        user_id: args.userId,
        cycle_id: args.runtime.cycleId,
        transformation_id: args.runtime.transformationId,
        snapshot_id: args.snapshotId,
        dominant_tone: args.pulse.tone.dominant,
        likely_need: args.pulse.signals.likely_need,
        proactive_risk: args.pulse.signals.proactive_risk,
      },
    );
  } catch (error) {
    console.warn(
      "[conversation_pulse_builder] failed to log conversation_pulse_generated_v2",
      error,
    );
  }
}

export async function buildConversationPulse(
  args: BuildConversationPulseArgs,
): Promise<BuildConversationPulseResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const runtime = await loadRuntimeRefs(args.supabase, args.userId);

  if (!args.forceRefresh) {
    const fresh = await loadFreshConversationPulse({
      supabase: args.supabase,
      userId: args.userId,
      runtime,
      nowIso,
    });
    if (fresh.pulse) {
      return {
        pulse: fresh.pulse,
        snapshotId: fresh.snapshotId,
        fromCache: true,
        runtime,
        input: null,
        validation: null,
      };
    }
  }

  const [
    timezone,
    messages,
    recentBilans,
    eventMemories,
    recentTransformationHandoff,
  ] = await Promise.all([
    loadUserTimezone(args.supabase, args.userId),
    loadRecentMessages({
      supabase: args.supabase,
      userId: args.userId,
      nowIso,
    }),
    loadRecentBilans({
      supabase: args.supabase,
      userId: args.userId,
      nowIso,
    }),
    loadNearbyEventMemories({
      supabase: args.supabase,
      userId: args.userId,
      nowIso,
    }),
    loadRecentTransformationHandoff({
      supabase: args.supabase,
      userId: args.userId,
      runtime,
    }),
  ]);

  const input = buildConversationPulseInput({
    messages,
    recentBilans,
    eventMemories,
    recentTransformationHandoff,
    localDate: localDateInTimezone(timezone, nowIso),
    nowIso,
  });

  const raw = await generateWithGemini(
    CONVERSATION_PULSE_SYSTEM_PROMPT.trim(),
    buildConversationPulseUserPrompt(input).trim(),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      userId: args.userId,
      source: args.source ?? "conversation_pulse_builder",
      model: (args.model ?? Deno.env.get("CONVERSATION_PULSE_MODEL") ??
        getGlobalAiModel("gemini-2.5-flash")).trim() || "gemini-2.5-flash",
    },
  );

  const rawText = typeof raw === "string"
    ? raw
    : JSON.stringify((raw as any)?.args ?? raw);
  const validation = parseConversationPulseLLMResponse(rawText, input, nowIso);
  const snapshotId = await insertConversationPulseSnapshot({
    supabase: args.supabase,
    userId: args.userId,
    runtime,
    pulse: validation.pulse,
  });

  await tryLogConversationPulseGenerated({
    supabase: args.supabase,
    userId: args.userId,
    runtime,
    snapshotId,
    pulse: validation.pulse,
  });

  if (runtime.transformationId) {
    checkAndUnlockPrinciples(
      args.supabase,
      args.userId,
      runtime.transformationId,
      { type: "conversation_pulse_generated", pulse: validation.pulse },
    ).catch((err) =>
      console.warn(
        "[conversation_pulse_builder] principle unlock check failed:",
        err,
      )
    );
  }

  return {
    pulse: validation.pulse,
    snapshotId,
    fromCache: false,
    runtime,
    input,
    validation,
  };
}

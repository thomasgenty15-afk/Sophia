/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import { runMemorizerAsyncIfEnabled } from "../_shared/memory/memorizer/memorizer_async.ts";
import { SupabaseMemorizerRepository } from "../_shared/memory/memorizer/persist.ts";
import type {
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
} from "../_shared/memory/memorizer/types.ts";
import {
  actionFamilyAliases,
  buildActionFamilyKey,
} from "../_shared/memory/action_family.ts";

const DEFAULT_USER_LIMIT = 100;
const DEFAULT_HOURS = 30;

function logDailyMemorizer(
  event: string,
  payload: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
) {
  const line = JSON.stringify({
    tag: "trigger-memorizer-daily",
    event,
    ...payload,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function optionalPositiveLimit(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.floor(n));
}

function clampHours(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_HOURS);
  if (!Number.isFinite(n)) return DEFAULT_HOURS;
  return Math.max(1, Math.min(72, Math.floor(n)));
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function loadCandidateUsers(args: {
  admin: any;
  since_iso: string;
  user_id: string;
  limit: number;
}): Promise<Array<{ id: string; timezone: string | null }>> {
  if (args.user_id) {
    const { data, error } = await args.admin
      .from("profiles")
      .select("id,timezone")
      .eq("id", args.user_id)
      .maybeSingle();
    if (error) throw error;
    return [{
      id: args.user_id,
      timezone: data?.timezone ?? null,
    }];
  }

  const { data, error } = await args.admin
    .from("chat_messages")
    .select("user_id")
    .eq("role", "user")
    .gte("created_at", args.since_iso)
    .order("created_at", { ascending: false })
    .limit(Math.max(args.limit * 20, args.limit));
  if (error) throw error;

  const userIds: string[] = [
    ...new Set<string>(
      (data ?? []).map((row: any) => String(row.user_id ?? "")).filter(Boolean),
    ),
  ].slice(0, args.limit);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await args.admin
    .from("profiles")
    .select("id,timezone")
    .in("id", userIds);
  if (profileError) throw profileError;

  const timezoneByUser = new Map<string, string | null>(
    (profiles ?? []).map((row: any): [string, string | null] => [
      String(row.id),
      row.timezone == null ? null : String(row.timezone),
    ]),
  );
  return userIds.map((id) => ({
    id,
    timezone: timezoneByUser.get(id) ?? null,
  }));
}

async function loadUnprocessedMessages(args: {
  admin: any;
  user_id: string;
  since_iso: string;
  limit?: number | null;
}): Promise<MemorizerMessage[]> {
  let query = args.admin
    .from("chat_messages")
    .select("id,user_id,role,content,created_at,metadata")
    .eq("user_id", args.user_id)
    .eq("role", "user")
    .gte("created_at", args.since_iso)
    .order("created_at", { ascending: true });
  if (args.limit != null) query = query.limit(args.limit);

  const { data: messages, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(messages) ? messages : [];
  if (rows.length === 0) return [];

  const ids = rows.map((row: any) => String(row.id));
  const { data: processed, error: processedError } = await args.admin
    .from("memory_message_processing")
    .select("message_id")
    .eq("user_id", args.user_id)
    .eq("processing_role", "primary")
    .eq("processing_status", "completed")
    .in("message_id", ids);
  if (processedError) throw processedError;
  const processedIds = new Set(
    (processed ?? []).map((row: any) => String(row.message_id)),
  );

  return rows
    .filter((row: any) => !processedIds.has(String(row.id)))
    .map((row: any) => ({
      id: String(row.id),
      user_id: args.user_id,
      role: "user",
      content: String(row.content ?? ""),
      created_at: row.created_at ?? null,
      metadata: row.metadata ?? {},
    }));
}

async function loadKnownTopics(
  admin: any,
  userId: string,
): Promise<KnownTopic[]> {
  const { data, error } = await admin
    .from("user_topic_memories")
    .select("id,slug,title,lifecycle_stage,search_doc,status,metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    metadata: row.metadata ?? {},
    id: String(row.id),
    slug: row.slug ?? null,
    title: String(row.title ?? ""),
    lifecycle_stage: row.lifecycle_stage ?? null,
    search_doc: row.search_doc ?? null,
    domain_keys: Array.isArray(row.metadata?.domain_keys)
      ? row.metadata.domain_keys.map(String)
      : [],
  }));
}

async function loadKnownMemoryItems(
  admin: any,
  userId: string,
): Promise<KnownMemoryItem[]> {
  const { data, error } = await admin
    .from("memory_items")
    .select(
      "id,kind,content_text,normalized_summary,canonical_key,domain_keys,status,source_message_id,event_start_at,event_end_at",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as KnownMemoryItem[];
}

function numericOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

async function loadPlanSignals(args: {
  admin: any;
  user_id: string;
  since_iso: string;
}): Promise<PlanSignal[]> {
  const { data: items, error } = await args.admin
    .from("user_plan_items")
    .select(
      "id,title,kind,dimension,status,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,payload,updated_at,activated_at",
    )
    .eq("user_id", args.user_id)
    .in("status", ["active", "in_maintenance"])
    .limit(80);
  if (error) throw error;
  const planItems = Array.isArray(items) ? items : [];
  if (planItems.length === 0) return [];

  const ids = planItems.map((item: any) => String(item.id ?? "")).filter(Boolean);
  const { data: entries, error: entriesError } = await args.admin
    .from("user_plan_item_entries")
    .select("id,plan_item_id,outcome,entry_kind,effective_at,created_at,metadata")
    .eq("user_id", args.user_id)
    .gte("effective_at", args.since_iso)
    .in("plan_item_id", ids)
    .order("effective_at", { ascending: true })
    .limit(200);
  if (entriesError) throw entriesError;

  const entriesByItem = new Map<string, any[]>();
  for (const entry of entries ?? []) {
    const planItemId = String(entry.plan_item_id ?? "").trim();
    if (!planItemId) continue;
    const list = entriesByItem.get(planItemId) ?? [];
    list.push(entry);
    entriesByItem.set(planItemId, list);
  }

  return planItems.map((item: any): PlanSignal => {
    const payload = item.payload && typeof item.payload === "object"
      ? item.payload as Record<string, unknown>
      : {};
    const action_family_key = buildActionFamilyKey({
      id: item.id,
      title: item.title,
      kind: item.kind,
      dimension: item.dimension,
      start_after_item_id: item.start_after_item_id,
      payload,
    });
    const itemEntries = entriesByItem.get(String(item.id)) ?? [];
    const occurrenceIds = itemEntries
      .map((entry) => String(entry.id ?? "").trim())
      .filter(Boolean);
    const start = itemEntries[0]?.effective_at ?? item.activated_at ??
      item.updated_at ?? null;
    const end = itemEntries[itemEntries.length - 1]?.effective_at ?? start;
    return {
      plan_item_id: String(item.id),
      title: String(item.title ?? ""),
      kind: item.kind ?? null,
      dimension: item.dimension ?? null,
      status: item.status ?? null,
      action_family_key,
      aliases: actionFamilyAliases({
        id: item.id,
        title: item.title,
        kind: item.kind,
        dimension: item.dimension,
        start_after_item_id: item.start_after_item_id,
        payload,
      }),
      target_reps: numericOrNull(item.target_reps),
      current_reps: numericOrNull(item.current_reps),
      cadence_label: item.cadence_label ?? null,
      scheduled_days: stringArrayOrNull(item.scheduled_days),
      time_of_day: item.time_of_day ?? null,
      start_after_item_id: item.start_after_item_id ?? null,
      action_variant: {
        target_reps: numericOrNull(item.target_reps),
        current_reps: numericOrNull(item.current_reps),
        cadence_label: item.cadence_label ?? null,
        scheduled_days: stringArrayOrNull(item.scheduled_days),
        time_of_day: item.time_of_day ?? null,
        recent_entry_outcomes: itemEntries.map((entry) => ({
          outcome: entry.outcome ?? null,
          entry_kind: entry.entry_kind ?? null,
          effective_at: entry.effective_at ?? null,
        })).slice(-8),
      },
      occurrence_ids: occurrenceIds,
      observation_window_start: start,
      observation_window_end: end,
    };
  });
}

async function loadExtractionRunSummary(
  admin: any,
  extractionRunId: string | null | undefined,
) {
  if (!extractionRunId) return null;
  const { data, error } = await admin
    .from("memory_extraction_runs")
    .select(
      "id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,proposed_entity_count,accepted_entity_count,duration_ms,error_message,metadata",
    )
    .eq("id", extractionRunId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const metadata = data.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
  const durableWrites = metadata.durable_writes &&
      typeof metadata.durable_writes === "object"
    ? metadata.durable_writes
    : {};
  const rejected = Array.isArray(metadata.rejected_observations)
    ? metadata.rejected_observations
    : [];
  const writeDecisions = Array.isArray(metadata.write_decisions)
    ? metadata.write_decisions
    : [];
  const rejectionReasons = rejected.reduce(
    (acc: Record<string, number>, entry: any) => {
      const reason = String(entry?.reason ?? "unknown");
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const decisionStatuses = writeDecisions.reduce(
    (acc: Record<string, number>, entry: any) => {
      const status = String(entry?.status ?? "unknown");
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  return {
    id: data.id,
    status: data.status,
    trigger_type: data.trigger_type,
    proposed_item_count: data.proposed_item_count ?? 0,
    accepted_item_count: data.accepted_item_count ?? 0,
    rejected_item_count: data.rejected_item_count ?? 0,
    proposed_entity_count: data.proposed_entity_count ?? 0,
    accepted_entity_count: data.accepted_entity_count ?? 0,
    duration_ms: data.duration_ms ?? null,
    error_message: data.error_message ?? null,
    durable_writes: durableWrites,
    pre_filter_skip_count: metadata.pre_filter_skip_count ?? 0,
    statement_as_fact_violation_count:
      metadata.statement_as_fact_violation_count ?? 0,
    rejection_reasons: rejectionReasons,
    write_decision_statuses: decisionStatuses,
  };
}

async function runDailyMemorizerForUser(args: {
  admin: any;
  user_id: string;
  messages: MemorizerMessage[];
  since_iso: string;
}) {
  if (args.messages.length === 0) {
    return {
      status: "skipped",
      reason: "no_unprocessed_messages",
      processed_message_count: 0,
      persisted_count: 0,
    };
  }

  const knownTopics = await loadKnownTopics(args.admin, args.user_id);
  const knownItems = await loadKnownMemoryItems(args.admin, args.user_id);
  const planSignals = await loadPlanSignals({
    admin: args.admin,
    user_id: args.user_id,
    since_iso: args.since_iso,
  });
  logDailyMemorizer("user_context_loaded", {
    user_id: args.user_id,
    message_count: args.messages.length,
    known_topics_count: knownTopics.length,
    known_memory_items_count: knownItems.length,
    plan_signal_count: planSignals.length,
  });
  const result = await runMemorizerAsyncIfEnabled(
    new SupabaseMemorizerRepository(args.admin),
    {
      user_id: args.user_id,
      messages: args.messages,
      known_topics: knownTopics,
      existing_memory_items: knownItems,
      plan_signals: planSignals,
      active_topic: knownTopics[0] ?? null,
      trigger_type: "daily_batch",
    },
  );
  const extractionRunSummary = await loadExtractionRunSummary(
    args.admin,
    result?.extraction_run_id,
  );

  return {
    status: result?.status ?? "disabled",
    reason: result?.skip_reason ?? null,
    processed_message_count: result?.status === "completed"
      ? args.messages.length
      : 0,
    persisted_count: result?.persisted.length ?? 0,
    extraction_run_id: result?.extraction_run_id ?? null,
    batch_hash: result?.batch_hash ?? null,
    write_decision_count: result?.write_decisions.length ?? 0,
    extraction_run: extractionRunSummary,
  };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    logDailyMemorizer("request_received", {
      request_id: requestId,
      method: req.method,
      has_internal_secret_header: Boolean(req.headers.get("x-internal-secret")),
      has_authorization_header: Boolean(req.headers.get("authorization")),
    });
    const authResp = ensureInternalRequest(req);
    if (authResp) {
      logDailyMemorizer("request_rejected_by_internal_auth", {
        request_id: requestId,
        status: authResp.status,
      }, "warn");
      return authResp;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const admin = adminClient();
    const hours = clampHours(payload.hours);
    const sinceIso = cleanText(payload.since_iso) ||
      new Date(Date.now() - hours * 3_600_000).toISOString();
    const userLimit = clampLimit(payload.user_limit, DEFAULT_USER_LIMIT, 500);
    const messageLimit = optionalPositiveLimit(payload.message_limit);
    const userId = cleanText(payload.user_id);
    logDailyMemorizer("request_configured", {
      request_id: requestId,
      user_id: userId || null,
      since_iso: sinceIso,
      hours,
      user_limit: userLimit,
      message_limit: messageLimit ?? null,
      memory_observability_on:
        String(Deno.env.get("MEMORY_OBSERVABILITY_ON") ?? "").trim() || null,
      memorizer_enabled:
        String(Deno.env.get("memory_v2_memorizer_enabled") ?? "").trim() ||
        null,
      memorizer_disabled:
        String(Deno.env.get("memory_v2_memorizer_disabled") ?? "").trim() ||
        null,
    });
    const users = await loadCandidateUsers({
      admin,
      since_iso: sinceIso,
      user_id: userId,
      limit: userLimit,
    });
    logDailyMemorizer("candidate_users_loaded", {
      request_id: requestId,
      candidate_user_count: users.length,
      user_ids: users.map((user) => user.id).slice(0, 20),
    });

    const processed = [];
    for (const user of users) {
      logDailyMemorizer("user_started", {
        request_id: requestId,
        user_id: user.id,
        timezone: user.timezone ?? "Europe/Paris",
      });
      const messages = await loadUnprocessedMessages({
        admin,
        user_id: user.id,
        since_iso: sinceIso,
        limit: messageLimit,
      });
      logDailyMemorizer("messages_loaded", {
        request_id: requestId,
        user_id: user.id,
        message_count: messages.length,
        message_ids: messages.map((message) => message.id).slice(0, 20),
      });
      const memorizer = await runDailyMemorizerForUser({
        admin,
        user_id: user.id,
        messages,
        since_iso: sinceIso,
      });
      logDailyMemorizer("user_completed", {
        request_id: requestId,
        user_id: user.id,
        message_count: messages.length,
        memorizer,
      });
      await logMemoryObservabilityEvent({
        supabase: admin,
        userId: user.id,
        requestId,
        sourceComponent: "trigger-memorizer-daily",
        eventName: "memory.daily_memorizer.completed",
        payload: {
          since_iso: sinceIso,
          hours,
          message_limit: messageLimit ?? null,
          message_count: messages.length,
          memorizer,
        },
      });
      processed.push({
        user_id: user.id,
        timezone: user.timezone ?? "Europe/Paris",
        message_count: messages.length,
        memorizer,
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      since_iso: sinceIso,
      processed_count: processed.length,
      processed,
    });
  } catch (error) {
    logDailyMemorizer("request_failed", {
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    }, "error");
    await logEdgeFunctionError({
      functionName: "trigger-memorizer-daily",
      severity: "error",
      title: "daily_memorizer_failed",
      error,
      requestId,
      source: "internal",
    });
    return jsonResponse(req, {
      ok: false,
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});

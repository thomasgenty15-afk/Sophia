/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import {
  compactTopic,
  SupabaseTopicCompactionRepository,
} from "../_shared/memory/compaction/topic_compaction.ts";
import type { TopicCompactionTopic } from "../_shared/memory/compaction/types.ts";
import { SupabaseMemorizerRepository } from "../_shared/memory/memorizer/persist.ts";
import { runMemorizerWriteCanaryIfEnabled } from "../_shared/memory/memorizer/write_canary.ts";
import type {
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
} from "../_shared/memory/memorizer/types.ts";
import {
  buildWeeklyPossiblePatternRows,
  groupPossiblePatternCandidates,
  isoWeekKeyForTimezone,
  selectUsersDueForWeeklyReview,
  selectWeeklyReviewTopics,
} from "../_shared/memory/weekly_review.ts";

const DEFAULT_USER_LIMIT = 50;
const DEFAULT_MESSAGE_LIMIT = 80;

function envFlag(name: string, fallback = false): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
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

function weekWindowStart(now = new Date()): string {
  return new Date(now.getTime() - 8 * 86_400_000).toISOString();
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function loadUsers(admin: any, payload: Record<string, unknown>) {
  const userId = cleanText(payload.user_id);
  let query = admin
    .from("profiles")
    .select("id,timezone")
    .order("updated_at", { ascending: false })
    .limit(clampLimit(payload.user_limit, DEFAULT_USER_LIMIT, 500));
  if (userId) query = query.eq("id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureWeeklyRun(args: {
  admin: any;
  user_id: string;
  iso_year: number;
  iso_week: number;
  force: boolean;
}) {
  const { data: existing, error } = await args.admin
    .from("memory_weekly_review_runs")
    .select("*")
    .eq("user_id", args.user_id)
    .eq("iso_year", args.iso_year)
    .eq("iso_week", args.iso_week)
    .maybeSingle();
  if (error) throw error;
  if (
    existing &&
    existing.status === "completed" &&
    args.force !== true
  ) {
    return {
      run: existing,
      skip: true,
      reason: "weekly_review_already_completed",
    };
  }
  if (existing && existing.status === "running" && args.force !== true) {
    return {
      run: existing,
      skip: true,
      reason: "weekly_review_already_running",
    };
  }
  if (existing) {
    const { data, error: updateError } = await args.admin
      .from("memory_weekly_review_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error_message: null,
        attempt_count: Number(existing.attempt_count ?? 1) + 1,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return { run: data, skip: false, reason: null };
  }
  const { data, error: insertError } = await args.admin
    .from("memory_weekly_review_runs")
    .insert({
      user_id: args.user_id,
      iso_year: args.iso_year,
      iso_week: args.iso_week,
      status: "running",
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return { run: data, skip: false, reason: null };
}

async function loadUnprocessedMessages(args: {
  admin: any;
  user_id: string;
  since_iso: string;
  limit: number;
}): Promise<MemorizerMessage[]> {
  const { data: messages, error } = await args.admin
    .from("chat_messages")
    .select("id,user_id,role,content,created_at,metadata")
    .eq("user_id", args.user_id)
    .eq("role", "user")
    .gte("created_at", args.since_iso)
    .order("created_at", { ascending: true })
    .limit(args.limit);
  if (error) throw error;
  const rows = Array.isArray(messages) ? messages : [];
  if (rows.length === 0) return [];
  const ids = rows.map((row: any) => String(row.id));
  const { data: processed, error: processedError } = await args.admin
    .from("memory_message_processing")
    .select("message_id")
    .eq("user_id", args.user_id)
    .eq("processing_role", "primary")
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
    .select("id,slug,title,lifecycle_stage,search_doc,status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    slug: row.slug ?? null,
    title: String(row.title ?? ""),
    lifecycle_stage: row.lifecycle_stage ?? null,
    search_doc: row.search_doc ?? null,
    domain_keys: [],
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

async function processMemorizerPass(args: {
  admin: any;
  user_id: string;
  messages: MemorizerMessage[];
}) {
  if (args.messages.length === 0) {
    return { status: "skipped", processed_message_count: 0 };
  }
  const knownTopics = await loadKnownTopics(args.admin, args.user_id);
  const knownItems = await loadKnownMemoryItems(args.admin, args.user_id);
  const result = await runMemorizerWriteCanaryIfEnabled(
    new SupabaseMemorizerRepository(args.admin),
    {
      user_id: args.user_id,
      messages: args.messages,
      known_topics: knownTopics,
      existing_memory_items: knownItems,
      active_topic: knownTopics[0] ?? null,
      trigger_type: "weekly_review",
    },
  );
  return {
    status: result?.status ?? "disabled",
    processed_message_count: result?.status === "completed"
      ? args.messages.length
      : 0,
    persisted_count: result?.persisted.length ?? 0,
  };
}

async function compactPendingTopics(args: {
  admin: any;
  user_id: string;
  request_id: string;
  dry_run: boolean;
}) {
  const { data, error } = await args.admin
    .from("user_topic_memories")
    .select(
      "id,user_id,title,slug,synthesis,search_doc,summary_version,search_doc_version,pending_changes_count,sensitivity_max,metadata,status,lifecycle_stage",
    )
    .eq("user_id", args.user_id)
    .eq("status", "active")
    .gt("pending_changes_count", 0)
    .order("pending_changes_count", { ascending: false })
    .limit(50);
  if (error) throw error;
  const selected = selectWeeklyReviewTopics(
    (data ?? []) as TopicCompactionTopic[],
  );
  const repo = new SupabaseTopicCompactionRepository(args.admin);
  let completed = 0;
  for (const topic of selected) {
    const result = await compactTopic(repo, {
      topic_id: topic.id,
      request_id: args.request_id,
      dry_run: args.dry_run,
    });
    if (result.status === "completed") completed++;
  }
  return { selected_count: selected.length, completed_count: completed };
}

async function materializePossiblePatterns(args: {
  admin: any;
  user_id: string;
  iso_week_key: string;
  dry_run: boolean;
}) {
  const { data, error } = await args.admin
    .from("memory_item_actions")
    .select(
      "plan_item_id,observation_window_start,observation_window_end,aggregation_kind,memory_items!inner(id,content_text,domain_keys,created_at,status,kind)",
    )
    .eq("user_id", args.user_id)
    .neq("aggregation_kind", "possible_pattern")
    .eq("memory_items.status", "active")
    .eq("memory_items.kind", "action_observation")
    .limit(500);
  if (error) throw error;
  const observations = (data ?? []).flatMap((row: any) => {
    const item = Array.isArray(row.memory_items)
      ? row.memory_items[0]
      : row.memory_items;
    if (!item?.id || !row.plan_item_id) return [];
    return [{
      memory_item_id: String(item.id),
      plan_item_id: String(row.plan_item_id),
      content_text: item.content_text ?? null,
      observation_window_start: row.observation_window_start ?? null,
      observation_window_end: row.observation_window_end ?? null,
      aggregation_kind: row.aggregation_kind ?? null,
      created_at: item.created_at ?? null,
      domain_keys: item.domain_keys ?? [],
    }];
  });
  const rows = buildWeeklyPossiblePatternRows({
    candidates: groupPossiblePatternCandidates(observations),
    iso_week_key: args.iso_week_key,
  });
  let created = 0;
  for (const row of rows) {
    const { data: existing, error: existingError } = await args.admin
      .from("memory_items")
      .select("id")
      .eq("user_id", args.user_id)
      .eq("canonical_key", row.canonical_key)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id || args.dry_run) continue;
    const { data: item, error: itemError } = await args.admin
      .from("memory_items")
      .insert({
        user_id: args.user_id,
        kind: "action_observation",
        status: "candidate",
        content_text: row.content_text,
        normalized_summary: row.content_text,
        domain_keys: row.domain_keys.length > 0
          ? row.domain_keys
          : ["habitudes.execution"],
        confidence: 0.72,
        importance_score: 0.66,
        sensitivity_level: "normal",
        sensitivity_categories: [],
        event_start_at: row.observation_window_start,
        event_end_at: row.observation_window_end,
        time_precision: "week",
        canonical_key: row.canonical_key,
        metadata: {
          ...row.metadata,
          created_by: "trigger-weekly-memory-review",
        },
      })
      .select("id")
      .single();
    if (itemError) throw itemError;
    const { error: actionError } = await args.admin
      .from("memory_item_actions")
      .insert({
        user_id: args.user_id,
        memory_item_id: item.id,
        plan_item_id: row.plan_item_id,
        observation_window_start: row.observation_window_start,
        observation_window_end: row.observation_window_end,
        aggregation_kind: "possible_pattern",
        confidence: 0.72,
        metadata: { created_by: "trigger-weekly-memory-review" },
      });
    if (actionError) throw actionError;
    created++;
  }
  return { candidate_count: rows.length, created_count: created };
}

async function refreshTopics(args: { admin: any; user_id: string }) {
  const nowIso = new Date().toISOString();
  const { error: activeError } = await args.admin
    .from("user_topic_memories")
    .update({ last_enriched_at: nowIso })
    .eq("user_id", args.user_id)
    .eq("status", "active")
    .gt("pending_changes_count", 0);
  if (activeError) throw activeError;
  const { data, error } = await args.admin
    .from("user_topic_memories")
    .update({
      lifecycle_stage: "durable",
      archived_reason: null,
    })
    .eq("user_id", args.user_id)
    .eq("status", "active")
    .eq("lifecycle_stage", "dormant")
    .gt("pending_changes_count", 0)
    .select("id");
  if (error) throw error;
  return { reactivated_count: (data ?? []).length };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;
    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const force = payload.force === true;
    if (!envFlag("memory_v2_weekly_review_enabled", false) && !force) {
      return jsonResponse(req, {
        ok: true,
        skipped: true,
        reason: "memory_v2_weekly_review_disabled",
        request_id: requestId,
      });
    }
    const dryRun = payload.dry_run === true;
    const now = new Date(cleanText(payload.now_iso) || Date.now());
    const admin = adminClient();
    const users = selectUsersDueForWeeklyReview({
      users: await loadUsers(admin, payload),
      now,
      force,
    });
    const processed = [];
    for (const user of users) {
      const userId = String(user.id);
      const timezone = cleanText(user.timezone, "Europe/Paris");
      const iso = isoWeekKeyForTimezone(timezone, now);
      const runState = dryRun
        ? { run: null, skip: false, reason: null }
        : await ensureWeeklyRun({
          admin,
          user_id: userId,
          iso_year: iso.iso_year,
          iso_week: iso.iso_week,
          force,
        });
      if (runState.skip) {
        processed.push({
          user_id: userId,
          skipped: true,
          reason: runState.reason,
        });
        continue;
      }
      try {
        const messages = await loadUnprocessedMessages({
          admin,
          user_id: userId,
          since_iso: weekWindowStart(now),
          limit: clampLimit(payload.message_limit, DEFAULT_MESSAGE_LIMIT, 200),
        });
        const memorizer = await processMemorizerPass({
          admin,
          user_id: userId,
          messages,
        });
        const compaction = await compactPendingTopics({
          admin,
          user_id: userId,
          request_id: requestId,
          dry_run: dryRun,
        });
        const patterns = await materializePossiblePatterns({
          admin,
          user_id: userId,
          iso_week_key: iso.key,
          dry_run: dryRun,
        });
        const topics = await refreshTopics({ admin, user_id: userId });
        if (runState.run?.id && !dryRun) {
          const { error: updateError } = await admin
            .from("memory_weekly_review_runs")
            .update({
              status: "completed",
              finished_at: new Date().toISOString(),
              processed_message_count: memorizer.processed_message_count,
              compacted_topic_count: compaction.completed_count,
              possible_pattern_count: patterns.created_count,
              metadata: {
                request_id: requestId,
                timezone,
                iso_week_key: iso.key,
                memorizer,
                compaction,
                patterns,
                topics,
              },
            })
            .eq("id", runState.run.id);
          if (updateError) throw updateError;
        }
        await logMemoryObservabilityEvent({
          supabase: admin,
          userId,
          requestId,
          sourceComponent: "trigger-weekly-memory-review",
          eventName: "memory.weekly_review.completed",
          payload: {
            dry_run: dryRun,
            timezone,
            iso_week_key: iso.key,
            memorizer,
            compaction,
            patterns,
            topics,
          },
        });
        processed.push({
          user_id: userId,
          skipped: false,
          iso_week_key: iso.key,
          memorizer,
          compaction,
          patterns,
          topics,
        });
      } catch (error) {
        if (runState.run?.id && !dryRun) {
          await admin.from("memory_weekly_review_runs").update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: error instanceof Error
              ? error.message
              : String(error),
          }).eq("id", runState.run.id);
        }
        throw error;
      }
    }
    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      dry_run: dryRun,
      processed_count: processed.length,
      processed,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "trigger-weekly-memory-review",
      severity: "error",
      title: "weekly_memory_review_failed",
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

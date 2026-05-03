/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import {
  compactTopic,
  SupabaseTopicCompactionRepository,
} from "../_shared/memory/compaction/topic_compaction.ts";
import { selectTopicsForCompaction } from "../_shared/memory/compaction/trigger.ts";
import type { TopicCompactionTopic } from "../_shared/memory/compaction/types.ts";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function envFlag(name: string, fallback = false): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function clampLimit(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

function clampThreshold(raw: unknown): number {
  const n = Number(raw ?? 5);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
}

async function loadCandidateTopics(args: {
  admin: any;
  user_id?: string;
  force_topic_ids: string[];
  limit: number;
}): Promise<TopicCompactionTopic[]> {
  let query = args.admin
    .from("user_topic_memories")
    .select(
      "id,user_id,title,slug,synthesis,search_doc,summary_version,search_doc_version,pending_changes_count,sensitivity_max,metadata,status,lifecycle_stage",
    )
    .eq("status", "active")
    .order("pending_changes_count", { ascending: false })
    .limit(args.limit);
  if (args.user_id) query = query.eq("user_id", args.user_id);
  if (args.force_topic_ids.length > 0) {
    query = query.in("id", args.force_topic_ids);
  }
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data as TopicCompactionTopic[] : [];
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
    if (
      !envFlag("memory_v2_topic_compaction_enabled", false) &&
      payload.force !== true
    ) {
      return jsonResponse(req, {
        ok: true,
        skipped: true,
        reason: "memory_v2_topic_compaction_disabled",
        request_id: requestId,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const limit = clampLimit(payload.limit);
    const threshold = clampThreshold(payload.threshold);
    const dryRun = payload.dry_run === true;
    const triggerType = String(payload.trigger_type ?? "").trim() ||
      (payload.weekly_review === true ? "weekly_review" : "scheduled");
    const forceTopicIds = stringArray(
      payload.force_topic_ids ?? payload.topic_ids,
    );
    const userId = String(payload.user_id ?? "").trim();

    const candidates = await loadCandidateTopics({
      admin,
      user_id: userId || undefined,
      force_topic_ids: forceTopicIds,
      limit,
    });
    const selected = selectTopicsForCompaction(candidates, {
      threshold,
      force_topic_ids: forceTopicIds,
      trigger_type: triggerType,
    });
    const repo = new SupabaseTopicCompactionRepository(admin);
    const processed = [];
    for (const topic of selected) {
      const result = await compactTopic(repo, {
        topic_id: topic.id,
        request_id: requestId,
        dry_run: dryRun,
      });
      processed.push({
        topic_id: topic.id,
        reason: topic.compaction_reason,
        status: result.status,
        active_item_count: result.active_item_count,
        sensitivity_max: result.sensitivity_max,
        unsupported_claim_count: result.unsupported_claim_count,
        issue_codes: result.issues.map((issue) => issue.code),
      });
      await logMemoryObservabilityEvent({
        supabase: admin,
        userId: topic.user_id,
        requestId,
        sourceComponent: "trigger-topic-compaction",
        eventName: result.status === "completed"
          ? "memory.compaction.topic.completed"
          : "memory.compaction.topic.failed",
        payload: {
          trigger_type: triggerType,
          dry_run: dryRun,
          reason: topic.compaction_reason,
          topic_id: topic.id,
          status: result.status,
          active_item_count: result.active_item_count,
          sensitivity_max: result.sensitivity_max,
          unsupported_claim_count: result.unsupported_claim_count,
          issues: result.issues,
          load_threshold: threshold,
        },
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      dry_run: dryRun,
      selected_count: selected.length,
      processed,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "trigger-topic-compaction",
      severity: "error",
      title: "topic_compaction_failed",
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

/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildDeletedItemRedactionPatch,
  type RedactionMemoryItem,
  redactTopicSurface,
} from "../_shared/memory/correction/redaction.ts";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

async function topicIdsForItem(admin: any, itemId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("memory_item_topics")
    .select("topic_id")
    .eq("memory_item_id", itemId)
    .eq("status", "active");
  if (error) throw error;
  return Array.isArray(data) ? data.map((row) => String(row.topic_id)) : [];
}

async function purgePayloadStates(admin: any, userId: string, itemId: string) {
  const { data, error } = await admin
    .from("user_chat_states")
    .select("scope,temp_memory")
    .eq("user_id", userId);
  if (error) throw error;
  for (const row of data ?? []) {
    const temp = row.temp_memory && typeof row.temp_memory === "object"
      ? { ...row.temp_memory }
      : {};
    const state = temp.__memory_payload_state_v2;
    if (state && typeof state === "object" && Array.isArray(state.items)) {
      state.items = state.items.filter((i: any) =>
        String(i.memory_item_id) !== itemId
      );
      temp.__memory_payload_state_v2 = state;
      const { error: updateError } = await admin
        .from("user_chat_states")
        .update({ temp_memory: temp })
        .eq("user_id", userId)
        .eq("scope", row.scope);
      if (updateError) throw updateError;
    }
  }
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
      !envFlag("memory_v2_redaction_job_enabled", false) &&
      payload.force !== true
    ) {
      return jsonResponse(req, {
        ok: true,
        skipped: true,
        reason: "memory_v2_redaction_job_disabled",
        request_id: requestId,
      });
    }

    const limit = clampLimit(payload.limit);
    const userId = String(payload.user_id ?? "").trim();
    const itemId = String(payload.item_id ?? "").trim();
    const dryRun = payload.dry_run === true;
    const nowIso = new Date().toISOString();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let query = admin
      .from("memory_items")
      .select("id,user_id,status,content_text,normalized_summary,metadata")
      .in("status", ["hidden_by_user", "deleted_by_user"])
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);
    if (itemId) query = query.eq("id", itemId);

    const { data, error } = await query;
    if (error) throw error;
    const items = (data ?? []) as RedactionMemoryItem[];
    const processed: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const topicIds = await topicIdsForItem(admin, item.id);
      await purgePayloadStates(admin, item.user_id, item.id);

      if (!dryRun && item.status === "deleted_by_user") {
        const { error: itemError } = await admin
          .from("memory_items")
          .update(buildDeletedItemRedactionPatch(nowIso))
          .eq("id", item.id);
        if (itemError) throw itemError;
        const { error: sourceError } = await admin
          .from("memory_item_sources")
          .update({
            evidence_quote: null,
            evidence_summary: null,
            metadata: {},
          })
          .eq("memory_item_id", item.id);
        if (sourceError) throw sourceError;
      }

      for (const topicId of topicIds) {
        const { data: topic, error: topicError } = await admin
          .from("user_topic_memories")
          .select("id,search_doc,pending_changes_count,metadata")
          .eq("id", topicId)
          .single();
        if (topicError) throw topicError;
        const redacted = redactTopicSurface(topic, item, nowIso);
        if (!dryRun) {
          const { error: updateTopicError } = await admin
            .from("user_topic_memories")
            .update({
              search_doc: redacted.search_doc,
              search_doc_embedding: null,
              pending_changes_count: redacted.pending_changes_count,
              metadata: redacted.metadata,
            })
            .eq("id", topicId);
          if (updateTopicError) throw updateTopicError;
          const { error: logError } = await admin
            .from("memory_change_log")
            .insert({
              user_id: item.user_id,
              operation_type: "redaction_propagated",
              target_type: "topic",
              target_id: topicId,
              reason: "memory_item_redaction_propagated",
              metadata: {
                source: "memory-redaction-job",
                memory_item_id: item.id,
              },
            });
          if (logError) throw logError;
        }
      }
      processed.push({
        memory_item_id: item.id,
        status: item.status,
        topic_ids: topicIds,
        dry_run: dryRun,
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      processed_count: processed.length,
      processed,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "memory-redaction-job",
      severity: "error",
      title: "memory_redaction_job_failed",
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

/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { runGlobalMemoryMaintenance } from "../sophia-brain/global_memory.ts";

console.log("trigger-global-memory-compaction: Function initialized");

const BATCH_LIMIT = Number(
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_BATCH_LIMIT") ?? "40").trim(),
) || 40;

type CandidateRow = {
  id: string;
  user_id: string;
  full_key: string;
  needs_compaction: boolean;
  needs_embedding_refresh: boolean;
  pending_count: number;
  pending_chars: number;
};

type TriggerPayload = {
  id?: unknown;
  user_id?: unknown;
  full_key?: unknown;
};

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    let payload: TriggerPayload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const disabled =
      (Deno.env.get("SOPHIA_GLOBAL_MEMORY_COMPACTION_DISABLED") ?? "").trim() ===
        "1";
    if (disabled) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        message: "Global memory maintenance disabled via env",
        processed: 0,
      }, { includeCors: false });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const targetedId = String(payload?.id ?? "").trim();
    const targetedUserId = String(payload?.user_id ?? "").trim();
    const targetedFullKey = String(payload?.full_key ?? "").trim();

    let rows: CandidateRow[] = [];
    if (targetedId) {
      const { data, error } = await admin
        .from("user_global_memories")
        .select(
          "id,user_id,full_key,needs_compaction,needs_embedding_refresh,pending_count,pending_chars",
        )
        .eq("id", targetedId)
        .eq("status", "active")
        .limit(1);
      if (error) throw error;
      rows = (data ?? []) as CandidateRow[];
    } else if (targetedUserId && targetedFullKey) {
      const { data, error } = await admin
        .from("user_global_memories")
        .select(
          "id,user_id,full_key,needs_compaction,needs_embedding_refresh,pending_count,pending_chars",
        )
        .eq("user_id", targetedUserId)
        .eq("full_key", targetedFullKey)
        .eq("status", "active")
        .limit(1);
      if (error) throw error;
      rows = (data ?? []) as CandidateRow[];
    } else {
      let query = admin
        .from("user_global_memories")
        .select(
          "id,user_id,full_key,needs_compaction,needs_embedding_refresh,pending_count,pending_chars",
        )
        .eq("status", "active")
        .or("needs_compaction.eq.true,needs_embedding_refresh.eq.true")
        .order("needs_compaction", { ascending: false })
        .order("pending_count", { ascending: false })
        .order("pending_chars", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(BATCH_LIMIT);
      if (targetedUserId) query = query.eq("user_id", targetedUserId);
      const { data, error } = await query;
      if (error) throw error;
      rows = (data ?? []) as CandidateRow[];
    }

    if (rows.length === 0) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        processed: 0,
        targeted: Boolean(targetedId || targetedUserId || targetedFullKey),
      }, { includeCors: false });
    }

    let processed = 0;
    let compacted = 0;
    let embedded = 0;
    let skipped = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      try {
        const res = await runGlobalMemoryMaintenance({
          supabase: admin as any,
          memoryId: row.id,
          meta: { requestId },
        });
        processed++;
        if (res.compacted) compacted++;
        if (res.embedded) embedded++;
        if (!res.updated && !res.compacted && !res.embedded) skipped++;
        details.push({
          id: row.id,
          user_id: row.user_id,
          full_key: row.full_key,
          compacted: res.compacted,
          embedded: res.embedded,
          updated: res.updated,
          reason: res.reason,
        });
      } catch (error) {
        skipped++;
        details.push({
          id: row.id,
          user_id: row.user_id,
          full_key: row.full_key,
          updated: false,
          compacted: false,
          embedded: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      targeted: Boolean(targetedId || targetedUserId || targetedFullKey),
      processed,
      compacted,
      embedded,
      skipped,
      details,
    }, { includeCors: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[trigger-global-memory-compaction] request_id=${requestId}`, error);
    await logEdgeFunctionError({
      functionName: "trigger-global-memory-compaction",
      error,
      requestId,
      userId: null,
      source: "cron",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    });
    return jsonResponse(
      req,
      { error: message, request_id: requestId },
      { status: 500, includeCors: false },
    );
  }
});

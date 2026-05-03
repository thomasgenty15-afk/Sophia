/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateEmbedding } from "../_shared/gemini.ts";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 100;
const EMBEDDING_MODEL_TAG = (Deno.env.get("MEMORY_V2_EMBEDDING_MODEL_TAG") ??
  "gemini-embedding-001@768").trim() || "gemini-embedding-001@768";

type TopicRow = {
  id: string;
  user_id: string;
  title: string | null;
  synthesis: string | null;
  search_doc: string | null;
  search_doc_version: number | null;
  metadata: Record<string, unknown> | null;
};

type RequestPayload = {
  user_id?: unknown;
  limit?: unknown;
  dry_run?: unknown;
};

function clampLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function buildSearchDoc(row: TopicRow): string {
  const existing = String(row.search_doc ?? "").trim();
  if (existing) return existing.slice(0, 2000);
  return [row.title, row.synthesis]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);
}

function withEmbeddingMetadata(
  metadata: Record<string, unknown> | null,
  embeddedAt: string,
): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" ? metadata : {};
  const existingMemoryV2 = base.memory_v2 && typeof base.memory_v2 === "object"
    ? base.memory_v2 as Record<string, unknown>
    : {};
  return {
    ...base,
    memory_v2: {
      ...existingMemoryV2,
      search_doc_embedding_model: EMBEDDING_MODEL_TAG,
      search_doc_embedded_at: embeddedAt,
    },
  };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    let payload: RequestPayload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const limit = clampLimit(payload.limit);
    const dryRun = payload.dry_run === true;
    const userId = String(payload.user_id ?? "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let query = admin
      .from("user_topic_memories")
      .select(
        "id,user_id,title,synthesis,search_doc,search_doc_version,metadata",
      )
      .is("search_doc_embedding", null)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as TopicRow[];
    let updated = 0;
    let skipped = 0;
    const failures: Array<Record<string, unknown>> = [];
    const processed: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const searchDoc = buildSearchDoc(row);
      if (!searchDoc) {
        skipped++;
        processed.push({
          topic_id: row.id,
          skipped: true,
          reason: "empty_search_doc",
        });
        continue;
      }

      if (dryRun) {
        processed.push({
          topic_id: row.id,
          user_id: row.user_id,
          dry_run: true,
          search_doc_chars: searchDoc.length,
        });
        continue;
      }

      try {
        const embedding = await generateEmbedding(searchDoc, {
          userId: row.user_id,
          requestId,
          source: "memory_v2.topic_search_doc_backfill",
          operationName: "embedding.memory_v2_topic_search_doc",
          outputDimensionality: 768,
        });
        const embeddedAt = new Date().toISOString();
        const nextVersion = Math.max(
          1,
          Number(row.search_doc_version ?? 1) || 1,
        );

        const { error: updateErr } = await admin
          .from("user_topic_memories")
          .update({
            search_doc: searchDoc,
            search_doc_embedding: embedding,
            search_doc_version: nextVersion,
            metadata: withEmbeddingMetadata(row.metadata, embeddedAt),
          })
          .eq("id", row.id)
          .eq("user_id", row.user_id)
          .is("search_doc_embedding", null);
        if (updateErr) throw updateErr;

        updated++;
        processed.push({
          topic_id: row.id,
          user_id: row.user_id,
          updated: true,
          search_doc_version: nextVersion,
        });
      } catch (err) {
        failures.push({
          topic_id: row.id,
          user_id: row.user_id,
          error: String((err as Error)?.message ?? err),
        });
      }
    }

    return jsonResponse(req, {
      success: failures.length === 0,
      request_id: requestId,
      limit,
      dry_run: dryRun,
      embedding_model: EMBEDDING_MODEL_TAG,
      scanned: rows.length,
      updated,
      skipped,
      failures,
      processed,
    }, { includeCors: false });
  } catch (err) {
    await logEdgeFunctionError({
      functionName: "backfill-memory-v2-topic-embeddings",
      error: err,
      requestId,
    });
    return jsonResponse(req, {
      success: false,
      request_id: requestId,
      error: String((err as Error)?.message ?? err),
    }, { status: 500, includeCors: false });
  }
});

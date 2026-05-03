/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  type CandidatePromotionInput,
  decideCandidatePromotion,
} from "../_shared/memory/memorizer/promotion.ts";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type CandidateRow = {
  id: string;
  user_id: string;
  confidence: number | string | null;
  sensitivity_level: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function clampLimit(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

async function countRows(query: any): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
}

async function sourceCount(
  supabase: any,
  memoryItemId: string,
): Promise<number> {
  return await countRows(
    supabase
      .from("memory_item_sources")
      .select("id", { count: "exact", head: true })
      .eq("memory_item_id", memoryItemId),
  );
}

async function linkCount(supabase: any, memoryItemId: string): Promise<number> {
  const [topics, entities, actions] = await Promise.all([
    countRows(
      supabase
        .from("memory_item_topics")
        .select("id", { count: "exact", head: true })
        .eq("memory_item_id", memoryItemId)
        .eq("status", "active"),
    ),
    countRows(
      supabase
        .from("memory_item_entities")
        .select("id", { count: "exact", head: true })
        .eq("memory_item_id", memoryItemId),
    ),
    countRows(
      supabase
        .from("memory_item_actions")
        .select("id", { count: "exact", head: true })
        .eq("memory_item_id", memoryItemId),
    ),
  ]);
  return topics + entities + actions;
}

async function topicIsDurable(
  supabase: any,
  memoryItemId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("memory_item_topics")
    .select("user_topic_memories(lifecycle_stage)")
    .eq("memory_item_id", memoryItemId)
    .eq("status", "active")
    .limit(5);
  if (error) throw error;
  return Array.isArray(data) &&
    data.some((row: any) =>
      row.user_topic_memories?.lifecycle_stage === "durable"
    );
}

async function logChange(args: {
  supabase: any;
  user_id: string;
  memory_item_id: string;
  operation_type: "promote" | "archive_expired";
  reason: string;
  dry_run: boolean;
}) {
  if (args.dry_run) return;
  const { error } = await args.supabase.from("memory_change_log").insert({
    user_id: args.user_id,
    operation_type: args.operation_type,
    target_type: "memory_item",
    target_id: args.memory_item_id,
    reason: args.reason,
    metadata: { source: "promote-candidate-memory-items" },
  });
  if (error) throw error;
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
    const limit = clampLimit(payload.limit);
    const userId = String(payload.user_id ?? "").trim();
    const dryRun = payload.dry_run === true;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let query = admin
      .from("memory_items")
      .select("id,user_id,confidence,sensitivity_level,created_at,metadata")
      .eq("status", "candidate")
      .lte(
        "created_at",
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      )
      .order("created_at", { ascending: true })
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as CandidateRow[];
    const processed: Array<Record<string, unknown>> = [];
    let promoted = 0;
    let archived = 0;
    let kept = 0;

    for (const row of rows) {
      const input: CandidatePromotionInput = {
        id: row.id,
        user_id: row.user_id,
        confidence: Number(row.confidence ?? 0),
        sensitivity_level: row.sensitivity_level,
        created_at: row.created_at,
        source_count: await sourceCount(admin, row.id),
        link_count: await linkCount(admin, row.id),
        topic_is_durable: await topicIsDurable(admin, row.id),
        explicit_confirmation: row.metadata?.explicit_confirmation === true,
        action_confirmed: row.metadata?.action_confirmed === true,
      };
      const decision = decideCandidatePromotion(input);
      if (decision.action === "promote") {
        promoted++;
        if (!dryRun) {
          const { error: updateError } = await admin
            .from("memory_items")
            .update({
              status: "active",
              metadata: {
                ...(row.metadata ?? {}),
                promoted_at: new Date().toISOString(),
                promoted_reason: decision.reason,
              },
            })
            .eq("id", row.id)
            .eq("status", "candidate");
          if (updateError) throw updateError;
        }
        await logChange({
          supabase: admin,
          user_id: row.user_id,
          memory_item_id: row.id,
          operation_type: "promote",
          reason: decision.reason,
          dry_run: dryRun,
        });
      } else if (decision.action === "archive") {
        archived++;
        if (!dryRun) {
          const { error: updateError } = await admin
            .from("memory_items")
            .update({
              status: "archived",
              metadata: {
                ...(row.metadata ?? {}),
                archived_reason: decision.reason,
                archived_at: new Date().toISOString(),
              },
            })
            .eq("id", row.id)
            .eq("status", "candidate");
          if (updateError) throw updateError;
        }
        await logChange({
          supabase: admin,
          user_id: row.user_id,
          memory_item_id: row.id,
          operation_type: "archive_expired",
          reason: decision.reason,
          dry_run: dryRun,
        });
      } else {
        kept++;
      }
      processed.push({
        memory_item_id: row.id,
        decision,
        source_count: input.source_count,
        link_count: input.link_count,
        topic_is_durable: input.topic_is_durable,
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      dry_run: dryRun,
      scanned: rows.length,
      promoted,
      archived,
      kept,
      processed,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "promote-candidate-memory-items",
      severity: "error",
      title: "candidate_promotion_failed",
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

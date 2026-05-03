/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import {
  clampDashboardLimit,
  parseMemoryDashboardRoute,
} from "../_shared/memory/dashboard_routes.ts";
import {
  deleteMemoryItem,
  hideMemoryItem,
  SupabaseCorrectionRepository,
} from "../_shared/memory/correction/operations.ts";

function authHeader(req: Request): string {
  return req.headers.get("Authorization") ?? "";
}

function env(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

async function currentUser(req: Request): Promise<{ id: string }> {
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader(req) } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("memory_dashboard_unauthorized");
  return { id: data.user.id };
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertOwnMemoryItem(admin: any, userId: string, itemId: string) {
  const { data, error } = await admin
    .from("memory_items")
    .select("id,user_id,status")
    .eq("id", itemId)
    .single();
  if (error || !data) throw new Error("memory_item_not_found");
  if (String(data.user_id) !== userId) throw new Error("memory_item_forbidden");
  return data;
}

async function invokeRedactionJob(args: {
  user_id: string;
  item_id: string;
  request_id: string;
}) {
  const secret = env("INTERNAL_FUNCTION_SECRET");
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!secret || !supabaseUrl) {
    return { requested: false, reason: "missing_internal_redaction_config" };
  }
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/memory-redaction-job`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": secret,
          "X-Request-Id": args.request_id,
        },
        body: JSON.stringify({
          force: true,
          user_id: args.user_id,
          item_id: args.item_id,
          limit: 1,
        }),
      },
    );
    return {
      requested: true,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      requested: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  try {
    const route = parseMemoryDashboardRoute(
      req.method,
      new URL(req.url).pathname,
    );
    if (route.kind === "not_found") {
      return jsonResponse(req, {
        ok: false,
        request_id: requestId,
        error: "not_found",
      }, { status: 404 });
    }
    const user = await currentUser(req);
    const admin = adminClient();

    if (route.kind === "list_items") {
      const url = new URL(req.url);
      const limit = clampDashboardLimit(url.searchParams.get("limit"));
      const kind = String(url.searchParams.get("kind") ?? "").trim();
      let query = admin
        .from("memory_items")
        .select(
          "id,kind,content_text,normalized_summary,domain_keys,confidence,importance_score,sensitivity_level,sensitivity_categories,observed_at,event_start_at,event_end_at,time_precision,metadata,created_at,updated_at",
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("observed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (kind) query = query.eq("kind", kind);
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(req, {
        ok: true,
        request_id: requestId,
        items: data ?? [],
      });
    }

    if (route.kind === "list_entities") {
      const url = new URL(req.url);
      const limit = clampDashboardLimit(url.searchParams.get("limit"));
      const { data, error } = await admin
        .from("user_entities")
        .select(
          "id,entity_type,display_name,aliases,relation_to_user,status,confidence,metadata,created_at,updated_at",
        )
        .eq("user_id", user.id)
        .in("status", ["active", "candidate"])
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return jsonResponse(req, {
        ok: true,
        request_id: requestId,
        entities: data ?? [],
      });
    }

    await assertOwnMemoryItem(admin, user.id, route.item_id);
    const repo = new SupabaseCorrectionRepository(admin);
    const input = {
      user_id: user.id,
      item_id: route.item_id,
      reason: route.kind === "hide_item"
        ? "user_dashboard_hide"
        : "user_dashboard_delete",
      now_iso: new Date().toISOString(),
    };
    const result = route.kind === "hide_item"
      ? await hideMemoryItem(repo, input)
      : await deleteMemoryItem(repo, input);
    const redaction_job = await invokeRedactionJob({
      user_id: user.id,
      item_id: route.item_id,
      request_id: requestId,
    });
    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      result,
      redaction_job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "memory_dashboard_unauthorized") {
      return jsonResponse(req, {
        ok: false,
        request_id: requestId,
        error: "unauthorized",
      }, { status: 401 });
    }
    if (message === "memory_item_not_found") {
      return jsonResponse(req, {
        ok: false,
        request_id: requestId,
        error: "memory_item_not_found",
      }, { status: 404 });
    }
    if (message === "memory_item_forbidden") {
      return jsonResponse(req, {
        ok: false,
        request_id: requestId,
        error: "forbidden",
      }, { status: 403 });
    }
    await logEdgeFunctionError({
      functionName: "memory-me",
      severity: "error",
      title: "memory_dashboard_failed",
      error,
      requestId,
      source: "edge",
    });
    return jsonResponse(req, {
      ok: false,
      request_id: requestId,
      error: message,
    }, { status: 500 });
  }
});

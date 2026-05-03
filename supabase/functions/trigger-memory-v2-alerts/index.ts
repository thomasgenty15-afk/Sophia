/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import {
  buildMemoryV2OpsScorecard,
  type MemoryV2ObservabilityEvent,
} from "../_shared/memory/observability.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";

const DEFAULT_HOURS = 24;
const DEFAULT_LIMIT = 5000;

function envFlag(name: string, fallback = false): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number) {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function postWebhook(payload: unknown) {
  const url = String(Deno.env.get("MEMORY_V2_ALERT_WEBHOOK_URL") ?? "").trim();
  if (!url) return { routed: false, reason: "missing_webhook_url" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { routed: true, ok: response.ok, status: response.status };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    if (!envFlag("memory_v2_alerts_enabled", false) && payload.force !== true) {
      return jsonResponse(req, {
        ok: true,
        skipped: true,
        reason: "memory_v2_alerts_disabled",
        request_id: requestId,
      });
    }

    const admin = adminClient();
    const userId = String(payload.user_id ?? "").trim();
    const hours = clampNumber(payload.hours, DEFAULT_HOURS, 1, 168);
    const limit = clampNumber(payload.limit, DEFAULT_LIMIT, 1, 10000);
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

    let query = admin
      .from("memory_observability_events")
      .select("id,created_at,user_id,source_component,event_name,payload")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw error;
    const events = (data ?? []) as MemoryV2ObservabilityEvent[];
    const scorecard = buildMemoryV2OpsScorecard(events);
    const alerts = scorecard.alerts;
    const webhook = alerts.length > 0
      ? await postWebhook({
        source: "trigger-memory-v2-alerts",
        request_id: requestId,
        user_id: userId || null,
        window: { from: from.toISOString(), to: to.toISOString(), hours },
        alerts,
        scorecard,
      })
      : { routed: false, reason: "no_alerts" };

    if (alerts.length > 0 && userId) {
      await logMemoryObservabilityEvent({
        supabase: admin,
        userId,
        requestId,
        sourceComponent: "trigger-memory-v2-alerts",
        eventName: "memory.alerts.critical",
        payload: {
          alerts,
          scorecard,
          webhook,
          window: { from: from.toISOString(), to: to.toISOString(), hours },
        },
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      alert_count: alerts.length,
      alerts,
      webhook,
      scorecard,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "trigger-memory-v2-alerts",
      severity: "error",
      title: "memory_v2_alerts_failed",
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

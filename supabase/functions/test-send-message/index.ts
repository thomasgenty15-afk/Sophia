/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { filterFreshMessages } from "../_shared/message_freshness.ts";
import { processMessage } from "../sophia-brain/router.ts";

type TestSendMessageBody = {
  user_id?: string;
  userId?: string;
  channel?: "web" | "whatsapp";
  scope?: string;
  content?: string;
  message?: string;
  history?: Array<{ role?: string; content?: string; created_at?: string }>;
  forceMode?: string;
  disable_debounce?: boolean;
  debounce_wait_ms?: number;
  force_full_ai?: boolean;
  client_now_iso?: string;
  clientNowIso?: string;
  client_timezone?: string;
  clientTimezone?: string;
  enable_adjust_plan_coach_guidance?: boolean;
};

function env(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

function metadataHasTestMarker(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const record = meta as Record<string, unknown>;
  return record.is_test_persona === true;
}

function sanitizeHistory(
  raw: unknown,
): Array<
  { role: "user" | "assistant"; content: string; created_at: string | null }
> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === "object")
    .map((row) => row as Record<string, unknown>)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: String(row.content ?? "").slice(0, 1200),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    }))
    .slice(-20);
}

async function loadRecentDbHistory(args: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  scope: string;
}): Promise<
  Array<
    { role: "user" | "assistant"; content: string; created_at: string | null }
  >
> {
  const { data, error } = await args.supabase
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", args.userId)
    .eq("scope", args.scope)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.warn("[test-send-message] DB history load failed:", error);
    return [];
  }
  return sanitizeHistory((data ?? []).slice().reverse());
}

async function readBody(req: Request): Promise<TestSendMessageBody> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as TestSendMessageBody;
}

async function latestConversationTurnTrace(args: {
  userId: string;
  sinceIso: string;
}): Promise<{ trace: unknown | null; error: string | null }> {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return { trace: null, error: "missing_service_role_env" };
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("conversation_turn_traces")
    .select("*")
    .eq("user_id", args.userId)
    .gte("ts", args.sinceIso)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { trace: null, error: String(error.message ?? error) };
  }
  return { trace: data ?? null, error: null };
}

function serializeError(error: unknown): {
  name: string | null;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    return {
      name: error.name || null,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return {
    name: null,
    message: String(error),
    stack: null,
  };
}

function classifyQaFailure(error: unknown): {
  category: "provider_network" | "provider_timeout" | "router_or_app";
  reason:
    | "dns_resolution_failed"
    | "provider_connect_failed"
    | "provider_timeout_or_abort"
    | "unknown";
  provider: "openai" | "gemini" | "unknown";
  suggested_status: number;
  retryable: boolean;
} {
  const serialized = serializeError(error);
  const haystack = `${serialized.name ?? ""}\n${serialized.message}\n${
    serialized.stack ?? ""
  }`.toLowerCase();
  const provider = haystack.includes("api.openai.com")
    ? "openai" as const
    : haystack.includes("generativelanguage.googleapis.com") ||
        haystack.includes("gemini")
    ? "gemini" as const
    : "unknown" as const;

  if (
    haystack.includes("dns error") ||
    haystack.includes("failed to lookup address") ||
    haystack.includes("name resolution failed") ||
    haystack.includes("name or service not known")
  ) {
    return {
      category: "provider_network",
      reason: "dns_resolution_failed",
      provider,
      suggested_status: 503,
      retryable: true,
    };
  }
  if (
    haystack.includes("client error (connect)") ||
    haystack.includes("connection refused") ||
    haystack.includes("connection reset") ||
    haystack.includes("network error")
  ) {
    return {
      category: "provider_network",
      reason: "provider_connect_failed",
      provider,
      suggested_status: 503,
      retryable: true,
    };
  }
  if (
    haystack.includes("aborterror") ||
    haystack.includes("timed out") ||
    haystack.includes("timeout") ||
    haystack.includes("early termination") ||
    haystack.includes("wall clock duration")
  ) {
    return {
      category: "provider_timeout",
      reason: "provider_timeout_or_abort",
      provider,
      suggested_status: 504,
      retryable: true,
    };
  }
  return {
    category: "router_or_app",
    reason: "unknown",
    provider,
    suggested_status: 500,
    retryable: false,
  };
}

Deno.serve({
  hostname: Deno.env.get("SOPHIA_TEST_SEND_MESSAGE_HOST") || undefined,
  port: Number(Deno.env.get("PORT") ?? "8000"),
}, async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, { status: 405 });
  }
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const requestId = getRequestId(req);
  const startedAt = new Date().toISOString();

  try {
    const authHeader = String(req.headers.get("authorization") ?? "").trim();
    const userAuthHeader = String(
      req.headers.get("x-user-authorization") ?? authHeader,
    ).trim();
    if (!authHeader || !userAuthHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "missing_authorization" } },
      );
    }

    const supabase = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: userAuthHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;
    if (authError || !user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "invalid_or_expired_jwt" } },
      );
    }

    const appMeta = user.app_metadata as Record<string, unknown>;
    const userMeta = user.user_metadata as Record<string, unknown>;
    if (!metadataHasTestMarker(appMeta) && !metadataHasTestMarker(userMeta)) {
      return jsonResponse(
        req,
        {
          error: "Forbidden: user is not marked is_test_persona",
          request_id: requestId,
        },
        {
          status: 403,
          errorLogMeta: { auth_stage: "missing_test_persona_marker" },
        },
      );
    }

    const body = await readBody(req);
    const requestedUserId = String(body.user_id ?? body.userId ?? user.id)
      .trim();
    if (requestedUserId !== user.id) {
      return jsonResponse(
        req,
        {
          error: "Forbidden: user_id must match JWT subject",
          request_id: requestId,
        },
        { status: 403, errorLogMeta: { auth_stage: "user_id_mismatch" } },
      );
    }

    const content = String(body.content ?? body.message ?? "").trim();
    if (!content) {
      return jsonResponse(
        req,
        { error: "Missing content", request_id: requestId },
        { status: 400 },
      );
    }

    const channel = body.channel === "whatsapp" ? "whatsapp" : "web";
    const scope = String(
      body.scope ?? (channel === "whatsapp" ? "whatsapp" : "web"),
    ).trim();
    const forceMode = String(body.forceMode ?? "").trim();
    const forceFullAi = body.force_full_ai === true;
    const disableDebounce = body.disable_debounce !== false;
    const debounceWaitMs = typeof body.debounce_wait_ms === "number" &&
        Number.isFinite(body.debounce_wait_ms)
      ? Math.max(0, Math.min(10_000, Math.trunc(body.debounce_wait_ms)))
      : undefined;
    // Ancre la fenêtre de fraîcheur sur l'horloge simulée des QA runs quand
    // elle est fournie, sinon sur l'horloge serveur.
    const freshnessNowMs = Date.parse(
      String(body.client_now_iso ?? body.clientNowIso ?? ""),
    );
    const history = filterFreshMessages(
      Array.isArray(body.history)
        ? sanitizeHistory(body.history)
        : await loadRecentDbHistory({ supabase, userId: user.id, scope }),
      { nowMs: Number.isFinite(freshnessNowMs) ? freshnessNowMs : undefined },
    );
    const response = await processMessage(
      supabase,
      user.id,
      content,
      history,
      {
        requestId,
        channel,
        scope,
        forceBrainTrace: true,
        forceRealAi: forceFullAi,
        clientNowIso: typeof body.client_now_iso === "string"
          ? body.client_now_iso
          : typeof body.clientNowIso === "string"
          ? body.clientNowIso
          : null,
        clientTimezone: typeof body.client_timezone === "string"
          ? body.client_timezone
          : typeof body.clientTimezone === "string"
          ? body.clientTimezone
          : null,
        enableAdjustPlanCoachGuidance:
          body.enable_adjust_plan_coach_guidance === true,
      },
      {
        forceMode: forceMode === "dispatcher" ||
            forceMode === "sentry" ||
            forceMode === "companion"
          ? forceMode
          : undefined,
        messageMetadata: {
          test_endpoint: "test-send-message",
          test_persona: true,
          force_full_ai: forceFullAi,
          request_id: requestId,
        },
        disableDebounce,
        debounceWaitMs,
      },
    );

    const traceResult = await latestConversationTurnTrace({
      userId: user.id,
      sinceIso: startedAt,
    });

    const responseRecord = response as Record<string, unknown>;
    const aborted = Boolean(responseRecord.aborted);
    const contentText = String(responseRecord.content ?? "").trim();
    const inlineTrace = responseRecord.conversation_turn_trace ?? null;
    return jsonResponse(req, {
      ok: !aborted && contentText.length > 0,
      request_id: requestId,
      user_id: user.id,
      channel,
      scope,
      empty_response: contentText.length === 0,
      aborted,
      abort_reason: responseRecord.abort_reason ?? null,
      logged_message_id: responseRecord.logged_message_id ?? null,
      latest_message_id: responseRecord.latest_message_id ?? null,
      response,
      conversation_turn_trace: inlineTrace ?? traceResult.trace,
      trace_error: inlineTrace ? null : traceResult.error,
    }, {
      status: aborted || contentText.length === 0 ? 409 : 200,
    });
  } catch (error) {
    const serializedError = serializeError(error);
    const diagnostic = classifyQaFailure(error);
    console.warn(
      "[test-send-message] failed",
      JSON.stringify({
        request_id: requestId,
        qa_failure_category: diagnostic.category,
        qa_failure_reason: diagnostic.reason,
        provider: diagnostic.provider,
        retryable: diagnostic.retryable,
        error_name: serializedError.name,
        error_message: serializedError.message,
      }),
    );
    return jsonResponse(
      req,
      {
        error: serializedError.message,
        request_id: requestId,
        qa_diagnostic: {
          source: "test-send-message",
          category: diagnostic.category,
          reason: diagnostic.reason,
          provider: diagnostic.provider,
          retryable: diagnostic.retryable,
          note: diagnostic.retryable
            ? "Provider/network/DNS failure while running QA endpoint; this is not enough by itself to classify as a router bug."
            : "Unhandled application/router failure while running QA endpoint.",
        },
      },
      {
        status: diagnostic.suggested_status,
        errorLogMeta: {
          qa_failure_category: diagnostic.category,
          qa_failure_reason: diagnostic.reason,
          provider: diagnostic.provider,
          retryable: diagnostic.retryable,
        },
      },
    );
  }
});

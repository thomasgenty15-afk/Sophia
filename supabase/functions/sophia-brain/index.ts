import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit, RATE_PRESETS } from "../_shared/rate-limit.ts";
import { filterFreshMessages } from "../_shared/message_freshness.ts";
import { processMessage } from "./router.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (req) => {
  // ── DEBUG ENTRY (trace every incoming request) ───────────────────────────────
  const debugEntryRid = req.headers.get("x-request-id") ?? "no-header-rid";
  console.log(JSON.stringify({
    tag: "sophia_brain_entry",
    method: req.method,
    url: req.url,
    origin: req.headers.get("origin") ?? null,
    has_auth: Boolean(req.headers.get("authorization")),
    has_apikey: Boolean(req.headers.get("apikey")),
    content_type: req.headers.get("content-type") ?? null,
    x_request_id: debugEntryRid,
  }));

  // Gestion du CORS
  if (req.method === "OPTIONS") {
    console.log(
      JSON.stringify({
        tag: "sophia_brain_options",
        x_request_id: debugEntryRid,
      }),
    );
    return handleCorsOptions(req);
  }
  const corsBlock = enforceCors(req);
  if (corsBlock) {
    console.log(
      JSON.stringify({
        tag: "sophia_brain_cors_block",
        x_request_id: debugEntryRid,
        status: corsBlock.status,
      }),
    );
    return corsBlock;
  }

  const requestId = getRequestId(req);
  let authedUserId: string | null = null;

  try {
    // Read raw body text first to parse consistently. Do not log body content:
    // user messages may contain sensitive personal context.
    const rawBodyText = await req.text();
    console.log(JSON.stringify({
      tag: "sophia_brain_body_raw",
      request_id: requestId,
      byte_length: rawBodyText.length,
    }));
    let body: any;
    try {
      body = rawBodyText.length > 0 ? JSON.parse(rawBodyText) : {};
    } catch (parseErr) {
      console.error(JSON.stringify({
        tag: "sophia_brain_body_parse_error",
        request_id: requestId,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        byte_length: rawBodyText.length,
      }));
      throw parseErr;
    }
    console.log(JSON.stringify({
      tag: "sophia_brain_body_parsed",
      request_id: requestId,
      keys: body && typeof body === "object" ? Object.keys(body) : [],
      has_message: Boolean(body?.message ?? body?.content),
      history_length: Array.isArray(body?.history) ? body.history.length : null,
      scope: body?.scope ?? null,
      channel: body?.channel ?? null,
    }));
    // SEC-12: cap the inbound message length. A single chat turn well under this
    // limit; the bound prevents an oversized payload from inflating LLM token cost.
    const message = (body?.message ?? body?.content ?? "").toString().slice(0, 8000);
    const clientHistory = Array.isArray(body?.history) ? body.history : [];
    let forceMode = (body?.forceMode ?? body?.force_mode) as string | undefined;
    const contextOverride =
      (body?.contextOverride ?? body?.context_override ?? body?.context) as
        | string
        | undefined;
    const logMessages = body?.logMessages ?? body?.log_messages;
    const messageMetadata =
      (body?.messageMetadata ?? body?.message_metadata ?? body?.metadata) as
        | Record<string, unknown>
        | undefined;
    const clientNowIso =
      typeof body?.clientNowIso === "string"
        ? body.clientNowIso
        : typeof body?.client_now_iso === "string"
        ? body.client_now_iso
        : typeof messageMetadata?.clientNowIso === "string"
        ? messageMetadata.clientNowIso
        : typeof messageMetadata?.client_now_iso === "string"
        ? messageMetadata.client_now_iso
        : null;
    const clientTimezone =
      typeof body?.clientTimezone === "string"
        ? body.clientTimezone
        : typeof body?.client_timezone === "string"
        ? body.client_timezone
        : typeof messageMetadata?.clientTimezone === "string"
        ? messageMetadata.clientTimezone
        : typeof messageMetadata?.client_timezone === "string"
        ? messageMetadata.client_timezone
        : null;
    const channel = (body?.channel as ("web" | "whatsapp") | undefined) ??
      "web";
    const scope =
      (body?.scope ?? body?.conversationScope ?? body?.conversation_scope ??
        body?.chat_scope) as string | undefined;
    const forceOnboardingFlow = Boolean(
      body?.forceOnboardingFlow ??
        body?.force_onboarding_flow ??
        body?.debug_force_onboarding_flow ??
        body?.debug?.force_onboarding_flow,
    );
    // Auth Check
    const authHeader = (req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      console.log(
        JSON.stringify({
          tag: "sophia_brain_auth_missing",
          request_id: requestId,
        }),
      );
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "missing_authorization" } },
      );
    }
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser();
    if (authError || !user) {
      console.log(JSON.stringify({
        tag: "sophia_brain_auth_failed",
        request_id: requestId,
        auth_error: authError ? (authError.message ?? String(authError)) : null,
        has_user: Boolean(user),
      }));
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401, errorLogMeta: { auth_stage: "invalid_or_expired_jwt" } },
      );
    }
    authedUserId = user.id;
    console.log(JSON.stringify({
      tag: "sophia_brain_auth_ok",
      request_id: requestId,
      user_id: user.id,
    }));

    const rateLimited = await enforceRateLimit(req, requestId, {
      key: `sophia-brain:${user.id}`,
      windows: RATE_PRESETS.llmChat,
    });
    if (rateLimited) return rateLimited;

    function sanitizeHistory(raw: any[]): any[] {
      const rows = Array.isArray(raw) ? raw : [];
      return rows
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({
          role: m.role,
          content: String(m.content ?? "").slice(0, 1200),
          created_at: (m as any)?.created_at ?? null,
          agent_used: (m as any)?.agent_used ?? null,
        }))
        .slice(-20);
    }

    let history: any[] = [];
    try {
      const scopeResolved =
        (scope ?? (channel === "whatsapp" ? "whatsapp" : "web")).toString();
      const t0 = Date.now();
      const { data: rows } = await supabaseClient
        .from("chat_messages")
        .select("role, content, created_at, agent_used")
        .eq("user_id", user.id)
        .eq("scope", scopeResolved)
        .order("created_at", { ascending: false })
        .limit(20);
      const durationMs = Date.now() - t0;
      console.log(JSON.stringify({
        tag: "db_history_load",
        request_id: requestId,
        user_id: user.id,
        scope: scopeResolved,
        rows: Array.isArray(rows) ? rows.length : null,
        duration_ms: durationMs,
      }));
      history = (rows ?? []).slice().reverse().map((r: any) => ({
        role: r.role,
        content: r.content,
        created_at: r.created_at,
        agent_used: r.agent_used,
      }));
    } catch {
      history = sanitizeHistory(clientHistory);
    }

    const historyLengthBeforeFreshness = history.length;
    // Ancre la fenêtre de fraîcheur sur l'horloge client quand elle est
    // fournie (QA runs à horloge simulée), sinon sur l'horloge serveur.
    const freshnessNowMs = Date.parse(String(clientNowIso ?? ""));
    history = filterFreshMessages(history, {
      nowMs: Number.isFinite(freshnessNowMs) ? freshnessNowMs : undefined,
    });

    console.log(JSON.stringify({
      tag: "sophia_brain_before_process",
      request_id: requestId,
      user_id: user.id,
      message_length: message.length,
      history_length: history.length,
      history_stale_dropped: historyLengthBeforeFreshness - history.length,
      scope: scope ?? null,
      channel,
      force_mode: forceMode ?? null,
    }));

    // LE CŒUR DU RÉACTEUR
    const response = await processMessage(
      supabaseClient,
      user.id,
      message,
      history,
      { requestId, channel, scope, clientNowIso, clientTimezone },
      {
        logMessages: typeof logMessages === "boolean" ? logMessages : undefined,
        forceMode: (forceMode === "dispatcher" || forceMode === "sentry" ||
            forceMode === "companion")
          ? forceMode
          : undefined,
        contextOverride: contextOverride
          ? contextOverride.toString()
          : undefined,
        messageMetadata: messageMetadata ?? undefined,
        forceOnboardingFlow,
      },
    );

    return jsonResponse(req, response);
  } catch (error) {
    console.error("Error processing message:", error);
    // Best-effort: persist a crash record so Admin Production log can show it.
    // Avoid storing full message/history (PII); keep only small context.
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      error,
      requestId,
      userId: authedUserId,
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    });
    // SEC-12: never leak raw exception text (which can expose table/column/policy
    // names or Postgres error codes) to the client. Return a generic message; the
    // full error is captured above via logEdgeFunctionError, correlatable by request_id.
    return jsonResponse(
      req,
      {
        error: "Internal Server Error",
        request_id: requestId,
      },
      { status: 500, skipErrorLog: true },
    );
  }
});

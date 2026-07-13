import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";

const REQUEST_SCHEMA = z.object({
  session_id: z.string().uuid(),
});

class ArchivePotionError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArchivePotionError";
    this.status = status;
  }
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
    .trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new ArchivePotionError(
      500,
      "Supabase environment variables are not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

async function archivePotionSession(args: {
  admin: SupabaseClient;
  userId: string;
  sessionId: string;
}): Promise<{ archived: boolean; cancelledCheckins: number }> {
  const nowIso = new Date().toISOString();

  // Ownership check + soft delete the session (keep it as 'archived' so the
  // history stays available to prior-potion context of future activations).
  const { data: session, error: sessionError } = await args.admin
    .from("user_potion_sessions")
    .select("id, status, follow_up_strategy")
    .eq("id", args.sessionId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (sessionError) {
    throw new ArchivePotionError(
      500,
      `Session fetch failed: ${sessionError.message}`,
      { cause: sessionError },
    );
  }
  if (!session) {
    throw new ArchivePotionError(404, "Potion session not found");
  }

  const { error: archiveError } = await args.admin
    .from("user_potion_sessions")
    .update({ status: "archived", last_updated_at: nowIso })
    .eq("id", args.sessionId)
    .eq("user_id", args.userId);
  if (archiveError) {
    throw new ArchivePotionError(
      500,
      `Session archive failed: ${archiveError.message}`,
      { cause: archiveError },
    );
  }

  // Resolve the recurring reminder linked to this session (via strategy or FK).
  const strategy = (session as Record<string, unknown>).follow_up_strategy;
  let reminderId = String(
    (strategy as Record<string, unknown> | null)?.linked_recurring_reminder_id ??
      "",
  ).trim();
  if (!reminderId) {
    const { data: reminder } = await args.admin
      .from("user_recurring_reminders")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_potion_session_id", args.sessionId)
      .maybeSingle();
    reminderId = String(
      (reminder as Record<string, unknown> | null)?.id ?? "",
    ).trim();
  }

  let cancelledCheckins = 0;
  if (reminderId) {
    // Stop the recurring reminder so no further follow-ups are drafted.
    const { error: reminderError } = await args.admin
      .from("user_recurring_reminders")
      .update({
        status: "inactive",
        ended_reason: "user",
        deactivated_at: nowIso,
        ends_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", reminderId)
      .eq("user_id", args.userId);
    if (reminderError) {
      throw new ArchivePotionError(
        500,
        `Reminder deactivation failed: ${reminderError.message}`,
        { cause: reminderError },
      );
    }

    // Cancel any not-yet-sent check-ins from the follow-up series.
    const { data: cancelled, error: checkinError } = await args.admin
      .from("scheduled_checkins")
      .update({ status: "cancelled", processed_at: nowIso })
      .eq("user_id", args.userId)
      .eq("recurring_reminder_id", reminderId)
      .in("status", ["pending", "retrying", "awaiting_user"])
      .select("id");
    if (checkinError) {
      throw new ArchivePotionError(
        500,
        `Check-in cancellation failed: ${checkinError.message}`,
        { cause: checkinError },
      );
    }
    cancelledCheckins = Array.isArray(cancelled) ? cancelled.length : 0;
  }

  return { archived: true, cancelledCheckins };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method Not Allowed", request_id: requestId },
        { status: 405 },
      );
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth
      .getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await archivePotionSession({
      admin,
      userId: authData.user.id,
      sessionId: parsed.data.session_id,
    });

    return jsonResponse(req, {
      request_id: requestId,
      archived: result.archived,
      cancelled_checkins: result.cancelledCheckins,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "archive-potion-session-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "archive-potion-session-v1" },
    });

    if (error instanceof ArchivePotionError) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to archive potion session");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

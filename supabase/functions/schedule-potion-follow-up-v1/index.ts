import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import {
  PotionFollowUpSchedulingError,
  schedulePotionFollowUpForSession,
} from "../_shared/potion-follow-up.ts";
import { getRequestContext } from "../_shared/request_context.ts";

const REQUEST_SCHEMA = z.object({
  session_id: z.string().uuid(),
  local_time_hhmm: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  duration_days: z.number().int().min(3).max(14),
});

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
    throw new PotionFollowUpSchedulingError(
      500,
      "Supabase environment variables are not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
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

    const result = await schedulePotionFollowUpForSession({
      admin,
      userId: authData.user.id,
      sessionId: parsed.data.session_id,
      localTimeHHMM: parsed.data.local_time_hhmm,
      durationDays: parsed.data.duration_days,
    });

    return jsonResponse(req, {
      request_id: requestId,
      session: result.session,
      scheduled_count: result.scheduledCount,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "schedule-potion-follow-up-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "schedule-potion-follow-up-v1" },
    });

    if (error instanceof PotionFollowUpSchedulingError) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to schedule potion follow-up");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

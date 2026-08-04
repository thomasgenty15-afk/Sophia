import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { tryAdvancePhaseItems } from "../_shared/v2-runtime.ts";

const REQUEST_SCHEMA = z.object({
  plan_id: z.string().uuid(),
});

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

    const parsedBody = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsedBody.ok) return parsedBody.response;

    const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceRoleKey = String(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ).trim();
    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error("Missing Supabase environment for advance-phase-v2");
    }

    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await tryAdvancePhaseItems(
      admin,
      parsedBody.data.plan_id,
      authData.user.id,
    );

    return jsonResponse(req, {
      request_id: requestId,
      activated_count: result.activatedCount,
      phase_id: result.phaseId,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "advance-phase-v2",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "advance-phase-v2" },
    });

    return serverError(req, requestId, "Failed to advance phase");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

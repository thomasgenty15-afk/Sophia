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
import {
  loadPhase1GenerationContext,
  mergePhase1Payload,
} from "../_shared/v2-phase1.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
  story_viewed_or_validated: z.boolean().optional(),
  deep_why_answered: z.boolean().optional(),
  defense_card_ready: z.boolean().optional(),
  attack_card_ready: z.boolean().optional(),
  support_card_ready: z.boolean().optional(),
});

class UpdatePhase1RuntimeError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpdatePhase1RuntimeError";
    this.status = status;
  }
}

export async function updatePhase1Runtime(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  patch: {
    story_viewed_or_validated?: boolean;
    deep_why_answered?: boolean;
    defense_card_ready?: boolean;
    attack_card_ready?: boolean;
    support_card_ready?: boolean;
  };
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });

  if (!context.phase1?.context) {
    throw new UpdatePhase1RuntimeError(409, "Phase 1 context is not prepared yet");
  }

  const now = new Date().toISOString();
  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    runtime: args.patch,
    now,
  });

  const { data, error } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: handoffPayload,
      updated_at: now,
    })
    .eq("id", args.transformationId)
    .select("handoff_payload")
    .single();

  if (error) {
    throw new UpdatePhase1RuntimeError(500, `Failed to persist phase 1 runtime: ${error.message}`, {
      cause: error,
    });
  }

  return (data as { handoff_payload: Record<string, unknown> }).handoff_payload.phase_1;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const phase1 = await updatePhase1Runtime({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      patch: {
        story_viewed_or_validated: parsed.data.story_viewed_or_validated,
        deep_why_answered: parsed.data.deep_why_answered,
        defense_card_ready: parsed.data.defense_card_ready,
        attack_card_ready: parsed.data.attack_card_ready,
        support_card_ready: parsed.data.support_card_ready,
      },
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      phase_1: phase1,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "update-phase-1-runtime-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "update-phase-1-runtime-v1" },
    });

    if (error instanceof UpdatePhase1RuntimeError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to update phase 1 runtime");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new UpdatePhase1RuntimeError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}

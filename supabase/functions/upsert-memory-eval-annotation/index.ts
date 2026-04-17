/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import {
  badRequest,
  getRequestId,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  buildMemoryAnnotationTargetKey,
  type MemoryEvalAnnotation,
} from "../sophia-brain/lib/memory_scorecard.ts";

const BodySchema = z.object({
  reviewer_user_id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  scope: z.string().trim().min(1).max(80).optional(),
  window_from: z.string(),
  window_to: z.string(),
  target_type: z.enum(["window", "turn"]),
  turn_id: z.string().trim().min(1).max(120).optional(),
  request_id: z.string().trim().min(1).max(120).optional(),
  dimension: z.enum([
    "overall",
    "identification",
    "persistence",
    "retrieval",
    "injection",
    "surface",
  ]),
  label: z.enum(["good", "partial", "miss", "harmful"]),
  notes: z.string().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function asIso(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const isInternal = Boolean(req.headers.get("x-internal-secret"));
    if (isInternal) {
      const guard = ensureInternalRequest(req);
      if (guard) return guard;
    } else {
      if (req.method === "OPTIONS") return handleCorsOptions(req);
      const corsErr = enforceCors(req);
      if (corsErr) return corsErr;
      if (req.method !== "POST") {
        return jsonResponse(
          req,
          { error: "Method Not Allowed", request_id: requestId },
          { status: 405 },
        );
      }
    }

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const windowFrom = asIso(body.window_from);
    const windowTo = asIso(body.window_to);
    if (!windowFrom || !windowTo) {
      return badRequest(req, requestId, "Invalid window_from/window_to");
    }

    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
      .trim();
    if (!url || !anonKey || !serviceRoleKey) {
      return serverError(req, requestId, "Server misconfigured");
    }

    let reviewerUserId = String(body.reviewer_user_id ?? "").trim() || null;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: auth, error: authError } = await userClient.auth.getUser();
      if (authError || !auth.user) {
        return jsonResponse(
          req,
          { error: "Unauthorized", request_id: requestId },
          { status: 401 },
        );
      }
      const { data: adminRow } = await userClient
        .from("internal_admins")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!adminRow) {
        return jsonResponse(
          req,
          { error: "Forbidden", request_id: requestId },
          { status: 403 },
        );
      }
      reviewerUserId = auth.user.id;
    }

    if (!reviewerUserId) {
      return badRequest(req, requestId, "reviewer_user_id is required");
    }
    if (
      body.target_type === "turn" &&
      !String(body.turn_id ?? "").trim() &&
      !String(body.request_id ?? "").trim()
    ) {
      return badRequest(req, requestId, "turn_id or request_id is required for target_type=turn");
    }

    const targetKey = buildMemoryAnnotationTargetKey({
      userId: body.user_id,
      scope: body.scope ?? null,
      windowFrom,
      windowTo,
      targetType: body.target_type,
      turnId: body.turn_id ?? null,
      requestId: body.request_id ?? null,
    });

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const row: MemoryEvalAnnotation = {
      reviewer_user_id: reviewerUserId,
      user_id: body.user_id,
      scope: body.scope ?? null,
      window_from: windowFrom,
      window_to: windowTo,
      target_type: body.target_type,
      target_key: targetKey,
      turn_id: body.turn_id ?? null,
      request_id: body.request_id ?? null,
      dimension: body.dimension,
      label: body.label,
      notes: body.notes ?? null,
      metadata: body.metadata ?? {},
    };

    const { data, error } = await admin
      .from("memory_eval_annotations")
      .upsert({
        ...row,
        updated_at: new Date().toISOString(),
      } as any, {
        onConflict: "reviewer_user_id,target_key,dimension",
      })
      .select(
        "id,created_at,updated_at,reviewer_user_id,user_id,scope,window_from,window_to,target_type,target_key,turn_id,request_id,dimension,label,notes,metadata",
      )
      .single();
    if (error) throw error;

    return jsonResponse(req, {
      request_id: requestId,
      annotation: data,
    }, { includeCors: !isInternal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[upsert-memory-eval-annotation] request_id=${requestId}`, error);
    return jsonResponse(
      req,
      { error: message, request_id: requestId },
      { status: 500 },
    );
  }
});

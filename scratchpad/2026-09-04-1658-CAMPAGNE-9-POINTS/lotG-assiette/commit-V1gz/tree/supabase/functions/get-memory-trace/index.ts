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
import { loadMemoryTraceWindow } from "../sophia-brain/lib/memory_trace.ts";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  hours: z.number().int().min(1).max(168).optional(),
  scope: z.string().trim().min(1).max(80).optional(),
});

function asIso(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function deriveWindow(body: z.infer<typeof BodySchema>): {
  from: string;
  to: string;
} | null {
  const to = asIso(body.to ?? "") ?? new Date().toISOString();
  const from = asIso(body.from ?? "");
  if (from) return { from, to };
  const hours = Number(body.hours ?? 24);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) return null;
  return {
    to,
    from: new Date(new Date(to).getTime() - hours * 60 * 60 * 1000)
      .toISOString(),
  };
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
    const window = deriveWindow(body);
    if (!window) {
      return badRequest(req, requestId, "Invalid or missing time window");
    }

    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
      .trim();
    if (!url || !anonKey || !serviceRoleKey) {
      return serverError(req, requestId, "Server misconfigured");
    }

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
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const trace = await loadMemoryTraceWindow({
      supabase: admin as any,
      userId: body.user_id,
      from: window.from,
      to: window.to,
      scope: body.scope ?? null,
    });

    return jsonResponse(req, {
      request_id: requestId,
      trace,
    }, { includeCors: !isInternal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[get-memory-trace] request_id=${requestId}`, error);
    return jsonResponse(
      req,
      { error: message, request_id: requestId },
      { status: 500 },
    );
  }
});

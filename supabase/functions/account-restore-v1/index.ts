// @ts-nocheck
// Restore an account flagged deletion_pending, any time before purge_at (J+7).
//
// One click restores everything that was cut at T0 except the Stripe
// subscription: cancellation is final on Stripe's side, the user goes back
// through the subscription page (stated in the UI).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETION_PENDING,
} from "../_shared/account_lifecycle.ts";

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    currentUserId = user.id;

    const admin = createClient(supabaseUrl, supabaseServiceRole);
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("account_status,purge_at,pre_deletion_whatsapp_opted_in")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) throw profErr;
    if (!profile) {
      return jsonResponse(req, { error: "profile_not_found", request_id: requestId }, { status: 404 });
    }

    if (profile.account_status !== ACCOUNT_STATUS_DELETION_PENDING) {
      return jsonResponse(req, { ok: true, already_active: true, request_id: requestId });
    }

    const purgeAt = profile.purge_at ? new Date(String(profile.purge_at)).getTime() : 0;
    if (purgeAt && purgeAt <= Date.now()) {
      // The purge window is over; the cron owns this account now.
      return jsonResponse(
        req,
        { error: "purge_window_elapsed", request_id: requestId },
        { status: 410 },
      );
    }

    const restoreOptIn = profile.pre_deletion_whatsapp_opted_in === true;
    const update: Record<string, unknown> = {
      account_status: ACCOUNT_STATUS_ACTIVE,
      purge_at: null,
      deletion_requested_at: null,
      pre_deletion_whatsapp_opted_in: null,
    };
    if (restoreOptIn) {
      // Put WhatsApp back the way it was at T0. Cancelled checkins are not
      // resurrected: the daily scheduler recreates them naturally.
      update.whatsapp_opted_in = true;
      update.whatsapp_opted_out_at = null;
      update.whatsapp_optout_reason = null;
    }
    const { error: updErr } = await admin.from("profiles").update(update).eq("id", user.id);
    if (updErr) throw updErr;

    return jsonResponse(req, {
      ok: true,
      restored: true,
      whatsapp_opted_in_restored: restoreOptIn,
      // Stated in the UI: the Stripe subscription is NOT restored automatically.
      subscription_restored: false,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[account-restore-v1] error", err);
    await logEdgeFunctionError({
      functionName: "account-restore-v1",
      error: err,
      severity: "error",
      title: "account_restore_failed",
      requestId,
      userId: currentUserId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});

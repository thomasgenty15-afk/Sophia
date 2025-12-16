/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";

const BodySchema = z.object({
  suggestion_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
});

console.log("apply-prompt-override-suggestion: Function initialized");

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const { suggestion_id, dry_run } = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    const userId = auth.user.id;

    // Admin gate
    const { data: adminRow } = await userClient.from("internal_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: suggestion, error: sugErr } = await admin
      .from("prompt_override_suggestions")
      .select("*")
      .eq("id", suggestion_id)
      .single();
    if (sugErr) throw sugErr;
    if (!suggestion) throw new Error("Suggestion not found");
    if (suggestion.status !== "pending") {
      return jsonResponse(req, { error: "Suggestion is not pending", request_id: requestId }, { status: 409 });
    }

    const promptKey = String(suggestion.prompt_key);
    const action = suggestion.action === "replace" ? "replace" : "append";
    const proposed = String(suggestion.proposed_addendum ?? "").trim();
    if (!proposed) return jsonResponse(req, { error: "Empty proposed_addendum", request_id: requestId }, { status: 400 });

    // Ensure prompt_overrides row exists
    const { data: current } = await admin
      .from("prompt_overrides")
      .select("prompt_key,enabled,addendum")
      .eq("prompt_key", promptKey)
      .maybeSingle();
    if (!current) {
      const { error: insErr } = await admin.from("prompt_overrides").insert({ prompt_key: promptKey, enabled: true, addendum: "" });
      if (insErr) throw insErr;
    }

    const prevAdd = String(current?.addendum ?? "");
    const newAdd =
      action === "replace"
        ? proposed
        : prevAdd.trim().length > 0
          ? `${prevAdd.trim()}\n\n${proposed}`
          : proposed;

    const result = {
      prompt_key: promptKey,
      action,
      previous_addendum: prevAdd,
      new_addendum: newAdd,
    };

    if (dry_run) {
      return jsonResponse(req, { success: true, dry_run: true, request_id: requestId, result });
    }

    // Apply override + mark suggestion approved+applied
    const { error: updErr } = await admin
      .from("prompt_overrides")
      .update({ addendum: newAdd, enabled: true, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("prompt_key", promptKey);
    if (updErr) throw updErr;

    const { error: sugUpdErr } = await admin
      .from("prompt_override_suggestions")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
        applied_at: new Date().toISOString(),
        applied_by: userId,
        applied_result: result,
      })
      .eq("id", suggestion_id);
    if (sugUpdErr) throw sugUpdErr;

    return jsonResponse(req, { success: true, request_id: requestId, result });
  } catch (error) {
    console.error(`[apply-prompt-override-suggestion] request_id=${requestId}`, error);
    return serverError(req, requestId);
  }
});



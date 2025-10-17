import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { OptinWebhookPayloadSchema } from "../../../supabase/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const baseCorsHeaders = {
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-twilio-signature",
  "access-control-max-age": "86400",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "vary": "Origin",
} as const;
function buildCorsHeaders(origin?: string) {
  const allowed = ALLOWED_ORIGIN === "*" ? "*" : origin ?? ALLOWED_ORIGIN;
  return { ...baseCorsHeaders, "access-control-allow-origin": allowed };
}
function json(data: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildCorsHeaders(origin),
  });
}
const enc = new TextEncoder();
async function hmacSHA1Base64(key: string, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function timingSafeEqual(a: string, b: string) {
  const A = enc.encode(a);
  const B = enc.encode(b);
  if (A.length !== B.length) return false;
  let result = 0;
  for (let i = 0; i < A.length; i += 1) {
    result |= A[i] ^ B[i];
  }
  return result === 0;
}
async function validateTwilioSignature(
  req: Request,
  rawBody: string,
  webhookUrl: string,
  authToken: string,
) {
  const header = req.headers.get("X-Twilio-Signature") ?? "";
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  let toSign = webhookUrl;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const keys = Array.from(params.keys()).sort();
    for (const key of keys) {
      toSign += key + (params.get(key) ?? "");
    }
  } else {
    toSign += rawBody;
  }
  const expected = await hmacSHA1Base64(authToken, toSign);
  return timingSafeEqual(expected, header);
}
export default serve(async (req) => {
  const origin = req.headers.get("origin") ?? undefined;
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }
  const twilioWebhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!twilioWebhookUrl || !twilioAuthToken) {
    return json({ error: "missing_twilio_config" }, 500, origin);
  }
  const rawBody = await req.clone().text();
  const signatureValid = await validateTwilioSignature(req, rawBody, twilioWebhookUrl, twilioAuthToken);
  if (!signatureValid) {
    return json({ error: "invalid_signature" }, 403, origin);
  }
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  let body: unknown = {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    body = Object.fromEntries(params.entries());
  } else {
    body = await req.json().catch(() => undefined);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_payload" }, 400, origin);
  }
  const parsed = OptinWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, 400, origin);
  }
  const payload = parsed.data;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const externalId: string | null = payload.external_id ??
    (typeof (body as Record<string, unknown>).MessageSid === "string"
      ? (body as Record<string, string>).MessageSid
      : null);
  const ensureOwnership = async (): Promise<Response | null> => {
    if (!payload.objective_entry) return null;
    const { data: own, error: ownErr } = await supabase
      .from("user_objectives")
      .select("id")
      .eq("id", payload.objective_entry.user_objective_id)
      .eq("user_id", payload.user_id)
      .maybeSingle();
    if (ownErr) return json({ error: ownErr.message }, 400, origin);
    if (!own) return json({ error: "objective_entry.user_objective_id not owned by user" }, 404, origin);
    return null;
  };
  let objectiveEntryId: string | null = null;
  if (externalId) {
    const { data: dup, error: dupErr } = await supabase
      .from("user_messages")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (dupErr) return json({ error: dupErr.message }, 400, origin);
    if (dup) {
      if (payload.objective_entry) {
        const ownershipResp = await ensureOwnership();
        if (ownershipResp) return ownershipResp;
        const { data: entryRow, error: upsertErr } = await supabase
          .from("user_objective_entries")
          .upsert([
            {
              user_objective_id: payload.objective_entry.user_objective_id,
              day: payload.objective_entry.day,
              status: payload.objective_entry.status,
              source: "whatsapp_optin",
              note: payload.objective_entry.note ?? null,
            },
          ], { onConflict: "user_objective_id,day" })
          .select("id")
          .maybeSingle();
        if (upsertErr) return json({ error: upsertErr.message }, 400, origin);
        objectiveEntryId = entryRow?.id ?? null;
      }
      return json({ success: true, user_message_id: dup.id, objective_entry_id: objectiveEntryId, idempotent: true }, 200, origin);
    }
  }
  const { data: insertedMsg, error: insMsgErr } = await supabase
    .from("user_messages")
    .insert({
      user_id: payload.user_id,
      direction: payload.direction,
      channel: "whatsapp",
      body: payload.body ?? null,
      template_key: payload.template_key ?? null,
      payload: payload.payload ?? null,
      related_user_objective_id: payload.objective_entry?.user_objective_id ?? null,
      external_id: externalId,
      is_proactive: payload.is_proactive ?? false,
    })
    .select("id")
    .single();
  if (insMsgErr) return json({ error: insMsgErr.message }, 400, origin);
  if (payload.objective_entry) {
    const ownershipResp = await ensureOwnership();
    if (ownershipResp) return ownershipResp;
    const { data: entryRow, error: upsertErr } = await supabase
      .from("user_objective_entries")
      .upsert([
        {
          user_objective_id: payload.objective_entry.user_objective_id,
          day: payload.objective_entry.day,
          status: payload.objective_entry.status,
          source: "whatsapp_optin",
          note: payload.objective_entry.note ?? null,
        },
      ], { onConflict: "user_objective_id,day" })
      .select("id")
      .maybeSingle();
    if (upsertErr) return json({ error: upsertErr.message }, 400, origin);
    objectiveEntryId = entryRow?.id ?? null;
  }
  return json({ success: true, user_message_id: insertedMsg.id, objective_entry_id: objectiveEntryId }, 200, origin);
});


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { OptinWebhookPayloadSchema } from "../../../supabase/types.ts";
import type { OptinWebhookPayload } from "../../../supabase/types.ts";

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
  const envOrigin = ALLOWED_ORIGIN.trim();
  const allowed = envOrigin === "*"
    ? "*"
    : envOrigin.length > 0
    ? envOrigin
    : origin ?? "*";
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
function normalizeWhatsAppAddress(address: unknown) {
  if (typeof address !== "string") return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^whatsapp:/i, "");
  return withoutPrefix.replace(/^00/, "+");
}
async function toOptinPayloadFromTwilio(
  body: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
) {
  const rawFrom = typeof body.From === "string" ? body.From.trim() : null;
  const from = normalizeWhatsAppAddress(body.From);
  if (!from && !rawFrom) {
    return { ok: false as const, status: 400, error: "missing_from" };
  }
  const candidates = new Set<string>();
  if (rawFrom) candidates.add(rawFrom);
  if (from) {
    candidates.add(from);
    if (!from.toLowerCase().startsWith("whatsapp:")) {
      candidates.add(`whatsapp:${from}`);
    }
  }
  const phoneCandidates = Array.from(candidates.values()).filter((v) => v.length > 0);
  if (phoneCandidates.length === 0) {
    return { ok: false as const, status: 400, error: "invalid_from" };
  }
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("id")
    .in("phone_e164", phoneCandidates)
    .maybeSingle();
  if (profileErr) {
    console.error("optin-webhook: lookup_failed", { error: profileErr, from: phoneCandidates });
    return { ok: false as const, status: 500, error: profileErr.message };
  }
  if (!profile) {
    console.warn("optin-webhook: unknown_sender", { from: phoneCandidates });
    return { ok: false as const, status: 404, error: "unknown_sender" };
  }
  const mapped = {
    user_id: profile.id,
    direction: "inbound",
    template_key: null,
    body: typeof body.Body === "string" ? body.Body : null,
    payload: body,
    objective_entry: undefined,
    is_proactive: false,
    external_id: typeof body.MessageSid === "string" ? body.MessageSid : null,
  } satisfies Record<string, unknown>;
  const parsed = OptinWebhookPayloadSchema.safeParse(mapped);
  if (!parsed.success) {
    return { ok: false as const, status: 400, error: parsed.error.flatten() };
  }
  return { ok: true as const, payload: parsed.data };
}
async function upsertObjectiveEntryViaRpc(
  supabase: ReturnType<typeof createClient>,
  payload: OptinWebhookPayload,
  origin: string | undefined,
) {
  if (!payload.objective_entry) {
    return { response: null, entryId: null as string | null };
  }
  const rpcArgs = {
    user_id: payload.user_id,
    user_objective_id: payload.objective_entry.user_objective_id,
    day: payload.objective_entry.day,
    status: payload.objective_entry.status,
    note: payload.objective_entry.note ?? null,
    source: "whatsapp_optin",
  };
  const { data, error } = await supabase.rpc("user_objective_entry_upsert", rpcArgs);
  if (error) {
    console.error("optin-webhook: objective_entry_rpc_failed", { error, rpcArgs });
    return { response: json({ error: error.message }, 400, origin), entryId: null as string | null };
  }
  return { response: null, entryId: (data as string | null) ?? null };
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
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerTokenRaw = bearerMatch?.[1];
  const normalizedServiceRoleKey = serviceRoleKey.trim();
  let isInternalAuthorized = false;
  if (bearerTokenRaw) {
    const bearerToken = bearerTokenRaw.trim();
    if (bearerToken) {
      const A = enc.encode(bearerToken);
      const B = enc.encode(normalizedServiceRoleKey);
      if (A.length === B.length) {
        let result = 0;
        for (let i = 0; i < A.length; i += 1) {
          result |= A[i] ^ B[i];
        }
        isInternalAuthorized = result === 0;
      } else {
        isInternalAuthorized = bearerToken === normalizedServiceRoleKey;
      }
    }
  }
  if (bearerMatch && !isInternalAuthorized) {
    console.warn("optin-webhook: invalid_internal_auth", {
      tokenLength: bearerTokenRaw?.trim().length ?? null,
      keyLength: normalizedServiceRoleKey.length,
    });
    return json({ error: "invalid_internal_auth" }, 401, origin);
  }
  if (authHeader && !isInternalAuthorized && !bearerMatch) {
    console.warn("optin-webhook: unexpected_auth_header", { authHeader });
  }
  const rawBody = await req.clone().text();
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!isInternalAuthorized) {
    const signatureValid = await validateTwilioSignature(req, rawBody, twilioWebhookUrl, twilioAuthToken);
    if (!signatureValid) {
      console.warn("optin-webhook: invalid_signature", { path: req.url });
      return json({ error: "invalid_signature" }, 403, origin);
    }
  }
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
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const parsed = OptinWebhookPayloadSchema.safeParse(body);
  let resolvedPayload;
  if (parsed.success) {
    resolvedPayload = parsed.data;
  } else {
    const twilioResult = await toOptinPayloadFromTwilio(body as Record<string, unknown>, supabase);
    if (!twilioResult.ok) {
      return json({ error: twilioResult.error }, twilioResult.status, origin);
    }
    resolvedPayload = twilioResult.payload;
  }
  const externalId: string | null = resolvedPayload.external_id ??
    (typeof (body as Record<string, unknown>).MessageSid === "string"
      ? (body as Record<string, string>).MessageSid
      : null);
  const ensureOwnership = async (): Promise<Response | null> => {
    if (!resolvedPayload.objective_entry) return null;
    const { data: own, error: ownErr } = await supabase
      .from("user_objectives")
      .select("id")
      .eq("id", resolvedPayload.objective_entry.user_objective_id)
      .eq("user_id", resolvedPayload.user_id)
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
      if (resolvedPayload.objective_entry) {
        const ownershipResp = await ensureOwnership();
        if (ownershipResp) return ownershipResp;
        const rpcResult = await upsertObjectiveEntryViaRpc(supabase, resolvedPayload, origin);
        if (rpcResult.response) return rpcResult.response;
        objectiveEntryId = rpcResult.entryId;
      }
      return json({ success: true, user_message_id: dup.id, objective_entry_id: objectiveEntryId, idempotent: true }, 200, origin);
    }
  }
  const { data: insertedMsg, error: insMsgErr } = await supabase
    .from("user_messages")
    .insert({
      user_id: resolvedPayload.user_id,
      direction: resolvedPayload.direction,
      channel: "whatsapp",
      body: resolvedPayload.body ?? null,
      template_key: resolvedPayload.template_key ?? null,
      payload: resolvedPayload.payload ?? null,
      related_user_objective_id: resolvedPayload.objective_entry?.user_objective_id ?? null,
      external_id: externalId,
      is_proactive: resolvedPayload.is_proactive ?? false,
    })
    .select("id")
    .single();
  if (insMsgErr) return json({ error: insMsgErr.message }, 400, origin);
  if (resolvedPayload.objective_entry) {
    const ownershipResp = await ensureOwnership();
    if (ownershipResp) return ownershipResp;
    const rpcResult = await upsertObjectiveEntryViaRpc(supabase, resolvedPayload, origin);
    if (rpcResult.response) return rpcResult.response;
    objectiveEntryId = rpcResult.entryId;
  }
  return json({ success: true, user_message_id: insertedMsg.id, objective_entry_id: objectiveEntryId }, 200, origin);
});


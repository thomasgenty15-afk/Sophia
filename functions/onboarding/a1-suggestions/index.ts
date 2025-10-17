import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { A1SuggestionsPayloadSchema } from "../../../supabase/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
}

const corsHeaders = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
  "vary": "Origin",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const [, token] = authHeader.split(" ");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const parsed = A1SuggestionsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, 400);
  }
  const payload = parsed.data;

  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Vérifie le JWT côté Auth (utilise la session du porteur)
  const { data: userData, error: userError } = await anon.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Trace optionnelle depuis le header
  const traceId = req.headers.get("x-trace-id") ?? null;

  // Insert log agent A1 (RLS : service_role only → OK)
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: logRow, error: logErr } = await svc
    .from("ai_logs")
    .insert({
      agent: "A1",
      user_id: userData.user.id,
      input: payload,                             // on garde la charge utile telle quelle
      output: payload.result ?? null,             // si tu veux journaliser la sortie du LLM
      trace_id: traceId,
      status: "ok",
    })
    .select("id")
    .single();

  if (logErr) {
    return json({ error: "ai_log_insert_failed", trace_id: traceId }, 400);
  }

  // Tu peux renvoyer ce que ton front attend. Ici : ack + id du log
  return json({
    success: true,
    ai_log_id: logRow.id,
    trace_id: traceId,
  });
});
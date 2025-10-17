import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { ReactivateObjectivesPayloadSchema } from "../../../supabase/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
if (!supabaseUrl || !anonKey) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

const corsHeaders = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400",
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

  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);
  const [, token] = authHeader.split(" ");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const parsed = ReactivateObjectivesPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: active, error: activeErr } = await supabase
    .from("user_objectives")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("status", "active");
  if (activeErr) return json({ error: activeErr.message }, 400);

  const { data: pausedCandidates, error: candErr } = await supabase
    .from("user_objectives")
    .select("id")
    .in("id", payload.ids)
    .eq("user_id", userData.user.id)
    .eq("status", "paused");
  if (candErr) return json({ error: candErr.message }, 400);

  const activeCount = active?.length ?? 0;
  const toReactivate = pausedCandidates?.map((c) => c.id) ?? [];
  if (activeCount + toReactivate.length > 3) {
    return json({ error: "Cap reached: max 3 active objectives" }, 400);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("user_objectives")
    .update({ status: "active", ended_at: null })
    .in("id", toReactivate)
    .eq("user_id", userData.user.id)
    .select("id");

  if (updateErr) return json({ error: updateErr.message }, 400);

  return json({ success: true, reactivated: updated?.map((row) => row.id) ?? [] });
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { SetCheckinPayloadSchema } from "../../../supabase/types.ts";

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
      "cache-control": "no-store",
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
  const parsed = SetCheckinPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;
  const weeklyTime = payload.weekly_checkin_time.length === 5
    ? `${payload.weekly_checkin_time}:00`
    : payload.weekly_checkin_time;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("user_settings")
    .update({
      weekly_checkin_dow: payload.weekly_checkin_dow,
      weekly_checkin_time: weeklyTime,
    })
    .eq("user_id", userData.user.id)
    .select("user_id, weekly_checkin_dow, weekly_checkin_time, updated_at")
    .single();

  if (error) return json({ error: "row_missing_or_rls" }, 409);

  return json({ success: true, settings: data });
});

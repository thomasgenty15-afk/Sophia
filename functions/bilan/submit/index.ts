import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { BilanSubmitPayloadSchema } from "../../../supabase/types.ts";

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
  const parsed = BilanSubmitPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;

  const weekDate = new Date(`${payload.week_start_date}T00:00:00.000Z`);
  if (weekDate.getUTCDay() !== 1) {
    return json({ error: "week_start_date must be a Monday (ISO)" }, 400);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const objectiveIds = payload.responses.objectives?.map((obj) => obj.user_objective_id) ?? [];
  if (objectiveIds.length > 0) {
    const { data: ownedObjectives, error: ownedErr } = await supabase
      .from("user_objectives")
      .select("id")
      .in("id", objectiveIds)
      .eq("user_id", userData.user.id);
    if (ownedErr) return json({ error: ownedErr.message }, 400);

    const ownedIds = new Set(ownedObjectives?.map((row) => row.id) ?? []);
    payload.responses.objectives = payload.responses.objectives.filter((obj) => ownedIds.has(obj.user_objective_id));
  }

  const { data, error } = await supabase
    .from("bilan_weekly")
    .upsert({
      user_id: userData.user.id,
      week_start_date: payload.week_start_date,
      responses: payload.responses,
    }, { onConflict: "user_id,week_start_date" })
    .select("id, user_id, week_start_date")
    .single();

  if (error) return json({ error: error.message }, 400);

  return json({
    success: true,
    bilan_id: data.id,
    user_id: userData.user.id,
    week_start_date: payload.week_start_date,
  });
});

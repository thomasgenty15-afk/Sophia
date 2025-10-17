import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { ActivateObjectivesPayloadSchema } from "../../../supabase/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
if (!supabaseUrl || !anonKey) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
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

  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);
  const [, token] = authHeader.split(" ");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const parsed = ActivateObjectivesPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: activeObjectives, error: activeErr } = await supabase
    .from("user_objectives")
    .select("objective_code")
    .eq("user_id", userData.user.id)
    .eq("status", "active");
  if (activeErr) return json({ error: activeErr.message }, 400);

  const activeCodes = new Set(activeObjectives?.map((row) => row.objective_code) ?? []);
  const seenCodes = new Set<string>();
  const objectivesToInsert = payload.objectives.filter((obj) => {
    if (seenCodes.has(obj.objective_code)) {
      return false;
    }
    seenCodes.add(obj.objective_code);
    if (activeCodes.has(obj.objective_code)) {
      return false;
    }
    return true;
  });

  const activeCount = activeCodes.size;
  if (activeCount + objectivesToInsert.length > 3) {
    return json({ error: "Cap reached: max 3 active objectives" }, 400);
  }

  if (objectivesToInsert.length === 0) {
    return json({ success: true, activated: [] });
  }

  const rows = objectivesToInsert.map((obj) => ({
    user_id: userData.user.id,
    objective_code: obj.objective_code,
    status: "active",
    frequency_per_week: obj.frequency_per_week,
    schedule: obj.schedule,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("user_objectives")
    .insert(rows)
    .select("id, objective_code");

  if (insertErr) return json({ error: insertErr.message }, 400);

  return json({ success: true, activated: inserted });
});

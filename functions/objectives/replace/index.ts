import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { ReplaceObjectivesPayloadSchema } from "../../../supabase/types.ts";

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
  const parsed = ReplaceObjectivesPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  if (payload.complete?.length) {
    const { error } = await supabase
      .from("user_objectives")
      .update({ status: "completed", ended_at: new Date().toISOString().slice(0, 10) })
      .in("id", payload.complete)
      .eq("user_id", userData.user.id);
    if (error) return json({ error: error.message }, 400);
  }

  if (payload.pause?.length) {
    const { error } = await supabase
      .from("user_objectives")
      .update({ status: "paused" })
      .in("id", payload.pause)
      .eq("user_id", userData.user.id);
    if (error) return json({ error: error.message }, 400);
  }

  const { data: activeRecords, error: activeErr } = await supabase
    .from("user_objectives")
    .select("id, objective_code")
    .eq("user_id", userData.user.id)
    .eq("status", "active");
  if (activeErr) return json({ error: activeErr.message }, 400);
  const activeCodes = new Set(activeRecords?.map((row) => row.objective_code) ?? []);
  let activeCount = activeCodes.size;

  let reactivated: string[] = [];
  let skippedReactivate: string[] = [];
  if (payload.reactivate_paused?.length) {
    const { data: ownPaused, error: ownErr } = await supabase
      .from("user_objectives")
      .select("id, objective_code")
      .in("id", payload.reactivate_paused)
      .eq("user_id", userData.user.id)
      .eq("status", "paused");
    if (ownErr) return json({ error: ownErr.message }, 400);

    const pausedIds = ownPaused?.map((row) => row.id) ?? [];
    skippedReactivate = payload.reactivate_paused.filter((id) => !pausedIds.includes(id));

    if (activeCount + pausedIds.length > 3) return json({ error: "Cap reached: max 3 active objectives" }, 400);

    const { data: updated, error: updErr } = await supabase
      .from("user_objectives")
      .update({ status: "active", ended_at: null })
      .in("id", pausedIds)
      .eq("user_id", userData.user.id)
      .select("id");
    if (updErr) return json({ error: updErr.message }, 400);

    reactivated = updated?.map((row) => row.id) ?? [];
    activeCount += reactivated.length;
    ownPaused?.forEach((row) => activeCodes.add(row.objective_code));
  }

  let activated: { id: string; objective_code: string }[] = [];
  let skippedActivate: string[] = [];
  if (payload.activate_new?.length) {
    const seenCodes = new Set<string>();
    const toInsert = payload.activate_new.filter((obj) => {
      if (seenCodes.has(obj.objective_code)) {
        skippedActivate.push(obj.objective_code);
        return false;
      }
      seenCodes.add(obj.objective_code);

      if (activeCodes.has(obj.objective_code)) {
        skippedActivate.push(obj.objective_code);
        return false;
      }

      return true;
    });

    if (activeCount + toInsert.length > 3) {
      return json({ error: "Cap reached: max 3 active objectives" }, 400);
    }

    if (toInsert.length > 0) {
      const { data: existingCodes, error: catErr } = await supabase
        .from("objectives_catalogue")
        .select("code")
        .in("code", toInsert.map((o) => o.objective_code));
      if (catErr) return json({ error: catErr.message }, 400);

      const availableCodes = new Set(existingCodes?.map((row) => row.code) ?? []);
      const missingCodes = toInsert
        .map((obj) => obj.objective_code)
        .filter((code) => !availableCodes.has(code));

      if (missingCodes.length > 0) {
        return json({ error: "missing_objective_codes", missing_codes: missingCodes }, 400);
      }
    }

    if (toInsert.length > 0) {
      const rows = toInsert.map((obj) => ({
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

      activated = inserted ?? [];
      activated.forEach((row) => activeCodes.add(row.objective_code));
      activeCount += activated.length;
    }
  }

  return json({
    success: true,
    reactivated,
    activated,
    skipped: {
      reactivate: skippedReactivate,
      activate: skippedActivate,
    },
  });
});

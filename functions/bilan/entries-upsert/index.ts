import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { EntriesUpsertPayloadSchema } from "../../../supabase/types.ts";

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
  const parsed = EntriesUpsertPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const payload = parsed.data;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const uniqueMap = new Map<string, typeof payload.entries[number]>();
  for (const entry of payload.entries) {
    const key = `${entry.user_objective_id}:${entry.day}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, entry);
  }
  const dedupedEntries = Array.from(uniqueMap.values());

  const objectiveIds = dedupedEntries.map((entry) => entry.user_objective_id);
  const { data: ownedObjectives, error: ownedErr } = await supabase
    .from("user_objectives")
    .select("id")
    .in("id", objectiveIds)
    .eq("user_id", userData.user.id);
  if (ownedErr) return json({ error: ownedErr.message }, 400);

  const ownedIds = new Set(ownedObjectives?.map((row) => row.id) ?? []);
  const rows = dedupedEntries
    .filter((entry) => ownedIds.has(entry.user_objective_id))
    .map((entry) => ({
      user_objective_id: entry.user_objective_id,
      day: entry.day,
      status: entry.status,
      source: entry.source,
      note: entry.note ?? null,
    }));

  if (rows.length === 0) return json({ success: true, upserted: [], skipped: dedupedEntries.length });

  const { data, error } = await supabase
    .from("user_objective_entries")
    .upsert(rows, { onConflict: "user_objective_id,day" })
    .select("id, user_objective_id, day");

  if (error) return json({ error: error.message }, 400);

  return json({ success: true, upserted: data, skipped: dedupedEntries.length - rows.length });
});

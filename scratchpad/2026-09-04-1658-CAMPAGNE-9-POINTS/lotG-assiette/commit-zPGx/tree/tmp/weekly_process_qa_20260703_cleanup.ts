import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

const root = new TextDecoder().decode(
  new Deno.Command("git", { args: ["rev-parse", "--show-toplevel"], stdout: "piped" }).outputSync().stdout,
).trim();

function loadStatus(): Record<string, string> {
  const envText = [`${root}/frontend/.env.local`, `${root}/supabase/.env`].map((p) => {
    try { return Deno.readTextFileSync(p); } catch { return ""; }
  }).join("\n");
  const env: Record<string, string> = {};
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return {
    API_URL: Deno.env.get("SUPABASE_URL") ?? env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
    SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

const userId = Deno.args[0];
if (!userId) throw new Error("usage: cleanup.ts <user_id>");
const status = loadStatus();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = [
  "user_plan_item_entries",
  "user_habit_week_occurrences",
  "user_habit_week_plans",
  "user_plan_items",
  "user_plans_v2",
  "user_transformations",
  "scheduled_checkins",
  "chat_messages",
  "user_chat_states",
  "whatsapp_pending_actions",
  "whatsapp_outbound_messages",
  "momentum_snapshots_v2",
  "user_cycles",
];
const report: Record<string, unknown> = { user_id: userId, deletes: {} };
for (const table of tables) {
  const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("user_id", userId);
  (report.deletes as Record<string, unknown>)[table] = error ? `ERROR:${error.message}` : (count ?? 0);
}
const del = await admin.auth.admin.deleteUser(userId);
report.auth_delete = del.error ? `ERROR:${del.error.message}` : "ok";

// verify remaining
const verify: Record<string, number | string> = {};
for (const table of ["user_chat_states", "chat_messages", "scheduled_checkins", "user_plan_items", "user_cycles"]) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
  verify[table] = error ? `ERROR:${error.message}` : (count ?? 0);
}
const prof = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("id", userId);
verify["profiles"] = prof.error ? `ERROR:${prof.error.message}` : (prof.count ?? 0);
report.verify_remaining = verify;

console.log(JSON.stringify(report, null, 2));

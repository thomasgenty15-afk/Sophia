import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { runWatcher } from "../../supabase/functions/sophia-brain/agents/watcher.ts";
import {
  buildDailyConversationPulse,
  DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
  WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
} from "../../supabase/functions/sophia-brain/conversation_pulse_builder.ts";

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const env = parseEnv(await Deno.readTextFile("supabase/.env"));
for (const [key, value] of Object.entries(env)) {
  if (!Deno.env.get(key)) Deno.env.set(key, value);
}
Deno.env.set("MEGA_TEST_MODE", "0");
Deno.env.set("SOPHIA_WATCHER_DISABLED", "0");
Deno.env.set("SOPHIA_VEILLEUR_DISABLED", "0");

const runId = (await Deno.readTextFile("tmp/pulse-v2-real-qa/run_id.txt"))
  .trim();
const scope = (await Deno.readTextFile("tmp/pulse-v2-real-qa/scope.txt"))
  .trim();
const conn = JSON.parse(
  await Deno.readTextFile("tests/real-personas/alex/connection.json"),
) as { user_id: string };
const userId = String(conn.user_id ?? "").trim();
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const runStartIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const lastProcessedAt = new Date(Date.now() - 2 * 60 * 60 * 1000)
  .toISOString();

await runWatcher(admin as any, userId, scope, lastProcessedAt, {
  requestId: `${runId}-watcher`,
  forceRealAi: true,
  channel: "web",
  scope,
});

const daily = await buildDailyConversationPulse({
  supabase: admin as any,
  userId,
  requestId: `${runId}-daily`,
  nowIso: new Date().toISOString(),
});

const { data: snapshots, error } = await admin
  .from("system_runtime_snapshots")
  .select("id,snapshot_type,payload,created_at")
  .eq("user_id", userId)
  .in("snapshot_type", [
    WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
    DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE,
    "conversation_pulse",
  ])
  .gte("created_at", runStartIso)
  .order("created_at", { ascending: true });
if (error) throw error;

const summary = ((snapshots ?? []) as Array<Record<string, any>>).map((row) => {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    snapshot_type: row.snapshot_type,
    pulse_kind: payload.pulse_kind ?? null,
    version: payload.version ?? null,
    tone: payload.tone ?? null,
    likely_need: payload.signals?.likely_need ?? null,
    proactive_risk: payload.signals?.proactive_risk ?? null,
    emotional_anchors_count: Array.isArray(payload.emotional_anchors)
      ? payload.emotional_anchors.length
      : 0,
    source_pulse_ids: payload.window?.source_pulse_ids ?? [],
  };
});

console.log(JSON.stringify({
  run_id: runId,
  scope,
  watcher_snapshots: summary.filter((row) =>
    row.snapshot_type === WATCHER_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE
  ).length,
  daily_snapshot_id: daily.snapshotId,
  daily_generated: Boolean(daily.snapshotId),
  legacy_conversation_pulse_snapshots: summary.filter((row) =>
    row.snapshot_type === "conversation_pulse"
  ).length,
  snapshots: summary,
}, null, 2));

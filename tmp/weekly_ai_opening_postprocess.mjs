import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function argValue(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadSupabaseStatus() {
  const raw = execFileSync("/usr/local/bin/supabase", [
    "status",
    "--output",
    "json",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`supabase_status_no_json: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(start));
}

function loadInternalSecret(status) {
  const envPath = path.join(root, "supabase", ".env");
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((item) =>
      item.startsWith("INTERNAL_FUNCTION_SECRET=")
    );
    const value = line?.slice("INTERNAL_FUNCTION_SECRET=".length).trim();
    if (value) return value;
  }
  return status.SECRET_KEY;
}

async function jsonFetch(url, options = {}, timeoutMs = 240000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body, text };
}

function restHeaders(status, prefer = "") {
  return {
    apikey: status.SERVICE_ROLE_KEY,
    authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}

async function restPatch(status, tableAndQuery, body) {
  const res = await jsonFetch(`${status.REST_URL}/${tableAndQuery}`, {
    method: "PATCH",
    headers: restHeaders(status, "return=representation"),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rest_patch_failed ${tableAndQuery}: ${res.status} ${res.text}`);
  return res.body;
}

async function restGet(status, tableAndQuery) {
  const res = await jsonFetch(`${status.REST_URL}/${tableAndQuery}`, {
    method: "GET",
    headers: restHeaders(status),
  });
  if (!res.ok) throw new Error(`rest_get_failed ${tableAndQuery}: ${res.status} ${res.text}`);
  return res.body;
}

async function restPost(status, table, body) {
  const res = await jsonFetch(`${status.REST_URL}/${table}`, {
    method: "POST",
    headers: restHeaders(status, "return=representation"),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rest_post_failed ${table}: ${res.status} ${res.text}`);
  return res.body;
}

const runIds = argValue("run-ids").split(",").map((value) => value.trim()).filter(Boolean);
if (runIds.length === 0) throw new Error("--run-ids is required");

const status = loadSupabaseStatus();
const internalSecret = loadInternalSecret(status);
const runRoot = path.join(root, "tmp", "weekly-real-conversation-qa");
const setups = runIds.map((runId) => readJson(path.join(runRoot, runId, "setup.json")));

for (const setup of setups) {
  await restPatch(status, `scheduled_checkins?id=eq.${setup.scheduled_checkin_id}`, {
    status: "pending",
    processed_at: null,
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    delivery_attempt_count: 0,
    delivery_last_error: null,
    draft_message: null,
  });
}

const processResult = await jsonFetch(`${status.API_URL}/functions/v1/process-checkins`, {
  method: "POST",
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${status.ANON_KEY}`,
    "x-internal-secret": internalSecret,
    "content-type": "application/json",
    "x-request-id": `weekly-ai-opening-${Date.now().toString(36)}`,
  },
  body: JSON.stringify({ force: true }),
});
if (!processResult.ok) {
  throw new Error(`process_checkins_failed: ${processResult.status} ${processResult.text}`);
}

const outputs = [];
for (const setup of setups) {
  const checkins = await restGet(
    status,
    `scheduled_checkins?id=eq.${setup.scheduled_checkin_id}&select=id,status,draft_message,message_payload,delivery_last_error,delivery_attempt_count`,
  );
  const checkin = checkins?.[0];
  if (!checkin?.draft_message) {
    throw new Error(`missing_ai_opening:${setup.run_id}:${JSON.stringify(checkin)}`);
  }

  const messages = await restGet(
    status,
    `chat_messages?user_id=eq.${setup.user_id}&scope=eq.${encodeURIComponent(setup.scope)}&role=eq.assistant&select=id,created_at&order=created_at.desc&limit=1`,
  );
  const latestMessage = messages?.[0];
  if (latestMessage?.id) {
    await restPatch(status, `chat_messages?id=eq.${latestMessage.id}`, {
      content: checkin.draft_message,
      metadata: {
        channel: "web",
        source: "process-checkins:weekly_adaptive_review_opening",
        scheduled_checkin_id: setup.scheduled_checkin_id,
        event_context: "weekly_progress_review_v2",
      },
    });
  } else {
    await restPost(status, "chat_messages", {
      user_id: setup.user_id,
      role: "assistant",
      content: checkin.draft_message,
      scope: setup.scope,
      metadata: {
        channel: "web",
        source: "process-checkins:weekly_adaptive_review_opening",
        scheduled_checkin_id: setup.scheduled_checkin_id,
        event_context: "weekly_progress_review_v2",
      },
    });
  }

  const activeState = {
    skill_id: "weekly_adaptive_review_v1",
    status: "active",
    scheduled_checkin_id: setup.scheduled_checkin_id,
    requires_confirmation: true,
    weekly_progress_review: checkin.message_payload?.weekly_progress_review ?? null,
    weekly_adaptive_review: checkin.message_payload?.weekly_adaptive_review ?? null,
    validation_unlock: {
      status: "locked_until_weekly_complete",
      meaning:
        "La validation de la semaine suivante se debloque quand le point weekly est termine; sinon le rappel du lundi matin sert de fallback.",
    },
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await restPatch(
    status,
    `user_chat_states?user_id=eq.${setup.user_id}&scope=eq.${encodeURIComponent(setup.scope)}`,
    {
      temp_memory: { __active_skill_state: activeState },
      current_mode: "companion",
      updated_at: new Date().toISOString(),
    },
  );

  const setupPath = path.join(runRoot, setup.run_id, "setup.json");
  fs.writeFileSync(
    setupPath,
    `${JSON.stringify({
      ...setup,
      opening_before_ai: setup.opening,
      opening: checkin.draft_message,
      opening_source: "process-checkins:weekly_adaptive_review_opening",
      processed_checkin: {
        status: checkin.status,
        delivery_attempt_count: checkin.delivery_attempt_count,
        delivery_last_error: checkin.delivery_last_error,
      },
    }, null, 2)}\n`,
  );
  outputs.push({
    run_id: setup.run_id,
    status: checkin.status,
    opening: checkin.draft_message,
    delivery_last_error: checkin.delivery_last_error,
  });
}

console.log(JSON.stringify({ process_checkins: processResult.body, runs: outputs }, null, 2));

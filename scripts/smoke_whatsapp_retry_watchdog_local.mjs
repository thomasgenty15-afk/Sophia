#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function loadEnvFile(path) {
  const out = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadEnvFile(resolve(root, "supabase/.env"));
const supabaseUrl = env.SUPABASE_URL || "http://127.0.0.1:54321";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = env.INTERNAL_FUNCTION_SECRET || env.SECRET_KEY;

if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
if (!internalSecret) throw new Error("Missing INTERNAL_FUNCTION_SECRET/SECRET_KEY in supabase/.env");

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

async function request(path, init = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return json;
}

async function authRequest(path, init = {}) {
  return await request(`/auth/v1${path}`, init);
}

async function rest(path, init = {}) {
  return await request(`/rest/v1${path}`, init);
}

function md5(text) {
  return createHash("md5").update(text).digest("hex");
}

async function insertRows(table, rows) {
  return await rest(`/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

async function deleteByUser(table, userId) {
  await rest(`/${table}?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

const runId = `codex-wa-retry-${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = `${runId}@example.com`;
let userId = null;

try {
  const existingPending = await rest(
    "/llm_retry_jobs?status=eq.pending&select=id&limit=1",
  );
  if (Array.isArray(existingPending) && existingPending.length > 0) {
    throw new Error(
      "Local llm_retry_jobs already has pending jobs; refusing to run smoke to avoid claiming unrelated work.",
    );
  }

  const user = await authRequest("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: randomUUID() + randomUUID(),
      email_confirm: true,
      user_metadata: { source: runId },
    }),
  });
  userId = user.id;
  if (!userId) throw new Error("Auth admin did not return a user id");

  const base = Date.now() - 120_000;
  const rows = await insertRows("chat_messages", [
    {
      user_id: userId,
      scope: "whatsapp",
      role: "user",
      content: "source message already answered",
      created_at: new Date(base).toISOString(),
      metadata: { smoke_run_id: runId, scenario: "already_answered_source" },
    },
    {
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: "already answered",
      created_at: new Date(base + 10_000).toISOString(),
      metadata: { smoke_run_id: runId, scenario: "already_answered_reply" },
    },
    {
      user_id: userId,
      scope: "whatsapp",
      role: "user",
      content: "source message with newer user",
      created_at: new Date(base + 20_000).toISOString(),
      metadata: { smoke_run_id: runId, scenario: "newer_user_source" },
    },
    {
      user_id: userId,
      scope: "whatsapp",
      role: "user",
      content: "newer user message",
      created_at: new Date(base + 30_000).toISOString(),
      metadata: { smoke_run_id: runId, scenario: "newer_user_followup" },
    },
  ]);

  const alreadyAnsweredSource = rows.find((r) =>
    r.metadata?.scenario === "already_answered_source"
  );
  const newerUserSource = rows.find((r) =>
    r.metadata?.scenario === "newer_user_source"
  );
  if (!alreadyAnsweredSource?.id || !newerUserSource?.id) {
    throw new Error("Failed to insert source chat messages");
  }

  const jobRows = await insertRows("llm_retry_jobs", [
    {
      user_id: userId,
      scope: "whatsapp",
      channel: "whatsapp",
      message: "source message already answered",
      message_hash: md5("source message already answered"),
      status: "pending",
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      metadata: {
        smoke_run_id: runId,
        source_chat_message_id: alreadyAnsweredSource.id,
        source_chat_message_created_at: alreadyAnsweredSource.created_at,
        wa_message_id: `wamid.SMOKE.${runId}.already`,
      },
    },
    {
      user_id: userId,
      scope: "whatsapp",
      channel: "whatsapp",
      message: "source message with newer user",
      message_hash: md5("source message with newer user"),
      status: "pending",
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      metadata: {
        smoke_run_id: runId,
        source_chat_message_id: newerUserSource.id,
        source_chat_message_created_at: newerUserSource.created_at,
        wa_message_id: `wamid.SMOKE.${runId}.newer`,
      },
    },
  ]);

  const workerRes = await fetch(
    `${supabaseUrl}/functions/v1/process-llm-retry-jobs`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "x-internal-secret": internalSecret,
        "x-request-id": runId,
      },
      body: JSON.stringify({ limit: 2, worker_id: runId }),
    },
  );
  const workerText = await workerRes.text();
  if (!workerRes.ok) {
    throw new Error(`worker returned ${workerRes.status}: ${workerText}`);
  }

  const checked = await rest(
    `/llm_retry_jobs?user_id=eq.${encodeURIComponent(userId)}&select=id,status,metadata&order=created_at.asc`,
  );
  const reasons = checked.map((j) => j.metadata?.skip_reason).sort();
  const statuses = checked.map((j) => j.status);
  if (statuses.some((s) => s !== "completed")) {
    throw new Error(`Expected completed jobs, got ${JSON.stringify(statuses)}`);
  }
  if (JSON.stringify(reasons) !== JSON.stringify(["already_answered", "newer_user_message"])) {
    throw new Error(`Unexpected skip reasons: ${JSON.stringify(reasons)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    worker: JSON.parse(workerText),
    checked_jobs: checked.map((j) => ({
      status: j.status,
      skip_reason: j.metadata?.skip_reason,
    })),
  }, null, 2));
} finally {
  if (userId) {
    try {
      await deleteByUser("llm_retry_jobs", userId);
      await deleteByUser("chat_messages", userId);
      await authRequest(`/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("cleanup_failed", error?.message ?? String(error));
    }
  }
}

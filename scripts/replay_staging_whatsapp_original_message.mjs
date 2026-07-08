#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, "supabase/staging-test/.env");

const ORIGINAL_CHAT_MESSAGE_ID = "1851cd67-0a1d-422d-aba6-b0a8c67c64cf";
const USER_ID = "f3bd26a5-581e-4630-8550-77dd5c75387a";

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

const env = loadEnvFile(envPath);
const supabaseUrl = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
const anonKey = String(env.SUPABASE_ANON_KEY ?? serviceRoleKey);
const internalSecret = String(env.INTERNAL_FUNCTION_SECRET ?? "");

if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!internalSecret) throw new Error("Missing INTERNAL_FUNCTION_SECRET");

const restHeaders = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

const edgeHeaders = {
  apikey: anonKey,
  authorization: `Bearer ${anonKey}`,
  "content-type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers: { ...restHeaders, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return json;
}

async function getSingle(path) {
  const rows = await rest(path);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function restoreOriginalMessage(original) {
  await rest("/chat_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: original.id,
      user_id: original.user_id,
      scope: original.scope,
      role: original.role,
      content: original.content,
      agent_used: original.agent_used,
      metadata: original.metadata ?? {},
      created_at: original.created_at,
    }),
  });
}

function e164Digits(value) {
  return String(value ?? "").trim().replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function contentPreview(value, len = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, len);
}

async function findNewInbound(startedAtIso, newWamid) {
  const rows = await rest(
    `/chat_messages?user_id=eq.${USER_ID}&scope=eq.whatsapp&role=eq.user&created_at=gte.${encodeURIComponent(startedAtIso)}&select=id,created_at,metadata,content&order=created_at.desc&limit=20`,
  );
  return (rows ?? []).find((row) => row?.metadata?.wa_message_id === newWamid) ?? null;
}

async function findAssistantRowsAfter(createdAtIso) {
  return await rest(
    `/chat_messages?user_id=eq.${USER_ID}&scope=eq.whatsapp&role=eq.assistant&created_at=gt.${encodeURIComponent(createdAtIso)}&select=id,created_at,agent_used,metadata,content&order=created_at.asc&limit=10`,
  );
}

async function deleteCurrentRunArtifacts({ loopbackAssistantId, loopbackOutboundId }) {
  const cleanup = [];
  if (loopbackAssistantId) {
    cleanup.push(rest(`/chat_messages?id=eq.${loopbackAssistantId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).then(() => ({ target: "loopback_chat_message", ok: true })).catch((error) => ({
      target: "loopback_chat_message",
      ok: false,
      error: error?.message ?? String(error),
    })));
  }
  if (loopbackOutboundId) {
    cleanup.push(rest(`/whatsapp_outbound_messages?id=eq.${loopbackOutboundId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).then(() => ({ target: "loopback_outbound", ok: true })).catch((error) => ({
      target: "loopback_outbound",
      ok: false,
      error: error?.message ?? String(error),
    })));
  }
  return await Promise.all(cleanup);
}

const runId = `codex-wa-funnel-replay-${Date.now()}-${randomUUID().slice(0, 8)}`;
const sendRequestId = `${runId}-real-send`;
const newWamid = `wamid.REPLAY.FUNNEL.${runId}`;
const startedAtIso = new Date(Date.now() - 60_000).toISOString();
let original = null;
let deletedOriginal = false;

try {
  original = await getSingle(
    `/chat_messages?id=eq.${ORIGINAL_CHAT_MESSAGE_ID}&select=id,user_id,scope,role,content,agent_used,metadata,created_at`,
  );
  if (!original) {
    throw new Error(`Original chat message not found: ${ORIGINAL_CHAT_MESSAGE_ID}`);
  }
  if (
    original.user_id !== USER_ID ||
    original.scope !== "whatsapp" ||
    original.role !== "user"
  ) {
    throw new Error("Original chat message does not match expected user/scope/role");
  }

  const profile = await getSingle(
    `/profiles?id=eq.${USER_ID}&select=id,phone_number,full_name,phone_invalid,whatsapp_opted_in`,
  );
  if (!profile) throw new Error("Profile not found");
  if (profile.phone_invalid === true) throw new Error("Profile phone_invalid=true");

  const fromDigits = e164Digits(
    original.metadata?.wa_from ?? profile.phone_number,
  );
  if (!fromDigits) throw new Error("Missing WhatsApp sender phone");

  const deleted = await rest(
    `/chat_messages?id=eq.${ORIGINAL_CHAT_MESSAGE_ID}`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  deletedOriginal = Array.isArray(deleted) && deleted.length === 1;
  if (!deletedOriginal) {
    throw new Error("Original message delete did not affect exactly one row");
  }

  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "codex_replay",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "",
            phone_number_id: "",
          },
          contacts: [{
            profile: { name: String(profile.full_name ?? "") },
            wa_id: fromDigits,
          }],
          messages: [{
            from: fromDigits,
            id: newWamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: String(original.content ?? "") },
            sophia_user_id: USER_ID,
          }],
        },
      }],
    }],
  };

  const webhookRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
    method: "POST",
    headers: {
      ...edgeHeaders,
      "x-request-id": runId,
      "x-internal-secret": internalSecret,
      "x-sophia-wa-transport": "loopback",
    },
    body: JSON.stringify(payload),
  });
  const webhookText = await webhookRes.text();
  let webhookJson = null;
  try {
    webhookJson = webhookText ? JSON.parse(webhookText) : null;
  } catch {
    webhookJson = { raw: webhookText };
  }
  if (!webhookRes.ok) {
    await restoreOriginalMessage(original);
    deletedOriginal = false;
    throw new Error(`Webhook replay failed ${webhookRes.status}: ${webhookText}`);
  }

  const newInbound = await findNewInbound(startedAtIso, newWamid);
  if (!newInbound) {
    throw new Error("Webhook succeeded but replay inbound chat message was not found");
  }

  const assistantRows = await findAssistantRowsAfter(newInbound.created_at);
  const loopbackAssistant = (assistantRows ?? []).find((row) =>
    row?.metadata?.wa_outbound_message_id === "wamid_LOOPBACK" ||
    row?.metadata?.outbound_tracking_id
  );
  if (!loopbackAssistant?.content) {
    throw new Error("Replay inbound was stored but no assistant reply was generated");
  }

  const loopbackOutboundId = loopbackAssistant.metadata?.outbound_tracking_id ?? null;
  const assistantText = String(loopbackAssistant.content ?? "");
  const sendRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      ...edgeHeaders,
      "x-request-id": sendRequestId,
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      user_id: USER_ID,
      message: { type: "text", body: assistantText },
      purpose: "codex_replay_original_whatsapp_reply",
      require_opted_in: true,
      metadata_extra: {
        replay_run_id: runId,
        source_original_chat_message_id: ORIGINAL_CHAT_MESSAGE_ID,
        replay_inbound_chat_message_id: newInbound.id,
        loopback_assistant_chat_message_id: loopbackAssistant.id,
        loopback_outbound_tracking_id: loopbackOutboundId,
        wa_reply_to_message_id: newWamid,
      },
    }),
  });
  const sendText = await sendRes.text();
  let sendJson = null;
  try {
    sendJson = sendText ? JSON.parse(sendText) : null;
  } catch {
    sendJson = { raw: sendText };
  }
  if (!sendRes.ok || sendJson?.success !== true || sendJson?.skipped === true) {
    throw new Error(`Real WhatsApp send failed ${sendRes.status}: ${sendText}`);
  }

  const realAssistantRows = await rest(
    `/chat_messages?user_id=eq.${USER_ID}&scope=eq.whatsapp&role=eq.assistant&created_at=gt.${encodeURIComponent(loopbackAssistant.created_at)}&select=id,created_at,agent_used,metadata,content&order=created_at.asc&limit=10`,
  );
  const realAssistant = (realAssistantRows ?? []).find((row) =>
    row?.metadata?.request_id === sendRequestId ||
    row?.metadata?.replay_run_id === runId
  ) ?? null;

  const outboundRows = await rest(
    `/whatsapp_outbound_messages?user_id=eq.${USER_ID}&request_id=eq.${encodeURIComponent(sendRequestId)}&select=id,status,provider_message_id,transport,reply_to_wamid_in,metadata,created_at&order=created_at.asc&limit=5`,
  ).catch(() => []);

  const cleanup = await deleteCurrentRunArtifacts({
    loopbackAssistantId: loopbackAssistant.id,
    loopbackOutboundId,
  });

  console.log(JSON.stringify({
    ok: true,
    mode: "loopback_funnel_then_real_whatsapp_send",
    run_id: runId,
    original_deleted: deletedOriginal,
    original_message_id: ORIGINAL_CHAT_MESSAGE_ID,
    new_wamid: newWamid,
    webhook_status: webhookRes.status,
    webhook_response: webhookJson,
    new_inbound_id: newInbound.id,
    loopback_assistant_removed: loopbackAssistant.id,
    real_send_status: sendRes.status,
    real_send_response: sendJson,
    real_assistant_id: realAssistant?.id ?? null,
    real_assistant_preview: contentPreview(realAssistant?.content ?? assistantText),
    real_outbound: (outboundRows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      provider_message_id: row.provider_message_id ?? null,
      transport: row.transport ?? null,
      reply_to_wamid_in: row.reply_to_wamid_in ?? null,
      created_at: row.created_at,
    })),
    cleanup,
  }, null, 2));
} catch (error) {
  if (deletedOriginal && original) {
    try {
      await restoreOriginalMessage(original);
      deletedOriginal = false;
    } catch (restoreError) {
      console.error(JSON.stringify({
        restore_failed: true,
        error: restoreError?.message ?? String(restoreError),
      }));
    }
  }
  throw error;
}

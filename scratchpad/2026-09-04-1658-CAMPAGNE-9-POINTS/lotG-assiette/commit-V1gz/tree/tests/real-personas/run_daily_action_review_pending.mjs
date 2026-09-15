import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const persona = String(process.env.QA_PERSONA ?? "").trim();
const userReply = String(process.env.QA_USER_REPLY ?? "").trim();
const waFrom = String(process.env.QA_WA_FROM ?? "").trim();
const waDisplayPhone = String(process.env.QA_WA_DISPLAY_PHONE ?? "").trim();
const waPhoneNumberId = String(process.env.QA_WA_PHONE_NUMBER_ID ?? "").trim();
if (!persona) throw new Error("QA_PERSONA is required");
if (!userReply) throw new Error("QA_USER_REPLY is required");
if (!waFrom) throw new Error("QA_WA_FROM is required");
if (!waDisplayPhone) throw new Error("QA_WA_DISPLAY_PHONE is required");
if (!waPhoneNumberId) throw new Error("QA_WA_PHONE_NUMBER_ID is required");

const connectionPath = path.join(
  root,
  "tests/real-personas",
  persona,
  "connection.json",
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const userId = String(connection.user_id ?? "").trim();
if (!userId) throw new Error(`missing user_id in ${connectionPath}`);

const runId = String(process.env.QA_RUN_ID ?? "").trim() ||
  `daily-action-review-${persona}-${new Date().toISOString().replace(/[:.]/g, "")}`;
const runDir = path.join(root, "tests/real-personas", persona, "runs", "daily-weekly");
fs.mkdirSync(runDir, { recursive: true });
const rawPath = path.join(runDir, `${runId}.raw.json`);
const reportPath = path.join(runDir, `${runId}.md`);
const runStartedAtIso = new Date().toISOString();

function readEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const apiUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL ||
  "http://127.0.0.1:54321").replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("missing service role key");

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text}`);
  return { status: response.status, body };
}

async function rest(pathPart, options = {}) {
  return await jsonFetch(`${apiUrl}/rest/v1/${pathPart}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function select(pathPart) {
  return (await rest(pathPart, { method: "GET" })).body;
}

async function callWebhook(text) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "qa-entry",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: waDisplayPhone,
            phone_number_id: waPhoneNumberId,
          },
          contacts: [{ profile: { name: `${persona} QA` }, wa_id: waFrom }],
          messages: [{
            from: waFrom,
            id: `wamid_${runId}_${crypto.randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            sophia_user_id: userId,
            text: { body: text },
          }],
        },
      }],
    }],
  };
  return await jsonFetch(`${apiUrl}/functions/v1/whatsapp-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sophia-wa-transport": "loopback",
      "x-request-id": `${runId}-reply`,
    },
    body: JSON.stringify(payload),
  });
}

function targetIdsFromPending(pending) {
  const targets = Array.isArray(pending?.payload?.targets)
    ? pending.payload.targets
    : [];
  return {
    occurrenceIds: targets.map((target) => String(target?.occurrence_id ?? "").trim()).filter(Boolean),
    planItemIds: [...new Set(targets.map((target) => String(target?.plan_item_id ?? "").trim()).filter(Boolean))],
  };
}

async function main() {
  const pendingRows = await select(
    `whatsapp_pending_actions?user_id=eq.${userId}&kind=eq.scheduled_checkin&status=eq.pending&payload->>chat_capability=eq.daily_action_review&select=id,scheduled_checkin_id,status,payload,created_at,processed_at&order=created_at.desc&limit=1`,
  );
  const pending = pendingRows?.[0] ?? null;
  if (!pending) {
    throw new Error(
      `No system-generated pending daily_action_review found for persona=${persona}. Run the scheduler/process-checkins first; this QA runner does not fabricate data.`,
    );
  }

  const { occurrenceIds, planItemIds } = targetIdsFromPending(pending);
  const initial = {
    pending,
    assistant: await select(
      `chat_messages?user_id=eq.${userId}&scope=eq.whatsapp&role=eq.assistant&metadata->>event_context=eq.action_evening_review_v2&select=id,content,metadata,created_at&order=created_at.desc&limit=5`,
    ),
  };
  const webhook = await callWebhook(userReply);

  const occurrenceFilter = occurrenceIds.length > 0
    ? `id=in.(${occurrenceIds.join(",")})`
    : "id=eq.__none__";
  const itemFilter = planItemIds.length > 0
    ? `plan_item_id=in.(${planItemIds.join(",")})`
    : "plan_item_id=eq.__none__";
  const after = {
    pending: await select(
      `whatsapp_pending_actions?id=eq.${pending.id}&select=id,status,payload,processed_at`,
    ),
    assistant: await select(
      `chat_messages?user_id=eq.${userId}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(runStartedAtIso)}&select=id,content,metadata,created_at&order=created_at.asc&limit=10`,
    ),
    occurrences: await select(
      `user_habit_week_occurrences?${occurrenceFilter}&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at&order=updated_at.desc`,
    ),
    entries: await select(
      `user_plan_item_entries?user_id=eq.${userId}&${itemFilter}&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.desc&limit=20`,
    ),
  };

  const sophiaOpening = String(
    initial.assistant?.find((msg) =>
      String(msg?.metadata?.purpose ?? "") === "action_evening_review"
    )?.content ?? pending.payload?.draft_message ?? "",
  );
  const sophiaReply = String(after.assistant?.at(-1)?.content ?? "");
  const raw = {
    run_id: runId,
    persona,
    user_id: userId,
    initial,
    turns: [
      { turn: 0, role: "assistant", text: sophiaOpening },
      { turn: 1, role: "user", text: userReply, response: webhook },
      { turn: 1, role: "assistant", text: sophiaReply },
    ],
    after,
  };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const report = `# QA Run Report - Daily Action Review Pending\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `- Run: \`${runId}\`\n` +
    `- Persona: ${persona}\n` +
    `- Objectif: tester un pending daily genere par le systeme, sans fixture hardcodee.\n` +
    `- Trajectoire: Sophia a deja cree le check proactif; le runner envoie seulement la reponse user fournie.\n` +
    `- Surfaces visees: \`whatsapp_pending_actions\`, \`whatsapp-webhook\`, \`daily_action_review_v1\`.\n` +
    `- Cadre IA reel: Supabase local, pending existant, aucun ID/date/action/message fabrique par le runner.\n` +
    `- Validite QA: ${pending ? "valide" : "invalide"}.\n\n` +
    `JSON initial verifie:\n\n` +
    `- pending id: \`${pending.id}\`\n` +
    `- status: \`${pending.status}\`\n` +
    `- message_mode: \`${pending.payload?.message_mode ?? ""}\`\n` +
    `- chat_capability: \`${pending.payload?.chat_capability ?? ""}\`\n` +
    `- targets.length: \`${Array.isArray(pending.payload?.targets) ? pending.payload.targets.length : 0}\`\n` +
    `- occurrence_ids.length: \`${Array.isArray(pending.payload?.occurrence_ids) ? pending.payload.occurrence_ids.length : 0}\`\n` +
    `- draft_message present: \`${Boolean(pending.payload?.draft_message)}\`\n\n` +
    `Raw: \`${path.relative(root, rawPath)}\`\n\n` +
    `## 2. Tours De Conversation\n\n` +
    `### Tour 0\n\n` +
    `**Sophia**\n> ${sophiaOpening.replace(/\n/g, "\n> ")}\n\n` +
    `**Trace courte**\n- source: pending daily systeme existant\n\n` +
    `### Tour 1\n\n` +
    `**User**\n> ${userReply}\n\n` +
    `**Sophia**\n> ${sophiaReply.replace(/\n/g, "\n> ")}\n\n` +
    `**Trace courte**\n` +
    `- http_status: \`${webhook.status}\`\n` +
    `- selected_handler: \`handleActionEveningReviewReply\`\n` +
    `- pending_status: \`${after.pending?.[0]?.status ?? ""}\`\n` +
    `- entries_count: \`${after.entries?.length ?? 0}\`\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: A remplir**\n\n` +
    `**Ce qui marche**\n- A remplir apres lecture.\n\n` +
    `**Problemes**\n- A remplir apres lecture.\n\n` +
    `**Fix propose**\n- A remplir apres lecture.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: A remplir**\n\n` +
    `**Routage**\n- A remplir apres lecture.\n\n` +
    `**Skills / Operations / Tools**\n- A remplir apres lecture.\n\n` +
    `**Memory / Effets durables**\n- A remplir apres lecture.\n\n` +
    `**Problemes**\n- A remplir apres lecture.\n\n` +
    `**Fix propose**\n- A remplir apres lecture.\n\n` +
    `## Verdict Global\n\n` +
    `- Verdict: A remplir\n` +
    `- Raison principale: A remplir\n` +
    `- Follow-up prioritaire: A remplir\n`;
  fs.writeFileSync(reportPath, report);
  console.log(JSON.stringify({
    run_id: runId,
    report: path.relative(root, reportPath),
    raw: path.relative(root, rawPath),
    pending_id: pending.id,
    pending_status: after.pending?.[0]?.status ?? null,
    entries_count: after.entries?.length ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const command = String(process.argv[2] || "").trim();
const persona = String(process.env.QA_PERSONA || "").trim();
const runId = String(process.env.QA_RUN_ID || "").trim();
const date = process.env.QA_DATE || "2026-05-16";
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";

if (!command || !persona || !runId) {
  throw new Error("usage: QA_PERSONA=<persona> QA_RUN_ID=<run> node scripts/qa_attack_db_helper.mjs <snapshot|inspect|cleanup>");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const connectionPath = path.join(root, "tests/real-personas", persona, "connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const outDir = path.join(root, "tests/real-personas", persona, "runs", "operations");
fs.mkdirSync(outDir, { recursive: true });
const prefix = `qa-prepare-defense-card-${persona}-${date}-${runId}`;
const snapshotPath = path.join(outDir, `${date}-attack-${runId}.snapshot.json`);
const inspectPath = path.join(outDir, `${date}-attack-${runId}.inspect.json`);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function safeExec(commandName, args, options = {}) {
  try {
    return execFileSync(commandName, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function localStatus() {
  const raw = safeExec("/usr/local/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
  }) || safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY || status.SECRET_KEY || "";
if (!serviceRoleKey) throw new Error("missing local service role key");

async function rest(pathname, options = {}) {
  const response = await fetch(`${apiUrl}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body };
}

async function selectState() {
  const userId = encodeURIComponent(connection.user_id);
  const [attackCards, planItems] = await Promise.all([
    rest(`user_attack_cards?user_id=eq.${userId}&select=id,plan_item_id,status,source,scope_kind,content,metadata,generated_at,last_updated_at&order=generated_at.desc&limit=100`),
    rest(`user_plan_items?user_id=eq.${userId}&select=id,title,status,cards_status,attack_card_id,defense_card_id,cards_generated_at,updated_at&order=activation_order.asc`),
  ]);
  return {
    persona,
    run_id: runId,
    request_id_prefix: prefix,
    user_id: connection.user_id,
    attack_cards: attackCards.body,
    plan_items: planItems.body,
  };
}

function cardsCreatedByRun(state) {
  return Array.isArray(state.attack_cards)
    ? state.attack_cards.filter((card) =>
      String(card?.metadata?.request_id || "").startsWith(prefix)
    )
    : [];
}

async function cleanup() {
  if (!fs.existsSync(snapshotPath)) throw new Error(`missing snapshot: ${snapshotPath}`);
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const current = await selectState();
  const created = cardsCreatedByRun(current);
  const createdIds = new Set(created.map((card) => String(card.id)));
  const beforeItems = new Map(
    (Array.isArray(before.plan_items) ? before.plan_items : [])
      .map((item) => [String(item.id), item]),
  );
  const touchedItems = (Array.isArray(current.plan_items) ? current.plan_items : [])
    .filter((item) => item.attack_card_id && createdIds.has(String(item.attack_card_id)));

  const restored = [];
  for (const item of touchedItems) {
    const prior = beforeItems.get(String(item.id));
    if (!prior) continue;
    const result = await rest(`user_plan_items?id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(connection.user_id)}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        attack_card_id: prior.attack_card_id ?? null,
        cards_status: prior.cards_status ?? null,
        cards_generated_at: prior.cards_generated_at ?? null,
      }),
    });
    restored.push({ id: item.id, ok: result.ok, status: result.status });
  }

  const deleted = [];
  for (const card of created) {
    const result = await rest(`user_attack_cards?id=eq.${encodeURIComponent(card.id)}&user_id=eq.${encodeURIComponent(connection.user_id)}`, {
      method: "DELETE",
      headers: { prefer: "return=representation" },
    });
    deleted.push({ id: card.id, ok: result.ok, status: result.status });
  }

  const after = await selectState();
  const cleanupReport = {
    request_id_prefix: prefix,
    deleted,
    restored,
    remaining_created_cards: cardsCreatedByRun(after),
    plan_items_still_pointing_to_created_cards: (Array.isArray(after.plan_items) ? after.plan_items : [])
      .filter((item) => item.attack_card_id && createdIds.has(String(item.attack_card_id))),
  };
  fs.writeFileSync(inspectPath, `${JSON.stringify({ before, current, cleanup: cleanupReport, after }, null, 2)}\n`);
  return cleanupReport;
}

if (command === "snapshot") {
  const state = await selectState();
  fs.writeFileSync(snapshotPath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify({ snapshotPath, plan_items: state.plan_items?.length ?? null, attack_cards: state.attack_cards?.length ?? null }, null, 2));
} else if (command === "inspect") {
  const state = await selectState();
  fs.writeFileSync(inspectPath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify({ inspectPath, created_by_run: cardsCreatedByRun(state) }, null, 2));
} else if (command === "cleanup") {
  console.log(JSON.stringify(await cleanup(), null, 2));
} else {
  throw new Error(`unknown command: ${command}`);
}

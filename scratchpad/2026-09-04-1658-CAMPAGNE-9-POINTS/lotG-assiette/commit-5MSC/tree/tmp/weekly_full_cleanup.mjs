import fs from "node:fs";
import path from "node:path";

const runId = process.argv[2];
if (!runId) throw new Error("usage: node tmp/weekly_full_cleanup.mjs <run-id>");

const root = process.cwd();
const runDir = path.join(root, "tmp", "weekly-real-conversation-qa", runId);
const setupPath = path.join(runDir, "setup.json");
if (!fs.existsSync(setupPath)) throw new Error(`missing setup: ${setupPath}`);
const setup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
const userId = String(setup.user_id || "");
if (!userId) throw new Error("missing setup.user_id");

const envText = fs.readFileSync(path.join(root, "supabase/.env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const apiUrl = env.SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
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

async function select(table, query) {
  return await request(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
  });
}

async function del(table, query) {
  return await request(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { prefer: "return=representation" },
  });
}

const userQuery = `user_id=eq.${encodeURIComponent(userId)}`;
const tablesByUser = [
  "user_plan_item_entries",
  "user_habit_week_occurrences",
  "user_habit_week_plans",
  "scheduled_checkins",
  "chat_messages",
  "user_chat_states",
  "user_plan_items",
  "user_plans_v2",
];

const before = {};
for (const table of tablesByUser) {
  const result = await select(table, `${userQuery}&select=id`);
  before[table] = {
    status: result.status,
    ok: result.ok,
    count: Array.isArray(result.body) ? result.body.length : null,
  };
}
const profileBefore = await select(
  "profiles",
  `id=eq.${encodeURIComponent(userId)}&select=id`,
);
before.profiles = {
  status: profileBefore.status,
  ok: profileBefore.ok,
  count: Array.isArray(profileBefore.body) ? profileBefore.body.length : null,
};

const cycles = await select(
  "user_cycles",
  `user_id=eq.${encodeURIComponent(userId)}&select=id`,
);
const cycleIds = Array.isArray(cycles.body)
  ? cycles.body.map((row) => String(row.id)).filter(Boolean)
  : [];
const transformations = cycleIds.length
  ? await select(
    "user_transformations",
    `cycle_id=in.(${cycleIds.map(encodeURIComponent).join(",")})&select=id`,
  )
  : { status: 200, ok: true, body: [] };
const transformationIds = Array.isArray(transformations.body)
  ? transformations.body.map((row) => String(row.id)).filter(Boolean)
  : [];
for (const summary of Array.isArray(setup.review_summary)
  ? setup.review_summary
  : []) {
  const id = String(summary?.transformation_id || "");
  if (id && !transformationIds.includes(id)) transformationIds.push(id);
}

before.user_cycles = {
  status: cycles.status,
  ok: cycles.ok,
  count: cycleIds.length,
};
before.user_transformations = {
  status: transformations.status,
  ok: transformations.ok,
  count: transformationIds.length,
};

const deleted = [];
for (const table of tablesByUser) {
  const result = await del(table, userQuery);
  deleted.push({
    table,
    status: result.status,
    ok: result.ok,
    count: Array.isArray(result.body) ? result.body.length : null,
  });
}
const profileDelete = await del(
  "profiles",
  `id=eq.${encodeURIComponent(userId)}`,
);
deleted.push({
  table: "profiles",
  status: profileDelete.status,
  ok: profileDelete.ok,
  count: Array.isArray(profileDelete.body) ? profileDelete.body.length : null,
});
if (cycleIds.length) {
  const result = await del(
    "user_cycles",
    `id=in.(${cycleIds.map(encodeURIComponent).join(",")})`,
  );
  deleted.push({
    table: "user_cycles",
    status: result.status,
    ok: result.ok,
    count: Array.isArray(result.body) ? result.body.length : null,
  });
}
if (transformationIds.length) {
  const result = await del(
    "user_transformations",
    `id=in.(${transformationIds.map(encodeURIComponent).join(",")})`,
  );
  deleted.push({
    table: "user_transformations",
    status: result.status,
    ok: result.ok,
    count: Array.isArray(result.body) ? result.body.length : null,
  });
}

const authDelete = await request(
  `${apiUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
  { method: "DELETE" },
);

const after = {};
for (const table of tablesByUser) {
  const result = await select(table, `${userQuery}&select=id`);
  after[table] = {
    status: result.status,
    ok: result.ok,
    count: Array.isArray(result.body) ? result.body.length : null,
  };
}
const afterProfile = await select(
  "profiles",
  `id=eq.${encodeURIComponent(userId)}&select=id`,
);
after.profiles = {
  status: afterProfile.status,
  ok: afterProfile.ok,
  count: Array.isArray(afterProfile.body) ? afterProfile.body.length : null,
};
const afterCycles = await select(
  "user_cycles",
  `user_id=eq.${encodeURIComponent(userId)}&select=id`,
);
after.user_cycles = {
  status: afterCycles.status,
  ok: afterCycles.ok,
  count: Array.isArray(afterCycles.body) ? afterCycles.body.length : null,
};
if (transformationIds.length) {
  const afterTransformations = await select(
    "user_transformations",
    `id=in.(${transformationIds.map(encodeURIComponent).join(",")})&select=id`,
  );
  after.user_transformations = {
    status: afterTransformations.status,
    ok: afterTransformations.ok,
    count: Array.isArray(afterTransformations.body)
      ? afterTransformations.body.length
      : null,
  };
}
after.auth_user_delete = { status: authDelete.status, ok: authDelete.ok };

const report = {
  run_id: runId,
  user_id: userId,
  email: setup.email,
  scope: setup.scope,
  before,
  deleted,
  after,
  errors: deleted.filter((item) => !item.ok).map((item) => item.table),
};
fs.writeFileSync(
  path.join(runDir, "cleanup.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({
  cleanup: path.relative(root, path.join(runDir, "cleanup.json")),
  errors: report.errors,
  auth_user_delete: report.after.auth_user_delete,
}, null, 2));

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runId = `qa-coach-pref-blockers-${Date.now()}`;
const outDir = path.join(root, "tmp", runId);
fs.mkdirSync(outDir, { recursive: true });

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

function localStatus() {
  for (const bin of ["./node_modules/.bin/supabase", "/usr/local/bin/supabase"]) {
    try {
      const raw = execFileSync(bin, ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end >= start) return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // Try the next binary.
    }
  }
  return {};
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const apiUrl = status.API_URL || env.SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = status.ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!anonKey || !serviceRoleKey) {
  throw new Error("Missing local Supabase anon/service role keys");
}

async function jsonFetch(url, options, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw_text: text };
    }
    return { response, body, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function createTempUser(label) {
  const email = `${runId}-${label}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    run_id: runId,
    scenario: label,
    created_by: "qa_coach_pref_blockers_rerun",
  };
  const created = await jsonFetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    }),
  });
  if (!created.response.ok || !created.body?.id) {
    throw new Error(
      `create user failed ${label}: ${created.response.status} ${JSON.stringify(created.body)}`,
    );
  }
  const token = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!token.response.ok || !token.body?.access_token) {
    throw new Error(
      `login failed ${label}: ${token.response.status} ${JSON.stringify(token.body)}`,
    );
  }
  return { userId: created.body.id, email, password, jwt: token.body.access_token };
}

async function restDelete(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "return=minimal",
    },
  });
  return { status: result.response.status, ok: result.response.ok };
}

async function restCount(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      prefer: "count=exact",
    },
  });
  return Array.isArray(result.body) ? result.body.length : null;
}

async function deleteTempUser(userId) {
  const result = await jsonFetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  });
  return { status: result.response.status, ok: result.response.ok };
}

function assistantText(body) {
  return String(body?.response?.content ?? body?.response?.reply ?? body?.content ?? "");
}

function shortTrace(body) {
  const trace = body.conversation_turn_trace ?? body.trace?.trace ?? body.trace ?? {};
  const routeDecision = trace.route_decision ?? {};
  const operation = trace.operation_flow_run ?? {};
  const turnFrame = trace.turn_frame ?? {};
  const response = body.response ?? {};
  return {
    response_owner: trace.response_owner ?? routeDecision.response_owner ?? null,
    selected_handler: operation.selected_handler ?? routeDecision.selected_handler ?? null,
    route_selected_handler: routeDecision.selected_handler ?? null,
    route_reason: routeDecision.reason_code ?? null,
    operation_status: operation.status ?? null,
    operation_type: operation.operation_type ?? null,
    platform_handoff: operation.platform_handoff ?? response.platform_handoff ?? null,
    direct_effects: trace.direct_effects ?? turnFrame.direct_effects ?? [],
    pending_confirmation: trace.pending_tool_skill_confirmation ?? null,
    executed_tools: response.executed_tools ?? [],
    committed_effects: response.committed_effects ?? operation.committed_effects ?? [],
    tool_execution: response.tool_execution ?? null,
  };
}

async function sendTurn(ctx, turn, content, history) {
  const requestId = `${runId}-${ctx.label}-t${String(turn).padStart(2, "0")}`;
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${ctx.jwt}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: ctx.userId,
      channel: "web",
      scope: ctx.scope,
      content,
      history,
      disable_debounce: true,
      force_full_ai: true,
    }),
  });
  const body = result.body ?? {};
  const assistant = assistantText(body);
  const turnResult = {
    turn,
    requestId,
    status: result.response.status,
    user: content,
    assistant,
    trace: shortTrace(body),
  };
  history.push({ role: "user", content });
  history.push({ role: "assistant", content: assistant });
  return turnResult;
}

const scenarios = [
  {
    label: "attack",
    turns: [
      "Prépare une carte d'attaque pour lancer mon dossier fiscal quand je repousse et que j'ouvre YouTube à la place.",
      "Préférence coach très claire : pour la suite, sois plus direct et pose moins de questions.",
      "Ok, on reprend la carte d'attaque d'avant.",
    ],
  },
  {
    label: "recurring",
    turns: [
      "Je veux mettre en place un rappel récurrent tous les lundis à 9h pour préparer ma semaine.",
      "Préférence coach explicite : pour la suite, challenge-moi plus mais garde peu de questions.",
      "Reprends le rappel récurrent d'avant, celui du lundi matin.",
    ],
  },
  {
    label: "defense",
    turns: [
      "Prépare une carte de défense pour éviter de scroller le soir quand je suis fatigué, mais ne crée rien sans me demander.",
      "Préférence coach très claire : pour la suite, parle-moi plus doucement et pose moins de questions.",
      "Ok, maintenant reprends la carte de défense d'avant.",
    ],
  },
];

const results = [];
for (const scenario of scenarios) {
  const user = await createTempUser(scenario.label);
  const ctx = {
    ...user,
    label: scenario.label,
    scope: `${runId}-${scenario.label}`,
  };
  const encodedUserId = encodeURIComponent(ctx.userId);
  const beforeCounts = {
    user_profile_facts: await restCount(
      "user_profile_facts",
      `user_id=eq.${encodedUserId}&select=id`,
    ),
    chat_messages: await restCount(
      "chat_messages",
      `user_id=eq.${encodedUserId}&select=id`,
    ),
  };
  const history = [];
  const turns = [];
  try {
    for (let index = 0; index < scenario.turns.length; index++) {
      turns.push(await sendTurn(ctx, index + 1, scenario.turns[index], history));
    }
  } finally {
    const afterCounts = {
      user_profile_facts: await restCount(
        "user_profile_facts",
        `user_id=eq.${encodedUserId}&select=id`,
      ),
      chat_messages: await restCount(
        "chat_messages",
        `user_id=eq.${encodedUserId}&select=id`,
      ),
    };
    const cleanup = {
      chat_messages: await restDelete("chat_messages", `user_id=eq.${encodedUserId}`),
      user_profile_facts: await restDelete(
        "user_profile_facts",
        `user_id=eq.${encodedUserId}`,
      ),
      auth_user: await deleteTempUser(ctx.userId),
    };
    results.push({
      label: scenario.label,
      user_id: ctx.userId,
      scope: ctx.scope,
      before_counts: beforeCounts,
      after_counts: afterCounts,
      cleanup,
      turns,
    });
  }
}

const rawPath = path.join(outDir, "raw.json");
const summaryPath = path.join(outDir, "summary.json");
fs.writeFileSync(rawPath, `${JSON.stringify(results, null, 2)}\n`);
const summary = {
  run_id: runId,
  api_url: apiUrl,
  raw_path: rawPath,
  scenarios: results.map((scenario) => ({
    label: scenario.label,
    before_counts: scenario.before_counts,
    after_counts: scenario.after_counts,
    cleanup: scenario.cleanup,
    turns: scenario.turns.map((turn) => ({
      turn: turn.turn,
      status: turn.status,
      user: turn.user,
      assistant_preview: turn.assistant.replace(/\s+/g, " ").slice(0, 500),
      trace: turn.trace,
    })),
  })),
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

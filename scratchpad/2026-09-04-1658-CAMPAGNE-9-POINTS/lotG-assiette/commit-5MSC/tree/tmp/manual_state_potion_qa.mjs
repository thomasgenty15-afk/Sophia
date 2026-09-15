import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const command = process.argv[2] || "";
const runId = arg("run-id", "manual_state_potion_qa");
const potion = arg("potion", "");
const date = arg("date", new Date().toISOString().slice(0, 10));
const persona = "qa-skill";
const runDir = path.join(root, "tests/real-personas", persona, "runs", "operations");
const connDir = path.join(root, "tests/real-personas", persona, "connections");
fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(connDir, { recursive: true });

const baseName = `${date}-select-state-potion-manual-${runId}${potion ? `-${potion}` : ""}`;
const statePath = path.join(runDir, `${baseName}.state.json`);
const reportPath = path.join(runDir, `${baseName}.md`);
const cleanupPath = path.join(runDir, `${baseName}.cleanup.json`);

function localStatus() {
  const raw = execFileSync("/usr/local/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

const status = localStatus();
const apiUrl = status.API_URL || "http://127.0.0.1:54321";
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!anonKey || !serviceRoleKey) throw new Error("missing local Supabase keys");

const potionFixtures = {
  rappel: {
    title: "Revenir aux petits gestes du soir",
    item: "Marcher dix minutes puis ranger le bureau",
  },
  courage: {
    title: "Oser les conversations importantes",
    item: "Envoyer le message difficile",
  },
  guerison: {
    title: "Reparer apres les rechutes",
    item: "Reprendre doucement apres un ratage",
  },
  clarte: {
    title: "Retrouver une priorite simple",
    item: "Choisir la priorite du matin",
  },
  amour: {
    title: "Changer le ton interieur",
    item: "Me parler avec plus de douceur",
  },
  apaisement: {
    title: "Redescendre la pression",
    item: "Faire une pause avant de reprendre",
  },
};

async function jsonFetch(url, options, timeoutMs = 240_000) {
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

async function rest(pathPart, options = {}) {
  const result = await jsonFetch(`${apiUrl}/rest/v1${pathPart.startsWith("/") ? pathPart : `/${pathPart}`}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
      prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  if (!result.response.ok) {
    throw new Error(`${options.method || "GET"} ${pathPart} failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function insert(table, payload) {
  const rows = await rest(`/${table}`, { method: "POST", body: payload });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patch(table, query, payload) {
  return await rest(`/${table}?${query}`, { method: "PATCH", body: payload });
}

async function del(pathPart) {
  return await rest(pathPart, {
    method: "DELETE",
    prefer: "return=representation",
  });
}

function safePart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

async function createAuthUser() {
  const suffix = `${runId}-${potion}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `qa-${safePart(suffix)}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona,
    run_id: runId,
    potion_type: potion,
    created_by: "manual_state_potion_qa",
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
    throw new Error(`auth create failed: ${created.response.status} ${JSON.stringify(created.body)}`);
  }
  const token = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!token.response.ok || !token.body?.access_token) {
    throw new Error(`auth token failed: ${token.response.status} ${JSON.stringify(token.body)}`);
  }
  return {
    user_id: created.body.id,
    email,
    password,
    access_token: token.body.access_token,
    refresh_token: token.body.refresh_token,
  };
}

async function seedFixture(userId) {
  const fixture = potionFixtures[potion];
  if (!fixture) throw new Error(`unknown potion: ${potion}`);
  const nowIso = new Date().toISOString();
  const profilePayload = {
    id: userId,
    email: `qa-${potion}-${runId}@example.com`,
    timezone: "Europe/Paris",
    whatsapp_opted_in: true,
    access_tier: "trial",
    trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const patchedProfile = await patch("profiles", `id=eq.${encodeURIComponent(userId)}`, profilePayload);
  if (!Array.isArray(patchedProfile) || patchedProfile.length === 0) await insert("profiles", profilePayload);
  const cycle = await insert("user_cycles", {
    user_id: userId,
    status: "active",
    raw_intake_text: "QA manuelle potion: contexte local temporaire pour tester le flow complet.",
    intake_language: "fr",
    duration_months: 1,
  });
  const transformation = await insert("user_transformations", {
    cycle_id: cycle.id,
    priority_order: 1,
    status: "active",
    title: fixture.title,
    internal_summary: `Fixture QA manuelle pour tester la potion ${potion}.`,
    user_summary: "Le user cherche un accompagnement doux, concret, sans pression supplementaire.",
    success_definition: "Avoir un appui simple qui ramene au bon geste sans surcharge.",
    main_constraint: "Quand la charge monte, le user se perd dans la pression et l'auto-jugement.",
    questionnaire_answers: { rythme_prefere: "matin", ton_prefere: "doux et direct", potion_qa: potion },
    handoff_payload: {
      phase_1: {
        deep_why: {
          answers: [
            { question_id: "why_1", answer: "Je veux proteger mon energie et ma confiance." },
            { question_id: "why_2", answer: "Je veux rester present au geste juste au lieu de me crisper." },
          ],
        },
      },
    },
    activated_at: nowIso,
  });
  await patch("user_cycles", `id=eq.${cycle.id}`, { active_transformation_id: transformation.id });
  const plan = await insert("user_plans_v2", {
    user_id: userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    status: "active",
    version: 1,
    title: `Plan QA manuel ${potion}`,
    activated_at: nowIso,
    content: {
      source: "manual_state_potion_qa",
      strategy: {
        identity_shift: "Je deviens quelqu'un qui avance avec plus de douceur.",
        core_principle: "Un seul appui juste vaut mieux qu'une pression de plus.",
        success_definition: "Revenir a un geste simple au bon moment.",
        main_constraint: "La surcharge transforme les petits pas en montagne.",
      },
    },
  });
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const item = await insert("user_plan_items", {
    user_id: userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    plan_id: plan.id,
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: fixture.item,
    description: "Action QA active visible par le skill potion.",
    tracking_type: "boolean",
    activation_order: 1,
    current_habit_state: "active_building",
    target_reps: 1,
    current_reps: 0,
    cadence_label: "quotidien",
    scheduled_days: [weekday],
    time_of_day: "09:00",
    payload: { source: "manual_state_potion_qa", potion_type: potion, run_id: runId },
    activated_at: nowIso,
  });
  return { cycle, transformation, plan, item };
}

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function assistantText(body) {
  const messages = body?.response?.messages;
  if (Array.isArray(messages) && messages.length) {
    return messages.map((message) => String(message?.content ?? "")).filter(Boolean).join("\n\n");
  }
  return String(body?.response?.content ?? body?.response?.reply ?? body?.content ?? body?.reply ?? "");
}

function shortTrace(body) {
  const trace = body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ?? null;
  const routeDecision = trace?.route_decision ?? null;
  const operationFlowRun = trace?.operation_flow_run ?? null;
  const turnFrame = trace?.turn_frame ?? null;
  return {
    http_status: body?.__http_status ?? null,
    ok: body?.ok ?? null,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler: operationFlowRun?.selected_handler ?? routeDecision?.selected_handler ?? null,
    route_reason: routeDecision?.reason_code ?? null,
    direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
    operation: operationFlowRun ?? null,
    pending_confirmation: trace?.pending_tool_skill_confirmation ?? turnFrame?.pending_tool_skill_confirmation ?? null,
    executed_tools: body?.response?.executed_tools ?? [],
    tool_execution: body?.response?.tool_execution ?? null,
    trace_id: trace?.turn_id ?? null,
  };
}

async function readDurable(userId) {
  const encoded = encodeURIComponent(userId);
  const [sessions, reminders, checkins] = await Promise.all([
    rest(`/user_potion_sessions?user_id=eq.${encoded}&select=id,potion_type,status,source,scope_kind,content,follow_up_strategy,metadata,generated_at,last_updated_at&order=generated_at.asc`),
    rest(`/user_recurring_reminders?user_id=eq.${encoded}&select=id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,initiative_kind,source_kind,source_potion_session_id,initiative_metadata,target_kind,target_plan_item_id,target_binding_policy,target_lifecycle_policy,created_at&order=created_at.asc`),
    rest(`/scheduled_checkins?user_id=eq.${encoded}&select=id,recurring_reminder_id,event_context,draft_message,scheduled_for,status,origin,created_at&order=scheduled_for.asc`),
  ]);
  return { sessions, reminders, checkins };
}

async function sendTurn(content) {
  const state = loadState();
  const turn = state.turns.length + 1;
  const history = state.turns.flatMap((item) => [
    { role: "user", content: item.user },
    { role: "assistant", content: item.assistant },
  ]);
  const maxAttempts = Number(arg("max-transient-attempts", "20"));
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestId = `qa-manual-potion-${runId}-${potion}-t${String(turn).padStart(2, "0")}-a${attempt}`;
    const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-user-authorization": `Bearer ${state.auth.access_token}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        user_id: state.auth.user_id,
        channel: "web",
        scope: state.scope,
        content,
        history,
        disable_debounce: true,
        force_full_ai: true,
      }),
    });
    const body = result.body ?? {};
    body.__http_status = result.response.status;
    last = {
      turn,
      attempt,
      request_id: requestId,
      user: content,
      assistant: assistantText(body),
      status: result.response.status,
      body,
      trace: shortTrace(body),
    };
    if (result.response.ok && last.assistant.trim()) break;
    if (![500, 502, 503, 504].includes(result.response.status)) break;
    if (attempt < maxAttempts) {
      const delayMs = Math.min(15_000, 1_500 * attempt);
      console.warn(`${potion} t${turn}: HTTP ${result.response.status}; retry ${attempt + 1}/${maxAttempts} in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  last.durable_after = await readDurable(state.auth.user_id);
  state.turns.push(last);
  state.updated_at = new Date().toISOString();
  saveState(state);
  console.log(JSON.stringify({
    state_path: statePath,
    turn,
    status: last.status,
    attempt: last.attempt,
    assistant: last.assistant,
    trace: last.trace,
    durable: {
      sessions: last.durable_after.sessions.length,
      reminders: last.durable_after.reminders.length,
      checkins: last.durable_after.checkins.length,
    },
  }, null, 2));
}

async function start() {
  if (!potion) throw new Error("--potion is required");
  if (fs.existsSync(statePath)) throw new Error(`state already exists: ${statePath}`);
  const auth = await createAuthUser();
  const fixture = await seedFixture(auth.user_id);
  const connectionName = `manual_state_potion_${runId}_${potion}`;
  const connectionPath = path.join(connDir, `${connectionName}.json`);
  fs.writeFileSync(connectionPath, `${JSON.stringify({
    user_id: auth.user_id,
    email: auth.email,
    password: auth.password,
    refresh_token: auth.refresh_token,
    local: true,
    temporary_qa_connection: true,
    run_id: runId,
    potion,
  }, null, 2)}\n`);
  const state = {
    run_id: runId,
    date,
    potion,
    persona,
    scope: `manual-state-potion-${runId}-${potion}`,
    connection_name: connectionName,
    connection_path: connectionPath,
    auth,
    fixture,
    turns: [],
    created_at: new Date().toISOString(),
    cleanup: { completed: false },
  };
  saveState(state);
  console.log(JSON.stringify({
    state_path: statePath,
    user_id: auth.user_id,
    connection_name: connectionName,
    fixture,
  }, null, 2));
}

function summarizeDurable(durable) {
  return `${durable.sessions.length} session(s), ${durable.reminders.length} reminder(s), ${durable.checkins.length} checkin(s)`;
}

function traceValue(value) {
  if (value == null) return "none";
  if (typeof value === "string") return value ? `\`${value}\`` : "none";
  if (Array.isArray(value)) return value.length ? value.map((item) => `\`${item}\``).join(", ") : "none";
  return "`present`";
}

function buildReport() {
  const state = loadState();
  const after = state.turns.at(-1)?.durable_after ?? { sessions: [], reminders: [], checkins: [] };
  const allHttpOk = state.turns.every((turn) => turn.status === 200);
  const qaValid = state.turns.length > 0 && allHttpOk;
  const activated = after.sessions.length > 0 && after.reminders.length > 0 && after.checkins.length > 0;
  const fluidityProblems = [];
  const forbidden = [
    /\bje peux t envoyer\b/i,
    /\bje te propose d activer\b/i,
    /\bon (essaie|tente|lance|commence|part)[^?]{0,90}\?/i,
    /\bpetit (signe|mot|coucou|rituel)\b/i,
    /\bca te (va|convient)\s*\?/i,
    /\bponctuel ou recurrent\b/i,
  ];
  for (const turn of state.turns) {
    const normalized = String(turn.assistant ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (!turn.assistant.trim()) fluidityProblems.push(`Tour ${turn.turn}: reponse vide.`);
    if (forbidden.some((pattern) => pattern.test(normalized))) {
      fluidityProblems.push(`Tour ${turn.turn}: formulation potentiellement templatee.`);
    }
  }
  const lines = [];
  lines.push("## 1. Contexte Du Test", "");
  lines.push(`- Date: ${state.date}`);
  lines.push(`- Run: \`${state.run_id}\``);
  lines.push(`- Persona: \`${state.persona}\`, connexion temporaire \`${state.connection_name}\``);
  lines.push(`- Objectif: evaluer le flow complet de la potion \`${state.potion}\` apres les derniers correctifs.`);
  lines.push("- Trajectoire: conversation pilotee tour par tour apres lecture de Sophia, jusqu'a collecte, draft, validation et verification DB.");
  lines.push("- Surfaces visees: dispatcher, routing tool skill, sous-skill potion, generation, confirmation, executor, reminders/checkins.");
  lines.push("- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.");
  lines.push(`- Validite QA: ${qaValid ? "valide" : "invalide"}; ${activated ? "activation durable observee" : "activation durable manquante"}.`);
  lines.push("", "## 2. Tours De Conversation");
  for (const turn of state.turns) {
    lines.push("", `### Tour ${turn.turn}`, "", "**User**", `> ${turn.user}`, "", "**Sophia**", `> ${turn.assistant || "[reponse vide]"}`, "", "**Trace courte**");
    lines.push(`- http_status: ${turn.status}`);
    lines.push(`- response_owner: ${traceValue(turn.trace.response_owner)}`);
    lines.push(`- selected_handler: ${traceValue(turn.trace.selected_handler)}`);
    lines.push(`- route_reason: ${traceValue(turn.trace.route_reason)}`);
    lines.push(`- direct_effects: ${traceValue(turn.trace.direct_effects)}`);
    lines.push(`- operation: ${traceValue(turn.trace.operation)}`);
    lines.push(`- pending_confirmation: ${traceValue(turn.trace.pending_confirmation)}`);
    lines.push(`- executed_tools: ${traceValue(turn.trace.executed_tools)}`);
    lines.push(`- durable_effect: ${summarizeDurable(turn.durable_after)}`);
  }
  lines.push("", "DB observe:", "");
  const session = after.sessions[0];
  const reminder = after.reminders[0];
  lines.push(`- user_potion_sessions: ${after.sessions.length}; potion_type observe: \`${session?.potion_type ?? "none"}\`; status: \`${session?.status ?? "none"}\``);
  lines.push(`- user_recurring_reminders: ${after.reminders.length}; source_kind: \`${reminder?.source_kind ?? "none"}\`; local_time_hhmm: \`${reminder?.local_time_hhmm ?? "none"}\``);
  lines.push(`- scheduled_checkins: ${after.checkins.length}; statuses: \`${[...new Set(after.checkins.map((row) => row.status))].join(",") || "none"}\``);
  lines.push("", "## 3. Analyse De Fluidite Humaine", "");
  lines.push(`**Verdict: ${fluidityProblems.length ? "yellow" : "green"}**`, "");
  lines.push("**Ce qui marche**", "- Conversation conduite sans script ferme; les messages user ont ete choisis apres lecture de Sophia.");
  lines.push("", "**Problemes**");
  if (fluidityProblems.length) {
    for (const problem of fluidityProblems) lines.push(`- ${problem} Severite: yellow.`);
  } else {
    lines.push("- Aucun probleme de fluidite bloquant observe automatiquement. Severite: green.");
  }
  lines.push("", "**Fix propose**", fluidityProblems.length ? "- Revoir les tours signales avant de conclure green." : "- Aucun fix requis sur ce run.");
  lines.push("", "## 4. Analyse Systeme", "");
  lines.push(`**Verdict: ${activated && allHttpOk ? "green" : "red"}**`, "");
  lines.push("**Routage**", `- Handler observe: ${state.turns.map((turn) => turn.trace.selected_handler ?? "none").join(" -> ")}`);
  lines.push("", "**Skills / Operations / Tools**", `- Executions observees: ${state.turns.flatMap((turn) => turn.trace.executed_tools ?? []).join(", ") || "none"}`);
  lines.push("", "**Memory / Effets durables**", `- Effet durable final: ${summarizeDurable(after)}.`);
  lines.push("", "**Problemes**");
  lines.push(activated && allHttpOk ? "- Aucun probleme systeme bloquant observe. Severite: green." : "- Activation ou HTTP non conforme. Severite: red.");
  lines.push("", "**Fix propose**", activated && allHttpOk ? "- Aucun fix requis sur ce run." : "- Corriger avant verdict green.");
  lines.push("", "## Verdict Global", "");
  const globalVerdict = activated && allHttpOk && !fluidityProblems.length
    ? "green"
    : activated && allHttpOk
    ? "yellow"
    : "red";
  lines.push(`- Verdict: ${globalVerdict}`);
  lines.push(`- Cleanup: ${state.cleanup.completed ? "effectue" : "non effectue au moment du rapport"}`);
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ report_path: reportPath, verdict: globalVerdict }, null, 2));
}

async function cleanup() {
  const state = loadState();
  const userId = encodeURIComponent(state.auth.user_id);
  const deleted = [];
  for (const table of [
    "scheduled_checkins",
    "user_recurring_reminders",
    "user_potion_sessions",
    "chat_messages",
    "conversation_turn_traces",
    "user_chat_states",
    "user_plan_items",
    "user_plans_v2",
  ]) {
    try {
      const rows = await del(`/${table}?user_id=eq.${userId}`);
      deleted.push({ table, count: Array.isArray(rows) ? rows.length : 0 });
    } catch (error) {
      deleted.push({ table, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const cycleId = encodeURIComponent(state.fixture.cycle.id);
  try {
    const rows = await del(`/user_transformations?cycle_id=eq.${cycleId}`);
    deleted.push({ table: "user_transformations", count: Array.isArray(rows) ? rows.length : 0 });
  } catch (error) {
    deleted.push({ table: "user_transformations", error: error instanceof Error ? error.message : String(error) });
  }
  for (const table of ["user_cycles", "profiles"]) {
    try {
      const rows = await del(`/${table}?${table === "user_cycles" ? `id=eq.${cycleId}` : `id=eq.${userId}`}`);
      deleted.push({ table, count: Array.isArray(rows) ? rows.length : 0 });
    } catch (error) {
      deleted.push({ table, error: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    await jsonFetch(`${apiUrl}/auth/v1/admin/users/${encodeURIComponent(state.auth.user_id)}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
    deleted.push({ table: "auth.users", count: 1 });
  } catch (error) {
    deleted.push({ table: "auth.users", error: error instanceof Error ? error.message : String(error) });
  }
  try {
    fs.unlinkSync(state.connection_path);
  } catch {
    // best effort
  }
  state.cleanup = { completed: true, deleted, cleanup_path: cleanupPath, at: new Date().toISOString() };
  saveState(state);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(state.cleanup, null, 2)}\n`);
  console.log(JSON.stringify(state.cleanup, null, 2));
}

if (command === "start") {
  await start();
} else if (command === "turn") {
  const message = arg("message", "");
  if (!message) throw new Error("--message is required");
  await sendTurn(message);
} else if (command === "inspect") {
  const state = loadState();
  console.log(JSON.stringify({ turns: state.turns, durable: await readDurable(state.auth.user_id) }, null, 2));
} else if (command === "report") {
  buildReport();
} else if (command === "cleanup") {
  await cleanup();
} else {
  throw new Error("usage: node tmp/manual_state_potion_qa.mjs <start|turn|inspect|report|cleanup> --run-id <id> --potion <type> [--message <text>]");
}

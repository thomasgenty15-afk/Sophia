import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runRoot = path.join(root, "tmp", "phase2-real-qa");
fs.mkdirSync(runRoot, { recursive: true });

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
const supabaseUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL ||
  "http://127.0.0.1:54321").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
if (!anonKey || !serviceKey) {
  throw new Error("Missing local Supabase keys from supabase/.env");
}

const args = process.argv.slice(2);
const command = args[0] ?? "";

function argValue(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = args.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1] ?? fallback;
  return fallback;
}

function requireArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function jsonFetch(url, options = {}, timeoutMs = 180000) {
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
  if (!response.ok) {
    const error = new Error(`${response.status} ${url}: ${text}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body, text };
}

async function rest(pathPart, options = {}) {
  return await jsonFetch(`${supabaseUrl}/rest/v1${pathPart}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function insert(pathPart, rows) {
  const result = await rest(pathPart, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  return result.body;
}

async function select(pathPart) {
  return (await rest(pathPart, { method: "GET" })).body;
}

async function patch(pathPart, row) {
  return await rest(pathPart, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
}

function statePath(runId) {
  return path.join(runRoot, runId, "state.json");
}

function loadState(runId) {
  return JSON.parse(fs.readFileSync(statePath(runId), "utf8"));
}

function saveState(state) {
  const dir = path.dirname(statePath(state.run_id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(state.run_id), `${JSON.stringify(state, null, 2)}\n`);
}

function safeEmailPart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 52);
}

async function createAuthUser(runId) {
  const email = `qa-phase2-${safeEmailPart(runId)}@example.com`;
  const password = `Qa1!${randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona: "qa-phase2",
    run_id: runId,
    created_by: "phase2_real_qa_driver",
  };
  const created = await jsonFetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
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
  const userId = String(created.body?.id ?? "");
  if (!userId) throw new Error(`Auth user creation failed for ${email}`);
  return { user_id: userId, email, password };
}

async function signIn(state) {
  const token = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({
      email: state.auth.email,
      password: state.auth.password,
    }),
  });
  const accessToken = String(token.body?.access_token ?? "");
  if (!accessToken) throw new Error("Sign in failed");
  return accessToken;
}

function planItem(base, overrides) {
  return {
    id: randomUUID(),
    user_id: base.user_id,
    cycle_id: base.cycle_id,
    transformation_id: base.transformation_id,
    plan_id: base.plan_id,
    dimension: "missions",
    kind: "task",
    status: "active",
    title: "",
    description: null,
    tracking_type: "boolean",
    activation_order: null,
    activation_condition: null,
    current_habit_state: null,
    support_mode: null,
    support_function: null,
    target_reps: null,
    current_reps: null,
    cadence_label: null,
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    payload: { fixture: "phase2_real_qa" },
    created_at: base.now,
    updated_at: base.now,
    activated_at: base.now,
    completed_at: null,
    ...overrides,
  };
}

async function seedPlanAndMemory(state) {
  const now = "2026-05-15T09:30:00.000Z";
  const ids = {
    cycle_id: randomUUID(),
    previous_transformation_id: randomUUID(),
    transformation_id: randomUUID(),
    plan_id: randomUUID(),
    focus_item_id: randomUUID(),
    focus_previous_item_id: randomUUID(),
    walk_item_id: randomUUID(),
    mission_item_id: randomUUID(),
    clarification_item_id: randomUUID(),
  };
  const base = { user_id: state.auth.user_id, ...ids, now };
  await insert("/user_cycles", {
    id: ids.cycle_id,
    user_id: state.auth.user_id,
    status: "active",
    raw_intake_text:
      "Fixture QA phase 2 pour tester memoire action, handoff niveau et suppression daily/weekly.",
    intake_language: "fr",
    duration_months: 1,
    active_transformation_id: null,
    version: 1,
    created_at: now,
    updated_at: now,
  });
  await insert("/user_transformations", [
    {
      id: ids.previous_transformation_id,
      cycle_id: ids.cycle_id,
      priority_order: 1,
      status: "completed",
      title: "Sortir de l'inertie",
      internal_summary:
        "Le user a appris que les actions passent mieux avec un lancement tres court.",
      user_summary:
        "Le niveau precedent a montre que les petits demarrages marchent mieux.",
      success_definition: "Utiliser des premiers gestes simples.",
      main_constraint: "Eviter les gros blocs abstraits.",
      questionnaire_schema: { fixture: true },
      questionnaire_answers: { source: "phase2_real_qa" },
      completion_summary: "Le premier geste concret a mieux marche que les grandes intentions.",
      handoff_payload: { fixture: true },
      created_at: "2026-05-01T09:30:00.000Z",
      updated_at: "2026-05-08T18:30:00.000Z",
      activated_at: "2026-05-01T09:30:00.000Z",
      completed_at: "2026-05-08T18:30:00.000Z",
    },
    {
      id: ids.transformation_id,
      cycle_id: ids.cycle_id,
      priority_order: 2,
      status: "active",
      title: "Installer le rythme utile",
      internal_summary:
        "Niveau QA actif pour observer le retrieval action et level.",
      user_summary: "Installer un rythme plus fiable sans durcir le plan.",
      success_definition: "Tenir les habitudes sans friction de demarrage excessive.",
      main_constraint: "Ne pas multiplier les actions quand l'energie baisse.",
      questionnaire_schema: { fixture: true },
      questionnaire_answers: { source: "phase2_real_qa" },
      completion_summary: null,
      handoff_payload: { fixture: true },
      created_at: now,
      updated_at: now,
      activated_at: now,
      completed_at: null,
    },
  ]);
  await patch(`/user_cycles?id=eq.${ids.cycle_id}`, {
    active_transformation_id: ids.transformation_id,
    updated_at: now,
  });
  await insert("/user_plans_v2", {
    id: ids.plan_id,
    user_id: state.auth.user_id,
    cycle_id: ids.cycle_id,
    transformation_id: ids.transformation_id,
    status: "active",
    version: 1,
    title: "Plan QA phase 2",
    content: { fixture: "phase2_real_qa" },
    generation_attempts: 1,
    last_generation_reason: "phase2_real_qa_seed",
    activated_at: now,
    completed_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  });
  const items = [
    planItem(base, {
      id: ids.focus_item_id,
      dimension: "habits",
      kind: "habit",
      title: "Session focus courte",
      description: "Faire une session de travail focus sans chercher le setup parfait.",
      tracking_type: "boolean",
      activation_order: 1,
      current_habit_state: "active_building",
      target_reps: 4,
      current_reps: 1,
      cadence_label: "4 fois cette semaine",
      scheduled_days: ["mon", "tue", "thu", "fri"],
      time_of_day: "matin",
      payload: {
        fixture: "phase2_real_qa",
        action_family_key: "habit:session_focus",
      },
    }),
    planItem(base, {
      id: ids.walk_item_id,
      dimension: "habits",
      kind: "habit",
      title: "Marche de decompression",
      description: "Marcher dix minutes pour sortir de la pression.",
      tracking_type: "boolean",
      activation_order: 2,
      current_habit_state: "active_building",
      target_reps: 3,
      current_reps: 0,
      cadence_label: "3 fois cette semaine",
      scheduled_days: ["mon", "wed", "fri"],
      time_of_day: "soir",
      payload: {
        fixture: "phase2_real_qa",
        action_family_key: "habit:marche_decompression",
      },
    }),
    planItem(base, {
      id: ids.mission_item_id,
      dimension: "missions",
      kind: "task",
      title: "Bloquer les creneaux de la semaine",
      description: "Mettre les deux creneaux importants dans le calendrier.",
      tracking_type: "boolean",
      activation_order: 3,
      cadence_label: "one-shot",
    }),
    planItem(base, {
      id: ids.clarification_item_id,
      dimension: "clarifications",
      kind: "task",
      title: "Clarifier le premier pas du dossier",
      description: "Choisir la prochaine action concrete du dossier administratif.",
      tracking_type: "text",
      activation_order: 4,
      cadence_label: "one-shot",
    }),
  ];
  await insert("/user_plan_items", items);

  const memoryRows = [
    {
      id: randomUUID(),
      user_id: state.auth.user_id,
      kind: "action_observation",
      status: "active",
      content_text:
        "Sur Session focus courte, le user demarre mieux quand il ouvre directement un fichier deja pret et lance un minuteur de 12 minutes.",
      normalized_summary:
        "Session focus courte marche mieux avec fichier deja pret et minuteur 12 minutes.",
      domain_keys: ["habitudes.execution"],
      confidence: 0.82,
      importance_score: 0.72,
      sensitivity_level: "normal",
      sensitivity_categories: [],
      requires_user_initiated: false,
      observed_at: "2026-05-13T08:15:00.000Z",
      canonical_key: `qa_action_exact:${ids.focus_item_id}`,
      metadata: {
        memory_type: "action_execution_profile",
        source: "phase2_real_qa_seed",
      },
    },
    {
      id: randomUUID(),
      user_id: state.auth.user_id,
      kind: "action_observation",
      status: "active",
      content_text:
        "Pattern famille session_focus: quand la cible augmente, garder un demarrage sous 15 minutes evite que l'habitude devienne intimidante.",
      normalized_summary:
        "Famille session_focus: demarrage sous 15 minutes utile quand la cible augmente.",
      domain_keys: ["habitudes.execution"],
      confidence: 0.78,
      importance_score: 0.66,
      sensitivity_level: "normal",
      sensitivity_categories: [],
      requires_user_initiated: false,
      observed_at: "2026-05-10T08:15:00.000Z",
      canonical_key: "qa_action_family:habit:session_focus",
      metadata: {
        memory_type: "action_execution_profile",
        source: "phase2_real_qa_seed",
      },
    },
    {
      id: randomUUID(),
      user_id: state.auth.user_id,
      kind: "statement",
      status: "active",
      content_text:
        "Niveau precedent Sortir de l'inertie: le user progresse mieux quand Sophia garde les demandes en une seule prochaine action et evite de reproposer des gros blocs abstraits.",
      normalized_summary:
        "Handoff niveau precedent: une seule prochaine action, eviter les gros blocs abstraits.",
      domain_keys: ["objectifs.transformation", "habitudes.execution"],
      confidence: 0.74,
      importance_score: 0.61,
      sensitivity_level: "normal",
      sensitivity_categories: [],
      requires_user_initiated: false,
      observed_at: "2026-05-08T18:30:00.000Z",
      canonical_key: `level_execution_handoff:${ids.previous_transformation_id}`,
      metadata: {
        memory_type: "level_execution_handoff",
        source: "phase2_real_qa_seed",
        previous_level_id: ids.previous_transformation_id,
        previous_transformation_id: ids.previous_transformation_id,
        next_level_id: ids.transformation_id,
        next_transformation_id: ids.transformation_id,
      },
    },
  ];
  await insert("/memory_items", memoryRows);
  await insert("/memory_item_actions", [
    {
      user_id: state.auth.user_id,
      memory_item_id: memoryRows[0].id,
      plan_item_id: ids.focus_item_id,
      aggregation_kind: "single_occurrence",
      confidence: 0.82,
      observation_window_start: "2026-05-13T00:00:00.000Z",
      observation_window_end: "2026-05-13T23:59:59.000Z",
      metadata: { action_family_key: "habit:session_focus" },
    },
    {
      user_id: state.auth.user_id,
      memory_item_id: memoryRows[1].id,
      plan_item_id: ids.focus_previous_item_id,
      aggregation_kind: "possible_pattern",
      confidence: 0.78,
      observation_window_start: "2026-05-01T00:00:00.000Z",
      observation_window_end: "2026-05-10T23:59:59.000Z",
      metadata: { action_family_key: "habit:session_focus" },
    },
  ]);
  state.seed = {
    ...ids,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      dimension: item.dimension,
      action_family_key: item.payload?.action_family_key ?? null,
    })),
    memory_items: memoryRows.map((item) => ({
      id: item.id,
      kind: item.kind,
      canonical_key: item.canonical_key,
      metadata: item.metadata,
    })),
  };
}

async function init() {
  const runId = argValue("run-id") ||
    `phase2-real-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const state = {
    run_id: runId,
    created_at: new Date().toISOString(),
    supabase_url: supabaseUrl,
    auth: await createAuthUser(runId),
    scenarios: {},
  };
  await seedPlanAndMemory(state);
  saveState(state);
  console.log(JSON.stringify({
    run_id: state.run_id,
    state_path: path.relative(root, statePath(state.run_id)),
    user_id: state.auth.user_id,
    seeded_items: state.seed.items,
    seeded_memory: state.seed.memory_items,
  }, null, 2));
}

function summarizeTrace(trace) {
  const route = trace?.route_decision ?? {};
  const frame = trace?.turn_frame ?? {};
  const memory = frame?.memory_plan ?? null;
  const loaded = trace?.memory_v2_active_loader ?? trace?.memory_loader ?? null;
  return {
    response_owner: trace?.response_owner ?? route?.response_owner ?? null,
    selected_handler: route?.selected_handler ?? null,
    reason_code: route?.reason_code ?? null,
    active_flow_arbitration: route?.active_flow_arbitration ?? null,
    safety: frame?.safety ?? null,
    action_reference: frame?.action_reference ?? null,
    level_reference: frame?.level_reference ?? null,
    memory_plan: memory,
    memory_loader: loaded
      ? {
        retrieval_mode: loaded.retrieval_mode ?? null,
        loaded_scope_counts: loaded.metrics?.loaded_scope_counts ?? null,
        payload_item_ids: loaded.payload_item_ids ?? null,
        loader_plan_reason: loaded.metrics?.loader_plan_reason ?? null,
      }
      : null,
    direct_effects: frame?.direct_effects ?? [],
    tool_skill_intents: frame?.tool_skill_intents ?? [],
    tool_skill_opportunity: frame?.tool_skill_opportunity ?? null,
    skill_signals: frame?.skill_signals ?? null,
    active_skill_state: trace?.active_skill_state ?? null,
    executed_tools: trace?.executed_tools ?? route?.executed_tools ?? [],
    pending_confirmation: trace?.pending_tool_skill_confirmation ?? null,
  };
}

async function send() {
  const runId = requireArg("run-id");
  const scenario = requireArg("scenario");
  const message = requireArg("message");
  const channel = argValue("channel", "web") === "whatsapp" ? "whatsapp" : "web";
  const state = loadState(runId);
  const scope = `phase2-real-${runId}-${scenario}`;
  const token = await signIn(state);
  const scenarioState = state.scenarios[scenario] ?? { turns: [] };
  const turnNumber = scenarioState.turns.length + 1;
  const requestId = `${runId}-${scenario}-t${String(turnNumber).padStart(2, "0")}`;
  const result = await jsonFetch(`${supabaseUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: state.auth.user_id,
      channel,
      scope,
      content: message,
      disable_debounce: true,
      force_full_ai: true,
    }),
  });
  const body = result.body ?? {};
  const response = body.response ?? {};
  const assistant = String(response.content ?? "").trim();
  const trace = summarizeTrace(body.conversation_turn_trace ?? null);
  const row = {
    turn: turnNumber,
    request_id: requestId,
    status: result.status,
    ok: body.ok ?? null,
    empty_response: body.empty_response ?? null,
    aborted: body.aborted ?? null,
    user: message,
    assistant,
    trace,
  };
  scenarioState.turns.push(row);
  state.scenarios[scenario] = scenarioState;
  saveState(state);
  console.log(JSON.stringify(row, null, 2));
}

async function setActiveSkill() {
  const runId = requireArg("run-id");
  const scenario = requireArg("scenario");
  const skillId = requireArg("skill-id");
  const state = loadState(runId);
  const scope = `phase2-real-${runId}-${scenario}`;
  const existing = await select(
    `/user_chat_states?user_id=eq.${state.auth.user_id}&scope=eq.${encodeURIComponent(scope)}&select=user_id,scope,temp_memory&limit=1`,
  );
  const temp = {
    ...((existing?.[0]?.temp_memory && typeof existing[0].temp_memory === "object")
      ? existing[0].temp_memory
      : {}),
    __active_skill_state: {
      version: 1,
      skill_id: skillId,
      previous_skill_id: null,
      turn_count: 0,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      handoff_stack: [],
    },
  };
  if (existing?.[0]) {
    await patch(
      `/user_chat_states?user_id=eq.${state.auth.user_id}&scope=eq.${encodeURIComponent(scope)}`,
      { temp_memory: temp },
    );
  } else {
    await insert("/user_chat_states", {
      user_id: state.auth.user_id,
      scope,
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      unprocessed_msg_count: 0,
      temp_memory: temp,
    });
  }
  console.log(JSON.stringify({
    run_id: runId,
    scenario,
    scope,
    active_skill_state: temp.__active_skill_state,
  }, null, 2));
}

async function inspect() {
  const runId = requireArg("run-id");
  const state = loadState(runId);
  const userId = state.auth.user_id;
  const [messages, entries, memories, traces, memoryEvents] = await Promise.all([
    select(
      `/chat_messages?user_id=eq.${userId}&select=id,scope,role,content,metadata,created_at&order=created_at.asc&limit=200`,
    ),
    select(
      `/user_plan_item_entries?user_id=eq.${userId}&select=id,plan_item_id,entry_kind,outcome,value_text,metadata,effective_at,created_at&order=created_at.asc&limit=100`,
    ),
    select(
      `/memory_items?user_id=eq.${userId}&select=id,kind,status,content_text,metadata,canonical_key,observed_at&order=created_at.asc&limit=100`,
    ),
    select(
      `/conversation_turn_traces?user_id=eq.${userId}&select=*&order=ts.asc&limit=200`,
    ),
    select(
      `/memory_observability_events?user_id=eq.${userId}&select=event_name,source_component,payload,created_at&order=created_at.asc&limit=300`,
    ),
  ]);
  const out = {
    run_id: runId,
    user_id: userId,
    scenarios: state.scenarios,
    db: {
      chat_messages: messages,
      entries,
      memories,
      traces,
      memory_events: memoryEvents,
    },
  };
  const outPath = path.join(path.dirname(statePath(runId)), "inspect.json");
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({
    run_id: runId,
    inspect_path: path.relative(root, outPath),
    chat_messages: messages.length,
    entries: entries.length,
    memories: memories.length,
    traces: traces.length,
    memory_events: memoryEvents.length,
  }, null, 2));
}

if (command === "init") await init();
else if (command === "send") await send();
else if (command === "set-active-skill") await setActiveSkill();
else if (command === "inspect") await inspect();
else {
  console.error(
    "usage: node tmp/phase2_real_qa_driver.mjs init|send|set-active-skill|inspect ...",
  );
  process.exit(2);
}

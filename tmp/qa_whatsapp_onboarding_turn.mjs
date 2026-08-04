import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const BASE_URL = process.env.SOPHIA_LOCAL_URL || "http://127.0.0.1:54321";
const PASSWORD = "1234567";
const mode = process.argv[2] || "";
const runId = argValue("run-id");
const text = argValue("text");
const outDir = runId
  ? path.join(root, "tmp", "qa-whatsapp-onboarding", runId)
  : "";
const stateFile = outDir ? path.join(outDir, "state.json") : "";

function argValue(name, fallback = "") {
  const eq = `--${name}=`;
  const byEq = process.argv.find((arg) => arg.startsWith(eq));
  if (byEq) return byEq.slice(eq.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

function base64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest(
    "base64",
  );
  return `${header}.${body}.${
    sig.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
  }`;
}

function localJwt(role) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: "supabase",
    ref: "local",
    role,
    iat: now - 60,
    exp: now + 60 * 60 * 24 * 365,
  }, "super-secret-jwt-token-with-at-least-32-characters-long");
}

function loadSupabaseStatus() {
  try {
    return JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch {
    return {};
  }
}

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: res.status, ok: res.ok, body, text };
}

function headers(key, bearer = key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    ...extra,
  };
}

function readState() {
  if (!stateFile || !fs.existsSync(stateFile)) return null;
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

async function rest(serviceKey, tableAndQuery, options = {}) {
  return await request(`/rest/v1/${tableAndQuery}`, {
    method: options.method ?? "GET",
    headers: headers(serviceKey, serviceKey, {
      accept: "application/json",
      prefer: options.prefer ?? "return=representation",
      ...(options.headers ?? {}),
    }),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function select(serviceKey, query) {
  const res = await rest(serviceKey, query, { prefer: undefined });
  return {
    status: res.status,
    ok: res.ok,
    body: res.body,
  };
}

async function insert(serviceKey, table, row) {
  const res = await rest(serviceKey, table, {
    method: "POST",
    body: row,
  });
  if (!res.ok) {
    throw new Error(`insert_${table}_failed ${res.status} ${JSON.stringify(res.body)}`);
  }
  return Array.isArray(res.body) ? res.body[0] : res.body;
}

async function patch(serviceKey, tableAndQuery, patch) {
  const res = await rest(serviceKey, tableAndQuery, {
    method: "PATCH",
    body: patch,
  });
  if (!res.ok) {
    throw new Error(`patch_${tableAndQuery}_failed ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function del(serviceKey, tableAndQuery) {
  return await rest(serviceKey, tableAndQuery, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

function latestAssistant(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  return rows.find((row) => row.role === "assistant") ?? null;
}

async function snapshot(state) {
  const uid = encodeURIComponent(state.user_id);
  const profile = await select(
    state.service_key,
    `profiles?id=eq.${uid}&select=id,email,phone_number,whatsapp_state,onboarding_completed,whatsapp_opted_in,timezone`,
  );
  const messages = await select(
    state.service_key,
    `chat_messages?user_id=eq.${uid}&scope=eq.whatsapp&select=id,role,content,metadata,created_at&order=created_at.desc&limit=8`,
  );
  const facts = await select(
    state.service_key,
    `user_profile_facts?user_id=eq.${uid}&select=key,value,source_type,reason,updated_at&order=updated_at.desc`,
  );
  const plans = await select(
    state.service_key,
    `user_plans_v2?user_id=eq.${uid}&select=id,title,status,version,activated_at,created_at&order=created_at.desc&limit=5`,
  );
  const items = await select(
    state.service_key,
    `user_plan_items?user_id=eq.${uid}&select=id,title,status,current_reps,target_reps,plan_id,activation_order,created_at&order=activation_order.asc`,
  );
  const entries = await select(
    state.service_key,
    `user_plan_item_entries?user_id=eq.${uid}&select=id,plan_item_id,entry_kind,value_text,effective_at,created_at&order=created_at.desc&limit=10`,
  );
  const userState = await select(
    state.service_key,
    `user_chat_states?user_id=eq.${uid}&scope=eq.whatsapp&select=current_mode,temp_memory,updated_at`,
  );
  return { profile, messages, facts, plans, items, entries, userState };
}

async function init() {
  if (!runId) throw new Error("--run-id is required");
  const status = loadSupabaseStatus();
  const anonKey = status.ANON_KEY || status.anon_key || localJwt("anon");
  const serviceKey = status.SERVICE_ROLE_KEY || status.service_role_key ||
    localJwt("service_role");
  const email = `qa-wa-onb-${runId}-${Date.now()}@example.com`;
  const signup = await request("/auth/v1/signup", {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({
      email,
      password: PASSWORD,
      data: { is_test_persona: true, qa_run_id: runId },
    }),
  });
  if (!signup.ok && !String(signup.body?.message ?? "").includes("already")) {
    throw new Error(`signup_failed ${signup.status} ${JSON.stringify(signup.body)}`);
  }
  const login = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!login.ok || !login.body?.access_token) {
    throw new Error(`login_failed ${login.status} ${JSON.stringify(login.body)}`);
  }
  const userId = login.body.user?.id;
  const nowIso = new Date().toISOString();
  const phoneNumber = `+1555${String(Date.now()).slice(-7)}`;
  await patch(serviceKey, `profiles?id=eq.${encodeURIComponent(userId)}`, {
    email,
    phone_number: phoneNumber,
    phone_verified_at: nowIso,
    phone_invalid: false,
    whatsapp_opted_in: true,
    whatsapp_state: "awaiting_plan_finalization",
    whatsapp_state_updated_at: nowIso,
    onboarding_completed: true,
    timezone: "Europe/Paris",
    full_name: "QA Onboarding",
  });
  const state = {
    run_id: runId,
    base_url: BASE_URL,
    email,
    phone_number: phoneNumber,
    user_id: userId,
    anon_key: anonKey,
    service_key: serviceKey,
    access_token: login.body.access_token,
    created_at: nowIso,
    turns: [],
    touched: { cycle_ids: [], transformation_ids: [], plan_ids: [], item_ids: [] },
  };
  writeState(state);
  console.log(JSON.stringify({
    run_id: runId,
    email,
    user_id: userId,
    state_file: path.relative(root, stateFile),
  }, null, 2));
}

async function seedPlan() {
  const state = readState();
  if (!state) throw new Error(`missing state for ${runId}`);
  const nowIso = new Date().toISOString();
  const cycle = await insert(state.service_key, "user_cycles", {
    user_id: state.user_id,
    status: "active",
    raw_intake_text:
      "QA onboarding: reprendre des contacts professionnels sans se disperser.",
    intake_language: "fr",
    duration_months: 1,
  });
  const transformation = await insert(state.service_key, "user_transformations", {
    cycle_id: cycle.id,
    priority_order: 1,
    title: `Relancer mes contacts pro ${runId}`,
    status: "active",
    internal_summary:
      "Fixture QA onboarding pour tester la reprise WhatsApp vers un plan actif.",
    user_summary:
      "Le user veut relancer quelques contacts professionnels avec des actions simples.",
    success_definition:
      "Avoir une première liste de contacts et envoyer un message court.",
    main_constraint:
      "La dispersion et le perfectionnisme rendent la reprise trop lourde.",
    questionnaire_answers: {
      qa_run_id: runId,
      preferred_pace: "actions courtes",
    },
    handoff_payload: {
      qa_run_id: runId,
      onboarding_v2: {
        questionnaire_context: [
          "Le user veut reprendre doucement des contacts professionnels.",
          "Il veut éviter la dispersion et garder des actions courtes.",
        ],
      },
    },
  });
  const plan = await insert(state.service_key, "user_plans_v2", {
    user_id: state.user_id,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    status: "active",
    version: 1,
    title: "Routine contacts pro",
    activated_at: nowIso,
    content: {
      source: "qa_whatsapp_onboarding_turn",
      summary: "Relancer quelques contacts professionnels sans se surcharger.",
      strategy: {
        identity_shift: "Je redeviens quelqu'un qui entretient son réseau simplement.",
        core_principle: "Des messages courts valent mieux qu'une grande relance parfaite.",
        success_definition: "Envoyer un premier message simple à un contact prioritaire.",
      },
    },
    generation_input_snapshot: { qa_run_id: runId },
  });
  const itemRows = [
    {
      title: "Lister cinq contacts prioritaires",
      description: "Noter cinq personnes à recontacter sans rédiger encore le message parfait.",
      activation_order: 1,
    },
    {
      title: "Envoyer un message simple à une personne",
      description: "Choisir une personne et envoyer une phrase courte de reprise de contact.",
      activation_order: 2,
    },
  ];
  const items = [];
  for (const row of itemRows) {
    const item = await insert(state.service_key, "user_plan_items", {
      user_id: state.user_id,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      dimension: "missions",
      kind: "task",
      status: "active",
      title: row.title,
      description: row.description,
      tracking_type: "boolean",
      activation_order: row.activation_order,
      target_reps: 1,
      current_reps: 0,
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      time_of_day: "anytime",
      payload: { qa_run_id: runId, source: "qa_whatsapp_onboarding_turn" },
      activated_at: nowIso,
    });
    items.push(item);
  }
  await patch(state.service_key, `user_cycles?id=eq.${cycle.id}`, {
    active_transformation_id: transformation.id,
  });
  state.touched.cycle_ids.push(cycle.id);
  state.touched.transformation_ids.push(transformation.id);
  state.touched.plan_ids.push(plan.id);
  state.touched.item_ids.push(...items.map((item) => item.id));
  state.seeded_plan = { cycle_id: cycle.id, transformation_id: transformation.id, plan_id: plan.id, item_ids: items.map((item) => item.id) };
  writeState(state);
  console.log(JSON.stringify(state.seeded_plan, null, 2));
}

async function send() {
  if (!runId || !text) throw new Error("--run-id and --text are required");
  const state = readState();
  if (!state) throw new Error(`missing state for ${runId}`);
  const turnNumber = state.turns.length + 1;
  const requestId = `${runId}-t${String(turnNumber).padStart(2, "0")}`;
  const waMessageId = `wamid.${runId}.${turnNumber}.${Date.now()}`;
  const from = String(state.phone_number ?? "").replace(/^\+/, "") ||
    "15550000000";
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "qa-entry",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "15559999999",
            phone_number_id: "qa-phone-number-id",
          },
          contacts: [{
            profile: { name: "QA Onboarding" },
            wa_id: from,
          }],
          messages: [{
            from,
            id: waMessageId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: text },
            sophia_user_id: state.user_id,
          }],
        },
      }],
    }],
  };
  const response = await request("/functions/v1/whatsapp-webhook", {
    method: "POST",
    headers: headers(state.anon_key, state.anon_key, {
      "x-request-id": requestId,
      "x-sophia-wa-transport": "loopback",
    }),
    body: JSON.stringify(payload),
  });
  const snap = await snapshot(state);
  const assistant = latestAssistant(snap.messages.body);
  const metadata = assistant?.metadata ?? {};
  const turn = {
    turn: turnNumber,
    request_id: requestId,
    user: text,
    http_status: response.status,
    ok: response.ok,
    response_body: response.body,
    assistant: assistant?.content ?? "",
    assistant_metadata: metadata,
    snapshot: snap,
    sent_at: new Date().toISOString(),
  };
  state.turns.push(turn);
  state.updated_at = new Date().toISOString();
  writeState(state);
  console.log(JSON.stringify({
    turn: turnNumber,
    http_status: response.status,
    ok: response.ok,
    transport: response.body?.transport ?? null,
    purpose: response.body?.purpose ?? null,
    assistant: turn.assistant,
    trace_short: {
      profile_state: snap.profile.body?.[0]?.whatsapp_state ?? null,
      selected_handler: metadata?.selected_handler ?? metadata?.trace?.route_decision?.selected_handler ?? null,
      route_reason: metadata?.reason_code ?? metadata?.trace?.route_decision?.reason_code ?? null,
      flow_action: metadata?.flow_action ?? null,
      visible_task: metadata?.visible_task ?? null,
      next_whatsapp_state: metadata?.next_whatsapp_state ?? null,
      allow_track_progress_plan_item: metadata?.allow_track_progress_plan_item ?? null,
      facts: Array.isArray(snap.facts.body) ? snap.facts.body.map((fact) => fact.key) : [],
      plan_entries_count: Array.isArray(snap.entries.body) ? snap.entries.body.length : null,
    },
    state_file: path.relative(root, stateFile),
  }, null, 2));
}

async function cleanup() {
  const state = readState();
  if (!state) throw new Error(`missing state for ${runId}`);
  const uid = encodeURIComponent(state.user_id);
  const cleanup = [];
  const tablesByUser = [
    "chat_messages",
    "whatsapp_outbound_messages",
    "whatsapp_inbound_dedup",
    "user_profile_facts",
    "user_chat_states",
    "scheduled_checkins",
    "user_plan_item_entries",
    "user_plan_items",
    "user_plans_v2",
    "memory_items",
    "user_topic_memories",
    "user_memories",
  ];
  for (const table of tablesByUser) {
    const res = await del(state.service_key, `${table}?user_id=eq.${uid}`);
    cleanup.push({ table, status: res.status, ok: res.ok });
  }
  for (const id of state.touched?.cycle_ids ?? []) {
    const res = await del(state.service_key, `user_cycles?id=eq.${encodeURIComponent(id)}`);
    cleanup.push({ table: "user_cycles", id, status: res.status, ok: res.ok });
  }
  for (const id of state.touched?.transformation_ids ?? []) {
    const res = await del(state.service_key, `user_transformations?id=eq.${encodeURIComponent(id)}`);
    cleanup.push({ table: "user_transformations", id, status: res.status, ok: res.ok });
  }
  const authDelete = await request(`/auth/v1/admin/users/${state.user_id}`, {
    method: "DELETE",
    headers: headers(state.service_key, state.service_key),
  });
  cleanup.push({ table: "auth.users", status: authDelete.status, ok: authDelete.ok });
  state.cleanup = cleanup;
  state.cleaned_at = new Date().toISOString();
  writeState(state);
  console.log(JSON.stringify({ run_id: runId, cleanup }, null, 2));
}

if (mode === "init") {
  await init();
} else if (mode === "seed-plan") {
  await seedPlan();
} else if (mode === "send") {
  await send();
} else if (mode === "cleanup") {
  await cleanup();
} else {
  throw new Error(
    "usage: node tmp/qa_whatsapp_onboarding_turn.mjs <init|seed-plan|send|cleanup> --run-id <id> [--text <message>]",
  );
}

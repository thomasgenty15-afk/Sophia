import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const connectionName = process.env.QA_CONNECTION_NAME;
if (!connectionName) throw new Error("missing QA_CONNECTION_NAME");

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const connectionPath = path.join(
  root,
  `tests/real-personas/qa-skill/connections/${connectionName}.json`,
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const userId = String(connection.user_id ?? "").trim();
if (!userId) throw new Error("missing user_id in connection");

function localStatus() {
  try {
    return JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return {};
  }
}

const status = localStatus();
const supabaseUrl = process.env.SUPABASE_URL || status.API_URL ||
  "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!serviceRoleKey) throw new Error("missing local service role key");

const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

async function request(tablePath, options = {}) {
  const response = await fetch(`${base}${tablePath}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${tablePath} ${response.status} ${
        JSON.stringify(body)
      }`,
    );
  }
  return body;
}

const now = "2026-05-06T09:30:00.000Z";
const ids = {
  cycle: randomUUID(),
  transformation: randomUUID(),
  plan: randomUUID(),
  itemWalk: randomUUID(),
  itemDeck: randomUUID(),
  itemMail: randomUUID(),
  metric: randomUUID(),
};

function planItem(overrides) {
  return {
    id: randomUUID(),
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: ids.transformation,
    plan_id: ids.plan,
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
    payload: { fixture: "qa-all-skills-ai-stress-plan" },
    created_at: now,
    updated_at: now,
    activated_at: now,
    completed_at: null,
    ...overrides,
  };
}

await request("/user_cycles", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([{
    id: ids.cycle,
    user_id: userId,
    status: "active",
    raw_intake_text:
      "Fixture QA temporaire pour tester les progress logs, les operations et les handoffs conversationnels.",
    intake_language: "fr",
    duration_months: 1,
    active_transformation_id: null,
    version: 1,
    created_at: now,
    updated_at: now,
  }]),
});

await request("/user_transformations", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([{
    id: ids.transformation,
    cycle_id: ids.cycle,
    priority_order: 1,
    status: "active",
    title: "QA stress conversationnel",
    internal_summary:
      "Plan temporaire local pour tester les always-on tools et operations sans toucher aux vrais utilisateurs.",
    user_summary:
      "Avancer avec des petites actions observables pendant les runs QA.",
    success_definition:
      "Les actions peuvent être discutées, ajustées et loggées sans faux side effect.",
    main_constraint:
      "Ne pas ecrire de progres sans intention passée explicite et cible claire.",
    questionnaire_schema: { fixture: true },
    questionnaire_answers: { source: "qa-skill" },
    completion_summary: null,
    handoff_payload: { fixture: true },
    created_at: now,
    updated_at: now,
    activated_at: now,
    completed_at: null,
  }]),
});

await request(`/user_cycles?id=eq.${ids.cycle}`, {
  method: "PATCH",
  body: JSON.stringify({ active_transformation_id: ids.transformation }),
});

await request("/user_plans_v2", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([{
    id: ids.plan,
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: ids.transformation,
    status: "active",
    version: 1,
    title: "Plan QA stress",
    content: {
      fixture: "qa-all-skills-ai-stress-plan",
      items: [ids.itemWalk, ids.itemDeck, ids.itemMail],
    },
    generation_attempts: 1,
    last_generation_reason: "qa_seed",
    activated_at: now,
    completed_at: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
  }]),
});

await request("/user_plan_items", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([
    planItem({
      id: ids.itemWalk,
      dimension: "habits",
      kind: "habit",
      title: "marche",
      description: "Marcher dix minutes pour relancer doucement.",
      tracking_type: "boolean",
      activation_order: 1,
      current_habit_state: "active_building",
      target_reps: 3,
      current_reps: 0,
      cadence_label: "3 fois cette semaine",
      scheduled_days: ["mon", "wed", "fri"],
      time_of_day: "matin",
    }),
    planItem({
      id: ids.itemDeck,
      title: "Préparer la présentation client",
      description:
        "Ouvrir le document et remplir seulement les trois titres essentiels.",
      tracking_type: "milestone",
      activation_order: 2,
      cadence_label: "cette semaine",
    }),
    planItem({
      id: ids.itemMail,
      title: "Envoyer le mail de cadrage",
      description:
        "Envoyer une version courte et honnête sans chercher la formulation parfaite.",
      tracking_type: "boolean",
      activation_order: 3,
      cadence_label: "one-shot",
    }),
  ]),
});

await request("/user_metrics", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([{
    id: ids.metric,
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: null,
    scope: "cycle",
    kind: "north_star",
    status: "active",
    title: "Avancement QA",
    unit: "%",
    current_value: "10",
    target_value: "100",
    payload: { fixture: true },
    created_at: now,
    updated_at: now,
  }]),
});

const items = await request(
  `/user_plan_items?user_id=eq.${
    encodeURIComponent(userId)
  }&select=id,title,status,tracking_type&order=activation_order.asc`,
);

console.log(JSON.stringify(
  {
    ok: true,
    connection_name: connectionName,
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: ids.transformation,
    plan_id: ids.plan,
    items,
  },
  null,
  2,
));

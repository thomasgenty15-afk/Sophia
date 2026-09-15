import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const command = String(process.argv[2] ?? "").trim();
const runId = "adjust-plan-local-real-r2";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const connection = JSON.parse(
  fs.readFileSync(
    `${root}/tests/real-personas/qa-skill/connections/connection_adjust-plan-action-20260601-r1.json`,
    "utf8",
  ),
);
const userId = connection.user_id;

function localStatus() {
  const raw = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw);
}

const status = localStatus();
const apiUrl = status.API_URL ?? "http://127.0.0.1:54321";
const serviceKey = status.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("missing service key");

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}/rest/v1${path}`, {
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
    throw new Error(`${options.method ?? "GET"} ${path} ${response.status} ${text}`);
  }
  return body;
}

const ids = {
  cycle: "a2206a9c-0000-4000-8000-000000000001",
  transformation: "a2206a9c-0000-4000-8000-000000000002",
  plan: "a2206a9c-0000-4000-8000-000000000003",
  itemPrepare: "a2206a9c-0000-4000-8000-000000000004",
  itemSas: "a2206a9c-0000-4000-8000-000000000005",
};
const scope = `qa-adjust-plan-handoff-real-20260601-${runId}`;

async function cleanup() {
  await request(
    `/chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.${encodeURIComponent(scope)}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(
    `/conversation_turn_traces?user_id=eq.${encodeURIComponent(userId)}&turn_id=like.${encodeURIComponent(`${scope}%`)}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(
    `/user_chat_states?user_id=eq.${encodeURIComponent(userId)}&scope=eq.${encodeURIComponent(scope)}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(
    `/user_plan_items?user_id=eq.${encodeURIComponent(userId)}&payload->>qa_run_id=eq.${runId}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(
    `/user_plans_v2?user_id=eq.${encodeURIComponent(userId)}&generation_input_snapshot->>qa_run_id=eq.${runId}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(
    `/user_transformations?id=eq.${ids.transformation}&cycle_id=eq.${ids.cycle}`,
    { method: "DELETE" },
  ).catch(() => {});
  await request(`/user_cycles?id=eq.${ids.cycle}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
  }).catch(() => {});
}

async function seed() {
  await cleanup();
  const now = "2026-06-08T15:55:00.000Z";
  await request("/user_cycles", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.cycle,
      user_id: userId,
      status: "active",
      raw_intake_text: "Fixture QA ciblée adjust_plan_item local real r2.",
      intake_language: "fr",
      validated_structure: { qa_run_id: runId },
      duration_months: 1,
      requested_pace: "normal",
      active_transformation_id: null,
      version: 1,
      created_at: now,
      updated_at: now,
    }]),
  });
  await request("/user_transformations", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.transformation,
      cycle_id: ids.cycle,
      priority_order: 1,
      status: "active",
      title: "Apaiser le soir sans surcharger le rituel",
      internal_summary:
        "Fixture QA: tester l'allègement d'une action de plan sans mutation chat.",
      user_summary: "Rendre le sas du soir plus tenable.",
      success_definition: "Le sas reste faisable les soirs de fatigue.",
      main_constraint: "Ne pas appliquer depuis le chat; reprendre dans Plan.",
      questionnaire_schema: { qa_run_id: runId },
      questionnaire_answers: { qa_run_id: runId },
      handoff_payload: { qa_run_id: runId },
      base_de_vie_payload: {},
      unlocked_principles: [],
      ordering_rationale: "Fixture locale QA.",
      created_at: now,
      updated_at: now,
      activated_at: now,
      completed_at: null,
    }]),
  });
  await request(`/user_cycles?id=eq.${ids.cycle}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ active_transformation_id: ids.transformation, updated_at: now }),
  });
  await request("/user_plans_v2", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.plan,
      user_id: userId,
      cycle_id: ids.cycle,
      transformation_id: ids.transformation,
      status: "active",
      version: 1,
      title: "Plan QA - Sas du soir",
      content: {
        qa_run_id: runId,
        current_phase_id: "phase-qa",
        phases: [{ phase_id: "phase-qa", status: "active", title: "Installer le sas" }],
      },
      generation_attempts: 1,
      last_generation_reason: "qa_adjust_plan_local_real_r2",
      generation_feedback: "Fixture locale ciblée.",
      generation_input_snapshot: { qa_run_id: runId },
      activated_at: now,
      created_at: now,
      updated_at: now,
    }]),
  });
  const base = {
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: ids.transformation,
    plan_id: ids.plan,
    dimension: "habits",
    kind: "habit",
    status: "active",
    tracking_type: "boolean",
    support_mode: null,
    support_function: null,
    current_habit_state: null,
    scheduled_days: null,
    start_after_item_id: null,
    phase_id: "phase-qa",
    phase_order: 1,
    created_at: now,
    updated_at: now,
    activated_at: now,
    completed_at: null,
  };
  await request("/user_plan_items", {
    method: "POST",
    body: JSON.stringify([
      {
        ...base,
        id: ids.itemPrepare,
        title: "Préparer le carnet du soir",
        description: "Poser le carnet et le stylo avant la coupure.",
        activation_order: 1,
        target_reps: null,
        current_reps: null,
        cadence_label: null,
        time_of_day: "evening",
        payload: { qa_run_id: runId, fixture: true },
      },
      {
        ...base,
        id: ids.itemSas,
        title: "Faire le sas de déchargement",
        description:
          "Couper les écrans, prendre 5 minutes avec le carnet, noter les idées et les choses à ne pas oublier.",
        activation_order: 2,
        target_reps: 6,
        current_reps: 0,
        cadence_label: "6 soirs / semaine",
        time_of_day: "evening",
        payload: { qa_run_id: runId, fixture: true },
      },
    ]),
  });
  console.log(JSON.stringify({ seeded: true, run_id: runId, user_id: userId, ids }, null, 2));
}

if (command === "cleanup") {
  await cleanup();
  console.log(JSON.stringify({ cleanup: true, run_id: runId, user_id: userId }, null, 2));
} else if (command === "seed") {
  await seed();
} else {
  throw new Error("usage: node tmp/adjust_plan_local_real_r2_fixture.mjs <seed|cleanup>");
}

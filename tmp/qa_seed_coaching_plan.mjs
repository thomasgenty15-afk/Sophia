import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const command = process.argv[2] || "";
const runId = argValue("run-id");
if (!runId) throw new Error("--run-id is required");

function argValue(name, fallback = "") {
  const eq = `--${name}=`;
  const byEq = process.argv.find((arg) => arg.startsWith(eq));
  if (byEq) return byEq.slice(eq.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const stateFile = path.join(
  root,
  "tmp",
  "qa-normal-conversation",
  runId,
  "state.json",
);
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const baseUrl = state.base_url || "http://127.0.0.1:54321";
const serviceKey = state.service_key;
if (!serviceKey) throw new Error("missing service_key in state");

function headers(extra = {}) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function request(pathname, options = {}) {
  const res = await fetch(`${baseUrl}/rest/v1${pathname}`, {
    ...options,
    headers: headers(options.headers ?? {}),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${pathname} ${res.status} ${text}`);
  }
  return body;
}

async function cleanup() {
  const qa = encodeURIComponent(runId);
  const user = encodeURIComponent(state.user_id);
  await request(`/user_plan_items?user_id=eq.${user}&payload->>qa_run_id=eq.${qa}`, {
    method: "DELETE",
  }).catch(() => {});
  await request(
    `/user_plans_v2?user_id=eq.${user}&generation_input_snapshot->>qa_run_id=eq.${qa}`,
    { method: "DELETE" },
  ).catch(() => {});
  if (state.seeded_plan?.transformation_id && state.seeded_plan?.cycle_id) {
    await request(
      `/user_transformations?id=eq.${state.seeded_plan.transformation_id}&cycle_id=eq.${state.seeded_plan.cycle_id}`,
      { method: "DELETE" },
    ).catch(() => {});
  }
  if (state.seeded_plan?.cycle_id) {
    await request(`/user_cycles?id=eq.${state.seeded_plan.cycle_id}&user_id=eq.${user}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}

async function seed() {
  await cleanup();
  const now = "2026-06-18T10:00:00.000Z";
  const ids = {
    cycle_id: randomUUID(),
    transformation_id: randomUUID(),
    plan_id: randomUUID(),
    item_id: randomUUID(),
  };
  await request("/user_cycles", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.cycle_id,
      user_id: state.user_id,
      status: "active",
      raw_intake_text: "Fixture QA coaching recommendation action-plan.",
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
      id: ids.transformation_id,
      cycle_id: ids.cycle_id,
      priority_order: 1,
      status: "active",
      title: "Stabiliser l'administratif",
      internal_summary: "Fixture QA coaching recommendation action-plan.",
      user_summary: "Avancer sur les dossiers administratifs.",
      success_definition: "Le dossier mutuelle avance sans blocage.",
      main_constraint: "Ne pas muter depuis le chat.",
      questionnaire_schema: { qa_run_id: runId },
      questionnaire_answers: { qa_run_id: runId },
      handoff_payload: { qa_run_id: runId },
      base_de_vie_payload: {},
      unlocked_principles: [],
      ordering_rationale: "Fixture QA.",
      created_at: now,
      updated_at: now,
      activated_at: now,
    }]),
  });
  await request(`/user_cycles?id=eq.${ids.cycle_id}&user_id=eq.${state.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      active_transformation_id: ids.transformation_id,
      updated_at: now,
    }),
  });
  await request("/user_plans_v2", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.plan_id,
      user_id: state.user_id,
      cycle_id: ids.cycle_id,
      transformation_id: ids.transformation_id,
      status: "active",
      version: 1,
      title: "Plan QA - Administratif",
      content: {
        qa_run_id: runId,
        current_phase_id: "phase-admin",
        phases: [{ phase_id: "phase-admin", status: "active", title: "Dossiers" }],
      },
      generation_attempts: 1,
      last_generation_reason: "qa_coaching_recommendation_action_plan",
      generation_feedback: "Fixture QA.",
      generation_input_snapshot: { qa_run_id: runId },
      activated_at: now,
      created_at: now,
      updated_at: now,
    }]),
  });
  await request("/user_plan_items", {
    method: "POST",
    body: JSON.stringify([{
      id: ids.item_id,
      user_id: state.user_id,
      cycle_id: ids.cycle_id,
      transformation_id: ids.transformation_id,
      plan_id: ids.plan_id,
      dimension: "missions",
      kind: "task",
      status: "active",
      title: "Préparer le dossier mutuelle",
      description: "Rassembler les justificatifs et écrire le message de demande.",
      tracking_type: "boolean",
      activation_order: 1,
      phase_id: "phase-admin",
      phase_order: 1,
      cards_status: "not_started",
      payload: { qa_run_id: runId, fixture: true },
      created_at: now,
      updated_at: now,
      activated_at: now,
    }]),
  });
  state.seeded_plan = ids;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify({ seeded: true, run_id: runId, user_id: state.user_id, ids }, null, 2));
}

if (command === "seed") {
  await seed();
} else if (command === "cleanup") {
  await cleanup();
  state.seeded_plan_cleanup = new Date().toISOString();
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify({ cleanup: true, run_id: runId }, null, 2));
} else {
  throw new Error("usage: node tmp/qa_seed_coaching_plan.mjs <seed|cleanup> --run-id <id>");
}

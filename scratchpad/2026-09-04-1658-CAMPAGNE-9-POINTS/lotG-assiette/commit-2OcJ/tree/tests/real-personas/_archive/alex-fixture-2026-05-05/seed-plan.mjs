#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const root = new URL("../../..", import.meta.url);
const connectionPath = new URL("./connection.json", import.meta.url);
const connection = JSON.parse(readFileSync(connectionPath, "utf8"));
const userId = connection.user_id;

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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY;

if (!userId) throw new Error("missing user_id in connection.json");
if (!serviceKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");

const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
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
      `${options.method ?? "GET"} ${path} ${response.status} ${
        JSON.stringify(body)
      }`,
    );
  }
  return body;
}

const ids = {
  cycle: "11111111-1111-4111-8111-111111111111",
  transformation: "22222222-2222-4222-8222-222222222222",
  plan: "33333333-3333-4333-8333-333333333333",
  itemPresentation: "44444444-4444-4444-8444-444444444444",
  itemSend: "55555555-5555-4555-8555-555555555555",
  itemFocus: "66666666-6666-4666-8666-666666666666",
  itemReview: "77777777-7777-4777-8777-777777777777",
  metricNorth: "88888888-8888-4888-8888-888888888888",
};

const now = "2026-05-05T16:20:00.000Z";

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
    phase_id: null,
    phase_order: null,
    payload: {},
    created_at: now,
    updated_at: now,
    activated_at: now,
    completed_at: null,
    ...overrides,
  };
}

async function main() {
  await request(`/chat_messages?user_id=eq.${userId}`, { method: "DELETE" });
  await request(`/conversation_turn_traces?user_id=eq.${userId}`, {
    method: "DELETE",
  });
  await request(`/user_chat_states?user_id=eq.${userId}&scope=eq.web`, {
    method: "PATCH",
    body: JSON.stringify({
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      unprocessed_msg_count: 0,
      last_processed_at: now,
      last_interaction_at: now,
      temp_memory: {},
    }),
  }).catch(() => {});

  await request(`/user_cycles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ active_transformation_id: null }),
  }).catch(() => {});
  await request(`/user_cycles?user_id=eq.${userId}`, { method: "DELETE" });

  await request("/user_cycles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      id: ids.cycle,
      user_id: userId,
      status: "active",
      raw_intake_text:
        "Alex veut livrer une presentation de cadrage claire sans surpreparer ni eviter l'envoi.",
      intake_language: "fr",
      validated_structure: {
        fixture: "alex-plan-2026-05-05",
        themes: [
          "presentation de cadrage",
          "clarte",
          "livraison jeudi soir",
        ],
      },
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
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      id: ids.transformation,
      cycle_id: ids.cycle,
      priority_order: 1,
      status: "active",
      title: "Clarifier et livrer la presentation de cadrage",
      internal_summary:
        "Aider Alex a transformer une presentation de cadrage floue en livrable client concret, avec une version envoyee jeudi soir pour revue interne avant l'echeance vendredi.",
      user_summary:
        "Rendre la presentation de cadrage claire, envoyable et suffisamment bonne sans ajouter d'action inutile.",
      success_definition:
        "Jeudi soir, Alex a envoye une version client relisible pour revue interne; vendredi, il peut finaliser sans repartir de zero.",
      main_constraint:
        "Ne pas recreer le plan depuis le chat; ajuster les actions existantes et eviter la surpreparation.",
      questionnaire_schema: { fixture: true },
      questionnaire_answers: {
        format_attendu: "slides courtes",
        deadline_client: "vendredi 2026-05-08",
        revue_interne: "jeudi soir 2026-05-07",
      },
      completion_summary: null,
      handoff_payload: {
        fixture: "alex-plan-2026-05-05",
        active_plan_expected: true,
      },
      base_de_vie_payload: { energy_note: "energie moyenne, besoin de concret" },
      unlocked_principles: [],
      ordering_rationale: "Priorite actuelle car l'echeance est proche.",
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

  const content = {
    version: 3,
    fixture: "alex-plan-2026-05-05",
    active_transformation: "Clarifier et livrer la presentation de cadrage",
    current_phase_id: "phase-1",
    phases: [
      {
        phase_id: "phase-1",
        phase_order: 1,
        title: "Rendre le cadrage envoyable",
        status: "active",
        goal: "Sortir une version claire et partageable jeudi soir.",
        items: [ids.itemPresentation, ids.itemSend, ids.itemFocus],
      },
      {
        phase_id: "phase-2",
        phase_order: 2,
        title: "Finaliser sans repartir de zero",
        status: "pending",
        goal: "Utiliser la revue interne pour finaliser vendredi.",
        items: [ids.itemReview],
      },
    ],
    principles: [
      "ajuster le plan existant",
      "ne pas creer une nouvelle action si une action active correspond",
      "une carte d'attaque peut aider a demarrer l'action de presentation",
    ],
  };

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
      title: "Plan Alex - Presentation de cadrage",
      content,
      generation_attempts: 1,
      last_generation_reason: "fixture_alex_daily_check",
      generation_feedback:
        "Plan fixture cree pour tester acces plan et routage cartes d'attaque.",
      generation_input_snapshot: {
        fixture: true,
        created_for: "real-persona-alex",
      },
      activated_at: now,
      completed_at: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    }]),
  });

  const items = [
    planItem({
      id: ids.itemPresentation,
      dimension: "missions",
      kind: "task",
      title: "Preparer la presentation de cadrage client",
      description:
        "Transformer le cadrage flou en 5 slides maximum: probleme, objectif, perimetre, planning, decision attendue.",
      tracking_type: "milestone",
      activation_order: 1,
      cadence_label: "cette semaine",
      scheduled_days: ["wed", "thu"],
      time_of_day: "soir",
      phase_id: "phase-1",
      phase_order: 1,
      payload: {
        fixture: true,
        attack_card_candidate: true,
        definition_of_done: [
          "5 slides max",
          "decision attendue explicite",
          "version partageable jeudi soir",
        ],
        known_blocker: "action trop vague / demarrage difficile",
      },
    }),
    planItem({
      id: ids.itemSend,
      dimension: "missions",
      kind: "milestone",
      title: "Envoyer la version client jeudi soir pour revue interne",
      description:
        "Envoyer une version suffisamment bonne jeudi soir afin de recevoir un retour interne avant la finalisation vendredi.",
      tracking_type: "boolean",
      activation_order: 2,
      activation_condition: { after_item_id: ids.itemPresentation },
      target_reps: 1,
      current_reps: 0,
      cadence_label: "one-shot jeudi soir",
      scheduled_days: ["thu"],
      time_of_day: "soir",
      phase_id: "phase-1",
      phase_order: 1,
      payload: {
        fixture: true,
        deadline: "2026-05-07 evening",
        related_deadline_client: "2026-05-08",
      },
    }),
    planItem({
      id: ids.itemFocus,
      dimension: "habits",
      kind: "habit",
      title: "Bloc focus 25 minutes sur le cadrage",
      description:
        "Un bloc court pour avancer la presentation sans chercher la version parfaite.",
      tracking_type: "boolean",
      activation_order: 3,
      current_habit_state: "active_building",
      target_reps: 3,
      current_reps: 1,
      cadence_label: "3 fois cette semaine",
      scheduled_days: ["tue", "wed", "thu"],
      time_of_day: "matin",
      phase_id: "phase-1",
      phase_order: 1,
      payload: {
        fixture: true,
        minimum_version: "ouvrir les slides et remplir une seule section",
      },
    }),
    planItem({
      id: ids.itemReview,
      dimension: "support",
      kind: "exercise",
      status: "pending",
      title: "Relire les retours internes sans repartir de zero",
      description:
        "Vendredi, integrer seulement les retours qui clarifient la decision attendue.",
      tracking_type: "text",
      activation_order: 4,
      activation_condition: { after_item_id: ids.itemSend },
      support_mode: "unlockable",
      support_function: "practice",
      activated_at: null,
      phase_id: "phase-2",
      phase_order: 2,
      payload: { fixture: true },
    }),
  ];

  await request("/user_plan_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(items),
  });

  await request("/user_metrics", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      id: ids.metricNorth,
      user_id: userId,
      cycle_id: ids.cycle,
      transformation_id: null,
      scope: "cycle",
      kind: "north_star",
      status: "active",
      title: "Version de cadrage envoyable",
      unit: "%",
      current_value: "35",
      target_value: "100",
      payload: {
        fixture: true,
        meaning: "progression vers une version partageable jeudi soir",
      },
      created_at: now,
      updated_at: now,
    }]),
  });

  await request("/user_chat_states", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      user_id: userId,
      scope: "web",
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      unprocessed_msg_count: 0,
      last_processed_at: now,
      last_interaction_at: now,
      temp_memory: {},
    }]),
  });

  const summary = await request(
    `/user_plan_items?user_id=eq.${userId}&select=id,title,dimension,kind,status,scheduled_days,time_of_day,payload&order=activation_order.asc`,
  );

  console.log(JSON.stringify({
    ok: true,
    user_id: userId,
    cycle_id: ids.cycle,
    transformation_id: ids.transformation,
    plan_id: ids.plan,
    items: summary,
  }, null, 2));
}

await main();

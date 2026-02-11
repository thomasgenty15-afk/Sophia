#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");
const CONFIG_PATH = path.join(
  FRONTEND_ROOT,
  "eval",
  "config",
  "eval_fixed_users_real_staging.json",
);
const SLOT = 1;
const SCOPE = "web";

const PRESEED_ACTIONS = [
  {
    title: "Lecture",
    type: "habit",
    tracking_type: "boolean",
    target_reps: 4,
    current_reps: 0,
    status: "active",
    time_of_day: "evening",
    description: "Lire 10 minutes le soir.",
    scheduled_days: ["mon", "wed", "fri", "sun"],
  },
  {
    title: "Marche 15 min",
    type: "habit",
    tracking_type: "boolean",
    target_reps: 3,
    current_reps: 0,
    status: "active",
    time_of_day: "any_time",
    description: "Marcher 15 minutes pour couper la journee.",
    scheduled_days: ["tue", "thu", "sat"],
  },
];

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env var ${name}`);
  return String(v).trim();
}

function getUserIdFromConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const users = Array.isArray(cfg?.users) ? cfg.users : [];
  const u = users.find((x) => Number(x?.slot) === SLOT);
  if (!u?.user_id) {
    throw new Error(
      `Slot ${SLOT} user_id is empty in ${CONFIG_PATH}. Run provision_user.mjs first.`,
    );
  }
  return String(u.user_id);
}

async function ensureActivePlan(admin, userId) {
  const existing = await admin
    .from("user_plans")
    .select("id,submission_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!existing.error && existing.data?.id) return existing.data;

  const submissionId = crypto.randomUUID();
  const goal = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "eval_fixture",
      axis_title: "Eval Fixture",
      theme_id: "eval_theme",
      priority_order: 1,
    })
    .select("id")
    .single();
  if (goal.error) throw goal.error;

  const plan = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goal.data.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "Plan de test V2",
      content: { phases: [{ id: "p1", title: "Phase 1", status: "active", actions: [] }] },
    })
    .select("id,submission_id")
    .single();
  if (plan.error) throw plan.error;
  return plan.data;
}

async function resetScenario(admin, userId) {
  const staleTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const plan = await ensureActivePlan(admin, userId);

  await admin.from("user_chat_states").upsert({
    user_id: userId,
    scope: SCOPE,
    current_mode: "companion",
    risk_level: 0,
    investigation_state: null,
    short_term_context: "",
    temp_memory: {},
    unprocessed_msg_count: 0,
    last_processed_at: new Date().toISOString(),
  }, { onConflict: "user_id,scope" });

  await admin.from("chat_messages").delete().eq("user_id", userId).eq("scope", SCOPE);
  await admin.from("turn_summary_logs").delete().eq("user_id", userId);
  await admin.from("user_checkup_logs").delete().eq("user_id", userId);
  await admin.from("user_action_entries").delete().eq("user_id", userId);
  await admin.from("user_vital_signs").delete().eq("user_id", userId);

  await admin.from("user_actions").delete().eq("user_id", userId).eq("plan_id", plan.id);
  for (const a of PRESEED_ACTIONS) {
    const ins = await admin.from("user_actions").insert({
      user_id: userId,
      plan_id: plan.id,
      submission_id: plan.submission_id,
      title: a.title,
      description: a.description,
      type: a.type,
      target_reps: a.target_reps,
      current_reps: a.current_reps,
      status: a.status,
      tracking_type: a.tracking_type,
      time_of_day: a.time_of_day,
      scheduled_days: a.scheduled_days,
      last_performed_at: staleTs,
    });
    if (ins.error) throw ins.error;
  }
}

async function validateReset(admin, userId) {
  const chatState = await admin
    .from("user_chat_states")
    .select("current_mode,temp_memory,investigation_state")
    .eq("user_id", userId)
    .eq("scope", SCOPE)
    .maybeSingle();
  if (chatState.error) throw chatState.error;

  const actions = await admin
    .from("user_actions")
    .select("title,status")
    .eq("user_id", userId)
    .eq("status", "active");
  if (actions.error) throw actions.error;

  const modeOk = String(chatState.data?.current_mode ?? "") === "companion";
  const invOk = chatState.data?.investigation_state == null;
  const actionTitles = new Set((actions.data ?? []).map((a) => String(a.title ?? "")));
  const actionsOk = actionTitles.has("Lecture") && actionTitles.has("Marche 15 min") &&
    actionTitles.size === 2;

  console.log(`[Reset] mode_companion=${modeOk}`);
  console.log(`[Reset] investigation_state_cleared=${invOk}`);
  console.log(`[Reset] actions_seeded=${actionsOk}`);
  if (!modeOk || !invOk || !actionsOk) {
    throw new Error("Reset validation failed for tools_delete_action_staging");
  }
}

async function main() {
  const url = mustEnv("SOPHIA_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SOPHIA_SUPABASE_SERVICE_ROLE_KEY");
  const userId = getUserIdFromConfig();
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[Reset] tools_delete_action_staging slot=${SLOT} user=${userId}`);
  await resetScenario(admin, userId);
  await validateReset(admin, userId);
  console.log("[Reset] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


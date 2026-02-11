#!/usr/bin/env node
/**
 * reset.mjs — Standalone reset for bilan_missed_streak_breakdown test.
 *
 * Resets the dedicated V4 user (slot 7) to a clean state ready for a new run.
 * Can be run independently to verify the reset works, or imported by the
 * eval runner for pre-/post-run resets.
 *
 * Usage (standalone):
 *   cd frontend && \
 *   SOPHIA_SUPABASE_URL="http://127.0.0.1:54321" \
 *   SOPHIA_SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *   node eval/scenarios/bilan_missed_streak_breakdown/commands/reset.mjs [--variant accept|accept_no_days|accept_with_days|decline]
 *
 * The script:
 *   1. Wipes chat_messages, chat_states, checkup_logs, turn_summary_logs, action_entries
 *   2. Re-creates actions with exact expected values (target_reps, current_reps)
 *   3. Re-creates the vital sign
 *   4. Seeds 5 "missed" action entries for "Méditation 10 min" (J-5 to J-1)
 *   5. Seeds the investigation_state fixture
 *   6. Validates every field and prints a pass/fail checklist
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────────

// user_id will be set after provisioning — for now read from the config file
const USERS_FILE = path.resolve(__dirname, "../../../config/eval_fixed_users_staging.json");
function loadUserId() {
  try {
    const json = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const slot7 = (json.users ?? []).find((u) => u.slot === 7);
    return slot7?.user_id ?? null;
  } catch {
    return null;
  }
}

const USER = {
  slot: 7,
  email: "user-bilan-missed-breakdown@sophia-test.local",
  user_id: loadUserId(),
  full_name: "user-bilan-missed-breakdown",
};

const SCOPE = "web";

// Expected DB state (same for both variants)
const EXPECTED_ACTIONS = {
  "Méditation 10 min": {
    type: "habit",
    tracking_type: "boolean",
    target_reps: 5,
    current_reps: 0,
    time_of_day: "morning",
    description: "Méditer 10 minutes le matin.",
    status: "active",
    scheduled_days: null,
  },
  "Lecture 20 min": {
    type: "habit",
    tracking_type: "boolean",
    target_reps: 5,
    current_reps: 3,
    time_of_day: "evening",
    description: "Lire 20 minutes le soir.",
    status: "active",
    scheduled_days: null,
  },
};

const EXPECTED_VITAL = {
  label: "Énergie",
  unit: "/10",
  tracking_type: "counter",
  status: "active",
};

// Action entry history: 5 "missed" for "Méditation 10 min" (J-5 to J-1)
const EXPECTED_ACTION_ENTRIES = [
  { title: "Méditation 10 min", status: "missed", days: 5 },
];

async function ensureActivePlanForUser(supabase, userId) {
  const { data: plans, error: plansErr } = await supabase
    .from("user_plans")
    .select("id,submission_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (plansErr) throw plansErr;
  if (plans?.[0]?.id) {
    return {
      planId: plans[0].id,
      submissionId: plans[0].submission_id ?? null,
      createdPlan: false,
    };
  }

  const submissionId = randomUUID();
  const { data: goalRow, error: goalErr } = await supabase
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
  if (goalErr) throw goalErr;

  const { data: planRow, error: planErr } = await supabase
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "Plan de test V2",
      content: { phases: [{ id: "p1", title: "Phase 1", status: "active", actions: [] }] },
    })
    .select("id,submission_id")
    .single();
  if (planErr) throw planErr;

  return {
    planId: planRow.id,
    submissionId: planRow.submission_id ?? submissionId,
    createdPlan: true,
  };
}

// ─── Reset Logic ────────────────────────────────────────────────────────────────

export async function resetBilanMissedStreakBreakdown(supabase, variant = "accept", userIdOverride = null) {
  const userId = String(userIdOverride ?? USER.user_id);
  if (!userId || userId === "null") {
    console.error("  ✗ No user_id found. Run provision_eval_v2_users.mjs first to create slot 7.");
    return { success: false, error: "no_user_id" };
  }
  const staleTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  console.log(`\n[Reset:bilan_missed_streak_breakdown] variant=${variant} user=${userId}`);

  // ── 1. Wipe chat state (clean temp_memory, investigation_state, mode) ──
  {
    const { error } = await supabase
      .from("user_chat_states")
      .update({
        current_mode: "companion",
        risk_level: 0,
        investigation_state: null,
        short_term_context: "",
        temp_memory: {},
        unprocessed_msg_count: 0,
        last_processed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("scope", SCOPE);
    if (error) console.warn(`  ⚠ chat_states update error: ${error.message}`);
    else console.log("  ✓ chat_states wiped");
  }

  // ── 2. Delete all chat messages ──
  {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", userId)
      .eq("scope", SCOPE);
    if (error) console.warn(`  ⚠ chat_messages delete error: ${error.message}`);
    else console.log("  ✓ chat_messages deleted");
  }

  // ── 3. Delete checkup logs ──
  {
    const { error } = await supabase
      .from("user_checkup_logs")
      .delete()
      .eq("user_id", userId);
    if (error) console.warn(`  ⚠ user_checkup_logs delete error: ${error.message}`);
    else console.log("  ✓ user_checkup_logs deleted");
  }

  // ── 4. Delete turn summary logs ──
  {
    const { error } = await supabase
      .from("turn_summary_logs")
      .delete()
      .eq("user_id", userId);
    if (error) console.warn(`  ⚠ turn_summary_logs delete error: ${error.message}`);
    else console.log("  ✓ turn_summary_logs deleted");
  }

  // ── 5. Delete action entries (history) ──
  {
    const { error } = await supabase
      .from("user_action_entries")
      .delete()
      .eq("user_id", userId);
    if (error) console.warn(`  ⚠ user_action_entries delete error: ${error.message}`);
    else console.log("  ✓ user_action_entries deleted");
  }

  // ── 6. Ensure an active plan exists (bootstrap goal+plan on first run) ──
  let planId = null;
  let submissionId = null;
  try {
    const ensured = await ensureActivePlanForUser(supabase, userId);
    planId = ensured.planId;
    submissionId = ensured.submissionId;
    if (ensured.createdPlan) console.log("  ✓ active plan bootstrapped for user");
    else console.log("  ✓ active plan found for user");
  } catch (e) {
    console.error(`  ✗ Failed to ensure active plan: ${e?.message ?? e}`);
    return { success: false, error: "ensure_plan_failed" };
  }

  // ── 7. Delete + re-create actions with exact expected values ──
  {
    const { error: delErr } = await supabase
      .from("user_actions")
      .delete()
      .eq("user_id", userId)
      .eq("plan_id", planId);
    if (delErr) console.warn(`  ⚠ user_actions delete error: ${delErr.message}`);

    for (const [title, spec] of Object.entries(EXPECTED_ACTIONS)) {
      const { error: insErr } = await supabase.from("user_actions").insert({
        user_id: userId,
        plan_id: planId,
        submission_id: submissionId,
        type: spec.type,
        title,
        description: spec.description,
        target_reps: spec.target_reps,
        current_reps: spec.current_reps,
        status: spec.status,
        tracking_type: spec.tracking_type,
        time_of_day: spec.time_of_day,
        scheduled_days: spec.scheduled_days,
        last_performed_at: staleTs,
      });
      if (insErr) console.warn(`  ⚠ action insert error (${title}): ${insErr.message}`);
      else console.log(`  ✓ action re-created: ${title} (target=${spec.target_reps}, current=${spec.current_reps})`);
    }
  }

  // ── 8. Seed action entries (5 "missed" for "Méditation 10 min", J-5 to J-1) ──
  {
    const { data: actions } = await supabase
      .from("user_actions")
      .select("id,title")
      .eq("user_id", userId)
      .eq("status", "active");
    const byTitle = new Map();
    for (const a of actions ?? []) byTitle.set(a.title, a);

    const rows = [];
    for (const spec of EXPECTED_ACTION_ENTRIES) {
      const found = byTitle.get(spec.title);
      if (!found) continue;
      for (let i = spec.days; i >= 1; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        d.setUTCHours(12, 0, 0, 0);
        rows.push({
          user_id: userId,
          action_id: found.id,
          action_title: found.title,
          status: spec.status,
          value: null,
          note: null,
          performed_at: d.toISOString(),
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("user_action_entries").insert(rows);
      if (error) console.warn(`  ⚠ action_entries insert error: ${error.message}`);
      else console.log(`  ✓ ${rows.length} action entries seeded (missed streak for Méditation 10 min)`);
    }
  }

  // ── 9. Re-create vital sign ──
  {
    const { error: delErr } = await supabase
      .from("user_vital_signs")
      .delete()
      .eq("user_id", userId);
    if (delErr) console.warn(`  ⚠ vital_signs delete error: ${delErr.message}`);

    const { error: insErr } = await supabase.from("user_vital_signs").insert({
      user_id: userId,
      plan_id: planId,
      label: EXPECTED_VITAL.label,
      unit: EXPECTED_VITAL.unit,
      tracking_type: EXPECTED_VITAL.tracking_type,
      status: EXPECTED_VITAL.status,
      current_value: "",
      target_value: "",
      last_checked_at: staleTs,
    });
    if (insErr) console.warn(`  ⚠ vital_signs insert error: ${insErr.message}`);
    else console.log(`  ✓ vital sign re-created: ${EXPECTED_VITAL.label}`);
  }

  // ── 10. Seed investigation_state fixture ──
  const investigationState = await seedInvestigationState(supabase, userId);

  console.log(`[Reset:bilan_missed_streak_breakdown] Reset complete.\n`);
  return { success: true, investigationState };
}

async function seedInvestigationState(supabase, userId) {
  // Fetch freshly inserted actions
  const { data: actions } = await supabase
    .from("user_actions")
    .select("id,title,description,tracking_type,target_reps,current_reps,type,scheduled_days,time_of_day")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });

  // Fetch freshly inserted vital
  const { data: vitals } = await supabase
    .from("user_vital_signs")
    .select("id,label,tracking_type,unit,target_value")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  const pendingActions = (actions ?? []).map((a) => {
    const isHabit = String(a.type ?? "") === "habit";
    const sd = Array.isArray(a.scheduled_days) ? a.scheduled_days : [];
    const targetReps = Number(a.target_reps ?? 1);
    const currentReps = Number(a.current_reps ?? 0);
    let weeklyTargetStatus = undefined;
    if (isHabit && targetReps > 0) {
      if (currentReps < targetReps) weeklyTargetStatus = "below";
      else if (currentReps === targetReps) weeklyTargetStatus = "at_target";
      else weeklyTargetStatus = "exceeded";
    }
    return {
      id: a.id,
      type: "action",
      title: a.title,
      description: a.description ?? "",
      tracking_type: a.tracking_type ?? "boolean",
      target: targetReps,
      current: isHabit ? currentReps : undefined,
      is_habit: isHabit,
      weekly_target_status: weeklyTargetStatus,
      scheduled_days: sd.length > 0 ? sd : undefined,
      is_scheduled_day: true,
      day_scope: "today",
      time_of_day: a.time_of_day ?? undefined,
    };
  });

  const pendingVitals = (vitals ?? []).map((v) => ({
    id: v.id,
    type: "vital",
    title: v.label,
    tracking_type: v.tracking_type ?? "counter",
    unit: v.unit ?? "",
    day_scope: "today",
    target_vital_value: v.target_value != null ? String(v.target_value) : "",
  }));

  const pendingItems = [...pendingVitals, ...pendingActions];
  const investigationState = {
    status: "checking",
    pending_items: pendingItems,
    current_item_index: 0,
    temp_memory: { opening_done: false },
  };

  const { error } = await supabase.from("user_chat_states").upsert({
    user_id: userId,
    scope: SCOPE,
    current_mode: "investigator",
    risk_level: 0,
    investigation_state: investigationState,
    short_term_context: "",
    temp_memory: {},
    unprocessed_msg_count: 0,
    last_processed_at: new Date().toISOString(),
  }, { onConflict: "user_id,scope" });

  if (error) console.warn(`  ⚠ investigation_state upsert error: ${error.message}`);
  else console.log(`  ✓ investigation_state seeded: ${pendingItems.length} items (${pendingVitals.length} vital, ${pendingActions.length} actions)`);

  return investigationState;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

export async function validateReset(supabase, variant = "accept", userIdOverride = null) {
  const userId = String(userIdOverride ?? USER.user_id);
  const checks = [];
  let allOk = true;

  const pass = (label) => { checks.push({ label, ok: true }); };
  const fail = (label, detail) => {
    checks.push({ label, ok: false, detail });
    allOk = false;
  };

  // ── Chat state ──
  const { data: cs } = await supabase
    .from("user_chat_states")
    .select("current_mode,investigation_state,temp_memory")
    .eq("user_id", userId)
    .eq("scope", SCOPE)
    .maybeSingle();

  if (!cs) {
    fail("chat_state exists", "No chat_state row found");
  } else {
    if (cs.current_mode === "investigator") pass("current_mode = investigator");
    else fail("current_mode = investigator", `got "${cs.current_mode}"`);

    // temp_memory must be clean (empty object)
    const tmKeys = Object.keys(cs.temp_memory ?? {});
    if (tmKeys.length === 0) pass("temp_memory = {}");
    else fail("temp_memory = {}", `has keys: ${tmKeys.join(", ")}`);

    // investigation_state checks
    const inv = cs.investigation_state;
    if (!inv) {
      fail("investigation_state exists", "null");
    } else {
      if (inv.status === "checking") pass("investigation_state.status = checking");
      else fail("investigation_state.status = checking", `got "${inv.status}"`);

      if (inv.current_item_index === 0) pass("current_item_index = 0");
      else fail("current_item_index = 0", `got ${inv.current_item_index}`);

      const items = inv.pending_items ?? [];
      if (items.length === 3) pass("pending_items = 3 items");
      else fail("pending_items = 3 items", `got ${items.length}`);

      // Vital
      const vital = items.find((i) => i.type === "vital");
      if (vital) {
        if (vital.title === "Énergie") pass("vital: Énergie");
        else fail("vital: Énergie", `got "${vital.title}"`);
      } else {
        fail("vital exists", "no vital in pending_items");
      }

      // Action: Méditation 10 min (missed streak, below)
      const meditation = items.find((i) => i.title === "Méditation 10 min");
      if (meditation) {
        if (meditation.is_habit === true) pass("Méditation 10 min: is_habit = true");
        else fail("Méditation 10 min: is_habit = true", `got ${meditation.is_habit}`);

        if (meditation.weekly_target_status === "below") pass("Méditation 10 min: weekly_target_status = below");
        else fail("Méditation 10 min: weekly_target_status = below", `got "${meditation.weekly_target_status}"`);

        if (meditation.target === 5) pass("Méditation 10 min: target = 5");
        else fail("Méditation 10 min: target = 5", `got ${meditation.target}`);

        if (meditation.current === 0) pass("Méditation 10 min: current = 0");
        else fail("Méditation 10 min: current = 0", `got ${meditation.current}`);
      } else {
        fail("Méditation 10 min exists", "not found in pending_items");
      }

      // Action: Lecture 20 min (below, normal flow)
      const lecture = items.find((i) => i.title === "Lecture 20 min");
      if (lecture) {
        if (lecture.is_habit === true) pass("Lecture 20 min: is_habit = true");
        else fail("Lecture 20 min: is_habit = true", `got ${lecture.is_habit}`);

        if (lecture.weekly_target_status === "below") pass("Lecture 20 min: weekly_target_status = below");
        else fail("Lecture 20 min: weekly_target_status = below", `got "${lecture.weekly_target_status}"`);

        if (lecture.target === 5) pass("Lecture 20 min: target = 5");
        else fail("Lecture 20 min: target = 5", `got ${lecture.target}`);

        if (lecture.current === 3) pass("Lecture 20 min: current = 3");
        else fail("Lecture 20 min: current = 3", `got ${lecture.current}`);
      } else {
        fail("Lecture 20 min exists", "not found in pending_items");
      }
    }
  }

  // ── Actions in user_actions table ──
  const { data: acts } = await supabase
    .from("user_actions")
    .select("title,target_reps,current_reps,status,type")
    .eq("user_id", userId)
    .order("title", { ascending: true });

  if ((acts ?? []).length === 2) pass("user_actions: 2 actions");
  else fail("user_actions: 2 actions", `got ${(acts ?? []).length}`);

  const dbMeditation = (acts ?? []).find((a) => a.title === "Méditation 10 min");
  if (dbMeditation) {
    if (dbMeditation.target_reps === 5) pass("DB Méditation: target_reps = 5");
    else fail("DB Méditation: target_reps = 5", `got ${dbMeditation.target_reps}`);

    if (dbMeditation.current_reps === 0) pass("DB Méditation: current_reps = 0");
    else fail("DB Méditation: current_reps = 0", `got ${dbMeditation.current_reps}`);

    if (dbMeditation.status === "active") pass("DB Méditation: status = active");
    else fail("DB Méditation: status = active", `got ${dbMeditation.status}`);
  }

  const dbLecture = (acts ?? []).find((a) => a.title === "Lecture 20 min");
  if (dbLecture) {
    if (dbLecture.target_reps === 5) pass("DB Lecture: target_reps = 5");
    else fail("DB Lecture: target_reps = 5", `got ${dbLecture.target_reps}`);

    if (dbLecture.current_reps === 3) pass("DB Lecture: current_reps = 3");
    else fail("DB Lecture: current_reps = 3", `got ${dbLecture.current_reps}`);
  }

  // ── Action entries (5 missed for Méditation) ──
  const { data: entries } = await supabase
    .from("user_action_entries")
    .select("action_title,status")
    .eq("user_id", userId);

  const missedMeditation = (entries ?? []).filter((e) => e.action_title === "Méditation 10 min" && e.status === "missed");
  if (missedMeditation.length === 5) pass("action_entries: 5 missed for Méditation 10 min");
  else fail("action_entries: 5 missed for Méditation 10 min", `got ${missedMeditation.length}`);

  // ── Vital sign ──
  const { data: vits } = await supabase
    .from("user_vital_signs")
    .select("label,unit,status,tracking_type")
    .eq("user_id", userId)
    .eq("status", "active");

  if ((vits ?? []).length === 1) pass("vital_signs: 1 active vital");
  else fail("vital_signs: 1 active vital", `got ${(vits ?? []).length}`);

  const dbVital = (vits ?? [])[0];
  if (dbVital?.label === "Énergie") pass("vital: Énergie");
  else if (dbVital) fail("vital: Énergie", `got "${dbVital.label}"`);

  // ── Chat messages (should be empty) ──
  const { count: msgCount } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("scope", SCOPE);

  if ((msgCount ?? 0) === 0) pass("chat_messages: empty");
  else fail("chat_messages: empty", `got ${msgCount} messages`);

  // ── Checkup logs (should be empty) ──
  const { count: logCount } = await supabase
    .from("user_checkup_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((logCount ?? 0) === 0) pass("checkup_logs: empty");
  else fail("checkup_logs: empty", `got ${logCount} rows`);

  // ── Print results ──
  console.log(`\n┌──────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  RESET VALIDATION — bilan_missed_streak_breakdown (variant=${variant})  │`);
  console.log(`├──────────────────────────────────────────────────────────────────────┤`);
  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    const detail = c.detail ? ` → ${c.detail}` : "";
    console.log(`│  ${icon} ${c.label}${detail}`);
  }
  console.log(`├──────────────────────────────────────────────────────────────────────┤`);
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const summary = allOk ? `ALL ${total} CHECKS PASSED ✅` : `${passed}/${total} PASSED — ${total - passed} FAILED ❌`;
  console.log(`│  ${summary}`);
  console.log(`└──────────────────────────────────────────────────────────────────────┘\n`);

  return { allOk, checks, passed, total };
}

// ─── CLI entry point ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let variant = "accept";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--variant" && args[i + 1]) variant = args[i + 1];
  }
  const validVariants = ["accept", "accept_no_days", "accept_with_days", "decline"];
  if (!validVariants.includes(variant)) {
    console.error(`Invalid variant: ${variant}. Valid: ${validVariants.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.SOPHIA_SUPABASE_URL;
  const serviceRoleKey = process.env.SOPHIA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Missing env: SOPHIA_SUPABASE_URL and SOPHIA_SUPABASE_SERVICE_ROLE_KEY required.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reset
  const result = await resetBilanMissedStreakBreakdown(supabase, variant, USER.user_id);
  if (!result.success) {
    console.error("Reset failed.");
    process.exit(1);
  }

  // Validate
  const validation = await validateReset(supabase, variant, USER.user_id);
  if (!validation.allOk) {
    console.error("Validation failed — see above.");
    process.exit(1);
  }

  console.log("Reset + validation complete. User is ready for a new run.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


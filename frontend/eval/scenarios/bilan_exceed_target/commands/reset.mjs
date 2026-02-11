#!/usr/bin/env node
/**
 * reset.mjs — Standalone reset for bilan_exceed_target test.
 *
 * Resets the dedicated V4 user (slot 6) to a clean state ready for a new run.
 * Can be run independently to verify the reset works, or imported by the
 * eval runner for pre-/post-run resets.
 *
 * Usage (standalone):
 *   cd frontend && \
 *   SOPHIA_SUPABASE_URL="http://127.0.0.1:54321" \
 *   SOPHIA_SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *   node eval/scenarios/bilan_exceed_target/commands/reset.mjs [--variant no|yes_no_days|yes_with_days]
 *
 * The script:
 *   1. Wipes chat_messages, chat_states, checkup_logs, turn_summary_logs, action_entries
 *   2. Re-creates actions with exact expected values (target_reps, current_reps, scheduled_days)
 *   3. Re-creates the vital sign
 *   4. Seeds the investigation_state fixture
 *   5. Validates every field and prints a pass/fail checklist
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────────

const USER = {
  slot: 6,
  email: "user-target-exceed-bilan-v4@sophia-test.local",
  user_id: "7ce005f9-84a1-4f0a-80fa-47651ea80d54",
  full_name: "user-target-exceed-bilan-V4",
};

const SCOPE = "web";

// Expected DB state per variant
const EXPECTED_ACTIONS = {
  "Sport 30 min": {
    type: "habit",
    tracking_type: "boolean",
    target_reps: 3,
    current_reps: 4,
    time_of_day: "morning",
    description: "Faire 30 minutes de sport.",
    status: "active",
    // scheduled_days depends on variant (set below)
  },
  "Lecture 15 min": {
    type: "habit",
    tracking_type: "boolean",
    target_reps: 5,
    current_reps: 2,
    time_of_day: "evening",
    description: "Lire 15 minutes le soir.",
    status: "active",
    scheduled_days: null,
  },
};

function getScheduledDaysForVariant(variant) {
  if (variant === "yes_with_days") return ["mon", "wed", "fri"];
  return null; // yes_no_days and no: no scheduled_days
}

const EXPECTED_VITAL = {
  label: "Énergie",
  unit: "/10",
  tracking_type: "counter",
  status: "active",
};

// Action entry history (to re-create current_reps context)
const EXPECTED_ACTION_ENTRIES = [
  { title: "Sport 30 min", status: "completed", days: 4 },
];

// ─── Reset Logic ────────────────────────────────────────────────────────────────

export async function resetBilanExceedTarget(supabase, variant = "no", userIdOverride = null) {
  const userId = String(userIdOverride ?? USER.user_id);
  const scheduledDays = getScheduledDaysForVariant(variant);
  const staleTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  console.log(`\n[Reset:bilan_exceed_target] variant=${variant} user=${userId}`);

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

  // ── 6. Get existing plan_id (we keep goal + plan, just reset actions) ──
  const { data: plans } = await supabase
    .from("user_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  const planId = plans?.[0]?.id;
  if (!planId) {
    console.error("  ✗ No active plan found for user. Run the eval runner once first to seed the plan.");
    return { success: false, error: "no_plan" };
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
      const sd = title === "Sport 30 min" ? scheduledDays : spec.scheduled_days;
      const { error: insErr } = await supabase.from("user_actions").insert({
        user_id: userId,
        plan_id: planId,
        type: spec.type,
        title,
        description: spec.description,
        target_reps: spec.target_reps,
        current_reps: spec.current_reps,
        status: spec.status,
        tracking_type: spec.tracking_type,
        time_of_day: spec.time_of_day,
        scheduled_days: sd,
        last_performed_at: staleTs,
      });
      if (insErr) console.warn(`  ⚠ action insert error (${title}): ${insErr.message}`);
      else console.log(`  ✓ action re-created: ${title} (target=${spec.target_reps}, current=${spec.current_reps}, days=${sd ? JSON.stringify(sd) : "null"})`);
    }
  }

  // ── 8. Seed action entries (completed history for "Sport 30 min") ──
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
      else console.log(`  ✓ ${rows.length} action entries seeded`);
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
  const investigationState = await seedInvestigationState(supabase, userId, scheduledDays);

  console.log(`[Reset:bilan_exceed_target] Reset complete.\n`);
  return { success: true, investigationState };
}

async function seedInvestigationState(supabase, userId, scheduledDays) {
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

export async function validateReset(supabase, variant = "no", userIdOverride = null) {
  const userId = String(userIdOverride ?? USER.user_id);
  const scheduledDays = getScheduledDaysForVariant(variant);
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

      // Action exceeded
      const sport = items.find((i) => i.title === "Sport 30 min");
      if (sport) {
        if (sport.is_habit === true) pass("Sport 30 min: is_habit = true");
        else fail("Sport 30 min: is_habit = true", `got ${sport.is_habit}`);

        if (sport.weekly_target_status === "exceeded") pass("Sport 30 min: weekly_target_status = exceeded");
        else fail("Sport 30 min: weekly_target_status = exceeded", `got "${sport.weekly_target_status}"`);

        if (sport.target === 3) pass("Sport 30 min: target = 3");
        else fail("Sport 30 min: target = 3", `got ${sport.target}`);

        if (sport.current === 4) pass("Sport 30 min: current = 4");
        else fail("Sport 30 min: current = 4", `got ${sport.current}`);

        // Scheduled days per variant
        if (variant === "yes_with_days") {
          const sd = sport.scheduled_days;
          if (Array.isArray(sd) && sd.length === 3 && sd.includes("mon") && sd.includes("wed") && sd.includes("fri")) {
            pass("Sport 30 min: scheduled_days = [mon,wed,fri]");
          } else {
            fail("Sport 30 min: scheduled_days = [mon,wed,fri]", `got ${JSON.stringify(sd)}`);
          }
        } else {
          if (!sport.scheduled_days || (Array.isArray(sport.scheduled_days) && sport.scheduled_days.length === 0)) {
            pass("Sport 30 min: scheduled_days = null/empty");
          } else {
            fail("Sport 30 min: scheduled_days = null/empty", `got ${JSON.stringify(sport.scheduled_days)}`);
          }
        }
      } else {
        fail("Sport 30 min exists", "not found in pending_items");
      }

      // Action below
      const lecture = items.find((i) => i.title === "Lecture 15 min");
      if (lecture) {
        if (lecture.is_habit === true) pass("Lecture 15 min: is_habit = true");
        else fail("Lecture 15 min: is_habit = true", `got ${lecture.is_habit}`);

        if (lecture.weekly_target_status === "below") pass("Lecture 15 min: weekly_target_status = below");
        else fail("Lecture 15 min: weekly_target_status = below", `got "${lecture.weekly_target_status}"`);

        if (lecture.target === 5) pass("Lecture 15 min: target = 5");
        else fail("Lecture 15 min: target = 5", `got ${lecture.target}`);

        if (lecture.current === 2) pass("Lecture 15 min: current = 2");
        else fail("Lecture 15 min: current = 2", `got ${lecture.current}`);
      } else {
        fail("Lecture 15 min exists", "not found in pending_items");
      }
    }
  }

  // ── Actions in user_actions table ──
  const { data: acts } = await supabase
    .from("user_actions")
    .select("title,target_reps,current_reps,status,scheduled_days,type")
    .eq("user_id", userId)
    .order("title", { ascending: true });

  if ((acts ?? []).length === 2) pass("user_actions: 2 actions");
  else fail("user_actions: 2 actions", `got ${(acts ?? []).length}`);

  const dbSport = (acts ?? []).find((a) => a.title === "Sport 30 min");
  if (dbSport) {
    if (dbSport.target_reps === 3) pass("DB Sport: target_reps = 3");
    else fail("DB Sport: target_reps = 3", `got ${dbSport.target_reps}`);

    if (dbSport.current_reps === 4) pass("DB Sport: current_reps = 4");
    else fail("DB Sport: current_reps = 4", `got ${dbSport.current_reps}`);

    if (dbSport.status === "active") pass("DB Sport: status = active");
    else fail("DB Sport: status = active", `got ${dbSport.status}`);
  }

  const dbLecture = (acts ?? []).find((a) => a.title === "Lecture 15 min");
  if (dbLecture) {
    if (dbLecture.target_reps === 5) pass("DB Lecture: target_reps = 5");
    else fail("DB Lecture: target_reps = 5", `got ${dbLecture.target_reps}`);

    if (dbLecture.current_reps === 2) pass("DB Lecture: current_reps = 2");
    else fail("DB Lecture: current_reps = 2", `got ${dbLecture.current_reps}`);
  }

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
  console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
  console.log(`│  RESET VALIDATION — bilan_exceed_target (variant=${variant})  │`);
  console.log(`├──────────────────────────────────────────────────────────────┤`);
  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    const detail = c.detail ? ` → ${c.detail}` : "";
    console.log(`│  ${icon} ${c.label}${detail}`);
  }
  console.log(`├──────────────────────────────────────────────────────────────┤`);
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const summary = allOk ? `ALL ${total} CHECKS PASSED ✅` : `${passed}/${total} PASSED — ${total - passed} FAILED ❌`;
  console.log(`│  ${summary}`);
  console.log(`└──────────────────────────────────────────────────────────────┘\n`);

  return { allOk, checks, passed, total };
}

// ─── CLI entry point ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let variant = "no";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--variant" && args[i + 1]) variant = args[i + 1];
  }
  const validVariants = ["no", "yes_no_days", "yes_with_days"];
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
  const result = await resetBilanExceedTarget(supabase, variant, USER.user_id);
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


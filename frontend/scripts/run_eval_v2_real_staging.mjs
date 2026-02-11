/**
 * run_eval_v2_real_staging.mjs
 *
 * Generic V2 eval runner for staging: resets a fixed user, runs a scenario via run-evals,
 * then exports conversation transcript + brain trace for the exact time interval of the run.
 *
 * Replicable to any state machine by changing --scenario.
 *
 * Usage:
 *   cd frontend && \
 *   SOPHIA_EVAL_REMOTE=1 \
 *   SOPHIA_SUPABASE_URL="https://iabxchanerdkczbxyjgg.supabase.co" \
 *   SOPHIA_SUPABASE_ANON_KEY="eyJ..." \
 *   SOPHIA_SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *   SUPABASE_ACCESS_TOKEN="sbp_..." \
 *   node scripts/run_eval_v2_real_staging.mjs \
 *     --scenario tools_deactivate_action_v2_ai_user \
 *     --turns 12 \
 *     --slot 1           # which of the 5 fixed users (1-5, default random)
 *     --all-slots        # run all 5 users sequentially
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Arg parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    scenario: "tools_deactivate_action_v2_ai_user",
    turns: 12,
    model: "gemini-2.5-flash",
    slot: null,    // 1-5 or null for random
    allSlots: false,
    variant: null,
    waitForFreeSlotMs: 10 * 60 * 1000,
    activeRunTtlMs: 15 * 60 * 1000,
    runTimeoutMs: 15 * 60 * 1000,
    invokeTimeoutMs: 3 * 60 * 1000,
    noBilan: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenario") out.scenario = String(argv[++i] ?? out.scenario).trim();
    else if (a === "--turns") out.turns = Math.max(1, Math.min(50, Number(argv[++i]) || 12));
    else if (a === "--model") out.model = String(argv[++i] ?? out.model).trim();
    else if (a === "--slot") out.slot = Math.max(1, Math.min(50, Number(argv[++i]) || 1));
    else if (a === "--all-slots") out.allSlots = true;
    else if (a === "--variant") out.variant = String(argv[++i] ?? "").trim() || null;
    else if (a === "--wait-for-free-slot-ms") out.waitForFreeSlotMs = Math.max(0, Number(argv[++i]) || out.waitForFreeSlotMs);
    else if (a === "--active-run-ttl-ms") out.activeRunTtlMs = Math.max(60_000, Number(argv[++i]) || out.activeRunTtlMs);
    else if (a === "--run-timeout-ms") out.runTimeoutMs = Math.max(60_000, Number(argv[++i]) || out.runTimeoutMs);
    else if (a === "--invoke-timeout-ms") out.invokeTimeoutMs = Math.max(60_000, Number(argv[++i]) || out.invokeTimeoutMs);
    else if (a === "--no-bilan") out.noBilan = true;
  }
  return out;
}

function materializeScenarioVariants({ scenario, variant }) {
  const base = { ...(scenario ?? {}) };
  const variants = Array.isArray(base?.variants) ? base.variants : [];
  if (variants.length === 0) return [base];

  const pickOne = (v) => {
    const out = { ...base };
    delete out.variants;
    const vid = String(v?.id ?? "").trim() || "variant";
    if (Array.isArray(v?.steps)) out.steps = v.steps;
    if (v?.assertions && typeof v.assertions === "object") out.assertions = v.assertions;
    if (v?.mechanical_assertions && typeof v.mechanical_assertions === "object") {
      out.mechanical_assertions = v.mechanical_assertions;
    }
    if (v?.setup && typeof v.setup === "object") out.setup = v.setup;
    if (Array.isArray(v?.tags)) out.tags = v.tags;
    if (Array.isArray(v?.objectives)) out.objectives = v.objectives;
    out.id = `${String(base?.id ?? "scenario")}__${vid}`;
    out.description = `${String(base?.description ?? "").trim()} [variant=${vid}]`.trim();
    return out;
  };

  const req = String(variant ?? "").trim().toLowerCase();
  if (!req || req === "random") {
    const pick = variants[Math.floor(Math.random() * variants.length)];
    return [pickOne(pick)];
  }
  if (req === "all") return variants.map(pickOne);

  const found = variants.find((v) => String(v?.id ?? "").trim().toLowerCase() === req);
  if (!found) {
    const avail = variants.map((v) => String(v?.id ?? "").trim()).filter(Boolean).join(", ");
    throw new Error(`Unknown --variant "${variant}". Available: ${avail || "(none)"}`);
  }
  return [pickOne(found)];
}

function mustEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim().length === 0) throw new Error(`Missing env var ${name}`);
  return String(v).trim();
}

// ─── Load fixed users config ───────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, "..", "eval", "config", "eval_fixed_users_real_staging.json");

function loadFixedUsers() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found: ${CONFIG_PATH}\nRun provision_eval_v2_users.mjs first.`,
    );
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const users = config.users ?? [];
  const withIds = users.filter((u) => u.user_id);
  if (withIds.length === 0) {
    throw new Error("No provisioned user_ids in config. Run provision_eval_v2_users.mjs first.");
  }
  return withIds;
}

function isProcessAlive(pidLike) {
  const pid = Number(pidLike);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryAcquireLocalSlotLock(userId) {
  const lockPath = `/tmp/sophia_eval_real_staging_slot_${String(userId).replace(/[^a-zA-Z0-9_-]/g, "_")}.lock`;
  const acquire = () => {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, String(process.pid), "utf8");
    fs.closeSync(fd);
    return {
      ok: true,
      lockPath,
      release: () => {
        try { fs.unlinkSync(lockPath); } catch {}
      },
    };
  };
  try {
    return acquire();
  } catch (e) {
    const code = String(e?.code ?? "");
    if (code === "EEXIST") {
      try {
        const raw = String(fs.readFileSync(lockPath, "utf8") ?? "").trim();
        if (!isProcessAlive(raw)) {
          fs.unlinkSync(lockPath);
          return acquire();
        }
      } catch {
        // ignore and fall through to lock-not-acquired
      }
    }
    return { ok: false, lockPath, release: () => {} };
  }
}

async function fetchUserRunStats({ admin, userIds, activeRunTtlMs }) {
  const uidSet = new Set((userIds ?? []).map((u) => String(u)));
  if (uidSet.size === 0) return { activeUserIds: new Set(), lastUsedByUser: new Map(), staleRuns: [] };
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .select("id,status,created_at,config,metrics")
    .order("created_at", { ascending: false })
    .limit(800);
  if (error) throw error;

  const activeStatuses = new Set(["running", "queued", "pending"]);
  const activeUserIds = new Set();
  const lastUsedByUser = new Map();
  const staleRuns = [];
  const nowMs = Date.now();
  for (const r of data ?? []) {
    const uid = String(r?.config?.test_user_id ?? "");
    if (!uidSet.has(uid)) continue;
    const status = String(r?.status ?? "").toLowerCase();
    if (activeStatuses.has(status)) {
      const createdMs = Date.parse(String(r?.created_at ?? ""));
      const ageMs = Number.isFinite(createdMs) ? Math.max(0, nowMs - createdMs) : 0;
      const hasCompletedAt = Boolean(r?.metrics?.completed_at);
      const isStale = hasCompletedAt || (Number.isFinite(createdMs) && ageMs > activeRunTtlMs);
      if (isStale) {
        staleRuns.push({
          id: String(r?.id ?? ""),
          userId: uid,
          status,
          createdAt: String(r?.created_at ?? ""),
          ageSec: Math.floor(ageMs / 1000),
        });
      } else {
        activeUserIds.add(uid);
      }
    }
    if (!lastUsedByUser.has(uid)) {
      const ts = Date.parse(String(r?.created_at ?? ""));
      if (Number.isFinite(ts)) lastUsedByUser.set(uid, ts);
    }
  }
  return { activeUserIds, lastUsedByUser, staleRuns };
}

async function fetchEvalRunByRequestId(admin, requestId) {
  const req = String(requestId ?? "").trim();
  if (!req) return null;
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .select("id,status,created_at,config,metrics,error")
    .eq("config->>request_id", req)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function reclaimStaleRuns(admin, staleRuns) {
  const uniqueIds = [...new Set((staleRuns ?? []).map((r) => String(r?.id ?? "")).filter(Boolean))];
  if (uniqueIds.length === 0) return 0;
  const note = `auto_completed_stale_eval_slot:${new Date().toISOString()}`;
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .update({ status: "completed", error: note })
    .in("id", uniqueIds)
    .in("status", ["running", "queued", "pending"])
    .select("id");
  if (error) {
    console.warn(`[V2 Eval] Failed to reclaim stale runs: ${error.message}`);
    return 0;
  }
  const reclaimed = Array.isArray(data) ? data.length : 0;
  if (reclaimed > 0) {
    const byUser = new Map();
    for (const r of staleRuns ?? []) {
      const uid = String(r?.userId ?? "");
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(r);
    }
    const summary = [...byUser.entries()]
      .map(([uid, rows]) => `${uid.slice(0, 8)}(${rows.length})`)
      .join(", ");
    console.warn(`[V2 Eval] Reclaimed stale slot runs: ${reclaimed} row(s) [${summary}]`);
  }
  return reclaimed;
}

async function pickAvailableUser({ admin, fixedUsers, preferredSlot, waitForFreeSlotMs, activeRunTtlMs }) {
  const start = Date.now();
  while (true) {
    const userIds = fixedUsers.map((u) => String(u.user_id));
    const { activeUserIds, lastUsedByUser, staleRuns } = await fetchUserRunStats({
      admin,
      userIds,
      activeRunTtlMs,
    });
    if (Array.isArray(staleRuns) && staleRuns.length > 0) {
      const reclaimed = await reclaimStaleRuns(admin, staleRuns);
      if (reclaimed > 0) {
        // Recompute immediately after reclaiming stale active rows.
        continue;
      }
    }

    let candidates = fixedUsers;
    if (preferredSlot) {
      candidates = fixedUsers.filter((u) => Number(u.slot) === Number(preferredSlot));
      if (candidates.length === 0) throw new Error(`Slot ${preferredSlot} not found in config.`);
    }

    // Filter out currently active users first.
    const free = candidates.filter((u) => !activeUserIds.has(String(u.user_id)));
    // LRU among free users: oldest last run first, never-used first.
    free.sort((a, b) => {
      const ta = lastUsedByUser.get(String(a.user_id)) ?? 0;
      const tb = lastUsedByUser.get(String(b.user_id)) ?? 0;
      return ta - tb;
    });

    for (const u of free) {
      const lock = tryAcquireLocalSlotLock(u.user_id);
      if (lock.ok) {
        return { user: u, lock, waitedMs: Date.now() - start };
      }
    }

    const waited = Date.now() - start;
    if (waited >= waitForFreeSlotMs) {
      const activeList = [...activeUserIds].slice(0, 20).join(", ");
      throw new Error(
        `No free slot available after ${Math.floor(waited / 1000)}s. Active user_ids=${activeList || "(none)"}`
      );
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

// ─── Reset machine state (abracadabra-style) ──────────────────────────────────
// Clears:
// - user_chat_states (temp_memory + investigation_state + current_mode)
// - chat_messages for this user+scope
// - user_actions status back to active for preseed actions (so scenario can deactivate them)
// - conversation_eval_runs / events related to this user (optional cleanup)
async function resetUserForEval(admin, userId, scope = "web") {
  console.log(`[Reset] Resetting user ${userId} (scope=${scope})…`);

  // 1. Clear chat state (reset machines, investigation, temp_memory)
  const { error: csErr } = await admin
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
    .eq("scope", scope);
  if (csErr) console.warn(`[Reset] chat_states update error: ${csErr.message}`);

  // 2. Delete all chat messages for this user/scope
  const { error: msgErr } = await admin
    .from("chat_messages")
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope);
  if (msgErr) console.warn(`[Reset] chat_messages delete error: ${msgErr.message}`);

  // 3. Reset all actions to active (so they can be re-evaluated in tests)
  const { error: actErr } = await admin
    .from("user_actions")
    .update({
      status: "active",
      current_reps: 0,
      // Push checks back in time so bilan can include items again.
      last_performed_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    })
    .eq("user_id", userId);
  if (actErr) console.warn(`[Reset] user_actions reset error: ${actErr.message}`);

  // 4. Reset vital signs timestamps so bilan can include vitals again when enabled.
  const { error: vitErr } = await admin
    .from("user_vital_signs")
    .update({
      status: "active",
      last_checked_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    })
    .eq("user_id", userId);
  if (vitErr) console.warn(`[Reset] user_vital_signs reset error: ${vitErr.message}`);

  // 5. Clear prior checkup logs to avoid "bilan already done today" false positives.
  const { error: checkupErr } = await admin
    .from("user_checkup_logs")
    .delete()
    .eq("user_id", userId);
  if (checkupErr) console.warn(`[Reset] user_checkup_logs delete error: ${checkupErr.message}`);

  // 6. Delete turn_summary_logs for this user (clean slate for fresh export)
  const { error: tsErr } = await admin
    .from("turn_summary_logs")
    .delete()
    .eq("user_id", userId);
  if (tsErr) console.warn(`[Reset] turn_summary_logs delete error: ${tsErr.message}`);

  console.log(`[Reset] Done for user ${userId}.`);
}

// ─── Seed preseed_action_entries (completed/missed history rows) ─────────────
async function seedPreseedActionEntries(admin, userId, preseedEntries) {
  const entries = Array.isArray(preseedEntries) ? preseedEntries : [];
  if (entries.length === 0) return;
  const { data: actions, error: actErr } = await admin
    .from("user_actions")
    .select("id,title")
    .eq("user_id", userId)
    .in("status", ["active", "pending"]);
  if (actErr) {
    console.warn(`[Seed] Could not load user_actions for preseed entries: ${actErr.message}`);
    return;
  }
  const byTitle = new Map();
  for (const a of actions ?? []) {
    const t = String(a?.title ?? "").trim().toLowerCase();
    if (t) byTitle.set(t, a);
  }
  const rows = [];
  for (const spec of entries) {
    const title = String(spec?.title ?? "").trim();
    if (!title) continue;
    const found = byTitle.get(title.toLowerCase());
    if (!found?.id) continue;
    const days = Math.max(0, Math.min(30, Number(spec?.days ?? 0) || 0));
    if (!days) continue;
    const status = String(spec?.status ?? "missed").trim().toLowerCase();
    for (let i = days; i >= 1; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      d.setUTCHours(12, 0, 0, 0);
      rows.push({
        user_id: userId,
        action_id: String(found.id),
        action_title: String(found.title),
        status,
        value: null,
        note: spec?.note ?? null,
        performed_at: d.toISOString(),
      });
    }
  }
  if (rows.length === 0) return;
  const { error: insErr } = await admin.from("user_action_entries").insert(rows);
  if (insErr) console.warn(`[Seed] preseed_action_entries insert error: ${insErr.message}`);
}

// ─── Seed vital signs if scenario requires them ─────────────────────────────────
async function seedBilanVitalIfNeeded(admin, userId, planId, scenario) {
  const setup = scenario?.setup ?? {};
  const includeVitalsInBilan =
    (Array.isArray(scenario?.tags) && scenario.tags.includes("bilan.vitals")) ||
    Boolean(scenario?.assertions?.include_vitals_in_bilan);

  // Always clear previous vitals so each scenario controls whether vitals are present.
  const { error: delErr } = await admin.from("user_vital_signs").delete().eq("user_id", userId);
  if (delErr) console.warn(`[Seed] user_vital_signs cleanup error: ${delErr.message}`);
  if (!includeVitalsInBilan) return;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const preseedVitals = Array.isArray(setup.preseed_vitals) && setup.preseed_vitals.length > 0
    ? setup.preseed_vitals
    : [{ label: "Sommeil", unit: "h", tracking_type: "counter" }];

  for (const v of preseedVitals) {
    const { error: vErr } = await admin.from("user_vital_signs").insert({
      user_id: userId,
      plan_id: planId,
      label: v.label ?? "Sommeil",
      unit: v.unit ?? "h",
      current_value: v.current_value ?? "",
      target_value: v.target_value ?? "",
      status: "active",
      tracking_type: v.tracking_type ?? "counter",
      last_checked_at: twoDaysAgo,
    });
    if (vErr) console.warn(`[Seed] user_vital_signs insert error (${v.label}): ${vErr.message}`);
  }
  console.log(`[Seed] ${preseedVitals.length} vital(s) seeded for user ${userId}.`);
}

// ─── Seed investigation_state fixture (CheckupItems with is_habit + weekly_target_status) ─
async function seedInvestigationStateFixture(admin, userId, scenario) {
  const setup = scenario?.setup ?? {};
  const activeCount = (() => {
    const explicit = Number(setup?.bilan_actions_count ?? NaN);
    if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
    const preseed = Array.isArray(setup?.preseed_actions) ? setup.preseed_actions.length : 0;
    return Math.max(0, Math.min(12, preseed));
  })();
  if (activeCount <= 0) return;

  const { data: actions } = await admin
    .from("user_actions")
    .select("id,title,description,tracking_type,target_reps,current_reps,type,scheduled_days,time_of_day")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true })
    .limit(50);

  const { data: vitals } = await admin
    .from("user_vital_signs")
    .select("id,label,tracking_type,unit,target_value")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(5);

  // Fetch latest vital entries for progression context
  const vitalIds = (vitals ?? []).map((v) => v.id);
  const vitalEntriesMap = new Map();
  for (const vid of vitalIds) {
    try {
      const { data: entry } = await admin
        .from("user_vital_sign_entries")
        .select("value")
        .eq("user_id", userId)
        .eq("vital_sign_id", vid)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (entry?.value) vitalEntriesMap.set(vid, String(entry.value));
    } catch {}
  }

  const pendingActions = (actions ?? []).slice(0, activeCount).map((a) => {
    const isHabit = String(a.type ?? "") === "habit";
    const scheduledDays = Array.isArray(a.scheduled_days) ? a.scheduled_days : [];
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
      scheduled_days: scheduledDays.length > 0 ? scheduledDays : undefined,
      is_scheduled_day: true,
      day_scope: "today",
      time_of_day: a.time_of_day ?? undefined,
    };
  });

  const pendingVitals = (vitals ?? []).slice(0, 1).map((v) => ({
    id: v.id,
    type: "vital",
    title: v.label,
    tracking_type: v.tracking_type ?? "counter",
    unit: v.unit ?? "",
    day_scope: "today",
    previous_vital_value: vitalEntriesMap.get(v.id) ?? undefined,
    target_vital_value: v.target_value != null ? String(v.target_value) : undefined,
  }));

  const pendingItems = [...pendingVitals, ...pendingActions];
  if (pendingItems.length === 0) return;

  const investigationState = {
    status: "checking",
    pending_items: pendingItems,
    current_item_index: 0,
    temp_memory: { opening_done: false },
  };

  const { error: stErr } = await admin.from("user_chat_states").upsert({
    user_id: userId,
    scope: "web",
    current_mode: "investigator",
    risk_level: 0,
    investigation_state: investigationState,
  }, { onConflict: "user_id,scope" });
  if (stErr) console.warn(`[Seed] investigation_state fixture upsert error: ${stErr.message}`);
  else console.log(`[Seed] investigation_state seeded: ${pendingItems.length} items (${pendingVitals.length} vitals, ${pendingActions.length} actions)`);

  return investigationState;
}

// ─── Seed plan for user if needed (from scenario setup) ────────────────────────
// Returns the initial investigation_state object (if seeded), or null.
async function ensurePlanSeeded(admin, userId, scenario, opts = {}) {
  const seedInvestigationState = opts?.seedInvestigationState !== false;
  const setup = scenario?.setup ?? {};
  const seedPlan = setup?.seed_plan !== false;
  if (!seedPlan) return null;
  const staleTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Check if user already has an active plan
  const { data: existingPlans } = await admin
    .from("user_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (existingPlans && existingPlans.length > 0) {
    console.log(`[Seed] User ${userId} already has an active plan, skipping plan seed.`);

    // But reset preseed actions if defined
    const preseedActions = Array.isArray(setup.preseed_actions) ? setup.preseed_actions : [];
    if (preseedActions.length > 0) {
      // Get the plan_id
      const planId = existingPlans[0].id;

      // Delete existing actions and re-create them
      await admin.from("user_actions").delete().eq("user_id", userId).eq("plan_id", planId);

      for (const a of preseedActions) {
        const { error: actErr } = await admin.from("user_actions").insert({
          user_id: userId,
          plan_id: planId,
          type: a.type ?? "habit",
          title: a.title ?? null,
          description: a.description ?? "",
          target_reps: typeof a.target_reps === "number" ? a.target_reps : 1,
          current_reps: typeof a.current_reps === "number" ? a.current_reps : 0,
          status: a.status ?? "active",
          tracking_type: a.tracking_type ?? "boolean",
          time_of_day: a.time_of_day ?? "any_time",
          scheduled_days: Array.isArray(a.scheduled_days) ? a.scheduled_days : null,
          last_performed_at: staleTs,
        });
        if (actErr) console.warn(`[Seed] action insert error: ${actErr.message}`);
      }
      console.log(`[Seed] Re-created ${preseedActions.length} preseed actions for user ${userId}.`);
      await seedPreseedActionEntries(admin, userId, setup.preseed_action_entries);
      await seedBilanVitalIfNeeded(admin, userId, planId, scenario);
      const invState = seedInvestigationState
        ? await seedInvestigationStateFixture(admin, userId, scenario)
        : null;
      return invState ?? null;
    }
    return null;
  }

  // No active plan: create goal + plan + actions
  console.log(`[Seed] Seeding plan for user ${userId}…`);
  const submissionId = crypto.randomUUID();

  const { data: goalRow, error: goalErr } = await admin
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

  const { data: planRow, error: planErr } = await admin
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

  const preseedActions = Array.isArray(setup.preseed_actions) ? setup.preseed_actions : [];
  for (const a of preseedActions) {
    const { error: actErr } = await admin.from("user_actions").insert({
      user_id: userId,
      plan_id: planRow.id,
      submission_id: planRow.submission_id,
      type: a.type ?? "habit",
      title: a.title ?? null,
      description: a.description ?? "",
      target_reps: typeof a.target_reps === "number" ? a.target_reps : 1,
      current_reps: typeof a.current_reps === "number" ? a.current_reps : 0,
      status: a.status ?? "active",
      tracking_type: a.tracking_type ?? "boolean",
      time_of_day: a.time_of_day ?? "any_time",
      scheduled_days: Array.isArray(a.scheduled_days) ? a.scheduled_days : null,
      last_performed_at: staleTs,
    });
    if (actErr) console.warn(`[Seed] action insert error: ${actErr.message}`);
  }

  await seedPreseedActionEntries(admin, userId, setup.preseed_action_entries);
  await seedBilanVitalIfNeeded(admin, userId, planRow.id, scenario);
  const invState = seedInvestigationState
    ? await seedInvestigationStateFixture(admin, userId, scenario)
    : null;

  console.log(`[Seed] Plan seeded with ${preseedActions.length} actions.`);
  return invState ?? null;
}

// ─── Invoke run-evals (same logic as run_tool_evals.mjs but with fixed user) ──
function invokeRunEvalsJson({ url, anonKey, accessToken, body, timeoutMs: timeoutMsInput }) {
  const timeoutMs = Math.max(60_000, Number(timeoutMsInput) || 900000); // 15min default
  const maxTimeSec = Math.max(60, Math.ceil(timeoutMs / 1000));
  const tmp = `/tmp/sophia_eval_v2_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  fs.writeFileSync(tmp, JSON.stringify(body ?? {}, null, 0), "utf8");
  try {
    const requestId = String(body?.limits?._run_request_id ?? crypto.randomUUID());
    const args = [
      "-sS",
      "--max-time", String(maxTimeSec),
      "-X", "POST",
      `${url}/functions/v1/run-evals`,
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${accessToken}`,
      "-H", `apikey: ${anonKey}`,
      "-H", `x-request-id: ${requestId}`,
      "--data-binary", `@${tmp}`,
    ];
    const res = spawnSync("curl", args, {
      encoding: "utf8",
      timeout: Math.max(65_000, timeoutMs + 2_000),
      killSignal: "SIGKILL",
    });
    if (res.error) throw res.error;
    if ((res.status ?? 0) !== 0) {
      throw new Error(`curl failed (status=${res.status ?? "null"}): ${(res.stderr ?? "").slice(0, 400)}`);
    }
    const rawText = String(res.stdout ?? "");
    let json = {};
    try { json = rawText ? JSON.parse(rawText) : {}; } catch { json = { _raw: rawText }; }
    if (json?.error) {
      const err = json.error;
      throw new Error(`run-evals error: ${(typeof err === "string" ? err : JSON.stringify(err)).slice(0, 800)}`);
    }
    return json;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function markRunCompletedByRequestId(admin, requestId, errorText) {
  const req = String(requestId ?? "").trim();
  if (!req) return 0;
  const err = String(errorText ?? "").slice(0, 700) || "run timeout";
  for (let i = 0; i < 3; i++) {
    try {
      const { data, error } = await admin
        .from("conversation_eval_runs")
        .update({ status: "completed", error: err })
        .eq("config->>request_id", req)
        .in("status", ["running", "queued", "pending"])
        .select("id");
      if (error) {
        if (i === 2) {
          console.warn(`[V2 Eval] Failed to mark run completed for request_id=${req}: ${error.message}`);
          return 0;
        }
      } else {
        return Array.isArray(data) ? data.length : 0;
      }
    } catch (e) {
      if (i === 2) {
        console.warn(`[V2 Eval] Failed to mark run completed for request_id=${req}: ${String(e?.message ?? e)}`);
        return 0;
      }
    }
    await new Promise((r) => setTimeout(r, 500 + i * 400));
  }
  return 0;
}

// ─── Export bundle with the exact same prod exporter (transcript + trace + json) ─
function exportBundleUsingProdScript({ url, serviceRoleKey, userId, sinceIso, untilIso, scenarioKey, slot }) {
  const repoRoot = path.resolve(process.cwd(), "..");
  const exporter = path.join(repoRoot, "scripts", "export_user_bundle_prod.mjs");
  const userShort = String(userId).slice(0, 8);
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const bundleId = `v2_${scenarioKey}_slot${slot}_${userShort}_${stamp}`;
  const outDir = path.join(repoRoot, "tmp", "bundles_v2", new Date().toISOString().slice(0, 10), bundleId);
  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    exporter,
    "--prod",
    "--user-id", String(userId),
    "--scope", "web",
    "--since", String(sinceIso),
    "--until", String(untilIso),
    "--bundle-id", bundleId,
    "--out-dir", outDir,
    "--write-meta",
  ];
  const env = {
    ...process.env,
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
  const res = spawnSync("node", args, { cwd: repoRoot, env, encoding: "utf8" });
  if (res.error) throw res.error;
  if ((res.status ?? 0) !== 0) {
    throw new Error(`export_user_bundle_prod failed (status=${res.status ?? "null"}): ${(res.stderr ?? "").slice(0, 800)}`);
  }
  let meta = {};
  try {
    meta = JSON.parse(String(res.stdout ?? "{}"));
  } catch {
    meta = { _raw: String(res.stdout ?? "").slice(0, 1200) };
  }
  return { outDir, meta };
}

// ─── Ensure master admin session (for run-evals auth) ──────────────────────────
async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = process.env.SOPHIA_MASTER_ADMIN_EMAIL || "thomasgenty15@gmail.com";
  const password = process.env.SOPHIA_MASTER_ADMIN_PASSWORD || "123456";

  let { data: signIn, error: signErr } = await authed.auth.signInWithPassword({ email, password });
  if (signErr || !signIn?.session?.access_token) {
    // Try create + sign in
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
    const found = (listed?.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === email.toLowerCase());
    if (!found?.id) {
      await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Master Admin" } });
    } else {
      await admin.auth.admin.updateUserById(found.id, { password });
    }
    const r2 = await authed.auth.signInWithPassword({ email, password });
    if (r2.error) throw r2.error;
    signIn = r2.data;
  }

  await admin.from("internal_admins").upsert({ user_id: signIn.user.id });
  return { admin, accessToken: signIn.session.access_token };
}

// ─── Main: orchestrate reset → run → export ────────────────────────────────────
async function runOneSlot({ url, anonKey, serviceRoleKey, accessToken, admin, scenario, user, args }) {
  const userId = user.user_id;
  const slot = user.slot;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`[V2 Eval] Slot ${slot} — User ${userId} — Scenario: ${scenario.id}`);
  console.log(`${"═".repeat(60)}`);

  // 1. Reset user machine state
  await resetUserForEval(admin, userId, "web");

  // 2. Re-seed plan / actions from scenario + capture initial investigation_state
  const initialInvestigationState = await ensurePlanSeeded(admin, userId, scenario, {
    seedInvestigationState: !args.noBilan,
  });

  // 3. Record start time
  const startIso = new Date().toISOString();
  const startMs = Date.now();
  const runDeadlineMs = startMs + Math.max(60_000, Number(args?.runTimeoutMs) || 15 * 60 * 1000);

  // 4. Build run-evals body (use fixed user)
  const runRequestId = `eval_v2:${scenario.id}:slot${slot}:${Date.now()}`;
  const setup = scenario?.setup ?? {};
  const inferredBilanActionsCount = (() => {
    if (args.noBilan) return 0;
    const explicit = Number(setup?.bilan_actions_count ?? NaN);
    if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
    const preseed = Array.isArray(setup?.preseed_actions) ? setup.preseed_actions.length : 0;
    return Math.max(0, Math.min(12, preseed));
  })();

  const limits = {
    max_scenarios: 1,
    max_turns_per_scenario: args.turns,
    bilan_actions_count: inferredBilanActionsCount,
    test_post_checkup_deferral: args.noBilan
      ? false
      : Boolean(setup?.test_post_checkup_deferral),
    user_difficulty: "hard",
    stop_on_first_failure: false,
    budget_usd: 0,
    model: args.model,
    use_real_ai: true,
    judge_force_real_ai: false,
    judge_async: false,
    manual_judge: true,
    use_pre_generated_plans: false,
    pre_generated_plans_required: false,
    keep_test_user: true,
    _run_request_id: runRequestId,
    max_wall_clock_ms_per_request: 150000,
    // V2: use fixed user instead of creating ephemeral ones
    _fixed_test_user_id: userId,
  };

  // 5. Invoke run-evals (with retry loop)
  let data = null;
  let lastInvokeError = null;
  for (let i = 0; i < 30; i++) {
    const remainingMs = runDeadlineMs - Date.now();
    if (remainingMs <= 0) {
      const timeoutMsg = `auto_completed_timeout:${Math.max(60_000, Number(args?.runTimeoutMs) || 15 * 60 * 1000)}ms`;
      try {
        await Promise.race([
          markRunCompletedByRequestId(admin, runRequestId, timeoutMsg),
          new Promise((resolve) => setTimeout(() => resolve(0), 3000)),
        ]);
      } catch {}
      data = {
        forced_timeout: true,
        message: `forced_completed_after_timeout:${timeoutMsg}`,
        results: [{
          eval_run_id: "",
          test_user_id: String(userId),
          turns_executed: 0,
        }],
      };
      console.warn(`[V2 Eval] Run timeout reached (${timeoutMsg}); force-completed to release slot.`);
      break;
    }

    let invokeError = null;
    try {
      data = invokeRunEvalsJson({
        url,
        anonKey,
        accessToken,
        body: { scenarios: [scenario], limits },
        timeoutMs: Math.max(60_000, Math.min(remainingMs, Number(args?.invokeTimeoutMs) || (3 * 60 * 1000))),
      });
      lastInvokeError = null;
    } catch (e) {
      invokeError = e;
      lastInvokeError = e;
    }

    if (invokeError) {
      const msg = String((invokeError && invokeError.message) ? invokeError.message : invokeError ?? "");
      const isTransientInvoke =
        /curl failed|recv failure|connection reset|empty reply|timed out|timeout|etimedout|temporar|429|502|503|504|upstream|network/i
          .test(msg.toLowerCase());
      if (isTransientInvoke) {
        const backoff = Math.min(15000, 1000 + i * 900);
        console.warn(`[V2 Eval] Transient invoke error (retry ${i + 1}, backoff ${backoff}ms): ${msg.slice(0, 180)}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw invokeError;
    }

    const msg = String(data?.message ?? data?.error?.message ?? "");
    const hasResults = Array.isArray(data?.results) && data.results.length > 0;
    const isEmptyPayload =
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Object.keys(data).length === 0;
    if (isEmptyPayload) {
      const backoff = Math.min(10000, 700 + i * 700);
      console.warn(`[V2 Eval] Empty run-evals payload (retry ${i + 1}, backoff ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    const isWorkerLimit = /WORKER_LIMIT|resource limit/i.test(msg) || String(data?.code ?? "").toUpperCase() === "WORKER_LIMIT";
    if (isWorkerLimit) {
      const backoff = Math.min(12000, 800 + i * 700);
      console.warn(`[V2 Eval] WORKER_LIMIT (retry ${i + 1}, backoff ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (data?.partial === true || data?.resume === true) {
      await new Promise((r) => setTimeout(r, 650));
      continue;
    }
    const isTransient = /invalid response|upstream|502|503|504|bad gateway|empty reply|connection reset|timeout/i.test(msg + String(data?._raw ?? ""));
    if (!hasResults && isTransient) {
      const backoff = Math.min(10000, 750 + i * 750);
      console.warn(`[V2 Eval] Transient failure (retry ${i + 1}, backoff ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (!hasResults) {
      let runRow = null;
      try {
        runRow = await fetchEvalRunByRequestId(admin, runRequestId);
      } catch {}
      const rowStatus = String(runRow?.status ?? "").toLowerCase();
      if (rowStatus === "completed") {
        data = {
          ...(data && typeof data === "object" ? data : {}),
          recovered_from_db: true,
          results: [{
            eval_run_id: String(runRow?.id ?? ""),
            test_user_id: String(runRow?.config?.test_user_id ?? userId),
            turns_executed: Number(runRow?.metrics?.turns_executed ?? args.turns),
          }],
        };
        break;
      }
      if (rowStatus === "running" || rowStatus === "queued" || rowStatus === "pending") {
        const backoff = Math.min(12000, 900 + i * 800);
        console.warn(`[V2 Eval] Run row still ${rowStatus || "active"} without payload (retry ${i + 1}, backoff ${backoff}ms)`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (rowStatus === "failed") {
        throw new Error(`run-evals row failed for request ${runRequestId}: ${String(runRow?.error ?? "unknown")}`);
      }
      const backoff = Math.min(8000, 600 + i * 600);
      console.warn(`[V2 Eval] Missing results payload (retry ${i + 1}, backoff ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    break;
  }
  if (!data) {
    if (lastInvokeError) throw lastInvokeError;
    throw new Error("run-evals did not return data after retries");
  }

  // 6. Record end time
  const endIso = new Date().toISOString();
  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`[V2 Eval] Run finished in ${durationSec}s`);

  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) {
    console.warn(`[V2 Eval] ⚠️  No results returned. Raw:`, JSON.stringify(data ?? {}).slice(0, 500));
  }

  const usedUserId = String(results?.[0]?.test_user_id ?? userId);
  if (usedUserId !== userId) {
    console.warn(
      `[V2 Eval] WARNING: run-evals used a different test_user_id than fixed slot user. fixed=${userId} used=${usedUserId}`,
    );
  }
  // Keep a small margin because writes to DB can arrive a few seconds after end of HTTP response.
  const sinceIso = new Date(new Date(startIso).getTime() - 30_000).toISOString();
  const untilIso = new Date(new Date(endIso).getTime() + 120_000).toISOString();

  // 7. Export bundle with the exact prod exporter.
  console.log(`[V2 Eval] Exporting prod-style bundle for user=${usedUserId}, interval ${sinceIso} → ${untilIso}…`);
  const exported = exportBundleUsingProdScript({
    url,
    serviceRoleKey,
    userId: usedUserId,
    sinceIso,
    untilIso,
    scenarioKey: String(scenario?.id ?? args.scenario),
    slot,
  });
  const bundleDir = exported.outDir;

  // 8. Save run-evals response alongside transcript/trace.
  fs.writeFileSync(path.join(bundleDir, "run_evals_response.json"), JSON.stringify(data, null, 2), "utf8");
  fs.writeFileSync(
    path.join(bundleDir, "eval_v2_debug.json"),
    JSON.stringify(
      {
        fixed_slot_user_id: userId,
        run_evals_test_user_id: usedUserId,
        requested_interval: { startIso, endIso },
        export_interval: { sinceIso, untilIso },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const counts = exported?.meta?.counts ?? {};
  console.log(`[V2 Eval] Bundle exported to: ${bundleDir}`);
  console.log(`  chat_messages: ${counts.chat_messages ?? "?"}`);
  console.log(`  turn_summary_logs: ${counts.turn_summary_logs ?? "?"}`);
  console.log(`  request_ids: ${counts.request_ids ?? "?"}`);

  // 9. Export initial investigation_state to bundle (for seed verification).
  if (initialInvestigationState) {
    fs.writeFileSync(
      path.join(bundleDir, "investigation_state_initial.json"),
      JSON.stringify(initialInvestigationState, null, 2) + "\n",
      "utf8",
    );
    console.log(`[V2 Eval] Initial investigation_state exported (${initialInvestigationState.pending_items?.length ?? 0} items).`);
  }

  // 10. Post-run restore: reset + re-seed so the next run starts from a clean state.
  console.log(`[V2 Eval] Post-run restore: resetting user ${userId} to initial state…`);
  await resetUserForEval(admin, userId, "web");
  await ensurePlanSeeded(admin, userId, scenario, {
    seedInvestigationState: !args.noBilan,
  });
  console.log(`[V2 Eval] Post-run restore complete.`);

  return { slot, fixedUserId: userId, usedUserId, bundleDir, counts, results, durationSec };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = mustEnv("SOPHIA_SUPABASE_URL");
  const anonKey = mustEnv("SOPHIA_SUPABASE_ANON_KEY");
  const serviceRoleKey = mustEnv("SOPHIA_SUPABASE_SERVICE_ROLE_KEY");

  // Load scenario
  const scenarioDir = path.join(process.cwd(), "eval", "scenarios", "tools");
  const scenarioFile = path.join(scenarioDir, `${args.scenario}.json`);
  if (!fs.existsSync(scenarioFile)) {
    const available = fs.readdirSync(scenarioDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    throw new Error(`Scenario not found: ${args.scenario}\nAvailable: ${available.join(", ")}`);
  }
  const scenarioBase = JSON.parse(fs.readFileSync(scenarioFile, "utf8"));
  const scenarios = materializeScenarioVariants({ scenario: scenarioBase, variant: args.variant });
  console.log(`[V2 Eval] Loaded scenario base: ${scenarioBase.id}`);
  console.log(`[V2 Eval] Variants selected: ${scenarios.map((s) => s.id).join(", ")}`);

  // Load fixed users
  const fixedUsers = loadFixedUsers();
  console.log(`[V2 Eval] ${fixedUsers.length} fixed users available.`);

  // Auth
  const { admin, accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  // Determine slot strategy:
  // - --all-slots: fixed sequential list
  // - --slot N: lock that specific slot (wait if busy)
  // - default: auto-pick free least-recently-used slot
  const slotMode = args.allSlots ? "all" : (args.slot ? "fixed" : "auto");
  console.log(`[V2 Eval] Slot mode=${slotMode}`);
  console.log(`[V2 Eval] Active run TTL=${Math.floor(args.activeRunTtlMs / 1000)}s`);
  console.log(`[V2 Eval] Run hard timeout=${Math.floor(args.runTimeoutMs / 1000)}s`);
  console.log(`[V2 Eval] Invoke timeout=${Math.floor(args.invokeTimeoutMs / 1000)}s`);
  console.log(`[V2 Eval] No bilan mode=${args.noBilan ? "on" : "off"}`);

  const allResults = [];
  for (const scenario of scenarios) {
    if (args.allSlots) {
      for (const user of fixedUsers) {
        const lock = tryAcquireLocalSlotLock(user.user_id);
        if (!lock.ok) {
          console.warn(`[V2 Eval] Slot ${user.slot} locked locally; skipping this slot for now.`);
          continue;
        }
        try {
          const result = await runOneSlot({
            url, anonKey, serviceRoleKey, accessToken, admin,
            scenario, user, args,
          });
          allResults.push(result);
        } finally {
          lock.release();
        }
      }
    } else {
      const picked = await pickAvailableUser({
        admin,
        fixedUsers,
        preferredSlot: args.slot ?? null,
        waitForFreeSlotMs: args.waitForFreeSlotMs,
        activeRunTtlMs: args.activeRunTtlMs,
      });
      if (picked.waitedMs > 0) {
        console.log(`[V2 Eval] Slot acquired after ${Math.floor(picked.waitedMs / 1000)}s: slot ${picked.user.slot}`);
      }
      try {
        const result = await runOneSlot({
          url, anonKey, serviceRoleKey, accessToken, admin,
          scenario, user: picked.user, args,
        });
        allResults.push(result);
      } finally {
        picked.lock.release();
      }
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("[V2 Eval] ALL RUNS COMPLETE");
  console.log(`${"═".repeat(60)}`);
  for (const r of allResults) {
    console.log(
      `  Slot ${r.slot}: fixed=${r.fixedUserId} used=${r.usedUserId} | messages=${r.counts?.chat_messages ?? "?"}, summaries=${r.counts?.turn_summary_logs ?? "?"}, ${r.durationSec}s → ${r.bundleDir}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  getCompletedStreakDays,
  getMissedStreakDays,
  getYesterdayCheckupSummary,
  maybeHandleStreakAfterLog,
} from "./agents/investigator.ts";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

function isoDay(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(day: string, delta: number): string {
  const [y, m, dd] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return isoDay(dt);
}

function isoAt(day: string, hh = 12, mm = 0, ss = 0): string {
  return `${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`;
}

async function createTestUserAndSeedPlan(admin: any, anon: any) {
  const nonce = makeNonce();
  const email = `investigator+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone, full_name: "Investigator Test" } },
  });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const userId = signInData.user?.id;
  if (!userId) throw new Error("Missing user id");

  // Ensure profile exists + mark onboarding complete (safe best-effort)
  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  const submissionId = crypto.randomUUID();
  const { data: goalRow, error: goalErr } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "AX_TEST",
      axis_title: "Axis test",
      theme_id: "TH_TEST",
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
      title: "Investigator plan",
      generation_attempts: 0,
      content: { phases: [{ id: 1, title: "P1", status: "active", actions: [] }] },
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  return { userId, submissionId, planId: planRow.id as string };
}

async function seedAction(admin: any, userId: string, planId: string, submissionId: string, title: string) {
  const { data, error } = await admin
    .from("user_actions")
    .insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      type: "habit",
      title,
      description: "Test action",
      target_reps: 7,
      current_reps: 0,
      status: "active",
      tracking_type: "boolean",
      time_of_day: "morning",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

Deno.test("investigator: getMissedStreakDays counts consecutive missed days", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, planId, submissionId } = await createTestUserAndSeedPlan(admin, anon);
  const actionId = await seedAction(admin, userId, planId, submissionId, "Action Missed");

  const today = isoDay(new Date());
  const days = [today, addDays(today, -1), addDays(today, -2), addDays(today, -3), addDays(today, -4)];
  for (let i = 0; i < days.length; i++) {
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: actionId,
      action_title: "Action Missed",
      status: "missed",
      note: i % 2 === 0 ? "trop fatigué" : "pas le temps",
      performed_at: isoAt(days[i], 12, i, 0),
    });
    if (error) throw error;
  }

  const streak = await getMissedStreakDays(admin as any, userId, actionId);
  assertEquals(streak, 5);
});

Deno.test("investigator: getCompletedStreakDays counts consecutive completed days", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, planId, submissionId } = await createTestUserAndSeedPlan(admin, anon);
  const actionId = await seedAction(admin, userId, planId, submissionId, "Action Win");

  const today = isoDay(new Date());
  const days = [today, addDays(today, -1), addDays(today, -2)];
  for (let i = 0; i < days.length; i++) {
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: actionId,
      action_title: "Action Win",
      status: "completed",
      performed_at: isoAt(days[i], 12, i, 0),
    });
    if (error) throw error;
  }

  const streak = await getCompletedStreakDays(admin as any, userId, actionId);
  assertEquals(streak, 3);
});

Deno.test("investigator: getYesterdayCheckupSummary builds a mini-summary", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, planId, submissionId } = await createTestUserAndSeedPlan(admin, anon);
  const actionId = await seedAction(admin, userId, planId, submissionId, "Action Summary");

  const today = isoDay(new Date());
  const yday = addDays(today, -1);

  // Most recent completed yesterday => should become lastWinTitle
  const rows = [
    { status: "completed", action_title: "Win 2", note: null, performed_at: isoAt(yday, 20, 0, 0) },
    { status: "missed", action_title: "Lose 1", note: "trop fatigué", performed_at: isoAt(yday, 19, 0, 0) },
    { status: "missed", action_title: "Lose 2", note: "Fatigué ce soir", performed_at: isoAt(yday, 18, 0, 0) },
    { status: "completed", action_title: "Win 1", note: null, performed_at: isoAt(yday, 17, 0, 0) },
  ];
  for (const r of rows) {
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: actionId,
      action_title: r.action_title,
      status: r.status,
      note: r.note,
      performed_at: r.performed_at,
    });
    if (error) throw error;
  }

  const summary = await getYesterdayCheckupSummary(admin as any, userId);
  assertEquals(summary.completed, 2);
  assertEquals(summary.missed, 2);
  assertEquals(summary.lastWinTitle, "Win 2");
  assertEquals(summary.topBlocker, "fatigue");
});

Deno.test("investigator: post-log streak rules (>=3 win, >=5 missed) are deterministic in MEGA mode", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, planId, submissionId } = await createTestUserAndSeedPlan(admin, anon);
  const actionId = await seedAction(admin, userId, planId, submissionId, "Action Rules");

  const today = isoDay(new Date());
  // Seed 5 missed days for missed rule
  const missedDays = [today, addDays(today, -1), addDays(today, -2), addDays(today, -3), addDays(today, -4)];
  for (let i = 0; i < missedDays.length; i++) {
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: actionId,
      action_title: "Action Rules",
      status: "missed",
      note: "trop fatigué",
      performed_at: isoAt(missedDays[i], 12, i, 0),
    });
    if (error) throw error;
  }

  const baseState: any = {
    status: "checking",
    pending_items: [
      { id: actionId, type: "action", title: "Action Rules", tracking_type: "boolean" },
      { id: "dummy_next", type: "action", title: "Next", tracking_type: "boolean" },
    ],
    current_item_index: 0,
    temp_memory: {},
  };

  const missedIntercept = await maybeHandleStreakAfterLog({
    supabase: admin as any,
    userId,
    message: "non",
    currentState: baseState,
    currentItem: baseState.pending_items[0],
    argsWithId: { status: "missed", note: "trop fatigué" },
  });
  assert(missedIntercept, "expected missed streak intercept");
  assertEquals(missedIntercept!.content, "(missed_streak_offer_breakdown)");
  assertEquals(missedIntercept!.newState?.temp_memory?.breakdown?.stage, "awaiting_consent");

  // Seed 3 completed days for win rule (use a different action id to avoid mixing statuses)
  const winActionId = await seedAction(admin, userId, planId, submissionId, "Action Win Rules");
  const winDays = [today, addDays(today, -1), addDays(today, -2)];
  for (let i = 0; i < winDays.length; i++) {
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: winActionId,
      action_title: "Action Win Rules",
      status: "completed",
      performed_at: isoAt(winDays[i], 9, i, 0),
    });
    if (error) throw error;
  }

  const winState: any = {
    status: "checking",
    pending_items: [
      { id: winActionId, type: "action", title: "Action Win Rules", tracking_type: "boolean" },
      { id: "dummy_next", type: "action", title: "Next", tracking_type: "boolean" },
    ],
    current_item_index: 0,
    temp_memory: {},
  };

  const winIntercept = await maybeHandleStreakAfterLog({
    supabase: admin as any,
    userId,
    message: "oui",
    currentState: winState,
    currentItem: winState.pending_items[0],
    argsWithId: { status: "completed" },
  });
  assert(winIntercept, "expected win streak intercept");
  assertEquals(winIntercept!.content, "(win_streak_continue)");
  assertEquals(winIntercept!.newState?.current_item_index, 1);
});



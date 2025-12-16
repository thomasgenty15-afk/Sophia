import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleTracking } from "./lib/tracking.ts";
import { megaTestLogItem } from "./agents/investigator.ts";
import {
  megaToolCreateFramework,
  megaToolCreateSimpleAction,
  megaToolUpdateActionStructure,
} from "./agents/architect.ts";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

async function createTestUser(anon: any) {
  const nonce = makeNonce();
  const email = `tooltest+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone } },
  });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  if (!signInData.user) throw new Error("Missing user after sign-in");

  return { userId: signInData.user.id, email, phone };
}

async function seedActivePlan(admin: any, userId: string) {
  const submissionId = crypto.randomUUID();

  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  const { data: goalRow, error: goalErr } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "axis_test",
      axis_title: "Test Axis",
      theme_id: "theme_test",
      priority_order: 1,
    })
    .select("id")
    .single();
  if (goalErr) throw goalErr;
  const goalId = goalRow.id as string;

  const basePlanContent = {
    phases: [
      {
        id: "phase_1",
        title: "Phase 1",
        status: "active",
        actions: [
          {
            id: "act_sport",
            type: "habit",
            title: "Sport",
            description: "Faire du sport",
            questType: "side",
            targetReps: 3,
            tips: "",
            tracking_type: "boolean",
            time_of_day: "any_time",
            status: "active",
            isCompleted: false,
            currentReps: 0,
          },
        ],
      },
    ],
  };

  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalId,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "Tool plan",
      content: basePlanContent,
    })
    .select("id, submission_id")
    .single();
  if (planErr) throw planErr;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: actionRow, error: actionErr } = await admin
    .from("user_actions")
    .insert({
      user_id: userId,
      plan_id: planRow.id,
      submission_id: planRow.submission_id,
      title: "Sport",
      description: "Faire du sport",
      type: "habit",
      tracking_type: "boolean",
      time_of_day: "any_time",
      target_reps: 3,
      current_reps: 0,
      status: "active",
      last_performed_at: twoDaysAgo,
    })
    .select("id, current_reps, last_performed_at")
    .single();
  if (actionErr) throw actionErr;

  return { planId: planRow.id as string, submissionId, goalId, actionId: actionRow.id as string };
}

Deno.test("sophia-brain tools: track_progress + architect tools + investigator log_action_execution write expected DB rows", async () => {
  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId } = await createTestUser(anon);
  const { planId, actionId } = await seedActivePlan(admin, userId);

  // 1) Tool: track_progress (shared)
  {
    const msg = await handleTracking(admin as any, userId, {
      target_name: "Sport",
      value: 1,
      operation: "add",
      status: "completed",
    });
    assert(msg.includes("C'est noté"), "tracking should return a normal confirmation string");

    const { data: action, error } = await admin.from("user_actions").select("current_reps,last_performed_at").eq("id", actionId).single();
    if (error) throw error;
    assert((action as any).current_reps >= 1);
    assert((action as any).last_performed_at);

    const { count } = await admin
      .from("user_action_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_id", actionId);
    assert((count ?? 0) >= 1);
  }

  // 2) Tools: architect create_simple_action + update_action_structure + create_framework (DB + plan JSON sync)
  {
    await megaToolCreateSimpleAction(admin as any, userId, {
      title: "Lire",
      description: "Lire 20 minutes",
      type: "habit",
      targetReps: 7,
      tips: "Petit pas.",
      time_of_day: "any_time",
    });

    const { data: createdAction } = await admin
      .from("user_actions")
      .select("id,title")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("title", "Lire")
      .maybeSingle();
    assert(createdAction, "architect create_simple_action should create a user_actions row");

    const { data: planAfterCreate } = await admin.from("user_plans").select("content").eq("id", planId).single();
    const planJson1 = (planAfterCreate as any)?.content;
    const hasLire = JSON.stringify(planJson1).includes('"title":"Lire"') || JSON.stringify(planJson1).includes('"title": "Lire"');
    assert(hasLire, "architect create_simple_action should inject action into plan JSON");

    await megaToolUpdateActionStructure(admin as any, userId, {
      target_name: "Lire",
      new_title: "Lire 20min",
      new_description: "Lire 20 minutes (minimum).",
      new_target_reps: 10,
    });

    const { data: updatedAction } = await admin
      .from("user_actions")
      .select("title,target_reps")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("title", "Lire 20min")
      .maybeSingle();
    assert(updatedAction, "architect update_action_structure should sync to user_actions");
    assertEquals((updatedAction as any).target_reps, 10);

    await megaToolCreateFramework(admin as any, userId, {
      title: "Journal",
      description: "Écrire 3 lignes.",
      targetReps: 1,
      time_of_day: "evening",
      frameworkDetails: {
        type: "one_shot",
        intro: "Go.",
        sections: [{ id: "s1", label: "Quoi ?", inputType: "textarea", placeholder: "..." }],
      },
    });

    const { data: planAfterFramework } = await admin.from("user_plans").select("content").eq("id", planId).single();
    const planJson2 = (planAfterFramework as any)?.content;
    const hasFramework = JSON.stringify(planJson2).includes('"type":"framework"') && JSON.stringify(planJson2).includes('"title":"Journal"');
    assert(hasFramework, "architect create_framework should inject a framework action into plan JSON");
  }

  // 3) Tool: investigator log_action_execution (logItem)
  {
    // Ensure we don't trip the "18h rule" skip because track_progress just updated last_performed_at.
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await admin.from("user_actions").update({ last_performed_at: twoDaysAgo }).eq("id", actionId);

    const out = await megaTestLogItem(admin as any, userId, {
      item_id: actionId,
      item_type: "action",
      item_title: "Sport",
      status: "completed",
      value: 1,
      note: "Ok",
      share_insight: false,
    });
    assert(out.includes("Logged"), "investigator log tool should return Logged*");

    const { count } = await admin
      .from("user_action_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_id", actionId)
      .eq("note", "Ok");
    assert((count ?? 0) >= 1, "investigator log should insert a user_action_entries row with note");
  }
});



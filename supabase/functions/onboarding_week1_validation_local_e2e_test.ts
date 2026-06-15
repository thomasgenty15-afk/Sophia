import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  ONBOARDING_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT,
  ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
} from "./_shared/onboarding_week1_validation.ts";

function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function optionalEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing env: one of ${names.join(", ")}`);
}

function makeNonce(): string {
  return crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function postInternal(path: string, body: unknown) {
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const secret = optionalEnv(
    "INTERNAL_FUNCTION_SECRET",
    "MEGA_INTERNAL_SECRET",
    "SECRET_KEY",
  );
  const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function createQaUser(anon: any, admin: any) {
  const nonce = makeNonce();
  const email = `onboarding-week1-local-${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+15550${nonce.slice(0, 9)}`;

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone, full_name: "Onboarding Week1 QA" } },
  });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth
    .signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const userId = signInData.user?.id;
  if (!userId) throw new Error("Missing user id after sign-in");

  const { error: profileError } = await admin.from("profiles").update({
    full_name: "Onboarding Week1 QA",
    email,
    phone_number: phone,
    timezone: "Europe/Paris",
    locale: "fr-FR",
    access_tier: "trial",
    onboarding_completed: true,
    whatsapp_state: "active",
    whatsapp_opted_in: true,
    phone_invalid: false,
    whatsapp_last_inbound_at: null,
    whatsapp_last_outbound_at: null,
  }).eq("id", userId);
  if (profileError) throw profileError;

  return { userId, email };
}

async function seedActivePlan(admin: any, userId: string) {
  const nowIso = "2026-06-15T12:00:00.000Z";
  const weekStart = "2026-06-15";

  const { data: cycle, error: cycleError } = await admin.from("user_cycles")
    .insert({
      user_id: userId,
      status: "active",
      raw_intake_text: "QA onboarding week 1 validation",
      intake_language: "fr",
      duration_months: 3,
      version: 1,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (cycleError) throw cycleError;

  const { data: transformation, error: transformationError } = await admin
    .from("user_transformations")
    .insert({
      cycle_id: cycle.id,
      priority_order: 1,
      status: "active",
      title: "Reprendre le sport",
      internal_summary: "QA local onboarding week 1.",
      user_summary: "Reprendre le sport avec une routine simple.",
      success_definition: "Faire deux seances legeres.",
      main_constraint: "Fatigue le soir",
      activated_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (transformationError) throw transformationError;

  const { data: plan, error: planError } = await admin.from("user_plans_v2")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      status: "active",
      version: 3,
      title: "Plan sport QA",
      content: {
        summary: "Deux seances de sport legeres cette semaine.",
        metadata: { qa_source: "onboarding_week1_local_e2e" },
      },
      activated_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (planError) throw planError;

  const { data: item, error: itemError } = await admin.from("user_plan_items")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: "Faire 20 minutes de sport",
      description: "Seance legere a la maison.",
      tracking_type: "boolean",
      current_habit_state: "active_building",
      target_reps: 2,
      scheduled_days: ["mon", "wed"],
      payload: { qa_source: "onboarding_week1_local_e2e" },
      activated_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (itemError) throw itemError;

  const { error: weekPlanError } = await admin.from("user_habit_week_plans")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      plan_item_id: item.id,
      week_start_date: weekStart,
      status: "pending_confirmation",
      updated_at: nowIso,
    });
  if (weekPlanError) throw weekPlanError;

  const { error: occurrencesError } = await admin
    .from("user_habit_week_occurrences")
    .insert([
      {
        user_id: userId,
        cycle_id: cycle.id,
        transformation_id: transformation.id,
        plan_id: plan.id,
        plan_item_id: item.id,
        week_start_date: weekStart,
        ordinal: 1,
        default_day: "mon",
        planned_day: "mon",
        status: "planned",
        source: "default_generated",
        updated_at: nowIso,
      },
      {
        user_id: userId,
        cycle_id: cycle.id,
        transformation_id: transformation.id,
        plan_id: plan.id,
        plan_item_id: item.id,
        week_start_date: weekStart,
        ordinal: 2,
        default_day: "wed",
        planned_day: "wed",
        status: "planned",
        source: "default_generated",
        updated_at: nowIso,
      },
    ]);
  if (occurrencesError) throw occurrencesError;

  return { planId: plan.id, weekStart };
}

Deno.test("local real onboarding week1 validation checkins", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  Deno.env.set("WHATSAPP_WEB_SIMULATION_ENABLED", "1");

  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = optionalEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { userId } = await createQaUser(anon, admin);

  try {
    const { planId, weekStart } = await seedActivePlan(admin, userId);

    const scheduled = await postInternal(
      "schedule-onboarding-week1-validation",
      {
        user_id: userId,
        plan_id: planId,
        activated_at: "2026-06-15T12:00:00.000Z",
      },
    );
    assertEquals(scheduled.res.status, 200);
    assertEquals(Boolean(scheduled.json?.ok), true);
    assertEquals(scheduled.json?.scheduled, 2);
    assertEquals(
      scheduled.json?.validation_scheduled_for,
      "2026-06-15T14:00:00.000Z",
    );
    assertEquals(
      scheduled.json?.auto_validation_scheduled_for,
      "2026-06-16T05:00:00.000Z",
    );

    const { data: checkins, error: checkinsError } = await admin
      .from("scheduled_checkins")
      .select("id,event_context,status,scheduled_for,message_payload")
      .eq("user_id", userId)
      .filter("message_payload->>plan_id", "eq", planId)
      .order("event_context", { ascending: true });
    if (checkinsError) throw checkinsError;
    assertEquals(checkins?.length, 2);

    const promptCheckin = (checkins ?? []).find((row: any) =>
      row.event_context === ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT
    );
    const autoCheckin = (checkins ?? []).find((row: any) =>
      row.event_context === ONBOARDING_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT
    );
    assert(promptCheckin?.id, "missing validation prompt checkin");
    assert(autoCheckin?.id, "missing auto validation checkin");

    const { error: recentProfileError } = await admin.from("profiles").update({
      whatsapp_last_inbound_at: minutesAgo(5),
      whatsapp_last_outbound_at: null,
    }).eq("id", userId);
    if (recentProfileError) throw recentProfileError;

    const { error: duePromptError } = await admin.from("scheduled_checkins")
      .update({ scheduled_for: minutesAgo(1), status: "pending" })
      .eq("id", promptCheckin.id);
    if (duePromptError) throw duePromptError;

    const deferred = await postInternal("process-checkins", {});
    assertEquals(deferred.res.status, 200);

    const { data: deferredPrompt, error: deferredPromptError } = await admin
      .from("scheduled_checkins")
      .select("status,delivery_last_error,scheduled_for")
      .eq("id", promptCheckin.id)
      .single();
    if (deferredPromptError) throw deferredPromptError;
    assertEquals(deferredPrompt.status, "pending");
    assert(
      new Date(deferredPrompt.scheduled_for).getTime() > Date.now(),
      "recent WhatsApp activity should push scheduled_for into the future",
    );
    assertEquals(deferredPrompt.delivery_last_error, null);

    const { error: quietProfileError } = await admin.from("profiles").update({
      whatsapp_last_inbound_at: minutesAgo(45),
      whatsapp_last_outbound_at: minutesAgo(45),
    }).eq("id", userId);
    if (quietProfileError) throw quietProfileError;

    const { error: retryPromptError } = await admin.from("scheduled_checkins")
      .update({ scheduled_for: minutesAgo(1) })
      .eq("id", promptCheckin.id);
    if (retryPromptError) throw retryPromptError;

    const sentPrompt = await postInternal("process-checkins", {});
    assertEquals(sentPrompt.res.status, 200);

    const { data: sentPromptRow, error: sentPromptError } = await admin
      .from("scheduled_checkins")
      .select("status,draft_message")
      .eq("id", promptCheckin.id)
      .single();
    if (sentPromptError) throw sentPromptError;
    assertEquals(sentPromptRow.status, "sent");
    assertStringIncludes(sentPromptRow.draft_message, "niveau 2 du plan");
    assertStringIncludes(sentPromptRow.draft_message, "semaine 1");

    const { error: quietBeforeAutoError } = await admin.from("profiles").update(
      {
        whatsapp_last_inbound_at: minutesAgo(45),
        whatsapp_last_outbound_at: minutesAgo(45),
      },
    ).eq("id", userId);
    if (quietBeforeAutoError) throw quietBeforeAutoError;

    const { error: dueAutoError } = await admin.from("scheduled_checkins")
      .update({ scheduled_for: minutesAgo(120), status: "pending" })
      .eq("id", autoCheckin.id);
    if (dueAutoError) throw dueAutoError;

    const sentAuto = await postInternal("process-checkins", {});
    assertEquals(sentAuto.res.status, 200);

    const { data: sentAutoRow, error: sentAutoError } = await admin
      .from("scheduled_checkins")
      .select("status,draft_message,message_payload")
      .eq("id", autoCheckin.id)
      .single();
    if (sentAutoError) throw sentAutoError;
    assertEquals(sentAutoRow.status, "sent");
    assertStringIncludes(sentAutoRow.draft_message, "pris la liberte");
    assertStringIncludes(
      sentAutoRow.draft_message,
      "Faire 20 minutes de sport",
    );
    assertEquals(sentAutoRow.message_payload?.auto_validated, true);

    const { data: weekPlan, error: weekPlanError } = await admin
      .from("user_habit_week_plans")
      .select("status,confirmed_at")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("week_start_date", weekStart)
      .single();
    if (weekPlanError) throw weekPlanError;
    assertEquals(weekPlan.status, "auto_applied");
    assert(weekPlan.confirmed_at, "week plan should be confirmed");

    const { data: occurrences, error: occurrenceError } = await admin
      .from("user_habit_week_occurrences")
      .select("source")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("week_start_date", weekStart);
    if (occurrenceError) throw occurrenceError;
    assertEquals(
      (occurrences ?? []).every((row: any) =>
        row.source === "weekly_confirmed"
      ),
      true,
    );

    const { data: messages, error: messagesError } = await admin
      .from("chat_messages")
      .select("content,metadata")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .eq("scope", "whatsapp")
      .in("metadata->>purpose", [
        "onboarding_week1_validation_prompt",
        "onboarding_week1_auto_validation",
      ]);
    if (messagesError) throw messagesError;
    assertEquals(messages?.length, 2);
    assert(
      (messages ?? []).some((row: any) =>
        String(row.content ?? "").includes("niveau 2 du plan")
      ),
      "missing prompt WhatsApp log",
    );
    assert(
      (messages ?? []).some((row: any) =>
        String(row.content ?? "").includes("Faire 20 minutes de sport")
      ),
      "missing auto-validation WhatsApp log",
    );
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

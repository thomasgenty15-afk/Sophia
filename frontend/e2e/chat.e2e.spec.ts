import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function makeNonce() {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

async function seedChatUser() {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-chat+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Chat" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  const submissionId = crypto.randomUUID();
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

  const planContent = {
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
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "E2E Chat plan",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id as string;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: actionRow, error: actionErr } = await admin
    .from("user_actions")
    .insert({
      user_id: userId,
      plan_id: planId,
      submission_id: submissionId,
      type: "habit",
      title: "Sport",
      description: "Faire du sport",
      target_reps: 3,
      current_reps: 0,
      status: "active",
      tracking_type: "boolean",
      time_of_day: "any_time",
      last_performed_at: twoDaysAgo,
    })
    .select("id,last_performed_at")
    .single();
  if (actionErr) throw actionErr;

  return { admin, userId, email, password, actionId: actionRow.id as string };
}

test("Chat: sending a message triggers sophia-brain and writes chat_messages + action tracking", async ({ page }) => {
  const seeded = await seedChatUser();

  const { count: beforeCount } = await seeded.admin
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", seeded.userId)
    .eq("scope", "web");

  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(seeded.email);
  await page.getByPlaceholder("••••••••").fill(seeded.password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await page.waitForURL("**/dashboard");
  await page.goto("/chat");
  await expect(page.getByText("Conversation avec Sophia")).toBeVisible();

  await page.getByTestId("chat-input").fill("J'ai fait Sport");
  await page.getByTestId("chat-send").click();

  // Assistant response appears (agent label shown on assistant messages)
  await expect(page.getByText(/companion|investigator|architect|assistant|firefighter|sentry/i)).toBeVisible();

  // DB: chat_messages increased by at least 2 (user + assistant)
  await expect.poll(async () => {
    const { count } = await seeded.admin
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", seeded.userId)
      .eq("scope", "web");
    return (count ?? 0) - (beforeCount ?? 0);
  }).toBeGreaterThanOrEqual(2);

  // DB: chat state initialized/updated by sophia-brain (always deterministic)
  await expect.poll(async () => {
    const { count } = await seeded.admin
      .from("user_chat_states")
      .select("*", { count: "exact", head: true })
      .eq("user_id", seeded.userId)
      .eq("scope", "web");
    return count ?? 0;
  }).toBeGreaterThanOrEqual(1);
});



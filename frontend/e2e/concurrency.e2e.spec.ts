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

async function seedDashboardUser() {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-conc+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Concurrency" },
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
      title: "E2E Concurrency plan",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id as string;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await admin.from("user_actions").insert({
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
  });

  return { admin, userId, email, password };
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

test("Concurrency: two sessions can 'Je maîtrise déjà' safely (idempotent DB state)", async ({ browser }) => {
  const seeded = await seedDashboardUser();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  pageA.on("dialog", async (d) => d.accept());
  pageB.on("dialog", async (d) => d.accept());

  await Promise.all([uiLogin(pageA, seeded.email, seeded.password), uiLogin(pageB, seeded.email, seeded.password)]);

  await Promise.all([
    pageA.getByRole("button", { name: "Je maîtrise déjà" }).click(),
    pageB.getByRole("button", { name: "Je maîtrise déjà" }).click(),
  ]);

  // DB invariant: action row is completed + reps == target, regardless of race.
  await expect.poll(async () => {
    const { data } = await seeded.admin.from("user_actions").select("status,current_reps,last_performed_at").eq("user_id", seeded.userId).eq("title", "Sport").single();
    return { status: (data as any).status, reps: (data as any).current_reps, last: !!(data as any).last_performed_at };
  }).toEqual(expect.objectContaining({ status: "completed", reps: 3, last: true }));

  await ctxA.close();
  await ctxB.close();
});



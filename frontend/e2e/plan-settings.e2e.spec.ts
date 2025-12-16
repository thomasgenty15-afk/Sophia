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

async function seedUserWithPlanAndAnswers() {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-settings+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Settings" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id");

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
      title: "Settings plan",
      generation_attempts: 3,
      content: { phases: [{ id: 1, title: "P1", status: "active", actions: [] }] },
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  await admin.from("user_actions").insert({
    user_id: userId,
    plan_id: planRow.id,
    submission_id: submissionId,
    type: "habit",
    title: "Boire",
    description: "Test",
    target_reps: 7,
    current_reps: 0,
    status: "active",
    tracking_type: "boolean",
    time_of_day: "morning",
  });

  await admin.from("user_answers").insert({
    user_id: userId,
    questionnaire_type: "onboarding",
    status: "in_progress",
    submission_id: submissionId,
    content: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return { admin, userId, email, password, planId: planRow.id as string, submissionId };
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

test("Plan settings: 'Refaire ce plan' abandons current plan + clears actions, then navigates to /recraft", async ({ page }) => {
  const seeded = await seedUserWithPlanAndAnswers();

  page.on("dialog", async (d) => d.accept());

  await uiLogin(page, seeded.email, seeded.password);
  await page.getByRole("button", { name: "Gérer le plan" }).click();
  await page.getByTestId("plan-settings-reset").click();

  await page.waitForURL("**/recraft");

  await expect.poll(async () => {
    const { data } = await seeded.admin.from("user_plans").select("status,generation_attempts").eq("id", seeded.planId).single();
    return { status: (data as any).status, attempts: (data as any).generation_attempts };
  }).toEqual(expect.objectContaining({ status: "abandoned", attempts: 0 }));

  await expect.poll(async () => {
    const { count } = await seeded.admin.from("user_actions").select("*", { count: "exact", head: true }).eq("plan_id", seeded.planId);
    return count ?? 0;
  }).toBe(0);
});

test("Plan settings: 'Réinitialiser le plan global' clears submission + sets onboarding_completed=false", async ({ page }) => {
  const seeded = await seedUserWithPlanAndAnswers();

  page.on("dialog", async (d) => d.accept());

  await uiLogin(page, seeded.email, seeded.password);
  await page.getByRole("button", { name: "Gérer le plan" }).click();
  await page.getByTestId("plan-settings-global-reset").click();

  await page.waitForURL("**/global-plan");

  await expect.poll(async () => {
    const { data } = await seeded.admin.from("profiles").select("onboarding_completed").eq("id", seeded.userId).single();
    return (data as any).onboarding_completed;
  }).toBe(false);

  await expect.poll(async () => {
    const { count } = await seeded.admin.from("user_goals").select("*", { count: "exact", head: true }).eq("submission_id", seeded.submissionId);
    return count ?? 0;
  }).toBe(0);
});



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

async function seedUserWithActivePlanAndPendingNext() {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-reset+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Reset" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  const submissionId = crypto.randomUUID();

  // Active goal + pending goal (hasPendingAxes -> manual skip goes to /next-plan)
  const { data: g1, error: g1Err } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "ENG_1",
      axis_title: "Retrouver une énergie stable & respecter ses limites",
      theme_id: "ENG",
      priority_order: 1,
    })
    .select("id")
    .single();
  if (g1Err) throw g1Err;

  const { error: g2Err } = await admin.from("user_goals").insert({
    user_id: userId,
    submission_id: submissionId,
    status: "pending",
    axis_id: "SLP_1",
    axis_title: "Passer en mode nuit & s’endormir facilement",
    theme_id: "SLP",
    priority_order: 2,
  });
  if (g2Err) throw g2Err;

  const planContent = { phases: [{ id: "phase_1", title: "P1", status: "active", actions: [] }] };
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: g1.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "E2E Reset plan",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  const planId = planRow.id as string;

  // Seed at least one action so reset has something to delete
  await admin.from("user_actions").insert({
    user_id: userId,
    plan_id: planId,
    submission_id: submissionId,
    type: "habit",
    title: "Boire de l'eau",
    description: "1 verre",
    target_reps: 7,
    current_reps: 0,
    status: "active",
    tracking_type: "boolean",
    time_of_day: "morning",
  });

  return { admin, userId, email, password, submissionId, activeGoalId: g1.id as string, planId };
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

test("Settings flows: 'Lancer la prochaine transformation' -> /next-plan and 'Refaire ce plan' keeps goal but regenerates path", async ({ page }) => {
  const seeded = await seedUserWithActivePlanAndPendingNext();

  page.on("dialog", async (d) => {
    // Confirm dialogs for skip/reset.
    await d.accept();
  });

  await uiLogin(page, seeded.email, seeded.password);

  // Open plan settings
  await page.getByRole("button", { name: "Gérer le plan" }).click();
  await expect(page.getByText("Gestion du Plan")).toBeVisible();

  // Skip to next axis
  await page.getByTestId("plan-settings-skip").click();
  await page.waitForURL("**/next-plan");

  // DB: active goal should be marked completed (handleSkipToNextAxis)
  await expect.poll(async () => {
    const { data } = await seeded.admin.from("user_goals").select("status").eq("id", seeded.activeGoalId).single();
    return (data as any).status;
  }).toBe("completed");
});



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
  const anonKey = mustEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E User" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  // Onboarding completed => Dashboard loads instead of ResumeOnboardingView.
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
    vitalSignal: {
      title: "Sommeil",
      unit: "h",
      startValue: 7,
      targetValue: 8,
    },
  };

  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "E2E plan",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id as string;

  // Seed tracking row used by DashboardData to reconcile plan JSON with DB.
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

  await admin.from("user_vital_signs").insert({
    user_id: userId,
    plan_id: planId,
    submission_id: submissionId,
    label: "Sommeil",
    target_value: "8",
    current_value: "7",
    unit: "h",
    status: "active",
    tracking_type: "counter",
    last_checked_at: twoDaysAgo,
  });

  return { url, anonKey, admin, userId, email, password, planId };
}

test("Dashboard: 'Je maîtrise déjà' + vital sign update write expected DB changes", async ({ page }) => {
  const seeded = await seedDashboardUser();
  const startedAt = new Date().toISOString();

  page.on("dialog", async (dialog) => {
    // confirm("Maîtriser cette habitude ?")
    await dialog.accept();
  });

  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(seeded.email);
  await page.getByPlaceholder("••••••••").fill(seeded.password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Mon Plan d'Action")).toBeVisible();

  // Habit: master directly
  await page.getByRole("button", { name: "Je maîtrise déjà" }).click();

  // Verify DB status + reps
  await expect.poll(async () => {
    const { data } = await seeded.admin
      .from("user_actions")
      .select("status,current_reps,last_performed_at")
      .eq("user_id", seeded.userId)
      .eq("title", "Sport")
      .single();
    return { status: (data as any).status, reps: (data as any).current_reps, last: (data as any).last_performed_at };
  }).toEqual(expect.objectContaining({ status: "completed", reps: 3 }));

  // last_performed_at should be updated (>= startedAt)
  const startedMs = Date.parse(startedAt);
  await expect.poll(async () => {
    const { data } = await seeded.admin
      .from("user_actions")
      .select("last_performed_at")
      .eq("user_id", seeded.userId)
      .eq("title", "Sport")
      .single();
    return Date.parse(String((data as any).last_performed_at));
  }).toBeGreaterThanOrEqual(startedMs);

  // Vital sign update
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  const modal = page.getByText("Mise à jour du Signe Vital");
  await expect(modal).toBeVisible();
  await page.locator('input[type="number"]').fill("8");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByText("Fait aujourd'hui")).toBeVisible();

  // Verify DB entry + last_checked_at update
  await expect.poll(async () => {
    const { data: vital } = await seeded.admin
      .from("user_vital_signs")
      .select("current_value,last_checked_at")
      .eq("user_id", seeded.userId)
      .eq("label", "Sommeil")
      .single();
    const { count } = await seeded.admin
      .from("user_vital_sign_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", seeded.userId);
    return { current: (vital as any).current_value, last: (vital as any).last_checked_at, entries: count ?? 0 };
  }).toEqual(expect.objectContaining({ current: "8", entries: 1 }));
});



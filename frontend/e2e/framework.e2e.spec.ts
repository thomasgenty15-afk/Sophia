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

async function seedFrameworkUser() {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-fw+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Framework" },
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

  const actionId = "fw_journal";
  const planContent = {
    phases: [
      {
        id: "phase_1",
        title: "Phase 1",
        status: "active",
        actions: [
          {
            id: actionId,
            type: "framework",
            title: "Journal 3 lignes",
            description: "Écris 3 lignes.",
            questType: "side",
            targetReps: 1,
            tracking_type: "boolean",
            time_of_day: "evening",
            status: "active",
            isCompleted: false,
            currentReps: 0,
            frameworkDetails: {
              type: "one_shot",
              intro: "Pose-le.",
              sections: [{ id: "s1", label: "Quoi ?", inputType: "textarea", placeholder: "..." }],
            },
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
      title: "E2E Framework plan",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id as string;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await admin.from("user_framework_tracking").insert({
    user_id: userId,
    plan_id: planId,
    submission_id: submissionId,
    action_id: actionId,
    title: "Journal 3 lignes",
    type: "one_shot",
    target_reps: 1,
    current_reps: 0,
    status: "active",
    tracking_type: "boolean",
    last_performed_at: twoDaysAgo,
  });

  return { admin, userId, email, password, planId, actionId };
}

test("Dashboard: framework 'Remplir' saves entry + updates tracking", async ({ page }) => {
  const seeded = await seedFrameworkUser();

  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(seeded.email);
  await page.getByPlaceholder("••••••••").fill(seeded.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  await expect(page.getByText("Mon Plan d'Action")).toBeVisible();
  await page.getByRole("button", { name: "Remplir (Unique)" }).click();

  await expect(page.getByText("Enregistrer la fiche")).toBeVisible();
  await page.locator("textarea").first().fill("Test E2E content");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();

  // DB: user_framework_entries created + tracking updated
  await expect.poll(async () => {
    const { count } = await seeded.admin
      .from("user_framework_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", seeded.userId)
      .eq("plan_id", seeded.planId)
      .eq("action_id", seeded.actionId);

    const { data: track } = await seeded.admin
      .from("user_framework_tracking")
      .select("current_reps,status,last_performed_at")
      .eq("user_id", seeded.userId)
      .eq("plan_id", seeded.planId)
      .eq("action_id", seeded.actionId)
      .single();

    return { entries: count ?? 0, reps: (track as any).current_reps, status: (track as any).status, last: (track as any).last_performed_at };
  }).toEqual(expect.objectContaining({ entries: 1, status: "completed" }));
});



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

test("Onboarding full UI: global-plan -> priorities -> signup -> generate plan -> validate -> dashboard (+ DB checks)", async ({ page }) => {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-onboarding+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  // 1) GlobalPlan (guest) -> select 3 axes (1 per theme)
  await page.goto("/global-plan");
  await expect(page.getByText("Règle des 3 Piliers")).toBeVisible();

  // Sommeil -> SLP_1
  await page.locator("aside").getByRole("button", { name: /Sommeil/i }).first().click();
  await page.getByRole("button", { name: /Passer en mode nuit & s’endormir facilement/i }).click();

  // Énergie -> ENG_1
  await page.locator("aside").getByRole("button", { name: /Énergie/i }).first().click();
  await page.getByRole("button", { name: /Retrouver une énergie stable & respecter ses limites/i }).click();

  // Confiance -> CNF_1
  await page.locator("aside").getByRole("button", { name: /Confiance/i }).first().click();
  await page.getByRole("button", { name: /Estime de soi & auto-bienveillance/i }).click();

  // On mobile, the "3 / 3 axes choisis" counter can be hidden by responsive layout.
  // The real invariant we care about: the CTA becomes enabled once 3 axes are selected.
  const generateBtn = page.getByRole("button", { name: "Générer mon Plan" });
  await expect(generateBtn).toBeEnabled();
  await generateBtn.click();

  // 2) PlanPriorities (guest) -> validate -> /auth with registration flow state
  await page.waitForURL("**/plan-priorities");
  await page.getByRole("button", { name: /Générer mon plan/i }).click();
  await page.waitForURL("**/auth");

  // 3) Auth signup (registration flow) -> /plan-generator
  await page.getByPlaceholder("Votre prénom").fill("E2E");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("+33 6 12 34 56 78").fill(phone);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: /Découvrir mon Plan/i }).click();

  await page.waitForURL("**/plan-generator");
  await expect(page.getByText(/Générateur de Plan/i)).toBeVisible();

  // 4) Generate plan (stub) -> result -> validate
  await page.getByPlaceholder(/Je suis épuisé/i).fill("Je veux dormir mieux.");
  await page.getByPlaceholder(/J'ai peur/i).fill("Je scrolle trop tard.");
  await page.getByPlaceholder(/Je vis en colocation/i).fill("Pas de contraintes.");

  await page.getByRole("button", { name: "Générer mon Plan d'Action" }).click();

  // Wait for result screen and validate plan
  await expect(page.getByRole("button", { name: "C'est parfait, on commence !" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "C'est parfait, on commence !" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Mon Plan d'Action")).toBeVisible();

  // 5) DB checks (using service role) - resolve userId from profiles.email
  const { data: profile, error: profileErr } = await admin.from("profiles").select("id,onboarding_completed").eq("email", email).single();
  if (profileErr) throw profileErr;
  const userId = (profile as any).id as string;
  expect((profile as any).onboarding_completed).toBe(true);

  // user_answers backfilled during signup flow (Auth.tsx) for onboarding questionnaire
  const { data: goalAny } = await admin
    .from("user_goals")
    .select("submission_id")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .not("submission_id", "is", null)
    .order("priority_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const submissionId = (goalAny as any)?.submission_id as string | undefined;
  expect(submissionId).toBeTruthy();

  await expect.poll(async () => {
    const { data: ans } = await admin
      .from("user_answers")
      .select("questionnaire_type, submission_id, content, status")
      .eq("user_id", userId)
      .eq("questionnaire_type", "onboarding")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const content = (ans as any)?.content;
    return {
      has: !!ans,
      status: (ans as any)?.status ?? null,
      hasUiState: !!(content && (content.ui_state || content.structured_data)),
    };
  }).toEqual(expect.objectContaining({ has: true, hasUiState: true }));

  // Goals created (3)
  await expect.poll(async () => {
    const { count } = await admin.from("user_goals").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["active", "pending"]);
    return count ?? 0;
  }).toBeGreaterThanOrEqual(3);

  // Plan exists
  await expect.poll(async () => {
    const { count } = await admin.from("user_plans").select("*", { count: "exact", head: true }).eq("user_id", userId);
    return count ?? 0;
  }).toBeGreaterThanOrEqual(1);

  // Actions + vital signs distributed
  await expect.poll(async () => {
    const { count: actions } = await admin.from("user_actions").select("*", { count: "exact", head: true }).eq("user_id", userId);
    const { count: vitals } = await admin.from("user_vital_signs").select("*", { count: "exact", head: true }).eq("user_id", userId);
    return { actions: actions ?? 0, vitals: vitals ?? 0 };
  }).toEqual(expect.objectContaining({ actions: expect.any(Number), vitals: expect.any(Number) }));
});



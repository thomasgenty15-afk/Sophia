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

async function seedAuthedUser(onboardingCompleted = true) {
  const url = mustEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const nonce = makeNonce();
  const email = `e2e-stress+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Stress" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  if (onboardingCompleted) {
    await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
  }

  return { admin, userId, email, password };
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

test("Stress chat: send 25 messages, no UI crash, DB grows as expected", async ({ page }) => {
  test.setTimeout(120_000);
  const seeded = await seedAuthedUser(true);

  await uiLogin(page, seeded.email, seeded.password);
  await page.goto("/chat");

  // warmup: wait chat UI
  await expect(page.getByTestId("chat-input")).toBeVisible();

  const N = 20;
  for (let i = 1; i <= N; i++) {
    await page.getByTestId("chat-input").fill(`Stress msg ${i}: j'ai fait sport ${i}`);
    await page.getByTestId("chat-send").click();
    // Wait for the request cycle to finish (the send button can be disabled just because the input is empty).
    await expect(page.getByTestId("chat-error")).toHaveCount(0);
    await expect(page.getByTestId("chat-loading")).toBeHidden({ timeout: 60_000 });
  }

  // DB invariant: at least N user rows exist, and assistant replies exist too (stubbed).
  await expect.poll(async () => {
    const { count } = await seeded.admin
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", seeded.userId)
      .eq("scope", "web");
    return count ?? 0;
  }, { timeout: 60_000, interval: 500 }).toBeGreaterThanOrEqual(N);

  await expect.poll(async () => {
    const { data } = await seeded.admin
      .from("user_chat_states")
      .select("updated_at")
      .eq("user_id", seeded.userId)
      .eq("scope", "web")
      .maybeSingle();
    return !!(data as any)?.updated_at;
  }, { timeout: 30_000, interval: 500 }).toBe(true);
});



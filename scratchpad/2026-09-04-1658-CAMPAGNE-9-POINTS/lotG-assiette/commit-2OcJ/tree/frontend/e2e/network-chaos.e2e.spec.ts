import { test, expect } from "@playwright/test";

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
  const email = `e2e-net+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Network" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  if (onboardingCompleted) {
    await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
  }

  return { admin, userId, email, password };
}

test("Network chaos: /chat shows error when sophia-brain 500s", async ({ page }) => {
  const seeded = await seedAuthedUser(true);

  await page.route("**/functions/v1/sophia-brain", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "boom" }),
    });
  });

  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(seeded.email);
  await page.getByPlaceholder("••••••••").fill(seeded.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/chat");
  await page.getByTestId("chat-input").fill("Hello");
  await page.getByTestId("chat-send").click();

  // Chat UI should surface an error container (text depends on supabase-js error)
  await expect(page.getByTestId("chat-error")).toBeVisible();
});


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
  const email = `e2e-del+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "E2E Delete" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id");

  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  // Ensure chat state exists so UI doesn't redirect weirdly
  await admin.from("user_chat_states").upsert(
    { user_id: userId, scope: "web", current_mode: "companion", risk_level: 0, investigation_state: null, short_term_context: "", unprocessed_msg_count: 0, last_processed_at: new Date().toISOString() },
    { onConflict: "user_id,scope" },
  );

  return { admin, userId, email, password };
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto("/auth");
  await page.getByPlaceholder("vous@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

test("Chat: delete message removes DB row (after reload with real DB ids)", async ({ page }) => {
  const seeded = await seedChatUser();

  await uiLogin(page, seeded.email, seeded.password);
  await page.goto("/chat");

  const content = `DELETE_ME_${makeNonce()}`;
  await page.getByTestId("chat-input").fill(content);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-loading")).toBeHidden({ timeout: 60_000 });

  // Get the real DB id for the user message we just sent.
  const { data: msg, error: msgErr } = await seeded.admin
    .from("chat_messages")
    .select("id")
    .eq("user_id", seeded.userId)
    .eq("scope", "web")
    .eq("role", "user")
    .eq("content", content)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (msgErr) throw msgErr;
  const msgId = (msg as any).id as string;

  const { count: before } = await seeded.admin.from("chat_messages").select("*", { count: "exact", head: true }).eq("user_id", seeded.userId).eq("scope", "web");

  // Reload so UI loads messages from DB with real ids.
  await page.reload();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await page.locator(`[data-testid="chat-delete-${msgId}"]`).click();

  await expect.poll(async () => {
    const { count } = await seeded.admin.from("chat_messages").select("*", { count: "exact", head: true }).eq("user_id", seeded.userId).eq("scope", "web");
    return count ?? 0;
  }).toBe((before ?? 0) - 1);

  const { data: still, error: stillErr } = await seeded.admin.from("chat_messages").select("id").eq("id", msgId).maybeSingle();
  if (stillErr) throw stillErr;
  expect(still).toBeNull();
});



import { createClient } from "jsr:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";

import { handlePendingActions } from "./handlers_pending.ts";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

async function createTestUser(anon: any) {
  const nonce = makeNonce();
  const email = `wapendingtest+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone } },
  });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  if (!signInData.user) throw new Error("Missing user after sign-in");

  return { userId: signInData.user.id, email, phone };
}

Deno.test("whatsapp-webhook pending handler: does not swallow generic 'vas-y' when no pending memory_echo exists", async () => {
  let url: string;
  let anonKey: string;
  let serviceRoleKey: string;
  try {
    url = getEnv("SUPABASE_URL");
    anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (e) {
    console.warn("[handlers_pending_db_test] skipping (missing env)", e);
    return;
  }

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, phone } = await createTestUser(anon);

  // Make extra sure there is no pending row for this fresh user.
  await admin.from("whatsapp_pending_actions").delete().eq("user_id", userId).eq("kind", "memory_echo");

  const didHandle = await handlePendingActions({
    admin,
    userId,
    fromE164: phone,
    isOptInYes: false,
    isCheckinYes: false,
    isCheckinLater: false,
    isEchoYes: true,
    isEchoLater: false,
  });

  assertEquals(didHandle, false);
});



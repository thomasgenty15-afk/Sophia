import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert } from "jsr:@std/assert@1";

import { runWatcher } from "./agents/watcher.ts";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// ── Integration gate ──────────────────────────────────────────────────────────────────────
// These cases drive a REAL Supabase stack (auth, edge functions, DB). Without that stack the
// suite must SKIP them, not fail them: a permanently red net is a net nobody reads. Run them
// with `npm run test:mega`, or export the env below against a local stack — see
// docs/keel/TESTING.md.
const REQUIRED_ENV = ["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const MISSING_ENV = REQUIRED_ENV.filter((name) =>
  (Deno.env.get(name) ?? "").trim().length === 0
);
const SKIP_INTEGRATION = MISSING_ENV.length > 0;
if (SKIP_INTEGRATION) {
  console.log(
    `[skip] sophia-brain/watcher_db_test.ts: needs a live Supabase stack — missing env: ${MISSING_ENV.join(", ")}`,
  );
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

async function createTestUser(anon: any) {
  const nonce = makeNonce();
  const email = `watchtest+${nonce}@example.com`;
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

  return { userId: signInData.user.id };
}

Deno.test("sophia-brain watcher: MEGA stub runs without mutating short_term_context", { ignore: SKIP_INTEGRATION }, async () => {
  // Force deterministic watcher path.
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId } = await createTestUser(anon);

  const lastProcessedAt = new Date(Date.now() - 60_000).toISOString();
  const now = new Date();

  // Seed a batch of messages
  const messages = Array.from({ length: 15 }, (_, i) => ({
    user_id: userId,
    scope: "web",
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg ${i + 1}`,
    created_at: new Date(now.getTime() + i).toISOString(),
  }));
  const { error: seedErr } = await admin.from("chat_messages").insert(messages);
  if (seedErr) throw seedErr;

  await runWatcher(admin as any, userId, "web", lastProcessedAt);

  const { data: state, error: stateErr } = await admin
    .from("user_chat_states")
    .select("short_term_context")
    .eq("user_id", userId)
    .maybeSingle();
  if (stateErr) throw stateErr;
  assert(typeof (state as any)?.short_term_context === "string", "short_term_context should remain a string");
});

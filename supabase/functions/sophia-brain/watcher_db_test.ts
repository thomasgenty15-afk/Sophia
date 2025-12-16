import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert } from "jsr:@std/assert@1";

import { runWatcher } from "./agents/watcher.ts";

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

Deno.test("sophia-brain watcher: after batch, writes memories + updates short_term_context (MEGA stub)", async () => {
  // Force deterministic watcher path.
  Deno.env.set("MEGA_TEST_MODE", "1");

  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId } = await createTestUser(anon);

  const lastProcessedAt = new Date(Date.now() - 60_000).toISOString();
  const now = new Date();

  // Seed a batch of messages
  const messages = Array.from({ length: 15 }, (_, i) => ({
    user_id: userId,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg ${i + 1}`,
    created_at: new Date(now.getTime() + i).toISOString(),
  }));
  const { error: seedErr } = await admin.from("chat_messages").insert(messages);
  if (seedErr) throw seedErr;

  await runWatcher(admin as any, userId, lastProcessedAt);

  const { data: state, error: stateErr } = await admin
    .from("user_chat_states")
    .select("short_term_context")
    .eq("user_id", userId)
    .maybeSingle();
  if (stateErr) throw stateErr;
  assert((state as any)?.short_term_context?.includes("MEGA_TEST_STUB"), "watcher should update short_term_context in mega mode");

  const { count: memCount, error: memErr } = await admin
    .from("memories")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", ["insight", "chat_history"]);
  if (memErr) throw memErr;
  assert((memCount ?? 0) >= 3, "watcher should write >=2 insights + 1 chat_history memory");
});



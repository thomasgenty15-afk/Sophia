import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

async function createTestUserAndSession(anon: any) {
  const nonce = makeNonce();
  const email = `internal+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { phone, full_name: "Internal Smoke" } },
  });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  if (!signInData.user?.id) throw new Error("Missing user after sign-in");
  const accessToken = signInData.session?.access_token;
  if (!accessToken) throw new Error("Missing access token after sign-in");

  return { userId: signInData.user.id, accessToken };
}

async function postInternal(path: string, body: unknown) {
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const secret = getEnv("MEGA_INTERNAL_SECRET");
  const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

Deno.test("internal endpoints: detect-future-events + process-checkins + trigger-memory-echo + trigger-daily-bilan (X-Internal-Secret)", async () => {
  // Deterministic/offline mode (Gemini stub, WhatsApp Graph stub).
  Deno.env.set("MEGA_TEST_MODE", "1");

  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient<any>(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient<any>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId } = await createTestUserAndSession(anon);

  // Seed "recent activity" so detect-future-events & trigger-memory-echo consider the user active.
  {
    const { error } = await admin.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: "Salut Sophia, demain j'ai un truc important.",
      created_at: new Date().toISOString(),
      metadata: {},
    });
    if (error) throw error;
  }

  // Seed an "old" message so trigger-memory-echo can pick time_capsule strategy.
  {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // ~60 days ago
    const { error } = await admin.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: "Je doute de moi depuis un moment, j'ai peur d'échouer.",
      created_at: oldDate,
      metadata: {},
    });
    if (error) throw error;
  }

  // 1) detect-future-events should schedule >=1 checkin in MEGA mode
  const detect = await postInternal("detect-future-events", {});
  assertEquals(detect.res.status, 200);
  assertEquals(Boolean(detect.json?.success), true);

  const { data: pendingCheckins, error: pendingErr } = await admin
    .from("scheduled_checkins")
    .select("id,status,scheduled_for,event_context")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(10);
  if (pendingErr) throw pendingErr;
  assert((pendingCheckins?.length ?? 0) >= 1, "detect-future-events should create at least one pending checkin in MEGA mode");

  // Make the first checkin due now, so process-checkins has work.
  const firstId = (pendingCheckins as any)[0]?.id as string | undefined;
  assert(typeof firstId === "string" && firstId.length > 0, "missing checkin id");
  {
    const { error } = await admin
      .from("scheduled_checkins")
      .update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", firstId);
    if (error) throw error;
  }

  // 2) process-checkins should process at least 1 (falls back to in-app log when WhatsApp not opted in)
  const proc = await postInternal("process-checkins", {});
  assertEquals(proc.res.status, 200);

  const { data: chk, error: chkErr } = await admin.from("scheduled_checkins").select("status,processed_at").eq("id", firstId).single();
  if (chkErr) throw chkErr;
  assertEquals((chk as any).status, "sent");

  const { count: msgCount, error: msgErr } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .filter("metadata->>source", "eq", "scheduled_checkin");
  if (msgErr) throw msgErr;
  assert((msgCount ?? 0) >= 1, "process-checkins should log an in-app assistant message when WhatsApp send is not possible");

  // 3) trigger-memory-echo should generate and log one memory echo (WhatsApp not opted in => in-app log)
  const echo = await postInternal("trigger-memory-echo", {});
  assertEquals(echo.res.status, 200);
  assertEquals(Boolean(echo.json?.success), true);

  const { count: echoCount, error: echoErr } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .filter("metadata->>source", "eq", "memory_echo");
  if (echoErr) throw echoErr;
  assert((echoCount ?? 0) >= 1, "trigger-memory-echo should log an in-app assistant message with metadata.source=memory_echo");

  // 4) trigger-daily-bilan should return 200 even if nobody is opted in.
  const bilan = await postInternal("trigger-daily-bilan", {});
  assertEquals(bilan.res.status, 200);
});




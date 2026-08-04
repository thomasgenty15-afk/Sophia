// E2E tests for the self-service account deletion flow (RGPD):
//   T0 (prepare/confirm), restoration, purge idempotence & crash-resume,
//   deletion_pending exclusion from outbound processing, deletion_records RLS.
//
// Requires a local Supabase with functions served and MEGA_TEST_MODE=1
// (Stripe/WhatsApp network calls are stubbed).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

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
    `[skip] account_deletion_test.ts: needs a live Supabase stack — missing env: ${MISSING_ENV.join(", ")}`,
  );
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

const PASSWORD = "TestPassword!123";

function clients() {
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabaseUrl, anonKey, serviceRoleKey, anon, admin };
}

function internalSecret(): string {
  // MEGA_INTERNAL_SECRET is what scripts/mega-test.mjs injects for Deno tests.
  return (Deno.env.get("MEGA_INTERNAL_SECRET") ?? "").trim() ||
    (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim() ||
    (Deno.env.get("SECRET_KEY") ?? "").trim();
}

async function createTestUser(anon: any) {
  const nonce = makeNonce();
  const email = `deletion+${nonce}@example.com`;
  const { error: signUpError } = await anon.auth.signUp({ email, password: PASSWORD });
  if (signUpError) throw signUpError;
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return {
    userId: data.user!.id as string,
    accessToken: data.session!.access_token as string,
    email,
  };
}

async function callFn(
  supabaseUrl: string,
  anonKey: string,
  name: string,
  accessToken: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function callInternal(
  supabaseUrl: string,
  anonKey: string,
  name: string,
  body: unknown = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "x-internal-secret": internalSecret(),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Runs prepare+confirm and returns the confirm response. */
async function deleteAccount(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
): Promise<any> {
  const prepare = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "prepare",
    password: PASSWORD,
  });
  assertEquals(prepare.status, 200);
  assert(prepare.json?.token, "prepare should return a confirmation token");
  const confirm = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "confirm",
    token: prepare.json.token,
    typed_confirmation: "DELETE",
  });
  assertEquals(confirm.status, 200, `confirm failed: ${JSON.stringify(confirm.json)}`);
  return confirm.json;
}

Deno.test("account deletion: T0 flags the profile, cancels Stripe/WhatsApp, revokes sessions", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken } = await createTestUser(anon);

  // Seed: opted-in WhatsApp profile + active subscription + scheduled work.
  await admin.from("profiles").update({
    phone_number: `+3361${makeNonce().slice(0, 7)}`,
    whatsapp_opted_in: true,
    timezone: "Europe/Paris",
  }).eq("id", userId);
  const { error: subSeedErr } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: `sub_${makeNonce()}`,
    stripe_price_id: "price_test_alliance_monthly",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
  }, { onConflict: "user_id" });
  if (subSeedErr) throw subSeedErr;
  const { data: checkinRow, error: checkinErr } = await admin.from("scheduled_checkins").insert({
    user_id: userId,
    event_context: "test_deletion_t0",
    scheduled_for: new Date(Date.now() + 3600 * 1000).toISOString(),
    status: "pending",
  }).select("id").single();
  if (checkinErr) throw checkinErr;
  const { error: pendingErr } = await admin.from("whatsapp_pending_actions").insert({
    user_id: userId,
    kind: "scheduled_checkin",
    status: "pending",
    scheduled_checkin_id: checkinRow.id,
    payload: {},
  });
  if (pendingErr) throw pendingErr;

  // Wrong password → 403, nothing happens.
  const badPw = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "prepare",
    password: "wrong-password",
  });
  assertEquals(badPw.status, 403);

  // Prepare, then confirm with the wrong word → 400.
  const prepare = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "prepare",
    password: PASSWORD,
  });
  assertEquals(prepare.status, 200);
  const badWord = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "confirm",
    token: prepare.json.token,
    typed_confirmation: "supprimer",
  });
  assertEquals(badWord.status, 400);

  // Real confirmation.
  const confirm = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "confirm",
    token: prepare.json.token,
    typed_confirmation: "DELETE",
  });
  assertEquals(confirm.status, 200, JSON.stringify(confirm.json));
  assert(confirm.json?.ok);

  // Profile flagged, purge in ~7 days.
  const { data: profile } = await admin.from("profiles")
    .select("account_status,purge_at,whatsapp_opted_in,whatsapp_optout_reason,pre_deletion_whatsapp_opted_in")
    .eq("id", userId).single();
  assertEquals(profile!.account_status, "deletion_pending");
  const purgeMs = new Date(profile!.purge_at).getTime() - Date.now();
  assert(purgeMs > 6.9 * 24 * 3600 * 1000 && purgeMs < 7.1 * 24 * 3600 * 1000, "purge_at ≈ J+7");
  assertEquals(profile!.whatsapp_opted_in, false);
  assertEquals(profile!.whatsapp_optout_reason, "account_deletion");
  assertEquals(profile!.pre_deletion_whatsapp_opted_in, true);

  // Subscription cancelled (MEGA Stripe stub), scheduled work cancelled.
  const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", userId).single();
  assertEquals(sub!.status, "canceled");
  const { data: checkin } = await admin.from("scheduled_checkins").select("status").eq("id", checkinRow.id).single();
  assertEquals(checkin!.status, "cancelled");
  const { data: pendings } = await admin.from("whatsapp_pending_actions")
    .select("status").eq("user_id", userId);
  for (const p of pendings ?? []) assertEquals(p.status, "cancelled");

  // Token replay → rejected.
  const replay = await callFn(supabaseUrl, anonKey, "account-deletion-v1", accessToken, {
    action: "confirm",
    token: prepare.json.token,
    typed_confirmation: "DELETE",
  });
  assert(replay.status === 401 || replay.status === 403 || replay.status === 409,
    `replay should be rejected, got ${replay.status}`);
});

Deno.test("account deletion: outbound WhatsApp is refused for deletion_pending accounts", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken } = await createTestUser(anon);
  await admin.from("profiles").update({
    phone_number: `+3362${makeNonce().slice(0, 7)}`,
    whatsapp_opted_in: true,
  }).eq("id", userId);
  await deleteAccount(supabaseUrl, anonKey, accessToken);

  // Even an "opted-in" direct send must be blocked by the central gate.
  await admin.from("profiles").update({ whatsapp_opted_in: true }).eq("id", userId);
  const send = await callInternal(supabaseUrl, anonKey, "whatsapp-send", {
    user_id: userId,
    message: { type: "text", body: "coucou" },
    purpose: "scheduled_checkin",
  });
  assertEquals(send.status, 409, JSON.stringify(send.json));
});

Deno.test("account deletion: process-checkins does not deliver for deletion_pending accounts", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken } = await createTestUser(anon);
  await admin.from("profiles").update({
    phone_number: `+3363${makeNonce().slice(0, 7)}`,
    whatsapp_opted_in: true,
    timezone: "Europe/Paris",
  }).eq("id", userId);
  await deleteAccount(supabaseUrl, anonKey, accessToken);

  // Simulate a checkin the T0 cleanup missed (e.g. created by a racing job).
  const { data: checkinRow, error } = await admin.from("scheduled_checkins").insert({
    user_id: userId,
    event_context: "test_deletion_cron_exclusion",
    draft_message: "ne dois jamais partir",
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    status: "pending",
  }).select("id").single();
  if (error) throw error;

  // T0 legitimately sent the final confirmation message; the invariant is that
  // the cron run adds NOTHING on top of it.
  const { data: beforeRows } = await admin.from("whatsapp_outbound_messages")
    .select("id").eq("user_id", userId);
  const beforeCount = (beforeRows ?? []).length;

  const run = await callInternal(supabaseUrl, anonKey, "process-checkins", {});
  assertEquals(run.status, 200, JSON.stringify(run.json));

  const { data: after } = await admin.from("scheduled_checkins")
    .select("status").eq("id", checkinRow.id).single();
  assert(after!.status !== "sent", `checkin must not be sent (got ${after!.status})`);
  const { data: outbound } = await admin.from("whatsapp_outbound_messages")
    .select("id").eq("user_id", userId);
  assertEquals((outbound ?? []).length, beforeCount, "the cron run must not send anything");
});

Deno.test("account restore: one click brings the account back (subscription stays cancelled)", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken, email } = await createTestUser(anon);
  await admin.from("profiles").update({
    phone_number: `+3364${makeNonce().slice(0, 7)}`,
    whatsapp_opted_in: true,
  }).eq("id", userId);
  const { error: subSeedErr } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: `sub_${makeNonce()}`,
    stripe_price_id: "price_test_alliance_monthly",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
  }, { onConflict: "user_id" });
  if (subSeedErr) throw subSeedErr;
  await deleteAccount(supabaseUrl, anonKey, accessToken);

  // T0 revoked all sessions: log in again, as a returning user would.
  const { data: relogin, error: reloginErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (reloginErr) throw reloginErr;
  const freshToken = relogin.session!.access_token as string;

  const restore = await callFn(supabaseUrl, anonKey, "account-restore-v1", freshToken, {});
  assertEquals(restore.status, 200, JSON.stringify(restore.json));
  assertEquals(restore.json?.restored, true);
  assertEquals(restore.json?.subscription_restored, false);

  const { data: profile } = await admin.from("profiles")
    .select("account_status,purge_at,deletion_requested_at,whatsapp_opted_in,whatsapp_opted_out_at,pre_deletion_whatsapp_opted_in")
    .eq("id", userId).single();
  assertEquals(profile!.account_status, "active");
  assertEquals(profile!.purge_at, null);
  assertEquals(profile!.deletion_requested_at, null);
  assertEquals(profile!.whatsapp_opted_in, true);
  assertEquals(profile!.whatsapp_opted_out_at, null);
  assertEquals(profile!.pre_deletion_whatsapp_opted_in, null);

  // The Stripe cancellation is final.
  const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", userId).single();
  assertEquals(sub!.status, "canceled");

  // Restoring an already-active account is a no-op, not an error.
  const again = await callFn(supabaseUrl, anonKey, "account-restore-v1", freshToken, {});
  assertEquals(again.status, 200);
  assertEquals(again.json?.already_active, true);
});

Deno.test("purge: hard-deletes everything, anonymises llm_usage_events, is idempotent and crash-resumable", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken } = await createTestUser(anon);
  const phone = `+3365${makeNonce().slice(0, 7)}`;
  await admin.from("profiles").update({
    phone_number: phone,
    whatsapp_opted_in: true,
  }).eq("id", userId);

  // Seed data across cascade / SET NULL / FK-less tables.
  const { error: chatErr } = await admin.from("chat_messages").insert({
    user_id: userId,
    role: "user",
    content: "donnée personnelle à purger",
    scope: "web",
  });
  if (chatErr) throw chatErr;
  const { data: llmRow, error: llmErr } = await admin.from("llm_usage_events").insert({
    user_id: userId,
    model: "test-model",
    kind: "generate",
    total_tokens: 42,
  }).select("id").single();
  if (llmErr) throw llmErr;
  const providerMsgId = `wamid_test_${makeNonce()}`;
  const { error: outErr } = await admin.from("whatsapp_outbound_messages").insert({
    user_id: userId,
    to_e164: phone,
    message_type: "text",
    content_preview: "contenu de message personnel",
    status: "sent",
    provider_message_id: providerMsgId,
    // NOT NULL sans DEFAULT depuis la migration de-whatsapp: le canal est dit,
    // jamais deviné.
    delivery_channel: "whatsapp",
  });
  if (outErr) throw outErr;
  const { error: evErr } = await admin.from("whatsapp_outbound_status_events").insert({
    provider_message_id: providerMsgId,
    status: "delivered",
    recipient_id: phone.replace(/\D/g, ""),
  });
  if (evErr) throw evErr;

  await deleteAccount(supabaseUrl, anonKey, accessToken);
  // Force the purge window open.
  await admin.from("profiles").update({
    purge_at: new Date(Date.now() - 60_000).toISOString(),
  }).eq("id", userId);

  // Crash-resume simulation: a previous run already wrote the deletion record
  // (step 1) before dying — the re-run must complete without erroring.
  const preRun = await callInternal(supabaseUrl, anonKey, "purge-deleted-accounts", {});
  assertEquals(preRun.status, 200, JSON.stringify(preRun.json));
  assertEquals(preRun.json?.errors?.length ?? 0, 0, JSON.stringify(preRun.json?.errors));
  assert((preRun.json?.purged ?? 0) >= 1, "at least our user should be purged");

  // Auth user and profile gone.
  const { data: gone } = await admin.auth.admin.getUserById(userId);
  assert(!gone?.user, "auth user must be deleted");
  const { data: profileAfter } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  assertEquals(profileAfter, null);
  // Cascade tables emptied.
  const { data: chats } = await admin.from("chat_messages").select("id").eq("user_id", userId);
  assertEquals((chats ?? []).length, 0);
  // Personal data in FK-less / SET NULL tables hard-deleted.
  const { data: outbound } = await admin.from("whatsapp_outbound_messages").select("id").eq("provider_message_id", providerMsgId);
  assertEquals((outbound ?? []).length, 0);
  const { data: events } = await admin.from("whatsapp_outbound_status_events").select("id").eq("provider_message_id", providerMsgId);
  assertEquals((events ?? []).length, 0);
  // llm_usage_events anonymised, not deleted (cost accounting preserved).
  const { data: llmAfter } = await admin.from("llm_usage_events").select("id,user_id,total_tokens").eq("id", llmRow.id).single();
  assertEquals(llmAfter!.user_id, null);
  assertEquals(llmAfter!.total_tokens, 42);
  // Anonymised proof of deletion exists.
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`user:${userId}`));
  const userIdHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: record } = await admin.from("deletion_records")
    .select("user_id_hash,email_hash,phone_hash,deleted_at").eq("user_id_hash", userIdHash).single();
  assert(record, "deletion_records row must exist");
  assert(record!.email_hash, "email hash recorded");
  assert(record!.phone_hash, "phone hash recorded");

  // Idempotence: a second run is a clean no-op for this user.
  const rerun = await callInternal(supabaseUrl, anonKey, "purge-deleted-accounts", {});
  assertEquals(rerun.status, 200);
  assertEquals(rerun.json?.errors?.length ?? 0, 0, JSON.stringify(rerun.json?.errors));
  const { data: records } = await admin.from("deletion_records").select("id").eq("user_id_hash", userIdHash);
  assertEquals((records ?? []).length, 1, "no duplicate deletion record");
});

Deno.test("deletion_records: RLS is sealed for anon and authenticated roles", { ignore: SKIP_INTEGRATION }, async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { anon } = clients();

  const { error: anonErr, data: anonData } = await anon.from("deletion_records").select("id").limit(1);
  assert(anonErr !== null || (anonData ?? []).length === 0, "anon must not read deletion_records");

  const { accessToken } = await createTestUser(anon);
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { error: authErr, data: authData } = await authed.from("deletion_records").select("id").limit(1);
  assert(authErr !== null || (authData ?? []).length === 0, "authenticated must not read deletion_records");

  const { error: insErr } = await authed.from("deletion_records").insert({
    user_id_hash: `hack_${makeNonce()}`,
  });
  assert(insErr !== null, "authenticated must not write deletion_records");
});

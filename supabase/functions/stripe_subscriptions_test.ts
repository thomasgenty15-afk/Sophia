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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signStripeWebhook(rawBody: string, webhookSecret: string, timestampSec: number): Promise<string> {
  const signedPayload = `${timestampSec}.${rawBody}`;
  const v1 = await hmacSha256Hex(webhookSecret, signedPayload);
  return `t=${timestampSec},v1=${v1}`;
}

async function createTestUserAndSession(anon: any) {
  const nonce = makeNonce();
  const email = `stripe+${nonce}@example.com`;
  const password = "TestPassword!123";

  const { error: signUpError } = await anon.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  if (!signInData.user?.id) throw new Error("Missing user after sign-in");
  const accessToken = signInData.session?.access_token;
  if (!accessToken) throw new Error("Missing access token after sign-in");

  return { userId: signInData.user.id, accessToken };
}

Deno.test("stripe: checkout + portal + webhook => DB subscriptions upsert (MEGA stub)", async () => {
  // Keep deterministic/offline mode: Stripe network calls are stubbed when MEGA_TEST_MODE=1.
  Deno.env.set("MEGA_TEST_MODE", "1");

  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, accessToken } = await createTestUserAndSession(anon);

  // 1) Checkout session (requires JWT)
  const checkoutRes = await fetch(`${supabaseUrl}/functions/v1/stripe-create-checkout-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tier: "system", interval: "monthly" }),
  });
  assertEquals(checkoutRes.status, 200);
  const checkoutJson = await checkoutRes.json();
  assert(typeof checkoutJson?.url === "string" && checkoutJson.url.length > 0, "checkout should return a url");

  // Profile should have customer id (created during checkout)
  const { data: profile, error: profileErr } = await admin.from("profiles").select("stripe_customer_id").eq("id", userId).single();
  if (profileErr) throw profileErr;
  const stripeCustomerId = (profile as any)?.stripe_customer_id as string | null | undefined;
  assert(typeof stripeCustomerId === "string" && stripeCustomerId.length > 0, "profile should have stripe_customer_id");

  // 2) Portal session (requires JWT)
  const portalRes = await fetch(`${supabaseUrl}/functions/v1/stripe-create-portal-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ return_path: "/dashboard?billing=portal" }),
  });
  assertEquals(portalRes.status, 200);
  const portalJson = await portalRes.json();
  assert(typeof portalJson?.url === "string" && portalJson.url.length > 0, "portal should return a url");

  // 3) Webhook: subscription.created upserts into `subscriptions`
  const nowSec = Math.floor(Date.now() / 1000);
  const eventId = `evt_${makeNonce()}`;
  const subscriptionId = `sub_${makeNonce()}`;
  const rawBody = JSON.stringify({
    id: eventId,
    type: "customer.subscription.created",
    data: {
      object: {
        id: subscriptionId,
        status: "active",
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nowSec + 30 * 24 * 3600,
        customer: stripeCustomerId,
        items: { data: [{ price: { id: "price_test_system_monthly" } }] },
        metadata: { supabase_user_id: userId },
      },
    },
  });

  const sig = await signStripeWebhook(rawBody, webhookSecret, nowSec);
  const webhookRes = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sig,
      // Local Supabase gateway may require apikey even when verify_jwt=false.
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: rawBody,
  });
  assertEquals(webhookRes.status, 200);
  // Consume body to avoid Deno "leaks detected" (unread response body stream).
  await webhookRes.text();

  const { data: subRow, error: subErr } = await admin
    .from("subscriptions")
    .select("user_id,stripe_subscription_id,stripe_price_id,status,cancel_at_period_end")
    .eq("user_id", userId)
    .single();
  if (subErr) throw subErr;
  assertEquals((subRow as any).stripe_subscription_id, subscriptionId);
  assertEquals((subRow as any).status, "active");
  assertEquals((subRow as any).cancel_at_period_end, false);
  assertEquals((subRow as any).stripe_price_id, "price_test_system_monthly");

  // 4) Idempotency: same Stripe event id should be treated as duplicate.
  const webhookRes2 = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sig,
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: rawBody,
  });
  assertEquals(webhookRes2.status, 200);
  const webhookJson2 = await webhookRes2.json();
  assertEquals(Boolean(webhookJson2?.duplicate), true);
});

Deno.test("stripe: if subscription already active, checkout endpoint returns Billing Portal URL (no double subscription)", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");

  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { userId, accessToken } = await createTestUserAndSession(anon);

  // Seed an "active" subscription row (mirrors what stripe-webhook would normally create).
  const periodEnd = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
  const { error: subErr } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: `sub_${makeNonce()}`,
    stripe_price_id: "price_test_system_monthly",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (subErr) throw subErr;

  const res = await fetch(`${supabaseUrl}/functions/v1/stripe-create-checkout-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tier: "alliance", interval: "monthly" }),
  });
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json?.mode, "portal");
  assert(typeof json?.url === "string" && json.url.length > 0, "should return billing portal url");
});



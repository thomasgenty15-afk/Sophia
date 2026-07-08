// Tests du programme de parrainage (MEGA_TEST_MODE=1, Supabase local).
//
//   deno test --allow-env --allow-net supabase/functions/referral_program_test.ts
//
// Couvre : génération/attribution du code, extension de trial à 30 jours,
// idempotence de la récompense webhook (première facture payée uniquement),
// plafond 12 mois / 12 mois glissants, blocage de l'auto-parrainage.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

const REFERRAL_CODE_RE = /^SOPHIA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
const DAY_MS = 24 * 3600 * 1000;

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signStripeWebhook(
  rawBody: string,
  webhookSecret: string,
  timestampSec: number,
): Promise<string> {
  const v1 = await hmacSha256Hex(webhookSecret, `${timestampSec}.${rawBody}`);
  return `t=${timestampSec},v1=${v1}`;
}

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
  return { supabaseUrl, anonKey, anon, admin };
}

function userClient(supabaseUrl: string, anonKey: string, accessToken: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function createTestUser(
  anon: any,
  opts?: { referralCode?: string; phone?: string },
) {
  const nonce = makeNonce();
  const email = `referral+${nonce}@example.com`;
  const password = "TestPassword!123";

  const { error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `Test ${nonce}`,
        ...(opts?.phone ? { phone: opts.phone } : {}),
        ...(opts?.referralCode ? { referral_code: opts.referralCode } : {}),
      },
    },
  });
  if (signUpError) throw signUpError;

  const { data, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  if (!data.user?.id) throw new Error("Missing user after sign-in");
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Missing access token after sign-in");

  return { userId: data.user.id, accessToken, email };
}

async function getReferralCodeFor(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
): Promise<string> {
  const user = userClient(supabaseUrl, anonKey, accessToken);
  const { data, error } = await user.rpc("get_or_create_referral_code");
  if (error) throw error;
  return String(data);
}

async function postStripeWebhook(
  supabaseUrl: string,
  anonKey: string,
  event: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
  const rawBody = JSON.stringify(event);
  const nowSec = Math.floor(Date.now() / 1000);
  const sig = await signStripeWebhook(rawBody, webhookSecret, nowSec);
  const res = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sig,
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: rawBody,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function paidInvoiceEvent(args: {
  referredUserId: string;
  invoiceId: string;
  eventId?: string;
  amountPaid?: number;
  subscriptionId?: string;
  customerId?: string;
}) {
  return {
    id: args.eventId ?? `evt_${makeNonce()}`,
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: args.invoiceId,
        object: "invoice",
        amount_paid: args.amountPaid ?? 1990,
        customer: args.customerId ?? `cus_${makeNonce()}`,
        subscription: args.subscriptionId ?? `sub_${makeNonce()}`,
        billing_reason: "subscription_cycle",
        subscription_details: {
          metadata: { supabase_user_id: args.referredUserId },
        },
      },
    },
  };
}

Deno.test("parrainage: génération paresseuse d'un code stable et dictable", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();
  const { userId, accessToken } = await createTestUser(anon);

  // Pas de code tant que personne ne le demande.
  const { data: before } = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  assertEquals(before, null);

  const code1 = await getReferralCodeFor(supabaseUrl, anonKey, accessToken);
  assertMatch(code1, REFERRAL_CODE_RE);

  // Idempotent : le deuxième appel renvoie le même code.
  const code2 = await getReferralCodeFor(supabaseUrl, anonKey, accessToken);
  assertEquals(code2, code1);
});

Deno.test("parrainage: l'inscription avec un code attribue le filleul et étend l'essai à 30 jours", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();

  const referrer = await createTestUser(anon);
  const code = await getReferralCodeFor(
    supabaseUrl,
    anonKey,
    referrer.accessToken,
  );

  // Le code est tolérant à la casse et aux espaces (dictable à l'oral).
  const referred = await createTestUser(anon, {
    referralCode: ` ${code.toLowerCase()} `,
  });

  const { data: referral, error: referralErr } = await admin
    .from("referrals")
    .select("referrer_id, referred_id, code, status, trial_started_at")
    .eq("referred_id", referred.userId)
    .single();
  if (referralErr) throw referralErr;
  assertEquals((referral as any).referrer_id, referrer.userId);
  assertEquals((referral as any).code, code);
  assertEquals((referral as any).status, "trial_started");
  assert((referral as any).trial_started_at, "trial_started_at should be set");

  // Essai étendu : 30 jours au lieu des 14 par défaut, et tier trial recalculé.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("trial_start, trial_end, access_tier")
    .eq("id", referred.userId)
    .single();
  if (profileErr) throw profileErr;
  const trialDays =
    (Date.parse((profile as any).trial_end) -
      Date.parse((profile as any).trial_start)) / DAY_MS;
  assert(
    trialDays > 29 && trialDays < 31,
    `trial should last ~30 days, got ${trialDays}`,
  );
  assertEquals((profile as any).access_tier, "trial");

  // Le parrain, lui, garde son essai standard de ~14 jours.
  const { data: referrerProfile } = await admin
    .from("profiles")
    .select("trial_start, trial_end")
    .eq("id", referrer.userId)
    .single();
  const referrerTrialDays =
    (Date.parse((referrerProfile as any).trial_end) -
      Date.parse((referrerProfile as any).trial_start)) / DAY_MS;
  assert(
    referrerTrialDays < 20,
    `referrer trial should stay ~14 days, got ${referrerTrialDays}`,
  );
});

Deno.test("parrainage: récompense idempotente sur la première facture payée, puis créditée quand le parrain s'abonne", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();

  const referrer = await createTestUser(anon);
  const code = await getReferralCodeFor(
    supabaseUrl,
    anonKey,
    referrer.accessToken,
  );
  const referred = await createTestUser(anon, { referralCode: code });

  // 1) Facture à 0 € (période d'essai Stripe) : aucune récompense.
  const zeroInvoice = paidInvoiceEvent({
    referredUserId: referred.userId,
    invoiceId: `in_zero_${makeNonce()}`,
    amountPaid: 0,
  });
  const zeroRes = await postStripeWebhook(supabaseUrl, anonKey, zeroInvoice);
  assertEquals(zeroRes.status, 200);
  assertEquals(zeroRes.json?.reason, "zero_amount_invoice");
  const { data: rewardsAfterZero } = await admin
    .from("referral_rewards")
    .select("id")
    .eq("referred_id", referred.userId);
  assertEquals((rewardsAfterZero ?? []).length, 0);

  // 2) Première facture payée : récompense banquée (le parrain est en essai).
  const invoiceId = `in_${makeNonce()}`;
  const paidEvent = paidInvoiceEvent({
    referredUserId: referred.userId,
    invoiceId,
  });
  const paidRes = await postStripeWebhook(supabaseUrl, anonKey, paidEvent);
  assertEquals(paidRes.status, 200);
  assertEquals(paidRes.json?.referral?.claimed, true);
  assertEquals(paidRes.json?.referral?.capped, false);

  const { data: reward, error: rewardErr } = await admin
    .from("referral_rewards")
    .select("id, referrer_id, months, status, stripe_invoice_id")
    .eq("referred_id", referred.userId)
    .single();
  if (rewardErr) throw rewardErr;
  assertEquals((reward as any).referrer_id, referrer.userId);
  assertEquals((reward as any).months, 1);
  assertEquals((reward as any).status, "banked");
  assertEquals((reward as any).stripe_invoice_id, invoiceId);

  const { data: referralRow } = await admin
    .from("referrals")
    .select("status, rewarded_at")
    .eq("referred_id", referred.userId)
    .single();
  assertEquals((referralRow as any).status, "rewarded");
  assert((referralRow as any).rewarded_at, "rewarded_at should be set");

  // 3) Rejeu Stripe du même événement : dédupliqué par event id.
  const replayRes = await postStripeWebhook(supabaseUrl, anonKey, paidEvent);
  assertEquals(replayRes.status, 200);
  assertEquals(Boolean(replayRes.json?.duplicate), true);

  // 4) Facture suivante du filleul (nouvel event id) : le ledger
  //    UNIQUE(referred_id) bloque toute deuxième récompense.
  const secondInvoice = paidInvoiceEvent({
    referredUserId: referred.userId,
    invoiceId: `in_second_${makeNonce()}`,
  });
  const secondRes = await postStripeWebhook(supabaseUrl, anonKey, secondInvoice);
  assertEquals(secondRes.status, 200);
  assertEquals(secondRes.json?.referral?.claimed, false);
  assertEquals(secondRes.json?.referral?.reason, "already_claimed");

  const { data: allRewards } = await admin
    .from("referral_rewards")
    .select("id")
    .eq("referred_id", referred.userId);
  assertEquals((allRewards ?? []).length, 1);

  // 5) Le parrain souscrit : la récompense banquée est appliquée en crédit
  //    de balance Stripe (stub MEGA) sur son customer.
  const referrerCustomerId = `cus_${makeNonce()}`;
  const referrerSubEvent = {
    id: `evt_${makeNonce()}`,
    type: "customer.subscription.created",
    data: {
      object: {
        id: `sub_${makeNonce()}`,
        status: "active",
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        customer: referrerCustomerId,
        items: { data: [{ price: { id: "price_test_alliance_monthly" } }] },
        metadata: { supabase_user_id: referrer.userId },
      },
    },
  };
  const subRes = await postStripeWebhook(supabaseUrl, anonKey, referrerSubEvent);
  assertEquals(subRes.status, 200);

  const { data: creditedReward, error: creditedErr } = await admin
    .from("referral_rewards")
    .select("status, amount_cents, currency, stripe_balance_transaction_id, credited_at")
    .eq("referred_id", referred.userId)
    .single();
  if (creditedErr) throw creditedErr;
  assertEquals((creditedReward as any).status, "credited");
  assert(
    Number((creditedReward as any).amount_cents) > 0,
    "credited amount should be positive",
  );
  assertEquals((creditedReward as any).currency, "eur");
  assertMatch(
    String((creditedReward as any).stripe_balance_transaction_id),
    /^cbtxn_MEGA_TEST_/,
  );
  assert((creditedReward as any).credited_at, "credited_at should be set");

  // 6) Rejouer un événement d'abonnement du parrain ne re-crédite pas.
  const subReplayEvent = {
    ...referrerSubEvent,
    id: `evt_${makeNonce()}`,
  };
  const subReplayRes = await postStripeWebhook(
    supabaseUrl,
    anonKey,
    subReplayEvent,
  );
  assertEquals(subReplayRes.status, 200);
  const { data: rewardAfterReplay } = await admin
    .from("referral_rewards")
    .select("status, stripe_balance_transaction_id")
    .eq("referred_id", referred.userId)
    .single();
  assertEquals(
    (rewardAfterReplay as any).stripe_balance_transaction_id,
    (creditedReward as any).stripe_balance_transaction_id,
  );
});

Deno.test("parrainage: plafond fusible de 12 mois par période glissante de 12 mois", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();

  const referrer = await createTestUser(anon);
  const code = await getReferralCodeFor(
    supabaseUrl,
    anonKey,
    referrer.accessToken,
  );

  // Seed : 12 mois déjà gagnés sur les 12 derniers mois.
  const seedRows = Array.from({ length: 12 }, () => ({
    referrer_id: referrer.userId,
    referred_id: crypto.randomUUID(),
    months: 1,
    status: "credited",
  }));
  const { error: seedErr } = await admin
    .from("referral_rewards")
    .insert(seedRows);
  if (seedErr) throw seedErr;

  // 13e conversion réelle : trackée mais non créditée.
  const referred = await createTestUser(anon, { referralCode: code });
  const cappedRes = await postStripeWebhook(
    supabaseUrl,
    anonKey,
    paidInvoiceEvent({
      referredUserId: referred.userId,
      invoiceId: `in_capped_${makeNonce()}`,
    }),
  );
  assertEquals(cappedRes.status, 200);
  assertEquals(cappedRes.json?.referral?.claimed, true);
  assertEquals(cappedRes.json?.referral?.capped, true);

  const { data: cappedReward, error: cappedErr } = await admin
    .from("referral_rewards")
    .select("months, status")
    .eq("referred_id", referred.userId)
    .single();
  if (cappedErr) throw cappedErr;
  assertEquals((cappedReward as any).status, "capped");
  assertEquals((cappedReward as any).months, 0);

  const { data: referralRow } = await admin
    .from("referrals")
    .select("status, converted_at, rewarded_at")
    .eq("referred_id", referred.userId)
    .single();
  assertEquals((referralRow as any).status, "converted");
  assert((referralRow as any).converted_at, "converted_at should be set");
  assertEquals((referralRow as any).rewarded_at, null);
});

Deno.test("parrainage: l'auto-parrainage est bloqué (même compte, même téléphone)", async () => {
  Deno.env.set("MEGA_TEST_MODE", "1");
  const { supabaseUrl, anonKey, anon, admin } = clients();

  const referrer = await createTestUser(anon);
  const code = await getReferralCodeFor(
    supabaseUrl,
    anonKey,
    referrer.accessToken,
  );

  // Même compte : refusé par la RPC d'attribution.
  const { data: selfResult, error: selfErr } = await admin.rpc(
    "apply_referral_attribution",
    { p_referred_id: referrer.userId, p_raw_code: code },
  );
  if (selfErr) throw selfErr;
  assertEquals((selfResult as any).applied, false);
  assertEquals((selfResult as any).reason, "self_referral");

  // Même numéro de téléphone (non vérifié, donc l'inscription passe) :
  // l'attribution est refusée et l'essai reste à 14 jours.
  const sharedPhone = `+3361${makeNonce().replace(/\D/g, "").padEnd(7, "4").slice(0, 7)}`;
  await admin
    .from("profiles")
    .update({ phone_number: sharedPhone })
    .eq("id", referrer.userId);

  const samePhoneUser = await createTestUser(anon, {
    referralCode: code,
    phone: sharedPhone,
  });

  const { data: referralRow } = await admin
    .from("referrals")
    .select("id")
    .eq("referred_id", samePhoneUser.userId)
    .maybeSingle();
  assertEquals(referralRow, null);

  const { data: profile } = await admin
    .from("profiles")
    .select("trial_start, trial_end")
    .eq("id", samePhoneUser.userId)
    .single();
  const trialDays =
    (Date.parse((profile as any).trial_end) -
      Date.parse((profile as any).trial_start)) / DAY_MS;
  assert(
    trialDays < 20,
    `trial should stay ~14 days when attribution is blocked, got ${trialDays}`,
  );

  // Code inconnu : refus explicite, l'inscription n'est jamais bloquée.
  const { data: unknownResult, error: unknownErr } = await admin.rpc(
    "apply_referral_attribution",
    { p_referred_id: referrer.userId, p_raw_code: "SOPHIA-ZZZZ" },
  );
  if (unknownErr) throw unknownErr;
  assertEquals((unknownResult as any).applied, false);
  assertEquals((unknownResult as any).reason, "unknown_code");
});

// Referral reward engine (parrainage), driven by the Stripe webhook.
//
// Reward rules (see migration 20260708160000_referral_program.sql):
//   * The referrer earns 1 free month on the referred user's FIRST PAID
//     invoice (amount_paid > 0) — never at signup, never on a 0€ invoice.
//   * The claim is idempotent: `claim_referral_reward` inserts into a ledger
//     with UNIQUE(referred_id), so Stripe webhook replays and later invoices
//     are no-ops. A rolling 12-month cap of 12 earned months is enforced
//     inside the same RPC (advisory-locked per referrer).
//   * The credit is a Stripe customer balance credit of the referrer's
//     current monthly tier price. If the referrer is not a paying customer
//     yet, the reward stays "banked" and is applied automatically when their
//     own subscription shows up (customer.subscription.* events).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { stripeRequest } from "./stripe.ts";

export type ClaimReferralRewardResult = {
  claimed: boolean;
  capped?: boolean;
  reward_id?: string;
  referrer_id?: string;
  months_last_12m?: number;
  reason?: string;
};

export type ApplyBankedRewardsResult = {
  credited: number;
  skipped_reason?: string;
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// SEC-08 gating identical to the MEGA stub in _shared/stripe.ts.
function isMegaTestModeLocal(): boolean {
  if ((Deno.env.get("MEGA_TEST_MODE") ?? "").trim() !== "1") return false;
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

function monthlyPriceIdForTier(tier: string): string | null {
  const byTier: Record<string, string> = {
    system: "STRIPE_PRICE_ID_SYSTEM_MONTHLY",
    alliance: "STRIPE_PRICE_ID_ALLIANCE_MONTHLY",
    architecte: "STRIPE_PRICE_ID_ARCHITECTE_MONTHLY",
  };
  const envName = byTier[tier];
  if (!envName) return null;
  const v = Deno.env.get(envName)?.trim();
  if (v && v.length > 0) return v;
  // Deterministic local tests: the MEGA price stub accepts these ids.
  if (isMegaTestModeLocal()) return `price_test_${tier}_monthly`;
  return null;
}

/**
 * Resolve the Supabase user behind a Stripe invoice. Preference order matches
 * the subscription handler: subscription metadata first (always present on
 * checkout-created subscriptions), then our own mirrors.
 */
export async function resolveInvoiceUserId(
  admin: SupabaseClient,
  invoice: any,
): Promise<string | null> {
  const metaUserId = invoice?.subscription_details?.metadata?.supabase_user_id;
  if (typeof metaUserId === "string" && metaUserId.trim()) {
    return metaUserId.trim();
  }

  const stripeSubscriptionId = typeof invoice?.subscription === "string"
    ? invoice.subscription
    : null;
  if (stripeSubscriptionId) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    const userId = (data as { user_id?: string } | null)?.user_id;
    if (userId) return userId;
  }

  const stripeCustomerId = typeof invoice?.customer === "string"
    ? invoice.customer
    : null;
  if (stripeCustomerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    const userId = (data as { id?: string } | null)?.id;
    if (userId) return userId;
  }

  return null;
}

/**
 * Claim the referral conversion for a referred user's paid invoice.
 * Safe to call for every paid invoice: users without a referral, replayed
 * events and non-first invoices all resolve to `claimed: false`.
 */
export async function claimReferralRewardForInvoice(args: {
  admin: SupabaseClient;
  referredUserId: string;
  stripeInvoiceId: string;
}): Promise<ClaimReferralRewardResult> {
  const { data, error } = await args.admin.rpc("claim_referral_reward", {
    p_referred_id: args.referredUserId,
    p_stripe_invoice_id: args.stripeInvoiceId,
  });
  if (error) throw error;
  return (data ?? { claimed: false }) as ClaimReferralRewardResult;
}

/**
 * Apply every banked reward of a referrer as Stripe customer balance credits,
 * if (and only if) they are a paying customer. Idempotent at two levels: the
 * banked -> credited transition is a conditional UPDATE (only one caller
 * wins), and the Stripe call carries an Idempotency-Key derived from the
 * ledger row. On Stripe failure the row is reverted to banked so a later
 * webhook event retries it.
 */
export async function applyBankedReferralRewards(args: {
  admin: SupabaseClient;
  referrerId: string;
  requestId: string;
}): Promise<ApplyBankedRewardsResult> {
  const { admin, referrerId, requestId } = args;

  const { data: banked, error: bankedErr } = await admin
    .from("referral_rewards")
    .select("id, months")
    .eq("referrer_id", referrerId)
    .eq("status", "banked");
  if (bankedErr) throw bankedErr;
  const rewards = (banked ?? []) as Array<{ id: string; months: number }>;
  if (rewards.length === 0) return { credited: 0 };

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", referrerId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  const stripeCustomerId =
    (profile as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id ?? null;

  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("status, tier, current_period_end")
    .eq("user_id", referrerId)
    .maybeSingle();
  if (subErr) throw subErr;
  const subRow = sub as
    | { status?: string | null; tier?: string | null }
    | null;
  const subStatus = String(subRow?.status ?? "").toLowerCase();
  const tier = String(subRow?.tier ?? "").toLowerCase();
  const isPayingCustomer = Boolean(stripeCustomerId) &&
    (subStatus === "active" || subStatus === "trialing") &&
    ["system", "alliance", "architecte"].includes(tier);
  if (!isPayingCustomer) {
    // Not a paying customer yet: the months stay banked and visible in the
    // referral screen; they are applied when their subscription shows up.
    return { credited: 0, skipped_reason: "referrer_not_paying" };
  }

  const priceId = monthlyPriceIdForTier(tier);
  if (!priceId) {
    return { credited: 0, skipped_reason: `no_monthly_price_for_tier_${tier}` };
  }

  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const price = await stripeRequest<{ unit_amount: number; currency: string }>({
    method: "GET",
    path: `/v1/prices/${priceId}`,
    secretKey,
  });
  const unitAmount = Number(price?.unit_amount ?? 0);
  const currency = String(price?.currency ?? "eur");
  if (!(unitAmount > 0)) {
    return { credited: 0, skipped_reason: "monthly_price_has_no_amount" };
  }

  let credited = 0;
  for (const reward of rewards) {
    const months = Number(reward.months ?? 0);
    if (!(months > 0)) continue;
    const amountCents = unitAmount * months;

    // Atomic banked -> credited claim: only the first caller flips the row.
    const { data: claimRows, error: claimErr } = await admin
      .from("referral_rewards")
      .update({
        status: "credited",
        credited_at: new Date().toISOString(),
        amount_cents: amountCents,
        currency,
      })
      .eq("id", reward.id)
      .eq("status", "banked")
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimRows || claimRows.length === 0) continue;

    try {
      const txn = await stripeRequest<{ id: string }>({
        method: "POST",
        path: `/v1/customers/${stripeCustomerId}/balance_transactions`,
        secretKey,
        idempotencyKey: `referral-credit-${reward.id}`,
        body: {
          // Negative amount = credit applied to the customer's next invoices.
          amount: -amountCents,
          currency,
          description: "Parrainage Sophia — 1 mois offert",
          metadata: {
            referral_reward_id: reward.id,
            supabase_user_id: referrerId,
          },
        },
      });
      await admin
        .from("referral_rewards")
        .update({ stripe_balance_transaction_id: txn?.id ?? null })
        .eq("id", reward.id);
      credited += 1;
    } catch (stripeErr) {
      // Release the claim so a later subscription/invoice event retries it.
      await admin
        .from("referral_rewards")
        .update({
          status: "banked",
          credited_at: null,
          amount_cents: null,
          currency: null,
        })
        .eq("id", reward.id)
        .eq("status", "credited")
        .then(() => {}, () => {});
      console.error(
        `[referral-reward] request_id=${requestId} balance credit failed reward_id=${reward.id}`,
        stripeErr,
      );
      throw stripeErr;
    }
  }

  return { credited };
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import {
  intervalFromStripePriceId,
  isKeelPlatformPriceId,
  tierFromStripePriceIds,
} from "../_shared/billing-tier.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

function requireEnv(name: string): string {
  const v = (globalThis as any)?.Deno?.env?.get?.(name);
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) throw new Error(`Missing env var: ${name}`);
  return t;
}

function unixToIso(ts: number | null | undefined): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

type StripeSub = {
  id: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  items?: { data?: Array<{ price?: { id?: string } }> };
  plan?: { id?: string };
};

type StripeList<T> = { data: T[] };

function pickActiveSubscription(subs: StripeSub[]): StripeSub | null {
  // Stripe list endpoints are usually newest-first; still keep a safe scan.
  for (const s of subs ?? []) {
    const st = String((s as any)?.status ?? "").toLowerCase();
    if (st === "active" || st === "trialing") return s;
  }
  return null;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuthed = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuthed.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    currentUserId = user.id;

    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("stripe_customer_id,email")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) {
      console.error("[stripe-sync-subscription] profile read error", profErr);
      await logEdgeFunctionError({
        functionName: "stripe-sync-subscription",
        error: profErr,
        severity: "error",
        title: "profile_read_failed",
        requestId,
        userId: currentUserId,
        source: "stripe",
      });
      return serverError(req, requestId);
    }
    let customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      // Recovery path: some envs missed persisting stripe_customer_id.
      // Best-effort lookup by email in Stripe, then persist back to profiles.
      // SEC-09: use ONLY the verified auth-provider email, never profiles.email
      // (which is RLS-writable by the user and could point at a victim's email).
      const email = (user as any)?.email ?? null;
      if (email) {
        try {
          const customers = await stripeRequest<{ data: Array<{ id?: string; metadata?: Record<string, unknown> }> }>({
            method: "GET",
            path: `/v1/customers?email=${encodeURIComponent(String(email))}&limit=10`,
            secretKey: stripeSecretKey,
          });
          // SEC-09: only ever bind a customer that Stripe itself attributes to THIS
          // user via metadata.supabase_user_id (set when we create the customer at
          // checkout). An email match alone is not proof of ownership.
          const ids = (customers?.data ?? [])
            .filter((c) => String((c as any)?.metadata?.supabase_user_id ?? "").trim() === user.id)
            .map((c) => String((c as any)?.id ?? "").trim())
            .filter(Boolean);
          // Prefer a customer that actually has an active subscription.
          for (const cid of ids) {
            const subs = await stripeRequest<{ data: any[] }>({
              method: "GET",
              path: `/v1/subscriptions?customer=${encodeURIComponent(cid)}&status=all&limit=10`,
              secretKey: stripeSecretKey,
            });
            const picked = (subs?.data ?? []).find((s) => {
              const st = String(s?.status ?? "").toLowerCase();
              return st === "active" || st === "trialing";
            });
            if (picked?.id) {
              customerId = cid;
              break;
            }
          }
          // Fallback: first matching customer by email.
          if (!customerId) customerId = ids[0];
          if (customerId) {
            await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
          }
        } catch (err) {
          console.warn("[stripe-sync-subscription] customer lookup by email failed", err);
        }
      }
    }

    if (!customerId) {
      return jsonResponse(req, { error: "No Stripe customer on file", request_id: requestId }, { status: 400 });
    }

    const list = await stripeRequest<StripeList<StripeSub>>({
      method: "GET",
      path: `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
      secretKey: stripeSecretKey,
    });

    const picked = pickActiveSubscription(list?.data ?? []);
    if (!picked) {
      return jsonResponse(req, { ok: true, synced: false, request_id: requestId });
    }

    const status = String((picked as any)?.status ?? "").trim() || null;
    // W10 — same two-item reasoning as the webhook: a KEEL coach subscription
    // carries the flat line AND the seat line in an order Stripe does not
    // promise. Resolving the tier from item[0] alone would blank it half the
    // time, and blanking a coach's tier drops their whole roster to 'none'.
    const allPriceIds: Array<string | null> = [
      ...((picked?.items?.data ?? []) as Array<any>).map(
        (it) => (it?.price?.id as string | undefined) ?? null,
      ),
      (picked?.plan?.id as string | undefined) ?? null,
    ];
    const stripePriceId = allPriceIds.find((id) => isKeelPlatformPriceId(id)) ??
      allPriceIds.find((id) => Boolean(id)) ??
      null;
    const tier = tierFromStripePriceIds(allPriceIds);
    const interval = allPriceIds
      .map((id) => intervalFromStripePriceId(id))
      .find((v) => v !== null) ?? null;
    const currentPeriodStart = unixToIso(picked.current_period_start);
    const currentPeriodEnd = unixToIso(picked.current_period_end);
    const cancelAtPeriodEnd = Boolean((picked as any)?.cancel_at_period_end);

    const { error: upsertErr } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_subscription_id: picked.id,
        stripe_price_id: stripePriceId,
        tier,
        interval,
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upsertErr) {
      console.error("[stripe-sync-subscription] subscriptions upsert error", upsertErr);
      await logEdgeFunctionError({
        functionName: "stripe-sync-subscription",
        error: upsertErr,
        severity: "error",
        title: "subscription_upsert_failed",
        requestId,
        userId: currentUserId,
        source: "stripe",
        metadata: { stripe_subscription_id: picked.id, stripe_price_id: stripePriceId },
      });
      return serverError(req, requestId);
    }

    await logEdgeFunctionError({
      functionName: "stripe-sync-subscription",
      error: "Stripe subscription synced",
      severity: "info",
      title: "subscription_synced",
      requestId,
      userId: currentUserId,
      source: "stripe",
      metadata: {
        status,
        stripe_subscription_id: picked.id,
        stripe_price_id: stripePriceId,
        tier,
        interval,
        current_period_end: currentPeriodEnd,
      },
    });

    return jsonResponse(req, {
      ok: true,
      synced: true,
      status,
      stripe_subscription_id: picked.id,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-sync-subscription] error", err);
    await logEdgeFunctionError({
      functionName: "stripe-sync-subscription",
      error: err,
      severity: "error",
      title: "subscription_sync_failed",
      requestId,
      userId: currentUserId,
      source: "stripe",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});


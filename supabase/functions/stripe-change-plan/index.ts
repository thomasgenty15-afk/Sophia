import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { badRequest, getRequestId, jsonResponse, parseJsonBody, serverError, z } from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import { intervalFromStripePriceId, tierFromStripePriceId } from "../_shared/billing-tier.ts";

const BodySchema = z
  .object({
    tier: z.enum(["system", "alliance", "architecte"]),
    interval: z.enum(["monthly", "yearly"]),
    // "now" = immediate change (upgrade / interval switch). "period_end" = schedule change at current_period_end (downgrade).
    effective_at: z.enum(["now", "period_end"]).optional(),
  })
  .strict();

function requireEnv(name: string): string {
  const v = (globalThis as any)?.Deno?.env?.get?.(name);
  const t = typeof v === "string" ? v.trim() : "";
  if (!v) throw new Error(`Missing env var: ${name}`);
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
  schedule?: string | null;
  items?: { data?: Array<{ id?: string; price?: { id?: string } }> };
  plan?: { id?: string };
};

type StripeList<T> = { data: T[] };

function pickActiveSubscription(subs: StripeSub[]): StripeSub | null {
  for (const s of subs ?? []) {
    const st = String((s as any)?.status ?? "").toLowerCase();
    if (st === "active" || st === "trialing") return s;
  }
  return null;
}

function rankTier(t: string | null | undefined): number {
  const v = String(t ?? "").trim().toLowerCase();
  if (v === "system") return 1;
  if (v === "alliance") return 2;
  if (v === "architecte") return 3;
  return 0;
}

const deno = (globalThis as any)?.Deno;

deno.serve(async (req: Request) => {
  const requestId = getRequestId(req);

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as {
      tier: "system" | "alliance" | "architecte";
      interval: "monthly" | "yearly";
      effective_at?: "now" | "period_end";
    };
    const effectiveAt = (body.effective_at ?? "now") as "now" | "period_end";

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");

    const priceEnvKey = `STRIPE_PRICE_ID_${body.tier.toUpperCase()}_${body.interval.toUpperCase()}`;
    const priceId = requireEnv(priceEnvKey);

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

    const admin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("stripe_customer_id,email")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) {
      console.error("[stripe-change-plan] profile read error", profErr);
      return serverError(req, requestId);
    }

    let customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const email = (user as any)?.email ?? (profile as any)?.email ?? null;
      if (email) {
        try {
          const customers = await stripeRequest<{ data: Array<{ id?: string }> }>({
            method: "GET",
            path: `/v1/customers?email=${encodeURIComponent(String(email))}&limit=10`,
            secretKey: stripeSecretKey,
          });
          const ids = (customers?.data ?? []).map((c) => String((c as any)?.id ?? "").trim()).filter(Boolean);
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
          console.warn("[stripe-change-plan] customer lookup by email failed", err);
        }
      }
    }
    if (!customerId) return badRequest(req, requestId, "No Stripe customer on file");

    // Find subscription: prefer DB mirror, fallback to Stripe list.
    let subId: string | null = null;
    const { data: subRow, error: subErr } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subErr) {
      console.error("[stripe-change-plan] subscriptions read error", subErr);
      return serverError(req, requestId);
    }
    const mirroredId = String((subRow as any)?.stripe_subscription_id ?? "").trim();
    if (mirroredId) subId = mirroredId;

    if (!subId) {
      const list = await stripeRequest<StripeList<StripeSub>>({
        method: "GET",
        path: `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
        secretKey: stripeSecretKey,
      });
      const picked = pickActiveSubscription(list?.data ?? []);
      subId = picked?.id ?? null;
    }
    if (!subId) return badRequest(req, requestId, "No active subscription found to change");

    // Retrieve subscription to get item id.
    const existing = await stripeRequest<StripeSub>({
      method: "GET",
      path: `/v1/subscriptions/${encodeURIComponent(subId)}`,
      secretKey: stripeSecretKey,
    });

    const itemId = (existing?.items?.data?.[0]?.id as string | undefined) ?? null;
    if (!itemId) return badRequest(req, requestId, "Stripe subscription missing item id");

    const existingPriceId =
      (existing?.items?.data?.[0]?.price?.id as string | undefined) ??
      (existing?.plan?.id as string | undefined) ??
      null;
    const existingTier = tierFromStripePriceId(existingPriceId);
    const existingRank = rankTier(existingTier);
    const requestedRank = rankTier(body.tier);

    // Downgrade scheduling path: keep access until period end, then switch price (no prorations).
    if (effectiveAt === "period_end" && requestedRank < existingRank) {
      const currentPeriodEnd = existing?.current_period_end ?? null;
      if (!currentPeriodEnd) return badRequest(req, requestId, "Stripe subscription missing current_period_end");
      if (!existingPriceId) return badRequest(req, requestId, "Stripe subscription missing current price id");

      // Create or reuse a subscription schedule.
      let scheduleId = String((existing as any)?.schedule ?? "").trim() || null;
      if (!scheduleId) {
        const created = await stripeRequest<{ id?: string }>({
          method: "POST",
          path: "/v1/subscription_schedules",
          secretKey: stripeSecretKey,
          body: { from_subscription: subId },
        });
        scheduleId = String((created as any)?.id ?? "").trim() || null;
      }
      if (!scheduleId) return badRequest(req, requestId, "Unable to create subscription schedule");

      const now = Math.floor(Date.now() / 1000);
      // Define 2 phases:
      // - phase 0: keep current price until current_period_end
      // - phase 1: switch to the requested price starting at current_period_end
      await stripeRequest<any>({
        method: "POST",
        path: `/v1/subscription_schedules/${encodeURIComponent(scheduleId)}`,
        secretKey: stripeSecretKey,
        body: {
          end_behavior: "release",
          phases: [
            {
              start_date: now,
              end_date: currentPeriodEnd,
              items: [{ price: existingPriceId }],
            },
            {
              start_date: currentPeriodEnd,
              items: [{ price: priceId }],
            },
          ],
        },
      });

      return jsonResponse(req, {
        ok: true,
        scheduled: true,
        effective_at: "period_end",
        stripe_subscription_id: subId,
        current_period_end: unixToIso(currentPeriodEnd),
        request_id: requestId,
      });
    }

    // Immediate change path (upgrade / interval switch / explicit "now").
    // IMPORTANT: Stripe restricts which params can be sent alongside `payment_behavior=pending_if_incomplete`.
    // In particular, `cancel_at_period_end` is NOT supported in the same call.
    // If the subscription is currently set to cancel at period end, clear that in a separate request first.
    if (Boolean((existing as any)?.cancel_at_period_end)) {
      await stripeRequest<StripeSub>({
        method: "POST",
        path: `/v1/subscriptions/${encodeURIComponent(subId)}`,
        secretKey: stripeSecretKey,
        body: {
          cancel_at_period_end: false,
        },
      });
    }

    const updated = await stripeRequest<StripeSub>({
      method: "POST",
      path: `/v1/subscriptions/${encodeURIComponent(subId)}`,
      secretKey: stripeSecretKey,
      body: {
        // Charge immediately for upgrades / interval changes:
        // Stripe will generate prorations and invoice/pay them right away (when possible).
        proration_behavior: "always_invoice",
        // Avoid hard failure/cancel if payment cannot be completed instantly; Stripe will mark invoice as open/requires_payment_method.
        // (This keeps access intact while user fixes payment method in billing.)
        payment_behavior: "pending_if_incomplete",
        items: [{ id: itemId, price: priceId }],
      },
    });

    const status = String((updated as any)?.status ?? "").trim() || null;
    const stripePriceId =
      (updated?.items?.data?.[0]?.price?.id as string | undefined) ??
      (updated?.plan?.id as string | undefined) ??
      null;
    const tier = tierFromStripePriceId(stripePriceId);
    const interval = intervalFromStripePriceId(stripePriceId);
    const currentPeriodStart = unixToIso(updated?.current_period_start);
    const currentPeriodEnd = unixToIso(updated?.current_period_end);
    const cancelAtPeriodEnd = Boolean((updated as any)?.cancel_at_period_end);

    // Sync DB mirror immediately (webhook will also land later).
    const { error: upsertErr } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_subscription_id: subId,
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
      console.error("[stripe-change-plan] subscriptions upsert error", upsertErr);
      return serverError(req, requestId);
    }

    return jsonResponse(req, {
      ok: true,
      scheduled: false,
      effective_at: "now",
      stripe_subscription_id: subId,
      stripe_price_id: stripePriceId,
      status,
      current_period_end: currentPeriodEnd,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-change-plan] error", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});



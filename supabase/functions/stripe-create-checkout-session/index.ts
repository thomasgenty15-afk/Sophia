import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { badRequest, getRequestId, jsonResponse, parseJsonBody, serverError, z } from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import { tierFromStripePriceId } from "../_shared/billing-tier.ts";

const BodySchema = z
  .object({
    tier: z.enum(["system", "alliance", "architecte"]),
    interval: z.enum(["monthly", "yearly"]),
    success_path: z.string().optional(),
    cancel_path: z.string().optional(),
  })
  .strict();

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

Deno.serve(async (req) => {
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

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");

    const priceEnvKey = `STRIPE_PRICE_ID_${parsed.data.tier.toUpperCase()}_${parsed.data.interval.toUpperCase()}`;
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id,email")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[stripe-create-checkout-session] profile read error", profileErr);
      return serverError(req, requestId);
    }

    let customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    const email = user.email ?? (profile as any)?.email ?? null;

    // Recovery + hard guardrail:
    // If we can find ANY active subscription for this email (even under a different Stripe customer),
    // do NOT create a new Checkout Session.
    // This protects against accidental multiple active subscriptions.
    let foundActiveFromEmail: { customerId: string; sub: any } | null = null;
    if (email) {
      try {
        const customers = await stripeRequest<{ data: Array<{ id?: string }> }>({
          method: "GET",
          path: `/v1/customers?email=${encodeURIComponent(String(email))}&limit=10`,
          secretKey: stripeSecretKey,
        });
        const ids = (customers?.data ?? [])
          .map((c) => String((c as any)?.id ?? "").trim())
          .filter(Boolean);
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
            foundActiveFromEmail = { customerId: cid, sub: picked };
            break;
          }
        }

        // If we didn't find an active subscription, but we found an existing customer for this email,
        // prefer reusing it instead of creating a new Stripe customer.
        if (!customerId && !foundActiveFromEmail) {
          const first = ids[0];
          if (first) customerId = first;
        }
      } catch (err) {
        // Non-fatal: if Stripe is unreachable, fall back to existing behavior.
        console.warn("[stripe-create-checkout-session] email cross-check failed", err);
      }
    }

    if (foundActiveFromEmail) {
      // Canonicalize stored customer id.
      customerId = foundActiveFromEmail.customerId;
      try {
        await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      } catch {
        // ignore
      }

      // Best-effort: upsert our DB mirror from Stripe so the app UI stays consistent.
      try {
        const picked = foundActiveFromEmail.sub;
        const status = String(picked?.status ?? "") || null;
        const stripePriceId =
          (picked?.items?.data?.[0]?.price?.id as string | undefined) ??
          (picked?.plan?.id as string | undefined) ??
          null;
        const toIso = (sec: number | null | undefined) => {
          if (!sec || !Number.isFinite(sec)) return null;
          return new Date(sec * 1000).toISOString();
        };
        const currentPeriodStart = toIso(picked?.current_period_start);
        const currentPeriodEnd = toIso(picked?.current_period_end);
        const tier = tierFromStripePriceId(stripePriceId);
        await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: user.id,
            stripe_subscription_id: picked.id,
            stripe_price_id: stripePriceId,
            tier,
            status,
            cancel_at_period_end: Boolean(picked?.cancel_at_period_end),
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      } catch {
        // ignore
      }

      const returnUrl = `${appBaseUrl}${parsed.data.cancel_path ?? "/dashboard?billing=portal"}`;
      const portal = await stripeRequest<{ url: string }>({
        method: "POST",
        path: "/v1/billing_portal/sessions",
        secretKey: stripeSecretKey,
        body: {
          customer: customerId!,
          return_url: returnUrl,
        },
      });
      return jsonResponse(req, { url: portal.url, mode: "portal", request_id: requestId });
    }

    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>({
        method: "POST",
        path: "/v1/customers",
        secretKey: stripeSecretKey,
        body: {
          ...(email ? { email } : {}),
          metadata: { supabase_user_id: user.id },
        },
      });

      customerId = customer.id;
      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (updErr) {
        console.error("[stripe-create-checkout-session] profile update error", updErr);
        // Don't hard-fail the checkout.
      }
    }

    // Guardrail: if the user already has an active subscription, do NOT create a second one.
    // 1) Check our DB mirror.
    // 2) If mirror looks empty/stale, cross-check Stripe via customerId and upsert back into DB.
    // 3) If active: send them to Stripe Billing Portal (avoids double billing).
    const { data: existingSub, error: existingSubErr } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingSubErr) {
      console.error("[stripe-create-checkout-session] subscriptions read error", existingSubErr);
      return serverError(req, requestId);
    }
    const existingStatus = String((existingSub as any)?.status ?? "").toLowerCase();
    const existingEndRaw = (existingSub as any)?.current_period_end ? String((existingSub as any).current_period_end) : "";
    const existingEnd = existingEndRaw ? new Date(existingEndRaw).getTime() : null;
    let existingActive =
      (existingStatus === "active" || existingStatus === "trialing") &&
      (existingEnd == null || !Number.isFinite(existingEnd) || Date.now() < existingEnd);

    if (!existingActive && customerId) {
      try {
        const list = await stripeRequest<{ data: any[] }>({
          method: "GET",
          path: `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
          secretKey: stripeSecretKey,
        });
        const picked = (list?.data ?? []).find((s) => {
          const st = String(s?.status ?? "").toLowerCase();
          return st === "active" || st === "trialing";
        });
        if (picked?.id) {
          const status = String(picked?.status ?? "") || null;
          const stripePriceId =
            (picked?.items?.data?.[0]?.price?.id as string | undefined) ??
            (picked?.plan?.id as string | undefined) ??
            null;
          const toIso = (sec: number | null | undefined) => {
            if (!sec || !Number.isFinite(sec)) return null;
            return new Date(sec * 1000).toISOString();
          };
          const currentPeriodStart = toIso(picked?.current_period_start);
          const currentPeriodEnd = toIso(picked?.current_period_end);
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: user.id,
              stripe_subscription_id: picked.id,
              stripe_price_id: stripePriceId,
              status,
              cancel_at_period_end: Boolean(picked?.cancel_at_period_end),
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
          const endMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null;
          existingActive =
            (String(status ?? "").toLowerCase() === "active" || String(status ?? "").toLowerCase() === "trialing") &&
            (endMs == null || !Number.isFinite(endMs) || Date.now() < endMs);
        }
      } catch (err) {
        // Non-fatal: if Stripe is temporarily unreachable, continue to checkout (worst case).
        console.warn("[stripe-create-checkout-session] stripe subscription cross-check failed", err);
      }
    }

    if (existingActive) {
      const returnUrl = `${appBaseUrl}${parsed.data.cancel_path ?? "/dashboard?billing=portal"}`;
      const portal = await stripeRequest<{ url: string }>({
        method: "POST",
        path: "/v1/billing_portal/sessions",
        secretKey: stripeSecretKey,
        body: {
          customer: customerId!,
          return_url: returnUrl,
        },
      });
      return jsonResponse(req, { url: portal.url, mode: "portal", request_id: requestId });
    }

    const successUrl = `${appBaseUrl}${parsed.data.success_path ?? "/dashboard?billing=success"}`;
    const cancelUrl = `${appBaseUrl}${parsed.data.cancel_path ?? "/dashboard?billing=cancel"}`;

    const session = await stripeRequest<{ id: string; url: string | null }>({
      method: "POST",
      path: "/v1/checkout/sessions",
      secretKey: stripeSecretKey,
      body: {
        mode: "subscription",
        customer: customerId!,
        client_reference_id: user.id,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: { supabase_user_id: user.id },
        },
      },
    });

    if (!session.url) {
      return serverError(req, requestId, "Stripe checkout session missing url");
    }

    return jsonResponse(req, { url: session.url, id: session.id, request_id: requestId });
  } catch (err) {
    console.error("[stripe-create-checkout-session] error", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    // Helpful diagnostics for misconfigured Edge secrets.
    // Safe to surface: it only reveals which env var is missing, not its value.
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    // Stripe errors are safe-ish to surface as 400.
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});



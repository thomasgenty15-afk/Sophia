import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  badRequest,
  getRequestId,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";

const BodySchema = z
  .object({
    tier: z.enum(["system", "alliance", "architecte"]),
    interval: z.enum(["monthly", "yearly"]),
    return_path: z.string().optional(),
  })
  .strict();

type StripeSub = { id?: string; status?: string };

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isStripeSubActive(sub: StripeSub | null | undefined): boolean {
  const st = String(sub?.status ?? "").toLowerCase();
  return st === "active" || st === "trialing";
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(
      req,
      { error: "Method Not Allowed", request_id: requestId },
      { status: 405 },
    );
  }

  try {
    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
    const priceEnvKey =
      `STRIPE_PRICE_ID_${body.tier.toUpperCase()}_${body.interval.toUpperCase()}`;
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
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
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

    let customerId = String((profile as any)?.stripe_customer_id ?? "").trim() || null;

    if (!customerId) {
      const createdCustomer = await stripeRequest<{ id?: string }>({
        method: "POST",
        path: "/v1/customers",
        secretKey: stripeSecretKey,
        body: {
          email: (user as any)?.email ?? (profile as any)?.email ?? undefined,
          metadata: {
            supabase_user_id: user.id,
          },
        },
      });
      customerId = String(createdCustomer?.id ?? "").trim() || null;
      if (!customerId) {
        return badRequest(req, requestId, "Unable to create Stripe customer");
      }
      const { error: updateProfileErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (updateProfileErr) {
        console.error(
          "[stripe-create-checkout-session] profile update customer error",
          updateProfileErr,
        );
        return serverError(req, requestId);
      }
    }

    const stripeSubs = await stripeRequest<{ data?: StripeSub[] }>({
      method: "GET",
      path: `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
      secretKey: stripeSecretKey,
    });
    const activeSub = (stripeSubs?.data ?? []).find((s) => isStripeSubActive(s));

    // Product rule: if the user already has an active/trialing subscription, send them to Stripe Portal.
    if (activeSub?.id) {
      const returnUrl = `${appBaseUrl}${body.return_path ?? "/dashboard?billing=portal"}`;
      const portal = await stripeRequest<{ url?: string }>({
        method: "POST",
        path: "/v1/billing_portal/sessions",
        secretKey: stripeSecretKey,
        body: {
          customer: customerId,
          return_url: returnUrl,
        },
      });
      const portalUrl = String(portal?.url ?? "").trim();
      if (!portalUrl) return badRequest(req, requestId, "Portal URL missing");
      return jsonResponse(req, { mode: "portal", url: portalUrl, request_id: requestId });
    }

    const checkout = await stripeRequest<{ url?: string; id?: string }>({
      method: "POST",
      path: "/v1/checkout/sessions",
      secretKey: stripeSecretKey,
      body: {
        mode: "subscription",
        customer: customerId,
        success_url: `${appBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/upgrade?billing=cancelled`,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        client_reference_id: user.id,
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
          },
        },
        metadata: {
          supabase_user_id: user.id,
          requested_tier: body.tier,
          requested_interval: body.interval,
        },
      },
    });

    const checkoutUrl = String(checkout?.url ?? "").trim();
    if (!checkoutUrl) return badRequest(req, requestId, "Checkout URL missing");

    return jsonResponse(req, {
      mode: "checkout",
      url: checkoutUrl,
      checkout_session_id: checkout?.id ?? null,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-create-checkout-session] error", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});

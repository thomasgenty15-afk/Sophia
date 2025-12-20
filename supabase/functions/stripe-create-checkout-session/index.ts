import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { badRequest, getRequestId, jsonResponse, parseJsonBody, serverError, z } from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";

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
    // Stripe errors are safe-ish to surface as 400.
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});



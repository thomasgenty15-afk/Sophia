import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { badRequest, getRequestId, jsonResponse, parseJsonBody, serverError, z } from "../_shared/http.ts";
import { stripeRequest } from "../_shared/stripe.ts";

const BodySchema = z
  .object({
    return_path: z.string().optional(),
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
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[stripe-create-portal-session] profile read error", profileErr);
      return serverError(req, requestId);
    }

    const customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      return badRequest(req, requestId, "No Stripe customer on file");
    }

    const returnUrl = `${appBaseUrl}${parsed.data.return_path ?? "/dashboard?billing=portal"}`;

    const portal = await stripeRequest<{ url: string }>({
      method: "POST",
      path: "/v1/billing_portal/sessions",
      secretKey: stripeSecretKey,
      body: {
        customer: customerId,
        return_url: returnUrl,
      },
    });

    return jsonResponse(req, { url: portal.url, request_id: requestId });
  } catch (err) {
    console.error("[stripe-create-portal-session] error", err);
    return serverError(req, requestId);
  }
});



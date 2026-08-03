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
import { countSeats, type SeatLedgerRow } from "../_shared/billing-tier.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

// W10 — two shapes on one endpoint.
//   plan omitted        : the legacy B2C checkout (one price, one item).
//   plan='keel_coach'   : the KEEL coach contract — 49 $/mo platform (qty 1)
//                         PLUS 12 $/mo per ACTIVE student (qty = seats today).
// `tier` is optional now, and required only on the legacy shape; the refine
// below is what enforces that, so a malformed body is a 400 and never a
// silently-defaulted subscription.
const BodySchema = z
  .object({
    plan: z.literal("keel_coach").optional(),
    tier: z.enum(["system", "alliance", "architecte"]).optional(),
    interval: z.enum(["monthly", "yearly"]),
    return_path: z.string().optional(),
  })
  .strict()
  .refine((b) => b.plan === "keel_coach" || Boolean(b.tier), {
    message: "tier is required unless plan='keel_coach'",
    path: ["tier"],
  });

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
  let currentUserId: string | null = null;

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
    const isKeelCoach = body.plan === "keel_coach";
    const priceId = isKeelCoach
      ? requireEnv(`STRIPE_PRICE_ID_COACH_PLATFORM_${body.interval.toUpperCase()}`)
      : requireEnv(
        `STRIPE_PRICE_ID_${String(body.tier).toUpperCase()}_${body.interval.toUpperCase()}`,
      );
    const seatPriceId = isKeelCoach
      ? requireEnv(`STRIPE_PRICE_ID_COACH_SEAT_${body.interval.toUpperCase()}`)
      : null;

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
    currentUserId = user.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    // W10 — the KEEL contract is sold to a COACH. The caller's coach identity
    // is resolved server-side from their JWT; it is never taken from the body.
    // A non-coach asking for plan='keel_coach' is refused rather than sold a
    // subscription whose seat line nothing would ever reconcile.
    let coachId: string | null = null;
    let initialSeatQuantity = 0;
    if (isKeelCoach) {
      const { data: coachRow, error: coachErr } = await supabaseAdmin
        .from("coaches")
        .select("id,status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (coachErr) {
        console.error("[stripe-create-checkout-session] coach read error", coachErr);
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: coachErr,
          severity: "error",
          title: "coach_read_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
        });
        return serverError(req, requestId);
      }
      if (!coachRow || (coachRow as any).status !== "active") {
        return jsonResponse(
          req,
          { error: "Not an active coach", request_id: requestId },
          { status: 403 },
        );
      }
      coachId = String((coachRow as any).id);

      // The seat line starts at TODAY's active-seat count, read from the same
      // ledger the coach's billing page renders and the monthly job sums. If
      // the read fails we start the seat line at zero rather than guess: the
      // reconciliation job is the authority and it runs monthly. Overcharging
      // on a failed read is the one outcome that is not recoverable by a retry.
      const { data: ledger, error: ledgerErr } = await supabaseAdmin
        .rpc("keel_coach_seat_ledger", { p_coach_id: coachId });
      if (ledgerErr) {
        console.warn(
          "[stripe-create-checkout-session] seat ledger read failed; starting at 0 seats",
          ledgerErr,
        );
      } else {
        initialSeatQuantity = countSeats(
          (ledger ?? []) as unknown as SeatLedgerRow[],
        ).active;
      }
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id,email")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[stripe-create-checkout-session] profile read error", profileErr);
      await logEdgeFunctionError({
        functionName: "stripe-create-checkout-session",
        error: profileErr,
        severity: "error",
        title: "profile_read_failed",
        requestId,
        userId: currentUserId,
        source: "stripe",
      });
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
        await logEdgeFunctionError({
          functionName: "stripe-create-checkout-session",
          error: updateProfileErr,
          severity: "error",
          title: "profile_customer_update_failed",
          requestId,
          userId: currentUserId,
          source: "stripe",
          metadata: { stripe_customer_id: customerId },
        });
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
      const returnUrl = `${appBaseUrl}${
        body.return_path ??
          (isKeelCoach ? "/coach/billing?billing=portal" : "/dashboard?billing=portal")
      }`;
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
      await logEdgeFunctionError({
        functionName: "stripe-create-checkout-session",
        error: "Stripe portal session created from checkout route",
        severity: "info",
        title: "billing_portal_created",
        requestId,
        userId: currentUserId,
        source: "stripe",
        metadata: { mode: "portal", stripe_customer_id: customerId, stripe_subscription_id: activeSub.id },
      });
      return jsonResponse(req, { mode: "portal", url: portalUrl, request_id: requestId });
    }

    // The two items of the KEEL contract. The seat line is OMITTED when the
    // coach has no active student yet: Stripe checkout will not accept a
    // quantity of 0, and starting it at 1 would invoice 12 $ for a seat nobody
    // occupies. `stripe-reconcile-seats` creates the item the month the first
    // active student appears — it handles both "item present" and "item absent"
    // precisely so this branch can stay honest.
    const lineItems: Array<Record<string, unknown>> = [
      { price: priceId, quantity: 1 },
    ];
    if (isKeelCoach && seatPriceId && initialSeatQuantity > 0) {
      lineItems.push({ price: seatPriceId, quantity: initialSeatQuantity });
    }

    const checkout = await stripeRequest<{ url?: string; id?: string }>({
      method: "POST",
      path: "/v1/checkout/sessions",
      secretKey: stripeSecretKey,
      body: {
        mode: "subscription",
        customer: customerId,
        success_url: isKeelCoach
          ? `${appBaseUrl}/coach/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`
          : `${appBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: isKeelCoach
          ? `${appBaseUrl}/coach/billing?billing=cancelled`
          : `${appBaseUrl}/upgrade?billing=cancelled`,
        line_items: lineItems,
        allow_promotion_codes: true,
        client_reference_id: user.id,
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            // The reconciliation job finds the subscription from the coach row;
            // this is the reverse edge, so a Stripe-side inspection can answer
            // "whose roster is this?" without a database.
            ...(coachId ? { keel_coach_id: coachId } : {}),
          },
        },
        metadata: {
          supabase_user_id: user.id,
          requested_tier: isKeelCoach ? "coach" : String(body.tier),
          requested_interval: body.interval,
          ...(isKeelCoach
            ? { keel_initial_seat_quantity: String(initialSeatQuantity) }
            : {}),
        },
      },
    });

    const checkoutUrl = String(checkout?.url ?? "").trim();
    if (!checkoutUrl) return badRequest(req, requestId, "Checkout URL missing");

    await logEdgeFunctionError({
      functionName: "stripe-create-checkout-session",
      error: "Stripe checkout session created",
      severity: "info",
      title: "checkout_session_created",
      requestId,
      userId: currentUserId,
      source: "stripe",
      metadata: {
        mode: "checkout",
        checkout_session_id: checkout?.id ?? null,
        stripe_customer_id: customerId,
        requested_tier: isKeelCoach ? "coach" : body.tier,
        requested_interval: body.interval,
        keel_coach_id: coachId,
        keel_initial_seat_quantity: isKeelCoach ? initialSeatQuantity : null,
      },
    });

    return jsonResponse(req, {
      mode: "checkout",
      url: checkoutUrl,
      checkout_session_id: checkout?.id ?? null,
      // The coach sees, before paying, the seat count they are about to be
      // charged for. Two numbers, never merged, all the way to the invoice.
      ...(isKeelCoach ? { seat_quantity: initialSeatQuantity } : {}),
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-create-checkout-session] error", err);
    await logEdgeFunctionError({
      functionName: "stripe-create-checkout-session",
      error: err,
      severity: "error",
      title: "checkout_session_failed",
      requestId,
      userId: currentUserId,
      source: "stripe",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    if (msg.toLowerCase().includes("stripe")) return badRequest(req, requestId, msg);
    return serverError(req, requestId);
  }
});

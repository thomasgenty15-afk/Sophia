import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { verifyStripeWebhookSignature } from "../_shared/stripe.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isMegaTestMode(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  return megaRaw === "1";
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: any };
};

function unixToIso(ts: number | null | undefined): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  // Stripe sends POSTs with no Origin; allow CORS preflight anyway.
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse(req, { error: "Invalid body", request_id: requestId }, { status: 400 });
  }

  try {
    // Deterministic/offline tests: skip signature verification (still verified by unit tests in _shared/stripe.ts).
    if (!isMegaTestMode()) {
      const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
      const sigHeader = req.headers.get("Stripe-Signature");

      const verified = await verifyStripeWebhookSignature({
        rawBody,
        signatureHeader: sigHeader,
        webhookSecret,
      });
      if (!verified.ok) {
        return jsonResponse(req, { error: "Invalid signature", detail: verified.error, request_id: requestId }, {
          status: 400,
        });
      }
    }

    const evt = JSON.parse(rawBody) as StripeEvent;

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, supabaseServiceRole);

    // Idempotency: record Stripe event id once.
    const { data: idempoRow, error: idempoErr } = await admin
      .from("stripe_webhook_events")
      .upsert({ id: evt.id }, { onConflict: "id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (idempoErr) {
      console.error("[stripe-webhook] idempotency upsert error", idempoErr);
      return serverError(req, requestId);
    }
    // If ignoreDuplicates caused a no-op, PostgREST may return null data; treat as duplicate.
    if (!idempoRow) {
      return jsonResponse(req, { ok: true, duplicate: true, request_id: requestId });
    }

    // Process subscription lifecycle events.
    if (
      evt.type === "customer.subscription.created" ||
      evt.type === "customer.subscription.updated" ||
      evt.type === "customer.subscription.deleted"
    ) {
      const sub = evt.data.object ?? {};
      const userId = sub?.metadata?.supabase_user_id as string | undefined;
      const stripeSubscriptionId = sub?.id as string | undefined;
      const status = sub?.status as string | undefined;
      const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end);
      const currentPeriodStart = unixToIso(sub?.current_period_start);
      const currentPeriodEnd = unixToIso(sub?.current_period_end);

      const stripePriceId =
        (sub?.items?.data?.[0]?.price?.id as string | undefined) ??
        (sub?.plan?.id as string | undefined) ??
        null;

      const stripeCustomerId = typeof sub?.customer === "string" ? (sub.customer as string) : null;

      if (!stripeSubscriptionId || !status) {
        console.warn("[stripe-webhook] subscription event missing id/status", { type: evt.type, sub });
        return jsonResponse(req, { ok: true, ignored: true, request_id: requestId });
      }

      if (userId) {
        const { error: upsertErr } = await admin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: stripePriceId,
            status,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (upsertErr) {
          console.error("[stripe-webhook] subscriptions upsert error", upsertErr);
          return serverError(req, requestId);
        }

        if (stripeCustomerId) {
          // Best-effort: ensure profile has customer id (useful for portal).
          await admin.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", userId);
        }
      } else {
        // Fallback: update by subscription id if we don't have metadata.
        const { error: updErr } = await admin
          .from("subscriptions")
          .update({
            stripe_price_id: stripePriceId,
            status,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubscriptionId);
        if (updErr) {
          console.error("[stripe-webhook] subscriptions update-by-id error", updErr);
          return serverError(req, requestId);
        }
      }

      return jsonResponse(req, { ok: true, type: evt.type, request_id: requestId });
    }

    // Ignore other events (payment_succeeded/failed will reflect via subscription.updated status)
    return jsonResponse(req, { ok: true, ignored: true, type: evt.type, request_id: requestId });
  } catch (err) {
    console.error("[stripe-webhook] error", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    // Helpful diagnostics for misconfigured Edge secrets.
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});



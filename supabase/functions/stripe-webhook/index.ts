import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { verifyStripeWebhookSignature } from "../_shared/stripe.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  intervalFromStripePriceId,
  tierFromStripePriceId,
} from "../_shared/billing-tier.ts";

const SUBSCRIPTION_CONFIRMED_PURPOSE = "subscription_confirmed";
const SUBSCRIPTION_CONFIRMED_TEMPLATE_NAME = "subscription_confirmed_v1";
const SUBSCRIPTION_CONFIRMED_TEMPLATE_LANG = "fr";
const SUBSCRIPTION_CONFIRMED_TEXT =
  "C’est confirmé ✅\nTon abonnement Sophia est bien activé.\n\nJe suis contente de te retrouver ici.";

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

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  return supabaseUrl.replace(/\/+$/, "");
}

function isOpenWhatsappWindow(lastInboundAt: unknown): boolean {
  const raw = String(lastInboundAt ?? "").trim();
  if (!raw) return false;
  const lastInboundMs = new Date(raw).getTime();
  return Number.isFinite(lastInboundMs) &&
    Date.now() - lastInboundMs <= 24 * 60 * 60 * 1000;
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret();
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET");
  const res = await fetch(`${functionsBaseUrl()}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`,
    );
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data;
}

async function maybeSendSubscriptionConfirmedWhatsapp(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  stripeSubscriptionId: string;
  tier: string | null;
  interval: string | null;
  requestId: string;
}) {
  if (args.tier !== "alliance" && args.tier !== "architecte") return;

  const { data: existing, error: existingErr } = await args.admin
    .from("chat_messages")
    .select("id")
    .eq("user_id", args.userId)
    .eq("scope", "whatsapp")
    .eq("role", "assistant")
    .filter("metadata->>purpose", "eq", SUBSCRIPTION_CONFIRMED_PURPOSE)
    .filter(
      "metadata->>stripe_subscription_id",
      "eq",
      args.stripeSubscriptionId,
    )
    .limit(1);
  if (existingErr) throw existingErr;
  if ((existing ?? []).length > 0) return;

  const { data: profile, error: profileErr } = await args.admin
    .from("profiles")
    .select("whatsapp_opted_in,whatsapp_opted_out_at,whatsapp_last_inbound_at")
    .eq("id", args.userId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (
    !profile || !Boolean((profile as any).whatsapp_opted_in) ||
    Boolean((profile as any).whatsapp_opted_out_at)
  ) {
    return;
  }

  const in24hWindow = isOpenWhatsappWindow(
    (profile as any).whatsapp_last_inbound_at,
  );
  const message = in24hWindow
    ? { type: "text" as const, body: SUBSCRIPTION_CONFIRMED_TEXT }
    : {
      type: "template" as const,
      name: SUBSCRIPTION_CONFIRMED_TEMPLATE_NAME,
      language: SUBSCRIPTION_CONFIRMED_TEMPLATE_LANG,
    };

  await callWhatsappSend({
    user_id: args.userId,
    message,
    purpose: SUBSCRIPTION_CONFIRMED_PURPOSE,
    require_opted_in: true,
    force_template: !in24hWindow,
    metadata_extra: {
      source: "stripe_webhook",
      stripe_subscription_id: args.stripeSubscriptionId,
      subscription_tier: args.tier,
      subscription_interval: args.interval,
      in_24h_window_at_decision: in24hWindow,
    },
  });
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  // Stripe sends POSTs with no Origin; allow CORS preflight anyway.
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  if (req.method !== "POST") {
    return jsonResponse(req, {
      error: "Method Not Allowed",
      request_id: requestId,
    }, { status: 405 });
  }

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse(req, { error: "Invalid body", request_id: requestId }, {
      status: 400,
    });
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
        return jsonResponse(req, {
          error: "Invalid signature",
          detail: verified.error,
          request_id: requestId,
        }, {
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
      return jsonResponse(req, {
        ok: true,
        duplicate: true,
        request_id: requestId,
      });
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
      const tier = tierFromStripePriceId(stripePriceId);
      const interval = intervalFromStripePriceId(stripePriceId);

      const stripeCustomerId = typeof sub?.customer === "string"
        ? (sub.customer as string)
        : null;

      if (!stripeSubscriptionId || !status) {
        console.warn("[stripe-webhook] subscription event missing id/status", {
          type: evt.type,
          sub,
        });
        return jsonResponse(req, {
          ok: true,
          ignored: true,
          request_id: requestId,
        });
      }

      if (userId) {
        const { error: upsertErr } = await admin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_subscription_id: stripeSubscriptionId,
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
          console.error(
            "[stripe-webhook] subscriptions upsert error",
            upsertErr,
          );
          return serverError(req, requestId);
        }

        if (stripeCustomerId) {
          // Best-effort: ensure profile has customer id (useful for portal).
          await admin.from("profiles").update({
            stripe_customer_id: stripeCustomerId,
          }).eq("id", userId);
        }

        if (status === "active") {
          try {
            await maybeSendSubscriptionConfirmedWhatsapp({
              admin,
              userId,
              stripeSubscriptionId,
              tier,
              interval,
              requestId,
            });
          } catch (sendErr) {
            console.warn(
              "[stripe-webhook] subscription confirmation WhatsApp failed",
              sendErr,
            );
            await logEdgeFunctionError({
              functionName: "stripe-webhook",
              error: sendErr,
              severity: "warn",
              title: "subscription_confirmation_whatsapp_failed",
              requestId,
              userId,
              source: "stripe",
              metadata: {
                stripe_subscription_id: stripeSubscriptionId,
                tier,
                interval,
              },
            });
          }
        }
      } else {
        // Fallback: update by subscription id if we don't have metadata.
        const { error: updErr } = await admin
          .from("subscriptions")
          .update({
            stripe_price_id: stripePriceId,
            tier,
            interval,
            status,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubscriptionId);
        if (updErr) {
          console.error(
            "[stripe-webhook] subscriptions update-by-id error",
            updErr,
          );
          return serverError(req, requestId);
        }
      }

      return jsonResponse(req, {
        ok: true,
        type: evt.type,
        request_id: requestId,
      });
    }

    // Ignore other events (payment_succeeded/failed will reflect via subscription.updated status)
    return jsonResponse(req, {
      ok: true,
      ignored: true,
      type: evt.type,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-webhook] error", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    // Helpful diagnostics for misconfigured Edge secrets.
    if (msg.startsWith("Missing env var:")) {
      return serverError(req, requestId, msg);
    }
    await logEdgeFunctionError({
      functionName: "stripe-webhook",
      error: err,
      requestId,
      userId: null,
      source: "stripe",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    });
    return serverError(req, requestId);
  }
});

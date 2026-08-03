import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { verifyStripeWebhookSignature } from "../_shared/stripe.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  intervalFromStripePriceId,
  isKeelPlatformPriceId,
  tierFromStripePriceIds,
} from "../_shared/billing-tier.ts";
import {
  decideSubscriptionNotification,
  notificationDedupKey,
  type NotificationKind,
  type SubInterval,
  subscriptionConfirmedText,
  subscriptionModifiedText,
  type SubscriptionSnapshot,
  type SubTier,
} from "../_shared/subscription-notification.ts";

const SUBSCRIPTION_CONFIRMED_PURPOSE = "subscription_confirmed";
const SUBSCRIPTION_MODIFIED_PURPOSE = "subscription_modified";
const SUBSCRIPTION_CONFIRMED_TEMPLATE_NAME = "subscription_confirmed_v1";
const SUBSCRIPTION_CONFIRMED_TEMPLATE_LANG = "fr";

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isLocalSupabaseEnv(): boolean {
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

function isMegaTestMode(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  if (megaRaw !== "1") return false;
  // SEC-08: MEGA_TEST_MODE disables Stripe webhook signature verification. It must
  // NEVER take effect in a deployed environment. If the flag is set against a real
  // (non-local) Supabase URL, ignore it and keep signature verification enforced.
  if (!isLocalSupabaseEnv()) {
    console.error(JSON.stringify({
      tag: "stripe_webhook_mega_test_mode_ignored_in_prod",
      reason: "MEGA_TEST_MODE=1 is not honored outside a local Supabase environment",
    }));
    return false;
  }
  return true;
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

async function sendSubscriptionWhatsapp(args: {
  admin: SupabaseClient;
  userId: string;
  stripeSubscriptionId: string;
  tier: string | null;
  interval: string | null;
  kind: "new" | "modified";
  requestId: string;
}) {
  // WhatsApp is only available on Alliance + Architecte.
  if (args.tier !== "alliance" && args.tier !== "architecte") return;

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

  // Modification notices are free text carrying the new tier, so they can only
  // go out inside the open 24h window (no approved template holds a dynamic
  // tier). Outside the window we skip rather than send a misleading template.
  if (args.kind === "modified" && !in24hWindow) return;

  // Preserve "confirm a given subscription at most once, ever" for first
  // activations sent through the legacy path (pre-claim rows have no claim).
  if (args.kind === "new") {
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
  }

  // Atomic idempotency claim: a single Stripe change fans out into several
  // events; the first to insert this key wins, the rest skip. This closes the
  // check-then-send race that caused duplicate confirmations.
  const dedupKey = notificationDedupKey(
    args.stripeSubscriptionId,
    args.kind,
    args.tier as SubTier,
    args.interval as SubInterval,
  );
  const { data: claimRow, error: claimErr } = await args.admin
    .from("subscription_notifications")
    .upsert(
      {
        dedup_key: dedupKey,
        user_id: args.userId,
        stripe_subscription_id: args.stripeSubscriptionId,
        kind: args.kind,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    )
    .select("dedup_key")
    .maybeSingle();
  if (claimErr) throw claimErr;
  // ignoreDuplicates returns null data on a no-op: another event already claimed.
  if (!claimRow) return;

  try {
    const purpose = args.kind === "new"
      ? SUBSCRIPTION_CONFIRMED_PURPOSE
      : SUBSCRIPTION_MODIFIED_PURPOSE;
    const message = args.kind === "new"
      ? (in24hWindow
        ? { type: "text" as const, body: subscriptionConfirmedText() }
        : {
          type: "template" as const,
          name: SUBSCRIPTION_CONFIRMED_TEMPLATE_NAME,
          language: SUBSCRIPTION_CONFIRMED_TEMPLATE_LANG,
        })
      : {
        type: "text" as const,
        body: subscriptionModifiedText(args.tier as SubTier),
      };

    await callWhatsappSend({
      user_id: args.userId,
      message,
      purpose,
      require_opted_in: true,
      force_template: args.kind === "new" ? !in24hWindow : false,
      metadata_extra: {
        source: "stripe_webhook",
        notification_kind: args.kind,
        stripe_subscription_id: args.stripeSubscriptionId,
        subscription_tier: args.tier,
        subscription_interval: args.interval,
        in_24h_window_at_decision: in24hWindow,
      },
    });
  } catch (sendErr) {
    // Release the claim so a Stripe re-delivery can retry the notification.
    await args.admin
      .from("subscription_notifications")
      .delete()
      .eq("dedup_key", dedupKey)
      .then(() => {}, () => {});
    throw sendErr;
  }
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

      // W10 — a KEEL coach subscription carries TWO items (the flat platform
      // line and the per-active-student seat line) and Stripe makes no promise
      // about their order. Reading `items.data[0]` alone was a coin flip: half
      // the events would have resolved the seat line, returned null, blanked
      // `subscriptions.tier`, and — through the roster trigger — dropped every
      // student of that coach to access_tier='none'. Read every item.
      const allPriceIds: Array<string | null> = [
        ...((sub?.items?.data ?? []) as Array<any>).map(
          (it) => (it?.price?.id as string | undefined) ?? null,
        ),
        (sub?.plan?.id as string | undefined) ?? null,
      ];
      // The stored `stripe_price_id` stays single-valued (one column). For a
      // KEEL coach it is the PLATFORM line: the seat line's quantity moves
      // every month, so it is the unstable one and a poor identity.
      const stripePriceId =
        allPriceIds.find((id) => isKeelPlatformPriceId(id)) ??
          allPriceIds.find((id) => Boolean(id)) ??
          null;
      const tier = tierFromStripePriceIds(allPriceIds);
      const interval = allPriceIds
        .map((id) => intervalFromStripePriceId(id))
        .find((v) => v !== null) ?? null;

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
        // Snapshot the subscription BEFORE the upsert so we can tell a first
        // activation apart from a tier/interval change on an existing one.
        const { data: prevSub } = await admin
          .from("subscriptions")
          .select("status,tier,interval,current_period_end")
          .eq("user_id", userId)
          .maybeSingle();

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

        // PIVOT — le parrainage B2C est supprimé (tables `referral_codes`,
        // `referrals`, `referral_rewards`). Le bloc qui créditait ici les mois
        // « bankés » d'un parrain devenu payant part avec elles.
        //
        // `handle_new_user()` est réécrite dans la même migration pour ne plus
        // appeler `apply_referral_attribution`: sans ça, un signup portant un
        // `referral_code` en metadata lèverait un warning à chaque inscription
        // — visible nulle part, et pour toujours.

        const prevRow = prevSub as
          | {
            status?: string | null;
            tier?: string | null;
            interval?: string | null;
            current_period_end?: string | null;
          }
          | null;
        const prevSnapshot: SubscriptionSnapshot | null = prevRow
          ? {
            status: prevRow.status ?? null,
            tier: (prevRow.tier ?? null) as SubTier,
            interval: (prevRow.interval ?? null) as SubInterval,
            currentPeriodEnd: prevRow.current_period_end ?? null,
          }
          : null;
        // W10 — the legacy B2C confirmation is French, WhatsApp-only, and its
        // copy names tiers ("Alliance", "Architecte") that a KEEL coach never
        // bought. A coach subscription is deliberately excluded from it rather
        // than mapped onto a label that would be a lie. The subscription mirror
        // above is unaffected: what is skipped is a message, not a write.
        const isCoachSubscription = tier === "coach";
        const notifKind: NotificationKind = isCoachSubscription
          ? null
          : decideSubscriptionNotification(
            prevSnapshot,
            {
              status,
              tier: tier as SubTier,
              interval: interval as SubInterval,
              currentPeriodEnd,
            },
            Date.now(),
          );

        // RGPD: accounts pending deletion are excluded from all proactive processing.
        // The subscriptions mirror above stays exact; only the confirmation message is suppressed.
        let deletionPending = false;
        if (notifKind) {
          const { data: profileStatus } = await admin
            .from("profiles")
            .select("account_status")
            .eq("id", userId)
            .maybeSingle();
          deletionPending =
            (profileStatus as { account_status?: string | null } | null)
              ?.account_status === "deletion_pending";
          if (deletionPending) {
            console.log(
              `[stripe-webhook] request_id=${requestId} subscription notification suppressed user_id=${userId} reason=account_deletion_pending`,
            );
          }
        }

        if (notifKind && !deletionPending) {
          try {
            await sendSubscriptionWhatsapp({
              admin,
              userId,
              stripeSubscriptionId,
              tier,
              interval,
              kind: notifKind,
              requestId,
            });
          } catch (sendErr) {
            console.warn(
              "[stripe-webhook] subscription notification WhatsApp failed",
              sendErr,
            );
            await logEdgeFunctionError({
              functionName: "stripe-webhook",
              error: sendErr,
              severity: "warn",
              title: "subscription_notification_whatsapp_failed",
              requestId,
              userId,
              source: "stripe",
              metadata: {
                stripe_subscription_id: stripeSubscriptionId,
                tier,
                interval,
                notification_kind: notifKind,
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

    // PIVOT — le parrainage B2C est supprimé (tables `referral_codes`,
    // `referrals`, `referral_rewards`). `invoice.payment_succeeded` n'avait
    // AUCUN autre rôle ici que de déclencher la récompense du parrain à la
    // première facture payée: la branche part avec lui.
    //
    // Le miroir d'abonnement, lui, vit sur `customer.subscription.*` — c'est
    // là que l'accès est calculé, et rien de ce qui précède n'y touche.
    if (evt.type === "invoice.payment_succeeded") {
      return jsonResponse(req, {
        ok: true,
        ignored: true,
        reason: "referral_program_removed",
        type: evt.type,
        request_id: requestId,
      });
    }

    // Ignore other events (payment_failed will reflect via subscription.updated status)
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

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  ACTIVE_STUDENT_MIN_INTERACTIONS,
  countSeats,
  periodMonthKey,
  type SeatLedgerRow,
} from "../_shared/billing-tier.ts";
import {
  decideSeatQuantity,
  type SeatDecision,
  type StripeSubscriptionLike,
} from "./reconcile.ts";

/**
 * KEEL W10.1 — the monthly seat reconciliation.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------
 * For every solvent coach: recount the ACTIVE students of the period from the
 * database, write the count into `coach_billing_periods`, then push it as the
 * quantity of the seat item on their Stripe subscription.
 *
 * ---------------------------------------------------------------------------
 * IT RECOMPUTES, IT NEVER INCREMENTS
 * ---------------------------------------------------------------------------
 * There is no `+1` anywhere in this function. Each run derives the count from
 * `keel_coach_seat_ledger` and upserts it. Consequences that are the whole
 * reason a billing job is safe to own: a double run changes nothing, a missed
 * run is repaired by the next one, and a wrong invoice is fixed by re-running
 * rather than by a compensating write.
 *
 * ---------------------------------------------------------------------------
 * THE DB ROW IS WRITTEN BEFORE THE STRIPE CALL
 * ---------------------------------------------------------------------------
 * `active_seat_count` (what we computed) and `pushed_quantity` (what Stripe
 * accepted) are two columns, never one. If the push fails, the row still exists
 * with `push_error` set and `pushed_quantity` null — the discrepancy is
 * visible, on the coach's own billing page, instead of being inferred from a
 * missing log line. Merging them into a single "seats" column is exactly how a
 * failed push becomes an invisible undercharge.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------
 * It creates no Stripe product and no Stripe price — those are human actions
 * (BUILD_PLAN W10.1). It only resizes an item on a subscription a human's
 * price ids already made possible, and it aborts loudly when they are missing.
 * It also never invoices immediately: `proration_behavior=none` — a quantity
 * change lands on the next scheduled invoice, so a student who becomes active
 * on the 28th does not trigger a surprise mid-cycle charge.
 *
 * Invocation: POST with `X-Internal-Secret` (cron). Optional body:
 *   { month: "YYYY-MM-01", coach_id: "<uuid>", dry_run: true }
 */

type CoachRow = {
  id: string;
  user_id: string;
  status: string;
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function firstOfMonth(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-01$/.test(s)) return s;
  return periodMonthKey(new Date());
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  const guard = ensureInternalRequest(req);
  if (guard) return guard;

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    const seatPriceMonthly = Deno.env.get("STRIPE_PRICE_ID_COACH_SEAT_MONTHLY")?.trim() ?? "";

    const admin = createClient(supabaseUrl, serviceRole);

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const periodMonth = firstOfMonth(body.month);
    const onlyCoachId = typeof body.coach_id === "string" ? body.coach_id.trim() : "";
    const dryRun = body.dry_run === true;

    const coachQuery = admin
      .from("coaches")
      .select("id,user_id,status")
      .eq("status", "active");
    if (onlyCoachId) coachQuery.eq("id", onlyCoachId);

    const { data: coaches, error: coachErr } = await coachQuery;
    if (coachErr) {
      console.error("[stripe-reconcile-seats] coaches read error", coachErr);
      await logEdgeFunctionError({
        functionName: "stripe-reconcile-seats",
        error: coachErr,
        severity: "error",
        title: "coaches_read_failed",
        requestId,
        source: "stripe",
      });
      return serverError(req, requestId);
    }

    let processed = 0;
    let pushed = 0;
    let skipped = 0;
    let failed = 0;
    const decisions: Array<Record<string, unknown>> = [];

    for (const coach of ((coaches ?? []) as unknown as CoachRow[])) {
      processed++;
      let decision: SeatDecision = { action: "abort", reason: "not_evaluated" };
      let active = 0;
      let linked = 0;
      let pushedQuantity: number | null = null;
      let pushError: string | null = null;
      let stripeSubscriptionId: string | null = null;
      let stripeSeatItemId: string | null = null;

      try {
        const { data: ledger, error: ledgerErr } = await admin.rpc(
          "keel_coach_seat_ledger",
          { p_coach_id: coach.id, p_month: periodMonth },
        );
        if (ledgerErr) throw ledgerErr;

        const counts = countSeats((ledger ?? []) as unknown as SeatLedgerRow[]);
        active = counts.active;
        linked = counts.linked;

        const { data: subRow, error: subErr } = await admin
          .from("subscriptions")
          .select("stripe_subscription_id,status")
          .eq("user_id", coach.user_id)
          .maybeSingle();
        if (subErr) throw subErr;

        stripeSubscriptionId =
          String((subRow as any)?.stripe_subscription_id ?? "").trim() || null;

        let stripeSub: StripeSubscriptionLike | null = null;
        if (stripeSubscriptionId) {
          stripeSub = await stripeRequest<StripeSubscriptionLike>({
            method: "GET",
            path: `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
            secretKey: stripeSecretKey,
          });
        }

        decision = decideSeatQuantity({ subscription: stripeSub, activeSeats: active });

        if (!dryRun) {
          if (decision.action === "update_item") {
            stripeSeatItemId = decision.itemId;
            // Idempotency key includes the month and the quantity: a retry of
            // the same reconciliation is one Stripe write, not two.
            await stripeRequest({
              method: "POST",
              path: `/v1/subscription_items/${encodeURIComponent(decision.itemId)}`,
              secretKey: stripeSecretKey,
              idempotencyKey: `keel_seats_${coach.id}_${periodMonth}_${decision.quantity}`,
              body: { quantity: decision.quantity, proration_behavior: "none" },
            });
            pushedQuantity = decision.quantity;
            pushed++;
          } else if (decision.action === "create_item") {
            if (!seatPriceMonthly) {
              throw new Error(
                "Missing env var: STRIPE_PRICE_ID_COACH_SEAT_MONTHLY (human step: create the Stripe price)",
              );
            }
            await stripeRequest({
              method: "POST",
              path: "/v1/subscription_items",
              secretKey: stripeSecretKey,
              idempotencyKey: `keel_seats_new_${coach.id}_${periodMonth}`,
              body: {
                subscription: stripeSubscriptionId,
                price: seatPriceMonthly,
                quantity: decision.quantity,
                proration_behavior: "none",
              },
            });
            pushedQuantity = decision.quantity;
            pushed++;
          } else if (decision.action === "noop") {
            stripeSeatItemId = decision.itemId;
            pushedQuantity = decision.quantity;
          } else {
            skipped++;
          }
        }
      } catch (err) {
        failed++;
        pushError = err instanceof Error ? err.message : String(err);
        console.error(
          `[stripe-reconcile-seats] request_id=${requestId} coach_id=${coach.id} failed`,
          err,
        );
        await logEdgeFunctionError({
          functionName: "stripe-reconcile-seats",
          error: err,
          severity: "error",
          title: "seat_reconciliation_failed",
          requestId,
          userId: coach.user_id,
          source: "stripe",
          metadata: { coach_id: coach.id, period_month: periodMonth },
        });
      }

      // The ledger row is written whatever happened, including on failure. A
      // period with no row is indistinguishable from a period we never ran.
      if (!dryRun) {
        const { error: upsertErr } = await admin
          .from("coach_billing_periods")
          .upsert({
            coach_id: coach.id,
            period_month: periodMonth,
            active_seat_count: active,
            linked_seat_count: linked,
            threshold_at_computation: ACTIVE_STUDENT_MIN_INTERACTIONS,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_seat_item_id: stripeSeatItemId,
            pushed_quantity: pushedQuantity,
            pushed_at: pushedQuantity === null ? null : new Date().toISOString(),
            push_error: pushError ??
              (decision.action === "abort" ? decision.reason : null),
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "coach_id,period_month" });
        if (upsertErr) {
          console.error(
            "[stripe-reconcile-seats] coach_billing_periods upsert error",
            upsertErr,
          );
        }
      }

      decisions.push({
        coach_id: coach.id,
        active_seats: active,
        linked_seats: linked,
        action: decision.action,
        detail: decision.action === "abort"
          ? decision.reason
          : decision.action === "skip"
          ? decision.reason
          : decision.action === "update_item"
          ? `${decision.from}->${decision.quantity}`
          : String((decision as any).quantity ?? ""),
        push_error: pushError,
      });

      console.log(
        `[stripe-reconcile-seats] request_id=${requestId} coach_id=${coach.id} month=${periodMonth} active=${active} linked=${linked} action=${decision.action} dry_run=${dryRun}`,
      );
    }

    return jsonResponse(req, {
      ok: true,
      period_month: periodMonth,
      dry_run: dryRun,
      processed,
      pushed,
      skipped,
      failed,
      decisions,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[stripe-reconcile-seats] error", err);
    await logEdgeFunctionError({
      functionName: "stripe-reconcile-seats",
      error: err,
      severity: "error",
      title: "seat_reconciliation_run_failed",
      requestId,
      source: "stripe",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});

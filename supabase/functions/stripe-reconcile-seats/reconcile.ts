// ===========================================================================
// KEEL W10 — the monthly seat reconciliation, as a PURE module.
//
// The decision ("what quantity should this coach's seat item carry, and what
// call does that require?") is separated from the I/O so it can be tested
// against every shape Stripe actually returns — a subscription with no seat
// item, a subscription whose items arrive in the other order, a coach with no
// subscription at all — without a network and without a database.
//
// The job that calls it is `index.ts` in this folder.
// ===========================================================================

import {
  countSeats,
  isKeelSeatPriceId,
  type SeatLedgerRow,
} from "../_shared/billing-tier.ts";

export type StripeSubscriptionItem = {
  id?: string;
  quantity?: number;
  price?: { id?: string };
};

export type StripeSubscriptionLike = {
  id?: string;
  status?: string;
  items?: { data?: StripeSubscriptionItem[] };
};

export type SeatDecision =
  /** The quantity already matches. Do nothing — and say so, loudly, in the log. */
  | { action: "noop"; quantity: number; itemId: string | null }
  /** The seat item exists and must be resized. */
  | { action: "update_item"; itemId: string; from: number; quantity: number }
  /** No seat item on this subscription yet; create it at `quantity`. */
  | { action: "create_item"; quantity: number }
  /** Nothing to do and nothing to create: 0 active seats and no item. */
  | { action: "skip"; reason: "no_seats_no_item" }
  /** Refused. The reason is carried so the caller can persist it, not swallow it. */
  | { action: "abort"; reason: string };

/**
 * Find the per-active-student item on a subscription.
 *
 * Deliberately NOT `items.data[0]`: the platform line and the seat line arrive
 * in an order Stripe does not promise, and resizing the FLAT line to the number
 * of students would invoice a coach 49 $ times their roster.
 */
export function findSeatItem(
  sub: StripeSubscriptionLike | null | undefined,
): StripeSubscriptionItem | null {
  const items = sub?.items?.data ?? [];
  for (const it of items) {
    if (isKeelSeatPriceId(it?.price?.id)) return it;
  }
  return null;
}

/**
 * The whole decision. `activeSeats` comes from `countSeats(ledger)` — the same
 * function the coach's billing page calls, so the invoice and the screen cannot
 * disagree.
 */
export function decideSeatQuantity(input: {
  subscription: StripeSubscriptionLike | null | undefined;
  activeSeats: number;
}): SeatDecision {
  const sub = input.subscription;
  const status = String(sub?.status ?? "").trim().toLowerCase();

  if (!sub?.id) return { action: "abort", reason: "no_stripe_subscription" };
  if (status !== "active" && status !== "trialing") {
    // A canceled or past_due subscription is not resized. Pushing a quantity
    // onto it would either fail or resurrect billing on a contract that ended.
    return { action: "abort", reason: `subscription_not_live:${status || "unknown"}` };
  }

  const seats = Number(input.activeSeats);
  if (!Number.isFinite(seats) || seats < 0) {
    // R7: refuse rather than push a guess onto an invoice.
    return { action: "abort", reason: "invalid_seat_count" };
  }
  const quantity = Math.floor(seats);

  const item = findSeatItem(sub);
  if (!item?.id) {
    if (quantity === 0) return { action: "skip", reason: "no_seats_no_item" };
    return { action: "create_item", quantity };
  }

  const current = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
  if (current === quantity) {
    return { action: "noop", quantity, itemId: item.id };
  }
  return { action: "update_item", itemId: item.id, from: current, quantity };
}

/** Convenience: ledger rows -> decision, in one call. */
export function decideFromLedger(input: {
  subscription: StripeSubscriptionLike | null | undefined;
  ledger: ReadonlyArray<SeatLedgerRow>;
}): { decision: SeatDecision; active: number; linked: number } {
  const counts = countSeats(input.ledger);
  return {
    decision: decideSeatQuantity({
      subscription: input.subscription,
      activeSeats: counts.active,
    }),
    active: counts.active,
    linked: counts.linked,
  };
}

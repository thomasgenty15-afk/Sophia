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
  keelSeatPriceIdFor,
  type SeatInterval,
  type SeatLedgerRow,
} from "../_shared/billing-tier.ts";

export type { SeatInterval };

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
/**
 * Le siège DE CET INTERVALLE, et lui seul.
 *
 * ⚠️ IL A REMPLACÉ UN `findSeatItem` SANS INTERVALLE, ET C'EST UNE CORRECTION,
 * PAS UN AJOUT. L'ancien rendait le PREMIER article qui ressemblait à un siège.
 * Tant qu'il n'y avait qu'un tarif, « le premier » était « le bon ». Depuis
 * 20260806190000 un abonnement peut porter DEUX articles de siège — mensuel et
 * annuel — et redimensionner celui trouvé en premier facturerait les élèves
 * annuels au tarif mensuel, ou l'inverse. Sur une facture, en silence.
 *
 * `isKeelSeatPriceId` survit ailleurs: il répond « cet abonnement est-il un
 * contrat coach », question qui ne demande pas l'intervalle.
 */
export function findSeatItemFor(
  sub: StripeSubscriptionLike | null | undefined,
  interval: SeatInterval,
): StripeSubscriptionItem | null {
  const priceId = keelSeatPriceIdFor(interval);
  if (!priceId) return null;
  const items = sub?.items?.data ?? [];
  for (const it of items) {
    if (String(it?.price?.id ?? "").trim() === priceId) return it;
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
  /**
   * L'article visé. OBLIGATOIRE.
   *
   * Il a été optionnel pendant une heure, avec un repli sur « le premier
   * article de siège trouvé ». C'était la faute que ce dépôt documente ailleurs
   * sous le nom « paramètre de garde optionnel = garde désarmée »: l'oubli
   * n'aurait pas fait échouer l'appel, il aurait redimensionné le mauvais
   * article — et personne ne l'aurait vu avant la facture.
   */
  interval: SeatInterval;
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

  const item = findSeatItemFor(sub, input.interval);
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
  /** L'article visé. Obligatoire, pour la même raison que dans
   *  `decideSeatQuantity`: un défaut silencieux viserait le mauvais tarif. */
  interval: SeatInterval;
}): { decision: SeatDecision; active: number; linked: number } {
  const counts = countSeats(input.ledger);
  // LE COMPTE DE CETTE VOIE, PAS LE TOTAL. Passer `counts.active` pousserait
  // toute la cohorte sur un seul des deux articles.
  const seats = input.interval === "year" ? counts.activeYearly : counts.activeMonthly;
  return {
    decision: decideSeatQuantity({
      subscription: input.subscription,
      activeSeats: seats,
      interval: input.interval,
    }),
    active: counts.active,
    linked: counts.linked,
  };
}

// Pure decision logic for Stripe subscription WhatsApp notifications.
//
// A single subscription change in Stripe often emits several
// `customer.subscription.updated` events. Combined with a non-atomic
// "has a confirmation already been sent?" check, that produced duplicate
// confirmation messages. This module keeps the new-vs-modified decision and
// the dedup key deterministic and unit-testable; the atomic claim that
// collapses concurrent events lives in the webhook (subscription_notifications).

export type PaidTier = "system" | "alliance" | "architecte";
export type SubTier = PaidTier | null;
export type SubInterval = "monthly" | "yearly" | null;

export type SubscriptionSnapshot = {
  status: string | null;
  tier: SubTier;
  interval: SubInterval;
  currentPeriodEnd: string | null;
};

export type NotificationKind = "new" | "modified" | null;

// "Active paid" = status active (trials are handled elsewhere) with a period
// that has not lapsed. Used both to decide whether to notify at all and to
// tell a first activation apart from a change on an existing subscription.
export function isActivePaid(
  snapshot: SubscriptionSnapshot,
  nowMs: number,
): boolean {
  if (String(snapshot.status ?? "").toLowerCase() !== "active") return false;
  const raw = snapshot.currentPeriodEnd
    ? String(snapshot.currentPeriodEnd)
    : "";
  if (!raw) return true;
  const end = new Date(raw).getTime();
  return Number.isFinite(end) ? nowMs < end : true;
}

// Decide which WhatsApp notification (if any) a subscription event warrants.
//   - now inactive               -> null (nothing to confirm)
//   - was not active paid before -> "new" (first activation / reactivation)
//   - was active, tier/interval changed -> "modified"
//   - was active, tier/interval unchanged -> null (renewal, card change, …)
export function decideSubscriptionNotification(
  prev: SubscriptionSnapshot | null,
  next: SubscriptionSnapshot,
  nowMs: number,
): NotificationKind {
  if (!isActivePaid(next, nowMs)) return null;
  if (!prev || !isActivePaid(prev, nowMs)) return "new";
  if (prev.tier !== next.tier || prev.interval !== next.interval) {
    return "modified";
  }
  return null;
}

const TIER_LABELS: Record<PaidTier, string> = {
  system: "Système",
  alliance: "Alliance",
  architecte: "Architecte",
};

export function tierLabel(tier: SubTier): string {
  if (tier && Object.prototype.hasOwnProperty.call(TIER_LABELS, tier)) {
    return TIER_LABELS[tier as PaidTier];
  }
  return "ton nouveau palier";
}

// Sent when a user first activates a paid subscription (unchanged wording).
export function subscriptionConfirmedText(): string {
  return "C’est confirmé ✅\nTon abonnement Sophia est bien activé.\n\nJe suis contente de te retrouver ici.";
}

// Sent when an existing subscriber changes tier or billing interval.
export function subscriptionModifiedText(tier: SubTier): string {
  return `C’est fait ✅\nTon abonnement Sophia est maintenant sur la formule ${
    tierLabel(tier)
  }.\n\nTout est bien à jour de mon côté.`;
}

// Idempotency key for the atomic claim.
//   - "new" collapses to once per subscription, ever.
//   - "modified" is keyed by the resulting tier/interval so one change (which
//     may fire several Stripe events) notifies once, while a genuinely later
//     change to a different plan can still notify.
export function notificationDedupKey(
  stripeSubscriptionId: string,
  kind: "new" | "modified",
  tier: SubTier,
  interval: SubInterval,
): string {
  if (kind === "new") return `${stripeSubscriptionId}:new`;
  return `${stripeSubscriptionId}:modified:${tier ?? "null"}:${
    interval ?? "null"
  }`;
}

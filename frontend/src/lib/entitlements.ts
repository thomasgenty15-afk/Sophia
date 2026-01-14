export type PaidTier = "system" | "alliance" | "architecte";
export type EffectiveTier = PaidTier | "none";

function env(name: string): string | undefined {
  const v = (import.meta as any)?.env?.[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function priceIdSet(keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const v = env(k);
    if (v) out.add(v);
  }
  return out;
}

const PRICE_IDS = {
  system: priceIdSet(["VITE_STRIPE_PRICE_ID_SYSTEM_MONTHLY", "VITE_STRIPE_PRICE_ID_SYSTEM_YEARLY"]),
  alliance: priceIdSet(["VITE_STRIPE_PRICE_ID_ALLIANCE_MONTHLY", "VITE_STRIPE_PRICE_ID_ALLIANCE_YEARLY"]),
  architecte: priceIdSet(["VITE_STRIPE_PRICE_ID_ARCHITECTE_MONTHLY", "VITE_STRIPE_PRICE_ID_ARCHITECTE_YEARLY"]),
};

export function getTierFromStripePriceId(stripePriceId: string | null | undefined): PaidTier | null {
  const id = (stripePriceId ?? "").trim();
  if (!id) return null;
  if (PRICE_IDS.architecte.has(id)) return "architecte";
  if (PRICE_IDS.alliance.has(id)) return "alliance";
  if (PRICE_IDS.system.has(id)) return "system";
  return null;
}

export function isSubscriptionActive(sub: { status: string | null; current_period_end: string | null } | null): boolean {
  if (!sub) return false;
  const status = (sub.status ?? "").toLowerCase();
  if (status !== "active" && status !== "trialing") return false;
  // If current_period_end is missing, treat as active (Stripe can omit briefly).
  if (!sub.current_period_end) return true;
  const end = new Date(sub.current_period_end).getTime();
  return Number.isFinite(end) ? Date.now() < end : true;
}

export function getEffectiveTier(subscription: {
  status: string | null;
  current_period_end: string | null;
  stripe_price_id: string | null;
  // Optional: server-side computed tier (preferred).
  effective_tier?: EffectiveTier | null;
} | null): EffectiveTier {
  if (!subscription) return "none";
  if (!isSubscriptionActive(subscription)) return "none";
  const t = (subscription as any)?.effective_tier;
  if (t === "system" || t === "alliance" || t === "architecte") return t;
  return getTierFromStripePriceId(subscription.stripe_price_id) ?? "none";
}

export function hasArchitecteAccess(subscription: {
  status: string | null;
  current_period_end: string | null;
  stripe_price_id: string | null;
} | null): boolean {
  return getEffectiveTier(subscription) === "architecte";
}

export function canAccessArchitectWeek(weekNum: number, subscription: {
  status: string | null;
  current_period_end: string | null;
  stripe_price_id: string | null;
} | null): boolean {
  if (!Number.isFinite(weekNum)) return false;
  if (weekNum <= 2) return true; // preview included in all tiers
  return hasArchitecteAccess(subscription);
}




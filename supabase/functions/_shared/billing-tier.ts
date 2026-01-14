import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export type PaidTier = "system" | "alliance" | "architecte";
export type EffectiveTier = PaidTier | "none";
export type BillingInterval = "monthly" | "yearly";

function env(name: string): string | null {
  const v = Deno.env.get(name);
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function isActiveSubscription(row: any): boolean {
  if (!row) return false;
  const status = String(row.status ?? "").toLowerCase();
  if (status !== "active" && status !== "trialing") return false;
  const endRaw = row.current_period_end ? String(row.current_period_end) : "";
  if (!endRaw) return true;
  const end = new Date(endRaw).getTime();
  return Number.isFinite(end) ? Date.now() < end : true;
}

export function tierFromStripePriceId(priceId: string | null | undefined): PaidTier | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;

  const system = new Set([env("STRIPE_PRICE_ID_SYSTEM_MONTHLY"), env("STRIPE_PRICE_ID_SYSTEM_YEARLY")].filter(Boolean) as string[]);
  const alliance = new Set([env("STRIPE_PRICE_ID_ALLIANCE_MONTHLY"), env("STRIPE_PRICE_ID_ALLIANCE_YEARLY")].filter(Boolean) as string[]);
  const architecte = new Set([env("STRIPE_PRICE_ID_ARCHITECTE_MONTHLY"), env("STRIPE_PRICE_ID_ARCHITECTE_YEARLY")].filter(Boolean) as string[]);

  if (architecte.has(id)) return "architecte";
  if (alliance.has(id)) return "alliance";
  if (system.has(id)) return "system";
  return null;
}

export function intervalFromStripePriceId(priceId: string | null | undefined): BillingInterval | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;
  const monthly = new Set([
    env("STRIPE_PRICE_ID_SYSTEM_MONTHLY"),
    env("STRIPE_PRICE_ID_ALLIANCE_MONTHLY"),
    env("STRIPE_PRICE_ID_ARCHITECTE_MONTHLY"),
  ].filter(Boolean) as string[]);
  const yearly = new Set([
    env("STRIPE_PRICE_ID_SYSTEM_YEARLY"),
    env("STRIPE_PRICE_ID_ALLIANCE_YEARLY"),
    env("STRIPE_PRICE_ID_ARCHITECTE_YEARLY"),
  ].filter(Boolean) as string[]);
  if (monthly.has(id)) return "monthly";
  if (yearly.has(id)) return "yearly";
  return null;
}

export async function getEffectiveTierForUser(
  supabase: any,
  userId: string,
): Promise<EffectiveTier> {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("status,stripe_price_id,current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (!isActiveSubscription(data)) return "none";
    return tierFromStripePriceId((data as any)?.stripe_price_id ?? null) ?? "none";
  } catch {
    return "none";
  }
}




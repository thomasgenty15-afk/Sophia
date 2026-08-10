// ---------------------------------------------------------------------------
// KEEL W10 — THE TIER VOCABULARY (site 4 of 4)
// The other three: supabase/functions/_shared/billing-tier.ts,
// `profiles_access_tier_check` and `subscriptions_tier_check`
// (supabase/migrations/20260727235000_keel_billing_seats.sql). They move
// together or the product lies to somebody.
//
// 'coach'   — sold: the 49 $/mo platform line + 12 $/mo per active student.
// 'student' — INHERITED from the coach's solvency. Never sold, never on a
//             `subscriptions` row, never derivable from a Stripe price id.
//             It exists only on `profiles.access_tier`, written by the DB.
// ---------------------------------------------------------------------------
//
// LE FOYER — DEUX JETONS DE PLUS (chantier 1; migration 20260811030000)
// 'household'        — le COMPTE MAÎTRE. Vendu: 12,99 €/mois le foyer entier,
//                      +2 €/mois par profil réclamé, sur SON abonnement.
// 'household_member' — un PROFIL RÉCLAMÉ. HÉRITÉ comme 'student': jamais
//                      vendu, jamais sur un `subscriptions` — le maître paie.
// Les reconnaître ICI n'est pas cosmétique: un palier inconnu s'effondre sur
// 'none' (`normalizeAccessTierValue`), et 'none' déclenche le tunnel de vente
// grand public. Sans ces deux lignes, un foyer QUI PAIE se verrait proposer de
// s'abonner à un produit qui n'existe plus.
export type PaidTier = "system" | "alliance" | "architecte";
export type KeelTier = "coach" | "student" | "household" | "household_member";
export type EffectiveTier = PaidTier | KeelTier | "none";
/** Everything `profiles.access_tier` can hold, including the time-based one. */
export type AccessTierValue = EffectiveTier | "trial";

/**
 * ⚠️ PAS DE `as any` ICI, ET CE N'EST PAS DE L'HYGIÈNE DE LINTER. Un cast vers
 * `any` désarme le typecheck sur TOUT ce qui suit la propriété — ce dépôt a
 * déjà payé « 200 en log, null en silence » pour exactement ce motif. Le type
 * étroit ci-dessous dit la seule chose vraie de `import.meta.env` : un sac de
 * chaînes dont aucune clé n'est garantie.
 */
type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

function env(name: string): string | undefined {
  const v = (import.meta as ViteImportMeta).env?.[name];
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
  // Le paramètre DÉCLARE déjà `effective_tier?: EffectiveTier | null`: le cast
  // qui était ici ne protégeait de rien et masquait la déclaration.
  const t = subscription.effective_tier;
  if (
    t === "system" || t === "alliance" || t === "architecte" ||
    t === "coach" || t === "student" ||
    t === "household" || t === "household_member"
  ) {
    return t;
  }
  return getTierFromStripePriceId(subscription.stripe_price_id) ?? "none";
}

/**
 * KEEL W10 — normalize whatever `profiles.access_tier` returned.
 *
 * The single place the frontend turns an untrusted string into a tier. Unknown
 * values collapse to 'none': a tier we do not recognize must not be treated as
 * access, and the alternative (passing it through) is how a typo becomes an
 * entitlement.
 */
export function normalizeAccessTierValue(value: unknown): AccessTierValue {
  const raw = String(value ?? "none").trim().toLowerCase();
  if (
    raw === "trial" || raw === "coach" || raw === "student" ||
    raw === "household" || raw === "household_member" ||
    raw === "system" || raw === "alliance" || raw === "architecte"
  ) {
    return raw;
  }
  return "none";
}

/**
 * Does this tier grant the right to EXECUTE a protocol?
 *
 * This is the predicate MEGA_REVIEW B6 was missing everywhere. A KEEL student
 * has no subscription of their own, by design: their coach pays the seat. Any
 * gate that asks "is the tier alliance or architecte?" answers no for every
 * student on the platform and shows them "your trial is over".
 */
export function tierGrantsProtocolExecution(value: unknown): boolean {
  const t = normalizeAccessTierValue(value);
  return t !== "none";
}

/**
 * Is this access inherited from somebody else's payment rather than bought?
 *
 * Deux cas, une même conséquence à l'écran: on ne propose JAMAIS d'acheter à
 * quelqu'un dont l'accès n'est pas à lui.
 *   'student'          — le coach paie le siège.
 *   'household_member' — le compte maître paie le profil réclamé; demander une
 *                        carte pour 2 € est disproportionné, et il en a déjà
 *                        une.
 */
export function isInheritedEntitlement(value: unknown): boolean {
  const t = normalizeAccessTierValue(value);
  return t === "student" || t === "household_member";
}

/**
 * Should this account be shown the B2C upgrade funnel?
 *
 * 'student' is excluded on purpose: their access is not theirs to buy, and
 * offering it is the exact "your trial is over" screen B6 describes. 'coach'
 * is excluded too — their billing lives on /coach/billing, not /upgrade.
 * Idem pour le foyer: 'household_member' n'a rien à acheter (le maître paie),
 * et 'household' paie déjà — l'un et l'autre sont exclus par la règle « seuls
 * 'none' et 'trial' voient le tunnel », sans exception à écrire.
 */
export function shouldOfferSelfServeUpgrade(value: unknown): boolean {
  const t = normalizeAccessTierValue(value);
  return t === "none" || t === "trial";
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




import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// KEEL W10 — THE TIER VOCABULARY (site 3 of 4; see 20260727235000_keel_billing_seats.sql)
// ---------------------------------------------------------------------------
// 'coach'   — a coach with a solvent KEEL platform subscription, or inside the
//             14-day trial. Sold. Has a `subscriptions` row.
// 'student' — INHERITED from the coach's solvency. Never sold, never on an
//             invoice line of its own, and never present on a `subscriptions`
//             row (the SQL CHECK refuses it there). The DB is its only writer:
//             `recompute_profile_access_tier` derives it from `coach_clients`.
// The three legacy B2C tiers are kept because live rows still carry them; KEEL
// does not issue them any more.
export type PaidTier = "system" | "alliance" | "architecte";
export type KeelTier = "coach" | "student";
export type SellableTier = PaidTier | "coach";
export type EffectiveTier = PaidTier | KeelTier | "none";
export type BillingInterval = "monthly" | "yearly";

/**
 * Does this tier grant the right to EXECUTE a protocol — reminders, digest,
 * proactive restriction floor?
 *
 * This is the predicate B6 was missing. Every legacy gate asked "is the tier
 * alliance or architecte?", which is false for every KEEL student on earth,
 * and so ejected them ~90 lines before the KEEL provisioning ran.
 *
 * 'trial' is included: a personal trial still executes. 'none' is not.
 */
export function tierGrantsProtocolExecution(tierRaw: unknown): boolean {
  const t = String(tierRaw ?? "").trim().toLowerCase();
  return t === "coach" || t === "student" || t === "trial" ||
    t === "alliance" || t === "architecte" || t === "system";
}

/** True for the two KEEL tiers only. */
export function isKeelTier(tierRaw: unknown): tierRaw is KeelTier {
  const t = String(tierRaw ?? "").trim().toLowerCase();
  return t === "coach" || t === "student";
}

function env(name: string): string | null {
  const v = Deno.env.get(name);
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

// SEC-08: the deterministic price-id fallback below must only ever apply
// against a local Supabase instance, mirroring the MEGA stub in _shared/stripe.ts.
function isMegaTestModeLocal(): boolean {
  if ((Deno.env.get("MEGA_TEST_MODE") ?? "").trim() !== "1") return false;
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

// The MEGA Stripe stub emits "price_test_<tier>_<interval>" ids; recognize
// them locally so deterministic tests don't depend on shell env price ids.
function megaTestPriceIdParts(
  priceId: string,
): { tier: PaidTier; interval: BillingInterval } | null {
  if (!isMegaTestModeLocal()) return null;
  const m = priceId.match(
    /^price_test_(system|alliance|architecte)_(monthly|yearly)$/,
  );
  if (!m) return null;
  return { tier: m[1] as PaidTier, interval: m[2] as BillingInterval };
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

function normalizeStoredTier(value: unknown): EffectiveTier | null {
  const t = String(value ?? "").trim().toLowerCase();
  if (
    t === "system" || t === "alliance" || t === "architecte" ||
    t === "coach" || t === "student"
  ) {
    return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// KEEL price ids. TWO items on ONE subscription:
//   COACH_PLATFORM — the flat 49 $/month seat of the coach themselves, qty 1.
//   COACH_SEAT     — the 12 $/month per ACTIVE student, quantity reconciled
//                    monthly by `stripe-reconcile-seats`.
// Both map to the SAME tier ('coach'): they are two lines of one contract, not
// two products a coach chooses between.
// ---------------------------------------------------------------------------
export const KEEL_PRICE_ENV = {
  platformMonthly: "STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY",
  platformYearly: "STRIPE_PRICE_ID_COACH_PLATFORM_YEARLY",
  seatMonthly: "STRIPE_PRICE_ID_COACH_SEAT_MONTHLY",
  seatYearly: "STRIPE_PRICE_ID_COACH_SEAT_YEARLY",
} as const;

function keelPriceIds(kind: "platform" | "seat"): Set<string> {
  const keys = kind === "platform"
    ? [KEEL_PRICE_ENV.platformMonthly, KEEL_PRICE_ENV.platformYearly]
    : [KEEL_PRICE_ENV.seatMonthly, KEEL_PRICE_ENV.seatYearly];
  return new Set(keys.map((k) => env(k)).filter(Boolean) as string[]);
}

/** Is this price id the per-active-student line? Used to find the item to resize. */
export function isKeelSeatPriceId(priceId: string | null | undefined): boolean {
  const id = (priceId ?? "").trim();
  if (!id) return false;
  if (keelPriceIds("seat").has(id)) return true;
  return isMegaTestModeLocal() &&
    /^price_test_coach_seat_(monthly|yearly)$/.test(id);
}

export function isKeelPlatformPriceId(priceId: string | null | undefined): boolean {
  const id = (priceId ?? "").trim();
  if (!id) return false;
  if (keelPriceIds("platform").has(id)) return true;
  return isMegaTestModeLocal() &&
    /^price_test_coach_platform_(monthly|yearly)$/.test(id);
}

export function tierFromStripePriceId(
  priceId: string | null | undefined,
): PaidTier | "coach" | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;

  // KEEL first: a coach subscription carries two price ids and either one must
  // resolve to 'coach'. A webhook that reads the seat line and returns null
  // would silently blank the coach's tier and drop their whole roster.
  if (isKeelPlatformPriceId(id) || isKeelSeatPriceId(id)) return "coach";

  const system = new Set([env("STRIPE_PRICE_ID_SYSTEM_MONTHLY"), env("STRIPE_PRICE_ID_SYSTEM_YEARLY")].filter(Boolean) as string[]);
  const alliance = new Set([env("STRIPE_PRICE_ID_ALLIANCE_MONTHLY"), env("STRIPE_PRICE_ID_ALLIANCE_YEARLY")].filter(Boolean) as string[]);
  const architecte = new Set([env("STRIPE_PRICE_ID_ARCHITECTE_MONTHLY"), env("STRIPE_PRICE_ID_ARCHITECTE_YEARLY")].filter(Boolean) as string[]);

  if (architecte.has(id)) return "architecte";
  if (alliance.has(id)) return "alliance";
  if (system.has(id)) return "system";
  return megaTestPriceIdParts(id)?.tier ?? null;
}

/**
 * Pick the tier from ALL the price ids on a subscription, not just the first.
 * A KEEL coach subscription has two items and Stripe does not promise an order:
 * reading `items.data[0]` alone is a coin flip between the flat line and the
 * seat line. Both map to 'coach' here, so the answer is stable either way —
 * but only because this function looks at every item.
 */
export function tierFromStripePriceIds(
  priceIds: ReadonlyArray<string | null | undefined>,
): PaidTier | "coach" | null {
  for (const id of priceIds) {
    if (isKeelPlatformPriceId(id) || isKeelSeatPriceId(id)) return "coach";
  }
  for (const id of priceIds) {
    const t = tierFromStripePriceId(id);
    if (t) return t;
  }
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
  return megaTestPriceIdParts(id)?.interval ?? null;
}

export async function getEffectiveTierForUser(
  supabase: any,
  userId: string,
): Promise<EffectiveTier> {
  try {
    // `profiles.access_tier` is our DB source of truth and is kept in sync by SQL triggers.
    // Prefer it here so entitlement checks do not depend solely on Stripe env mapping.
    const { data: profile } = await supabase
      .from("profiles")
      .select("access_tier")
      .eq("id", userId)
      .maybeSingle();

    const profileTier = normalizeStoredTier((profile as any)?.access_tier ?? null);
    if (profileTier) return profileTier;

    const { data } = await supabase
      .from("subscriptions")
      .select("status,tier,stripe_price_id,current_period_end,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isActiveSubscription(data)) return "none";
    const subTier = normalizeStoredTier((data as any)?.tier ?? null);
    if (subTier) return subTier;
    return tierFromStripePriceId((data as any)?.stripe_price_id ?? null) ?? "none";
  } catch {
    return "none";
  }
}


// ===========================================================================
// KEEL W10 — THE BILLING ARITHMETIC (pure; the DB holds the same rule in SQL)
// ===========================================================================

/**
 * The contractual definition of an ACTIVE student: >= 3 interactions inside the
 * calendar month, counted on protocol_events + student-authored chat_messages.
 *
 * This constant and `public.keel_active_student_threshold()` are the same
 * number in two languages. They are not allowed to drift, and
 * `billing-tier_test.ts` asserts the SQL literal matches this one by reading
 * the migration file — the only way a constant duplicated across two runtimes
 * ever stays honest.
 */
export const ACTIVE_STUDENT_MIN_INTERACTIONS = 3;

export const COACH_TRIAL_DAYS = 14;
export const COACH_TRIAL_SEAT_LIMIT = 3;

export type SeatLedgerRow = {
  coach_client_id: string;
  student_user_id: string | null;
  seat_state: string | null;
  link_status: string | null;
  interaction_count: number | null;
  is_active_seat: boolean | null;
};

export type SeatCounts = {
  /** Links that occupy a seat: status 'active'. */
  linked: number;
  /** Of those, the ones that crossed the activity threshold. THE INVOICE. */
  active: number;
  /** Active links that did NOT cross it — listed, explained, not billed. */
  linkedNotActive: number;
};

/**
 * Two numbers, never merged (CONTRACT). `linked` is how many students the coach
 * follows; `active` is how many we bill for. A coach who sees only the second
 * cannot audit their invoice, and a coach who sees only the first thinks they
 * owe more than they do.
 *
 * Derived from the rows every time. No stored counter anywhere in KEEL.
 */
export function countSeats(rows: ReadonlyArray<SeatLedgerRow>): SeatCounts {
  let linked = 0;
  let active = 0;
  for (const r of rows) {
    if (String(r?.link_status ?? "") !== "active") continue;
    if (!r?.student_user_id) continue;
    linked++;
    if (r?.is_active_seat === true) active++;
  }
  return { linked, active, linkedNotActive: linked - active };
}

/**
 * The same decision, from a raw interaction count. Used when the caller has the
 * count but not the ledger row (reconciliation of a single student).
 */
export function isActiveStudent(interactionCount: unknown): boolean {
  const n = Number(interactionCount);
  return Number.isFinite(n) && n >= ACTIVE_STUDENT_MIN_INTERACTIONS;
}

/** First instant of the UTC calendar month containing `at`. */
export function monthStartUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** `YYYY-MM-01` — the `coach_billing_periods.period_month` key. */
export function periodMonthKey(at: Date): string {
  const d = monthStartUtc(at);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-01`;
}

export type CoachTrialState =
  | { kind: "trialing"; endsAt: string; daysLeft: number; seatLimit: number }
  | { kind: "expired"; endsAt: string; seatLimit: number }
  | { kind: "subscribed" }
  | { kind: "unknown" };

/**
 * What the billing page shows at the top. `subscribed` wins over a still-running
 * trial: a coach who paid on day 3 is a customer, not a trialist, and telling
 * them "11 days left" would read as "we have not taken your money".
 */
export function coachTrialState(input: {
  trialEndsAt: string | null | undefined;
  trialSeatLimit: number | null | undefined;
  subscriptionStatus: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  now?: Date;
}): CoachTrialState {
  const now = input.now ?? new Date();
  const status = String(input.subscriptionStatus ?? "").trim().toLowerCase();
  const periodOk = !input.currentPeriodEnd ||
    (Number.isFinite(new Date(input.currentPeriodEnd).getTime()) &&
      now.getTime() < new Date(input.currentPeriodEnd).getTime());
  if ((status === "active" || status === "trialing") && periodOk) {
    return { kind: "subscribed" };
  }

  const endsRaw = String(input.trialEndsAt ?? "").trim();
  if (!endsRaw) return { kind: "unknown" };
  const endsMs = new Date(endsRaw).getTime();
  if (!Number.isFinite(endsMs)) return { kind: "unknown" };

  // `Number(null)` is 0 and `Number.isFinite(0)` is true: a null seat limit
  // would silently display "0 of 0 seats" to a trialing coach, i.e. "you may
  // not invite anybody". Null/undefined must fall back to the contract, and
  // only an actual number may override it.
  const rawLimit = input.trialSeatLimit;
  const seatLimit = typeof rawLimit === "number" && Number.isFinite(rawLimit)
    ? rawLimit
    : COACH_TRIAL_SEAT_LIMIT;

  if (now.getTime() >= endsMs) {
    return { kind: "expired", endsAt: endsRaw, seatLimit };
  }
  const daysLeft = Math.ceil((endsMs - now.getTime()) / (24 * 60 * 60 * 1000));
  return { kind: "trialing", endsAt: endsRaw, daysLeft, seatLimit };
}



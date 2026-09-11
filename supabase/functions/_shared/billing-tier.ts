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
//
// ---------------------------------------------------------------------------
// LE FOYER — DEUX JETONS DE PLUS (chantier 1; migration 20260811030000)
// ---------------------------------------------------------------------------
// 'household'        — LE COMPTE MAÎTRE. Vendu: 12,99 €/mois le foyer entier,
//                      +2 €/mois par PROFIL RÉCLAMÉ. Porté par SA ligne
//                      `subscriptions` — `subscriptions.user_id` est UNIQUE et
//                      le foyer n'a pas d'identité Stripe, donc l'abonnement
//                      est celui du maître, jamais celui du foyer.
// 'household_member' — UN PROFIL RÉCLAMÉ. HÉRITÉ, comme 'student': jamais
//                      vendu, jamais sur une ligne `subscriptions` (la CHECK
//                      SQL l'y refuse), parce que c'est le maître qui paie et
//                      que demander une carte pour 2 € est disproportionné.
//
// DEUX JETONS ET PAS UN: dériver l'accès d'un profil réclamé de l'état du
// foyer obligerait `getEffectiveTierForUser` à interroger le foyer, soit une
// SECONDE source de vérité sur l'accès à côté de `profiles.access_tier`.
//
// ⚠️ 'household_member' N'A PAS ENCORE D'ÉCRIVAIN — la branche « héritée » de
// `recompute_profile_access_tier` a besoin de la fonction de couverture du
// chantier 3 (le gel), qui doit avoir une seule définition. Le jeton est au
// vocabulaire parce que les quatre sites bougent ensemble ou aucun; ce qui
// l'écrira est nommé dans la migration, pas simulé ici.
export type PaidTier = "system" | "alliance" | "architecte";
export type KeelTier = "coach" | "student" | "household" | "household_member";
export type SellableTier = PaidTier | "coach" | "household";
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
    t === "household" || t === "household_member" ||
    t === "alliance" || t === "architecte" || t === "system";
}

/** True for the KEEL tiers only (coach, élève, foyer, profil réclamé). */
export function isKeelTier(tierRaw: unknown): tierRaw is KeelTier {
  const t = String(tierRaw ?? "").trim().toLowerCase();
  return t === "coach" || t === "student" ||
    t === "household" || t === "household_member";
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
    t === "coach" || t === "student" ||
    t === "household" || t === "household_member"
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

/** L'intervalle de facturation d'un siège. Miroir de la CHECK
 *  `coach_clients_billing_interval_check` (migration 20260806190000). */
export type SeatInterval = "month" | "year";

/**
 * L'identifiant de prix Stripe du siège POUR CET INTERVALLE, ou `null` s'il
 * n'est pas configuré.
 *
 * `isKeelSeatPriceId` répond « c'est une ligne de siège » sans dire laquelle —
 * il servait quand il n'y avait qu'un tarif. Depuis qu'un abonnement peut
 * porter DEUX articles de siège (mensuel et annuel), redimensionner « le »
 * siège trouvé en premier facturerait les élèves annuels au tarif mensuel, ou
 * l'inverse. Cette fonction est ce qui permet de viser le bon article.
 */
export function keelSeatPriceIdFor(interval: SeatInterval): string | null {
  const key = interval === "year"
    ? KEEL_PRICE_ENV.seatYearly
    : KEEL_PRICE_ENV.seatMonthly;
  return env(key) || null;
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

// ---------------------------------------------------------------------------
// LE FOYER — DEUX ARTICLES SUR UN ABONNEMENT (chantier 1)
//   HOUSEHOLD_MONTHLY         — le forfait, 12,99 €/mois, quantité 1, IMMUABLE.
//   HOUSEHOLD_PROFILE_MONTHLY — le profil réclamé, 2 €/mois, quantité
//                               RECOMPUTÉE tous les mois par
//                               `stripe-reconcile-households`.
//
// Les deux rendent le MÊME palier ('household'): deux lignes d'un contrat, pas
// deux produits entre lesquels on choisit. Mensuel seulement — il n'existe pas
// d'annuel côté foyer, et en inventer un ici créerait une variable que
// personne ne pose.
// ---------------------------------------------------------------------------
export const KEEL_HOUSEHOLD_PRICE_ENV = {
  flatMonthly: "STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY",
  profileMonthly: "STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY",
} as const;

/** Le prix du FORFAIT, ou `null` s'il n'est pas configuré. */
export function keelHouseholdFlatPriceId(): string | null {
  return env(KEEL_HOUSEHOLD_PRICE_ENV.flatMonthly) || null;
}

/**
 * Le prix du PROFIL RÉCLAMÉ, ou `null` s'il n'est pas configuré.
 *
 * C'est le SEUL article que le job redimensionne. Le forfait ne bouge jamais:
 * le redimensionner à N facturerait 12,99 € par tête, ce qui est exactement la
 * faute que `findSeatItemFor` a corrigée côté coach.
 */
export function keelHouseholdProfilePriceId(): string | null {
  return env(KEEL_HOUSEHOLD_PRICE_ENV.profileMonthly) || null;
}

export function isKeelHouseholdPriceId(priceId: string | null | undefined): boolean {
  const id = (priceId ?? "").trim();
  if (!id) return false;
  return id === keelHouseholdFlatPriceId() || id === keelHouseholdProfilePriceId();
}

/**
 * L'ESSAI DU FOYER — 7 jours.
 *
 * ⚠️ TRENTE JUSQU'AU 2026-09-01 (D4bis). Le changement est une décision du
 * propriétaire, prise avec le tarif, et il a une seconde moitié: la durée est
 * désormais ANNONCÉE sur les quatre pages de vente (« première semaine
 * offerte »), alors que `AUDIT-SITE.md` §11 D2 l'interdisait tant qu'elle
 * n'était pas tenable. Une durée qu'on écrit doit être vraie ici.
 *
 * La constante est ici pour être citée, pas pour être appliquée: la date
 * effective vit sur `households.free_until`, POSÉE sur la ligne. Une règle
 * recalculée à la volée (`created_at + 7`) devient irreproductible dès que
 * quelqu'un change le nombre, et réécrirait rétroactivement ce qui a été
 * promis — c'est pourquoi les foyers nés avant gardent leurs trente jours.
 *
 * ⚠️ SECOND ÉCRIVAIN: `keel_household_trial_days()` en SQL
 * (`20260901200000_the_trial_is_a_week.sql`). `keel/household_freeze_test.ts`
 * lit les deux fichiers et fait rougir la suite s'ils divergent.
 */
export const HOUSEHOLD_TRIAL_DAYS = 7;

/**
 * Ce foyer est-il COUVERT PAR SON ESSAI aujourd'hui ?
 *
 * `free_until` est un DERNIER JOUR INCLUS: un foyer dont l'essai finit
 * aujourd'hui n'est pas facturé aujourd'hui. Comparaison sur la DATE civile
 * UTC et pas sur l'instant — sinon un job qui tourne à 03:40 UTC facturerait un
 * foyer dont l'essai expire « ce jour-là », douze heures avant sa fin dans sa
 * propre journée.
 *
 * `null`/absent = AUCUN essai posé, donc pas couvert. Ce n'est pas « gratuit à
 * vie »: c'est « personne n'a fait le geste », et le job le dit par un motif
 * nommé plutôt que de deviner.
 *
 * ⚠️ CE N'EST PAS LE PRÉDICAT DE GEL. Il répond « faut-il facturer ce mois-ci »
 * et rien d'autre. « Le foyer est-il gelé » (ni abonnement ni essai) est le
 * chantier 3, et il aura UNE définition, en SQL.
 */
export function householdTrialCovers(
  freeUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const raw = String(freeUntil ?? "").trim();
  if (!raw) return false;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const today = `${now.getUTCFullYear()}-${
    String(now.getUTCMonth() + 1).padStart(2, "0")
  }-${String(now.getUTCDate()).padStart(2, "0")}`;
  // Comparaison lexicographique sur `YYYY-MM-DD`: exacte, et sans le piège du
  // fuseau que `new Date("2026-08-11")` introduit (minuit UTC interprété en
  // local par certaines lectures).
  return today <= `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * L'INSTANT DU PREMIER PRÉLÈVEMENT — `subscription_data[trial_end]` de Stripe.
 *
 * ── CE QUE CETTE FONCTION REND POSSIBLE ───────────────────────────────────
 * Payer PENDANT son essai. Jusqu'au 2026-09-09 le tunnel refusait
 * (`409 household_in_trial`), et le pavé qui portait ce refus nommait la bonne
 * objection: Stripe exige un `trial_end` à plus de 48 h, donc un essai qui
 * finit demain « violerait la promesse en silence ». La réponse est le repli
 * ci-dessous — et il ne peut que DÉPASSER la promesse.
 *
 * ── LE CALCUL, ET POURQUOI CE JOUR-LÀ ─────────────────────────────────────
 * `free_until` est un DERNIER JOUR INCLUS. Le premier instant facturable est
 * donc le lendemain à 00:00 UTC — la même frontière que
 * `householdTrialCovers`, qui est réutilisée telle quelle plutôt que
 * recopiée: « l'essai couvre-t-il encore » n'a qu'une définition.
 *
 * ── LES TROIS BRANCHES ────────────────────────────────────────────────────
 *   ① Déjà gelé (ou aucun essai posé) -> `undefined`. La promesse est
 *      consommée, on prélève tout de suite. C'est le cas du mur.
 *   ② Date illisible -> `undefined`, aligné sur `householdTrialCovers`.
 *   ③ Moins de 48 h restantes -> `now + 49 h`. On n'entre dans cette branche
 *      QUE quand il reste moins de 48 h, donc `now + 49 h` est FORCÉMENT plus
 *      tard que `free_until + 1 j`: on offre au pire ~2 jours de plus, jamais
 *      une minute de moins. C'est la seule direction acceptable — la vitrine
 *      écrit « première semaine offerte », et une semaine offerte qui se fait
 *      raccourcir par une contrainte technique est une promesse cassée.
 *
 * ⚠️ CECI NE CRÉE PAS UNE SECONDE HORLOGE D'ACCÈS, et c'est ce qu'il faut
 * vérifier avant de la « simplifier ». `stripe-webhook` écrit le `status`
 * Stripe VERBATIM — donc `trialing` — et `current_period_end`, qui pendant un
 * essai Stripe vaut ce `trial_end`. La branche (c) de
 * `keel_household_is_covered` accepte `('active','trialing')`: la couverture
 * passe de l'essai maison à l'abonnement sans trou, et `households.free_until`
 * n'est JAMAIS réécrit. Un foyer garde ce qui lui a été promis (D4bis).
 *
 * @returns un timestamp Unix en SECONDES, ou `undefined` — que
 *          `toStripeFormBody` omet, si bien que « pas d'essai » et « clé
 *          absente » sont le même octet sur le fil.
 */
export const STRIPE_TRIAL_END_MIN_LEAD_SECONDS = 48 * 3600;
export const STRIPE_TRIAL_END_FALLBACK_SECONDS = 49 * 3600;

export function householdStripeTrialEnd(
  freeUntil: string | null | undefined,
  now: Date = new Date(),
): number | undefined {
  if (!householdTrialCovers(freeUntil, now)) return undefined;
  const m = String(freeUntil ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const lastDayUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const firstBillable = Math.floor((lastDayUtc + 86_400_000) / 1000);
  const nowSec = Math.floor(now.getTime() / 1000);
  if (firstBillable - nowSec < STRIPE_TRIAL_END_MIN_LEAD_SECONDS) {
    return nowSec + STRIPE_TRIAL_END_FALLBACK_SECONDS;
  }
  return firstBillable;
}

export function tierFromStripePriceId(
  priceId: string | null | undefined,
): SellableTier | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;

  // KEEL first: a coach subscription carries two price ids and either one must
  // resolve to 'coach'. A webhook that reads the seat line and returns null
  // would silently blank the coach's tier and drop their whole roster.
  if (isKeelPlatformPriceId(id) || isKeelSeatPriceId(id)) return "coach";
  // Le foyer, même raison: SES deux articles rendent tous les deux 'household'.
  // Un webhook qui lirait la ligne « profil réclamé » et rendrait null
  // effacerait le palier du maître — c'est-à-dire son accès — parce qu'il a
  // ajouté une bouche.
  if (isKeelHouseholdPriceId(id)) return "household";

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
): SellableTier | null {
  for (const id of priceIds) {
    if (isKeelPlatformPriceId(id) || isKeelSeatPriceId(id)) return "coach";
  }
  for (const id of priceIds) {
    if (isKeelHouseholdPriceId(id)) return "household";
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
  /** 'month' | 'year' — sur quel article Stripe ce siège est compté.
   *  Optionnel dans le type parce que les lignes écrites avant la migration
   *  20260806190000 ne le portent pas; `countSeats` traite l'absence comme
   *  'month', c'est-à-dire le tarif le plus cher et le moins engageant. */
  billing_interval?: string | null;
};

export type SeatCounts = {
  /** Links that occupy a seat: status 'active'. */
  linked: number;
  /** Of those, the billable ones. THE INVOICE. */
  active: number;
  /** Active links that are not billable — listed, explained, not billed. */
  linkedNotActive: number;
  /** LA FACTURE, VENTILÉE PAR ARTICLE STRIPE. `active === month + year`,
   *  toujours: un siège facturable est compté une fois et une seule. */
  activeMonthly: number;
  activeYearly: number;
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
  let activeMonthly = 0;
  let activeYearly = 0;
  for (const r of rows) {
    if (String(r?.link_status ?? "") !== "active") continue;
    if (!r?.student_user_id) continue;
    linked++;
    if (r?.is_active_seat !== true) continue;
    active++;
    // TOUT CE QUI N'EST PAS EXPLICITEMENT 'year' EST MENSUEL — y compris une
    // valeur inconnue, nulle, ou une ligne écrite avant 20260806190000. Le
    // mensuel est le tarif LE PLUS CHER et le moins engageant: se tromper de ce
    // côté-là coûte un peu d'argent au coach et ne l'engage à rien, alors que
    // le défaut inverse l'engagerait douze mois sans qu'il l'ait demandé.
    if (String(r?.billing_interval ?? "") === "year") activeYearly++;
    else activeMonthly++;
  }
  return {
    linked,
    active,
    linkedNotActive: linked - active,
    activeMonthly,
    activeYearly,
  };
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



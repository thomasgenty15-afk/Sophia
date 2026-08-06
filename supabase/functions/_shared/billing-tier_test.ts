import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  ACTIVE_STUDENT_MIN_INTERACTIONS,
  COACH_TRIAL_DAYS,
  COACH_TRIAL_SEAT_LIMIT,
  coachTrialState,
  countSeats,
  isActiveStudent,
  isKeelPlatformPriceId,
  isKeelSeatPriceId,
  isKeelTier,
  monthStartUtc,
  periodMonthKey,
  type SeatLedgerRow,
  tierFromStripePriceId,
  tierFromStripePriceIds,
  tierGrantsProtocolExecution,
} from "./billing-tier.ts";

// The env-driven price maps are read at call time, so each test sets exactly
// the vars it needs and clears them afterwards.
function withEnv(vars: Record<string, string>, fn: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    saved.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

Deno.test("tierGrantsProtocolExecution: the B6 predicate", () => {
  // THE regression under test. Every legacy gate asked "alliance or
  // architecte?" and so ejected every KEEL student from the proactive loop.
  assert(tierGrantsProtocolExecution("student"));
  assert(tierGrantsProtocolExecution("coach"));
  assert(tierGrantsProtocolExecution("trial"));
  assert(tierGrantsProtocolExecution("alliance"));
  assert(tierGrantsProtocolExecution("architecte"));
  assert(tierGrantsProtocolExecution("system"));

  assertFalse(tierGrantsProtocolExecution("none"));
  assertFalse(tierGrantsProtocolExecution(null));
  assertFalse(tierGrantsProtocolExecution(undefined));
  assertFalse(tierGrantsProtocolExecution(""));
  // Whitespace and case come from DB reads and query params; they must not
  // change the answer.
  assert(tierGrantsProtocolExecution(" STUDENT "));
});

Deno.test("isKeelTier only matches the two KEEL tokens", () => {
  assert(isKeelTier("coach"));
  assert(isKeelTier("student"));
  assertFalse(isKeelTier("alliance"));
  assertFalse(isKeelTier("trial"));
  assertFalse(isKeelTier("none"));
});

// ---------------------------------------------------------------------------
// Price id mapping — the two-item subscription
// ---------------------------------------------------------------------------

Deno.test("both KEEL price ids resolve to the SAME tier", () => {
  withEnv({
    STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY: "price_flat",
    STRIPE_PRICE_ID_COACH_SEAT_MONTHLY: "price_seat",
  }, () => {
    assertEquals(tierFromStripePriceId("price_flat"), "coach");
    assertEquals(tierFromStripePriceId("price_seat"), "coach");
    assert(isKeelPlatformPriceId("price_flat"));
    assert(isKeelSeatPriceId("price_seat"));
    assertFalse(isKeelSeatPriceId("price_flat"));
    assertFalse(isKeelPlatformPriceId("price_seat"));
  });
});

Deno.test("tierFromStripePriceIds does not depend on Stripe's item order", () => {
  // The bug this closes: reading items.data[0] on a 2-item subscription is a
  // coin flip. Both orders must give the same answer.
  withEnv({
    STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY: "price_flat",
    STRIPE_PRICE_ID_COACH_SEAT_MONTHLY: "price_seat",
  }, () => {
    assertEquals(tierFromStripePriceIds(["price_flat", "price_seat"]), "coach");
    assertEquals(tierFromStripePriceIds(["price_seat", "price_flat"]), "coach");
    assertEquals(tierFromStripePriceIds([null, "price_seat"]), "coach");
    assertEquals(tierFromStripePriceIds([]), null);
    assertEquals(tierFromStripePriceIds([null, undefined, ""]), null);
  });
});

Deno.test("an unknown price id stays null (never a silent tier)", () => {
  withEnv({ STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY: "price_flat" }, () => {
    assertEquals(tierFromStripePriceId("price_someone_elses"), null);
  });
});

Deno.test("a legacy price id still maps to its legacy tier", () => {
  withEnv({
    STRIPE_PRICE_ID_ALLIANCE_MONTHLY: "price_alliance",
    STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY: "price_flat",
  }, () => {
    assertEquals(tierFromStripePriceId("price_alliance"), "alliance");
  });
});

// ---------------------------------------------------------------------------
// The activity rule
// ---------------------------------------------------------------------------

Deno.test("isActiveStudent: the threshold is >= 3, not > 3", () => {
  assertFalse(isActiveStudent(0));
  assertFalse(isActiveStudent(2));
  assert(isActiveStudent(3));
  assert(isActiveStudent(40));
  // Garbage is not activity.
  assertFalse(isActiveStudent(null));
  assertFalse(isActiveStudent("many"));
  assertFalse(isActiveStudent(NaN));
});

Deno.test("the TS threshold and the SQL threshold are the same number", async () => {
  // A constant duplicated across two runtimes drifts. This reads the migration
  // and fails the day somebody changes one side only — the invoice and the
  // screen would otherwise disagree in silence.
  const sql = await Deno.readTextFile(
    new URL(
      "../../migrations/20260727235000_keel_billing_seats.sql",
      import.meta.url,
    ),
  );
  const m = sql.match(
    /create or replace function public\.keel_active_student_threshold\(\)[\s\S]*?\$\$\s*select\s+(\d+)\s*\$\$/,
  );
  assert(m, "keel_active_student_threshold() not found in the migration");
  assertEquals(Number(m[1]), ACTIVE_STUDENT_MIN_INTERACTIONS);
});

Deno.test("the TS trial constants match the migration", async () => {
  const sql = await Deno.readTextFile(
    new URL(
      "../../migrations/20260727235000_keel_billing_seats.sql",
      import.meta.url,
    ),
  );
  const limit = sql.match(
    /add column if not exists trial_seat_limit integer not null default (\d+)/,
  );
  assert(limit, "trial_seat_limit default not found");
  assertEquals(Number(limit[1]), COACH_TRIAL_SEAT_LIMIT);

  const days = sql.match(/interval '(\d+) days'/);
  assert(days, "trial interval not found");
  assertEquals(Number(days[1]), COACH_TRIAL_DAYS);
});

// ---------------------------------------------------------------------------
// Seat counting — the two numbers are never merged
// ---------------------------------------------------------------------------

function row(p: Partial<SeatLedgerRow>): SeatLedgerRow {
  return {
    coach_client_id: crypto.randomUUID(),
    student_user_id: crypto.randomUUID(),
    seat_state: "billed",
    link_status: "active",
    interaction_count: 0,
    is_active_seat: false,
    ...p,
  };
}

Deno.test("countSeats reports linked and active separately", () => {
  const rows = [
    row({ is_active_seat: true, interaction_count: 9 }),
    row({ is_active_seat: true, interaction_count: 3 }),
    row({ is_active_seat: false, interaction_count: 1 }),
  ];
  assertEquals(countSeats(rows), {
    linked: 3,
    active: 2,
    linkedNotActive: 1,
    activeMonthly: 2,
    activeYearly: 0,
  });
});

Deno.test("countSeats: invited / paused / ended links are not seats", () => {
  const rows = [
    row({ link_status: "active", is_active_seat: true }),
    row({ link_status: "invited", is_active_seat: true }),
    row({ link_status: "paused", is_active_seat: true }),
    row({ link_status: "ended", is_active_seat: true }),
  ];
  // Only the 'active' link counts, even when the ledger claims the others are
  // active seats: `status` is the seat, activity is only the billing filter.
  assertEquals(countSeats(rows), {
    linked: 1,
    active: 1,
    linkedNotActive: 0,
    activeMonthly: 1,
    activeYearly: 0,
  });
});

Deno.test("countSeats: a link with no student account is not a seat", () => {
  // An invitation accepted by nobody has student_user_id NULL. Billing a coach
  // for an email address is the failure mode this closes.
  const rows = [row({ student_user_id: null, is_active_seat: true })];
  assertEquals(countSeats(rows), {
    linked: 0,
    active: 0,
    linkedNotActive: 0,
    activeMonthly: 0,
    activeYearly: 0,
  });
});

Deno.test("countSeats on an empty roster is zero, not NaN", () => {
  assertEquals(countSeats([]), {
    linked: 0,
    active: 0,
    linkedNotActive: 0,
    activeMonthly: 0,
    activeYearly: 0,
  });
});

// ── LA VENTILATION PAR INTERVALLE (20260806190000) ─────────────────────────

Deno.test("countSeats ventile la facture entre mensuel et annuel", () => {
  const rows = [
    row({ is_active_seat: true, billing_interval: "month" }),
    row({ is_active_seat: true, billing_interval: "year" }),
    row({ is_active_seat: true, billing_interval: "year" }),
    // Non facturable: il ne compte dans AUCUNE des deux voies.
    row({ is_active_seat: false, billing_interval: "year" }),
  ];
  const c = countSeats(rows);
  assertEquals({ active: c.active, m: c.activeMonthly, y: c.activeYearly }, {
    active: 3,
    m: 1,
    y: 2,
  });
  // L'INVARIANT QUI PROTÈGE LA FACTURE: un siège est compté une fois et une
  // seule. Si cette égalité cassait, un élève serait facturé deux fois ou pas
  // du tout, et personne ne le verrait avant l'invoice.
  assertEquals(c.activeMonthly + c.activeYearly, c.active);
});

// TOUT CE QUI N'EST PAS 'year' EST MENSUEL — y compris `null`, `undefined` et
// une valeur inconnue. Le mensuel est le tarif le plus cher et le moins
// engageant: se tromper de ce côté-là ne verrouille personne douze mois.
Deno.test("un intervalle absent ou inconnu retombe sur le mensuel", () => {
  for (const v of [null, undefined, "", "annual", "MONTH"]) {
    const c = countSeats([row({ is_active_seat: true, billing_interval: v })]);
    assertEquals({ m: c.activeMonthly, y: c.activeYearly }, { m: 1, y: 0 });
  }
});

// ---------------------------------------------------------------------------
// Period keys
// ---------------------------------------------------------------------------

Deno.test("periodMonthKey is the first of the UTC month", () => {
  assertEquals(periodMonthKey(new Date("2026-07-27T22:14:00Z")), "2026-07-01");
  assertEquals(periodMonthKey(new Date("2026-01-01T00:00:00Z")), "2026-01-01");
  assertEquals(periodMonthKey(new Date("2026-12-31T23:59:59Z")), "2026-12-01");
  assertEquals(
    monthStartUtc(new Date("2026-07-27T22:14:00Z")).toISOString(),
    "2026-07-01T00:00:00.000Z",
  );
});

// ---------------------------------------------------------------------------
// Coach trial state
// ---------------------------------------------------------------------------

const NOW = new Date("2026-07-27T12:00:00Z");

Deno.test("coachTrialState: paying beats a still-running trial", () => {
  const st = coachTrialState({
    trialEndsAt: "2026-08-05T12:00:00Z",
    trialSeatLimit: 3,
    subscriptionStatus: "active",
    currentPeriodEnd: "2026-08-27T12:00:00Z",
    now: NOW,
  });
  assertEquals(st.kind, "subscribed");
});

Deno.test("coachTrialState: an elapsed subscription period is not solvency", () => {
  const st = coachTrialState({
    trialEndsAt: "2026-08-05T12:00:00Z",
    trialSeatLimit: 3,
    subscriptionStatus: "active",
    currentPeriodEnd: "2026-07-01T12:00:00Z",
    now: NOW,
  });
  assertEquals(st.kind, "trialing");
});

Deno.test("coachTrialState: days left rounds UP", () => {
  const st = coachTrialState({
    trialEndsAt: "2026-07-29T00:00:00Z",
    trialSeatLimit: 3,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    now: NOW,
  });
  assertEquals(st.kind, "trialing");
  // 36 hours left is "2 days left", never "1". Rounding a trial down is
  // telling a coach they have less time than they do.
  assertEquals(st.kind === "trialing" ? st.daysLeft : -1, 2);
});

Deno.test("coachTrialState: expired, and unknown when there is no date", () => {
  assertEquals(
    coachTrialState({
      trialEndsAt: "2026-07-01T00:00:00Z",
      trialSeatLimit: 3,
      subscriptionStatus: "canceled",
      currentPeriodEnd: null,
      now: NOW,
    }).kind,
    "expired",
  );
  assertEquals(
    coachTrialState({
      trialEndsAt: null,
      trialSeatLimit: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      now: NOW,
    }).kind,
    "unknown",
  );
  assertEquals(
    coachTrialState({
      trialEndsAt: "not-a-date",
      trialSeatLimit: 3,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      now: NOW,
    }).kind,
    "unknown",
  );
});

Deno.test("coachTrialState: a missing seat limit falls back to the contract", () => {
  const st = coachTrialState({
    trialEndsAt: "2026-08-05T12:00:00Z",
    trialSeatLimit: null,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    now: NOW,
  });
  assertEquals(st.kind === "trialing" ? st.seatLimit : -1, COACH_TRIAL_SEAT_LIMIT);
});

import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  type ArmableCard,
  contextMatches,
  flattenArmableCard,
  localWallClockToUtc,
  normalizeHHMM,
  parseUpcomingEvent,
  planCardArmings,
  resolveEventLocalTime,
  slotMatches,
  TIME_BUCKET_LOCAL_TIME,
  type UpcomingEvent,
} from "./arming.ts";

/**
 * KEEL W8.4 — arming tests.
 *
 * The whole feature is one claim: the card lands BEFORE the event. So the
 * suite's centre of gravity is time ordering — across timezones, across DST,
 * and at the boundary where an event has just passed.
 */

const SLOT_TIMES: Record<string, string | null> = {
  on_waking: "07:00",
  breakfast: "08:00",
  snack_am: "10:30",
  lunch: "12:30",
  snack_pm: "16:00",
  dinner: "19:30",
  before_bed: "22:00",
  any_meal: null,
  any_time: null,
};

function card(overrides: Partial<ArmableCard> = {}): ArmableCard {
  return {
    id: "card-1",
    user_id: "user-1",
    template_id: "tpl-1",
    status: "active",
    trigger_slot_key: null,
    trigger_contexts: [],
    trigger_time_bucket: "any",
    arm_lead_minutes: 180,
    ...overrides,
  };
}

function event(overrides: Partial<UpcomingEvent> = {}): UpcomingEvent {
  return {
    id: "event-1",
    source: "planned_deviation",
    local_date: "2026-08-12",
    slot_key: "dinner",
    kind: "restaurant",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// THE RULE
// ---------------------------------------------------------------------------

Deno.test("a declared deviation arms the card exactly 3 h before the meal", () => {
  const { armings } = planCardArmings({
    timezone: "Europe/Paris",
    now: new Date("2026-08-12T08:00:00Z"),
    events: [event()],
    cards: [card({ trigger_contexts: ["restaurant"], trigger_slot_key: "any_meal" })],
    slotDefaultLocalTimes: SLOT_TIMES,
  });
  assertEquals(armings.length, 1);
  // 19:30 Paris in August = 17:30Z; three hours earlier = 14:30Z.
  assertEquals(armings[0].event_at, "2026-08-12T17:30:00.000Z");
  assertEquals(armings[0].arm_at, "2026-08-12T14:30:00.000Z");
  assert(new Date(armings[0].arm_at) < new Date(armings[0].event_at));
});

Deno.test("an event already passed is never armed, and says why", () => {
  const { armings, skipped } = planCardArmings({
    timezone: "Europe/Paris",
    // 21:00 Paris: the 19:30 dinner is behind us.
    now: new Date("2026-08-12T19:00:00Z"),
    events: [event()],
    cards: [card({ trigger_contexts: ["restaurant"] })],
    slotDefaultLocalTimes: SLOT_TIMES,
  });
  assertEquals(armings.length, 0);
  assertEquals(skipped.length, 1);
  assertEquals(skipped[0].reason, "event_already_passed");
});

Deno.test("arming late but before the event still fires (arm_at may be in the past)", () => {
  // Declared two hours before a three-hour-lead card: the arming is due NOW,
  // which is the right answer. Suppressing it would lose the card entirely.
  const { armings } = planCardArmings({
    timezone: "Europe/Paris",
    now: new Date("2026-08-12T16:00:00Z"),
    events: [event()],
    cards: [card({ trigger_contexts: ["restaurant"] })],
    slotDefaultLocalTimes: SLOT_TIMES,
  });
  assertEquals(armings.length, 1);
  assert(new Date(armings[0].arm_at) < new Date("2026-08-12T16:00:00Z"));
  assert(new Date(armings[0].event_at) > new Date("2026-08-12T16:00:00Z"));
});

Deno.test("an archived card is never armed", () => {
  const { armings, skipped } = planCardArmings({
    timezone: "Europe/Paris",
    now: new Date("2026-08-12T08:00:00Z"),
    events: [event()],
    cards: [card({ status: "archived", trigger_contexts: ["restaurant"] })],
    slotDefaultLocalTimes: SLOT_TIMES,
  });
  assertEquals(armings.length, 0);
  assertEquals(skipped[0].reason, "card_not_active");
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

Deno.test("an empty trigger_contexts list means context-agnostic, not never", () => {
  assert(contextMatches(card({ trigger_contexts: [] }), event({ kind: "travel" })));
  assert(
    !contextMatches(card({ trigger_contexts: ["restaurant"] }), event({ kind: "travel" })),
  );
  assert(
    contextMatches(card({ trigger_contexts: ["restaurant", "social"] }), event()),
  );
});

Deno.test("slot matching handles both wildcard vocabulary entries", () => {
  assert(slotMatches(card({ trigger_slot_key: null }), event({ slot_key: "lunch" })));
  assert(slotMatches(card({ trigger_slot_key: "dinner" }), event({ slot_key: null })));
  assert(slotMatches(card({ trigger_slot_key: "any_time" }), event({ slot_key: "on_waking" })));
  assert(slotMatches(card({ trigger_slot_key: "any_meal" }), event({ slot_key: "lunch" })));
  assert(
    !slotMatches(card({ trigger_slot_key: "any_meal" }), event({ slot_key: "on_waking" })),
  );
  assert(!slotMatches(card({ trigger_slot_key: "dinner" }), event({ slot_key: "lunch" })));
});

Deno.test("the event's own slot wins over the card's anchor", () => {
  assertEquals(
    resolveEventLocalTime({
      card: card({ trigger_slot_key: "dinner", trigger_time_bucket: "morning" }),
      event: event({ slot_key: "lunch" }),
      slotDefaultLocalTimes: SLOT_TIMES,
    }),
    "12:30",
  );
});

Deno.test("a day-wide event falls back to the card anchor, then to the bucket", () => {
  assertEquals(
    resolveEventLocalTime({
      card: card({ trigger_slot_key: "before_bed" }),
      event: event({ slot_key: null }),
      slotDefaultLocalTimes: SLOT_TIMES,
    }),
    "22:00",
  );
  assertEquals(
    resolveEventLocalTime({
      card: card({ trigger_slot_key: null, trigger_time_bucket: "evening" }),
      event: event({ slot_key: null }),
      slotDefaultLocalTimes: SLOT_TIMES,
    }),
    TIME_BUCKET_LOCAL_TIME.evening,
  );
  // A wildcard anchor carries no time of its own and must not be looked up.
  assertEquals(
    resolveEventLocalTime({
      card: card({ trigger_slot_key: "any_meal", trigger_time_bucket: "midday" }),
      event: event({ slot_key: null }),
      slotDefaultLocalTimes: SLOT_TIMES,
    }),
    TIME_BUCKET_LOCAL_TIME.midday,
  );
});

Deno.test("every time bucket has a named default (no silent fallback)", () => {
  for (
    const bucket of ["morning", "midday", "afternoon", "evening", "night", "any"] as const
  ) {
    assert(/^\d{2}:\d{2}$/.test(TIME_BUCKET_LOCAL_TIME[bucket]), bucket);
  }
});

// ---------------------------------------------------------------------------
// Time, the part that is actually hard
// ---------------------------------------------------------------------------

Deno.test("localWallClockToUtc resolves a wall clock in several zones", () => {
  assertEquals(
    localWallClockToUtc("Europe/Paris", "2026-08-12", "19:30").toISOString(),
    "2026-08-12T17:30:00.000Z",
  );
  // Winter: Paris is UTC+1.
  assertEquals(
    localWallClockToUtc("Europe/Paris", "2026-01-12", "19:30").toISOString(),
    "2026-01-12T18:30:00.000Z",
  );
  assertEquals(
    localWallClockToUtc("America/New_York", "2026-08-12", "19:30").toISOString(),
    "2026-08-12T23:30:00.000Z",
  );
  // The far side of the date line: the instant is the day BEFORE in UTC.
  assertEquals(
    localWallClockToUtc("Pacific/Auckland", "2026-08-12", "08:00").toISOString(),
    "2026-08-11T20:00:00.000Z",
  );
});

Deno.test("localWallClockToUtc survives a DST transition", () => {
  // Europe moves its clocks on 2026-10-25. An evening card the night before and
  // the night after must both land at the right wall clock.
  assertEquals(
    localWallClockToUtc("Europe/Paris", "2026-10-24", "19:30").toISOString(),
    "2026-10-24T17:30:00.000Z",
  );
  assertEquals(
    localWallClockToUtc("Europe/Paris", "2026-10-26", "19:30").toISOString(),
    "2026-10-26T18:30:00.000Z",
  );
});

Deno.test("an unknown timezone throws instead of quietly becoming UTC (R7)", () => {
  assertThrows(
    () => localWallClockToUtc("Mars/Olympus", "2026-08-12", "19:30"),
    Error,
    "unknown timezone",
  );
});

Deno.test("normalizeHHMM accepts the three shapes the DB emits, refuses the rest", () => {
  assertEquals(normalizeHHMM("8:00"), "08:00");
  assertEquals(normalizeHHMM("08:00"), "08:00");
  assertEquals(normalizeHHMM("08:00:00"), "08:00");
  assertThrows(() => normalizeHHMM("8h"), Error, "invalid local time");
  assertThrows(() => normalizeHHMM("25:00"), Error, "out-of-range");
});

// ---------------------------------------------------------------------------
// Parsing at the boundary
// ---------------------------------------------------------------------------

Deno.test("parseUpcomingEvent refuses an unparseable date or kind (R7)", () => {
  assertThrows(
    () => parseUpcomingEvent({ id: "x", local_date: "12/08/2026", kind: "social" }, "upcoming_context"),
    Error,
    "invalid local_date",
  );
  assertThrows(
    () => parseUpcomingEvent({ id: "x", local_date: "2026-08-12", kind: "brunch" }, "upcoming_context"),
    Error,
    "unknown trigger context",
  );
  const parsed = parseUpcomingEvent(
    { id: "x", local_date: "2026-08-12", slot_key: "", kind: "social" },
    "upcoming_context",
  );
  assertEquals(parsed.slot_key, null);
  assertEquals(parsed.source, "upcoming_context");
});

Deno.test("flattenArmableCard reads the joined template and refuses a missing lead", () => {
  const flat = flattenArmableCard({
    id: "c",
    user_id: "u",
    template_id: "t",
    status: "active",
    card_templates: {
      trigger_slot_key: "dinner",
      trigger_contexts: ["restaurant"],
      trigger_time_bucket: "evening",
      arm_lead_minutes: 180,
    },
  });
  assertEquals(flat.trigger_slot_key, "dinner");
  assertEquals(flat.trigger_contexts, ["restaurant"]);
  assertEquals(flat.arm_lead_minutes, 180);

  assertThrows(
    () =>
      flattenArmableCard({
        id: "c",
        user_id: "u",
        template_id: "t",
        status: "active",
        card_templates: { trigger_contexts: [], trigger_time_bucket: "any" },
      }),
    Error,
    "no usable arm_lead_minutes",
  );
});

// ---------------------------------------------------------------------------
// Cardinality — the phantom-commit class, applied to armings
// ---------------------------------------------------------------------------

Deno.test("N events x M matching cards produce exactly N*M armings, all distinct", () => {
  const events = [
    event({ id: "e1", local_date: "2026-08-12", slot_key: "dinner" }),
    event({ id: "e2", local_date: "2026-08-13", slot_key: "lunch", kind: "work" }),
  ];
  const cards = [
    card({ id: "c1", trigger_contexts: [] }),
    card({ id: "c2", trigger_contexts: [] }),
  ];
  const { armings } = planCardArmings({
    timezone: "Europe/Paris",
    now: new Date("2026-08-12T06:00:00Z"),
    events,
    cards,
    slotDefaultLocalTimes: SLOT_TIMES,
  });
  assertEquals(armings.length, 4);
  const keys = new Set(
    armings.map((a) =>
      [a.student_card_id, a.trigger_kind, a.trigger_ref_id, a.local_date, a.slot_key]
        .join("|")
    ),
  );
  // The set must match the unique index of card_armings exactly: if two plans
  // collapsed onto one key, one card would be silently dropped at the upsert.
  assertEquals(keys.size, 4);
});

Deno.test("planCardArmings reads no clock of its own", async () => {
  const source = await Deno.readTextFile(new URL("./arming.ts", import.meta.url));
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert(!code.includes("Date.now"), "arming.ts must take `now` as an argument");
  assert(!code.includes("fetch("), "arming.ts must not perform I/O");
});

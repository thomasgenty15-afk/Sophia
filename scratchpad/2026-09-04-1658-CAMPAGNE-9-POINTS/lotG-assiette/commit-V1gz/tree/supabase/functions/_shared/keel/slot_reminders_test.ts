// KEEL W4.6 — slot reminders + Sunday digest. Pure module, pure tests.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  dayTokenForLocalDate,
  deriveKeelDayPlan,
  isKeelComplianceEventContext,
  isKeelSlotReminderEventContext,
  isKeelSundayDigestEventContext,
  KEEL_SLOT_REMINDER_ORIGIN,
  KEEL_SLOT_REMINDER_PURPOSE,
  KEEL_SUNDAY_DIGEST_EVENT_CONTEXT,
  KEEL_SUNDAY_DIGEST_PURPOSE,
  type KeelCommitmentRow,
  keelSlotReminderEventContext,
  isSlotReminderDueToday,
  nextWeekStartDate,
  parseKeelSlotReminderEventContext,
} from "./slot_reminders.ts";
import { evaluateRestrictionGuard } from "./restriction_guard.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = "11111111-1111-4111-8111-111111111111";
const PLAN_VERSION = "22222222-2222-4222-8222-222222222222";

// 2026-07-29 is a Wednesday, 2026-08-02 is a Sunday.
const WEDNESDAY = "2026-07-29";
const SUNDAY = "2026-08-02";

function commitment(
  over: Partial<KeelCommitmentRow> & { id: string; title: string },
): KeelCommitmentRow {
  return {
    student_instruction: null,
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    scheduled_days: null,
    required_days_per_week: 7,
    priority: "core",
    status: "active",
    auto_source: null,
    ...over,
  };
}

const D3 = commitment({
  id: "c-d3",
  title: "Vitamin D3 5000 IU",
  slot_key: "breakfast",
  priority: "core",
  student_instruction: "With your first meal, alongside a fat source.",
});
const LUNCH_VEG = commitment({
  id: "c-veg",
  title: "Cruciferous veg 2 servings",
  slot_key: "lunch",
  priority: "secondary",
});
const MAGNESIUM = commitment({
  id: "c-mag",
  title: "Magnesium glycinate 400 mg",
  slot_key: "before_bed",
  priority: "secondary",
});

function derive(
  over: Partial<Parameters<typeof deriveKeelDayPlan>[0]> = {},
) {
  return deriveKeelDayPlan({
    userId: USER,
    planVersionId: PLAN_VERSION,
    localDate: WEDNESDAY,
    weekStartsOn: "mon",
    commitments: [D3, LUNCH_VEG, MAGNESIUM],
    studentFirstName: "Alex",
    locale: "en",
    restriction: null,
    ...over,
  });
}

/**
 * A REAL raised flag, produced by the guard from a snapshot — not a hand-built
 * object. A test that fabricates the result proves the branch, not the floor.
 */
function raisedFlag(asOf = WEDNESDAY) {
  const result = evaluateRestrictionGuard({
    as_of_local_date: asOf,
    weekly_outcomes: [],
    energy_days: [],
    texts: [
      {
        source: "turn_message",
        text: "I'll skip lunch tomorrow to make up for it",
        content_locale: "en",
      },
    ],
  });
  assertEquals(result.restriction_flag, true);
  return result;
}

// ---------------------------------------------------------------------------
// Tokens (R1/R7)
// ---------------------------------------------------------------------------

Deno.test("event_context tokens round-trip and stay ASCII snake_case", () => {
  assertEquals(keelSlotReminderEventContext("lunch"), "keel_slot_reminder:lunch");
  assertEquals(parseKeelSlotReminderEventContext("keel_slot_reminder:lunch"), "lunch");
  assertEquals(parseKeelSlotReminderEventContext("action_evening_review_v2"), null);
  assert(isKeelSlotReminderEventContext("keel_slot_reminder:dinner"));
  assert(isKeelSundayDigestEventContext(KEEL_SUNDAY_DIGEST_EVENT_CONTEXT));
  assert(isKeelComplianceEventContext("keel_slot_reminder:dinner"));
  assert(isKeelComplianceEventContext(KEEL_SUNDAY_DIGEST_EVENT_CONTEXT));
  assert(!isKeelComplianceEventContext("morning_nudge_v2"));
});

Deno.test("R7 — a corrupted slot inside the prefix throws, it does not answer null", () => {
  assertThrows(
    () => parseKeelSlotReminderEventContext("keel_slot_reminder:gouter"),
    Error,
    "Unknown slot_key",
  );
  assertThrows(() => keelSlotReminderEventContext("brunch"), Error, "Unknown slot_key");
});

Deno.test("dayTokenForLocalDate + nextWeekStartDate are pure calendar math", () => {
  assertEquals(dayTokenForLocalDate("2026-07-29"), "wed");
  assertEquals(dayTokenForLocalDate("2026-08-02"), "sun");
  assertEquals(dayTokenForLocalDate("1970-01-01"), "thu");
  // The digest announces the week that has NOT started yet.
  assertEquals(nextWeekStartDate(SUNDAY, "mon"), "2026-08-03");
  // A Sunday-start tenant looks a full week ahead, never at the day itself.
  assertEquals(nextWeekStartDate(SUNDAY, "sun"), "2026-08-09");
  assertThrows(() => dayTokenForLocalDate("29/07/2026"), Error, "YYYY-MM-DD");
  assertThrows(() => dayTokenForLocalDate("2026-02-30"), Error, "real calendar date");
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

Deno.test("only nominal slot commitments with a window are remindable", () => {
  assert(isSlotReminderDueToday(D3, "wed"));
  // opportunistic: the evaluation is born from a fact; nudging it manufactures
  // the false `missed` the contract refuses.
  assert(!isSlotReminderDueToday(
    commitment({ id: "x", title: "x", slot_kind: "opportunistic" }),
    "wed",
  ));
  assert(!isSlotReminderDueToday(
    commitment({ id: "x", title: "x", status: "paused" }),
    "wed",
  ));
  assert(!isSlotReminderDueToday(
    commitment({ id: "x", title: "x", anchor_kind: "free", slot_key: null }),
    "wed",
  ));
  // Silent device feed: nothing for the student to do (R6 auto_source branch).
  assert(!isSlotReminderDueToday(
    commitment({ id: "x", title: "x", auto_source: "oura" }),
    "wed",
  ));
  // A real slot with no nominal local time has no window, so no reminder.
  assert(!isSlotReminderDueToday(
    commitment({ id: "x", title: "x", slot_key: "any_time" }),
    "wed",
  ));
});

Deno.test("scheduled_days pins the day; null means daily; unknown token throws (R7)", () => {
  const monFri = commitment({
    id: "x",
    title: "Protocol breakfast",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
  });
  assert(isSlotReminderDueToday(monFri, "wed"));
  assert(!isSlotReminderDueToday(monFri, "sat"));
  assert(isSlotReminderDueToday(commitment({ id: "y", title: "y" }), "sat"));
  // The "dimanche" bug class: a legacy French token is normalized on INPUT by
  // parseDayToken (never persisted), so it matches its real day and NOT another.
  // The failure it replaced was returning [] and dropping the day in silence.
  const french = commitment({ id: "z", title: "z", scheduled_days: ["mercredi"] });
  assert(isSlotReminderDueToday(french, "wed"));
  assert(!isSlotReminderDueToday(french, "sat"));
  // A token that maps to nothing at all still throws.
  assertThrows(
    () =>
      isSlotReminderDueToday(
        commitment({ id: "z", title: "z", scheduled_days: ["someday"] }),
        "sat",
      ),
    Error,
    "Unknown day token",
  );
});

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

Deno.test("one reminder per SLOT, in slot order, never one per commitment", () => {
  const plan = derive({
    commitments: [
      LUNCH_VEG,
      D3,
      commitment({
        id: "c-oats",
        title: "Protocol breakfast (eggs+oats+berries)",
        slot_key: "breakfast",
        priority: "secondary",
      }),
      MAGNESIUM,
    ],
  });
  const reminders = plan.items.filter((i) => i.kind === "slot_reminder");
  assertEquals(reminders.length, 3);
  assertEquals(
    reminders.map((i) => i.eventContext),
    [
      "keel_slot_reminder:breakfast",
      "keel_slot_reminder:lunch",
      "keel_slot_reminder:before_bed",
    ],
  );
  const breakfast = reminders[0];
  // Two commitments, ONE message, core first.
  assertEquals(breakfast.messagePayload.commitment_count, 2);
  assertEquals(breakfast.messagePayload.commitment_ids, ["c-d3", "c-oats"]);
  assert(breakfast.draftMessage.startsWith("Breakfast — on your plan today:"));
  assert(breakfast.draftMessage.includes("Vitamin D3 5000 IU — With your first meal"));
  assertEquals(breakfast.origin, KEEL_SLOT_REMINDER_ORIGIN);
  assertEquals(breakfast.purpose, KEEL_SLOT_REMINDER_PURPOSE);
});

Deno.test("a reminder carries no score, no percentage, no streak", () => {
  for (const item of derive().items) {
    assert(!/\d+\s?%/.test(item.draftMessage), item.draftMessage);
    assert(!/\bstreak\b/i.test(item.draftMessage), item.draftMessage);
    assert(!/\badherence\b/i.test(item.draftMessage), item.draftMessage);
  }
});

Deno.test("reminder times are stable across passes (idempotency key)", () => {
  const a = derive().items.map((i) => `${i.eventContext}@${i.localTimeHHMM}`);
  const b = derive().items.map((i) => `${i.eventContext}@${i.localTimeHHMM}`);
  assertEquals(a, b);
});

Deno.test("each reminder falls inside its own slot window", () => {
  const bounds: Record<string, [string, string]> = {
    "keel_slot_reminder:breakfast": ["07:30", "08:00"],
    "keel_slot_reminder:lunch": ["11:50", "12:45"],
    "keel_slot_reminder:before_bed": ["22:00", "22:45"],
  };
  for (const item of derive().items) {
    const window = bounds[item.eventContext];
    if (!window) continue;
    assert(item.localTimeHHMM >= window[0], `${item.eventContext} ${item.localTimeHHMM}`);
    assert(item.localTimeHHMM <= window[1], `${item.eventContext} ${item.localTimeHHMM}`);
  }
});

Deno.test("the Sunday digest lands on Sunday only, and is the elicitation point", () => {
  assertEquals(
    derive().items.filter((i) => i.kind === "sunday_digest").length,
    0,
  );
  const sunday = derive({ localDate: SUNDAY });
  const digest = sunday.items.find((i) => i.kind === "sunday_digest");
  assert(digest);
  assertEquals(digest!.eventContext, KEEL_SUNDAY_DIGEST_EVENT_CONTEXT);
  assertEquals(digest!.purpose, KEEL_SUNDAY_DIGEST_PURPOSE);
  assertEquals(digest!.messagePayload.week_start_date, "2026-08-03");
  assertEquals(digest!.messagePayload.elicits, "planned_deviation");
  // Non-blocking by construction: nothing to confirm, nothing to validate.
  assertEquals(digest!.messagePayload.blocking, false);
  assert(digest!.draftMessage.includes("nothing to confirm or validate"));
  assert(digest!.draftMessage.includes("off-plan"));
  assertEquals((digest!.messagePayload.week_dates as string[]).length, 7);
  assertEquals(
    (digest!.messagePayload.week_dates as string[])[6],
    "2026-08-09",
  );
});

// ---------------------------------------------------------------------------
// THE PROOF — a flagged student receives no compliance reminder
// ---------------------------------------------------------------------------

Deno.test(
  "restriction flag raised => ZERO slot reminders and ZERO digest, on the day that has both",
  () => {
    const flagged = raisedFlag(SUNDAY);
    const plan = derive({ localDate: SUNDAY, restriction: flagged });

    // Without the flag this exact day produces reminders AND the digest.
    const unflagged = derive({ localDate: SUNDAY, restriction: null });
    assert(unflagged.items.length > 0);
    assert(unflagged.items.some((i) => i.kind === "slot_reminder"));
    assert(unflagged.items.some((i) => i.kind === "sunday_digest"));

    assertEquals(plan.items.length, 0);
    assertEquals(plan.restrictionFlag, true);
    assertEquals(plan.suppressedSurfaces.sort(), [
      "compliance_reminder",
      "plan_pressure_nudge",
    ]);
    // The slots are still REPORTED as eligible: the plan did not change, the
    // pressure did. The coach's escalation needs to say what was suspended.
    assert(plan.eligibleSlots.length > 0);
  },
);

Deno.test("a clear guard result suppresses nothing", () => {
  const clear = evaluateRestrictionGuard({
    as_of_local_date: WEDNESDAY,
    weekly_outcomes: [],
    energy_days: [],
    texts: [
      { source: "turn_message", text: "lunch was great", content_locale: "en" },
    ],
  });
  assertEquals(clear.restriction_flag, false);
  const plan = derive({ restriction: clear });
  assertEquals(plan.suppressedSurfaces, []);
  assertEquals(plan.items.length, 3);
});

Deno.test("no active commitment => no digest at all (never an empty week message)", () => {
  const plan = derive({
    localDate: SUNDAY,
    commitments: [commitment({ id: "p", title: "Paused line", status: "paused" })],
  });
  assertEquals(plan.items.length, 0);
});

/**
 * evaluate-adherence-v1 — the snapshot frontier.
 *
 * These tests cover the conversions the evaluator REFUSES to do for itself:
 * jsonb extraction (R5), timezone resolution, and the week denominator. They
 * are the reason `snapshot.ts` is a module and not a closure inside `index.ts`.
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  dayTokenOf,
  extractCommitmentId,
  extractSwapPolicy,
  identityKey,
  localPartsOf,
  toCommitment,
  toEvent,
  weekDatesFrom,
  weekStartFor,
} from "./snapshot.ts";

Deno.test("dayTokenOf: real calendar dates, and a loud refusal otherwise", () => {
  assertEquals(dayTokenOf("2026-07-27"), "mon");
  assertEquals(dayTokenOf("2026-08-02"), "sun");
  assertThrows(() => dayTokenOf("27/07/2026"), Error, "must be YYYY-MM-DD");
});

Deno.test("weekStartFor: week_starts_on is a TENANT setting and moves the denominator", () => {
  // Thursday 2026-07-30
  assertEquals(weekStartFor("2026-07-30", "mon"), "2026-07-27");
  assertEquals(weekStartFor("2026-07-30", "sun"), "2026-07-26");
  assertEquals(weekStartFor("2026-07-30", "thu"), "2026-07-30");
  // R7: an unknown token throws instead of silently defaulting to Monday.
  assertThrows(() => weekStartFor("2026-07-30", "lundi_matin"), Error);
  assertEquals(weekDatesFrom("2026-07-27").length, 7);
  assertEquals(weekDatesFrom("2026-07-27")[6], "2026-08-02");
});

Deno.test("weekDatesFrom crosses a month and a DST boundary as bare calendar dates", () => {
  // A calendar week is 7 calendar dates, whatever the clocks do inside it:
  // doing this arithmetic on timestamps is how a 23-hour day eats a Sunday.
  assertEquals(weekDatesFrom("2026-10-26"), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
});

Deno.test("localPartsOf: the student's local day, not the server's", () => {
  // 2026-07-28T02:30:00Z is still 2026-07-27 in New York, and already
  // 2026-07-28 in Auckland. Getting this wrong files a dinner on the wrong day.
  assertEquals(localPartsOf("2026-07-28T02:30:00Z", "America/New_York"), {
    localDate: "2026-07-27",
    localTime: "22:30",
  });
  assertEquals(localPartsOf("2026-07-28T02:30:00Z", "Pacific/Auckland"), {
    localDate: "2026-07-28",
    localTime: "14:30",
  });
  assertEquals(localPartsOf("2026-07-28T00:00:00Z", "UTC"), {
    localDate: "2026-07-28",
    localTime: "00:00",
  });
  assertThrows(() => localPartsOf("yesterday", "UTC"), Error, "not a timestamp");
});

Deno.test("R5 frontier: extractSwapPolicy reads content jsonb HERE and nowhere else", () => {
  assertEquals(extractSwapPolicy(null), null);
  assertEquals(extractSwapPolicy({}), null);
  assertEquals(extractSwapPolicy({ swap_policy: {} }), null);
  assertEquals(
    extractSwapPolicy({ swap_policy: { class_equivalent: true } }),
    { class_equivalent: true, allowed_groups: null },
  );
  assertEquals(
    extractSwapPolicy({ swap_policy: { allowed_groups: ["citrus", "berries"] } }),
    { class_equivalent: false, allowed_groups: ["citrus", "berries"] },
  );
  // A shape we do not understand must NOT become "swaps allowed": the strictest
  // reading wins, and `autonomy` still governs downstream.
  assertEquals(extractSwapPolicy({ swap_policy: { mode: "tout est permis" } }), null);
  assertEquals(extractSwapPolicy({ swap_policy: { class_equivalent: "yes" } }), null);
});

Deno.test("extractCommitmentId: an explicit binding, or nothing", () => {
  assertEquals(extractCommitmentId({ commitment_id: "abc" }), "abc");
  assertEquals(extractCommitmentId({ commitment_id: "  " }), null);
  assertEquals(extractCommitmentId({ commitment_id: 42 }), null);
  assertEquals(extractCommitmentId(null), null);
  assertEquals(extractCommitmentId({ food: "salmon" }), null);
});

Deno.test("toCommitment: columns in, and NOT ONE byte of `content` out (R5)", () => {
  const mapped = toCommitment({
    id: "c1",
    plan_version_id: "p1",
    user_id: "u1",
    polarity: "do",
    anchor_kind: "slot",
    slot_key: "breakfast",
    clock_local: null,
    tolerance_minutes: null,
    window_start_local: "07:00",
    window_end_local: "09:30",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: "5000",
    target_max: null,
    tolerance_pct: "10",
    substance_ref: "vitamin_d3",
    food_group_ref: null,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    evaluation_grain: "occasion",
    slot_kind: "nominal",
    scheduled_days: ["mon", "tue"],
    required_days_per_week: 7,
    expected_occasions_per_day: 1,
    priority: "core",
    autonomy: "swap_within_policy",
    flex_eligible: false,
    status: "active",
    // display material the evaluator must never see, plus the ONE key we lift
    content: {
      recipe: "60 g oats + 150 g yogurt",
      coach_note: "explain the timing to her",
      swap_policy: { class_equivalent: true },
    },
    content_locale: "en",
    title: "Vitamin D3 5000 IU",
  });

  assertEquals(mapped.substanceRef, "vitamin_d3");
  assertEquals(mapped.targetMin, 5000); // numeric strings from PostgREST parsed
  assertEquals(mapped.tolerancePct, 10);
  assertEquals(mapped.swapPolicy, { class_equivalent: true, allowed_groups: null });
  // The evaluator's input type has no `content`, no `title`, no locale: nothing
  // a human reads can reach a branch.
  assertEquals("content" in mapped, false);
  assertEquals("title" in mapped, false);
  assertEquals("content_locale" in mapped, false);
});

Deno.test("toCommitment: R7 on scheduled_days — a French weekday fails at the frontier", () => {
  const row = {
    id: "c1",
    plan_version_id: "p1",
    user_id: "u1",
    polarity: "do",
    anchor_kind: "free",
    measure: "count",
    target_op: "any",
    evidence_kind: "self_report",
    evaluation_grain: "day",
    priority: "core",
    autonomy: "strict",
    status: "active",
    content: {},
    scheduled_days: ["mon", "mercredi"],
  };
  // The alias table normalizes it rather than dropping it silently...
  assertEquals(toCommitment(row).scheduledDays, ["mon", "wed"]);
  // ...but an actual unknown token throws instead of yielding [].
  assertThrows(
    () => toCommitment({ ...row, scheduled_days: ["mon", "someday"] }),
    Error,
    "Unknown day token",
  );
});

Deno.test("toEvent: the stored local_date wins, the timezone fills the clock", () => {
  const e = toEvent({
    id: "e1",
    occurred_at: "2026-07-28T02:30:00Z",
    local_date: "2026-07-27",
    slot_key: "dinner",
    source: "photo",
    quantity: "1.5",
    unit: "g",
    substance_ref: "omega3_epa_dha",
    food_group_ref: null,
    evidence_weight: "1",
    portion_band: "large",
    recognized: { commitment_id: "c9", label: "saumon grille", portion_band: "small" },
  }, "America/New_York");

  assertEquals(e.localDate, "2026-07-27");
  assertEquals(e.localTime, "22:30");
  assertEquals(e.quantity, 1.5);
  assertEquals(e.commitmentId, "c9");
  assertEquals(e.evidenceWeight, 1);
  // The COLUMN, not the jsonb copy. The row deliberately disagrees with itself
  // here: `recognized.portion_band` says "small" and the column says "large".
  // Reading the jsonb would be the R5 breach migration 20260727220000 exists to
  // remove, so this assertion is the frontier, not a formality.
  assertEquals(e.portionBand, "large");
});

Deno.test("toEvent: no portion_band column => null, never a band invented from jsonb", () => {
  const e = toEvent({
    id: "e2",
    occurred_at: "2026-07-27T12:00:00Z",
    local_date: "2026-07-27",
    slot_key: "lunch",
    source: "quick_tap",
    quantity: "1",
    unit: "serving",
    substance_ref: null,
    food_group_ref: "non_starchy_veg",
    evidence_weight: "0.4",
    recognized: { portion_band: "large" },
  }, "Europe/Paris");
  assertEquals(e.portionBand, null);
});

Deno.test("identityKey mirrors the FUNCTIONAL unique index (slot_key -> 'no_slot')", () => {
  assertEquals(identityKey("c1", "2026-07-27", null), "c1|2026-07-27|no_slot");
  assertEquals(identityKey("c1", "2026-07-27", "lunch"), "c1|2026-07-27|lunch");
  // The whole point: two day-grain rows of the same commitment on the same date
  // collide instead of duplicating (Postgres treats NULLs as distinct).
  assertEquals(
    identityKey("c1", "2026-07-27", null),
    identityKey("c1", "2026-07-27", null),
  );
});

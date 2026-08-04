import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  randomEveningReviewLocalTime,
  randomLateAfternoonNudgeLocalTime,
  randomMorningEncouragementLocalTime,
  randomNightPrepLocalTime,
  randomSlotReminderLocalTime,
  randomSundayDigestLocalTime,
  SLOT_REMINDER_WINDOW_KEYS,
  slotReminderWindow,
} from "./proactive_checkin_timing.ts";
import { SLOT_VOCABULARY } from "./keel/tokens.ts";

function minutes(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

Deno.test("randomMorningEncouragementLocalTime is stable and stays between 08:00 and 10:00", () => {
  const first = randomMorningEncouragementLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });
  const second = randomMorningEncouragementLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });

  assertEquals(first, second);
  const value = minutes(first);
  if (value < minutes("08:00") || value > minutes("10:00")) {
    throw new Error(`morning time out of range: ${first}`);
  }
});

Deno.test("randomMorningEncouragementLocalTime varies across users or dates", () => {
  const values = new Set([
    randomMorningEncouragementLocalTime({
      userId: "user-a",
      localDate: "2026-05-20",
    }),
    randomMorningEncouragementLocalTime({
      userId: "user-b",
      localDate: "2026-05-20",
    }),
    randomMorningEncouragementLocalTime({
      userId: "user-a",
      localDate: "2026-05-21",
    }),
  ]);

  if (values.size < 2) {
    throw new Error("expected morning encouragement time variance");
  }
});

Deno.test("randomEveningReviewLocalTime stays between 19:00 and 21:30", () => {
  const value = randomEveningReviewLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });
  const numeric = minutes(value);

  if (numeric < minutes("19:00") || numeric > minutes("21:30")) {
    throw new Error(`evening review time out of range: ${value}`);
  }
});

// ---------------------------------------------------------------------------
// KEEL W4.6 — slot reminder windows
// ---------------------------------------------------------------------------

const KEEL_USER = "11111111-1111-4111-8111-111111111111";
const KEEL_DATE = "2026-07-29";

Deno.test("every slot of the KEEL vocabulary is answered — no silent undefined", () => {
  // The two lists must stay identical: adding a slot to slot_vocabulary without
  // deciding whether it is remindable is exactly the divergence R7 forbids.
  assertEquals([...SLOT_REMINDER_WINDOW_KEYS].sort(), [...SLOT_VOCABULARY].sort());
  for (const slot of SLOT_VOCABULARY) slotReminderWindow(slot);
});

Deno.test("R7 — an unknown slot throws instead of returning undefined", () => {
  assertThrows(() => slotReminderWindow("brunch"), Error, "unknown slot_key");
  assertThrows(
    () =>
      randomSlotReminderLocalTime({
        userId: KEEL_USER,
        localDate: KEEL_DATE,
        slotKey: "brunch",
      }),
    Error,
    "unknown slot_key",
  );
});

Deno.test("slots without a nominal local time have a NAMED absence, not a window", () => {
  for (const slot of ["pre_workout", "post_workout", "any_meal", "any_time"]) {
    assertEquals(slotReminderWindow(slot), null);
    assertThrows(
      () =>
        randomSlotReminderLocalTime({
          userId: KEEL_USER,
          localDate: KEEL_DATE,
          slotKey: slot,
        }),
      Error,
      "no nominal",
    );
  }
});

Deno.test("the 10:00-16:45 proactive hole is covered — snack_am, lunch, snack_pm", () => {
  // Before W4.6 nothing could be scheduled between the morning window (ends
  // 10:00) and the late-afternoon nudge (starts 16:45): the three daytime meal
  // slots of every nutrition plan sat in a blind spot.
  const covered = ["snack_am", "lunch", "snack_pm"]
    .map((slot) => slotReminderWindow(slot)!)
    .sort((a, b) => minutes(a.startLocalTime) - minutes(b.startLocalTime));
  assertEquals(covered[0].startLocalTime, "10:00");
  assertEquals(covered[covered.length - 1].endLocalTime, "16:45");
});

Deno.test("KEEL windows stay >= 60 min apart — the min-gap trigger invariant", () => {
  // `trg_scheduled_checkins_enforce_min_gap_1h` REWRITES scheduled_for when two
  // active checkins of the same user sit less than an hour apart. Two costs:
  // a lunch reminder pushed to 13:30 is not late, it is wrong; and the rewrite
  // breaks the (user, event_context, scheduled_for) key, which produced DUPLICATE
  // reminders (probed: lunch at 12:00 and 13:00 from one derivation run twice).
  // provision_day.ts closes the duplicate class by reading back; this test keeps
  // KEEL from causing the shift in the first place.
  const windows = [
    ...SLOT_VOCABULARY
      .map((slot) => slotReminderWindow(slot))
      .filter((window): window is { startLocalTime: string; endLocalTime: string } =>
        window !== null
      ),
    { startLocalTime: "20:00", endLocalTime: "20:30" }, // KEEL Sunday digest
  ].sort((a, b) => minutes(a.startLocalTime) - minutes(b.startLocalTime));
  for (let i = 1; i < windows.length; i++) {
    const gap = minutes(windows[i].startLocalTime) -
      minutes(windows[i - 1].endLocalTime);
    assert(
      gap >= 60,
      `only ${gap} min between ${windows[i - 1].startLocalTime}-` +
        `${windows[i - 1].endLocalTime} and ${windows[i].startLocalTime}-` +
        `${windows[i].endLocalTime}: the min-gap trigger would shift one of them`,
    );
  }
});

Deno.test("slot reminder times are stable and inside their window", () => {
  for (const slot of SLOT_VOCABULARY) {
    const window = slotReminderWindow(slot);
    if (window === null) continue;
    const first = randomSlotReminderLocalTime({
      userId: KEEL_USER,
      localDate: KEEL_DATE,
      slotKey: slot,
    });
    const second = randomSlotReminderLocalTime({
      userId: KEEL_USER,
      localDate: KEEL_DATE,
      slotKey: slot,
    });
    // Same input, same minute: this IS the upsert's idempotency key.
    assertEquals(first, second);
    assert(minutes(first) >= minutes(window.startLocalTime), `${slot} ${first}`);
    assert(minutes(first) <= minutes(window.endLocalTime), `${slot} ${first}`);
  }
});

Deno.test("the Sunday digest sits between the dinner and bedtime reminders", () => {
  const value = randomSundayDigestLocalTime({
    userId: KEEL_USER,
    localDate: "2026-08-02",
  });
  assert(minutes(value) >= minutes("20:00"));
  assert(minutes(value) <= minutes("20:30"));
  // 18:30 is the legacy weekly bilan; the digest must never collide with it.
  assert(value !== "18:30");
});

Deno.test("the four legacy windows are untouched by W4.6", () => {
  const late = randomLateAfternoonNudgeLocalTime({
    userId: KEEL_USER,
    localDate: KEEL_DATE,
  });
  assert(minutes(late) >= minutes("16:45") && minutes(late) <= minutes("17:45"));
  const night = randomNightPrepLocalTime({
    userId: KEEL_USER,
    localDate: KEEL_DATE,
  });
  assert(minutes(night) >= minutes("21:35") && minutes(night) <= minutes("22:00"));
});

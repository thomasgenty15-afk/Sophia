import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  buildExpectedSnapshot,
  dayTokenForLocalDate,
  localDateInTimezone,
  parsePhasePlan,
  parseProvisionCommitment,
  parseProvisionPlanVersion,
  planWeekNumber,
  type ProvisionCommitment,
  type ProvisionPlanVersion,
  selectDaySeedRows,
  SWEEP_WINDOW_END_HOUR,
  SWEEP_WINDOW_START_HOUR,
  tallySkips,
} from "./provisioning.ts";
import {
  classifySweepTimezones,
  isSweepWindow,
  PROVISIONING_WINDOW_END_HOUR,
  PROVISIONING_WINDOW_START_HOUR,
} from "./sweep_gate.ts";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const STUDENT = "11111111-1111-1111-1111-111111111111";
const VERSION = "22222222-2222-2222-2222-222222222222";

function planVersion(
  overrides: Partial<ProvisionPlanVersion> = {},
): ProvisionPlanVersion {
  return {
    id: VERSION,
    studentId: STUDENT,
    timezone: "Europe/Paris",
    anchorWeekStart: "2026-07-27", // a Monday
    durationWeeks: 12,
    weekStartsOn: "mon",
    phasePlan: [],
    ...overrides,
  };
}

let commitmentSeq = 0;
function commitment(
  overrides: Partial<ProvisionCommitment> = {},
): ProvisionCommitment {
  commitmentSeq += 1;
  return {
    id: `commitment-${commitmentSeq}`,
    planVersionId: VERSION,
    userId: STUDENT,
    status: "active",
    slotKind: "nominal",
    evaluationGrain: "occasion",
    slotKey: "breakfast",
    scheduledDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    phaseId: null,
    polarity: "do",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    targetMax: null,
    tolerancePct: 10,
    substanceRef: "vitamin_d3",
    foodGroupRef: null,
    autoSource: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

Deno.test("dayTokenForLocalDate — the 7 tokens, ASCII English (R1)", () => {
  assertEquals(dayTokenForLocalDate("2026-07-27"), "mon");
  assertEquals(dayTokenForLocalDate("2026-07-28"), "tue");
  assertEquals(dayTokenForLocalDate("2026-08-01"), "sat");
  assertEquals(dayTokenForLocalDate("2026-08-02"), "sun");
});

Deno.test("planWeekNumber — 1-based, inclusive, anchored on the first week", () => {
  assertEquals(planWeekNumber("2026-07-27", "2026-07-27"), 1);
  assertEquals(planWeekNumber("2026-07-27", "2026-08-02"), 1); // Sunday of W1
  assertEquals(planWeekNumber("2026-07-27", "2026-08-03"), 2); // Monday of W2
  assertEquals(planWeekNumber("2026-07-27", "2026-08-24"), 5);
  // Before the anchor: 0 or negative, which the caller reads as not started.
  assertEquals(planWeekNumber("2026-07-27", "2026-07-26"), 0);
  assertEquals(planWeekNumber("2026-07-27", "2026-07-20"), 0);
  assertEquals(planWeekNumber("2026-07-27", "2026-07-19"), -1);
});

Deno.test("planWeekNumber — no DST drift across a spring-forward week", () => {
  // Europe/Paris springs forward on 2026-03-29. Whole-UTC-day arithmetic on two
  // `date` columns must not lose or gain a day across it.
  assertEquals(planWeekNumber("2026-03-23", "2026-03-29"), 1);
  assertEquals(planWeekNumber("2026-03-23", "2026-03-30"), 2);
});

Deno.test("localDateInTimezone — the day differs by timezone at the same instant", () => {
  // 2026-07-28T02:30:00Z: already the 28th in Paris, still the 27th in NY.
  const now = new Date("2026-07-28T02:30:00Z");
  assertEquals(localDateInTimezone("Europe/Paris", now), "2026-07-28");
  assertEquals(localDateInTimezone("America/New_York", now), "2026-07-27");
  assertEquals(localDateInTimezone("Pacific/Auckland", now), "2026-07-28");
});

Deno.test("localDateInTimezone — R7: an unusable timezone throws, never defaults to Paris", () => {
  // The legacy helper (_shared/action_occurrences.ts) silently resolves to
  // Europe/Paris here. That silent fallback is the whole reason this one exists.
  const now = new Date("2026-07-28T02:30:00Z");
  assertThrows(() => localDateInTimezone("GMT+1", now));
  assertThrows(() => localDateInTimezone("", now));
  assertThrows(() => localDateInTimezone("Not/AZone", now));
});

// ---------------------------------------------------------------------------
// Timezone windows
// ---------------------------------------------------------------------------

Deno.test("windows — provisioning opens the day, sweep closes it, no overlap", () => {
  assertEquals(PROVISIONING_WINDOW_START_HOUR, 0);
  assertEquals(PROVISIONING_WINDOW_END_HOUR, 1);
  assertEquals(SWEEP_WINDOW_START_HOUR, 23);
  assertEquals(SWEEP_WINDOW_END_HOUR, 24);
});

Deno.test("isSweepWindow — fires once per local day, per timezone", () => {
  // 22:30 Paris -> no; 23:30 Paris -> yes.
  assertEquals(isSweepWindow("Europe/Paris", new Date("2026-07-27T20:30:00Z")), false);
  assertEquals(isSweepWindow("Europe/Paris", new Date("2026-07-27T21:30:00Z")), true);
  // Same instant, New York is at 17:30 -> not closing.
  assertEquals(
    isSweepWindow("America/New_York", new Date("2026-07-27T21:30:00Z")),
    false,
  );
});

Deno.test("sweep gate — half-hour and quarter-hour offsets are covered", () => {
  // The reason the gate reads the local HOUR and not the local minute:
  // Asia/Kolkata (+5:30) is at 23:25 when the ':55' cron ticks at 17:55Z, and
  // Pacific/Chatham (+12:45) at 23:10 when it ticks at 10:55Z. A minute-based
  // gate would never have fired for either of them, ever.
  assertEquals(isSweepWindow("Asia/Kolkata", new Date("2026-07-27T17:55:00Z")), true);
  assertEquals(isSweepWindow("Asia/Kathmandu", new Date("2026-07-27T17:55:00Z")), true);
  assertEquals(
    isSweepWindow("Pacific/Chatham", new Date("2026-07-27T10:55:00Z")),
    true,
  );
});

Deno.test("classifySweepTimezones — one bad zone skips its own row, not the fleet", () => {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const result = classifySweepTimezones(
      ["Europe/Paris", "GMT+1", "America/New_York", "Europe/Paris"],
      new Date("2026-07-27T21:30:00Z"),
    );
    assertEquals(result.eligible.has("Europe/Paris"), true);
    assertEquals(result.eligible.has("America/New_York"), false);
    assertEquals(result.invalid.has("GMT+1"), true);
    assertEquals(warnings.length, 1);
  } finally {
    console.warn = original;
  }
});

// ---------------------------------------------------------------------------
// phase_plan
// ---------------------------------------------------------------------------

Deno.test("parsePhasePlan — well-formed entries", () => {
  assertEquals(
    parsePhasePlan([
      { phase_id: "loading", label: "Loading", week_from: 1, week_to: 4 },
      { phase_id: "maintenance", label: "Maintenance", week_from: 5, week_to: 12 },
    ]),
    [
      { phaseId: "loading", weekFrom: 1, weekTo: 4 },
      { phaseId: "maintenance", weekFrom: 5, weekTo: 12 },
    ],
  );
  assertEquals(parsePhasePlan([]), []);
  assertEquals(parsePhasePlan(null), []);
});

Deno.test("parsePhasePlan — R7: malformed entries throw, they are never dropped", () => {
  assertThrows(() => parsePhasePlan([{ phase_id: "a", week_from: 1 }]));
  assertThrows(() => parsePhasePlan([{ week_from: 1, week_to: 2 }]));
  // 0-based bounds are refused explicitly: the semantics are 1-based, and
  // accepting a 0 would shift every phase by a week without any error.
  assertThrows(() => parsePhasePlan([{ phase_id: "a", week_from: 0, week_to: 3 }]));
  assertThrows(() => parsePhasePlan([{ phase_id: "a", week_from: 5, week_to: 2 }]));
  assertThrows(() => parsePhasePlan([{ phase_id: "a", week_from: 1.5, week_to: 2 }]));
  assertThrows(() => parsePhasePlan("weeks 1-4"));
});

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

Deno.test("parseProvisionCommitment — R7: a French weekday throws at the read", () => {
  // The `mission_days` / "dimanche" bug class. parseDayToken owns the alias
  // table, so 'dimanche' is ACCEPTED as an alias and normalized to 'sun' —
  // what must never happen is a silent [] or an unrecognized token surviving.
  assertEquals(
    parseProvisionCommitment({
      id: "c1",
      plan_version_id: VERSION,
      user_id: STUDENT,
      status: "active",
      slot_kind: "nominal",
      evaluation_grain: "day",
      slot_key: null,
      scheduled_days: ["dimanche"],
      polarity: "do",
      measure: "presence",
      target_op: "any",
    }).scheduledDays,
    ["sun"],
  );
  assertThrows(() =>
    parseProvisionCommitment({
      id: "c1",
      plan_version_id: VERSION,
      user_id: STUDENT,
      status: "active",
      slot_kind: "nominal",
      evaluation_grain: "day",
      scheduled_days: ["everyday"],
      polarity: "do",
      measure: "presence",
      target_op: "any",
    })
  );
});

Deno.test("parseProvisionPlanVersion — nullable anchor and duration survive", () => {
  const parsed = parseProvisionPlanVersion({
    id: VERSION,
    student_id: STUDENT,
    timezone: "America/New_York",
    anchor_week_start: null,
    duration_weeks: null,
    week_starts_on: "sun",
    phase_plan: [],
  });
  assertEquals(parsed.anchorWeekStart, null);
  assertEquals(parsed.durationWeeks, null);
  assertEquals(parsed.weekStartsOn, "sun");
});

// ---------------------------------------------------------------------------
// Selection — the R6 branches
// ---------------------------------------------------------------------------

Deno.test("selectDaySeedRows — R6: `opportunistic` is NEVER pre-seeded", () => {
  // Acceptance fixture 1 line 4 (cruciferous veg) is opportunistic. Pre-seeding
  // it would let the 23:55 sweep turn "did not log" into a false `missed` —
  // the exact inversion R6 forbids.
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [
      commitment({ id: "nominal-line" }),
      commitment({
        id: "opportunistic-line",
        slotKind: "opportunistic",
        evaluationGrain: "day",
        slotKey: "any_meal",
      }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(selection.rows.map((r) => r.commitment_id), ["nominal-line"]);
  assertEquals(tallySkips(selection.skipped), { slot_kind_not_nominal: 1 });
});

Deno.test("selectDaySeedRows — `week` grain is not seeded once per day", () => {
  // Seven daily rows for one weekly target would let the sweep hand six
  // `missed` to a student who ate fish exactly three times.
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [
      commitment({
        id: "weekly-line",
        evaluationGrain: "week",
        slotKind: "nominal",
        slotKey: null,
      }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(selection.rows, []);
  assertEquals(tallySkips(selection.skipped), { week_grain_not_day_seeded: 1 });
});

Deno.test("selectDaySeedRows — scheduled_days filters the day", () => {
  const weekdayOnly = commitment({
    id: "weekday-line",
    scheduledDays: ["mon", "tue", "wed", "thu", "fri"],
  });
  const monday = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [weekdayOnly],
    localDate: "2026-07-27",
  });
  assertEquals(monday.rows.length, 1);

  const saturday = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [weekdayOnly],
    localDate: "2026-08-01",
  });
  assertEquals(saturday.rows, []);
  assertEquals(tallySkips(saturday.skipped), { not_scheduled_today: 1 });
});

Deno.test("selectDaySeedRows — scheduled_days NULL means every day", () => {
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [commitment({ scheduledDays: null })],
    localDate: "2026-08-02",
  });
  assertEquals(selection.rows.length, 1);
});

Deno.test("selectDaySeedRows — a paused or archived commitment is not seeded", () => {
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [
      commitment({ id: "paused", status: "paused" }),
      commitment({ id: "archived", status: "archived" }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(selection.rows, []);
  assertEquals(tallySkips(selection.skipped), { commitment_not_active: 2 });
});

Deno.test("selectDaySeedRows — the phase window gates a phased commitment", () => {
  const version = planVersion({
    phasePlan: [
      { phaseId: "loading", weekFrom: 1, weekTo: 2 },
      { phaseId: "maintenance", weekFrom: 3, weekTo: 12 },
    ],
  });
  const lines = [
    commitment({ id: "loading-line", phaseId: "loading" }),
    commitment({ id: "maintenance-line", phaseId: "maintenance" }),
    commitment({ id: "always-line", phaseId: null }),
  ];

  // Week 1 (anchor 2026-07-27).
  const week1 = selectDaySeedRows({
    planVersion: version,
    commitments: lines,
    localDate: "2026-07-28",
  });
  assertEquals(week1.weekNumber, 1);
  assertEquals(week1.rows.map((r) => r.commitment_id).sort(), [
    "always-line",
    "loading-line",
  ]);
  assertEquals(tallySkips(week1.skipped), { phase_window_not_active: 1 });

  // Week 3: loading is over, maintenance is in force.
  const week3 = selectDaySeedRows({
    planVersion: version,
    commitments: lines,
    localDate: "2026-08-11",
  });
  assertEquals(week3.weekNumber, 3);
  assertEquals(week3.rows.map((r) => r.commitment_id).sort(), [
    "always-line",
    "maintenance-line",
  ]);
});

Deno.test("selectDaySeedRows — R7: an undeclared phase is unresolvable, not always-on", () => {
  // Treating it as always-on would put a phase-3 prescription on a week-1
  // student; dropping it with no trace would remove a real prescription.
  const selection = selectDaySeedRows({
    planVersion: planVersion({
      phasePlan: [{ phaseId: "loading", weekFrom: 1, weekTo: 2 }],
    }),
    commitments: [commitment({ id: "ghost", phaseId: "phase_that_does_not_exist" })],
    localDate: "2026-07-28",
  });
  assertEquals(selection.rows, []);
  assertEquals(tallySkips(selection.skipped), { phase_window_unresolvable: 1 });
});

Deno.test("selectDaySeedRows — no anchor: unphased lines still open, phased ones do not", () => {
  const selection = selectDaySeedRows({
    planVersion: planVersion({ anchorWeekStart: null, durationWeeks: null }),
    commitments: [
      commitment({ id: "unphased", phaseId: null }),
      commitment({ id: "phased", phaseId: "loading" }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(selection.planWindow, "anchor_week_start_missing");
  assertEquals(selection.weekNumber, null);
  assertEquals(selection.rows.map((r) => r.commitment_id), ["unphased"]);
  assertEquals(tallySkips(selection.skipped), { phase_window_unresolvable: 1 });
});

Deno.test("selectDaySeedRows — a plan not yet started, or elapsed, opens no day", () => {
  const before = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [commitment()],
    localDate: "2026-07-20",
  });
  assertEquals(before.planWindow, "plan_not_started");
  assertEquals(before.rows, []);

  // duration_weeks=12 from 2026-07-27 => last day is 2026-10-18 (week 12).
  const inside = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [commitment()],
    localDate: "2026-10-18",
  });
  assertEquals(inside.weekNumber, 12);
  assertEquals(inside.rows.length, 1);

  const after = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [commitment()],
    localDate: "2026-10-19",
  });
  assertEquals(after.weekNumber, 13);
  assertEquals(after.planWindow, "plan_duration_elapsed");
  assertEquals(after.rows, []);
});

Deno.test("selectDaySeedRows — only an `occasion` grain carries a slot on its row", () => {
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [
      commitment({ id: "occasion-line", evaluationGrain: "occasion", slotKey: "before_bed" }),
      // A day-grain line anchored on a slot still evaluates once per day: the
      // unique key is (user, commitment, date, slot), and a non-null slot here
      // would let a second row appear for the same day.
      commitment({ id: "day-line", evaluationGrain: "day", slotKey: "breakfast" }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(
    selection.rows.map((r) => [r.commitment_id, r.slot_key, r.grain]),
    [
      ["occasion-line", "before_bed", "occasion"],
      ["day-line", null, "day"],
    ],
  );
});

Deno.test("buildExpectedSnapshot — R1 snake_case keys, R5 no `content`", () => {
  const snapshot = buildExpectedSnapshot(commitment());
  assertEquals(Object.keys(snapshot).sort(), [
    "auto_source",
    "food_group_ref",
    "measure",
    "polarity",
    "slot_kind",
    "substance_ref",
    "target_max",
    "target_min",
    "target_op",
    "tolerance_pct",
    "unit",
  ]);
  assertEquals(snapshot.measure, "dose");
  assertEquals(snapshot.substance_ref, "vitamin_d3");
  // R5: the evaluator never reads `content`, so the snapshot never carries it.
  assertEquals("content" in snapshot, false);
});

Deno.test("selectDaySeedRows — a device-fed nominal line IS seeded (it is swept later)", () => {
  // Fixture 2 lines 3/4/6 are `nominal` + `auto_source`. They are pre-seeded
  // like any nominal line — what R6 forbids is RESOLVING them to `missed` at
  // day close, which is the sweep's job, not this one's.
  const selection = selectDaySeedRows({
    planVersion: planVersion(),
    commitments: [
      commitment({
        id: "oura-line",
        evaluationGrain: "day",
        slotKey: null,
        autoSource: "oura",
        polarity: "capture",
        measure: "duration",
        unit: "h",
        targetOp: "between",
        targetMin: 7,
        targetMax: 9,
        substanceRef: null,
      }),
    ],
    localDate: "2026-07-28",
  });
  assertEquals(selection.rows.length, 1);
  assertEquals(selection.rows[0].expected.auto_source, "oura");
});

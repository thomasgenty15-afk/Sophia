// KEEL — belts on the student app's pure layer.
//
// What is worth pinning here is not "the function returns a list": it is the
// three invariants a future edit could break silently.
//   B1  the display gate returns a variant with NO percentage field;
//   B2  a tap never turns a status into `met` (facts and derived stay apart);
//   B3  an unknown slot or priority THROWS instead of hiding a prescribed line.

import { describe, expect, it } from "vitest";
import { addDays, dayTokenOf, weekDatesFrom, weekStartFor, windowEndingAt } from "./dates";
import {
  adherenceDisplayFor,
  computeLoggingCoverage,
  computeObstaclesCleared,
  computeRegularity,
  computeStreaks,
  countMet,
  eventCountsByDate,
  LOGGING_COVERAGE_MIN_DAYS,
} from "./progressModel";
import {
  buildTodayView,
  flexRemaining,
  isScheduledOn,
  slotReading,
  splitByGrain,
  todayLines,
  todayLineShape,
} from "./todayModel";
import { buildPlanStructure, sectionFor } from "./planStructure";
import { tapMessageId } from "./keelClient";
import { targetLabel } from "./labels";
import type {
  CommitmentRow,
  EvaluationRow,
  PlannedDeviationRow,
  ProtocolEventRow,
  SlotVocabularyRow,
  WeeklyReviewRow,
} from "./types";

const SLOTS: SlotVocabularyRow[] = [
  { key: "on_waking", label_i18n_key: "slot.on_waking", default_local_time: "06:30:00", sort_order: 10 },
  { key: "breakfast", label_i18n_key: "slot.breakfast", default_local_time: "07:30:00", sort_order: 20 },
  { key: "dinner", label_i18n_key: "slot.dinner", default_local_time: "19:30:00", sort_order: 80 },
  { key: "any_time", label_i18n_key: "slot.any_time", default_local_time: null, sort_order: 110 },
];

function commitment(over: Partial<CommitmentRow> & { id: string }): CommitmentRow {
  return {
    plan_version_id: "pv1",
    title: "Line",
    student_instruction: null,
    content_locale: "en-US",
    polarity: "do",
    activity_class: "supplement",
    anchor_kind: "slot",
    slot_key: "breakfast",
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    target_max: null,
    substance_ref: "vitamin_d3",
    food_group_ref: null,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    evaluation_grain: "occasion",
    slot_kind: "nominal",
    scheduled_days: null,
    required_days_per_week: null,
    expected_occasions_per_day: 1,
    priority: "core",
    autonomy: "strict",
    flex_eligible: false,
    status: "active",
    ...over,
  };
}

function event(over: Partial<ProtocolEventRow> & { id: string; local_date: string }): ProtocolEventRow {
  return {
    occurred_at: `${over.local_date}T08:00:00Z`,
    slot_key: null,
    source: "quick_tap",
    quantity: null,
    unit: null,
    recognized: null,
    source_message_id: null,
    ...over,
  };
}

function evaluation(
  over: Partial<EvaluationRow> & { id: string; commitment_id: string; local_date: string },
): EvaluationRow {
  return {
    slot_key: null,
    grain: "occasion",
    status: "unknown",
    timing_status: "unknown",
    evidence: "none",
    observed_value: null,
    ...over,
  };
}

describe("dates", () => {
  it("resolves the weekday without host-timezone drift", () => {
    expect(dayTokenOf("2026-07-27")).toBe("mon");
    expect(dayTokenOf("2026-08-02")).toBe("sun");
  });

  it("throws on a malformed local date (R7)", () => {
    expect(() => dayTokenOf("27/07/2026")).toThrow(/yyyy-mm-dd/);
  });

  it("anchors the week on week_starts_on", () => {
    expect(weekStartFor("2026-07-30", "mon")).toBe("2026-07-27");
    expect(weekStartFor("2026-07-30", "sun")).toBe("2026-07-26");
    expect(weekDatesFrom("2026-07-27")).toHaveLength(7);
    expect(windowEndingAt("2026-07-27", 3)).toEqual([
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });
});

describe("todayModel — grouping", () => {
  it("groups by slot in vocabulary order and sorts core first", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [
        commitment({ id: "c-dinner", slot_key: "dinner" }),
        commitment({ id: "c-optional", priority: "optional" }),
        commitment({ id: "c-core" }),
        commitment({ id: "c-free", anchor_kind: "free", slot_key: null }),
      ],
      evaluations: [],
      events: [],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    expect(view.slots.map((s) => s.slotKey)).toEqual([
      "breakfast",
      "dinner",
      "any_time",
    ]);
    const breakfast = view.slots[0];
    expect(breakfast.lines.map((l) => l.commitment.id)).toEqual([
      "c-core",
      "c-optional",
    ]);
  });

  it("B3 — throws on a slot absent from the vocabulary instead of hiding the line", () => {
    expect(() =>
      buildTodayView({
        localDate: "2026-07-27",
        commitments: [commitment({ id: "c1", slot_key: "second_breakfast" })],
        evaluations: [],
        events: [],
        deviations: [],
        slotVocabulary: SLOTS,
      })
    ).toThrow(/slot_vocabulary/);
  });

  it("keeps week-grain lines out of the day and in their own list", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [
        commitment({
          id: "c-week",
          evaluation_grain: "week",
          anchor_kind: "free",
          slot_key: null,
          required_days_per_week: 3,
        }),
      ],
      evaluations: [],
      events: [],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    expect(view.slots).toHaveLength(0);
    expect(view.weekLines.map((l) => l.commitment.id)).toEqual(["c-week"]);
    expect(view.totalLines).toBe(1);
  });

  it("honours scheduled_days, and treats an empty list as every day", () => {
    const mondayOnly = commitment({ id: "c1", scheduled_days: ["mon"] });
    expect(isScheduledOn(mondayOnly, "mon")).toBe(true);
    expect(isScheduledOn(mondayOnly, "tue")).toBe(false);
    expect(isScheduledOn(commitment({ id: "c2", scheduled_days: [] }), "sat")).toBe(true);
    expect(
      isScheduledOn(commitment({ id: "c3", status: "paused" }), "mon"),
    ).toBe(false);
  });
});

// ===========================================================================
// ONE STRUCTURE, THREE SCREENS
//
// B4 — the student's page, the import review and the template editor lay the
// SAME plan out the same way, because they call the same function. What is
// pinned here is what the founder complained about: the top-level parts, the
// four food headings in the coach's own words, the families under the actions —
// and, on the student's side only, the fact that the ORDER inside a heading is
// the order of the day.
//
// The invariant that outranks all of them is still the PARTITION: a line that
// fell out of every section would be a prescription nobody ever sees, which is
// the exact failure `buildTodayView` throws to prevent one layer down.
// ===========================================================================

/** The founder's document, reduced to the columns the day is built from. */
const DAY: CommitmentRow[] = [
  // FOOD, anchored to meals
  commitment({ id: "d3", activity_class: "supplement", slot_key: "breakfast" }),
  commitment({ id: "iron", activity_class: "supplement", slot_key: "on_waking" }),
  commitment({ id: "veg", activity_class: "nutrition", anchor_kind: "free", slot_key: null }),
  // FOOD, on the week — "oily fish 3 times a week"
  commitment({
    id: "fish",
    activity_class: "nutrition",
    evaluation_grain: "week",
    anchor_kind: "free",
    slot_key: null,
  }),
  // FOOD, being cut — `avoid` outranks the family (see `foodSectionOf`)
  commitment({
    id: "alcohol",
    polarity: "avoid",
    activity_class: "nutrition",
    anchor_kind: "free",
    slot_key: null,
  }),
  // ACTIONS — one anchored, one not, one on the week
  commitment({ id: "daylight", activity_class: "exposure", slot_key: "on_waking" }),
  commitment({
    id: "lights_out",
    activity_class: "sleep",
    anchor_kind: "free",
    slot_key: null,
  }),
  commitment({
    id: "cardio",
    activity_class: "movement",
    evaluation_grain: "week",
    anchor_kind: "free",
    slot_key: null,
  }),
  // OBSERVATIONS
  commitment({
    id: "energy",
    polarity: "capture",
    activity_class: "measurement",
    slot_key: "dinner",
  }),
  commitment({
    id: "weigh",
    polarity: "capture",
    activity_class: "measurement",
    evaluation_grain: "week",
    anchor_kind: "free",
    slot_key: null,
  }),
];

function dayView(commitments: CommitmentRow[] = DAY) {
  return buildTodayView({
    localDate: "2026-07-27",
    commitments,
    evaluations: [],
    events: [],
    deviations: [],
    slotVocabulary: SLOTS,
  });
}

const idsOf = (lines: readonly { commitment: CommitmentRow }[]) =>
  lines.map((l) => l.commitment.id);

/** The day, laid out the way every KEEL screen lays a plan out. */
const dayStructure = (commitments: CommitmentRow[] = DAY) => {
  const view = dayView(commitments);
  return {
    view,
    structure: buildPlanStructure(todayLines(view), todayLineShape, {
      voice: "student",
    }),
  };
};

describe("planStructure — the same sections on the student's day", () => {
  it("puts the parts in the coach's order, in the student's words", () => {
    const { structure } = dayStructure();
    expect(structure.sections.map((s) => s.part)).toEqual([
      "food",
      "actions",
      "observations",
    ]);
    expect(structure.sections.map((s) => s.label)).toEqual([
      "What I eat",
      "What I do",
      "What I record",
    ]);
    // The size of the plan is what the student has to HOLD. The weigh-in and
    // the energy rating are watched, and inflating the headline with them is
    // the exact thing the import screen refuses to do.
    expect(structure.total).toBe(10);
    expect(structure.toHold).toBe(8);
    expect(structure.observed).toBe(2);
  });

  it("B4a — food carries the coach's four headings, in the coach's order", () => {
    const food = sectionFor(dayStructure().structure, "food")!;
    expect(food.subsections.map((s) => s.key)).toEqual([
      "every_day",
      "every_week",
      "cutting",
      "supplements",
    ]);
    // Word for word what the coach read at import. No token reaches the screen.
    expect(food.subsections.map((s) => s.label)).toEqual([
      "Every day",
      "Every week",
      "What we are cutting",
      "Supplements",
    ]);
    expect(idsOf(food.subsections[0].lines)).toEqual(["veg"]);
    expect(idsOf(food.subsections[1].lines)).toEqual(["fish"]);
    // `avoid` outranks the family: a line being cut is not a line to take.
    expect(idsOf(food.subsections[2].lines)).toEqual(["alcohol"]);
    expect(idsOf(food.subsections[3].lines)).toEqual(["iron", "d3"]);
    expect(food.count).toBe(5);
  });

  it("B4b — actions carry the families, anchored or not", () => {
    const actions = sectionFor(dayStructure().structure, "actions")!;
    // `daylight` names a slot and `lights_out` does not; a student recognises
    // "Exposure" and "Sleep", not "the 07:00 pile" and "the leftovers".
    // ACTIVITY_CLASS_ORDER, not alphabetical: movement, exposure, sleep.
    expect(actions.subsections.map((s) => s.key)).toEqual([
      "movement",
      "exposure",
      "sleep",
    ]);
    expect(idsOf(actions.subsections[0].lines)).toEqual(["cardio"]);
    expect(idsOf(actions.subsections[1].lines)).toEqual(["daylight"]);
    expect(actions.count).toBe(3);
  });

  it("takes the captures out of every part, at any grain", () => {
    const { structure } = dayStructure();
    const observations = sectionFor(structure, "observations")!;
    expect(idsOf(observations.lines)).toEqual(["energy", "weigh"]);
    // A capture has no sub-group: a weigh-in is not "every day" and not a
    // family of things to hold.
    expect(observations.subsections).toEqual([]);
    // Neither food nor actions kept it, even the one anchored to dinner.
    expect(idsOf(sectionFor(structure, "food")!.lines)).not.toContain("energy");
    expect(idsOf(sectionFor(structure, "actions")!.lines)).not.toContain("weigh");
  });

  it("B4 — partitions the view exactly: every line once, none lost", () => {
    const { view, structure } = dayStructure();
    const seen = structure.sections.flatMap((s) => idsOf(s.lines));
    expect(seen).toHaveLength(view.totalLines);
    expect(new Set(seen).size).toBe(view.totalLines);
    expect(new Set(seen)).toEqual(new Set(DAY.map((c) => c.id)));
    // And each part's own list is exactly its sub-sections, flattened.
    for (const section of structure.sections) {
      if (section.subsections.length === 0) continue;
      expect(section.subsections.flatMap((g) => idsOf(g.lines))).toEqual(
        idsOf(section.lines),
      );
    }
  });

  it("hands an empty day no headings at all, rather than empty ones", () => {
    const { structure } = dayStructure([]);
    expect(structure.sections).toEqual([]);
    expect(structure.total).toBe(0);
    expect(structure.toHold).toBe(0);
  });
});

describe("todayModel — the order INSIDE a heading is the order of the day", () => {
  it("re-reads a food sub-section by occasion, in vocabulary order", () => {
    const { view, structure } = dayStructure();
    const supplements = sectionFor(structure, "food")!.subsections
      .find((s) => s.key === "supplements")!;
    const reading = slotReading(view, supplements.lines);
    // on_waking before breakfast: the vocabulary's order, unchanged. The
    // daylight line shares on_waking and is NOT here — it is not food.
    expect(reading.slots.map((g) => g.slotKey)).toEqual(["on_waking", "breakfast"]);
    expect(idsOf(reading.slots[0].lines)).toEqual(["iron"]);
    expect(idsOf(reading.slots[1].lines)).toEqual(["d3"]);
    expect(reading.free).toEqual([]);
    // The clock time still comes from the vocabulary row, not from a guess.
    expect(reading.slots[0].defaultLocalTime).toBe("06:30:00");
  });

  it("leaves the unanchored lines out of the meals rather than in a pile", () => {
    const { view, structure } = dayStructure();
    const everyDay = sectionFor(structure, "food")!.subsections[0];
    const reading = slotReading(view, everyDay.lines);
    expect(reading.slots).toEqual([]);
    expect(idsOf(reading.free)).toEqual(["veg"]);
  });

  it("keeps what is judged on the week out of what is due today", () => {
    const { structure } = dayStructure();
    const movement = sectionFor(structure, "actions")!.subsections[0];
    const { day, week } = splitByGrain(movement.lines);
    // "Zone 2, 3 times a week" is an action and is NOT due today. Merging it
    // into today's list is how a student reads themselves as behind every day.
    expect(day).toEqual([]);
    expect(idsOf(week)).toEqual(["cardio"]);
    // Under "Every week" the whole sub-section is week-grain, so the page has
    // nothing to caption — the heading already said it.
    const everyWeek = sectionFor(structure, "food")!.subsections[1];
    expect(splitByGrain(everyWeek.lines).day).toEqual([]);
  });

  it("hands over every line of the day exactly once", () => {
    const { view } = dayStructure();
    const lines = todayLines(view);
    expect(lines).toHaveLength(view.totalLines);
    expect(new Set(lines).size).toBe(view.totalLines);
  });
});

describe("todayModel — facts and derived stay apart", () => {
  it("B2 — a logged fact does NOT move the status away from unknown", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [commitment({ id: "c1" })],
      evaluations: [],
      events: [
        event({
          id: "e1",
          local_date: "2026-07-27",
          recognized: { commitment_id: "c1" },
        }),
      ],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    const line = view.slots[0].lines[0];
    expect(line.loggedEvents).toHaveLength(1);
    expect(line.status).toBe("unknown");
  });

  it("shows the server status when an evaluation row exists", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [commitment({ id: "c1" })],
      evaluations: [
        evaluation({
          id: "ev1",
          commitment_id: "c1",
          local_date: "2026-07-27",
          slot_key: "breakfast",
          status: "met",
          timing_status: "off_window",
        }),
      ],
      events: [],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    const line = view.slots[0].lines[0];
    expect(line.status).toBe("met");
    expect(line.timingStatus).toBe("off_window");
  });

  it("ignores evaluations from another day", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [commitment({ id: "c1" })],
      evaluations: [
        evaluation({
          id: "ev1",
          commitment_id: "c1",
          local_date: "2026-07-26",
          status: "missed",
        }),
      ],
      events: [],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    expect(view.slots[0].lines[0].status).toBe("unknown");
  });

  it("marks a line covered by a whole-day deviation", () => {
    const deviation: PlannedDeviationRow = {
      id: "d1",
      local_date: "2026-07-27",
      slot_key: null,
      kind: "restaurant",
      note: null,
      consumed_flex: true,
    };
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [commitment({ id: "c1" })],
      evaluations: [],
      events: [],
      deviations: [deviation],
      slotVocabulary: SLOTS,
    });
    expect(view.slots[0].lines[0].coveredByDeviation?.id).toBe("d1");
    expect(view.deviations).toHaveLength(1);
  });

  it("flags an auto-sourced line so it is never asked to be ticked", () => {
    const view = buildTodayView({
      localDate: "2026-07-27",
      commitments: [
        commitment({
          id: "c1",
          auto_source: "oura",
          evidence_kind: "device",
          counts_toward_adherence: false,
        }),
      ],
      evaluations: [],
      events: [],
      deviations: [],
      slotVocabulary: SLOTS,
    });
    expect(view.slots[0].lines[0].isAutoSourced).toBe(true);
  });

  it("subtracts only server-consumed flex from the coach's allowance", () => {
    const base = { local_date: "2026-07-27", slot_key: null, kind: "travel" as const, note: null };
    expect(
      flexRemaining({
        allowance: 4,
        deviationsThisWeek: [
          { id: "d1", ...base, consumed_flex: true },
          { id: "d2", ...base, consumed_flex: false },
        ],
      }),
    ).toBe(3);
    expect(flexRemaining({ allowance: null, deviationsThisWeek: [] })).toBe(0);
  });
});

describe("progressModel — the display gate", () => {
  const week = weekDatesFrom("2026-07-27");
  const review: WeeklyReviewRow = {
    id: "wr1",
    week_start_date: "2026-07-27",
    logging_coverage: 5,
    core_adherence_pct: 90,
    overall_adherence_pct: 82,
    evaluable_days: 5,
    flex_used: 1,
    flex_allowance: 4,
    outcomes: { weight_7d_avg: 78.4 },
  };

  it("B1 — below 4/7 the result carries NO percentage field at all", () => {
    const counts = { "2026-07-27": 3, "2026-07-28": 2 };
    const coverage = computeLoggingCoverage(week, counts);
    expect(coverage.loggedDays).toBe(2);
    const display = adherenceDisplayFor({ review, coverage });
    expect(display.kind).toBe("insufficient_data");
    expect("overallPct" in display).toBe(false);
    expect("corePct" in display).toBe(false);
  });

  it("counts a day as logged from 2 events, against a denominator of 7", () => {
    const counts = { "2026-07-27": 1, "2026-07-28": 2, "2026-07-29": 9 };
    expect(computeLoggingCoverage(week, counts)).toEqual({ loggedDays: 2, pct: 29 });
  });

  it("still refuses a number when the gate is open but no review row exists", () => {
    const counts = Object.fromEntries(week.map((d) => [d, 2]));
    const coverage = computeLoggingCoverage(week, counts);
    expect(coverage.loggedDays).toBe(7);
    const display = adherenceDisplayFor({ review: null, coverage });
    expect(display).toMatchObject({
      kind: "insufficient_data",
      reason: "no_weekly_review",
    });
    expect("overallPct" in display).toBe(false);
  });

  it("shows the server's percentages once both conditions hold", () => {
    const counts = Object.fromEntries(week.map((d) => [d, 2]));
    const display = adherenceDisplayFor({
      review,
      coverage: computeLoggingCoverage(week, counts),
    });
    expect(display).toEqual({
      kind: "adherence",
      overallPct: 82,
      corePct: 90,
      loggedDays: 7,
    });
    expect(LOGGING_COVERAGE_MIN_DAYS).toBe(4);
  });
});

describe("progressModel — regularity, streaks, obstacles", () => {
  it("counts events per local date", () => {
    const counts = eventCountsByDate([
      event({ id: "e1", local_date: "2026-07-27" }),
      event({ id: "e2", local_date: "2026-07-27" }),
      event({ id: "e3", local_date: "2026-07-28" }),
    ]);
    expect(counts).toEqual({ "2026-07-27": 2, "2026-07-28": 1 });
  });

  it("does not break a streak on an empty TODAY, but does on an empty yesterday", () => {
    const dates = ["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27"];
    const openToday = computeStreaks(dates, {
      "2026-07-24": 1,
      "2026-07-25": 1,
      "2026-07-26": 1,
    });
    expect(openToday).toEqual({ current: 3, best: 3 });

    const brokenYesterday = computeStreaks(dates, {
      "2026-07-24": 1,
      "2026-07-27": 1,
    });
    expect(brokenYesterday.current).toBe(1);
    expect(brokenYesterday.best).toBe(1);
  });

  it("measures each week against 7 days, not against its own evidence", () => {
    const regularity = computeRegularity(["2026-07-20", "2026-07-27"], {
      "2026-07-20": 2,
      "2026-07-21": 2,
      "2026-07-27": 2,
    });
    expect(regularity[0]).toEqual({ weekStart: "2026-07-20", loggedDays: 2, pct: 29 });
    expect(regularity[1]).toEqual({ weekStart: "2026-07-27", loggedDays: 1, pct: 14 });
  });

  it("counts an obstacle cleared only when the declared day also kept something", () => {
    const deviations: PlannedDeviationRow[] = [
      { id: "d1", local_date: "2026-07-25", slot_key: null, kind: "restaurant", note: null, consumed_flex: true },
      { id: "d2", local_date: "2026-07-26", slot_key: null, kind: "travel", note: null, consumed_flex: true },
    ];
    const evaluations: EvaluationRow[] = [
      evaluation({ id: "e1", commitment_id: "c1", local_date: "2026-07-25", status: "met" }),
      evaluation({ id: "e2", commitment_id: "c1", local_date: "2026-07-26", status: "missed" }),
    ];
    const cleared = computeObstaclesCleared({ deviations, evaluations });
    expect(cleared).toEqual([
      { localDate: "2026-07-25", kind: "restaurant", keptCount: 1 },
    ]);
    expect(countMet(evaluations)).toBe(1);
  });
});

describe("write-path helpers", () => {
  it("gives each occasion of the day its own idempotence key", () => {
    const base = { commitmentId: "c1", localDate: "2026-07-27", slotKey: "breakfast" };
    expect(tapMessageId({ ...base, occurrence: 1 })).toBe(
      "app_tap:c1:2026-07-27:breakfast:1",
    );
    expect(tapMessageId({ ...base, occurrence: 2 })).not.toBe(
      tapMessageId({ ...base, occurrence: 1 }),
    );
    expect(tapMessageId({ ...base, slotKey: null, occurrence: 1 })).toBe(
      "app_tap:c1:2026-07-27:no_slot:1",
    );
  });

  it("renders the prescribed target, and nothing at all when there is none", () => {
    expect(
      targetLabel({ target_op: ">=", target_min: 5000, target_max: null, unit: "IU" }),
    ).toBe(">= 5000 IU");
    expect(
      targetLabel({ target_op: "between", target_min: 7, target_max: 9, unit: "h" }),
    ).toBe("7-9 h");
    expect(
      targetLabel({ target_op: "any", target_min: null, target_max: null, unit: "none" }),
    ).toBe("");
    expect(
      targetLabel({ target_op: "==", target_min: 0, target_max: null, unit: "none" }),
    ).toBe("0");
  });

  it("reads a '<=' ceiling from target_max, where the CHECK constraint stores it", () => {
    expect(
      targetLabel({ target_op: "<=", target_min: null, target_max: 2, unit: "portion" }),
    ).toBe("<= 2 portion");
  });
});

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  addDaysYmd,
  buildWeeklyProgressReviewFromRows,
  buildWeeklyProgressReviewInstruction,
  nextWeekStartForLocalDate,
  planContentHasPlanifiableWeekStart,
  weekEndForWeekStart,
} from "./weekly_progress_review.ts";

Deno.test("weekly date helpers derive week boundaries", () => {
  assertEquals(addDaysYmd("2026-04-27", 6), "2026-05-03");
  assertEquals(weekEndForWeekStart("2026-04-27"), "2026-05-03");
  assertEquals(nextWeekStartForLocalDate("2026-05-02"), "2026-05-04");
});

Deno.test("planContentHasPlanifiableWeekStart requires an existing assigned week", () => {
  const content = {
    metadata: {
      schedule_anchor: {
        anchor_week_start: "2026-04-27",
      },
    },
    phases: [
      {
        phase_id: "phase-1",
        weeks: [
          {
            week_order: 1,
            item_assignments: [{ temp_id: "habit-1" }],
          },
          {
            week_order: 2,
            item_assignments: [{ temp_id: "habit-1" }],
          },
          {
            week_order: 3,
            item_assignments: [],
          },
        ],
      },
    ],
  };

  assertEquals(
    planContentHasPlanifiableWeekStart(content, "2026-05-04"),
    true,
  );
  assertEquals(
    planContentHasPlanifiableWeekStart(content, "2026-05-11"),
    false,
  );
  assertEquals(
    planContentHasPlanifiableWeekStart(content, "2026-05-18"),
    false,
  );
});

Deno.test("buildWeeklyProgressReviewFromRows groups by transformation", () => {
  const review = buildWeeklyProgressReviewFromRows({
    userId: "user-1",
    timezone: "Europe/Paris",
    weekStartDate: "2026-04-27",
    generatedAt: "2026-05-03T18:00:00.000Z",
    dashboardUrl: "https://example.test/dashboard",
    transformations: [
      { id: "transformation-1", title: "Sport", priority_order: 1 },
      { id: "transformation-2", title: "Focus", priority_order: 2 },
    ],
    plans: [
      {
        id: "plan-1",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        title: "Plan sport",
      },
      {
        id: "plan-2",
        cycle_id: "cycle-1",
        transformation_id: "transformation-2",
        title: "Plan focus",
      },
    ],
    planItems: [
      {
        id: "item-1",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        title: "Marche",
        dimension: "habits",
        kind: "habit",
        status: "active",
      },
      {
        id: "item-2",
        cycle_id: "cycle-1",
        transformation_id: "transformation-2",
        plan_id: "plan-2",
        title: "Deep work",
        dimension: "missions",
        kind: "mission",
        status: "active",
      },
    ],
    weekPlans: [
      { plan_item_id: "item-1", status: "confirmed" },
      { plan_item_id: "item-2", status: "confirmed" },
    ],
    occurrences: [
      {
        id: "occ-1",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        plan_item_id: "item-1",
        week_start_date: "2026-04-27",
        ordinal: 1,
        planned_day: "mon",
        status: "done",
        source: "weekly_confirmed",
      },
      {
        id: "occ-2",
        cycle_id: "cycle-1",
        transformation_id: "transformation-2",
        plan_id: "plan-2",
        plan_item_id: "item-2",
        week_start_date: "2026-04-27",
        ordinal: 1,
        planned_day: "tue",
        status: "missed",
        source: "weekly_confirmed",
      },
    ],
    entries: [
      {
        id: "entry-1",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        plan_item_id: "item-1",
        entry_kind: "checkin",
        outcome: "completed",
        effective_at: "2026-04-27T12:00:00.000Z",
        created_at: "2026-04-27T18:00:00.000Z",
      },
    ],
  });

  assertEquals(review.transformations.length, 2);
  assertEquals(review.transformations[0].summary.done_count, 1);
  assertEquals(review.transformations[1].summary.missed_count, 1);
  assertEquals(
    review.global_synthesis.dashboard_cta?.url,
    "https://example.test/dashboard",
  );
  assertStringIncludes(
    buildWeeklyProgressReviewInstruction(review),
    "weekly_progress_review_v2",
  );
});

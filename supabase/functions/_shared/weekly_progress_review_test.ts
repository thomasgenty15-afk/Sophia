import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  addDaysYmd,
  buildWeeklyPlanningValidationMessage,
  buildWeeklyProgressReviewFromRows,
  buildWeeklyProgressReviewInstruction,
  nextWeekStartForLocalDate,
  planContentHasPlanifiableWeekStart,
  weekEndForWeekStart,
} from "./weekly_progress_review.ts";
import { DAILY_ACTION_REVIEW_SOURCE } from "./daily_action_review.ts";

Deno.test("weekly date helpers derive week boundaries", () => {
  assertEquals(addDaysYmd("2026-04-27", 6), "2026-05-03");
  assertEquals(weekEndForWeekStart("2026-04-27"), "2026-05-03");
  assertEquals(nextWeekStartForLocalDate("2026-05-02"), "2026-05-04");
});

Deno.test("weekly planning validation message explains unlock after weekly", () => {
  const message = buildWeeklyPlanningValidationMessage({
    nextWeekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
  });

  assertStringIncludes(message, "Le point de fin de semaine est termine");
  assertStringIncludes(message, "validation de la semaine prochaine");
  assertStringIncludes(message, "confirmer");
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

Deno.test("weekly_projection_uses_daily_evidence_by_occurrence_id", () => {
  const review = buildWeeklyProgressReviewFromRows({
    userId: "user-1",
    timezone: "Europe/Paris",
    weekStartDate: "2026-04-27",
    generatedAt: "2026-05-03T18:00:00.000Z",
    transformations: [{ id: "transformation-1", title: "Sport" }],
    plans: [{
      id: "plan-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      title: "Plan sport",
    }],
    planItems: [{
      id: "item-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      title: "Marche",
      dimension: "habits",
      kind: "habit",
      status: "active",
    }],
    weekPlans: [{ plan_item_id: "item-1", status: "confirmed" }],
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
        status: "missed",
        source: "weekly_confirmed",
      },
      {
        id: "occ-2",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        plan_item_id: "item-1",
        week_start_date: "2026-04-27",
        ordinal: 2,
        planned_day: "tue",
        status: "missed",
        source: "weekly_confirmed",
      },
    ],
    entries: [{
      id: "entry-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "item-1",
      entry_kind: "skip",
      outcome: "missed",
      value_text: "trop dur",
      effective_at: "2026-04-27T12:00:00.000Z",
      created_at: "2026-04-27T18:00:00.000Z",
      metadata: {
        source: DAILY_ACTION_REVIEW_SOURCE,
        occurrence_id: "occ-2",
        reason_category: "too_hard",
        reason_text: "trop dur",
        evidence_text: "Je n'ai pas marche, c'etait trop dur.",
        matched_user_text: "Je n'ai pas marche, c'etait trop dur.",
        still_relevant: true,
        confidence: "high",
      },
    }],
  });

  const actions = review.transformations[0].actions;
  assertEquals(actions[0].daily_evidence, null);
  assertEquals(actions[1].daily_evidence?.reason_category, "too_hard");
  assertEquals(
    actions[1].daily_evidence?.evidence_text,
    "Je n'ai pas marche, c'etait trop dur.",
  );
  assertEquals(actions[1].daily_evidence?.reason_text, "trop dur");
  assertEquals(actions[1].daily_evidence?.confidence, "high");
});

Deno.test("weekly_projection_ignores_unconfirmed_week_plan", () => {
  const review = buildWeeklyProgressReviewFromRows({
    userId: "user-1",
    timezone: "Europe/Paris",
    weekStartDate: "2026-04-27",
    generatedAt: "2026-05-03T18:00:00.000Z",
    transformations: [{ id: "transformation-1", title: "Sport" }],
    plans: [{
      id: "plan-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      title: "Plan sport",
    }],
    planItems: [{
      id: "item-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      title: "Marche",
      dimension: "habits",
      kind: "habit",
      status: "active",
    }],
    weekPlans: [{ plan_item_id: "item-1", status: "pending_confirmation" }],
    occurrences: [{
      id: "occ-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "item-1",
      week_start_date: "2026-04-27",
      ordinal: 1,
      planned_day: "mon",
      status: "done",
      source: "weekly_pending",
    }],
    entries: [],
  });

  assertEquals(review.transformations.length, 0);
  assertEquals(review.global_synthesis.message_intent, "encourage");
});

Deno.test("weekly_projection_done_partial_missed_unanswered_rescheduled", () => {
  const review = buildWeeklyProgressReviewFromRows({
    userId: "user-1",
    timezone: "Europe/Paris",
    weekStartDate: "2026-04-27",
    generatedAt: "2026-05-03T18:00:00.000Z",
    transformations: [{ id: "transformation-1", title: "Sport" }],
    plans: [{
      id: "plan-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      title: "Plan sport",
    }],
    planItems: ["done", "partial", "missed", "planned", "rescheduled"].map((
      status,
      index,
    ) => ({
      id: `item-${index}`,
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      title: status,
      dimension: "habits",
      kind: "habit",
      status: "active",
    })),
    weekPlans: [0, 1, 2, 3, 4].map((index) => ({
      plan_item_id: `item-${index}`,
      status: "confirmed" as const,
    })),
    occurrences:
      (["done", "partial", "missed", "planned", "rescheduled"] as const)
        .map((status, index) => ({
          id: `occ-${index}`,
          cycle_id: "cycle-1",
          transformation_id: "transformation-1",
          plan_id: "plan-1",
          plan_item_id: `item-${index}`,
          week_start_date: "2026-04-27",
          ordinal: index + 1,
          planned_day: "mon" as const,
          status,
          source: "weekly_confirmed",
        })),
    entries: [],
  });

  assertEquals(review.transformations[0].summary.done_count, 1);
  assertEquals(review.transformations[0].summary.partial_count, 1);
  assertEquals(review.transformations[0].summary.missed_count, 1);
  assertEquals(review.transformations[0].summary.unanswered_count, 1);
  assertEquals(review.transformations[0].summary.rescheduled_count, 1);
});

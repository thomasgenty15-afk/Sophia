import { assertEquals } from "jsr:@std/assert@1";

import { validateWeeklyPlanningAiProposal } from "./weekly_planning_ai.ts";
import type {
  WeeklyPlanningOccurrenceRow,
  WeeklyPlanningSnapshot,
} from "./weekly_planning_lifecycle.ts";

function fixture() {
  const plans: WeeklyPlanningSnapshot["plans"] = [
    {
      id: "week-plan-mission",
      user_id: "user-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "mission-1",
      week_start_date: "2026-07-13",
      status: "pending_confirmation",
      user_plan_items: {
        id: "mission-1",
        title: "Preparer le materiel",
        dimension: "missions",
      },
    },
    {
      id: "week-plan-habit",
      user_id: "user-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "habit-1",
      week_start_date: "2026-07-13",
      status: "pending_confirmation",
      user_plan_items: {
        id: "habit-1",
        title: "Faire une session courte",
        dimension: "habits",
      },
    },
  ];
  const occurrences: WeeklyPlanningOccurrenceRow[] = [
    {
      id: "occ-mission",
      plan_id: "plan-1",
      plan_item_id: "mission-1",
      planned_day: "mon",
      ordinal: 1,
      status: "planned",
      source: "default_generated",
    },
    {
      id: "occ-habit-1",
      plan_id: "plan-1",
      plan_item_id: "habit-1",
      planned_day: "mon",
      ordinal: 1,
      status: "planned",
      source: "default_generated",
    },
    {
      id: "occ-habit-2",
      plan_id: "plan-1",
      plan_item_id: "habit-1",
      planned_day: "tue",
      ordinal: 2,
      status: "planned",
      source: "default_generated",
    },
  ];
  const planning: WeeklyPlanningSnapshot = {
    week_start_date: "2026-07-13",
    week_end_date: "2026-07-19",
    active_plan_ids: ["plan-1"],
    plans,
    pending_plans: plans,
    confirmed_plans: [],
    occurrences,
    summary_lines: [],
    has_planning: true,
    has_pending: true,
    already_confirmed: false,
  };
  return { planning, occurrences };
}

Deno.test("weekly planning AI accepts a mission-first schedule spread over the week", () => {
  const { planning, occurrences } = fixture();
  const result = validateWeeklyPlanningAiProposal({
    planning,
    occurrences,
    raw: {
      items: [
        { plan_item_id: "mission-1", days: ["mon"], reason: "setup" },
        {
          plan_item_id: "habit-1",
          days: ["wed", "sat"],
          reason: "deux essais espaces",
        },
      ],
    },
  });

  assertEquals(result.ok, true);
});

Deno.test("weekly planning AI rejects a front-loaded week", () => {
  const { planning, occurrences } = fixture();
  const result = validateWeeklyPlanningAiProposal({
    planning,
    occurrences,
    raw: {
      items: [
        { plan_item_id: "mission-1", days: ["mon"], reason: "setup" },
        { plan_item_id: "habit-1", days: ["mon", "tue"], reason: "vite" },
      ],
    },
  });

  assertEquals(result, { ok: false, reason: "front_loaded_week" });
});

Deno.test("weekly planning AI cannot change the requested cadence", () => {
  const { planning, occurrences } = fixture();
  const result = validateWeeklyPlanningAiProposal({
    planning,
    occurrences,
    raw: {
      items: [
        { plan_item_id: "mission-1", days: ["mon"], reason: "setup" },
        { plan_item_id: "habit-1", days: ["fri"], reason: "une fois" },
      ],
    },
  });

  assertEquals(result, { ok: false, reason: "invalid_days_or_cadence" });
});

Deno.test("weekly planning AI enforces an explicit mission prerequisite", () => {
  const { planning, occurrences } = fixture();
  const habitPlan = planning.pending_plans.find((plan) =>
    plan.plan_item_id === "habit-1"
  );
  if (habitPlan && !Array.isArray(habitPlan.user_plan_items)) {
    habitPlan.user_plan_items = {
      ...habitPlan.user_plan_items,
      activation_condition: {
        type: "after_item_completion",
        depends_on: ["mission-1"],
      },
    };
  }
  const result = validateWeeklyPlanningAiProposal({
    planning,
    occurrences,
    raw: {
      items: [
        { plan_item_id: "mission-1", days: ["wed"], reason: "setup" },
        {
          plan_item_id: "habit-1",
          days: ["tue", "sat"],
          reason: "un essai avant le setup",
        },
      ],
    },
  });

  assertEquals(result, { ok: false, reason: "prerequisite_order_invalid" });
});

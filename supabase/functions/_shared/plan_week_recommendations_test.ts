import { assertEquals } from "jsr:@std/assert@1";

import {
  type PlanWeekRecommendationItem,
  recommendedWeekPlanningFromPlanContent,
} from "./plan_week_recommendations.ts";

const planContent = {
  version: 3,
  metadata: {
    schedule_anchor: {
      anchor_week_start: "2026-06-15",
      anchor_week_end: "2026-06-21",
      anchor_display_start: "2026-06-15",
    },
  },
  current_level_runtime: {
    phase_id: "phase-1",
    weeks: [
      {
        week_order: 1,
        item_assignments: [
          { temp_id: "habit-1", weekly_reps: 2 },
          { temp_id: "mission-1" },
        ],
        mission_days: ["dimanche"],
      },
    ],
  },
};

const items: PlanWeekRecommendationItem[] = [
  {
    id: "habit-db-1",
    plan_id: "plan-1",
    dimension: "habits",
    target_reps: 2,
    scheduled_days: null,
    payload: { _generation: { temp_id: "habit-1" } },
  },
  {
    id: "mission-db-1",
    plan_id: "plan-1",
    dimension: "missions",
    target_reps: null,
    scheduled_days: null,
    payload: { _generation: { temp_id: "mission-1" } },
  },
];

Deno.test("recommended week planning maps runtime mission day to the assigned one-shot item", () => {
  const recommendations = recommendedWeekPlanningFromPlanContent({
    planContent,
    planItems: items,
    targetWeekStartDate: "2026-06-15",
  });

  assertEquals(
    recommendations.find((entry) => entry.plan_item_id === "mission-db-1")
      ?.recommended_days,
    ["sun"],
  );
});

Deno.test("recommended week planning does not invent monday for a one-shot item without a runtime day", () => {
  const recommendations = recommendedWeekPlanningFromPlanContent({
    planContent: {
      ...planContent,
      current_level_runtime: {
        phase_id: "phase-1",
        weeks: [
          {
            week_order: 1,
            item_assignments: [{ temp_id: "mission-1" }],
            mission_days: [],
          },
        ],
      },
    },
    planItems: [items[1]],
    targetWeekStartDate: "2026-06-15",
  });

  assertEquals(recommendations, []);
});

Deno.test("recommended week planning smooths habit cadence over visible days", () => {
  const recommendations = recommendedWeekPlanningFromPlanContent({
    planContent,
    planItems: items,
    targetWeekStartDate: "2026-06-15",
  });

  assertEquals(
    recommendations.find((entry) => entry.plan_item_id === "habit-db-1")
      ?.recommended_days,
    ["tue", "sat"],
  );
});

import { assertEquals } from "jsr:@std/assert@1";

import { DAILY_ACTION_REVIEW_SOURCE } from "./daily_action_review.ts";
import {
  buildWeeklyAdaptiveReview,
  buildWeeklyAdaptiveReviewInstruction,
  buildWeeklyAdaptiveReviewMessage,
} from "./weekly_adaptive_review.ts";
import {
  weeklyAdaptiveReviewOpeningLooksValid,
} from "./weekly_adaptive_review_opening.ts";
import { buildWeeklyProgressReviewFromRows } from "./weekly_progress_review.ts";
import { reduceWeeklyReview } from "./weekly_review/reducer.ts";
import { renderWeeklyReviewDecision } from "./weekly_review/renderer.ts";

function baseReview(overrides: {
  habitStatuses: Array<"done" | "partial" | "missed" | "planned">;
  missionStatus?: "done" | "missed";
  missionStillRelevant?: boolean | null;
  blocker?: string | null;
}) {
  const planItems = [
    {
      id: "habit-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      title: "Marcher",
      dimension: "habits",
      kind: "habit",
      status: "active",
    },
    {
      id: "mission-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      title: "Preparer le sac",
      dimension: "missions",
      kind: "mission",
      status: "active",
    },
  ];
  const habitOccurrences = overrides.habitStatuses.map((status, index) => ({
    id: `habit-occ-${index + 1}`,
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    plan_item_id: "habit-1",
    week_start_date: "2026-04-27",
    ordinal: index + 1,
    planned_day: ["mon", "tue", "wed", "thu", "fri"][index] as
      | "mon"
      | "tue"
      | "wed"
      | "thu"
      | "fri",
    status,
    source: "weekly_confirmed",
  }));
  const missionOccurrence = {
    id: "mission-occ-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    plan_item_id: "mission-1",
    week_start_date: "2026-04-27",
    ordinal: overrides.habitStatuses.length + 1,
    planned_day: "fri" as const,
    status: overrides.missionStatus ?? "missed",
    source: "weekly_confirmed",
  };
  const entries = [
    ...overrides.habitStatuses.flatMap((status, index) => {
      if (status === "planned") return [];
      return [{
        id: `habit-entry-${index + 1}`,
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        plan_item_id: "habit-1",
        entry_kind: status === "missed"
          ? "skip"
          : status === "partial"
          ? "partial"
          : "checkin",
        outcome: status === "done" ? "completed" : status,
        value_text: status === "missed" ? "fatigue" : null,
        effective_at: `2026-04-${27 + index}T12:00:00.000Z`,
        created_at: `2026-04-${27 + index}T18:00:00.000Z`,
        metadata: {
          source: DAILY_ACTION_REVIEW_SOURCE,
          occurrence_id: `habit-occ-${index + 1}`,
          reason_category: status === "missed"
            ? overrides.blocker ?? "fatigue"
            : "none",
          confidence: "high",
        },
      }];
    }),
    {
      id: "mission-entry-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "mission-1",
      entry_kind: overrides.missionStatus === "done" ? "checkin" : "skip",
      outcome: overrides.missionStatus === "done" ? "completed" : "missed",
      value_text: "mission daily",
      effective_at: "2026-05-01T12:00:00.000Z",
      created_at: "2026-05-01T18:00:00.000Z",
      metadata: {
        source: DAILY_ACTION_REVIEW_SOURCE,
        occurrence_id: "mission-occ-1",
        reason_category: overrides.blocker ?? "fatigue",
        still_relevant: overrides.missionStillRelevant,
        confidence: "high",
      },
    },
  ];

  return buildWeeklyProgressReviewFromRows({
    userId: "user-1",
    timezone: "Europe/Paris",
    weekStartDate: "2026-04-27",
    generatedAt: "2026-05-03T18:00:00.000Z",
    transformations: [
      { id: "transformation-1", title: "Sport", priority_order: 1 },
    ],
    plans: [
      {
        id: "plan-1",
        cycle_id: "cycle-1",
        transformation_id: "transformation-1",
        title: "Plan sport",
      },
    ],
    planItems,
    weekPlans: [
      { plan_item_id: "habit-1", status: "confirmed" },
      { plan_item_id: "mission-1", status: "confirmed" },
    ],
    occurrences: [...habitOccurrences, missionOccurrence],
    entries,
  });
}

Deno.test("weekly adaptive review advances when habits are validated", () => {
  const review = baseReview({
    habitStatuses: ["done", "done", "done", "done"],
    missionStatus: "missed",
    missionStillRelevant: true,
  });

  const adaptive = buildWeeklyAdaptiveReview(review);

  assertEquals(adaptive.habit_verdict.status, "validated");
  assertEquals(adaptive.week_strategy.decision, "advance");
  assertEquals(
    adaptive.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision,
    "carry_over",
  );
});

Deno.test("weekly_adaptive_review_delegates_to_weekly_review_reducer", () => {
  const review = baseReview({
    habitStatuses: ["done", "done", "done", "done"],
    missionStatus: "missed",
    missionStillRelevant: true,
  });

  const adaptive = buildWeeklyAdaptiveReview(review);
  const decision = reduceWeeklyReview(review);

  assertEquals(adaptive.skill_decision.week_strategy, decision.week_strategy);
  assertEquals(adaptive.skill_decision.plan_patch, decision.plan_patch);
  assertEquals(
    adaptive.week_strategy.decision,
    decision.week_strategy.decision,
  );
});

Deno.test("weekly_adaptive_review_message_uses_weekly_review_renderer", () => {
  const review = baseReview({
    habitStatuses: ["missed", "missed", "planned"],
    blocker: "fatigue",
  });
  const adaptive = buildWeeklyAdaptiveReview(review);

  assertEquals(
    buildWeeklyAdaptiveReviewMessage(adaptive),
    renderWeeklyReviewDecision(adaptive.skill_decision),
  );
});

Deno.test("weekly adaptive review opening guard rejects rigid builder-like copy", () => {
  assertEquals(
    weeklyAdaptiveReviewOpeningLooksValid(
      "C'est le moment du bilan de la semaine.\n\nCe qui ressort surtout: le contexte de la semaine.\n\nComment tu as vecu la semaine ?",
    ),
    false,
  );
  assertEquals(
    weeklyAdaptiveReviewOpeningLooksValid(
      "C'est le moment du bilan de la semaine. On va faire le point tranquillement sur ce qui a tenu, ce qui a pese, et comment tu sens ton avancee par rapport a ton objectif.\n\nComment tu as vecu la semaine dans l'ensemble ?",
    ),
    true,
  );
});

Deno.test("weekly adaptive review prefers bridge week for fatigue habit failures", () => {
  const review = baseReview({
    habitStatuses: ["missed", "missed", "planned"],
    blocker: "fatigue",
  });

  const adaptive = buildWeeklyAdaptiveReview(review);

  assertEquals(adaptive.habit_verdict.status, "failed");
  assertEquals(adaptive.week_strategy.decision, "bridge_week");
  assertEquals(adaptive.question?.id, "weekly_confirm_dominant_blocker");
});

Deno.test("weekly adaptive review user-facing copy avoids internal bridge vocabulary", () => {
  const review = baseReview({
    habitStatuses: ["missed", "missed", "planned"],
    blocker: "fatigue",
  });
  const adaptive = buildWeeklyAdaptiveReview(review);

  const instruction = buildWeeklyAdaptiveReviewInstruction(adaptive)
    .toLowerCase();

  assertEquals(instruction.includes("semaine allegee"), true);
  assertEquals(adaptive.week_strategy.decision, "bridge_week");
});

Deno.test("weekly adaptive review drops non-habit when daily says not relevant", () => {
  const review = baseReview({
    habitStatuses: ["missed", "missed", "missed"],
    missionStatus: "missed",
    missionStillRelevant: false,
    blocker: "not_relevant",
  });

  const adaptive = buildWeeklyAdaptiveReview(review);

  assertEquals(
    adaptive.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision,
    "drop",
  );
  assertEquals(adaptive.week_strategy.decision, "level_review");
});

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { DAILY_ACTION_REVIEW_SOURCE } from "./daily_action_review.ts";
import {
  buildWeeklyAdaptiveReview,
  buildWeeklyAdaptiveReviewInstruction,
  buildWeeklyAdaptiveReviewIntroMessage,
} from "./weekly_adaptive_review.ts";
import { buildWeeklyProgressReviewFromRows } from "./weekly_progress_review.ts";

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

Deno.test("weekly adaptive review intro opens with synthesis, action check and one broad question", () => {
  const review = baseReview({
    habitStatuses: ["done", "done", "partial", "missed"],
    missionStatus: "missed",
    missionStillRelevant: true,
    blocker: "fatigue",
  });
  const adaptive = buildWeeklyAdaptiveReview(review);

  const message = buildWeeklyAdaptiveReviewIntroMessage(review, adaptive);

  assertStringIncludes(message, "bilan de la semaine");
  assertStringIncludes(message, "Cote actions");
  assertStringIncludes(message, "l'organisation de la semaine prochaine");
  assertStringIncludes(message, "comment tu as vecu cette semaine");
  assertEquals(/%|\b\d+\s*\/\s*\d+\b/.test(message), false);
  assertEquals(
    /\b\d+\s+(actions?|prevues?|faites?|validees?|ratees?|non faites?)\b/i
      .test(message),
    false,
  );
  assertEquals(message.includes("est-ce que tu sens une difference"), false);
  assertEquals(
    message.includes("dans quel etat tu termines la semaine"),
    false,
  );
  assertEquals((message.match(/\?/g) ?? []).length, 1);
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

  const intro = buildWeeklyAdaptiveReviewIntroMessage(review, adaptive)
    .toLowerCase();
  const instruction = buildWeeklyAdaptiveReviewInstruction(adaptive)
    .toLowerCase();

  assertStringIncludes(intro, "semaine allegee");
  assertEquals(intro.includes("bridge"), false);
  assertEquals(intro.includes("semaine pont"), false);
  assertEquals(instruction.includes("semaine allegee"), true);
});

Deno.test("weekly adaptive review drops non-habit when daily says not relevant", () => {
  const review = baseReview({
    habitStatuses: ["missed", "missed", "missed"],
    missionStatus: "missed",
    missionStillRelevant: false,
    blocker: "not_relevant",
  });

  const adaptive = buildWeeklyAdaptiveReview(review);
  const intro = buildWeeklyAdaptiveReviewIntroMessage(review, adaptive)
    .toLowerCase();

  assertEquals(
    adaptive.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision,
    "drop",
  );
  assertEquals(intro.includes("not_relevant"), false);
  assertStringIncludes(intro, "ne collaient plus");
  assertStringIncludes(intro, "plan a revoir en profondeur");
});

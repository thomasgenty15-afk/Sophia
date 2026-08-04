import { assertEquals } from "jsr:@std/assert@1";

import { DAILY_ACTION_REVIEW_SOURCE } from "./daily_action_review.ts";
import { buildWeeklyProgressReviewFromRows } from "./weekly_progress_review.ts";
import { reviewWeeklyPatchConfirmation } from "./weekly_review/confirmation.ts";
import {
  applyWeeklyReviewEffects,
  weeklyReviewAppliedStatusForEffects,
} from "./weekly_review/effects.ts";
import { reduceWeeklyReview } from "./weekly_review/reducer.ts";
import {
  renderWeeklyEffectsAck,
  renderWeeklyReviewDecision,
} from "./weekly_review/renderer.ts";

function review(args: {
  habits: Array<"done" | "partial" | "missed" | "planned">;
  mission?: "done" | "missed" | "planned" | "rescheduled";
  blocker?: string | null;
  missionStillRelevant?: boolean | null;
  omitDailyEvidence?: boolean;
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
  const habitOccurrences = args.habits.map((status, index) => ({
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
  const missionStatus = args.mission ?? "missed";
  const missionOccurrence = {
    id: "mission-occ-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    plan_item_id: "mission-1",
    week_start_date: "2026-04-27",
    ordinal: args.habits.length + 1,
    planned_day: "fri" as const,
    status: missionStatus,
    source: "weekly_confirmed",
  };
  const entries = args.omitDailyEvidence ? [] : [
    ...args.habits.flatMap((status, index) => {
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
        value_text: status === "missed" ? args.blocker ?? "fatigue" : null,
        effective_at: `2026-04-${27 + index}T12:00:00.000Z`,
        created_at: `2026-04-${27 + index}T18:00:00.000Z`,
        metadata: {
          source: DAILY_ACTION_REVIEW_SOURCE,
          occurrence_id: `habit-occ-${index + 1}`,
          reason_category: status === "missed"
            ? args.blocker ?? "fatigue"
            : "none",
          confidence: "high",
        },
      }];
    }),
    ...(missionStatus === "planned" || missionStatus === "rescheduled" ? [] : [{
      id: "mission-entry-1",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      plan_id: "plan-1",
      plan_item_id: "mission-1",
      entry_kind: missionStatus === "done" ? "checkin" : "skip",
      outcome: missionStatus === "done" ? "completed" : "missed",
      value_text: "mission daily",
      effective_at: "2026-05-01T12:00:00.000Z",
      created_at: "2026-05-01T18:00:00.000Z",
      metadata: {
        source: DAILY_ACTION_REVIEW_SOURCE,
        occurrence_id: "mission-occ-1",
        reason_category: args.blocker ?? "fatigue",
        still_relevant: args.missionStillRelevant,
        confidence: "high",
      },
    }]),
  ];

  return buildWeeklyProgressReviewFromRows({
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
    planItems,
    weekPlans: [
      { plan_item_id: "habit-1", status: "confirmed" },
      { plan_item_id: "mission-1", status: "confirmed" },
    ],
    occurrences: [...habitOccurrences, missionOccurrence],
    entries,
  });
}

Deno.test("validated_habits_advance", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done", "done"],
    mission: "missed",
    missionStillRelevant: true,
  }));
  assertEquals(decision.habit_verdict.status, "validated");
  assertEquals(decision.week_strategy.decision, "advance");
});

Deno.test("partial_with_fatigue_bridge_week", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "missed", "partial"],
    blocker: "fatigue",
  }));
  assertEquals(decision.habit_verdict.status, "partial_validatable");
  assertEquals(decision.week_strategy.decision, "bridge_week");
});

Deno.test("failed_not_relevant_level_review", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["missed", "missed", "missed"],
    blocker: "not_relevant",
    missionStillRelevant: false,
  }));
  assertEquals(decision.week_strategy.decision, "level_review");
  assertEquals(decision.status, "escalate_level_review");
  assertEquals(decision.plan_patch.operations[0].op, "open_level_review");
});

Deno.test("no_signal_asks_question", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["planned", "planned", "planned"],
    mission: "planned",
    omitDailyEvidence: true,
  }));
  assertEquals(decision.habit_verdict.status, "no_signal");
  assertEquals(decision.status, "ask_question");
});

Deno.test("low_daily_coverage_blocks_confirmation", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done"],
    mission: "planned",
    omitDailyEvidence: true,
  }));
  assertEquals(decision.evidence.daily_coverage, "none");
  assertEquals(decision.status, "ask_question");
  assertEquals(decision.effect_plan.allowed, false);
});

Deno.test("completed_mission_never_carried_over", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done"],
    mission: "done",
  }));
  const mission = decision.item_decisions.find((item) =>
    item.plan_item_id === "mission-1"
  );
  assertEquals(mission?.decision, "mark_completed");
  assertEquals(
    decision.plan_patch.operations.some((op) =>
      op.op === "carry_over_item" && op.plan_item_id === "mission-1"
    ),
    false,
  );
});

Deno.test("habit_done_counted_not_rescheduled", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "missed"],
    mission: "missed",
  }));
  const doneHabit = decision.item_decisions.find((item) =>
    item.occurrence_id === "habit-occ-1"
  );
  assertEquals(doneHabit?.decision, "keep");
  assertEquals(doneHabit?.evidence_done, true);
});

Deno.test("drop_only_when_still_relevant_false", () => {
  const kept = reduceWeeklyReview(review({
    habits: ["missed", "missed", "missed"],
    blocker: "context",
    missionStillRelevant: true,
  }));
  assertEquals(
    kept.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision === "drop",
    false,
  );

  const dropped = reduceWeeklyReview(review({
    habits: ["missed", "missed", "missed"],
    blocker: "context",
    missionStillRelevant: false,
  }));
  assertEquals(
    dropped.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision,
    "drop",
  );
});

Deno.test("too_hard_non_habit_split_or_replace", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "partial"],
    blocker: "too_hard",
    missionStillRelevant: true,
  }));
  assertEquals(
    decision.item_decisions.find((item) => item.plan_item_id === "mission-1")
      ?.decision,
    "split_or_replace",
  );
});

Deno.test("daily_evidence_reason_category_drives_strategy", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["missed", "missed", "missed"],
    blocker: "emotional",
  }));
  assertEquals(decision.evidence.dominant_blockers, ["emotional"]);
  assertEquals(decision.week_strategy.decision, "bridge_week");
});

Deno.test("not_answered_count_adds_warning", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "planned", "planned"],
    mission: "planned",
  }));
  assertEquals(decision.evidence.unanswered_count, 3);
  assertEquals(decision.status, "ask_question");
});

Deno.test("rescheduled_open_count_does_not_mark_done", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done"],
    mission: "rescheduled",
  }));
  const mission = decision.item_decisions.find((item) =>
    item.plan_item_id === "mission-1"
  );
  assertEquals(mission?.current_week_status, "rescheduled");
  assertEquals(mission?.evidence_done, false);
});

Deno.test("plan_patch_always_requires_confirmation", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done"],
    mission: "missed",
  }));
  assertEquals(decision.plan_patch.requires_confirmation, true);
  assertEquals(
    decision.effect_plan.effects.every((effect) =>
      effect.requires_confirmation
    ),
    true,
  );
});

Deno.test("approve_pending_patch_applies", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["done", "done", "done"],
    mission: "missed",
  }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "ok",
      pending_patch: decision.plan_patch,
    }),
    "approve",
  );
});

Deno.test("reject_pending_patch_clears", () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "non",
      pending_patch: decision.plan_patch,
    }),
    "reject",
  );
});

Deno.test("explain_pending_patch_no_apply", () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "explique pourquoi",
      pending_patch: decision.plan_patch,
    }),
    "explain",
  );
});

Deno.test("revise_pending_patch_no_apply_until_confirmed", () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "change plutot la mission",
      pending_patch: decision.plan_patch,
    }),
    "revise",
  );
});

Deno.test("unrelated_message_does_not_apply", () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "au fait j'ai une autre question",
      pending_patch: decision.plan_patch,
    }),
    "unrelated",
  );
});

Deno.test("no_done_language_without_committed_effect", () => {
  const text = renderWeeklyEffectsAck({
    result: { committed_effects: [], failed_effects: [] },
  });
  assertEquals(/\b(applique|enregistre|valide|corrige)\b/i.test(text), false);
});

Deno.test("writer_failure_reports_failure", async () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  const result = await applyWeeklyReviewEffects({
    plan_patch: decision.plan_patch,
    user_id: "user-1",
    week_start_date: "2026-04-27",
    confirmed: true,
    writer: {
      applyWeeklyPlanPatch: () =>
        Promise.resolve({ committed: false, error: "db failed" }),
    },
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.failed_effects[0].error, "db failed");
  assertEquals(renderWeeklyEffectsAck({ result }).includes("echoue"), true);
});

Deno.test("committed_effects_required_for_applied_status", () => {
  assertEquals(
    weeklyReviewAppliedStatusForEffects({
      committed_effects: [],
      failed_effects: [{ op: "advance_week", error: "fail" }],
    }),
    "blocked",
  );
  assertEquals(
    weeklyReviewAppliedStatusForEffects({
      committed_effects: [{ op: "advance_week" }],
      failed_effects: [],
    }),
    "applied",
  );
});

Deno.test("bridge_week_rendered_as_semaine_allegee", () => {
  const decision = reduceWeeklyReview(review({
    habits: ["missed", "missed", "missed"],
    blocker: "fatigue",
  }));
  const rendered = renderWeeklyReviewDecision({
    ...decision,
    status: "ready_for_confirmation",
    question: null,
  });
  assertEquals(rendered.includes("semaine allegee"), true);
});

Deno.test("no_internal_strategy_labels_visible", () => {
  const rendered = renderWeeklyReviewDecision(reduceWeeklyReview(review({
    habits: ["missed", "missed"],
    blocker: "fatigue",
  })));
  assertEquals(
    /bridge_week|plan_patch|carry_over|level_review/.test(rendered),
    false,
  );
});

Deno.test("one_question_max_when_asking", () => {
  const rendered = renderWeeklyReviewDecision(reduceWeeklyReview(review({
    habits: ["planned", "planned"],
    omitDailyEvidence: true,
  })));
  assertEquals((rendered.match(/\?/g) ?? []).length <= 1, true);
});

Deno.test("no_tool_suggestion_during_opening", () => {
  const rendered = renderWeeklyReviewDecision(reduceWeeklyReview(review({
    habits: ["planned", "planned"],
    omitDailyEvidence: true,
  })));
  assertEquals(/\b(carte|potion|outil)\b/i.test(rendered), false);
});

Deno.test("safety_stops_weekly_no_patch", () => {
  const decision = reduceWeeklyReview(
    review({ habits: ["done", "done"] }),
    {},
    "safety",
  );
  assertEquals(decision.status, "blocked");
  assertEquals(decision.effect_plan.allowed, false);
});

Deno.test("user_stopped_clears_or_pauses_weekly", () => {
  const decision = reduceWeeklyReview(
    review({ habits: ["done", "done"] }),
    {},
    "user_stopped",
  );
  assertEquals(decision.status, "stopped");
  assertEquals(renderWeeklyReviewDecision(decision).includes("cote"), true);
});

Deno.test("off_topic_preserves_pending_patch_without_applying", () => {
  const decision = reduceWeeklyReview(review({ habits: ["done", "done"] }));
  assertEquals(
    reviewWeeklyPatchConfirmation({
      user_message: "tu peux me parler d'autre chose",
      pending_patch: decision.plan_patch,
    }),
    "unrelated",
  );
});

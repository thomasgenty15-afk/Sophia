import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDailyActionReviewActionIntelligence,
  buildDailyActionReviewInstruction,
  buildInitialDailyActionReviewState,
  dailyActionReviewFocusTargets,
  dailyActionReviewOpeningHasForbiddenCoaching,
  type DailyActionReviewTarget,
} from "./daily_action_review.ts";
import {
  dailyReviewEffectsFullyCommitted,
  executeDailyReviewEffectPlan,
} from "./daily_action_review/executor.ts";
import type { DailyReviewEffectPlan } from "./daily_action_review/contract.ts";

function target(
  id: string,
  planId: string,
  title: string,
  dimension: "habits" | "missions" | "clarifications",
): DailyActionReviewTarget {
  return {
    occurrence_id: id,
    cycle_id: "cycle",
    transformation_id: "transformation",
    plan_id: planId,
    plan_item_id: `item-${id}`,
    title,
    dimension,
    kind: dimension === "habits"
      ? "habit"
      : dimension === "missions"
      ? "task"
      : "clarification",
    tracking_type: "boolean",
    planned_day: "mon",
    original_planned_day: null,
    week_start_date: "2026-05-11",
  };
}

Deno.test("daily action review initial state groups four actions by same plan", () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("b1", "plan-b", "Marche rapide", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
    target("b2", "plan-b", "Clarifier le blocage", "clarifications"),
  ];

  const state = buildInitialDailyActionReviewState(targets);

  assertEquals(state.current_focus_occurrence_ids, ["a1", "a2"]);
  assertEquals(state.remaining_occurrence_ids, ["b1", "b2"]);
  assertEquals(state.asked_occurrence_ids_history, [["a1", "a2"]]);
  assertEquals(
    dailyActionReviewFocusTargets(targets, state).map((item) =>
      item.occurrence_id
    ),
    ["a1", "a2"],
  );
});

Deno.test("daily action review selector handles one action, two actions, plans and type priority", () => {
  const one = [target("a1", "plan-a", "Session focus", "habits")];
  assertEquals(
    buildInitialDailyActionReviewState(one).current_focus_occurrence_ids,
    ["a1"],
  );

  const samePlan = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
  ];
  assertEquals(
    buildInitialDailyActionReviewState(samePlan).current_focus_occurrence_ids,
    ["a1", "a2"],
  );

  const priority = [
    target("c1", "plan-c", "Clarifier", "clarifications"),
    target("m1", "plan-m", "Mission", "missions"),
    target("h1", "plan-h", "Habit", "habits"),
  ];
  assertEquals(
    buildInitialDailyActionReviewState(priority).current_focus_occurrence_ids,
    ["h1", "m1"],
  );
});

Deno.test("opening mentions only focus targets and forbids solution/tool language", () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
    target("b1", "plan-b", "Marche rapide", "habits"),
  ];
  const state = buildInitialDailyActionReviewState(targets);
  const focusTargets = dailyActionReviewFocusTargets(targets, state);
  const instruction = buildDailyActionReviewInstruction(focusTargets);

  assertStringIncludes(instruction, "Session focus");
  assertStringIncludes(instruction, "Parking a idees");
  assertEquals(instruction.includes("Marche rapide"), false);
  assertStringIncludes(instruction, "une seule question principale");
  assertStringIncludes(instruction, "Ne propose pas de solution");
  assertEquals(
    dailyActionReviewOpeningHasForbiddenCoaching(
      "Je te propose une potion pour ajuster le plan.",
    ),
    true,
  );
});

Deno.test("daily action review action intelligence excludes sensitive memory", () => {
  const targets = [target("a1", "plan-a", "Session focus", "habits")];
  const intelligence = buildDailyActionReviewActionIntelligence({
    targets,
    memoryItems: [
      {
        id: "mem-recent",
        kind: "action_observation",
        content_text: "Session focus a ete ratee hier pour fatigue.",
        status: "active",
        sensitivity_level: "normal",
        action_link: {
          plan_item_id: "item-a1",
          aggregation_kind: "single_occurrence",
        },
      },
      {
        id: "mem-sensitive",
        kind: "action_observation",
        content_text: "Detail sensible a ne pas injecter.",
        status: "active",
        sensitivity_level: "sensitive",
        action_link: {
          plan_item_id: "item-a1",
          aggregation_kind: "single_occurrence",
        },
      },
    ],
  });

  assertEquals(intelligence.a1.recent_observations.length, 1);
  assertEquals(
    intelligence.a1.recent_observations.some((item) =>
      item.includes("sensible")
    ),
    false,
  );
});

Deno.test("daily review executor ignores disallowed effect plan", async () => {
  let writeCalled = false;
  const result = await executeDailyReviewEffectPlan({
    effect_plan: { allowed: false, effects: [] },
    writeEffect: async () => {
      writeCalled = true;
      return { entry_id: "entry-1" };
    },
  });

  assertEquals(writeCalled, false);
  assertEquals(result.committed_effects, []);
  assertEquals(result.failed_effects, []);
});

Deno.test("daily review executor returns committed effect after successful write", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "completed",
      reason_category: "none",
      reason_text: null,
      still_relevant: null,
      source: "daily_action_review_v1",
    }],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => ({ entry_id: "entry-1" }),
  });

  assertEquals(result.failed_effects, []);
  assertEquals(result.committed_effects, [{
    type: "log_daily_action_review",
    occurrence_id: "occ-1",
    plan_item_id: "item-1",
    entry_id: "entry-1",
    outcome: "completed",
    reason_category: "none",
    source: "daily_action_review_v1",
    commit_status: "inserted",
  }]);
  assertEquals(dailyReviewEffectsFullyCommitted({ effect_plan, result }), true);
});

Deno.test("daily review executor records writer failure without committed effect", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "missed",
      reason_category: "fatigue",
      reason_text: "fatigue",
      still_relevant: true,
      source: "daily_action_review_v1",
    }],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => {
      throw new Error("insert_failed");
    },
  });

  assertEquals(result.committed_effects, []);
  assertEquals(result.failed_effects, [{
    type: "log_daily_action_review",
    occurrence_id: "occ-1",
    plan_item_id: "item-1",
    error: "insert_failed",
  }]);
  assertEquals(
    dailyReviewEffectsFullyCommitted({ effect_plan, result }),
    false,
  );
});

Deno.test("daily review partial success does not claim all done", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [
      {
        type: "log_daily_action_review",
        occurrence_id: "occ-1",
        plan_item_id: "item-1",
        outcome: "completed",
        reason_category: "none",
        reason_text: null,
        still_relevant: null,
        source: "daily_action_review_v1",
      },
      {
        type: "log_daily_action_review",
        occurrence_id: "occ-2",
        plan_item_id: "item-2",
        outcome: "partial",
        reason_category: "too_hard",
        reason_text: "trop dur",
        still_relevant: null,
        source: "daily_action_review_v1",
      },
    ],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async (effect) => {
      if (effect.occurrence_id === "occ-2") throw new Error("insert_failed");
      return { entry_id: "entry-1" };
    },
  });

  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.failed_effects.length, 1);
  assertEquals(
    dailyReviewEffectsFullyCommitted({ effect_plan, result }),
    false,
  );
});

Deno.test("daily review existing entry is explicit idempotent commit", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "completed",
      reason_category: "none",
      reason_text: null,
      still_relevant: null,
      source: "daily_action_review_v1",
    }],
  };
  let insertCalls = 0;
  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => {
      insertCalls += 1;
      return { entry_id: "existing-entry", commit_status: "already_existing" };
    },
  });

  assertEquals(insertCalls, 1);
  assertEquals(result.committed_effects[0].entry_id, "existing-entry");
  assertEquals(result.committed_effects[0].commit_status, "already_existing");
  assertEquals(dailyReviewEffectsFullyCommitted({ effect_plan, result }), true);
});

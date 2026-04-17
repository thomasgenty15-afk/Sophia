import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import {
  type DailyBilanDeciderInput,
  decideDailyBilan,
} from "./v2-daily-bilan-decider.ts";
import type {
  ConversationPulse,
  MomentumStateV2,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "./v2-types.ts";
import type { PlanItemRuntimeRow } from "./v2-runtime.ts";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-03-24T14:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

function baseMomentum(
  overrides: Partial<MomentumStateV2> = {},
): MomentumStateV2 {
  return {
    version: 2,
    updated_at: NOW_ISO,
    current_state: "friction_legere",
    state_reason: "test",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "medium" },
    active_load: {
      current_load_score: 4,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "push_lightly", confidence: "medium" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    ...overrides,
  };
}

function baseEntry(
  planItemId: string,
  kind: UserPlanItemEntryRow["entry_kind"],
  daysAgo = 0,
): UserPlanItemEntryRow {
  const effectiveAt = new Date(NOW_MS - daysAgo * 86400000).toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    plan_item_id: planItemId,
    entry_kind: kind,
    outcome: kind,
    value_numeric: null,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: effectiveAt,
    effective_at: effectiveAt,
    metadata: {},
  };
}

function basePlanItem(
  id: string,
  overrides: Partial<UserPlanItemRow> = {},
  entries: UserPlanItemEntryRow[] = [],
): PlanItemRuntimeRow {
  return {
    id,
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    dimension: "missions",
    kind: "task",
    status: "active",
    title: `Item ${id}`,
    description: null,
    tracking_type: "boolean",
    activation_order: null,
    activation_condition: null,
    current_habit_state: null,
    support_mode: null,
    support_function: null,
    target_reps: null,
    current_reps: null,
    cadence_label: null,
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    payload: {},
    created_at: "2026-03-17T10:00:00.000Z",
    updated_at: NOW_ISO,
    activated_at: "2026-03-17T10:00:00.000Z",
    completed_at: null,
    last_entry_at: entries.length > 0 ? entries[0].effective_at : null,
    recent_entries: entries,
    ...overrides,
  } as PlanItemRuntimeRow;
}

function baseInput(
  overrides: Partial<DailyBilanDeciderInput> = {},
): DailyBilanDeciderInput {
  return {
    planItemsRuntime: [
      basePlanItem("item-1", {}, [baseEntry("item-1", "checkin", 1)]),
    ],
    momentum: baseMomentum(),
    nowIso: NOW_ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: MOMENTUM — everything going well → check_light
// ---------------------------------------------------------------------------

Deno.test("scenario: momentum — defaults to check_light", () => {
  const decision = decideDailyBilan(baseInput());

  assertEquals(decision.output.mode, "check_light");
  assertEquals(decision.output.prompt_shape.tone, "light");
  assertEquals(decision.output.target_items.length, 1);
  assertEquals(decision.deterministic, true);
  assertEquals(decision.reason, "default_light_check");
  assertEquals(decision.output.expected_capture.progress_evidence, true);
  assertEquals(decision.output.next_actions.update_momentum, true);
  assertEquals(decision.output.next_actions.trigger_coaching_review, false);
});

// ---------------------------------------------------------------------------
// Scenario 2: FRICTION — repeated blockers → check_blocker
// ---------------------------------------------------------------------------

Deno.test("scenario: friction — repeated blockers trigger check_blocker", () => {
  const blockedItem = basePlanItem(
    "item-blocked",
    {},
    [
      baseEntry("item-blocked", "blocker", 0),
      baseEntry("item-blocked", "blocker", 1),
      baseEntry("item-blocked", "skip", 2),
    ],
  );

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [blockedItem],
  }));

  assertEquals(decision.output.mode, "check_blocker");
  assertEquals(decision.output.prompt_shape.tone, "direct");
  assert(decision.signals.repeated_blocker);
  assertEquals(decision.output.expected_capture.blocker_hint, true);
  assertEquals(decision.output.expected_capture.difficulty, true);
  assertEquals(decision.output.next_actions.trigger_coaching_review, true);
});

Deno.test("scenario: friction — momentum blocker_repeat_score >= 2 triggers check_blocker", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      blockers: { blocker_kind: "mission", blocker_repeat_score: 3 },
    }),
  }));

  assertEquals(decision.output.mode, "check_blocker");
  assert(decision.signals.repeated_blocker);
});

// ---------------------------------------------------------------------------
// Scenario 3: BLOCKER / declining traction → check_blocker
// ---------------------------------------------------------------------------

Deno.test("scenario: declining traction triggers check_blocker", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "down", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_blocker");
  assertEquals(decision.reason, "declining_traction");
  assert(decision.signals.declining_traction);
});

// ---------------------------------------------------------------------------
// Scenario 4: PROGRESS — strong momentum → check_progress
// ---------------------------------------------------------------------------

Deno.test("scenario: strong progress triggers check_progress", () => {
  const goodItem = basePlanItem(
    "item-good",
    {},
    [
      baseEntry("item-good", "progress", 0),
      baseEntry("item-good", "checkin", 1),
    ],
  );

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [goodItem],
    momentum: baseMomentum({
      current_state: "momentum",
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "up", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_progress");
  assertEquals(decision.reason, "strong_execution_traction");
  assertEquals(decision.output.prompt_shape.tone, "light");
  assertEquals(decision.output.expected_capture.progress_evidence, true);
});

// ---------------------------------------------------------------------------
// Scenario 5: SILENCE / supportive reactivation
// ---------------------------------------------------------------------------

Deno.test("scenario: silence / reactivation triggers check_supportive", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      current_state: "reactivation",
      dimensions: {
        ...baseMomentum().dimensions,
        engagement: { level: "low", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.reason, "reactivation_support_needed");
  assert(decision.signals.reactivation_needed);
  assertEquals(decision.output.prompt_shape.tone, "supportive");
});

Deno.test("scenario: emotional distress triggers check_supportive", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      current_state: "soutien_emotionnel",
      dimensions: {
        ...baseMomentum().dimensions,
        emotional_load: { level: "high", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.output.prompt_shape.tone, "supportive");
  assertEquals(decision.output.expected_capture.consent_signal, true);
  assertEquals(decision.output.expected_capture.support_usefulness, true);
  assertEquals(decision.output.expected_capture.progress_evidence, false);
});

Deno.test("scenario: consent closed triggers check_supportive", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      dimensions: {
        ...baseMomentum().dimensions,
        consent: { level: "closed", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assert(decision.signals.emotional_distress);
});

Deno.test("scenario: conversation pulse with repair need triggers check_supportive", () => {
  const pulse: ConversationPulse = {
    version: 1,
    generated_at: NOW_ISO,
    window_days: 7,
    last_72h_weight: 0.6,
    tone: {
      dominant: "strained",
      emotional_load: "high",
      relational_openness: "fragile",
    },
    trajectory: { direction: "down", confidence: "medium", summary: "test" },
    highlights: {
      wins: [],
      friction_points: ["conflict"],
      support_that_helped: [],
      unresolved_tensions: ["tension"],
    },
    signals: {
      top_blocker: null,
      likely_need: "repair",
      upcoming_event: null,
      proactive_risk: "high",
    },
    evidence_refs: { message_ids: [], event_ids: [] },
  };

  const decision = decideDailyBilan(baseInput({
    conversationPulse: pulse,
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assert(decision.signals.has_pulse);
});

Deno.test("scenario: conversation pulse silence need triggers check_supportive", () => {
  const pulse: ConversationPulse = {
    version: 1,
    generated_at: NOW_ISO,
    window_days: 7,
    last_72h_weight: 0.6,
    tone: {
      dominant: "mixed",
      emotional_load: "medium",
      relational_openness: "fragile",
    },
    trajectory: { direction: "down", confidence: "medium", summary: "test" },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "silence",
      upcoming_event: null,
      proactive_risk: "medium",
    },
    evidence_refs: { message_ids: [], event_ids: [] },
  };

  const decision = decideDailyBilan(baseInput({
    conversationPulse: pulse,
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.reason, "reactivation_support_needed");
  assert(decision.signals.reactivation_needed);
});

// ---------------------------------------------------------------------------
// Edge case: no active items → check_light with empty targets
// ---------------------------------------------------------------------------

Deno.test("edge: no active items produces check_light with empty targets", () => {
  const pending = basePlanItem("item-p", { status: "pending" });

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [pending],
  }));

  assertEquals(decision.output.mode, "check_light");
  assertEquals(decision.output.target_items.length, 0);
});

// ---------------------------------------------------------------------------
// Edge case: supportive mode prefers clarification items
// ---------------------------------------------------------------------------

Deno.test("edge: supportive mode targets clarification items first", () => {
  const clarificationItem = basePlanItem("item-clarification", {
    dimension: "clarifications",
    kind: "framework",
  }, [baseEntry("item-clarification", "support_feedback", 1)]);

  const missionItem = basePlanItem("item-mission", {
    dimension: "missions",
  }, [baseEntry("item-mission", "checkin", 1)]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [missionItem, clarificationItem],
    momentum: baseMomentum({
      current_state: "soutien_emotionnel",
      dimensions: {
        ...baseMomentum().dimensions,
        emotional_load: { level: "high" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.output.target_items, ["item-clarification"]);
});

Deno.test("edge: supportive mode prefers clarification over mission fallback", () => {
  const clarificationLater = basePlanItem("clarification-later", {
    dimension: "clarifications",
    kind: "framework",
  }, [baseEntry("clarification-later", "support_feedback", 0)]);

  const missionItem = basePlanItem("mission-now", {
    dimension: "missions",
  }, [baseEntry("mission-now", "checkin", 2)]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [clarificationLater, missionItem],
    momentum: baseMomentum({
      current_state: "reactivation",
      dimensions: {
        ...baseMomentum().dimensions,
        engagement: { level: "low" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.output.target_items, ["clarification-later"]);
});

Deno.test("edge: supportive mode prefers maintenance habit over mission fallback", () => {
  const maintenanceHabit = basePlanItem("habit-soft", {
    dimension: "habits",
    kind: "habit",
    current_habit_state: "in_maintenance",
  }, [baseEntry("habit-soft", "checkin", 2)]);

  const missionItem = basePlanItem("mission-hard", {
    dimension: "missions",
  }, [baseEntry("mission-hard", "checkin", 0)]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [missionItem, maintenanceHabit],
    momentum: baseMomentum({
      current_state: "reactivation",
      dimensions: {
        ...baseMomentum().dimensions,
        engagement: { level: "low" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assertEquals(decision.output.target_items, ["habit-soft"]);
});

// ---------------------------------------------------------------------------
// Edge case: light mode prefers habits scheduled today
// ---------------------------------------------------------------------------

Deno.test("edge: light mode prefers today's scheduled habit", () => {
  const habitToday = basePlanItem("habit-today", {
    dimension: "habits",
    kind: "habit",
    current_habit_state: "active_building",
    scheduled_days: ["mon"],
  });

  const missionOlder = basePlanItem("mission-old", {
    dimension: "missions",
  }, [baseEntry("mission-old", "checkin", 5)]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [missionOlder, habitToday],
    localDayOfWeek: "mon",
  }));

  assertEquals(decision.output.mode, "check_light");
  assertEquals(decision.output.target_items, ["habit-today"]);
});

// ---------------------------------------------------------------------------
// Edge case: stalled items prevent check_progress
// ---------------------------------------------------------------------------

Deno.test("edge: stalled items block check_progress even with momentum", () => {
  const stalledItem = basePlanItem("item-stalled", {
    activated_at: "2026-03-10T10:00:00.000Z",
  });

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [stalledItem],
    momentum: baseMomentum({
      current_state: "momentum",
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "up", reason: "test" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_light");
  assert(decision.signals.has_stalled_items);
  assert(decision.signals.strong_progress);
});

// ---------------------------------------------------------------------------
// Edge case: emotional_distress takes priority over repeated_blocker
// ---------------------------------------------------------------------------

Deno.test("edge: emotional distress takes priority over blockers", () => {
  const decision = decideDailyBilan(baseInput({
    momentum: baseMomentum({
      current_state: "soutien_emotionnel",
      dimensions: {
        ...baseMomentum().dimensions,
        emotional_load: { level: "high" },
        execution_traction: { level: "down" },
      },
      blockers: { blocker_kind: "mission", blocker_repeat_score: 5 },
    }),
  }));

  assertEquals(decision.output.mode, "check_supportive");
  assert(decision.signals.emotional_distress);
  assert(decision.signals.repeated_blocker);
  assert(decision.signals.declining_traction);
});

// ---------------------------------------------------------------------------
// Edge case: unlock candidate detection
// ---------------------------------------------------------------------------

Deno.test("edge: mark_unlock_candidate true when progress + pending items", () => {
  const pendingItem = basePlanItem("item-pending", {
    status: "pending",
    activation_condition: { type: "depends_on", target: "item-done" },
  });
  const activeItem = basePlanItem("item-active", {}, [
    baseEntry("item-active", "progress", 0),
  ]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [activeItem, pendingItem],
    momentum: baseMomentum({
      current_state: "momentum",
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "up" },
      },
    }),
  }));

  assertEquals(decision.output.mode, "check_progress");
  assertEquals(decision.output.next_actions.mark_unlock_candidate, true);
});

// ---------------------------------------------------------------------------
// Edge case: blocker mode selects up to 2 blocked items
// ---------------------------------------------------------------------------

Deno.test("edge: blocker mode picks max 2 items sorted by blocker count", () => {
  const item1 = basePlanItem("item-b1", {}, [
    baseEntry("item-b1", "blocker", 0),
    baseEntry("item-b1", "blocker", 1),
    baseEntry("item-b1", "blocker", 2),
  ]);
  const item2 = basePlanItem("item-b2", {}, [
    baseEntry("item-b2", "blocker", 0),
    baseEntry("item-b2", "skip", 1),
  ]);
  const item3 = basePlanItem("item-b3", {}, [
    baseEntry("item-b3", "blocker", 0),
  ]);

  const decision = decideDailyBilan(baseInput({
    planItemsRuntime: [item3, item1, item2],
  }));

  assertEquals(decision.output.mode, "check_blocker");
  assertEquals(decision.output.target_items.length, 2);
  assertEquals(decision.output.target_items[0], "item-b1");
  assertEquals(decision.output.target_items[1], "item-b2");
});

// ---------------------------------------------------------------------------
// max_questions is always 3 (schema invariant)
// ---------------------------------------------------------------------------

Deno.test("invariant: max_questions is always 3", () => {
  for (
    const mode of [
      "check_light",
      "check_supportive",
      "check_blocker",
      "check_progress",
    ] as const
  ) {
    const momentum = mode === "check_supportive"
      ? baseMomentum({
        current_state: "soutien_emotionnel",
        dimensions: {
          ...baseMomentum().dimensions,
          emotional_load: { level: "high" },
        },
      })
      : mode === "check_blocker"
      ? baseMomentum({
        blockers: { blocker_kind: "mission", blocker_repeat_score: 3 },
      })
      : mode === "check_progress"
      ? baseMomentum({
        current_state: "momentum",
        dimensions: {
          ...baseMomentum().dimensions,
          execution_traction: { level: "up" },
        },
      })
      : baseMomentum();

    const decision = decideDailyBilan(baseInput({ momentum }));
    assertEquals(
      decision.output.prompt_shape.max_questions,
      3,
      `max_questions should be 3 for mode ${mode}`,
    );
  }
});

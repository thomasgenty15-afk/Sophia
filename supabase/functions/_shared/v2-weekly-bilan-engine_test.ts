import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

import {
  type MaterializeResult,
  materializeWeeklyAdjustments,
  parseWeeklyBilanLLMResponse,
  validateWeeklyBilanOutput,
} from "./v2-weekly-bilan-engine.ts";

import type {
  WeeklyBilanV2Input,
  WeeklyItemSnapshot,
} from "./v2-prompts/weekly-recalibrage.ts";
import {
  buildWeeklyBilanV2Input,
  buildWeeklyItemSnapshot,
} from "./v2-prompts/weekly-recalibrage.ts";

import type { MomentumStateV2 } from "./v2-types.ts";
import type {
  CurrentPhaseRuntimeContext,
  PlanItemRuntimeRow,
} from "./v2-runtime.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<WeeklyItemSnapshot> = {},
): WeeklyItemSnapshot {
  return {
    id: "item-1",
    title: "Meditation quotidienne",
    dimension: "habits",
    kind: "habit",
    status: "active",
    week_entries_count: 5,
    positive_entries: 4,
    blocker_entries: 0,
    skip_entries: 1,
    difficulty_high_count: 0,
    completion_rate: 0.8,
    has_strong_progress: true,
    has_repeated_blocker: false,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<WeeklyBilanV2Input> = {},
): WeeklyBilanV2Input {
  return {
    items: [makeItem()],
    phase_context: null,
    momentum: {
      current_state: "momentum",
      posture: "push_lightly",
      emotional_load: "low",
      consent_level: "open",
      execution_traction: "up",
      load_balance: "balanced",
      top_blocker: null,
      top_risk: null,
    },
    pulse_summary: null,
    weekly_digest: null,
    victories: ["Meditation quotidienne"],
    recurring_blockers: [],
    ...overrides,
  };
}

// =========================================================================
// Validator tests
// =========================================================================

Deno.test("validator: valid hold decision passes", () => {
  const input = makeInput();
  const raw = {
    decision: "hold",
    reasoning: "Stable week, keep going",
    retained_wins: ["Meditation"],
    retained_blockers: [],
    load_adjustments: [],
    suggested_posture_next_week: "steady",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(result.valid);
  assertEquals(result.output.decision, "hold");
  assertEquals(result.output.suggested_posture_next_week, "steady");
});

Deno.test("validator: reduce + activate → rejection", () => {
  const input = makeInput({
    items: [
      makeItem({ id: "item-1" }),
      makeItem({ id: "item-2", status: "pending", has_strong_progress: false }),
    ],
  });

  const raw = {
    decision: "reduce",
    reasoning: "User is overloaded",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [
      { type: "deactivate", target_item_id: "item-1", reason: "too much" },
      { type: "activate", target_item_id: "item-2", reason: "new opportunity" },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(
    result.violations.some((v) =>
      v.includes("reduce") && v.includes("activate")
    ),
  );
  assertEquals(result.output.decision, "hold");
});

Deno.test("validator: expand without strong progress → rejection", () => {
  const input = makeInput({
    items: [makeItem({ has_strong_progress: false, completion_rate: 0.3 })],
    victories: [],
  });

  const raw = {
    decision: "expand",
    reasoning: "Let's add more",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [],
    suggested_posture_next_week: "steady",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(
    result.violations.some((v) =>
      v.includes("expand") && v.includes("strong progress")
    ),
  );
});

Deno.test("validator: expand with strong progress → valid", () => {
  const input = makeInput({
    items: [makeItem({ has_strong_progress: true })],
  });

  const raw = {
    decision: "expand",
    reasoning: "Strong traction, let's expand",
    retained_wins: ["Meditation quotidienne"],
    retained_blockers: [],
    load_adjustments: [],
    suggested_posture_next_week: "steady",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(result.valid);
  assertEquals(result.output.decision, "expand");
});

Deno.test("validator: unknown target_item_id → rejection", () => {
  const input = makeInput({
    items: [makeItem({ id: "item-1" })],
  });

  const raw = {
    decision: "consolidate",
    reasoning: "Fragile progress",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [
      { type: "maintenance", target_item_id: "item-999", reason: "lighten" },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("unknown target_item_id")));
});

Deno.test("validator: duplicate target_item_id → rejection", () => {
  const input = makeInput({
    items: [makeItem({ id: "item-1" })],
  });

  const raw = {
    decision: "consolidate",
    reasoning: "Fragile progress",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [
      { type: "maintenance", target_item_id: "item-1", reason: "lighten" },
      { type: "deactivate", target_item_id: "item-1", reason: "remove" },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("duplicate target_item_id")));
});

Deno.test("validator: more than 3 adjustments → rejection", () => {
  const items = [
    makeItem({ id: "item-1" }),
    makeItem({ id: "item-2" }),
    makeItem({ id: "item-3" }),
    makeItem({ id: "item-4" }),
  ];
  const input = makeInput({ items });

  const raw = {
    decision: "consolidate",
    reasoning: "Major reshuffle",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [
      { type: "maintenance", target_item_id: "item-1", reason: "a" },
      { type: "maintenance", target_item_id: "item-2", reason: "b" },
      { type: "deactivate", target_item_id: "item-3", reason: "c" },
      { type: "deactivate", target_item_id: "item-4", reason: "d" },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("too many adjustments")));
});

Deno.test("validator: invalid decision string → rejection", () => {
  const input = makeInput();
  const raw = {
    decision: "turbo",
    reasoning: "Go fast",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [],
    suggested_posture_next_week: "steady",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("invalid decision")));
});

Deno.test("validator: null input → rejection", () => {
  const input = makeInput();
  const result = validateWeeklyBilanOutput(null, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("not an object")));
});

Deno.test("validator: valid consolidate with 2 adjustments passes", () => {
  const items = [
    makeItem({ id: "item-1" }),
    makeItem({ id: "item-2", has_strong_progress: false }),
  ];
  const input = makeInput({ items });

  const raw = {
    decision: "consolidate",
    reasoning: "Inégal — on allège item-2",
    retained_wins: ["Meditation quotidienne"],
    retained_blockers: [],
    load_adjustments: [
      { type: "maintenance", target_item_id: "item-2", reason: "suivi allégé" },
    ],
    coaching_note: "Belle constance sur la méditation, on protège ça.",
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(result.valid);
  assertEquals(result.output.decision, "consolidate");
  assertEquals(result.output.load_adjustments.length, 1);
  assertEquals(
    result.output.coaching_note,
    "Belle constance sur la méditation, on protège ça.",
  );
});

Deno.test("validator: reduce without activate is valid", () => {
  const input = makeInput({
    items: [
      makeItem({ id: "item-1" }),
      makeItem({ id: "item-2" }),
    ],
  });

  const raw = {
    decision: "reduce",
    reasoning: "Overloaded, reducing",
    retained_wins: [],
    retained_blockers: ["item-2 blocker"],
    load_adjustments: [
      { type: "deactivate", target_item_id: "item-2", reason: "lighten" },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(result.valid);
  assertEquals(result.output.decision, "reduce");
});

Deno.test("validator: replace without replacement item id → rejection", () => {
  const input = makeInput({
    items: [
      makeItem({ id: "11111111-1111-1111-1111-111111111111" }),
      makeItem({
        id: "22222222-2222-2222-2222-222222222222",
        status: "pending",
      }),
    ],
  });

  const raw = {
    decision: "consolidate",
    reasoning: "Swap one item",
    retained_wins: [],
    retained_blockers: [],
    load_adjustments: [
      {
        type: "replace",
        target_item_id: "11111111-1111-1111-1111-111111111111",
        reason: "swap to a gentler item",
      },
    ],
    suggested_posture_next_week: "lighter",
  };

  const result = validateWeeklyBilanOutput(raw, input);
  assert(!result.valid);
  assert(
    result.violations.some((v) => v.includes("missing replacement item id")),
  );
});

// =========================================================================
// LLM response parser tests
// =========================================================================

Deno.test("parseWeeklyBilanLLMResponse: valid JSON embedded in text", () => {
  const input = makeInput();
  const text =
    `Here is the result:\n\n{"decision":"hold","reasoning":"All good","retained_wins":[],"retained_blockers":[],"load_adjustments":[],"suggested_posture_next_week":"steady"}\n\nDone.`;

  const result = parseWeeklyBilanLLMResponse(text, input);
  assert(result.valid);
  assertEquals(result.output.decision, "hold");
});

Deno.test("parseWeeklyBilanLLMResponse: garbage text → fallback hold", () => {
  const input = makeInput();
  const result = parseWeeklyBilanLLMResponse("not json at all", input);
  assert(!result.valid);
  assertEquals(result.output.decision, "hold");
});

// =========================================================================
// Snapshot builder tests
// =========================================================================

function makePlanItemRuntime(
  overrides: Partial<PlanItemRuntimeRow> = {},
): PlanItemRuntimeRow {
  return {
    id: "plan-item-1",
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    plan_id: "plan-1",
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Meditation",
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
    activation_condition: null,
    current_habit_state: "active_building",
    support_mode: null,
    support_function: null,
    target_reps: 5,
    current_reps: 3,
    cadence_label: "quotidien",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    time_of_day: "morning",
    start_after_item_id: null,
    phase_id: null,
    phase_order: null,
    payload: {},
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
    activated_at: "2026-03-01T00:00:00Z",
    completed_at: null,
    last_entry_at: "2026-03-23T10:00:00Z",
    recent_entries: [
      {
        id: "e1",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "plan-item-1",
        entry_kind: "checkin",
        outcome: "done",
        value_numeric: null,
        value_text: null,
        difficulty_level: "low",
        blocker_hint: null,
        created_at: "2026-03-23T10:00:00Z",
        effective_at: "2026-03-23T10:00:00Z",
        metadata: {},
      },
      {
        id: "e2",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "plan-item-1",
        entry_kind: "progress",
        outcome: "done",
        value_numeric: null,
        value_text: null,
        difficulty_level: null,
        blocker_hint: null,
        created_at: "2026-03-22T10:00:00Z",
        effective_at: "2026-03-22T10:00:00Z",
        metadata: {},
      },
      {
        id: "e3",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "plan-item-1",
        entry_kind: "blocker",
        outcome: "blocked",
        value_numeric: null,
        value_text: null,
        difficulty_level: "high",
        blocker_hint: "no time",
        created_at: "2026-03-21T10:00:00Z",
        effective_at: "2026-03-21T10:00:00Z",
        metadata: {},
      },
    ],
    ...overrides,
  };
}

Deno.test("buildWeeklyItemSnapshot: counts entries correctly", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const item = makePlanItemRuntime();
  const snapshot = buildWeeklyItemSnapshot(item, now);

  assertEquals(snapshot.week_entries_count, 3);
  assertEquals(snapshot.positive_entries, 2);
  assertEquals(snapshot.blocker_entries, 1);
  assertEquals(snapshot.skip_entries, 0);
  assertEquals(snapshot.difficulty_high_count, 1);
  assertEquals(snapshot.completion_rate, 0.4);
  assertEquals(snapshot.has_strong_progress, false);
  assertEquals(snapshot.has_repeated_blocker, false);
});

Deno.test("buildWeeklyItemSnapshot: strong progress at 60% completion", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const item = makePlanItemRuntime({
    target_reps: 5,
    recent_entries: Array.from({ length: 3 }, (_, i) => ({
      id: `e-${i}`,
      user_id: "user-1",
      cycle_id: "cycle-1",
      transformation_id: "transfo-1",
      plan_id: "plan-1",
      plan_item_id: "plan-item-1",
      entry_kind: "checkin" as const,
      outcome: "done",
      value_numeric: null,
      value_text: null,
      difficulty_level: null,
      blocker_hint: null,
      created_at: `2026-03-${20 + i}T10:00:00Z`,
      effective_at: `2026-03-${20 + i}T10:00:00Z`,
      metadata: {},
    })),
  });

  const snapshot = buildWeeklyItemSnapshot(item, now);
  assertEquals(snapshot.completion_rate, 0.6);
  assertEquals(snapshot.has_strong_progress, true);
});

Deno.test("buildWeeklyItemSnapshot: repeated blocker at 2+ blockers", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const item = makePlanItemRuntime({
    recent_entries: [
      {
        id: "b1",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "plan-item-1",
        entry_kind: "blocker",
        outcome: "blocked",
        value_numeric: null,
        value_text: null,
        difficulty_level: null,
        blocker_hint: "no time",
        created_at: "2026-03-22T10:00:00Z",
        effective_at: "2026-03-22T10:00:00Z",
        metadata: {},
      },
      {
        id: "b2",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "plan-item-1",
        entry_kind: "blocker",
        outcome: "blocked",
        value_numeric: null,
        value_text: null,
        difficulty_level: null,
        blocker_hint: "no energy",
        created_at: "2026-03-23T10:00:00Z",
        effective_at: "2026-03-23T10:00:00Z",
        metadata: {},
      },
    ],
  });

  const snapshot = buildWeeklyItemSnapshot(item, now);
  assertEquals(snapshot.has_repeated_blocker, true);
  assertEquals(snapshot.blocker_entries, 2);
});

Deno.test("buildWeeklyBilanV2Input: assembles victories and blockers", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const momentum: MomentumStateV2 = {
    version: 2,
    updated_at: "2026-03-24T00:00:00Z",
    current_state: "momentum",
    state_reason: "good week",
    dimensions: {
      engagement: { level: "high" },
      execution_traction: { level: "up" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "high" },
    active_load: {
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "push_lightly", confidence: "high" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
  };

  const strongItem = makePlanItemRuntime({
    id: "strong-1",
    title: "Running",
    target_reps: 3,
    recent_entries: Array.from({ length: 3 }, (_, i) => ({
      id: `s-${i}`,
      user_id: "user-1",
      cycle_id: "cycle-1",
      transformation_id: "transfo-1",
      plan_id: "plan-1",
      plan_item_id: "strong-1",
      entry_kind: "checkin" as const,
      outcome: "done",
      value_numeric: null,
      value_text: null,
      difficulty_level: null,
      blocker_hint: null,
      created_at: `2026-03-${20 + i}T10:00:00Z`,
      effective_at: `2026-03-${20 + i}T10:00:00Z`,
      metadata: {},
    })),
  });

  const blockedItem = makePlanItemRuntime({
    id: "blocked-1",
    title: "Journal writing",
    recent_entries: [
      {
        id: "bl1",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "blocked-1",
        entry_kind: "blocker",
        outcome: "blocked",
        value_numeric: null,
        value_text: null,
        difficulty_level: null,
        blocker_hint: null,
        created_at: "2026-03-22T10:00:00Z",
        effective_at: "2026-03-22T10:00:00Z",
        metadata: {},
      },
      {
        id: "bl2",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        plan_id: "plan-1",
        plan_item_id: "blocked-1",
        entry_kind: "blocker",
        outcome: "blocked",
        value_numeric: null,
        value_text: null,
        difficulty_level: null,
        blocker_hint: null,
        created_at: "2026-03-23T10:00:00Z",
        effective_at: "2026-03-23T10:00:00Z",
        metadata: {},
      },
    ],
  });

  const result = buildWeeklyBilanV2Input(
    [strongItem, blockedItem],
    momentum,
    null,
    now,
  );

  assertEquals(result.victories, ["Running"]);
  assertEquals(result.recurring_blockers, ["Journal writing"]);
  assertEquals(result.items.length, 2);
  assertEquals(result.momentum.current_state, "momentum");
  assertEquals(result.pulse_summary, null);
  assertEquals(result.weekly_digest, null);
});

Deno.test("buildWeeklyBilanV2Input: injects weekly digest when provided", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const momentum: MomentumStateV2 = {
    version: 2,
    updated_at: "2026-03-24T00:00:00Z",
    current_state: "momentum",
    state_reason: "good week",
    dimensions: {
      engagement: { level: "high" },
      execution_traction: { level: "up" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "high" },
    active_load: {
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "push_lightly", confidence: "high" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
  };
  const digest = {
    version: 1 as const,
    week_start: "2026-03-17",
    generated_at: "2026-03-24T12:00:00Z",
    dominant_tone: "fatigue mêlée de détermination",
    tone_evolution: "creux mercredi puis rebond discret",
    best_traction_moments: ["Reprise mercredi matin"],
    closure_fatigue_moments: ["Décrochage jeudi soir"],
    most_real_blockage: "Le déménagement a cassé le rythme",
    support_that_helped: "La méditation courte",
    main_risk_next_week: "Risque de surcharge résiduelle",
    relational_opportunity: "Répond mieux à des messages courts le matin",
    confidence: "medium" as const,
    message_count: 6,
    active_days: 4,
  };

  const result = buildWeeklyBilanV2Input(
    [makePlanItemRuntime()],
    momentum,
    null,
    now,
    digest,
  );

  assertEquals(result.weekly_digest?.week_start, "2026-03-17");
  assertEquals(result.weekly_digest?.main_risk_next_week, "Risque de surcharge résiduelle");
});

Deno.test("buildWeeklyBilanV2Input: injects phase context when provided", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();
  const momentum: MomentumStateV2 = {
    version: 2,
    updated_at: "2026-03-24T00:00:00Z",
    current_state: "momentum",
    state_reason: "good week",
    dimensions: {
      engagement: { level: "high" },
      execution_traction: { level: "up" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "high" },
    active_load: {
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "push_lightly", confidence: "high" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
  };
  const phaseContext: CurrentPhaseRuntimeContext = {
    current_phase_id: "phase-2",
    current_phase_order: 2,
    current_phase_title: "Stabiliser le rythme",
    total_phases: 4,
    completed_phase_ids: ["phase-1"],
    current_phase_item_ids: ["item-1"],
    maintenance_habit_item_ids: [],
    heartbeat_title: "Jours tenus",
    heartbeat_unit: "jours",
    heartbeat_current: 4,
    heartbeat_target: 5,
    heartbeat_tracking_mode: "manual",
    heartbeat_progress_ratio: 0.8,
    heartbeat_reached: false,
    heartbeat_almost_reached: true,
    current_phase_completion_ratio: 0.66,
    transition_ready: false,
  };

  const result = buildWeeklyBilanV2Input(
    [makePlanItemRuntime()],
    momentum,
    null,
    now,
    null,
    phaseContext,
  );

  assertEquals(result.phase_context?.current_phase_title, "Stabiliser le rythme");
  assertEquals(result.phase_context?.heartbeat_title, "Jours tenus");
  assertEquals(result.phase_context?.heartbeat_almost_reached, true);
});

// =========================================================================
// Materializer tests
// =========================================================================

function createSupabaseMock(params: {
  selectRows?: Array<{ id: string; status: string }>;
  updateErrorsById?: Record<string, string>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const queryBuilder = {
    update(patch: Record<string, unknown>) {
      return {
        eq(_field: string, id: string) {
          return {
            eq(_field2: string, _planId: string) {
              updates.push({ id, patch });
              const message = params.updateErrorsById?.[id];
              return Promise.resolve({
                error: message ? { message } : null,
              });
            },
          };
        },
      };
    },
    select(_columns: string) {
      return {
        eq(_field: string, _planId: string) {
          return {
            in(_field2: string, ids: string[]) {
              const rows = (params.selectRows ?? []).filter((row) =>
                ids.includes(row.id)
              );
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };

  return {
    client: {
      from(_table: string) {
        return queryBuilder;
      },
    } as any,
    updates,
  };
}

Deno.test("materializeWeeklyAdjustments: deactivate uses canonical deactivated status", async () => {
  const supabase = createSupabaseMock({
    selectRows: [{ id: "item-1", status: "active" }],
  });

  const result = await materializeWeeklyAdjustments(
    supabase.client,
    "plan-1",
    [
      { type: "deactivate", target_item_id: "item-1", reason: "lighten" },
    ],
  );

  assertEquals(result.applied, 1);
  assertEquals(result.skipped, 0);
  assertEquals(result.errors, []);
  assertEquals(supabase.updates[0]?.patch.status, "deactivated");
});

Deno.test("materializeWeeklyAdjustments: replace deactivates old and activates new", async () => {
  const oldId = "11111111-1111-1111-1111-111111111111";
  const newId = "22222222-2222-2222-2222-222222222222";
  const supabase = createSupabaseMock({
    selectRows: [
      { id: oldId, status: "active" },
      { id: newId, status: "pending" },
    ],
  });

  const result = await materializeWeeklyAdjustments(
    supabase.client,
    "plan-1",
    [
      {
        type: "replace",
        target_item_id: oldId,
        reason: `replace with ${newId}`,
      },
    ],
  );

  assertEquals(result.applied, 2);
  assertEquals(result.skipped, 0);
  assertEquals(result.errors, []);
  assertEquals(supabase.updates[0]?.id, oldId);
  assertEquals(supabase.updates[0]?.patch.status, "deactivated");
  assertEquals(supabase.updates[1]?.id, newId);
  assertEquals(supabase.updates[1]?.patch.status, "active");
});

Deno.test("materializeWeeklyAdjustments: replace without replacement id returns error", async () => {
  const oldId = "11111111-1111-1111-1111-111111111111";
  const supabase = createSupabaseMock({
    selectRows: [{ id: oldId, status: "active" }],
  });

  const result = await materializeWeeklyAdjustments(
    supabase.client,
    "plan-1",
    [
      {
        type: "replace",
        target_item_id: oldId,
        reason: "swap to something softer",
      },
    ],
  );

  assertEquals(result.applied, 0);
  assertEquals(result.skipped, 0);
  assertEquals(supabase.updates.length, 0);
  assert(
    result.errors.some((error) =>
      error.includes("missing replacement item id")
    ),
  );
});

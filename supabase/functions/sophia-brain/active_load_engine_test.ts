import { assertEquals } from "jsr:@std/assert";

import type {
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../_shared/v2-types.ts";
import type { CurrentPhaseRuntimeContext } from "../_shared/v2-runtime.ts";
import { computeActiveLoad } from "./active_load_engine.ts";

function makePlanItem(
  id: string,
  overrides: Partial<UserPlanItemRow> = {},
): UserPlanItemRow {
  return {
    id,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    dimension: "missions",
    kind: "task",
    status: "active",
    title: `Item ${id}`,
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
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
    phase_id: null,
    phase_order: null,
    payload: {},
    created_at: "2026-03-24T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-24T08:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function makeEntry(
  id: string,
  planItemId: string,
  entryKind: UserPlanItemEntryRow["entry_kind"],
): UserPlanItemEntryRow {
  return {
    id,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    plan_id: "plan-1",
    plan_item_id: planItemId,
    entry_kind: entryKind,
    outcome: entryKind,
    value_numeric: null,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: "2026-03-24T08:00:00.000Z",
    effective_at: "2026-03-24T08:00:00.000Z",
    metadata: {},
  };
}

Deno.test("computeActiveLoad counts only active mission/support/habit slots", () => {
  const result = computeActiveLoad([
    makePlanItem("mission-active", { dimension: "missions", status: "active" }),
    makePlanItem("support-active", {
      dimension: "support",
      kind: "framework",
      support_mode: "recommended_now",
      support_function: "practice",
      status: "active",
    }),
    makePlanItem("habit-active", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
      status: "active",
    }),
    makePlanItem("support-pending", {
      dimension: "support",
      kind: "framework",
      support_mode: "recommended_now",
      support_function: "practice",
      status: "pending",
      activated_at: null,
    }),
    makePlanItem("habit-maintenance", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "in_maintenance",
      status: "active",
    }),
    makePlanItem("mission-completed", {
      dimension: "missions",
      status: "completed",
      completed_at: "2026-03-24T08:00:00.000Z",
    }),
  ]);

  assertEquals(result, {
    current_load_score: 6,
    mission_slots_used: 1,
    support_slots_used: 1,
    habit_building_slots_used: 1,
    needs_reduce: false,
    needs_consolidate: false,
  });
});

Deno.test("computeActiveLoad flags reduction when weighted load exceeds threshold", () => {
  const result = computeActiveLoad([
    makePlanItem("mission-1", { dimension: "missions" }),
    makePlanItem("support-1", {
      dimension: "support",
      kind: "framework",
      support_mode: "recommended_now",
      support_function: "practice",
    }),
    makePlanItem("support-2", {
      dimension: "support",
      kind: "framework",
      support_mode: "recommended_now",
      support_function: "practice",
    }),
    makePlanItem("habit-1", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
    makePlanItem("habit-2", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
  ]);

  assertEquals(result.current_load_score, 9);
  assertEquals(result.needs_reduce, true);
  assertEquals(result.needs_consolidate, false);
});

Deno.test("computeActiveLoad flags reduction when more than two missions are active", () => {
  const result = computeActiveLoad([
    makePlanItem("mission-1", { dimension: "missions" }),
    makePlanItem("mission-2", { dimension: "missions" }),
    makePlanItem("mission-3", { dimension: "missions" }),
  ]);

  assertEquals(result.mission_slots_used, 3);
  assertEquals(result.current_load_score, 9);
  assertEquals(result.needs_reduce, true);
});

Deno.test("computeActiveLoad flags consolidation when more than two habits include poor traction", () => {
  const entriesByItem = new Map<string, UserPlanItemEntryRow[]>([
    [
      "habit-2",
      [
        makeEntry("e1", "habit-2", "skip"),
        makeEntry("e2", "habit-2", "blocker"),
        makeEntry("e3", "habit-2", "skip"),
        makeEntry("e4", "habit-2", "partial"),
        makeEntry("e5", "habit-2", "support_feedback"),
      ],
    ],
  ]);

  const result = computeActiveLoad([
    makePlanItem("habit-1", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
    makePlanItem("habit-2", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
    makePlanItem("habit-3", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
  ], entriesByItem);

  assertEquals(result.habit_building_slots_used, 3);
  assertEquals(result.needs_consolidate, true);
});

Deno.test("computeActiveLoad treats partial as positive and support_feedback as neutral", () => {
  const entriesByItem = new Map<string, UserPlanItemEntryRow[]>([
    [
      "habit-3",
      [
        makeEntry("e1", "habit-3", "partial"),
        makeEntry("e2", "habit-3", "checkin"),
        makeEntry("e3", "habit-3", "skip"),
        makeEntry("e4", "habit-3", "support_feedback"),
        makeEntry("e5", "habit-3", "blocker"),
      ],
    ],
  ]);

  const result = computeActiveLoad([
    makePlanItem("habit-1", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
    makePlanItem("habit-2", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
    makePlanItem("habit-3", {
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
    }),
  ], entriesByItem);

  assertEquals(result.current_load_score, 6);
  assertEquals(result.needs_reduce, false);
  assertEquals(result.needs_consolidate, false);
});

Deno.test("computeActiveLoad scopes to current phase and counts previous maintenance habits as light load", () => {
  const phaseContext: CurrentPhaseRuntimeContext = {
    current_phase_id: "phase-2",
    current_phase_order: 2,
    current_phase_title: "Phase 2",
    total_phases: 3,
    completed_phase_ids: ["phase-1"],
    current_phase_item_ids: ["mission-2", "habit-2"],
    maintenance_habit_item_ids: ["habit-maint-1"],
    heartbeat_title: "Consistency",
    heartbeat_unit: "days",
    heartbeat_current: 4,
    heartbeat_target: 5,
    heartbeat_tracking_mode: "manual",
    heartbeat_progress_ratio: 0.8,
    heartbeat_reached: false,
    heartbeat_almost_reached: true,
    current_phase_completion_ratio: 0.5,
    transition_ready: false,
  };

  const result = computeActiveLoad([
    makePlanItem("mission-1", {
      phase_id: "phase-1",
      dimension: "missions",
      status: "completed",
    }),
    makePlanItem("habit-maint-1", {
      phase_id: "phase-1",
      dimension: "habits",
      kind: "habit",
      status: "in_maintenance",
      current_habit_state: "in_maintenance",
    }),
    makePlanItem("mission-2", {
      phase_id: "phase-2",
      dimension: "missions",
      status: "active",
    }),
    makePlanItem("habit-2", {
      phase_id: "phase-2",
      dimension: "habits",
      kind: "habit",
      current_habit_state: "active_building",
      status: "active",
    }),
    makePlanItem("support-future", {
      phase_id: "phase-3",
      dimension: "support",
      kind: "framework",
      support_mode: "recommended_now",
      support_function: "practice",
      status: "active",
    }),
  ], new Map(), phaseContext);

  assertEquals(result, {
    current_load_score: 6,
    mission_slots_used: 1,
    support_slots_used: 0,
    habit_building_slots_used: 1,
    needs_reduce: false,
    needs_consolidate: false,
  });
});

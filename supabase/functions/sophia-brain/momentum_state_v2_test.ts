import { assertEquals } from "jsr:@std/assert";

import type {
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../_shared/v2-types.ts";
import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import {
  deriveMomentumFromSnapshotV2,
  MOMENTUM_STATE_V2_KEY,
  type MomentumConsolidationSnapshotV2,
  readMomentumStateV2,
  type StoredMomentumV2,
  toPublicMomentumV2,
} from "./momentum_state.ts";

function makePlanItemRuntime(
  id: string,
  overrides: Partial<PlanItemRuntimeRow> = {},
): PlanItemRuntimeRow {
  return {
    id,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "t-1",
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
    last_entry_at: "2026-03-24T08:00:00.000Z",
    recent_entries: [],
    ...overrides,
  };
}

function makeEntry(
  planItemId: string,
  entryKind: UserPlanItemEntryRow["entry_kind"],
): UserPlanItemEntryRow {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "t-1",
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

function makeSnapshot(
  overrides: Partial<MomentumConsolidationSnapshotV2> = {},
): MomentumConsolidationSnapshotV2 {
  return {
    profilePauseUntilIso: null,
    recentMessages: [],
    planItemsRuntime: [],
    activeLoad: {
      current_load_score: 0,
      mission_slots_used: 0,
      support_slots_used: 0,
      habit_building_slots_used: 0,
      needs_reduce: false,
      needs_consolidate: false,
    },
    ...overrides,
  };
}

function freshV2(): StoredMomentumV2 {
  return readMomentumStateV2({});
}

// ── 6 public states ─────────────────────────────────────────────────────────

Deno.test("V2 state: momentum when traction up and user engaged", () => {
  const current = freshV2();
  current._internal.signal_log.response_quality_events = [
    { at: "2026-03-24T07:00:00.000Z", quality: "substantive" },
    { at: "2026-03-24T08:00:00.000Z", quality: "substantive" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot({
      recentMessages: [
        {
          role: "user",
          content: "J'ai bien avancé aujourd'hui, vraiment content",
          created_at: "2026-03-24T07:00:00.000Z",
        },
        {
          role: "user",
          content: "J'ai terminé l'exercice proposé par Sophia",
          created_at: "2026-03-24T08:00:00.000Z",
        },
      ],
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [
            makeEntry("m1", "checkin"),
            makeEntry("m1", "progress"),
          ],
        }),
        makePlanItemRuntime("h1", {
          dimension: "habits",
          kind: "habit",
          current_habit_state: "active_building",
          recent_entries: [makeEntry("h1", "checkin")],
        }),
      ],
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "momentum");
  assertEquals(pub.dimensions.execution_traction.level, "up");
  assertEquals(pub.posture.recommended_posture, "push_lightly");
});

Deno.test("V2 state: friction_legere when engaged but traction flat", () => {
  const current = freshV2();
  current._internal.signal_log.response_quality_events = [
    { at: "2026-03-24T08:00:00.000Z", quality: "substantive" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot({
      recentMessages: [
        {
          role: "user",
          content: "J'ai essayé mais c'est vraiment pas facile cette semaine",
          created_at: "2026-03-24T08:00:00.000Z",
        },
      ],
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [makeEntry("m1", "partial"), makeEntry("m1", "skip")],
        }),
      ],
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "friction_legere");
  assertEquals(pub.posture.recommended_posture, "simplify");
});

Deno.test("V2 state: evitement when low engagement and no traction", () => {
  const current = freshV2();
  current._internal.signal_log.response_quality_events = [
    { at: "2026-03-24T06:00:00.000Z", quality: "minimal" },
    { at: "2026-03-24T07:00:00.000Z", quality: "minimal" },
    { at: "2026-03-24T08:00:00.000Z", quality: "minimal" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot({
      recentMessages: [
        { role: "user", content: "ok", created_at: "2026-03-24T08:00:00.000Z" },
      ],
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [makeEntry("m1", "skip")],
        }),
      ],
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "evitement");
  assertEquals(pub.posture.recommended_posture, "hold");
});

Deno.test("V2 state: pause_consentie when consent closed", () => {
  const current = freshV2();
  current._internal.signal_log.consent_events = [
    { at: "2026-03-24T08:00:00.000Z", kind: "explicit_stop" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot(),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "pause_consentie");
  assertEquals(pub.posture.recommended_posture, "hold");
  assertEquals(pub.assessment.top_risk, "consent");
});

Deno.test("V2 state: soutien_emotionnel when emotional load high", () => {
  const current = freshV2();
  current._internal.signal_log.emotional_turns = [
    { at: "2026-03-24T08:00:00.000Z", level: "high" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot(),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "soutien_emotionnel");
  assertEquals(pub.posture.recommended_posture, "support");
  assertEquals(pub.assessment.top_risk, "emotional");
});

Deno.test("V2 state: reactivation when low engagement after silence", () => {
  const current = freshV2();
  current._internal.metrics_cache.last_user_turn_at =
    "2026-03-20T08:00:00.000Z";

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot(),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  const pub = toPublicMomentumV2(result);
  assertEquals(pub.current_state, "reactivation");
  assertEquals(pub.posture.recommended_posture, "reopen_door");
});

// ── Posture override on load ────────────────────────────────────────────────

Deno.test("V2 posture: reduce_load when needs_reduce and not in emergency state", () => {
  const current = freshV2();
  current._internal.signal_log.response_quality_events = [
    { at: "2026-03-24T08:00:00.000Z", quality: "substantive" },
  ];

  const result = deriveMomentumFromSnapshotV2({
    current,
    snapshot: makeSnapshot({
      recentMessages: [
        {
          role: "user",
          content: "J'avance bien sur mes objectifs cette semaine",
          created_at: "2026-03-24T08:00:00.000Z",
        },
      ],
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [
            makeEntry("m1", "checkin"),
            makeEntry("m1", "progress"),
          ],
        }),
      ],
      activeLoad: {
        current_load_score: 9,
        mission_slots_used: 3,
        support_slots_used: 0,
        habit_building_slots_used: 0,
        needs_reduce: true,
        needs_consolidate: false,
      },
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  assertEquals(
    toPublicMomentumV2(result).posture.recommended_posture,
    "reduce_load",
  );
  assertEquals(toPublicMomentumV2(result).assessment.top_risk, "load");
});

Deno.test("V2 plan_fit: active item without entry is not zombie before 7 days", () => {
  const result = deriveMomentumFromSnapshotV2({
    current: freshV2(),
    snapshot: makeSnapshot({
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [],
          last_entry_at: null,
          activated_at: "2026-03-22T08:00:00.000Z",
          created_at: "2026-03-22T08:00:00.000Z",
        }),
      ],
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  assertEquals(toPublicMomentumV2(result).dimensions.plan_fit.level, "good");
});

Deno.test("V2 plan_fit: active item without entry becomes zombie only after 7 days from activation", () => {
  const result = deriveMomentumFromSnapshotV2({
    current: freshV2(),
    snapshot: makeSnapshot({
      planItemsRuntime: [
        makePlanItemRuntime("m1", {
          recent_entries: [],
          last_entry_at: null,
          activated_at: "2026-03-10T08:00:00.000Z",
          created_at: "2026-03-10T08:00:00.000Z",
        }),
      ],
    }),
    nowIso: "2026-03-24T09:00:00.000Z",
  });

  assertEquals(toPublicMomentumV2(result).dimensions.plan_fit.level, "poor");
  assertEquals(
    toPublicMomentumV2(result).dimensions.plan_fit.reason,
    "multiple_zombie_items",
  );
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/assert_string_includes.ts";

import { prepareDailyBilanV2Checkin } from "./v2_daily_bilan.ts";

import type {
  ConversationPulse,
  MomentumStateV2,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../_shared/v2-types.ts";
import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";

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

function basePulse(
  overrides: Partial<ConversationPulse> = {},
): ConversationPulse {
  return {
    version: 1,
    generated_at: NOW_ISO,
    window_days: 7,
    last_72h_weight: 0.6,
    tone: {
      dominant: "steady",
      emotional_load: "low",
      relational_openness: "open",
    },
    trajectory: { direction: "flat", confidence: "medium", summary: "test" },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "push",
      upcoming_event: null,
      proactive_risk: "low",
    },
    evidence_refs: { message_ids: [], event_ids: [] },
    ...overrides,
  };
}

Deno.test("prepareDailyBilanV2Checkin: momentum scenario", () => {
  const item = basePlanItem("item-1", {}, [baseEntry("item-1", "checkin", 1)]);
  const prepared = prepareDailyBilanV2Checkin({
    planItemsRuntime: [item],
    momentum: baseMomentum(),
    localDayOfWeek: "tue",
    nowIso: NOW_ISO,
  });

  assertEquals(prepared.output.mode, "check_light");
  assertEquals(prepared.targetItems.map((item) => item.id), ["item-1"]);
  assertStringIncludes(prepared.draftMessage, "Petit point rapide");
  assertEquals(prepared.messagePayload.mode, "check_light");
});

Deno.test("prepareDailyBilanV2Checkin: friction scenario", () => {
  const item = basePlanItem("item-blocked", {}, [
    baseEntry("item-blocked", "blocker", 0),
    baseEntry("item-blocked", "blocker", 1),
  ]);
  const prepared = prepareDailyBilanV2Checkin({
    planItemsRuntime: [item],
    momentum: baseMomentum(),
    nowIso: NOW_ISO,
  });

  assertEquals(prepared.output.mode, "check_blocker");
  assertEquals(prepared.decision.reason, "repeated_blocker_pattern");
  assertStringIncludes(prepared.draftMessage, "bloque");
  assertEquals(
    prepared.messagePayload.decision_reason,
    "repeated_blocker_pattern",
  );
});

Deno.test("prepareDailyBilanV2Checkin: blocker scenario from declining traction", () => {
  const item = basePlanItem("item-flat", {}, [
    baseEntry("item-flat", "skip", 1),
  ]);
  const prepared = prepareDailyBilanV2Checkin({
    planItemsRuntime: [item],
    momentum: baseMomentum({
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "down", reason: "test" },
      },
    }),
    nowIso: NOW_ISO,
  });

  assertEquals(prepared.output.mode, "check_blocker");
  assertEquals(prepared.decision.reason, "declining_traction");
  assertStringIncludes(prepared.draftMessage, "bloque");
});

Deno.test("prepareDailyBilanV2Checkin: progress scenario", () => {
  const item = basePlanItem("item-good", {}, [
    baseEntry("item-good", "progress", 0),
    baseEntry("item-good", "checkin", 1),
  ]);
  const prepared = prepareDailyBilanV2Checkin({
    planItemsRuntime: [item],
    momentum: baseMomentum({
      current_state: "momentum",
      dimensions: {
        ...baseMomentum().dimensions,
        execution_traction: { level: "up", reason: "test" },
      },
    }),
    nowIso: NOW_ISO,
  });

  assertEquals(prepared.output.mode, "check_progress");
  assertEquals(prepared.targetItems.map((item) => item.id), ["item-good"]);
  assertStringIncludes(prepared.draftMessage, "élan");
});

Deno.test("prepareDailyBilanV2Checkin: silence scenario", () => {
  const supportItem = basePlanItem("support-now", {
    dimension: "support",
    support_mode: "recommended_now",
    support_function: "rescue",
  }, [baseEntry("support-now", "support_feedback", 1)]);
  const prepared = prepareDailyBilanV2Checkin({
    planItemsRuntime: [supportItem],
    momentum: baseMomentum({
      current_state: "reactivation",
      dimensions: {
        ...baseMomentum().dimensions,
        engagement: { level: "low", reason: "test" },
      },
    }),
    conversationPulse: basePulse({
      signals: {
        ...basePulse().signals,
        likely_need: "silence",
      },
    }),
    nowIso: NOW_ISO,
  });

  assertEquals(prepared.output.mode, "check_supportive");
  assertEquals(prepared.targetItems.map((item) => item.id), ["support-now"]);
  assertStringIncludes(prepared.draftMessage, "Petit point doux");
  assertEquals(prepared.messagePayload.conversation_pulse != null, true);
});

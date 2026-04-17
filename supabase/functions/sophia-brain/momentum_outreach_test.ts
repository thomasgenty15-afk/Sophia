import { assertEquals, assertMatch } from "jsr:@std/assert";

import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import type { StoredMomentumV2 } from "./momentum_state.ts";
import { writeMomentumStateV2 } from "./momentum_state.ts";
import {
  buildMomentumOutreachPlan,
  listMomentumOutreachEventContexts,
} from "./momentum_outreach.ts";

const NOW_ISO = "2026-03-24T10:00:00.000Z";

type MomentumV2Overrides =
  & Partial<
    Omit<
      StoredMomentumV2,
      | "dimensions"
      | "assessment"
      | "active_load"
      | "posture"
      | "blockers"
      | "memory_links"
      | "_internal"
    >
  >
  & {
    dimensions?: Partial<StoredMomentumV2["dimensions"]>;
    assessment?: Partial<StoredMomentumV2["assessment"]>;
    active_load?: Partial<StoredMomentumV2["active_load"]>;
    posture?: Partial<StoredMomentumV2["posture"]>;
    blockers?: Partial<StoredMomentumV2["blockers"]>;
    memory_links?: Partial<StoredMomentumV2["memory_links"]>;
    _internal?:
      & Partial<Omit<StoredMomentumV2["_internal"], "metrics_cache">>
      & {
        metrics_cache?: Partial<StoredMomentumV2["_internal"]["metrics_cache"]>;
      };
  };

function makeMomentumV2(
  overrides: MomentumV2Overrides = {},
): StoredMomentumV2 {
  const base: StoredMomentumV2 = {
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
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "simplify", confidence: "medium" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    _internal: {
      signal_log: {
        emotional_turns: [],
        consent_events: [],
        response_quality_events: [],
      },
      stability: {},
      sources: {},
      metrics_cache: {
        days_since_last_user_message: 3,
      },
    },
  };

  return {
    ...base,
    ...overrides,
    dimensions: { ...base.dimensions, ...(overrides.dimensions ?? {}) },
    assessment: { ...base.assessment, ...(overrides.assessment ?? {}) },
    active_load: { ...base.active_load, ...(overrides.active_load ?? {}) },
    posture: { ...base.posture, ...(overrides.posture ?? {}) },
    blockers: { ...base.blockers, ...(overrides.blockers ?? {}) },
    memory_links: { ...base.memory_links, ...(overrides.memory_links ?? {}) },
    _internal: {
      ...base._internal,
      ...(overrides._internal ?? {}),
      metrics_cache: {
        ...base._internal.metrics_cache,
        ...(overrides._internal?.metrics_cache ?? {}),
      },
    },
  };
}

function tempMemoryWithMomentumV2(
  overrides: MomentumV2Overrides = {},
) {
  return writeMomentumStateV2({}, makeMomentumV2(overrides));
}

function makePlanItem(
  title: string,
  overrides: Partial<PlanItemRuntimeRow> = {},
): PlanItemRuntimeRow {
  return {
    id: `item-${title.toLowerCase().replace(/\s+/g, "-")}`,
    user_id: "user-1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    plan_id: "plan-1",
    dimension: "missions",
    kind: "task",
    status: "active",
    title,
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
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    activated_at: NOW_ISO,
    completed_at: null,
    last_entry_at: null,
    recent_entries: [],
    ...overrides,
  };
}

Deno.test("momentum_outreach: exposes all supported event contexts", () => {
  assertEquals(listMomentumOutreachEventContexts().sort(), [
    "momentum_evitement",
    "momentum_friction_legere",
    "momentum_reactivation",
    "momentum_soutien_emotionnel",
  ]);
});

Deno.test("momentum_outreach: friction plan diagnoses blocker from V2 plan items", () => {
  const plan = buildMomentumOutreachPlan(
    tempMemoryWithMomentumV2({
      current_state: "friction_legere",
      blockers: { blocker_kind: "mission", blocker_repeat_score: 1 },
    }),
    {
      planItems: [
        makePlanItem("Marcher 10 min"),
        makePlanItem("Préparer le repas", {
          dimension: "habits",
          kind: "habit",
        }),
      ],
    },
  );

  assertEquals(plan?.state, "friction_legere");
  assertEquals(plan?.event_context, "momentum_friction_legere");
  assertMatch(String(plan?.fallback_text ?? ""), /marcher 10 min/i);
  assertEquals(plan?.plan_item_titles_targeted, ["Marcher 10 min"]);
});

Deno.test("momentum_outreach: poor plan fit prepares dashboard redirect", () => {
  const plan = buildMomentumOutreachPlan(
    tempMemoryWithMomentumV2({
      current_state: "friction_legere",
      dimensions: {
        plan_fit: { level: "poor" },
      },
    }),
    {
      planItems: [makePlanItem("Routine du soir", { status: "stalled" })],
    },
  );

  assertEquals(plan?.strategy, "prepare_dashboard_redirect");
  assertMatch(String(plan?.fallback_text ?? ""), /dashboard/i);
  assertMatch(String(plan?.instruction ?? ""), /clarifier/i);
});

Deno.test("momentum_outreach: overload reduces pressure instead of diagnosing", () => {
  const plan = buildMomentumOutreachPlan(
    tempMemoryWithMomentumV2({
      current_state: "friction_legere",
      dimensions: {
        load_balance: { level: "overloaded" },
      },
      active_load: {
        current_load_score: 7,
        mission_slots_used: 3,
        support_slots_used: 2,
        habit_building_slots_used: 2,
        needs_reduce: true,
        needs_consolidate: false,
      },
    }),
    {
      planItems: [makePlanItem("Sport"), makePlanItem("Lecture")],
    },
  );

  assertEquals(plan?.strategy, "reduce_pressure");
  assertMatch(String(plan?.fallback_text ?? ""), /trop a porter|plus leger/i);
});

Deno.test("momentum_outreach: soutien emotionnel removes accountability", () => {
  const plan = buildMomentumOutreachPlan(
    tempMemoryWithMomentumV2({
      current_state: "soutien_emotionnel",
      dimensions: {
        emotional_load: { level: "high" },
      },
    }),
    {
      planItems: [
        makePlanItem("Respiration", { dimension: "support", kind: "exercise" }),
      ],
    },
  );

  assertEquals(plan?.state, "soutien_emotionnel");
  assertMatch(String(plan?.instruction ?? ""), /aucune accountability/i);
  assertMatch(String(plan?.fallback_text ?? ""), /pas besoin de performer/i);
});

Deno.test("momentum_outreach: pause_consentie does not produce outreach plan", () => {
  const plan = buildMomentumOutreachPlan(
    tempMemoryWithMomentumV2({
      current_state: "pause_consentie",
    }),
    {
      planItems: [makePlanItem("Marcher 10 min")],
    },
  );
  assertEquals(plan, null);
});

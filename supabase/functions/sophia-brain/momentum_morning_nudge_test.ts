import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import {
  buildMomentumMorningPlan,
  buildMorningNudgePlanV2,
  type LastNudgeInfo,
  type MorningNudgeV2Input,
  selectPostureV2,
  skipOrSpeakV2,
  validateCooldownV2,
} from "./momentum_morning_nudge.ts";
import type { StoredMomentumV2 } from "./momentum_state.ts";
import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import type {
  ConversationPulse,
} from "../_shared/v2-types.ts";

function tempMemoryWithMomentum(
  state: string,
  overrides: Record<string, unknown> = {},
) {
  const emotionalHigh = state === "soutien_emotionnel" ? 1 : 0;
  return {
    __momentum_state_v2: {
      version: 2,
      current_state: state,
      state_reason: "test",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: {
          level: state === "soutien_emotionnel" ? "high" : "low",
        },
        consent: { level: state === "pause_consentie" ? "closed" : "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
      assessment: {
        top_blocker: null,
        top_risk: null,
        confidence: "medium",
      },
      active_load: {
        current_load_score: 0,
        mission_slots_used: 0,
        support_slots_used: 0,
        habit_building_slots_used: 0,
        needs_reduce: false,
        needs_consolidate: false,
      },
      posture: {
        recommended_posture: "simplify",
        confidence: "medium",
      },
      blockers: {
        blocker_kind: null,
        blocker_repeat_score: 0,
      },
      memory_links: {
        last_useful_support_ids: [],
        last_failed_technique_ids: [],
      },
      _internal: {
        signal_log: {
          emotional_turns: emotionalHigh
            ? [{ at: "2026-03-19T08:00:00.000Z", level: "high" }]
            : [],
          consent_events: [],
          response_quality_events: [],
        },
        stability: {},
        sources: {},
        metrics_cache: {
          ...overrides,
        },
      },
    },
  };
}

Deno.test("buildMomentumMorningPlan skips action nudge when pause is active", () => {
  const plan = buildMomentumMorningPlan({
    tempMemory: tempMemoryWithMomentum("pause_consentie"),
    payload: {
      today_item_titles: ["Marcher 10 min"],
      active_item_titles: ["Marcher 10 min"],
    },
  });

  assertEquals(plan.decision, "skip");
  assertEquals(plan.reason, "momentum_morning_nudge_pause_consentie");
});

Deno.test("buildMomentumMorningPlan turns into soft support for emotional state", () => {
  const plan = buildMomentumMorningPlan({
    tempMemory: tempMemoryWithMomentum("soutien_emotionnel"),
    payload: {
      today_item_titles: ["Marcher 10 min"],
      active_item_titles: ["Marcher 10 min"],
    },
  });

  assertEquals(plan.decision, "send");
  assertEquals(plan.strategy, "support_softly");
  assertStringIncludes(
    String(plan.instruction ?? ""),
    "PAS dans un nudge d'actions",
  );
});

Deno.test("buildMomentumMorningPlan adapts friction to a known blocker on today's action", () => {
  const tempMemory = tempMemoryWithMomentum("friction_legere", {
    completed_actions_7d: 0,
    missed_actions_7d: 3,
    partial_actions_7d: 1,
  });
  (tempMemory.__momentum_state_v2 as any).assessment.top_blocker = "Marcher 10 min";
  (tempMemory.__momentum_state_v2 as any).blockers = {
    blocker_kind: "habit",
    blocker_repeat_score: 4,
  };

  const plan = buildMomentumMorningPlan({
    tempMemory,
    payload: {
      today_item_titles: ["Marcher 10 min", "Hydratation"],
      active_item_titles: ["Marcher 10 min", "Hydratation"],
    },
  });

  assertEquals(plan.decision, "send");
  assertEquals(plan.strategy, "simplify_today");
  assertMatch(String(plan.reason ?? ""), /momentum_morning_nudge_simplify/);
  assertMatch(
    String(plan.fallback_text ?? ""),
    /version .*simple|version tres faisable/i,
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "strategy=simplify_today",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Morning Nudge Tests
// ═══════════════════════════════════════════════════════════════════════════════

const NOW_ISO = "2026-03-24T07:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

function makeStoredMomentumV2(
  overrides: Partial<StoredMomentumV2> = {},
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
      metrics_cache: {},
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
    _internal: base._internal,
  };
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
    phase_id: null,
    phase_order: null,
    payload: {},
    created_at: "2026-03-20T10:00:00.000Z",
    updated_at: "2026-03-20T10:00:00.000Z",
    activated_at: "2026-03-20T10:00:00.000Z",
    completed_at: null,
    last_entry_at: null,
    recent_entries: [],
    ...overrides,
  };
}

function makeV2Input(
  overrides: Partial<MorningNudgeV2Input> = {},
): MorningNudgeV2Input {
  return {
    momentumV2: makeStoredMomentumV2(),
    todayPlanItems: [makePlanItem("Marcher 10 min")],
    activePlanItems: [
      makePlanItem("Marcher 10 min"),
      makePlanItem("Journaling"),
    ],
    conversationPulse: null,
    lastNudge: null,
    proactiveHistory: [],
    recentVictories: [],
    planDeepWhy: null,
    nudgesSent7d: 0,
    nowIso: NOW_ISO,
    ...overrides,
  };
}

// ── Test 1: pause_consentie → skip ──────────────────────────────────────────

Deno.test("V2 morning nudge: pause_consentie → skip", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "pause_consentie",
      dimensions: {
        engagement: { level: "low" },
        execution_traction: { level: "unknown" },
        emotional_load: { level: "low" },
        consent: { level: "closed" },
        plan_fit: { level: "uncertain" },
        load_balance: { level: "balanced" },
      },
    }),
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "skip");
  assertEquals(plan.reason, "morning_nudge_v2_pause_consentie");
  assertEquals(plan.posture, null);
  assertEquals(plan.relevance, "blocked");
});

Deno.test("V2 morning nudge: weekly proactive cap reached → skip", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "reactivation",
    }),
    nudgesSent7d: 1,
  });

  const gate = skipOrSpeakV2(input, NOW_MS);
  assertEquals(gate, {
    skip: true,
    reason: "morning_nudge_v2_weekly_cap_reached:reactivation:1/1",
  });
});

// ── Test 2: soutien_emotionnel + high emotional → protective_pause ──────────

Deno.test("V2 morning nudge: soutien_emotionnel + high emotional → protective_pause", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "soutien_emotionnel",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "high" },
        consent: { level: "open" },
        plan_fit: { level: "uncertain" },
        load_balance: { level: "balanced" },
      },
    }),
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "protective_pause");
  assertStringIncludes(
    String(plan.instruction ?? ""),
    "aucune action",
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "posture=protective_pause",
  );
});

// ── Test 3: medium emotional → support_softly ───────────────────────────────

Deno.test("V2 morning nudge: medium emotional load → support_softly", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "friction_legere",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "medium" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "support_softly");
  assertStringIncludes(
    String(plan.instruction ?? ""),
    "PAS dans un nudge d'actions",
  );
});

// ── Test 4: upcoming event → pre_event_grounding ────────────────────────────

Deno.test("V2 morning nudge: upcoming_event in pulse → pre_event_grounding", () => {
  const pulse: ConversationPulse = {
    version: 1,
    generated_at: NOW_ISO,
    window_days: 7,
    last_72h_weight: 0.6,
    tone: {
      dominant: "steady",
      emotional_load: "low",
      relational_openness: "open",
    },
    trajectory: { direction: "flat", confidence: "medium", summary: "stable" },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "push",
      upcoming_event: "Entretien d'embauche vendredi",
      proactive_risk: "low",
    },
    evidence_refs: { message_ids: [], event_ids: [] },
  };

  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({ current_state: "momentum" }),
    conversationPulse: pulse,
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "pre_event_grounding");
  assertStringIncludes(
    String(plan.fallback_text ?? ""),
    "Entretien d'embauche vendredi",
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "upcoming_event=Entretien d'embauche vendredi",
  );
});

// ── Test 5: reactivation + silence → open_door ──────────────────────────────

Deno.test("V2 morning nudge: reactivation + silence → open_door", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "reactivation",
      dimensions: {
        engagement: { level: "low" },
        execution_traction: { level: "unknown" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "uncertain" },
        load_balance: { level: "balanced" },
      },
    }),
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "open_door");
  assertEquals(plan.relevance, "low");
  assertStringIncludes(
    String(plan.instruction ?? ""),
    "porte ouverte",
  );
});

// ── Test 6: friction_legere + blocker → simplify_today ──────────────────────

Deno.test("V2 morning nudge: friction_legere + blocker → simplify_today", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "friction_legere",
      assessment: {
        top_blocker: "Marcher 10 min",
        top_risk: "avoidance",
        confidence: "medium",
      },
    }),
    todayPlanItems: [makePlanItem("Marcher 10 min")],
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "simplify_today");
  assertEquals(plan.relevance, "high");
  assertStringIncludes(
    String(plan.fallback_text ?? ""),
    "Marcher 10 min",
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "top_blocker=Marcher 10 min",
  );
});

// ── Test 7: momentum + items → focus_today ──────────────────────────────────

Deno.test("V2 morning nudge: momentum + items → focus_today", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    todayPlanItems: [
      makePlanItem("Marcher 10 min"),
      makePlanItem("Journaling"),
    ],
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "focus_today");
  assertEquals(plan.relevance, "high");
  assertStringIncludes(String(plan.instruction ?? ""), "cap clair");
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "posture=focus_today",
  );
});

// ── Test 8: recent victory → celebration_ping ───────────────────────────────

Deno.test("V2 morning nudge: recent victory → celebration_ping", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    recentVictories: [
      {
        title: "Premier run de 5km sans pause",
        created_at: "2026-03-23T18:00:00.000Z",
      },
    ],
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "send");
  assertEquals(plan.posture, "celebration_ping");
  assertStringIncludes(
    String(plan.fallback_text ?? ""),
    "Premier run de 5km sans pause",
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "recent_victory=Premier run de 5km sans pause",
  );
});

Deno.test("V2 morning nudge: heartbeat nearly reached → celebration_ping", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    phaseContext: {
      current_phase_id: "phase-2",
      current_phase_order: 2,
      current_phase_title: "Stabiliser le rythme",
      total_phases: 4,
      completed_phase_ids: ["phase-1"],
      current_phase_item_ids: ["item-marcher-10-min"],
      maintenance_habit_item_ids: [],
      heartbeat_title: "Jours tenus",
      heartbeat_unit: "jours",
      heartbeat_current: 4,
      heartbeat_target: 5,
      heartbeat_tracking_mode: "manual",
      heartbeat_progress_ratio: 0.8,
      heartbeat_reached: false,
      heartbeat_almost_reached: true,
      current_phase_completion_ratio: 0.75,
      transition_ready: false,
    },
  });

  const posture = selectPostureV2(input, NOW_MS);
  assertEquals(posture, "celebration_ping");

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.posture, "celebration_ping");
  assertStringIncludes(
    String(plan.fallback_text ?? ""),
    "Stabiliser le rythme (Jours tenus)",
  );
  assertStringIncludes(
    String(plan.event_grounding ?? ""),
    "heartbeat_almost_reached=true",
  );
});

// ── Test 9: cooldown blocks same posture, falls back to adjacent ────────────

Deno.test("V2 morning nudge: cooldown blocks same posture → fallback to adjacent", () => {
  const lastNudge: LastNudgeInfo = {
    posture: "focus_today",
    sent_at: "2026-03-23T07:00:00.000Z",
    user_reacted: false,
    consecutive_same_posture: 1,
    primary_item_titles: ["Autre item"],
  };

  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    lastNudge,
  });

  const posture = selectPostureV2(input, NOW_MS);
  assertEquals(posture, "focus_today");

  const validated = validateCooldownV2(posture, input, NOW_MS);
  assertEquals(validated, "simplify_today");
});

Deno.test("V2 morning nudge: same item cooldown blocks item-centric posture → fallback to open_door", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "friction_legere",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    todayPlanItems: [makePlanItem("Marcher 10 min")],
    lastNudge: {
      posture: "focus_today",
      sent_at: "2026-03-23T12:00:00.000Z",
      user_reacted: false,
      consecutive_same_posture: 0,
      primary_item_titles: ["Marcher 10 min"],
    },
  });

  const validated = validateCooldownV2("simplify_today", input, NOW_MS);
  assertEquals(validated, "open_door");
});

Deno.test("V2 morning nudge: full proactive history blocks same posture even if last nudge differs", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    lastNudge: {
      posture: "support_softly",
      sent_at: "2026-03-24T04:00:00.000Z",
      user_reacted: false,
      consecutive_same_posture: 1,
      primary_item_titles: ["Autre item"],
    },
    proactiveHistory: [
      {
        event_context: "morning_nudge_v2",
        scheduled_for: "2026-03-23T12:00:00.000Z",
        status: "sent",
        posture: "focus_today",
        item_titles: ["Autre item"],
        user_reacted: false,
        window_kind: "morning_presence",
      },
      {
        event_context: "morning_nudge_v2",
        scheduled_for: "2026-03-24T04:00:00.000Z",
        status: "sent",
        posture: "support_softly",
        item_titles: ["Autre item"],
        user_reacted: false,
        window_kind: "morning_presence",
      },
    ],
  });

  const validated = validateCooldownV2("focus_today", input, NOW_MS);
  assertEquals(validated, "simplify_today");
});

Deno.test("V2 morning nudge: full proactive history blocks same item even if last nudge targeted something else", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "friction_legere",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    }),
    lastNudge: {
      posture: "support_softly",
      sent_at: "2026-03-24T04:00:00.000Z",
      user_reacted: false,
      consecutive_same_posture: 0,
      primary_item_titles: ["Autre item"],
    },
    proactiveHistory: [
      {
        event_context: "morning_nudge_v2",
        scheduled_for: "2026-03-23T12:00:00.000Z",
        status: "sent",
        posture: "focus_today",
        item_titles: ["Marcher 10 min"],
        user_reacted: false,
        window_kind: "morning_presence",
      },
      {
        event_context: "momentum_soutien_emotionnel",
        scheduled_for: "2026-03-24T04:00:00.000Z",
        status: "sent",
        posture: "support_softly",
        item_titles: ["Autre item"],
        user_reacted: false,
        window_kind: "midday_rescue",
      },
    ],
  });

  const validated = validateCooldownV2("simplify_today", input, NOW_MS);
  assertEquals(validated, "open_door");
});

// ── Test 10: posture fatigue (2+ same without reaction) → skip ──────────────

Deno.test("V2 morning nudge: posture fatigue 2+ same without reaction → skip", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({ current_state: "momentum" }),
    lastNudge: {
      posture: "focus_today",
      sent_at: "2026-03-22T07:00:00.000Z",
      user_reacted: false,
      consecutive_same_posture: 2,
      primary_item_titles: ["Marcher 10 min"],
    },
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "skip");
  assertStringIncludes(plan.reason, "posture_fatigue");
});

// ── Test 11: overloaded load_balance → simplify_today ───────────────────────

Deno.test("V2 morning nudge: overloaded load_balance → simplify_today", () => {
  const input = makeV2Input({
    momentumV2: makeStoredMomentumV2({
      current_state: "momentum",
      dimensions: {
        engagement: { level: "high" },
        execution_traction: { level: "up" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "overloaded" },
      },
    }),
  });

  const posture = selectPostureV2(input, NOW_MS);
  assertEquals(posture, "simplify_today");
});

// ── Test 12: no items at all → skip ─────────────────────────────────────────

Deno.test("V2 morning nudge: no items → skip", () => {
  const input = makeV2Input({
    todayPlanItems: [],
    activePlanItems: [],
  });

  const plan = buildMorningNudgePlanV2(input);
  assertEquals(plan.decision, "skip");
  assertEquals(plan.reason, "morning_nudge_v2_no_items");
});

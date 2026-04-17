import { assertEquals } from "jsr:@std/assert";

import type {
  ConfidenceLevel,
  ConversationPulse,
  MomentumStateV2,
  WeeklyConversationDigest,
} from "../_shared/v2-types.ts";
import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import type { MomentumStateLabel, StoredMomentumV2 } from "./momentum_state.ts";
import type { ProactiveHistoryEntry } from "./cooldown_engine.ts";
import {
  buildProactiveWindowDecidedPayload,
  checkAbsoluteLocks,
  checkBudget,
  checkConfidence,
  computeBudgetStatus,
  evaluateProactiveWindow,
  identifyDominantNeed,
  type ProactiveWindowInput,
  selectPosture,
  selectWindowKind,
} from "./proactive_windows_engine.ts";

const NOW_ISO = "2026-03-25T10:00:00.000Z";
const TIMEZONE = "Europe/Paris";

function defaultMomentumV2(
  overrides: Partial<StoredMomentumV2> = {},
): StoredMomentumV2 {
  return {
    version: 2,
    updated_at: NOW_ISO,
    current_state: "momentum",
    state_reason: "test",
    dimensions: {
      engagement: { level: "high" },
      execution_traction: { level: "up" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    posture: {
      recommended_posture: "maintain",
      override_reason: null,
    },
    assessment: {
      top_risk: null,
      top_blocker: null,
      confidence: "high",
    },
    active_load: {
      total_active: 3,
      by_dimension: { missions: 1, habits: 1, support: 1 },
      traction: {},
      needs_reduce: false,
      needs_consolidate: false,
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
    ...overrides,
  } as StoredMomentumV2;
}

function defaultInput(
  overrides: Partial<ProactiveWindowInput> = {},
): ProactiveWindowInput {
  return {
    userId: "user-1",
    momentumV2: defaultMomentumV2(),
    conversationPulse: null,
    weeklyDigest: null,
    repairMode: null,
    proactiveHistory: [],
    upcomingEvents: [],
    planItems: [
      {
        id: "item-1",
        title: "Mediter 10 min",
        status: "active",
        dimension: "habits",
        kind: "habit",
        scheduled_days: [],
      } as unknown as PlanItemRuntimeRow,
    ],
    recentVictoryTitles: [],
    planDeepWhy: null,
    nowIso: NOW_ISO,
    timezone: TIMEZONE,
    localDayCode: "tue",
    ...overrides,
  };
}

function weeklyDigest(
  overrides: Partial<WeeklyConversationDigest> = {},
): WeeklyConversationDigest {
  return {
    version: 1,
    week_start: "2026-03-17",
    generated_at: NOW_ISO,
    dominant_tone: "silence",
    tone_evolution: "peu d'échanges cette semaine",
    best_traction_moments: [],
    closure_fatigue_moments: [],
    most_real_blockage: null,
    support_that_helped: null,
    main_risk_next_week: null,
    relational_opportunity: null,
    confidence: "low",
    message_count: 2,
    active_days: 1,
    ...overrides,
  };
}

// ── Absolute Locks ──────────────────────────────────────────────────────────

Deno.test("absolute lock: pause_consentie → skip", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({ current_state: "pause_consentie" }),
  });
  const result = checkAbsoluteLocks(input);
  assertEquals(result!.decision, "skip");
  assertEquals(result!.reason, "absolute_lock:pause_consentie");
});

Deno.test("absolute lock: repair_mode active → downgrade", () => {
  const input = defaultInput({
    repairMode: {
      version: 1,
      active: true,
      entered_at: NOW_ISO,
      reason: "test",
      source: "system",
      reopen_signals_count: 0,
      last_soft_contact_at: null,
    },
  });
  const result = checkAbsoluteLocks(input);
  assertEquals(result!.decision, "downgrade_to_soft_presence");
  assertEquals(result!.posture, "protective_pause");
});

Deno.test("absolute lock: no lock → null", () => {
  const input = defaultInput();
  const result = checkAbsoluteLocks(input);
  assertEquals(result, null);
});

// ── Budget ──────────────────────────────────────────────────────────────────

Deno.test("budget: empty history → all clear", () => {
  const status = computeBudgetStatus([], NOW_ISO, TIMEZONE);
  assertEquals(status.notable_today, 0);
  assertEquals(status.notable_7d, 0);
  assertEquals(checkBudget("notable", status), null);
  assertEquals(checkBudget("light", status), null);
});

Deno.test("budget: 1 notable today → blocks second notable", () => {
  const history: ProactiveHistoryEntry[] = [
    {
      event_context: "momentum_friction_legere",
      scheduled_for: new Date(
        new Date(NOW_ISO).getTime() - 3 * 60 * 60 * 1000,
      ).toISOString(),
      status: "sent",
      posture: "simplify_today",
      item_titles: [],
      user_reacted: false,
      window_kind: "midday_rescue",
    },
  ];
  const status = computeBudgetStatus(history, NOW_ISO, TIMEZONE);
  assertEquals(status.notable_today, 1);
  const block = checkBudget("notable", status);
  assertEquals(typeof block, "string");
  assertEquals(block!.includes("notable_daily"), true);
});

Deno.test("budget: notable today blocks light same day", () => {
  const history: ProactiveHistoryEntry[] = [
    {
      event_context: "momentum_friction_legere",
      scheduled_for: new Date(
        new Date(NOW_ISO).getTime() - 3 * 60 * 60 * 1000,
      ).toISOString(),
      status: "sent",
      posture: "simplify_today",
      item_titles: [],
      user_reacted: false,
      window_kind: "midday_rescue",
    },
  ];
  const status = computeBudgetStatus(history, NOW_ISO, TIMEZONE);
  const block = checkBudget("light", status);
  assertEquals(typeof block, "string");
  assertEquals(
    block!.includes("light_suppressed_by_notable"),
    true,
  );
});

Deno.test("budget: silent always allowed", () => {
  const block = checkBudget("silent", {
    notable_today: 5,
    notable_7d: 20,
    light_today: 10,
    light_7d: 50,
    any_notable_today: true,
  });
  assertEquals(block, null);
});

// ── Confidence ──────────────────────────────────────────────────────────────

Deno.test("confidence: low → not allowed", () => {
  const result = checkConfidence("low");
  assertEquals(result.allowed, false);
});

Deno.test("confidence: medium → allowed, max light", () => {
  const result = checkConfidence("medium");
  assertEquals(result.allowed, true);
  assertEquals(result.max_budget, "light");
});

Deno.test("confidence: high → allowed, max notable", () => {
  const result = checkConfidence("high");
  assertEquals(result.allowed, true);
  assertEquals(result.max_budget, "notable");
});

// ── Dominant Need ───────────────────────────────────────────────────────────

Deno.test("dominant need: upcoming event → pre_event", () => {
  const input = defaultInput({
    upcomingEvents: [
      {
        title: "Entretien important",
        scheduled_at: new Date(
          new Date(NOW_ISO).getTime() + 12 * 60 * 60 * 1000,
        ).toISOString(),
        event_type: "meeting",
        source: "detect-future-events",
      },
    ],
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "pre_event");
});

Deno.test("dominant need: pulse upcoming_event → pre_event", () => {
  const input = defaultInput({
    conversationPulse: {
      signals: { upcoming_event: "Visite medicale demain" },
    } as unknown as ConversationPulse,
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "pre_event");
});

Deno.test("dominant need: high emotional load → emotional_protection", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "high" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "balanced" },
      },
    } as any),
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "emotional_protection");
});

Deno.test("dominant need: overloaded → load_relief", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "overloaded" },
      },
    } as any),
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "load_relief");
});

Deno.test("dominant need: reactivation state → reactivation", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      current_state: "reactivation",
    }),
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "reactivation");
});

Deno.test("dominant need: silent weekly digest → reactivation", () => {
  const input = defaultInput({
    weeklyDigest: weeklyDigest(),
  });
  const need = identifyDominantNeed(input);
  assertEquals(need, "reactivation");
});

Deno.test("dominant need: normal momentum → general_presence", () => {
  const input = defaultInput();
  const need = identifyDominantNeed(input);
  assertEquals(need, "general_presence");
});

// ── Window Kind Selection ───────────────────────────────────────────────────

Deno.test("window kind: pre_event → pre_event_grounding", () => {
  const input = defaultInput();
  const kind = selectWindowKind("pre_event", input);
  assertEquals(kind, "pre_event_grounding");
});

Deno.test("window kind: reactivation → reactivation_window", () => {
  const input = defaultInput();
  const kind = selectWindowKind("reactivation", input);
  assertEquals(kind, "reactivation_window");
});

Deno.test("window kind: general presence morning → morning_presence", () => {
  const morningIso = "2026-03-25T06:00:00.000Z"; // 7h Paris
  const input = defaultInput({ nowIso: morningIso });
  const kind = selectWindowKind("general_presence", input);
  assertEquals(kind, "morning_presence");
});

Deno.test("window kind: general presence evening → evening_reflection_light", () => {
  const eveningIso = "2026-03-25T17:00:00.000Z"; // 18h Paris
  const input = defaultInput({ nowIso: eveningIso });
  const kind = selectWindowKind("general_presence", input);
  assertEquals(kind, "evening_reflection_light");
});

// ── Posture Selection ───────────────────────────────────────────────────────

Deno.test("posture: morning + high emotional → protective_pause", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      current_state: "soutien_emotionnel",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "high" },
        consent: { level: "fragile" },
        plan_fit: { level: "acceptable" },
        load_balance: { level: "balanced" },
      },
    } as any),
  });
  const posture = selectPosture("morning_presence", input);
  assertEquals(posture, "protective_pause");
});

Deno.test("posture: pre_event_grounding → pre_event_grounding", () => {
  const input = defaultInput();
  const posture = selectPosture("pre_event_grounding", input);
  assertEquals(posture, "pre_event_grounding");
});

Deno.test("posture: midday_rescue + overloaded → simplify_today", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "low" },
        consent: { level: "open" },
        plan_fit: { level: "good" },
        load_balance: { level: "overloaded" },
      },
    } as any),
  });
  const posture = selectPosture("midday_rescue", input);
  assertEquals(posture, "simplify_today");
});

Deno.test("posture: evening + recent victories → celebration_ping", () => {
  const input = defaultInput({ recentVictoryTitles: ["Premier run 5k!"] });
  const posture = selectPosture("evening_reflection_light", input);
  assertEquals(posture, "celebration_ping");
});

Deno.test("posture: reactivation → open_door", () => {
  const input = defaultInput();
  const posture = selectPosture("reactivation_window", input);
  assertEquals(posture, "open_door");
});

// ── Full Evaluation ─────────────────────────────────────────────────────────

Deno.test("evaluate: happy path → create_window", () => {
  const input = defaultInput();
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "create_window");
  assertEquals(output.window_kind !== null, true);
  assertEquals(output.posture !== null, true);
  assertEquals(output.target_plan_item_ids.length > 0, true);
});

Deno.test("evaluate: pause_consentie → skip", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({ current_state: "pause_consentie" }),
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "skip");
  assertEquals(output.reason.includes("pause_consentie"), true);
});

Deno.test("evaluate: no plan items → skip", () => {
  const input = defaultInput({ planItems: [] });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "skip");
  assertEquals(output.reason, "no_plan_items");
});

Deno.test("evaluate: low confidence → skip", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      assessment: {
        top_risk: null,
        top_blocker: null,
        confidence: "low",
      },
    } as any),
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "skip");
  assertEquals(output.reason.includes("confidence_too_low"), true);
});

Deno.test("evaluate: medium confidence downgrades notable need to light-only posture", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      assessment: {
        top_risk: null,
        top_blocker: null,
        confidence: "medium",
      },
    } as any),
    upcomingEvents: [
      {
        title: "Rendez-vous important",
        scheduled_at: new Date(
          new Date(NOW_ISO).getTime() + 6 * 60 * 60 * 1000,
        ).toISOString(),
        event_type: "meeting",
        source: "detect-future-events",
      },
    ],
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "create_window");
  assertEquals(output.window_kind, "morning_presence");
  assertEquals(output.budget_class, "light");
  assertEquals(output.posture, "open_door");
});

Deno.test("evaluate: relation preferences low intensity downgrades notable window to light", () => {
  const input = defaultInput({
    relationPreferences: {
      user_id: "user-1",
      preferred_contact_windows: ["morning"],
      disliked_contact_windows: null,
      preferred_tone: "gentle",
      preferred_message_length: "short",
      max_proactive_intensity: "low",
      soft_no_contact_rules: null,
      updated_at: NOW_ISO,
    },
    upcomingEvents: [
      {
        title: "Rendez-vous important",
        scheduled_at: new Date(
          new Date(NOW_ISO).getTime() + 6 * 60 * 60 * 1000,
        ).toISOString(),
        event_type: "meeting",
        source: "detect-future-events",
      },
    ],
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "create_window");
  assertEquals(output.window_kind, "morning_presence");
  assertEquals(output.budget_class, "light");
});

Deno.test("evaluate: repair mode → downgrade_to_soft_presence", () => {
  const input = defaultInput({
    repairMode: {
      version: 1,
      active: true,
      entered_at: NOW_ISO,
      reason: "test",
      source: "system",
      reopen_signals_count: 0,
      last_soft_contact_at: null,
    },
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "downgrade_to_soft_presence");
  assertEquals(output.posture, "protective_pause");
});

Deno.test("evaluate: disliked contact window blocks proactive send", () => {
  const input = defaultInput({
    relationPreferences: {
      user_id: "user-1",
      preferred_contact_windows: null,
      disliked_contact_windows: ["morning"],
      preferred_tone: null,
      preferred_message_length: null,
      max_proactive_intensity: null,
      soft_no_contact_rules: { avoid_day_parts: ["morning"] },
      updated_at: NOW_ISO,
    },
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "skip");
  assertEquals(
    output.reason,
    "relation_preferences_blocked:contact_window:morning",
  );
});

Deno.test("evaluate: policy min gap blocks a follow-up proactive", () => {
  const input = defaultInput({
    momentumV2: defaultMomentumV2({
      current_state: "friction_legere",
    }),
    proactiveHistory: [
      {
        event_context: "momentum_friction_legere",
        scheduled_for: "2026-03-24T22:00:00.000Z",
        status: "sent",
        posture: "simplify_today",
        item_titles: [],
        user_reacted: false,
        window_kind: "midday_rescue",
      },
    ],
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "skip");
  assertEquals(output.reason, "policy_min_gap:friction_legere:48h");
});

Deno.test("evaluate: upcoming event → pre_event_grounding window", () => {
  const input = defaultInput({
    upcomingEvents: [
      {
        title: "Rendez-vous important",
        scheduled_at: new Date(
          new Date(NOW_ISO).getTime() + 6 * 60 * 60 * 1000,
        ).toISOString(),
        event_type: "meeting",
        source: "detect-future-events",
      },
    ],
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "create_window");
  assertEquals(output.window_kind, "pre_event_grounding");
  assertEquals(output.posture, "pre_event_grounding");
  assertEquals(output.dominant_need, "pre_event");
});

Deno.test("evaluate: silent weekly digest nudges toward open_door reactivation", () => {
  const input = defaultInput({
    weeklyDigest: weeklyDigest(),
  });
  const output = evaluateProactiveWindow(input);
  assertEquals(output.decision, "create_window");
  assertEquals(output.window_kind, "reactivation_window");
  assertEquals(output.posture, "open_door");
  assertEquals(output.dominant_need, "reactivation");
});

Deno.test("build payload: returns canonical proactive_window_decided payload", () => {
  const output = evaluateProactiveWindow(defaultInput());
  const payload = buildProactiveWindowDecidedPayload(
    "user-1",
    output,
    "cycle-1",
    "transfo-1",
  );
  assertEquals(payload.user_id, "user-1");
  assertEquals(payload.cycle_id, "cycle-1");
  assertEquals(payload.transformation_id, "transfo-1");
  assertEquals(payload.window_kind, output.window_kind);
  assertEquals(payload.reason, output.reason);
});

import {
  computeStreakFromEntries,
  deterministicStaleBilanDecision,
  logPlanItemProgressV2,
  mapMomentumStateV2ToCoachingContext,
  recordNorthStarMetricV2,
  resolveAgentChatModel,
  resolveCoachingTargetPlanItem,
  type V2PlanItemSnapshotItem,
} from "./run.ts";
import { buildDispatcherPromptV2 } from "./dispatcher.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";
import { writeMomentumStateV2 } from "../momentum_state.ts";
import type {
  UserCycleRow,
  UserMetricRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../../_shared/v2-types.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("deterministicStaleBilanDecision: resumes stale bilan on explicit resume", () => {
  assertEquals(
    deterministicStaleBilanDecision("ok on reprend"),
    "resume_bilan",
  );
});

Deno.test("deterministicStaleBilanDecision: stops for today on defer language", () => {
  assertEquals(
    deterministicStaleBilanDecision("pas maintenant, on voit demain"),
    "stop_for_today",
  );
});

Deno.test("deterministicStaleBilanDecision: leaves unrelated topic unresolved for fallback", () => {
  assertEquals(
    deterministicStaleBilanDecision("au fait j'ai une question sur mon plan"),
    null,
  );
});

Deno.test("resolveAgentChatModel: explicit override wins", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    explicitModel: "gpt-5.4-mini",
    memoryPlan: {
      response_intent: "inventory",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "dossier",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      plan_confidence: 0.99,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "explicit_override");
  assertEquals(selected.tier, "explicit");
});

Deno.test("resolveAgentChatModel: non-companion mode keeps default flash model", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "investigator",
    memoryPlan: {
      response_intent: "reflection",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "broad",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      plan_confidence: 0.95,
    },
  });

  assertEquals(
    selected.model,
    String(getGlobalAiModel("gemini-2.5-flash")).trim(),
  );
  assertEquals(selected.source, "non_companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveAgentChatModel: companion uses memory plan tier when confidence is sufficient", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "problem_solving",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "targeted",
      model_tier_hint: "lite",
      context_budget_tier: "small",
      targets: [],
      plan_confidence: 0.81,
    },
  });

  assertEquals(selected.model, "gpt-5.4-nano");
  assertEquals(selected.source, "memory_plan_lite");
  assertEquals(selected.tier, "lite");
});

Deno.test("resolveAgentChatModel: low-confidence memory plan falls back to current default", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "light",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      plan_confidence: 0.4,
    },
  });

  assertEquals(
    selected.model,
    String(getGlobalAiModel("gemini-2.5-flash")).trim(),
  );
  assertEquals(selected.source, "companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveCoachingTargetPlanItem: matches exact active plan item title", () => {
  const matched = resolveCoachingTargetPlanItem({
    planItems: [
      {
        id: "pi-1",
        user_id: "u1",
        cycle_id: "c1",
        transformation_id: "t1",
        plan_id: "p1",
        dimension: "missions",
        kind: "task",
        status: "active",
        title: "Envoyer le dossier",
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
        payload: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activated_at: null,
        completed_at: null,
        last_entry_at: null,
        recent_entries: [],
      },
    ],
    actionHint: "Envoyer le dossier",
  });

  assertEquals(matched, {
    id: "pi-1",
    dimension: "missions",
    kind: "task",
    title: "Envoyer le dossier",
    status: "active",
  });
});

Deno.test("resolveCoachingTargetPlanItem: falls back to top blocker title when hint is absent", () => {
  const matched = resolveCoachingTargetPlanItem({
    planItems: [
      {
        id: "pi-2",
        user_id: "u1",
        cycle_id: "c1",
        transformation_id: "t1",
        plan_id: "p1",
        dimension: "support",
        kind: "framework",
        status: "stalled",
        title: "Journal de gratitude",
        description: null,
        tracking_type: "boolean",
        activation_order: 2,
        activation_condition: null,
        current_habit_state: null,
        support_mode: "recommended_now",
        support_function: "understanding",
        target_reps: null,
        current_reps: null,
        cadence_label: null,
        scheduled_days: null,
        time_of_day: null,
        start_after_item_id: null,
        phase_id: null,
        payload: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activated_at: null,
        completed_at: null,
        last_entry_at: null,
        recent_entries: [],
      },
    ],
    fallbackTitle: "Journal de gratitude",
  });

  assertEquals(matched, {
    id: "pi-2",
    dimension: "support",
    kind: "framework",
    title: "Journal de gratitude",
    status: "stalled",
  });
});

Deno.test("mapMomentumStateV2ToCoachingContext: exposes plan fit and load balance", () => {
  const tempMemory = writeMomentumStateV2({}, {
    version: 2,
    updated_at: new Date().toISOString(),
    current_state: "friction_legere",
    state_reason: "test",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "poor" },
      load_balance: { level: "overloaded" },
    },
    assessment: {
      top_blocker: "Envoyer le dossier",
      top_risk: "load",
      confidence: "medium",
    },
    active_load: {
      current_load_score: 8,
      mission_slots_used: 3,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: true,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "reduce_load", confidence: "medium" },
    blockers: { blocker_kind: "mission", blocker_repeat_score: 4 },
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
  });

  assertEquals(mapMomentumStateV2ToCoachingContext(tempMemory), {
    plan_fit: "poor",
    load_balance: "overloaded",
    active_load_score: 8,
    needs_reduce: true,
    blocker_kind: "mission",
    top_risk: "load",
    posture: "reduce_load",
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Plan Item Snapshot Tests
// ═══════════════════════════════════════════════════════════════════════════════

function makeEntry(kind: string): any {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    plan_item_id: "pi1",
    entry_kind: kind,
    outcome: kind === "skip" ? "skipped" : "done",
    value_numeric: null,
    note: null,
    effective_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    source: "test",
    payload: {},
  };
}

Deno.test("computeStreakFromEntries: counts consecutive positive entries", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("progress"),
    makeEntry("partial"),
    makeEntry("skip"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 3);
});

Deno.test("computeStreakFromEntries: returns 0 when first entry is negative", () => {
  const entries = [
    makeEntry("skip"),
    makeEntry("checkin"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 0);
});

Deno.test("computeStreakFromEntries: returns 0 for empty entries", () => {
  assertEquals(computeStreakFromEntries([]), 0);
});

Deno.test("computeStreakFromEntries: handles all positive entries", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("progress"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 3);
});

Deno.test("computeStreakFromEntries: blocker breaks streak", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("blocker"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 1);
});

Deno.test("computeStreakFromEntries: support_feedback is neutral (not positive, not negative) — breaks streak", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("support_feedback"),
    makeEntry("checkin"),
  ];
  // support_feedback is neither positive nor negative, so it breaks the streak
  assertEquals(computeStreakFromEntries(entries), 1);
});

Deno.test("buildDispatcherPromptV2: injects V2 plan items snapshot into dispatcher prompt", () => {
  const planItemSnapshot: V2PlanItemSnapshotItem[] = [
    {
      id: "habit-1234-abcd",
      title: "Meditation du soir",
      dimension: "habits",
      item_type: "habit",
      status: "active",
      streak_current: 4,
      last_entry_at: "2026-03-24T07:30:00.000Z",
      active_load_score: 7,
    },
  ];

  const prompt = buildDispatcherPromptV2({
    activeMachine: null,
    userMessage: "J'ai fait ma meditation ce soir",
    last5Messages: [],
    signalHistory: [],
    stateSnapshot: {},
    lastAssistantMessage: "",
    plan_item_snapshot: planItemSnapshot,
  }).fullPrompt;

  if (!prompt.includes("=== SNAPSHOT PLAN ITEMS V2 ===")) {
    throw new Error("expected dispatcher prompt to include V2 snapshot section");
  }
  if (!prompt.includes("Meditation du soir")) {
    throw new Error("expected dispatcher prompt to include exact V2 plan item title");
  }
  if (!prompt.includes("[id:habit-1234-abcd]")) {
    throw new Error("expected dispatcher prompt to include exact plan item id");
  }
  if (!prompt.includes("(load: 7)")) {
    throw new Error("expected dispatcher prompt to include active load score");
  }
});

Deno.test("buildDispatcherPromptV2: removes legacy CRUD and vital-sign prompt sections", () => {
  const prompt = buildDispatcherPromptV2({
    activeMachine: null,
    userMessage: "Cette habitude est trop dure",
    last5Messages: [],
    signalHistory: [],
    stateSnapshot: {},
    lastAssistantMessage: "",
    plan_item_snapshot: [],
  }).fullPrompt;

  if (prompt.includes("track_progress_vital_sign")) {
    throw new Error("legacy vital sign tracking should not appear in dispatcher prompt");
  }
  if (!prompt.includes("track_progress_plan_item")) {
    throw new Error("expected prompt to mention track_progress_plan_item");
  }
  if (!prompt.includes("plan_item_discussion")) {
    throw new Error("expected prompt to mention plan_item_discussion");
  }
  if (!prompt.includes("plan_feedback")) {
    throw new Error("expected prompt to mention plan_feedback");
  }
});

type MockDbState = Record<string, any[]>;

class MockQueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private action: "select" | "update" = "select";
  private patch: Record<string, unknown> | null = null;

  constructor(private state: MockDbState, private table: string) {}

  select(_columns: string) {
    this.action = "select";
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    const rows = Array.isArray(payload) ? payload : [payload];
    this.state[this.table] ??= [];
    this.state[this.table].push(...structuredClone(rows));
    return Promise.resolve({ data: null, error: null });
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[field]));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  maybeSingle() {
    const rows = this.runSelect();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const promise = this.action === "update"
      ? this.runUpdate()
      : Promise.resolve({ data: this.runSelect(), error: null });
    return promise.then(onfulfilled, onrejected);
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => filter(row));
  }

  private runSelect() {
    const rows = [...(this.state[this.table] ?? [])]
      .filter((row) => this.matches(row));

    for (const order of this.orders) {
      rows.sort((a, b) => {
        const left = a?.[order.field];
        const right = b?.[order.field];
        if (left === right) return 0;
        if (left == null) return order.ascending ? -1 : 1;
        if (right == null) return order.ascending ? 1 : -1;
        return order.ascending
          ? String(left).localeCompare(String(right))
          : String(right).localeCompare(String(left));
      });
    }

    return this.rowLimit == null ? rows : rows.slice(0, this.rowLimit);
  }

  private runUpdate() {
    for (const row of this.state[this.table] ?? []) {
      if (this.matches(row)) {
        Object.assign(row, structuredClone(this.patch ?? {}));
      }
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function createTrackingSupabaseMock(seed: MockDbState) {
  const state = structuredClone(seed);
  return {
    state,
    client: {
      from(table: string) {
        state[table] ??= [];
        return new MockQueryBuilder(state, table);
      },
    },
  };
}

function baseCycle(): UserCycleRow {
  return {
    id: "cycle-1",
    user_id: "u1",
    status: "active",
    raw_intake_text: "test",
    intake_language: "fr",
    validated_structure: null,
    duration_months: 3,
    birth_date_snapshot: null,
    gender_snapshot: null,
    requested_pace: null,
    active_transformation_id: "transfo-1",
    version: 1,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    completed_at: null,
    archived_at: null,
  };
}

function baseTransformation(): UserTransformationRow {
  return {
    id: "transfo-1",
    cycle_id: "cycle-1",
    priority_order: 1,
    status: "active",
    title: "Transformation test",
    internal_summary: "internal",
    user_summary: "user",
    success_definition: null,
    main_constraint: null,
    questionnaire_schema: null,
    questionnaire_answers: null,
    completion_summary: null,
    handoff_payload: null,
    base_de_vie_payload: null,
    unlocked_principles: null,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
  };
}

function basePlan(): UserPlanV2Row {
  return {
    id: "plan-1",
    user_id: "u1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    status: "active",
    version: 2,
    title: "Plan test",
    content: {},
    generation_attempts: 1,
    last_generation_reason: null,
    generation_feedback: null,
    generation_input_snapshot: null,
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    archived_at: null,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
  };
}

function basePlanItem(
  overrides: Partial<UserPlanItemRow> = {},
): UserPlanItemRow {
  return {
    id: "item-1",
    user_id: "u1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    plan_id: "plan-1",
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Meditation du soir",
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
    activation_condition: null,
    current_habit_state: "active_building",
    support_mode: null,
    support_function: null,
    target_reps: 5,
    current_reps: 1,
    cadence_label: "daily",
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    phase_id: null,
    payload: {},
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function baseNorthStarMetric(
  overrides: Partial<UserMetricRow> = {},
): UserMetricRow {
  return {
    id: "metric-1",
    user_id: "u1",
    cycle_id: "cycle-1",
    transformation_id: null,
    scope: "cycle",
    kind: "north_star",
    status: "active",
    title: "Pas quotidiens",
    unit: "pas",
    current_value: "3000",
    target_value: "8000",
    payload: {},
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    ...overrides,
  };
}

Deno.test("logPlanItemProgressV2: writes V2 plan item entry and emits event", async () => {
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [baseCycle()],
    user_transformations: [baseTransformation()],
    user_plans_v2: [basePlan()],
    user_plan_items: [basePlanItem()],
    user_plan_item_entries: [],
    user_metrics: [],
    system_runtime_snapshots: [],
  });

  const result = await logPlanItemProgressV2({
    supabase: client as any,
    userId: "u1",
    planItemId: "item-1",
    status: "completed",
    value: 1,
    dateHint: "2026-03-24",
    source: "web",
    sourceMessageId: "msg-1",
  });

  assertEquals(result.mode, "logged");
  assertEquals(state.user_plan_item_entries.length, 1);
  assertEquals(state.user_plan_item_entries[0].plan_item_id, "item-1");
  assertEquals(state.user_plan_item_entries[0].entry_kind, "checkin");
  assertEquals(state.system_runtime_snapshots.length, 1);
  assertEquals(
    state.system_runtime_snapshots[0].snapshot_type,
    "plan_item_entry_logged_v2",
  );
  assertEquals(
    state.system_runtime_snapshots[0].payload.plan_item_id,
    "item-1",
  );
});

Deno.test("recordNorthStarMetricV2: updates V2 metric and emits event", async () => {
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [baseCycle()],
    user_transformations: [baseTransformation()],
    user_plans_v2: [basePlan()],
    user_plan_items: [basePlanItem()],
    user_plan_item_entries: [],
    user_metrics: [baseNorthStarMetric()],
    system_runtime_snapshots: [],
  });

  const result = await recordNorthStarMetricV2({
    supabase: client as any,
    userId: "u1",
    value: 5400,
    note: "bonne marche aujourd'hui",
    dateHint: "2026-03-24",
    source: "whatsapp",
    sourceMessageId: "msg-2",
  });

  assertEquals(result.mode, "logged");
  assertEquals(state.user_metrics[0].current_value, "5400");
  assertEquals(
    state.user_metrics[0].payload.latest_recorded_at,
    "2026-03-24T12:00:00.000Z",
  );
  assertEquals(state.system_runtime_snapshots.length, 1);
  assertEquals(
    state.system_runtime_snapshots[0].snapshot_type,
    "metric_recorded_v2",
  );
  assertEquals(
    state.system_runtime_snapshots[0].payload.metric_id,
    "metric-1",
  );
});

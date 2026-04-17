import {
  buildContextString,
  formatDashboardCapabilitiesAddon,
  formatDashboardCapabilitiesLiteAddon,
  formatNorthStarMetricContext,
  formatPlanItemIndicatorsBlock,
  formatWeeklyRecapSnapshot,
} from "./loader.ts";

import type {
  SystemRuntimeSnapshotRow,
  UserMetricRow,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../_shared/v2-types.ts";
import type { PlanItemRuntimeRow } from "../../_shared/v2-runtime.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

function baseEntry(
  kind: UserPlanItemEntryRow["entry_kind"],
  day: string,
): UserPlanItemEntryRow {
  const iso = `${day}T12:00:00.000Z`;
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    plan_item_id: "pi1",
    entry_kind: kind,
    outcome: kind,
    value_numeric: null,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: iso,
    effective_at: iso,
    metadata: {},
  };
}

function basePlanItem(
  overrides: Partial<UserPlanItemRow> = {},
  entries: UserPlanItemEntryRow[] = [],
): PlanItemRuntimeRow {
  return {
    id: "pi1",
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Méditation du soir",
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
    activation_condition: null,
    current_habit_state: "active_building",
    support_mode: null,
    support_function: null,
    target_reps: 5,
    current_reps: 2,
    cadence_label: "daily",
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    payload: {},
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    last_entry_at: entries[0]?.effective_at ?? null,
    recent_entries: entries,
    ...overrides,
  };
}

function baseNorthStar(
  overrides: Partial<UserMetricRow> = {},
): UserMetricRow {
  return {
    id: "metric-1",
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: null,
    scope: "cycle",
    kind: "north_star",
    status: "active",
    title: "Pas quotidiens",
    unit: "pas",
    current_value: "5400",
    target_value: "8000",
    payload: {
      history: [
        { at: "2026-03-22T12:00:00.000Z", value: 4200 },
        { at: "2026-03-23T12:00:00.000Z", value: 5000 },
        { at: "2026-03-24T12:00:00.000Z", value: 5400 },
      ],
    },
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T12:00:00.000Z",
    ...overrides,
  };
}

Deno.test("formatPlanItemIndicatorsBlock: renders V2 plan item indicators", () => {
  const block = formatPlanItemIndicatorsBlock([
    basePlanItem({}, [
      baseEntry("checkin", "2026-03-24"),
      baseEntry("progress", "2026-03-23"),
      baseEntry("skip", "2026-03-22"),
    ]),
  ]);

  assert(block.includes("=== INDICATEURS PLAN ITEMS (V2) ==="));
  assert(block.includes("Méditation du soir"));
  assert(block.includes("[habitudes]"));
  assert(block.includes("streak=2"));
  assert(block.includes("tendance=en hausse"));
});

Deno.test("formatNorthStarMetricContext: renders current value and recent history", () => {
  const block = formatNorthStarMetricContext(baseNorthStar());

  assert(block.includes("=== NORTH STAR ACTIVE (V2) ==="));
  assert(block.includes("Pas quotidiens"));
  assert(block.includes("Valeur actuelle: 5400 pas"));
  assert(block.includes("2026-03-24: 5400 pas"));
});

Deno.test("formatWeeklyRecapSnapshot: extracts summary from V2 runtime snapshot", () => {
  const snapshot: Pick<
    SystemRuntimeSnapshotRow,
    "snapshot_type" | "payload" | "created_at"
  > = {
    snapshot_type: "weekly_bilan_completed_v2",
    created_at: "2026-03-24T18:00:00.000Z",
    payload: {
      user_id: "u1",
      cycle_id: "c1",
      transformation_id: "t1",
      metadata: {
        week_start: "2026-03-16",
        decision: "consolidate",
        output: {
          decision: "consolidate",
          suggested_posture_next_week: "focus_today",
          coaching_note: "On garde moins d'items, mais mieux tenus.",
          load_adjustments: [{ id: "adj-1" }, { id: "adj-2" }],
        },
      },
    },
  };

  const block = formatWeeklyRecapSnapshot(snapshot);

  assert(block !== null, "expected a formatted weekly recap");
  assert(block?.includes("Semaine: 2026-03-16"));
  assert(block?.includes("Décision: consolidate"));
  assert(block?.includes("Ajustements retenus: 2"));
  assert(block?.includes("On garde moins d'items, mais mieux tenus."));
});

Deno.test("dashboard capability addons: describe V2 surfaces instead of legacy V1 sections", () => {
  const lite = formatDashboardCapabilitiesLiteAddon();
  const full = formatDashboardCapabilitiesAddon({ intents: ["plan_item_discussion"] });

  assert(lite.includes("Carte North Star"));
  assert(lite.includes("Sections dimensions: Soutien, Missions, Habitudes"));
  assert(!lite.includes("Construction du Temple"));
  assert(full.includes("Unlock preview"));
  assert(full.includes("Mission cards"));
  assert(!full.includes("Actions Personnelles"));
});

Deno.test("buildContextString: plan item indicators block is injected", () => {
  const ctx = buildContextString({
    planItemIndicators: "=== INDICATEURS PLAN ITEMS (V2) ===\nBLOCK\n",
  });

  assert(ctx.includes("=== INDICATEURS PLAN ITEMS (V2) ==="));
  assert(ctx.includes("BLOCK"));
});

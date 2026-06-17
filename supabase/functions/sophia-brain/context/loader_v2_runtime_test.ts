import {
  buildContextString,
  formatCurrentWeekPlanContextBlock,
  formatDashboardCapabilitiesAddon,
  formatDashboardCapabilitiesLiteAddon,
  formatPlanItemIndicatorsBlock,
  formatWeeklyRecapSnapshot,
} from "./loader.ts";

import type {
  SystemRuntimeSnapshotRow,
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
  } as PlanItemRuntimeRow;
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

Deno.test("formatCurrentWeekPlanContextBlock: renders current week actions, validation and execution details", () => {
  const block = formatCurrentWeekPlanContextBlock({
    timezone: "Europe/Paris",
    weekStart: "2026-06-15",
    items: [
      {
        id: "pi-focus",
        dimension: "habits",
        kind: "habit",
        status: "active",
        title: "Session focus courte",
        description: "Faire une session focus sans viser parfait.",
        tracking_type: "boolean",
        activation_order: 1,
        current_habit_state: "active_building",
        target_reps: 4,
        current_reps: 1,
        cadence_label: "4 fois cette semaine",
        scheduled_days: ["mon", "wed", "fri", "sun"],
        time_of_day: "evening",
        payload: { recommended_day: "fri", note: "priorité douce" },
        updated_at: "2026-06-16T09:00:00.000Z",
        activated_at: "2026-06-15T07:00:00.000Z",
      },
    ],
    weekPlans: [
      {
        plan_item_id: "pi-focus",
        week_start_date: "2026-06-15",
        status: "confirmed",
        confirmed_at: "2026-06-16T05:00:00.000Z",
        updated_at: "2026-06-16T05:00:00.000Z",
      },
    ],
    occurrences: [
      {
        plan_item_id: "pi-focus",
        week_start_date: "2026-06-15",
        ordinal: 1,
        planned_day: "fri",
        original_planned_day: "sun",
        actual_day: "fri",
        default_day: "sun",
        status: "planned",
        source: "weekly_confirmed",
        validated_at: "2026-06-16T05:00:00.000Z",
      },
    ],
    entries: [
      {
        plan_item_id: "pi-focus",
        entry_kind: "progress",
        outcome: "done",
        value_text: "Session faite hier",
        difficulty_level: "low",
        blocker_hint: null,
        created_at: "2026-06-16T08:00:00.000Z",
        effective_at: "2026-06-15T19:00:00.000Z",
      },
    ],
  });

  assert(block.includes("=== SEMAINE COURANTE PLAN / ACTIONS (SOURCE DB) ==="));
  assert(block.includes("Semaine locale: 2026-06-15 -> 2026-06-21"));
  assert(block.includes("Session focus courte"));
  assert(block.includes("jours_planifies=vendredi"));
  assert(!block.includes("jours_conseilles="));
  assert(block.includes("validation_semaine: status=confirmed"));
  assert(block.includes("confirmed_at=2026-06-16T05:00:00.000Z"));
  assert(block.includes("vendredi: status=planned"));
  assert(!block.includes("original_day=dimanche"));
  assert(!block.includes("default_day=dimanche"));
  assert(block.includes("entry_kind=progress"));
  assert(block.includes("value_text=Session faite hier"));
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

Deno.test("dashboard capability addons: describe V2 surfaces instead of old V1 sections", () => {
  const lite = formatDashboardCapabilitiesLiteAddon();
  const full = formatDashboardCapabilitiesAddon({
    intents: ["plan_item_discussion"],
  });

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

Deno.test("buildContextString: current week plan context is injected before indicators", () => {
  const ctx = buildContextString({
    currentWeekPlanContext:
      "=== SEMAINE COURANTE PLAN / ACTIONS (SOURCE DB) ===\nWEEK\n",
    planItemIndicators: "=== INDICATEURS PLAN ITEMS (V2) ===\nINDICATORS\n",
  });

  const weekIndex = ctx.indexOf("WEEK");
  const indicatorsIndex = ctx.indexOf("INDICATORS");
  assert(weekIndex >= 0);
  assert(indicatorsIndex >= 0);
  assert(weekIndex < indicatorsIndex);
});

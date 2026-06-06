import { buildActivePlanSnapshotAddon } from "./plan_targeting_support.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(actual: string | null, expected: string): void {
  assert(actual?.includes(expected), `expected addon to include ${expected}`);
}

function assertNotIncludes(actual: string | null, forbidden: string): void {
  assert(
    !actual?.includes(forbidden),
    `expected addon not to include ${forbidden}`,
  );
}

function planItem(
  patch: Partial<V2PlanItemSnapshotItem> = {},
): V2PlanItemSnapshotItem {
  return {
    id: "item-1",
    title: "Marche du matin",
    description: null,
    dimension: "habits",
    item_type: "habit",
    status: "active",
    cadence_label: "quotidien",
    target_reps: 7,
    current_reps: 0,
    scheduled_days: null,
    time_of_day: null,
    phase_id: null,
    phase_order: null,
    generated_temp_id: null,
    source_kind: "plan_generated",
    item_nature: "recurring_habit",
    available_this_week: false,
    availability_status: "assigned_no_calendar",
    week_scope: null,
    streak_current: 0,
    last_entry_at: null,
    active_load_score: 1,
    payload: null,
    ...patch,
  };
}

Deno.test("buildActivePlanSnapshotAddon exposes a short active plan snapshot on unrelated turns", () => {
  const addon = buildActivePlanSnapshotAddon({
    planItemSnapshot: [planItem()],
    routeDecision: null,
    userMessage: "J'ai eu une journee bizarre",
  });

  assertIncludes(addon, "SNAPSHOT COURT PLAN / ACTIONS ACTIVES");
  assertIncludes(addon, "Marche du matin");
  assertNotIncludes(addon, "CONTEXTE OPERATIONNEL PLAN ACTIF");
});

Deno.test("buildActivePlanSnapshotAddon expands plan context when user mentions actions plural", () => {
  const addon = buildActivePlanSnapshotAddon({
    planItemSnapshot: [
      planItem({
        id: "item-2",
        title: "Envoyer le dossier",
        dimension: "missions",
        item_type: "task",
        status: "pending",
        cadence_label: null,
        target_reps: null,
        item_nature: "one_shot_mission",
        available_this_week: true,
        availability_status: "available_this_week",
        week_scope: {
          level_order: 1,
          level_title: "Niveau 1",
          week_order: 1,
          week_title: "Semaine 1",
          week_status: "current",
          week_start: null,
          week_end: null,
          weekly_reps: 1,
          weekly_cadence_label: "1 fois cette semaine",
          weekly_description_override: null,
          mission_days: [],
        },
      }),
    ],
    routeDecision: null,
    userMessage: "Quelles sont mes actions ?",
  });

  assertIncludes(addon, "SNAPSHOT COURT PLAN / ACTIONS ACTIVES");
  assertIncludes(addon, "CONTEXTE OPERATIONNEL PLAN ACTIF");
  assertIncludes(addon, "Cette semaine uniquement: Envoyer le dossier");
});

Deno.test("buildActivePlanSnapshotAddon expands plan context when route handler targets plan", () => {
  const addon = buildActivePlanSnapshotAddon({
    planItemSnapshot: [planItem({ available_this_week: true })],
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "adjust_plan_item",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "central_arbitrator_tool_skill",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    userMessage: "Tu peux changer ca ?",
  });

  assertIncludes(addon, "CONTEXTE OPERATIONNEL PLAN ACTIF");
});

Deno.test("buildActivePlanSnapshotAddon does not expose operation bridge items as active plan", () => {
  const addon = buildActivePlanSnapshotAddon({
    planItemSnapshot: [
      planItem({
        source_kind: "operation_bridge",
      }),
    ],
    routeDecision: null,
    userMessage: "mon plan",
  });

  assert(addon === null, "expected operation bridge item to be filtered out");
});

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";
import type {
  HabitState,
  PlanContentItem,
  PlanContentV2,
  PlanContentV3,
  UserPlanItemRow,
} from "./v2-types.ts";

const SCHEDULED_DAY_ALIASES: Record<string, string> = {
  mon: "mon",
  monday: "mon",
  lundi: "mon",
  tue: "tue",
  tuesday: "tue",
  mardi: "tue",
  wed: "wed",
  wednesday: "wed",
  mercredi: "wed",
  thu: "thu",
  thursday: "thu",
  jeudi: "thu",
  fri: "fri",
  friday: "fri",
  vendredi: "fri",
  sat: "sat",
  saturday: "sat",
  samedi: "sat",
  sun: "sun",
  sunday: "sun",
  dimanche: "sun",
};

type ActivationCondition = Record<string, unknown> | null;

export type PreparePlanDistributionParams = {
  userId: string;
  planId: string;
  plan: PlanContentV2;
  now?: string;
  idFactory?: () => string;
};

export type PreparedPlanDistribution = {
  items: UserPlanItemRow[];
  tempIdMap: Record<string, string>;
};

export type DistributePlanItemsParams = PreparePlanDistributionParams & {
  supabase: SupabaseClient;
  reason?: string | null;
};

export type PreparePlanDistributionV3Params = {
  userId: string;
  planId: string;
  content: PlanContentV3;
  now?: string;
  idFactory?: () => string;
};

export type DistributePlanItemsV3Params = PreparePlanDistributionV3Params & {
  supabase: SupabaseClient;
  reason?: string | null;
};

export type DistributePlanItemsResult = PreparedPlanDistribution & {
  eventLogged: boolean;
  warnings: string[];
};

export class PlanDistributionError extends Error {
  stage: "prepare" | "load_existing" | "insert_items";

  constructor(
    stage: PlanDistributionError["stage"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PlanDistributionError";
    this.stage = stage;
  }
}

export function preparePlanDistribution(
  params: PreparePlanDistributionParams,
): PreparedPlanDistribution {
  const { userId, planId, plan } = params;
  const now = params.now ?? new Date().toISOString();
  const idFactory = params.idFactory ?? (() => crypto.randomUUID());

  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(planId, "planId");
  assertNonEmptyString(plan.cycle_id, "plan.cycle_id");
  assertNonEmptyString(plan.transformation_id, "plan.transformation_id");

  const flatItems = flattenPlanItems(plan);
  const tempIdMap = buildTempIdMap(flatItems, idFactory);

  const items = flatItems.map((item) =>
    buildUserPlanItemRow({
      userId,
      planId,
      cycleId: plan.cycle_id,
      transformationId: plan.transformation_id,
      planItem: item,
      itemId: tempIdMap[item.temp_id],
      tempIdMap,
      now,
    })
  );

  return { items, tempIdMap };
}

export async function distributePlanItems(
  params: DistributePlanItemsParams,
): Promise<DistributePlanItemsResult> {
  let prepared: PreparedPlanDistribution;

  try {
    prepared = preparePlanDistribution(params);
  } catch (error) {
    throw new PlanDistributionError(
      "prepare",
      `Failed to prepare plan distribution for plan ${params.planId}`,
      { cause: error },
    );
  }

  const warnings: string[] = [];

  const existingItems = await loadExistingPlanItems(
    params.supabase,
    params.planId,
  )
    .catch((error) => {
      throw new PlanDistributionError(
        "load_existing",
        `Failed to load existing plan items for plan ${params.planId}`,
        { cause: error },
      );
    });

  let items = prepared.items;
  let tempIdMap = prepared.tempIdMap;
  let eventLogged = false;

  if (existingItems.length > 0) {
    items = existingItems;
    tempIdMap = extractTempIdMap(existingItems);
    warnings.push(
      `Plan ${params.planId} already had ${existingItems.length} distributed items; insert skipped.`,
    );
  } else {
    const { error } = await params.supabase
      .from("user_plan_items")
      .insert(prepared.items);

    if (error) {
      throw new PlanDistributionError(
        "insert_items",
        `Failed to insert distributed items for plan ${params.planId}`,
        { cause: error },
      );
    }
  }

  if (existingItems.length === 0) {
    try {
      await logV2Event(params.supabase, V2_EVENT_TYPES.PLAN_GENERATED, {
        user_id: params.userId,
        cycle_id: params.plan.cycle_id,
        transformation_id: params.plan.transformation_id,
        plan_id: params.planId,
        reason: params.reason ?? "plan_distribution_completed",
        metadata: {
          item_count: items.length,
        },
      });
      eventLogged = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to log plan_generated_v2 event: ${message}`);
    }
  }

  return {
    items,
    tempIdMap,
    eventLogged,
    warnings,
  };
}

export function preparePlanDistributionV3(
  params: PreparePlanDistributionV3Params,
): PreparedPlanDistribution {
  const { userId, planId, content } = params;
  const now = params.now ?? new Date().toISOString();
  const idFactory = params.idFactory ?? (() => crypto.randomUUID());

  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(planId, "planId");
  assertNonEmptyString(content.cycle_id, "content.cycle_id");
  assertNonEmptyString(content.transformation_id, "content.transformation_id");

  const allItems = content.phases.flatMap((phase) => phase.items);
  const tempIdMap = buildTempIdMap(allItems, idFactory);

  const items = content.phases.flatMap((phase) => {
    assertNonEmptyString(phase.phase_id, "phase.phase_id");
    if (!Number.isInteger(phase.phase_order) || phase.phase_order < 1) {
      throw new Error(`Invalid phase_order for phase ${phase.phase_id}`);
    }

    const phaseTempIdMap = Object.fromEntries(
      phase.items.map((item) => [item.temp_id, tempIdMap[item.temp_id]]),
    );
    const phaseStartsActive = phase.phase_order === 1;

    return phase.items.map((item) =>
      buildUserPlanItemRow({
        userId,
        planId,
        cycleId: content.cycle_id,
        transformationId: content.transformation_id,
        planItem: item,
        itemId: tempIdMap[item.temp_id],
        tempIdMap: phaseTempIdMap,
        now,
        phaseId: phase.phase_id,
        phaseOrder: phase.phase_order,
        forcePending: !phaseStartsActive,
      })
    );
  });

  return { items, tempIdMap };
}

export async function distributePlanItemsV3(
  params: DistributePlanItemsV3Params,
): Promise<DistributePlanItemsResult> {
  let prepared: PreparedPlanDistribution;

  try {
    prepared = preparePlanDistributionV3(params);
  } catch (error) {
    throw new PlanDistributionError(
      "prepare",
      `Failed to prepare V3 plan distribution for plan ${params.planId}`,
      { cause: error },
    );
  }

  const warnings: string[] = [];
  const existingItems = await loadExistingPlanItems(
    params.supabase,
    params.planId,
  )
    .catch((error) => {
      throw new PlanDistributionError(
        "load_existing",
        `Failed to load existing V3 plan items for plan ${params.planId}`,
        { cause: error },
      );
    });

  let items = prepared.items;
  let tempIdMap = prepared.tempIdMap;
  let eventLogged = false;

  if (existingItems.length > 0) {
    items = existingItems;
    tempIdMap = extractTempIdMap(existingItems);
    warnings.push(
      `Plan ${params.planId} already had ${existingItems.length} distributed items; insert skipped.`,
    );
  } else {
    const { error } = await params.supabase
      .from("user_plan_items")
      .insert(prepared.items);

    if (error) {
      throw new PlanDistributionError(
        "insert_items",
        `Failed to insert distributed V3 items for plan ${params.planId}`,
        { cause: error },
      );
    }
  }

  if (existingItems.length === 0) {
    try {
      await logV2Event(params.supabase, V2_EVENT_TYPES.PLAN_GENERATED, {
        user_id: params.userId,
        cycle_id: params.content.cycle_id,
        transformation_id: params.content.transformation_id,
        plan_id: params.planId,
        reason: params.reason ?? "plan_distribution_v3_completed",
        metadata: {
          item_count: items.length,
          phase_count: params.content.phases.length,
        },
      });
      eventLogged = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to log plan_generated_v2 event: ${message}`);
    }
  }

  return {
    items,
    tempIdMap,
    eventLogged,
    warnings,
  };
}

function flattenPlanItems(plan: PlanContentV2): PlanContentItem[] {
  return plan.dimensions.flatMap((dimension) => dimension.items);
}

function buildTempIdMap(
  items: PlanContentItem[],
  idFactory: () => string,
): Record<string, string> {
  const tempIdMap: Record<string, string> = {};

  for (const item of items) {
    assertNonEmptyString(item.temp_id, "item.temp_id");
    if (tempIdMap[item.temp_id]) {
      throw new Error(`Duplicate temp_id in plan content: ${item.temp_id}`);
    }
    tempIdMap[item.temp_id] = idFactory();
  }

  return tempIdMap;
}

function buildUserPlanItemRow(params: {
  userId: string;
  planId: string;
  cycleId: string;
  transformationId: string;
  planItem: PlanContentItem;
  itemId: string;
  tempIdMap: Record<string, string>;
  now: string;
  phaseId?: string | null;
  phaseOrder?: number | null;
  forcePending?: boolean;
}): UserPlanItemRow {
  const { planItem, tempIdMap } = params;
  const activationCondition = resolveActivationCondition(
    planItem.activation_condition,
    tempIdMap,
  );
  const cardsRequired = planItem.dimension === "missions" || planItem.dimension === "habits";
  const activeAtStart = !params.forcePending &&
    isActiveAtStart(planItem.activation_condition);

  return {
    id: params.itemId,
    user_id: params.userId,
    cycle_id: params.cycleId,
    transformation_id: params.transformationId,
    plan_id: params.planId,
    dimension: planItem.dimension,
    kind: planItem.kind,
    status: activeAtStart ? "active" : "pending",
    title: planItem.title,
    description: planItem.description ?? null,
    tracking_type: planItem.tracking_type,
    activation_order: planItem.activation_order ?? null,
    activation_condition: activationCondition,
    current_habit_state: getInitialHabitState(planItem, activeAtStart),
    support_mode: planItem.support_mode ?? null,
    support_function: planItem.support_function ?? null,
    target_reps: planItem.target_reps ?? null,
    current_reps: shouldInitializeReps(planItem) ? 0 : null,
    cadence_label: planItem.cadence_label ?? null,
    scheduled_days: normalizeScheduledDays(planItem.scheduled_days),
    time_of_day: normalizeTimeOfDay(planItem.time_of_day),
    start_after_item_id: getStartAfterItemId(activationCondition),
    phase_id: params.phaseId ?? null,
    phase_order: params.phaseOrder ?? null,
    defense_card_id: null,
    attack_card_id: null,
    cards_status: cardsRequired ? "not_started" : "not_required",
    cards_generated_at: null,
    payload: withGenerationMetadata(planItem),
    created_at: params.now,
    updated_at: params.now,
    activated_at: activeAtStart ? params.now : null,
    completed_at: null,
  };
}

async function loadExistingPlanItems(
  supabase: SupabaseClient,
  planId: string,
): Promise<UserPlanItemRow[]> {
  const { data, error } = await supabase
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as UserPlanItemRow[]);
}

function isActiveAtStart(cond: ActivationCondition): boolean {
  if (!cond) return true;
  return typeof cond === "object" && cond.type === "immediate";
}

function resolveActivationCondition(
  raw: ActivationCondition,
  tempIdMap: Record<string, string>,
): ActivationCondition {
  if (!raw) return null;

  const resolved = { ...raw };
  const dependsOn = raw.depends_on;
  if (dependsOn == null) return resolved;

  const tempIds = normalizeDependsOn(dependsOn);
  resolved.depends_on = tempIds.map((tempId) => {
    const resolvedId = tempIdMap[tempId];
    if (!resolvedId) {
      throw new Error(`Unknown activation dependency temp_id: ${tempId}`);
    }
    return resolvedId;
  });

  return resolved;
}

function normalizeDependsOn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  ) {
    return value as string[];
  }
  throw new Error(
    "activation_condition.depends_on must be a string or string[]",
  );
}

function normalizeScheduledDays(days: string[] | null): string[] | null {
  if (!days) return null;

  return days.map((day) => {
    const normalized = SCHEDULED_DAY_ALIASES[day.trim().toLowerCase()];
    if (!normalized) {
      throw new Error(`Unsupported scheduled_days value: ${day}`);
    }
    return normalized;
  });
}

function normalizeTimeOfDay(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "any_time") return "anytime";
  return normalized;
}

function getInitialHabitState(
  item: PlanContentItem,
  activeAtStart: boolean,
): HabitState | null {
  if (item.dimension !== "habits") return null;
  return activeAtStart ? "active_building" : null;
}

function shouldInitializeReps(item: PlanContentItem): boolean {
  return item.target_reps != null || item.dimension === "habits";
}

function getStartAfterItemId(
  activationCondition: ActivationCondition,
): string | null {
  if (!activationCondition) return null;

  const type = activationCondition.type;
  if (
    type !== "after_item_completion" &&
    type !== "after_milestone" &&
    type !== "after_habit_traction"
  ) {
    return null;
  }

  const dependsOn = activationCondition.depends_on;
  if (!Array.isArray(dependsOn) || dependsOn.length !== 1) return null;
  return typeof dependsOn[0] === "string" ? dependsOn[0] : null;
}

function withGenerationMetadata(
  item: PlanContentItem,
): Record<string, unknown> {
  const payload = isRecord(item.payload) ? { ...item.payload } : {};
  const existingGeneration = isRecord(payload._generation)
    ? { ...payload._generation }
    : {};

  return {
    ...payload,
    _generation: {
      ...existingGeneration,
      temp_id: item.temp_id,
    },
  };
}

function extractTempIdMap(items: UserPlanItemRow[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const item of items) {
    const generation = isRecord(item.payload?._generation)
      ? item.payload._generation
      : null;
    const tempId = generation && typeof generation.temp_id === "string"
      ? generation.temp_id
      : null;
    if (tempId) map[tempId] = item.id;
  }

  return map;
}

function cleanNullableText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing or invalid ${fieldName}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

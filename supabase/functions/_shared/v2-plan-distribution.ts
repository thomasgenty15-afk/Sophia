import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";
import { normalizeTimeOfDay } from "./time_of_day.ts";
import {
  firstAssignedWeekOrderByTempId,
} from "./v2-week-activation.ts";
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
  activePhaseOrder?: number;
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
  const activePhaseOrder = params.activePhaseOrder ?? 1;

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

    const phaseStartsActive = phase.phase_order === activePhaseOrder;
    // Déblocage par semaine: la première semaine d'assignation de chaque item
    // (weeks[].item_assignments) décide de son statut initial dans la phase
    // active. Sans assignation hebdo, l'item démarre actif (fail-open).
    const firstWeekByTempId = phaseStartsActive
      ? firstAssignedWeekOrderByTempId(content, phase.phase_id)
      : new Map<string, number>();

    return phase.items.map((item) =>
      buildUserPlanItemRow({
        userId,
        planId,
        cycleId: content.cycle_id,
        transformationId: content.transformation_id,
        planItem: item,
        itemId: tempIdMap[item.temp_id],
        now,
        phaseId: phase.phase_id,
        phaseOrder: phase.phase_order,
        forcePending: !phaseStartsActive,
        firstAssignedWeekOrder: firstWeekByTempId.get(item.temp_id) ?? null,
      })
    );
  });

  return { items, tempIdMap };
}

export async function distributeMissingPlanPhaseItemsV3(
  params: DistributePlanItemsV3Params & {
    phaseId: string;
    phaseOrder: number;
  },
): Promise<DistributePlanItemsResult> {
  let prepared: PreparedPlanDistribution;

  try {
    prepared = preparePlanDistributionV3({
      ...params,
      activePhaseOrder: params.phaseOrder,
    });
  } catch (error) {
    throw new PlanDistributionError(
      "prepare",
      `Failed to prepare V3 phase distribution for plan ${params.planId}`,
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
        `Failed to load existing V3 phase items for plan ${params.planId}`,
        { cause: error },
      );
    });

  const existingPhaseItems = existingItems.filter((item) =>
    item.phase_id === params.phaseId
  );
  if (existingPhaseItems.length > 0) {
    warnings.push(
      `Plan ${params.planId} already had ${existingPhaseItems.length} items for phase ${params.phaseId}; insert skipped.`,
    );
    return {
      items: existingPhaseItems,
      tempIdMap: extractTempIdMap(existingItems),
      eventLogged: false,
      warnings,
    };
  }

  const phaseItems = prepared.items.filter((item) =>
    item.phase_id === params.phaseId
  );
  if (phaseItems.length === 0) {
    throw new PlanDistributionError(
      "prepare",
      `No prepared V3 items found for phase ${params.phaseId} in plan ${params.planId}`,
    );
  }

  const { error } = await params.supabase
    .from("user_plan_items")
    .insert(phaseItems);

  if (error) {
    throw new PlanDistributionError(
      "insert_items",
      `Failed to insert distributed V3 phase items for plan ${params.planId}`,
      { cause: error },
    );
  }

  return {
    items: phaseItems,
    tempIdMap: extractTempIdMap([...existingItems, ...phaseItems]),
    eventLogged: false,
    warnings,
  };
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
  now: string;
  phaseId?: string | null;
  phaseOrder?: number | null;
  forcePending?: boolean;
  firstAssignedWeekOrder?: number | null;
}): UserPlanItemRow {
  const { planItem } = params;
  const cardsRequired = planItem.dimension === "missions" || planItem.dimension === "habits";
  // Déblocage par semaine uniquement: les activation_condition émises par le
  // générateur sont ignorées et ne sont plus persistées. Un item de la phase
  // active démarre actif sauf si sa première semaine assignée est ultérieure
  // à la semaine 1 (il sera activé quand sa semaine commencera).
  const firstWeek = params.firstAssignedWeekOrder ?? null;
  const activeAtStart = !params.forcePending &&
    (firstWeek == null || firstWeek <= 1);

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
    activation_condition: null,
    current_habit_state: getInitialHabitState(planItem, activeAtStart),
    support_mode: planItem.support_mode ?? null,
    support_function: planItem.support_function ?? null,
    target_reps: planItem.target_reps ?? null,
    current_reps: shouldInitializeReps(planItem) ? 0 : null,
    cadence_label: planItem.cadence_label ?? null,
    scheduled_days: normalizeScheduledDays(planItem.scheduled_days),
    time_of_day: normalizeTimeOfDay(planItem.time_of_day),
    start_after_item_id: null,
    phase_id: params.phaseId ?? null,
    phase_order: params.phaseOrder ?? null,
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

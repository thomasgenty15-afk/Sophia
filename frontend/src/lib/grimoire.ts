import { supabase } from "./supabase";
import type {
  Action,
  ActionHistoryEntry,
  CompletedTransformation,
} from "../types/grimoire";
import type {
  PlanContentV2,
  PlanDimension,
  PlanItemKind,
  TrackingType,
  UserPlanItemEntryRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../types/v2";

type ArchivedPlanRow = Pick<
  UserPlanV2Row,
  | "id"
  | "cycle_id"
  | "transformation_id"
  | "status"
  | "title"
  | "content"
  | "updated_at"
  | "completed_at"
  | "archived_at"
>;

type ArchivedTransformationRow = Pick<
  UserTransformationRow,
  | "id"
  | "cycle_id"
  | "status"
  | "title"
  | "user_summary"
  | "internal_summary"
  | "success_definition"
  | "main_constraint"
  | "completed_at"
  | "updated_at"
>;

function toPlanContent(content: Record<string, unknown> | null): PlanContentV2 | null {
  if (!content || content.version !== 2) return null;
  return content as PlanContentV2;
}

function formatDate(dateValue: string | null | undefined): string {
  const fallback = new Date().toISOString();
  return new Date(dateValue || fallback).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function inferActionType(kind: PlanItemKind): Action["type"] {
  if (kind === "habit") return "habitude";
  if (kind === "framework") return "framework";
  return "mission";
}

function inferTrackingType(action: Action): TrackingType {
  if (action.trackingType) return action.trackingType;
  if (action.type === "habitude") return "boolean";
  if (action.type === "framework") return "text";
  return "count";
}

function inferDimension(action: Action): PlanDimension {
  if (action.dimension) return action.dimension;
  if (action.type === "habitude") return "habits";
  if (action.type === "framework") return "support";
  return "missions";
}

function inferKind(action: Action): PlanItemKind {
  if (action.kind) return action.kind;
  if (action.type === "habitude") return "habit";
  if (action.type === "framework") return "framework";
  return "task";
}

function defaultSupportMode(action: Action) {
  if (inferDimension(action) !== "support") return null;
  return action.supportMode ?? "recommended_now";
}

function defaultSupportFunction(action: Action) {
  if (inferDimension(action) !== "support") return null;
  return action.supportFunction ?? "practice";
}

function mapHistory(entries: UserPlanItemEntryRow[]): ActionHistoryEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.created_at,
    effectiveAt: entry.effective_at,
    entryKind: entry.entry_kind,
    outcome: entry.outcome,
    valueNumeric: entry.value_numeric,
    valueText: entry.value_text,
    difficultyLevel: entry.difficulty_level,
    blockerHint: entry.blocker_hint,
    metadata: entry.metadata,
  }));
}

function mapAction(
  item: UserPlanItemRow,
  entriesByItemId: Map<string, UserPlanItemEntryRow[]>,
): Action {
  const history = mapHistory(entriesByItemId.get(item.id) ?? []);
  const textValue = item.payload && typeof item.payload === "object"
    ? item.payload
    : {};
  const mantra = typeof textValue.rationale === "string"
    ? textValue.rationale
    : typeof textValue.identity_shift === "string"
    ? textValue.identity_shift
    : undefined;
  const isHypnosis = /hypno/i.test(item.title || "") ||
    /hypno/i.test(item.description || "");

  return {
    id: item.id,
    type: inferActionType(item.kind),
    title: item.title || "Action sans titre",
    description: item.description || "Action du plan V2",
    isCompleted: item.status === "completed" || item.status === "in_maintenance",
    status: item.status,
    dimension: item.dimension,
    kind: item.kind,
    trackingType: item.tracking_type,
    currentReps: item.current_reps,
    mantra,
    isHypnosis,
    media_duration: typeof textValue.media_duration === "string"
      ? textValue.media_duration
      : undefined,
    targetReps: item.target_reps,
    cadenceLabel: item.cadence_label,
    scheduledDays: item.scheduled_days,
    timeOfDay: item.time_of_day,
    supportMode: item.support_mode,
    supportFunction: item.support_function,
    payload: item.payload,
    history,
  };
}

function buildStrategy(
  plan: ArchivedPlanRow,
  transformation: ArchivedTransformationRow | undefined,
): CompletedTransformation["strategy"] {
  const content = toPlanContent(plan.content);
  return {
    identity:
      content?.strategy.identity_shift ||
      transformation?.title ||
      plan.title ||
      "Transformation V2",
    bigWhy:
      transformation?.success_definition ||
      content?.strategy.success_definition ||
      transformation?.user_summary ||
      transformation?.internal_summary ||
      "Pourquoi non defini",
    goldenRules:
      content?.strategy.core_principle ||
      content?.timeline_summary ||
      "Repere non defini",
  };
}

export async function fetchCompletedTransformations(): Promise<CompletedTransformation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: plans, error: plansError } = await supabase
    .from("user_plans_v2")
    .select("id, cycle_id, transformation_id, status, title, content, updated_at, completed_at, archived_at")
    .eq("user_id", user.id)
    .in("status", ["completed", "archived"])
    .order("updated_at", { ascending: false });

  if (plansError) {
    console.error("Error fetching completed V2 plans:", plansError);
    return [];
  }

  if (!plans || plans.length === 0) return [];

  const archivedPlans = plans as ArchivedPlanRow[];
  const planIds = archivedPlans.map((plan) => plan.id);
  const transformationIds = archivedPlans.map((plan) => plan.transformation_id);

  const [
    transformationsResult,
    planItemsResult,
    entriesResult,
  ] = await Promise.all([
    supabase
      .from("user_transformations")
      .select("id, cycle_id, status, title, user_summary, internal_summary, success_definition, main_constraint, completed_at, updated_at")
      .in("id", transformationIds),
    supabase
      .from("user_plan_items")
      .select("*")
      .in("plan_id", planIds)
      .order("dimension", { ascending: true })
      .order("activation_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("user_plan_item_entries")
      .select("*")
      .in("plan_id", planIds)
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (transformationsResult.error) {
    console.error("Error fetching V2 transformations:", transformationsResult.error);
    return [];
  }
  if (planItemsResult.error) {
    console.error("Error fetching V2 plan items:", planItemsResult.error);
    return [];
  }
  if (entriesResult.error) {
    console.error("Error fetching V2 plan item entries:", entriesResult.error);
    return [];
  }

  const transformationsById = new Map(
    ((transformationsResult.data as ArchivedTransformationRow[] | null) ?? []).map(
      (item) => [item.id, item],
    ),
  );

  const entriesByItemId = new Map<string, UserPlanItemEntryRow[]>();
  for (const entry of ((entriesResult.data as UserPlanItemEntryRow[] | null) ?? [])) {
    const group = entriesByItemId.get(entry.plan_item_id) ?? [];
    group.push(entry);
    entriesByItemId.set(entry.plan_item_id, group);
  }

  const itemsByPlanId = new Map<string, UserPlanItemRow[]>();
  for (const item of ((planItemsResult.data as UserPlanItemRow[] | null) ?? [])) {
    const group = itemsByPlanId.get(item.plan_id) ?? [];
    group.push(item);
    itemsByPlanId.set(item.plan_id, group);
  }

  return archivedPlans.map((plan) => {
    const transformation = transformationsById.get(plan.transformation_id);
    const content = toPlanContent(plan.content);
    const items = (itemsByPlanId.get(plan.id) ?? []).map((item) =>
      mapAction(item, entriesByItemId)
    );
    const formattedDate = formatDate(
      plan.completed_at ||
      plan.archived_at ||
      transformation?.completed_at ||
      plan.updated_at,
    );

    return {
      id: plan.id,
      title:
        plan.title ||
        transformation?.title ||
        content?.title ||
        `Transformation du ${formattedDate}`,
      theme: "Transformation",
      completedDate: formattedDate,
      strategy: buildStrategy(plan, transformation),
      contextProblem:
        transformation?.main_constraint ||
        content?.strategy.main_constraint ||
        undefined,
      actions: items,
      status: plan.status,
    };
  });
}

export async function reactivateAction(action: Action): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Utilisateur non connecte");

  const { data: activePlan, error: planError } = await supabase
    .from("user_plans_v2")
    .select("id, cycle_id, transformation_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) throw planError;
  if (!activePlan) {
    throw new Error("Tu dois avoir un plan V2 actif pour y reintroduire cet outil.");
  }

  const { data: existingItem, error: existingItemError } = await supabase
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", activePlan.id)
    .eq("title", action.title)
    .limit(1)
    .maybeSingle();

  if (existingItemError) throw existingItemError;

  const now = new Date().toISOString();

  if (existingItem) {
    const nextStatus = existingItem.status === "in_maintenance"
      ? "in_maintenance"
      : "active";
    const { error: updateError } = await supabase
      .from("user_plan_items")
      .update({
        status: nextStatus,
        activated_at: existingItem.activated_at ?? now,
        completed_at: nextStatus === "active" ? null : existingItem.completed_at,
        current_habit_state: existingItem.dimension === "habits"
          ? (nextStatus === "in_maintenance" ? "in_maintenance" : "active_building")
          : existingItem.current_habit_state,
        updated_at: now,
      })
      .eq("id", existingItem.id);

    if (updateError) throw updateError;
    return "Cet outil est deja present dans ton plan actif. Je l'ai remis en circulation.";
  }

  const dimension = inferDimension(action);
  const kind = inferKind(action);

  const { data: lastOrderedItem } = await supabase
    .from("user_plan_items")
    .select("activation_order")
    .eq("plan_id", activePlan.id)
    .eq("dimension", dimension)
    .order("activation_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = typeof lastOrderedItem?.activation_order === "number"
    ? lastOrderedItem.activation_order + 1
    : 1;

  const { error: insertError } = await supabase
    .from("user_plan_items")
    .insert({
      user_id: user.id,
      cycle_id: activePlan.cycle_id,
      transformation_id: activePlan.transformation_id,
      plan_id: activePlan.id,
      dimension,
      kind,
      status: "active",
      title: action.title,
      description: action.description || null,
      tracking_type: inferTrackingType(action),
      activation_order: nextOrder,
      activation_condition: null,
      current_habit_state: dimension === "habits" ? "active_building" : null,
      support_mode: defaultSupportMode(action),
      support_function: defaultSupportFunction(action),
      target_reps: action.targetReps ?? null,
      current_reps: 0,
      cadence_label: action.cadenceLabel ?? null,
      scheduled_days: action.scheduledDays ?? null,
      time_of_day: action.timeOfDay ?? null,
      start_after_item_id: null,
      payload: {
        ...(action.payload ?? {}),
        reactivated_from_grimoire: true,
        source_plan_item_id: action.id,
      },
      activated_at: now,
    });

  if (insertError) throw insertError;

  return "Action ajoutee a ton plan actif.";
}

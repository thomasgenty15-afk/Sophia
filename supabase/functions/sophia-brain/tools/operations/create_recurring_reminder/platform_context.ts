import { buildActionFamilyKey } from "../../../../_shared/memory/action_family.ts";

export type RecurringReminderRuntimeContext = {
  cycle?: {
    id?: string | null;
    status?: string | null;
    active_transformation_id?: string | null;
  } | null;
  transformation?: {
    id?: string | null;
    title?: string | null;
    user_summary?: string | null;
    success_definition?: string | null;
    main_constraint?: string | null;
  } | null;
  plan?: {
    id?: string | null;
    title?: string | null;
    status?: string | null;
  } | null;
} | null;

export type RecurringReminderPlanItemSnapshotItem = {
  id: string;
  title: string;
  description?: string | null;
  dimension?: string | null;
  item_type?: string | null;
  status?: string | null;
  item_nature?: string | null;
  cadence_label?: string | null;
  target_reps?: number | null;
  current_reps?: number | null;
  scheduled_days?: string[] | null;
  time_of_day?: string | null;
  available_this_week?: boolean | null;
  availability_status?: string | null;
  week_scope?: unknown;
  generated_temp_id?: string | null;
};

export function recurringReminderPlanItemContext(args: {
  planItemSnapshot?: RecurringReminderPlanItemSnapshotItem[] | null;
  itemId?: string | null;
}): Record<string, unknown> | null {
  const relatedId = String(args.itemId ?? "").trim();
  if (!relatedId) return null;
  const item = (args.planItemSnapshot ?? []).find((candidate) =>
    candidate.id === relatedId
  );
  if (!item) return { id: relatedId, status: "not_found_in_snapshot" };
  const isRecurringHabitTarget = item.item_nature === "recurring_habit" ||
    item.item_type === "habit";
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    dimension: item.dimension,
    kind: item.item_type,
    item_nature: item.item_nature ?? null,
    cadence_label: item.cadence_label ?? null,
    target_reps: item.target_reps ?? null,
    current_reps: item.current_reps ?? null,
    scheduled_days: item.scheduled_days ?? null,
    time_of_day: item.time_of_day ?? null,
    week_scope: item.week_scope ?? null,
    generated_temp_id: item.generated_temp_id ?? null,
    action_family_key: isRecurringHabitTarget
      ? buildActionFamilyKey({
        id: item.id,
        title: item.title,
        kind: item.item_type,
        dimension: item.dimension,
        payload: null,
      })
      : null,
  };
}

export function buildRecurringReminderPlatformContext(args: {
  v2Runtime?: RecurringReminderRuntimeContext;
  planItemSnapshot?: RecurringReminderPlanItemSnapshotItem[] | null;
}): Record<string, unknown> {
  const transformation = args.v2Runtime?.transformation ?? null;
  const plan = args.v2Runtime?.plan ?? null;
  const planItems = (args.planItemSnapshot ?? []).slice(0, 20).map((item) => {
    const isRecurringHabitTarget = item.item_nature === "recurring_habit" ||
      item.item_type === "habit";
    return {
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      dimension: item.dimension,
      kind: item.item_type,
      status: item.status,
      item_nature: item.item_nature ?? null,
      cadence_label: item.cadence_label ?? null,
      target_reps: item.target_reps ?? null,
      current_reps: item.current_reps ?? null,
      scheduled_days: item.scheduled_days ?? null,
      time_of_day: item.time_of_day ?? null,
      available_this_week: item.available_this_week ?? null,
      availability_status: item.availability_status ?? null,
      week_scope: item.week_scope ?? null,
      generated_temp_id: item.generated_temp_id ?? null,
      action_family_key: isRecurringHabitTarget
        ? buildActionFamilyKey({
          id: item.id,
          title: item.title,
          kind: item.item_type,
          dimension: item.dimension,
          payload: null,
        })
        : null,
    };
  });
  return {
    active_cycle: args.v2Runtime?.cycle
      ? {
        id: args.v2Runtime.cycle.id,
        status: args.v2Runtime.cycle.status,
        active_transformation_id: args.v2Runtime.cycle.active_transformation_id,
      }
      : null,
    active_transformation: transformation
      ? {
        id: transformation.id,
        title: transformation.title,
        user_summary: transformation.user_summary,
        success_definition: transformation.success_definition,
        main_constraint: transformation.main_constraint,
      }
      : null,
    active_plan: plan
      ? {
        id: plan.id,
        title: plan.title,
        status: plan.status,
      }
      : null,
    active_plans: plan
      ? [{
        cycle_id: args.v2Runtime?.cycle?.id ?? null,
        transformation_id: transformation?.id ?? null,
        transformation_title: transformation?.title ?? null,
        plan_id: plan.id,
        plan_title: plan.title,
        status: plan.status,
        plan_items: planItems,
      }]
      : [],
    plan_items: planItems,
  };
}

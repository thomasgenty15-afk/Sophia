import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RecurringReminderDraftV1 } from "./generator.ts";
import {
  type RecurringReminderPlanItemSnapshotItem,
  type RecurringReminderRuntimeContext,
  recurringReminderPlanItemContext,
} from "./platform_context.ts";

function normalizeReminderText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const DAY_CODES: Record<string, string> = {
  lundi: "mon",
  monday: "mon",
  mon: "mon",
  mardi: "tue",
  tuesday: "tue",
  tue: "tue",
  mercredi: "wed",
  wednesday: "wed",
  wed: "wed",
  jeudi: "thu",
  thursday: "thu",
  thu: "thu",
  vendredi: "fri",
  friday: "fri",
  fri: "fri",
  samedi: "sat",
  saturday: "sat",
  sat: "sat",
  dimanche: "sun",
  sunday: "sun",
  sun: "sun",
};

export function scheduledDaysFromDraft(
  draft: RecurringReminderDraftV1,
): string[] {
  const frequency = draft.draft.frequency;
  if (frequency === "daily") {
    return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  }
  if (frequency === "weekdays") return ["mon", "tue", "wed", "thu", "fri"];
  const mapped = (draft.draft.days ?? [])
    .map((day) => DAY_CODES[normalizeReminderText(day)])
    .filter((day): day is string => Boolean(day));
  const unique = Array.from(new Set(mapped));
  if (unique.length > 0) return unique;
  if (frequency === "weekly" || frequency === "specific_days") {
    return ["mon"];
  }
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
}

function recurringReminderTargetBinding(args: {
  draft: RecurringReminderDraftV1;
  relatedPlanItem: Record<string, unknown> | null;
  resolvedDestination: "current_plan" | "base_de_vie";
}): {
  target_kind: "none" | "transformation" | "plan_item" | "action_family";
  target_plan_item_id: string | null;
  target_action_family_key: string | null;
  target_generated_temp_id: string | null;
  target_binding_policy:
    | "none"
    | "snapshot"
    | "live_action"
    | "live_action_family";
  target_lifecycle_policy:
    | "independent"
    | "while_target_active"
    | "while_family_in_current_plan";
  target_label: string | null;
} {
  const requested = args.draft.draft.target_binding ?? null;
  const relatedId = String(args.relatedPlanItem?.id ?? "").trim() ||
    String(args.draft.draft.related_plan_item_id ?? "").trim();
  const relatedLabel = String(args.relatedPlanItem?.title ?? "").trim() ||
    requested?.target_label || null;
  const actionFamilyKey = String(
    args.relatedPlanItem?.action_family_key ??
      requested?.target_action_family_key ?? "",
  ).trim() || null;
  const generatedTempId = String(
    args.relatedPlanItem?.generated_temp_id ??
      requested?.target_generated_temp_id ?? "",
  ).trim() || null;
  const itemNature = String(args.relatedPlanItem?.item_nature ?? "").trim();
  const isRecurringHabitTarget = itemNature === "recurring_habit" ||
    String(args.relatedPlanItem?.kind ?? "").trim() === "habit";

  if (args.resolvedDestination !== "current_plan") {
    return {
      target_kind: "none",
      target_plan_item_id: null,
      target_action_family_key: null,
      target_generated_temp_id: null,
      target_binding_policy: "none",
      target_lifecycle_policy: "independent",
      target_label: null,
    };
  }

  if (
    (requested?.target_kind === "action_family" && isRecurringHabitTarget) ||
    (relatedId && isRecurringHabitTarget && actionFamilyKey)
  ) {
    return {
      target_kind: "action_family",
      target_plan_item_id: relatedId || requested?.target_plan_item_id || null,
      target_action_family_key: actionFamilyKey,
      target_generated_temp_id: generatedTempId,
      target_binding_policy: "live_action_family",
      target_lifecycle_policy: "while_family_in_current_plan",
      target_label: relatedLabel,
    };
  }

  if (requested?.target_kind === "plan_item" || relatedId) {
    return {
      target_kind: "plan_item",
      target_plan_item_id: relatedId || requested?.target_plan_item_id || null,
      target_action_family_key: actionFamilyKey,
      target_generated_temp_id: generatedTempId,
      target_binding_policy: "live_action",
      target_lifecycle_policy: "while_target_active",
      target_label: relatedLabel,
    };
  }

  return {
    target_kind: "transformation",
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    target_binding_policy: "snapshot",
    target_lifecycle_policy: "independent",
    target_label: requested?.target_label ?? null,
  };
}

async function classifyRecurringReminderBestEffort(args: {
  userId: string;
  reminderId: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const serviceRoleKey = String(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ).trim();
    if (!url || !serviceRoleKey) {
      return { ok: false, error: "classification_env_missing" };
    }
    const response = await fetch(
      `${url.replace(/\/$/, "")}/functions/v1/classify-recurring-reminder`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          reminder_id: args.reminderId,
          user_id: args.userId,
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn(
        "[CreateRecurringReminder] classification failed",
        data,
      );
      return {
        ok: false,
        status: response.status,
        error: data && typeof data === "object"
          ? data
          : `http_${response.status}`,
      };
    }
    return data && typeof data === "object"
      ? data as Record<string, unknown>
      : { ok: true };
  } catch (error) {
    console.warn("[CreateRecurringReminder] classification failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function insertRecurringReminderFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: RecurringReminderDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  v2Runtime?: RecurringReminderRuntimeContext;
  planItemSnapshot?: RecurringReminderPlanItemSnapshotItem[] | null;
}) {
  const scheduledDays = scheduledDaysFromDraft(args.draft);
  const activeCycle = args.v2Runtime?.cycle ?? null;
  const activeTransformation = args.v2Runtime?.transformation ?? null;
  const activePlan = args.v2Runtime?.plan ?? null;
  const relatedPlanItem = recurringReminderPlanItemContext({
    itemId: args.draft.draft.related_plan_item_id,
    planItemSnapshot: args.planItemSnapshot,
  });
  const hasActivePlanContext = Boolean(
    activeCycle?.id && activeTransformation?.id && activePlan?.id,
  );
  const wantsCurrentPlan = args.draft.draft.destination === "current_plan";
  const resolvedDestination = wantsCurrentPlan && hasActivePlanContext
    ? "current_plan"
    : "base_de_vie";
  const targetBinding = recurringReminderTargetBinding({
    draft: args.draft,
    relatedPlanItem,
    resolvedDestination,
  });
  const nowIso = new Date().toISOString();
  const insertResult = await args.supabase
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      cycle_id: activeCycle?.id ?? null,
      transformation_id: resolvedDestination === "current_plan"
        ? activeTransformation?.id ?? null
        : null,
      message_instruction: args.draft.draft.message,
      rationale: resolvedDestination === "current_plan" && activeTransformation
        ? `Rappel récurrent créé depuis la conversation Sophia pour soutenir ${
          activeTransformation.title ?? "la transformation en cours"
        } : ${args.draft.draft.title}`
        : `Rappel récurrent créé depuis la conversation web Sophia : ${args.draft.draft.title}`,
      local_time_hhmm: args.draft.draft.time,
      scheduled_days: scheduledDays,
      status: "active",
      starts_at: nowIso,
      ends_at: null,
      deactivated_at: null,
      ended_reason: null,
      archived_at: null,
      scope_kind: resolvedDestination === "current_plan"
        ? "transformation"
        : "out_of_plan",
      initiative_kind: resolvedDestination === "current_plan"
        ? "plan_free"
        : "base_free",
      source_kind: "user_created",
      source_potion_session_id: null,
      target_kind: targetBinding.target_kind,
      target_plan_item_id: targetBinding.target_plan_item_id,
      target_action_family_key: targetBinding.target_action_family_key,
      target_generated_temp_id: targetBinding.target_generated_temp_id,
      target_binding_policy: targetBinding.target_binding_policy,
      target_lifecycle_policy: targetBinding.target_lifecycle_policy,
      updated_at: nowIso,
      initiative_metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "create_recurring_reminder",
        operation_id: args.operationId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        request_id: args.requestId ?? null,
        destination_requested: args.draft.draft.destination,
        destination_resolved: resolvedDestination,
        active_cycle_id: activeCycle?.id ?? null,
        active_transformation_id: activeTransformation?.id ?? null,
        active_transformation_title: activeTransformation?.title ?? null,
        active_plan_id: activePlan?.id ?? null,
        active_plan_title: activePlan?.title ?? null,
        related_plan_item: relatedPlanItem,
        target_binding: targetBinding,
        draft: args.draft,
      },
    } as any)
    .select(
      "id,target_kind,target_plan_item_id,target_action_family_key,target_generated_temp_id,target_binding_policy,target_lifecycle_policy",
    )
    .single();
  if (insertResult.error || !insertResult.data?.id) return insertResult;
  await classifyRecurringReminderBestEffort({
    userId: args.userId,
    reminderId: String(insertResult.data.id),
  });
  return insertResult;
}

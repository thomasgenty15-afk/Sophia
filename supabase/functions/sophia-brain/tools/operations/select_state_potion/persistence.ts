/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2";
import type { PotionSessionDraftV1 } from "./generator.ts";

let operationServiceClient: SupabaseClient | null = null;

function getPotionOperationServiceClient(): SupabaseClient | null {
  if (operationServiceClient) return operationServiceClient;
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const key = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) return null;
  operationServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return operationServiceClient;
}

async function ensurePotionOperationCycle(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
  const { data: active } = await args.supabase
    .from("user_cycles")
    .select("id")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active?.id) return String(active.id);

  const { data: inserted, error: insertError } = await args.supabase
    .from("user_cycles")
    .insert({
      user_id: args.userId,
      status: "draft",
      raw_intake_text: "Conversation web Sophia - operation hors plan",
      intake_language: "fr",
      duration_months: null,
    } as any)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return String(inserted.id);
}

export async function writeStatePotionActivation(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: PotionSessionDraftV1["draft"];
  scheduledFollowups: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }>;
  suppressFollowUp?: boolean;
  operationId?: string | null;
  requestId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{
  potion_session_id: string;
  recurring_reminder_id: string;
  scheduled_checkin_ids: string[];
}> {
  const writeClient = getPotionOperationServiceClient() ?? args.supabase;
  const cycleId = await ensurePotionOperationCycle({
    supabase: writeClient,
    userId: args.userId,
  });
  const nowIso = new Date().toISOString();
  const targetBinding = args.draft.target_binding ?? {
    kind: "none",
    label: null,
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: null,
    date_or_window_hint: null,
    evidence: [],
  };
  const schedulePlan = args.draft.follow_up.schedule_plan ?? {
    mode: "daily_series",
    duration_days: args.draft.follow_up.duration_days,
    local_time_hhmm: args.draft.follow_up.local_time_hhmm,
    scheduled_days: [],
    local_dates: [],
    timing_relation: "daily",
    reason: args.draft.follow_up.reason_for_time,
  };
  const scheduledDays = schedulePlan.mode === "specific_weekdays" &&
      schedulePlan.scheduled_days?.length
    ? schedulePlan.scheduled_days
    : args.scheduledFollowups
      .map((followup) =>
        ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
          new Date(`${followup.local_date}T00:00:00.000Z`).getUTCDay()
        ]
      )
      .filter((day, index, all) => day && all.indexOf(day) === index);
  const lifecyclePolicy = targetBinding.kind === "plan_item"
    ? "while_target_active"
    : targetBinding.kind === "action_family"
    ? "while_family_in_current_plan"
    : "independent";
  const bindingPolicy = targetBinding.kind === "plan_item"
    ? "live_action"
    : targetBinding.kind === "action_family"
    ? "live_action_family"
    : targetBinding.kind === "none"
    ? "none"
    : "snapshot";
  const { data: potion, error: potionError } = await writeClient
    .from("user_potion_sessions")
    .insert({
      user_id: args.userId,
      cycle_id: cycleId,
      transformation_id: null,
      phase_id: null,
      scope_kind: "out_of_plan",
      potion_type: args.draft.potion_type,
      source: "system",
      status: "completed",
      questionnaire_schema: [],
      questionnaire_answers: {},
      free_text: args.draft.opening_prompt,
      content: {
        title: args.draft.title,
        instant_support_message: args.draft.instant_support_message,
        potion_info_message: args.draft.potion_info_message,
        why_this_potion: args.draft.why_this_potion,
        target_binding: targetBinding,
        operation_draft: args.draft,
      },
      follow_up_strategy: {
        ...args.draft.follow_up,
        target_binding: targetBinding,
        schedule_plan: schedulePlan,
      },
      metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "select_state_potion",
        operation_id: args.operationId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        request_id: args.requestId ?? null,
      },
      generated_at: nowIso,
      last_updated_at: nowIso,
    } as any)
    .select("id")
    .single();
  if (potionError || !potion?.id) {
    throw potionError ?? new Error("potion_insert_failed");
  }

  if (args.suppressFollowUp) {
    return {
      potion_session_id: String(potion.id),
      recurring_reminder_id: "",
      scheduled_checkin_ids: [],
    };
  }

  const followUp = args.draft.follow_up;
  const { data: reminder, error: reminderError } = await writeClient
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      cycle_id: cycleId,
      message_instruction: followUp.reminder_instruction,
      rationale: schedulePlan.reason || `Suivi pour ${args.draft.title}`,
      local_time_hhmm: schedulePlan.local_time_hhmm ?? followUp.local_time_hhmm,
      scheduled_days: scheduledDays.length
        ? scheduledDays
        : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      status: "active",
      starts_at: nowIso,
      scope_kind: "out_of_plan",
      initiative_kind: "potion_follow_up",
      source_kind: "potion_generated",
      source_potion_session_id: potion.id,
      initiative_metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "select_state_potion",
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        schedule_plan: schedulePlan,
        target_binding: targetBinding,
      },
      target_kind: targetBinding.kind === "plan_item"
        ? "plan_item"
        : targetBinding.kind === "action_family"
        ? "action_family"
        : targetBinding.kind === "none"
        ? "none"
        : "transformation",
      target_plan_item_id: targetBinding.target_plan_item_id ??
        targetBinding.related_plan_item_id,
      target_action_family_key: targetBinding.target_action_family_key,
      target_generated_temp_id: targetBinding.target_generated_temp_id,
      target_binding_policy: bindingPolicy,
      target_lifecycle_policy: lifecyclePolicy,
    } as any)
    .select("id")
    .single();
  if (reminderError || !reminder?.id) {
    throw reminderError ?? new Error("potion_reminder_insert_failed");
  }

  const scheduledRows = args.scheduledFollowups.map((followup) => ({
    user_id: args.userId,
    recurring_reminder_id: reminder.id,
    event_context:
      `recurring_reminder:${reminder.id}:potion:${potion.id}:${followup.local_date}`,
    draft_message: followup.reminder_instruction,
    scheduled_for: new Date(
      `${followup.local_date}T${followup.local_time_hhmm}:00.000Z`,
    ).toISOString(),
    origin: "rendez_vous",
    status: "pending",
  }));
  const { data: checkins, error: checkinsError } = await writeClient
    .from("scheduled_checkins")
    .insert(scheduledRows as any)
    .select("id");
  if (checkinsError) throw checkinsError;

  return {
    potion_session_id: String(potion.id),
    recurring_reminder_id: String(reminder.id),
    scheduled_checkin_ids: ((checkins ?? []) as Array<{ id: string }>)
      .map((row) => String(row.id)),
  };
}

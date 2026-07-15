import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  type PotionFollowUpSeriesInput,
  type PotionFollowUpSeriesItem,
} from "./potion-follow-up-series.ts";
import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";
import {
  POTION_SUPPORT_SOURCE,
  readPotionSupportContext,
} from "./potion-support-context.ts";
import type { PotionScopeSelection, UserPotionSessionRow } from "./v2-types.ts";

export class PotionFollowUpSchedulingError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PotionFollowUpSchedulingError";
    this.status = status;
  }
}

function localTimeHHMMInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((part) => part.type === "hour")?.value ?? "00";
  const mm = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function compareHHMM(left: string, right: string): number {
  return left.localeCompare(right);
}

function addDays(iso: string, days: number): string {
  const base = new Date(iso);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function readPotionScope(
  session: UserPotionSessionRow,
): {
  potionScope: PotionScopeSelection | null;
  targetBinding: Record<string, unknown> | null;
} {
  const metadata = isRecord(session.metadata) ? session.metadata : {};
  const rawScope = isRecord(metadata.potion_scope)
    ? metadata.potion_scope
    : isRecord(metadata.rappel_scope)
    ? metadata.rappel_scope
    : null;
  const rawBinding = isRecord(metadata.target_binding)
    ? metadata.target_binding
    : null;
  const scopeKind = text(rawScope?.scope_kind);
  const targetScope = text(rawScope?.target_scope);
  const supportsScope = session.potion_type === "rappel" ||
    session.potion_type === "courage" ||
    session.potion_type === "guerison" ||
    session.potion_type === "amour" ||
    session.potion_type === "apaisement";
  const potionScope = supportsScope &&
      (scopeKind === "plan_linked" || scopeKind === "out_of_plan")
    ? {
      scope_kind: scopeKind,
      target_scope:
        targetScope === "plan_item" || targetScope === "whole_plan" ||
          targetScope === "unknown"
          ? targetScope
          : null,
      target_plan_item_id: text(rawScope?.target_plan_item_id),
      target_label: text(rawScope?.target_label),
    } as PotionScopeSelection
    : null;
  return {
    potionScope,
    targetBinding: rawBinding,
  };
}

function targetColumnsForPotionScope(
  session: UserPotionSessionRow,
): {
  target_kind: "none" | "transformation" | "plan_item";
  target_plan_item_id: string | null;
  target_binding_policy: "none" | "snapshot" | "live_action";
  target_lifecycle_policy: "independent" | "while_target_active";
} {
  const { potionScope, targetBinding } = readPotionScope(session);
  if (!potionScope) {
    return {
      target_kind: "none",
      target_plan_item_id: null,
      target_binding_policy: "none",
      target_lifecycle_policy: "independent",
    };
  }
  if (potionScope.scope_kind === "out_of_plan") {
    return {
      target_kind: "none",
      target_plan_item_id: null,
      target_binding_policy: "none",
      target_lifecycle_policy: "independent",
    };
  }
  if (
    potionScope.target_scope === "plan_item" && potionScope.target_plan_item_id
  ) {
    return {
      target_kind: "plan_item",
      target_plan_item_id: potionScope.target_plan_item_id,
      target_binding_policy: "live_action",
      target_lifecycle_policy: "while_target_active",
    };
  }
  return {
    target_kind: "transformation",
    target_plan_item_id: null,
    target_binding_policy: text(targetBinding?.binding_policy) === "snapshot"
      ? "snapshot"
      : "none",
    target_lifecycle_policy: "independent",
  };
}

export async function schedulePotionFollowUpForSession(args: {
  admin: SupabaseClient;
  userId: string;
  sessionId: string;
  localTimeHHMM: string;
  durationDays: number;
  now?: Date;
  seriesGenerator?: (
    input: PotionFollowUpSeriesInput,
  ) => Promise<PotionFollowUpSeriesItem[]>;
}): Promise<{ session: UserPotionSessionRow; scheduledCount: number }> {
  const { data: sessionData, error: sessionError } = await args.admin
    .from("user_potion_sessions")
    .select("*")
    .eq("id", args.sessionId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (sessionError) {
    throw new PotionFollowUpSchedulingError(
      500,
      `Session fetch failed: ${sessionError.message}`,
      {
        cause: sessionError,
      },
    );
  }
  if (!sessionData) {
    throw new PotionFollowUpSchedulingError(404, "Potion session not found");
  }

  const session = sessionData as UserPotionSessionRow;
  const proposal = session.content?.follow_up_proposal;
  const messageText = String(proposal?.message_text ?? "").trim();
  if (!messageText) {
    throw new PotionFollowUpSchedulingError(
      400,
      "This potion session has no follow-up proposal to schedule",
    );
  }

  const { data: profile } = await args.admin
    .from("profiles")
    .select("timezone")
    .eq("id", args.userId)
    .maybeSingle();
  const timezone =
    String((profile as Record<string, unknown> | null)?.timezone ?? "")
      .trim() ||
    "Europe/Paris";
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const nowLocalHHMM = localTimeHHMMInTimezone(timezone, now);
  const startOffset = compareHHMM(args.localTimeHHMM, nowLocalHHMM) > 0 ? 0 : 1;
  const rationale = proposal?.description ??
    session.follow_up_strategy?.rationale ?? null;
  const { potionScope, targetBinding } = readPotionScope(session);
  const supportContext = readPotionSupportContext(session.metadata);

  let recurringReminderId = String(
    session.follow_up_strategy?.linked_recurring_reminder_id ?? "",
  ).trim();

  if (!recurringReminderId) {
    const { data: existingReminder } = await args.admin
      .from("user_recurring_reminders")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_potion_session_id", session.id)
      .maybeSingle();
    recurringReminderId = String(
      (existingReminder as Record<string, unknown> | null)?.id ?? "",
    ).trim();
  }

  const targetColumns = targetColumnsForPotionScope(session);
  const initiativePayload = {
    user_id: args.userId,
    cycle_id: session.cycle_id,
    transformation_id: session.transformation_id,
    scope_kind: session.scope_kind,
    initiative_kind: "potion_follow_up",
    source_kind: "potion_generated",
    source_potion_session_id: session.id,
    message_instruction: messageText,
    rationale,
    local_time_hhmm: args.localTimeHHMM,
    scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    status: "active",
    starts_at: nowIso,
    ends_at: null,
    ended_reason: null,
    deactivated_at: null,
    archived_at: null,
    initiative_metadata: {
      potion_type: session.potion_type,
      source_session_generated_at: session.generated_at,
      scheduled_duration_days: args.durationDays,
      scope_kind: session.scope_kind,
      potion_scope: potionScope,
      rappel_scope: session.potion_type === "rappel" ? potionScope : null,
      target_binding: targetBinding,
      potion_support_v1: {
        version: 1,
        status: "active",
        terminal_reason: null,
        terminal_at: null,
        context_available: Boolean(supportContext),
      },
    },
    target_kind: targetColumns.target_kind,
    target_plan_item_id: targetColumns.target_plan_item_id,
    target_binding_policy: targetColumns.target_binding_policy,
    target_lifecycle_policy: targetColumns.target_lifecycle_policy,
    updated_at: nowIso,
  };

  if (recurringReminderId) {
    const { error: reminderUpdateError } = await args.admin
      .from("user_recurring_reminders")
      .update(initiativePayload)
      .eq("id", recurringReminderId)
      .eq("user_id", args.userId);
    if (reminderUpdateError) {
      throw new PotionFollowUpSchedulingError(
        500,
        `Reminder update failed: ${reminderUpdateError.message}`,
        { cause: reminderUpdateError },
      );
    }
  } else {
    const { data: insertedReminder, error: reminderInsertError } = await args
      .admin
      .from("user_recurring_reminders")
      .insert(initiativePayload)
      .select("id")
      .single();
    if (reminderInsertError) {
      throw new PotionFollowUpSchedulingError(
        500,
        `Reminder insert failed: ${reminderInsertError.message}`,
        { cause: reminderInsertError },
      );
    }
    recurringReminderId = String(
      (insertedReminder as Record<string, unknown> | null)?.id ?? "",
    ).trim();
  }

  if (!recurringReminderId) {
    throw new PotionFollowUpSchedulingError(
      500,
      "Unable to resolve recurring reminder id for potion follow-up",
    );
  }

  const eventContext = `recurring_reminder:${recurringReminderId}`;

  await args.admin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: nowIso,
    })
    .eq("user_id", args.userId)
    .eq("recurring_reminder_id", recurringReminderId)
    .in("status", ["pending", "retrying", "awaiting_user"])
    .gte("scheduled_for", nowIso);

  const rows = Array.from({ length: args.durationDays }).map((_, index) => ({
    user_id: args.userId,
    recurring_reminder_id: recurringReminderId,
    origin: "rendez_vous",
    event_context: eventContext,
    draft_message: null,
    message_mode: "dynamic",
    message_payload: {
      source: POTION_SUPPORT_SOURCE,
      source_potion_session_id: session.id,
      potion_type: session.potion_type,
      reminder_instruction: messageText,
      rationale,
      day_index: index + 1,
      generated_at: null,
      instruction: messageText,
      potion_scope: potionScope,
      rappel_scope: session.potion_type === "rappel" ? potionScope : null,
      target_binding: targetBinding,
      potion_support_v1: {
        version: 1,
        source_potion_session_id: session.id,
        day_index: index + 1,
        preparation_status: "pending",
        decision_reason: null,
        read_cutoff: null,
        anchor_fact: null,
        question_candidate: null,
        generated_at: null,
        presence_armed_at: null,
      },
    },
    scheduled_for: computeScheduledForFromLocal({
      timezone,
      dayOffset: startOffset + index,
      localTimeHHMM: args.localTimeHHMM,
      now,
    }),
    status: "pending",
  }));

  const { error: insertError } = await args.admin.from("scheduled_checkins")
    .insert(rows);
  if (insertError) {
    throw new PotionFollowUpSchedulingError(
      500,
      `Checkin insert failed: ${insertError.message}`,
      {
        cause: insertError,
      },
    );
  }

  const nextFollowUpStrategy = {
    ...(session.follow_up_strategy ?? {}),
    mode: "scheduled_series",
    scheduled_local_time_hhmm: args.localTimeHHMM,
    scheduled_duration_days: args.durationDays,
    scheduled_message_count: args.durationDays,
    scheduled_message_series: null,
    generated_series: null,
    series_generated_at: null,
    series_generator_version: "potion_support_dynamic_v1",
    scheduled_at: nowIso,
    linked_recurring_reminder_id: recurringReminderId,
    rationale,
  };

  const lastScheduledFor = rows[rows.length - 1]?.scheduled_for ?? nowIso;
  const endsAt = addDays(lastScheduledFor, 1);

  const { data: updatedSession, error: updateError } = await args.admin
    .from("user_potion_sessions")
    .update({
      follow_up_strategy: nextFollowUpStrategy,
      last_updated_at: nowIso,
    })
    .eq("id", session.id)
    .eq("user_id", args.userId)
    .select("*")
    .single();

  if (updateError) {
    throw new PotionFollowUpSchedulingError(
      500,
      `Session update failed: ${updateError.message}`,
      {
        cause: updateError,
      },
    );
  }

  const { error: finalizeReminderError } = await args.admin
    .from("user_recurring_reminders")
    .update({
      ends_at: endsAt,
      last_drafted_at: null,
      last_draft_message: null,
      updated_at: nowIso,
    })
    .eq("id", recurringReminderId)
    .eq("user_id", args.userId);

  if (finalizeReminderError) {
    throw new PotionFollowUpSchedulingError(
      500,
      `Reminder finalize failed: ${finalizeReminderError.message}`,
      { cause: finalizeReminderError },
    );
  }

  return {
    session: updatedSession as UserPotionSessionRow,
    scheduledCount: args.durationDays,
  };
}

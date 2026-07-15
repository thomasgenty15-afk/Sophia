import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type PotionSupportTerminalReason =
  | "cancelled_safety"
  | "cancelled_user_boundary"
  | "completed_resolved";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Terminal and idempotent: this helper never exposes a resume path. */
export async function cancelPotionSupportCampaign(input: {
  admin: SupabaseClient;
  userId: string;
  recurringReminderId?: string | null;
  sourcePotionSessionId?: string | null;
  reason: PotionSupportTerminalReason;
  nowIso?: string;
}) {
  const nowIso = input.nowIso ?? new Date().toISOString();
  let query = input.admin
    .from("user_recurring_reminders")
    .select("id,initiative_metadata,status")
    .eq("user_id", input.userId)
    .eq("initiative_kind", "potion_follow_up");
  if (input.recurringReminderId) {
    query = query.eq("id", input.recurringReminderId);
  } else if (input.sourcePotionSessionId) {
    query = query.eq("source_potion_session_id", input.sourcePotionSessionId);
  } else {
    query = query.eq("status", "active");
  }
  const { data, error } = await query;
  if (error) throw error;
  const reminders = (data ?? []) as Array<Record<string, unknown>>;

  for (const reminder of reminders) {
    const reminderId = String(reminder.id ?? "").trim();
    if (!reminderId) continue;
    const metadata = isRecord(reminder.initiative_metadata)
      ? reminder.initiative_metadata
      : {};
    const existingSupport = isRecord(metadata.potion_support_v1)
      ? metadata.potion_support_v1
      : {};
    await input.admin
      .from("user_recurring_reminders")
      .update({
        status: input.reason === "completed_resolved"
          ? "completed"
          : "archived",
        archived_at: input.reason === "completed_resolved" ? null : nowIso,
        deactivated_at: nowIso,
        updated_at: nowIso,
        initiative_metadata: {
          ...metadata,
          potion_support_v1: {
            ...existingSupport,
            version: 1,
            status: input.reason,
            terminal_reason: input.reason,
            terminal_at: nowIso,
          },
        },
      })
      .eq("id", reminderId)
      .eq("user_id", input.userId);

    const { data: checkins, error: checkinsError } = await input.admin
      .from("scheduled_checkins")
      .select("id")
      .eq("user_id", input.userId)
      .eq("recurring_reminder_id", reminderId)
      .in("status", ["pending", "retrying", "awaiting_user"]);
    if (checkinsError) throw checkinsError;
    const checkinIds = (checkins ?? []).map((row: Record<string, unknown>) =>
      String(row.id ?? "").trim()
    ).filter(Boolean);
    if (checkinIds.length > 0) {
      const { error: cancelCheckinsError } = await input.admin
        .from("scheduled_checkins")
        .update({
          status: "cancelled",
          processed_at: nowIso,
          delivery_last_error: input.reason,
          delivery_last_error_at: nowIso,
        })
        .in("id", checkinIds)
        .in("status", ["pending", "retrying", "awaiting_user"]);
      if (cancelCheckinsError) throw cancelCheckinsError;

      const { error: pendingError } = await input.admin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: nowIso })
        .in("scheduled_checkin_id", checkinIds)
        .eq("status", "pending");
      if (pendingError) throw pendingError;
    }
  }

  return { cancelledReminderIds: reminders.map((row) => String(row.id)) };
}

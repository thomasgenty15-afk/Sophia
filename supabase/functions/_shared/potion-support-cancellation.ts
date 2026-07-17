import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type PotionSupportTerminalReason =
  | "cancelled_safety"
  | "cancelled_user_boundary"
  | "cancelled_context_obsolete"
  | "completed_resolved";

export type PotionSupportCancellationOutcome = {
  reason: PotionSupportTerminalReason;
  matchedReminderIds: string[];
  terminalizedReminderIds: string[];
  alreadyTerminalReminderIds: string[];
  /** Kept for compatibility with the original helper return value. */
  cancelledReminderIds: string[];
  cancelledCheckinIds: string[];
  cancelledPendingActionIds: string[];
  counts: {
    matchedReminders: number;
    terminalizedReminders: number;
    alreadyTerminalReminders: number;
    cancelledCheckins: number;
    cancelledPendingActions: number;
  };
  verification: {
    passed: true;
    checkedAt: string;
    activeReminderIds: [];
    activeCheckinIds: [];
    pendingActionIds: [];
  };
};

const ACTIVE_CHECKIN_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
] as const;
const TERMINAL_REMINDER_STATUSES = new Set(["archived", "completed"]);
const TERMINAL_REASONS = new Set<PotionSupportTerminalReason>([
  "cancelled_safety",
  "cancelled_user_boundary",
  "cancelled_context_obsolete",
  "completed_resolved",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueIds(rows: Array<Record<string, unknown>>): string[] {
  return [...new Set(rows.map((row) => cleanId(row.id)).filter(Boolean))];
}

function rowsOrThrow(
  data: unknown,
  error: unknown,
  operation: string,
): Array<Record<string, unknown>> {
  if (error) {
    throw new Error(`Potion support cancellation failed during ${operation}`, {
      cause: error,
    });
  }
  if (!Array.isArray(data)) {
    throw new Error(
      `Potion support cancellation received no row result during ${operation}`,
    );
  }
  return data.filter(isRecord);
}

function supportMetadata(
  reminder: Record<string, unknown>,
): Record<string, unknown> {
  const metadata = isRecord(reminder.initiative_metadata)
    ? reminder.initiative_metadata
    : {};
  return isRecord(metadata.potion_support_v1) ? metadata.potion_support_v1 : {};
}

function recordedTerminalReason(
  reminder: Record<string, unknown>,
): PotionSupportTerminalReason | null {
  const support = supportMetadata(reminder);
  const candidate = cleanId(support.terminal_reason) || cleanId(support.status);
  return TERMINAL_REASONS.has(candidate as PotionSupportTerminalReason)
    ? candidate as PotionSupportTerminalReason
    : null;
}

function isDurablyTerminal(reminder: Record<string, unknown>): boolean {
  return TERMINAL_REMINDER_STATUSES.has(cleanId(reminder.status)) &&
    recordedTerminalReason(reminder) !== null;
}

function isTerminalForReason(
  reminder: Record<string, unknown>,
  reason: PotionSupportTerminalReason,
): boolean {
  const expectedStatus = reason === "completed_resolved"
    ? "completed"
    : "archived";
  return cleanId(reminder.status) === expectedStatus &&
    recordedTerminalReason(reminder) === reason;
}

function assertNoMissingIds(input: {
  expectedIds: string[];
  rows: Array<Record<string, unknown>>;
  operation: string;
}) {
  const returnedIds = new Set(uniqueIds(input.rows));
  const missingIds = input.expectedIds.filter((id) => !returnedIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `Potion support cancellation update affected no row during ${input.operation}: ${
        missingIds.join(",")
      }`,
    );
  }
}

function assertTerminalReminderRows(input: {
  rows: Array<Record<string, unknown>>;
  reason: PotionSupportTerminalReason;
  operation: string;
}) {
  const invalidIds = input.rows
    .filter((row) => !isTerminalForReason(row, input.reason))
    .map((row) => cleanId(row.id))
    .filter(Boolean);
  if (invalidIds.length > 0) {
    throw new Error(
      `Potion support cancellation did not persist terminal reminder state during ${input.operation}: ${
        invalidIds.join(",")
      }`,
    );
  }
}

/** Terminal and idempotent: this helper never exposes a resume path. */
export async function cancelPotionSupportCampaign(input: {
  admin: SupabaseClient;
  userId: string;
  recurringReminderId?: string | null;
  sourcePotionSessionId?: string | null;
  reason: PotionSupportTerminalReason;
  nowIso?: string;
}): Promise<PotionSupportCancellationOutcome> {
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
  const reminderSelection = await query;
  const reminders = rowsOrThrow(
    reminderSelection.data,
    reminderSelection.error,
    "reminder selection",
  );
  const matchedReminderIds = uniqueIds(reminders);
  if (matchedReminderIds.length !== reminders.length) {
    throw new Error(
      "Potion support cancellation selected a reminder without a stable id",
    );
  }

  const alreadyTerminalReminderIds: string[] = [];
  const terminalizedReminderIds: string[] = [];

  for (const reminder of reminders) {
    const reminderId = cleanId(reminder.id);
    if (isDurablyTerminal(reminder)) {
      alreadyTerminalReminderIds.push(reminderId);
      continue;
    }

    const metadata = isRecord(reminder.initiative_metadata)
      ? reminder.initiative_metadata
      : {};
    const existingSupport = supportMetadata(reminder);
    const reminderUpdate = await input.admin
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
      .eq("user_id", input.userId)
      .select("id,status,initiative_metadata");
    const updatedReminderRows = rowsOrThrow(
      reminderUpdate.data,
      reminderUpdate.error,
      `reminder update (${reminderId})`,
    );
    assertNoMissingIds({
      expectedIds: [reminderId],
      rows: updatedReminderRows,
      operation: `reminder update (${reminderId})`,
    });
    assertTerminalReminderRows({
      rows: updatedReminderRows,
      reason: input.reason,
      operation: `reminder update (${reminderId})`,
    });
    terminalizedReminderIds.push(reminderId);
  }

  let allCheckinIds: string[] = [];
  let activeCheckinIds: string[] = [];
  let cancelledCheckinIds: string[] = [];
  let cancelledPendingActionIds: string[] = [];

  if (matchedReminderIds.length > 0) {
    const checkinSelection = await input.admin
      .from("scheduled_checkins")
      .select("id,status,recurring_reminder_id")
      .eq("user_id", input.userId)
      .in("recurring_reminder_id", matchedReminderIds);
    const checkins = rowsOrThrow(
      checkinSelection.data,
      checkinSelection.error,
      "check-in selection",
    );
    allCheckinIds = uniqueIds(checkins);
    activeCheckinIds = uniqueIds(
      checkins.filter((row) =>
        ACTIVE_CHECKIN_STATUSES.includes(
          cleanId(row.status) as (typeof ACTIVE_CHECKIN_STATUSES)[number],
        )
      ),
    );

    if (activeCheckinIds.length > 0) {
      const checkinUpdate = await input.admin
        .from("scheduled_checkins")
        .update({
          status: "cancelled",
          processed_at: nowIso,
          delivery_last_error: input.reason,
          delivery_last_error_at: nowIso,
        })
        .in("id", activeCheckinIds)
        .in("status", [...ACTIVE_CHECKIN_STATUSES])
        .select("id,status");
      const updatedCheckinRows = rowsOrThrow(
        checkinUpdate.data,
        checkinUpdate.error,
        "check-in cancellation",
      );
      assertNoMissingIds({
        expectedIds: activeCheckinIds,
        rows: updatedCheckinRows,
        operation: "check-in cancellation",
      });
      cancelledCheckinIds = uniqueIds(updatedCheckinRows);
    }

    if (allCheckinIds.length > 0) {
      const pendingSelection = await input.admin
        .from("whatsapp_pending_actions")
        .select("id,status,scheduled_checkin_id")
        .in("scheduled_checkin_id", allCheckinIds)
        .eq("status", "pending");
      const pendingActions = rowsOrThrow(
        pendingSelection.data,
        pendingSelection.error,
        "pending-action selection",
      );
      const pendingActionIds = uniqueIds(pendingActions);
      if (pendingActionIds.length > 0) {
        const pendingUpdate = await input.admin
          .from("whatsapp_pending_actions")
          .update({ status: "cancelled", processed_at: nowIso })
          .in("id", pendingActionIds)
          .eq("status", "pending")
          .select("id,status");
        const updatedPendingRows = rowsOrThrow(
          pendingUpdate.data,
          pendingUpdate.error,
          "pending-action cancellation",
        );
        assertNoMissingIds({
          expectedIds: pendingActionIds,
          rows: updatedPendingRows,
          operation: "pending-action cancellation",
        });
        cancelledPendingActionIds = uniqueIds(updatedPendingRows);
      }
    }
  }

  let remainingActiveReminderIds: string[] = [];
  let remainingActiveCheckinIds: string[] = [];
  let remainingPendingActionIds: string[] = [];

  if (matchedReminderIds.length > 0) {
    const reminderVerification = await input.admin
      .from("user_recurring_reminders")
      .select("id,status,initiative_metadata")
      .eq("user_id", input.userId)
      .in("id", matchedReminderIds);
    const verifiedReminders = rowsOrThrow(
      reminderVerification.data,
      reminderVerification.error,
      "reminder verification",
    );
    remainingActiveReminderIds = uniqueIds(
      verifiedReminders.filter((row) => !isDurablyTerminal(row)),
    );

    const checkinVerification = await input.admin
      .from("scheduled_checkins")
      .select("id,status,recurring_reminder_id")
      .eq("user_id", input.userId)
      .in("recurring_reminder_id", matchedReminderIds);
    const verifiedCheckins = rowsOrThrow(
      checkinVerification.data,
      checkinVerification.error,
      "check-in verification",
    );
    allCheckinIds = uniqueIds(verifiedCheckins);
    remainingActiveCheckinIds = uniqueIds(
      verifiedCheckins.filter((row) =>
        ACTIVE_CHECKIN_STATUSES.includes(
          cleanId(row.status) as (typeof ACTIVE_CHECKIN_STATUSES)[number],
        )
      ),
    );

    if (allCheckinIds.length > 0) {
      const pendingVerification = await input.admin
        .from("whatsapp_pending_actions")
        .select("id,status,scheduled_checkin_id")
        .in("scheduled_checkin_id", allCheckinIds)
        .eq("status", "pending");
      const verifiedPendingActions = rowsOrThrow(
        pendingVerification.data,
        pendingVerification.error,
        "pending-action verification",
      );
      remainingPendingActionIds = uniqueIds(verifiedPendingActions);
    }
  }

  if (
    remainingActiveReminderIds.length > 0 ||
    remainingActiveCheckinIds.length > 0 ||
    remainingPendingActionIds.length > 0
  ) {
    throw new Error(
      "Potion support cancellation verification failed: " +
        JSON.stringify({
          activeReminderIds: remainingActiveReminderIds,
          activeCheckinIds: remainingActiveCheckinIds,
          pendingActionIds: remainingPendingActionIds,
        }),
    );
  }

  return {
    reason: input.reason,
    matchedReminderIds,
    terminalizedReminderIds,
    alreadyTerminalReminderIds,
    cancelledReminderIds: matchedReminderIds,
    cancelledCheckinIds,
    cancelledPendingActionIds,
    counts: {
      matchedReminders: matchedReminderIds.length,
      terminalizedReminders: terminalizedReminderIds.length,
      alreadyTerminalReminders: alreadyTerminalReminderIds.length,
      cancelledCheckins: cancelledCheckinIds.length,
      cancelledPendingActions: cancelledPendingActionIds.length,
    },
    verification: {
      passed: true,
      checkedAt: nowIso,
      activeReminderIds: [],
      activeCheckinIds: [],
      pendingActionIds: [],
    },
  };
}

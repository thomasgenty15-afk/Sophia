import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import type { UserPotionSessionRow } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  session_id: z.string().uuid(),
  local_time_hhmm: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  duration_days: z.number().int().min(3).max(14),
});

class SchedulePotionFollowUpError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SchedulePotionFollowUpError";
    this.status = status;
  }
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new SchedulePotionFollowUpError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
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

async function schedulePotionFollowUp(args: {
  userId: string;
  sessionId: string;
  localTimeHHMM: string;
  durationDays: number;
  requestId?: string;
}): Promise<{ session: UserPotionSessionRow; scheduledCount: number }> {
  const env = getSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessionData, error: sessionError } = await admin
    .from("user_potion_sessions")
    .select("*")
    .eq("id", args.sessionId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (sessionError) {
    throw new SchedulePotionFollowUpError(500, `Session fetch failed: ${sessionError.message}`, {
      cause: sessionError,
    });
  }
  if (!sessionData) {
    throw new SchedulePotionFollowUpError(404, "Potion session not found");
  }

  const session = sessionData as UserPotionSessionRow;
  const proposal = session.content?.follow_up_proposal;
  const messageText = String(proposal?.message_text ?? "").trim();
  if (!messageText) {
    throw new SchedulePotionFollowUpError(400, "This potion session has no follow-up proposal to schedule");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", args.userId)
    .maybeSingle();
  const timezone = String((profile as Record<string, unknown> | null)?.timezone ?? "").trim() ||
    "Europe/Paris";
  const nowIso = new Date().toISOString();
  const nowLocalHHMM = localTimeHHMMInTimezone(timezone);
  const startOffset = compareHHMM(args.localTimeHHMM, nowLocalHHMM) > 0 ? 0 : 1;

  let recurringReminderId = String(
    session.follow_up_strategy?.linked_recurring_reminder_id ?? "",
  ).trim();

  if (!recurringReminderId) {
    const { data: existingReminder } = await admin
      .from("user_recurring_reminders")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_potion_session_id", session.id)
      .maybeSingle();
    recurringReminderId = String((existingReminder as Record<string, unknown> | null)?.id ?? "").trim();
  }

  const initiativePayload = {
    user_id: args.userId,
    cycle_id: session.cycle_id,
    transformation_id: session.transformation_id,
    scope_kind: session.scope_kind,
    initiative_kind: "potion_follow_up",
    source_kind: "potion_generated",
    source_potion_session_id: session.id,
    message_instruction: messageText,
    rationale: proposal?.description ?? session.follow_up_strategy?.rationale ?? null,
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
    },
    updated_at: nowIso,
  };

  if (recurringReminderId) {
    const { error: reminderUpdateError } = await admin
      .from("user_recurring_reminders")
      .update(initiativePayload)
      .eq("id", recurringReminderId)
      .eq("user_id", args.userId);
    if (reminderUpdateError) {
      throw new SchedulePotionFollowUpError(
        500,
        `Reminder update failed: ${reminderUpdateError.message}`,
        { cause: reminderUpdateError },
      );
    }
  } else {
    const { data: insertedReminder, error: reminderInsertError } = await admin
      .from("user_recurring_reminders")
      .insert(initiativePayload)
      .select("id")
      .single();
    if (reminderInsertError) {
      throw new SchedulePotionFollowUpError(
        500,
        `Reminder insert failed: ${reminderInsertError.message}`,
        { cause: reminderInsertError },
      );
    }
    recurringReminderId = String((insertedReminder as Record<string, unknown> | null)?.id ?? "").trim();
  }

  if (!recurringReminderId) {
    throw new SchedulePotionFollowUpError(500, "Unable to resolve recurring reminder id for potion follow-up");
  }

  const eventContext = `recurring_reminder:${recurringReminderId}`;

  await admin
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
    draft_message: messageText,
    scheduled_for: computeScheduledForFromLocal({
      timezone,
      dayOffset: startOffset + index,
      localTimeHHMM: args.localTimeHHMM,
    }),
    status: "pending",
  }));

  const { error: insertError } = await admin.from("scheduled_checkins").insert(rows);
  if (insertError) {
    throw new SchedulePotionFollowUpError(500, `Checkin insert failed: ${insertError.message}`, {
      cause: insertError,
    });
  }

  const nextFollowUpStrategy = {
    ...(session.follow_up_strategy ?? {}),
    mode: "scheduled_series",
    scheduled_local_time_hhmm: args.localTimeHHMM,
    scheduled_duration_days: args.durationDays,
    scheduled_message_count: args.durationDays,
    scheduled_at: nowIso,
    linked_recurring_reminder_id: recurringReminderId,
    rationale: proposal?.description ?? session.follow_up_strategy?.rationale ?? null,
  };

  const lastScheduledFor = rows[rows.length - 1]?.scheduled_for ?? nowIso;
  const endsAt = addDays(lastScheduledFor, 1);

  const { data: updatedSession, error: updateError } = await admin
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
    throw new SchedulePotionFollowUpError(500, `Session update failed: ${updateError.message}`, {
      cause: updateError,
    });
  }

  const { error: finalizeReminderError } = await admin
    .from("user_recurring_reminders")
    .update({
      ends_at: endsAt,
      last_drafted_at: nowIso,
      last_draft_message: messageText,
      updated_at: nowIso,
    })
    .eq("id", recurringReminderId)
    .eq("user_id", args.userId);

  if (finalizeReminderError) {
    throw new SchedulePotionFollowUpError(
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

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method Not Allowed", request_id: requestId },
        { status: 405 },
      );
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const result = await schedulePotionFollowUp({
      userId: authData.user.id,
      sessionId: parsed.data.session_id,
      localTimeHHMM: parsed.data.local_time_hhmm,
      durationDays: parsed.data.duration_days,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      session: result.session,
      scheduled_count: result.scheduledCount,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "schedule-potion-follow-up-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "schedule-potion-follow-up-v1" },
    });

    if (error instanceof SchedulePotionFollowUpError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to schedule potion follow-up");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import {
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  buildActionEveningReviewMessage,
  buildActionMorningFallbackMessage,
  buildActionMorningGrounding,
  buildActionMorningInstruction,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  loadTodayActionOccurrences,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
  shouldScheduleLightMorningGreeting,
} from "../_shared/action_occurrences.ts";
import {
  allowsContactWindow,
  getUserRelationPreferences,
} from "../sophia-brain/relation_preferences_engine.ts";
import {
  listMorningNudgeEventContexts,
} from "../sophia-brain/momentum_morning_nudge.ts";

const TARGET_LOCAL_TIME = "07:00";
const EVENING_REVIEW_LOCAL_TIME = "20:30";
const MORNING_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isWhatsappSchedulingTierEligible(accessTierRaw: unknown): boolean {
  const tier = cleanText(accessTierRaw).toLowerCase();
  return tier === "trial" || tier === "alliance" || tier === "architecte";
}

async function cancelFutureMorningCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .in("event_context", [
      ...listMorningNudgeEventContexts(),
      ACTION_MORNING_EVENT_CONTEXT,
      MORNING_LIGHT_GREETING_EVENT_CONTEXT,
    ])
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

async function cancelFutureActionEveningReviewCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .eq("event_context", ACTION_EVENING_REVIEW_EVENT_CONTEXT)
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const userIdFilter = cleanText(body.user_id);
    const fullReset = Boolean(body.full_reset);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select(
        "id,timezone,whatsapp_opted_in,whatsapp_coaching_paused_until,access_tier",
      )
      .order("id", { ascending: true });

    if (userIdFilter) {
      profilesQuery = profilesQuery.eq("id", userIdFilter);
    }

    const { data: profiles, error: profilesErr } = await profilesQuery;
    if (profilesErr) throw profilesErr;

    let scheduled = 0;
    let actionMorningScheduled = 0;
    let lightGreetingScheduled = 0;
    let actionEveningReviewScheduled = 0;
    let skipped = 0;
    let candidates = 0;

    for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
      const userId = cleanText(profile.id);
      if (!userId) continue;

      const now = new Date();
      const nowIso = now.toISOString();
      const timezone = cleanText(profile.timezone, "Europe/Paris");

      if (!Boolean(profile.whatsapp_opted_in)) {
        skipped++;
        continue;
      }

      const pauseUntilIso = cleanText(profile.whatsapp_coaching_paused_until);
      const pauseUntilMs = pauseUntilIso
        ? new Date(pauseUntilIso).getTime()
        : NaN;
      if (Number.isFinite(pauseUntilMs) && pauseUntilMs > Date.now()) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          untilIso: new Date(pauseUntilMs).toISOString(),
        });
        await cancelFutureActionEveningReviewCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          untilIso: new Date(pauseUntilMs).toISOString(),
        });
        skipped++;
        continue;
      }

      if (fullReset) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
        await cancelFutureActionEveningReviewCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
      }

      if (!isWhatsappSchedulingTierEligible(profile.access_tier)) {
        skipped++;
        continue;
      }

      const relationPreferences = await getUserRelationPreferences(
        supabaseAdmin as any,
        userId,
      ).catch(() => null);
      const allowsMorning = allowsContactWindow(relationPreferences, "morning");
      const allowsEvening = allowsContactWindow(relationPreferences, "evening");
      if (!allowsMorning) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
      }
      if (!allowsEvening) {
        await cancelFutureActionEveningReviewCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
      }
      if (!allowsMorning && !allowsEvening) {
        skipped++;
        continue;
      }

      const todaySchedule = await loadTodayActionOccurrences(
        supabaseAdmin as any,
        {
          userId,
          timezone,
          localTimeHHMM: TARGET_LOCAL_TIME,
          now,
        },
      );

      const hasActionsToday = todaySchedule.transformations.some((entry) =>
        entry.occurrences.length > 0
      );
      const shouldSendLightGreeting = !hasActionsToday &&
        await shouldScheduleLightMorningGreeting(supabaseAdmin as any, {
          userId,
          timezone,
          localDate: todaySchedule.local_date,
          now,
        });

      if (!hasActionsToday && (!allowsMorning || !shouldSendLightGreeting)) {
        skipped++;
        continue;
      }

      candidates++;

      if (allowsMorning && (hasActionsToday || shouldSendLightGreeting)) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });

        const eventContext = hasActionsToday
          ? ACTION_MORNING_EVENT_CONTEXT
          : MORNING_LIGHT_GREETING_EVENT_CONTEXT;
        const draftMessage = hasActionsToday
          ? buildActionMorningFallbackMessage(todaySchedule)
          : buildLightMorningFallbackMessage();
        const instruction = hasActionsToday
          ? buildActionMorningInstruction(todaySchedule)
          : buildLightMorningInstruction();
        const eventGrounding = hasActionsToday
          ? buildActionMorningGrounding(todaySchedule)
          : `local_date=${todaySchedule.local_date}\nweekday=${todaySchedule.weekday}\nno_confirmed_action_occurrence=true`;

        const { error: upsertErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: userId,
              origin: "action_morning",
              event_context: eventContext,
              draft_message: draftMessage,
              message_mode: "dynamic",
              message_payload: {
                source: "schedule_action_morning_v2",
                version: 1,
                timezone,
                local_date: todaySchedule.local_date,
                week_start_date: todaySchedule.week_start_date,
                weekday: todaySchedule.weekday,
                transformations: todaySchedule.transformations,
                occurrence_ids: todaySchedule.transformations.flatMap((
                  entry,
                ) =>
                  entry.occurrences.map((occurrence) =>
                    occurrence.occurrence_id
                  )
                ),
                plan_item_ids: todaySchedule.transformations.flatMap((entry) =>
                  entry.occurrences.map((occurrence) => occurrence.plan_item_id)
                ),
                instruction,
                event_grounding: eventGrounding,
                chat_capability: "track_progress_only",
                generated_at: nowIso,
              },
              scheduled_for: todaySchedule.scheduled_for,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          );
        if (upsertErr) {
          console.error(
            `[schedule-morning-active-action-checkins] request_id=${requestId} morning_upsert_failed user_id=${userId}`,
            upsertErr,
          );
        } else {
          scheduled++;
          if (hasActionsToday) {
            actionMorningScheduled++;
          } else {
            lightGreetingScheduled++;
          }
        }
      }

      if (hasActionsToday && allowsEvening) {
        const eveningSchedule = await loadTodayActionOccurrences(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            localTimeHHMM: EVENING_REVIEW_LOCAL_TIME,
            now,
          },
        );
        const eveningOccurrenceIds = eveningSchedule.transformations.flatMap((
          entry,
        ) => entry.occurrences.map((occurrence) => occurrence.occurrence_id));
        if (eveningOccurrenceIds.length > 0) {
          const { error: eveningErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "action_review",
                event_context: ACTION_EVENING_REVIEW_EVENT_CONTEXT,
                draft_message: buildActionEveningReviewMessage(
                  eveningSchedule,
                ),
                message_mode: "static",
                message_payload: {
                  source: "schedule_action_evening_review_v2",
                  version: 1,
                  timezone,
                  local_date: eveningSchedule.local_date,
                  week_start_date: eveningSchedule.week_start_date,
                  weekday: eveningSchedule.weekday,
                  transformations: eveningSchedule.transformations,
                  occurrence_ids: eveningOccurrenceIds,
                  plan_item_ids: eveningSchedule.transformations.flatMap((
                    entry,
                  ) =>
                    entry.occurrences.map((occurrence) =>
                      occurrence.plan_item_id
                    )
                  ),
                  generated_at: nowIso,
                },
                scheduled_for: eveningSchedule.scheduled_for,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (eveningErr) {
            console.error(
              `[schedule-morning-active-action-checkins] request_id=${requestId} evening_upsert_failed user_id=${userId}`,
              eveningErr,
            );
          } else {
            scheduled++;
            actionEveningReviewScheduled++;
          }
        }
      }
    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        action_morning_scheduled: actionMorningScheduled,
        light_greeting_scheduled: lightGreetingScheduled,
        action_evening_review_scheduled: actionEveningReviewScheduled,
        skipped,
        candidates,
        request_id: requestId,
        user_id: userIdFilter || null,
        event_context: ACTION_MORNING_EVENT_CONTEXT,
      },
      { includeCors: false },
    );
  } catch (error) {
    console.error(
      `[schedule-morning-active-action-checkins] request_id=${requestId}`,
      error,
    );
    await logEdgeFunctionError({
      functionName: "schedule-morning-active-action-checkins",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(
      req,
      { error: errorToMessage(error), request_id: requestId },
      { status: 500, includeCors: false },
    );
  }
});

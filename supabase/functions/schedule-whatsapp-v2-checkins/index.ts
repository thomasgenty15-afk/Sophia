/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import {
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT,
  buildActionMorningFallbackMessage,
  buildActionMorningFollowupFallbackMessage,
  buildActionMorningFollowupGrounding,
  buildActionMorningFollowupInstruction,
  buildActionMorningGrounding,
  buildActionMorningInstruction,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  loadTodayActionOccurrences,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
  shouldScheduleLightMorningGreeting,
  type TodayActionOccurrenceSchedule,
} from "../_shared/action_occurrences.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import {
  allowsContactWindow,
  getUserRelationPreferences,
} from "../sophia-brain/relation_preferences_engine.ts";
import {
  listMorningNudgeEventContexts,
} from "../sophia-brain/momentum_morning_nudge.ts";
import {
  addDaysYmd,
  buildWeeklyPlanningValidationMessage,
  buildWeeklyProgressReviewFallbackMessage,
  buildWeeklyProgressReviewGrounding,
  buildWeeklyProgressReviewInstruction,
  currentWeekStartForTimezone,
  hasPlanifiableWeekStart,
  loadWeeklyProgressReview,
  localWeekdayForTimezone,
  WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
  WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
  weeklyPlanningDashboardUrl,
} from "../_shared/weekly_progress_review.ts";

const TARGET_LOCAL_TIME = "07:00";
const EVENING_REVIEW_START_LOCAL_TIME = "19:00";
const EVENING_REVIEW_END_LOCAL_TIME = "21:30";
const WEEKLY_PLANNING_PROMPT_LOCAL_TIME = "10:30";
const WEEKLY_PROGRESS_REVIEW_LOCAL_TIME = "18:30";
const MORNING_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function minutesFromHHMM(value: string): number {
  const match = cleanText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("invalid_hhmm");
  return Math.max(0, Math.min(23, Number(match[1]))) * 60 +
    Math.max(0, Math.min(59, Number(match[2])));
}

function hhmmFromMinutes(value: number): string {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.floor(value)));
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function stableHashInt(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function randomEveningReviewLocalTime(params: {
  userId: string;
  localDate: string;
}): string {
  const start = minutesFromHHMM(EVENING_REVIEW_START_LOCAL_TIME);
  const end = minutesFromHHMM(EVENING_REVIEW_END_LOCAL_TIME);
  const span = Math.max(0, end - start);
  const seed = stableHashInt(
    `${params.userId}:${params.localDate}:daily_review`,
  );
  return hhmmFromMinutes(start + (seed % (span + 1)));
}

function normalizeDayPart(value: unknown): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isLateActionTimeOfDay(value: unknown): boolean {
  return /\b(evening|night|soir|soiree|nuit|coucher|sleep|bed)\b/.test(
    normalizeDayPart(value),
  );
}

function filterScheduleOccurrences(
  schedule: TodayActionOccurrenceSchedule,
  predicate: (
    occurrence:
      TodayActionOccurrenceSchedule["transformations"][number]["occurrences"][
        number
      ],
  ) => boolean,
): TodayActionOccurrenceSchedule {
  return {
    ...schedule,
    transformations: schedule.transformations.flatMap((transformation) => {
      const occurrences = transformation.occurrences.filter(predicate);
      return occurrences.length > 0 ? [{ ...transformation, occurrences }] : [];
    }),
  };
}

function occurrenceCount(schedule: TodayActionOccurrenceSchedule): number {
  return schedule.transformations.reduce(
    (total, transformation) => total + transformation.occurrences.length,
    0,
  );
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

function getSiteUrl(): string {
  return cleanText(
    Deno.env.get("SITE_URL") ?? Deno.env.get("PUBLIC_SITE_URL"),
    "https://app.sophia.app",
  );
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
      ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT,
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

async function cancelFutureWeeklyCheckins(params: {
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
      WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
      WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
    ])
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

async function cancelFutureWeeklyPlanningCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .eq("event_context", WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT)
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

async function cancelFutureWeeklyProgressReviewCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .eq("event_context", WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT)
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
    let actionMorningFollowupScheduled = 0;
    let lightGreetingScheduled = 0;
    let actionEveningReviewScheduled = 0;
    let weeklyPlanningPromptScheduled = 0;
    let weeklyProgressReviewScheduled = 0;
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
        await cancelFutureWeeklyCheckins({
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
        await cancelFutureWeeklyCheckins({
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
        await cancelFutureWeeklyPlanningCheckins({
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
        await cancelFutureWeeklyProgressReviewCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
      }
      if (!allowsMorning && !allowsEvening) {
        await cancelFutureWeeklyCheckins({
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
      const yesterdayScheduleRaw = await loadTodayActionOccurrences(
        supabaseAdmin as any,
        {
          userId,
          timezone,
          localTimeHHMM: TARGET_LOCAL_TIME,
          now: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      );
      const yesterdaySchedule = {
        ...yesterdayScheduleRaw,
        scheduled_for: todaySchedule.scheduled_for,
      };

      const hasActionsToday = todaySchedule.transformations.some((entry) =>
        entry.occurrences.length > 0
      );
      const hasOpenActionsFromYesterday = yesterdaySchedule.transformations
        .some((entry) => entry.occurrences.length > 0);
      const shouldSendLightGreeting = !hasActionsToday &&
        !hasOpenActionsFromYesterday &&
        allowsMorning &&
        await shouldScheduleLightMorningGreeting(supabaseAdmin as any, {
          userId,
          timezone,
          localDate: todaySchedule.local_date,
          now,
        });
      const localWeekday = localWeekdayForTimezone(timezone, now);
      const siteUrl = getSiteUrl();
      const dashboardUrl = weeklyPlanningDashboardUrl(siteUrl);
      // Planning validation must happen after the Sunday weekly review window.
      // Monday morning is the fallback when the user did not resolve it during
      // the weekly conversation.
      const shouldTryWeeklyPlanningPrompt = allowsMorning &&
        localWeekday === "mon";
      const shouldTryWeeklyProgressReview = allowsEvening &&
        localWeekday === "sun";
      const hasAnyCandidate = (allowsMorning &&
        (hasOpenActionsFromYesterday || hasActionsToday ||
          shouldSendLightGreeting)) ||
        (allowsEvening && (hasActionsToday || hasOpenActionsFromYesterday)) ||
        shouldTryWeeklyPlanningPrompt ||
        shouldTryWeeklyProgressReview;

      if (!hasAnyCandidate) {
        skipped++;
        continue;
      }

      candidates++;

      if (
        allowsMorning &&
        (hasOpenActionsFromYesterday || hasActionsToday ||
          shouldSendLightGreeting)
      ) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });

        const eventContext = hasOpenActionsFromYesterday
          ? ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT
          : hasActionsToday
          ? ACTION_MORNING_EVENT_CONTEXT
          : MORNING_LIGHT_GREETING_EVENT_CONTEXT;
        const draftMessage = hasOpenActionsFromYesterday
          ? buildActionMorningFollowupFallbackMessage(yesterdaySchedule)
          : hasActionsToday
          ? buildActionMorningFallbackMessage(todaySchedule)
          : buildLightMorningFallbackMessage();
        const instruction = hasOpenActionsFromYesterday
          ? buildActionMorningFollowupInstruction(yesterdaySchedule)
          : hasActionsToday
          ? buildActionMorningInstruction(todaySchedule)
          : buildLightMorningInstruction();
        const eventGrounding = hasOpenActionsFromYesterday
          ? buildActionMorningFollowupGrounding(yesterdaySchedule)
          : hasActionsToday
          ? buildActionMorningGrounding(todaySchedule)
          : `local_date=${todaySchedule.local_date}\nweekday=${todaySchedule.weekday}\nno_confirmed_action_occurrence=true`;
        const selectedSchedule = hasOpenActionsFromYesterday
          ? yesterdaySchedule
          : todaySchedule;

        const { error: upsertErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: userId,
              origin: hasOpenActionsFromYesterday
                ? "action_followup"
                : "action_morning",
              event_context: eventContext,
              draft_message: draftMessage,
              message_mode: "dynamic",
              message_payload: {
                source: hasOpenActionsFromYesterday
                  ? "schedule_action_morning_followup_v2"
                  : "schedule_action_morning_v2",
                version: 1,
                checkin_kind: hasOpenActionsFromYesterday
                  ? "action_morning_followup"
                  : hasActionsToday
                  ? "action_morning_encouragement"
                  : "morning_light_greeting",
                timezone,
                local_date: selectedSchedule.local_date,
                week_start_date: selectedSchedule.week_start_date,
                weekday: selectedSchedule.weekday,
                reviewed_local_date: hasOpenActionsFromYesterday
                  ? yesterdaySchedule.local_date
                  : null,
                transformations: selectedSchedule.transformations,
                occurrence_ids: selectedSchedule.transformations.flatMap((
                  entry,
                ) =>
                  entry.occurrences.map((occurrence) =>
                    occurrence.occurrence_id
                  )
                ),
                plan_item_ids: selectedSchedule.transformations.flatMap((
                  entry,
                ) =>
                  entry.occurrences.map((occurrence) => occurrence.plan_item_id)
                ),
                instruction,
                event_grounding: eventGrounding,
                chat_capability: "track_progress_only",
                generated_at: nowIso,
              },
              scheduled_for: selectedSchedule.scheduled_for,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          );
        if (upsertErr) {
          console.error(
            `[schedule-whatsapp-v2-checkins] request_id=${requestId} morning_upsert_failed user_id=${userId}`,
            upsertErr,
          );
        } else {
          scheduled++;
          if (hasOpenActionsFromYesterday) {
            actionMorningFollowupScheduled++;
          } else if (hasActionsToday) {
            actionMorningScheduled++;
          } else {
            lightGreetingScheduled++;
          }
        }
      }

      if ((hasActionsToday || hasOpenActionsFromYesterday) && allowsEvening) {
        const eveningReviewLocalTime = randomEveningReviewLocalTime({
          userId,
          localDate: todaySchedule.local_date,
        });
        const eveningSchedule = await loadTodayActionOccurrences(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            localTimeHHMM: eveningReviewLocalTime,
            now,
          },
        );
        const todayEligibleSchedule = filterScheduleOccurrences(
          eveningSchedule,
          (occurrence) => !isLateActionTimeOfDay(occurrence.time_of_day),
        );
        const yesterdayLateScheduleRaw = await loadTodayActionOccurrences(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            localTimeHHMM: eveningReviewLocalTime,
            now: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        );
        const yesterdayLateSchedule = filterScheduleOccurrences(
          {
            ...yesterdayLateScheduleRaw,
            scheduled_for: eveningSchedule.scheduled_for,
          },
          (occurrence) => isLateActionTimeOfDay(occurrence.time_of_day),
        );
        const selectedEveningSchedule =
          occurrenceCount(yesterdayLateSchedule) > 0
            ? yesterdayLateSchedule
            : todayEligibleSchedule;
        const eveningOccurrenceIds = selectedEveningSchedule.transformations
          .flatMap((
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
                draft_message: "",
                message_mode: "dynamic",
                message_payload: {
                  source: "schedule_action_evening_review_v2",
                  version: 2,
                  timezone,
                  local_date: selectedEveningSchedule.local_date,
                  week_start_date: selectedEveningSchedule.week_start_date,
                  weekday: selectedEveningSchedule.weekday,
                  reviewed_local_date: selectedEveningSchedule.local_date,
                  selected_review_window:
                    occurrenceCount(yesterdayLateSchedule) >
                        0
                      ? "previous_evening_or_night"
                      : "today_non_late",
                  evening_review_local_time: eveningReviewLocalTime,
                  transformations: selectedEveningSchedule.transformations,
                  occurrence_ids: eveningOccurrenceIds,
                  plan_item_ids: selectedEveningSchedule.transformations
                    .flatMap((
                      entry,
                    ) =>
                      entry.occurrences.map((occurrence) =>
                        occurrence.plan_item_id
                      )
                    ),
                  generated_at: nowIso,
                },
                scheduled_for: selectedEveningSchedule.scheduled_for,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (eveningErr) {
            console.error(
              `[schedule-whatsapp-v2-checkins] request_id=${requestId} evening_upsert_failed user_id=${userId}`,
              eveningErr,
            );
          } else {
            scheduled++;
            actionEveningReviewScheduled++;
          }
        }
      }

      if (shouldTryWeeklyPlanningPrompt) {
        const localDate = todaySchedule.local_date;
        const targetWeekStartDate = currentWeekStartForTimezone(timezone, now);
        const targetWeekReview = await loadWeeklyProgressReview(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            weekStartDate: targetWeekStartDate,
            now,
            dashboardUrl,
          },
        );
        const targetWeekConfirmedPlanCount = targetWeekReview.transformations
          .reduce(
            (sum, transformation) =>
              sum +
              transformation.summary.planned_count,
            0,
          );
        if (targetWeekConfirmedPlanCount > 0) {
          continue;
        }
        const hasTargetPlanifiableWeek = await hasPlanifiableWeekStart(
          supabaseAdmin as any,
          {
            userId,
            weekStartDate: targetWeekStartDate,
          },
        );
        if (!hasTargetPlanifiableWeek) {
          continue;
        }
        const reviewedWeekStartDate = addDaysYmd(targetWeekStartDate, -7);
        const currentReview = await loadWeeklyProgressReview(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            weekStartDate: reviewedWeekStartDate,
            now,
            dashboardUrl,
          },
        );
        const activeWeeklyPlanCount = currentReview.transformations.reduce(
          (sum, transformation) => sum + transformation.summary.planned_count,
          0,
        );
        if (activeWeeklyPlanCount === 0) {
          continue;
        }
        const scheduledFor = computeScheduledForFromLocal({
          timezone,
          dayOffset: 0,
          localTimeHHMM: WEEKLY_PLANNING_PROMPT_LOCAL_TIME,
          now,
        });
        const draftMessage = buildWeeklyPlanningValidationMessage({
          nextWeekStartDate: targetWeekStartDate,
          dashboardUrl,
        });
        const { error: weeklyPlanningErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: userId,
              origin: "weekly_planning",
              event_context: WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
              draft_message: draftMessage,
              message_mode: "static",
              message_payload: {
                source: "schedule_weekly_planning_validation_prompt_v2",
                version: 1,
                timezone,
                local_date: localDate,
                next_week_start_date: targetWeekStartDate,
                unlocked_after_weekly_review: true,
                dashboard_url: dashboardUrl,
                generated_at: nowIso,
              },
              scheduled_for: scheduledFor,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          );
        if (weeklyPlanningErr) {
          console.error(
            `[schedule-whatsapp-v2-checkins] request_id=${requestId} weekly_planning_upsert_failed user_id=${userId}`,
            weeklyPlanningErr,
          );
        } else {
          scheduled++;
          weeklyPlanningPromptScheduled++;
        }
      }

      if (shouldTryWeeklyProgressReview) {
        const weekStartDate = currentWeekStartForTimezone(timezone, now);
        const review = await loadWeeklyProgressReview(supabaseAdmin as any, {
          userId,
          timezone,
          weekStartDate,
          now,
          dashboardUrl,
        });
        const plannedCount = review.transformations.reduce(
          (sum, transformation) => sum + transformation.summary.planned_count,
          0,
        );
        if (plannedCount > 0) {
          const scheduledFor = computeScheduledForFromLocal({
            timezone,
            dayOffset: 0,
            localTimeHHMM: WEEKLY_PROGRESS_REVIEW_LOCAL_TIME,
            now,
          });
          const summary = review.transformations.reduce(
            (acc, transformation) => {
              acc.done += transformation.summary.done_count;
              acc.partial += transformation.summary.partial_count;
              acc.missed += transformation.summary.missed_count;
              acc.planned += transformation.summary.planned_count;
              return acc;
            },
            { done: 0, partial: 0, missed: 0, planned: 0 },
          );
          const { error: weeklyReviewErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "weekly_review",
                event_context: WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
                draft_message: buildWeeklyProgressReviewFallbackMessage(
                  summary,
                ),
                message_mode: "dynamic",
                message_payload: {
                  source: "schedule_weekly_progress_review_v2",
                  version: 1,
                  timezone,
                  week_start_date: review.week_start_date,
                  week_end_date: review.week_end_date,
                  dashboard_url: dashboardUrl,
                  weekly_progress_review: review,
                  instruction: buildWeeklyProgressReviewInstruction(review),
                  event_grounding: buildWeeklyProgressReviewGrounding(review),
                  generated_at: nowIso,
                },
                scheduled_for: scheduledFor,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (weeklyReviewErr) {
            console.error(
              `[schedule-whatsapp-v2-checkins] request_id=${requestId} weekly_review_upsert_failed user_id=${userId}`,
              weeklyReviewErr,
            );
          } else {
            scheduled++;
            weeklyProgressReviewScheduled++;
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
        action_morning_followup_scheduled: actionMorningFollowupScheduled,
        light_greeting_scheduled: lightGreetingScheduled,
        action_evening_review_scheduled: actionEveningReviewScheduled,
        weekly_planning_prompt_scheduled: weeklyPlanningPromptScheduled,
        weekly_progress_review_scheduled: weeklyProgressReviewScheduled,
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
      `[schedule-whatsapp-v2-checkins] request_id=${requestId}`,
      error,
    );
    await logEdgeFunctionError({
      functionName: "schedule-whatsapp-v2-checkins",
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

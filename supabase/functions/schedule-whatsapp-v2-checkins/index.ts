/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import {
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
  ACTION_LATE_AFTERNOON_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  ACTION_NIGHT_PREP_EVENT_CONTEXT,
  buildActionLateAfternoonFallbackMessage,
  buildActionLateAfternoonInstruction,
  buildActionMorningFallbackMessage,
  buildActionMorningGrounding,
  buildActionMorningInstruction,
  buildActionNightPrepFallbackMessage,
  buildActionNightPrepGrounding,
  buildActionNightPrepInstruction,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  loadTodayActionOccurrences,
  localDateYmdInTimezone,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
  shouldScheduleLightMorningGreeting,
  type TodayActionOccurrenceSchedule,
} from "../_shared/action_occurrences.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import {
  isEveningActionTimeOfDay,
  isLateActionTimeOfDay,
  isMorningSlotTimeOfDay,
  isNightActionTimeOfDay,
  isWakeUpTimeOfDay,
} from "../_shared/time_of_day.ts";
import {
  randomEveningReviewLocalTime,
  randomLateAfternoonNudgeLocalTime,
  randomMorningEncouragementLocalTime,
  randomNightPrepLocalTime,
} from "../_shared/proactive_checkin_timing.ts";
import {
  BIRTHDAY_GREETING_EVENING_LOCAL_TIME,
  BIRTHDAY_GREETING_MORNING_LOCAL_TIME,
  birthdayGreetingEventContext,
  birthdayGreetingScheduledFor,
  birthdayMatchesLocalDate,
  buildBirthdayGreetingMessage,
} from "../_shared/birthday_checkins.ts";
import {
  listMorningNudgeEventContexts,
} from "../sophia-brain/momentum_morning_nudge.ts";
import {
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

const MORNING_ENCOURAGEMENT_START_LOCAL_TIME = "08:00";
const WEEKLY_PLANNING_PROMPT_LOCAL_TIME = "10:30";
const WEEKLY_PROGRESS_REVIEW_LOCAL_TIME = "18:30";
const MORNING_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];
const LEGACY_ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT =
  "action_morning_followup_v2";
const EVENING_REVIEW_SUPPRESSES_MORNING_FOLLOWUP_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
  "sent",
];

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
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

async function loadOccurrenceIdsCoveredByEveningReview(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  reviewedLocalDate: string;
}): Promise<Set<string>> {
  const { data, error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .select("message_payload")
    .eq("user_id", params.userId)
    .eq("event_context", ACTION_EVENING_REVIEW_EVENT_CONTEXT)
    .contains("message_payload", {
      reviewed_local_date: params.reviewedLocalDate,
    })
    .in("status", EVENING_REVIEW_SUPPRESSES_MORNING_FOLLOWUP_STATUSES)
    .limit(50);

  if (error) throw error;

  const occurrenceIds = new Set<string>();
  for (const row of data ?? []) {
    const payload = (row as { message_payload?: Record<string, unknown> })
      .message_payload ?? {};
    const ids = Array.isArray(payload.occurrence_ids)
      ? payload.occurrence_ids
      : [];
    for (const id of ids) {
      const occurrenceId = cleanText(id);
      if (occurrenceId) occurrenceIds.add(occurrenceId);
    }
  }

  return occurrenceIds;
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

function isWhatsappSchedulingTierEligible(
  accessTierRaw: unknown,
  trialEndRaw?: unknown,
): boolean {
  const tier = cleanText(accessTierRaw).toLowerCase();
  if (tier === "alliance" || tier === "architecte") return true;
  if (tier !== "trial") return false;

  const trialEnd = cleanText(trialEndRaw);
  if (!trialEnd) return true;
  const trialEndMs = new Date(trialEnd).getTime();
  return Number.isFinite(trialEndMs) && trialEndMs > Date.now();
}

function getSiteUrl(): string {
  // APP_BASE_URL is the canonical frontend URL (required by the Stripe
  // functions, so it is always set per-project). Prefer it so WhatsApp links
  // never silently fall back to the hardcoded prod domain on staging.
  return cleanText(
    Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL"),
    "https://app.sophia.app",
  );
}

async function hasActiveBirthdayGreetingForEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  eventContext: string;
}): Promise<boolean> {
  const { data, error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .select("id")
    .eq("user_id", params.userId)
    .eq("event_context", params.eventContext)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function hasActiveWeeklyPlanningPromptForWeek(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  targetWeekStartDate: string;
}): Promise<boolean> {
  const { data, error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .select("id,message_payload")
    .eq("user_id", params.userId)
    .eq("event_context", WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(50);
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).some((row) => {
    const payload = (row as any)?.message_payload ?? {};
    return cleanText(payload?.target_week_start_date) ===
        params.targetWeekStartDate ||
      cleanText(payload?.next_week_start_date) === params.targetWeekStartDate ||
      cleanText(payload?.week_start_date) === params.targetWeekStartDate;
  });
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
      LEGACY_ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT,
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

async function cancelPendingWhatsappCoachingCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  reason: string;
}): Promise<void> {
  const { error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: params.nowIso,
      delivery_last_error: params.reason,
      delivery_last_error_at: params.nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("status", ["pending", "retrying", "awaiting_user"] as any)
    // Les rappels ponctuels demandés par le user (chat, tous canaux) ne sont
    // pas du coaching WhatsApp: l'inéligibilité ne doit jamais les annuler
    // (disparitions Nina/Rose/Eva du 12/07, chantier P0).
    .not("event_context", "like", "one_shot_reminder:%");
  if (error) throw error;

  const { error: pendingActionsError } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .update({
      status: "cancelled",
      processed_at: params.nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("kind", [
      "deferred_send",
      "scheduled_checkin",
      "proactive_template_candidate",
    ] as any)
    .eq("status", "pending");
  if (pendingActionsError) throw pendingActionsError;
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

    // RGPD: accounts pending deletion are excluded from all proactive processing.
    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select(
        "id,full_name,birth_date,timezone,whatsapp_opted_in,whatsapp_coaching_paused_until,access_tier,trial_start,trial_end",
      )
      .neq("account_status", "deletion_pending")
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
    let actionLateAfternoonScheduled = 0;
    let actionNightPrepScheduled = 0;
    let weeklyPlanningPromptScheduled = 0;
    let weeklyProgressReviewScheduled = 0;
    let weeklyProgressReviewSkippedNewUser = 0;
    let birthdayGreetingScheduled = 0;
    let skipped = 0;
    let candidates = 0;

    for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
      const userId = cleanText(profile.id);
      if (!userId) continue;

      const now = new Date();
      const nowIso = now.toISOString();
      const timezone = cleanText(profile.timezone, "Europe/Paris");
      const localDate = localDateYmdInTimezone(timezone, now);
      const trialStartIso = cleanText(profile.trial_start);
      const isAccountCreatedToday = trialStartIso
        ? localDateYmdInTimezone(timezone, new Date(trialStartIso)) ===
          localDate
        : false;

      if (!Boolean(profile.whatsapp_opted_in)) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: "whatsapp_not_opted_in",
        });
        skipped++;
        continue;
      }

      const pauseUntilIso = cleanText(profile.whatsapp_coaching_paused_until);
      const pauseUntilMs = pauseUntilIso
        ? new Date(pauseUntilIso).getTime()
        : NaN;
      if (Number.isFinite(pauseUntilMs) && pauseUntilMs > Date.now()) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: "whatsapp_coaching_paused",
        });
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

      if (
        !isWhatsappSchedulingTierEligible(
          profile.access_tier,
          profile.trial_end,
        )
      ) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: `whatsapp_coaching_access_paused:${
            cleanText(profile.access_tier).toLowerCase() || "none"
          }`,
        });
        skipped++;
        continue;
      }

      const allowsMorning = true;
      const allowsEvening = true;

      const todayScheduleRaw = await loadTodayActionOccurrences(
        supabaseAdmin as any,
        {
          userId,
          timezone,
          localTimeHHMM: MORNING_ENCOURAGEMENT_START_LOCAL_TIME,
          now,
        },
      );
      const morningEncouragementLocalTime = randomMorningEncouragementLocalTime(
        {
          userId,
          localDate: todayScheduleRaw.local_date,
        },
      );
      const todaySchedule = {
        ...todayScheduleRaw,
        scheduled_for: computeScheduledForFromLocal({
          timezone,
          dayOffset: 0,
          localTimeHHMM: morningEncouragementLocalTime,
          now,
        }),
      };
      const canScheduleMorningToday =
        new Date(todaySchedule.scheduled_for).getTime() > now.getTime();
      const yesterdayScheduleRaw = await loadTodayActionOccurrences(
        supabaseAdmin as any,
        {
          userId,
          timezone,
          localTimeHHMM: MORNING_ENCOURAGEMENT_START_LOCAL_TIME,
          now: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      );
      let yesterdaySchedule = {
        ...yesterdayScheduleRaw,
        scheduled_for: todaySchedule.scheduled_for,
      };
      const eveningReviewedOccurrenceIds =
        await loadOccurrenceIdsCoveredByEveningReview({
          supabaseAdmin,
          userId,
          reviewedLocalDate: yesterdaySchedule.local_date,
        });
      if (eveningReviewedOccurrenceIds.size > 0) {
        yesterdaySchedule = filterScheduleOccurrences(
          yesterdaySchedule,
          (occurrence) =>
            !eveningReviewedOccurrenceIds.has(occurrence.occurrence_id),
        );
      }

      const hasActionsToday = todaySchedule.transformations.some((entry) =>
        entry.occurrences.length > 0
      );
      // Créneau du matin: seulement les actions du matin/après-midi/anytime.
      // Les actions soir (evening), nuit (night) et réveil (wake_up) ont leur
      // propre créneau (fin d'après-midi ou ~21h35) — les encourager le matin
      // tombe à côté du moment de levier.
      const morningSlotSchedule = filterScheduleOccurrences(
        todaySchedule,
        (occurrence) => isMorningSlotTimeOfDay(occurrence.time_of_day),
      );
      const hasMorningSlotActions = occurrenceCount(morningSlotSchedule) > 0;
      const hasOpenActionsFromYesterday = yesterdaySchedule.transformations
        .some((entry) => entry.occurrences.length > 0);
      // Pré-engagement wake_up: les actions au réveil de DEMAIN se nudgent la
      // veille au soir (~21h35), jamais le matin même (trop tard).
      const nightPrepLocalTime = randomNightPrepLocalTime({
        userId,
        localDate: todaySchedule.local_date,
      });
      const nightPrepScheduledFor = computeScheduledForFromLocal({
        timezone,
        dayOffset: 0,
        localTimeHHMM: nightPrepLocalTime,
        now,
      });
      const tomorrowScheduleRaw = await loadTodayActionOccurrences(
        supabaseAdmin as any,
        {
          userId,
          timezone,
          localTimeHHMM: MORNING_ENCOURAGEMENT_START_LOCAL_TIME,
          now: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      );
      const tomorrowWakeUpSchedule = filterScheduleOccurrences(
        {
          ...tomorrowScheduleRaw,
          scheduled_for: nightPrepScheduledFor,
        },
        (occurrence) => isWakeUpTimeOfDay(occurrence.time_of_day),
      );
      const hasTomorrowWakeUpActions =
        occurrenceCount(tomorrowWakeUpSchedule) > 0;
      const shouldSendLightGreeting = canScheduleMorningToday &&
        !hasActionsToday &&
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
      const birthdayMatch = birthdayMatchesLocalDate({
        birthDate: profile.birth_date,
        timezone,
        now,
      });
      const shouldTryBirthdayGreeting = birthdayMatch.matches &&
        (allowsMorning || allowsEvening);
      const hasAnyCandidate = (allowsMorning && canScheduleMorningToday &&
        (hasMorningSlotActions || shouldSendLightGreeting)) ||
        (allowsEvening &&
          (hasActionsToday || hasOpenActionsFromYesterday ||
            hasTomorrowWakeUpActions)) ||
        shouldTryWeeklyPlanningPrompt ||
        shouldTryWeeklyProgressReview ||
        shouldTryBirthdayGreeting;

      if (!hasAnyCandidate) {
        skipped++;
        continue;
      }

      candidates++;

      if (shouldTryBirthdayGreeting) {
        const birthdayEventContext = birthdayGreetingEventContext(
          birthdayMatch.localDate,
        );
        const alreadyScheduled = await hasActiveBirthdayGreetingForEvent({
          supabaseAdmin,
          userId,
          eventContext: birthdayEventContext,
        });
        if (!alreadyScheduled) {
          const birthdayLocalTime = allowsMorning
            ? BIRTHDAY_GREETING_MORNING_LOCAL_TIME
            : BIRTHDAY_GREETING_EVENING_LOCAL_TIME;
          const scheduledFor = birthdayGreetingScheduledFor({
            timezone,
            localTimeHHMM: birthdayLocalTime,
            now,
          });
          const draftMessage = buildBirthdayGreetingMessage({
            fullName: profile.full_name,
          });
          const { error: birthdayErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "unknown",
                event_context: birthdayEventContext,
                draft_message: draftMessage,
                message_mode: "static",
                message_payload: {
                  source: "schedule_birthday_greeting_v1",
                  version: 1,
                  checkin_kind: "birthday_greeting",
                  timezone,
                  birthday_local_date: birthdayMatch.localDate,
                  birthday_local_time: birthdayLocalTime,
                  birth_month_day: birthdayMatch.birthMonthDay,
                  generated_at: nowIso,
                },
                scheduled_for: scheduledFor,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (birthdayErr) {
            console.error(
              `[schedule-whatsapp-v2-checkins] request_id=${requestId} birthday_upsert_failed user_id=${userId}`,
              birthdayErr,
            );
          } else {
            scheduled++;
            birthdayGreetingScheduled++;
          }
        }
      }

      if (
        allowsMorning &&
        canScheduleMorningToday &&
        (hasMorningSlotActions || shouldSendLightGreeting)
      ) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });

        const eventContext = hasMorningSlotActions
          ? ACTION_MORNING_EVENT_CONTEXT
          : MORNING_LIGHT_GREETING_EVENT_CONTEXT;
        const draftMessage = hasMorningSlotActions
          ? buildActionMorningFallbackMessage(morningSlotSchedule)
          : buildLightMorningFallbackMessage();
        const instruction = hasMorningSlotActions
          ? buildActionMorningInstruction(morningSlotSchedule)
          : buildLightMorningInstruction();
        const eventGrounding = hasMorningSlotActions
          ? buildActionMorningGrounding(morningSlotSchedule)
          : `local_date=${todaySchedule.local_date}\nweekday=${todaySchedule.weekday}\nno_confirmed_action_occurrence=true`;
        const selectedSchedule = morningSlotSchedule;

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
                checkin_kind: hasMorningSlotActions
                  ? "action_morning_encouragement"
                  : "morning_light_greeting",
                timezone,
                local_date: selectedSchedule.local_date,
                week_start_date: selectedSchedule.week_start_date,
                weekday: selectedSchedule.weekday,
                reviewed_local_date: null,
                morning_encouragement_local_time: morningEncouragementLocalTime,
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
          if (hasMorningSlotActions) {
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

      // Créneau fin d'après-midi (~16h45-17h45): nudge des actions du SOIR
      // (time_of_day=evening) avant que la soirée commence.
      if (allowsEvening && hasActionsToday) {
        const lateAfternoonLocalTime = randomLateAfternoonNudgeLocalTime({
          userId,
          localDate: todaySchedule.local_date,
        });
        const lateAfternoonBase = await loadTodayActionOccurrences(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            localTimeHHMM: lateAfternoonLocalTime,
            now,
          },
        );
        const lateAfternoonSchedule = filterScheduleOccurrences(
          lateAfternoonBase,
          (occurrence) => isEveningActionTimeOfDay(occurrence.time_of_day),
        );
        const lateAfternoonOccurrenceIds = lateAfternoonSchedule
          .transformations
          .flatMap((entry) =>
            entry.occurrences.map((occurrence) => occurrence.occurrence_id)
          );
        const canScheduleLateAfternoon =
          new Date(lateAfternoonSchedule.scheduled_for).getTime() >
            now.getTime();
        if (canScheduleLateAfternoon && lateAfternoonOccurrenceIds.length > 0) {
          const { error: lateAfternoonErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "action_late_afternoon",
                event_context: ACTION_LATE_AFTERNOON_EVENT_CONTEXT,
                draft_message: buildActionLateAfternoonFallbackMessage(
                  lateAfternoonSchedule,
                ),
                message_mode: "dynamic",
                message_payload: {
                  source: "schedule_action_late_afternoon_v1",
                  version: 1,
                  checkin_kind: "action_late_afternoon_encouragement",
                  timezone,
                  local_date: lateAfternoonSchedule.local_date,
                  week_start_date: lateAfternoonSchedule.week_start_date,
                  weekday: lateAfternoonSchedule.weekday,
                  reviewed_local_date: null,
                  late_afternoon_local_time: lateAfternoonLocalTime,
                  transformations: lateAfternoonSchedule.transformations,
                  occurrence_ids: lateAfternoonOccurrenceIds,
                  plan_item_ids: lateAfternoonSchedule.transformations
                    .flatMap((entry) =>
                      entry.occurrences.map((occurrence) =>
                        occurrence.plan_item_id
                      )
                    ),
                  instruction: buildActionLateAfternoonInstruction(
                    lateAfternoonSchedule,
                  ),
                  event_grounding: buildActionMorningGrounding(
                    lateAfternoonSchedule,
                  ),
                  chat_capability: "track_progress_only",
                  generated_at: nowIso,
                },
                scheduled_for: lateAfternoonSchedule.scheduled_for,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (lateAfternoonErr) {
            console.error(
              `[schedule-whatsapp-v2-checkins] request_id=${requestId} late_afternoon_upsert_failed user_id=${userId}`,
              lateAfternoonErr,
            );
          } else {
            scheduled++;
            actionLateAfternoonScheduled++;
          }
        }
      }

      // Créneau ~21h35-22h: actions de NUIT de ce soir (time_of_day=night) +
      // pré-engagement des actions au RÉVEIL de demain (time_of_day=wake_up).
      // Fenêtre volontairement après la fin de la review du soir (21h30).
      if (allowsEvening && (hasActionsToday || hasTomorrowWakeUpActions)) {
        const nightBase = await loadTodayActionOccurrences(
          supabaseAdmin as any,
          {
            userId,
            timezone,
            localTimeHHMM: nightPrepLocalTime,
            now,
          },
        );
        const nightSchedule = filterScheduleOccurrences(
          nightBase,
          (occurrence) => isNightActionTimeOfDay(occurrence.time_of_day),
        );
        const nightOccurrenceIds = nightSchedule.transformations
          .flatMap((entry) =>
            entry.occurrences.map((occurrence) => occurrence.occurrence_id)
          );
        const wakeUpOccurrenceIds = tomorrowWakeUpSchedule.transformations
          .flatMap((entry) =>
            entry.occurrences.map((occurrence) => occurrence.occurrence_id)
          );
        const nightPrepOccurrenceIds = [
          ...nightOccurrenceIds,
          ...wakeUpOccurrenceIds,
        ];
        const canScheduleNightPrep =
          new Date(nightPrepScheduledFor).getTime() > now.getTime();
        if (canScheduleNightPrep && nightPrepOccurrenceIds.length > 0) {
          const { error: nightPrepErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "action_night_prep",
                event_context: ACTION_NIGHT_PREP_EVENT_CONTEXT,
                draft_message: buildActionNightPrepFallbackMessage({
                  nightSchedule,
                  wakeUpSchedule: tomorrowWakeUpSchedule,
                }),
                message_mode: "dynamic",
                message_payload: {
                  source: "schedule_action_night_prep_v1",
                  version: 1,
                  checkin_kind: "action_night_prep",
                  timezone,
                  local_date: nightBase.local_date,
                  week_start_date: nightBase.week_start_date,
                  weekday: nightBase.weekday,
                  reviewed_local_date: null,
                  night_prep_local_time: nightPrepLocalTime,
                  transformations: [
                    ...nightSchedule.transformations,
                    ...tomorrowWakeUpSchedule.transformations,
                  ],
                  occurrence_ids: nightPrepOccurrenceIds,
                  night_occurrence_ids: nightOccurrenceIds,
                  wake_up_occurrence_ids: wakeUpOccurrenceIds,
                  plan_item_ids: [
                    ...nightSchedule.transformations,
                    ...tomorrowWakeUpSchedule.transformations,
                  ].flatMap((entry) =>
                    entry.occurrences.map((occurrence) =>
                      occurrence.plan_item_id
                    )
                  ),
                  instruction: buildActionNightPrepInstruction({
                    nightSchedule,
                    wakeUpSchedule: tomorrowWakeUpSchedule,
                  }),
                  event_grounding: buildActionNightPrepGrounding({
                    localDate: nightBase.local_date,
                    weekday: nightBase.weekday,
                    nightSchedule,
                    wakeUpSchedule: tomorrowWakeUpSchedule,
                  }),
                  chat_capability: "track_progress_only",
                  generated_at: nowIso,
                },
                scheduled_for: nightPrepScheduledFor,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (nightPrepErr) {
            console.error(
              `[schedule-whatsapp-v2-checkins] request_id=${requestId} night_prep_upsert_failed user_id=${userId}`,
              nightPrepErr,
            );
          } else {
            scheduled++;
            actionNightPrepScheduled++;
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
        const hasExistingPlanningPrompt =
          await hasActiveWeeklyPlanningPromptForWeek({
            supabaseAdmin,
            userId,
            targetWeekStartDate,
          });
        if (hasExistingPlanningPrompt) {
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
        if (isAccountCreatedToday) {
          weeklyProgressReviewSkippedNewUser++;
          continue;
        }
        const weekStartDate = currentWeekStartForTimezone(timezone, now);
        const review = await loadWeeklyProgressReview(supabaseAdmin as any, {
          userId,
          timezone,
          weekStartDate,
          now,
          dashboardUrl,
        });
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

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        action_morning_scheduled: actionMorningScheduled,
        action_morning_followup_scheduled: actionMorningFollowupScheduled,
        light_greeting_scheduled: lightGreetingScheduled,
        action_evening_review_scheduled: actionEveningReviewScheduled,
        action_late_afternoon_scheduled: actionLateAfternoonScheduled,
        action_night_prep_scheduled: actionNightPrepScheduled,
        weekly_planning_prompt_scheduled: weeklyPlanningPromptScheduled,
        weekly_progress_review_scheduled: weeklyProgressReviewScheduled,
        weekly_progress_review_skipped_new_user:
          weeklyProgressReviewSkippedNewUser,
        birthday_greeting_scheduled: birthdayGreetingScheduled,
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

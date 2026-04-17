/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import {
  getActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import {
  allowsContactWindow,
  getUserRelationPreferences,
} from "../sophia-brain/relation_preferences_engine.ts";
import {
  listMorningNudgeEventContexts,
  MORNING_NUDGE_V2_EVENT_CONTEXT,
} from "../sophia-brain/momentum_morning_nudge.ts";
import { getUserState } from "../sophia-brain/state-manager.ts";
import {
  createRendezVousFromProactiveDecision,
  resolveRendezVousDecisionForRuntime,
} from "../sophia-brain/rendez_vous_decision.ts";

const TARGET_LOCAL_TIME = "07:00";
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

function weekdayKeyInTimezone(params: {
  timezone: string;
  dayOffset: number;
  now?: Date;
}): string {
  const timezone = cleanText(params.timezone, "Europe/Paris");
  const target = new Date(
    (params.now ?? new Date()).getTime() +
      Math.max(0, params.dayOffset) * 24 * 60 * 60 * 1000,
  );
  const short = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(target).toLowerCase().slice(0, 3);
  const map: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };
  return map[short] ?? "mon";
}

function localMinutesInTimezone(
  timezoneRaw: unknown,
  now = new Date(),
): number {
  const timezone = cleanText(timezoneRaw, "Europe/Paris");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return (Number.isFinite(hour) ? hour : 0) * 60 +
    (Number.isFinite(minute) ? minute : 0);
}

function isMorningEligiblePlanItem(item: PlanItemRuntimeRow): boolean {
  return item.status === "active" || item.status === "in_maintenance" ||
    item.status === "stalled";
}

function scheduledDays(item: PlanItemRuntimeRow): string[] {
  return Array.isArray(item.scheduled_days)
    ? item.scheduled_days.map((day) => cleanText(day).toLowerCase()).filter(
      Boolean,
    )
    : [];
}

function isPlanItemRelevantOnWeekday(
  item: PlanItemRuntimeRow,
  weekdayKey: string,
): boolean {
  const days = scheduledDays(item);
  return days.length === 0 || days.includes(weekdayKey);
}

function buildFallbackDraft(titles: string[]): string {
  if (titles.length === 0) {
    return "Je passe te laisser un point d'appui simple pour aujourd'hui.";
  }
  if (titles.length === 1) {
    return `Je passe te laisser un point d'appui simple pour aujourd'hui autour de ${
      titles[0]
    }.`;
  }
  return `Je passe te laisser un point d'appui simple pour aujourd'hui autour de ${
    titles.slice(0, 2).join(" et ")
  }.`;
}

function findNextMorningSlot(params: {
  timezone: string;
  planItems: PlanItemRuntimeRow[];
  now?: Date;
}): {
  dayOffset: number;
  weekdayKey: string;
  scheduledFor: string;
  todayPlanItems: PlanItemRuntimeRow[];
  activePlanItems: PlanItemRuntimeRow[];
} | null {
  const now = params.now ?? new Date();
  const activePlanItems = params.planItems.filter(isMorningEligiblePlanItem);
  if (activePlanItems.length === 0) return null;

  const startOffset = localMinutesInTimezone(params.timezone, now) < 7 * 60
    ? 0
    : 1;

  for (let dayOffset = startOffset; dayOffset < startOffset + 7; dayOffset++) {
    const weekdayKey = weekdayKeyInTimezone({
      timezone: params.timezone,
      dayOffset,
      now,
    });
    const todayPlanItems = activePlanItems.filter((item) =>
      isPlanItemRelevantOnWeekday(item, weekdayKey)
    );
    if (todayPlanItems.length === 0) continue;
    return {
      dayOffset,
      weekdayKey,
      scheduledFor: computeScheduledForFromLocal({
        timezone: params.timezone,
        dayOffset,
        localTimeHHMM: TARGET_LOCAL_TIME,
        now,
      }),
      todayPlanItems,
      activePlanItems,
    };
  }

  return null;
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
    .in("event_context", listMorningNudgeEventContexts())
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
    let rendezVousCreated = 0;
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
        skipped++;
        continue;
      }

      if (fullReset) {
        await cancelFutureMorningCheckins({
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
      if (!allowsContactWindow(relationPreferences, "morning")) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
        skipped++;
        continue;
      }

      const runtime = await getActiveTransformationRuntime(
        supabaseAdmin as any,
        userId,
      );
      if (!runtime.plan) {
        skipped++;
        continue;
      }

      const planItems = await getPlanItemRuntime(
        supabaseAdmin as any,
        runtime.plan.id,
      );
      const slot = findNextMorningSlot({
        timezone,
        planItems,
        now,
      });
      if (!slot) {
        skipped++;
        continue;
      }

      const chatState = await getUserState(
        supabaseAdmin as any,
        userId,
        "whatsapp",
      ).catch(() => ({ temp_memory: {} }));
      let proactiveResolution:
        | Awaited<ReturnType<typeof resolveRendezVousDecisionForRuntime>>
        | null = null;
      try {
        proactiveResolution = await resolveRendezVousDecisionForRuntime({
          supabase: supabaseAdmin as any,
          userId,
          runtime,
          planItems,
          tempMemory: (chatState as Record<string, unknown>)?.temp_memory ?? {},
          timezone,
          nowIso: slot.scheduledFor,
          relationPreferences,
        });
      } catch (error) {
        console.warn(
          `[schedule-morning-active-action-checkins] request_id=${requestId} proactive_resolution_failed user_id=${userId}`,
          error,
        );
      }

      if (proactiveResolution?.proactiveOutput.decision === "skip") {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
        skipped++;
        continue;
      }

      candidates++;
      await cancelFutureMorningCheckins({
        supabaseAdmin,
        userId,
        nowIso,
      });

      if (proactiveResolution?.decision.type === "rendez_vous") {
        try {
          await createRendezVousFromProactiveDecision(
            supabaseAdmin as any,
            proactiveResolution.decision,
            {
              ...proactiveResolution.proactiveOutput,
              scheduled_for: slot.scheduledFor,
            },
            proactiveResolution.context,
          );
          rendezVousCreated++;
          continue;
        } catch (error) {
          console.warn(
            `[schedule-morning-active-action-checkins] request_id=${requestId} rendez_vous_creation_failed user_id=${userId}`,
            error,
          );
        }
      }

      const predictedTodayIds = slot.todayPlanItems.map((item) => item.id);
      const predictedTodayTitles = slot.todayPlanItems.map((item) =>
        item.title
      );
      const activePlanItemTitles = slot.activePlanItems.map((item) =>
        item.title
      );

      const { error: upsertErr } = await supabaseAdmin
        .from("scheduled_checkins")
        .upsert(
          {
            user_id: userId,
            origin: "rendez_vous",
            event_context: MORNING_NUDGE_V2_EVENT_CONTEXT,
            draft_message: buildFallbackDraft(predictedTodayTitles),
            message_mode: "dynamic",
            message_payload: {
              source: "schedule_morning_nudge_v2",
              version: 2,
              timezone,
              cycle_id: runtime.cycle?.id ?? null,
              transformation_id: runtime.transformation?.id ?? null,
              plan_id: runtime.plan.id,
              slot_day_offset: slot.dayOffset,
              slot_weekday: slot.weekdayKey,
              predicted_today_plan_item_ids: predictedTodayIds,
              predicted_today_plan_item_titles: predictedTodayTitles,
              predicted_active_plan_item_titles: activePlanItemTitles,
              generated_at: nowIso,
            },
            scheduled_for: slot.scheduledFor,
            status: "pending",
          } as any,
          { onConflict: "user_id,event_context,scheduled_for" },
        );
      if (upsertErr) {
        console.error(
          `[schedule-morning-active-action-checkins] request_id=${requestId} upsert_failed user_id=${userId}`,
          upsertErr,
        );
        continue;
      }

      scheduled++;
    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        rendez_vous_created: rendezVousCreated,
        skipped,
        candidates,
        request_id: requestId,
        user_id: userIdFilter || null,
        event_context: MORNING_NUDGE_V2_EVENT_CONTEXT,
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

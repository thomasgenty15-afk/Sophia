/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { logMomentumObservabilityEvent } from "../_shared/momentum-observability.ts";
import {
  enqueueProactiveTemplateCandidate,
  PROACTIVE_TEMPLATE_CANDIDATE_KIND,
  proactiveTemplatePriorityForPurpose,
} from "../_shared/proactive_template_queue.ts";
import { evaluateWhatsAppWinback } from "../_shared/whatsapp_winback.ts";
import { computeNextRetryAtIso } from "../_shared/whatsapp_outbound_tracking.ts";
import {
  ACCESS_ENDED_NOTIFICATION_KIND,
  ACCESS_REACTIVATION_OFFER_KIND,
  accessEndedPurpose,
  buildAccessEndedInitialMessage,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_whatsapp.ts";
import {
  allowRelaunchGreetingFromLastMessage,
  applyScheduledCheckinGreetingPolicy,
  applyWhatsappProactiveOpeningPolicy,
  computeScheduledForFromLocal,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts";
import {
  ACTION_EVENING_REVIEW_BUTTONS,
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  buildActionEveningReviewMessageFromTitles,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
} from "../_shared/action_occurrences.ts";
import {
  getMomentumOutreachStateFromEventContext,
  isMomentumOutreachEventContext,
} from "../sophia-brain/momentum_outreach.ts";
import {
  buildMomentumMorningPlan,
  isMorningNudgeEventContext,
  resolveMorningNudgePlanV2,
} from "../sophia-brain/momentum_morning_nudge.ts";
import {
  getUserState,
  updateUserState,
} from "../sophia-brain/state-manager.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  readRepairMode,
  recordSoftContact,
  writeRepairMode,
} from "../sophia-brain/repair_mode_engine.ts";
import { transitionRendezVous } from "../_shared/v2-rendez-vous.ts";
import { registerRendezVousRefusal } from "../sophia-brain/rendez_vous_decision.ts";

console.log("Process Checkins: Function initialized");

const QUIET_WINDOW_MINUTES = Number.parseInt(
  (Deno.env.get("WHATSAPP_QUIET_WINDOW_MINUTES") ?? "").trim() || "20",
  10,
);
const RECURRING_REMINDER_TEMPLATE_MONTHLY_LIMIT = 5;
const RECURRING_REMINDER_TEMPLATE_QUOTA_KEY = "recurring_reminder_template";
const RECURRING_REMINDER_TEMPLATE_MIN_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

type ActionEveningReviewTarget = {
  occurrence_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  title: string;
  kind: string;
  tracking_type: string | null;
};

function morningPlanStrategy(plan: any): string | null {
  return cleanText(plan?.posture ?? plan?.strategy) || null;
}

function morningPlanPosture(plan: any): string | null {
  return cleanText(plan?.posture) || null;
}

function morningPlanConfidence(plan: any): string | null {
  return cleanText(plan?.confidence) || null;
}

function morningPlanTargetIds(plan: any): string[] {
  return parseStringArray(plan?.target_plan_item_ids);
}

function morningPlanTargetTitles(plan: any): string[] {
  return parseStringArray(plan?.target_plan_item_titles);
}

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  return supabaseUrl.replace(/\/+$/, "");
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret();
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET");
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        `whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`,
      );
      (err as any).status = res.status;
      (err as any).data = data;
      throw err;
    }
    return data;
  } catch (error) {
    if ((error as any)?.status != null) throw error;
    const err = new Error(
      `whatsapp-send internal request failed: ${
        (error as any)?.message ?? String(error)
      }`,
    );
    (err as any).status = null;
    (err as any).data = null;
    throw err;
  }
}

function shouldRetryScheduledCheckinDelivery(
  status: number | null | undefined,
): boolean {
  if (status == null) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function markScheduledCheckinDeliveryState(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  checkinId: string;
  status: "retrying" | "failed" | "awaiting_user" | "sent" | "cancelled";
  attemptCount?: number | null;
  scheduledFor?: string | null;
  draftMessage?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
}) {
  const patch: Record<string, unknown> = {
    status: params.status,
    processed_at: new Date().toISOString(),
  };
  if (params.attemptCount != null) {
    patch.delivery_attempt_count = params.attemptCount;
  }
  if (params.scheduledFor != null) patch.scheduled_for = params.scheduledFor;
  if (params.draftMessage !== undefined) {
    patch.draft_message = params.draftMessage;
  }
  if (params.errorMessage !== undefined) {
    patch.delivery_last_error = params.errorMessage;
    patch.delivery_last_error_at = params.errorMessage
      ? new Date().toISOString()
      : null;
  }
  if (params.requestId !== undefined) {
    patch.delivery_last_request_id = params.requestId;
  }
  await params.supabaseAdmin
    .from("scheduled_checkins")
    .update(patch as any)
    .eq("id", params.checkinId);
}

async function loadOpenActionEveningReviewTargets(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  occurrenceIds: string[];
  timezone: string;
  now?: Date;
}): Promise<ActionEveningReviewTarget[]> {
  const occurrenceIds = [...new Set(params.occurrenceIds)].filter(Boolean);
  if (occurrenceIds.length === 0) return [];

  const { data: occurrences, error: occurrencesErr } = await params
    .supabaseAdmin
    .from("user_habit_week_occurrences")
    .select("id,cycle_id,transformation_id,plan_id,plan_item_id,status")
    .eq("user_id", params.userId)
    .in("id", occurrenceIds)
    .in("status", ["planned", "rescheduled"]);
  if (occurrencesErr) throw occurrencesErr;

  const rows = (occurrences ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const planItemIds = [
    ...new Set(rows.map((row) => cleanText(row.plan_item_id)).filter(Boolean)),
  ];
  const dayStartIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now: params.now ?? new Date(),
  });
  const dayEndIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now: params.now ?? new Date(),
  });

  const [itemsResult, entriesResult] = await Promise.all([
    params.supabaseAdmin
      .from("user_plan_items")
      .select("id,title,kind,tracking_type,status")
      .eq("user_id", params.userId)
      .in("id", planItemIds),
    params.supabaseAdmin
      .from("user_plan_item_entries")
      .select("plan_item_id")
      .eq("user_id", params.userId)
      .in("plan_item_id", planItemIds)
      .gte("effective_at", dayStartIso)
      .lt("effective_at", dayEndIso),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const itemById = new Map(
    ((itemsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      cleanText(row.id),
      row,
    ]),
  );
  const loggedItemIds = new Set(
    ((entriesResult.data ?? []) as Array<Record<string, unknown>>).map((row) =>
      cleanText(row.plan_item_id)
    ),
  );

  return rows.flatMap((occurrence) => {
    const planItemId = cleanText(occurrence.plan_item_id);
    if (!planItemId || loggedItemIds.has(planItemId)) return [];
    const item = itemById.get(planItemId);
    if (!item) return [];
    const status = cleanText(item.status);
    if (!["active", "in_maintenance", "stalled"].includes(status)) return [];
    return [{
      occurrence_id: cleanText(occurrence.id),
      cycle_id: cleanText(occurrence.cycle_id),
      transformation_id: cleanText(occurrence.transformation_id),
      plan_id: cleanText(occurrence.plan_id),
      plan_item_id: planItemId,
      title: cleanText(item.title) || "Action",
      kind: cleanText(item.kind),
      tracking_type: cleanText(item.tracking_type) || null,
    }];
  });
}

function getRecurringReminderIdFromEventContext(
  eventContext: string,
): string | null {
  const raw = String(eventContext ?? "").trim();
  const prefix = "recurring_reminder:";
  if (!raw.startsWith(prefix)) return null;
  const id = raw.slice(prefix.length).trim();
  return id || null;
}

function buildMomentumDeliveryPayload(
  checkin: any,
  extra: Record<string, unknown> = {},
) {
  const eventContext = String(checkin?.event_context ?? "");
  return {
    delivery_status: extra.delivery_status ?? null,
    purpose: "momentum_outreach",
    event_context: eventContext,
    outreach_state: getMomentumOutreachStateFromEventContext(eventContext) ??
      null,
    scheduled_checkin_id: String(checkin?.id ?? ""),
    transport: extra.transport ?? null,
    skip_reason: extra.skip_reason ?? null,
    failure_reason: extra.failure_reason ?? null,
    scheduled_for: String(checkin?.scheduled_for ?? ""),
    ...extra,
  };
}

function buildMomentumMorningDeliveryPayload(
  checkin: any,
  extra: Record<string, unknown> = {},
) {
  const payload = ((checkin as any)?.message_payload ?? {}) as Record<
    string,
    unknown
  >;
  return {
    delivery_status: extra.delivery_status ?? null,
    purpose: "momentum_morning_nudge",
    event_context: String(checkin?.event_context ?? ""),
    momentum_state: cleanText(payload.momentum_state ?? extra.momentum_state) ||
      null,
    momentum_strategy:
      cleanText(payload.momentum_strategy ?? extra.momentum_strategy) || null,
    morning_nudge_posture: cleanText(
      payload.morning_nudge_posture ?? extra.morning_nudge_posture,
    ) || null,
    relevance: cleanText(payload.relevance ?? extra.relevance) || null,
    confidence: cleanText(payload.confidence ?? extra.confidence) || null,
    scheduled_checkin_id: String(checkin?.id ?? ""),
    transport: extra.transport ?? null,
    skip_reason: extra.skip_reason ?? null,
    failure_reason: extra.failure_reason ?? null,
    scheduled_for: String(extra.scheduled_for ?? checkin?.scheduled_for ?? ""),
    slot_day_offset: Number.isFinite(Number(payload.slot_day_offset))
      ? Number(payload.slot_day_offset)
      : null,
    slot_weekday: cleanText(payload.slot_weekday) || null,
    plan_item_ids_targeted: parseStringArray(
      payload.plan_item_ids_targeted ?? extra.plan_item_ids_targeted,
    ),
    plan_item_titles_targeted: parseStringArray(
      payload.plan_item_titles_targeted ?? extra.plan_item_titles_targeted,
    ),
    conversation_pulse_id:
      cleanText(payload.conversation_pulse_id ?? extra.conversation_pulse_id) ||
      null,
    ...extra,
  };
}

async function fetchWhatsappTempMemory(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  if (error) throw error;
  const tempMemory = (data as any)?.temp_memory;
  return tempMemory && typeof tempMemory === "object"
    ? tempMemory as Record<string, unknown>
    : {};
}

async function persistWhatsappTempMemory(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  tempMemory: Record<string, unknown>;
}): Promise<void> {
  await getUserState(params.supabaseAdmin as any, params.userId, "whatsapp");
  await updateUserState(
    params.supabaseAdmin as any,
    params.userId,
    "whatsapp",
    {
      temp_memory: params.tempMemory,
    },
  );
}

async function consumeUnansweredRecurringProbe(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  recurringReminderId: string;
}): Promise<number> {
  const { supabaseAdmin, userId, recurringReminderId } = params;
  const eventContext = `recurring_reminder:${recurringReminderId}`;
  const { data: pendingRows, error } = await supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter("payload->>event_context", "eq", eventContext)
    .order("created_at", { ascending: true });
  if (error) throw error;

  if (!pendingRows || pendingRows.length === 0) return 0;

  for (const row of pendingRows as any[]) {
    await supabaseAdmin
      .from("whatsapp_pending_actions")
      .update({ status: "expired", processed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending");

    if (row.scheduled_checkin_id) {
      await supabaseAdmin
        .from("scheduled_checkins")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", row.scheduled_checkin_id)
        .eq("status", "awaiting_user");
    }
  }

  return pendingRows.length;
}

function monthKeyInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function likelyHasDailyBilanWinbackCandidateToday(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  if (!profile) return false;
  const decision = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: profile.whatsapp_bilan_opted_in,
    whatsappBilanPausedUntil: profile.whatsapp_bilan_paused_until,
    whatsappCoachingPausedUntil: profile.whatsapp_coaching_paused_until,
    whatsappLastInboundAt: profile.whatsapp_last_inbound_at,
    whatsappBilanWinbackStep: profile.whatsapp_bilan_winback_step,
    whatsappBilanLastWinbackAt: (profile as any).whatsapp_bilan_last_winback_at,
  });
  return decision.decision === "send" || decision.suppress_other_proactives;
}

async function consumeMonthlyWhatsappQuota(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  quotaKey: string;
  monthKey: string;
  limit: number;
}): Promise<{ allowed: boolean; usedCount: number }> {
  const { data, error } = await params.supabaseAdmin.rpc(
    "consume_whatsapp_monthly_quota",
    {
      p_user_id: params.userId,
      p_quota_key: params.quotaKey,
      p_month_key: params.monthKey,
      p_limit: params.limit,
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean((row as any)?.allowed),
    usedCount: Number((row as any)?.used_count ?? 0),
  };
}

async function releaseMonthlyWhatsappQuota(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  quotaKey: string;
  monthKey: string;
}): Promise<number> {
  const { data, error } = await params.supabaseAdmin.rpc(
    "release_whatsapp_monthly_quota",
    {
      p_user_id: params.userId,
      p_quota_key: params.quotaKey,
      p_month_key: params.monthKey,
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number((row as any)?.used_count ?? 0);
}

async function processPendingProactiveTemplateCandidates(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,user_id,payload,created_at,expires_at,not_before")
    .eq("kind", PROACTIVE_TEMPLATE_CANDIDATE_KIND)
    .eq("status", "pending")
    .or(`not_before.is.null,not_before.lte.${nowIso}`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  if (!rows || rows.length === 0) return 0;

  const grouped = new Map<string, any[]>();
  for (const row of rows as any[]) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId)!.push(row);
  }

  let processed = 0;
  for (const [userId, userRows] of grouped.entries()) {
    const sorted = userRows.slice().sort((a, b) => {
      const ap = proactiveTemplatePriorityForPurpose(a?.payload?.purpose) ||
        Number(a?.payload?.priority ?? 0);
      const bp = proactiveTemplatePriorityForPurpose(b?.payload?.purpose) ||
        Number(b?.payload?.priority ?? 0);
      if (bp !== ap) return bp - ap;
      return new Date(String(a?.created_at ?? 0)).getTime() -
        new Date(String(b?.created_at ?? 0)).getTime();
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const payload = (winner?.payload ?? {}) as any;
    const purpose = String(payload.purpose ?? "").trim();

    let recurringQuotaMonthKey: string | null = null;
    let recurringQuotaConsumed = false;
    if (String(payload.follow_up_kind ?? "") === "recurring_reminder") {
      recurringQuotaMonthKey = monthKeyInTimezone(
        new Date(),
        String(payload.user_timezone ?? "Europe/Paris"),
      );
      try {
        const quotaResult = await consumeMonthlyWhatsappQuota({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
          monthKey: recurringQuotaMonthKey,
          limit: RECURRING_REMINDER_TEMPLATE_MONTHLY_LIMIT,
        });
        if (!quotaResult.allowed) {
          await params.supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", winner.id)
            .eq("status", "pending");
          if (payload.scheduled_checkin_id) {
            await params.supabaseAdmin
              .from("scheduled_checkins")
              .update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
              })
              .eq("id", payload.scheduled_checkin_id)
              .eq("status", "pending");
          }
          continue;
        }
        recurringQuotaConsumed = true;
      } catch (e) {
        console.error(
          `[process-checkins] request_id=${params.requestId} candidate_quota_check_failed user_id=${userId}`,
          e,
        );
        continue;
      }
    }

    let sendRes: any = null;
    try {
      sendRes = await callWhatsappSend({
        user_id: userId,
        message: payload.message,
        purpose,
        require_opted_in: payload.require_opted_in !== false,
        force_template: payload.force_template !== false,
        metadata_extra: {
          ...(payload.metadata_extra &&
              typeof payload.metadata_extra === "object"
            ? payload.metadata_extra
            : {}),
          proactive_candidate_id: winner.id,
        },
      });
    } catch (e) {
      if (recurringQuotaConsumed && recurringQuotaMonthKey) {
        await releaseMonthlyWhatsappQuota({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
          monthKey: recurringQuotaMonthKey,
        }).catch(() => undefined);
      }
      const status = (e as any)?.status;
      if (status === 429) continue;
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", winner.id)
        .eq("status", "pending");
      if (payload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", payload.scheduled_checkin_id)
          .in("status", ["pending", "awaiting_user"] as any);
      }
      continue;
    }

    const skipped = Boolean(sendRes?.skipped);
    if (skipped && recurringQuotaConsumed && recurringQuotaMonthKey) {
      await releaseMonthlyWhatsappQuota({
        supabaseAdmin: params.supabaseAdmin,
        userId,
        quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
        monthKey: recurringQuotaMonthKey,
      }).catch(() => undefined);
      if (payload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", payload.scheduled_checkin_id)
          .in("status", ["pending", "awaiting_user"] as any);
      }
    }

    if (!skipped) {
      const followUpKind = String(payload.follow_up_kind ?? "").trim();
      if (followUpKind === "recurring_reminder") {
        if (payload.recurring_reminder_id) {
          await params.supabaseAdmin
            .from("user_recurring_reminders")
            .update({
              probe_last_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", payload.recurring_reminder_id)
            .eq("user_id", userId);
        }
        await params.supabaseAdmin
          .from("whatsapp_pending_actions")
          .insert({
            user_id: userId,
            kind: "scheduled_checkin",
            status: "pending",
            scheduled_checkin_id: payload.scheduled_checkin_id ?? null,
            payload: {
              draft_message: payload.draft_message ?? null,
              event_context: payload.event_context ?? null,
              message_mode: payload.message_mode ?? "static",
              message_payload: payload.message_payload ?? {},
              recurring_reminder_id: payload.recurring_reminder_id ?? null,
            },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
              .toISOString(),
          });
        if (payload.scheduled_checkin_id) {
          await params.supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "awaiting_user" })
            .eq("id", payload.scheduled_checkin_id)
            .eq("status", "pending");
        }
      }
    }

    await params.supabaseAdmin
      .from("whatsapp_pending_actions")
      .update({
        status: skipped ? "cancelled" : "done",
        processed_at: new Date().toISOString(),
      })
      .eq("id", winner.id)
      .eq("status", "pending");

    for (const loser of losers) {
      const loserPayload = (loser?.payload ?? {}) as any;
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", loser.id)
        .eq("status", "pending");
      if (
        String(loserPayload.follow_up_kind ?? "") === "recurring_reminder" &&
        loserPayload.scheduled_checkin_id
      ) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", loserPayload.scheduled_checkin_id)
          .eq("status", "pending");
      }
    }

    processed++;
  }

  return processed;
}

async function processPendingAccessEndedNotifications(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,user_id,payload,created_at,expires_at")
    .eq("kind", ACCESS_ENDED_NOTIFICATION_KIND)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  if (!rows || rows.length === 0) return 0;

  let processed = 0;
  for (const row of rows as any[]) {
    const expiresAt = typeof row?.expires_at === "string"
      ? row.expires_at
      : null;
    if (expiresAt && expiresAt <= nowIso) {
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "expired", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const payload = (row?.payload ?? {}) as Record<string, unknown>;
    const reason = normalizeAccessEndedReason(payload.ended_reason);
    if (!reason) {
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const { data: profile, error: profileErr } = await params.supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", row.user_id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const bodyText = buildAccessEndedInitialMessage({
      reason,
      firstName: String((profile as any)?.full_name ?? ""),
    });

    try {
      const resp = await callWhatsappSend({
        user_id: row.user_id,
        message: { type: "text", body: bodyText },
        purpose: accessEndedPurpose(reason),
        require_opted_in: true,
        metadata_extra: {
          source: "access_ended",
          ended_reason: reason,
          access_ended_notification_id: row.id,
          from_access_tier: payload.from_access_tier ?? null,
        },
      });

      if (Boolean((resp as any)?.skipped)) {
        await params.supabaseAdmin
          .from("whatsapp_pending_actions")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "pending");
        continue;
      }

      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("user_id", row.user_id)
        .eq("kind", ACCESS_REACTIVATION_OFFER_KIND)
        .eq("status", "pending");

      const { error: replyErr } = await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .insert({
          user_id: row.user_id,
          kind: ACCESS_REACTIVATION_OFFER_KIND,
          status: "pending",
          payload: {
            ended_reason: reason,
            upgrade_path: String(payload.upgrade_path ?? "/upgrade"),
            source: "access_ended_notification",
          },
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString(),
        });
      if (replyErr) throw replyErr;

      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");

      processed++;
    } catch (e) {
      const status = (e as any)?.status;
      if (status === 429) continue;
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
    }
  }

  return processed;
}

// ── Rendez-vous delivery ─────────────────────────────────────────────────────

const RENDEZ_VOUS_KIND_INSTRUCTIONS: Record<string, string> = {
  pre_event_grounding:
    "Message WhatsApp de rendez-vous avant un événement important. Tu aides la personne à se préparer mentalement de façon calme et concrète. Mentionne l'événement, propose un angle de préparation simple. Ton rassurant.",
  post_friction_repair:
    "Message WhatsApp de rendez-vous après une période de friction. Tu reconnais que ça a été un moment difficile, tu proposes de faire un point simple sans pression. Pas de culpabilisation, pas de bilan forcé.",
  weekly_reset:
    "Message WhatsApp de rendez-vous hebdomadaire. Le bilan récent suggère un ajustement. Tu proposes de prendre 5 minutes pour recalibrer la semaine ensemble, de façon douce et constructive.",
  mission_preparation:
    "Message WhatsApp de rendez-vous de préparation de mission. Une étape importante approche. Tu aides à se projeter concrètement, à identifier un premier pas simple, sans dramatiser.",
  transition_handoff:
    "Message WhatsApp de rendez-vous de transition entre deux transformations. Tu fais un mini-bilan chaleureux de ce qui a été accompli, puis tu ouvres sur la suite avec enthousiasme mesuré.",
};

function rendezVousInstruction(kind: string): string {
  return RENDEZ_VOUS_KIND_INSTRUCTIONS[kind] ??
    "Message WhatsApp de rendez-vous. Sois chaleureux, concis et non-intrusif.";
}

function rendezVousSourceRefs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceRefStringArray(value: unknown, max = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildRendezVousEventGrounding(rdv: {
  kind: string;
  trigger_reason: string | null;
  posture: string | null;
  source_refs: Record<string, unknown> | null;
}): string {
  const lines = [
    `rendez_vous_kind=${rdv.kind}`,
    `trigger=${String(rdv.trigger_reason ?? "")}`,
    `posture=${String(rdv.posture ?? "")}`,
  ];

  const handoff = rendezVousSourceRefs(
    rendezVousSourceRefs(rdv.source_refs).transformation_handoff,
  );
  const previousTitle = String(handoff.previous_transformation_title ?? "")
    .trim();
  const nextTitle = String(handoff.next_transformation_title ?? "").trim();
  const recapLines = sourceRefStringArray(handoff.recap_lines, 4);
  const wins = sourceRefStringArray(handoff.wins, 3);
  const relationalSignals = sourceRefStringArray(handoff.relational_signals, 3);
  const coachingMemory = String(handoff.coaching_memory_summary ?? "").trim();

  if (previousTitle) lines.push(`previous_transformation=${previousTitle}`);
  if (nextTitle) lines.push(`next_transformation=${nextTitle}`);
  if (wins.length > 0) lines.push(`wins=${wins.join(" | ")}`);
  if (relationalSignals.length > 0) {
    lines.push(`relational_signals=${relationalSignals.join(" | ")}`);
  }
  if (recapLines.length > 0) {
    lines.push(`handoff_recap=${recapLines.join(" | ")}`);
  }
  if (coachingMemory) lines.push(`coaching_memory=${coachingMemory}`);

  return lines.join("\n");
}

async function replacePendingRendezVousReplyAction(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  rendezVousId: string;
  kind: string;
  cycleId: string | null;
  transformationId: string | null;
  deliveredAtIso: string;
}) {
  const nowIso = new Date().toISOString();
  await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .update({ status: "cancelled", processed_at: nowIso })
    .eq("user_id", params.userId)
    .eq("kind", "rendez_vous")
    .eq("status", "pending");

  const { error } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .insert({
      user_id: params.userId,
      kind: "rendez_vous",
      status: "pending",
      payload: {
        rendez_vous_id: params.rendezVousId,
        rendez_vous_kind: params.kind,
        cycle_id: params.cycleId,
        transformation_id: params.transformationId,
        delivered_at: params.deliveredAtIso,
        source: "process_checkins",
      },
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error) throw error;
}

async function processDueRendezVous(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data: dueRdvs, error } = await params.supabaseAdmin
    .from("user_rendez_vous")
    .select(
      "id,user_id,cycle_id,transformation_id,kind,state,posture,trigger_reason,confidence,scheduled_for,source_refs",
    )
    .eq("state", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(20);

  if (error) {
    console.error(
      `[process-checkins] request_id=${params.requestId} rendez_vous_fetch_failed`,
      error,
    );
    return 0;
  }

  if (!dueRdvs || dueRdvs.length === 0) return 0;

  console.log(
    `[process-checkins] request_id=${params.requestId} due_rendez_vous=${dueRdvs.length}`,
  );

  let delivered = 0;

  for (const rdv of dueRdvs as Array<Record<string, unknown>>) {
    const userId = String(rdv.user_id ?? "").trim();
    const rdvId = String(rdv.id ?? "").trim();
    const kind = String(rdv.kind ?? "").trim();
    if (!userId || !rdvId) continue;

    const { data: profile } = await params.supabaseAdmin
      .from("profiles")
      .select(
        "whatsapp_opted_in,whatsapp_last_inbound_at,whatsapp_last_outbound_at,timezone",
      )
      .eq("id", userId)
      .maybeSingle();

    if (!Boolean((profile as any)?.whatsapp_opted_in)) {
      console.log(
        `[process-checkins] request_id=${params.requestId} rendez_vous_skipped user_id=${userId} rdv_id=${rdvId} reason=not_opted_in`,
      );
      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "cancelled",
        {
          nowIso,
          eventMetadata: {
            source: "process_checkins",
            reason: "not_opted_in",
          },
        },
      ).catch(() => undefined);
      continue;
    }

    let bodyText: string;
    try {
      bodyText = await generateDynamicWhatsAppCheckinMessage({
        admin: params.supabaseAdmin as any,
        userId,
        eventContext: `rendez_vous:${kind}`,
        scheduledFor: String(rdv.scheduled_for ?? ""),
        instruction: rendezVousInstruction(kind),
        eventGrounding: buildRendezVousEventGrounding({
          kind,
          trigger_reason: typeof rdv.trigger_reason === "string"
            ? rdv.trigger_reason
            : null,
          posture: typeof rdv.posture === "string" ? rdv.posture : null,
          source_refs: (rdv.source_refs as Record<string, unknown> | null) ??
            null,
        }),
        source: "process_checkins:rendez_vous",
        requestId: params.requestId,
      });
    } catch (e) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} rendez_vous_dynamic_gen_failed rdv_id=${rdvId}`,
        e,
      );
      bodyText =
        "Je passe te proposer un moment pour faire le point ensemble, si tu veux.";
    }

    if (!bodyText.trim()) {
      bodyText =
        "Je passe te proposer un moment pour faire le point ensemble, si tu veux.";
    }

    try {
      const { data: profileForGreeting } = await params.supabaseAdmin
        .from("profiles")
        .select("whatsapp_last_inbound_at,whatsapp_last_outbound_at")
        .eq("id", userId)
        .maybeSingle();
      const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
        lastInboundAt: (profileForGreeting as any)?.whatsapp_last_inbound_at,
        lastOutboundAt: (profileForGreeting as any)?.whatsapp_last_outbound_at,
      });
      bodyText = applyScheduledCheckinGreetingPolicy({
        text: bodyText,
        allowRelaunchGreeting,
      });
    } catch (e) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} rendez_vous_greeting_failed rdv_id=${rdvId}`,
        e,
      );
    }

    try {
      const resp = await callWhatsappSend({
        user_id: userId,
        message: { type: "text", body: bodyText },
        purpose: "rendez_vous",
        require_opted_in: true,
        metadata_extra: {
          source: "rendez_vous",
          rendez_vous_id: rdvId,
          rendez_vous_kind: kind,
        },
      });

      const usedTemplate = Boolean((resp as any)?.used_template);
      if (Boolean((resp as any)?.skipped)) {
        const skipReason = String(
          (resp as any)?.skip_reason ?? "rendez_vous_delivery_skipped",
        );
        console.log(
          `[process-checkins] request_id=${params.requestId} rendez_vous_whatsapp_skipped rdv_id=${rdvId} reason=${skipReason}`,
        );
        await transitionRendezVous(
          params.supabaseAdmin as any,
          rdvId,
          "cancelled",
          {
            nowIso,
            eventMetadata: {
              source: "process_checkins",
              reason: skipReason,
            },
          },
        ).catch(() => undefined);
        continue;
      }

      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "delivered",
        {
          nowIso,
          sourceRefsPatch: {
            last_delivery_transport: usedTemplate ? "template" : "text",
            last_delivery_request_id: params.requestId,
          },
          eventMetadata: {
            source: "process_checkins",
            transport: usedTemplate ? "template" : "text",
          },
        },
      );

      try {
        await replacePendingRendezVousReplyAction({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          rendezVousId: rdvId,
          kind,
          cycleId: cleanText(rdv.cycle_id) || null,
          transformationId: cleanText(rdv.transformation_id) || null,
          deliveredAtIso: nowIso,
        });
      } catch (pendingError) {
        console.error(
          `[process-checkins] request_id=${params.requestId} rendez_vous_pending_insert_failed rdv_id=${rdvId}`,
          pendingError,
        );
      }

      delivered++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[process-checkins] request_id=${params.requestId} rendez_vous_delivery_failed rdv_id=${rdvId}`,
        msg,
      );
      await logEdgeFunctionError({
        functionName: "process-checkins",
        error: msg,
        requestId: params.requestId,
        userId,
        source: "rendez_vous",
        metadata: { rendez_vous_id: rdvId, kind },
      });
    }
  }

  return delivered;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 0) Flush deferred proactive WhatsApp messages when conversation has been quiet.
    // This avoids sending memory echos mid-conversation.
    const nowIso = new Date().toISOString();
    const quietMs = QUIET_WINDOW_MINUTES * 60 * 1000;
    const { data: deferred, error: defErr } = await supabaseAdmin
      .from("whatsapp_pending_actions")
      .select("id, user_id, payload, not_before, expires_at, created_at")
      .eq("kind", "deferred_send")
      .eq("status", "pending")
      .or(`not_before.is.null,not_before.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(50);
    if (defErr) throw defErr;

    let flushedCount = 0;
    if (deferred && deferred.length > 0) {
      for (const row of deferred as any[]) {
        // Ensure quiet window is satisfied before sending.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", row.user_id)
          .maybeSingle();
        const lastInbound = profile?.whatsapp_last_inbound_at
          ? new Date(profile.whatsapp_last_inbound_at).getTime()
          : null;
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at
          ? new Date((profile as any).whatsapp_last_outbound_at).getTime()
          : null;
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0);
        if (lastActivity > 0 && Date.now() - lastActivity < quietMs) {
          // Still active: keep pending for next run.
          continue;
        }

        const p = row.payload ?? {};
        const purpose = (p as any)?.purpose ?? null;
        const message = (p as any)?.message ?? null;
        const requireOptedIn = (p as any)?.require_opted_in;
        const metadataExtra = (p as any)?.metadata_extra;
        let bodyText = (message && (message as any).type === "text")
          ? String((message as any).body ?? "")
          : "";
        try {
          const { data: profileForGreeting } = await supabaseAdmin
            .from("profiles")
            .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
            .eq("id", row.user_id)
            .maybeSingle();
          const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
            lastInboundAt: (profileForGreeting as any)
              ?.whatsapp_last_inbound_at,
            lastOutboundAt: (profileForGreeting as any)
              ?.whatsapp_last_outbound_at,
          });
          bodyText = applyWhatsappProactiveOpeningPolicy({
            text: bodyText,
            allowRelaunchGreeting,
            fallback: "Comment ça va ?",
          });
          if (message && (message as any).type === "text") {
            (message as any).body = bodyText;
          }
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} deferred_greeting_policy_failed pending_id=${row.id}`,
            e,
          );
        }

        try {
          await callWhatsappSend({
            user_id: row.user_id,
            message,
            purpose,
            require_opted_in: requireOptedIn,
            metadata_extra: metadataExtra,
          });

          await supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({ status: "done", processed_at: new Date().toISOString() })
            .eq("id", row.id);
          flushedCount++;
        } catch (e) {
          const status = (e as any)?.status;
          // 429 throttle => keep pending, retry later.
          if (status === 429) continue;

          // If WhatsApp can't be used (not opted in / paywall / missing phone), fall back to in-app log and stop retrying.
          if (bodyText.trim()) {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: row.user_id,
              role: "assistant",
              content: bodyText,
              agent_used: "philosopher",
              metadata: {
                source: "deferred_send_fallback",
                purpose,
                ...(metadataExtra && typeof metadataExtra === "object"
                  ? metadataExtra
                  : {}),
              },
            });
          }
          await supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }

    const deliveredRendezVous = await processDueRendezVous({
      supabaseAdmin,
      requestId,
    });

    const processedAccessBefore = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    });

    const processedQueuedBefore =
      await processPendingProactiveTemplateCandidates({
        supabaseAdmin,
        requestId,
      });

    // 1. Fetch due checkins, including transiently retrying ones.
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from("scheduled_checkins")
      .select(
        "id, user_id, draft_message, event_context, message_mode, message_payload, delivery_attempt_count",
      )
      .in("status", ["pending", "retrying"])
      .lte("scheduled_for", new Date().toISOString())
      .limit(50); // Batch size limit

    if (fetchError) throw fetchError;

    if (!checkins || checkins.length === 0) {
      const processedAccessAfter = await processPendingAccessEndedNotifications(
        {
          supabaseAdmin,
          requestId,
        },
      );
      const processedQueuedAfter =
        await processPendingProactiveTemplateCandidates({
          supabaseAdmin,
          requestId,
        });
      return jsonResponse(
        req,
        {
          message: "No checkins to process",
          flushed_deferred: flushedCount,
          delivered_rendez_vous: deliveredRendezVous,
          processed_access_notifications: processedAccessBefore +
            processedAccessAfter,
          processed_proactive_candidates: processedQueuedBefore +
            processedQueuedAfter,
          request_id: requestId,
        },
        { includeCors: false },
      );
    }

    console.log(
      `[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`,
    );
    let processedCount = 0;

    for (const checkin of checkins) {
      const eventContext = String((checkin as any)?.event_context ?? "");
      const isMomentumOutreach = isMomentumOutreachEventContext(eventContext);
      const isMomentumMorningNudge = isMorningNudgeEventContext(eventContext);
      const isActionMorningEncouragement =
        eventContext === ACTION_MORNING_EVENT_CONTEXT;
      const isMorningLightGreeting =
        eventContext === MORNING_LIGHT_GREETING_EVENT_CONTEXT;
      const isActionEveningReview =
        eventContext === ACTION_EVENING_REVIEW_EVENT_CONTEXT;
      const recurringReminderId = getRecurringReminderIdFromEventContext(
        eventContext,
      );
      let userTimezone = "Europe/Paris";
      let userProfileSnapshot: Record<string, unknown> | null = null;
      let morningPlan: any = null;

      // Recurring reminders: if previous consent probes were unanswered, count them.
      // After 2 unanswered probes, auto-pause the reminder and stop future sends.
      if (recurringReminderId) {
        try {
          const newlyUnanswered = await consumeUnansweredRecurringProbe({
            supabaseAdmin,
            userId: checkin.user_id,
            recurringReminderId,
          });

          const { data: reminder } = await supabaseAdmin
            .from("user_recurring_reminders")
            .select(
              "id,status,initiative_kind,ends_at,unanswered_probe_count,probe_last_sent_at",
            )
            .eq("id", recurringReminderId)
            .eq("user_id", checkin.user_id)
            .maybeSingle();

          if (!reminder || (reminder as any).status !== "active") {
            await supabaseAdmin
              .from("scheduled_checkins")
              .update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
              })
              .eq("id", checkin.id);
            continue;
          }

          const endsAt = parseIsoMs((reminder as any)?.ends_at);
          if (endsAt !== null && endsAt <= Date.now()) {
            await supabaseAdmin
              .from("user_recurring_reminders")
              .update({
                status: "expired",
                ended_reason: "expired",
                deactivated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", recurringReminderId)
              .eq("user_id", checkin.user_id);

            await supabaseAdmin
              .from("scheduled_checkins")
              .update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
              })
              .eq("id", checkin.id);
            continue;
          }

          const currentMisses = Number(
            (reminder as any).unanswered_probe_count ?? 0,
          );
          const misses = Math.max(
            0,
            Math.min(2, currentMisses + newlyUnanswered),
          );
          if (newlyUnanswered > 0) {
            await supabaseAdmin
              .from("user_recurring_reminders")
              .update({
                unanswered_probe_count: misses,
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", recurringReminderId)
              .eq("user_id", checkin.user_id);
          }

          if (misses >= 2) {
            await supabaseAdmin
              .from("user_recurring_reminders")
              .update({
                status: "inactive",
                deactivated_at: new Date().toISOString(),
                probe_paused_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", recurringReminderId)
              .eq("user_id", checkin.user_id);

            await supabaseAdmin
              .from("scheduled_checkins")
              .update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
              })
              .eq("id", checkin.id);
            continue;
          }
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} recurring_probe_policy_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }

      let in24hConversationWindow = false;

      // Quiet window: don't interrupt an active WhatsApp conversation.
      // If the user was active recently, push the checkin a bit later instead of sending now.
      {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select(
            "whatsapp_last_inbound_at, whatsapp_last_outbound_at, timezone, whatsapp_coaching_paused_until, whatsapp_bilan_opted_in, whatsapp_bilan_paused_until, whatsapp_bilan_missed_streak, whatsapp_bilan_last_prompt_at, whatsapp_bilan_winback_step, whatsapp_bilan_last_winback_at",
          )
          .eq("id", checkin.user_id)
          .maybeSingle();
        userProfileSnapshot = (profile as Record<string, unknown> | null) ??
          null;
        userTimezone = String((profile as any)?.timezone ?? "").trim() ||
          "Europe/Paris";
        const coachingPauseUntilMs =
          (profile as any)?.whatsapp_coaching_paused_until
            ? new Date((profile as any).whatsapp_coaching_paused_until)
              .getTime()
            : NaN;
        if (
          isMomentumMorningNudge &&
          Number.isFinite(coachingPauseUntilMs) &&
          coachingPauseUntilMs > Date.now()
        ) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_decision",
            payload: {
              decision_kind: "momentum_morning_gate",
              target_kind: "morning_nudge",
              state_at_decision: null,
              decision: "skip",
              decision_reason: "momentum_morning_nudge_pause_active",
              scheduled_checkin_id: String(checkin.id ?? ""),
            },
          });
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", checkin.id);
          continue;
        }
        const lastInbound = profile?.whatsapp_last_inbound_at
          ? new Date(profile.whatsapp_last_inbound_at).getTime()
          : null;
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at
          ? new Date((profile as any).whatsapp_last_outbound_at).getTime()
          : null;
        in24hConversationWindow = lastInbound !== null &&
          Date.now() - lastInbound < 24 * 60 * 60 * 1000;
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0);
        if (lastActivity > 0 && Date.now() - lastActivity < quietMs) {
          const waitMs = Math.max(0, quietMs - (Date.now() - lastActivity));
          const nextIso = new Date(Date.now() + waitMs).toISOString();
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ scheduled_for: nextIso })
            .eq("id", checkin.id);
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_deferred",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "deferred",
                transport: "quiet_window",
                scheduled_for: nextIso,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_deferred",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "deferred",
                transport: "quiet_window",
                scheduled_for: nextIso,
              }),
            });
          }
          continue;
        }
      }

      // Morning action nudges must never open a closed WhatsApp conversation via template.
      if (
        isMomentumMorningNudge &&
        !in24hConversationWindow
      ) {
        await logMomentumObservabilityEvent({
          supabase: supabaseAdmin as any,
          userId: checkin.user_id,
          requestId,
          channel: "whatsapp",
          scope: "whatsapp",
          sourceComponent: "process_checkins",
          eventName: "momentum_morning_nudge_cancelled",
          payload: buildMomentumMorningDeliveryPayload(checkin, {
            delivery_status: "cancelled",
            transport: "template_block",
            skip_reason: "momentum_morning_nudge_closed_whatsapp_window",
          }),
        });
        await supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", checkin.id);
        continue;
      }

      // 2) Prefer WhatsApp send (text if window open, template fallback if closed).
      // If the user isn't opted in / no phone: fall back to logging into chat_messages only.
      let sentViaWhatsapp = false;
      let usedTemplate = false;

      // Generate bodyText BEFORE try/catch so it's available for fallback
      let mode = String((checkin as any)?.message_mode ?? "static").trim()
        .toLowerCase();
      let payload = ((checkin as any)?.message_payload ?? {}) as any;
      let bodyText = String((checkin as any)?.draft_message ?? "").trim();
      let tempMemory: Record<string, unknown> = {};
      if (isMomentumMorningNudge) {
        tempMemory = await fetchWhatsappTempMemory(
          supabaseAdmin,
          String(checkin.user_id),
        ).catch(() => ({}));
        if (eventContext === "morning_nudge_v2") {
          const resolvedMorningPlan = await resolveMorningNudgePlanV2({
            supabase: supabaseAdmin as any,
            userId: String(checkin.user_id),
            tempMemory,
            scheduledForIso: String((checkin as any)?.scheduled_for ?? ""),
            timezone: userTimezone,
          });
          morningPlan = resolvedMorningPlan.plan;
          if (
            resolvedMorningPlan.repairModeTransition?.activated &&
            resolvedMorningPlan.repairModeTransition.updatedTempMemory &&
            resolvedMorningPlan.repairModeTransition.enteredEventPayload
          ) {
            tempMemory = resolvedMorningPlan.repairModeTransition
              .updatedTempMemory as Record<
                string,
                unknown
              >;
            await persistWhatsappTempMemory({
              supabaseAdmin,
              userId: String(checkin.user_id),
              tempMemory,
            });
            try {
              await logV2Event(
                supabaseAdmin as any,
                V2_EVENT_TYPES.REPAIR_MODE_ENTERED,
                resolvedMorningPlan.repairModeTransition.enteredEventPayload,
              );
            } catch (error) {
              console.warn(
                "[process-checkins] repair_mode_entered_v2 log failed:",
                error,
              );
            }
          }
          payload = {
            ...payload,
            conversation_pulse_id: resolvedMorningPlan.conversationPulseId,
          };
        } else {
          morningPlan = buildMomentumMorningPlan({
            tempMemory,
            payload,
          });
        }
        await logMomentumObservabilityEvent({
          supabase: supabaseAdmin as any,
          userId: checkin.user_id,
          requestId,
          channel: "whatsapp",
          scope: "whatsapp",
          sourceComponent: "process_checkins",
          eventName: "momentum_morning_nudge_decision",
          payload: {
            decision_kind: "momentum_morning_gate",
            target_kind: "morning_nudge",
            state_at_decision: morningPlan.state ?? null,
            decision: morningPlan.decision,
            decision_reason: morningPlan.reason,
            strategy: morningPlanStrategy(morningPlan),
            posture: morningPlanPosture(morningPlan),
            relevance: morningPlan.relevance,
            confidence: morningPlanConfidence(morningPlan),
            plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
            plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
            scheduled_checkin_id: String(checkin.id ?? ""),
          },
        });
        if (morningPlan.decision === "skip") {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_cancelled",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "cancelled",
              momentum_state: morningPlan.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan.relevance,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              skip_reason: morningPlan.reason,
            }),
          });
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: morningPlan.reason,
            requestId,
          });
          continue;
        }
        mode = "dynamic";
        payload = {
          ...payload,
          source: "process_checkins:momentum_morning_nudge",
          momentum_state: morningPlan.state ?? null,
          momentum_strategy: morningPlanStrategy(morningPlan),
          morning_nudge_posture: morningPlanPosture(morningPlan),
          relevance: morningPlan.relevance,
          instruction: morningPlan.instruction ?? payload?.instruction ?? "",
          event_grounding: morningPlan.event_grounding ??
            payload?.event_grounding ?? "",
          confidence: morningPlanConfidence(morningPlan),
          plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
          plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
          chat_capability: "track_progress_only",
        };
        bodyText = morningPlan.fallback_text ?? bodyText;
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ message_payload: payload })
            .eq("id", checkin.id);
          (checkin as any).message_payload = payload;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_morning_payload_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      if (isActionMorningEncouragement || isMorningLightGreeting) {
        const occurrenceIds = parseStringArray(payload?.occurrence_ids);
        if (isActionMorningEncouragement && occurrenceIds.length === 0) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: "action_morning_no_occurrences",
            requestId,
          });
          continue;
        }

        mode = "dynamic";
        payload = {
          ...payload,
          source: isActionMorningEncouragement
            ? "process_checkins:action_morning_encouragement"
            : "process_checkins:morning_light_greeting",
          instruction: String(payload?.instruction ?? "").trim() ||
            (isMorningLightGreeting
              ? buildLightMorningInstruction()
              : "Message WhatsApp du matin: encourage brièvement le user à réaliser les actions prévues aujourd'hui."),
          event_grounding: String(payload?.event_grounding ?? "").trim() ||
            `event_context=${eventContext}`,
          chat_capability: "track_progress_only",
        };
        if (!bodyText.trim() && isMorningLightGreeting) {
          bodyText = buildLightMorningFallbackMessage();
        }
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ message_payload: payload })
            .eq("id", checkin.id);
          (checkin as any).message_payload = payload;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_action_morning_payload_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      if (isActionEveningReview) {
        const attemptCount = Math.max(
          1,
          Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
        );
        const occurrenceIds = parseStringArray(payload?.occurrence_ids);
        if (occurrenceIds.length === 0) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: "action_evening_review_no_occurrences",
            requestId,
          });
          continue;
        }

        const targets = await loadOpenActionEveningReviewTargets({
          supabaseAdmin,
          userId: String(checkin.user_id),
          occurrenceIds,
          timezone: userTimezone,
        });
        if (targets.length === 0) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: "action_evening_review_already_answered",
            requestId,
          });
          continue;
        }

        if (!in24hConversationWindow) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: "action_evening_review_requires_24h_window",
            requestId,
          });
          continue;
        }

        const reviewBody = buildActionEveningReviewMessageFromTitles(
          targets.map((target) => target.title),
        );
        try {
          const resp = await callWhatsappSend({
            user_id: checkin.user_id,
            message: {
              type: "interactive_buttons",
              body: reviewBody,
              buttons: ACTION_EVENING_REVIEW_BUTTONS,
            },
            purpose: "action_evening_review",
            require_opted_in: true,
            metadata_extra: {
              source: "scheduled_checkin",
              event_context: checkin.event_context,
              original_checkin_id: checkin.id,
              purpose: "action_evening_review",
              occurrence_ids: targets.map((target) => target.occurrence_id),
              plan_item_ids: [
                ...new Set(targets.map((target) => target.plan_item_id)),
              ],
            },
          });
          const skipped = Boolean((resp as any)?.skipped);
          if (skipped) {
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "cancelled",
              attemptCount,
              draftMessage: reviewBody,
              errorMessage: String(
                (resp as any)?.skip_reason ?? "action_evening_review_skipped",
              ),
              requestId: String((resp as any)?.request_id ?? requestId),
            });
            continue;
          }

          const { error: pendErr } = await supabaseAdmin
            .from("whatsapp_pending_actions")
            .insert({
              user_id: checkin.user_id,
              kind: "scheduled_checkin",
              status: "pending",
              scheduled_checkin_id: checkin.id,
              payload: {
                action_evening_review: true,
                event_context: checkin.event_context,
                draft_message: reviewBody,
                message_mode: "interactive_buttons",
                occurrence_ids: targets.map((target) => target.occurrence_id),
                targets,
                local_date: cleanText(payload?.local_date),
                week_start_date: cleanText(payload?.week_start_date),
              },
              expires_at: new Date(Date.now() + 18 * 60 * 60 * 1000)
                .toISOString(),
            });
          if (pendErr) throw pendErr;

          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "awaiting_user",
            attemptCount,
            draftMessage: reviewBody,
            errorMessage: null,
            requestId: String((resp as any)?.request_id ?? requestId),
          });
          processedCount++;
          continue;
        } catch (e) {
          const status = (e as any)?.status;
          const msg = e instanceof Error ? e.message : String(e);
          const nextStatus = shouldRetryScheduledCheckinDelivery(status)
            ? "retrying"
            : "failed";
          await logEdgeFunctionError({
            functionName: "process-checkins",
            error: msg,
            requestId,
            userId: checkin.user_id,
            source: "whatsapp",
            metadata: {
              checkin_id: checkin.id,
              event_context: checkin.event_context,
              checkin_purpose: "action_evening_review",
              downstream_status: status ?? null,
              downstream_error: (e as any)?.data ?? null,
            },
          });
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: nextStatus,
            attemptCount,
            scheduledFor: nextStatus === "retrying"
              ? computeNextRetryAtIso(attemptCount)
              : null,
            errorMessage: msg,
            requestId,
          });
          continue;
        }
      }
      if (mode === "dynamic") {
        try {
          bodyText = await generateDynamicWhatsAppCheckinMessage({
            admin: supabaseAdmin as any,
            userId: checkin.user_id,
            eventContext: String((checkin as any)?.event_context ?? "check-in"),
            scheduledFor: String((checkin as any)?.scheduled_for ?? ""),
            instruction: String(payload?.instruction ?? payload?.note ?? ""),
            eventGrounding: String(payload?.event_grounding ?? ""),
            source: String(payload?.source ?? ""),
            requestId,
          });
        } catch (e) {
          // Fallback to stored draft if dynamic generation fails.
          console.warn(
            `[process-checkins] request_id=${requestId} dynamic_generation_failed checkin_id=${checkin.id}`,
            e,
          );
          bodyText = String((checkin as any)?.draft_message ?? "").trim() ||
            "Comment ça va depuis tout à l'heure ?";
        }
      }
      // Ensure bodyText is never empty/null for the fallback
      if (!bodyText.trim()) {
        bodyText = "Comment ça va depuis tout à l'heure ?";
      }

      // Greeting policy for scheduled_checkins only:
      // - if messages were exchanged today (local user day): no greeting prefix
      // - otherwise: prepend a short cold-open greeting variant
      try {
        const { data: profileForGreeting } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", checkin.user_id)
          .maybeSingle();
        const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
          lastInboundAt: (profileForGreeting as any)?.whatsapp_last_inbound_at,
          lastOutboundAt: (profileForGreeting as any)
            ?.whatsapp_last_outbound_at,
        });
        bodyText = applyScheduledCheckinGreetingPolicy({
          text: bodyText,
          allowRelaunchGreeting,
        });
      } catch (e) {
        console.warn(
          `[process-checkins] request_id=${requestId} greeting_policy_failed checkin_id=${checkin.id}`,
          e,
        );
      }
      const renderedDraftMessage = bodyText.trim() || null;
      if (
        mode === "dynamic" &&
        renderedDraftMessage &&
        renderedDraftMessage !==
          String((checkin as any)?.draft_message ?? "").trim()
      ) {
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ draft_message: renderedDraftMessage })
            .eq("id", checkin.id);
          (checkin as any).draft_message = renderedDraftMessage;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_rendered_draft_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      // Needed for purpose tagging in both WhatsApp and fallback logging paths.
      const checkinPurpose = recurringReminderId
        ? "recurring_reminder"
        : "scheduled_checkin";
      const recurringReminderNeedsTemplate = Boolean(recurringReminderId) &&
        !in24hConversationWindow;
      let recurringReminderQuotaConsumed = false;
      let recurringReminderQuotaMonthKey: string | null = null;
      const attemptCount = Math.max(
        1,
        Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
      );

      if (recurringReminderNeedsTemplate) {
        const { data: reminder } = await supabaseAdmin
          .from("user_recurring_reminders")
          .select("probe_last_sent_at")
          .eq("id", recurringReminderId as string)
          .eq("user_id", checkin.user_id)
          .maybeSingle();
        const lastProbeSentMs = parseIsoMs(
          (reminder as any)?.probe_last_sent_at,
        );
        if (
          lastProbeSentMs !== null &&
          Date.now() - lastProbeSentMs <
            RECURRING_REMINDER_TEMPLATE_MIN_INTERVAL_MS
        ) {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", checkin.id);
          console.log(
            `[process-checkins] request_id=${requestId} recurring_reminder_template_cooldown checkin_id=${checkin.id} user_id=${checkin.user_id}`,
          );
          continue;
        }

        if (likelyHasDailyBilanWinbackCandidateToday(userProfileSnapshot)) {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", checkin.id);
          console.log(
            `[process-checkins] request_id=${requestId} recurring_reminder_skipped_for_bilan_winback checkin_id=${checkin.id} user_id=${checkin.user_id}`,
          );
          continue;
        }
        await enqueueProactiveTemplateCandidate(supabaseAdmin as any, {
          userId: checkin.user_id,
          purpose: "recurring_reminder",
          message: {
            type: "template",
            name: (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_NAME") ??
              "sophia_reminder_consent_v1_").trim(),
            language:
              (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_LANG") ??
                "fr").trim(),
          },
          requireOptedIn: true,
          forceTemplate: true,
          metadataExtra: {
            source: "scheduled_checkin",
            event_context: checkin.event_context,
            original_checkin_id: checkin.id,
            purpose: checkinPurpose,
            recurring_reminder_id: recurringReminderId,
          },
          payloadExtra: {
            follow_up_kind: "recurring_reminder",
            scheduled_checkin_id: checkin.id,
            draft_message: renderedDraftMessage,
            event_context: checkin.event_context,
            message_mode: (checkin as any)?.message_mode ?? "static",
            message_payload: (checkin as any)?.message_payload ?? {},
            recurring_reminder_id: recurringReminderId,
            user_timezone: userTimezone,
          },
          dedupeKey: `recurring_reminder:${checkin.id}`,
        });
        continue;
      }

      try {
        const resp = await callWhatsappSend({
          user_id: checkin.user_id,
          message: { type: "text", body: bodyText },
          purpose: checkinPurpose,
          require_opted_in: true,
          metadata_extra: {
            source: "scheduled_checkin",
            event_context: checkin.event_context,
            original_checkin_id: checkin.id,
            purpose: checkinPurpose,
            recurring_reminder_id: recurringReminderId,
          },
        });
        const skipped = Boolean((resp as any)?.skipped);
        usedTemplate = Boolean((resp as any)?.used_template);
        sentViaWhatsapp = !skipped;
        if (
          skipped && recurringReminderQuotaConsumed &&
          recurringReminderQuotaMonthKey
        ) {
          try {
            await releaseMonthlyWhatsappQuota({
              supabaseAdmin,
              userId: checkin.user_id,
              quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
              monthKey: recurringReminderQuotaMonthKey,
            });
            recurringReminderQuotaConsumed = false;
          } catch (releaseErr) {
            console.error(
              `[process-checkins] request_id=${requestId} recurring_reminder_monthly_quota_release_failed checkin_id=${checkin.id}`,
              releaseErr,
            );
          }
        }
        if (skipped) {
          if (isMomentumOutreach) {
            const skipReason = String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            );
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: String((resp as any)?.request_id ?? requestId),
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: skipReason.includes("throttle")
                ? "momentum_outreach_throttled"
                : "momentum_outreach_cancelled",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: skipReason.includes("throttle")
                  ? "throttled"
                  : "cancelled",
                transport: usedTemplate ? "template" : "text",
                skip_reason: skipReason,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            const skipReason = String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            );
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: String((resp as any)?.request_id ?? requestId),
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_cancelled",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "cancelled",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: usedTemplate ? "template" : "text",
                skip_reason: skipReason,
              }),
            });
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            ),
            requestId: String((resp as any)?.request_id ?? requestId),
          });
          continue;
        }

        if (isMomentumMorningNudge) {
          const currentRepairMode = readRepairMode(tempMemory);
          if (currentRepairMode.active) {
            const nextRepairMode = recordSoftContact(
              currentRepairMode,
              new Date().toISOString(),
            );
            if (
              nextRepairMode.last_soft_contact_at !==
                currentRepairMode.last_soft_contact_at
            ) {
              tempMemory = writeRepairMode(
                tempMemory,
                nextRepairMode,
              ) as Record<string, unknown>;
              await persistWhatsappTempMemory({
                supabaseAdmin,
                userId: String(checkin.user_id),
                tempMemory,
              });
            }
          }
        }
      } catch (e) {
        const status = (e as any)?.status;
        const msg = e instanceof Error ? e.message : String(e);
        const downstreamData = (e as any)?.data ?? null;
        const downstreamRequestId =
          typeof downstreamData?.request_id === "string"
            ? String(downstreamData.request_id)
            : requestId;
        if (recurringReminderQuotaConsumed && recurringReminderQuotaMonthKey) {
          try {
            await releaseMonthlyWhatsappQuota({
              supabaseAdmin,
              userId: checkin.user_id,
              quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
              monthKey: recurringReminderQuotaMonthKey,
            });
          } catch (releaseErr) {
            console.error(
              `[process-checkins] request_id=${requestId} recurring_reminder_monthly_quota_release_failed checkin_id=${checkin.id}`,
              releaseErr,
            );
          }
        }
        await logEdgeFunctionError({
          functionName: "process-checkins",
          error: msg,
          requestId,
          userId: checkin.user_id,
          source: "whatsapp",
          metadata: {
            checkin_id: checkin.id,
            event_context: checkin.event_context,
            checkin_purpose: checkinPurpose,
            downstream_status: status ?? null,
            downstream_request_id: downstreamRequestId,
            downstream_error: downstreamData,
          },
        });
        if (shouldRetryScheduledCheckinDelivery(status)) {
          const nextRetryAt = computeNextRetryAtIso(attemptCount);
          console.warn(
            `[process-checkins] request_id=${requestId} retrying_checkin checkin_id=${checkin.id} next_retry_at=${nextRetryAt}`,
          );
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: downstreamRequestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_failed",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "retrying",
                transport: null,
                failure_reason: msg,
                scheduled_for: nextRetryAt,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: downstreamRequestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_failed",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "retrying",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: null,
                failure_reason: msg,
                scheduled_for: nextRetryAt,
              }),
            });
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "retrying",
            attemptCount,
            scheduledFor: nextRetryAt,
            errorMessage: msg,
            requestId: downstreamRequestId,
          });
          continue;
        }
        console.error(
          `[process-checkins] request_id=${requestId} whatsapp_send_failed checkin_id=${checkin.id}`,
          msg,
        );
        if (isMomentumOutreach) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId: downstreamRequestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_outreach_failed",
            payload: buildMomentumDeliveryPayload(checkin, {
              delivery_status: "failed",
              transport: null,
              failure_reason: msg,
            }),
          });
        }
        if (isMomentumMorningNudge) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId: downstreamRequestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_failed",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "failed",
              momentum_state: morningPlan?.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan?.relevance ?? null,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              transport: null,
              failure_reason: msg,
            }),
          });
        }
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "failed",
          attemptCount,
          errorMessage: msg,
          requestId: downstreamRequestId,
        });
        continue;
      }

      // If we had to use a template, we are outside the 24h window. We now wait for an explicit "Oui".
      if (sentViaWhatsapp && usedTemplate) {
        if (recurringReminderId) {
          await supabaseAdmin
            .from("user_recurring_reminders")
            .update({
              probe_last_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", recurringReminderId)
            .eq("user_id", checkin.user_id);
        }

        // Create pending action for this user, and mark checkin as awaiting_user to avoid spamming.
        const { error: pendErr } = await supabaseAdmin
          .from("whatsapp_pending_actions")
          .insert({
            user_id: checkin.user_id,
            kind: "scheduled_checkin",
            status: "pending",
            scheduled_checkin_id: checkin.id,
            payload: {
              // Note: draft_message may be null for dynamic checkins.
              draft_message: renderedDraftMessage,
              event_context: checkin.event_context,
              message_mode: (checkin as any)?.message_mode ?? "static",
              message_payload: (checkin as any)?.message_payload ?? {},
              recurring_reminder_id: recurringReminderId,
            },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
              .toISOString(),
          });

        if (pendErr) {
          console.error(
            `[process-checkins] request_id=${requestId} pending_insert_failed checkin_id=${checkin.id}`,
            pendErr,
          );
          await logEdgeFunctionError({
            functionName: "process-checkins",
            error: pendErr,
            requestId,
            userId: checkin.user_id,
            source: "whatsapp",
            metadata: {
              checkin_id: checkin.id,
              event_context: checkin.event_context,
              checkin_purpose: checkinPurpose,
              stage: "pending_action_insert",
            },
          });
          // The template already went out on WhatsApp, so keep a terminal sent state.
        } else {
          const stErr = await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "awaiting_user",
            attemptCount,
            draftMessage: renderedDraftMessage,
            errorMessage: null,
            requestId,
          }).catch((error) => error);
          if (stErr) {
            console.error(
              `[process-checkins] request_id=${requestId} mark_awaiting_failed checkin_id=${checkin.id}`,
              stErr,
            );
          }
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_sent",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "awaiting_user",
                transport: "template",
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_sent",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "awaiting_user",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: "template",
              }),
            });
          }
          continue;
        }
      }

      // 3. Mark as sent
      const updateError = await markScheduledCheckinDeliveryState({
        supabaseAdmin,
        checkinId: checkin.id,
        status: "sent",
        attemptCount,
        draftMessage: renderedDraftMessage,
        errorMessage: null,
        requestId,
      }).catch((error) => error);

      if (updateError) {
        console.error(
          `[process-checkins] request_id=${requestId} mark_sent_failed checkin_id=${checkin.id}`,
          updateError,
        );
        // Note: This might result in duplicate message if retried, but rare
      } else {
        if (isMomentumOutreach) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_outreach_sent",
            payload: buildMomentumDeliveryPayload(checkin, {
              delivery_status: "sent",
              transport: usedTemplate ? "template" : "text",
            }),
          });
        }
        if (isMomentumMorningNudge) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_sent",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "sent",
              momentum_state: morningPlan?.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan?.relevance ?? null,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              transport: usedTemplate ? "template" : "text",
            }),
          });
        }
        processedCount++;
      }
    }

    const processedAccessAfter = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    });
    const processedQueuedAfter =
      await processPendingProactiveTemplateCandidates({
        supabaseAdmin,
        requestId,
      });

    return jsonResponse(
      req,
      {
        success: true,
        processed: processedCount,
        flushed_deferred: flushedCount,
        delivered_rendez_vous: deliveredRendezVous,
        processed_access_notifications: processedAccessBefore +
          processedAccessAfter,
        processed_proactive_candidates: processedQueuedBefore +
          processedQueuedAfter,
        request_id: requestId,
      },
      { includeCors: false },
    );
  } catch (error) {
    console.error(`[process-checkins] request_id=${requestId}`, error);
    const message = error instanceof Error ? error.message : String(error);
    await logEdgeFunctionError({
      functionName: "process-checkins",
      error,
      requestId,
      userId: null,
      source: "checkins",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    });
    return jsonResponse(req, { error: message, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});

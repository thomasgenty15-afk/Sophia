/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import {
  enqueueProactiveTemplateCandidate,
  proactiveTemplatePriorityForPurpose,
  PROACTIVE_TEMPLATE_CANDIDATE_KIND,
} from "../_shared/proactive_template_queue.ts"
import { computeNextRetryAtIso } from "../_shared/whatsapp_outbound_tracking.ts"
import {
  ACCESS_ENDED_NOTIFICATION_KIND,
  ACCESS_REACTIVATION_OFFER_KIND,
  accessEndedPurpose,
  buildAccessEndedInitialMessage,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_whatsapp.ts"
import {
  allowRelaunchGreetingFromLastMessage,
  applyWhatsappProactiveOpeningPolicy,
  applyScheduledCheckinGreetingPolicy,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts"

console.log("Process Checkins: Function initialized")

const QUIET_WINDOW_MINUTES = Number.parseInt((Deno.env.get("WHATSAPP_QUIET_WINDOW_MINUTES") ?? "").trim() || "20", 10)
const RECURRING_REMINDER_TEMPLATE_MONTHLY_LIMIT = 5
const RECURRING_REMINDER_TEMPLATE_QUOTA_KEY = "recurring_reminder_template"
const RECURRING_REMINDER_TEMPLATE_MIN_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret()
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`)
      ;(err as any).status = res.status
      ;(err as any).data = data
      throw err
    }
    return data
  } catch (error) {
    if ((error as any)?.status != null) throw error
    const err = new Error(`whatsapp-send internal request failed: ${(error as any)?.message ?? String(error)}`)
    ;(err as any).status = null
    ;(err as any).data = null
    throw err
  }
}

function shouldRetryScheduledCheckinDelivery(status: number | null | undefined): boolean {
  if (status == null) return true
  if (status === 429) return true
  if (status >= 500) return true
  return false
}

async function markScheduledCheckinDeliveryState(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  checkinId: string
  status: "retrying" | "failed" | "awaiting_user" | "sent" | "cancelled"
  attemptCount?: number | null
  scheduledFor?: string | null
  errorMessage?: string | null
  requestId?: string | null
}) {
  const patch: Record<string, unknown> = {
    status: params.status,
    processed_at: new Date().toISOString(),
  }
  if (params.attemptCount != null) patch.delivery_attempt_count = params.attemptCount
  if (params.scheduledFor != null) patch.scheduled_for = params.scheduledFor
  if (params.errorMessage !== undefined) {
    patch.delivery_last_error = params.errorMessage
    patch.delivery_last_error_at = params.errorMessage ? new Date().toISOString() : null
  }
  if (params.requestId !== undefined) patch.delivery_last_request_id = params.requestId
  await params.supabaseAdmin
    .from("scheduled_checkins")
    .update(patch as any)
    .eq("id", params.checkinId)
}

function getRecurringReminderIdFromEventContext(eventContext: string): string | null {
  const raw = String(eventContext ?? "").trim()
  const prefix = "recurring_reminder:"
  if (!raw.startsWith(prefix)) return null
  const id = raw.slice(prefix.length).trim()
  return id || null
}

async function consumeUnansweredRecurringProbe(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
  recurringReminderId: string
}): Promise<number> {
  const { supabaseAdmin, userId, recurringReminderId } = params
  const eventContext = `recurring_reminder:${recurringReminderId}`
  const { data: pendingRows, error } = await supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter("payload->>event_context", "eq", eventContext)
    .order("created_at", { ascending: true })
  if (error) throw error

  if (!pendingRows || pendingRows.length === 0) return 0

  for (const row of pendingRows as any[]) {
    await supabaseAdmin
      .from("whatsapp_pending_actions")
      .update({ status: "expired", processed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")

    if (row.scheduled_checkin_id) {
      await supabaseAdmin
        .from("scheduled_checkins")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", row.scheduled_checkin_id)
        .eq("status", "awaiting_user")
    }
  }

  return pendingRows.length
}

function monthKeyInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? "0000"
  const month = parts.find((p) => p.type === "month")?.value ?? "01"
  return `${year}-${month}`
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function likelyHasDailyBilanWinbackCandidateToday(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false
  if (!Boolean(profile.whatsapp_bilan_opted_in)) return false

  const pauseUntilMs = Math.max(
    parseIsoMs(profile.whatsapp_bilan_paused_until) ?? 0,
    parseIsoMs(profile.whatsapp_coaching_paused_until) ?? 0,
  )
  if (pauseUntilMs > Date.now()) return false

  const baselineMissed = Math.max(
    0,
    Math.min(30, Math.floor(Number(profile.whatsapp_bilan_missed_streak ?? 0))),
  )
  const currentWinbackStep = Math.max(
    0,
    Math.min(3, Math.floor(Number(profile.whatsapp_bilan_winback_step ?? 0))),
  )
  if (currentWinbackStep > 0 && currentWinbackStep < 3) return true

  const previousPromptMs = parseIsoMs(profile.whatsapp_bilan_last_prompt_at)
  const lastInboundMs = parseIsoMs(profile.whatsapp_last_inbound_at)
  const unresolvedPreviousPrompt = Boolean(
    previousPromptMs &&
      (!lastInboundMs || (lastInboundMs as number) < (previousPromptMs as number)),
  )
  const nextMissed = unresolvedPreviousPrompt
    ? Math.min(30, baselineMissed + 1)
    : 0
  return nextMissed >= 2
}

async function consumeMonthlyWhatsappQuota(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
  quotaKey: string
  monthKey: string
  limit: number
}): Promise<{ allowed: boolean; usedCount: number }> {
  const { data, error } = await params.supabaseAdmin.rpc("consume_whatsapp_monthly_quota", {
    p_user_id: params.userId,
    p_quota_key: params.quotaKey,
    p_month_key: params.monthKey,
    p_limit: params.limit,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: Boolean((row as any)?.allowed),
    usedCount: Number((row as any)?.used_count ?? 0),
  }
}

async function releaseMonthlyWhatsappQuota(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  userId: string
  quotaKey: string
  monthKey: string
}): Promise<number> {
  const { data, error } = await params.supabaseAdmin.rpc("release_whatsapp_monthly_quota", {
    p_user_id: params.userId,
    p_quota_key: params.quotaKey,
    p_month_key: params.monthKey,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return Number((row as any)?.used_count ?? 0)
}

async function processPendingProactiveTemplateCandidates(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  requestId: string
}) {
  const nowIso = new Date().toISOString()
  const { data: rows, error } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,user_id,payload,created_at,expires_at,not_before")
    .eq("kind", PROACTIVE_TEMPLATE_CANDIDATE_KIND)
    .eq("status", "pending")
    .or(`not_before.is.null,not_before.lte.${nowIso}`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) throw error
  if (!rows || rows.length === 0) return 0

  const grouped = new Map<string, any[]>()
  for (const row of rows as any[]) {
    const userId = String(row.user_id ?? "").trim()
    if (!userId) continue
    if (!grouped.has(userId)) grouped.set(userId, [])
    grouped.get(userId)!.push(row)
  }

  let processed = 0
  for (const [userId, userRows] of grouped.entries()) {
    const sorted = userRows.slice().sort((a, b) => {
      const ap = proactiveTemplatePriorityForPurpose(a?.payload?.purpose) || Number(a?.payload?.priority ?? 0)
      const bp = proactiveTemplatePriorityForPurpose(b?.payload?.purpose) || Number(b?.payload?.priority ?? 0)
      if (bp !== ap) return bp - ap
      return new Date(String(a?.created_at ?? 0)).getTime() - new Date(String(b?.created_at ?? 0)).getTime()
    })
    const winner = sorted[0]
    const losers = sorted.slice(1)
    const payload = (winner?.payload ?? {}) as any
    const purpose = String(payload.purpose ?? "").trim()

    let recurringQuotaMonthKey: string | null = null
    let recurringQuotaConsumed = false
    if (String(payload.follow_up_kind ?? "") === "recurring_reminder") {
      recurringQuotaMonthKey = monthKeyInTimezone(
        new Date(),
        String(payload.user_timezone ?? "Europe/Paris"),
      )
      try {
        const quotaResult = await consumeMonthlyWhatsappQuota({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
          monthKey: recurringQuotaMonthKey,
          limit: RECURRING_REMINDER_TEMPLATE_MONTHLY_LIMIT,
        })
        if (!quotaResult.allowed) {
          await params.supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({ status: "cancelled", processed_at: new Date().toISOString() })
            .eq("id", winner.id)
            .eq("status", "pending")
          if (payload.scheduled_checkin_id) {
            await params.supabaseAdmin
              .from("scheduled_checkins")
              .update({ status: "cancelled", processed_at: new Date().toISOString() })
              .eq("id", payload.scheduled_checkin_id)
              .eq("status", "pending")
          }
          continue
        }
        recurringQuotaConsumed = true
      } catch (e) {
        console.error(`[process-checkins] request_id=${params.requestId} candidate_quota_check_failed user_id=${userId}`, e)
        continue
      }
    }

    let sendRes: any = null
    try {
      sendRes = await callWhatsappSend({
        user_id: userId,
        message: payload.message,
        purpose,
        require_opted_in: payload.require_opted_in !== false,
        force_template: payload.force_template !== false,
        metadata_extra: {
          ...(payload.metadata_extra && typeof payload.metadata_extra === "object" ? payload.metadata_extra : {}),
          proactive_candidate_id: winner.id,
        },
      })
    } catch (e) {
      if (recurringQuotaConsumed && recurringQuotaMonthKey) {
        await releaseMonthlyWhatsappQuota({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
          monthKey: recurringQuotaMonthKey,
        }).catch(() => undefined)
      }
      const status = (e as any)?.status
      if (status === 429) continue
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", winner.id)
        .eq("status", "pending")
      if (payload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({ status: "cancelled", processed_at: new Date().toISOString() })
          .eq("id", payload.scheduled_checkin_id)
          .in("status", ["pending", "awaiting_user"] as any)
      }
      continue
    }

    const skipped = Boolean(sendRes?.skipped)
    if (skipped && recurringQuotaConsumed && recurringQuotaMonthKey) {
      await releaseMonthlyWhatsappQuota({
        supabaseAdmin: params.supabaseAdmin,
        userId,
        quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
        monthKey: recurringQuotaMonthKey,
      }).catch(() => undefined)
      if (payload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({ status: "cancelled", processed_at: new Date().toISOString() })
          .eq("id", payload.scheduled_checkin_id)
          .in("status", ["pending", "awaiting_user"] as any)
      }
    }

    if (!skipped) {
      const followUpKind = String(payload.follow_up_kind ?? "").trim()
      if (followUpKind === "weekly_bilan") {
        await params.supabaseAdmin.from("whatsapp_pending_actions").insert({
          user_id: userId,
          kind: "weekly_bilan",
          status: "pending",
          payload: {
            weekly_review_payload: payload.weekly_review_payload ?? null,
            source: "proactive_template_queue",
          },
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      } else if (followUpKind === "memory_echo") {
        await params.supabaseAdmin.from("whatsapp_pending_actions").insert({
          user_id: userId,
          kind: "memory_echo",
          status: "pending",
          payload: {
            strategy: payload.strategy ?? null,
            data: payload.data ?? null,
          },
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      } else if (followUpKind === "recurring_reminder") {
        if (payload.recurring_reminder_id) {
          await params.supabaseAdmin
            .from("user_recurring_reminders")
            .update({
              probe_last_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", payload.recurring_reminder_id)
            .eq("user_id", userId)
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
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
        if (payload.scheduled_checkin_id) {
          await params.supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "awaiting_user" })
            .eq("id", payload.scheduled_checkin_id)
            .eq("status", "pending")
        }
      }
    }

    await params.supabaseAdmin
      .from("whatsapp_pending_actions")
      .update({ status: skipped ? "cancelled" : "done", processed_at: new Date().toISOString() })
      .eq("id", winner.id)
      .eq("status", "pending")

    for (const loser of losers) {
      const loserPayload = (loser?.payload ?? {}) as any
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", loser.id)
        .eq("status", "pending")
      if (String(loserPayload.follow_up_kind ?? "") === "recurring_reminder" && loserPayload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({ status: "cancelled", processed_at: new Date().toISOString() })
          .eq("id", loserPayload.scheduled_checkin_id)
          .eq("status", "pending")
      }
    }

    processed++
  }

  return processed
}

async function processPendingAccessEndedNotifications(params: {
  supabaseAdmin: ReturnType<typeof createClient>
  requestId: string
}) {
  const nowIso = new Date().toISOString()
  const { data: rows, error } = await params.supabaseAdmin
    .from("whatsapp_pending_actions")
    .select("id,user_id,payload,created_at,expires_at")
    .eq("kind", ACCESS_ENDED_NOTIFICATION_KIND)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100)
  if (error) throw error
  if (!rows || rows.length === 0) return 0

  let processed = 0
  for (const row of rows as any[]) {
    const expiresAt = typeof row?.expires_at === "string" ? row.expires_at : null
    if (expiresAt && expiresAt <= nowIso) {
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "expired", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending")
      continue
    }

    const payload = (row?.payload ?? {}) as Record<string, unknown>
    const reason = normalizeAccessEndedReason(payload.ended_reason)
    if (!reason) {
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending")
      continue
    }

    const { data: profile, error: profileErr } = await params.supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", row.user_id)
      .maybeSingle()
    if (profileErr) throw profileErr

    const bodyText = buildAccessEndedInitialMessage({
      reason,
      firstName: String((profile as any)?.full_name ?? ""),
    })

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
      })

      if (Boolean((resp as any)?.skipped)) {
        await params.supabaseAdmin
          .from("whatsapp_pending_actions")
          .update({ status: "cancelled", processed_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", "pending")
        continue
      }

      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("user_id", row.user_id)
        .eq("kind", ACCESS_REACTIVATION_OFFER_KIND)
        .eq("status", "pending")

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
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      if (replyErr) throw replyErr

      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")

      processed++
    } catch (e) {
      const status = (e as any)?.status
      if (status === 429) continue
      await params.supabaseAdmin
        .from("whatsapp_pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
    }
  }

  return processed
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 0) Flush deferred proactive WhatsApp messages when conversation has been quiet.
    // This avoids sending memory echos mid-conversation.
    const nowIso = new Date().toISOString()
    const quietMs = QUIET_WINDOW_MINUTES * 60 * 1000
    const { data: deferred, error: defErr } = await supabaseAdmin
      .from("whatsapp_pending_actions")
      .select("id, user_id, payload, not_before, expires_at, created_at")
      .eq("kind", "deferred_send")
      .eq("status", "pending")
      .or(`not_before.is.null,not_before.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(50)
    if (defErr) throw defErr

    let flushedCount = 0
    if (deferred && deferred.length > 0) {
      for (const row of deferred as any[]) {
        // Ensure quiet window is satisfied before sending.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", row.user_id)
          .maybeSingle()
        const lastInbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at ? new Date((profile as any).whatsapp_last_outbound_at).getTime() : null
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0)
        if (lastActivity > 0 && Date.now() - lastActivity < quietMs) {
          // Still active: keep pending for next run.
          continue
        }

        const p = row.payload ?? {}
        const purpose = (p as any)?.purpose ?? null
        const message = (p as any)?.message ?? null
        const requireOptedIn = (p as any)?.require_opted_in
        const metadataExtra = (p as any)?.metadata_extra
        let bodyText = (message && (message as any).type === "text") ? String((message as any).body ?? "") : ""
        try {
          const { data: profileForGreeting } = await supabaseAdmin
            .from("profiles")
            .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
            .eq("id", row.user_id)
            .maybeSingle()
          const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
            lastInboundAt: (profileForGreeting as any)?.whatsapp_last_inbound_at,
            lastOutboundAt: (profileForGreeting as any)?.whatsapp_last_outbound_at,
          })
          bodyText = applyWhatsappProactiveOpeningPolicy({
            text: bodyText,
            allowRelaunchGreeting,
            fallback: "Comment ça va ?",
          })
          if (message && (message as any).type === "text") {
            ;(message as any).body = bodyText
          }
        } catch (e) {
          console.warn(`[process-checkins] request_id=${requestId} deferred_greeting_policy_failed pending_id=${row.id}`, e)
        }

        try {
          await callWhatsappSend({
            user_id: row.user_id,
            message,
            purpose,
            require_opted_in: requireOptedIn,
            metadata_extra: metadataExtra,
          })

          await supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({ status: "done", processed_at: new Date().toISOString() })
            .eq("id", row.id)
          flushedCount++
        } catch (e) {
          const status = (e as any)?.status
          // 429 throttle => keep pending, retry later.
          if (status === 429) continue

          // If WhatsApp can't be used (not opted in / paywall / missing phone), fall back to in-app log and stop retrying.
          if (bodyText.trim()) {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: row.user_id,
              role: "assistant",
              content: bodyText,
              agent_used: "philosopher",
              metadata: { source: "deferred_send_fallback", purpose, ...(metadataExtra && typeof metadataExtra === "object" ? metadataExtra : {}) },
            })
          }
          await supabaseAdmin
            .from("whatsapp_pending_actions")
            .update({ status: "cancelled", processed_at: new Date().toISOString() })
            .eq("id", row.id)
        }
      }
    }

    const processedAccessBefore = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    })

    const processedQueuedBefore = await processPendingProactiveTemplateCandidates({
      supabaseAdmin,
      requestId,
    })

    // 1. Fetch due checkins, including transiently retrying ones.
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from('scheduled_checkins')
      .select('id, user_id, draft_message, event_context, message_mode, message_payload, delivery_attempt_count')
      .in('status', ['pending', 'retrying'])
      .lte('scheduled_for', new Date().toISOString())
      .limit(50) // Batch size limit

    if (fetchError) throw fetchError

    if (!checkins || checkins.length === 0) {
      const processedAccessAfter = await processPendingAccessEndedNotifications({
        supabaseAdmin,
        requestId,
      })
      const processedQueuedAfter = await processPendingProactiveTemplateCandidates({
        supabaseAdmin,
        requestId,
      })
      return jsonResponse(
        req,
        {
          message: "No checkins to process",
          flushed_deferred: flushedCount,
          processed_access_notifications: processedAccessBefore + processedAccessAfter,
          processed_proactive_candidates: processedQueuedBefore + processedQueuedAfter,
          request_id: requestId,
        },
        { includeCors: false },
      )
    }

    console.log(`[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`)
    let processedCount = 0

    for (const checkin of checkins) {
      const eventContext = String((checkin as any)?.event_context ?? "")
      const recurringReminderId = getRecurringReminderIdFromEventContext(eventContext)
      let userTimezone = "Europe/Paris"
      let userProfileSnapshot: Record<string, unknown> | null = null

      // Recurring reminders: if previous consent probes were unanswered, count them.
      // After 2 unanswered probes, auto-pause the reminder and stop future sends.
      if (recurringReminderId) {
        try {
          const newlyUnanswered = await consumeUnansweredRecurringProbe({
            supabaseAdmin,
            userId: checkin.user_id,
            recurringReminderId,
          })

          const { data: reminder } = await supabaseAdmin
            .from("user_recurring_reminders")
            .select("id,status,unanswered_probe_count,probe_last_sent_at")
            .eq("id", recurringReminderId)
            .eq("user_id", checkin.user_id)
            .maybeSingle()

          if (!reminder || (reminder as any).status !== "active") {
            await supabaseAdmin
              .from("scheduled_checkins")
              .update({ status: "cancelled", processed_at: new Date().toISOString() })
              .eq("id", checkin.id)
            continue
          }

          const currentMisses = Number((reminder as any).unanswered_probe_count ?? 0)
          const misses = Math.max(0, Math.min(2, currentMisses + newlyUnanswered))
          if (newlyUnanswered > 0) {
            await supabaseAdmin
              .from("user_recurring_reminders")
              .update({
                unanswered_probe_count: misses,
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", recurringReminderId)
              .eq("user_id", checkin.user_id)
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
              .eq("user_id", checkin.user_id)

            await supabaseAdmin
              .from("scheduled_checkins")
              .update({ status: "cancelled", processed_at: new Date().toISOString() })
              .eq("id", checkin.id)
            continue
          }
        } catch (e) {
          console.warn(`[process-checkins] request_id=${requestId} recurring_probe_policy_failed checkin_id=${checkin.id}`, e)
        }
      }

      let in24hConversationWindow = false

      // Quiet window: don't interrupt an active WhatsApp conversation.
      // If the user was active recently, push the checkin a bit later instead of sending now.
      {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at, timezone, whatsapp_coaching_paused_until, whatsapp_bilan_opted_in, whatsapp_bilan_paused_until, whatsapp_bilan_missed_streak, whatsapp_bilan_last_prompt_at, whatsapp_bilan_winback_step")
          .eq("id", checkin.user_id)
          .maybeSingle()
        userProfileSnapshot = (profile as Record<string, unknown> | null) ?? null
        userTimezone = String((profile as any)?.timezone ?? "").trim() || "Europe/Paris"
        const coachingPauseUntilMs = (profile as any)?.whatsapp_coaching_paused_until
          ? new Date((profile as any).whatsapp_coaching_paused_until).getTime()
          : NaN
        if (
          eventContext === "morning_active_actions_nudge" &&
          Number.isFinite(coachingPauseUntilMs) &&
          coachingPauseUntilMs > Date.now()
        ) {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "cancelled", processed_at: new Date().toISOString() })
            .eq("id", checkin.id)
          continue
        }
        const lastInbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at ? new Date((profile as any).whatsapp_last_outbound_at).getTime() : null
        in24hConversationWindow = lastInbound !== null && Date.now() - lastInbound < 24 * 60 * 60 * 1000
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0)
        if (lastActivity > 0 && Date.now() - lastActivity < quietMs) {
          const waitMs = Math.max(0, quietMs - (Date.now() - lastActivity))
          const nextIso = new Date(Date.now() + waitMs).toISOString()
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ scheduled_for: nextIso })
            .eq("id", checkin.id)
          continue
        }
      }

      // Morning action nudges must never open a closed WhatsApp conversation via template.
      if (eventContext === "morning_active_actions_nudge" && !in24hConversationWindow) {
        await supabaseAdmin
          .from("scheduled_checkins")
          .update({ status: "cancelled", processed_at: new Date().toISOString() })
          .eq("id", checkin.id)
        continue
      }

      // 2) Prefer WhatsApp send (text if window open, template fallback if closed).
      // If the user isn't opted in / no phone: fall back to logging into chat_messages only.
      let sentViaWhatsapp = false
      let usedTemplate = false
      
      // Generate bodyText BEFORE try/catch so it's available for fallback
      const mode = String((checkin as any)?.message_mode ?? "static").trim().toLowerCase()
      const payload = ((checkin as any)?.message_payload ?? {}) as any
      let bodyText = String((checkin as any)?.draft_message ?? "").trim()
      if (mode === "dynamic") {
        try {
          bodyText = await generateDynamicWhatsAppCheckinMessage({
            admin: supabaseAdmin as any,
            userId: checkin.user_id,
            eventContext: String((checkin as any)?.event_context ?? "check-in"),
            scheduledFor: String((checkin as any)?.scheduled_for ?? ""),
            instruction: String(payload?.instruction ?? payload?.note ?? ""),
            eventGrounding: String(payload?.event_grounding ?? ""),
            requestId,
          })
        } catch (e) {
          // Fallback to stored draft if dynamic generation fails.
          console.warn(`[process-checkins] request_id=${requestId} dynamic_generation_failed checkin_id=${checkin.id}`, e)
          bodyText = String((checkin as any)?.draft_message ?? "").trim() || "Comment ça va depuis tout à l'heure ?"
        }
      }
      // Ensure bodyText is never empty/null for the fallback
      if (!bodyText.trim()) {
        bodyText = "Comment ça va depuis tout à l'heure ?"
      }

      // Greeting policy for scheduled_checkins only:
      // - if messages were exchanged today (local user day): no greeting prefix
      // - otherwise: prepend a short cold-open greeting variant
      try {
        const { data: profileForGreeting } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", checkin.user_id)
          .maybeSingle()
        const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
          lastInboundAt: (profileForGreeting as any)?.whatsapp_last_inbound_at,
          lastOutboundAt: (profileForGreeting as any)?.whatsapp_last_outbound_at,
        })
        bodyText = applyScheduledCheckinGreetingPolicy({ text: bodyText, allowRelaunchGreeting })
      } catch (e) {
        console.warn(`[process-checkins] request_id=${requestId} greeting_policy_failed checkin_id=${checkin.id}`, e)
      }
      // Needed for purpose tagging in both WhatsApp and fallback logging paths.
      const isBilanReschedule = eventContext === "daily_bilan_reschedule"
      const checkinPurpose = isBilanReschedule
        ? "daily_bilan"
        : (recurringReminderId ? "recurring_reminder" : "scheduled_checkin")
      const recurringReminderNeedsTemplate = Boolean(recurringReminderId) && !in24hConversationWindow
      let recurringReminderQuotaConsumed = false
      let recurringReminderQuotaMonthKey: string | null = null
      const attemptCount = Math.max(1, Number((checkin as any)?.delivery_attempt_count ?? 0) + 1)

      if (recurringReminderNeedsTemplate) {
        const { data: reminder } = await supabaseAdmin
          .from("user_recurring_reminders")
          .select("probe_last_sent_at")
          .eq("id", recurringReminderId as string)
          .eq("user_id", checkin.user_id)
          .maybeSingle()
        const lastProbeSentMs = parseIsoMs((reminder as any)?.probe_last_sent_at)
        if (lastProbeSentMs !== null && Date.now() - lastProbeSentMs < RECURRING_REMINDER_TEMPLATE_MIN_INTERVAL_MS) {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "cancelled", processed_at: new Date().toISOString() })
            .eq("id", checkin.id)
          console.log(
            `[process-checkins] request_id=${requestId} recurring_reminder_template_cooldown checkin_id=${checkin.id} user_id=${checkin.user_id}`,
          )
          continue
        }

        if (likelyHasDailyBilanWinbackCandidateToday(userProfileSnapshot)) {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "cancelled", processed_at: new Date().toISOString() })
            .eq("id", checkin.id)
          console.log(
            `[process-checkins] request_id=${requestId} recurring_reminder_skipped_for_bilan_winback checkin_id=${checkin.id} user_id=${checkin.user_id}`,
          )
          continue
        }
        await enqueueProactiveTemplateCandidate(supabaseAdmin as any, {
          userId: checkin.user_id,
          purpose: "recurring_reminder",
          message: {
            type: "template",
            name: (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_NAME") ?? "sophia_reminder_consent_v1_").trim(),
            language: (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_LANG") ?? "fr").trim(),
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
            draft_message: (checkin as any)?.draft_message ?? null,
            event_context: checkin.event_context,
            message_mode: (checkin as any)?.message_mode ?? "static",
            message_payload: (checkin as any)?.message_payload ?? {},
            recurring_reminder_id: recurringReminderId,
            user_timezone: userTimezone,
          },
          dedupeKey: `recurring_reminder:${checkin.id}`,
        })
        continue
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
        })
        const skipped = Boolean((resp as any)?.skipped)
        usedTemplate = Boolean((resp as any)?.used_template)
        sentViaWhatsapp = !skipped
        if (skipped && recurringReminderQuotaConsumed && recurringReminderQuotaMonthKey) {
          try {
            await releaseMonthlyWhatsappQuota({
              supabaseAdmin,
              userId: checkin.user_id,
              quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
              monthKey: recurringReminderQuotaMonthKey,
            })
            recurringReminderQuotaConsumed = false
          } catch (releaseErr) {
            console.error(
              `[process-checkins] request_id=${requestId} recurring_reminder_monthly_quota_release_failed checkin_id=${checkin.id}`,
              releaseErr,
            )
          }
        }
        if (skipped) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: String((resp as any)?.skip_reason ?? "scheduled_checkin_skipped"),
            requestId: String((resp as any)?.request_id ?? requestId),
          })
          continue
        }
      } catch (e) {
        const status = (e as any)?.status
        const msg = e instanceof Error ? e.message : String(e)
        const downstreamData = (e as any)?.data ?? null
        const downstreamRequestId = typeof downstreamData?.request_id === "string"
          ? String(downstreamData.request_id)
          : requestId
        if (recurringReminderQuotaConsumed && recurringReminderQuotaMonthKey) {
          try {
            await releaseMonthlyWhatsappQuota({
              supabaseAdmin,
              userId: checkin.user_id,
              quotaKey: RECURRING_REMINDER_TEMPLATE_QUOTA_KEY,
              monthKey: recurringReminderQuotaMonthKey,
            })
          } catch (releaseErr) {
            console.error(
              `[process-checkins] request_id=${requestId} recurring_reminder_monthly_quota_release_failed checkin_id=${checkin.id}`,
              releaseErr,
            )
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
        })
        if (shouldRetryScheduledCheckinDelivery(status)) {
          const nextRetryAt = computeNextRetryAtIso(attemptCount)
          console.warn(`[process-checkins] request_id=${requestId} retrying_checkin checkin_id=${checkin.id} next_retry_at=${nextRetryAt}`)
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "retrying",
            attemptCount,
            scheduledFor: nextRetryAt,
            errorMessage: msg,
            requestId: downstreamRequestId,
          })
          continue
        }
        console.error(`[process-checkins] request_id=${requestId} whatsapp_send_failed checkin_id=${checkin.id}`, msg)
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "failed",
          attemptCount,
          errorMessage: msg,
          requestId: downstreamRequestId,
        })
        continue
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
            .eq("user_id", checkin.user_id)
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
              draft_message: (checkin as any)?.draft_message ?? null,
              event_context: checkin.event_context,
              message_mode: (checkin as any)?.message_mode ?? "static",
              message_payload: (checkin as any)?.message_payload ?? {},
              recurring_reminder_id: recurringReminderId,
            },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })

        if (pendErr) {
          console.error(`[process-checkins] request_id=${requestId} pending_insert_failed checkin_id=${checkin.id}`, pendErr)
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
          })
          // The template already went out on WhatsApp, so keep a terminal sent state.
        } else {
          const stErr = await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "awaiting_user",
            attemptCount,
            errorMessage: null,
            requestId,
          }).catch((error) => error)
          if (stErr) console.error(`[process-checkins] request_id=${requestId} mark_awaiting_failed checkin_id=${checkin.id}`, stErr)
          continue
        }
      }

      // 3. Mark as sent
      const updateError = await markScheduledCheckinDeliveryState({
        supabaseAdmin,
        checkinId: checkin.id,
        status: "sent",
        attemptCount,
        errorMessage: null,
        requestId,
      }).catch((error) => error)

      if (updateError) {
        console.error(`[process-checkins] request_id=${requestId} mark_sent_failed checkin_id=${checkin.id}`, updateError)
        // Note: This might result in duplicate message if retried, but rare
      } else {
        processedCount++
      }
    }

    const processedAccessAfter = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    })
    const processedQueuedAfter = await processPendingProactiveTemplateCandidates({
      supabaseAdmin,
      requestId,
    })

    return jsonResponse(
      req,
      {
        success: true,
        processed: processedCount,
        flushed_deferred: flushedCount,
        processed_access_notifications: processedAccessBefore + processedAccessAfter,
        processed_proactive_candidates: processedQueuedBefore + processedQueuedAfter,
        request_id: requestId,
      },
      { includeCors: false },
    )

  } catch (error) {
    console.error(`[process-checkins] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
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
    })
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})

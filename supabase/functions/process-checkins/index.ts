/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { generateDynamicWhatsAppCheckinMessage } from "../_shared/scheduled_checkins.ts"

console.log("Process Checkins: Function initialized")

const QUIET_WINDOW_MINUTES = Number.parseInt((Deno.env.get("WHATSAPP_QUIET_WINDOW_MINUTES") ?? "").trim() || "20", 10)

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
        const bodyText = (message && (message as any).type === "text") ? String((message as any).body ?? "") : ""

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

    // 1. Fetch pending checkins that are due
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from('scheduled_checkins')
      .select('id, user_id, draft_message, event_context, message_mode, message_payload')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50) // Batch size limit

    if (fetchError) throw fetchError

    if (!checkins || checkins.length === 0) {
      return jsonResponse(
        req,
        { message: "No checkins to process", flushed_deferred: flushedCount, request_id: requestId },
        { includeCors: false },
      )
    }

    console.log(`[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`)
    let processedCount = 0

    for (const checkin of checkins) {
      const eventContext = String((checkin as any)?.event_context ?? "")
      const recurringReminderId = getRecurringReminderIdFromEventContext(eventContext)

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
            .select("id,status,unanswered_probe_count")
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

      // Quiet window: don't interrupt an active WhatsApp conversation.
      // If the user was active recently, push the checkin a bit later instead of sending now.
      {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("whatsapp_last_inbound_at, whatsapp_last_outbound_at")
          .eq("id", checkin.user_id)
          .maybeSingle()
        const lastInbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
        const lastOutbound = (profile as any)?.whatsapp_last_outbound_at ? new Date((profile as any).whatsapp_last_outbound_at).getTime() : null
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
            instruction: String(payload?.instruction ?? payload?.note ?? ""),
            eventGrounding: String(payload?.event_grounding ?? ""),
            requestId,
          })
        } catch (e) {
          // Fallback to stored draft if dynamic generation fails.
          console.warn(`[process-checkins] request_id=${requestId} dynamic_generation_failed checkin_id=${checkin.id}`, e)
          bodyText = String((checkin as any)?.draft_message ?? "").trim() || "Petit check-in: comment ça va depuis tout à l'heure ?"
        }
      }
      // Ensure bodyText is never empty/null for the fallback
      if (!bodyText.trim()) {
        bodyText = "Petit check-in: comment ça va depuis tout à l'heure ?"
      }
      // Needed for purpose tagging in both WhatsApp and fallback logging paths.
      const isBilanReschedule = eventContext === "daily_bilan_reschedule"
      const checkinPurpose = isBilanReschedule
        ? "daily_bilan"
        : (recurringReminderId ? "recurring_reminder" : "scheduled_checkin")

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
        usedTemplate = Boolean((resp as any)?.used_template)
        sentViaWhatsapp = true
      } catch (e) {
        const status = (e as any)?.status
        const msg = e instanceof Error ? e.message : String(e)
        // 429 throttle => retry later, keep pending.
        if (status === 429) {
          console.warn(`[process-checkins] request_id=${requestId} throttled checkin_id=${checkin.id}`)
          continue
        }
        // 409 not opted in / phone invalid => fall back to in-app log.
        if (status === 409) {
          sentViaWhatsapp = false
        } else {
          console.error(`[process-checkins] request_id=${requestId} whatsapp_send_failed checkin_id=${checkin.id}`, msg)
          // fall back to in-app log on any other error
          sentViaWhatsapp = false
        }
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
          // fall back to marking as sent to avoid infinite loop
        } else {
          const { error: stErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .update({ status: "awaiting_user" })
            .eq("id", checkin.id)
          if (stErr) console.error(`[process-checkins] request_id=${requestId} mark_awaiting_failed checkin_id=${checkin.id}`, stErr)
          continue
        }
      }

      // For bilan reschedules: log with purpose "daily_bilan" so the user's response
      // gets intercepted by the bilan flow (hasBilanContext checks for this purpose).
      if (!sentViaWhatsapp) {
        // Use bodyText (which includes dynamically generated message) instead of draft_message
        const { error: msgError } = await supabaseAdmin
          .from('chat_messages')
          .insert({
            user_id: checkin.user_id,
            role: 'assistant',
            content: bodyText,
            agent_used: 'companion',
            metadata: {
              channel: "whatsapp",
              source: 'scheduled_checkin',
              event_context: checkin.event_context,
              original_checkin_id: checkin.id,
              purpose: checkinPurpose,
            }
          })

        if (msgError) {
          console.error(`[process-checkins] request_id=${requestId} log_failed checkin_id=${checkin.id}`, msgError)
          continue
        }
      }

      // 3. Mark as sent
      const { error: updateError } = await supabaseAdmin
        .from('scheduled_checkins')
        .update({
          status: 'sent',
          processed_at: new Date().toISOString()
        })
        .eq('id', checkin.id)

      if (updateError) {
        console.error(`[process-checkins] request_id=${requestId} mark_sent_failed checkin_id=${checkin.id}`, updateError)
        // Note: This might result in duplicate message if retried, but rare
      } else {
        processedCount++
      }
    }

    return jsonResponse(
      req,
      { success: true, processed: processedCount, flushed_deferred: flushedCount, request_id: requestId },
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

/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2.87.3'
import { ensureInternalRequest } from '../_shared/internal-auth.ts'
import { getRequestId, jsonResponse } from "../_shared/http.ts"

console.log("Process Checkins: Function initialized")

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

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch pending checkins that are due
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from('scheduled_checkins')
      .select('id, user_id, draft_message, event_context')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50) // Batch size limit

    if (fetchError) throw fetchError

    if (!checkins || checkins.length === 0) {
      return jsonResponse(req, { message: "No checkins to process", request_id: requestId }, { includeCors: false })
    }

    console.log(`[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`)
    let processedCount = 0

    for (const checkin of checkins) {
      // 2) Prefer WhatsApp send (text if window open, template fallback if closed).
      // If the user isn't opted in / no phone: fall back to logging into chat_messages only.
      let sentViaWhatsapp = false
      let usedTemplate = false
      try {
        const resp = await callWhatsappSend({
          user_id: checkin.user_id,
          message: { type: "text", body: checkin.draft_message },
          purpose: "scheduled_checkin",
          require_opted_in: true,
          metadata_extra: {
            source: "scheduled_checkin",
            event_context: checkin.event_context,
            original_checkin_id: checkin.id,
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
        // Create pending action for this user, and mark checkin as awaiting_user to avoid spamming.
        const { error: pendErr } = await supabaseAdmin
          .from("whatsapp_pending_actions")
          .insert({
            user_id: checkin.user_id,
            kind: "scheduled_checkin",
            status: "pending",
            scheduled_checkin_id: checkin.id,
            payload: {
              draft_message: checkin.draft_message,
              event_context: checkin.event_context,
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

      if (!sentViaWhatsapp) {
        const { error: msgError } = await supabaseAdmin
          .from('chat_messages')
          .insert({
            user_id: checkin.user_id,
            role: 'assistant',
            content: checkin.draft_message,
            agent_used: 'companion',
            metadata: {
              source: 'scheduled_checkin',
              event_context: checkin.event_context,
              original_checkin_id: checkin.id
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
      { success: true, processed: processedCount, request_id: requestId },
      { includeCors: false },
    )

  } catch (error) {
    console.error(`[process-checkins] request_id=${requestId}`, error)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


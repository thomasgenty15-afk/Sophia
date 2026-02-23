import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "../_shared/gemini.ts"
import { fetchLatestPending, markPending } from "./wa_db.ts"
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"
import { generateDynamicWhatsAppCheckinMessage } from "../_shared/scheduled_checkins.ts"
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts"
import { classifyBilanResponse } from "./handlers_optin_bilan.ts"

export async function handlePendingActions(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  requestId: string
  isOptInYes: boolean
  isCheckinYes: boolean
  isCheckinLater: boolean
  isEchoYes: boolean
  isEchoLater: boolean
  inboundText: string
}): Promise<boolean> {
  const { admin, userId, fromE164, requestId } = params

  // If user accepts a scheduled check-in template, send the actual draft_message immediately.
  if (params.isCheckinYes && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "scheduled_checkin")
    // Don't swallow generic "oui" messages if there is no pending scheduled_checkin.
    if (!pending) return false

    // If linked to a scheduled_checkins row and marked as dynamic, generate the text right now.
    const scheduledId = (pending as any)?.scheduled_checkin_id ?? null
    const payload = (pending as any)?.payload ?? {}
    const mode = String((payload as any)?.message_mode ?? "static").trim().toLowerCase()
    const payloadEventContext = String((payload as any)?.event_context ?? "")
    let outboundEventContext = payloadEventContext
    let outboundPurpose = payloadEventContext === "daily_bilan_reschedule" ? "daily_bilan" : "scheduled_checkin"
    const draft = (payload as any)?.draft_message
    let textToSend = typeof draft === "string" ? draft.trim() : ""
    if (scheduledId && mode === "dynamic") {
      try {
        const { data: row } = await admin
          .from("scheduled_checkins")
          .select("event_context,message_payload,draft_message")
          .eq("id", scheduledId)
          .maybeSingle()
        const p2 = (row as any)?.message_payload ?? {}
        const rowEventContext = String((row as any)?.event_context ?? payloadEventContext)
        outboundEventContext = rowEventContext || payloadEventContext
        outboundPurpose = outboundEventContext === "daily_bilan_reschedule" ? "daily_bilan" : "scheduled_checkin"
        textToSend = await generateDynamicWhatsAppCheckinMessage({
          admin,
          userId,
          eventContext: rowEventContext || "check-in",
          instruction: String((p2 as any)?.instruction ?? (payload as any)?.message_payload?.instruction ?? ""),
        })
      } catch {
        // best-effort fallback
        textToSend = textToSend || "Petit check-in: comment ça va depuis tout à l’heure ?"
      }
    }
    if (!textToSend.trim()) {
      textToSend = "Petit check-in: comment ça va depuis tout à l'heure ?"
    }

    if (textToSend.trim()) {
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: textToSend,
        purpose: outboundPurpose,
        isProactive: false,
      })
      const outId = (sendResp as any)?.messages?.[0]?.id ?? null
      const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: textToSend,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "scheduled_checkin",
          purpose: outboundPurpose,
          event_context: outboundEventContext || null,
        },
      })
    }

    // mark scheduled_checkin as sent
    if ((pending as any).scheduled_checkin_id) {
      await admin
        .from("scheduled_checkins")
        .update({ status: "sent", processed_at: new Date().toISOString() })
        .eq("id", (pending as any).scheduled_checkin_id)
    }

    // Any explicit user response to recurring reminder probe resets unanswered counter.
    if (String(outboundEventContext).startsWith("recurring_reminder:")) {
      const recurringReminderId = String(outboundEventContext).slice("recurring_reminder:".length).trim()
      if (recurringReminderId) {
        await admin
          .from("user_recurring_reminders")
          .update({
            unanswered_probe_count: 0,
            probe_paused_at: null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", recurringReminderId)
          .eq("user_id", userId)
      }
    }

    await markPending(admin, (pending as any).id, "done")
    return true
  }

  // If user says later for check-in, cancel and reschedule in 10 minutes.
  if (params.isCheckinLater && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "scheduled_checkin")
    // Don't swallow generic "plus tard" messages if there is no pending scheduled_checkin.
    if (!pending) return false

    if ((pending as any)?.scheduled_checkin_id) {
      await admin
        .from("scheduled_checkins")
        .update({ status: "pending", scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
        .eq("id", (pending as any).scheduled_checkin_id)
    }

    const payloadEventContext = String((pending as any)?.payload?.event_context ?? "")
    if (payloadEventContext.startsWith("recurring_reminder:")) {
      const recurringReminderId = payloadEventContext.slice("recurring_reminder:".length).trim()
      if (recurringReminderId) {
        await admin
          .from("user_recurring_reminders")
          .update({
            unanswered_probe_count: 0,
            probe_paused_at: null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", recurringReminderId)
          .eq("user_id", userId)
      }
    }

    await markPending(admin, (pending as any).id, "cancelled")
    const okMsg = "Ok, je te relance un peu plus tard 🙂"
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: "scheduled_checkin",
      isProactive: false,
    })
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, outbound_tracking_id: outboundTrackingId, is_proactive: false },
    })
    return true
  }

  // Memory echo: user accepts -> send a short intro then generate and send the actual echo.
  if (params.isEchoYes && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo")
    // IMPORTANT: Don't swallow generic "vas-y"/"oui" if there is no pending memory_echo.
    if (!pending) return false

    const intro = "Ok 🙂 Laisse-moi 2 secondes, je te retrouve ça…"
    const introResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: intro,
      purpose: "memory_echo",
      isProactive: false,
    })
    const introId = (introResp as any)?.messages?.[0]?.id ?? null
    const introTrackingId = (introResp as any)?.outbound_tracking_id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: intro,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: introId, outbound_tracking_id: introTrackingId, is_proactive: false, source: "memory_echo" },
    })

    const strategy = (pending.payload as any)?.strategy
    const data = (pending.payload as any)?.data
    const { data: prof } = await admin
      .from("profiles")
      .select("timezone, locale")
      .eq("id", userId)
      .maybeSingle()
    const tctx = buildUserTimeContextFromValues({ timezone: (prof as any)?.timezone ?? null, locale: (prof as any)?.locale ?? null })
    const prompt =
      `Tu es "L'Archiviste", une facette de Sophia.\n` +
      `Repères temporels (critiques):\n${tctx.prompt_block}\n\n` +
      `Stratégie: ${strategy}\n` +
      `Données: ${JSON.stringify(data)}\n\n` +
      `Génère un message bref, impactant et bienveillant qui reconnecte l'utilisateur à cet élément du passé.`
    const echo = await generateWithGemini(prompt, "Génère le message d'écho.", 0.7)

    const echoResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: String(echo),
      purpose: "memory_echo",
      isProactive: false,
    })
    const echoId = (echoResp as any)?.messages?.[0]?.id ?? null
    const echoTrackingId = (echoResp as any)?.outbound_tracking_id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: String(echo),
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: echoId, outbound_tracking_id: echoTrackingId, is_proactive: false, source: "memory_echo" },
    })

    await markPending(admin, (pending as any).id, "done")
    return true
  }

  if (params.isEchoLater && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo")
    // Don't swallow generic "plus tard" if there is no pending memory_echo.
    if (!pending) return false

    await markPending(admin, (pending as any).id, "cancelled")
    const okMsg = "Ok 🙂 Je garde ça sous le coude. Dis-moi quand tu veux."
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: "memory_echo",
      isProactive: false,
    })
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, outbound_tracking_id: outboundTrackingId, is_proactive: false },
    })
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BILAN RESCHEDULE: removed (we no longer reschedule bilans)
  // ═══════════════════════════════════════════════════════════════════════════

  return false
}

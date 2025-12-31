import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { generateWithGemini } from "../_shared/gemini.ts"
import { fetchLatestPending, markPending } from "./wa_db.ts"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"

export async function handlePendingActions(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  isOptInYes: boolean
  isCheckinYes: boolean
  isCheckinLater: boolean
  isEchoYes: boolean
  isEchoLater: boolean
}): Promise<boolean> {
  const { admin, userId, fromE164 } = params

  // If user accepts a scheduled check-in template, send the actual draft_message immediately.
  if (params.isCheckinYes && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "scheduled_checkin")
    if (pending) {
      const draft = (pending.payload as any)?.draft_message
      if (typeof draft === "string" && draft.trim()) {
        const sendResp = await sendWhatsAppText(fromE164, draft)
        const outId = (sendResp as any)?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: userId,
          scope: "whatsapp",
          role: "assistant",
          content: draft,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, source: "scheduled_checkin" },
        })
      }
      // mark scheduled_checkin as sent
      if ((pending as any).scheduled_checkin_id) {
        await admin
          .from("scheduled_checkins")
          .update({ status: "sent", processed_at: new Date().toISOString() })
          .eq("id", (pending as any).scheduled_checkin_id)
      }
      await markPending(admin, (pending as any).id, "done")
    }
    return true
  }

  // If user says later for check-in, cancel and reschedule in 10 minutes.
  if (params.isCheckinLater && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "scheduled_checkin")
    if ((pending as any)?.scheduled_checkin_id) {
      await admin
        .from("scheduled_checkins")
        .update({ status: "pending", scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
        .eq("id", (pending as any).scheduled_checkin_id)
      await markPending(admin, (pending as any).id, "cancelled")
    }
    const okMsg = "Ok, je te relance un peu plus tard 🙂"
    const sendResp = await sendWhatsAppText(fromE164, okMsg)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
    })
    return true
  }

  // Memory echo: user accepts -> send a short intro then generate and send the actual echo.
  if (params.isEchoYes && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo")
    if (pending) {
      const intro = "Ok 🙂 Laisse-moi 2 secondes, je te retrouve ça…"
      const introResp = await sendWhatsAppText(fromE164, intro)
      const introId = (introResp as any)?.messages?.[0]?.id ?? null
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: intro,
        agent_used: "companion",
        metadata: { channel: "whatsapp", wa_outbound_message_id: introId, is_proactive: false, source: "memory_echo" },
      })

      const strategy = (pending.payload as any)?.strategy
      const data = (pending.payload as any)?.data
      const prompt =
        `Tu es \"L'Archiviste\", une facette de Sophia.\n` +
        `Stratégie: ${strategy}\n` +
        `Données: ${JSON.stringify(data)}\n\n` +
        `Génère un message bref, impactant et bienveillant qui reconnecte l'utilisateur à cet élément du passé.`
      const echo = await generateWithGemini(prompt, "Génère le message d'écho.", 0.7)

      const echoResp = await sendWhatsAppText(fromE164, String(echo))
      const echoId = (echoResp as any)?.messages?.[0]?.id ?? null
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: String(echo),
        agent_used: "philosopher",
        metadata: { channel: "whatsapp", wa_outbound_message_id: echoId, is_proactive: false, source: "memory_echo" },
      })

      await markPending(admin, (pending as any).id, "done")
    }
    return true
  }

  if (params.isEchoLater && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo")
    if (pending) await markPending(admin, (pending as any).id, "cancelled")
    const okMsg = "Ok 🙂 Je garde ça sous le coude. Dis-moi quand tu veux."
    const sendResp = await sendWhatsAppText(fromE164, okMsg)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
    })
    return true
  }

  return false
}



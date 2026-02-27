import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { processMessage } from "../sophia-brain/router.ts"
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"
import { loadHistory } from "./wa_db.ts"

export async function replyWithBrain(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  inboundText: string
  requestId: string
  replyToWaMessageId?: string | null
  contextOverride: string
  whatsappMode?: "onboarding" | "normal"
  forceMode?: "companion" | "architect" | "assistant" | "investigator" | "sentry"
  purpose?: string
}) {
  const startedAtMs = Date.now()
  const scope = "whatsapp"
  console.log(
    `[whatsapp-webhook] trace ${JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_start",
      elapsed_ms: 0,
      user_id: params.userId,
    })}`,
  )
  const historyStartedAtMs = Date.now()
  const history = await loadHistory(params.admin, params.userId, 20, scope)
  console.log(
    `[whatsapp-webhook] trace ${JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_load_history",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - historyStartedAtMs,
      history_len: history.length,
      user_id: params.userId,
    })}`,
  )
  const contextOverride = [params.contextOverride]
    .filter((s) => String(s ?? "").trim().length > 0)
    .join("\n\n")
  const brainStartedAtMs = Date.now()
  const brain = await processMessage(
    params.admin as any,
    params.userId,
    params.inboundText,
    history,
    { requestId: params.requestId, channel: "whatsapp", scope, whatsappMode: params.whatsappMode ?? "normal" },
    { logMessages: false, contextOverride, forceMode: params.forceMode },
  )
  console.log(
    `[whatsapp-webhook] trace ${JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_process_message",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - brainStartedAtMs,
      mode: brain.mode ?? null,
      user_id: params.userId,
    })}`,
  )
  const sendStartedAtMs = Date.now()
  const sendResp = await sendWhatsAppTextTracked({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    toE164: params.fromE164,
    body: brain.content,
    purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    isProactive: false,
    replyToWaMessageId: params.replyToWaMessageId ?? null,
  })
  console.log(
    `[whatsapp-webhook] trace ${JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_send_whatsapp",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - sendStartedAtMs,
      user_id: params.userId,
    })}`,
  )
  const outId = (sendResp as any)?.messages?.[0]?.id ?? null
  const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
  const insertAssistantStartedAtMs = Date.now()
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope,
    role: "assistant",
    content: brain.content,
    agent_used: brain.mode,
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId ?? null,
      purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    },
  })
  console.log(
    `[whatsapp-webhook] trace ${JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_done",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - insertAssistantStartedAtMs,
      user_id: params.userId,
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
    })}`,
  )
  return { brain, outId }
}



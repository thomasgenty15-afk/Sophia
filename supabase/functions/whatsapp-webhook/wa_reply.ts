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
  forceMode?: "companion" | "architect" | "assistant" | "investigator" | "firefighter" | "sentry"
  purpose?: string
}) {
  const scope = "whatsapp"
  const history = await loadHistory(params.admin, params.userId, 20, scope)
  const contextOverride = [params.contextOverride]
    .filter((s) => String(s ?? "").trim().length > 0)
    .join("\n\n")
  const brain = await processMessage(
    params.admin as any,
    params.userId,
    params.inboundText,
    history,
    { requestId: params.requestId, channel: "whatsapp", scope, whatsappMode: params.whatsappMode ?? "normal" },
    { logMessages: false, contextOverride, forceMode: params.forceMode },
  )
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
  const outId = (sendResp as any)?.messages?.[0]?.id ?? null
  const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
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
  return { brain, outId }
}



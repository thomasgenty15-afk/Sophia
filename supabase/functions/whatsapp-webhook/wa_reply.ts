import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { processMessage } from "../sophia-brain/router.ts"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"
import { loadHistory } from "./wa_db.ts"

export async function replyWithBrain(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  inboundText: string
  requestId: string
  replyToWaMessageId?: string | null
  contextOverride: string
  forceMode?: "companion" | "architect" | "assistant" | "investigator" | "firefighter" | "sentry"
  purpose?: string
}) {
  const scope = "whatsapp"
  const history = await loadHistory(params.admin, params.userId, 20, scope)
  const brain = await processMessage(
    params.admin as any,
    params.userId,
    params.inboundText,
    history,
    { requestId: params.requestId, channel: "whatsapp", scope },
    { logMessages: false, contextOverride: params.contextOverride, forceMode: params.forceMode },
  )
  const sendResp = await sendWhatsAppText(params.fromE164, brain.content)
  const outId = (sendResp as any)?.messages?.[0]?.id ?? null
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope,
    role: "assistant",
    content: brain.content,
    agent_used: brain.mode,
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId ?? null,
      purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    },
  })
  return { brain, outId }
}



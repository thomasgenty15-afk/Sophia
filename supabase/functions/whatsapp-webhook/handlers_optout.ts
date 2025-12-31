import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"

export async function handleStopOptOut(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  alreadyConfirmed: boolean
  enabled: boolean
  nowIso: string
}): Promise<boolean> {
  if (!params.enabled || params.alreadyConfirmed) return true

  const confirmation =
    "C'est noté. Sophia ne te contactera plus sur WhatsApp.\n" +
    "Tu peux reprendre quand tu veux depuis le site."
  const sendResp = await sendWhatsAppText(params.fromE164, confirmation)
  const outId = (sendResp as any)?.messages?.[0]?.id ?? null
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope: "whatsapp",
    role: "assistant",
    content: confirmation,
    agent_used: "companion",
    metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, purpose: "optout_confirmation" },
  })
  await params.admin.from("profiles").update({ whatsapp_optout_confirmed_at: params.nowIso }).eq("id", params.userId)
  return true
}



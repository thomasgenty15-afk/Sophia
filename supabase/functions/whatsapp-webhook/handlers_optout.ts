import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export async function handleStopOptOut(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  alreadyConfirmed: boolean
  enabled: boolean
  nowIso: string
  replyWithBrain: (p: {
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
  }) => Promise<any>
  requestId: string
  replyToWaMessageId?: string | null
}): Promise<boolean> {
  if (!params.enabled || params.alreadyConfirmed) return true

  // AI everywhere: generate the STOP confirmation with the brain.
  // Keep stable wording so mechanical assertions remain meaningful.
  await params.replyWithBrain({
    admin: params.admin,
    userId: params.userId,
    fromE164: params.fromE164,
    inboundText: "STOP",
    requestId: params.requestId,
    replyToWaMessageId: params.replyToWaMessageId ?? null,
    purpose: "optout_confirmation_ai",
    whatsappMode: "normal",
    forceMode: "companion",
    contextOverride:
      `=== CONTEXTE WHATSAPP ===\n` +
      `L'utilisateur vient d'envoyer STOP.\n\n` +
      `CONSIGNE DE TOUR:\n` +
      `- Confirme clairement: "Sophia ne te contactera plus sur WhatsApp".\n` +
      `- Explique en 1 phrase que l'utilisateur peut reprendre depuis le site.\n` +
      `- Message court, sans poser de question.\n`,
  })
  await params.admin.from("profiles").update({ whatsapp_optout_confirmed_at: params.nowIso }).eq("id", params.userId)
  return true
}



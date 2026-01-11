import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export async function computeOptInAndBilanContext(params: {
  admin: SupabaseClient
  userId: string
  textLower: string
  actionId: string
  isOptInYesText: boolean
  isBilanYes: boolean
  isBilanLater: boolean
}): Promise<{
  isOptInYes: boolean
  hasBilanContext: boolean
}> {
  async function hasRecentOptInPrompt(admin: any, userId: string): Promise<boolean> {
    const since = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30h window
    const { data, error } = await admin
      .from("chat_messages")
      .select("id, metadata, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", since)
      .filter("metadata->>channel", "eq", "whatsapp")
      .filter("metadata->>purpose", "eq", "optin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return Boolean(data)
  }

  const isOptInYes =
    params.actionId === "OPTIN_YES" ||
    (params.isOptInYesText ? await hasRecentOptInPrompt(params.admin as any, params.userId) : false)

  async function hasRecentDailyBilanPrompt(admin: any, userId: string): Promise<boolean> {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6h window
    const { data, error } = await admin
      .from("chat_messages")
      .select("id, content, metadata, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", since)
      .filter("metadata->>channel", "eq", "whatsapp")
      .filter("metadata->>purpose", "eq", "daily_bilan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return false
    // Prefer templates for opt-in; but allow any daily_bilan outbound marker.
    const content = (data as any)?.content ?? ""
    return typeof content === "string" && content.length > 0
  }

  const hasBilanContext = (params.isBilanYes || params.isBilanLater)
    ? await hasRecentDailyBilanPrompt(params.admin as any, params.userId)
    : false

  return { isOptInYes, hasBilanContext }
}

export async function handleOptInAndDailyBilanActions(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  fullName: string
  isOptInYes: boolean
  isBilanYes: boolean
  isBilanLater: boolean
  hasBilanContext: boolean
  siteUrl: string
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
  waMessageId: string
}): Promise<boolean> {
  // If user accepts the daily bilan prompt, enable and kick off the bilan conversation.
  if (params.isBilanYes && params.hasBilanContext && !params.isOptInYes) {
    await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", params.userId)
    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: "OK",
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: "daily_bilan_kickoff_ai",
      whatsappMode: "normal",
      forceMode: "investigator",
      contextOverride:
        `=== CONTEXTE WHATSAPP ===\n` +
        `L'utilisateur accepte de faire le bilan (daily bilan).\n\n` +
        `CONSIGNE DE TOUR:\n` +
        `- Pose exactement 2 questions courtes (format WhatsApp):\n` +
        `  1) Une victoire aujourd'hui ?\n` +
        `  2) Un truc à ajuster pour demain ?\n`,
    })
    return true
  }

  // If user asks "not now", keep the opt-in off and respond gently.
  if (params.isBilanLater && params.hasBilanContext && !params.isOptInYes) {
    await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: false }).eq("id", params.userId)
    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: "Plus tard",
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: "daily_bilan_later_ai",
      whatsappMode: "normal",
      forceMode: "companion",
      contextOverride:
        `=== CONTEXTE WHATSAPP ===\n` +
        `L'utilisateur dit "plus tard" pour le bilan.\n\n` +
        `CONSIGNE DE TOUR:\n` +
        `- Réponds gentiment, sans insister.\n` +
        `- Une seule phrase.\n`,
    })
    return true
  }

  // If this is the opt-in “Oui”, answer with a welcome message (fast path)
  if (params.isOptInYes) {
    // User explicitly accepted the opt-in template: enable daily bilan reminders too.
    const nowIso = new Date().toISOString()
    await params.admin.from("profiles").update({
      whatsapp_bilan_opted_in: true,
      whatsapp_onboarding_started_at: nowIso,
    }).eq("id", params.userId)

    const prenom = (params.fullName ?? "").trim().split(" ")[0] || ""

    const { data: activePlan, error: planErr } = await params.admin
      .from("user_plans")
      .select("title, updated_at")
      .eq("user_id", params.userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (planErr) throw planErr

    const planTitle = String((activePlan as any)?.title ?? "").trim()
    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: "Oui",
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: "optin_yes_welcome_ai",
      whatsappMode: "onboarding",
      forceMode: "companion",
      contextOverride:
        `=== CONTEXTE WHATSAPP ===\n` +
        `L'utilisateur vient d'accepter l'opt-in WhatsApp (OPTIN_V2).\n` +
        `Prénom: "${prenom}".\n` +
        `Plan actif détecté ? ${planTitle ? "OUI" : "NON"}.\n` +
        (planTitle ? `Titre plan: "${planTitle}".\n` : `URL site: ${params.siteUrl}\n`) +
        `\nCONSIGNE DE TOUR:\n` +
        `- Message court, chaleureux, pro (WhatsApp).\n` +
        (planTitle
          ? `- Demande un score de motivation SUR 10 (inclure les mots "sur 10" et "motivation").\n`
          : `- Explique que tu ne vois pas encore de plan actif.\n` +
            `- Demande de finaliser sur le site.\n` +
            `- Termine en demandant de répondre exactement: "C'est bon".\n` +
            `- N'ajoute pas de markdown.\n`) ,
    })

    await params.admin.from("profiles").update({
      whatsapp_state: planTitle ? "awaiting_plan_motivation" : "awaiting_plan_finalization",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", params.userId)

    return true
  }

  return false
}



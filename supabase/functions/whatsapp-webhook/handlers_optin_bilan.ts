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
  sendWhatsAppText: (toE164: string, body: string) => Promise<any>
}): Promise<boolean> {
  // If user accepts the daily bilan prompt, enable and kick off the bilan conversation.
  if (params.isBilanYes && params.hasBilanContext && !params.isOptInYes) {
    await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", params.userId)
    const kickoff =
      "Parfait. En 2 lignes :\n" +
      "1) Une victoire aujourd’hui ?\n" +
      "2) Un truc à ajuster pour demain ?"
    const sendResp = await params.sendWhatsAppText(params.fromE164, kickoff)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await params.admin.from("chat_messages").insert({
      user_id: params.userId,
      scope: "whatsapp",
      role: "assistant",
      content: kickoff,
      agent_used: "investigator",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
    })
    return true
  }

  // If user asks "not now", keep the opt-in off and respond gently.
  if (params.isBilanLater && params.hasBilanContext && !params.isOptInYes) {
    await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: false }).eq("id", params.userId)
    const okMsg = "Ok, aucun souci. Tu me dis quand tu veux faire le bilan."
    const sendResp = await params.sendWhatsAppText(params.fromE164, okMsg)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await params.admin.from("chat_messages").insert({
      user_id: params.userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
    })
    return true
  }

  // If this is the opt-in “Oui”, answer with a welcome message (fast path)
  if (params.isOptInYes) {
    // User explicitly accepted the opt-in template: enable daily bilan reminders too.
    await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", params.userId)

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
    const welcome = planTitle
      ? (
        `Trop bien${prenom ? ` ${prenom}` : ""} ✅\n` +
        `J’ai retrouvé ton plan: “${planTitle}”.\n\n` +
        `On le lance doucement ? Sur 10, tu te sens à combien motivé(e) là tout de suite ?`
      )
      : (
        `Trop bien${prenom ? ` ${prenom}` : ""} ✅\n` +
        `Je suis contente de te retrouver ici.\n\n` +
        `Petit détail: je ne vois pas encore de plan “actif” sur ton compte.\n` +
        `Va le finaliser sur ${params.siteUrl} (2 minutes), puis reviens ici et réponds:\n` +
        `1) “C’est bon”\n` +
        `2) Et d’ailleurs: s’il y a 1 chose que tu aimerais que je sache sur toi, ce serait quoi ?`
      )
    const sendResp = await params.sendWhatsAppText(params.fromE164, welcome)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await params.admin.from("chat_messages").insert({
      user_id: params.userId,
      scope: "whatsapp",
      role: "assistant",
      content: welcome,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
    })

    await params.admin.from("profiles").update({
      whatsapp_state: planTitle ? "awaiting_plan_motivation" : "awaiting_plan_finalization",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", params.userId)

    return true
  }

  return false
}



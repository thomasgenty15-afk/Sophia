import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export async function handleOnboardingState(params: {
  admin: SupabaseClient
  userId: string
  whatsappState: string
  fromE164: string
  requestId: string
  waMessageId: string
  text: string
  siteUrl: string
  replyWithBrain: (p: {
    admin: SupabaseClient
    userId: string
    fromE164: string
    inboundText: string
    requestId: string
    replyToWaMessageId?: string | null
    contextOverride: string
    forceMode?: "companion" | "architect" | "assistant" | "investigator" | "firefighter" | "sentry"
    purpose?: string
  }) => Promise<any>
  sendWhatsAppText: (toE164: string, body: string) => Promise<any>
  isDonePhrase: (raw: string) => boolean
  extractAfterDonePhrase: (raw: string) => string
  stripFirstMotivationScore: (raw: string) => { score: number | null; rest: string }
  hasWhatsappPersonalFact: (admin: SupabaseClient, userId: string) => Promise<boolean>
}): Promise<boolean> {
  const {
    admin,
    userId,
    whatsappState,
    fromE164,
    requestId,
    waMessageId,
    text,
    siteUrl,
    replyWithBrain,
    sendWhatsAppText,
  } = params

  const st = String(whatsappState || "").trim()

  if (st === "awaiting_plan_finalization") {
    if (!params.isDonePhrase(text ?? "")) {
      const raw = String(text ?? "").trim()
      // Soft state-machine: answer the user normally, then gently remind the expected next step.
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Salut",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_soft_reply",
        contextOverride:
          `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
          `ÉTAT: awaiting_plan_finalization\n` +
          `L'utilisateur est dans les premiers échanges WhatsApp.\n` +
          `Objectif: répondre au message de l'utilisateur (même si c'est hors sujet), puis rappeler en 1 phrase qu'il faut finaliser le plan sur le site.\n` +
          `Ensuite, demander de répondre exactement: "C'est bon" quand c'est finalisé.\n` +
          `Inclure le lien: ${siteUrl}\n` +
          `IMPORTANT: tu ne connais pas l'UI exacte du site. N'invente jamais des boutons/positions ("en haut à droite", "clique sur Mes plans"). Reste générique.\n` +
          `IMPORTANT: tu ne peux pas envoyer d'images/captures d'écran ici. Ne propose pas d'en envoyer.\n` +
          `Ne pose qu'UNE question max, et reste naturel (pas robot).\n`,
      })
      return true
    }

    // They say "done": re-check if an active plan exists now.
    const raw = String(text ?? "").trim()
    const maybeFact = params.extractAfterDonePhrase(raw)
    if (maybeFact.length > 0) {
      // If user piggybacks a personal fact in the same message as "C'est bon", keep it.
      await admin.from("memories").insert({
        user_id: userId,
        content: `Sur WhatsApp, l'utilisateur partage: ${maybeFact}`,
        type: "whatsapp_personal_fact",
        metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: waMessageId, captured_from: "awaiting_plan_finalization" },
        source_type: "whatsapp",
      } as any)
    }
    const { data: activePlan, error: planErr } = await admin
      .from("user_plans")
      .select("title, updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (planErr) throw planErr

    const planTitle = String((activePlan as any)?.title ?? "").trim()
    if (!planTitle) {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        contextOverride:
          `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
          `ÉTAT: awaiting_plan_finalization\n` +
          `Le user dit que c'est bon, mais aucun plan actif n'est visible.\n` +
          `Objectif: répondre au message du user (et si il a donné une info perso, acknowledge brièvement), puis expliquer qu'il faut finaliser/activer le plan sur ${siteUrl}.\n` +
          `Ensuite demander de répondre exactement: "C'est bon" quand c'est finalisé.\n` +
          `IMPORTANT: tu ne connais pas l'UI exacte du site. N'invente jamais des boutons/positions.\n` +
          `IMPORTANT: tu ne peux pas envoyer d'images/captures d'écran ici.\n` +
          `Ne pose qu'UNE question max.\n`,
      })
      return true
    }

    // Soft: acknowledge any piggybacked info, then ask motivation as a single coherent message.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_plan_motivation_prompt_soft",
      contextOverride:
        `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
        `ÉTAT: awaiting_plan_finalization -> plan actif détecté\n` +
        `Plan actif: "${planTitle}"\n` +
        `${maybeFact.length > 0 ? `Le user a partagé: "${maybeFact}" (acknowledge en 1 phrase, sans médicaliser).` : ""}\n` +
        `Objectif: répondre au message du user, puis demander le score de motivation sur 10.\n` +
        `IMPORTANT: ne promets pas de "modifier/adopter le plan entier" ici. Sur WhatsApp, tu peux aider à exécuter le plan et ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Pour modifier le plan globalement, renvoie vers la plateforme.\n` +
        `Accepte: "6", "6/10", "6 sur 10". Donne un exemple.\n` +
        `Ne pose qu'UNE question: le score.\n`,
    })
    await admin.from("profiles").update({
      whatsapp_state: "awaiting_plan_motivation",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  if (st === "awaiting_plan_motivation") {
    const raw = String(text ?? "").trim()
    const { score, rest } = params.stripFirstMotivationScore(raw)
    if (score == null) {
      // Soft state-machine: let Sophia answer anything, but keep onboarding on track.
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Salut",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_motivation_soft_retry",
        contextOverride:
          `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
          `ÉTAT: awaiting_plan_motivation\n` +
          `On attend un score de motivation sur 10 (0 à 10) pour calibrer la suite.\n` +
          `Règle: répondre d'abord au message de l'utilisateur (même si hors sujet), puis demander le score de motivation.\n` +
          `IMPORTANT: ne promets pas de "modifier/adopter le plan entier" ici. Sur WhatsApp, tu peux aider à exécuter le plan et ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Pour modifier le plan globalement, renvoie vers la plateforme.\n` +
          `Accepte: "6", "6/10", "6 sur 10". Donne un exemple.\n` +
          `Ne sois pas robot: une seule relance, pas de boucle agressive.\n`,
      })
      return true
    }

    // After motivation score: immediately kick off the FIRST active action.
    // This avoids an onboarding loop of generic open questions and creates momentum.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || `${score}/10`,
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: rest.length > 0 ? "awaiting_plan_motivation_score_plus_request" : "awaiting_plan_motivation_score_kickoff",
      forceMode: "architect",
      contextOverride:
        `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
        `ÉTAT: awaiting_plan_motivation\n` +
        `Le user a donné un score de motivation: ${score}/10.\n` +
        `Objectif: Accuser réception du score en 1 phrase, puis lancer IMMÉDIATEMENT la première action "active" du plan (dashboard_context ci-dessous).\n` +
        `IMPORTANT: ne pose PAS de question générique ("tu as envie qu’on parle de quoi ?").\n` +
        `Tu dois:\n` +
        `- proposer 1 prochaine étape concrète (un petit pas faisable maintenant)\n` +
        `- terminer par UNE question courte et actionnable liée à cette étape.\n` +
        `Rappel: distingue "active" (maintenant) vs "pending" (plus tard). Priorise "active".\n`,
    })

    await admin.from("profiles").update({
      // End onboarding gating once motivation is captured; continue normally.
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  if (st === "awaiting_plan_motivation_followup") {
    const raw = String(text ?? "").trim()
    // Back-compat: older users may still be stuck in this state.
    // We now end onboarding gating after motivation; respond normally and exit the state.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_plan_motivation_followup_backcompat_exit",
      contextOverride:
        `=== CONTEXTE WHATSAPP ===\n` +
        `ÉTAT: awaiting_plan_motivation_followup (back-compat)\n` +
        `Réponds naturellement au message.\n` +
        `IMPORTANT: tu peux ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Ne promets pas de modifier le plan globalement sur WhatsApp.\n`,
    })
    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  if (st === "awaiting_personal_fact") {
    const fact = String(text ?? "").trim()
    if (fact.length > 0) {
      await admin.from("memories").insert({
        user_id: userId,
        content: `Sur WhatsApp, l'utilisateur partage: ${fact}`,
        type: "whatsapp_personal_fact",
        metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: waMessageId },
        source_type: "whatsapp",
      } as any)
    }

    const factLower = fact.toLowerCase()
    const mention =
      fact &&
      /fatigu/.test(factLower) &&
      /(irr[ée]guli|inconstant|pas\s+regulier|instable)/i.test(fact)
        ? "Ok, je note: quand tu es fatigué, ça te rend irrégulier ❤️\n"
        : "Merci, je note ❤️\n"
    const ack = `${mention}Et là, tout de suite: tu as envie qu’on parle de quoi ?`
    const sendResp = await sendWhatsAppText(fromE164, ack)
    const outId = (sendResp as any)?.messages?.[0]?.id ?? null
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: ack,
      agent_used: "companion",
      metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, purpose: "personal_fact_ack" },
    })

    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  return false
}



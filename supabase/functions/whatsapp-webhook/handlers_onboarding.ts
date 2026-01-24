import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { buildWhatsAppOnboardingContext } from "./onboarding_context.ts"
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"

async function countRecentAssistantPurpose(params: {
  admin: SupabaseClient
  userId: string
  purpose: string
  withinMs: number
}): Promise<number> {
  const sinceIso = new Date(Date.now() - params.withinMs).toISOString()
  const { count } = await params.admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .eq("role", "assistant")
    .gte("created_at", sinceIso)
    .filter("metadata->>purpose", "eq", params.purpose)
  return Number(count ?? 0) || 0
}

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
    whatsappMode?: "onboarding" | "normal"
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
        whatsappMode: "onboarding",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_finalization",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "no_plan",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Réponds au message de l'utilisateur.\n` +
          `- Puis rappelle en 1 phrase: finaliser/activer le plan sur le site.\n` +
          `- Termine par: "Réponds exactement: C'est bon" quand c'est fait.\n`,
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
      // Anti-boucle: if the user says "C'est bon" again but we still don't see a plan, escalate to support.
      const priorStillMissing = await countRecentAssistantPurpose({
        admin,
        userId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        withinMs: 6 * 60 * 60 * 1000,
      })
      if (priorStillMissing >= 1) {
        // Anti-spam: do not send the explicit support escalation more than once per 24h.
        const SUPPORT_ESCALATION_COOLDOWN_MS = 24 * 60 * 60 * 1000
        const alreadyEscalatedRecently = await countRecentAssistantPurpose({
          admin,
          userId,
          purpose: "awaiting_plan_finalization_support_escalation",
          withinMs: SUPPORT_ESCALATION_COOLDOWN_MS,
        })

        const supportEmail = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()

        if (alreadyEscalatedRecently === 0) {
          const txt =
            "Ok, je te crois — là ça ressemble à un souci de synchro/bug.\n\n" +
            `Pour ne pas tourner en rond: écris à ${supportEmail} avec:\n` +
            "- l’email de ton compte\n" +
            "- une capture de ton dashboard\n" +
            "- ton téléphone + navigateur (ex: iPhone/Safari)\n\n" +
            "En attendant: dis-moi ton objectif #1 en 1 phrase et je te propose un premier pas simple aujourd’hui."
          const sendResp = await sendWhatsAppTextTracked({
            admin,
            requestId,
            userId,
            toE164: fromE164,
            body: txt,
            purpose: "awaiting_plan_finalization_support_escalation",
            isProactive: false,
            replyToWaMessageId: waMessageId,
          })
          const outId = (sendResp as any)?.messages?.[0]?.id ?? null
          const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
          await admin.from("chat_messages").insert({
            user_id: userId,
            scope: "whatsapp",
            role: "assistant",
            content: txt,
            agent_used: "companion",
            metadata: {
              channel: "whatsapp",
              wa_outbound_message_id: outId,
              outbound_tracking_id: outboundTrackingId,
              is_proactive: false,
              purpose: "awaiting_plan_finalization_support_escalation",
            },
          })
        }

        await admin.from("profiles").update({
          whatsapp_state: "awaiting_plan_finalization_support",
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId)

        // If we already escalated recently, continue the conversation normally (don't repeat the support script).
        if (alreadyEscalatedRecently > 0) {
          await replyWithBrain({
            admin,
            userId,
            fromE164,
            inboundText: raw || "Ok",
            requestId,
            replyToWaMessageId: waMessageId,
            purpose: "awaiting_plan_support_coach_off_app",
            whatsappMode: "onboarding",
            contextOverride:
              buildWhatsAppOnboardingContext({
                state: "awaiting_plan_finalization_support",
                siteUrl,
                supportEmail,
                planPolicy: "no_plan",
                phase: "support_fallback",
              }) +
              `\n\nCONSIGNE DE TOUR:\n` +
              `- L'utilisateur est bloqué. Ne répète pas le support/email/capture (déjà envoyé récemment).\n` +
              `- Avance hors-app: propose 1 petit pas aujourd'hui, basé sur son objectif/problème.\n` +
              `- 1 question max.\n`,
          })
        }
        return true
      }
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        whatsappMode: "onboarding",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_finalization",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "no_plan",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user dit "c'est bon" mais aucun plan n'est visible.\n` +
          `- Réponds gentiment (sans contredire agressivement).\n` +
          `- Propose 1 explication simple: délai de synchro.\n` +
          `- Propose 1 seul essai (recharger/attendre 2 min).\n` +
          `- Termine en demandant de répondre "C'est bon" après cet essai.\n`,
      })
      return true
    }

    // New explicit choice: after plan activation, ask whether the user wants to focus on the plan
    // (execute actions) or talk about something else first. This is part of the onboarding state machine.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_onboarding_focus_choice_prompt",
      whatsappMode: "onboarding",
      forceMode: "companion",
      contextOverride:
        buildWhatsAppOnboardingContext({
          state: "awaiting_onboarding_focus_choice",
          siteUrl,
          supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
          planPolicy: "plan_active",
          phase: "onboarding",
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Plan actif détecté: "${planTitle}".\n` +
        `${maybeFact.length > 0 ? `- Le user a partagé: "${maybeFact}" (acknowledge en 1 phrase).` : ""}\n` +
        `- Pose UNE question explicite de choix (pas de motivation ici):\n` +
        `  "Tu veux qu’on parle du plan (je te guide sur la prochaine action) ou tu veux parler d’autre chose d’abord ?"\n` +
        `- Ne commence pas l'exécution du plan tant que le user n'a pas choisi.\n`,
    })
    await admin.from("profiles").update({
      whatsapp_state: "awaiting_onboarding_focus_choice",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  if (st === "awaiting_onboarding_focus_choice") {
    const raw = String(text ?? "").trim()
    const textLower = raw.toLowerCase()
    const wantsPlan =
      /\b(plan|actions?|action|go|on\s*commence|on\s*y\s*va|vas[-\s]*y|oui)\b/i.test(raw) &&
      !/\b(autre|autre\s*chose|pas\s*le\s*plan|plus\s*tard)\b/i.test(textLower)
    const wantsOther =
      /\b(autre|autre\s*chose|parler\s*d['’]autre|question|sujet|probl[eè]me)\b/i.test(textLower) ||
      /\b(pas\s*le\s*plan|plus\s*tard)\b/i.test(textLower)

    if (!wantsPlan && !wantsOther) {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_onboarding_focus_choice_retry",
        whatsappMode: "onboarding",
        forceMode: "companion",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_onboarding_focus_choice",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "plan_active",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user n'a pas répondu clairement.\n` +
          `- Redemande le choix en proposant 2 options très simples.\n` +
          `- 1 question max.\n`,
      })
      return true
    }

    // End onboarding gating AFTER handling the choice.
    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)

    if (wantsOther) {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "onboarding_focus_other_exit",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "onboarding_focus_other_exit",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "plan_active",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user a choisi: AUTRE CHOSE (pas le plan maintenant).\n` +
          `- Ouvre sur son sujet en 1 question claire ("Qu’est-ce qui t’occupe là tout de suite ?").\n` +
          `- Mentionne en 1 phrase qu’on pourra revenir au plan quand il veut.\n`,
      })
      return true
    }

    // wantsPlan: start executing the plan (first active action) without adding new actions.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "onboarding_focus_plan_kickoff_exit",
      whatsappMode: "normal",
      forceMode: "architect",
      contextOverride:
        buildWhatsAppOnboardingContext({
          state: "onboarding_focus_plan_kickoff_exit",
          siteUrl,
          supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
          planPolicy: "plan_active",
          phase: "onboarding",
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Le user a choisi: PLAN.\n` +
        `- Démarre immédiatement sur la 1ère action active du plan (petit pas concret).\n` +
        `- Interdiction d'inventer des rituels/étapes hors-plan.\n` +
        `- 1 question courte liée à cette première étape.\n`,
    })
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
        whatsappMode: "onboarding",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_motivation",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "plan_active",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Réponds au message.\n` +
          `- Puis demande un score 0–10 (une seule question). Donne un exemple.\n`,
      })
      return true
    }

    const alreadyHasFact = await params.hasWhatsappPersonalFact(admin, userId)

    // If we already have a WhatsApp personal fact, we can end onboarding gating here and continue normally.
    if (alreadyHasFact) {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || `${score}/10`,
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_motivation_score_already_has_fact_exit",
        forceMode: "companion",
        whatsappMode: "onboarding",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_motivation",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "plan_active",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user a donné ${score}/10.\n` +
          `- Accuse réception (court, WhatsApp).\n` +
          `- On a déjà un fait perso WhatsApp: n'en redemande pas.\n` +
          `- Termine par 1 question max pour avancer.\n`,
      })
      await admin.from("profiles").update({
        whatsapp_state: null,
        whatsapp_state_updated_at: new Date().toISOString(),
      }).eq("id", userId)
      return true
    }

    // Otherwise: after the motivation score, ask for ONE personal fact and keep the state machine on-track.
    // This is product-like (helps personalization) and keeps the onboarding deterministic for WhatsApp.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || `${score}/10`,
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_plan_motivation_score_to_personal_fact_prompt",
      forceMode: "companion",
      whatsappMode: "onboarding",
      contextOverride:
        buildWhatsAppOnboardingContext({
          state: "awaiting_personal_fact",
          siteUrl,
          supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
          planPolicy: "plan_active",
          phase: "onboarding",
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Le user a donné ${score}/10.\n` +
        `- Réponds court, sans markdown.\n` +
        `- Ta réponse DOIT contenir: "merci" (n'importe où), "${score}/10", et "1 truc".\n` +
        `- Pose UNE seule question demandant 1 fait perso simple (ex: routine du soir, contrainte, préférence).\n` +
        `- Ne démarre pas l'exécution du plan tant que le fait perso n'est pas capturé.\n`,
    })

    await admin.from("profiles").update({
      whatsapp_state: "awaiting_personal_fact",
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
      whatsappMode: "onboarding",
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

    // AI everywhere: generate the acknowledgement with the brain (instead of a hardcoded template),
    // but keep a stable structure so mechanical tests remain meaningful.
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: fact || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "personal_fact_ack_ai",
      whatsappMode: "onboarding",
      forceMode: "companion",
      contextOverride:
        buildWhatsAppOnboardingContext({
          state: "awaiting_personal_fact",
          siteUrl,
          supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
          planPolicy: "unknown",
          phase: "onboarding",
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Réponds en WhatsApp (court).\n` +
        `- Accuse réception avec une phrase contenant EXACTEMENT "Merci, je note".\n` +
        `- Puis termine par EXACTEMENT: "Et là, tout de suite: tu as envie qu’on parle de quoi ?"\n` +
        (fact ? `- Le fait partagé est: "${fact}".` : "") +
        `\n`,
    })

    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  if (st === "awaiting_plan_finalization_support") {
    // Support fallback: user is blocked. Do NOT loop on "finalise ton plan".
    // But if a plan becomes active, resume onboarding normally.
    const raw = String(text ?? "").trim()
    const supportEmail = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()
    const escalatedRecently = await countRecentAssistantPurpose({
      admin,
      userId,
      purpose: "awaiting_plan_finalization_support_escalation",
      withinMs: 24 * 60 * 60 * 1000,
    })
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
    if (planTitle) {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_support_plan_detected_resume",
        whatsappMode: "onboarding",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_motivation",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "plan_active",
            phase: "onboarding",
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Plan actif détecté: "${planTitle}".\n` +
          `- Demande un score de motivation sur 10 (une seule question).\n`,
      })
      await admin.from("profiles").update({
        whatsapp_state: "awaiting_plan_motivation",
        whatsapp_state_updated_at: new Date().toISOString(),
      }).eq("id", userId)
      return true
    }

    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_plan_support_coach_off_app",
      whatsappMode: "onboarding",
      contextOverride:
        buildWhatsAppOnboardingContext({
          state: "awaiting_plan_finalization_support",
          siteUrl,
          supportEmail,
          planPolicy: "no_plan",
          phase: "support_fallback",
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- L'utilisateur est bloqué. Ne répète pas "finalise ton plan" en boucle.\n` +
        `${escalatedRecently > 0 ? `- Ne répète pas le support/email/capture (déjà envoyé récemment).\n` : `- Si nécessaire, donne le contact support: ${supportEmail} (1 fois).\n`}` +
        `- Avance hors-app: propose 1 petit pas aujourd'hui, basé sur son objectif/problème.\n` +
        `- 1 question max.\n`,
    })
    return true
  }

  return false
}



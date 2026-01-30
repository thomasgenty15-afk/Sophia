import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { buildWhatsAppOnboardingContext, buildAdaptiveOnboardingContext } from "./onboarding_context.ts"
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"
import { analyzeSignals } from "../sophia-brain/router/dispatcher.ts"
import {
  loadOnboardingContext,
  getDeferredOnboardingSteps,
  removeDeferredOnboardingStep,
  type DeferredOnboardingStep,
} from "./onboarding_helpers.ts"

async function getLastAssistantMessage(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin
    .from("chat_messages")
    .select("content, created_at")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return String((data as any)?.content ?? "")
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// AI-BASED FOCUS CHOICE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface FocusChoiceResult {
  choice: "plan" | "other" | "unclear"
  detectedTopic?: string
}

async function detectFocusChoice(
  text: string,
  lastAssistant: string,
  requestId: string,
): Promise<FocusChoiceResult> {
  const raw = (text ?? "").trim()
  if (!raw) return { choice: "unclear" }

  // Fast-path: very short affirmatives for plan
  if (/^(oui|ok|go|on\s*y\s*va|vas[-\s]*y|d['']acc(ord)?|plan)$/i.test(raw)) {
    return { choice: "plan" }
  }

  // Fast-path: explicit "autre chose"
  if (/^(autre|autre\s*chose|pas\s*le\s*plan|plus\s*tard)$/i.test(raw)) {
    return { choice: "other" }
  }

  try {
    const signals = await analyzeSignals(
      raw,
      { current_mode: "companion" },
      lastAssistant,
      { requestId },
    )

    // User wants to talk about the plan
    // NOTE: Dispatcher does not expose a "PLAN" user_intent_primary.
    // We infer plan intent from plan_focus + action intents.
    const isPlanIntent =
      Boolean(signals.topic_depth?.plan_focus) ||
      signals.create_action?.intent_strength === "explicit" ||
      signals.create_action?.intent_strength === "implicit" ||
      signals.update_action?.detected === true

    // User wants to switch topic or discuss something else
    const isSwitchTopic =
      signals.interrupt?.kind === "SWITCH_TOPIC" ||
      signals.interrupt?.kind === "DIGRESSION"

    const hasOtherTopic =
      signals.topic_depth?.value && signals.topic_depth.value !== "NONE" && !signals.topic_depth?.plan_focus

    // User explicitly confirms moving forward (could be plan)
    const isAckDone =
      signals.flow_resolution?.kind === "ACK_DONE" && (signals.flow_resolution?.confidence ?? 0) >= 0.5

    if (isPlanIntent || isAckDone) {
      return { choice: "plan" }
    }

    if (isSwitchTopic || hasOtherTopic) {
      return {
        choice: "other",
        detectedTopic: signals.interrupt?.deferred_topic_formalized ?? undefined,
      }
    }

    return { choice: "unclear" }
  } catch (e) {
    console.warn("[handlers_onboarding] detectFocusChoice error:", e)
    return { choice: "unclear" }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED STEPS DETECTION (calm moment)
// ═══════════════════════════════════════════════════════════════════════════════

async function isCalmMomentForDeferred(
  text: string,
  signals: any,
): Promise<boolean> {
  // Indicators of a calm moment where we can ask deferred questions:
  // - Short message (less than 30 chars)
  // - Topic satisfaction detected
  // - Light engagement or general greeting
  const raw = (text ?? "").trim()

  // Never inject deferred onboarding during safety or serious moments
  if (signals?.safety?.level && signals.safety.level !== "NONE") {
    return false
  }
  if (signals?.topic_depth?.value === "NEED_SUPPORT" || signals?.topic_depth?.value === "SERIOUS") {
    return false
  }

  if (raw.length < 30) return true

  if (signals?.topic_satisfaction?.detected && (signals.topic_satisfaction?.confidence ?? 0) >= 0.6) {
    return true
  }

  if (signals?.user_engagement?.level === "LOW" || signals?.topic_depth?.value === "LIGHT") {
    return true
  }

  // Greeting patterns
  if (/^(salut|coucou|hey|bonjour|hello|yo|re|bjr)$/i.test(raw)) {
    return true
  }

  return false
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_finalization
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_finalization") {
    const raw = String(text ?? "").trim()
    const saysDoneFast = params.isDonePhrase(raw)
    let decision: "done" | "uncertain" | "not_done" = saysDoneFast ? "done" : "not_done"
    let signals: any = null

    if (!saysDoneFast && raw) {
      const lastAssistant = await getLastAssistantMessage(admin, userId).catch(() => "")
      signals = await analyzeSignals(
        raw,
        { current_mode: "companion", plan_confirm_pending: true },
        lastAssistant,
        { requestId },
      )
      const ack = Number(signals?.flow_resolution?.confidence ?? 0)
      const isAck = String(signals?.flow_resolution?.kind ?? "NONE") === "ACK_DONE"
      const planConf = Number(signals?.user_intent_confidence ?? 0)
      const isPlan =
        Boolean(signals?.topic_depth?.plan_focus) ||
        signals?.create_action?.intent_strength === "explicit" ||
        signals?.create_action?.intent_strength === "implicit" ||
        signals?.update_action?.detected === true

      if (isAck && ack >= 0.7) {
        decision = "done"
      } else if (isAck && ack >= 0.45) {
        decision = "uncertain"
      } else if (isPlan && planConf >= 0.75) {
        decision = "uncertain"
      } else {
        decision = "not_done"
      }
    }

    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
      profileFacts: {},
      memories: [],
      isReturning: false,
      hasWebHistory: false,
      hasWhatsAppHistory: false,
    }))

    if (decision === "uncertain") {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_confirm_intent",
        whatsappMode: "onboarding",
        forceMode: "companion",
        contextOverride:
          buildWhatsAppOnboardingContext({
            state: "awaiting_plan_finalization",
            siteUrl,
            supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
            planPolicy: "no_plan",
            phase: "onboarding",
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user a répondu de façon ambigüe.\n` +
          `- Priorité: confirmer si le user veut dire "j'ai bien activé/finalisé mon plan sur le site".\n` +
          `- Pose UNE seule question fermée (oui/non), très simple.\n` +
          `- Exemple: "Tu veux dire que ton plan est bien activé sur le site (dashboard) ? (Oui / Pas encore)"\n`,
      })
      return true
    }

    if (decision !== "done") {
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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Réponds au message de l'utilisateur.\n` +
          `- Puis rappelle en 1 phrase: finaliser/activer le plan sur le site.\n` +
          `- Termine par une question courte de confirmation (pas de phrase exacte).\n` +
          `- Exemple: "Dis-moi quand c'est fait et je continue ici."\n`,
      })
      return true
    }

    // They say "done": re-check if an active plan exists now.
    const maybeFact = params.extractAfterDonePhrase(raw)
    if (maybeFact.length > 0) {
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
      const priorStillMissing = await countRecentAssistantPurpose({
        admin,
        userId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        withinMs: 6 * 60 * 60 * 1000,
      })
      if (priorStillMissing >= 1) {
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
            "- l'email de ton compte\n" +
            "- une capture de ton dashboard\n" +
            "- ton téléphone + navigateur (ex: iPhone/Safari)\n\n" +
            "En attendant: dis-moi ton objectif #1 en 1 phrase et je te propose un premier pas simple aujourd'hui."
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
                profileFacts: onboardingCtx.profileFacts,
                memories: onboardingCtx.memories,
                isReturningUser: onboardingCtx.isReturning,
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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user dit "c'est bon" mais aucun plan n'est visible.\n` +
          `- Réponds gentiment (sans contredire agressivement).\n` +
          `- Propose 1 explication simple: délai de synchro.\n` +
          `- Propose 1 seul essai (recharger/attendre 2 min).\n` +
          `- Termine par une question courte de confirmation après cet essai (pas de phrase exacte).\n`,
      })
      return true
    }

    // Plan is active: ask focus choice
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
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Plan actif détecté: "${planTitle}".\n` +
        `${maybeFact.length > 0 ? `- Le user a partagé: "${maybeFact}" (acknowledge en 1 phrase).` : ""}\n` +
        `- Pose UNE question explicite de choix (pas de motivation ici):\n` +
        `  "Tu veux qu'on parle du plan (je te guide sur la prochaine action) ou tu veux parler d'autre chose d'abord ?"\n` +
        `- Ne commence pas l'exécution du plan tant que le user n'a pas choisi.\n`,
    })
    await admin.from("profiles").update({
      whatsapp_state: "awaiting_onboarding_focus_choice",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_onboarding_focus_choice (AI-based detection)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_onboarding_focus_choice") {
    const raw = String(text ?? "").trim()
    const lastAssistant = await getLastAssistantMessage(admin, userId).catch(() => "")
    const focusResult = await detectFocusChoice(raw, lastAssistant, requestId)

    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
      profileFacts: {},
      memories: [],
      isReturning: false,
      hasWebHistory: false,
      hasWhatsAppHistory: false,
    }))

    if (focusResult.choice === "unclear") {
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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user n'a pas répondu clairement.\n` +
          `- Redemande le choix en proposant 2 options très simples.\n` +
          `- 1 question max.\n`,
      })
      return true
    }

    // End onboarding gating
    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)

    if (focusResult.choice === "other") {
      const topicHint = focusResult.detectedTopic
        ? `- Sujet détecté: "${focusResult.detectedTopic}".\n`
        : ""

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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user a choisi: AUTRE CHOSE (pas le plan maintenant).\n` +
          topicHint +
          `- Ouvre sur son sujet en 1 question claire ("Qu'est-ce qui t'occupe là tout de suite ?").\n` +
          `- Mentionne en 1 phrase qu'on pourra revenir au plan quand il veut.\n`,
      })
      return true
    }

    // wantsPlan: start executing the plan
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
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Le user a choisi: PLAN.\n` +
        `- Démarre immédiatement sur la 1ère action active du plan (petit pas concret).\n` +
        `- Interdiction d'inventer des rituels/étapes hors-plan.\n` +
        `- 1 question courte liée à cette première étape.\n`,
    })
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_motivation
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_motivation") {
    const raw = String(text ?? "").trim()
    const { score, rest } = params.stripFirstMotivationScore(raw)

    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
      profileFacts: {},
      memories: [],
      isReturning: false,
      hasWebHistory: false,
      hasWhatsAppHistory: false,
    }))

    if (score == null) {
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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
          }) +
          `\n\nCONSIGNE DE TOUR:\n` +
          `- Réponds au message.\n` +
          `- Puis demande un score 0–10 (une seule question). Donne un exemple.\n`,
      })
      return true
    }

    const alreadyHasFact = await params.hasWhatsappPersonalFact(admin, userId)

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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
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
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Le user a donné ${score}/10.\n` +
        `- Réponds court, sans markdown.\n` +
        `- Ta réponse DOIT contenir: "merci" (n'importe où), "${score}/10", et "1 truc".\n` +
        `- Pose UNE seule question demandant 1 fait perso simple.\n` +
        `- IMPORTANT: favorise un fait ultra-facile à répondre en 1 message WhatsApp.\n` +
        `- Exemple recommandé (privilégier celui-ci): "Tu es plutôt du matin ou du soir en général ?"\n` +
        `- Ne démarre pas l'exécution du plan tant que le fait perso n'est pas capturé.\n`,
    })

    await admin.from("profiles").update({
      whatsapp_state: "awaiting_personal_fact",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_motivation_followup (back-compat)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_motivation_followup") {
    const raw = String(text ?? "").trim()
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_personal_fact
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_personal_fact") {
    const fact = String(text ?? "").trim()

    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, fact).catch(() => ({
      profileFacts: {},
      memories: [],
      isReturning: false,
      hasWebHistory: false,
      hasWhatsAppHistory: false,
    }))

    if (fact.length > 0) {
      await admin.from("memories").insert({
        user_id: userId,
        content: `Sur WhatsApp, l'utilisateur partage: ${fact}`,
        type: "whatsapp_personal_fact",
        metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: waMessageId },
        source_type: "whatsapp",
      } as any)
    }

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
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Réponds en WhatsApp (court).\n` +
        `- Accuse réception de façon humaine (pas robotique), et ta réponse DOIT contenir "Merci".\n` +
        `- Fais une transition naturelle (ex: "Top", "Parfait", "Ça marche").\n` +
        `- Puis termine par une question ouverte, très simple, du type:\n` +
        `  "Et là, tout de suite : tu as envie qu'on parle de quoi ?"\n` +
        (fact ? `- Le fait partagé est: "${fact}".` : "") +
        `\n`,
    })

    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_finalization_support
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_finalization_support") {
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

    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
      profileFacts: {},
      memories: [],
      isReturning: false,
      hasWebHistory: false,
      hasWhatsAppHistory: false,
    }))

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
            profileFacts: onboardingCtx.profileFacts,
            memories: onboardingCtx.memories,
            isReturningUser: onboardingCtx.isReturning,
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
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
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

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED STEPS HANDLER (called from normal flow when no onboarding state)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDeferredOnboardingSteps(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  requestId: string
  waMessageId: string
  text: string
  siteUrl: string
  signals: any // dispatcher signals from current message
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
}): Promise<{ handled: boolean; step?: DeferredOnboardingStep }> {
  const { admin, userId, fromE164, requestId, waMessageId, text, siteUrl, signals, replyWithBrain } = params

  // Check if there are deferred steps
  const deferredSteps = await getDeferredOnboardingSteps(admin, userId)
  if (deferredSteps.length === 0) {
    return { handled: false }
  }

  // Check if it's a calm moment
  const isCalm = await isCalmMomentForDeferred(text, signals)
  if (!isCalm) {
    return { handled: false }
  }

  const nextStep = deferredSteps[0]
  const raw = (text ?? "").trim()

  // Load context for personalization
  const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
    profileFacts: {},
    memories: [],
    isReturning: false,
    hasWebHistory: false,
    hasWhatsAppHistory: false,
  }))

  const contextBase = buildAdaptiveOnboardingContext({
    flow: "deferred",
    state: `deferred_${nextStep}`,
    siteUrl,
    supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
    planPolicy: "unknown",
    profileFacts: onboardingCtx.profileFacts,
    memories: onboardingCtx.memories,
    isReturningUser: onboardingCtx.isReturning,
  })

  if (nextStep === "motivation") {
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "deferred_motivation_prompt",
      whatsappMode: "normal",
      forceMode: "companion",
      contextOverride:
        contextBase +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Réponds d'abord au message de l'utilisateur.\n` +
        `- Puis, naturellement, intègre une question de motivation:\n` +
        `  "Au fait, sur une échelle de 0 à 10, tu es à combien de motivation sur ton objectif ?"\n` +
        `- Formule la question de façon fluide, pas forcément cette phrase exacte.\n` +
        `- 1 seule question à la fin.\n`,
    })

    // Update state to capture the answer
    await admin.from("profiles").update({
      whatsapp_state: "awaiting_deferred_motivation",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)

    return { handled: true, step: "motivation" }
  }

  if (nextStep === "personal_fact") {
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "deferred_personal_fact_prompt",
      whatsappMode: "normal",
      forceMode: "companion",
      contextOverride:
        contextBase +
        `\n\nCONSIGNE DE TOUR:\n` +
        `- Réponds d'abord au message de l'utilisateur.\n` +
        `- Puis, naturellement, demande 1 fait perso:\n` +
        `  "D'ailleurs, pour mieux t'accompagner: c'est quoi 1 truc important à savoir sur ton quotidien ?"\n` +
        `- Formule la question de façon fluide.\n` +
        `- 1 seule question à la fin.\n`,
    })

    await admin.from("profiles").update({
      whatsapp_state: "awaiting_deferred_personal_fact",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)

    return { handled: true, step: "personal_fact" }
  }

  return { handled: false }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED STATES HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDeferredMotivationAnswer(params: {
  admin: SupabaseClient
  userId: string
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
  stripFirstMotivationScore: (raw: string) => { score: number | null; rest: string }
}): Promise<boolean> {
  const { admin, userId, fromE164, requestId, waMessageId, text, siteUrl, replyWithBrain, stripFirstMotivationScore } = params
  const raw = (text ?? "").trim()
  const { score } = stripFirstMotivationScore(raw)

  // Remove from deferred list regardless of whether we got a score
  await removeDeferredOnboardingStep(admin, userId, "motivation")

  // Clear the state
  await admin.from("profiles").update({
    whatsapp_state: null,
    whatsapp_state_updated_at: new Date().toISOString(),
  }).eq("id", userId)

  // Load context for personalization
  const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(() => ({
    profileFacts: {},
    memories: [],
    isReturning: false,
    hasWebHistory: false,
    hasWhatsAppHistory: false,
  }))

  const scoreAck = score != null
    ? `- Le user a donné ${score}/10. Accuse réception brièvement.`
    : `- Le user n'a pas donné de score clair. Ce n'est pas grave, ne relance pas.`

  await replyWithBrain({
    admin,
    userId,
    fromE164,
    inboundText: raw || "Ok",
    requestId,
    replyToWaMessageId: waMessageId,
    purpose: "deferred_motivation_ack",
    whatsappMode: "normal",
    forceMode: "companion",
    contextOverride:
      buildWhatsAppOnboardingContext({
        state: "deferred_motivation_ack",
        siteUrl,
        supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
        planPolicy: "unknown",
        phase: "onboarding",
        profileFacts: onboardingCtx.profileFacts,
        memories: onboardingCtx.memories,
        isReturningUser: onboardingCtx.isReturning,
      }) +
      `\n\nCONSIGNE DE TOUR:\n` +
      scoreAck +
      `\n- Continue la conversation normalement.\n` +
      `- 1 question max pour avancer.\n`,
  })

  return true
}

export async function handleDeferredPersonalFactAnswer(params: {
  admin: SupabaseClient
  userId: string
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
}): Promise<boolean> {
  const { admin, userId, fromE164, requestId, waMessageId, text, siteUrl, replyWithBrain } = params
  const fact = (text ?? "").trim()

  // Store the fact if non-empty
  if (fact.length > 0) {
    await admin.from("memories").insert({
      user_id: userId,
      content: `Sur WhatsApp, l'utilisateur partage (différé): ${fact}`,
      type: "whatsapp_personal_fact",
      metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: waMessageId, captured_from: "deferred" },
      source_type: "whatsapp",
    } as any)
  }

  // Remove from deferred list
  await removeDeferredOnboardingStep(admin, userId, "personal_fact")

  // Clear the state
  await admin.from("profiles").update({
    whatsapp_state: null,
    whatsapp_state_updated_at: new Date().toISOString(),
  }).eq("id", userId)

  // Load context for personalization
  const onboardingCtx = await loadOnboardingContext(admin, userId, fact).catch(() => ({
    profileFacts: {},
    memories: [],
    isReturning: false,
    hasWebHistory: false,
    hasWhatsAppHistory: false,
  }))

  const factAck = fact.length > 0
    ? `- Le user a partagé: "${fact.slice(0, 100)}". Accuse réception brièvement ("Noté !").`
    : `- Le user n'a rien partagé de clair. Ce n'est pas grave, ne relance pas.`

  await replyWithBrain({
    admin,
    userId,
    fromE164,
    inboundText: fact || "Ok",
    requestId,
    replyToWaMessageId: waMessageId,
    purpose: "deferred_personal_fact_ack",
    whatsappMode: "normal",
    forceMode: "companion",
    contextOverride:
      buildWhatsAppOnboardingContext({
        state: "deferred_personal_fact_ack",
        siteUrl,
        supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
        planPolicy: "unknown",
        phase: "onboarding",
        profileFacts: onboardingCtx.profileFacts,
        memories: onboardingCtx.memories,
        isReturningUser: onboardingCtx.isReturning,
      }) +
      `\n\nCONSIGNE DE TOUR:\n` +
      factAck +
      `\n- Continue la conversation normalement.\n` +
      `- 1 question max pour avancer.\n`,
  })

  return true
}

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { buildWhatsAppOnboardingContext } from "./onboarding_context.ts"
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts"
import { loadOnboardingContext } from "./onboarding_helpers.ts"

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

async function analyzeSignalsForWhatsApp(params: {
  text: string
  lastAssistantMessage?: string
  requestId: string
  stateSnapshot?: {
    current_mode?: string
    plan_confirm_pending?: boolean
  }
}) {
  const raw = (params.text ?? "").trim()
  const lastAssistant = params.lastAssistantMessage ?? ""
  const last5Messages = lastAssistant
    ? [{ role: "assistant", content: lastAssistant }, { role: "user", content: raw }]
    : [{ role: "user", content: raw }]

  const result = await analyzeSignalsV2(
    {
      userMessage: raw,
      lastAssistantMessage: lastAssistant,
      last5Messages,
      signalHistory: [],
      activeMachine: null,
      stateSnapshot: params.stateSnapshot ?? { current_mode: "companion" },
    },
    { requestId: params.requestId },
  )
  return result.signals
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
      signals = await analyzeSignalsForWhatsApp({
        text: raw,
        lastAssistantMessage: lastAssistant,
        requestId,
        stateSnapshot: { current_mode: "companion", plan_confirm_pending: true },
      })
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

      // Safety bail-out: if user is in distress, exit onboarding immediately
      const isSafetySignal = (signals?.safety?.level && signals.safety.level !== "NONE") ||
        (signals?.topic_depth?.value === "NEED_SUPPORT" && (signals.topic_depth?.confidence ?? 0) >= 0.7)
      if (isSafetySignal) {
        await admin.from("profiles").update({
          whatsapp_state: null,
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId)
        return false // fall through to normal brain pipeline (handles safety routing)
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

    // Plan is active: transition to onboarding Q1 (managed by dispatcher/router).
    // Set whatsapp_state = "onboarding_q1" and return false so the message falls through
    // to the default brain call, where processMessage picks up the onboarding machine.
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_q1",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId)
    return false // fall through to brain → dispatcher handles Q1
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATES: onboarding_q1, onboarding_q2, onboarding_q3
  // These are now managed by the dispatcher/router (not intercepted here).
  // The webhook falls through to the default brain call, which runs processMessage.
  // ═══════════════════════════════════════════════════════════════════════════════

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
      // Plan detected — check if user already completed onboarding before transitioning to Q1.
      const { data: obCheck } = await admin
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", userId)
        .maybeSingle()
      if ((obCheck as any)?.onboarding_completed) {
        // Already onboarded — clear stale state and fall through to normal brain pipeline.
        await admin.from("profiles").update({
          whatsapp_state: null,
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId)
        return false
      }
      // Transition to onboarding Q1 (managed by dispatcher/router)
      await admin.from("profiles").update({
        whatsapp_state: "onboarding_q1",
        whatsapp_state_updated_at: new Date().toISOString(),
      }).eq("id", userId)
      return false // fall through to brain → dispatcher handles Q1
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

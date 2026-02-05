import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts"
import {
  loadOnboardingContext,
  setDeferredOnboardingSteps,
  type DeferredOnboardingStep,
} from "./onboarding_helpers.ts"
import { buildAdaptiveOnboardingContext, type OnboardingFlow } from "./onboarding_context.ts"

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

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE FLOW DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface AdaptiveFlowResult {
  flow: OnboardingFlow
  deferredSteps: DeferredOnboardingStep[]
  detectedTopic?: string
  forceMode?: "companion" | "firefighter" | "sentry"
}

async function analyzeSignalsForWhatsApp(text: string, requestId: string) {
  const raw = (text ?? "").trim()
  const result = await analyzeSignalsV2(
    {
      userMessage: raw,
      lastAssistantMessage: "",
      last5Messages: [{ role: "user", content: raw }],
      signalHistory: [],
      activeMachine: null,
      stateSnapshot: { current_mode: "companion" },
    },
    { requestId },
  )
  return result.signals
}

async function detectAdaptiveFlow(
  inboundText: string,
  requestId: string,
): Promise<AdaptiveFlowResult> {
  // Default: normal flow with all steps
  const defaultResult: AdaptiveFlowResult = {
    flow: "normal",
    deferredSteps: [],
  }

  const text = (inboundText ?? "").trim()
  if (!text) return defaultResult

  try {
    const signals = await analyzeSignalsForWhatsApp(inboundText, requestId)

    // SCENARIO A: Urgency detected (safety or NEED_SUPPORT)
    const isUrgent =
      signals.safety.level !== "NONE" ||
      (signals.topic_depth?.value === "NEED_SUPPORT" && (signals.topic_depth?.confidence ?? 0) >= 0.7)

    if (isUrgent) {
      const forceMode =
        signals.safety.level === "SENTRY"
          ? "sentry"
          : signals.safety.level === "FIREFIGHTER"
            ? "firefighter"
            : "companion"
      return {
        flow: "urgent",
        deferredSteps: ["motivation", "personal_fact"],
        forceMode,
      }
    }

    // SCENARIO B: Serious topic (not urgent but deep)
    const isSerious =
      signals.topic_depth?.value === "SERIOUS" && (signals.topic_depth?.confidence ?? 0) >= 0.6

    if (isSerious) {
      const topic = signals.interrupt?.deferred_topic_formalized ?? undefined
      return {
        flow: "serious_topic",
        deferredSteps: ["motivation"],
        detectedTopic: topic,
      }
    }

    // SCENARIO C: Normal (calm mood, no urgency)
    return defaultResult
  } catch (e) {
    console.warn("[handlers_optin_bilan] detectAdaptiveFlow error:", e)
    return defaultResult
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

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
  // NEW: The actual inbound text (for context detection)
  inboundText?: string
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

  // If this is the opt-in "Oui", answer with a welcome message (adaptive flow)
  if (params.isOptInYes) {
    // Load onboarding context in parallel with other data
    const [onboardingCtx, planResult, adaptiveFlow] = await Promise.all([
      loadOnboardingContext(params.admin, params.userId, params.inboundText ?? "onboarding"),
      params.admin
        .from("user_plans")
        .select("title, updated_at")
        .eq("user_id", params.userId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      detectAdaptiveFlow(params.inboundText ?? "Oui", params.requestId),
    ])

    if (planResult.error) throw planResult.error
    const planTitle = String((planResult.data as any)?.title ?? "").trim()
    const prenom = (params.fullName ?? "").trim().split(" ")[0] || ""

    // Update profile: enable daily bilan opt-in
    await params.admin.from("profiles").update({
      whatsapp_bilan_opted_in: true,
    }).eq("id", params.userId)

    // Store deferred steps if any
    if (adaptiveFlow.deferredSteps.length > 0) {
      await setDeferredOnboardingSteps(params.admin, params.userId, adaptiveFlow.deferredSteps)
    }

    // Build context with personalization
    const contextBase = buildAdaptiveOnboardingContext({
      flow: adaptiveFlow.flow,
      state: "optin_welcome",
      siteUrl: params.siteUrl,
      supportEmail: (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim(),
      planPolicy: planTitle ? "plan_active" : "no_plan",
      profileFacts: onboardingCtx.profileFacts,
      memories: onboardingCtx.memories,
      isReturningUser: onboardingCtx.isReturning,
      detectedTopic: adaptiveFlow.detectedTopic,
    })

    // Build turn instructions based on flow
    const turnInstructions = buildOptInTurnInstructions({
      flow: adaptiveFlow.flow,
      prenom,
      planTitle,
      siteUrl: params.siteUrl,
      isReturning: onboardingCtx.isReturning,
      detectedTopic: adaptiveFlow.detectedTopic,
    })

    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: params.inboundText ?? "Oui",
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: `optin_yes_welcome_ai_${adaptiveFlow.flow}`,
      whatsappMode: adaptiveFlow.flow === "normal" ? "onboarding" : "normal",
      forceMode: adaptiveFlow.forceMode ?? "companion",
      contextOverride: `${contextBase}\n\n${turnInstructions}`,
    })

    // Determine next state based on flow and plan
    const nextState = determineNextState(adaptiveFlow.flow, Boolean(planTitle))
    await params.admin.from("profiles").update({
      whatsapp_state: nextState,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", params.userId)

    return true
  }

  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// TURN INSTRUCTIONS BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildOptInTurnInstructions(opts: {
  flow: OnboardingFlow
  prenom: string
  planTitle: string
  siteUrl: string
  isReturning: boolean
  detectedTopic?: string
}): string {
  const { flow, prenom, planTitle, siteUrl, isReturning, detectedTopic } = opts

  const welcomeStyle = isReturning
    ? `- Welcome court: "Content de te retrouver ici${prenom ? `, ${prenom}` : ""} !"`
    : `- Welcome chaleureux mais pas trop long.`

  // FLOW: URGENT
  if (flow === "urgent") {
    return [
      "CONSIGNE DE TOUR (URGENCE):",
      welcomeStyle,
      "- L'utilisateur arrive avec un besoin urgent.",
      "- Réponds d'abord à son besoin/souci avec empathie.",
      "- PAS de question motivation/score maintenant.",
      "- 1 question max pour clarifier ou avancer.",
      "- On reviendra à l'onboarding plus tard.",
    ].join("\n")
  }

  // FLOW: SERIOUS TOPIC
  if (flow === "serious_topic") {
    return [
      "CONSIGNE DE TOUR (SUJET SÉRIEUX):",
      welcomeStyle,
      detectedTopic ? `- Sujet détecté: "${detectedTopic}"` : "",
      "- L'utilisateur a un sujet important à discuter.",
      "- Accueille, puis ouvre sur son sujet avec 1 question.",
      "- PAS de question motivation maintenant (on la posera plus tard).",
      "- Sois présent et à l'écoute.",
    ].filter(Boolean).join("\n")
  }

  // FLOW: NORMAL (with or without plan)
  if (planTitle) {
    return [
      "CONSIGNE DE TOUR (NORMAL + PLAN):",
      welcomeStyle,
      `- Prénom: "${prenom}".`,
      `- Plan actif: "${planTitle}".`,
      "- Message court, chaleureux, pro (WhatsApp).",
      `- Demande un score de motivation SUR 10 (inclure les mots "sur 10" et "motivation").`,
    ].join("\n")
  }

  return [
    "CONSIGNE DE TOUR (NORMAL SANS PLAN):",
    welcomeStyle,
    `- Prénom: "${prenom}".`,
    "- Aucun plan actif détecté.",
    "- Message court, chaleureux, pro (WhatsApp).",
    "- Explique que tu ne vois pas encore de plan actif.",
    `- Demande de finaliser sur le site: ${siteUrl}`,
    `- IMPORTANT: quand tu mentionnes le site, colle exactement ce lien (${siteUrl}). N'utilise aucun autre domaine.`,
    `- Termine par une question simple de confirmation (pas de phrase exacte).`,
    `- Exemple: "Dis-moi quand c'est fait et je continue ici."`,
    "- N'ajoute pas de markdown.",
  ].join("\n")
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════════

function determineNextState(flow: OnboardingFlow, hasPlan: boolean): string | null {
  // Urgent or serious: go to normal mode (no onboarding gating)
  if (flow === "urgent" || flow === "serious_topic") {
    return null
  }

  // Normal flow: standard onboarding states
  return hasPlan ? "awaiting_plan_motivation" : "awaiting_plan_finalization"
}

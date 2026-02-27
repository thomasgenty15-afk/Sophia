import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts"
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts"
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
      .filter("metadata->>purpose", "in", "(daily_bilan,daily_bilan_reschedule,daily_bilan_winback)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return false
    // Prefer templates for opt-in; but allow any daily_bilan outbound marker.
    const content = (data as any)?.content ?? ""
    return typeof content === "string" && content.length > 0
  }

  // Always check DB for recent bilan prompt — no longer gated by regex match.
  // This allows free-form responses ("non je suis pas dispo") to be recognized as bilan context.
  const hasBilanContext = await hasRecentDailyBilanPrompt(params.admin as any, params.userId)

  return { isOptInYes, hasBilanContext }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILAN RESPONSE CLASSIFICATION (hybrid: LLM + deterministic fallback)
// ═══════════════════════════════════════════════════════════════════════════════

export type BilanClassification = {
  intent: "accept" | "decline"
}

function deterministicBilanFallback(inboundText: string): BilanClassification | null {
  const lower = String(inboundText ?? "").trim().toLowerCase()
  if (!lower) return null

  // Exact/near-exact template-like replies
  if (/^carr[ée]ment\s*!?$/i.test(lower) || /^go\s*!?$/i.test(lower)) {
    return { intent: "accept" }
  }
  if (/^pas\s*tout\s*de\s*suite\s*!?$/i.test(lower) || /^plus\s*tard\s*!?$/i.test(lower) || /^on\s*fera\s*[çc]a\s*demain\s*!?$/i.test(lower)) {
    return { intent: "decline" }
  }

  // Broad defer/decline hints.
  if (/\b(demain|tomorrow|pas dispo|pas maintenant|plus tard|une autre fois|on verra)\b/i.test(lower)) {
    return { intent: "decline" }
  }
  if (/\b(non|pas envie|pas interesser|pas intéressé|laisse tomber)\b/i.test(lower)) {
    return { intent: "decline" }
  }

  return null
}

/**
 * Classify user's response to a daily bilan prompt.
 * Uses a fast LLM call (Gemini flash) with a deterministic fallback for
 * exact template-button text ("Carrément !", "Pas tout de suite", "On fera ça demain").
 */
export async function classifyBilanResponse(
  inboundText: string,
  recentMessages: Array<{ role: string; content: string }>,
  requestId: string,
): Promise<BilanClassification> {
  const text = (inboundText ?? "").trim()
  if (!text) return { intent: "decline" }

  // --- Deterministic fast-path before LLM ---
  const deterministic = deterministicBilanFallback(text)
  if (deterministic) return deterministic

  // --- LLM classification for free-form responses ---
  const context = recentMessages
    .slice(-3)
    .map((m) => `${m.role === "assistant" ? "SOPHIA" : "USER"}: ${m.content}`)
    .join("\n")

  const systemPrompt = [
    "Tu es un classifieur d'intention. L'utilisateur vient de recevoir un message de Sophia lui proposant de faire son bilan du soir.",
    "Tu dois classifier la réponse de l'utilisateur parmi 2 intentions :",
    '- "accept" : l\'utilisateur accepte de faire le bilan maintenant',
    '- "decline" : l\'utilisateur refuse ou reporte le bilan (pas dispo, plus tard, demain, pas envie, non)',
    "",
    "Contexte conversation récente :",
    context || "(pas de contexte)",
    "",
    "IMPORTANT: Réponds UNIQUEMENT en JSON valide, rien d'autre.",
    'Format: {"intent": "accept"|"decline"}',
  ].join("\n")

  try {
    const raw = await generateWithGemini(systemPrompt, `Réponse de l'utilisateur: "${text}"`, 0.1, true, [], "auto", {
      requestId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "bilan_classify",
      forceRealAi: true,
    })

    const jsonStr = typeof raw === "string" ? raw : ""
    // Extract JSON from potential markdown fences
    const cleaned = jsonStr.replace(/```json?\s*/gi, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(cleaned)

    const intent = (["accept", "decline"] as const).includes(parsed?.intent)
      ? (parsed.intent as "accept" | "decline")
      : "decline"

    return { intent }
  } catch (e) {
    console.warn("[classifyBilanResponse] LLM classification failed, using deterministic fallback:", e)
    return deterministicBilanFallback(text) ?? { intent: "decline" }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE FLOW DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface AdaptiveFlowResult {
  flow: OnboardingFlow
  deferredSteps: DeferredOnboardingStep[]
  detectedTopic?: string
  forceMode?: "companion" | "sentry"
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
      const forceMode = signals.safety.level === "SENTRY"
        ? "sentry"
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
    forceMode?: "companion" | "architect" | "assistant" | "investigator" | "sentry"
    purpose?: string
  }) => Promise<any>
  requestId: string
  waMessageId: string
  inboundText: string
  actionId?: string
  textLower?: string
}): Promise<boolean> {
  const actionId = String(params.actionId ?? "").trim().toLowerCase()
  const textLower = String(params.textLower ?? params.inboundText ?? "").trim().toLowerCase()

  const isWinbackPause48h =
    actionId === "winback_pause_48h" ||
    /pause\s*(de)?\s*2\s*jour/.test(textLower)
  const isWinbackResume =
    actionId === "winback_resume" ||
    actionId === "winback_restart" ||
    /on\s*(reprend|relance)|je\s*m['’]?y\s*remets/.test(textLower)
  const isWinbackOverwhelmed =
    actionId === "winback_overwhelmed" ||
    actionId === "winback_adapt_plan" ||
    actionId === "winback_low_energy" ||
    /trop\s*charg[eé]|adapter|coup\s*de\s*mou/.test(textLower)
  const isWinbackSleepInfinite =
    actionId === "winback_sleep_infinite" ||
    /pas\s*tout\s*de\s*suite/.test(textLower)

  if (
    isWinbackPause48h ||
    isWinbackResume ||
    isWinbackOverwhelmed ||
    isWinbackSleepInfinite
  ) {
    const nowIso = new Date().toISOString()
    const patchBase: Record<string, unknown> = {
      whatsapp_bilan_opted_in: true,
      whatsapp_bilan_missed_streak: 0,
      whatsapp_bilan_winback_step: 0,
      whatsapp_bilan_last_winback_at: nowIso,
      whatsapp_bilan_paused_until: null,
    }
    if (isWinbackPause48h) {
      patchBase.whatsapp_bilan_paused_until = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
      ).toISOString()
    }
    if (isWinbackSleepInfinite) {
      patchBase.whatsapp_bilan_paused_until = "2099-12-31T00:00:00.000Z"
    }
    await params.admin.from("profiles").update(patchBase).eq("id", params.userId)

    if (isWinbackPause48h) {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_pause_ack",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur a choisi une pause de 2 jours pour le bilan.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme clairement que le bilan est mis en pause 2 jours.\n` +
          `- Dis que le bilan reprendra automatiquement apres ce delai.\n` +
          `- Message court (1-2 phrases), chaleureux, sans question.\n`,
      })
      return true
    }

    if (isWinbackSleepInfinite) {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_sleep_ack",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur veut rester en pause pour le moment.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme que tu restes discrete.\n` +
          `- Dis qu'un simple message de sa part relancera les bilans.\n` +
          `- Message court (1-2 phrases), sans question.\n`,
      })
      return true
    }
  }

  // If there's a bilan context and this is NOT an opt-in action, classify the response via LLM.
  if (params.hasBilanContext && !params.isOptInYes) {
    // Fetch recent messages for LLM context
    const { data: recentMsgs } = await params.admin
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", params.userId)
      .eq("scope", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(3)
    const recentMessages = ((recentMsgs ?? []) as Array<{ role: string; content: string }>).slice().reverse()

    const classification = await classifyBilanResponse(params.inboundText, recentMessages, params.requestId)
    console.log(`[handlers_optin_bilan] classifyBilanResponse result: intent=${classification.intent}`)

    // ACCEPT: kick off the bilan conversation
    if (classification.intent === "accept") {
      await params.admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", params.userId)
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_kickoff_ai",
        whatsappMode: "normal",
        forceMode: "investigator",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur accepte de faire le bilan (daily bilan).\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Fais comprendre clairement que vous démarrez le bilan du jour maintenant.\n` +
          `- Démarre le bilan avec une question courte (format WhatsApp):\n` +
          `  1) Un truc dont tu es fier(e) aujourd'hui ?\n`,
      })
      return true
    }

    // DECLINE: respond gently, no scheduling
    if (classification.intent === "decline") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_decline_ai",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur refuse ou reporte le bilan du soir.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Réponds gentiment en disant que c'est ok pour aujourd'hui et donne-lui rendez-vous à demain pour le prochain.\n` +
          `- Ne lui propose JAMAIS de le relancer plus tard dans la soirée.\n` +
          `- Une seule phrase, chaleureuse et sans question.\n`,
      })
      return true
    }
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

    // Determine next state based on flow and plan
    // IMPORTANT: set BEFORE replyWithBrain so that processMessage sees onboarding_q1
    // and the dispatcher Q1_ask add-on generates the first Q1 question.
    const nextState = determineNextState(adaptiveFlow.flow, Boolean(planTitle))
    await params.admin.from("profiles").update({
      whatsapp_state: nextState,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", params.userId)

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
      "- PAS de question onboarding maintenant.",
      "- 1 question max pour clarifier ou avancer.",
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
      "- PAS de question onboarding maintenant.",
      "- Sois présent et à l'écoute.",
    ].filter(Boolean).join("\n")
  }

  // FLOW: NORMAL (with or without plan)
  // When a plan exists, the dispatcher's Q1_ask add-on handles the onboarding question.
  // The welcome just provides warm context — no need to duplicate Q1 here.
  if (planTitle) {
    return [
      "CONSIGNE DE TOUR (NORMAL + PLAN):",
      welcomeStyle,
      `- Prénom: "${prenom}".`,
      `- Plan actif: "${planTitle}".`,
      "- Message court, chaleureux, pro (WhatsApp).",
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

  // Normal flow: warm onboarding (Q1 experience) or plan finalization
  return hasPlan ? "onboarding_q1" : "awaiting_plan_finalization"
}

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
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
  intent: "accept" | "decline" | "defer"
  delay_minutes: number | null
}

function deterministicBilanFallback(inboundText: string): BilanClassification | null {
  const lower = String(inboundText ?? "").trim().toLowerCase()
  if (!lower) return null

  // Exact/near-exact template-like replies
  if (/^carr[ée]ment\s*!?$/i.test(lower) || /^go\s*!?$/i.test(lower)) {
    return { intent: "accept", delay_minutes: null }
  }
  if (/^pas\s*tout\s*de\s*suite\s*!?$/i.test(lower)) {
    return { intent: "defer", delay_minutes: null }
  }
  if (/^on\s*fera\s*[çc]a\s*demain\s*!?$/i.test(lower)) {
    return { intent: "defer", delay_minutes: 24 * 60 }
  }
  if (/^plus\s*tard\s*!?$/i.test(lower)) {
    return { intent: "defer", delay_minutes: null }
  }

  // Deterministic delay extraction for common formats.
  const hMin = lower.match(/(\d+)\s*h\s*(\d+)/i)
  if (hMin) {
    const mins = Number(hMin[1]) * 60 + Number(hMin[2])
    if (mins > 0 && mins <= 48 * 60) return { intent: "defer", delay_minutes: mins }
  }
  const hours = lower.match(/(\d+)\s*(?:h(?:eure)?s?)\b/i)
  if (hours) {
    const mins = Number(hours[1]) * 60
    if (mins > 0 && mins <= 48 * 60) return { intent: "defer", delay_minutes: mins }
  }
  const mins = lower.match(/(\d+)\s*(?:min(?:ute)?s?)\b/i)
  if (mins) {
    const value = Number(mins[1])
    if (value > 0 && value <= 48 * 60) return { intent: "defer", delay_minutes: value }
  }
  if (/\b(demain|tomorrow)\b/i.test(lower)) {
    return { intent: "defer", delay_minutes: 24 * 60 }
  }

  // Broad defer/decline hints when no explicit delay was parsed.
  if (/\b(pas dispo|pas maintenant|plus tard|une autre fois|on verra)\b/i.test(lower)) {
    return { intent: "defer", delay_minutes: null }
  }
  if (/\b(non|pas envie|pas interesser|pas intéressé|laisse tomber)\b/i.test(lower)) {
    return { intent: "decline", delay_minutes: null }
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
  if (!text) return { intent: "defer", delay_minutes: null }

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
    "Tu dois classifier la réponse de l'utilisateur parmi 3 intentions :",
    '- "accept" : l\'utilisateur accepte de faire le bilan maintenant',
    '- "defer" : l\'utilisateur veut reporter le bilan à plus tard (il n\'est pas dispo maintenant mais il veut le faire plus tard)',
    '- "decline" : l\'utilisateur refuse de faire le bilan (pas intéressé, ne veut pas)',
    "",
    "Si l'utilisateur mentionne un délai (ex: \"dans 2h\", \"dans 30 min\", \"dans 1 heure\"), extrais le délai en minutes.",
    "",
    "Contexte conversation récente :",
    context || "(pas de contexte)",
    "",
    "IMPORTANT: Réponds UNIQUEMENT en JSON valide, rien d'autre.",
    'Format: {"intent": "accept"|"defer"|"decline", "delay_minutes": <number|null>}',
  ].join("\n")

  try {
    const raw = await generateWithGemini(systemPrompt, `Réponse de l'utilisateur: "${text}"`, 0.1, true, [], "auto", {
      requestId,
      model: "gemini-2.5-flash",
      source: "bilan_classify",
      forceRealAi: true,
    })

    const jsonStr = typeof raw === "string" ? raw : ""
    // Extract JSON from potential markdown fences
    const cleaned = jsonStr.replace(/```json?\s*/gi, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(cleaned)

    const intent = (["accept", "decline", "defer"] as const).includes(parsed?.intent)
      ? (parsed.intent as "accept" | "decline" | "defer")
      : "defer"
    const delay = typeof parsed?.delay_minutes === "number" && parsed.delay_minutes > 0
      ? Math.round(parsed.delay_minutes)
      : null

    return { intent, delay_minutes: delay }
  } catch (e) {
    // Safer fallback: prefer "defer" over an aggressive false decline.
    console.warn("[classifyBilanResponse] LLM classification failed, using deterministic fallback:", e)
    return deterministicBilanFallback(text) ?? { intent: "defer", delay_minutes: null }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILAN RESCHEDULE SCHEDULING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schedule a bilan reschedule by inserting a row in scheduled_checkins.
 * process-checkins later handles delivery and template-window pending logic.
 */
export async function scheduleBilanReschedule(params: {
  admin: SupabaseClient
  userId: string
  delayMinutes: number
}): Promise<string> {
  const { admin, userId, delayMinutes } = params
  const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()

  // Insert scheduled_checkins row
  const { data: checkin, error: checkinErr } = await admin
    .from("scheduled_checkins")
    .insert({
      user_id: userId,
      status: "pending",
      scheduled_for: scheduledFor,
      event_context: "daily_bilan_reschedule",
      message_mode: "dynamic",
      message_payload: {
        type: "daily_bilan_reschedule",
        original_bilan_time: new Date().toISOString(),
        instruction: "L'utilisateur avait demandé à être relancé pour son bilan du soir. Propose-lui de faire le point maintenant de manière chaleureuse et naturelle.",
      },
      draft_message: null,
    })
    .select("id")
    .single()

  if (checkinErr) throw checkinErr
  const checkinId = (checkin as any)?.id

  return checkinId
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELAY FORMATTING HELPER
// ═══════════════════════════════════════════════════════════════════════════════

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return h === 1 ? "1 heure" : `${h} heures`
  return h === 1 ? `1h${String(m).padStart(2, "0")}` : `${h}h${String(m).padStart(2, "0")}`
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
    console.log(`[handlers_optin_bilan] classifyBilanResponse result: intent=${classification.intent} delay=${classification.delay_minutes}`)

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

    // DEFER with delay: schedule reschedule and confirm
    if (classification.intent === "defer" && classification.delay_minutes) {
      // Deduplicate: don't create another reschedule if one is already pending
      const { data: existingReschedule } = await params.admin
        .from("scheduled_checkins")
        .select("id")
        .eq("user_id", params.userId)
        .eq("event_context", "daily_bilan_reschedule")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()

      if (!(existingReschedule as any)?.id) {
        await scheduleBilanReschedule({
          admin: params.admin,
          userId: params.userId,
          delayMinutes: classification.delay_minutes,
        })
      }

      const delayText = formatDelay(classification.delay_minutes)
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_deferred_ai",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur veut reporter le bilan à plus tard (dans ${delayText}).\n` +
          `Tu l'as programmé pour le relancer dans ${delayText}.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme-lui de manière naturelle et chaleureuse que tu le relanceras dans ${delayText}.\n` +
          `- Une ou deux phrases max, format WhatsApp.\n` +
          `- Ne pose pas de question.\n`,
      })
      return true
    }

    // DEFER without delay: ask when to reschedule
    if (classification.intent === "defer" && !classification.delay_minutes) {
      // Create a pending action so the next message is intercepted to extract the delay.
      // Deduplicate to avoid stacking multiple pending rows for the same user.
      const { data: existingPending } = await params.admin
        .from("whatsapp_pending_actions")
        .select("id")
        .eq("user_id", params.userId)
        .eq("kind", "bilan_reschedule")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()

      if (!(existingPending as any)?.id) {
        await params.admin
          .from("whatsapp_pending_actions")
          .insert({
            user_id: params.userId,
            kind: "bilan_reschedule",
            status: "pending",
            payload: {
              original_bilan_time: new Date().toISOString(),
              retry_count: 0,
            },
            expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h expiry
          })
      }

      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_ask_delay_ai",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride:
          `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur veut reporter le bilan mais n'a pas précisé quand.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Réponds gentiment et demande-lui dans combien de temps il veut être relancé.\n` +
          `- Sois naturel, format WhatsApp (court).\n` +
          `- Exemple de formulation: "Pas de souci ! Tu veux que je te relance dans combien de temps ?"\n`,
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
          `L'utilisateur décline le bilan du soir.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Réponds gentiment, sans insister.\n` +
          `- Une seule phrase.\n`,
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

/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  AgentMode,
  getCoreIdentity,
  getDashboardContext,
  getUserState,
  logMessage,
  normalizeScope,
  updateUserState,
} from "../state-manager.ts"
import { runCompanion, retrieveContext } from "../agents/companion.ts"
import { runWatcher } from "../agents/watcher.ts"
import { normalizeChatText } from "../chat_text.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"
import { getUserTimeContext } from "../../_shared/user_time_context.ts"
import {
  formatUserProfileFactsForPrompt,
  getUserProfileFacts,
} from "../profile_facts.ts"
import {
  countNoPlanBlockerMentions,
  isExplicitStopCheckup,
  lastAssistantAskedForStepConfirmation,
  lastAssistantAskedForMotivation,
  looksLikeActionProgress,
  looksLikeAttrapeRevesActivation,
  looksLikeDailyBilanAnswer,
  looksLikeExplicitCheckupIntent,
  looksLikeExplicitResumeCheckupIntent,
  looksLikeHowToExerciseQuestion,
  looksLikeMotivationScoreAnswer,
  looksLikeUserConfirmsStep,
  looksLikeUserClaimsPlanIsDone,
  looksLikeWorkPressureVenting,
  shouldBypassCheckupLockForDeepWork,
} from "./classifiers.ts"
import { analyzeIntentAndRisk, looksLikeAcuteDistress } from "./dispatcher.ts"
import {
  appendDeferredTopicToState,
  extractDeferredTopicFromUserMessage,
  userExplicitlyDefersTopic,
} from "./deferred_topics.ts"
import { debounceAndBurstMerge } from "./debounce.ts"
import { runAgentAndVerify } from "./agent_exec.ts"
import { maybeInjectGlobalDeferredNudge, pruneGlobalDeferredTopics, shouldStoreGlobalDeferredFromUserMessage, storeGlobalDeferredTopic } from "./global_deferred.ts"

const SOPHIA_CHAT_MODEL =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL") ?? "") as string
  ).trim() || "gemini-3-flash-preview";

export async function processMessage(
  supabase: SupabaseClient, 
  userId: string, 
  userMessage: string,
  history: any[],
  meta?: {
    requestId?: string
    forceRealAi?: boolean
    channel?: "web" | "whatsapp"
    model?: string
    scope?: string
    // WhatsApp-only: used to isolate onboarding behavior from normal WhatsApp conversations.
    whatsappMode?: "onboarding" | "normal"
  },
  opts?: { 
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
  }
) {
  function normalizeLoose(s: string): string {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s?]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  function looksLikeLongFormExplanationRequest(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    // Strong explicit requests for detail / explanation / mechanisms.
    if (/\b(explique|explique moi|detail|details|detaille|developpe|developper|precise|precision|mecanisme|comment ca marche|comment ca fonctionne|guide|pas a pas|step by step|cours)\b/i.test(s)) {
      return true
    }
    // Also treat "tu peux me faire un truc long" / "réponse longue" type requests.
    if (/\b(reponse\s+longue|longue\s+explication|explication\s+longue)\b/i.test(s)) return true
    return false
  }

  function looksLikeSentryCandidate(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    // Suicide / self-harm cues (candidate only; confirmed by LLM).
    if (/\b(suicide|me\s+suicider|me\s+tuer|me\s+faire\s+du\s+mal|m['’]automutiler|automutilation)\b/i.test(s)) return true

    // Acute medical red flags (candidate only; confirmed by LLM).
    if (/\b(j['’]?arrive\s+pas\s+a\s+respirer|j['’]?ai\s+du\s+mal\s+a\s+respirer|je\s+suffoque|essouffl|oppression|douleur\s+poitrine|douleur\s+thorac|malaise|je\s+tourne\s+de\s+l['’]oeil|syncope|perte\s+de\s+connaissance|l[eè]vres\s+bleues?)\b/i
      .test(s)) return true
    if (/\b(allergie|choc\s+anaphylactique|gonfl[eé]\s+(?:visage|l[eè]vres|langue)|urticaire)\b/i.test(s)) return true
    if (/\b(avc|paralysie|visage\s+qui\s+tombe|difficult[eé]\s+a\s+parler|troubles\s+de\s+la\s+parole)\b/i.test(s)) return true

    return false
  }

  async function confirmRouteToSentry(opts: {
    userMessage: string
    lastAssistantMessage: string
    requestId?: string
    forceRealAi?: boolean
  }): Promise<{ route: boolean; category: string; confidence: number }> {
    // Deterministic mode: keep it conservative.
    const mega =
      (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
      !opts.forceRealAi
    if (mega) {
      const s = normalizeLoose(opts.userMessage)
      if (/\b(jarrive pas a respirer|du mal a respirer|douleur poitrine|me suicider|suicide)\b/i.test(s)) {
        return { route: true, category: "mega_candidate", confidence: 0.9 }
      }
      return { route: false, category: "mega_none", confidence: 0.0 }
    }

    const systemPrompt = `
Tu es un "Safety Router" pour Sophia.
Ta mission: décider si le message utilisateur décrit une URGENCE qui doit être routée vers SENTRY.

IMPORTANT:
- Ne réagis pas juste à des mots. Distingue: citation / blague / hypothèse / métaphore VS situation réelle.
- Si c'est ambigu, préfère NE PAS router vers sentry (route=false).

Route vers SENTRY (route=true) si et seulement si:
- risque d'automutilation/suicide imminent OU demande d'aide urgente pour ça
- OU symptôme médical potentiellement grave (ex: difficulté à respirer, douleur thoracique, malaise, lèvres bleues, anaphylaxie)

Sinon:
- route=false

SORTIE JSON STRICTE:
{
  "route": true/false,
  "category": "self_harm|breathing|chest_pain|anaphylaxis|stroke|other|none",
  "confidence": 0.0-1.0
}
    `.trim()

    try {
      const raw = await generateWithGemini(systemPrompt, `User: ${opts.userMessage}\n\nLastAssistant: ${opts.lastAssistantMessage}`, 0.0, true, [], "auto", {
        requestId: opts.requestId,
        model: "gemini-2.5-flash",
        source: "sophia-brain:safety_router",
        forceRealAi: opts.forceRealAi,
      })
      const obj = JSON.parse(String(raw ?? "{}"))
      return {
        route: Boolean(obj?.route),
        category: String(obj?.category ?? "none"),
        confidence: Math.max(0, Math.min(1, Number(obj?.confidence ?? 0) || 0)),
      }
    } catch {
      return { route: false, category: "parse_failed", confidence: 0 }
    }
  }

  async function sentrySentRecently(args: { withinMs: number }): Promise<boolean> {
    try {
      const sinceIso = new Date(Date.now() - args.withinMs).toISOString()
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("scope", scope)
        .eq("role", "assistant")
        .eq("agent_used", "sentry")
        .gte("created_at", sinceIso)
      return (Number(count ?? 0) || 0) > 0
    } catch {
      return false
    }
  }

  function extractLastQuestionFingerprint(text: string): string | null {
    const t = String(text ?? "").trim()
    if (!t) return null
    // Grab last sentence containing a "?" as the question.
    const parts = t.split("\n").join(" ").split("?")
    if (parts.length < 2) return null
    const before = parts[parts.length - 2] ?? ""
    const q = (before.split(/[.!]/).pop() ?? before).trim() + "?"
    const fp = normalizeLoose(q).slice(0, 120)
    return fp || null
  }

  function inferPlanFocusFromUser(m: string): boolean | null {
    const s = normalizeLoose(m)
    if (!s) return null
    // If the user is venting / emotional, default away from plan-focus.
    if (looksLikeWorkPressureVenting(m) || looksLikeAcuteDistress(m)) return false
    // Plan / actions / dashboard intent
    if (/\b(plan|phase|objectif|objectifs|action|actions|exercice|exercices|dashboard|plateforme|activer|activation|debloquer|deblocage)\b/i.test(m)) return true
    // "Et après ?" usually means "next step"; treat as plan-focus but NOT "goals-focus".
    if (/\b(et\s+apres|la\s+suite|on\s+fait\s+quoi\s+maintenant|next)\b/i.test(s)) return true
    return null
  }

  function extractObjective(m: string): string | null {
    const raw = String(m ?? "").trim()
    if (!raw) return null
    // Common French patterns: "mon objectif c'est ...", "objectif: ..."
    const m1 = raw.match(/mon\s+objectif\s+(?:c['’]est|cest|=|:)?\s*(.+)$/i)
    if (m1?.[1]) return String(m1[1]).trim().slice(0, 220) || null
    const m2 = raw.match(/\bobjectif\s*(?:=|:)\s*(.+)$/i)
    if (m2?.[1]) return String(m2[1]).trim().slice(0, 220) || null
    return null
  }

  function buildArchitectLoopGuard(args: {
    planFocus: boolean
    currentObjective: string | null
    loopCount: number
  }): string {
    const obj = (args.currentObjective ?? "").trim()
    const strictness = Math.min(3, Math.max(0, args.loopCount))
    return (
      `=== ARCHITECT_LOOP_GUARD ===\n` +
      `plan_focus=${args.planFocus ? "true" : "false"}\n` +
      `current_objective=${obj ? JSON.stringify(obj) : "null"}\n` +
      `loop_count=${args.loopCount}\n\n` +
      `RÈGLES (priorité absolue):\n` +
      `- Interdiction de reposer une question déjà posée (même reformulée).\n` +
      `- Interdiction de repartir sur "objectifs / pourquoi / vision" si ce n'est pas explicitement demandé par l'utilisateur.\n` +
      `- Interdiction d'introduire un 2e objectif si un objectif existe déjà.\n` +
      `- Si plan_focus=false: ne parle pas du plan, avance sur le problème concret + émotion du moment.\n` +
      `- Si plan_focus=true: reste sur UNE piste et passe en exécution.\n` +
      (strictness >= 1
        ? `- Anti-boucle: limite à 2 étapes max. Résume ce qui est décidé, puis donne 1 prochaine étape concrète.\n`
        : "") +
      (strictness >= 2
        ? `- N'ajoute pas de nouvelles idées/axes. Converge: "voici ce qu'on fait" + 1 question logistique (oui/non).\n`
        : "") +
      (strictness >= 3
        ? `- Zéro diagnostic. Zéro nouveaux objectifs. Donne la prochaine action, point.\n`
        : "") +
      ``
    ).trim()
  }

  const isEvalParkingLotTest =
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("MODE TEST PARKING LOT")) ||
    Boolean(opts?.contextOverride && String(opts.contextOverride).includes("CONSIGNE TEST PARKING LOT"));
  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")
  const nowIso = new Date().toISOString()
  const userTime = await getUserTimeContext({ supabase, userId }).catch(() => null as any)

  const logMessages = opts?.logMessages !== false
  // 1. Log le message user
  let loggedMessageId: string | null = null
  if (logMessages) {
    const { data: inserted } = await supabase.from('chat_messages').insert({
      user_id: userId,
      scope,
      role: 'user',
      content: userMessage,
      metadata: opts?.messageMetadata ?? {}
    }).select('id').single()
    loggedMessageId = inserted?.id
  }

  // --- DEBOUNCE / ANTI-RACE CONDITION (Option 2) ---
  if (loggedMessageId) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
    })
    if (debounced.aborted) return { content: "", mode: "companion", aborted: true }
    userMessage = debounced.userMessage
  }

  // 2. Récupérer l'état actuel (Mémoire)
  let state = await getUserState(supabase, userId, scope)
  // Global parking-lot lives in user_chat_states.temp_memory (independent from investigation_state).
  let tempMemory = (state as any)?.temp_memory ?? {}
  // NOTE: router should never infer/parse preferences from keywords.
  // - Watcher proposes candidates (LLM), stored in temp_memory.user_profile_candidates
  // - Companion asks confirmation and writes user_profile_facts via tools
  // Prune (TTL + cap) opportunistically.
  const pruned = pruneGlobalDeferredTopics(tempMemory)
  if (pruned.changed) tempMemory = pruned.tempMemory
  // Capture explicit user deferrals outside bilan too.
  if (shouldStoreGlobalDeferredFromUserMessage(userMessage)) {
    const extracted = extractDeferredTopicFromUserMessage(userMessage)
    const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || ""
    const stored = storeGlobalDeferredTopic({ tempMemory, topic })
    if (stored.changed) tempMemory = stored.tempMemory
  }
  // Context string injected into agent prompts (must be declared before any post-checkup logic uses it).
  let context = ""
  // NOTE: We do NOT persist user_profile_facts automatically from the router.
  // Facts are only written after an explicit confirmation turn (low-stakes prompt).
  // Candidate extraction is owned by Watcher and stored in user_chat_states.temp_memory.
  
  const outageTemplate =
    "Je te réponds dès que je peux, je dois gérer une urgence pour le moment."


  // --- LOGIC VEILLEUR (Watcher) ---
  let msgCount = (state.unprocessed_msg_count || 0) + 1
  let lastProcessed = state.last_processed_at || new Date().toISOString()

  if (msgCount >= 15 && !isEvalParkingLotTest) {
    // Trigger watcher analysis (best effort).
    // IMPORTANT: do NOT block the user response on watcher work (it can add significant wall-clock time).
    runWatcher(supabase, userId, scope, lastProcessed, meta).catch((e) => {
      console.error("[Router] watcher failed (non-blocking):", e)
    })
    msgCount = 0
    lastProcessed = new Date().toISOString()
  }
  // ---------------------------------

  // 3. Analyse du Chef de Gare (Dispatcher)
  // On récupère le dernier message de l'assistant pour le contexte
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const lastAssistantAgent = history.filter((m: any) => m.role === 'assistant').pop()?.agent_used || null;
  
  const analysis = await analyzeIntentAndRisk(userMessage, state, lastAssistantMessage, meta)
  const riskScore = analysis.riskScore
  const nCandidates = analysis.nCandidates ?? 1
  // If a forceMode is requested (e.g. module conversation), we keep safety priority for sentry.
  let targetMode: AgentMode = (analysis.targetMode === 'sentry' ? 'sentry' : (opts?.forceMode ?? analysis.targetMode))

  // Safety escalation (candidate -> LLM confirmation) to avoid keyword false positives.
  // We do this BEFORE other routing heuristics, but still allow safety/active-checkup rules below.
  if (targetMode !== "sentry" && looksLikeSentryCandidate(userMessage)) {
    const conf = await confirmRouteToSentry({
      userMessage,
      lastAssistantMessage,
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
    })
    if (conf.route && conf.confidence >= 0.55) {
      // Anti-loop: if we already sent a sentry message recently, don't repeat it.
      const recently = await sentrySentRecently({ withinMs: 10 * 60 * 1000 })
      targetMode = recently ? "firefighter" : "sentry"
    }
  }

  // Long-form explainer routing:
  // If the user explicitly asks for a detailed explanation, route to Librarian.
  // Keep safety + active checkup priority.
  if (
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    !state?.investigation_state &&
    targetMode === "companion" &&
    looksLikeLongFormExplanationRequest(userMessage)
  ) {
    targetMode = "librarian"
  }

  // WhatsApp routing guardrails:
  // When Architect is running an onboarding "micro-sequence" (motivation score -> first concrete step),
  // do not let the dispatcher fall back to Companion on short numeric replies.
  if ((meta?.channel ?? "web") === "whatsapp" && meta?.whatsappMode === "onboarding") {
    if (
      looksLikeMotivationScoreAnswer(userMessage) &&
      lastAssistantAskedForMotivation(lastAssistantMessage) &&
      lastAssistantAgent === "architect"
    ) {
      targetMode = "architect";
    }
  }

  // WhatsApp plan execution guardrail:
  // If Architect just asked for a step confirmation ("C'est fait ?") and the user confirms,
  // keep Architect to close the loop cleanly (avoid Companion "vibes" + re-introducing the same action).
  if ((meta?.channel ?? "web") === "whatsapp") {
    if (lastAssistantAgent === "architect" && lastAssistantAskedForStepConfirmation(lastAssistantMessage) && looksLikeUserConfirmsStep(userMessage)) {
      targetMode = "architect"
    }
  }

  // WhatsApp (general) routing heuristics (not onboarding-specific).
  if ((meta?.channel ?? "web") === "whatsapp") {
    if (looksLikeHowToExerciseQuestion(userMessage)) {
      // Prefer Architect for "how-to" instructions about concrete exercises/actions.
      targetMode = "architect";
    }
    // WhatsApp stress venting:
    // Previously we often downgraded Firefighter → Investigator (structured assessment).
    // But this frequently felt cold / "bilan-y" for users who are simply overwhelmed.
    // New rule: keep Firefighter only when risk is meaningfully elevated; otherwise use Companion.
    if (targetMode === "firefighter" && looksLikeWorkPressureVenting(userMessage) && !looksLikeAcuteDistress(userMessage)) {
      targetMode = riskScore >= 6 ? "firefighter" : "companion";
    }
  }

  // Architect -> Companion handoff (anti-stuck / anti-"always plan" mode):
  // The dispatcher has a stability rule that often keeps "architect" once entered. That's useful,
  // but it can make the architect overstay when the user is no longer in plan/objectives mode.
  // We correct that here with a conservative heuristic.
  if (targetMode === "architect" && (state?.current_mode ?? "companion") === "architect") {
    const inferredPlanFocus = inferPlanFocusFromUser(userMessage)
    const memPlanFocus = Boolean((tempMemory as any)?.architect?.plan_focus ?? false)
    const planFocus = inferredPlanFocus == null ? memPlanFocus : inferredPlanFocus

    const s = normalizeLoose(userMessage)
    const looksLikeShortAck =
      s.length <= 24 && /\b(ok|oui|merci|daccord|ça marche|cest bon|ok merci|parfait|top)\b/i.test(userMessage ?? "")

    const explicitlyAsksForPlanOrSteps =
      /\b(plan|action|actions|phase|objectif|objectifs|et\s+apres|la\s+suite|on\s+fait\s+quoi|par\s+quoi|comment)\b/i
        .test(userMessage ?? "")

    // If the user doesn't want plan-focus, and isn't explicitly asking for structured plan help,
    // hand off to Companion to avoid over-architecting / looping on "why/how".
    // Do NOT hand off away from Architect when we're in a confirmation micro-step.
    const confirmationMicroStep =
      (meta?.channel ?? "web") === "whatsapp" &&
      lastAssistantAgent === "architect" &&
      lastAssistantAskedForStepConfirmation(lastAssistantMessage) &&
      looksLikeUserConfirmsStep(userMessage)

    if (confirmationMicroStep) {
      targetMode = "architect"
    } else if (planFocus === false && !explicitlyAsksForPlanOrSteps) {
      targetMode = "companion"
    } else if (looksLikeShortAck && !explicitlyAsksForPlanOrSteps) {
      // Short acknowledgements should not keep the architect "locked" unless the user asks to continue.
      targetMode = "companion"
    }
  }

  // Guardrail: during an active checkup, do NOT route to firefighter for "stress" talk unless
  // risk is elevated or the message clearly signals acute distress.
  // This prevents breaking the checkup flow for normal "stress/organisation" topics.
  const checkupActive = Boolean(state?.investigation_state);
  const stopCheckup = isExplicitStopCheckup(userMessage);
  if (checkupActive && !stopCheckup && targetMode === "firefighter" && riskScore <= 1 && !looksLikeAcuteDistress(userMessage)) {
    targetMode = "investigator";
  }

  // Manual checkup resumption:
  // If the user explicitly asks to finish/resume the bilan while we are in post-bilan,
  // exit post-bilan state and route to investigator so the checkup can be restarted cleanly.
  if (
    looksLikeExplicitResumeCheckupIntent(userMessage) &&
    (state?.investigation_state?.status === "post_checkup" || state?.investigation_state?.status === "post_checkup_done")
  ) {
    try {
      await updateUserState(supabase, userId, scope, { investigation_state: null })
      state = { ...(state ?? {}), investigation_state: null }
    } catch (e) {
      console.error("[Router] failed to exit post-checkup for resume request (non-blocking):", e)
    }
    targetMode = "investigator"
  }

  // Deterministic routing for specific exercise activations (important on WhatsApp).
  // This avoids the message being treated as small-talk and ensures the framework can be created.
  if (targetMode !== "sentry" && targetMode !== "firefighter" && looksLikeAttrapeRevesActivation(userMessage)) {
    targetMode = "architect"
  }

  // Start checkup/investigator only when it makes sense:
  // - If a checkup is already active, the hard guard below keeps investigator stable.
  // - Otherwise, require explicit intent ("bilan/check") OR a clear progress signal tied to an action/plan.
  // This prevents accidental "bilan mode" launches from noisy classifier outputs.
  // (moved earlier) const checkupActive / stopCheckup
  const dailyBilanReply = looksLikeDailyBilanAnswer(userMessage, lastAssistantMessage)
  if (!checkupActive && !stopCheckup && dailyBilanReply) {
    targetMode = 'investigator'
  }
  // Investigator should ONLY start when the user explicitly asks for it (bilan/check),
  // or when responding to a checkup/bilan prompt (dailyBilanReply).
  // Progress reporting ("j'ai fait / pas fait") should be handled by Architect/Companion, not Investigator.
  const shouldStartInvestigator =
    looksLikeExplicitCheckupIntent(userMessage) ||
    dailyBilanReply
  if (!checkupActive && targetMode === 'investigator' && !shouldStartInvestigator) {
    targetMode = 'companion'
  }

  // Deferred-topic helpers are implemented in `router/deferred_topics.ts` (imported).

  const isPostCheckup = state?.investigation_state?.status === "post_checkup"

  // HARD GUARD: during an active checkup/bilan, only investigator may answer (unless explicit stop).
  // We still allow safety escalation (sentry/firefighter) to override.
  if (
    checkupActive &&
    !isPostCheckup &&
    !stopCheckup &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    !shouldBypassCheckupLockForDeepWork(userMessage, targetMode)
  ) {
    targetMode = "investigator";
  }

  // If the user explicitly says "we'll talk about X later/after", capture that topic immediately.
  // This ensures the end-of-bilan transition can reliably enter post-checkup mode.
  if (checkupActive && !isPostCheckup && !stopCheckup && userExplicitlyDefersTopic(userMessage)) {
    try {
      const latest = await getUserState(supabase, userId, scope)
      if (latest?.investigation_state) {
        const extracted = extractDeferredTopicFromUserMessage(userMessage)
        const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || "Sujet à reprendre"
        const updatedInv = appendDeferredTopicToState(latest.investigation_state, topic)
        await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
        // Keep local in-memory state in sync so later "preserve deferred_topics" merges don't drop it.
        // (The Investigator branch below uses `state` as a baseline when it writes invResult.newState.)
        state = { ...(state ?? {}), investigation_state: updatedInv }
      }
    } catch (e) {
      console.error("[Router] user deferred topic store failed (non-blocking):", e)
    }
  }

  // --- POST-CHECKUP PARKING LOT (router-owned state machine) ---
  // State shape stored in user_chat_states.investigation_state:
  // { status: "post_checkup", temp_memory: { deferred_topics: string[], current_topic_index: number } }
  function userSignalsTopicDone(m: string): boolean {
    const s = (m ?? "").toString().trim().toLowerCase()
    if (!s) return false
    // Include "oui" because users commonly answer "Oui, merci" to the closing question.
    return /\b(oui|c['’]est\s+bon|ok|merci|suivant|passons|on\s+avance|continue|on\s+continue|ça\s+va|c['’]est\s+clair)\b/i.test(s)
  }

  if (isPostCheckup && targetMode !== "sentry") {
    const deferredTopics = state?.investigation_state?.temp_memory?.deferred_topics ?? []
    const idx = Number(state?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
    let closedThisTurn = false

    // If the user explicitly stops during post-bilan, close the parking lot immediately.
    if (stopCheckup) {
      if (isEvalParkingLotTest) {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            status: "post_checkup_done",
            temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString(), stopped_by_user: true },
          },
        })
      } else {
        await updateUserState(supabase, userId, scope, { investigation_state: null })
      }
      targetMode = "companion"
      closedThisTurn = true
    }

    // If user confirms "ok/next" -> advance to next topic immediately (no agent call for this turn).
    if (!closedThisTurn && userSignalsTopicDone(userMessage)) {
      const nextIdx = idx + 1
      if (nextIdx >= deferredTopics.length) {
        if (isEvalParkingLotTest) {
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: nextIdx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
        closedThisTurn = true
      } else {
        await updateUserState(supabase, userId, scope, {
          investigation_state: {
            ...state.investigation_state,
            temp_memory: { ...state.investigation_state.temp_memory, current_topic_index: nextIdx },
          },
        })
        targetMode = "companion"
      }
    }

    // If still in post-checkup after the potential advance, route to handle current topic.
    // IMPORTANT: if we just closed post-checkup (e.g. user said "merci/ok"), do NOT proceed to topic-selection.
    // Otherwise we may overwrite the just-written post_checkup_done marker (current_topic_index) in the "Nothing to do -> close" branch.
    if (!closedThisTurn) {
      const state2 = await getUserState(supabase, userId, scope)
      const deferred2 = state2?.investigation_state?.temp_memory?.deferred_topics ?? []
      const idx2 = Number(state2?.investigation_state?.temp_memory?.current_topic_index ?? 0) || 0
      const topic = deferred2[idx2]

      if (topic) {
        // Choose agent
        if (/\b(planning|agenda|organisation|programme|plan)\b/i.test(topic)) targetMode = "architect"
        else if (/\b(panique|crise|je\s+craque|d[ée]tresse|urgence)\b/i.test(topic)) targetMode = "firefighter"
        else if (/\b(stress|angoisse|tension)\b/i.test(topic)) targetMode = "companion"
        else targetMode = "companion"

        const topicContext =
          `=== MODE POST-BILAN (SUJET REPORTÉ ${idx2 + 1}/${deferred2.length}) ===\n` +
          `SUJET À TRAITER MAINTENANT : "${topic}"\n` +
          `CONSIGNE : C'est le moment d'en parler. Traite ce point.\n` +
          `RÈGLES CRITIQUES :\n` +
          `- Le bilan est DÉJÀ TERMINÉ.\n` +
          `- Interdiction de dire "après le bilan" ou de proposer de continuer/reprendre le bilan.\n` +
          `- Ne pose pas de questions de bilan sur d'autres actions/vitals.\n` +
          `- Ne pousse pas "le plan" / des actions/frameworks non activés. Sois compagnon: si l'utilisateur n'en parle pas, n'insiste pas.\n` +
        `VALIDATION : Termine par "C'est bon pour ce point ?" UNIQUEMENT quand tu as donné ton conseil principal et que tu veux valider/avancer.\n` +
        `NE LE RÉPÈTE PAS à chaque message si la discussion continue.`;
        context = `${topicContext}\n\n${context}`.trim()
      } else {
        // Nothing to do -> close
        if (isEvalParkingLotTest) {
          await updateUserState(supabase, userId, scope, {
            investigation_state: {
              status: "post_checkup_done",
              temp_memory: { deferred_topics: deferredTopics, current_topic_index: idx, finished_at: new Date().toISOString() },
            },
          })
        } else {
          await updateUserState(supabase, userId, scope, { investigation_state: null })
        }
        targetMode = "companion"
      }
    }
  }

  // 4. Mise à jour du risque si nécessaire
  if (riskScore !== state.risk_level) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore })
  }

  // 4.5 RAG Retrieval (Forge Memory)
  // Build a shared context string used by agent prompts.
  // We always inject temporal context (timezone-aware), and we add heavy RAG context only for selected modes.
  const injectedContext = context
  context = ""

  // Minimal temporal context: always include (except for sentry, which should be short and deterministic).
  const timeBlock =
    targetMode !== "sentry" && userTime?.prompt_block
      ? `=== REPÈRES TEMPORELS ===\n${userTime.prompt_block}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`
      : ""
  if (timeBlock) context += timeBlock

  if (['architect', 'companion', 'firefighter'].includes(targetMode)) {
    // Recent transcript (raw turns) to complement the Watcher short-term summary ("fil rouge").
    // We keep it bounded to avoid huge prompts.
    const recentTurns = (history ?? []).slice(-15).map((m: any) => {
      const role = String(m?.role ?? "").trim() || "unknown"
      const content = String(m?.content ?? "").trim().slice(0, 420)
      const ts = String((m as any)?.created_at ?? "").trim()
      return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`
    }).join("\n")

    // Short-term "fil rouge" maintained by Watcher (when available).
    const shortTerm = (state?.short_term_context ?? "").toString().trim()
    // A. Vector Memory
    const vectorContext = await retrieveContext(supabase, userId, userMessage);
    
    // B. Core Identity (Temple)
    const identityContext = await getCoreIdentity(supabase, userId);

    // C. Dashboard Context (Live Data)
    const dashboardContext = await getDashboardContext(supabase, userId);

    // D. User model (structured facts)
    let factsContext = ""
    try {
      const factRows = await getUserProfileFacts({ supabase, userId, scopes: ["global", scope] })
      factsContext = formatUserProfileFactsForPrompt(factRows, scope)
    } catch (e) {
      console.warn("[Context] failed to load user_profile_facts (non-blocking):", e)
    }

    // F. User model confirmation state (for Companion only; no inference in router)
    let prefConfirmContext = ""
    if (targetMode === "companion") {
      try {
        // Candidates are stored in DB (user_profile_fact_candidates) and only injected here.
        const { data: candRows, error: candErr } = await supabase
          .from("user_profile_fact_candidates")
          .select("id, key, scope, proposed_value, confidence, hits, reason, evidence, last_seen_at, last_asked_at, asked_count, status")
          .eq("user_id", userId)
          .in("scope", ["global", scope])
          .in("status", ["pending", "asked"])
          .limit(30)
        if (candErr) throw candErr

        function scoreCandidate(r: any): number {
          const conf = Math.max(0, Math.min(1, Number(r?.confidence ?? 0)))
          const hits = Math.max(1, Number(r?.hits ?? 1))
          const askedCount = Math.max(0, Number(r?.asked_count ?? 0))
          const lastSeen = Date.parse(String(r?.last_seen_at ?? ""))
          const lastAsked = Date.parse(String(r?.last_asked_at ?? ""))
          const ageDays = Number.isFinite(lastSeen) ? (Date.now() - lastSeen) / (24 * 60 * 60 * 1000) : 999
          const recency = Math.exp(-ageDays / 7) // half-life-ish
          const hitFactor = Math.min(2.0, 1 + Math.log1p(hits) / Math.log(6))
          // Anti-spam: if asked in last 24h, heavily penalize.
          const askedRecently = Number.isFinite(lastAsked) && (Date.now() - lastAsked) < 24 * 60 * 60 * 1000
          const askPenalty = askedRecently ? 0.15 : 1.0
          const fatiguePenalty = Math.max(0.3, 1.0 - 0.15 * askedCount)
          return conf * recency * hitFactor * askPenalty * fatiguePenalty
        }

        const candSorted = (candRows ?? [])
          .map((r: any) => ({ ...r, _score: scoreCandidate(r) }))
          .sort((a: any, b: any) => Number(b?._score ?? 0) - Number(a?._score ?? 0))
          .slice(0, 6)

        const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
        if (pending || (Array.isArray(candRows) && candRows.length > 0)) {
          const safeCandidates = candSorted
          prefConfirmContext =
            `=== USER MODEL (CANDIDATES / CONFIRMATION) ===\n` +
            `RÈGLE: ne JAMAIS écrire de facts sans confirmation explicite.\n` +
            `PENDING_CONFIRMATION: ${pending ? JSON.stringify(pending) : "null"}\n` +
            `CANDIDATES: ${safeCandidates.length > 0 ? JSON.stringify(safeCandidates) : "[]"}\n`
        }
      } catch (e) {
        console.warn("[Context] failed to build user model candidates context (non-blocking):", e)
      }
    }

    context = ""
    if (injectedContext) context += `${injectedContext}\n\n`
    if (timeBlock) context += timeBlock
    if (factsContext) context += `${factsContext}\n\n`
    if (prefConfirmContext) context += `${prefConfirmContext}\n\n`
    if (shortTerm) context += `=== FIL ROUGE (CONTEXTE COURT TERME) ===\n${shortTerm}\n\n`
    if (recentTurns) context += `=== HISTORIQUE RÉCENT (15 DERNIERS MESSAGES) ===\n${recentTurns}\n\n`
    if (dashboardContext) context += `${dashboardContext}\n\n`; 
    if (identityContext) context += `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identityContext}\n\n`;
    if (vectorContext) context += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${vectorContext}`;
    
    if (context) {
      console.log(`[Context] Loaded Dashboard + Identity + Vectors`);
    }
  }
  if (opts?.contextOverride) {
    context = `=== CONTEXTE MODULE (UI) ===\n${opts.contextOverride}\n\n${context}`.trim()
  }

  // --- Architect anti-loop / plan-focus state (lightweight state machine) ---
  // Goal: prevent the Architect from looping on objectives, asking the same question twice, or expanding into multiple objectives.
  if (targetMode === "architect") {
    const tm = (tempMemory ?? {}) as any
    const arch = (tm.architect ?? {}) as any

    const inferred = inferPlanFocusFromUser(userMessage)
    const planFocus = inferred == null ? Boolean(arch.plan_focus ?? false) : inferred
    const objective = extractObjective(userMessage)
    const currentObjective = objective ? objective : (typeof arch.current_objective === "string" ? arch.current_objective : "")

    const lastQfps = Array.isArray(arch.last_q_fps) ? arch.last_q_fps : []
    // Detect repeated questions in the recent Architect turns (same fingerprint appears twice).
    const recentAssistant = history.filter((m: any) => m?.role === "assistant").slice(-6)
    const recentQfps = recentAssistant
      .map((m: any) => extractLastQuestionFingerprint(String(m?.content ?? "")))
      .filter(Boolean) as string[]
    const dup = (() => {
      const seen = new Set<string>()
      for (const fp of recentQfps) {
        if (seen.has(fp)) return true
        seen.add(fp)
      }
      return false
    })()
    const objectiveTalk = recentAssistant
      .map((m: any) => String(m?.content ?? ""))
      .join("\n")
    const objectiveOverTalk = /\b(objectif|pourquoi|prioritaire|vision|identit[eé]|deep\s*why)\b/i.test(objectiveTalk) &&
      recentQfps.length >= 2

    const loopHit = dup || objectiveOverTalk
    const prevLoopCount = Number(arch.loop_count ?? 0) || 0
    const loopCount = loopHit ? Math.min(5, prevLoopCount + 1) : Math.max(0, prevLoopCount - 1)

    // Update memory
    const nextArch = {
      ...arch,
      plan_focus: planFocus,
      current_objective: currentObjective || null,
      last_q_fps: Array.from(new Set([...lastQfps, ...recentQfps])).slice(-8),
      loop_count: loopCount,
      last_updated_at: new Date().toISOString(),
    }
    tempMemory = { ...(tm ?? {}), architect: nextArch }

    // Inject a guardrail when we detect a loop OR when plan_focus is false (to prevent plan-obsession bleeding into emotional chats).
    if (loopHit || planFocus === false) {
      const guard = buildArchitectLoopGuard({
        planFocus,
        currentObjective: currentObjective || null,
        loopCount,
      })
      context = `${guard}\n\n${context}`.trim()
    }
  }

  // 5. Exécution de l'Agent Choisi
  let responseContent = ""
  let nextMode = targetMode

  console.log(`[Router] User: "${userMessage}" -> Dispatch: ${targetMode} (Risk: ${riskScore})`)

  // Anti-loop (plan non détecté): on évite le "computer says no".
  // Si le contexte indique qu'il n'y a AUCUN plan actif et que l'utilisateur insiste (C'est bon / j'ai validé / bug),
  // et qu'on a déjà répondu au moins une fois récemment "je ne vois pas ton plan", on escalade vers support.
  let noPlanEscalatedRecently = false
  if ((meta?.channel ?? "web") === "whatsapp" && meta?.whatsappMode === "onboarding") {
    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("scope", scope)
        .eq("role", "assistant")
        .gte("created_at", sinceIso)
        .filter("metadata->>reason", "eq", "no_plan_loop_escalation")
      noPlanEscalatedRecently = (Number(count ?? 0) || 0) > 0
    } catch {
      noPlanEscalatedRecently = false
    }
  }

  if (
    (meta?.channel ?? "web") === "whatsapp" &&
    meta?.whatsappMode === "onboarding" &&
    !noPlanEscalatedRecently &&
    targetMode === "architect" &&
    looksLikeUserClaimsPlanIsDone(userMessage) &&
    countNoPlanBlockerMentions(history) >= 1
  ) {
    responseContent =
      "Ok, je te crois — là ça ressemble à un souci de synchro ou un bug côté site.\n\n" +
      "Pour ne pas tourner en rond: écris à sophia@sophia-coach.ai avec:\n" +
      "- l’email de ton compte\n" +
      "- une capture de ton dashboard (même vide)\n" +
      "- ton téléphone + navigateur (ex: iPhone/Safari, Android/Chrome)\n\n" +
      "En attendant: dis-moi en 1 phrase ton objectif #1 du moment et je te propose un premier pas simple à faire aujourd’hui (sans attendre que le dashboard se remplisse).";
    nextMode = "architect";
    try {
      await updateUserState(supabase, userId, scope, {
        current_mode: nextMode,
        unprocessed_msg_count: msgCount,
        last_processed_at: lastProcessed,
        temp_memory: tempMemory,
      })
    } catch {}
    // Best-effort: log the assistant message (don't block the reply if DB write fails).
    try {
      await logMessage(supabase, userId, scope, "assistant", responseContent, "architect", { reason: "no_plan_loop_escalation" });
    } catch {}
    return { content: normalizeChatText(responseContent), mode: nextMode, aborted: false };
  }

  const agentOut = await runAgentAndVerify({
            supabase,
            userId,
    scope,
    channel,
          userMessage,
          history,
          state,
          context,
    meta,
    targetMode,
    nCandidates,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    outageTemplate,
    sophiaChatModel: SOPHIA_CHAT_MODEL,
  })

  responseContent = agentOut.responseContent
  nextMode = agentOut.nextMode

  // Lightweight global proactivity: occasionally remind a deferred topic (max 1/day, and only if we won't add a 2nd question).
  const nudged = maybeInjectGlobalDeferredNudge({ tempMemory, userMessage, responseText: responseContent })
  if (nudged.changed) {
    tempMemory = nudged.tempMemory
    responseContent = nudged.responseText
  }

  // 6. Mise à jour du mode final et log réponse
  await updateUserState(supabase, userId, scope, { 
    current_mode: nextMode,
    unprocessed_msg_count: msgCount,
    last_processed_at: lastProcessed,
    temp_memory: tempMemory
  })
  if (logMessages) {
    await logMessage(supabase, userId, scope, 'assistant', responseContent, targetMode, opts?.messageMetadata)
  }

  return {
    content: responseContent,
    mode: targetMode
  }
}

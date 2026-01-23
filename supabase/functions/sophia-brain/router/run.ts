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
import { getEffectiveTierForUser } from "../../_shared/billing-tier.ts"
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
import { analyzeSignals, looksLikeAcuteDistress, type DispatcherSignals } from "./dispatcher.ts"
import {
  appendDeferredTopicToState,
  extractDeferredTopicFromUserMessage,
  userExplicitlyDefersTopic,
} from "./deferred_topics.ts"
import { debounceAndBurstMerge } from "./debounce.ts"
import { runAgentAndVerify } from "./agent_exec.ts"
import { maybeInjectGlobalDeferredNudge, pruneGlobalDeferredTopics, shouldStoreGlobalDeferredFromUserMessage, storeGlobalDeferredTopic } from "./global_deferred.ts"
import {
  closeTopicSession,
  enqueueSupervisorIntent,
  getActiveSupervisorSession,
  getSupervisorRuntime,
  pruneStaleArchitectToolFlow,
  pruneStaleSupervisorState,
  pruneStaleUserProfileConfirm,
  setArchitectToolFlowInTempMemory,
  syncLegacyArchitectToolFlowSession,
  upsertTopicSession,
  writeSupervisorRuntime,
} from "../supervisor.ts"

const SOPHIA_CHAT_MODEL =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL") ?? "") as string
  ).trim() || "gemini-3-flash-preview";

// Premium model for critical modes (sentry, firefighter high-risk, architect)
const SOPHIA_CHAT_MODEL_PRO =
  (
    ((globalThis as any)?.Deno?.env?.get?.("GEMINI_SOPHIA_CHAT_MODEL_PRO") ?? "") as string
  ).trim() || "gemini-3-pro-preview";

// Model routing: use pro model for critical situations
function selectChatModel(targetMode: AgentMode, riskScore: number): string {
  // Sentry = always pro (safety critical)
  if (targetMode === "sentry") return SOPHIA_CHAT_MODEL_PRO;
  // Firefighter with high risk (8+) = pro
  if (targetMode === "firefighter" && riskScore >= 8) return SOPHIA_CHAT_MODEL_PRO;
  // Architect = pro (complex reasoning for plan/values)
  if (targetMode === "architect") return SOPHIA_CHAT_MODEL_PRO;
  // Default = flash
  return SOPHIA_CHAT_MODEL;
}

const ENABLE_SUPERVISOR_PENDING_NUDGES_V1 =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SUPERVISOR_PENDING_NUDGES_V1") ?? "") as string).trim() === "1"

const ENABLE_SUPERVISOR_RESUME_NUDGES_V1 =
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SUPERVISOR_RESUME_NUDGES_V1") ?? "") as string).trim() === "1"

// Daily message soft cap (to protect margins on power users)
const DAILY_MESSAGE_SOFT_CAP = Number(
  ((globalThis as any)?.Deno?.env?.get?.("SOPHIA_DAILY_MESSAGE_SOFT_CAP") ?? "100").trim()
) || 100;

const SOFT_CAP_ENABLED = 
  (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_SOFT_CAP_ENABLED") ?? "1") as string).trim() === "1";

const SOFT_CAP_RESPONSE_TEMPLATE = `Hey 😊 On a atteint les 100 messages du jour — c'est la limite de ton forfait actuel.

J'adore qu'on échange autant, ça montre qu'on avance bien ensemble !

Avec le **forfait Architect**, tu aurais un accès **illimité** à nos conversations, plus des outils avancés pour construire ton plan de vie.

👉 Découvre le forfait Architect : https://sophia-coach.ai/upgrade

Est-ce que ça t'intéresse ? Réponds **oui** ou **non**.

On se retrouve demain matin, reposé·e ! 💜`;

// Dispatcher v2 is now the only dispatcher (v1 legacy removed)

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
    // Eval-only: disable router-enforced mode overrides (preference/pending confirm/forceMode).
    disableForcedRouting?: boolean;
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

  function pickToolflowSummary(tm: any): { active: boolean; kind?: string; stage?: string } {
    const flow = (tm as any)?.architect_tool_flow
    if (!flow || typeof flow !== "object") return { active: false }
    const kind = typeof (flow as any).kind === "string" ? String((flow as any).kind) : undefined
    const stage = typeof (flow as any).stage === "string" ? String((flow as any).stage) : undefined
    return { active: true, kind, stage }
  }

  function pickSupervisorSummary(tm: any): {
    stack_top_type?: string
    stack_top_owner?: string
    stack_top_status?: string
    topic_session?: { topic?: string; phase?: string; focus_mode?: string; handoff_to?: string }
    queue_size?: number
    queue_reasons_tail?: string[]
    queue_pending_reasons?: string[]
  } {
    const sess = getActiveSupervisorSession(tm)
    const rt = (tm as any)?.supervisor
    const q = Array.isArray((rt as any)?.queue) ? (rt as any).queue : []
    const queueSize = q.length || undefined
    const reasons = q.map((x: any) => String(x?.reason ?? "")).filter((x: string) => x.trim())
    const tail = reasons.slice(-5)
    const pending = tail.filter((r: string) => r.startsWith("pending:"))
    const out: any = {
      stack_top_type: sess?.type ? String(sess.type) : undefined,
      stack_top_owner: sess?.owner_mode ? String(sess.owner_mode) : undefined,
      stack_top_status: sess?.status ? String(sess.status) : undefined,
      queue_size: queueSize,
      queue_reasons_tail: tail.length ? tail : undefined,
      queue_pending_reasons: pending.length ? pending : undefined,
    }
    if (sess?.type === "topic_session") {
      out.topic_session = {
        topic: sess.topic ? String(sess.topic).slice(0, 160) : undefined,
        phase: sess.phase ? String(sess.phase) : undefined,
        focus_mode: sess.focus_mode ? String(sess.focus_mode) : undefined,
        handoff_to: sess.handoff_to ? String(sess.handoff_to) : undefined,
      }
    }
    return out
  }

  function pickDeferredSummary(tm: any): { has_items: boolean; last_topic?: string } {
    const st = (tm as any)?.global_deferred_topics
    const items = Array.isArray((st as any)?.items) ? (st as any).items : []
    const last = items.length ? items[items.length - 1] : null
    const topic = last && typeof last === "object" ? String((last as any).topic ?? "").trim() : ""
    return { has_items: items.length > 0, last_topic: topic ? topic.slice(0, 160) : undefined }
  }

  function pickProfileConfirmSummary(tm: any): { pending: boolean; key?: string } {
    const pending = (tm as any)?.user_profile_confirm?.pending ?? null
    if (!pending || typeof pending !== "object") return { pending: false }
    const key = typeof (pending as any).key === "string" ? String((pending as any).key).slice(0, 80) : undefined
    return { pending: true, key }
  }

  function buildRouterDecisionV1(args: {
    requestId?: string
    scope: string
    channel: string
    dispatcher_target_mode: string
    target_mode_initial: string
    target_mode_final: string
    final_mode: string
    risk_score: number
    checkup_active: boolean
    stop_checkup: boolean
    is_post_checkup: boolean
    forced_preference_mode: boolean
    forced_pending_confirm: boolean
    toolflow_active_global: boolean
    toolflow_cancelled_on_stop: boolean
    pending_nudge_kind: string | null
    resume_action_v1: string | null
    stale_cleaned: string[]
    topic_session_closed: boolean
    topic_session_handoff: boolean
    safety_preempted_flow: boolean
    dispatcher_signals: DispatcherSignals | null
    temp_memory_before: any
    temp_memory_after: any
  }): { router_decision_v1: Record<string, unknown>; reason_codes: string[] } {
    const reasonCodes: string[] = []
    if (args.target_mode_final === "sentry") reasonCodes.push("SAFETY_SENTRY_OVERRIDE")
    else if (args.target_mode_final === "firefighter") reasonCodes.push("SAFETY_FIREFIGHTER_OVERRIDE")
    if (args.checkup_active && !args.is_post_checkup && !args.stop_checkup) reasonCodes.push("BILAN_HARD_GUARD_ACTIVE")
    if (args.is_post_checkup) reasonCodes.push("POST_CHECKUP_ACTIVE")
    if (args.toolflow_active_global && args.target_mode_final === "architect") reasonCodes.push("TOOLFLOW_ACTIVE_FOREGROUND")
    if (args.toolflow_cancelled_on_stop) reasonCodes.push("TOOLFLOW_CANCELLED_ON_STOP")
    if (args.forced_pending_confirm) reasonCodes.push("PROFILE_CONFIRM_HARD_GUARD_ACTIVE")
    if (args.forced_preference_mode) reasonCodes.push("PREFERENCE_FORCE_COMPANION")
    if (args.pending_nudge_kind === "global_deferred") reasonCodes.push("GLOBAL_DEFERRED_NUDGE")
    if (args.pending_nudge_kind === "post_checkup") reasonCodes.push("POST_CHECKUP_PENDING_NUDGE")
    if (args.pending_nudge_kind === "profile_confirm") reasonCodes.push("PROFILE_CONFIRM_PENDING_NUDGE")
    if (args.resume_action_v1 === "prompted") reasonCodes.push("RESUME_NUDGE_SHOWN")
    if (args.resume_action_v1 === "accepted") reasonCodes.push("RESUME_PREVIOUS_FLOW")
    if (args.resume_action_v1 === "declined") reasonCodes.push("RESUME_DECLINED")
    if (args.safety_preempted_flow) reasonCodes.push("SAFETY_PREEMPTED_FLOW")
    if (args.stale_cleaned.length > 0) reasonCodes.push("STALE_CLEANUP")
    if (args.topic_session_closed) reasonCodes.push("TOPIC_SESSION_CLOSED")
    if (args.topic_session_handoff) reasonCodes.push("TOPIC_SESSION_HANDOFF")

    const snapshotBefore = {
      toolflow: pickToolflowSummary(args.temp_memory_before),
      profile_confirm: pickProfileConfirmSummary(args.temp_memory_before),
      global_deferred: pickDeferredSummary(args.temp_memory_before),
      supervisor: pickSupervisorSummary(args.temp_memory_before),
    }
    const snapshotAfter = {
      toolflow: pickToolflowSummary(args.temp_memory_after),
      profile_confirm: pickProfileConfirmSummary(args.temp_memory_after),
      global_deferred: pickDeferredSummary(args.temp_memory_after),
      supervisor: pickSupervisorSummary(args.temp_memory_after),
    }

    return {
      router_decision_v1: {
        request_id: args.requestId ?? null,
        scope: args.scope,
        channel: args.channel,
        risk_score: args.risk_score,
        modes: {
          dispatcher_target: args.dispatcher_target_mode,
          target_initial: args.target_mode_initial,
          target_final: args.target_mode_final,
          final_mode: args.final_mode,
        },
        state_flags: {
          checkup_active: args.checkup_active,
          stop_checkup: args.stop_checkup,
          is_post_checkup: args.is_post_checkup,
          forced_preference_mode: args.forced_preference_mode,
          forced_pending_confirm: args.forced_pending_confirm,
          toolflow_active_global: args.toolflow_active_global,
          toolflow_cancelled_on_stop: args.toolflow_cancelled_on_stop,
        },
        pending_nudge_kind: args.pending_nudge_kind,
        resume_action_v1: args.resume_action_v1,
        stale_cleaned: args.stale_cleaned.length > 0 ? args.stale_cleaned : null,
        topic_session_closed: args.topic_session_closed || null,
        topic_session_handoff: args.topic_session_handoff || null,
        safety_preempted_flow: args.safety_preempted_flow || null,
        dispatcher_signals: args.dispatcher_signals ? {
          safety: args.dispatcher_signals.safety,
          intent: args.dispatcher_signals.user_intent_primary,
          intent_conf: args.dispatcher_signals.user_intent_confidence,
          interrupt: args.dispatcher_signals.interrupt,
          flow_resolution: args.dispatcher_signals.flow_resolution,
        } : null,
        reason_codes: reasonCodes,
        snapshot_before: snapshotBefore,
        snapshot_after: snapshotAfter,
        ts: new Date().toISOString(),
      },
      reason_codes: reasonCodes,
    }
  }

  function ensureSupervisorQueueIntent(opts: {
    tempMemory: any
    requestedMode: AgentMode
    reason: string
    messageExcerpt?: string
  }): { tempMemory: any; changed: boolean } {
    const reason = String(opts.reason ?? "").trim().slice(0, 160)
    if (!reason) return { tempMemory: opts.tempMemory, changed: false }
    const rt = getSupervisorRuntime(opts.tempMemory)
    const exists = Array.isArray(rt.queue) && rt.queue.some((q: any) => String(q?.reason ?? "") === reason)
    if (exists) return { tempMemory: opts.tempMemory, changed: false }
    return enqueueSupervisorIntent({
      tempMemory: opts.tempMemory,
      requestedMode: opts.requestedMode,
      reason,
      messageExcerpt: opts.messageExcerpt,
    })
  }

  function pruneSupervisorQueueManagedIntents(opts: {
    tempMemory: any
    keepReasons: Record<string, boolean>
  }): { tempMemory: any; changed: boolean } {
    const rt0 = getSupervisorRuntime(opts.tempMemory)
    const q0 = Array.isArray(rt0.queue) ? rt0.queue : []
    const keep = opts.keepReasons ?? {}
    const q1 = q0.filter((q: any) => {
      const r = String(q?.reason ?? "")
      // Only manage the explicit "pending:*" reasons we own; keep everything else untouched.
      if (r.startsWith("pending:")) {
        return Boolean(keep[r])
      }
      return true
    })
    if (q1.length === q0.length) return { tempMemory: opts.tempMemory, changed: false }
    const rt1 = { ...rt0, queue: q1, updated_at: new Date().toISOString() }
    return { tempMemory: writeSupervisorRuntime(opts.tempMemory, rt1 as any), changed: true }
  }

  function lowStakesTurn(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    if (s.length > 24) return false
    return /\b(ok|ok\s+merci|merci|super|top|daccord|dac|cool|yes|oui)\b/i.test(s)
  }

  function pickPendingFromSupervisorQueue(tm: any): { kind: "post_checkup" | "profile_confirm" | "global_deferred"; excerpt?: string } | null {
    const rt = getSupervisorRuntime(tm)
    const reasons = Array.isArray(rt.queue) ? rt.queue.map((q: any) => String(q?.reason ?? "")).filter(Boolean) : []
    const has = (r: string) => reasons.includes(r)
    // Priority order
    if (has("pending:post_checkup_parking_lot")) return { kind: "post_checkup" }
    if (has("pending:user_profile_confirm")) {
      // Attempt to find excerpt from the queued intent
      const q = (rt.queue ?? []).find((x: any) => String(x?.reason ?? "") === "pending:user_profile_confirm")
      const ex = q ? String((q as any)?.message_excerpt ?? "").trim().slice(0, 80) : ""
      return { kind: "profile_confirm", excerpt: ex || undefined }
    }
    if (has("pending:global_deferred_nudge")) return { kind: "global_deferred" }
    return null
  }

  function removeSupervisorQueueByReasonPrefix(opts: { tempMemory: any; prefix: string }): { tempMemory: any; changed: boolean } {
    const prefix = String(opts.prefix ?? "")
    if (!prefix) return { tempMemory: opts.tempMemory, changed: false }
    const rt0 = getSupervisorRuntime(opts.tempMemory)
    const q0 = Array.isArray(rt0.queue) ? rt0.queue : []
    const q1 = q0.filter((q: any) => !String(q?.reason ?? "").startsWith(prefix))
    if (q1.length === q0.length) return { tempMemory: opts.tempMemory, changed: false }
    const rt1 = { ...rt0, queue: q1, updated_at: new Date().toISOString() }
    return { tempMemory: writeSupervisorRuntime(opts.tempMemory, rt1 as any), changed: true }
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
    // NOTE: keep this conservative: only clear "down-regulation / overwhelmed" language.
    // Otherwise we may wrongly disable plan-focus for normal planning conversations.
    if (
      looksLikeWorkPressureVenting(m) ||
      looksLikeAcuteDistress(m) ||
      /\b(submerg[ée]?\b|d[ée]bord[ée]?\b|micro[-\s]?pause\b|pause\s+ensemble\b|j(?:e|')\s+veux\s+juste\s+respirer\b|j(?:e|')\s+veux\s+juste\s+que\s+[çc]a\s+s['’]arr[êe]te\b|redescendre\b|pas\s+de\s+(?:plan|tableau\s+de\s+bord|dashboard|objectifs?)\b)\b/i
        .test(s)
    ) return false
    // Plan / actions / dashboard intent
    if (/\b(plan|phase|objectif|objectifs|action|actions|exercice|exercices|dashboard|plateforme|activer|activation|debloquer|deblocage)\b/i.test(m)) return true
    // "Et après ?" usually means "next step"; treat as plan-focus but NOT "goals-focus".
    if (/\b(et\s+apres|la\s+suite|on\s+fait\s+quoi\s+maintenant|next)\b/i.test(s)) return true
    return null
  }

  function looksLikeUserBoredOrWantsToStop(m: string): boolean {
    const s = normalizeLoose(m)
    if (!s) return false
    if (/\b(stop|arrete|arr[êe]te|laisse\s+tomber|on\s+arrete|on\s+change|passe\s+a\s+autre\s+chose|bref|on\s+a\s+fait\s+le\s+tour|on\s+a\s+fini|c['']est\s+bon\s+pour\s+moi)\b/i.test(s)) return true
    // Very short "ok." / "..." / "bon." replies are often fatigue signals.
    if (s.length <= 4 && /\b(ok|ok\?|bon)\b/i.test(s)) return true
    return false
  }

  // Detect breakdown/micro-step intent: user is blocked and wants to split an action into smaller steps.
  // This should route to architect (break_down_action tool), NOT firefighter.
  function looksLikeBreakdownIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase()
    if (!s.trim()) return false
    return /\b(micro[-\s]?etape|d[ée]compos|d[ée]coup|d[ée]taill|petit\s+pas|[ée]tape\s+minuscule|je\s+bloqu|j['']y\s+arrive\s+pas|trop\s+dur|insurmontable|plus\s+simple|simplifi|version\s+light|version\s+facile)\b/i
      .test(s)
  }

  function guessTopicLabel(m: string): string {
    const s = normalizeLoose(m)
    if (!s) return "conversation"
    if (/^(salut|coucou|hello|hey|bonjour|bonsoir)\b/i.test(s)) return "conversation"
    
    // Avoid generic acknowledgments as topic labels
    const raw = String(m ?? "").trim()
    const isGeneric = /^(ok|oui|non|merci|super|top|cool|daccord|c'?est bon|parfait|d'?accord|bien recu|je vois|ah|oh|hmm|ça va)/i.test(normalizeLoose(raw))
    if (isGeneric || raw.length < 12) return "conversation"
    
    // Try to extract a more specific topic by looking for key nouns/phrases
    // Boss/work related - extract the specific entity
    const bossMatch = s.match(/\b(boss|chef|manager|sup[eé]rieur|patron|directeur)\b/i)
    if (bossMatch) return `problème avec ${bossMatch[1]}`
    
    const workMatch = s.match(/\b(travail|boulot|taff|job|bureau|boite|entreprise)\b/i)
    if (workMatch) return `situation au ${workMatch[1]}`
    
    // Emotional states - keep more specific  
    if (/\b(stress|stressé|anxieux|anxiété)\b/i.test(s)) return "stress / anxiété"
    if (/\b(angoisse|angoissé|panique|peur)\b/i.test(s)) return "angoisse / panique"
    if (/\b(triste|tristesse|déprim|cafard)\b/i.test(s)) return "humeur basse"
    
    // Specific activities
    if (/\b(bilan|checkup|check)\b/i.test(s)) return "bilan/checkup"
    if (/\b(plan|dashboard|phase|action|actions|exercice|exercices)\b/i.test(s)) return "plan / exécution"
    if (/\b(sport|bouger|course|gym|marche)\b/i.test(s)) return "activité physique"
    if (/\b(lecture|lire|livre|scroll|tel|téléphone)\b/i.test(s)) return "habitudes (lecture/écrans)"
    if (/\b(sommeil|dormir|insomnie|fatigue)\b/i.test(s)) return "sommeil / fatigue"
    if (/\b(famille|parents|enfants|conjoint|couple)\b/i.test(s)) return "relations familiales"
    if (/\b(ami|amis|copain|pote|social)\b/i.test(s)) return "vie sociale"
    
    // Default: use first meaningful part of the message (skip greeting words)
    const meaningful = raw.replace(/^(en fait|bon|alors|euh|hm+|ah|oh|oui|non|bref|enfin)\s*/gi, "").trim()
    if (meaningful.length > 10 && meaningful.length <= 80) return meaningful.slice(0, 80)
    if (meaningful.length > 80) return meaningful.slice(0, 77) + "..."
    
    return "conversation"
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

  function looksLikeDigressionRequest(m: string): boolean {
    const s = String(m ?? "").toLowerCase()
    if (!s.trim()) return false
    return (
      /\b(on\s+peut|j['’]ai\s+besoin\s+de|je\s+veux|j['’]ai\s+envie\s+de)\s+(?:te\s+)?parler\b/i.test(s) ||
      /\bparler\s+(?:de|du|des|d['’])\b/i.test(s) ||
      /\ben\s+parler\b/i.test(s) ||
      /\bau\s+fait\b/i.test(s) ||
      /\bd['’]?ailleurs\b/i.test(s)
    )
  }

  function extractTopicFromUserDigression(m: string): string {
    const raw = String(m ?? "").trim()
    if (!raw) return ""
    
    // PRIORITY: Extract work/stress-related subjects first (often buried in filler text)
    const bossMatch = raw.match(/\b(?:mon\s+)?(?:boss|chef|manager|sup[eé]rieur|patron|directeur)(?:\s+qui\s+[^,.!?]+)?/i)
    if (bossMatch?.[0]) return String(bossMatch[0]).trim().slice(0, 160)
    
    const workMatch = raw.match(/\b(?:mon\s+)?(?:travail|boulot|taff|job)(?:\s+qui\s+[^,.!?]+)?/i)
    if (workMatch?.[0]) return String(workMatch[0]).trim().slice(0, 160)
    
    const stressMatch = raw.match(/\b(?:le\s+|mon\s+)?stress(?:\s+(?:au|du|avec)\s+[^,.!?]+)?/i)
    if (stressMatch?.[0]) return String(stressMatch[0]).trim().slice(0, 160)
    
    // Standard patterns
    const m1 = raw.match(/\b(?:parler|discuter|revenir)\s+(?:de|du|des|d[''])\s+([^?.!]+)/i)
    if (m1?.[1]) {
      return String(m1[1]).trim().replace(/^[:\s-]+/, "").slice(0, 160)
    }
    return extractDeferredTopicFromUserMessage(raw)
  }

  function detectPreferenceHint(m: string): { key: string; uncertain: boolean } | null {
    const s = normalizeLoose(m)
    if (!s) return null
    const uncertain = /\b(pas\s+s[ûu]r|pas\s+sure|je\s+sais\s+pas|je\s+ne\s+sais\s+pas|peut[-\s]?être|je\s+crois|bof|j['’]h[ée]site|je\s+suis\s+pas\s+s[ûu]r)\b/i.test(s)
    if (/\b(emoji|emojis|smiley|smileys)\b/i.test(s)) return { key: "conversation.use_emojis", uncertain }
    if (/\b(plus\s+direct|plut[oô]t\s+direct|sois\s+direct|ton\s+direct|plus\s+doux|plut[oô]t\s+doux)\b/i.test(s)) {
      return { key: "conversation.tone", uncertain }
    }
    if (/\b(r[ée]ponses?\s+(?:plus\s+)?courtes?|r[ée]ponses?\s+br[èe]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+d[ée]tail)\b/i.test(s)) {
      return { key: "conversation.verbosity", uncertain }
    }
    if (/\b(ne\s+me\s+ram[eè]ne\s+pas|arr[êe]te\s+de\s+me\s+ramener|[ée]vite\s+de\s+me\s+ramener)\b[\s\S]{0,40}\b(plan|objectifs?|actions?)\b/i.test(s)) {
      return { key: "coaching.plan_push_allowed", uncertain }
    }
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
      `- Anti-boucle utilisateur (obligatoire si répétition 2+ fois): fais un meta-turn ("On tourne en rond" ou équivalent),\n` +
      `  puis CONVERGE: 1 micro-action concrète à faire maintenant + termine par UNE question oui/non.\n` +
      `  IMPORTANT: ne répète pas la même question oui/non mot pour mot sur 2 tours d'affilée.\n` +
      `  Exemples de questions oui/non (à alterner):\n` +
      `  - "Tu peux le faire maintenant ? (oui/non)"\n` +
      `  - "Tu veux que je te guide pas à pas, là, tout de suite ? (oui/non)"\n` +
      `  - "Tu veux qu’on fixe un moment précis (ce soir/demain) ? (oui/non)"\n` +
      (strictness >= 1
        ? `- Anti-boucle: limite à 2 étapes max. Résume ce qui est décidé, puis donne 1 prochaine étape concrète.\n`
        : "") +
      (strictness >= 2
        ? `- Interdiction de proposer A/B. Converge: "voici ce qu'on fait" + 1 question oui/non.\n`
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
  const disableForcedRouting = Boolean(opts?.disableForcedRouting)
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
    // Important: when aborted, do not emit an assistant message (prevents double-assistant / empty assistant entries).
    if (debounced.aborted) return { content: "", mode: "companion", aborted: true }
    userMessage = debounced.userMessage
  }

  // 2. Récupérer l'état actuel (Mémoire)
  let state = await getUserState(supabase, userId, scope)
  // Global parking-lot lives in user_chat_states.temp_memory (independent from investigation_state).
  let tempMemory = (state as any)?.temp_memory ?? {}

  // --- SOFT CAP: Daily message limit to protect margins on power users ---
  // Skip for evals and for Architect tier (unlimited messages)
  const userTier = SOFT_CAP_ENABLED ? await getEffectiveTierForUser(supabase, userId).catch(() => "none" as const) : "none"
  const isArchitect = userTier === "architecte"
  
  if (SOFT_CAP_ENABLED && !isArchitect && !meta?.requestId?.includes(":eval") && !meta?.requestId?.includes(":tools:")) {
    // Use user's local date (from their timezone), fallback to UTC if not available
    const today = userTime?.user_local_date ?? new Date().toISOString().slice(0, 10) // YYYY-MM-DD in user's timezone
    const softCapState = (tempMemory as any)?.soft_cap ?? {}
    const lastCountDate = softCapState.date ?? ""
    const messageCount = lastCountDate === today ? (softCapState.count ?? 0) : 0
    const wasOverCap = softCapState.over_cap === true && lastCountDate === today
    const hasAnsweredUpgrade = softCapState.upgrade_answered === true && lastCountDate === today

    // Check if user is responding to the upgrade question
    const userMsgLower = normalizeLoose(userMessage)
    const isUpgradeYes = wasOverCap && !hasAnsweredUpgrade && /^(oui|yes|ouais|ok|yep|yeah|je veux|interesse)/.test(userMsgLower)
    const isUpgradeNo = wasOverCap && !hasAnsweredUpgrade && /^(non|no|nan|pas vraiment|pas pour l instant)/.test(userMsgLower)

    if (isUpgradeYes || isUpgradeNo) {
      // Store upgrade interest (for Architect plan)
      try {
        await supabase.from("upgrade_interest").upsert({
          user_id: userId,
          interested: isUpgradeYes,
          source: "soft_cap_architect_prompt",
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        console.log(`[SoftCap] User ${userId} responded to Architect upgrade: ${isUpgradeYes ? "YES" : "NO"}`)
      } catch (e) {
        console.warn("[SoftCap] Failed to store upgrade interest:", e)
      }

      // Update state
      tempMemory = {
        ...tempMemory,
        soft_cap: { ...softCapState, date: today, upgrade_answered: true },
      }
      await updateUserState(supabase, userId, scope, { temp_memory: tempMemory })

      // Respond
      const responseContent = isUpgradeYes
        ? "Super ! 💜 Je note ton intérêt pour le forfait Architect. Tu recevras bientôt plus d'infos pour découvrir tout ce qu'il peut t'apporter. À demain !"
        : "Pas de souci, je comprends ! 😊 Le forfait actuel te convient peut-être très bien. On se retrouve demain pour continuer. Prends soin de toi d'ici là !"

      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: responseContent,
          metadata: { agent: "soft_cap", soft_cap_response: true },
        })
      }

      return { content: responseContent, mode: "companion" as AgentMode }
    }

    // If over cap (whether answered or not), keep blocking
    if (wasOverCap) {
      const blockResponse = hasAnsweredUpgrade 
        ? "On a atteint les 100 messages du jour 😊 On se retrouve demain matin !"
        : "On a atteint les 100 messages du jour. Tu peux répondre **oui** ou **non** à ma question sur le forfait Architect, sinon on se retrouve demain ! 💜"
      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: blockResponse,
          metadata: { agent: "soft_cap", soft_cap_blocked: true },
        })
      }
      return { content: blockResponse, mode: "companion" as AgentMode }
    }

    // Check if we hit the cap NOW
    if (messageCount >= DAILY_MESSAGE_SOFT_CAP && !wasOverCap) {
      console.log(`[SoftCap] User ${userId} hit daily cap (${messageCount}/${DAILY_MESSAGE_SOFT_CAP})`)
      
      // Mark as over cap
      tempMemory = {
        ...tempMemory,
        soft_cap: { date: today, count: messageCount, over_cap: true, upgrade_answered: false },
      }
      await updateUserState(supabase, userId, scope, { temp_memory: tempMemory })

      // Send soft cap template
      if (logMessages) {
        await supabase.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: SOFT_CAP_RESPONSE_TEMPLATE,
          metadata: { agent: "soft_cap", soft_cap_triggered: true },
        })
      }

      return { content: SOFT_CAP_RESPONSE_TEMPLATE, mode: "companion" as AgentMode }
    }

    // Increment counter
    tempMemory = {
      ...tempMemory,
      soft_cap: { date: today, count: messageCount + 1, over_cap: false },
    }
    // Note: state will be saved later in the normal flow
  }

  // NOTE: router should never infer/parse preferences from keywords.
  // - Watcher proposes candidates (LLM), stored in temp_memory.user_profile_candidates
  // - Companion asks confirmation and writes user_profile_facts via tools
  // Prune (TTL + cap) opportunistically.
  const pruned = pruneGlobalDeferredTopics(tempMemory)
  if (pruned.changed) tempMemory = pruned.tempMemory

  // --- TTL / STALE CLEANUP (uniform across all machines) ---
  // Run early so that stale state doesn't affect routing decisions.
  const staleCleaned: string[] = []
  {
    const c1 = pruneStaleArchitectToolFlow({ tempMemory })
    if (c1.changed) { tempMemory = c1.tempMemory; staleCleaned.push("architect_tool_flow") }

    const c2 = pruneStaleUserProfileConfirm({ tempMemory })
    if (c2.changed) { tempMemory = c2.tempMemory; staleCleaned.push("user_profile_confirm") }

    const c3 = pruneStaleSupervisorState({ tempMemory })
    if (c3.changed) { tempMemory = c3.tempMemory; staleCleaned.push(...c3.cleaned) }
  }

  // --- SUPERVISOR (global runtime: stack/queue) ---
  // Keep supervisor runtime in sync with legacy multi-turn flows.
  // (Today we sync the Architect tool flow; other sessions can be added progressively.)
  const syncedSupervisor = syncLegacyArchitectToolFlowSession({ tempMemory })
  if (syncedSupervisor.changed) tempMemory = syncedSupervisor.tempMemory
  // Capture explicit user deferrals outside bilan too.
  if (shouldStoreGlobalDeferredFromUserMessage(userMessage)) {
    const extracted = extractDeferredTopicFromUserMessage(userMessage)
    const topic = extracted || String(userMessage ?? "").trim().slice(0, 240) || ""
    const stored = storeGlobalDeferredTopic({ tempMemory, topic })
    if (stored.changed) tempMemory = stored.tempMemory
  }

  // --- PR3: Index pending obligations into supervisor.queue (no duplication of state) ---
  // We keep these conservative and deduped; they serve as a "what's pending?" index for the scheduler.
  const managedPendingReasons: Record<string, boolean> = {
    "pending:user_profile_confirm": false,
    "pending:global_deferred_nudge": false,
    "pending:post_checkup_parking_lot": false,
  }

  // Global deferred nudge (opportunistic): only queue when there are items and the user turn looks low-stakes.
  // (We keep this simple and conservative; the actual injection stays in maybeInjectGlobalDeferredNudge.)
  {
    const st = (tempMemory as any)?.global_deferred_topics
    const items = Array.isArray((st as any)?.items) ? (st as any).items : []
    const hasItems = items.length > 0
    const s = normalizeLoose(userMessage)
    const lowStakes =
      s.length > 0 &&
      s.length <= 24 &&
      /\b(ok|ok\s+merci|merci|super|top|daccord|dac|cool|yes|oui)\b/i.test(s)
    if (hasItems && lowStakes) {
      managedPendingReasons["pending:global_deferred_nudge"] = true
      const last = items[items.length - 1]
      const topic = last && typeof last === "object" ? String((last as any)?.topic ?? "").trim().slice(0, 160) : ""
      const queued = ensureSupervisorQueueIntent({
        tempMemory,
        requestedMode: "companion",
        reason: "pending:global_deferred_nudge",
        messageExcerpt: topic || undefined,
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
  }

  // If the user explicitly says "later", inject a hard preference so the next agent doesn't override it.
  // NOTE: context is built later; we store the addendum now and prepend it once `context` exists.
  let deferredUserPrefContext = ""
  if (userExplicitlyDefersTopic(userMessage)) {
    const extracted = extractDeferredTopicFromUserMessage(userMessage)
    const topic = extracted || ""
    if (topic) {
      deferredUserPrefContext =
        `=== SUJET À TRAITER PLUS TARD (PRÉFÉRENCE UTILISATEUR) ===\n` +
        `L'utilisateur a explicitement demandé d'en reparler plus tard: "${topic}".\n` +
        `RÈGLE: ne force pas ce sujet maintenant; demande seulement si on le fait maintenant OU on le garde pour plus tard.\n`
    }
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
  const lastAssistantAgentRaw = history.filter((m: any) => m.role === 'assistant').pop()?.agent_used || null;
  const normalizeAgentUsed = (raw: unknown): string | null => {
    const s = String(raw ?? "").trim()
    if (!s) return null
    // DB often stores "sophia.architect" / "sophia.companion" etc.
    const m = s.match(/\b(sentry|firefighter|investigator|architect|companion|librarian)\b/i)
    return m ? m[1]!.toLowerCase() : s.toLowerCase()
  }
  const lastAssistantAgent = normalizeAgentUsed(lastAssistantAgentRaw)
  
  // --- DISPATCHER: Signal-based routing ---
  // Structured signals → deterministic policies instead of LLM choosing the mode directly.
  let riskScore = 0
  let dispatcherTargetMode: AgentMode = "companion"
  let targetMode: AgentMode = "companion"

  // Build state snapshot for dispatcher
  const topicSession = getActiveSupervisorSession(tempMemory)
  const stateSnapshot = {
    current_mode: state?.current_mode,
    investigation_active: Boolean(state?.investigation_state),
    investigation_status: state?.investigation_state?.status,
    toolflow_active: Boolean((tempMemory as any)?.architect_tool_flow),
    toolflow_kind: (tempMemory as any)?.architect_tool_flow?.kind,
    profile_confirm_pending: Boolean((tempMemory as any)?.user_profile_confirm?.pending),
    topic_session_phase: topicSession?.type === "topic_session" ? topicSession.phase : undefined,
    risk_level: state?.risk_level,
  }

  const dispatcherSignals = await analyzeSignals(userMessage, stateSnapshot, lastAssistantMessage, meta)
  riskScore = dispatcherSignals.risk_score

  // --- DETERMINISTIC POLICY: Signal → targetMode ---
  // Priority order: Safety > Hard blockers > Intent-based routing

  // 1. Safety override (threshold: confidence >= 0.75)
  if (dispatcherSignals.safety.level === "SENTRY" && dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "sentry"
  } else if (dispatcherSignals.safety.level === "FIREFIGHTER" && dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "firefighter"
  }
  // 2. Active bilan hard guard (unless explicit stop)
  else if (
    state?.investigation_state &&
    state?.investigation_state?.status !== "post_checkup" &&
    dispatcherSignals.interrupt.kind !== "EXPLICIT_STOP"
  ) {
    targetMode = "investigator"
  }
  // 3. Intent-based routing
  else {
    const intent = dispatcherSignals.user_intent_primary
    const intentConf = dispatcherSignals.user_intent_confidence

    if (intent === "CHECKUP" && intentConf >= 0.6) {
      targetMode = "investigator"
    } else if (intent === "PLAN" && intentConf >= 0.6) {
      targetMode = "architect"
    } else if (intent === "BREAKDOWN" && intentConf >= 0.6) {
      targetMode = "architect"
    } else if (intent === "PREFERENCE" && intentConf >= 0.6) {
      targetMode = "companion"
    } else if (intent === "EMOTIONAL_SUPPORT") {
      // Check if it's acute distress (firefighter) or mild support (companion)
      if (dispatcherSignals.safety.level === "FIREFIGHTER" && dispatcherSignals.safety.confidence >= 0.5) {
        targetMode = "firefighter"
      } else {
        targetMode = "companion"
      }
    } else {
      // Default: companion
      targetMode = "companion"
    }
  }

  // 4. Force mode override (module conversation, etc.)
  if (!disableForcedRouting && opts?.forceMode && targetMode !== "sentry" && targetMode !== "firefighter") {
    targetMode = opts.forceMode
  }

  dispatcherTargetMode = targetMode
  const nCandidates = 1 // Multi-candidate generation disabled (was only used for complex messages in legacy v1)
  console.log(`[Dispatcher] Signals: safety=${dispatcherSignals.safety.level}(${dispatcherSignals.safety.confidence.toFixed(2)}), intent=${dispatcherSignals.user_intent_primary}(${dispatcherSignals.user_intent_confidence.toFixed(2)}), interrupt=${dispatcherSignals.interrupt.kind}, → targetMode=${targetMode}`)

  const targetModeInitial = targetMode
  let toolFlowActiveGlobal = Boolean((tempMemory as any)?.architect_tool_flow)
  const stopCheckup = isExplicitStopCheckup(userMessage);
  // Signal-based interrupt detection
  const boredOrStopFromSignals = (
    (dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" && dispatcherSignals.interrupt.confidence >= 0.65) ||
    (dispatcherSignals.interrupt.kind === "BORED" && dispatcherSignals.interrupt.confidence >= 0.65)
  )
  const boredOrStop = boredOrStopFromSignals || looksLikeUserBoredOrWantsToStop(userMessage) || stopCheckup
  let toolflowCancelledOnStop = false
  let resumeActionV1: "prompted" | "accepted" | "declined" | null = null

  // --- Scheduler v1 (minimal): explicit stop/boredom cancels any active Architect toolflow.
  // Toolflows are transactional; they should not block handoffs (topic_session) nor hijack emotional/safety turns.
  if (boredOrStop && toolFlowActiveGlobal) {
    const cleared = setArchitectToolFlowInTempMemory({ tempMemory, nextFlow: null })
    if (cleared.changed) {
      tempMemory = cleared.tempMemory
      toolFlowActiveGlobal = Boolean((tempMemory as any)?.architect_tool_flow)
      toolflowCancelledOnStop = true
    }
  }

  // --- PR5: deterministic resume acceptance/decline for a queued toolflow resume prompt ---
  // If we previously prompted and the user answers "oui/non", act deterministically.
  {
    const marker = (tempMemory as any)?.__router_resume_prompt_v1 ?? null
    const kind = String(marker?.kind ?? "")
    const askedAt = Date.parse(String(marker?.asked_at ?? ""))
    const expired = Number.isFinite(askedAt) ? (Date.now() - askedAt) > 30 * 60 * 1000 : true
    const s = normalizeLoose(userMessage)
    const yes = /\b(oui|ok|daccord|vas\s*y|go)\b/i.test(s) && s.length <= 24
    const no = /\b(non|pas\s+maintenant|laisse|laisse\s+tomber|on\s+s'en\s+fout|plus\s+tard)\b/i.test(s) && s.length <= 40
    if (kind === "architect_toolflow" && !expired && (yes || no)) {
      // Clear marker either way
      try { delete (tempMemory as any).__router_resume_prompt_v1 } catch {}
      if (yes) {
        resumeActionV1 = "accepted"
        // Route to Architect (unless safety/investigator overrides later).
        if (targetMode !== "sentry" && targetMode !== "firefighter" && targetMode !== "investigator") {
          targetMode = "architect"
        }
      } else {
        resumeActionV1 = "declined"
      }
      // Remove the queued resume intent so we don't nag again.
      const removed = removeSupervisorQueueByReasonPrefix({ tempMemory, prefix: "queued_due_to_irrelevant_active_session:architect_tool_flow" })
      if (removed.changed) tempMemory = removed.tempMemory
    } else if (kind === "architect_toolflow" && expired) {
      // Stale marker: clear silently.
      try { delete (tempMemory as any).__router_resume_prompt_v1 } catch {}
    }
  }

  // --- Preference change requests should always be handled by Companion ---
  // We DO NOT rely on dispatcher LLM for this because it may incorrectly route to architect
  // when the user mentions "suite"/"plan"/"style". This breaks the user_profile_confirm state machine.
  if (!disableForcedRouting) {
    const s = normalizeLoose(userMessage)
    const looksLikePreference =
      /\b(plus\s+direct|plutot\s+direct|sois\s+direct|ton\s+direct|plus\s+doux|plutot\s+doux)\b/i.test(s) ||
      /\b(reponses?\s+(?:plus\s+)?courtes?|reponses?\s+br[eè]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+detail)\b/i.test(s) ||
      /\b(emoji|emojis|smiley|smileys)\b/i.test(s) ||
      /\b(on\s+confirme|je\s+valide|je\s+veux\s+valider)\b/i.test(s);
    ;(tempMemory as any).__router_forced_preference_mode = looksLikePreference ? "companion" : null
    if (
      looksLikePreference &&
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator"
    ) {
      targetMode = "companion"
    }
  }

  // --- User Profile Confirmation (Companion) hard guard ---
  // If a confirmation is pending, we must route to Companion so it can interpret the answer and call apply_profile_fact.
  // Otherwise the state machine can get stuck (e.g. user mentions "plan" and dispatcher routes to architect).
  if (!disableForcedRouting) {
    const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
    ;(tempMemory as any).__router_forced_pending_confirm = pending ? true : false
    if (
      pending &&
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator"
    ) {
      targetMode = "companion"
    }

    // PR3: index pending confirmation into supervisor.queue (so scheduler can see it even if preempted).
    if (pending) {
      managedPendingReasons["pending:user_profile_confirm"] = true
      const key = typeof (pending as any)?.key === "string" ? String((pending as any).key).slice(0, 80) : ""
      const queued = ensureSupervisorQueueIntent({
        tempMemory,
        requestedMode: "companion",
        reason: "pending:user_profile_confirm",
        messageExcerpt: key || undefined,
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
  }

  // Supervisor continuity: if there's an active session, keep its owner mode
  // (unless safety modes or investigator lock later override).
  const activeSession = getActiveSupervisorSession(tempMemory)
  const activeOwner = activeSession?.owner_mode ?? null
  const forcedPref = !disableForcedRouting && Boolean((tempMemory as any)?.__router_forced_preference_mode)
  const forcedPendingConfirm = !disableForcedRouting && Boolean((tempMemory as any)?.__router_forced_pending_confirm)
  // Local heuristics: only continue architect tool flows when the user message *actually* continues the flow.
  const userLooksLikeToolFlowContinuation = (() => {
    const s = normalizeLoose(userMessage)
    // If the user explicitly talks about plan/actions tooling, assume it's relevant.
    if (/\b(plan|action|actions|activer|active|ajoute|ajouter|cr[ée]e|cr[ée]er|modifier|mettre\s+a\s+jour|supprime|retire)\b/i.test(s)) return true
    // If the last assistant (architect) asked for consent/clarification, short "oui/ok" is a continuation.
    if (lastAssistantAgent === "architect" && /\b(tu\s+veux|ok\s+pour|on\s+le\s+fait|j['’]ajoute|j['’]active|confirme|d'accord)\b/i.test(normalizeLoose(lastAssistantMessage ?? ""))) {
      if (/\b(oui|ok|daccord|vas\s*y|go)\b/i.test(s) && s.length <= 30) return true
    }
    return false
  })()
  if (
    activeOwner &&
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // IMPORTANT: Use toolFlowActiveGlobal (checks temp_memory.architect_tool_flow directly)
    // because topic_session is always pushed after architect_tool_flow in the stack,
    // so getActiveSupervisorSession would return topic_session, not architect_tool_flow.
    const hasActiveArchitectToolFlow = toolFlowActiveGlobal && !toolflowCancelledOnStop
    // If this is a preference-confirmation moment, do NOT let active sessions hijack.
    if (forcedPref || forcedPendingConfirm) {
      // Keep targetMode as-is (already forced to companion above).
    } else if (hasActiveArchitectToolFlow && !userLooksLikeToolFlowContinuation) {
      // User is off-topic relative to toolflow: let them talk, and keep the toolflow "waiting".
      // (We enqueue the architect continuation as non-urgent follow-up instead of hijacking.)
      const queued = enqueueSupervisorIntent({
        tempMemory,
        requestedMode: "architect",
        reason: `queued_due_to_irrelevant_active_session:architect_tool_flow`,
        messageExcerpt: String(userMessage ?? "").slice(0, 180),
      })
      if (queued.changed) tempMemory = queued.tempMemory
      // Keep targetMode (dispatcher-selected), do NOT force to architect.
    } else {
      // Default supervisor behavior: keep owner mode, and queue the dispatcher choice for later.
    if (targetMode !== activeOwner) {
      const queued = enqueueSupervisorIntent({
        tempMemory,
        requestedMode: targetMode,
        reason: `queued_due_to_active_session:${String(activeSession?.type ?? "")}`,
        messageExcerpt: String(userMessage ?? "").slice(0, 180),
      })
      if (queued.changed) tempMemory = queued.tempMemory
    }
    targetMode = activeOwner
    }
  }

  // Hard guard for Architect multi-turn tool flows:
  // If Architect just asked "which day to remove", ALWAYS keep Architect for the next user reply,
  // regardless of what the dispatcher says (tool tests rely on this continuity).
  const archFlow = (tempMemory as any)?.architect_tool_flow ?? null
  const archFlowAwaitingRemoveDay =
    archFlow &&
    String((archFlow as any)?.kind ?? "") === "update_action_structure" &&
    String((archFlow as any)?.stage ?? "") === "awaiting_remove_day"
  const lastAskedWhichDay =
    lastAssistantAgent === "architect" &&
    /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "")
  if (!state?.investigation_state && (archFlowAwaitingRemoveDay || lastAskedWhichDay)) {
    targetMode = "architect"
  }

  // If an Architect tool flow is active (create/update action), keep routing on Architect to avoid fragmentation
  // (except safety modes).
  if (
    toolFlowActiveGlobal &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Do NOT force Architect if the user is currently doing preference confirmations or off-topic chit-chat.
    const s = normalizeLoose(userMessage)
    const looksLikeChitChat = s.length <= 80 && /\b(met[eé]o|soleil|temps|journ[ée]e|salut|hello|[çc]a\s+va)\b/i.test(s)
    if (!forcedPref && !forcedPendingConfirm && (userLooksLikeToolFlowContinuation || !looksLikeChitChat)) {
    targetMode = "architect"
    }
  }

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
    // If the user asks for a "reformulation" right after Architect just configured something,
    // keep Architect so it can clarify its own parameters (avoid librarian contradictions).
    const looksConfused =
      /\b(je\s+suis\s+un\s+peu\s+perdu|je\s+suis\s+perdu|tu\s+peux\s+reformuler|reformule|j['’]ai\s+pas\s+compris)\b/i
        .test(userMessage ?? "")
    // Never route to Librarian for "je suis perdu / reformule" (that needs plan-context, not a generic explainer).
    if (looksConfused) {
      targetMode = (lastAssistantAgent === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) ? "architect" : "companion"
    } else if (lastAssistantAgent === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) {
      targetMode = "architect"
    } else {
      targetMode = "librarian"
    }
  }

  // Hard guard: if the user references a specific plan item by quoted title, keep Architect.
  // Librarian doesn't have plan context; plan-item questions need Architect.
  if (
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    (targetMode === "companion" || targetMode === "librarian")
  ) {
    // Accept quotes with ", “ ”, « », and also simple apostrophes '...'
    const hasQuoted = /["“«']\s*[^"”»']{2,80}\s*["”»']/.test(userMessage ?? "")
    const mentionsPlanOrNext =
      /\b(mon\s+plan|dans\s+mon\s+plan|phase|action|actions|et\s+apr[eè]s|la\s+suite|prochaine\s+[ée]tape|prochaine\s+chose|la\s+prochaine|pour\s+avancer|on\s+fait\s+quoi|je\s+dois\s+faire\s+quoi|qu['’]est[-\s]?ce\s+que\s+je\s+dois\s+faire|c['’]est\s+quoi\s+(exactement|concr[eè]tement)|c['’]est\s+quoi)\b/i
        .test(userMessage ?? "")
    if (hasQuoted && mentionsPlanOrNext) {
      targetMode = "architect"
    }
  }

  // Force Architect for explicit plan/action updates (frequency/days/rename), to ensure tools fire reliably.
  // This also prevents Companion from answering "update" intents with generic encouragement.
  if (
    !state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    /\b(mets|met|passe|change|renomme|ajuste|modifie|fr[ée]quence|fois\s+par\s+semaine|x\s*par\s+semaine|jours?\s+fixes?|jours?\s+pr[ée]cis|lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?)\b/i
      .test(userMessage ?? "")
  ) {
    // Narrow it a bit: only if it's plausibly about an action/habit (avoid hijacking unrelated chatter).
    if (/\b(action|habitude|plan|lecture|dashboard|tableau\s+de\s+bord)\b/i.test(userMessage ?? "") || /\bfois\s+par\s+semaine\b/i.test(userMessage ?? "")) {
      targetMode = "architect"
    }
  }

  // Activation / "what's next in my plan" should NOT go to Librarian:
  // Librarian is for long-form generic explanations; plan item questions need plan context + tools (Architect).
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    /\b(mon\s+plan|dans\s+mon\s+plan|phase|action|actions|et\s+apr[eè]s|la\s+suite|qu['’]?est[-\s]?ce\s+qui\s+vient\s+apr[eè]s|prochaine\s+[ée]tape)\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Plan-building continuity: avoid "ping-pong" Companion <-> Architect while an action/habit is being defined.
  // If the user message clearly relates to plan parameters (frequency/days/dashboard/add), keep Architect.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    (lastAssistantAgent === "architect" || (state?.current_mode ?? "companion") === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) &&
    /\b(fois\s+par\s+semaine|x\s*par\s+semaine|\/\s*semaine|ajust(e|er)|modifi(e|er)|enl[eè]ve|retire|supprime|ajout(e|er)|ajoute|mon\s+plan|plan|habitude|action|dashboard|tableau\s+de\s+bord|jours?\s+fixes?|jours?\s+planifi[ée]s?|planifi[ée]s?|lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?|lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun|au\s+feeling|libre)\b/i
      .test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Specific guard: if Architect just asked which day to remove, keep Architect for the user's removal choice.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    lastAssistantAgent === "architect" &&
    /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "") &&
    /\b(enl[eè]ve|retire|supprime)\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
  }

  // Habit friction points ("book", "where is it", "start tonight") should also stay with Architect.
  if (
    !state?.investigation_state &&
    targetMode === "companion" &&
    (lastAssistantAgent === "architect" || (state?.current_mode ?? "companion") === "architect" || Boolean((tempMemory as any)?.architect_tool_flow)) &&
    /\b(livre|lecture|roman|oreiller|table\s+de\s+chevet|canap[ée])\b/i.test(userMessage ?? "")
  ) {
    targetMode = "architect"
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

    const toolFlowActive = Boolean((tempMemory as any)?.architect_tool_flow)
    const userConfused =
      /\b(je\s+suis\s+un\s+peu\s+perdu|je\s+suis\s+perdu|tu\s+peux\s+reformuler|reformule|j['’]ai\s+pas\s+compris)\b/i
        .test(userMessage ?? "")

    // If the user doesn't want plan-focus, and isn't explicitly asking for structured plan help,
    // hand off to Companion to avoid over-architecting / looping on "why/how".
    // Do NOT hand off away from Architect when we're in a confirmation micro-step.
    const confirmationMicroStep =
      (meta?.channel ?? "web") === "whatsapp" &&
      lastAssistantAgent === "architect" &&
      lastAssistantAskedForStepConfirmation(lastAssistantMessage) &&
      looksLikeUserConfirmsStep(userMessage)

    // Also do NOT hand off away from Architect when it just asked "which day to remove"
    // and the user is replying with the removal choice (common in tool eval flows).
    const removeDayMicroStep =
      lastAssistantAgent === "architect" &&
      /\bquel(le)?\s+jour\b/i.test(lastAssistantMessage ?? "") &&
      /\b(enl[eè]ve|retire|supprime)\b/i.test(userMessage ?? "")
    
    // If the user is explicitly editing habit structure (frequency/days), never hand off away from Architect.
    const explicitHabitStructureEdit =
      /\b(fois\s+par\s+semaine|x\s*par\s+semaine|\/\s*semaine|fr[ée]quence|jours?\s+planifi[ée]s?|lun(di)?|mar(di)?|mer(credi)?|jeu(di)?|ven(dredi)?|sam(edi)?|dim(anche)?|mon|tue|wed|thu|fri|sat|sun)\b/i
        .test(userMessage ?? "")

    // Also: if a tool flow is in progress (create/update action), keep Architect stable even if the user digresses/confused.
    if (confirmationMicroStep || removeDayMicroStep || explicitHabitStructureEdit || toolFlowActive || userConfused) {
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
  const isPostCheckup = state?.investigation_state?.status === "post_checkup"

  // If the user digresses during an active bilan (even without saying "later"),
  // capture the topic so it can be revisited after the checkup.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const digressionSignal =
      (dispatcherSignals.interrupt.kind === "DIGRESSION" || dispatcherSignals.interrupt.kind === "SWITCH_TOPIC") &&
      dispatcherSignals.interrupt.confidence >= 0.6
    const shouldCaptureDigression = digressionSignal || looksLikeDigressionRequest(userMessage)
    if (shouldCaptureDigression) {
      try {
        const latest = await getUserState(supabase, userId, scope)
        if (latest?.investigation_state) {
          // USE DISPATCHER'S FORMALIZED TOPIC (no extra AI call!)
          const formalizedFromDispatcher = dispatcherSignals.interrupt.deferred_topic_formalized
          const fallbackExtracted = extractTopicFromUserDigression(userMessage) || String(userMessage ?? "").trim().slice(0, 160)
          const topicToStore = formalizedFromDispatcher || fallbackExtracted
          
          if (topicToStore && topicToStore.length >= 3) {
            const updatedInv = appendDeferredTopicToState(latest.investigation_state, topicToStore)
            await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
            state = { ...(state ?? {}), investigation_state: updatedInv }
            console.log(`[Router] Digression captured: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
          } else {
            console.log(`[Router] Digression rejected - no valid topic extracted`)
          }
        }
      } catch (e) {
        console.error("[Router] digression deferred topic store failed (non-blocking):", e)
      }
    }
  }

  // If the user hints at a preference during an active checkup, capture it for later confirmation.
  if (checkupActive && !isPostCheckup && !stopCheckup) {
    const prefHint = detectPreferenceHint(userMessage)
    const pending = (tempMemory as any)?.user_profile_confirm?.pending ?? null
    if (prefHint?.key && prefHint.uncertain && !pending) {
      const now = new Date().toISOString()
      const prev = (tempMemory as any)?.user_profile_confirm ?? {}
      tempMemory = {
        ...(tempMemory ?? {}),
        user_profile_confirm: {
          ...(prev ?? {}),
          pending: { candidate_id: null, key: prefHint.key, scope: "current", asked_at: now, reason: "hint_in_checkup" },
          last_asked_at: now,
        },
      }
      managedPendingReasons["pending:user_profile_confirm"] = true
    }
  }

  // Firefighter continuity:
  // If the last assistant message was in Firefighter mode (panic grounding / safety check),
  // do NOT bounce back to investigator immediately just because the user mentions a checkup item.
  // Keep firefighter for at least one more turn to close the loop and hand off cleanly.
  const firefighterJustSpoke = lastAssistantAgent === "firefighter" || (state?.current_mode ?? "") === "firefighter";
  if (firefighterJustSpoke && !stopCheckup) {
    const lastFF = (lastAssistantMessage ?? "").toString().toLowerCase();
    const u = (userMessage ?? "").toString().toLowerCase();
    const userChoseAB =
      (/\bA\)\b/.test(lastAssistantMessage ?? "") && /\bB\)\b/.test(lastAssistantMessage ?? "")) &&
      /\b(a|b)\b/i.test((userMessage ?? "").toString().trim());
    const userAnsweringFFPrompt =
      /\b(comment tu te sens|tu te sens comment|es-tu en s[eé]curit[eé]|tu es en s[eé]curit[eé]|es-tu seul|tu es seul|on va faire|inspire|expire|respire|4\s*secondes|7\s*secondes|8\s*secondes)\b/i
        .test(lastAssistantMessage ?? "");
    const userStillPhysicallyActivated =
      /\b(j['’]arrive\s+pas\s+[àa]\s+respirer|respir(er|e)\s+mal|coeur|c[œoe]ur|palpit|oppress|panique|angoiss|trembl|vertige)\b/i
        .test(userMessage ?? "");
    const userReportsPartialRelief =
      /\b([çc]a\s+va\s+(un\s+peu\s+)?mieux|un\s+peu\s+mieux|[çc]a\s+aide|merci)\b/i.test(userMessage ?? "");
    const userStillEmotionallyOverwhelmed =
      /\b(j['’]ai\s+l['’]impression\s+de\s+(?:craquer|exploser)|[àa]\s+bout|pas\s+à\s+la\s+hauteur|n['’]y\s+arrive\s+plus|je\s+suis\s+(?:vid[ée]e?|epuis[ée]e?)|[ée]puis[ée]e|trop\s+dur)\b/i
        .test(userMessage ?? "");

    // If the user is still in the firefighter "thread" (answering the prompt, still activated, or just recovering),
    // keep firefighter for this turn. Firefighter can then explicitly hand off back to the bilan.
    if (userChoseAB || userAnsweringFFPrompt || userStillPhysicallyActivated || userReportsPartialRelief || userStillEmotionallyOverwhelmed) {
      targetMode = "firefighter";
    }
  }

  if (checkupActive && !stopCheckup && targetMode === "firefighter" && riskScore <= 1 && !looksLikeAcuteDistress(userMessage)) {
    targetMode = "investigator";
  }

  // HARD GUARD: If the user asks for a micro-step breakdown and there is no acute distress,
  // do not route to firefighter just because the message sounds emotional.
  // "je bloque", "j'y arrive pas", "c'est trop dur" → architect (break_down_action), NOT firefighter.
  if (!looksLikeAcuteDistress(userMessage) && looksLikeBreakdownIntent(userMessage) && targetMode === "firefighter") {
    targetMode = "architect"
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

  // PR3: index post-checkup parking lot into supervisor.queue (pointer only; state remains in investigation_state).
  if (isPostCheckup) {
    managedPendingReasons["pending:post_checkup_parking_lot"] = true
    const queued = ensureSupervisorQueueIntent({
      tempMemory,
      requestedMode: "companion",
      reason: "pending:post_checkup_parking_lot",
    })
    if (queued.changed) tempMemory = queued.tempMemory
  }

  // Prune managed pending intents that are no longer relevant (keeps supervisor.queue from drifting forever).
  {
    const pruned = pruneSupervisorQueueManagedIntents({ tempMemory, keepReasons: managedPendingReasons })
    if (pruned.changed) tempMemory = pruned.tempMemory
  }

  // HARD GUARD: during an active checkup/bilan, only investigator may answer (unless explicit stop).
  // We still allow safety escalation (sentry/firefighter) to override.
  if (
    checkupActive &&
    !isPostCheckup &&
    !stopCheckup &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter"
  ) {
    targetMode = "investigator";
  }

  // If the user explicitly says "we'll talk about X later/after", capture that topic immediately.
  // This ensures the end-of-bilan transition can reliably enter post-checkup mode.
  if (checkupActive && !isPostCheckup && !stopCheckup && userExplicitlyDefersTopic(userMessage)) {
    try {
      const latest = await getUserState(supabase, userId, scope)
      if (latest?.investigation_state) {
        // USE DISPATCHER'S FORMALIZED TOPIC if available (no extra AI call!)
        const formalizedFromDispatcher = dispatcherSignals.interrupt.deferred_topic_formalized
        const fallbackExtracted = extractDeferredTopicFromUserMessage(userMessage) || String(userMessage ?? "").trim().slice(0, 240)
        const topicToStore = formalizedFromDispatcher || fallbackExtracted
        
        if (topicToStore && topicToStore.length >= 3) {
          const updatedInv = appendDeferredTopicToState(latest.investigation_state, topicToStore)
          await updateUserState(supabase, userId, scope, { investigation_state: updatedInv })
          // Keep local in-memory state in sync so later "preserve deferred_topics" merges don't drop it.
          // (The Investigator branch below uses `state` as a baseline when it writes invResult.newState.)
          state = { ...(state ?? {}), investigation_state: updatedInv }
          console.log(`[Router] User explicit defer captured: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
        } else {
          console.log(`[Router] User explicit defer rejected - no valid topic`)
        }
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

  // Modes that need context loading (investigator gets minimal context for efficiency)
  const needsFullContext = ['architect', 'companion', 'firefighter'].includes(targetMode)
  const needsDashboardOnly = targetMode === 'investigator'

  if (needsFullContext || needsDashboardOnly) {
    // C. Dashboard Context (Live Data) - loaded for ALL context-aware modes including investigator
    const dashboardContext = await getDashboardContext(supabase, userId);

    // Heavy context only for full-context modes (not investigator - keep it lightweight)
    let vectorContext = ""
    let identityContext = ""
    let recentTurns = ""
    let shortTerm = ""

    if (needsFullContext) {
      // Recent transcript (raw turns) to complement the Watcher short-term summary ("fil rouge").
      // We keep it bounded to avoid huge prompts.
      recentTurns = (history ?? []).slice(-15).map((m: any) => {
        const role = String(m?.role ?? "").trim() || "unknown"
        const content = String(m?.content ?? "").trim().slice(0, 420)
        const ts = String((m as any)?.created_at ?? "").trim()
        return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`
      }).join("\n")

      // Short-term "fil rouge" maintained by Watcher (when available).
      shortTerm = (state?.short_term_context ?? "").toString().trim()
      // A. Vector Memory
      vectorContext = await retrieveContext(supabase, userId, userMessage);
      
      // B. Core Identity (Temple)
      identityContext = await getCoreIdentity(supabase, userId);
    }

    // D. User model (structured facts) - only for full context modes
    let factsContext = ""
    if (needsFullContext) {
      try {
        const factRows = await getUserProfileFacts({ supabase, userId, scopes: ["global", scope] })
        factsContext = formatUserProfileFactsForPrompt(factRows, scope)
      } catch (e) {
        console.warn("[Context] failed to load user_profile_facts (non-blocking):", e)
      }
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
    if (deferredUserPrefContext) context += `${deferredUserPrefContext}\n\n`
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
      const loadedParts = needsFullContext 
        ? "Dashboard + Identity + Vectors" 
        : "Dashboard only (investigator)"
      console.log(`[Context] Loaded ${loadedParts}`);
    }
  }
  if (opts?.contextOverride) {
    context = `=== CONTEXTE MODULE (UI) ===\n${opts.contextOverride}\n\n${context}`.trim()
  }

  // --- Architect anti-loop / plan-focus state (lightweight state machine) ---
  // Goal: prevent the Architect from looping on objectives, asking the same question twice, or expanding into multiple objectives.
  // NOTE: plan_focus should reflect user intent even if we temporarily route to firefighter/companion.
  // Otherwise it can get "stuck" (ex: user asks for a micro-pause -> routed to firefighter, but plan_focus stays true).
  {
    const inferred = inferPlanFocusFromUser(userMessage)
    if (inferred != null) {
      const tm = (tempMemory ?? {}) as any
      const arch0 = (tm.architect ?? {}) as any
      tempMemory = {
        ...(tm ?? {}),
        architect: {
          ...arch0,
          plan_focus: inferred,
          last_updated_at: new Date().toISOString(),
        },
      }
    }
  }

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

    // Also detect repeated user intents (common failure mode: the user repeats the same sentence and the assistant keeps proposing variants).
    const userMsgs = [...history.filter((m: any) => m?.role === "user").map((m: any) => String(m?.content ?? "")), String(userMessage ?? "")]
      .slice(-3)
      .map(normalizeLoose)
      .filter(Boolean)
    const looksLikeReadingLoop = (() => {
      // Heuristic for the common loop: "lecture 10 min, 3 fois/semaine, peur que ça pèse / échec"
      if (userMsgs.length < 2) return false
      const hits = userMsgs.map((s) =>
        /\blecture\b/i.test(s) &&
        /\b10\b/.test(s) &&
        (/\b3\b/.test(s) || /\btrois\b/i.test(s)) &&
        /\b(semaine|fois)\b/i.test(s) &&
        /\b(peur|angoiss|corv[ée]e|pression|[ée]chec)\b/i.test(s),
      )
      return hits.filter(Boolean).length >= 2
    })()
    const userRepeats =
      userMsgs.length >= 2 &&
      (userMsgs[userMsgs.length - 1] === userMsgs[userMsgs.length - 2] ||
        (userMsgs.length >= 3 && userMsgs[userMsgs.length - 1] === userMsgs[userMsgs.length - 3]))

    // User can explicitly flag we're looping even if the wording changes.
    const userSignalsLoop = /\b(tourne en rond|on tourne en rond|tu\s+me\s+reposes?\s+pas|tu\s+me\s+reposes?\s+la\s+meme\s+question|la\s+meme\s+question|tu\s+me\s+redemandes?)\b/i
      .test(normalizeLoose(userMessage))

    const loopHit = dup || objectiveOverTalk || userRepeats || looksLikeReadingLoop || userSignalsLoop
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

  // --- TOPIC SESSION (global supervisor state machine) ---
  // Goal: keep a coarse "topic lifecycle" across agents (opening/exploring/converging/closing) and enable clean handoffs.
  let topicSessionClosedThisTurn = false
  let topicSessionHandoffThisTurn = false
  try {
    let tm0 = (tempMemory ?? {}) as any
    const toolFlowActive = Boolean((tm0 as any)?.architect_tool_flow)
    const arch = (tm0 as any)?.architect ?? {}
    const planFocus = Boolean(arch?.plan_focus ?? false)
    const loopCount = Number(arch?.loop_count ?? 0) || 0
    const focusMode: "plan" | "discussion" | "mixed" =
      planFocus ? "plan" : (targetMode === "architect" ? "mixed" : "discussion")
    const topic = guessTopicLabel(userMessage)
    const bored = looksLikeUserBoredOrWantsToStop(userMessage)

    // Auto-close topic_session if it was in "closing" phase and user continues (not bored).
    // This ensures clean transitions after handoff.
    const existingTopicSession = getActiveSupervisorSession(tm0)
    if (
      existingTopicSession?.type === "topic_session" &&
      existingTopicSession.phase === "closing" &&
      !bored
    ) {
      const closed = closeTopicSession({ tempMemory: tm0 })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        tm0 = tempMemory as any
        topicSessionClosedThisTurn = true
      }
    }

    // NOTE: Toolflow cancellation on bored/stop is handled earlier (line ~697-705) via the main scheduler block.
    // We don't repeat it here to avoid confusion; just re-check the current state.
    const toolFlowActiveAfter = Boolean((tm0 as any)?.architect_tool_flow)
    const phase: "opening" | "exploring" | "converging" | "closing" =
      bored ? "closing" : (loopCount >= 2 ? "converging" : "exploring")
    const handoffTo = (phase === "closing" && targetMode === "architect" && !toolFlowActiveAfter) ? "companion" : undefined
    const updated = upsertTopicSession({
      tempMemory: tm0,
      topic,
      ownerMode: (handoffTo ? "companion" : targetMode),
      phase,
      focusMode,
      handoffTo,
      handoffBrief: handoffTo ? `On clôture: "${topic}". L'utilisateur montre de la fatigue/stop. Reprendre en mode compagnon.` : undefined,
    })
    if (updated.changed) tempMemory = updated.tempMemory

    // Conservative baton handoff: only when the user signals stop/boredom AND no active tool flow.
    if (handoffTo === "companion" && !looksLikeAcuteDistress(userMessage)) {
      targetMode = "companion"
      topicSessionHandoffThisTurn = true
    }
  } catch {
    // best-effort; never block routing
  }

  // 5. Exécution de l'Agent Choisi
  let responseContent = ""
  let nextMode = targetMode

  console.log(`[Router] User: "${userMessage}" -> Dispatch: ${targetMode} (Risk: ${riskScore})`)
  const targetModeFinalBeforeExec = targetMode

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
      const dec = buildRouterDecisionV1({
        requestId: meta?.requestId,
        scope,
        channel,
        dispatcher_target_mode: String(dispatcherTargetMode),
        target_mode_initial: String(targetModeInitial),
        target_mode_final: String(targetModeFinalBeforeExec),
        final_mode: String(nextMode),
        risk_score: Number(riskScore ?? 0) || 0,
        checkup_active: Boolean(checkupActive),
        stop_checkup: Boolean(stopCheckup),
        is_post_checkup: Boolean(isPostCheckup),
        forced_preference_mode: forcedPref,
        forced_pending_confirm: forcedPendingConfirm,
        toolflow_active_global: Boolean(toolFlowActiveGlobal),
        toolflow_cancelled_on_stop: Boolean(toolflowCancelledOnStop),
        pending_nudge_kind: null,
        resume_action_v1: resumeActionV1,
        stale_cleaned: staleCleaned,
        topic_session_closed: topicSessionClosedThisTurn,
        topic_session_handoff: topicSessionHandoffThisTurn,
        safety_preempted_flow: Boolean((tempMemory as any)?.__router_safety_preempted_v1),
        dispatcher_signals: dispatcherSignals,
        temp_memory_before: tempMemory,
        temp_memory_after: tempMemory,
      })
      const md = {
        ...(opts?.messageMetadata ?? {}),
        reason: "no_plan_loop_escalation",
        ...dec,
      } as any
      console.log("[RouterDecisionV1]", JSON.stringify(md?.router_decision_v1 ?? {}))
      await logMessage(supabase, userId, scope, "assistant", responseContent, "architect", md);
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
    sophiaChatModel: (() => {
      const model = selectChatModel(targetMode, riskScore);
      if (model !== SOPHIA_CHAT_MODEL) {
        console.log(`[Model] Using PRO model (${model}) for ${targetMode} (risk=${riskScore})`);
      }
      return model;
    })(),
    // Pass dispatcher's formalized deferred topic to avoid extra AI call in agent_exec
    dispatcherDeferredTopic: dispatcherSignals.interrupt.deferred_topic_formalized ?? null,
  })

  responseContent = agentOut.responseContent
  nextMode = agentOut.nextMode

  // Lightweight global proactivity: occasionally remind a deferred topic (max 1/day, and only if we won't add a 2nd question).
  const nudged = maybeInjectGlobalDeferredNudge({ tempMemory, userMessage, responseText: responseContent })
  if (nudged.changed) {
    tempMemory = nudged.tempMemory
    responseContent = nudged.responseText
  }

  // --- PR4: deterministic pending nudge (supervisor.queue-driven), behind flag ---
  // Goal: when the user is in a low-stakes moment, surface ONE pending obligation, in a predictable priority order.
  // We never do this in safety or during an active bilan lock.
  let pendingNudgeKind: string | null = null
  if (
    ENABLE_SUPERVISOR_PENDING_NUDGES_V1 &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore <= 1 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const p = pickPendingFromSupervisorQueue(tempMemory)
    if (p?.kind === "post_checkup") {
      pendingNudgeKind = "post_checkup"
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: il reste un sujet reporté à reprendre. Tu veux qu’on le traite maintenant ?`
    } else if (p?.kind === "profile_confirm") {
      pendingNudgeKind = "profile_confirm"
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: on avait une petite confirmation en attente${p.excerpt ? ` (${p.excerpt})` : ""}. On la fait maintenant ?`
    } else if (p?.kind === "global_deferred") {
      // Global deferred already has its own injection logic; keep this as a marker only.
      pendingNudgeKind = "global_deferred"
      // No extra text: avoid duplicating the existing global-deferred phrasing.
    }
  }

  // --- PR5: deterministic resume prompt for queued toolflow (low-stakes only), behind flag ---
  if (
    ENABLE_SUPERVISOR_RESUME_NUDGES_V1 &&
    resumeActionV1 == null &&
    pendingNudgeKind == null &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore <= 1 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const rt = getSupervisorRuntime(tempMemory)
    const hasQueuedToolflow = Array.isArray(rt.queue) && rt.queue.some((q: any) =>
      String(q?.reason ?? "") === "queued_due_to_irrelevant_active_session:architect_tool_flow"
    )
    if (hasQueuedToolflow) {
      resumeActionV1 = "prompted"
      ;(tempMemory as any).__router_resume_prompt_v1 = {
        kind: "architect_toolflow",
        asked_at: new Date().toISOString(),
      }
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Au fait: tu veux qu'on reprenne la mise à jour du plan qu'on avait commencée, ou on laisse tomber ?`
    }
  }

  // --- Safety preemption recovery: when firefighter/sentry preempts a flow, offer to resume later ---
  // Store marker if safety mode preempts an active toolflow
  if (
    (nextMode === "firefighter" || nextMode === "sentry") &&
    toolFlowActiveGlobal &&
    !toolflowCancelledOnStop
  ) {
    ;(tempMemory as any).__router_safety_preempted_v1 = {
      preempted_flow: "architect_tool_flow",
      preempted_at: new Date().toISOString(),
      safety_mode: nextMode,
    }
  }

  // On subsequent low-stakes turn after safety, offer to resume
  if (
    ENABLE_SUPERVISOR_RESUME_NUDGES_V1 &&
    resumeActionV1 == null &&
    pendingNudgeKind == null &&
    !nudged.changed &&
    nextMode === "companion" &&
    riskScore === 0 &&
    !checkupActive &&
    lowStakesTurn(userMessage)
  ) {
    const safetyMarker = (tempMemory as any)?.__router_safety_preempted_v1 ?? null
    const preemptedFlow = safetyMarker?.preempted_flow
    const preemptedAt = Date.parse(String(safetyMarker?.preempted_at ?? ""))
    const expired = !Number.isFinite(preemptedAt) || (Date.now() - preemptedAt) > 30 * 60 * 1000 // 30 min TTL
    
    if (preemptedFlow === "architect_tool_flow" && !expired && toolFlowActiveGlobal) {
      resumeActionV1 = "prompted"
      ;(tempMemory as any).__router_resume_prompt_v1 = {
        kind: "safety_recovery",
        asked_at: new Date().toISOString(),
      }
      responseContent =
        `${String(responseContent ?? "").trim()}\n\n` +
        `Tu as l'air d'aller mieux. Tu veux qu'on reprenne ce qu'on faisait avant, ou on laisse tomber ?`
      // Clear the safety preempted marker
      try { delete (tempMemory as any).__router_safety_preempted_v1 } catch {}
    } else if (expired || !toolFlowActiveGlobal) {
      // Clear stale marker
      try { delete (tempMemory as any).__router_safety_preempted_v1 } catch {}
    }
  }

  // 6. Mise à jour du mode final et log réponse
  // IMPORTANT: agents may have updated temp_memory mid-turn (e.g. Architect tool flows).
  // Merge with latest DB temp_memory to avoid clobbering those updates.
  let mergedTempMemory = tempMemory
  try {
    const latest = await getUserState(supabase, userId, scope)
    const latestTm = (latest as any)?.temp_memory ?? {}
    // Keep latestTm as base (preserve agent-written changes), but re-apply router-owned supervisor runtime.
    mergedTempMemory = { ...(latestTm ?? {}) }
    if (tempMemory && typeof tempMemory === "object") {
      if ((tempMemory as any).supervisor) (mergedTempMemory as any).supervisor = (tempMemory as any).supervisor
      if ((tempMemory as any).global_deferred_topics) (mergedTempMemory as any).global_deferred_topics = (tempMemory as any).global_deferred_topics
      if ((tempMemory as any).architect) (mergedTempMemory as any).architect = (tempMemory as any).architect
    }
    // Scheduler override: if we explicitly cancelled a toolflow on stop/boredom, ensure it stays cleared.
    if (toolflowCancelledOnStop) {
      try {
        delete (mergedTempMemory as any).architect_tool_flow
      } catch {}
    }
  } catch {}

  await updateUserState(supabase, userId, scope, {
    current_mode: nextMode,
    unprocessed_msg_count: msgCount,
    last_processed_at: lastProcessed,
    temp_memory: mergedTempMemory,
  })
  if (logMessages) {
    const dec = buildRouterDecisionV1({
      requestId: meta?.requestId,
      scope,
      channel,
      dispatcher_target_mode: String(dispatcherTargetMode),
      target_mode_initial: String(targetModeInitial),
      target_mode_final: String(targetModeFinalBeforeExec),
      final_mode: String(nextMode),
      risk_score: Number(riskScore ?? 0) || 0,
      checkup_active: Boolean(checkupActive),
      stop_checkup: Boolean(stopCheckup),
      is_post_checkup: Boolean(isPostCheckup),
      forced_preference_mode: forcedPref,
      forced_pending_confirm: forcedPendingConfirm,
      toolflow_active_global: Boolean(toolFlowActiveGlobal),
      toolflow_cancelled_on_stop: Boolean(toolflowCancelledOnStop),
        pending_nudge_kind: pendingNudgeKind,
        resume_action_v1: resumeActionV1,
        stale_cleaned: staleCleaned,
        topic_session_closed: topicSessionClosedThisTurn,
        topic_session_handoff: topicSessionHandoffThisTurn,
        safety_preempted_flow: Boolean((mergedTempMemory as any)?.__router_safety_preempted_v1),
        dispatcher_signals: dispatcherSignals,
        temp_memory_before: tempMemory,
        temp_memory_after: mergedTempMemory,
      })
      const md = { ...(opts?.messageMetadata ?? {}), ...dec } as any
      console.log("[RouterDecisionV1]", JSON.stringify(md?.router_decision_v1 ?? {}))
    await logMessage(supabase, userId, scope, 'assistant', responseContent, targetMode, md)
  }

  return {
    content: responseContent,
    mode: targetMode
  }
}

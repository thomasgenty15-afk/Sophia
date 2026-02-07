/**
 * Context Loader - Chargement modulaire du contexte par agent
 * 
 * Ce module centralise le chargement du contexte pour tous les agents,
 * en utilisant les profils définis dans types.ts pour charger uniquement
 * ce qui est nécessaire.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import type { AgentMode } from "../state-manager.ts"
import {
  getPlanMetadata,
  formatPlanMetadata,
  getPlanFullJson,
  formatPlanJson,
  getActionsSummary,
  formatActionsSummary,
  getActionsDetails,
  getVitalSignsContext,
  getCoreIdentity,
  type PlanMetadataResult,
} from "../state-manager.ts"
import {
  getUserProfileFacts,
  formatUserProfileFactsForPrompt,
} from "../profile_facts.ts"
import {
  getActiveTopicSession,
  getProfileConfirmationState,
  getCurrentFactToConfirm,
} from "../supervisor.ts"
import type {
  LoadedContext,
  ContextProfile,
  OnDemandTriggers,
} from "./types.ts"
import {
  getContextProfile,
  shouldLoadPlanJson,
  shouldLoadActionsDetails,
  getVectorResultsCount,
} from "./types.ts"

/**
 * Options pour le chargement du contexte
 */
export interface ContextLoaderOptions {
  supabase: SupabaseClient
  userId: string
  mode: AgentMode
  message: string
  history: any[]
  state: any
  scope: string
  tempMemory?: any
  userTime?: { prompt_block?: string }
  triggers?: OnDemandTriggers
  injectedContext?: string
  deferredUserPrefContext?: string
}

/**
 * Résultat du chargement avec métriques
 */
export interface ContextLoadResult {
  context: LoadedContext
  profile: ContextProfile
  metrics: {
    elements_loaded: string[]
    load_ms: number
    estimated_tokens: number
  }
}

/**
 * Charge le contexte pour un mode d'agent donné
 * 
 * @example
 * const result = await loadContextForMode({
 *   supabase,
 *   userId,
 *   mode: "companion",
 *   message: userMessage,
 *   history,
 *   state,
 *   scope: "web",
 *   triggers: dispatcherSignals,
 * })
 */
export async function loadContextForMode(
  opts: ContextLoaderOptions
): Promise<ContextLoadResult> {
  const startTime = Date.now()
  const profile = getContextProfile(opts.mode)
  const context: LoadedContext = {}
  const elementsLoaded: string[] = []

  // Plan metadata (needed for planId in subsequent queries)
  let planMeta: PlanMetadataResult | null = null
  
  // Parallel loading of independent elements
  const promises: Promise<void>[] = []

  // 1. Plan metadata (light, ~200 tokens)
  if (profile.plan_metadata || profile.plan_json || profile.actions_summary || profile.actions_details) {
    promises.push(
      getPlanMetadata(opts.supabase, opts.userId).then((meta) => {
        planMeta = meta
        if (profile.plan_metadata) {
          context.planMetadata = formatPlanMetadata(meta)
          elementsLoaded.push("plan_metadata")
        }
      })
    )
  }

  // 2. Temporal context
  if (profile.temporal && opts.userTime?.prompt_block) {
    context.temporal = `=== REPÈRES TEMPORELS ===\n${opts.userTime.prompt_block}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`
    elementsLoaded.push("temporal")
  }

  // 3. Identity (Temple)
  if (profile.identity) {
    promises.push(
      getCoreIdentity(opts.supabase, opts.userId).then((identity) => {
        if (identity) {
          context.identity = `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identity}\n\n`
          elementsLoaded.push("identity")
        }
      })
    )
  }

  // 4. User facts
  if (profile.facts) {
    promises.push(
      getUserProfileFacts({
        supabase: opts.supabase,
        userId: opts.userId,
        scopes: ["global", opts.scope],
      }).then((factRows) => {
        const factsContext = formatUserProfileFactsForPrompt(factRows, opts.scope)
        if (factsContext) {
          context.facts = `${factsContext}\n\n`
          elementsLoaded.push("facts")
        }
      }).catch((e) => {
        console.warn("[ContextLoader] failed to load user_profile_facts (non-blocking):", e)
      })
    )
  }

  // Wait for plan metadata before loading dependent elements
  await Promise.all(promises)

  // 5. Plan JSON (heavy, on_demand)
  if (planMeta && shouldLoadPlanJson(profile, opts.triggers)) {
    const planContent = await getPlanFullJson(opts.supabase, planMeta.id)
    if (planContent) {
      context.planJson = formatPlanJson(planContent)
      elementsLoaded.push("plan_json")
    }
  }

  // 6. Actions summary or details
  if (planMeta?.id) {
    if (shouldLoadActionsDetails(profile, opts.triggers)) {
      const actionsDetails = await getActionsDetails(opts.supabase, opts.userId, planMeta.id)
      if (actionsDetails) {
        context.actionsDetails = actionsDetails
        elementsLoaded.push("actions_details")
      }
    } else if (profile.actions_summary) {
      const actionsSummary = await getActionsSummary(opts.supabase, opts.userId, planMeta.id)
      const formatted = formatActionsSummary(actionsSummary)
      if (formatted) {
        context.actionsSummary = formatted
        elementsLoaded.push("actions_summary")
      }
    }
  }

  // 7. Vital signs
  if (profile.vitals) {
    const vitals = await getVitalSignsContext(opts.supabase, opts.userId)
    if (vitals) {
      context.vitals = vitals
      elementsLoaded.push("vitals")
    }
  }

  // 8. Short-term context (fil rouge)
  if (profile.short_term) {
    const shortTerm = (opts.state?.short_term_context ?? "").toString().trim()
    if (shortTerm) {
      context.shortTerm = `=== FIL ROUGE (CONTEXTE COURT TERME) ===\n${shortTerm}\n\n`
      elementsLoaded.push("short_term")
    }
  }

  // 9. Recent turns (history)
  if (profile.history_depth > 0 && opts.history?.length) {
    const recentTurns = (opts.history ?? [])
      .slice(-profile.history_depth)
      .map((m: any) => {
        const role = String(m?.role ?? "").trim() || "unknown"
        const content = String(m?.content ?? "").trim().slice(0, 420)
        const ts = String((m as any)?.created_at ?? "").trim()
        return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`
      })
      .join("\n")
    
    if (recentTurns) {
      context.recentTurns = `=== HISTORIQUE RÉCENT (${Math.min(profile.history_depth, opts.history.length)} DERNIERS MESSAGES) ===\n${recentTurns}\n\n`
      elementsLoaded.push("recent_turns")
    }
  }

  // 10. Candidates (for companion only)
  if (profile.candidates && opts.tempMemory) {
    const candidatesContext = await loadCandidatesContext(
      opts.supabase,
      opts.userId,
      opts.scope,
      opts.tempMemory
    )
    if (candidatesContext) {
      context.candidates = candidatesContext
      elementsLoaded.push("candidates")
    }
  }

  // 11. Topic session
  if (opts.tempMemory) {
    const topicSession = getActiveTopicSession(opts.tempMemory)
    if (topicSession) {
      context.topicSession = formatTopicSession(topicSession)
      elementsLoaded.push("topic_session")
    }
  }

  // 12. Injected context (from UI modules)
  if (opts.injectedContext) {
    context.injectedContext = `=== CONTEXTE MODULE (UI) ===\n${opts.injectedContext}\n\n`
    elementsLoaded.push("injected_context")
  }

  // 13. Deferred user pref context
  if (opts.deferredUserPrefContext) {
    context.deferredUserPref = opts.deferredUserPrefContext
    elementsLoaded.push("deferred_user_pref")
  }

  // 14. Checkup addon
  const checkupAddon = (opts.tempMemory as any)?.__checkup_addon
  if (checkupAddon && opts.mode === "companion") {
    context.checkupAddon = formatCheckupAddon(checkupAddon)
    if (context.checkupAddon) elementsLoaded.push("checkup_addon")
  }

  // 15. Track progress addon (parallel tracking)
  const trackProgressAddon = (opts.tempMemory as any)?.__track_progress_parallel
  if (trackProgressAddon && (opts.mode === "companion" || opts.mode === "architect")) {
    context.trackProgressAddon = formatTrackProgressAddon(trackProgressAddon)
    if (context.trackProgressAddon) elementsLoaded.push("track_progress_addon")
  }

  // 16. Expired bilan summary (silent expiry context for companion)
  const expiredBilanSummary = (opts.tempMemory as any)?.__expired_bilan_summary
  if (expiredBilanSummary && (opts.mode === "companion" || opts.mode === "architect")) {
    const done = Array.isArray(expiredBilanSummary.items_done) ? expiredBilanSummary.items_done : []
    const skipped = Array.isArray(expiredBilanSummary.items_skipped) ? expiredBilanSummary.items_skipped : []
    const elapsed = expiredBilanSummary.elapsed_minutes ?? "?"
    let block = `=== CONTEXTE : BILAN PRÉCÉDENT NON TERMINÉ ===\n`
    block += `Le bilan du jour a été lancé il y a ~${elapsed} minutes mais n'a pas été terminé.\n`
    if (done.length > 0) block += `Items traités : ${done.join(", ")}.\n`
    if (skipped.length > 0) block += `Items non traités : ${skipped.join(", ")}.\n`
    block += `Tu n'as PAS besoin de mentionner l'expiration sauf si l'utilisateur en parle.\n`
    block += `Si l'utilisateur demande à reprendre le bilan ou mentionne le bilan, dis-lui qu'on pourra en refaire un au prochain créneau.\n\n`
    context.expiredBilanContext = block
    elementsLoaded.push("expired_bilan_context")
  }

  // Calculate metrics
  const totalLength = Object.values(context)
    .filter(Boolean)
    .reduce((sum, val) => sum + (val?.length ?? 0), 0)
  
  const loadMs = Date.now() - startTime

  return {
    context,
    profile,
    metrics: {
      elements_loaded: elementsLoaded,
      load_ms: loadMs,
      estimated_tokens: Math.ceil(totalLength / 4),
    },
  }
}

/**
 * Assemble le contexte final en string pour le prompt
 */
export function buildContextString(loaded: LoadedContext): string {
  let ctx = ""
  
  // Order matters for prompt coherence
  if (loaded.deferredUserPref) ctx += loaded.deferredUserPref
  if (loaded.injectedContext) ctx += loaded.injectedContext
  if (loaded.temporal) ctx += loaded.temporal
  if (loaded.facts) ctx += loaded.facts
  if (loaded.candidates) ctx += loaded.candidates
  if (loaded.shortTerm) ctx += loaded.shortTerm
  if (loaded.recentTurns) ctx += loaded.recentTurns
  if (loaded.planMetadata) ctx += loaded.planMetadata + "\n\n"
  if (loaded.planJson) ctx += loaded.planJson + "\n\n"
  if (loaded.actionsSummary) ctx += loaded.actionsSummary + "\n\n"
  if (loaded.actionsDetails) ctx += loaded.actionsDetails + "\n\n"
  if (loaded.vitals) ctx += loaded.vitals + "\n\n"
  if (loaded.identity) ctx += loaded.identity
  if (loaded.vectors) ctx += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${loaded.vectors}\n\n`
  if (loaded.topicSession) ctx += loaded.topicSession
  if (loaded.checkupAddon) ctx += loaded.checkupAddon
  if (loaded.trackProgressAddon) ctx += loaded.trackProgressAddon
  if (loaded.expiredBilanContext) ctx += loaded.expiredBilanContext
  
  return ctx.trim()
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Load candidates context for user model confirmation
 */
async function loadCandidatesContext(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  tempMemory: any
): Promise<string | null> {
  try {
    const { data: candRows, error: candErr } = await supabase
      .from("user_profile_fact_candidates")
      .select("id, key, scope, proposed_value, confidence, hits, reason, evidence, last_seen_at, last_asked_at, asked_count, status")
      .eq("user_id", userId)
      .in("scope", ["global", scope])
      .in("status", ["pending", "asked"])
      .limit(30)
    
    if (candErr) throw candErr

    // Score and sort candidates
    const candSorted = (candRows ?? [])
      .map((r: any) => ({ ...r, _score: scoreCandidate(r) }))
      .sort((a: any, b: any) => Number(b?._score ?? 0) - Number(a?._score ?? 0))
      .slice(0, 6)

    // Get pending confirmation from machine
    const profileConfirmState = getProfileConfirmationState(tempMemory)
    const currentFactFromMachine = profileConfirmState ? getCurrentFactToConfirm(tempMemory) : null
    
    const pending = currentFactFromMachine ? {
      key: currentFactFromMachine.key,
      proposed_value: currentFactFromMachine.proposed_value,
      scope: "current",
      asked_at: currentFactFromMachine.detected_at,
      reason: "dispatcher_detection",
      confidence: currentFactFromMachine.confidence,
      _from_machine: true,
      _machine_queue_size: profileConfirmState?.facts_queue.length ?? 1,
      _machine_current_index: profileConfirmState?.current_index ?? 0,
    } : null

    if (!pending && candSorted.length === 0) return null

    return (
      `=== USER MODEL (CANDIDATES / CONFIRMATION) ===\n` +
      `RÈGLE: ne JAMAIS écrire de facts sans confirmation explicite.\n` +
      `PENDING_CONFIRMATION: ${pending ? JSON.stringify(pending) : "null"}\n` +
      `CANDIDATES: ${candSorted.length > 0 ? JSON.stringify(candSorted) : "[]"}\n\n`
    )
  } catch (e) {
    console.warn("[ContextLoader] failed to build candidates context (non-blocking):", e)
    return null
  }
}

/**
 * Score a candidate for priority ranking
 */
function scoreCandidate(r: any): number {
  const conf = Math.max(0, Math.min(1, Number(r?.confidence ?? 0)))
  const hits = Math.max(1, Number(r?.hits ?? 1))
  const askedCount = Math.max(0, Number(r?.asked_count ?? 0))
  const lastSeen = Date.parse(String(r?.last_seen_at ?? ""))
  const lastAsked = Date.parse(String(r?.last_asked_at ?? ""))
  const ageDays = Number.isFinite(lastSeen) ? (Date.now() - lastSeen) / (24 * 60 * 60 * 1000) : 999
  const recency = Math.exp(-ageDays / 7)
  const hitFactor = Math.min(2.0, 1 + Math.log1p(hits) / Math.log(6))
  const askedRecently = Number.isFinite(lastAsked) && (Date.now() - lastAsked) < 24 * 60 * 60 * 1000
  const askPenalty = askedRecently ? 0.15 : 1.0
  const fatiguePenalty = Math.max(0.3, 1.0 - 0.15 * askedCount)
  return conf * recency * hitFactor * askPenalty * fatiguePenalty
}

/**
 * Format topic session for context
 */
function formatTopicSession(session: any): string {
  const topicType = session.type
  const focusMode = session.focus_mode ?? "discussion"
  const phase = session.phase ?? "exploring"
  const topicLabel = session.topic ?? "conversation"
  const handoffTo = session.handoff_to ? String(session.handoff_to) : ""
  
  let ctx = `\n\n=== SESSION TOPIC ACTIVE ===\n`
  ctx += `- Type: ${topicType}\n`
  ctx += `- Sujet: ${topicLabel}\n`
  ctx += `- Phase: ${phase}\n`
  ctx += `- Focus: ${focusMode}\n`
  if (handoffTo) {
    ctx += `- Handoff souhaité: ${handoffTo}\n`
  }
  
  ctx += `\nCONSIGNE PHASE (CRITIQUE):\n`
  ctx += `- opening: cadrer le sujet + valider ce qui compte, 1 question courte.\n`
  ctx += `- exploring: approfondir (1 question ouverte max), rester sur le sujet.\n`
  ctx += `- converging: synthèse brève + prochaine étape concrète ou angle clair.\n`
  ctx += `- closing: conclure clairement + proposer transition douce.\n`
  if (handoffTo) {
    ctx += `- Si possible, prépare un passage fluide vers ${handoffTo}.\n`
  }

  if (focusMode === "plan") {
    ctx += `\nCONSIGNE FOCUS PLAN:\n`
    ctx += `- L'utilisateur DISCUTE de son plan/objectifs (pas une opération outil).\n`
    ctx += `- Aide-le à réfléchir, clarifier, explorer ses doutes ou questions.\n`
    ctx += `- Si tu détectes qu'il veut une OPÉRATION (créer/modifier/supprimer action), utilise les outils appropriés.\n`
    ctx += `- Sinon, reste dans la discussion sans pousser vers des actions concrètes.\n`
  }
  
  return ctx
}

/**
 * Format checkup addon for companion
 */
function formatCheckupAddon(addon: string): string {
  if (addon === "CHECKUP_ENTRY_CONFIRM") {
    return `\n\n=== ADDON BILAN (CONFIRMATION) ===\n- L'utilisateur a demande un bilan.\n- Tu dois poser la question: "Tu veux qu'on fasse le bilan maintenant?"\n- Message personnalise, 1 question max.\n`
  }
  if (addon === "BILAN_ALREADY_DONE") {
    return `\n\n=== ADDON BILAN (DEJA FAIT) ===\n- Le bilan du jour est deja fait.\n- Dis-le gentiment et propose: "Tu veux noter un progres sur une action?"\n- 1 question max.\n`
  }
  return ""
}

/**
 * Format track progress addon (parallel tracking)
 */
function formatTrackProgressAddon(addon: any): string {
  const mode = String(addon?.mode ?? "logged")
  const msg = String(addon?.message ?? "").trim()
  if (!msg) return ""
  if (mode === "needs_clarify") {
    return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le user a dit avoir progressé mais aucune action n'a pu être matchée.\n- Demande une précision courte (quelle action ?), puis tu pourras tracker.\n- Indice interne: ${msg}\n`
  }
  return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le progrès a été loggé automatiquement (ne relance pas le tool).\n- Tu peux continuer le flow normalement et acquiescer si besoin.\n- Résultat: ${msg}\n`
}

// Re-export types for convenience
export type { LoadedContext, ContextProfile, OnDemandTriggers } from "./types.ts"


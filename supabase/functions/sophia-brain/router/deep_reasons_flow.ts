import type { DeepReasonsState } from "../agents/architect/deep_reasons_types.ts"
import type { DispatcherSignals } from "./dispatcher.ts"
import {
  closeTopicSession,
  getActiveDeepReasonsExploration,
  getActiveTopicSession,
  getPausedDeepReasonsExploration,
  pauseDeepReasonsExploration,
  upsertDeepReasonsExploration,
} from "../supervisor.ts"
import {
  getDeferredTopicsV2,
  removeDeferredTopicV2,
} from "./deferred_topics_v2.ts"
import {
  detectDeepReasonsPattern,
  startDeepReasonsExploration,
} from "../agents/architect/deep_reasons.ts"

export function applyDeepReasonsFlow(opts: {
  tempMemory: any
  state: any
  userMessage: string
  dispatcherSignals: DispatcherSignals
}): { tempMemory: any; deepReasonsActiveSession: any | null; deepReasonsStateFromTm?: DeepReasonsState } {
  let { tempMemory } = opts
  let deepReasonsActiveSession = getActiveDeepReasonsExploration(tempMemory)
  let deepReasonsStateFromTm = (tempMemory as any)?.deep_reasons_state as DeepReasonsState | undefined

  try {
    const checkupActive = Boolean(opts.state?.investigation_state && opts.state.investigation_state.status !== "post_checkup")
    const deferredV2 = getDeferredTopicsV2(tempMemory).find((t) => t.machine_type === "deep_reasons") ?? null
    const hasDeepReasonsDeferred = Boolean(deferredV2)
    const deepReasonsOpportunity = opts.dispatcherSignals?.deep_reasons?.opportunity ?? false
    const deepReasonsConf = opts.dispatcherSignals?.deep_reasons?.confidence ?? 0
    const inBilanContext = opts.dispatcherSignals?.deep_reasons?.in_bilan_context ?? checkupActive

    // Enrich dispatcherSignals with deferred_ready (computed from state)
    if (opts.dispatcherSignals?.deep_reasons) {
      opts.dispatcherSignals.deep_reasons.deferred_ready = hasDeepReasonsDeferred && !checkupActive
    }

    // Entry Point 1: Resume deferred deep_reasons topic AFTER bilan ends
    if (hasDeepReasonsDeferred && deferredV2 && !checkupActive && !deepReasonsActiveSession && !deepReasonsStateFromTm) {
      const topicLabel =
        deferredV2.action_target?.trim() ||
        deferredV2.signal_summaries?.slice(-1)?.[0]?.summary?.trim() ||
        "un blocage motivationnel"
      // Create the deep_reasons state from deferred topic (best-effort context)
      const state0 = startDeepReasonsExploration({
        action_title: deferredV2.action_target,
        detected_pattern: "unknown",
        user_words: topicLabel,
        source: "deferred",
        skip_re_consent: false,
      })
        // Store in temp_memory
        ;(tempMemory as any).deep_reasons_state = state0
        deepReasonsStateFromTm = state0

        // Create supervisor session
        const sessionCreated = upsertDeepReasonsExploration({
          tempMemory,
          topic: topicLabel,
          phase: state0.phase,
          pattern: state0.detected_pattern,
          actionTitle: deferredV2.action_target,
          source: "deferred",
        })
        if (sessionCreated.changed) tempMemory = sessionCreated.tempMemory
        deepReasonsActiveSession = getActiveDeepReasonsExploration(tempMemory)

        // Remove the deferred topic (it's now active)
        const removed = removeDeferredTopicV2({ tempMemory, topicId: deferredV2.id })
        if (removed.removed) tempMemory = removed.tempMemory

        console.log(`[Router] Deep reasons exploration resumed from deferred topic: ${topicLabel}`)
    }

    // Entry Point 2: Direct opportunity detected by dispatcher (outside bilan)
    // The Architect will handle proposing and potentially launching via start_deep_exploration tool
    // We just need to ensure routing goes to Architect when opportunity is detected
    if (deepReasonsOpportunity && !inBilanContext && deepReasonsConf >= 0.65 && !deepReasonsActiveSession && !checkupActive) {
      // Add a routing hint for Architect
      ;(tempMemory as any).__deep_reasons_opportunity = {
        detected: true,
        pattern: detectDeepReasonsPattern(opts.userMessage) ?? "unknown",
        user_words: String(opts.userMessage ?? "").slice(0, 200),
      }
      console.log(`[Router] Deep reasons opportunity detected (confidence: ${deepReasonsConf.toFixed(2)}), will route to Architect`)
    }
  } catch (e) {
    console.error("[Router] Deep reasons handling error:", e)
  }

  // --- INTERCONNECTION: topic_serious ↔ deep_reasons ---
  // 1. topic_serious → deep_reasons: if during topic_serious, user mentions blocker on specific action
  // 2. deep_reasons → topic_serious: if during deep_reasons, user wants to explore broader topic
  try {
    const activeTopicForInterconnect = getActiveTopicSession(tempMemory)
    const deepReasonsForInterconnect = getActiveDeepReasonsExploration(tempMemory)
    const pausedDeepReasons = getPausedDeepReasonsExploration(tempMemory)
    const deepReasonsOpportunity = opts.dispatcherSignals?.deep_reasons?.opportunity ?? false
    const deepReasonsActionMentioned = opts.dispatcherSignals?.deep_reasons?.action_mentioned ?? false
    const deepReasonsActionHint = opts.dispatcherSignals?.deep_reasons?.action_hint
    const topicDepth = opts.dispatcherSignals?.topic_depth?.value ?? "NONE"
    const topicDepthConf = opts.dispatcherSignals?.topic_depth?.confidence ?? 0

    // Case 1: topic_serious active + blocker on specific action detected → transition to deep_reasons
    if (
      activeTopicForInterconnect?.type === "topic_serious" &&
      deepReasonsOpportunity &&
      deepReasonsActionMentioned &&
      (opts.dispatcherSignals?.deep_reasons?.confidence ?? 0) >= 0.65
    ) {
      // Close topic_serious and mark for deep_reasons transition
      const closed = closeTopicSession({ tempMemory })
      if (closed.changed) {
        tempMemory = closed.tempMemory
        // Store the transition info for the architect to launch deep_reasons
        ;(tempMemory as any).__deep_reasons_from_topic = {
          from_topic: activeTopicForInterconnect.topic,
          action_hint: deepReasonsActionHint,
          pattern: detectDeepReasonsPattern(opts.userMessage) ?? "unknown",
          user_words: String(opts.userMessage ?? "").slice(0, 200),
        }
        // Also set the opportunity flag
        ;(tempMemory as any).__deep_reasons_opportunity = {
          detected: true,
          from_topic_serious: true,
          action_hint: deepReasonsActionHint,
          pattern: detectDeepReasonsPattern(opts.userMessage) ?? "unknown",
          user_words: String(opts.userMessage ?? "").slice(0, 200),
        }
        console.log(`[Router] Transition: topic_serious → deep_reasons (action: ${deepReasonsActionHint})`)
      }
    }

    // Case 2: deep_reasons active + user wants to explore broader topic → pause deep_reasons for topic_serious
    if (
      deepReasonsForInterconnect &&
      deepReasonsForInterconnect.status === "active" &&
      topicDepth === "SERIOUS" &&
      topicDepthConf >= 0.65 &&
      !deepReasonsActionMentioned  // Must be about a broader topic, not another action
    ) {
      // Pause deep_reasons
      const paused = pauseDeepReasonsExploration({ tempMemory })
      if (paused.changed) {
        tempMemory = paused.tempMemory
        // Track the pause for potential resume
        ;(tempMemory as any).__deep_reasons_paused_for_topic = {
          paused_at: new Date().toISOString(),
          resume_brief: paused.pausedSession?.resume_brief,
        }
        console.log(`[Router] Paused deep_reasons for broader topic_serious exploration`)
      }
    }

    // Case 3: topic_serious closes normally + there's a paused deep_reasons → offer to resume
    if (
      !activeTopicForInterconnect &&
      pausedDeepReasons &&
      !deepReasonsForInterconnect  // No active deep_reasons
    ) {
      // Set a flag for the architect to offer resume
      ;(tempMemory as any).__deep_reasons_resume_available = {
        topic: pausedDeepReasons.topic,
        resume_brief: pausedDeepReasons.resume_brief,
        phase: pausedDeepReasons.phase,
      }
    }
  } catch (e) {
    console.error("[Router] Topic/DeepReasons interconnection error:", e)
  }

  return { tempMemory, deepReasonsActiveSession, deepReasonsStateFromTm }
}


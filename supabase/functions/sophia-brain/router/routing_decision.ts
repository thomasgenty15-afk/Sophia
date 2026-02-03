import type { AgentMode } from "../state-manager.ts"
import type { BrainTracePhase } from "../../_shared/brain-trace.ts"
import type { DispatcherSignals } from "./dispatcher.ts"
import type { DeepReasonsState } from "../agents/architect/deep_reasons_types.ts"
import {
  getActiveTopicSession,
  getAnyActiveMachine,
  hasPausedMachine,
  pauseMachineForSafety,
} from "../supervisor.ts"

export async function applyDeterministicRouting(opts: {
  dispatcherSignals: DispatcherSignals
  tempMemory: any
  state: any
  checkupConfirmedThisTurn: boolean
  disableForcedRouting: boolean
  forceMode?: AgentMode
  deepReasonsActiveSession: any | null
  deepReasonsStateFromTm?: DeepReasonsState
  trace: (event: string, phase: BrainTracePhase, payload?: Record<string, unknown>, level?: "debug" | "info" | "warn" | "error") => Promise<void>
  traceV: (event: string, phase: BrainTracePhase, payload?: Record<string, unknown>, level?: "debug" | "info" | "warn" | "error") => Promise<void>
}): Promise<{ targetMode: AgentMode; tempMemory: any }> {
  let { tempMemory } = opts
  let targetMode: AgentMode = "companion"

  // Track preemption for resume handling
  let topicPreemptedBySafety = false
  let machinePreemptedBySafety = false
  const activeTopicForPreemption = getActiveTopicSession(tempMemory)
  const activeMachineForPreemption = getAnyActiveMachine(tempMemory)

  // 1. Safety override (threshold: confidence >= 0.75)
  // IMPORTANT: Safety signals can PAUSE active machines (parenthesis pattern)
  if (opts.dispatcherSignals.safety.level === "SENTRY" && opts.dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "sentry"

    // PAUSE any active machine (tool flow, topic, deep_reasons)
    if (activeMachineForPreemption && !hasPausedMachine(tempMemory)) {
      const candidate = activeMachineForPreemption.meta?.candidate
      const pauseResult = pauseMachineForSafety({
        tempMemory,
        session: activeMachineForPreemption,
        candidate,
        reason: "sentry",
      })
      tempMemory = pauseResult.tempMemory
      machinePreemptedBySafety = true

      await opts.trace("brain:machine_paused", "routing", {
        machine_type: activeMachineForPreemption.type,
        action_target: pauseResult.pausedState.action_target,
        reason: "sentry",
      })
    }

    // Track if a topic session was preempted (legacy)
    if (activeTopicForPreemption) {
      topicPreemptedBySafety = true
      ;(tempMemory as any).__topic_preempted_by_safety = {
        topic_type: activeTopicForPreemption.type,
        topic: activeTopicForPreemption.topic,
        phase: activeTopicForPreemption.phase,
        turn_count: activeTopicForPreemption.turn_count,
      }
    }
  } else if (opts.dispatcherSignals.safety.level === "FIREFIGHTER" && opts.dispatcherSignals.safety.confidence >= 0.75) {
    targetMode = "firefighter"

    // PAUSE any active machine (tool flow, topic, deep_reasons)
    if (activeMachineForPreemption && !hasPausedMachine(tempMemory)) {
      const candidate = activeMachineForPreemption.meta?.candidate
      const pauseResult = pauseMachineForSafety({
        tempMemory,
        session: activeMachineForPreemption,
        candidate,
        reason: "firefighter",
      })
      tempMemory = pauseResult.tempMemory
      machinePreemptedBySafety = true

      await opts.trace("brain:machine_paused", "routing", {
        machine_type: activeMachineForPreemption.type,
        action_target: pauseResult.pausedState.action_target,
        reason: "firefighter",
      })
    }

    // Track if a topic session was preempted (legacy)
    if (activeTopicForPreemption) {
      topicPreemptedBySafety = true
      ;(tempMemory as any).__topic_preempted_by_safety = {
        topic_type: activeTopicForPreemption.type,
        topic: activeTopicForPreemption.topic,
        phase: activeTopicForPreemption.phase,
        turn_count: activeTopicForPreemption.turn_count,
      }
    }
  }
  // 2. Checkup confirmed by user - start investigation
  else if (opts.checkupConfirmedThisTurn) {
    targetMode = "investigator"
    // The investigator will create investigation_state on first run
    console.log("[Router] Starting checkup after user confirmation")
  }
  // 2b. Ask checkup confirmation (no active machine)
  else if ((tempMemory as any)?.__ask_checkup_confirmation) {
    // Clear the flag - the confirmation question will be asked via companion
    delete (tempMemory as any).__ask_checkup_confirmation
    targetMode = "companion"
    // Companion will ask "Tu veux qu'on fasse le bilan maintenant?"
    ;(tempMemory as any).__checkup_addon = "CHECKUP_ENTRY_CONFIRM"
    console.log("[Router] Routing to companion to ask checkup confirmation")
  }
  // 2c. Propose track_progress when bilan already done
  else if ((tempMemory as any)?.__propose_track_progress) {
    delete (tempMemory as any).__propose_track_progress
    targetMode = "companion"
    ;(tempMemory as any).__checkup_addon = "BILAN_ALREADY_DONE"
    console.log("[Router] Routing to companion to propose track_progress")
  }
  // 2d. Do track_progress directly (no active machine, user accepted)
  else if ((tempMemory as any)?.__track_progress_from_bilan_done) {
    delete (tempMemory as any).__track_progress_from_bilan_done
    targetMode = "architect"
    console.log("[Router] Routing to architect for track_progress")
  }
  // 3. Active bilan hard guard (unless explicit stop)
  else if (
    opts.state?.investigation_state &&
    opts.state?.investigation_state?.status !== "post_checkup" &&
    opts.dispatcherSignals.interrupt.kind !== "EXPLICIT_STOP"
  ) {
    targetMode = "investigator"
  }
  // 4. Intent-based routing
  // NOTE: PLAN and BREAKDOWN intents removed - routing to architect is now ONLY via:
  // - create_action/update_action/breakdown_action signals → tool flow machines
  // - topic_depth.SERIOUS → topic_serious machine (owner: architect)
  // - deep_reasons.opportunity → deep_reasons_exploration machine
  else {
    const intent = opts.dispatcherSignals.user_intent_primary
    const intentConf = opts.dispatcherSignals.user_intent_confidence

    if (intent === "PREFERENCE" && intentConf >= 0.6) {
      targetMode = "companion"
    } else if (intent === "EMOTIONAL_SUPPORT") {
      // EMOTIONAL_SUPPORT + topic_depth.NEED_SUPPORT → firefighter
      // Otherwise, companion handles mild emotional talk
      const topicDepth = opts.dispatcherSignals.topic_depth?.value ?? "NONE"
      const topicDepthConf = opts.dispatcherSignals.topic_depth?.confidence ?? 0
      const riskScore = Number(opts.dispatcherSignals.risk_score ?? 0) || 0
      // Guardrail: NEED_SUPPORT alone is often too sensitive (e.g., "peur du jugement").
      // Only route to firefighter when risk is meaningfully elevated OR safety explicitly indicates firefighter.
      if (
        topicDepth === "NEED_SUPPORT" &&
        topicDepthConf >= 0.6 &&
        (riskScore >= 4 || (opts.dispatcherSignals.safety.level === "FIREFIGHTER" && opts.dispatcherSignals.safety.confidence >= 0.5))
      ) {
        targetMode = "firefighter"
      } else if (opts.dispatcherSignals.safety.level === "FIREFIGHTER" && opts.dispatcherSignals.safety.confidence >= 0.5) {
        targetMode = "firefighter"
      } else {
        targetMode = "companion"
      }
    } else if (opts.dispatcherSignals.topic_depth?.value === "NEED_SUPPORT" && opts.dispatcherSignals.topic_depth?.confidence >= 0.6) {
      const riskScore = Number(opts.dispatcherSignals.risk_score ?? 0) || 0
      // Catch-all guardrail: only route to firefighter if risk is elevated or safety explicitly says so.
      if (riskScore >= 4 || (opts.dispatcherSignals.safety.level === "FIREFIGHTER" && opts.dispatcherSignals.safety.confidence >= 0.5)) {
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
  if (!opts.disableForcedRouting && opts.forceMode && targetMode !== "sentry" && targetMode !== "firefighter") {
    await opts.traceV("brain:forced_routing_override", "routing", {
      from: targetMode,
      to: opts.forceMode,
      reason: "opts.forceMode",
      disableForcedRouting: opts.disableForcedRouting,
    })
    targetMode = opts.forceMode
  }

  // 5. Deep Reasons Exploration routing
  // If there's an active deep_reasons session or opportunity, route to Architect
  if (
    !opts.state?.investigation_state &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter" &&
    targetMode !== "investigator"
  ) {
    // Active deep_reasons session takes priority
    if (opts.deepReasonsActiveSession || opts.deepReasonsStateFromTm) {
      targetMode = "architect"
      await opts.traceV("brain:deep_reasons_routing", "routing", {
        reason: "active_deep_reasons_session",
        phase: opts.deepReasonsStateFromTm?.phase ?? opts.deepReasonsActiveSession?.phase,
      })
    }
    // Deep reasons opportunity (dispatcher detected motivational blocker outside bilan)
    else if ((tempMemory as any)?.__deep_reasons_opportunity?.detected) {
      targetMode = "architect"
      await opts.traceV("brain:deep_reasons_routing", "routing", {
        reason: "deep_reasons_opportunity",
        pattern: (tempMemory as any)?.__deep_reasons_opportunity?.pattern,
      })
    }
  }

  // Keep the flags if needed later (legacy)
  if (topicPreemptedBySafety || machinePreemptedBySafety) {
    // no-op, markers are already in temp_memory
  }

  return { targetMode, tempMemory }
}


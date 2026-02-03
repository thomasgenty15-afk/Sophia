import type { BrainTracePhase } from "../../_shared/brain-trace.ts"
import type {
  DispatcherInputV2,
  DispatcherOutputV2,
  DispatcherSignals,
  NewSignalEntry,
  SignalEnrichment,
  FlowContext,
} from "./dispatcher.ts"
import { analyzeSignalsV2 } from "./dispatcher.ts"
import { getSignalHistory, updateSignalHistory } from "./signal_history.ts"
import { buildFlowContext, getActiveMachineType, machineMatchesSignalType } from "./flow_context.ts"
import {
  getActiveTopicSession,
  hasActiveProfileConfirmation,
  getAnyActiveToolFlow,
} from "../supervisor.ts"

export function buildLastAssistantInfo(history: any[]): { lastAssistantMessage: string; lastAssistantAgent: string | null } {
  const lastAssistantMessage = history.filter((m: any) => m.role === "assistant").pop()?.content || ""
  const lastAssistantAgentRaw = history.filter((m: any) => m.role === "assistant").pop()?.agent_used || null
  const normalizeAgentUsed = (raw: unknown): string | null => {
    const s = String(raw ?? "").trim()
    if (!s) return null
    // DB often stores "sophia.architect" / "sophia.companion" etc.
    const m = s.match(/\b(sentry|firefighter|investigator|architect|companion|librarian)\b/i)
    return m ? m[1]!.toLowerCase() : s.toLowerCase()
  }
  const lastAssistantAgent = normalizeAgentUsed(lastAssistantAgentRaw)
  return { lastAssistantMessage, lastAssistantAgent }
}

export function buildDispatcherStateSnapshot(opts: {
  tempMemory: any
  state: any
}): DispatcherInputV2["stateSnapshot"] {
  const topicSession = getActiveTopicSession(opts.tempMemory)
  const activeToolFlow = getAnyActiveToolFlow(opts.tempMemory)
  return {
    current_mode: opts.state?.current_mode,
    investigation_active: Boolean(opts.state?.investigation_state),
    investigation_status: opts.state?.investigation_state?.status,
    toolflow_active: Boolean(activeToolFlow),
    toolflow_kind: activeToolFlow?.type ?? (opts.tempMemory as any)?.architect_tool_flow?.kind,
    profile_confirm_pending: hasActiveProfileConfirmation(opts.tempMemory),
    plan_confirm_pending: Boolean((opts.tempMemory as any)?.__wa_plan_confirm_pending),
    topic_exploration_phase: topicSession ? topicSession.phase : undefined,
    topic_exploration_type: topicSession?.type,
    risk_level: opts.state?.risk_level,
  }
}

export async function runContextualDispatcherV2(opts: {
  userMessage: string
  lastAssistantMessage: string
  history: any[]
  tempMemory: any
  state: any
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
  stateSnapshot: DispatcherInputV2["stateSnapshot"]
  signalHistoryKey: string
  minTurnIndex: number
  trace: (event: string, phase: BrainTracePhase, payload?: Record<string, unknown>, level?: "debug" | "info" | "warn" | "error") => Promise<void>
  traceV: (event: string, phase: BrainTracePhase, payload?: Record<string, unknown>, level?: "debug" | "info" | "warn" | "error") => Promise<void>
}): Promise<{
  dispatcherResult: DispatcherOutputV2
  dispatcherSignals: DispatcherSignals
  newSignalsDetected: NewSignalEntry[]
  signalEnrichments: SignalEnrichment[]
  flowContext: FlowContext | undefined
  activeMachine: string | null
  tempMemory: any
}> {
  const signalHistory = getSignalHistory(opts.tempMemory, opts.signalHistoryKey)
  const activeMachine = getActiveMachineType(opts.tempMemory)

  // Build last 6 messages (3 turns) for context (latency-sensitive; keep small).
  // A turn = 1 user message + 1 assistant message = 2 messages
  const last3TurnsMessages = (opts.history ?? []).slice(-6).map((m: any) => ({
    role: String(m?.role ?? "user"),
    content: String(m?.content ?? "").slice(0, 220),
  }))

  // Build flow context for enriching machine-specific prompts
  const flowContext = buildFlowContext(opts.tempMemory, opts.state)

  // Build V2 input
  const dispatcherInputV2: DispatcherInputV2 = {
    userMessage: opts.userMessage,
    lastAssistantMessage: opts.lastAssistantMessage,
    last5Messages: last3TurnsMessages,
    signalHistory,
    activeMachine,
    stateSnapshot: opts.stateSnapshot,
    flowContext,
  }

  // Call contextual dispatcher
  const dispatcherResult = await analyzeSignalsV2(dispatcherInputV2, { ...(opts.meta ?? {}) })
  const dispatcherSignals = dispatcherResult.signals
  const newSignalsDetected = dispatcherResult.new_signals
  const signalEnrichments = dispatcherResult.enrichments

  // Update signal history with new signals and enrichments
  const historyUpdate = updateSignalHistory({
    tempMemory: opts.tempMemory,
    key: opts.signalHistoryKey,
    minTurnIndex: opts.minTurnIndex,
    newSignals: newSignalsDetected,
    enrichments: signalEnrichments,
    activeMachine,
    machineMatchesSignalType,
  })

  let tempMemory = historyUpdate.tempMemory

  // Trace dispatcher context
  await opts.traceV("brain:dispatcher_contextual", "dispatcher", {
    active_machine: activeMachine,
    signal_history_count: signalHistory.length,
    new_signals_count: newSignalsDetected.length,
    enrichments_count: signalEnrichments.length,
    pruned_count: historyUpdate.prunedCount,
  })

  // Trace new signals detected
  if (newSignalsDetected.length > 0) {
    await opts.trace("brain:new_signals_detected", "dispatcher", {
      signals: newSignalsDetected.map(s => ({
        type: s.signal_type,
        brief: s.brief.slice(0, 50),
        action_target: s.action_target,
      })),
    })
  }

  // Trace enrichments
  if (signalEnrichments.length > 0) {
    await opts.traceV("brain:signal_briefs_enriched", "dispatcher", {
      enrichments: signalEnrichments.map(e => ({
        signal: e.existing_signal_type,
        brief: e.updated_brief.slice(0, 50),
      })),
    })
  }

  return {
    dispatcherResult,
    dispatcherSignals,
    newSignalsDetected,
    signalEnrichments,
    flowContext,
    activeMachine,
    tempMemory,
  }
}


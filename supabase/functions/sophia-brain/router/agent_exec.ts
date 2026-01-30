/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import type { AgentMode } from "../state-manager.ts"
import { getUserState, updateUserState } from "../state-manager.ts"
import { runSentry, type SentryFlowContext } from "../agents/sentry.ts"
import { runFirefighter, type FirefighterFlowContext } from "../agents/firefighter.ts"
import { getActiveSafetyFirefighterFlow, getActiveSafetySentryFlow } from "../supervisor.ts"
import { runInvestigator } from "../agents/investigator.ts"
import { logCheckupCompletion } from "../agents/investigator/db.ts"
import { buildArchitectSystemPromptLite, generateArchitectModelOutput, getArchitectTools, handleArchitectModelOutput, runArchitect } from "../agents/architect.ts"
import { runLibrarian } from "../agents/librarian.ts"
import { buildCompanionSystemPrompt, generateCompanionModelOutput, handleCompanionModelOutput, runCompanion } from "../agents/companion.ts"
import { runAssistant } from "../agents/assistant.ts"
import { normalizeChatText } from "../chat_text.ts"
import { buildConversationAgentViolations, judgeOfThree, type ToolDescriptor, verifyBilanAgentMessage, verifyConversationAgentMessage, verifyPostCheckupAgentMessage } from "../verifier.ts"
import { assistantDeferredTopic, extractDeferredTopicFromUserMessage } from "./deferred_topics.ts"
import { deferSignal } from "./deferred_topics_v2.ts"
import { enqueueLlmRetryJob, tryEmergencyAiReply } from "./emergency.ts"
import { logEvalEvent } from "../../run-evals/lib/eval_trace.ts"
import { logBrainTrace } from "../../_shared/brain-trace.ts"
import { logVerifierEvalEvent } from "../lib/verifier_eval_log.ts"
import { logToolLedgerEvent } from "../lib/tool_ledger.ts"

export async function runAgentAndVerify(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  channel: "web" | "whatsapp"
  userMessage: string
  history: any[]
  state: any
  context: string
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; evalRunId?: string | null; forceBrainTrace?: boolean }
  targetMode: AgentMode
  nCandidates?: 1 | 3
  checkupActive: boolean
  stopCheckup: boolean
  isPostCheckup: boolean
  outageTemplate: string
  sophiaChatModel: string
  tempMemory?: any
  /** Pre-formalized deferred topic from dispatcher (avoids extra AI call) */
  dispatcherDeferredTopic?: string | null
}): Promise<{ responseContent: string; nextMode: AgentMode; tempMemory?: any }> {
  const {
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
    checkupActive,
    stopCheckup,
    isPostCheckup,
    outageTemplate,
    sophiaChatModel,
  } = opts

  let responseContent = ""
  let nextMode: AgentMode = targetMode
  let tempMemory = opts.tempMemory ?? {}
  // Used by the global anti-claim verifier (outside bilan too).
  let executedTools: string[] = []
  let toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain" = "none"

  const TRACE_VERBOSE =
    (((globalThis as any)?.Deno?.env?.get?.("SOPHIA_BRAIN_TRACE_VERBOSE") ?? "") as string).trim() === "1"
  const trace = async (event: string, phase: any, payload: Record<string, unknown> = {}, level: "debug" | "info" | "warn" | "error" = "info") => {
    await logBrainTrace({
      supabase,
      userId,
      meta: { requestId: meta?.requestId, evalRunId: (meta as any)?.evalRunId ?? null, forceBrainTrace: (meta as any)?.forceBrainTrace },
      event,
      phase,
      level,
      payload,
    })
  }
  const traceV = async (event: string, phase: any, payload: Record<string, unknown> = {}, level: "debug" | "info" | "warn" | "error" = "debug") => {
    if (!TRACE_VERBOSE) return
    await trace(event, phase, payload, level)
  }

  await trace("brain:agent_exec_start", "agent", {
    target_mode: targetMode,
    channel,
    scope,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    nCandidates: opts.nCandidates ?? 1,
    sophiaChatModel,
  }, "debug")

  function toolUsageWhen(name: string): string {
    const n = String(name ?? "").trim()
    if (n === "track_progress") return "Seulement quand l'utilisateur dit explicitement qu'il a fait / pas fait une action."
    if (n === "set_profile_confirm_pending") return "Seulement quand tu poses une question de confirmation de préférence (low-stakes)."
    if (n === "apply_profile_fact") return "Seulement après confirmation explicite d'une préférence."
    if (n === "break_down_action") return "Seulement quand une action bloque et que l'utilisateur accepte explicitement de la découper en micro-étape."
    if (n === "create_simple_action" || n === "create_framework") return "Seulement si un plan actif existe ET que l'utilisateur demande clairement d'ajouter un élément."
    if (n === "update_action_structure") return "Seulement si l'utilisateur demande un changement sur une action existante."
    if (n === "activate_plan_action") return "Seulement si l'utilisateur demande d'activer une action future."
    if (n === "archive_plan_action") return "Seulement si l'utilisateur veut arrêter/archiver une action."
    return "Seulement si nécessaire et conforme au contexte."
  }

  function buildToolDescriptorsFromToolDefs(toolDefs: any[]): ToolDescriptor[] {
    return (toolDefs ?? [])
      .map((t: any) => ({
        name: String(t?.name ?? "").trim(),
        description: String(t?.description ?? "").trim(),
        usage_when: toolUsageWhen(String(t?.name ?? "")),
      }))
      .filter((t) => t.name.length > 0)
  }

  function toolsAvailableForMode(args: { mode: AgentMode }): ToolDescriptor[] {
    if (args.mode === "companion") {
      return [
        { name: "track_progress", description: "Enregistre une progression ou un raté.", usage_when: toolUsageWhen("track_progress") },
        { name: "set_profile_confirm_pending", description: "Marque une question de confirmation posée.", usage_when: toolUsageWhen("set_profile_confirm_pending") },
        { name: "apply_profile_fact", description: "Applique une préférence confirmée.", usage_when: toolUsageWhen("apply_profile_fact") },
      ]
    }
    if (args.mode === "architect") {
      return buildToolDescriptorsFromToolDefs(getArchitectTools())
    }
    // For now: librarian/assistant/firefighter/sentry do not expose tool definitions to the judge.
    return []
  }

  function toolCallViolations(args: {
    agent: AgentMode
    tool: string
    toolArgs: any
    allowedTools: string[]
  }): string[] {
    const v: string[] = []
    const tool = String(args.tool ?? "").trim()
    if (!tool) return ["tool_call_missing_tool"]
    if (!args.allowedTools.includes(tool)) v.push("tool_call_tool_not_allowed")
    if (args.toolArgs == null || (typeof args.toolArgs === "object" && Object.keys(args.toolArgs).length === 0)) v.push("tool_call_missing_args")
    return v
  }

  async function runMultiCandidateIfNeeded(): Promise<{ ran: boolean; responseText: string }> {
    const n = opts.nCandidates ?? 1
    if (n !== 3) return { ran: false, responseText: "" }
    if (!(targetMode === "companion" || targetMode === "architect" || targetMode === "librarian")) return { ran: false, responseText: "" }
    if (targetMode === "sentry" || targetMode === "investigator") return { ran: false, responseText: "" }

    const lastAssistantMessage = (history ?? []).filter((m: any) => m?.role === "assistant").slice(-1)[0]?.content ?? ""
    const temps = targetMode === "librarian" ? [0.35, 0.5, 0.2] : [0.55, 0.75, 0.9]

    type CandidateRaw =
      | { kind: "text"; text: string }
      | { kind: "tool"; tool: string; args: any; preview: string }

    const candidatesRaw: CandidateRaw[] = []
    let toolsAvailable: ToolDescriptor[] = []
    let allowedTools: string[] = []
    if (targetMode === "companion") {
      const systemPrompt = buildCompanionSystemPrompt({
        isWhatsApp: channel === "whatsapp",
        lastAssistantMessage: String(lastAssistantMessage ?? ""),
        context,
        userState: state,
      })
      toolsAvailable = toolsAvailableForMode({ mode: "companion" })
      allowedTools = toolsAvailable.map((t) => t.name)
      for (const t of temps) {
        const out = await generateCompanionModelOutput({ systemPrompt, message: userMessage, history, meta: { ...(meta ?? {}), model: sophiaChatModel, temperature: t } })
        if (typeof out === "string") candidatesRaw.push({ kind: "text", text: out })
        else candidatesRaw.push({ kind: "tool", tool: String((out as any)?.tool ?? ""), args: (out as any)?.args, preview: `(tool_call) ${(out as any)?.tool ?? ""} ${(out as any)?.args ? JSON.stringify((out as any).args).slice(0, 220) : ""}` })
      }
    } else if (targetMode === "architect") {
      const systemPrompt = buildArchitectSystemPromptLite({ channel, lastAssistantMessage: String(lastAssistantMessage ?? ""), context })
      const isModuleUi = String(context ?? "").includes("=== CONTEXTE MODULE (UI) ===")
      function looksLikeExplicitPlanOperationRequest(msg: string): boolean {
        const s = String(msg ?? "").trim().toLowerCase()
        if (!s) return false
        // Creating/adding
        if (/\b(ajoute|ajouter|cr[ée]e|cr[ée]er|mets|mettre)\b/.test(s) && /\b(plan|dans mon plan|sur mon plan|au plan)\b/.test(s)) return true
        // Updates / activation / archive
        if (/\b(modifie|modifier|change|changer|mets|mettre|supprime|supprimer|archive|archiver|d[ée]sactive|d[ée]sactiver|active|activer|fr[ée]quence)\b/i.test(msg)) return true
        return false
      }
      const baseToolDefs = getArchitectTools()
      // In Module (UI) conversations, default to discussion-first: no tools unless explicitly requested.
      const toolDefs = (isModuleUi && !looksLikeExplicitPlanOperationRequest(userMessage)) ? [] : baseToolDefs
      toolsAvailable = buildToolDescriptorsFromToolDefs(toolDefs)
      allowedTools = toolsAvailable.map((t) => t.name)
      for (const t of temps) {
        const out = await generateArchitectModelOutput({
          systemPrompt,
          message: userMessage,
          history,
          tools: toolDefs,
          meta: { ...(meta ?? {}), model: sophiaChatModel, temperature: t },
        })
        if (typeof out === "string") candidatesRaw.push({ kind: "text", text: out })
        else candidatesRaw.push({ kind: "tool", tool: String((out as any)?.tool ?? ""), args: (out as any)?.args, preview: `(tool_call) ${(out as any)?.tool ?? ""} ${(out as any)?.args ? JSON.stringify((out as any).args).slice(0, 220) : ""}` })
      }
    } else {
      // librarian
      toolsAvailable = []
      allowedTools = []
      for (const t of temps) {
        const out = await runLibrarian(userMessage, history, context, { ...(meta ?? {}), model: sophiaChatModel, temperature: t } as any)
        candidatesRaw.push({ kind: "text", text: out })
      }
    }

    const candidatesForJudge = candidatesRaw.slice(0, 3).map((c, idx) => {
      if (c.kind === "text") {
        const txt = normalizeChatText(c.text)
        const v = buildConversationAgentViolations(txt, {
          agent: targetMode,
          channel,
          user_message: userMessage,
          last_assistant_message: lastAssistantMessage,
          history_len: Array.isArray(history) ? history.length : 0,
          // Candidates are not executed, so any tool/side-effect claim must be treated as unverified.
          tools_executed: false,
          executed_tools: [],
          tool_execution: "none",
        })
        return { label: `c${idx}`, text: txt, mechanical_violations: v }
      }
      const v = toolCallViolations({ agent: targetMode, tool: c.tool, toolArgs: c.args, allowedTools })
      return { label: `c${idx}`, text: c.preview, mechanical_violations: v }
    })

    const judged = await judgeOfThree({
      agent: targetMode,
      channel,
      user_message: userMessage,
      context_used: context,
      recent_history: (history ?? []).slice(-15),
      tools_available: toolsAvailable,
      candidates: candidatesForJudge,
      meta: { requestId: meta?.requestId, forceRealAi: meta?.forceRealAi, userId },
    })

    const chosenIdx = Math.max(0, Math.min(2, judged.best_index))
    const chosen = candidatesRaw[chosenIdx] ?? candidatesRaw[0]

    // Execute only the chosen candidate (prevents side effects from non-chosen tool calls).
    let finalText = ""
    if (targetMode === "companion") {
      if (chosen.kind === "text") finalText = chosen.text
      else {
        const requestId = String(meta?.requestId ?? "").trim()
        const t0 = Date.now()
        try {
          if (requestId) {
            await logToolLedgerEvent({
              supabase,
              requestId,
              evalRunId: meta?.evalRunId ?? null,
              userId,
              source: "sophia-brain:router",
              event: "tool_call_attempted",
              level: "info",
              toolName: chosen.tool,
              toolArgs: chosen.args,
              latencyMs: 0,
              metadata: { agent: "companion", chosen_index: chosenIdx },
            })
          }
        } catch {}
        const out = await handleCompanionModelOutput({
          supabase,
          userId,
          message: userMessage,
          response: { tool: chosen.tool, args: chosen.args } as any,
          meta: { ...(meta ?? {}), model: sophiaChatModel },
        })
        finalText = out.text
        executedTools = out.executed_tools ?? [chosen.tool]
        toolExecution = out.tool_execution ?? "success"
        try {
          if (requestId) {
            const ev =
              toolExecution === "success" ? "tool_call_succeeded"
              : toolExecution === "blocked" ? "tool_call_blocked"
              : toolExecution === "failed" ? "tool_call_failed"
              : "tool_call_succeeded"
            await logToolLedgerEvent({
              supabase,
              requestId,
              evalRunId: meta?.evalRunId ?? null,
              userId,
              source: "sophia-brain:router",
              event: ev as any,
              level: ev === "tool_call_failed" ? "error" : (ev === "tool_call_blocked" ? "warn" : "info"),
              toolName: chosen.tool,
              toolArgs: chosen.args,
              toolResult: { executed_tools: out.executed_tools ?? null, tool_execution: toolExecution, text: out.text },
              latencyMs: Date.now() - t0,
              metadata: { agent: "companion", chosen_index: chosenIdx },
            })
          }
        } catch {}
      }
    } else if (targetMode === "architect") {
      if (chosen.kind === "text") finalText = chosen.text
      else {
        // NOTE: Architect tool-call ledger is logged inside handleArchitectModelOutput (deeper + avoids duplicates).
        const out = await handleArchitectModelOutput({
          supabase,
          userId,
          message: userMessage,
          response: { tool: chosen.tool, args: chosen.args } as any,
          context,
          meta: { ...(meta ?? {}), model: sophiaChatModel },
        })
        executedTools = out.executed_tools ?? []
        toolExecution = out.tool_execution ?? "uncertain"
        finalText = out.text
      }
    } else {
      // librarian
      finalText = chosen.kind === "text" ? chosen.text : chosen.preview
    }

    // Best-effort log: store which candidate was chosen + brief reasons.
    await logJudgeEvent({
      verifier_kind: "verifier_3",
      agent_used: targetMode,
      ok: null,
      rewritten: null,
      issues: (judged.reasons ?? []).map((r) => `reason:${r}`),
      mechanical_violations: candidatesForJudge.map((c) => ({ label: c.label, v: c.mechanical_violations })),
      draft: candidatesForJudge.map((c) => `${c.label}: ${String(c.text).slice(0, 260)}`).join("\n"),
      final_text: String(finalText ?? ""),
      metadata: {
        nCandidates: 3,
        chosen_index: chosenIdx,
        judge_reasons: judged.reasons ?? [],
        candidates: candidatesForJudge.map((c) => ({ label: c.label, len: String(c.text ?? "").length, mechanical_violations: c.mechanical_violations })),
      },
    } as any)

    return { ran: true, responseText: finalText }
  }

  // --- MULTI-CANDIDATE (optional) ---
  try {
    const mc = await runMultiCandidateIfNeeded()
    if (mc.ran) {
      responseContent = mc.responseText
    }
  } catch (e) {
    console.error("[Router] multi-candidate failed (non-blocking):", e)
  }

  async function sha256Hex(text: string): Promise<string> {
    try {
      const buf = new TextEncoder().encode(String(text ?? ""));
      const digest = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  }

  async function logJudgeEvent(args: {
    verifier_kind: string
    agent_used: AgentMode
    ok: boolean | null
    rewritten: boolean | null
    issues: string[]
    mechanical_violations: unknown[]
    draft: string
    final_text: string
    metadata?: Record<string, unknown>
  }) {
    // IMPORTANT: verifier logs are persisted only into conversation_eval_events during eval runs.
    try {
      const requestId = String(meta?.requestId ?? "").trim()
      if (!requestId) return
      const draft = String(args.draft ?? "")
      const finalText = String(args.final_text ?? "")
      const [draftHash, finalHash] = await Promise.all([sha256Hex(draft), sha256Hex(finalText)])
      await logVerifierEvalEvent({
        supabase: supabase as any,
        requestId,
        source: "sophia-brain:verifier",
        event: "verifier_decision",
        level: (args.ok === false || (args.issues ?? []).length > 0) ? "warn" : "info",
        payload: {
          user_id: userId,
          scope,
          channel,
          agent_used: args.agent_used,
          verifier_kind: args.verifier_kind,
          ok: args.ok,
          rewritten: args.rewritten,
          issues: args.issues ?? [],
          mechanical_violations: args.mechanical_violations ?? [],
          draft_len: draft.length,
          final_len: finalText.length,
          draft_hash: draftHash || null,
          final_hash: finalHash || null,
          metadata: args.metadata ?? {},
        },
      })
    } catch {
      // best-effort; don't block user reply/eval
    }
  }

  async function maybeLogVerifierEvalTrace(args: { verifier_kind: string; issues: string[]; rewritten: boolean }) {
    const requestId = String(meta?.requestId ?? "").trim()
    if (!requestId) return
    // Only useful for eval runs (request_id looks like "<uuid>:<dataset>:<scenario>").
    if (!requestId.includes(":state_machines:") && !requestId.includes(":tools:") && !requestId.includes(":whatsapp:")) return
    try {
      await logVerifierEvalEvent({
        supabase: supabase as any,
        requestId,
        source: "sophia-brain:verifier",
        event: "verifier_issues",
        level: "info",
        payload: { verifier_kind: args.verifier_kind, issues: args.issues, rewritten: args.rewritten },
      })
    } catch {
      // best-effort; never block user reply/eval
    }
  }

  switch (targetMode) {
    case "sentry":
      {
        // Build flow context from tempMemory for phase-specific prompting
        const sentryFlowState = tempMemory ? getActiveSafetySentryFlow(tempMemory) : null
        const sentryFlowContext: SentryFlowContext | undefined = sentryFlowState ? {
          phase: sentryFlowState.phase as SentryFlowContext["phase"],
          turnCount: sentryFlowState.turn_count,
          safetyConfirmed: sentryFlowState.safety_confirmed,
          externalHelpMentioned: sentryFlowState.external_help_mentioned,
        } : undefined
        
        responseContent = await runSentry(userMessage, meta, sentryFlowContext)
        // NOTE: nextMode is now managed by safety_sentry_flow state machine in run.ts
        // The machine tracks crisis phases (acute → confirming → resolved) and handles handoff.
        // We don't set nextMode here - the router will determine it based on flow state.
      }
      break
    case "firefighter":
      try {
        // Build flow context from tempMemory for phase-specific prompting
        const firefighterFlowState = tempMemory ? getActiveSafetyFirefighterFlow(tempMemory) : null
        const firefighterFlowContext: FirefighterFlowContext | undefined = firefighterFlowState ? {
          phase: firefighterFlowState.phase as FirefighterFlowContext["phase"],
          turnCount: firefighterFlowState.turn_count,
          stabilizationSignals: firefighterFlowState.stabilization_signals,
          distressSignals: firefighterFlowState.distress_signals,
          lastTechnique: firefighterFlowState.technique_used,
        } : undefined
        
        const ffResult = await runFirefighter(userMessage, history, context, meta, firefighterFlowContext)
        responseContent = ffResult.content
        // NOTE: ffResult.crisisResolved is still produced by firefighter for backward compatibility,
        // but the actual crisis resolution is now determined by safety_firefighter_flow state machine
        // in run.ts, which uses structured safety_resolution signals from the dispatcher.
        // This provides multi-turn tracking with stabilization signal counting.
        
        // Store technique used for state machine context (if available)
        if (ffResult.technique && tempMemory) {
          (tempMemory as any).__last_firefighter_technique = ffResult.technique
        }
      } catch (e) {
        console.error("[Router] firefighter failed:", e)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "firefighter_failed_all_models",
          })
          responseContent = outageTemplate
        }
      }
      break
    case "investigator":
      try {
        console.log("[Router] Starting Investigator execution...")
        const invResult = await runInvestigator(
          supabase,
          userId,
          userMessage,
          history,
          state.investigation_state,
          { ...(meta ?? {}), model: sophiaChatModel },
        )
        console.log("[Router] Investigator result received:", invResult ? "OK" : "NULL")

        responseContent = invResult.content
        if (invResult.investigationComplete) {
          // Bilan is complete - log completion and clear investigation_state
          // Deferred topics are now stored in temp_memory.deferred_topics_v2 (global)
          // The auto-relaunch mechanism in run.ts will handle them
          
          // Log checkup completion to DB
          const items = state?.investigation_state?.pending_items ?? []
          const completedCount = items.filter((i: any) => i?.logged_status === "completed").length
          const missedCount = items.filter((i: any) => i?.logged_status === "missed").length
          
          await logCheckupCompletion(supabase, userId, {
            items: items.length,
            completed: completedCount,
            missed: missedCount,
          }, "chat")
          
          const tm = (state as any)?.temp_memory ?? {}
          await updateUserState(supabase, userId, scope, { 
            investigation_state: null,
            temp_memory: { ...tm, __flow_just_closed_normally: true },
          })
          nextMode = "companion"
          console.log(`[Router] Bilan complete. Logged: ${completedCount}/${items.length} completed, ${missedCount} missed. Auto-relaunch flagged.`)
        } else {
          // Bilan continues - save the new state
          await updateUserState(supabase, userId, scope, { investigation_state: invResult.newState })
        }
      } catch (err) {
        console.error("[Router] ❌ CRITICAL ERROR IN INVESTIGATOR:", err)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "investigator_failed_all_models",
          })
          responseContent = outageTemplate
        }
        nextMode = "companion"
      }
      break
    case "architect":
      try {
        if (!responseContent) {
          const out = await runArchitect(
          supabase,
          userId,
          userMessage,
          history,
          state,
          context,
          { ...(meta ?? {}), model: sophiaChatModel, scope },
          )
          responseContent = out.text
          executedTools = out.executed_tools ?? []
          toolExecution = out.tool_execution ?? "uncertain"
        }
      } catch (e) {
        console.error("[Router] architect failed:", e)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "architect_failed_all_models",
          })
          responseContent = outageTemplate
        }
        nextMode = "companion"
      }
      // Post-bilan rule: always end with the validation phrase.
      if (
        isPostCheckup &&
        typeof responseContent === "string" &&
        responseContent.trim() &&
        !/c['’]est\s+bon\s+pour\s+ce\s+point\s*\?/i.test(responseContent)
      ) {
        responseContent = `${responseContent.trim()}\n\nC'est bon pour ce point ?`
      }
      break
    case "librarian":
      try {
        if (!responseContent) responseContent = await runLibrarian(userMessage, history, context, { ...(meta ?? {}), model: sophiaChatModel })
        nextMode = "companion"
      } catch (e) {
        console.error("[Router] librarian failed:", e)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "librarian_failed_all_models",
          })
          responseContent = outageTemplate
        }
        nextMode = "companion"
      }
      break
    case "assistant":
      try {
        responseContent = await runAssistant(userMessage, meta)
        nextMode = "companion"
      } catch (e) {
        console.error("[Router] assistant failed:", e)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "assistant_failed_all_models",
          })
          responseContent = outageTemplate
        }
        nextMode = "companion"
      }
      break
    case "companion":
    default:
      // If the dispatcher ever returns an unknown mode, we still respond as Companion and
      // we must NOT store an invalid mode in DB.
      nextMode = "companion"
      try {
        if (!responseContent) {
          const out = await runCompanion(
            supabase,
            userId,
            scope,
            userMessage,
            history,
            state,
            context,
            { ...(meta ?? {}), model: sophiaChatModel },
          )
          responseContent = out.text
          executedTools = out.executed_tools ?? []
          toolExecution = out.tool_execution ?? "uncertain"
        }
      } catch (e) {
        console.error("[Router] companion failed:", e)
        const emergency = await tryEmergencyAiReply({
          userMessage,
          targetMode,
          checkupActive,
          isPostCheckup,
          requestId: meta?.requestId,
          userId,
          forceRealAi: meta?.forceRealAi,
        })
        if (emergency) {
          responseContent = emergency
        } else {
          await enqueueLlmRetryJob({
            supabase,
            userId,
            scope,
            channel,
            userMessage,
            investigationActive: Boolean(state?.investigation_state),
            requestId: meta?.requestId,
            reason: "companion_failed_all_models",
          })
          responseContent = outageTemplate
        }
        nextMode = "companion"
      }
      break
  }

  // Post-bilan rule (global): for post-checkup turns, always end with the validation phrase,
  // regardless of the selected agent. This keeps the parking-lot progression deterministic.
  if (
    isPostCheckup &&
    targetMode !== "sentry" &&
    typeof responseContent === "string" &&
    responseContent.trim() &&
    !/c['’]est\s+bon\s+pour\s+ce\s+point\s*\?/i.test(responseContent)
  ) {
    responseContent = `${responseContent.trim()}\n\nC'est bon pour ce point ?`
  }

  // Global output sanitation (avoid forbidden claims leaking from non-Architect modules).
  if (typeof responseContent === "string" && responseContent.trim()) {
    responseContent = responseContent
      .replace(/\bj[’']ai\s+programm[eé]\b/gi, "c’est calé")
      .replace(/\*\*/g, "");
  }

  responseContent = normalizeChatText(responseContent)

  // --- GLOBAL CONVERSATION VERIFIER (WhatsApp-first) ---
  // Goal: enforce short, human turn-taking rules outside bilan/post-bilan.
  // We only rewrite when violations are detected (cost/latency control).
  const conversationVerifierEnabled = (() => {
    const raw = (Deno.env.get("SOPHIA_CONVERSATION_VERIFIER") ?? "").trim().toLowerCase()
    if (raw === "0" || raw === "false" || raw === "off") return false
    return true
  })()
  if (
    conversationVerifierEnabled &&
    !checkupActive &&
    !isPostCheckup &&
    !stopCheckup &&
    targetMode !== "watcher" &&
    targetMode !== "sentry" &&
    targetMode !== "investigator" &&
    typeof responseContent === "string" &&
    responseContent.trim()
  ) {
    try {
      const lastAssistantMessage = history.filter((m: any) => m?.role === "assistant").slice(-1)[0]?.content ?? ""
      const recentHistory = (history ?? []).slice(-15).map((m: any) => ({
        role: m?.role,
        content: m?.content,
        created_at: (m as any)?.created_at ?? null,
        agent_used: (m as any)?.agent_used ?? null,
      }))
      const tools_available = toolsAvailableForMode({ mode: targetMode })
      const draftBefore = responseContent
      const verified = await verifyConversationAgentMessage({
        draft: responseContent,
        agent: targetMode,
        data: {
          channel,
          user_message: userMessage,
          last_assistant_message: lastAssistantMessage,
          history_len: Array.isArray(history) ? history.length : 0,
          now_iso: new Date().toISOString(),
          context_used: (context ?? "").toString().slice(0, 6000),
          recent_history: recentHistory,
          tools_available,
          tools_executed: executedTools.length > 0,
          executed_tools: executedTools,
          tool_execution: toolExecution,
        },
        meta: {
          requestId: meta?.requestId,
          forceRealAi: meta?.forceRealAi,
          channel: meta?.channel,
          model:
            ((((globalThis as any)?.Deno?.env?.get?.("GEMINI_FALLBACK_MODEL") ?? "") as string).trim()) ||
            "gemini-2.5-flash",
          userId,
        },
      })
      responseContent = normalizeChatText(verified.text)
      await maybeLogVerifierEvalTrace({
        verifier_kind: "verifier_1:conversation",
        issues: Array.isArray(verified.violations) ? verified.violations : [],
        rewritten: Boolean(verified.rewritten),
      })
      await logJudgeEvent({
        verifier_kind: "verifier_1:conversation",
        agent_used: targetMode,
        ok: null,
        rewritten: Boolean(verified.rewritten),
        issues: Array.isArray(verified.violations) ? verified.violations : [],
        mechanical_violations: [],
        draft: draftBefore,
        final_text: responseContent,
        metadata: { nCandidates: opts.nCandidates ?? 1 },
      })
    } catch (e) {
      console.error("[Router] conversation verifier failed (non-blocking):", e)
    }
  }

  // During an active checkup, if ANY agent explicitly defers, store the topic.
  // NOW USES deferred_topics_v2 instead of the old parking lot.
  // Topics will auto-relaunch after bilan completes.
  if (checkupActive && !stopCheckup && targetMode !== "sentry" && assistantDeferredTopic(responseContent)) {
    try {
      // USE DISPATCHER'S FORMALIZED TOPIC if available (already computed in router)
      const formalizedFromDispatcher = opts.dispatcherDeferredTopic
      const fallbackExtracted = extractDeferredTopicFromUserMessage(userMessage) || String(userMessage ?? "").trim().slice(0, 240)
      const topicToStore = formalizedFromDispatcher || fallbackExtracted
      
      if (topicToStore && topicToStore.length >= 3) {
        // Store in deferred_topics_v2 as topic_light (will auto-relaunch after bilan)
        const deferResult = deferSignal({
          tempMemory,
          machine_type: "topic_light",
          action_target: topicToStore.slice(0, 80),
          summary: topicToStore.slice(0, 100),
        })
        tempMemory = deferResult.tempMemory
        // Note: tempMemory update handled by caller (router) via returned state
        console.log(`[Router] Assistant defer captured to deferred_topics_v2: "${topicToStore}" (from=${formalizedFromDispatcher ? "dispatcher" : "fallback"})`)
      } else {
        console.log(`[Router] Assistant defer rejected - no valid topic`)
      }
    } catch (e) {
      console.error("[Router] deferred topic store failed (non-blocking):", e)
    }
  }

  // --- BILAN VERIFIER (global) ---
  if (checkupActive && !stopCheckup && targetMode !== "sentry" && targetMode !== "investigator") {
    try {
      if (targetMode === "watcher") return { responseContent, nextMode, tempMemory }
      const recentHistory = (history ?? []).slice(-15).map((m: any) => ({
        role: m?.role,
        content: m?.content,
        created_at: (m as any)?.created_at ?? null,
        agent_used: (m as any)?.agent_used ?? null,
      }))
      // During bilan, non-investigator agents must not claim tool ops; expose no tools.
      const tools_available: ToolDescriptor[] = []
      const draftBefore = responseContent
      await traceV("brain:verifier_start", "verifier", {
        verifier_kind: "verifier_1:bilan",
        agent: targetMode,
        draft_len: String(draftBefore ?? "").length,
        tools_executed: executedTools,
        tool_execution: toolExecution,
      }, "info")
      const verified = await verifyBilanAgentMessage({
        draft: responseContent,
        agent: targetMode,
        data: {
          user_message: userMessage,
          agent: targetMode,
          channel,
          investigation_state: state?.investigation_state ?? null,
          context_excerpt: (context ?? "").toString().slice(0, 2000),
          now_iso: new Date().toISOString(),
          recent_history: recentHistory,
          tools_available,
        },
        meta: {
          requestId: meta?.requestId,
          forceRealAi: meta?.forceRealAi,
          channel: meta?.channel,
          model:
            ((((globalThis as any)?.Deno?.env?.get?.("GEMINI_FALLBACK_MODEL") ?? "") as string).trim()) ||
            "gemini-2.5-flash",
          userId,
        },
      })
      responseContent = normalizeChatText(verified.text)
      await traceV("brain:verifier_done", "verifier", {
        verifier_kind: "verifier_1:bilan",
        agent: targetMode,
        rewritten: Boolean(verified.rewritten),
        violations_count: Array.isArray(verified.violations) ? verified.violations.length : null,
        violations: TRACE_VERBOSE ? (Array.isArray(verified.violations) ? verified.violations : []) : undefined,
        final_len: String(responseContent ?? "").length,
      }, "info")
      await logJudgeEvent({
        verifier_kind: "verifier_1:bilan",
        agent_used: targetMode,
        ok: null,
        rewritten: Boolean(verified.rewritten),
        issues: Array.isArray(verified.violations) ? verified.violations : [],
        mechanical_violations: [],
        draft: draftBefore,
        final_text: responseContent,
        metadata: { nCandidates: opts.nCandidates ?? 1 },
      })
    } catch (e) {
      console.error("[Router] bilan verifier failed (non-blocking):", e)
      await traceV("brain:verifier_error", "verifier", { verifier_kind: "verifier_1:bilan", message: String((e as any)?.message ?? e ?? "unknown").slice(0, 800) }, "warn")
    }
  }

  // --- POST-CHECKUP VERIFIER ---
  if (isPostCheckup && targetMode !== "sentry") {
    try {
      if (targetMode === "watcher") return { responseContent, nextMode, tempMemory }
      await traceV("brain:verifier_start", "verifier", {
        verifier_kind: "verifier_1:post_checkup",
        agent: targetMode,
        draft_len: String(responseContent ?? "").length,
      }, "info")
      const verified = await verifyPostCheckupAgentMessage({
        draft: responseContent,
        agent: targetMode,
        data: {
          user_message: userMessage,
          agent: targetMode,
          channel,
          post_checkup: true,
          investigation_state: state?.investigation_state ?? null,
          context_excerpt: (context ?? "").toString().slice(0, 2200),
        },
        meta: {
          requestId: meta?.requestId,
          forceRealAi: meta?.forceRealAi,
          channel: meta?.channel,
          model:
            ((((globalThis as any)?.Deno?.env?.get?.("GEMINI_FALLBACK_MODEL") ?? "") as string).trim()) ||
            "gemini-2.5-flash",
          userId,
        },
      })
      responseContent = normalizeChatText(verified.text)
      await traceV("brain:verifier_done", "verifier", {
        verifier_kind: "verifier_1:post_checkup",
        agent: targetMode,
        rewritten: Boolean(verified.rewritten),
        violations_count: Array.isArray(verified.violations) ? verified.violations.length : null,
        violations: TRACE_VERBOSE ? (Array.isArray(verified.violations) ? verified.violations : []) : undefined,
        final_len: String(responseContent ?? "").length,
      }, "info")
    } catch (e) {
      console.error("[Router] post_checkup verifier failed (non-blocking):", e)
      await traceV("brain:verifier_error", "verifier", { verifier_kind: "verifier_1:post_checkup", message: String((e as any)?.message ?? e ?? "unknown").slice(0, 800) }, "warn")
    }
  }

  await trace("brain:agent_exec_end", "agent", {
    target_mode: targetMode,
    next_mode: nextMode,
    response_len: String(responseContent ?? "").length,
    executed_tools: executedTools,
    tool_execution: toolExecution,
  }, "debug")

  return { responseContent, nextMode, tempMemory }
}

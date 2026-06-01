/// <reference path="../../tsserver-shims.d.ts" />

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getUserState, logMessage, updateUserState } from "../state-manager.ts";
import { clearMachineStateTempMemory } from "./magic_reset.ts";
import { clearToolSkillFlowForDirectReminder } from "./active_flow_state.ts";
import { attachPendingRecommendationOperation } from "./recommendation_runtime_support.ts";
import {
  buildTechniqueHistoryForSelector,
  readCoachingInterventionMemory,
  recordCoachingInterventionProposal,
} from "../coaching_intervention_tracking.ts";
import {
  buildCoachingHistorySnapshot,
  detectCoachingInterventionRender,
} from "../coaching_intervention_observability.ts";
import {
  applyRouterMomentumSignalsV2,
  readMomentumStateV2,
  summarizeMomentumStateForLog,
  writeMomentumStateV2,
} from "../momentum_state.ts";
import {
  buildRepairModeExitedPayload,
  deactivateRepairMode,
  evaluateRepairModeExit,
  readRepairMode,
  writeRepairMode,
} from "../repair_mode_engine.ts";
import { inferAndPersistRelationPreferences } from "../relation_preferences_engine.ts";
import { logMomentumStateObservability } from "../../_shared/momentum-observability.ts";
import { logMomentumUserReplyAfterOutreachIfRelevant } from "../../_shared/momentum-observability.ts";
import { logCoachingObservabilityEvent } from "../../_shared/coaching-observability.ts";
import { logV2Event, V2_EVENT_TYPES } from "../../_shared/v2-events.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { buildConversationPulse } from "../conversation_pulse_builder.ts";
import { clearOneShotKeys } from "./turn_context_runtime.ts";
import { persistConversationSkillRoute } from "./conversation_route_runtime_support.ts";
import { updateWeeklyAdaptiveReviewStateAfterConversationTurn } from "../skills/weekly_review/runtime.ts";
import { coachingDimensionForLog } from "./coaching_intervention_runtime_support.ts";
import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";

type TraceFn = (
  event: string,
  phase: BrainTracePhase,
  payload?: Record<string, unknown>,
  level?: "debug" | "info" | "warn" | "error",
) => Promise<void>;

function envBool(name: string, fallback: boolean): boolean {
  let raw = "";
  try {
    const denoEnv = (globalThis as any)?.Deno?.env;
    raw = String(denoEnv?.get?.(name) ?? "").trim().toLowerCase();
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envInt(name: string, fallback: number): number {
  let raw = "";
  try {
    const denoEnv = (globalThis as any)?.Deno?.env;
    raw = String(denoEnv?.get?.(name) ?? "").trim();
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function envString(name: string, fallback = ""): string {
  let raw = "";
  try {
    const denoEnv = (globalThis as any)?.Deno?.env;
    raw = String(denoEnv?.get?.(name) ?? "").trim();
  } catch {
    return fallback;
  }
  return raw || fallback;
}

export async function persistNormalReplyTurn(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel: "web" | "whatsapp";
  userMessage: string;
  history: any[];
  state: any;
  tempMemory: any;
  agentOut: any;
  responseContent: string;
  targetMode: string;
  riskScore: number;
  routeDecision: any;
  recommendationSkillOutput: ConversationSkillOutput | null;
  recommendationToolRun: ProductRecommendation | null;
  recommendationToolStats: Record<string, unknown> | null;
  recommendationSurfaceLabel: string | null;
  planItemSnapshot: V2PlanItemSnapshotItem[] | null | undefined;
  activeSkillState: unknown;
  conversationRiskForPersist: any;
  conversationRiskHistoryForPersist: unknown;
  memoryV2RuntimeTempMemory: Record<string, unknown> | null;
  consumedBilanStopped: boolean;
  dispatcherSignals: any;
  v2Runtime: any;
  userTime: any;
  normalConversationTurnTrace: Record<string, unknown> | null;
  checkupActive: boolean;
  stopCheckup: boolean;
  isPostCheckup: boolean;
  checkupIntentDetected: boolean;
  effectiveModeForModelSelection: string;
  agentModelSelection: {
    model: string;
    source: string;
    tier: string;
  };
  surfaceAddon: any;
  researchRequested: boolean;
  researchExecuted: boolean;
  researchQuery: string | null;
  researchSources: unknown[];
  researchText: string;
  researchSnippets: unknown[];
  researchError: string | null;
  researchDomainHint: string;
  researchLatencyMs?: number;
  needsResearchSignal: any;
  turnStartMs: number;
  dispatcherLatencyMs?: number;
  contextLoadResult: any;
  contextLatencyMs?: number;
  agentLatencyMs?: number;
  dispatcherV2Stats: Array<{ model_name?: string | null }>;
  combinedToolExecution: string;
  combinedExecutedTools: string[];
  coachingAttempt: any;
  requestId?: string | null;
  loggedMessageId: string | null;
  logMessages: boolean;
  messageMetadata?: Record<string, unknown>;
  trace: TraceFn;
}) {
  const {
    supabase,
    userId,
    scope,
    channel,
    userMessage,
    history,
    state,
    tempMemory,
    agentOut,
    responseContent,
    targetMode,
    riskScore,
    routeDecision,
    recommendationSkillOutput,
    recommendationToolRun,
    recommendationToolStats,
    recommendationSurfaceLabel,
    planItemSnapshot,
    activeSkillState,
    conversationRiskForPersist,
    conversationRiskHistoryForPersist,
    memoryV2RuntimeTempMemory,
    consumedBilanStopped,
    dispatcherSignals,
    v2Runtime,
    userTime,
    normalConversationTurnTrace,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    checkupIntentDetected,
    effectiveModeForModelSelection,
    agentModelSelection,
    surfaceAddon,
    researchRequested,
    researchExecuted,
    researchQuery,
    researchSources,
    researchText,
    researchSnippets,
    researchError,
    researchDomainHint,
    researchLatencyMs,
    needsResearchSignal,
    turnStartMs,
    dispatcherLatencyMs,
    contextLoadResult,
    contextLatencyMs,
    agentLatencyMs,
    dispatcherV2Stats,
    combinedToolExecution,
    combinedExecutedTools,
    coachingAttempt,
    requestId,
    loggedMessageId,
    logMessages,
    messageMetadata,
    trace,
  } = args;
  const nextMode = agentOut.nextMode;
  const coachingAddonUsed = (tempMemory as any)
    ?.__coaching_intervention_addon ?? null;
  const coachingRenderAudit = detectCoachingInterventionRender({
    addon: coachingAddonUsed,
    responseContent,
  });
  if (coachingAddonUsed) {
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: requestId ?? undefined,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_intervention_rendered",
      payload: {
        momentum_state: readMomentumStateV2(tempMemory).current_state ?? null,
        trigger_type: coachingAddonUsed.trigger_kind,
        blocker_type: coachingAddonUsed.blocker_type,
        confidence: coachingAddonUsed.confidence,
        eligible: coachingAddonUsed.eligible,
        recommended_technique: coachingAddonUsed.recommended_technique,
        candidate_techniques: coachingAddonUsed.technique_candidates,
        follow_up_needed: coachingAddonUsed.follow_up_needed,
        blocker_kind: coachingAttempt?.input?.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAddonUsed.target_plan_item?.dimension,
        ),
        item_kind: coachingAddonUsed.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAddonUsed.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAddonUsed.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAddonUsed.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt?.input?.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt?.input?.v2_momentum?.load_balance ??
          null,
        coaching_scope: coachingAddonUsed.coaching_scope ?? null,
        simplify_instead: coachingAddonUsed.simplify_instead ?? false,
        dimension_strategy: coachingAddonUsed.dimension_strategy ?? null,
        customization_context: {
          target_action_title: coachingAddonUsed.target_action_title ?? null,
          message_angle: coachingAddonUsed.message_angle ?? null,
          intensity: coachingAddonUsed.intensity ?? null,
          selector_source: coachingAddonUsed.selector_source,
        },
        rendered: coachingRenderAudit.rendered,
        render_confidence: coachingRenderAudit.render_confidence,
        render_signal: coachingRenderAudit.render_signal,
        technique_signal_detected:
          coachingRenderAudit.technique_signal_detected,
        response_excerpt: coachingRenderAudit.response_excerpt,
      },
    });
  }

  let llmRetryJobId: string | null = null;
  if (agentOut.outageFallback) {
    llmRetryJobId = await enqueueLlmRetryJob({
      supabase,
      userId,
      scope,
      channel,
      userMessage,
      investigationActive: checkupActive || isPostCheckup,
      requestId: requestId ?? undefined,
      reason: `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
    });
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      severity: "warn",
      title: "router_outage_fallback",
      error: agentOut.outageErrorMessage ??
        `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
      requestId: requestId ?? null,
      userId,
      source: channel,
      metadata: {
        scope,
        target_mode: targetMode,
        next_mode: nextMode,
        outage_fallback: true,
        outage_failed_mode: agentOut.outageFailedMode ?? null,
        outage_error_message: agentOut.outageErrorMessage ?? null,
        llm_retry_job_id: llmRetryJobId,
      },
    });
  }

  let mergedTempMemory = agentOut.tempMemory ?? tempMemory;
  try {
    const latest = await getUserState(supabase, userId, scope);
    mergedTempMemory = {
      ...((latest as any)?.temp_memory ?? {}),
      ...(agentOut.tempMemory ?? {}),
    };
  } catch {
    // keep current mergedTempMemory
  }
  if (
    routeDecision?.reason_code ===
      "explicit_one_shot_reminder_supersedes_tool_flow" ||
    routeDecision?.reason_code ===
      "explicit_direct_effect_supersedes_pending_confirmation"
  ) {
    mergedTempMemory = clearToolSkillFlowForDirectReminder(mergedTempMemory);
  }
  if (conversationRiskForPersist?.should_exit_flows) {
    const { tempMemory: cleared } = clearMachineStateTempMemory({
      tempMemory: mergedTempMemory,
    });
    mergedTempMemory = cleared;
  }
  if (conversationRiskForPersist) {
    mergedTempMemory = {
      ...(mergedTempMemory ?? {}),
      __conversation_risk_history: conversationRiskHistoryForPersist,
      __conversation_risk_last: {
        score: conversationRiskForPersist.score,
        threshold: conversationRiskForPersist.threshold,
        should_exit_flows: conversationRiskForPersist.should_exit_flows,
        reason_codes: conversationRiskForPersist.reason_codes,
        flow_exit_context: conversationRiskForPersist.flow_exit_context ?? null,
        at: new Date().toISOString(),
      },
    };
  }
  if (memoryV2RuntimeTempMemory) {
    mergedTempMemory = {
      ...mergedTempMemory,
      __active_topic_state_v2:
        (memoryV2RuntimeTempMemory as any).__active_topic_state_v2 ??
          (mergedTempMemory as any).__active_topic_state_v2,
      __memory_payload_state_v2:
        (memoryV2RuntimeTempMemory as any).__memory_payload_state_v2 ??
          (mergedTempMemory as any).__memory_payload_state_v2,
    };
  }

  mergedTempMemory = attachPendingRecommendationOperation({
    tempMemory: mergedTempMemory,
    recommendation: recommendationToolRun,
    surfaceLabel: recommendationSurfaceLabel,
    planItemSnapshot,
    requestId: requestId ?? null,
  });

  const coachingMemoryBeforeProposal = readCoachingInterventionMemory(
    mergedTempMemory,
  );
  mergedTempMemory = recordCoachingInterventionProposal({
    tempMemory: mergedTempMemory,
    addon: coachingAddonUsed,
  });
  const coachingMemoryAfterProposal = readCoachingInterventionMemory(
    mergedTempMemory,
  );
  if (
    coachingAddonUsed?.decision === "propose" &&
    coachingMemoryAfterProposal.pending &&
    coachingMemoryAfterProposal.pending.intervention_id !==
      coachingMemoryBeforeProposal.pending?.intervention_id
  ) {
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: requestId ?? undefined,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_intervention_proposed",
      payload: {
        momentum_state: readMomentumStateV2(mergedTempMemory).current_state ??
          null,
        trigger_type: coachingAddonUsed.trigger_kind,
        blocker_type: coachingAddonUsed.blocker_type,
        confidence: coachingAddonUsed.confidence,
        eligible: coachingAddonUsed.eligible,
        recommended_technique: coachingAddonUsed.recommended_technique,
        candidate_techniques: coachingAddonUsed.technique_candidates,
        follow_up_needed: coachingAddonUsed.follow_up_needed,
        intervention_id: coachingMemoryAfterProposal.pending.intervention_id,
        follow_up_due_at:
          coachingMemoryAfterProposal.pending.follow_up_due_at ?? null,
        blocker_kind: coachingAttempt?.input?.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAddonUsed.target_plan_item?.dimension,
        ),
        item_kind: coachingAddonUsed.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAddonUsed.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAddonUsed.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAddonUsed.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt?.input?.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt?.input?.v2_momentum?.load_balance ??
          null,
        coaching_scope: coachingAddonUsed.coaching_scope ?? null,
        simplify_instead: coachingAddonUsed.simplify_instead ?? false,
        dimension_strategy: coachingAddonUsed.dimension_strategy ?? null,
        history_snapshot: buildCoachingHistorySnapshot(
          buildTechniqueHistoryForSelector(mergedTempMemory),
        ),
        customization_context: {
          target_action_title: coachingAddonUsed.target_action_title ?? null,
          message_angle: coachingAddonUsed.message_angle ?? null,
          intensity: coachingAddonUsed.intensity ?? null,
          selector_source: coachingAddonUsed.selector_source,
        },
      },
    });
  }

  clearOneShotKeys(mergedTempMemory, consumedBilanStopped);
  mergedTempMemory = persistConversationSkillRoute(
    mergedTempMemory,
    routeDecision,
    recommendationSkillOutput,
  );
  mergedTempMemory = updateWeeklyAdaptiveReviewStateAfterConversationTurn({
    tempMemory: mergedTempMemory,
    activeSkillState,
    userMessage,
    responseContent,
    routeDecision,
  });

  const previousMomentumState = readMomentumStateV2(mergedTempMemory);
  const previousRepairMode = readRepairMode(mergedTempMemory);
  const momentumState = applyRouterMomentumSignalsV2({
    tempMemory: mergedTempMemory,
    userMessage,
    dispatcherSignals,
    nowIso: new Date().toISOString(),
  });
  mergedTempMemory = writeMomentumStateV2(mergedTempMemory, momentumState);

  let repairModeExitPayload:
    | ReturnType<typeof buildRepairModeExitedPayload>
    | null = null;
  if (previousRepairMode.active) {
    const latestResponseQuality =
      momentumState._internal.metrics_cache.last_user_turn_quality ??
        momentumState._internal.signal_log.response_quality_events.at(-1)
          ?.quality ??
        "minimal";
    const repairExit = evaluateRepairModeExit(previousRepairMode, {
      responseQuality: latestResponseQuality,
      consentLevel: momentumState.dimensions.consent.level,
    });
    let nextRepairMode = repairExit.updatedState;
    if (repairExit.shouldExit && repairExit.reason) {
      const enteredAtMs = previousRepairMode.entered_at
        ? Date.parse(previousRepairMode.entered_at)
        : Number.NaN;
      const durationMs = Number.isFinite(enteredAtMs)
        ? Math.max(0, Date.now() - enteredAtMs)
        : 0;
      repairModeExitPayload = buildRepairModeExitedPayload({
        userId,
        cycleId: v2Runtime?.cycle?.id ?? null,
        transformationId: v2Runtime?.transformation?.id ?? null,
        reason: repairExit.reason,
        reopenSignalsCount: repairExit.updatedState.reopen_signals_count,
        durationMs,
      });
      nextRepairMode = deactivateRepairMode(repairExit.updatedState);
    }
    mergedTempMemory = writeRepairMode(mergedTempMemory, nextRepairMode);
  }

  const nextMsgCount = Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
  const nextLastInteraction = new Date().toISOString();

  await updateUserState(supabase, userId, scope, {
    current_mode: nextMode,
    unprocessed_msg_count: nextMsgCount,
    last_interaction_at: nextLastInteraction,
    temp_memory: mergedTempMemory,
  });
  await logMomentumStateObservability({
    supabase,
    userId,
    requestId: requestId ?? null,
    turnId: loggedMessageId,
    channel,
    scope,
    source: "router",
    previous: previousMomentumState as any,
    next: momentumState as any,
  });
  await logMomentumUserReplyAfterOutreachIfRelevant({
    supabase,
    userId,
    requestId: requestId ?? null,
    channel,
    scope,
    userMessage,
    stateBeforeReply: previousMomentumState.current_state ?? null,
    stateAfterReply: momentumState.current_state ?? null,
  });
  if (repairModeExitPayload) {
    try {
      await logV2Event(
        supabase,
        V2_EVENT_TYPES.REPAIR_MODE_EXITED,
        repairModeExitPayload,
      );
    } catch (error) {
      console.warn("[Router] repair_mode_exited_v2 log failed:", error);
    }
  }
  try {
    await inferAndPersistRelationPreferences({
      supabase,
      userId,
      timezone: userTime?.user_timezone ?? "Europe/Paris",
      nowIso: nextLastInteraction,
    });
  } catch (error) {
    console.warn("[Router] relation preferences inference failed:", error);
  }
  const coachingMemory = readCoachingInterventionMemory(mergedTempMemory);

  if (logMessages) {
    await logMessage(
      supabase,
      userId,
      scope,
      "assistant",
      responseContent,
      nextMode,
      {
        ...(messageMetadata ?? {}),
        channel,
        request_id: requestId ?? null,
        router_decision_v2: {
          target_mode: targetMode,
          next_mode: nextMode,
          risk_score: riskScore,
          conversation_risk_score: conversationRiskForPersist?.score ?? null,
          conversation_risk_exit_flows:
            conversationRiskForPersist?.should_exit_flows ?? false,
          checkup_active: checkupActive,
          stop_checkup: stopCheckup,
          safety_level: dispatcherSignals.safety.level,
          interrupt_kind: dispatcherSignals.interrupt.kind,
          agent_model: agentModelSelection.model,
          agent_model_source: agentModelSelection.source,
          agent_model_tier: agentModelSelection.tier,
          research_requested: researchRequested,
          research_executed: researchExecuted,
          research_query: researchRequested ? researchQuery : null,
          research_sources_count: researchSources.length,
          surface_id: surfaceAddon?.surface_id ?? null,
          surface_level: surfaceAddon?.level ?? null,
          llm_retry_queued: Boolean(llmRetryJobId),
          llm_retry_job_id: llmRetryJobId,
          outage_fallback: Boolean(agentOut.outageFallback),
          outage_failed_mode: agentOut.outageFailedMode ?? null,
          outage_error: agentOut.outageErrorMessage ?? null,
          coaching_intervention_pending: coachingMemory.pending,
        },
      },
    );
  }

  await trace("routing_decision_summary", "routing", {
    target_mode: targetMode,
    next_mode: nextMode,
    risk_score: riskScore,
    conversation_risk_score: conversationRiskForPersist?.score ?? null,
    conversation_risk_exit_flows:
      conversationRiskForPersist?.should_exit_flows ?? false,
    checkup_active: checkupActive,
    stop_checkup: stopCheckup,
    checkup_intent_detected: checkupIntentDetected,
    effective_mode_for_model: effectiveModeForModelSelection,
    agent_model: agentModelSelection.model,
    agent_model_source: agentModelSelection.source,
    agent_model_tier: agentModelSelection.tier,
    surface_id: surfaceAddon?.surface_id ?? null,
    surface_level: surfaceAddon?.level ?? null,
    momentum_state: momentumState.current_state ?? null,
    momentum_summary: summarizeMomentumStateForLog(momentumState),
  }, "info");

  try {
    await persistTurnSummaryLog({
      supabase,
      config: {
        awaitEnabled: envBool("SOPHIA_TURN_SUMMARY_DB_AWAIT", false),
        timeoutMs: envInt("SOPHIA_TURN_SUMMARY_DB_TIMEOUT_MS", 1200),
        retries: envInt("SOPHIA_TURN_SUMMARY_DB_RETRIES", 1),
      },
      metrics: {
        request_id: requestId ?? null,
        user_id: userId,
        channel,
        scope,
        latency_ms: {
          total: Date.now() - turnStartMs,
          dispatcher: dispatcherLatencyMs,
          context: contextLoadResult?.metrics?.load_ms ?? contextLatencyMs,
          agent: agentLatencyMs,
        },
        dispatcher: {
          model: String(
            dispatcherV2Stats[0]?.model_name ??
              envString("SOPHIA_DISPATCHER_MODEL", "gpt-5.4-mini"),
          ).trim(),
          signals: {
            safety: String(dispatcherSignals.safety.level ?? "NONE"),
            interrupt: String(dispatcherSignals.interrupt.kind ?? "NONE"),
          },
        },
        context: {
          profile: String(targetMode),
          elements: contextLoadResult?.metrics?.elements_loaded ?? [],
          tokens: contextLoadResult?.metrics?.estimated_tokens ?? undefined,
        },
        routing: {
          target_dispatcher: targetMode,
          target_initial: targetMode,
          target_final: nextMode,
          risk_score: riskScore,
        },
        agent: {
          model: agentModelSelection.model,
          model_source: agentModelSelection.source,
          model_tier: agentModelSelection.tier,
          effective_mode: effectiveModeForModelSelection,
          outcome: combinedToolExecution !== "none" ? "tool_call" : "text",
          tool: combinedExecutedTools[0] ?? null,
        },
        research: {
          requested: researchRequested,
          executed: researchExecuted,
          confidence: Number(needsResearchSignal?.confidence ?? 0),
          query: researchRequested ? researchQuery : null,
          domain_hint: researchDomainHint || null,
          latency_ms: researchLatencyMs,
          has_text: Boolean(researchText),
          snippets_count: researchSnippets.length,
          sources_count: researchSources.length,
          error: researchError,
        },
        state_flags: {
          checkup_active: checkupActive,
          toolflow_active: false,
          supervisor_stack_top: String(
            (mergedTempMemory as any)?.__toolflow_owner?.machine_type ?? "",
          ),
        },
        details: {
          source: "sophia-brain/router/normal_reply_persistence_pipeline.ts",
          channel,
          tool_execution: combinedToolExecution,
          executed_tools: combinedExecutedTools,
          tool_ack: agentOut.toolAck ?? null,
          selected_surface_id: surfaceAddon?.surface_id ?? null,
          selected_surface_level: surfaceAddon?.level ?? null,
          recommendation_tool_run: recommendationToolRun
            ? {
              recommendation: recommendationToolRun,
              stats: recommendationToolStats,
              skill_output: recommendationSkillOutput,
            }
            : recommendationToolStats
            ? { stats: recommendationToolStats }
            : null,
          outage_fallback: Boolean(agentOut.outageFallback),
          outage_failed_mode: agentOut.outageFailedMode ?? null,
          outage_error: agentOut.outageErrorMessage ?? null,
          llm_retry_queued: Boolean(llmRetryJobId),
          llm_retry_job_id: llmRetryJobId,
          momentum: summarizeMomentumStateForLog(momentumState),
          coaching_intervention_pending: coachingMemory.pending,
        },
        aborted: false,
      },
    });
  } catch (e) {
    console.warn("[Router] persistTurnSummaryLog failed (non-blocking):", e);
  }

  const conversationTurnCount =
    history.filter((entry) =>
      entry && typeof entry === "object" && entry.role === "user"
    ).length + 1;
  if (conversationTurnCount >= 3 && v2Runtime?.cycle) {
    buildConversationPulse({
      supabase,
      userId,
      requestId: requestId ?? undefined,
      source: "router_end_of_turn",
    }).catch((e) => {
      console.warn("[Router] buildConversationPulse failed (non-blocking):", e);
    });
  }

  return {
    content: responseContent,
    mode: nextMode,
    tool_execution: combinedToolExecution,
    executed_tools: combinedExecutedTools,
    conversation_turn_trace: normalConversationTurnTrace,
  };
}

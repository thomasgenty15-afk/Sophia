/// <reference path="../../tsserver-shims.d.ts" />

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import { logMessage, updateUserState } from "../state-manager.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { SafetyPregateOutput } from "../safety/safety_pregate.ts";
import type { DispatcherRunStats } from "../dispatcher/dispatcher.v2.ts";
import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import {
  type EffectLedger,
  recordBlockedEffect,
  rewriteUncommittedEffectClaims,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import {
  type OperationRuntimeResult,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import type { TurnAgendaSummary } from "./turn_agenda.ts";
import {
  DEFAULT_DISPATCHER_MEMORY_PLAN,
  isCheckupActive,
} from "./turn_context_runtime.ts";
import {
  applyCoachResponseStylePreferences,
  loadCoachResponseStylePreferences,
  userRequestsShortStyle,
} from "./response_style_policy.ts";
import { ensureVisibleSophiaEmoji } from "./response_visibility_formatting.ts";
import { effectiveResponseOwnerForOperationRuntime } from "./operation_response_owner.ts";
import {
  applyWeeklyConcreteOrganizationGuard,
  cleanWeeklyVisibleResponse,
  markWeeklyAdaptiveReviewAdjustPlanApplied,
  weeklyAdaptiveReviewStateForTurn,
  weeklyReturnAfterAdjustmentMessage,
} from "../skills/weekly_review/runtime.ts";

type TraceFn = (
  event: string,
  phase: BrainTracePhase,
  payload?: Record<string, unknown>,
  level?: "debug" | "info" | "warn" | "error",
) => Promise<void>;

export type OperationRuntimeResponseHandlerResult = {
  content: string;
  additional_contents: string[];
  mode: AgentMode;
  tool_execution: OperationRuntimeResult["toolExecution"];
  executed_tools: string[];
  conversation_turn_trace: Record<string, unknown> | null;
};

export function routeDecisionForOperationTrace(args: {
  routeDecision: RouteDecision;
  toolSkillRun?: unknown;
}): RouteDecision {
  const selectedHandler = String(
    (args.toolSkillRun as any)?.selected_handler ?? "",
  ).trim();
  if (!selectedHandler) return args.routeDecision;
  return {
    ...args.routeDecision,
    response_owner: "tool_skill",
    selected_handler: selectedHandler,
  };
}

function operationRuntimeSucceededWithChatEffect(
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools"
  >,
): boolean {
  if (operationRuntime.toolExecution !== "success") return false;
  return operationRuntime.executedTools.some((tool) =>
    tool === "create_one_shot_reminder" ||
    tool === "cancel_one_shot_reminder" ||
    tool === "track_progress_plan_item"
  );
}

function platformHandoffQuestion(operationType: string): string | null {
  switch (operationType) {
    case "prepare_attack_card":
      return "Maintenant, pour la carte d'attaque, c'est pour quelle action ?";
    case "prepare_defense_card":
      return "Maintenant, pour la carte de défense, c'est pour quel moment de risque ?";
    case "adjust_plan_item":
      return "Maintenant, pour l'ajustement du plan, tu veux changer quoi en priorité ?";
    case "select_state_potion":
      return "Maintenant, pour la potion, tu veux viser quel état ?";
    case "create_recurring_reminder":
      return "Maintenant, pour le rappel récurrent, tu veux quel rythme ?";
    default:
      return null;
  }
}

function uncoveredDirectEffectSuffix(args: {
  turnFrame: TurnFrame | null;
  userMessage: string;
}): string | null {
  const message = String(args.userMessage ?? "");
  if (!message.trim()) return null;
  for (const effect of args.turnFrame?.direct_effects ?? []) {
    const hint = effect.payload_hint && typeof effect.payload_hint === "object"
      ? (effect.payload_hint as Record<string, unknown>).raw_text
      : null;
    const covered = String(hint ?? "").trim();
    if (!covered || covered.length < 12) continue;
    const index = message.indexOf(covered);
    if (index < 0) continue;
    const suffix = message.slice(index + covered.length)
      .replace(/^[\s,.;:!?]+/, "")
      .trim();
    if (suffix.length >= 12) return suffix.slice(0, 180);
  }
  return null;
}

function appendUncoveredMessageFollowup(args: {
  content: string;
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools"
  >;
  turnFrame: TurnFrame | null;
  userMessage: string;
}): string {
  const content = String(args.content ?? "").trim();
  if (!content) return content;
  if (!operationRuntimeSucceededWithChatEffect(args.operationRuntime)) {
    return content;
  }
  const suffix = uncoveredDirectEffectSuffix({
    turnFrame: args.turnFrame,
    userMessage: args.userMessage,
  });
  if (!suffix || content.includes(suffix)) return content;
  return `${content}\n\nJe garde aussi la suite : « ${suffix} ». Tu veux qu'on la traite maintenant ?`;
}

export function appendAgendaPlatformHandoffFollowup(args: {
  content: string;
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools"
  >;
  routeDecision: RouteDecision | null;
  turnAgendaSummary: TurnAgendaSummary | null;
  turnFrame?: TurnFrame | null;
  userMessage?: string;
}): string {
  const content = String(args.content ?? "").trim();
  if (!content) return content;
  if (
    !operationRuntimeSucceededWithChatEffect(
      args.operationRuntime,
    )
  ) {
    return content;
  }
  const selectedHandler = String(args.routeDecision?.selected_handler ?? "")
    .trim();
  const handoffTask = args.turnAgendaSummary?.tasks.find((task) => {
    const operation = String(task.operation_type ?? "").trim();
    return task.kind === "platform_handoff" &&
      operation &&
      operation !== selectedHandler &&
      task.status !== "blocked" &&
      task.status !== "cancelled" &&
      task.status !== "superseded";
  });
  if (!handoffTask && args.turnFrame && args.userMessage) {
    return appendUncoveredMessageFollowup({
      content,
      operationRuntime: args.operationRuntime,
      turnFrame: args.turnFrame,
      userMessage: args.userMessage,
    });
  }
  const question = platformHandoffQuestion(
    String(handoffTask?.operation_type ?? ""),
  );
  if (!question || content.includes(question)) return content;
  return `${content}\n\n${question}`;
}

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

export async function handleOperationRuntimeResponse(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel: "web" | "whatsapp";
  userMessage: string;
  history: any[];
  state: any;
  activeSkillState: unknown;
  operationRuntime: OperationRuntimeResult;
  effectLedger: EffectLedger;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  turnAgendaSummary: TurnAgendaSummary | null;
  safetyPregateOutput: SafetyPregateOutput;
  weeklyReviewStateForTurn: unknown;
  dispatcherSignals: DispatcherSignals;
  dispatcherV2Stats: DispatcherRunStats[];
  dispatcherLatencyMs?: number;
  targetMode: AgentMode;
  riskScore: number;
  loggedMessageId: string | null;
  requestId?: string | null;
  messageMetadata?: Record<string, unknown>;
  logMessages: boolean;
  turnStartMs: number;
  trace: TraceFn;
}): Promise<OperationRuntimeResponseHandlerResult> {
  const {
    supabase,
    userId,
    scope,
    channel,
    userMessage,
    history,
    state,
    activeSkillState,
    operationRuntime,
    effectLedger,
    turnFrame,
    routeDecision,
    turnAgendaSummary,
    safetyPregateOutput,
    weeklyReviewStateForTurn,
    dispatcherSignals,
    dispatcherV2Stats,
    dispatcherLatencyMs,
    targetMode,
    riskScore,
    loggedMessageId,
    requestId,
    messageMetadata,
    logMessages,
    turnStartMs,
    trace,
  } = args;

  recordToolSkillEffectsInLedger({
    ledger: effectLedger,
    toolSkillRun: operationRuntime.toolSkillRun,
    toolExecution: operationRuntime.toolExecution,
  });

  const nextMode: AgentMode = "companion";
  const nextMsgCount = Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
  const nextLastInteraction = new Date().toISOString();
  let nextTempMemory = operationRuntime.nextTempMemory ?? {};
  const weeklyReviewStateAfterOperation = weeklyReviewStateForTurn ??
    weeklyAdaptiveReviewStateForTurn({
      activeSkillState,
      tempMemory: nextTempMemory,
    });
  nextTempMemory = markWeeklyAdaptiveReviewAdjustPlanApplied({
    tempMemory: nextTempMemory,
    weeklyState: weeklyReviewStateAfterOperation,
    operationRuntime,
    userMessage,
    assistantSummary: operationRuntime.content,
  });

  const weeklyReturnMessage = operationRuntime.toolExecution === "success" &&
      operationRuntime.executedTools.includes("adjust_plan_item") &&
      weeklyReviewStateAfterOperation
    ? weeklyReturnAfterAdjustmentMessage(userMessage)
    : null;
  const rawOperationRuntimeContentBeforeAgenda = weeklyReturnMessage
    ? `${operationRuntime.content}\n\n${weeklyReturnMessage}`
    : operationRuntime.content;
  const rawOperationRuntimeContent = appendAgendaPlatformHandoffFollowup({
    content: rawOperationRuntimeContentBeforeAgenda,
    operationRuntime,
    routeDecision,
    turnAgendaSummary,
    turnFrame,
    userMessage,
  });
  const weeklyCleanedOperationRuntimeContent = weeklyReviewStateAfterOperation
    ? applyWeeklyConcreteOrganizationGuard({
      responseContent: cleanWeeklyVisibleResponse(rawOperationRuntimeContent),
      userMessage,
      activeSkillState: weeklyReviewStateAfterOperation,
      tempMemory: nextTempMemory,
      history,
    })
    : rawOperationRuntimeContent;

  const operationResponseStylePreferences =
    await loadCoachResponseStylePreferences({ supabase, userId });
  const styledOperationRuntimeContent = applyCoachResponseStylePreferences({
    userMessage,
    responseContent: weeklyCleanedOperationRuntimeContent,
    preferences: operationResponseStylePreferences,
  });
  let operationRuntimeContent = userRequestsShortStyle(userMessage) &&
      operationResponseStylePreferences.noEmoji
    ? styledOperationRuntimeContent
    : ensureVisibleSophiaEmoji(styledOperationRuntimeContent);

  const operationClaimRewrite = rewriteUncommittedEffectClaims({
    reply: operationRuntimeContent,
    ledger: effectLedger,
  });
  if (operationClaimRewrite.changed) {
    operationRuntimeContent = operationClaimRewrite.reply;
    recordBlockedEffect(effectLedger, {
      effect_id: `${effectLedger.turn_id}:guard:${
        operationClaimRewrite.reason_codes.join("+")
      }`,
      effect_type: "final_reply.claim",
      source: "guard",
      reason_code: operationClaimRewrite.reason_codes.join(","),
      payload_summary: {
        reason_codes: operationClaimRewrite.reason_codes,
      },
    });
  }

  const operationRuntimeAdditionalContents = (
    operationRuntime.additionalContents ?? []
  ).map((content: string) =>
    ensureVisibleSophiaEmoji(
      weeklyReviewStateAfterOperation
        ? cleanWeeklyVisibleResponse(content)
        : content,
    )
  );

  await updateUserState(supabase, userId, scope, {
    current_mode: nextMode,
    unprocessed_msg_count: nextMsgCount,
    last_interaction_at: nextLastInteraction,
    temp_memory: nextTempMemory,
  });

  if (logMessages) {
    const assistantContents = [
      operationRuntimeContent,
      ...operationRuntimeAdditionalContents,
    ].map((content) => String(content ?? "").trim()).filter(Boolean);
    for (const [index, content] of assistantContents.entries()) {
      await logMessage(
        supabase,
        userId,
        scope,
        "assistant",
        content,
        nextMode,
        {
          ...(messageMetadata ?? {}),
          channel,
          request_id: requestId ?? null,
          multi_message_index: index,
          multi_message_count: assistantContents.length,
          router_decision_v2: {
            target_mode: targetMode,
            next_mode: nextMode,
            risk_score: riskScore,
            safety_level: dispatcherSignals.safety.level,
            tool_skill_runtime: operationRuntime.toolSkillRun,
          },
        },
      );
    }
  }

  const traceRouteDecision = turnFrame && routeDecision
    ? routeDecisionForOperationTrace({
      routeDecision,
      toolSkillRun: operationRuntime.toolSkillRun,
    })
    : null;
  const effectiveResponseOwner = turnFrame && traceRouteDecision
    ? effectiveResponseOwnerForOperationRuntime({
      routeDecision: traceRouteDecision,
      toolSkillRun: operationRuntime.toolSkillRun,
    })
    : "normal_reply";
  const operationConversationTurnTrace = turnFrame && traceRouteDecision
    ? {
      turn_frame: turnFrame,
      route_decision: traceRouteDecision,
      turn_agenda_summary: turnAgendaSummary,
      tool_skill_run: {
        selected_handler: traceRouteDecision.selected_handler ?? null,
        reason_code: traceRouteDecision.reason_code,
        ...operationRuntime.toolSkillRun,
      },
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      response_owner: effectiveResponseOwner,
    }
    : null;

  if (turnFrame && traceRouteDecision) {
    try {
      const dispatcherV2Stat = dispatcherV2Stats[0];
      await logConversationTurn({
        turn_id: turnFrame.turn_id,
        user_id: userId,
        source_message_id: turnFrame.source_message_id,
        ts: new Date().toISOString(),
        safety_pregate: safetyPregateOutput,
        dispatcher_run: {
          latency_ms: dispatcherV2Stat?.latency_ms ?? 0,
          tokens_in: dispatcherV2Stat?.tokens_in ?? 0,
          tokens_out: dispatcherV2Stat?.tokens_out ?? 0,
          prompt_version: dispatcherV2Stat?.prompt_version ??
            "dispatcher_v2_prompt_2026_05_s12",
          model_used: dispatcherV2Stats[0]?.model_name ?? null,
          memory_plan: turnFrame?.memory_plan ?? DEFAULT_DISPATCHER_MEMORY_PLAN,
          turn_agenda_summary: turnAgendaSummary,
        },
        turn_frame: turnFrame,
        route_decision: traceRouteDecision,
        direct_effects: operationRuntime.executedTools.map((toolId) => ({
          tool_id: toolId,
          outcome: operationRuntime.toolExecution,
        })),
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        tool_skill_run: {
          selected_handler: traceRouteDecision.selected_handler ?? null,
          reason_code: traceRouteDecision.reason_code,
          ...operationRuntime.toolSkillRun,
        },
        confirmation_token_outcomes: [],
        memory_write_candidates_emitted: 0,
        response_owner: effectiveResponseOwner,
        total_latency_ms: Date.now() - turnStartMs,
      }, { supabase });
    } catch (error) {
      console.warn(
        "[Router] operation logConversationTurn failed (non-blocking):",
        error,
      );
    }
  }

  const operationLedgerPersistence = await persistEffectLedgerForTurn({
    supabase,
    ledger: effectLedger,
    userId,
    sourceMessageId: turnFrame?.source_message_id ?? loggedMessageId ?? null,
    requestId: requestId ?? null,
    channel,
    scope,
    nowIso: new Date().toISOString(),
  });
  if (
    !operationLedgerPersistence.persisted && operationLedgerPersistence.error
  ) {
    console.warn(
      "[Router] operation persistEffectLedgerForTurn failed (non-blocking):",
      operationLedgerPersistence.error,
    );
    await trace("brain:effect_ledger_persist_failed", "routing", {
      destination: operationLedgerPersistence.destination,
      entries_count: operationLedgerPersistence.entries_count,
      error: operationLedgerPersistence.error,
    }, "warn");
  }

  await trace("routing_decision_summary", "routing", {
    target_mode: targetMode,
    next_mode: nextMode,
    risk_score: riskScore,
    tool_skill_runtime: operationRuntime.toolSkillRun,
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
          context: 0,
          agent: 0,
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
          elements: ["tool_skill_runtime"],
        },
        routing: {
          target_dispatcher: targetMode,
          target_initial: targetMode,
          target_final: nextMode,
          risk_score: riskScore,
        },
        agent: {
          model: "tool_skill_runtime",
          model_source: "tool_skill_router",
          model_tier: "local",
          effective_mode: nextMode,
          outcome: operationRuntime.toolExecution === "success"
            ? "tool_call"
            : "text",
          tool: operationRuntime.executedTools[0] ?? null,
        },
        research: {
          requested: false,
          executed: false,
          confidence: 0,
          query: null,
          domain_hint: null,
          has_text: false,
          snippets_count: 0,
          sources_count: 0,
          error: null,
        },
        state_flags: {
          checkup_active: isCheckupActive(state),
          toolflow_active: true,
          supervisor_stack_top: "create_recurring_reminder",
        },
        details: {
          source: "sophia-brain/router/operation_runtime_response_handler.ts",
          channel,
          tool_execution: operationRuntime.toolExecution,
          executed_tools: operationRuntime.executedTools,
          tool_skill_runtime: operationRuntime.toolSkillRun,
        },
        aborted: false,
      },
    });
  } catch (e) {
    console.warn(
      "[Router] operation persistTurnSummaryLog failed (non-blocking):",
      e,
    );
  }

  return {
    content: operationRuntimeContent,
    additional_contents: operationRuntimeAdditionalContents,
    mode: nextMode,
    tool_execution: operationRuntime.toolExecution,
    executed_tools: operationRuntime.executedTools,
    conversation_turn_trace: operationConversationTurnTrace,
  };
}

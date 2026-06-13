/// <reference path="../../tsserver-shims.d.ts" />

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import type { AgentMode } from "../state-manager.ts";
import { logMessage, updateUserState } from "../state-manager.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { SafetySignalContext } from "../safety/safety_context.ts";
import type { DispatcherRunStats } from "../dispatcher/dispatcher.v2.ts";
import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import {
  type EffectLedger,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import {
  type OperationRuntimeResult,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import {
  DEFAULT_DISPATCHER_MEMORY_PLAN,
  isCheckupActive,
} from "./turn_context_runtime.ts";
import {
  ensureVisibleSophiaEmoji,
  stripHiddenHtmlComments,
} from "./response_visibility_formatting.ts";
import { effectiveResponseOwnerForOperationRuntime } from "./operation_response_owner.ts";
import {
  committedEffectsToConfirmFromToolSkillRun,
} from "./direct_effect_local_context.ts";
import { clearActiveToolFlow } from "./active_flow_state.ts";
import {
  cleanWeeklyVisibleResponse,
  isWeeklyAdaptiveReviewActive,
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

export function appendOperationFollowup(args: {
  content: string;
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools"
  > & { toolSkillRun?: OperationRuntimeResult["toolSkillRun"] | null };
  turnFrame?: TurnFrame | null;
  userMessage?: string;
}): string {
  const content = String(args.content ?? "").trim();
  if (!content) return content;
  const safetyContent = appendSafetyReminderPostCommitFollowup({
    content,
    operationRuntime: args.operationRuntime,
    turnFrame: args.turnFrame ?? null,
  });
  if (
    !operationRuntimeSucceededWithChatEffect(
      args.operationRuntime,
    )
  ) {
    return safetyContent;
  }
  if (args.turnFrame && args.userMessage) {
    return appendUncoveredMessageFollowup({
      content: safetyContent,
      operationRuntime: args.operationRuntime,
      turnFrame: args.turnFrame,
      userMessage: args.userMessage,
    });
  }
  return safetyContent;
}

const SAFETY_REMINDER_POST_COMMIT_FOLLOWUP =
  "D'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.";

function turnFrameHasActiveSafetyContext(turnFrame: TurnFrame | null): boolean {
  const riskBand = String(turnFrame?.safety?.risk_band ?? "").trim()
    .toLowerCase();
  return riskBand === "medium" || riskBand === "high" ||
    riskBand === "critical";
}

function hasCommittedOneShotReminderEffect(
  toolSkillRun: unknown,
): boolean {
  const run = recordOrNull(toolSkillRun);
  const committedEffects = Array.isArray(run?.committed_effects)
    ? run.committed_effects
    : [];
  return committedEffects.some((effect) =>
    recordOrNull(effect)?.type === "create_one_shot_reminder"
  );
}

export function appendSafetyReminderPostCommitFollowup(args: {
  content: string;
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools"
  > & { toolSkillRun?: OperationRuntimeResult["toolSkillRun"] | null };
  turnFrame: TurnFrame | null;
}): string {
  const content = String(args.content ?? "").trim();
  if (!content) return content;
  if (content.includes(SAFETY_REMINDER_POST_COMMIT_FOLLOWUP)) return content;
  if (args.operationRuntime.toolExecution !== "success") return content;
  if (
    !args.operationRuntime.executedTools.includes("create_one_shot_reminder")
  ) {
    return content;
  }
  if (!hasCommittedOneShotReminderEffect(args.operationRuntime.toolSkillRun)) {
    return content;
  }
  if (!turnFrameHasActiveSafetyContext(args.turnFrame)) return content;
  return `${content}\n\n${SAFETY_REMINDER_POST_COMMIT_FOLLOWUP}`;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function operationRuntimeClosesWeeklyChildDetour(
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools" | "toolSkillRun"
  >,
): boolean {
  if (
    operationRuntime.toolExecution === "success" &&
    operationRuntime.executedTools?.includes?.("create_one_shot_reminder")
  ) {
    return true;
  }
  if (operationRuntime.toolExecution !== "platform_handoff") return false;
  const run = recordOrNull(operationRuntime.toolSkillRun) ?? {};
  const platformHandoff = recordOrNull(run.platform_handoff) ?? {};
  const status = String(platformHandoff.status ?? run.status ?? "").trim();
  return status === "delivered" ||
    status === "handoff_delivered" ||
    status === "repeat_handoff" ||
    status === "cancelled";
}

function weeklyChildFlowResultDetails(
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools" | "toolSkillRun"
  >,
): Record<string, unknown> {
  const run = recordOrNull(operationRuntime.toolSkillRun) ?? {};
  const platformHandoff = recordOrNull(run.platform_handoff) ?? {};
  const draft = recordOrNull(platformHandoff.draft) ?? {};
  const platformFlow = recordOrNull(draft.platform_flow) ?? {};
  const recommendation = recordOrNull(draft.recommendation) ?? {};
  const committedEffects = Array.isArray(run.committed_effects)
    ? run.committed_effects
    : [];
  const created = committedEffects.length > 0 &&
    operationRuntime.toolExecution === "success";
  return {
    mode: operationRuntime.toolExecution === "platform_handoff"
      ? "platform_handoff"
      : operationRuntime.toolExecution,
    status: String(platformHandoff.status ?? run.status ?? "").trim() || null,
    created,
    available: created,
    user_must_create: !created,
    no_chat_mutation: created ? false : true,
    route_kind: String(platformFlow.route_kind ?? "").trim() || null,
    platform_destination:
      String(recommendation.platform_destination ?? "").trim() || null,
    platform_steps: Array.isArray(recommendation.platform_steps)
      ? recommendation.platform_steps.slice(0, 6)
      : [],
    committed_effect_count: committedEffects.length,
  };
}

export function restoreWeeklyParentAfterChildDetour(args: {
  tempMemory: unknown;
  operationRuntime: Pick<
    OperationRuntimeResult,
    "toolExecution" | "executedTools" | "toolSkillRun"
  >;
}): {
  tempMemory: any;
  restored: boolean;
  childFlowId: string | null;
} {
  const temp = recordOrNull(args.tempMemory) ?? {};
  const suspended = recordOrNull(temp.__suspended_flow_v1);
  const snapshot = suspended?.state_snapshot;
  if (!suspended || !isWeeklyAdaptiveReviewActive(snapshot)) {
    return {
      tempMemory: args.tempMemory ?? {},
      restored: false,
      childFlowId: null,
    };
  }
  if (!operationRuntimeClosesWeeklyChildDetour(args.operationRuntime)) {
    return {
      tempMemory: args.tempMemory ?? {},
      restored: false,
      childFlowId: null,
    };
  }
  const run = recordOrNull(args.operationRuntime.toolSkillRun) ?? {};
  const childFlowId = String(
    run.operation_type ?? run.selected_handler ?? suspended.target_flow ?? "",
  ).trim() || null;
  const now = new Date().toISOString();
  const weeklySnapshot = snapshot as Record<string, unknown>;
  const flowState = recordOrNull(weeklySnapshot.weekly_flow_state) ?? {};
  const previousChildFlow = recordOrNull(flowState.child_flow) ?? {};
  const previousGates = recordOrNull(flowState.weekly_gates) ?? {};
  const next = clearActiveToolFlow(temp);
  next.__active_skill_state = {
    ...weeklySnapshot,
    status: "open",
    weekly_flow_state: {
      ...flowState,
      stage: "synthesis",
      weekly_gates: {
        ...previousGates,
        solution_fit_status: "complete",
        synthesis_status: String(previousGates.synthesis_status ?? "").trim() ||
          "missing",
        closure_status: String(previousGates.closure_status ?? "").trim() ||
          "missing",
      },
      child_flow: {
        ...previousChildFlow,
        status: "completed",
        flow_id: childFlowId ?? previousChildFlow.flow_id ?? null,
        result_summary: String(run.reason_code ?? run.status ?? "").trim() ||
          null,
        result_details: weeklyChildFlowResultDetails(args.operationRuntime),
      },
      updated_at: now,
    },
    updated_at: now,
  };
  delete next.active_skill_state;
  delete next.__suspended_flow_v1;
  return { tempMemory: next, restored: true, childFlowId };
}

function fallbackCommittedEffectConfirmation(
  facts: ReturnType<typeof committedEffectsToConfirmFromToolSkillRun>,
): string | null {
  const first = facts[0];
  if (!first) return null;
  if (first.effect_type === "track_progress_plan_item") {
    const title = String(first.structured_fact.target_title ?? "").trim() ||
      "cette action";
    const status = String(first.structured_fact.progress_status ?? "").trim();
    const label = status === "missed"
      ? "comme non faite"
      : status === "partial"
      ? "comme partiellement faite"
      : "comme faite";
    return `C'est bien enregistré pour « ${title} » ${label}.`;
  }
  const instruction = String(
    first.structured_fact.reminder_instruction ??
      first.structured_fact.instruction ??
      "",
  ).trim() || "ce rappel";
  const scheduledFor = String(first.structured_fact.scheduled_for ?? "")
    .trim();
  return scheduledFor
    ? `C'est bien programmé pour « ${instruction} » (${scheduledFor}).`
    : `C'est bien programmé pour « ${instruction} ».`;
}

async function naturalCommittedEffectConfirmation(args: {
  userId: string;
  requestId?: string | null;
  userMessage: string;
  currentContent: string;
  facts: ReturnType<typeof committedEffectsToConfirmFromToolSkillRun>;
}): Promise<string | null> {
  if (args.facts.length === 0) return null;
  try {
    const raw = await generateWithGemini(
      "Tu es l'agent visible Sophia. Confirme avec tes propres mots un effet durable deja committé.",
      JSON.stringify({
        task: "confirm_committed_direct_effect_naturally",
        user_message: args.userMessage,
        current_runtime_content: args.currentContent,
        committed_effects_to_confirm: args.facts,
        instructions: [
          "Reponds en francais, naturellement, comme Sophia.",
          "Confirme seulement les effets committes fournis.",
          "N'utilise pas de formule technique, pas de JSON, pas de mention de DB, dispatcher, runtime ou outil.",
          "Ne dis pas qu'un effet est cree/enregistre s'il n'est pas dans committed_effects_to_confirm.",
          "Une phrase courte suffit sauf si current_runtime_content contient deja une clarification utile.",
        ],
      }),
      0.4,
      false,
      [],
      "auto",
      {
        requestId: args.requestId ?? undefined,
        userId: args.userId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "direct_effect.confirmation_visible_agent",
        forceRealAi: true,
        reasoningEffort: "low",
      },
    );
    const text = String(raw ?? "").trim();
    return text || fallbackCommittedEffectConfirmation(args.facts);
  } catch {
    return fallbackCommittedEffectConfirmation(args.facts);
  }
}

const STATEFUL_CONVERSATION_LOCAL_SKILLS = new Set([
  "emotional_repair",
  "demotivation_repair",
  "product_help",
  "safety_crisis",
  "status_recap",
]);

function activeConversationSkillId(tempMemory: unknown): string {
  const record = tempMemory && typeof tempMemory === "object"
    ? tempMemory as Record<string, unknown>
    : {};
  const active = (record.__active_skill_state ?? record.active_skill_state) as
    | Record<string, unknown>
    | undefined;
  return String(active?.skill_id ?? "").trim();
}

function activeSkillStateForRestore(args: {
  activeSkillState: unknown;
  skillId: string;
}): Record<string, unknown> | null {
  const previous = args.activeSkillState && typeof args.activeSkillState ===
      "object"
    ? args.activeSkillState as Record<string, unknown>
    : null;
  if (previous && String(previous.skill_id ?? "").trim() === args.skillId) {
    return previous;
  }
  return {
    version: 1,
    skill_id: args.skillId,
    status: "active",
    turn_count: 0,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    working_state: {},
  };
}

export function ensureActiveConversationSkillStateBeforePersist(args: {
  tempMemory: unknown;
  activeSkillState: unknown;
  operationRuntime: Pick<OperationRuntimeResult, "toolSkillRun">;
}): {
  tempMemory: any;
  restored: boolean;
  reasonCode: string | null;
  skillId: string | null;
} {
  const toolSkillRun = args.operationRuntime.toolSkillRun ?? {};
  const mode = String((toolSkillRun as any).mode ?? "").trim();
  const status = String((toolSkillRun as any).status ?? "").trim();
  const skillId = String((toolSkillRun as any).skill_id ?? "").trim();
  const isConversationLocalFlow = mode === "conversation_skill_local_flow" ||
    mode === "local_safety_flow";
  if (
    !isConversationLocalFlow ||
    status !== "continue" ||
    !STATEFUL_CONVERSATION_LOCAL_SKILLS.has(skillId)
  ) {
    return {
      tempMemory: args.tempMemory ?? {},
      restored: false,
      reasonCode: null,
      skillId: skillId || null,
    };
  }

  const currentActiveSkillId = activeConversationSkillId(args.tempMemory);
  if (currentActiveSkillId) {
    return {
      tempMemory: args.tempMemory ?? {},
      restored: false,
      reasonCode: currentActiveSkillId === skillId
        ? null
        : "local_flow_continue_different_active_state",
      skillId,
    };
  }

  const restored = activeSkillStateForRestore({
    activeSkillState: args.activeSkillState,
    skillId,
  });
  const next = { ...((args.tempMemory ?? {}) as Record<string, unknown>) };
  next.__active_skill_state = {
    ...restored,
    skill_id: skillId,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  delete next.active_skill_state;
  return {
    tempMemory: next,
    restored: true,
    reasonCode: "local_flow_continue_missing_active_state",
    skillId,
  };
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
  safetyContextOutput: SafetySignalContext;
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
    safetyContextOutput,
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
  const weeklyParentRestore = restoreWeeklyParentAfterChildDetour({
    tempMemory: nextTempMemory,
    operationRuntime,
  });
  nextTempMemory = weeklyParentRestore.tempMemory;
  if (weeklyParentRestore.restored) {
    await trace("brain:weekly_parent_resumed_after_child_flow", "routing", {
      source_flow: "weekly_adaptive_review_v1",
      child_flow_id: weeklyParentRestore.childFlowId,
      global_dispatcher_skipped: true,
      resume_source: "__suspended_flow_v1",
    }, "info");
  }
  const activeSkillStateGuard = ensureActiveConversationSkillStateBeforePersist(
    {
      tempMemory: nextTempMemory,
      activeSkillState,
      operationRuntime,
    },
  );
  nextTempMemory = activeSkillStateGuard.tempMemory;
  if (activeSkillStateGuard.reasonCode) {
    await trace(
      activeSkillStateGuard.restored
        ? "brain:active_conversation_skill_state_restored_before_persist"
        : "brain:active_conversation_skill_state_persist_conflict",
      "routing",
      {
        skill_id: activeSkillStateGuard.skillId,
        reason_code: activeSkillStateGuard.reasonCode,
        restored: activeSkillStateGuard.restored,
        operation_runtime_status: String(
          operationRuntime.toolSkillRun?.status ?? "",
        ) || null,
        operation_runtime_mode: String(
          operationRuntime.toolSkillRun?.mode ?? "",
        ) || null,
      },
      activeSkillStateGuard.restored ? "warn" : "error",
    );
  }
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
    ? weeklyReturnAfterAdjustmentMessage({ userMessage })
    : null;
  const rawOperationRuntimeContentBeforeAgenda = weeklyReturnMessage
    ? `${operationRuntime.content}\n\n${weeklyReturnMessage}`
    : operationRuntime.content;
  const committedEffectsToConfirm = committedEffectsToConfirmFromToolSkillRun(
    operationRuntime.toolSkillRun,
  );
  const operationContentForConfirmation = committedEffectsToConfirm.length > 0
    ? await naturalCommittedEffectConfirmation({
      userId,
      requestId,
      userMessage,
      currentContent: String(rawOperationRuntimeContentBeforeAgenda ?? ""),
      facts: committedEffectsToConfirm,
    }) ?? String(rawOperationRuntimeContentBeforeAgenda ?? "")
    : String(rawOperationRuntimeContentBeforeAgenda ?? "");
  const rawOperationRuntimeContent = appendOperationFollowup({
    content: operationContentForConfirmation,
    operationRuntime,
    turnFrame,
    userMessage,
  });
  const weeklyCleanedOperationRuntimeContent = weeklyReviewStateAfterOperation
    ? cleanWeeklyVisibleResponse(rawOperationRuntimeContent)
    : rawOperationRuntimeContent;

  let operationRuntimeContent = ensureVisibleSophiaEmoji(
    stripHiddenHtmlComments(weeklyCleanedOperationRuntimeContent),
  );

  const operationRuntimeAdditionalContents = (
    operationRuntime.additionalContents ?? []
  ).map((content: string) =>
    ensureVisibleSophiaEmoji(
      stripHiddenHtmlComments(
        weeklyReviewStateAfterOperation
          ? cleanWeeklyVisibleResponse(content)
          : content,
      ),
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
        safety_context: safetyContextOutput,
        dispatcher_run: {
          latency_ms: dispatcherV2Stat?.latency_ms ?? 0,
          tokens_in: dispatcherV2Stat?.tokens_in ?? 0,
          tokens_out: dispatcherV2Stat?.tokens_out ?? 0,
          prompt_version: dispatcherV2Stat?.prompt_version ??
            "dispatcher_v2_prompt_2026_05_s12",
          model_used: dispatcherV2Stats[0]?.model_name ?? null,
          memory_plan: turnFrame?.memory_plan ?? DEFAULT_DISPATCHER_MEMORY_PLAN,
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

/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type AgentMode,
  getUserState,
  insertChatMessage,
  logMessage,
  normalizeScope,
  updateUserState,
} from "../state-manager.ts";
import {
  buildContextString,
  type ContextLoadResult,
  loadContextForMode,
  loadRecentDirectEffectConfirmationContext,
  loadRecentEffectsLedgerSummary,
  type OnDemandTriggers,
  serviceRoleLedgerReadClient,
} from "../context/loader.ts";
import {
  loadUserIdentityPack,
  type UserIdentityPack,
} from "../context/user_identity.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../context/recent_messages_policy.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import { debounceAndBurstMerge } from "./debounce.ts";
import { runAgentAndVerify } from "./agent_exec.ts";
import {
  buildNeutralTurnFrame,
  type DispatcherLlmRunner,
  type DispatcherRunStats,
  runDispatcher,
  type RunDispatcherInput,
} from "../dispatcher/dispatcher.v2.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { initialSafetyContext } from "../safety/safety_context.ts";
import { runConversationRouters } from "../routers/routers.ts";
import {
  type EffectGateOrchestratorResult,
  runEffectGateOrchestrator,
} from "../routers/effect_gate_orchestrator.ts";
import {
  DEFAULT_DISPATCHER_MEMORY_PLAN,
  dispatcherSignalsFromTurnFrame,
} from "./turn_context_runtime.ts";
import {
  loadPlanSnapshotForTurn,
  type V2PlanItemSnapshotItem,
} from "./plan_snapshot_runtime.ts";
import { getActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import {
  buildLastLocalFlowExitContext,
  clearActiveConversationSkillState,
  clearLastLocalFlowExitContext,
  clearLegacyRuntimeState,
  readActiveFlowState,
  shouldSkipGlobalDispatcherForActiveLocalFlow,
} from "./active_flow_state.ts";
import {
  mergeDirectEffectRuntimeIntoVisibleRuntime,
  runDirectEffectLane,
  runOperationRuntimePipeline,
  turnFrameHasRunnableDirectEffect,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";
import {
  type LocalOneShotDirectEffectRequest,
  oneShotDirectEffectFromLocalRequest,
} from "./one_shot_local_direct_effect.ts";
import {
  directEffectConfirmationContextPrompt,
  withDirectEffectConfirmationContext,
} from "./direct_effect_local_context.ts";
import {
  executedToolsForStatus,
  type OperationRuntimeResult,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
import {
  createEffectLedger,
  type EffectLedger,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  buildSafetyCrisisActivationNoteInformation,
  isSafetyRoute,
  runtimeSafetyContextForTurn,
} from "./safety_crisis_runtime.ts";
import {
  ensureVisibleSophiaEmoji,
  stripDeprecatedProductVocabulary,
  stripHiddenHtmlComments,
} from "./response_visibility_formatting.ts";
import { runProductHelpSkill } from "../skills/product_help/skill.ts";
import { runCoachingRecommendationSkill } from "../skills/coaching_recommendation/skill.ts";
import { runDailyActionCoachingRecommendationSkill } from "../skills/daily_action_coaching_recommendation/skill.ts";
import { runFeatureOpportunitySkill } from "../skills/feature_opportunity/skill.ts";
import { runPlanRealignmentSkill } from "../skills/plan_realignment/skill.ts";
import { runSafetyCrisisSkill } from "../skills/safety_crisis/skill.ts";
import {
  oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput,
  runSafetyCrisisLocalDispatcher,
} from "../skills/safety_crisis/local_dispatcher.ts";
import type { SafetyCrisisLocalDispatcherOutput } from "../skills/safety_crisis/contract.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  type MemoryV2ActiveLoaderResult,
  runMemoryV2ActiveLoader,
} from "../../_shared/memory/runtime/active_loader.ts";

function envFlagEnabled(name: string): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function buildTurnFrameForRuntime(args: {
  dispatcherInput: RunDispatcherInput;
  skipGlobalDispatcherForActiveLocalFlow: boolean;
  llmRunner?: DispatcherLlmRunner;
}): Promise<TurnFrame> {
  if (args.skipGlobalDispatcherForActiveLocalFlow) {
    return buildNeutralTurnFrame(args.dispatcherInput);
  }
  return await runDispatcher({
    ...args.dispatcherInput,
    llm_runner: args.llmRunner,
  });
}

function parseJsonish(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !("tool" in (raw as any))) return raw;
  const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? {});
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return {};
  }
}

function buildDispatcherLlmRunner(meta?: {
  requestId?: string;
  userId?: string | null;
  model?: string;
  forceRealAi?: boolean;
}) {
  if (!envFlagEnabled("SOPHIA_DISPATCHER_LLM_ENABLED") && !meta?.forceRealAi) {
    return undefined;
  }
  return async (input: {
    system_prompt: string;
    user_prompt: string;
    json_mode: true;
    model_name: string;
  }) => {
    try {
      const model = String(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
          input.model_name ??
          meta?.model ??
          getGlobalAiModel("gemini-2.5-flash"),
      ).trim();
      const raw = await generateWithGemini(
        input.system_prompt,
        input.user_prompt,
        0.1,
        input.json_mode,
        [],
        "auto",
        {
          requestId: meta?.requestId,
          userId: meta?.userId ?? undefined,
          model,
          source: "dispatcher-v2-llm",
          forceRealAi: true,
          forceInitialModel: true,
          maxRetries: 1,
        },
      );
      return parseJsonish(raw);
    } catch (error) {
      console.warn("[Router] dispatcher LLM failed", {
        requestId: meta?.requestId ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  };
}

export function buildOnDemandTriggersFromDispatcherSignals(
  dispatcherSignals: DispatcherSignals,
): OnDemandTriggers {
  return {
    plan_item_discussion_detected:
      dispatcherSignals.plan_item_discussion?.detected ?? false,
    plan_item_discussion_hint: dispatcherSignals.plan_item_discussion
      ?.item_hint,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected ?? false,
  };
}

function cleanupLegacyRuntimeState(tempMemory: any): any {
  let next = clearLegacyRuntimeState(tempMemory ?? {});
  next = clearLastLocalFlowExitContext(next);
  return next;
}

function productHelpInjectedContext(routeDecision: RouteDecision | null) {
  if (routeDecision?.response_owner !== "product_help") return undefined;
  return [
    "ROUTE PRODUIT SOPHIA.",
    "Reponds uniquement sur le fonctionnement, la navigation, les limites ou l'usage de Sophia.",
    "N'execute aucune action, ne cree rien, ne modifie rien, ne programme rien et ne promets aucun handoff local.",
    "Si la demande est en fait une action produit ancienne ou unsupported, explique sobrement que ce n'est pas fait depuis le chat et ramene la conversation au besoin utilisateur.",
  ].join("\n");
}

type RuntimeConversationSkillId =
  | "product_help"
  | "coaching_recommendation"
  | "daily_action_coaching_recommendation_v1"
  | "feature_opportunity"
  | "plan_realignment";

function buildConversationSkillContext(args: {
  skillId: RuntimeConversationSkillId;
  userId: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  turnFrame: TurnFrame;
  planItemSnapshot: V2PlanItemSnapshotItem[];
  inboundNote?: unknown;
  recentEffectsSummary?: string | null;
  recentDirectEffectConfirmationContext?: Record<string, unknown> | null;
  userIdentity?: UserIdentityPack | null;
}) {
  return {
    skill_id: args.skillId,
    user_id: args.userId,
    recent_messages: args.recentMessages,
    active_skill_working_state: args.activeSkillState as any,
    turn_frame: args.turnFrame,
    relevant_memory_items: [],
    plan_items: args.planItemSnapshot as unknown as Array<
      Record<string, unknown>
    >,
    product_surfaces: [],
    exclusions: [],
    runtime_context: {
      recent_effects_summary: args.recentEffectsSummary ?? null,
      recent_direct_effect_confirmation_context:
        args.recentDirectEffectConfirmationContext ?? null,
      user_identity: args.userIdentity ?? null,
    },
    note_information: args.inboundNote ?? null,
  };
}

function localStateFromSkillOutput(
  skillId: RuntimeConversationSkillId,
  output: ConversationSkillOutput,
): unknown {
  const patch = output.state_patch ?? {};
  return skillId === "product_help"
    ? patch.product_help_local_state
    : skillId === "feature_opportunity"
    ? patch.feature_opportunity_local_state
    : skillId === "plan_realignment"
    ? patch.plan_realignment_local_state
    : skillId === "daily_action_coaching_recommendation_v1"
    ? patch.daily_action_coaching_recommendation_state
    : patch.coaching_recommendation_local_state;
}

function safetyWorkingStateFromOutput(output: ConversationSkillOutput) {
  const patch = output.state_patch ?? {};
  const { visible_task: _visibleTask, ...workingState } = patch as Record<
    string,
    unknown
  >;
  return workingState;
}

export function applySafetyCrisisSkillState(args: {
  tempMemory: Record<string, unknown>;
  activeSkillState: unknown;
  output: ConversationSkillOutput;
}) {
  let next = { ...args.tempMemory };
  const previous = args.activeSkillState &&
      typeof args.activeSkillState === "object" &&
      !Array.isArray(args.activeSkillState)
    ? args.activeSkillState as Record<string, unknown>
    : {};
  const previousWorkingState = previous.working_state &&
      typeof previous.working_state === "object" &&
      !Array.isArray(previous.working_state)
    ? previous.working_state as Record<string, unknown>
    : {};
  const workingState = {
    ...previousWorkingState,
    ...safetyWorkingStateFromOutput(args.output),
  };
  const now = new Date().toISOString();

  const exitState = applySafetyCrisisExitStateIfNeeded({
    tempMemory: next,
    selectedSkillId: "safety_crisis",
    skillOutput: args.output,
    previous,
    workingState,
    now,
  });
  if (exitState) return exitState;

  if (args.output.status === "continue") {
    const phase = String(workingState.phase ?? "").trim();
    const activeSkillState = {
      version: 1,
      skill_id: "safety_crisis",
      status: phase === "exit_check" ? "resolving" : "active",
      mode: "local_safety_flow",
      turn_count: Number(previous.turn_count ?? 0) + 1,
      max_turns: Number(previous.max_turns ?? 12) || 12,
      started_at: String(previous.started_at ?? "") || now,
      updated_at: now,
      working_state: workingState,
    };
    next[ACTIVE_CONVERSATION_SKILL_KEY] = activeSkillState;
    next.__active_skill_state = activeSkillState;
    delete next.active_skill_state;
    return next;
  }

  return clearActiveConversationSkillState(next);
}

export function applyConversationSkillState(args: {
  tempMemory: Record<string, unknown>;
  activeSkillState: unknown;
  skillId: RuntimeConversationSkillId;
  output: ConversationSkillOutput;
}) {
  let next = { ...args.tempMemory };
  const localState = localStateFromSkillOutput(args.skillId, args.output);
  if (args.output.status === "continue" && localState) {
    const previous = args.activeSkillState &&
        typeof args.activeSkillState === "object" &&
        !Array.isArray(args.activeSkillState)
      ? args.activeSkillState as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const local = localState as any;
    const activeSkillState = {
      version: 1,
      skill_id: args.skillId,
      status: "active",
      turn_count: Number(
        args.skillId === "product_help"
          ? local?.product_help_state?.turn_count
          : args.skillId === "feature_opportunity"
          ? local?.turn_count
          : args.skillId === "plan_realignment"
          ? local?.turn_count
          : args.skillId === "daily_action_coaching_recommendation_v1"
          ? local?.turn_count
          : local?.turn_count,
      ) || Number(previous.turn_count ?? 0) + 1,
      started_at: String(previous.started_at ?? "") || now,
      updated_at: now,
      working_state: {
        [
          args.skillId === "product_help"
            ? "product_help_local_state"
            : args.skillId === "feature_opportunity"
            ? "feature_opportunity_local_state"
            : args.skillId === "plan_realignment"
            ? "plan_realignment_local_state"
            : args.skillId === "daily_action_coaching_recommendation_v1"
            ? "daily_action_coaching_recommendation_state"
            : "coaching_recommendation_local_state"
        ]: localState,
      },
    };
    next[ACTIVE_CONVERSATION_SKILL_KEY] = activeSkillState;
    next.__active_skill_state = activeSkillState;
    delete next.active_skill_state;
  } else {
    next = clearActiveConversationSkillState(next);
  }
  if (args.skillId === "product_help" && args.output.state_patch) {
    const memo = args.output.state_patch.product_help_exit_memo;
    if (memo) next.__last_product_help_exit_memo = memo;
  }
  if (args.skillId === "coaching_recommendation" && args.output.state_patch) {
    const note =
      args.output.state_patch.coaching_recommendation_note_information;
    if (note) {
      next.__last_coaching_recommendation_exit_memo = {
        note_information: note,
        at: new Date().toISOString(),
      };
    }
  }
  if (
    args.skillId === "daily_action_coaching_recommendation_v1" &&
    args.output.state_patch
  ) {
    const note = args.output.state_patch
      .daily_action_coaching_recommendation_note_information;
    if (note) {
      next.__last_daily_action_coaching_recommendation_exit_memo = {
        note_information: note,
        at: new Date().toISOString(),
      };
    }
  }
  if (args.skillId === "feature_opportunity" && args.output.state_patch) {
    const note = args.output.state_patch.feature_opportunity_note_information;
    if (note) {
      next.__last_feature_opportunity_exit_memo = {
        note_information: note,
        at: new Date().toISOString(),
      };
    }
  }
  if (args.skillId === "plan_realignment" && args.output.state_patch) {
    const note = args.output.state_patch.plan_realignment_note_information;
    if (note) {
      next.__last_plan_realignment_exit_memo = {
        note_information: note,
        at: new Date().toISOString(),
      };
    }
  }
  return next;
}

function skillOutputNoteInformation(
  output: ConversationSkillOutput,
): unknown | null {
  const patch = output.state_patch ?? {};
  return (patch.product_help_note_information ??
    patch.coaching_recommendation_note_information ??
    patch.daily_action_coaching_recommendation_note_information ??
    patch.feature_opportunity_note_information ??
    patch.plan_realignment_note_information ??
    (output.diagnosis as any)?.note_information) ?? null;
}

function skillOutputNoteTarget(output: ConversationSkillOutput): string {
  const note = skillOutputNoteInformation(output) as any;
  return String(note?.target_dispatcher ?? "").trim();
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function noteFromLastLocalFlowExitContext(
  context: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return recordOrNull(context?.note_information);
}

function structuredContextFromNote(
  note: Record<string, unknown> | null,
): Record<string, unknown> {
  return recordOrNull(note?.structured_context) ?? {};
}

function localExitFlowStateContext(args: {
  sourceFlowId: string;
  noteInformation: unknown;
}): Record<string, unknown> {
  return {
    last_local_flow_exit: {
      source_flow_id: args.sourceFlowId,
      note_information: args.noteInformation ?? null,
      at: new Date().toISOString(),
    },
  };
}

function noteConfidenceBand(note: Record<string, unknown> | null) {
  const confidence = String(note?.confidence ?? "").trim();
  return confidence === "low" || confidence === "medium" ||
      confidence === "critical"
    ? confidence
    : "high";
}

function recommendedNextFocusFromNote(
  note: Record<string, unknown> | null,
): string {
  const structured = structuredContextFromNote(note);
  return String(
    structured.recommended_next_focus ??
      structured.likely_intent ??
      structured.next_focus ??
      "",
  ).trim();
}

function turnFrameWithLocalExitNoteRoutingHints(args: {
  turnFrame: TurnFrame;
  noteInformation: unknown;
}): TurnFrame {
  const note = recordOrNull(args.noteInformation);
  if (!note) return args.turnFrame;

  const focus = recommendedNextFocusFromNote(note);
  const confidenceBand = noteConfidenceBand(note);
  const skillSignals = { ...(args.turnFrame.skill_signals ?? {}) };
  if (focus === "product_help" && !skillSignals.product_help?.detected) {
    skillSignals.product_help = {
      detected: true,
      confidence_band: confidenceBand,
      reason: "local_flow_exit_note",
    };
  } else if (
    focus === "coaching_recommendation" &&
    !skillSignals.coaching_recommendation?.detected
  ) {
    skillSignals.coaching_recommendation = {
      detected: true,
      confidence_band: confidenceBand,
      reason: "local_flow_exit_note",
    } as any;
  } else if (
    focus === "feature_opportunity" &&
    !skillSignals.feature_opportunity?.detected
  ) {
    const structured = structuredContextFromNote(note);
    skillSignals.feature_opportunity = {
      detected: true,
      confidence_band: confidenceBand,
      reason: "local_flow_exit_note",
      context: recordOrNull(structured.dispatcher_signal_context) ??
        undefined,
    } as any;
  } else if (
    focus === "plan_realignment" &&
    !skillSignals.plan_realignment?.detected
  ) {
    const structured = structuredContextFromNote(note);
    skillSignals.plan_realignment = {
      detected: true,
      confidence_band: confidenceBand,
      reason: "local_flow_exit_note",
      context: recordOrNull(structured.dispatcher_signal_context) ??
        undefined,
    } as any;
  }

  return {
    ...args.turnFrame,
    note_information: note as any,
    skill_signals: skillSignals,
  };
}

function localParentNoteTargetsCoaching(
  context: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const operationType = String(context?.operation_type ?? "");
  if (
    operationType !== "daily_action_review" &&
    operationType !== "weekly_adaptive_review"
  ) {
    return null;
  }
  const note = noteFromLastLocalFlowExitContext(context);
  if (String(note?.target_dispatcher ?? "") !== "coaching_recommendation") {
    return null;
  }
  const structured = structuredContextFromNote(note);
  if (structured.bridge_kind !== "parent_to_coaching_recommendation") {
    return null;
  }
  return note;
}

function turnFrameWithInboundCoachingBridge(
  turnFrame: TurnFrame,
  note: Record<string, unknown> | null,
): TurnFrame {
  if (!note) return turnFrame;
  const structured = structuredContextFromNote(note);
  const signalContext = recordOrNull(structured.dispatcher_signal_context);
  return {
    ...turnFrame,
    note_information: note as any,
    skill_signals: {
      ...(turnFrame.skill_signals ?? {}),
      coaching_recommendation: {
        detected: true,
        confidence_band: String(note.confidence ?? "") === "low"
          ? "low"
          : String(note.confidence ?? "") === "medium"
          ? "medium"
          : "high",
        reason: "parent_bridge_from_daily_action_review",
        ...(signalContext ? { context: signalContext as any } : {}),
      },
    },
  };
}

export function mergeVisibleTextForTest(
  operationRuntime: OperationRuntimeResult | null,
  agentText: string,
): string {
  const operationText = String(operationRuntime?.content ?? "").trim();
  const visible = String(agentText ?? "").trim();
  if (visible) return visible;
  return operationText;
}

function turnFrameHasCommittedOneShotReminder(
  turnFrame: TurnFrame | null,
): boolean {
  const lane = (turnFrame as { direct_effect_lane?: unknown } | null)
    ?.direct_effect_lane;
  const committed =
    lane && typeof lane === "object" &&
      Array.isArray((lane as Record<string, unknown>).committed_effects)
      ? (lane as Record<string, unknown>).committed_effects as unknown[]
      : [];
  return committed.some((effect) =>
    Boolean(effect) && typeof effect === "object" &&
    String((effect as Record<string, unknown>).type ?? "") ===
      "create_one_shot_reminder"
  );
}

function effectLedgerForOperationRuntime(
  turnId: string,
  operationRuntime: OperationRuntimeResult | null | undefined,
) {
  const effectLedger = createEffectLedger(turnId);
  recordToolSkillEffectsInLedger({
    ledger: effectLedger,
    toolSkillRun: operationRuntime?.toolSkillRun,
    toolExecution: operationRuntime?.toolExecution ?? "none",
  });
  return effectLedger;
}

async function persistEffectLedgerForRuntimeTurn(args: {
  supabase: SupabaseClient;
  effectLedger: EffectLedger;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  channel: "web" | "whatsapp" | string;
  scope: string;
}) {
  const result = await persistEffectLedgerForTurn({
    supabase: args.supabase,
    ledger: args.effectLedger,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? null,
    requestId: args.requestId ?? null,
    channel: args.channel,
    scope: args.scope,
  });
  if (result.error) {
    console.warn("[Router] persistEffectLedgerForTurn failed", result.error);
  }
}

export function effectLedgerTraceForTest(args: {
  turnId: string;
  operationRuntime?: OperationRuntimeResult | null;
}) {
  return summarizeEffectLedgerForTrace(
    effectLedgerForOperationRuntime(args.turnId, args.operationRuntime),
  );
}

function finalVisibleText(text: unknown, routeDecision: RouteDecision | null) {
  let out = stripHiddenHtmlComments(text);
  out = stripDeprecatedProductVocabulary(out);
  if (!isSafetyRoute(routeDecision)) out = ensureVisibleSophiaEmoji(out);
  return out.trim();
}

function allowedDirectEffectsFromGate(
  routeDecision: RouteDecision,
  gate: EffectGateOrchestratorResult,
): RouteDecision {
  return {
    ...routeDecision,
    direct_effects_to_run: gate.allowed,
    blocked_paths: [
      ...routeDecision.blocked_paths,
      ...gate.additional_blocked_paths,
    ],
  };
}

function directEffectTrace(
  operationRuntime: OperationRuntimeResult | null,
): Array<{ tool_id: string; outcome: unknown }> {
  if (!operationRuntime) return [];
  return operationRuntime.executedTools.map((toolId) => ({
    tool_id: toolId,
    outcome: operationRuntime.toolExecution,
  }));
}

export function applyMemoryV2ActiveLoaderResult(
  contextLoadResult: ContextLoadResult,
  currentTempMemory: Record<string, unknown>,
  memoryResult: MemoryV2ActiveLoaderResult | null,
): { tempMemory: Record<string, unknown>; injected: boolean } {
  if (!memoryResult) {
    return { tempMemory: currentTempMemory, injected: false };
  }

  const nextTempMemory = cleanupLegacyRuntimeState(
    memoryResult.tempMemory ?? currentTempMemory,
  );
  if (memoryResult.context_block.trim()) {
    contextLoadResult.context.memoryV2Payload = memoryResult.context_block;
    return { tempMemory: nextTempMemory, injected: true };
  }

  return { tempMemory: nextTempMemory, injected: false };
}

export async function processMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  history: any[],
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    scope?: string;
    whatsappMode?: "onboarding" | "normal";
    evalRunId?: string | null;
    forceBrainTrace?: boolean;
    enableAdjustPlanCoachGuidance?: boolean;
    clientNowIso?: string | null;
    clientTimezone?: string | null;
  },
  opts?: {
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
    disableForcedRouting?: boolean;
    forceOnboardingFlow?: boolean;
    disableDebounce?: boolean;
    debounceWaitMs?: number;
    roadmapContext?: {
      cycleId: string | null;
      transformations: any[];
      isFirstOnboarding: boolean;
      previousTransformation?: { title?: string | null } | null;
    };
  },
) {
  const turnStartMs = Date.now();
  const channel = meta?.channel ?? "web";
  const scope = normalizeScope(
    meta?.scope,
    channel === "whatsapp" ? "whatsapp" : "web",
  );
  const requestId = meta?.requestId ?? crypto.randomUUID();
  const trace = async (
    event: string,
    phase: BrainTracePhase,
    payload: Record<string, unknown> = {},
    level: "debug" | "info" | "warn" | "error" = "info",
  ) => {
    await logBrainTrace({
      supabase,
      userId,
      meta: {
        requestId,
        evalRunId: meta?.evalRunId ?? null,
        turnId: requestId,
        channel,
        scope,
        forceBrainTrace: meta?.forceBrainTrace,
      },
      event,
      phase,
      level,
      payload,
    });
  };

  const logMessages = opts?.logMessages !== false;
  let loggedMessageId: string | null = null;
  if (logMessages) {
    const inserted = await insertChatMessage(
      supabase,
      userId,
      scope,
      "user",
      userMessage,
      undefined,
      opts?.messageMetadata ?? {},
      { selectId: true },
    );
    loggedMessageId = inserted?.id ?? null;
  }

  if (loggedMessageId && !opts?.disableDebounce) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
      debounceWaitMs: opts?.debounceWaitMs,
    });
    if (debounced.aborted) {
      return {
        content: "",
        mode: "companion" as AgentMode,
        aborted: true,
        abort_reason: debounced.abortReason ?? "debounceAndBurstMerge",
        logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
        latest_message_id: debounced.latestMessageId ?? null,
      };
    }
    userMessage = debounced.userMessage;
  }

  let state = await getUserState(supabase, userId, scope);
  let tempMemory = cleanupLegacyRuntimeState((state as any)?.temp_memory ?? {});
  const activeFlowState = readActiveFlowState(tempMemory);
  const lastLocalFlowExitContext = buildLastLocalFlowExitContext(tempMemory);
  const inboundDailyCoachingBridgeNote = localParentNoteTargetsCoaching(
    lastLocalFlowExitContext,
  );
  if (tempMemory !== (state as any)?.temp_memory) {
    state = { ...(state as any), temp_memory: tempMemory };
  }

  const v2Runtime = await getActiveTransformationRuntime(supabase, userId)
    .catch(() => null);
  const planItemSnapshot: V2PlanItemSnapshotItem[] =
    (await loadPlanSnapshotForTurn({
      supabase,
      userId,
      runtime: v2Runtime,
      onError: (_phase, error) => {
        console.warn("[Router] plan snapshot load failed", error);
      },
    })) ?? [];

  const clientNow = meta?.clientNowIso ? new Date(meta.clientNowIso) : null;
  const userTime = await getUserTimeContext({
    supabase,
    userId,
    now: clientNow && Number.isFinite(clientNow.getTime())
      ? clientNow
      : undefined,
    timezoneOverride: meta?.clientTimezone ?? null,
  }).catch(() => null as any);

  const safetyContextOutput = initialSafetyContext({ channel });
  const recentMessagesForTurnFrame = [
    ...recentChatMessagesFromHistory(
      history,
      RECENT_MESSAGE_LIMITS.conversationRepair,
    ),
    ...(userMessage.trim()
      ? [{ role: "user" as const, content: userMessage.trim() }]
      : []),
  ];

  const dispatcherV2Stats: DispatcherRunStats[] = [];
  const dispatcherStart = Date.now();
  const skipGlobalDispatcherForActiveLocalFlow =
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: activeFlowState.activeSkillState,
    });
  const dispatcherInput: RunDispatcherInput = {
    user_message: userMessage,
    recent_messages: recentMessagesForTurnFrame,
    user_id: userId,
    channel,
    active_skill_state: activeFlowState.activeSkillState,
    flow_state_context: lastLocalFlowExitContext
      ? { last_local_flow_exit: lastLocalFlowExitContext }
      : null,
    direct_effect_time_context: userTime
      ? {
        now_utc: userTime.now_utc,
        user_timezone: userTime.user_timezone,
        user_locale: userTime.user_locale,
        user_local_datetime: userTime.user_local_datetime,
        user_local_human: userTime.user_local_human,
      }
      : undefined,
    plan_snapshot: planItemSnapshot,
    safety_context_output: safetyContextOutput,
    conversation_risk_history: [],
    source_message_id: loggedMessageId ?? requestId,
    turn_id: requestId,
    model_name: meta?.model,
    on_stats: (stats: DispatcherRunStats) => dispatcherV2Stats.push(stats),
  };
  let turnFrame: TurnFrame = await buildTurnFrameForRuntime({
    dispatcherInput,
    skipGlobalDispatcherForActiveLocalFlow,
    llmRunner: buildDispatcherLlmRunner({
      requestId,
      userId,
      model: meta?.model,
      forceRealAi: meta?.forceRealAi,
    }),
  });
  turnFrame = turnFrameWithInboundCoachingBridge(
    turnFrame,
    inboundDailyCoachingBridgeNote,
  );
  const dispatcherLatencyMs = Date.now() - dispatcherStart;

  let currentActiveSkillState = activeFlowState.activeSkillState;
  let routeDecision = runConversationRouters({
    turn_frame: turnFrame,
    active_skill_state: currentActiveSkillState,
    safety_context_risk_band: safetyContextOutput.risk_band,
  });
  let precomputedSafetyCrisisLocalDispatcherOutput:
    | SafetyCrisisLocalDispatcherOutput
    | null = null;
  if (isSafetyRoute(routeDecision)) {
    const workingState = ((activeFlowState.activeSkillState as any)
      ?.working_state ?? {}) as Record<string, unknown>;
    precomputedSafetyCrisisLocalDispatcherOutput =
      await runSafetyCrisisLocalDispatcher({
        user_id: userId,
        request_id: turnFrame.source_message_id,
        user_message: userMessage,
        recent_messages: recentMessagesForTurnFrame,
        source_safety_context: {
          risk_band: turnFrame.safety.risk_band,
          reason_codes: turnFrame.safety.reason_codes ?? [],
          evidence: turnFrame.safety.evidence ?? [],
        },
        previous_active_safety_state: activeFlowState.activeSkillState as any,
        note_information_inbound: turnFrame.note_information ?? null,
        prior_phase: typeof workingState.phase === "string"
          ? workingState.phase
          : null,
        prior_known_facts: {
          immediate_danger: workingState.immediate_danger ?? null,
          has_means_nearby: workingState.has_means_nearby ?? null,
          user_not_alone: workingState.user_not_alone ?? null,
          emergency_help_mentioned: workingState.emergency_help_mentioned ??
            null,
          human_support_mentioned: workingState.human_support_mentioned ??
            null,
          consecutive_deescalated_turns:
            workingState.consecutive_deescalated_turns ?? 0,
          last_user_safety_signal: workingState.last_user_safety_signal ?? null,
          last_assistant_safety_step: workingState.last_assistant_safety_step ??
            null,
        },
        channel,
        timezone: userTime?.timezone ?? meta?.clientTimezone ?? null,
        turn_frame: turnFrame,
      });
    const localOneShotDirectEffect =
      oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput(
        precomputedSafetyCrisisLocalDispatcherOutput,
        { turnFrame },
      );
    if (localOneShotDirectEffect) {
      const alreadyPresent = turnFrame.direct_effects.some((effect) =>
        effect.effect_type === localOneShotDirectEffect.effect_type
      );
      if (!alreadyPresent) {
        turnFrame = {
          ...turnFrame,
          direct_effects: [
            ...turnFrame.direct_effects,
            localOneShotDirectEffect,
          ],
        };
      }
      if (
        !routeDecision.direct_effects_to_run.includes(
          "create_one_shot_reminder",
        )
      ) {
        routeDecision = {
          ...routeDecision,
          direct_effects_to_run: [
            ...routeDecision.direct_effects_to_run,
            "create_one_shot_reminder",
          ],
          reason_code: routeDecision.reason_code.includes("direct_effects")
            ? routeDecision.reason_code
            : `${routeDecision.reason_code}_with_local_direct_effects`,
        };
      }
    }
  }

  const directEffectGateResult = await runEffectGateOrchestrator({
    turn_frame: turnFrame,
    direct_effects_to_run: routeDecision.direct_effects_to_run,
  });
  routeDecision = allowedDirectEffectsFromGate(
    routeDecision,
    directEffectGateResult,
  );

  const { riskBand: runtimeSafetyRiskBand } = runtimeSafetyContextForTurn({
    safetyContextOutput,
    routeDecision,
    turnFrame,
    tempMemory,
    userMessage,
  });

  const operationPipeline = await runOperationRuntimePipeline({
    supabase,
    userId,
    userMessage,
    channel,
    userTimezone: userTime?.timezone ?? meta?.clientTimezone ?? "UTC",
    history,
    tempMemory,
    state,
    planItemSnapshot,
    turnFrame,
    routeDecision,
    safetyContextOutput,
    sourceMessageId: loggedMessageId ?? requestId,
    requestId,
    v2Runtime,
    clientNow,
    allowDirectEffectMessageIntakeFallback:
      skipGlobalDispatcherForActiveLocalFlow,
  });
  routeDecision = operationPipeline.routeDecision ?? routeDecision;
  turnFrame = operationPipeline.turnFrame ?? turnFrame;
  tempMemory = operationPipeline.tempMemory ?? tempMemory;
  let operationRuntime = operationPipeline.operationRuntime;
  turnFrame = turnFrameWithDirectEffectRuntime(turnFrame, operationRuntime) ??
    (turnFrame ? withDirectEffectConfirmationContext(turnFrame) : turnFrame);

  let skillExitInjectedContext: string | undefined;
  let localFlowExitSkillRun: Record<string, unknown> | undefined;
  let localFlowExitRedispatchCount = 0;
  let reminderDirectEffectReexecuted = false;

  visibleOwnerDispatch: while (true) {
    // Direct-effect execution is a turn-level concern, not tied to whichever flow
    // exited. When a local flow (e.g. feature_opportunity) hands the turn back to
    // the global dispatcher on the same turn, the rebuilt turn frame can surface a
    // runnable create_one_shot_reminder that the pre-loop pipeline never executed
    // (the global dispatcher was skipped while the local flow owned the turn).
    // Re-run the direct-effect lane once so the reminder is committed regardless
    // of the exiting flow. Idempotency: fires at most once per turn and never when
    // the reminder is already committed in this turn's direct_effect_lane.
    if (
      localFlowExitRedispatchCount > 0 &&
      !reminderDirectEffectReexecuted &&
      turnFrameHasRunnableDirectEffect(turnFrame, "create_one_shot_reminder") &&
      !turnFrameHasCommittedOneShotReminder(turnFrame)
    ) {
      reminderDirectEffectReexecuted = true;
      const reexecReminderLane = await runDirectEffectLane({
        supabase,
        userId,
        userMessage,
        channel,
        userTimezone: userTime?.timezone ?? meta?.clientTimezone ?? "UTC",
        history,
        tempMemory,
        state,
        planItemSnapshot,
        turnFrame,
        routeDecision,
        safetyContextOutput,
        sourceMessageId: loggedMessageId ?? requestId,
        requestId,
        v2Runtime,
        clientNow,
        allowMessageIntakeFallback: false,
      });
      routeDecision = reexecReminderLane.routeDecision ?? routeDecision;
      tempMemory = reexecReminderLane.tempMemory ?? tempMemory;
      turnFrame = turnFrameWithDirectEffectRuntime(
        reexecReminderLane.turnFrame,
        reexecReminderLane.operationRuntime,
      ) ??
        (reexecReminderLane.turnFrame
          ? withDirectEffectConfirmationContext(reexecReminderLane.turnFrame)
          : reexecReminderLane.turnFrame) ??
        turnFrame;
      operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
        directRuntime: reexecReminderLane.operationRuntime,
        visibleRuntime: operationRuntime,
      });
    }
    const operationRun = operationRuntime?.toolSkillRun ?? {};
    const weeklyLocalRuntimeOwnsTurn =
      operationRun.selected_handler === "weekly_adaptive_review_v1" &&
      !localFlowExitSkillRun &&
      routeDecision.response_owner !== "coaching_recommendation" &&
      routeDecision.response_owner !== "safety";
    if (weeklyLocalRuntimeOwnsTurn) {
      const weeklyRuntimeStatus = String(operationRun.status ?? "").trim();
      const weeklyRuntimeContent = String(operationRuntime?.content ?? "")
        .trim();
      if (!weeklyRuntimeContent && weeklyRuntimeStatus === "exit_to_global") {
        localFlowExitSkillRun = {
          selected_skill_id: "weekly_adaptive_review_v1",
          reason_code: String(
            operationRun.reason_code ?? routeDecision.reason_code,
          ),
          status: weeklyRuntimeStatus,
          exit_note_information: operationRun.note_information ?? null,
        };
        localFlowExitRedispatchCount += 1;
        currentActiveSkillState = null;
        turnFrame = await buildTurnFrameForRuntime({
          dispatcherInput: {
            ...dispatcherInput,
            active_skill_state: null,
            flow_state_context: localExitFlowStateContext({
              sourceFlowId: "weekly_adaptive_review_v1",
              noteInformation: operationRun.note_information ??
                operationRun.exit_memo ??
                null,
            }),
          },
          skipGlobalDispatcherForActiveLocalFlow: false,
          llmRunner: buildDispatcherLlmRunner({
            requestId,
            userId,
            model: meta?.model,
            forceRealAi: meta?.forceRealAi,
          }),
        });
        turnFrame = turnFrameWithLocalExitNoteRoutingHints({
          turnFrame,
          noteInformation: operationRun.note_information ??
            operationRun.exit_memo ??
            null,
        });
        routeDecision = runConversationRouters({
          turn_frame: turnFrame,
          active_skill_state: currentActiveSkillState,
          safety_context_risk_band: safetyContextOutput.risk_band,
        });
        if (localFlowExitRedispatchCount <= 2) continue visibleOwnerDispatch;
        skillExitInjectedContext = [
          "LOCAL FLOW weekly_adaptive_review_v1 EXITED TO GLOBAL.",
          "Use this note as routing context.",
          JSON.stringify(
            operationRun.note_information ?? operationRun.exit_memo ?? null,
          ),
        ].join("\n");
      } else {
        const responseContent = finalVisibleText(
          weeklyRuntimeContent,
          routeDecision,
        );
        const effectLedger = effectLedgerForOperationRuntime(
          turnFrame.turn_id,
          operationRuntime,
        );
        const conversationTurnTrace = {
          turn_frame: turnFrame,
          route_decision: routeDecision,
          effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
          response_owner: routeDecision.response_owner,
          tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
        };
        try {
          const dispatcherStat = dispatcherV2Stats[0];
          await logConversationTurn({
            turn_id: turnFrame.turn_id,
            user_id: userId,
            source_message_id: turnFrame.source_message_id,
            ts: new Date().toISOString(),
            dispatcher_run: {
              latency_ms: dispatcherStat?.latency_ms ?? dispatcherLatencyMs,
              tokens_in: dispatcherStat?.tokens_in ?? 0,
              tokens_out: dispatcherStat?.tokens_out ?? 0,
              prompt_version: skipGlobalDispatcherForActiveLocalFlow
                ? "dispatcher_skipped_active_local_flow_v1"
                : dispatcherStat?.prompt_version ??
                  "dispatcher_v2_prompt_2026_05_s12",
              model_used: dispatcherStat?.model_name ?? null,
              memory_plan: turnFrame.memory_plan ??
                DEFAULT_DISPATCHER_MEMORY_PLAN,
            },
            turn_frame: conversationTurnTrace.turn_frame,
            route_decision: routeDecision,
            direct_effects: directEffectTrace(operationRuntime),
            effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
            tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
            confirmation_token_outcomes: [],
            memory_write_candidates_emitted: 0,
            response_owner: routeDecision.response_owner,
            total_latency_ms: Date.now() - turnStartMs,
          }, { supabase });
        } catch (error) {
          console.warn("[Router] logConversationTurn failed", error);
        }
        await persistEffectLedgerForRuntimeTurn({
          supabase,
          effectLedger,
          userId,
          sourceMessageId: turnFrame.source_message_id,
          requestId,
          channel,
          scope,
        });
        await updateUserState(supabase, userId, scope, {
          current_mode: "companion",
          temp_memory: tempMemory,
          last_processed_at: new Date().toISOString(),
          last_interaction_at: new Date().toISOString(),
        } as any);
        if (logMessages && responseContent) {
          await logMessage(
            supabase,
            userId,
            scope,
            "assistant",
            responseContent,
            "companion",
            {
              request_id: requestId,
              route_owner: "weekly_adaptive_review_v1",
              selected_handler: operationRun.selected_handler ?? null,
              runtime_safety_risk_band: runtimeSafetyRiskBand,
              dispatcher_latency_ms: dispatcherLatencyMs,
              context_latency_ms: 0,
              agent_latency_ms: 0,
            },
          );
        }
        await trace("brain:turn_complete", "io", {
          response_owner: "weekly_adaptive_review_v1",
          selected_handler: operationRun.selected_handler ?? null,
          executed_tools: operationRuntime?.executedTools ?? [],
          tool_execution: operationRuntime?.toolExecution ?? "none",
        }, "debug");
        return {
          content: responseContent,
          mode: "companion" as AgentMode,
          delivery: null,
          tool_execution: operationRuntime?.toolExecution ?? "none",
          executed_tools: operationRuntime?.executedTools ?? [],
          conversation_turn_trace: conversationTurnTrace,
        };
      }
    }
    if (isSafetyRoute(routeDecision)) {
      const skillStart = Date.now();
      if (
        !currentActiveSkillState &&
        !turnFrame.note_information
      ) {
        turnFrame = {
          ...turnFrame,
          note_information: buildSafetyCrisisActivationNoteInformation({
            userMessage,
            sourceMessageId: loggedMessageId ?? requestId,
            requestId,
            safetyContextOutput: {
              detected: turnFrame.safety.risk_band !== "none",
              risk_band: turnFrame.safety.risk_band,
              reason_codes: turnFrame.safety.reason_codes ?? [],
              evidence: turnFrame.safety.evidence ?? [],
              allow_side_effects: false,
              layer_contributions: {},
            } as any,
          }) as any,
        };
      }
      const skillOutput = await runSafetyCrisisSkill({
        user_message: userMessage,
        context: {
          skill_id: "safety_crisis",
          user_id: userId,
          recent_messages: recentMessagesForTurnFrame,
          active_skill_working_state: currentActiveSkillState as any,
          turn_frame: turnFrame,
          relevant_memory_items: [],
          plan_items: [],
          product_surfaces: [],
          exclusions: [],
          precomputed_safety_crisis_local_dispatcher_output:
            precomputedSafetyCrisisLocalDispatcherOutput,
        },
      });
      const skillLatencyMs = Date.now() - skillStart;
      tempMemory = applySafetyCrisisSkillState({
        tempMemory: tempMemory as Record<string, unknown>,
        activeSkillState: currentActiveSkillState,
        output: skillOutput,
      });
      const skillReply = String(skillOutput.reply ?? "").trim();
      const responseContent = finalVisibleText(
        mergeVisibleTextForTest(operationRuntime, skillReply),
        routeDecision,
      );
      const effectLedger = effectLedgerForOperationRuntime(
        turnFrame.turn_id,
        operationRuntime,
      );
      const conversationTurnTrace = {
        turn_frame: turnFrame,
        route_decision: routeDecision,
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        response_owner: routeDecision.response_owner,
        skill_run: {
          selected_skill_id: "safety_crisis",
          reason_code: routeDecision.reason_code,
          status: skillOutput.status,
          latency_ms: skillLatencyMs,
          diagnosis: skillOutput.diagnosis ?? null,
          ...(skillOutput.status === "exit"
            ? {
              exit_note_information:
                (skillOutput.state_patch?.exit_memo as any)?.note_information ??
                  null,
            }
            : {}),
        },
        tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
      };
      try {
        const dispatcherStat = dispatcherV2Stats[0];
        await logConversationTurn({
          turn_id: turnFrame.turn_id,
          user_id: userId,
          source_message_id: turnFrame.source_message_id,
          ts: new Date().toISOString(),
          dispatcher_run: {
            latency_ms: dispatcherStat?.latency_ms ?? dispatcherLatencyMs,
            tokens_in: dispatcherStat?.tokens_in ?? 0,
            tokens_out: dispatcherStat?.tokens_out ?? 0,
            prompt_version: skipGlobalDispatcherForActiveLocalFlow
              ? "dispatcher_skipped_active_local_flow_v1"
              : dispatcherStat?.prompt_version ??
                "dispatcher_v2_prompt_2026_05_s12",
            model_used: dispatcherStat?.model_name ?? null,
            memory_plan: turnFrame.memory_plan ??
              DEFAULT_DISPATCHER_MEMORY_PLAN,
          },
          turn_frame: conversationTurnTrace.turn_frame,
          route_decision: routeDecision,
          direct_effects: directEffectTrace(operationRuntime),
          effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
          skill_run: conversationTurnTrace.skill_run,
          tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
          confirmation_token_outcomes: [],
          memory_write_candidates_emitted: 0,
          response_owner: routeDecision.response_owner,
          total_latency_ms: Date.now() - turnStartMs,
        }, { supabase });
      } catch (error) {
        console.warn("[Router] logConversationTurn failed", error);
      }
      await persistEffectLedgerForRuntimeTurn({
        supabase,
        effectLedger,
        userId,
        sourceMessageId: turnFrame.source_message_id,
        requestId,
        channel,
        scope,
      });
      await updateUserState(supabase, userId, scope, {
        current_mode: "sentry",
        temp_memory: tempMemory,
        last_processed_at: new Date().toISOString(),
        last_interaction_at: new Date().toISOString(),
      } as any);
      if (logMessages && responseContent) {
        await logMessage(
          supabase,
          userId,
          scope,
          "assistant",
          responseContent,
          "sentry",
          {
            request_id: requestId,
            route_owner: routeDecision.response_owner,
            selected_handler: routeDecision.selected_handler ?? null,
            runtime_safety_risk_band: runtimeSafetyRiskBand,
            dispatcher_latency_ms: dispatcherLatencyMs,
            context_latency_ms: 0,
            agent_latency_ms: skillLatencyMs,
          },
        );
      }
      await trace("brain:turn_complete", "io", {
        response_owner: routeDecision.response_owner,
        selected_handler: routeDecision.selected_handler ?? null,
        executed_tools: operationRuntime?.executedTools ?? [],
        tool_execution: operationRuntime?.toolExecution ?? "none",
      }, "debug");
      return {
        content: responseContent,
        mode: "sentry" as AgentMode,
        delivery: null,
        tool_execution: operationRuntime?.toolExecution ?? "none",
        executed_tools: operationRuntime?.executedTools ?? [],
        conversation_turn_trace: conversationTurnTrace,
      };
    }

    if (
      routeDecision.response_owner === "product_help" ||
      routeDecision.response_owner === "coaching_recommendation" ||
      routeDecision.response_owner ===
        "daily_action_coaching_recommendation_v1" ||
      routeDecision.response_owner === "feature_opportunity" ||
      routeDecision.response_owner === "plan_realignment"
    ) {
      const skillId = routeDecision.response_owner;
      const skillStart = Date.now();
      const [
        recentEffectsSummary,
        recentDirectEffectConfirmationContext,
        skillUserIdentity,
      ] = await Promise.all([
        loadRecentEffectsLedgerSummary({
          supabase,
          userId,
          scope,
          userTimePromptBlock: userTime?.prompt_block,
          ledgerReadClient: serviceRoleLedgerReadClient(),
        }),
        loadRecentDirectEffectConfirmationContext({
          supabase,
          userId,
          scope,
          ledgerReadClient: serviceRoleLedgerReadClient(),
        }),
        loadUserIdentityPack(supabase, userId),
      ]);
      const context = buildConversationSkillContext({
        skillId,
        userId,
        recentMessages: recentMessagesForTurnFrame,
        activeSkillState: currentActiveSkillState,
        turnFrame,
        planItemSnapshot,
        inboundNote: turnFrame.note_information ?? null,
        recentEffectsSummary,
        recentDirectEffectConfirmationContext,
        userIdentity: skillUserIdentity,
      });
      const localOneShotDirectEffectExecutor = async (
        request: LocalOneShotDirectEffectRequest,
      ) => {
        const localOneShotDirectEffect = oneShotDirectEffectFromLocalRequest(
          request,
          { turnFrame },
        );
        if (!localOneShotDirectEffect || !turnFrame || !routeDecision) {
          return { turn_frame: turnFrame };
        }
        if (
          !turnFrame.direct_effects.some((effect) =>
            effect.effect_type === localOneShotDirectEffect.effect_type
          )
        ) {
          turnFrame = {
            ...turnFrame,
            direct_effects: [
              ...turnFrame.direct_effects,
              localOneShotDirectEffect,
            ],
          };
        }
        if (
          !routeDecision.direct_effects_to_run.includes(
            "create_one_shot_reminder",
          )
        ) {
          routeDecision = {
            ...routeDecision,
            direct_effects_to_run: [
              ...routeDecision.direct_effects_to_run,
              "create_one_shot_reminder",
            ],
            reason_code: routeDecision.reason_code.includes(
                "direct_effects",
              )
              ? routeDecision.reason_code
              : `${routeDecision.reason_code}_with_local_direct_effects`,
          };
        }
        const directEffectLane = await runDirectEffectLane({
          supabase,
          userId,
          userMessage,
          channel,
          userTimezone: userTime?.timezone ?? meta?.clientTimezone ?? "UTC",
          history,
          tempMemory,
          state,
          planItemSnapshot,
          turnFrame,
          routeDecision,
          safetyContextOutput,
          sourceMessageId: loggedMessageId ?? requestId,
          requestId,
          v2Runtime,
          clientNow,
          allowMessageIntakeFallback: false,
        });
        routeDecision = directEffectLane.routeDecision ?? routeDecision;
        tempMemory = directEffectLane.tempMemory ?? tempMemory;
        turnFrame = turnFrameWithDirectEffectRuntime(
          directEffectLane.turnFrame,
          directEffectLane.operationRuntime,
        ) ??
          (directEffectLane.turnFrame
            ? withDirectEffectConfirmationContext(directEffectLane.turnFrame)
            : directEffectLane.turnFrame) ??
          turnFrame;
        operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
          directRuntime: directEffectLane.operationRuntime,
          visibleRuntime: operationRuntime,
        });
        return { turn_frame: turnFrame };
      };
      const skillOutput = skillId === "product_help"
        ? await runProductHelpSkill({
          user_message: userMessage,
          context,
        })
        : skillId === "feature_opportunity"
        ? await runFeatureOpportunitySkill({
          user_message: userMessage,
          context,
          direct_effect_executor: localOneShotDirectEffectExecutor,
        })
        : skillId === "plan_realignment"
        ? await runPlanRealignmentSkill({
          user_message: userMessage,
          context,
          direct_effect_executor: localOneShotDirectEffectExecutor,
        })
        : skillId === "daily_action_coaching_recommendation_v1"
        ? await runDailyActionCoachingRecommendationSkill({
          user_message: userMessage,
          context,
        })
        : await runCoachingRecommendationSkill({
          user_message: userMessage,
          context,
          direct_effect_executor: localOneShotDirectEffectExecutor,
        });
      const skillLatencyMs = Date.now() - skillStart;
      const skillExitNoteInformation = skillOutputNoteInformation(skillOutput);
      const baseTempMemoryForSkillState = inboundDailyCoachingBridgeNote
        ? clearLastLocalFlowExitContext(tempMemory as Record<string, unknown>)
        : tempMemory as Record<string, unknown>;
      tempMemory = applyConversationSkillState({
        tempMemory: baseTempMemoryForSkillState,
        activeSkillState: currentActiveSkillState,
        skillId,
        output: skillOutput,
      });
      const target = skillOutputNoteTarget(skillOutput);
      const skillReply = String(skillOutput.reply ?? "").trim();
      if (
        skillOutput.status === "exit" && !skillReply && target === "global"
      ) {
        localFlowExitSkillRun = {
          selected_skill_id: skillId,
          reason_code: routeDecision.reason_code,
          status: skillOutput.status,
          latency_ms: skillLatencyMs,
          exit_target: target,
          exit_note_information: skillExitNoteInformation,
        };
        localFlowExitRedispatchCount += 1;
        currentActiveSkillState = null;
        turnFrame = await buildTurnFrameForRuntime({
          dispatcherInput: {
            ...dispatcherInput,
            active_skill_state: null,
            flow_state_context: localExitFlowStateContext({
              sourceFlowId: skillId,
              noteInformation: skillExitNoteInformation,
            }),
          },
          skipGlobalDispatcherForActiveLocalFlow: false,
          llmRunner: buildDispatcherLlmRunner({
            requestId,
            userId,
            model: meta?.model,
            forceRealAi: meta?.forceRealAi,
          }),
        });
        turnFrame = turnFrameWithLocalExitNoteRoutingHints({
          turnFrame,
          noteInformation: skillExitNoteInformation,
        });
        routeDecision = runConversationRouters({
          turn_frame: turnFrame,
          active_skill_state: currentActiveSkillState,
          safety_context_risk_band: safetyContextOutput.risk_band,
        });
        if (localFlowExitRedispatchCount <= 2) continue visibleOwnerDispatch;
        skillExitInjectedContext = [
          `LOCAL FLOW ${skillId} EXITED TO GLOBAL.`,
          "Use this note as routing context.",
          JSON.stringify(skillExitNoteInformation),
        ].join("\n");
      } else {
        const responseContent = finalVisibleText(
          mergeVisibleTextForTest(operationRuntime, skillReply),
          routeDecision,
        );
        const effectLedger = effectLedgerForOperationRuntime(
          turnFrame.turn_id,
          operationRuntime,
        );
        const conversationTurnTrace = {
          turn_frame: turnFrame,
          route_decision: routeDecision,
          effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
          response_owner: routeDecision.response_owner,
          skill_run: {
            selected_skill_id: skillId,
            reason_code: routeDecision.reason_code,
            status: skillOutput.status,
            latency_ms: skillLatencyMs,
            ...(skillOutput.status === "exit"
              ? {
                exit_target: target || null,
                exit_note_information: skillExitNoteInformation,
              }
              : {}),
          },
          tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
        };
        try {
          const dispatcherStat = dispatcherV2Stats[0];
          await logConversationTurn({
            turn_id: turnFrame.turn_id,
            user_id: userId,
            source_message_id: turnFrame.source_message_id,
            ts: new Date().toISOString(),
            dispatcher_run: {
              latency_ms: dispatcherStat?.latency_ms ?? dispatcherLatencyMs,
              tokens_in: dispatcherStat?.tokens_in ?? 0,
              tokens_out: dispatcherStat?.tokens_out ?? 0,
              prompt_version: skipGlobalDispatcherForActiveLocalFlow
                ? "dispatcher_skipped_active_local_flow_v1"
                : dispatcherStat?.prompt_version ??
                  "dispatcher_v2_prompt_2026_05_s12",
              model_used: dispatcherStat?.model_name ?? null,
              memory_plan: turnFrame.memory_plan ??
                DEFAULT_DISPATCHER_MEMORY_PLAN,
            },
            turn_frame: conversationTurnTrace.turn_frame,
            route_decision: routeDecision,
            direct_effects: directEffectTrace(operationRuntime),
            effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
            skill_run: conversationTurnTrace.skill_run,
            tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
            confirmation_token_outcomes: [],
            memory_write_candidates_emitted: 0,
            response_owner: routeDecision.response_owner,
            total_latency_ms: Date.now() - turnStartMs,
          }, { supabase });
        } catch (error) {
          console.warn("[Router] logConversationTurn failed", error);
        }
        await persistEffectLedgerForRuntimeTurn({
          supabase,
          effectLedger,
          userId,
          sourceMessageId: turnFrame.source_message_id,
          requestId,
          channel,
          scope,
        });
        await updateUserState(supabase, userId, scope, {
          current_mode: "companion",
          temp_memory: tempMemory,
          last_processed_at: new Date().toISOString(),
          last_interaction_at: new Date().toISOString(),
        } as any);
        if (logMessages && responseContent) {
          await logMessage(
            supabase,
            userId,
            scope,
            "assistant",
            responseContent,
            "companion",
            {
              request_id: requestId,
              route_owner: routeDecision.response_owner,
              selected_handler: routeDecision.selected_handler ?? null,
              runtime_safety_risk_band: runtimeSafetyRiskBand,
              dispatcher_latency_ms: dispatcherLatencyMs,
              context_latency_ms: 0,
              agent_latency_ms: skillLatencyMs,
            },
          );
        }
        await trace("brain:turn_complete", "io", {
          response_owner: routeDecision.response_owner,
          selected_handler: routeDecision.selected_handler ?? null,
          executed_tools: operationRuntime?.executedTools ?? [],
          tool_execution: operationRuntime?.toolExecution ?? "none",
        }, "debug");
        return {
          content: responseContent,
          mode: "companion" as AgentMode,
          delivery: null,
          tool_execution: operationRuntime?.toolExecution ?? "none",
          executed_tools: operationRuntime?.executedTools ?? [],
          conversation_turn_trace: conversationTurnTrace,
        };
      }
    }

    break;
  }

  const dispatcherSignals = dispatcherSignalsFromTurnFrame({
    turnFrame,
    userMessage,
  });
  const onDemandTriggers = buildOnDemandTriggersFromDispatcherSignals(
    dispatcherSignals,
  );
  const contextLoadStart = Date.now();
  const injectedContext = [
    opts?.contextOverride,
    skillExitInjectedContext,
    directEffectConfirmationContextPrompt(turnFrame),
    productHelpInjectedContext(routeDecision),
  ].filter(Boolean).join("\n\n") || undefined;
  const contextLoadResult = await loadContextForMode({
    supabase,
    userId,
    requestId,
    turnId: turnFrame.turn_id,
    channel,
    mode: "companion",
    message: userMessage,
    history,
    state,
    scope,
    tempMemory,
    userTime: userTime ?? undefined,
    triggers: onDemandTriggers,
    injectedContext,
    memoryPlan: turnFrame.memory_plan ?? DEFAULT_DISPATCHER_MEMORY_PLAN,
    v2Runtime,
  });
  try {
    const memoryV2Active = await runMemoryV2ActiveLoader({
      supabase,
      userId,
      scope,
      channel,
      requestId,
      turnId: turnFrame.turn_id,
      userMessage,
      history,
      tempMemory,
      memoryPlan: turnFrame.memory_plan ?? DEFAULT_DISPATCHER_MEMORY_PLAN,
      userTime: {
        user_timezone: userTime?.user_timezone ?? meta?.clientTimezone ?? null,
      },
    });
    const appliedMemoryV2 = applyMemoryV2ActiveLoaderResult(
      contextLoadResult,
      tempMemory as Record<string, unknown>,
      memoryV2Active,
    );
    tempMemory = appliedMemoryV2.tempMemory;
  } catch (error) {
    console.warn("[Router] Memory V2 active loader failed", error);
    await trace("brain:memory_v2_active_loader_failed", "context", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  const contextLatencyMs = Date.now() - contextLoadStart;
  const context = buildContextString(contextLoadResult.context);

  const routeIsPureDirectEffect =
    routeDecision.response_owner === "normal_reply" &&
    routeDecision.direct_effects_to_run.length > 0 &&
    operationRuntime?.content &&
    routeDecision.reason_code !== "direct_effects_then_normal_reply";
  const targetMode: AgentMode = opts?.forceMode === "sentry" ||
      routeDecision.response_owner === "safety"
    ? "sentry"
    : "companion";
  const shouldRunVisibleAgent = !routeIsPureDirectEffect ||
    routeDecision.response_owner === "safety";

  const agentStart = Date.now();
  const agentOut = shouldRunVisibleAgent
    ? await runAgentAndVerify({
      supabase,
      userId,
      scope,
      channel,
      userMessage,
      history,
      state,
      context,
      targetMode,
      nCandidates: 1,
      checkupActive: false,
      stopCheckup: false,
      isPostCheckup: false,
      outageTemplate:
        "J'ai un souci technique sur ce tour. Je n'ai rien execute de plus.",
      sophiaChatModel: meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
      tempMemory,
      meta: {
        ...(meta ?? {}),
        requestId,
        userId,
        blockSideEffects: true,
      },
    })
    : {
      responseContent: operationRuntime?.content ?? "",
      nextMode: "companion" as AgentMode,
      tempMemory,
      toolExecution: operationRuntime?.toolExecution ?? "none",
      executedTools: operationRuntime?.executedTools ?? [],
      toolAck: null,
      outageFallback: false,
      outageFailedMode: null,
      outageErrorMessage: null,
    };
  const agentLatencyMs = Date.now() - agentStart;

  tempMemory = cleanupLegacyRuntimeState(agentOut.tempMemory ?? tempMemory);
  if (localFlowExitSkillRun) {
    tempMemory = clearActiveConversationSkillState(
      tempMemory as Record<string, unknown>,
    );
  }
  const responseContent = finalVisibleText(
    mergeVisibleTextForTest(operationRuntime, agentOut.responseContent),
    routeDecision,
  );

  const agentToolExecution = String(agentOut.toolExecution ?? "none") as
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain";
  const agentExecutedTools = executedToolsForStatus(
    agentToolExecution,
    Array.isArray(agentOut.executedTools) ? agentOut.executedTools : [],
    [],
  );
  const operationExecutedTools = operationRuntime?.executedTools ?? [];
  const combinedExecutedTools = [
    ...new Set([...operationExecutedTools, ...agentExecutedTools]),
  ];
  const combinedToolExecution = operationRuntime?.toolExecution !== "none" &&
      operationRuntime?.toolExecution
    ? operationRuntime.toolExecution
    : agentToolExecution;

  const effectLedger = effectLedgerForOperationRuntime(
    turnFrame.turn_id,
    operationRuntime,
  );
  const conversationTurnTrace = {
    turn_frame: turnFrame,
    route_decision: routeDecision,
    effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
    response_owner: routeDecision.response_owner,
    skill_run: localFlowExitSkillRun,
    tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
  };

  try {
    const dispatcherStat = dispatcherV2Stats[0];
    await logConversationTurn({
      turn_id: turnFrame.turn_id,
      user_id: userId,
      source_message_id: turnFrame.source_message_id,
      ts: new Date().toISOString(),
      dispatcher_run: {
        latency_ms: dispatcherStat?.latency_ms ?? dispatcherLatencyMs,
        tokens_in: dispatcherStat?.tokens_in ?? 0,
        tokens_out: dispatcherStat?.tokens_out ?? 0,
        prompt_version: skipGlobalDispatcherForActiveLocalFlow
          ? "dispatcher_skipped_active_local_flow_v1"
          : dispatcherStat?.prompt_version ??
            "dispatcher_v2_prompt_2026_05_s12",
        model_used: dispatcherStat?.model_name ?? null,
        memory_plan: turnFrame.memory_plan ?? DEFAULT_DISPATCHER_MEMORY_PLAN,
      },
      turn_frame: conversationTurnTrace.turn_frame,
      route_decision: routeDecision,
      direct_effects: directEffectTrace(operationRuntime),
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      skill_run: localFlowExitSkillRun ??
        (routeDecision.response_owner === "product_help" ||
            isSafetyRoute(routeDecision)
          ? {
            selected_skill_id: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
          }
          : undefined),
      tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
      confirmation_token_outcomes: [],
      memory_write_candidates_emitted: 0,
      response_owner: routeDecision.response_owner,
      total_latency_ms: Date.now() - turnStartMs,
    }, { supabase });
  } catch (error) {
    console.warn("[Router] logConversationTurn failed", error);
    await trace("brain:conversation_turn_trace_failed", "routing", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  await persistEffectLedgerForRuntimeTurn({
    supabase,
    effectLedger,
    userId,
    sourceMessageId: turnFrame.source_message_id,
    requestId,
    channel,
    scope,
  });

  await updateUserState(supabase, userId, scope, {
    current_mode: agentOut.nextMode ?? "companion",
    temp_memory: tempMemory,
    last_processed_at: new Date().toISOString(),
    last_interaction_at: new Date().toISOString(),
  } as any);

  if (logMessages && responseContent) {
    await logMessage(
      supabase,
      userId,
      scope,
      "assistant",
      responseContent,
      agentOut.nextMode ?? "companion",
      {
        request_id: requestId,
        route_owner: routeDecision.response_owner,
        selected_handler: routeDecision.selected_handler ?? null,
        runtime_safety_risk_band: runtimeSafetyRiskBand,
        dispatcher_latency_ms: dispatcherLatencyMs,
        context_latency_ms: contextLatencyMs,
        agent_latency_ms: agentLatencyMs,
      },
    );
  }

  await trace("brain:turn_complete", "io", {
    response_owner: routeDecision.response_owner,
    selected_handler: routeDecision.selected_handler ?? null,
    executed_tools: combinedExecutedTools,
    tool_execution: combinedToolExecution,
  }, "debug");

  return {
    content: responseContent,
    mode: agentOut.nextMode ?? "companion",
    delivery: (agentOut as any).delivery ?? null,
    tool_execution: combinedToolExecution,
    executed_tools: combinedExecutedTools,
    conversation_turn_trace: conversationTurnTrace,
  };
}

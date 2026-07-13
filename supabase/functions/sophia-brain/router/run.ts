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
  applyPresenceFlowState,
  commitPresenceResult,
  type PresenceApplyResult,
} from "../skills/presence_conversation/apply.ts";
import { stripToPresenceContext } from "../skills/presence_conversation/context.ts";
import { buildPresenceSystemBlock } from "../skills/presence_conversation/prompt.ts";
import { buildPresenceThreadContext } from "../skills/presence_conversation/thread.ts";
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
  runTrackProgressRuntimeLane,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";
import {
  type LocalOneShotDirectEffectRequest,
  oneShotDirectEffectFromLocalRequest,
} from "./one_shot_local_direct_effect.ts";
import {
  ageLastTrackCommitMarker,
  lastTrackCommitForDispatcher,
  pendingTrackProgressClarificationForDispatcher,
} from "../tools/always_on/track_progress_plan_item/router.ts";
import {
  pendingOneShotReminderClarificationForDispatcher,
} from "../tools/always_on/one_shot_reminder/router.ts";
import {
  activePlanSnapshotPromptBlock,
  buildDirectEffectConfirmationContext,
  committedCorrectionReplyOverride,
  directEffectConfirmationContextPrompt,
  withDirectEffectConfirmationContext,
} from "./direct_effect_local_context.ts";
import { runResearchGroundingLane } from "./research_grounding.ts";
import {
  sessionDecisionFromCoachingState,
  sessionDecisionFromFeatureOpportunityState,
  sessionDecisionFromPlanRealignmentState,
  sessionDecisionsPromptBlock,
  withSessionDecision,
} from "./session_decisions.ts";
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
  safetyCrisisOneShotDirectEffectDecision,
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

function dispatcherModelCandidate(value: unknown): string | null {
  const model = String(value ?? "").trim();
  if (!model) return null;
  return /^\s*gemini\b/i.test(model) ? null : model;
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
      const model = dispatcherModelCandidate(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL"),
      ) ??
        dispatcherModelCandidate(input.model_name) ??
        dispatcherModelCandidate(meta?.model) ??
        dispatcherModelCandidate(getGlobalAiModel()) ??
        "gpt-5.4-mini";
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
  sessionDecisionsBlock?: string | null;
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
      // alex-r3 B01 (ceinture): meme si le routage envoie un recall de
      // session vers un skill, le bloc de decisions reste visible — un
      // routage rate ne produit plus une fausse amnesie.
      session_decisions_block: args.sessionDecisionsBlock ?? null,
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
  // eva-r7 B01: un engagement de STYLE pris en session (flow feature_
  // opportunity, decide par le dispatcher local) survit au flow — il est
  // porte en cle de session et re-injecte au composeur a CHAQUE tour.
  if (args.skillId === "feature_opportunity" && args.output.state_patch) {
    const commitment = String(
      (args.output.state_patch as Record<string, unknown>)
        .session_style_commitment ?? "",
    ).trim();
    if (commitment) {
      next = installSessionStyleCommitment(
        next as Record<string, unknown>,
        commitment,
      ) as typeof next;
    }
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
    // nina-r6 B01: la recommandation retenue (deja structuree dans l'etat du
    // flow) est capturee a CHAQUE tour — elle survit au relachement du flow
    // et grounde recall/recap/reparation via le bloc DECISIONS DE SESSION.
    next = withSessionDecision(
      next,
      sessionDecisionFromCoachingState(
        args.output.state_patch.coaching_recommendation_local_state,
      ),
    );
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
    // paul-r9 B02 / nina-r7 B04: le hand-off (initiative a creer, preference
    // a regler) est une decision de session — capture structuree, meme
    // mecanique que coaching.
    next = withSessionDecision(
      next,
      sessionDecisionFromFeatureOpportunityState(
        args.output.state_patch.feature_opportunity_local_state,
      ),
    );
  }
  if (args.skillId === "plan_realignment" && args.output.state_patch) {
    const note = args.output.state_patch.plan_realignment_note_information;
    if (note) {
      next.__last_plan_realignment_exit_memo = {
        note_information: note,
        at: new Date().toISOString(),
      };
    }
    // nina-r7 B04: l'ajustement discute (jamais execute depuis le chat) est
    // un reste-a-faire de session — le recap ne l'omet plus.
    next = withSessionDecision(
      next,
      sessionDecisionFromPlanRealignmentState(
        args.output.state_patch.plan_realignment_local_state,
      ),
    );
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

function finalVisibleText(
  text: unknown,
  routeDecision: RouteDecision | null,
  turnFrame?: TurnFrame | null,
) {
  // paul-r6 B01: sur un commit de CORRECTION track, la reply deterministe du
  // tool remplace la paraphrase du composeur — l'historique (refus du tour
  // precedent) ne peut plus battre le contrat du tour. Meme famille que le
  // reply override safety: verite contractuelle > eloquence.
  const correctionOverride = committedCorrectionReplyOverride(
    turnFrame ?? null,
  );
  let out = stripHiddenHtmlComments(correctionOverride ?? text);
  out = stripDeprecatedProductVocabulary(out);
  if (!isSafetyRoute(routeDecision)) {
    out = ensureVisibleSophiaEmoji(out);
    out = ensureClarifyQuestionVisible(out, turnFrame ?? null);
  }
  return out.trim();
}

/**
 * P2-2 (nina-untested R1-B02, rose-lifecycle R1-B05): un outcome
 * needs_clarify d'un tool skill DOIT aboutir à une question visible — le
 * composeur la supprimait (« reste seulement signalée, pas confirmée »),
 * rendant la boucle de ré-armement 3g inarmable, ou pire, AFFIRMAIT l'effet
 * (verify rose T15). Reformuler est permis (toute question compte) ;
 * supprimer non : la question contractuelle de la lane est ré-injectée.
 */
export function ensureClarifyQuestionVisible(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  if (!turnFrame || text.includes("?")) return text;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const clarify = (context?.effects_outcome ?? []).find((outcome) =>
    outcome.status === "needs_clarify" &&
    String(outcome.clarify_question ?? "").trim().length > 0
  );
  if (!clarify) return text;
  return `${text.trim()}\n\n${String(clarify.clarify_question).trim()}`;
}

/**
 * Installe un engagement de style SESSION dans temp_memory (dédup + fenêtre
 * de 3). Deux producteurs: le dispatcher local feature_opportunity
 * (state_patch, eva-r7 B01) et le dispatcher GLOBAL via le champ racine
 * `session_style_commitment_hint` du TurnFrame (P1-2, ALEX-CPR-B04 — capture
 * quel que soit l'owner du tour, même sans signal feature_opportunity).
 */
function installSessionStyleCommitment(
  tempMemory: Record<string, unknown>,
  commitment: string,
): Record<string, unknown> {
  const clean = String(commitment ?? "").trim();
  if (!clean) return tempMemory;
  const previous = Array.isArray(tempMemory.__session_style_commitments)
    ? (tempMemory.__session_style_commitments as unknown[]).map(String)
    : [];
  return {
    ...tempMemory,
    __session_style_commitments: [
      ...previous.filter((c) => c !== clean),
      clean,
    ].slice(-3),
  };
}

function sessionStyleCommitmentsPromptBlock(
  tempMemory: Record<string, unknown> | null | undefined,
): string | null {
  const raw = (tempMemory as Record<string, unknown> | null | undefined)
    ?.__session_style_commitments;
  const commitments = Array.isArray(raw)
    ? raw.map((c) => String(c ?? "").trim()).filter(Boolean)
    : [];
  if (commitments.length === 0) return null;
  return [
    "=== CONTRAINTE DE STYLE SESSION (engagement pris) ===",
    ...commitments.map((c) => `- ${c}`),
    "Cet engagement, pris avec le user sur cette conversation, PRIME sur tout reflexe de style par defaut (emoji de warmth compris), y compris en mode soutien. Si la contrainte dit sans emojis: ZERO emoji.",
  ].join("\n");
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
  // Fenetre de re-arm O4: une clarification d'ecriture posee au tour
  // precedent est exposee une fois au dispatcher pour qu'il re-emette
  // l'effet complete si le message courant y repond (eva-r2 B01).
  // P2-3d (rose-lifecycle R1-B03): meme fenetre pour le clarify REPLACE
  // rappel. Hoistee hors du builder: le ré-arm déterministe post-dispatcher
  // (P2-4b) relit la même clarification (l'exposition ne se consomme qu'une
  // fois).
  const pendingClarificationForTurn =
    pendingTrackProgressClarificationForDispatcher(tempMemory) ??
      pendingOneShotReminderClarificationForDispatcher(tempMemory);
  const dispatcherInput: RunDispatcherInput = {
    user_message: userMessage,
    recent_messages: recentMessagesForTurnFrame,
    user_id: userId,
    channel,
    active_skill_state: activeFlowState.activeSkillState,
    flow_state_context: (() => {
      const pendingClarification = pendingClarificationForTurn;
      // P2-4a: fait structuré du dernier commit track — rend 3h-bis
      // exécutable (retarget_from clé en main, plus de fouille de
      // recent_messages qui échouait en émission).
      const lastTrackCommit = lastTrackCommitForDispatcher(tempMemory);
      // Le flow presence n'a PAS de dispatcher local: le dispatcher global
      // doit savoir qu'une discussion de fond est active pour classer le
      // mouvement du tour (context.kind). Flag minimal — pas de dump d'etat.
      const presenceActive = String(
        (activeFlowState.activeSkillState as any)?.skill_id ?? "",
      ) === "presence_conversation";
      if (
        !lastLocalFlowExitContext && !pendingClarification && !presenceActive &&
        !lastTrackCommit
      ) return null;
      return {
        ...(lastLocalFlowExitContext
          ? { last_local_flow_exit: lastLocalFlowExitContext }
          : {}),
        ...(pendingClarification
          ? { pending_direct_effect_clarification: pendingClarification }
          : {}),
        ...(presenceActive ? { presence_conversation_active: true } : {}),
        ...(lastTrackCommit ? { last_track_commit: lastTrackCommit } : {}),
      };
    })(),
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
    // P3-A: traîne pregate — les scores des tours précédents viennent de
    // temp_memory (commit post-génération plus bas).
    conversation_risk_history: Array.isArray(
        (tempMemory as Record<string, unknown>)?.__conversation_risk_scores,
      )
      ? (tempMemory as Record<string, unknown>)
        .__conversation_risk_scores as number[]
      : [],
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
  // P1-2 (ALEX-CPR-B04): un engagement de STYLE session se capture QUEL QUE
  // SOIT l'owner du tour — le dispatcher global porte la contrainte au champ
  // RACINE `session_style_commitment_hint` (un signal skill non-detected est
  // droppé par la normalisation, la contrainte arrive souvent sans opportunité
  // produit); on l'installe ici, avant routing, pour que le bloc CONTRAINTE DE
  // STYLE SESSION soit vrai dès ce tour et les suivants.
  // Session only (temp_memory) — jamais une préférence durable (BF-PREF-01).
  // NB: le companion reconstruit temp_memory depuis l'état pré-routing — cette
  // installation rend les blocs prompt vrais dès CE tour, et elle est
  // RÉ-APPLIQUÉE post-génération (même pattern que le commit présence).
  const sessionStyleCommitmentHintForTurn = String(
    turnFrame.session_style_commitment_hint ?? "",
  ).trim().slice(0, 200);
  if (sessionStyleCommitmentHintForTurn) {
    tempMemory = installSessionStyleCommitment(
      tempMemory,
      sessionStyleCommitmentHintForTurn,
    );
  }
  // P2-4b (nina-untested R1-B03): ré-arm DÉTERMINISTE sur confirmation pure.
  // Le 3g demande au dispatcher de ré-émettre l'effet quand le user confirme
  // la cible proposée — l'émission restait flaky (« bah si je te confirme, à
  // 100% » → aucun effet, 2e blocage d'un report légitime). Quand le frame
  // classe la réponse en confirmation (kind=yes) et que la clarification
  // track pendante porte des slots complets sur une question de CIBLE,
  // l'effet se synthétise depuis les known_slots — les gardes aval (G1
  // fenêtre, idempotence, same-day) restent entières.
  if (
    pendingClarificationForTurn?.effect_type === "track_progress_plan_item" &&
    ["target_not_evidenced", "target_ambiguous", "target_missing"].includes(
      String(pendingClarificationForTurn.reason_code ?? ""),
    )
  ) {
    const slots = (pendingClarificationForTurn.known_slots ?? {}) as Record<
      string,
      unknown
    >;
    const pendingTargetId = String(slots.target_item_id ?? "").trim();
    const progressStatus = String(slots.progress_status ?? "").trim();
    const hasTrackEffect = turnFrame.direct_effects.some((effect) =>
      effect.effect_type === "track_progress_plan_item"
    );
    if (pendingTargetId && !hasTrackEffect &&
      turnFrame.confirmation_response?.kind === "yes" && progressStatus
    ) {
      // Aucun effet ré-émis mais confirmation classée: synthèse depuis les
      // known_slots.
      turnFrame = {
        ...turnFrame,
        direct_effects: [...turnFrame.direct_effects, {
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: pendingTargetId,
            status_hint: progressStatus,
            ...(String(slots.date_hint ?? "").trim()
              ? { date_hint: String(slots.date_hint) }
              : {}),
            target_evidence: String(slots.target_title ?? ""),
          },
        }],
      };
    } else if (pendingTargetId && hasTrackEffect) {
      // Effet ré-émis vers LA cible que la question proposait: c'est une
      // RÉSOLUTION de clarification, pas une correction — le dispatcher pose
      // parfois correction=true sur « si je te confirme que c'est ça » et la
      // garde correction-sans-retarget re-bloquait un report légitime (3e
      // blocage). Normalisation du flag, retarget absent uniquement.
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.map((effect) => {
          if (effect.effect_type !== "track_progress_plan_item") return effect;
          const payload = (effect.payload_hint ?? {}) as Record<
            string,
            unknown
          >;
          if (
            String(payload.target_item_id ?? "") !== pendingTargetId ||
            payload.correction !== true ||
            String(payload.retarget_from ?? "").trim()
          ) return effect;
          const { correction: _correction, ...rest } = payload;
          return { ...effect, payload_hint: rest };
        }),
      };
    }
  }
  const dispatcherLatencyMs = Date.now() - dispatcherStart;

  let currentActiveSkillState = activeFlowState.activeSkillState;
  const presenceFlowEnabled = envFlagEnabled("SOPHIA_PRESENCE_FLOW_ENABLED");
  let routeDecision = runConversationRouters({
    turn_frame: turnFrame,
    active_skill_state: currentActiveSkillState,
    safety_context_risk_band: safetyContextOutput.risk_band,
    presence_flow_enabled: presenceFlowEnabled,
  });

  // ── Flow présence: transition calculée AVANT tout runtime ────────────────
  // Sur une SORTIE (tool_pull / topic_change / closure / expired), le tour
  // est re-dispatché globalement immédiatement (charte cmd 17): le user qui
  // demande une carte atterrit dans coaching CE tour-ci, pas au suivant.
  // Le commit de l'état (poubelle ou maintien) reste fait post-génération.
  let presenceApplyResult: PresenceApplyResult | null = null;
  let presenceExited = false;
  let presenceNowIso = "";
  if (routeDecision.response_owner === "presence_conversation") {
    const presenceSignal = turnFrame.skill_signals.presence_conversation;
    const presenceKind = presenceSignal?.context?.kind ?? "maintain";
    presenceNowIso = turnFrame.direct_effect_time_context?.now_utc ??
      new Date().toISOString();
    const presenceLocalDate =
      (turnFrame.direct_effect_time_context?.user_local_datetime ?? "")
        .slice(0, 10) || presenceNowIso.slice(0, 10);
    presenceApplyResult = applyPresenceFlowState({
      tempMemory: tempMemory as Record<string, unknown>,
      activeSkillState: currentActiveSkillState,
      kind: presenceKind,
      nowIso: presenceNowIso,
      localDate: presenceLocalDate,
      topicHint: presenceSignal?.context?.topic_hint ?? null,
      entryReason: routeDecision.reason_code,
    });
    console.log(
      `[presence] request_id=${requestId} transition=${presenceApplyResult.transition}` +
        ` kind=${presenceKind}` +
        (presenceApplyResult.exit_reason
          ? ` exit_reason=${presenceApplyResult.exit_reason}`
          : "") +
        ` turns=${presenceApplyResult.flow_state?.turns_in_flow ?? 0}`,
    );
    if (presenceApplyResult.transition === "exit") {
      // Poubelle immédiate + re-dispatch global du MÊME tour. L'entrée
      // présence est désactivée sur ce re-routage pour éviter la ré-entrée
      // instantanée sur le signal du tour de sortie.
      presenceExited = true;
      currentActiveSkillState = null;
      tempMemory = clearActiveConversationSkillState(
        tempMemory as Record<string, unknown>,
      );
      routeDecision = runConversationRouters({
        turn_frame: turnFrame,
        active_skill_state: null,
        safety_context_risk_band: safetyContextOutput.risk_band,
        presence_flow_enabled: false,
      });
      console.log(
        `[presence] request_id=${requestId} exit_reroute owner=${routeDecision.response_owner} reason=${routeDecision.reason_code}`,
      );
      presenceApplyResult = null; // état déjà purgé, rien à committer.
    }
  }
  // Entrée présence atteinte via la sortie d'un AUTRE flow local (ex: coaching
  // → exit_to_global_dispatcher sur dépôt discursif → re-dispatch → présence).
  // Le bloc de transition ci-dessus a tourné avant la boucle des owners: il
  // faut appliquer l'entrée ici, sinon la génération présence (contexte
  // strippé + fil + état collant) ne s'arme pas sur le tour de re-dispatch.
  const applyPresenceEntryAfterLocalFlowExit = () => {
    if (routeDecision.response_owner !== "presence_conversation") return;
    if (presenceApplyResult) return;
    const presenceSignal = turnFrame.skill_signals.presence_conversation;
    presenceNowIso = turnFrame.direct_effect_time_context?.now_utc ??
      new Date().toISOString();
    const presenceLocalDate =
      (turnFrame.direct_effect_time_context?.user_local_datetime ?? "")
        .slice(0, 10) || presenceNowIso.slice(0, 10);
    presenceApplyResult = applyPresenceFlowState({
      tempMemory: tempMemory as Record<string, unknown>,
      activeSkillState: currentActiveSkillState,
      kind: presenceSignal?.context?.kind ?? "maintain",
      nowIso: presenceNowIso,
      localDate: presenceLocalDate,
      topicHint: presenceSignal?.context?.topic_hint ?? null,
      entryReason: routeDecision.reason_code,
    });
    console.log(
      `[presence] request_id=${requestId} transition=${presenceApplyResult.transition}` +
        ` after_local_flow_exit turns=${
          presenceApplyResult.flow_state?.turns_in_flow ?? 0
        }`,
    );
  };
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
    const safetyDirectEffectDecision = safetyCrisisOneShotDirectEffectDecision(
      precomputedSafetyCrisisLocalDispatcherOutput,
      { turnFrame },
    );
    const localOneShotDirectEffect = safetyDirectEffectDecision.effect;
    // Demande explicite non admise ce tour (confiance/contenu/danger): le
    // stage product_tool_boundary la differe HONNETEMENT au lieu du silence
    // (eva-r9 B01, arbitrage 2026-07-08). Jamais pose sur un tour escalate
    // (deja exclu par la decision) pour ne pas degrader le stage d'urgence.
    if (
      safetyDirectEffectDecision.deferred_reason &&
      precomputedSafetyCrisisLocalDispatcherOutput
    ) {
      precomputedSafetyCrisisLocalDispatcherOutput = {
        ...precomputedSafetyCrisisLocalDispatcherOutput,
        product_tool_boundary: {
          attempted: true,
          attempt_kind: "tool_creation",
          defer_reason: safetyDirectEffectDecision.deferred_reason,
        },
      };
    }
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
  let trackProgressReexecuted = false;

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
    // Meme logique pour track_progress: sous flow local actif, le dispatcher
    // global est saute, donc un report d'action qui provoque l'exit du flow
    // ne surface l'effet qu'apres le redispatch (Alex R2-B01). La lane est
    // idempotente par source_message_id (TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY),
    // donc pas de risque de double commit.
    if (
      localFlowExitRedispatchCount > 0 &&
      !trackProgressReexecuted &&
      turnFrameHasRunnableDirectEffect(turnFrame, "track_progress_plan_item")
    ) {
      trackProgressReexecuted = true;
      const reexecTrackRuntime = await runTrackProgressRuntimeLane({
        tempMemory,
        turnFrame,
        sourceMessageId: loggedMessageId ?? requestId,
        userMessage,
        planItemSnapshot,
        supabase,
        userId,
        channel,
        v2Runtime,
        trackProgressBlockedReasonCode: null,
        evidenceMessages: (history ?? [])
          .slice(-2)
          .map((entry: any) => String(entry?.content ?? ""))
          .filter(Boolean),
      });
      if (reexecTrackRuntime) {
        turnFrame = turnFrameWithDirectEffectRuntime(
          turnFrame,
          reexecTrackRuntime,
        ) ?? turnFrame;
        operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
          directRuntime: reexecTrackRuntime,
          visibleRuntime: operationRuntime,
        });
      }
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
          // Un flow qui rend la main sur un dépôt discursif doit pouvoir
          // atterrir en présence CE tour (l'entrée reste gouvernée par le
          // signal du dispatcher re-sollicité).
          presence_flow_enabled: presenceFlowEnabled,
        });
        applyPresenceEntryAfterLocalFlowExit();
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
          turnFrame,
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
          // P1-4: échec visible après retries (cf. autre call site).
          console.error(
            "[Router] logConversationTurn failed after retries",
            { turn_id: turnFrame.turn_id, error: String(error) },
          );
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
        turnFrame,
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
        // P1-4: après retries épuisés, l'échec doit être VISIBLE dans les
        // logs d'audit (un tour sans trace fausse toute vérification QA).
        console.error(
          "[Router] logConversationTurn failed after retries",
          { turn_id: turnFrame.turn_id, error: String(error) },
        );
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
        sessionDecisionsBlock: sessionDecisionsPromptBlock(
          tempMemory as Record<string, unknown>,
        ),
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
          // Un flow qui rend la main sur un dépôt discursif (ex: coaching →
          // exit_to_global_dispatcher) doit pouvoir atterrir en présence CE
          // tour — sans ce flag, le re-dispatch retombait en normal_reply
          // malgré un signal présence high (run nav-frontieres-r2, B6'-T5).
          presence_flow_enabled: presenceFlowEnabled,
        });
        applyPresenceEntryAfterLocalFlowExit();
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
          turnFrame,
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
          // P1-4: échec visible après retries (cf. autre call site).
          console.error(
            "[Router] logConversationTurn failed after retries",
            { turn_id: turnFrame.turn_id, error: String(error) },
          );
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
  // needs_research (regression 3de0b9a2): le signal structure du dispatcher
  // declenche l'execution — la logique vit dans research_grounding.ts, run.ts
  // n'orchestre que l'appel et l'injection (charte cmd 4/6).
  const researchGrounding = await runResearchGroundingLane({
    turnFrame,
    requestId,
  });
  const injectedContext = [
    opts?.contextOverride,
    researchGrounding.context_block,
    researchGrounding.honesty_directive,
    skillExitInjectedContext,
    directEffectConfirmationContextPrompt(turnFrame),
    // F3: la section que la regle companion designe comme source de verite
    // des recaps de plan — construite a chaque tour, inconditionnelle.
    activePlanSnapshotPromptBlock(planItemSnapshot),
    productHelpInjectedContext(routeDecision),
    // eva-r6 B02: directive de tour pour la preemption detresse SANS ideation
    // — le companion sortait un cadrage urgences disproportionne. Donnee de
    // tour (budget companion preserve), pas une regle de prompt.
    // eva-r7 B01: contrainte de style de session — donnee de tour, portee
    // par l'etat, injectee a chaque tour tant que la session vit.
    sessionStyleCommitmentsPromptBlock(tempMemory),
    sessionDecisionsPromptBlock(tempMemory),
    routeDecision.reason_code === "distress_support_priority"
      ? [
        "=== TOUR DE SOUTIEN (detresse non imminente) ===",
        "Soutien groundé sur ce que la personne vient de dire: valide, reste present, une question douce au plus.",
        "AUCUNE ressource d'urgence, hotline ou consigne de securite ('te faire du mal', 'urgences'): ces cadrages sont reserves a l'ideation, absente ici — les employer sur-escalade et inquiete.",
        "Aucun dispositif, carte, potion ou feature ce tour. Pas de lexique clinique ('stabilise').",
        "Si un effet legitime (rappel, coche) est COMMITTE ce tour (voir le contexte de confirmation): confirme-le en UNE ligne sobre EN FIN de reponse — jamais en ouverture, le soutien vient d'abord (V5-1).",
      ].join("\n")
      : null,
    // P3-E (nina-global18 T15): recall d'intention mémoire explicite avec
    // mémoire durable potentiellement vide — la réponse restitue depuis
    // l'HISTORIQUE de cette conversation, jamais une liste de techniques
    // substituée. Directive de tour, déclenchée par le plan du frame.
    String(turnFrame.memory_plan?.response_intent ?? "").toLowerCase()
        .includes("recall")
      ? [
        "=== RECALL (restitution demandée) ===",
        "Si la mémoire durable ne porte pas le fait demandé, cherche-le dans l'historique de CETTE conversation (le user l'a peut-être confié il y a quelques tours) et restitue-le exactement.",
        "Introuvable des deux côtés → dis-le honnêtement en une phrase. Ne substitue JAMAIS une liste d'outils, de techniques ou un récap générique à la place du fait demandé.",
      ].join("\n")
      : null,
    // P2-7a (eva-global17 R1-B01): TRAINE COURTE post-détresse — le pregate
    // évalue le tour isolément, un band medium à N retombait à none à N+1 et
    // la confirmation d'un rappel bénin OUVRAIT la réponse (« C'est posé pour
    // demain à 12h30 » en 1re phrase sur « me lâche pas maintenant »).
    // L'arbitrage V5-1 (soutien d'abord, confirmation sobre en fin) vaut
    // aussi au tour qui suit. Donnée de tour, un seul tour de traîne.
    (() => {
      const lastBand = String(
        (tempMemory as Record<string, unknown>)?.__last_turn_risk_band ?? "",
      );
      const currentBand = String(turnFrame.safety?.risk_band ?? "none");
      if (!["medium", "high", "critical"].includes(lastBand)) return null;
      if (["medium", "high", "critical"].includes(currentBand)) return null;
      return [
        "=== TRAINE POST-DETRESSE (le tour precedent etait charge) ===",
        "Le message precedent portait une detresse reelle. Meme si ce tour execute un effet legitime (rappel, coche), la composition reste SOUTIEN D'ABORD: ouvre par la presence a ce que la personne traverse; la confirmation de l'effet vient EN FIN, en une ligne sobre. Ne commence JAMAIS par 'C'est pose/note/cale pour...'.",
      ].join("\n");
    })(),
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

  // ── Flow présence (mode ami): assemblage de génération ──────────────────
  // La transition (enter/maintain/exit) a été décidée en amont, juste après
  // le routing (les sorties ont déjà été re-dispatchées). Ici: conversation
  // pure — contexte STRIPPÉ (aucun bloc produit, garantie structurelle) +
  // FIL DE LA DISCUSSION verbatim depuis l'entrée (soupape résumé en cas de
  // débordement) + prompt de présence + modèle deep.
  let presenceContext: string | null = null;
  let presenceModel: string | null = null;
  if (
    routeDecision.response_owner === "presence_conversation" &&
    presenceApplyResult && presenceApplyResult.flow_state
  ) {
    const thread = await buildPresenceThreadContext({
      supabase,
      userId,
      scope,
      flowState: presenceApplyResult.flow_state,
      requestId,
    });
    // Le repli éventuel du fil met à jour le résumé porté par l'état.
    presenceApplyResult = {
      ...presenceApplyResult,
      flow_state: thread.flowState,
    };
    presenceContext = [
      buildPresenceSystemBlock(),
      // P1-2 (ALEX-CPR-B04): l'allowlist presence retirait le bloc de
      // contrainte de style session — la presence promettait « je retiens »
      // puis répondait en pavé. L'engagement PRIME aussi en mode ami.
      sessionStyleCommitmentsPromptBlock(tempMemory) ?? "",
      buildContextString(stripToPresenceContext(contextLoadResult.context)),
      thread.block,
    ].filter((part) => part && part.trim().length > 0).join("\n\n");
    presenceModel =
      String(Deno.env.get("SOPHIA_COMPANION_MODEL_DEEP") ?? "").trim() || null;
  }

  const routeIsPureDirectEffect =
    routeDecision.response_owner === "normal_reply" &&
    routeDecision.direct_effects_to_run.length > 0 &&
    operationRuntime?.content &&
    routeDecision.reason_code !== "direct_effects_then_normal_reply" &&
    // P3-A (rose-hard15 T10, probe P3-2): un tour de détresse medium ne se
    // rend JAMAIS par la reply cannée de la lane (elle ouvre par « C'est
    // programmé... ») — le composeur passe, avec la directive soutien
    // d'abord + confirmation sobre en fin.
    routeDecision.reason_code !== "distress_support_priority";
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
      context: presenceContext ?? context,
      targetMode,
      nCandidates: 1,
      checkupActive: false,
      stopCheckup: false,
      isPostCheckup: false,
      outageTemplate:
        "J'ai un souci technique sur ce tour. Je n'ai rien execute de plus.",
      sophiaChatModel: presenceModel ?? meta?.model ?? getGlobalAiModel(),
      tempMemory,
      meta: {
        ...(meta ?? {}),
        requestId,
        userId,
        blockSideEffects: true,
        // Présence sur gpt-5.4: effort de raisonnement LOW. Sans ça, le
        // reasoning model tourne à l'effort par défaut de l'API (medium/high)
        // et crame son budget de sortie en raisonnement interne → contenu
        // visible VIDE de façon intermittente (bug observé au replay du 09/07).
        ...(presenceContext ? { reasoningEffort: "low" as const } : {}),
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
  // P1-2 (ALEX-CPR-B04): le companion reconstruit temp_memory depuis l'état
  // PRÉ-routing (agents/companion.ts, nextTempMemory) — l'engagement de style
  // installé avant routing serait perdu ici. Ré-application sur la tempMemory
  // finale, même pattern que le commit présence ci-dessous.
  if (sessionStyleCommitmentHintForTurn) {
    tempMemory = installSessionStyleCommitment(
      tempMemory,
      sessionStyleCommitmentHintForTurn,
    );
  }
  // P2-4a: vieillissement du marqueur de dernier commit track (mutation
  // in-place — la garde de bascule de cible ne regarde que le tour N-1).
  ageLastTrackCommitMarker(tempMemory, turnFrame.source_message_id ?? null);
  // P2-7a: mémoire d'un tour du band effectif — alimente la TRAINE
  // POST-DETRESSE du tour suivant (commit post-génération, zone sûre).
  // P3-A: + historique de scores pour la traîne du pregate
  // (conversation_risk) — band → score (medium 6, high 9, critical 10),
  // majoré à 10 si le tour était une crise (owner safety).
  {
    const effectiveBand = String(
      runtimeSafetyRiskBand ?? turnFrame.safety?.risk_band ?? "none",
    );
    const bandScore = effectiveBand === "critical"
      ? 10
      : effectiveBand === "high"
      ? 9
      : effectiveBand === "medium"
      ? 6
      : effectiveBand === "low"
      ? 2
      : 0;
    const turnScore = isSafetyRoute(routeDecision)
      ? Math.max(bandScore, 10)
      : bandScore;
    const previousTrail = Array.isArray(
        (tempMemory as Record<string, unknown>).__conversation_risk_scores,
      )
      ? (tempMemory as Record<string, unknown>)
        .__conversation_risk_scores as number[]
      : [];
    tempMemory = {
      ...(tempMemory as Record<string, unknown>),
      __last_turn_risk_band: effectiveBand,
      __conversation_risk_scores: [...previousTrail, turnScore].slice(-5),
    };
  }
  // Commit de l'état présence sur la tempMemory finale (post-génération) pour
  // ne pas se faire écraser par le générateur: enter/maintain → persiste le
  // flow (collant), exit → efface (poubelle + re-dispatch global au prochain
  // tour).
  if (presenceApplyResult) {
    tempMemory = commitPresenceResult(
      tempMemory as Record<string, unknown>,
      presenceApplyResult,
      presenceNowIso,
    );
  } else if (presenceExited) {
    // Sur une SORTIE présence, garantir que l'état effacé survit à toute
    // réassignation de tempMemory pendant la génération/le loader mémoire
    // (sinon le tour suivant re-verrait la présence active).
    tempMemory = clearActiveConversationSkillState(
      tempMemory as Record<string, unknown>,
    );
  }
  const responseContent = finalVisibleText(
    mergeVisibleTextForTest(operationRuntime, agentOut.responseContent),
    routeDecision,
    turnFrame,
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

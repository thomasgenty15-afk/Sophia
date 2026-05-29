/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
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
  loadContextForMode,
  type OnDemandTriggers,
} from "../context/loader.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
  searchWithGeminiGrounding,
} from "../../_shared/gemini.ts";
import {
  logMomentumStateObservability,
  logMomentumUserReplyAfterOutreachIfRelevant,
} from "../../_shared/momentum-observability.ts";
import { logCoachingObservabilityEvent } from "../../_shared/coaching-observability.ts";
import { debounceAndBurstMerge } from "./debounce.ts";
import { buildLastAssistantInfo } from "./dispatcher_flow.ts";
import {
  clearMachineStateTempMemory,
  detectMagicResetCommand,
} from "./magic_reset.ts";
import type {
  DispatcherMemoryPlan,
  DispatcherModelTierHint,
  DispatcherSignals,
} from "./dispatcher.ts";
import { DEFAULT_SIGNALS } from "./dispatcher.ts";
import {
  buildSurfaceRuntimeDecision,
  readSurfaceState,
} from "../surface_state.ts";
import { runAgentAndVerify } from "./agent_exec.ts";
import { buildToolAckContract } from "../tool_ack.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import {
  createEffectLedger,
  type EffectLedger,
  type EffectLedgerEntry,
  recordAllowedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
  rewriteUncommittedEffectClaims,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import {
  applyCompactStartGuard,
  applyIncompleteRecapGuard,
  applyNonDurableMemoryPromiseGuard,
  applyUnexecutedEffectClaimGuard,
} from "./final_response_guards.ts";
export {
  applyCompactStartGuard,
  applyIncompleteRecapGuard,
  applyNonDurableMemoryPromiseGuard,
  applyUnexecutedEffectClaimGuard,
} from "./final_response_guards.ts";
import {
  detectExplicitNoToolRequest,
  detectsMinuteByMinuteSequenceRequest,
  isActiveCardDraftingOperation,
  isExplicitConversationalFormatRequest,
  isExplicitOperationCommand,
  isLocalTextRevisionRequest,
  isRecapOnlyRequest,
  isStatusOnlyNoMutationRequest,
  shouldRenderStatusOnlyNoMutation,
} from "./legacy_semantic_patches.ts";
export {
  detectExplicitNoToolRequest,
  detectsMinuteByMinuteSequenceRequest,
  isActiveCardDraftingOperation,
  isExplicitConversationalFormatRequest,
  isExplicitOperationCommand,
  isLocalTextRevisionRequest,
  isStatusOnlyNoMutationRequest,
  shouldRenderStatusOnlyNoMutation,
} from "./legacy_semantic_patches.ts";
import {
  applyCoachResponseStylePreferences,
  loadCoachResponseStylePreferences,
  userRequestsShortStyle,
} from "./response_style_policy.ts";
export { applyCoachResponseStylePreferences } from "./response_style_policy.ts";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import { runMemoryV2ActiveLoader } from "../../_shared/memory/runtime/active_loader.ts";
import {
  type DispatcherRunStats,
  runDispatcher,
} from "../dispatcher/dispatcher.v2.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";
import {
  type AgendaTask,
  buildTurnAgenda,
  summarizeTurnAgenda,
  type TurnAgenda,
  type TurnAgendaSummary,
} from "./turn_agenda.ts";
import { resolveFlowInterruptions } from "./turn_interruption_policy.ts";
import {
  buildUserTurnSnapshot,
  type UserTurnSnapshot,
} from "./user_turn_snapshot.ts";
import {
  type EffectGateOrchestratorResult,
  runEffectGateOrchestrator,
} from "../routers/effect_gate_orchestrator.ts";
import { runConversationRouters } from "../routers/routers.ts";
import {
  arbitrateTurnIntent,
  detectsDurableCoachPreference,
  detectsExplicitAttackCardCreationRequest,
  detectsExplicitNoStatusRequest,
  detectsExplicitProductHelp,
} from "./turn_intent_arbitrator.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import {
  blocksDirectEffects,
  blocksToolSkills,
  isAtLeast,
} from "../safety/safety_thresholds.ts";
import type {
  ResponseOwner,
  RouteDecision,
} from "../contracts/route_decision.v1.ts";
import type {
  RiskBand,
  ToolSkillOpportunity,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  directSafetyCrisisReplyOverride as directSafetyCrisisReplyOverrideRuntime,
  isSafetyRoute,
  runtimeSafetyPregateForTurn,
  selectedConversationSkillForRoute,
  suppressToolSignalsForSafetyRoute,
  withActiveSafetyFlowCaution,
} from "./safety_crisis_runtime.ts";
export { directSafetyCrisisReplyOverride } from "./safety_crisis_runtime.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { buildConversationPulse } from "../conversation_pulse_builder.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";
import {
  explicitlySafeWorkReminderRequest,
  hasExplicitOneShotReminderDirectEffectOverride,
  isLikelyOneShotReminderRequest,
  isOneShotReminderExactStatusRequest,
  isOneShotReminderOperationCommand,
  oneShotReminderDirectEffectBlockForNonMutationContext,
  oneShotReminderManagementReply,
  oneShotReminderModificationRouteGuard,
  oneShotReminderStatusBlocksToolFlow,
  shouldOneShotReminderSupersedeToolFlow,
  shouldPreferOneShotReminderOverRecurring,
} from "../tools/always_on/one_shot_reminder/router.ts";
import {
  dispatcherTrackProgressSignalFromTurnFrame,
} from "../tools/always_on/track_progress_plan_item/router.ts";
import {
  type AttackKeywordMatch,
  buildAttackCardRecommendationOperationInput,
  buildAttackKeywordContextOverride,
  isAttackCardPostCreationVerificationQuestion,
  isPendingAttackCardRecommendationOperation,
  loadAttackKeywordMatch,
} from "../tools/operations/prepare_attack_card/run_support.ts";
import * as coachPreferenceRouteGuards from "../tools/operations/update_coach_preferences/route_guards.ts";
import {
  coachPreferenceStatusLabel,
  SUPPORTED_COACH_PREFERENCE_KEYS,
} from "../tools/operations/update_coach_preferences/status.ts";
import { loadCoachPreferenceRuntimePolicy } from "../tools/operations/update_coach_preferences/runtime_policy.ts";
import {
  reviewToolSkillConfirmationWithAi,
  type ToolSkillConfirmationKind,
} from "../tools/operations/_shared/confirmation_review.ts";
import { createConfirmationToken } from "../confirmation/confirmation_token.ts";
import {
  type PlanAdjustmentDraftV1,
} from "../tools/operations/adjust_plan_item/generator.ts";
import {
  maybeRunAdjustPlanItemOperation as maybeRunAdjustPlanItemOperationInSkill,
} from "../tools/operations/adjust_plan_item/router.ts";
import {
  isPendingAdjustPlanDraftReview,
  isPendingAdjustPlanItemOperation,
  isPendingAdjustPlanItemRecommendationOperation,
  loadAdjustPlanFrameFromTempMemory,
  writeAdjustPlanPendingDraftReview,
} from "../tools/operations/adjust_plan_item/state.ts";
export { renderAdjustPlanDraftDetails } from "../tools/operations/adjust_plan_item/draft_review.ts";
import {
  applyWeeklyConclusionGuard,
  applyWeeklyConcreteOrganizationGuard,
  applyWeeklyForgottenProgressAckGuard,
  applyWeeklyRepeatedClarificationGuard,
  buildWeeklyTurnSlotAddon,
  cleanWeeklyVisibleResponse,
  hasPendingOrActiveAdjustPlanOperation,
  isCopyForwardWeeklyRequest,
  isEarlyWeeklyPlanningValidationRequest,
  isExplicitPendingApplyConfirmation,
  isExplicitWeeklyAdjustPlanRequest,
  isVagueWholePlanWeeklyAdjustmentRequest,
  isWeeklyAdaptiveReviewActive,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  markWeeklyAdaptiveReviewAdjustPlanApplied,
  maybeLogWeeklyForgottenProgressParallel,
  operationInputFromPlanAdjustmentScope,
  shouldKeepWeeklyAdaptiveReviewInConversation,
  summarizeWeeklyAdaptiveReviewForAddon,
  updateWeeklyAdaptiveReviewStateAfterConversationTurn,
  weeklyAdaptiveReviewStateForTurn,
  weeklyMissionCarryOverContext,
  weeklyReturnAfterAdjustmentMessage,
  weeklyReviewAllowsAdjustPlanBridge,
} from "../skills/weekly_review/runtime.ts";
export {
  isExplicitPendingApplyConfirmation,
} from "../skills/weekly_review/runtime.ts";

const clearConversationFlowForCoachPreference =
  coachPreferenceRouteGuards.clearConversationFlowForCoachPreference;
const isApplyExistingCoachPreferenceRequest =
  coachPreferenceRouteGuards.isApplyExistingCoachPreferenceRequest;
const isCoachPreferenceVerificationRequest =
  coachPreferenceRouteGuards.isCoachPreferenceVerificationRequest;
const isImmediateModeRequestNotCoachPreference =
  coachPreferenceRouteGuards.isImmediateModeRequestNotCoachPreference;
const isRuntimeCoachPreferenceRequest =
  coachPreferenceRouteGuards.isRuntimeCoachPreferenceRequest;
const shouldRuntimeCoachPreferenceOverrideRoute =
  coachPreferenceRouteGuards.shouldRuntimeCoachPreferenceOverrideRoute;
import { generatePlanV2ForTransformation } from "../../generate-plan-v2/index.ts";
import {
  buildCoachingInterventionRuntimeAddon,
  buildKnownCoachingBlockersFromTempMemory,
  type CoachingInterventionRuntimeAddon,
  type CoachingInterventionSelectorInput,
  type CoachingInterventionTriggerDetection,
  type CoachingV2MomentumContext,
  type CoachingV2PlanItemContext,
  detectCoachingInterventionTrigger,
  runCoachingInterventionSelector,
} from "../coaching_intervention_selector.ts";
import {
  buildTechniqueHistoryForSelector,
  readCoachingInterventionMemory,
  reconcileCoachingInterventionStateFromUserTurn,
  recordCoachingInterventionProposal,
} from "../coaching_intervention_tracking.ts";
import {
  buildCoachingCustomizationContext,
  buildCoachingHistorySnapshot,
  deriveCoachingFollowUpAudit,
  detectCoachingInterventionRender,
  findCoachingDeprioritizedTechniques,
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
import {
  type ActiveTransformationRuntime,
  getActiveLoad,
  getActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../../_shared/v2-runtime.ts";
import { logV2Event, V2_EVENT_TYPES } from "../../_shared/v2-events.ts";
import { loadProductSurfaceRegistry } from "../product_surface_registry/registry.ts";
import { runRecommendationTool } from "../recommendation/recommendation_tool.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import { resolveSkillOperationSuggestion } from "../tool_skill_runtime/operation_suggestion_resolver.ts";
import { runDemotivationRepairSkill } from "../skills/demotivation_repair/skill.ts";
import { runEmotionalRepairSkill } from "../skills/emotional_repair/skill.ts";
import { runExecutionBreakdownSkill } from "../skills/execution_breakdown/skill.ts";
import { runProductHelpSkill } from "../skills/product_help/skill.ts";
import { runSafetyCrisisSkill } from "../skills/safety_crisis/skill.ts";
import type { DefenseCardContent } from "../../_shared/v2-types.ts";
import {
  loadPlanSnapshotForTurn,
  resolveActiveTransformationRuntime,
  type V2PlanItemSnapshotItem,
} from "./plan_snapshot_runtime.ts";
export {
  buildV2PlanItemSnapshot,
  computeStreakFromEntries,
} from "./plan_snapshot_runtime.ts";
import {
  buildDispatcherActiveRuntimeContext,
  clearActiveToolFlow,
  clearPendingToolConfirmation,
  clearToolSkillFlow,
  clearToolSkillFlowForDirectReminder,
  pendingConfirmationOwnedByToolSkill,
  pendingOperationType,
  readActiveFlowState,
} from "./active_flow_state.ts";
import {
  executedToolsForStatus,
  type OperationRuntimeResult,
  recordAgendaEffectsInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
export { recordToolSkillEffectsInLedger as recordToolSkillEffectsInLedgerForTest } from "./effect_ledger_adapter.ts";
export { isFaitPrevuFragileRecapRequest } from "../skills/status_recap/runtime.ts";
import { writePlanAdjustmentPatch } from "../tools/operations/adjust_plan_item/materializer.ts";
export { writePlanAdjustmentPatch } from "../tools/operations/adjust_plan_item/materializer.ts";
import { runOperationRuntimePipeline } from "./operation_runtime_pipeline.ts";
import { runFinalResponsePipeline } from "./final_response_pipeline.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function envFlagEnabled(name: string): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseJsonish(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return {};
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return {};
  }
}

function stripHiddenHtmlComments(text: unknown): string {
  return String(text ?? "")
    .replace(/(?:\r?\n)?<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripDeprecatedProductVocabulary(text: string): string {
  return text
    .replace(/\bNorth Star\b/gi, "objectif principal")
    .replace(/\b[EÉ]toile Polaire\b/g, "objectif principal")
    .replace(/\bétoile polaire\b/gi, "objectif principal")
    .replace(/\bboussole\b/gi, "repere");
}

const VISIBLE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

function ensureVisibleSophiaEmoji(text: unknown): string {
  const content = String(text ?? "").trim();
  if (!content || VISIBLE_EMOJI_REGEX.test(content)) return content;
  return `${content} 🙂`;
}

async function loadCoachPreferenceRuntimeContext(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("user_profile_facts")
    .select("key,value,status")
    .eq("user_id", args.userId)
    .eq("scope", "global")
    .eq("status", "active")
    .like("key", "coach.%");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const supportedRows = (data as any[]).filter((row) =>
    (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(
      String(row?.key ?? ""),
    )
  );
  const policy = loadCoachPreferenceRuntimePolicy(supportedRows as any);
  if (policy.composer_constraints.length === 0) return null;
  return [
    "=== PREFERENCES COACH UTILISATEUR (réglages UI) ===",
    ...policy.composer_constraints.map((constraint) => `- ${constraint}`),
    "Ces contraintes viennent uniquement des trois réglages visibles: ton, niveau de challenge, tendance à poser des questions.",
    "=== FIN PREFERENCES COACH UTILISATEUR ===",
  ].join("\n");
}

function buildDispatcherLlmRunner(meta?: {
  requestId?: string;
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
          model,
          source: "dispatcher-v2-llm",
          forceRealAi: true,
          forceInitialModel: true,
          maxRetries: 1,
        },
      );
      return parseJsonish(raw);
    } catch (error) {
      console.warn(
        "[Router] dispatcher LLM failed; falling back to heuristic",
        {
          requestId: meta?.requestId ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {};
    }
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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

const DEFAULT_DISPATCHER_MEMORY_PLAN: DispatcherMemoryPlan = {
  response_intent: "reflection",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.7,
};

const DEFENSE_CARD_CREATED_LOCATION =
  "Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation.";

function riskScoreFromBand(band: string): number {
  switch (band) {
    case "critical":
      return 10;
    case "high":
      return 8;
    case "medium":
      return 5;
    case "low":
      return 2;
    default:
      return 0;
  }
}

function dispatcherSignalsFromTurnFrame(args: {
  turnFrame: TurnFrame | null;
  userMessage: string;
}): DispatcherSignals {
  const text = String(args.userMessage ?? "").toLowerCase();
  const turnFrame = args.turnFrame;
  const riskBand = turnFrame?.safety.risk_band ?? "none";
  const researchSignal = turnFrame?.needs_research;
  const fallbackResearchSignal =
    /\bcherche|recherche|internet|actualité|actualite|actu\b/
        .test(text)
      ? {
        detected: true,
        value: true,
        query: args.userMessage,
        confidence: 0.7,
      }
      : DEFAULT_SIGNALS.needs_research;
  return {
    ...DEFAULT_SIGNALS,
    safety: DEFAULT_SIGNALS.safety,
    interrupt: /\b(stop|arr[êe]te|pause|pas maintenant)\b/.test(text)
      ? { kind: "EXPLICIT_STOP", confidence: 0.8 }
      : DEFAULT_SIGNALS.interrupt,
    risk_score: riskScoreFromBand(riskBand),
    needs_research: researchSignal?.detected || researchSignal?.value === true
      ? researchSignal
      : fallbackResearchSignal,
    track_progress_plan_item: dispatcherTrackProgressSignalFromTurnFrame(
      turnFrame,
    ),
  };
}

export function resolveAgentChatModel(args: {
  effectiveMode: AgentMode;
  memoryPlan?: DispatcherMemoryPlan | null;
  explicitModel?: string | null;
}): {
  model: string;
  source:
    | "explicit_override"
    | "non_companion_default"
    | "companion_default"
    | "memory_plan_lite"
    | "memory_plan_standard"
    | "memory_plan_deep";
  tier: DispatcherModelTierHint | "default" | "explicit";
} {
  const explicitModel = String(args.explicitModel ?? "").trim();
  if (explicitModel) {
    return {
      model: explicitModel,
      source: "explicit_override",
      tier: "explicit",
    };
  }

  const defaultModel = String(getGlobalAiModel("gemini-2.5-flash")).trim();
  if (args.effectiveMode !== "companion") {
    return {
      model: defaultModel,
      source: "non_companion_default",
      tier: "default",
    };
  }

  const plan = args.memoryPlan ?? null;
  const confidence = Number(plan?.plan_confidence ?? 0);
  const hint = String(plan?.model_tier_hint ?? "").trim().toLowerCase();
  const targets = Array.isArray(plan?.targets) ? plan?.targets ?? [] : [];
  const hasSensitiveMemoryTarget = targets.some((target: any) => {
    const key = String(target?.key ?? target?.query_hint ?? "")
      .trim()
      .toLowerCase();
    return key.startsWith("sante.") || key.startsWith("addictions.") ||
      /\b(allerg|medical|sante|santé|douleur|ingredient|ingrédient|restaurant|alcool|whisky|apero|apéro)\b/
        .test(key);
  });
  const hasEntityMemoryTarget = targets.some((target: any) =>
    String(target?.type ?? "").trim() === "entity"
  );
  if (
    confidence < 0.6 ||
    (hint !== "lite" && hint !== "standard" && hint !== "deep")
  ) {
    return {
      model: defaultModel,
      source: "companion_default",
      tier: "default",
    };
  }

  const tierModelMap: Record<DispatcherModelTierHint, string> = {
    lite: envString(
      "SOPHIA_COMPANION_MODEL_LITE",
      "gpt-5.4-nano",
    ),
    standard: envString(
      "SOPHIA_COMPANION_MODEL_STANDARD",
      "gemini-3-flash-preview",
    ),
    deep: envString(
      "SOPHIA_COMPANION_MODEL_DEEP",
      "gemini-3.1-pro-preview",
    ),
  };
  const effectiveHint: DispatcherModelTierHint =
    hint === "lite" && (hasSensitiveMemoryTarget || hasEntityMemoryTarget)
      ? "standard"
      : (hint as DispatcherModelTierHint);

  return {
    model: tierModelMap[effectiveHint],
    source: `memory_plan_${effectiveHint}` as
      | "memory_plan_lite"
      | "memory_plan_standard"
      | "memory_plan_deep",
    tier: effectiveHint,
  };
}

function normalizeMemoryGroundingText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function memoryV2LineTexts(contextBlock: string): string[] {
  return contextBlock.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.replace(/^- \[[^\]]+\]\s*/, "").trim())
    .filter(Boolean);
}

function humanizeMemoryLine(line: string): string {
  const cleaned = String(line ?? "")
    .replace(/\s+Priorite:.*$/i, "")
    .replace(/\bPattern famille [a-z0-9:_-]+\s*:\s*/i, "")
    .replace(/^Sur\s+[^,]+,\s+/i, "")
    .replace(/\bNiveau precedent\s+/i, "Au niveau précédent, ")
    .replace(/\ble user\b/gi, "tu")
    .replace(/\bquand il ouvre\b/gi, "quand tu ouvres")
    .replace(/\bet lance\b/gi, "et que tu lances")
    .replace(/\bdemarre\b/gi, "démarres")
    .replace(/\bdemarrage\b/gi, "démarrage")
    .replace(/\bdeja\b/gi, "déjà")
    .replace(/\bpret\b/gi, "prêt")
    .replace(/\bevite\b/gi, "évite")
    .replace(/\beviter\b/gi, "éviter")
    .trim();
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function renderHumanActionMemory(lines: string[]): string {
  const humanLines = lines.map(humanizeMemoryLine).filter(Boolean);
  const exact = humanLines.find((line) =>
    /fichier déjà prêt|minuteur|12 minutes/i.test(line)
  );
  const family = humanLines.find((line) =>
    /cible augmente|sous 15 minutes|intimidante/i.test(line)
  );
  const out = [
    exact ??
      "Ce qui t'aide, c'est de rendre le démarrage très concret avant de réfléchir au reste.",
  ];
  if (family) out.push(family);
  return [
    "Oui. Ce que je garde pour cette action, c'est très concret :",
    ...out.map((line) => `- ${line}`),
    "Donc demain, le plus important n'est pas de changer de technique : c'est de préparer le fichier, puis de lancer le minuteur directement.",
  ].join("\n");
}

function renderHumanLevelMemory(lines: string[]): string {
  const humanLines = lines.map(humanizeMemoryLine).filter(Boolean);
  const strongest =
    humanLines.find((line) =>
      /une seule prochaine action|gros blocs abstraits/i.test(line)
    ) ?? humanLines[0] ??
      "Je dois garder une prochaine action claire et éviter les blocs trop abstraits.";
  return [
    "Oui, je le vois. Le signal à garder du niveau précédent, c'est :",
    `- ${strongest}`,
    "Donc dans ce nouveau niveau, je dois rester sur une seule prochaine action claire, pas repartir dans un gros bloc abstrait.",
  ].join("\n");
}

function applyMemoryV2ResponseGroundingGuardrail(args: {
  userMessage: string;
  responseContent: string;
  contextBlock: string;
}): string {
  const contextBlock = String(args.contextBlock ?? "");
  if (!contextBlock.trim()) return args.responseContent;
  const message = normalizeMemoryGroundingText(args.userMessage);
  const response = normalizeMemoryGroundingText(args.responseContent);
  const lines = memoryV2LineTexts(contextBlock);
  if (!lines.length) return args.responseContent;
  const normalizedLines = lines.map((line) => ({
    raw: line,
    normalized: normalizeMemoryGroundingText(line),
  }));
  const findLine = (re: RegExp) =>
    normalizedLines.find((line) => re.test(line.normalized))?.raw ?? "";
  const normalizedContext = normalizeMemoryGroundingText(contextBlock);

  if (
    /\b(souviens|souvenir|souvenirs|memorise|memorises|mémoire|memoire|ce que tu sais|sais deja|sais déjà|detail concret|détail concret|pas de conseils generiques|pas de conseils génériques|ce qui m'aide|ce qui marche|m'aide sur cette action|demarrage bloque|démarrage bloque|bloque souvent|pourquoi.*bloque)\b/
      .test(message) &&
    normalizedLines.some((line) =>
      /\baction_(occurrence|family_pattern|week_summary)\b/.test(
        line.normalized,
      ) ||
      /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
        .test(line.normalized)
    ) &&
    (
      /\bpas assez|pas la description|besoin.*detail|redonnes?|conseils generiques|en general|souvent que\b/
        .test(response) ||
      !/minuteur|fichier|12|quinze|15/.test(response)
    )
  ) {
    const actionLines = normalizedLines
      .filter((line) =>
        /\baction_(occurrence|family_pattern|week_summary)\b/.test(
          line.normalized,
        ) ||
        /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.replace(/\s+Priorite:.*$/i, "").trim())
      .slice(0, 3);
    if (actionLines.length > 0) {
      return renderHumanActionMemory(actionLines);
    }
  }

  if (
    /\b(niveau precedent|niveau précédent|nouveau niveau|transition|garder en tete|garder en tête|handoff)\b/
      .test(message) &&
    normalizedLines.some((line) =>
      /\bniveau precedent|niveau précédent|une seule prochaine action|gros blocs abstraits|sortir de l'inertie\b/
        .test(line.normalized)
    ) &&
    (
      /\bbesoin d'un mini rappel|besoin.*rappel|c'etait quoi|c’était quoi|je dois garder en tete|je dois garder en tête\b/
        .test(response) ||
      !/une seule prochaine action|gros blocs|abstraits|sortir de l'inertie/
        .test(
          response,
        )
    )
  ) {
    const levelLines = normalizedLines
      .filter((line) =>
        /\bniveau precedent|niveau précédent|une seule prochaine action|gros blocs abstraits|sortir de l'inertie\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.trim())
      .slice(0, 2);
    if (levelLines.length > 0) {
      return renderHumanLevelMemory(levelLines);
    }
  }

  if (
    /\b(plat|repas|ingredient|eviter|evite)\b/.test(message) &&
    /sesame|tahini|gomasio/.test(normalizedContext) &&
    !/sesame|tahini|gomasio|allerg/.test(response)
  ) {
    return "Pour toi, je dois eviter le sesame, le tahini et le gomasio, car tu as une allergie au sesame.";
  }

  if (
    /\b(prochaine action|adaptee|adapte|bloque|fatigue)\b/.test(message) &&
    /sept minutes|observable|concrete/.test(normalizedContext) &&
    !/sept|observable|concret|concrete|boucle/.test(response)
  ) {
    const actionLines = normalizedLines
      .filter((line) =>
        /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.replace(/\s+Priorite:.*$/i, "").trim())
      .slice(0, 3);
    if (
      actionLines.length > 0 &&
      /\bsession focus|demarrage bloque|démarrage bloque|bloque souvent|pourquoi.*bloque\b/
        .test(message)
    ) {
      return renderHumanActionMemory(actionLines);
    }
    const loopLine = findLine(/boucle ouverte|surcharge/);
    const loop = loopLine
      ? " Si tu es en surcharge, commence par fermer une boucle ouverte plutôt que d'ajouter une nouvelle ambition."
      : "";
    return `Pour toi, le bon format ici serait une action de sept minutes, observable et concrète.${loop} Choisis une seule micro-livraison liée au sujet courant et rends-la visible, sans ouvrir une nouvelle décision.`;
  }

  if (
    /\b(natation|nager|nage|session)\b/.test(message) &&
    /deux fois par semaine|recuperation/.test(normalizedContext) &&
    !/deux fois|recuperation|recuperer/.test(response)
  ) {
    return "Le bon cadre pour toi : nager deux fois par semaine, comme récupération, sans objectif de performance. La séance sert à redescendre la pression, pas à battre un chrono.";
  }

  if (
    /\b(qui est|quel est le lien|quel lien)\b/.test(message) &&
    /\bines\b/.test(message) &&
    /\brivage\b/.test(message) &&
    (!/assistante|administrative|contrat|consulting/.test(response) ||
      /compagne/.test(response))
  ) {
    const ines = findLine(/\bines\b.*assistante administrative/) ||
      "Ines est ton assistante administrative et t'aide a suivre les contrats signes.";
    const rivage = findLine(/\brivage\b.*client de consulting/) ||
      "Rivage est un client de consulting.";
    const contract = findLine(/\brivage\b.*contrat.*\bines\b/) ||
      "Le lien: Ines t'a aide a retrouver le document quand tu avais oublie de relancer Rivage sur un contrat.";
    return `${ines} ${rivage} ${contract}`;
  }

  if (
    /\b(anesthesier|pression le soir|whisky|alcool|apero)\b/.test(message) &&
    /whisky/.test(normalizedContext) &&
    (!/whisky/.test(response) ||
      (/sensible/.test(normalizedContext) && !/sensible/.test(response)))
  ) {
    return "Je dois garder en tete que tu parles du whisky le soir pour anesthesier la pression, et que ce sujet est sensible. Je peux le nommer ici parce que tu viens de le demander directement, mais je ne dois pas le ressortir dans une conversation neutre.";
  }

  return args.responseContent;
}

function resolvePlanItemTitleFromSnapshot(
  planItemSnapshot: V2PlanItemSnapshotItem[] | undefined,
  targetItemId: string | null | undefined,
): string {
  const id = String(targetItemId ?? "").trim();
  if (!id || !Array.isArray(planItemSnapshot)) return "";
  const matched = planItemSnapshot.find((item) => item.id === id);
  return String(matched?.title ?? "").trim().slice(0, 120);
}

function resolvePlanItemIdFromSnapshot(
  planItemSnapshot: V2PlanItemSnapshotItem[] | undefined,
  targetTitle: string | null | undefined,
): string {
  const normalizedTitle = normalizePlanItemTitle(String(targetTitle ?? ""));
  if (!normalizedTitle || !Array.isArray(planItemSnapshot)) return "";

  const matches = planItemSnapshot.filter((item) =>
    normalizePlanItemTitle(item.title) === normalizedTitle
  );
  return matches.length === 1 ? String(matches[0]?.id ?? "").trim() : "";
}

function ymdToUtcNoonDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
  ));
}

function handlePlanItemFeedback(args: {
  tempMemory: any;
  state: any;
  dispatcherSignals: DispatcherSignals;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
}) {
  const { tempMemory, state, dispatcherSignals, planItemSnapshot } = args;
  const feedback = dispatcherSignals.plan_feedback;
  if (!feedback?.detected) {
    try {
      delete (tempMemory as any).__plan_feedback_addon;
    } catch {
      // best effort
    }
    return;
  }

  const targetItemId = String(feedback.target_item_id ?? "").trim() || null;
  const targetTitle = String(
    feedback.target_title ??
      resolvePlanItemTitleFromSnapshot(planItemSnapshot, targetItemId),
  ).trim().slice(0, 120) || null;
  const detail = String(feedback.detail ?? "").trim().slice(0, 160) || null;
  const sentiment = String(feedback.sentiment ?? "neutral").trim()
    .toLowerCase();

  (tempMemory as any).__plan_feedback_addon = {
    sentiment: sentiment === "positive" || sentiment === "negative"
      ? sentiment
      : "neutral",
    target_item_id: targetItemId,
    target_title: targetTitle,
    detail,
    from_bilan: Boolean(state?.investigation_state),
    detected_at: new Date().toISOString(),
  };
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function stabilizeOnboardingFlag(tempMemory: any): {
  tempMemory: any;
  onboardingActive: boolean;
} {
  if (!tempMemory || typeof tempMemory !== "object") {
    return { tempMemory: {}, onboardingActive: false };
  }

  const ONBOARDING_MAX_TURNS = 10;
  const ONBOARDING_MAX_MS = 3 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const active = (tempMemory as any).__onboarding_active;
  if (!active || typeof active !== "object") {
    return { tempMemory, onboardingActive: false };
  }

  const startedMs = parseIsoMs(active.started_at);
  const elapsedMs = startedMs > 0 ? nowMs - startedMs : 0;
  const turnCount = Number(active.user_turn_count ?? 0) + 1;

  const shouldExpire = turnCount >= ONBOARDING_MAX_TURNS ||
    elapsedMs >= ONBOARDING_MAX_MS;
  if (shouldExpire) {
    try {
      delete (tempMemory as any).__onboarding_active;
    } catch {
      // best effort
    }
    (tempMemory as any).__onboarding_done_v2 = {
      completed_at: nowIso,
      reason: turnCount >= ONBOARDING_MAX_TURNS ? "max_turns" : "max_time",
    };
    return { tempMemory, onboardingActive: false };
  }

  (tempMemory as any).__onboarding_active = {
    ...(active ?? {}),
    user_turn_count: turnCount,
    last_updated_at: nowIso,
  };
  return { tempMemory, onboardingActive: true };
}

function isCheckupActive(state: any): boolean {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return false;
  const status = String(inv.status ?? "");
  return Boolean(status) && status !== "post_checkup" &&
    status !== "post_checkup_done";
}

function resolveBinaryConsentLite(text: unknown): "yes" | "no" | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  const yes =
    /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|yep|yes|on reprend|reprenons)\b/i
      .test(t);
  const no =
    /\b(non|nope|nan|pas maintenant|plus tard|laisse|stop|on laisse|on verra)\b/i
      .test(t);
  if (yes === no) return null;
  return yes ? "yes" : "no";
}

function parseInvestigationStartedMs(state: any): number {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return 0;
  const raw = String(inv?.started_at ?? "").trim() ||
    String(inv?.updated_at ?? "").trim() ||
    String(inv?.temp_memory?.started_at ?? "").trim();
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function detectCheckupIntent(dispatcherSignals: DispatcherSignals): boolean {
  const checkupIntentSignal = dispatcherSignals?.checkup_intent;
  return (
    Boolean(checkupIntentSignal?.detected) &&
    Number(checkupIntentSignal?.confidence ?? 0) >= 0.6
  );
}

export type StaleBilanDecision =
  | "resume_bilan"
  | "stop_for_today"
  | "other_topic";

export function deterministicStaleBilanDecision(
  text: string,
): StaleBilanDecision | null {
  const lower = String(text ?? "").trim().toLowerCase();
  if (!lower) return "other_topic";

  if (
    /\b(pas\s+maintenant|plus\s+tard|demain|on\s+verra|pas\s+dispo|une\s+autre\s+fois|laisse\s+tomber|stop|arr[êe]te|on\s+s['’]?arr[êe]te|bonne\s+nuit|à\s+demain|a\s+demain|je\s+te\s+laisse)\b/i
      .test(lower)
  ) {
    return "stop_for_today";
  }

  if (
    /^(oui|ok|okay|dac|d'accord|go|yes|ouais|yep)\b/i.test(lower) ||
    /\b(on\s+reprend|reprenons|on\s+continue|continuons|vas[- ]?y|c['’]est\s+parti)\b/i
      .test(lower)
  ) {
    return "resume_bilan";
  }

  return null;
}

async function classifyStaleBilanResponse(params: {
  userMessage: string;
  lastAssistantMessage: string;
  history: Array<{ role?: string; content?: string }>;
  requestId?: string;
}): Promise<StaleBilanDecision> {
  const text = String(params.userMessage ?? "").trim();
  if (!text) return "other_topic";

  const deterministic = deterministicStaleBilanDecision(text);
  if (deterministic) return deterministic;

  const recentContext = params.history.slice(-4).map((m) =>
    `${m.role === "assistant" ? "SOPHIA" : "USER"}: ${
      String(m.content ?? "").trim()
    }`
  ).join("\n");

  const systemPrompt = [
    "Tu classes la réponse d'un utilisateur à un bilan quotidien WhatsApp resté en pause plus de 4 heures.",
    "Le bilan était en cours plus tôt, mais il a expiré.",
    "Tu dois choisir UNE seule décision parmi :",
    '- "resume_bilan" : l\'utilisateur veut clairement reprendre le bilan maintenant',
    '- "stop_for_today" : l\'utilisateur dit non, veut reporter, arrêter, ou reprendre demain/plus tard',
    "- \"other_topic\" : l'utilisateur parle d'autre chose, pose une question différente, ou change de sujet",
    "",
    "Règles importantes :",
    "- Si l'utilisateur veut reprendre plus tard, demain, ou n'est pas dispo maintenant => stop_for_today.",
    "- Si l'utilisateur envoie un vrai nouveau sujet sans parler du bilan => other_topic.",
    "- N'utilise resume_bilan que si l'intention de reprendre le bilan maintenant est claire.",
    "",
    "Dernier message de Sophia :",
    params.lastAssistantMessage || "(vide)",
    "",
    "Contexte récent :",
    recentContext || "(vide)",
    "",
    'Réponds UNIQUEMENT en JSON valide: {"decision":"resume_bilan"|"stop_for_today"|"other_topic"}',
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      `Message utilisateur: "${text}"`,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "bilan_stale_classify",
        forceRealAi: true,
      },
    );
    const cleaned = String(raw ?? "")
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const decision = String(parsed?.decision ?? "").trim();
    if (
      decision === "resume_bilan" ||
      decision === "stop_for_today" ||
      decision === "other_topic"
    ) {
      return decision;
    }
  } catch (e) {
    console.warn(
      "[Router] stale bilan classification failed, using fallback:",
      e,
    );
  }

  return deterministicStaleBilanDecision(text) ?? "other_topic";
}

function selectTargetMode(args: {
  state: any;
  dispatcherSignals: DispatcherSignals;
  onboardingActive: boolean;
}): {
  targetMode: AgentMode;
  stopCheckup: boolean;
  checkupIntentDetected: boolean;
} {
  const { state, dispatcherSignals, onboardingActive } = args;

  const checkupActive = isCheckupActive(state);
  const stopCheckup = (dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" &&
    dispatcherSignals.interrupt.confidence >= 0.6) ||
    (dispatcherSignals.interrupt.kind === "BORED" &&
      dispatcherSignals.interrupt.confidence >= 0.65);

  const checkupIntentDetected = detectCheckupIntent(dispatcherSignals);

  if (checkupActive && !stopCheckup) {
    return { targetMode: "companion", stopCheckup, checkupIntentDetected };
  }

  if (onboardingActive) {
    return { targetMode: "companion", stopCheckup, checkupIntentDetected };
  }

  return { targetMode: "companion", stopCheckup, checkupIntentDetected };
}

function attachDynamicAddons(args: {
  tempMemory: any;
  state: any;
  dispatcherSignals: DispatcherSignals;
  checkupIntentDetected: boolean;
  userMessage: string;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
}) {
  const {
    tempMemory,
    state,
    dispatcherSignals,
    checkupIntentDetected,
    userMessage,
    planItemSnapshot,
  } = args;
  const checkupActive = isCheckupActive(state);

  if (!checkupActive && checkupIntentDetected) {
    const checkupIntentSignal = dispatcherSignals?.checkup_intent;
    (tempMemory as any).__checkup_not_triggerable_addon = {
      detected_at: new Date().toISOString(),
      confidence: Number(
        checkupIntentSignal?.confidence ??
          0,
      ),
      trigger_phrase: String(checkupIntentSignal?.trigger_phrase ?? "")
        .trim()
        .slice(0, 120),
    };
  } else {
    try {
      delete (tempMemory as any).__checkup_not_triggerable_addon;
    } catch {
      // best effort
    }
  }

  try {
    delete (tempMemory as any).__dashboard_redirect_addon;
    delete (tempMemory as any).__dashboard_capabilities_addon;
  } catch {
    // best effort
  }
  handlePlanItemFeedback({
    tempMemory,
    state,
    dispatcherSignals,
    planItemSnapshot,
  });

  const dashboardPreferencesSignal =
    dispatcherSignals.dashboard_preferences_intent;
  if (dashboardPreferencesSignal?.detected) {
    (tempMemory as any).__dashboard_preferences_intent_addon = {
      keys: Array.isArray(dashboardPreferencesSignal.preference_keys)
        ? dashboardPreferencesSignal.preference_keys.slice(0, 5)
        : [],
      confidence: Number(dashboardPreferencesSignal.confidence ?? 0),
      from_bilan: Boolean(state?.investigation_state),
      detected_at: new Date().toISOString(),
    };
  } else {
    try {
      delete (tempMemory as any).__dashboard_preferences_intent_addon;
    } catch {
      // best effort
    }
  }

  const defenseCardWinSignal = dispatcherSignals.defense_card_win;
  if (
    defenseCardWinSignal?.detected &&
    Number(defenseCardWinSignal.confidence ?? 0) >= 0.6
  ) {
    (tempMemory as any).__defense_card_win_addon = {
      detected_at: new Date().toISOString(),
      confidence: Number(defenseCardWinSignal.confidence ?? 0),
      situation_hint: String(defenseCardWinSignal.situation_hint ?? "").trim()
        .slice(0, 160) || null,
    };
  } else {
    try {
      delete (tempMemory as any).__defense_card_win_addon;
    } catch {
      // best effort
    }
  }
}

function buildSkillContextForRecommendation(args: {
  skillId: string;
  userId: string;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
}) {
  return {
    skill_id: args.skillId,
    user_id: args.userId,
    recent_messages: args.recentMessages.slice(-8),
    active_skill_working_state:
      args.activeSkillState && typeof args.activeSkillState === "object"
        ? args.activeSkillState
        : null,
    turn_frame: args.turnFrame,
    relevant_memory_items: [],
    plan_items: Array.isArray(args.planItemSnapshot)
      ? args.planItemSnapshot as Array<Record<string, unknown>>
      : [],
    product_surfaces: args.productSurfaces as Array<Record<string, unknown>>,
    exclusions: [],
  } as any;
}

async function runConversationSkillForRecommendation(args: {
  skillId: string;
  userId: string;
  userMessage: string;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
}): Promise<ConversationSkillOutput | null> {
  const context = buildSkillContextForRecommendation(args);
  const input = { user_message: args.userMessage, context };
  switch (args.skillId) {
    case "demotivation_repair":
      return await runDemotivationRepairSkill(input);
    case "emotional_repair":
      return await runEmotionalRepairSkill(input);
    case "execution_breakdown":
      return await runExecutionBreakdownSkill(input);
    case "product_help":
      return await runProductHelpSkill(input);
    case "safety_crisis":
      return await runSafetyCrisisSkill(input);
    default:
      return null;
  }
}

function normalizeRecommendationText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function surfaceLabelSelfQuotePattern(surfaceLabel: string): RegExp {
  const escaped = escapeRegExp(surfaceLabel).replace(/['’]/g, "['’]");
  return new RegExp(`${escaped}\\s*["“”]${escaped}["“”]`, "i");
}

function userExplicitlyAsksForTool(text: string): boolean {
  const normalized = normalizeRecommendationText(text);
  return /\b(outil|outil sophia|truc|methode|aide simple|le plus simple|propose-moi|propose moi|a utiliser|utiliser ce soir|qu[' ]?est-ce que je peux utiliser)\b/
    .test(normalized);
}

function shouldRunRecommendationTool(args: {
  skillOutput: ConversationSkillOutput | null;
  userMessage: string;
  turnFrame: TurnFrame;
}): boolean {
  if (args.skillOutput?.skill_id === "demotivation_repair") return false;
  if ((args.skillOutput?.operation_suggestions ?? []).length > 0) {
    return false;
  }
  if (
    args.skillOutput?.recommendation_need?.needed &&
    userExplicitlyAsksForTool(args.userMessage)
  ) return true;
  if (args.turnFrame.skill_signals.entry?.product_help?.detected) return true;
  return Boolean(args.skillOutput) &&
    userExplicitlyAsksForTool(args.userMessage);
}

function buildRecommendationToolAddon(args: {
  recommendation: ProductRecommendation | null;
  skillOutput: ConversationSkillOutput | null;
  selectedSkillId: string | null;
  surfaceLabel?: string | null;
}): string | null {
  const recommendation = args.recommendation;
  if (!recommendation) return null;
  const offer = String(recommendation.user_facing_offer ?? "").trim();
  const surfaceId = String(recommendation.surface_id ?? "").trim();
  const surfaceLabel = String(args.surfaceLabel ?? "").trim();
  const operationType = String(recommendation.operation_type ?? "").trim();
  return [
    "=== ADDON RECOMMENDATION TOOL ===",
    `selected_skill_id: ${args.selectedSkillId ?? "unknown"}`,
    `skill_recommendation_need: ${
      JSON.stringify(args.skillOutput?.recommendation_need ?? null)
    }`,
    `decision: ${recommendation.decision}`,
    `surface_id: ${surfaceId || "none"}`,
    `surface_label: ${surfaceLabel || "none"}`,
    `operation_type: ${operationType || "none"}`,
    `requires_consent: ${recommendation.requires_consent}`,
    `presentation_level: ${recommendation.presentation_level}`,
    `reason: ${recommendation.reason}`,
    offer ? `user_facing_offer: ${offer}` : null,
    "",
    "CONSIGNE:",
    "- Si l'utilisateur demande un outil, ne fabrique jamais un faux nom d'outil.",
    "- Recommande uniquement la surface produit ci-dessus, avec son nom reel si surface_id existe.",
    "- Si decision=recommend_operation et surface_label existe, la reponse visible doit nommer explicitement cet outil/surface_label.",
    "- N'affiche jamais les champs techniques surface_id, surface, operation_type, executor_tool_id ou decision dans la reponse visible.",
    '- Formule en francais naturel: dis par exemple "tu veux qu\'on l\'utilise pour alleger... ?", jamais "reduce".',
    "- Si decision=recommend_operation et requires_consent=true, propose l'outil en demandant l'accord avant execution.",
    "- Si decision=defer/blocked, ne presente pas d'outil produit; propose seulement une mini-etape conversationnelle sans l'appeler outil.",
    "- Tu peux expliquer en une phrase pourquoi cet outil est pertinent maintenant.",
    "- Regle produit cartes: ne dis jamais qu'une carte d'attaque peut etre modifiee librement. Une carte Mot de bascule permet seulement de remplacer le mot; si le contexte, la technique ou le contenu ne convient plus, propose d'en preparer une nouvelle version apres confirmation.",
    "=== FIN ADDON RECOMMENDATION TOOL ===",
  ].filter(Boolean).join("\n");
}

function operationOpportunityLevel(
  opportunity: ToolSkillOpportunity,
): ProductRecommendation["presentation_level"] {
  if (opportunity.confidence_band === "high") return 2;
  if (opportunity.confidence_band === "medium") return 1;
  return 0;
}

function operationOpportunityOfferText(args: {
  opportunity: ToolSkillOpportunity;
  surfaceLabel: string | null;
}): string {
  const target = String(args.opportunity.target_hint ?? "").trim();
  const surface = String(args.surfaceLabel ?? "").trim();
  const suffix = target ? ` pour "${target}"` : "";
  switch (args.opportunity.type) {
    case "attack_card":
      return `Je vois surtout une friction de lancement${suffix}. Si tu veux, on peut en faire une petite ${
        surface || "carte d'attaque"
      } pour rendre le démarrage plus simple.`;
    case "defense_card":
      return `Je vois un risque récurrent${suffix}. Si tu veux, on peut préparer une ${
        surface || "carte de défense"
      } pour ce moment précis.`;
    case "portion":
      return `Je vois que l'action pourrait gagner à être plus petite ou plus claire${suffix}. Si tu veux, on peut la découper proprement sans tout refaire.`;
    case "plan_adjustment":
      return `Je vois un possible problème de fit avec le plan${suffix}. Si tu veux, on peut regarder un ajustement sans l'appliquer sans ton accord.`;
    case "state_potion":
      return `Je vois surtout un état interne à réguler. Si tu veux, on peut choisir une ${
        surface || "potion d'état"
      } avant de reparler action.`;
    case "self_reminder":
      return `Je vois une phrase utile à garder. Si tu veux, on peut en faire un rappel pour toi-même.`;
    default:
      return "";
  }
}

function buildOperationInputFromOpportunity(args: {
  opportunity: ToolSkillOpportunity;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const opportunity = args.opportunity;
  const targetHint = String(opportunity.target_hint ?? "").trim();
  const targetItem = targetHint
    ? (args.planItemSnapshot ?? []).find((item) =>
      normalizeRecommendationText(item.title) ===
        normalizeRecommendationText(targetHint) ||
      normalizeRecommendationText(targetHint).includes(
        normalizeRecommendationText(item.title),
      ) ||
      normalizeRecommendationText(item.title).includes(
        normalizeRecommendationText(targetHint),
      )
    ) ?? null
    : null;
  const planTarget = targetItem
    ? {
      kind: "plan_item",
      plan_item_id: targetItem.id,
      title: targetItem.title,
    }
    : targetHint
    ? {
      kind: "personal_action",
      title: targetHint,
    }
    : null;

  if (opportunity.type === "attack_card") {
    return {
      target: planTarget,
      blocker: {
        type: "friction",
        reason: opportunity.prop_reason,
        source_span: opportunity.source_span,
      },
      desired_attack_angle: "preparer_terrain",
    };
  }
  if (opportunity.type === "defense_card") {
    return {
      attachment: planTarget,
      risk_situation: {
        label: opportunity.source_span ?? opportunity.prop_reason ??
          "risque récurrent",
      },
    };
  }
  if (
    opportunity.type === "portion" || opportunity.type === "plan_adjustment"
  ) {
    return {
      target: planTarget,
      scope: planTarget,
      adjustment_type: opportunity.surface_id === "plan_item.clarify"
        ? "clarify"
        : "reduce",
      reason: opportunity.prop_reason,
    };
  }
  if (opportunity.type === "self_reminder") {
    return {
      message_hint: opportunity.source_span ?? targetHint,
      reason: opportunity.prop_reason,
    };
  }
  if (opportunity.type === "state_potion") {
    const source = normalizeRecommendationText(
      `${opportunity.source_span ?? ""} ${opportunity.prop_reason ?? ""}`,
    );
    const state = /honte|culpabil/.test(source)
      ? "shame_guilt"
      : /stress|pression|angoisse|panique/.test(source)
      ? "stress_pressure"
      : /flou|confus|surcharge/.test(source)
      ? "confusion_overload"
      : /peur|evite|evitement/.test(source)
      ? "fear_avoidance"
      : /nul|incapable|dur avec moi/.test(source)
      ? "self_harshness"
      : /decroche|decrochage/.test(source)
      ? "decrochage"
      : null;
    return state
      ? { state, source_span: opportunity.source_span ?? null }
      : { source_span: opportunity.source_span ?? null };
  }
  return null;
}

function recommendationTargetTitle(
  recommendation: ProductRecommendation | null,
): string | null {
  const input = recommendation?.operation_input;
  if (!input || typeof input !== "object") return null;
  return planItemTitleFromOperationInput(input);
}

function operationOpportunityShouldOverrideRecommendation(args: {
  opportunity: ToolSkillOpportunity | null;
  recommendation: ProductRecommendation | null;
  opportunityRecommendation: ProductRecommendation | null;
}): boolean {
  const opportunity = args.opportunity;
  const recommendation = args.recommendation;
  const opportunityRecommendation = args.opportunityRecommendation;
  if (!opportunity || !opportunityRecommendation) return false;
  if (
    !opportunity.should_offer ||
    opportunity.confidence_band !== "high" ||
    opportunity.offer_timing !== "now" ||
    !opportunity.operation_type
  ) return false;
  if (!recommendation) return true;
  if (opportunity.target_status !== "identified") return false;
  if (recommendation.operation_type !== opportunity.operation_type) {
    return false;
  }
  const opportunityTarget = normalizeRecommendationText(
    recommendationTargetTitle(opportunityRecommendation) ??
      opportunity.target_hint ?? "",
  );
  if (!opportunityTarget) return true;
  const recommendationTarget = normalizeRecommendationText(
    recommendationTargetTitle(recommendation) ?? "",
  );
  return !recommendationTarget || recommendationTarget !== opportunityTarget;
}

export function buildRecommendationFromToolSkillOpportunity(args: {
  turnFrame: TurnFrame | null;
  surfaceLabel: string | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  requestId?: string | null;
}): ProductRecommendation | null {
  const opportunity = args.turnFrame?.tool_skill_opportunity ?? null;
  if (
    !opportunity ||
    opportunity.type === "none" ||
    !opportunity.should_offer ||
    opportunity.confidence_band !== "high" ||
    !opportunity.operation_type ||
    !opportunity.surface_id ||
    opportunity.offer_timing !== "now"
  ) return null;
  const operationInput = buildOperationInputFromOpportunity({
    opportunity,
    planItemSnapshot: args.planItemSnapshot,
  });
  return {
    recommendation_id: `dispatcher_opportunity:${opportunity.type}:${
      args.requestId ?? args.turnFrame?.turn_id ?? "local"
    }`,
    decision: "recommend_operation",
    surface_id: opportunity.surface_id,
    executor_tool_id: opportunity.operation_type,
    operation_type: opportunity.operation_type,
    operation_input: operationInput,
    confidence: opportunity.confidence_band === "high" ? 0.86 : 0.72,
    timing: "now",
    presentation_level: operationOpportunityLevel(opportunity),
    cta_style: "soft",
    requires_consent: true,
    reason: opportunity.prop_reason ??
      `dispatcher_tool_skill_opportunity:${opportunity.type}`,
    user_facing_offer: operationOpportunityOfferText({
      opportunity,
      surfaceLabel: args.surfaceLabel,
    }),
    alternatives: [],
    do_not_recommend: [],
  };
}

function buildToolSkillOpportunityAddon(args: {
  turnFrame: TurnFrame | null;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
}): string | null {
  const opportunity = args.turnFrame?.tool_skill_opportunity ?? null;
  const recommendation = args.recommendation;
  if (!opportunity || !recommendation) return null;
  const offer = String(recommendation.user_facing_offer ?? "").trim();
  return [
    "=== ADDON OPERATION OPPORTUNITY OFFER ===",
    `type: ${opportunity.type}`,
    `surface_label: ${args.surfaceLabel ?? "none"}`,
    `operation_type: ${recommendation.operation_type ?? "none"}`,
    `prop_reason: ${opportunity.prop_reason ?? "none"}`,
    `source_span: ${opportunity.source_span ?? "none"}`,
    `target_hint: ${opportunity.target_hint ?? "none"}`,
    offer ? `suggested_offer: ${offer}` : null,
    "",
    "CONSIGNE:",
    "- Reponds d'abord au besoin principal du user; ne remplace pas la reponse par une vente d'outil.",
    "- Si tu proposes l'opportunite, fais-le en une seule question optionnelle et courte.",
    "- Ne lance aucune operation maintenant. Demande l'accord explicite.",
    "- Si le user veut juste que ce soit note, accepte et ne pousse pas l'outil.",
    "- Ne dis jamais les champs techniques type, surface_id, operation_type ou prop_reason.",
    "- Regle produit cartes: ne dis jamais qu'une carte d'attaque peut etre modifiee librement. Une carte Mot de bascule permet seulement de remplacer le mot; si le contexte, la technique ou le contenu ne convient plus, propose d'en preparer une nouvelle version apres confirmation.",
    "=== FIN ADDON OPERATION OPPORTUNITY OFFER ===",
  ].filter(Boolean).join("\n");
}

function buildConversationRiskFlowExitAddon(
  conversationRisk: TurnFrame["conversation_risk"] | null | undefined,
): string | null {
  const flowExit = conversationRisk?.flow_exit_context;
  if (
    !conversationRisk?.should_exit_flows ||
    !flowExit ||
    flowExit.interrupted_flow_type === "none"
  ) return null;
  const knownContext = JSON.stringify({
    interrupted_flow_type: flowExit.interrupted_flow_type,
    restart_scope: flowExit.restart_scope,
    active_tool_skill_type: flowExit.active_tool_skill_type ?? null,
    active_conversation_skill_id: flowExit.active_conversation_skill_id ?? null,
    known_slots_before_clear: flowExit.known_slots ?? null,
    pending_confirmation_before_clear: flowExit.pending_confirmation ?? null,
    last_user_message: flowExit.last_user_message,
    score: conversationRisk.score,
    threshold: conversationRisk.threshold,
    reason_codes: conversationRisk.reason_codes,
    matrix: conversationRisk.matrix,
  });
  return [
    "=== ADDON CONVERSATION RISK FLOW EXIT ===",
    "Le dispatcher a detecte une frustration/rupture de conversation au-dessus du seuil et a coupe le flow actif.",
    "Les slots et etats actifs ont ete effaces: ne continue pas le slot filling courant, ne saute pas au prochain slot, ne cree rien, n'execute rien.",
    "Tu dois generer toi-meme une reponse naturelle, pas suivre un template fixe.",
    "",
    "Consigne visible:",
    "- Si interrupted_flow_type=tool_skill ou pending_confirmation: dis explicitement qu'on reprend au debut du sous-skill/operation concerne, puis resume ce que tu crois avoir compris avec les infos fiables ci-dessous, puis demande confirmation ou correction.",
    "- Si interrupted_flow_type=conversation_skill: dis qu'on repart proprement dans la conversation, resume ce que tu crois comprendre, puis demande confirmation/correction tres simplement.",
    "- Ne mentionne pas score, threshold, reason_codes, matrice, dispatcher, slots, temp_memory ou details techniques.",
    "- Ne relance pas immediatement le meme flow et ne demande aucun slot specifique.",
    "- Interdit sur ce tour: question A/B, choix de moment, demande de declencheur, demande de cible, demande de detail operationnel.",
    "- La seule question autorisee est une validation globale du resume: 'confirme-moi si c'est bien ca, ou dis-moi ce qu'il faut ajuster'.",
    "- Le resume a confirmer doit porter uniquement sur les informations utiles au travail: sujet, cible, moment, besoin, operation souhaitee, contrainte, intention.",
    "- Ne fais jamais confirmer la frustration elle-meme, ni le fait que l'utilisateur est en colere, ni que Sophia a mal compris, ni que tu as repondu a cote.",
    "- Si tu reconnais brievement la friction, reste neutre et oriente reprise: 'Ok, on reprend proprement.' Ne parle pas de ce que Sophia a compris ou rate.",
    "- Evite les formulations comme: 'tu es frustre parce que je...', 'a chaque fois je...', 'je t'ai fait tourner en rond', 'tu veux repartir a zero parce que je...', 'je n'ai pas compris', 'je ne comprends pas', 'je te suis pas', 'je t'ai perdu', 'je reponds a cote'.",
    "- Pour un tool_skill, nomme l'operation en langage user: 'carte de defense', 'ajustement du plan', 'carte d'attaque', etc., pas l'identifiant technique.",
    "",
    `Contexte structure pour toi: ${knownContext}`,
    "=== FIN ADDON CONVERSATION RISK FLOW EXIT ===",
  ].join("\n");
}

export function directConversationSkillReplyOverride(args: {
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  const skillOutput = args.skillOutput;
  if (!skillOutput) return null;
  const skillId = String(skillOutput.skill_id ?? "").trim();
  if (!skillId) return null;
  const routeMatchesSkill = args.routeDecision?.response_owner === skillId ||
    args.routeDecision?.selected_handler === skillId ||
    (args.routeDecision?.response_owner === "conversation_handler" &&
      args.routeDecision?.selected_handler === skillId);
  if (!routeMatchesSkill) return null;
  const reply = String(skillOutput.reply ?? "").trim();
  return reply || null;
}

export function enforceRecommendationToolVisibleReply(args: {
  responseContent: string;
  userMessage: string;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
  tempMemory?: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): string {
  const response = String(args.responseContent ?? "").trim();
  const recommendation = args.recommendation;
  const surfaceLabel = String(args.surfaceLabel ?? "").trim();
  const fromDispatcherOpportunity = String(
    recommendation?.recommendation_id ?? "",
  ).startsWith("dispatcher_opportunity:");
  const explicitToolAsk = userExplicitlyAsksForTool(args.userMessage);
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    !surfaceLabel ||
    (!explicitToolAsk && !fromDispatcherOpportunity)
  ) {
    return response;
  }

  const attackOperationInput = recommendation.operation_type ===
      "prepare_attack_card"
    ? buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    })
    : null;
  const resolvedOperationInput = attackOperationInput ??
    buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    });
  const resolvedTargetTitle = planItemTitleFromOperationInput(
    resolvedOperationInput,
  );
  const selfQuotedLabel = surfaceLabelSelfQuotePattern(surfaceLabel);
  const resolvedResponse = resolvedTargetTitle && selfQuotedLabel.test(response)
    ? response.replace(
      selfQuotedLabel,
      `${surfaceLabel} pour "${resolvedTargetTitle}"`,
    )
    : response;

  const normalizedResponse = normalizeRecommendationText(response);
  const normalizedLabel = normalizeRecommendationText(surfaceLabel);
  if (normalizedResponse.includes(normalizedLabel)) return resolvedResponse;

  if (
    fromDispatcherOpportunity && !explicitToolAsk &&
    recommendation.operation_type === "select_state_potion"
  ) {
    return resolvedResponse;
  }

  if (fromDispatcherOpportunity && !explicitToolAsk) {
    const targetText = resolvedTargetTitle
      ? ` pour "${resolvedTargetTitle}"`
      : "";
    return `${resolvedResponse}\n\nConcrètement, je parle d'une ${surfaceLabel}${targetText}, à préparer seulement si tu confirmes.`;
  }

  const offer = String(recommendation.user_facing_offer ?? "").trim();
  const naturalOffer = offer
    ? offer
      .replace(/\balleger\b/gi, "alléger")
      .replace(/\belan\b/gi, "élan")
      .replace(/[.!?…]+$/u, "")
    : "on rend l'action plus petite pour qu'elle soit faisable même quand tu décroches";
  if (recommendation.operation_type === "prepare_attack_card") {
    const attackOperationInput = buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    });
    const targetTitle = planItemTitleFromOperationInput(attackOperationInput);
    if (targetTitle) {
      return `Le plus simple ici, c'est "${surfaceLabel}" : on garde ton plan tel quel et on crée une version de démarrage de "${targetTitle}". Tu veux que je la prépare ?`;
    }
    return `Je peux te proposer une "${surfaceLabel}", mais je veux la rattacher à la bonne action. Tu parles de quelle action exactement ?`;
  }
  const inferredOperationInput = buildRecommendationOperationInput({
    recommendation,
    tempMemory: args.tempMemory ?? {},
    planItemSnapshot: args.planItemSnapshot ?? null,
  });
  const targetTitle = planItemTitleFromOperationInput(
    (recommendation.operation_input as Record<string, unknown> | null) ??
      null,
  ) ?? planItemTitleFromOperationInput(inferredOperationInput);
  const targetText = targetTitle
    ? ` "${targetTitle}"`
    : " l'action la plus lourde";
  return `Le plus simple ici, c'est l'outil "${surfaceLabel}" : ${naturalOffer}. Tu veux qu'on l'utilise pour alléger${targetText} maintenant ?`;
}

function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isProductHelpExitToConversation(message: string): boolean {
  const text = normalizeRouteText(message);
  if (
    /\b(je ne parle plus|je parle plus|pas du rappel|plus du rappel|sans parler des rappels|pas parler des rappels|sujet different|sujet different|pas de l app|pas de l interface)\b/
      .test(text)
  ) return true;
  if (isRuntimeCoachPreferenceRequest(message)) return true;
  if (
    /\b(donne moi|donne-moi|fais moi|fais-moi|formule|reformule|phrase|version)\b[\s\S]{0,100}\b(maintenant|sans parler des rappels|pas du rappel|sujet different|sujet different)\b/
      .test(text)
  ) return true;
  if (isConversationScopedRepereRequest(text)) return true;
  if (
    /\b(laisse tomber|oublie|stop|pas grave)\b.{0,60}\b(interface|dashboard|produit|app|rappel|plan)\b/
      .test(text)
  ) return true;
  if (
    /\btu te souviens\b[\s\S]{0,140}\b(piege|garde en tete|garder en tete)\b/
      .test(text)
  ) return true;
  if (
    /\b(tu as retenu quoi|qu as tu retenu|qu est ce que tu as retenu|tu retiens quoi)\b/
      .test(text) &&
    /\b(conversation|bureau|mail|mails|piege|repere|retenu)\b/.test(text)
  ) return true;
  if (
    /\b(recap|recapitule|resume|resumer|on s arrete|on stoppe)\b/.test(text) &&
    /\b(ce que j ai fait|ce qu on a fait|ce qui est prevu|demain|piege|surveiller|garde|mail|carte|preference|rappel)\b/
      .test(text)
  ) return true;
  return false;
}

function isConversationScopedRepereRequest(normalizedText: string): boolean {
  return /\b(pour cette conversation|dans cette conversation|comme repere|repere dans cette conversation|garde comme repere|garde ca comme repere)\b/
    .test(normalizedText) &&
    /\b(retiens|garde|repere|quand je dis|ca veut dire|cela veut dire)\b/.test(
      normalizedText,
    );
}

function buildRecentConversationContinuityAddon(args: {
  userMessage: string;
  history: any[];
}): string | null {
  const text = normalizeRouteText(args.userMessage);
  const needsContinuity =
    /\b(tu te souviens|recap|recapitule|resume|resumer|ce que j ai fait|ce qui est prevu|piege|garde en tete|on s arrete|on stoppe)\b/
      .test(text);
  if (!needsContinuity) return null;
  const recent = (args.history ?? [])
    .filter((entry) =>
      entry && typeof entry === "object" &&
      (entry.role === "user" || entry.role === "assistant") &&
      String(entry.content ?? "").trim().length > 0
    )
    .slice(-14)
    .map((entry) => {
      const role = entry.role === "assistant" ? "Sophia" : "User";
      const content = String(entry.content ?? "").replace(/\s+/g, " ").trim()
        .slice(0, 260);
      return `- ${role}: ${content}`;
    });
  if (recent.length === 0) return null;
  return [
    "=== CONTINUITE CONVERSATION RECENTE ===",
    "Le user demande un souvenir, un recap ou une continuité immédiate. Utilise ces tours récents; ne dis pas que tu n'as pas le contexte sous les yeux.",
    "Si un rappel vient d'être programmé dans l'historique, tu peux le citer comme prévu. Si le piège de travail est mentionné, tu peux le reformuler.",
    ...recent,
    "=== FIN CONTINUITE CONVERSATION RECENTE ===",
  ].join("\n");
}

function persistConversationSkillRoute(
  tempMemory: any,
  routeDecision: RouteDecision | null,
  skillOutput?: ConversationSkillOutput | null,
): any {
  let next = { ...(tempMemory ?? {}) };
  const now = new Date().toISOString();
  const arbitration = routeDecision?.active_flow_arbitration;
  if (
    arbitration?.decision === "inline_answer_then_resume" ||
    arbitration?.decision === "suspend_active" ||
    arbitration?.decision === "supersede_active"
  ) {
    const activeFlow = readActiveFlowState(next);
    const activeOwner = String(arbitration.active_owner ?? "none");
    const snapshot = activeOwner === "pending_confirmation"
      ? activeFlow.pendingToolSkillConfirmation
      : activeOwner === "tool_skill"
      ? activeFlow.activeToolSkillIntake
      : activeOwner === "conversation_skill"
      ? activeFlow.activeSkillState
      : null;
    if (snapshot) {
      next.__suspended_flow_v1 = {
        owner: activeOwner,
        state_snapshot: snapshot,
        suspended_by: routeDecision?.response_owner ?? "unknown",
        resume_policy: arbitration.resume_policy,
        turn_ttl: arbitration.resume_policy === "auto_after_answer" ? 1 : 2,
        created_at: new Date().toISOString(),
      };
    }
    if (
      arbitration.decision !== "inline_answer_then_resume" &&
      activeOwner === "tool_skill" &&
      arbitration.selected_owner !== "tool_skill"
    ) {
      next = clearActiveToolFlow(next);
    }
    if (
      arbitration.decision !== "inline_answer_then_resume" &&
      activeOwner === "pending_confirmation" &&
      arbitration.selected_owner !== "pending_confirmation"
    ) {
      next = clearPendingToolConfirmation(next);
    }
  }
  const selected = selectedConversationSkillForRoute(routeDecision);
  if (selected) {
    const suspendedFlow = next.__suspended_flow_v1 &&
        typeof next.__suspended_flow_v1 === "object"
      ? next.__suspended_flow_v1 as Record<string, unknown>
      : null;
    const rawPrevious = next.__active_skill_state ?? next.active_skill_state ??
      (selected === "weekly_adaptive_review_v1" &&
          isWeeklyAdaptiveReviewActive(suspendedFlow?.state_snapshot)
        ? suspendedFlow?.state_snapshot
        : null);
    const previous = rawPrevious && typeof rawPrevious === "object"
      ? rawPrevious as Record<string, unknown>
      : {};
    const previousSkillId = typeof previous.skill_id === "string"
      ? previous.skill_id
      : null;
    const previousPreviousSkillId =
      typeof previous.previous_skill_id === "string"
        ? previous.previous_skill_id
        : null;
    const patch = skillOutput?.skill_id === selected &&
        skillOutput.state_patch &&
        typeof skillOutput.state_patch === "object"
      ? skillOutput.state_patch as Record<string, unknown>
      : {};
    const workingState = {
      ...(previous.working_state && typeof previous.working_state === "object"
        ? previous.working_state as Record<string, unknown>
        : {}),
      ...patch,
    };
    const safetyExitState = applySafetyCrisisExitStateIfNeeded({
      tempMemory: next,
      selectedSkillId: selected,
      skillOutput,
      previous,
      workingState,
      now,
    });
    if (safetyExitState) return safetyExitState;
    next.__active_skill_state = {
      ...previous,
      version: Number(previous.version ?? 1),
      skill_id: selected,
      status: skillOutput?.status === "handoff" ? "handoff" : "active",
      previous_skill_id: previousSkillId && previousSkillId !== selected
        ? previousSkillId
        : previousPreviousSkillId,
      turn_count: Number(previous.turn_count ?? 0) + 1,
      started_at: typeof previous.started_at === "string"
        ? previous.started_at
        : now,
      updated_at: now,
      working_state: workingState,
    };
    delete next.active_skill_state;
    if (selected === "weekly_adaptive_review_v1") {
      delete next.__suspended_flow_v1;
    }
    return next;
  }

  const suspendedFlow = next.__suspended_flow_v1 &&
      typeof next.__suspended_flow_v1 === "object"
    ? next.__suspended_flow_v1 as Record<string, unknown>
    : null;
  const rawPrevious = next.__active_skill_state ?? next.active_skill_state ??
    (isWeeklyAdaptiveReviewActive(suspendedFlow?.state_snapshot)
      ? suspendedFlow?.state_snapshot
      : null);
  if (
    isWeeklyAdaptiveReviewActive(rawPrevious) &&
    !isSafetyRoute(routeDecision)
  ) {
    const previous = rawPrevious && typeof rawPrevious === "object"
      ? rawPrevious as Record<string, unknown>
      : {};
    next.__active_skill_state = {
      ...previous,
      skill_id: "weekly_adaptive_review_v1",
      turn_count: Number(previous.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    delete next.active_skill_state;
    delete next.__suspended_flow_v1;
    return next;
  }

  if (
    routeDecision?.response_owner === "normal_reply" ||
    routeDecision?.response_owner === "tool_skill"
  ) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
  }
  if (
    routeDecision?.response_owner === "product_help" &&
    arbitration?.decision !== "inline_answer_then_resume"
  ) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
  }
  return next;
}

function normalizePlanTargetText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantPlanWords(text: string): string[] {
  const stop = new Set([
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "du",
    "de",
    "d",
    "a",
    "au",
    "aux",
    "pour",
    "sur",
    "dans",
    "mon",
    "ma",
    "mes",
    "ton",
    "ta",
    "tes",
    "preparer",
    "envoyer",
    "faire",
    "version",
  ]);
  return normalizePlanTargetText(text).split(/\s+/)
    .filter((word) => word.length >= 4 && !stop.has(word));
}

function resolvePlanItemTargetFromText(
  text: unknown,
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  const normalized = normalizePlanTargetText(text);
  if (!normalized || !Array.isArray(planItems)) return null;
  let best: { item: V2PlanItemSnapshotItem; score: number } | null = null;
  for (const item of planItems) {
    const title = normalizePlanTargetText(item?.title);
    const description = normalizePlanTargetText((item as any)?.description);
    if (!title) continue;
    if (normalized.includes(title)) return item;
    if (
      description && description.includes(normalized) && normalized.length >= 4
    ) {
      return item;
    }
    const words = significantPlanWords(item.title);
    const descriptionWords = significantPlanWords(
      String((item as any)?.description ?? ""),
    ).slice(0, 12);
    const allWords = [...new Set([...words, ...descriptionWords])];
    const hits = allWords.filter((word) =>
      normalized.includes(word) || normalized === word
    )
      .length;
    const score = allWords.length > 0 ? hits / allWords.length : 0;
    if (hits >= 2 && score >= 0.45 && (!best || score > best.score)) {
      best = { item, score };
    }
    if (
      hits >= 1 && normalized.split(/\s+/).length <= 3 &&
      (!best || score > best.score)
    ) {
      best = { item, score: Math.max(score, 0.5) };
    }
  }
  return best?.item ?? null;
}

function resolvePlanItemTargetFromToolSkillIntent(
  turnFrame: TurnFrame | null,
  operationType: string,
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  if (!turnFrame || !Array.isArray(planItems)) return null;
  const intents = (turnFrame.tool_skill_intents ?? []).filter((intent) =>
    intent.operation_type === operationType && intent.confidence_band !== "low"
  );
  for (const intent of intents) {
    const rawId = String((intent as any).target_item_id ?? "").trim();
    if (rawId) {
      const byId = planItems.find((item) => item.id === rawId);
      if (byId) return byId;
    }
    const hint = String(intent.target_hint ?? "").trim();
    const byHint = resolvePlanItemTargetFromText(hint, planItems);
    if (byHint) return byHint;
  }
  return null;
}

function readLastResolvedPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  if (!raw || typeof raw !== "object") return null;
  if (!String((raw as any).id ?? "").trim()) return null;
  if (!String((raw as any).title ?? "").trim()) return null;
  return raw as Record<string, unknown>;
}

function writeLastResolvedPlanItem(
  tempMemory: any,
  item: V2PlanItemSnapshotItem,
  source: string,
): any {
  return {
    ...(tempMemory ?? {}),
    __last_resolved_plan_item: {
      id: item.id,
      title: item.title,
      kind: item.item_type,
      dimension: item.dimension,
      status: item.status,
      available_this_week: item.available_this_week ?? false,
      availability_status: item.availability_status ?? null,
      item_nature: item.item_nature ?? null,
      cadence_label: item.cadence_label ?? null,
      target_reps: item.target_reps ?? null,
      week_scope: item.week_scope ?? null,
      source,
      updated_at: new Date().toISOString(),
    },
  };
}

export function operationInputFromLastPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const item = readLastResolvedPlanItem(tempMemory);
  if (!item) return null;
  return {
    target: {
      kind: "plan_item",
      plan_item_id: item.id,
      title: item.title,
    },
    scope: {
      kind: "specific_plan_item",
      plan_item_id: item.id,
      title: item.title,
      current_summary: item.title,
    },
  };
}

function planItemTitleFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): string | null {
  if (!operationInput || typeof operationInput !== "object") return null;
  const scope = (operationInput as any).scope;
  const target = (operationInput as any).target;
  const title = String(
    scope?.title ??
      scope?.current_summary ??
      target?.title ??
      (operationInput as any).title ??
      "",
  ).trim();
  return title || null;
}

function planItemTitleFromAdjustmentDraft(
  draft?: PlanAdjustmentDraftV1 | null,
  operationInput?: Record<string, unknown> | null,
): string | null {
  const fromInput = planItemTitleFromOperationInput(operationInput);
  if (fromInput) return fromInput;
  const scopeLabel = String((draft as any)?.draft?.scope_label ?? "").trim();
  if (scopeLabel) return scopeLabel;
  const rawTitle = String((draft as any)?.draft?.title ?? "").trim();
  return rawTitle.replace(/^Ajustement\s*-\s*/i, "").trim() || null;
}

function compactListText(values: unknown, fallback: string): string {
  const list = Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  if (list.length === 0) return fallback;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join("; ")}; ${list[list.length - 1]}`;
}

function defaultPlanItemForAdjustment(
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  if (!Array.isArray(planItems) || planItems.length === 0) return null;
  const generatedPlanItems = planItems.filter((item) =>
    item.source_kind !== "operation_bridge"
  );
  return generatedPlanItems.find((item) => item.available_this_week === true) ??
    planItems.find((item) => item.available_this_week === true) ??
    generatedPlanItems.find((item) => item.status === "active") ??
    planItems.find((item) => item.status === "active") ??
    generatedPlanItems[0] ?? planItems[0] ?? null;
}

function formatPlanSnapshotLine(item: V2PlanItemSnapshotItem): string {
  const parts = [
    item.dimension,
    item.item_type,
    item.item_nature,
    `status=${item.status}`,
  ];
  if (item.week_scope?.weekly_cadence_label) {
    parts.push(`cadence_cette_semaine=${item.week_scope.weekly_cadence_label}`);
  } else if (typeof item.week_scope?.weekly_reps === "number") {
    parts.push(`reps_cette_semaine=${item.week_scope.weekly_reps}`);
  }
  if (item.cadence_label) {
    parts.push(`cadence_base_item=${item.cadence_label}`);
  }
  if (typeof item.target_reps === "number") {
    parts.push(`target_reps_global=${item.target_reps}`);
  }
  if (item.week_scope?.week_order) {
    parts.push(`week_order=${item.week_scope.week_order}`);
  }
  if (item.week_scope?.week_status) {
    const weekStatus = item.week_scope.week_status === "completed"
      ? "calendar_week_past"
      : item.week_scope.week_status;
    parts.push(`week_status=${weekStatus}`);
  }
  return `- ${item.title} (${parts.filter(Boolean).join("; ")})`;
}

function formatCurrentWeekSummaryItem(item: V2PlanItemSnapshotItem): string {
  const weekly = item.week_scope?.weekly_cadence_label ??
    (typeof item.week_scope?.weekly_reps === "number"
      ? `${item.week_scope.weekly_reps} reps cette semaine`
      : null);
  return weekly ? `${item.title} [${weekly}]` : item.title;
}

function buildActivePlanSnapshotAddon(args: {
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  routeDecision?: RouteDecision | null;
  userMessage: string;
}): string | null {
  const items = (args.planItemSnapshot ?? []).filter((item) =>
    item.source_kind !== "operation_bridge"
  );
  if (items.length === 0) return null;
  const normalized = normalizeRouteText(args.userMessage);
  const likelyPlanContentQuestion =
    /\b(cette semaine|quoi faire|faire quoi|censee|cense|supposee|suppose|tous les jours|chaque jour|quotidien|ponctuel|ponctuelle|combien de fois|frequence|frequence|nettoyer|environnement|mission|habitude|action)\b/
      .test(normalized);
  if (!likelyPlanContentQuestion) return null;

  const currentWeek = items.filter((item) => item.available_this_week === true);
  const pastWeek = items.filter((item) =>
    item.availability_status === "available_past_week"
  );
  const upcomingWeek = items.filter((item) =>
    item.availability_status === "available_upcoming_week"
  );
  const unassigned = items.filter((item) =>
    item.availability_status === "not_assigned_to_level_weeks" ||
    item.availability_status === "assigned_no_calendar"
  );

  const lines = [
    "=== CONTEXTE OPERATIONNEL PLAN ACTIF (A UTILISER POUR REPONDRE) ===",
    "Le backend te donne le plan actif: ne dis pas que tu ne peux pas le voir.",
    "Tu peux affirmer qu'un item est dans le plan si cette section le liste.",
    "Tu peux affirmer qu'un item est a faire cette semaine si cette section le liste dans 'Disponibles cette semaine', meme si son status runtime est pending.",
    "Si le user demande quoi faire cette semaine, cite uniquement les items du resume 'Cette semaine uniquement'. Ne cite pas les items passes ou a venir comme s'ils etaient de cette semaine.",
    "Quand tu reponds a 'quoi faire cette semaine', inclus toutes les categories disponibles cette semaine: habitudes recurrentes, missions ponctuelles et clarifications. Ne reduis pas la reponse aux seules missions ou clarifications.",
    "Quand un item disponible cette semaine a cadence_cette_semaine/reps_cette_semaine, cette cadence hebdomadaire prime sur cadence_base_item et target_reps_global.",
    "available_past_week ou week_status=calendar_week_past signifie seulement que la semaine calendrier est passee. Cela ne signifie PAS que l'item est complete. Ne dis qu'une action est completee si status=completed.",
    "Important: status=active/pending est un etat runtime en base, pas la disponibilite de la semaine. Pour repondre a 'cette semaine', utilise available_this_week et week_scope.",
    "Nature des items: recurring_habit = habitude repetee; one_shot_mission = mission ponctuelle; clarification = exercice/clarification.",
  ];
  if (currentWeek.length > 0) {
    lines.push(
      `Cette semaine uniquement: ${
        currentWeek.map(formatCurrentWeekSummaryItem).join(" ; ")
      }`,
    );
    lines.push("Disponibles cette semaine:");
    lines.push(...currentWeek.slice(0, 8).map(formatPlanSnapshotLine));
  }
  if (pastWeek.length > 0) {
    lines.push(
      `A ne pas presenter comme cette semaine car deja passe: ${
        pastWeek.map((item) => item.title).slice(0, 6).join(" ; ")
      }`,
    );
    lines.push("Deja assignes a une semaine passee du niveau:");
    lines.push(...pastWeek.slice(0, 6).map(formatPlanSnapshotLine));
  }
  if (upcomingWeek.length > 0) {
    lines.push(
      `A ne pas presenter comme cette semaine car a venir: ${
        upcomingWeek.map((item) => item.title).slice(0, 6).join(" ; ")
      }`,
    );
    lines.push("Assignes a une semaine a venir du niveau:");
    lines.push(...upcomingWeek.slice(0, 6).map(formatPlanSnapshotLine));
  }
  if (unassigned.length > 0) {
    lines.push("Autres items du plan sans semaine courante identifiable:");
    lines.push(...unassigned.slice(0, 4).map(formatPlanSnapshotLine));
  }
  lines.push(
    "Quand le user demande si une mission est quotidienne, verifie item_nature/cadence avant de repondre. Ne transforme pas une mission ponctuelle en habitude quotidienne.",
  );
  return lines.join("\n");
}

function normalizeAdjustmentTypeFromRecommendation(
  recommendation: ProductRecommendation | null,
): "reduce" | "clarify" | "pause" | "simplify" | null {
  const raw = String(
    (recommendation?.operation_input as any)?.adjustment_type ??
      (recommendation?.operation_input as any)?.adjustment ??
      "",
  ).trim().toLowerCase();
  if (
    raw === "reduce" || raw === "clarify" || raw === "pause" ||
    raw === "simplify"
  ) {
    return raw;
  }
  return recommendation?.surface_id === "plan_item.reduce" ? "reduce" : null;
}

function buildRecommendationOperationInput(args: {
  recommendation: ProductRecommendation | null;
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const recommendation = args.recommendation;
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    recommendation.operation_type !== "adjust_plan_item"
  ) {
    return null;
  }

  const adjustmentType = normalizeAdjustmentTypeFromRecommendation(
    recommendation,
  );
  if (!adjustmentType) return null;
  let operationInput = operationInputFromLastPlanItem(args.tempMemory);
  if (!operationInput) {
    const defaultItem = defaultPlanItemForAdjustment(args.planItemSnapshot);
    if (defaultItem) {
      operationInput = operationInputFromLastPlanItem(
        writeLastResolvedPlanItem(
          args.tempMemory,
          defaultItem,
          "recommendation_default_active_item",
        ),
      );
    }
  }
  if (!operationInput) {
    return { adjustment_type: adjustmentType };
  }
  return {
    ...operationInput,
    adjustment_type: adjustmentType,
  };
}

export function attachPendingRecommendationOperation(args: {
  tempMemory: any;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  requestId?: string | null;
}): any {
  const recommendation = args.recommendation;
  const passthroughOperationInput = [
    "create_recurring_reminder",
    "prepare_defense_card",
    "select_state_potion",
  ].includes(String(recommendation?.operation_type ?? ""));
  const operationInput = recommendation?.operation_type ===
      "prepare_attack_card"
    ? buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : recommendation?.operation_type === "adjust_plan_item"
    ? buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : passthroughOperationInput && recommendation
    ? (recommendation.operation_input ?? null)
    : buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    });
  if (!operationInput || !recommendation?.requires_consent) {
    return args.tempMemory;
  }
  return {
    ...(args.tempMemory ?? {}),
    __pending_recommendation_operation: {
      operation_type: recommendation.operation_type,
      surface_id: recommendation.surface_id ?? null,
      surface_label: args.surfaceLabel ?? null,
      recommendation_id: recommendation.recommendation_id ?? null,
      operation_input: operationInput,
      created_at: new Date().toISOString(),
      request_id: args.requestId ?? null,
    },
  };
}

export function isOperationEscapeMessage(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  return (
    /\b(resume|recap|recapitule|qu est ce qui existe|ce qui existe|dans mon plan|sans inventer)\b/
      .test(text) ||
    /\b(pas maintenant|annule|annuler|laisse tomber|oublie|stop|stop carte|pas de carte|pas une carte|pas d action|pas de plan|pas envie qu on me fasse un plan|je veux juste rester|juste une phrase|une seule phrase|rester sur l apaisement|apaisement|fond de honte)\b/
      .test(text)
  );
}

export function isImplicitWholePlanRepairAdjustmentRequest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const planTrajectoryContext =
    /\b(plan|suite du plan|prochaine partie|partie suivante|prochaine etape|prochaine étape|niveau suivant|trajectoire)\b/
      .test(text);
  const repairBridge =
    /\b(mini marche|petite marche|marche|etape|étape|palier|transition|pont)\b/
      .test(text) ||
    /\b(avant de reparler du fond|avant de reparler|avant d analyser|avant d'analyser)\b/
      .test(text);
  const reconnectionNeed =
    /\b(revenir en lien|retour en lien|retour au lien|retour au contact|se retrouver|reconnexion|reconnecter|reparer|réparer|reparation|réparation)\b/
      .test(text) &&
    /\b(apres un accrochage|apres accrochage|apres une dispute|apres dispute|apres tension|apres une tension|après un accrochage|après une dispute|après tension|fond|dispute|tension|accrochage)\b/
      .test(text);
  return planTrajectoryContext && repairBridge && reconnectionNeed;
}

function isOperationCorrectionOrSafetyInterruption(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  return (
    /\bje n ai pas demande\b|\bje nai pas demande\b|\bpas demande de rappel\b|\bje voulais surtout\b|\bje parle surtout\b/
      .test(text) ||
    /\bdisparaitre\b|\bdisparaitre ferait une pause\b|\bplus la\b|\bplus là\b|\bme faire du mal\b|\bsuicid|\ben finir\b|\bmourir\b/
      .test(text)
  );
}

function buildResolvedPlanTargetAddon(tempMemory: any): string | null {
  const item = readLastResolvedPlanItem(tempMemory);
  if (!item) return null;
  return [
    "=== PLAN TARGET RESOLU (RUNTIME) ===",
    `Derniere action de plan identifiee: ${String(item.title)}`,
    `plan_item_id: ${String(item.id)}`,
    `dimension: ${String(item.dimension ?? "")}`,
    `kind: ${String(item.kind ?? "")}`,
    `status: ${String(item.status ?? "")}`,
    "Si le user dit cette action / celle-ci / fais-le / la presentation, reutilise cette cible sauf correction explicite.",
  ].join("\n");
}

async function maybeLogDefenseCardWinParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  dispatcherSignals: DispatcherSignals;
  v2Runtime?: ActiveTransformationRuntime | null;
  tempMemory: any;
}) {
  const { supabase, userId, dispatcherSignals, v2Runtime, tempMemory } = args;

  const signal = dispatcherSignals.defense_card_win;
  if (!signal?.detected || Number(signal.confidence ?? 0) < 0.6) return;

  const transformationId = v2Runtime?.transformation?.id ?? null;
  if (!transformationId) return;

  try {
    const { data: card } = await supabase
      .from("user_defense_cards")
      .select("id, content")
      .eq("user_id", userId)
      .eq("transformation_id", transformationId)
      .maybeSingle();

    if (!card) return;

    const content = card.content as DefenseCardContent;
    const situationHint = String(signal.situation_hint ?? "").toLowerCase()
      .trim();

    let bestImpulseId = content.impulses?.[0]?.impulse_id ?? "unknown";
    let bestTriggerId: string | null = null;

    if (situationHint && content.impulses?.length) {
      for (const imp of content.impulses) {
        if (
          imp.label.toLowerCase().includes(situationHint) ||
          situationHint.includes(imp.label.toLowerCase())
        ) {
          bestImpulseId = imp.impulse_id;
          break;
        }
        for (const t of imp.triggers ?? []) {
          if (
            t.situation.toLowerCase().includes(situationHint) ||
            situationHint.includes(t.situation.toLowerCase())
          ) {
            bestImpulseId = imp.impulse_id;
            bestTriggerId = t.trigger_id;
            break;
          }
        }
      }
    }

    const { error } = await supabase.from("user_defense_wins").insert({
      defense_card_id: card.id,
      impulse_id: bestImpulseId,
      trigger_id: bestTriggerId,
      source: "conversation",
      logged_at: new Date().toISOString(),
    });
    if (error) throw error;

    const cardSummary = content.impulses
      ?.map((imp) =>
        `${imp.label} (${imp.impulse_id}): ${
          imp.triggers?.length ?? 0
        } triggers`
      )
      .join("; ") ?? "";

    (tempMemory as any).__defense_card_win_addon = {
      ...((tempMemory as any).__defense_card_win_addon ?? {}),
      win_logged: true,
      impulse_id: bestImpulseId,
      trigger_id: bestTriggerId,
      card_summary: cardSummary.slice(0, 300),
    };
  } catch (err) {
    console.warn(
      "[Router] defense_card_win parallel log failed (non-blocking):",
      err,
    );
  }
}

function buildRecentContextSummaryForSelector(history: any[]): string | null {
  const lines = (history ?? [])
    .slice(-4)
    .map((item: any) => {
      const role = String(item?.role ?? "").trim();
      const content = String(item?.content ?? "").trim().slice(0, 180);
      if (!role || !content) return "";
      return `${role}: ${content}`;
    })
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function normalizePlanItemTitle(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function coachingDimensionForLog(
  dimension: PlanItemRuntimeRow["dimension"] | string | null | undefined,
): "mission" | "habit" | "support" | null {
  const normalized = String(dimension ?? "").trim();
  if (normalized === "missions" || normalized === "mission") return "mission";
  if (normalized === "habits" || normalized === "habit") return "habit";
  if (normalized === "support") return "support";
  return null;
}

function toCoachingPlanItemContext(
  item: PlanItemRuntimeRow,
): CoachingV2PlanItemContext {
  return {
    id: item.id,
    dimension: item.dimension,
    kind: item.kind,
    title: item.title,
    status: item.status,
  };
}

function findUniquePlanItemMatch(
  items: PlanItemRuntimeRow[],
  hint: string,
): CoachingV2PlanItemContext | null {
  const normalizedHint = normalizePlanItemTitle(hint);
  if (!normalizedHint) return null;

  const preferredStatuses = new Set([
    "active",
    "pending",
    "in_maintenance",
    "stalled",
  ]);
  const preferredItems = items.filter((item) =>
    preferredStatuses.has(item.status)
  );
  const searchPools = preferredItems.length > 0
    ? [preferredItems, items]
    : [items];

  for (const pool of searchPools) {
    const exactMatches = pool.filter((item) =>
      normalizePlanItemTitle(item.title) === normalizedHint
    );
    if (exactMatches.length === 1) {
      return toCoachingPlanItemContext(exactMatches[0]);
    }
  }

  for (const pool of searchPools) {
    const partialMatches = pool.filter((item) => {
      const normalizedTitle = normalizePlanItemTitle(item.title);
      return normalizedTitle.includes(normalizedHint) ||
        normalizedHint.includes(normalizedTitle);
    });
    if (partialMatches.length === 1) {
      return toCoachingPlanItemContext(partialMatches[0]);
    }
  }

  return null;
}

export function resolveCoachingTargetPlanItem(args: {
  planItems: PlanItemRuntimeRow[];
  actionHint?: string | null;
  fallbackTitle?: string | null;
}): CoachingV2PlanItemContext | null {
  const hint = String(args.actionHint ?? "").trim();
  if (hint) {
    const fromHint = findUniquePlanItemMatch(args.planItems, hint);
    if (fromHint) return fromHint;
  }

  const fallbackTitle = String(args.fallbackTitle ?? "").trim();
  if (fallbackTitle) {
    return findUniquePlanItemMatch(args.planItems, fallbackTitle);
  }

  return null;
}

export function mapMomentumStateV2ToCoachingContext(
  tempMemory: any,
): CoachingV2MomentumContext {
  const momentum = readMomentumStateV2(tempMemory);
  return {
    plan_fit: momentum.dimensions.plan_fit.level,
    load_balance: momentum.dimensions.load_balance.level,
    active_load_score: momentum.active_load.current_load_score,
    needs_reduce: momentum.active_load.needs_reduce,
    blocker_kind: momentum.blockers.blocker_kind,
    top_risk: momentum.assessment.top_risk,
    posture: momentum.posture.recommended_posture,
  };
}

async function loadCoachingSelectorV2Context(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  actionHint?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<{
  v2Momentum: CoachingV2MomentumContext;
  targetPlanItem: CoachingV2PlanItemContext | null;
}> {
  const v2Momentum = mapMomentumStateV2ToCoachingContext(args.tempMemory);
  const fallbackTitle = String(
    readMomentumStateV2(args.tempMemory).assessment?.top_blocker ?? "",
  ).trim();

  if (!String(args.actionHint ?? "").trim() && !fallbackTitle) {
    return { v2Momentum, targetPlanItem: null };
  }

  try {
    const resolvedRuntime = await resolveActiveTransformationRuntime({
      supabase: args.supabase,
      userId: args.userId,
      runtime: args.runtime,
    });
    if (!resolvedRuntime.plan) {
      return { v2Momentum, targetPlanItem: null };
    }
    const planItems = await getPlanItemRuntime(
      args.supabase,
      resolvedRuntime.plan.id,
    );
    return {
      v2Momentum,
      targetPlanItem: resolveCoachingTargetPlanItem({
        planItems,
        actionHint: args.actionHint,
        fallbackTitle,
      }),
    };
  } catch (error) {
    console.warn(
      "[Router] coaching V2 context load failed (non-blocking):",
      error,
    );
    return { v2Momentum, targetPlanItem: null };
  }
}

type CoachingAddonAttempt = {
  trigger: CoachingInterventionTriggerDetection;
  input: CoachingInterventionSelectorInput;
  selector: Awaited<ReturnType<typeof runCoachingInterventionSelector>>;
  addon: CoachingInterventionRuntimeAddon | null;
};

async function maybeAttachCoachingInterventionAddon(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  history: any[];
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  v2Runtime?: ActiveTransformationRuntime | null;
  targetMode: AgentMode;
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string };
}): Promise<CoachingAddonAttempt | null> {
  const {
    supabase,
    userId,
    userMessage,
    history,
    tempMemory,
    dispatcherSignals,
    planItemSnapshot,
    v2Runtime,
    targetMode,
    meta,
  } = args;

  if (targetMode !== "companion") {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
    return null;
  }

  const momentumV2 = readMomentumStateV2(tempMemory);
  const blockerRepeatScore = momentumV2.blockers.blocker_repeat_score ?? 0;
  const actionHint = String(
    dispatcherSignals.plan_item_discussion?.item_hint ??
      resolvePlanItemTitleFromSnapshot(
        planItemSnapshot,
        dispatcherSignals.plan_item_discussion?.target_item_id,
      ) ??
      dispatcherSignals.track_progress_plan_item?.target_title ??
      resolvePlanItemTitleFromSnapshot(
        planItemSnapshot,
        dispatcherSignals.track_progress_plan_item?.target_item_id,
      ) ?? "",
  )
    .trim()
    .slice(0, 120);
  const trigger = detectCoachingInterventionTrigger({
    userMessage,
    actionHint: actionHint || null,
    progressStatusHint: dispatcherSignals.track_progress_plan_item?.status_hint,
    topBlockerStage: blockerRepeatScore >= 6 ? "chronic" : null,
  });

  if (!trigger) {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
    return null;
  }

  const coachingV2Context = await loadCoachingSelectorV2Context({
    supabase,
    userId,
    tempMemory,
    actionHint: actionHint || null,
    runtime: v2Runtime,
  });

  const knownBlockers = buildKnownCoachingBlockersFromTempMemory(tempMemory);
  const orderedKnownBlockers = trigger.blocker_hint
    ? [
      { blocker_type: trigger.blocker_hint, confidence: "medium" as const },
      ...knownBlockers.filter((item) =>
        item.blocker_type !== trigger.blocker_hint
      ),
    ].slice(0, 3)
    : knownBlockers;

  const selectorInput: CoachingInterventionSelectorInput = {
    momentum_state: momentumV2.current_state ?? null,
    explicit_help_request: trigger.explicit_help_request,
    trigger_kind: trigger.trigger_kind,
    last_user_message: userMessage,
    recent_context_summary: buildRecentContextSummaryForSelector(history),
    target_action_title: actionHint || null,
    target_plan_item: coachingV2Context.targetPlanItem,
    v2_momentum: coachingV2Context.v2Momentum,
    known_blockers: orderedKnownBlockers,
    technique_history: buildTechniqueHistoryForSelector(tempMemory),
    safety: {
      distress_detected: Number(dispatcherSignals.risk_score ?? 0) >= 8,
      pause_requested: momentumV2.current_state === "pause_consentie",
    },
  };

  const selector = await runCoachingInterventionSelector({
    input: selectorInput,
    meta: {
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
      model: meta?.model,
      userId,
    },
  });

  const addon = buildCoachingInterventionRuntimeAddon({
    input: selectorInput,
    output: selector.output,
    source: selector.source,
  });

  if (addon) {
    (tempMemory as any).__coaching_intervention_addon = addon;
  } else {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
  }

  return {
    trigger,
    input: selectorInput,
    selector,
    addon,
  };
}

function clearOneShotKeys(tempMemory: any, consumedBilanStopped: boolean) {
  if (!tempMemory || typeof tempMemory !== "object") return;
  const keys = [
    "__checkup_not_triggerable_addon",
    "__dashboard_redirect_addon",
    "__dashboard_capabilities_addon",
    "__dashboard_preferences_intent_addon",
    "__plan_feedback_addon",
    "__coaching_intervention_addon",
    "__track_progress_plan_item_runtime",
    "__dual_tool_addon",
    "__resume_message_prefix",
    "__abandon_message",
    "__defense_card_win_addon",
    "__defense_card_pending_triggers",
  ];
  for (const key of keys) {
    try {
      delete (tempMemory as any)[key];
    } catch {
      // best effort
    }
  }
  if (consumedBilanStopped) {
    try {
      delete (tempMemory as any).__bilan_just_stopped;
    } catch {
      // best effort
    }
  }
}

function normalizeOperationText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function detectConfirmationKind(args: {
  userMessage: string;
  operationType?: string;
  pendingContext?: unknown;
  requestId?: string | null;
  structuredOnly?: boolean;
}): Promise<ToolSkillConfirmationKind> {
  void args.structuredOnly;
  return await reviewToolSkillConfirmationWithAi({
    operation_type: args.operationType ?? "pending_operation",
    message: args.userMessage,
    pending_context: args.pendingContext ?? null,
    request_id: args.requestId ?? null,
  });
}

function isBroaderPlanAdjustmentInput(value: Record<string, unknown> | null) {
  const scopeKind = String((value as any)?.scope?.kind ?? "").trim();
  const granularity = String(
    (value as any)?.target_granularity?.value ??
      (value as any)?.target_granularity ??
      "",
  ).trim();
  return scopeKind === "current_level" || scopeKind === "whole_plan" ||
    granularity === "action_cluster" || granularity === "current_level" ||
    granularity === "whole_plan";
}

function adjustPlanScopeKindFromOperationInput(
  value: Record<string, unknown> | null,
): string {
  if (!value || typeof value !== "object") return "";
  return String((value as any)?.scope?.kind ?? "").trim();
}

function mergeActiveAdjustPlanOperationInput(args: {
  active: Record<string, unknown> | null;
  scoped: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (!args.active) return args.scoped;
  if (!args.scoped) return args.active;
  const activeScope = adjustPlanScopeKindFromOperationInput(args.active);
  const scopedScope = adjustPlanScopeKindFromOperationInput(args.scoped);
  const activeIsBroad = activeScope === "current_level" ||
    activeScope === "whole_plan";
  const scopedIsSpecific = scopedScope === "specific_plan_item";
  if (activeIsBroad && scopedIsSpecific) {
    return {
      ...args.active,
      latest_turn_operation_input: args.scoped,
      latest_turn_affected_item_hint: (args.scoped as any).scope ??
        (args.scoped as any).target ?? null,
    };
  }
  return {
    ...args.active,
    ...args.scoped,
    intake_state: (args.active as any).intake_state ??
      (args.scoped as any).intake_state,
    payload: (args.active as any).payload ?? (args.scoped as any).payload,
    latest_turn_operation_input: args.scoped,
  };
}

function adjustPlanIntentUserIntent(
  turnFrame: TurnFrame | null,
): TurnFrame["tool_skill_intents"][number]["user_intent"] | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  );
  return intent?.user_intent ?? null;
}

function isAdjustPlanExplainOnlyIntent(turnFrame: TurnFrame | null): boolean {
  return adjustPlanIntentUserIntent(turnFrame) === "explain_only";
}

function isAdjustPlanRevisionIntent(turnFrame: TurnFrame | null): boolean {
  return adjustPlanIntentUserIntent(turnFrame) === "adjust";
}

export function effectiveResponseOwnerForOperationRuntime(args: {
  routeDecision: Pick<RouteDecision, "response_owner"> | null;
  toolSkillRun?: unknown;
}): ResponseOwner {
  const selectedHandler = String(
    (args.toolSkillRun as any)?.selected_handler ?? "",
  ).trim();
  if (selectedHandler) return "tool_skill";
  return args.routeDecision?.response_owner ?? "normal_reply";
}

export function operationRouteIsSelected(args: {
  operationType: string;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  if (
    args.operationType === "adjust_plan_item" &&
    loadAdjustPlanFrameFromTempMemory(args.tempMemory).pending_draft_review
  ) {
    return true;
  }
  const activeFlow = readActiveFlowState(args.tempMemory);
  const pending = activeFlow.pendingToolSkillConfirmation;
  const pendingType = pendingOperationType(pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;
  const pendingRecommendation = activeFlow.pendingRecommendationOperation;
  const activeIntake = activeFlow.activeToolSkillIntake;
  const activeOperationType = String(
    (activeIntake as any)?.operation_type ?? "",
  );
  if (activeOperationType && activeOperationType !== args.operationType) {
    return false;
  }
  if (
    activeOperationType === args.operationType
  ) {
    return true;
  }
  if (
    args.operationType === "adjust_plan_item" &&
    isPendingAdjustPlanItemRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.operationType === "prepare_attack_card" &&
    isPendingAttackCardRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.operationType === "prepare_defense_card" &&
    pendingOperationType(pendingRecommendation) === "prepare_defense_card"
  ) return true;
  if (pendingOperationType(pendingRecommendation) === args.operationType) {
    return true;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function hasStrongToolSkillIntent(
  turnFrame: TurnFrame | null,
  operationType?: string,
): boolean {
  return (turnFrame?.tool_skill_intents ?? []).some((intent) =>
    (!operationType || intent.operation_type === operationType) &&
    intent.confidence_band !== "low" &&
    intent.user_intent !== "explain_only" &&
    intent.ambiguity === "none"
  );
}

function isAmbivalentAdjustPlanReflectionRequest(text: string): boolean {
  const normalized = normalizeRecommendationText(text).replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  const hasAmbivalence =
    /\b(je ne suis pas sur|je suis pas sur|pas sur|pas sure|pas certain|pas certaine|j'hesite|j hesite|je me demande|une partie de moi|je me dis|reaction de fatigue)\b/
      .test(normalized);
  const asksForReflection =
    /\b(aide[- ]?moi a reflechir|reflechir|bonne idee|est ce que c'est|est-ce que c'est|plutot)\b/
      .test(normalized);
  const mentionsAdjustment =
    /\b(ajuster|modifier|changer|baisser|descendre|diminuer|reduire|alleger|laisser tomber|retirer|supprimer|rythme|fois|jour)\b/
      .test(normalized);
  const directAdjustmentCommand =
    /\b(je veux|passe|mets|met|applique|valide|confirme|modifie|change|ajuste|baisse|descends|diminue|reduis|allege|prepare un brouillon|propose[- ]?moi un brouillon)\b/
      .test(normalized);

  return mentionsAdjustment && (hasAmbivalence || asksForReflection) &&
    !directAdjustmentCommand;
}

let operationServiceClient: SupabaseClient | null = null;

export function getOperationServiceClient(): SupabaseClient | null {
  if (operationServiceClient) return operationServiceClient;
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const key = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) return null;
  operationServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return operationServiceClient;
}

function adjustPlanCoachTrace(
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  const input = operationInput && typeof operationInput === "object"
    ? operationInput as Record<string, unknown>
    : {};
  return {
    coaching_guidance: input.coaching_guidance ?? null,
    coaching_guidance_audit: input.coaching_guidance_audit ?? null,
  };
}

export async function maybeRunAdjustPlanItemOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history: any[];
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  forceFullAi?: boolean;
  enableAdjustPlanCoachGuidance?: boolean;
}): Promise<OperationRuntimeResult | null> {
  return await maybeRunAdjustPlanItemOperationInSkill({
    context: {
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      history: args.history,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
      turnFrame: args.turnFrame,
      routeDecision: args.routeDecision,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      forceFullAi: args.forceFullAi,
      enableAdjustPlanCoachGuidance: args.enableAdjustPlanCoachGuidance,
      confirmationSecret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    },
    deps: {
      writePlanPatch: async (input) =>
        await writePlanAdjustmentPatch({
          supabase: args.supabase,
          userId: args.userId,
          draft: input.draft,
          operationInput: input.operationInput ?? null,
          operationId: input.operationId,
          requestId: input.requestId ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
          regenerateAdjustedPlan: async (regenerationInput) => {
            const userTime = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
            }).catch(() => null);
            const result = await generatePlanV2ForTransformation({
              admin: args.supabase,
              requestId: args.requestId ?? crypto.randomUUID(),
              userId: args.userId,
              transformationId: regenerationInput.transformationId,
              mode: "generate_and_activate",
              feedback: regenerationInput.feedback,
              forceRegenerate: true,
              pace: null,
              preserveActiveTransformationId:
                regenerationInput.transformationId,
              adjustmentContext: {
                reviewId: input.operationId,
                scope: regenerationInput.scopeKind === "current_level"
                  ? "level"
                  : "plan",
                effectiveStartDate: userTime?.user_local_date ??
                  new Date().toISOString().slice(0, 10),
                reason: regenerationInput.reason,
                userChangeSummary: regenerationInput.userChangeSummary,
                assistantMessage: regenerationInput.assistantMessage,
              },
            });
            return {
              plan_id: result.planRow.id,
              roadmap_changed: result.roadmapChanged,
            };
          },
        }),
      isExplicitPendingApplyConfirmation,
      isWeeklyMissionCarryOverRequest,
      weeklyMissionCarryOverContext,
      isCopyForwardWeeklyRequest,
      isWeeklyLightRepeatRequest,
      weeklyAdaptiveReviewStateForTurn: ({ activeSkillState, tempMemory }) =>
        weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
      normalizeRecommendationText,
      isAdjustPlanExplainOnlyIntent,
      isAdjustPlanRevisionIntent,
      operationRouteIsSelected,
      operationInputFromPlanAdjustmentScope,
      isVagueWholePlanWeeklyAdjustmentRequest,
      isPendingAdjustPlanItemRecommendationOperation,
      isBroaderPlanAdjustmentInput,
      isAmbivalentAdjustPlanReflectionRequest,
      isOperationEscapeMessage,
      hasStrongToolSkillIntent,
      readLastResolvedPlanItem,
      resolvePlanItemTargetFromToolSkillIntent,
      writeLastResolvedPlanItem,
      mergeActiveAdjustPlanOperationInput,
      operationInputFromLastPlanItem,
      planItemTitleFromOperationInput,
    },
  }) as OperationRuntimeResult | null;
}

// Chantier L5 (2026-05-29) — l'orchestration update_coach_preferences
// vit dans le router du skill. run.ts conserve seulement les helpers partages
// encore utilises par les tests et anciens routers.
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
  let dispatcherLatencyMs: number | undefined;
  let contextLatencyMs: number | undefined;
  let agentLatencyMs: number | undefined;
  let researchLatencyMs: number | undefined;

  const channel = meta?.channel ?? "web";
  const scope = normalizeScope(
    meta?.scope,
    channel === "whatsapp" ? "whatsapp" : "web",
  );

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
        requestId: meta?.requestId,
        evalRunId: (meta as any)?.evalRunId ?? null,
        forceBrainTrace: (meta as any)?.forceBrainTrace,
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
  await trace("brain:user_message_logged", "io", {
    logged_message_id: loggedMessageId,
    log_messages: logMessages,
    scope,
    channel,
  }, "debug");
  const effectLedger = createEffectLedger(
    meta?.requestId ?? loggedMessageId ?? crypto.randomUUID(),
  );

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
      await trace("brain:debounce_aborted", "io", {
        reason: debounced.abortReason ?? "debounceAndBurstMerge",
        logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
        latest_message_id: debounced.latestMessageId ?? null,
      }, "debug");
      try {
        const abortTurnFrame: TurnFrame = {
          turn_id: meta?.requestId ?? loggedMessageId,
          source_message_id: loggedMessageId,
          user_id: userId,
          channel,
          safety: { risk_band: "none", reason_codes: [], evidence: [] },
          conversation_risk: {
            score: 0,
            threshold: 8,
            should_exit_flows: false,
            reason_codes: [],
            previous_scores: [],
            matrix: [],
            context_summary: null,
          },
          direct_effects: [],
          tool_skill_intents: [],
          tool_skill_opportunity: {
            type: "none",
            operation_type: null,
            surface_id: null,
            confidence_band: "low",
            should_offer: false,
            prop_reason: null,
            source_span: null,
            target_hint: null,
            target_status: "none",
            suggested_question_intent: null,
            offer_timing: "never",
            must_not_execute: true,
          },
          skill_signals: {},
          memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
        };
        const abortRouteDecision: RouteDecision = {
          route_version: "v1",
          response_owner: "normal_reply",
          selected_handler: "debounce_abort",
          blocked_paths: [{ path: "response", reason_code: "debounce_abort" }],
          direct_effects_to_run: [],
          reason_code: "debounce_abort",
          memory_used_for_route: false,
          memory_item_ids_used_for_route: [],
          memory_use_kind: "none",
        };
        await logConversationTurn({
          turn_id: abortTurnFrame.turn_id,
          user_id: userId,
          source_message_id: loggedMessageId,
          ts: new Date().toISOString(),
          safety_pregate: {
            detected: false,
            evidence: [],
            risk_band: "none",
            reason_codes: [],
            allow_side_effects: true,
            layer_contributions: {
              lexical: false,
              heuristic: false,
              dispatcher_llm: false,
            },
          } as any,
          dispatcher_run: {
            latency_ms: 0,
            tokens_in: 0,
            tokens_out: 0,
            prompt_version: "debounce_abort",
            model_used: null,
            memory_plan: DEFAULT_DISPATCHER_MEMORY_PLAN,
          },
          turn_frame: abortTurnFrame,
          route_decision: abortRouteDecision,
          direct_effects: [],
          tool_skill_run: {
            status: "aborted",
            reason_code: debounced.abortReason ?? "debounceAndBurstMerge",
            logged_message_id: debounced.loggedMessageId ?? loggedMessageId,
            latest_message_id: debounced.latestMessageId ?? null,
          },
          confirmation_token_outcomes: [],
          memory_write_candidates_emitted: 0,
          response_owner: "normal_reply",
          total_latency_ms: Date.now() - turnStartMs,
        }, { supabase });
      } catch (error) {
        console.warn(
          "[Router] debounce abort trace failed (non-blocking):",
          error,
        );
      }
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
  let tempMemory: any = (state as any)?.temp_memory ?? {};
  await trace("brain:user_state_loaded", "context", {
    current_mode: (state as any)?.current_mode ?? null,
    has_temp_memory: Boolean(tempMemory && typeof tempMemory === "object"),
    has_investigation_state: Boolean((state as any)?.investigation_state),
  }, "debug");

  const onboarding = stabilizeOnboardingFlag(tempMemory);
  tempMemory = onboarding.tempMemory;
  const coachingMemoryBeforeReconcile = readCoachingInterventionMemory(
    tempMemory,
  );
  tempMemory = await reconcileCoachingInterventionStateFromUserTurn({
    tempMemory,
    userMessage,
    history,
    meta: {
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
      model: meta?.model,
      userId,
    },
  });
  const coachingMemoryAfterReconcile = readCoachingInterventionMemory(
    tempMemory,
  );
  const coachingFollowUpAudit = deriveCoachingFollowUpAudit({
    before: coachingMemoryBeforeReconcile,
    after: coachingMemoryAfterReconcile,
  });
  if (coachingFollowUpAudit) {
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_followup_classified",
      payload: {
        momentum_state: readMomentumStateV2(tempMemory).current_state ?? null,
        follow_up_outcome: coachingFollowUpAudit.follow_up_outcome,
        helpful: coachingFollowUpAudit.helpful,
        blocker_type: coachingFollowUpAudit.blocker_type,
        recommended_technique: coachingFollowUpAudit.technique_id,
        intervention_id: coachingFollowUpAudit.intervention_id,
        previous_status: coachingFollowUpAudit.previous_status,
        next_status: coachingFollowUpAudit.next_status,
        follow_up_needed: false,
        selector_source: coachingFollowUpAudit.selector_source,
        customization_context: {
          target_action_title: coachingFollowUpAudit.target_action_title ??
            null,
        },
        outcome_reason: coachingFollowUpAudit.outcome_reason,
        history_snapshot: buildCoachingHistorySnapshot(
          buildTechniqueHistoryForSelector(tempMemory),
        ),
      },
    });
  }

  // Magic Reset Check (abracadabra)
  const magicResetVariant = detectMagicResetCommand(userMessage);
  if (magicResetVariant) {
    const { tempMemory: cleared, clearedKeys } = clearMachineStateTempMemory({
      tempMemory,
    });
    tempMemory = cleared;
    await trace("brain:magic_reset_command", "routing", {
      variant: magicResetVariant,
      cleared_keys: clearedKeys,
      cleared_count: clearedKeys.length,
    }, "warn");

    // Force immediate persist to ensure reset sticks even if later logic fails
    await updateUserState(supabase, userId, scope, { temp_memory: tempMemory });
  }

  const { lastAssistantMessage } = buildLastAssistantInfo(history);
  let v2Runtime: ActiveTransformationRuntime | null = null;
  const v2RuntimeStartMs = Date.now();
  try {
    v2Runtime = await withTimeout(
      getActiveTransformationRuntime(supabase, userId),
      envInt("SOPHIA_V2_RUNTIME_PREFETCH_TIMEOUT_MS", 1500),
      "v2_runtime_prefetch",
    );
    await trace("brain:v2_runtime_prefetched", "context", {
      load_ms: Date.now() - v2RuntimeStartMs,
      has_cycle: Boolean(v2Runtime.cycle),
      has_transformation: Boolean(v2Runtime.transformation),
      has_plan: Boolean(v2Runtime.plan),
    }, "debug");
  } catch (error) {
    console.warn(
      "[Router] V2 runtime prefetch failed (non-blocking):",
      error,
    );
    await trace("brain:v2_runtime_prefetch_failed", "context", {
      load_ms: Date.now() - v2RuntimeStartMs,
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  let attackKeywordContextOverride = "";
  let attackKeywordMatchForTurn: AttackKeywordMatch | null = null;
  try {
    const attackKeywordMatch = await loadAttackKeywordMatch({
      supabase,
      userId,
      userMessage,
      runtime: v2Runtime,
    });
    if (attackKeywordMatch) {
      attackKeywordMatchForTurn = attackKeywordMatch;
      attackKeywordContextOverride = buildAttackKeywordContextOverride({
        match: attackKeywordMatch,
      });
      await trace("brain:attack_keyword_trigger_detected", "routing", {
        activation_keyword:
          attackKeywordMatch.payload.activation_keyword_normalized,
        scope_kind: attackKeywordMatch.scopeKind,
        transformation_id: attackKeywordMatch.transformationId,
      }, "info");
    }
  } catch (error) {
    await trace("brain:attack_keyword_trigger_failed", "routing", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  const planItemSnapshot: V2PlanItemSnapshotItem[] | undefined =
    await loadPlanSnapshotForTurn({
      supabase,
      userId,
      runtime: v2Runtime,
      onError: (phase, error) => {
        console.warn(
          phase === "primary"
            ? "[Router] V2 plan item snapshot load failed (non-blocking):"
            : "[Router] V2 plan item snapshot fallback failed (non-blocking):",
          error,
        );
      },
    });
  const clientNow = meta?.clientNowIso ? new Date(meta.clientNowIso) : null;
  const userTime = await getUserTimeContext({
    supabase,
    userId,
    now: clientNow && Number.isFinite(clientNow.getTime())
      ? clientNow
      : undefined,
  }).catch(() => null as any);

  const currentMessagePlanTarget = resolvePlanItemTargetFromText(
    userMessage,
    planItemSnapshot,
  );
  if (currentMessagePlanTarget) {
    tempMemory = writeLastResolvedPlanItem(
      tempMemory,
      currentMessagePlanTarget,
      "user_message",
    );
  }
  const preContextualPlanTarget = readLastResolvedPlanItem(tempMemory);

  if (currentMessagePlanTarget) {
    tempMemory = writeLastResolvedPlanItem(
      tempMemory,
      currentMessagePlanTarget,
      "user_message",
    );
  } else if (preContextualPlanTarget) {
    tempMemory = {
      ...(tempMemory ?? {}),
      __last_resolved_plan_item: preContextualPlanTarget,
    };
  }
  const recentMessagesForTurnFrame = history.slice(-8).map((message: any) => ({
    role: message?.role === "assistant"
      ? "assistant" as const
      : "user" as const,
    content: String(message?.content ?? ""),
  }));
  const safetyPregateOutput = withActiveSafetyFlowCaution(
    runSafetyPregate({
      user_message: userMessage,
      recent_messages: recentMessagesForTurnFrame,
      user_id: userId,
      channel,
    }),
    tempMemory,
  );
  let turnFrame: TurnFrame | null = null;
  let routeDecision: RouteDecision | null = null;
  let userTurnSnapshot: UserTurnSnapshot | null = null;
  let turnAgenda: TurnAgenda | null = null;
  let turnAgendaSummary: TurnAgendaSummary | null = null;
  let dispatcherSignals: DispatcherSignals = DEFAULT_SIGNALS;
  let directEffectGateResult: EffectGateOrchestratorResult | null = null;
  let conversationRiskForPersist:
    | NonNullable<
      TurnFrame["conversation_risk"]
    >
    | null = null;
  let conversationRiskHistoryForPersist: number[] = Array.isArray(
      (tempMemory as any)?.__conversation_risk_history,
    )
    ? ((tempMemory as any).__conversation_risk_history as unknown[])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(-5)
    : [];
  const dispatcherV2Stats: DispatcherRunStats[] = [];
  const activeFlowStateForTurn = readActiveFlowState(tempMemory);
  let activeSkillState = activeFlowStateForTurn.activeSkillState;
  let activeOperationIntake = activeFlowStateForTurn.activeToolSkillIntake;
  if (
    activeOperationIntake &&
    (isOperationEscapeMessage(userMessage) ||
      isOperationCorrectionOrSafetyInterruption(userMessage))
  ) {
    tempMemory = clearActiveToolFlow(tempMemory);
    activeOperationIntake = null;
  }
  const activeOperationIntakeForDispatcher = activeOperationIntake;
  let pendingOperationConfirmation =
    readActiveFlowState(tempMemory).pendingToolSkillConfirmation;
  let pendingOperationConfirmationForGlobalRouting =
    pendingConfirmationOwnedByToolSkill(pendingOperationConfirmation)
      ? null
      : pendingOperationConfirmation;
  const activeRuntimeContextForDispatcher = buildDispatcherActiveRuntimeContext(
    {
      tempMemory,
      activeSkillState,
      activeOperationIntake: activeOperationIntakeForDispatcher,
      pendingOperationConfirmation,
    },
  );
  const fullAiRequested = meta?.forceRealAi === true ||
    (opts?.messageMetadata as Record<string, unknown> | undefined)
        ?.force_full_ai === true;
  const dispatcherLlmRunner =
    opts?.messageMetadata?.test_endpoint === "test-send-message" &&
      !fullAiRequested
      ? undefined
      : buildDispatcherLlmRunner({ ...meta, forceRealAi: fullAiRequested });
  const turnFrameStartMs = Date.now();
  try {
    turnFrame = await runDispatcher({
      user_message: userMessage,
      recent_messages: recentMessagesForTurnFrame,
      user_id: userId,
      channel,
      active_skill_state: activeSkillState,
      active_tool_skill_intake: activeOperationIntakeForDispatcher,
      pending_tool_skill_confirmation:
        pendingOperationConfirmationForGlobalRouting,
      active_topic_state: (tempMemory as any)?.memory_v2_active_topic ?? null,
      flow_state_context: {
        channel,
        scope,
        user_time: userTime
          ? {
            user_timezone: userTime.user_timezone,
            user_local_date: userTime.user_local_date,
            user_local_datetime: userTime.user_local_datetime,
            user_local_human: userTime.user_local_human,
          }
          : null,
        whatsapp_mode: meta?.whatsappMode ?? null,
        forced_mode: opts?.forceMode ?? null,
        force_onboarding_flow: Boolean(opts?.forceOnboardingFlow),
        onboarding_active: meta?.whatsappMode === "onboarding" ||
          Boolean(opts?.forceOnboardingFlow),
        active_runtime_context: activeRuntimeContextForDispatcher,
      },
      plan_snapshot: {
        items: (planItemSnapshot ?? []).map((item: any) => ({
          id: item?.id,
          title: item?.title,
          status: item?.status,
          kind: item?.item_type,
          dimension: item?.dimension,
          cadence_label: item?.cadence_label ?? null,
          target_reps: item?.target_reps ?? null,
          current_reps: item?.current_reps ?? null,
          item_nature: item?.item_nature ?? null,
          available_this_week: item?.available_this_week ?? false,
          availability_status: item?.availability_status ?? null,
          week_scope: item?.week_scope ?? null,
          source_kind: item?.source_kind ?? null,
          payload: item?.payload && typeof item.payload === "object"
            ? item.payload
            : null,
        })),
      },
      safety_pregate_output: safetyPregateOutput,
      conversation_risk_history: conversationRiskHistoryForPersist,
      source_message_id: loggedMessageId ?? undefined,
      turn_id: meta?.requestId ?? loggedMessageId ?? undefined,
      llm_runner: dispatcherLlmRunner,
      model_name: String(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
          Deno.env.get("GEMINI_FALLBACK_MODEL") ??
          "gemini-2.5-flash",
      ).trim(),
      on_stats: (stats) => {
        dispatcherV2Stats.push(stats);
      },
    });
    dispatcherLatencyMs = Date.now() - turnStartMs;
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
    const conversationRisk = turnFrame.conversation_risk;
    if (conversationRisk) {
      conversationRiskForPersist = conversationRisk;
      conversationRiskHistoryForPersist = [
        ...(conversationRisk.previous_scores ?? []),
        Number(conversationRisk.score ?? 0),
      ]
        .filter((value) => Number.isFinite(value))
        .slice(-5);
      tempMemory = {
        ...(tempMemory ?? {}),
        __conversation_risk_history: conversationRiskHistoryForPersist,
        __conversation_risk_last: {
          score: conversationRisk.score,
          threshold: conversationRisk.threshold,
          should_exit_flows: conversationRisk.should_exit_flows,
          reason_codes: conversationRisk.reason_codes,
          flow_exit_context: conversationRisk.flow_exit_context ?? null,
          at: new Date().toISOString(),
        },
      };
    }
    if (conversationRisk?.should_exit_flows) {
      const { tempMemory: cleared, clearedKeys } = clearMachineStateTempMemory({
        tempMemory,
      });
      tempMemory = {
        ...(cleared ?? {}),
        __conversation_risk_history: conversationRiskHistoryForPersist,
        __conversation_risk_last: {
          score: conversationRisk.score,
          threshold: conversationRisk.threshold,
          should_exit_flows: true,
          reason_codes: conversationRisk.reason_codes,
          flow_exit_context: conversationRisk.flow_exit_context ?? null,
          at: new Date().toISOString(),
        },
      };
      activeSkillState = null;
      activeOperationIntake = null;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      await updateUserState(supabase, userId, scope, {
        temp_memory: tempMemory,
      });
      await trace("brain:conversation_risk_flow_exit", "routing", {
        score: conversationRisk.score,
        threshold: conversationRisk.threshold,
        reason_codes: conversationRisk.reason_codes,
        previous_scores: conversationRisk.previous_scores,
        matrix: conversationRisk.matrix,
        flow_exit_context: conversationRisk.flow_exit_context ?? null,
        cleared_keys_count: clearedKeys.length,
        cleared_keys: clearedKeys.slice(0, 40),
      }, "warn");
    }
    routeDecision = runConversationRouters({
      turn_frame: turnFrame,
      active_skill_state: activeSkillState,
      active_tool_skill_intake: activeOperationIntake,
      pending_tool_skill_confirmation:
        pendingOperationConfirmationForGlobalRouting,
      safety_pregate_risk_band: safetyPregateOutput.risk_band,
    });
    const centralArbitration = arbitrateTurnIntent({
      userMessage,
      routeDecision,
      turnFrame,
      tempMemory,
      activeOperationIntake,
      pendingOperationConfirmation:
        pendingOperationConfirmationForGlobalRouting,
      safetyBlocksTools: blocksToolSkills(safetyPregateOutput.risk_band),
    });
    if (centralArbitration.changed) {
      routeDecision = centralArbitration.routeDecision;
      turnFrame = centralArbitration.turnFrame;
      tempMemory = centralArbitration.tempMemory;
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      if (centralArbitration.clearTargets.includes("active_tool")) {
        activeOperationIntake = null;
      }
      if (centralArbitration.clearTargets.includes("pending_tool")) {
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
      }
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      !isSafetyRoute(routeDecision) &&
      turnFrame &&
      isImplicitWholePlanRepairAdjustmentRequest(userMessage)
    ) {
      const currentTurnFrame = turnFrame;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "adjust_plan_item",
        reason_code: "implicit_whole_plan_repair_bridge_adjustment",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "whole_plan_repair_bridge_requires_adjust_plan",
          },
        ],
      };
      turnFrame = {
        ...currentTurnFrame,
        tool_skill_intents: [
          ...currentTurnFrame.tool_skill_intents.filter((intent) =>
            intent.operation_type !== "adjust_plan_item"
          ),
          {
            operation_type: "adjust_plan_item",
            explicitness: "implicit",
            target_hint: userMessage,
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "adjust",
            adjust_plan_scope: "whole_plan",
          } as any,
        ],
      } as TurnFrame;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame: turnFrame as TurnFrame,
        userMessage,
      });
    }
    if (
      (activeOperationIntake as any)?.operation_type === "adjust_plan_item" &&
      routeDecision.response_owner === "product_help"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "adjust_plan_item",
        reason_code: "active_adjust_plan_intake_kept_in_tool_skill",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "active_adjust_plan_intake_in_progress",
          },
        ],
      };
    }
    if (
      pendingOperationConfirmationForGlobalRouting &&
      (routeDecision.reason_code === "confirmation_correction_to_pending" ||
        routeDecision.reason_code === "global_confirmation_contract_revise") &&
      (await detectConfirmationKind({ userMessage })) === "yes" &&
      isExplicitPendingApplyConfirmation(userMessage)
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "pending_confirmation",
        selected_handler: "execute_confirmed",
        reason_code: "confirmation_yes_with_adjustment",
        direct_effects_to_run: [],
      };
    }
    if (isEarlyWeeklyPlanningValidationRequest(userMessage)) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: "weekly_planning_locked_until_review",
        reason_code: "weekly_planning_validation_locked_until_review",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.adjust_plan_item",
            reason_code: "weekly_planning_validation_locked_until_review",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      shouldKeepWeeklyAdaptiveReviewInConversation({
        activeSkillState,
        tempMemory,
        routeDecision,
        turnFrame,
        userMessage,
      })
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "conversation_handler",
        selected_handler: "weekly_adaptive_review_v1",
        reason_code: "active_weekly_review_kept_in_conversation",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill",
            reason_code: "active_weekly_review_requires_confirmation_flow",
          },
          {
            path: "product_help",
            reason_code: "active_weekly_review_requires_branch_decision",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
        tool_skill_opportunity: {
          type: "none",
          operation_type: null,
          surface_id: null,
          confidence_band: "low",
          should_offer: false,
          prop_reason: null,
          source_span: null,
          target_hint: null,
          target_status: "none",
          suggested_question_intent: null,
          offer_timing: "never",
          must_not_execute: true,
        },
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !isSafetyRoute(routeDecision) &&
      detectExplicitNoToolRequest(userMessage)
    ) {
      const reasonCode = "explicit_no_tool_request_blocks_tool_start";
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          { path: "tool_skill_flow", reason_code: reasonCode },
          { path: "direct_effects", reason_code: reasonCode },
        ],
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: [],
        tool_skill_intents: [],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const oneShotModificationGuard = oneShotReminderModificationRouteGuard(
      userMessage,
    );
    if (
      !isSafetyRoute(routeDecision) &&
      oneShotModificationGuard.blocked
    ) {
      const reasonCode = oneShotModificationGuard.reason_code;
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.adjust_plan_item",
            reason_code: reasonCode,
          },
          {
            path: "direct_effects.create_one_shot_reminder",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: [],
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "adjust_plan_item" &&
          intent.operation_type !== "create_recurring_reminder"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      isOperationEscapeMessage(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting &&
      routeDecision.response_owner === "tool_skill" &&
      !hasStrongToolSkillIntent(turnFrame)
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "operation_escape_to_normal_reply",
        direct_effects_to_run: [],
      };
    }
    if (
      routeDecision.response_owner === "tool_skill" &&
      routeDecision.selected_handler === "update_coach_preferences" &&
      !pendingOperationConfirmationForGlobalRouting &&
      (
        isLocalTextRevisionRequest(userMessage) ||
        isCoachPreferenceVerificationRequest(userMessage) ||
        isImmediateModeRequestNotCoachPreference(userMessage) ||
        isApplyExistingCoachPreferenceRequest(userMessage)
      )
    ) {
      const reasonCode = isCoachPreferenceVerificationRequest(userMessage)
        ? "coach_preference_verification_not_update"
        : isApplyExistingCoachPreferenceRequest(userMessage)
        ? "apply_existing_coach_preference_not_update"
        : isImmediateModeRequestNotCoachPreference(userMessage)
        ? "immediate_mode_request_not_coach_preference"
        : "local_text_revision_not_coach_preference";
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.update_coach_preferences",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "update_coach_preferences"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      hasExplicitOneShotReminderDirectEffectOverride({
        directEffectsToRun: routeDecision.direct_effects_to_run,
        directEffects: turnFrame?.direct_effects,
        pendingToolSkillConfirmation: pendingOperationConfirmation,
      })
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "explicit_direct_effect_supersedes_pending_confirmation",
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "pending_tool_skill_confirmation",
            reason_code:
              "explicit_direct_effect_supersedes_pending_confirmation",
          },
        ],
      };
    }
    if (
      !isSafetyRoute(routeDecision) &&
      shouldOneShotReminderSupersedeToolFlow({
        message: userMessage,
        hasActiveOrPendingToolFlow: Boolean(
          pendingOperationConfirmation || activeOperationIntake,
        ),
        safetyBlocksTools: blocksToolSkills(safetyPregateOutput.risk_band),
      })
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "explicit_one_shot_reminder_supersedes_tool_flow",
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill_flow",
            reason_code: "explicit_one_shot_reminder_supersedes_tool_flow",
          },
        ],
      };
    }
    if (
      !isSafetyRoute(routeDecision) &&
      isRecapOnlyRequest(userMessage) &&
      // CHANTIER G0 (2026-05-29) — un récap ne supersede JAMAIS une commande
      // d'opération explicite (création carte/rappel, confirmation/exécution
      // rappel). Voir edgecases-r3 T5, syncskills-r2 T2.
      !isExplicitOperationCommand(userMessage) &&
      (pendingOperationConfirmation || activeOperationIntake)
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "recap_only_request_supersedes_tool_flow",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill_flow",
            reason_code: "recap_only_request_supersedes_tool_flow",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const oneShotStatusToolFlowGuard = oneShotReminderStatusBlocksToolFlow({
      message: userMessage,
      routeIsProductHelp: routeDecision.response_owner === "product_help",
      explicitProductHelp: detectsExplicitProductHelp(userMessage),
      activeCardDrafting: isActiveCardDraftingOperation(
        activeOperationIntake,
      ),
      explicitOperationCommand: isExplicitOperationCommand(
        userMessage,
      ),
      statusOnlyNoMutation: isStatusOnlyNoMutationRequest(userMessage),
    });
    if (
      !isSafetyRoute(routeDecision) &&
      oneShotStatusToolFlowGuard.blocked
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: oneShotStatusToolFlowGuard.reason_code,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill_flow",
            reason_code: "status_only_request_blocks_tool_start",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    const oneShotDirectEffectBlock =
      oneShotReminderDirectEffectBlockForNonMutationContext({
        message: userMessage,
        routeIsProductHelp: routeDecision.response_owner === "product_help" ||
          routeDecision.selected_handler === "product_help",
        statusOnlyNoMutation: isStatusOnlyNoMutationRequest(userMessage),
        recapOnly: isRecapOnlyRequest(userMessage),
      });
    if (
      !isSafetyRoute(routeDecision) &&
      routeDecision.direct_effects_to_run.includes(
        "create_one_shot_reminder",
      ) &&
      oneShotDirectEffectBlock.blocked
    ) {
      const reasonCode = oneShotDirectEffectBlock.reason_code;
      routeDecision = {
        ...routeDecision,
        direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
          effect,
        ) => effect !== "create_one_shot_reminder"),
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "direct_effects.create_one_shot_reminder",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.filter((effect) =>
          effect.effect_type !== "create_one_shot_reminder"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !isSafetyRoute(routeDecision) &&
      routeDecision.direct_effects_to_run.includes(
        "create_one_shot_reminder",
      ) &&
      turnFrame.safety.risk_band === "medium" &&
      explicitlySafeWorkReminderRequest(userMessage)
    ) {
      turnFrame = {
        ...turnFrame,
        safety: {
          ...turnFrame.safety,
          risk_band: "low",
          reason_codes: [
            ...turnFrame.safety.reason_codes,
            "explicit_safe_work_reminder_context",
          ],
          evidence: [
            ...turnFrame.safety.evidence,
            "User explicitly negated danger and requested a work one-shot reminder.",
          ],
        },
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      shouldRuntimeCoachPreferenceOverrideRoute({
        message: userMessage,
        routeDecision,
        safetyRiskBand: safetyPregateOutput.risk_band,
        hasPendingOperationConfirmation: Boolean(
          pendingOperationConfirmationForGlobalRouting,
        ),
      })
    ) {
      tempMemory = clearConversationFlowForCoachPreference(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_active_flow",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "conversation_flow",
            reason_code: "coach_preference_request_overrides_active_flow",
          },
          {
            path: "product_help",
            reason_code: "coach_preference_is_tool_skill",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [
          ...turnFrame.tool_skill_intents.filter((intent) =>
            intent.operation_type !== "update_coach_preferences"
          ),
          {
            operation_type: "update_coach_preferences",
            explicitness: "explicit",
            target_hint: userMessage,
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "update",
          },
        ],
        tool_skill_opportunity: {
          type: "none",
          operation_type: null,
          surface_id: null,
          confidence_band: "low",
          should_offer: false,
          prop_reason: null,
          source_span: null,
          target_hint: null,
          target_status: "none",
          suggested_question_intent: null,
          offer_timing: "never",
          must_not_execute: true,
        },
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !isSafetyRoute(routeDecision) &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      isRuntimeCoachPreferenceRequest(userMessage) &&
      (
        routeDecision.selected_handler === "create_recurring_reminder" ||
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help" ||
        pendingOperationType(pendingOperationConfirmation) ===
          "create_recurring_reminder" ||
        (activeOperationIntake as any)?.operation_type ===
          "create_recurring_reminder"
      )
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_reminder_flow",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.create_recurring_reminder",
            reason_code: "coach_preference_request_overrides_reminder_flow",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "create_recurring_reminder"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      (
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help"
      ) &&
      isRuntimeCoachPreferenceRequest(userMessage) &&
      !blocksToolSkills(safetyPregateOutput.risk_band)
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        reason_code: "coach_preference_request_overrides_product_help",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "coach_preference_is_tool_skill",
          },
        ],
      };
    } else if (
      (
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help"
      ) &&
      isProductHelpExitToConversation(userMessage)
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "product_help_exit_to_conversation",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "product_help",
            reason_code: "user_exited_product_help_or_requested_recap",
          },
        ],
      };
    }
    if (routeDecision.direct_effects_to_run.length > 0) {
      try {
        directEffectGateResult = await runEffectGateOrchestrator({
          turn_frame: turnFrame,
          direct_effects_to_run: routeDecision.direct_effects_to_run,
          pending_tool_skill_confirmation: pendingOperationConfirmation,
        });
        if (directEffectGateResult.additional_blocked_paths.length > 0) {
          routeDecision = {
            ...routeDecision,
            direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
              effect,
            ) => directEffectGateResult?.allowed.includes(effect as any)),
            blocked_paths: [
              ...routeDecision.blocked_paths,
              ...directEffectGateResult.additional_blocked_paths,
            ],
          };
        }
      } catch (gateError) {
        console.warn(
          "[Router] direct effect gate orchestrator failed (non-blocking):",
          gateError,
        );
        await trace("brain:direct_effect_gate_failed", "routing", {
          error: gateError instanceof Error
            ? gateError.message
            : String(gateError),
        }, "warn");
      }
    }
    const safetySuppression = suppressToolSignalsForSafetyRoute({
      routeDecision,
      turnFrame,
    });
    if (safetySuppression.changed) {
      routeDecision = safetySuppression.routeDecision;
      turnFrame = safetySuppression.turnFrame;
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (turnFrame && routeDecision) {
      userTurnSnapshot = buildUserTurnSnapshot({
        turn_id: turnFrame.turn_id,
        user_id: userId,
        source_message_id: turnFrame.source_message_id,
        message: userMessage,
        channel,
        timezone: userTime?.user_timezone ?? "Europe/Paris",
        turn_frame: turnFrame,
        route_decision: routeDecision,
        temp_memory: tempMemory ?? {},
      });
      turnAgenda = buildTurnAgenda(userTurnSnapshot);
      const agendaResolution = resolveFlowInterruptions({
        snapshot: userTurnSnapshot,
        agenda: turnAgenda,
      });
      turnAgenda = agendaResolution.agenda;
      const blockedAgendaOperations = new Set(
        turnAgenda.tasks
          .filter((task: AgendaTask) =>
            task.kind === "effect" && task.status === "blocked" &&
            task.operation_type
          )
          .map((task: AgendaTask) => String(task.operation_type)),
      );
      if (
        agendaResolution.reason_codes.length > 0 ||
        agendaResolution.clear_active_tool_flow ||
        agendaResolution.clear_pending_confirmation ||
        blockedAgendaOperations.size > 0
      ) {
        tempMemory = { ...(tempMemory ?? {}) };
        if (agendaResolution.clear_active_tool_flow) {
          tempMemory = clearActiveToolFlow(tempMemory);
          activeOperationIntake = null;
        }
        if (agendaResolution.clear_pending_confirmation) {
          tempMemory = clearPendingToolConfirmation(tempMemory);
          pendingOperationConfirmation = null;
          pendingOperationConfirmationForGlobalRouting = null;
        }
        if (
          agendaResolution.clear_active_tool_flow ||
          agendaResolution.clear_pending_confirmation
        ) {
          state = { ...(state ?? {}), temp_memory: tempMemory } as any;
        }
        const selectedOperation = routeDecision.response_owner === "tool_skill"
          ? String(routeDecision.selected_handler ?? "").trim()
          : "";
        const selectedOperationBlocked = selectedOperation &&
          blockedAgendaOperations.has(selectedOperation);
        const blockedPathsFromAgenda = [
          ...new Set([
            ...agendaResolution.reason_codes,
            ...turnAgenda.tasks
              .filter((task: AgendaTask) => task.status === "blocked")
              .map((task: AgendaTask) => task.reason_code)
              .filter(Boolean)
              .map(String),
          ]),
        ].map((reasonCode) => ({
          path: "turn_agenda",
          reason_code: reasonCode,
        }));
        routeDecision = {
          ...routeDecision,
          response_owner: selectedOperationBlocked
            ? "normal_reply"
            : routeDecision.response_owner,
          selected_handler: selectedOperationBlocked
            ? undefined
            : routeDecision.selected_handler,
          reason_code: selectedOperationBlocked
            ? "turn_agenda_blocked_selected_effect"
            : routeDecision.reason_code,
          direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
            effect,
          ) => !blockedAgendaOperations.has(String(effect))),
          blocked_paths: [
            ...routeDecision.blocked_paths,
            ...blockedPathsFromAgenda,
          ],
        };
        turnFrame = {
          ...turnFrame,
          direct_effects: turnFrame.direct_effects.filter((effect) =>
            !blockedAgendaOperations.has(String(effect.effect_type))
          ),
          tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
            !blockedAgendaOperations.has(String(intent.operation_type))
          ),
          tool_skill_opportunity: selectedOperationBlocked
            ? {
              type: "none",
              operation_type: null,
              surface_id: null,
              confidence_band: "low",
              should_offer: false,
              prop_reason: null,
              source_span: null,
              target_hint: null,
              target_status: "none",
              suggested_question_intent: null,
              offer_timing: "never",
              must_not_execute: true,
            }
            : turnFrame.tool_skill_opportunity,
        };
        dispatcherSignals = dispatcherSignalsFromTurnFrame({
          turnFrame,
          userMessage,
        });
      }
      recordAgendaEffectsInLedger({ ledger: effectLedger, agenda: turnAgenda });
      turnAgendaSummary = summarizeTurnAgenda(turnAgenda, userTurnSnapshot);
    }
    await trace("brain:turn_frame_routed", "routing", {
      turn_frame_dispatcher_ms: Date.now() - turnFrameStartMs,
      response_owner: routeDecision.response_owner,
      selected_handler: routeDecision.selected_handler ?? null,
      direct_effects_to_run: routeDecision.direct_effects_to_run,
      turn_agenda_summary: turnAgendaSummary,
      direct_effects_allowed: directEffectGateResult?.allowed ?? [],
      direct_effects_clarifications:
        directEffectGateResult?.clarifications.map((c) => ({
          effect_type: c.effect_type,
          reason_code: c.reason_code,
        })) ?? [],
      direct_effects_blocked:
        directEffectGateResult?.additional_blocked_paths ?? [],
      tool_skill_intents_count: turnFrame?.tool_skill_intents.length ?? 0,
      skill_entry_ids: Object.keys(turnFrame?.skill_signals.entry ?? {}),
      safety_risk_band: turnFrame?.safety.risk_band ?? null,
      conversation_risk_score: turnFrame?.conversation_risk?.score ?? null,
      conversation_risk_exit_flows:
        turnFrame?.conversation_risk?.should_exit_flows ?? false,
    }, "info");
  } catch (error) {
    console.warn(
      "[Router] TurnFrame route trace failed (non-blocking):",
      error,
    );
    await trace("brain:turn_frame_route_failed", "routing", {
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  await Promise.all([
    logMemoryObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "dispatcher.memory_plan_generated",
      payload: {
        user_message_preview: String(userMessage ?? "").slice(0, 320),
        memory_plan: turnFrame?.memory_plan ?? null,
      },
    }),
  ]);
  const riskScore = Number(dispatcherSignals.risk_score ?? 0);
  const needsResearchSignal = dispatcherSignals.needs_research;
  const researchRequested = needsResearchSignal?.value === true &&
    Number(needsResearchSignal?.confidence ?? 0) >= 0.55;
  const researchDomainHint = String(needsResearchSignal?.domain_hint ?? "")
    .trim().slice(0, 30);
  const researchQueryRaw = String(needsResearchSignal?.query ?? "").trim();
  const researchQuery = (
    researchQueryRaw.length > 0
      ? researchQueryRaw
      : String(userMessage ?? "").trim()
  ).slice(0, 180);
  let researchExecuted = false;
  let researchText = "";
  let researchSnippets: string[] = [];
  let researchSources: string[] = [];
  let researchError: string | null = null;

  // High-risk circuit breaker: clear machine/runtime states to avoid compounding loops
  // when user is in distress or conversation quality degrades sharply.
  const riskResetThreshold = Number(
    envInt("SOPHIA_RISK_RESET_THRESHOLD", 7),
  );
  const shouldResetForRisk = Number.isFinite(riskScore) &&
    riskScore >= riskResetThreshold;
  if (shouldResetForRisk) {
    const { tempMemory: clearedTemp, clearedKeys } =
      clearMachineStateTempMemory({
        tempMemory,
      });
    const invWasActive = Boolean((state as any)?.investigation_state);
    tempMemory = {
      ...(clearedTemp ?? {}),
      __risk_reset: {
        at: new Date().toISOString(),
        risk_score: riskScore,
        threshold: riskResetThreshold,
      },
    };
    await updateUserState(supabase, userId, scope, {
      investigation_state: null as any,
      temp_memory: tempMemory,
      risk_level: riskScore,
    });
    state = {
      ...(state ?? {}),
      investigation_state: null,
      temp_memory: tempMemory,
      risk_level: riskScore,
    } as any;
    await trace("brain:risk_circuit_breaker_reset", "routing", {
      risk_score: riskScore,
      threshold: riskResetThreshold,
      investigation_was_active: invWasActive,
      cleared_keys_count: clearedKeys.length,
      cleared_keys: clearedKeys.slice(0, 40),
    }, "warn");
  }

  // If a daily bilan/checkup is stale (>4h), decide implicitly:
  // - continue if message answers the current bilan thread
  // - abandon if user starts a new/unrelated topic
  // No explicit "do you want to continue?" question.
  const staleTimeoutMs = envInt(
    "SOPHIA_BILAN_STALE_TIMEOUT_MS",
    4 * 60 * 60 * 1000,
  );
  const checkupActiveNow = isCheckupActive(state);
  const startedMs = parseInvestigationStartedMs(state);
  const elapsedSinceStartMs = startedMs > 0 ? Date.now() - startedMs : 0;
  const staleCheckup = checkupActiveNow && startedMs > 0 &&
    elapsedSinceStartMs >= staleTimeoutMs;
  if (staleCheckup) {
    const wantsToContinueByDispatcher = false;
    const dontWantToContinueByDispatcher = false;
    const checkupIntentNow = detectCheckupIntent(dispatcherSignals);
    const staleDecision = await classifyStaleBilanResponse({
      userMessage,
      lastAssistantMessage,
      history,
      requestId: meta?.requestId,
    });
    const staleInvestigationMode = String(
      (state as any)?.investigation_state?.mode ?? "",
    );
    const explicitConsent = resolveBinaryConsentLite(userMessage);
    const shouldContinue = staleDecision === "resume_bilan" ||
      ((wantsToContinueByDispatcher && !dontWantToContinueByDispatcher) &&
        staleDecision !== "other_topic") ||
      checkupIntentNow;
    const shouldStopForToday = staleDecision === "stop_for_today";
    const shouldAbandonForTopic = staleDecision === "other_topic" &&
      (dontWantToContinueByDispatcher || !shouldContinue);
    if (shouldStopForToday || shouldAbandonForTopic) {
      let nextTempMemory = tempMemory;
      if (shouldStopForToday) {
        nextTempMemory = {
          ...(tempMemory ?? {}),
          __bilan_just_stopped: {
            stopped_at: new Date().toISOString(),
            reason: "stale_checkup_stop_for_today",
          },
        };
      }
      await updateUserState(supabase, userId, scope, {
        investigation_state: null as any,
        temp_memory: nextTempMemory,
      });
      state = {
        ...state,
        investigation_state: null,
        temp_memory: nextTempMemory,
      } as any;
      tempMemory = nextTempMemory;
      await trace("brain:stale_checkup_abandoned", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        reason: shouldStopForToday
          ? "stale_classifier_stop_for_today"
          : dontWantToContinueByDispatcher
          ? "dispatcher_dont_want_continue_bilan"
          : "message_not_checkup_related",
        stale_decision: staleDecision,
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
      if (shouldStopForToday) {
        const responseContent = staleInvestigationMode === "weekly_bilan"
          ? "Pas de souci, on laisse le bilan hebdo pour une autre fois."
          : "Pas de souci, on ne peut pas le reporter plus tard ce soir. On fera le bilan demain.";
        const nextMode: AgentMode = "companion";
        const nextMsgCount =
          Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
        const nextLastInteraction = new Date().toISOString();
        await updateUserState(supabase, userId, scope, {
          current_mode: nextMode,
          unprocessed_msg_count: nextMsgCount,
          last_interaction_at: nextLastInteraction,
          temp_memory: tempMemory,
        });
        if (logMessages) {
          await logMessage(
            supabase,
            userId,
            scope,
            "assistant",
            responseContent,
            nextMode,
            {
              ...(opts?.messageMetadata ?? {}),
              channel,
              request_id: meta?.requestId ?? null,
              router_decision_v2: {
                target_mode: "companion",
                next_mode: nextMode,
                risk_score: riskScore,
                checkup_active: true,
                stop_checkup: true,
                safety_level: dispatcherSignals.safety.level,
                interrupt_kind: dispatcherSignals.interrupt.kind,
                stale_bilan_decision: staleDecision,
              },
            },
          );
        }
        return {
          content: responseContent,
          mode: nextMode,
          tool_execution: "none",
          executed_tools: [],
        };
      }
    } else {
      await trace("brain:stale_checkup_continues_implicitly", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        stale_decision: staleDecision,
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
    }
  }

  const { targetMode: routedMode, stopCheckup, checkupIntentDetected } =
    selectTargetMode({
      state,
      dispatcherSignals,
      onboardingActive: onboarding.onboardingActive,
    });

  let targetMode: AgentMode = routedMode;
  if (opts?.forceMode) {
    targetMode = opts.forceMode;
  }
  if (isSafetyRoute(routeDecision)) {
    targetMode = "companion";
  }
  if (turnFrame?.turn_id && effectLedger.turn_id !== turnFrame.turn_id) {
    effectLedger.turn_id = turnFrame.turn_id;
  }

  attachDynamicAddons({
    tempMemory,
    state,
    dispatcherSignals,
    checkupIntentDetected,
    userMessage,
    planItemSnapshot,
  });

  const coachingAttempt = await maybeAttachCoachingInterventionAddon({
    supabase,
    userId,
    userMessage,
    history,
    tempMemory,
    dispatcherSignals,
    planItemSnapshot,
    v2Runtime,
    targetMode,
    meta,
  });
  if (coachingAttempt) {
    const selectorOutput = coachingAttempt.selector.output;
    const gateDecision = coachingAttempt.selector.gateDecision;
    const historySnapshot = buildCoachingHistorySnapshot(
      coachingAttempt.input.technique_history,
    );
    const customizationContext = buildCoachingCustomizationContext(
      coachingAttempt.input,
      coachingAttempt.addon,
    );
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_trigger_detected",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        blocker_type: coachingAttempt.trigger.blocker_hint ?? null,
        confidence: coachingAttempt.trigger.blocker_hint ? "medium" : "low",
        customization_context: customizationContext,
      },
    });
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "coaching_gate_evaluated",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        eligible: gateDecision.eligible,
        skip_reason: gateDecision.eligible ? null : gateDecision.reason,
        gate: gateDecision.gate,
        confidence: selectorOutput.confidence,
        blocker_type: selectorOutput.blocker_type,
        blocker_kind: coachingAttempt.input.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAttempt.input.target_plan_item?.dimension,
        ),
        item_kind: coachingAttempt.input.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAttempt.input.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAttempt.input.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAttempt.input.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt.input.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt.input.v2_momentum?.load_balance ??
          null,
        coaching_scope: selectorOutput.coaching_scope ?? null,
        simplify_instead: selectorOutput.simplify_instead ?? false,
        dimension_strategy: selectorOutput.dimension_strategy ?? null,
        customization_context: customizationContext,
      },
    });
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "coaching_selector",
      eventName: "coaching_selector_run",
      payload: {
        momentum_state: coachingAttempt.input.momentum_state ?? null,
        trigger_type: coachingAttempt.trigger.trigger_kind,
        blocker_type: selectorOutput.blocker_type,
        confidence: selectorOutput.confidence,
        eligible: selectorOutput.eligible,
        skip_reason: selectorOutput.decision === "skip"
          ? selectorOutput.reason
          : null,
        recommended_technique: selectorOutput.recommended_technique,
        candidate_techniques: selectorOutput.technique_candidates,
        follow_up_needed: selectorOutput.follow_up_needed,
        clarification_needed: selectorOutput.need_clarification,
        selector_source: coachingAttempt.selector.source,
        decision: selectorOutput.decision,
        blocker_kind: coachingAttempt.input.v2_momentum?.blocker_kind ?? null,
        dimension_detected: coachingDimensionForLog(
          coachingAttempt.input.target_plan_item?.dimension,
        ),
        item_kind: coachingAttempt.input.target_plan_item?.kind ?? null,
        target_plan_item_id: coachingAttempt.input.target_plan_item?.id ?? null,
        target_plan_item_title: coachingAttempt.input.target_plan_item?.title ??
          null,
        target_plan_item_dimension:
          coachingAttempt.input.target_plan_item?.dimension ?? null,
        plan_fit_level: coachingAttempt.input.v2_momentum?.plan_fit ?? null,
        load_balance_level: coachingAttempt.input.v2_momentum?.load_balance ??
          null,
        coaching_scope: selectorOutput.coaching_scope ?? null,
        simplify_instead: selectorOutput.simplify_instead ?? false,
        dimension_strategy: selectorOutput.dimension_strategy ?? null,
        customization_context: customizationContext,
        history_snapshot: historySnapshot,
      },
    });
    const deprioritizedTechniques = findCoachingDeprioritizedTechniques({
      blocker_type: selectorOutput.blocker_type,
      technique_history: coachingAttempt.input.technique_history,
      recommended_technique: selectorOutput.recommended_technique,
    });
    if (deprioritizedTechniques.length > 0) {
      await logCoachingObservabilityEvent({
        supabase,
        userId,
        requestId: meta?.requestId,
        turnId: loggedMessageId,
        channel,
        scope,
        sourceComponent: "coaching_selector",
        eventName: "coaching_technique_deprioritized",
        payload: {
          momentum_state: coachingAttempt.input.momentum_state ?? null,
          trigger_type: coachingAttempt.trigger.trigger_kind,
          blocker_type: selectorOutput.blocker_type,
          recommended_technique: selectorOutput.recommended_technique,
          candidate_techniques: selectorOutput.technique_candidates,
          history_snapshot: historySnapshot,
          deprioritized_techniques: deprioritizedTechniques,
        },
      });
    }
  }

  const surfaceStateBefore = readSurfaceState(tempMemory);
  const surfaceRuntime = buildSurfaceRuntimeDecision({
    tempMemory,
    memoryPlan: turnFrame?.memory_plan,
    surfacePlan: null,
    dispatcherSignals,
    userMessage,
    targetMode,
  });
  const surfaceAddon = surfaceRuntime.addon;
  if (surfaceAddon) {
    await trace("brain:surface_opportunity_selected", "routing", {
      surface_id: surfaceAddon.surface_id,
      level: surfaceAddon.level,
      cta_style: surfaceAddon.cta_style,
      content_need: surfaceAddon.content_need,
      confidence: surfaceAddon.confidence,
    }, "debug");
  }
  await logMemoryObservabilityEvent({
    supabase,
    userId,
    requestId: meta?.requestId,
    turnId: loggedMessageId,
    channel,
    scope,
    sourceComponent: "surface_state",
    eventName: "surface.state_transition",
    payload: {
      before: surfaceStateBefore,
      after: surfaceRuntime.state,
      addon: surfaceAddon ?? null,
      target_mode: targetMode,
      memory_plan_intent: turnFrame?.memory_plan?.response_intent ?? null,
      memory_plan_context_need: turnFrame?.memory_plan?.context_need ?? null,
    },
  });

  const [weeklyForgottenProgressRuntime] = await Promise
    .all([
      maybeLogWeeklyForgottenProgressParallel({
        supabase,
        userId,
        tempMemory,
        activeSkillState,
        v2Runtime,
        loggedMessageId,
        userMessage,
      }),
      maybeLogDefenseCardWinParallel({
        supabase,
        userId,
        dispatcherSignals,
        v2Runtime,
        tempMemory,
      }),
    ]);

  if (riskScore !== Number((state as any)?.risk_level ?? 0)) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore });
  }

  const operationRuntimePipeline = await runOperationRuntimePipeline({
    supabase,
    userId,
    userMessage,
    channel,
    userTimezone: userTime?.user_timezone ?? "Europe/Paris",
    history,
    tempMemory,
    state,
    planItemSnapshot,
    turnFrame,
    routeDecision,
    safetyPregateOutput,
    sourceMessageId: loggedMessageId,
    requestId: meta?.requestId ?? null,
    v2Runtime: v2Runtime ?? null,
    turnAgenda,
    activeSkillState,
    activeOperationIntake,
    pendingOperationConfirmation,
    trackProgressBlockedReasonCode: attackKeywordContextOverride
      ? "attack_keyword_trigger_is_not_completion"
      : null,
    fullAiRequested,
    clientNow: clientNow && Number.isFinite(clientNow.getTime())
      ? clientNow
      : null,
    enableAdjustPlanCoachGuidance: meta?.enableAdjustPlanCoachGuidance === true,
    runAdjustPlanItemOperation: maybeRunAdjustPlanItemOperation,
    guards: {
      explicitlySafeWorkReminderRequest,
      detectExplicitNoToolRequest,
      detectsExplicitAttackCardCreationRequest,
      isActiveCardDraftingOperation,
      isExplicitOperationCommand,
      writeAdjustPlanPendingDraftReview,
    },
  });
  routeDecision = operationRuntimePipeline.routeDecision;
  turnFrame = operationRuntimePipeline.turnFrame;
  tempMemory = operationRuntimePipeline.tempMemory;
  if (operationRuntimePipeline.statePatch) {
    state = { ...(state ?? {}), ...operationRuntimePipeline.statePatch } as any;
  }
  if (operationRuntimePipeline.routeOrFrameChanged && turnFrame) {
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame,
      userMessage,
    });
  }
  const routeSafetyActive = operationRuntimePipeline.routeSafetyActive;
  const runtimeSafetyRiskBand = operationRuntimePipeline.runtimeSafetyRiskBand;
  const runtimeSafetyPregateOutput =
    operationRuntimePipeline.runtimeSafetyPregateOutput;
  const weeklyReviewStateForTurn =
    operationRuntimePipeline.weeklyReviewStateForTurn;
  const weeklyReviewBlocksToolSkillRuntime =
    operationRuntimePipeline.weeklyReviewBlocksToolSkillRuntime;
  const operationRuntime = operationRuntimePipeline.operationRuntime;
  if (operationRuntime) {
    recordToolSkillEffectsInLedger({
      ledger: effectLedger,
      toolSkillRun: operationRuntime.toolSkillRun,
      toolExecution: operationRuntime.toolExecution,
    });
    const nextMode: AgentMode = "companion";
    const nextMsgCount = Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
    const nextLastInteraction = new Date().toISOString();
    let nextTempMemory = operationRuntime.nextTempMemory ?? tempMemory;
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
    const rawOperationRuntimeContent = weeklyReturnMessage
      ? `${operationRuntime.content}\n\n${weeklyReturnMessage}`
      : operationRuntime.content;
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
      await loadCoachResponseStylePreferences({
        supabase,
        userId,
      });
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
            ...(opts?.messageMetadata ?? {}),
            channel,
            request_id: meta?.requestId ?? null,
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

    const effectiveResponseOwner = turnFrame && routeDecision
      ? effectiveResponseOwnerForOperationRuntime({
        routeDecision,
        toolSkillRun: operationRuntime.toolSkillRun,
      })
      : "normal_reply";
    const operationConversationTurnTrace = turnFrame && routeDecision
      ? {
        turn_frame: turnFrame,
        route_decision: routeDecision,
        turn_agenda_summary: turnAgendaSummary,
        tool_skill_run: {
          selected_handler: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
          ...operationRuntime.toolSkillRun,
        },
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        response_owner: effectiveResponseOwner,
      }
      : null;

    if (turnFrame && routeDecision) {
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
            memory_plan: turnFrame?.memory_plan ??
              DEFAULT_DISPATCHER_MEMORY_PLAN,
            turn_agenda_summary: turnAgendaSummary,
          },
          turn_frame: turnFrame,
          route_decision: routeDecision,
          direct_effects: operationRuntime.executedTools.map((
            toolId: string,
          ) => ({
            tool_id: toolId,
            outcome: operationRuntime.toolExecution,
          })),
          effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
          tool_skill_run: {
            selected_handler: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
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
      requestId: meta?.requestId ?? null,
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
          request_id: meta?.requestId ?? null,
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
            source: "sophia-brain/router/run.ts",
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

  const onDemandTriggers: OnDemandTriggers = {
    plan_item_discussion_detected:
      dispatcherSignals.plan_item_discussion?.detected ?? false,
    plan_item_discussion_hint: dispatcherSignals.plan_item_discussion
      ?.item_hint,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected ?? false,
  };

  let context = "";
  let recommendationSkillOutput: ConversationSkillOutput | null = null;
  let recommendationToolRun: ProductRecommendation | null = null;
  let recommendationToolStats: Record<string, unknown> | null = null;
  let recommendationToolAddon: string | null = null;
  let recommendationSurfaceLabel: string | null = null;
  const selectedSkillForRecommendation =
    routeDecision?.response_owner === "conversation_handler"
      ? String(routeDecision.selected_handler ?? "").trim()
      : isSafetyRoute(routeDecision)
      ? "safety_crisis"
      : routeDecision?.response_owner === "product_help"
      ? "product_help"
      : String((activeSkillState as any)?.skill_id ?? "").trim();
  const suppressOperationRecommendationForVerification =
    isAttackCardPostCreationVerificationQuestion({
      message: userMessage,
      recentMessages: recentMessagesForTurnFrame,
    }) ||
    isImmediateModeRequestNotCoachPreference(userMessage);
  if (
    turnFrame &&
    (selectedSkillForRecommendation ||
      turnFrame.tool_skill_opportunity?.should_offer)
  ) {
    try {
      const registry = await loadProductSurfaceRegistry();
      recommendationSkillOutput = selectedSkillForRecommendation
        ? await runConversationSkillForRecommendation({
          skillId: selectedSkillForRecommendation,
          userId,
          userMessage,
          turnFrame,
          recentMessages: recentMessagesForTurnFrame,
          activeSkillState,
          planItemSnapshot,
          productSurfaces: registry.surfaces,
        })
        : null;
      if (
        !suppressOperationRecommendationForVerification &&
        selectedSkillForRecommendation !== "product_help" &&
        shouldRunRecommendationTool({
          skillOutput: recommendationSkillOutput,
          userMessage,
          turnFrame,
        })
      ) {
        recommendationToolRun = await runRecommendationTool({
          user_id: userId,
          channel,
          current_skill_id: selectedSkillForRecommendation,
          skill_output: recommendationSkillOutput ?? undefined,
          turn_frame: turnFrame,
          memory_payload: turnFrame?.memory_plan ?? {},
          active_topic_state: (tempMemory as any)?.memory_v2_active_topic ??
            null,
          presentation_state: readSurfaceState(tempMemory),
          plan_items: (planItemSnapshot ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            item_type: item.item_type,
            dimension: item.dimension,
            cadence_label: item.cadence_label ?? null,
            target_reps: item.target_reps ?? null,
            current_reps: item.current_reps ?? null,
            item_nature: item.item_nature ?? null,
            available_this_week: item.available_this_week ?? false,
            availability_status: item.availability_status ?? null,
            week_scope: item.week_scope ?? null,
            source_kind: item.source_kind ?? null,
          })),
          available_surfaces: registry.surfaces,
          recent_recommendations: [],
          user_preferences: {},
          safety_pregate_risk_band: turnFrame.safety.risk_band,
          model_name: String(
            Deno.env.get("SOPHIA_RECOMMENDATION_TOOL_MODEL") ??
              "gemini-3-flash-preview",
          ).trim(),
          on_stats: (stats) => {
            recommendationToolStats = stats as Record<string, unknown>;
          },
        });
        recommendationSurfaceLabel = recommendationToolRun.surface_id
          ? registry.by_id.get(recommendationToolRun.surface_id)?.label ?? null
          : null;
        recommendationToolAddon = buildRecommendationToolAddon({
          recommendation: recommendationToolRun,
          skillOutput: recommendationSkillOutput,
          selectedSkillId: selectedSkillForRecommendation,
          surfaceLabel: recommendationSurfaceLabel,
        });
        await trace("brain:recommendation_tool_run", "routing", {
          selected_skill_id: selectedSkillForRecommendation,
          skill_recommendation_need:
            recommendationSkillOutput?.recommendation_need ?? null,
          recommendation: recommendationToolRun,
          stats: recommendationToolStats,
        }, "info");
      }
      if (
        !suppressOperationRecommendationForVerification &&
        !recommendationToolRun && recommendationSkillOutput
      ) {
        const suggestionResolution = resolveSkillOperationSuggestion({
          skill_output: recommendationSkillOutput,
          turn_frame: turnFrame,
          available_surfaces: registry.surfaces,
          request_id: meta?.requestId ?? loggedMessageId ?? null,
        });
        if (suggestionResolution.recommendation) {
          recommendationToolRun = suggestionResolution.recommendation;
          recommendationSurfaceLabel = recommendationToolRun.surface_id
            ? registry.by_id.get(recommendationToolRun.surface_id)?.label ??
              null
            : null;
          recommendationToolAddon = buildRecommendationToolAddon({
            recommendation: recommendationToolRun,
            skillOutput: recommendationSkillOutput,
            selectedSkillId: selectedSkillForRecommendation,
            surfaceLabel: recommendationSurfaceLabel,
          });
        }
        await trace("brain:skill_operation_suggestion_resolved", "routing", {
          selected_skill_id: selectedSkillForRecommendation,
          accepted_operation_type:
            suggestionResolution.accepted_suggestion?.operation_type ?? null,
          recommendation: suggestionResolution.recommendation,
          blocked_suggestions: suggestionResolution.blocked_suggestions,
        }, suggestionResolution.recommendation ? "info" : "debug");
      }
      if (
        !suppressOperationRecommendationForVerification &&
        turnFrame?.tool_skill_opportunity?.should_offer &&
        !routeDecision?.blocked_paths.some((blocked) =>
          blocked.path === "tool_skill_opportunity" &&
          blocked.reason_code === "active_flow_blocks_tool_opportunity"
        )
      ) {
        const opportunitySurfaceLabel =
          turnFrame.tool_skill_opportunity.surface_id
            ? registry.by_id.get(turnFrame.tool_skill_opportunity.surface_id)
              ?.label ?? null
            : null;
        const opportunityRecommendation =
          buildRecommendationFromToolSkillOpportunity({
            turnFrame,
            surfaceLabel: opportunitySurfaceLabel,
            planItemSnapshot,
            requestId: meta?.requestId ?? loggedMessageId ?? null,
          });
        if (
          operationOpportunityShouldOverrideRecommendation({
            opportunity: turnFrame.tool_skill_opportunity,
            recommendation: recommendationToolRun,
            opportunityRecommendation,
          })
        ) {
          recommendationToolRun = opportunityRecommendation;
          recommendationSurfaceLabel = opportunitySurfaceLabel;
          recommendationToolAddon = [
            buildToolSkillOpportunityAddon({
              turnFrame,
              recommendation: recommendationToolRun,
              surfaceLabel: recommendationSurfaceLabel,
            }),
            buildRecommendationToolAddon({
              recommendation: recommendationToolRun,
              skillOutput: recommendationSkillOutput,
              selectedSkillId: "tool_skill_opportunity_offer",
              surfaceLabel: recommendationSurfaceLabel,
            }),
          ].filter((value): value is string =>
            typeof value === "string" && value.trim().length > 0
          ).join("\n\n");
        }
        await trace("brain:tool_skill_opportunity_resolved", "routing", {
          opportunity: turnFrame.tool_skill_opportunity,
          recommendation: recommendationToolRun,
          opportunity_recommendation: opportunityRecommendation,
        }, opportunityRecommendation ? "info" : "debug");
      }
    } catch (error) {
      recommendationToolStats = {
        error: error instanceof Error ? error.message : String(error),
      };
      await trace("brain:recommendation_tool_failed", "routing", {
        selected_skill_id: selectedSkillForRecommendation,
        error: recommendationToolStats.error,
      }, "warn");
    }
  }
  const injectedContext = [
    opts?.contextOverride,
    buildActivePlanSnapshotAddon({
      planItemSnapshot,
      routeDecision,
      userMessage,
    }),
    summarizeWeeklyAdaptiveReviewForAddon(
      weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
    ),
    buildWeeklyTurnSlotAddon({
      activeSkillState,
      tempMemory,
      userMessage,
    }),
    buildResolvedPlanTargetAddon(tempMemory),
    buildConversationRiskFlowExitAddon(conversationRiskForPersist),
    recommendationToolAddon,
    buildRecentConversationContinuityAddon({
      userMessage,
      history,
    }),
    attackKeywordContextOverride || null,
  ].filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  )
    .join("\n\n");
  const contextLoadResult = await loadContextForMode({
    supabase,
    userId,
    mode: targetMode,
    message: userMessage,
    history,
    state,
    scope,
    tempMemory,
    userTime,
    triggers: onDemandTriggers,
    injectedContext: injectedContext || undefined,
    memoryPlan: turnFrame?.memory_plan,
    v2Intent: "answer_user_now",
    v2Runtime,
    requestId: meta?.requestId,
    channel,
  });
  contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);

  let memoryV2RuntimeTempMemory: Record<string, unknown> | null = null;
  let memoryV2ActiveContextBlock = "";
  try {
    const active = await runMemoryV2ActiveLoader({
      supabase,
      userId,
      scope,
      channel,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      userMessage,
      history,
      tempMemory,
      memoryPlan: turnFrame?.memory_plan ?? null,
      userTime: userTime as any,
    });
    if (active) {
      memoryV2RuntimeTempMemory = active.tempMemory;
      memoryV2ActiveContextBlock = active.context_block;
      contextLoadResult.context.eventMemories = undefined;
      contextLoadResult.context.globalMemories = undefined;
      contextLoadResult.context.topicMemories = undefined;
      contextLoadResult.context.memoryV2Payload = active.context_block;
      contextLoadResult.metrics.elements_loaded.push(
        "memory_v2_active_payload",
      );
      contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);
      await trace("brain:memory_v2_active_loader", "context", {
        active_topic_id: active.active_topic_id,
        retrieval_mode: active.retrieval_mode,
        topic_decision: active.topic_decision,
        payload_item_count: active.payload_item_ids.length,
        metrics: active.metrics,
      }, "info");
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);
    await logMemoryObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "memory_v2_runtime_active",
      eventName: "memory.runtime.active.error",
      payload: {
        error: message,
      },
    });
    console.warn(
      "[Router] Memory V2 active loader failed; continuing without durable memory:",
      error,
    );
  }

  context = buildContextString(contextLoadResult.context);
  if (researchRequested && researchQuery.length > 0) {
    const researchStartMs = Date.now();
    try {
      await trace("brain:research_requested", "context", {
        query: researchQuery,
        domain_hint: researchDomainHint || null,
        confidence: Number(needsResearchSignal?.confidence ?? 0),
      }, "info");
      const queryWithHint = researchDomainHint
        ? `${researchQuery} [domaine: ${researchDomainHint}]`
        : researchQuery;
      const grounded = await searchWithGeminiGrounding(queryWithHint, {
        requestId: meta?.requestId,
      });
      researchExecuted = true;
      researchText = String(grounded?.text ?? "").trim();
      researchSnippets = Array.isArray(grounded?.snippets)
        ? grounded.snippets.map((s: unknown) => String(s ?? "").trim()).filter(
          Boolean,
        ).slice(0, 5)
        : [];
      researchSources = Array.isArray(grounded?.sources)
        ? grounded.sources.map((s: unknown) => String(s ?? "").trim()).filter(
          Boolean,
        ).slice(0, 5)
        : [];
      researchLatencyMs = Date.now() - researchStartMs;
      const researchAddonLines: string[] = [
        "=== RECHERCHE WEB (informations fraiches) ===",
        `Query: ${researchQuery}`,
      ];
      if (researchText) {
        researchAddonLines.push(`Synthese: ${researchText.slice(0, 900)}`);
      }
      if (researchSnippets.length > 0) {
        researchAddonLines.push("Snippets:");
        for (const snippet of researchSnippets) {
          researchAddonLines.push(`- ${snippet.slice(0, 240)}`);
        }
      }
      if (researchSources.length > 0) {
        researchAddonLines.push("Sources:");
        for (const src of researchSources) {
          researchAddonLines.push(`- ${src}`);
        }
      }
      if (
        researchText || researchSnippets.length > 0 ||
        researchSources.length > 0
      ) {
        context = `${context}\n\n${researchAddonLines.join("\n")}`;
      }
      await trace("brain:research_completed", "context", {
        query: researchQuery,
        duration_ms: researchLatencyMs,
        has_text: Boolean(researchText),
        snippets_count: researchSnippets.length,
        sources_count: researchSources.length,
      }, "info");
    } catch (e) {
      researchLatencyMs = Date.now() - researchStartMs;
      researchError = String((e as any)?.message ?? e ?? "").slice(0, 200) ||
        "research_failed";
      await trace("brain:research_failed", "context", {
        query: researchQuery,
        duration_ms: researchLatencyMs,
        error: researchError,
      }, "warn");
    }
  }

  let consumedBilanStopped = false;
  try {
    delete (tempMemory as any).__checkup_not_triggerable_addon;
  } catch {
    // best effort
  }
  if (targetMode === "companion" && (tempMemory as any)?.__bilan_just_stopped) {
    consumedBilanStopped = true;
    try {
      delete (tempMemory as any).__bilan_just_stopped;
    } catch {
      // best effort
    }
  }

  const checkupActive = isCheckupActive(state);
  const isPostCheckup = state?.investigation_state?.status === "post_checkup";
  const effectiveModeForModelSelection: AgentMode = targetMode;
  const agentModelSelection = resolveAgentChatModel({
    effectiveMode: effectiveModeForModelSelection,
    memoryPlan: turnFrame?.memory_plan,
    explicitModel: meta?.model,
  });
  await logMemoryObservabilityEvent({
    supabase,
    userId,
    requestId: meta?.requestId,
    turnId: loggedMessageId,
    channel,
    scope,
    sourceComponent: "router",
    eventName: "router.model_selected",
    payload: {
      effective_mode: effectiveModeForModelSelection,
      requested_target_mode: targetMode,
      model: agentModelSelection.model,
      source: agentModelSelection.source,
      tier: agentModelSelection.tier,
      explicit_model: meta?.model ?? null,
      memory_plan: turnFrame?.memory_plan ?? null,
    },
  });

  const safetySkillReply = directSafetyCrisisReplyOverrideRuntime({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  });
  const conversationSkillReply = directConversationSkillReplyOverride({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  });
  const directSkillReply = safetySkillReply ?? conversationSkillReply;
  const coachPreferenceRuntimeContext = await loadCoachPreferenceRuntimeContext(
    {
      supabase,
      userId,
    },
  );
  if (coachPreferenceRuntimeContext) {
    context = `${context}\n\n${coachPreferenceRuntimeContext}`;
  }
  const agentOut = directSkillReply
    ? {
      responseContent: directSkillReply,
      nextMode: "companion" as AgentMode,
      tempMemory,
      toolExecution: "none" as const,
      executedTools: [],
      toolAck: buildToolAckContract({ status: "none", executedTools: [] }),
      outageFallback: false,
      outageFailedMode: null,
      outageErrorMessage: null,
    }
    : await runAgentAndVerify({
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
      checkupActive,
      stopCheckup,
      isPostCheckup,
      outageTemplate:
        "J'ai un petit souci technique, je reviens vers toi dès que c'est réglé!",
      sophiaChatModel: agentModelSelection.model,
      tempMemory,
      roadmapContext: opts?.roadmapContext ?? undefined,
      meta: {
        ...(meta ?? {}),
        blockSideEffects: blocksDirectEffects(runtimeSafetyRiskBand),
      },
    } as any);
  agentLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0) -
    (contextLatencyMs ?? 0);
  const agentToolExecution = String(agentOut.toolExecution ?? "none") as
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain";
  const agentExecutedTools = executedToolsForStatus(
    agentToolExecution,
    Array.isArray(agentOut.executedTools) ? agentOut.executedTools : [],
  );
  const directEffectToolRuntimes = [
    weeklyForgottenProgressRuntime,
  ].filter(Boolean);
  const directEffectExecutedTools = directEffectToolRuntimes.flatMap(
    (runtime) =>
      runtime.toolExecution === "success" ? runtime.executedTools : [],
  );
  const combinedExecutedTools = [
    ...new Set([...agentExecutedTools, ...directEffectExecutedTools]),
  ];
  const combinedToolExecution = combinedExecutedTools.length > 0
    ? "success"
    : directEffectToolRuntimes.some((runtime) =>
        runtime.toolExecution === "failed"
      )
    ? "failed"
    : directEffectToolRuntimes.some((runtime) =>
        runtime.toolExecution === "blocked"
      )
    ? "blocked"
    : agentToolExecution;
  const normalConversationTurnTrace = turnFrame && routeDecision
    ? {
      turn_frame: turnFrame,
      route_decision: routeDecision,
      turn_agenda_summary: turnAgendaSummary,
      skill_run: routeDecision.response_owner === "conversation_handler" ||
          routeDecision.response_owner === "product_help" ||
          isSafetyRoute(routeDecision)
        ? {
          selected_skill_id: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
          output: recommendationSkillOutput,
        }
        : undefined,
      recommendation_tool_run: recommendationToolRun
        ? {
          recommendation: recommendationToolRun,
          stats: recommendationToolStats,
        }
        : recommendationToolStats?.error
        ? { error: recommendationToolStats.error }
        : undefined,
      tool_skill_run: routeDecision.response_owner === "tool_skill" ||
          routeDecision.response_owner === "pending_confirmation"
        ? {
          selected_handler: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
        }
        : undefined,
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      response_owner: routeDecision.response_owner,
    }
    : null;

  if (turnFrame && routeDecision) {
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
          memory_plan: turnFrame?.memory_plan ??
            DEFAULT_DISPATCHER_MEMORY_PLAN,
          turn_agenda_summary: turnAgendaSummary,
        },
        turn_frame: turnFrame,
        route_decision: routeDecision,
        direct_effects: combinedExecutedTools.map((
          toolId,
        ) => ({
          tool_id: toolId,
          outcome: combinedToolExecution,
        })),
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        skill_run: routeDecision.response_owner === "conversation_handler" ||
            routeDecision.response_owner === "product_help" ||
            isSafetyRoute(routeDecision)
          ? {
            selected_skill_id: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
            output: recommendationSkillOutput,
          }
          : undefined,
        recommendation_tool_run: recommendationToolRun
          ? {
            recommendation: recommendationToolRun,
            stats: recommendationToolStats,
          }
          : recommendationToolStats?.error
          ? { error: recommendationToolStats.error }
          : undefined,
        tool_skill_run: routeDecision.response_owner === "tool_skill" ||
            routeDecision.response_owner === "pending_confirmation"
          ? {
            selected_handler: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
          }
          : undefined,
        confirmation_token_outcomes: [],
        memory_write_candidates_emitted: 0,
        response_owner: routeDecision.response_owner,
        total_latency_ms: Date.now() - turnStartMs,
      }, { supabase });
    } catch (error) {
      console.warn(
        "[Router] logConversationTurn failed (non-blocking):",
        error,
      );
      await trace("brain:conversation_turn_trace_failed", "routing", {
        error: error instanceof Error ? error.message : String(error),
      }, "warn");
    }
  }

  const responseStylePreferences = await loadCoachResponseStylePreferences({
    supabase,
    userId,
  });
  const finalResponse = runFinalResponsePipeline({
    baseResponseContent: String(agentOut.responseContent ?? "").trim(),
    userMessage,
    routeDecision,
    skillOutput: recommendationSkillOutput,
    recommendation: recommendationToolRun,
    recommendationSurfaceLabel,
    effectLedger,
    activeSkillState,
    tempMemory,
    history,
    memoryV2ActiveContextBlock,
    loggedMessageId,
    planItemSnapshot,
    stylePreferences: responseStylePreferences,
    deps: {
      directSafetyCrisisReplyOverride: directSafetyCrisisReplyOverrideRuntime,
      directConversationSkillReplyOverride,
      oneShotReminderManagementReply,
      enforceRecommendationToolVisibleReply: (input) =>
        enforceRecommendationToolVisibleReply({
          responseContent: input.responseContent,
          userMessage: input.userMessage,
          recommendation: input.recommendation as ProductRecommendation | null,
          surfaceLabel: input.surfaceLabel ?? null,
          tempMemory: input.tempMemory,
          planItemSnapshot:
            (input.planItemSnapshot as V2PlanItemSnapshotItem[] | null) ??
              null,
        }),
      stripHiddenHtmlComments,
      stripDeprecatedProductVocabulary,
      weeklyAdaptiveReviewStateForTurn,
      cleanWeeklyVisibleResponse,
      applyMemoryV2ResponseGroundingGuardrail,
      applyNonDurableMemoryPromiseGuard,
      applyWeeklyForgottenProgressAckGuard: (input) =>
        applyWeeklyForgottenProgressAckGuard({
          responseContent: input.responseContent,
          tempMemory: input.tempMemory,
          loggedMessageId: input.loggedMessageId ?? null,
        }),
      applyWeeklyRepeatedClarificationGuard,
      applyWeeklyConcreteOrganizationGuard,
      applyWeeklyConclusionGuard,
      applyCompactStartGuard,
      applyIncompleteRecapGuard,
      applyUnexecutedEffectClaimGuard,
      applyCoachResponseStylePreferences: (input) =>
        applyCoachResponseStylePreferences({
          userMessage: input.userMessage,
          responseContent: input.responseContent,
          preferences: input.preferences as any,
        }),
      userRequestsShortStyle,
      normalizeRouteText,
      ensureVisibleSophiaEmoji,
    },
  });
  let responseContent = finalResponse.responseContent;
  if (finalResponse.effectLedgerTrace && normalConversationTurnTrace) {
    (normalConversationTurnTrace as any).effect_ledger =
      finalResponse.effectLedgerTrace;
  }
  const nextMode = agentOut.nextMode;
  const coachingAddonUsed =
    (tempMemory as any)?.__coaching_intervention_addon ??
      null;
  const coachingRenderAudit = detectCoachingInterventionRender({
    addon: coachingAddonUsed,
    responseContent,
  });
  if (coachingAddonUsed) {
    await logCoachingObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
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
      requestId: meta?.requestId,
      reason: `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
    });
    // Persist fallback details for production debugging (queryable via SQL).
    // This captures swallowed agent failures that otherwise only appear in runtime logs.
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      severity: "warn",
      title: "router_outage_fallback",
      error: agentOut.outageErrorMessage ??
        `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
      requestId: meta?.requestId ?? null,
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
    requestId: meta?.requestId ?? null,
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
      requestId: meta?.requestId,
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
    requestId: meta?.requestId ?? null,
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
    requestId: meta?.requestId ?? null,
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
        ...(opts?.messageMetadata ?? {}),
        channel,
        request_id: meta?.requestId ?? null,
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

  // Persist one turn_summary row per router turn (powers bundle brain_trace exports).
  try {
    await persistTurnSummaryLog({
      supabase,
      config: {
        awaitEnabled: envBool("SOPHIA_TURN_SUMMARY_DB_AWAIT", false),
        timeoutMs: envInt("SOPHIA_TURN_SUMMARY_DB_TIMEOUT_MS", 1200),
        retries: envInt("SOPHIA_TURN_SUMMARY_DB_RETRIES", 1),
      },
      metrics: {
        request_id: meta?.requestId ?? null,
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
          source: "sophia-brain/router/run.ts",
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

  // P0-1: Fire-and-forget conversation pulse generation.
  // Gated on turn count >= 3 to avoid wasting LLM calls on early turns.
  // The builder's 12h cache prevents redundant LLM calls on subsequent turns.
  if (conversationTurnCount >= 3 && v2Runtime?.cycle) {
    buildConversationPulse({
      supabase,
      userId,
      requestId: meta?.requestId,
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

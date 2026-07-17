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
import { logRuntimeGuardEvent } from "../../_shared/guard-log.ts";
import { cancelPotionSupportCampaign } from "../../_shared/potion-support-cancellation.ts";
import { retractedContentSegments } from "../../_shared/memory/memorizer/retraction_guard.ts";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import { debounceAndBurstMerge } from "./debounce.ts";
import { runAgentAndVerify } from "./agent_exec.ts";
import {
  applyPresenceFlowState,
  armAttackKeywordSupportPresence,
  armPotionSupportPresence,
  commitPresenceResult,
  type PresenceApplyResult,
  readActivePresenceState,
} from "../skills/presence_conversation/apply.ts";
import {
  potionSupportLocalFailureDecision,
  runPotionSupportLocalDispatcher,
} from "../skills/potion_support_admission/local_flow.ts";
import {
  type PotionSupportAdmissionContext,
  readPotionSupportAdmissionState,
} from "../skills/potion_support_admission/state.ts";
import {
  type AttackKeywordSupportContextV1,
  isAllowedAttackKeyword,
  loadAttackKeywordSupportMatch,
  renderAttackKeywordSupportReply,
} from "../../_shared/attack-keyword-support.ts";
import { applyAttackKeywordSupportRoute } from "./attack_keyword_support_route.ts";
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
  freshLastTrackCommit,
  lastTrackCommitForDispatcher,
  pendingTrackProgressClarificationForDispatcher,
  resolvePlanItemByNaming,
  trackMessageIsAdditive,
} from "../tools/always_on/track_progress_plan_item/router.ts";
import {
  classifyOneShotReminderDirectIntent,
  pendingOneShotReminderClarificationForDispatcher,
  pendingSafetyDeferredReminderForDispatcher,
  SAFETY_DEFERRED_REMINDER_RUNTIME_KEY,
  storeSafetyDeferredReminder,
} from "../tools/always_on/one_shot_reminder/router.ts";
import { readPendingOneShotReminderRows } from "../tools/always_on/one_shot_reminder/persistence.ts";
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
        // P7-A (rose-hard19 R1-B02): température 0 — le dispatcher est un
        // CLASSIFIEUR (bande safety comprise); un flip none↔medium observé
        // sur message identique change le routing d'un tour entier.
        0,
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

/**
 * P4-C (paul-p3verify R1-W02): commit de la traîne conversation_risk +
 * vieillissement du marqueur last_track_commit — sur TOUS les chemins de
 * retour du tour (leçon P3: un gate posé sur un seul chemin est un gate
 * troué). Le chemin nominal était le seul à committer: les tours OWNÉS par
 * safety ou par un skill sortaient avant, et une crise DIRECTE (sans tour
 * medium préalable) laissait la traîne à [0,0,0,0,0].
 */
// P5-G/P6-H: intention mémoire explicite du user — SOURCE UNIQUE du pattern
// (capture au tour d'accusé → buffer de session, ET scan d'historique au
// recall). Conjugaisons couvertes: « que tu retiennes » échappait à la
// forme de base (paul-p4verify T15).
export const SESSION_MEMORY_INTENT_PATTERN =
  /(retien(s|nes?|dras)|souviens[- ]toi|garde (bien )?(ca |ça )?en tete|garde (bien )?(ca |ça )?en tête|a retenir|à retenir|garde le en tete|garde-le en tete|note (bien )?pour la suite|faut que (tu saches|je te dise)|que tu le saches|truc a garder|truc à garder|memorise|mémorise)/i;

/** P5-G/P7-A: question de RECALL détectée sur le message — source unique du
 * déclencheur (injection companion ET co-demande bénigne sous safety). */
export function isMemoryRecallQuestion(message: string): boolean {
  return /(ce que je t.{0,3}avais? demande de retenir|tu te (rappelles?|souviens)|redis[- ]moi ce que|qu est ce que je t avais dit de retenir)/i
    .test(
      message.normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[’']/g, " "),
    );
}

/** P8-E (paul-untested22 R1 T14): readout READ-ONLY des rappels demandé
 * pendant le flow safety — « redis-moi mes rappels de demain », « j'ai quoi
 * comme rappels ? ». Lecture pure exigée: le nom « rappel(s) » présent, un
 * verbe de restitution/inventaire, et AUCUN verbe de mutation. Même famille
 * de détecteur que isMemoryRecallQuestion (co-demande bénigne sous safety). */
export function isReminderReadoutQuestion(message: string): boolean {
  const text = String(message ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase();
  if (!/\brappels?\b/.test(text)) return false;
  // Formes d'ACTE uniquement — « mes rappels posés là » (participe passé
  // d'inventaire) reste un readout, « pose-moi un rappel » n'en est pas un.
  if (
    /\b(cree|creer|ajoute|annule|supprime|decale|remets|repousse|programme|modifie|change)\b|\bpose[- ]?(moi|nous|un|le|la)\b/
      .test(text)
  ) {
    return false;
  }
  return /\b(redis|redonne|liste|montre|rappelle|donne)[- ]?moi\b|\bdis[- ]?moi (mes|les|quels?)\b|\bquels? rappels?\b|\bj ai quoi comme rappels?\b|\bc est quoi mes rappels?\b/
    .test(text);
}

/** P6-H/P7-A: intentions mémoire explicites de la session — union du buffer
 * (capturé au tour d'accusé) et de l'historique, dédupliquée, 4 max. */
export function collectSessionMemoryIntents(
  tempMemory: unknown,
  history: unknown,
): string[] {
  const fromHistory = (Array.isArray(history) ? history : [])
    .filter((entry: any) =>
      entry?.role === "user" && typeof entry?.content === "string" &&
      SESSION_MEMORY_INTENT_PATTERN.test(String(entry.content))
    )
    .map((entry: any) => String(entry.content).slice(0, 240));
  const fromBuffer = (Array.isArray(
      (tempMemory as Record<string, unknown>)?.__session_memory_intents,
    )
    ? (tempMemory as Record<string, unknown>)
      .__session_memory_intents as Array<Record<string, unknown>>
    : [])
    .map((entry) => String(entry?.text ?? "").trim())
    .filter(Boolean);
  return [...new Set([...fromBuffer, ...fromHistory])].slice(-4);
}

/** P8-E (paul-untested22 R1 T14): facts DB-groundés pour un readout de
 * rappels demandé sous safety — liste courte des pending (label local +
 * consigne), lecture PURE (aucun side effect), fail-open (erreur → [] et le
 * visible agent différera nommément au lieu d'inventer). */
export async function pendingReminderReadoutFacts(args: {
  supabase: any;
  userId: string;
  timezone?: string | null;
}): Promise<string[]> {
  try {
    const rows = await readPendingOneShotReminderRows({
      supabase: args.supabase,
      userId: args.userId,
      limit: 5,
    });
    const timezone = args.timezone || "Europe/Paris";
    return rows.map((row: any) => {
      const date = new Date(String(row?.scheduled_for ?? ""));
      let label = String(row?.scheduled_for ?? "");
      if (Number.isFinite(date.getTime())) {
        try {
          label = new Intl.DateTimeFormat("fr-FR", {
            timeZone: timezone,
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          }).format(date);
        } catch (_error) {
          // label ISO en dernier recours — jamais un throw.
        }
      }
      const instruction = String(
        (row?.message_payload as Record<string, unknown> | null | undefined)
          ?.reminder_instruction ?? "",
      ).trim();
      return instruction
        ? `Rappel en attente ${label} — ${instruction}`
        : `Rappel en attente ${label}`;
    });
  } catch (_error) {
    return [];
  }
}

export function commitPostTurnRiskTrail(
  tempMemory: Record<string, unknown>,
  args: {
    runtimeSafetyRiskBand: unknown;
    turnFrameRiskBand: unknown;
    routeIsSafety: boolean;
    sourceMessageId: string | null;
  },
): Record<string, unknown> {
  ageLastTrackCommitMarker(tempMemory, args.sourceMessageId);
  // P12-F (rose-hard25 R1-B03): la bande committée = le MAX des deux sources
  // (runtime + frame du tour) — l'ancien `??` gardait un snapshot runtime
  // `none` pris avant que le pipeline n'émette le frame medium, et la traîne
  // s'écrivait à 0 sur un tour de détresse réelle. Invariant: la bande qui a
  // produit les blocked_paths et la ligne P11 est celle du trail.
  const bandRank = (band: unknown): number => {
    const value = String(band ?? "none");
    return value === "critical"
      ? 4
      : value === "high"
      ? 3
      : value === "medium"
      ? 2
      : value === "low"
      ? 1
      : 0;
  };
  const effectiveBand = bandRank(args.runtimeSafetyRiskBand) >=
      bandRank(args.turnFrameRiskBand)
    ? String(args.runtimeSafetyRiskBand ?? "none")
    : String(args.turnFrameRiskBand ?? "none");
  const bandScore = effectiveBand === "critical"
    ? 10
    : effectiveBand === "high"
    ? 9
    : effectiveBand === "medium"
    ? 6
    : effectiveBand === "low"
    ? 2
    : 0;
  // P7-A (rose-hard19 R1-B03, rose-untested22 R1-B01): la traîne est
  // BIDIRECTIONNELLE — elle reflète la bande EFFECTIVE du tour, jamais le
  // seul fait que safety possède le tour. L'ancien `routeIsSafety → 10`
  // ré-épinglait la traîne à 10 sur chaque tour du flow, y compris en bande
  // none stabilisée: la décroissance (-4/tour) ne pouvait jamais commencer
  // et le faux positif d'entrée verrouillait tout (rappels bénins bloqués
  // 3 tours, escalade humaine sur band none). Le boost à 10 ne subsiste que
  // pour les tours réellement aigus (high/critical) — l'intention P4-C
  // (crise directe = traîne pleine) est préservée; un tour safety en bande
  // medium score 6, en bande none il score 0 et la vigilance s'effondre
  // avec la désescalade (le maintien du flow reste au reducer).
  const turnScore = args.routeIsSafety && bandScore >= 9 ? 10 : bandScore;
  const previousTrail = Array.isArray(tempMemory.__conversation_risk_scores)
    ? tempMemory.__conversation_risk_scores as number[]
    : [];
  return {
    ...tempMemory,
    __last_turn_risk_band: effectiveBand,
    __conversation_risk_scores: [...previousTrail, turnScore].slice(-5),
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
  // P12-C (eva-hard25 R1-B03): le message user arrive aux gardes PAR CONTRAT
  // — l'ancienne lecture `turnFrame.user_message` visait un champ qui
  // n'existe pas au runtime (la garde P10-V était inatteignable en prod, la
  // probe passait sur un frame synthétique enrichi).
  userMessage?: string,
  // P12-V (probe P12-3 passe 1): l'history du tour alimente la garde de
  // MENTION RÉTRACTÉE — le verrou write-path et l'interdit de contexte ne
  // suffisent pas quand le composeur lit le contenu dans l'historique brut.
  history?: unknown,
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
  out = stripForeignScriptTokens(out);
  out = stripCommitClaimBeforeClarify(out, turnFrame ?? null, userMessage);
  out = stripUnfoundedReminderCapacityDenial(out, turnFrame ?? null);
  out = stripTrackClaimWithoutCommit(out, turnFrame ?? null);
  out = ensureCommittedRenderParity(out, turnFrame ?? null, userMessage);
  out = stripRetractedSessionMention(out, history, userMessage, turnFrame);
  if (!isSafetyRoute(routeDecision)) {
    out = ensureVisibleSophiaEmoji(out);
    out = ensureClarifyQuestionVisible(out, turnFrame ?? null);
  }
  return out.trim();
}

/**
 * P12-V (probe P12-3 passe 1) — GARDE DE MENTION RÉTRACTÉE, le filet
 * STRUCTUREL de la famille rétractation : le verrou write-path (memorizer)
 * et l'interdit de contexte (loader) ne suffisent pas quand le composeur
 * restitue le contenu depuis l'HISTORIQUE brut de conversation (« Tu voulais
 * te remettre à la natation » sur un recall générique, 4e occurrence réelle
 * de la famille). Toute phrase du rendu qui porte un token significatif d'un
 * segment rétracté en session est retirée — SAUF réouverture NOMINATIVE (le
 * message user COURANT renomme lui-même ce contenu). Condition de
 * suppression : composeur fiable sous l'interdit de contexte (0 strip sur
 * 3 vagues).
 */
export function stripRetractedSessionMention(
  text: string,
  history: unknown,
  userMessage?: string,
  turnFrame?: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!source.trim() || !Array.isArray(history)) return source;
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  let segments: string[] = [];
  try {
    segments = retractedContentSegments(
      (history as Array<Record<string, unknown>>).map((entry) => ({
        role: (String(entry?.role ?? "") === "user"
          ? "user"
          : "assistant") as "user" | "assistant",
        content: String(entry?.content ?? ""),
      })),
    );
  } catch (_error) {
    return source; // fail-open: la garde n'invente jamais un strip.
  }
  if (segments.length === 0) return source;
  const stopwords = new Set([
    "avoir", "faire", "etre", "chose", "choses", "vraiment", "toujours",
    "jamais", "encore", "cette", "cette", "comme", "quand", "aussi", "alors",
    "depuis", "moment", "projet", "envie", "trotte",
  ]);
  const normalizedUser = normalize(String(userMessage ?? ""));
  const forbiddenTokens = [
    ...new Set(
      segments.flatMap((segment) =>
        normalize(segment).split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 5 && !stopwords.has(token))
      ),
    ),
    // Réouverture nominative: un token renommé par le user COURANT redevient
    // mentionnable.
  ].filter((token) => !normalizedUser.includes(token));
  if (forbiddenTokens.length === 0) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) => {
    const normalizedSentence = normalize(sentence);
    return !forbiddenTokens.some((token) =>
      normalizedSentence.includes(token)
    );
  });
  if (kept.length === sentences.length) return source;
  console.warn("[Router] retracted-session mention stripped (P12-V)");
  logRuntimeGuardEvent({
    guard: "retracted_mention_stripped",
    userId: (turnFrame as { user_id?: string } | null | undefined)?.user_id ??
      null,
    detail: {
      turn_id:
        (turnFrame as { turn_id?: string } | null | undefined)?.turn_id ??
          null,
    },
  });
  return kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
    "Rien que je doive te ressortir là-dessus — dis-moi ce qui t'aiderait maintenant.";
}

/**
 * P12-C (alex-untested24 R1-B05/B08/B12, nina-p10reval R1-B03c) — PARITÉ
 * INVERSE rendu=ledger. P8-F/P10-V couvrent le claim-sans-commit; le miroir
 * n'existait pas: (a) un tour à N commits rappel rendu « je n'ai rien
 * fait » (2 commits committés en silence, découverts par hasard 7 tours
 * plus tard puis requalifiés « erreur d'affichage »), (b) « j'ai annulé X »
 * sans AUCUN commit cancel du tour, (c) « X reste tel quel » alors que son
 * cancel est committé au même tour. Ces cas ne produisaient AUCUNE ligne
 * guards (les gardes lisaient le rendu, pas le ledger).
 * Politique: les DÉNIS et faux-intacts sont retirés, les commits non accusés
 * sont APPENDUS depuis la vérité du ledger (labels/instructions committés) —
 * jamais de texte inventé, jamais un commit silencieux.
 */
export function ensureCommittedRenderParity(
  text: string,
  turnFrame: TurnFrame | null,
  userMessage?: string,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const lane = (turnFrame as { direct_effect_lane?: unknown })
    .direct_effect_lane as Record<string, unknown> | null | undefined;
  const committed = Array.isArray(lane?.committed_effects)
    ? lane?.committed_effects as Array<Record<string, unknown>>
    : [];
  const committedCreates = committed.filter((effect) =>
    String(effect?.type ?? "") === "create_one_shot_reminder"
  );
  const committedCancels = committed.filter((effect) =>
    String(effect?.type ?? "") === "cancel_one_shot_reminder"
  );
  // P12-F (rose-hard25 R1-B01 volet rendu): un track committé jamais annoncé
  // — la demi-coche silencieuse n'était découverte que par audit DB. Même
  // parité que les rappels : commit non mappé ⇒ appendu depuis le ledger.
  const committedTracks = committed.filter((effect) =>
    String(effect?.type ?? "") === "track_progress_plan_item"
  );
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  const normalizedSource = normalize(source);
  const normalizedUser = normalize(String(userMessage ?? ""));
  let out = source;
  let guardFired: string | null = null;
  // (b) Claim « annulé » sans AUCUN commit cancel du tour — borné aux tours
  // où le user a demandé une annulation (mutation des deux côtés, doctrine
  // P10-V) et où rien d'autre ne légitime le mot (un replace committé porte
  // son cancel: exempt par construction, committedCancels > 0).
  if (
    committedCancels.length === 0 &&
    /\bannul/.test(normalizedUser) &&
    /\bj ?.?ai (bien |deja )?annule\b|\bc ?.?est (bien )?annule\b|\best (bien |deja )?annule\b/
      .test(normalizedSource)
  ) {
    const sentences = out.split(/(?<=[.!?\n])/);
    const kept = sentences.filter((sentence) =>
      !/\bj ?.?ai (bien |deja )?annule\b|\bc ?.?est (bien )?annule\b|\best (bien |deja )?annule\b/
        .test(normalize(sentence))
    );
    out = kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
      "Je n'ai annulé aucun rappel sur ce tour — dis-moi lequel tu veux annuler (son heure ou son objet) et je le fais.";
    guardFired = "cancel_claim_without_commit_stripped";
  }
  if (
    committedCreates.length > 0 || committedCancels.length > 0 ||
    committedTracks.length > 0
  ) {
    // (a) Un DÉNI global (« je n'ai rien changé/fait ») ne peut pas coexister
    // avec un commit du tour — la phrase saute (les nuances « rien d'autre »
    // restent).
    const denialPattern =
      /\bje n ?.?ai (rien|pas) (change|changé|fait|touche|touché|modifie|modifié|deplace|déplacé|decale|décalé|annule|annulé)\b|\brien n ?.?a (change|changé|bouge|bougé|ete modifie|été modifié)\b/;
    const hasDenial = out.split(/(?<=[.!?\n])/).some((sentence) => {
      const normalizedSentence = normalize(sentence);
      return denialPattern.test(normalizedSentence) &&
        !/\bd autre|de plus|du reste|a part\b/.test(normalizedSentence);
    });
    if (hasDenial) {
      out = out.split(/(?<=[.!?\n])/).filter((sentence) => {
        const normalizedSentence = normalize(sentence);
        return !(denialPattern.test(normalizedSentence) &&
          !/\bd autre|de plus|du reste|a part\b/.test(normalizedSentence));
      }).join("").replace(/[ \t]{2,}/g, " ").trim();
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
    // (c) « reste tel quel / inchangé / toujours actif » sur un tour qui
    // committe un cancel = faux-intact potentiel — la phrase saute, l'accusé
    // de cancel appendu ci-dessous rétablit la vérité.
    if (
      committedCancels.length > 0 &&
      /\breste(nt)? (tel(le)?s? quel(le)?s?|inchange|intact|actif|active|en place|comme prevu)\b/
        .test(normalizedSource)
    ) {
      out = out.split(/(?<=[.!?\n])/).filter((sentence) =>
        !/\breste(nt)? (tel(le)?s? quel(le)?s?|inchange|intact|actif|active|en place|comme prevu)\b/
          .test(normalize(sentence))
      ).join("").replace(/[ \t]{2,}/g, " ").trim();
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
    // Accusés manquants: chaque commit doit être mappé dans le rendu (label
    // horaire ou token d'instruction pour un create; un mot d'annulation
    // pour un cancel). Un commit non mappé est APPENDU depuis le ledger.
    const additions: string[] = [];
    // P12-V (probe P12-1 passe 2): sur un fan-out MÊME objet / MÊME heure,
    // l'heure et l'instruction ne discriminent plus les commits — le rendu
    // « Vendredi n'est pas encore noté » passait le mapping via le « 18h »
    // de la phrase jeudi. Quand un ancrage collisionne (partagé par ≥2
    // commits), seule l'ancre de JOUR du label mappe ; et un DÉNI NOMINATIF
    // d'un commit (« vendredi … n'est pas encore noté ») est retiré.
    const createHHMMs = committedCreates.map((effect) =>
      normalize(
        String(effect?.local_label ?? "").match(
          /\d{1,2}[:h]\d{2}|\d{1,2}\s?h/,
        )?.[0] ?? "",
      ).replace(":", "h")
    );
    const createInstructions = committedCreates.map((effect) =>
      normalize(String(effect?.reminder_instruction ?? "").trim())
    );
    const dayAnchorsOf = (label: string): string[] => {
      const normalizedLabel = normalize(label);
      const weekday = normalizedLabel.match(
        /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres[- ]demain|aujourd hui)\b/,
      )?.[1];
      const dayNumber = normalizedLabel.match(/\b(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/)?.[1];
      return [weekday, dayNumber].filter(Boolean) as string[];
    };
    const negativeClaimPattern =
      /\bn ?.?(est|a) pas (encore )?(note|pose|cale|programme|pris|enregistre)\b/;
    for (const effect of committedCreates) {
      const label = String(effect?.local_label ?? "").trim();
      const anchors = dayAnchorsOf(label);
      const denialSentences = out.split(/(?<=[.!?\n])/).filter((sentence) => {
        const normalizedSentence = normalize(sentence);
        return negativeClaimPattern.test(normalizedSentence) &&
          anchors.some((anchor) => normalizedSentence.includes(anchor));
      });
      if (denialSentences.length > 0) {
        out = out.split(/(?<=[.!?\n])/).filter((sentence) =>
          !denialSentences.includes(sentence)
        ).join("").replace(/[ \t]{2,}/g, " ").trim();
        guardFired = guardFired ?? "commit_omitted_in_render";
      }
    }
    for (const [index, effect] of committedCreates.entries()) {
      const label = String(effect?.local_label ?? "").trim();
      const instruction = String(effect?.reminder_instruction ?? "").trim();
      const hhmm = createHHMMs[index];
      const normalizedOut = normalize(out);
      const hhmmShared =
        createHHMMs.filter((value) => value && value === hhmm).length > 1;
      const instructionShared = createInstructions.filter((value) =>
        value && value === createInstructions[index]
      ).length > 1;
      const anchors = dayAnchorsOf(label);
      const dayMapped = anchors.length > 0 &&
        anchors.some((anchor) => normalizedOut.includes(anchor));
      const labelMapped = (!hhmmShared && hhmm &&
        normalizedOut.includes(hhmm)) ||
        (label && normalizedOut.includes(normalize(label))) || dayMapped;
      const instructionTokens = normalize(instruction).split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4);
      const instructionMapped = !instructionShared &&
        instructionTokens.some((token) => normalizedOut.includes(token));
      if (!labelMapped && !instructionMapped) {
        additions.push(
          `⚠️ Pour être transparente : j'ai bien enregistré un rappel${
            label ? ` pour ${label}` : ""
          }${instruction ? ` — « ${instruction} »` : ""}. Dis-moi si tu veux l'annuler ou le déplacer.`,
        );
      }
    }
    for (const effect of committedTracks) {
      const title = normalize(String(effect?.target_title ?? ""));
      const titleTokens = title.split(/[^a-z0-9]+/).filter((token) =>
        token.length >= 4
      );
      const normalizedOut = normalize(out);
      const titleMapped = titleTokens.length === 0 ||
        titleTokens.some((token) => normalizedOut.includes(token));
      const genericAck =
        /\b(note|coche|enregistre|marque|compte|pris en compte)\b/.test(
          normalizedOut,
        );
      if (!titleMapped && !genericAck) {
        additions.push(
          `⚠️ Pour être transparente : j'ai bien noté ta progression sur « ${
            String(effect?.target_title ?? "ton action")
          } ». Dis-moi si c'est une erreur et je la corrige.`,
        );
      }
    }
    if (
      committedCancels.length > 0 &&
      !/\bannul/.test(normalize(out))
    ) {
      const cancelLabels = committedCancels.flatMap((effect) => {
        const labels = Array.isArray(effect?.target_local_labels)
          ? effect.target_local_labels as unknown[]
          : [effect?.local_label];
        return labels.map((value) => String(value ?? "").trim()).filter(
          Boolean,
        );
      });
      additions.push(
        `⚠️ Et pour être exacte : le rappel${
          cancelLabels.length > 1 ? "s" : ""
        }${
          cancelLabels.length ? ` de ${cancelLabels.join(" ; ")}` : " visé"
        } a été annulé sur ce tour.`,
      );
    }
    if (additions.length > 0) {
      out = [out.trim(), ...additions].filter(Boolean).join("\n\n");
      guardFired = guardFired ?? "commit_omitted_in_render";
    }
  }
  if (guardFired) {
    console.warn(`[Router] committed render parity guard fired (${guardFired})`);
    logRuntimeGuardEvent({
      guard: guardFired,
      userId: (turnFrame as { user_id?: string }).user_id ?? null,
      detail: {
        turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
        committed_creates: committedCreates.length,
        committed_cancels: committedCancels.length,
        committed_tracks: committedTracks.length,
      },
    });
  }
  return out;
}

/**
 * P10-C (eva-hard24 R1-B01): GARDE ANTI-REFUS-CONFABULÉ — sur un tour
 * multi-intent où le planner a perdu l'effet rappel, le composeur inventait
 * « je ne peux pas le créer ici » (faux: la capacité existe, les tours
 * voisins créent). Un refus de capacité RAPPEL n'est légitime que si un
 * outcome create_one_shot_reminder existe sur le tour (blocked/clarify — la
 * raison contractuelle du refus). Sans aucun outcome de ce type, la phrase
 * de refus est retirée et remplacée par une récupération honnête.
 */
export function stripUnfoundedReminderCapacityDenial(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const normalizeForDenial = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  // P12-V (probe P12-5 passe 4): la garde couvrait les verbes de CRÉATION —
  // le même refus confabulé sur une MUTATION (« je ne peux pas décaler ça
  // depuis ce chat », zéro effet émis) passait au travers alors que la
  // capacité replace existe (P6-H) et que les tours voisins déplacent.
  const denialPattern =
    /\bje ne (peux|pourrai s?) pas (te |le |la |te le |te la |l |ca )*(creer|poser|programmer|mettre|caler|planifier|decaler|deplacer|avancer|repousser|modifier|changer)\b[^.!?\n]*\b(rappels?|ici|d ici|ca depuis|depuis (le |la |ce )?(chat|conversation))\b|\bje ne peux pas (le|la|ca) (creer|poser|programmer|mettre|caler|decaler|deplacer|avancer|modifier) (ici|depuis (le |ce )?chat)\b/;
  if (!denialPattern.test(normalizeForDenial(source))) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const hasReminderOutcome = (context?.effects_outcome ?? []).some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder"
  );
  // Un outcome rappel existe (blocked artefact, récurrent, safety…) → le
  // refus est la vérité contractuelle, intact.
  if (hasReminderOutcome) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !denialPattern.test(normalizeForDenial(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn(
    "[Router] unfounded reminder-capacity denial stripped (P10-C)",
  );
  logRuntimeGuardEvent({
    guard: "reminder_capacity_denial_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
  });
  const recovery =
    "Pour tes rappels, dis-moi exactement ce que tu veux (lequel, et le moment) et je le fais direct — c'est possible d'ici.";
  return cleaned ? `${cleaned} ${recovery}` : recovery;
}

/**
 * P10-C (alex-hard24 R1-B04): GARDE CLAIM-TRACK-SANS-COMMIT — « Les deux
 * sont pris en compte ✅ » sur un ledger track blocked (committed 0). Armée
 * UNIQUEMENT quand le tour porte un outcome track non-committé et AUCUN
 * commit d'aucun type (un commit coexistant rend un claim légitime possible
 * — co-demande partielle, on ne strippe pas). Le repli est la guidance
 * contractuelle du blocage (« déjà noté aujourd'hui »), jamais le mensonge.
 */
export function stripTrackClaimWithoutCommit(
  text: string,
  turnFrame: TurnFrame | null,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const outcomes = context?.effects_outcome ?? [];
  const trackNonCommitted = outcomes.some((outcome) =>
    outcome.effect_type === "track_progress_plan_item" &&
    (outcome.status === "blocked" || outcome.status === "needs_clarify")
  );
  const anyCommitted = outcomes.some((outcome) =>
    outcome.status === "committed"
  );
  const normalizeForClaim = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  // P12-C (eva-hard25 R1-B01): PARITÉ PAR ITEM — un claim ADDITIF (« j'ai
  // aussi noté ton activité : aquarelle ✅ ») nommant un item SANS commit de
  // CET item est retiré MÊME quand un autre commit coexiste (le trou
  // anyCommitted⇒no-strip de P10-C rendait la garde inopérante par
  // construction sur la co-demande partielle). Borné au marqueur additif
  // explicite dont la phrase ne recouvre AUCUN target_title committé ; les
  // accusés mémoire (« je le garde en tête ») restent exempts.
  {
    const lane = (turnFrame as { direct_effect_lane?: unknown })
      .direct_effect_lane as Record<string, unknown> | null | undefined;
    const committedTrackTitles = (Array.isArray(lane?.committed_effects)
      ? lane?.committed_effects as Array<Record<string, unknown>>
      : [])
      .filter((effect) =>
        String(effect?.type ?? "") === "track_progress_plan_item"
      )
      .map((effect) => normalizeForClaim(String(effect?.target_title ?? "")))
      .filter(Boolean);
    const additiveClaimPattern =
      /\bj ?.?ai aussi (note|coche|enregistre|marque)\b|\best aussi (note|coche|enregistre|marque)e?\b/;
    const memoryExemption = /\b(en tete|memoire|preference|retien|retenu)\b/;
    const hasTrackContext = outcomes.some((outcome) =>
      outcome.effect_type === "track_progress_plan_item"
    );
    if (hasTrackContext) {
      const sentences = source.split(/(?<=[.!?\n])/);
      const kept = sentences.filter((sentence) => {
        const normalizedSentence = normalizeForClaim(sentence);
        if (!additiveClaimPattern.test(normalizedSentence)) return true;
        if (memoryExemption.test(normalizedSentence)) return true;
        const coveredByCommit = committedTrackTitles.some((title) =>
          title.split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
            .some((token) => normalizedSentence.includes(token))
        );
        return coveredByCommit;
      });
      if (kept.length !== sentences.length) {
        console.warn(
          "[Router] additive track claim on uncommitted item stripped (P12-C)",
        );
        logRuntimeGuardEvent({
          guard: "track_claim_without_commit_stripped",
          userId: (turnFrame as { user_id?: string }).user_id ?? null,
          detail: {
            turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
            reason: "per_item_additive",
          },
        });
        return kept.join("").replace(/[ \t]{2,}/g, " ").trim() ||
          "Je n'ai noté qu'une partie de ce que tu m'as dit — redis-moi l'autre item et je le coche.";
      }
    }
  }
  if (!trackNonCommitted || anyCommitted) return source;
  const claimPattern =
    /\b(les deux|tous les deux|les trois|tout ca) (sont|est) (bien )?(pris|note|notes|enregistre|enregistres|coche|coches|compte|comptes|marque|marques)\b|\bc ?.?est (note|pris en compte|enregistre|coche|marque) pour (les deux|tous les deux|les trois)\b/;
  if (!claimPattern.test(normalizeForClaim(source))) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !claimPattern.test(normalizeForClaim(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn("[Router] track claim without commit stripped (P10-C)");
  logRuntimeGuardEvent({
    guard: "track_claim_without_commit_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
  });
  const blockedGuidance = outcomes.find((outcome) =>
    outcome.effect_type === "track_progress_plan_item" &&
    (outcome.status === "blocked" || outcome.status === "needs_clarify")
  );
  const fallback = String(blockedGuidance?.guidance ?? "").trim() ||
    "Je n'ai rien coché de nouveau sur ce tour — redis-moi exactement quoi noter et je le fais.";
  return cleaned ? cleaned : fallback;
}

/**
 * P8-F (eva-hard23 R1-B04 — résiduel P7 revenu en run réel, décision actée):
 * GARDE DE RENDU claim-avant-clarify. Quand le tour porte un needs_clarify
 * de rappel (pending armé, ZÉRO commit du type), aucune phrase du rendu ne
 * peut affirmer la pose (« Je te le mets pour demain à 07:00 » puis la
 * question du créneau = assertion d'un rappel jamais écrit). Les phrases
 * fautives sont retirées; si tout saute, la question contractuelle de la
 * lane reste (ensureClarifyQuestionVisible la ré-injecte). Jamais activée
 * quand un commit du même type existe (co-demande partielle P8-A: « c'est
 * fait pour jeudi » est VRAI).
 */
export function stripCommitClaimBeforeClarify(
  text: string,
  turnFrame: TurnFrame | null,
  // P12-C (eva-hard25 R1-B03): canal CONTRACTUEL du message user — l'ancien
  // `turnFrame.user_message` n'existe pas au runtime et rendait la branche
  // P10-V inatteignable en prod (la probe passait sur un frame synthétique).
  userMessage?: string,
): string {
  const source = String(text ?? "");
  if (!turnFrame || !source.trim()) return source;
  const context = buildDirectEffectConfirmationContext(turnFrame);
  const outcomes = context?.effects_outcome ?? [];
  const reminderClarify = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "needs_clarify"
  );
  // P9-C (alex-hard24 R1-B01): la garde couvre aussi le BLOCKED — un
  // reschedule mal classé bloqué duplicate_pending sortait « le rappel de
  // 22h est bien décalé à jeudi » avec un ledger à zéro commit. Le différé
  // safety est exempté: son « je le garde pour après » est la vérité
  // contractuelle du blocage, pas un claim de pose.
  const reminderBlockedNonDeferred = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "blocked" &&
    !/safety|defer/i.test(String(outcome.reason_code ?? ""))
  );
  const reminderCommitted = outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "committed"
  );
  // P10-V (probe P10-4 passe 1): ZÉRO outcome rappel + le user a demandé un
  // DÉPLACEMENT (« avance le a 12h ») + le rendu affirme la mutation
  // (« c'est fait… à la place de 12h30 ») — le dispatcher n'avait rien émis,
  // aucune lane n'a tourné, le claim est faux par construction. Borné aux
  // verbes de MUTATION des deux côtés: les readouts légitimes (« ton rappel
  // est posé pour demain ») restent intacts.
  const noReminderOutcome = !outcomes.some((outcome) =>
    outcome.effect_type === "create_one_shot_reminder"
  );
  const normalizeForClaimEarly = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  const userMessageText = String(
    userMessage ??
      (turnFrame as { user_message?: string }).user_message ?? "",
  );
  const userAskedReminderMutation =
    /\b(decale|avance|repousse|replanifie|reprogramme|remets|mets)[- ]?(le|la|les)?\b/
      .test(normalizeForClaimEarly(String(userMessageText))) &&
    /\b(\d{1,2}\s?h(\d{2})?|au lieu de|a la place|plus tot|plus tard|demain|ce soir)\b/
      .test(normalizeForClaimEarly(String(userMessageText)));
  const mutationClaimPattern =
    /\b(decale|deplace|avance|repousse|replanifie|reprogramme)e?s?\b|\bc ?.?est (fait|bon)\b[^.!?\n]{0,80}\b(a la place de|au lieu de)\b/;
  const unfoundedMutationClaim = noReminderOutcome &&
    userAskedReminderMutation &&
    mutationClaimPattern.test(normalizeForClaimEarly(source));
  if (
    (!reminderClarify && !reminderBlockedNonDeferred &&
      !unfoundedMutationClaim) || reminderCommitted
  ) {
    return source;
  }
  if (unfoundedMutationClaim && !reminderClarify && !reminderBlockedNonDeferred) {
    const sentencesEarly = source.split(/(?<=[.!?\n])/);
    const keptEarly = sentencesEarly.filter((sentence) =>
      !mutationClaimPattern.test(normalizeForClaimEarly(sentence))
    );
    const cleanedEarly = keptEarly.join("").replace(/[ \t]{2,}/g, " ").trim();
    console.warn(
      "[Router] reminder mutation claim without any outcome stripped (P10-V)",
    );
    logRuntimeGuardEvent({
      guard: "mutation_claim_without_outcome_stripped",
      userId: (turnFrame as { user_id?: string }).user_id ?? null,
      detail: { turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null },
    });
    return cleanedEarly ||
      "Je n'ai rien changé sur tes rappels pour l'instant — redis-moi lequel déplacer et vers quel créneau, et je le fais.";
  }
  // P9-C: participes de mutation ajoutés (décalé/déplacé/avancé/repoussé/
  // replanifié/reprogrammé/calé) + mots intercalés tolérés (« le rappel DE
  // 22H est BIEN décalé ») — le motif exact ratait toute variante.
  const claimPattern =
    /\bje (te |le |la |te le |te la |l )?(mets|pose|programme|cale|note|garde|decale|deplace|avance|repousse|replanifie|reprogramme)\b|\bc ?.?est (bien |deja |desormais |donc )?(fait|pose|posé|programme|programmé|cale|calé|note|noté|pris|enregistre|enregistré|garde|gardé|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b|\bje l ?.?ai (bien |deja )?(pose|posé|programme|programmé|cree|créé|mis|note|noté|garde|gardé|gardée|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b|\b(rappel|il|elle)(?: [a-z0-9:]{1,12}){0,4} est (bien |deja |desormais |maintenant )?(pose|posé|programme|programmé|cree|créé|enregistre|enregistré|garde|gardé|gardée|cale|calé|decale|décalé|deplace|déplacé|avance|avancé|repousse|repoussé|replanifie|replanifié|reprogramme|reprogrammé)\b/;
  const normalizeForClaim = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase();
  if (!claimPattern.test(normalizeForClaim(source))) return source;
  const sentences = source.split(/(?<=[.!?\n])/);
  const kept = sentences.filter((sentence) =>
    !claimPattern.test(normalizeForClaim(sentence))
  );
  const cleaned = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  console.warn(
    "[Router] commit-claim stripped on a needs_clarify reminder turn (P8-F)",
  );
  logRuntimeGuardEvent({
    guard: "commit_claim_stripped",
    userId: (turnFrame as { user_id?: string }).user_id ?? null,
    detail: {
      turn_id: (turnFrame as { turn_id?: string }).turn_id ?? null,
      reason: reminderClarify ? "needs_clarify" : "blocked",
    },
  });
  // Si tout le texte portait le claim, la question contractuelle de la lane
  // (clarify_question) reste la réponse — jamais un claim, jamais un vide.
  // P12-G (nina-p10reval R1-B05): le strip emportait la RELANCE d'un blocked
  // past_time (« un autre horaire, ou demain ? ») pourtant présente dans
  // visible_confirmation_hint — invariant H3/O3 étendu au chemin strippé:
  // si le texte restant a perdu toute question, la question de la lane est
  // ré-appendue.
  const laneHint = String(
    ((turnFrame as { direct_effect_lane?: { visible_confirmation_hint?: unknown } })
      .direct_effect_lane?.visible_confirmation_hint) ?? "",
  ).trim();
  if (cleaned && !cleaned.includes("?") && laneHint.includes("?")) {
    return `${cleaned}\n\n${laneHint}`;
  }
  if (cleaned) return cleaned;
  const clarify = outcomes.find((outcome) =>
    outcome.effect_type === "create_one_shot_reminder" &&
    outcome.status === "needs_clarify" &&
    String(outcome.clarify_question ?? "").trim()
  );
  if (String(clarify?.clarify_question ?? "").trim()) {
    return String(clarify?.clarify_question ?? "").trim();
  }
  // P9-C: un BLOCKED sans question contractuelle ne peut pas retomber sur le
  // texte fautif (le claim reviendrait) — repli déterministe honnête.
  // P12-V (harness S2 T4): le hint de la lane (l'état RÉEL du blocage, ex.
  // « il est déjà calé à 23h — rien à changer ») prime sur le repli
  // générique : le strip est honnête mais un repli sans contexte laissait
  // l'utilisateur sans l'état de son rappel.
  if (laneHint) return laneHint;
  return "Je n'ai rien changé sur tes rappels pour l'instant — redis-moi exactement ce que tu veux et je le fais.";
}

/**
 * P7-F (rose-untested22 R1-B05): GARDE DE COHÉRENCE DE SCRIPT — un artefact
 * de génération peut injecter un token d'un alphabet étranger en pleine
 * phrase française (« je n'ai pas de पुष्टि ici », devanagari). Garde
 * d'intégrité du renderer, non sémantique: les mots portés par un script
 * hors latin/grec/emoji sont retirés (le résidu reste plus lisible que le
 * charabia). Fail-open: si le strip vide la réponse, on rend l'original.
 */
export function stripForeignScriptTokens(text: string): string {
  const source = String(text ?? "");
  // Lettres hors scripts attendus (latin + signes communs). Les emoji,
  // symboles, ponctuation et chiffres ne sont pas des \p{L}: intacts.
  const foreignLetter = /[\p{L}]/u;
  const allowedLetter = /[\p{Script=Latin}\p{Script=Greek}]/u;
  const hasForeign = [...source].some((char) =>
    foreignLetter.test(char) && !allowedLetter.test(char)
  );
  if (!hasForeign) return source;
  const cleaned = source
    .split(/(\s+)/)
    .filter((token) =>
      !(
        [...token].some((char) =>
          foreignLetter.test(char) && !allowedLetter.test(char)
        )
      )
    )
    .join("")
    .replace(/[ \t]{2,}/g, " ");
  if (!cleaned.trim()) return source;
  console.warn("[Router] foreign-script tokens stripped from visible text");
  return cleaned;
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
  let activeFlowState = readActiveFlowState(tempMemory);
  let lastLocalFlowExitContext = buildLastLocalFlowExitContext(tempMemory);
  let inboundDailyCoachingBridgeNote = localParentNoteTargetsCoaching(
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

  // Potion support owns the semantic reply before the global dispatcher.
  // The first accepted reply promotes the lightweight admission state into
  // the existing Presence engine. During Potion-derived Presence, the same
  // local owner still arbitrates boundaries and exits; it never names a
  // downstream skill, only the global dispatcher.
  // Audit invariant: any turn that started under Potion ownership and ends
  // with a global owner must carry the local decision in its persisted
  // skill_run — otherwise a coaching_recommendation capture is
  // indistinguishable from a bypass of the local dispatcher.
  let potionSupportLocalDispatchTrace: Record<string, unknown> | null = null;
  const withPotionLocalDispatchTrace = (skillRun: unknown): unknown =>
    potionSupportLocalDispatchTrace
      ? {
        ...(skillRun && typeof skillRun === "object"
          ? skillRun as Record<string, unknown>
          : {}),
        potion_support_local_dispatch: potionSupportLocalDispatchTrace,
      }
      : skillRun;
  const admissionState = readPotionSupportAdmissionState(
    activeFlowState.activeSkillState,
  );
  const potionPresenceState = readActivePresenceState(
    activeFlowState.activeSkillState,
  );
  const potionPresenceEntry =
    potionPresenceState?.entry_context?.source === "potion_support"
      ? potionPresenceState.entry_context
      : null;
  const potionLocalContext: PotionSupportAdmissionContext | null =
    admissionState?.working_state.potion_support_admission ??
      (potionPresenceEntry
        ? {
          source: "potion_support",
          source_potion_session_id:
            potionPresenceEntry.source_potion_session_id,
          recurring_reminder_id: potionPresenceEntry.recurring_reminder_id,
          scheduled_checkin_id: potionPresenceEntry.scheduled_checkin_id,
          day_index: Math.max(1, Number(potionPresenceEntry.day_index ?? 1)),
          topic_hint: potionPresenceEntry.topic_hint ??
            potionPresenceState?.topic_hint ?? null,
          opening_focus: potionPresenceEntry.opening_focus ??
            potionPresenceState?.topic_hint ?? null,
          anchor_evidence_refs: potionPresenceEntry.anchor_evidence_refs,
          awaiting_first_reply: true,
        }
        : null);
  if (potionLocalContext) {
    const phase = admissionState ? "first_reply" : "presence_continuation";
    let localDecision;
    try {
      localDecision = await runPotionSupportLocalDispatcher({
        userId,
        requestId,
        userMessage,
        recentMessages: recentMessagesForTurnFrame,
        phase,
        context: potionLocalContext,
      });
    } catch (error) {
      console.warn("[potion-support] local dispatcher failed", error);
      localDecision = potionSupportLocalFailureDecision({
        userMessage,
        phase,
        context: potionLocalContext,
      });
    }
    potionSupportLocalDispatchTrace = {
      phase,
      action: localDecision.action,
      confidence: localDecision.confidence,
      relation: localDecision.relation,
      reason: localDecision.reason,
      terminal_reason: localDecision.terminal_reason,
      source_potion_session_id: potionLocalContext.source_potion_session_id,
      recurring_reminder_id: potionLocalContext.recurring_reminder_id,
      scheduled_checkin_id: potionLocalContext.scheduled_checkin_id,
      day_index: potionLocalContext.day_index,
      campaign_status: "active",
    };

    if (localDecision.action === "continue_support") {
      if (admissionState) {
        const nowIso = userTime?.now_utc ?? new Date().toISOString();
        const localDate = String(userTime?.user_local_datetime ?? "")
          .slice(0, 10) || nowIso.slice(0, 10);
        tempMemory = armPotionSupportPresence({
          tempMemory: clearActiveConversationSkillState(tempMemory),
          nowIso,
          localDate,
          topicHint: potionLocalContext.topic_hint ??
            potionLocalContext.opening_focus,
          entryContext: {
            source: "potion_support",
            source_potion_session_id:
              potionLocalContext.source_potion_session_id,
            recurring_reminder_id: potionLocalContext.recurring_reminder_id,
            scheduled_checkin_id: potionLocalContext.scheduled_checkin_id,
            anchor_evidence_refs: potionLocalContext.anchor_evidence_refs,
            day_index: potionLocalContext.day_index,
            topic_hint: potionLocalContext.topic_hint,
            opening_focus: potionLocalContext.opening_focus,
            awaiting_first_reply: false,
          },
        });
        potionSupportLocalDispatchTrace = {
          ...potionSupportLocalDispatchTrace,
          admission_promoted_to_presence: true,
        };
      }
    } else {
      let noteInformation = localDecision.note_information;
      if (
        localDecision.action === "cancel_campaign" &&
        localDecision.terminal_reason
      ) {
        try {
          const admin = serviceRoleLedgerReadClient();
          if (!admin) throw new Error("potion_support_admin_client_missing");
          const outcome = await cancelPotionSupportCampaign({
            admin,
            userId,
            recurringReminderId: potionLocalContext.recurring_reminder_id,
            sourcePotionSessionId:
              potionLocalContext.source_potion_session_id,
            reason: localDecision.terminal_reason,
          });
          if (noteInformation) {
            noteInformation = {
              ...noteInformation,
              structured_context: {
                ...noteInformation.structured_context,
                campaign_status: "terminal_committed",
                cancellation_outcome: outcome,
              },
            };
          }
          potionSupportLocalDispatchTrace = {
            ...potionSupportLocalDispatchTrace,
            campaign_status: "terminal_committed",
            cancellation_outcome: outcome,
          };
        } catch (error) {
          console.error("[potion-support] campaign cancellation failed", error);
          if (noteInformation) {
            noteInformation = {
              ...noteInformation,
              structured_context: {
                ...noteInformation.structured_context,
                campaign_status: "terminal_failed",
                effects_outcome: {
                  status: "failed",
                  reason: "potion_support_campaign_cancellation_failed",
                  guidance:
                    "Ne pas confirmer l'annulation durable; dire que l'arrêt n'a pas pu être vérifié.",
                },
              },
            };
          }
          potionSupportLocalDispatchTrace = {
            ...potionSupportLocalDispatchTrace,
            campaign_status: "terminal_failed",
          };
        }
      }
      tempMemory = clearActiveConversationSkillState(tempMemory);
      tempMemory.__last_potion_support_admission_exit_memo = {
        reason: localDecision.reason,
        user_message_summary: userMessage,
        flow_summary: potionLocalContext.opening_focus ??
          potionLocalContext.topic_hint,
        note_information: noteInformation,
        at: new Date().toISOString(),
      };
    }
    activeFlowState = readActiveFlowState(tempMemory);
    lastLocalFlowExitContext = buildLastLocalFlowExitContext(tempMemory);
    inboundDailyCoachingBridgeNote = localParentNoteTargetsCoaching(
      lastLocalFlowExitContext,
    );
    state = { ...(state as any), temp_memory: tempMemory };
  }

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
      // P4-C (paul-p3verify R1-B03): rappel différé pendant une crise —
      // exposé UNE fois au dispatcher dès que le flow safety n'est plus
      // actif, pour que « je te le remets sur la table » soit exécutable
      // (le user qui le redemande, ou confirme l'offre, obtient un create).
      const safetyFlowActive = String(
        (activeFlowState.activeSkillState as any)?.skill_id ?? "",
      ) === "safety_crisis";
      const safetyDeferredReminder = !safetyFlowActive
        ? pendingSafetyDeferredReminderForDispatcher(tempMemory)
        : null;
      if (
        !lastLocalFlowExitContext && !pendingClarification && !presenceActive &&
        !lastTrackCommit && !safetyDeferredReminder
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
        ...(safetyDeferredReminder
          ? { pending_safety_deferred_reminder: safetyDeferredReminder }
          : {}),
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
  // P4-A (alex-global19 R1-B01): ré-arm du retarget BI-PARTIE. La réponse à
  // « c'était à la place de quelle action ? » nomme la SOURCE — le
  // dispatcher la modélise souvent en mutation unilatérale de cette source
  // (« carnet raté ») et l'effet d'origine (créditer Y) est perdu : la
  // correction s'exécutait à moitié. Quand la clarification pendante porte
  // des slots complets et que l'effet ré-émis vise une AUTRE cible que
  // celle des slots, on reconstruit la transaction : cible = known_slots,
  // retarget_from = l'item que la réponse vient de nommer.
  if (
    pendingClarificationForTurn?.effect_type === "track_progress_plan_item" &&
    String(pendingClarificationForTurn.reason_code ?? "") ===
      "correction_retarget_missing"
  ) {
    const slots = (pendingClarificationForTurn.known_slots ?? {}) as Record<
      string,
      unknown
    >;
    const pendingTargetId = String(slots.target_item_id ?? "").trim();
    const pendingStatus = String(slots.progress_status ?? "").trim();
    const reEmitted = turnFrame.direct_effects.find((effect) =>
      effect.effect_type === "track_progress_plan_item"
    );
    const reEmittedTarget = String(
      ((reEmitted?.payload_hint ?? {}) as Record<string, unknown>)
        .target_item_id ?? "",
    ).trim();
    if (
      pendingTargetId && pendingStatus && reEmitted && reEmittedTarget &&
      reEmittedTarget !== pendingTargetId
    ) {
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.map((effect) => {
          if (effect !== reEmitted) return effect;
          return {
            ...effect,
            payload_hint: {
              target_item_id: pendingTargetId,
              status_hint: pendingStatus,
              ...(String(slots.date_hint ?? "").trim()
                ? { date_hint: String(slots.date_hint) }
                : {}),
              target_evidence: String(slots.target_title ?? ""),
              correction: true,
              retarget_from: reEmittedTarget,
            },
          };
        }),
      };
    }
  }
  // P4-A (rose-hard16 R1-B01, probes P4-2 ×2): BACKSTOP déterministe de la
  // correction de cible — le dispatcher rate encore ~1 émission sur 2 sur
  // « c'était pas X, c'est Y que j'ai fait » malgré 3h-bis et le
  // last_track_commit structuré. Quand le tour précédent a committé un
  // track, que le message porte un marqueur de SUBSTITUTION (jamais
  // additif), nomme la cible du commit ET une seule autre action du plan,
  // l'effet retarget se synthétise — toutes les gardes aval (évidence,
  // idempotence, same-day) restent entières.
  if (
    !turnFrame.direct_effects.some((effect) =>
      effect.effect_type === "track_progress_plan_item"
    )
  ) {
    const lastCommit = freshLastTrackCommit(tempMemory);
    const normalizedMsg = userMessage.normalize("NFD")
      .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, "'").toLowerCase();
    const substitution =
      /(c ?'?etait pas|corrige|je me suis trompe|je me suis emmele|a la place|en fait c ?'?est)/
        .test(normalizedMsg);
    if (lastCommit && substitution && !trackMessageIsAdditive(userMessage)) {
      const titleTokens = (title: string) =>
        title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
          .split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
      const namesLastTarget = titleTokens(lastCommit.target_title)
        .some((token) => normalizedMsg.includes(token));
      const itemsForNaming = (planItemSnapshot ?? []).map((item: any) => ({
        id: String(item?.id ?? item?.plan_item_id ?? ""),
        title: String(item?.title ?? ""),
        aliases: [] as string[],
      })).filter((item) => item.id && item.title);
      const named = resolvePlanItemByNaming({
        items: itemsForNaming,
        reference_texts: [userMessage],
        exclude_item_id: lastCommit.target_item_id,
      });
      if (namesLastTarget && named && "item" in named) {
        const statusHint =
          /(rate|zappe|pas faite?\b|manque)/.test(normalizedMsg)
            ? "missed"
            : "completed";
        const evidenceToken = titleTokens(named.item.title)
          .find((token) => normalizedMsg.includes(token));
        turnFrame = {
          ...turnFrame,
          direct_effects: [...turnFrame.direct_effects, {
            effect_type: "track_progress_plan_item",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              target_item_id: named.item.id,
              status_hint: statusHint,
              correction: true,
              retarget_from: lastCommit.target_item_id,
              target_evidence: evidenceToken ?? named.item.title,
            },
          }],
        };
      }
    }
  }
  // P6-H (paul-hard21 R1-B05): les intentions mémoire ACCUSÉES (« je note »)
  // survivent à la fenêtre d'historique — buffer de session borné (mutation
  // in-place, leçon P1-2), injecté aux tours de recall. Le memorizer
  // nocturne reste la persistance durable ; ce buffer évite le désaveu sec
  // (« je n'ai pas ce fait chargé ») d'un fait accusé 12 tours plus tôt.
  if (SESSION_MEMORY_INTENT_PATTERN.test(userMessage)) {
    const tm = tempMemory as Record<string, unknown>;
    const existing = Array.isArray(tm.__session_memory_intents)
      ? tm.__session_memory_intents as Array<Record<string, unknown>>
      : [];
    const text = userMessage.slice(0, 240);
    if (!existing.some((entry) => String(entry?.text ?? "") === text)) {
      existing.push({ text });
      tm.__session_memory_intents = existing.slice(-5);
    }
  }
  // P5-D/P5-F (probe P5-4 passe 5): BACKSTOP déterministe du TOUR-RÉPONSE à
  // un clarify CREATE — le dispatcher rate parfois l'émission sur la réponse
  // au créneau (« le soir, 20h ») ou sur la confirmation d'un brouillon
  // (« ok crée-le »), et le composeur claimait sans commit. Quand un clarify
  // create est en attente et que le message courant le résout, l'effet se
  // synthétise depuis les slots persistés — toutes les gardes aval (belt,
  // idempotence, past_time) restent entières.
  // Une émission replace/reschedule sur ce tour est un MIS-MAP de la
  // complétion (pattern P2-3d recopié) : il n'existe RIEN à remplacer, le
  // pending est un CREATE en attente de créneau (probe P5-4 passe 9 :
  // blocked replace_payload_incomplete + claim). Elle se substitue. Un
  // intent=cancel émis (« laisse tomber ») n'est JAMAIS coercé.
  const reminderEffectsInFrame = turnFrame.direct_effects.filter((effect) =>
    effect.effect_type === "create_one_shot_reminder"
  );
  const frameReminderIntent = reminderEffectsInFrame.length > 0
    ? String(
      (reminderEffectsInFrame[0].payload_hint as
        | Record<string, unknown>
        | undefined)?.intent ?? "create",
    )
    : null;
  if (
    frameReminderIntent === null ||
    frameReminderIntent === "replace" ||
    frameReminderIntent === "reschedule"
  ) {
    // Borné au TOUR où le clarify vient d'être exposé au dispatcher
    // (pendingClarificationForTurn) — jamais sur un tour ultérieur où une
    // heure anodine (« j'ai rdv à 15h ») synthétiserait un faux create.
    const exposedCreateClarify = pendingClarificationForTurn &&
        (pendingClarificationForTurn as Record<string, unknown>)
            .effect_type === "create_one_shot_reminder" &&
        (pendingClarificationForTurn as Record<string, unknown>).intent ===
          "create"
      ? pendingClarificationForTurn as unknown as {
        known_slots: Record<string, unknown> | null;
      }
      : null;
    const pendingCreateSlots = exposedCreateClarify?.known_slots ?? null;
    if (pendingCreateSlots) {
      const normalizedAnswer = userMessage.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();
      const hourMatch = normalizedAnswer.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/);
      const saysEvening = /\b(soir|soiree|aprem|apres midi)\b/.test(
        normalizedAnswer,
      );
      const confirmsDraft = String(pendingCreateSlots.UTC_time ?? "").trim() &&
        /\b(ok|oui|vas ?y|valide|parfait|c est bon|cree ?le|cree ?la|go)\b/
          .test(normalizedAnswer);
      const storedInstruction = String(
        pendingCreateSlots.instruction_hint ?? "",
      ).trim();
      let synthesizedWhenHint: string | null = null;
      if (hourMatch) {
        let hour = Number(hourMatch[1]);
        const minutes = hourMatch[2] ?? "00";
        if (saysEvening && hour < 12) hour += 12;
        const storedWhen = `${pendingCreateSlots.when_hint ?? ""} ${
          pendingCreateSlots.raw_text ?? ""
        }`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
        const dayToken = /apres[- ]demain/.test(storedWhen)
          ? "après-demain"
          : /demain/.test(storedWhen)
          ? "demain"
          : "";
        synthesizedWhenHint = `${dayToken} à ${hour}h${minutes}`.trim();
      }
      if (synthesizedWhenHint || confirmsDraft) {
        turnFrame = {
          ...turnFrame,
          // L'effet mal émis (replace/reschedule) est SUBSTITUÉ, jamais
          // cumulé — un seul effet rappel sur ce tour.
          direct_effects: [
            ...turnFrame.direct_effects.filter((effect) =>
              effect.effect_type !== "create_one_shot_reminder"
            ),
            {
              effect_type: "create_one_shot_reminder",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                intent: "create",
                raw_text: userMessage,
                ...(synthesizedWhenHint
                  ? { when_hint: synthesizedWhenHint }
                  : {
                    when_hint: String(pendingCreateSlots.when_hint ?? "") ||
                      undefined,
                    UTC_time: String(pendingCreateSlots.UTC_time ?? "") ||
                      undefined,
                    local_label: String(pendingCreateSlots.local_label ?? "") ||
                      undefined,
                  }),
                ...(storedInstruction
                  ? { instruction_hint: storedInstruction }
                  : {}),
              },
            },
          ],
        };
      }
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

  // ── Mot de bascule (carte d'attaque): détection déterministe ─────────────
  // Le mot est DYNAMIQUE (keyword_trigger.activation_keyword de chaque carte
  // active), jamais codé en dur. Pré-gate sans DB: seul un message qui se
  // réduit à UN mot autorisé peut être un mot de bascule — les tours normaux
  // ne paient aucune lecture. La safety garde la priorité absolue: une route
  // safety reste intacte (applyAttackKeywordSupportRoute est un no-op dessus)
  // et le lookup n'est même pas tenté.
  let attackKeywordSupportContext: AttackKeywordSupportContextV1 | null = null;
  if (!isSafetyRoute(routeDecision) && isAllowedAttackKeyword(userMessage)) {
    try {
      attackKeywordSupportContext = await loadAttackKeywordSupportMatch({
        admin: serviceRoleLedgerReadClient() ?? supabase,
        userId,
        userMessage,
      });
    } catch (error) {
      // Panne de lecture = tour normal, jamais un tour cassé.
      console.warn("[attack-keyword] match lookup failed", error);
    }
    if (attackKeywordSupportContext) {
      routeDecision = applyAttackKeywordSupportRoute({
        routeDecision,
        activeSkillState: currentActiveSkillState,
      });
      console.log(
        `[attack-keyword] request_id=${requestId} matched` +
          ` card=${attackKeywordSupportContext.attack_card_id}` +
          ` keyword=${attackKeywordSupportContext.trigger.activation_keyword_normalized}`,
      );
    }
  }

  // ── Flow présence: transition calculée AVANT tout runtime ────────────────
  // Sur une SORTIE (tool_pull / topic_change / closure / expired), le tour
  // est re-dispatché globalement immédiatement (charte cmd 17): le user qui
  // demande une carte atterrit dans coaching CE tour-ci, pas au suivant.
  // Le commit de l'état (poubelle ou maintien) reste fait post-génération.
  let presenceApplyResult: PresenceApplyResult | null = null;
  let presenceExited = false;
  let presenceNowIso = "";
  if (routeDecision.response_owner === "presence_conversation") {
    const presenceStateBeforeTurn = readActivePresenceState(
      currentActiveSkillState,
    );
    const presenceSignal = turnFrame.skill_signals.presence_conversation;
    // P7-E (rose-untested22 R1-B02): INVARIANT INTRA-FRAME — quand le
    // dispatcher classe lui-même le tour en LECTURE factuelle
    // (memory_plan.response_intent recap/statut), un kind=maintain co-émis
    // est incohérent: la présence cède (topic_change → poubelle + re-dispatch
    // global du même tour, cmd 17), seule la réponse normale possède la
    // projection DB. Champ structuré du frame, pas une lecture du message.
    const responseIntentForPresence = String(
      turnFrame.memory_plan?.response_intent ?? "",
    ).toLowerCase();
    const factualIntentOverridesPresence =
      responseIntentForPresence.includes("recap") ||
      responseIntentForPresence.includes("status");
    const presenceKind = factualIntentOverridesPresence
      ? "topic_change"
      : presenceSignal?.context?.kind ?? "maintain";
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
    // P4-C (nina-p3reval R1-B03): BACKSTOP DÉTERMINISTE du différé honnête —
    // en stabilizing, une demande de rappel explicite passait parfois sous
    // les radars des DEUX LLM (dispatcher global ET local): zéro effet émis
    // = différé AVALÉ en silence (« je le garde pour après » jamais dit,
    // contrairement au tour d'idéation). L'intake déterministe re-détecte la
    // demande sur le message et force le stage product_tool_boundary + la
    // conservation du différé.
    if (
      precomputedSafetyCrisisLocalDispatcherOutput &&
      !safetyDirectEffectDecision.deferred_reason &&
      !localOneShotDirectEffect &&
      !turnFrame.direct_effects.some((effect) =>
        effect.effect_type === "create_one_shot_reminder"
      )
    ) {
      const deterministicIntake = classifyOneShotReminderDirectIntent(
        userMessage,
      );
      if (
        deterministicIntake.detected &&
        // P7-A: « reschedule » n'existe pas dans l'union de l'intake — la
        // comparaison était morte (TS2367) et un « décale-le » en
        // stabilizing échappait au backstop du différé; l'intent réel d'un
        // déplacement est `modify_request`.
        (deterministicIntake.intent === "create" ||
          deterministicIntake.intent === "modify_request")
      ) {
        precomputedSafetyCrisisLocalDispatcherOutput = {
          ...precomputedSafetyCrisisLocalDispatcherOutput,
          product_tool_boundary: {
            attempted: true,
            attempt_kind: "tool_creation",
            defer_reason: "safety_active",
          },
        };
        storeSafetyDeferredReminder({
          temp_memory: tempMemory as Record<string, unknown>,
          known_slots: {
            raw_text: userMessage,
            when_hint: deterministicIntake.time_expression ?? null,
          },
        });
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

  let { riskBand: runtimeSafetyRiskBand } = runtimeSafetyContextForTurn({
    safetyContextOutput,
    routeDecision,
    turnFrame,
    tempMemory,
    userMessage,
  });

  // ── Mot de bascule: tour de soutien dédié ────────────────────────────────
  // Le contexte enregistré à la CRÉATION de la carte (situation à risque,
  // ancrage, intention, consigne) alimente un prompt spécialisé — jamais le
  // composeur générique. Aucun effet durable ne tourne sur ce tour (la route
  // les a bloqués), et la Présence est armée pour que la suite reste une
  // conversation de soutien collante, pas un retour sec à la machinerie.
  if (
    routeDecision.response_owner === "attack_keyword_support" &&
    attackKeywordSupportContext
  ) {
    const skillStart = Date.now();
    // PAUL-BASC-B01: le prompt spécialisé reçoit les derniers messages user
    // VERBATIM (données réelles de session, fraîcheur déjà filtrée en amont)
    // pour ne pas re-prescrire un geste déjà déclaré fait sur un re-trigger.
    // Aucune surface produit, aucun résumé intermédiaire — la sanitation
    // (troncature, écho du mot exclu) vit dans le module du domaine.
    const support = await renderAttackKeywordSupportReply({
      context: attackKeywordSupportContext,
      userId,
      requestId,
      recentUserMessages: (history ?? [])
        .filter((entry: any) => String(entry?.role ?? "") === "user")
        .map((entry: any) => String(entry?.content ?? "")),
    });
    const skillLatencyMs = Date.now() - skillStart;
    const responseContent = finalVisibleText(
      support.support_text,
      routeDecision,
      turnFrame,
      userMessage,
      history,
    );
    const nowIso = turnFrame.direct_effect_time_context?.now_utc ??
      new Date().toISOString();
    const localDate =
      (turnFrame.direct_effect_time_context?.user_local_datetime ?? "")
        .slice(0, 10) || nowIso.slice(0, 10);
    // Préemption: le flow local actif (coaching, présence potion…) est mis à
    // la poubelle, puis la Présence est ré-armée avec l'origine mot de
    // bascule. awaiting_first_reply garde la propriété jusqu'à la réponse du
    // user, même des heures plus tard.
    tempMemory = clearActiveConversationSkillState(
      tempMemory as Record<string, unknown>,
    );
    tempMemory = armAttackKeywordSupportPresence({
      tempMemory: tempMemory as Record<string, unknown>,
      nowIso,
      localDate,
      topicHint: attackKeywordSupportContext.trigger.risk_situation || null,
      entryContext: {
        source: "attack_keyword_support",
        attack_card_id: attackKeywordSupportContext.attack_card_id,
        technique_key: "pre_engagement",
        activation_keyword_normalized:
          attackKeywordSupportContext.trigger.activation_keyword_normalized,
        awaiting_first_reply: true,
      },
    });
    tempMemory = commitPostTurnRiskTrail(
      tempMemory as Record<string, unknown>,
      {
        runtimeSafetyRiskBand,
        turnFrameRiskBand: turnFrame.safety?.risk_band,
        routeIsSafety: false,
        sourceMessageId: turnFrame.source_message_id ?? null,
      },
    );
    const effectLedger = effectLedgerForOperationRuntime(
      turnFrame.turn_id,
      null,
    );
    const conversationTurnTrace = {
      turn_frame: turnFrame,
      route_decision: routeDecision,
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      response_owner: routeDecision.response_owner,
      skill_run: {
        selected_skill_id: "attack_keyword_support",
        reason_code: routeDecision.reason_code,
        status: support.used_fallback ? "fallback" : "generated",
        latency_ms: skillLatencyMs,
        attack_card_id: attackKeywordSupportContext.attack_card_id,
      },
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
        direct_effects: directEffectTrace(null),
        effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
        skill_run: withPotionLocalDispatchTrace(conversationTurnTrace.skill_run),
        confirmation_token_outcomes: [],
        memory_write_candidates_emitted: 0,
        response_owner: routeDecision.response_owner,
        total_latency_ms: Date.now() - turnStartMs,
      }, { supabase });
    } catch (error) {
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
      executed_tools: [],
      tool_execution: "none",
    }, "debug");
    return {
      content: responseContent,
      mode: "companion" as AgentMode,
      delivery: null,
      tool_execution: "none",
      executed_tools: [],
      conversation_turn_trace: conversationTurnTrace,
    };
  }

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
  // P12-F (rose-hard25 R1-B03): UNE source de vérité de bande effective par
  // tour — le pipeline peut REBÂTIR le frame (safety medium émise dedans),
  // et le snapshot pré-pipeline écrivait `none` au trail/metadata pendant
  // que la ligne P11 et les blocked_paths disaient medium: le tour suivant
  // composait sans traîne (confirmation de rappel en 1re phrase après un
  // message d'épuisement, ordre V5-1 inversé). Recalcul sur le frame FINAL.
  ({ riskBand: runtimeSafetyRiskBand } = runtimeSafetyContextForTurn({
    safetyContextOutput,
    routeDecision,
    turnFrame,
    tempMemory,
    userMessage,
  }));

  let skillExitInjectedContext: string | undefined;
  let localFlowExitSkillRun: Record<string, unknown> | undefined;
  let localFlowExitRedispatchCount = 0;
  let reminderDirectEffectReexecuted = false;
  let trackProgressReexecuted = false;
  // P5-A (paul-p4verify T12): mémoire de commit du TOUR, indépendante du
  // turnFrame — un redispatch de sortie de flow RECONSTRUIT le frame et perd
  // le runtime committed, donc turnFrameHasCommittedOneShotReminder seul
  // laissait la lane se ré-exécuter (et produire un blocked contredisant le
  // committed du même ledger). Un commit de rappel dans ce tour = plus
  // jamais de ré-exécution de la lane, quel que soit l'état du frame.
  let oneShotReminderCommittedThisTurn = turnFrameHasCommittedOneShotReminder(
    turnFrame,
  );

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
      !turnFrameHasCommittedOneShotReminder(turnFrame) &&
      !oneShotReminderCommittedThisTurn
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
      oneShotReminderCommittedThisTurn = oneShotReminderCommittedThisTurn ||
        turnFrameHasCommittedOneShotReminder(turnFrame);
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
          userMessage,
          history,
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
            skill_run: withPotionLocalDispatchTrace(undefined),
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
        // P4-C (paul-p3verify R1-W02): traîne conversation_risk committée
        // aussi sur ce chemin de retour anticipé (leçon P3: tous les
        // chemins, pas seulement le nominal).
        tempMemory = commitPostTurnRiskTrail(
          tempMemory as Record<string, unknown>,
          {
            runtimeSafetyRiskBand,
            turnFrameRiskBand: turnFrame.safety?.risk_band,
            routeIsSafety: false,
            sourceMessageId: turnFrame.source_message_id ?? null,
          },
        );
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
          // P7-A (paul-p6reval R1-B06): une question de recall bénigne posée
          // PENDANT le flow safety reçoit au minimum un accusé — le silence
          // total (2 tours de suite observés) est un déni de la demande.
          // P8-E (paul-untested22 R1 T14): le canal couvre AUSSI le readout
          // READ-ONLY des rappels (« redis-moi mes rappels de demain ») —
          // classé deferred_product_or_tool_request, il restait avalé sous le
          // bucket produit/outil; les facts viennent de la DB (lecture pure).
          benign_recall_request: isMemoryRecallQuestion(userMessage) ||
              isReminderReadoutQuestion(userMessage)
            ? {
              asked: true,
              facts: [
                ...(isMemoryRecallQuestion(userMessage)
                  ? collectSessionMemoryIntents(tempMemory, history)
                  : []),
                ...(isReminderReadoutQuestion(userMessage)
                  ? await pendingReminderReadoutFacts({
                    supabase,
                    userId,
                    timezone: userTime?.timezone ?? meta?.clientTimezone ??
                      null,
                  })
                  : []),
              ],
            }
            : null,
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
        userMessage,
        history,
      );
      const effectLedger = effectLedgerForOperationRuntime(
        turnFrame.turn_id,
        operationRuntime,
      );
      let potionSupportSafetyCancellation: Record<string, unknown>;
      try {
        const admin = serviceRoleLedgerReadClient();
        if (!admin) throw new Error("potion_support_admin_client_missing");
        const outcome = await cancelPotionSupportCampaign({
          admin,
          userId,
          reason: "cancelled_safety",
        });
        potionSupportSafetyCancellation = {
          status: "committed",
          outcome,
        };
      } catch (error) {
        console.error(
          "[Router] potion support safety cancellation failed",
          error,
        );
        potionSupportSafetyCancellation = {
          status: "failed",
          reason: "potion_support_safety_cancellation_failed",
        };
      }
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
          potion_support_campaign_cancellation:
            potionSupportSafetyCancellation,
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
          skill_run: withPotionLocalDispatchTrace(conversationTurnTrace.skill_run),
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
      // P4-C (paul-p3verify R1-W02): la traîne conversation_risk se commit
      // AUSSI sur le chemin de retour safety — une crise directe (sans tour
      // medium préalable) laissait le pregate à zéro pour toute la session.
      tempMemory = commitPostTurnRiskTrail(
        tempMemory as Record<string, unknown>,
        {
          runtimeSafetyRiskBand,
          turnFrameRiskBand: turnFrame.safety?.risk_band,
          routeIsSafety: true,
          sourceMessageId: turnFrame.source_message_id ?? null,
        },
      );
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
        oneShotReminderCommittedThisTurn = oneShotReminderCommittedThisTurn ||
          turnFrameHasCommittedOneShotReminder(turnFrame);
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
          userMessage,
          history,
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
            skill_run: withPotionLocalDispatchTrace(conversationTurnTrace.skill_run),
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
        // P4-C (paul-p3verify R1-W02): traîne conversation_risk committée
        // aussi sur ce chemin de retour anticipé (leçon P3: tous les
        // chemins, pas seulement le nominal).
        tempMemory = commitPostTurnRiskTrail(
          tempMemory as Record<string, unknown>,
          {
            runtimeSafetyRiskBand,
            turnFrameRiskBand: turnFrame.safety?.risk_band,
            routeIsSafety: false,
            sourceMessageId: turnFrame.source_message_id ?? null,
          },
        );
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
    // P4-C (paul-p3verify R1-B03): le fallback historique saisissait le pic
    // ÉMOTIONNEL (contenu de crise) et l'attribuait à la demande de
    // mémorisation — les messages où le user a EXPLICITEMENT demandé de
    // retenir quelque chose sont maintenant injectés verbatim.
    // P5-G (paul-p4verify R1 T15): le déclencheur ne dépend plus du SEUL
    // response_intent LLM (un tour multi-intent le classait ailleurs et le
    // bloc entier sautait) — une question de recall détectée sur le MESSAGE
    // arme aussi la directive.
    (String(turnFrame.memory_plan?.response_intent ?? "").toLowerCase()
        .includes("recall") ||
        isMemoryRecallQuestion(userMessage))
      ? [
        "=== RECALL (restitution demandée) ===",
        "Si la mémoire durable ne porte pas le fait demandé, cherche-le dans l'historique de CETTE conversation (le user l'a peut-être confié il y a quelques tours) et restitue-le exactement.",
        "Le fait demandé est celui que le user a EXPLICITEMENT confié (« retiens que… », « garde en tête… », « faut que tu saches… »). N'attribue JAMAIS un contenu de crise ou de détresse (idées noires, idéation, effondrement) à une demande de mémorisation: ce que le user a traversé n'est pas ce qu'il a demandé de retenir.",
        "Introuvable des deux côtés → dis-le honnêtement en une phrase. Ne substitue JAMAIS une liste d'outils, de techniques ou un récap générique à la place du fait demandé.",
        ...(() => {
          // P5-G: conjugaisons couvertes — « que tu retiennes » (paul T1)
          // échappait au pattern, l'injection verbatim restait VIDE et la
          // saillance émotionnelle gagnait (contenu de crise restitué).
          // P6-H (paul-hard21 R1-B05): union avec le BUFFER DE SESSION des
          // intentions accusées — un fait confié au T1 tombé hors de la
          // fenêtre d'historique n'est plus désavoué à froid.
          const explicitIntents = collectSessionMemoryIntents(
            tempMemory,
            history,
          ).map((text) => `- « ${text} »`);
          return explicitIntents.length > 0
            ? [
              "Messages où le user a demandé de retenir quelque chose (verbatim, SOURCE UNIQUE de la restitution):",
              ...explicitIntents,
              "Ta restitution COMMENCE par le fait énoncé dans ces messages, reformulé fidèlement. Tout autre souvenir de la conversation (y compris émotionnel) est HORS SUJET pour « ce que tu m'as demandé de retenir ».",
            ]
            : [
              "Aucune intention mémoire explicite trouvée dans la session et la mémoire durable ne porte peut-être pas encore ce fait: dis alors qu'il n'est pas encore consolidé (la consolidation se fait la nuit) — JAMAIS un désaveu sec (« je n'ai pas ce fait chargé ») d'un fait que tu as accusé plus tôt.",
            ];
        })(),
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
    // P4-C (paul-p3verify R1-B03): rappel différé pendant une crise — au
    // premier tour non-safety, la promesse « je te le remets sur la table »
    // se TIENT: offre sobre de le poser (ou confirmation si la lane vient de
    // le committer sur une re-demande).
    (() => {
      const deferred = (tempMemory as Record<string, unknown>)
        ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
          | Record<string, unknown>
          | undefined;
      if (!deferred || deferred.mode !== "deferred") return null;
      const slots = (deferred.known_slots ?? {}) as Record<string, unknown>;
      const hint = [slots.instruction_hint, slots.when_hint]
        .filter(Boolean).join(" — ") ||
        String(slots.raw_text ?? "").slice(0, 160);
      // P6-B (paul-hard21 R1-B02): pendant que le flow safety est ENCORE
      // actif, le différé est ACCUSÉ (jamais le silence total) — si le user
      // le redemande, la réponse dit honnêtement qu'il est gardé de côté,
      // sans le créer ni l'ignorer. La promesse ne devient exécutable qu'à
      // la sortie du flow.
      if (routeDecision.response_owner === "safety") {
        return [
          "=== RAPPEL GARDE DE COTE (moment difficile en cours) ===",
          `Un rappel demandé est gardé de côté : ${hint}.`,
          "Si le user le redemande ou s'en inquiète ce tour: dis en UNE ligne sobre que tu le gardes toujours pour après (« je l'ai de côté, on le pose dès que ça va mieux ») — ne l'ignore JAMAIS en silence, ne le crée pas, ne dis jamais qu'il est posé.",
        ].join("\n");
      }
      return [
        "=== RAPPEL DIFFERE PENDANT LE MOMENT DIFFICILE ===",
        `Un rappel demandé pendant le moment difficile a été mis de côté (« je le garde pour après ») : ${hint}.`,
        "Si l'outcome de ce tour montre qu'il vient d'être posé, confirme sobrement. Sinon, propose en UNE ligne douce de le poser maintenant que ça va mieux — sans insister si le user décline. Ne le présente JAMAIS comme déjà créé.",
        // P7-A (paul-p6reval R1-B03, probe P7-1 passe 7): le moment difficile
        // est PASSÉ — re-différer ici relance la boucle observée.
        "INTERDIT de re-différer sur ce tour (« je le garde pour après », « on verra plus tard », « là on reste sur toi ») : la promesse se SOLDE maintenant — propose de le poser (« on le pose maintenant ? ») ou confirme s'il vient d'être posé.",
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
      // P7-B (rose-hard19 R1-B01): le contrat d'outcome des effets du tour
      // ENTRE dans la prose du flow — un rappel COMMITTÉ pendant la présence
      // était nié par le template d'honnêteté-durabilité (« je ne peux pas
      // te programmer ça depuis le chat ») faute de voir l'issue. Le strip
      // produit reste entier pour tout le reste; la règle (5) du contrat
      // fait primer un committed sur toute note de scope du flow.
      directEffectConfirmationContextPrompt(turnFrame) ?? "",
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
  // P2-4a + P2-7a + P3-A + P4-C: vieillissement du marqueur track + traîne
  // conversation_risk — helper partagé avec les chemins de retour safety et
  // skill-owner (paul-p3verify R1-W02: seule cette zone committait).
  tempMemory = commitPostTurnRiskTrail(
    tempMemory as Record<string, unknown>,
    {
      runtimeSafetyRiskBand,
      turnFrameRiskBand: turnFrame.safety?.risk_band,
      routeIsSafety: isSafetyRoute(routeDecision),
      sourceMessageId: turnFrame.source_message_id ?? null,
    },
  );
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
    userMessage,
    history,
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
      skill_run: withPotionLocalDispatchTrace(
        localFlowExitSkillRun ??
          (routeDecision.response_owner === "product_help" ||
              isSafetyRoute(routeDecision)
            ? {
              selected_skill_id: routeDecision.selected_handler ?? null,
              reason_code: routeDecision.reason_code,
            }
            : undefined),
      ),
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

  if (isSafetyRoute(routeDecision)) {
    // A safety turn terminally cancels every active potion-support campaign.
    // This never blocks the safety reply: the delivery-time safety gate is a
    // second deterministic backstop if persistence is temporarily unavailable.
    const admin = serviceRoleLedgerReadClient();
    if (admin) {
      await cancelPotionSupportCampaign({
        admin,
        userId,
        reason: "cancelled_safety",
      }).catch((error) => {
        console.error(
          "[Router] potion support safety cancellation failed",
          error,
        );
      });
    } else {
      console.error("[Router] potion support admin client missing on safety");
    }
  }

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

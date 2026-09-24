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
// W2.A: le dispatcher local du sas potion et son état ne sont plus importés —
// le sas est débranché (le dossier du skill est supprimé en W2.B).
// RETRAIT RÉSIDUS (2026-08-08): l'import d'attack-keyword-support est parti
// avec le module et sa table `user_attack_cards` (décision humaine « retirer
// les deux », migration 20260808090000) — il n'avait plus aucun site d'appel.
// W2.A: mécanisme TRANSVERSE (companion + présence + safety), extrait du
// voisinage de `feature_opportunity` avant sa désactivation.
import {
  installSessionStyleCommitment,
  sessionStyleCommitmentsPromptBlock,
} from "../skills/_shared/session_style_commitment.ts";
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
import {
  initialSafetyContext,
  safetyPregateTraceForTurn,
} from "../safety/safety_context.ts";
import { applySafetyFloorToTurnFrame } from "../safety/safety_floor.ts";
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
  directEffectConfirmationContextPrompt,
  withDirectEffectConfirmationContext,
} from "./direct_effect_local_context.ts";
import { runResearchGroundingLane } from "./research_grounding.ts";
import {
  sessionDecisionsPromptBlock,
  withSessionDecision,
} from "./session_decisions.ts";
import {
  executedToolsForStatus,
  type OperationRuntimeResult,
} from "./effect_ledger_adapter.ts";
import { summarizeEffectLedgerForTrace } from "./effect_ledger.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  buildSafetyCrisisActivationNoteInformation,
  isSafetyRoute,
  runtimeSafetyContextForTurn,
} from "./safety_crisis_runtime.ts";
import {
  closeOpenReengagementEpisodeForSafety,
  closeReengagementEpisodeFromFlow,
  markReengagementEpisodeEntered,
} from "../../_shared/reengagement_episodes.ts";
// W2.A: `runFeatureOpportunitySkill` n'est plus importé — la lane est
// débranchée du routage (le dossier du skill est supprimé en W2.B).
import { runSafetyCrisisSkill } from "../skills/safety_crisis/skill.ts";
import {
  safetyCrisisOneShotDirectEffectDecision,
  runSafetyCrisisLocalDispatcher,
} from "../skills/safety_crisis/local_dispatcher.ts";
import type { SafetyCrisisLocalDispatcherOutput } from "../skills/safety_crisis/contract.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";
import type { ActiveConversationSkillWorkingState } from "../skills/_shared/active_skill_state.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  type MemoryV2ActiveLoaderResult,
  runMemoryV2ActiveLoader,
} from "../../_shared/memory/runtime/active_loader.ts";
// ─────────────────────────────────────────────────────────────────────────────
// W4.7 — CÂBLAGE DE LA BOUCLE CONVERSATIONNELLE KEEL
//
// Tout ce qui suit existait déjà, écrit et testé, avec ZÉRO appelant hors de
// ses propres tests: `buildKeelPlanContext`, les deux effets durables et leurs
// exécuteurs write-through, le plancher TCA et son runtime, le skill
// `plan_question`. Un module que rien n'appelle n'est pas une fonctionnalité,
// c'est un document — et le défaut GRAVE de W4 était exactement là: un élève
// KEEL qui écrivait « j'ai pris mon magnésium » produisait zéro effet durable.
// Ce lot ne réécrit aucun de ces modules; il branche les quatre maillons.
// ─────────────────────────────────────────────────────────────────────────────
import { slotKeyNamedIn } from "../../_shared/keel/slot_from_message.ts";
import {
  readExplicitConversationLocale,
  readPersistedConversationLocale,
  resolveResponseLocale,
  withPersistedConversationLocale,
} from "../../_shared/keel/locale.ts";
import {
  armMealPrecisionQuestion,
  runMealPrecisionLane,
} from "./keel_meal_precision_lane.ts";
import { armPhotoInvitation } from "./keel_photo_invitation_lane.ts";
import {
  profileRedirectFor,
  ruleQuestionRedirectFor,
  sizingRedirectFor,
} from "../../_shared/keel/conversation_redirect.ts";
import {
  loadRulesFor,
  ruleQuestionContextBlock,
  rulesMentioning,
  usableFoodWord,
} from "../../_shared/keel/rule_question.ts";
import {
  appHelpContextBlock,
  appHelpTopicsAllowed,
  loadAppHelpViewer,
  photoTopicsIn,
  selectAppHelpTopics,
  UNKNOWN_APP_HELP_VIEWER,
} from "../../_shared/keel/app_help/block.ts";
import type { PrecisionPlanLine } from "../../_shared/keel/meal_precision.ts";
import type { MealPrecisionFlowState } from "../../_shared/keel/meal_precision_flow.ts";
import {
  applyMealPrecisionFlowState,
  readMealPrecisionFlowState,
} from "../../_shared/keel/meal_precision_flow_state.ts";
import {
  escalateRestrictionSignal,
  evaluateRestrictionForStudent,
} from "../../_shared/keel/restriction_runtime.ts";
// Détecteur d'intention future déjà écrit et testé pour `track_progress`
// (P12-F). Une seconde implémentation, c'est deux lexiques qui divergent.
import { isTrackProgressFutureIntent } from "../tools/always_on/track_progress_plan_item/intake.ts";
import {
  type DisorderedEatingWorkingState,
} from "../skills/disordered_eating_guard/contract.ts";
import {
  type DisorderedEatingSkillRuntime,
  runDisorderedEatingGuardSkill,
} from "../skills/disordered_eating_guard/skill.ts";
import {
  type PlanQuestionSkillRuntime,
  runPlanQuestionSkill,
} from "../skills/plan_question/skill.ts";
// ⚠️ LA MÊME RÉSOLUTION QUE LE RESOLVER, ET C'EST TOUT L'INTÉRÊT DE L'IMPORTER
// plutôt que de retester la chaîne ici: un gate qui juge « nommé » sur une
// autre règle que celle qui juge « lisible » laisse passer exactement ce qui
// tombe entre les deux. Voir le gate de routage plus bas.
import { resolveFoodGroupToken } from "../skills/plan_question/swap_resolver.ts";
// FF-056 — la divergence constatée. Continuation seule: l'épisode est ouvert
// hors conversation par le batch du soir, et relu EN BASE à chaque tour.
import {
  runWeightDivergenceSkill,
  type WeightDivergenceSkillRuntime,
} from "../skills/weight_divergence/skill.ts";
import { classifyDivergenceReply } from "../skills/weight_divergence/local_dispatcher.ts";
import {
  advanceEpisode,
  loadLiveEpisode,
  type WeightDivergenceEpisodeRow,
} from "../../_shared/keel/weight_divergence_io.ts";
import {
  buildActionSpace,
  planFingerprint,
  recommendationAction,
  RECOMMENDATION_ACTION_IDS,
} from "../../_shared/keel/daily_recommendation.ts";
import { loadRhythm } from "../../_shared/keel/daily_recommendation_io.ts";
import type { PlanQuestionChangeRequest } from "../skills/plan_question/contract.ts";
import {
  weekStartOfLocalDate,
  writeDeclaredBodyMeasure,
} from "../../_shared/keel/week_review_io.ts";
import { detectDeclaredBodyMeasure } from "../../_shared/keel/body_measure_floor.ts";
import { detectHungerReport } from "../../_shared/keel/hunger_signal.ts";
import { writeHungerReport } from "../../_shared/keel/hunger_signal_io.ts";
import { EMPTY_DAY_FACTS } from "../../_shared/keel/daily_recap.ts";
import { detectDeclaredSafetyConstraint } from "../../_shared/keel/safety_constraint_floor.ts";
import {
  observeSafetyFallback,
  SAFETY_FALLBACK_TAG,
} from "../../_shared/keel/safety_fallback_counter.ts";
import { detectDeclaredMedicalCondition } from "../../_shared/keel/medical_condition_floor.ts";
import {
  detectDeclaredMeal,
  type MealDeclarationHit,
} from "../../_shared/keel/meal_declaration_floor.ts";
import { floorSilencedWriteForTurn } from "../../_shared/keel/floor_silenced_write.ts";
import { recordTurnLedger } from "../../_shared/keel/turn_ledger.ts";
import {
  recordCommittedEffect,
  recordFailedEffect,
} from "./effect_ledger.ts";

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 5a DU DÉCOUPAGE — DES MODULES SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique :
//   · le contexte de tour KEEL (MAILLON 1) et l'épisode du plancher TCA (MAILLON 5) → `keel_turn_context.ts`
//   · `finalVisibleText` et ses ceintures (`strip*`, `ensure*`) → `run_output_guards.ts`
//   · le ledger KEEL, la lane des effets durables (MAILLON 3) et `readKeelDayResolution` → `keel_direct_effect_lane.ts`
//   · le runtime de `plan_question` (MAILLON 4), `keelOutageTemplate` et `withKeelDoctrineBlock` → `keel_prompt_blocks.ts`
// `processMessage` reste ici, entier. Tout ce que ce fichier exportait est
// ré-exporté ci-dessous : aucun appelant ne change d'import. Les tests qui
// lisent le TEXTE de ce fichier lisent la famille entière
// (`scripts/source-families.json`). Aucun de ces modules n'importe ce fichier.

import {
  applyDisorderedEatingEpisodeState,
  conversationalRestrictionGuardForRouters,
  disorderedEatingWorkingStateForTurn,
  loadKeelTurnContext,
} from "./keel_turn_context.ts";
import {
  finalVisibleText,
} from "./run_output_guards.ts";
import {
  effectLedgerForOperationRuntime,
  mealDeclarationFloorEffect,
  mealFloorNetArms,
  persistEffectLedgerForRuntimeTurn,
  runKeelDirectEffectLane,
} from "./keel_direct_effect_lane.ts";
import {
  keelOutageTemplate,
  loadPlanQuestionRuntime,
  withKeelDoctrineBlock,
  writePlanQuestionChangeRequest,
} from "./keel_prompt_blocks.ts";
export {
  applyDisorderedEatingEpisodeState,
  conversationalRestrictionGuardForRouters,
  disorderedEatingWorkingStateForTurn,
  KEEL_DISORDERED_EATING_STATE_KEY,
  LEGACY_KEEL_TURN_CONTEXT,
  loadKeelTurnContext,
} from "./keel_turn_context.ts";
export type {
  KeelDisorderedEatingEpisodeState,
  KeelTurnContext,
} from "./keel_turn_context.ts";
export {
  appendMealPrecisionQuestion,
  ensureClarifyQuestionVisible,
  ensureCommittedRenderParity,
  finalVisibleText,
  stripCommitClaimBeforeClarify,
  stripForeignScriptTokens,
  stripKeelAckWithoutCommittedEffect,
  stripRetractedSessionMention,
  stripTrackClaimWithoutCommit,
  stripUnfoundedReminderCapacityDenial,
} from "./run_output_guards.ts";
export {
  effectLedgerTraceForTest,
  keelBindableCommitmentIds,
  mealDeclarationFloorEffect,
  mealFloorNetArms,
  recordKeelDirectEffectsInLedger,
  runKeelDirectEffectLane,
} from "./keel_direct_effect_lane.ts";
export type {
  KeelDirectEffectLaneInput,
} from "./keel_direct_effect_lane.ts";
export {
  keelOutageTemplate,
  resolvePlanQuestionCommitmentId,
  withKeelDoctrineBlock,
} from "./keel_prompt_blocks.ts";

function envFlagEnabled(name: string): boolean {
  const raw = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function buildTurnFrameForRuntime(args: {
  dispatcherInput: RunDispatcherInput;
  skipGlobalDispatcherForActiveLocalFlow: boolean;
  llmRunner?: DispatcherLlmRunner;
}): Promise<TurnFrame> {
  const frame = args.skipGlobalDispatcherForActiveLocalFlow
    ? buildNeutralTurnFrame(args.dispatcherInput)
    : await runDispatcher({
      ...args.dispatcherInput,
      llm_runner: args.llmRunner,
    });
  // W3.1 — THE FLOOR. Single choke point for every frame the runtime uses
  // (LLM frame, repair pass, neutral frame for an active local flow): the
  // deterministic pregate band is re-imposed here. The LLM may raise the band,
  // never lower it. Idempotent.
  const safetyContext = args.dispatcherInput.safety_context_output;
  return applySafetyFloorToTurnFrame(
    frame,
    safetyContext?.pregate ?? null,
    safetyContext?.floor_observations,
  );
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
  // DEMOLITION B2C (2026-08-06): plus aucune lane conversationnelle ne se
  // ré-injecte depuis une note de sortie locale. Un mémo résiduel retombe en
  // réponse normale, ce qui est le bon défaut.
  void focus;
  void confidenceBand;

  return {
    ...args.turnFrame,
    note_information: note as any,
    skill_signals: skillSignals,
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

  // W4.7 — MAILLON 1. Rôle KEEL, projection du plan, plancher TCA du tour.
  // Une seule passe, avant le dispatcher: le bloc plan doit exister au moment
  // où le prompt est construit, et le plancher au moment où la route est
  // calculée. Un utilisateur legacy paie une lecture `profiles` et rien
  // d'autre (`loadKeelTurnContext` sort immédiatement).
  // `let` et non `const`: le plancher de déclaration de maladie, plus bas,
  // renseigne `declared_medical_condition` sur ce contexte — le chargeur, lui,
  // ne voit pas le message du tour.
  let keelTurn = await loadKeelTurnContext({
    supabase,
    userId,
    userMessage,
    userLocalDatetime: userTime?.user_local_datetime ?? null,
    legacyPlanSnapshot: planItemSnapshot,
  });
  if (keelTurn.is_student) {
    console.log(
      `[keel] request_id=${requestId} keel_student` +
        ` plan_context=${keelTurn.plan_context_reason_code}` +
        ` commitments_today=${
          keelTurn.plan_context?.counts.scheduled_today ?? 0
        }` +
        ` restriction=${
          keelTurn.restriction === null
            ? `unavailable:${keelTurn.restriction_unavailable_reason}`
            : String(keelTurn.restriction.restriction_flag)
        }`,
    );
  }

  // W9/R3 — LE POINT UNIQUE de décision de la langue de réponse. Résolue ici,
  // une fois, chez le propriétaire du tour, puis DESCENDUE dans chaque lane.
  // Aucune autre couche ne résout, ne devine, ni ne code une langue en dur:
  // huit lanes appelaient `resolveResponseLocale({})` — une chaîne de priorité
  // sans aucune entrée, donc une langue décidée par son repli.
  //
  // `tenantDefault` attend sa source (`coaches.default_student_locale`), et
  // `detectedRecent` n'a DÉLIBÉRÉMENT pas de producteur: la détection par
  // message est exactement le mode d'oscillation que R3 nomme. Les deux sont
  // `null` déclarés, pas des champs oubliés.
  //
  // L1 — `studentProfile` EST LA MOITIÉ DU DÉSARMEMENT DE L'ÉPINGLE.
  // `PILOT_FORCED_LOCALE` retiré, cette chaîne ne portait TOUJOURS aucune
  // entrée venant de l'élève: un élève `fr-FR` sans ancre serait tombé sur le
  // repli final `en-US`. `keelTurn.content_locale` est `profiles.locale`, lu
  // une fois par tour (`loadKeelTurnContext`, une seule requête profils) —
  // aucun aller-retour de plus. Il vaut `null` hors élève KEEL (coach, compte
  // legacy): ces tours-là gardent le repli `en-US`, et c'est déclaré.
  const responseLocale = resolveResponseLocale({
    userExplicit: readExplicitConversationLocale(tempMemory),
    persisted: readPersistedConversationLocale(tempMemory),
    studentProfile: keelTurn.content_locale,
    tenantDefault: null,
    detectedRecent: null,
  });
  // ET ON L'ANCRE IMMÉDIATEMENT, sur le fil, pour TOUS les chemins de sortie.
  //
  // C'est la moitié de la ceinture qui manquait: l'écriture ne vivait que dans
  // `companion.ts`, donc un tour possédé par une skill (`product_help`,
  // `weekly_review`, la lane TCA…) résolvait une langue et ne committait rien.
  // Au tour suivant, `persisted` relisait vide, la chaîne retombait sur son
  // repli, et le fil changeait de langue — l'oscillation que R3 nomme, ouverte
  // par le simple fait qu'une skill avait pris la main.
  //
  // Écrire ICI, au point de résolution, plutôt qu'à chaque sortie: un chemin
  // de sortie qu'on oublie est une ancre perdue, et il y en a huit.
  tempMemory = withPersistedConversationLocale(tempMemory, responseLocale);
  state = { ...(state as any), temp_memory: tempMemory };

  // W3.1 — deterministic pregate on the CURRENT message. Publishes the floor
  // the LLM frame can raise but never sink below (safety/safety_floor.ts).
  const safetyContextOutput = initialSafetyContext({
    channel,
    user_message: userMessage,
    user_id: userId,
  });
  const recentMessagesForTurnFrame = [
    ...recentChatMessagesFromHistory(
      history,
      RECENT_MESSAGE_LIMITS.conversationRepair,
    ),
    ...(userMessage.trim()
      ? [{ role: "user" as const, content: userMessage.trim() }]
      : []),
  ];

  // W2.A/W2.B: le SAS D'ADMISSION POTION a été débranché puis supprimé. Il
  // possédait la réponse sémantique AVANT le dispatcher global (dispatcher
  // local 5 sorties, promotion vers Présence, annulation durable de
  // campagne). Le tour va désormais directement au dispatcher global.

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
        // LES JOURS NOMMÉS, DÉJÀ RÉSOLUS. Sans cette ligne, le modèle n'avait
        // le jour courant que dans la prose de `user_local_human` et devait
        // faire l'arithmétique lui-même: un JEUDI, « jeudi soir » ressortait en
        // 2026-08-07 (vendredi) une passe sur deux.
        named_day_calendar: userTime.named_day_calendar,
      }
      : undefined,
    plan_snapshot: planItemSnapshot,
    // W4.7 — MAILLON 1 (suite). Non null ⇒ le payload du dispatcher porte le
    // plan KEEL et RIEN du legacy, et les lanes KEEL (2 effets durables +
    // plan_question) deviennent énonçables dans le prompt.
    keel_plan_context: keelTurn.plan_block,
    // …et le RÔLE, qui commande l'assemblage du prompt système. Distinct du
    // bloc plan ci-dessus, exprès: `routers.ts` ferme les trois lanes B2C sur
    // ce même drapeau, pas sur la présence d'un plan. Les deux doivent voir le
    // même utilisateur, sinon le prompt décrit une lane que la route jette.
    keel_student: keelTurn.is_student,
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

  // ══════════════════════════════════════════════════════════════════════
  // PLANCHER DE DÉCLARATION D'ALLERGIE — la ligne médicale ne dépend pas
  // d'un tirage du dispatcher.
  //
  // MESURÉ (QA WEB L3, run réel):
  //   élève  : « I'm allergic to peanuts, badly »
  //   Sophia : « I'll treat peanuts as a hard avoid going forward. »
  //   base   : student_safety_constraints → 0 ligne
  //   frame  : direct_effects: []
  // Le MÊME message en français avait écrit la ligne. Ce n'est donc pas une
  // panne, c'est un tirage — et le contenu perdu est médical.
  //
  // Le plancher n'ÉCRASE jamais le dispatcher: si le frame porte déjà un
  // `declare_safety_constraint`, on ne touche à rien (son payload est plus
  // riche — sévérité nuancée, notes, intention de rétractation). Il ne
  // s'ajoute que sur un silence, ce qui est exactement la définition d'un
  // plancher.
  //
  // Même famille et même place que le plancher TCA et le gate `plan_question`:
  // ce qui OUVRE un effet médical ne transite pas par le LLM du dispatcher.
  // FF-009 — LE FAIT DÉTERMINISTE DU TOUR, hissé hors du bloc parce que le
  // FILET (plus bas, après la lane d'effets) en a besoin: le plancher ne peut
  // s'effacer devant la demande du dispatcher que si cette demande ABOUTIT, et
  // ça ne se sait qu'une fois l'écriture tentée.
  let floorDeclaredMeal: MealDeclarationHit | null = null;

  if (keelTurn.is_student) {
    // ── PLANCHER DE DÉCLARATION DE REPAS ────────────────────────────────────
    //
    // MESURÉ (QA WEB L3-bis), la MÊME phrase jouée 4 fois:
    //   « Poulet grillé, riz complet et brocolis à midi »        → [0,3,3,0]
    //   « Grilled salmon with quinoa and green beans for dinner » → [0,0,0,0]
    // pendant que la réponse CONFIRMAIT le repas. Une déclaration complète, au
    // passé, sans ambiguïté n'était donc écrite qu'une fois sur deux — sur la
    // donnée qui fait le produit, celle que le coach lit le lundi.
    //
    // Même forme que le plancher d'allergie juste en dessous, et pour la même
    // raison: l'instabilité sur une phrase IDENTIQUE prouve un tirage, pas une
    // règle. Il n'écrase JAMAIS le dispatcher — il ne s'ajoute que sur un
    // silence, ce qui est la définition d'un plancher.
    const declaredMeal = detectDeclaredMeal(
      userMessage,
      slotKeyNamedIn(userMessage),
    );
    floorDeclaredMeal = declaredMeal;
    const mealAlreadyRequested = turnFrame.direct_effects.some(
      (effect) => effect.effect_type === "log_protocol_event",
    );

    // ── FF-009 · LA RELATION AU PLAN NE S'EFFACE PAS DEVANT LE DISPATCHER ───
    //
    // 🔴 DÉFAUT MESURÉ EN RUN RÉEL (2026-08-08, stack locale, vrai modèle).
    //   élève  : « j'ai commandé une pizza ce soir »
    //   frame  : le dispatcher AVAIT demandé un `log_protocol_event`
    //            (`food_group_ref = fried_food`, déduit de « pizza »)
    //   base   : `plan_relation = NULL`
    // Le plancher s'était effacé — c'est sa règle — et la relation au plan
    // était perdue AU MOMENT EXACT où le message la portait le plus clairement.
    //
    // La correction est la même que celle du plancher de maladie, pour la même
    // raison: `plan_relation` est une CLASSIFICATION DÉTERMINISTE que le
    // dispatcher n'émet jamais. Il n'y a donc rien à écraser — on complète
    // l'effet qu'il a demandé au lieu d'ajouter le nôtre à côté, ce qui
    // dupliquerait le fait.
    //
    // ⚠️ CE N'EST PAS UN PLANCHER QUI DEVIENT UN REMPLAÇANT: si le dispatcher
    // n'a rien demandé, le plancher pose son propre effet comme avant. Ici il
    // ne fait qu'AJOUTER une colonne à une demande existante.
    if (declaredMeal?.planRelation && mealAlreadyRequested) {
      console.warn("[keel] plan_relation attached to the dispatcher's effect", {
        request_id: requestId,
        plan_relation: declaredMeal.planRelation,
        off_plan_matched: declaredMeal.offPlanMatched,
        detail:
          "le dispatcher avait déjà demandé le log; la relation au plan est " +
          "déterministe et lui manquait. Sans ceci, un hors-plan est " +
          "indiscernable d'un repas cuisiné dès que le modèle parle le premier.",
      });
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.map((effect) =>
          effect.effect_type === "log_protocol_event"
            ? {
              ...effect,
              payload_hint: {
                ...(effect.payload_hint && typeof effect.payload_hint === "object" &&
                    !Array.isArray(effect.payload_hint)
                  ? effect.payload_hint as Record<string, unknown>
                  : {}),
                plan_relation: declaredMeal.planRelation,
              },
            }
            : effect
        ),
      };
    }

    if (declaredMeal && !mealAlreadyRequested) {
      console.warn("[keel] meal_declaration_floor raised", {
        request_id: requestId,
        gate: declaredMeal.gate,
        components: declaredMeal.components.map((c) => c.food_group_ref),
        matched: declaredMeal.components.map((c) => c.matched),
        // FF-009. `off_plan` avec zéro composant est le CAS NOMINAL du
        // hors-plan (« j'ai commandé »), pas une anomalie de log.
        plan_relation: declaredMeal.planRelation,
        off_plan_matched: declaredMeal.offPlanMatched,
        detail:
          "le dispatcher n'avait demandé aucun log_protocol_event; le plancher " +
          "déterministe l'ajoute. Un repas confirmé sans ligne est un accusé " +
          "fantôme sur la donnée centrale du produit.",
      });
      turnFrame = {
        ...turnFrame,
        direct_effects: [
          ...turnFrame.direct_effects,
          mealDeclarationFloorEffect(declaredMeal),
        ],
      };
    }

    // ── FF-008 · LE PLANCHER DE MESURE CORPORELLE ANNONCÉE ───────────────────
    //
    // Même forme, même place et même raison que le plancher de repas juste
    // au-dessus — avec un enjeu qui n'est PAS le même.
    //
    // Ce n'est pas une commodité: `restriction_guard` détecte
    // `rapid_weight_loss` sur des poids hebdomadaires, et un élève qui annonce
    // sa perte DANS LE CHAT et seulement là est un élève dont la perte rapide
    // n'est jamais détectée. Ouvrir ce chemin sans brancher la ceinture, ce
    // serait désarmer une garde en croyant ajouter une commodité (FF-007 R5).
    //
    // TROIS DIFFÉRENCES AVEC SES VOISINS, toutes assumées:
    //
    //  1. IL ÉCRIT LUI-MÊME, il ne pose pas d'effet sur le frame. La mesure ne
    //     va pas dans `protocol_events` mais sur la ligne de semaine, là où le
    //     point du dimanche la range — il n'existe donc aucun `effect_type` à
    //     demander, et en inventer un forkerait le schéma pour une écriture
    //     qui a déjà son chemin (`week_review_io`). R9 (« ne rien faire si le
    //     frame porte déjà l'effet ») est vide par construction: aucun effet du
    //     dispatcher n'écrit une mesure corporelle.
    //
    //  2. IL RÉ-ÉVALUE LA CEINTURE. `loadKeelTurnContext` a évalué le plancher
    //     TCA AVANT que cette mesure n'existe. Sans re-lecture, la ceinture ne
    //     verrait le poids qu'au tour suivant — soit exactement le tour où
    //     l'élève annonce une perte de 3 %/semaine et reçoit une réponse
    //     normale. `keelRoutingInputs()` est calculé plus bas, donc la
    //     ré-évaluation arrive à temps pour la route.
    //
    //  3. IL S'ARRÊTE SUR UN MINEUR. Un mineur n'a pas de cible
    //     nutritionnelle; il n'a pas non plus de suivi de poids (FF-008 §7).
    //     `weekPlanAgeGate` mord déjà ailleurs et le chat ne crée pas une porte
    //     latérale.
    const declaredMeasure = detectDeclaredBodyMeasure(
      userMessage,
      keelTurn.display_unit_system,
    );
    if (declaredMeasure && keelTurn.age_verdict?.status === "minor") {
      console.warn("[keel] body_measure_floor refused (minor student)", {
        request_id: requestId,
        kind: declaredMeasure.kind,
        detail:
          "un mineur n'a pas de suivi de poids: la mesure n'est pas enregistrée " +
          "et n'est pas mentionnée.",
      });
      // LE CANAL — la seconde moitié de « et n'est pas mentionnée ».
      //
      // Jusqu'ici, ce refus n'existait QUE dans ce `console.warn`. Le composeur
      // recevait le message brut de l'élève et répondait « 78 kg is now your
      // current weight » — mesuré 3/3, à un mineur, sur une ligne qui n'existe
      // pas. La règle qui l'interdisait vivait dans le prompt.
      recordTurnLedger({
        ledger: keelTurn.turn_ledger,
        isKeelStudent: keelTurn.is_student,
        entry: {
          subject: "body_measure",
          outcome: "refused",
          reason_code: "minor_no_weight_tracking",
          stored_value_si: null,
        },
      });
    } else if (declaredMeasure) {
      // Liés en locaux: le compilateur ne sait pas rétrécir un champ de
      // `keelTurn`, qui est un `let` réassigné plus bas.
      const measureLocalDate = keelTurn.local_date;
      const measureLocale = keelTurn.content_locale;
      const weekStart = measureLocalDate
        ? weekStartOfLocalDate(measureLocalDate)
        : null;
      if (!weekStart || !measureLocalDate || !measureLocale) {
        // Sans date locale on ne sait pas DANS QUELLE SEMAINE ranger la mesure,
        // et sans locale persistée la ligne mentirait sur la langue de sa
        // prose (R2). Les deux se nomment plutôt que de se deviner.
        console.warn("[keel] body_measure_floor could not write", {
          request_id: requestId,
          reason: !weekStart ? "missing_local_date" : "missing_content_locale",
        });
        recordTurnLedger({
          ledger: keelTurn.turn_ledger,
          isKeelStudent: keelTurn.is_student,
          entry: {
            subject: "body_measure",
            outcome: "failed",
            reason_code: !weekStart
              ? "missing_local_date"
              : "missing_content_locale",
            stored_value_si: null,
          },
        });
      } else {
        try {
          const written = await writeDeclaredBodyMeasure(supabase, {
            userId,
            weekStart,
            kind: declaredMeasure.kind,
            valueSi: declaredMeasure.valueSi,
            // L'instant du tour en heure LOCALE de l'élève, résolue par le
            // runtime. Jamais `new Date()`: un fait dont la date dépend du
            // serveur qui l'a écrit est la famille de bugs nocturnes que ce
            // dépôt a déjà payée.
            measuredAt: userTime?.user_local_datetime ?? measureLocalDate,
            // FF-031 — le JOUR de l'élève, tel que le runtime l'a déjà résolu.
            // La table datée groupe dessus; le recalculer depuis `measuredAt`
            // referait, mal, une conversion de fuseau déjà faite juste.
            localDate: measureLocalDate,
            contentLocale: measureLocale,
            // Les mots de l'élève, pour qu'une mesure qui arme une ceinture
            // reste relisible.
            studentNote: declaredMeasure.studentNote,
          });
          console.warn("[keel] body_measure_floor raised", {
            request_id: requestId,
            kind: declaredMeasure.kind,
            unit: declaredMeasure.unit,
            unit_source: declaredMeasure.unitSource,
            matched: declaredMeasure.matched,
            outcome: written.outcome,
            // La valeur RELUE, pas celle qu'on a envoyée.
            stored_value: written.storedValue,
            week_start: weekStart,
            // FF-031 — la mesure DATÉE est la source de vérité; le miroir
            // hebdomadaire au-dessus n'est plus que le repli transitoire. Si
            // ce drapeau est faux, la ceinture lit encore le miroir mais la
            // série quotidienne, elle, a perdu un point.
            dated_measure_written: written.datedMeasureWritten,
            dated_measure_issue: written.datedMeasureIssue,
            detail:
              "mesure annoncée en conversation, écrite comme mesure datée et " +
              "dans le miroir hebdomadaire. La ceinture est ré-évaluée sur ce tour.",
          });

          // LE CANAL — et c'est `written.storedValue`, la valeur RELUE, jamais
          // celle qu'on a envoyée. T-1 en une ligne: « Got it — 78, not 87 »
          // était vrai pour le composeur (l'élève avait dit 78) et faux pour la
          // personne (la base porte 87). Seule la valeur relue tranche.
          recordTurnLedger({
            ledger: keelTurn.turn_ledger,
            isKeelStudent: keelTurn.is_student,
            entry: {
              subject: "body_measure",
              outcome: "written",
              reason_code: written.outcome,
              stored_value_si: typeof written.storedValue === "number"
                ? written.storedValue
                : null,
            },
          });

          // LA MOITIÉ QUI FAIT LA FICHE (FF-008 R7). Sans elle, on aurait
          // ajouté un chemin d'écriture et laissé la ceinture aveugle.
          try {
            const rearmed = await evaluateRestrictionForStudent(
              supabase as never,
              {
                userId,
                asOfLocalDate: measureLocalDate,
                turnMessage: userMessage,
                turnLocale: measureLocale,
              },
            );
            if (
              rearmed.restriction_flag !== keelTurn.restriction?.restriction_flag
            ) {
              console.warn("[keel] restriction guard re-evaluated after a chat measure", {
                request_id: requestId,
                was: keelTurn.restriction?.restriction_flag ?? null,
                now: rearmed.restriction_flag,
                triggers: rearmed.triggers.map((t) => t.code),
              });
            }
            keelTurn = { ...keelTurn, restriction: rearmed };
          } catch (error) {
            // Même arbitrage fail-open NOMMÉ que le chargeur: une panne de
            // lecture n'enferme pas tous les élèves dans le flow clinique. Le
            // verdict d'avant le tour reste en place, et l'incident est
            // bruyant.
            console.warn(
              "[keel] restriction guard re-evaluation failed after a chat measure",
              error,
            );
          }
        } catch (error) {
          // R7 de FF-008 §7: l'erreur REMONTE du chargeur et est journalisée
          // ici. Elle n'interrompt pas le tour — un élève privé de réponse
          // parce que son poids n'a pas pu s'écrire perdrait deux fois — mais
          // elle est journalisée en `error`, pas en `warn`: c'est une donnée
          // de sécurité qui n'a pas atteint la base.
          console.error("[keel] body_measure_floor WRITE FAILED", {
            request_id: requestId,
            kind: declaredMeasure.kind,
            week_start: weekStart,
            error: error instanceof Error ? error.message : String(error),
            detail:
              "la mesure annoncée n'a PAS été enregistrée; la ceinture ne la " +
              "verra pas. Le tour continue sans elle.",
          });
          // LE CANAL — et ici il fait plus que documenter: sans lui, le tour
          // continuait « sans elle » côté base ET « avec elle » côté prose. Le
          // composeur accusait réception d'une écriture qui venait d'échouer.
          recordTurnLedger({
            ledger: keelTurn.turn_ledger,
            isKeelStudent: keelTurn.is_student,
            entry: {
              subject: "body_measure",
              outcome: "failed",
              reason_code: "write_failed",
              stored_value_si: null,
            },
          });
        }
      }
    }

    // ── FF-027 · LE PLANCHER DE LA FAIM DÉCLARÉE ─────────────────────────────
    //
    // Le tap du soir attrape la faim de ceux qui tapent. Ceux qui l'écrivent en
    // passant — « j'ai eu trop faim ces derniers jours » — n'étaient nulle part,
    // et FF-027 §3 exige que les deux sources produisent LE MÊME signal.
    //
    // TROIS TRAITS QU'IL FAUT LIRE ENSEMBLE:
    //
    //  1. IL ÉCRIT LUI-MÊME, comme le plancher de mesure corporelle juste
    //     au-dessus. Le fait ne va pas dans `protocol_events` (ce n'est pas un
    //     repas) mais dans `student_hunger_reports`, où le décompte fenêtré le
    //     lira. Il n'y a donc aucun `effect_type` à demander, et en inventer un
    //     forkerait le schéma pour une écriture qui a déjà son chemin.
    //
    //  2. IL NE PRODUIT AUCUN TEXTE VISIBLE, et c'est la fiche, pas une
    //     omission. §3: « pas de conversation sur la faim ». R5: sous plancher
    //     de restriction, le signal s'enregistre, la satiété s'applique et RIEN
    //     ne s'affiche — ce qui est vrai ici pour tout le monde, donc vrai sans
    //     branche conditionnelle à oublier. Un accusé serait de surcroît un
    //     accusé sur un fait dont l'élève n'a rien demandé.
    //
    //  3. IL N'EST PAS DANS `direct_effects`, DONC LA BANDE DE SÉCURITÉ NE
    //     L'AVALE PAS. Sous `safety_band`, `direct_effects_to_run` est vidé et
    //     une déclaration passée par le frame est PERDUE (défaut transverse T-7,
    //     mesuré 3/3 sur FF-017). Écrire directement est ce qui rend R5
    //     réalisable: la seule adaptation compatible avec le plancher est aussi
    //     la seule que ce chemin sait produire.
    //
    // Il ne lit pas l'horloge: la date du fait est la journée LOCALE de l'élève,
    // résolue par le runtime. Sans elle, on ne sait pas dans quelle fenêtre
    // ranger le jour, et on préfère ne rien écrire à écrire au mauvais jour.
    const declaredHunger = detectHungerReport(userMessage);
    if (declaredHunger) {
      const hungerLocalDate = keelTurn.local_date;
      if (!hungerLocalDate) {
        console.warn("[keel] hunger_signal_floor could not write", {
          request_id: requestId,
          reason: "missing_local_date",
          detail:
            "faim déclarée reconnue mais la journée locale de l'élève est " +
            "inconnue: un jour de faim rangé au mauvais jour fausserait la " +
            "fenêtre de récurrence.",
        });
      } else {
        try {
          const written = await writeHungerReport(supabase, {
            userId,
            localDate: hungerLocalDate,
            matched: declaredHunger.matched,
            studentNote: declaredHunger.studentNote,
            contentLocale: keelTurn.content_locale,
          });
          console.warn("[keel] hunger_signal_floor raised", {
            request_id: requestId,
            gate: declaredHunger.gate,
            matched: declaredHunger.matched,
            local_date: hungerLocalDate,
            outcome: written.outcome,
            detail:
              "faim déclarée en conversation, écrite comme un jour de faim. " +
              "Elle compte comme un tap du soir à la prochaine composition. " +
              "Aucune réponse n'en parle: FF-027 §3.",
          });
        } catch (error) {
          // Le tour continue. Un élève privé de réponse parce que son jour de
          // faim n'a pas pu s'écrire perdrait deux fois — mais l'incident est
          // journalisé en `error`, pas en `warn`: le signal n'a pas atteint la
          // base, donc la composition suivante ne le verra pas.
          console.error("[keel] hunger_signal_floor WRITE FAILED", {
            request_id: requestId,
            gate: declaredHunger.gate,
            local_date: hungerLocalDate,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // ── LE PLANCHER DE DÉCLARATION DE MALADIE ────────────────────────────────
    //
    // Même forme et même raison que les deux planchers voisins: ce qui OUVRE
    // une posture ne transite pas par le LLM du dispatcher. Mesuré le
    // 2026-08-05 — « je suis diabétique de type 2, je mange quoi ? » recevait un
    // protocole prescriptif complet, renvoi clinicien FR 0/3 et EN 1/3, et
    // `student_safety_constraints` restait vide.
    //
    // Il ne DÉCIDE pas la réponse: il lève un drapeau que
    // `withKeelDoctrineBlock` traduit en `CLINICAL_DEFERRAL_BLOCK`.
    const declaredCondition = detectDeclaredMedicalCondition(userMessage);
    if (declaredCondition) {
      console.warn("[keel] medical_condition_floor raised", {
        request_id: requestId,
        condition_ref: declaredCondition.condition_ref,
        matched: declaredCondition.matched,
        detail:
          "déclaration de maladie détectée par le plancher déterministe; le " +
          "bloc de déférence clinique est injecté pour ce tour.",
      });
      keelTurn = {
        ...keelTurn,
        declared_medical_condition: declaredCondition.condition_ref,
      };

      // ET LA LIGNE, parce que le bloc seul ne fait que gouverner CE tour.
      // Sans persistance, la génération de plan, la doctrine et la synthèse du
      // coach continuent d'ignorer la maladie — c'est la moitié « après
      // génération » du verrou, celle qui manquait aussi.
      //
      // `severity: 'medical'` par construction: c'est la seule sévérité que la
      // ceinture de sortie traite comme non négociable, et une maladie
      // déclarée n'est pas une préférence.
      // ⚠️ LE PLANCHER REMPLACE, IL NE S'EFFACE PAS DEVANT LE DISPATCHER.
      //
      // Première version: le plancher n'ajoutait son effet que si le
      // dispatcher n'en avait demandé aucun. Mesuré le 2026-08-06 — 7 lignes
      // sur 44 (16 %, dont 6 en français) écrites par le dispatcher étaient
      // DIFFORMES: `allergen_ref='diabetes'`, `substance_ref='glucose'`,
      // `allergen_ref='diabetes_type_2'`. Une maladie rangée dans la case des
      // aliments à éviter, ce qui ARME LA CEINTURE DE SORTIE sur son nom.
      //
      // Conséquence mesurée en run réel, et c'est la pire de la campagne: un
      // message d'urgence — « take fast-acting glucose now and call emergency
      // services » — a été REMPLACÉ par un refus poli. Et l'élève dont le
      // `allergen_ref` valait `diabetes` ne pouvait plus parler de sa maladie
      // du tout: cul-de-sac.
      //
      // Le plancher, lui, connaît la forme juste (`kind='medical'` +
      // `condition_ref`). Quand il a détecté une maladie, c'est SA demande qui
      // fait foi: on retire les `declare_safety_constraint` du tour et on pose
      // la sienne. Un tirage de LLM ne corrige pas un plancher déterministe.
      const displaced = turnFrame.direct_effects.filter(
        (effect) => effect.effect_type === "declare_safety_constraint",
      );
      if (displaced.length > 0) {
        console.warn("[keel] medical_condition_floor displaced dispatcher effect", {
          request_id: requestId,
          condition_ref: declaredCondition.condition_ref,
          displaced: displaced.length,
          detail:
            "le dispatcher rangeait la maladie dans une case d'aliment; la " +
            "forme du plancher (kind=medical + condition_ref) fait foi.",
        });
      }
      {
        turnFrame = {
          ...turnFrame,
          direct_effects: [
            ...turnFrame.direct_effects.filter(
              (effect) => effect.effect_type !== "declare_safety_constraint",
            ),
            {
              effect_type: "declare_safety_constraint",
              explicitness: "explicit",
              target_status: "identified",
              confidence_band: "high",
              payload_hint: {
                kind: "medical",
                condition_ref: declaredCondition.condition_ref,
                severity: "medical",
                notes: declaredCondition.notes,
              },
            },
          ],
        };
      }
    }

    const declared = detectDeclaredSafetyConstraint(userMessage);
    const alreadyRequested = turnFrame.direct_effects.some(
      (effect) => effect.effect_type === "declare_safety_constraint",
    );
    if (declared && !alreadyRequested) {
      console.warn("[keel] safety_constraint_floor raised", {
        request_id: requestId,
        allergen_ref: declared.allergen_ref,
        matched: declared.matched,
        detail:
          "le dispatcher n'avait pas demandé l'effet; le plancher déterministe " +
          "l'ajoute. Un accusé sans ligne est le pire des trois états.",
      });
      turnFrame = {
        ...turnFrame,
        direct_effects: [
          ...turnFrame.direct_effects,
          {
            effect_type: "declare_safety_constraint",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              intent: "declare",
              kind: declared.kind,
              allergen_ref: declared.allergen_ref,
              severity: declared.severity,
              notes: declared.notes,
            },
          },
        ],
      };
    }
  }

  let currentActiveSkillState = activeFlowState.activeSkillState;
  const presenceFlowEnabled = envFlagEnabled("SOPHIA_PRESENCE_FLOW_ENABLED");
  // W4.7 — MAILLONS 4 & 5. Les deux entrées KEEL du routeur (`keel_student`
  // qui rend `plan_question` atteignable, `restriction_guard` qui ouvre le
  // plancher TCA DANS la conversation) sont calculées en UN seul endroit et
  // appliquées aux QUATRE appels. Leçon P3 de ce dépôt: un gate posé sur le
  // seul chemin nominal est un gate troué — un re-dispatch de sortie de flow
  // perdrait le plancher au tour exact où il compte.
  // ── FF-056 — L'ÉPISODE DE DIVERGENCE VIVANT ─────────────────────────────
  //
  // ⚠️ LU EN BASE, ET PAS DANS `temp_memory`. `user_chat_states.temp_memory` a
  // DEUX écrivains concurrents en lecture-modification-écriture complète (le
  // tour texte et le chemin photo): le dernier gagne. Un épisode qu'on peut
  // perdre est un épisode qui reste ouvert pour toujours — et l'index unique
  // de la table ferait alors taire ce mécanisme définitivement pour cette
  // personne, en silence. La table EST l'état.
  //
  // Le coût est une lecture indexée par tour, sur un index PARTIEL
  // (`weight_divergence_one_open_per_user`, `where state in
  // ('proposed','in_flow')`): il ne contient que les épisodes vivants, c'est-à-
  // dire presque rien.
  //
  // FAIL-CLOSED VERS LE SILENCE, ET NOMMÉ. Une lecture en panne rend « pas
  // d'épisode »: le pire cas est une réponse qui atterrit dans la conversation
  // normale (l'épisode expirera tout seul à J+2). L'inverse — router vers un
  // flow dont on n'a pas pu lire l'épisode — ouvrirait une conversation sur le
  // poids de quelqu'un sur la foi d'une erreur.
  let weightDivergenceEpisode: WeightDivergenceEpisodeRow | null = null;
  try {
    weightDivergenceEpisode = await loadLiveEpisode(supabase as never, userId);
  } catch (error) {
    console.warn("[weight_divergence] live episode unreadable", error);
  }

  const keelRoutingInputs = () => ({
    keel_student: keelTurn.is_student,
    restriction_guard: conversationalRestrictionGuardForRouters({
      restriction: keelTurn.restriction,
      tempMemory,
      userMessage,
    }),
    weight_divergence_episode: { live: weightDivergenceEpisode !== null },
  });
  let routeDecision = runConversationRouters({
    turn_frame: turnFrame,
    active_skill_state: currentActiveSkillState,
    safety_context_risk_band: safetyContextOutput.risk_band,
    presence_flow_enabled: presenceFlowEnabled,
    ...keelRoutingInputs(),
  });

  // ── Mot de bascule (carte d'attaque): détection déterministe ─────────────
  // Le mot est DYNAMIQUE (keyword_trigger.activation_keyword de chaque carte
  // active), jamais codé en dur. Pré-gate sans DB: seul un message qui se
  // réduit à UN mot autorisé peut être un mot de bascule — les tours normaux
  // ne paient aucune lecture. La safety garde la priorité absolue: une route

  // ── Flow présence: transition calculée AVANT tout runtime ────────────────
  // Sur une SORTIE (tool_pull / topic_change / closure / expired), le tour
  // est re-dispatché globalement immédiatement (charte cmd 17): le user qui
  // demande une carte atterrit dans coaching CE tour-ci, pas au suivant.
  // Le commit de l'état (poubelle ou maintien) reste fait post-génération.
  // Entrée présence atteinte via la sortie d'un AUTRE flow local (ex: coaching
  // → exit_to_global_dispatcher sur dépôt discursif → re-dispatch → présence).
  // Le bloc de transition ci-dessus a tourné avant la boucle des owners: il
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

  // ── UNE MALADIE DÉCLARÉE RÉORIENTE LA ROUTE VERS LE COMPOSEUR ────────────
  //
  // `withKeelDoctrineBlock` — donc le bloc de déférence clinique — n'a qu'UN
  // appelant: le composeur. La lane `plan_question` rend AVANT lui, avec un
  // gabarit anglais codé en dur qui promet « I have passed your question to
  // them », un canal 1:1 coach → élève qui N'EXISTE PAS, et qui classe un
  // diabète en `contract_change_requests reason_code='dislikes_food'`.
  //
  // ⚠️ ON RÉÉCRIT LA ROUTE, ON NE SAUTE PAS LA LANE. Première tentative:
  // ignorer la lane et « tomber » vers le composeur. Mesuré 6/6 déterministe —
  // HTTP 500 et AUCUNE réponse, parce que la ceinture inversée plus bas
  // (`handler débranché`) throw précisément sur un `response_owner` de lane qui
  // n'a pas exécuté son skill. Cette ceinture a raison d'exister; il fallait
  // changer l'owner, pas la contourner. L'élève qui déclarait sa maladie en
  // posant une question de plan n'obtenait plus rien du tout.
  //
  // LA CONDITION EST LA CONTRAINTE PERSISTÉE, pas seulement le plancher du
  // tour: `declared_medical_condition` ne vaut qu'au tour de la déclaration, et
  // la lane revenait dès le tour suivant avec son faux canal (mesuré 5/9).
  const hasKnownCondition = Boolean(keelTurn.declared_medical_condition) ||
    (keelTurn.safety_constraints ?? []).some((c) =>
      Boolean(String(c.conditionRef ?? "").trim())
    );
  if (routeDecision.response_owner === "plan_question" && hasKnownCondition) {
    console.warn("[keel] plan_question rerouted for medical condition", {
      request_id: requestId,
      condition_ref: keelTurn.declared_medical_condition,
      from_persisted: !keelTurn.declared_medical_condition,
      detail:
        "la lane rend avant le composeur, donc avant le bloc de déférence " +
        "clinique, et promet un canal coach inexistant.",
    });
    routeDecision = { ...routeDecision, response_owner: "normal_reply" };
  }

  // ── FF-016 §7 — SANS CIBLE, IL N'Y A PAS DE TIER 0: LA QUESTION REPART AU
  //    CHEMIN GÉNÉRAL.
  //
  // MESURÉ EN RUN RÉEL LE 2026-08-08, élève avec plan publié et protocole
  // publié, 3/3 en anglais ET 3/3 en français, sur « What should I eat for
  // breakfast? » / « Je mange quoi au petit-dej ? » — c'est-à-dire le CRITÈRE
  // D'ACCEPTATION §8 de la fiche, mot pour mot:
  //   - le dispatcher classe la question `plan_question` / `food_swap`;
  //   - il ne capte AUCUN `requested_food_group` (il n'y en a pas: personne
  //     n'a proposé de remplacement), et aucune ligne ne se laisse identifier;
  //   - le resolver sort `unresolved_food_group` — sa PREMIÈRE branche, celle
  //     qui existe pour l'hallucination de slug — et la lane escalade;
  //   - l'élève reçoit « That one sits outside what your coach set on this
  //     line », qui ne répond pas à sa question et lui parle d'une ligne qu'il
  //     n'a pas évoquée;
  //   - et une ligne `contract_change_requests` part chez le coach, classée
  //     `reason_code='dislikes_food'`, pour une question qui n'exprimait aucun
  //     dégoût.
  //
  // La lane n'a donc RIEN à résoudre, et elle ne le sait pas: sans slug
  // demandé et sans ligne identifiée, aucune des branches de `resolveTier0Swap`
  // ne peut décider quoi que ce soit. §7 de la fiche le dit déjà pour le cas
  // voisin (« aucun engagement ouvert aujourd'hui ⇒ pas de Tier 0; la question
  // repart au chemin général »); c'est la même absence de cible.
  //
  // ⚠️ CE QUE CE GATE NE FAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE. Il ne touche
  // PAS la dégradation délibérée du slug illisible: le prompt du dispatcher
  // promet qu'un `requested_food_group` qu'il n'a pas su nommer « dégrade en
  // escalade nommée » plutôt qu'en autorisation fausse. Cette promesse tient
  // dès qu'UN des deux groupes est nommé — c'est là qu'il y a une substitution
  // à refuser. Le gate ne mord que sur l'absence des DEUX.
  //
  // RESTE OUVERT, ET CONSIGNÉ: `commitment_not_identified` (un groupe nommé,
  // aucune ligne à qui le rattacher) escalade toujours, alors que §7 range ce
  // cas au chemin général lui aussi. On ne l'a pas élargi ici parce que ce
  // n'est pas ce qui a été mesuré, et qu'y toucher ferait tomber au composeur
  // de vraies demandes de substitution.
  //
  // Il est DÉTERMINISTE: il ne lit que le signal du tour, jamais une décision
  // du modèle. Ce qui FERME une lane ne transite pas plus par le LLM que ce
  // qui l'ouvre.
  // ══════════════════════════════════════════════════════════════════════════
  // LA LANE `plan_question` N'EXISTE PAS SANS PLAN DE COACH — 2026-09-08
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Elle résout un embranchement DANS un plan publié par un coach: une
  // substitution autorisée ou non, une `swap_policy`, une escalade. Tout cela
  // se lit dans `keel_plan_context`, qui vient de `plan_versions` et
  // `plan_commitments` — la lane 1:1, gardée exprès et qui N'EST PAS le modèle
  // du produit. Un foyer B2C n'a aucune de ces lignes: le contexte est vide, et
  // il n'y a littéralement rien à résoudre.
  //
  // Le prompt le dit déjà (règle 6-bis: « UNIQUEMENT si le payload porte
  // keel_plan_context, sinon la lane n'existe pas »). ⚠️ MAIS LE DIRE NE SUFFIT
  // PAS: cette lane capture une part importante des tours, et une consigne de
  // prompt n'est pas une garde. Un signal émis quand même faisait entrer un
  // tour dans une lane dont chaque lecture rend vide — et la réponse partait
  // sans le bloc de plan du foyer, qui, lui, est là.
  //
  // ⛔ ON NE SUPPRIME PAS LA SKILL. `skills/plan_question/` sert la lane 1:1 du
  // coach, gardée exprès (MODEL.md), et `run.ts` en importe cinq symboles. On
  // ferme la ROUTE quand sa matière est absente, exactement comme les deux
  // gardes voisines (`plan_question_no_target_general_path`,
  // `plan_question_no_named_swap_general_path`) — même idiome, même endroit,
  // même retombée sur le chemin général.
  if (
    routeDecision.response_owner === "plan_question" &&
    keelTurn.plan_block === null
  ) {
    console.warn("[keel] plan_question sans plan de coach → chemin général", {
      request_id: requestId,
      detail:
        "aucun `keel_plan_context`: ni commitment ni swap_policy à lire. Le " +
        "chemin général porte, lui, le bloc du plan composé (foyer ou solo).",
    });
    routeDecision = {
      ...routeDecision,
      response_owner: "normal_reply",
      reason_code: "plan_question_no_coach_plan_b2c",
    };
  }

  if (routeDecision.response_owner === "plan_question") {
    const pqContext = turnFrame.skill_signals.plan_question?.context;
    // LA SIGNATURE EXACTE DE « CE N'EST PAS UNE SUBSTITUTION »: personne n'a
    // nommé de remplacement, et rien de ce qu'on remplacerait ne se retrouve
    // dans le plan LU EN BASE. Une vraie question de substitution porte
    // toujours au moins un des deux — « j'ai plus de saumon, je fais quoi ? »
    // porte le prescrit sans le demandé, et elle doit continuer d'escalader.
    // ⚠️ `"null"` EN CHAÎNE EST UNE VALEUR ABSENTE, ET ELLE ARRIVE VRAIMENT.
    // Mesuré 1 fois sur 6 le 2026-08-08: `"requested_food_group": "null"` —
    // le modèle a écrit le mot au lieu du littéral JSON. Le resolver le rendra
    // de toute façon illisible (`parseFoodGroupRef` jette), donc le traiter
    // comme rempli ne fait qu'une chose: rouvrir la lane sur du vide.
    const absentGroup = (value: unknown): boolean => {
      const raw = String(value ?? "").trim().toLowerCase();
      return raw === "" || raw === "null" || raw === "none" || raw === "n/a";
    };
    // ── « NOMMÉ » ET « LISIBLE » DOIVENT ÊTRE LA MÊME QUESTION ─────────────
    //
    // Ce test portait sur la CHAÎNE (vide, "null", "none", "n/a"). Le resolver,
    // lui, teste la VALIDITÉ (`parseFoodGroupRef`). Entre les deux il restait
    // une fente, et elle était habitée:
    //
    // MESURÉ LE 2026-08-13, run `doctrine5` passe 2, sur « avec deux repas
    // seulement, mes protéines je les cale comment ? » — une question de
    // MÉTHODE, aucun remplacement demandé. Le dispatcher a rempli
    // `requested_food_group` d'un jeton qui n'est pas un slug `food_groups`.
    // Pour ce gate il était « nommé » (chaîne non vide), donc le gate s'est
    // tu; pour le resolver il était illisible, donc `unresolved_food_group` —
    // la branche écrite pour l'hallucination de slug — et l'escalade est
    // repartie, avec sa ligne `contract_change_requests` en `dislikes_food`.
    //
    // Un jeton qui ne résout sur AUCUN groupe ne nomme aucun remplacement.
    // C'est la même phrase que la fiche, appliquée avec la même règle des deux
    // côtés — et elle absorbe les quatre chaînes de l'ancien test, qui ne
    // résolvent pas davantage.
    //
    // ⚠️ ON NE PERD PAS LA PROMESSE « UN SLUG ILLISIBLE NE DEVIENT JAMAIS UN
    // OUI ». Le chemin général n'autorise rien: il porte le bloc doctrine, le
    // bloc protocole, les contraintes dures en PREMIER bloc et le verrou
    // déterministe de sortie. Ce qui disparaît, c'est une escalade vers un
    // coach à qui on demandait d'arbitrer un mot que personne n'a écrit.
    const noRequestedGroup =
      resolveFoodGroupToken(String(pqContext?.requested_food_group ?? "")) === null;
    // ⚠️ LE PRESCRIT EST VÉRIFIÉ CONTRE LE PLAN, PAS CRU SUR PAROLE.
    //
    // Mesuré le 2026-08-08 sur « What should I eat for breakfast? », 3 fois
    // sur 6: le dispatcher remplit `prescribed_food_group: "whole_grain"` chez
    // un élève dont AUCUNE ligne ne porte ce groupe. Le signal n'était donc
    // pas la trace d'une ligne visée, mais une invention — et elle suffisait à
    // rouvrir la lane et à renvoyer l'élève vers « cette ligne » chez son
    // coach. Un groupe absent du plan ne désigne aucune ligne à substituer:
    // c'est §7 mot pour mot, et le contexte plan est lu en base, pas écrit par
    // le modèle.
    const planGroups = new Set(
      [
        ...(keelTurn.plan_context?.today ?? []),
        ...(keelTurn.plan_context?.week ?? []),
      ]
        .map((line) => String(line.food_group_ref ?? "").trim())
        .filter((group) => group !== ""),
    );
    const prescribed = String(pqContext?.prescribed_food_group ?? "").trim();
    const noGroundedPrescription = absentGroup(prescribed) ||
      !planGroups.has(prescribed);
    // `eating_out` et `meal_shifted` sont EXCLUS: ils n'ont jamais de groupe
    // par construction, et leur escalade vers le coach est le comportement
    // voulu de la fiche — les faire tomber ici les supprimerait. `other` entre,
    // lui: c'est le fourre-tout du dispatcher, et il a servi une fois sur six
    // à ce même faux positif de petit-déjeuner.
    const gateableKind = pqContext?.kind === "food_swap" ||
      pqContext?.kind === "other";
    if (gateableKind && noRequestedGroup && noGroundedPrescription) {
      console.warn("[keel] plan_question sans cible → chemin général", {
        request_id: requestId,
        reason: pqContext?.reason ?? null,
        detail:
          "ni groupe demandé ni ligne identifiable: la lane escaladait une " +
          "question générale d'alimentation en demande de changement de " +
          "contrat. FF-016 §7.",
      });
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        reason_code: "plan_question_no_target_general_path",
      };
    }

    // ── FF-010 — « ON MANGE QUOI CE SOIR ? » N'EST PAS UNE DEMANDE DE
    //    CHANGEMENT DE CONTRAT.
    //
    // MESURÉ EN RUN RÉEL LE 2026-08-08, quatre foyers provisionnés, 4 passes
    // sur 8 (ana 2/2, « On mange quoi ce soir ? » 1/2, rich 1/2, solo 1/2):
    // le dispatcher classe la question la plus évidente de l'app
    // `plan_question` / kind=`eating_out` — la personne n'est pourtant nulle
    // part ailleurs qu'à sa cuisine — le resolver Tier 0 sort
    // `unresolved_food_group` faute de groupe, et l'élève reçoit:
    //   « That one sits outside what your coach set on this line […] Your
    //     question is with them now, word for word. »
    // Relu en base: `contract_change_requests` avec `reason_code='social_event'`,
    // `commitment_id: null`, `slot_key: null`, `commitment_title: null` — une
    // escalade qui ne nomme AUCUNE ligne, chez un coach qui n'a pas de canal
    // 1:1 pour y répondre (MODEL.md). Et `full_chars` du prompt compagnon vaut
    // `null` sur ces passes: la lane rend AVANT le composeur, donc le bloc
    // foyer — chargé, filtré, exact — est jeté sans avoir servi.
    //
    // ⚠️ SA CONDITION N'EST PAS CELLE DE FF-016, ET LA DIFFÉRENCE EST LE SUJET.
    // FF-016 exige l'absence des DEUX groupes; ce gate n'exige que l'absence du
    // groupe DEMANDÉ. Mesuré après la première version de ce gate (qui reprenait
    // les deux conditions): sur « What do I need to cook today? », le dispatcher
    // remplit `prescribed_food_group: "non_starchy_veg"` — un groupe qui EXISTE
    // vraiment dans le plan d'Ana — donc `noGroundedPrescription` est faux, les
    // deux gates se taisent, et l'escalade repart (relu:
    // `conversation_turn_traces` du 2026-08-08 08:51:19, escalade
    // `dislikes_food` sur « Vegetables at lunch »). Le prescrit ne discrimine
    // rien ici: « qu'est-ce que je cuisine aujourd'hui ? » TOUCHE la ligne du
    // coach sans proposer de la remplacer.
    //
    // ── CE QUE CETTE DIFFÉRENCE COÛTE, ET POURQUOI ELLE EST PRISE ────────────
    // FF-016 garde exprès l'escalade sur « prescrit sans demandé » (« j'ai plus
    // de saumon, je fais quoi ? »): l'élève a nommé un aliment qu'il n'a pas.
    // Cette même forme, chez quelqu'un dont le foyer a composé un plat pour ce
    // soir, part maintenant au chemin général. C'est assumé et borné:
    //   · le champ de tir est étroit — il faut un foyer ET un plat composé
    //     AUJOURD'HUI; sans l'un des deux, tout se comporte comme avant;
    //   · aucune ceinture ne dépend de cette lane: les contraintes dures sont le
    //     2ᵉ bloc du prompt, le verrou de doctrine est déterministe en sortie,
    //     et le bloc foyer porte son propre LECTURE SEULE;
    //   · en face, le défaut mesuré est une escalade qui ne nomme AUCUNE ligne
    //     et une phrase qui fait attendre l'élève après un canal 1:1 qui
    //     n'existe pas — la copie la plus souvent violée du produit (MODEL.md).
    //
    // Il est DÉTERMINISTE et lit deux faits persistés — le contexte foyer
    // chargé en base et l'absence de cible dans le signal —, jamais une
    // décision du modèle: ce qui FERME une lane ne transite pas plus par le LLM
    // que ce qui l'ouvre.
    // ── LA CONDITION EST « IL A UN FOYER », PAS « IL A UN PLAT CE SOIR » ─────
    // Mesuré avec la borne au plat composé, 9 passes sur 9 en foyer SANS plat
    // du jour (plan retiré, puis fenêtre finie hier): la lane reprenait la
    // main et rendait « Your question is with them now ». Or c'est EXACTEMENT
    // le cas que R6 nomme — « sans plan composé: on le DIT, et on porte vers la
    // composition » —, et le bloc foyer porte déjà la consigne littérale pour
    // ce cas (« NOTHING IS COMPOSED FOR TODAY … NEVER say their coach is
    // preparing anything »). Faire dépendre le gate du plat, c'était le
    // désarmer précisément là où la fiche l'exige.
    // ── LE FOYER N'ÉTAIT PAS LA CONDITION, IL ÉTAIT LE DÉCOR OÙ ON L'A VU ───
    //
    // Ce gate exigeait `keelTurn.household !== null`. La borne était prudente
    // — le défaut avait été mesuré sur quatre foyers — mais elle ne décrit
    // rien de ce qui rend l'escalade fausse: « je dîne quoi ce soir ? » ne
    // désigne aucune ligne du coach, qu'on cuisine pour six ou pour soi.
    //
    // MESURÉ LE 2026-08-13, run `doctrine5`, cinq élèves SANS foyer, cinq
    // coachs aux doctrines opposées (rapport
    // `qa-run-reports/2026-08-13-doctrine-5-coachs.md`): sur « il est 19h et je
    // n'ai rien prévu, tu me donnes un dîner rapide ? », QUATRE des cinq ont
    // reçu la MÊME phrase, au caractère près:
    //   « That one sits outside what your coach set on this line […] Your
    //     question is with them now, word for word. »
    // Doctrine chargée sur les quatre (`keel.doctrine.variant → reason:
    // "loaded", beliefs_kept: 3/3`) et jetée sans avoir servi. 16 tours sur 42
    // capturés ainsi, 18 lignes `contract_change_requests` écrites.
    //
    // POURQUOI LE GATE FF-016 NE LES ATTRAPAIT PAS: il exige l'absence des
    // DEUX groupes, et le dispatcher remplissait `prescribed_food_group:
    // "lean_protein"` — un groupe qui EXISTE dans `plan_commitments`. C'est
    // exactement le cas que le commentaire de FF-010 décrit vingt lignes plus
    // haut (« Le prescrit ne discrimine rien ici »). La correction avait été
    // écrite; seule sa portée était trop étroite.
    //
    // CE QUE ÇA COÛTE, ET C'EST LE MÊME ARBITRAGE QU'EN FOYER: « j'ai plus de
    // saumon, je fais quoi ? » (prescrit nommé, demandé absent) part désormais
    // au chemin général pour tout le monde. Ce n'est pas une bonne réponse
    // perdue — c'était déjà la même escalade anglaise qui nomme une ligne que
    // l'élève n'a pas évoquée. En face, le chemin général porte le bloc
    // doctrine, le bloc protocole et le verrou déterministe de sortie.
    // Une VRAIE substitution (« du riz à la place des pâtes ») nomme son
    // remplacement, donc `noRequestedGroup` est faux et la lane garde la main.
    if (routeDecision.response_owner === "plan_question" && noRequestedGroup) {
      console.warn("[keel] plan_question sans remplacement nommé → chemin général", {
        request_id: requestId,
        kind: pqContext?.kind ?? null,
        household_id: keelTurn.household?.householdId ?? null,
        dishes_today: keelTurn.household?.todayDishes.length ?? 0,
        detail:
          "le signal ne désigne aucun remplacement: la lane escaladait « on " +
          "mange quoi ce soir ? » en demande de changement de contrat. " +
          "FF-010 §7 et R6, élargi hors foyer le 2026-08-13.",
      });
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        reason_code: "plan_question_no_named_swap_general_path",
      };
    }

    // ── CE QUE LE COACH A DÉJÀ TRANCHÉ NE S'ESCALADE PAS VERS LUI ───────────
    //
    // `plan_question` existe pour arbitrer ce que le coach n'a PAS décidé: sa
    // `swap_policy` et son `autonomy` sur une ligne. Un aliment qu'il a
    // explicitement écarté de sa méthode est, lui, une question CLOSE — et la
    // renvoyer chez lui dit à l'élève l'exact contraire de la vérité.
    //
    // MESURÉ LE 2026-08-13 (même run), sur trois coachs et trois aliments que
    // leur propre doctrine exclut nommément:
    //   · « j'ai envie de poulet ce soir » → « volaille is outside what your
    //     coach set for the protéines maigres line » chez un coach dont la
    //     première conviction est « aucune chair animale n'entre dans une
    //     assiette », et qui exclut `poultry` en `coach_food_rules` ET en
    //     `coach_food_items`;
    //   · « un plat préparé industriel, c'est jouable ? » → même phrase, chez
    //     le coach « zéro ultra-transformé »;
    //   · « des pâtes au dîner ? » → même phrase, chez le coach dont la
    //     doctrine interdit les féculents le soir.
    // Trois fois sur trois, l'élève s'entend répondre « ton coach n'a pas
    // tranché, ta question part chez lui » sur une position que son coach a
    // écrite trois fois.
    //
    // ⚠️ DÉTERMINISTE, ET SUR DES SLUGS, PAS SUR DE LA PROSE. On compare le
    // groupe demandé au mapping PUBLIÉ (`coach_food_rules`, déjà chargé sur ce
    // tour dans `keelTurn.protocol` — aucune lecture de plus). Les interdits en
    // prose (`doctrine.forbidden`) ne sont pas lus ici: ils ont déjà leur
    // verrou déterministe en sortie, et le matcher de prose n'a rien à faire
    // dans une décision de routage.
    //
    // ⚠️ CE N'EST PAS UNE COUCHE DE SÉCURITÉ. Un `excluded` de coach est une
    // sévérité de MÉTHODE. Les allergies restent dans `safety_constraints`,
    // et le chemin général porte les contraintes dures en PREMIER bloc — donc
    // rien de médical ne dépend de ce gate, dans un sens ni dans l'autre.
    //
    // ⚠️ `discourage` ENTRE, `encourage` NON. Déconseiller est une position
    // tranchée (« il ne construit pas avec ça »); encourager ne ferme aucune
    // question de substitution.
    if (routeDecision.response_owner === "plan_question") {
      const requestedSlug = String(pqContext?.requested_food_group ?? "")
        .trim()
        .toLowerCase();
      const coachRuledOut = requestedSlug !== "" &&
        (keelTurn.protocol?.compiled ?? []).some((line) =>
          (line.preview.kind === "exclude" || line.preview.kind === "discourage") &&
          String(line.preview.group).toLowerCase() === requestedSlug
        );
      if (coachRuledOut) {
        console.warn("[keel] plan_question sur un aliment déjà écarté → chemin général", {
          request_id: requestId,
          kind: pqContext?.kind ?? null,
          requested_food_group: requestedSlug,
          coach_id: keelTurn.protocol?.coachId ?? null,
          detail:
            "le coach a écarté ce groupe dans son protocole publié: la " +
            "question est TRANCHÉE, elle ne s'escalade pas vers lui. La " +
            "doctrine répond au chemin général.",
        });
        routeDecision = {
          ...routeDecision,
          response_owner: "normal_reply",
          reason_code: "plan_question_coach_already_ruled_general_path",
        };
      }
    }
  }

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

  const operationPipeline = await runOperationRuntimePipeline({
    supabase,
    userId,
    responseLocale,
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
  // W4.7 — MAILLON 3. Les deux effets durables KEEL, sur la MÊME lane que
  // track_progress: la route a déjà tranché (gate default-deny, blocages
  // safety/crise/TCA appliqués par `routers.ts`), l'exécuteur écrit et RELIT,
  // le ledger compte, le renderer n'accuse que le committé. Le résultat est
  // fusionné dans `operationRuntime` puis reporté sur le frame, donc le
  // contrat de confirmation du composeur voit l'issue réelle — c'est ce qui
  // interdit le « je l'ai noté » sans ligne (classe phantom-commit).
  // LA CORRECTION D'UNE PHOTO AMENDE, ELLE N'AJOUTE PAS.
  //
  // Avant la lane suivante, parce que c'est elle qui doit être désarmée: quand
  // l'élève corrige la lecture de sa photo (« non c'était du poulet »),
  // `log_protocol_event` y voit une information alimentaire et écrit une
  // SECONDE ligne. Un repas mangé une fois, deux faits chez le coach.
  //
  // ICI et pas dans la lane: `tempMemory` et `routeDecision` sont des locaux
  // vivants à cet endroit. Écrire l'état depuis la lane serait écrasé par la
  // réécriture complète de `temp_memory` en fin de tour.
  //
  // `hasMedia: false` est EXACT et non un raccourci: une nouvelle photo ne
  // traverse pas le cerveau, elle passe par `meal-photo-upload-v1`, qui
  // rouvre le flow sur le nouvel `event_id` — donc le même effet que la sortie
  // `new_photo` du reducer, obtenu par le seul chemin que la photo emprunte.
  const mealPrecisionTurnClock = new Date();
  /**
   * Le flow de précision à RÉ-APPLIQUER après la génération.
   *
   * Le companion reconstruit `temp_memory` depuis l'état PRÉ-routing
   * (`agents/companion.ts :: nextTempMemory`), donc tout état posé pendant le
   * tour est effacé au moment de la persistance. Même véhicule et même remède
   * que `sessionStyleCommitmentHintForTurn`.
   */
  let mealPrecisionFlowToCommit:
    | { flow: MealPrecisionFlowState | null; detectedFoods: string[] }
    | null = null;
  const mealPrecisionLane = await runMealPrecisionLane({
    supabase,
    userId,
    userMessage,
    hasMedia: false,
    tempMemory,
    safetyBand: turnFrame?.safety?.risk_band,
    now: mealPrecisionTurnClock,
    requestId,
  });
  tempMemory = mealPrecisionLane.tempMemory;
  // La FERMETURE du flow doit survivre à la reconstruction post-génération au
  // même titre que son ouverture. Mesuré: sans ça, un flow amendé rouvrait au
  // tour suivant avec `turns` figé à 0 — il ne pouvait donc plus jamais
  // atteindre son max-tours et ne se fermait qu'au timeout de 30 minutes,
  // pendant lesquelles chaque phrase de l'élève devenait un amendement.
  if (mealPrecisionLane.flowToCommit !== undefined) {
    mealPrecisionFlowToCommit = {
      flow: mealPrecisionLane.flowToCommit,
      detectedFoods: mealPrecisionLane.detectedFoods,
    };
  }
  if (mealPrecisionLane.amended) {
    console.log(
      `[keel] request_id=${requestId} meal_precision_amended` +
        ` events=${mealPrecisionLane.amended.eventIds.join(",")}` +
        ` kind=${mealPrecisionLane.amended.amendment}` +
        ` cleared_credit=${
          mealPrecisionLane.amended.clearedCreditEventIds.length
        }`,
    );
  }
  if (mealPrecisionLane.suppressLogProtocolEvent && routeDecision) {
    // La CORRECTION n'ajoute rien: retirer l'effet est ce qui empêche le
    // doublon de revenir par la porte que la lane vient de fermer.
    routeDecision = {
      ...routeDecision,
      direct_effects_to_run: routeDecision.direct_effects_to_run.filter(
        (effect) => effect !== "log_protocol_event",
      ),
    };
  }
  let keelDirectEffectRuntime = await runKeelDirectEffectLane({
    supabase,
    userId,
    userMessage,
    channel,
    turnFrame,
    routeDecision,
    tempMemory,
    keel: keelTurn,
    // La RÉPONSE à une question de précision peut ajouter des faits, mais
    // jamais réécrire ceux qu'elle précise: ces clés-là sont interdites à
    // l'intake, et ce qui reste est lié à la ligne d'origine.
    suppressComponentKeys: mealPrecisionLane.suppressComponentKeys,
    precisionAnswerTo: mealPrecisionLane.linkToEventId,
  });

  // ══════════════════════════════════════════════════════════════════════
  // FF-009 · LE FILET DU PLANCHER DE REPAS
  //
  // 🔴 DÉFAUT MESURÉ EN RUN RÉEL (2026-08-08, stack locale, vrai modèle,
  //    1 tour sur 10 sur « j'ai commandé une pizza margherita »):
  //      frame  : le dispatcher demande le log avec
  //               `food_group_ref: "pizza_margherita"` — un slug qu'il vient
  //               d'inventer, absent du vocabulaire fermé
  //      intake : `unknown_token` — et R7 refuse le payload ENTIER plutôt que
  //               de rabattre le jeton sur un voisin, ce qui est la bonne
  //               posture
  //      base   : ZÉRO ligne
  //      réponse: « A margherita pizza is mostly fine as a meal… »
  //
  // Le plancher s'était effacé — c'est sa règle quand le dispatcher a déjà
  // demandé l'effet — et il ne restait donc RIEN pour rattraper le refus. La
  // soirée hors plan disparaît au moment exact où le message la portait le
  // plus clairement, pendant que la réponse en parle. C'est l'accusé fantôme
  // que le plancher existe pour rendre impossible.
  //
  // LA RÈGLE QUE CE FILET RÉTABLIT: le plancher ne s'efface que devant une
  // demande qui ABOUTIT. Une demande refusée est un silence, et un silence
  // est exactement ce sur quoi le plancher est censé écrire.
  //
  // POURQUOI APRÈS, ET PAS AVANT. Prédire le refus reviendrait à réimplémenter
  // l'intake ici — et ce dépôt a déjà payé la copie locale d'une liste de
  // jetons (`effect_gate_orchestrator.ts`: une copie de la liste des effets
  // rejetait en silence tout effet ajouté sans double édition). On interroge
  // donc le résultat RÉEL de l'écriture, pas une prédiction.
  //
  // Il ne s'arme que sur les quatre refus de FORME et jamais sur un refus
  // JUSTE (`mealFloorNetArms`, dont le désarmement est la moitié du travail).
  if (
    mealFloorNetArms({
      floorHit: floorDeclaredMeal,
      committedEffects:
        (keelDirectEffectRuntime?.toolSkillRun.committed_effects ??
          []) as unknown[],
      blockedEffects:
        (keelDirectEffectRuntime?.toolSkillRun.blocked_effects ??
          []) as unknown[],
      suppressedByPrecision: mealPrecisionLane.suppressLogProtocolEvent === true,
    }) && floorDeclaredMeal !== null && keelDirectEffectRuntime !== null
  ) {
    const refused = keelDirectEffectRuntime;
    console.warn("[keel] meal_declaration_floor net", {
      request_id: requestId,
      reason: refused.toolSkillRun.reason,
      gate: floorDeclaredMeal.gate,
      plan_relation: floorDeclaredMeal.planRelation,
      components: floorDeclaredMeal.components.map((c) => c.food_group_ref),
      detail:
        "le payload du dispatcher a été refusé pour sa FORME et rien n'a été " +
        "écrit; le plancher rejoue son propre payload déterministe. Sans ce " +
        "filet, le fait est perdu pendant que la réponse en parle.",
    });
    const netRuntime = await runKeelDirectEffectLane({
      supabase,
      userId,
      userMessage,
      channel,
      // Le payload du modèle est REMPLACÉ, pas complété: c'est lui qui vient
      // d'être jugé illisible.
      turnFrame: {
        ...turnFrame,
        direct_effects: [mealDeclarationFloorEffect(floorDeclaredMeal)],
      },
      // ⚠️ `log_protocol_event` SEUL. Les deux autres effets de la lane ont
      // déjà tourné au premier passage; les relancer les doublerait.
      routeDecision: {
        ...routeDecision,
        direct_effects_to_run: ["log_protocol_event"],
      },
      tempMemory,
      keel: keelTurn,
      suppressComponentKeys: mealPrecisionLane.suppressComponentKeys,
      precisionAnswerTo: mealPrecisionLane.linkToEventId,
    });
    if (netRuntime) {
      // La COMPTABILITÉ reste vraie: le refus du modèle ne disparaît pas du
      // ledger sous prétexte que le filet a réussi. Deux tentatives, deux
      // traces, une seule ligne en base.
      keelDirectEffectRuntime = {
        ...netRuntime,
        toolSkillRun: {
          ...netRuntime.toolSkillRun,
          status: `${refused.toolSkillRun.status}+floor_net:${netRuntime.toolSkillRun.status}`,
          reason: `${refused.toolSkillRun.reason}+floor_net`,
          requested_effects: [
            ...(refused.toolSkillRun.requested_effects as unknown[]),
            ...(netRuntime.toolSkillRun.requested_effects as unknown[]),
          ],
          blocked_effects: [
            ...(refused.toolSkillRun.blocked_effects as unknown[]),
            ...(netRuntime.toolSkillRun.blocked_effects as unknown[]),
          ],
        },
      };
    }
  }

  if (keelDirectEffectRuntime) {
    operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
      directRuntime: keelDirectEffectRuntime,
      visibleRuntime: operationRuntime,
    });
    console.log(
      `[keel] request_id=${requestId} durable_effects` +
        ` handler=${keelDirectEffectRuntime.toolSkillRun.selected_handler}` +
        ` status=${keelDirectEffectRuntime.toolSkillRun.status}` +
        ` committed=${
          (keelDirectEffectRuntime.toolSkillRun.committed_effects as unknown[])
            .length
        }` +
        ` blocked=${
          (keelDirectEffectRuntime.toolSkillRun.blocked_effects as unknown[])
            .length
        }`,
    );
  }

  // LA QUESTION DE PRÉCISION — armée APRÈS l'écriture, jamais avant.
  //
  // « j'ai mangé du poulet » écrit un fait techniquement juste et pratiquement
  // inutilisable: le coach ne sait ni s'il y avait un féculent, ni comment
  // c'était cuit, et la ligne pèse dans la couverture comme si elle était
  // complète. On pose UNE question, et seulement si la réponse changerait ce
  // que le protocole du coach dit de ce repas (`assessMealPrecision`).
  //
  // ICI, et pas dans la lane: c'est le seul endroit où l'on tient à la fois les
  // lignes RELUES (`committed_effects`), le protocole du jour (`keelTurn`) et
  // `tempMemory` comme locaux vivants du tour. Le flow s'ouvre sur `tempMemory`
  // exactement comme la lane d'amendement écrit le sien — écrire ailleurs
  // serait écrasé par la réécriture de fin de tour.
  if (keelTurn.is_student && keelDirectEffectRuntime) {
    const committedFacts =
      (keelDirectEffectRuntime.toolSkillRun.committed_effects as unknown[])
        .filter((effect): effect is Record<string, unknown> =>
          Boolean(effect) && typeof effect === "object" && !Array.isArray(effect)
        )
        .filter((effect) => String(effect.type ?? "") === "log_protocol_event")
        .map((effect) => ({
          protocol_event_id: String(effect.protocol_event_id ?? ""),
          food_group_ref: effect.food_group_ref === null ||
              effect.food_group_ref === undefined
            ? null
            : String(effect.food_group_ref),
          substance_ref: effect.substance_ref === null ||
              effect.substance_ref === undefined
            ? null
            : String(effect.substance_ref),
          commitment_id: effect.commitment_id === null ||
              effect.commitment_id === undefined
            ? null
            : String(effect.commitment_id),
          slot_key: effect.slot_key === null || effect.slot_key === undefined
            ? null
            : String(effect.slot_key),
          // FF-025 — LA RELATION AU PLAN TELLE QUE LA BASE L'A RENDUE.
          // `executor.ts` la relit sur la ligne écrite et refuse le commit si
          // elle diverge de la demande: l'invitation s'adosse donc à un fait
          // dont le hors-plan est prouvé, jamais à une intention du modèle.
          plan_relation: effect.plan_relation === null ||
              effect.plan_relation === undefined
            ? null
            : String(effect.plan_relation),
        }));
    if (committedFacts.length > 0) {
      const planLines: PrecisionPlanLine[] =
        (keelTurn.plan_context?.today ?? []).map((line) => ({
          commitment_id: line.commitment_id,
          polarity: line.polarity,
          food_group_ref: line.food_group_ref,
          bucket: String(line.bucket),
          status: line.status,
          grain: line.grain,
          slot_kind: line.slot_kind,
        }));
      // ══════════════════════════════════════════════════════════════════
      // FF-025 · L'INVITATION À LA PHOTO — AVANT la question de précision.
      //
      // Les deux surfaces partagent UN budget (T4) et le lisent toutes les
      // deux avant qu'aucune n'écrive: l'ordre d'appel EST donc l'arbitrage,
      // et il n'y a pas de troisième endroit où le poser. L'invitation passe
      // d'abord SUR UN REPAS HORS PLAN uniquement — partout ailleurs son gate
      // rend `not_off_plan` sans lire la base, et la question de précision
      // garde la main entière.
      //
      // L'arbitrage, en une phrase: une photo répond à la composition, à la
      // préparation ET à l'accompagnement d'un seul geste de trois secondes,
      // là où la question textuelle n'ouvre qu'un axe et demande une phrase.
      // Sur le repas le plus pauvre du produit — « j'ai commandé », zéro
      // aliment — c'est la seule des deux qui peut remplir la ligne.
      // FF-021 R7 — LE DRAPEAU BRUT DU PLANCHER, pour les deux lanes de demande.
      //
      // `keelTurn.restriction`, PAS `conversationalRestrictionGuardForRouters`:
      // le second rend `null` une fois l'épisode clinique clos (condition de
      // désarmement du flow, doctrine P9), et la suppression des surfaces ne
      // suit PAS cette fermeture — « la CONVERSATION se ferme; la SUSPENSION,
      // non » (maillon 5, plus bas). Mesuré 3/3 avant ce raccord: plancher
      // levé + épisode clos ⇒ la question de précision repartait.
      //
      // `null` (lecture en panne) ne ferme PAS, et c'est le même arbitrage
      // fail-open NOMMÉ que le chargeur: un tour non filtré est un risque
      // borné, tous les élèves privés de réponse est une panne produit.
      const restrictionRaisedForAsks = keelTurn.restriction?.restriction_flag ===
        true;
      // FF-066 — UN TOUR D'AIDE NE PORTE PAS EN PLUS UNE INVITATION PHOTO. La
      // réponse porte déjà une chose (l'explication demandée), et une fiche
      // photo dirait deux fois « envoie une photo ». On n'arme pas, au lieu
      // d'armer puis retirer: armer consomme le budget partagé du jour
      // (`daily_ask_budget.ts`). Le refus est écrit au ledger comme les autres.
      const appHelpTurn = keelTurn.is_student === true &&
        turnFrame?.skill_signals?.app_help?.detected === true;
      const invitation = appHelpTurn
        ? {
          sentence: null,
          educating: false,
          invitedEventId: null,
          reason_code: "app_help_turn",
        }
        : await armPhotoInvitation({
        supabase,
        userId,
        responseLocale,
        committed: committedFacts,
        safetyBand: turnFrame?.safety?.risk_band === null ||
            turnFrame?.safety?.risk_band === undefined
          ? null
          : String(turnFrame.safety.risk_band),
        restrictionFlag: restrictionRaisedForAsks,
        futureIntent: isTrackProgressFutureIntent(userMessage),
        // EXACT, pas un raccourci: une photo ne traverse pas le cerveau, elle
        // passe par `meal-photo-upload-v1`. Même constat que `hasMedia: false`
        // de la lane de précision, quatre-vingts lignes plus haut.
        hasMedia: false,
        flowAlreadyOpen: readMealPrecisionFlowState(tempMemory) !== null,
        localDate: keelTurn.local_date,
        sourceMessageId: loggedMessageId ?? requestId,
      });
      console.log(
        `[keel] request_id=${requestId} photo_invitation` +
          ` reason=${invitation.reason_code}` +
          ` educating=${invitation.educating}` +
          ` event=${invitation.invitedEventId ?? "none"}`,
      );
      if (invitation.sentence) {
        keelTurn.meal_photo_invitation = invitation.sentence;
      }
      // LE CANAL — T-6, ET C'EST LE SENS DE LA LIGNE `refused`.
      //
      // Le budget partagé (`daily_ask_budget.ts`, `DAILY_ASK_BUDGET = 1`) vient
      // de décider. Jusqu'ici, un refus ne laissait qu'un `console.log`: le
      // composeur, lui, ajoutait parfois SA propre demande de photo (~1/25), et
      // le compteur ne la voyait jamais. Le budget était donc contournable par
      // le haut. La ceinture de sortie lit cette ligne et retire toute
      // sollicitation photo que le compteur n'a pas armée.
      recordTurnLedger({
        ledger: keelTurn.turn_ledger,
        isKeelStudent: keelTurn.is_student,
        entry: {
          subject: "photo_invitation",
          outcome: invitation.sentence ? "written" : "refused",
          reason_code: invitation.reason_code,
          stored_value_si: null,
        },
      });
      const armed = await armMealPrecisionQuestion({
        responseLocale,
        supabase,
        userId,
        committed: committedFacts,
        planLines,
        slotKey: committedFacts[0]?.slot_key ?? null,
        safetyBand: turnFrame?.safety?.risk_band === null ||
            turnFrame?.safety?.risk_band === undefined
          ? null
          : String(turnFrame.safety.risk_band),
        restrictionFlag: restrictionRaisedForAsks,
        // La même ceinture déterministe que la lane d'écriture: on ne demande
        // pas de précisions sur un repas qui n'a pas eu lieu.
        futureIntent: isTrackProgressFutureIntent(userMessage),
        // Un flow encore ouvert = une question déjà en attente. Deux questions
        // ouvertes en même temps sont l'interrogatoire, même étalé sur deux
        // tours.
        flowAlreadyOpen: readMealPrecisionFlowState(tempMemory) !== null,
        localDate: keelTurn.local_date,
        sourceMessageId: loggedMessageId ?? requestId,
        now: mealPrecisionTurnClock,
      });
      console.log(
        `[keel] request_id=${requestId} meal_precision_question` +
          ` reason=${armed.reason_code}` +
          ` axis=${armed.armed?.axis ?? "none"}`,
      );
      if (armed.armed) {
        // Le flow s'ouvre pour que la RÉPONSE amende au lieu de doubler.
        //
        // DEUX ÉCRITURES, ET LA SECONDE N'EST PAS UNE CEINTURE DÉCORATIVE.
        // Celle-ci sert les chemins de retour anticipés (safety, skill-owner),
        // qui persistent `tempMemory` avant la génération. Mais le chemin
        // NORMAL passe par `tempMemory = cleanupLegacyRuntimeState(agentOut.tempMemory ...)`,
        // où le companion RECONSTRUIT `temp_memory` depuis l'état PRÉ-routing —
        // et efface tout ce qui a été posé pendant le tour. Mesuré en run réel:
        // la question partait, la ligne du plafond s'écrivait, et le flow
        // n'existait nulle part au tour suivant.
        //
        // C'est la classe `p1-session-style-commitments`, et on applique son
        // remède: mémoriser, puis RÉ-APPLIQUER après la génération.
        mealPrecisionFlowToCommit = {
          flow: armed.armed.flow,
          detectedFoods: committedFacts
            .map((fact) => fact.food_group_ref ?? fact.substance_ref ?? "")
            .filter((label) => label !== ""),
        };
        tempMemory = applyMealPrecisionFlowState({
          tempMemory: (tempMemory && typeof tempMemory === "object" &&
              !Array.isArray(tempMemory))
            ? tempMemory as Record<string, unknown>
            : {},
          flow: armed.armed.flow,
          detectedFoods: mealPrecisionFlowToCommit.detectedFoods,
          now: mealPrecisionTurnClock,
        });
        // LE VÉHICULE DE LA QUESTION, et c'est un choix structurel: `keelTurn`
        // est passé OBLIGATOIREMENT à `finalVisibleText` sur les six chemins de
        // sortie (le commentaire du paramètre explique pourquoi il est
        // obligatoire). Une question posée sur le frame se perdrait au premier
        // redispatch qui reconstruit le frame — la classe de bug déjà payée sur
        // le runtime committed.
        keelTurn.meal_precision_question = armed.armed.question;
      }
    }
  }

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

  // ══════════════════════════════════════════════════════════════════════════
  // L2 · SOUS PLANCHER, LA DONNÉE ENTRE — C'EST LA RÉPONSE QUI SE TAIT
  //
  // 🔴 DÉFAUT MESURÉ 3/3 (FF-017) puis 6/6 EN FR ET EN (FF-020), relu en psql:
  //      élève  : « j'ai mangé du poulet à midi. franchement je n'en peux
  //                plus, j'ai envie de disparaître »
  //      route  : owner=safety (ou disordered_eating_guard)
  //      frame  : turn_frame.direct_effects = 1 — le plancher AVAIT posé l'effet
  //      route  : direct_effects_to_run = []
  //      base   : protocol_events → ZÉRO ligne
  // Le fait était perdu. Arbitrage humain du 2026-08-08: « écrire le fait,
  // taire la réponse ». La sollicitation reste avalée sans condition (elle est
  // de la pression par définition); l'EFFET s'écrit.
  //
  // ── POURQUOI ICI, ET NULLE PART AILLEURS ────────────────────────────────
  // Trois lignes plus haut, `turnFrameWithDirectEffectRuntime` a SCELLÉ le
  // frame. Écrire APRÈS ce point est ce qui rend la réponse structurellement
  // muette, et c'est exactement la propriété du patron de référence (FF-008,
  // FF-027): le fait n'atteint jamais la couche qui parle.
  //   · il n'entre pas dans `turnFrame.direct_effect_lane` ⇒ ni le prompt du
  //     skill clinique, ni celui de la crise, ni `ensureCommittedRenderParity`,
  //     ni le contrat de confirmation du composeur n'en voient la trace;
  //   · son `content` est VIDÉ ⇒ la reply déterministe du renderer ne peut pas
  //     remonter par `mergeVisibleTextForTest` (qui retomberait dessus si le
  //     skill rendait un texte vide);
  //   · aucun genre de demande ne s'ouvre: les deux lanes de FF-021 ont déjà
  //     refusé plus haut sur le drapeau BRUT, et le budget n'est pas touché.
  // La comptabilité, elle, reste vraie: le runtime est fusionné dans
  // `operationRuntime`, donc le ledger et la trace portent la ligne. Un commit
  // muet pour la personne n'est pas un commit muet pour l'audit.
  //
  // ── CE QUI N'EST PAS TOUCHÉ ─────────────────────────────────────────────
  // `routers.ts` est inchangé: le tour appartient toujours à la lane de
  // sécurité, `direct_effects_to_run` reste vide, et les six surfaces
  // supprimées par FF-021 le restent. On ne relit pas non plus le plancher: on
  // relit `blocked_paths`, la décision que le routeur vient d'écrire (FF-021 a
  // prouvé qu'elle porte l'effet et son motif, 3/3, sur les deux branches).
  // ══════════════════════════════════════════════════════════════════════════
  const floorSilenced = floorSilencedWriteForTurn({
    blockedPaths: routeDecision.blocked_paths,
    isKeelStudent: keelTurn.is_student,
  });
  if (
    floorSilenced.effect_types.length > 0 &&
    // La lane de précision a retiré l'effet EXPRÈS (une CORRECTION n'ajoute
    // rien): rejouer ici reconstruirait le doublon qu'elle vient de fermer.
    mealPrecisionLane.suppressLogProtocolEvent !== true
  ) {
    const silencedRuntime = await runKeelDirectEffectLane({
      supabase,
      userId,
      userMessage,
      channel,
      turnFrame,
      routeDecision: {
        ...routeDecision,
        direct_effects_to_run: floorSilenced.effect_types,
      },
      tempMemory,
      keel: keelTurn,
      suppressComponentKeys: mealPrecisionLane.suppressComponentKeys,
      precisionAnswerTo: mealPrecisionLane.linkToEventId,
      // LE SECOND VERROU, et il fallait le nommer: `runDirectEffectGate`
      // refuse `log_protocol_event` dès `risk_band >= medium`
      // (`safetyBandBlocksEffect`, default-deny). Sans ce drapeau, ouvrir
      // `direct_effects_to_run` ne suffisait pas — le tour de crise serait
      // resté à zéro ligne, et on aurait cru avoir corrigé. C'est la classe
      // « cinq points de contrôle, et le cinquième est muet ».
      floorSilencedWrite: true,
    });
    if (silencedRuntime) {
      const committedCount =
        (silencedRuntime.toolSkillRun.committed_effects as unknown[]).length;
      console.warn("[keel] floor_silenced_write", {
        request_id: requestId,
        route_owner: routeDecision.response_owner,
        floor_reason: floorSilenced.reason_code,
        effect_types: floorSilenced.effect_types,
        status: silencedRuntime.toolSkillRun.status,
        committed: committedCount,
        blocked:
          (silencedRuntime.toolSkillRun.blocked_effects as unknown[]).length,
        detail:
          "le plancher a pris le tour; le FAIT est écrit quand même et la " +
          "restitution n'existe pas — le runtime ne rejoint pas le frame et " +
          "ne porte aucun texte.",
      });

      // ── LE LECTEUR QUI MANQUAIT (T-7) ────────────────────────────────────
      //
      // L'en-tête de `floor_silenced_write.ts` dit « la trace existait déjà;
      // c'est le lecteur qui manquait », et le module EST ce lecteur — côté
      // ÉCRITURE. Côté PAROLE, la moitié « taire la réponse » de l'arbitrage
      // humain du 2026-08-08 n'avait aucun mécanisme: le runtime est muselé
      // (`content: ""`), mais la prose du skill clinique, elle, n'est
      // contrainte par rien, et `guardKeelAckWithoutCommittedEffect` est
      // DÉSARMÉE sur ces deux routes exprès (`disarmed_safety_turn`,
      // `disarmed_restriction_floor_turn` — son dégradé poserait une question
      // de liage de plan, soit de la pression d'adhérence).
      //
      // `written_silently` n'est PAS `written`: la première dit « c'est en
      // base », la seconde dirait « tu peux le dire ». La ceinture de sortie
      // retire tout accusé sur ce tour, et n'ajoute rien.
      recordTurnLedger({
        ledger: keelTurn.turn_ledger,
        isKeelStudent: keelTurn.is_student,
        entry: {
          subject: "meal_declaration",
          outcome: committedCount > 0 ? "written_silently" : "failed",
          reason_code: floorSilenced.reason_code ?? "floor_silenced",
          stored_value_si: null,
        },
      });
      operationRuntime = mergeDirectEffectRuntimeIntoVisibleRuntime({
        directRuntime: {
          ...silencedRuntime,
          // LE MUSELIÈRE, et elle est littérale: aucune chaîne de ce runtime
          // ne peut atteindre la bulle.
          content: "",
          toolSkillRun: {
            ...silencedRuntime.toolSkillRun,
            // Nommé dans la trace: un audit doit pouvoir distinguer une
            // écriture nominale d'une écriture faite sous plancher.
            status: `floor_silenced:${silencedRuntime.toolSkillRun.status}`,
            reason:
              `${floorSilenced.reason_code}+silenced_write:${silencedRuntime.toolSkillRun.reason}`,
          },
        },
        visibleRuntime: operationRuntime,
      });
    }
  }

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
        responseLocale,
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
          response_locale: responseLocale,
          recent_messages: recentMessagesForTurnFrame,
          active_skill_working_state: currentActiveSkillState as any,
          turn_frame: turnFrame,
          relevant_memory_items: [],
          plan_items: [],
          product_surfaces: [],
          exclusions: [],
          precomputed_safety_crisis_local_dispatcher_output:
            precomputedSafetyCrisisLocalDispatcherOutput,
          // QA agent-12: le pays de l'élève, lu dans `profiles.country` par
          // `loadKeelTurnContext`. Sans lui, la résolution des numéros
          // d'urgence retombait sur la locale — et un élève `country='US'`
          // dont la locale vaut 'en-GB' recevait 999 / 116 123 en pleine
          // crise. `keelTurn.country` est `null` hors KEEL, ce qui laisse le
          // comportement legacy intact.
          student_country: keelTurn.country,
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
        keelTurn,
      );
      const effectLedger = effectLedgerForOperationRuntime(
        turnFrame.turn_id,
        operationRuntime,
      );
      // W2.B: l'annulation de campagne potion-support a disparu avec les
      // potions — plus rien à annuler sur un tour de crise ici.
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


    break;
  }

  const dispatcherSignals = dispatcherSignalsFromTurnFrame({
    turnFrame,
    userMessage,
  });
  // ── LOT 2C · L'ARMEMENT DU RENVOI DU SIZING ───────────────────────────────
  //
  // ⛔ AUCUN MATCHER MAISON. On ne relit pas le message: on lit le verdict que
  // le dispatcher a déjà rendu (`plan_feedback`, qui porte `kind`, `detail` et
  // `sentiment`). Reconnaître « les parts étaient trop grosses » sur du texte
  // libre, dans deux langues, demanderait exactement le matcher que ce dépôt a
  // mesuré faux — « laitue » ≠ « lait », 12 faux positifs sur 12.
  //
  // ICI, et pas plus bas, parce que c'est le premier point où le signal existe;
  // et le DIRE se fait bien plus loin, dans `finalVisibleText`, seul entonnoir
  // que toutes les sorties traversent (voir le bloc de `appendSizingRedirect`).
  keelTurn.sizing_redirect = sizingRedirectFor({
    signal: dispatcherSignals.plan_feedback,
    locale: keelTurn.content_locale,
    // ⚠️ REQUIS, jamais optionnel: hors élève KEEL il n'y a ni plan ni bilan de
    // fin de plan, donc rien vers quoi renvoyer.
    isKeelStudent: keelTurn.is_student === true,
  });
  // ── LE COMPTEUR, ET IL EST OBLIGATOIRE ────────────────────────────────────
  //
  // « Champ déclaré par le modèle = compteur obligatoire »: sans lui, une lane
  // jamais atteinte ressemble trait pour trait à une lane qui marche.
  //
  // ⚠️ LOT 4A — LA LIGNE PART À CHAQUE TOUR, PAS SEULEMENT QUAND `detected`.
  // C'était le défaut du compteur précédent: il ne pouvait produire AUCUNE
  // ligne tant que le signal n'avait pas d'écrivain, et un journal vide se lit
  // exactement comme « personne ne parle de ses portions ». Le DÉNOMINATEUR
  // doit exister avant le numérateur. Les trois nombres se comptent en
  // filtrant ce tag: `seen` (toutes les lignes), `detected: true`, et
  // l'événement `said` posé par `finalVisibleText`.
  //
  // ⚠️ `plan_question` EST DANS LA MÊME LIGNE, ET C'EST LA PREUVE DE NON-CAPTURE.
  // La lane voisine capture une part importante des tours; savoir qu'elle a
  // aussi mordu sur un tour où `plan_feedback` est sorti est la seule façon de
  // distinguer « les deux coexistent » (voulu) de « plan_question a avalé le
  // tour et le retour est perdu » (la panne). Ça se lit sur un nombre, pas sur
  // une relecture du prompt.
  console.info(JSON.stringify({
    tag: "keel/sizing_redirect",
    event: "seen",
    request_id: requestId,
    turn_id: turnFrame.turn_id,
    is_student: keelTurn.is_student === true,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected === true,
    plan_feedback_kind: String(dispatcherSignals.plan_feedback?.kind ?? ""),
    plan_question_detected:
      turnFrame.skill_signals?.plan_question?.detected === true,
    armed: keelTurn.sizing_redirect !== null,
  }));
  // ── LOT M1 · L'ARMEMENT DU RENVOI VERS UN CHAMP ───────────────────────────
  //
  // ⛔ AUCUN MATCHER MAISON, MÊME RAISON QU'AU-DESSUS. On lit le verdict du
  // dispatcher (`profile_statement`, qui porte `kind` et `detail`), jamais le
  // message. « laitue » ≠ « lait ».
  //
  // ⚠️ ET CE SIGNAL N'ÉCRIT RIEN. Il a remplacé un producteur — le memorizer de
  // conversation, retiré au lot M1 — par un RENVOI. Le confondre avec son
  // prédécesseur, c'est rouvrir la ligne ③ de la matrice sans le dire.
  keelTurn.profile_redirect = profileRedirectFor({
    signal: dispatcherSignals.profile_statement,
    locale: keelTurn.content_locale,
    // ⚠️ REQUIS, jamais optionnel: hors élève KEEL, ni la carte « ce que Sophia
    // sait de toi » ni l'écran de réglages n'existent — la phrase renverrait
    // vers un écran absent.
    isKeelStudent: keelTurn.is_student === true,
  });
  // ── LE COMPTEUR, ET IL EST OBLIGATOIRE ────────────────────────────────────
  //
  // « Champ déclaré par le modèle = compteur obligatoire ». Le DÉNOMINATEUR
  // doit exister avant le numérateur: la ligne part à CHAQUE tour, pas
  // seulement quand `detected`. Sans ça, un signal que le modèle n'émet jamais
  // se lit exactement comme « personne ne parle de son équipement ».
  //
  // ⚠️ `kind` EST DANS LA LIGNE, ET C'EST CE QUI REND LE LOT MESURABLE. La
  // liste fermée en refuse quatre sur cinq possibles; savoir QUELS jetons le
  // modèle émet est la seule façon de distinguer « il ne dit rien » de « il dit
  // un jeton qu'on ne reconnaît pas et on se tait ».
  console.info(JSON.stringify({
    tag: "keel/profile_redirect",
    event: "seen",
    request_id: requestId,
    turn_id: turnFrame.turn_id,
    is_student: keelTurn.is_student === true,
    profile_statement_detected:
      dispatcherSignals.profile_statement?.detected === true,
    profile_statement_kind: String(
      dispatcherSignals.profile_statement?.kind ?? "",
    ),
    armed: keelTurn.profile_redirect !== null,
  }));
  // ── LOT M6 · LA QUESTION VAUT RÉVOCATION ──────────────────────────────────
  //
  // ⛔ LE CHARGEMENT EST PARESSEUX, ET C'EST LA DÉCISION DU LOT. La lane de
  // conversation ne lisait PAS `practical_constraints` — vérifié, aucune
  // occurrence. L'alternative était de charger les règles à CHAQUE tour et de
  // les mettre dans le prompt pour que le modèle en nomme une: du budget sur
  // tous les tours, pour servir un cas rare. Ici on ne lit QUE sur le tour où
  // la question tombe.
  //
  // ⛔ AUCUN MATCHER MAISON: le modèle donne le MOT (« poulet »), et
  // `findForbiddenMatches` le cherche dans les lignes stockées — c'est lui qui
  // fait que « lait » ne matche pas dans « laitue ».
  let ruleQuestionFound = 0;
  // ⛔ CE QU'ON DIT AU MODÈLE AVANT QU'IL COMPOSE. Mesuré sur des tours réels:
  // la phrase visible seule le laissait DEVINER la cause, et il devinait le
  // contraire — « not because it's blocked here » collé au-dessus de la ligne
  // qui bloque. Voir `ruleQuestionContextBlock`.
  let ruleQuestionContext: string | null = null;
  if (
    keelTurn.is_student === true &&
    dispatcherSignals.rule_question?.detected === true
  ) {
    const asked = usableFoodWord(dispatcherSignals.rule_question.food);
    if (asked) {
      // ⚠️ FAIL-CLOSED VERS LE SILENCE. Sans client, sans règle, ou sur une
      // lecture en panne: aucune phrase. Le pire cas est une question sans
      // réponse enrichie; l'inverse dirait à quelqu'un qu'il a demandé une
      // chose qu'il n'a jamais demandée.
      const reader = serviceRoleLedgerReadClient();
      const found = reader
        ? rulesMentioning({
          food: asked,
          rules: await loadRulesFor(reader as never, userId),
        })
        : [];
      ruleQuestionFound = found.length;
      keelTurn.rule_question_redirect = ruleQuestionRedirectFor({
        rules: found,
        locale: keelTurn.content_locale,
        // ⚠️ REQUIS, jamais optionnel: hors élève KEEL il n'y a ni carte ni
        // règles à lever.
        isKeelStudent: keelTurn.is_student === true,
      });
      // ⚠️ LA MÊME LISTE, LE MÊME TOUR. Les deux se construisent depuis `found`
      // et sous les mêmes portes: si l'un s'arme sans l'autre, le modèle est
      // instruit d'une règle que la phrase ne nommera pas, ou l'inverse — et on
      // recréerait le défaut qu'on répare.
      ruleQuestionContext = ruleQuestionContextBlock({
        rules: found,
        isKeelStudent: keelTurn.is_student === true,
      });
    }
  }
  // ── LE COMPTEUR, ET IL EST OBLIGATOIRE ────────────────────────────────────
  //
  // ⚠️ LE DÉNOMINATEUR EXISTE AVANT LE NUMÉRATEUR: la ligne part à CHAQUE tour
  // d'élève. Sans ça, « 0 révocation » ne se distingue pas de « 0 tour observé »
  // — et ce lot a DEUX façons de rendre zéro (le modèle n'émet pas, ou aucune
  // règle ne correspond), qu'il faut pouvoir séparer.
  if (keelTurn.is_student === true) {
    console.info(JSON.stringify({
      tag: "keel/rule_question",
      event: "seen",
      request_id: requestId,
      turn_id: turnFrame.turn_id,
      detected: dispatcherSignals.rule_question?.detected === true,
      // ⚠️ LE MOT EST DANS LA LIGNE. C'est la seule façon de distinguer « le
      // modèle n'émet jamais » de « il émet un mot qu'aucune règle ne porte » —
      // et le second est une consigne de prompt à corriger, pas une panne.
      food: String(dispatcherSignals.rule_question?.food ?? ""),
      rules_found: ruleQuestionFound,
      armed: keelTurn.rule_question_redirect != null,
      // ⚠️ « ARMÉ » NE DIT PLUS TOUT. Depuis que le modèle est instruit AVANT
      // de composer, un tour peut avoir sa phrase et pas son bloc — c'est la
      // régression exacte qui ramènerait la réponse auto-contradictoire, et
      // elle serait invisible sans ce champ.
      told_model: ruleQuestionContext != null,
    }));
  }
  // ══════════════════════════════════════════════════════════════════════
  // FF-066 · L'AIDE SUR L'APP — LA FICHE ENTRE AVANT LA GÉNÉRATION.
  //
  // Même place et même raison que `rule_question` juste au-dessus: le bloc
  // part dans `injectedContext`, placé en tête du contexte, donc il survit à
  // la coupe du prompt par la fin. `null` sur la quasi-totalité des tours: il
  // ne coûte que sur celui où la question tombe (fiche R1).
  //
  // ⚠️ LE SIGNAL NE CHOISIT PAS QUI RÉPOND (R4). Un tour de crise l'a déjà
  // perdu au dispatcher (`safetyBlocksToolSkills`); sous le plancher de
  // restriction ou pour un mineur, les fiches de chiffres sont retirées ici.
  //
  // ⚠️ LE PROFIL VIENT DE LA BASE, JAMAIS DU MODÈLE (R5), et il n'est lu que
  // sur ce tour-là. Une lecture en panne rend un profil inconnu: la fiche
  // rend alors sa réponse par défaut, qui énonce ses conditions.
  // ══════════════════════════════════════════════════════════════════════
  let appHelpContext: string | null = null;
  {
    const signal = dispatcherSignals.app_help;
    const detected = keelTurn.is_student === true && signal?.detected === true;
    const selection = detected
      ? selectAppHelpTopics(signal.topics)
      : { topics: [], dropped: [] };
    const allowed = appHelpTopicsAllowed({
      topics: selection.topics,
      restrictionFlag: keelTurn.restriction?.restriction_flag === true,
      isMinor: keelTurn.age_verdict?.status === "minor",
    });
    let viewer = UNKNOWN_APP_HELP_VIEWER;
    let viewerRead: "ok" | "failed" | "skipped" = "skipped";
    if (detected && allowed.topics.length > 0) {
      const read = await loadAppHelpViewer(
        serviceRoleLedgerReadClient() ?? supabase,
        userId,
      );
      viewer = read.viewer;
      viewerRead = read.read;
      appHelpContext = appHelpContextBlock({
        topics: allowed.topics,
        locale: responseLocale,
        viewer,
      });
      keelTurn.app_help_photo = appHelpContext !== null &&
        photoTopicsIn(allowed.topics);
    }
    // ── LE COMPTEUR, À CHAQUE TOUR D'ÉLÈVE (R9) ─────────────────────────────
    // Sans le dénominateur, « 0 aide » ne se distingue pas de « 0 tour
    // observé ». Et `dropped_topics` sépare « le modèle n'émet pas » de « il
    // émet un identifiant qu'aucune fiche ne porte » — le second est une ligne
    // de fiche à corriger, pas une panne.
    if (keelTurn.is_student === true) {
      console.info(JSON.stringify({
        tag: "keel/app_help",
        event: "seen",
        request_id: requestId,
        turn_id: turnFrame.turn_id,
        detected,
        topics: selection.topics,
        dropped_topics: signal?.dropped_topics ?? [],
        dropped_by_floor: allowed.droppedByFloor,
        viewer_role: viewer.role,
        viewer_goal: viewer.goal,
        viewer_read: viewerRead,
        injected: appHelpContext !== null,
        block_chars: appHelpContext?.length ?? 0,
        photo_explained: keelTurn.app_help_photo === true,
      }));
    }
  }
  // ── LOT M7 · LE COMPTEUR DU REPLI DE SÉCURITÉ ─────────────────────────────
  //
  // ⛔ IL COMPTE, IL NE GARDE RIEN. Aucune décision ne dépend de cette ligne:
  // elle est écrite APRÈS l'armement, elle ne modifie rien, et la retirer ne
  // changerait aucune sortie. Un compteur qui déciderait serait une SECONDE
  // autorité de sécurité, plus faible que la vraie (elle ne lit que du texte et
  // ne vérifie rien en sortie) — et une seconde autorité plus faible est pire
  // que pas de seconde autorité: elle ferait croire à une protection absente.
  //
  // ── CE QU'IL EXISTE POUR VOIR ────────────────────────────────────────────
  // Une préférence est une consigne de prompt SANS contrôle en sortie; une
  // contrainte dure repasse sur les aliments réellement nommés. Si une allergie
  // finit rangée du côté préférence, elle perd donc sa ceinture — et rien, dans
  // le produit, ne le dit. *« Le dépôt a déjà payé ce prix une fois sur cette
  // table »*: `student_safety_constraints` a eu six lecteurs armés et zéro
  // écrivain pendant que quelqu'un déclarait une anaphylaxie.
  //
  // ⚠️ ET LE LOT M1 VIENT D'OUVRIR UN CHEMIN NEUF POUR CE DÉFAUT. La règle
  // 6-quater interdit au modèle de router une allergie vers
  // `profile_statement`; si elle fuit, la personne reçoit « ajoute-le à tes
  // aliments évités » — un renvoi vers un champ sans ceinture, au lieu de la
  // table de sécurité. `filed_as_preference` est le nombre qui le dira.
  //
  // ⚠️ LE DÉNOMINATEUR EXISTE AVANT LE NUMÉRATEUR: la ligne part à CHAQUE tour
  // d'élève, pas seulement quand ça mord. Sans ça, « 0 repli » ne se distingue
  // pas de « 0 tour observé » — la forme exacte sous laquelle un lot désarmé
  // ressemble à un lot qui marche.
  //
  // ⚠️ `safetyRequested` LIT `turnFrame` APRÈS LE PLANCHER, et c'est essentiel:
  // `detectDeclaredSafetyConstraint` ajoute l'effet quand le dispatcher l'a
  // manqué (bien plus haut dans cette fonction). Lire avant compterait en repli
  // tous les tours que le plancher RATTRAPE, c'est-à-dire ceux où le filet
  // fonctionne.
  if (keelTurn.is_student === true) {
    const safetyFallback = observeSafetyFallback({
      text: userMessage,
      safetyRequested: turnFrame.direct_effects.some(
        (effect) => effect.effect_type === "declare_safety_constraint",
      ),
    });
    console.info(JSON.stringify({
      tag: SAFETY_FALLBACK_TAG,
      event: "seen",
      request_id: requestId,
      turn_id: turnFrame.turn_id,
      surface: "conversation",
      shaped: safetyFallback.shaped,
      slugs: safetyFallback.slugs,
      // ⚠️ LE ZÉRO DIT POURQUOI. `unreadable: true` veut dire « rien vu PAR
      // IGNORANCE », pas « rien à voir » — sans ce champ, un compteur cassé
      // rendrait la lecture la plus rassurante et la plus fausse.
      unreadable: safetyFallback.unreadable,
      safety_requested: safetyFallback.safetyRequested,
      fell_back: safetyFallback.fellBack,
      // ⚠️ CE CHAMP EST LE POINT DU LOT, et il est plus étroit que `fell_back`:
      // il dit que le tour a non seulement manqué la table de sécurité, mais
      // qu'il a activement renvoyé la personne vers un CHAMP de préférences.
      filed_as_preference:
        String(dispatcherSignals.profile_statement?.kind ?? "") ===
          "food_preference",
    }));
  }
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
    // Une recherche web sur « quoi manger quand on a telle maladie » rapporte
    // par construction ce que la garde clinique interdit de dire, et la remet
    // EN TÊTE du prompt. Voir la coupure dans `research_grounding.ts`.
    declaredMedicalCondition: keelTurn.declared_medical_condition,
  });
  const injectedContext = [
    opts?.contextOverride,
    researchGrounding.context_block,
    researchGrounding.honesty_directive,
    skillExitInjectedContext,
    directEffectConfirmationContextPrompt(turnFrame),
    // F3: la section que la regle companion designe comme source de verite
    // des recaps de plan — construite a chaque tour, inconditionnelle.
    // W4.7: MÊME BRANCHE QUE LE DISPATCHER. Envoyer les deux projections au
    // composeur lui laisserait choisir la plus arrangeante, et
    // `user_plan_items` porte le compteur `current_reps` que KEEL a supprimé.
    // Un élève KEEL dont le contexte plan n'a pas pu être lu n'obtient AUCUN
    // bloc plan — jamais un repli sur un plan qu'il n'a plus.
    keelTurn.is_student
      ? keelTurn.plan_block
      : activePlanSnapshotPromptBlock(planItemSnapshot),
    // ⛔ LOT M6 · LA RÈGLE ENTRE AVANT LA GÉNÉRATION, PAS APRÈS. `null` sur la
    // quasi-totalité des tours: ce bloc ne coûte que sur celui où la question
    // tombe, et il est la seule chose qui empêche le modèle de deviner une
    // cause qui contredit la phrase qu'on va coller sous lui.
    ruleQuestionContext,
    // FF-066 — la fiche d'aide du tour, `null` hors question sur l'app. Même
    // place que la règle du dessus, pour la même raison: elle doit entrer AVANT
    // la génération, et survivre à la coupe du prompt par la fin.
    appHelpContext,
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
    // Un élève KEEL ne reçoit pas la cartographie du tableau de bord grand
    // public. Même branche que le bloc plan plus haut (W4.7).
    keelStudent: keelTurn.is_student,
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

  // ══════════════════════════════════════════════════════════════════════
  // W4.7 — LES DEUX LANES KEEL POSSÈDENT LEUR TOUR.
  //
  // W3.2 et W4.4 avaient posé ici deux ceintures anti-fail-open : `routers.ts`
  // savait router vers ces owners, le runtime ne savait pas les exécuter, donc
  // la route traversait le bloc et atterrissait dans le COMPOSEUR GÉNÉRIQUE.
  // Un plancher qui dégrade en silence vers la lane qu'il devait couper n'est
  // pas un plancher ; une permission de substitution rendue au jugé sur une
  // prescription non lue est pire que pas de lane du tout.
  //
  // Les deux entrées sont maintenant ARMÉES (`keelRoutingInputs`), donc les
  // deux exécutions sont branchées ci-dessous — c'était la condition posée par
  // les ceintures elles-mêmes. Elles ne disparaissent pas pour autant : elles
  // sont RETOURNÉES en garde-fous inversés (juste après les deux handlers)
  // qui prouvent désormais l'inverse — si l'un de ces owners atteint le
  // composeur, c'est que son handler a été débranché.
  // ══════════════════════════════════════════════════════════════════════

  /** Clôture d'un tour possédé par une lane KEEL. Même contrat de retour que
   * la boucle des skills : trace, ledger, traîne de risque, état, message. */
  const finishKeelSkillTurn = async (args: {
    skillId: "disordered_eating_guard" | "plan_question";
    skillOutput: ConversationSkillOutput;
    skillLatencyMs: number;
    extraSkillRun?: Record<string, unknown>;
    ledgerEntries?: Array<{
      status: "committed" | "failed";
      effect_type: string;
      operation_type: string;
      table: string;
      committed_id: string | null;
      reason_code: string;
      payload_summary: Record<string, unknown>;
    }>;
  }) => {
    const responseContent = finalVisibleText(
      mergeVisibleTextForTest(
        operationRuntime,
        String(args.skillOutput.reply ?? "").trim(),
      ),
      routeDecision,
      turnFrame,
      userMessage,
      history,
      keelTurn,
    );
    const effectLedger = effectLedgerForOperationRuntime(
      turnFrame.turn_id,
      operationRuntime,
    );
    for (const [index, entry] of (args.ledgerEntries ?? []).entries()) {
      const record = entry.status === "committed"
        ? recordCommittedEffect
        : recordFailedEffect;
      record(effectLedger, {
        effect_id: `${effectLedger.turn_id}:${entry.status}:${entry.effect_type}:${index}`,
        effect_type: entry.effect_type,
        operation_type: entry.operation_type,
        operation_id: null,
        committed_id: entry.committed_id,
        tool_id: args.skillId,
        source: "executor",
        reason_code: entry.reason_code,
        payload_summary: entry.payload_summary,
        db_ref: entry.committed_id
          ? { table: entry.table, id: entry.committed_id }
          : null,
      });
    }
    const skillRun = {
      selected_skill_id: args.skillId,
      reason_code: routeDecision.reason_code,
      status: args.skillOutput.status,
      latency_ms: args.skillLatencyMs,
      ...(args.extraSkillRun ?? {}),
    };
    const conversationTurnTrace = {
      turn_frame: turnFrame,
      route_decision: routeDecision,
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      response_owner: routeDecision.response_owner,
      skill_run: skillRun,
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
        skill_run: skillRun,
        tool_skill_run: operationRuntime?.toolSkillRun ?? undefined,
        confirmation_token_outcomes: [],
        memory_write_candidates_emitted: 0,
        response_owner: routeDecision.response_owner,
        total_latency_ms: Date.now() - turnStartMs,
      }, { supabase });
    } catch (error) {
      console.error("[Router] logConversationTurn failed after retries", {
        turn_id: turnFrame.turn_id,
        error: String(error),
      });
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
    } as never);
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
          agent_latency_ms: args.skillLatencyMs,
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
  };

  // ── MAILLON 5 — PLANCHER TCA, DANS LA CONVERSATION ────────────────────
  if (routeDecision.response_owner === "disordered_eating_guard") {
    const restriction = keelTurn.restriction;
    if (!restriction || restriction.restriction_flag !== true) {
      // Ceinture: cette lane ne s'ouvre QUE sur le plancher déterministe. Une
      // route armée sans verdict levé signifierait que quelque chose d'autre
      // (un signal du dispatcher, un état résiduel) a ouvert un flow clinique
      // — précisément ce que W3.2 rend impossible par construction.
      throw new Error(
        "[disordered_eating_guard] route armée sans plancher levé: le verdict " +
          "du guard est absent ou négatif. Refus d'ouvrir un flow clinique " +
          `sans sa condition d'entrée. reason_code=${routeDecision.reason_code}`,
      );
    }
    const skillStart = Date.now();
    const guardRuntime: DisorderedEatingSkillRuntime = {
      restriction_guard_result: restriction,
      country: keelTurn.country,
      plan_version_id: keelTurn.plan_version_id,
    };
    const skillOutput = await runDisorderedEatingGuardSkill({
      user_message: userMessage,
      context: {
        skill_id: "disordered_eating_guard",
        user_id: userId,
        response_locale: responseLocale,
        recent_messages: recentMessagesForTurnFrame,
        // La continuité de l'épisode est portée par une clé dédiée (voir
        // `KEEL_DISORDERED_EATING_STATE_KEY`): `active_flow_state.ts` ne
        // connaît pas ce flow, donc l'état ne peut pas transiter par le
        // registre des flows locaux.
        // Cast NOMMÉ, et volontairement pas `as never`: le skill ne lit que
        // `.working_state`, et les champs de registre (version, turn_count,
        // started_at…) n'existent pas pour un flow qui ne transite pas par le
        // registre. Les inventer pour satisfaire la forme fabriquerait des
        // faits que rien ne lit. Un cast nommé ment sur UN champ; `as never`
        // sur l'objet entier avalait tout champ manquant du contexte.
        active_skill_working_state: {
          working_state: disorderedEatingWorkingStateForTurn(
            tempMemory,
            restriction,
          ),
        } as ActiveConversationSkillWorkingState,
        turn_frame: turnFrame,
        relevant_memory_items: [],
        // Zéro projection de plan pendant ce flow: l'invariant du skill est
        // qu'il ne parle jamais de chiffres, de plan ni de produit.
        plan_items: [],
        product_surfaces: [],
        exclusions: [],
        disordered_eating_guard_runtime: guardRuntime,
      },
    });
    const skillLatencyMs = Date.now() - skillStart;

    // Escalade coach — écrite par le RUNTIME (le skill n'a aucune I/O) et
    // idempotente PAR LIGNE OUVERTE: une passe quotidienne qui re-déclenche
    // ne produit pas trente alertes, elle en produit une.
    const changeRequest =
      (skillOutput.diagnosis as Record<string, unknown> | undefined)
        ?.contract_change_request ?? null;
    const ledgerEntries: Parameters<
      typeof finishKeelSkillTurn
    >[0]["ledgerEntries"] = [];
    if (changeRequest) {
      try {
        const escalation = await escalateRestrictionSignal(
          supabase as never,
          {
            userId,
            planVersionId: keelTurn.plan_version_id,
            result: restriction,
            studentWords: userMessage.trim() || null,
          },
        );
        ledgerEntries.push({
          status: escalation.contractChangeRequestId ? "committed" : "failed",
          effect_type: "contract_change_request.raise",
          operation_type: "restriction_signal_escalation",
          table: "contract_change_requests",
          committed_id: escalation.contractChangeRequestId,
          reason_code: escalation.reason,
          payload_summary: {
            urgency: "immediate",
            trigger_codes: restriction.triggers.map((trigger) => trigger.code),
          },
        });
      } catch (error) {
        console.error(
          "[disordered_eating_guard] coach escalation write failed",
          error,
        );
        ledgerEntries.push({
          status: "failed",
          effect_type: "contract_change_request.raise",
          operation_type: "restriction_signal_escalation",
          table: "contract_change_requests",
          committed_id: null,
          reason_code: "escalation_write_failed",
          payload_summary: {
            trigger_codes: restriction.triggers.map((trigger) => trigger.code),
          },
        });
      }
    }

    tempMemory = applyDisorderedEatingEpisodeState({
      tempMemory: tempMemory as Record<string, unknown>,
      restriction,
      statePatch: (skillOutput.state_patch ?? {}) as DisorderedEatingWorkingState,
      // La CONVERSATION se ferme; la SUSPENSION, non — seule une revue coach
      // la lève (contract.ts). Le latch n'empêche que la ré-ouverture du flow
      // pour le même épisode, jamais la suppression des surfaces proactives.
      closed: skillOutput.status === "exit",
    });
    console.log(
      `[disordered_eating_guard] request_id=${requestId}` +
        ` status=${skillOutput.status}` +
        ` triggers=${restriction.triggers.map((t) => t.code).join(",")}` +
        ` escalated=${ledgerEntries.length > 0}`,
    );
    return await finishKeelSkillTurn({
      skillId: "disordered_eating_guard",
      skillOutput,
      skillLatencyMs,
      extraSkillRun: {
        restriction_trigger_codes: restriction.triggers.map((t) => t.code),
        adherence_pressure_suspended: true,
      },
      ledgerEntries,
    });
  }

  // ── PHASE B — LE HANDLER DE REPRISE EST PARTI LE 2026-09-09 ────────────
  //
  // `routers.ts` ne nomme plus `keel_reengagement_resume_v1` comme
  // propriétaire, et `chat-inbound-v1` n'arme plus l'état: ce bloc était
  // devenu inatteignable. Le pourquoi (le cas mesuré sur poul, et le même pari
  // déjà perdu au 2ᵉ tour le 2026-08-06) est écrit dans `chat-inbound-v1`, à
  // l'endroit qui écrivait l'état.

  // ── FF-056 — LA DIVERGENCE CONSTATÉE ──────────────────────────────────
  //
  // L'épisode a été ouvert HORS conversation par le batch du soir; ce maillon
  // ne fait que lire la réponse. Trois choses arrivent par la base et jamais
  // par le turn frame: l'épisode lui-même, le plancher TCA et la bande de
  // crise. C'est la doctrine du dépôt — ce qui ouvre ou ferme un flow ne
  // transite pas par un modèle.
  if (routeDecision.response_owner === "weight_divergence") {
    if (!weightDivergenceEpisode) {
      // Ceinture: `routers.ts` gate cette lane sur la présence d'un épisode
      // vivant. L'atteindre sans lui signifierait que le gate a sauté — et la
      // lane parlerait alors du poids de quelqu'un sans raison.
      throw new Error(
        "[weight_divergence] route armée sans épisode vivant. " +
          `reason_code=${routeDecision.reason_code}`,
      );
    }
    const episode = weightDivergenceEpisode;
    const skillStart = Date.now();

    // ── L'ESPACE D'ACTION, PRÉ-CALCULÉ DEPUIS LE PLAN RÉEL ─────────────────
    // Le canal est celui de FF-028, pas un canal à nous: `buildActionSpace`
    // n'y met que ce qui CHANGE quelque chose pour cette personne (le moment
    // n'est pas déjà dans son rythme). L'empreinte est calculée par la MÊME
    // fonction que le soir — deux définitions de « le plan a changé »
    // divergeraient, et la divergence se paierait sur un tap qui ne fait rien.
    let availableActionIds: string[] = [];
    let planChanged = false;
    try {
      const rhythm = await loadRhythm(supabase as never, userId);
      availableActionIds = buildActionSpace(rhythm.effective).map((a) => a.id);
      const nowFingerprint = planFingerprint({
        rhythm: rhythm.effective,
        doctrineVersion: keelTurn.doctrine?.doctrine?.version ?? null,
      });
      planChanged = nowFingerprint !== episode.plan_fingerprint;
    } catch (error) {
      // FAIL-CLOSED SUR L'ACTION. Une lecture ratée rend l'espace vide et le
      // plan « changé »: le flow dit alors qu'il a noté et ne propose rien.
      // L'inverse proposerait une modification durable sur un plan qu'on n'a
      // pas pu lire.
      console.warn("[weight_divergence] action space unreadable", error);
      availableActionIds = [];
      planChanged = true;
    }
    const actionTexts: Record<string, string> = {};
    for (const id of RECOMMENDATION_ACTION_IDS) {
      actionTexts[id] = recommendationAction(id).proposal;
    }

    // La classification. Le plancher de refus mord AVANT le modèle, dedans.
    const classification = await classifyDivergenceReply({
      user_id: userId,
      request_id: requestId,
      userMessage,
    });

    const skillResult = await runWeightDivergenceSkill({
      user_message: userMessage,
      context: {
        skill_id: "weight_divergence",
        user_id: userId,
        response_locale: responseLocale,
        recent_messages: recentMessagesForTurnFrame,
        // La continuité vit sur la LIGNE D'ÉPISODE (turn_count), pas dans
        // `temp_memory`: deux écrivains concurrents, le dernier gagne, et un
        // compteur de tours qu'on peut perdre est un flow sans fin.
        // Cast NOMMÉ (via `unknown`), et volontairement pas `as never`: le
        // skill ne lit que `.working_state`, et les champs de registre
        // (version, skill_id, status…) n'existent pas pour un flow qui ne
        // transite PAS par le registre des flows locaux. Les inventer
        // fabriquerait des faits que rien ne lit; `as never` sur l'objet entier
        // avalerait tout champ manquant du contexte.
        active_skill_working_state: {
          working_state: {
            episode_id: episode.id,
            phase: episode.state === "proposed" ? undefined : "deepening",
            turn_count: episode.turn_count,
            last_category: episode.category ?? undefined,
            reformulated: episode.category === "other",
          },
        } as unknown as ActiveConversationSkillWorkingState,
        turn_frame: turnFrame,
        relevant_memory_items: [],
        // Zéro projection de plan: l'invariant du flow est qu'il ne parle que
        // de ce que la personne vient de dire.
        plan_items: [],
        product_surfaces: [],
        exclusions: [],
        weight_divergence_runtime: {
          episode_id: episode.id,
          classification,
          restriction_flagged: keelTurn.restriction?.restriction_flag === true,
          // La trappe crise, à CE tour. `high` et `critical` seulement: la
          // détresse `medium` est déjà écartée à la route (`distress === null`),
          // et la redoubler ici ferait disparaître le flow sur un signal que le
          // routeur a jugé compatible.
          crisis: runtimeSafetyRiskBand === "high" ||
            runtimeSafetyRiskBand === "critical",
          available_action_ids: availableActionIds,
          action_texts: actionTexts,
          plan_changed: planChanged,
          local_date: keelTurn.local_date ?? "",
        } satisfies WeightDivergenceSkillRuntime,
      },
    });
    const skillLatencyMs = Date.now() - skillStart;

    // ── L'AVANCEMENT EST ÉCRIT PAR LE RUNTIME, ET RELU ─────────────────────
    // `advanceEpisode` compte les lignes REVUES: un update à zéro ligne rend
    // 204 sans erreur, et l'épisode qu'on croit clos resterait vivant — donc
    // bloquerait tous les suivants par l'index unique, en silence et pour
    // toujours.
    const ledgerEntries: Parameters<
      typeof finishKeelSkillTurn
    >[0]["ledgerEntries"] = [];
    if (skillResult.episodeAdvance) {
      const advance = skillResult.episodeAdvance;
      // ── L'AVANCEMENT S'ÉCRIT EN SERVICE-ROLE, ET C'EST STRUCTUREL ─────────
      // Mesuré en run réel (QA FF-056 du 2026-08-11) : ce bloc passait
      // `supabase`, le client porté par le JWT DE L'ÉLÈVE, donc le rôle
      // `authenticated` — qui n'a que `SELECT` sur cette table (la migration
      // ne lui accorde rien d'autre, volontairement). Chaque tour rendait donc
      // `permission denied for table student_weight_divergence_episodes`,
      // l'épisode restait à `proposed/category=null/turn_count=0`, et le flow
      // parlait sans jamais rien retenir : classification correcte, mémoire nulle.
      //
      // Le `as never` d'origine est ce qui a rendu la faute invisible au
      // typecheck — la cicatrice « `as` sur un type étranger désarme le
      // typecheck », payée une fois de plus ici.
      //
      // On NE relâche PAS les privilèges d'`authenticated` : cette table est
      // écrite par le runtime, jamais par le navigateur.
      const episodeWriter = serviceRoleLedgerReadClient();
      if (!episodeWriter) {
        throw new Error(
          "service-role client indisponible: l'avancement d'épisode ne peut pas " +
            "être écrit avec le client de l'élève (authenticated n'a que SELECT)",
        );
      }
      try {
        const written = await advanceEpisode(episodeWriter, {
          id: episode.id,
          userId,
          state: advance.state as never,
          category: advance.category,
          turnCount: advance.turnCount,
          observationOpenedOn: advance.observationOpenedOn,
          observationEndsOn: advance.observationEndsOn,
        });
        ledgerEntries.push({
          status: written.updated > 0 ? "committed" : "failed",
          effect_type: "weight_divergence_episode.advance",
          operation_type: "weight_divergence_episode",
          table: "student_weight_divergence_episodes",
          committed_id: written.updated > 0 ? episode.id : null,
          reason_code: written.updated > 0
            ? `state:${advance.state}`
            : "episode_update_matched_no_row",
          payload_summary: {
            category: advance.category,
            turn_count: advance.turnCount,
            observation_window: advance.observationEndsOn !== null,
          },
        });
      } catch (error) {
        console.error("[weight_divergence] episode advance failed", error);
        ledgerEntries.push({
          status: "failed",
          effect_type: "weight_divergence_episode.advance",
          operation_type: "weight_divergence_episode",
          table: "student_weight_divergence_episodes",
          committed_id: null,
          reason_code: "episode_update_failed",
          payload_summary: { category: advance.category },
        });
      }
    }

    // LA TRAPPE. Le flow s'efface SANS TEXTE et le tour continue vers la
    // ceinture (plancher TCA ou crise). On ne renvoie pas un message vide, et
    // on ne dit pas au revoir: dire au revoir à quelqu'un en détresse au motif
    // qu'on change de lane serait la dernière phrase qu'il lirait de nous.
    if (skillResult.handOver !== null) {
      // ⚠️ ON NE RE-DISPATCHE PAS, ET C'EST DÉLIBÉRÉ.
      //
      // `routers.ts` place DÉJÀ les deux ceintures au-dessus de cette lane
      // (safety haute/critique, crise active, idéation medium, plancher TCA) et
      // exige `distress === null` pour l'atteindre. Atteindre ce point signifie
      // donc que quelque chose a changé ENTRE la route et le tour — c'est de la
      // défense en profondeur, pas un chemin nominal.
      //
      // Rejouer le routeur ici ne servirait à rien: le maillon du plancher TCA
      // est PLUS HAUT dans cette chaîne de `if` et a déjà été franchi. Le tour
      // tombe donc vers le composeur, qui porte lui-même la bande de sécurité
      // du tour — c'est le comportement qu'aurait eu ce message si aucun
      // épisode n'avait existé, et c'est exactement ce qu'on veut: le flow
      // disparaît, il ne parle pas, et il ne laisse pas un tour muet derrière
      // lui.
      console.warn("[weight_divergence] hand over to floor", {
        to: skillResult.handOver,
        episode_id: episode.id,
        request_id: requestId,
      });
      weightDivergenceEpisode = null;
    } else {
      console.log(
        `[weight_divergence] request_id=${requestId}` +
          ` status=${skillResult.output.status}` +
          ` category=${skillResult.episodeAdvance?.category ?? "none"}` +
          ` classification_source=${classification.source}`,
      );
      return await finishKeelSkillTurn({
        skillId: "weight_divergence" as never,
        skillOutput: skillResult.output,
        skillLatencyMs,
        ledgerEntries,
      });
    }
  }

  // ── MAILLON 4 — PLAN_QUESTION (Tier 0 déterministe) ───────────────────
  //
  // ⚠️ UNE MALADIE DÉCLARÉE DÉSARME CETTE LANE, et c'est une correction du
  // 2026-08-06.
  //
  // `withKeelDoctrineBlock` n'a qu'UN appelant — le composeur, plus bas. Cette
  // lane rend AVANT lui, donc le bloc de déférence clinique n'atteignait jamais
  // le tour: mesuré 8 fois sur les lots A à D. Pire, son gabarit est codé en
  // dur en anglais et promet « I have passed your question to them » — un canal
  // 1:1 coach → élève qui N'EXISTE PAS (docs/keel/MODEL.md). Un élève qui
  // déclare un diabète recevait donc: aucun clinicien nommé, une promesse
  // fausse, et une ligne `contract_change_requests` classée
  // `reason_code='dislikes_food'` — son diabète rangé en dégoût alimentaire,
  // parti dans le digest hebdomadaire de son coach.
  //
  // On laisse donc le tour tomber vers le composeur, qui porte le bloc. La
  // question de plan, elle, attendra le tour suivant: elle est réversible, la
  // déférence clinique ne l'est pas.
  if (routeDecision.response_owner === "plan_question") {
    if (!keelTurn.is_student) {
      // Ceinture: `routers.ts` gate cette lane sur `keel_student`. L'atteindre
      // sans le rôle signifierait que le gate a sauté — et la lane répondrait
      // alors sur un plan qui n'existe pas.
      throw new Error(
        "[plan_question] route armée sans gate keel_student: la lane ne peut " +
          "rien résoudre sans plan_commitments. " +
          `reason_code=${routeDecision.reason_code}`,
      );
    }
    const skillStart = Date.now();
    const signalContext = turnFrame.skill_signals.plan_question?.context;
    let planQuestionRuntime: PlanQuestionSkillRuntime | null = null;
    try {
      planQuestionRuntime = await loadPlanQuestionRuntime({
        supabase,
        userId,
        keel: keelTurn,
        prescribedFoodGroup: signalContext?.prescribed_food_group ?? null,
        slotHint: signalContext?.slot_hint ?? null,
      });
    } catch (error) {
      // Prescription ou contraintes de sécurité illisibles: on n'accorde RIEN.
      // La dégradation est nommée et honnête, et surtout elle ne retombe pas
      // dans le composeur générique (qui, lui, dirait oui).
      console.error("[plan_question] runtime load failed", error);
      return await finishKeelSkillTurn({
        skillId: "plan_question",
        skillOutput: {
          skill_id: "plan_question",
          status: "complete",
          response_intent: "escalate_to_coach",
          reply:
            "I can't check that against your plan right now, so I'm not going to " +
            "guess. Stick to the line as written and ask your coach — they set " +
            "the substitution rules.",
          memory_trace: {
            memory_used_for_response: false,
            memory_item_ids_used: [],
            correction_detected: false,
            correction_target_item_ids: [],
          },
        } as ConversationSkillOutput,
        skillLatencyMs: Date.now() - skillStart,
        extraSkillRun: {
          plan_question_runtime_unavailable: true,
          prescription_mutated: false,
        },
      });
    }

    const skillOutput = await runPlanQuestionSkill({
      user_message: userMessage,
      context: {
        skill_id: "plan_question",
        user_id: userId,
        response_locale: responseLocale,
        recent_messages: recentMessagesForTurnFrame,
        active_skill_working_state: null,
        turn_frame: turnFrame,
        relevant_memory_items: [],
        plan_items: [],
        product_surfaces: [],
        exclusions: [],
        plan_question_runtime: planQuestionRuntime,
      },
    });
    const skillLatencyMs = Date.now() - skillStart;

    const changeRequest = (skillOutput.diagnosis as
      | Record<string, unknown>
      | undefined)?.contract_change_request as
        | PlanQuestionChangeRequest
        | null
        | undefined;
    const ledgerEntries: Parameters<
      typeof finishKeelSkillTurn
    >[0]["ledgerEntries"] = [];
    if (changeRequest) {
      const written = await writePlanQuestionChangeRequest({
        supabase,
        changeRequest,
      });
      ledgerEntries.push({
        status: written.written ? "committed" : "failed",
        effect_type: "contract_change_request.raise",
        operation_type: "plan_question_escalation",
        table: "contract_change_requests",
        committed_id: written.id,
        reason_code: written.reason_code,
        payload_summary: {
          reason_code: changeRequest.reason_code,
          urgency: changeRequest.urgency,
          commitment_id: changeRequest.commitment_id,
          // La suggestion est un BROUILLON: rien ici ne l'applique.
          suggested_option_is_draft: true,
        },
      });
    }
    console.log(
      `[plan_question] request_id=${requestId}` +
        ` outcome=${
          (skillOutput.diagnosis as Record<string, unknown> | undefined)
            ?.outcome
        }` +
        ` commitment=${planQuestionRuntime.commitment?.id ?? "none"}` +
        ` escalated=${ledgerEntries.length > 0}`,
    );
    return await finishKeelSkillTurn({
      skillId: "plan_question",
      skillOutput,
      skillLatencyMs,
      extraSkillRun: {
        plan_question_outcome:
          (skillOutput.diagnosis as Record<string, unknown> | undefined)
            ?.outcome ?? null,
        prescription_mutated: false,
      },
      ledgerEntries,
    });
  }

  // ── CEINTURES INVERSÉES (doctrine W2: la vérification prouve désormais le
  // contraire de ce qu'elle prouvait). Les deux blocs ci-dessus RETOURNENT
  // toujours; atteindre ces lignes signifie qu'un handler a été débranché et
  // que la route retomberait dans le composeur générique — c'est-à-dire la
  // pression d'adhérence pour la lane TCA, une permission au jugé pour
  // plan_question. Condition de désarmement (P9): ces throws disparaissent le
  // jour où ces owners n'existent plus dans `routers.ts`, pas avant.
  // (Le typage narrow déjà `response_owner` ici — les deux blocs RETOURNENT —
  // ce qui est la première moitié de la preuve. L'élargissement explicite garde
  // la seconde: la ceinture reste exécutable si un futur refactor supprime un
  // `return` sans que le compilateur n'ait rien à dire.)
  const finalResponseOwner: string = routeDecision.response_owner;
  if (
    finalResponseOwner === "disordered_eating_guard" ||
    finalResponseOwner === "plan_question"
  ) {
    throw new Error(
      `[${finalResponseOwner}] handler débranché: la lane est armée ` +
        "mais n'a pas exécuté son skill, et la route atteint le composeur " +
        `générique. reason_code=${routeDecision.reason_code}`,
    );
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
      context: withKeelDoctrineBlock(context, keelTurn),
      targetMode,
      nCandidates: 1,
      checkupActive: false,
      stopCheckup: false,
      isPostCheckup: false,
      // W12-V — L'AVARIE PARLE LA LANGUE DE LA REPONSE.
      // Cette phrase était du français EN DUR. Mesurée en run réel sur un
      // `keel_role='student'` en-US (clé modèle invalide → chemin d'avarie) :
      // l'élève recevait « J'ai un souci technique sur ce tour. » — le seul
      // texte visible du tour, dans la mauvaise langue, sur le chemin
      // précisément le plus probable en démo (réseau/quota).
      // La langue vient de `resolveResponseLocale`, source unique (R3) : aucun
      // module ne code une langue de réponse en dur, y compris celui-ci.
      outageTemplate: keelOutageTemplate(responseLocale),
      responseLocale,
      sophiaChatModel: meta?.model ?? getGlobalAiModel(),
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
  // MÊME RAISON, MÊME REMÈDE: la question de précision est partie dans la
  // réponse et la place du plafond est consommée. Sans cette ré-application, le
  // flow qui doit rattacher la RÉPONSE au fait déjà écrit serait effacé par la
  // reconstruction ci-dessus — et « avec du riz » repartirait écrire un repas
  // complet, c'est-à-dire exactement le doublon que tout ce chantier ferme.
  // Mesuré en run réel avant correctif: flow absent de `temp_memory` au tour
  // suivant, alors que la question ET la ligne de plafond, elles, existaient.
  if (mealPrecisionFlowToCommit) {
    const armedFlow = mealPrecisionFlowToCommit.flow;
    // LA QUESTION ABANDONNÉE, ET SA CONSÉQUENCE SUR L'ÉTAT.
    //
    // La ceinture de rendu peut retirer la question (le composeur avait déjà
    // posé la sienne). Persister malgré tout un flow `awaiting_clarification`
    // porteur d'une question que l'élève N'A JAMAIS LUE ferait juger sa phrase
    // suivante comme la réponse à rien. On dégrade en « correction seulement »:
    // il garde le droit d'amender son repas, on ne prétend rien lui avoir
    // demandé.
    const questionSurvived = String(keelTurn.meal_precision_question ?? "")
      .trim() !== "";
    const flowToWrite = (armedFlow && !questionSurvived &&
        armedFlow.question !== null)
      ? { ...armedFlow, state: "awaiting_correction" as const, question: null }
      : armedFlow;
    tempMemory = applyMealPrecisionFlowState({
      tempMemory: tempMemory as Record<string, unknown>,
      flow: flowToWrite,
      detectedFoods: mealPrecisionFlowToCommit.detectedFoods,
      now: mealPrecisionTurnClock,
    });
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
  const responseContent = finalVisibleText(
    mergeVisibleTextForTest(operationRuntime, agentOut.responseContent),
    routeDecision,
    turnFrame,
    userMessage,
    history,
    keelTurn,
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
      // W3.1: trace du pregate déterministe — taux de déclenchement, ceinture
      // qui a tiré, condition de désarmement qui l'a tue.
      safety_pregate: safetyPregateTraceForTurn(safetyContextOutput) as
        | Record<string, unknown>
        | null,
      route_decision: routeDecision,
      direct_effects: directEffectTrace(operationRuntime),
      effect_ledger: summarizeEffectLedgerForTrace(effectLedger),
      skill_run: localFlowExitSkillRun ??
        (isSafetyRoute(routeDecision)
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

  if (isSafetyRoute(routeDecision)) {
    // W2.B: l'annulation terminale des campagnes potion-support est partie
    // avec les potions. Le client service-role reste nécessaire au backstop
    // réengagement ci-dessous.
    const admin = serviceRoleLedgerReadClient();
    // Backstop réengagement (review adversariale 19/07) : un tour de crise
    // peut préempter AVANT que le flow winback ne soit consulté (le dispatcher
    // local n'est jamais appelé). L'épisode resterait ouvert et son state
    // armé — ré-armé/repris après la crise. On ferme l'épisode 'safety'
    // (jamais d'extraction) et on désarme le flow EN MÉMOIRE, avant la
    // persistance finale de temp_memory (un write séparé serait clobbé).
    const safetyAdmin = admin ?? supabase;
    await closeOpenReengagementEpisodeForSafety({
      admin: safetyAdmin,
      userId,
      nowIso: new Date().toISOString(),
      requestId,
    });
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

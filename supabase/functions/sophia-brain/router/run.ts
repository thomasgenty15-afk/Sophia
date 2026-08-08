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
import { retractedContentSegments } from "../../_shared/memory/memorizer/retraction_guard.ts";
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
// W8 — CEINTURE ACCUSÉ FANTÔME SANS EFFET. Le détecteur est PUR et vit dans
// son module; run.ts n'apporte que la vérité du tour (rôle KEEL, nombre de
// commits relus) et l'observabilité.
import {
  guardKeelAckWithoutCommittedEffect,
  KEEL_ACK_GUARD_NAME,
  recordKeelAckGuardTrigger,
} from "../skills/_shared/keel_ack_without_effect_guard.ts";
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
  buildDirectEffectConfirmationContext,
  committedCorrectionReplyOverride,
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
import {
  buildKeelPlanContext,
  type KeelPlanContext,
  type KeelRole,
  loadKeelPlanContextSnapshot,
  selectDispatcherPlanContext,
} from "../context/keel_plan_context.ts";
import { dayTokenForLocalDate } from "../../_shared/keel/slot_reminders.ts";
import { slotKeyNamedIn } from "../../_shared/keel/slot_from_message.ts";
import {
  isFrenchLocale,
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
import { appendPhotoInvitation } from "../../_shared/keel/photo_invitation.ts";
import type { PrecisionPlanLine } from "../../_shared/keel/meal_precision.ts";
import type { MealPrecisionFlowState } from "../../_shared/keel/meal_precision_flow.ts";
import {
  applyMealPrecisionFlowState,
  readMealPrecisionFlowState,
} from "../../_shared/keel/meal_precision_flow_state.ts";
import { createProtocolEventWrite } from "../tools/always_on/log_protocol_event/db.ts";
import { runLogProtocolEventDirectEffect } from "../tools/always_on/log_protocol_event/router.ts";
import { createSafetyConstraintWrite } from "../tools/always_on/declare_safety_constraint/db.ts";
import { runDeclareSafetyConstraintDirectEffect } from "../tools/always_on/declare_safety_constraint/router.ts";
import { createPlannedDeviationWrite } from "../tools/always_on/declare_deviation/db.ts";
import { runDeclareDeviationDirectEffect } from "../tools/always_on/declare_deviation/router.ts";
import type { DayResolution } from "../tools/always_on/declare_deviation/contract.ts";
import {
  escalateRestrictionSignal,
  evaluateRestrictionForStudent,
} from "../../_shared/keel/restriction_runtime.ts";
import type { RestrictionGuardResult } from "../../_shared/keel/restriction_guard.ts";
import { classifyStudentTurn } from "../skills/disordered_eating_guard/reducer.ts";
// Détecteur d'intention future déjà écrit et testé pour `track_progress`
// (P12-F). Une seconde implémentation, c'est deux lexiques qui divergent.
import { isTrackProgressFutureIntent } from "../tools/always_on/track_progress_plan_item/intake.ts";
import {
  type DisorderedEatingWorkingState,
} from "../skills/disordered_eating_guard/contract.ts";
import { runKeelReengagementResumeSkill } from "../skills/keel_reengagement_resume/skill.ts";
import {
  type DisorderedEatingSkillRuntime,
  runDisorderedEatingGuardSkill,
} from "../skills/disordered_eating_guard/skill.ts";
import {
  type PlanQuestionSkillRuntime,
  runPlanQuestionSkill,
} from "../skills/plan_question/skill.ts";
import type {
  PlanQuestionChangeRequest,
  PlanQuestionCommitment,
} from "../skills/plan_question/contract.ts";
// R5 frontier: `swap_policy` vit dans `plan_commitments.content` jsonb et n'est
// extrait QUE par cette fonction (evaluate-adherence-v1). Tier 0 et
// l'évaluateur lisent donc la MÊME politique — la parité « oui aujourd'hui /
// met ce soir » que `plan_question/contract.ts` pose en invariant ne peut pas
// dériver par deux copies de l'extracteur.
import { extractSwapPolicy } from "../../evaluate-adherence-v1/snapshot.ts";
import {
  loadStudentSafetyConstraints,
  safetyConstraintsPromptBlock,
  type StudentSafetyConstraint,
} from "../../_shared/keel/safety_constraints.ts";
// PIVOT §3.3 — la ceinture de sortie (les deux verrous) et le chargeur de
// doctrine. Le raisonnement complet vit dans les modules; ici on ne fait que
// les brancher sur le seul point de passage de tout texte visible.
import { applyKeelOutputLocks } from "../skills/_shared/keel_output_locks.ts";
import {
  coachNotePromptBlock,
  type LoadedCoachNote,
  loadCoachNote,
} from "../../_shared/keel/coach_note.ts";
import {
  doctrineBlockFor,
  type LoadedDoctrine,
  loadPublishedDoctrine,
} from "../../_shared/keel/doctrine_loader.ts";
import { weekReviewPromptBlock } from "../../_shared/keel/week_review.ts";
import {
  loadLatestWeekReview,
  type StoredWeekReview,
  weekStartOfLocalDate,
  writeDeclaredBodyMeasure,
} from "../../_shared/keel/week_review_io.ts";
import {
  type DisplayUnitSystem,
  detectDeclaredBodyMeasure,
} from "../../_shared/keel/body_measure_floor.ts";
import { detectHungerReport } from "../../_shared/keel/hunger_signal.ts";
import { writeHungerReport } from "../../_shared/keel/hunger_signal_io.ts";
import {
  assessBirthDate,
  type BirthDateVerdict,
} from "../../_shared/keel/student_age.ts";
import {
  type CitablePulse,
  pulseContextBlock,
} from "../../_shared/keel/daily_pulse.ts";
import { loadLatestPulse } from "../../_shared/keel/daily_pulse_io.ts";
import {
  applyGroundedSupportBelt,
  detectDiscouragementTurn,
  groundedSupportBlock,
  type SupportGround,
  supportGround,
} from "../../_shared/keel/grounded_support.ts";
import { type DayFacts, EMPTY_DAY_FACTS } from "../../_shared/keel/daily_recap.ts";
import { loadDayFacts } from "../../_shared/keel/daily_recap_io.ts";
import {
  householdContextBlock,
  type HouseholdTurnContext,
  loadHouseholdTurnContext,
} from "../../_shared/keel/household_turn_context.ts";
import { detectDeclaredSafetyConstraint } from "../../_shared/keel/safety_constraint_floor.ts";
import {
  CLINICAL_DEFERRAL_BLOCK,
  detectDeclaredMedicalCondition,
} from "../../_shared/keel/medical_condition_floor.ts";
import {
  detectDeclaredMeal,
  isMealForSomeoneElse,
  isNoMealDeclared,
  type MealDeclarationHit,
} from "../../_shared/keel/meal_declaration_floor.ts";
import {
  recordAllowedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
} from "./effect_ledger.ts";

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

// ===========================================================================
// W4.7 — KEEL: le ledger des deux effets durables
//
// `effect_ledger_adapter.ts` mappe les effets par table fermée
// (`OPERATION_TYPE_BY_EFFECT_TYPE`) et `continue` en silence sur un type
// inconnu: un `log_protocol_event` committé y serait donc INVISIBLE du ledger
// — un commit réel sans ligne de comptabilité, exactement le trou que la
// doctrine « execution truth » interdit. Le mapping KEEL vit ici, à côté du
// seul point qui construit le ledger du tour, et il est ADDITIF: les deux
// recorders ne peuvent pas se marcher dessus puisque l'adaptateur legacy
// ignore ces deux types.
// ===========================================================================

const KEEL_LEDGER_EFFECT_TYPES: Readonly<
  Record<string, { effect_type: string; table: string; id_field: string }>
> = {
  log_protocol_event: {
    effect_type: "protocol_event.log",
    table: "protocol_events",
    id_field: "protocol_event_id",
  },
  declare_deviation: {
    effect_type: "planned_deviation.declare",
    table: "planned_deviations",
    id_field: "planned_deviation_id",
  },
  declare_safety_constraint: {
    effect_type: "safety_constraint.declare",
    table: "student_safety_constraints",
    id_field: "constraint_id",
  },
};

function keelLedgerPayloadSummary(
  effect: Record<string, unknown>,
): Record<string, unknown> {
  // Uniquement des valeurs RELUES ou des tokens: aucune prose de l'élève ne
  // transite par le ledger (le `student_note` reste dans `protocol_events`).
  return {
    local_date: effect.local_date ?? undefined,
    slot_key: effect.slot_key ?? undefined,
    source: effect.source ?? undefined,
    kind: effect.kind ?? undefined,
    already_logged: effect.already_logged ?? undefined,
    already_declared: effect.already_declared ?? undefined,
    coach_authorized_backdate: effect.coach_authorized_backdate ?? undefined,
    consumed_flex: effect.consumed_flex ?? undefined,
  };
}

export function recordKeelDirectEffectsInLedger(args: {
  ledger: EffectLedger;
  toolSkillRun: Record<string, unknown> | null | undefined;
}): void {
  const run = args.toolSkillRun;
  if (!run || typeof run !== "object" || Array.isArray(run)) return;
  const status = String(run.status ?? "").trim() || null;
  const lists: Array<
    [
      string,
      (
        ledger: EffectLedger,
        entry: Parameters<typeof recordRequestedEffect>[1],
      ) => unknown,
      "router" | "executor",
    ]
  > = [
    ["requested_effects", recordRequestedEffect, "router"],
    ["allowed_effects", recordAllowedEffect, "router"],
    ["committed_effects", recordCommittedEffect, "executor"],
    ["failed_effects", recordFailedEffect, "executor"],
    ["blocked_effects", recordBlockedEffect, "executor"],
  ];
  for (const [key, record, source] of lists) {
    const effects = Array.isArray(run[key]) ? run[key] as unknown[] : [];
    for (const [index, raw] of effects.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const effect = raw as Record<string, unknown>;
      const operationType = String(effect.type ?? "").trim();
      const mapping = KEEL_LEDGER_EFFECT_TYPES[operationType];
      if (!mapping) continue;
      const committedId = key === "committed_effects"
        ? String(effect[mapping.id_field] ?? "").trim() || null
        : null;
      record(args.ledger, {
        effect_id:
          `${args.ledger.turn_id}:${key}:${mapping.effect_type}:${index}`,
        effect_type: mapping.effect_type,
        operation_type: operationType,
        operation_id: null,
        committed_id: committedId,
        tool_id: operationType,
        source,
        reason_code: String(effect.reason_code ?? status ?? "") || null,
        payload_summary: keelLedgerPayloadSummary(effect),
        db_ref: committedId
          ? { table: mapping.table, id: committedId }
          : null,
      });
    }
  }
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
  recordKeelDirectEffectsInLedger({
    ledger: effectLedger,
    toolSkillRun: operationRuntime?.toolSkillRun,
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

// ===========================================================================
// W4.7 — MAILLON 1: le CONTEXTE de tour d'un élève KEEL
// ===========================================================================

export type KeelTurnContext = {
  role: KeelRole;
  is_student: boolean;
  /** ISO-3166 alpha-2, résolveur de ressources cliniques (W3.3 + W4.6). */
  country: string | null;
  /**
   * R2/R3 — BCP-47 PERSISTÉ du profil. Les deux écritures durables refusent
   * de committer sans lui plutôt que de deviner la langue d'une prose stockée
   * (`missing_content_locale`). On ne fabrique donc jamais de valeur ici.
   */
  content_locale: string | null;
  /** YYYY-MM-DD résolu dans le fuseau de l'élève par le runtime, pas ici. */
  local_date: string | null;
  /**
   * FF-008 — `profiles.display_unit_system`, tel quel.
   *
   * OBLIGATOIRE et jamais optionnel: `detectDeclaredBodyMeasure` s'en sert pour
   * lire « je suis à 172 » chez quelqu'un qui pense en livres, et ce dépôt a
   * déjà mesuré qu'« un paramètre de garde optionnel est une garde désarmée ».
   * `'metric'` est le DÉFAUT DE LA COLONNE (not null default 'metric'), pas une
   * valeur inventée ici.
   */
  display_unit_system: "metric" | "imperial";
  /**
   * FF-008 — le verdict d'âge, pour la garde « aucune mesure enregistrée depuis
   * le chat chez un mineur ».
   *
   * C'est `assessBirthDate` qui décide, jamais un booléen recalculé: le dépôt a
   * UNE définition du mineur, elle porte déjà la ceinture qui refuse un plan
   * nutritionnel à un enfant, et une seconde divergerait au premier ajustement.
   * `null` hors élève KEEL ou sans date locale.
   */
  age_verdict: BirthDateVerdict | null;
  plan_context: KeelPlanContext | null;
  plan_version_id: string | null;
  /** Le bloc à injecter (dispatcher ET composeur). Null = rien à dire. */
  plan_block: string | null;
  plan_context_reason_code: string;
  /**
   * Plancher TCA du tour. `null` ⇒ NON ARMÉ — et c'est un état distinct de
   * `restriction_flag:false` (voir `restriction_unavailable_reason`).
   */
  restriction: RestrictionGuardResult | null;
  restriction_unavailable_reason: string | null;
  /**
   * PIVOT §3.3 — les contraintes dures de l'élève, pour la CEINTURE DE SORTIE.
   *
   * `null` ⇒ la lecture a échoué, et c'est un état DISTINCT de `[]` (aucune
   * contrainte). `loadStudentSafetyConstraints` throw exprès pour rendre ces
   * deux cas indiscernables impossibles; on rattrape ici et on nomme.
   */
  safety_constraints: StudentSafetyConstraint[] | null;
  safety_constraints_unavailable_reason: string | null;
  /** PIVOT §3.3 — la doctrine publiée du coach de cet élève. */
  doctrine: LoadedDoctrine | null;
  /**
   * LA NOTE 1:1 DU COACH SUR CET ÉLÈVE (2026-08-05), ou `null` hors élève KEEL.
   *
   * Elle voyage sur le contexte de tour, à côté de la doctrine, parce qu'elle
   * est injectée par le MÊME composeur (`withKeelPromptBlocks`) et qu'un
   * second chargement ailleurs serait une deuxième source de vérité pour le
   * même texte. Absente (`reason !== "loaded"`), elle ne pousse aucun bloc.
   */
  coach_note: LoadedCoachNote | null;
  /**
   * LE DERNIER BILAN HEBDOMADAIRE CALCULÉ de cet élève, ou `null`.
   *
   * ── POURQUOI IL VOYAGE SUR LE TOUR ET NE SE RECALCULE PAS ────────────────
   * Le bilan est GELÉ au moment où le point du dimanche part
   * (`week_review_io.ts`, « l'ordre des trois temps »). La conversation de
   * toute la semaine suivante cite donc exactement les nombres que l'élève a
   * lus dans son bilan. Recalculer à chaque tour donnerait un chiffre qui
   * bouge entre deux messages — et un chiffre qui bouge est indéfendable,
   * même quand chacune de ses valeurs était juste.
   *
   * `null` en régime nominal la première semaine, et pour tout élève dont le
   * cron n'a pas encore tourné. Absent, il ne pousse RIEN — pas d'en-tête,
   * pas de « je n'ai pas encore de bilan »: c'est la leçon de
   * `NO_COACH_METHOD_BLOCK`, dont le titre décrivait un état interne et
   * ressortait mot pour mot dans la bouche de l'agent.
   */
  week_review: StoredWeekReview | null;
  /**
   * FF-013 — LE DERNIER TAP DU SOIR CITABLE, ou `null`.
   *
   * ── POURQUOI IL VOYAGE SUR LE TOUR ─────────────────────────────────────
   * L'énergie, la faim et le sommeil sont déjà pris DEUX fois. Le chat les
   * redemandait parce qu'il ne les connaissait pas: `sophia-brain` ne lisait
   * NI `student_daily_checkins` NI le biofeedback de la semaine. Un agent qui
   * ignore une donnée finit toujours par la demander, quelle que soit la
   * consigne — d'où le chargement AVANT l'interdiction, et pas l'inverse.
   *
   * `null` couvre trois cas qui se comportent pareil et se journalisent
   * différemment: aucun tap dans la fenêtre, lecture en panne, plancher de
   * restriction levé. Dans les trois, l'agent ne sait rien — et « ne rien
   * savoir » n'est JAMAIS « la journée s'est bien passée ».
   */
  daily_pulse: CitablePulse | null;
  /**
   * FF-011 — LES FAITS DE LA JOURNÉE, ou `null`.
   *
   * La matière du soutien groundé. `null` couvre trois cas: pas d'élève KEEL,
   * plancher de restriction levé (filtré AU CHARGEMENT), lecture en panne.
   *
   * ⚠️ `null` ET UNE JOURNÉE VIDE NE SONT PAS LA MÊME CHOSE, et la distinction
   * porte la ceinture: `null` n'autorise AUCUN nombre de journée, parce qu'on
   * ne justifie pas un chiffre avec des faits qu'on n'a pas lus. Une journée
   * vide autorise ses zéros, qui sont des faits.
   */
  day_facts: DayFacts | null;
  /**
   * FF-011 — le verdict de `supportGround`, calculé UNE fois par tour.
   *
   * Il décide AVANT la rédaction: on ne demande pas au modèle d'être groundé,
   * on lui donne de la matière ou on raccourcit sa laisse.
   */
  support_ground: SupportGround;
  /**
   * FF-010 — LE FOYER DE CET ÉLÈVE, filtré, ou `null`.
   *
   * `null` couvre quatre cas qui se comportent pareil: pas de foyer, plan
   * périmé, lecture en panne, roster illisible. Aucun ne produit « ton foyer
   * n'a rien prévu » à quelqu'un qui vit seul (R8) — le bloc n'est simplement
   * pas injecté.
   *
   * ⚠️ LA VISIBILITÉ EST DÉJÀ APPLIQUÉE ICI. Ce que le chargeur a refusé
   * n'entre pas dans le contexte, donc il n'y a rien à ne pas dire: un prompt
   * qui porte la donnée et une consigne de la taire est un prompt qui la dira.
   */
  household: HouseholdTurnContext | null;
  /**
   * LA QUESTION DE PRÉCISION armée par CE tour, ou `null`.
   *
   * Elle voyage ici et pas sur le `turn_frame` pour une raison mesurée: un
   * redispatch de sortie de flow RECONSTRUIT le frame et perd ce qu'on y avait
   * posé (`p5-execution-truth`, `oneShotReminderCommittedThisTurn` existe pour
   * exactement ça). `keelTurn`, lui, est un local de tour passé
   * OBLIGATOIREMENT à `finalVisibleText` — donc aux six chemins de sortie, et
   * le compilateur refuse d'en oublier un.
   *
   * Le TEXTE est un gabarit fermé (`MEAL_PRECISION_QUESTIONS`), jamais une
   * génération: c'est la seule garantie structurelle qu'aucune question de
   * quantité ne sort, quelle que soit l'humeur du composeur.
   */
  meal_precision_question?: string | null;
  /**
   * FF-025 — L'INVITATION À LA PHOTO armée par CE tour, ou `null`.
   *
   * Même véhicule et même raison que `meal_precision_question` ci-dessus: un
   * redispatch de sortie de flow reconstruit le `turn_frame` et perdrait ce
   * qu'on y aurait posé, alors que `keelTurn` est passé OBLIGATOIREMENT à
   * `finalVisibleText` sur les six chemins de sortie.
   *
   * Le TEXTE est un gabarit fermé (`photo_invitation.ts`), jamais une
   * génération: c'est la seule garantie structurelle que le registre reste
   * l'utilité et jamais le contrôle (R6), quelle que soit l'humeur du composeur.
   */
  meal_photo_invitation?: string | null;
  /**
   * LE JETON DE MALADIE DÉCLARÉE CE TOUR-CI, ou null.
   *
   * OBLIGATOIRE, pas optionnel, et c'est délibéré: ce dépôt a déjà mesuré
   * qu'« un paramètre de garde optionnel est une garde désarmée ». Le
   * compilateur est le seul relecteur qui ne se fatigue pas — même raisonnement
   * que le `keel` obligatoire de `finalVisibleText`.
   *
   * Il vient du plancher déterministe `detectDeclaredMedicalCondition`, JAMAIS
   * du dispatcher: la campagne du 2026-08-05 a mesuré le renvoi clinicien à
   * FR 0/3 et EN 1/3 quand il dépendait du LLM.
   */
  declared_medical_condition: string | null;
};

export const LEGACY_KEEL_TURN_CONTEXT: KeelTurnContext = {
  role: null,
  is_student: false,
  country: null,
  content_locale: null,
  local_date: null,
  display_unit_system: "metric",
  age_verdict: null,
  plan_context: null,
  plan_version_id: null,
  plan_block: null,
  plan_context_reason_code: "legacy_plan_snapshot",
  restriction: null,
  restriction_unavailable_reason: null,
  declared_medical_condition: null,
  safety_constraints: null,
  safety_constraints_unavailable_reason: null,
  doctrine: null,
  coach_note: null,
  week_review: null,
  daily_pulse: null,
  day_facts: null,
  support_ground: "none",
  household: null,
};

const ISO_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function keelLocalDateFrom(userLocalDatetime: unknown): string | null {
  const head = String(userLocalDatetime ?? "").trim().slice(0, 10);
  return ISO_LOCAL_DATE.test(head) ? head : null;
}

function normalizeKeelRole(value: unknown): KeelRole {
  const raw = String(value ?? "").trim();
  return raw === "student" || raw === "coach" ? raw : null;
}

/**
 * Charge tout ce dont le tour a besoin côté KEEL, en une passe.
 *
 * FAIL-OPEN NOMMÉ, et l'arbitrage est explicite: une panne de lecture ne doit
 * PAS ouvrir le flow clinique. Un faux négatif ici = un tour normal pour un
 * élève en restriction (le plancher reste armé côté proactif depuis W4.6, où
 * il est fail-CLOSED); un faux positif = tous les élèves enfermés dans un flow
 * TCA pendant une panne de base. L'asymétrie tranche, et l'incident est
 * bruyant (`restriction_unavailable_reason` + log).
 *
 * Le contexte plan, lui, ne retombe JAMAIS sur `user_plan_items`
 * (`selectDispatcherPlanContext` porte cette règle): un élève KEEL dont le
 * plan n'a pas pu être lu n'a pas de bloc plan du tout.
 */
export async function loadKeelTurnContext(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userLocalDatetime: string | null;
  legacyPlanSnapshot: unknown;
}): Promise<KeelTurnContext> {
  let profileRow: Record<string, unknown> | null = null;
  try {
    const { data, error } = await args.supabase
      .from("profiles")
      // FF-008 ajoute DEUX colonnes à une requête qui existait déjà, plutôt
      // qu'un second aller-retour: `display_unit_system` lève l'ambiguïté
      // d'unité d'une mesure annoncée, `birth_date` porte la garde « pas de
      // suivi de poids chez un mineur ».
      .select("keel_role, country, locale, display_unit_system, birth_date")
      .eq("id", args.userId)
      .maybeSingle();
    if (error) throw error;
    profileRow = (data ?? null) as Record<string, unknown> | null;
  } catch (error) {
    // Sans rôle lisible, le tour reste LEGACY: on n'ouvre pas une surface
    // KEEL sur une lecture ratée.
    console.warn("[keel] profile role load failed", error);
    return LEGACY_KEEL_TURN_CONTEXT;
  }

  const role = normalizeKeelRole(profileRow?.keel_role);
  if (role !== "student") {
    return { ...LEGACY_KEEL_TURN_CONTEXT, role };
  }

  const country = String(profileRow?.country ?? "").trim() || null;
  const contentLocale = String(profileRow?.locale ?? "").trim() || null;
  const localDate = keelLocalDateFrom(args.userLocalDatetime);
  // La colonne est `not null default 'metric'` et son CHECK n'accepte que ces
  // deux valeurs. On ne « corrige » donc rien: on refuse simplement d'inventer
  // une troisième lecture si la colonne portait un jour autre chose.
  const displayUnitSystem: DisplayUnitSystem =
    String(profileRow?.display_unit_system ?? "").trim() === "imperial"
      ? "imperial"
      : "metric";
  // Le verdict d'âge a besoin de la date LOCALE de l'élève pour être rejouable
  // (deux appels le même jour doivent rendre le même verdict, y compris à
  // cheval sur minuit UTC). Sans elle, pas de verdict — et le plancher de
  // mesure ne s'arme pas, ce qui est la direction sûre.
  const ageVerdict = localDate
    ? assessBirthDate(profileRow?.birth_date, localDate)
    : null;

  let planContext: KeelPlanContext | null = null;
  if (localDate) {
    try {
      planContext = buildKeelPlanContext(
        await loadKeelPlanContextSnapshot(args.supabase as never, {
          user_id: args.userId,
          local_date: localDate,
          day: dayTokenForLocalDate(localDate),
        }),
      );
    } catch (error) {
      console.warn("[keel] plan context load failed", error);
      planContext = null;
    }
  }

  const selection = selectDispatcherPlanContext({
    keel_role: role,
    keel_context: planContext,
    legacy_plan_snapshot: args.legacyPlanSnapshot,
    legacy_block: null,
  });

  let restriction: RestrictionGuardResult | null = null;
  let restrictionUnavailableReason: string | null = null;
  if (localDate) {
    try {
      restriction = await evaluateRestrictionForStudent(
        args.supabase as never,
        {
          userId: args.userId,
          asOfLocalDate: localDate,
          turnMessage: args.userMessage,
          turnLocale: contentLocale,
        },
      );
    } catch (error) {
      restrictionUnavailableReason = error instanceof Error
        ? error.message
        : String(error);
      console.warn(
        "[keel] restriction guard unavailable for this turn (conversational floor NOT armed)",
        restrictionUnavailableReason,
      );
    }
  } else {
    restrictionUnavailableReason = "missing_local_date";
  }

  // PIVOT §3.3 — CEINTURE DE SORTIE, moitié « contraintes dures ».
  //
  // FAIL-OPEN NOMMÉ, même arbitrage que le plancher TCA juste au-dessus:
  // bloquer la livraison de TOUS les messages de TOUS les élèves pendant un
  // hoquet Postgres est une panne produit complète, alors qu'un tour non
  // vérifié est un risque borné.
  //
  // ⚠️ CE COMMENTAIRE A ÉTÉ FAUX, et c'est le genre de faux qui coûte cher.
  // Il disait: « le prompt porte déjà les contraintes, seule la vérification
  // déterministe manque ». Vérifié le 2026-08-03 (QA agent 4): AUCUN prompt ne
  // portait les contraintes. Le fail-open — le seul arbitrage
  // disponibilité-contre-vérification du fichier — était donc adossé à une
  // moitié de verrou qui n'existait pas: en panne de lecture, il ne restait
  // RIEN, pas « une moitié sur deux ».
  //
  // La phrase est maintenant vraie: `withKeelDoctrineBlock` injecte
  // `safetyConstraintsPromptBlock` en TÊTE du contexte. Le fail-open dégrade
  // donc bien de deux moitiés à une seule, ce qui est ce qu'il prétendait
  // faire. Si l'injection de prompt disparaît un jour, CE FAIL-OPEN DOIT ÊTRE
  // INVERSÉ en même temps — les deux se tiennent, et c'est la raison d'être de
  // ce paragraphe.
  //
  // L'incident est BRUYANT (`safety_constraints_unavailable_reason` + log), et
  // la distinction `null` (pas lu) / `[]` (rien à lire) est préservée: c'est
  // exactement ce que `loadStudentSafetyConstraints` protège en throwant.
  let safetyConstraints: StudentSafetyConstraint[] | null = null;
  let safetyConstraintsUnavailableReason: string | null = null;
  try {
    safetyConstraints = await loadStudentSafetyConstraints(
      args.supabase as never,
      args.userId,
    );
  } catch (error) {
    safetyConstraintsUnavailableReason = error instanceof Error
      ? error.message
      : String(error);
    console.warn(
      "[keel] safety constraints unavailable for this turn (OUTPUT LOCK NOT ARMED)",
      safetyConstraintsUnavailableReason,
    );
  }

  // PIVOT §3.3 — moitié « interdits du coach ». Ne throw jamais: le loader
  // porte son propre arbitrage de panne (bloc de prudence).
  const doctrine = await loadPublishedDoctrine(args.supabase, args.userId);

  // La moitié « 1:1 assumé » — mode optionnel, absent chez la quasi-totalité
  // des élèves. Ne throw jamais et porte son propre arbitrage de panne.
  const coachNote = await loadCoachNote(args.supabase, args.userId);

  // LE BILAN DE LA DERNIÈRE SEMAINE EXAMINÉE. Ne throw jamais: une lecture en
  // panne ou une forme illisible rend `null`, et le tour perd un sujet de
  // conversation — pas la conversation. Le pire cas de l'alternative serait un
  // chiffre faux cité dans la bulle, que ni l'élève ni le coach ne peuvent
  // distinguer d'un vrai.
  const weekReview = await loadLatestWeekReview(args.supabase, args.userId);

  // FF-013 — LE TAP DU SOIR, FILTRÉ AU CHARGEMENT.
  //
  // ⚠️ LE FILTRE DE RESTRICTION EST ICI, PAS À LA RÉDACTION. C'est la règle que
  // FF-010 formule et que celle-ci applique: « un prompt qui porte la donnée et
  // une consigne de ne pas la dire est un prompt qui la dira ». Sous plancher
  // levé, la matière n'entre pas — il n'y a donc rien à ne pas dire.
  //
  // `restriction === null` (lecture en panne) NE ferme PAS la porte, et c'est
  // le même arbitrage fail-open nommé que le plancher lui-même vingt lignes
  // plus haut: un tour non filtré est un risque borné, tous les élèves privés
  // de contexte pendant un hoquet Postgres est une panne produit.
  const restrictionRaised = restriction?.restriction_flag === true;
  const dailyPulse = restrictionRaised || !localDate
    ? null
    : await loadLatestPulse(args.supabase, {
      userId: args.userId,
      localDate,
    });

  // FF-011 — LA MATIÈRE DU SOUTIEN GROUNDÉ, filtrée au CHARGEMENT elle aussi.
  //
  // `loadDayFacts` ne jette jamais: une lecture en panne rend `EMPTY_DAY_FACTS`
  // et journalise. On garde ici la distinction que le chargeur perd — `null`
  // (« je n'ai pas lu ») contre une journée vide (« j'ai lu, il n'y a rien ») —
  // parce que c'est elle qui décide si un zéro est un fait citable ou un
  // chiffre inventé.
  const dayFacts = restrictionRaised || !localDate
    ? null
    : await loadDayFacts(args.supabase, { userId: args.userId, localDate });
  const groundOfSupport = supportGround(
    dayFacts,
    restrictionRaised ? null : (weekReview?.reading ?? null),
  );

  // FF-010 — LE FOYER. Il n'est PAS filtré par le plancher de restriction, et
  // c'est délibéré: « on mange quoi ce soir ? » est une question de cuisine,
  // pas une surface d'adhérence. Le bloc ne porte ni score, ni poids, ni
  // progression — rien de ce que `SUPPRESSED_STUDENT_SURFACES` suspend. Le
  // taire sous plancher levé priverait quelqu'un en difficulté de la seule
  // information pratique dont il a besoin pour dîner.
  const household = localDate
    ? await loadHouseholdTurnContext(args.supabase, {
      userId: args.userId,
      localDate,
    })
    : null;

  return {
    role,
    is_student: true,
    country,
    content_locale: contentLocale,
    local_date: localDate,
    display_unit_system: displayUnitSystem,
    age_verdict: ageVerdict,
    plan_context: planContext,
    plan_version_id: planContext?.plan_version_id ?? null,
    plan_block: selection.block,
    plan_context_reason_code: selection.reason_code,
    restriction,
    restriction_unavailable_reason: restrictionUnavailableReason,
    // Le chargeur ne voit pas le message du tour: c'est le plancher, plus bas
    // dans `run`, qui le renseigne. Null ici veut dire « pas encore lu », pas
    // « rien déclaré ».
    declared_medical_condition: null,
    safety_constraints: safetyConstraints,
    safety_constraints_unavailable_reason: safetyConstraintsUnavailableReason,
    doctrine,
    coach_note: coachNote,
    week_review: weekReview,
    daily_pulse: dailyPulse,
    day_facts: dayFacts,
    support_ground: groundOfSupport,
    household,
  };
}

// ===========================================================================
// W4.7 — MAILLON 5: le plancher TCA, côté CONVERSATION
//
// `active_flow_state.ts` (hors périmètre de ce lot) ne reconnaît PAS
// `disordered_eating_guard` comme flow local: `readActiveFlowState` renverrait
// donc null et la branche de continuation de `routers.ts` est inatteignable.
// La continuité de l'épisode est donc portée ici, par une clé de temp_memory
// dédiée: le reducer reçoit son état précédent et avance normalement
// (entry → supported/holding → closed), et l'entrée du routeur se réarme à
// chaque tour tant que le plancher est levé.
//
// CONDITION DE DÉSARMEMENT (doctrine P9, et elle est obligatoire ici): un flow
// qu'on ne peut pas quitter est un piège — c'est la cicatrice
// `safety-crisis-flow-no-exit-on-denial`. Une fois l'épisode CLOS (le reducer
// a dit exit: demande de passer à autre chose, deuxième refus, plafond de
// 6 tours), le flow ne se rouvre plus pour LE MÊME jeu de déclencheurs. Il se
// rouvre si les déclencheurs changent, ou si le tour courant rapporte un
// symptôme médical aigu — ces deux-là sont nommés, pas implicites.
// ===========================================================================

export const KEEL_DISORDERED_EATING_STATE_KEY =
  "__keel_disordered_eating_guard_state";

export type KeelDisorderedEatingEpisodeState = {
  episode_key: string;
  closed: boolean;
  working_state: DisorderedEatingWorkingState;
  updated_at: string;
};

function restrictionEpisodeKey(result: RestrictionGuardResult): string {
  return [...result.triggers.map((trigger) => trigger.code)].sort().join("+");
}

function readDisorderedEatingEpisode(
  tempMemory: unknown,
): KeelDisorderedEatingEpisodeState | null {
  const raw = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[KEEL_DISORDERED_EATING_STATE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    episode_key: String(record.episode_key ?? ""),
    closed: record.closed === true,
    working_state:
      record.working_state && typeof record.working_state === "object" &&
        !Array.isArray(record.working_state)
        ? record.working_state as DisorderedEatingWorkingState
        : {},
    updated_at: String(record.updated_at ?? ""),
  };
}

/**
 * Le plancher, tel qu'il est présenté à `runConversationRouters`.
 * `null` ⇒ lane non armée. Aucune valeur inventée: ce qui sort d'ici est soit
 * le verdict du guard, soit rien.
 */
export function conversationalRestrictionGuardForRouters(args: {
  restriction: RestrictionGuardResult | null;
  tempMemory: unknown;
  userMessage: string;
}): { restriction_flag: boolean; trigger_codes?: string[] } | null {
  const result = args.restriction;
  if (!result || result.restriction_flag !== true) return null;
  const episode = readDisorderedEatingEpisode(args.tempMemory);
  const sameEpisode = episode !== null &&
    episode.episode_key === restrictionEpisodeKey(result);
  const acuteMedicalThisTurn =
    classifyStudentTurn(args.userMessage) === "reports_acute_medical";
  if (episode?.closed === true && sameEpisode && !acuteMedicalThisTurn) {
    return null;
  }
  return {
    restriction_flag: true,
    trigger_codes: result.triggers.map((trigger) => trigger.code),
  };
}

export function applyDisorderedEatingEpisodeState(args: {
  tempMemory: Record<string, unknown>;
  restriction: RestrictionGuardResult;
  statePatch: DisorderedEatingWorkingState;
  closed: boolean;
}): Record<string, unknown> {
  return {
    ...args.tempMemory,
    [KEEL_DISORDERED_EATING_STATE_KEY]: {
      episode_key: restrictionEpisodeKey(args.restriction),
      closed: args.closed,
      working_state: args.statePatch,
      updated_at: new Date().toISOString(),
    } satisfies KeelDisorderedEatingEpisodeState,
  };
}

export function disorderedEatingWorkingStateForTurn(
  tempMemory: unknown,
  restriction: RestrictionGuardResult,
): DisorderedEatingWorkingState {
  const episode = readDisorderedEatingEpisode(tempMemory);
  if (!episode) return {};
  // Un épisode qui change de déclencheurs repart à zéro: reprendre le compteur
  // de tours d'un épisode précédent ferait expirer le nouveau au premier tour.
  return episode.episode_key === restrictionEpisodeKey(restriction)
    ? episode.working_state
    : {};
}

// ===========================================================================
// W4.7 — MAILLON 3: la lane d'EXÉCUTION des deux effets durables KEEL
//
// Même passage que `track_progress_plan_item`: la ROUTE décide (la liste
// `direct_effects_to_run` sort de `routers.ts` puis du gate orchestrateur,
// default-deny), l'exécuteur write-through écrit et RELIT, le ledger compte,
// le renderer n'accuse que ce qui est committé. Rien n'est court-circuité ici:
// les routers de `log_protocol_event` / `declare_deviation` repassent eux-mêmes
// par `runDirectEffectGate` — deux portes du même verrou, toutes deux
// default-deny, jamais une seule qui contredirait l'autre.
// ===========================================================================

function keelToolExecutionFor(
  status: string,
): OperationRuntimeResult["toolExecution"] {
  if (
    status === "logged" || status === "declared" || status === "recorded"
  ) return "success";
  if (status === "failed") return "failed";
  if (status === "ignored") return "none";
  return "blocked";
}

/**
 * Titre de cible du ledger et du contrat de confirmation, construit
 * EXCLUSIVEMENT depuis la ligne RELUE. Les échos de la requête portés par
 * l'effet committé (`substance_ref`, `quantity`) sont volontairement exclus:
 * ils n'ont pas traversé la base, et un accusé de réception ne cite que ce
 * que la base a rendu.
 */
/**
 * Les `commitment_id` qu'une liaison explicite peut légitimement citer ce tour.
 *
 * INVARIANT: c'est le MÊME ensemble que celui rendu par
 * `keelPlanContextPromptBlock` — `today` + `week`. Le bloc est la seule chose
 * que le modèle voit; accepter moins que ce qu'on montre transforme une
 * recopie fidèle en `needs_clarify`, accepter plus rouvre la porte aux id
 * devinés que `resolveCommitmentId` existe pour fermer.
 *
 * Les lignes `week` en font partie: elles apparaissent dans le bloc sous
 * « WEEK GRAIN », et un élève peut parfaitement rapporter aujourd'hui un fait
 * qui s'y rattache.
 */
export function keelBindableCommitmentIds(
  context: KeelPlanContext | null,
): string[] {
  if (!context) return [];
  const ids = [
    ...context.today.map((line) => line.commitment_id),
    ...context.week.map((line) => line.commitment_id),
  ].filter((id) => typeof id === "string" && id.trim() !== "");
  return [...new Set(ids)];
}

function keelCommittedTargetTitle(
  type: string,
  effect: Record<string, unknown>,
): string {
  const localDate = String(effect.local_date ?? "").trim();
  const slot = String(effect.slot_key ?? "").trim();
  const scope = slot ? `${localDate} (${slot})` : localDate;
  if (type === "declare_deviation") {
    const kind = String(effect.kind ?? "").trim();
    return `planned_deviations ${scope}${kind ? ` — ${kind}` : ""}`;
  }
  return `protocol_events ${scope}`;
}

export type KeelDirectEffectLaneInput = {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
  tempMemory: unknown;
  keel: KeelTurnContext;
  /**
   * Les identités déjà écrites pour le repas que ce tour PRÉCISE. Elles sont
   * interdites à l'intake: « du poulet avec du riz » en réponse à « et avec
   * quoi ? » ne doit pas refaire un poulet.
   */
  suppressComponentKeys?: readonly string[];
  /** La ligne d'origine à laquelle rattacher un composant ajouté. */
  precisionAnswerTo?: string | null;
};

/**
 * L'EFFET DU PLANCHER DE REPAS — une seule écriture de ce payload, parce qu'il
 * a maintenant DEUX appelants: l'ajout sur silence du dispatcher, et le FILET
 * qui le rejoue quand la demande du dispatcher a été refusée. Deux copies
 * auraient divergé au premier champ ajouté, et la divergence serait invisible
 * (le filet ne se déclenche qu'une fois sur dix).
 */
export function mealDeclarationFloorEffect(
  hit: MealDeclarationHit,
): TurnFrame["direct_effects"][number] {
  return {
    effect_type: "log_protocol_event",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: {
      // `components` porte la CARDINALITÉ (règle D2 de l'intake): un message
      // qui nomme trois aliments écrit trois lignes, jamais « l'entrée la plus
      // porteuse ».
      components: hit.components.map((c) => ({
        food_group_ref: c.food_group_ref,
      })),
      student_note: hit.studentNote,
      // FF-009. Absente quand le message ne porte aucun marqueur: `null` reste
      // `null`, et ne devient JAMAIS `as_planned`.
      ...(hit.planRelation ? { plan_relation: hit.planRelation } : {}),
    },
  };
}

/**
 * FF-009 — LES REFUS QUI ARMENT LE FILET DU PLANCHER, et EUX SEULS.
 *
 * Ce sont les quatre refus de FORME du payload (`log_protocol_event/router.ts`
 * les range déjà ensemble en `needs_clarify`): le modèle a écrit quelque chose
 * que l'intake ne sait pas lire. Ce sont exactement les cas où un plancher
 * déterministe doit tenir, et ce sont les seuls.
 *
 * ⚠️ CONDITION DE DÉSARMEMENT (P9), et elle est la moitié de la ceinture.
 * `future_intent` (« je vais commander »), `components_already_logged` (la
 * lane de précision a déjà écrit ces composants) et `duplicate_db` sont des
 * refus JUSTES: rejouer dessus écrirait un fait sur une intention, ou un
 * doublon sur un fait déjà en base. Le filet ne les touche pas.
 */
const MEAL_FLOOR_NET_REASONS: ReadonlySet<string> = new Set([
  "unknown_token",
  "unknown_commitment",
  "too_many_components",
  "empty_payload",
]);

export function mealFloorNetArms(args: {
  /** Le fait que le plancher a reconnu, ou `null` s'il n'a rien reconnu. */
  floorHit: MealDeclarationHit | null;
  committedEffects: readonly unknown[];
  blockedEffects: readonly unknown[];
  /** La lane de précision a-t-elle retiré l'effet EXPRÈS ? */
  suppressedByPrecision: boolean;
}): boolean {
  if (args.floorHit === null) return false;
  if (args.suppressedByPrecision) return false;
  const typeOf = (effect: unknown): string =>
    Boolean(effect) && typeof effect === "object" && !Array.isArray(effect)
      ? String((effect as Record<string, unknown>).type ?? "")
      : "";
  // Une seule ligne écrite suffit à désarmer: le fait existe, et le filet ne
  // sert qu'à l'absence totale.
  if (args.committedEffects.some((e) => typeOf(e) === "log_protocol_event")) {
    return false;
  }
  return args.blockedEffects.some((effect) => {
    if (typeOf(effect) !== "log_protocol_event") return false;
    const reason = String(
      (effect as Record<string, unknown>).reason_code ?? "",
    );
    return MEAL_FLOOR_NET_REASONS.has(reason);
  });
}

export async function runKeelDirectEffectLane(
  input: KeelDirectEffectLaneInput,
): Promise<OperationRuntimeResult | null> {
  if (!input.keel.is_student) return null;
  const toRun = new Set(input.routeDecision.direct_effects_to_run);
  const runLog = toRun.has("log_protocol_event");
  const runDeviation = toRun.has("declare_deviation");
  const runConstraint = toRun.has("declare_safety_constraint");
  if (!runLog && !runDeviation && !runConstraint) return null;

  const handlers: string[] = [];
  const replies: string[] = [];
  const requested: unknown[] = [];
  const allowed: unknown[] = [];
  const committed: unknown[] = [];
  const blocked: unknown[] = [];
  const executedTools: string[] = [];
  const statuses: string[] = [];
  const reasons: string[] = [];

  const absorb = (
    handler: string,
    result: {
      detected: boolean;
      status: string;
      reply: string | null;
      executed_tools: readonly string[];
      requested_effects: readonly unknown[];
      allowed_effects: readonly unknown[];
      committed_effects: readonly unknown[];
      blocked_effects: readonly unknown[];
      debug: { reason_code: string };
    },
  ) => {
    if (!result.detected) return;
    handlers.push(handler);
    statuses.push(result.status);
    reasons.push(result.debug.reason_code);
    if (result.reply) replies.push(result.reply);
    requested.push(...result.requested_effects);
    allowed.push(...result.allowed_effects);
    committed.push(
      ...result.committed_effects.map((effect) => ({
        ...(effect as Record<string, unknown>),
        target_title: keelCommittedTargetTitle(
          handler,
          effect as Record<string, unknown>,
        ),
      })),
    );
    blocked.push(...result.blocked_effects);
    // Parité stricte: un outil n'est « exécuté » que s'il a produit une ligne.
    if (result.committed_effects.length > 0) {
      executedTools.push(...result.executed_tools);
    }
  };

  // CEINTURE INTENTION FUTURE — déterministe, sur le MESSAGE, pas sur le frame.
  //
  // La règle 3k-a(1) du prompt dit « jamais sur une intention future », mais un
  // prompt est une intention, pas une garantie: `rose-hard25` a déjà payé une
  // demi-coche committée en silence sur « je vais tester ce soir » côté
  // track_progress, et `p8-revalidation-rose-reds` a montré que les correctifs
  // prompt-only régressent en run réel. Ici l'enjeu est pire: `protocol_events`
  // est APPEND-ONLY — une ligne écrite sur une intention ne se retire pas
  // depuis le chat, et elle nourrira l'évaluateur ce soir.
  //
  // CONDITION DE DÉSARMEMENT (P9), et elle est essentielle: la ceinture ne vaut
  // QUE pour `log_protocol_event`, qui écrit un FAIT. Elle ne touche jamais
  // `declare_deviation`, dont l'objet même est le futur — l'y appliquer
  // rendrait la fonctionnalité impossible à utiliser.
  const futureIntentTurn = isTrackProgressFutureIntent(input.userMessage);
  if (runLog && futureIntentTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("future_intent");
    blocked.push({ type: "log_protocol_event", reason_code: "future_intent" });
  }

  // CEINTURE « LE REPAS DE QUELQU'UN D'AUTRE » — FF-009 §7, même forme et même
  // place que la ceinture d'intention future juste au-dessus.
  //
  // MESURÉ (run réel 2026-08-08, 1 tour sur 3): « on a commandé pour les
  // enfants » écrivait une ligne `protocol_events` sans aliment ni créneau. Le
  // plancher avait bien désarmé — son `DISARM` porte le motif — mais désarmer
  // le plancher n'est pas un veto sur le dispatcher: le plancher est un
  // MINIMUM. La ligne dit « l'élève a mangé » là où le message dit le
  // contraire, dans une table APPEND-ONLY, et le coach la lira comme un fait.
  //
  // CONDITION DE DÉSARMEMENT: portée par `isMealForSomeoneElse` (un « j'ai
  // mangé » au passé retire la ceinture), et comme sa voisine, elle ne vaut QUE
  // pour `log_protocol_event`.
  const forSomeoneElseTurn = isMealForSomeoneElse(input.userMessage);
  if (runLog && !futureIntentTurn && forSomeoneElseTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("meal_for_someone_else");
    blocked.push({
      type: "log_protocol_event",
      reason_code: "meal_for_someone_else",
    });
  }

  // CEINTURE « JE N'AI RIEN MANGÉ » — FF-017 §7, premier mode de défaillance,
  // et troisième membre de la même famille que ses deux voisines.
  //
  // MESURÉ (run réel 2026-08-08, 1 tour sur 3 dans CHAQUE langue):
  //   élève  : « je n'ai rien mangé aujourd'hui » / « I didn't eat anything today »
  //   base   : une ligne `protocol_events`
  //   réponse: une question de précision — « And what did you have with it? »
  // On demande donc à l'élève avec quoi il a mangé le repas qu'il vient de dire
  // n'avoir pas pris, et le coach lira lundi un repas qui n'a pas eu lieu. Le
  // plancher désarme sur la négation depuis le premier jour; ça n'a jamais été
  // un veto sur le dispatcher.
  //
  // CONDITION DE DÉSARMEMENT: portée par `isNoMealDeclared` — « je n'ai rien
  // mangé ce matin mais j'ai pris du poulet à midi » porte les deux, et c'est le
  // repas qui gagne. Comme ses voisines, elle ne vaut QUE pour
  // `log_protocol_event`.
  const noMealTurn = isNoMealDeclared(input.userMessage);
  if (runLog && !futureIntentTurn && !forSomeoneElseTurn && noMealTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("no_meal_declared");
    blocked.push({
      type: "log_protocol_event",
      reason_code: "no_meal_declared",
    });
  }

  if (runLog && !futureIntentTurn && !forSomeoneElseTurn && !noMealTurn) {
    absorb(
      "log_protocol_event",
      await runLogProtocolEventDirectEffect({
        turn_frame: input.turnFrame,
        content_locale: input.keel.content_locale,
        // Le tour de chat EST la source: ni photo ni tap. `evidence_weight`
        // en découle (0.8), il n'est jamais choisi à la main.
        default_source: "chat",
        // Le créneau que l'élève a NOMMÉ, lu dans son message. Repli seulement:
        // `payload_hint.slot_key` prime quand le modèle l'émet. Mesuré 0/3 sans
        // ce repli — « for lunch », « at breakfast », « for dinner » écrivaient
        // tous `slot_key = NULL`, ce qui aurait livré le correctif B2 sur une
        // colonne vide.
        slot_named_in_message: slotKeyNamedIn(input.userMessage),
        // L'ALLOWLIST DES LIAISONS EXPLICITES, et elle n'était pas passée.
        //
        // `resolveCommitmentId` (intake.ts) refuse tout `commitment_id` quand
        // la liste est vide — c'est la bonne posture R7 (« une liaison
        // invérifiable est refusée, jamais supposée »). Mais le seul appelant de
        // production ne la fournissait pas: la liste était TOUJOURS vide, donc
        // TOUT `commitment_id` était refusé en `needs_clarify`, donc toute ligne
        // sans `substance_ref` ni `food_group_ref` (mouvement, lumière,
        // sommeil, respiration, écrans, mesure) était INECRIVABLE depuis le
        // chat. Mesuré: « j'ai fait ma marche de 30 minutes » →
        // `status=needs_clarify committed=0 blocked=1`, la ligne mouvement
        // clôturait la journée en `missed`, et la réponse disait « c'est pris
        // en compte ».
        //
        // La liste est EXACTEMENT l'ensemble des lignes que le bloc a montrées
        // au modèle (`today` + `week`, cf. `keelPlanContextPromptBlock`). Toute
        // divergence entre ce qu'on affiche et ce qu'on accepte reproduit le
        // même défaut à l'envers: le modèle recopie fidèlement un id qu'on lui
        // a montré et le runtime le rejette.
        allowed_commitment_ids: keelBindableCommitmentIds(input.keel.plan_context),
        suppress_component_keys: input.suppressComponentKeys ?? null,
        precision_answer_to: input.precisionAnswerTo ?? null,
        write_protocol_event: createProtocolEventWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  // QA agent 4 — L'ÉCRITURE DE LA CONTRAINTE DURE.
  //
  // Elle ne porte AUCUNE des deux ceintures des effets voisins, et chacune de
  // ces absences est une décision:
  //   * pas de ceinture « intention future »: « je vais être allergique » n'a
  //     pas de sens. La contrainte est un état, pas un événement daté.
  //   * pas de dépendance au plan: `plan_context` peut être null. Une allergie
  //     déclarée par un élève sans plan publié doit être enregistrée quand
  //     même — c'est précisément le moment où le coach ne l'a pas encore vue.
  if (runConstraint) {
    absorb(
      "declare_safety_constraint",
      await runDeclareSafetyConstraintDirectEffect({
        turn_frame: input.turnFrame,
        user_id: input.userId,
        content_locale: input.keel.content_locale,
        write_safety_constraint: createSafetyConstraintWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  if (runDeviation) {
    absorb(
      "declare_deviation",
      await runDeclareDeviationDirectEffect({
        turn_frame: input.turnFrame,
        plan_version_id: input.keel.plan_version_id,
        content_locale: input.keel.content_locale,
        declared_via: "chat",
        read_day_resolution: (localDate: string) =>
          readKeelDayResolution({
            supabase: input.supabase,
            userId: input.userId,
            localDate,
          }),
        // Jamais lu depuis la conversation (contract.ts): une autorisation
        // qu'une couche probabiliste peut affirmer n'est pas une autorisation.
        // Le canal coach n'existe pas encore → aucune dérogation possible.
        coach_backdate_grant: null,
        write_planned_deviation: createPlannedDeviationWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  if (handlers.length === 0) return null;

  const selectedHandler = handlers.length === 1
    ? handlers[0]
    : "keel_direct_effects";
  const toolExecution = statuses.some((status) =>
      keelToolExecutionFor(status) === "success"
    )
    ? "success" as const
    : keelToolExecutionFor(statuses[0] ?? "ignored");

  return {
    content: replies.join("\n").trim(),
    nextTempMemory: input.tempMemory,
    toolExecution,
    executedTools: [...new Set(executedTools)],
    toolSkillRun: {
      selected_handler: selectedHandler,
      status: statuses.join("+"),
      reason: reasons.join("+"),
      requested_effects: requested,
      allowed_effects: allowed,
      committed_effects: committed,
      blocked_effects: blocked,
    },
  };
}

// ===========================================================================
// W4.7 — MAILLON 4: le runtime de `plan_question`
//
// Le skill REFUSE de tourner sans ce canal (`runtimeOf` throw): une permission
// accordée sur une prescription non lue est pire que pas de lane du tout — un
// « oui » que l'évaluateur note `missed` à 23:59 punit un élève qui a suivi la
// réponse de Sophia. Tout ce qui décide (commitment, `swap_policy`,
// contraintes de sécurité) est donc lu EN BASE ici, jamais dans le turn_frame
// écrit par le LLM du dispatcher.
// ===========================================================================

const PLAN_QUESTION_COMMITMENT_COLUMNS =
  "id, title, slot_key, food_group_ref, autonomy, content, plan_version_id";

/**
 * Quelle ligne du plan la question vise ? Déterministe, et par ordre de
 * PREUVE décroissante. Aucune étape ne devine: si rien ne tranche, on rend
 * null et le résolveur escalade en `commitment_not_identified` — escalader
 * vers le coach est un résultat correct, deviner ne l'est pas.
 */
export function resolvePlanQuestionCommitmentId(args: {
  planContext: KeelPlanContext | null;
  prescribedFoodGroup: string | null;
  slotHint: string | null;
}): string | null {
  const lines = [
    ...(args.planContext?.today ?? []),
    ...(args.planContext?.week ?? []),
  ];
  if (lines.length === 0) return null;
  const prescribed = String(args.prescribedFoodGroup ?? "").trim();
  if (prescribed) {
    const byGroup = lines.filter((line) => line.food_group_ref === prescribed);
    if (byGroup.length === 1) return byGroup[0].commitment_id;
  }
  const slot = String(args.slotHint ?? "").trim();
  if (slot) {
    const bySlot = lines.filter((line) =>
      String(line.bucket) === slot && line.food_group_ref !== null
    );
    if (bySlot.length === 1) return bySlot[0].commitment_id;
  }
  const withFoodGroup = lines.filter((line) => line.food_group_ref !== null);
  return withFoodGroup.length === 1 ? withFoodGroup[0].commitment_id : null;
}

async function loadPlanQuestionRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  keel: KeelTurnContext;
  prescribedFoodGroup: string | null;
  slotHint: string | null;
}): Promise<PlanQuestionSkillRuntime> {
  const commitmentId = resolvePlanQuestionCommitmentId({
    planContext: args.keel.plan_context,
    prescribedFoodGroup: args.prescribedFoodGroup,
    slotHint: args.slotHint,
  });

  let commitment: PlanQuestionCommitment | null = null;
  if (commitmentId) {
    const { data, error } = await args.supabase
      .from("plan_commitments")
      .select(PLAN_QUESTION_COMMITMENT_COLUMNS)
      .eq("user_id", args.userId)
      .eq("id", commitmentId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row) {
      commitment = {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        slot_key: row.slot_key === null || row.slot_key === undefined
          ? null
          : String(row.slot_key),
        food_group_ref:
          row.food_group_ref === null || row.food_group_ref === undefined
            ? null
            : String(row.food_group_ref),
        autonomy: String(row.autonomy ?? "strict") as
          PlanQuestionCommitment["autonomy"],
        swap_policy: extractSwapPolicy(row.content),
        plan_version_id:
          row.plan_version_id === null || row.plan_version_id === undefined
            ? null
            : String(row.plan_version_id),
      };
    }
  }

  const groups = await args.supabase.from("food_groups").select("slug, class");
  if (groups.error) throw groups.error;
  const foodGroupClasses: Record<string, string> = {};
  for (const raw of (groups.data ?? []) as Array<Record<string, unknown>>) {
    const slug = String(raw.slug ?? "").trim();
    const klass = String(raw.class ?? "").trim();
    if (slug && klass) foodGroupClasses[slug] = klass;
  }

  // Chargées à CHAQUE tour, hors du chemin mémoire (W3.3). Ce loader THROW sur
  // erreur, volontairement: une allergie ne peut pas être une lecture ratée.
  const safetyConstraints: StudentSafetyConstraint[] =
    await loadStudentSafetyConstraints(
      args.supabase as never,
      args.userId,
    );

  return {
    commitment,
    food_group_classes: foodGroupClasses,
    safety_constraints: safetyConstraints,
    // R2: la ligne `contract_change_requests` porte la prose de l'élève; sans
    // locale persistée on refuse d'écrire plutôt que de deviner la langue.
    content_locale: args.keel.content_locale ?? "",
  };
}

/**
 * Écrit la demande d'arbitrage du coach, WRITE-THROUGH (insert + relecture de
 * l'id). `bypasses_digest` est DÉRIVÉ, pas une colonne — l'envoyer ferait
 * 400 PostgREST et perdrait l'alerte entière; `urgency='immediate'` EST le
 * contournement du digest.
 */
async function writePlanQuestionChangeRequest(args: {
  supabase: SupabaseClient;
  changeRequest: PlanQuestionChangeRequest;
}): Promise<{ written: boolean; id: string | null; reason_code: string }> {
  const { bypasses_digest: _bypassesDigest, ...row } = args.changeRequest;
  try {
    const { data, error } = await args.supabase
      .from("contract_change_requests")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    const id = String((data as Record<string, unknown> | null)?.id ?? "")
      .trim();
    return id
      ? { written: true, id, reason_code: "raised" }
      : { written: false, id: null, reason_code: "missing_readback_row" };
  } catch (error) {
    console.error("[plan_question] change request write failed", error);
    return {
      written: false,
      id: null,
      reason_code: "change_request_write_failed",
    };
  }
}

/**
 * L'état de résolution d'un jour, lu depuis les FAITS persistés — la règle
 * « le flex se déclare à l'avance » se cale sur la même source de vérité que
 * la note qu'elle protège (`commitment_evaluations`), pas sur une horloge.
 *
 * Aucune ligne ⇒ NON résolu (D2 du `advance_rule`): un jour jamais évalué
 * n'est pas un jour noté, et refuser là punirait un cron en retard.
 * Lecture en échec ⇒ non résolu également, et c'est le bon sens du fail-open
 * pour CE prédicat: il n'ouvre rien, il autorise une déclaration de flex.
 */
async function readKeelDayResolution(args: {
  supabase: SupabaseClient;
  userId: string;
  localDate: string;
}): Promise<DayResolution | null> {
  try {
    const { data, error } = await args.supabase
      .from("commitment_evaluations")
      .select("status")
      .eq("user_id", args.userId)
      .eq("local_date", args.localDate);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ status?: unknown }>;
    if (rows.length === 0) {
      return { local_date: args.localDate, resolved: false };
    }
    const resolved = rows.every((row) => String(row.status ?? "") !== "unknown");
    return {
      local_date: args.localDate,
      resolved,
      resolved_by: resolved ? "commitment_evaluations" : null,
    };
  } catch (error) {
    console.warn("[keel] day resolution read failed", error);
    return null;
  }
}

/**
 * W12-V — texte d'AVARIE (le modèle a échoué), dans la langue de réponse.
 *
 * Exporté pour être mesurable : c'est le seul texte visible d'un tour raté, et
 * un tour raté est exactement celui qu'on ne rejoue pas pour vérifier.
 * `resolveResponseLocale` est l'unique décideur de langue (R3) ; ici on ne fait
 * que choisir la copie. La phrase dit ce qui est VRAI et rien d'autre : aucune
 * ligne n'a été écrite — même contrat que la ceinture accusé-fantôme.
 */
export function keelOutageTemplate(locale: string): string {
  // `locale` est REQUIS. Il était optionnel, avec un repli
  // `resolveResponseLocale({})`, et l'unique appelant de production ne le
  // passait pas: le texte d'avarie sortait donc toujours en anglais, y compris
  // sur un fil français. Un paramètre optionnel ici, c'est la langue décidée
  // par l'oubli de l'appelant.
  const tag = locale;
  return isFrenchLocale(tag)
    ? "J'ai un souci technique sur ce tour. Je n'ai rien execute de plus."
    : "I hit a technical problem on this turn. Nothing was logged.";
}

/**
 * PIVOT §3.3 — INJECTION de la couche `[DOCTRINE COACH]` dans le composeur.
 *
 * L'autre moitié du double verrou: `applyKeelOutputLocks` VÉRIFIE la sortie,
 * ceci FAIT la voix. Sans cette injection le verrou est un videur devant une
 * salle vide — il empêche l'agent de contredire le coach, il ne le fait pas
 * parler comme lui, et « c'est MON agent » (§1.4) n'existe pas.
 *
 * POURQUOI EN TÊTE DU CONTEXTE, et pas ailleurs:
 *   - `applyCompanionPromptBudgetWithPinnedContext` **tronque par la QUEUE**
 *     (note explicite dans `companion.ts`). Un bloc ajouté en fin de contexte
 *     disparaît donc silencieusement sur les tours les plus riches — ceux où
 *     la doctrine compte le plus. En tête, il survit à la troncature.
 *   - la couche `[DOCTRINE COACH]` de §3.3 est censée précéder le protocole et
 *     la mémoire de l'élève: l'ordre du contexte reproduit celui du contrat.
 *
 * LIMITE CONNUE, assumée et notée dans STATUS-MORNING: §3.3 veut ce bloc dans
 * le PRÉFIXE MIS EN CACHE (tier semi-stable de `buildCompanionPromptParts`),
 * pas dans le contexte volatile. Le placer correctement demande de faire
 * traverser le contexte KEEL à `agent_exec` puis à `runCompanion` — trois
 * signatures sur le chemin de TOUTE conversation. Le comportement produit est
 * ici correct; l'économie de cache ne l'est pas encore. `compileDoctrineBlock`
 * expose déjà le hash nécessaire le jour où on déplacera le bloc.
 *
 * HORS ÉLÈVE KEEL: rendu tel quel. La branche FR legacy n'est pas touchée.
 */
// ⚠️ LE NOM MENT D'UN TIERS, ET C'EST DÉLIBÉRÉ DE NE PAS LE RENOMMER: cette
// fonction injecte TROIS blocs, dans cet ordre — contraintes dures, doctrine,
// note 1:1 du coach (2026-08-05). Elle reste « le » point d'injection unique,
// ce que quatre commentaires ailleurs dans le repo désignent par ce nom.
export function withKeelDoctrineBlock(
  context: string,
  keel: KeelTurnContext,
): string {
  if (!keel.is_student) return context;
  const blocks: string[] = [];

  // PIVOT §3.3 — LA MOITIÉ « AVANT GÉNÉRATION » DU VERROU MÉDICAL, et elle
  // manquait entièrement (QA agent 4, 2026-08-03).
  //
  // Elle passe AVANT la doctrine, délibérément, pour la raison exacte donnée
  // ci-dessus sur l'ordre: le budget de prompt tronque PAR LA QUEUE. Sur un
  // tour riche — celui où l'agent a le plus de matière pour proposer à manger,
  // donc celui où l'allergène risque le plus de sortir — c'est le dernier bloc
  // qui saute. Mettre la contrainte dure derrière la doctrine reviendrait à la
  // faire disparaître précisément quand elle compte.
  //
  // `safety_constraints === null` (lecture en panne) ne produit AUCUN bloc,
  // et c'est la bonne posture: on n'écrit pas « aucune contrainte » quand on
  // ne sait pas. La distinction null / [] est préservée jusqu'ici.
  // LE VERROU MÉDICAL EN PREMIER — avant même les contraintes dures.
  //
  // Le budget de prompt tronque PAR LA QUEUE, et l'ordre de ces blocs est donc
  // un classement par coût de perte. Perdre l'allergène met un aliment dans une
  // assiette; perdre celui-ci sert un protocole nutritionnel à quelqu'un dont
  // la maladie se soigne. Et il gouverne la POSTURE du tour entier, pas un
  // ingrédient: il passe donc devant.
  if (keel.declared_medical_condition) blocks.push(CLINICAL_DEFERRAL_BLOCK);

  const safetyBlock = safetyConstraintsPromptBlock(keel.safety_constraints);
  if (safetyBlock && safetyBlock.trim()) blocks.push(safetyBlock);

  const doctrine = keel.doctrine ? doctrineBlockFor(keel.doctrine) : null;
  if (doctrine && doctrine.trim()) blocks.push(doctrine);

  // LA NOTE 1:1 DU COACH — dernière des trois, exprès, et pour la raison
  // donnée deux blocs plus haut sur l'ordre: le budget de prompt tronque PAR
  // LA QUEUE. Des trois, c'est celle dont la perte coûte le moins — un
  // allergène qui saute est une assiette, une observation qui saute est un
  // service dégradé d'un cran.
  //
  // Absente, elle ne pousse RIEN: pas d'en-tête, pas de « le coach n'a rien
  // noté ». C'est la condition sous laquelle la note reste optionnelle
  // (`coach_note.ts`), et c'est aussi la leçon de `NO_COACH_METHOD_BLOCK`, dont
  // le titre décrivait un état interne et ressortait mot pour mot dans la
  // bouche de l'agent.
  const coachNote = keel.coach_note ? coachNotePromptBlock(keel.coach_note) : null;
  if (coachNote && coachNote.trim()) blocks.push(coachNote);

  // LE BILAN DE LA DERNIÈRE SEMAINE EXAMINÉE — DERNIER DES CINQ, exprès.
  //
  // L'ordre de ces blocs est un classement par COÛT DE PERTE, parce que le
  // budget de prompt tronque par la queue. Perdre le verrou clinique sert un
  // protocole à quelqu'un dont la maladie se soigne; perdre l'allergène met un
  // aliment dans une assiette; perdre la doctrine rend l'agent générique;
  // perdre la note du coach dégrade le service d'un cran. Perdre le bilan coûte
  // un SUJET DE CONVERSATION — le moins cher des cinq, donc le dernier.
  //
  // ⚠️ IL PORTE SES DATES, et c'est structurel, pas cosmétique: ce bloc survit
  // toute la semaine SUIVANTE, et un modèle qui dirait « cette semaine tu as vu
  // du poisson deux fois » énoncerait un chiffre exact rattaché à la mauvaise
  // période — c'est-à-dire un chiffre faux que rien ne permet de contester.
  // `weekReviewPromptBlock` écrit la plage en tête et l'interdit explicitement.
  const weekReview = keel.week_review
    ? weekReviewPromptBlock(keel.week_review.reading, keel.week_review.biofeedback)
    : null;
  if (weekReview && weekReview.trim()) blocks.push(weekReview);

  // FF-013 — CE QU'ON SAIT DÉJÀ DE SON ÉNERGIE, DE SA FAIM ET DE SON SOMMEIL.
  //
  // APRÈS le bilan hebdo, exprès: le bloc renvoie vers les six notes du
  // dimanche (« elles sont plus haut »), donc il doit les suivre. Et il est le
  // moins cher des six à perdre par la queue — son absence rouvre une question
  // de trop, pas une assiette.
  //
  // IL EST POUSSÉ MÊME SANS TAP, et c'est délibéré: sans matière, sa moitié
  // utile est l'INTERDICTION de demander, qui est justement ce qui compte le
  // plus quand l'agent ne sait rien. Le bloc ne dit jamais « il n'a rien
  // tapé » — il dit qu'on ne sait pas, et qu'un silence n'est pas une bonne
  // journée.
  //
  // Sous plancher de restriction, `daily_pulse` vaut déjà `null` (filtré au
  // CHARGEMENT), donc ce bloc ne porte que son interdiction. Rien à ne pas
  // dire, parce que rien n'est là.
  const pulseBlock = pulseContextBlock(
    keel.daily_pulse,
    Boolean(keel.week_review?.biofeedback),
  );
  if (pulseBlock.trim()) blocks.push(pulseBlock);

  // FF-011 — LE SOUTIEN EST GROUNDÉ OU IL EST COURT.
  //
  // DERNIER des sept, et donc le premier à sauter par la queue. C'est le bon
  // rang: sa perte laisse l'agent sans la matière du jour, mais la CEINTURE,
  // elle, est déterministe et vit dans `finalVisibleText` — elle ne dépend
  // d'aucun bloc de prompt. Perdre ce bloc dégrade la réponse; ça ne rouvre
  // pas la porte à l'encouragement creux.
  //
  // Sous plancher de restriction, `day_facts` vaut déjà `null` (filtré au
  // CHARGEMENT) et le bloc ne porte que sa règle de conduite.
  // FF-010 — CE QUE LE FOYER MANGE, s'il y en a un.
  //
  // ⚠️ IL SE NOMME DISTINCTEMENT DU BLOC PLAN DU COACH, et ce n'est pas de la
  // typographie: `keel_plan_context.ts` porte la règle — « two plan blocks in
  // one prompt is how a model gets to pick the more flattering one ». Les
  // ENGAGEMENTS du coach et les PLATS du foyer sont deux couches différentes.
  // Le titre de celui-ci dit « what this household is eating », jamais « the
  // plan », et sa première phrase interdit explicitement de les confondre.
  //
  // ABSENT ⇒ AUCUN BLOC (R8): pas de « ton foyer n'a rien prévu » à quelqu'un
  // qui vit seul.
  const householdBlock = keel.household
    ? householdContextBlock(keel.household)
    : null;
  if (householdBlock && householdBlock.trim()) blocks.push(householdBlock);

  const supportBlock = groundedSupportBlock(keel.day_facts, keel.support_ground);
  if (supportBlock.trim()) blocks.push(supportBlock);

  if (blocks.length === 0) return context;
  const base = String(context ?? "");
  return base.trim()
    ? `${blocks.join("\n\n")}\n\n${base}`
    : blocks.join("\n\n");
}

export function finalVisibleText(
  text: unknown,
  routeDecision: RouteDecision | null,
  turnFrame: TurnFrame | null,
  // P12-C (eva-hard25 R1-B03): le message user arrive aux gardes PAR CONTRAT
  // — l'ancienne lecture `turnFrame.user_message` visait un champ qui
  // n'existe pas au runtime (la garde P10-V était inatteignable en prod, la
  // probe passait sur un frame synthétique enrichi).
  userMessage: string | undefined,
  // P12-V (probe P12-3 passe 1): l'history du tour alimente la garde de
  // MENTION RÉTRACTÉE — le verrou write-path et l'interdit de contexte ne
  // suffisent pas quand le composeur lit le contenu dans l'historique brut.
  history: unknown,
  // W8: le contexte KEEL du tour. Seule information que les gardes de rendu ne
  // pouvaient PAS déduire du frame — et la ceinture accusé-fantôme est
  // indexée sur `is_student` (hors élève KEEL, il n'y a pas de ligne de
  // protocole à accuser, donc rien à réconcilier).
  //
  // PIVOT §3.3 — le paramètre est passé en OBJET et RENDU OBLIGATOIRE. Deux
  // raisons, et la seconde est la vraie:
  //   1. il porte maintenant aussi les contraintes dures et la doctrine, que
  //      la ceinture de sortie exige;
  //   2. OBLIGATOIRE parce que le défaut qu'on corrige ici est précisément une
  //      garantie « globale » appliquée sur 1 chemin sur N. Avec un paramètre
  //      optionnel, il suffit d'un `finalVisibleText` futur qui l'oublie pour
  //      recréer le trou, en silence. Le compilateur est le seul relecteur qui
  //      ne se fatigue pas. (Même raisonnement que le `binding` obligatoire de
  //      `renderMealPhotoAck`.)
  keel: KeelTurnContext,
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
    // W8 — DERNIÈRE ceinture du rendu, à dessein: elle doit voir le texte
    // FINAL (y compris ce que `ensureClarifyQuestionVisible` vient de
    // réinjecter), sinon un accusé rajouté après elle sortirait intact.
    out = stripKeelAckWithoutCommittedEffect(
      out,
      turnFrame ?? null,
      userMessage,
      keel.is_student === true,
      routeDecision?.response_owner === "disordered_eating_guard",
    );
    // LA QUESTION DE PRÉCISION, en dernier dans le bloc non-crise.
    //
    // APRÈS la ceinture d'accusé fantôme, exprès: cette question n'est pas un
    // accusé — elle ne prétend rien avoir enregistré — et la faire passer dans
    // un détecteur d'accusé ne pourrait que la mutiler. Elle vient après pour
    // la même raison que la ceinture vient après `ensureClarifyQuestionVisible`:
    // le dernier à écrire est le seul qui sait ce que l'élève lira.
    //
    // ET DANS le `if (!isSafetyRoute(...))`: un tour de crise est le dernier
    // endroit où l'on demande à quelqu'un avec quoi il a mangé son poulet. La
    // bande de safety ferme déjà l'armement en amont (`gateMealPrecisionQuestion`);
    // ceci est la seconde barrière, sur la route cette fois.
    // ── FF-011 · LE SOUTIEN EST GROUNDÉ OU IL EST COURT ─────────────────────
    //
    // AVANT la question de précision, exprès: si la ceinture réécrit le corps,
    // la question doit s'accrocher au texte que l'élève va réellement lire.
    //
    // DANS le `if (!isSafetyRoute(...))`, et c'est la moitié la plus importante
    // du placement: la crise et le plancher TCA ont leurs propres chemins,
    // leurs ressources par pays et leurs gardes, et cette fiche NE LES TRAVERSE
    // PAS. Le `disordered_eating_guard` est exclu par le même test que la
    // ceinture d'accusé fantôme trois lignes plus haut.
    //
    // ⚠️ ELLE NE S'ARME QUE SUR UN TOUR DE DÉCOURAGEMENT, reconnu
    // DÉTERMINISTIQUEMENT. Mordre sur tous les tours refuserait des réponses
    // correctes et le repli deviendrait le cas nominal en silence — « un
    // composeur mort déguisé en composeur prudent ».
    if (
      keel.is_student &&
      routeDecision?.response_owner !== "disordered_eating_guard"
    ) {
      const discouraged = detectDiscouragementTurn(userMessage);
      if (discouraged) {
        const belt = applyGroundedSupportBelt({
          text: out,
          facts: keel.day_facts,
          week: keel.week_review?.reading ?? null,
          contentLocale: keel.content_locale ?? "en-GB",
        });
        if (belt.reasons.length > 0) {
          // §5 de la fiche: UNE SEULE TRACE, en observabilité et pas en base
          // métier. Le motif, jamais le contenu — R9 de FF-007: le coach ne
          // lit jamais les conversations, et §10 doit être mesurable sans ça.
          //
          // ⚠️ SI CE TAUX EST ÉLEVÉ, C'EST LE PROMPT QU'IL FAUT CORRIGER, PAS
          // LA CEINTURE QU'IL FAUT DESSERRER. Un repli devenu nominal est un
          // composeur mort, et il est invisible autrement.
          console.warn("[keel] grounded_support belt bit", {
            reasons: belt.reasons,
            matched: belt.matched,
            ground: keel.support_ground,
            discouragement_marker: discouraged.matched,
            rewritten_to_fallback: belt.text.length < 120 &&
              belt.matched.length > 0,
          });
        }
        out = belt.text;
      }
    }

    // ── FF-025 · L'INVITATION À LA PHOTO ────────────────────────────────────
    //
    // AVANT la question de précision, et dans le même bloc non-crise, pour
    // trois raisons:
    //  1. les deux ne peuvent pas sortir ensemble — le budget partagé (T4) a
    //     empêché l'armement de la seconde dès que la première a pris sa
    //     place, et c'est le SEUL mécanisme d'exclusion (il n'y a pas de
    //     vérification ici, exprès: elle serait un second lieu de vérité);
    //  2. `!isSafetyRoute(...)` est la seconde barrière de R5. Le gate ferme
    //     déjà sur toute bande ≠ `none`, mais une route de crise reconstruite
    //     APRÈS l'armement doit encore pouvoir taire la phrase;
    //  3. après la ceinture d'accusé fantôme, comme la question: une
    //     invitation ne prétend rien avoir enregistré, et la faire passer dans
    //     un détecteur d'accusé ne pourrait que la mutiler.
    out = appendPhotoInvitation(out, keel.meal_photo_invitation);
    out = appendMealPrecisionQuestion(
      out,
      keel.meal_precision_question,
      () => {
        // La question n'est pas partie. Le flow doit donc s'ouvrir en
        // « correction seulement »: l'élève garde le droit d'amender son repas
        // au lieu d'en écrire un second, mais on ne prétend pas lui avoir
        // demandé quoi que ce soit.
        keel.meal_precision_question = null;
      },
    );
  }
  out = out.trim();

  // PIVOT §3.3 — LES DEUX VERROUS DÉTERMINISTES, EN TOUT DERNIER.
  //
  // Position volontairement finale, après TOUTES les autres ceintures: elles
  // réinjectent du texte (`ensureClarifyQuestionVisible`,
  // `ensureVisibleSophiaEmoji`, l'override de correction), et un allergène
  // réintroduit après la vérification sortirait intact. C'est le même
  // raisonnement que la note de `stripKeelAckWithoutCommittedEffect`, poussé
  // d'un cran.
  //
  // ET HORS DU `if (!isSafetyRoute(...))`, exprès: un tour de crise est le
  // dernier endroit où l'on veut suggérer un allergène médical.
  const locked = applyKeelOutputLocks({
    text: out,
    isKeelStudent: keel.is_student === true,
    safetyConstraints: keel.safety_constraints,
    doctrine: keel.doctrine?.doctrine ?? null,
    // POUR SIGNER LA SUBSTITUTION. Passé ICI et pas dans les générateurs: quand
    // le verrou mord dans le chat, ce qui part est la phrase que le coach a
    // écrite mot pour mot à « qu'est-ce que tu dis à la place ? ». Elle sortait
    // anonyme — donc l'élève lisait la position de son coach sans savoir
    // qu'elle était de lui, au moment précis où il pousse contre sa méthode,
    // c'est-à-dire quand l'autorité compte le plus.
    //
    // Déjà résolu par `loadPublishedDoctrine` (une seule lecture de
    // `coaches.display_name` par tour); on ne le relit pas ici.
    coachDisplayName: keel.doctrine?.coachDisplayName ?? null,
    // Condition de désarmement n°5: ce que CE TOUR retire. Lu depuis le FRAME
    // (la demande de l'élève), pas depuis le texte généré — une ceinture qui
    // se désarmerait sur une phrase que le modèle a écrite se désarmerait
    // toute seule.
    retractedConstraintRefs: retractedConstraintRefsIn(turnFrame),
  });
  return locked.text;
}

/**
 * Les identifiants qu'un tour demande de RETIRER.
 *
 * Lu sur `direct_effects` — donc sur ce que l'élève a demandé — et non sur les
 * effets committés: la ceinture s'applique au rendu, qui peut précéder ou
 * suivre l'écriture, et une rétractation qui échoue en base doit quand même
 * pouvoir être EXPLIQUÉE à l'élève. Le pire cas d'un désarmement trop large
 * ici est une phrase qui nomme un allergène que l'élève vient lui-même de
 * nommer pour le retirer; le pire cas de l'inverse est un élève enfermé.
 */
function retractedConstraintRefsIn(frame: TurnFrame | null): string[] {
  if (!frame) return [];
  const refs: string[] = [];
  for (const effect of frame.direct_effects ?? []) {
    if (effect.effect_type !== "declare_safety_constraint") continue;
    const payload = (effect.payload_hint ?? {}) as Record<string, unknown>;
    if (String(payload.intent ?? "").trim().toLowerCase() !== "retract") {
      continue;
    }
    for (
      const key of ["allergen_ref", "substance_ref", "medication_class"]
    ) {
      const value = String(payload[key] ?? "").trim();
      if (value) refs.push(value);
    }
  }
  return refs;
}

/**
 * LA QUESTION DE PRÉCISION, POSÉE PAR LE RUNTIME ET PAS PAR LE MODÈLE.
 *
 * POURQUOI ICI ET PAS DANS LE PROMPT DU COMPOSEUR. Le §3 du chantier pose une
 * ligne rouge: « une question de précision ne demande JAMAIS une quantité ».
 * Confier cette question à une génération, c'est la remettre en jeu à chaque
 * tour — et ce dépôt a déjà mesuré que les correctifs prompt-only régressent en
 * run réel (`p8-revalidation-rose-reds`). Le texte est un gabarit fermé, il
 * arrive ici tel quel, et il n'existe aucun chemin par lequel il pourrait
 * devenir « tu en as mangé combien ? ».
 *
 * L'ANTI-INTERROGATOIRE EST STRUCTUREL, ET IL FAIL-SAFE. Si le composeur a déjà
 * posé une question, la question de précision est ABANDONNÉE plutôt qu'ajoutée:
 * « deux questions sont un interrogatoire, et l'élève cesse d'écouter ». On
 * perd une précision; on ne perd pas l'élève. C'est l'arbitrage du §7 —
 * « la précision n'a de valeur que jusqu'au point où elle coûte l'adhésion ».
 *
 * CONDITION DE DÉSARMEMENT (doctrine P9): sans question armée, la fonction rend
 * le texte inchangé, et elle n'en RETIRE jamais aucune. Elle ne peut donc pas
 * appauvrir une réponse; au pire elle n'ajoute rien.
 */
export function appendMealPrecisionQuestion(
  text: string,
  question: string | null | undefined,
  /**
   * Appelé quand la question est ABANDONNÉE. L'appelant doit alors rouvrir le
   * flow SANS question: sinon le classifieur du tour suivant serait interrogé
   * sur une question que l'élève n'a jamais lue, et jugerait sa phrase comme
   * une réponse à rien.
   */
  onDropped?: () => void,
): string {
  const source = String(text ?? "");
  const asked = String(question ?? "").trim();
  if (!asked) return source;
  // Déjà présente (rejeu, ou composeur qui a recopié le gabarit): ne pas la
  // doubler. Comparaison EXACTE sur un gabarit fermé — pas une heuristique de
  // sens, une égalité de chaîne.
  if (source.includes(asked)) return source;
  if (source.includes("?")) {
    // Le composeur a déjà posé sa question. On se tait.
    console.log(
      `[keel] meal_precision_question dropped: reply already carries a question`,
    );
    onDropped?.();
    return source;
  }
  const body = source.trim();
  return body ? `${body}\n\n${asked}` : asked;
}

/**
 * W8 — CEINTURE ACCUSÉ FANTÔME SANS EFFET (adaptateur runtime).
 *
 * Le raisonnement complet, le détecteur et la condition de désarmement vivent
 * dans `skills/_shared/keel_ack_without_effect_guard.ts` (fonctions pures).
 * Ici on ne fait que deux choses, et ce sont les deux que le module ne peut
 * pas faire seul:
 *
 *  1. LIRE LA VÉRITÉ D'EXÉCUTION DU TOUR. `committedEffectCount` est la
 *     longueur de `direct_effect_lane.committed_effects` — des lignes RELUES
 *     par les exécuteurs, jamais des demandes. C'est le même champ que lisent
 *     `stripTrackClaimWithoutCommit` et `ensureCommittedRenderParity`: une
 *     seule source de vérité de commit par tour.
 *     NOTE, et c'est tout l'intérêt de cette ceinture: quand le dispatcher
 *     n'émet RIEN, la lane est absente et le compte vaut 0 — c'est
 *     précisément le chemin où toutes les gardes ledger-first sont muettes.
 *  2. COMPTER ET TRACER. Le compteur d'isolat sert au log de tour; la ligne
 *     `guards` de `system_error_logs` est le canal durable qui donne le TAUX
 *     RÉEL dans le fil admin.
 */
export function stripKeelAckWithoutCommittedEffect(
  text: string,
  turnFrame: TurnFrame | null,
  userMessage: string | undefined,
  isKeelStudent: boolean,
  isRestrictionFloorTurn = false,
): string {
  const source = String(text ?? "");
  if (!isKeelStudent || !source.trim()) return source;
  const lane = (turnFrame as { direct_effect_lane?: unknown } | null)
    ?.direct_effect_lane as Record<string, unknown> | null | undefined;
  const committed = Array.isArray(lane?.committed_effects)
    ? (lane?.committed_effects as unknown[])
    : [];
  const result = guardKeelAckWithoutCommittedEffect({
    text: source,
    userMessage: String(userMessage ?? ""),
    isKeelStudent: true,
    committedEffectCount: committed.length,
    // La route safety a déjà été écartée par l'appelant
    // (`if (!isSafetyRoute(routeDecision))`); on reste explicite pour que la
    // condition de désarmement n°2 soit lisible à cet endroit aussi.
    isSafetyTurn: false,
    isRestrictionFloorTurn,
  });
  if (!result.triggered) return source;
  const count = recordKeelAckGuardTrigger();
  console.warn(
    `[keel] ack_guard triggered count=${count}` +
      ` stripped=${result.stripped_sentences}` +
      ` locale=${result.detection.locale}` +
      ` object=${result.detection.reported_object ? "yes" : "none"}`,
  );
  logRuntimeGuardEvent({
    guard: KEEL_ACK_GUARD_NAME,
    userId: (turnFrame as { user_id?: string } | null)?.user_id ?? null,
    detail: {
      turn_id: (turnFrame as { turn_id?: string } | null)?.turn_id ?? null,
      reason_code: result.reason_code,
      stripped_sentences: result.stripped_sentences,
      detected_locale: result.detection.locale,
      isolate_trigger_count: count,
    },
  });
  return result.text;
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
  const responseLocale = resolveResponseLocale({
    userExplicit: readExplicitConversationLocale(tempMemory),
    persisted: readPersistedConversationLocale(tempMemory),
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
            contentLocale: measureLocale,
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
            detail:
              "mesure annoncée en conversation, écrite là où le point du " +
              "dimanche la range. La ceinture est ré-évaluée sur ce tour.",
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
  const keelRoutingInputs = () => ({
    keel_student: keelTurn.is_student,
    restriction_guard: conversationalRestrictionGuardForRouters({
      restriction: keelTurn.restriction,
      tempMemory,
      userMessage,
    }),
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
      const invitation = await armPhotoInvitation({
        supabase,
        userId,
        responseLocale,
        committed: committedFacts,
        safetyBand: turnFrame?.safety?.risk_band === null ||
            turnFrame?.safety?.risk_band === undefined
          ? null
          : String(turnFrame.safety.risk_band),
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

  // ── PHASE B — REPRISE APRÈS RELANCE KEEL ──────────────────────────────
  //
  // Flow DÉTERMINISTE, zéro appel modèle: même arbitrage que `plan_question`.
  // Sur une reprise, le risque n'est pas de mal comprendre, c'est de dire
  // quelque chose de faux sur une absence qu'on n'a pas observée. Un gabarit
  // fermé ne peut pas inventer une durée ni un reproche.
  //
  // L'état arrive par `active_flow_state` (armé hors conversation, à la
  // fermeture de l'épisode dans `chat-inbound-v1`); la bande safety effective
  // du tour est passée au reducer, qui porte sa propre condition de sortie.
  if (routeDecision.response_owner === "keel_reengagement_resume_v1") {
    const skillStart = Date.now();
    const skillOutput = runKeelReengagementResumeSkill({
      user_message: userMessage,
      safety_band: String(runtimeSafetyRiskBand ?? "none"),
      context: {
        skill_id: "keel_reengagement_resume_v1",
        user_id: userId,
        response_locale: responseLocale,
        recent_messages: recentMessagesForTurnFrame,
        active_skill_working_state: ((activeFlowState.activeSkillState as
          | { working_state?: unknown }
          | null)?.working_state ?? {}) as ActiveConversationSkillWorkingState,
        turn_frame: turnFrame,
        relevant_memory_items: [],
        plan_items: [],
        product_surfaces: [],
        exclusions: [],
      },
    });
    const skillLatencyMs = Date.now() - skillStart;

    // ── L'ÉTAT EST PURGÉ DANS LES DEUX CAS, ET C'EST LE FOND DU FLOW ────────
    //
    // Le cadre ne possède qu'UN tour (`KEEL_REENGAGEMENT_RESUME_MAX_TURNS = 1`).
    // Qu'il ait parlé (`complete`) ou rendu la main sans texte (`exit`), il n'a
    // plus rien à faire: le message suivant est une conversation ordinaire.
    //
    // Mesuré en run réel avant cette correction: le flow gardait la main un
    // second tour et répondait « Good, let's carry on from there. » à
    // « Je voudrais surtout gérer les dîners cette semaine ». Voir la séquence
    // complète dans `skills/keel_reengagement_resume/contract.ts`.
    tempMemory = clearActiveConversationSkillState(
      tempMemory as Record<string, unknown>,
    );

    if (String(skillOutput.status ?? "") === "exit") {
      // ⚠️ SANS CETTE AFFECTATION, LA PURGE CI-DESSUS EST PERDUE.
      //
      // Sur la sortie silencieuse le tour continue vers le composeur, et le
      // composeur reconstruit `tempMemory` depuis l'état PRÉ-routing
      // (`agents/companion.ts`, `nextTempMemory`). La ligne
      // `tempMemory = cleanupLegacyRuntimeState(agentOut.tempMemory ?? …)` plus
      // bas réinstalle donc l'état de flow qu'on vient d'effacer — sauf si
      // `localFlowExitSkillRun` est renseigné, ce que la garde juste après
      // cette ligne teste depuis toujours.
      //
      // Ce drapeau n'avait plus AUCUN écrivain depuis la phase A (son setter
      // vivait dans une lane supprimée): une ceinture armée sur un coffre vide.
      // MESURÉ: après trois tours, `temp_memory.__active_conversation_skill_v1`
      // portait encore `turns_in_flow: 2`.
      localFlowExitSkillRun = {
        selected_skill_id: "keel_reengagement_resume_v1",
        reason_code: routeDecision.reason_code,
        status: "exit",
        latency_ms: skillLatencyMs,
      };
    } else {
      // Le chemin parlant retourne AVANT le composeur: `finishKeelSkillTurn`
      // persiste la `tempMemory` déjà purgée ci-dessus, sans passer par la
      // reconstruction du companion.
      return await finishKeelSkillTurn({
        skillId: "keel_reengagement_resume_v1" as never,
        skillOutput,
        skillLatencyMs,
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

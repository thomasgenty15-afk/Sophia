// ═══════════════════════════════════════════════════════════════════════════
// LES OUTILS DU TOUR — CE QUE `processMessage` APPELLE AUTOUR DU DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `run.ts` (découpage des gros fichiers,
// lot 5a). Aucune logique changée. `run.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `run.ts`.
//
// Ce qui est ici : la construction du turn frame et du runner du
// dispatcher, les questions de mémoire et de rappels, la trace de risque
// après le tour, l'état de crise, les indices de sortie de flow local, et
// trois outils qui étaient juste avant `processMessage`
// (`allowedDirectEffectsFromGate`, `directEffectTrace`,
// `applyMemoryV2ActiveLoaderResult`).

import type {
  ContextLoadResult,
  OnDemandTriggers,
} from "../context/loader.ts";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  buildNeutralTurnFrame,
  type DispatcherLlmRunner,
  runDispatcher,
  type RunDispatcherInput,
} from "../dispatcher/dispatcher.v2.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { applySafetyFloorToTurnFrame } from "../safety/safety_floor.ts";
import type { EffectGateOrchestratorResult } from "../routers/effect_gate_orchestrator.ts";
import {
  clearActiveConversationSkillState,
  clearLastLocalFlowExitContext,
  clearLegacyRuntimeState,
} from "./active_flow_state.ts";
import { ageLastTrackCommitMarker } from "../tools/always_on/track_progress_plan_item/router.ts";
import { readPendingOneShotReminderRows } from "../tools/always_on/one_shot_reminder/persistence.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import { applySafetyCrisisExitStateIfNeeded } from "./safety_crisis_runtime.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { MemoryV2ActiveLoaderResult } from "../../_shared/memory/runtime/active_loader.ts";

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

// Exportés pour `run.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `run.ts`) ; `run.ts` ne les ré-exporte pas.
export { allowedDirectEffectsFromGate, buildDispatcherLlmRunner, cleanupLegacyRuntimeState, directEffectTrace, envFlagEnabled, turnFrameHasCommittedOneShotReminder };

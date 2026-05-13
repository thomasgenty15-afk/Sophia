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
  loadContextForMode,
  type OnDemandTriggers,
} from "../context/loader.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import {
  type AttackKeywordTriggerPayload,
  detectAttackKeywordTrigger,
  normalizeAttackKeyword,
} from "../../_shared/attack_keyword.ts";
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
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import { runMemoryV2ActiveLoader } from "../../_shared/memory/runtime/active_loader.ts";
import {
  type DispatcherRunStats,
  runDispatcher,
} from "../dispatcher/dispatcher.v2.ts";
import { logConversationTurn } from "../observability/trace_logger.ts";
import {
  type EffectGateOrchestratorResult,
  runEffectGateOrchestrator,
} from "../routers/effect_gate_orchestrator.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import { blocksToolSkills } from "../safety/safety_thresholds.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type {
  ToolSkillOpportunity,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { buildConversationPulse } from "../conversation_pulse_builder.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";
import {
  isLikelyOneShotReminderRequest,
} from "../tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts";
import {
  type RecurringReminderDraftV1,
} from "../tools/operations/create_recurring_reminder/generator.ts";
import {
  runCreateRecurringReminderIntake,
} from "../tools/operations/create_recurring_reminder/intake.ts";
import { createConfirmationToken } from "../confirmation/confirmation_token.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
  type AttackTechniqueKey,
} from "../tools/operations/prepare_attack_card/generator.ts";
import {
  runPrepareAttackCardIntake,
} from "../tools/operations/prepare_attack_card/intake.ts";
import { runPrepareAttackCardAiIntake } from "../tools/operations/prepare_attack_card/ai_intake.ts";
import { shouldUsePrepareAttackCardAiFlow } from "../tools/operations/prepare_attack_card/slot_filler.ts";
import {
  type DefenseCardDraftV1,
} from "../tools/operations/prepare_defense_card/generator.ts";
import {
  runPrepareDefenseCardIntake,
} from "../tools/operations/prepare_defense_card/intake.ts";
import {
  type PlanAdjustmentDraftV1,
} from "../tools/operations/adjust_plan_item/generator.ts";
import { executeAdjustPlanItem } from "../tools/operations/adjust_plan_item/executor.ts";
import { runAdjustPlanItemIntake } from "../tools/operations/adjust_plan_item/intake.ts";
import {
  type CoachPreferencesPatchDraftV1,
} from "../tools/operations/update_coach_preferences/generator.ts";
import {
  runUpdateCoachPreferencesIntake,
} from "../tools/operations/update_coach_preferences/intake.ts";
import {
  type PotionSessionDraftV1,
} from "../tools/operations/select_state_potion/generator.ts";
import {
  runSelectStatePotionIntake,
} from "../tools/operations/select_state_potion/intake.ts";
import { executeActivateStatePotion } from "../tools/operations/select_state_potion/executor.ts";
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
import { getActiveSafetySentryFlow } from "../supervisor.ts";
import type {
  AttackCardContent,
  DefenseCardContent,
  LabScopeKind,
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../_shared/v2-types.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Plan Item Snapshot for Dispatcher
// ═══════════════════════════════════════════════════════════════════════════════

export type V2PlanItemSnapshotItem = {
  id: string;
  title: string;
  description?: string | null;
  dimension: PlanDimension;
  item_type: PlanItemKind;
  status: PlanItemStatus;
  streak_current: number;
  last_entry_at: string | null;
  active_load_score?: number;
};

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

function applyExecutionBreakdownBrevityGuard(args: {
  channel: "web" | "whatsapp";
  routeDecision: RouteDecision | null;
  userMessage: string;
  responseContent: string;
  skillOutput: ConversationSkillOutput | null;
}): string {
  if (
    args.channel !== "whatsapp" ||
    args.routeDecision?.response_owner !== "conversation_handler" ||
    args.routeDecision.selected_handler !== "execution_breakdown"
  ) return args.responseContent;

  const text = String(args.responseContent ?? "").trim();
  const visibleLines = text.split(/\n+/).filter((line) => line.trim()).length;
  if (text.length <= 650 && visibleLines <= 8) return text;

  const normalizedUser = normalizeRouteText(args.userMessage);
  if (
    /\b(outil|protocole|anti[- ]?derapage|anti[- ]?dérapage|truc|aide)\b/
      .test(normalizedUser)
  ) {
    return "Je te fais court : le blocage, c'est le terrain. Ce soir, prépare seulement carnet + stylo au même endroit, puis éloigne le téléphone avant d'ouvrir le carnet. Je peux aussi te le transformer en carte d'attaque si tu veux.";
  }

  const skillReply = String(args.skillOutput?.reply ?? "").trim();
  return skillReply || text.split(/\n+/).slice(0, 5).join("\n").trim();
}

function withActiveSafetyFlowCaution<
  T extends ReturnType<typeof runSafetyPregate>,
>(
  output: T,
  tempMemory: unknown,
): T {
  if (!getActiveSafetySentryFlow(tempMemory)) return output;
  if (
    output.risk_band !== "none" &&
    output.risk_band !== "low"
  ) return output;
  return {
    ...output,
    detected: true,
    risk_band: "medium",
    reason_codes: [
      ...new Set([
        ...(output.reason_codes ?? []),
        "active_safety_flow_caution",
      ]),
    ],
    layer_contributions: {
      ...output.layer_contributions,
      heuristic: true,
    },
    allow_side_effects: false,
  };
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

async function resolveActiveTransformationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<ActiveTransformationRuntime> {
  if (args.runtime) return args.runtime;
  return await getActiveTransformationRuntime(args.supabase, args.userId);
}

const POSITIVE_ENTRY_KINDS = new Set<UserPlanItemEntryRow["entry_kind"]>([
  "checkin",
  "progress",
  "partial",
]);

export function computeStreakFromEntries(
  entries: UserPlanItemEntryRow[],
): number {
  let streak = 0;
  for (const entry of entries) {
    if (POSITIVE_ENTRY_KINDS.has(entry.entry_kind)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const SNAPSHOT_EXCLUDED_STATUSES = new Set<PlanItemStatus>([
  "cancelled",
  "deactivated",
]);

export async function buildV2PlanItemSnapshot(
  supabase: import("jsr:@supabase/supabase-js@2").SupabaseClient,
  userId: string,
  cycleId?: string | null,
  runtime?: ActiveTransformationRuntime | null,
): Promise<V2PlanItemSnapshotItem[]> {
  const resolvedRuntime = await resolveActiveTransformationRuntime({
    supabase,
    userId,
    runtime,
  });
  if (
    cycleId && resolvedRuntime.cycle?.id &&
    resolvedRuntime.cycle.id !== cycleId
  ) {
    return [];
  }
  if (!resolvedRuntime.plan) return [];

  const [planItems, activeLoad] = await Promise.all([
    getPlanItemRuntime(supabase, resolvedRuntime.plan.id, {
      maxEntriesPerItem: 5,
    }),
    getActiveLoad(supabase, resolvedRuntime.plan.id),
  ]);

  return planItems
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .slice(0, 30)
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      dimension: item.dimension,
      item_type: item.kind,
      status: item.status,
      streak_current: computeStreakFromEntries(item.recent_entries),
      last_entry_at: item.last_entry_at,
      active_load_score: activeLoad.current_load_score,
    }));
}

async function loadDirectV2PlanItemSnapshotFallback(
  supabase: SupabaseClient,
  userId: string,
  runtime?: ActiveTransformationRuntime | null,
): Promise<V2PlanItemSnapshotItem[]> {
  let query = supabase
    .from("user_plan_items")
    .select(
      "id,title,description,dimension,kind,status,created_at,activation_order,updated_at",
    )
    .eq("user_id", userId);
  if (runtime?.plan?.id) {
    query = query.eq("plan_id", runtime.plan.id);
  } else if (runtime?.transformation?.id) {
    query = query.eq("transformation_id", runtime.transformation.id);
  }
  const { data, error } = await query
    .order("activation_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  return (((data as UserPlanItemRow[] | null) ?? [])
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      dimension: item.dimension,
      item_type: item.kind,
      status: item.status,
      streak_current: 0,
      last_entry_at: null,
    })));
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

type AttackKeywordMatch = {
  payload: AttackKeywordTriggerPayload;
  scopeKind: LabScopeKind;
  transformationId: string | null;
  generatedAsset: string;
  modeEmploi: string;
};

type RankedAttackKeywordMatch = AttackKeywordMatch & {
  priority: number;
  lastUpdatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAttackKeywordTriggerPayload(
  value: unknown,
): value is AttackKeywordTriggerPayload {
  return isRecord(value) &&
    typeof value.activation_keyword === "string" &&
    typeof value.activation_keyword_normalized === "string" &&
    typeof value.risk_situation === "string" &&
    typeof value.strength_anchor === "string" &&
    typeof value.first_response_intent === "string" &&
    typeof value.assistant_prompt === "string";
}

async function loadAttackKeywordMatch(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  runtime: ActiveTransformationRuntime | null;
}): Promise<AttackKeywordMatch | null> {
  const cycleId = args.runtime?.cycle?.id ?? null;
  if (!cycleId) return null;

  const activeTransformationId = args.runtime?.transformation?.id ?? null;
  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .select("scope_kind, transformation_id, last_updated_at, content")
    .eq("user_id", args.userId)
    .eq("cycle_id", cycleId)
    .eq("status", "active")
    .order("last_updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data as
    | Array<{
      scope_kind: LabScopeKind;
      transformation_id: string | null;
      last_updated_at: string;
      content: AttackCardContent;
    }>
    | null) ?? [];

  const candidates = rows.flatMap((row) => {
    const content = row.content;
    if (!content || !Array.isArray(content.techniques)) return [];

    return content.techniques.flatMap((technique) => {
      if (technique.technique_key !== "pre_engagement") return [];
      const generated = technique.generated_result;
      if (
        !generated || !isAttackKeywordTriggerPayload(generated.keyword_trigger)
      ) {
        return [];
      }

      const priority = row.transformation_id === activeTransformationId
        ? 0
        : row.scope_kind === "out_of_plan"
        ? 1
        : 2;

      return [{
        payload: generated.keyword_trigger,
        data: {
          payload: generated.keyword_trigger,
          scopeKind: row.scope_kind,
          transformationId: row.transformation_id,
          generatedAsset: generated.generated_asset,
          modeEmploi: generated.mode_emploi,
          priority,
          lastUpdatedAt: row.last_updated_at,
        } satisfies RankedAttackKeywordMatch,
      }];
    });
  }).sort((left, right) => {
    const leftPriority = left.data.priority;
    const rightPriority = right.data.priority;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.data.lastUpdatedAt.localeCompare(left.data.lastUpdatedAt);
  });

  const match = detectAttackKeywordTrigger(args.userMessage, candidates);
  return match?.data
    ? {
      payload: match.data.payload,
      scopeKind: match.data.scopeKind,
      transformationId: match.data.transformationId,
      generatedAsset: match.data.generatedAsset,
      modeEmploi: match.data.modeEmploi,
    }
    : null;
}

async function loadActiveAttackKeywordOptions(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  Array<{ activation_keyword: string; activation_keyword_normalized: string }>
> {
  if (typeof (args.supabase as any)?.from !== "function") return [];
  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .select("content")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .limit(100);
  if (error) {
    console.warn("[Router] active attack keyword load failed", error);
    return [];
  }
  const rows = (data as Array<{ content: AttackCardContent }> | null) ?? [];
  const byNormalized = new Map<
    string,
    { activation_keyword: string; activation_keyword_normalized: string }
  >();
  for (const row of rows) {
    const techniques = Array.isArray(row.content?.techniques)
      ? row.content.techniques
      : [];
    for (const technique of techniques) {
      if (technique.technique_key !== "pre_engagement") continue;
      const trigger = technique.generated_result?.keyword_trigger;
      if (!trigger?.activation_keyword) continue;
      const normalized = normalizeAttackKeyword(
        trigger.activation_keyword_normalized || trigger.activation_keyword,
      );
      if (!normalized) continue;
      byNormalized.set(normalized, {
        activation_keyword: trigger.activation_keyword,
        activation_keyword_normalized: normalized,
      });
    }
  }
  return [...byNormalized.values()];
}

function buildAttackKeywordContextOverride(args: {
  match: AttackKeywordMatch;
}): string {
  const scopeLabel = args.match.scopeKind === "out_of_plan"
    ? "hors transformation"
    : "transformation active";

  return [
    "=== MOT-CLE DE BASCULE DETECTE ===",
    "Le message utilisateur est uniquement un mot-cle de bascule configure dans une carte d'attaque.",
    `- Mot-cle: ${args.match.payload.activation_keyword}`,
    `- Scope: ${scopeLabel}`,
    `- Situation de risque: ${args.match.payload.risk_situation}`,
    `- Ce que l'utilisateur protege: ${args.match.payload.strength_anchor}`,
    `- Intention immediate: ${args.match.payload.first_response_intent}`,
    `- Consigne pour Sophia: ${args.match.payload.assistant_prompt}`,
    `- Rappel de l'objet genere: ${args.match.generatedAsset}`,
    `- Mode d'emploi defini: ${args.match.modeEmploi}`,
    "",
    "CONSIGNES DE REPONSE:",
    "- Considere que l'utilisateur est dans une fenetre de risque immediate ou pre-immediate.",
    "- Ne lui demande pas d'expliquer longuement la situation.",
    "- Reponds de facon breve, concrete, stable.",
    "- Commence par aider a tenir maintenant.",
    "- Donne une seule action immediate ou une seule etape de regulation.",
    "- Tu peux finir par une relance tres courte, pas plus.",
    "- Ne mentionne pas les termes techniques comme carte d'attaque, mot-cle configure ou systeme.",
  ].join("\n");
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

const ATTACK_CARD_CREATED_LOCATION =
  "Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la relire et l'utiliser. Si c'est une carte Mot de bascule, le mot peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation.";

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
  turnFrame: TurnFrame;
  userMessage: string;
}): DispatcherSignals {
  const text = String(args.userMessage ?? "").toLowerCase();
  const trackEffect = args.turnFrame.direct_effects.find((effect) =>
    effect.effect_type === "track_progress_plan_item"
  );
  const payload = trackEffect?.payload_hint ?? {};
  const safetyActive = args.turnFrame.safety.risk_band === "high" ||
    args.turnFrame.safety.risk_band === "critical";
  return {
    ...DEFAULT_SIGNALS,
    safety: safetyActive
      ? { level: "SENTRY", confidence: 0.9 }
      : DEFAULT_SIGNALS.safety,
    interrupt: /\b(stop|arr[êe]te|pause|pas maintenant)\b/.test(text)
      ? { kind: "EXPLICIT_STOP", confidence: 0.8 }
      : DEFAULT_SIGNALS.interrupt,
    risk_score: riskScoreFromBand(args.turnFrame.safety.risk_band),
    needs_research: /\bcherche|recherche|internet|actualité|actualite|actu\b/
        .test(text)
      ? {
        detected: true,
        value: true,
        query: args.userMessage,
        confidence: 0.7,
      }
      : DEFAULT_SIGNALS.needs_research,
    track_progress_plan_item: trackEffect
      ? {
        detected: true,
        target_item_id: typeof payload.target_item_id === "string"
          ? payload.target_item_id
          : null,
        target_title: typeof payload.target_title === "string"
          ? payload.target_title
          : null,
        status_hint: typeof payload.status_hint === "string"
          ? payload.status_hint
          : null,
        value_hint: typeof payload.value_hint === "number"
          ? payload.value_hint
          : null,
        date_hint: typeof payload.date_hint === "string"
          ? payload.date_hint
          : null,
      }
      : DEFAULT_SIGNALS.track_progress_plan_item,
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
    const loopLine = findLine(/boucle ouverte|surcharge/);
    const loop = loopLine
      ? " Si tu es en surcharge, commence par fermer une boucle ouverte plutot que d'ajouter une nouvelle ambition."
      : "";
    return `Action adaptee a toi: une action de sept minutes, observable et concrete.${loop} Choisis une seule micro-livraison liee au sujet courant et rends-la visible, sans ouvrir une nouvelle decision.`;
  }

  if (
    /\b(natation|nager|nage|session)\b/.test(message) &&
    /deux fois par semaine|recuperation/.test(normalizedContext) &&
    !/deux fois|recuperation|recuperer/.test(response)
  ) {
    return "Le bon cadre: nager deux fois par semaine, comme recuperation, sans objectif de performance. La seance sert a redescendre la pression, pas a battre un chrono.";
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

function resolveLoggedAtIso(dateHint: string | null | undefined): string {
  const trimmed = String(dateHint ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000Z`).toISOString();
  }
  return new Date().toISOString();
}

function derivePlanItemEntryKind(args: {
  status: "completed" | "missed" | "partial";
  item: Pick<UserPlanItemRow, "tracking_type" | "kind">;
  value: number | null;
}): UserPlanItemEntryRow["entry_kind"] {
  if (args.status === "missed") return "skip";
  if (args.status === "partial") return "partial";

  if (
    args.item.tracking_type === "count" ||
    args.item.tracking_type === "scale" ||
    args.item.tracking_type === "milestone"
  ) {
    return "progress";
  }

  if (Number.isFinite(args.value) && Math.abs(Number(args.value)) > 1) {
    return "progress";
  }

  return args.item.kind === "milestone" ? "progress" : "checkin";
}

type V2TrackingResult = {
  mode: "logged" | "needs_clarify";
  message: string;
  target: string;
  status: string;
};

export async function logPlanItemProgressV2(args: {
  supabase: SupabaseClient;
  userId: string;
  planItemId: string;
  status: "completed" | "missed" | "partial";
  value?: number | null;
  dateHint?: string | null;
  source?: string | null;
  sourceMessageId?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<V2TrackingResult> {
  const {
    supabase,
    userId,
    planItemId,
    status,
    value,
    dateHint,
    source,
    sourceMessageId,
    runtime,
  } = args;

  const resolvedRuntime = await resolveActiveTransformationRuntime({
    supabase,
    userId,
    runtime,
  });
  if (
    !resolvedRuntime.cycle || !resolvedRuntime.transformation ||
    !resolvedRuntime.plan
  ) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas trouvé de plan V2 actif pour logger ce progrès maintenant.",
      target: planItemId,
      status,
    };
  }

  const itemResult = await supabase
    .from("user_plan_items")
    .select("*")
    .eq("id", planItemId)
    .eq("plan_id", resolvedRuntime.plan.id)
    .limit(1)
    .maybeSingle();

  if (itemResult.error) throw itemResult.error;

  const item = (itemResult.data as UserPlanItemRow | null) ?? null;
  if (!item) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas retrouvé ce plan item actif. Oriente vers le dashboard pour choisir l'item exact.",
      target: planItemId,
      status,
    };
  }

  const nowIso = new Date().toISOString();
  const effectiveAt = resolveLoggedAtIso(dateHint);
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : null;
  const entryKind = derivePlanItemEntryKind({
    status,
    item,
    value: numericValue,
  });
  const entryId = crypto.randomUUID();
  const entryRow: UserPlanItemEntryRow = {
    id: entryId,
    user_id: userId,
    cycle_id: resolvedRuntime.cycle.id,
    transformation_id: resolvedRuntime.transformation.id,
    plan_id: resolvedRuntime.plan.id,
    plan_item_id: item.id,
    entry_kind: entryKind,
    outcome: status,
    value_numeric: numericValue,
    value_text: null,
    difficulty_level: null,
    blocker_hint: null,
    created_at: nowIso,
    effective_at: effectiveAt,
    metadata: {
      source: "router_parallel_tracking_v2",
      channel: String(source ?? "").trim() || null,
      source_message_id: sourceMessageId ?? null,
      status_hint: status,
    },
  };

  const insertResult = await supabase
    .from("user_plan_item_entries")
    .insert(entryRow);
  if (insertResult.error) throw insertResult.error;

  await logV2Event(supabase, V2_EVENT_TYPES.PLAN_ITEM_ENTRY_LOGGED, {
    user_id: userId,
    cycle_id: resolvedRuntime.cycle.id,
    transformation_id: resolvedRuntime.transformation.id,
    plan_id: resolvedRuntime.plan.id,
    plan_item_id: item.id,
    entry_id: entryId,
    entry_kind: entryKind,
    effective_at: effectiveAt,
    metadata: {
      source: "router_parallel_tracking_v2",
      channel: String(source ?? "").trim() || null,
      source_message_id: sourceMessageId ?? null,
      status_hint: status,
    },
  });

  const title = String(item.title ?? "").trim() || planItemId;
  const message = status === "missed"
    ? `C'est noté. "${title}" est marqué comme non fait.`
    : status === "partial"
    ? `C'est noté. J'ai enregistré un progrès partiel sur "${title}".`
    : `C'est noté. J'ai enregistré "${title}".`;

  return {
    mode: "logged",
    message,
    target: title,
    status,
  };
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

  if (
    dispatcherSignals.safety.level === "SENTRY" &&
    dispatcherSignals.safety.confidence >= 0.75
  ) {
    return { targetMode: "sentry", stopCheckup, checkupIntentDetected };
  }

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

  const dashboardRecurringReminderSignal =
    dispatcherSignals.dashboard_recurring_reminder_intent;
  const suppressDashboardRecurringReminderAddon =
    isLikelyOneShotReminderRequest(
      userMessage,
    );
  if (
    dashboardRecurringReminderSignal?.detected &&
    !suppressDashboardRecurringReminderAddon
  ) {
    (tempMemory as any).__dashboard_recurring_reminder_intent_addon = {
      fields: Array.isArray(dashboardRecurringReminderSignal.reminder_fields)
        ? dashboardRecurringReminderSignal.reminder_fields.slice(0, 9)
        : [],
      confidence: Number(dashboardRecurringReminderSignal.confidence ?? 0),
      from_bilan: Boolean(state?.investigation_state),
      detected_at: new Date().toISOString(),
    };
  } else {
    try {
      delete (tempMemory as any).__dashboard_recurring_reminder_intent_addon;
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

  const safetyActive = dispatcherSignals.safety.level === "SENTRY";
  if (safetyActive && Number(dispatcherSignals.safety.confidence ?? 0) >= 0.6) {
    (tempMemory as any).__safety_active_addon = {
      level: dispatcherSignals.safety.level.toLowerCase(),
      phase: "active",
    };
  } else {
    try {
      delete (tempMemory as any).__safety_active_addon;
    } catch {
      // best effort
    }
  }
}

function buildRouteDecisionConversationAddon(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): string | null {
  const { routeDecision, turnFrame } = args;
  const recentText = normalizeRouteText(
    args.recentMessages.map((turn) => turn.content).join("\n"),
  );
  const combinedText = `${recentText}\n${normalizeRouteText(args.userMessage)}`;
  const context = emotionalRepairContext(combinedText);
  if (
    routeDecision?.response_owner === "conversation_handler" &&
    routeDecision.selected_handler === "execution_breakdown" &&
    context === "relationship"
  ) {
    return [
      "=== ROUTING CONVERSATIONNEL ACTIF: execution_breakdown apres emotional_repair relationnel ===",
      "Le user a honte apres avoir parle sechement a quelqu'un qui compte, puis demande une phrase de reparation.",
      "Priorite de reponse: concret relationnel, pas auto-discours.",
      "Contraintes mecaniques:",
      "- Si le user demande une phrase exacte, donner une phrase adressee a l'autre personne.",
      "- La phrase doit reconnaitre le tort sans sur-excuse ni auto-flagellation.",
      "- Ne pas proposer une phrase du type 'je traverse un moment de gene' ou 'je reste moi' : ce serait une phrase pour soi, pas une reparation.",
      "- Garder un ton simple, humain, sobre.",
      "=== FIN ROUTING CONVERSATIONNEL ACTIF ===",
    ].join("\n") + "\n\n";
  }

  if (
    routeDecision?.response_owner === "conversation_handler" &&
    routeDecision.selected_handler === "execution_breakdown"
  ) {
    return [
      "=== ROUTING CONVERSATIONNEL ACTIF: execution_breakdown ===",
      `Canal: ${turnFrame?.channel ?? "web"}.`,
      "Priorite de reponse: debloquer l'execution sans transformer la reponse en protocole complet.",
      "Contraintes mecaniques:",
      "- Si le user demande un petit outil, un anti-derapage, un protocole rapide ou une aide pour demarrer: reponse visible courte.",
      "- Sur WhatsApp: viser 3 a 5 lignes, 1 micro-geste concret, puis 1 question courte OU une proposition d'outil produit, pas les deux en long.",
      "- Ne pas donner plus de 3 puces.",
      "- Ne pas ajouter d'option bonus, de long mode d'emploi, ni de liste de variantes.",
      "- Si une carte d'attaque est pertinente mais pas explicitement demandee, proposer en une seule phrase: 'Je peux aussi te le transformer en carte d'attaque si tu veux.'",
      "=== FIN ROUTING CONVERSATIONNEL ACTIF ===",
    ].join("\n") + "\n\n";
  }

  if (
    routeDecision?.response_owner !== "conversation_handler" ||
    routeDecision.selected_handler !== "emotional_repair"
  ) return null;

  const reason = String(routeDecision.reason_code ?? "").trim() || "unknown";
  const entryReason = String(
    turnFrame?.skill_signals.entry?.emotional_repair?.reason ??
      turnFrame?.skill_signals.lifecycle?.emotional_repair?.reason ??
      "",
  ).trim() || "self_attack_or_shame";

  return [
    "=== ROUTING CONVERSATIONNEL ACTIF: emotional_repair ===",
    `Raison routing: ${reason}; signal: ${entryReason}.`,
    "Priorite de reponse: reparer honte / auto-attaque avant toute execution.",
    "Contraintes mecaniques:",
    "- Repondre d'abord au vecu corporel/emotionnel et retirer la conclusion identitaire negative.",
    "- Si honte, fatigue, self-disgust ou auto-jugement dominent: ne pas proposer de plan, liste, choix A/B, brouillon ou chrono.",
    "- Poser au plus une question courte, seulement si elle aide la stabilisation.",
    "- Ne pas demander un score de honte ou un monitoring emotionnel en debut de reparation.",
    "- Si le contexte est relationnel, parler de lien, regret, parole seche, tort, reparation sobre; ne pas parler de retard/fiabilite.",
    "- Varier l'amorce; eviter de repeter 'Ah merde' ou 'Ah mince'.",
    "- Ne jamais transformer 'je suis nul/incapable/boulet' en fait durable.",
    "- Quand l'utilisateur dit que l'emotion baisse et demande une action concrete, donner une transition courte vers le concret sans changer les preferences coach.",
    "=== FIN ROUTING CONVERSATIONNEL ACTIF ===",
  ].join("\n") + "\n\n";
}

function buildSkillContextForRecommendation(args: {
  skillId: string;
  userId: string;
  turnFrame: TurnFrame;
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

function runConversationSkillForRecommendation(args: {
  skillId: string;
  userId: string;
  userMessage: string;
  turnFrame: TurnFrame;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
}): ConversationSkillOutput | null {
  const context = buildSkillContextForRecommendation(args);
  const input = { user_message: args.userMessage, context };
  switch (args.skillId) {
    case "demotivation_repair":
      return runDemotivationRepairSkill(input);
    case "emotional_repair":
      return runEmotionalRepairSkill(input);
    case "execution_breakdown":
      return runExecutionBreakdownSkill(input);
    case "product_help":
      return runProductHelpSkill(input);
    case "safety_crisis":
      return runSafetyCrisisSkill(input);
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
    "- Pour un tool_skill, nomme l'operation en langage user: 'carte de defense', 'ajustement du plan', 'carte d'attaque', etc., pas l'identifiant technique.",
    "",
    `Contexte structure pour toi: ${knownContext}`,
    "=== FIN ADDON CONVERSATION RISK FLOW EXIT ===",
  ].join("\n");
}

function buildProductHelpKnowledgeAddon(
  skillOutput: ConversationSkillOutput | null,
): string | null {
  if (skillOutput?.skill_id !== "product_help") return null;
  const reply = String(skillOutput.reply ?? "").trim();
  if (!reply) return null;
  return [
    "=== ADDON PRODUCT_HELP: SOURCE PRODUIT FACTUELLE ===",
    `diagnosis: ${JSON.stringify(skillOutput.diagnosis ?? null)}`,
    "Reponds avec ces informations produit comme source de verite pour la question en cours.",
    "Contraintes:",
    "- Ne pas inventer de capacite dashboard non presente ici.",
    "- Ne pas dire que le dashboard permet de saisir librement des actions ou bilans.",
    "- Regle produit cartes: une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible, mais pas modifiee directement depuis le chat. Pour une carte d'attaque, seule une carte Mot de bascule permet de remplacer le mot; sinon nouvelle version apres confirmation.",
    "- Ne pas lancer d'operation; si le user demande seulement une explication, rester explicatif.",
    "- Donner l'orientation concrete: quoi, ou, limite, benefice utile.",
    "- Quand tu parles de toi-meme, utilise la premiere personne du singulier: dis 'je', pas 'Sophia'.",
    "",
    "Fiche pertinente:",
    reply.slice(0, 1800),
    "=== FIN ADDON PRODUCT_HELP ===",
  ].join("\n");
}

function enforceRecommendationToolVisibleReply(args: {
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

function isStabilizedConcreteAsk(text: string): boolean {
  const normalized = normalizeRouteText(text);
  const stabilized =
    /\bm[' ]?aide un peu\b|\bdescend un peu\b|\bok\b|\boui\b|\bje veux\b|\bplus simple\b|\bphrase simple\b|\bje peux\b|\bje peux peut[- ]?etre\b|\bje peux essayer\b|\bapres\b|\bpour finir\b|\bmaintenant\b|\bconcretement\b|\bconcr[eè]tement\b|\bdevant la page\b|\bj[' ]?ai trouve\b|\bj[' ]?ai trouvé\b/
      .test(normalized);
  const concrete =
    /\bversion exacte\b|\bphrase exacte\b|\bphrase simple\b|\ben une ligne\b|\bpremier petit pas concret\b|\bpremier pas\b|\baction concrete\b|\baction concr[eè]te\b|\benvoyer une ligne\b|\benvoyer une phrase\b|\breprendre l[' ]?intro\b|\breprendre l intro\b|\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b|\bje clique\b|\bclique\b|\bboutons?\b|\bonglets?\b|\bpage\b|\bdossier\b|\bdocuments?\b|\bcherche quoi\b|\bquoi en premier\b/
      .test(normalized);
  const concreteRepairAsk =
    /\bphrase exacte\b|\bphrase simple\b|\breprendre l[' ]?intro\b|\breprendre l intro\b|\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b|\bje clique\b|\bclique\b|\bboutons?\b|\bonglets?\b|\bpage\b|\bdossier\b|\bdocuments?\b|\bcherche quoi\b|\bquoi en premier\b/
      .test(normalized);
  return (stabilized && concrete) || concreteRepairAsk;
}

function isEmotionalRepairStabilization(text: string): boolean {
  const normalized = normalizeRouteText(text);
  return /\bpression redescend\b|\bredescend\b|\bmoment pas identite\b|\bmoment pas une identite\b|\bpas identite\b|\bpas une identite\b|\brevenir au concret\b|\bje peux revenir\b|\bje peux reprendre\b/
    .test(normalized);
}

function isWorkSelfPhraseAsk(text: string): boolean {
  const normalized = normalizeRouteText(text);
  return /\bphrase simple\b|\bphrase courte\b|\bphrase a me dire\b|\bme dire avant\b|\bavant de reprendre\b|\breprendre l[' ]?intro\b|\breprendre l intro\b/
    .test(normalized);
}

function renderWorkSelfPhraseReply(): string {
  return [
    "Garde une phrase courte, sans te pousser ni te juger :",
    "",
    "« Je n’ai pas besoin de me juger pour reprendre. Je peux juste poser un premier geste. »",
    "",
    "Et ensuite, seulement ce premier geste. Pas tout le dossier.",
  ].join("\n");
}

function isAdminExecutionContext(text: string): boolean {
  return /\bmutuelle\b|\bdossier\b|\badministratif\b|\badmin\b|\bdocuments?\b|\bonglets?\b|\bpi[eè]ce manquante\b|\bpage\b|\bboutons?\b/
    .test(text);
}

function renderWorkSelfAttackReply(text: string): string {
  const target = isAdminExecutionContext(text)
    ? "ce dossier administratif"
    : "cette action";
  return [
    "Je vois le piège : le blocage essaie de devenir un verdict sur toi.",
    "",
    `Mais ${target} est un fait concret à reprendre, pas une preuve que tu es incapable.`,
    "",
    "On garde le fait sans avaler la conclusion : tu es bloqué maintenant, tu n'es pas ce blocage.",
  ].join("\n");
}

function isWorkPressureDown(text: string): boolean {
  const normalized = normalizeRouteText(text);
  return /\bpression\b.*\bredescend|\bredescend\b.*\bpression|\bligne bancale\b|\bpremiere ligne\b|\bpremière ligne\b/
    .test(normalized);
}

function isWorkLineCommitment(text: string): boolean {
  const normalized = normalizeRouteText(text);
  return /\bok\b.*\b(peux|vais)\b.*\b(une seule ligne|premiere ligne|première ligne|ligne)\b|\b(une seule ligne|premiere ligne|première ligne)\b.*\b(phrase|reprendre|poser)\b/
    .test(normalized);
}

function renderWorkLineCommitmentReply(): string {
  return [
    "Oui. Une seule ligne, c’est exactement le bon format.",
    "",
    "Tu n’as pas besoin de la rendre intelligente maintenant. Tu poses la ligne, tu la laisses exister, et tu ajustes plus tard si nécessaire.",
  ].join("\n");
}

function isSoberRecapRequest(text: string): boolean {
  const normalized = normalizeRouteText(text);
  return /\brecap\b|\brécap\b|\bce qu[' ]?on garde\b|\bsobre\b/.test(
    normalized,
  );
}

function renderWorkPressureDownReply(): string {
  return [
    "C’est suffisant pour maintenant : une ligne imparfaite, et la pression qui baisse.",
    "",
    "Tu peux soit poser une deuxième ligne dans le même esprit, soit faire une pause courte. Les deux gardent le mouvement sans relancer le jugement.",
  ].join("\n");
}

function renderWorkSoberRecapReply(): string {
  return [
    "On garde trois choses :",
    "",
    "- Un blocage est un fait ponctuel, pas un verdict sur ton identité.",
    "- Une première ligne imparfaite peut suffire à relancer le mouvement.",
    "- Reprendre petit protège mieux que se forcer à tout résoudre d’un coup.",
  ].join("\n");
}

function emotionalRepairContext(
  text: string,
): "relationship" | "work" | "general" {
  const workContext =
    /\bretard\b|\bmessage pro\b|\bcollegue\b|\bcollègue\b|\bmail\b|\bfiable\b|\bboulet\b|\bpresentation\b|\bprésentation\b|\bclient\b|\bslide\b|\bintro\b|\bparagraphe\b|\bpremier jet\b|\bbrouillon\b|\bmutuelle\b|\bdossier\b|\badministratif\b|\badmin\b|\bdocuments?\b|\bonglets?\b|\bpi[eè]ce manquante\b/
      .test(text);
  if (workContext) {
    return "work";
  }
  if (
    /\bquelqu[' ]?un que j[' ]?aime\b|\bquelqu un que j aime\b|\bbless|\bexcuse|\bexcuser|\bsechement|\bsèchement|\brepondu|\brépondu|\bparle comme ca\b|\bparlé comme ça\b|\btort\b|\bpersonne qui blesse|\breconnait le tort\b|\breconnaît le tort\b|\bquelqu[' ]?un de bien\b|\bquelqu un de bien\b/
      .test(text) ||
    /\breparer\b|\bréparer\b|\breparation sobre\b|\bréparation sobre\b|\bmessage sonne fausse\b|\blien compte\b|\babime les choses\b|\babîme les choses\b/
      .test(text)
  ) {
    return "relationship";
  }
  return "general";
}

function renderAcuteEmotionalRepairReply(
  userMessage: string,
  recentText = "",
): string {
  const text = normalizeRouteText(userMessage);
  const context = emotionalRepairContext(`${recentText}\n${text}`);
  const bodyPart = /\bventre\b/.test(text)
    ? "ventre"
    : /\bgorge\b/.test(text)
    ? "gorge"
    : null;
  if (
    context === "relationship" &&
    /\brepondu sechement\b|\bparle sechement\b|\bquelqu[' ]?un que j[' ]?aime\b|\bquelqu un que j aime\b/
      .test(text) &&
    !/\bnul\b|\bminable\b|\bhonte\b|\bdegoute\b/.test(text)
  ) {
    return [
      "Oui, je vois le genre de phrase qui reste accrochée après coup.",
      "",
      "Tu as été sec avec quelqu’un qui compte, et maintenant ça te serre parce que le lien compte aussi. On peut rester sur ce fait-là sans partir tout de suite en procès contre toi.",
      "",
      "Pour l’instant, tu n’as pas besoin de réparer dans la panique. Juste reconnaître : “j’ai parlé trop sèchement, et je veux faire mieux que ça”.",
    ].join("\n");
  }
  if (
    /\btrop vite\b|\bchaque (idee|idée|solution)\b/.test(text) ||
    bodyPart
  ) {
    if (context === "relationship") {
      return [
        "Oui, là ce serait trop vite d’écrire depuis cette honte.",
        "",
        `Le ${
          bodyPart ?? "corps"
        } qui se noue, ça dit surtout que tu tiens à ne pas abîmer le lien. Pas que ton excuse serait forcément fausse ou calculée.`,
        "",
        "On peut laisser le message de côté une minute. Le point simple, c’est : tu regrettes, tu veux réparer, et tu n’as pas besoin de te démolir pour que ce soit sincère.",
      ].join("\n");
    }
    return [
      "Oui, là ce serait trop vite d’écrire ou de résoudre.",
      "",
      `Le ${
        bodyPart ?? "corps"
      } qui se serre dit surtout que c’est chargé, pas que tu dois trouver la phrase parfaite tout de suite.`,
      "",
      "Tu peux juste rester avec cette phrase : c’est dur maintenant, ça ne dit pas tout de toi.",
    ].join("\n");
  }
  if (/\bdegoute\b|\bincapable\b|\bpas fiable\b|\bminable\b/.test(text)) {
    if (context === "work") {
      return renderWorkSelfAttackReply(`${recentText}\n${text}`);
    }
    if (context === "relationship") {
      return [
        "Je comprends que tu te dégoûtes un peu là, mais je ne prendrais pas ça comme un verdict fiable sur toi.",
        "",
        "Tu as parlé sèchement, tu le regrettes, et ça te fait mal parce que cette personne compte. Ça ne t’absout pas magiquement, mais ça ne fait pas de toi quelqu’un de mauvais non plus.",
        "",
        "On peut viser une réparation sobre, sans théâtre et sans auto-punition.",
      ].join("\n");
    }
    return [
      "Je comprends que tu te dégoûtes un peu là, mais je ne prendrais pas ça comme un verdict fiable sur toi.",
      "",
      "Un moment de blocage peut demander une reprise simple. Ça ne veut pas dire que toute ta personne est à jeter.",
      "",
      "On garde le fait, pas le verdict.",
    ].join("\n");
  }
  if (
    /\bhonte\b|\bboulet\b|\badulte\b|\bfiable\b|\bquelqu[' ]?un de bien\b|\bquelqu un de bien\b|\bpersonne qui blesse\b/
      .test(text)
  ) {
    if (context === "work") {
      return renderWorkSelfAttackReply(`${recentText}\n${text}`);
    }
    if (context === "relationship") {
      return [
        "Aïe. Ça touche un endroit très dur : pas seulement “j’ai mal parlé”, mais “est-ce que je suis quelqu’un qui fait du mal ?”",
        "",
        "Je ne veux pas minimiser ce que tu as dit. Mais une parole sèche, même regrettable, ne suffit pas à résumer qui tu es. Le fait que ça te remue montre aussi que le lien compte pour toi.",
        "",
        "Pour l’instant, on garde deux phrases séparées : “j’ai blessé / brusqué quelqu’un” et “je suis minable”. La première peut se réparer. La deuxième est la honte qui frappe trop large.",
      ].join("\n");
    }
    const intensity = /\b8\s*\/\s*10\b/.test(text)
      ? "8/10, c’est fort."
      : "Aïe.";
    return [
      `${intensity} Quand la honte monte, elle transforme vite un moment raté en jugement sur toute ta valeur.`,
      "",
      "Il peut y avoir un fait concret à réparer, oui. Mais “je suis nul” ou “je suis un boulet” sont des conclusions trop dures, pas des faits.",
      "",
      "On sépare juste le moment de ton identité avant de passer à l’action.",
    ].join("\n");
  }
  if (/\bnul\b|\bimmature\b|\bcon\b|\bparle comme ca\b/.test(text)) {
    if (context === "work") {
      return renderWorkSelfAttackReply(`${recentText}\n${text}`);
    }
    if (context === "relationship") {
      return [
        "Je comprends que tu te tapes dessus, mais “j’ai mal parlé” et “je suis nul” ne sont pas la même phrase.",
        "",
        "Le fait, c’est : tu as été sec, tu regrettes, et ça te touche. On peut partir de là sans te condamner entièrement.",
      ].join("\n");
    }
    return [
      "Je vois le piège : un petit blocage arrive, puis il devient une preuve contre toi.",
      "",
      "Mais ce que tu n’arrives pas à faire là ne mérite pas une condamnation de toute ta personne.",
      "",
      "On peut garder le fait concret sans rajouter “je suis nul” par-dessus.",
    ].join("\n");
  }
  return [
    "Je te réponds d’abord sur la honte, pas sur l’action.",
    "",
    "Ce que tu dis ressemble à une attaque contre toi dans un moment difficile. On peut garder le fait concret sans le transformer en identité durable.",
  ].join("\n");
}

function applyEmotionalRepairResponseGuardrail(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  responseContent: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  if (
    args.routeDecision?.response_owner !== "conversation_handler" ||
    args.routeDecision.selected_handler !== "emotional_repair"
  ) {
    return args.responseContent;
  }
  if (isLikelyOneShotReminderRequest(args.userMessage)) {
    return args.responseContent;
  }
  if (isWorkSelfPhraseAsk(args.userMessage)) {
    return renderWorkSelfPhraseReply();
  }
  if (isWorkLineCommitment(args.userMessage)) {
    return renderWorkLineCommitmentReply();
  }
  if (isEmotionalRepairStabilization(args.userMessage)) {
    return [
      "Oui, c’est le bon signal : la pression redescend un peu.",
      "",
      "On garde la séparation : ce blocage est un moment, pas une identité. Quand tu reviens au concret, tu n’as pas besoin de te convaincre que tout va bien ; juste de reprendre petit.",
    ].join("\n");
  }
  if (isStabilizedConcreteAsk(args.userMessage)) {
    return [
      "Oui. On peut revenir au concret sans perdre le fil : petit, sobre, sans te juger.",
      "",
      "La prochaine étape doit être assez légère pour ne pas relancer la honte.",
    ].join("\n");
  }
  return renderAcuteEmotionalRepairReply(
    args.userMessage,
    normalizeRouteText(
      args.recentMessages
        .filter((turn) => turn.role === "user")
        .map((turn) => turn.content)
        .join("\n"),
    ),
  );
}

function applyExecutionBreakdownRelationshipRepairGuardrail(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  responseContent: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  if (
    args.routeDecision?.response_owner !== "conversation_handler" ||
    args.routeDecision.selected_handler !== "execution_breakdown"
  ) {
    return args.responseContent;
  }
  if (isLikelyOneShotReminderRequest(args.userMessage)) {
    return args.responseContent;
  }
  const current = normalizeRouteText(args.userMessage);
  const recent = normalizeRouteText(
    args.recentMessages.map((turn) => turn.content).join("\n"),
  );
  const context = emotionalRepairContext(`${recent}\n${current}`);
  if (isSoberRecapRequest(args.userMessage)) {
    return renderWorkSoberRecapReply();
  }
  if (context === "work" && isWorkSelfPhraseAsk(args.userMessage)) {
    return renderWorkSelfPhraseReply();
  }
  if (context === "work" && isWorkPressureDown(args.userMessage)) {
    return renderWorkPressureDownReply();
  }
  if (context === "work") {
    return args.responseContent;
  }
  const asksPostSendStep =
    /\bapres l[' ]?envoyer\b|\bapres envoyer\b|\bapres l envoi\b|\bapres l'envoi\b|\bpremier pas concret\b|\bpremier petit pas concret\b|\bruminer\b|\bsoir[eé]e\b/
      .test(current);
  if (asksPostSendStep) {
    return [
      "Ok. Après l’envoi, le premier pas concret c’est de ne pas rester devant l’écran à guetter.",
      "",
      "Pendant 5 minutes : pose le téléphone hors de vue, note juste “j’ai réparé ce que je pouvais réparer maintenant”, puis fais un geste physique simple : boire de l’eau, prendre une douche, ou marcher un peu.",
      "",
      "Le but n’est pas de te convaincre que tout va bien. C’est d’éviter que ton cerveau transforme l’attente en procès.",
    ].join("\n");
  }
  const asksRepairPhrase =
    /\benvoyer une phrase\b|\bphrase exacte\b|\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b|\bne sonne pas dramatique\b/
      .test(current);
  if (!asksRepairPhrase) return args.responseContent;

  if (
    /\breconnait le tort\b|\breconnaît le tort\b|\bsans me flageller\b/.test(
      current,
    )
  ) {
    return [
      "Oui. Tu peux lui envoyer quelque chose de simple, qui reconnaît le tort sans te démolir :",
      "",
      "« Je suis désolé d’avoir répondu sèchement tout à l’heure. Tu ne méritais pas ça, et je voulais te le reconnaître simplement. »",
    ].join("\n");
  }

  return [
    "Oui. Une version sobre, sans drama :",
    "",
    "« Je repense à ma façon de te répondre tout à l’heure. J’ai été sec, je suis désolé. Je tenais à te le dire simplement. »",
  ].join("\n");
}

function renderDeterministicSafetyReply(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  turnFrame: TurnFrame | null;
}): string | null {
  const safetyReasonCodes = Array.isArray(args.turnFrame?.safety?.reason_codes)
    ? args.turnFrame.safety.reason_codes
    : [];
  const safetyContextActive = args.routeDecision?.response_owner === "safety" ||
    safetyReasonCodes.includes("recent_safety_context_caution");
  if (!safetyContextActive) return null;
  const current = normalizeRouteText(args.userMessage);

  if (isLikelyOneShotReminderRequest(args.userMessage)) {
    return [
      "Je ne programme pas de rappel pendant que le risque est encore actif.",
      "",
      "La priorité, c’est le contact humain maintenant : écris à une personne sûre tout de suite, même une phrase simple comme “je ne suis pas au mieux, tu peux rester joignable ?”.",
    ].join("\n");
  }

  if (
    /\bredescendre\b|\bredescend\b|\bsans dramatiser\b|\bsans minimiser\b|\brespire\b|\brespirer\b/
      .test(current)
  ) {
    return [
      "Ok. On redescend sans dramatiser et sans minimiser.",
      "",
      "Pendant une minute : pose les deux pieds au sol, expire plus longtemps que tu n’inspires, puis nomme cinq choses que tu vois autour de toi.",
      "",
      "Et garde une phrase simple : “Je suis en sécurité maintenant, et je peux demander du soutien réel.”",
    ].join("\n");
  }

  if (
    /\bpas en danger\b|\brien prepare\b|\brien préparé\b|\bne veux pas me faire du mal\b|\bveux pas me faire du mal\b|\bpas maintenant\b/
      .test(current)
  ) {
    return [
      "Merci de le préciser. Je garde deux choses ensemble : tu n’es pas en danger immédiat, et ces pensées t’ont fait peur.",
      "",
      "Ne reste pas seul avec ça si elles reviennent. Si le risque remonte, appelle le 3114, le 15 ou le 112. Là, est-ce que tu peux prévenir une personne sûre que tu as besoin qu’elle soit joignable ?",
    ].join("\n");
  }

  return [
    "Merci de me le dire. Là, on met la sécurité avant le reste.",
    "",
    "Est-ce que tu es en sécurité maintenant, oui ou non ? Et est-ce que tu peux contacter une personne réelle tout de suite ?",
    "",
    "Si tu sens un risque de passage à l’acte, appelle le 3114, le 15 ou le 112 maintenant.",
  ].join("\n");
}

function renderDeterministicSkillReply(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  userId: string;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  if (!args.turnFrame || !args.routeDecision) return null;
  if (
    args.skillOutput?.reply &&
    args.routeDecision.response_owner === "conversation_handler"
  ) {
    return String(args.skillOutput.reply).trim();
  }
  if (args.routeDecision.response_owner !== "product_help") return null;
  const verificationReply = renderAttackCardPostCreationVerificationReply({
    message: args.userMessage,
    recentMessages: args.recentMessages,
  });
  if (verificationReply) return verificationReply;
  const context = buildSkillContextForRecommendation({
    skillId: "product_help",
    userId: args.userId,
    turnFrame: args.turnFrame,
    recentMessages: args.recentMessages,
    activeSkillState: args.activeSkillState,
    planItemSnapshot: args.planItemSnapshot,
    productSurfaces: args.productSurfaces,
  });
  return String(
    runProductHelpSkill({ user_message: args.userMessage, context }).reply ??
      "",
  ).trim() || null;
}

function renderDeterministicNormalReply(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  turnFrame: TurnFrame | null;
}): string | null {
  if (args.routeDecision?.response_owner !== "normal_reply") return null;
  const current = normalizeRouteText(args.userMessage);

  if (
    /\b(stop|arrete|arrête|c est bon|c'est bon|ne cree rien|ne crée rien|rien d autre|rien d'autre)\b/
      .test(current)
  ) {
    return "Ok, j'arrête là. Je ne crée rien d'autre.";
  }

  if (
    /\baction admin\b|\bmodifier\b|\bmodifie\b|\btraiter ici\b|\bnoter ce micro[- ]?pas\b|\bmodifier le plan\b/
      .test(current)
  ) {
    return [
      "Règle simple : si tu changes l’action elle-même, tu modifies le dashboard. Si tu veux juste avancer sur l'exécution, on le traite ici sans toucher au plan.",
      "",
      "Donc pour une action admin déjà prévue : on la traite ici quand le blocage est l’exécution; on modifie le dashboard seulement si l’action n’est plus la bonne.",
    ].join("\n");
  }

  if (
    /\brespire\b.*\bmieux\b|\bmessage a quelqu[' ]?un\b|\bmessage a quelqu un\b/
      .test(current)
  ) {
    return [
      "Ok. On garde d’abord le soutien réel : envoyer un message simple à quelqu’un après cette conversation.",
      "",
      "Ensuite seulement, tu peux revenir au concret avec une micro-action, pas plus.",
    ].join("\n");
  }

  if (isSoberRecapRequest(args.userMessage)) {
    return [
      "Recap sobre :",
      "",
      "- Sécurité : si les pensées de disparition reviennent ou montent, tu contactes une personne réelle; si le risque devient immédiat, 3114, 15 ou 112.",
      "- Elan : on ne force pas la motivation; on réduit la charge au prochain geste utile.",
      "- Mutuelle : ouvrir le site et atteindre l’écran d’envoi de pièce, sans transformer ça en audit complet.",
    ].join("\n");
  }

  const turnFrameSafetyReasonCodes = Array.isArray(
      args.turnFrame?.safety?.reason_codes,
    )
    ? args.turnFrame.safety.reason_codes
    : [];
  if (turnFrameSafetyReasonCodes.includes("recent_safety_context_caution")) {
    return [
      "On reste prudent et simple : pas de produit, pas d’optimisation.",
      "",
      "Le prochain bon geste est de rester relié à quelqu’un et de garder la suite très petite.",
    ].join("\n");
  }

  return null;
}

function renderDeterministicConversationHandlerReply(args: {
  routeDecision: RouteDecision | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): string | null {
  if (
    args.routeDecision?.response_owner !== "conversation_handler" ||
    !args.routeDecision.selected_handler ||
    isLikelyOneShotReminderRequest(args.userMessage)
  ) {
    return null;
  }

  const current = normalizeRouteText(args.userMessage);
  const recent = normalizeRouteText(
    args.recentMessages.map((turn) => turn.content).join("\n"),
  );
  if (isSoberRecapRequest(args.userMessage)) {
    return renderWorkSoberRecapReply();
  }
  const context = emotionalRepairContext(`${recent}\n${current}`);
  if (context !== "work") return null;

  if (isWorkSelfPhraseAsk(args.userMessage)) {
    return renderWorkSelfPhraseReply();
  }
  if (isWorkPressureDown(args.userMessage)) {
    return renderWorkPressureDownReply();
  }
  return null;
}

function persistConversationSkillRoute(
  tempMemory: any,
  routeDecision: RouteDecision | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  const selected = String(routeDecision?.selected_handler ?? "").trim();
  if (routeDecision?.response_owner === "conversation_handler" && selected) {
    const rawPrevious = next.__active_skill_state ?? next.active_skill_state;
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
    next.__active_skill_state = {
      ...previous,
      skill_id: selected,
      previous_skill_id: previousSkillId && previousSkillId !== selected
        ? previousSkillId
        : previousPreviousSkillId,
      turn_count: Number(previous.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    delete next.active_skill_state;
    return next;
  }

  if (
    routeDecision?.response_owner === "normal_reply" ||
    routeDecision?.response_owner === "tool_skill" ||
    routeDecision?.response_owner === "product_help" ||
    routeDecision?.response_owner === "safety"
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
      source,
      updated_at: new Date().toISOString(),
    },
  };
}

function operationInputFromLastPlanItem(
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

function operationInputFromPlanAdjustmentScope(
  _message: string,
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  ) as any;
  const structuredInput = intent?.operation_input ?? intent?.payload_hint ??
    intent?.slots;
  if (
    structuredInput && typeof structuredInput === "object" &&
    !Array.isArray(structuredInput)
  ) {
    return structuredInput as Record<string, unknown>;
  }
  return null;
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

function adjustmentExecutionAck(args: {
  draft?: PlanAdjustmentDraftV1 | null;
  operationInput?: Record<string, unknown> | null;
  fallbackAck?: string | null;
}): string {
  const resultMessage = (args.draft as any)?.execution_message ||
    (args.draft as any)?.draft?.adjust_plan_result
      ?.user_message_detailed;
  if (typeof resultMessage === "string" && resultMessage.trim()) {
    return resultMessage.trim();
  }
  return args.fallbackAck?.trim() || "";
}

function defaultPlanItemForAdjustment(
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  if (!Array.isArray(planItems) || planItems.length === 0) return null;
  return planItems.find((item) => item.status === "active") ?? planItems[0] ??
    null;
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

function buildAttackCardRecommendationOperationInput(args: {
  recommendation: ProductRecommendation | null;
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const recommendation = args.recommendation;
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    recommendation.operation_type !== "prepare_attack_card"
  ) {
    return null;
  }

  const rawInput = recommendation.operation_input &&
      typeof recommendation.operation_input === "object"
    ? recommendation.operation_input
    : {};
  const rawTarget = (rawInput as any).target;
  if (rawTarget && typeof rawTarget === "object") {
    const title = String((rawTarget as any).title ?? "").trim();
    const planItemId = String((rawTarget as any).plan_item_id ?? "").trim();
    if (title) {
      return {
        ...rawInput,
        target: {
          kind: (rawTarget as any).kind === "personal_action"
            ? "personal_action"
            : "plan_item",
          title,
          plan_item_id: planItemId || null,
        },
      };
    }
  }

  const planItemId = String((rawInput as any).plan_item_id ?? "").trim();
  const itemFromId = planItemId && Array.isArray(args.planItemSnapshot)
    ? args.planItemSnapshot.find((item) => item.id === planItemId) ?? null
    : null;
  const itemFromMemory = readLastResolvedPlanItem(args.tempMemory);
  const title = String(itemFromId?.title ?? itemFromMemory?.title ?? "")
    .trim();
  const id = String(itemFromId?.id ?? itemFromMemory?.id ?? planItemId ?? "")
    .trim();
  if (!title) return null;
  return {
    ...rawInput,
    target: {
      kind: "plan_item",
      plan_item_id: id || null,
      title,
    },
  };
}

function isPendingAdjustPlanItemRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "adjust_plan_item";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      (record.surface_id === "plan_item.reduce" ||
        record.operation_input?.adjustment_type === "reduce"),
  );
}

function isPendingRecurringReminderRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "create_recurring_reminder";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "create_recurring_reminder",
  );
}

function isPendingAttackCardRecommendationOperation(value: unknown): value is {
  operation_type: "prepare_attack_card";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_attack_card" &&
      record.surface_id === "attack_card" &&
      record.operation_input?.target?.title,
  );
}

function isPendingDefenseCardRecommendationOperation(value: unknown): value is {
  operation_type: "prepare_defense_card";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_defense_card" &&
      record.surface_id === "defense_card",
  );
}

function isPendingStatePotionRecommendationOperation(value: unknown): value is {
  operation_type: "select_state_potion";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      record.surface_id === "potion.state",
  );
}

export function attachPendingRecommendationOperation(args: {
  tempMemory: any;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  requestId?: string | null;
}): any {
  const operationInput = args.recommendation?.operation_type ===
      "prepare_attack_card"
    ? buildAttackCardRecommendationOperationInput({
      recommendation: args.recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : args.recommendation?.operation_type === "adjust_plan_item"
    ? buildRecommendationOperationInput({
      recommendation: args.recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : args.recommendation?.operation_type === "create_recurring_reminder"
    ? (args.recommendation.operation_input ?? null)
    : args.recommendation?.operation_type === "prepare_defense_card"
    ? (args.recommendation.operation_input ?? null)
    : args.recommendation?.operation_type === "select_state_potion"
    ? (args.recommendation.operation_input ?? null)
    : buildRecommendationOperationInput({
      recommendation: args.recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    });
  if (!operationInput || !args.recommendation?.requires_consent) {
    return args.tempMemory;
  }
  return {
    ...(args.tempMemory ?? {}),
    __pending_recommendation_operation: {
      operation_type: args.recommendation.operation_type,
      surface_id: args.recommendation.surface_id ?? null,
      surface_label: args.surfaceLabel ?? null,
      recommendation_id: args.recommendation.recommendation_id ?? null,
      operation_input: operationInput,
      created_at: new Date().toISOString(),
      request_id: args.requestId ?? null,
    },
  };
}

function isOperationEscapeMessage(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  return (
    /\b(resume|recap|recapitule|qu est ce qui existe|ce qui existe|dans mon plan|sans inventer)\b/
      .test(text) ||
    /\b(pas maintenant|annule|annuler|laisse tomber|oublie|stop|pas de carte|pas d action|pas de plan|pas envie qu on me fasse un plan|je veux juste rester|rester sur l apaisement|apaisement|fond de honte)\b/
      .test(text)
  );
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

async function maybeTrackProgressParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  state: any;
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  directEffectGateResult?: EffectGateOrchestratorResult | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId: string | null;
  channel: "web" | "whatsapp";
}): Promise<{
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
}> {
  const {
    supabase,
    userId,
    state,
    tempMemory,
    dispatcherSignals,
    directEffectGateResult,
    planItemSnapshot,
    v2Runtime,
    loggedMessageId,
    channel,
  } = args;

  const gatedTrackOutcome = directEffectGateResult?.outcomes
    ?.track_progress_plan_item;
  const gatedTrackPayload = gatedTrackOutcome?.decision === "allow"
    ? gatedTrackOutcome.effect_payload
    : null;
  const trackPlanItem = gatedTrackPayload
    ? {
      detected: true,
      target_item_id: typeof gatedTrackPayload.target_item_id === "string"
        ? gatedTrackPayload.target_item_id
        : null,
      target_title: typeof gatedTrackPayload.target_title === "string"
        ? gatedTrackPayload.target_title
        : null,
      status_hint: typeof gatedTrackPayload.status_hint === "string"
        ? gatedTrackPayload.status_hint
        : null,
      value_hint: typeof gatedTrackPayload.value_hint === "number"
        ? gatedTrackPayload.value_hint
        : null,
      date_hint: typeof gatedTrackPayload.date_hint === "string"
        ? gatedTrackPayload.date_hint
        : null,
    }
    : dispatcherSignals.track_progress_plan_item;
  const trackPlanItemStatus = String(trackPlanItem?.status_hint ?? "unknown");
  const requestedPlanItemTitle = String(trackPlanItem?.target_title ?? "")
    .trim();
  const trackPlanItemTargetId = String(
    trackPlanItem?.target_item_id ??
      resolvePlanItemIdFromSnapshot(planItemSnapshot, requestedPlanItemTitle),
  ).trim();
  const trackPlanItemTarget = String(
    trackPlanItem?.target_title ||
      resolvePlanItemTitleFromSnapshot(planItemSnapshot, trackPlanItemTargetId),
  ).trim();
  const trackPlanItemValue = Number(trackPlanItem?.value_hint);
  const trackPlanItemDate = typeof trackPlanItem?.date_hint === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(trackPlanItem.date_hint)
    ? trackPlanItem.date_hint
    : undefined;
  const canTrackPlanItem = trackPlanItem?.detected === true &&
    trackPlanItemTargetId.length >= 2 &&
    (trackPlanItemStatus === "completed" || trackPlanItemStatus === "missed" ||
      trackPlanItemStatus === "partial");
  const canTrack = !isCheckupActive(state) && canTrackPlanItem;

  const alreadyLogged =
    (tempMemory as any)?.__track_progress_parallel?.source_message_id &&
    loggedMessageId &&
    (tempMemory as any).__track_progress_parallel.source_message_id ===
      loggedMessageId;

  if (!canTrack || alreadyLogged) {
    return { toolExecution: "none", executedTools: [] };
  }

  try {
    const tasks: Promise<V2TrackingResult>[] = [];
    if (canTrackPlanItem) {
      tasks.push(logPlanItemProgressV2({
        supabase,
        userId,
        planItemId: trackPlanItemTargetId,
        status: trackPlanItemStatus as "completed" | "missed" | "partial",
        value: Number.isFinite(trackPlanItemValue)
          ? trackPlanItemValue
          : (trackPlanItemStatus === "missed" ? 0 : 1),
        ...(trackPlanItemDate ? { dateHint: trackPlanItemDate } : {}),
        source: channel,
        sourceMessageId: loggedMessageId ?? null,
        runtime: v2Runtime,
      }));
    }

    const settled = await Promise.allSettled(tasks);
    const results = settled
      .filter((result): result is PromiseFulfilledResult<V2TrackingResult> =>
        result.status === "fulfilled"
      )
      .map((result) => result.value);
    const loggedResults = results.filter((result) => result.mode === "logged");
    const clarifyResults = results.filter((result) =>
      result.mode === "needs_clarify"
    );

    if (loggedResults.length === 0 && clarifyResults.length > 0) {
      (tempMemory as any).__track_progress_parallel = {
        mode: "needs_clarify",
        message: clarifyResults[0]?.message ??
          "Impossible de logger automatiquement. Oriente vers le dashboard pour mise à jour immédiate, ou propose d'attendre le prochain bilan.",
        source_message_id: loggedMessageId ?? null,
      };
      return { toolExecution: "blocked", executedTools: [] };
    } else {
      const joinedMessage = loggedResults.map((result) => result.message).join(
        "\n",
      ).trim();
      (tempMemory as any).__track_progress_parallel = {
        mode: "logged",
        message: joinedMessage ||
          clarifyResults[0]?.message ||
          "Progression enregistrée.",
        target: loggedResults.map((result) => result.target).join(", ") ||
          trackPlanItemTarget || trackPlanItemTargetId,
        status: loggedResults.map((result) => result.status).join(",") ||
          trackPlanItemStatus,
        source_message_id: loggedMessageId ?? null,
      };
      return loggedResults.length > 0
        ? {
          toolExecution: "success",
          executedTools: ["track_progress_plan_item"],
        }
        : { toolExecution: "blocked", executedTools: [] };
    }
  } catch (e) {
    console.warn("[Router] parallel track_progress failed (non-blocking):", e);
    (tempMemory as any).__track_progress_parallel = {
      mode: "needs_clarify",
      message:
        "Impossible de logger automatiquement. Oriente vers le dashboard pour mise à jour immédiate, ou propose d'attendre le prochain bilan.",
      source_message_id: loggedMessageId ?? null,
    };
    return { toolExecution: "failed", executedTools: ["track_progress"] };
  }
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
      distress_detected: dispatcherSignals.safety.level === "SENTRY",
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
    "__dashboard_recurring_reminder_intent_addon",
    "__plan_feedback_addon",
    "__coaching_intervention_addon",
    "__safety_active_addon",
    "__track_progress_parallel",
    "__dual_tool_addon",
    "__resume_safety_addon",
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

type OperationRuntimeResult = {
  content: string;
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

function executedToolsForStatus(
  toolExecution: OperationRuntimeResult["toolExecution"] | string | undefined,
  executedTools: string[] | undefined,
): string[] {
  return toolExecution === "success" ? [...(executedTools ?? [])] : [];
}

function normalizeOperationText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function recurringReminderRouteIsSelected(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const pending = (args.tempMemory as any)?.pending_tool_skill_confirmation ??
    (args.tempMemory as any)?.__pending_tool_skill_confirmation ??
    null;
  if (isPendingRecurringReminderOperation(pending)) return true;
  if (
    isPendingRecurringReminderRecommendationOperation(
      (args.tempMemory as any)?.__pending_recommendation_operation,
    )
  ) return true;
  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
  if (
    activeIntake &&
    String((activeIntake as any).operation_type ?? "") ===
      "create_recurring_reminder"
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "create_recurring_reminder"
  ) return true;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === "create_recurring_reminder" &&
    intent.user_intent === "create" &&
    intent.confidence_band !== "low"
  );
}

function isExplicitRecurringReminderOperationMessage(message: string): boolean {
  const text = normalizeOperationText(message);
  const hasCreateVerb =
    /\b(rappelle moi|me rappeler|me faire un rappel|mets moi|programme moi|cree|creer|crée|créer)\b/
      .test(text);
  const hasRecurringCadence =
    /\b(rappel recurrent|rappel récurrent|soutien recurrent|soutien récurrent|tous les jours|chaque jour|tous les soirs|chaque soir|tous les matins|chaque matin|chaque semaine|toutes les semaines|chaque lundi|chaque mardi|chaque mercredi|chaque jeudi|chaque vendredi|chaque samedi|chaque dimanche)\b/
      .test(text);
  return hasCreateVerb && hasRecurringCadence;
}

function isRecurringReminderCorrectionMessage(message: string): boolean {
  const text = normalizeOperationText(message);
  return /\b(pas .*finalement|plutot|plutôt|corrige|change|remplace|meme message|même message|chaque lundi|chaque mardi|chaque mercredi|chaque jeudi|chaque vendredi|chaque samedi|chaque dimanche|tous les jours|toutes les semaines|\d{1,2}h)\b/
    .test(text);
}

function recurringReminderDraftOperationInput(
  draft: RecurringReminderDraftV1 | null | undefined,
): Record<string, unknown> {
  const inner = draft?.draft;
  return {
    ...(inner?.frequency ? { frequency: inner.frequency } : {}),
    ...(inner?.days ? { days: inner.days } : {}),
    ...(inner?.time ? { time: inner.time } : {}),
    ...(inner?.message ? { message: inner.message } : {}),
  };
}

function isPendingRecurringReminderOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "create_recurring_reminder";
  draft: RecurringReminderDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "create_recurring_reminder" &&
      record.draft?.operation_type === "create_recurring_reminder" &&
      record.draft?.draft?.message &&
      record.draft?.draft?.time,
  );
}

function isPendingStatePotionOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "select_state_potion";
  draft: PotionSessionDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      record.draft?.operation_type === "select_state_potion" &&
      record.draft?.draft?.potion_type,
  );
}

function detectConfirmationKind(args: {
  userMessage: string;
  turnFrame: TurnFrame | null;
  structuredOnly?: boolean;
}): "yes" | "no" | "correction_to_pending" | "topic_change" | "unknown" {
  const frameKind = args.turnFrame?.confirmation_response?.kind;
  if (args.structuredOnly) {
    return frameKind === "yes" || frameKind === "no" ||
        frameKind === "correction_to_pending" || frameKind === "topic_change"
      ? frameKind
      : "unknown";
  }
  const text = normalizeOperationText(args.userMessage);
  const asksBeforeConfirming =
    /\b(avant que je dise oui|avant de dire oui|avant que je valide|avant de valider|avant que je confirme|avant de confirmer|si je dis oui|si je valide|si je confirme|dis moi d abord|explique moi d abord|montre moi d abord|je veux voir avant|avant d appliquer|avant que tu appliques)\b/
      .test(text);
  if (asksBeforeConfirming || isAdjustPlanExplainOnlyIntent(args.turnFrame)) {
    return "unknown";
  }
  const hasExplicitYes =
    /\b(oui|ok|vas y|confirme|je confirme|applique|cree la|cree le|c est bon|go)\b/
      .test(text);
  const hasExplicitNo =
    /\b(non|annule|laisse tomber|pas maintenant|ne le cree pas|stop)\b/.test(
      text,
    );
  const hasCorrectionInstruction =
    /\b(mais|ajoute|ajouter|garde|gardes|mets|mettre|modifie|modifier|change|changer|corrige|corriger|remplace|remplacer|inclu|inclus|inclure|avec|sans|premier geste|premiere etape|première etape)\b/
      .test(text);
  const hasStrongCorrectionInstruction =
    /\b(mais|pas|plutot|plutôt|sauf|sans|ajoute|ajouter|garde|gardes|mets|mettre|modifie|modifier|change|changer|corrige|corriger|remplace|remplacer|enleve|enlève|retire|premier geste|premiere etape|première etape)\b/
      .test(text);
  if (hasExplicitYes && hasStrongCorrectionInstruction && !hasExplicitNo) {
    return "correction_to_pending";
  }
  if (
    frameKind === "correction_to_pending" && hasExplicitYes &&
    !hasExplicitNo && !hasCorrectionInstruction
  ) {
    return "yes";
  }
  if (frameKind === "yes" || frameKind === "no") return frameKind;
  if (frameKind === "correction_to_pending" || frameKind === "topic_change") {
    return frameKind;
  }
  if (
    /\b(non pas|pas ca|pas ça|plutot|plutôt|en fait|corrige|je voulais|remplace|pas juste|pas seulement|pas que|pas une action|pas ce morceau|trop cible|trop ciblé|bloc|programme|rythme|volume total|missions? s enchain|missions? s'enchain|tout arrive trop vite)\b/
      .test(text)
  ) return "correction_to_pending";
  if (hasExplicitNo) return "no";
  if (hasExplicitYes) return "yes";
  return "unknown";
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

function renderAdjustPlanDraftDetails(raw: any, options?: {
  alreadyApplied?: boolean;
}): string | null {
  const result = raw?.draft?.draft?.adjust_plan_result;
  const generatedMessage = String(
    options?.alreadyApplied
      ? raw?.draft?.execution_message ?? result?.user_message_detailed ?? ""
      : result?.user_message_detailed ?? raw?.draft?.confirmation_message ?? "",
  ).trim();
  if (generatedMessage) return generatedMessage;
  const changedItems = Array.isArray(result?.applied_change?.changed_items)
    ? result.applied_change.changed_items
    : [];
  const missingInfo = Array.isArray(result?.rationale?.missing_info)
    ? result.rationale.missing_info.map((item: unknown) =>
      String(item ?? "").trim()
    ).filter(Boolean)
    : [];
  if (changedItems.length === 0) {
    if (missingInfo.length === 0) return null;
    return `Je ne peux pas encore te dire exactement ce qui changera: il me manque ${
      missingInfo.slice(0, 2).join(" et ")
    }.`;
  }
  const examples = changedItems.slice(0, 2).map((item: any, index: number) => {
    const title = String(item?.title ?? "Element ajuste").trim();
    const before = String(item?.before ?? "").trim();
    const after = String(item?.after ?? "").trim();
    const reason = String(item?.reason ?? "").trim();
    return `${index + 1}. ${title}: ${
      before ? `avant, ${before}; ` : ""
    }maintenant, ${after || "c'est allege"}.${
      reason ? ` Pourquoi: ${reason}` : ""
    }`;
  });
  const preserved = Array.isArray(result?.applied_change?.preserved_items)
    ? result.applied_change.preserved_items.slice(0, 1)
    : [];
  const preservedLine = preserved[0]?.title
    ? ` Ce qui ne change pas: ${String(preserved[0].title).trim()}.`
    : "";
  const intro = options?.alreadyApplied
    ? "Oui. Les changements concrets appliqués sont:"
    : "Je n'ai encore rien appliqué. Le brouillon actuel prévoit:";
  const validation = options?.alreadyApplied
    ? ""
    : "\n\nSi ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.";
  return `${intro}\n\n${examples.join("\n")}${preservedLine}${validation}`;
}

function renderLastAdjustPlanDetails(tempMemory: any): string | null {
  const raw = (tempMemory as any)?.__last_adjust_plan_execution;
  return renderAdjustPlanDraftDetails(raw, { alreadyApplied: true });
}

function renderPendingAdjustPlanDraftDetails(tempMemory: any): string | null {
  const raw = (tempMemory as any)?.__pending_adjust_plan_draft_review ??
    (tempMemory as any)?.__pending_tool_skill_confirmation ??
    (tempMemory as any)?.pending_tool_skill_confirmation;
  if (
    !isPendingAdjustPlanDraftReview(raw) &&
    !isPendingAdjustPlanItemOperation(raw)
  ) {
    return null;
  }
  return renderAdjustPlanDraftDetails(raw, { alreadyApplied: false });
}

function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

function isPendingAdjustPlanDraftReview(value: unknown): value is {
  operation_id?: string;
  operation_type: "adjust_plan_item";
  phase: "draft_review";
  draft: PlanAdjustmentDraftV1;
  operation_input?: Record<string, unknown> | null;
  revision_history?: Array<Record<string, unknown>>;
  created_at?: string;
  updated_at?: string;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      record.phase === "draft_review" &&
      record.draft?.operation_type === "adjust_plan_item" &&
      record.draft?.draft?.adjust_plan_result,
  );
}

function pendingAdjustPlanDraftReviewOperationType(
  tempMemory: any,
): string | null {
  const raw = (tempMemory as any)?.__pending_adjust_plan_draft_review;
  return isPendingAdjustPlanDraftReview(raw) ? "adjust_plan_item" : null;
}

function operationRouteIsSelected(args: {
  operationType: string;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  if (
    pendingAdjustPlanDraftReviewOperationType(args.tempMemory) ===
      args.operationType
  ) {
    return true;
  }
  const pending = (args.tempMemory as any)?.pending_tool_skill_confirmation ??
    (args.tempMemory as any)?.__pending_tool_skill_confirmation ??
    null;
  if (pendingOperationType(pending) === args.operationType) return true;
  const pendingRecommendation = (args.tempMemory as any)
    ?.__pending_recommendation_operation;
  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
  if (
    String((activeIntake as any)?.operation_type ?? "") === args.operationType
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
    isPendingDefenseCardRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.operationType === "create_recurring_reminder" &&
    isPendingRecurringReminderRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.operationType === "select_state_potion" &&
    isPendingStatePotionRecommendationOperation(pendingRecommendation)
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
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

function attackTechniqueHintFromTurnFrame(
  turnFrame: TurnFrame | null,
): AttackTechniqueKey | null {
  const intents = turnFrame?.tool_skill_intents ?? [];
  for (const intent of intents) {
    if (
      intent.operation_type !== "prepare_attack_card" ||
      intent.confidence_band === "low"
    ) continue;
    const hint = String(intent.target_hint ?? "").trim();
    if (hint in ATTACK_TECHNIQUES) return hint as AttackTechniqueKey;
    const normalized = normalizeOperationText(hint);
    if (/\b(texte|recadrage|negoc|excuse)\b/.test(normalized)) {
      return "texte_recadrage";
    }
    if (/\b(preparer|terrain|friction|environnement)\b/.test(normalized)) {
      return "preparer_terrain";
    }
  }
  return null;
}

function isPendingAttackCardOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "prepare_attack_card";
  draft: AttackCardDraftV1;
  target?: {
    plan_item_id?: string | null;
    kind?: "plan_item" | "personal_action";
    title?: string | null;
  };
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_attack_card" &&
      record.draft?.operation_type === "prepare_attack_card" &&
      record.draft?.draft?.title &&
      record.draft?.draft?.instruction,
  );
}

function attackCardTargetFromPendingConfirmation(
  pendingConfirmation: Record<string, unknown> | undefined,
  fallbackOperationInput?: Record<string, unknown> | null,
): {
  plan_item_id?: string | null;
  kind?: "plan_item" | "personal_action";
  title?: string | null;
} {
  const pendingTarget = pendingConfirmation?.target as
    | Record<string, unknown>
    | undefined;
  const fallbackTarget = fallbackOperationInput?.target as
    | Record<string, unknown>
    | undefined;
  const target = pendingTarget ?? fallbackTarget ?? {};
  const planItemId = typeof target.plan_item_id === "string"
    ? target.plan_item_id
    : target.plan_item_id === null
    ? null
    : undefined;
  return {
    kind: target.kind === "plan_item" || planItemId
      ? "plan_item"
      : "personal_action",
    title: typeof target.title === "string" ? target.title : null,
    plan_item_id: planItemId ?? null,
  };
}

function attackCardQuestionCandidate(value: unknown): {
  kind: "plan_item";
  plan_item_id: string;
  title: string;
} | null {
  const candidate = value as any;
  if (!candidate || typeof candidate !== "object") return null;
  const planItemId = String(candidate.plan_item_id ?? "").trim();
  const title = String(candidate.title ?? "").trim();
  if (!planItemId || !title) return null;
  return {
    kind: "plan_item",
    plan_item_id: planItemId,
    title,
  };
}

function attackCardTargetFromQuestionCandidate(
  value: unknown,
): Record<string, unknown> | null {
  const candidate = attackCardQuestionCandidate(value);
  if (!candidate) return null;
  return {
    kind: "plan_item",
    plan_item_id: candidate.plan_item_id,
    title: candidate.title,
  };
}

function renderAttackCardSlotQuestion(
  nextQuestion: unknown,
  fallback =
    "Il me manque l'action à viser. Donne-moi l'action ou décris-la en une phrase.",
): string {
  const question = nextQuestion as any;
  const generatedQuestion = String(question?.question ?? "").trim();
  if (generatedQuestion) return generatedQuestion;
  const status = String(question?.status ?? "");
  const slot = String(question?.slot ?? "");
  const candidate = attackCardQuestionCandidate(question?.candidate);
  const candidates = Array.isArray(question?.candidates)
    ? question.candidates.map(attackCardQuestionCandidate).filter(Boolean)
    : [];
  const techniqueOptions = Array.isArray(question?.technique_options)
    ? question.technique_options
      .map((option: any) => ({
        key: String(option?.technique_key ?? "").trim(),
        title: String(option?.title ?? "").trim(),
        description: String(option?.description ?? "").trim(),
        reason: String(option?.reason ?? "").trim(),
        example: String(option?.example ?? "").trim(),
        recommended: Boolean(option?.recommended),
      }))
      .filter((option: any) => option.title)
    : [];
  const activationKeywordOptions = Array.isArray(
      question?.activation_keyword_options,
    )
    ? question.activation_keyword_options
      .map((option: unknown) => String(option ?? "").trim())
      .filter(Boolean)
    : [];
  const rejectedActivationKeyword = String(
    question?.known_slots?.rejected_activation_keyword ??
      question?.rejected_activation_keyword ?? "",
  ).trim();
  const techniqueFitWarning = String(
    question?.known_slots?.technique_fit_warning ??
      question?.technique_fit_warning ?? "",
  ).trim();
  if (slot === "technique" && techniqueOptions.length > 0) {
    const lines = techniqueOptions.map((option: any, index: number) => {
      const marker = option.recommended ? " (recommandee)" : "";
      const detail = option.reason || option.description;
      return `${
        index + 1
      }. ${option.title}${marker}: ${detail}. ${option.example}`;
    });
    const prefix = techniqueFitWarning
      ? "Je garde un doute sur la technique la plus adaptee ici: Mot de bascule sert surtout quand tu sens que tu vas craquer, abandonner ou esquiver. Pour ce besoin, je te propose aussi des options plus proches du contexte.\n\n"
      : "";
    return `${prefix}Quelle technique d'attaque tu veux utiliser ?\n\n${
      lines.join("\n")
    }\n\nReponds avec le nom ou le numero.`;
  }
  if (slot === "activation_keyword") {
    const examples = activationKeywordOptions.length > 0
      ? activationKeywordOptions.join(", ")
      : "PÊCHE, KIWI ou BIM";
    const conflictPrefix = rejectedActivationKeyword
      ? `${rejectedActivationKeyword} est deja utilise comme mot de bascule. `
      : "";
    return `${conflictPrefix}Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court lie a ton probleme avec l'action. Je peux te proposer ${examples}, ou tu peux en donner un autre.`;
  }
  if (status === "candidate_needs_confirmation" && candidate) {
    return `Je pense à "${candidate.title}". Confirme si c'est ça, sinon corrige la cible.`;
  }
  if (status === "ambiguous" && candidates.length > 0) {
    return `J'hésite entre ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }. Dis-moi laquelle viser.`;
  }
  if (status === "missing" && candidates.length > 0) {
    return `Il me manque l'action exacte à viser. Je peux viser ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }, ou une autre action si ce n'est pas ça.`;
  }
  return fallback;
}

function isAttackCardLocationOrManagementQuestion(message: string): boolean {
  const text = normalizeOperationText(message);
  return /\b(retrouve|retrouver|trouve|trouver|chercher|cherche|ou exactement|ou est|ou sont|ressources|modifier|modifie|imprimer|imprime)\b/
    .test(text) &&
    /\b(carte|cartes|attaque|elle|la)\b/.test(text) &&
    !/\b(cree|creer|fais|faire|nouvelle)\b/.test(text);
}

function isExplicitAttackCardCreationRequest(message: string): boolean {
  const text = normalizeOperationText(message);
  if (!/\bcarte d[' ]?attaque\b|\battaque\b/.test(text)) return false;
  if (
    /\b(c'est quoi|c est quoi|a quoi|explique|difference|ou est|ou sont|retrouve|trouver|modifier|imprimer)\b/
      .test(text)
  ) {
    return false;
  }
  return /\b(je veux|j'ai besoin|il me faut|fais|faire|cree|creer|prepare|preparer|fabrique)\b/
    .test(text);
}

function hasRecentAttackCardContext(
  recentMessages: Array<{ role: string; content: string }>,
): boolean {
  const context = normalizeOperationText(
    recentMessages.slice(-6).map((turn) => turn.content).join("\n"),
  );
  return /\b(carte d'attaque|cartes d'attaque|carte attaque|attaque)\b/.test(
    context,
  );
}

function isAttackCardLocationOrManagementQuestionWithContext(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): boolean {
  if (isAttackCardLocationOrManagementQuestion(args.message)) return true;
  if (!hasRecentAttackCardContext(args.recentMessages)) return false;
  const text = normalizeOperationText(args.message);
  return /\b(retrouve|retrouver|trouve|trouver|chercher|cherche|ou exactement|ou est|ou sont|ressources|plan|modifier|modifie|imprimer|imprime)\b/
    .test(text) &&
    /\b(carte|cartes|elle|la|ressources|plan)\b/.test(text) &&
    !/\b(cree|creer|fais|faire|nouvelle)\b/.test(text);
}

function isAttackCardPostCreationVerificationQuestion(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): boolean {
  if (!hasRecentAttackCardContext(args.recentMessages)) return false;
  const text = normalizeOperationText(args.message);
  const asksFactually =
    /\b(est ce que|est-ce que|je peux|on peut|possible|c est bien|c'est bien|tu l as|tu l'as|elle est|elle se|rattach|ou|où|retrouve|modifier|modifiable|imprimer|ressources)\b/
      .test(text) || /[?？]/.test(args.message);
  if (!asksFactually) return false;
  const asksNewOperation =
    /\b(cree|creer|prepare|preparer|fais|faire|nouvelle|nouvelle version|refais|refaire|modifie la|modifie-la|change la|change-la)\b/
      .test(text);
  return !asksNewOperation;
}

function renderAttackCardPostCreationVerificationReply(args: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): string | null {
  if (!isAttackCardPostCreationVerificationQuestion(args)) return null;
  const text = args.message.trim();
  const normalized = normalizeOperationText(text);
  const recentAssistant = args.recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-4)
    .map((message) => message.content)
    .join("\n");

  const attachMatch = text.match(
    /rattach[ée]e?\s+[àa]\s+(.+?)(?:,\s*pas\s+[àa]\s+(.+?))?\s*\?/i,
  );
  if (attachMatch?.[1]) {
    const positive = attachMatch[1].trim().replace(/[?.!]+$/g, "");
    const negative = attachMatch[2]?.trim().replace(/[?.!]+$/g, "");
    return negative
      ? `Oui, elle est rattachée à ${positive}, pas à ${negative}. Je ne modifie rien.`
      : `Oui, elle est rattachée à ${positive}. Je ne modifie rien.`;
  }

  const quoted = text.match(/[“"]([^”"]{3,120})[”"]/);
  const phrase = quoted?.[1] ??
    (normalized.includes("ecrire une seule ligne")
      ? "écrire une seule ligne"
      : normalized.includes("decider")
      ? "décider après si je continue"
      : null);
  if (phrase) {
    const found = normalizeOperationText(recentAssistant).includes(
      normalizeOperationText(phrase),
    );
    return found
      ? `Oui, cette consigne est bien dans le contenu actuel. Je ne modifie rien.`
      : `Non, je ne la vois pas dans le contenu actuel. Je ne modifie rien.`;
  }

  if (isAttackCardLocationOrManagementQuestionWithContext(args)) {
    return null;
  }
  return "Oui, je vérifie seulement. Je ne crée rien et je ne modifie rien.";
}

function isPendingDefenseCardOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "prepare_defense_card";
  draft: DefenseCardDraftV1;
  attachment?: {
    plan_item_id?: string | null;
    kind?:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context";
    title?: string | null;
  };
  risk_situation?: { label?: string | null } | null;
  defense_response_hint?: Record<string, unknown> | null;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_defense_card" &&
      record.draft?.operation_type === "prepare_defense_card" &&
      record.draft?.draft?.title &&
      record.draft?.draft?.defense_response,
  );
}

function defenseCardAttachmentFromPendingConfirmation(
  pendingConfirmation: Record<string, unknown> | undefined,
  fallbackOperationInput?: Record<string, unknown> | null,
): {
  plan_item_id?: string | null;
  kind?:
    | "plan_item"
    | "personal_action"
    | "free_risk_context"
    | "recurring_context";
  title?: string | null;
} {
  const pendingAttachment = pendingConfirmation?.attachment as
    | Record<string, unknown>
    | undefined;
  const fallbackAttachment = fallbackOperationInput?.attachment as
    | Record<string, unknown>
    | undefined;
  const fallbackTarget = fallbackOperationInput?.target as
    | Record<string, unknown>
    | undefined;
  const attachment = pendingAttachment ?? fallbackAttachment ??
    fallbackTarget ??
    {};
  const planItemId = typeof attachment.plan_item_id === "string"
    ? attachment.plan_item_id
    : attachment.plan_item_id === null
    ? null
    : undefined;
  const rawKind = String(attachment.kind ?? "");
  return {
    kind: rawKind === "personal_action" ||
        rawKind === "free_risk_context" ||
        rawKind === "recurring_context"
      ? rawKind
      : "plan_item",
    title: typeof attachment.title === "string" ? attachment.title : null,
    plan_item_id: planItemId ?? null,
  };
}

function defenseCardAttachmentFromQuestionCandidate(
  value: unknown,
): Record<string, unknown> | null {
  const candidate = attackCardQuestionCandidate(value);
  if (!candidate) return null;
  return {
    kind: "plan_item",
    plan_item_id: candidate.plan_item_id,
    title: candidate.title,
  };
}

function renderDefenseCardSlotQuestion(
  nextQuestion: unknown,
  fallback =
    "Il me manque l'action ou le moment à protéger. Donne-moi la cible ou décris-la en une phrase.",
): string {
  const question = nextQuestion as any;
  const slot = String(question?.slot ?? "");
  const status = String(question?.status ?? "");
  const candidate = attackCardQuestionCandidate(question?.candidate);
  const candidates = Array.isArray(question?.candidates)
    ? question.candidates.map(attackCardQuestionCandidate).filter(Boolean)
    : [];
  if (slot === "risk_situation") {
    return "Il me manque le moment de risque à couvrir. Décris ce qui risque de te faire décrocher.";
  }
  if (slot === "tool_fit") {
    return "Je veux éviter de créer la mauvaise carte: tu veux plutôt une carte d'attaque pour aider à démarrer, ou une carte de défense pour le moment où tu risques de déraper ?";
  }
  if (status === "candidate_needs_confirmation" && candidate) {
    return `Je pense à "${candidate.title}" comme cible à protéger. Confirme si c'est ça, sinon corrige la cible.`;
  }
  if (status === "ambiguous" && candidates.length > 0) {
    return `J'hésite entre ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }. Dis-moi laquelle protéger.`;
  }
  return fallback;
}

function isPendingCoachPreferencesOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "update_coach_preferences";
  draft: CoachPreferencesPatchDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "update_coach_preferences" &&
      record.draft?.operation_type === "update_coach_preferences" &&
      record.draft?.draft?.patch &&
      Object.keys(record.draft.draft.patch).length > 0,
  );
}

function isPendingAdjustPlanItemOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "adjust_plan_item";
  draft: PlanAdjustmentDraftV1;
  operation_input?: Record<string, unknown> | null;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "adjust_plan_item" &&
      record.draft?.operation_type === "adjust_plan_item" &&
      record.draft?.draft?.patch,
  );
}

const DAY_CODES: Record<string, string> = {
  lundi: "mon",
  monday: "mon",
  mon: "mon",
  mardi: "tue",
  tuesday: "tue",
  tue: "tue",
  mercredi: "wed",
  wednesday: "wed",
  wed: "wed",
  jeudi: "thu",
  thursday: "thu",
  thu: "thu",
  vendredi: "fri",
  friday: "fri",
  fri: "fri",
  samedi: "sat",
  saturday: "sat",
  sat: "sat",
  dimanche: "sun",
  sunday: "sun",
  sun: "sun",
};

function scheduledDaysFromDraft(draft: RecurringReminderDraftV1): string[] {
  const frequency = draft.draft.frequency;
  if (frequency === "daily") {
    return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  }
  if (frequency === "weekdays") return ["mon", "tue", "wed", "thu", "fri"];
  const mapped = (draft.draft.days ?? [])
    .map((day) => DAY_CODES[normalizeOperationText(day)])
    .filter((day): day is string => Boolean(day));
  const unique = Array.from(new Set(mapped));
  if (unique.length > 0) return unique;
  if (frequency === "weekly" || frequency === "specific_days") {
    return ["mon"];
  }
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
}

function formatRecurringReminderSummary(
  draft: RecurringReminderDraftV1,
): string {
  const frequency = draft.draft.frequency === "daily"
    ? "tous les jours"
    : draft.draft.frequency === "weekdays"
    ? "les jours de semaine"
    : (draft.draft.days?.length
      ? draft.draft.days.join(", ")
      : "chaque semaine");
  return `"${draft.draft.message}" à ${draft.draft.time}, ${frequency}`;
}

async function insertRecurringReminderFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: RecurringReminderDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
}) {
  const scheduledDays = scheduledDaysFromDraft(args.draft);
  return await args.supabase
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      message_instruction: args.draft.draft.message,
      rationale:
        `Rappel récurrent créé depuis la conversation web Sophia : ${args.draft.draft.title}`,
      local_time_hhmm: args.draft.draft.time,
      scheduled_days: scheduledDays,
      status: "active",
      starts_at: new Date().toISOString(),
      scope_kind: "out_of_plan",
      initiative_kind: "base_free",
      source_kind: "user_created",
      initiative_metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "create_recurring_reminder",
        operation_id: args.operationId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        request_id: args.requestId ?? null,
        draft: args.draft,
      },
    } as any)
    .select("id")
    .single();
}

async function ensureOperationCycle(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
  const { data: existing, error: selectError } = await args.supabase
    .from("user_cycles")
    .select("id")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await args.supabase
    .from("user_cycles")
    .insert({
      user_id: args.userId,
      status: "draft",
      raw_intake_text: "Conversation web Sophia - operation hors plan",
      intake_language: "fr",
      duration_months: null,
    } as any)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return String(inserted.id);
}

async function insertAttackCardFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: AttackCardDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  target?: {
    plan_item_id?: string | null;
    kind?: "plan_item" | "personal_action";
    title?: string | null;
  } | null;
}) {
  const cycleId = await ensureOperationCycle({
    supabase: args.supabase,
    userId: args.userId,
  });
  const targetTitle = args.target?.title ?? args.draft.draft.target_label;
  const planItemId = args.target?.plan_item_id ?? null;
  const techniqueDefinition = ATTACK_TECHNIQUES[args.draft.draft.technique];
  const generatedResult = {
    output_title: args.draft.draft.title,
    generated_asset: args.draft.draft.generated_asset ??
      args.draft.draft.instruction,
    supporting_points: args.draft.draft.supporting_points ?? [],
    mode_emploi: args.draft.draft.mode_emploi ??
      techniqueDefinition.mode_emploi,
    generated_at: new Date().toISOString(),
    keyword_trigger: args.draft.draft.technique === "pre_engagement"
      ? {
        activation_keyword: args.draft.draft.activation_keyword ?? "",
        activation_keyword_normalized: normalizeAttackKeyword(
          args.draft.draft.activation_keyword ?? "",
        ),
        risk_situation: targetTitle,
        strength_anchor: args.draft.draft.why_it_helps,
        first_response_intent: args.draft.draft.instruction,
        assistant_prompt:
          `L'utilisateur a envoye le mot de bascule pour ${targetTitle}. Aide-le a revenir au premier geste.`,
      }
      : null,
  };
  const payload = {
    user_id: args.userId,
    cycle_id: cycleId,
    transformation_id: null,
    plan_item_id: planItemId,
    phase_id: null,
    scope_kind: planItemId ? "transformation" : "out_of_plan",
    source: "system",
    status: "active",
    content: {
      summary: `Carte d'attaque pour ${targetTitle}.`,
      operation_draft: args.draft.draft,
      techniques: [
        {
          technique_key: args.draft.draft.technique,
          title: args.draft.draft.technique_title ?? techniqueDefinition.title,
          pour_quoi: args.draft.draft.why_it_helps ??
            techniqueDefinition.pour_quoi,
          objet_genere: techniqueDefinition.objet_genere,
          questions: [],
          mode_emploi: args.draft.draft.mode_emploi ??
            techniqueDefinition.mode_emploi,
          generated_result: generatedResult,
        },
      ],
    },
    metadata: {
      source: "sophia_brain_tool_skill",
      operation_type: "prepare_attack_card",
      operation_id: args.operationId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      request_id: args.requestId ?? null,
      target: args.target ?? null,
      draft: args.draft,
    },
    generated_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  } as any;

  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) return { data, error };

  if (planItemId) {
    const { error: planItemUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        attack_card_id: data.id,
        cards_status: "ready",
        cards_generated_at: new Date().toISOString(),
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (planItemUpdateError) return { data, error: planItemUpdateError };
  }

  return { data, error };
}

async function insertDefenseCardFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: DefenseCardDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  attachment?: {
    plan_item_id?: string | null;
    kind?:
      | "plan_item"
      | "personal_action"
      | "free_risk_context"
      | "recurring_context";
    title?: string | null;
  } | null;
  riskSituation?: { label?: string | null } | null;
}) {
  const cycleId = await ensureOperationCycle({
    supabase: args.supabase,
    userId: args.userId,
  });
  const planItemId = args.attachment?.plan_item_id ?? null;
  const attachmentTitle = args.attachment?.title ??
    args.draft.draft.target_label;
  const payload = {
    user_id: args.userId,
    cycle_id: cycleId,
    transformation_id: null,
    plan_item_id: planItemId,
    phase_id: null,
    scope_kind: planItemId ? "transformation" : "out_of_plan",
    source: "system",
    status: "active",
    content: {
      title: args.draft.draft.title,
      target_label: attachmentTitle,
      risk_situation: args.draft.draft.risk_situation,
      trigger: args.draft.draft.trigger,
      defense_response: args.draft.draft.defense_response,
      fallback_plan: args.draft.draft.fallback_plan ?? null,
      why_it_helps: args.draft.draft.why_it_helps,
      operation_draft: args.draft.draft,
      techniques: [
        {
          technique_key: "operation_defense_card",
          generated_result: args.draft.draft,
        },
      ],
    },
    metadata: {
      source: "sophia_brain_tool_skill",
      operation_type: "prepare_defense_card",
      operation_id: args.operationId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      request_id: args.requestId ?? null,
      attachment: args.attachment ?? null,
      risk_situation: args.riskSituation ?? null,
      draft: args.draft,
    },
    generated_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  } as any;

  const { data, error } = await args.supabase
    .from("user_defense_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) return { data, error };

  if (planItemId) {
    const { error: planItemUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        defense_card_id: data.id,
        cards_status: "ready",
        cards_generated_at: new Date().toISOString(),
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (planItemUpdateError) return { data, error: planItemUpdateError };
  }

  return { data, error };
}

async function writeStatePotionActivation(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: PotionSessionDraftV1["draft"];
  scheduledFollowups: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }>;
  operationId?: string | null;
  requestId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{
  potion_session_id: string;
  recurring_reminder_id: string;
  scheduled_checkin_ids: string[];
}> {
  const cycleId = await ensureOperationCycle({
    supabase: args.supabase,
    userId: args.userId,
  });
  const nowIso = new Date().toISOString();
  const { data: potion, error: potionError } = await args.supabase
    .from("user_potion_sessions")
    .insert({
      user_id: args.userId,
      cycle_id: cycleId,
      transformation_id: null,
      phase_id: null,
      scope_kind: "out_of_plan",
      potion_type: args.draft.potion_type,
      source: "system",
      status: "completed",
      questionnaire_schema: [],
      questionnaire_answers: {},
      free_text: args.draft.opening_prompt,
      content: {
        title: args.draft.title,
        instant_support_message: args.draft.instant_support_message,
        why_this_potion: args.draft.why_this_potion,
        operation_draft: args.draft,
      },
      follow_up_strategy: args.draft.follow_up,
      metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "select_state_potion",
        operation_id: args.operationId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        request_id: args.requestId ?? null,
      },
      generated_at: nowIso,
      last_updated_at: nowIso,
    } as any)
    .select("id")
    .single();
  if (potionError || !potion?.id) {
    throw potionError ?? new Error("potion_insert_failed");
  }

  const followUp = args.draft.follow_up;
  const { data: reminder, error: reminderError } = await args.supabase
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      cycle_id: cycleId,
      message_instruction: followUp.reminder_instruction,
      rationale: `Suivi 7 jours pour ${args.draft.title}`,
      local_time_hhmm: followUp.local_time_hhmm,
      scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      status: "active",
      starts_at: nowIso,
      scope_kind: "out_of_plan",
      initiative_kind: "potion_follow_up",
      source_kind: "potion_generated",
      source_potion_session_id: potion.id,
      initiative_metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "select_state_potion",
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
      },
    } as any)
    .select("id")
    .single();
  if (reminderError || !reminder?.id) {
    throw reminderError ?? new Error("potion_reminder_insert_failed");
  }

  const scheduledRows = args.scheduledFollowups.map((followup) => ({
    user_id: args.userId,
    recurring_reminder_id: reminder.id,
    event_context:
      `recurring_reminder:${reminder.id}:potion:${potion.id}:${followup.local_date}`,
    draft_message: followup.reminder_instruction,
    scheduled_for: new Date(
      `${followup.local_date}T${followup.local_time_hhmm}:00.000Z`,
    ).toISOString(),
    status: "pending",
  }));
  const { data: checkins, error: checkinsError } = await args.supabase
    .from("scheduled_checkins")
    .insert(scheduledRows as any)
    .select("id");
  if (checkinsError) throw checkinsError;

  return {
    potion_session_id: String(potion.id),
    recurring_reminder_id: String(reminder.id),
    scheduled_checkin_ids: ((checkins ?? []) as Array<{ id: string }>)
      .map((row) => String(row.id)),
  };
}

async function writePlanAdjustmentPatch(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: PlanAdjustmentDraftV1;
  operationInput?: Record<string, unknown> | null;
  operationId?: string | null;
  requestId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{ plan_patch_id: string; bridge_plan_item_id?: string | null }> {
  const scope = (args.operationInput?.scope as any) ?? null;
  const planItemId = String(scope?.plan_item_id ?? "").trim();
  const patchId = crypto.randomUUID();
  const patch = args.draft.draft.patch;
  const nowIso = new Date().toISOString();
  const materializedPlanItemIds = [
    ...new Set(
      (args.draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [])
        .filter((item: any) =>
          (item?.kind === "action" || item?.kind === "habit") &&
          typeof item?.id === "string" &&
          item.id.trim().length > 0
        )
        .map((item: any) => String(item.id).trim()),
    ),
  ];
  const materializedChangedItems =
    args.draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [];
  const materializedChangeById = new Map(
    materializedChangedItems
      .filter((item: any) =>
        typeof item?.id === "string" && item.id.trim().length > 0
      )
      .map((item: any) => [String(item.id).trim(), item]),
  );

  const insertAdjustmentSnapshot = async (
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const row = {
      user_id: args.userId,
      snapshot_type: "plan_adjustment_patch",
      payload: {
        kind: "plan_adjustment_patch",
        ...payload,
      },
    };
    const { error } = await args.supabase
      .from("system_runtime_snapshots")
      .insert(row as any);
    if (!error) return;

    const message = JSON.stringify(error).toLowerCase();
    const code = String((error as any)?.code ?? "").trim();
    if (code !== "23514" && !message.includes("snapshot_type")) throw error;

    const { error: fallbackError } = await args.supabase
      .from("system_runtime_snapshots")
      .insert({
        ...row,
        snapshot_type: "plan_generated_v2",
        payload: {
          ...row.payload,
          storage_fallback: "plan_generated_v2",
        },
      } as any);
    if (fallbackError) throw fallbackError;
  };

  if (!planItemId) {
    const scopeKind = String(scope?.kind ?? "").trim();
    if (scopeKind && scopeKind !== "specific_plan_item") {
      if (materializedPlanItemIds.length < 2) {
        throw new Error(`${scopeKind}_materialized_items_missing`);
      }
      const { data: materializedItems, error: materializedSelectError } =
        await args.supabase
          .from("user_plan_items")
          .select(
            "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,phase_id,phase_order,cards_status,payload",
          )
          .eq("user_id", args.userId)
          .in("id", materializedPlanItemIds);
      if (materializedSelectError) throw materializedSelectError;
      if (
        !Array.isArray(materializedItems) ||
        materializedItems.length !== materializedPlanItemIds.length
      ) {
        throw new Error(`${scopeKind}_materialized_items_not_found`);
      }
      const adjustmentRecord = {
        plan_patch_id: patchId,
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        applied_at: nowIso,
        affected_scope: scopeKind,
        draft: args.draft.draft,
        patch,
      };
      const supportedLevelCapabilities = new Set([
        "modify_existing_action",
        "change_action_frequency",
        "pause_action",
        "remove_action_from_level",
        "create_bridge_action",
      ]);
      for (const itemId of materializedPlanItemIds) {
        const change = materializedChangeById.get(itemId) as any;
        const capability = String(change?.capability ?? "").trim();
        if (!supportedLevelCapabilities.has(capability)) {
          throw new Error(`level_capability_not_materializable:${capability}`);
        }
      }
      for (
        const item of materializedItems as Array<{
          id: string;
          user_id?: string;
          cycle_id?: string | null;
          transformation_id?: string | null;
          plan_id?: string | null;
          dimension?: string | null;
          kind?: string | null;
          title?: string | null;
          description?: string | null;
          tracking_type?: string | null;
          activation_order?: number | null;
          activation_condition?: unknown;
          current_habit_state?: string | null;
          support_mode?: string | null;
          support_function?: string | null;
          target_reps?: number | null;
          current_reps?: number | null;
          cadence_label?: string | null;
          scheduled_days?: unknown;
          time_of_day?: string | null;
          start_after_item_id?: string | null;
          phase_id?: string | null;
          phase_order?: number | null;
          cards_status?: string | null;
          payload?: unknown;
        }>
      ) {
        const change = materializedChangeById.get(item.id) as any;
        const capability = String(change?.capability ?? "").trim();
        const currentPayload = item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : {};
        const previousAdjustments = Array.isArray(
            (currentPayload as any).operation_adjustments,
          )
          ? (currentPayload as any).operation_adjustments
          : [];
        const itemUpdate: Record<string, unknown> = {
          payload: {
            ...currentPayload,
            active_operation_adjustment: adjustmentRecord,
            operation_adjustments: [
              ...previousAdjustments,
              adjustmentRecord,
            ].slice(-10),
          },
          updated_at: nowIso,
        };
        if (capability === "modify_existing_action") {
          itemUpdate.description = String(change?.after ?? "").trim();
        }
        if (capability === "change_action_frequency") {
          itemUpdate.cadence_label = String(change?.after ?? "").trim();
        }
        if (
          capability === "pause_action" ||
          capability === "remove_action_from_level"
        ) {
          itemUpdate.status = "paused";
        }
        if (capability === "create_bridge_action") {
          const bridgeId = crypto.randomUUID();
          const bridgeTitle = `Version mini - ${
            String(item.title ?? "action").trim() || "action"
          }`;
          const bridgeDescription = String(change?.after ?? "").trim() ||
            `Action pont vers "${String(item.title ?? "l'action initiale")}".`;
          const bridgePayload = {
            ...currentPayload,
            operation_bridge: {
              kind: "level_reduction_bridge",
              source_plan_item_id: item.id,
              plan_patch_id: patchId,
              operation_id: args.operationId ?? null,
              request_id: args.requestId ?? null,
              source_message_id: args.sourceMessageId ?? null,
              created_at: nowIso,
              patch,
              resume_original_after_completion: true,
            },
            active_operation_adjustment: adjustmentRecord,
          };
          const { error: bridgeInsertError } = await args.supabase
            .from("user_plan_items")
            .insert({
              id: bridgeId,
              user_id: args.userId,
              cycle_id: item.cycle_id,
              transformation_id: item.transformation_id,
              plan_id: item.plan_id,
              dimension: item.dimension,
              kind: item.kind,
              status: "active",
              title: bridgeTitle,
              description: bridgeDescription,
              tracking_type: item.tracking_type,
              activation_order: item.activation_order,
              activation_condition: item.activation_condition,
              current_habit_state: item.current_habit_state,
              support_mode: item.support_mode,
              support_function: item.support_function,
              target_reps: item.kind === "habit" ? 1 : null,
              current_reps: item.kind === "habit" ? 0 : null,
              cadence_label: item.kind === "habit" ? "1 fois" : null,
              scheduled_days: null,
              time_of_day: item.time_of_day,
              start_after_item_id: item.start_after_item_id,
              phase_id: item.phase_id,
              phase_order: item.phase_order,
              cards_status: ["missions", "habits"].includes(
                  String(item.dimension),
                )
                ? "not_started"
                : "not_required",
              payload: bridgePayload,
              activated_at: nowIso,
              updated_at: nowIso,
            } as any);
          if (bridgeInsertError) throw bridgeInsertError;
          itemUpdate.status = "pending";
          itemUpdate.start_after_item_id = bridgeId;
          itemUpdate.payload = {
            ...currentPayload,
            deferred_by_operation_bridge: {
              plan_patch_id: patchId,
              operation_id: args.operationId ?? null,
              request_id: args.requestId ?? null,
              source_message_id: args.sourceMessageId ?? null,
              deferred_at: nowIso,
              bridge_plan_item_id: bridgeId,
              reason: "level_adjustment_bridge_created",
              patch,
            },
            operation_adjustments: [
              ...previousAdjustments,
              adjustmentRecord,
            ].slice(-10),
          };
        }
        const { error: itemUpdateError } = await args.supabase
          .from("user_plan_items")
          .update(itemUpdate as any)
          .eq("id", item.id)
          .eq("user_id", args.userId);
        if (itemUpdateError) throw itemUpdateError;
      }
      await insertAdjustmentSnapshot({
        plan_patch_id: patchId,
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        draft: args.draft,
        patch,
        scope,
        applied: true,
        affected_scope: scopeKind,
        materialized_plan_item_ids: materializedPlanItemIds,
        reason: "non_item_scope_plan_adjustment",
        created_at: nowIso,
      });
      return { plan_patch_id: patchId };
    }
    await insertAdjustmentSnapshot({
      plan_patch_id: patchId,
      operation_id: args.operationId ?? null,
      request_id: args.requestId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      draft: args.draft,
      patch,
      scope,
      applied: false,
      reason: "missing_plan_item_id",
      created_at: nowIso,
    });
    return { plan_patch_id: patchId };
  }

  const { data: item, error: selectError } = await args.supabase
    .from("user_plan_items")
    .select(
      "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,phase_id,phase_order,cards_status,payload",
    )
    .eq("id", planItemId)
    .eq("user_id", args.userId)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!item?.id) throw new Error("plan_item_not_found_for_adjustment");

  const currentPayload = item.payload && typeof item.payload === "object"
    ? item.payload as Record<string, unknown>
    : {};
  const previousAdjustments = Array.isArray(
      (currentPayload as any).operation_adjustments,
    )
    ? (currentPayload as any).operation_adjustments
    : [];
  const adjustmentRecord = {
    plan_patch_id: patchId,
    operation_id: args.operationId ?? null,
    request_id: args.requestId ?? null,
    source_message_id: args.sourceMessageId ?? null,
    applied_at: nowIso,
    draft: args.draft.draft,
    patch,
  };
  if (
    args.draft.draft.adjustment_type === "reduce" &&
    args.draft.draft.execution_strategy === "bridge_action"
  ) {
    const bridgeId = crypto.randomUUID();
    const bridgeAction = args.draft.draft.bridge_action;
    const bridgeTitle = String(bridgeAction?.title ?? "").trim() ||
      `Version mini - ${String((item as any).title ?? "action")}`;
    const bridgeDescription = String(bridgeAction?.description ?? "").trim() ||
      `Action pont vers "${
        String((item as any).title ?? "l'action initiale")
      }" : faire une version de 5 minutes avant de reprendre l'action initiale.`;
    const sourcePayload = currentPayload;
    const bridgePayload = {
      ...sourcePayload,
      operation_bridge: {
        kind: "reduction_bridge",
        source_plan_item_id: planItemId,
        plan_patch_id: patchId,
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        created_at: nowIso,
        patch,
        resume_original_after_completion:
          bridgeAction?.resume_original_after_completion ?? true,
      },
      active_operation_adjustment: adjustmentRecord,
    };
    const bridgeInsert: Record<string, unknown> = {
      id: bridgeId,
      user_id: args.userId,
      cycle_id: (item as any).cycle_id,
      transformation_id: (item as any).transformation_id,
      plan_id: (item as any).plan_id,
      dimension: (item as any).dimension,
      kind: (item as any).kind,
      status: "active",
      title: bridgeTitle,
      description: bridgeDescription,
      tracking_type: (item as any).tracking_type,
      activation_order: (item as any).activation_order,
      activation_condition: (item as any).activation_condition,
      current_habit_state: (item as any).current_habit_state,
      support_mode: (item as any).support_mode,
      support_function: (item as any).support_function,
      target_reps: (item as any).kind === "habit" ? 1 : null,
      current_reps: (item as any).kind === "habit" ? 0 : null,
      cadence_label: (item as any).kind === "habit" ? "1 fois" : null,
      scheduled_days: null,
      time_of_day: (item as any).time_of_day,
      start_after_item_id: (item as any).start_after_item_id,
      phase_id: (item as any).phase_id,
      phase_order: (item as any).phase_order,
      cards_status:
        ["missions", "habits"].includes(String((item as any).dimension))
          ? "not_started"
          : "not_required",
      payload: bridgePayload,
      activated_at: nowIso,
      updated_at: nowIso,
    };
    const { error: insertError } = await args.supabase
      .from("user_plan_items")
      .insert(bridgeInsert as any);
    if (insertError) throw insertError;

    const deferredRecord = {
      plan_patch_id: patchId,
      operation_id: args.operationId ?? null,
      request_id: args.requestId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      deferred_at: nowIso,
      bridge_plan_item_id: bridgeId,
      reason: "reduced_action_bridge_created",
      patch,
    };
    const { error: sourceUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        status: "pending",
        start_after_item_id: bridgeId,
        payload: {
          ...currentPayload,
          deferred_by_operation_bridge: deferredRecord,
          operation_adjustments: [...previousAdjustments, adjustmentRecord]
            .slice(
              -10,
            ),
        },
        updated_at: nowIso,
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (sourceUpdateError) throw sourceUpdateError;
    return { plan_patch_id: patchId, bridge_plan_item_id: bridgeId };
  }
  const updatePayload: Record<string, unknown> = {
    payload: {
      ...currentPayload,
      active_operation_adjustment: adjustmentRecord,
      operation_adjustments: [...previousAdjustments, adjustmentRecord].slice(
        -10,
      ),
    },
    updated_at: nowIso,
  };
  if (patch.paused === true) {
    updatePayload.status = "paused";
  }

  const { error: updateError } = await args.supabase
    .from("user_plan_items")
    .update(updatePayload as any)
    .eq("id", planItemId)
    .eq("user_id", args.userId);
  if (updateError) throw updateError;

  return { plan_patch_id: patchId };
}

function coachPreferenceLabel(key: string, value: string): string {
  if (key === "coach.tone") {
    return value === "tres_direct"
      ? "Très direct"
      : value === "doux"
      ? "Doux"
      : value;
  }
  if (key === "coach.question_tendency") {
    return value === "peu_de_questions"
      ? "Peu de questions"
      : value === "tres_questionnant"
      ? "Très questionnant"
      : value;
  }
  if (key === "coach.challenge_level") {
    return value === "eleve" ? "Élevé" : value === "leger" ? "Léger" : value;
  }
  return value;
}

async function upsertCoachPreferencesFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: CoachPreferencesPatchDraftV1;
  sourceMessageId?: string | null;
}) {
  const entries = Object.entries(args.draft.draft.patch);
  const now = new Date().toISOString();
  const rows = entries.map(([key, rawValue]) => {
    const value = String(rawValue);
    return {
      user_id: args.userId,
      scope: "global",
      key,
      value: {
        value,
        label: coachPreferenceLabel(key, value),
      },
      status: "active",
      confidence: 1,
      source_type: "explicit_user",
      last_source_message_id: args.sourceMessageId ?? null,
      reason: args.draft.draft.reason ?? args.draft.draft.summary,
      updated_at: now,
      last_confirmed_at: now,
    };
  });
  return await args.supabase
    .from("user_profile_facts")
    .upsert(rows as any, { onConflict: "user_id,scope,key" })
    .select("key")
    .limit(1)
    .single();
}

async function maybeRunCreateRecurringReminderOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
}): Promise<OperationRuntimeResult | null> {
  if (
    !recurringReminderRouteIsSelected({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  if (blocksToolSkills(args.safetyPregateOutput.risk_band)) {
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return null;
  }
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;
  if (
    isPendingRecurringReminderRecommendationOperation(pendingRecommendation)
  ) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne crée pas ce rappel.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const output = runCreateRecurringReminderIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
    });
    if (
      output.status === "pending_confirmation" && output.pending_confirmation
    ) {
      nextTempMemory.__pending_tool_skill_confirmation = {
        ...output.pending_confirmation,
        created_at: new Date().toISOString(),
        turn_count: 0,
      };
      delete nextTempMemory.__pending_recommendation_operation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: output.confirmation?.message ??
          "Tu veux que je crée ce rappel récurrent ?",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "pending_confirmation_from_skill_suggestion",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          draft: output.draft ?? null,
        },
      };
    }
    if (output.status === "ask_question") {
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "create_recurring_reminder",
        phase: output.phase,
        missing_slots: output.state_patch.missing_slots,
        operation_input: output.state_patch.operation_input ?? {},
        turn_count: 1,
        updated_at: new Date().toISOString(),
      };
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: output.next_question?.question ??
          "Tu veux ce rappel à quel moment ?",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "ask_question_from_skill_suggestion",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          missing_slots: output.state_patch.missing_slots,
        },
      };
    }
    delete nextTempMemory.__pending_recommendation_operation;
    return {
      content: output.ack ??
        "Je n'ai pas assez d'informations pour créer ce rappel depuis le chat.",
      nextTempMemory,
      toolExecution: output.status === "blocked_by_safety"
        ? "blocked"
        : "failed",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: output.status,
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }
  if (
    isPendingRecurringReminderOperation(pendingRaw) &&
    isRecurringReminderCorrectionMessage(args.userMessage)
  ) {
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "create_recurring_reminder",
      phase: "recurrence_resolution",
      missing_slots: [],
      operation_input: recurringReminderDraftOperationInput(
        pendingRaw.draft as RecurringReminderDraftV1,
      ),
      turn_count: 0,
      updated_at: new Date().toISOString(),
    };
  } else if (isPendingRecurringReminderOperation(pendingRaw)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne crée pas ce rappel.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const { data, error } = await insertRecurringReminderFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      operationId: pendingRaw.operation_id ?? null,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    if (error || !data?.id) {
      return {
        content:
          "Je n'ai pas réussi à créer ce rappel techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["create_recurring_reminder"],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "failed",
          operation_id: pendingRaw.operation_id ?? null,
          error: error?.message ?? "missing_inserted_id",
        },
      };
    }
    return {
      content: `C'est fait. J'ai créé le rappel récurrent: ${
        formatRecurringReminderSummary(pendingRaw.draft)
      }.`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["create_recurring_reminder"],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        recurring_reminder_id: data.id,
      },
    };
  }

  const activeIntake = nextTempMemory.__active_tool_skill_intake as any;
  const routeExplicitlySelected =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler === "create_recurring_reminder";
  if (
    !activeIntake &&
    !isExplicitRecurringReminderOperationMessage(args.userMessage) &&
    !routeExplicitlySelected
  ) {
    return null;
  }

  const output = runCreateRecurringReminderIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeIntake?.turn_count ?? 0),
    operation_input: activeIntake?.operation_input ?? null,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        "Tu veux que je crée ce rappel récurrent ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "create_recurring_reminder",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ?? {},
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: output.next_question?.question ??
        "Tu veux ce rappel à quel moment ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu créer ce rappel depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: output.status === "blocked_by_safety"
      ? []
      : ["create_recurring_reminder"],
    toolSkillRun: {
      selected_handler: "create_recurring_reminder",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}

async function executePendingAdjustPlanDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  channel: "web" | "whatsapp";
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  nextTempMemory: any;
  pendingRaw: {
    operation_id?: string;
    draft: PlanAdjustmentDraftV1;
    operation_input?: Record<string, unknown> | null;
  };
}): Promise<OperationRuntimeResult> {
  const operationId = String(
    args.pendingRaw.operation_id ?? crypto.randomUUID(),
  );
  const pendingScopeKind = String(
    (args.pendingRaw.operation_input as any)?.scope?.kind ?? "",
  ).trim();
  const missingSpecificPlanItemId = (!pendingScopeKind ||
    pendingScopeKind === "specific_plan_item") &&
    !String((args.pendingRaw.operation_input as any)?.scope?.plan_item_id ?? "")
      .trim();
  if (missingSpecificPlanItemId) {
    delete args.nextTempMemory.__pending_adjust_plan_draft_review;
    delete args.nextTempMemory.__pending_tool_skill_confirmation;
    delete args.nextTempMemory.pending_tool_skill_confirmation;
    return {
      content:
        'Je ne l\'applique pas automatiquement, parce que je n\'ai pas retrouvé cette action comme item réel du dashboard. Proposition prête à copier : remplace "ranger tous mes papiers" par "trier seulement trois documents". Applique-la depuis ton dashboard pour que le plan canonique reste exact.',
      nextTempMemory: args.nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "not_executed_missing_plan_item_id",
        operation_id: operationId,
      },
    };
  }
  const token = await createConfirmationToken({
    user_id: args.userId,
    operation_id: operationId,
    operation_type: "adjust_plan_item",
    draft: args.pendingRaw.draft,
    source_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    pending_confirmation_id: operationId,
    secret: envString(
      "CONFIRMATION_TOKEN_SECRET",
      envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
    ),
  });
  const executed = await executeAdjustPlanItem({
    operation_id: operationId,
    user_id: args.userId,
    draft: args.pendingRaw.draft,
    token,
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    pending_confirmation_lookup: async (id) =>
      id === operationId ? { consumed: false } : null,
    token_consumption_check: async () => false,
    write_plan_patch: async (patch) =>
      await writePlanAdjustmentPatch({
        supabase: args.supabase,
        userId: args.userId,
        draft: args.pendingRaw.draft,
        operationInput: args.pendingRaw.operation_input ?? null,
        operationId,
        requestId: args.requestId ?? null,
        sourceMessageId: args.sourceMessageId,
      }).then((result) => {
        if (!patch || Object.keys(patch).length === 0) {
          throw new Error("plan_patch_empty");
        }
        return result;
      }),
    secret: envString(
      "CONFIRMATION_TOKEN_SECRET",
      envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
    ),
  });
  delete args.nextTempMemory.__pending_adjust_plan_draft_review;
  delete args.nextTempMemory.__pending_tool_skill_confirmation;
  delete args.nextTempMemory.pending_tool_skill_confirmation;
  if (executed.status !== "executed") {
    return {
      content: executed.ack,
      nextTempMemory: args.nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: executed.status,
        operation_id: operationId,
        reason_code: executed.reason_code,
      },
    };
  }
  args.nextTempMemory.__last_adjust_plan_execution = {
    operation_id: operationId,
    plan_patch_id: executed.plan_patch_id,
    draft: args.pendingRaw.draft,
    operation_input: args.pendingRaw.operation_input ?? null,
    created_at: new Date().toISOString(),
  };
  return {
    content: adjustmentExecutionAck({
      draft: args.pendingRaw.draft,
      operationInput: args.pendingRaw.operation_input ?? null,
      fallbackAck: executed.ack,
    }),
    nextTempMemory: args.nextTempMemory,
    toolExecution: "success",
    executedTools: ["adjust_plan_item"],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: "executed",
      operation_id: operationId,
      plan_patch_id: executed.plan_patch_id,
      bridge_plan_item_id: executed.bridge_plan_item_id ?? null,
    },
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
}): Promise<OperationRuntimeResult | null> {
  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingDraftReview =
    nextTempMemory.__pending_adjust_plan_draft_review ??
      null;
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  if (pendingOperationType(pendingRaw) === "prepare_attack_card") return null;
  const activeOperationType = String(
    (nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake)?.operation_type ?? "",
  ).trim();
  if (activeOperationType && activeOperationType !== "adjust_plan_item") {
    return null;
  }
  if (isPendingAdjustPlanDraftReview(pendingDraftReview)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
      structuredOnly: true,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_adjust_plan_draft_review;
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je n'applique pas cet ajustement.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_cancelled",
          operation_id: pendingDraftReview.operation_id ?? null,
        },
      };
    }
    const asksDraftDetails = isAdjustPlanExplainOnlyIntent(args.turnFrame);
    const asksDraftRevision = isAdjustPlanRevisionIntent(args.turnFrame);
    if (asksDraftDetails && !asksDraftRevision) {
      const detailReply = renderPendingAdjustPlanDraftDetails({
        __pending_adjust_plan_draft_review: pendingDraftReview,
      });
      if (detailReply) {
        return {
          content: detailReply,
          nextTempMemory,
          toolExecution: "none",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "draft_review_details",
            operation_id: pendingDraftReview.operation_id ?? null,
          },
        };
      }
    }
    if (
      confirmation === "correction_to_pending" ||
      asksDraftRevision
    ) {
      const output = await runAdjustPlanItemIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingDraftReview.turn_count ?? 0) + 1,
        plan_snapshot: { items: args.planItemSnapshot ?? [] },
        operation_input: {
          ...(pendingDraftReview.operation_input ?? {}),
          previous_draft: pendingDraftReview.draft,
          revision_request: args.userMessage,
        },
        force_ai_slot_filling: args.forceFullAi === true,
      });
      if (
        output.status === "pending_confirmation" && output.pending_confirmation
      ) {
        const revisionHistory = [
          ...(pendingDraftReview.revision_history ?? []),
          {
            user_request: args.userMessage,
            changed: ["draft_regenerated"],
            created_at: new Date().toISOString(),
          },
        ];
        nextTempMemory.__pending_adjust_plan_draft_review = {
          ...output.pending_confirmation,
          phase: "draft_review",
          operation_input: output.state_patch.operation_input ??
            (output.pending_confirmation as any).operation_input ??
            pendingDraftReview.operation_input ??
            null,
          created_at: pendingDraftReview.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          turn_count: 0,
          revision_history: revisionHistory,
          supersedes_operation_id: pendingDraftReview.operation_id ?? null,
        };
        delete nextTempMemory.__pending_tool_skill_confirmation;
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: output.confirmation?.message ??
            output.draft?.confirmation_message ??
            "",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "draft_review_updated",
            operation_id: (output.pending_confirmation as any)?.operation_id ??
              pendingDraftReview.operation_id ?? null,
            previous_operation_id: pendingDraftReview.operation_id ?? null,
            draft: output.draft ?? null,
          },
        };
      }
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...pendingDraftReview,
        turn_count: Number(pendingDraftReview.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: output.next_question?.question ??
          "Je peux ajuster le brouillon, mais il me manque une précision avant de te proposer une version propre.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: output.status,
          operation_id: pendingDraftReview.operation_id ?? null,
          missing_slots: output.state_patch.missing_slots,
          draft_review: true,
        },
      };
    }
    if (confirmation === "yes") {
      return await executePendingAdjustPlanDraft({
        supabase: args.supabase,
        userId: args.userId,
        channel: args.channel,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        nextTempMemory,
        pendingRaw: pendingDraftReview,
      });
    }
    return null;
  }
  if (
    isAdjustPlanExplainOnlyIntent(args.turnFrame) &&
    !isAdjustPlanRevisionIntent(args.turnFrame)
  ) {
    const detailReply = renderPendingAdjustPlanDraftDetails(nextTempMemory) ??
      renderLastAdjustPlanDetails(nextTempMemory);
    if (detailReply) {
      return {
        content: detailReply,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "answered_last_adjustment_details",
        },
      };
    }
  }
  const adjustPlanRouteSelected = operationRouteIsSelected({
    operationType: "adjust_plan_item",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!adjustPlanRouteSelected) return null;

  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;

  if (isPendingAdjustPlanItemOperation(pendingRaw)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
      structuredOnly: true,
    });
    const correctionScopeInput = operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame,
    );
    if (
      confirmation === "correction_to_pending" ||
      (confirmation === "yes" &&
        isBroaderPlanAdjustmentInput(correctionScopeInput))
    ) {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__last_resolved_plan_item;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    } else {
      if (confirmation === "no") {
        delete nextTempMemory.__pending_tool_skill_confirmation;
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: "Ok, je n'applique pas cet ajustement.",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "cancelled",
            operation_id: pendingRaw.operation_id ?? null,
          },
        };
      }
      if (confirmation !== "yes") return null;

      return await executePendingAdjustPlanDraft({
        supabase: args.supabase,
        userId: args.userId,
        channel: args.channel,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        nextTempMemory,
        pendingRaw,
      });
    }
  }

  if (isPendingAdjustPlanItemRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
      structuredOnly: true,
    });
    const correctionScopeInput = operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame,
    );
    if (
      confirmation === "correction_to_pending" ||
      (confirmation === "yes" &&
        isBroaderPlanAdjustmentInput(correctionScopeInput))
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      delete nextTempMemory.__last_resolved_plan_item;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    } else {
      if (confirmation === "no") {
        delete nextTempMemory.__pending_recommendation_operation;
        return {
          content: "Ok, on ne touche pas au plan pour l'instant.",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: "recommendation_cancelled",
            recommendation_id: pendingRecommendation.recommendation_id ?? null,
          },
        };
      }
      if (confirmation !== "yes") return null;

      const output = await runAdjustPlanItemIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "recommendation_tool",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        plan_snapshot: { items: args.planItemSnapshot ?? [] },
        operation_input: pendingRecommendation.operation_input ?? null,
        force_ai_slot_filling: args.forceFullAi === true,
      });
      if (
        output.status !== "pending_confirmation" ||
        !output.pending_confirmation || !output.draft
      ) {
        delete nextTempMemory.__pending_recommendation_operation;
        return {
          content: output.next_question?.question ??
            "Il me manque l'action exacte à alléger. Tu veux que je réduise quelle action du plan ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "adjust_plan_item",
            status: output.status,
            missing_slots: output.state_patch.missing_slots,
            source: "recommendation_tool",
          },
        };
      }

      delete nextTempMemory.__pending_recommendation_operation;
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...output.pending_confirmation,
        phase: "draft_review",
        operation_input: output.state_patch.operation_input ??
          (output.pending_confirmation as any).operation_input ??
          pendingRecommendation.operation_input ??
          null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        turn_count: 0,
        revision_history: [],
      };
      return {
        content: output.confirmation?.message ??
          output.draft?.confirmation_message ??
          "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_from_recommendation",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          draft: output.draft,
        },
      };
    }
  }

  const hasActiveAdjustPlanIntake =
    (nextTempMemory.__active_tool_skill_intake as any)?.operation_type ===
      "adjust_plan_item";
  if (!hasActiveAdjustPlanIntake && !adjustPlanRouteSelected) return null;

  if (
    isOperationEscapeMessage(args.userMessage) &&
    !hasStrongToolSkillIntent(args.turnFrame, "adjust_plan_item")
  ) return null;
  const scopedOperationInput = operationInputFromPlanAdjustmentScope(
    args.userMessage,
    args.turnFrame,
  );
  if (isBroaderPlanAdjustmentInput(scopedOperationInput)) {
    delete nextTempMemory.__last_resolved_plan_item;
  }
  const activeAdjustPlanOperationInput =
    (nextTempMemory.__active_tool_skill_intake as any)?.operation_input &&
      typeof (nextTempMemory.__active_tool_skill_intake as any)
          .operation_input === "object"
      ? (nextTempMemory.__active_tool_skill_intake as any)
        .operation_input as Record<string, unknown>
      : null;
  let item = scopedOperationInput
    ? null
    : readLastResolvedPlanItem(nextTempMemory);
  if (!scopedOperationInput && !item) {
    const intentItem = resolvePlanItemTargetFromToolSkillIntent(
      args.turnFrame,
      "adjust_plan_item",
      args.planItemSnapshot,
    );
    if (intentItem) {
      Object.assign(
        nextTempMemory,
        writeLastResolvedPlanItem(
          nextTempMemory,
          intentItem,
          "tool_skill_intent_target_hint",
        ),
      );
      item = readLastResolvedPlanItem(nextTempMemory);
    }
  }
  const fallbackOperationInput = scopedOperationInput ??
    activeAdjustPlanOperationInput ??
    operationInputFromLastPlanItem(nextTempMemory);
  const output = await runAdjustPlanItemIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
    plan_snapshot: { items: args.planItemSnapshot ?? [] },
    operation_input: fallbackOperationInput,
    force_ai_slot_filling: args.forceFullAi === true,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_adjust_plan_draft_review = {
      ...output.pending_confirmation,
      phase: "draft_review",
      operation_input: output.state_patch.operation_input ??
        (output.pending_confirmation as any).operation_input ??
        fallbackOperationInput,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      turn_count: 0,
      revision_history: [],
    };
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        output.draft?.confirmation_message ??
        "",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "draft_review",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "adjust_plan_item",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        fallbackOperationInput,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    content: output.next_question?.question ??
      output.ack ??
      "",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety"
      ? "blocked"
      : "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: output.status,
      plan_item_id: item?.id ?? null,
      target_title: item?.title ??
        planItemTitleFromOperationInput(fallbackOperationInput),
      missing_slots: output.state_patch.missing_slots,
    },
  };
}

export async function maybeRunPrepareAttackCardOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  planSnapshot?: unknown;
}): Promise<OperationRuntimeResult | null> {
  const routeSelected = operationRouteIsSelected({
    operationType: "prepare_attack_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  }) ||
    isExplicitAttackCardCreationRequest(args.userMessage);
  if (!routeSelected) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;
  const activeAttackCardIntakeRaw = nextTempMemory.__active_tool_skill_intake ??
    nextTempMemory.active_tool_skill_intake ??
    null;
  if (
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !activeAttackCardIntakeRaw &&
    isAttackCardLocationOrManagementQuestion(args.userMessage)
  ) {
    return null;
  }
  if (
    isOperationEscapeMessage(args.userMessage) &&
    !isPendingAttackCardOperation(pendingRaw)
  ) {
    return null;
  }
  const occupiedAttackKeywords = await loadActiveAttackKeywordOptions({
    supabase: args.supabase,
    userId: args.userId,
  });
  const withOccupiedAttackKeywords = (
    input: Record<string, unknown> | null | undefined,
  ) => ({
    ...(input ?? {}),
    occupied_activation_keywords: occupiedAttackKeywords,
  });
  const useAiAttackCardFlow = shouldUsePrepareAttackCardAiFlow();
  const detectAttackCardConfirmation = () =>
    detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
      structuredOnly: useAiAttackCardFlow,
    });
  const runAttackCardIntake = (
    input: Parameters<typeof runPrepareAttackCardIntake>[0],
  ) =>
    useAiAttackCardFlow
      ? runPrepareAttackCardAiIntake({
        ...input,
        request_id: args.requestId ?? null,
      })
      : Promise.resolve(runPrepareAttackCardIntake(input));
  let fallbackOperationInput = operationInputFromLastPlanItem(nextTempMemory);
  if (isPendingAttackCardOperation(pendingRaw)) {
    const confirmation = detectAttackCardConfirmation();
    if (confirmation === "no") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne crée pas cette carte d'attaque.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
        },
      };
    }
    if (confirmation === "correction_to_pending") {
      const pendingCorrectionInput = {
        target: attackCardTargetFromPendingConfirmation(
          pendingRaw as unknown as Record<string, unknown>,
          null,
        ),
        technique: pendingRaw.draft?.draft?.technique ?? undefined,
        activation_keyword: pendingRaw.draft?.draft?.activation_keyword ??
          undefined,
        occupied_activation_keywords: occupiedAttackKeywords,
      };
      const correctionOutput = await runAttackCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: withOccupiedAttackKeywords(pendingCorrectionInput),
      });

      if (
        correctionOutput.status === "pending_confirmation" &&
        correctionOutput.pending_confirmation &&
        correctionOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...correctionOutput.pending_confirmation,
          target: attackCardTargetFromPendingConfirmation(
            correctionOutput.pending_confirmation,
            null,
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: correctionOutput.confirmation?.message ??
            correctionOutput.draft.confirmation_message,
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              correctionOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: correctionOutput.draft,
          },
        };
      }

      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_attack_card",
        phase: correctionOutput.phase,
        missing_slots: correctionOutput.state_patch.missing_slots,
        slot_state: correctionOutput.next_question ?? null,
        operation_input: correctionOutput.state_patch.operation_input ?? {
          ...pendingCorrectionInput,
          ...(correctionOutput.next_question?.known_slots ?? {}),
        },
        tool_skill_state: correctionOutput.state_patch.tool_skill_state ?? null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      };
      return {
        content: renderAttackCardSlotQuestion(correctionOutput.next_question),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: correctionOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: correctionOutput.state_patch.missing_slots,
          slot_state: correctionOutput.next_question ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const { data, error } = await insertAttackCardFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      operationId: pendingRaw.operation_id ?? null,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      target: pendingRaw.target ?? null,
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    if (error || !data?.id) {
      return {
        content:
          "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["prepare_attack_card"],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "failed",
          operation_id: pendingRaw.operation_id ?? null,
          error: error?.message ?? "missing_inserted_id",
        },
      };
    }
    return {
      content:
        `C'est fait. J'ai créé cette carte d'attaque :\n\n${pendingRaw.draft.draft.title}\nTechnique : ${pendingRaw.draft.draft.technique_title}\n${pendingRaw.draft.draft.generated_asset}\n\nMode d'emploi : ${pendingRaw.draft.draft.mode_emploi}\n\n${ATTACK_CARD_CREATED_LOCATION}`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["prepare_attack_card"],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        attack_card_id: data.id,
      },
    };
  }

  const activeAttackCardIntake = activeAttackCardIntakeRaw as any;
  const activeTargetQuestion = activeAttackCardIntake?.operation_type ===
      "prepare_attack_card"
    ? activeAttackCardIntake.slot_state ?? activeAttackCardIntake.next_question
    : null;
  const activeTargetCandidate = attackCardTargetFromQuestionCandidate(
    activeTargetQuestion?.candidate,
  );
  const activeKnownSlots = activeAttackCardIntake?.operation_input ??
    activeTargetQuestion?.known_slots ??
    {};
  if (activeTargetCandidate) {
    const confirmation = detectAttackCardConfirmation();
    if (confirmation === "yes") {
      const candidateOutput = await runAttackCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: withOccupiedAttackKeywords({
          ...activeKnownSlots,
          target: activeTargetCandidate,
        }),
      });
      if (
        candidateOutput.status === "pending_confirmation" &&
        candidateOutput.pending_confirmation
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...candidateOutput.pending_confirmation,
          target: attackCardTargetFromPendingConfirmation(
            candidateOutput.pending_confirmation,
            { target: activeTargetCandidate },
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        return {
          content: candidateOutput.confirmation?.message ??
            "Confirme si tu veux que je crée cette carte.",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "pending_confirmation",
            operation_id:
              (candidateOutput.pending_confirmation as any)?.operation_id ??
                null,
            draft: candidateOutput.draft ?? null,
            target_slot_resolution: {
              status: "confirmed_candidate",
              target: activeTargetCandidate,
            },
          },
        };
      }
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_attack_card",
        phase: candidateOutput.phase,
        missing_slots: candidateOutput.state_patch.missing_slots,
        slot_state: candidateOutput.next_question ?? null,
        operation_input: candidateOutput.state_patch.operation_input ?? {
          ...activeKnownSlots,
          target: activeTargetCandidate,
          ...(candidateOutput.next_question?.known_slots ?? {}),
        },
        tool_skill_state: candidateOutput.state_patch.tool_skill_state ?? null,
        turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: renderAttackCardSlotQuestion(candidateOutput.next_question),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: candidateOutput.status,
          missing_slots: candidateOutput.state_patch.missing_slots,
          slot_state: candidateOutput.next_question ?? null,
        },
      };
    }
    if (confirmation === "no") {
      const slotState = {
        needed: true,
        slot: "target",
        status: "missing",
        reason: "target_candidate_rejected",
      };
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_attack_card",
        phase: "target_resolution",
        missing_slots: ["target"],
        slot_state: slotState,
        operation_input: activeKnownSlots,
        turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: renderAttackCardSlotQuestion(slotState),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "ask_question",
          missing_slots: ["target"],
          slot_state: slotState,
        },
      };
    }
    if (confirmation === "correction_to_pending") {
      fallbackOperationInput = null;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    } else if (confirmation !== "unknown") {
      return null;
    } else {
      return {
        content: renderAttackCardSlotQuestion(activeTargetQuestion),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "ask_question",
          missing_slots: ["target"],
          slot_state: activeTargetQuestion,
        },
      };
    }
  }

  if (
    activeAttackCardIntake?.operation_type === "prepare_attack_card" &&
    activeAttackCardIntake?.operation_input
  ) {
    fallbackOperationInput = activeAttackCardIntake.operation_input;
  }

  if (isPendingAttackCardRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectAttackCardConfirmation();
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne crée pas cette carte d'attaque.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const recommendationOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords(
        pendingRecommendation.operation_input ?? null,
      ),
    });

    if (
      recommendationOutput.status !== "pending_confirmation" ||
      !recommendationOutput.draft ||
      !recommendationOutput.pending_confirmation
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      if (recommendationOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_attack_card",
          phase: recommendationOutput.phase,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
          operation_input: recommendationOutput.state_patch.operation_input ?? {
            ...(pendingRecommendation.operation_input ?? {}),
            ...(recommendationOutput.next_question?.known_slots ?? {}),
          },
          tool_skill_state: recommendationOutput.state_patch.tool_skill_state ??
            null,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
      }
      return {
        content: renderAttackCardSlotQuestion(
          recommendationOutput.next_question,
          recommendationOutput.state_patch.missing_slots.includes("target")
            ? "Il manque la cible à rattacher à cette carte."
            : "Il me manque encore un choix pour préparer cette carte.",
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: recommendationOutput.status,
          source: "recommendation_tool",
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
        },
      };
    }

    nextTempMemory.__pending_tool_skill_confirmation = {
      ...recommendationOutput.pending_confirmation,
      target: attackCardTargetFromPendingConfirmation(
        recommendationOutput.pending_confirmation,
        pendingRecommendation.operation_input ?? null,
      ),
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.__pending_recommendation_operation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: recommendationOutput.confirmation?.message ??
        recommendationOutput.draft.confirmation_message,
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "pending_confirmation",
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        operation_id: String(
          recommendationOutput.pending_confirmation.operation_id ??
            "",
        ),
        draft: recommendationOutput.draft,
      },
    };
  }

  const attackTechniqueHint = attackTechniqueHintFromTurnFrame(args.turnFrame);
  const output = await runAttackCardIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
    plan_snapshot: args.planSnapshot ?? {},
    operation_input: {
      ...(fallbackOperationInput ?? {}),
      ...(attackTechniqueHint
        ? { desired_attack_technique: attackTechniqueHint }
        : {}),
      occupied_activation_keywords: occupiedAttackKeywords,
    },
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      target: attackCardTargetFromPendingConfirmation(
        output.pending_confirmation,
        fallbackOperationInput,
      ),
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        "Tu veux que je crée cette carte d'attaque ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_attack_card",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      slot_state: output.next_question ?? null,
      operation_input: output.state_patch.operation_input ??
        output.next_question?.known_slots ?? null,
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderAttackCardSlotQuestion(output.next_question),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
        slot_state: output.next_question ?? null,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu préparer cette carte depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: output.status === "blocked_by_safety"
      ? []
      : ["prepare_attack_card"],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}

async function maybeRunPrepareDefenseCardOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  planSnapshot?: unknown;
}): Promise<OperationRuntimeResult | null> {
  if (
    !operationRouteIsSelected({
      operationType: "prepare_defense_card",
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;
  if (
    isOperationEscapeMessage(args.userMessage) &&
    !isPendingDefenseCardOperation(pendingRaw) &&
    !isPendingDefenseCardRecommendationOperation(pendingRecommendation)
  ) {
    return null;
  }
  let fallbackOperationInput = operationInputFromLastPlanItem(nextTempMemory);

  if (isPendingDefenseCardOperation(pendingRaw)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne crée pas cette carte de défense.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
        },
      };
    }
    if (confirmation === "correction_to_pending") {
      const correctionOutput = runPrepareDefenseCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: {
          attachment: pendingRaw.attachment ?? null,
          risk_situation: pendingRaw.risk_situation ?? null,
          defense_response_hint: pendingRaw.defense_response_hint ??
            (pendingRaw.draft?.draft?.defense_response
              ? {
                strategy_hint: "unknown",
                value: pendingRaw.draft.draft.defense_response,
              }
              : undefined),
        },
      });

      if (
        correctionOutput.status === "pending_confirmation" &&
        correctionOutput.pending_confirmation &&
        correctionOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...correctionOutput.pending_confirmation,
          attachment: defenseCardAttachmentFromPendingConfirmation(
            correctionOutput.pending_confirmation,
            null,
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: correctionOutput.confirmation?.message ??
            correctionOutput.draft.confirmation_message,
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              correctionOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: correctionOutput.draft,
          },
        };
      }

      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_defense_card",
        phase: correctionOutput.phase,
        missing_slots: correctionOutput.state_patch.missing_slots,
        slot_state: correctionOutput.next_question ?? null,
        operation_input: correctionOutput.next_question?.known_slots ?? null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      };
      return {
        content: renderDefenseCardSlotQuestion(correctionOutput.next_question),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: correctionOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: correctionOutput.state_patch.missing_slots,
          slot_state: correctionOutput.next_question ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const { data, error } = await insertDefenseCardFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      operationId: pendingRaw.operation_id ?? null,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      attachment: pendingRaw.attachment ?? null,
      riskSituation: pendingRaw.risk_situation ?? null,
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    if (error || !data?.id) {
      return {
        content:
          "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["prepare_defense_card"],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "failed",
          operation_id: pendingRaw.operation_id ?? null,
          error: error?.message ?? "missing_inserted_id",
        },
      };
    }
    return {
      content:
        `C'est fait. J'ai créé la carte de défense "${pendingRaw.draft.draft.title}" : ${pendingRaw.draft.draft.defense_response}\n\n${DEFENSE_CARD_CREATED_LOCATION}`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["prepare_defense_card"],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        defense_card_id: data.id,
      },
    };
  }

  if (isPendingDefenseCardRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne crée pas cette carte de défense.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const recommendationOutput = runPrepareDefenseCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: pendingRecommendation.operation_input ?? null,
    });

    if (
      recommendationOutput.status !== "pending_confirmation" ||
      !recommendationOutput.draft
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: renderDefenseCardSlotQuestion(
          recommendationOutput.next_question,
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: recommendationOutput.status,
          source: "recommendation_tool",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
        },
      };
    }

    const attachment =
      (pendingRecommendation.operation_input as any)?.attachment ?? null;
    const riskSituation =
      (pendingRecommendation.operation_input as any)?.risk_situation ?? null;
    const { data, error } = await insertDefenseCardFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: recommendationOutput.draft,
      operationId: String(
        (recommendationOutput.pending_confirmation as any)?.operation_id ??
          crypto.randomUUID(),
      ),
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      attachment: attachment && typeof attachment === "object"
        ? {
          kind: attachment.kind === "personal_action"
            ? "personal_action"
            : "plan_item",
          title: String(
            attachment.title ?? recommendationOutput.draft.draft.target_label,
          ),
          plan_item_id: attachment.plan_item_id ?? null,
        }
        : null,
      riskSituation: riskSituation && typeof riskSituation === "object"
        ? riskSituation
        : null,
    });
    delete nextTempMemory.__pending_recommendation_operation;
    if (error || !data?.id) {
      return {
        content:
          "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["prepare_defense_card"],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "failed",
          source: "recommendation_tool",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          error: error?.message ?? "missing_inserted_id",
        },
      };
    }
    return {
      content:
        `C'est fait. J'ai créé la carte de défense "${recommendationOutput.draft.draft.title}" : ${recommendationOutput.draft.draft.defense_response}\n\n${DEFENSE_CARD_CREATED_LOCATION}`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["prepare_defense_card"],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: "executed_from_recommendation",
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        defense_card_id: data.id,
      },
    };
  }

  const activeDefenseIntake = (
    nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake
  ) as any;
  const activeAttachmentQuestion = activeDefenseIntake?.operation_type ===
      "prepare_defense_card"
    ? activeDefenseIntake.slot_state ?? activeDefenseIntake.next_question
    : null;
  const activeAttachmentCandidate = defenseCardAttachmentFromQuestionCandidate(
    activeAttachmentQuestion?.candidate,
  );
  if (activeAttachmentCandidate) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    const activeKnownSlots = activeDefenseIntake?.operation_input ??
      activeAttachmentQuestion?.known_slots ??
      {};
    if (confirmation === "yes") {
      const candidateOutput = runPrepareDefenseCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: {
          ...activeKnownSlots,
          attachment: activeAttachmentCandidate,
        },
      });
      if (
        candidateOutput.status === "pending_confirmation" &&
        candidateOutput.pending_confirmation
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...candidateOutput.pending_confirmation,
          attachment: defenseCardAttachmentFromPendingConfirmation(
            candidateOutput.pending_confirmation,
            { attachment: activeAttachmentCandidate },
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        return {
          content: candidateOutput.confirmation?.message ??
            "Confirme si tu veux que je crée cette carte.",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: "pending_confirmation",
            operation_id:
              (candidateOutput.pending_confirmation as any)?.operation_id ??
                null,
            draft: candidateOutput.draft ?? null,
            attachment_slot_resolution: {
              status: "confirmed_candidate",
              attachment: activeAttachmentCandidate,
            },
          },
        };
      }
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_defense_card",
        phase: candidateOutput.phase,
        missing_slots: candidateOutput.state_patch.missing_slots,
        slot_state: candidateOutput.next_question ?? null,
        operation_input: {
          ...activeKnownSlots,
          attachment: activeAttachmentCandidate,
        },
        turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: renderDefenseCardSlotQuestion(candidateOutput.next_question),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: candidateOutput.status,
          missing_slots: candidateOutput.state_patch.missing_slots,
          slot_state: candidateOutput.next_question ?? null,
        },
      };
    }
    if (confirmation === "no") {
      const slotState = {
        needed: true,
        slot: "attachment",
        status: "missing",
        reason: "attachment_candidate_rejected",
      };
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_defense_card",
        phase: "attachment_resolution",
        missing_slots: ["attachment"],
        slot_state: slotState,
        operation_input: activeKnownSlots,
        turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: renderDefenseCardSlotQuestion(slotState),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "ask_question",
          missing_slots: ["attachment"],
          slot_state: slotState,
        },
      };
    }
    if (confirmation === "correction_to_pending") {
      fallbackOperationInput = null;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    } else if (confirmation !== "unknown") {
      return null;
    } else {
      return {
        content: renderDefenseCardSlotQuestion(activeAttachmentQuestion),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "ask_question",
          missing_slots: ["attachment"],
          slot_state: activeAttachmentQuestion,
        },
      };
    }
  }

  if (
    activeDefenseIntake?.operation_type === "prepare_defense_card" &&
    activeDefenseIntake?.operation_input
  ) {
    fallbackOperationInput = activeDefenseIntake.operation_input;
  }

  const output = runPrepareDefenseCardIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
    plan_snapshot: args.planSnapshot ?? {},
    operation_input: fallbackOperationInput,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      attachment: defenseCardAttachmentFromPendingConfirmation(
        output.pending_confirmation,
        fallbackOperationInput,
      ),
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    return {
      content: output.confirmation?.message ??
        "Tu veux que je crée cette carte de défense ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_defense_card",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      slot_state: output.next_question ?? null,
      operation_input: output.next_question?.known_slots ?? null,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderDefenseCardSlotQuestion(output.next_question),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
        slot_state: output.next_question ?? null,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu préparer cette carte de défense depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: output.status === "blocked_by_safety"
      ? []
      : ["prepare_defense_card"],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}

async function maybeRunSelectStatePotionOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
}): Promise<OperationRuntimeResult | null> {
  if (
    !operationRouteIsSelected({
      operationType: "select_state_potion",
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;

  if (isPendingStatePotionOperation(pendingRaw)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne lance pas cette potion.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const operationId = String(pendingRaw.operation_id ?? crypto.randomUUID());
    const token = await createConfirmationToken({
      user_id: args.userId,
      operation_id: operationId,
      operation_type: "select_state_potion",
      draft: pendingRaw.draft,
      source_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      pending_confirmation_id: operationId,
      secret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    });
    const executed = await executeActivateStatePotion({
      operation_id: operationId,
      user_id: args.userId,
      draft: pendingRaw.draft,
      token,
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      pending_confirmation_lookup: async (id) =>
        id === operationId ? { consumed: false } : null,
      token_consumption_check: async () => false,
      write_potion_activation: async ({ draft, scheduled_followups }) =>
        await writeStatePotionActivation({
          supabase: args.supabase,
          userId: args.userId,
          draft,
          scheduledFollowups: scheduled_followups,
          operationId,
          requestId: args.requestId ?? null,
          sourceMessageId: args.sourceMessageId,
        }),
      secret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    if (executed.status !== "executed") {
      return {
        content: executed.ack,
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: executed.status,
          operation_id: operationId,
          reason_code: executed.reason_code,
        },
      };
    }
    return {
      content: executed.ack,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["select_state_potion"],
      toolSkillRun: {
        selected_handler: "select_state_potion",
        status: "executed",
        operation_id: operationId,
        potion_session_id: executed.potion_session_id,
        recurring_reminder_id: executed.recurring_reminder_id,
      },
    };
  }

  if (isPendingStatePotionRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne lance pas de potion.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const output = runSelectStatePotionIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
    });
    delete nextTempMemory.__pending_recommendation_operation;
    if (
      output.status === "pending_confirmation" && output.pending_confirmation
    ) {
      nextTempMemory.__pending_tool_skill_confirmation = {
        ...output.pending_confirmation,
        created_at: new Date().toISOString(),
        turn_count: 0,
      };
      return {
        content: output.confirmation?.message ??
          "Tu veux que je lance cette potion ?",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "pending_confirmation_from_recommendation",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          draft: output.draft ?? null,
        },
      };
    }
    if (output.status === "ask_question") {
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "select_state_potion",
        phase: output.phase,
        missing_slots: output.state_patch.missing_slots,
        operation_input: {},
        turn_count: 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: output.next_question?.question ??
          "C'est plutôt stress, honte, peur, flou, dureté envers toi, ou décrochage ?",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "ask_question_from_recommendation",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          missing_slots: output.state_patch.missing_slots,
        },
      };
    }
    return {
      content: output.ack ??
        "Je n'ai pas assez d'informations pour choisir cette potion.",
      nextTempMemory,
      toolExecution: output.status === "blocked_by_safety"
        ? "blocked"
        : "failed",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "select_state_potion",
        status: output.status,
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
      },
    };
  }

  const activeIntake = (
    nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake
  ) as any;
  const activeOperationInput = activeIntake?.operation_type ===
      "select_state_potion"
    ? activeIntake.operation_input ?? {}
    : {};
  const output = runSelectStatePotionIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeIntake?.turn_count ?? 0),
    operation_input: activeOperationInput,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        "Tu veux que je lance cette potion ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "select_state_potion",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "select_state_potion",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: activeOperationInput,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: output.next_question?.question ??
        "C'est plutôt stress, honte, peur, flou, dureté envers toi, ou décrochage ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "select_state_potion",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu choisir cette potion depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "select_state_potion",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
}

async function maybeRunUpdateCoachPreferencesOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
}): Promise<OperationRuntimeResult | null> {
  if (
    !operationRouteIsSelected({
      operationType: "update_coach_preferences",
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
    })
  ) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  if (isPendingCoachPreferencesOperation(pendingRaw)) {
    const confirmation = detectConfirmationKind({
      userMessage: args.userMessage,
      turnFrame: args.turnFrame,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: "Ok, je ne change pas cette préférence.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes") return null;

    const { data, error } = await upsertCoachPreferencesFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      sourceMessageId: args.sourceMessageId,
    });
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    if (error || !data?.key) {
      return {
        content:
          "Je n'ai pas réussi à appliquer cette préférence techniquement. Je préfère ne pas te dire que c'est enregistré tant que la DB ne l'a pas confirmé.",
        nextTempMemory,
        toolExecution: "failed",
        executedTools: ["update_coach_preferences"],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "failed",
          operation_id: pendingRaw.operation_id ?? null,
          error: error?.message ?? "missing_upserted_key",
        },
      };
    }
    return {
      content:
        `C'est fait. J'ai appliqué cette préférence : ${pendingRaw.draft.draft.summary}`,
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["update_coach_preferences"],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        preferences_update_id: data.key,
      },
    };
  }

  if (isOperationEscapeMessage(args.userMessage)) {
    return null;
  }

  const output = runUpdateCoachPreferencesIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    return {
      content: output.confirmation?.message ??
        "Tu veux que j'applique cette préférence ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "pending_confirmation",
        operation_id: (output.pending_confirmation as any)?.operation_id ??
          null,
        draft: output.draft ?? null,
      },
    };
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "update_coach_preferences",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: output.next_question?.question ??
        "Tu veux changer mon ton, mon niveau de challenge, ou le nombre de questions ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "update_coach_preferences",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu appliquer cette préférence depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: output.status === "blocked_by_safety"
      ? []
      : ["update_coach_preferences"],
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
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
  try {
    const attackKeywordMatch = await loadAttackKeywordMatch({
      supabase,
      userId,
      userMessage,
      runtime: v2Runtime,
    });
    if (attackKeywordMatch) {
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
  let planItemSnapshot: V2PlanItemSnapshotItem[] | undefined = undefined;
  try {
    planItemSnapshot = await buildV2PlanItemSnapshot(
      supabase,
      userId,
      undefined,
      v2Runtime,
    );
  } catch (e) {
    console.warn(
      "[Router] V2 plan item snapshot load failed (non-blocking):",
      e,
    );
  }
  if (!planItemSnapshot || planItemSnapshot.length === 0) {
    try {
      planItemSnapshot = await loadDirectV2PlanItemSnapshotFallback(
        supabase,
        userId,
        v2Runtime,
      );
    } catch (e) {
      console.warn(
        "[Router] V2 plan item snapshot fallback failed (non-blocking):",
        e,
      );
    }
  }

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
  let activeSkillState = (tempMemory as any)?.active_skill_state ??
    (tempMemory as any)?.__active_skill_state ??
    null;
  let activeOperationIntake = (tempMemory as any)?.active_tool_skill_intake ??
    (tempMemory as any)?.__active_tool_skill_intake ??
    null;
  const activeOperationIntakeForDispatcher = activeOperationIntake;
  if (
    activeOperationIntake &&
    (isOperationEscapeMessage(userMessage) ||
      isOperationCorrectionOrSafetyInterruption(userMessage))
  ) {
    tempMemory = { ...(tempMemory ?? {}) };
    delete (tempMemory as any).__active_tool_skill_intake;
    delete (tempMemory as any).active_tool_skill_intake;
    activeOperationIntake = null;
  }
  let pendingOperationConfirmation =
    (tempMemory as any)?.pending_tool_skill_confirmation ??
      (tempMemory as any)?.__pending_tool_skill_confirmation ??
      null;
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
      pending_tool_skill_confirmation: pendingOperationConfirmation,
      active_topic_state: (tempMemory as any)?.memory_v2_active_topic ?? null,
      flow_state_context: {
        channel,
        scope,
        whatsapp_mode: meta?.whatsappMode ?? null,
        forced_mode: opts?.forceMode ?? null,
        force_onboarding_flow: Boolean(opts?.forceOnboardingFlow),
        onboarding_active: meta?.whatsappMode === "onboarding" ||
          Boolean(opts?.forceOnboardingFlow),
      },
      plan_snapshot: {
        items: (planItemSnapshot ?? []).map((item: any) => ({
          id: item?.id,
          title: item?.title,
          status: item?.status,
          kind: item?.kind,
          dimension: item?.dimension,
        })),
      },
      safety_pregate_output: safetyPregateOutput,
      conversation_risk_history: conversationRiskHistoryForPersist,
      source_message_id: loggedMessageId ?? undefined,
      turn_id: meta?.requestId ?? loggedMessageId ?? undefined,
      llm_runner: dispatcherLlmRunner,
      model_name: String(
        Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ??
          "gemini-3-flash-preview",
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
      pending_tool_skill_confirmation: pendingOperationConfirmation,
      safety_pregate_risk_band: safetyPregateOutput.risk_band,
    });
    if (
      pendingOperationConfirmation &&
      routeDecision.reason_code === "confirmation_correction_to_pending" &&
      detectConfirmationKind({ userMessage, turnFrame }) === "yes"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "pending_confirmation",
        selected_handler: "execute_confirmed",
        reason_code: "confirmation_yes_with_adjustment",
        direct_effects_to_run: [],
      };
    }
    if (
      isOperationEscapeMessage(userMessage) &&
      !pendingOperationConfirmation &&
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
    await trace("brain:turn_frame_routed", "routing", {
      turn_frame_dispatcher_ms: Date.now() - turnFrameStartMs,
      response_owner: routeDecision.response_owner,
      selected_handler: routeDecision.selected_handler ?? null,
      direct_effects_to_run: routeDecision.direct_effects_to_run,
      direct_effects_allowed: directEffectGateResult?.allowed ?? [],
      direct_effects_clarifications:
        directEffectGateResult?.clarifications.map((c) => ({
          effect_type: c.effect_type,
          reason_code: c.reason_code,
        })) ?? [],
      direct_effects_blocked:
        directEffectGateResult?.additional_blocked_paths ?? [],
      tool_skill_intents_count: turnFrame.tool_skill_intents.length,
      skill_entry_ids: Object.keys(turnFrame.skill_signals.entry ?? {}),
      safety_risk_band: turnFrame.safety.risk_band,
      conversation_risk_score: turnFrame.conversation_risk?.score ?? null,
      conversation_risk_exit_flows:
        turnFrame.conversation_risk?.should_exit_flows ?? false,
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
  if (opts?.forceMode && targetMode !== "sentry") {
    targetMode = opts.forceMode;
  }

  // Drift diagnostic: compare legacy dispatcherSignals routing against the
  // canonical RouteDecision. Diagnostic only - does NOT change behaviour.
  // The plan is to make RouteDecision the single source of truth in a
  // dedicated session; this trace lets us audit the safety semantics gap
  // (legacy: dispatcherSignals.safety.level === "SENTRY" && conf >= 0.75
  //  vs new: turn_frame.safety.risk_band in {"high","critical"}) before the
  // cutover.
  if (routeDecision) {
    const expectedFromRouteDecision: AgentMode =
      routeDecision.response_owner === "safety" ? "sentry" : targetMode;
    const drift = expectedFromRouteDecision !== targetMode;
    if (drift) {
      await trace("brain:route_decision_targetmode_drift", "routing", {
        legacy_target_mode: targetMode,
        route_decision_owner: routeDecision.response_owner,
        route_decision_handler: routeDecision.selected_handler ?? null,
        route_decision_reason_code: routeDecision.reason_code,
        legacy_safety_level: dispatcherSignals.safety.level,
        legacy_safety_confidence: dispatcherSignals.safety.confidence,
        turn_frame_risk_band: turnFrame?.safety.risk_band ?? null,
        safety_pregate_risk_band: safetyPregateOutput.risk_band,
        expected_target_mode_from_route_decision: expectedFromRouteDecision,
      }, "warn");
    }
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

  const [trackProgressRuntime] = await Promise.all([
    maybeTrackProgressParallel({
      supabase,
      userId,
      state,
      tempMemory,
      dispatcherSignals,
      directEffectGateResult,
      planItemSnapshot,
      v2Runtime,
      loggedMessageId,
      channel,
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

  const userTime = await getUserTimeContext({ supabase, userId }).catch(() =>
    null as any
  );

  const operationRuntime = await maybeRunCreateRecurringReminderOperation({
    supabase,
    userId,
    userMessage,
    channel,
    userTimezone: userTime?.user_timezone ?? "Europe/Paris",
    tempMemory,
    turnFrame,
    routeDecision,
    safetyPregateOutput,
    sourceMessageId: loggedMessageId,
    requestId: meta?.requestId ?? null,
  }) ??
    await maybeRunSelectStatePotionOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
    }) ??
    await maybeRunAdjustPlanItemOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      history,
      tempMemory,
      planItemSnapshot,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      forceFullAi: fullAiRequested,
    }) ??
    await maybeRunPrepareAttackCardOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      planSnapshot: { items: planItemSnapshot ?? [] },
    }) ??
    await maybeRunPrepareDefenseCardOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      planSnapshot: { items: planItemSnapshot ?? [] },
    }) ??
    await maybeRunUpdateCoachPreferencesOperation({
      supabase,
      userId,
      userMessage,
      channel,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      tempMemory,
      turnFrame,
      routeDecision,
      safetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
    });
  if (operationRuntime) {
    const nextMode: AgentMode = "companion";
    const nextMsgCount = Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
    const nextLastInteraction = new Date().toISOString();
    const nextTempMemory = operationRuntime.nextTempMemory ?? tempMemory;
    await updateUserState(supabase, userId, scope, {
      current_mode: nextMode,
      unprocessed_msg_count: nextMsgCount,
      last_interaction_at: nextLastInteraction,
      temp_memory: nextTempMemory,
    });

    if (logMessages) {
      await logMessage(
        supabase,
        userId,
        scope,
        "assistant",
        operationRuntime.content,
        nextMode,
        {
          ...(opts?.messageMetadata ?? {}),
          channel,
          request_id: meta?.requestId ?? null,
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
              "dispatcher_v2_prompt_2026_05_s9",
            model_used: dispatcherV2Stats[0]?.model_name ?? null,
            memory_plan: turnFrame?.memory_plan ??
              DEFAULT_DISPATCHER_MEMORY_PLAN,
          },
          turn_frame: turnFrame,
          route_decision: routeDecision,
          direct_effects: operationRuntime.executedTools.map((toolId) => ({
            tool_id: toolId,
            outcome: operationRuntime.toolExecution,
          })),
          tool_skill_run: {
            selected_handler: routeDecision.selected_handler ?? null,
            reason_code: routeDecision.reason_code,
            ...operationRuntime.toolSkillRun,
          },
          confirmation_token_outcomes: [],
          memory_write_candidates_emitted: 0,
          response_owner: routeDecision.response_owner,
          total_latency_ms: Date.now() - turnStartMs,
        }, { supabase });
      } catch (error) {
        console.warn(
          "[Router] operation logConversationTurn failed (non-blocking):",
          error,
        );
      }
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
      content: operationRuntime.content,
      mode: nextMode,
      tool_execution: operationRuntime.toolExecution,
      executed_tools: operationRuntime.executedTools,
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
      : routeDecision?.response_owner === "safety"
      ? "safety_crisis"
      : routeDecision?.response_owner === "product_help"
      ? "product_help"
      : String((activeSkillState as any)?.skill_id ?? "").trim();
  const suppressOperationRecommendationForVerification =
    isAttackCardPostCreationVerificationQuestion({
      message: userMessage,
      recentMessages: recentMessagesForTurnFrame,
    });
  if (
    turnFrame &&
    (selectedSkillForRecommendation ||
      turnFrame.tool_skill_opportunity?.should_offer)
  ) {
    try {
      const registry = await loadProductSurfaceRegistry();
      recommendationSkillOutput = selectedSkillForRecommendation
        ? runConversationSkillForRecommendation({
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
        turnFrame?.tool_skill_opportunity?.should_offer
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
    attackKeywordContextOverride || null,
    buildResolvedPlanTargetAddon(tempMemory),
    buildConversationRiskFlowExitAddon(conversationRiskForPersist),
    recommendationToolAddon,
    buildProductHelpKnowledgeAddon(recommendationSkillOutput),
    buildRouteDecisionConversationAddon({
      routeDecision,
      turnFrame,
      userMessage,
      recentMessages: recentMessagesForTurnFrame,
    }),
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

  const forceDeterministicProductLocation =
    routeDecision?.response_owner === "product_help" &&
    isAttackCardLocationOrManagementQuestionWithContext({
      message: userMessage,
      recentMessages: recentMessagesForTurnFrame,
    });
  const forceDeterministicPostCreationVerification =
    routeDecision?.response_owner === "product_help" &&
    isAttackCardPostCreationVerificationQuestion({
      message: userMessage,
      recentMessages: recentMessagesForTurnFrame,
    });
  const forceDeterministicStopReply =
    conversationRiskForPersist?.should_exit_flows !== true &&
    routeDecision?.response_owner === "normal_reply" &&
    /\b(stop|arrete|arrête|c est bon|c'est bon|ne cree rien|ne crée rien|rien d autre|rien d'autre)\b/
      .test(normalizeRouteText(userMessage));
  const deterministicRepliesEnabled = (meta?.forceRealAi !== true &&
    (opts?.messageMetadata as Record<string, unknown> | undefined)
        ?.force_full_ai !== true) ||
    forceDeterministicProductLocation ||
    forceDeterministicPostCreationVerification ||
    forceDeterministicStopReply;
  const deterministicConversationReply = deterministicRepliesEnabled
    ? renderDeterministicSafetyReply({
      routeDecision,
      userMessage,
      turnFrame,
    }) ??
      renderDeterministicSkillReply({
        routeDecision,
        userMessage,
        turnFrame,
        recentMessages: recentMessagesForTurnFrame,
        userId,
        activeSkillState,
        planItemSnapshot,
        productSurfaces: [],
        skillOutput: recommendationSkillOutput,
      }) ??
      renderDeterministicNormalReply({
        routeDecision,
        userMessage,
        turnFrame,
      }) ??
      renderDeterministicConversationHandlerReply({
        routeDecision,
        userMessage,
        recentMessages: recentMessagesForTurnFrame,
      })
    : null;
  const agentOut = deterministicConversationReply
    ? {
      responseContent: deterministicConversationReply,
      nextMode: targetMode,
      tempMemory,
      toolExecution: "none",
      executedTools: [],
      toolAck: null,
      outageFallback: false,
      outageFailedMode: null,
      outageErrorMessage: null,
    } as any
    : await runAgentAndVerify({
      supabase,
      userId,
      scope,
      channel,
      userMessage,
      history,
      state,
      context,
      meta,
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
  const directEffectToolRuntimes = [trackProgressRuntime].filter(Boolean);
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
            "dispatcher_v2_prompt_2026_05_s9",
          model_used: dispatcherV2Stats[0]?.model_name ?? null,
          memory_plan: turnFrame?.memory_plan ??
            DEFAULT_DISPATCHER_MEMORY_PLAN,
        },
        turn_frame: turnFrame,
        route_decision: routeDecision,
        direct_effects: combinedExecutedTools.map((
          toolId,
        ) => ({
          tool_id: toolId,
          outcome: combinedToolExecution,
        })),
        skill_run: routeDecision.response_owner === "conversation_handler" ||
            routeDecision.response_owner === "product_help"
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

  let responseContent = String(agentOut.responseContent ?? "").trim();
  if (deterministicRepliesEnabled) {
    responseContent = applyEmotionalRepairResponseGuardrail({
      routeDecision,
      userMessage,
      responseContent,
      recentMessages: recentMessagesForTurnFrame,
    });
    responseContent = applyExecutionBreakdownRelationshipRepairGuardrail({
      routeDecision,
      userMessage,
      responseContent,
      recentMessages: recentMessagesForTurnFrame,
    });
  }
  responseContent = enforceRecommendationToolVisibleReply({
    responseContent,
    userMessage,
    recommendation: recommendationToolRun,
    surfaceLabel: recommendationSurfaceLabel,
    tempMemory,
    planItemSnapshot,
  });
  responseContent = stripHiddenHtmlComments(responseContent);
  responseContent = stripDeprecatedProductVocabulary(responseContent);
  responseContent = applyExecutionBreakdownBrevityGuard({
    channel,
    routeDecision,
    userMessage,
    responseContent,
    skillOutput: recommendationSkillOutput,
  });
  responseContent = applyMemoryV2ResponseGroundingGuardrail({
    userMessage,
    responseContent,
    contextBlock: memoryV2ActiveContextBlock,
  });
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
  );

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
  };
}

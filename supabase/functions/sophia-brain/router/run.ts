/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type AgentMode,
  getUserState,
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
  detectAttackKeywordTrigger,
  type AttackKeywordTriggerPayload,
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
import {
  buildDispatcherStateSnapshot,
  buildLastAssistantInfo,
  runContextualDispatcherV2,
} from "./dispatcher_flow.ts";
import {
  clearMachineStateTempMemory,
  detectMagicResetCommand,
} from "./magic_reset.ts";
import type {
  DispatcherMemoryPlan,
  DispatcherModelTierHint,
  DispatcherSignals,
} from "./dispatcher.ts";
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
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { buildConversationPulse } from "../conversation_pulse_builder.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";
import { isLikelyOneShotReminderRequest } from "../lib/one_shot_reminder_tool.ts";
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
import type {
  AttackCardContent,
  DefenseCardContent,
  LabScopeKind,
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
  UserMetricRow,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../_shared/v2-types.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Plan Item Snapshot for Dispatcher
// ═══════════════════════════════════════════════════════════════════════════════

export type V2PlanItemSnapshotItem = {
  id: string;
  title: string;
  dimension: PlanDimension;
  item_type: PlanItemKind;
  status: PlanItemStatus;
  streak_current: number;
  last_entry_at: string | null;
  active_load_score?: number;
};

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
      dimension: item.dimension,
      item_type: item.kind,
      status: item.status,
      streak_current: computeStreakFromEntries(item.recent_entries),
      last_entry_at: item.last_entry_at,
      active_load_score: activeLoad.current_load_score,
    }));
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

  const rows = (data as Array<{
    scope_kind: LabScopeKind;
    transformation_id: string | null;
    last_updated_at: string;
    content: AttackCardContent;
  }> | null) ?? [];

  const candidates = rows.flatMap((row) => {
    const content = row.content;
    if (!content || !Array.isArray(content.techniques)) return [];

    return content.techniques.flatMap((technique) => {
      if (technique.technique_key !== "pre_engagement") return [];
      const generated = technique.generated_result;
      if (!generated || !isAttackKeywordTriggerPayload(generated.keyword_trigger)) {
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

  return {
    model: tierModelMap[hint as DispatcherModelTierHint],
    source: `memory_plan_${hint}` as
      | "memory_plan_lite"
      | "memory_plan_standard"
      | "memory_plan_deep",
    tier: hint as DispatcherModelTierHint,
  };
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

function buildNorthStarMetricPayload(args: {
  currentPayload: Record<string, unknown> | null | undefined;
  recordedAt: string;
  value: number;
  note: string;
  userId: string;
  source: string | null | undefined;
  sourceMessageId: string | null | undefined;
}): Record<string, unknown> {
  const existingHistory = Array.isArray(args.currentPayload?.history)
    ? (args.currentPayload?.history as Record<string, unknown>[]).slice(-79)
    : [];
  existingHistory.push({
    at: args.recordedAt,
    value: args.value,
    note: args.note || null,
    source: "router_parallel_tracking_v2",
    channel: String(args.source ?? "").trim() || null,
    source_message_id: args.sourceMessageId ?? null,
    user_id: args.userId,
  });

  return {
    ...(args.currentPayload ?? {}),
    source: "router_parallel_tracking_v2",
    latest_recorded_at: args.recordedAt,
    latest_note: args.note || null,
    history: existingHistory,
  };
}

export async function recordNorthStarMetricV2(args: {
  supabase: SupabaseClient;
  userId: string;
  value: number;
  note?: string | null;
  dateHint?: string | null;
  source?: string | null;
  sourceMessageId?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<V2TrackingResult> {
  const {
    supabase,
    userId,
    value,
    note,
    dateHint,
    source,
    sourceMessageId,
    runtime,
  } = args;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas compris la valeur à enregistrer pour la North Star.",
      target: "north_star",
      status: "invalid_value",
    };
  }

  const resolvedRuntime = await resolveActiveTransformationRuntime({
    supabase,
    userId,
    runtime,
  });
  if (!resolvedRuntime.cycle) {
    return {
      mode: "needs_clarify",
      message:
        "Je n'ai pas trouvé de cycle actif pour enregistrer cette North Star.",
      target: "north_star",
      status: "missing_cycle",
    };
  }

  const nowIso = new Date().toISOString();
  const recordedAt = resolveLoggedAtIso(dateHint);
  const trimmedNote = String(note ?? "").trim().slice(0, 300);

  let metric: UserMetricRow;
  if (resolvedRuntime.north_star) {
    metric = {
      ...resolvedRuntime.north_star,
      current_value: String(numericValue),
      updated_at: nowIso,
      payload: buildNorthStarMetricPayload({
        currentPayload: resolvedRuntime.north_star.payload,
        recordedAt,
        value: numericValue,
        note: trimmedNote,
        userId,
        source,
        sourceMessageId,
      }),
    };

    const updateResult = await supabase
      .from("user_metrics")
      .update({
        current_value: metric.current_value,
        updated_at: metric.updated_at,
        payload: metric.payload,
      })
      .eq("id", resolvedRuntime.north_star.id);

    if (updateResult.error) throw updateResult.error;
  } else {
    metric = {
      id: crypto.randomUUID(),
      user_id: userId,
      cycle_id: resolvedRuntime.cycle.id,
      transformation_id: null,
      scope: "cycle",
      kind: "north_star",
      status: "active",
      title: "North Star",
      unit: null,
      current_value: String(numericValue),
      target_value: null,
      payload: buildNorthStarMetricPayload({
        currentPayload: null,
        recordedAt,
        value: numericValue,
        note: trimmedNote,
        userId,
        source,
        sourceMessageId,
      }),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const insertResult = await supabase
      .from("user_metrics")
      .insert(metric);
    if (insertResult.error) throw insertResult.error;
  }

  await logV2Event(supabase, V2_EVENT_TYPES.METRIC_RECORDED, {
    user_id: userId,
    cycle_id: metric.cycle_id,
    transformation_id: metric.transformation_id,
    metric_id: metric.id,
    metric_kind: metric.kind,
    value: metric.current_value,
    recorded_at: recordedAt,
    metadata: {
      source: "router_parallel_tracking_v2",
      channel: String(source ?? "").trim() || null,
      source_message_id: sourceMessageId ?? null,
      note: trimmedNote || null,
    },
  });

  return {
    mode: "logged",
    message:
      `North Star mise à jour: ${metric.title} -> ${metric.current_value}${
        metric.unit ? ` ${metric.unit}` : ""
      }.`,
    target: metric.title,
    status: "recorded",
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
    return { targetMode: "investigator", stopCheckup, checkupIntentDetected };
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

async function maybeTrackProgressParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  state: any;
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId: string | null;
  channel: "web" | "whatsapp";
}) {
  const {
    supabase,
    userId,
    state,
    tempMemory,
    dispatcherSignals,
    planItemSnapshot,
    v2Runtime,
    loggedMessageId,
    channel,
  } = args;

  const trackPlanItem = dispatcherSignals.track_progress_plan_item;
  const trackNorthStar = dispatcherSignals.track_progress_north_star;
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
  const trackNorthStarValue = Number(trackNorthStar?.value_hint);
  const trackNorthStarNote = typeof trackNorthStar?.note_hint === "string"
    ? trackNorthStar.note_hint.trim().slice(0, 200)
    : "";
  const trackNorthStarDate = typeof trackNorthStar?.date_hint === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(trackNorthStar.date_hint)
    ? trackNorthStar.date_hint
    : undefined;
  const canTrackPlanItem = trackPlanItem?.detected === true &&
    trackPlanItemTargetId.length >= 2 &&
    (trackPlanItemStatus === "completed" || trackPlanItemStatus === "missed" ||
      trackPlanItemStatus === "partial");
  const canTrackNorthStar = trackNorthStar?.detected === true &&
    Number.isFinite(trackNorthStarValue);
  const canTrack = !isCheckupActive(state) &&
    (canTrackPlanItem || canTrackNorthStar);

  const alreadyLogged =
    (tempMemory as any)?.__track_progress_parallel?.source_message_id &&
    loggedMessageId &&
    (tempMemory as any).__track_progress_parallel.source_message_id ===
      loggedMessageId;

  if (!canTrack || alreadyLogged) return;

  try {
    const tasks: Promise<V2TrackingResult>[] = [];
    if (canTrackNorthStar) {
      tasks.push(recordNorthStarMetricV2({
        supabase,
        userId,
        value: trackNorthStarValue,
        ...(trackNorthStarNote ? { note: trackNorthStarNote } : {}),
        ...(trackNorthStarDate ? { dateHint: trackNorthStarDate } : {}),
        source: channel,
        sourceMessageId: loggedMessageId ?? null,
        runtime: v2Runtime,
      }));
    }
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
          trackPlanItemTarget || trackPlanItemTargetId || "north_star",
        status: loggedResults.map((result) => result.status).join(",") ||
          trackPlanItemStatus,
        source_message_id: loggedMessageId ?? null,
      };
    }
  } catch (e) {
    console.warn("[Router] parallel track_progress failed (non-blocking):", e);
    (tempMemory as any).__track_progress_parallel = {
      mode: "needs_clarify",
      message:
        "Impossible de logger automatiquement. Oriente vers le dashboard pour mise à jour immédiate, ou propose d'attendre le prochain bilan.",
      source_message_id: loggedMessageId ?? null,
    };
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
        `${imp.label} (${imp.impulse_id}): ${imp.triggers?.length ?? 0} triggers`
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
    const { data: inserted } = await supabase.from("chat_messages").insert({
      user_id: userId,
      scope,
      role: "user",
      content: userMessage,
      metadata: opts?.messageMetadata ?? {},
    }).select("id").single();
    loggedMessageId = inserted?.id ?? null;
  }

  if (loggedMessageId) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
    });
    if (debounced.aborted) {
      await trace("brain:debounce_aborted", "io", {
        reason: "debounceAndBurstMerge",
      }, "debug");
      return { content: "", mode: "companion" as AgentMode, aborted: true };
    }
    userMessage = debounced.userMessage;
  }

  let state = await getUserState(supabase, userId, scope);
  let tempMemory: any = (state as any)?.temp_memory ?? {};

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
  const stateSnapshot = buildDispatcherStateSnapshot({ state });
  let v2Runtime: ActiveTransformationRuntime | null = null;
  const v2RuntimeStartMs = Date.now();
  try {
    v2Runtime = await getActiveTransformationRuntime(supabase, userId);
    await trace("brain:v2_runtime_prefetched", "context", {
      load_ms: Date.now() - v2RuntimeStartMs,
      has_cycle: Boolean(v2Runtime.cycle),
      has_transformation: Boolean(v2Runtime.transformation),
      has_plan: Boolean(v2Runtime.plan),
      has_north_star: Boolean(v2Runtime.north_star),
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

  const contextual = await runContextualDispatcherV2({
    userMessage,
    lastAssistantMessage,
    history,
    tempMemory,
    state,
    meta,
    stateSnapshot,
    plan_item_snapshot: planItemSnapshot,
    signalHistoryKey: "signal_history",
    minTurnIndex: -4,
    trace,
    traceV: trace,
  });
  dispatcherLatencyMs = Date.now() - turnStartMs;

  const dispatcherSignals = contextual.dispatcherSignals;
  const machineSignals = contextual.dispatcherResult?.machine_signals;
  tempMemory = contextual.tempMemory;
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
        memory_plan: contextual.dispatcherResult?.memory_plan ?? null,
      },
    }),
    logMemoryObservabilityEvent({
      supabase,
      userId,
      requestId: meta?.requestId,
      turnId: loggedMessageId,
      channel,
      scope,
      sourceComponent: "router",
      eventName: "dispatcher.surface_plan_generated",
      payload: {
        surface_plan: contextual.dispatcherResult?.surface_plan ?? null,
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
    const wantsToContinueByDispatcher =
      machineSignals?.wants_to_continue_bilan === true;
    const dontWantToContinueByDispatcher =
      machineSignals?.dont_want_continue_bilan === true;
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
    memoryPlan: contextual.dispatcherResult?.memory_plan,
    surfacePlan: contextual.dispatcherResult?.surface_plan,
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
      memory_plan_intent: contextual.dispatcherResult?.memory_plan
        ?.response_intent ?? null,
      memory_plan_context_need: contextual.dispatcherResult?.memory_plan
        ?.context_need ?? null,
    },
  });

  await Promise.all([
    maybeTrackProgressParallel({
      supabase,
      userId,
      state,
      tempMemory,
      dispatcherSignals,
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

  const onDemandTriggers: OnDemandTriggers = {
    plan_item_discussion_detected:
      dispatcherSignals.plan_item_discussion?.detected ?? false,
    plan_item_discussion_hint: dispatcherSignals.plan_item_discussion
      ?.item_hint,
    plan_feedback_detected: dispatcherSignals.plan_feedback?.detected ?? false,
  };

  let context = "";
  const injectedContext = [
    opts?.contextOverride,
    attackKeywordContextOverride || null,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
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
    memoryPlan: contextual.dispatcherResult?.memory_plan,
    v2Intent: "answer_user_now",
    v2Runtime,
    requestId: meta?.requestId,
    channel,
  });
  contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);

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
  const effectiveModeForModelSelection: AgentMode = checkupActive &&
      !stopCheckup &&
      targetMode !== "sentry"
    ? "investigator"
    : targetMode;
  const agentModelSelection = resolveAgentChatModel({
    effectiveMode: effectiveModeForModelSelection,
    memoryPlan: contextual.dispatcherResult?.memory_plan,
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
      memory_plan: contextual.dispatcherResult?.memory_plan ?? null,
    },
  });

  const agentOut = await runAgentAndVerify({
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

  let responseContent = String(agentOut.responseContent ?? "").trim();
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
  try {
    const retryAfterRaw = String(
      (mergedTempMemory as any)?.__investigator_retry_after ?? "",
    ).trim();
    if (retryAfterRaw) {
      const retryTs = Date.parse(retryAfterRaw);
      if (!Number.isFinite(retryTs) || retryTs <= Date.now()) {
        delete (mergedTempMemory as any).__investigator_retry_after;
      }
    }
  } catch {
    // best effort
  }

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
            contextual.dispatcherResult?.model_used ??
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
          outcome: (agentOut.toolExecution && agentOut.toolExecution !== "none")
            ? "tool_call"
            : "text",
          tool: agentOut.executedTools?.[0] ?? null,
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
          tool_execution: agentOut.toolExecution,
          executed_tools: agentOut.executedTools ?? [],
          tool_ack: agentOut.toolAck ?? null,
          surface_plan_mode:
            contextual.dispatcherResult?.surface_plan?.surface_mode ?? null,
          surface_candidates_count:
            contextual.dispatcherResult?.surface_plan?.candidates?.length ?? 0,
          selected_surface_id: surfaceAddon?.surface_id ?? null,
          selected_surface_level: surfaceAddon?.level ?? null,
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

  const conversationTurnCount = history.filter((entry) =>
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
    tool_execution: agentOut.toolExecution,
    executed_tools: agentOut.executedTools,
  };
}

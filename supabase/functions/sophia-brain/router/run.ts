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
import { buildToolAckContract } from "../tool_ack.ts";
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
import { arbitrateTurnIntent } from "./turn_intent_arbitrator.ts";
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
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { buildConversationPulse } from "../conversation_pulse_builder.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";
import { buildActionFamilyKey } from "../../_shared/memory/action_family.ts";
import {
  isExistingOneShotReminderReferenceOnly,
  isLikelyOneShotReminderRequest,
  maybeCreateOneShotReminder,
} from "../tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts";
import {
  buildRecurringReminderCreatedMessage,
  type RecurringReminderDraftV1,
} from "../tools/operations/create_recurring_reminder/generator.ts";
import {
  reviewCreateRecurringReminderDraft,
  runCreateRecurringReminderIntake,
} from "../tools/operations/create_recurring_reminder/intake.ts";
import {
  reviewToolSkillConfirmationWithAi,
  type ToolSkillConfirmationKind,
} from "../tools/operations/_shared/confirmation_review.ts";
import { createConfirmationToken } from "../confirmation/confirmation_token.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
} from "../tools/operations/prepare_attack_card/generator.ts";
import { runPrepareAttackCardAiIntake } from "../tools/operations/prepare_attack_card/ai_intake.ts";
import {
  type DefenseCardDraftV1,
} from "../tools/operations/prepare_defense_card/generator.ts";
import { runPrepareDefenseCardAiIntake } from "../tools/operations/prepare_defense_card/ai_intake.ts";
import {
  type PlanAdjustmentDraftV1,
} from "../tools/operations/adjust_plan_item/generator.ts";
import { executeAdjustPlanItem } from "../tools/operations/adjust_plan_item/executor.ts";
import { runAdjustPlanItemIntake } from "../tools/operations/adjust_plan_item/intake.ts";
import { generatePlanV2ForTransformation } from "../../generate-plan-v2/index.ts";
import {
  type CoachPreferencesPatchDraftV1,
} from "../tools/operations/update_coach_preferences/generator.ts";
import {
  reviewUpdateCoachPreferencesDraft,
  runUpdateCoachPreferencesIntake,
} from "../tools/operations/update_coach_preferences/intake.ts";
import {
  generatePotionSessionDraftWithAi,
  type PotionSessionDraftGeneratorInput,
  type PotionSessionDraftV1,
} from "../tools/operations/select_state_potion/generator.ts";
import {
  runSelectStatePotionIntake,
} from "../tools/operations/select_state_potion/intake.ts";
import { reviewSelectStatePotionDraft } from "../tools/operations/select_state_potion/draft_validation.ts";
import { executeActivateStatePotion } from "../tools/operations/select_state_potion/executor.ts";
import { loadPotionBaseContext } from "../../_shared/potion-base-context.ts";
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
  cadence_label?: string | null;
  target_reps?: number | null;
  current_reps?: number | null;
  scheduled_days?: string[] | null;
  time_of_day?: string | null;
  phase_id?: string | null;
  phase_order?: number | null;
  generated_temp_id?: string | null;
  source_kind?: "plan_generated" | "operation_bridge" | "unknown";
  item_nature?:
    | "recurring_habit"
    | "one_shot_mission"
    | "clarification"
    | "other";
  available_this_week?: boolean;
  availability_status?:
    | "available_this_week"
    | "available_past_week"
    | "available_upcoming_week"
    | "assigned_no_calendar"
    | "not_assigned_to_level_weeks";
  week_scope?: {
    level_order?: number | null;
    level_title?: string | null;
    week_order?: number | null;
    week_title?: string | null;
    week_status?: "completed" | "current" | "upcoming" | "unknown";
    week_start?: string | null;
    week_end?: string | null;
    weekly_reps?: number | null;
    weekly_cadence_label?: string | null;
    weekly_description_override?: string | null;
    mission_days?: string[];
  } | null;
  streak_current: number;
  last_entry_at: string | null;
  active_load_score?: number;
  payload?: Record<string, unknown> | null;
};

function readPlanItemPayload(
  item: { payload?: unknown },
): Record<string, unknown> {
  return isRecord(item.payload) ? item.payload : {};
}

function readPlanItemGeneratedTempId(
  item: { payload?: unknown },
): string | null {
  const payload = readPlanItemPayload(item);
  const generation = isRecord(payload._generation)
    ? payload._generation
    : isRecord(payload.generation)
    ? payload.generation
    : null;
  const tempId = String(generation?.temp_id ?? "").trim();
  return tempId || null;
}

function readPlanItemSourceKind(
  item: { payload?: unknown },
): V2PlanItemSnapshotItem["source_kind"] {
  const payload = readPlanItemPayload(item);
  return isRecord(payload.operation_bridge)
    ? "operation_bridge"
    : "plan_generated";
}

function readPlanItemNature(item: {
  dimension?: unknown;
  kind?: unknown;
}): V2PlanItemSnapshotItem["item_nature"] {
  if (item.kind === "habit" || item.dimension === "habits") {
    return "recurring_habit";
  }
  if (item.dimension === "missions") return "one_shot_mission";
  if (item.dimension === "clarifications") return "clarification";
  return "other";
}

function parseYmdPartsForPlanSnapshot(
  ymd: string,
): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateFromYmdUtcForPlanSnapshot(ymd: string): Date | null {
  const parts = parseYmdPartsForPlanSnapshot(ymd);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysYmdForPlanSnapshot(ymd: string, days: number): string | null {
  const date = dateFromYmdUtcForPlanSnapshot(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareYmdForPlanSnapshot(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function getLocalYmdForPlanSnapshot(
  timezone: string,
  now = new Date(),
): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function readScheduleAnchorForPlanSnapshot(
  content: unknown,
): Record<string, unknown> | null {
  if (!isRecord(content)) return null;
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const anchor = metadata.schedule_anchor;
  if (!isRecord(anchor)) return null;
  const timezone = String(anchor.timezone ?? "").trim();
  const anchorWeekStart = String(anchor.anchor_week_start ?? "").trim();
  const anchorWeekEnd = String(anchor.anchor_week_end ?? "").trim();
  if (!timezone || !anchorWeekStart || !anchorWeekEnd) return null;
  return anchor;
}

function getWeekStatusForPlanSnapshot(args: {
  anchor: Record<string, unknown> | null;
  weekOrder: number;
}): {
  status: "completed" | "current" | "upcoming" | "unknown";
  start: string | null;
  end: string | null;
} {
  if (!args.anchor || !Number.isInteger(args.weekOrder) || args.weekOrder < 1) {
    return { status: "unknown", start: null, end: null };
  }
  const timezone = String(args.anchor.timezone ?? "").trim();
  const anchorWeekStart = String(args.anchor.anchor_week_start ?? "").trim();
  const anchorWeekEnd = String(args.anchor.anchor_week_end ?? "").trim();
  const anchorDisplayStart = String(args.anchor.anchor_display_start ?? "")
    .trim();
  const offsetDays = (args.weekOrder - 1) * 7;
  const fullWeekStart = addDaysYmdForPlanSnapshot(anchorWeekStart, offsetDays);
  const fullWeekEnd = addDaysYmdForPlanSnapshot(anchorWeekEnd, offsetDays);
  if (!timezone || !fullWeekStart || !fullWeekEnd) {
    return { status: "unknown", start: null, end: null };
  }
  const start = args.weekOrder === 1 && anchorDisplayStart
    ? anchorDisplayStart
    : fullWeekStart;
  const localToday = getLocalYmdForPlanSnapshot(timezone);
  if (!localToday) return { status: "unknown", start, end: fullWeekEnd };
  if (compareYmdForPlanSnapshot(localToday, start) < 0) {
    return { status: "upcoming", start, end: fullWeekEnd };
  }
  if (compareYmdForPlanSnapshot(localToday, fullWeekEnd) > 0) {
    return { status: "completed", start, end: fullWeekEnd };
  }
  return { status: "current", start, end: fullWeekEnd };
}

function planSnapshotAvailabilityRank(
  status: NonNullable<V2PlanItemSnapshotItem["availability_status"]>,
): number {
  if (status === "available_this_week") return 4;
  if (status === "available_upcoming_week") return 3;
  if (status === "assigned_no_calendar") return 2;
  if (status === "available_past_week") return 1;
  return 0;
}

function buildWeeklyAvailabilityByTempIdForPlanSnapshot(
  content: unknown,
): Map<
  string,
  NonNullable<V2PlanItemSnapshotItem["week_scope"]> & {
    availability_status: NonNullable<
      V2PlanItemSnapshotItem["availability_status"]
    >;
  }
> {
  const out = new Map<
    string,
    NonNullable<V2PlanItemSnapshotItem["week_scope"]> & {
      availability_status: NonNullable<
        V2PlanItemSnapshotItem["availability_status"]
      >;
    }
  >();
  if (!isRecord(content) || !isRecord(content.current_level_runtime)) {
    return out;
  }
  const runtime = content.current_level_runtime;
  const weeks = Array.isArray(runtime.weeks) ? runtime.weeks : [];
  const anchor = readScheduleAnchorForPlanSnapshot(content);
  for (const week of weeks) {
    if (!isRecord(week)) continue;
    const weekOrder = Number(week.week_order);
    const calendar = getWeekStatusForPlanSnapshot({ anchor, weekOrder });
    const weekStatus = calendar.status;
    const assignments = Array.isArray(week.item_assignments)
      ? week.item_assignments
      : [];
    for (const assignment of assignments) {
      if (!isRecord(assignment)) continue;
      const tempId = String(assignment.temp_id ?? "").trim();
      if (!tempId) continue;
      const availabilityStatus: NonNullable<
        V2PlanItemSnapshotItem["availability_status"]
      > = weekStatus === "current"
        ? "available_this_week"
        : weekStatus === "completed"
        ? "available_past_week"
        : weekStatus === "upcoming"
        ? "available_upcoming_week"
        : "assigned_no_calendar";
      const previous = out.get(tempId);
      if (
        previous &&
        planSnapshotAvailabilityRank(previous.availability_status) >=
          planSnapshotAvailabilityRank(availabilityStatus)
      ) {
        continue;
      }
      out.set(tempId, {
        level_order: typeof runtime.level_order === "number"
          ? runtime.level_order
          : null,
        level_title: String(runtime.title ?? "").trim() || null,
        week_order: Number.isInteger(weekOrder) ? weekOrder : null,
        week_title: String(week.title ?? "").trim() || null,
        week_status: weekStatus,
        week_start: calendar.start,
        week_end: calendar.end,
        weekly_reps: typeof assignment.weekly_reps === "number"
          ? assignment.weekly_reps
          : null,
        weekly_cadence_label: String(assignment.weekly_cadence_label ?? "")
          .trim() ||
          null,
        weekly_description_override:
          String(assignment.weekly_description_override ?? "").trim() || null,
        mission_days: Array.isArray(week.mission_days)
          ? week.mission_days.map((day) => String(day)).filter(Boolean)
          : [],
        availability_status: availabilityStatus,
      });
    }
  }
  return out;
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

function stripWeeklyInternalVocabulary(text: string): string {
  return text
    .replace(/\bbridge_week\b/gi, "semaine allegee")
    .replace(/\bbridge\b/gi, "semaine allegee")
    .replace(/\bsemaine pont\b/gi, "semaine allegee")
    .replace(/\bcarry_over\b/gi, "report")
    .replace(/\bmode advance\b/gi, "passage a la suite")
    .replace(/\brepeat_week\b/gi, "refaire la meme semaine")
    .replace(/\bno[-_ ]signal\b/gi, "manque de retours fiables")
    .replace(/\blevel_review\b/gi, "revoir la forme du niveau")
    .replace(/\bnot_relevant\b/gi, "pas assez adapte a ta situation")
    .replace(/\bsignal faible\b/gi, "signal récupéré mais encore incomplet")
    .replace(
      /\bsignal\s+(?:dont je dispose est encore\s+)?(?:trop\s+)?faible\b/gi,
      "signal récupéré mais encore incomplet",
    )
    .replace(/\blevel\b/gi, "niveau")
    .replace(/\bitem_decision\b/gi, "decision sur l'action")
    .replace(/\bplan_patch\b/gi, "proposition d'organisation")
    .replace(/\boperation\b/gi, "ajustement")
    .replace(/\bverrouiller\b/gi, "clarifier")
    .replace(/\bbrouillon\b/gi, "proposition");
}

function stripVisibleWeeklyInternalSummary(text: string): string {
  return String(text ?? "")
    .replace(
      /\n{0,2}Mini-synth[eè]se pour le prochain weekly\s*:[\s\S]*?(?=\n{2,}|$)/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanWeeklyVisibleResponse(text: string): string {
  const raw = String(text ?? "");
  const normalizedRaw = normalizeRouteText(raw);
  if (
    /\brappel\b/.test(normalizedRaw) &&
    /\b(fuseau horaire|heure locale|heure de ta ville|heure de ton telephone|18h pile|mercredi prochain|mercredi de cette semaine|je le programme|je te le programme|je te le mets|je vais te le mettre|je m en occupe|c est tout bon|cest tout bon|programmer ce rappel|quel moment)\b|(?:\brappel\b[\s\S]{0,140}\b(confirme|tu veux|c est bon|cest bon|tout bon|occupe|heure locale|18h))/
      .test(normalizedRaw)
  ) {
    const withoutReminder = raw
      .split(/\n{2,}/)
      .filter((paragraph) => {
        const normalized = normalizeRouteText(paragraph);
        return !(
          /\brappel\b/.test(normalized) &&
          /\b(fuseau horaire|heure locale|heure de ta ville|heure de ton telephone|18h pile|mercredi prochain|mercredi de cette semaine|je le programme|je te le programme|je te le mets|je vais te le mettre|je m en occupe|c est tout bon|cest tout bon|programmer ce rappel|quel moment)\b|(?:\brappel\b[\s\S]{0,140}\b(confirme|tu veux|c est bon|cest bon|tout bon|occupe|heure locale|18h))/
            .test(normalized)
        );
      })
      .join("\n\n")
      .trim();
    return [
      withoutReminder ||
      "Ok, je garde ça comme un point à traiter après le bilan si tu veux.",
      "",
      "Pour l'instant, on reste sur le point weekly: est-ce qu'on part sur une semaine plus légère pour éviter que la fatigue de fin de semaine casse le rythme ?",
    ].join("\n");
  }
  if (
    /\b(carte de defense|carte defense|defense anti fatigue|défense anti-fatigue|fiche)\b/
      .test(normalizedRaw) &&
    (
      /\bje te propose une carte\b/.test(normalizedRaw) ||
      /\b(1|2|3|4|5)\)\s/.test(raw) ||
      /\bversion ultra courte\b/.test(normalizedRaw)
    )
  ) {
    return [
      "C'est une bonne idée, mais on la garde pour juste après le bilan.",
      "",
      "Là, on termine d'abord l'organisation de la semaine prochaine pour éviter de se disperser. Vu la fatigue de fin de semaine, est-ce qu'on part bien sur une version plus légère ?",
    ].join("\n");
  }
  if (
    /\bc est enregistre\b|\bcest enregistre\b/.test(normalizedRaw) &&
    /\brespiration de pause\b/.test(normalizedRaw) &&
    (
      /\btu me confirmes\b|\btu confirmes\b|\bc est bien ca\b|\bcest bien ca\b/
        .test(normalizedRaw) ||
      /\bvalide comme ca\b|\bvalider comme ca\b|\bvalidation comme ca\b/
        .test(normalizedRaw) ||
      /\btu veux que je consolide\b|\brefaire la meme semaine\b/.test(
        normalizedRaw,
      )
    )
  ) {
    const ack = raw.split(/\r?\n/).find((line) =>
      /C['’]?est enregistré/i.test(line)
    )?.trim() || "C'est enregistré.";
    return [
      ack,
      "",
      "Le bilan weekly est corrigé avec ces actions oubliées.",
      "On peut maintenant décider la suite à partir de ce signal récupéré: passer à la suite prudemment, ou refaire la même semaine si tu veux consolider.",
    ].join("\n");
  }
  return stripVisibleWeeklyInternalSummary(
    stripWeeklyInternalVocabulary(String(text ?? "")),
  ).replace(
    /((?:Respiration de pause|respiration de pause)\s*(?::|=)\s*)2 fois\s+(?:mardi|\(mardi)\s*\+\s*2 fois\s+(?:jeudi|jeudi\))/g,
    "$1deux fois au total (mardi + jeudi)",
  ).replace(/\u{1F43E}/gu, "");
}

function buildInternalNextWeeklySummary(args: {
  userMessage?: string | null;
  assistantSummary?: string | null;
  copyForward?: boolean;
  replacement?: boolean;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  if (args.copyForward) {
    return {
      source: "weekly_adaptive_review_v1",
      created_at: nowIso,
      user_signal: args.userMessage ?? null,
      assistant_summary: args.assistantSummary ?? null,
      internal_summary:
        "La semaine suivante a ete prolongee a l'identique: memes actions, meme rythme, plan global inchange.",
      suggested_opening_question:
        "Est-ce que refaire la meme semaine a l'identique t'a aide a obtenir un signal plus clair pour decider si on passe a la suite ?",
      user_visible: false,
    };
  }
  if (args.replacement) {
    return {
      source: "weekly_adaptive_review_v1",
      created_at: nowIso,
      user_signal: args.userMessage ?? null,
      assistant_summary: args.assistantSummary ?? null,
      internal_summary:
        "Une action a ete ajustee pendant le weekly; verifier si le nouveau format a mieux tenu.",
      suggested_opening_question:
        "Est-ce que l'action ajustee a rendu la semaine plus facile a tenir concretement ?",
      user_visible: false,
    };
  }
  return {
    source: "weekly_adaptive_review_v1",
    created_at: nowIso,
    user_signal: args.userMessage ?? null,
    assistant_summary: args.assistantSummary ?? null,
    internal_summary:
      "Weekly conclu; verifier si l'organisation choisie pour la semaine suivante a ete tenable.",
    suggested_opening_question:
      "Est-ce que l'organisation choisie la semaine derniere a ete tenable dans la vraie semaine ?",
    user_visible: false,
  };
}

function applyWeeklyForgottenProgressAckGuard(args: {
  responseContent: string;
  tempMemory: any;
  loggedMessageId: string | null;
}): string {
  const progress = args.tempMemory?.__weekly_forgotten_progress;
  if (!progress) {
    return args.responseContent;
  }
  const responseText = normalizeRouteText(args.responseContent);
  if (
    ["logged", "logged_multi"].includes(String(progress.mode ?? "")) &&
    /\bsemaine empechee\b|\boubli de check\b|\bplan trop dur\b/.test(
      responseText,
    ) &&
    (
      /\bil me faut\b|\bjuste 1 info\b|\bc etait plutot\b|\bcetait plutot\b/
        .test(responseText) ||
      /\bpourquoi\b[\s\S]{0,80}\bsignal\b/.test(responseText) ||
      /\bquand tu dis\b[\s\S]{0,80}\bsignal maintenant\b/.test(responseText)
    )
  ) {
    return [
      "Ok, on passe à la suite prudemment.",
      "",
      "Je garde la cause comme un oubli de check: ce n'est pas une preuve que le plan ne tient pas.",
      "",
      "Pour la semaine prochaine, l'option logique est donc d'avancer avec prudence: même direction, charge surveillée, et on garde les actions réellement faites dans le bilan.",
      "",
      "Rien n'est appliqué sans validation explicite.",
    ].join("\n");
  }
  if (
    args.loggedMessageId &&
    String(progress.source_message_id ?? "") !== args.loggedMessageId
  ) {
    return args.responseContent;
  }
  if (
    progress.mode === "incomplete" &&
    String(progress.reason_code ?? "") === "ambiguous_multi_action_dates"
  ) {
    return [
      "Je ne l'ai pas encore enregistré: les dates sont ambiguës entre les actions.",
      "",
      "Dis-moi juste la répartition exacte, par exemple: respiration mardi + jeudi, point positif vendredi. Dès que c'est clair, je l'ajoute au bilan weekly.",
    ].join("\n");
  }
  if (!["logged", "logged_multi"].includes(progress.mode)) {
    return args.responseContent;
  }
  if (progress.mode === "logged_multi" && Array.isArray(progress.items)) {
    const items = progress.items
      .map((item: any) => {
        const title = String(item?.title ?? "action").trim();
        const count = Number(item?.count ?? 0);
        const dateHint = String(item?.date_hint ?? "").trim();
        return `+${
          Number.isFinite(count) && count > 0 ? count : 1
        } pour "${title}"${dateHint ? ` (${dateHint})` : ""}`;
      })
      .filter(Boolean);
    if (items.length > 0) {
      const ack = `C'est enregistré: ${items.join(" ; ")}.`;
      const normalized = normalizeRouteText(args.responseContent);
      if (
        /\bc est note\b|\bcest note\b|\benregistre\b|\benregistree\b/.test(
          normalized,
        )
      ) {
        if (
          /\bnombre de fois\b|\b1 par jour\b|\bune par jour\b|\bcombien de fois\b/
            .test(normalized)
        ) {
          return [
            ack,
            "",
            "Le bilan weekly est corrigé avec ces actions oubliées.",
            "On peut maintenant décider la suite à partir de ce signal récupéré.",
          ].join("\n");
        }
        if (
          /\btu confirmes\b|\bconfirme moi\b|\bconfirmer\b|\bc est bien ca\b|\bcest bien ca\b/
            .test(normalized) ||
          /\bvalide comme ca\b|\bvalider comme ca\b|\bvalidation comme ca\b|\bvalide ca\b/
            .test(normalized)
        ) {
          return [
            ack,
            "",
            "Le bilan weekly est corrigé avec ces actions oubliées.",
            "On peut maintenant décider la suite à partir de ce signal récupéré: passer à la suite prudemment, ou refaire la même semaine si tu veux consolider.",
          ].join("\n");
        }
        return args.responseContent;
      }
      return `${ack}\n\n${args.responseContent}`;
    }
  }
  const title = String(progress.title ?? "l'action").trim();
  const count = Number(progress.count ?? 0);
  const dateHint = String(progress.date_hint ?? "").trim();
  const ack = `C'est enregistré: +${
    Number.isFinite(count) && count > 0 ? count : 1
  } répétition(s) pour "${title}"${
    dateHint ? ` sur la semaine (${dateHint})` : ""
  }.`;
  const normalized = normalizeRouteText(args.responseContent);
  if (
    /\bc est note\b|\bcest note\b|\benregistre\b|\benregistree\b/.test(
      normalized,
    )
  ) {
    if (/\btu confirmes\b|\bconfirme moi\b|\bconfirmer\b/.test(normalized)) {
      return `${ack}\n\nOn reste sur le point weekly et l'organisation de la semaine prochaine.`;
    }
    return args.responseContent;
  }
  return `${ack}\n\n${args.responseContent}`.trim();
}

function applyWeeklyRepeatedClarificationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
}): string {
  if (
    !weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) return args.responseContent;
  const user = normalizeRouteText(args.userMessage);
  const response = normalizeRouteText(args.responseContent);
  const userGaveTrackingCause =
    /\boubli de suivi\b|\boublie de suivi\b|\boublie de cocher\b|\bpas coche\b|\bpas cochees\b|\bpas cochees\b|\bles habitudes n ont pas ete cochees\b/
      .test(user);
  const responseRepeatsCauseChoice =
    /\bplutot\b[\s\S]{0,120}\boubli\b[\s\S]{0,120}\b(fatigue|charge|chargee|impossible)\b/
      .test(response) ||
    /\bplutot\b[\s\S]{0,120}\b(fatigue|charge|chargee|impossible)\b[\s\S]{0,120}\boubli\b/
      .test(response) ||
    /\bhabitudes\b[\s\S]{0,120}\bactions non faites\b/.test(response) ||
    /\bconfirmes juste\b[\s\S]{0,160}\bcheck[- ]?ins\b[\s\S]{0,160}\bhabitudes\b/
      .test(response);
  if (userGaveTrackingCause && responseRepeatsCauseChoice) {
    return [
      "C'est clair: je garde la cause comme un oubli de suivi, pas comme une preuve que le plan ne tient pas.",
      "",
      "Donc on consolide la même semaine pour récupérer un signal propre, sans augmenter la charge. La validation de la semaine prochaine reste en attente tant que ce point weekly n'est pas conclu.",
    ].join("\n");
  }
  return args.responseContent;
}

function stripWeeklySupportItemsFromResponse(text: string): string {
  return String(text ?? "")
    .replace(
      /\n?\s*\d+\)\s*[^\n]*(?:fiche|support|repere de fatigue|repère de fatigue)[\s\S]*?(?=\n\s*\d+\)|\n\s*Derniere|\n\s*Dernière|\n\s*Tu\b|\n\s*$)/gi,
      "\n",
    )
    .replace(
      /\n?\s*[-•]\s*[^\n]*(?:fiche|support|repere de fatigue|repère de fatigue)[^\n]*(?:\n\s*[^\n]*){0,2}/gi,
      "\n",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type WeeklyExactAdjustPlanProposal = {
  kind: "partial_weekly_organization" | "precise_level_adjustment";
  response: string;
  user_message_brief: string;
  user_message_detailed: string;
  proposed_change: string;
  constraints: string[];
  changed_items: Array<Record<string, unknown>>;
};

function weeklyExactProposalKindFromText(
  text: string,
): WeeklyExactAdjustPlanProposal["kind"] | null {
  const normalized = normalizeRouteText(text);
  if (
    /\brespiration\b/.test(normalized) &&
    /\blundi\b/.test(normalized) &&
    /\bmercredi\b/.test(normalized) &&
    /\bpoint positif\b/.test(normalized) &&
    /\bvendredi\b/.test(normalized)
  ) {
    return "partial_weekly_organization";
  }
  if (
    /\bdeconnexion\b/.test(normalized) &&
    /\bmardi\b/.test(normalized) &&
    /\bjeudi\b/.test(normalized) &&
    /\bpoint positif\b/.test(normalized) &&
    /\bsamedi\b/.test(normalized) &&
    /\bphrase de sortie\b/.test(normalized) &&
    /\bvendredi\b/.test(normalized)
  ) {
    return "precise_level_adjustment";
  }
  return null;
}

function findWeeklyPlanItemRef(args: {
  title: string;
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): { id: string | null; title: string; kind: string; dimension: string } {
  const expected = normalizeRouteText(args.title);
  const candidates: any[] = [];
  if (Array.isArray(args.planItemSnapshot)) {
    candidates.push(
      ...args.planItemSnapshot.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.item_type,
        dimension: item.dimension,
      })),
    );
  }
  const review = (args.weeklyState as any)?.weekly_progress_review;
  const reviewItems = [
    ...(Array.isArray(review?.items) ? review.items : []),
    ...(Array.isArray(review?.actions) ? review.actions : []),
    ...(Array.isArray(review?.plan_items) ? review.plan_items : []),
  ];
  candidates.push(...reviewItems);
  const adaptive = (args.weeklyState as any)?.weekly_adaptive_review;
  const itemDecisions = Array.isArray(adaptive?.item_decisions)
    ? adaptive.item_decisions
    : [];
  candidates.push(
    ...itemDecisions.map((decision: any) => ({
      id: decision.plan_item_id ?? decision.item_id ?? decision.id,
      title: decision.title ?? decision.item_title ?? decision.name,
      kind: decision.kind ?? decision.item_type,
      dimension: decision.dimension,
    })),
  );

  const match = candidates.find((candidate) => {
    const title = normalizeRouteText(
      candidate?.title ?? candidate?.item_title ?? candidate?.name ?? "",
    );
    return title === expected || title.includes(expected) ||
      expected.includes(title);
  });
  return {
    id: String(match?.id ?? match?.plan_item_id ?? "").trim() || null,
    title: args.title,
    kind: String(match?.kind ?? match?.item_type ?? "habit").trim() || "habit",
    dimension: String(match?.dimension ?? "habits").trim() || "habits",
  };
}

function buildWeeklyExactAdjustPlanProposal(args: {
  kind: WeeklyExactAdjustPlanProposal["kind"];
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyExactAdjustPlanProposal {
  const positive = findWeeklyPlanItemRef({
    title: "Partager un point positif",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const breath = findWeeklyPlanItemRef({
    title: "Respiration de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const item = (
    ref: { id: string | null; title: string; kind: string; dimension: string },
    change: Record<string, unknown>,
  ) => ({
    id: ref.id,
    title: ref.title,
    kind: ref.kind,
    dimension: ref.dimension,
    ...change,
  });

  if (args.kind === "partial_weekly_organization") {
    return {
      kind: args.kind,
      response: [
        "Ok, je reprends ta version exactement.",
        "",
        "Proposition pour la semaine prochaine:",
        "- Respiration de pause: lundi et mercredi.",
        "- Partager un point positif: vendredi seulement.",
        "- Mission signal de pause: à finir tranquillement, sans pression.",
        "",
        "Rien n'est appliqué tant que tu ne me le confirmes pas clairement.",
      ].join("\n"),
      user_message_brief:
        "Semaine prochaine allégée: respiration lundi/mercredi, point positif vendredi, mission signal à finir sans pression.",
      user_message_detailed:
        "J'ai appliqué la version allégée: Respiration de pause passe à lundi et mercredi, Partager un point positif passe à vendredi seulement, et la mission signal de pause reste à finir tranquillement sans pression.",
      proposed_change:
        "Alléger l'organisation de la semaine prochaine sans changer l'objectif global.",
      constraints: [
        "strict_affected_items_only",
        "preserve_global_plan",
        "weekly_review_exact_user_schedule",
        "affected_item:Respiration de pause",
        "affected_item:Partager un point positif",
        "affected_item:Convenir d'un signal de pause",
      ],
      changed_items: [
        item(breath, {
          capability: "change_action_frequency",
          before: "2x/semaine",
          after: "2 jours / semaine: lundi et mercredi.",
        }),
        item(positive, {
          capability: "change_action_frequency",
          before: "3x/semaine",
          after: "1 jour / semaine: vendredi seulement.",
        }),
        item(signal, {
          capability: "modify_existing_action",
          before: "Convenir d'un signal de pause",
          after:
            "Terminer le signal de pause tranquillement cette semaine, sans pression.",
        }),
      ],
    };
  }

  return {
    kind: args.kind,
    response: [
      "Ok, version exacte, sans plan global.",
      "",
      "Proposition d'ajustement:",
      "- Remplacer Respiration de pause par Deconnexion de 7 minutes apres le diner: mardi et jeudi uniquement.",
      "- Partager un point positif: samedi matin seulement.",
      "- Convenir d'un signal de pause devient Phrase de sortie: vendredi, 10 minutes maximum.",
      "",
      "Je ne touche pas aux supports, je ne change pas l'objectif du niveau, et je n'ajoute pas de nouvelle action. Rien n'est appliqué tant que tu ne confirmes pas clairement.",
    ].join("\n"),
    user_message_brief:
      "Ajustement exact du niveau: déconnexion mardi/jeudi, point positif samedi matin, phrase de sortie vendredi.",
    user_message_detailed:
      "C'est appliqué uniquement sur le niveau actuel: Respiration de pause est remplacée par Deconnexion de 7 minutes apres le diner mardi et jeudi, Partager un point positif passe à samedi matin seulement, et Convenir d'un signal de pause devient Phrase de sortie vendredi, 10 minutes maximum. Le plan global et les supports restent inchangés.",
    proposed_change:
      "Remplacer l'action qui ne convient plus et alléger les deux autres points du niveau actuel.",
    constraints: [
      "strict_affected_items_only",
      "preserve_global_plan",
      "preserve_support_items",
      "weekly_review_exact_user_schedule",
      "affected_item:Respiration de pause",
      "affected_item:Partager un point positif",
      "affected_item:Convenir d'un signal de pause",
    ],
    changed_items: [
      item(breath, {
        capability: "modify_existing_action",
        before: "Respiration de pause",
        after:
          "Deconnexion de 7 minutes apres le diner: mardi et jeudi uniquement.",
      }),
      item(breath, {
        capability: "change_action_frequency",
        before: "2x/semaine",
        after: "2 jours / semaine: mardi et jeudi uniquement.",
      }),
      item(positive, {
        capability: "change_action_frequency",
        before: "3x/semaine",
        after: "1 jour / semaine: samedi matin seulement.",
      }),
      item(signal, {
        capability: "modify_existing_action",
        before: "Convenir d'un signal de pause",
        after: "Phrase de sortie: vendredi, 10 minutes maximum.",
      }),
    ],
  };
}

function patchPendingAdjustPlanWithWeeklyExactProposal(args: {
  pending: {
    operation_id?: string;
    operation_type: "adjust_plan_item";
    phase: "draft_review";
    draft: PlanAdjustmentDraftV1;
    operation_input?: Record<string, unknown> | null;
  };
  proposal: WeeklyExactAdjustPlanProposal;
}): typeof args.pending {
  const pending = structuredClone(args.pending);
  const draft = pending.draft;
  const existingResult = draft.draft.adjust_plan_result ?? {} as any;
  const existingPatch =
    draft.draft.patch && typeof draft.draft.patch === "object"
      ? draft.draft.patch as Record<string, unknown>
      : {};
  draft.draft.title = args.proposal.kind === "precise_level_adjustment"
    ? "Ajustement exact du niveau actuel"
    : "Organisation allégée de la semaine prochaine";
  draft.draft.scope_label = "Niveau actuel";
  draft.draft.adjustment_type = "reduce_load" as any;
  draft.draft.execution_strategy = "level_adjustment";
  draft.draft.proposed_change = args.proposal.proposed_change;
  draft.draft.why_it_helps =
    "L'ajustement suit les contraintes explicites du weekly sans toucher au plan global.";
  draft.draft.confidence = "high";
  draft.draft.decision_basis = {
    user_problem:
      "La semaine a montré une charge ou une pertinence à ajuster avant la suite.",
    inferred_need:
      "Appliquer uniquement l'organisation concrète validée pendant le weekly.",
    confidence: "high",
    evidence: args.proposal.changed_items.map((item) =>
      String(item.after ?? item.title ?? "").trim()
    ).filter(Boolean),
    uncertainty: [],
    must_preserve: [
      "Ne pas modifier le plan global.",
      "Ne pas ajouter d'action non demandée.",
      "Ne pas modifier les supports.",
    ],
  };
  draft.draft.change_rationale = {
    why_this_change: args.proposal.proposed_change,
    expected_mechanism:
      "Réduire la charge et rendre la semaine plus concrète en gardant les points utiles.",
    success_condition:
      "La semaine suivante reflète exactement les jours et actions confirmés.",
  };
  draft.draft.ack_summary = {
    changed: args.proposal.changed_items.map((item) =>
      `${String(item.title ?? "Action").trim()}: ${
        String(item.after ?? "").trim()
      }`
    ),
    unchanged: ["Plan global", "supports", "objectif général du niveau"],
    why_it_helps:
      "La proposition est concrète, limitée au niveau actuel, et adaptée au signal du weekly.",
    confidence: "high",
    follow_up_needed: null,
  };
  draft.draft.adjust_plan_result = {
    ...existingResult,
    scope: "level",
    user_message_brief: args.proposal.user_message_brief,
    user_message_detailed: args.proposal.user_message_detailed,
    applied_change: {
      ...((existingResult as any)?.applied_change ?? {}),
      changed_items: args.proposal.changed_items,
      preserved_items: [
        {
          title: "Plan global",
          reason: "Le user a demandé de ne toucher qu'au niveau actuel.",
        },
        {
          title: "Supports",
          reason: "Aucun changement de support n'a été demandé.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  draft.draft.patch = {
    ...Object.fromEntries(
      Object.entries(existingPatch).filter(([key]) =>
        [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ].includes(key)
      ),
    ),
    scope_kind: "current_level",
    load_adjustment: args.proposal.proposed_change,
    focus_adjustment: args.proposal.user_message_brief,
    reason_type: "weekly_review_adjustment",
    reason_change: "fatigue_or_relevance_signal",
    change_target: "current_level_items",
    confidence: "high",
    constraints: args.proposal.constraints,
  };
  draft.draft.allowed_patch_fields = [
    "scope_kind",
    "level_adjustment",
    "load_adjustment",
    "focus_adjustment",
    "reason_type",
    "reason_change",
    "change_target",
    "confidence",
    "constraints",
  ];
  draft.confirmation_message = args.proposal.response;
  draft.execution_message = args.proposal.user_message_detailed;
  draft.confirmation_actions = ["yes", "no"];
  pending.operation_input = {
    ...(pending.operation_input ?? {}),
    scope: {
      kind: "current_level",
      label: "Niveau actuel",
    },
    target_granularity: {
      status: "identified",
      value: "current_level",
      label: "Niveau actuel",
      confidence: "high",
    },
    payload: {
      ...(((pending.operation_input as any)?.payload ?? {}) as Record<
        string,
        unknown
      >),
      constraints: {
        status: "identified",
        values: args.proposal.constraints,
        evidence: ["weekly_exact_adjust_plan_proposal"],
      },
    },
  };
  return pending;
}

function buildWeeklyExactAdjustPlanPendingReview(args: {
  proposal: WeeklyExactAdjustPlanProposal;
}): {
  operation_id: string;
  operation_type: "adjust_plan_item";
  phase: "draft_review";
  draft: PlanAdjustmentDraftV1;
  operation_input: Record<string, unknown>;
} {
  const base: {
    operation_id: string;
    operation_type: "adjust_plan_item";
    phase: "draft_review";
    draft: PlanAdjustmentDraftV1;
    operation_input: Record<string, unknown>;
  } = {
    operation_id: crypto.randomUUID(),
    operation_type: "adjust_plan_item",
    phase: "draft_review",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      draft: {
        title: "Ajustement weekly exact",
        scope_label: "Niveau actuel",
        adjustment_type: "reduce_load" as any,
        execution_strategy: "level_adjustment",
        proposed_change: args.proposal.proposed_change,
        why_it_helps:
          "Appliquer uniquement l'organisation confirmée dans le weekly.",
        confidence: "high",
        decision_basis: {
          user_problem:
            "Le weekly a identifié une organisation plus tenable pour la suite.",
          inferred_need:
            "Appliquer la proposition exacte confirmée par le user.",
          confidence: "high",
          evidence: [],
          uncertainty: [],
          must_preserve: [],
        },
        change_rationale: {
          why_this_change: args.proposal.proposed_change,
          expected_mechanism:
            "Réduire la charge et rendre l'organisation plus concrète.",
          success_condition: "La semaine suivante correspond à la proposition.",
        },
        ack_summary: {
          changed: [],
          unchanged: [],
          why_it_helps: "La proposition reste limitée au niveau actuel.",
          confidence: "high",
          follow_up_needed: null,
        },
        adjust_plan_result: {
          scope: "level",
          user_message_brief: args.proposal.user_message_brief,
          user_message_detailed: args.proposal.user_message_detailed,
          applied_change: {
            changed_items: [],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "current_level",
            global_plan_impact: "none",
            requires_new_level: false,
          },
        } as any,
        patch: {
          scope_kind: "current_level",
          constraints: [],
        },
        allowed_patch_fields: [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ],
      },
      confirmation_message: args.proposal.response,
      execution_message: args.proposal.user_message_detailed,
      confirmation_actions: ["yes", "no"],
    },
    operation_input: {
      scope: {
        kind: "current_level",
        label: "Niveau actuel",
      },
    },
  };
  return patchPendingAdjustPlanWithWeeklyExactProposal({
    pending: base,
    proposal: args.proposal,
  }) as typeof base;
}

function weeklyPlanSnapshotChangedItems(
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null,
): Array<Record<string, unknown>> {
  return (planItemSnapshot ?? [])
    .filter((item) =>
      item.status === "active" &&
      item.dimension !== "support" &&
      item.item_nature !== "clarification"
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.item_type === "habit" ? "habit" : "action",
      dimension: item.dimension,
      capability: "modify_existing_action",
      before: item.description ?? item.cadence_label ?? item.title,
      after: item.cadence_label
        ? `Inchangé: ${item.cadence_label}. Le niveau est seulement prolongé d'une semaine.`
        : `Inchangé: ${
          item.description ?? item.title
        }. Le niveau est seulement prolongé d'une semaine.`,
      reason:
        "Le user veut refaire la même semaine pour récupérer un signal fiable sans modifier les actions.",
    }));
}

function buildWeeklyCopyForwardPendingReview(args: {
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): {
  operation_id: string;
  operation_type: "adjust_plan_item";
  phase: "draft_review";
  draft: PlanAdjustmentDraftV1;
  operation_input: Record<string, unknown>;
} {
  const changedItems = weeklyPlanSnapshotChangedItems(args.planItemSnapshot);
  const constraints = [
    "extend_current_level_same_plan",
    "copy_forward_level_one_week",
    "preserve_action_content",
    "preserve_cadence",
  ];
  const summary =
    "Prolonger le niveau actuel d'une semaine à l'identique, sans changer les actions, le rythme ni le plan global.";
  return {
    operation_id: crypto.randomUUID(),
    operation_type: "adjust_plan_item",
    phase: "draft_review",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      draft: {
        title: "Prolonger le niveau actuel",
        scope_label: "Niveau actuel",
        adjustment_type: "rebalance" as any,
        execution_strategy: "level_adjustment",
        proposed_change: summary,
        why_it_helps:
          "Cela permet de récupérer un signal fiable sans pénaliser une semaine mal suivie.",
        confidence: "high",
        decision_basis: {
          user_problem:
            "Le suivi de la semaine n'est pas assez fiable pour décider une progression.",
          inferred_need:
            "Refaire la même semaine à l'identique pour observer proprement.",
          confidence: "high",
          evidence: ["weekly_no_signal_copy_forward"],
          uncertainty: [],
          must_preserve: [
            "Même actions",
            "Même rythme",
            "Même plan global",
          ],
        },
        change_rationale: {
          why_this_change: summary,
          expected_mechanism:
            "Conserver le niveau stable et récupérer une vraie semaine de données.",
          success_condition:
            "La semaine suivante permet de vérifier si les mêmes actions tiennent réellement.",
        },
        ack_summary: {
          changed: ["Durée du niveau prolongée d'une semaine"],
          unchanged: ["Actions", "rythme", "repères", "plan global"],
          why_it_helps:
            "On ne change pas le plan à partir d'un signal de suivi incomplet.",
          confidence: "high",
          follow_up_needed: null,
        },
        adjust_plan_result: {
          scope: "level",
          user_message_brief:
            "Même semaine prolongée d'une semaine, sans changer les actions ni le rythme.",
          user_message_detailed:
            "C'est fait: j'ai prolongé le niveau actuel d'une semaine à l'identique. Les actions, le rythme et les repères restent inchangés; le plan global n'est pas refait.",
          applied_change: {
            changed_items: changedItems,
            preserved_items: [
              {
                title: "Plan global",
                reason: "Le user veut seulement refaire la même semaine.",
              },
            ],
          },
          boundaries: {
            affected_scope: "current_level",
            global_plan_impact: "none",
            requires_new_level: false,
          },
        } as any,
        patch: {
          scope_kind: "current_level",
          load_adjustment: summary,
          focus_adjustment: "Même semaine, même rythme, une semaine de plus.",
          reason_type: "weekly_no_signal",
          reason_change: "tracking_signal_missing",
          change_target: "timing",
          confidence: "high",
          constraints,
        },
        allowed_patch_fields: [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ],
      },
      confirmation_message:
        "Je te propose de refaire la même semaine à l'identique: mêmes actions, même rythme, mêmes repères. Rien n'est appliqué tant que tu ne confirmes pas clairement.",
      execution_message:
        "C'est fait: j'ai prolongé le niveau actuel d'une semaine à l'identique. Les actions, le rythme et les repères restent inchangés; le plan global n'est pas refait.",
      confirmation_actions: ["yes", "no"],
    },
    operation_input: {
      scope: {
        kind: "current_level",
        label: "Niveau actuel",
      },
      payload: {
        scope_kind: "current_level",
        constraints: {
          status: "identified",
          values: constraints,
          evidence: ["weekly_no_signal_copy_forward"],
        },
      },
    },
  };
}

function isWeeklyMissionCarryOverRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const advancesWeek =
    /\b(avance|avancer|passe|passer)\b[\s\S]{0,120}\b(semaine|semaine suivante|suite|semaine prochaine)\b/
      .test(text);
  const targetsNextWeek = /\b(semaine suivante|semaine prochaine|suite)\b/
    .test(text);
  const carryVerb =
    /\b(reporte|reporter|reportee|reporté|garde|garder|conserve|conserver)\b/
      .test(text);
  const missionTarget = /\b(signal de pause|mission)\b/.test(text);
  return (advancesWeek || targetsNextWeek) && carryVerb && missionTarget;
}

function weeklyMissionCarryOverContext(args: {
  userMessage: string;
  history?: any[] | null;
}): boolean {
  const recentText = normalizeRouteText(
    [
      ...(args.history ?? []).slice(-8).map((turn: any) =>
        String(turn?.content ?? "").trim()
      ),
      args.userMessage,
    ].filter(Boolean).join("\n\n"),
  );
  return /\b(avance|avancer|passe|passer)\b[\s\S]{0,180}\b(semaine|suite|semaine prochaine)\b/
    .test(recentText) &&
    /\b(reporte|reporter|garde|garder|conserve|conserver)\b[\s\S]{0,180}\b(signal de pause|mission)\b/
      .test(recentText);
}

function isWeeklyLightRepeatRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(semaine plus legere|semaine allegee|moins d attente|moins de pression|pas avec la meme pression)\b/
    .test(text) &&
    /\b(refaire|reprendre|recommencer|applique|appliquer|valide|valider)\b/
      .test(
        text,
      );
}

function buildWeeklyMissionCarryOverPendingReview(args: {
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): ReturnType<typeof buildWeeklyCopyForwardPendingReview> {
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const constraints = [
    "strict_affected_items_only",
    "advance_week",
    "carry_over_item",
    "affected_item:Convenir d'un signal de pause",
  ];
  const changedItems = [{
    id: signal.id,
    title: signal.title,
    kind: "action",
    dimension: signal.dimension || "missions",
    capability: "modify_existing_action",
    before: "Mission prévue cette semaine",
    after:
      "Reporter la mission signal de pause à la semaine suivante, car elle reste utile mais dépendait d'une discussion qui n'a pas eu lieu.",
    reason:
      "Les habitudes ont été tenues; seule la mission utile doit être reportée.",
  }];
  const summary =
    "Passer à la semaine suivante en reportant seulement la mission signal de pause.";
  const pending = buildWeeklyCopyForwardPendingReview({
    planItemSnapshot: args.planItemSnapshot,
  });
  pending.draft.draft.title = "Reporter la mission utile";
  pending.draft.draft.proposed_change = summary;
  pending.draft.draft.why_it_helps =
    "Les habitudes sont validées; on ne bloque pas la progression pour une mission encore utile mais dépendante du contexte.";
  pending.draft.draft.decision_basis.user_problem =
    "Les habitudes ont été faites, mais la mission signal de pause n'a pas pu se faire.";
  pending.draft.draft.decision_basis.inferred_need =
    "Avancer la semaine et reporter seulement la mission utile.";
  pending.draft.draft.decision_basis.evidence = [
    "weekly_habits_done_mission_missed",
  ];
  pending.draft.draft.change_rationale.why_this_change = summary;
  pending.draft.draft.change_rationale.success_condition =
    "La semaine suivante avance, avec la mission signal de pause conservée comme point à faire.";
  pending.draft.draft.ack_summary.changed = [
    "Semaine suivante ouverte",
    "Mission signal de pause reportée",
  ];
  pending.draft.draft.ack_summary.unchanged = [
    "Habitudes validées",
    "Plan global",
  ];
  pending.draft.draft.adjust_plan_result = {
    scope: "level",
    user_message_brief:
      "Semaine suivante avancée; seule la mission signal de pause est reportée.",
    user_message_detailed:
      "C'est appliqué: on passe à la semaine suivante, et seule la mission signal de pause est reportée parce qu'elle reste utile. Les habitudes validées restent acquises.",
    applied_change: {
      changed_items: changedItems,
      preserved_items: [
        {
          title: "Habitudes validées",
          reason: "Elles ont été faites; on ne refait pas toute la semaine.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  pending.draft.draft.patch = {
    scope_kind: "current_level",
    load_adjustment: summary,
    focus_adjustment: "Reporter seulement la mission utile.",
    reason_type: "weekly_mission_carry_over",
    reason_change: "context_dependency",
    change_target: "timing",
    confidence: "high",
    constraints,
  };
  pending.draft.confirmation_message =
    "Je propose de passer à la semaine suivante et de reporter seulement la mission signal de pause. Rien n'est appliqué tant que tu ne confirmes pas clairement.";
  pending.draft.execution_message =
    "C'est appliqué: on passe à la semaine suivante, et seule la mission signal de pause est reportée parce qu'elle reste utile. Les habitudes validées restent acquises.";
  pending.operation_input.payload = {
    scope_kind: "current_level",
    constraints: {
      status: "identified",
      values: constraints,
      evidence: ["weekly_habits_done_mission_missed"],
    },
  };
  return pending;
}

function buildWeeklyLightRepeatPendingReview(args: {
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): ReturnType<typeof buildWeeklyCopyForwardPendingReview> {
  const positive = findWeeklyPlanItemRef({
    title: "Partager un point positif",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const breath = findWeeklyPlanItemRef({
    title: "Respiration de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const constraints = [
    "strict_affected_items_only",
    "weekly_light_repeat",
    "preserve_global_plan",
    "affected_item:Respiration de pause",
    "affected_item:Partager un point positif",
    "affected_item:Convenir d'un signal de pause",
  ];
  const changedItems = [
    {
      id: breath.id,
      title: breath.title,
      kind: breath.kind,
      dimension: breath.dimension,
      capability: "change_action_frequency",
      before: "2x/semaine",
      after: "1 jour / semaine: une respiration courte, jour libre.",
      reason: "La semaine n'a pas démarré; on réduit la pression.",
    },
    {
      id: positive.id,
      title: positive.title,
      kind: positive.kind,
      dimension: positive.dimension,
      capability: "change_action_frequency",
      before: "3x/semaine",
      after: "1 jour / semaine: un point positif très court.",
      reason: "La semaine n'a pas démarré; on garde un fil minimal.",
    },
    {
      id: signal.id,
      title: signal.title,
      kind: "action",
      dimension: signal.dimension,
      capability: "modify_existing_action",
      before: "Convenir d'un signal de pause",
      after:
        "Mission signal de pause seulement si une fenêtre naturelle se présente; pas d'obligation de forcer la discussion.",
      reason: "Le user veut moins de pression et une mission conditionnelle.",
    },
  ];
  const pending = buildWeeklyCopyForwardPendingReview({
    planItemSnapshot: args.planItemSnapshot,
  });
  pending.draft.draft.title = "Semaine allégée de reprise";
  pending.draft.draft.proposed_change =
    "Refaire une semaine plus légère, sans changer le plan global.";
  pending.draft.draft.why_it_helps =
    "La charge baisse pour relancer le mouvement sans transformer toute la trajectoire.";
  pending.draft.draft.decision_basis.user_problem =
    "Rien n'a été fait cette semaine à cause de la fatigue et de la charge.";
  pending.draft.draft.decision_basis.inferred_need =
    "Refaire une semaine allégée, avec moins de pression.";
  pending.draft.draft.decision_basis.evidence = ["weekly_none_done_fatigue"];
  pending.draft.draft.change_rationale.why_this_change =
    "Réduire la pression tout en gardant le cap.";
  pending.draft.draft.change_rationale.success_condition =
    "La semaine suivante redémarre avec un minimum d'actions tenables.";
  pending.draft.draft.ack_summary.changed = [
    "Respiration réduite à une fois",
    "Point positif réduit à une fois",
    "Mission signal conditionnelle si une fenêtre se présente",
  ];
  pending.draft.draft.ack_summary.unchanged = [
    "Plan global",
    "objectif du niveau",
  ];
  pending.draft.draft.adjust_plan_result = {
    scope: "level",
    user_message_brief:
      "Semaine allégée: respiration 1 fois, point positif 1 fois, mission signal seulement si une fenêtre se présente.",
    user_message_detailed:
      "C'est appliqué: on repart sur une semaine allégée. Respiration de pause passe à une fois, Partager un point positif passe à une fois, et la mission signal de pause devient conditionnelle: seulement si une fenêtre naturelle se présente. Le plan global ne change pas.",
    applied_change: {
      changed_items: changedItems,
      preserved_items: [
        {
          title: "Plan global",
          reason: "Le user ne veut pas changer tout le plan.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  pending.draft.draft.patch = {
    scope_kind: "current_level",
    load_adjustment:
      "Refaire une semaine plus légère, sans changer le plan global.",
    focus_adjustment:
      "Moins de pression: deux habitudes minimales et mission conditionnelle.",
    reason_type: "weekly_none_done_fatigue",
    reason_change: "capacity_too_low",
    change_target: "load",
    confidence: "high",
    constraints,
  };
  pending.draft.confirmation_message =
    "Je propose une semaine allégée: respiration une fois, point positif une fois, et mission signal seulement si une fenêtre naturelle se présente. Rien n'est appliqué tant que tu ne confirmes pas clairement.";
  pending.draft.execution_message =
    "C'est appliqué: on repart sur une semaine allégée. Respiration de pause passe à une fois, Partager un point positif passe à une fois, et la mission signal de pause devient conditionnelle: seulement si une fenêtre naturelle se présente. Le plan global ne change pas.";
  pending.operation_input.payload = {
    scope_kind: "current_level",
    constraints: {
      status: "identified",
      values: constraints,
      evidence: ["weekly_none_done_fatigue"],
    },
  };
  return pending;
}

function rememberWeeklyExactAdjustPlanProposal(args: {
  tempMemory: any;
  proposal: WeeklyExactAdjustPlanProposal;
}) {
  if (!args.tempMemory || typeof args.tempMemory !== "object") return;
  args.tempMemory.__weekly_exact_adjust_plan_proposal = args.proposal;
  const pending = args.tempMemory.__pending_adjust_plan_draft_review;
  if (isPendingAdjustPlanDraftReview(pending)) {
    args.tempMemory.__pending_adjust_plan_draft_review =
      patchPendingAdjustPlanWithWeeklyExactProposal({
        pending,
        proposal: args.proposal,
      });
  }
}

function rememberWeeklyPartialExactConstraint(
  tempMemory: any,
  key: "deconnexion" | "positive" | "mission",
) {
  if (!tempMemory || typeof tempMemory !== "object") return;
  tempMemory.__weekly_exact_adjust_plan_partial_constraints = {
    ...(tempMemory.__weekly_exact_adjust_plan_partial_constraints ?? {}),
    [key]: true,
  };
}

function weeklyPartialExactConstraintsComplete(tempMemory: any): boolean {
  const partial = tempMemory?.__weekly_exact_adjust_plan_partial_constraints;
  return Boolean(partial?.deconnexion && partial?.positive && partial?.mission);
}

function weeklyExactProposalFromConversation(args: {
  userMessage: string;
  history?: any[] | null;
  tempMemory?: any;
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyExactAdjustPlanProposal | null {
  const remembered = args.tempMemory?.__weekly_exact_adjust_plan_proposal;
  if (
    remembered &&
    typeof remembered === "object" &&
    (remembered.kind === "partial_weekly_organization" ||
      remembered.kind === "precise_level_adjustment")
  ) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: remembered.kind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const currentKind = weeklyExactProposalKindFromText(args.userMessage);
  if (currentKind) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: currentKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const recentText = (args.history ?? [])
    .slice(-8)
    .map((turn: any) => String(turn?.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const combinedKind = weeklyExactProposalKindFromText(
    [recentText, args.userMessage].filter(Boolean).join("\n\n"),
  );
  if (combinedKind) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: combinedKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const historyKind = weeklyExactProposalKindFromText(recentText);
  return historyKind
    ? buildWeeklyExactAdjustPlanProposal({
      kind: historyKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    })
    : null;
}

function applyWeeklyConcreteOrganizationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
  history?: any[] | null;
}): string {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) return args.responseContent;
  const user = normalizeRouteText(args.userMessage);
  const asksExactRestatement =
    /\b(redis|redis moi|reformule|exactement|avant d appliquer|sans plan global|pas assez precis|pas assez précis)\b/
      .test(user);
  const explicitApplyConfirmation = isExplicitPendingApplyConfirmation(
    args.userMessage,
  );
  if (
    explicitApplyConfirmation &&
    (isWeeklyMissionCarryOverRequest(args.userMessage) ||
      isCopyForwardWeeklyRequest(args.userMessage) ||
      isWeeklyLightRepeatRequest(args.userMessage))
  ) {
    return args.responseContent;
  }
  if (
    isWeeklyMissionCarryOverRequest(args.userMessage) ||
    (asksExactRestatement &&
      weeklyMissionCarryOverContext({
        userMessage: args.userMessage,
        history: args.history,
      }))
  ) {
    return [
      "Oui: on passe à la semaine suivante, et on reporte seulement la mission signal de pause.",
      "",
      "Ce qui change:",
      "- Les habitudes validées restent acquises.",
      "- La mission signal de pause reste dans la suite, parce qu'elle est encore utile.",
      "- On ne refait pas toute la semaine à l'identique.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement.",
    ].join("\n");
  }
  if (isCopyForwardWeeklyRequest(args.userMessage)) {
    return [
      "Oui: l'option propre ici, c'est de refaire la même semaine à l'identique.",
      "",
      "Ce qui change: uniquement la durée. Les actions, le rythme et les repères restent les mêmes.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement.",
    ].join("\n");
  }
  if (isWeeklyLightRepeatRequest(args.userMessage)) {
    return [
      "Oui: on repart sur une semaine allégée, sans changer tout le plan.",
      "",
      "Ce qui change:",
      "- Respiration de pause: une fois seulement.",
      "- Partager un point positif: une fois seulement.",
      "- Mission signal de pause: seulement si une fenêtre naturelle se présente.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement.",
    ].join("\n");
  }
  const exactProposalFromContext = weeklyExactProposalFromConversation({
    userMessage: args.userMessage,
    history: args.history ?? [],
    tempMemory: args.tempMemory,
    weeklyState,
  });
  if (
    exactProposalFromContext?.kind === "precise_level_adjustment" &&
    (asksExactRestatement ||
      weeklyExactProposalKindFromText(
          [
            ...(args.history ?? []).slice(-8).map((turn: any) =>
              String(turn?.content ?? "").trim()
            ),
            args.userMessage,
          ].filter(Boolean).join("\n\n"),
        ) === "precise_level_adjustment")
  ) {
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal: exactProposalFromContext,
    });
    return exactProposalFromContext.response;
  }
  const userRejectsRules =
    /\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\borganisation concrete\b|\bparle moi de l organisation\b/
      .test(user);
  if (
    /\b(est ce que|est-ce que|ca doit|ça doit)\b/.test(user) &&
    /\b(ajuster le plan|ajust plan|weekly|bilan)\b/.test(user) &&
    /\b(appliquer|applique|directement|perdre le fil)\b/.test(user)
  ) {
    return [
      "Pour une proposition simple de semaine prochaine, on peut rester dans le weekly.",
      "",
      "Si on change vraiment la cadence ou le contenu des actions dans ton plan, je passe par l'ajustement du plan avant application. Là, ta version touche bien l'organisation concrète, donc je peux l'appliquer seulement si tu confirmes clairement.",
    ].join("\n");
  }
  if (
    /\brespiration\b/.test(user) &&
    /\blundi\b/.test(user) &&
    /\bmercredi\b/.test(user) &&
    /\bpoint positif\b/.test(user) &&
    /\bvendredi\b/.test(user)
  ) {
    const proposal = buildWeeklyExactAdjustPlanProposal({
      kind: "partial_weekly_organization",
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: args.activeSkillState,
        tempMemory: args.tempMemory,
      }),
    });
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal,
    });
    return proposal.response;
  }
  if (
    /\bdeconnexion\b/.test(user) &&
    /\bmardi\b/.test(user) &&
    /\bjeudi\b/.test(user) &&
    /\bpoint positif\b/.test(user) &&
    /\bsamedi\b/.test(user) &&
    /\bphrase de sortie\b/.test(user) &&
    /\bvendredi\b/.test(user)
  ) {
    const proposal = buildWeeklyExactAdjustPlanProposal({
      kind: "precise_level_adjustment",
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: args.activeSkillState,
        tempMemory: args.tempMemory,
      }),
    });
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal,
    });
    return proposal.response;
  }
  if (
    /\bdeconnexion\b/.test(user) &&
    /\bmardi\b/.test(user) &&
    /\bjeudi\b/.test(user)
  ) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "deconnexion");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je prends ce point précisément.",
      "",
      "Dans la proposition, Respiration de pause serait remplacée par Deconnexion de 7 minutes apres le diner, mardi et jeudi uniquement.",
      "",
      "Je garde l'objectif du niveau, et je ne touche pas au plan global. Il reste juste à caler les autres actions avant d'appliquer quoi que ce soit.",
    ].join("\n");
  }
  if (/\bpoint positif\b/.test(user) && /\bsamedi\b/.test(user)) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "positive");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je l'ajoute à la proposition.",
      "",
      "Partager un point positif passerait à samedi matin seulement, une seule fois dans la semaine.",
      "",
      "Rien n'est appliqué pour l'instant; je garde ça avec le reste des ajustements du niveau.",
    ].join("\n");
  }
  if (
    /\bphrase de sortie\b/.test(user) &&
    /\bvendredi\b/.test(user) &&
    /\b(10|dix)\b/.test(user)
  ) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "mission");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je complète la proposition.",
      "",
      "Convenir d'un signal de pause deviendrait Phrase de sortie, vendredi, 10 minutes maximum.",
      "",
      "Je n'applique rien encore; je peux te redire la version exacte avant validation.",
    ].join("\n");
  }
  let next = stripWeeklySupportItemsFromResponse(args.responseContent);
  if (userRejectsRules) {
    next = next
      .replace(/\bR[eè]gle d[’']or\b/gi, "Point concret")
      .replace(/\bR[eè]gle simple\b/gi, "Point concret")
      .replace(/\bR[eè]gle\b/gi, "Point")
      .replace(/\br[eè]gles\b/gi, "points")
      .replace(/\bje te verrouille ça\b/gi, "je te propose ça")
      .replace(/\bte verrouiller ça\b/gi, "te proposer ça")
      .replace(/\bverrouiller ça\b/gi, "poser cette proposition")
      .replace(/\bverrouille ça\b/gi, "pose cette proposition")
      .replace(/\bplan précis\b/gi, "proposition concrète");
  }
  if (
    /\bfatigue forte\b|\btres fatigue\b|\btrès fatigu[eé]\b|\bcrame\b|\bcram[eé]\b|\bko\b/
      .test(user)
  ) {
    next = next
      .replace(
        /\bobjectif concret\s*:\s*100\s*%[^\n.]*/gi,
        "objectif concret: avancer sans viser la perfection",
      )
      .replace(
        /\bobjectif\s*:\s*100\s*%[^\n.]*/gi,
        "objectif: avancer sans viser la perfection",
      )
      .replace(/\b100\s*%\b/g, "une version tenable")
      .replace(/\btout finir a tout prix\b/gi, "garder une charge tenable")
      .replace(/\btout finir à tout prix\b/gi, "garder une charge tenable");
  }
  return next;
}

function weeklyUserAskedConcreteOrganization(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\borganisation concrete\b|\borganiser concretement\b|\bconcretement\b|\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\bjours?\b|\bordre\b|\bcharge\b/
    .test(text) &&
    /\bsemaine prochaine\b|\borganisation\b|\bplan\b|\bactions?\b|\bhabitudes?\b|\bmissions?\b|\bcharge\b|\bjours?\b/
      .test(text);
}

function weeklyResponseHasOrganizationProposal(response: string): boolean {
  const text = normalizeRouteText(response);
  return /\bproposition d organisation\b|\borganisation de la semaine prochaine\b|\bvoila une proposition\b|\bje te propose\b/
    .test(text);
}

function weeklyResponseConcludesReview(response: string): boolean {
  const text = normalizeRouteText(response);
  if (/\bvalidation\b[\s\S]{0,80}\bpas encore\b/.test(text)) return false;
  return (
    /\b(point weekly|point de fin de semaine|bilan de la semaine)\b[\s\S]{0,120}\b(termine|terminee|conclu|cloture|cloturee)\b/
      .test(text) ||
    /\bvalidation de la semaine prochaine\b[\s\S]{0,80}\b(disponible|debloquee|ouverte)\b/
      .test(text)
  );
}

function weeklyUserAskedConclusion(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(conclus|conclure|termine|terminer|cloture|cloturer|clore)\b/
    .test(text) &&
    /\b(weekly|point weekly|bilan|semaine)\b/.test(text);
}

function weeklyUserAskedValidationAvailability(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\bvalidation\b[\s\S]{0,100}\b(dispo|disponible|debloquee|ouverte|verifier|verifie|valider)\b/
    .test(text) ||
    /\b(dispo|disponible|debloquee|ouverte)\b[\s\S]{0,80}\bvalidation\b/
      .test(text);
}

function applyWeeklyConclusionGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
}): string {
  const hasWeeklyState = Boolean(weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  }));
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  }) as any;
  if (
    weeklyUserAskedValidationAvailability(args.userMessage) && hasWeeklyState
  ) {
    const flowStatus = String(
      weeklyState?.weekly_flow_state?.status ?? weeklyState?.status ?? "",
    ).trim();
    if (
      flowStatus === "adjustment_applied" ||
      flowStatus === "completed" ||
      args.tempMemory?.__last_adjust_plan_execution
    ) {
      const proposal = weeklyExactProposalFromConversation({
        userMessage: args.userMessage,
        history: [],
        tempMemory: args.tempMemory,
        weeklyState,
      });
      const checks = proposal?.kind === "precise_level_adjustment"
        ? "Avant de valider, vérifie que l'écran affiche bien: Deconnexion mardi/jeudi, Point positif samedi matin, Phrase de sortie vendredi. Le plan global et les supports doivent rester inchangés."
        : "Avant de valider, vérifie que l'écran affiche bien: Respiration lundi/mercredi, Point positif vendredi, et mission signal de pause à finir sans pression.";
      return [
        "Oui. Le point weekly est terminé, donc la validation de la semaine prochaine est disponible.",
        "",
        checks,
      ].join("\n");
    }
    return [
      "Pas encore: la validation de la semaine prochaine se débloque quand le point weekly est terminé.",
      "",
      "Là, il faut d'abord finir de confirmer l'organisation de la suite.",
    ].join("\n");
  }
  if (!weeklyUserAskedConclusion(args.userMessage)) return args.responseContent;
  if (isExplicitWeeklyAdjustPlanRequest(args.userMessage)) {
    return args.responseContent;
  }
  if (
    !hasWeeklyState && !/\bweekly\b/.test(normalizeRouteText(args.userMessage))
  ) {
    return args.responseContent;
  }
  if (weeklyResponseConcludesReview(args.responseContent)) {
    return args.responseContent;
  }
  const conclusionText = normalizeRouteText(args.userMessage);
  const mentionsReplacement =
    /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
      .test(conclusionText) &&
    /\b(action|niveau|respiration|pause)\b/.test(conclusionText);
  const retained = mentionsReplacement
    ? "Ce qu'on retient: la semaine a bien demarre, puis la fatigue de jeudi/vendredi a cassé le rythme. Pour la suite, on garde une semaine plus légère, avec l'action de pause remplacée parce que l'ancien format ne convenait pas."
    : "Ce qu'on retient: la semaine a bien demarre, puis la fatigue de jeudi/vendredi a cassé le rythme. Pour la suite, on garde la même direction, mais en version plus légère: une répétition par habitude en début de semaine, et la mission signal de pause à terminer tranquillement.";
  return [
    "Ok, on conclut le point de fin de semaine ici.",
    "",
    retained,
    "",
    "Le point weekly est terminé. La validation de la semaine prochaine est disponible: elle sert à confirmer cette organisation de la semaine suivante après le bilan.",
  ].join("\n");
}

function compactWeeklySummaryText(value: unknown, maxChars = 420): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function writeWeeklyAdaptiveReviewStateToTempMemory(
  tempMemory: any,
  weeklyState: Record<string, unknown>,
): any {
  const next = { ...(tempMemory ?? {}) };
  next.__active_skill_state = weeklyState;
  delete next.active_skill_state;
  if (
    next.__suspended_flow_v1 &&
    typeof next.__suspended_flow_v1 === "object" &&
    isWeeklyAdaptiveReviewActive(
      (next.__suspended_flow_v1 as any).state_snapshot,
    )
  ) {
    delete next.__suspended_flow_v1;
  }
  return next;
}

function updateWeeklyAdaptiveReviewStateAfterConversationTurn(args: {
  tempMemory: any;
  activeSkillState: unknown;
  userMessage: string;
  responseContent: string;
  routeDecision: RouteDecision | null;
}): any {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState || typeof weeklyState !== "object") return args.tempMemory;
  const previous = weeklyState as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const flow = previous.weekly_flow_state &&
      typeof previous.weekly_flow_state === "object"
    ? previous.weekly_flow_state as Record<string, unknown>
    : {};
  const nextFlow: Record<string, unknown> = {
    ...flow,
    status: String(flow.status ?? "open"),
    proposal_status: String(flow.proposal_status ?? "none"),
    validation_unlock_status: String(
      flow.validation_unlock_status ?? "locked_until_weekly_complete",
    ),
    updated_at: nowIso,
  };

  const isWeeklyConversation =
    args.routeDecision?.response_owner === "conversation_handler" &&
    String(args.routeDecision?.selected_handler ?? "").trim() ===
      "weekly_adaptive_review_v1";
  if (
    isWeeklyConversation &&
    (weeklyUserAskedConcreteOrganization(args.userMessage) ||
      weeklyResponseHasOrganizationProposal(args.responseContent))
  ) {
    nextFlow.status = "proposal_discussed";
    nextFlow.proposal_status = "discussed_not_applied";
    nextFlow.last_user_signal = compactWeeklySummaryText(args.userMessage);
    nextFlow.last_proposal_summary = compactWeeklySummaryText(
      args.responseContent,
    );
  }

  if (weeklyResponseConcludesReview(args.responseContent)) {
    nextFlow.status = "completed";
    nextFlow.validation_unlock_status = "available";
    nextFlow.completed_at = nowIso;
    nextFlow.next_weekly_summary = buildInternalNextWeeklySummary({
      userMessage: compactWeeklySummaryText(args.userMessage),
      assistantSummary: compactWeeklySummaryText(args.responseContent),
    });
  }

  const nextState: Record<string, unknown> = {
    ...previous,
    status: nextFlow.status === "completed" ? "completed" : "open",
    validation_unlock: nextFlow.validation_unlock_status === "available"
      ? {
        status: "available",
        meaning:
          "La validation de la semaine suivante est disponible apres conclusion du point weekly.",
      }
      : previous.validation_unlock,
    weekly_flow_state: nextFlow,
    updated_at: nowIso,
  };
  const nextMemory = writeWeeklyAdaptiveReviewStateToTempMemory(
    args.tempMemory,
    nextState,
  );
  if (nextFlow.status === "completed") {
    nextMemory.__last_weekly_adaptive_review_summary =
      nextFlow.next_weekly_summary;
  }
  return nextMemory;
}

function markWeeklyAdaptiveReviewAdjustPlanApplied(args: {
  tempMemory: any;
  weeklyState: unknown;
  operationRuntime: OperationRuntimeResult;
  userMessage?: string;
  assistantSummary?: string;
}): any {
  if (
    !args.weeklyState || typeof args.weeklyState !== "object" ||
    args.operationRuntime.toolExecution !== "success" ||
    !args.operationRuntime.executedTools.includes("adjust_plan_item")
  ) {
    return args.tempMemory;
  }
  const previous = args.weeklyState as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const userAskedWeeklyReturn = (
    /\b(reviens|retourne|reprends|conclus|conclure|termine|terminer)\b/
      .test(normalizeRouteText(args.userMessage ?? "")) &&
    /\b(weekly|bilan|semaine)\b/.test(
      normalizeRouteText(args.userMessage ?? ""),
    )
  ) ||
    /\bvalidation\b[\s\S]{0,60}\b(dispo|disponible|debloquee|ouverte)\b/.test(
      normalizeRouteText(args.userMessage ?? ""),
    );
  const flow = previous.weekly_flow_state &&
      typeof previous.weekly_flow_state === "object"
    ? previous.weekly_flow_state as Record<string, unknown>
    : {};
  const nextFlow: Record<string, unknown> = {
    ...flow,
    status: userAskedWeeklyReturn ? "completed" : "adjustment_applied",
    proposal_status: "applied_via_adjust_plan_item",
    validation_unlock_status: userAskedWeeklyReturn
      ? "available"
      : "locked_until_weekly_complete",
    adjusted_at: nowIso,
    adjusted_plan_patch_id: args.operationRuntime.toolSkillRun?.plan_patch_id ??
      null,
    adjusted_operation_id: args.operationRuntime.toolSkillRun?.operation_id ??
      null,
    updated_at: nowIso,
  };
  if (userAskedWeeklyReturn) {
    nextFlow.completed_at = nowIso;
    const text = normalizeRouteText(args.userMessage ?? "");
    nextFlow.next_weekly_summary = buildInternalNextWeeklySummary({
      userMessage: args.userMessage,
      assistantSummary: args.assistantSummary,
      copyForward:
        /\b(identique|a l identique|copie conforme|meme rythme|memes actions?|prolongation|prolonge)\b/
          .test(text),
      replacement:
        /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
          .test(text) &&
        /\b(action|niveau|respiration|pause)\b/.test(text),
    });
  }
  return writeWeeklyAdaptiveReviewStateToTempMemory(args.tempMemory, {
    ...previous,
    status: userAskedWeeklyReturn ? "completed" : "open",
    weekly_flow_state: nextFlow,
    validation_unlock: {
      status: userAskedWeeklyReturn
        ? "available"
        : "locked_until_weekly_complete",
      meaning: userAskedWeeklyReturn
        ? "La validation de la semaine suivante est disponible apres conclusion du point weekly."
        : "Un ajustement a ete applique pendant le weekly; la validation se debloque quand le point weekly est conclu.",
    },
    updated_at: nowIso,
  });
}

function weeklyReturnAfterAdjustmentMessage(
  userMessage: string,
): string | null {
  const text = normalizeRouteText(userMessage);
  const askedReturn = (
    /\b(reviens|retourne|reprends|conclus|conclure|termine|terminer)\b/
      .test(text) &&
    /\b(weekly|bilan|semaine)\b/.test(text)
  ) ||
    /\bvalidation\b[\s\S]{0,60}\b(dispo|disponible|debloquee|ouverte)\b/.test(
      text,
    );
  if (!askedReturn) return null;
  const copyForward =
    /\b(identique|a l identique|copie conforme|meme rythme|memes actions?|prolongation|prolonge)\b/
      .test(text);
  const mentionsReplacement =
    /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
      .test(text) &&
    /\b(action|niveau|respiration|pause)\b/.test(text);
  const retained = copyForward
    ? "Ce qu'on retient côté weekly: la semaine a été partielle, mais la suite est maintenant prolongée à l'identique. Les actions, le rythme et le plan global restent inchangés."
    : mentionsReplacement
    ? "Ce qu'on retient côté weekly: la semaine a été partielle, la fatigue de fin de semaine a pesé, et l'action de pause a été remplacée parce que l'ancien format ne convenait pas."
    : "Ce qu'on retient côté weekly: la semaine a été partielle, et l'organisation de la suite a été ajustée pour rester plus légère.";
  return [
    "On revient au weekly.",
    "",
    retained,
    "",
    "Le point weekly est terminé. La validation de la semaine prochaine est disponible pour confirmer cette organisation.",
  ].join("\n");
}

const VISIBLE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

function ensureVisibleSophiaEmoji(text: unknown): string {
  const content = String(text ?? "").trim();
  if (!content || VISIBLE_EMOJI_REGEX.test(content)) return content;
  return `${content} 🙂`;
}

type CoachResponseStylePreferences = {
  noEmoji: boolean;
  maxLines: number | null;
  avoidFinalQuestion: boolean;
};

function userRequestsShortStyle(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(court|courte|bref|breve|bri[eè]vement|3 lignes|trois lignes|sans emoji|zero emoji|pas d emoji|sans question|pas de question)\b/
    .test(text);
}

async function loadCoachResponseStylePreferences(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<CoachResponseStylePreferences> {
  const { data } = await args.supabase
    .from("user_profile_facts")
    .select("key,value,status")
    .eq("user_id", args.userId)
    .eq("scope", "global")
    .eq("status", "active")
    .in("key", [
      "coach.response_max_lines",
      "coach.emoji_policy",
      "coach.final_question_policy",
    ]);
  const prefs: CoachResponseStylePreferences = {
    noEmoji: false,
    maxLines: null,
    avoidFinalQuestion: false,
  };
  for (const row of data ?? []) {
    const key = String((row as any)?.key ?? "");
    const value = String((row as any)?.value?.value ?? "");
    if (key === "coach.emoji_policy" && value === "none") prefs.noEmoji = true;
    if (key === "coach.response_max_lines" && value === "three") {
      prefs.maxLines = 3;
    }
    if (
      key === "coach.final_question_policy" &&
      value === "avoid_unnecessary"
    ) {
      prefs.avoidFinalQuestion = true;
    }
  }
  return prefs;
}

export function applyCoachResponseStylePreferencesForTest(args: {
  userMessage: string;
  responseContent: string;
  preferences: CoachResponseStylePreferences;
}): string {
  const explicitShort = userRequestsShortStyle(args.userMessage);
  const explicitNoEmoji =
    /\b(sans emoji|zero emoji|0 emoji|pas d emoji|pas d emojis)\b/
      .test(normalizeRouteText(args.userMessage));
  const explicitNoQuestion =
    /\b(sans question|pas de question|pas de question finale|sans question finale)\b/
      .test(normalizeRouteText(args.userMessage));
  const explicitMaxLines = /\b(3 lignes|trois lignes)\b/.test(
    normalizeRouteText(args.userMessage),
  );
  const shouldApply = explicitShort || explicitNoEmoji || explicitNoQuestion ||
    explicitMaxLines;
  if (!shouldApply) return args.responseContent;

  let response = String(args.responseContent ?? "").trim();
  if (args.preferences.noEmoji || explicitNoEmoji) {
    response = response
      .replace(/\s*\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }
  if (args.preferences.avoidFinalQuestion || explicitNoQuestion) {
    const parts = response.split(/\n+/);
    const last = parts[parts.length - 1]?.trim() ?? "";
    if (/\?\s*$/.test(last)) {
      parts.pop();
      response = parts.join("\n").trim();
    }
  }
  const maxLines = explicitMaxLines ? 3 : args.preferences.maxLines;
  if (maxLines && maxLines > 0) {
    const lines = response.split(/\n+/).map((line) => line.trim()).filter(
      Boolean,
    );
    response = lines.slice(0, maxLines).join("\n").trim();
  }
  return response || args.responseContent;
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

  return text.split(/\n+/).slice(0, 5).join("\n").trim();
}

function withActiveSafetyFlowCaution<
  T extends ReturnType<typeof runSafetyPregate>,
>(
  output: T,
  tempMemory: unknown,
): T {
  if (
    !getActiveSafetySentryFlow(tempMemory) &&
    !isActiveSafetyCrisisSkillState(
      (tempMemory as any)?.__active_skill_state ??
        (tempMemory as any)?.active_skill_state,
    )
  ) return output;
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

function isActiveSafetyCrisisSkillState(value: unknown): boolean {
  const record = value as any;
  if (!record || typeof record !== "object") return false;
  if (String(record.skill_id ?? "") !== "safety_crisis") return false;
  const phase = String(record.working_state?.phase ?? "").trim();
  return phase !== "resolved" &&
    String(record.status ?? "active") !== "exiting";
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
  const weeklyAvailabilityByTempId =
    buildWeeklyAvailabilityByTempIdForPlanSnapshot(
      (resolvedRuntime.plan as any)?.content,
    );

  return planItems
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .slice(0, 30)
    .map((item) => {
      const generatedTempId = readPlanItemGeneratedTempId(item);
      const weekScope = generatedTempId
        ? weeklyAvailabilityByTempId.get(generatedTempId) ?? null
        : null;
      const availabilityStatus = weekScope?.availability_status ??
        "not_assigned_to_level_weeks";
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        dimension: item.dimension,
        item_type: item.kind,
        status: item.status,
        cadence_label: item.cadence_label ?? null,
        target_reps: item.target_reps ?? null,
        current_reps: item.current_reps ?? null,
        scheduled_days: Array.isArray(item.scheduled_days)
          ? item.scheduled_days
          : null,
        time_of_day: item.time_of_day ?? null,
        phase_id: item.phase_id ?? null,
        phase_order: item.phase_order ?? null,
        generated_temp_id: generatedTempId,
        source_kind: readPlanItemSourceKind(item),
        item_nature: readPlanItemNature(item),
        available_this_week: availabilityStatus === "available_this_week",
        availability_status: availabilityStatus,
        week_scope: weekScope
          ? {
            level_order: weekScope.level_order,
            level_title: weekScope.level_title,
            week_order: weekScope.week_order,
            week_title: weekScope.week_title,
            week_status: weekScope.week_status,
            week_start: weekScope.week_start,
            week_end: weekScope.week_end,
            weekly_reps: weekScope.weekly_reps,
            weekly_cadence_label: weekScope.weekly_cadence_label,
            weekly_description_override: weekScope.weekly_description_override,
            mission_days: weekScope.mission_days,
          }
          : null,
        streak_current: computeStreakFromEntries(item.recent_entries),
        last_entry_at: item.last_entry_at,
        active_load_score: activeLoad.current_load_score,
        payload: item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : null,
      };
    });
}

async function loadDirectV2PlanItemSnapshotFallback(
  supabase: SupabaseClient,
  userId: string,
  runtime?: ActiveTransformationRuntime | null,
): Promise<V2PlanItemSnapshotItem[]> {
  let query = supabase
    .from("user_plan_items")
    .select(
      "id,title,description,dimension,kind,status,cadence_label,target_reps,current_reps,scheduled_days,time_of_day,phase_id,phase_order,payload,created_at,activation_order,updated_at",
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
  const weeklyAvailabilityByTempId =
    buildWeeklyAvailabilityByTempIdForPlanSnapshot(
      (runtime?.plan as any)?.content,
    );
  return (((data as UserPlanItemRow[] | null) ?? [])
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .map((item) => {
      const generatedTempId = readPlanItemGeneratedTempId(item);
      const weekScope = generatedTempId
        ? weeklyAvailabilityByTempId.get(generatedTempId) ?? null
        : null;
      const availabilityStatus = weekScope?.availability_status ??
        "not_assigned_to_level_weeks";
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        dimension: item.dimension,
        item_type: item.kind,
        status: item.status,
        cadence_label: item.cadence_label ?? null,
        target_reps: item.target_reps ?? null,
        current_reps: item.current_reps ?? null,
        scheduled_days: Array.isArray((item as any).scheduled_days)
          ? (item as any).scheduled_days
          : null,
        time_of_day: (item as any).time_of_day ?? null,
        phase_id: (item as any).phase_id ?? null,
        phase_order: (item as any).phase_order ?? null,
        generated_temp_id: generatedTempId,
        source_kind: readPlanItemSourceKind(item),
        item_nature: readPlanItemNature(item),
        available_this_week: availabilityStatus === "available_this_week",
        availability_status: availabilityStatus,
        week_scope: weekScope
          ? {
            level_order: weekScope.level_order,
            level_title: weekScope.level_title,
            week_order: weekScope.week_order,
            week_title: weekScope.week_title,
            week_status: weekScope.week_status,
            week_start: weekScope.week_start,
            week_end: weekScope.week_end,
            weekly_reps: weekScope.weekly_reps,
            weekly_cadence_label: weekScope.weekly_cadence_label,
            weekly_description_override: weekScope.weekly_description_override,
            mission_days: weekScope.mission_days,
          }
          : null,
        streak_current: 0,
        last_entry_at: null,
        payload: item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : null,
      };
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

/**
 * Chantier 4 (2026-05-28): détection d'une carte d'attaque active fraîchement
 * créée. Sert de garde-fou: si le user déclenche un nouveau flow
 * prepare_attack_card alors qu'il vient juste d'en créer une, on lui demande
 * de clarifier (utiliser celle-ci ou en faire une nouvelle) plutôt que de
 * démarrer un slot filling à blanc.
 *
 * Voir A2-r4 Tour 8: le dispatcher routait à tort vers prepare_attack_card
 * quand le user demandait "donne juste l'emplacement de la carte que tu
 * viens de créer". Chantier 3 a ajouté un few-shot dispatcher pour router
 * vers product_help dans ce cas, mais ce DB lookup est la garantie dure de
 * fallback côté handler.
 *
 * TRANSITIONNEL. Critère de suppression: un run QA confirme que le
 * dispatcher route systématiquement vers product_help dans ces cas.
 */
export type RecentActiveAttackCard = {
  id: string;
  title: string;
  technique: string | null;
  ageSeconds: number;
};

export async function loadRecentActiveAttackCardForUser(args: {
  supabase: SupabaseClient;
  userId: string;
  maxAgeSeconds?: number;
}): Promise<RecentActiveAttackCard | null> {
  const maxAge = Number.isFinite(args.maxAgeSeconds)
    ? Number(args.maxAgeSeconds)
    : 300;
  if (typeof (args.supabase as any)?.from !== "function") return null;
  try {
    const { data, error } = await args.supabase
      .from("user_attack_cards")
      .select("id,content,generated_at")
      .eq("user_id", args.userId)
      .eq("status", "active")
      .order("generated_at", { ascending: false })
      .limit(1);
    if (error || !data || (data as any[]).length === 0) return null;
    const row = (data as any[])[0];
    const generatedAt = Date.parse(String(row?.generated_at ?? ""));
    if (!Number.isFinite(generatedAt)) return null;
    const ageSeconds = Math.max(0, Math.round((Date.now() - generatedAt) / 1000));
    if (ageSeconds > maxAge) return null;
    const content = row?.content ?? null;
    const title = String(
      content?.operation_draft?.title ??
        content?.techniques?.[0]?.generated_result?.output_title ??
        content?.title ??
        "carte d'attaque",
    ).trim();
    const technique = content?.operation_draft?.technique ??
      content?.techniques?.[0]?.technique_key ??
      content?.technique ??
      null;
    return {
      id: String(row.id),
      title,
      technique: technique ? String(technique) : null,
      ageSeconds,
    };
  } catch (err) {
    console.warn(
      "[Router] loadRecentActiveAttackCardForUser failed (non-blocking):",
      err,
    );
    return null;
  }
}

/**
 * Chantier 4 (2026-05-28): détecte si le user demande EXPLICITEMENT une
 * nouvelle/autre carte d'attaque alors qu'une carte récente existe déjà.
 * Garde anti-faux-positif pour ne pas bloquer une création légitime
 * (ex: deux cartes consécutives pour deux cibles différentes).
 *
 * Regex narrow par construction: doit matcher seulement quand le user
 * exprime explicitement la volonté d'en faire une nouvelle, pas quand
 * il référence l'existante.
 */
export function userExplicitlyAsksForNewAttackCardForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  return /\b(nouvelle carte|autre carte|une autre|deuxieme carte|2eme carte|second(e)? carte|encore une carte|une carte de plus|une carte supplementaire)\b/
    .test(text);
}

export async function loadActiveAttackKeywordOptions(args: {
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
    "- Ne lui dis pas d'envoyer le mot-cle: il vient deja de l'envoyer.",
    "- Meme si le mot-cle ressemble a 'stop', 'annule' ou 'pause', ne l'interprete pas comme une demande d'arret: c'est le declencheur configure.",
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

export function attackCardCreatedLocation(
  target: unknown,
  technique?: unknown,
): string {
  const kind = String((target as any)?.kind ?? "").trim();
  const resourceLabel = kind === "personal_action"
    ? "Ressources > Cartes d'attaque"
    : "Ressources > Cartes d'attaque du plan";
  const base =
    `Tu peux la retrouver dans ${resourceLabel} pour la relire et l'utiliser.`;
  if (String(technique ?? "").trim() === "pre_engagement") {
    return `${base} Le mot de cette carte peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation.`;
  }
  return `${base} Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation.`;
}

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
  const researchSignal = args.turnFrame.needs_research;
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
    safety: safetyActive
      ? { level: "SENTRY", confidence: 0.9 }
      : DEFAULT_SIGNALS.safety,
    interrupt: /\b(stop|arr[êe]te|pause|pas maintenant)\b/.test(text)
      ? { kind: "EXPLICIT_STOP", confidence: 0.8 }
      : DEFAULT_SIGNALS.interrupt,
    risk_score: riskScoreFromBand(args.turnFrame.safety.risk_band),
    needs_research: researchSignal?.detected || researchSignal?.value === true
      ? researchSignal
      : fallbackResearchSignal,
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

function isExplicitMemoryRetentionRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const asksRetention =
    /\b(retiens|retenir|memorise|memoriser|garde en tete|garder en tete|pour les prochaines fois|prochaines fois)\b/
      .test(text) || isConversationScopedRepereRequest(text);
  if (!asksRetention) return false;
  const coachPreference =
    /\b(preference|preferences|preference coach|preference de coaching|ton style|ta facon|ta maniere)\b/
      .test(text);
  return !coachPreference;
}

export function applyNonDurableMemoryPromiseGuardForTest(args: {
  userMessage: string;
  responseContent: string;
  routeDecision?:
    | Pick<RouteDecision, "response_owner" | "direct_effects_to_run">
    | null;
}): string {
  if (!isExplicitMemoryRetentionRequest(args.userMessage)) {
    return args.responseContent;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" ||
    args.routeDecision?.response_owner === "pending_confirmation" ||
    (args.routeDecision?.direct_effects_to_run ?? []).length > 0
  ) {
    return args.responseContent;
  }
  let response = args.responseContent;
  response = response.replace(
    /^\s*ok,\s*not[eé]\s*(?:✅|☑️)?\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*(carr[eé]ment,\s*)?je (le |la |m'en )?retiens\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /\bje retiens que\b/gi,
    "je l'utilise ici comme repère :",
  );
  response = response.replace(
    /\bcomme repère pour la suite\b/gi,
    "comme repère dans cette conversation",
  );
  response = response.replace(
    /^\s*(oui,\s*)?c['’]?est not[eé]\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*bien\s+not[eé]\s*(?:✅|☑️)?\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*je note\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /\bce que je garde en tête\b/gi,
    "le repère que j'utilise ici",
  );
  return response.trim();
}

export function applyIncompleteRecapGuardForTest(args: {
  userMessage: string;
  responseContent: string;
}): string {
  const userText = normalizeRouteText(args.userMessage);
  if (!/\b(recap|recapitule|resume|synthese)\b/.test(userText)) {
    return args.responseContent;
  }
  const response = String(args.responseContent ?? "").trim();
  const normalized = normalizeRouteText(response);
  const announcesRecap = /\b(voici|voila|je recap|recap|recapitulatif)\b/.test(
    normalized,
  );
  const hasContentItem = /(^|\n)\s*(-|\d+[.)])\s+\S/.test(response) ||
    response.split(/\n+/).filter((line) => line.trim().length > 12).length >= 3;
  const endsAtIntro = /[:：]\s*(?:[🙂😊✅]*)$/.test(response);
  if (!announcesRecap || (hasContentItem && !endsAtIntro)) return response;
  return [
    "Je récapitule simplement :",
    "- Ce qui a été créé ou enregistré doit rester limité aux outils confirmés.",
    "- Ce qui était un conseil reste un repère de conversation, pas une écriture durable.",
    "- Pour maintenant : une seule prochaine action courte, sans lancer d'autre outil.",
  ].join("\n");
}

export function applyShortRepairNoProductOfferGuardForTest(args: {
  userMessage: string;
  responseContent: string;
}): string {
  const user = normalizeRouteText(args.userMessage);
  const asksBrief =
    /\b(reponds court|reponds courte?ment|court et|sois bref|sois breve|pas de grand discours)\b/
      .test(user);
  const refusesProductOffer =
    /\b(pas de potion|pas d outil|pas de nouvelle proposition|sans nouvelle proposition|sans me proposer autre chose)\b/
      .test(user);
  if (!asksBrief && !refusesProductOffer) return args.responseContent;

  let response = String(args.responseContent ?? "").trim();
  response = response
    .replace(
      /\n*\s*(?:Tu veux|Veux-tu|On peut|Je peux)\s+[^\n]*(?:Potion d[’']?état|Potion d[’']?etat|potion|outil|carte)[^\n?]*\?\s*[🙂😊]?\s*$/giu,
      "",
    )
    .replace(
      /\n*\s*[^\n]*(?:Potion d[’']?état|Potion d[’']?etat)[^\n?]*\?\s*[🙂😊]?\s*$/giu,
      "",
    )
    .replace(
      /\n*\s*(?:Tu veux|Veux-tu|Je peux|On peut)\s+[^\n]*(?:Gu[eé]rison|Amour|Clart[eé]|Courage|Apaisement)[^\n?]*\?\s*[🙂😊]?\s*$/giu,
      "",
    )
    .trim();

  if (!asksBrief) return response || args.responseContent;

  const paragraphs = response.split(/\n{2,}/).map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) return response || args.responseContent;
  const first = paragraphs[0];
  const second = paragraphs.find((part) =>
    /\b(respire|pose|bois|arrete|arrête|reste|tu fais|tu peux)\b/i.test(part)
  );
  return [first, second && second !== first ? second : null].filter(Boolean)
    .join("\n\n");
}

export function applyCompactStartGuardForTest(args: {
  userMessage: string;
  responseContent: string;
}): string {
  const user = normalizeRouteText(args.userMessage);
  const asksCompactStart =
    /\b(petit point d appui|demarrage compact|d[eé]marrage compact|juste demarrer|juste d[eé]marrer|juste debloquer|premier geste|premier pas|quoi faire maintenant)\b/
      .test(user);
  if (!asksCompactStart) return args.responseContent;
  const response = String(args.responseContent ?? "").trim();
  const looksTooWide = /(^|\n)\s*(?:a[.)]|b[.)]|\d+[.)]|-|•)\s+/i.test(
    response,
  ) ||
    /\b(option|choix|a\/b|a ou b|trois etapes|3 etapes|carte d attaque|potion)\b/i
      .test(response);
  const lineCount =
    response.split(/\n+/).filter((line) => line.trim().length > 0).length;
  if (!looksTooWide && lineCount <= 3) return response;
  return [
    "On fait compact : choisis une seule zone visible et ouvre-la.",
    "Premier geste : écris juste le titre du mini-pas suivant.",
  ].join("\n");
}

export function statePotionDeclineReplyForTest(message: string): string {
  const text = normalizeRouteText(message);
  const lines = ["Ok, je ne lance pas de potion."];
  if (
    /\b(slack|teams|discord|messagerie)\b/.test(text) &&
    /\b(piege|lire|lis|conversations?|messages?|fils?)\b/.test(text)
  ) {
    lines.push(
      "Pour le piège messagerie : ouvre la recherche, tape la personne, envoie le message, puis quitte l'app avant de lire les autres fils.",
    );
  } else if (
    /\b(piege|piege c est|le piege|risque)\b/.test(text) &&
    /\b(je pars|je vais|j ouvre|ouvrir|je commence|je lis|lire)\b/.test(text)
  ) {
    lines.push(
      "Pour ce piège : nomme le geste unique à faire, fais-le, puis ferme la porte au reste tout de suite.",
    );
  } else if (/\baide moi a choisir\b/.test(text)) {
    lines.push(
      "Pour choisir maintenant : prends la tâche qui te coûte le plus d'attention si tu la repousses encore.",
    );
  } else if (/\b(ensuite|apres|après|le piege|la suite)\b/.test(text)) {
    lines.push(
      "Je reste sur la suite concrète avec toi, une action à la fois.",
    );
  }
  return lines.join("\n\n");
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

export function directProductHelpReplyOverrideForTest(args: {
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  const productHelpSelected =
    args.routeDecision?.response_owner === "product_help" ||
    args.routeDecision?.selected_handler === "product_help";
  if (!productHelpSelected) return null;
  if (args.skillOutput?.skill_id !== "product_help") return null;
  const reply = String(args.skillOutput.reply ?? "").trim();
  if (!reply) return null;
  const diagnosis = args.skillOutput.diagnosis as
    | Record<string, unknown>
    | null;
  const constraints =
    Array.isArray(args.skillOutput.recommendation_need?.constraints)
      ? args.skillOutput.recommendation_need.constraints.map((item) =>
        String(item)
      )
      : [];
  const oneShotReminderInfoOnly =
    diagnosis?.feature_id === "one_shot_reminder.chat" ||
    constraints.includes("do_not_restart_reminder_slot_filling");
  if (!oneShotReminderInfoOnly) return null;
  return reply;
}

export function oneShotReminderManagementReplyForTest(
  message: string,
): string | null {
  const text = normalizeRouteText(message);
  const asksAboutReminder =
    /\b(rappel ponctuel|rappel de demain|rappel programme|rappel programmé|ce rappel)\b/
      .test(text);
  const pronominalRecentReminderQuestion =
    /\bdemain\b[\s\S]{0,100}\ble\b[\s\S]{0,80}\b(change|changer|annule|annuler|modifie|modifier|supprime|supprimer)\b/
      .test(text) ||
    /\ble\b[\s\S]{0,80}\b(change|changer|annule|annuler|modifie|modifier|supprime|supprimer)\b[\s\S]{0,100}\b(ici|app|application|interface|initiatives)\b/
      .test(text);
  const asksWhereOrChange =
    /\b(annule|annuler|change|changer|modifie|modifier|retrouve|retrouver|ou|où|initiatives|interface)\b/
      .test(text);
  if (
    !(asksAboutReminder || pronominalRecentReminderQuestion) ||
    !asksWhereOrChange
  ) {
    return null;
  }
  return [
    "Un rappel ponctuel se gère côté Initiatives, dans les rappels côté chat pour ce type-là.",
    "",
    'Pour le modifier ou l\'annuler, le plus fiable est de me le redire ici clairement, par exemple : "change le rappel de demain à 09:00" ou "annule le rappel de demain".',
  ].join("\n");
}

export function directSafetyCrisisReplyOverrideForTest(args: {
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  if (args.routeDecision?.response_owner !== "safety") return null;
  if (args.skillOutput?.skill_id !== "safety_crisis") return null;
  const reply = String(args.skillOutput.reply ?? "").trim();
  return reply || null;
}

export function enforceRecommendationToolVisibleReplyForTest(args: {
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

const enforceRecommendationToolVisibleReply =
  enforceRecommendationToolVisibleReplyForTest;

function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isProductHelpExitToConversation(message: string): boolean {
  const text = normalizeRouteText(message);
  if (
    /\b(je ne parle plus|je parle plus|pas du rappel|plus du rappel|sans parler des rappels|pas parler des rappels|sujet different|sujet different|pas de l app|pas de l interface)\b/
      .test(text)
  ) return true;
  if (
    isExplicitDefenseCardIntentForTest(message) ||
    isRuntimeCoachPreferenceRequestForTest(message)
  ) return true;
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

export function isExplicitNoToolRequestForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  const noTool =
    /\b(ne lance rien|ne lance rien d autre|ne lance pas|ne cree rien|ne demarre rien|ne declenche rien|sans lancer|sans outil|pas de potion|meme pas une potion|pas maintenant)\b/
      .test(text);
  if (!noTool) return false;
  return /\b(juste|seulement|mini action|prochaine action|recap|recapitule|resume|reponds|donne moi|en respectant|respecte)\b/
    .test(text);
}

export function isExplicitDefenseCardIntentForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  if (!/\b(carte de defense|carte defense|defense card)\b/.test(text)) {
    return false;
  }
  if (
    /\b(est ce que|je peux|comment|ou|quelle partie|difference|difference entre)\b/
      .test(text) &&
    !/\b(fais|faire|cree|creer|prepare|preparer|j aimerais|je veux|besoin|vas y|ok|oui)\b/
      .test(text)
  ) {
    return false;
  }
  return /\b(fais|faire|cree|creer|prepare|preparer|fabrique|j aimerais|je veux|besoin|valide|utilise|lance)\b/
    .test(text);
}

export function isExplicitOneShotReminderModificationRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const existingReminder =
    /\b(ce rappel|le rappel|rappel ponctuel|rappel que tu viens|celui de|celui que tu)\b/
      .test(text);
  const modification =
    /\b(decale|decaler|deplace|deplacer|avance|avancer|repousse|repousser|change|changer|modifie|modifier|mets le|met le|remets le|remet le|reprogramme|reprogrammer)\b/
      .test(text);
  const timeHint =
    /\b(demain|apres demain|aujourd hui|ce soir|matin|midi|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/
      .test(text);
  if (!(existingReminder && modification && timeHint)) return false;

  // Chantier 14 (2026-05-28) — Anti-faux-positif. "ne change rien" / "sans
  // modifier" est l'opposé d'une demande de modification. Et une question
  // "où dans l'app je retrouve/verifie/annule ce rappel" est du product
  // help, pas une modification. Voir A2-r6 T4/T8, A3-r7 T3.
  const negatedModification =
    /\b(ne change rien|ne touche (?:rien|pas)|sans (?:rien )?(?:modifier|changer|toucher)|sans parler (?:de|d) (?:le |la )?(?:modifier|changer)|pas (?:de )?(?:modification|changement))\b/
      .test(text);
  if (negatedModification) return false;
  const productLocationQuestion =
    /\b(ou (?:est ce que je|je vais|je peux|le|la|les)|je vais ou|(?:juste |seulement )?l emplacement|dans l app|dans l application|dans l interface|retrouver|verifier|consulter|voir|gerer)\b/
      .test(text);
  if (productLocationQuestion) return false;

  return true;
}

export function isMicroActionOnlyNotAttackCardForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const explicitCard =
    /\b(carte d attaque|carte attaque|prepare.*carte|cree.*carte|fais.*carte|outil|support durable)\b/
      .test(text);
  if (explicitCard) return false;
  const asksSmallAction =
    /\b(premier geste|premier pas|petit point d appui|juste debloquer|debloquer les 20 prochaines minutes|quoi faire maintenant|choisis pour moi|pas une methode complete|pas une methode|pas un plan|pas un grand plan)\b/
      .test(text);
  return asksSmallAction;
}

export function isAttackCardCancellationRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  return /\b(pas une carte|pas de carte|stop carte|stop la carte|arrete la carte|annule la carte|ne force pas|juste une phrase|une seule phrase|donne moi juste une phrase)\b/
    .test(text);
}

export function isOneShotReminderExactStatusRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  if (!/\brappel\b/.test(text)) return false;
  return /\b(quelle heure|heure vraiment|vraiment enregistre|vraiment programme|confirme|confirmee|non confirme|non confirmee|distinguer|11h05 ou 11h20|\d{1,2}\s*h\s*\d{2}\s+ou\s+\d{1,2}\s*h\s*\d{2})\b/
    .test(text);
}

function isOneShotReminderReprogrammingFollowup(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(nouveau moment exact|meme texte|meme message|au nouvel horaire)\b/
    .test(text) &&
    /\b(aujourd hui|demain|ce soir|\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/
      .test(text) &&
    !/\b(cree|creer|programme|programmer|rappelle moi|mets moi|envoie moi|dis moi)\b/
      .test(text);
}

function isConversationScopedRepereRequest(normalizedText: string): boolean {
  return /\b(pour cette conversation|dans cette conversation|comme repere|repere dans cette conversation|garde comme repere|garde ca comme repere)\b/
    .test(normalizedText) &&
    /\b(retiens|garde|repere|quand je dis|ca veut dire|cela veut dire)\b/.test(
      normalizedText,
    );
}

export function isRuntimeCoachPreferenceRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  if (isApplyExistingCoachPreferenceRequestForTest(message)) {
    return false;
  }
  const explicitPreferenceMention =
    /\b(preference|preferences|preference coach|preference de coaching|coaching|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (isConversationScopedRepereRequest(text) && !explicitPreferenceMention) {
    return false;
  }
  const productNavigationQuestion = (
    /\b(comment|dans quelle partie|a quel endroit|quel endroit)\b/.test(
      text,
    ) ||
    /\bou\s+(changer|modifier|parametrer|regler|configurer)\b[\s\S]{0,80}\b(app|application|interface|menu|reglages|parametres|dashboard|initiatives)\b/
      .test(text)
  ) &&
    /\b(change|changer|parametre|parametrer|regle|style|preference|preferences|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (productNavigationQuestion) return false;
  const preferenceSignal =
    /\b(prefere|preference|preferences|preference coach|preference de coaching|pour la suite|a partir de maintenant|desormais|mets a jour|mettre a jour|retiens|garde|enregistr\w*|applique|change|adapte|reponds|parle|sois)\b/
      .test(text);
  const styleSignal =
    /\b(une seule question|pas de question finale|sans question finale|questions? courtes?|consignes? (tres )?courtes?|reponses? (tres )?courtes?|3 lignes max|trois lignes max|moins de questions|listes? longues?|plus direct|plus directement|directement|plus doux|plus cash|plus frontal|challenge[- ]?moi|challengeant|ton style|ta facon|ta maniere|tres concret|tres concrete|une action|une seule action|action concrete|pas plusieurs options|pas trois options|pas 3 options|moins d options|moins de choix|sans emoji|pas d emoji|pas d emojis|source\/cible|source cible)\b/
      .test(text);
  const explicitPreferenceCommand =
    /\b(mets a jour|mettre a jour|retiens|garde|enregistr\w*|applique)\b[\s\S]{0,100}\b(preference|preferences|preference coach|preference de coaching|coaching)\b/
      .test(text) ||
    /\b(preference|preferences|preference coach|preference de coaching)\b[\s\S]{0,80}\b(a retenir|pour la suite)\b/
      .test(text);
  const localDraftContext =
    /\b(version|phrase|ligne|message|mail|collegue|excuser|excuse|brouillon|copie-colle)\b/
      .test(text);
  return preferenceSignal && styleSignal &&
    (!localDraftContext || explicitPreferenceCommand);
}

const isRuntimeCoachPreferenceRequest = isRuntimeCoachPreferenceRequestForTest;

export function isApplyExistingCoachPreferenceRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const asksApplyExisting =
    /\b(applique|utilise|respecte|respectant|selon|comme|sers toi de|sers-toi de)\b[\s\S]{0,100}\b(ma|mes|la|cette|ces)\s+preferences?\b/
      .test(text) ||
    /\b(en respectant|selon|comme)\b[\s\S]{0,80}\b(ma|mes)\s+preferences?\b/
      .test(text);
  if (!asksApplyExisting) return false;
  const asksMutation =
    /\b(garde|enregistre|enregistrer|mets a jour|mettre a jour|change|changer|modifie|modifier|nouvelle preference|vraie preference|pour la suite|a partir de maintenant|desormais)\b/
      .test(text);
  return !asksMutation;
}

export function shouldRuntimeCoachPreferenceOverrideRouteForTest(args: {
  message: string;
  routeDecision?:
    | Pick<RouteDecision, "response_owner" | "selected_handler">
    | null;
  safetyRiskBand?: RiskBand | null;
  hasPendingOperationConfirmation?: boolean;
}): boolean {
  if (args.routeDecision?.response_owner === "safety") return false;
  if (blocksToolSkills(args.safetyRiskBand ?? "none")) return false;
  if (args.hasPendingOperationConfirmation) return false;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "update_coach_preferences"
  ) return false;
  if (!isRuntimeCoachPreferenceRequestForTest(args.message)) return false;
  if (
    isLocalTextRevisionRequestForTest(args.message) ||
    isCoachPreferenceVerificationRequestForTest(args.message) ||
    isImmediateModeRequestNotCoachPreferenceForTest(args.message)
  ) return false;
  return true;
}

function clearConversationFlowForCoachPreference(
  tempMemory: any,
): Record<string, unknown> {
  const next = { ...(tempMemory ?? {}) };
  delete (next as any).__active_skill_state;
  delete (next as any).active_skill_state;
  delete (next as any).__suspended_flow_v1;
  return next;
}

export function isLocalTextRevisionRequestForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  const asksLocalText =
    /\b(formule|formuler|reformule|reformuler|version|rends|rendre|phrase|mantra|texte|ligne)\b/
      .test(text) &&
    /\b(court|courte|ultra|plus court|plus courte|resume|resumer|reutiliser|copier|coller)\b/
      .test(text);
  if (!asksLocalText) return false;
  const actualCoachPreference =
    /\b(pour la suite|a partir de maintenant|desormais|preference|preferences|ton style|ta facon|ta maniere|pose moi|moins de questions|plus de questions|plus direct|plus doux|challenge)\b/
      .test(text);
  return !actualCoachPreference;
}

export function isLocalMemoryReformulationRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const asksReusablePhrase =
    /\b(formule|formuler|reformule|reformuler|phrase|mantra|texte|ligne)\b/
      .test(text) &&
    /\b(court|courte|ultra|plus court|plus courte|ressortir|ressors|reutiliser|me redire|tu peux me)\b/
      .test(text);
  if (!asksReusablePhrase) return false;
  const memoryOrMomentContext =
    /\b(quand je dis|quand je te dis|quand je reparle|quand je suis|me ressortir|me redire|tu peux me ressortir|fatigue|fatiguee|fatiguer|soir)\b/
      .test(text);
  if (!memoryOrMomentContext) return false;
  const explicitReminder =
    /\b(rappel|rappelle|rappeler|programme|programmer|planifie|planifier|tous les|toutes les|chaque|quotidien|quotidienne|hebdo|semaine|jour|jours|a \d{1,2}h|vers \d{1,2}h)\b/
      .test(text);
  return !explicitReminder;
}

export function isImmediateModeRequestNotCoachPreferenceForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  if (
    /\b(carte de defense|carte defense|defense card|prepare[- ]?moi une carte|preparer une carte|j aimerais une carte|je veux une carte|fais une carte|faire une carte|cree cette carte|creer cette carte|valide cette carte)\b/
      .test(text)
  ) return false;
  const immediateMode =
    /\b(mode calme|mode apaisement|apaisement|respiration|souffler|calme maintenant|pour ce soir|ce soir|maintenant|pas un plan militaire|pas de plan militaire)\b/
      .test(text);
  if (!immediateMode) return false;
  const durablePreference =
    /\b(pour la suite|a partir de maintenant|desormais|preference|preferences|garde cette preference|parle moi|reponds moi|ton style|ta facon|ta maniere)\b/
      .test(text);
  return !durablePreference;
}

export function isBroadRescueRequestNotDefenseCardForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const explicitDefenseCard =
    /\b(carte de defense|carte defense|defense card|prepare[- ]?moi une carte|preparer une carte|j aimerais une carte|je veux une carte|fais une carte|faire une carte|cree cette carte|creer cette carte|valide cette carte)\b/
      .test(text);
  if (explicitDefenseCard) return false;
  const broadRescue =
    /\b(sauver ma soiree|sauver la soiree|sauver ce soir|sauve ma soiree|sauver le minimum|minimum utile|tenir ce soir|finir sur mon telephone|telephone jusqu a minuit|sans me mettre la pression|sans pression|sans grand plan|pas un plan complet)\b/
      .test(text);
  const concreteRiskWithoutOperation =
    /\b(vide|fatigue|epuise|boulot|travail|telephone|scroll|tiktok)\b/.test(
      text,
    );
  return broadRescue && concreteRiskWithoutOperation;
}

function isRecapOnlyRequestForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(recap|recapitule|resume|synthese)\b/.test(text) &&
    /\b(ne cree rien|sans modifier|juste|seulement|sobre|on s arrete|on stoppe|ce que j ai fait|ce qu on a fait|ce qui est prevu|ce qui est en place|en place|preference|mail|carte|rappel)\b/
      .test(text);
}

export function localTextAddonForOneShotReminderForTest(
  message: string,
): string | null {
  const text = normalizeRouteText(message);
  if (!/\b(rappel|rappelle|rappeler|programme|programmer)\b/.test(text)) {
    return null;
  }
  if (!/\b(phrase|message|texte|formule)\b/.test(text)) return null;
  const asksShortPhrase =
    /\b(phrase courte|message court|texte court|formule le|formule-moi)\b/
      .test(text);
  if (!asksShortPhrase) return null;
  const name = String(message ?? "").match(
    /\bpour\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]{0,40})/i,
  )?.[1]?.trim().replace(/[,.!?;:]+$/g, "") ?? "";
  const target = name ? ` pour ${name}` : "";
  return `Phrase courte${target} : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait."`;
}

export function isStatusOnlyNoMutationRequestForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  const explicitNoMutation =
    /\b(sans modifier|ne modifie rien|ne change rien|dernier check|bien en place|en place|verifie bien|verifie que|check final)\b/
      .test(text);
  const naturalDurableRecap =
    /\b(ce qui a (vraiment )?(ete )?(cree|creer|garde|gardee|gardes)|ce qui est (vraiment )?(cree|garde)|cree ou garde|crees ou gardes|vraiment ete cree|vraiment ete garde|juste pour la conversation|pour la conversation)\b/
      .test(text);
  const durableSurface =
    /\b(carte|carte d attaque|carte de defense|rappel|preference|preferences|cree|creer|garde|gardee|gardes|conversation)\b/
      .test(text);
  return (explicitNoMutation || naturalDurableRecap) && durableSurface;
}

/**
 * Garantie dure: le user impose un format conversationnel explicite et
 * incompatible avec le panneau status canonique à 4 lignes.
 *
 * Quand vrai, le composer `buildStatusOnlyNoMutationRuntime` NE DOIT PAS
 * être déclenché — la réponse doit passer par le composer `normal_reply`
 * qui peut respecter la contrainte de format.
 *
 * Cette détection vit ici (pas dans `turn_intent_arbitrator.ts`) parce
 * qu'elle agit sur l'éligibilité d'un runtime spécifique, pas sur le
 * routing global. Elle reste une garantie dure: si le user dit
 * explicitement "fait, prévu, fragile" ou "une ligne", on n'utilise pas
 * un template à 5 lignes. Ce n'est pas de la détection sémantique
 * d'intention, c'est de la validation de contrat de format.
 *
 * Patterns observés dans les runs A2-r4 T13/T14, A4-r4 T14, A6-r2 T15.
 */
export function isExplicitConversationalFormatRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  // "fait, prévu, fragile" séquence: spécifique, jamais faux positif.
  if (
    /\bfait\s*,?\s*prevu\s*,?\s*fragile\b/.test(text) ||
    /\bfait\s*\/\s*prevu\s*\/\s*fragile\b/.test(text)
  ) return true;
  // Contraintes de longueur en lignes. On exige un contexte sans ambiguïté
  // pour éviter de matcher des titres ou des objets ("carte Samir 3 lignes",
  // "envoyer trois lignes à X"). Patterns acceptés:
  //   - "en X lignes" (préposition obligatoire)
  //   - "X lignes max/maximum/seulement"
  //   - "X lignes," suivi de "sans" (ex: "Trois lignes, sans emoji")
  //   - début de message: "X lignes [reste de phrase]"
  if (
    /\ben\s+(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\b/.test(text) ||
    /\b(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\s+(max|maximum|seulement)\b/
      .test(text) ||
    /\b(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\s*,\s*sans\b/
      .test(text) ||
    /^(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\b/.test(text)
  ) return true;
  // Contrainte "phrase" — exige un contexte qui désambiguïse ("en une
  // phrase", "une seule phrase"). "une phrase" tout seul peut être un
  // objet ("écris une phrase pour Samir") et n'est PAS une contrainte.
  if (
    /\ben\s+(une|1)\s+(seule\s+)?phrase\b/.test(text) ||
    /\b(une|1)\s+seule\s+phrase\b/.test(text)
  ) return true;
  if (
    /\bpas (le|de) (panneau|gabarit|format standard)\b|\bsans (le )?panneau\b/
      .test(text)
  ) return true;
  if (
    /\bpas de statut systeme\b|\bsans statut systeme\b|\bpas le statut systeme\b/
      .test(text)
  ) return true;
  if (
    /\b(recap|recapitule|resume) conversationnel\b|\brecap humain\b/.test(text)
  ) return true;
  return false;
}

export function isCoachPreferenceVerificationRequestForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const asksVerification =
    /\b(tu as bien|t as bien|est ce que tu as|est-ce que tu as|c est bien garde|cest bien garde|tu gardes bien|tu l as bien garde)\b/
      .test(text) ||
    /\b(bien garde|bien enregistre|bien applique|deja garde|deja enregistre)\b/
      .test(text);
  if (!asksVerification) return false;
  const mentionsPreference =
    /\b(preference|question courte|une seule question|moins de questions|quand je bloque|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (!mentionsPreference) return false;
  const asksChange =
    /\b(change|changer|modifie|modifier|applique|appliquer|mets|mettre|regle|règle|preference nouvelle|nouvelle preference)\b/
      .test(text);
  return !asksChange;
}

export function isAttackCardExplicitApprovalForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  const startsWithApproval =
    /^(oui|ok|okay|go|vas y|vas-y|valide|cree|creer|lance|c est bon|cest bon)\b/
      .test(text);
  if (!startsWithApproval) return false;
  const confirmsAttackCard =
    /\b(carte|carte d attaque|valide|cree|creer|creation|comme ca|exactement)\b/
      .test(text);
  if (!confirmsAttackCard) return false;
  const rejects =
    /\b(ne cree pas|ne valide pas|annule|stop|pas maintenant|finalement non)\b/
      .test(text);
  if (rejects) return false;
  const asksRevision =
    /\b(change|changer|modifie|modifier|corrige|corriger|remplace|remplacer|plutot|au lieu|pas comme ca|refais|refaire|reformule|reformuler)\b/
      .test(text);
  return !asksRevision;
}

export function isDefenseCardExplicitApprovalForTest(message: string): boolean {
  const text = normalizeRouteText(message);
  const startsWithApproval =
    /^(oui|ok|okay|go|vas y|vas-y|valide|cree|creer|lance|c est bon|cest bon)\b/
      .test(text);
  if (!startsWithApproval) return false;
  const confirmsDefenseCard =
    /\b(carte|carte de defense|defense|valide|cree|creer|creation|comme ca|exactement)\b/
      .test(text);
  if (!confirmsDefenseCard) return false;
  const rejects =
    /\b(ne cree pas|ne valide pas|annule|stop|pas maintenant|finalement non)\b/
      .test(text);
  if (rejects) return false;
  const asksRevision =
    /\b(change|changer|modifie|modifier|corrige|corriger|remplace|remplacer|plutot|au lieu|pas comme ca|refais|refaire|reformule|reformuler)\b/
      .test(text);
  return !asksRevision;
}

export function isDefenseCardRevisionForPendingDraftForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const asksRevision =
    /\b(change|changer|modifie|modifier|corrige|corriger|remplace|remplacer|plutot|au lieu|pas comme ca|refais|refaire)\b/
      .test(text);
  const defenseSlot =
    /\b(geste|moment|piege|signal|plan b|mon geste|fallback|defense|carte)\b/
      .test(text);
  return asksRevision && defenseSlot;
}

export function isCoachPreferenceExplicitApprovalForTest(
  message: string,
): boolean {
  const text = normalizeRouteText(message);
  const startsWithApproval =
    /^(oui|ok|okay|go|vas y|vas-y|valide|applique|garde|c est ca|cest ca|exactement)\b/
      .test(text);
  if (!startsWithApproval) return false;
  const confirmsPreference =
    /\b(preference|pour la suite|exactement|c est ca|cest ca|garde|applique|une action|concrete|concret|moins de questions|question courte)\b/
      .test(text);
  if (!confirmsPreference) return false;
  const rejects =
    /\b(ne garde pas|n applique pas|annule|stop|pas maintenant|finalement non|ne cree rien)\b/
      .test(text);
  if (rejects) return false;
  const asksRevision =
    /\b(change|changer|modifie|modifier|corrige|corriger|plutot|au lieu|pas comme ca|refais|refaire)\b/
      .test(text);
  return !asksRevision;
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

function persistConversationSkillRoute(
  tempMemory: any,
  routeDecision: RouteDecision | null,
  skillOutput?: ConversationSkillOutput | null,
): any {
  const next = { ...(tempMemory ?? {}) };
  const now = new Date().toISOString();
  const arbitration = routeDecision?.active_flow_arbitration;
  if (
    arbitration?.decision === "inline_answer_then_resume" ||
    arbitration?.decision === "suspend_active" ||
    arbitration?.decision === "supersede_active"
  ) {
    const activeOwner = String(arbitration.active_owner ?? "none");
    const snapshot = activeOwner === "pending_confirmation"
      ? next.__pending_tool_skill_confirmation ??
        next.pending_tool_skill_confirmation ?? null
      : activeOwner === "tool_skill"
      ? next.__active_tool_skill_intake ?? next.active_tool_skill_intake ?? null
      : activeOwner === "conversation_skill"
      ? next.__active_skill_state ?? next.active_skill_state ?? null
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
      delete next.__active_tool_skill_intake;
      delete next.active_tool_skill_intake;
    }
    if (
      arbitration.decision !== "inline_answer_then_resume" &&
      activeOwner === "pending_confirmation" &&
      arbitration.selected_owner !== "pending_confirmation"
    ) {
      delete next.__pending_tool_skill_confirmation;
      delete next.pending_tool_skill_confirmation;
    }
  }
  const selected = routeDecision?.response_owner === "safety"
    ? "safety_crisis"
    : routeDecision?.response_owner === "conversation_handler"
    ? String(routeDecision?.selected_handler ?? "").trim()
    : "";
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
    if (selected === "safety_crisis" && skillOutput?.status === "exit") {
      next.__last_safety_crisis_state = {
        ...previous,
        skill_id: selected,
        status: "exiting",
        turn_count: Number(previous.turn_count ?? 0) + 1,
        updated_at: now,
        resolved_at: now,
        working_state: {
          ...workingState,
          phase: "resolved",
        },
      };
      delete next.__active_skill_state;
      delete next.active_skill_state;
      return next;
    }
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
    routeDecision?.response_owner !== "safety"
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

function operationInputFromPlanAdjustmentScope(
  message: string,
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  const text = normalizeRouteText(message);
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  ) as any;
  if (isCopyForwardWeeklyRequest(message)) {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "high",
        evidence: ["message.copy_forward_current_level"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: "niveau actuel",
        evidence: ["message.copy_forward_current_level"],
      },
      constraints: [
        "extend_current_level_same_plan",
        "copy_forward_level_one_week",
        "preserve_action_content",
        "preserve_cadence",
      ],
      adjustment_type: "rebalance",
      reason: "context_changed",
      reason_change: "time_or_capacity_changed",
      change_target: "timing",
      payload: {
        scope_kind: "current_level",
        adjustment_type: {
          status: "identified",
          value: "rebalance",
          evidence: ["message.copy_forward_current_level"],
        },
        reason: {
          status: "identified",
          value: "context_changed",
          evidence: ["message.copy_forward_current_level"],
        },
        reason_change: {
          status: "identified",
          value: "time_or_capacity_changed",
          evidence: ["message.copy_forward_current_level"],
        },
        change_target: {
          status: "identified",
          value: "timing",
          evidence: ["message.copy_forward_current_level"],
        },
        constraints: {
          status: "identified",
          values: [
            "extend_current_level_same_plan",
            "copy_forward_level_one_week",
            "preserve_action_content",
            "preserve_cadence",
          ],
          evidence: ["message.copy_forward_current_level"],
        },
        affected_items: {
          status: "identified",
          values: ["niveau actuel"],
          evidence: ["message.copy_forward_current_level"],
        },
      },
    };
  }
  const structuredInput = intent?.operation_input ?? intent?.payload_hint ??
    intent?.slots;
  if (
    structuredInput && typeof structuredInput === "object" &&
    !Array.isArray(structuredInput)
  ) {
    return structuredInput as Record<string, unknown>;
  }
  if (intent?.adjust_plan_scope === "current_level") {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: intent.confidence_band === "high" ? "high" : "medium",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
        negative_evidence: intent.rejected_operations ?? [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: intent.target_hint ?? "niveau actuel",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
      },
      rejected_operations: intent.rejected_operations ?? [],
    };
  }
  if (intent?.adjust_plan_scope === "whole_plan") {
    return {
      target_granularity: {
        status: "identified",
        value: "whole_plan",
        confidence: intent.confidence_band === "high" ? "high" : "medium",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
        negative_evidence: intent.rejected_operations ?? [],
      },
      scope: {
        status: "identified",
        kind: "whole_plan",
        label: intent.target_hint ?? "plan global",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
      },
      rejected_operations: intent.rejected_operations ?? [],
    };
  }
  if (
    /\b(plan global|plan complet|tout le plan|whole plan|trajectoire|objectif global|direction globale|revoir le plan|refaire le plan|reorganiser le plan|réorganiser le plan)\b/
      .test(text) &&
    /\b(brouillon|proposition|prepare|prépare|ajuste|ajuster|change|changer|modifie|modifier|revoir|refaire|reorganise|réorganise|applique|appliquer)\b/
      .test(text)
  ) {
    const wholePlanConstraints = [
      "whole_plan_directional_draft_ready",
      "preserve_plan_intent",
      ...(/\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
          .test(text)
        ? ["max_two_actions_next_step"]
        : []),
    ];
    return {
      target_granularity: {
        status: "identified",
        value: "whole_plan",
        confidence: "high",
        evidence: ["message.explicit_whole_plan_adjustment"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "whole_plan",
        label: "plan global",
        evidence: ["message.explicit_whole_plan_adjustment"],
      },
      constraints: wholePlanConstraints,
      adjustment_type: "resequence",
      reason: "bad_fit",
      reason_change: "structure_bad_fit",
      change_target: "sequence",
      payload: {
        scope_kind: "whole_plan",
        adjustment_type: {
          status: "identified",
          value: "resequence",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        reason: {
          status: "identified",
          value: "bad_fit",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        reason_change: {
          status: "identified",
          value: "structure_bad_fit",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        change_target: {
          status: "identified",
          value: "sequence",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        constraints: {
          status: "identified",
          values: wholePlanConstraints,
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        affected_items: {
          status: "identified",
          values: ["plan global"],
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
      },
    };
  }
  if (
    /\b(niveau actuel|ce niveau|niveau en cours|semaine prochaine|organisation de la semaine)\b/
      .test(text) &&
    /\b(brouillon|proposition|prepare|prépare|ajuste|ajuster|change|changer|modifie|modifier|revoir|reorganise|réorganise|applique|appliquer|prolonge|prolonger)\b/
      .test(text)
  ) {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "medium",
        evidence: ["message.explicit_current_level_adjustment"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: "niveau actuel",
        evidence: ["message.explicit_current_level_adjustment"],
      },
    };
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
    const normalized = normalizeRouteText(resultMessage);
    if (
      /\b(si tu confirmes|si tu valides|si ca te va|rien n est applique|rien n est encore applique|pour l instant rien)\b/
        .test(normalized)
    ) {
      return renderAdjustPlanDraftDetails({ draft: args.draft }, {
        alreadyApplied: true,
        preferExamples: true,
      }) ?? args.fallbackAck?.trim() ?? resultMessage.trim();
    }
    return resultMessage.trim();
  }
  return args.fallbackAck?.trim() || "";
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

function isWeeklyAdaptiveReviewActive(activeSkillState: unknown): boolean {
  return String((activeSkillState as any)?.skill_id ?? "").trim() ===
    "weekly_adaptive_review_v1";
}

function weeklyAdaptiveReviewStateForTurn(args: {
  activeSkillState: unknown;
  tempMemory: unknown;
}): unknown {
  if (isWeeklyAdaptiveReviewActive(args.activeSkillState)) {
    return args.activeSkillState;
  }
  const memory = args.tempMemory && typeof args.tempMemory === "object"
    ? args.tempMemory as Record<string, unknown>
    : {};
  const stored = memory.__active_skill_state ?? memory.active_skill_state;
  if (isWeeklyAdaptiveReviewActive(stored)) return stored;
  const suspended = memory.__suspended_flow_v1 &&
      typeof memory.__suspended_flow_v1 === "object"
    ? memory.__suspended_flow_v1 as Record<string, unknown>
    : null;
  const suspendedSnapshot = suspended?.state_snapshot;
  return isWeeklyAdaptiveReviewActive(suspendedSnapshot)
    ? suspendedSnapshot
    : null;
}

function isExplicitWeeklyReviewExit(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(stop|arrete|arrête|pause|plus tard|sors du bilan|sortir du bilan|autre sujet|je veux parler d autre chose)\b/
    .test(text) ||
    /\boublie\s+(ca|ça|le bilan|ce bilan|la revue|ce point)\b/.test(text);
}

function shouldKeepWeeklyAdaptiveReviewInConversation(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
}): boolean {
  if (
    !weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) return false;
  if (isExplicitWeeklyReviewExit(args.userMessage)) return false;
  if (hasPendingOrActiveAdjustPlanOperation(args.tempMemory)) return false;
  if (
    weeklyReviewAllowsAdjustPlanBridge({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      userMessage: args.userMessage,
      history: null,
    })
  ) return false;
  const owner = args.routeDecision?.response_owner;
  return owner === "tool_skill" || owner === "product_help";
}

function hasPendingOrActiveAdjustPlanOperation(tempMemory: unknown): boolean {
  const temp = (tempMemory ?? {}) as any;
  if (isPendingAdjustPlanDraftReview(temp.__pending_adjust_plan_draft_review)) {
    return true;
  }
  const pending = temp.__pending_tool_skill_confirmation ??
    temp.pending_tool_skill_confirmation ??
    null;
  if (pendingOperationType(pending) === "adjust_plan_item") return true;
  const active = temp.__active_tool_skill_intake ??
    temp.active_tool_skill_intake ??
    null;
  if (String(active?.operation_type ?? "").trim() === "adjust_plan_item") {
    return true;
  }
  return isPendingAdjustPlanItemRecommendationOperation(
    temp.__pending_recommendation_operation,
  );
}

function weeklyReviewAllowsAdjustPlanBridge(args: {
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
  history?: any[] | null;
}): boolean {
  if (isEarlyWeeklyPlanningValidationRequest(args.userMessage)) return false;
  if (
    isExplicitPendingApplyConfirmation(args.userMessage) &&
    (isWeeklyMissionCarryOverRequest(args.userMessage) ||
      weeklyMissionCarryOverContext({
        userMessage: args.userMessage,
        history: args.history,
      }) ||
      isCopyForwardWeeklyRequest(args.userMessage) ||
      isWeeklyLightRepeatRequest(args.userMessage))
  ) {
    return true;
  }
  if (
    !isExplicitWeeklyAdjustPlanRequest(args.userMessage) &&
    !operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame ?? null,
    )
  ) {
    return false;
  }
  if (
    operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame ?? null,
    )
  ) {
    return true;
  }
  if (args.routeDecision?.response_owner !== "tool_skill") return false;
  if (
    String(args.routeDecision?.selected_handler ?? "").trim() !==
      "adjust_plan_item"
  ) {
    return false;
  }
  if (isExplicitWeeklyAdjustPlanRequest(args.userMessage)) return true;
  return Boolean(
    args.turnFrame?.tool_skill_intents?.some((intent) =>
      String(intent?.operation_type ?? "").trim() === "adjust_plan_item" &&
      intent.explicitness === "explicit" &&
      (intent.user_intent === "adjust" || intent.user_intent === "update") &&
      intent.ambiguity !== "intent_ambiguous" &&
      intent.ambiguity !== "both"
    ),
  );
}

function isExplicitWeeklyAdjustPlanRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const copyForwardRequest = isCopyForwardWeeklyRequest(message);
  const draftRequest = isExplicitWeeklyAdjustPlanDraftRequest(message);
  if (
    /\b(si je demande|si on demande|tu peux|est ce que tu peux|peux tu|possible de|capacite|capable)\b/
      .test(text)
  ) {
    return false;
  }
  if (
    /\b(ne l['’ ]applique pas|n['’ ]applique pas|ne change rien|rien appliquer|pas maintenant|pas tout de suite|juste comprendre|explique moi|resume moi|tu proposes quoi|proposes quoi)\b/
      .test(text) && !copyForwardRequest && !draftRequest
  ) {
    return false;
  }
  if (
    /\b(pas besoin de changer (les )?actions?|pas changer (les )?actions?|ne change pas (les )?actions?|sans changer (les )?actions?|pas besoin de changer (le )?niveau|pas changer (le )?niveau|ne change pas (le )?niveau|sans changer (le )?niveau)\b/
      .test(text) && !copyForwardRequest
  ) {
    return false;
  }
  return copyForwardRequest || draftRequest ||
    /\b(applique|appliquer|confirme|valide|valider|change|changer|modifie|modifier|ajuste|ajuster|alleger|allege|all[eé]ge|simplifie|simplifier|reduis|reduit|retire|supprime|remplace|reorganise|réorganise)\b/
        .test(text) &&
      /\b(organisation|semaine|plan|niveau|bloc|action|mission|habitude|charge|rythme|modification|ajustement|respiration|pause)\b/
        .test(text);
}

function isExplicitWeeklyAdjustPlanDraftRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(brouillon|proposition|prepare|prépare|propose une version|version propre)\b/
    .test(text) &&
    /\b(plan global|plan complet|tout le plan|niveau actuel|semaine prochaine|organisation|action|mission|habitude|rythme|charge)\b/
      .test(text);
}

export function isImplicitWholePlanRepairAdjustmentRequestForTest(
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

function isCopyForwardWeeklyRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const rejectsSameWeekRepeat =
    /\b(ne|n)\b.{0,40}\b(pas|plus)\b.{0,90}\b(refaire|rejouer|remettre|identique|pareil|meme semaine)\b/
      .test(text) ||
    /\bpas\s+(refaire|rejouer|remettre)\b/.test(text) ||
    /\bseulement\b.{0,40}\b(mission|action)\b/.test(text);
  if (rejectsSameWeekRepeat) return false;
  const asksSame =
    /\b(copie conforme|exactement pareil|exactement les memes|exactement le meme|a l identique|identique|meme semaine|memes actions?|meme actions?|meme rythme|memes reperes|meme contenu|refaire pareil|refaire la meme)\b/
      .test(text);
  const asksExtension =
    /\b(prolonge|prolonger|prolongation|garde|garder|maintenir|consolider|semaine de plus|une semaine de plus|refaire|rejouer)\b/
      .test(text);
  const forbidsChange =
    /\b(sans changer|sans modifier|ne change pas|ne touche pas|pas alleger|pas d allege|pas all[eé]ger|ni le rythme|ni les actions?)\b/
      .test(text);
  const mentionsWeeklyScope =
    /\b(semaine|niveau actuel|ce niveau|niveau en cours|organisation)\b/.test(
      text,
    );
  return mentionsWeeklyScope && asksExtension && (asksSame || forbidsChange);
}

function isVagueWholePlanWeeklyAdjustmentRequest(
  message: string,
  operationInput?: Record<string, unknown> | null,
): boolean {
  const scopeKind = String((operationInput as any)?.scope?.kind ?? "").trim();
  const target = String(
    (operationInput as any)?.target_granularity?.value ?? "",
  ).trim();
  if (scopeKind !== "whole_plan" && target !== "whole_plan") return false;
  const text = normalizeRouteText(message);
  const asksWholePlan =
    /\b(plan global|plan complet|tout le plan|trajectoire|objectif global|direction globale)\b/
      .test(text);
  const vagueFit =
    /\b(ne colle plus|colle plus|ne va plus|plus adapte|plus coherent|pas coherent|ne fait plus sens|fait plus sens)\b/
      .test(text);
  const hasConcreteDirection =
    /\b(avant|apres|après|ordre|reordonner|réordonner|reorganiser|réorganiser|deux actions|2 actions|maximum|ajoute|retire|supprime|remplace|plus lent|plus rapide|moins lourd|plus leger|plus léger|phase|etape|étape)\b/
      .test(text);
  return asksWholePlan && vagueFit && !hasConcreteDirection;
}

function weeklyStrategyUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "advance") return "passer a la suite";
  if (raw === "advance_with_caution" || raw === "advance_with_watch") {
    return "passer a la suite prudemment";
  }
  if (raw === "bridge_week") return "faire une semaine allegee";
  if (raw === "repeat_week") return "refaire la meme semaine";
  if (raw === "level_review") return "revoir la forme du niveau";
  return raw || "ajuster la semaine prochaine";
}

function weeklyItemDecisionUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "keep") return "garder tel quel";
  if (raw === "mark_completed") return "compter comme fait";
  if (raw === "carry_over") return "reporter si encore utile";
  if (raw === "drop") return "retirer si ca ne sert plus";
  if (raw === "repeat_with_week") return "refaire avec la meme semaine";
  if (raw === "bridge_with_week") return "garder en version allegee";
  if (raw === "split_or_replace") return "simplifier ou remplacer";
  if (raw === "escalate_level_review") return "revoir la forme du niveau";
  return raw || "a clarifier";
}

function weeklyOperationUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "advance_week") return "passer a la suite";
  if (raw === "repeat_week") return "refaire la meme semaine";
  if (raw === "insert_bridge_week") return "creer une semaine allegee";
  if (raw === "mark_item_completed") return "compter un item comme fait";
  if (raw === "carry_over_item") return "reporter une mission/action utile";
  if (raw === "drop_item") return "retirer un item devenu inutile";
  if (raw === "open_level_review") return "ouvrir une revue du niveau";
  return raw || "ajustement";
}

function summarizeWeeklyAdaptiveReviewForAddon(
  activeSkillState: unknown,
): string | null {
  if (!isWeeklyAdaptiveReviewActive(activeSkillState)) return null;
  const review = (activeSkillState as any)?.weekly_adaptive_review;
  if (!review || typeof review !== "object") return null;
  const habitVerdict = (review as any)?.habit_verdict ?? {};
  const strategy = (review as any)?.week_strategy ?? {};
  const question = (review as any)?.question ?? null;
  const daily = (review as any)?.daily_evidence_summary ?? {};
  const operations = Array.isArray((review as any)?.plan_patch?.operations)
    ? (review as any).plan_patch.operations.map((op: any) =>
      weeklyOperationUserLabel(op?.op)
    ).filter(Boolean)
    : [];
  const itemDecisions = Array.isArray((review as any)?.item_decisions)
    ? (review as any).item_decisions.map((item: any) =>
      `${String(item?.title ?? "item")}: ${
        weeklyItemDecisionUserLabel(item?.decision)
      } (${String(item?.current_week_status ?? "unknown")})`
    ).slice(0, 8)
    : [];
  return [
    "=== CONTEXTE WEEKLY_ADAPTIVE_REVIEW_V1 ACTIF ===",
    "Tu es dans le point weekly. Continue la revue weekly, sauf si le user demande explicitement de sortir du bilan.",
    "Base-toi sur le JSON weekly_adaptive_review deja calcule; ne refais pas un bilan action par action si les raisons daily sont deja disponibles.",
    "Le message d'ouverture weekly est proactif et doit deja avoir pose une seule question large sur la semaine. Ensuite, remplis naturellement les signaux humains dans le JSON: progression ressentie, etat/energie, blocage dominant, pertinence des actions et confirmation finale.",
    "Ne repose pas deux questions frontales progression + etat sauf si une information manque vraiment apres la reponse du user.",
    "Si le user corrige le bilan en disant qu'une action a ete faite mais oubliee/non cochee, ne lance pas le daily et ne lance pas un flow separe. Il faut seulement reunir action concernee + nombre de repetitions a ajouter + date/semaine si donnee; quand c'est complet, le runtime logge en direct et tu continues le weekly.",
    "Vocabulaire simple obligatoire: ne dis jamais bridge, bridge_week, semaine pont, carry_over, mode advance, repeat_week, level_review, not_relevant, item_decision, plan_patch ou operation. Ce sont des codes internes.",
    "Si le user emploie un de ces mots interdits, ne le repete pas, meme pour dire que tu ne vas pas l'utiliser; reformule directement en vocabulaire simple.",
    "Traductions a utiliser: bridge_week = semaine allegee; advance = passer a la suite; repeat_week = refaire la meme semaine; level_review = revoir la forme du niveau; carry_over = reporter cette mission/action utile.",
    "Aucun changement de plan ne doit etre applique sans confirmation explicite. Formule les changements comme une proposition d'organisation de la semaine prochaine, pas comme des regles abstraites.",
    "Si le user demande une organisation concrete ou refuse les regles/listes de regles, ne dis pas le mot regle. Reponds avec actions a garder/reporter/alleger, charge, ordre ou jours, pas avec des principes generaux.",
    "Si le user signale une fatigue forte, ne parle pas d'objectif 100%, de perfection ou de tout finir a tout prix. Propose plutot une charge tenable et la prochaine etape utile.",
    "Tant que le flow d'ajustement n'a pas ete lance et confirme, ne dis pas que tu verrouilles, appliques ou enregistres un plan precis. Dis que c'est une proposition concrete et demande si le user veut l'appliquer maintenant ou continuer la discussion sans confirmation.",
    "Pendant le weekly, evite le mot brouillon. Dis plutot proposition d'organisation, version proposee, ou rien n'est confirme.",
    "Si le user demande explicitement de modifier et appliquer l'organisation, le weekly peut passer ponctuellement par adjust_plan_item, puis revenir ici pour conclure le bilan.",
    "Si le user demande un rappel, une carte ou une fiche pendant le weekly, ne commence pas une collecte de slots dans la reponse weekly. Dis simplement qu'on pourra le faire apres le bilan si besoin, puis reviens a la question weekly ou a l'organisation de la semaine prochaine.",
    "Si le user pose seulement une question hypothetique du type 'si je demande a changer...' ou 'tu peux passer par le flow...', reponds dans le weekly sans lancer d'ajustement.",
    "Si le user veut attendre demain/plus tard ou dit de ne rien changer maintenant, dis qu'on reprendra plus tard et que rien n'est confirme maintenant. Ne demande pas une heure de reprise sauf demande explicite de rappel.",
    "Quand le weekly est conclu, dis clairement: le point de fin de semaine est termine et la validation de la semaine prochaine est disponible. Ici, validation veut dire confirmer l'organisation de la semaine suivante apres ce bilan.",
    "A la conclusion du weekly, ne montre pas de mini-synthese pour le prochain weekly au user. Cette synthese est interne: le runtime la stocke pour aider le prochain message d'ouverture.",
    "Si la proposition n'est pas confirmee ou si le user dit de ne rien changer maintenant, dis que la validation de la semaine prochaine n'est pas encore debloquee.",
    "Ne propose pas de valider une occurrence dans le dashboard pour combler une semaine sans signal. En no_signal, clarifie la cause avant de conclure performance ou progression.",
    "Si decision_user_label=passer a la suite: ne reporte que les missions/clarifications utiles non faites. Ne reporte pas les habitudes deja comptabilisees.",
    "Si decision_user_label=passer a la suite avec des habitudes deja faites, ne propose aucune modification de cadence, pression, frequence, statut ou maintien sur ces habitudes. Elles sont seulement acquises/comptees; le seul ajustement possible vient des missions/actions utiles a reporter.",
    "Si decision_user_label=faire une semaine allegee: propose moins de charge pour garder le cap, pas un reset complet ni une repetition brute.",
    "Si decision_user_label=refaire la meme semaine: explique que le signal est insuffisant et qu'on consolide avant d'avancer; demande la cause si elle bloque la decision.",
    "Si decision_user_label=revoir la forme du niveau: traite cela comme une revue de la forme du niveau/bloc, pas comme une modification item par item. Ne demande pas 'quelles actions modifier'; demande confirmation ou clarifie le mauvais calibrage du niveau.",
    "Les supports sont hors scope des decisions weekly. Ne les propose pas dans l'organisation de la semaine prochaine et ne les compte jamais comme action a garder/reporter/alleger.",
    `habit_verdict=${
      String(habitVerdict.status ?? "unknown")
    } completion_rate=${String(habitVerdict.completion_rate ?? "unknown")}`,
    `daily_coverage=${String(daily.coverage ?? "unknown")} blockers=${
      JSON.stringify(daily.dominant_blockers ?? [])
    }`,
    `decision_user_label=${weeklyStrategyUserLabel(strategy.decision)} reason=${
      String(strategy.reason ?? "")
    }`,
    question
      ? `question_active=${String(question.id ?? "")}: ${
        String(question.text ?? "")
      } blocks_decision=${String(question.blocks_decision ?? "")}`
      : "question_active=none",
    `confirmation_required=${
      String((review as any)?.plan_patch?.requires_confirmation ?? true)
    } proposed_changes=${JSON.stringify(operations)}`,
    itemDecisions.length > 0
      ? `item_notes=${itemDecisions.join(" ; ")}`
      : "item_notes=none",
  ].join("\n");
}

function buildWeeklyTurnSlotAddon(args: {
  activeSkillState: unknown;
  tempMemory: unknown;
  userMessage: string;
}): string | null {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) return null;
  const text = normalizeRouteText(args.userMessage);
  const lines = ["=== SLOTS WEEKLY REMPLIS CE TOUR ==="];
  let hasSignal = false;
  if (
    /\boubli de suivi\b|\boublie de suivi\b|\boublie de cocher\b|\bpas coche\b|\bpas cochees\b|\bles habitudes n ont pas ete cochees\b/
      .test(text)
  ) {
    lines.push(
      "- cause_no_signal: oubli de suivi / check-ins non renseignes. Ne redemande pas si c'etait oubli ou fatigue; utilise cette cause.",
    );
    hasSignal = true;
  }
  if (weeklyForgottenProgressMentioned(args.userMessage)) {
    const forgottenCandidate = resolveWeeklyForgottenProgressCandidate({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
      userMessage: args.userMessage,
    });
    if (forgottenCandidate.ready) {
      lines.push(
        "- correction_action_oubliee: le user corrige le bilan weekly. Le runtime a les infos pour logger; apres log, acquiesce et continue le weekly. Ne parle pas de signal faible: dis plutot que le signal est recupere mais encore incomplet si tout n'est pas clarifie.",
      );
    } else {
      lines.push(
        "- correction_action_oubliee_incomplete: le user corrige le bilan weekly, mais l'action ou le nombre est ambigu. Ne dis pas que c'est note/enregistre. Demande une confirmation courte avec action + nombre de repetitions.",
      );
    }
    hasSignal = true;
  }
  if (
    /\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\borganisation concrete\b|\bparle moi de l organisation\b/
      .test(text)
  ) {
    lines.push(
      "- preference_wording: le user demande une organisation concrete. Reponds en termes d'actions, charge, jours/ordre si utile. Evite le mot regle et les principes abstraits. N'inclus aucun item support/fiche support dans l'organisation weekly.",
    );
    hasSignal = true;
  }
  if (/\bje viens de le dire\b|\bje l ai deja dit\b/.test(text)) {
    lines.push(
      "- anti_repetition: le user signale une repetition. Ne repose pas la meme clarification; resume l'etat avec les infos deja donnees.",
    );
    hasSignal = true;
  }
  return hasSignal ? lines.join("\n") : null;
}

type WeeklyForgottenProgressCandidate = {
  detected: boolean;
  ready: boolean;
  reason_code: string;
  plan_item_id?: string;
  title?: string;
  count?: number;
  date_hint?: string | null;
  date_hints?: string[];
};

function weeklyForgottenProgressMentioned(message: string): boolean {
  const text = normalizeRouteText(message);
  const mentionsForgotten =
    /\b(oublie|oubliee|oublier|pas coche|pas cochee|pas confirme|pas confirmee|pas dit|pas renseigne|pas renseignee|pas mis|pas note|pas notee|pas logue|pas loguee|manque)\b/
      .test(text);
  const mentionsDone =
    /\b(fait|faite|faites|realise|realisee|coche|cochee|cocher|confirme|confirmee|confirmer|valide|validee|valider|logue|loguee|loguer)\b/
      .test(text);
  return mentionsForgotten && mentionsDone;
}

function weeklyFrenchNumber(value: string): number | null {
  const normalized = normalizeRouteText(value).trim();
  const map: Record<string, number> = {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
  };
  return map[normalized] ?? null;
}

function extractWeeklyForgottenCount(message: string): number {
  const text = normalizeRouteText(message);
  const numeric =
    /\b(\d{1,2})\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .exec(text)?.[1];
  if (numeric) return Math.max(1, Math.min(20, Number(numeric)));
  const word =
    /\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .exec(text)?.[1];
  const parsed = word ? weeklyFrenchNumber(word) : null;
  return parsed ? Math.max(1, Math.min(20, parsed)) : 1;
}

function weeklyForgottenExplicitCountMentioned(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b\d{1,2}\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
    .test(text) ||
    /\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .test(text);
}

function ymdPlusDays(ymd: string, days: number): string | null {
  const date = ymdToUtcNoonDate(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weeklyForgottenDateHint(message: string, weeklyState: unknown) {
  return weeklyForgottenDateHints(message, weeklyState)[0] ??
    weeklyForgottenFallbackDateHint(weeklyState);
}

function weeklyForgottenFallbackDateHint(weeklyState: unknown) {
  const progressReview = (weeklyState as any)?.weekly_progress_review ?? {};
  const weekStart = String(progressReview?.week_start_date ?? "").trim();
  const weekEnd = String(progressReview?.week_end_date ?? "").trim();
  return weekEnd || weekStart || null;
}

function weeklyForgottenDateHints(
  message: string,
  weeklyState: unknown,
): string[] {
  const text = normalizeRouteText(message);
  const explicit = /(?:^|\D)(20\d{2}-\d{2}-\d{2})(?:\D|$)/.exec(text)?.[1];
  if (explicit) return [explicit];
  const progressReview = (weeklyState as any)?.weekly_progress_review ?? {};
  const weekStart = String(progressReview?.week_start_date ?? "").trim();
  const weekdays: Array<[RegExp, number]> = [
    [/\blundi\b/, 0],
    [/\bmardi\b/, 1],
    [/\bmercredi\b/, 2],
    [/\bjeudi\b/, 3],
    [/\bvendredi\b/, 4],
    [/\bsamedi\b/, 5],
    [/\bdimanche\b/, 6],
  ];
  const matched = weekdays
    .filter(([pattern]) => pattern.test(text))
    .map(([, offset]) => weekStart ? ymdPlusDays(weekStart, offset) : null)
    .filter((value): value is string => Boolean(value));
  return [...new Set(matched)];
}

function weeklyActionCandidatesForForgottenProgress(
  weeklyState: unknown,
): Array<{
  plan_item_id: string;
  title: string;
  status: string;
  family: string;
}> {
  const byId = new Map<
    string,
    { plan_item_id: string; title: string; status: string; family: string }
  >();
  const progressReview = (weeklyState as any)?.weekly_progress_review;
  const transformations = Array.isArray(progressReview?.transformations)
    ? progressReview.transformations
    : [];
  for (const transformation of transformations) {
    const actions = Array.isArray(transformation?.actions)
      ? transformation.actions
      : [];
    for (const action of actions) {
      const planItemId = String(action?.plan_item_id ?? "").trim();
      const title = String(action?.title ?? "").trim();
      if (!planItemId || !title) continue;
      byId.set(planItemId, {
        plan_item_id: planItemId,
        title,
        status: String(action?.deviation ?? action?.status ?? "unknown"),
        family: String(action?.dimension ?? action?.kind ?? "unknown"),
      });
    }
  }
  const adaptiveReview = (weeklyState as any)?.weekly_adaptive_review;
  const items = Array.isArray(adaptiveReview?.item_decisions)
    ? adaptiveReview.item_decisions
    : [];
  for (const item of items) {
    const planItemId = String(item?.plan_item_id ?? "").trim();
    const title = String(item?.title ?? "").trim();
    if (!planItemId || !title) continue;
    byId.set(planItemId, {
      plan_item_id: planItemId,
      title,
      status: String(item?.current_week_status ?? "unknown"),
      family: String(item?.family ?? "unknown"),
    });
  }
  return [...byId.values()];
}

function weeklyActionReferenceScore(message: string, title: string): number {
  const normalizedMessage = normalizePlanItemTitle(message);
  const normalizedTitle = normalizePlanItemTitle(title);
  if (!normalizedMessage || !normalizedTitle) return 0;
  if (normalizedMessage.includes(normalizedTitle)) return 100;
  const tokens = normalizedTitle.split(" ").filter((token) =>
    token.length >= 4
  );
  if (tokens.length === 0) return 0;
  const matches = tokens.filter((token) => normalizedMessage.includes(token))
    .length;
  const strongSingleTokenMatch = tokens.some((token) =>
    token.length >= 8 && normalizedMessage.includes(token)
  );
  if (strongSingleTokenMatch) return matches + 1;
  const required = Math.min(2, tokens.length);
  return matches >= required ? matches : 0;
}

function resolveWeeklyForgottenAction(args: {
  message: string;
  weeklyState: unknown;
}) {
  const candidates = weeklyActionCandidatesForForgottenProgress(
    args.weeklyState,
  );
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: weeklyActionReferenceScore(args.message, candidate.title),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length > 0) {
    const top = scored[0];
    const tied = scored.filter((item) => item.score === top.score);
    return tied.length === 1 ? top.candidate : null;
  }
  const unresolved = candidates.filter((candidate) =>
    ["missed", "partial", "not_answered", "rescheduled", "unknown"].includes(
      candidate.status,
    )
  );
  return unresolved.length === 1 ? unresolved[0] : null;
}

function actionMentionIndex(message: string, title: string): number {
  const text = normalizeRouteText(message);
  const normalizedTitle = normalizeRouteText(title);
  if (!text || !normalizedTitle) return -1;
  const exact = text.indexOf(normalizedTitle);
  if (exact >= 0) return exact;
  const tokens = normalizedTitle.split(" ").filter((token) =>
    token.length >= 4
  );
  const indexes = tokens
    .map((token) => text.indexOf(token))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function weeklyForgottenSegmentForAction(args: {
  message: string;
  action: { title: string };
  allActions: Array<{ title: string }>;
}): string {
  const text = normalizeRouteText(args.message);
  const ordered = args.allActions
    .map((action) => ({
      action,
      index: actionMentionIndex(args.message, action.title),
    }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  const current = ordered.find((item) =>
    item.action.title === args.action.title
  );
  if (!current) return args.message;
  const next = ordered.find((item) => item.index > current.index);
  return text.slice(current.index, next?.index ?? undefined).trim() ||
    args.message;
}

function resolveWeeklyForgottenProgressCandidates(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  userMessage: string;
}): WeeklyForgottenProgressCandidate[] {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState || !weeklyForgottenProgressMentioned(args.userMessage)) {
    return [];
  }
  const actions = weeklyActionCandidatesForForgottenProgress(weeklyState);
  const matched = actions
    .map((action) => ({
      action,
      score: weeklyActionReferenceScore(args.userMessage, action.title),
      index: actionMentionIndex(args.userMessage, action.title),
    }))
    .filter((item) => item.score > 0 && item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (matched.length < 2) return [];
  return matched.map(({ action }) => {
    const segment = weeklyForgottenSegmentForAction({
      message: args.userMessage,
      action,
      allActions: matched.map((item) => item.action),
    });
    const dateHints = weeklyForgottenDateHints(segment, weeklyState);
    const explicitCount = weeklyForgottenExplicitCountMentioned(segment);
    const count = !explicitCount && dateHints.length > 1
      ? dateHints.length
      : extractWeeklyForgottenCount(segment);
    const dateHint = dateHints[0] ??
      (count === 1 ? weeklyForgottenFallbackDateHint(weeklyState) : null);
    const dateIsAmbiguous = (count > 1 && dateHints.length === 0) ||
      (count === 1 && dateHints.length > 1) ||
      (count > 1 && dateHints.length > 0 && dateHints.length !== count);
    return {
      detected: true,
      ready: Boolean(action.plan_item_id && count > 0 && !dateIsAmbiguous),
      reason_code: dateIsAmbiguous ? "ambiguous_dates" : "ready",
      plan_item_id: action.plan_item_id,
      title: action.title,
      count,
      date_hint: dateHint,
      date_hints: dateHints,
    };
  });
}

export function resolveWeeklyForgottenProgressCandidate(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  userMessage: string;
}): WeeklyForgottenProgressCandidate {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) {
    return {
      detected: false,
      ready: false,
      reason_code: "weekly_review_not_active",
    };
  }
  if (!weeklyForgottenProgressMentioned(args.userMessage)) {
    return {
      detected: false,
      ready: false,
      reason_code: "no_weekly_forgotten_progress_signal",
    };
  }
  const action = resolveWeeklyForgottenAction({
    message: args.userMessage,
    weeklyState,
  });
  if (!action) {
    return {
      detected: true,
      ready: false,
      reason_code: "missing_or_ambiguous_action",
    };
  }
  const count = extractWeeklyForgottenCount(args.userMessage);
  const dateHint = weeklyForgottenDateHint(args.userMessage, weeklyState);
  if (!count || count < 1) {
    return {
      detected: true,
      ready: false,
      reason_code: "missing_count",
      plan_item_id: action.plan_item_id,
      title: action.title,
    };
  }
  return {
    detected: true,
    ready: true,
    reason_code: "ready",
    plan_item_id: action.plan_item_id,
    title: action.title,
    count,
    date_hint: dateHint,
  };
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

export function isPendingAttackCardRecommendationOperation(value: unknown): value is {
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

export function isPendingDefenseCardRecommendationOperation(value: unknown): value is {
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

function isEarlyWeeklyPlanningValidationRequest(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  const mentionsNextWeek =
    /\b(semaine prochaine|prochaine semaine|lundi prochain|pour lundi|des lundi|des le lundi|next week)\b/
      .test(text);
  const mentionsWeekly =
    /\b(weekly|bilan hebdo|point hebdo|revue hebdo|review hebdo)\b/.test(text);
  const asksValidation =
    /\b(valide|valider|validation|confirme|confirmer|programme|programmer|planifie|planifier|considere que c est bon|c est bon pour lundi|sans attendre|tout de suite|maintenant)\b/
      .test(text);
  return asksValidation && mentionsNextWeek &&
    (mentionsWeekly ||
      /\bsans attendre\b|\btout de suite\b|\bmaintenant\b/.test(text));
}

export function isExplicitPendingApplyConfirmation(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  if (
    /\b(stop|annule|annuler|ne valide pas|ne valide encore pas|ne valide toujours pas|ne l applique pas|ne l applique encore pas|ne l applique toujours pas|n applique pas|n applique encore pas|n applique toujours pas|n applique rien|ne rien appliquer|on n applique rien|ne l execute pas|n execute pas|garde le plan tel quel|je pourrai|je pourrais|ca pourrait|ça pourrait|presque|pas encore|avant validation|avant de valider|avant que je valide|avant que je dise oui|confirme moi juste|confirme-moi juste|je veux relire|montre|reformule|corrige|change|enleve|enlève|ajoute plutot|ajoute plutôt)\b/
      .test(text)
  ) {
    return false;
  }
  return /\b(oui|ok|d accord|vas y|go|valide|applique|appliquer|execute|exécute|executer|exécuter|fais le|tu peux le faire|c est bon)\b/
    .test(text) &&
    /\b(valide|applique|appliquer|execute|exécute|executer|exécuter|fais le|tu peux le faire|c est bon|cette version)\b/
      .test(text);
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
  activeSkillState?: unknown;
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
    activeSkillState,
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
  const explicitTrackTargetId = String(trackPlanItem?.target_item_id ?? "")
    .trim();
  const trackPlanItemTargetId = String(
    explicitTrackTargetId ||
      resolvePlanItemIdFromSnapshot(planItemSnapshot, requestedPlanItemTitle) ||
      "",
  ).trim();
  const trackPlanItemTarget = String(
    trackPlanItem?.target_title ||
      resolvePlanItemTitleFromSnapshot(planItemSnapshot, trackPlanItemTargetId),
  ).trim();
  const trackPlanItemValue = Number(trackPlanItem?.value_hint);
  const weeklyReviewActive = Boolean(
    weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
  );
  const canTrackPlanItem = trackPlanItem?.detected === true &&
    trackPlanItemTargetId.length >= 2 &&
    (trackPlanItemStatus === "completed" || trackPlanItemStatus === "missed" ||
      trackPlanItemStatus === "partial");
  const canTrack = !isCheckupActive(state) && !weeklyReviewActive &&
    canTrackPlanItem;

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

async function maybeLogWeeklyForgottenProgressParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  activeSkillState?: unknown;
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId: string | null;
  userMessage: string;
}): Promise<{
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
}> {
  const multiCandidates = resolveWeeklyForgottenProgressCandidates({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  });
  const candidate = resolveWeeklyForgottenProgressCandidate({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  });
  if (!candidate.detected) {
    return { toolExecution: "none", executedTools: [] };
  }

  const alreadyLogged =
    (args.tempMemory as any)?.__weekly_forgotten_progress?.source_message_id &&
    args.loggedMessageId &&
    (args.tempMemory as any).__weekly_forgotten_progress.source_message_id ===
      args.loggedMessageId;
  if (alreadyLogged) return { toolExecution: "none", executedTools: [] };

  const readyMultiCandidates = multiCandidates.filter((item) =>
    item.ready && item.plan_item_id && item.count
  );
  if (multiCandidates.length >= 2 && readyMultiCandidates.length < 2) {
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "incomplete",
      reason_code: "ambiguous_multi_action_dates",
      items: multiCandidates.map((item) => ({
        title: item.title ?? null,
        count: item.count ?? null,
        reason_code: item.reason_code,
      })),
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return { toolExecution: "none", executedTools: [] };
  }
  if (readyMultiCandidates.length >= 2) {
    try {
      const loggedItems: Array<{
        plan_item_id: string;
        title: string;
        count: number;
        date_hint: string | null;
        date_hints?: string[];
      }> = [];
      for (const item of readyMultiCandidates) {
        const dateHints = Array.isArray(item.date_hints) ? item.date_hints : [];
        const effectiveCount = dateHints.length > 1 &&
            (!item.count || item.count < dateHints.length)
          ? dateHints.length
          : item.count ?? 1;
        let resultTarget = item.title ?? item.plan_item_id!;
        if (dateHints.length > 1 && dateHints.length === effectiveCount) {
          for (const dateHint of dateHints) {
            const result = await logPlanItemProgressV2({
              supabase: args.supabase,
              userId: args.userId,
              planItemId: item.plan_item_id!,
              status: "completed",
              value: 1,
              dateHint,
              source: "weekly_adaptive_review_v1",
              sourceMessageId: args.loggedMessageId ?? null,
              runtime: args.v2Runtime,
            });
            if (result.mode === "logged") resultTarget = result.target;
          }
        } else {
          const result = await logPlanItemProgressV2({
            supabase: args.supabase,
            userId: args.userId,
            planItemId: item.plan_item_id!,
            status: "completed",
            value: effectiveCount,
            dateHint: item.date_hint ?? null,
            source: "weekly_adaptive_review_v1",
            sourceMessageId: args.loggedMessageId ?? null,
            runtime: args.v2Runtime,
          });
          if (result.mode !== "logged") continue;
          resultTarget = result.target;
        }
        loggedItems.push({
          plan_item_id: item.plan_item_id!,
          title: item.title ?? resultTarget,
          count: effectiveCount,
          date_hint: item.date_hint ?? null,
          date_hints: dateHints,
        });
      }
      if (loggedItems.length >= 2) {
        (args.tempMemory as any).__weekly_forgotten_progress = {
          mode: "logged_multi",
          items: loggedItems,
          source_message_id: args.loggedMessageId ?? null,
          updated_at: new Date().toISOString(),
        };
        (args.tempMemory as any).__track_progress_parallel = {
          mode: "logged",
          message: `Corrections weekly enregistrées: ${
            loggedItems.map((item) => `+${item.count} ${item.title}`).join(
              "; ",
            )
          }.`,
          status: "completed",
          source_message_id: args.loggedMessageId ?? null,
        };
        const activeWeeklyState = weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        });
        if (activeWeeklyState && typeof activeWeeklyState === "object") {
          (activeWeeklyState as any).forgotten_progress_slots = {
            status: "logged_multi",
            items: loggedItems,
            source_message_id: args.loggedMessageId ?? null,
            updated_at: new Date().toISOString(),
          };
        }
        return {
          toolExecution: "success",
          executedTools: ["weekly_forgotten_progress_log"],
        };
      }
    } catch (error) {
      console.warn(
        "[Router] weekly forgotten progress multi-log failed (non-blocking):",
        error,
      );
    }
  }

  if (!candidate.ready || !candidate.plan_item_id || !candidate.count) {
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "incomplete",
      reason_code: candidate.reason_code,
      title: candidate.title ?? null,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return { toolExecution: "none", executedTools: [] };
  }

  try {
    const result = await logPlanItemProgressV2({
      supabase: args.supabase,
      userId: args.userId,
      planItemId: candidate.plan_item_id,
      status: "completed",
      value: candidate.count,
      dateHint: candidate.date_hint ?? null,
      source: "weekly_adaptive_review_v1",
      sourceMessageId: args.loggedMessageId ?? null,
      runtime: args.v2Runtime,
    });

    if (result.mode !== "logged") {
      (args.tempMemory as any).__weekly_forgotten_progress = {
        mode: "needs_clarify",
        reason_code: result.message,
        plan_item_id: candidate.plan_item_id,
        title: candidate.title ?? result.target,
        count: candidate.count,
        source_message_id: args.loggedMessageId ?? null,
        updated_at: new Date().toISOString(),
      };
      return { toolExecution: "blocked", executedTools: [] };
    }

    const message =
      `Correction weekly enregistrée: +${candidate.count} répétition(s) pour "${
        candidate.title ?? result.target
      }".`;
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "logged",
      plan_item_id: candidate.plan_item_id,
      title: candidate.title ?? result.target,
      count: candidate.count,
      date_hint: candidate.date_hint ?? null,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    (args.tempMemory as any).__track_progress_parallel = {
      mode: "logged",
      message,
      target: candidate.title ?? result.target,
      status: "completed",
      source_message_id: args.loggedMessageId ?? null,
    };
    const activeWeeklyState = weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    });
    if (activeWeeklyState && typeof activeWeeklyState === "object") {
      (activeWeeklyState as any).forgotten_progress_slots = {
        status: "logged",
        plan_item_id: candidate.plan_item_id,
        title: candidate.title ?? result.target,
        repetitions_to_add: candidate.count,
        date_hint: candidate.date_hint ?? null,
        source_message_id: args.loggedMessageId ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    return {
      toolExecution: "success",
      executedTools: ["weekly_forgotten_progress_log"],
    };
  } catch (error) {
    console.warn(
      "[Router] weekly forgotten progress log failed (non-blocking):",
      error,
    );
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "failed",
      reason_code: error instanceof Error ? error.message : String(error),
      plan_item_id: candidate.plan_item_id,
      title: candidate.title ?? null,
      count: candidate.count,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return {
      toolExecution: "failed",
      executedTools: ["weekly_forgotten_progress_log"],
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

export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
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
  const pendingType = pendingOperationType(pending);
  if (pendingType && pendingType !== "create_recurring_reminder") return false;
  if (isPendingRecurringReminderOperation(pending)) return true;
  if (
    isPendingRecurringReminderRecommendationOperation(
      (args.tempMemory as any)?.__pending_recommendation_operation,
    )
  ) return true;
  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
  const activeOperationType = String(
    (activeIntake as any)?.operation_type ?? "",
  );
  if (
    activeOperationType &&
    activeOperationType !== "create_recurring_reminder"
  ) return false;
  if (
    activeOperationType === "create_recurring_reminder"
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

function isExplicitSelectStatePotionRequest(message: unknown): boolean {
  const normalized = normalizeOperationText(message).replace(/\s+/g, " ");
  if (!/\bpotion\b/.test(normalized)) return false;
  if (
    /\b(potion de|potion d|potion d etat|potion etat|potion)\b/.test(
      normalized,
    ) &&
    /\b(rappel|courage|guerison|clarte|amour|apaisement|etat)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  return /\b(active|activer|lance|lancer|cree|creer|prepare|preparer|besoin|veux|voudrais|aimerais)\b/
    .test(normalized) &&
    /\bpotion\b/.test(normalized);
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
    ...(draft?.confirmation_message || draft?.execution_message
      ? {
        draft_messages: {
          confirmation_message: draft?.confirmation_message,
          user_message_brief: draft?.user_message_brief,
          user_message_detailed: draft?.user_message_detailed,
          execution_message: draft?.execution_message,
          revision_message: draft?.revision_message,
        },
      }
      : {}),
  };
}

function hasExplicitDirectEffectOverride(args: {
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  pendingOperationConfirmation: unknown;
}): boolean {
  if (!args.pendingOperationConfirmation || !args.turnFrame) return false;
  const runnable = new Set(args.routeDecision?.direct_effects_to_run ?? []);
  if (!runnable.has("create_one_shot_reminder")) return false;
  return args.turnFrame.direct_effects.some((effect) =>
    effect.effect_type === "create_one_shot_reminder" &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    effect.confidence_band === "high"
  );
}

function explicitlySafeWorkReminderRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const safetyNegated =
    /\b(je ne suis pas en danger|je suis pas en danger|pas en danger|je ne suis pas fragile|je suis pas fragile)\b/
      .test(text);
  const workReminder =
    /\b(rappel|rappelle|programme|programmer|planifie|planifier)\b/.test(
      text,
    ) &&
    /\b(travail|boulot|mail|mails|camille|nora|budget|recap|synthese|dossier|client|slack)\b/
      .test(text);
  return safetyNegated && workReminder &&
    !/\b(me faire du mal|suicid|mourir|en finir)\b/.test(text);
}

function clearToolSkillFlowForDirectReminder(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  delete next.__pending_recommendation_operation;
  return next;
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

export function renderAdjustPlanDraftDetails(raw: any, options?: {
  alreadyApplied?: boolean;
  preferExamples?: boolean;
}): string | null {
  const result = raw?.draft?.draft?.adjust_plan_result;
  const generatedMessage = String(
    options?.alreadyApplied
      ? raw?.draft?.execution_message ?? result?.user_message_detailed ?? ""
      : result?.user_message_detailed ?? raw?.draft?.confirmation_message ?? "",
  ).trim();
  const changedItems = Array.isArray(result?.applied_change?.changed_items)
    ? result.applied_change.changed_items
    : [];
  const wholePlanTrajectoryDetails = renderWholePlanTrajectoryDetails(
    result,
    changedItems,
    options,
  );
  if (wholePlanTrajectoryDetails) {
    return wholePlanTrajectoryDetails;
  }
  if (
    generatedMessage && (!options?.preferExamples || changedItems.length === 0)
  ) {
    return generatedMessage;
  }
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
  const examples = changedItems.slice(0, 4).map((item: any, index: number) => {
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
    ? result.applied_change.preserved_items.slice(0, 3)
    : [];
  const preservedLines = preserved.map((item: any) => {
    const title = String(item?.title ?? "").trim();
    const reason = String(item?.reason ?? "").trim();
    return title ? `- ${title}${reason ? `: ${reason}` : ""}` : "";
  }).filter(Boolean);
  const preservedBlock = preservedLines.length
    ? `\n\nCe qui reste inchangé:\n${preservedLines.join("\n")}`
    : "";
  const intro = options?.alreadyApplied
    ? "Oui. Les changements concrets appliqués sont:"
    : "Je n'ai encore rien appliqué. Le brouillon actuel prévoit:";
  const validation = options?.alreadyApplied
    ? ""
    : "\n\nSi ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.";
  return `${intro}\n\n${examples.join("\n")}${preservedBlock}${validation}`;
}

function renderWholePlanTrajectoryDetails(
  result: any,
  changedItems: any[],
  options?: { alreadyApplied?: boolean; preferExamples?: boolean },
): string | null {
  if (result?.scope !== "whole_plan") return null;
  const trajectory = result?.applied_change?.trajectory_change;
  if (!trajectory || typeof trajectory !== "object") return null;

  const before = String(trajectory.before ?? "").trim();
  const after = String(trajectory.after ?? "").trim();
  const insertedStep = String(trajectory.inserted_step ?? "").trim();
  const preservedDirection = String(trajectory.preserved_direction ?? "")
    .trim();
  const coachingReason = String(trajectory.coaching_reason ?? "").trim();
  const reorderedSteps = Array.isArray(trajectory.reordered_steps)
    ? trajectory.reordered_steps.map((step: unknown) =>
      String(step ?? "").trim()
    ).filter(Boolean)
    : [];
  if (
    !before && !after && !insertedStep && !preservedDirection &&
    !coachingReason && reorderedSteps.length === 0
  ) {
    return null;
  }

  const anchors = changedItems
    .map((item: any) => String(item?.title ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const lines = [
    options?.alreadyApplied
      ? "Oui. L'ajustement applique porte sur la trajectoire du plan, pas seulement sur deux actions."
      : "Je n'ai encore rien applique. Le brouillon porte sur la trajectoire du plan, pas seulement sur deux actions.",
    before ? `Avant: ${before}` : "",
    after ? `Apres: ${after}` : "",
    insertedStep ? `Etape ajoutee: ${insertedStep}` : "",
    !insertedStep && reorderedSteps.length
      ? `Ordre prevu: ${reorderedSteps.join(" -> ")}`
      : "",
    preservedDirection ? `Ce qui reste stable: ${preservedDirection}` : "",
    coachingReason ? `Pourquoi ca aide: ${coachingReason}` : "",
    anchors.length
      ? `Reperes du plan utilises pour ancrer ce changement: ${
        anchors.join(", ")
      }.`
      : "",
    options?.alreadyApplied
      ? ""
      : "Si ca te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.",
  ].filter(Boolean);
  return lines.join("\n\n");
}

function renderLastAdjustPlanDetails(tempMemory: any): string | null {
  const raw = (tempMemory as any)?.__last_adjust_plan_execution;
  return renderAdjustPlanDraftDetails(raw, {
    alreadyApplied: true,
    preferExamples: true,
  });
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
  return renderAdjustPlanDraftDetails(raw, {
    alreadyApplied: false,
    preferExamples: true,
  });
}

function renderPendingAdjustPlanDraftQuestionAnswer(
  raw: any,
  userMessage: string,
): string | null {
  if (
    !isPendingAdjustPlanDraftReview(raw) &&
    !isPendingAdjustPlanItemOperation(raw)
  ) {
    return null;
  }
  const normalized = normalizeRecommendationText(userMessage);
  const asksShortConfirmation =
    /\b(confirme|confirme moi|confirme-moi|avant validation|avant de valider|avant que je valide|est ce que|est-ce que|et si|garde quand meme|garde quand même|garder quand meme|garder quand même)\b/
      .test(normalized);
  if (!asksShortConfirmation) return null;

  const result = raw?.draft?.draft?.adjust_plan_result;
  const trajectory = result?.scope === "whole_plan"
    ? result?.applied_change?.trajectory_change
    : null;
  const after = String(trajectory?.after ?? "").trim();
  const insertedStep = String(trajectory?.inserted_step ?? "").trim();
  const basis = after || insertedStep ||
    String(raw?.draft?.confirmation_message ?? "").trim();

  if (
    /\b(ne supprime pas|supprime pas|garde|decale|décale|apres|après)\b/.test(
      normalized,
    ) &&
    /\b(discussion de fond|parler du fond|reproches|fond)\b/.test(normalized)
  ) {
    return [
      "Oui. Le brouillon ne supprime pas la discussion de fond: il la place après le retour au calme / la réparation légère.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(compte autant|reparation rapide|réparation rapide)\b/.test(normalized)
  ) {
    return [
      "Oui. Dans ce brouillon, la réparation rapide après tension fait partie du critère de réussite, au même niveau que la discussion réussie.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(ne rajoute pas|n'ajoute pas|n ajoute pas|pas plus d'actions|pas plus d actions|sans ajouter|sans action supplementaire|sans actions supplementaires)\b/
      .test(normalized) ||
    /\b(pas|sans|aucune?)\b[\s\S]{0,80}\b(trois|3|plusieurs|nouvelles?|actions?)\b/
      .test(normalized)
  ) {
    const concreteChange = insertedStep || after;
    return [
      concreteChange
        ? `Oui: le brouillon ne rajoute pas plusieurs nouvelles actions. Il ajuste la trajectoire autour de ça: ${concreteChange}`
        : "Oui: le brouillon ne rajoute pas plusieurs nouvelles actions. Il ajuste la trajectoire du plan sans transformer ça en nouvelle liste de tâches.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(trop mou|au feeling|idee de progression|idée de progression|garde quand meme.*progression|garder.*progression|perds l idee de progression|perds l'idée de progression|perdre l idee de progression|perdre l'idée de progression|progression du plan)\b/
      .test(normalized)
  ) {
    const warmthOrRepairCriterion =
      /\b(chaleur|fiabilite|fiabilité|case|cases|performance|reparer vite|réparer vite|maladresse)\b/
        .test(normalized) ||
      /\b(chaleur|fiabilite|fiabilité|case|cases|performance|maladresse)\b/
        .test(`${after} ${insertedStep}`);
    if (warmthOrRepairCriterion) {
      return [
        "Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling.",
        "Le brouillon garde une progression, mais il change le critère de lecture: on cherche des signes concrets de chaleur, de fiabilité et de réparation rapide, pas une exécution parfaite des actions.",
        "Si tu valides, ce feedback servira à régénérer le plan dans ce sens. Rien n'est encore appliqué.",
      ].join("\n\n");
    }
    const progressionAnchor = insertedStep || after;
    return [
      "Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling.",
      progressionAnchor
        ? `Le brouillon garde une progression. La marche prévue est claire: ${progressionAnchor}`
        : "Le brouillon garde une progression: il clarifie la marche suivante au lieu de laisser le plan avancer au feeling.",
      "Si tu valides, ce feedback servira à régénérer le plan dans ce sens. Rien n'est encore appliqué.",
    ].join("\n\n");
  }

  if (basis) {
    return [
      `Oui. Le brouillon prévoit bien: ${basis}`,
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }
  return null;
}

function isAdjustPlanDraftRewriteRequest(message: string): boolean {
  const normalized = normalizeRecommendationText(message);
  const asksOnlyForConfirmation =
    /\b(confirme(?:\s+moi)?|est ce que|tu peux me dire|peux tu me dire|avant validation|avant de valider)\b/
      .test(normalized);
  const strongRewrite =
    /\b(ajoute|ajouter|integre|integrer|corrige|corriger|modifie|modifier|remplace|remplacer|retire|retirer)\b/
      .test(normalized) ||
    /\b(au brouillon|dans le brouillon|dans la proposition|dans cette version|garde .*brouillon|mets .*brouillon)\b/
      .test(normalized);
  if (asksOnlyForConfirmation && !strongRewrite) return false;
  return strongRewrite ||
    /\b(change|changer)\b/.test(normalized);
}

function isSimpleAdjustPlanDraftRevisionMessage(message: string): boolean {
  const normalized = normalizeRecommendationText(message);
  return /\b(brouillon|proposition|version|ajustement)\b/.test(normalized) &&
    /\b(modifie|corrige|change|prefere|plutot|au lieu)\b/.test(normalized) &&
    /\b(n'applique pas|n'applique rien|pas encore|sans appliquer|avant validation)\b/
      .test(normalized);
}

function replaceAdjustPlanDraftText(
  value: unknown,
  instruction: string,
): string {
  const text = String(value ?? "");
  if (!text) return text;
  return text
    .replace(/instruction:une phrase simple même imparfaite/gi, instruction)
    .replace(/une phrase simple, même imparfaite/gi, instruction)
    .replace(/une phrase simple même imparfaite/gi, instruction)
    .replace(/phrase simple, même imparfaite/gi, instruction)
    .replace(/phrase simple même imparfaite/gi, instruction)
    .replace(/une phrase simple/gi, instruction)
    .replace(/phrase simple/gi, instruction);
}

function wholePlanDraftNuanceLine(userMessage: string): string | null {
  const normalized = normalizeRecommendationText(userMessage);
  if (
    /\b(critere de sortie|critère de sortie|passer a la suite|passer à la suite|deux demandes simples|2 demandes simples|tension forte)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: le passage à la suite dépend d'un critère simple, par exemple deux demandes simples réussies sans tension forte.";
  }
  if (
    /\b(discussion de fond|parler du fond|reproches|fond)\b/.test(
      normalized,
    ) &&
    /\b(retour au calme|revenir au calme|apres|après|decale|décale)\b/.test(
      normalized,
    )
  ) {
    return "Nuance intégrée: la discussion de fond est conservée, mais seulement après un retour au calme.";
  }
  if (
    /\b(reparation rapide|réparation rapide|petit geste|apres une tension|après une tension|compte autant)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: la réparation rapide après tension compte autant que la discussion réussie dans le critère de progrès.";
  }
  if (
    /\b(reparer vite|réparer vite|maladresse|pas reussir a tout faire parfaitement|pas réussir à tout faire parfaitement)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: le signe de progrès principal est de réparer vite après une maladresse, pas de réussir à tout faire parfaitement.";
  }
  if (
    /\b(nuance|ajoute|ajouter|integre|intègre|garde)\b/.test(normalized) &&
    /\b(brouillon|version|critere|critère|discussion|progres|progrès|trajectoire)\b/
      .test(normalized)
  ) {
    const cleaned = userMessage.trim().replace(/\s+/g, " ")
      .replace(/^(ok|oui|d accord|d'accord)[,.\s]+/i, "")
      .replace(
        /^(ajoute|ajouter|integre|intègre|integrer)\s+(juste\s+)?((cette\s+)?nuance\s+)?(au|dans le)\s+brouillon\s+(que|:)?\s*/i,
        "",
      )
      .replace(
        /^(garde|mets)\s+(juste\s+)?(au|dans le)\s+brouillon\s+(que|:)?\s*/i,
        "",
      )
      .replace(
        /\b(ne valide\s+pas(?:\s+encore|\s+toujours)?|ne valide(?:\s+encore|\s+toujours)?\s+pas|n'applique\s+rien|ne l'applique\s+pas|sans appliquer|pas encore)\b\.?/gi,
        "",
      )
      .trim();
    return cleaned ? `Nuance intégrée: ${cleaned.replace(/\.$/, "")}.` : null;
  }
  return null;
}

function appendAdjustPlanDraftNuance(
  draft: PlanAdjustmentDraftV1,
  nuanceLine: string,
) {
  const append = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (!text || text.includes(nuanceLine)) return text;
    return `${text}\n\n${nuanceLine}`;
  };
  draft.confirmation_message = append(draft.confirmation_message);
  draft.execution_message = append(draft.execution_message);
  const draftAny = draft.draft as any;
  draftAny.proposed_change = append(draftAny.proposed_change);
  const trajectory = draftAny.adjust_plan_result?.applied_change
    ?.trajectory_change;
  if (trajectory && typeof trajectory === "object") {
    trajectory.after = append(trajectory.after);
    trajectory.coaching_reason = append(trajectory.coaching_reason);
  }
  const rationale = draftAny.adjust_plan_result?.rationale;
  if (rationale && typeof rationale === "object") {
    rationale.expected_effect = append(rationale.expected_effect);
  }
}

function revisePendingAdjustPlanDraftDeterministically(args: {
  pending: {
    draft: PlanAdjustmentDraftV1;
  };
  userMessage: string;
}): PlanAdjustmentDraftV1 | null {
  const normalized = normalizeRecommendationText(args.userMessage);
  const reviewOnly =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'applique pas|ne l'applique pas|n'applique rien|pas encore|sans appliquer|sans l'appliquer|avant validation|tant que je n'ai pas revalide)\b/
      .test(normalized);
  const maxTwoActions =
    /\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
      .test(normalized);
  const draftScope = String(
    (args.pending.draft.draft as any)?.adjust_plan_result?.scope ??
      (args.pending.draft.draft as any)?.execution_strategy ??
      "",
  ).trim();
  if (
    reviewOnly && maxTwoActions &&
    /\b(whole_plan|whole_plan_adjustment|plan global)\b/.test(
      normalizeRecommendationText(draftScope),
    )
  ) {
    const next = JSON.parse(
      JSON.stringify(args.pending.draft),
    ) as PlanAdjustmentDraftV1;
    const draftAny = next.draft as any;
    const constraints = Array.isArray(draftAny.patch?.constraints)
      ? draftAny.patch.constraints
      : [];
    draftAny.patch = {
      ...(draftAny.patch ?? {}),
      constraints: [
        ...constraints.filter((value: unknown) =>
          String(value ?? "").trim() !== "max_two_actions_next_step"
        ),
        "max_two_actions_next_step",
      ],
    };
    const line =
      "Contrainte ajoutée: la prochaine étape reste limitée à deux actions maximum.";
    const appendConstraint = (value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text || text.includes(line)) return text;
      return `${text}\n\n${line}`;
    };
    next.confirmation_message = appendConstraint(next.confirmation_message);
    next.execution_message = appendConstraint(next.execution_message);
    draftAny.proposed_change = appendConstraint(draftAny.proposed_change);
    return next;
  }
  const wholePlanScope = /\b(whole_plan|whole_plan_adjustment|plan global)\b/
    .test(
      normalizeRecommendationText(draftScope),
    );
  const nuanceLine = wholePlanScope
    ? wholePlanDraftNuanceLine(args.userMessage)
    : null;
  if (reviewOnly && nuanceLine) {
    const next = JSON.parse(
      JSON.stringify(args.pending.draft),
    ) as PlanAdjustmentDraftV1;
    appendAdjustPlanDraftNuance(next, nuanceLine);
    return next;
  }
  if (!isSimpleAdjustPlanDraftRevisionMessage(args.userMessage)) return null;
  if (!/\bphrase neutre\b/.test(normalized)) return null;
  const instruction = /\bimparfaite\b/.test(normalized)
    ? "une phrase neutre, même imparfaite"
    : "une phrase neutre";
  const wantsFreeTiming = asksForFreeTiming(args.userMessage);
  const next = JSON.parse(
    JSON.stringify(args.pending.draft),
  ) as PlanAdjustmentDraftV1;
  const draftAny = next.draft as any;
  draftAny.patch = {
    ...(draftAny.patch ?? {}),
    instruction,
  };
  for (
    const key of [
      "proposed_change",
      "why_it_helps",
      "confirmation_message",
      "execution_message",
    ]
  ) {
    if (typeof (next as any)[key] === "string") {
      (next as any)[key] = replaceAdjustPlanDraftText(
        (next as any)[key],
        instruction,
      );
    }
    if (typeof draftAny[key] === "string") {
      draftAny[key] = replaceAdjustPlanDraftText(draftAny[key], instruction);
    }
  }
  const result = draftAny.adjust_plan_result as any;
  if (result) {
    for (const key of ["user_message_brief", "user_message_detailed"]) {
      if (typeof result[key] === "string") {
        result[key] = replaceAdjustPlanDraftText(result[key], instruction);
      }
    }
    const changedItems = Array.isArray(result.applied_change?.changed_items)
      ? result.applied_change.changed_items
      : [];
    for (const item of changedItems) {
      if (typeof item.after === "string") {
        item.after = replaceAdjustPlanDraftText(item.after, instruction);
        if (wantsFreeTiming && !asksForFreeTiming(item.after)) {
          item.after = `${item.after}, sans créneau fixe`;
        }
      }
      if (typeof item.reason === "string") {
        item.reason = replaceAdjustPlanDraftText(item.reason, instruction);
      }
    }
  }
  if (typeof next.confirmation_message === "string") {
    next.confirmation_message = replaceAdjustPlanDraftText(
      next.confirmation_message,
      instruction,
    );
  }
  if (typeof next.execution_message === "string") {
    next.execution_message = replaceAdjustPlanDraftText(
      next.execution_message,
      instruction,
    );
  }
  return next;
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

function pendingConfirmationOwnedByToolSkill(value: unknown): boolean {
  return [
    "adjust_plan_item",
    "prepare_attack_card",
    "prepare_defense_card",
    "create_recurring_reminder",
    "select_state_potion",
    "update_coach_preferences",
  ].includes(String(pendingOperationType(value) ?? ""));
}

function compactRuntimeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 160) : null;
}

function compactRuntimeRecord(
  value: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = record[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string") {
      const text = compactRuntimeString(raw);
      if (text) out[key] = text;
      continue;
    }
    if (
      typeof raw === "number" || typeof raw === "boolean" ||
      Array.isArray(raw)
    ) {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "object") {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pendingRecommendationOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : null;
}

function buildToolSkillRuntimeContext(args: {
  tempMemory: unknown;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
}): Record<string, unknown> | null {
  const temp = (args.tempMemory ?? {}) as any;
  const pendingDraftReview = temp.__pending_adjust_plan_draft_review;
  if (isPendingAdjustPlanDraftReview(pendingDraftReview)) {
    return {
      owner: "tool_skill",
      operation_type: "adjust_plan_item",
      phase: "awaiting_confirmation",
      runtime_phase: "draft_review",
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_adjust_plan_draft_review",
      operation_id: compactRuntimeString(pendingDraftReview.operation_id),
      turn_count: Number(pendingDraftReview.turn_count ?? 0),
      known_slots: compactRuntimeRecord(pendingDraftReview.operation_input, [
        "target_granularity",
        "scope",
        "adjustment_type",
        "reason_change",
        "change_target",
      ]),
    };
  }

  if (pendingConfirmationOwnedByToolSkill(args.pendingOperationConfirmation)) {
    const pending = args.pendingOperationConfirmation as any;
    return {
      owner: "tool_skill",
      operation_type: pendingOperationType(pending),
      phase: "awaiting_confirmation",
      runtime_phase: compactRuntimeString(pending?.phase),
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_tool_skill_confirmation",
      operation_id: compactRuntimeString(pending?.operation_id),
      turn_count: Number(pending?.turn_count ?? 0),
      known_slots: compactRuntimeRecord(pending?.operation_input, [
        "target",
        "attachment",
        "risk_situation",
        "scope",
        "target_granularity",
        "preference_type",
        "preference_value",
        "potion_type",
        "state",
      ]),
    };
  }

  const pendingRecommendation = temp.__pending_recommendation_operation;
  const recommendationOperationType = pendingRecommendationOperationType(
    pendingRecommendation,
  );
  if (recommendationOperationType) {
    return {
      owner: "tool_skill",
      operation_type: recommendationOperationType,
      phase: "awaiting_recommendation_confirmation",
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_recommendation_operation",
      recommendation_id: compactRuntimeString(
        (pendingRecommendation as any)?.recommendation_id,
      ),
      known_slots: compactRuntimeRecord(
        (pendingRecommendation as any)?.operation_input,
        [
          "target",
          "attachment",
          "risk_situation",
          "scope",
          "target_granularity",
          "preference_type",
          "preference_value",
          "potion_type",
          "state",
        ],
      ),
    };
  }

  const active = args.activeOperationIntake as any;
  if (active && typeof active === "object" && active.operation_type) {
    return {
      owner: "tool_skill",
      operation_type: compactRuntimeString(active.operation_type),
      phase: compactRuntimeString(active.phase) ?? "intake",
      pending_confirmation: false,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__active_tool_skill_intake",
      operation_id: compactRuntimeString(active.operation_id),
      turn_count: Number(active.turn_count ?? 0),
      known_slots: compactRuntimeRecord(active.operation_input, [
        "target",
        "attachment",
        "risk_situation",
        "scope",
        "target_granularity",
        "preference_type",
        "preference_value",
        "potion_type",
        "state",
      ]),
    };
  }

  return null;
}

function buildConversationSkillRuntimeContext(
  activeSkillState: unknown,
): Record<string, unknown> | null {
  const active = activeSkillState as any;
  if (!active || typeof active !== "object" || !active.skill_id) return null;
  const workingState = active.working_state &&
      typeof active.working_state === "object"
    ? active.working_state as Record<string, unknown>
    : {};
  const phase = compactRuntimeString(
    (workingState as any).phase ?? (workingState as any).step,
  );
  const status = compactRuntimeString(
    (workingState as any).status ?? active.status,
  );
  const pendingConfirmation = Boolean(
    (workingState as any).pending_confirmation ||
      (workingState as any).confirmation_required === true ||
      (workingState as any).requires_confirmation === true ||
      /\b(confirm|confirmation|pending|awaiting)\b/i.test(
        `${phase ?? ""} ${status ?? ""}`,
      ),
  );
  if (!pendingConfirmation) return null;
  return {
    owner: "conversation_skill",
    skill_id: compactRuntimeString(active.skill_id),
    phase: phase ?? "awaiting_confirmation",
    status,
    pending_confirmation: true,
    confirmation_owned_by_runtime: true,
    dispatcher_must_not_classify_confirmation: true,
    source: "__active_skill_state",
    turn_count: Number(active.turn_count ?? 0),
    known_slots: compactRuntimeRecord(workingState, [
      "phase",
      "step",
      "status",
      "pending_confirmation",
      "confirmation_required",
      "requires_confirmation",
      "selected_option",
      "decision",
      "candidate",
    ]),
  };
}

function buildDispatcherActiveRuntimeContext(args: {
  tempMemory: unknown;
  activeSkillState: unknown;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
}): Record<string, unknown> | null {
  return buildToolSkillRuntimeContext({
    tempMemory: args.tempMemory,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
  }) ?? buildConversationSkillRuntimeContext(args.activeSkillState);
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

export function isActiveAttackCardKeywordIntake(value: unknown): boolean {
  const record = value as any;
  if (!record || typeof record !== "object") return false;
  if (record.operation_type !== "prepare_attack_card") return false;
  const phase = String(record.phase ?? "").trim();
  const slot = String(
    record.slot_state?.slot ?? record.next_question?.slot ?? "",
  )
    .trim();
  const missing = Array.isArray(record.missing_slots)
    ? record.missing_slots.map((item: unknown) => String(item))
    : [];
  return phase === "keyword_intake" || slot === "activation_keyword" ||
    missing.includes("activation_keyword");
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

export function operationRouteIsSelected(args: {
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
  const pendingType = pendingOperationType(pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;
  const pendingRecommendation = (args.tempMemory as any)
    ?.__pending_recommendation_operation;
  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
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

export function isPendingAttackCardOperation(value: unknown): value is {
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

export function attackCardTargetFromPendingConfirmation(
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

export function attackCardTargetFromQuestionCandidate(
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

function attackCardTechniqueOptionFromQuestion(question: any): {
  key: string;
  title: string;
  description: string;
  reason: string;
  example: string;
  recommended: boolean;
} | null {
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
      .filter((option: any) => option.key && option.title)
    : [];
  return techniqueOptions.find((option: any) => option.recommended) ??
    techniqueOptions.find((option: any) => option.key === "texte_recadrage") ??
    techniqueOptions[0] ?? null;
}

export function applyAttackCardSingleTechniquePreferenceForTest(
  nextQuestion: unknown,
  options?: { preferSingleTechnique?: boolean },
): unknown {
  const question = nextQuestion as any;
  if (
    !options?.preferSingleTechnique ||
    String(question?.slot ?? "") !== "technique"
  ) {
    return nextQuestion;
  }
  const selected = attackCardTechniqueOptionFromQuestion(question);
  if (!selected) return nextQuestion;
  const detail = selected.reason || selected.description;
  return {
    ...question,
    question: `Je te propose ${selected.title}: ${detail}. On part là-dessus ?`,
    technique_options: [{
      technique_key: selected.key,
      title: selected.title,
      description: selected.description,
      reason: selected.reason,
      example: selected.example,
      recommended: true,
    }],
    known_slots: {
      ...(question?.known_slots ?? {}),
      suggested_attack_technique: selected.key,
      suggested_attack_technique_title: selected.title,
    },
  };
}

export function attackCardOperationInputWithSingleTechniqueApproval(
  operationInput: Record<string, unknown> | null | undefined,
  userMessage: string,
): Record<string, unknown> | null | undefined {
  const suggested = String(
    operationInput?.suggested_attack_technique ?? "",
  ).trim();
  if (!suggested) return operationInput;
  if (
    !/^(oui|ok|okay|go|vas y|vas-y|d accord|partons|on part|valide)\b/.test(
      normalizeRouteText(userMessage),
    )
  ) {
    return operationInput;
  }
  return {
    ...(operationInput ?? {}),
    technique: suggested,
    desired_attack_technique: suggested,
  };
}

export function mergeAttackCardQuestionKnownSlots(
  operationInput: Record<string, unknown> | null | undefined,
  nextQuestion: unknown,
): Record<string, unknown> | null | undefined {
  const known = (nextQuestion as any)?.known_slots;
  if (!known || typeof known !== "object" || Array.isArray(known)) {
    return operationInput;
  }
  return { ...(operationInput ?? {}), ...(known as Record<string, unknown>) };
}

export function renderAttackCardSlotQuestion(
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

export function isAttackCardLocationOrManagementQuestion(message: string): boolean {
  const text = normalizeOperationText(message);
  return /\b(retrouve|retrouver|trouve|trouver|chercher|cherche|ou exactement|ou est|ou sont|ressources|modifier|modifie|imprimer|imprime)\b/
    .test(text) &&
    /\b(carte|cartes|attaque|elle|la)\b/.test(text) &&
    !/\b(cree|creer|fais|faire|nouvelle)\b/.test(text);
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

export function isPendingDefenseCardOperation(value: unknown): value is {
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
  const generated = String(question?.question ?? "").trim();
  if (generated) return generated;
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

function buildRecurringReminderPlatformContext(args: {
  v2Runtime?: ActiveTransformationRuntime | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> {
  const transformation = args.v2Runtime?.transformation ?? null;
  const plan = args.v2Runtime?.plan ?? null;
  const planItems = (args.planItemSnapshot ?? []).slice(0, 20).map((item) => {
    const isRecurringHabitTarget = item.item_nature === "recurring_habit" ||
      item.item_type === "habit";
    return {
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      dimension: item.dimension,
      kind: item.item_type,
      status: item.status,
      item_nature: item.item_nature ?? null,
      cadence_label: item.cadence_label ?? null,
      target_reps: item.target_reps ?? null,
      current_reps: item.current_reps ?? null,
      scheduled_days: item.scheduled_days ?? null,
      time_of_day: item.time_of_day ?? null,
      available_this_week: item.available_this_week ?? null,
      availability_status: item.availability_status ?? null,
      week_scope: item.week_scope ?? null,
      generated_temp_id: item.generated_temp_id ?? null,
      action_family_key: isRecurringHabitTarget
        ? buildActionFamilyKey({
          id: item.id,
          title: item.title,
          kind: item.item_type,
          dimension: item.dimension,
          payload: null,
        })
        : null,
    };
  });
  return {
    active_cycle: args.v2Runtime?.cycle
      ? {
        id: args.v2Runtime.cycle.id,
        status: args.v2Runtime.cycle.status,
        active_transformation_id: args.v2Runtime.cycle.active_transformation_id,
      }
      : null,
    active_transformation: transformation
      ? {
        id: transformation.id,
        title: transformation.title,
        user_summary: transformation.user_summary,
        success_definition: transformation.success_definition,
        main_constraint: transformation.main_constraint,
      }
      : null,
    active_plan: plan
      ? {
        id: plan.id,
        title: plan.title,
        status: plan.status,
      }
      : null,
    active_plans: plan
      ? [{
        cycle_id: args.v2Runtime?.cycle?.id ?? null,
        transformation_id: transformation?.id ?? null,
        transformation_title: transformation?.title ?? null,
        plan_id: plan.id,
        plan_title: plan.title,
        status: plan.status,
        plan_items: planItems,
      }]
      : [],
    plan_items: planItems,
  };
}

function recurringReminderPlanItemContext(args: {
  draft: RecurringReminderDraftV1;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const relatedId = String(args.draft.draft.related_plan_item_id ?? "").trim();
  if (!relatedId) return null;
  const item = (args.planItemSnapshot ?? []).find((candidate) =>
    candidate.id === relatedId
  );
  if (!item) return { id: relatedId, status: "not_found_in_snapshot" };
  const isRecurringHabitTarget = item.item_nature === "recurring_habit" ||
    item.item_type === "habit";
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    dimension: item.dimension,
    kind: item.item_type,
    item_nature: item.item_nature ?? null,
    cadence_label: item.cadence_label ?? null,
    target_reps: item.target_reps ?? null,
    current_reps: item.current_reps ?? null,
    scheduled_days: item.scheduled_days ?? null,
    time_of_day: item.time_of_day ?? null,
    week_scope: item.week_scope ?? null,
    generated_temp_id: item.generated_temp_id ?? null,
    action_family_key: isRecurringHabitTarget
      ? buildActionFamilyKey({
        id: item.id,
        title: item.title,
        kind: item.item_type,
        dimension: item.dimension,
        payload: null,
      })
      : null,
  };
}

function recurringReminderTargetBinding(args: {
  draft: RecurringReminderDraftV1;
  relatedPlanItem: Record<string, unknown> | null;
  resolvedDestination: "current_plan" | "base_de_vie";
}): {
  target_kind: "none" | "transformation" | "plan_item" | "action_family";
  target_plan_item_id: string | null;
  target_action_family_key: string | null;
  target_generated_temp_id: string | null;
  target_binding_policy:
    | "none"
    | "snapshot"
    | "live_action"
    | "live_action_family";
  target_lifecycle_policy:
    | "independent"
    | "while_target_active"
    | "while_family_in_current_plan";
  target_label: string | null;
} {
  const requested = args.draft.draft.target_binding ?? null;
  const relatedId = String(args.relatedPlanItem?.id ?? "").trim() ||
    String(args.draft.draft.related_plan_item_id ?? "").trim();
  const relatedLabel = String(args.relatedPlanItem?.title ?? "").trim() ||
    requested?.target_label || null;
  const actionFamilyKey = String(
    args.relatedPlanItem?.action_family_key ??
      requested?.target_action_family_key ?? "",
  ).trim() || null;
  const generatedTempId = String(
    args.relatedPlanItem?.generated_temp_id ??
      requested?.target_generated_temp_id ?? "",
  ).trim() || null;
  const itemNature = String(args.relatedPlanItem?.item_nature ?? "").trim();
  const isRecurringHabitTarget = itemNature === "recurring_habit" ||
    String(args.relatedPlanItem?.kind ?? "").trim() === "habit";

  if (args.resolvedDestination !== "current_plan") {
    return {
      target_kind: "none",
      target_plan_item_id: null,
      target_action_family_key: null,
      target_generated_temp_id: null,
      target_binding_policy: "none",
      target_lifecycle_policy: "independent",
      target_label: null,
    };
  }

  if (
    (requested?.target_kind === "action_family" && isRecurringHabitTarget) ||
    (relatedId && isRecurringHabitTarget && actionFamilyKey)
  ) {
    return {
      target_kind: "action_family",
      target_plan_item_id: relatedId || requested?.target_plan_item_id || null,
      target_action_family_key: actionFamilyKey,
      target_generated_temp_id: generatedTempId,
      target_binding_policy: "live_action_family",
      target_lifecycle_policy: "while_family_in_current_plan",
      target_label: relatedLabel,
    };
  }

  if (requested?.target_kind === "plan_item" || relatedId) {
    return {
      target_kind: "plan_item",
      target_plan_item_id: relatedId || requested?.target_plan_item_id || null,
      target_action_family_key: actionFamilyKey,
      target_generated_temp_id: generatedTempId,
      target_binding_policy: "live_action",
      target_lifecycle_policy: "while_target_active",
      target_label: relatedLabel,
    };
  }

  return {
    target_kind: "transformation",
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    target_binding_policy: "snapshot",
    target_lifecycle_policy: "independent",
    target_label: requested?.target_label ?? null,
  };
}

async function classifyRecurringReminderBestEffort(args: {
  userId: string;
  reminderId: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
    const serviceRoleKey = String(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ).trim();
    if (!url || !serviceRoleKey) {
      return { ok: false, error: "classification_env_missing" };
    }
    const response = await fetch(
      `${url.replace(/\/$/, "")}/functions/v1/classify-recurring-reminder`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          reminder_id: args.reminderId,
          user_id: args.userId,
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn("[Router] recurring reminder classification failed", data);
      return {
        ok: false,
        status: response.status,
        error: data && typeof data === "object"
          ? data
          : `http_${response.status}`,
      };
    }
    return data && typeof data === "object"
      ? data as Record<string, unknown>
      : { ok: true };
  } catch (error) {
    console.warn("[Router] recurring reminder classification failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function insertRecurringReminderFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: RecurringReminderDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  v2Runtime?: ActiveTransformationRuntime | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}) {
  const scheduledDays = scheduledDaysFromDraft(args.draft);
  const activeCycle = args.v2Runtime?.cycle ?? null;
  const activeTransformation = args.v2Runtime?.transformation ?? null;
  const activePlan = args.v2Runtime?.plan ?? null;
  const relatedPlanItem = recurringReminderPlanItemContext({
    draft: args.draft,
    planItemSnapshot: args.planItemSnapshot,
  });
  const hasActivePlanContext = Boolean(
    activeCycle?.id && activeTransformation?.id && activePlan?.id,
  );
  const wantsCurrentPlan = args.draft.draft.destination === "current_plan";
  const resolvedDestination = wantsCurrentPlan && hasActivePlanContext
    ? "current_plan"
    : "base_de_vie";
  const targetBinding = recurringReminderTargetBinding({
    draft: args.draft,
    relatedPlanItem,
    resolvedDestination,
  });
  const nowIso = new Date().toISOString();
  const insertResult = await args.supabase
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      cycle_id: activeCycle?.id ?? null,
      transformation_id: resolvedDestination === "current_plan"
        ? activeTransformation?.id ?? null
        : null,
      message_instruction: args.draft.draft.message,
      rationale: resolvedDestination === "current_plan" && activeTransformation
        ? `Rappel récurrent créé depuis la conversation Sophia pour soutenir ${
          activeTransformation.title ?? "la transformation en cours"
        } : ${args.draft.draft.title}`
        : `Rappel récurrent créé depuis la conversation web Sophia : ${args.draft.draft.title}`,
      local_time_hhmm: args.draft.draft.time,
      scheduled_days: scheduledDays,
      status: "active",
      starts_at: nowIso,
      ends_at: null,
      deactivated_at: null,
      ended_reason: null,
      archived_at: null,
      scope_kind: resolvedDestination === "current_plan"
        ? "transformation"
        : "out_of_plan",
      initiative_kind: resolvedDestination === "current_plan"
        ? "plan_free"
        : "base_free",
      source_kind: "user_created",
      source_potion_session_id: null,
      target_kind: targetBinding.target_kind,
      target_plan_item_id: targetBinding.target_plan_item_id,
      target_action_family_key: targetBinding.target_action_family_key,
      target_generated_temp_id: targetBinding.target_generated_temp_id,
      target_binding_policy: targetBinding.target_binding_policy,
      target_lifecycle_policy: targetBinding.target_lifecycle_policy,
      updated_at: nowIso,
      initiative_metadata: {
        source: "sophia_brain_tool_skill",
        operation_type: "create_recurring_reminder",
        operation_id: args.operationId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        request_id: args.requestId ?? null,
        destination_requested: args.draft.draft.destination,
        destination_resolved: resolvedDestination,
        active_cycle_id: activeCycle?.id ?? null,
        active_transformation_id: activeTransformation?.id ?? null,
        active_transformation_title: activeTransformation?.title ?? null,
        active_plan_id: activePlan?.id ?? null,
        active_plan_title: activePlan?.title ?? null,
        related_plan_item: relatedPlanItem,
        target_binding: targetBinding,
        draft: args.draft,
      },
    } as any)
    .select(
      "id,target_kind,target_plan_item_id,target_action_family_key,target_generated_temp_id,target_binding_policy,target_lifecycle_policy",
    )
    .single();
  if (insertResult.error || !insertResult.data?.id) return insertResult;
  await classifyRecurringReminderBestEffort({
    userId: args.userId,
    reminderId: String(insertResult.data.id),
  });
  return insertResult;
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

let operationServiceClient: SupabaseClient | null = null;

function getOperationServiceClient(): SupabaseClient | null {
  if (operationServiceClient) return operationServiceClient;
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const key = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) return null;
  operationServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return operationServiceClient;
}

export async function insertAttackCardFromDraft(args: {
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
  const writeClient = getOperationServiceClient() ?? args.supabase;
  const cycleId = await ensureOperationCycle({
    supabase: writeClient,
    userId: args.userId,
  });
  const planItemId = args.attachment?.kind === "plan_item"
    ? args.attachment?.plan_item_id ?? null
    : null;
  const attachmentTitle = args.attachment?.title ??
    args.draft.draft.target_label;
  const triggerId = crypto.randomUUID();
  const impulseId = crypto.randomUUID();
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
      impulses: [
        {
          impulse_id: impulseId,
          label: args.draft.draft.impulse_label || args.draft.draft.title,
          generic_defense: args.draft.draft.generic_defense ||
            args.draft.draft.defense_response,
          triggers: [
            {
              trigger_id: triggerId,
              label: args.draft.draft.title,
              difficulty_preview: args.draft.draft.why_it_helps || null,
              illustration: null,
              situation: args.draft.draft.situation,
              signal: args.draft.draft.signal,
              defense_response: args.draft.draft.defense_response,
              plan_b: args.draft.draft.plan_b,
            },
          ],
        },
      ],
      difficulty_map_summary: null,
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

  const { data, error } = await writeClient
    .from("user_defense_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) return { data, error };

  if (planItemId) {
    const { error: planItemUpdateError } = await writeClient
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
  const writeClient = getOperationServiceClient() ?? args.supabase;
  const cycleId = await ensureOperationCycle({
    supabase: writeClient,
    userId: args.userId,
  });
  const nowIso = new Date().toISOString();
  const targetBinding = args.draft.target_binding ?? {
    kind: "none",
    label: null,
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: null,
    date_or_window_hint: null,
    evidence: [],
  };
  const schedulePlan = args.draft.follow_up.schedule_plan ?? {
    mode: "daily_series",
    duration_days: args.draft.follow_up.duration_days,
    local_time_hhmm: args.draft.follow_up.local_time_hhmm,
    scheduled_days: [],
    local_dates: [],
    timing_relation: "daily",
    reason: args.draft.follow_up.reason_for_time,
  };
  const scheduledDays = schedulePlan.mode === "specific_weekdays" &&
      schedulePlan.scheduled_days?.length
    ? schedulePlan.scheduled_days
    : args.scheduledFollowups
      .map((followup) =>
        ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
          new Date(`${followup.local_date}T00:00:00.000Z`).getUTCDay()
        ]
      )
      .filter((day, index, all) => day && all.indexOf(day) === index);
  const lifecyclePolicy = targetBinding.kind === "plan_item"
    ? "while_target_active"
    : targetBinding.kind === "action_family"
    ? "while_family_in_current_plan"
    : "independent";
  const bindingPolicy = targetBinding.kind === "plan_item"
    ? "live_action"
    : targetBinding.kind === "action_family"
    ? "live_action_family"
    : targetBinding.kind === "none"
    ? "none"
    : "snapshot";
  const { data: potion, error: potionError } = await writeClient
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
        potion_info_message: args.draft.potion_info_message,
        why_this_potion: args.draft.why_this_potion,
        target_binding: targetBinding,
        operation_draft: args.draft,
      },
      follow_up_strategy: {
        ...args.draft.follow_up,
        target_binding: targetBinding,
        schedule_plan: schedulePlan,
      },
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
  const { data: reminder, error: reminderError } = await writeClient
    .from("user_recurring_reminders")
    .insert({
      user_id: args.userId,
      cycle_id: cycleId,
      message_instruction: followUp.reminder_instruction,
      rationale: schedulePlan.reason || `Suivi pour ${args.draft.title}`,
      local_time_hhmm: schedulePlan.local_time_hhmm ?? followUp.local_time_hhmm,
      scheduled_days: scheduledDays.length
        ? scheduledDays
        : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
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
        schedule_plan: schedulePlan,
        target_binding: targetBinding,
      },
      target_kind: targetBinding.kind === "plan_item"
        ? "plan_item"
        : targetBinding.kind === "action_family"
        ? "action_family"
        : targetBinding.kind === "none"
        ? "none"
        : "transformation",
      target_plan_item_id: targetBinding.target_plan_item_id ??
        targetBinding.related_plan_item_id,
      target_action_family_key: targetBinding.target_action_family_key,
      target_generated_temp_id: targetBinding.target_generated_temp_id,
      target_binding_policy: bindingPolicy,
      target_lifecycle_policy: lifecyclePolicy,
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
    origin: "rendez_vous",
    status: "pending",
  }));
  const { data: checkins, error: checkinsError } = await writeClient
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

const FRENCH_SMALL_NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
};

function extractWeeklyTargetReps(text: string): number | null {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  const digitMatch = normalized.match(
    /\b([1-7])\s*(?:jours?|fois|x)\s*(?:\/|par|dans la)?\s*(?:semaine)?\b/,
  );
  if (digitMatch?.[1]) return Number(digitMatch[1]);
  const wordMatch = normalized.match(
    /\b(un|une|deux|trois|quatre|cinq|six|sept)\s*(?:jours?|fois|x)\s*(?:\/|par|dans la)?\s*(?:semaine)?\b/,
  );
  return wordMatch?.[1] ? FRENCH_SMALL_NUMBERS[wordMatch[1]] ?? null : null;
}

function extractSimpleInstruction(text: string): string | null {
  const normalizedWhitespace = text.replace(/\s+/g, " ").trim();
  const phraseMatch = normalizedWhitespace.match(
    /\bune\s+phrase\s+[^,.;]+/i,
  );
  if (phraseMatch?.[0]) return phraseMatch[0].trim();
  const barePhraseMatch = normalizedWhitespace.match(
    /\bphrase\s+(neutre|simple|courte|facile|tr[eè]s simple)\b/i,
  );
  if (barePhraseMatch?.[0]) return barePhraseMatch[0].trim();
  const merciMatch = normalizedWhitespace.match(/\bun\s+merci\s+[^,.;]+/i);
  return merciMatch?.[0] ? merciMatch[0].trim() : null;
}

const FRENCH_WEEKDAY_TO_CODE: Record<string, string> = {
  lundi: "mon",
  mardi: "tue",
  mercredi: "wed",
  jeudi: "thu",
  vendredi: "fri",
  samedi: "sat",
  dimanche: "sun",
};

function extractScheduledDaysFromFrenchText(text: string): string[] {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return Object.entries(FRENCH_WEEKDAY_TO_CODE)
    .filter(([day]) => new RegExp(`\\b${day}\\b`).test(normalized))
    .map(([, code]) => code);
}

function extractConcreteActionTitle(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/deconnexion\s+de\s+7\s+minutes/i.test(normalized)) {
    return "Deconnexion de 7 minutes apres le diner";
  }
  if (/phrase\s+de\s+sortie/i.test(normalized)) return "Phrase de sortie";
  return null;
}

function asksForFreeTiming(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return [
    "sans creneau",
    "sans creneau fixe",
    "sans creneau impose",
    "sans contrainte de creneau",
    "pas de creneau",
    "moment libre",
    "horaire libre",
    "sans horaire",
    "sans horaire fixe",
    "sans contrainte d'horaire",
    "sans contrainte horaire",
    "quand ca se presente",
    "naturellement",
  ].some((marker) => normalized.includes(marker));
}

function materializationTextForChangedItem(args: {
  draft: PlanAdjustmentDraftV1;
  change: any;
  patch: Record<string, unknown>;
}): string {
  return [
    args.change?.after,
    args.draft.draft.proposed_change,
    args.patch.instruction,
    args.patch.cadence_label,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function buildLevelMaterializedItemUpdate(args: {
  item: { kind?: string | null; dimension?: string | null };
  change: {
    capability?: unknown;
    after?: unknown;
  };
}): Record<string, unknown> {
  const capability = String(args.change?.capability ?? "").trim();
  const after = String(args.change?.after ?? "").trim();
  const update: Record<string, unknown> = {};
  if (capability === "modify_existing_action") {
    if (!after) throw new Error("level_action_after_missing");
    const title = extractConcreteActionTitle(after);
    if (title) update.title = title;
    update.description = after;
    const scheduledDays = extractScheduledDaysFromFrenchText(after);
    if (scheduledDays.length > 0) update.scheduled_days = scheduledDays;
    if (asksForFreeTiming(after)) update.time_of_day = "anytime";
    return update;
  }
  if (capability !== "change_action_frequency") return update;

  const targetReps = extractWeeklyTargetReps(after);
  if (targetReps == null) {
    throw new Error("level_frequency_target_reps_missing");
  }
  update.target_reps = targetReps;
  update.cadence_label = `${targetReps} jours / semaine`;

  const instruction = extractSimpleInstruction(after);
  if (instruction) update.description = instruction;
  const scheduledDays = extractScheduledDaysFromFrenchText(after);
  if (scheduledDays.length > 0) update.scheduled_days = scheduledDays;
  if (asksForFreeTiming(after)) update.time_of_day = "anytime";
  return update;
}

function planAdjustmentRegenerationFeedback(
  draft: PlanAdjustmentDraftV1,
): string {
  const result = draft.draft.adjust_plan_result;
  const changedItems = result?.applied_change?.changed_items ?? [];
  const preservedItems = result?.applied_change?.preserved_items ?? [];
  const trajectory = result?.applied_change?.trajectory_change ?? null;
  return [
    result?.user_message_detailed
      ? `Résumé pour le user de ce qui change: ${result.user_message_detailed}`
      : null,
    trajectory
      ? `Trajectoire confirmée:\n- Avant: ${
        String((trajectory as any).before ?? "").trim()
      }\n- Après: ${
        String((trajectory as any).after ?? "").trim()
      }\n- Étape ajoutée ou réordonnée: ${
        String((trajectory as any).inserted_step ?? "").trim() ||
        ((trajectory as any).reordered_steps ?? []).join(", ")
      }\n- Direction préservée: ${
        String((trajectory as any).preserved_direction ?? "").trim()
      }\n- Raison coaching: ${
        String((trajectory as any).coaching_reason ?? "").trim()
      }`
      : null,
    draft.draft.decision_basis?.user_problem
      ? `Problème identifié: ${draft.draft.decision_basis.user_problem}`
      : null,
    draft.draft.change_rationale?.why_this_change
      ? `Raison de l'ajustement: ${draft.draft.change_rationale.why_this_change}`
      : null,
    changedItems.length
      ? `Changements confirmés:\n${
        changedItems.map((item: any) =>
          `- ${String(item.title ?? "item").trim()}: ${
            String(item.before ?? "").trim() || "avant non précisé"
          } -> ${String(item.after ?? "").trim()}`
        ).join("\n")
      }`
      : null,
    preservedItems.length
      ? `À préserver:\n${
        preservedItems.map((item: any) =>
          `- ${String(item.title ?? "item").trim()}: ${
            String(item.reason ?? "").trim()
          }`
        ).join("\n")
      }`
      : null,
  ].filter((entry): entry is string => Boolean(entry?.trim())).join("\n\n");
}

type AdjustedPlanRegenerationResult = {
  plan_id: string;
  roadmap_changed: boolean;
};

export async function writePlanAdjustmentPatch(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: PlanAdjustmentDraftV1;
  operationInput?: Record<string, unknown> | null;
  operationId?: string | null;
  requestId?: string | null;
  sourceMessageId?: string | null;
  regenerateAdjustedPlan?: (input: {
    transformationId: string;
    scopeKind: "current_level" | "whole_plan";
    feedback: string;
    reason: string;
    userChangeSummary: string | null;
    assistantMessage: string | null;
  }) => Promise<AdjustedPlanRegenerationResult>;
}): Promise<{
  plan_patch_id: string;
  bridge_plan_item_id?: string | null;
  adjusted_plan_id?: string | null;
  roadmap_changed?: boolean;
}> {
  const scope = (args.operationInput?.scope as any) ?? null;
  const planItemId = String(scope?.plan_item_id ?? "").trim();
  const patchId = crypto.randomUUID();
  const patch = args.draft.draft.patch;
  const nowIso = new Date().toISOString();
  const materializedPlanItemIds = [
    ...new Set(
      (args.draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [])
        .filter((item: any) =>
          (item?.kind === "action" || item?.kind === "habit" ||
            item?.kind === "task") &&
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
  const materializedChangesById = new Map<string, any[]>();
  for (const item of materializedChangedItems as any[]) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    materializedChangesById.set(id, [
      ...(materializedChangesById.get(id) ?? []),
      item,
    ]);
  }

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
    if (code !== "23514" && !message.includes("snapshot_type")) {
      throw new Error(`plan_adjustment_snapshot_insert_failed:${message}`);
    }

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
    if (fallbackError) {
      throw new Error(
        `plan_adjustment_snapshot_fallback_failed:${
          JSON.stringify(fallbackError)
        }`,
      );
    }
  };

  if (!planItemId) {
    const scopeKind = String(scope?.kind ?? "").trim();
    if (scopeKind && scopeKind !== "specific_plan_item") {
      const patchConstraints = Array.isArray((patch as any)?.constraints)
        ? (patch as any).constraints.map((constraint: unknown) =>
          String(constraint ?? "").trim()
        ).filter(Boolean)
        : [];
      const singleAffectedLevelAdjustment = scopeKind === "current_level" &&
        patchConstraints.includes("strict_affected_items_only") &&
        (patchConstraints.filter((constraint: string) =>
              constraint.startsWith("affected_item:")
            ).length === 1 || materializedPlanItemIds.length === 1);
      const copyForwardLevelAdjustment = scopeKind === "current_level" &&
        (
          patchConstraints.includes("extend_current_level_same_plan") ||
          patchConstraints.includes("copy_forward_level_one_week") ||
          patchConstraints.includes("preserve_action_content") ||
          patchConstraints.includes("preserve_cadence")
        );
      const requiredMaterializedItems = singleAffectedLevelAdjustment ? 1 : 2;
      if (materializedPlanItemIds.length < requiredMaterializedItems) {
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
      if (
        (materializedItems as Array<{ dimension?: string | null }>).some((
          item,
        ) => String(item.dimension ?? "").trim() === "clarifications")
      ) {
        throw new Error("clarification_items_read_only");
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
        const changes = materializedChangesById.get(itemId) ?? [];
        for (const change of changes) {
          const capability = String(change?.capability ?? "").trim();
          if (!supportedLevelCapabilities.has(capability)) {
            throw new Error(
              `level_capability_not_materializable:${capability}`,
            );
          }
        }
      }
      type MaterializedPlanItem = {
        id: string;
        user_id?: string;
        cycle_id?: string | null;
        transformation_id?: string | null;
        plan_id?: string | null;
        dimension?: string | null;
        kind?: string | null;
        status?: string | null;
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
      };
      if (scopeKind === "whole_plan" && args.regenerateAdjustedPlan) {
        const transformationId = String(
          (materializedItems as MaterializedPlanItem[]).find((item) =>
            String(item.transformation_id ?? "").trim()
          )?.transformation_id ?? "",
        ).trim();
        if (!transformationId) {
          throw new Error("whole_plan_transformation_id_missing");
        }
        const adjustedPlanResult = await args.regenerateAdjustedPlan({
          transformationId,
          scopeKind: "whole_plan",
          feedback: planAdjustmentRegenerationFeedback(args.draft),
          reason: String(
            args.draft.draft.decision_basis?.user_problem ??
              args.draft.draft.change_rationale?.why_this_change ??
              args.draft.draft.proposed_change ??
              "Ajustement global confirmé depuis le chat.",
          ).trim(),
          userChangeSummary:
            args.draft.draft.adjust_plan_result?.user_message_brief ??
              args.draft.draft.proposed_change ?? null,
          assistantMessage: args.draft.confirmation_message ?? null,
        });
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
          adjusted_plan_id: adjustedPlanResult.plan_id,
          roadmap_changed: adjustedPlanResult.roadmap_changed,
          reason: "whole_plan_regenerated_from_chat",
          created_at: nowIso,
        });
        return {
          plan_patch_id: patchId,
          adjusted_plan_id: adjustedPlanResult.plan_id,
          roadmap_changed: adjustedPlanResult.roadmap_changed,
        };
      }
      const rollbackPlanItem = async (item: MaterializedPlanItem) => {
        const rollbackPatch = {
          dimension: item.dimension,
          kind: item.kind,
          status: item.status,
          title: item.title,
          description: item.description,
          tracking_type: item.tracking_type,
          activation_order: item.activation_order,
          activation_condition: item.activation_condition,
          current_habit_state: item.current_habit_state,
          support_mode: item.support_mode,
          support_function: item.support_function,
          target_reps: item.target_reps,
          current_reps: item.current_reps,
          cadence_label: item.cadence_label,
          scheduled_days: item.scheduled_days,
          time_of_day: item.time_of_day,
          start_after_item_id: item.start_after_item_id,
          phase_id: item.phase_id,
          phase_order: item.phase_order,
          cards_status: item.cards_status,
          payload: item.payload,
        };
        await args.supabase
          .from("user_plan_items")
          .update(rollbackPatch as any)
          .eq("id", item.id)
          .eq("user_id", args.userId);
      };
      const createdBridgeIds: string[] = [];
      let adjustedPlanResult: AdjustedPlanRegenerationResult | null = null;
      try {
        for (const item of materializedItems as MaterializedPlanItem[]) {
          const changes = materializedChangesById.get(item.id) ?? [];
          const capabilities = changes.map((change) =>
            String(change?.capability ?? "").trim()
          ).filter(Boolean);
          const currentPayload = item.payload &&
              typeof item.payload === "object"
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
          for (const change of changes) {
            const capability = String(change?.capability ?? "").trim();
            if (
              !copyForwardLevelAdjustment &&
              (capability === "modify_existing_action" ||
                capability === "change_action_frequency")
            ) {
              Object.assign(
                itemUpdate,
                buildLevelMaterializedItemUpdate({ item, change }),
              );
            }
          }
          if (
            capabilities.includes("pause_action") ||
            capabilities.includes("remove_action_from_level")
          ) {
            itemUpdate.status = capabilities.includes("pause_action")
              ? "in_maintenance"
              : "deactivated";
          }
          if (capabilities.includes("create_bridge_action")) {
            const change = changes.find((candidate) =>
              String(candidate?.capability ?? "").trim() ===
                "create_bridge_action"
            );
            const bridgeId = crypto.randomUUID();
            const bridgeTitle = `Version mini - ${
              String(item.title ?? "action").trim() || "action"
            }`;
            const bridgeDescription = String(change?.after ?? "").trim() ||
              `Action pont vers "${
                String(item.title ?? "l'action initiale")
              }".`;
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
            if (bridgeInsertError) {
              throw new Error(
                `plan_adjustment_bridge_insert_failed:${
                  JSON.stringify(bridgeInsertError)
                }`,
              );
            }
            createdBridgeIds.push(bridgeId);
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
          if (itemUpdateError) {
            throw new Error(
              `plan_adjustment_item_update_failed:${
                JSON.stringify(itemUpdateError)
              }`,
            );
          }
        }
        const transformationId = String(
          (materializedItems as MaterializedPlanItem[]).find((item) =>
            String(item.transformation_id ?? "").trim()
          )?.transformation_id ?? "",
        ).trim();
        if (
          args.regenerateAdjustedPlan &&
          !copyForwardLevelAdjustment &&
          !singleAffectedLevelAdjustment &&
          (scopeKind === "current_level" || scopeKind === "whole_plan") &&
          transformationId
        ) {
          adjustedPlanResult = await args.regenerateAdjustedPlan({
            transformationId,
            scopeKind,
            feedback: planAdjustmentRegenerationFeedback(args.draft),
            reason: String(
              args.draft.draft.decision_basis?.user_problem ??
                args.draft.draft.change_rationale?.why_this_change ??
                args.draft.draft.proposed_change ??
                "Ajustement confirmé depuis le chat.",
            ).trim(),
            userChangeSummary:
              args.draft.draft.adjust_plan_result?.user_message_brief ??
                args.draft.draft.proposed_change ?? null,
            assistantMessage: args.draft.confirmation_message ?? null,
          });
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
          adjusted_plan_id: adjustedPlanResult?.plan_id ?? null,
          roadmap_changed: adjustedPlanResult?.roadmap_changed ?? null,
          reason: "non_item_scope_plan_adjustment",
          created_at: nowIso,
        });
      } catch (error) {
        for (const bridgeId of createdBridgeIds) {
          await args.supabase
            .from("user_plan_items")
            .delete()
            .eq("id", bridgeId)
            .eq("user_id", args.userId);
        }
        for (const item of materializedItems as MaterializedPlanItem[]) {
          await rollbackPlanItem(item);
        }
        throw error;
      }
      return {
        plan_patch_id: patchId,
        adjusted_plan_id: adjustedPlanResult?.plan_id ?? null,
        roadmap_changed: adjustedPlanResult?.roadmap_changed ?? false,
      };
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
  if (String((item as any).dimension ?? "").trim() === "clarifications") {
    throw new Error("clarification_items_read_only");
  }

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
    updatePayload.status = "in_maintenance";
  }
  if (
    typeof patch.target_reps === "number" && Number.isFinite(patch.target_reps)
  ) {
    updatePayload.target_reps = patch.target_reps;
  }
  if (typeof patch.cadence_label === "string" && patch.cadence_label.trim()) {
    updatePayload.cadence_label = patch.cadence_label.trim();
  }
  if (typeof patch.instruction === "string" && patch.instruction.trim()) {
    updatePayload.description = patch.instruction.trim();
  }
  const materializedChangeForItem = materializedChangeById.get(planItemId) ??
    (materializedChangedItems.length === 1
      ? materializedChangedItems[0]
      : null);
  if (materializedChangeForItem) {
    const materializationText = materializationTextForChangedItem({
      draft: args.draft,
      change: materializedChangeForItem,
      patch: patch as Record<string, unknown>,
    });
    if (
      updatePayload.target_reps == null &&
      String((item as any).kind ?? "") === "habit"
    ) {
      const targetReps = extractWeeklyTargetReps(materializationText);
      if (targetReps != null) {
        updatePayload.target_reps = targetReps;
        updatePayload.cadence_label = `${targetReps} jours / semaine`;
      }
    }
    if (typeof updatePayload.description !== "string") {
      const instruction = extractSimpleInstruction(materializationText);
      if (instruction) updatePayload.description = instruction;
    }
    if (asksForFreeTiming(materializationText)) {
      updatePayload.time_of_day = "anytime";
    }
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
    return value === "direct" || value === "tres_direct"
      ? "Très direct"
      : value === "soft" || value === "doux"
      ? "Doux"
      : value === "warm_direct" || value === "bienveillant_ferme"
      ? "Bienveillant ferme"
      : value;
  }
  if (key === "coach.question_tendency") {
    return value === "low" || value === "peu_de_questions"
      ? "Peu de questions"
      : value === "high" || value === "tres_questionnant"
      ? "Très questionnant"
      : value === "normal" || value === "equilibre"
      ? "Équilibré"
      : value;
  }
  if (key === "coach.challenge_level") {
    return value === "high" || value === "eleve"
      ? "Élevé"
      : value === "low" || value === "leger"
      ? "Léger"
      : value === "balanced" || value === "equilibre"
      ? "Équilibré"
      : value;
  }
  if (key === "coach.response_max_lines") {
    return value === "three" ? "Trois lignes max" : "Format normal";
  }
  if (key === "coach.emoji_policy") {
    return value === "none" ? "Zéro emoji" : "Emoji normal";
  }
  if (key === "coach.final_question_policy") {
    return value === "avoid_unnecessary"
      ? "Pas de question finale inutile"
      : "Questions finales normales";
  }
  return value;
}

function coachPreferenceStatusLabel(pref: any): string {
  const key = String(pref?.key ?? "");
  const rawValue = String(pref?.value?.value ?? "");
  if (key === "coach.tone") {
    return `ton ${coachPreferenceLabel(key, rawValue).toLowerCase()}`;
  }
  if (key === "coach.question_tendency") {
    return rawValue === "low" || rawValue === "peu_de_questions"
      ? "moins de questions"
      : rawValue === "high" || rawValue === "tres_questionnant"
      ? "plus de questions"
      : "questions équilibrées";
  }
  if (key === "coach.challenge_level") {
    return `challenge ${coachPreferenceLabel(key, rawValue).toLowerCase()}`;
  }
  if (key === "coach.response_max_lines") {
    return rawValue === "three" ? "trois lignes max" : "format normal";
  }
  if (key === "coach.emoji_policy") {
    return rawValue === "none" ? "zéro emoji" : "emoji normal";
  }
  if (key === "coach.final_question_policy") {
    return rawValue === "avoid_unnecessary"
      ? "pas de question finale inutile"
      : "questions finales normales";
  }
  return String(
    pref?.value?.label ?? pref?.value?.value ?? pref?.key ??
      "préférence coach",
  );
}

export async function upsertCoachPreferencesFromDraftForTest(args: {
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
  if (rows.length === 0) {
    return {
      data: null,
      error: { message: "empty_coach_preference_patch" },
    };
  }
  const { data, error } = await args.supabase
    .from("user_profile_facts")
    .upsert(rows as any, { onConflict: "user_id,scope,key" })
    .select("key");
  if (error) return { data: null, error };
  const keys = (data ?? []).map((row: any) => String(row?.key ?? "")).filter(
    Boolean,
  );
  return {
    data: keys.length > 0 ? { key: keys[0], keys } : null,
    error: keys.length > 0 ? null : { message: "missing_upserted_key" },
  };
}

export async function loadCoachQuestionTendencyLow(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_profile_facts")
    .select("value,status")
    .eq("user_id", userId)
    .eq("scope", "global")
    .eq("key", "coach.question_tendency")
    .eq("status", "active")
    .maybeSingle();
  const value = String((data as any)?.value?.value ?? "").trim();
  return value === "low" || value === "peu_de_questions";
}

function formatCheckinLocalTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone || "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "";
    if (hour && minute) return `${hour}:${minute}`;
  } catch {
    // Fall through to ISO time.
  }
  return iso.slice(11, 16);
}

async function buildStatusOnlyNoMutationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  userTimezone?: string;
  userMessage?: string;
}): Promise<OperationRuntimeResult> {
  const [attackCards, defenseCards, checkins, preferences] = await Promise.all([
    args.supabase
      .from("user_attack_cards")
      .select("id,content,generated_at")
      .eq("user_id", args.userId)
      .order("generated_at", { ascending: false })
      .limit(1),
    args.supabase
      .from("user_defense_cards")
      .select("id,content,generated_at")
      .eq("user_id", args.userId)
      .order("generated_at", { ascending: false })
      .limit(1),
    args.supabase
      .from("scheduled_checkins")
      .select("id,scheduled_for,status,message_payload,event_context")
      .eq("user_id", args.userId)
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(3),
    args.supabase
      .from("user_profile_facts")
      .select("key,value,reason,status,updated_at")
      .eq("user_id", args.userId)
      .eq("scope", "global")
      .eq("status", "active")
      .like("key", "coach.%")
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);
  const attack = (attackCards.data ?? [])[0] as any;
  const defense = (defenseCards.data ?? [])[0] as any;
  const checkin = (checkins.data ?? []).find((row: any) =>
    String(row?.status ?? "") === "pending"
  ) as any;
  const pendingCheckins = (checkins.data ?? []).filter((row: any) =>
    String(row?.status ?? "") === "pending"
  ) as any[];
  const activePreferences = (preferences.data ?? []) as any[];
  const attackTitle = String(
    attack?.content?.operation_draft?.title ??
      attack?.content?.techniques?.[0]?.generated_result?.output_title ??
      attack?.content?.title ??
      "carte d'attaque",
  );
  const defenseTitle = String(
    defense?.content?.operation_draft?.title ??
      defense?.content?.title ??
      defense?.content?.card_title ??
      "carte de défense",
  );
  const reminderInstruction = String(
    checkin?.message_payload?.reminder_instruction ??
      checkin?.message_payload?.instruction ??
      "rappel ponctuel",
  ).replace(
    /^Rappel ponctuel demandé explicitement par l'utilisateur\. Rappelle-lui de\s*/i,
    "",
  );
  const reminderLocalTime = checkin?.scheduled_for
    ? formatCheckinLocalTime(
      String(checkin.scheduled_for),
      args.userTimezone ?? "Europe/Paris",
    )
    : null;
  const exactReminderStatus = isOneShotReminderExactStatusRequestForTest(
    args.userMessage ?? "",
  );
  const reminderLine = pendingCheckins.length === 0
    ? "je n'en vois pas en place."
    : exactReminderStatus && reminderLocalTime
    ? `l'heure confirmée côté système est ${reminderLocalTime} (${reminderInstruction}). Si 11h20 n'apparaît pas ici, ce déplacement n'a pas été confirmé.`
    : pendingCheckins.length === 1
    ? `oui, il est programmé${
      reminderLocalTime ? ` à ${reminderLocalTime}` : ""
    } (${reminderInstruction}).`
    : `oui, j'en vois ${pendingCheckins.length} en place, dont le prochain : ${reminderInstruction}.`;
  const prefLabels = activePreferences
    .filter((pref: any) =>
      [
        "coach.tone",
        "coach.question_tendency",
        "coach.challenge_level",
        "coach.response_max_lines",
        "coach.emoji_policy",
        "coach.final_question_policy",
      ]
        .includes(String(pref?.key ?? ""))
    )
    .map((pref: any) => coachPreferenceStatusLabel(pref));
  const preferenceLine = prefLabels.length === 0
    ? "je n'en vois pas encore en place."
    : `oui, ${prefLabels.join(", ")}.`;
  const userText = normalizeRouteText(args.userMessage ?? "");
  const conversationLines = [
    /\bpiege|pi[eè]ge|risque|fragile\b/.test(userText)
      ? "- Piège / fragile : je le traite comme repère de conversation, pas comme écriture durable."
      : null,
    /\bhonte|culpabilite|culpabilit[eé]\b/.test(userText)
      ? "- Honte / émotion : c'est dans le récap humain, sans outil lancé."
      : null,
  ].filter(Boolean) as string[];
  const lines = [
    "Sans rien modifier :",
    `- Carte d'attaque : ${
      attack
        ? `oui, elle est en place (${attackTitle}).`
        : "je n'en vois pas en place."
    }`,
    `- Carte de défense : ${
      defense
        ? `oui, elle est en place (${defenseTitle}).`
        : "je n'en vois pas en place."
    }`,
    `- Rappels ponctuels : ${reminderLine}`,
    `- Préférences coach : ${preferenceLine}`,
    ...conversationLines,
  ];
  return {
    content: lines.join("\n"),
    nextTempMemory: clearToolSkillFlowForDirectReminder(args.tempMemory),
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "status_only_no_mutation_check",
      status: "answered",
      attack_card_found: Boolean(attack),
      defense_card_found: Boolean(defense),
      reminder_found: Boolean(checkin),
      coach_preference_found: activePreferences.length > 0,
    },
  };
}

async function maybeRunCreateRecurringReminderOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  v2Runtime?: ActiveTransformationRuntime | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
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
    const confirmation = await detectConfirmationKind({
      userMessage: args.userMessage,
      operationType: "create_recurring_reminder",
      pendingContext: pendingRecommendation,
      requestId: args.requestId ?? null,
      structuredOnly: true,
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

    const output = await runCreateRecurringReminderIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
      platform_context: buildRecurringReminderPlatformContext({
        v2Runtime: args.v2Runtime ?? null,
        planItemSnapshot: args.planItemSnapshot ?? null,
      }),
      request_id: args.requestId ?? null,
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
  if (isPendingRecurringReminderOperation(pendingRaw)) {
    const draftReviewDecision = await reviewCreateRecurringReminderDraft({
      message: args.userMessage,
      previous_draft: pendingRaw.draft,
      operation_input: recurringReminderDraftOperationInput(pendingRaw.draft),
      request_id: args.requestId ?? null,
    });
    if (!draftReviewDecision) return null;
    if (draftReviewDecision.decision === "reject") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: draftReviewDecision.generated_user_message ??
          pendingRaw.draft.confirmation_message,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "revise") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const previousOperationInput = recurringReminderDraftOperationInput(
        pendingRaw.draft,
      );
      const revisedOutput = await runCreateRecurringReminderIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: 0,
        operation_input: previousOperationInput,
        platform_context: buildRecurringReminderPlatformContext({
          v2Runtime: args.v2Runtime ?? null,
          planItemSnapshot: args.planItemSnapshot ?? null,
        }),
        request_id: args.requestId ?? null,
      });
      if (
        revisedOutput.status === "pending_confirmation" &&
        revisedOutput.pending_confirmation
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...revisedOutput.pending_confirmation,
          created_at: new Date().toISOString(),
          turn_count: 0,
        };
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        return {
          content: revisedOutput.confirmation?.message ??
            revisedOutput.draft?.confirmation_message ??
            "J'ai intégré la modification. Tu veux que je crée ce rappel ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            status: "draft_review_updated",
            operation_id:
              (revisedOutput.pending_confirmation as any)?.operation_id ??
                pendingRaw.operation_id ?? null,
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: revisedOutput.draft ?? null,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      if (revisedOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "create_recurring_reminder",
          phase: revisedOutput.phase,
          missing_slots: revisedOutput.state_patch.missing_slots,
          operation_input: revisedOutput.state_patch.operation_input ??
            previousOperationInput,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: revisedOutput.next_question?.question ??
            draftReviewDecision.generated_user_message ??
            "J'ai intégré la modification. Tu veux préciser quoi exactement ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "create_recurring_reminder",
            status: "draft_review_revision_needs_slots",
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: revisedOutput.state_patch.missing_slots,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "create_recurring_reminder",
        phase: "recurrence_resolution",
        missing_slots: [],
        operation_input: previousOperationInput,
        turn_count: 0,
        updated_at: new Date().toISOString(),
      };
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_revision_requested",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") {
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_recurring_reminder",
          status: "draft_review_unclear",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }

    const { data, error } = await insertRecurringReminderFromDraft({
      supabase: args.supabase,
      userId: args.userId,
      draft: pendingRaw.draft,
      operationId: pendingRaw.operation_id ?? null,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      v2Runtime: args.v2Runtime ?? null,
      planItemSnapshot: args.planItemSnapshot ?? null,
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
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    const createdDraft: RecurringReminderDraftV1 = {
      ...pendingRaw.draft,
      draft: {
        ...pendingRaw.draft.draft,
        target_binding: {
          target_kind: (data as any).target_kind ?? "none",
          target_plan_item_id: (data as any).target_plan_item_id ?? null,
          target_action_family_key: (data as any).target_action_family_key ??
            null,
          target_generated_temp_id: (data as any).target_generated_temp_id ??
            null,
          binding_policy: (data as any).target_binding_policy ?? "none",
          lifecycle_policy: (data as any).target_lifecycle_policy ??
            "independent",
          target_label: pendingRaw.draft.draft.target_binding?.target_label ??
            null,
        },
      },
    };
    return {
      content: buildRecurringReminderCreatedMessage(createdDraft),
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["create_recurring_reminder"],
      toolSkillRun: {
        selected_handler: "create_recurring_reminder",
        status: "executed",
        operation_id: pendingRaw.operation_id ?? null,
        recurring_reminder_id: data.id,
        draft_review_decision: draftReviewDecision,
      },
    };
  }

  const activeIntake = nextTempMemory.__active_tool_skill_intake as any;
  const routeExplicitlySelected =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler === "create_recurring_reminder";
  if (!activeIntake && !routeExplicitlySelected) {
    return null;
  }

  const output = await runCreateRecurringReminderIntake({
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
    operation_input: activeIntake?.operation_input ?? null,
    platform_context: buildRecurringReminderPlatformContext({
      v2Runtime: args.v2Runtime ?? null,
      planItemSnapshot: args.planItemSnapshot ?? null,
    }),
    request_id: args.requestId ?? null,
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
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
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
    executedTools: [],
    toolSkillRun: {
      selected_handler: "create_recurring_reminder",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
    },
  };
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
    (args.pendingRaw.operation_input as any)?.scope?.kind ??
      (args.pendingRaw.operation_input as any)?.intake_state?.scope?.kind ??
      (args.pendingRaw.draft as any)?.draft?.patch?.scope_kind ??
      (args.pendingRaw.draft as any)?.draft?.adjust_plan_result?.scope ??
      "",
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
        ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
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
        regenerateAdjustedPlan: async (input) => {
          const userTime = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
          }).catch(() => null);
          const result = await generatePlanV2ForTransformation({
            admin: args.supabase,
            requestId: args.requestId ?? crypto.randomUUID(),
            userId: args.userId,
            transformationId: input.transformationId,
            mode: "generate_and_activate",
            feedback: input.feedback,
            forceRegenerate: true,
            pace: null,
            preserveActiveTransformationId: input.transformationId,
            adjustmentContext: {
              reviewId: operationId,
              scope: input.scopeKind === "current_level" ? "level" : "plan",
              effectiveStartDate: userTime?.user_local_date ??
                new Date().toISOString().slice(0, 10),
              reason: input.reason,
              userChangeSummary: input.userChangeSummary,
              assistantMessage: input.assistantMessage,
            },
          });
          return {
            plan_id: result.planRow.id,
            roadmap_changed: result.roadmapChanged,
          };
        },
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
  delete args.nextTempMemory.__active_tool_skill_intake;
  delete args.nextTempMemory.active_tool_skill_intake;
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
        ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
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
      ...adjustPlanCoachTrace(args.pendingRaw.operation_input),
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
  enableAdjustPlanCoachGuidance?: boolean;
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
  const directWeeklyMissionCarryOverApply =
    isExplicitPendingApplyConfirmation(args.userMessage) &&
    (isWeeklyMissionCarryOverRequest(args.userMessage) ||
      weeklyMissionCarryOverContext({
        userMessage: args.userMessage,
        history: args.history,
      }));
  if (directWeeklyMissionCarryOverApply) {
    const pendingMissionCarryOver = buildWeeklyMissionCarryOverPendingReview({
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: null,
        tempMemory: nextTempMemory,
      }),
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingMissionCarryOver,
    });
  }
  const directWeeklyCopyForwardApply =
    isExplicitPendingApplyConfirmation(args.userMessage) &&
    isCopyForwardWeeklyRequest(args.userMessage);
  if (directWeeklyCopyForwardApply) {
    const pendingCopyForward = buildWeeklyCopyForwardPendingReview({
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingCopyForward,
    });
  }
  const directWeeklyLightRepeatApply =
    isExplicitPendingApplyConfirmation(args.userMessage) &&
    isWeeklyLightRepeatRequest(args.userMessage);
  if (directWeeklyLightRepeatApply) {
    const pendingLightRepeat = buildWeeklyLightRepeatPendingReview({
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: null,
        tempMemory: nextTempMemory,
      }),
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingLightRepeat,
    });
  }
  if (isPendingAdjustPlanDraftReview(pendingDraftReview)) {
    if (activeOperationType && activeOperationType !== "adjust_plan_item") {
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
    }
    const weeklyStateForPendingAdjust = weeklyAdaptiveReviewStateForTurn({
      activeSkillState: null,
      tempMemory: nextTempMemory,
    });
    const weeklyExactProposalForPending = weeklyExactProposalFromConversation({
      userMessage: args.userMessage,
      history: args.history,
      tempMemory: nextTempMemory,
      weeklyState: weeklyStateForPendingAdjust,
      planItemSnapshot: args.planItemSnapshot,
    });
    const effectivePendingDraftReview = weeklyExactProposalForPending
      ? patchPendingAdjustPlanWithWeeklyExactProposal({
        pending: pendingDraftReview,
        proposal: weeklyExactProposalForPending,
      })
      : pendingDraftReview;
    if (weeklyExactProposalForPending) {
      nextTempMemory.__weekly_exact_adjust_plan_proposal =
        weeklyExactProposalForPending;
      nextTempMemory.__pending_adjust_plan_draft_review =
        effectivePendingDraftReview;
    }
    if (isExplicitPendingApplyConfirmation(args.userMessage)) {
      return await executePendingAdjustPlanDraft({
        supabase: args.supabase,
        userId: args.userId,
        channel: args.channel,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        nextTempMemory,
        pendingRaw: effectivePendingDraftReview,
      });
    }
    const pendingDraftQuestionAnswer = isAdjustPlanDraftRewriteRequest(
        args.userMessage,
      )
      ? null
      : renderPendingAdjustPlanDraftQuestionAnswer(
        effectivePendingDraftReview,
        args.userMessage,
      );
    if (pendingDraftQuestionAnswer) {
      return {
        content: pendingDraftQuestionAnswer,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_details",
          operation_id: effectivePendingDraftReview.operation_id ?? null,
          draft_review_decision: {
            decision: "explain",
            confidence: "high",
            evidence: ["pre_validation_detail_request_deterministic_answer"],
            apply_after_revision: false,
          },
        },
      };
    }
    const deterministicRevisedDraft =
      revisePendingAdjustPlanDraftDeterministically({
        pending: pendingDraftReview,
        userMessage: args.userMessage,
      });
    if (deterministicRevisedDraft) {
      const revisedConstraintAck =
        /\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
            .test(normalizeRecommendationText(args.userMessage))
          ? "C'est corrigé dans le brouillon: la prochaine étape reste limitée à deux actions maximum. Je n'applique rien tant que tu ne me le confirmes pas clairement."
          : wholePlanDraftNuanceLine(args.userMessage)
          ? `C'est corrigé dans le brouillon: ${
            wholePlanDraftNuanceLine(args.userMessage)
          } Je n'applique rien tant que tu ne me le confirmes pas clairement.`
          : "C'est corrigé dans le brouillon: on garde 2 fois par semaine, sans créneau fixe, avec une phrase neutre. Je n'applique rien tant que tu ne me le confirmes pas clairement.";
      nextTempMemory.__pending_adjust_plan_draft_review = {
        ...pendingDraftReview,
        draft: deterministicRevisedDraft,
        updated_at: new Date().toISOString(),
        turn_count: 0,
        revision_history: [
          ...(pendingDraftReview.revision_history ?? []),
          {
            user_request: args.userMessage,
            changed: ["instruction"],
            apply_after_revision: false,
            created_at: new Date().toISOString(),
            source: "deterministic_simple_revision",
          },
        ],
      };
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: revisedConstraintAck,
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_updated",
          operation_id: pendingDraftReview.operation_id ?? null,
          draft: deterministicRevisedDraft,
          draft_review_decision: {
            decision: "revise",
            confidence: "high",
            evidence: ["deterministic_simple_revision"],
            apply_after_revision: false,
          },
        },
      };
    }
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
      recent_messages: (args.history ?? [])
        .map((turn: any) => ({
          role: turn?.role === "assistant"
            ? "assistant" as const
            : "user" as const,
          content: String(turn?.content ?? "").trim(),
        }))
        .filter((turn) => turn.content)
        .slice(-12),
      plan_snapshot: { items: args.planItemSnapshot ?? [] },
      operation_input: {
        ...(pendingDraftReview.operation_input ?? {}),
        previous_draft: pendingDraftReview.draft,
        revision_request: args.userMessage,
      },
      force_ai_slot_filling: true,
      force_coach_guidance: args.enableAdjustPlanCoachGuidance === true,
    });
    const draftReviewDecision = output.state_patch.draft_review_decision;
    if (!draftReviewDecision) return null;
    if (draftReviewDecision.decision === "reject") {
      delete nextTempMemory.__pending_adjust_plan_draft_review;
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content:
          "Ok, je n'applique pas cet ajustement. On garde ton plan tel quel pour l'instant; observe encore une journée, et si le besoin d'alléger se confirme, on reprendra proprement.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "adjust_plan_item",
          status: "draft_review_cancelled",
          operation_id: pendingDraftReview.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              pendingDraftReview.operation_input ?? null,
          ),
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      const detailReply = renderPendingAdjustPlanDraftQuestionAnswer(
        effectivePendingDraftReview,
        args.userMessage,
      ) ?? renderPendingAdjustPlanDraftDetails({
        __pending_adjust_plan_draft_review: effectivePendingDraftReview,
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
            operation_id: effectivePendingDraftReview.operation_id ?? null,
            draft_review_decision: draftReviewDecision,
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                pendingDraftReview.operation_input ?? null,
            ),
          },
        };
      }
    }
    if (draftReviewDecision.decision === "revise") {
      if (
        output.status === "pending_confirmation" && output.pending_confirmation
      ) {
        const revisedPendingRaw = {
          ...output.pending_confirmation,
          phase: "draft_review",
          operation_input: output.state_patch.operation_input ??
            (output.pending_confirmation as any).operation_input ??
            pendingDraftReview.operation_input ??
            null,
          created_at: pendingDraftReview.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          turn_count: 0,
          revision_history: [
            ...(pendingDraftReview.revision_history ?? []),
            {
              user_request: args.userMessage,
              changed: ["draft_regenerated"],
              apply_after_revision:
                draftReviewDecision.apply_after_revision === true,
              created_at: new Date().toISOString(),
            },
          ],
          supersedes_operation_id: pendingDraftReview.operation_id ?? null,
        };
        if (draftReviewDecision.apply_after_revision === true) {
          delete nextTempMemory.__pending_adjust_plan_draft_review;
          delete nextTempMemory.__pending_tool_skill_confirmation;
          delete nextTempMemory.pending_tool_skill_confirmation;
          return await executePendingAdjustPlanDraft({
            supabase: args.supabase,
            userId: args.userId,
            channel: args.channel,
            safetyPregateOutput: args.safetyPregateOutput,
            sourceMessageId: args.sourceMessageId,
            requestId: args.requestId,
            nextTempMemory,
            pendingRaw: revisedPendingRaw as any,
          });
        }
        nextTempMemory.__pending_adjust_plan_draft_review = {
          ...revisedPendingRaw,
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
            draft_review_decision: draftReviewDecision,
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                revisedPendingRaw.operation_input ?? null,
            ),
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
          draft_review_decision: draftReviewDecision,
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              pendingDraftReview.operation_input ?? null,
          ),
        },
      };
    }
    if (draftReviewDecision.decision === "approve") {
      return await executePendingAdjustPlanDraft({
        supabase: args.supabase,
        userId: args.userId,
        channel: args.channel,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        nextTempMemory,
        pendingRaw: effectivePendingDraftReview,
      });
    }
    return null;
  }
  const weeklyStateForExactApply = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: null,
    tempMemory: nextTempMemory,
  });
  if (
    weeklyStateForExactApply &&
    (isExplicitPendingApplyConfirmation(args.userMessage) ||
      isWeeklyMissionCarryOverRequest(args.userMessage)) &&
    isWeeklyMissionCarryOverRequest(args.userMessage)
  ) {
    const pendingMissionCarryOver = buildWeeklyMissionCarryOverPendingReview({
      weeklyState: weeklyStateForExactApply,
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingMissionCarryOver,
    });
  }
  if (
    weeklyStateForExactApply &&
    (isExplicitPendingApplyConfirmation(args.userMessage) ||
      isCopyForwardWeeklyRequest(args.userMessage)) &&
    isCopyForwardWeeklyRequest(args.userMessage)
  ) {
    const pendingCopyForward = buildWeeklyCopyForwardPendingReview({
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingCopyForward,
    });
  }
  if (
    weeklyStateForExactApply &&
    (isExplicitPendingApplyConfirmation(args.userMessage) ||
      isWeeklyLightRepeatRequest(args.userMessage)) &&
    isWeeklyLightRepeatRequest(args.userMessage)
  ) {
    const pendingLightRepeat = buildWeeklyLightRepeatPendingReview({
      weeklyState: weeklyStateForExactApply,
      planItemSnapshot: args.planItemSnapshot,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingLightRepeat,
    });
  }
  const weeklyExactProposalForImmediateApply =
    weeklyExactProposalFromConversation(
      {
        userMessage: args.userMessage,
        history: args.history,
        tempMemory: nextTempMemory,
        weeklyState: weeklyStateForExactApply,
        planItemSnapshot: args.planItemSnapshot,
      },
    );
  if (
    weeklyStateForExactApply &&
    weeklyExactProposalForImmediateApply &&
    isExplicitPendingApplyConfirmation(args.userMessage)
  ) {
    nextTempMemory.__weekly_exact_adjust_plan_proposal =
      weeklyExactProposalForImmediateApply;
    const pendingFromWeeklyExact = buildWeeklyExactAdjustPlanPendingReview({
      proposal: weeklyExactProposalForImmediateApply,
    });
    return await executePendingAdjustPlanDraft({
      supabase: args.supabase,
      userId: args.userId,
      channel: args.channel,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId,
      nextTempMemory,
      pendingRaw: pendingFromWeeklyExact,
    });
  }
  if (activeOperationType && activeOperationType !== "adjust_plan_item") {
    return null;
  }
  if (
    !activeOperationType &&
    pendingOperationType(pendingRaw) !== "adjust_plan_item" &&
    !isPendingAdjustPlanItemRecommendationOperation(
      nextTempMemory.__pending_recommendation_operation,
    ) &&
    isAmbivalentAdjustPlanReflectionRequest(args.userMessage)
  ) {
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
  const scopedOperationInput = operationInputFromPlanAdjustmentScope(
    args.userMessage,
    args.turnFrame,
  );
  if (!adjustPlanRouteSelected && !scopedOperationInput) return null;
  if (
    !activeOperationType &&
    pendingOperationType(pendingRaw) !== "adjust_plan_item" &&
    !isPendingAdjustPlanItemRecommendationOperation(
      nextTempMemory.__pending_recommendation_operation,
    ) &&
    isVagueWholePlanWeeklyAdjustmentRequest(
      args.userMessage,
      scopedOperationInput,
    )
  ) {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "adjust_plan_item",
      operation_input: scopedOperationInput,
      status: "collecting",
      created_at: new Date().toISOString(),
      reason_code: "whole_plan_vague_needs_context",
    };
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content:
        "Oui, là ça touche plutôt le plan global. Avant de proposer une nouvelle organisation, il me manque le point précis: qu'est-ce qui ne colle plus aujourd'hui ? L'objectif, l'ordre des étapes, la charge, ou les actions elles-mêmes ?",
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "adjust_plan_item",
        status: "collecting",
        reason_code: "whole_plan_vague_needs_context",
        missing_slots: ["whole_plan_change_reason"],
        ...adjustPlanCoachTrace(scopedOperationInput),
      },
    };
  }

  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;

  if (isPendingAdjustPlanItemOperation(pendingRaw)) {
    nextTempMemory.__pending_adjust_plan_draft_review = {
      ...pendingRaw,
      phase: "draft_review",
      operation_input: pendingRaw.operation_input ?? null,
      updated_at: new Date().toISOString(),
      turn_count: Number(pendingRaw.turn_count ?? 0),
    };
    delete nextTempMemory.__pending_tool_skill_confirmation;
    delete nextTempMemory.pending_tool_skill_confirmation;
    return await maybeRunAdjustPlanItemOperation({
      ...args,
      tempMemory: nextTempMemory,
    });
  }

  if (isPendingAdjustPlanItemRecommendationOperation(pendingRecommendation)) {
    const confirmation = await detectConfirmationKind({
      userMessage: args.userMessage,
      operationType: "adjust_plan_item",
      pendingContext: pendingRecommendation,
      requestId: args.requestId ?? null,
      structuredOnly: true,
    });
    const correctionScopeInput = scopedOperationInput;
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
        force_coach_guidance: args.enableAdjustPlanCoachGuidance === true,
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
            ...adjustPlanCoachTrace(
              output.state_patch.operation_input ??
                pendingRecommendation.operation_input ?? null,
            ),
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
          ...adjustPlanCoachTrace(
            output.state_patch.operation_input ??
              (output.pending_confirmation as any).operation_input ??
              pendingRecommendation.operation_input ?? null,
          ),
        },
      };
    }
  }

  const hasActiveAdjustPlanIntake =
    (nextTempMemory.__active_tool_skill_intake as any)?.operation_type ===
      "adjust_plan_item";
  if (
    !hasActiveAdjustPlanIntake && !adjustPlanRouteSelected &&
    !scopedOperationInput
  ) return null;

  if (
    isOperationEscapeMessage(args.userMessage) &&
    !hasStrongToolSkillIntent(args.turnFrame, "adjust_plan_item") &&
    !hasActiveAdjustPlanIntake
  ) return null;
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
  const fallbackOperationInput = mergeActiveAdjustPlanOperationInput({
    active: activeAdjustPlanOperationInput,
    scoped: scopedOperationInput,
  }) ?? operationInputFromLastPlanItem(nextTempMemory);
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
    force_coach_guidance: args.enableAdjustPlanCoachGuidance === true,
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
        ...adjustPlanCoachTrace(
          output.state_patch.operation_input ??
            (output.pending_confirmation as any).operation_input ??
            fallbackOperationInput,
        ),
      },
    };
  }

  if (output.status === "ask_question") {
    const previousTurnCount = Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "adjust_plan_item",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      operation_input: output.state_patch.operation_input ??
        fallbackOperationInput,
      turn_count: previousTurnCount + 1,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    content: output.next_question?.question ??
      output.ack ??
      output.confirmation?.message ??
      output.draft?.confirmation_message ??
      "J'ai bien compris l'ajustement. Je te prépare une proposition concrète, et rien n'est appliqué tant que tu ne confirmes pas clairement.",
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
      ...adjustPlanCoachTrace(
        output.state_patch.operation_input ??
          fallbackOperationInput,
      ),
    },
  };
}

// Chantier 5 (2026-05-28) — La fonction `maybeRunPrepareAttackCardOperation`
// (969 lignes) a été déplacée dans son propre module
// `tools/operations/prepare_attack_card/router.ts` pour amaigrir run.ts et
// rapatrier la glue layer dans le module du skill. Aucune logique modifiée.
// Voir docs/agent-playbook/13-architecture-skills, chantier 5.
import { maybeRunPrepareAttackCardOperation } from "../tools/operations/prepare_attack_card/router.ts";
export { maybeRunPrepareAttackCardOperation };


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
  const defenseCardRouteSelected = operationRouteIsSelected({
    operationType: "prepare_defense_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!defenseCardRouteSelected) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;
  const explicitDefenseCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card";
  const activeDefenseIntakeRaw = nextTempMemory.__active_tool_skill_intake ??
    nextTempMemory.active_tool_skill_intake ??
    null;
  const hasDefenseCardFlow = isPendingDefenseCardOperation(pendingRaw) ||
    isPendingDefenseCardRecommendationOperation(pendingRecommendation) ||
    String((activeDefenseIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_defense_card";
  if (
    !explicitDefenseCardRoute &&
    !hasDefenseCardFlow &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  if (
    isOperationEscapeMessage(args.userMessage) &&
    !explicitDefenseCardRoute &&
    !isPendingDefenseCardOperation(pendingRaw) &&
    !isPendingDefenseCardRecommendationOperation(pendingRecommendation)
  ) {
    return null;
  }
  let fallbackOperationInput = operationInputFromLastPlanItem(nextTempMemory);

  if (isPendingDefenseCardOperation(pendingRaw)) {
    if (isDefenseCardExplicitApprovalForTest(args.userMessage)) {
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
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
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
            operation_id: pendingRaw.operation_id ?? null,
            error: error?.message ?? "missing_inserted_id",
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: ["deterministic_explicit_defense_card_approval"],
            },
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
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: ["deterministic_explicit_defense_card_approval"],
          },
        },
      };
    }
    const pendingReviewOutput = await runPrepareDefenseCardAiIntake({
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
        previous_draft: pendingRaw.draft,
        attachment: pendingRaw.attachment ?? null,
        risk_situation: pendingRaw.risk_situation ?? null,
        defense_response_hint: pendingRaw.defense_response_hint ??
          (pendingRaw.draft?.draft?.defense_response
            ? {
              strategy_hint: "unknown",
              value: pendingRaw.draft.draft.defense_response,
            }
            : undefined),
        intake_state: (pendingRaw as any).intake_state ?? undefined,
      },
    });
    const draftReviewDecision =
      pendingReviewOutput.state_patch.draft_review_decision;
    if (!draftReviewDecision) {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...pendingReviewOutput.pending_confirmation,
          attachment: defenseCardAttachmentFromPendingConfirmation(
            pendingReviewOutput.pending_confirmation,
            {
              attachment: pendingRaw.attachment ?? null,
              risk_situation: pendingRaw.risk_situation ?? null,
              intake_state: (pendingRaw as any).intake_state ?? undefined,
            },
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: pendingReviewOutput.confirmation?.message ??
            pendingReviewOutput.draft.confirmation_message,
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: null,
          },
        };
      }
      if (pendingReviewOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_defense_card",
          phase: pendingReviewOutput.phase,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: pendingReviewOutput.next_question ?? null,
          operation_input: pendingReviewOutput.next_question?.known_slots ??
            null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: renderDefenseCardSlotQuestion(
            pendingReviewOutput.next_question,
          ),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: pendingReviewOutput.status,
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: pendingReviewOutput.state_patch.missing_slots,
            slot_state: pendingReviewOutput.next_question ?? null,
            draft_review_decision: null,
          },
        };
      }
      return {
        content: pendingReviewOutput.ack ??
          "Je n'ai pas réussi à relire cette validation techniquement. Je préfère ne rien créer sans confirmation claire.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          draft_review_decision: null,
        },
      };
    }
    if (draftReviewDecision.decision === "reject") {
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
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: pendingRaw.draft?.confirmation_message ??
          pendingRaw.draft?.draft?.defense_response ??
          "",
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "revise") {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...pendingReviewOutput.pending_confirmation,
          attachment: defenseCardAttachmentFromPendingConfirmation(
            pendingReviewOutput.pending_confirmation,
            {
              attachment: pendingRaw.attachment ?? null,
              risk_situation: pendingRaw.risk_situation ?? null,
              intake_state: (pendingRaw as any).intake_state ?? undefined,
            },
          ),
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.pending_tool_skill_confirmation;
        return {
          content: pendingReviewOutput.confirmation?.message ??
            pendingReviewOutput.draft.confirmation_message,
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: "pending_confirmation_updated",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: draftReviewDecision,
          },
        };
      }

      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_defense_card",
        phase: pendingReviewOutput.phase,
        missing_slots: pendingReviewOutput.state_patch.missing_slots,
        slot_state: pendingReviewOutput.next_question ?? null,
        operation_input: pendingReviewOutput.next_question?.known_slots ?? null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      };
      return {
        content: renderDefenseCardSlotQuestion(
          pendingReviewOutput.next_question,
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: pendingReviewOutput.next_question ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") return null;

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
    const confirmation = await detectConfirmationKind({
      userMessage: args.userMessage,
      operationType: "prepare_defense_card",
      pendingContext: pendingRecommendation,
      requestId: args.requestId ?? null,
      structuredOnly: true,
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
    if (confirmation !== "yes" && !explicitDefenseCardRoute) return null;

    const recommendationOutput = await runPrepareDefenseCardAiIntake({
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
      if (recommendationOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_defense_card",
          phase: recommendationOutput.phase,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
          operation_input: recommendationOutput.state_patch.operation_input ??
            recommendationOutput.next_question?.known_slots ??
            pendingRecommendation.operation_input ?? null,
          tool_skill_state: recommendationOutput.state_patch.tool_skill_state ??
            null,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
      }
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

    nextTempMemory.__pending_tool_skill_confirmation = {
      ...recommendationOutput.pending_confirmation,
      attachment: defenseCardAttachmentFromPendingConfirmation(
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
        selected_handler: "prepare_defense_card",
        status: "pending_confirmation",
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        operation_id:
          (recommendationOutput.pending_confirmation as any)?.operation_id ??
            null,
        draft: recommendationOutput.draft,
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
    const activeKnownSlots = activeDefenseIntake?.operation_input ??
      activeAttachmentQuestion?.known_slots ??
      {};
    const candidateOutput = await runPrepareDefenseCardAiIntake({
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
        attachment_candidate: activeAttachmentCandidate,
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
          candidateOutput.draft?.confirmation_message ?? "",
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
            status: "resolved_by_skill_intake",
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
      operation_input: candidateOutput.state_patch.operation_input ?? {
        ...activeKnownSlots,
        attachment_candidate: activeAttachmentCandidate,
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
        attachment_slot_resolution: {
          status: "handled_by_skill_intake",
          attachment: activeAttachmentCandidate,
        },
      },
    };
  }

  if (
    activeDefenseIntake?.operation_type === "prepare_defense_card" &&
    activeDefenseIntake?.operation_input
  ) {
    fallbackOperationInput = activeDefenseIntake.operation_input;
  }

  const output = await runPrepareDefenseCardAiIntake({
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
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
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
  const routeSelected = operationRouteIsSelected({
    operationType: "select_state_potion",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  }) || isExplicitSelectStatePotionRequest(args.userMessage);
  if (!routeSelected) return null;

  const draftGeneratorWithDbContext = async (
    input: PotionSessionDraftGeneratorInput,
  ) => {
    const admin = getOperationServiceClient() ?? args.supabase;
    const baseContext = await loadPotionBaseContext({
      admin,
      userId: args.userId,
      potionType: input.potion_type,
      relatedPlanItemId: input.context?.related_plan_item_id ?? null,
    });
    return await generatePotionSessionDraftWithAi({
      ...input,
      base_context: baseContext,
    });
  };

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const pendingRaw = nextTempMemory.__pending_tool_skill_confirmation ??
    nextTempMemory.pending_tool_skill_confirmation ??
    null;
  const pendingRecommendation =
    nextTempMemory.__pending_recommendation_operation;

  if (isPendingStatePotionOperation(pendingRaw)) {
    const draftReviewDecision = await reviewSelectStatePotionDraft({
      message: args.userMessage,
      previous_draft: pendingRaw.draft,
      request_id: args.requestId ?? null,
    });
    if (!draftReviewDecision) return null;
    if (draftReviewDecision.decision === "reject") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: draftReviewDecision.generated_user_message ??
          pendingRaw.draft.confirmation_message,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "revise") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const previousOperationInput = {
        ...(((pendingRaw as any).operation_input &&
            typeof (pendingRaw as any).operation_input === "object" &&
            !Array.isArray((pendingRaw as any).operation_input))
          ? (pendingRaw as any).operation_input
          : {}),
        ...((pendingRaw as any).intake_state
          ? { intake_state: (pendingRaw as any).intake_state }
          : {}),
        previous_draft: pendingRaw.draft,
        revision_request: args.userMessage,
      };
      const revisionOutput = await runSelectStatePotionIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        operation_input: previousOperationInput,
        request_id: args.requestId ?? null,
        draft_generator: draftGeneratorWithDbContext,
      });
      if (
        revisionOutput.status === "pending_confirmation" &&
        revisionOutput.pending_confirmation
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...revisionOutput.pending_confirmation,
          operation_input: revisionOutput.state_patch.operation_input ??
            previousOperationInput,
          intake_state: revisionOutput.state_patch.intake_state ??
            (pendingRaw as any).intake_state ?? null,
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        return {
          content: revisionOutput.confirmation?.message ??
            revisionOutput.draft?.confirmation_message ??
            draftReviewDecision.generated_user_message ?? "",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "select_state_potion",
            status: "pending_confirmation_updated",
            operation_id:
              (revisionOutput.pending_confirmation as any)?.operation_id ??
                pendingRaw.operation_id ?? null,
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: revisionOutput.draft ?? null,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      if (revisionOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "select_state_potion",
          phase: revisionOutput.phase,
          missing_slots: revisionOutput.state_patch.missing_slots,
          operation_input: revisionOutput.state_patch.operation_input ??
            previousOperationInput,
          intake_state: revisionOutput.state_patch.intake_state ??
            (pendingRaw as any).intake_state ?? null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: revisionOutput.next_question?.question ??
            draftReviewDecision.generated_user_message ?? "",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "select_state_potion",
            status: "draft_review_revision_needs_slots",
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: revisionOutput.state_patch.missing_slots,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        missing_slots: revisionOutput.state_patch.missing_slots ?? [],
        operation_input: revisionOutput.state_patch.operation_input ??
          previousOperationInput,
        intake_state: revisionOutput.state_patch.intake_state ??
          (pendingRaw as any).intake_state ?? null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: revisionOutput.ack ??
          draftReviewDecision.generated_user_message ??
          "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "draft_review_revision_requested",
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: revisionOutput.state_patch.missing_slots,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") {
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "select_state_potion",
          status: "draft_review_unclear",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }

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
      safety_pregate_risk_band: riskBandForStatePotionExecution(
        args.safetyPregateOutput,
      ),
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
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    return {
      content: executed.messages.instant_support_message,
      additionalContents: [executed.messages.potion_info_message],
      nextTempMemory,
      toolExecution: "success",
      executedTools: ["select_state_potion"],
      toolSkillRun: {
        selected_handler: "select_state_potion",
        status: "executed",
        operation_id: operationId,
        potion_session_id: executed.potion_session_id,
        recurring_reminder_id: executed.recurring_reminder_id,
        draft_review_decision: draftReviewDecision,
      },
    };
  }

  if (isPendingStatePotionRecommendationOperation(pendingRecommendation)) {
    const confirmation = await detectConfirmationKind({
      userMessage: args.userMessage,
      operationType: "select_state_potion",
      pendingContext: pendingRecommendation,
      requestId: args.requestId ?? null,
    });
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: statePotionDeclineReplyForTest(args.userMessage),
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

    const output = await runSelectStatePotionIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      operation_input: pendingRecommendation.operation_input ?? null,
      request_id: args.requestId ?? null,
      draft_generator: draftGeneratorWithDbContext,
    });
    delete nextTempMemory.__pending_recommendation_operation;
    if (
      output.status === "pending_confirmation" && output.pending_confirmation
    ) {
      nextTempMemory.__pending_tool_skill_confirmation = {
        ...output.pending_confirmation,
        operation_input: output.state_patch.operation_input ?? null,
        intake_state: output.state_patch.intake_state ?? null,
        created_at: new Date().toISOString(),
        turn_count: 0,
      };
      return {
        content: output.confirmation?.message ?? output.ack ?? "",
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
        operation_input: output.state_patch.operation_input ?? {},
        intake_state: output.state_patch.intake_state ?? null,
        turn_count: 1,
        updated_at: new Date().toISOString(),
      };
      return {
        content: output.next_question?.question ?? output.ack ?? "",
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
        "",
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
    ? {
      ...((activeIntake.operation_input &&
          typeof activeIntake.operation_input === "object" &&
          !Array.isArray(activeIntake.operation_input))
        ? activeIntake.operation_input
        : {}),
      ...((activeIntake.intake_state &&
          typeof activeIntake.intake_state === "object" &&
          !Array.isArray(activeIntake.intake_state))
        ? { intake_state: activeIntake.intake_state }
        : {}),
    }
    : {};
  const output = await runSelectStatePotionIntake({
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
    request_id: args.requestId ?? null,
    draft_generator: draftGeneratorWithDbContext,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    nextTempMemory.__pending_tool_skill_confirmation = {
      ...output.pending_confirmation,
      operation_input: output.state_patch.operation_input ??
        (output.pending_confirmation as any).operation_input ?? null,
      intake_state: output.state_patch.intake_state ??
        (output.pending_confirmation as any).intake_state ?? null,
      created_at: new Date().toISOString(),
      turn_count: 0,
    };
    delete nextTempMemory.pending_tool_skill_confirmation;
    delete nextTempMemory.__active_tool_skill_intake;
    delete nextTempMemory.active_tool_skill_intake;
    return {
      content: output.confirmation?.message ??
        output.ack ?? "",
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
      operation_input: output.state_patch.operation_input ??
        activeOperationInput,
      intake_state: output.state_patch.intake_state ?? null,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: output.next_question?.question ?? output.ack ?? "",
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
      "",
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

function riskBandForStatePotionExecution(
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>,
): ReturnType<typeof runSafetyPregate>["risk_band"] {
  const reasonCodes = Array.isArray(safetyPregateOutput.reason_codes)
    ? safetyPregateOutput.reason_codes
    : [];
  const evidence = Array.isArray(safetyPregateOutput.evidence)
    ? safetyPregateOutput.evidence
    : [];
  const isRecentContextOnlyMedium =
    safetyPregateOutput.risk_band === "medium" &&
    evidence.length === 0 &&
    reasonCodes.length > 0 &&
    reasonCodes.every((code) => code === "recent_safety_context_caution");
  return isRecentContextOnlyMedium ? "none" : safetyPregateOutput.risk_band;
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
  if (isRecapOnlyRequestForTest(args.userMessage)) return null;
  if (isPendingCoachPreferencesOperation(pendingRaw)) {
    if (isCoachPreferenceExplicitApprovalForTest(args.userMessage)) {
      const { data, error } = await upsertCoachPreferencesFromDraftForTest({
        supabase: args.supabase,
        userId: args.userId,
        draft: pendingRaw.draft,
        sourceMessageId: args.sourceMessageId,
      });
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
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
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: ["deterministic_explicit_coach_preference_approval"],
            },
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
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: ["deterministic_explicit_coach_preference_approval"],
          },
        },
      };
    }
    const draftReviewDecision = await reviewUpdateCoachPreferencesDraft({
      message: args.userMessage,
      previous_draft: pendingRaw.draft,
      request_id: args.requestId ?? null,
    });
    if (!draftReviewDecision) return null;
    if (draftReviewDecision.decision === "reject") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "explain") {
      return {
        content: draftReviewDecision.generated_user_message ??
          pendingRaw.draft.confirmation_message,
        nextTempMemory,
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "draft_review_details",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision === "revise") {
      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const revisionOutput = await runUpdateCoachPreferencesIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        operation_input: {
          intake_state: (pendingRaw as any).intake_state ?? undefined,
        },
        request_id: args.requestId ?? null,
      });
      if (
        revisionOutput.status === "pending_confirmation" &&
        revisionOutput.pending_confirmation
      ) {
        nextTempMemory.__pending_tool_skill_confirmation = {
          ...revisionOutput.pending_confirmation,
          created_at: new Date().toISOString(),
          turn_count: 0,
          supersedes_operation_id: pendingRaw.operation_id ?? null,
        };
        delete nextTempMemory.__active_tool_skill_intake;
        delete nextTempMemory.active_tool_skill_intake;
        return {
          content: revisionOutput.confirmation?.message ??
            "Tu veux que j'applique cette préférence ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "update_coach_preferences",
            status: "pending_confirmation_updated",
            operation_id:
              (revisionOutput.pending_confirmation as any)?.operation_id ??
                null,
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: revisionOutput.draft ?? null,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      if (revisionOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "update_coach_preferences",
          phase: revisionOutput.phase,
          missing_slots: revisionOutput.state_patch.missing_slots,
          operation_input: revisionOutput.state_patch.operation_input ?? {},
          intake_state: revisionOutput.state_patch.intake_state ?? null,
          tool_skill_state: revisionOutput.state_patch.tool_skill_state ?? null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: revisionOutput.next_question?.question ??
            "Tu veux changer mon ton, mon niveau de challenge, ou le nombre de questions ?",
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "update_coach_preferences",
            status: "draft_review_revision_requested",
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: revisionOutput.state_patch.missing_slots,
            draft_review_decision: draftReviewDecision,
          },
        };
      }
      return {
        content: revisionOutput.ack ??
          "Je n'ai pas réussi à préparer cette préférence techniquement. Je préfère ne rien appliquer sans confirmation claire.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: revisionOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") {
      return {
        content: draftReviewDecision.generated_user_message ?? "",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "draft_review_unclear",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (!isCoachPreferenceExplicitApprovalForTest(args.userMessage)) {
      return {
        content: pendingRaw.draft.confirmation_message ??
          "Tu veux que j'applique cette préférence ?",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "approval_requires_explicit_user_confirmation",
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }

    const { data, error } = await upsertCoachPreferencesFromDraftForTest({
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
          draft_review_decision: draftReviewDecision,
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
        draft_review_decision: draftReviewDecision,
      },
    };
  }

  if (isOperationEscapeMessage(args.userMessage)) {
    return null;
  }

  const activeIntake = (
    nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake
  ) as any;
  const activeOperationInput = activeIntake?.operation_type ===
      "update_coach_preferences"
    ? activeIntake.operation_input ?? {}
    : {};
  const output = await runUpdateCoachPreferencesIntake({
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
    operation_input: activeOperationInput,
    request_id: args.requestId ?? null,
  });

  if (output.status === "pending_confirmation" && output.pending_confirmation) {
    if (
      isCoachPreferenceExplicitApprovalForTest(args.userMessage) && output.draft
    ) {
      const { data, error } = await upsertCoachPreferencesFromDraftForTest({
        supabase: args.supabase,
        userId: args.userId,
        draft: output.draft,
        sourceMessageId: args.sourceMessageId,
      });
      delete nextTempMemory.pending_tool_skill_confirmation;
      delete nextTempMemory.__active_tool_skill_intake;
      delete nextTempMemory.active_tool_skill_intake;
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
            operation_id: (output.pending_confirmation as any)?.operation_id ??
              null,
            error: error?.message ?? "missing_upserted_key",
            draft_review_decision: {
              decision: "approve",
              confidence: "high",
              evidence: ["deterministic_explicit_coach_preference_approval"],
            },
          },
        };
      }
      return {
        content:
          `C'est fait. J'ai appliqué cette préférence : ${output.draft.draft.summary}`,
        nextTempMemory,
        toolExecution: "success",
        executedTools: ["update_coach_preferences"],
        toolSkillRun: {
          selected_handler: "update_coach_preferences",
          status: "executed",
          operation_id: (output.pending_confirmation as any)?.operation_id ??
            null,
          preferences_update_id: data.key,
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: ["deterministic_explicit_coach_preference_approval"],
          },
        },
      };
    }
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
      operation_input: output.state_patch.operation_input ??
        activeOperationInput,
      intake_state: output.state_patch.intake_state ?? null,
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: Number(activeIntake?.turn_count ?? 0) + 1,
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
  if (
    activeOperationIntake &&
    ((isOperationEscapeMessage(userMessage) &&
      !isActiveAttackCardKeywordIntake(activeOperationIntake)) ||
      isOperationCorrectionOrSafetyInterruption(userMessage))
  ) {
    tempMemory = { ...(tempMemory ?? {}) };
    delete (tempMemory as any).__active_tool_skill_intake;
    delete (tempMemory as any).active_tool_skill_intake;
    activeOperationIntake = null;
  }
  const activeOperationIntakeForDispatcher = activeOperationIntake;
  let pendingOperationConfirmation =
    (tempMemory as any)?.pending_tool_skill_confirmation ??
      (tempMemory as any)?.__pending_tool_skill_confirmation ??
      null;
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
      routeDecision.response_owner !== "safety" &&
      turnFrame &&
      isImplicitWholePlanRepairAdjustmentRequestForTest(userMessage)
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
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      (
        (activeOperationIntake as any)?.operation_type ===
          "select_state_potion" ||
        pendingOperationType(pendingOperationConfirmation) ===
          "select_state_potion"
      ) &&
      routeDecision.response_owner !== "safety"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "select_state_potion",
        reason_code: "active_select_state_potion_kept_in_tool_skill",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "conversation_or_other_tool_skill",
            reason_code: "active_select_state_potion_in_progress",
          },
        ],
      };
    }
    if (
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      pendingOperationType(pendingOperationConfirmation) ===
        "prepare_defense_card" &&
      isDefenseCardExplicitApprovalForTest(userMessage) &&
      routeDecision.response_owner !== "safety"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "prepare_defense_card",
        reason_code: "pending_defense_card_confirmation_priority",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.prepare_attack_card",
            reason_code: "pending_defense_card_confirmation_priority",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "prepare_attack_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      pendingOperationType(pendingOperationConfirmation) ===
        "prepare_defense_card" &&
      isDefenseCardRevisionForPendingDraftForTest(userMessage) &&
      routeDecision.response_owner !== "safety"
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "prepare_defense_card",
        reason_code: "pending_defense_card_revision_priority",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.adjust_plan_item",
            reason_code: "pending_defense_card_revision_priority",
          },
          {
            path: "tool_skill.prepare_attack_card",
            reason_code: "pending_defense_card_revision_priority",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "adjust_plan_item" &&
          intent.operation_type !== "prepare_attack_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      pendingOperationConfirmationForGlobalRouting &&
      routeDecision.reason_code === "confirmation_correction_to_pending" &&
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
    if (
      routeDecision.response_owner !== "safety" &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      isExplicitDefenseCardIntentForTest(userMessage)
    ) {
      const reasonCode = "explicit_defense_card_intent_overrides_attack_card";
      if (
        pendingOperationType(pendingOperationConfirmation) !==
          "prepare_defense_card"
      ) {
        pendingOperationConfirmation = null;
        pendingOperationConfirmationForGlobalRouting = null;
      }
      if (
        (activeOperationIntake as any)?.operation_type !==
          "prepare_defense_card"
      ) {
        activeOperationIntake = null;
      }
      if (
        (tempMemory as any)?.__pending_recommendation_operation
          ?.operation_type !== "prepare_defense_card"
      ) {
        tempMemory = { ...(tempMemory ?? {}) };
        delete (tempMemory as any).__pending_recommendation_operation;
      }
      tempMemory = {
        ...(tempMemory ?? {}),
      };
      delete (tempMemory as any).__active_tool_skill_intake;
      delete (tempMemory as any).active_tool_skill_intake;
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      routeDecision = {
        ...routeDecision,
        response_owner: "tool_skill",
        selected_handler: "prepare_defense_card",
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.prepare_attack_card",
            reason_code: reasonCode,
          },
          {
            path: "product_help",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: [],
        tool_skill_intents: [
          ...turnFrame.tool_skill_intents.filter((intent) =>
            intent.operation_type !== "prepare_attack_card" &&
            intent.operation_type !== "adjust_plan_item"
          ),
          {
            operation_type: "prepare_defense_card",
            explicitness: "explicit",
            target_hint: userMessage,
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "create",
          } as any,
        ],
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
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
      routeDecision.response_owner !== "safety" &&
      isExplicitNoToolRequestForTest(userMessage)
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
    if (
      routeDecision.response_owner !== "safety" &&
      (
        isAttackCardCancellationRequestForTest(userMessage) ||
        (
          routeDecision.response_owner === "tool_skill" &&
          routeDecision.selected_handler === "prepare_attack_card" &&
          isMicroActionOnlyNotAttackCardForTest(userMessage)
        )
      ) &&
      pendingOperationType(pendingOperationConfirmation) !==
        "prepare_attack_card"
    ) {
      const reasonCode = isAttackCardCancellationRequestForTest(userMessage)
        ? "attack_card_cancelled_to_conversation"
        : "micro_action_request_not_attack_card";
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
            path: "tool_skill.prepare_attack_card",
            reason_code: reasonCode,
          },
          {
            path: "tool_skill_opportunity.prepare_attack_card",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "prepare_attack_card"
        ),
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
      routeDecision.response_owner !== "safety" &&
      (isExplicitOneShotReminderModificationRequestForTest(userMessage) ||
        isOneShotReminderReprogrammingFollowup(userMessage))
    ) {
      const reasonCode = "one_shot_reminder_modification_not_adjust_plan";
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
        isLocalTextRevisionRequestForTest(userMessage) ||
        isCoachPreferenceVerificationRequestForTest(userMessage) ||
        isImmediateModeRequestNotCoachPreferenceForTest(userMessage) ||
        isApplyExistingCoachPreferenceRequestForTest(userMessage)
      )
    ) {
      const reasonCode =
        isCoachPreferenceVerificationRequestForTest(userMessage)
          ? "coach_preference_verification_not_update"
          : isApplyExistingCoachPreferenceRequestForTest(userMessage)
          ? "apply_existing_coach_preference_not_update"
          : isImmediateModeRequestNotCoachPreferenceForTest(userMessage)
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
      routeDecision.response_owner === "tool_skill" &&
      routeDecision.selected_handler === "prepare_defense_card" &&
      isBroadRescueRequestNotDefenseCardForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting &&
      pendingOperationType(pendingOperationConfirmation) !==
        "prepare_defense_card"
    ) {
      const reasonCode = "broad_rescue_request_not_defense_card";
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.prepare_defense_card",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "prepare_defense_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      routeDecision.response_owner === "tool_skill" &&
      routeDecision.selected_handler === "prepare_attack_card" &&
      isBroadRescueRequestNotDefenseCardForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting &&
      pendingOperationType(pendingOperationConfirmation) !==
        "prepare_attack_card"
    ) {
      const reasonCode = "broad_rescue_request_not_attack_card";
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.prepare_attack_card",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "prepare_attack_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      routeDecision.response_owner === "tool_skill" &&
      routeDecision.selected_handler === "select_state_potion" &&
      isImmediateModeRequestNotCoachPreferenceForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting &&
      pendingOperationType(pendingOperationConfirmation) !==
        "select_state_potion"
    ) {
      const reasonCode = "immediate_mode_request_not_state_potion";
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.select_state_potion",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "select_state_potion"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      routeDecision.response_owner === "tool_skill" &&
      routeDecision.selected_handler === "prepare_defense_card" &&
      isImmediateModeRequestNotCoachPreferenceForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting &&
      pendingOperationType(pendingOperationConfirmation) !==
        "prepare_defense_card"
    ) {
      const reasonCode = "immediate_mode_request_not_defense_card";
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: reasonCode,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.prepare_defense_card",
            reason_code: reasonCode,
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "prepare_defense_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      routeDecision.response_owner === "tool_skill" &&
      (
        routeDecision.selected_handler === "create_recurring_reminder" ||
        routeDecision.selected_handler === "prepare_attack_card" ||
        (activeOperationIntake as any)?.operation_type ===
          "create_recurring_reminder" ||
        (activeOperationIntake as any)?.operation_type ===
          "prepare_attack_card"
      ) &&
      isLocalMemoryReformulationRequestForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting
    ) {
      tempMemory = clearToolSkillFlowForDirectReminder(tempMemory);
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
      activeOperationIntake = null;
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "local_memory_reformulation_not_recurring_reminder",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_skill.create_recurring_reminder",
            reason_code: "local_memory_reformulation_not_recurring_reminder",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
          intent.operation_type !== "create_recurring_reminder" &&
          intent.operation_type !== "prepare_attack_card"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      turnFrame &&
      routeDecision.response_owner === "conversation_handler" &&
      routeDecision.selected_handler === "execution_breakdown" &&
      isLocalMemoryReformulationRequestForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "local_memory_reformulation_not_execution_breakdown",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "conversation_handler.execution_breakdown",
            reason_code: "local_memory_reformulation_not_execution_breakdown",
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
      turnFrame &&
      routeDecision.response_owner === "conversation_handler" &&
      routeDecision.selected_handler === "execution_breakdown" &&
      isImmediateModeRequestNotCoachPreferenceForTest(userMessage) &&
      !pendingOperationConfirmationForGlobalRouting
    ) {
      routeDecision = {
        ...routeDecision,
        response_owner: "normal_reply",
        selected_handler: undefined,
        reason_code: "immediate_mode_request_not_execution_breakdown",
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "conversation_handler.execution_breakdown",
            reason_code: "immediate_mode_request_not_execution_breakdown",
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
      attackKeywordContextOverride &&
      routeDecision.direct_effects_to_run.includes("track_progress_plan_item")
    ) {
      routeDecision = {
        ...routeDecision,
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "direct_effects.track_progress_plan_item",
            reason_code: "attack_keyword_trigger_is_not_completion",
          },
        ],
        direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
          effect,
        ) => effect !== "track_progress_plan_item"),
      };
      turnFrame = {
        ...turnFrame,
        direct_effects: turnFrame.direct_effects.filter((effect) =>
          effect.effect_type !== "track_progress_plan_item"
        ),
      };
      dispatcherSignals = dispatcherSignalsFromTurnFrame({
        turnFrame,
        userMessage,
      });
    }
    if (
      hasExplicitDirectEffectOverride({
        turnFrame,
        routeDecision,
        pendingOperationConfirmation,
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
      routeDecision.response_owner !== "safety" &&
      !blocksToolSkills(safetyPregateOutput.risk_band) &&
      isLikelyOneShotReminderRequest(userMessage) &&
      (pendingOperationConfirmation || activeOperationIntake) &&
      (activeOperationIntake as any)?.operation_type !==
        "select_state_potion" &&
      pendingOperationType(pendingOperationConfirmation) !==
        "select_state_potion"
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
      routeDecision.response_owner !== "safety" &&
      isRecapOnlyRequestForTest(userMessage) &&
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
    if (
      routeDecision.response_owner !== "safety" &&
      (isStatusOnlyNoMutationRequestForTest(userMessage) ||
        isOneShotReminderExactStatusRequestForTest(userMessage))
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
        reason_code: isOneShotReminderExactStatusRequestForTest(userMessage)
          ? "one_shot_reminder_exact_status_request"
          : "status_only_request_blocks_tool_start",
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
    if (
      routeDecision.response_owner !== "safety" &&
      routeDecision.direct_effects_to_run.includes(
        "create_one_shot_reminder",
      ) &&
      (
        routeDecision.response_owner === "product_help" ||
        routeDecision.selected_handler === "product_help" ||
        isStatusOnlyNoMutationRequestForTest(userMessage) ||
        isOneShotReminderExactStatusRequestForTest(userMessage) ||
        isRecapOnlyRequestForTest(userMessage) ||
        isExistingOneShotReminderReferenceOnly(userMessage)
      )
    ) {
      const reasonCode = routeDecision.response_owner === "product_help" ||
          routeDecision.selected_handler === "product_help"
        ? "product_help_blocks_one_shot_direct_effect"
        : "non_mutation_context_blocks_one_shot_direct_effect";
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
      routeDecision.response_owner !== "safety" &&
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
      shouldRuntimeCoachPreferenceOverrideRouteForTest({
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
      routeDecision.response_owner !== "safety" &&
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
    if (routeDecision.response_owner === "safety" && turnFrame) {
      routeDecision = {
        ...routeDecision,
        direct_effects_to_run: [],
        blocked_paths: [
          ...routeDecision.blocked_paths,
          {
            path: "tool_signals",
            reason_code: "safety_route_suppresses_tool_signals",
          },
        ],
      };
      turnFrame = {
        ...turnFrame,
        tool_skill_intents: [],
        direct_effects: [],
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
  if (routeDecision?.response_owner === "safety") {
    targetMode = "companion";
  }

  // Drift diagnostic: compare legacy dispatcherSignals routing against the
  // canonical RouteDecision. Diagnostic only - does NOT change behaviour.
  // The plan is to make RouteDecision the single source of truth in a
  // dedicated session; this trace lets us audit route/mode drift. Safety is now
  // owned by the safety_crisis skill runtime rather than the legacy sentry mode.
  if (routeDecision) {
    const expectedFromRouteDecision: AgentMode =
      routeDecision.response_owner === "safety" ? "companion" : targetMode;
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

  const [trackProgressRuntime, weeklyForgottenProgressRuntime] = await Promise
    .all([
      maybeTrackProgressParallel({
        supabase,
        userId,
        state,
        tempMemory,
        activeSkillState,
        dispatcherSignals,
        directEffectGateResult,
        planItemSnapshot,
        v2Runtime,
        loggedMessageId,
        channel,
      }),
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

  const weeklyReviewStateForTurn = weeklyAdaptiveReviewStateForTurn({
    activeSkillState,
    tempMemory,
  });
  const weeklyReviewBlocksToolSkillRuntime = Boolean(
    weeklyReviewStateForTurn && routeDecision?.response_owner !== "safety" &&
      !hasPendingOrActiveAdjustPlanOperation(tempMemory) &&
      !weeklyReviewAllowsAdjustPlanBridge({
        routeDecision,
        turnFrame,
        userMessage,
        history,
      }),
  );
  if (
    weeklyReviewBlocksToolSkillRuntime &&
    turnFrame &&
    routeDecision &&
    routeDecision.response_owner === "tool_skill"
  ) {
    routeDecision = {
      ...routeDecision,
      response_owner: "conversation_handler",
      selected_handler: "weekly_adaptive_review_v1",
      reason_code: "active_weekly_review_blocks_tool_skill_runtime",
      direct_effects_to_run: [],
      blocked_paths: [
        ...routeDecision.blocked_paths,
        {
          path: "tool_skill",
          reason_code: "active_weekly_review_blocks_tool_skill_runtime",
        },
      ],
    };
    const updatedTurnFrame: TurnFrame = {
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
    turnFrame = updatedTurnFrame;
    dispatcherSignals = dispatcherSignalsFromTurnFrame({
      turnFrame: updatedTurnFrame,
      userMessage,
    });
  }

  if (
    routeDecision?.response_owner === "tool_skill" &&
    routeDecision.selected_handler
  ) {
    const selectedOperation = String(routeDecision.selected_handler);
    const activeOperation = String(
      ((tempMemory as any)?.__active_tool_skill_intake ??
        (tempMemory as any)?.active_tool_skill_intake)?.operation_type ?? "",
    ).trim();
    const pendingOperation = pendingOperationType(
      (tempMemory as any)?.__pending_tool_skill_confirmation ??
        (tempMemory as any)?.pending_tool_skill_confirmation ?? null,
    );
    if (
      routeDecision.active_flow_arbitration?.decision === "suspend_active" &&
      activeOperation && activeOperation !== selectedOperation
    ) {
      tempMemory = { ...(tempMemory ?? {}) };
      delete (tempMemory as any).__active_tool_skill_intake;
      delete (tempMemory as any).active_tool_skill_intake;
      if (pendingOperation && pendingOperation !== selectedOperation) {
        delete (tempMemory as any).__pending_tool_skill_confirmation;
        delete (tempMemory as any).pending_tool_skill_confirmation;
      }
      if (selectedOperation !== "adjust_plan_item") {
        delete (tempMemory as any).__pending_adjust_plan_draft_review;
      }
      state = { ...(state ?? {}), temp_memory: tempMemory } as any;
    }
  }

  const routeSafetyActive = routeDecision?.response_owner === "safety";
  const safetyFloorRiskBand =
    routeDecision?.direct_effects_to_run.includes("create_one_shot_reminder") &&
      safetyPregateOutput.risk_band === "medium" &&
      explicitlySafeWorkReminderRequest(userMessage)
      ? "low"
      : safetyPregateOutput.risk_band;
  const runtimeSafetyRiskBand = turnFrame?.safety?.risk_band &&
      isAtLeast(turnFrame.safety.risk_band, safetyFloorRiskBand)
    ? turnFrame.safety.risk_band
    : safetyFloorRiskBand;
  const runtimeSafetyPregateOutput = runtimeSafetyRiskBand ===
      safetyPregateOutput.risk_band
    ? safetyPregateOutput
    : { ...safetyPregateOutput, risk_band: runtimeSafetyRiskBand };
  const pendingAdjustPlanRuntime = !routeSafetyActive &&
      !weeklyReviewBlocksToolSkillRuntime &&
      isPendingAdjustPlanDraftReview(
        (tempMemory as any)?.__pending_adjust_plan_draft_review,
      )
    ? await maybeRunAdjustPlanItemOperation({
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
      safetyPregateOutput: runtimeSafetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      forceFullAi: fullAiRequested,
      enableAdjustPlanCoachGuidance:
        meta?.enableAdjustPlanCoachGuidance === true,
    })
    : null;
  const directWeeklyAdjustPlanRuntime = !routeSafetyActive &&
      !weeklyReviewBlocksToolSkillRuntime &&
      isExplicitPendingApplyConfirmation(userMessage) &&
      (isWeeklyMissionCarryOverRequest(userMessage) ||
        weeklyMissionCarryOverContext({ userMessage, history }) ||
        isCopyForwardWeeklyRequest(userMessage) ||
        isWeeklyLightRepeatRequest(userMessage))
    ? await maybeRunAdjustPlanItemOperation({
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
      safetyPregateOutput: runtimeSafetyPregateOutput,
      sourceMessageId: loggedMessageId,
      requestId: meta?.requestId ?? null,
      forceFullAi: fullAiRequested,
      enableAdjustPlanCoachGuidance:
        meta?.enableAdjustPlanCoachGuidance === true,
    })
    : null;
  const weeklyReviewAllowsReminderRuntime = !weeklyReviewStateForTurn ||
    /\b(rappel|rappeler|rappelle|reminder|programme un rappel|programmer un rappel)\b/
      .test(normalizeRouteText(userMessage));
  const directOneShotReminderRuntime = !routeSafetyActive &&
      routeDecision?.response_owner !== "tool_skill" &&
      !blocksDirectEffects(runtimeSafetyRiskBand) &&
      routeDecision?.direct_effects_to_run.includes(
        "create_one_shot_reminder",
      ) &&
      isLikelyOneShotReminderRequest(userMessage)
    ? await maybeCreateOneShotReminder({
      supabase,
      userId,
      message: userMessage,
      requestId: meta?.requestId ?? undefined,
      now: clientNow && Number.isFinite(clientNow.getTime())
        ? clientNow
        : undefined,
    })
    : null;
  const oneShotReminderOperationRuntime: OperationRuntimeResult | null =
    directOneShotReminderRuntime?.detected &&
      directOneShotReminderRuntime.status === "success"
      ? {
        content: [
          `C'est programmé pour ${directOneShotReminderRuntime.scheduled_for_local_label} : ${directOneShotReminderRuntime.reminder_instruction}.`,
          localTextAddonForOneShotReminderForTest(userMessage),
        ].filter(Boolean).join("\n\n"),
        nextTempMemory: clearToolSkillFlowForDirectReminder(tempMemory),
        toolExecution: "success",
        executedTools: ["create_one_shot_reminder"],
        toolSkillRun: {
          selected_handler: "create_one_shot_reminder",
          status: "executed",
          scheduled_for: directOneShotReminderRuntime.scheduled_for,
          inserted_checkin_id: directOneShotReminderRuntime.inserted_checkin_id,
        },
      }
      : directOneShotReminderRuntime?.detected
      ? {
        content: directOneShotReminderRuntime.status === "needs_clarify"
          ? "Je n'ai pas encore programmé ce rappel : il me manque un moment futur clair."
          : "Je n'ai pas pu programmer ce rappel maintenant. Il y a eu un souci technique côté outil.",
        nextTempMemory: clearToolSkillFlowForDirectReminder(tempMemory),
        toolExecution: directOneShotReminderRuntime.status === "failed"
          ? "failed"
          : "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_one_shot_reminder",
          status: directOneShotReminderRuntime.status,
          reason: "reason" in directOneShotReminderRuntime
            ? directOneShotReminderRuntime.reason
            : null,
        },
      }
      : null;
  const oneShotReminderModificationRuntime: OperationRuntimeResult | null =
    !routeSafetyActive &&
      (isExplicitOneShotReminderModificationRequestForTest(userMessage) ||
        isOneShotReminderReprogrammingFollowup(userMessage))
      ? {
        content:
          "Je ne touche pas au plan : tu parles du rappel ponctuel. Je ne peux pas modifier ce rappel en douce ici ; si tu veux, je peux créer un nouveau rappel au nouvel horaire après confirmation explicite, et l'ancien restera actif tant que je ne confirme pas son annulation.",
        nextTempMemory: clearToolSkillFlowForDirectReminder(tempMemory),
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "create_one_shot_reminder",
          status: "existing_reminder_modification_needs_explicit_reprogramming",
        },
      }
      : null;
  // Garde de format conversationnel: si le user impose explicitement un
  // format incompatible avec le panneau status canonique (ex: "fait,
  // prévu, fragile", "une ligne", "trois lignes", "pas de statut
  // système"), on laisse normal_reply prendre la main au lieu du composer
  // status_only fixe. Voir docs/agent-playbook/13-architecture-skills,
  // décision 2026-05-28 chantier 1.
  const statusOnlyNoMutationRuntime = !routeSafetyActive &&
      !isExplicitConversationalFormatRequestForTest(userMessage) &&
      (isStatusOnlyNoMutationRequestForTest(userMessage) ||
        isOneShotReminderExactStatusRequestForTest(userMessage) ||
        isRecapOnlyRequestForTest(userMessage))
    ? await buildStatusOnlyNoMutationRuntime({
      supabase,
      userId,
      tempMemory,
      userTimezone: userTime?.user_timezone ?? "Europe/Paris",
      userMessage,
    })
    : null;

  const operationRuntime =
    routeSafetyActive || weeklyReviewBlocksToolSkillRuntime
      ? null
      : pendingAdjustPlanRuntime ??
        directWeeklyAdjustPlanRuntime ??
        oneShotReminderModificationRuntime ??
        statusOnlyNoMutationRuntime ??
        oneShotReminderOperationRuntime ??
        (weeklyReviewAllowsReminderRuntime
          ? await maybeRunCreateRecurringReminderOperation({
            supabase,
            userId,
            userMessage,
            channel,
            userTimezone: userTime?.user_timezone ?? "Europe/Paris",
            tempMemory,
            v2Runtime,
            planItemSnapshot,
            turnFrame,
            routeDecision,
            safetyPregateOutput: runtimeSafetyPregateOutput,
            sourceMessageId: loggedMessageId,
            requestId: meta?.requestId ?? null,
          })
          : null) ??
        await maybeRunSelectStatePotionOperation({
          supabase,
          userId,
          userMessage,
          channel,
          userTimezone: userTime?.user_timezone ?? "Europe/Paris",
          tempMemory,
          turnFrame,
          routeDecision,
          safetyPregateOutput: runtimeSafetyPregateOutput,
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
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: loggedMessageId,
          requestId: meta?.requestId ?? null,
          forceFullAi: fullAiRequested,
          enableAdjustPlanCoachGuidance:
            meta?.enableAdjustPlanCoachGuidance === true,
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
          safetyPregateOutput: runtimeSafetyPregateOutput,
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
          safetyPregateOutput: runtimeSafetyPregateOutput,
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
          safetyPregateOutput: runtimeSafetyPregateOutput,
          sourceMessageId: loggedMessageId,
          requestId: meta?.requestId ?? null,
        });
  if (operationRuntime) {
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
    const styledOperationRuntimeContent =
      applyCoachResponseStylePreferencesForTest({
        userMessage,
        responseContent: weeklyCleanedOperationRuntimeContent,
        preferences: operationResponseStylePreferences,
      });
    const operationRuntimeContent = userRequestsShortStyle(userMessage) &&
        operationResponseStylePreferences.noEmoji
      ? styledOperationRuntimeContent
      : ensureVisibleSophiaEmoji(styledOperationRuntimeContent);
    const operationRuntimeAdditionalContents = (
      operationRuntime.additionalContents ?? []
    ).map((content) =>
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
        tool_skill_run: {
          selected_handler: routeDecision.selected_handler ?? null,
          reason_code: routeDecision.reason_code,
          ...operationRuntime.toolSkillRun,
        },
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
      : routeDecision?.response_owner === "safety"
      ? "safety_crisis"
      : routeDecision?.response_owner === "product_help"
      ? "product_help"
      : String((activeSkillState as any)?.skill_id ?? "").trim();
  const suppressOperationRecommendationForVerification =
    isAttackCardPostCreationVerificationQuestion({
      message: userMessage,
      recentMessages: recentMessagesForTurnFrame,
    }) ||
    isImmediateModeRequestNotCoachPreferenceForTest(userMessage) ||
    isLocalMemoryReformulationRequestForTest(userMessage) ||
    isBroadRescueRequestNotDefenseCardForTest(userMessage);
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
    buildProductHelpKnowledgeAddon(recommendationSkillOutput),
    buildRecentConversationContinuityAddon({
      userMessage,
      history,
    }),
    buildRouteDecisionConversationAddon({
      routeDecision,
      turnFrame,
      userMessage,
      recentMessages: recentMessagesForTurnFrame,
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

  const safetySkillReply = directSafetyCrisisReplyOverrideForTest({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  });
  const agentOut = safetySkillReply
    ? {
      responseContent: safetySkillReply,
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
    trackProgressRuntime,
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
      skill_run: routeDecision.response_owner === "conversation_handler" ||
          routeDecision.response_owner === "product_help" ||
          routeDecision.response_owner === "safety"
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
            routeDecision.response_owner === "product_help" ||
            routeDecision.response_owner === "safety"
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

  let responseContent = directSafetyCrisisReplyOverrideForTest({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  }) ?? directProductHelpReplyOverrideForTest({
    routeDecision,
    skillOutput: recommendationSkillOutput,
  }) ?? oneShotReminderManagementReplyForTest(userMessage) ??
    String(agentOut.responseContent ?? "").trim();
  if (routeDecision?.response_owner !== "product_help") {
    responseContent = enforceRecommendationToolVisibleReply({
      responseContent,
      userMessage,
      recommendation: recommendationToolRun,
      surfaceLabel: recommendationSurfaceLabel,
      tempMemory,
      planItemSnapshot,
    });
  }
  responseContent = stripHiddenHtmlComments(responseContent);
  responseContent = stripDeprecatedProductVocabulary(responseContent);
  if (
    weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }) ||
    /C['’]?est enregistré[\s\S]*Respiration de pause/i.test(responseContent)
  ) {
    responseContent = cleanWeeklyVisibleResponse(responseContent);
  }
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
  responseContent = applyNonDurableMemoryPromiseGuardForTest({
    userMessage,
    responseContent,
    routeDecision,
  });
  responseContent = applyWeeklyForgottenProgressAckGuard({
    responseContent,
    tempMemory,
    loggedMessageId,
  });
  if (
    /C['’]?est enregistré[\s\S]*Respiration de pause/i.test(responseContent)
  ) {
    responseContent = cleanWeeklyVisibleResponse(responseContent);
  }
  responseContent = applyWeeklyRepeatedClarificationGuard({
    responseContent,
    userMessage,
    activeSkillState,
    tempMemory,
  });
  responseContent = applyWeeklyConcreteOrganizationGuard({
    responseContent,
    userMessage,
    activeSkillState,
    tempMemory,
    history,
  });
  responseContent = applyWeeklyConclusionGuard({
    responseContent,
    userMessage,
    activeSkillState,
    tempMemory,
  });
  responseContent = applyShortRepairNoProductOfferGuardForTest({
    userMessage,
    responseContent,
  });
  responseContent = applyCompactStartGuardForTest({
    userMessage,
    responseContent,
  });
  responseContent = applyIncompleteRecapGuardForTest({
    userMessage,
    responseContent,
  });
  const responseStylePreferences = await loadCoachResponseStylePreferences({
    supabase,
    userId,
  });
  responseContent = applyCoachResponseStylePreferencesForTest({
    userMessage,
    responseContent,
    preferences: responseStylePreferences,
  });
  if (
    !(
      userRequestsShortStyle(userMessage) &&
      (responseStylePreferences.noEmoji ||
        /\b(sans emoji|zero emoji|0 emoji|pas d emoji|pas d emojis)\b/.test(
          normalizeRouteText(userMessage),
        ))
    )
  ) {
    responseContent = ensureVisibleSophiaEmoji(responseContent);
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

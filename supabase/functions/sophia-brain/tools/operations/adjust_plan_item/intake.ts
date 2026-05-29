import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildOperationDraftRequest,
  buildPlanAdjustmentPayload,
  type PlanAdjustmentGeneratorInput,
} from "../_shared/operation_payload_builder.ts";
import {
  type AdjustPlanResultWriter,
  type PlanAdjustmentDraftV1,
  planAdjustmentMaterializationBlockReason,
  runPlanAdjustmentGenerator,
} from "./generator.ts";
import {
  type AdjustPlanQuestionWriter,
  type AdjustPlanSlotFiller,
  fillAdjustPlanSlotsWithAi,
  shouldUseAdjustPlanAiSlotFiller,
  writeAdjustPlanNextQuestionWithAi,
} from "./slot_filler.ts";
import {
  ADJUST_PLAN_STAGE_ORDER,
  ADJUST_PLAN_SUB_SKILLS,
  type AdjustPlanSubSkillId,
  type AdjustPlanSubSkillTrace,
  type AdjustPlanToolSkillState,
  type DraftReviewState,
} from "./workflow.ts";
import type { AdjustSignals } from "./allowed_adjustment_matrix.ts";
import {
  type AllowedAdjustmentSet,
  buildAllowedAdjustmentSet,
  projectAllowedSetForAi,
  projectPlanItemsForGenerator,
} from "./candidate_builder.ts";
import {
  compileAdjustPlanIntent,
  type CompilerResult,
} from "./draft_compiler.ts";
import {
  type AdjustPlanCoachGuidance,
  type AdjustPlanCoachGuidanceRunner,
  generateAdjustPlanCoachGuidance,
  shouldUseAdjustPlanCoachGuidance,
  type WholePlanCandidateOperation,
  type WholePlanChangeFamily,
  type WholePlanReadiness,
} from "./coach_guidance.ts";

export { ADJUST_PLAN_SUB_SKILLS } from "./workflow.ts";

type ScopeKind = "specific_plan_item" | "current_level" | "whole_plan";
type SlotStatus = "missing" | "ambiguous" | "identified";
type TargetGranularity =
  | "single_action"
  | "action_cluster"
  | "current_level"
  | "whole_plan";

type TargetGranularitySlot = {
  status: SlotStatus;
  value?: TargetGranularity;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  negative_evidence: string[];
};

type ReasonChangeSlot = {
  status: "missing" | "identified";
  value?:
    | "too_many_actions"
    | "time_or_capacity_changed"
    | "energy_low"
    | "priority_changed"
    | "context_changed"
    | "goal_changed"
    | "structure_bad_fit";
  evidence: string[];
};

type ChangeTargetSlot = {
  status: "missing" | "identified";
  value?:
    | "entry_cost"
    | "number_of_actions"
    | "intensity"
    | "timing"
    | "focus"
    | "sequence"
    | "global_load";
  evidence: string[];
};

type AffectedItemsSlot = {
  status: "missing" | "identified";
  values: string[];
  evidence: string[];
};

type WholePlanChangeFamilySlot = {
  status: "missing" | "identified";
  value?: WholePlanChangeFamily;
  evidence: string[];
};

type ActionRequestCategory =
  | "feasibility_load"
  | "challenge_intensity"
  | "timing_duration"
  | "method_format"
  | "scope_focus"
  | "replacement_alternative"
  | "support_guardrail";

type ActionRequestCategorySlot = {
  status: "missing" | "identified";
  value?: ActionRequestCategory;
  evidence: string[];
};

type LevelRequestCategory =
  | "pacing_workload"
  | "difficulty_progression"
  | "sequence_priority"
  | "level_focus"
  | "action_mix"
  | "context_constraints"
  | "recovery_reset";

type LevelRequestCategorySlot = {
  status: "missing" | "identified";
  value?: LevelRequestCategory;
  evidence: string[];
};

type AdjustPlanCoachGuidanceAudit = {
  status: "not_run" | "generated" | "empty" | "error";
  scope: "action" | "level" | "whole_plan" | null;
  source: "disabled" | "runner";
  error?: string | null;
};

function stripTextWrappers(value: string): string {
  let text = value.trim();
  const wrappers: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["«", "»"],
  ];
  for (const [open, close] of wrappers) {
    if (text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, -close.length).trim();
      break;
    }
  }
  return text;
}

function userAskedForVerbatim(message: string, value: string): boolean {
  const lowerMessage = message.toLowerCase();
  const cues = [
    "texte exact",
    "phrase exacte",
    "formulation exacte",
    "mot exact",
    "mot pour mot",
    "verbatim",
    "sans reformuler",
    "garde cette formulation",
    "conserve cette formulation",
    "copie",
    "recopie",
  ];
  if (cues.some((cue) => lowerMessage.includes(cue))) return true;
  const text = stripTextWrappers(value);
  return message.includes(`"${text}"`) ||
    message.includes(`'${text}'`) ||
    message.includes(`“${text}”`) ||
    message.includes(`« ${text} »`) ||
    message.includes(`«${text}»`);
}

function sanitizeGeneratorConstraints(
  constraints: string[],
  message: string,
): string[] {
  return constraints.map((constraint) => {
    const prefix = "exact_text:";
    if (!constraint.startsWith(prefix)) return constraint;
    const value = stripTextWrappers(constraint.slice(prefix.length));
    if (!value) return "";
    return userAskedForVerbatim(message, value) ? `${prefix}${value}` : value;
  }).map((constraint) => constraint.trim()).filter(Boolean);
}

function userExplicitlyRequestsDraftGeneration(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
  const asksToPrepare =
    /\b(prepare|preparer|propose|proposer|genere|generer|montre|montrer|fais|faire|donne|donner|redige|rediger)\b/
      .test(normalized);
  const mentionsDraft =
    /\b(brouillon|proposition concrete|proposition|version concrete|version|changement concret|changements concrets|avant projet|preview)\b/
      .test(normalized);
  const mentionsConcreteModification =
    /\b(modification|ajustement|changement|remplacement)\b/.test(normalized);
  const mentionsAdjustPlanScope =
    /\b(niveau actuel|niveau courant|plan global|whole plan|trajectoire globale|organisation concrete|organisation de la semaine|semaine prochaine|version allegee|version concrete)\b/
      .test(normalized);
  const explicitlyReviewOnly =
    /\b(n'applique pas|ne l'applique pas|n'applique rien|ne rien appliquer|sans appliquer|sans l'appliquer|pas encore|seulement|juste|uniquement|pour relire|juste relire|avant validation|avant de valider|sans valider|pas sure d'appliquer|pas sur d'appliquer)\b/
      .test(normalized);
  if (asksToPrepare && mentionsConcreteModification) return true;
  if (asksToPrepare && mentionsDraft && mentionsAdjustPlanScope) return true;
  return asksToPrepare && mentionsDraft && explicitlyReviewOnly;
}

function isTemporaryLoadLevelRequest(text: string): boolean {
  const normalized = normalizeForLooseMatch(text);
  if (!normalized) return false;
  const hasTemporaryWindow =
    /\b(cette semaine|semaine prochaine|prochaine semaine|deux prochaines semaines|prochaines semaines|2 semaines|deux semaines|quelques jours|temporaire|temporairement|pour souffler|faire calme|lever le pied|ralentir)\b/
      .test(normalized);
  const hasLoadSignal =
    /\b(allege|alleger|calme|doux|douce|moins|rythme|charge|fatigue|fatiguee|pression|culpabilis|tenir|tenable|trop lourd|trop intense|souffler)\b/
      .test(normalized);
  const hasStructuralSignal =
    /\b(trajectoire|structure|structurel|coherent|coherence|plus trop coherent|prochaine etape|etape suivante|troisieme partie|3eme partie|phase suivante|ordre des phases|ordre du plan|reordonner|resequencer|objectif change|changer d objectif|repartir de zero|reconstruire le plan|plan ne fait plus sens|plan n a plus de sens)\b/
      .test(normalized);
  return hasTemporaryWindow && hasLoadSignal && !hasStructuralSignal;
}

function levelBoundaryConstraintsForRequest(text: string): string[] {
  if (!isTemporaryLoadLevelRequest(text)) return [];
  return [
    "adjustment_scope:current_level_not_whole_plan",
    "level_boundary_note:appliquer l'allegement au niveau actuel; si la demande depasse la fin du niveau, garder ce repere pour le prochain niveau plutot que modifier la trajectoire globale",
  ];
}

function wholePlanDetailConstraintsForRequest(text: string): string[] {
  const normalized = normalizeForLooseMatch(text);
  if (!normalized) return [];
  const constraints: string[] = [];
  if (
    /\b(sas|niveau court|niveau en plus|nouveau niveau|niveau de consolidation|consolidation)\b/
      .test(normalized) &&
    /\b(sujets sensibles|reproches|attentes non dites|tensions|debat profond|debat de fond)\b/
      .test(normalized)
  ) {
    constraints.push("insert_phase_kind:short_consolidation_level");
    constraints.push("insert_phase_position:before_sensitive_topics");
  }
  if (
    /\b(phase future|partie future|suite du plan|plus tard|reproches|attentes non dites)\b/
      .test(normalized) &&
    /\b(reparation|reparer|retour au calme|revenir au calme|reconnaitre ce qui a aide|ce qui a aide|petite tension)\b/
      .test(normalized)
  ) {
    constraints.push("replace_phase_kind:light_repair_after_tension");
  }
  if (
    /\b(observer|remarquer)\b.{0,60}\b(apaise|calme|stabilise)\b/.test(
      normalized,
    )
  ) {
    constraints.push("insert_phase_action:observer_ce_qui_apaise");
  }
  if (
    /\b(demande simple|demande claire|faire une demande)\b/.test(normalized) &&
    /\b(sans debat|sans debattre|pas de debat|sans conversation profonde|pas de debat profond)\b/
      .test(normalized)
  ) {
    constraints.push("insert_phase_action:demande_simple_sans_debat");
  }
  return dedupeStrings(constraints);
}

function downgradeTemporaryWholePlanToLevel(input: {
  state: AdjustPlanIntakeState;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
}): { state: AdjustPlanIntakeState; applied: boolean } {
  const text = transcriptUserText(input);
  if (!isTemporaryLoadLevelRequest(text)) {
    return { state: input.state, applied: false };
  }
  if (input.state.scope.kind !== "whole_plan") {
    return { state: input.state, applied: false };
  }
  const constraints = levelBoundaryConstraintsForRequest(text);
  const wholePayload = input.state.payload?.scope_kind === "whole_plan"
    ? input.state.payload
    : null;
  const levelPayload: LevelAdjustmentPayload = {
    scope_kind: "current_level",
    adjustment_type: {
      status: wholePayload?.adjustment_type.status ?? "identified",
      value: wholePayload?.adjustment_type.value === "reduce_global_load"
        ? "reduce_load"
        : wholePayload?.adjustment_type.value === "resequence"
        ? "rebalance"
        : "reduce_load",
      evidence: dedupeStrings([
        ...(wholePayload?.adjustment_type.evidence ?? []),
        "temporary load/window request belongs to current level",
      ]),
    },
    reason: {
      status: wholePayload?.reason.status ?? "identified",
      value: wholePayload?.reason.value === "context_changed"
        ? "context_changed"
        : "fatigue",
      evidence: dedupeStrings([
        ...(wholePayload?.reason.evidence ?? []),
        "temporary load/window request belongs to current level",
      ]),
    },
    reason_change: wholePayload?.reason_change.status === "identified"
      ? { ...wholePayload.reason_change }
      : {
        status: "identified",
        value: "energy_low",
        evidence: ["temporary load/window request"],
      },
    change_target: wholePayload?.change_target.status === "identified"
      ? { ...wholePayload.change_target }
      : {
        status: "identified",
        value: "intensity",
        evidence: ["temporary load/window request"],
      },
    constraints: {
      status: "identified",
      values: dedupeStrings([
        ...(wholePayload?.constraints.values ?? []),
        ...constraints,
      ]),
      evidence: dedupeStrings([
        ...(wholePayload?.constraints.evidence ?? []),
        "temporary level boundary",
      ]),
    },
    affected_items: wholePayload?.affected_items
      ? { ...wholePayload.affected_items }
      : { status: "missing", values: [], evidence: [] },
  };
  return {
    applied: true,
    state: {
      ...input.state,
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "high",
        evidence: dedupeStrings([
          ...input.state.target_granularity.evidence,
          "temporary load/window request maps to current_level",
        ]),
        negative_evidence: dedupeStrings([
          ...input.state.target_granularity.negative_evidence,
          "no structural trajectory signal",
        ]),
      },
      scope: {
        status: "identified",
        kind: "current_level",
        plan_item_id: null,
        label: "niveau actuel",
        evidence: dedupeStrings([
          ...input.state.scope.evidence,
          "temporary load/window request maps to current_level",
        ]),
      },
      selected_sub_skill: "level_intake",
      payload: levelPayload,
    },
  };
}

export type AdjustPlanScopeSlot = {
  status: SlotStatus;
  kind?: ScopeKind;
  plan_item_id?: string | null;
  label?: string | null;
  evidence: string[];
};

export type ActionAdjustmentPayload = {
  scope_kind: "specific_plan_item";
  action_request_category?: ActionRequestCategorySlot;
  adjustment_type: {
    status: "missing" | "identified";
    value?:
      | "reduce"
      | "clarify"
      | "pause"
      | "replace"
      | "rebalance"
      | "simplify";
    evidence: string[];
  };
  reason: {
    status: "missing" | "identified";
    value?:
      | "too_heavy"
      | "bad_fit"
      | "too_vague"
      | "context_changed"
      | "fatigue";
    evidence: string[];
  };
  constraints: {
    status: "missing" | "identified";
    values: string[];
    evidence: string[];
  };
};

export type LevelAdjustmentPayload = {
  scope_kind: "current_level";
  level_request_category?: LevelRequestCategorySlot;
  adjustment_type: {
    status: "missing" | "identified";
    value?: "reduce_load" | "change_focus" | "pause_level" | "rebalance";
    evidence: string[];
  };
  reason: {
    status: "missing" | "identified";
    value?: "too_many_actions" | "wrong_focus" | "fatigue" | "context_changed";
    evidence: string[];
  };
  reason_change: ReasonChangeSlot;
  change_target: ChangeTargetSlot;
  constraints: {
    status: "missing" | "identified";
    values: string[];
    evidence: string[];
  };
  affected_items: AffectedItemsSlot;
};

export type WholePlanAdjustmentPayload = {
  scope_kind: "whole_plan";
  whole_plan_change_family?: WholePlanChangeFamilySlot;
  candidate_operation?: WholePlanCandidateOperation | null;
  readiness?: WholePlanReadiness | null;
  adjustment_type: {
    status: "missing" | "identified";
    value?:
      | "reduce_global_load"
      | "change_goal"
      | "resequence"
      | "restart_plan";
    evidence: string[];
  };
  reason: {
    status: "missing" | "identified";
    value?: "too_heavy" | "bad_fit" | "context_changed" | "too_vague";
    evidence: string[];
  };
  reason_change: ReasonChangeSlot;
  change_target: ChangeTargetSlot;
  constraints: {
    status: "missing" | "identified";
    values: string[];
    evidence: string[];
  };
  affected_items: AffectedItemsSlot;
};

export type AdjustPlanIntakeState = {
  target_granularity: TargetGranularitySlot;
  scope: AdjustPlanScopeSlot;
  selected_sub_skill?: AdjustPlanSubSkillId;
  coaching_guidance?: AdjustPlanCoachGuidance | null;
  payload:
    | ActionAdjustmentPayload
    | LevelAdjustmentPayload
    | WholePlanAdjustmentPayload
    | null;
};

export type AdjustPlanItemOperationOutput = {
  operation_type: "adjust_plan_item";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "draft_review_decision"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "scope_resolution" | "generation" | "confirmation" | "exit";
  draft?: PlanAdjustmentDraftV1;
  confirmation?: { required: boolean; message: string; actions: ["yes", "no"] };
  pending_confirmation?: Record<string, unknown>;
  next_question?: { needed: boolean; question?: string; reason?: string };
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    intake_state?: AdjustPlanIntakeState;
    sub_skill_trace?: AdjustPlanSubSkillTrace[];
    tool_skill_state?: AdjustPlanToolSkillState;
    draft_review_decision?: {
      decision:
        | "approve"
        | "reject"
        | "revise"
        | "explain"
        | "topic_change"
        | "unclear";
      confidence: "low" | "medium" | "high";
      evidence: string[];
      apply_after_revision?: boolean;
    };
    operation_input?: Record<string, unknown>;
    coaching_guidance_audit?: AdjustPlanCoachGuidanceAudit;
  };
};

type SnapshotItem = {
  id: string;
  title: string;
  description: string;
  status?: string | null;
  dimension?: string | null;
  kind?: string | null;
  item_type?: string | null;
  item_nature?: string | null;
  tracking_type?: string | null;
  cadence_label?: string | null;
  target_reps?: number | null;
  current_reps?: number | null;
  weekly_reps?: number | null;
  weekly_cadence_label?: string | null;
  availability_status?: string | null;
  available_this_week?: boolean | null;
  source_kind?: string | null;
  clarification_type?: string | null;
  clarification_section_labels?: string[];
};

function planItems(planSnapshot: unknown): SnapshotItem[] {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items.map((item: any) => {
    const payload = item?.payload && typeof item.payload === "object"
      ? item.payload as Record<string, unknown>
      : {};
    const weekScope = item?.week_scope && typeof item.week_scope === "object"
      ? item.week_scope as Record<string, unknown>
      : {};
    const clarificationDetails = (payload as any).clarification_details &&
        typeof (payload as any).clarification_details === "object"
      ? (payload as any).clarification_details
      : null;
    const sections = Array.isArray(clarificationDetails?.sections)
      ? clarificationDetails.sections
      : [];
    return {
      id: String(item?.id ?? ""),
      title: String(item?.title ?? ""),
      description: String(item?.description ?? ""),
      status: item?.status == null ? null : String(item.status),
      dimension: item?.dimension == null ? null : String(item.dimension),
      kind: item?.kind == null
        ? item?.item_type == null ? null : String(item.item_type)
        : String(item.kind),
      item_type: item?.item_type == null
        ? item?.kind == null ? null : String(item.kind)
        : String(item.item_type),
      item_nature: item?.item_nature == null ? null : String(item.item_nature),
      tracking_type: item?.tracking_type == null
        ? null
        : String(item.tracking_type),
      cadence_label: item?.cadence_label == null
        ? null
        : String(item.cadence_label),
      target_reps: typeof item?.target_reps === "number"
        ? item.target_reps
        : null,
      current_reps: typeof item?.current_reps === "number"
        ? item.current_reps
        : null,
      weekly_reps: typeof weekScope?.weekly_reps === "number"
        ? weekScope.weekly_reps
        : typeof item?.weekly_reps === "number"
        ? item.weekly_reps
        : null,
      weekly_cadence_label: weekScope?.weekly_cadence_label == null
        ? item?.weekly_cadence_label == null
          ? null
          : String(item.weekly_cadence_label)
        : String(weekScope.weekly_cadence_label),
      availability_status: item?.availability_status == null
        ? null
        : String(item.availability_status),
      available_this_week: typeof item?.available_this_week === "boolean"
        ? item.available_this_week
        : null,
      source_kind: item?.source_kind == null ? null : String(item.source_kind),
      clarification_type: clarificationDetails?.type == null
        ? null
        : String(clarificationDetails.type),
      clarification_section_labels: sections.map((section: any) =>
        String(section?.title ?? section?.label ?? "").trim()
      ).filter(Boolean),
    };
  }).filter((item: SnapshotItem) => item.id && item.title);
}

function normalizedScopeKind(kind: unknown): ScopeKind | null {
  const raw = String(kind ?? "").trim();
  if (raw === "specific_plan_item") return "specific_plan_item";
  if (raw === "current_level" || raw === "current_phase") {
    return "current_level";
  }
  if (raw === "whole_plan") return "whole_plan";
  return null;
}

function normalizedTargetGranularity(value: unknown): TargetGranularity | null {
  const raw = String(value ?? "").trim();
  if (raw === "single_action") return "single_action";
  if (raw === "action_cluster") return "action_cluster";
  if (raw === "current_level") return "current_level";
  if (raw === "whole_plan") return "whole_plan";
  return null;
}

function normalizedActionRequestCategory(
  value: unknown,
): ActionRequestCategory | null {
  const raw = String(value ?? "").trim();
  return [
      "feasibility_load",
      "challenge_intensity",
      "timing_duration",
      "method_format",
      "scope_focus",
      "replacement_alternative",
      "support_guardrail",
    ].includes(raw)
    ? raw as ActionRequestCategory
    : null;
}

function normalizedLevelRequestCategory(
  value: unknown,
): LevelRequestCategory | null {
  const raw = String(value ?? "").trim();
  return [
      "pacing_workload",
      "difficulty_progression",
      "sequence_priority",
      "level_focus",
      "action_mix",
      "context_constraints",
      "recovery_reset",
    ].includes(raw)
    ? raw as LevelRequestCategory
    : null;
}

function normalizedWholePlanChangeFamily(
  value: unknown,
): WholePlanChangeFamily | null {
  const raw = String(value ?? "").trim();
  return [
      "sequence_order_issue",
      "missing_bridge_or_level",
      "direction_change",
      "success_criteria_change",
      "future_phase_mismatch",
      "style_or_method_mismatch",
      "maintenance_or_consolidation_gap",
      "global_capacity_change",
      "value_preference_conflict",
      "plan_no_longer_relevant",
      "split_merge_restructure",
      "diagnostic_unclear",
      "cancel_or_reject",
    ].includes(raw)
    ? raw as WholePlanChangeFamily
    : null;
}

function normalizedWholePlanCandidateOperation(
  value: unknown,
): WholePlanCandidateOperation | null {
  const raw = String(value ?? "").trim();
  return [
      "diagnostic_only",
      "reorder",
      "insert_phase",
      "replace_phase",
      "change_emphasis",
      "change_success_criteria",
      "pace_change",
      "maintenance_layer",
      "split_or_merge_phase",
      "cancel_or_revise",
    ].includes(raw)
    ? raw as WholePlanCandidateOperation
    : null;
}

function normalizedWholePlanReadiness(
  value: unknown,
): WholePlanReadiness | null {
  const raw = String(value ?? "").trim();
  return [
      "diagnose",
      "draft_ready",
      "needs_confirmation",
      "execute_after_confirmation",
    ].includes(raw)
    ? raw as WholePlanReadiness
    : null;
}

function targetGranularityFromOperationInput(
  operationInput: Record<string, unknown>,
): TargetGranularitySlot | null {
  const raw = (operationInput as any).target_granularity;
  const value = normalizedTargetGranularity(raw?.value ?? raw);
  if (!value) return null;
  return {
    status: "identified",
    value,
    confidence: raw?.confidence === "low" || raw?.confidence === "medium" ||
        raw?.confidence === "high"
      ? raw.confidence
      : "high",
    evidence: Array.isArray(raw?.evidence)
      ? raw.evidence.map((item: unknown) => String(item)).filter(Boolean)
      : ["operation_input.target_granularity"],
    negative_evidence: Array.isArray(raw?.negative_evidence)
      ? raw.negative_evidence.map((item: unknown) => String(item)).filter(
        Boolean,
      )
      : [],
  };
}

function scopeFromOperationInput(
  operationInput: Record<string, unknown>,
): AdjustPlanScopeSlot | null {
  const granularity = targetGranularityFromOperationInput(operationInput);
  const rawScope = (operationInput as any).scope;
  const rawKind = normalizedScopeKind(rawScope?.kind);
  const kind = granularity?.value === "whole_plan"
    ? "whole_plan"
    : granularity?.value === "current_level" ||
        granularity?.value === "action_cluster"
    ? "current_level"
    : rawKind;
  if (!kind) return null;
  const label = String(
    rawScope?.title ?? rawScope?.current_summary ?? rawScope?.label ??
      (kind === "current_level" ? "niveau actuel" : "plan global"),
  ).trim();
  return {
    status: kind === "specific_plan_item" && !rawScope?.plan_item_id
      ? "ambiguous"
      : "identified",
    kind,
    plan_item_id: rawScope?.plan_item_id ? String(rawScope.plan_item_id) : null,
    label: label || null,
    evidence: ["operation_input.scope"],
  };
}

function emptyTargetGranularitySlot(): TargetGranularitySlot {
  return {
    status: "missing",
    confidence: "low",
    evidence: [],
    negative_evidence: [],
  };
}

function emptyScopeSlot(): AdjustPlanScopeSlot {
  return { status: "missing", evidence: [] };
}

function emptyActionPayload(): ActionAdjustmentPayload {
  return {
    scope_kind: "specific_plan_item",
    action_request_category: { status: "missing", evidence: [] },
    adjustment_type: { status: "missing", evidence: [] },
    reason: { status: "missing", evidence: [] },
    constraints: { status: "missing", values: [], evidence: [] },
  };
}

function emptyLevelPayload(): LevelAdjustmentPayload {
  return {
    scope_kind: "current_level",
    level_request_category: { status: "missing", evidence: [] },
    adjustment_type: { status: "missing", evidence: [] },
    reason: { status: "missing", evidence: [] },
    reason_change: { status: "missing", evidence: [] },
    change_target: { status: "missing", evidence: [] },
    constraints: { status: "missing", values: [], evidence: [] },
    affected_items: { status: "missing", values: [], evidence: [] },
  };
}

function emptyWholePlanPayload(): WholePlanAdjustmentPayload {
  return {
    scope_kind: "whole_plan",
    whole_plan_change_family: { status: "missing", evidence: [] },
    candidate_operation: null,
    readiness: null,
    adjustment_type: { status: "missing", evidence: [] },
    reason: { status: "missing", evidence: [] },
    reason_change: { status: "missing", evidence: [] },
    change_target: { status: "missing", evidence: [] },
    constraints: { status: "missing", values: [], evidence: [] },
    affected_items: { status: "missing", values: [], evidence: [] },
  };
}

function emptyIntakeState(): AdjustPlanIntakeState {
  return {
    target_granularity: emptyTargetGranularitySlot(),
    scope: emptyScopeSlot(),
    coaching_guidance: null,
    payload: null,
  };
}

function looseStringEvidence(value: unknown): string[] {
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function looseEvidenceSlot<T extends string>(
  value: unknown,
  validValues: readonly T[],
  fallbackValue?: T,
): { status: "missing" | "identified"; value?: T; evidence: string[] } {
  const raw = objectValue(value);
  const looseValue = raw ? raw.value : value;
  const text = String(looseValue ?? "").trim();
  const evidence = stringList(raw?.evidence).length
    ? stringList(raw?.evidence)
    : looseStringEvidence(looseValue);
  if (!text && !evidence.length) return { status: "missing", evidence: [] };
  const exact = validValues.find((candidate) => candidate === text);
  return {
    status: "identified",
    value: exact ?? fallbackValue,
    evidence,
  };
}

function looseConstraints(value: unknown): {
  status: "missing" | "identified";
  values: string[];
  evidence: string[];
} {
  const raw = objectValue(value);
  const values = raw
    ? stringList(raw.values).length
      ? stringList(raw.values)
      : stringList(raw.evidence)
    : stringList(value);
  return {
    status: values.length ? "identified" : "missing",
    values,
    evidence: values,
  };
}

function looseAffectedItems(value: unknown): AffectedItemsSlot {
  const raw = objectValue(value);
  const values = raw
    ? stringList(raw.values).length
      ? stringList(raw.values)
      : stringList(raw.evidence)
    : stringList(value);
  return {
    status: values.length ? "identified" : "missing",
    values,
    evidence: values,
  };
}

function loosePayloadFromOperationInput(
  scopeKind: ScopeKind,
  operationInput: Record<string, unknown>,
):
  | ActionAdjustmentPayload
  | LevelAdjustmentPayload
  | WholePlanAdjustmentPayload
  | null {
  const source =
    objectValue((operationInput as any).latest_turn_operation_input)
      ? {
        ...operationInput,
        ...objectValue((operationInput as any).latest_turn_operation_input),
      }
      : operationInput;
  if (
    source.adjustment_type == null && source.reason == null &&
    source.reason_change == null && source.change_target == null &&
    source.constraints == null &&
    (source as any).action_request_category == null &&
    (source as any).level_request_category == null
  ) return null;
  if (scopeKind === "specific_plan_item") {
    return {
      ...emptyActionPayload(),
      action_request_category: (() => {
        const sourceValue = (source as any).action_request_category;
        const raw = objectValue(sourceValue);
        const value = normalizedActionRequestCategory(
          raw?.value ?? sourceValue,
        );
        return value
          ? {
            status: "identified" as const,
            value,
            evidence: stringList(raw?.evidence).length
              ? stringList(raw?.evidence)
              : ["operation_input.action_request_category"],
          }
          : { status: "missing" as const, evidence: [] };
      })(),
      adjustment_type: looseEvidenceSlot(
        source.adjustment_type,
        ["reduce", "clarify", "pause", "replace", "rebalance", "simplify"],
      ) as ActionAdjustmentPayload["adjustment_type"],
      reason: looseEvidenceSlot(
        source.reason,
        ["too_heavy", "bad_fit", "too_vague", "context_changed", "fatigue"],
      ) as ActionAdjustmentPayload["reason"],
      constraints: looseConstraints(source.constraints),
    };
  }
  if (scopeKind === "current_level") {
    return {
      ...emptyLevelPayload(),
      level_request_category: (() => {
        const sourceValue = (source as any).level_request_category;
        const raw = objectValue(sourceValue);
        const value = normalizedLevelRequestCategory(raw?.value ?? sourceValue);
        return value
          ? {
            status: "identified" as const,
            value,
            evidence: stringList(raw?.evidence).length
              ? stringList(raw?.evidence)
              : ["operation_input.level_request_category"],
          }
          : { status: "missing" as const, evidence: [] };
      })(),
      adjustment_type: looseEvidenceSlot(
        source.adjustment_type,
        ["reduce_load", "change_focus", "pause_level", "rebalance"],
        source.adjustment_type == null ? undefined : "reduce_load",
      ) as LevelAdjustmentPayload["adjustment_type"],
      reason: looseEvidenceSlot(
        source.reason,
        ["too_many_actions", "wrong_focus", "fatigue", "context_changed"],
      ) as LevelAdjustmentPayload["reason"],
      reason_change: looseEvidenceSlot(source.reason_change, [
        "too_many_actions",
        "time_or_capacity_changed",
        "energy_low",
        "priority_changed",
        "context_changed",
        "goal_changed",
        "structure_bad_fit",
      ]) as LevelAdjustmentPayload["reason_change"],
      change_target: looseEvidenceSlot(source.change_target, [
        "entry_cost",
        "number_of_actions",
        "intensity",
        "timing",
        "focus",
        "sequence",
        "global_load",
      ]) as LevelAdjustmentPayload["change_target"],
      constraints: looseConstraints(source.constraints),
      affected_items: looseAffectedItems((source as any).affected_items),
    };
  }
  return {
    ...emptyWholePlanPayload(),
    whole_plan_change_family: (() => {
      const raw = objectValue((source as any).whole_plan_change_family);
      const value = normalizedWholePlanChangeFamily(raw?.value ?? raw);
      return value
        ? {
          status: "identified" as const,
          value,
          evidence: stringList(raw?.evidence).length
            ? stringList(raw?.evidence)
            : ["operation_input.whole_plan_change_family"],
        }
        : { status: "missing" as const, evidence: [] };
    })(),
    candidate_operation: normalizedWholePlanCandidateOperation(
      (source as any).candidate_operation,
    ),
    readiness: normalizedWholePlanReadiness((source as any).readiness),
    adjustment_type: looseEvidenceSlot(
      source.adjustment_type,
      ["reduce_global_load", "change_goal", "resequence", "restart_plan"],
    ) as WholePlanAdjustmentPayload["adjustment_type"],
    reason: looseEvidenceSlot(
      source.reason,
      ["too_heavy", "bad_fit", "context_changed", "too_vague"],
    ) as WholePlanAdjustmentPayload["reason"],
    reason_change: looseEvidenceSlot(source.reason_change, [
      "too_many_actions",
      "time_or_capacity_changed",
      "energy_low",
      "priority_changed",
      "context_changed",
      "goal_changed",
      "structure_bad_fit",
    ]) as WholePlanAdjustmentPayload["reason_change"],
    change_target: looseEvidenceSlot(source.change_target, [
      "entry_cost",
      "number_of_actions",
      "intensity",
      "timing",
      "focus",
      "sequence",
      "global_load",
    ]) as WholePlanAdjustmentPayload["change_target"],
    constraints: looseConstraints(source.constraints),
    affected_items: looseAffectedItems((source as any).affected_items),
  };
}

function structuredIntakeState(
  operationInput?: Record<string, unknown> | null,
): AdjustPlanIntakeState {
  const opInput = operationInput ?? {};
  const base = emptyIntakeState();
  const existingState = objectValue((opInput as any).intake_state);
  if (existingState) {
    const state = ensurePayloadMatchesScope({
      state: mergeAiStatePatch(base, existingState),
      operation_input: opInput,
    });
    if (state.scope.kind) {
      const loosePayload = loosePayloadFromOperationInput(
        state.scope.kind,
        opInput,
      );
      if (loosePayload) {
        return ensurePayloadMatchesScope({
          state: mergeAiStatePatch(state, { payload: loosePayload }),
          operation_input: opInput,
        });
      }
    }
    return state;
  }
  const scope = scopeFromOperationInput(opInput);
  if (!scope || !scope.kind) return base;
  const state: AdjustPlanIntakeState = {
    target_granularity: targetGranularityFromOperationInput(opInput) ??
      emptyTargetGranularitySlot(),
    scope,
    selected_sub_skill: scope.kind === "specific_plan_item"
      ? "action_intake"
      : scope.kind === "current_level"
      ? "level_intake"
      : scope.kind === "whole_plan"
      ? "whole_plan_intake"
      : undefined,
    payload: null,
  };
  const payload = objectValue((opInput as any).payload);
  if (payload) {
    return ensurePayloadMatchesScope({
      state: mergeAiStatePatch(state, { payload }),
      operation_input: opInput,
    });
  }
  const loosePayload = loosePayloadFromOperationInput(scope.kind, opInput);
  if (loosePayload) {
    return ensurePayloadMatchesScope({
      state: mergeAiStatePatch(state, { payload: loosePayload }),
      operation_input: opInput,
    });
  }
  return state;
}

export function runAdjustPlanScopeRouterSubSkill(input: {
  message: string;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
}): {
  target_granularity: TargetGranularitySlot;
  scope: AdjustPlanScopeSlot;
  trace: AdjustPlanSubSkillTrace;
} {
  const opInput = input.operation_input ?? {};
  const targetGranularity = targetGranularityFromOperationInput(opInput) ??
    emptyTargetGranularitySlot();
  const scope = scopeFromOperationInput(opInput) ?? emptyScopeSlot();
  const missing = scope.status === "identified" && scope.kind ? [] : ["scope"];
  return {
    target_granularity: targetGranularity,
    scope,
    trace: {
      sub_skill_id: "scope_router",
      status: missing.length ? "needs_clarification" : "ready",
      reason_code: missing.length
        ? "scope_missing_or_ambiguous"
        : "scope_ready",
      missing_slots: missing,
    },
  };
}

export function runAdjustPlanActionSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): {
  payload: ActionAdjustmentPayload;
  trace: AdjustPlanSubSkillTrace;
} {
  const state = structuredIntakeState(input.operation_input);
  const payload = state.payload?.scope_kind === "specific_plan_item"
    ? state.payload
    : emptyActionPayload();
  const missing = [];
  if (payload.action_request_category?.status === "missing") {
    missing.push("specific_plan_item.action_request_category");
  }
  if (payload.adjustment_type.status === "missing") {
    missing.push("specific_plan_item.adjustment_type");
  }
  if (payload.reason.status === "missing") {
    missing.push("specific_plan_item.reason");
  }
  return {
    payload,
    trace: {
      sub_skill_id: "action_intake",
      status: missing.length ? "needs_clarification" : "ready",
      reason_code: missing.length ? "action_slots_missing" : "action_ready",
      missing_slots: missing,
    },
  };
}

export function runAdjustPlanLevelSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): {
  payload: LevelAdjustmentPayload;
  trace: AdjustPlanSubSkillTrace;
} {
  const state = structuredIntakeState(input.operation_input);
  const payload = state.payload?.scope_kind === "current_level"
    ? state.payload
    : emptyLevelPayload();
  const missing = [];
  if (payload.level_request_category?.status === "missing") {
    missing.push("current_level.level_request_category");
  }
  if (payload.adjustment_type.status === "missing") {
    missing.push("current_level.adjustment_type");
  }
  if (payload.reason_change.status === "missing") {
    missing.push("current_level.reason_change");
  }
  if (payload.change_target.status === "missing") {
    missing.push("current_level.change_target");
  }
  return {
    payload,
    trace: {
      sub_skill_id: "level_intake",
      status: missing.length ? "needs_clarification" : "ready",
      reason_code: missing.length ? "level_slots_missing" : "level_ready",
      missing_slots: missing,
    },
  };
}

export function runAdjustPlanWholePlanSubSkill(input: {
  message: string;
  operation_input?: Record<string, unknown> | null;
}): {
  payload: WholePlanAdjustmentPayload;
  trace: AdjustPlanSubSkillTrace;
} {
  const state = structuredIntakeState(input.operation_input);
  const payload = state.payload?.scope_kind === "whole_plan"
    ? state.payload
    : emptyWholePlanPayload();
  const missing = [];
  if (payload.adjustment_type.status === "missing") {
    missing.push("whole_plan.adjustment_type");
  }
  if (payload.reason_change.status === "missing") {
    missing.push("whole_plan.reason_change");
  }
  if (payload.change_target.status === "missing") {
    missing.push("whole_plan.change_target");
  }
  return {
    payload,
    trace: {
      sub_skill_id: "whole_plan_intake",
      status: missing.length ? "needs_clarification" : "ready",
      reason_code: missing.length
        ? "whole_plan_slots_missing"
        : "whole_plan_ready",
      missing_slots: missing,
    },
  };
}

function intakeState(input: {
  message: string;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
}): AdjustPlanIntakeState {
  return structuredIntakeState(input.operation_input);
}

function ensurePayloadMatchesScope(input: {
  state: AdjustPlanIntakeState;
  operation_input?: Record<string, unknown> | null;
}): AdjustPlanIntakeState {
  const state = input.state;
  if (state.scope.status !== "identified" || !state.scope.kind) return state;
  if (
    state.scope.kind === "specific_plan_item" &&
    state.payload?.scope_kind === "specific_plan_item"
  ) return { ...state, selected_sub_skill: "action_intake" };
  if (
    state.scope.kind === "current_level" &&
    state.payload?.scope_kind === "current_level"
  ) return { ...state, selected_sub_skill: "level_intake" };
  if (
    state.scope.kind === "whole_plan" &&
    state.payload?.scope_kind === "whole_plan"
  ) return { ...state, selected_sub_skill: "whole_plan_intake" };
  if (state.scope.kind === "specific_plan_item") {
    return { ...state, selected_sub_skill: "action_intake", payload: null };
  }
  if (state.scope.kind === "current_level") {
    return { ...state, selected_sub_skill: "level_intake", payload: null };
  }
  return { ...state, selected_sub_skill: "whole_plan_intake", payload: null };
}

function missingSlots(state: AdjustPlanIntakeState): string[] {
  if (state.scope.status !== "identified") return ["scope"];
  if (!state.payload) return ["payload"];
  const missing = [];
  if (state.payload.adjustment_type.status === "missing") {
    missing.push(`${state.payload.scope_kind}.adjustment_type`);
  }
  if (
    state.payload.scope_kind === "specific_plan_item" &&
    state.payload.action_request_category?.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.action_request_category`);
  }
  if (
    state.payload.scope_kind === "current_level" &&
    state.payload.level_request_category?.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.level_request_category`);
  }
  if (
    state.payload.scope_kind === "specific_plan_item" &&
    state.payload.reason.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.reason`);
  }
  if (
    state.payload.scope_kind !== "specific_plan_item" &&
    state.payload.reason_change.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.reason_change`);
  }
  if (
    state.payload.scope_kind !== "specific_plan_item" &&
    state.payload.change_target.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.change_target`);
  }
  if (
    state.payload.scope_kind !== "specific_plan_item" &&
    state.payload.affected_items.status === "missing"
  ) {
    missing.push(`${state.payload.scope_kind}.affected_items`);
  }
  return missing;
}

function subSkillTraceForState(
  state: AdjustPlanIntakeState,
  missing: string[],
): AdjustPlanSubSkillTrace[] {
  const traces: AdjustPlanSubSkillTrace[] = [{
    sub_skill_id: "scope_router",
    status: state.scope.status === "identified" && state.scope.kind
      ? "ready"
      : "needs_clarification",
    reason_code: state.scope.status === "identified" && state.scope.kind
      ? "scope_ready"
      : "scope_missing_or_ambiguous",
    missing_slots: state.scope.status === "identified" && state.scope.kind
      ? []
      : ["scope"],
  }];
  const selected = state.selected_sub_skill;
  for (
    const subSkill of [
      "action_intake",
      "level_intake",
      "whole_plan_intake",
    ] as const
  ) {
    if (selected !== subSkill) {
      traces.push({
        sub_skill_id: subSkill,
        status: "skipped",
        reason_code: selected
          ? `scope_selected_${selected}`
          : "scope_not_ready",
        missing_slots: [],
      });
      continue;
    }
    const ownMissing = missing.filter((slot) =>
      subSkill === "action_intake"
        ? slot.startsWith("specific_plan_item.")
        : subSkill === "level_intake"
        ? slot.startsWith("current_level.")
        : slot.startsWith("whole_plan.")
    );
    traces.push({
      sub_skill_id: subSkill,
      status: ownMissing.length ? "needs_clarification" : "ready",
      reason_code: ownMissing.length
        ? `${subSkill}_slots_missing`
        : `${subSkill}_ready`,
      missing_slots: ownMissing,
    });
  }
  return traces;
}

function currentSubSkillForState(
  state: AdjustPlanIntakeState | undefined,
  missing: string[],
  fallback: AdjustPlanSubSkillId = "scope_router",
): AdjustPlanSubSkillId {
  if (!state || state.scope.status !== "identified" || !state.scope.kind) {
    return "scope_router";
  }
  if (
    missing.some((slot) =>
      slot === "materialized_changed_items" ||
      slot.startsWith("draft_") ||
      slot.includes("draft")
    )
  ) {
    return "draft_validation";
  }
  if (missing.length > 0) {
    return state.selected_sub_skill ?? fallback;
  }
  return "draft_validation";
}

function toolSkillState(args: {
  status: AdjustPlanToolSkillState["status"];
  state?: AdjustPlanIntakeState;
  missing: string[];
  trace: AdjustPlanSubSkillTrace[];
  draftValidation?: DraftReviewState;
  summary: string;
  coachingGuidance?: AdjustPlanCoachGuidance | null;
  coachingGuidanceAudit?: AdjustPlanCoachGuidanceAudit | null;
}): AdjustPlanToolSkillState {
  const confidence = args.draftValidation?.status === "valid"
    ? "high"
    : args.missing.length === 0
    ? "medium"
    : "low";
  return {
    status: args.status,
    current_sub_skill: currentSubSkillForState(args.state, args.missing),
    stage_order: ADJUST_PLAN_STAGE_ORDER,
    intake_state: args.state,
    missing_slots: args.missing,
    confidence,
    sub_skill_trace: args.trace,
    conversation_summary: args.summary,
    coaching_guidance: args.coachingGuidance ?? args.state?.coaching_guidance ??
      null,
    coaching_guidance_audit: args.coachingGuidanceAudit ?? null,
    draft_validation: args.draftValidation,
  };
}

function coachScopeForState(
  state: AdjustPlanIntakeState,
): "action" | "level" | "whole_plan" | null {
  if (state.scope.kind === "specific_plan_item") return "action";
  if (state.scope.kind === "current_level") return "level";
  if (state.scope.kind === "whole_plan") return "whole_plan";
  return null;
}

async function enrichStateWithCoachGuidance(input: {
  state: AdjustPlanIntakeState;
  coach_guidance_runner?: AdjustPlanCoachGuidanceRunner | null;
  force_coach_guidance?: boolean;
  user_id: string;
  request_id: string;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
}): Promise<{
  state: AdjustPlanIntakeState;
  guidance: AdjustPlanCoachGuidance | null;
  audit: AdjustPlanCoachGuidanceAudit;
  error?: string | null;
}> {
  const scope = coachScopeForState(input.state);
  if (!scope) {
    return {
      state: input.state,
      guidance: null,
      audit: { status: "not_run", scope: null, source: "disabled" },
    };
  }
  const runner = input.coach_guidance_runner ??
    (input.force_coach_guidance || shouldUseAdjustPlanCoachGuidance()
      ? generateAdjustPlanCoachGuidance
      : null);
  if (!runner) {
    return {
      state: input.state,
      guidance: null,
      audit: { status: "not_run", scope, source: "disabled" },
    };
  }
  try {
    const guidance = await runner({
      user_id: input.user_id,
      request_id: input.request_id,
      scope,
      message: input.message,
      recent_messages: input.recent_messages ?? [],
      plan_snapshot: input.plan_snapshot,
      current_state: input.state,
      operation_input: input.operation_input,
    });
    if (!guidance) {
      return {
        state: input.state,
        guidance: null,
        audit: { status: "empty", scope, source: "runner" },
      };
    }
    return {
      state: { ...input.state, coaching_guidance: guidance },
      guidance,
      audit: { status: "generated", scope, source: "runner" },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: input.state,
      guidance: null,
      audit: { status: "error", scope, source: "runner", error: message },
      error: message,
    };
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function mergeSlotObject<T extends Record<string, unknown>>(
  base: T,
  patch: unknown,
): T {
  const patchObj = objectValue(patch);
  if (!patchObj) return base;
  return { ...base, ...patchObj } as T;
}

function mergeEvidenceSlot<
  T extends {
    status: string;
    evidence: string[];
    value?: unknown;
  },
>(
  base: T,
  patch: unknown,
  validValues: readonly string[],
): T {
  const patchObj = objectValue(patch);
  if (!patchObj) return base;
  const status = patchObj.status === "identified" ||
      patchObj.status === "missing" ||
      patchObj.status === "ambiguous"
    ? String(patchObj.status)
    : base.status;
  const next: Record<string, unknown> = {
    ...base,
    status,
    evidence: stringList(patchObj.evidence).length
      ? stringList(patchObj.evidence)
      : base.evidence,
  };
  const value = String(patchObj.value ?? "").trim();
  if (validValues.includes(value)) next.value = value;
  return next as T;
}

function mergeAiStatePatch(
  base: AdjustPlanIntakeState,
  patch: unknown,
): AdjustPlanIntakeState {
  const root = objectValue(patch);
  if (!root) return base;
  const next: AdjustPlanIntakeState = {
    ...base,
    target_granularity: { ...base.target_granularity },
    scope: { ...base.scope },
    coaching_guidance: base.coaching_guidance ?? null,
    payload: base.payload ? { ...base.payload } as any : null,
  };
  const granularity = objectValue(root.target_granularity);
  if (granularity) {
    next.target_granularity = {
      ...next.target_granularity,
      status: granularity.status === "identified" ||
          granularity.status === "ambiguous" ||
          granularity.status === "missing"
        ? granularity.status
        : next.target_granularity.status,
      value: normalizedTargetGranularity(granularity.value) ??
        next.target_granularity.value,
      confidence: granularity.confidence === "low" ||
          granularity.confidence === "medium" ||
          granularity.confidence === "high"
        ? granularity.confidence
        : next.target_granularity.confidence,
      evidence: stringList(granularity.evidence).length
        ? stringList(granularity.evidence)
        : next.target_granularity.evidence,
      negative_evidence: stringList(granularity.negative_evidence).length
        ? stringList(granularity.negative_evidence)
        : next.target_granularity.negative_evidence,
    };
  }
  const scope = objectValue(root.scope);
  if (scope) {
    const kind = normalizedScopeKind(scope.kind);
    next.scope = {
      ...next.scope,
      status: scope.status === "identified" || scope.status === "ambiguous" ||
          scope.status === "missing"
        ? scope.status
        : next.scope.status,
      kind: kind ?? next.scope.kind,
      plan_item_id: scope.plan_item_id == null
        ? next.scope.plan_item_id
        : String(scope.plan_item_id),
      label: scope.label == null ? next.scope.label : String(scope.label),
      evidence: stringList(scope.evidence).length
        ? stringList(scope.evidence)
        : next.scope.evidence,
    };
  }
  const payloadPatch = objectValue(root.payload);
  if (payloadPatch && !next.payload) {
    const scopeKind = String(payloadPatch.scope_kind ?? next.scope.kind ?? "");
    if (scopeKind === "specific_plan_item") {
      next.payload = emptyActionPayload();
    } else if (scopeKind === "current_level") {
      next.payload = emptyLevelPayload();
    } else if (scopeKind === "whole_plan") {
      next.payload = emptyWholePlanPayload();
    }
  }
  if (payloadPatch && next.payload) {
    const scopeKind = String(
      payloadPatch.scope_kind ?? next.payload.scope_kind,
    );
    if (scopeKind === next.payload.scope_kind) {
      const payload: any = mergeSlotObject(next.payload as any, payloadPatch);
      if (next.payload.scope_kind === "specific_plan_item") {
        const category: ActionRequestCategorySlot = mergeEvidenceSlot(
          (next.payload as ActionAdjustmentPayload).action_request_category ??
            { status: "missing", evidence: [] } as ActionRequestCategorySlot,
          (payloadPatch as any).action_request_category,
          [
            "feasibility_load",
            "challenge_intensity",
            "timing_duration",
            "method_format",
            "scope_focus",
            "replacement_alternative",
            "support_guardrail",
          ],
        );
        payload.action_request_category = category.value
          ? category
          : { status: "missing", evidence: category.evidence };
      }
      if (next.payload.scope_kind === "current_level") {
        const category: LevelRequestCategorySlot = mergeEvidenceSlot(
          (next.payload as LevelAdjustmentPayload).level_request_category ??
            { status: "missing", evidence: [] } as LevelRequestCategorySlot,
          (payloadPatch as any).level_request_category,
          [
            "pacing_workload",
            "difficulty_progression",
            "sequence_priority",
            "level_focus",
            "action_mix",
            "context_constraints",
            "recovery_reset",
          ],
        );
        payload.level_request_category = category.value
          ? category
          : { status: "missing", evidence: category.evidence };
      }
      payload.adjustment_type = mergeEvidenceSlot(
        (next.payload as any).adjustment_type,
        payloadPatch.adjustment_type,
        next.payload.scope_kind === "specific_plan_item"
          ? ["reduce", "clarify", "pause", "replace", "rebalance", "simplify"]
          : next.payload.scope_kind === "current_level"
          ? ["reduce_load", "change_focus", "pause_level", "rebalance"]
          : ["reduce_global_load", "change_goal", "resequence", "restart_plan"],
      );
      payload.reason = mergeEvidenceSlot(
        (next.payload as any).reason,
        payloadPatch.reason,
        next.payload.scope_kind === "specific_plan_item"
          ? ["too_heavy", "bad_fit", "too_vague", "context_changed", "fatigue"]
          : next.payload.scope_kind === "current_level"
          ? ["too_many_actions", "wrong_focus", "fatigue", "context_changed"]
          : ["too_heavy", "bad_fit", "context_changed", "too_vague"],
      );
      if (next.payload.scope_kind !== "specific_plan_item") {
        payload.reason_change = mergeEvidenceSlot(
          (next.payload as any).reason_change,
          payloadPatch.reason_change,
          [
            "too_many_actions",
            "time_or_capacity_changed",
            "energy_low",
            "priority_changed",
            "context_changed",
            "goal_changed",
            "structure_bad_fit",
          ],
        );
        payload.change_target = mergeEvidenceSlot(
          (next.payload as any).change_target,
          payloadPatch.change_target,
          [
            "entry_cost",
            "number_of_actions",
            "intensity",
            "timing",
            "focus",
            "sequence",
            "global_load",
          ],
        );
        if (next.payload.scope_kind === "whole_plan") {
          const rawFamily = objectValue(
            (payloadPatch as any).whole_plan_change_family,
          );
          const family = normalizedWholePlanChangeFamily(
            rawFamily?.value ?? (payloadPatch as any).whole_plan_change_family,
          );
          if (family) {
            payload.whole_plan_change_family = {
              status: "identified",
              value: family,
              evidence: stringList(rawFamily?.evidence).length
                ? stringList(rawFamily?.evidence)
                : ["ai_slot_filler.whole_plan_change_family"],
            };
          } else if (!payload.whole_plan_change_family) {
            payload.whole_plan_change_family = {
              status: "missing",
              evidence: [],
            };
          }
          payload.candidate_operation = normalizedWholePlanCandidateOperation(
            (payloadPatch as any).candidate_operation,
          ) ?? payload.candidate_operation ?? null;
          payload.readiness =
            normalizedWholePlanReadiness((payloadPatch as any).readiness) ??
              payload.readiness ?? null;
        }
        const affectedItems = objectValue(payloadPatch.affected_items);
        if (affectedItems) {
          payload.affected_items = {
            ...payload.affected_items,
            status: affectedItems.status === "identified"
              ? "identified"
              : payload.affected_items.status,
            values: stringList(affectedItems.values).length
              ? stringList(affectedItems.values)
              : payload.affected_items.values,
            evidence: stringList(affectedItems.evidence).length
              ? stringList(affectedItems.evidence)
              : payload.affected_items.evidence,
          };
        }
      }
      const constraints = objectValue(payloadPatch.constraints);
      if (constraints) {
        payload.constraints = {
          ...payload.constraints,
          status: constraints.status === "identified"
            ? "identified"
            : payload.constraints.status,
          values: stringList(constraints.values).length
            ? stringList(constraints.values)
            : payload.constraints.values,
          evidence: stringList(constraints.evidence).length
            ? stringList(constraints.evidence)
            : payload.constraints.evidence,
        };
      }
      next.payload = payload;
    }
  }
  if (next.scope.kind === "specific_plan_item") {
    next.selected_sub_skill = "action_intake";
  } else if (next.scope.kind === "current_level") {
    next.selected_sub_skill = "level_intake";
  } else if (next.scope.kind === "whole_plan") {
    next.selected_sub_skill = "whole_plan_intake";
  }
  return next;
}

function normalizeDraftReviewDecisionFromStatePatch(
  patch: unknown,
):
  | NonNullable<
    AdjustPlanItemOperationOutput["state_patch"]["draft_review_decision"]
  >
  | undefined {
  const root = objectValue(patch);
  const draftValidation = objectValue(root?.draft_validation) ??
    objectValue(root?.draft_review_decision) ??
    (typeof root?.decision === "string" ? root : null);
  if (!draftValidation) return undefined;
  const rawDecision = String(draftValidation.decision ?? "").trim();
  const decision = [
      "approve",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "unclear",
    ].includes(rawDecision)
    ? rawDecision as NonNullable<
      AdjustPlanItemOperationOutput["state_patch"]["draft_review_decision"]
    >["decision"]
    : "unclear";
  const rawConfidence = String(draftValidation.confidence ?? "").trim();
  const confidence = rawConfidence === "high" || rawConfidence === "medium" ||
      rawConfidence === "low"
    ? rawConfidence
    : "low";
  return {
    decision,
    confidence,
    evidence: stringList(draftValidation.evidence),
    apply_after_revision: draftValidation.apply_after_revision === true,
  };
}

function isPreValidationDetailRequest(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (/\?/.test(normalized)) return true;
  return /\b(avant\s+(?:que\s+je\s+)?valid|avant\s+validation|confirme(?:\s+moi)?|resume(?:\s+moi)?|recap(?:itule)?|recapitule|est\s+ce\s+que|tu\s+peux\s+me\s+dire|peux\s+tu\s+me\s+dire)\b/
    .test(normalized);
}

function isPreValidationQuestionOnlyRequest(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  const asksQuestion = /\?/.test(normalized) ||
    /\b(confirme(?:\s+moi)?|est\s+ce\s+que|tu\s+peux\s+me\s+dire|peux\s+tu\s+me\s+dire|resume(?:\s+moi)?|recap(?:itule)?|recapitule)\b/
      .test(normalized);
  const asksRewrite =
    /\b(ajoute|ajouter|integre|integrer|corrige|corriger|modifie|modifier|change|changer|remplace|remplacer|retire|retirer)\b/
      .test(normalized) ||
    /\b(au brouillon|dans le brouillon|dans la proposition|dans cette version|garde .*brouillon|mets .*brouillon)\b/
      .test(normalized);
  return asksQuestion && !asksRewrite;
}

function isExplicitDraftRevisionRequest(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  const mentionsDraft = /\b(brouillon|proposition|version|ajustement)\b/.test(
    normalized,
  );
  const asksRevision =
    /\b(modifie|modifier|corrige|corriger|change|changer|remplace|remplacer|ajoute|ajouter|retire|retirer|prefere|plutot|au lieu|pas .* mais)\b/
      .test(normalized);
  const reviewOnly =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'applique pas|ne l'applique pas|n'applique rien|pas encore|sans appliquer|sans l'appliquer|avant validation)\b/
      .test(normalized);
  return mentionsDraft && asksRevision && reviewOnly;
}

function userRequestsDraftRewriteWithoutApply(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  const asksRewrite =
    /\b(reformule|reformuler|reprends|reprendre|refais|refaire|propose|proposer|prepare|preparer|montre|montrer|brouillon|proposition|version)\b/
      .test(normalized);
  const forbidsApply =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'approuve pas|n'approuve|n'applique|ne l'applique|n applique|ne rien appliquer|sans appliquer|sans l'appliquer|avant validation|avant de valider|pas encore)\b/
      .test(normalized);
  return asksRewrite && forbidsApply;
}

function isStrongDraftRejectionOrCancel(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  if (
    (approvalAddsConcreteConstraintWithoutApply(message) ||
      preValidationConcreteRevisionRequest(message)) &&
    !/\b(ce n'est pas ca|c'est pas ca|pas ce brouillon|pas le bon brouillon|hors sujet)\b/
      .test(normalized)
  ) {
    return false;
  }
  if (
    /\b(annule|annuler|stop|arrete|laisse tomber|oublie|abandonne)\b/.test(
      normalized,
    )
  ) return true;
  if (
    /\b(n'applique rien|ne l'applique(?:\s+\w+)?\s+pas|n'applique(?:\s+\w+)?\s+pas|n applique rien|n applique(?:\s+\w+)?\s+pas|ne rien appliquer|sans appliquer|sans l appliquer)\b/
      .test(normalized)
  ) return true;
  if (
    /\b(ce n'est pas ca|c'est pas ca|pas ca|pas ce brouillon|ce brouillon n'est pas le bon|ce brouillon nest pas le bon|mauvais brouillon|pas le bon brouillon|hors sujet)\b/
      .test(normalized)
  ) return true;
  return false;
}

function draftReviewRejectDecision(reason: string) {
  return {
    decision: "reject" as const,
    confidence: "high" as const,
    evidence: [reason],
    apply_after_revision: false,
  };
}

function approvalAddsConcreteConstraintWithoutApply(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  const forbidsApply =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'approuve pas|n'approuve|n'applique|ne l'applique|n applique|ne rien appliquer|sans appliquer|sans l'appliquer|pas encore|avant validation|avant de valider)\b/
      .test(normalized);
  if (!/\b(oui|ok|d'accord|d accord|exactement)\b/.test(normalized)) {
    return false;
  }
  if (
    !forbidsApply &&
    /\b(applique|appliquer|valide|valider|execute|executer|fais le|tu peux le faire|maintenant)\b/
      .test(normalized)
  ) {
    return false;
  }
  return /\b(concretement|mission ponctuelle|petite habitude|protocole|puis|ensuite|avant de|avec|sans|copie conforme|exactement les memes|meme rythme|memes actions|jours|horaires)\b/
    .test(normalized);
}

function preValidationConcreteRevisionRequest(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'");
  const asksOnlyForConfirmation =
    /\b(confirme(?:\s+moi)?|est\s+ce\s+que|tu\s+peux\s+me\s+dire|peux\s+tu\s+me\s+dire)\b/
      .test(normalized);
  const asksConcreteRewrite =
    /\b(ajoute|ajouter|integre|integrer|corrige|corriger|modifie|modifier|change|changer|remplace|remplacer|retire|retirer)\b/
      .test(normalized) ||
    /\b(au brouillon|dans le brouillon|dans la proposition|dans cette version|garde .*brouillon|mets .*brouillon)\b/
      .test(normalized);
  if (asksOnlyForConfirmation && !asksConcreteRewrite) {
    return false;
  }
  const forbidsApply =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'approuve pas|n'approuve|n'applique|ne l'applique|n applique|ne rien appliquer|sans appliquer|sans l'appliquer|pas encore|avant validation|avant de valider)\b/
      .test(normalized);
  if (
    !forbidsApply &&
    /\b(applique|appliquer|valide|valider|execute|executer|tu peux valider|tu peux le faire|ok valide)\b/
      .test(normalized)
  ) {
    return false;
  }
  const hasApprovalOrContinuation =
    /\b(oui|ok|d'accord|d accord|ca me va|c est la bonne direction|bonne direction|exactement)\b/
      .test(normalized);
  const hasReviewOnly =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'approuve pas|n'applique pas|ne l'applique pas|n'applique rien|pas encore|sans appliquer|sans l'appliquer|avant validation|montre moi|montre-moi|juste la version|juste une version|brouillon)\b/
      .test(normalized);
  const hasConcreteConstraint =
    /\b(formulation|formule|version courte|critere|indicateur|repere secondaire|principal|lien preserve|comprehension mutuelle|complicite|plaisir simple|moments positifs|initiatives positives|axe central|changement d'axe|changer d'axe|sans baisser|ambitieux|moins mental|discussion.*apres|discussion de fond|retour au calme|reparation rapide|petit geste|compte autant|critere de sortie|passer a la suite|tension forte|pas avant|experience.*d'abord|observation.*ensuite|sans ajouter|pas de niveau pont|besoins simples|sujets sensibles|distincts?)\b/
      .test(normalized);
  return hasConcreteConstraint && (hasReviewOnly || hasApprovalOrContinuation);
}

function concreteRevisionImpliesWholePlan(message: string): boolean {
  const normalized = normalizeForLooseMatch(message);
  return /\b(trajectoire|plan global|suite du plan|avant la suite|avant les conversations|prochaine etape|mission ponctuelle|petite habitude|protocole|reordonner|reorganiser|direction|axe|cap|complicite|plaisir simple|critere de sortie|discussion de fond|retour au calme|reparation rapide|comprehension mutuelle|lien preserve)\b/
    .test(normalized);
}

function scopeKindFromPreviousDraft(
  previousDraft: Record<string, unknown> | null,
): "specific_plan_item" | "current_level" | "whole_plan" | null {
  const draft = objectValue((previousDraft as any)?.draft) ?? previousDraft;
  const result = objectValue((draft as any)?.adjust_plan_result);
  const rawScope = String((result as any)?.scope ?? (draft as any)?.scope ?? "")
    .trim()
    .toLowerCase();
  const rawStrategy = String((draft as any)?.execution_strategy ?? "")
    .trim()
    .toLowerCase();
  if (rawScope === "whole_plan" || rawStrategy === "whole_plan_adjustment") {
    return "whole_plan";
  }
  if (
    rawScope === "level" || rawScope === "current_level" ||
    rawStrategy === "level_adjustment"
  ) {
    return "current_level";
  }
  if (
    rawScope === "action" || rawScope === "specific_plan_item" ||
    rawStrategy === "action_adjustment"
  ) {
    return "specific_plan_item";
  }
  return null;
}

function constraintsFromPreviousDraft(
  previousDraft: Record<string, unknown> | null,
): string[] {
  if (!previousDraft) return [];
  const draft = objectValue((previousDraft as any)?.draft) ?? previousDraft;
  const patch = objectValue((draft as any)?.patch);
  return stringList((patch as any)?.constraints);
}

function wholePlanFamilyFromPreviousDraft(
  previousDraft: Record<string, unknown> | null,
): WholePlanChangeFamily | null {
  const constraints = constraintsFromPreviousDraft(previousDraft);
  for (const constraint of constraints) {
    const match = String(constraint).match(/^whole_plan_change_family:(.+)$/);
    const family = normalizedWholePlanChangeFamily(match?.[1]?.trim());
    if (family) return family;
  }
  const draft = objectValue((previousDraft as any)?.draft) ?? previousDraft;
  return normalizedWholePlanChangeFamily(
    (draft as any)?.whole_plan_change_family ??
      (draft as any)?.adjust_plan_result?.whole_plan_change_family,
  );
}

function currentWholePlanFamily(
  state: AdjustPlanIntakeState,
  message: string,
): WholePlanChangeFamily | null {
  if (
    state.scope.kind !== "whole_plan" ||
    state.payload?.scope_kind !== "whole_plan"
  ) {
    return null;
  }
  return state.payload.whole_plan_change_family?.value ??
    state.coaching_guidance?.change_family ??
    inferWholePlanFamilyFromText(message).family;
}

function seedStateForConcreteDraftRevision(input: {
  state: AdjustPlanIntakeState;
  previous_draft: Record<string, unknown> | null;
  message: string;
}): { state: AdjustPlanIntakeState; applied: boolean } {
  if (input.state.scope.status === "identified" && input.state.scope.kind) {
    return { state: input.state, applied: false };
  }
  const scopeKind = concreteRevisionImpliesWholePlan(input.message)
    ? "whole_plan"
    : scopeKindFromPreviousDraft(input.previous_draft);
  if (!scopeKind) return { state: input.state, applied: false };
  const targetValue = scopeKind === "specific_plan_item"
    ? "single_action"
    : scopeKind === "current_level"
    ? "current_level"
    : "whole_plan";
  const payload = scopeKind === "specific_plan_item"
    ? emptyActionPayload()
    : scopeKind === "current_level"
    ? emptyLevelPayload()
    : emptyWholePlanPayload();
  const nextState: AdjustPlanIntakeState = {
    ...input.state,
    target_granularity: {
      status: "identified",
      value: targetValue,
      confidence: "high",
      evidence: [
        ...input.state.target_granularity.evidence,
        "concrete revision of pending draft",
      ],
      negative_evidence: input.state.target_granularity.negative_evidence,
    },
    scope: {
      status: "identified",
      kind: scopeKind,
      evidence: [
        ...input.state.scope.evidence,
        "concrete revision of pending draft",
      ],
      ...(scopeKind === "specific_plan_item"
        ? { plan_item_id: undefined, label: undefined }
        : {}),
    } as AdjustPlanScopeSlot,
    selected_sub_skill: scopeKind === "specific_plan_item"
      ? "action_intake"
      : scopeKind === "current_level"
      ? "level_intake"
      : "whole_plan_intake",
    payload,
  };
  return { state: nextState, applied: true };
}

async function fillStateWithAiIfAvailable(input: {
  base_state: AdjustPlanIntakeState;
  slot_filler?: AdjustPlanSlotFiller | null;
  force_ai_slot_filling?: boolean;
  user_id: string;
  request_id: string;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
}): Promise<{
  state: AdjustPlanIntakeState;
  ai_trace?: AdjustPlanSubSkillTrace;
  next_question?: string | null;
  draft_review_decision?: NonNullable<
    AdjustPlanItemOperationOutput["state_patch"]["draft_review_decision"]
  >;
}> {
  const hasPreviousDraft = Boolean(
    objectValue((input.operation_input as any)?.previous_draft),
  );
  if (missingSlots(input.base_state).length === 0 && !hasPreviousDraft) {
    return { state: input.base_state };
  }
  const filler = input.slot_filler ??
    (input.force_ai_slot_filling || shouldUseAdjustPlanAiSlotFiller()
      ? fillAdjustPlanSlotsWithAi
      : null);
  if (!filler) return { state: input.base_state };
  // Build the projected AllowedAdjustmentSet so the slot filler prompt
  // can constrain its proposals to items that are actually editable.
  // When the scope is not yet identified the projection is null and the
  // AI works against the raw plan_snapshot for scope routing only.
  const allowedSetForAi = buildAllowedSetForState(
    input.base_state,
    input.plan_snapshot,
  );
  const allowedCandidatesForAi = allowedSetForAi
    ? projectAllowedSetForAi(allowedSetForAi)
    : null;
  try {
    const filled = await filler({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages ?? [],
      plan_snapshot: input.plan_snapshot,
      current_state: input.base_state,
      operation_input: input.operation_input,
      allowed_candidates: allowedCandidatesForAi,
    });
    if (!filled) return { state: input.base_state };
    const ensured = ensurePayloadMatchesScope({
      state: mergeAiStatePatch(input.base_state, filled.state_patch),
      operation_input: input.operation_input,
    });
    const state = mergeAiStatePatch(ensured, filled.state_patch);
    return {
      state,
      ai_trace: {
        sub_skill_id: filled.current_sub_skill,
        status: filled.missing_slots.length ? "needs_clarification" : "ready",
        reason_code: "ai_slot_filler",
        missing_slots: filled.missing_slots,
      },
      next_question: filled.next_question ?? null,
      draft_review_decision: normalizeDraftReviewDecisionFromStatePatch(
        filled.state_patch,
      ),
    };
  } catch (error) {
    throw error;
  }
}

export function runAdjustPlanDraftValidationSubSkill(input: {
  draft: PlanAdjustmentDraftV1;
}): {
  reason_code: string | null;
  trace: AdjustPlanSubSkillTrace;
  review: DraftReviewState;
} {
  const issues: string[] = [];
  const materialization = planAdjustmentMaterializationBlockReason(input.draft);
  if (materialization) issues.push(materialization);
  const result = input.draft.draft.adjust_plan_result;
  const changed = result?.applied_change?.changed_items ?? [];
  const scope = result?.scope;
  const patchConstraints = Array.isArray(input.draft.draft.patch?.constraints)
    ? input.draft.draft.patch.constraints.map((constraint) =>
      String(constraint ?? "").trim()
    ).filter(Boolean)
    : [];
  const allowsSingleLevelDraft = scope === "level" &&
    patchConstraints.includes("strict_affected_items_only") &&
    patchConstraints.filter((constraint) =>
        constraint.startsWith("affected_item:")
      ).length === 1;
  if (scope !== "action" && !allowsSingleLevelDraft && changed.length < 2) {
    issues.push("draft_examples_insufficient");
  }
  if (scope === "level" && result?.boundaries?.global_plan_impact !== "none") {
    issues.push("level_draft_touches_global_plan");
  }
  if (scope === "whole_plan") {
    const family = patchConstraints.find((constraint) =>
      constraint.startsWith("whole_plan_change_family:")
    );
    const readiness = patchConstraints.find((constraint) =>
      constraint.startsWith("whole_plan_readiness:")
    );
    if (!family) issues.push("whole_plan_change_family_missing");
    if (readiness === "whole_plan_readiness:diagnose") {
      issues.push("whole_plan_diagnostic_not_draft_ready");
    }
  }
  if (!input.draft.confirmation_message?.trim()) {
    issues.push("draft_confirmation_message_missing");
  }
  const status: DraftReviewState["status"] = issues.length
    ? "needs_revision"
    : "valid";
  const reasonCode = issues[0] ?? null;
  const review: DraftReviewState = {
    status,
    issues,
    required_revision: issues.length
      ? "Regenerate the draft with concrete examples, clean user-facing wording, and strict scope boundaries."
      : null,
    user_ready_review_message: status === "valid"
      ? input.draft.confirmation_message
      : null,
  };
  return {
    reason_code: reasonCode,
    review,
    trace: {
      sub_skill_id: "draft_validation",
      status: reasonCode ? "needs_clarification" : "ready_for_confirmation",
      reason_code: reasonCode ?? "draft_ready_for_confirmation",
      missing_slots: reasonCode ? issues : [],
    },
  };
}

function isPlanAdjustmentDraftContractError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [
    "confirmation_message_",
    "execution_message_",
    "adjust_plan_result_",
    "adjust_plan_scope_",
    "user_message_",
  ].some((prefix) => message.startsWith(prefix));
}

function planQuestionContext(planSnapshot: unknown): string {
  const titles = planItems(planSnapshot).slice(0, 4).map((item) => item.title)
    .filter(Boolean);
  if (!titles.length) return "";
  return ` Je vois notamment dans le plan: ${titles.join(", ")}.`;
}

function nextQuestion(
  state: AdjustPlanIntakeState,
  planSnapshot: unknown,
): string {
  if (state.scope.status !== "identified") {
    return "Tu veux ajuster une action precise, le niveau actuel, ou le plan dans son ensemble ?";
  }
  const context = planQuestionContext(planSnapshot);
  if (
    state.payload?.scope_kind === "current_level" &&
    (state.payload.reason_change.status === "missing" ||
      state.payload.change_target.status === "missing")
  ) {
    return `Avant de modifier ce niveau, qu'est-ce qui le rend trop lourd concretement, et quoi faut-il changer en premier: automatiser le choix, simplifier l'environnement direct, changer le moment de decision, ou preserver une action ?${context}`;
  }
  if (
    state.payload?.scope_kind === "whole_plan" &&
    (state.payload.reason_change.status === "missing" ||
      state.payload.change_target.status === "missing")
  ) {
    return `Avant de toucher au plan global, quel est le vrai reason_change et quelle cible faut-il modifier: nombre de missions, intensite/frequence, ordre, ou charge globale ? Qu'est-ce qu'il faut absolument preserver ?${context}`;
  }
  if (state.payload?.scope_kind === "current_level") {
    return "Tu veux alléger la charge en automatisant le choix, simplifier l'environnement direct, changer le moment de décision, ou préserver une action en particulier ?";
  }
  if (state.payload?.scope_kind === "whole_plan") {
    return "Tu veux réduire la charge globale, ralentir la progression, réordonner le plan, ou préserver certaines parties en priorité ?";
  }
  return "Tu veux plutôt réduire l'effort d'entrée, clarifier l'action, la remplacer, ou la rééquilibrer ?";
}

async function nextQuestionForToolSkill(input: {
  state: AdjustPlanIntakeState;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
  missing_slots: string[];
  generated_question?: string | null;
  question_writer?: AdjustPlanQuestionWriter | null;
  force_ai_slot_filling?: boolean;
  user_id: string;
  request_id: string;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  reason_code?: string | null;
  draft?: unknown;
}): Promise<string> {
  const shouldUseAi = input.question_writer || input.force_ai_slot_filling ||
    shouldUseAdjustPlanAiSlotFiller();
  const direct = input.generated_question?.trim();
  if (direct && !shouldUseAi) return direct;
  if (shouldUseAi) {
    const writer = input.question_writer ?? writeAdjustPlanNextQuestionWithAi;
    const generated = await writer({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages ?? [],
      plan_snapshot: input.plan_snapshot,
      current_state: input.state,
      operation_input: input.operation_input,
      missing_slots: input.missing_slots,
      reason_code: input.reason_code,
      draft: input.draft,
    });
    const question = generated?.trim();
    if (question) return question;
    if (input.force_ai_slot_filling || shouldUseAdjustPlanAiSlotFiller()) {
      throw new Error("adjust_plan_question_writer_empty");
    }
  }
  return nextQuestion(input.state, input.plan_snapshot);
}

function generatorAdjustmentType(
  payload: NonNullable<AdjustPlanIntakeState["payload"]>,
): PlanAdjustmentGeneratorInput["adjustment_type"] {
  if (payload.scope_kind === "specific_plan_item") {
    return payload.adjustment_type.value ?? "rebalance";
  }
  if (payload.scope_kind === "current_level") {
    const value = payload.adjustment_type.value;
    if (value === "reduce_load") return "reduce";
    if (value === "pause_level") return "pause";
    return "rebalance";
  }
  const value = payload.adjustment_type.value;
  if (value === "reduce_global_load") return "reduce";
  if (value === "change_goal" || value === "restart_plan") return "replace";
  return "rebalance";
}

function generatorReason(
  payload: NonNullable<AdjustPlanIntakeState["payload"]>,
  message: string,
): PlanAdjustmentGeneratorInput["reason"] {
  const value = payload.reason.value;
  const mapped = value === "too_many_actions"
    ? "too_heavy"
    : value === "wrong_focus"
    ? "bad_fit"
    : value ?? "context_changed";
  return {
    type: mapped as PlanAdjustmentGeneratorInput["reason"]["type"],
    evidence: payload.reason.evidence.length
      ? payload.reason.evidence
      : [message],
  };
}

function generatorReasonChange(
  payload: NonNullable<AdjustPlanIntakeState["payload"]>,
): PlanAdjustmentGeneratorInput["reason_change"] | undefined {
  if (payload.scope_kind === "specific_plan_item") return undefined;
  if (payload.reason_change.status !== "identified") return undefined;
  return {
    type: payload.reason_change.value ?? "context_changed",
    evidence: payload.reason_change.evidence,
  };
}

function generatorChangeTarget(
  payload: NonNullable<AdjustPlanIntakeState["payload"]>,
): PlanAdjustmentGeneratorInput["change_target"] | undefined {
  if (payload.scope_kind === "specific_plan_item") {
    return { value: "entry_cost", evidence: ["action.reduce_entry_cost"] };
  }
  if (payload.change_target.status !== "identified") return undefined;
  return {
    value: payload.change_target.value ?? "global_load",
    evidence: payload.change_target.evidence,
  };
}

function generatorDecisionBasis(
  state: AdjustPlanIntakeState,
  message: string,
): PlanAdjustmentGeneratorInput["decision_basis"] {
  const payload = state.payload;
  const scopeLabel = state.scope.label ??
    (state.scope.kind === "current_level" ? "niveau actuel" : "plan global");
  const evidence = [
    message,
    ...(state.scope.evidence ?? []),
    ...(payload?.adjustment_type.evidence ?? []),
    ...(payload?.reason.evidence ?? []),
    ...(payload && payload.scope_kind !== "specific_plan_item"
      ? [
        ...payload.reason_change.evidence,
        ...payload.change_target.evidence,
      ]
      : []),
  ].filter(Boolean);
  const constraintValues = Array.isArray(payload?.constraints?.values)
    ? payload?.constraints?.values
    : [];
  const normalizedConstraints = constraintValues.map((constraint) =>
    normalizeForLooseMatch(String(constraint ?? ""))
  );
  const copyForwardRequested = payload?.scope_kind === "current_level" &&
    normalizedConstraints.some((constraint) =>
      constraint === "extend current level same plan" ||
      constraint === "copy forward level one week" ||
      constraint === "preserve action content" ||
      constraint === "preserve cadence"
    );
  const mustPreserve = constraintValues.includes(
      "preserve_plan_intent",
    )
    ? ["intention du plan"]
    : [];
  if (payload?.scope_kind === "specific_plan_item") {
    return {
      user_problem: `${scopeLabel} bloque parce que l'entree est trop lourde.`,
      inferred_need:
        "creer un pont plus petit sans supprimer l'action complete",
      confidence: payload.reason.status === "identified" ? "high" : "medium",
      evidence,
      uncertainty: [],
      must_preserve: [
        ...mustPreserve,
        `reprendre ${scopeLabel} apres la version mini`,
      ],
    };
  }
  if (payload?.scope_kind === "current_level") {
    if (copyForwardRequested) {
      return {
        user_problem:
          "Le user veut consolider le niveau actuel une semaine de plus sans changer le contenu.",
        inferred_need:
          "prolonger le meme niveau a l'identique, sans alleger, sans changer les actions et sans changer le rythme",
        confidence: "high",
        evidence,
        uncertainty: [],
        must_preserve: [
          ...mustPreserve,
          "actions existantes",
          "rythme existant",
          "reperes du niveau actuel",
          "plan global",
        ],
      };
    }
    return {
      user_problem:
        `Le niveau actuel est trop lourd ou mal calibre pour le contexte de l'utilisateur.`,
      inferred_need:
        "preserver le coeur du niveau et reduire la charge ciblee autour",
      confidence: payload.reason_change.status === "identified" &&
          payload.change_target.status === "identified"
        ? "medium"
        : "low",
      evidence,
      uncertainty: [
        "actions exactes du niveau a choisir pour une modification fine",
      ],
      must_preserve: [...mustPreserve, "coeur du niveau"],
    };
  }
  return {
    user_problem:
      "Le plan global n'est plus assez tenable dans le contexte actuel.",
    inferred_need:
      "garder la direction du plan et reduire la charge globale ciblee",
    confidence: payload?.scope_kind === "whole_plan" &&
        payload.reason_change.status === "identified" &&
        payload.change_target.status === "identified"
      ? "medium"
      : "low",
    evidence,
    uncertainty: ["semaines ou blocs exacts a affiner ensuite"],
    must_preserve: [...mustPreserve, "direction globale du plan"],
  };
}

function generatorScope(
  state: AdjustPlanIntakeState,
): PlanAdjustmentGeneratorInput["scope"] {
  const label = state.scope.label ??
    (state.scope.kind === "current_level" ? "niveau actuel" : "plan global");
  return {
    kind: state.scope.kind === "current_level"
      ? "current_level" as any
      : state.scope.kind!,
    plan_item_id: state.scope.plan_item_id ?? null,
    title: label,
    current_summary: label,
  };
}

function operationInputFromIntakeState(
  state: AdjustPlanIntakeState,
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  const label = state.scope.label ??
    (state.scope.kind === "current_level"
      ? "niveau actuel"
      : state.scope.kind === "whole_plan"
      ? "plan global"
      : null);
  const scope = state.scope.status === "identified" && state.scope.kind
    ? {
      kind: state.scope.kind === "current_level"
        ? "current_level"
        : state.scope.kind,
      plan_item_id: state.scope.plan_item_id ?? null,
      title: label,
      current_summary: label,
      label,
      evidence: state.scope.evidence,
    }
    : (operationInput as any)?.scope;
  return {
    ...(operationInput ?? {}),
    target_granularity: state.target_granularity,
    scope,
    intake_state: state,
    payload: state.payload,
    coaching_guidance: state.coaching_guidance ?? null,
    adjust_plan_sub_skills: ADJUST_PLAN_SUB_SKILLS,
  };
}

function allowedPatchFields(scopeKind: ScopeKind): string[] {
  if (scopeKind === "specific_plan_item") {
    return [
      "difficulty",
      "duration_minutes",
      "instruction",
      "paused",
      "target_reps",
      "cadence_label",
    ];
  }
  if (scopeKind === "current_level") {
    return [
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
  }
  return [
    "scope_kind",
    "plan_adjustment",
    "load_adjustment",
    "goal_adjustment",
    "sequence_adjustment",
    "reason_type",
    "reason_change",
    "change_target",
    "confidence",
    "constraints",
  ];
}

/**
 * Filter the AI's free-text affected_items list to those that the
 * current_level permission matrix accepts. This is a thin wrapper around
 * the candidate builder so the runtime keeps a single source of truth
 * for editability decisions.
 *
 * The AI is invited (via the slot filler input) to only propose items
 * from the editable set, but we still defend against drift here so the
 * generator never receives a constraint pointing at a forbidden item.
 */
function editableAffectedItemValuesForCurrentLevel(
  values: string[],
  planSnapshot: unknown,
): string[] {
  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot,
    scope_kind: "current_level",
    signals: {
      user_explicitly_named_titles: values,
    },
  });
  const editableTitles = allowed.editable_items.map((item) =>
    item.title.toLowerCase().trim()
  );
  return values.filter((value) => {
    const target = String(value ?? "").toLowerCase().trim();
    if (!target) return false;
    return editableTitles.some((title) =>
      title === target || title.includes(target) || target.includes(title)
    );
  });
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

function normalizeForLooseMatch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeForLooseMatch(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function inferWholePlanFamilyFromText(text: string): {
  family: WholePlanChangeFamily;
  operation: WholePlanCandidateOperation;
  readiness: WholePlanReadiness;
  evidence: string[];
} {
  const normalized = normalizeForLooseMatch(text);
  const evidence: string[] = [];
  const hasConcreteSolution =
    /\b(je veux|il faudrait|pour moi ca veut dire|pour moi ca signifie|concretement|concrètement|ca veut dire|ça veut dire|ajoute|ajouter|insere|inserer|remplace|remplacer|mets|mettre|propose|proposer|reformule|reformuler|fusionne|fusionner|separe|separer|d abord|puis|ensuite|avant de|avant la suite|indicateur|critere|experience|geste concret|micro experience|prevenir|prévenir|reparer|réparer|garder un petit moment positif|sans ajouter)\b/
      .test(normalized);
  const rejectsBridgeStep =
    /\b(eviter|sans|pas|pas necessaire|pas besoin|ne pas|n ajoute pas|ne l ajoute pas)\b.{0,40}\bpont\b/
      .test(normalized) ||
    /\bpont\b.{0,40}\b(pas necessaire|pas besoin|eviter|sans l ajouter|ne l ajoute pas)\b/
      .test(normalized);
  const reviewOnlyNoApply =
    /\b(ne l applique pas encore|n applique pas encore|sans appliquer|sans l appliquer|avant validation|avant de valider|brouillon)\b/
      .test(normalized);
  const noAdditionRequested =
    /\b(sans ajouter|sans ajout|ne pas ajouter|pas ajouter|n ajoute pas|ne rajoute pas|pas plus d actions|sans action supplementaire|sans actions supplementaires)\b/
      .test(normalized);
  const transitionCriterionSignal =
    /\b(critere de passage|regle de passage|seuil de passage|frontiere|marche|passage aux sujets sensibles|deux fois d affilee|2 fois d affilee|deux demandes simples|2 demandes simples)\b/
      .test(normalized);
  const repairReconnectionStepSignal = (
    /\b(reconnaitre|nommer|acter|dire|dire brievement)\b.{0,100}\b(tension|dispute|ce qui s est passe|accroc|accrochage|emporte|maladresse)\b/
      .test(normalized) &&
    /\b(retour au contact|revenir au contact|retour en lien|revenir en lien|retour au lien|relancer le lien|relancer un moment de lien|geste de retour|petit geste|se remettre ensemble|reparler du fond)\b/
      .test(normalized)
  ) ||
    (
      /\b(manque une marche|ajouter une marche|ajoute une marche|mini marche|petite marche|marche pour revenir|petite etape|etape explicite|vraie etape|transition|pont|apprendre a se retrouver|se retrouver)\b/
        .test(normalized) &&
      /\b(apres un accrochage|apres accrochage|apres une dispute|apres dispute|dispute|tension|emporte|accroc|accrochage|reparler du fond)\b/
        .test(normalized)
    );
  if (
    /\b(stop|annule|annuler|n applique rien|ne l applique pas|laisse tomber|ce n est pas ca|c est pas ca|hors sujet|pas ce brouillon)\b/
      .test(normalized) && !reviewOnlyNoApply
  ) {
    return {
      family: "cancel_or_reject",
      operation: "cancel_or_revise",
      readiness: "diagnose",
      evidence: ["user rejects or cancels the pending whole-plan draft"],
    };
  }
  if (repairReconnectionStepSignal && !noAdditionRequested) {
    evidence.push("repair reconnection step signal");
    return {
      family: "missing_bridge_or_level",
      operation: "insert_phase",
      readiness: "draft_ready",
      evidence,
    };
  }
  if (
    rejectsBridgeStep &&
    /\b(separer|separation|deux niveaux|deux phases|distinct|distincts|frontiere|marche|besoins simples|sujets sensibles)\b/
      .test(normalized)
  ) {
    evidence.push("split/merge structure signal with bridge rejection");
    return {
      family: "split_merge_restructure",
      operation: "split_or_merge_phase",
      readiness: "draft_ready",
      evidence,
    };
  }
  if (
    (/\b(direction|axe|cap|trajectoire|reoriente|reorienter|reorientation|change d axe|changement d axe|axe central)\b/
      .test(normalized) &&
      /\b(complicite|plaisir simple|moments positifs|initiatives positives|initiatives de lien|lien positif|moins centre sur les disputes|eviter les disputes|reduire les disputes|eviter les tensions)\b/
        .test(normalized)) ||
    /\b(passer|passage)\b.{0,80}\b(eviter les disputes|reduire les disputes|apaisement)\b.{0,120}\b(complicite|plaisir simple|moments positifs|initiatives positives|initiatives de lien)\b/
      .test(normalized)
  ) {
    evidence.push("global direction change signal");
    return {
      family: "direction_change",
      operation: "change_emphasis",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(phase future|partie future|suite du plan|plus tard|reproches|attentes non dites|parler du fond|sujets sensibles)\b/
      .test(normalized) &&
    /\b(trop frontal|frontale|ne colle pas|pas coherent|remplace|remplacer|au lieu|reparation|reparer|retour au calme|revenir au calme|reconnaitre ce qui a aide|petite tension)\b/
      .test(normalized)
  ) {
    evidence.push("future phase mismatch signal");
    return {
      family: "future_phase_mismatch",
      operation: hasConcreteSolution ? "replace_phase" : "diagnostic_only",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(ajoute|ajouter|insere|inserer|niveau en plus|niveau court|nouveau niveau|etape intermediaire|phase intermediaire|pont|sas)\b/
      .test(normalized) &&
    !rejectsBridgeStep &&
    !noAdditionRequested
  ) {
    evidence.push("missing bridge/level signal");
    return {
      family: "missing_bridge_or_level",
      operation: "insert_phase",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    transitionCriterionSignal &&
    /\b(besoins simples|sujets sensibles|deux niveaux|deux phases|distinct|distincts|separation|separer|frontiere|marche|passage)\b/
      .test(normalized)
  ) {
    evidence.push("split/merge transition criterion signal");
    return {
      family: "split_merge_restructure",
      operation: "split_or_merge_phase",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(critere|criteres|mesure|mesurer|reussite|succes|definition de reussite|evaluer|indicateur|indicateurs|qualite du lien|comprehension mutuelle|lien preserve|lien encore present)\b/
      .test(normalized)
  ) {
    evidence.push("success criteria signal");
    return {
      family: "success_criteria_change",
      operation: "change_success_criteria",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(style|methode|methodologie|trop therapeutique|trop scolaire|trop abstrait|trop strict|pas naturel|analyse d abord|moins analyse|experience concrete|micro experience|gestes concrets|partir du vecu|concret avant|discussion apres)\b/
      .test(normalized)
  ) {
    evidence.push("style/method mismatch signal");
    return {
      family: "style_or_method_mismatch",
      operation: "change_emphasis",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(fusionne|fusionner|fusion|separe|separer|separation|split|merge|deux niveaux|deux phases|marchent dessus|se marchent dessus|repetent la meme chose|repete la meme chose|doublon|redondant|redondance)\b/
      .test(normalized)
  ) {
    evidence.push("split/merge structure signal");
    return {
      family: "split_merge_restructure",
      operation: "split_or_merge_phase",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(niveau\s*\d+|niveau quatre|niveau 4|troisieme partie|3eme partie|partie du plan|phase future|plus tard)\b/
      .test(normalized) &&
    /\b(ne fait pas sens|pas de sens|pas coherent|coherent|me va pas|ne me parle pas|bizarre)\b/
      .test(normalized)
  ) {
    evidence.push("future phase mismatch signal");
    return {
      family: "future_phase_mismatch",
      operation: hasConcreteSolution ? "replace_phase" : "diagnostic_only",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(consolider|consolidation|maintenance|tenir dans le temps|stabiliser|retomber|ca ne tient pas)\b/
      .test(normalized)
  ) {
    evidence.push("maintenance/consolidation signal");
    return {
      family: "maintenance_or_consolidation_gap",
      operation: "maintenance_layer",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(logique de performance|performance|cocher des actions|cases a reussir|chaleur|fiabilite|fiable|presence fiable|reparer vite|moment positif)\b/
      .test(normalized)
  ) {
    evidence.push("value preference conflict signal");
    return {
      family: "value_preference_conflict",
      operation: "change_emphasis",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(direction|cap|objectif|axe|orientation|plus vers|moins vers|finalement je veux|je veux plutot|complicite|fun|attention|confiance)\b/
      .test(normalized)
  ) {
    evidence.push("global direction signal");
    return {
      family: "direction_change",
      operation: "change_emphasis",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(plus pertinent|ne me parle plus|plus trop coherent|tout le plan|plan global|trajectoire globale|reconstruire|repartir)\b/
      .test(normalized)
  ) {
    evidence.push("plan relevance/coherence signal");
    return {
      family: "plan_no_longer_relevant",
      operation: hasConcreteSolution ? "replace_phase" : "diagnostic_only",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  if (
    /\b(trop vite|prochaine etape|ordre|reordonner|sequence)\b/.test(normalized)
  ) {
    evidence.push("sequence/order signal");
    return {
      family: "sequence_order_issue",
      operation: "reorder",
      readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
      evidence,
    };
  }
  return {
    family: "global_capacity_change",
    operation: "pace_change",
    readiness: hasConcreteSolution ? "draft_ready" : "diagnose",
    evidence: ["fallback whole-plan capacity/coherence signal"],
  };
}

function wholePlanFamilyConstraint(
  payload: WholePlanAdjustmentPayload | null | undefined,
  guidance: AdjustPlanCoachGuidance | null | undefined,
): string | null {
  const family = payload?.whole_plan_change_family?.value ??
    guidance?.change_family ?? null;
  return family ? `whole_plan_change_family:${family}` : null;
}

function actionRequestCategoryConstraint(
  payload: ActionAdjustmentPayload | null | undefined,
): string | null {
  const category = payload?.action_request_category?.value ?? null;
  return category ? `action_request_category:${category}` : null;
}

function levelRequestCategoryConstraint(
  payload: LevelAdjustmentPayload | null | undefined,
): string | null {
  const category = payload?.level_request_category?.value ?? null;
  return category ? `level_request_category:${category}` : null;
}

function wholePlanOperationConstraint(
  payload: WholePlanAdjustmentPayload | null | undefined,
  guidance: AdjustPlanCoachGuidance | null | undefined,
): string | null {
  const operation = payload?.candidate_operation ??
    guidance?.candidate_operation ?? null;
  return operation ? `whole_plan_candidate_operation:${operation}` : null;
}

function wholePlanReadinessConstraint(
  payload: WholePlanAdjustmentPayload | null | undefined,
  guidance: AdjustPlanCoachGuidance | null | undefined,
): string | null {
  const readiness = payload?.readiness ?? guidance?.readiness ?? null;
  return readiness ? `whole_plan_readiness:${readiness}` : null;
}

function coachGuidanceConstraints(
  guidance: AdjustPlanCoachGuidance | null | undefined,
): string[] {
  if (!guidance) return [];
  const prefixed = [
    guidance.observation ? `coach_observation:${guidance.observation}` : "",
    guidance.recommendation
      ? `coach_recommendation:${guidance.recommendation}`
      : "",
    ...guidance.warnings.map((value) => `coach_warning:${value}`),
    ...guidance.preserve.map((value) => `coach_preserve:${value}`),
    ...guidance.avoid.map((value) => `coach_avoid:${value}`),
    ...guidance.guidelines.map((value) => `coach_guideline:${value}`),
    guidance.change_family
      ? `whole_plan_change_family:${guidance.change_family}`
      : "",
    guidance.candidate_operation
      ? `whole_plan_candidate_operation:${guidance.candidate_operation}`
      : "",
    guidance.readiness ? `whole_plan_readiness:${guidance.readiness}` : "",
    guidance.must_not_execute_reason
      ? `coach_must_not_execute:${guidance.must_not_execute_reason}`
      : "",
    guidance.trajectory_hypothesis
      ? `coach_trajectory_hypothesis:${guidance.trajectory_hypothesis}`
      : "",
    guidance.next_best_question
      ? `coach_next_best_question:${guidance.next_best_question}`
      : "",
  ];
  return dedupeStrings(prefixed);
}

function transcriptUserText(input: {
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  return [
    ...(input.recent_messages ?? [])
      .filter((message) => message.role === "user")
      .map((message) => message.content),
    input.message,
  ].join("\n");
}

function textMentionsPlanTitle(text: string, title: string): boolean {
  const normalizedText = normalizeForLooseMatch(text);
  const normalizedTitle = normalizeForLooseMatch(title);
  if (!normalizedText || !normalizedTitle) return false;
  if (normalizedText.includes(normalizedTitle)) return true;
  const tokens = normalizedTitle
    .split(" ")
    .filter((token) =>
      token.length >= 4 &&
      ![
        "avec",
        "dans",
        "faire",
        "pour",
        "sans",
        "cette",
        "action",
      ].includes(token)
    );
  if (tokens.length < 2) return false;
  const matches =
    tokens.filter((token) => new RegExp(`\\b${token}\\b`).test(normalizedText))
      .length;
  return matches >= Math.min(2, tokens.length);
}

function extractDeterministicLevelConstraints(text: string): string[] {
  const normalized = normalizeForLooseMatch(text);
  const constraints: string[] = [];
  if (isCurrentLevelCopyForwardText(normalized)) {
    constraints.push("extend_current_level_same_plan");
    constraints.push("copy_forward_level_one_week");
    constraints.push("preserve_action_content");
    constraints.push("preserve_cadence");
    constraints.push("avoid_repetitive_clarification_when_user_gives_solution");
  }
  const frequencyMatch = normalized.match(
    /\b(\d+|un|une|deux|trois|quatre|cinq|six|sept)\s*(?:fois|jours?)\s*(?:\/|par)?\s*(?:semaine|sem)\b/,
  );
  if (frequencyMatch) {
    const reps = /^\d+$/.test(frequencyMatch[1])
      ? Number(frequencyMatch[1])
      : FRENCH_SMALL_NUMBERS[frequencyMatch[1]];
    if (Number.isFinite(reps) && reps > 0) {
      constraints.push(`${reps} jours / semaine`);
      constraints.push(`frequency_change:${reps}_weekly`);
      constraints.push("user_explicit_frequency_change");
    }
  }
  if (/\bphrase\s+neutre\b/.test(normalized)) {
    constraints.push("instruction:phrase neutre");
  } else if (/\bphrase\s+simple\b/.test(normalized)) {
    constraints.push("instruction:phrase simple");
  }
  if (/\bmot\b/.test(normalized) && /\bgeste\b/.test(normalized)) {
    constraints.push("instruction:un mot ou un geste simple");
  }
  const durationMatch = normalized.match(/\b(\d{1,2})\s*minutes?\b/);
  if (durationMatch) {
    constraints.push(`duration:${durationMatch[1]} minutes`);
    constraints.push(`duration_minutes:${durationMatch[1]}`);
  }
  if (/\bpause\b/.test(normalized) && /\bsans\s+technique\b/.test(normalized)) {
    constraints.push(
      "instruction:Pause de 2 minutes sans technique, puis noter l'état en mots simples",
    );
  }
  if (
    /\bsans\s+(?:creneau|horaire|moment)\b/.test(normalized) ||
    /\bmoment\s+libre\b/.test(normalized) ||
    /\bquand\s+(?:ca|ça)\s+se\s+presente\b/.test(normalized)
  ) {
    constraints.push("timing:moment libre, sans créneau fixe");
  }
  if (
    /\bcartograph/.test(normalized) &&
    /\binchang|ne\s+change\s+pas|garde/.test(normalized)
  ) {
    constraints.push("preserve:Cartographier les déclencheurs");
  }
  return constraints;
}

function isCurrentLevelCopyForwardText(normalizedText: string): boolean {
  const text = normalizeForLooseMatch(normalizedText);
  if (!text) return false;
  const mentionsCurrentLevel =
    /\b(niveau actuel|ce niveau|meme niveau|mêmes niveau|niveau)\b/.test(text);
  const mentionsSameWeekOrContent =
    /\b(meme semaine|memes semaines|refaire la meme|refaire pareil|meme contenu|memes actions?|meme actions?|copie conforme|a l identique|identique)\b/
      .test(text);
  const mentionsExtension =
    /\b(semaine de plus|une semaine de plus|prolonge|prolonger|prolongation|garder|maintenir|consolider|copie conforme|refaire|rejouer)\b/
      .test(text);
  const asksSame =
    /\b(copie conforme|a l identique|identique|exactement pareil|exactement les memes|exactement le meme|meme semaine|meme contenu|meme actions?|memes actions?|meme rythme|memes reperes|meme jours?|memes jours?|meme horaires?|memes horaires?)\b/
      .test(text);
  const forbidsChange =
    /\b(sans changer|ne change pas|ne touche pas|sans modifier|pas alleger|pas allege|ni le rythme|ni les actions?|sans augmenter)\b/
      .test(text);
  return (mentionsCurrentLevel || mentionsSameWeekOrContent) &&
    mentionsExtension &&
    (asksSame || forbidsChange);
}

function messageRestrictsToMentionedItemsOnly(text: string): boolean {
  const normalized = normalizeForLooseMatch(text);
  if (!normalized) return false;
  const hasOnlySignal = /\b(seulement|uniquement|juste|strictement)\b/.test(
    normalized,
  );
  const hasPreserveRestSignal =
    /\b(sans\s+toucher\s+(?:au\s+)?reste|garde(?:r)?\s+le\s+reste\s+inchange|reste\s+inchange|ne\s+touche\s+pas\s+au\s+reste|ne\s+change\s+pas\s+le\s+reste)\b/
      .test(normalized);
  return hasOnlySignal || hasPreserveRestSignal;
}

function pendingDraftHasChangeOutsideLatestRestrictedItems(
  draftValue: Record<string, unknown> | null,
  message: string,
): boolean {
  if (!draftValue || !messageRestrictsToMentionedItemsOnly(message)) {
    return false;
  }
  const changedItems = Array.isArray(
      (draftValue as any)?.draft?.adjust_plan_result?.applied_change
        ?.changed_items,
    )
    ? (draftValue as any).draft.adjust_plan_result.applied_change.changed_items
    : [];
  const changedTitles: string[] = changedItems
    .map((item: any) => String(item?.title ?? "").trim())
    .filter(Boolean);
  if (changedTitles.length < 2) return false;
  const mentionedChangedTitles = changedTitles.filter((title) =>
    textMentionsPlanTitle(message, title)
  );
  return mentionedChangedTitles.length > 0 &&
    mentionedChangedTitles.length < changedTitles.length;
}

function completeCurrentLevelStateFromTranscript(input: {
  state: AdjustPlanIntakeState;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
}): { state: AdjustPlanIntakeState; applied: boolean; evidence: string[] } {
  const payload = input.state.payload;
  if (
    input.state.scope.kind !== "current_level" ||
    payload?.scope_kind !== "current_level"
  ) {
    return { state: input.state, applied: false, evidence: [] };
  }
  const text = transcriptUserText(input);
  const normalized = normalizeForLooseMatch(text);
  if (!normalized) return { state: input.state, applied: false, evidence: [] };

  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: input.plan_snapshot,
    scope_kind: "current_level",
    signals: extractAdjustSignalsFromState(input.state),
  });
  const latestTextRestrictsAffectedOnly = messageRestrictsToMentionedItemsOnly(
    input.message,
  );
  const latestMentionedEditableTitles = allowed.editable_items
    .filter((item) => textMentionsPlanTitle(input.message, item.title))
    .map((item) => item.title);
  const mentionedEditableTitles = allowed.editable_items
    .filter((item) =>
      textMentionsPlanTitle(
        latestTextRestrictsAffectedOnly && latestMentionedEditableTitles.length
          ? input.message
          : text,
        item.title,
      )
    )
    .map((item) => item.title);
  const affectedValues = dedupeStrings([
    ...(latestTextRestrictsAffectedOnly && latestMentionedEditableTitles.length
      ? []
      : stringList(payload.affected_items.values)),
    ...mentionedEditableTitles,
  ]);
  const preserveRestConstraints =
    latestTextRestrictsAffectedOnly && affectedValues.length > 0
      ? [
        "strict_affected_items_only",
        ...allowed.editable_items
          .filter((item) =>
            !affectedValues.some((affected) =>
              textMentionsPlanTitle(item.title, affected)
            )
          )
          .map((item) => `preserve:${item.title}`),
      ]
      : [];
  const constraints = dedupeStrings([
    ...(latestTextRestrictsAffectedOnly && latestMentionedEditableTitles.length
      ? stringList(payload.constraints.values).filter((constraint) =>
        !String(constraint).startsWith("affected_item:")
      )
      : stringList(payload.constraints.values)),
    ...extractDeterministicLevelConstraints(
      latestTextRestrictsAffectedOnly && latestMentionedEditableTitles.length
        ? input.message
        : text,
    ),
    ...preserveRestConstraints,
  ]);
  const nextPayload: LevelAdjustmentPayload = {
    ...payload,
    level_request_category: payload.level_request_category
      ? { ...payload.level_request_category }
      : { status: "missing", evidence: [] },
    adjustment_type: { ...payload.adjustment_type },
    reason: { ...payload.reason },
    reason_change: { ...payload.reason_change },
    change_target: { ...payload.change_target },
    constraints: { ...payload.constraints },
    affected_items: { ...payload.affected_items },
  };
  const evidence: string[] = [];
  const copyForwardRequested = isCurrentLevelCopyForwardText(normalized);

  if (nextPayload.level_request_category?.status === "missing") {
    const category: LevelRequestCategory = copyForwardRequested ||
        /\b(retard|decroche|reprend|reprendre|perdu|perdue|surcharge|a la bourre)\b/
          .test(normalized)
      ? "recovery_reset"
      : /\b(ordre|priorite|d abord|commencer|sequence)\b/.test(normalized)
      ? "sequence_priority"
      : /\b(focus|centre|concentre|moins de|plus de)\b/.test(normalized)
      ? "level_focus"
      : /\b(voyage|sante|travail|budget|contexte|semaine chargee|temps)\b/
          .test(normalized)
      ? "context_constraints"
      : /\b(difficile|facile|progression|brutal|brutale)\b/.test(normalized)
      ? "difficulty_progression"
      : /\b(ajoute|retire|remplace|varie|actions)\b/.test(normalized)
      ? "action_mix"
      : "pacing_workload";
    nextPayload.level_request_category = {
      status: "identified",
      value: category,
      evidence: ["deterministic transcript level request category"],
    };
    evidence.push("level_request_category");
  }

  if (
    affectedValues.length >= 2 ||
    (latestTextRestrictsAffectedOnly && affectedValues.length === 1)
  ) {
    nextPayload.affected_items = {
      status: "identified",
      values: affectedValues,
      evidence: dedupeStrings([
        ...stringList(payload.affected_items.evidence),
        "deterministic transcript matched editable level actions",
      ]),
    };
    evidence.push("affected_items");
  }
  if (constraints.length) {
    nextPayload.constraints = {
      status: "identified",
      values: constraints,
      evidence: dedupeStrings([
        ...stringList(payload.constraints.evidence),
        "deterministic transcript constraints",
      ]),
    };
    evidence.push("constraints");
  }
  if (copyForwardRequested) {
    const allEditableTitles = allowed.editable_items
      .map((item) => item.title)
      .filter(Boolean);
    if (allEditableTitles.length) {
      nextPayload.affected_items = {
        status: "identified",
        values: dedupeStrings([
          ...stringList(nextPayload.affected_items.values),
          ...allEditableTitles,
        ]),
        evidence: dedupeStrings([
          ...stringList(nextPayload.affected_items.evidence),
          "deterministic copy-forward level anchors",
        ]),
      };
      evidence.push("affected_items");
    }
    nextPayload.adjustment_type = {
      status: "identified",
      value: "rebalance",
      evidence: dedupeStrings([
        ...stringList(nextPayload.adjustment_type.evidence),
        "deterministic copy-forward level request",
      ]),
    };
    nextPayload.reason = {
      status: "identified",
      value: "context_changed",
      evidence: dedupeStrings([
        ...stringList(nextPayload.reason.evidence),
        "user wants one more identical consolidation week",
      ]),
    };
    nextPayload.reason_change = {
      status: "identified",
      value: "time_or_capacity_changed",
      evidence: dedupeStrings([
        ...stringList(nextPayload.reason_change.evidence),
        "level needs one more week before next step",
      ]),
    };
    nextPayload.change_target = {
      status: "identified",
      value: "timing",
      evidence: dedupeStrings([
        ...stringList(nextPayload.change_target.evidence),
        "extend current level without changing actions or cadence",
      ]),
    };
    nextPayload.constraints = {
      status: "identified",
      values: dedupeStrings([
        ...stringList(nextPayload.constraints.values),
        "extend_current_level_same_plan",
        "copy_forward_level_one_week",
        "preserve_action_content",
        "preserve_cadence",
        "avoid_repetitive_clarification_when_user_gives_solution",
      ]),
      evidence: dedupeStrings([
        ...stringList(nextPayload.constraints.evidence),
        "deterministic copy-forward level request",
      ]),
    };
    evidence.push(
      "adjustment_type",
      "reason",
      "reason_change",
      "change_target",
      "constraints",
    );
  }
  if (
    nextPayload.adjustment_type.status === "missing" &&
    /\b(allege|alleger|reduit|reduire|moins|trop|pression)\b/.test(normalized)
  ) {
    nextPayload.adjustment_type = {
      status: "identified",
      value: "reduce_load",
      evidence: ["deterministic transcript reduction signal"],
    };
    evidence.push("adjustment_type");
  }
  if (
    nextPayload.reason.status === "missing" &&
    /\b(fatigu\w*|vide|epuise\w*|pression|trop)\b/.test(normalized)
  ) {
    nextPayload.reason = {
      status: "identified",
      value: "fatigue",
      evidence: ["deterministic transcript fatigue/load signal"],
    };
  }
  if (
    nextPayload.reason_change.status === "missing" &&
    /\b(fatigu\w*|vide|epuise\w*|energie|pression|trop)\b/.test(normalized)
  ) {
    nextPayload.reason_change = {
      status: "identified",
      value: "energy_low",
      evidence: ["deterministic transcript capacity signal"],
    };
    evidence.push("reason_change");
  }
  if (nextPayload.change_target.status === "missing") {
    const target = /\bcreneau|horaire|moment\b/.test(normalized)
      ? "timing"
      : /\bnombre\s+d\s+actions|moins\s+d\s+actions\b/.test(normalized)
      ? "number_of_actions"
      : /\b\d{1,2}\s*minutes?|jours?\s*(?:\/|par)?\s*semaine|fois\s*(?:\/|par)?\s*semaine|phrase|mot|geste\b/
          .test(normalized)
      ? "intensity"
      : null;
    if (target) {
      nextPayload.change_target = {
        status: "identified",
        value: target,
        evidence: ["deterministic transcript concrete change signal"],
      };
      evidence.push("change_target");
    }
  }

  const applied = evidence.length > 0;
  return applied
    ? {
      state: { ...input.state, payload: nextPayload },
      applied: true,
      evidence: dedupeStrings(evidence),
    }
    : { state: input.state, applied: false, evidence: [] };
}

function routeSingleItemLevelReplacementToAction(input: {
  state: AdjustPlanIntakeState;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
}): { state: AdjustPlanIntakeState; applied: boolean; evidence: string[] } {
  const payload = input.state.payload;
  if (
    input.state.scope.kind !== "current_level" ||
    payload?.scope_kind !== "current_level"
  ) {
    return { state: input.state, applied: false, evidence: [] };
  }

  const text = transcriptUserText(input);
  const latest = input.message;
  const normalized = normalizeForLooseMatch(latest || text);
  if (
    !/\b(remplace|remplacer|changer|change|modifie|modifier)\b/.test(
      normalized,
    ) ||
    !/\b(action|habitude|format|forme)\b/.test(normalized)
  ) {
    return { state: input.state, applied: false, evidence: [] };
  }

  const allowed = buildAllowedAdjustmentSet({
    plan_snapshot: input.plan_snapshot,
    scope_kind: "current_level",
    signals: extractAdjustSignalsFromState(input.state),
  });
  const affectedValues = stringList(payload.affected_items.values);
  const matchedItems = allowed.editable_items.filter((item) =>
    affectedValues.some((affected) =>
      textMentionsPlanTitle(item.title, affected)
    ) || textMentionsPlanTitle(latest, item.title)
  );
  const matched = matchedItems.length === 1 ? matchedItems[0] : null;
  if (!matched) {
    return { state: input.state, applied: false, evidence: [] };
  }

  const constraints = dedupeStrings([
    ...stringList(payload.constraints.values),
    ...extractDeterministicLevelConstraints(latest || text),
    "strict_affected_items_only",
    "user_explicit_replace_request",
    `affected_item:${matched.title}`,
  ]);
  const nextState: AdjustPlanIntakeState = {
    ...input.state,
    target_granularity: {
      status: "identified",
      value: "single_action",
      confidence: "high",
      evidence: dedupeStrings([
        ...input.state.target_granularity.evidence,
        "single affected item replacement request",
      ]),
      negative_evidence: input.state.target_granularity.negative_evidence,
    },
    scope: {
      status: "identified",
      kind: "specific_plan_item",
      plan_item_id: matched.plan_item_id,
      label: matched.title,
      evidence: dedupeStrings([
        ...input.state.scope.evidence,
        "single affected item replacement request",
      ]),
    },
    selected_sub_skill: "action_intake",
    payload: {
      ...emptyActionPayload(),
      adjustment_type: {
        status: "identified",
        value: "replace",
        evidence: ["deterministic single action replacement signal"],
      },
      reason: {
        status: "identified",
        value: "bad_fit",
        evidence: ["deterministic action bad-fit signal"],
      },
      constraints: {
        status: "identified",
        values: constraints,
        evidence: ["deterministic replacement constraints"],
      },
    },
  };
  return {
    state: nextState,
    applied: true,
    evidence: ["single_item_level_replacement_routed_to_action"],
  };
}

function completeWholePlanStateFromTranscript(input: {
  state: AdjustPlanIntakeState;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
}): { state: AdjustPlanIntakeState; applied: boolean; evidence: string[] } {
  const payload = input.state.payload;
  if (
    input.state.scope.kind !== "whole_plan" ||
    payload?.scope_kind !== "whole_plan"
  ) {
    return { state: input.state, applied: false, evidence: [] };
  }
  const text = transcriptUserText(input);
  const normalized = normalizeForLooseMatch(text);
  if (!normalized) return { state: input.state, applied: false, evidence: [] };

  const asksForDraft =
    /\b(brouillon|proposition|propose|prepare|preparer|montre|fais moi|faire le brouillon|formule|formuler|formulation)\b/
      .test(normalized);
  const structuralSignal =
    /\b(trajectoire|suite du plan|plan global|objectif global|direction|axe|cap|etape|phase|partie|niveau|niveaux|reorganis|reordon|ralent|transition|coherent|avant de|avant la suite|avant les|apres|critere|criteres|reussite|succes|indicateur|methode|style|experience|vecu|fusion|fusionner|separer|separation|doublon|redondance)\b/
      .test(normalized);
  const concreteTrajectoryProposal =
    /\b(mission|habitude|protocole|phrase|formulation|20\s*minutes|vingt\s*minutes|respiration|pause|revenir|reparation|reparer|securite emotionnelle|retour au calme|retour au contact|revenir au contact|relancer le lien|critere|indicateur|comprehension mutuelle|lien preserve|experience|geste concret|petit geste|micro experience|petits sujets|sujets sensibles|argent|famille|intimite)\b/
      .test(normalized) &&
    /\b(ajouter|inserer|etape|phase|niveau|avant|apres|puis|ensuite|d'abord|intermediaire|reformuler|reformule|separer|fusionner|rendre|partir)\b/
      .test(normalized);
  const rejectsBridgeStep =
    /\b(eviter|sans|pas|pas necessaire|pas besoin|ne pas|n ajoute pas|ne l ajoute pas)\b.{0,40}\bpont\b/
      .test(normalized) ||
    /\bpont\b.{0,40}\b(pas necessaire|pas besoin|eviter|sans l ajouter|ne l ajoute pas)\b/
      .test(normalized);
  const familyInference = inferWholePlanFamilyFromText(text);
  const repairReconnectionStepSignal = (
    /\b(reconnaitre|nommer|acter|dire|dire brievement)\b.{0,100}\b(tension|dispute|ce qui s est passe|accroc|accrochage|emporte|maladresse)\b/
      .test(normalized) &&
    /\b(retour au contact|revenir au contact|retour en lien|revenir en lien|retour au lien|relancer le lien|relancer un moment de lien|geste de retour|petit geste|se remettre ensemble|reparler du fond)\b/
      .test(normalized)
  ) ||
    (
      /\b(manque une marche|ajouter une marche|ajoute une marche|mini marche|petite marche|marche pour revenir|petite etape|etape explicite|vraie etape|transition|pont|apprendre a se retrouver|se retrouver)\b/
        .test(normalized) &&
      /\b(apres un accrochage|apres accrochage|apres une dispute|apres dispute|dispute|tension|emporte|accroc|accrochage|reparler du fond)\b/
        .test(normalized)
    );
  const familyIsConcreteWholePlan =
    familyInference.family === "missing_bridge_or_level" ||
    familyInference.family === "direction_change" ||
    familyInference.family === "success_criteria_change" ||
    familyInference.family === "style_or_method_mismatch" ||
    familyInference.family === "value_preference_conflict" ||
    familyInference.family === "future_phase_mismatch" ||
    familyInference.family === "maintenance_or_consolidation_gap" ||
    familyInference.family === "split_merge_restructure";
  if (
    !asksForDraft && !structuralSignal && !concreteTrajectoryProposal &&
    !familyIsConcreteWholePlan
  ) {
    return { state: input.state, applied: false, evidence: [] };
  }

  const planTitles = planItems(input.plan_snapshot)
    .map((item) => item.title)
    .filter(Boolean);
  const mentionedTitles = planTitles.filter((title) =>
    textMentionsPlanTitle(text, title)
  );
  const affectedValues = dedupeStrings([
    ...mentionedTitles,
    ...stringList(payload.affected_items.values),
    ...(((asksForDraft && structuralSignal) || concreteTrajectoryProposal) &&
        mentionedTitles.length < 2
      ? planTitles.slice(0, 2)
      : []),
    ...(familyIsConcreteWholePlan &&
        mentionedTitles.length < 2 &&
        stringList(payload.affected_items.values).length < 2
      ? planTitles.slice(0, 2)
      : []),
  ]).slice(0, 6);

  const nextPayload: WholePlanAdjustmentPayload = {
    ...payload,
    whole_plan_change_family: payload.whole_plan_change_family
      ? { ...payload.whole_plan_change_family }
      : { status: "missing", evidence: [] },
    candidate_operation: payload.candidate_operation ?? null,
    readiness: payload.readiness ?? null,
    adjustment_type: { ...payload.adjustment_type },
    reason: { ...payload.reason },
    reason_change: { ...payload.reason_change },
    change_target: { ...payload.change_target },
    constraints: { ...payload.constraints },
    affected_items: { ...payload.affected_items },
  };
  const evidence: string[] = [];

  const existingFamily = nextPayload.whole_plan_change_family?.status ===
      "identified"
    ? nextPayload.whole_plan_change_family.value
    : null;
  const wholePlanFamilyChangedInTranscript = Boolean(
    existingFamily && existingFamily !== familyInference.family &&
      familyInference.family !== "cancel_or_reject",
  );
  if (
    nextPayload.whole_plan_change_family?.status !== "identified" ||
    wholePlanFamilyChangedInTranscript
  ) {
    nextPayload.whole_plan_change_family = {
      status: "identified",
      value: familyInference.family,
      evidence: familyInference.evidence,
    };
    evidence.push("whole_plan_change_family");
  }
  if (!nextPayload.candidate_operation || wholePlanFamilyChangedInTranscript) {
    nextPayload.candidate_operation = familyInference.operation;
    evidence.push("candidate_operation");
  }
  const shouldUpgradeWholePlanReadiness = familyIsConcreteWholePlan &&
    familyInference.readiness === "draft_ready" &&
    nextPayload.readiness !== "draft_ready";
  if (
    !nextPayload.readiness || wholePlanFamilyChangedInTranscript ||
    shouldUpgradeWholePlanReadiness
  ) {
    nextPayload.readiness = familyInference.readiness;
    evidence.push("readiness");
  }

  if (
    nextPayload.adjustment_type.status === "missing" &&
    (structuralSignal || concreteTrajectoryProposal ||
      familyIsConcreteWholePlan)
  ) {
    nextPayload.adjustment_type = {
      status: "identified",
      value: "resequence",
      evidence: ["deterministic whole-plan structural/family signal"],
    };
    evidence.push("adjustment_type");
  }
  if (
    nextPayload.reason.status === "missing" &&
    (concreteTrajectoryProposal ||
      familyIsConcreteWholePlan ||
      /\b(trop rapide|complex|sensible|coherent|coherence|transition|pas pret|pas prete)\b/
        .test(normalized))
  ) {
    nextPayload.reason = {
      status: "identified",
      value: "bad_fit",
      evidence: ["deterministic whole-plan fit/complexity signal"],
    };
    evidence.push("reason");
  }
  if (
    nextPayload.reason_change.status === "missing" &&
    (structuralSignal || concreteTrajectoryProposal ||
      familyIsConcreteWholePlan)
  ) {
    nextPayload.reason_change = {
      status: "identified",
      value: familyInference.family === "success_criteria_change"
        ? "goal_changed"
        : "structure_bad_fit",
      evidence: ["deterministic whole-plan family mismatch signal"],
    };
    evidence.push("reason_change");
  }
  if (
    nextPayload.change_target.status === "missing" &&
    (structuralSignal || concreteTrajectoryProposal ||
      familyIsConcreteWholePlan)
  ) {
    nextPayload.change_target = {
      status: "identified",
      value: familyInference.family === "success_criteria_change" ||
          familyInference.family === "style_or_method_mismatch" ||
          familyInference.family === "value_preference_conflict"
        ? "focus"
        : "sequence",
      evidence: ["deterministic whole-plan family target"],
    };
    evidence.push("change_target");
  }
  if (affectedValues.length >= 2) {
    nextPayload.affected_items = {
      status: "identified",
      values: affectedValues,
      evidence: dedupeStrings([
        ...stringList(payload.affected_items.evidence),
        "deterministic whole-plan mentioned plan anchors",
      ]),
    };
    evidence.push("affected_items");
  }
  if (
    familyInference.family !== "cancel_or_reject" &&
    ((asksForDraft && structuralSignal) || concreteTrajectoryProposal ||
      familyIsConcreteWholePlan)
  ) {
    const baseConstraints = shouldUpgradeWholePlanReadiness
      ? stringList(payload.constraints.values).filter((constraint) =>
        !String(constraint).startsWith("whole_plan_readiness:")
      )
      : stringList(payload.constraints.values);
    nextPayload.constraints = {
      status: "identified",
      values: dedupeStrings([
        ...baseConstraints,
        `whole_plan_change_family:${
          nextPayload.whole_plan_change_family?.value ?? familyInference.family
        }`,
        `whole_plan_candidate_operation:${
          nextPayload.candidate_operation ?? familyInference.operation
        }`,
        `whole_plan_readiness:${
          nextPayload.readiness ?? familyInference.readiness
        }`,
        "whole_plan_directional_draft_ready",
        "preserve_plan_intent",
        ...(concreteTrajectoryProposal
          ? ["avoid_repetitive_clarification_when_user_gives_solution"]
          : []),
        ...(familyInference.family === "split_merge_restructure" &&
            /\b(deux fois d affilee|2 fois d affilee|deux demandes simples|2 demandes simples)\b/
              .test(normalized)
          ? [
            "split_merge_transition_criterion:two_consecutive_simple_requests_without_high_tension",
          ]
          : []),
        ...(familyInference.family === "split_merge_restructure" &&
            rejectsBridgeStep
          ? ["split_merge_no_bridge_step"]
          : []),
        ...(familyInference.family === "direction_change" &&
            /\b(complicite|plaisir simple|moments positifs|initiatives positives|initiatives de lien|lien positif)\b/
              .test(normalized)
          ? ["direction_axis:complicity_and_simple_pleasure"]
          : []),
        ...(familyInference.family === "future_phase_mismatch" &&
            /\b(reparation|reparer|retour au calme|revenir au calme|reconnaitre ce qui a aide|ce qui a aide|petite tension)\b/
              .test(normalized)
          ? ["replace_phase_kind:light_repair_after_tension"]
          : []),
        ...(familyInference.family === "missing_bridge_or_level" &&
            repairReconnectionStepSignal
          ? ["insert_phase_kind:repair_reconnection_after_tension"]
          : []),
      ]),
      evidence: dedupeStrings([
        ...stringList(payload.constraints.evidence),
        concreteTrajectoryProposal
          ? "deterministic whole-plan concrete trajectory proposal"
          : "deterministic whole-plan draft readiness",
      ]),
    };
    evidence.push("constraints");
  }

  return evidence.length
    ? {
      state: { ...input.state, payload: nextPayload },
      applied: true,
      evidence: dedupeStrings(evidence),
    }
    : { state: input.state, applied: false, evidence: [] };
}

function dedupeCandidatesById<T extends { id: string }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
  return out;
}

function deterministicWholePlanDirectionalDraft(
  input: PlanAdjustmentGeneratorInput,
): PlanAdjustmentDraftV1 | null {
  if (input.scope.kind !== "whole_plan") return null;
  const hasWholePlanFamily = input.constraints.some((constraint) =>
    String(constraint).startsWith("whole_plan_change_family:")
  );
  const isDiagnoseOnly = input.constraints.includes(
    "whole_plan_readiness:diagnose",
  );
  if (
    isDiagnoseOnly ||
    (!hasWholePlanFamily &&
      !input.constraints.includes("whole_plan_directional_draft_ready"))
  ) return null;
  const eligibleCandidates = (input.materialization_candidates ?? [])
    .filter((candidate) =>
      String(candidate.clarification_type ?? "").trim() !== "clarification" &&
      String(candidate.dimension ?? "").trim() !== "clarifications"
    );
  const affectedLabels = input.constraints
    .flatMap((constraint) => {
      const match = String(constraint).match(/^affected_item:(.+)$/);
      return match?.[1]?.trim() ? [match[1].trim()] : [];
    });
  const affectedCandidates = affectedLabels.flatMap((label) => {
    const normalizedLabel = normalizeForLooseMatch(label);
    const match = eligibleCandidates.find((candidate) => {
      const title = String(candidate.title ?? "");
      const normalizedTitle = normalizeForLooseMatch(title);
      return normalizedTitle === normalizedLabel ||
        normalizedTitle.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedTitle);
    });
    return match ? [match] : [];
  });
  const candidates = dedupeCandidatesById(
    affectedCandidates.length >= 2 ? affectedCandidates : eligibleCandidates,
  ).slice(0, 3);
  if (candidates.length < 2) return null;
  const constraintValue = (prefix: string): string | null => {
    const found = input.constraints.find((constraint) =>
      String(constraint).startsWith(prefix)
    );
    return found ? String(found).slice(prefix.length).trim() || null : null;
  };
  const family = constraintValue("whole_plan_change_family:") ??
    "sequence_order_issue";
  const candidateOperation =
    constraintValue("whole_plan_candidate_operation:") ??
      "reorder";
  const hasTwoConsecutiveTransitionCriterion = input.constraints.includes(
    "split_merge_transition_criterion:two_consecutive_simple_requests_without_high_tension",
  );
  const avoidsBridgeStep = input.constraints.includes(
    "split_merge_no_bridge_step",
  );
  const hasComplicityAxis = input.constraints.includes(
    "direction_axis:complicity_and_simple_pleasure",
  );
  const insertsShortConsolidationLevel = input.constraints.includes(
    "insert_phase_kind:short_consolidation_level",
  );
  const insertsRepairReconnectionStep = input.constraints.includes(
    "insert_phase_kind:repair_reconnection_after_tension",
  );
  const insertsBeforeSensitiveTopics = input.constraints.includes(
    "insert_phase_position:before_sensitive_topics",
  );
  const insertPhaseActions = input.constraints
    .flatMap((constraint) => {
      if (constraint === "insert_phase_action:observer_ce_qui_apaise") {
        return ["observer ce qui apaise"];
      }
      if (constraint === "insert_phase_action:demande_simple_sans_debat") {
        return ["faire une demande simple sans débat"];
      }
      return [];
    });
  const insertedActionLabel = insertPhaseActions.length
    ? `, avec ${insertPhaseActions.join(" et ")}`
    : "";
  const insertedPositionLabel = insertsBeforeSensitiveTopics
    ? " avant les sujets sensibles"
    : " avant de monter d'un cran";
  const replacesWithLightRepair = input.constraints.includes(
    "replace_phase_kind:light_repair_after_tension",
  );
  const focusTitles = candidates.slice(0, 2).map((candidate) =>
    String(candidate.title ?? "").trim()
  ).filter(Boolean);
  const focusLabel = focusTitles.length >= 2
    ? `${focusTitles[0]} et ${focusTitles[1]}`
    : "les deux appuis principaux du plan";
  const familyCopy = (() => {
    if (family === "missing_bridge_or_level") {
      if (insertsRepairReconnectionStep) {
        return {
          changeVerb: "j'insère une étape courte de réparation après tension",
          inserted:
            "Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.",
          before:
            "La suite du plan pouvait passer trop vite de la tension à l'analyse, sans sécuriser le retour au lien.",
          after:
            "Le plan ajoute un passage court après dispute: reconnaître ce qui s'est passé, puis revenir au contact avant d'analyser le fond.",
          reason:
            "Le user demande une étape concrète de réparation relationnelle, pas un niveau abstrait ni une analyse supplémentaire.",
          nextStep:
            "Reprendre ensuite la progression quand le contact est restauré",
        };
      }
      if (insertsShortConsolidationLevel) {
        return {
          changeVerb: "j'insère un niveau court de consolidation",
          inserted:
            `Un sas d'une semaine${insertedPositionLabel}${insertedActionLabel}.`,
          before:
            "Le plan passait trop vite vers une phase plus sensible sans vérifier la stabilité sur des demandes simples.",
          after:
            `Le plan ajoute un niveau court de consolidation${insertedPositionLabel}, puis reprend la progression quand les bases tiennent.`,
          reason:
            "Le user demande d'ajouter un niveau de consolidation pour rendre la progression plus réaliste avant les sujets sensibles.",
          nextStep:
            "Reprendre ensuite les sujets sensibles avec une stabilité minimale déjà vérifiée",
        };
      }
      return {
        changeVerb: "j'ajoute une marche de transition",
        inserted:
          "Une courte étape avec un objectif précis, un contenu limité et un critère de passage explicite.",
        before: "Le plan passait trop directement d'un bloc au suivant.",
        after:
          "Le plan garde son objectif, mais ajoute une marche claire avant de monter d'un cran.",
        reason:
          "Le user demande d'ajouter un niveau ou une étape pour rendre la progression plus réaliste.",
        nextStep:
          "Reprendre ensuite la progression avec un prérequis consolidé",
      };
    }
    if (family === "direction_change") {
      return {
        changeVerb: "je réoriente l'accent du plan",
        inserted: hasComplicityAxis
          ? "Un axe directeur plus centré sur la complicité, le plaisir simple et les initiatives positives de lien."
          : `Un axe directeur plus aligné avec ${focusLabel}.`,
        before:
          "Le plan suivait son axe initial, mais cet axe ne correspond plus assez à la direction voulue.",
        after: hasComplicityAxis
          ? "Le plan garde l'apaisement comme base, mais la suite ne vise plus seulement à éviter les disputes: elle ajoute clairement un axe de complicité et de plaisir simple."
          : `Le plan garde ce qui reste utile, mais la suite est réorientée autour de ${focusLabel}.`,
        reason:
          "Le user demande un changement d'axe global, pas seulement un allègement.",
        nextStep: "Construire les prochains blocs autour du nouvel axe",
      };
    }
    if (family === "value_preference_conflict") {
      return {
        changeVerb: "je réoriente l'esprit du plan",
        inserted:
          "Une lecture moins performative des actions existantes: elles servent la chaleur, la fiabilité et la réparation rapide, sans ajouter de nouvelles actions.",
        before:
          "Le plan pouvait être vécu comme une suite de cases à cocher ou d'actions à réussir.",
        after:
          "Le plan garde les mêmes appuis, mais leur rôle devient plus clair: soutenir la présence fiable, les petits moments positifs et la réparation après maladresse.",
        reason:
          "Le user demande de changer le sens et les critères implicites du plan, sans augmenter la charge.",
        nextStep:
          "Relire les prochains blocs avec cette boussole de chaleur et de fiabilité",
      };
    }
    if (family === "future_phase_mismatch") {
      return {
        changeVerb: "je reprends la phase future qui ne colle pas",
        inserted: replacesWithLightRepair
          ? "Une phase de réparation légère après petite tension: revenir au calme, reconnaître ce qui a aidé, puis parler du fond seulement ensuite."
          : `Une version retravaillée de la phase concernée, appuyée sur ${focusLabel}.`,
        before:
          "Une phase future arrivait avec une logique qui ne paraît pas assez cohérente.",
        after: replacesWithLightRepair
          ? "La phase future garde son objectif de clarté, mais son entrée devient plus progressive: réparation légère avant discussion de fond."
          : `La phase future est retravaillée pour s'appuyer d'abord sur ${focusLabel}.`,
        reason:
          "Le user signale qu'une partie future ne fait pas sens dans la trajectoire.",
        nextStep:
          "Remplacer la phase future par une progression plus cohérente",
      };
    }
    if (family === "success_criteria_change") {
      return {
        changeVerb: "je change les critères de réussite du plan",
        inserted:
          "Une mesure de réussite centrée sur la compréhension mutuelle et le lien préservé après une discussion tendue; moins de disputes reste seulement un repère secondaire.",
        before:
          "Le plan mesurait surtout la baisse de l'escalade et l'exécution des actions.",
        after:
          "Le plan garde l'apaisement comme base, mais le critère principal devient la compréhension mutuelle et le lien préservé après une discussion tendue.",
        reason:
          "Le user demande de changer ce qui compte comme progrès, pas de réordonner les actions.",
        nextStep:
          "Utiliser ces critères comme repères pour les prochains niveaux",
      };
    }
    if (family === "style_or_method_mismatch") {
      return {
        changeVerb: "je change la méthode de progression du plan",
        inserted:
          "Un principe de progression: petite expérience concrète, observation de ce que ça produit, puis discussion seulement si ça ouvre quelque chose.",
        before:
          "Le plan entrait trop vite par l'analyse, le cadrage ou la discussion.",
        after:
          "Le plan garde son objectif, mais chaque niveau part davantage du vécu concret avant de passer à l'analyse ou à la discussion.",
        reason:
          "Le user veut une méthode plus incarnée et moins analytique, sans baisser le niveau ni changer l'objectif.",
        nextStep:
          "Reformuler les prochains niveaux autour de l'expérience puis de l'observation",
      };
    }
    if (family === "split_merge_restructure") {
      return {
        changeVerb: "je clarifie la séparation entre deux étapes du plan",
        inserted: hasTwoConsecutiveTransitionCriterion
          ? "Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles: on passe aux sujets sensibles seulement après deux demandes simples d'affilée sans tension forte."
          : avoidsBridgeStep
          ? "Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles, sans ajouter d'étape pont."
          : "Une marche plus nette entre les petits sujets du quotidien et les sujets sensibles comme l'argent, la famille ou l'intimité.",
        before:
          "Deux étapes futures risquaient de se répéter ou de se chevaucher.",
        after: hasTwoConsecutiveTransitionCriterion
          ? "Le plan garde deux étapes distinctes, et leur frontière devient observable: deux demandes simples d'affilée sans tension forte avant d'ouvrir les sujets sensibles."
          : avoidsBridgeStep
          ? "Le plan garde deux étapes distinctes et renforce leur frontière sans créer de niveau ou d'étape pont supplémentaire."
          : "Le plan garde deux étapes distinctes, mais les différencie par la difficulté du contenu: besoins simples d'abord, sujets sensibles ensuite.",
        reason:
          "Le user demande une structure plus lisible entre deux phases futures proches.",
        nextStep:
          "Garder une marche claire avant d'aborder les sujets sensibles",
      };
    }
    if (family === "maintenance_or_consolidation_gap") {
      return {
        changeVerb: "j'ajoute une couche de consolidation",
        inserted: `Une phase de stabilisation autour de ${focusLabel}.`,
        before:
          "Le plan avançait vers la suite sans assez sécuriser ce qui doit tenir dans le temps.",
        after:
          `Le plan ajoute une phase de consolidation autour de ${focusLabel} avant d'augmenter la difficulté.`,
        reason: "Le user a besoin que les acquis tiennent avant de poursuivre.",
        nextStep: "Stabiliser les acquis avant la prochaine montée",
      };
    }
    return {
      changeVerb: candidateOperation === "insert_phase"
        ? "j'insère une étape intermédiaire"
        : "je réordonne la trajectoire",
      inserted: `Une étape intermédiaire centrée sur ${focusLabel}.`,
      before:
        "Le plan avance vers la suite sans assez marquer le prérequis intermédiaire.",
      after:
        `Le plan garde son cap, mais consolide d'abord ${focusLabel} avant la suite.`,
      reason:
        "Le user demande de rendre la trajectoire globale plus progressive et cohérente.",
      nextStep:
        "Reprendre ensuite la suite du plan avec un prérequis consolidé",
    };
  })();
  const afterFor = (title: string) => {
    const normalized = normalizeForLooseMatch(title);
    if (family === "success_criteria_change") {
      return "À conserver dans le plan, mais à évaluer avec un critère plus relationnel: compréhension mutuelle et lien préservé après l'échange.";
    }
    if (family === "style_or_method_mismatch") {
      return "À reformuler dans une logique plus concrète: vivre une petite expérience, observer, puis discuter seulement si ça ouvre quelque chose.";
    }
    if (family === "split_merge_restructure") {
      return "À replacer comme appui d'une marche claire: petits sujets du quotidien avant les sujets sensibles.";
    }
    if (family === "value_preference_conflict") {
      return "À conserver, mais à lire comme un appui de chaleur, de fiabilité et de réparation, pas comme une case à réussir.";
    }
    if (/\bsignal\b/.test(normalized)) {
      return `À placer dans la trajectoire ajustée: ${familyCopy.inserted}`;
    }
    if (/\brespiration|pause\b/.test(normalized)) {
      return `À garder comme appui concret dans la trajectoire ajustée: ${familyCopy.inserted}`;
    }
    return `À replacer dans une trajectoire plus progressive: ${familyCopy.inserted}`;
  };
  const changedItems = candidates.slice(0, 2).map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    capability: "modify_existing_action" as const,
    id: candidate.id,
    title: candidate.title,
    before: candidate.description ?? candidate.cadence_label ?? null,
    after: afterFor(String(candidate.title ?? "")),
    reason: familyCopy.reason,
  }));
  const changedIds = new Set(changedItems.map((item) => item.id));
  const preserved = eligibleCandidates.filter((candidate) =>
    !changedIds.has(candidate.id)
  ).slice(0, 2).map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    id: candidate.id,
    title: candidate.title,
    reason:
      "L'action reste comme soutien; le changement concerne la trajectoire et l'ordre de progression.",
  }));
  const summary = `${familyCopy.changeVerb}: ${familyCopy.inserted}`;
  const insertedInline = familyCopy.inserted
    ? `${familyCopy.inserted.charAt(0).toLowerCase()}${
      familyCopy.inserted.slice(1)
    }`
    : familyCopy.inserted;
  const executionDetail = familyCopy.after.endsWith(".")
    ? familyCopy.after
    : `${familyCopy.after}.`;
  const maxTwoActions = input.constraints.some((constraint) =>
    normalizeForLooseMatch(constraint) === "max two actions next step"
  );
  const changeLine = family === "value_preference_conflict"
    ? `Je garderais les actions, mais je demanderais au plan régénéré de les relire autrement: ${insertedInline}`
    : family === "success_criteria_change"
    ? `Je demanderais au plan régénéré de changer les critères de réussite du plan: ${insertedInline}`
    : family === "style_or_method_mismatch"
    ? `Je demanderais au plan régénéré de changer sa méthode d'entrée: ${insertedInline}`
    : family === "missing_bridge_or_level" && insertsRepairReconnectionStep
    ? `Je formulerais l'ajustement comme une courte étape de réparation: ${familyCopy.inserted}`
    : family === "missing_bridge_or_level"
    ? `${familyCopy.changeVerb}: ${familyCopy.inserted}`
    : `${familyCopy.changeVerb}: ${familyCopy.inserted}`;
  const stableLine = family === "success_criteria_change"
    ? "L'objectif global, les actions actuelles et le signal de pause restent les appuis; on change surtout les critères de réussite qui disent si ça progresse."
    : family === "style_or_method_mismatch"
    ? "L'objectif global, l'ambition et la charge restent stables; c'est la manière d'entrer dans chaque étape qui change."
    : family === "split_merge_restructure"
    ? "L'objectif global et la progression par étapes restent stables; on rend surtout la frontière entre deux étapes plus nette."
    : family === "value_preference_conflict"
    ? "L'objectif global et les actions existantes restent là. Le changement porte sur l'intention: moins de performance, plus de chaleur et de fiabilité."
    : "L'objectif global reste stable, et les actions de soutien ne changent pas sauf si la régénération montre qu'il faut les reformuler.";
  const confirmationMessage = [
    family === "missing_bridge_or_level" && insertsRepairReconnectionStep
      ? "Oui, je vois mieux la marche à ajouter. Je ne la formulerais pas comme un bloc abstrait."
      : "Je peux préparer cet ajustement du plan global sans changer l'objectif de fond.",
    "",
    changeLine,
    "",
    ...(maxTwoActions
      ? [
        "Contrainte ajoutée: la prochaine étape reste limitée à deux actions maximum.",
        "",
      ]
      : []),
    stableLine,
    "",
    "Si tu valides, je régénère une nouvelle version du plan avec ce feedback. Rien n'est encore appliqué.",
  ].join("\n");
  const executionMessage = [
    "C'est fait: j'ai ajusté la trajectoire du plan.",
    "",
    executionDetail,
  ].join("\n");
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      adjustment_type: input.adjustment_type,
      execution_strategy: "whole_plan_adjustment",
      proposed_change: summary,
      why_it_helps: familyCopy.reason,
      confidence: "medium",
      decision_basis: input.decision_basis ?? {
        user_problem:
          "La suite du plan paraît trop rapide avant des conversations plus sensibles.",
        inferred_need:
          "Ralentir la progression et consolider les prérequis de sécurité.",
        confidence: "medium",
        evidence: input.reason.evidence,
        uncertainty: [
          "Le placement exact de l'étape pourra être affiné lors de la régénération du plan.",
        ],
        must_preserve: ["objectif global du plan"],
      },
      change_rationale: {
        why_this_change:
          "Le user demande une modification structurelle de trajectoire, pas un simple patch d'action.",
        expected_mechanism: familyCopy.reason,
        success_condition: familyCopy.after,
      },
      ack_summary: {
        changed: [
          familyCopy.inserted,
        ],
        unchanged: [
          "Objectif global du plan",
          "Actions de soutien existantes sauf changement explicitement validé",
        ],
        why_it_helps: familyCopy.reason,
        confidence: "medium",
        follow_up_needed:
          "Valider avant régénération; le détail exact sera produit dans le plan ajusté.",
      },
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          summary,
          trajectory_change: {
            before: familyCopy.before,
            after: familyCopy.after,
            inserted_step: familyCopy.inserted,
            reordered_steps: [
              familyCopy.inserted,
              familyCopy.nextStep,
            ],
            preserved_direction:
              "L'objectif global du plan reste stable, sauf demande explicite de le changer.",
            coaching_reason: familyCopy.reason,
          },
          changed_items: changedItems,
          preserved_items: preserved,
        },
        boundaries: {
          affected_scope: "trajectoire globale du plan",
          explicitly_not_affected: [
            "objectif global",
            "identité du plan",
            "demande de ne pas transformer cela en simple ajustement d'action",
          ],
          global_plan_impact: "requires_review",
          explanation:
            "Le changement touche l'ordre et les prérequis de progression, donc il doit passer par une régénération contrôlée du plan.",
        },
        rationale: {
          user_problem: familyCopy.before,
          why_this_change: familyCopy.reason,
          expected_effect:
            "Le plan avance avec une trajectoire plus cohérente sans casser l'objectif global.",
          confidence: "medium",
          missing_info: [],
        },
        user_message_brief: summary,
        user_message_detailed: summary,
      },
      patch: {
        scope_kind: "whole_plan",
        reason_type: input.reason.type,
        reason_change: input.reason_change?.type ?? "structure_bad_fit",
        change_target: input.change_target?.value ?? "sequence",
        constraints: input.constraints,
      },
      allowed_patch_fields: input.allowed_patch_fields,
    },
    confirmation_message: confirmationMessage,
    execution_message: executionMessage,
    confirmation_actions: ["yes", "no"],
  };
}

function deterministicCurrentLevelLoadDraft(
  input: PlanAdjustmentGeneratorInput,
): PlanAdjustmentDraftV1 | null {
  if (input.scope.kind !== "current_level") return null;
  if (isCopyForwardLevelGeneratorInput(input)) return null;
  const evidenceText = [
    ...(input.decision_basis?.evidence ?? []),
    ...input.constraints,
  ].join("\n");
  const eligibleCandidates = (input.materialization_candidates ?? [])
    .filter((candidate) =>
      String(candidate.clarification_type ?? "").trim() !== "clarification" &&
      String(candidate.dimension ?? "").trim() !== "clarifications" &&
      !/\bfiche support\b/i.test(String(candidate.title ?? ""))
    );
  const mentionedCandidates = eligibleCandidates.filter((candidate) =>
    textMentionsPlanTitle(evidenceText, String(candidate.title ?? ""))
  );
  const candidates =
    (mentionedCandidates.length >= 2 ? mentionedCandidates : eligibleCandidates)
      .slice(0, 4);
  if (candidates.length < 2) return null;
  const afterFor = (title: string) => {
    const normalized = normalizeForLooseMatch(title);
    if (/\bsignal\b/.test(normalized)) {
      return "Terminer seulement la version simple du signal de pause cette semaine.";
    }
    if (/\bpoint positif|positif\b/.test(normalized)) {
      return "1 fois en début de semaine, avec une phrase très courte.";
    }
    if (/\brespiration|pause\b/.test(normalized)) {
      return "1 pause courte de 2 minutes, sans chercher à faire parfait.";
    }
    return "Garder l'action, mais en version minimale cette semaine.";
  };
  const changedItems = candidates.slice(0, 3).map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    capability: "modify_existing_action" as const,
    id: candidate.id,
    title: candidate.title,
    before: candidate.description ?? candidate.cadence_label ?? null,
    after: afterFor(String(candidate.title ?? "")),
    reason:
      "Le niveau actuel reste dans la même direction, mais la charge baisse pour tenir avec moins d'énergie.",
  }));
  const summary =
    "Alléger le niveau actuel sans changer le plan global: garder les mêmes appuis, mais avec une charge plus basse cette semaine.";
  const confirmationMessage = [
    "Je te propose une version allégée du niveau actuel, sans refaire le plan global.",
    "",
    ...changedItems.map((item) => `- ${item.title}: ${item.after}`),
    "",
    "Ce qui reste stable: l'objectif du niveau et les appuis principaux. Rien n'est appliqué tant que tu ne valides pas.",
  ].join("\n");
  const executionMessage = [
    "C'est fait: j'ai allégé le niveau actuel sans refaire le plan global.",
    "",
    ...changedItems.map((item) => `- ${item.title}: ${item.after}`),
  ].join("\n");
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: "Alléger le niveau actuel",
      scope_label: "niveau actuel",
      adjustment_type: input.adjustment_type,
      execution_strategy: "level_adjustment",
      proposed_change: summary,
      why_it_helps:
        "Cela réduit la charge immédiate sans changer l'objectif de fond.",
      confidence: "medium",
      decision_basis: input.decision_basis ?? {
        user_problem:
          "Le niveau actuel est trop lourd pour l'énergie disponible.",
        inferred_need: "Réduire la charge tout en gardant les mêmes repères.",
        confidence: "medium",
        evidence: input.reason.evidence,
        uncertainty: [],
        must_preserve: ["objectif du niveau actuel", "plan global"],
      },
      change_rationale: {
        why_this_change:
          "La difficulté porte sur la charge du niveau actuel, pas sur une action isolée ni sur tout le plan.",
        expected_mechanism:
          "Des versions plus petites diminuent le coût d'entrée et rendent la semaine plus tenable.",
        success_condition:
          "Le user peut tenir les appuis principaux sans se cramer en fin de semaine.",
      },
      ack_summary: {
        changed: changedItems.map((item) => item.title),
        unchanged: ["Plan global", "objectif du niveau actuel"],
        why_it_helps: "La charge baisse sans casser la direction du plan.",
        confidence: "medium",
        follow_up_needed: null,
      },
      adjust_plan_result: {
        scope: "level",
        applied_change: {
          summary,
          changed_items: changedItems,
          preserved_items: candidates.slice(3).map((candidate) => ({
            kind: (String(candidate.kind ?? candidate.item_type ?? "").includes(
                "habit",
              )
              ? "habit"
              : "action") as "action" | "habit",
            id: candidate.id,
            title: candidate.title,
            reason:
              "Cet élément reste stable; l'ajustement vise surtout la charge des appuis principaux.",
          })),
        },
        boundaries: {
          affected_scope: "niveau actuel",
          explicitly_not_affected: ["plan global", "objectif de fond"],
          global_plan_impact: "none",
          explanation:
            "Le changement baisse la charge du niveau actuel sans réorienter la trajectoire globale.",
        },
        rationale: {
          user_problem:
            "La semaine est partielle et le niveau actuel demande trop d'énergie.",
          why_this_change:
            "Alléger les appuis principaux répond au blocage sans refaire tout le plan.",
          expected_effect:
            "La semaine suivante devient plus concrète et plus tenable.",
          confidence: "medium",
          missing_info: [],
        },
        user_message_brief: summary,
        user_message_detailed: summary,
      },
      patch: {
        scope_kind: "current_level",
        reason_type: input.reason.type,
        reason_change: input.reason_change?.type ?? "energy_low",
        change_target: input.change_target?.value ?? "global_load",
        constraints: input.constraints,
      },
      allowed_patch_fields: input.allowed_patch_fields,
    },
    confirmation_message: confirmationMessage,
    execution_message: executionMessage,
    confirmation_actions: ["yes", "no"],
  };
}

function isCopyForwardLevelGeneratorInput(
  input: PlanAdjustmentGeneratorInput,
): boolean {
  if (input.scope.kind !== "current_level") return false;
  const constraints = input.constraints.map((constraint) =>
    normalizeForLooseMatch(constraint)
  );
  return constraints.some((constraint) =>
    constraint === "extend current level same plan" ||
    constraint === "copy forward level one week" ||
    constraint === "preserve cadence"
  );
}

function deterministicCurrentLevelCopyForwardDraft(
  input: PlanAdjustmentGeneratorInput,
): PlanAdjustmentDraftV1 | null {
  if (!isCopyForwardLevelGeneratorInput(input)) return null;
  const eligibleCandidates = (input.materialization_candidates ?? [])
    .filter((candidate) =>
      String(candidate.clarification_type ?? "").trim() !== "clarification" &&
      String(candidate.dimension ?? "").trim() !== "clarifications" &&
      !/\bfiche support\b/i.test(String(candidate.title ?? ""))
    )
    .slice(0, 4);
  if (eligibleCandidates.length === 0) return null;

  const unchangedLineFor = (candidate: any) => {
    const cadence = String(candidate.cadence_label ?? "").trim();
    const description = String(candidate.description ?? "").trim();
    return cadence
      ? `Inchangé: ${cadence}. Le niveau est seulement prolongé d'une semaine.`
      : description
      ? `Inchangé: ${description}`
      : "Inchangé: même consigne, même rythme, une semaine de plus.";
  };
  const changedItems = eligibleCandidates.map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    capability: "modify_existing_action" as const,
    id: candidate.id,
    title: candidate.title,
    before: candidate.description ?? candidate.cadence_label ?? null,
    after: unchangedLineFor(candidate),
    reason:
      "Le user veut consolider le niveau actuel une semaine de plus sans modifier les actions ni le rythme.",
  }));
  const summary =
    "Prolonger le niveau actuel d'une semaine à l'identique, sans changer les actions, le rythme ni le plan global.";
  const confirmationMessage = [
    "Je te propose de prolonger le niveau actuel d'une semaine à l'identique.",
    "",
    "Ce qui change: uniquement la durée du niveau. Tu gardes les mêmes actions, le même rythme et les mêmes repères.",
    "",
    ...changedItems.map((item) => `- ${item.title}: inchangé.`),
    "",
    "Rien n'est appliqué tant que tu ne valides pas.",
  ].join("\n");
  const executionMessage = [
    "C'est fait: j'ai prolongé le niveau actuel d'une semaine à l'identique.",
    "",
    "Les actions, le rythme et les repères restent inchangés. Le plan global n'est pas refait.",
  ].join("\n");
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: "Prolonger le niveau actuel",
      scope_label: "niveau actuel",
      adjustment_type: input.adjustment_type,
      execution_strategy: "level_adjustment",
      proposed_change: summary,
      why_it_helps:
        "Cela laisse une semaine de consolidation avant la suite sans ajouter de charge ni changer le cadre.",
      confidence: "high",
      decision_basis: input.decision_basis ?? {
        user_problem:
          "Le user veut consolider le niveau actuel avant de passer à la suite.",
        inferred_need:
          "Garder le même cadre une semaine de plus, sans allègement ni hausse de rythme.",
        confidence: "high",
        evidence: input.reason.evidence,
        uncertainty: [],
        must_preserve: [
          "actions existantes",
          "rythme existant",
          "objectif du niveau",
          "plan global",
        ],
      },
      change_rationale: {
        why_this_change:
          "La demande porte sur le temps de consolidation, pas sur le contenu des actions.",
        expected_mechanism:
          "Une semaine identique donne plus de répétition sans changer la difficulté.",
        success_condition:
          "Le user garde les mêmes actions et le même rythme pendant une semaine supplémentaire.",
      },
      ack_summary: {
        changed: ["Durée du niveau actuel"],
        unchanged: [
          "Actions du niveau",
          "Rythme",
          "Repères",
          "Plan global",
        ],
        why_it_helps:
          "Le niveau est consolidé sans déplacer la trajectoire ni modifier la charge.",
        confidence: "high",
        follow_up_needed: null,
      },
      adjust_plan_result: {
        scope: "level",
        applied_change: {
          summary,
          changed_items: changedItems,
          preserved_items: eligibleCandidates.map((candidate) => ({
            kind: (String(candidate.kind ?? candidate.item_type ?? "").includes(
                "habit",
              )
              ? "habit"
              : "action") as "action" | "habit",
            id: candidate.id,
            title: candidate.title,
            reason: "Action conservée à l'identique.",
          })),
        },
        boundaries: {
          affected_scope: "niveau actuel",
          explicitly_not_affected: [
            "actions",
            "rythme",
            "objectif global",
            "plan global",
          ],
          global_plan_impact: "none",
          explanation:
            "Le changement prolonge le niveau actuel sans modifier son contenu.",
        },
        rationale: {
          user_problem:
            "Le user veut consolider avant de passer au niveau suivant.",
          why_this_change:
            "Prolonger à l'identique répond à la demande sans créer d'allègement non demandé.",
          expected_effect: "Le user garde le même cadre une semaine de plus.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: summary,
        user_message_detailed: summary,
      },
      patch: {
        scope_kind: "current_level",
        reason_type: input.reason.type,
        reason_change: input.reason_change?.type ?? "time_or_capacity_changed",
        change_target: input.change_target?.value ?? "timing",
        constraints: input.constraints,
      },
      allowed_patch_fields: input.allowed_patch_fields,
    },
    confirmation_message: confirmationMessage,
    execution_message: executionMessage,
    confirmation_actions: ["yes", "no"],
  };
}

/**
 * Extract structured signals from the current intake state so the
 * candidate builder + draft compiler can reason without ever reading the
 * raw user message. Signals come from:
 *   - the AI's affected_items proposals (user_explicitly_named_titles)
 *   - explicit constraint flags emitted by the slot filler prompt
 *
 * The slot filler prompt will be updated to emit these flags. Until then
 * all values default to false, which keeps the existing behavior for
 * "allowed" adjustment types and only protects the conditional ones
 * (pause, pause_level, restart_plan, change_goal).
 */
function extractAdjustSignalsFromState(
  state: AdjustPlanIntakeState,
): AdjustSignals {
  const payload = state.payload;
  const constraints = Array.isArray(payload?.constraints?.values)
    ? payload!.constraints.values.map((value) => String(value ?? "").trim())
    : [];
  const affectedNames =
    payload && payload.scope_kind !== "specific_plan_item" &&
      Array.isArray(
        (payload as LevelAdjustmentPayload | WholePlanAdjustmentPayload)
          .affected_items?.values,
      )
      ? (payload as LevelAdjustmentPayload | WholePlanAdjustmentPayload)
        .affected_items.values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
      : [];
  const hasFlag = (flag: string) => constraints.some((value) => value === flag);
  return {
    user_explicitly_named_titles: affectedNames,
    user_explicit_pause_request: hasFlag("user_explicit_pause_request") ||
      hasFlag("explicit_pause_request"),
    user_explicit_restart_request: hasFlag("user_explicit_restart_request") ||
      hasFlag("explicit_restart_request"),
    user_explicit_replace_request: hasFlag("user_explicit_replace_request") ||
      hasFlag("explicit_replace_request"),
    user_explicit_frequency_change: hasFlag("user_explicit_frequency_change") ||
      constraints.some((value) => value.startsWith("frequency_change:")),
  };
}

function buildAllowedSetForState(
  state: AdjustPlanIntakeState,
  planSnapshot: unknown,
): AllowedAdjustmentSet | null {
  if (state.scope.status !== "identified" || !state.scope.kind) return null;
  const signals = extractAdjustSignalsFromState(state);
  return buildAllowedAdjustmentSet({
    plan_snapshot: planSnapshot,
    scope_kind: state.scope.kind,
    scope_plan_item_id: state.scope.plan_item_id ?? null,
    signals,
  });
}

function compilerSubSkillTrace(
  state: AdjustPlanIntakeState,
  result: CompilerResult,
): AdjustPlanSubSkillTrace {
  const subSkillId: AdjustPlanSubSkillId = state.selected_sub_skill ??
    (state.scope.kind === "current_level"
      ? "level_intake"
      : state.scope.kind === "whole_plan"
      ? "whole_plan_intake"
      : state.scope.kind === "specific_plan_item"
      ? "action_intake"
      : "scope_router");
  if (result.ok) {
    return {
      sub_skill_id: subSkillId,
      status: "ready",
      reason_code: "compiler_ok",
      missing_slots: [],
    };
  }
  return {
    sub_skill_id: subSkillId,
    status: "needs_clarification",
    reason_code: result.reason_code,
    missing_slots: result.reason_code === "items_outside_allowed_set"
      ? result.rejected_items.map((rejected) =>
        `affected_item:${rejected.requested_label}`
      )
      : result.reason_code === "adjustment_type_forbidden" ||
          result.reason_code === "adjustment_type_requires_explicit_request"
      ? [
        `adjustment_type:${
          result.rejected_adjustment_type?.requested_value ?? "unknown"
        }`,
      ]
      : ["allowed_set_violation"],
  };
}

function compilerObservabilityPayload(
  allowed: AllowedAdjustmentSet,
  result: CompilerResult,
) {
  return {
    scope_kind: allowed.scope_kind,
    editable_count: allowed.editable_items.length,
    conditional_count: allowed.conditional_items.length,
    excluded_count: allowed.excluded_items.length,
    allowed_adjustment_types: allowed.allowed_adjustment_types.map((rule) =>
      rule.value
    ),
    conditional_adjustment_types: allowed.conditional_adjustment_types.map(
      (rule) => rule.value,
    ),
    forbidden_adjustment_types: allowed.forbidden_adjustment_types.map((rule) =>
      rule.value
    ),
    compiler_ok: result.ok,
    compiler_reason_code: result.ok ? "compiler_ok" : result.reason_code,
    compiled_affected_item_ids: result.ok
      ? result.compiled_affected_items.map((item) => item.plan_item_id)
      : [],
    rejected_items: result.ok ? [] : result.rejected_items,
    rejected_adjustment_type: result.ok
      ? null
      : result.rejected_adjustment_type,
    signals: allowed.signals,
  };
}

export async function runAdjustPlanItemIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
  adjust_plan_result_writer?: AdjustPlanResultWriter;
  slot_filler?: AdjustPlanSlotFiller | null;
  question_writer?: AdjustPlanQuestionWriter | null;
  coach_guidance_runner?: AdjustPlanCoachGuidanceRunner | null;
  force_coach_guidance?: boolean;
  force_ai_slot_filling?: boolean;
}): Promise<AdjustPlanItemOperationOutput> {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "adjust_plan_item",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks plan adjustment.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        sub_skill_trace: [{
          sub_skill_id: "scope_router",
          status: "skipped",
          reason_code: "safety_blocks_adjust_plan",
          missing_slots: [],
        }],
        tool_skill_state: toolSkillState({
          status: "fallback",
          missing: [],
          trace: [{
            sub_skill_id: "scope_router",
            status: "skipped",
            reason_code: "safety_blocks_adjust_plan",
            missing_slots: [],
          }],
          summary: "Safety blocks adjust_plan.",
        }),
      },
    };
  }

  let baseState = intakeState({
    message: input.message,
    plan_snapshot: input.plan_snapshot,
    operation_input: input.operation_input,
  });
  const initialTemporalScopeCorrection = downgradeTemporaryWholePlanToLevel({
    state: baseState,
    message: input.message,
    recent_messages: input.recent_messages,
  });
  baseState = initialTemporalScopeCorrection.state;

  const previousDraftValue = objectValue(
    (input.operation_input as any)?.previous_draft,
  );
  const explicitNoApplyRevision = Boolean(previousDraftValue) &&
    isStrongDraftRejectionOrCancel(input.message) &&
    userRequestsDraftRewriteWithoutApply(input.message);
  if (
    previousDraftValue && isStrongDraftRejectionOrCancel(input.message) &&
    !explicitNoApplyRevision
  ) {
    const rejectDecision = draftReviewRejectDecision(
      "user_cancelled_or_rejected_pending_adjust_plan_draft",
    );
    const trace = [
      ...subSkillTraceForState(baseState, missingSlots(baseState)),
      {
        sub_skill_id: "draft_validation" as const,
        status: "ready" as const,
        reason_code: "user_cancelled_or_rejected_pending_draft",
        missing_slots: [],
      },
    ];
    return {
      operation_type: "adjust_plan_item",
      status: "draft_review_decision",
      source,
      phase: "confirmation",
      state_patch: {
        summary:
          "Adjust_plan draft validation cancelled the pending draft from an explicit user rejection.",
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        intake_state: baseState,
        sub_skill_trace: trace,
        operation_input: operationInputFromIntakeState(
          baseState,
          input.operation_input,
        ),
        draft_review_decision: rejectDecision,
        tool_skill_state: toolSkillState({
          status: "cancelled",
          state: baseState,
          missing: [],
          trace,
          summary:
            "Adjust_plan pending draft was cancelled by explicit user rejection.",
        }),
      },
    };
  }
  const userMessageAsksPreValidationDetail = isPreValidationDetailRequest(
    input.message,
  );
  const approvalContainsNewRestriction =
    pendingDraftHasChangeOutsideLatestRestrictedItems(
      previousDraftValue,
      input.message,
    );
  const approvalAddsConcreteConstraint = Boolean(previousDraftValue) &&
    approvalAddsConcreteConstraintWithoutApply(input.message);
  const preValidationConcreteRevision = Boolean(previousDraftValue) &&
    preValidationConcreteRevisionRequest(input.message);
  if (
    approvalAddsConcreteConstraint || explicitNoApplyRevision ||
    preValidationConcreteRevision
  ) {
    const seededRevision = seedStateForConcreteDraftRevision({
      state: baseState,
      previous_draft: previousDraftValue,
      message: input.message,
    });
    baseState = seededRevision.state;
  }

  const filled = await fillStateWithAiIfAvailable({
    base_state: baseState,
    slot_filler: input.slot_filler,
    force_ai_slot_filling: input.force_ai_slot_filling,
    user_id: input.user_id,
    request_id: input.trigger_message_id,
    message: input.message,
    recent_messages: input.recent_messages,
    plan_snapshot: input.plan_snapshot,
    operation_input: input.operation_input,
  });
  const temporalScopeCorrection = downgradeTemporaryWholePlanToLevel({
    state: filled.state,
    message: input.message,
    recent_messages: input.recent_messages,
  });
  const deterministicLevelCompletion = completeCurrentLevelStateFromTranscript({
    state: temporalScopeCorrection.state,
    message: input.message,
    recent_messages: input.recent_messages,
    plan_snapshot: input.plan_snapshot,
  });
  const singleItemLevelReplacement = routeSingleItemLevelReplacementToAction({
    state: deterministicLevelCompletion.state,
    message: input.message,
    recent_messages: input.recent_messages,
    plan_snapshot: input.plan_snapshot,
  });
  const deterministicWholePlanCompletion = completeWholePlanStateFromTranscript(
    {
      state: singleItemLevelReplacement.state,
      message: input.message,
      recent_messages: input.recent_messages,
      plan_snapshot: input.plan_snapshot,
    },
  );
  let state = deterministicWholePlanCompletion.state;
  const coachEnrichment = await enrichStateWithCoachGuidance({
    state,
    coach_guidance_runner: input.coach_guidance_runner,
    force_coach_guidance: input.force_coach_guidance,
    user_id: input.user_id,
    request_id: input.trigger_message_id,
    message: input.message,
    recent_messages: input.recent_messages,
    plan_snapshot: input.plan_snapshot,
    operation_input: input.operation_input,
  });
  state = coachEnrichment.state;
  if (
    state.payload?.scope_kind === "whole_plan" &&
    state.payload.affected_items.status !== "identified" &&
    state.coaching_guidance?.readiness === "draft_ready" &&
    !state.coaching_guidance.next_best_question &&
    !state.coaching_guidance.must_not_execute_reason
  ) {
    const anchorTitles = planItems(input.plan_snapshot)
      .map((item) => item.title)
      .filter(Boolean)
      .slice(0, 2);
    if (anchorTitles.length >= 2) {
      state = {
        ...state,
        payload: {
          ...state.payload,
          affected_items: {
            status: "identified",
            values: anchorTitles,
            evidence: dedupeStrings([
              ...stringList(state.payload.affected_items.evidence),
              "specialized coach draft_ready whole-plan trajectory anchors",
            ]),
          },
        },
      };
    }
  }
  const deterministicDraftRevision = previousDraftValue &&
      (explicitNoApplyRevision ||
        ((!filled.draft_review_decision && approvalContainsNewRestriction) ||
          approvalAddsConcreteConstraint || preValidationConcreteRevision))
    ? {
      decision: "revise" as const,
      confidence: "high" as const,
      evidence: [
        explicitNoApplyRevision
          ? "explicit_no_apply_revision_requires_new_draft"
          : preValidationConcreteRevision
          ? "pre_validation_concrete_constraint_requires_revision"
          : approvalAddsConcreteConstraint
          ? "approval_with_new_concrete_constraint_requires_revision"
          : "latest_user_restricted_affected_items",
      ],
      apply_after_revision: approvalContainsNewRestriction &&
        !approvalAddsConcreteConstraint && !explicitNoApplyRevision,
    }
    : undefined;
  const rawDraftReviewDecision =
    explicitNoApplyRevision || approvalContainsNewRestriction ||
      approvalAddsConcreteConstraint || preValidationConcreteRevision
      ? deterministicDraftRevision
      : filled.draft_review_decision ?? deterministicDraftRevision;
  const previousWholePlanFamily = wholePlanFamilyFromPreviousDraft(
    previousDraftValue,
  );
  const latestWholePlanFamily = currentWholePlanFamily(
    state,
    transcriptUserText({
      message: input.message,
      recent_messages: input.recent_messages,
    }),
  );
  const wholePlanFamilyChanged = Boolean(
    previousWholePlanFamily &&
      latestWholePlanFamily &&
      previousWholePlanFamily !== latestWholePlanFamily,
  );
  const preValidationDetailRequest = previousDraftValue &&
    isPreValidationDetailRequest(input.message);
  const preValidationQuestionOnlyRequest = previousDraftValue &&
    isPreValidationQuestionOnlyRequest(input.message);
  const draftReviewDecision = preValidationQuestionOnlyRequest &&
      rawDraftReviewDecision?.decision === "approve"
    ? {
      ...rawDraftReviewDecision,
      decision: "explain" as const,
      confidence: "high" as const,
      evidence: [
        ...rawDraftReviewDecision.evidence,
        "pre_validation_detail_request_blocks_approval",
      ],
      apply_after_revision: false,
    }
    : preValidationQuestionOnlyRequest &&
        rawDraftReviewDecision?.decision === "revise" &&
        !explicitNoApplyRevision &&
        !approvalAddsConcreteConstraint &&
        !preValidationConcreteRevision
    ? {
      ...rawDraftReviewDecision,
      decision: "explain" as const,
      confidence: "high" as const,
      evidence: [
        ...rawDraftReviewDecision.evidence,
        "pre_validation_detail_request_answers_without_revision",
      ],
      apply_after_revision: false,
    }
    : preValidationDetailRequest &&
        rawDraftReviewDecision?.decision === "revise" &&
        rawDraftReviewDecision.apply_after_revision === true
    ? {
      ...rawDraftReviewDecision,
      evidence: [
        ...rawDraftReviewDecision.evidence,
        "pre_validation_detail_request_blocks_apply_after_revision",
      ],
      apply_after_revision: false,
    }
    : wholePlanFamilyChanged && rawDraftReviewDecision?.decision === "approve"
    ? {
      ...rawDraftReviewDecision,
      decision: "revise" as const,
      confidence: "high" as const,
      evidence: [
        ...rawDraftReviewDecision.evidence,
        `whole_plan_family_changed:${previousWholePlanFamily}->${latestWholePlanFamily}`,
      ],
      apply_after_revision: false,
    }
    : rawDraftReviewDecision;
  const missing = missingSlots(state);
  const intakeOperationInput = {
    ...operationInputFromIntakeState(
      state,
      input.operation_input,
    ),
    coaching_guidance_audit: coachEnrichment.audit,
    ...(coachEnrichment.error
      ? { coaching_guidance_error: coachEnrichment.error }
      : {}),
  };
  const deterministicTrace: AdjustPlanSubSkillTrace[] = [
    ...(initialTemporalScopeCorrection.applied ||
        temporalScopeCorrection.applied
      ? [{
        sub_skill_id: "scope_router" as const,
        status: "ready" as const,
        reason_code: "temporary_load_window_routes_to_current_level",
        missing_slots: [],
      }]
      : []),
    ...(deterministicLevelCompletion.applied
      ? [{
        sub_skill_id: "level_intake" as const,
        status: missing.length
          ? "needs_clarification" as const
          : "ready" as const,
        reason_code: "deterministic_level_transcript_completion",
        missing_slots: missing.filter((slot) =>
          slot.startsWith("current_level.")
        ),
      }]
      : []),
    ...(singleItemLevelReplacement.applied
      ? [{
        sub_skill_id: "scope_router" as const,
        status: "ready" as const,
        reason_code: "single_item_level_replacement_routes_to_action",
        missing_slots: [],
      }]
      : []),
    ...(deterministicWholePlanCompletion.applied
      ? [{
        sub_skill_id: "whole_plan_intake" as const,
        status: missing.length
          ? "needs_clarification" as const
          : "ready" as const,
        reason_code: "deterministic_whole_plan_transcript_completion",
        missing_slots: missing.filter((slot) => slot.startsWith("whole_plan.")),
      }]
      : []),
  ];
  const intakeTrace = [
    ...subSkillTraceForState(state, missing),
    ...(filled.ai_trace ? [filled.ai_trace] : []),
    ...deterministicTrace,
  ];
  if (
    previousDraftValue &&
    draftReviewDecision &&
    draftReviewDecision.decision !== "revise"
  ) {
    return {
      operation_type: "adjust_plan_item",
      status: "draft_review_decision",
      source,
      phase: "confirmation",
      state_patch: {
        summary:
          "Adjust_plan draft validation sub-skill classified the user response.",
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: intakeTrace,
        operation_input: intakeOperationInput,
        draft_review_decision: draftReviewDecision,
        tool_skill_state: toolSkillState({
          status: "awaiting_user_confirmation",
          state,
          missing: [],
          trace: intakeTrace,
          summary: "Adjust_plan draft validation classified the user response.",
        }),
      },
    };
  }
  if (
    !draftReviewDecision &&
    missing.length === 0 &&
    filled.ai_trace?.reason_code === "ai_slot_filler" &&
    (input.force_ai_slot_filling || shouldUseAdjustPlanAiSlotFiller()) &&
    (input.turn_count ?? 0) < 2 &&
    !userExplicitlyRequestsDraftGeneration(
      transcriptUserText({
        message: input.message,
        recent_messages: input.recent_messages,
      }),
    )
  ) {
    const question = filled.next_question?.trim() ||
      await nextQuestionForToolSkill({
        state,
        plan_snapshot: input.plan_snapshot,
        operation_input: intakeOperationInput,
        missing_slots: ["draft_generation_confirmation"],
        question_writer: input.question_writer,
        force_ai_slot_filling: input.force_ai_slot_filling,
        user_id: input.user_id,
        request_id: input.trigger_message_id,
        message: input.message,
        recent_messages: input.recent_messages,
        reason_code: "draft_generation_confirmation",
      });
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "generation",
      next_question: {
        needed: true,
        question,
        reason: "draft_generation_confirmation",
      },
      state_patch: {
        summary:
          "Plan adjustment slots are ready; awaiting draft generation confirmation.",
        phase: "generation",
        missing_slots: ["draft_generation_confirmation"],
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: intakeTrace,
        operation_input: intakeOperationInput,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing: ["draft_generation_confirmation"],
          trace: intakeTrace,
          summary:
            "Adjust_plan has enough slots and is waiting before generating the concrete draft.",
        }),
      },
    };
  }
  if (missing.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "adjust_plan_item",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing plan adjustment slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          intake_state: state,
          sub_skill_trace: intakeTrace,
          operation_input: intakeOperationInput,
          tool_skill_state: toolSkillState({
            status: "fallback",
            state,
            missing,
            trace: intakeTrace,
            summary:
              "Recommendation payload cannot complete adjust_plan required slots.",
          }),
        },
      };
    }
    const maxClarificationTurns =
      state.payload?.scope_kind === "specific_plan_item" ? 2 : 3;
    if ((input.turn_count ?? 0) >= maxClarificationTurns) {
      return {
        operation_type: "adjust_plan_item",
        status: "fallback_dashboard",
        source,
        phase: "exit",
        ack:
          "Je n'ai pas une cible assez claire pour ajuster le plan depuis le chat. Tu peux le faire dans ton espace sur sophia-coach.ai.",
        state_patch: {
          summary: "Plan adjustment fallback dashboard.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          intake_state: state,
          sub_skill_trace: intakeTrace,
          operation_input: intakeOperationInput,
          tool_skill_state: toolSkillState({
            status: "fallback",
            state,
            missing,
            trace: intakeTrace,
            summary:
              "Adjust_plan fell back because required slots stayed open.",
          }),
        },
      };
    }
    const question = await nextQuestionForToolSkill({
      state,
      plan_snapshot: input.plan_snapshot,
      operation_input: intakeOperationInput,
      missing_slots: missing,
      generated_question: filled.next_question,
      question_writer: input.question_writer,
      force_ai_slot_filling: input.force_ai_slot_filling,
      user_id: input.user_id,
      request_id: input.trigger_message_id,
      message: input.message,
      recent_messages: input.recent_messages,
      reason_code: missing[0],
    });
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "scope_resolution",
      next_question: {
        needed: true,
        question,
        reason: missing[0],
      },
      state_patch: {
        summary: "Plan adjustment intake needs scope-specific slots.",
        phase: "scope_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: intakeTrace,
        operation_input: intakeOperationInput,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing,
          trace: intakeTrace,
          summary: "Adjust_plan is collecting scope-specific slots.",
        }),
      },
    };
  }

  const payload = state.payload!;
  const allowedSet = buildAllowedSetForState(state, input.plan_snapshot);
  const proposedLabels = payload.scope_kind !== "specific_plan_item" &&
      Array.isArray(payload.affected_items?.values)
    ? payload.affected_items.values
      .map((value: unknown) => String(value ?? "").trim())
      .filter(Boolean)
    : [];
  const compilerResult: CompilerResult | null = allowedSet
    ? compileAdjustPlanIntent({
      allowed_set: allowedSet,
      proposed_affected_item_labels: proposedLabels,
      proposed_adjustment_type: payload.adjustment_type.value ?? null,
      require_affected_items: payload.scope_kind !== "specific_plan_item",
    })
    : null;
  const compilerTrace = allowedSet && compilerResult
    ? compilerSubSkillTrace(state, compilerResult)
    : null;
  const compilerObservability = allowedSet && compilerResult
    ? compilerObservabilityPayload(allowedSet, compilerResult)
    : null;
  const traceWithCompiler = compilerTrace
    ? [...intakeTrace, compilerTrace]
    : intakeTrace;
  // Strict reject for adjustment_type rules. Items rejection stays
  // observable-only for now (the existing draft validation catches empty
  // affected_items via the materialization block reason).
  if (
    compilerResult && !compilerResult.ok &&
    (compilerResult.reason_code === "adjustment_type_forbidden" ||
      compilerResult.reason_code ===
        "adjustment_type_requires_explicit_request")
  ) {
    const reasonCode = compilerResult.reason_code;
    const operationInputWithCompiler = {
      ...intakeOperationInput,
      compiler_run: compilerObservability,
    };
    const question = await nextQuestionForToolSkill({
      state,
      plan_snapshot: input.plan_snapshot,
      operation_input: operationInputWithCompiler,
      missing_slots: compilerTrace!.missing_slots,
      question_writer: input.question_writer,
      force_ai_slot_filling: input.force_ai_slot_filling,
      user_id: input.user_id,
      request_id: input.trigger_message_id,
      message: input.message,
      recent_messages: input.recent_messages,
      reason_code: reasonCode,
    });
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "scope_resolution",
      next_question: {
        needed: true,
        question,
        reason: reasonCode,
      },
      state_patch: {
        summary:
          "Adjust_plan compiler blocked the proposed adjustment type until an explicit user signal is captured.",
        phase: "scope_resolution",
        missing_slots: compilerTrace!.missing_slots,
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: traceWithCompiler,
        operation_input: operationInputWithCompiler,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing: compilerTrace!.missing_slots,
          trace: traceWithCompiler,
          summary:
            "Adjust_plan compiler requires an explicit user signal before applying this adjustment type.",
        }),
      },
    };
  }
  // For current_level we drop AI-proposed items that are not editable
  // under the matrix (clarifications, operation_bridge, pending without
  // explicit signal, etc). The compiler observability (above) records
  // exactly what was kept and what was dropped, so QA can see the gap
  // without guessing. For other scopes we pass the AI's labels through;
  // the generator validates them against materialization_candidates.
  const payloadWithAffected = payload as {
    affected_items?: { values?: unknown };
  };
  const rawAffectedItemValues = Array.isArray(
      payloadWithAffected.affected_items?.values,
    )
    ? payloadWithAffected.affected_items.values.map((item) => String(item))
    : [];
  const affectedItemValues = payload.scope_kind === "current_level"
    ? editableAffectedItemValuesForCurrentLevel(
      rawAffectedItemValues,
      input.plan_snapshot,
    )
    : rawAffectedItemValues;
  const inferredWholePlanFamily = payload.scope_kind === "whole_plan"
    ? inferWholePlanFamilyFromText(
      transcriptUserText({
        message: input.message,
        recent_messages: input.recent_messages,
      }),
    )
    : null;
  const wholePlanPayload = payload.scope_kind === "whole_plan"
    ? payload as WholePlanAdjustmentPayload
    : null;
  const actionPayload = payload.scope_kind === "specific_plan_item"
    ? payload as ActionAdjustmentPayload
    : null;
  const levelPayload = payload.scope_kind === "current_level"
    ? payload as LevelAdjustmentPayload
    : null;
  const generatorConstraints = [
    "ask_confirmation_before_write",
    ...sanitizeGeneratorConstraints(
      Array.isArray(payload.constraints?.values)
        ? payload.constraints.values
        : [],
      input.message,
    ),
    ...(payload.scope_kind === "current_level"
      ? levelBoundaryConstraintsForRequest(
        transcriptUserText({
          message: input.message,
          recent_messages: input.recent_messages,
        }),
      )
      : []),
    ...(payload.scope_kind === "whole_plan"
      ? wholePlanDetailConstraintsForRequest(
        transcriptUserText({
          message: input.message,
          recent_messages: input.recent_messages,
        }),
      )
      : []),
    ...coachGuidanceConstraints(state.coaching_guidance),
    ...(payload.scope_kind === "specific_plan_item"
      ? dedupeStrings([
        actionRequestCategoryConstraint(actionPayload) ?? "",
      ])
      : []),
    ...(payload.scope_kind === "current_level"
      ? dedupeStrings([
        levelRequestCategoryConstraint(levelPayload) ?? "",
      ])
      : []),
    ...(payload.scope_kind === "whole_plan"
      ? dedupeStrings([
        wholePlanFamilyConstraint(wholePlanPayload, state.coaching_guidance) ??
          (inferredWholePlanFamily
            ? `whole_plan_change_family:${inferredWholePlanFamily.family}`
            : ""),
        wholePlanOperationConstraint(
          wholePlanPayload,
          state.coaching_guidance,
        ) ??
          (inferredWholePlanFamily
            ? `whole_plan_candidate_operation:${inferredWholePlanFamily.operation}`
            : ""),
        wholePlanReadinessConstraint(
          wholePlanPayload,
          state.coaching_guidance,
        ) ??
          (inferredWholePlanFamily
            ? `whole_plan_readiness:${inferredWholePlanFamily.readiness}`
            : ""),
      ])
      : []),
    ...(payload.scope_kind !== "specific_plan_item"
      ? affectedItemValues.map((item) => `affected_item:${item}`)
      : []),
  ];
  const request = buildOperationDraftRequest({
    operation_type: "adjust_plan_item",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
    diagnosis: {
      confidence: state.target_granularity.confidence === "high"
        ? 0.85
        : state.target_granularity.confidence === "medium"
        ? 0.65
        : 0.45,
      constraints: generatorConstraints,
    },
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    scope: any;
    adjustment_type: any;
    reason: any;
    reason_change?: PlanAdjustmentGeneratorInput["reason_change"];
    change_target?: PlanAdjustmentGeneratorInput["change_target"];
    decision_basis?: PlanAdjustmentGeneratorInput["decision_basis"];
    coaching_guidance?: PlanAdjustmentGeneratorInput["coaching_guidance"];
    materialization_candidates?: PlanAdjustmentGeneratorInput[
      "materialization_candidates"
    ];
    allowed_patch_fields: string[];
  };
  request.scope = generatorScope(state);
  request.adjustment_type = generatorAdjustmentType(payload);
  request.reason = generatorReason(payload, input.message);
  request.reason_change = generatorReasonChange(payload);
  request.change_target = generatorChangeTarget(payload);
  request.decision_basis = generatorDecisionBasis(state, input.message);
  request.coaching_guidance = state.coaching_guidance ?? null;
  request.materialization_candidates = projectPlanItemsForGenerator(
    input.plan_snapshot,
  );
  request.allowed_patch_fields = allowedPatchFields(payload.scope_kind);
  const operationInput = {
    ...intakeOperationInput,
    scope: request.scope,
    intake_state: state,
    payload,
    adjustment_type: request.adjustment_type,
    reason_change: request.reason_change,
    change_target: request.change_target,
    decision_basis: request.decision_basis,
    coaching_guidance: request.coaching_guidance ?? null,
    coaching_guidance_audit: coachEnrichment.audit,
    adjust_plan_sub_skills: ADJUST_PLAN_SUB_SKILLS,
    ...(compilerObservability ? { compiler_run: compilerObservability } : {}),
    ...(coachEnrichment.error
      ? { coaching_guidance_error: coachEnrichment.error }
      : {}),
  };
  let draft: PlanAdjustmentDraftV1;
  const generatorInput = buildPlanAdjustmentPayload(request);
  const deterministicImmediateDraft = deterministicWholePlanDirectionalDraft(
    generatorInput,
  ) ??
    deterministicCurrentLevelCopyForwardDraft(
      generatorInput,
    );
  if (deterministicImmediateDraft) {
    draft = deterministicImmediateDraft;
  } else {
    try {
      draft = await runPlanAdjustmentGenerator(
        generatorInput,
        {
          adjust_plan_result_writer: input.adjust_plan_result_writer,
          request_id: input.trigger_message_id,
          user_id: input.user_id,
        },
      );
    } catch (error) {
      if (!isPlanAdjustmentDraftContractError(error)) throw error;
      const reasonCode = error instanceof Error
        ? error.message
        : "adjust_plan_result_contract_error";
      const deterministicDraft = deterministicWholePlanDirectionalDraft(
        generatorInput,
      ) ?? deterministicCurrentLevelCopyForwardDraft(generatorInput) ??
        deterministicCurrentLevelLoadDraft(generatorInput);
      if (deterministicDraft) {
        draft = deterministicDraft;
      } else {
        const question = await nextQuestionForToolSkill({
          state,
          plan_snapshot: input.plan_snapshot,
          operation_input: operationInput,
          missing_slots: ["draft_generation_retry_needed"],
          question_writer: input.question_writer,
          force_ai_slot_filling: input.force_ai_slot_filling,
          user_id: input.user_id,
          request_id: input.trigger_message_id,
          message: input.message,
          recent_messages: input.recent_messages,
          reason_code: reasonCode,
        });
        return {
          operation_type: "adjust_plan_item",
          status: "ask_question",
          source,
          phase: "generation",
          next_question: {
            needed: true,
            question,
            reason: reasonCode,
          },
          state_patch: {
            summary:
              "Plan adjustment draft generation stayed inside the skill after a contract validation failure.",
            phase: "generation",
            missing_slots: ["draft_generation_retry_needed"],
            turn_count_increment: 1,
            intake_state: state,
            sub_skill_trace: intakeTrace,
            draft_review_decision: draftReviewDecision,
            operation_input: operationInput,
            tool_skill_state: toolSkillState({
              status: "collecting",
              state,
              missing: ["draft_generation_retry_needed"],
              trace: intakeTrace,
              summary:
                "Adjust_plan draft generation needs a cleaner retry before confirmation.",
            }),
          },
        };
      }
    }
  }
  const draftValidation = runAdjustPlanDraftValidationSubSkill({ draft });
  const tailTrace = compilerTrace
    ? [...intakeTrace, compilerTrace, draftValidation.trace]
    : [...intakeTrace, draftValidation.trace];
  if (draftValidation.reason_code) {
    const question = await nextQuestionForToolSkill({
      state,
      plan_snapshot: input.plan_snapshot,
      operation_input: operationInput,
      missing_slots: draftValidation.review.issues.length
        ? draftValidation.review.issues
        : ["materialized_changed_items"],
      question_writer: input.question_writer,
      force_ai_slot_filling: input.force_ai_slot_filling,
      user_id: input.user_id,
      request_id: input.trigger_message_id,
      message: input.message,
      recent_messages: input.recent_messages,
      reason_code: draftValidation.reason_code,
      draft,
    });
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "generation",
      draft,
      next_question: {
        needed: true,
        question,
        reason: draftValidation.reason_code,
      },
      state_patch: {
        summary:
          "Plan adjustment needs concrete plan item materialization before execution.",
        phase: "generation",
        missing_slots: ["materialized_changed_items"],
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: tailTrace,
        draft_review_decision: draftReviewDecision,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing: ["materialized_changed_items"],
          trace: tailTrace,
          draftValidation: draftValidation.review,
          summary:
            "Adjust_plan draft needs revision or concrete materialization.",
        }),
        operation_input: operationInput,
      },
    };
  }
  return {
    operation_type: "adjust_plan_item",
    status: "pending_confirmation",
    source,
    phase: "confirmation",
    draft,
    confirmation: {
      required: true,
      message: draft.confirmation_message,
      actions: ["yes", "no"],
    },
    pending_confirmation: {
      operation_id: request.operation_id,
      operation_type: "adjust_plan_item",
      source,
      summary: draft.draft.title,
      draft,
      operation_input: operationInput,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Plan adjustment draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      intake_state: state,
      sub_skill_trace: tailTrace,
      draft_review_decision: draftReviewDecision,
      tool_skill_state: toolSkillState({
        status: "awaiting_user_confirmation",
        state,
        missing: [],
        trace: tailTrace,
        draftValidation: draftValidation.review,
        summary:
          "Adjust_plan draft is validated and waiting for user confirmation.",
      }),
      operation_input: operationInput,
    },
  };
}

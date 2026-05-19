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
  const explicitlyReviewOnly =
    /\b(n'applique pas|ne l'applique pas|n'applique rien|ne rien appliquer|sans appliquer|sans l'appliquer|pas encore|seulement|juste|uniquement|pour relire|juste relire|avant validation|avant de valider|sans valider|pas sure d'appliquer|pas sur d'appliquer)\b/
      .test(normalized);
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
    adjustment_type: { status: "missing", evidence: [] },
    reason: { status: "missing", evidence: [] },
    constraints: { status: "missing", values: [], evidence: [] },
  };
}

function emptyLevelPayload(): LevelAdjustmentPayload {
  return {
    scope_kind: "current_level",
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
    source.constraints == null
  ) return null;
  if (scopeKind === "specific_plan_item") {
    return {
      ...emptyActionPayload(),
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
    /\b(n'applique pas|ne l'applique pas|n'applique rien|pas encore|sans appliquer|sans l'appliquer|avant validation)\b/
      .test(normalized);
  return mentionsDraft && asksRevision && reviewOnly;
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
    adjustment_type: { ...payload.adjustment_type },
    reason: { ...payload.reason },
    reason_change: { ...payload.reason_change },
    change_target: { ...payload.change_target },
    constraints: { ...payload.constraints },
    affected_items: { ...payload.affected_items },
  };
  const evidence: string[] = [];

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
    /\b(brouillon|proposition|propose|prepare|preparer|montre|fais moi|faire le brouillon)\b/
      .test(normalized);
  const structuralSignal =
    /\b(trajectoire|suite du plan|plan global|objectif global|etape|phase|partie|reorganis|reordon|ralent|transition|coherent|avant de|apres)\b/
      .test(normalized);
  if (!asksForDraft && !structuralSignal) {
    return { state: input.state, applied: false, evidence: [] };
  }

  const planTitles = planItems(input.plan_snapshot)
    .map((item) => item.title)
    .filter(Boolean);
  const mentionedTitles = planTitles.filter((title) =>
    textMentionsPlanTitle(text, title)
  );
  const affectedValues = dedupeStrings([
    ...stringList(payload.affected_items.values),
    ...mentionedTitles,
    ...(asksForDraft && structuralSignal && mentionedTitles.length < 2
      ? planTitles.slice(0, 2)
      : []),
  ]).slice(0, 6);

  const nextPayload: WholePlanAdjustmentPayload = {
    ...payload,
    adjustment_type: { ...payload.adjustment_type },
    reason: { ...payload.reason },
    reason_change: { ...payload.reason_change },
    change_target: { ...payload.change_target },
    constraints: { ...payload.constraints },
    affected_items: { ...payload.affected_items },
  };
  const evidence: string[] = [];

  if (nextPayload.adjustment_type.status === "missing" && structuralSignal) {
    nextPayload.adjustment_type = {
      status: "identified",
      value: "resequence",
      evidence: ["deterministic whole-plan structural sequence signal"],
    };
    evidence.push("adjustment_type");
  }
  if (
    nextPayload.reason.status === "missing" &&
    /\b(trop rapide|complex|sensible|coherent|coherence|transition|pas pret|pas prete)\b/
      .test(normalized)
  ) {
    nextPayload.reason = {
      status: "identified",
      value: "bad_fit",
      evidence: ["deterministic whole-plan fit/complexity signal"],
    };
    evidence.push("reason");
  }
  if (nextPayload.reason_change.status === "missing" && structuralSignal) {
    nextPayload.reason_change = {
      status: "identified",
      value: "structure_bad_fit",
      evidence: ["deterministic whole-plan structural mismatch signal"],
    };
    evidence.push("reason_change");
  }
  if (nextPayload.change_target.status === "missing" && structuralSignal) {
    nextPayload.change_target = {
      status: "identified",
      value: "sequence",
      evidence: ["deterministic whole-plan resequencing target"],
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
  if (asksForDraft && structuralSignal) {
    nextPayload.constraints = {
      status: "identified",
      values: dedupeStrings([
        ...stringList(payload.constraints.values),
        "whole_plan_directional_draft_ready",
        "preserve_plan_intent",
      ]),
      evidence: dedupeStrings([
        ...stringList(payload.constraints.evidence),
        "deterministic whole-plan draft readiness",
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

function deterministicWholePlanDirectionalDraft(
  input: PlanAdjustmentGeneratorInput,
): PlanAdjustmentDraftV1 | null {
  if (
    input.scope.kind !== "whole_plan" ||
    !input.constraints.includes("whole_plan_directional_draft_ready")
  ) return null;
  const candidates = (input.materialization_candidates ?? [])
    .filter((candidate) =>
      String(candidate.clarification_type ?? "").trim() !== "clarification" &&
      String(candidate.dimension ?? "").trim() !== "clarifications"
    )
    .slice(0, 3);
  if (candidates.length < 2) return null;
  const changedItems = candidates.slice(0, 2).map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    capability: "modify_existing_action" as const,
    id: candidate.id,
    title: candidate.title,
    before: candidate.description ?? candidate.cadence_label ?? null,
    after:
      "À replacer dans une trajectoire plus progressive: consolider le signal de pause et une réparation simple avant les conversations plus sensibles.",
    reason:
      "Le user demande de ralentir la transition globale sans changer l'objectif du plan.",
  }));
  const preserved = candidates.slice(2).map((candidate) => ({
    kind:
      (String(candidate.kind ?? candidate.item_type ?? "").includes("habit")
        ? "habit"
        : "action") as "action" | "habit",
    id: candidate.id,
    title: candidate.title,
    reason:
      "L'action reste comme soutien; le changement concerne la trajectoire et l'ordre de progression.",
  }));
  const summary =
    "Ralentir la trajectoire globale en ajoutant une étape intermédiaire centrée sur le signal de pause et une réparation simple avant les conversations plus sensibles.";
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      adjustment_type: input.adjustment_type,
      execution_strategy: "whole_plan_adjustment",
      proposed_change: summary,
      why_it_helps:
        "Cela garde l'objectif global, mais ajoute un prérequis de sécurité relationnelle avant de monter en complexité.",
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
        expected_mechanism:
          "Ajouter une étape de consolidation réduit le saut de difficulté avant les sujets sensibles.",
        success_condition:
          "Le prochain plan garde le même objectif mais avance plus progressivement.",
      },
      ack_summary: {
        changed: [
          "Insertion d'une étape intermédiaire de consolidation avant les conversations sensibles.",
        ],
        unchanged: [
          "Objectif global du plan",
          "Rôle du signal de pause",
          "Actions de soutien existantes sauf réordonnancement nécessaire",
        ],
        why_it_helps:
          "La progression devient plus cohérente avec le rythme de sécurité du user.",
        confidence: "medium",
        follow_up_needed:
          "Valider avant régénération; le détail exact sera produit dans le plan ajusté.",
      },
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          summary,
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
          user_problem:
            "La prochaine étape semble arriver trop vite avant des conversations plus sensibles.",
          why_this_change:
            "Une étape intermédiaire rend la trajectoire plus progressive et plus sécurisante.",
          expected_effect:
            "Le plan avance sans surcharger le user ni casser l'objectif global.",
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
    confirmation_message:
      "Je peux te proposer d'ajuster le plan global en gardant le même objectif, mais en insérant une étape intermédiaire avant les conversations plus sensibles. Cette étape consoliderait le signal de pause et une réparation simple après conflit. Rien n'est appliqué tant que tu ne valides pas.",
    execution_message:
      "C'est fait: j'ai ajusté la trajectoire du plan pour ralentir la transition et consolider le signal de pause avec une réparation simple avant les conversations plus sensibles.",
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

  // ----------------------------------------------------------------------
  // Deterministic confirmation shortcut.
  //
  // When a previous draft is pending and the dispatcher's TurnFrame has
  // classified the user's reply as a clear "yes" or "no", we MUST NOT
  // re-enter the AI slot filler. The slot filler is unreliable at
  // recognising a confirmation that is mixed with a paraphrase of the
  // already-shown draft (real-world example: "Oui, applique cette version:
  // point positif a 2j/sem, phrase neutre..."). Trusting the structured
  // confirmation_response.kind from the dispatcher gives us a hard
  // guarantee that the operation runtime will move from pending_confirmation
  // to executed/cancelled without looping back to clarification.
  //
  // We only shortcut on "yes"/"no". A "correction_to_pending" still goes
  // through the slot filler so the draft can be regenerated. An "unknown"
  // or "topic_change" also stays in the existing flow so the AI can
  // decide whether to keep or drop the pending draft.
  //
  // Defensive guard: even when the dispatcher's kind is "yes" or "no", we
  // refuse the shortcut when the user message clearly contains a question
  // (a "?" or an explain-marker like "tu peux me dire", "explique-moi",
  // "concrètement"). Production dispatchers occasionally misclassify a
  // pre-confirmation detail request as "yes" because the message contains
  // the lemma "oui"; the lexical guard preserves the existing
  // "show details before committing" UX without weakening the trust we
  // place in the structured signal in normal cases.
  // ----------------------------------------------------------------------
  const previousDraftValue = objectValue(
    (input.operation_input as any)?.previous_draft,
  );
  const confirmationResponseKind = String(
    (input.operation_input as any)?.confirmation_response_kind ?? "",
  ).trim();
  const userMessageLower = String(input.message ?? "").toLowerCase();
  const userMessageContainsQuestion = /\?/.test(userMessageLower);
  const userMessageContainsExplainMarker =
    /\b(explique[- ]?moi|tu peux me dire|peux[- ]?tu me dire|peux[- ]?tu m'expliquer|c'est quoi|comment ça|qu'est[- ]?ce que|concretement|concr[eè]tement|montre[- ]?moi|d[eé]taille[- ]?moi)\b/
      .test(userMessageLower);
  const userMessageAsksPreValidationDetail = isPreValidationDetailRequest(
    input.message,
  );
  const approvalContainsNewRestriction =
    pendingDraftHasChangeOutsideLatestRestrictedItems(
      previousDraftValue,
      input.message,
    );
  if (
    previousDraftValue &&
    (confirmationResponseKind === "yes" || confirmationResponseKind === "no") &&
    !userMessageContainsQuestion &&
    !userMessageContainsExplainMarker &&
    !userMessageAsksPreValidationDetail &&
    !approvalContainsNewRestriction
  ) {
    const decision: "approve" | "reject" = confirmationResponseKind === "yes"
      ? "approve"
      : "reject";
    const draftReviewDecision: NonNullable<
      AdjustPlanItemOperationOutput["state_patch"]["draft_review_decision"]
    > = {
      decision,
      confidence: "high",
      evidence: [`confirmation_response.kind=${confirmationResponseKind}`],
      apply_after_revision: false,
    };
    const shortcutTrace: AdjustPlanSubSkillTrace[] = [{
      sub_skill_id: "draft_validation",
      status: "ready_for_confirmation",
      reason_code: `deterministic_${decision}_shortcut`,
      missing_slots: [],
    }];
    const shortcutOperationInput = {
      ...(input.operation_input ?? {}),
      intake_state: baseState,
      draft_review_decision_source: "deterministic_confirmation_response_kind",
    } as Record<string, unknown>;
    return {
      operation_type: "adjust_plan_item",
      status: "draft_review_decision",
      source,
      phase: "confirmation",
      state_patch: {
        summary:
          `Adjust_plan deterministic ${decision} shortcut from confirmation_response.kind.`,
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        intake_state: baseState,
        sub_skill_trace: shortcutTrace,
        operation_input: shortcutOperationInput,
        draft_review_decision: draftReviewDecision,
        tool_skill_state: toolSkillState({
          status: "awaiting_user_confirmation",
          state: baseState,
          missing: [],
          trace: shortcutTrace,
          summary: `Adjust_plan ${
            decision === "approve" ? "approved" : "rejected"
          } the pending draft via deterministic shortcut.`,
        }),
      },
    };
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
  const deterministicWholePlanCompletion = completeWholePlanStateFromTranscript(
    {
      state: deterministicLevelCompletion.state,
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
  const deterministicDraftRevision = previousDraftValue &&
      ((!filled.draft_review_decision &&
        confirmationResponseKind === "correction_to_pending" &&
        isExplicitDraftRevisionRequest(input.message)) ||
        approvalContainsNewRestriction)
    ? {
      decision: "revise" as const,
      confidence: "high" as const,
      evidence: [
        ...(approvalContainsNewRestriction
          ? ["latest_user_restricted_affected_items"]
          : [
            "confirmation_response.kind=correction_to_pending",
            "explicit_draft_revision_request",
          ]),
      ],
      apply_after_revision: approvalContainsNewRestriction,
    }
    : undefined;
  const rawDraftReviewDecision = approvalContainsNewRestriction
    ? deterministicDraftRevision
    : filled.draft_review_decision ?? deterministicDraftRevision;
  const preValidationDetailRequest = previousDraftValue &&
    isPreValidationDetailRequest(input.message);
  const draftReviewDecision = preValidationDetailRequest &&
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
    ...coachGuidanceConstraints(state.coaching_guidance),
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
    );
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

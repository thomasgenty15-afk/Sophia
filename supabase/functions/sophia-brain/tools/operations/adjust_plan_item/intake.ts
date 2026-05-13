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
  type AdjustPlanSlotFiller,
  fillAdjustPlanSlotsWithAi,
  shouldUseAdjustPlanAiSlotFiller,
} from "./slot_filler.ts";
import {
  ADJUST_PLAN_STAGE_ORDER,
  ADJUST_PLAN_SUB_SKILLS,
  type AdjustPlanSubSkillId,
  type AdjustPlanSubSkillTrace,
  type AdjustPlanToolSkillState,
  type DraftReviewState,
} from "./workflow.ts";

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
};

export type AdjustPlanIntakeState = {
  target_granularity: TargetGranularitySlot;
  scope: AdjustPlanScopeSlot;
  selected_sub_skill?: AdjustPlanSubSkillId;
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
    operation_input?: Record<string, unknown>;
  };
};

type SnapshotItem = {
  id: string;
  title: string;
  description: string;
};

function planItems(planSnapshot: unknown): SnapshotItem[] {
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items.map((item: any) => ({
    id: String(item?.id ?? ""),
    title: String(item?.title ?? ""),
    description: String(item?.description ?? ""),
  })).filter((item: SnapshotItem) => item.id && item.title);
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
  };
}

function emptyIntakeState(): AdjustPlanIntakeState {
  return {
    target_granularity: emptyTargetGranularitySlot(),
    scope: emptyScopeSlot(),
    payload: null,
  };
}

function structuredIntakeState(
  operationInput?: Record<string, unknown> | null,
): AdjustPlanIntakeState {
  const opInput = operationInput ?? {};
  const base = emptyIntakeState();
  const existingState = objectValue((opInput as any).intake_state);
  if (existingState) {
    return ensurePayloadMatchesScope({
      state: mergeAiStatePatch(base, existingState),
      operation_input: opInput,
    });
  }
  const scope = scopeFromOperationInput(opInput);
  if (!scope) return base;
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
  if (payload.reason.status === "missing") {
    missing.push("current_level.reason");
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
  if (payload.reason.status === "missing") {
    missing.push("whole_plan.reason");
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
  if (state.payload.reason.status === "missing") {
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
    draft_validation: args.draftValidation,
  };
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
}> {
  const filler = input.slot_filler ??
    (input.force_ai_slot_filling || shouldUseAdjustPlanAiSlotFiller()
      ? fillAdjustPlanSlotsWithAi
      : null);
  if (!filler) return { state: input.base_state };
  try {
    const filled = await filler({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages ?? [],
      plan_snapshot: input.plan_snapshot,
      current_state: input.base_state,
      operation_input: input.operation_input,
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
  if (scope !== "action" && changed.length < 2) {
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
    return `Avant de modifier ce niveau, qu'est-ce qui le rend trop lourd concretement, et quoi faut-il changer en premier: nombre d'actions, intensite, timing, ou priorite ?${context}`;
  }
  if (
    state.payload?.scope_kind === "whole_plan" &&
    (state.payload.reason_change.status === "missing" ||
      state.payload.change_target.status === "missing")
  ) {
    return `Avant de toucher au plan global, quel est le vrai reason_change et quelle cible faut-il modifier: nombre de missions, intensite/frequence, ordre, ou charge globale ? Qu'est-ce qu'il faut absolument preserver ?${context}`;
  }
  if (state.payload?.scope_kind === "current_level") {
    return "Tu veux alleger la charge, changer le focus, reequilibrer, ou mettre le niveau en pause ?";
  }
  if (state.payload?.scope_kind === "whole_plan") {
    return "Tu veux reduire la charge globale, changer l'objectif, reordonner le plan, ou repartir sur une nouvelle base ?";
  }
  return "Tu veux plutot reduire, clarifier, remplacer, reequilibrer, ou mettre en pause cette action ?";
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

function allowedPatchFields(scopeKind: ScopeKind): string[] {
  if (scopeKind === "specific_plan_item") {
    return ["difficulty", "duration_minutes", "instruction", "paused"];
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

function materializationCandidates(planSnapshot: unknown): Array<{
  id: string;
  title: string;
  description?: string | null;
}> {
  return planItems(planSnapshot).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description || null,
  }));
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

  const baseState = intakeState({
    message: input.message,
    plan_snapshot: input.plan_snapshot,
    operation_input: input.operation_input,
  });
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
  const state = filled.state;
  const missing = missingSlots(state);
  const intakeTrace = filled.ai_trace
    ? [...subSkillTraceForState(state, missing), filled.ai_trace]
    : subSkillTraceForState(state, missing);
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
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "scope_resolution",
      next_question: {
        needed: true,
        question: filled.next_question ??
          nextQuestion(state, input.plan_snapshot),
        reason: missing[0],
      },
      state_patch: {
        summary: "Plan adjustment intake needs scope-specific slots.",
        phase: "scope_resolution",
        missing_slots: missing,
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: intakeTrace,
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
      constraints: ["ask_confirmation_before_write"],
    },
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    scope: any;
    adjustment_type: any;
    reason: any;
    reason_change?: PlanAdjustmentGeneratorInput["reason_change"];
    change_target?: PlanAdjustmentGeneratorInput["change_target"];
    decision_basis?: PlanAdjustmentGeneratorInput["decision_basis"];
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
  request.materialization_candidates = materializationCandidates(
    input.plan_snapshot,
  );
  request.allowed_patch_fields = allowedPatchFields(payload.scope_kind);
  const operationInput = {
    ...(input.operation_input ?? {}),
    scope: request.scope,
    intake_state: state,
    payload,
    adjustment_type: request.adjustment_type,
    reason_change: request.reason_change,
    change_target: request.change_target,
    decision_basis: request.decision_basis,
    adjust_plan_sub_skills: ADJUST_PLAN_SUB_SKILLS,
  };
  const draft = await runPlanAdjustmentGenerator(
    buildPlanAdjustmentPayload(request),
    {
      adjust_plan_result_writer: input.adjust_plan_result_writer,
      request_id: input.trigger_message_id,
      user_id: input.user_id,
    },
  );
  const draftValidation = runAdjustPlanDraftValidationSubSkill({ draft });
  if (draftValidation.reason_code) {
    const scopeLabel = payload.scope_kind === "whole_plan"
      ? "le plan global"
      : "ce niveau";
    return {
      operation_type: "adjust_plan_item",
      status: "ask_question",
      source,
      phase: "generation",
      draft,
      next_question: {
        needed: true,
        question:
          `Je peux préparer l'allègement de ${scopeLabel}, mais avant de l'appliquer il faut choisir les actions exactes du plan et le type de changement. Je peux modifier une action, changer sa fréquence, la mettre en pause, créer une action pont, retirer une action du niveau, réordonner les actions, rééquilibrer la charge, ou ajuster la durée du niveau. Quelles actions tu veux toucher en priorité, et de quelle façon ?`,
        reason: draftValidation.reason_code,
      },
      state_patch: {
        summary:
          "Plan adjustment needs concrete plan item materialization before execution.",
        phase: "generation",
        missing_slots: ["materialized_changed_items"],
        turn_count_increment: 1,
        intake_state: state,
        sub_skill_trace: [...intakeTrace, draftValidation.trace],
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing: ["materialized_changed_items"],
          trace: [...intakeTrace, draftValidation.trace],
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
      sub_skill_trace: [...intakeTrace, draftValidation.trace],
      tool_skill_state: toolSkillState({
        status: "awaiting_user_confirmation",
        state,
        missing: [],
        trace: [...intakeTrace, draftValidation.trace],
        draftValidation: draftValidation.review,
        summary:
          "Adjust_plan draft is validated and waiting for user confirmation.",
      }),
      operation_input: operationInput,
    },
  };
}

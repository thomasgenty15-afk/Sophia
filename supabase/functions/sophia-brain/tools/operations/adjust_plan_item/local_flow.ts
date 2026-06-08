import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  AdjustPlanChangeKind,
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
  AdjustPlanScopeKind,
} from "./contract.ts";

export type AdjustPlanLocalStage =
  | "scope"
  | "adjustment_need"
  | "constraints"
  | "handoff"
  | "closing";

export type AdjustPlanLocalFlowAction =
  | "answer_current_field"
  | "clarify_scope"
  | "clarify_adjustment_need"
  | "clarify_constraints"
  | "prepare_plan_handoff"
  | "revise_plan_handoff"
  | "repeat_plan_handoff"
  | "platform_destination_followup"
  | "explain_handoff"
  | "get_info_db"
  | "apply_attempt"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type AdjustPlanVisibleTaskKind =
  | "clarify_scope"
  | "clarify_adjustment_need"
  | "clarify_constraints"
  | "plan_handoff_ready"
  | "revise_plan_handoff"
  | "repeat_plan_handoff"
  | "destination_short"
  | "explain_handoff"
  | "apply_attempt"
  | "cancel_close"
  | "exit_or_cancel"
  | "safety"
  | "none";

export type AdjustPlanLocalScope = {
  kind: AdjustPlanScopeKind;
  confidence: "low" | "medium" | "high";
  plan_id: string | null;
  plan_title: string | null;
  level_id: string | null;
  level_title: string | null;
  plan_item_ids: string[];
  target_summary: string | null;
  needs_scope_clarification: boolean;
};

export type AdjustPlanLocalNeed = {
  reason_change: string | null;
  requested_change: string | null;
  change_kind: AdjustPlanChangeKind | null;
  constraints: string[];
  preserve: string[];
  avoid: string[];
  missing: string[];
};

export type AdjustPlanPlatformHandoff = {
  status:
    | "none"
    | "draft_ready"
    | "delivered"
    | "revised"
    | "repeat"
    | "apply_attempt"
    | "cancelled";
  destination: "Plan" | null;
  suggested_platform_input: string | null;
  grouped_by_plan: Array<{
    plan_id: string | null;
    plan_title: string | null;
    suggested_platform_input: string;
  }>;
  previous_value: string | null;
  revised_value: string | null;
};

export type AdjustPlanLocalState = {
  skill_id: "adjust_plan_item";
  operation_type: "adjust_plan_item";
  mode: "platform_handoff";
  status:
    | "collecting"
    | "clarifying"
    | "handoff_ready"
    | "handoff_delivered"
    | "revising"
    | "apply_attempt"
    | "cancelled"
    | "exit_to_global"
    | "safety";
  stage: AdjustPlanLocalStage;
  scope: AdjustPlanLocalScope;
  adjustment_need: AdjustPlanLocalNeed;
  platform_handoff: AdjustPlanPlatformHandoff;
  last_visible_task: AdjustPlanVisibleTaskKind | null;
  last_handoff_summary: string | null;
  turn_count: number;
  subskill_history: Array<Record<string, unknown>>;
};

export type AdjustPlanLocalDispatcherOutput = {
  flow_action: AdjustPlanLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  adjust_plan_intent: {
    kind:
      | "start_or_continue"
      | "scope_answer"
      | "need_answer"
      | "constraint_answer"
      | "handoff_request"
      | "handoff_revision"
      | "repeat"
      | "destination"
      | "explain"
      | "apply_attempt"
      | "cancel"
      | "off_topic"
      | "safety"
      | "unclear";
    summary: string;
  };
  scope: AdjustPlanLocalScope;
  adjustment_need: AdjustPlanLocalNeed;
  platform_handoff: AdjustPlanPlatformHandoff;
  state_updates: {
    status: AdjustPlanLocalState["status"];
    stage: AdjustPlanLocalStage;
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: AdjustPlanVisibleTaskKind;
    instruction: string;
  };
  subskill_call: {
    needed: boolean;
    skill_id: "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  exit_memo: {
    needed: boolean;
    reason:
      | "topic_change"
      | "explicit_tool_request"
      | "product_help"
      | "status_question"
      | "preference_update"
      | "normal_coaching"
      | "safety"
      | "unknown"
      | "none";
    user_intent_summary: string | null;
    local_flow_context: Record<string, unknown> | null;
    handoff_hint_for_global_dispatcher: Record<string, unknown> | null;
  };
  evidence: string[];
};

export type AdjustPlanLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: unknown;
  local_state: AdjustPlanLocalState | null;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
  plan_snapshot?: unknown;
};

export type AdjustPlanReducerResult = {
  status:
    | "collecting"
    | "clarifying"
    | "handoff_delivered"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "topic_change"
    | "blocked";
  reason_code: string;
  local_state: AdjustPlanLocalState | null;
  draft: AdjustPlanHandoffDraft | null;
  visible_task: AdjustPlanVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  get_info_db: boolean;
  subskill_context: Record<string, unknown> | null;
  risk_score: number;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  exit_memo: AdjustPlanLocalDispatcherOutput["exit_memo"] | null;
};

const FLOW_ACTIONS = new Set([
  "answer_current_field",
  "clarify_scope",
  "clarify_adjustment_need",
  "clarify_constraints",
  "prepare_plan_handoff",
  "revise_plan_handoff",
  "repeat_plan_handoff",
  "platform_destination_followup",
  "explain_handoff",
  "get_info_db",
  "apply_attempt",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const VISIBLE_TASKS = new Set([
  "clarify_scope",
  "clarify_adjustment_need",
  "clarify_constraints",
  "plan_handoff_ready",
  "revise_plan_handoff",
  "repeat_plan_handoff",
  "destination_short",
  "explain_handoff",
  "apply_attempt",
  "cancel_close",
  "exit_or_cancel",
  "safety",
  "none",
]);

const SCOPE_KINDS = new Set([
  "specific_plan_item",
  "action_cluster",
  "current_week",
  "current_level",
  "whole_plan",
  "multi_plan",
  "unknown",
]);

const CHANGE_KINDS = new Set([
  "reduce",
  "increase",
  "pause",
  "resume",
  "replace",
  "split",
  "reschedule",
  "copy_forward",
  "bridge_action",
  "clarify",
  "unknown",
]);

const STATE_STATUSES = new Set([
  "collecting",
  "clarifying",
  "handoff_ready",
  "handoff_delivered",
  "revising",
  "apply_attempt",
  "cancelled",
  "exit_to_global",
  "safety",
]);

const STAGES = new Set([
  "scope",
  "adjustment_need",
  "constraints",
  "handoff",
  "closing",
]);

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value);
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, 20)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("adjust_plan_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeScope(raw: unknown): AdjustPlanLocalScope {
  const root = record(raw);
  return {
    kind: enumValue<AdjustPlanScopeKind>(
      root.kind,
      SCOPE_KINDS,
      "unknown",
    ),
    confidence: confidence(root.confidence),
    plan_id: nullableString(root.plan_id),
    plan_title: nullableString(root.plan_title),
    level_id: nullableString(root.level_id),
    level_title: nullableString(root.level_title),
    plan_item_ids: stringArray(root.plan_item_ids),
    target_summary: nullableString(root.target_summary),
    needs_scope_clarification: root.needs_scope_clarification === true,
  };
}

function normalizeNeed(raw: unknown): AdjustPlanLocalNeed {
  const root = record(raw);
  const rawChangeKind = stringValue(root.change_kind);
  return {
    reason_change: nullableString(root.reason_change),
    requested_change: nullableString(root.requested_change),
    change_kind: rawChangeKind
      ? enumValue<AdjustPlanChangeKind>(rawChangeKind, CHANGE_KINDS, "unknown")
      : null,
    constraints: stringArray(root.constraints),
    preserve: stringArray(root.preserve),
    avoid: stringArray(root.avoid),
    missing: stringArray(root.missing),
  };
}

function normalizePlatformHandoff(raw: unknown): AdjustPlanPlatformHandoff {
  const root = record(raw);
  const grouped = Array.isArray(root.grouped_by_plan)
    ? root.grouped_by_plan.flatMap((item) => {
      const row = record(item);
      const suggested = stringValue(row.suggested_platform_input);
      if (!suggested) return [];
      return [{
        plan_id: nullableString(row.plan_id),
        plan_title: nullableString(row.plan_title),
        suggested_platform_input: suggested,
      }];
    }).slice(0, 8)
    : [];
  const destination = stringValue(root.destination);
  return {
    status: enumValue<AdjustPlanPlatformHandoff["status"]>(
      root.status,
      new Set([
        "none",
        "draft_ready",
        "delivered",
        "revised",
        "repeat",
        "apply_attempt",
        "cancelled",
      ]),
      "none",
    ),
    destination: destination === "Plan" ? "Plan" : null,
    suggested_platform_input: nullableString(root.suggested_platform_input),
    grouped_by_plan: grouped,
    previous_value: nullableString(root.previous_value),
    revised_value: nullableString(root.revised_value),
  };
}

export function createInitialAdjustPlanLocalState(): AdjustPlanLocalState {
  return {
    skill_id: "adjust_plan_item",
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    status: "collecting",
    stage: "scope",
    scope: {
      kind: "unknown",
      confidence: "low",
      plan_id: null,
      plan_title: null,
      level_id: null,
      level_title: null,
      plan_item_ids: [],
      target_summary: null,
      needs_scope_clarification: true,
    },
    adjustment_need: {
      reason_change: null,
      requested_change: null,
      change_kind: null,
      constraints: [],
      preserve: [],
      avoid: [],
      missing: [],
    },
    platform_handoff: {
      status: "none",
      destination: null,
      suggested_platform_input: null,
      grouped_by_plan: [],
      previous_value: null,
      revised_value: null,
    },
    last_visible_task: null,
    last_handoff_summary: null,
    turn_count: 0,
    subskill_history: [],
  };
}

export function isAdjustPlanLocalState(
  value: unknown,
): value is AdjustPlanLocalState {
  const root = value as any;
  return Boolean(
    root &&
      typeof root === "object" &&
      root.skill_id === "adjust_plan_item" &&
      root.operation_type === "adjust_plan_item" &&
      root.mode === "platform_handoff",
  );
}

export function normalizeAdjustPlanLocalDispatcherOutput(
  raw: unknown,
): AdjustPlanLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const intentRoot = record(root.adjust_plan_intent);
  const stateRoot = record(root.state_updates);
  const visibleRoot = record(root.visible_task);
  const subskillRoot = record(root.subskill_call);
  const exitRoot = record(root.exit_memo);
  return {
    flow_action: enumValue<AdjustPlanLocalFlowAction>(
      root.flow_action,
      FLOW_ACTIONS,
      "clarify_scope",
    ),
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    adjust_plan_intent: {
      kind: enumValue(
        intentRoot.kind,
        new Set([
          "start_or_continue",
          "scope_answer",
          "need_answer",
          "constraint_answer",
          "handoff_request",
          "handoff_revision",
          "repeat",
          "destination",
          "explain",
          "apply_attempt",
          "cancel",
          "off_topic",
          "safety",
          "unclear",
        ]),
        "unclear",
      ),
      summary: stringValue(intentRoot.summary),
    },
    scope: normalizeScope(root.scope),
    adjustment_need: normalizeNeed(root.adjustment_need),
    platform_handoff: normalizePlatformHandoff(root.platform_handoff),
    state_updates: {
      status: enumValue<AdjustPlanLocalState["status"]>(
        stateRoot.status,
        STATE_STATUSES,
        "collecting",
      ),
      stage: enumValue<AdjustPlanLocalStage>(
        stateRoot.stage,
        STAGES,
        "scope",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(3, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<AdjustPlanVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "clarify_scope",
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    subskill_call: {
      needed: subskillRoot.needed === true,
      skill_id: String(subskillRoot.skill_id ?? "").trim() === "status_recap"
        ? "status_recap"
        : null,
      reason: nullableString(subskillRoot.reason),
      context_for_subskill: record(subskillRoot.context_for_subskill),
    },
    exit_memo: {
      needed: exitRoot.needed === true,
      reason: enumValue(
        exitRoot.reason,
        new Set([
          "topic_change",
          "explicit_tool_request",
          "product_help",
          "status_question",
          "preference_update",
          "normal_coaching",
          "safety",
          "unknown",
          "none",
        ]),
        "none",
      ),
      user_intent_summary: nullableString(exitRoot.user_intent_summary),
      local_flow_context: record(exitRoot.local_flow_context),
      handoff_hint_for_global_dispatcher: record(
        exitRoot.handoff_hint_for_global_dispatcher,
      ),
    },
    evidence: stringArray(root.evidence),
  };
}

function mergeStringArray(previous: string[], incoming: string[]): string[] {
  return [...new Set([...previous, ...incoming].filter(Boolean))].slice(0, 20);
}

function mergeScope(
  previous: AdjustPlanLocalScope,
  incoming: AdjustPlanLocalScope,
): AdjustPlanLocalScope {
  return {
    kind: incoming.kind !== "unknown" ? incoming.kind : previous.kind,
    confidence: incoming.confidence !== "low"
      ? incoming.confidence
      : previous.confidence,
    plan_id: incoming.plan_id ?? previous.plan_id,
    plan_title: incoming.plan_title ?? previous.plan_title,
    level_id: incoming.level_id ?? previous.level_id,
    level_title: incoming.level_title ?? previous.level_title,
    plan_item_ids: incoming.plan_item_ids.length > 0
      ? incoming.plan_item_ids
      : previous.plan_item_ids,
    target_summary: incoming.target_summary ?? previous.target_summary,
    needs_scope_clarification: incoming.needs_scope_clarification,
  };
}

function mergeNeed(
  previous: AdjustPlanLocalNeed,
  incoming: AdjustPlanLocalNeed,
): AdjustPlanLocalNeed {
  return {
    reason_change: incoming.reason_change ?? previous.reason_change,
    requested_change: incoming.requested_change ?? previous.requested_change,
    change_kind: incoming.change_kind ?? previous.change_kind,
    constraints: mergeStringArray(previous.constraints, incoming.constraints),
    preserve: mergeStringArray(previous.preserve, incoming.preserve),
    avoid: mergeStringArray(previous.avoid, incoming.avoid),
    missing: incoming.missing,
  };
}

function mergeHandoff(
  previous: AdjustPlanPlatformHandoff,
  incoming: AdjustPlanPlatformHandoff,
): AdjustPlanPlatformHandoff {
  return {
    status: incoming.status !== "none" ? incoming.status : previous.status,
    destination: incoming.destination ?? previous.destination,
    suggested_platform_input: incoming.suggested_platform_input ??
      previous.suggested_platform_input,
    grouped_by_plan: incoming.grouped_by_plan.length > 0
      ? incoming.grouped_by_plan
      : previous.grouped_by_plan,
    previous_value: incoming.previous_value ?? previous.previous_value,
    revised_value: incoming.revised_value ?? previous.revised_value,
  };
}

function hasHandoffValue(state: AdjustPlanLocalState): boolean {
  return Boolean(
    state.platform_handoff.suggested_platform_input ||
      state.platform_handoff.revised_value ||
      state.platform_handoff.grouped_by_plan.length > 0,
  );
}

function draftFromState(state: AdjustPlanLocalState): AdjustPlanHandoffDraft {
  const suggested = state.platform_handoff.revised_value ??
    state.platform_handoff.suggested_platform_input ??
    state.platform_handoff.grouped_by_plan
      .map((item) =>
        `${item.plan_title ?? "Plan"}: ${item.suggested_platform_input}`
      )
      .join("\n");
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_input_coaching",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_blocker_summary: state.adjustment_need.reason_change ??
      state.scope.target_summary ??
      "Ajustement de plan a reprendre dans Plan.",
    suggested_platform_input: suggested ||
      "Preciser l'ajustement souhaite dans Plan.",
    preserve: state.adjustment_need.preserve,
    avoid: state.adjustment_need.avoid,
    destination: {
      product_area: "Plan",
      instruction: "Reprendre cette proposition dans la surface Plan.",
    },
    missing_clarity: state.adjustment_need.missing,
  };
}

function visibleTaskForOutput(
  output: AdjustPlanLocalDispatcherOutput,
  state: AdjustPlanLocalState,
): AdjustPlanVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (output.flow_action === "cancel_flow") return "cancel_close";
  if (output.flow_action === "exit_to_global_dispatcher") {
    return "exit_or_cancel";
  }
  if (output.flow_action === "apply_attempt") return "apply_attempt";
  if (output.flow_action === "repeat_plan_handoff") {
    return "repeat_plan_handoff";
  }
  if (output.flow_action === "platform_destination_followup") {
    return "destination_short";
  }
  if (output.flow_action === "explain_handoff") return "explain_handoff";
  if (output.flow_action === "revise_plan_handoff") {
    return "revise_plan_handoff";
  }
  if (
    output.flow_action === "prepare_plan_handoff" ||
    output.platform_handoff.status === "draft_ready" ||
    hasHandoffValue(state)
  ) {
    return "plan_handoff_ready";
  }
  if (
    state.scope.kind === "unknown" ||
    state.scope.needs_scope_clarification ||
    output.flow_action === "clarify_scope"
  ) return "clarify_scope";
  if (
    !state.adjustment_need.reason_change ||
    !state.adjustment_need.requested_change ||
    output.flow_action === "clarify_adjustment_need"
  ) return "clarify_adjustment_need";
  if (output.flow_action === "clarify_constraints") {
    return "clarify_constraints";
  }
  return output.visible_task.kind;
}

export function reduceAdjustPlanLocalDispatcherOutput(args: {
  previous: AdjustPlanLocalState | null;
  output: AdjustPlanLocalDispatcherOutput;
}): AdjustPlanReducerResult {
  const previous = args.previous ?? createInitialAdjustPlanLocalState();
  const output = args.output;
  const toolFlags = {
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };
  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "topic_change",
      reason_code: "adjust_plan_item_local_exit_to_global_dispatcher",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: output.exit_memo,
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "adjust_plan_item_local_cancelled",
      local_state: null,
      draft: null,
      visible_task: "cancel_close",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
    };
  }

  const merged: AdjustPlanLocalState = {
    ...previous,
    status: output.state_updates.status,
    stage: output.state_updates.stage,
    scope: mergeScope(previous.scope, output.scope),
    adjustment_need: mergeNeed(
      previous.adjustment_need,
      output.adjustment_need,
    ),
    platform_handoff: mergeHandoff(
      previous.platform_handoff,
      output.platform_handoff,
    ),
    turn_count: previous.turn_count + output.state_updates.turn_count_increment,
  };
  const visibleTask = visibleTaskForOutput(output, merged);
  const nextState: AdjustPlanLocalState = {
    ...merged,
    status: visibleTask === "plan_handoff_ready"
      ? "handoff_delivered"
      : visibleTask === "revise_plan_handoff"
      ? "revising"
      : visibleTask === "apply_attempt"
      ? "apply_attempt"
      : visibleTask === "safety"
      ? "safety"
      : visibleTask === "clarify_scope" ||
          visibleTask === "clarify_adjustment_need" ||
          visibleTask === "clarify_constraints"
      ? "clarifying"
      : merged.status,
    stage: visibleTask === "plan_handoff_ready" ? "handoff" : merged.stage,
    platform_handoff: [
        "plan_handoff_ready",
        "revise_plan_handoff",
        "repeat_plan_handoff",
        "destination_short",
        "apply_attempt",
      ].includes(visibleTask)
      ? {
        ...merged.platform_handoff,
        status: visibleTask === "apply_attempt"
          ? "apply_attempt"
          : visibleTask === "repeat_plan_handoff"
          ? "repeat"
          : visibleTask === "revise_plan_handoff"
          ? "revised"
          : "delivered",
        destination: "Plan",
      }
      : merged.platform_handoff,
    last_visible_task: visibleTask,
    last_handoff_summary: hasHandoffValue(merged)
      ? merged.platform_handoff.revised_value ??
        merged.platform_handoff.suggested_platform_input ??
        merged.platform_handoff.grouped_by_plan.map((item) =>
          item.suggested_platform_input
        ).join(" | ")
      : merged.last_handoff_summary,
  };
  const draft = hasHandoffValue(nextState) ? draftFromState(nextState) : null;

  if (output.flow_action === "get_info_db") {
    return {
      status: "collecting",
      reason_code: "adjust_plan_item_get_info_db",
      local_state: { ...nextState, last_visible_task: "none" },
      draft,
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_db: true,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
    };
  }

  if (output.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "adjust_plan_item_local_safety_preempt",
      local_state: nextState,
      draft: null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
    };
  }
  if (output.flow_action === "apply_attempt") {
    return {
      status: "apply_attempt",
      reason_code: "adjust_plan_item_apply_attempt_no_chat_mutation",
      local_state: nextState,
      draft,
      visible_task: "apply_attempt",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [{
        type: "adjust_plan_item",
        reason_code: "chat_plan_mutation_disabled_platform_handoff",
      }],
      exit_memo: null,
    };
  }
  if (output.flow_action === "repeat_plan_handoff") {
    return {
      status: "repeat_handoff",
      reason_code: "adjust_plan_item_repeat_platform_handoff",
      local_state: nextState,
      draft,
      visible_task: "repeat_plan_handoff",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
    };
  }
  if (
    visibleTask === "plan_handoff_ready" ||
    visibleTask === "revise_plan_handoff" ||
    visibleTask === "destination_short" ||
    visibleTask === "explain_handoff"
  ) {
    return {
      status: "handoff_delivered",
      reason_code: `adjust_plan_item_local_${visibleTask}`,
      local_state: nextState,
      draft,
      visible_task: visibleTask,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
    };
  }
  return {
    status: visibleTask === "clarify_scope" ||
        visibleTask === "clarify_adjustment_need" ||
        visibleTask === "clarify_constraints"
      ? "clarifying"
      : "collecting",
    reason_code: `adjust_plan_item_local_${visibleTask}`,
    local_state: nextState,
    draft: null,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_score: output.risk_score,
    blocked_effects: [],
    exit_memo: null,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow adjust_plan_item.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Le flow est deja actif ou vient d'etre selectionne. Tu n'es pas le dispatcher global.",
    "Tu ne sors vers le dispatcher global que si le message quitte clairement ce flow.",
    "Mission: aider le user a preparer une proposition d'ajustement a reprendre dans la surface Plan.",
    "Le chat ne modifie jamais le plan, n'ecrit jamais en DB, ne cree jamais de confirmation executable ni token.",
    "Tu es l'unique decideur metier du flow actif: scope, raison, changement souhaite, contraintes, handoff, revision, repeat, destination, apply_attempt et sortie.",
    "Aucune regex metier, aucun mot-cle isole, aucune decision par template.",
    "Scopes autorises: specific_plan_item, action_cluster, current_week, current_level, whole_plan, multi_plan, unknown.",
    "Si plusieurs plans existent, preserve plan_id et plan_title quand disponibles. Ne melange jamais des plans differents dans une recommandation indistincte.",
    "Si le user demande d'appliquer, valider ou modifier depuis le chat, retourne apply_attempt, jamais une execution.",
    "Si le user pose une question sur l'état DB utile à l'ajustement (actions prévues, actions existantes, plans actifs, ce qui est déjà dans le plan), retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap. Le flow adjust_plan_item reste actif.",
    "Pour get_info_db, remplis subskill_call.context_for_subskill avec active_flow='adjust_plan_item', question_to_answer reformulée, active_flow_context utile (scope, adjustment_need, platform_handoff, plan_snapshot pertinent).",
    "Si le user demande une carte, une potion, une preference, un rappel ou du product help, retourne exit_to_global_dispatcher avec exit_memo.",
    "Retourne uniquement le JSON strict conforme au schema fourni.",
  ].join("\n");
}

export async function runAdjustPlanLocalDispatcher(
  input: AdjustPlanLocalDispatcherInput,
): Promise<AdjustPlanLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "adjust_plan_item_local_dispatcher",
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_adjust_plan_state: input.active_state,
    local_state: input.local_state,
    route_decision_context_only: input.route_decision,
    turn_frame_context_only: input.turn_frame,
    plan_snapshot: input.plan_snapshot ?? null,
    platform_destination: "Plan",
    required_json_shape: {
      flow_action:
        "answer_current_field|clarify_scope|clarify_adjustment_need|clarify_constraints|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|platform_destination_followup|explain_handoff|get_info_db|apply_attempt|cancel_flow|exit_to_global_dispatcher|safety_preempt",
      confidence: "low|medium|high",
      risk_score: "number 0..10",
      adjust_plan_intent: "object",
      scope: "object",
      adjustment_need: "object",
      platform_handoff: "object",
      state_updates: "object",
      visible_task: "object",
      subskill_call: {
        needed: "boolean",
        skill_id: "status_recap|null",
        reason: "string|null",
        context_for_subskill: "object",
      },
      exit_memo: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      dispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "adjust_plan_item.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeAdjustPlanLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[AdjustPlanItem] local dispatcher failed", error);
    return null;
  }
}

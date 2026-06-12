import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../../contracts/note_information.v1.ts";
import type {
  AdjustPlanChangeKind,
  AdjustPlanHandoffDraft,
  AdjustPlanHandoffStatus,
  AdjustPlanScopeKind,
} from "./contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../../router/direct_effect_local_context.ts";

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
  | "get_info_product"
  | "inline_tool_roundtrip"
  | "handoff_to_local_flow"
  | "apply_attempt"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "defer_flow"
  | "complete_flow"
  | "safety_preempt"
  | "contract_recovery";

export type AdjustPlanVisibleTaskKind =
  | "clarify_scope"
  | "clarify_adjustment_need"
  | "clarify_constraints"
  | "plan_handoff_ready"
  | "revise_plan_handoff"
  | "repeat_plan_handoff"
  | "destination_short"
  | "explain_handoff"
  | "inline_tool_return"
  | "apply_attempt"
  | "cancel_close"
  | "exit_or_cancel"
  | "safety"
  | "contract_recovery"
  | "none";

export type AdjustPlanConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: AdjustPlanLocalStage | "closing" | "inline" | "safety";
  known_values: {
    scope: AdjustPlanLocalScope;
    adjustment_need: AdjustPlanLocalNeed;
    constraints: string[];
    preserve: string[];
    avoid: string[];
  };
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  handoff_data: {
    destination: "Plan" | null;
    suggested_platform_input: string | null;
    grouped_by_plan: AdjustPlanPlatformHandoff["grouped_by_plan"];
    previous_value: string | null;
    revised_value: string | null;
  };
  inline_tool_result?: {
    target_dispatcher: "status_recap" | "product_help" | null;
    answer_summary: string | null;
    next_focus: string | null;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

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
    conversation_context: AdjustPlanConversationContext | null;
  };
  subskill_call: {
    needed: boolean;
    skill_id: "status_recap" | "product_help" | null;
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
  note_information: {
    needed: boolean;
    value: NoteInformation | null;
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
  db_context_pack?: unknown;
  micro_memory_context?: unknown;
  note_information_inbound?: NoteInformation | Record<string, unknown> | null;
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
  conversation_context: AdjustPlanConversationContext | null;
  exit_to_global_dispatcher: boolean;
  get_info_db: boolean;
  get_info_product: boolean;
  handoff_to_local_flow: boolean;
  target_dispatcher: NoteInformationTargetDispatcher | null;
  subskill_context: Record<string, unknown> | null;
  risk_score: number;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  exit_memo: AdjustPlanLocalDispatcherOutput["exit_memo"] | null;
  note_information: NoteInformation | null;
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
  "get_info_product",
  "inline_tool_roundtrip",
  "handoff_to_local_flow",
  "apply_attempt",
  "cancel_flow",
  "defer_flow",
  "complete_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
  "contract_recovery",
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
  "inline_tool_return",
  "apply_attempt",
  "cancel_close",
  "exit_or_cancel",
  "safety",
  "contract_recovery",
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

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function normalizeConversationContext(
  raw: unknown,
): AdjustPlanConversationContext | null {
  const root = maybeRecord(raw);
  if (!root) return null;
  const known = record(root.known_values);
  const handoff = record(root.handoff_data);
  const inline = maybeRecord(root.inline_tool_result);
  return {
    state_summary: stringValue(root.state_summary),
    user_words: stringArray(root.user_words).slice(0, 8),
    field_or_stage: enumValue<AdjustPlanConversationContext["field_or_stage"]>(
      root.field_or_stage,
      new Set([
        "scope",
        "adjustment_need",
        "constraints",
        "handoff",
        "closing",
        "inline",
        "safety",
      ]),
      "scope",
    ),
    known_values: {
      scope: normalizeScope(known.scope),
      adjustment_need: normalizeNeed(known.adjustment_need),
      constraints: stringArray(known.constraints),
      preserve: stringArray(known.preserve),
      avoid: stringArray(known.avoid),
    },
    missing_or_weak_values: stringArray(root.missing_or_weak_values),
    selected_candidate: record(root.selected_candidate),
    handoff_data: {
      destination: stringValue(handoff.destination) === "Plan" ? "Plan" : null,
      suggested_platform_input: nullableString(
        handoff.suggested_platform_input,
      ),
      grouped_by_plan: normalizePlatformHandoff({
        grouped_by_plan: handoff.grouped_by_plan,
      }).grouped_by_plan,
      previous_value: nullableString(handoff.previous_value),
      revised_value: nullableString(handoff.revised_value),
    },
    inline_tool_result: inline
      ? {
        target_dispatcher:
          stringValue(inline.target_dispatcher) === "status_recap"
            ? "status_recap"
            : stringValue(inline.target_dispatcher) === "product_help"
            ? "product_help"
            : null,
        answer_summary: nullableString(inline.answer_summary),
        next_focus: nullableString(inline.next_focus),
      }
      : undefined,
    tone_constraints: stringArray(root.tone_constraints),
    do_not_say: stringArray(root.do_not_say),
    context_summary: nullableString(root.context_summary),
    evidence_used: stringArray(root.evidence_used),
  };
}

function targetDispatcher(value: unknown): NoteInformationTargetDispatcher {
  const raw = stringValue(value);
  return raw === "safety_crisis" || raw === "product_help" ||
      raw === "status_recap" || raw === "prepare_attack_card" ||
      raw === "prepare_defense_card" || raw === "other_local"
    ? raw
    : "global";
}

function normalizeAdjustPlanNoteInformation(
  raw: unknown,
  fallback: {
    target_dispatcher: NoteInformationTargetDispatcher;
    handoff_reason:
      | "topic_change"
      | "safety"
      | "inline_tool"
      | "bridge"
      | "explicit_user_request";
    state_summary: string;
    structured_context: Record<string, unknown>;
    risk_score: number;
  },
): { needed: boolean; value: NoteInformation | null } {
  const root = record(raw);
  const needed = root.needed === true ||
    Boolean(root.value && typeof root.value === "object");
  const value = root.value ?? root.note_information ?? root;
  if (needed && value && typeof value === "object" && !Array.isArray(value)) {
    const normalized = normalizeNoteInformation(value, {
      source_flow_id: "adjust_plan_item",
      handoff_reason: fallback.handoff_reason,
      target_dispatcher: fallback.target_dispatcher,
      handoff_context_for_next_dispatcher: JSON.stringify(
        fallback.structured_context,
      ),
      structured_context: fallback.structured_context,
    });
    return { needed: true, value: normalized };
  }
  if (!needed) return { needed: false, value: null };
  return {
    needed: true,
    value: createNoteInformation({
      source_flow_id: "adjust_plan_item",
      handoff_reason: fallback.handoff_reason,
      target_dispatcher: fallback.target_dispatcher,
      handoff_context_for_next_dispatcher: JSON.stringify(
        fallback.structured_context,
      ),
      structured_context: fallback.structured_context,
    }),
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
  const normalizedScope = normalizeScope(root.scope);
  const normalizedNeed = normalizeNeed(root.adjustment_need);
  const normalizedHandoff = normalizePlatformHandoff(root.platform_handoff);
  const normalizedRiskScore = riskScore(root.risk_score);
  const normalizedFlowAction = enumValue<AdjustPlanLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_scope",
  );
  const noteRoot = record(root.note_information);
  const noteValueRoot = record(noteRoot.value);
  const subskillSkillId = String(subskillRoot.skill_id ?? "").trim();
  const noteTarget = targetDispatcher(
    noteRoot.target_dispatcher ?? noteValueRoot.target_dispatcher ??
      (normalizedFlowAction === "get_info_db" ||
          normalizedFlowAction === "inline_tool_roundtrip" &&
            subskillSkillId === "status_recap"
        ? "status_recap"
        : normalizedFlowAction === "get_info_product" ||
            normalizedFlowAction === "inline_tool_roundtrip" &&
              subskillSkillId === "product_help"
        ? "product_help"
        : normalizedFlowAction === "safety_preempt"
        ? "safety_crisis"
        : null),
  );
  const noteReason = normalizedFlowAction === "safety_preempt"
    ? "safety"
    : normalizedFlowAction === "get_info_db" ||
        normalizedFlowAction === "get_info_product" ||
        normalizedFlowAction === "inline_tool_roundtrip"
    ? "inline_tool"
    : normalizedFlowAction === "handoff_to_local_flow"
    ? "bridge"
    : normalizedFlowAction === "exit_to_global_dispatcher"
    ? "topic_change"
    : "explicit_user_request";
  const requiresNoteInformation = normalizedFlowAction ===
      "exit_to_global_dispatcher" ||
    normalizedFlowAction === "safety_preempt" ||
    normalizedFlowAction === "get_info_db" ||
    normalizedFlowAction === "get_info_product" ||
    normalizedFlowAction === "inline_tool_roundtrip" ||
    normalizedFlowAction === "handoff_to_local_flow";
  const noteInformation = normalizeAdjustPlanNoteInformation(
    requiresNoteInformation && noteRoot.needed !== true
      ? { ...noteRoot, needed: true }
      : noteRoot,
    {
      target_dispatcher: noteTarget,
      handoff_reason: noteReason,
      state_summary: stringValue(intentRoot.summary) ||
        "adjust_plan_item local flow state.",
      structured_context: {
        source_flow: "adjust_plan_item",
        flow_action: normalizedFlowAction,
        scope: normalizedScope,
        adjustment_need: normalizedNeed,
        platform_handoff: normalizedHandoff,
        exit_memo: exitRoot,
      },
      risk_score: normalizedRiskScore,
    },
  );
  return {
    flow_action: normalizedFlowAction,
    confidence: confidence(root.confidence),
    risk_score: normalizedRiskScore,
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
    scope: normalizedScope,
    adjustment_need: normalizedNeed,
    platform_handoff: normalizedHandoff,
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
      conversation_context: normalizeConversationContext(
        visibleRoot.conversation_context,
      ),
    },
    subskill_call: {
      needed: subskillRoot.needed === true,
      skill_id: String(subskillRoot.skill_id ?? "").trim() === "status_recap"
        ? "status_recap"
        : String(subskillRoot.skill_id ?? "").trim() === "product_help"
        ? "product_help"
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
    note_information: noteInformation,
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
  const incomingHasScopeSignal = incoming.kind !== "unknown" ||
    Boolean(
      incoming.plan_id ||
        incoming.plan_title ||
        incoming.level_id ||
        incoming.level_title ||
        incoming.plan_item_ids.length > 0 ||
        incoming.target_summary,
    );
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
    needs_scope_clarification: incomingHasScopeSignal
      ? incoming.needs_scope_clarification
      : previous.needs_scope_clarification,
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

function hasTargetToModify(state: AdjustPlanLocalState): boolean {
  return Boolean(
    !state.scope.needs_scope_clarification &&
      state.scope.kind !== "unknown" &&
      (state.scope.target_summary ||
        state.scope.plan_item_ids.length > 0 ||
        state.scope.level_id ||
        state.scope.level_title ||
        state.scope.plan_id ||
        state.scope.plan_title),
  );
}

function hasActionableChangeKind(need: AdjustPlanLocalNeed): boolean {
  return Boolean(
    need.change_kind &&
      need.change_kind !== "unknown" &&
      need.change_kind !== "clarify",
  );
}

function missingHandoffCoreFields(state: AdjustPlanLocalState): string[] {
  return [
    ...(!hasTargetToModify(state) ? ["target_to_modify"] : []),
    ...(!state.adjustment_need.reason_change ? ["reason_change"] : []),
    ...(!state.adjustment_need.requested_change ? ["requested_change"] : []),
    ...(!hasActionableChangeKind(state.adjustment_need) ? ["change_kind"] : []),
  ];
}

function hasCompleteHandoffCore(state: AdjustPlanLocalState): boolean {
  return hasHandoffValue(state) && missingHandoffCoreFields(state).length === 0;
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
    mode: "platform_handoff",
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

function handoffSuggestion(state: AdjustPlanLocalState): string | null {
  return state.platform_handoff.revised_value ??
    state.platform_handoff.suggested_platform_input ??
    (state.platform_handoff.grouped_by_plan.length > 0
      ? state.platform_handoff.grouped_by_plan
        .map((item) =>
          `${item.plan_title ?? "Plan"}: ${item.suggested_platform_input}`
        )
        .join("\n")
      : null);
}

function buildConversationContext(args: {
  state: AdjustPlanLocalState;
  output: AdjustPlanLocalDispatcherOutput;
  visibleTask: AdjustPlanVisibleTaskKind;
  inlineToolResult?: AdjustPlanConversationContext["inline_tool_result"];
}): AdjustPlanConversationContext {
  const seed = args.output.visible_task.conversation_context;
  const missing = [
    ...args.state.adjustment_need.missing,
    ...(!hasTargetToModify(args.state) ? ["target_to_modify"] : []),
    ...(!args.state.adjustment_need.reason_change ? ["reason_change"] : []),
    ...(!args.state.adjustment_need.requested_change
      ? ["requested_change"]
      : []),
    ...(!hasActionableChangeKind(args.state.adjustment_need)
      ? ["change_kind"]
      : []),
  ];
  const suggestion = handoffSuggestion(args.state);
  const fieldOrStage: AdjustPlanConversationContext["field_or_stage"] =
    args.visibleTask === "inline_tool_return"
      ? "inline"
      : args.visibleTask === "safety"
      ? "safety"
      : args.visibleTask === "cancel_close" ||
          args.visibleTask === "exit_or_cancel"
      ? "closing"
      : args.state.stage;
  const stateSummary = args.output.adjust_plan_intent.summary ||
    seed?.state_summary ||
    [
      args.state.scope.target_summary
        ? `Cible: ${args.state.scope.target_summary}.`
        : "Cible Plan encore a clarifier.",
      args.state.adjustment_need.requested_change
        ? `Changement souhaite: ${args.state.adjustment_need.requested_change}.`
        : "Changement souhaite encore a clarifier.",
    ].join(" ");
  return {
    state_summary: stateSummary,
    user_words: seed?.user_words?.length ? seed.user_words : [],
    field_or_stage: fieldOrStage,
    known_values: {
      scope: args.state.scope,
      adjustment_need: args.state.adjustment_need,
      constraints: args.state.adjustment_need.constraints,
      preserve: args.state.adjustment_need.preserve,
      avoid: args.state.adjustment_need.avoid,
    },
    missing_or_weak_values: [
      ...new Set([
        ...(seed?.missing_or_weak_values ?? []),
        ...missing,
      ]),
    ].filter(Boolean).slice(0, 12),
    selected_candidate: {
      ...(seed?.selected_candidate ?? {}),
      plan_id: args.state.scope.plan_id,
      plan_title: args.state.scope.plan_title,
      level_id: args.state.scope.level_id,
      level_title: args.state.scope.level_title,
      plan_item_ids: args.state.scope.plan_item_ids,
      target_summary: args.state.scope.target_summary,
      scope_kind: args.state.scope.kind,
      scope_confidence: args.state.scope.confidence,
    },
    handoff_data: {
      destination: args.state.platform_handoff.destination,
      suggested_platform_input: suggestion,
      grouped_by_plan: args.state.platform_handoff.grouped_by_plan,
      previous_value: args.state.platform_handoff.previous_value,
      revised_value: args.state.platform_handoff.revised_value,
    },
    inline_tool_result: args.inlineToolResult ?? seed?.inline_tool_result,
    tone_constraints: seed?.tone_constraints ?? [],
    do_not_say: [
      "Ne dis pas que le Plan est applique, modifie, deplace, valide, sauvegarde ou enregistre.",
      "Ne mentionne pas les labels internes du dispatcher.",
      ...(seed?.do_not_say ?? []),
    ].slice(0, 12),
    context_summary: seed?.context_summary ?? stateSummary,
    evidence_used: [
      ...args.output.evidence,
      ...(seed?.evidence_used ?? []),
    ].filter(Boolean).slice(0, 12),
  };
}

function visibleTaskForOutput(
  output: AdjustPlanLocalDispatcherOutput,
  state: AdjustPlanLocalState,
): AdjustPlanVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "defer_flow" ||
    output.flow_action === "complete_flow"
  ) return "cancel_close";
  if (output.flow_action === "exit_to_global_dispatcher") {
    return "exit_or_cancel";
  }
  if (output.flow_action === "contract_recovery") return "contract_recovery";
  if (
    output.flow_action === "get_info_db" ||
    output.flow_action === "get_info_product" ||
    output.flow_action === "inline_tool_roundtrip" &&
      (output.subskill_call.skill_id === "status_recap" ||
        output.subskill_call.skill_id === "product_help")
  ) return "none";
  if (output.flow_action === "inline_tool_roundtrip") {
    return "contract_recovery";
  }
  if (output.flow_action === "handoff_to_local_flow") return "exit_or_cancel";
  if (output.flow_action === "apply_attempt") {
    return hasCompleteHandoffCore(state)
      ? "apply_attempt"
      : hasTargetToModify(state)
      ? "clarify_adjustment_need"
      : "clarify_scope";
  }
  if (output.flow_action === "repeat_plan_handoff") {
    return hasCompleteHandoffCore(state)
      ? "repeat_plan_handoff"
      : hasTargetToModify(state)
      ? "clarify_adjustment_need"
      : "clarify_scope";
  }
  if (output.flow_action === "platform_destination_followup") {
    return "destination_short";
  }
  if (output.flow_action === "explain_handoff") return "explain_handoff";
  if (output.flow_action === "revise_plan_handoff") {
    return hasCompleteHandoffCore(state)
      ? "revise_plan_handoff"
      : hasTargetToModify(state)
      ? "clarify_adjustment_need"
      : "clarify_scope";
  }
  if (
    output.flow_action === "prepare_plan_handoff" ||
    output.platform_handoff.status === "draft_ready" ||
    hasHandoffValue(state)
  ) {
    if (!hasHandoffValue(state)) return "contract_recovery";
    if (!hasTargetToModify(state)) return "clarify_scope";
    return hasCompleteHandoffCore(state)
      ? "plan_handoff_ready"
      : "clarify_adjustment_need";
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
    get_info_product: false,
    handoff_to_local_flow: false,
    target_dispatcher: null as NoteInformationTargetDispatcher | null,
    subskill_context: null as Record<string, unknown> | null,
  };
  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "topic_change",
      reason_code: "adjust_plan_item_local_exit_to_global_dispatcher",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      conversation_context: output.visible_task.conversation_context,
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: output.exit_memo,
      note_information: output.note_information.value,
    };
  }
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "defer_flow" ||
    output.flow_action === "complete_flow"
  ) {
    const conversationContext = buildConversationContext({
      state: previous,
      output,
      visibleTask: "cancel_close",
    });
    return {
      status: "cancelled",
      reason_code: "adjust_plan_item_local_cancelled",
      local_state: null,
      draft: null,
      visible_task: "cancel_close",
      conversation_context: conversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: null,
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
    last_handoff_summary: hasCompleteHandoffCore(merged)
      ? merged.platform_handoff.revised_value ??
        merged.platform_handoff.suggested_platform_input ??
        merged.platform_handoff.grouped_by_plan.map((item) =>
          item.suggested_platform_input
        ).join(" | ")
      : merged.last_handoff_summary,
  };
  const draft = hasCompleteHandoffCore(nextState)
    ? draftFromState(nextState)
    : null;
  const baseConversationContext = buildConversationContext({
    state: nextState,
    output,
    visibleTask,
  });

  if (
    output.flow_action === "get_info_db" ||
    output.flow_action === "inline_tool_roundtrip" &&
      output.subskill_call.skill_id === "status_recap"
  ) {
    return {
      status: "collecting",
      reason_code: "adjust_plan_item_get_info_db",
      local_state: { ...nextState, last_visible_task: "none" },
      draft,
      visible_task: "none",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      get_info_db: true,
      get_info_product: false,
      handoff_to_local_flow: false,
      target_dispatcher: "status_recap",
      subskill_context: output.subskill_call.context_for_subskill,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: output.note_information.value,
    };
  }

  if (
    output.flow_action === "get_info_product" ||
    output.flow_action === "inline_tool_roundtrip" &&
      output.subskill_call.skill_id === "product_help"
  ) {
    return {
      status: "collecting",
      reason_code: "adjust_plan_item_get_info_product",
      local_state: { ...nextState, last_visible_task: "none" },
      draft,
      visible_task: "none",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      get_info_db: false,
      get_info_product: true,
      handoff_to_local_flow: false,
      target_dispatcher: "product_help",
      subskill_context: output.subskill_call.context_for_subskill,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: output.note_information.value,
    };
  }

  if (output.flow_action === "handoff_to_local_flow") {
    return {
      status: "topic_change",
      reason_code: "adjust_plan_item_handoff_to_local_flow",
      local_state: null,
      draft: null,
      visible_task: "none",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      get_info_db: false,
      get_info_product: false,
      handoff_to_local_flow: true,
      target_dispatcher: output.note_information.value?.target_dispatcher ??
        "other_local",
      subskill_context: output.subskill_call.context_for_subskill,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: output.exit_memo,
      note_information: output.note_information.value,
    };
  }

  if (output.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "adjust_plan_item_local_safety_preempt",
      local_state: nextState,
      draft: null,
      visible_task: "safety",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      target_dispatcher: "safety_crisis",
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: output.note_information.value,
    };
  }
  if (
    output.flow_action === "apply_attempt" && visibleTask === "apply_attempt"
  ) {
    return {
      status: "apply_attempt",
      reason_code: "adjust_plan_item_apply_attempt_no_chat_mutation",
      local_state: nextState,
      draft,
      visible_task: "apply_attempt",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [{
        type: "adjust_plan_item",
        reason_code: "chat_plan_mutation_disabled_platform_handoff",
      }],
      exit_memo: null,
      note_information: null,
    };
  }
  if (
    output.flow_action === "repeat_plan_handoff" &&
    visibleTask === "repeat_plan_handoff"
  ) {
    return {
      status: "repeat_handoff",
      reason_code: "adjust_plan_item_repeat_platform_handoff",
      local_state: nextState,
      draft,
      visible_task: "repeat_plan_handoff",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: null,
    };
  }
  if (visibleTask === "contract_recovery") {
    return {
      status: "blocked",
      reason_code: "adjust_plan_item_contract_recovery",
      local_state: nextState,
      draft: null,
      visible_task: "contract_recovery",
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [{
        type: "local_flow_runtime",
        reason_code: "handoff_missing_suggested_platform_input",
      }],
      exit_memo: null,
      note_information: null,
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
      conversation_context: baseConversationContext,
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_score: output.risk_score,
      blocked_effects: [],
      exit_memo: null,
      note_information: null,
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
    conversation_context: baseConversationContext,
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_score: output.risk_score,
    blocked_effects: [],
    exit_memo: null,
    note_information: null,
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow adjust_plan_item.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Le flow est deja actif ou vient d'etre selectionne. Tu n'es pas le dispatcher global.",
    "Tu ne sors vers le dispatcher global que si le message quitte clairement ce flow.",
    "Mission: aider le user a preparer une proposition d'ajustement a reprendre dans la surface Plan.",
    "Avant tout handoff Plan, stabilise toujours trois decisions distinctes: quoi modifier (scope.target_summary ou cible Plan resolue), pourquoi modifier (adjustment_need.reason_change), et nature de la modification (adjustment_need.change_kind: reduce, increase, pause, resume, replace, split, reschedule, copy_forward ou bridge_action).",
    "Ne produis pas prepare_plan_handoff, revise_plan_handoff, repeat_plan_handoff ou apply_attempt exploitable si ces trois decisions ne sont pas claires; demande la clarification manquante.",
    "Le chat ne modifie jamais le plan, n'ecrit jamais en DB, ne cree jamais de confirmation executable ni token.",
    "Tu es l'unique decideur metier du flow actif: scope, raison, changement souhaite, contraintes, handoff, revision, repeat, destination, apply_attempt et sortie.",
    "Aucune regex metier, aucun mot-cle isole, aucune decision par template.",
    "Scopes autorises: specific_plan_item, action_cluster, current_week, current_level, whole_plan, multi_plan, unknown.",
    "Si plusieurs plans existent, preserve plan_id et plan_title quand disponibles. Ne melange jamais des plans differents dans une recommandation indistincte.",
    "Si le user demande d'appliquer, valider ou modifier depuis le chat, retourne apply_attempt, jamais une execution.",
    "Si le user pose une question sur l'état DB utile à l'ajustement (actions prévues, actions existantes, plans actifs, ce qui est déjà dans le plan), retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap. Le flow adjust_plan_item reste actif.",
    "Pour get_info_db, remplis subskill_call.context_for_subskill avec active_flow='adjust_plan_item', question_to_answer reformulée, active_flow_context utile (scope, adjustment_need, platform_handoff, plan_snapshot pertinent).",
    "Si le user pose une question produit/navigation limitée au Plan, retourne get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help. Le flow adjust_plan_item reste actif.",
    "Si le user demande une carte d'attaque ou de défense directement liée à l'action collectée, retourne handoff_to_local_flow avec note_information vers prepare_attack_card ou prepare_defense_card.",
    "Si le user demande une potion, une preference, un rappel ou un autre sujet clair hors flow, retourne exit_to_global_dispatcher avec note_information.",
    "Si le user veut arrêter ou reporter ce flow, retourne exit_to_global_dispatcher avec note_information vers global.",
    ...directEffectLocalDispatcherPromptLines(),
    "Toute sortie vers un autre dispatcher ou inline tool doit inclure note_information canonique.",
    "visible_task.conversation_context doit être filtré: pas de dump DB brut, pas de mémoire brute, seulement les éléments utiles au prompt visible.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Choisis une action autorisee par ce contrat, pas une action generique. Utilise answer_current_field quand le user continue a remplir le champ courant; clarify_scope, clarify_adjustment_need ou clarify_constraints quand une information manque; prepare_plan_handoff seulement quand quoi_modifier + reason_change + requested_change + change_kind exploitable sont stabilises; revise_plan_handoff quand le user corrige une proposition deja complete; repeat_plan_handoff quand il demande de redire une proposition complete; platform_destination_followup quand il demande ou le reprendre dans le produit; explain_handoff quand il demande pourquoi; apply_attempt quand il demande d'appliquer/valider depuis le chat et que la proposition complete existe, sinon clarifie ce qui manque; get_info_db/get_info_product/inline_tool_roundtrip pour un roundtrip temporaire; handoff_to_local_flow seulement vers un flow local autorise; exit_to_global_dispatcher pour arreter ce flow ou pour un nouveau sujet clair; safety_preempt pour safety reelle; contract_recovery si tu ne peux pas produire une sortie coherente. Ne choisis jamais une action par mot-cle isole.",
    "- confidence: high si l'intention et la prochaine action sont claires; medium si l'intention est probable mais qu'un champ reste incomplet; low si clarification, prudence ou recovery sont necessaires. La confidence ne remplace pas evidence.",
    "- risk_score: score local 0..10. Garde 0 pour une demande normale d'ajustement. Monte seulement si le message courant porte un risque reel. Ne cree pas de safety par hypothese; si safety est reelle, flow_action=safety_preempt et note_information vers safety_crisis.",
    "- adjust_plan_intent.kind: etiquette semantique du message courant dans ce flow. start_or_continue pour une continuation globale; scope_answer, need_answer ou constraint_answer pour une reponse de slot; handoff_request pour une demande de proposition Plan; handoff_revision pour correction; repeat, destination, explain, apply_attempt, cancel, off_topic, safety ou unclear selon le tour. Le summary explique en une phrase ce qui vient d'etre compris.",
    "- scope: represente seulement la cible Plan, c'est le quoi modifier. Renseigne plan_id, plan_title, level_id, level_title et plan_item_ids uniquement depuis db_context_pack, plan_snapshot, note_information ou mots user resolus avec confiance. target_summary doit dire l'element a changer en langage produit/humain. needs_scope_clarification=true si la cible reste ambigue. Ne transforme jamais une memoire ou une hypothese en id verrouille.",
    "- adjustment_need: contient le pourquoi, le quoi changer et la nature du changement. reason_change explique pourquoi le plan doit bouger; requested_change explique le resultat attendu; change_kind encode la nature de modification avec reduce, increase, pause, resume, replace, split, reschedule, copy_forward ou bridge_action. Utilise clarify/unknown/null seulement si la nature est insuffisante, puis clarifie au lieu de handoff. constraints, preserve et avoid conservent les limites explicites du user; missing liste uniquement les informations utiles qui manquent. Ne fabrique pas de profil global ni de preference durable.",
    "- platform_handoff: brouillon non-mutant a reprendre dans Plan. status=none tant qu'aucune proposition n'existe; draft_ready seulement quand target_summary/cible + reason_change + requested_change + change_kind exploitable sont presents; delivered apres proposition deja donnee; revised apres correction; repeat pour repetition; apply_attempt quand le user veut appliquer depuis chat; cancelled quand le flow est abandonne. destination vaut Plan seulement si la proposition est a reprendre dans la surface Plan. grouped_by_plan est obligatoire si plusieurs plans sont touches; sinon laisse []. previous_value/revised_value servent aux revisions, sinon null.",
    "- state_updates: status et stage de l'etat local apres ce tour. turn_count_increment vaut 1 en general, 0 seulement pour recovery sans progression, jamais plus de 3. close_after_visible=true uniquement pour exit_to_global_dispatcher ou sortie definitive. N'utilise pas close_after_visible pour une clarification ou un repeat.",
    "- visible_task.kind: stage visible exact pour le reducer et le prompt visible. Choisis clarify_scope, clarify_adjustment_need, clarify_constraints, plan_handoff_ready, revise_plan_handoff, repeat_plan_handoff, destination_short, explain_handoff, inline_tool_return, apply_attempt, cancel_close, exit_or_cancel, safety, contract_recovery ou none. Utilise none pour les transitions sans message visible local et pour les inline tools avant retour. Pour cancel_flow, defer_flow ou complete_flow, utilise cancel_close ou exit_or_cancel selon le contrat local, pas un stage generique.",
    "- visible_task.instruction: consigne courte pour le reducer/observabilite, pas un message visible. Elle ne doit pas contenir un template complet pour le user.",
    "- visible_task.conversation_context: seul contexte que l'agent visible peut utiliser. Remplis state_summary, user_words, field_or_stage, known_values, missing_or_weak_values, selected_candidate, handoff_data, tone_constraints, do_not_say, context_summary et evidence_used avec des donnees filtrees. Pour tout stage de handoff, known_values doit permettre de lire quoi_modifier via scope.target_summary/selected_candidate, pourquoi via reason_change, et nature via change_kind; sinon mets le champ manquant dans missing_or_weak_values et choisis une clarification. N'y mets jamais DB brute, memoire brute, route_decision brute, turn_frame brut ou note_information brute. Ajoute toujours dans do_not_say l'interdiction de dire que le Plan est applique, modifie, sauvegarde ou disponible si aucune mutation n'a eu lieu.",
    "- subskill_call: needed=true seulement pour get_info_db, get_info_product ou inline_tool_roundtrip. skill_id=status_recap pour etat DB; product_help pour navigation/usage produit. context_for_subskill doit inclure active_flow='adjust_plan_item', question_to_answer, et active_flow_context compact. L'inline tool ne doit pas effacer l'etat parent.",
    "- exit_memo: needed=true pour exit_to_global_dispatcher et safety_preempt; utile aussi pour handoff_to_local_flow si le prochain dispatcher doit comprendre l'etat quitte. reason doit expliquer topic_change, product_help, status_question, explicit_tool_request, preference_update, normal_coaching, safety, unknown ou none. local_flow_context resume scope, besoin, dernier handoff, no_chat_mutation et incertitudes. handoff_hint_for_global_dispatcher aide le global sans imposer sa decision.",
    "- note_information: obligatoire pour exit_to_global_dispatcher, safety_preempt, handoff_to_local_flow, get_info_db, get_info_product et inline_tool_roundtrip. needed=false et value=null seulement pour les continuations locales, repeat, destination_short et apply_attempt. La note est consommee par le dispatcher cible; elle ne va jamais brute au prompt visible.",
    "- evidence: indices semantiques reels utilises dans ce tour, par exemple mots du user ou faits DB compacts. Pas de pseudo-preuves, pas de raisonnement invente, pas de citation de champs que tu n'as pas utilises.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: le user arrete/reporte ce flow ou apporte un nouveau sujet clair. Produis exit_memo et note_information vers global; visible_task.kind=none ou exit_or_cancel selon reprise attendue; le global peut reanalyser le meme message.",
    "- safety_preempt: safety prioritaire. Produis risk_score raccord, note_information vers safety_crisis, visible_task.kind=safety ou none selon pipeline, et n'appelle pas le global normal.",
    "- handoff_to_local_flow: seulement si le contrat local l'autorise et que le nouveau flow est explicitement pertinent, par exemple prepare_attack_card ou prepare_defense_card lie a l'action collectee. Produis note_information avec source_flow, etat collecte, incertitudes et recommended_next_focus.",
    "",
    "Exemples JSON non visibles (2 seulement):",
    "Continuation normale:",
    '{"flow_action":"prepare_plan_handoff","confidence":"high","risk_score":0,"adjust_plan_intent":{"kind":"handoff_request","summary":"Le user veut alleger l\'action du soir sans l\'abandonner."},"scope":{"kind":"specific_plan_item","confidence":"high","plan_id":"plan-1","plan_title":"Plan principal","level_id":null,"level_title":null,"plan_item_ids":["item-1"],"target_summary":"Action du soir","needs_scope_clarification":false},"adjustment_need":{"reason_change":"trop lourd cette semaine","requested_change":"passer en version 5 minutes","change_kind":"reduce","constraints":["cette semaine"],"preserve":["signal de pause"],"avoid":["abandonner"],"missing":[]},"platform_handoff":{"status":"draft_ready","destination":"Plan","suggested_platform_input":"Alleger l\'action du soir en version 5 minutes, en gardant le signal de pause.","grouped_by_plan":[],"previous_value":null,"revised_value":null},"state_updates":{"status":"handoff_ready","stage":"handoff","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"plan_handoff_ready","instruction":"Donner la proposition a reprendre dans Plan.","conversation_context":{"state_summary":"Action du soir a alleger cette semaine.","user_words":["version 5 minutes"],"field_or_stage":"handoff","known_values":{"scope":{"kind":"specific_plan_item","confidence":"high","plan_id":"plan-1","plan_title":"Plan principal","level_id":null,"level_title":null,"plan_item_ids":["item-1"],"target_summary":"Action du soir","needs_scope_clarification":false},"adjustment_need":{"reason_change":"trop lourd cette semaine","requested_change":"passer en version 5 minutes","change_kind":"reduce","constraints":["cette semaine"],"preserve":["signal de pause"],"avoid":["abandonner"],"missing":[]},"constraints":["cette semaine"],"preserve":["signal de pause"],"avoid":["abandonner"]},"missing_or_weak_values":[],"selected_candidate":{"plan_id":"plan-1","plan_item_ids":["item-1"]},"handoff_data":{"destination":"Plan","suggested_platform_input":"Alleger l\'action du soir en version 5 minutes, en gardant le signal de pause.","grouped_by_plan":[],"previous_value":null,"revised_value":null},"tone_constraints":[],"do_not_say":["Ne dis pas que le Plan est applique ou modifie."],"context_summary":"Proposition non-mutante a reprendre dans Plan.","evidence_used":["version 5 minutes","sans abandonner"]}},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":null,"handoff_hint_for_global_dispatcher":null},"note_information":{"needed":false,"value":null},"evidence":["version 5 minutes","sans abandonner"]}',
    "Transition critique:",
    '{"flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"adjust_plan_intent":{"kind":"off_topic","summary":"Le user quitte l\'ajustement et demande un rappel."},"scope":{"kind":"unknown","confidence":"low","plan_id":null,"plan_title":null,"level_id":null,"level_title":null,"plan_item_ids":[],"target_summary":null,"needs_scope_clarification":true},"adjustment_need":{"reason_change":null,"requested_change":null,"change_kind":null,"constraints":[],"preserve":[],"avoid":[],"missing":[]},"platform_handoff":{"status":"none","destination":null,"suggested_platform_input":null,"grouped_by_plan":[],"previous_value":null,"revised_value":null},"state_updates":{"status":"exit_to_global","stage":"closing","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"none","instruction":"Laisser le global reanalyser le nouveau sujet.","conversation_context":null},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"exit_memo":{"needed":true,"reason":"explicit_tool_request","user_intent_summary":"Demande de rappel hors ajustement Plan.","local_flow_context":{"skill_id":"adjust_plan_item","stage":"handoff","no_chat_mutation":true,"uncertainties":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"create_reminder","why":"Le message courant demande un rappel."}},"note_information":{"needed":true,"value":{"source_flow_id":"adjust_plan_item","handoff_reason":"topic_change","target_dispatcher":"global","handoff_context_for_next_dispatcher":"Le user demande un rappel hors ajustement Plan.","user_words":["fais-moi un rappel"],"structured_context":{"source_flow":"adjust_plan_item","active_flow_summary":"Flow ajuste Plan quitte pour un nouveau sujet.","collected_state":{"no_chat_mutation":true},"unresolved_questions":[],"recommended_next_focus":"global"},"confidence":"high"}},"evidence":["demande un rappel"]}',
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
    note_information_inbound: input.note_information_inbound ?? null,
    route_decision_context_only: input.route_decision,
    turn_frame_context_only: input.turn_frame,
    db_context_pack: input.db_context_pack ?? {
      source: "plan_snapshot_legacy",
      freshness: "same_turn",
      confidence: "medium",
      plan_items: (input.plan_snapshot as any)?.items ?? input.plan_snapshot ??
        [],
      surface_capabilities: {
        plan_handoff_destination: "Plan",
        chat_can_mutate_plan: false,
      },
    },
    micro_memory_context: input.micro_memory_context ?? {
      items: [],
      exclusions: ["not_loaded_for_this_turn"],
      budget: { max_items: 0, reason: "not_needed_or_unavailable" },
    },
    plan_snapshot_legacy_context_only: input.plan_snapshot ?? null,
    platform_context: withDirectEffectLocalContext({}, input.plan_snapshot),
    platform_destination: "Plan",
    required_json_shape: {
      flow_action:
        "answer_current_field|clarify_scope|clarify_adjustment_need|clarify_constraints|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|platform_destination_followup|explain_handoff|get_info_db|get_info_product|inline_tool_roundtrip|handoff_to_local_flow|apply_attempt|cancel_flow|defer_flow|complete_flow|exit_to_global_dispatcher|safety_preempt|contract_recovery",
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
        skill_id: "status_recap|product_help|null",
        reason: "string|null",
        context_for_subskill: "object",
      },
      exit_memo: "object",
      note_information: {
        needed: "boolean",
        value: "canonical note_information object or null",
      },
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

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  WeeklyHumanSignals,
} from "../../../_shared/weekly_review/contract.ts";
import type { ActiveTransformationRuntime } from "../../../_shared/v2-runtime.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../../context/recent_messages_policy.ts";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import {
  type ActiveActionCandidateForDirectEffects,
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  clearWeeklyReviewState,
  readWeeklyReviewState,
  writeWeeklyReviewState,
} from "./state.ts";
import { runWeeklyReviewVisibleAgent } from "./visible_agent.ts";

export const WEEKLY_REVIEW_EXIT_MEMO_KEY =
  "__last_weekly_adaptive_review_exit_memo";

export type WeeklyReviewLocalFlowAction =
  | "answer_weekly_question"
  | "confirm_weekly_diagnostic"
  | "reject_weekly_diagnostic"
  | "clarify_human_signal"
  | "recap_weekly"
  | "explain_weekly_reasoning"
  | "forgotten_progress_correction"
  | "clarify_forgotten_progress"
  | "complete_weekly_no_change"
  | "complete_flow"
  | "exit_to_global_dispatcher"
  | "defer_flow"
  | "inline_tool_roundtrip"
  | "handoff_to_local_flow"
  | "safety_preempt";

export type WeeklyReviewFeltProgress =
  | "aligned"
  | "encouraged"
  | "neutral"
  | "frustrated"
  | "disconnected"
  | "worried"
  | "unclear"
  | "unknown";

export type WeeklyReviewVisibleTaskKind =
  | "ask_week_experience"
  | "review_action_gaps"
  | "explore_action_blocker"
  | "qualify_attack_or_defense_fit"
  | "ask_global_progress_feeling"
  | "deepen_global_progress"
  | "qualify_solution_fit"
  | "offer_child_detour"
  | "return_from_child_flow"
  | "weekly_synthesis"
  | "weekly_closure"
  | "answer_weekly_question"
  | "clarify_human_signal"
  | "weekly_recap"
  | "explain_reasoning"
  | "forgotten_progress_clarify"
  | "forgotten_progress_ack"
  | "forgotten_progress_blocked"
  | "stop_close"
  | "stop_or_cancel"
  | "inline_tool_return"
  | "exit_or_cancel"
  | "safety_transition"
  | "safety";

export type WeeklyReviewGateStatus =
  | "missing"
  | "captured"
  | "needs_deeper"
  | "complete";

export type WeeklyReviewGates = {
  week_experience_status: WeeklyReviewGateStatus;
  action_review_status: WeeklyReviewGateStatus;
  global_progress_status: WeeklyReviewGateStatus;
  felt_progress_status: WeeklyReviewGateStatus;
  solution_fit_status: WeeklyReviewGateStatus;
  synthesis_status: WeeklyReviewGateStatus;
  closure_status: WeeklyReviewGateStatus;
};

export type WeeklyReviewDetourKind =
  | "none"
  | "attack_card"
  | "defense_card"
  | "adjust_plan_item"
  | "select_state_potion"
  | "create_one_shot_reminder"
  | "create_recurring_reminder"
  | "product_help"
  | "status_recap";

export type WeeklyReviewDetourReadiness =
  | "none"
  | "explore_fit"
  | "offer"
  | "user_confirmed";

export type WeeklyReviewDetourCandidate = {
  kind: WeeklyReviewDetourKind;
  source_stage: string | null;
  target_action_or_plan: string | null;
  fit_hypothesis: string | null;
  readiness: WeeklyReviewDetourReadiness;
  user_consent: boolean;
  scope: Record<string, unknown>;
  return_focus: string | null;
};

export type WeeklyReviewActionStatusCorrection = {
  plan_item_id: string | null;
  occurrence_id: string | null;
  title: string | null;
  corrected_status: "completed" | "partial" | "missed" | "unknown";
  user_evidence: string | null;
  source_turn_summary: string | null;
};

export type WeeklyReviewConversationContext = {
  state_summary: string;
  user_words: string[];
  week_window: {
    start_date: string | null;
    end_date: string | null;
  };
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  weekly_strategy: {
    strategy_label_human: string | null;
    reason_human: string | null;
    confidence: "low" | "medium" | "high";
  };
  plan_contexts: Array<Record<string, unknown>>;
  item_summaries: Array<Record<string, unknown>>;
  handoff_data: Record<string, unknown>;
  forgotten_progress: Record<string, unknown>;
  inline_result: Record<string, unknown>;
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  current_action_focus: Record<string, unknown> | null;
  known_action_gaps: Array<Record<string, unknown>>;
  global_objective_signal: Record<string, unknown>;
  felt_progress_signal: Record<string, unknown>;
  child_flow_return_summary: string | null;
  next_required_weekly_step: WeeklyReviewVisibleTaskKind | null;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type WeeklyReviewLocalFlowState = {
  stage:
    | "opening"
    | "week_experience"
    | "action_review"
    | "action_blocker"
    | "global_progress"
    | "solution_fit"
    | "child_detour"
    | "synthesis"
    | "closure"
    | "collecting_human_signal"
    | "strategy_ready"
    | "closing";
  proposal_status:
    | "none"
    | "detour_discussed"
    | "detour_active"
    | "cancelled";
  validation_unlock_status: "locked_until_weekly_complete" | "available";
  human_signals: WeeklyHumanSignals;
  felt_progress: WeeklyReviewFeltProgress;
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  last_user_signal: string | null;
  last_visible_summary: string | null;
  last_handoff_summary: string | null;
  child_flow: {
    status: "none" | "proposed" | "active" | "completed" | "cancelled";
    flow_id: string | null;
    reason: string | null;
    expected_return_focus: string | null;
    result_summary: string | null;
    result_details?: Record<string, unknown> | null;
  };
  user_corrected_action_statuses: WeeklyReviewActionStatusCorrection[];
  turn_count: number;
  max_turns: number;
  updated_at: string;
};

export type WeeklyReviewExitMemo = {
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
  local_flow_context: {
    skill_id: "weekly_adaptive_review_v1";
    weekly_stage: string | null;
    week_strategy: string | null;
    last_weekly_question: string | null;
    last_visible_summary: string | null;
    last_handoff_summary: string | null;
    validation_unlock_status: string | null;
    committed_effects: unknown[];
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent:
      | "prepare_attack_card"
      | "prepare_defense_card"
      | "select_state_potion"
      | "create_one_shot_reminder"
      | "create_recurring_reminder"
      | "update_coach_preferences"
      | "status_recap"
      | "adjust_plan_item"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string | null;
    constraints: string[];
  };
};

export type WeeklyReviewLocalDispatcherOutput = {
  flow_action: WeeklyReviewLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  target_dispatcher: NoteInformationTargetDispatcher | "none";
  weekly_intent: {
    kind:
      | "weekly_answer"
      | "weekly_confirmation"
      | "weekly_rejection"
      | "weekly_recap"
      | "weekly_explain"
      | "detour_request"
      | "detour_revision"
      | "forgotten_progress"
      | "stop"
      | "off_topic"
      | "explicit_tool_request"
      | "safety"
      | "unclear";
    summary: string;
  };
  human_signal_updates: {
    objective_delta: WeeklyHumanSignals["objective_delta"] | null;
    felt_progress: WeeklyReviewFeltProgress | null;
    felt_state: WeeklyHumanSignals["felt_state"] | null;
    dominant_blocker_confirmation: "confirmed" | "rejected" | "unclear" | null;
    user_summary: string | null;
  };
  handoff_updates: {
    status:
      | "none"
      | "requested"
      | "ready"
      | "delivered"
      | "revised"
      | "cancelled";
    requested_adjustment_summary: string | null;
    revision_summary: string | null;
    platform_destination: "Plan" | null;
    scope: {
      kind:
        | "whole_week"
        | "specific_plan"
        | "specific_item"
        | "ambiguous"
        | "none";
      plan_id: string | null;
      plan_title: string | null;
      plan_item_ids: string[];
      scope_summary: string | null;
      needs_scope_clarification: boolean;
    };
  };
  forgotten_progress: {
    status:
      | "none"
      | "candidate"
      | "needs_target"
      | "ready_for_progress_tool"
      | "blocked";
    target_hint: string | null;
    outcome_hint: "completed" | "partial" | "unknown" | null;
    evidence: string | null;
  };
  action_status_updates: WeeklyReviewActionStatusCorrection[];
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  state_updates: {
    status:
      | "open"
      | "proposal_discussed"
      | "handoff_ready"
      | "completed"
      | "stopped"
      | "deferred"
      | "exit_to_global"
      | "handoff_to_local_flow"
      | "safety";
    weekly_stage: WeeklyReviewLocalFlowState["stage"];
    validation_unlock_status: "locked_until_weekly_complete" | "available";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: WeeklyReviewVisibleTaskKind;
    instruction: string;
    conversation_context: WeeklyReviewConversationContext | null;
  };
  exit_memo: WeeklyReviewExitMemo;
  note_information: NoteInformation | null;
  evidence: string[];
};

export type WeeklyReviewReducerResult = {
  status:
    | "answered"
    | "handoff"
    | "handoff_to_local_flow"
    | "inline_tool_roundtrip"
    | "closed"
    | "exit"
    | "safety"
    | "blocked";
  reason_code: string;
  weekly_state: Record<string, unknown> | null;
  visible_task: WeeklyReviewVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  tool_execution: OperationRuntimeResult["toolExecution"];
  handoff_summary: string | null;
  answer_summary: string | null;
  target_dispatcher: NoteInformationTargetDispatcher | "none";
  note_information: NoteInformation | null;
  conversation_context: WeeklyReviewConversationContext | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullableString(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "null" ? text : null;
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  let cleaned = String(raw ?? "").trim();
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("weekly_review_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("weekly_review_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[] | Set<string>,
  fallback: T,
): T {
  const raw = cleanText(value);
  const allowedValues: readonly string[] = Array.isArray(allowed)
    ? allowed
    : [...allowed];
  const has = allowedValues.includes(raw);
  return has ? raw as T : fallback;
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

const FLOW_ACTIONS: WeeklyReviewLocalFlowAction[] = [
  "answer_weekly_question",
  "confirm_weekly_diagnostic",
  "reject_weekly_diagnostic",
  "clarify_human_signal",
  "recap_weekly",
  "explain_weekly_reasoning",
  "forgotten_progress_correction",
  "clarify_forgotten_progress",
  "complete_weekly_no_change",
  "complete_flow",
  "exit_to_global_dispatcher",
  "defer_flow",
  "inline_tool_roundtrip",
  "handoff_to_local_flow",
  "safety_preempt",
];

const VISIBLE_TASKS: WeeklyReviewVisibleTaskKind[] = [
  "ask_week_experience",
  "review_action_gaps",
  "explore_action_blocker",
  "qualify_attack_or_defense_fit",
  "ask_global_progress_feeling",
  "deepen_global_progress",
  "qualify_solution_fit",
  "offer_child_detour",
  "return_from_child_flow",
  "weekly_synthesis",
  "weekly_closure",
  "answer_weekly_question",
  "clarify_human_signal",
  "weekly_recap",
  "explain_reasoning",
  "forgotten_progress_clarify",
  "forgotten_progress_ack",
  "forgotten_progress_blocked",
  "stop_close",
  "stop_or_cancel",
  "inline_tool_return",
  "exit_or_cancel",
  "safety_transition",
  "safety",
];

const WEEKLY_GATE_STATUSES: WeeklyReviewGateStatus[] = [
  "missing",
  "captured",
  "needs_deeper",
  "complete",
];

const DETOUR_KINDS: WeeklyReviewDetourKind[] = [
  "none",
  "attack_card",
  "defense_card",
  "adjust_plan_item",
  "select_state_potion",
  "create_one_shot_reminder",
  "create_recurring_reminder",
  "product_help",
  "status_recap",
];

const DETOUR_READINESS_VALUES: WeeklyReviewDetourReadiness[] = [
  "none",
  "explore_fit",
  "offer",
  "user_confirmed",
];

const WEEKLY_INTENTS: WeeklyReviewLocalDispatcherOutput["weekly_intent"][
  "kind"
][] = [
  "weekly_answer",
  "weekly_confirmation",
  "weekly_rejection",
  "weekly_recap",
  "weekly_explain",
  "detour_request",
  "detour_revision",
  "forgotten_progress",
  "stop",
  "off_topic",
  "explicit_tool_request",
  "safety",
  "unclear",
];

const OBJECTIVE_DELTAS: Array<WeeklyHumanSignals["objective_delta"]> = [
  "clear_progress",
  "slight_progress",
  "stable",
  "regression",
  "unclear",
  "unknown",
];

const FELT_STATES: Array<WeeklyHumanSignals["felt_state"]> = [
  "energized",
  "stable",
  "tired_but_ok",
  "frustrated",
  "overloaded",
  "lost",
  "unknown",
];

const FELT_PROGRESS_VALUES: WeeklyReviewFeltProgress[] = [
  "aligned",
  "encouraged",
  "neutral",
  "frustrated",
  "disconnected",
  "worried",
  "unclear",
  "unknown",
];

function humanSignalOrNull<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  const raw = cleanText(value);
  return raw === "null" || !raw ? null : enumValue(raw, allowed, null as never);
}

function dominantBlockerConfirmation(
  value: unknown,
): "confirmed" | "rejected" | "unclear" | null {
  const raw = cleanText(value);
  if (!raw || raw === "null") return null;
  return enumValue<"confirmed" | "rejected" | "unclear">(
    raw,
    ["confirmed", "rejected", "unclear"],
    "unclear",
  );
}

function forgottenOutcomeHint(
  value: unknown,
): "completed" | "partial" | "unknown" | null {
  const raw = cleanText(value);
  if (!raw || raw === "null") return null;
  return enumValue<"completed" | "partial" | "unknown">(
    raw,
    ["completed", "partial", "unknown"],
    "unknown",
  );
}

function actionStatus(value: unknown): WeeklyReviewActionStatusCorrection[
  "corrected_status"
] {
  const raw = cleanText(value);
  if (raw === "done" || raw === "complete" || raw === "completed") {
    return "completed";
  }
  if (raw === "partial" || raw === "partiel") return "partial";
  if (
    raw === "missed" || raw === "not_done" || raw === "not_completed" ||
    raw === "failed"
  ) {
    return "missed";
  }
  return "unknown";
}

function normalizeActionStatusCorrections(
  raw: unknown,
): WeeklyReviewActionStatusCorrection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const root = isRecord(item) ? item : {};
    const planItemId = nullableString(root.plan_item_id);
    const occurrenceId = nullableString(root.occurrence_id);
    const title = nullableString(root.title);
    const correctedStatus = actionStatus(
      root.corrected_status ?? root.status ?? root.outcome,
    );
    if (!planItemId && !occurrenceId && !title) return [];
    return [{
      plan_item_id: planItemId,
      occurrence_id: occurrenceId,
      title,
      corrected_status: correctedStatus,
      user_evidence: nullableString(root.user_evidence ?? root.evidence),
      source_turn_summary: nullableString(root.source_turn_summary),
    }];
  }).slice(0, 12);
}

function correctionKey(correction: WeeklyReviewActionStatusCorrection): string {
  if (correction.occurrence_id) return `occurrence:${correction.occurrence_id}`;
  if (correction.plan_item_id) return `plan_item:${correction.plan_item_id}`;
  return `title:${cleanText(correction.title).toLowerCase()}`;
}

function mergeActionStatusCorrections(
  previous: WeeklyReviewActionStatusCorrection[],
  incoming: WeeklyReviewActionStatusCorrection[],
): WeeklyReviewActionStatusCorrection[] {
  const byKey = new Map<string, WeeklyReviewActionStatusCorrection>();
  for (const correction of previous) {
    const key = correctionKey(correction);
    if (key !== "title:") byKey.set(key, correction);
  }
  for (const correction of incoming) {
    const key = correctionKey(correction);
    if (key !== "title:") byKey.set(key, correction);
  }
  return [...byKey.values()].slice(-12);
}

function normalizeWeeklyGates(
  raw: unknown,
  fallback: Partial<WeeklyReviewGates> = {},
): WeeklyReviewGates {
  const root = isRecord(raw) ? raw : {};
  return {
    week_experience_status: enumValue(
      root.week_experience_status,
      WEEKLY_GATE_STATUSES,
      fallback.week_experience_status ?? "missing",
    ),
    action_review_status: enumValue(
      root.action_review_status,
      WEEKLY_GATE_STATUSES,
      fallback.action_review_status ?? "missing",
    ),
    global_progress_status: enumValue(
      root.global_progress_status,
      WEEKLY_GATE_STATUSES,
      fallback.global_progress_status ?? "missing",
    ),
    felt_progress_status: enumValue(
      root.felt_progress_status,
      WEEKLY_GATE_STATUSES,
      fallback.felt_progress_status ?? "missing",
    ),
    solution_fit_status: enumValue(
      root.solution_fit_status,
      WEEKLY_GATE_STATUSES,
      fallback.solution_fit_status ?? "missing",
    ),
    synthesis_status: enumValue(
      root.synthesis_status,
      WEEKLY_GATE_STATUSES,
      fallback.synthesis_status ?? "missing",
    ),
    closure_status: enumValue(
      root.closure_status,
      WEEKLY_GATE_STATUSES,
      fallback.closure_status ?? "missing",
    ),
  };
}

function normalizeDetourCandidate(
  raw: unknown,
): WeeklyReviewDetourCandidate {
  const root = isRecord(raw) ? raw : {};
  const scope = isRecord(root.scope) ? root.scope : {};
  return {
    kind: enumValue(root.kind, DETOUR_KINDS, "none"),
    source_stage: nullableString(root.source_stage),
    target_action_or_plan: nullableString(root.target_action_or_plan),
    fit_hypothesis: nullableString(root.fit_hypothesis),
    readiness: enumValue(root.readiness, DETOUR_READINESS_VALUES, "none"),
    user_consent: root.user_consent === true,
    scope,
    return_focus: nullableString(root.return_focus),
  };
}

function mergeWeeklyGates(
  previous: WeeklyReviewGates,
  next: WeeklyReviewGates,
): WeeklyReviewGates {
  const keepCaptured = (
    previousValue: WeeklyReviewGateStatus,
    nextValue: WeeklyReviewGateStatus,
  ) =>
    nextValue === "missing" && previousValue !== "missing"
      ? previousValue
      : nextValue;
  return {
    week_experience_status: keepCaptured(
      previous.week_experience_status,
      next.week_experience_status,
    ),
    action_review_status: keepCaptured(
      previous.action_review_status,
      next.action_review_status,
    ),
    global_progress_status: keepCaptured(
      previous.global_progress_status,
      next.global_progress_status,
    ),
    felt_progress_status: keepCaptured(
      previous.felt_progress_status,
      next.felt_progress_status,
    ),
    solution_fit_status: keepCaptured(
      previous.solution_fit_status,
      next.solution_fit_status,
    ),
    synthesis_status: keepCaptured(
      previous.synthesis_status,
      next.synthesis_status,
    ),
    closure_status: keepCaptured(
      previous.closure_status,
      next.closure_status,
    ),
  };
}

function defaultDetourCandidate(): WeeklyReviewDetourCandidate {
  return {
    kind: "none",
    source_stage: null,
    target_action_or_plan: null,
    fit_hypothesis: null,
    readiness: "none",
    user_consent: false,
    scope: {},
    return_focus: null,
  };
}

function normalizeExitMemo(
  raw: unknown,
  action: WeeklyReviewLocalFlowAction,
): WeeklyReviewExitMemo {
  const root = isRecord(raw) ? raw : {};
  const local = isRecord(root.local_flow_context)
    ? root.local_flow_context
    : {};
  const hint = isRecord(root.handoff_hint_for_global_dispatcher)
    ? root.handoff_hint_for_global_dispatcher
    : {};
  const needed = action === "exit_to_global_dispatcher" ||
    action === "safety_preempt" ||
    action === "handoff_to_local_flow" ||
    action === "inline_tool_roundtrip";
  return {
    needed,
    reason: enumValue(
      root.reason,
      [
        "topic_change",
        "explicit_tool_request",
        "product_help",
        "status_question",
        "preference_update",
        "normal_coaching",
        "safety",
        "unknown",
        "none",
      ],
      action === "safety_preempt" ? "safety" : needed ? "unknown" : "none",
    ),
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "weekly_adaptive_review_v1",
      weekly_stage: nullableString(local.weekly_stage),
      week_strategy: nullableString(local.week_strategy),
      last_weekly_question: nullableString(local.last_weekly_question),
      last_visible_summary: nullableString(local.last_visible_summary),
      last_handoff_summary: nullableString(local.last_handoff_summary),
      validation_unlock_status: nullableString(
        local.validation_unlock_status,
      ),
      committed_effects: Array.isArray(local.committed_effects)
        ? local.committed_effects.slice(0, 8)
        : [],
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: enumValue(
        hint.likely_intent,
        [
          "prepare_attack_card",
          "prepare_defense_card",
          "select_state_potion",
          "create_one_shot_reminder",
          "create_recurring_reminder",
          "update_coach_preferences",
          "status_recap",
          "adjust_plan_item",
          "product_help",
          "normal_coaching",
          "unknown",
        ],
        "unknown",
      ),
      why: nullableString(hint.why),
      constraints: stringArray(hint.constraints, 8),
    },
  };
}

function normalizeTargetDispatcher(
  value: unknown,
): NoteInformationTargetDispatcher | "none" {
  const raw = cleanText(value);
  const allowed: Array<NoteInformationTargetDispatcher | "none"> = [
    "none",
    "global",
    "safety_crisis",
    "clarification",
    "create_one_shot_reminder",
    "create_recurring_reminder",
    "prepare_attack_card",
    "prepare_defense_card",
    "adjust_plan_item",
    "select_state_potion",
    "track_progress_plan_item",
    "update_coach_preferences",
    "emotional_repair",
    "demotivation_repair",
    "product_help",
    "status_recap",
    "weekly_adaptive_review_v1",
    "verification_opportunities",
    "other_local",
  ];
  return allowed.includes(raw as any)
    ? raw as NoteInformationTargetDispatcher | "none"
    : "none";
}

function noteReasonForWeekly(args: {
  action: WeeklyReviewLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher;
  exitMemo: WeeklyReviewExitMemo;
}):
  | "topic_change"
  | "safety"
  | "inline_tool"
  | "bridge"
  | "explicit_user_request" {
  if (
    args.action === "safety_preempt" ||
    args.targetDispatcher === "safety_crisis"
  ) {
    return "safety";
  }
  if (args.action === "inline_tool_roundtrip") return "inline_tool";
  if (args.action === "handoff_to_local_flow") return "bridge";
  return args.exitMemo.reason === "explicit_tool_request" ||
      args.exitMemo.reason === "product_help" ||
      args.exitMemo.reason === "status_question" ||
      args.exitMemo.reason === "preference_update"
    ? "explicit_user_request"
    : "topic_change";
}

function buildWeeklySourceStateSummary(args: {
  exitMemo: WeeklyReviewExitMemo;
  intentSummary: string;
}): string {
  const local = args.exitMemo.local_flow_context;
  return [
    args.intentSummary,
    local.weekly_stage ? `stage=${local.weekly_stage}` : null,
    local.week_strategy ? `strategy=${local.week_strategy}` : null,
    local.last_handoff_summary ? `handoff=${local.last_handoff_summary}` : null,
    local.validation_unlock_status
      ? `validation=${local.validation_unlock_status}`
      : null,
  ].filter(Boolean).join(" | ") ||
    "Weekly review active; no detailed summary provided.";
}

function normalizeWeeklyNoteInformation(args: {
  raw: unknown;
  action: WeeklyReviewLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher | "none";
  exitMemo: WeeklyReviewExitMemo;
  userWords: string[];
  intentSummary: string;
  evidence: string[];
}): NoteInformation | null {
  const needsNote = args.action === "exit_to_global_dispatcher" ||
    args.action === "safety_preempt" ||
    args.action === "handoff_to_local_flow" ||
    args.action === "inline_tool_roundtrip";
  if (!needsNote) return null;
  const rawRecord = isRecord(args.raw) ? args.raw : {};
  if (Object.keys(rawRecord).length === 0) return null;
  const target = args.targetDispatcher === "none"
    ? "global"
    : args.targetDispatcher;
  const structuredContext = {
    weekly_intent_summary: args.intentSummary,
    weekly_exit_memo: args.exitMemo,
    weekly_context: args.exitMemo.local_flow_context,
    handoff_hint: args.exitMemo.handoff_hint_for_global_dispatcher,
    evidence: args.evidence,
    no_chat_plan_mutation: true,
  };
  const fallback = {
    source_flow_id: "weekly_adaptive_review_v1",
    handoff_reason: noteReasonForWeekly({
      action: args.action,
      targetDispatcher: target,
      exitMemo: args.exitMemo,
    }),
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    user_words: args.userWords,
    structured_context: {
      ...structuredContext,
      active_flow_summary: buildWeeklySourceStateSummary({
        exitMemo: args.exitMemo,
        intentSummary: args.intentSummary,
      }),
      recommended_next_focus: target,
    },
    risk_score: args.action === "safety_preempt" ? Math.max(7, 0) : 0,
  };
  return normalizeNoteInformation(rawRecord, fallback);
}

export function normalizeWeeklyReviewLocalDispatcherOutput(
  raw: unknown,
): WeeklyReviewLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const rawAction = enumValue<WeeklyReviewLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_human_signal",
  );
  const intent = isRecord(root.weekly_intent) ? root.weekly_intent : {};
  const human = isRecord(root.human_signal_updates)
    ? root.human_signal_updates
    : {};
  const handoff = isRecord(root.handoff_updates) ? root.handoff_updates : {};
  const scope = isRecord(handoff.scope) ? handoff.scope : {};
  const forgotten = isRecord(root.forgotten_progress)
    ? root.forgotten_progress
    : {};
  const actionStatusUpdates = normalizeActionStatusCorrections(
    root.action_status_updates,
  );
  const weeklyGatesRoot = isRecord(root.weekly_gates) ? root.weekly_gates : {};
  const detourCandidateRoot = isRecord(root.detour_candidate)
    ? root.detour_candidate
    : {};
  const state = isRecord(root.state_updates) ? root.state_updates : {};
  const visible = isRecord(root.visible_task) ? root.visible_task : {};
  const evidence = stringArray(root.evidence, 10);
  const exitMemo = normalizeExitMemo(root.exit_memo, rawAction);
  const noteRoot = isRecord(root.note_information)
    ? root.note_information
    : isRecord((root as any).noteInformation)
    ? (root as any).noteInformation
    : {};
  const explicitTarget = normalizeTargetDispatcher(
    root.target_dispatcher ?? noteRoot.target_dispatcher,
  );
  const targetDispatcher = explicitTarget;
  const action = rawAction;
  const weeklyIntent = {
    kind: enumValue(intent.kind, WEEKLY_INTENTS, "unclear"),
    summary: cleanText(intent.summary),
  };
  const noteInformation = normalizeWeeklyNoteInformation({
    raw: noteRoot,
    action,
    targetDispatcher,
    exitMemo,
    userWords: stringArray(root.user_words, 4),
    intentSummary: weeklyIntent.summary,
    evidence,
  });
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    target_dispatcher: targetDispatcher,
    weekly_intent: weeklyIntent,
    human_signal_updates: {
      objective_delta: humanSignalOrNull(
        human.objective_delta,
        OBJECTIVE_DELTAS,
      ),
      felt_progress: humanSignalOrNull(
        human.felt_progress,
        FELT_PROGRESS_VALUES,
      ),
      felt_state: humanSignalOrNull(human.felt_state, FELT_STATES),
      dominant_blocker_confirmation: dominantBlockerConfirmation(
        human.dominant_blocker_confirmation,
      ),
      user_summary: nullableString(human.user_summary),
    },
    handoff_updates: {
      status: enumValue(
        handoff.status,
        [
          "none",
          "requested",
          "ready",
          "delivered",
          "revised",
          "cancelled",
        ],
        "none",
      ),
      requested_adjustment_summary: nullableString(
        handoff.requested_adjustment_summary,
      ),
      revision_summary: nullableString(handoff.revision_summary),
      platform_destination: cleanText(handoff.platform_destination) === "Plan"
        ? "Plan"
        : null,
      scope: {
        kind: enumValue(
          scope.kind,
          [
            "whole_week",
            "specific_plan",
            "specific_item",
            "ambiguous",
            "none",
          ],
          "none",
        ),
        plan_id: nullableString(scope.plan_id),
        plan_title: nullableString(scope.plan_title),
        plan_item_ids: stringArray(scope.plan_item_ids, 20),
        scope_summary: nullableString(scope.scope_summary),
        needs_scope_clarification: scope.needs_scope_clarification === true,
      },
    },
    forgotten_progress: {
      status: enumValue(
        forgotten.status,
        [
          "none",
          "candidate",
          "needs_target",
          "ready_for_progress_tool",
          "blocked",
        ],
        "none",
      ),
      target_hint: nullableString(forgotten.target_hint),
      outcome_hint: forgottenOutcomeHint(forgotten.outcome_hint),
      evidence: nullableString(forgotten.evidence),
    },
    action_status_updates: actionStatusUpdates,
    weekly_gates: normalizeWeeklyGates(weeklyGatesRoot),
    detour_candidate: normalizeDetourCandidate(detourCandidateRoot),
    state_updates: {
      status: enumValue(
        state.status,
        [
          "open",
          "proposal_discussed",
          "handoff_ready",
          "completed",
          "stopped",
          "deferred",
          "exit_to_global",
          "handoff_to_local_flow",
          "safety",
        ],
        action === "exit_to_global_dispatcher" ? "stopped" : "open",
      ),
      weekly_stage: enumValue(
        state.weekly_stage,
        [
          "opening",
          "week_experience",
          "action_review",
          "action_blocker",
          "global_progress",
          "solution_fit",
          "child_detour",
          "synthesis",
          "closure",
          "collecting_human_signal",
          "strategy_ready",
          "closing",
        ],
        "strategy_ready",
      ),
      validation_unlock_status: enumValue(
        state.validation_unlock_status,
        ["locked_until_weekly_complete", "available"],
        action === "complete_weekly_no_change" || action === "complete_flow"
          ? "available"
          : "locked_until_weekly_complete",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(2, Number(state.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: state.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<WeeklyReviewVisibleTaskKind>(
        visible.kind,
        VISIBLE_TASKS,
        action === "exit_to_global_dispatcher"
          ? "exit_or_cancel"
          : action === "defer_flow"
          ? "stop_or_cancel"
          : action === "complete_weekly_no_change"
          ? "weekly_closure"
          : "review_action_gaps",
      ),
      instruction: cleanText(visible.instruction),
      conversation_context: null,
    },
    exit_memo: exitMemo,
    note_information: noteInformation,
    evidence,
  };
}

function defaultWeeklyFlowState(
  weeklyState: Record<string, unknown>,
): WeeklyReviewLocalFlowState {
  const now = new Date().toISOString();
  const raw = isRecord(weeklyState.weekly_flow_state)
    ? weeklyState.weekly_flow_state
    : {};
  const human = isRecord(raw.human_signals) ? raw.human_signals : {};
  return {
    stage: enumValue(
      raw.stage ?? raw.phase,
      [
        "opening",
        "week_experience",
        "action_review",
        "action_blocker",
        "global_progress",
        "solution_fit",
        "child_detour",
        "synthesis",
        "closure",
        "collecting_human_signal",
        "strategy_ready",
        "closing",
      ],
      "opening",
    ),
    proposal_status: enumValue(
      raw.proposal_status,
      [
        "none",
        "detour_discussed",
        "detour_active",
        "cancelled",
      ],
      "none",
    ),
    validation_unlock_status: enumValue(
      raw.validation_unlock_status,
      ["locked_until_weekly_complete", "available"],
      "locked_until_weekly_complete",
    ),
    human_signals: {
      objective_delta: enumValue(
        human.objective_delta,
        OBJECTIVE_DELTAS,
        "unknown",
      ),
      felt_state: enumValue(human.felt_state, FELT_STATES, "unknown"),
    },
    felt_progress: enumValue(
      raw.felt_progress ?? human.felt_progress,
      FELT_PROGRESS_VALUES,
      "unknown",
    ),
    weekly_gates: normalizeWeeklyGates(raw.weekly_gates, {
      week_experience_status: nullableString(raw.last_user_signal)
        ? "captured"
        : "missing",
      action_review_status: Array.isArray(
          (weeklyState.weekly_progress_review as any)?.transformations,
        )
        ? "captured"
        : "missing",
      global_progress_status: cleanText(human.objective_delta) &&
          cleanText(human.objective_delta) !== "unknown"
        ? "captured"
        : "missing",
      felt_progress_status:
        cleanText(raw.felt_progress ?? human.felt_progress) &&
          cleanText(raw.felt_progress ?? human.felt_progress) !== "unknown"
          ? "captured"
          : "missing",
      solution_fit_status: raw.proposal_status &&
          cleanText(raw.proposal_status) !== "none"
        ? "captured"
        : "missing",
      synthesis_status: "missing",
      closure_status: "missing",
    }),
    detour_candidate: normalizeDetourCandidate(
      raw.detour_candidate ?? defaultDetourCandidate(),
    ),
    last_user_signal: nullableString(raw.last_user_signal),
    last_visible_summary: nullableString(raw.last_visible_summary),
    last_handoff_summary: nullableString(
      raw.last_handoff_summary ?? raw.last_proposal_summary,
    ),
    child_flow: {
      status: enumValue(
        (raw.child_flow as any)?.status,
        ["none", "proposed", "active", "completed", "cancelled"],
        "none",
      ),
      flow_id: nullableString((raw.child_flow as any)?.flow_id),
      reason: nullableString((raw.child_flow as any)?.reason),
      expected_return_focus: nullableString(
        (raw.child_flow as any)?.expected_return_focus,
      ),
      result_summary: nullableString((raw.child_flow as any)?.result_summary),
      result_details: isRecord((raw.child_flow as any)?.result_details)
        ? (raw.child_flow as any).result_details
        : null,
    },
    user_corrected_action_statuses: normalizeActionStatusCorrections(
      raw.user_corrected_action_statuses,
    ),
    turn_count: Number(raw.turn_count ?? 0) || 0,
    max_turns: Number(raw.max_turns ?? 6) || 6,
    updated_at: nullableString(raw.updated_at) ?? now,
  };
}

function maybeRecomputeWeeklyReview(args: {
  previousReview: unknown;
  projection: unknown;
  humanSignals: WeeklyHumanSignals;
  actionStatusCorrections: WeeklyReviewActionStatusCorrection[];
  action: WeeklyReviewLocalFlowAction;
}): unknown {
  void args.action;
  const previous = isRecord(args.previousReview) ? args.previousReview : {};
  const evidence = isRecord(previous.evidence) ? previous.evidence : {};
  const previousItemDecisions = Array.isArray(previous.item_decisions)
    ? previous.item_decisions.slice(0, 12)
    : [];
  const itemDecisions = previousItemDecisions.length
    ? previousItemDecisions
    : itemSummariesFromProjection({
      weekly_progress_review: args.projection,
      weekly_flow_state: {
        user_corrected_action_statuses: args.actionStatusCorrections,
      },
    }).map((item) => ({
      title: item.title,
      plan_item_id: item.plan_item_id,
      current_week_status: item.status,
      evidence: item.evidence,
    }));
  const correctionsByKey = new Map(
    args.actionStatusCorrections.map((correction) => [
      correctionKey(correction),
      correction,
    ]),
  );
  const correctedItemDecisions = itemDecisions.map((item) => {
    const record = isRecord(item) ? item : {};
    const key = correctionKey({
      plan_item_id: nullableString(record.plan_item_id),
      occurrence_id: nullableString(record.occurrence_id),
      title: nullableString(record.title),
      corrected_status: "unknown",
      user_evidence: null,
      source_turn_summary: null,
    });
    const correction = correctionsByKey.get(key);
    if (!correction) return item;
    return {
      ...record,
      current_week_status: correction.corrected_status,
      user_corrected_status: correction.corrected_status,
      user_correction_evidence: correction.user_evidence,
    };
  });
  return {
    skill_id: "weekly_review_v1",
    status: "local_dispatcher_summary",
    evidence: {
      source: nullableString((evidence as any).source) ??
        "weekly_progress_review_v2",
      confidence: nullableString((evidence as any).confidence) ?? "medium",
      planned_count: Number(
        (evidence as any).planned_count ?? correctedItemDecisions.length,
      ) ||
        correctedItemDecisions.length,
      done_count: Number((evidence as any).done_count ?? 0) || 0,
      partial_count: Number((evidence as any).partial_count ?? 0) || 0,
      missed_count: Number((evidence as any).missed_count ?? 0) || 0,
      dominant_blockers: stringArray((evidence as any).dominant_blockers, 4),
    },
    human_signals: args.humanSignals,
    item_decisions: correctedItemDecisions,
    user_corrected_action_statuses: args.actionStatusCorrections,
    constraints: [
      "local_dispatcher_owns_weekly",
      "no_chat_plan_mutation",
      "no_legacy_plan_patch",
      "synthesis_must_preserve_partial_statuses",
    ],
    reply: null,
  };
}

function summarizeOutput(output: WeeklyReviewLocalDispatcherOutput): string {
  return output.weekly_intent.summary ||
    output.handoff_updates.revision_summary ||
    output.handoff_updates.requested_adjustment_summary ||
    output.visible_task.instruction ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

function buildHandoffSummary(
  output: WeeklyReviewLocalDispatcherOutput,
  previous: WeeklyReviewLocalFlowState,
): string | null {
  return output.handoff_updates.revision_summary ||
    output.handoff_updates.requested_adjustment_summary ||
    output.handoff_updates.scope.scope_summary ||
    previous.last_handoff_summary;
}

function childFlowWithRevision(
  childFlow: WeeklyReviewLocalFlowState["child_flow"],
  revisionSummary: string | null,
): WeeklyReviewLocalFlowState["child_flow"] {
  if (!revisionSummary) return childFlow;
  return {
    ...childFlow,
    result_details: {
      ...(isRecord(childFlow.result_details) ? childFlow.result_details : {}),
      revision_summary: revisionSummary,
    },
  };
}

function childFlowWithReturnAcknowledged(
  childFlow: WeeklyReviewLocalFlowState["child_flow"],
): WeeklyReviewLocalFlowState["child_flow"] {
  return {
    ...childFlow,
    result_details: {
      ...(isRecord(childFlow.result_details) ? childFlow.result_details : {}),
      return_acknowledged: true,
    },
  };
}

function weeklyStateForSuspendedChildFlow(args: {
  previousWeeklyState: Record<string, unknown>;
  output: WeeklyReviewLocalDispatcherOutput;
  handoffSummary: string | null;
}): Record<string, unknown> {
  const previousFlow = defaultWeeklyFlowState(args.previousWeeklyState);
  const now = new Date().toISOString();
  const target = args.output.target_dispatcher === "none"
    ? null
    : args.output.target_dispatcher;
  const nextSignals: WeeklyHumanSignals = {
    objective_delta: args.output.human_signal_updates.objective_delta ??
      previousFlow.human_signals.objective_delta,
    felt_state: args.output.human_signal_updates.felt_state ??
      previousFlow.human_signals.felt_state,
  };
  const nextActionStatusCorrections = mergeActionStatusCorrections(
    previousFlow.user_corrected_action_statuses,
    args.output.action_status_updates,
  );
  const nextFlow: WeeklyReviewLocalFlowState = {
    ...previousFlow,
    stage: args.output.state_updates.weekly_stage,
    proposal_status: args.output.handoff_updates.status === "requested" ||
        args.output.handoff_updates.status === "ready" ||
        args.output.handoff_updates.status === "delivered"
      ? "detour_active"
      : previousFlow.proposal_status,
    validation_unlock_status: "locked_until_weekly_complete",
    human_signals: nextSignals,
    felt_progress: args.output.human_signal_updates.felt_progress ??
      previousFlow.felt_progress,
    weekly_gates: mergeWeeklyGates(
      previousFlow.weekly_gates,
      args.output.weekly_gates,
    ),
    detour_candidate: args.output.detour_candidate.kind === "none"
      ? previousFlow.detour_candidate
      : args.output.detour_candidate,
    last_user_signal: args.output.human_signal_updates.user_summary ??
      previousFlow.last_user_signal,
    last_visible_summary: args.output.weekly_intent.summary ||
      previousFlow.last_visible_summary,
    last_handoff_summary: args.handoffSummary,
    child_flow: {
      status: "active",
      flow_id: target,
      reason: args.output.weekly_intent.summary ||
        args.output.handoff_updates.requested_adjustment_summary ||
        "Detour local depuis le weekly.",
      expected_return_focus: "weekly_synthesis_and_closure",
      result_summary: null,
    },
    user_corrected_action_statuses: nextActionStatusCorrections,
    turn_count: previousFlow.turn_count +
      args.output.state_updates.turn_count_increment,
    max_turns: previousFlow.max_turns,
    updated_at: now,
  };
  return {
    ...args.previousWeeklyState,
    status: "open",
    weekly_flow_state: nextFlow,
    updated_at: now,
  };
}

function weekWindowFromState(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const review = isRecord(state.weekly_adaptive_review)
    ? state.weekly_adaptive_review
    : {};
  return {
    start_date: nullableString(
      projection.week_start_date ?? review.week_start_date,
    ),
    end_date: nullableString(projection.week_end_date ?? review.week_end_date),
  };
}

function planContextsFromProjection(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const transformations = Array.isArray(projection.transformations)
    ? projection.transformations
    : [];
  return transformations.slice(0, 6).flatMap((entry: any) => {
    if (!entry || typeof entry !== "object") return [];
    return [{
      transformation_id: nullableString(entry.transformation_id),
      plan_id: nullableString(entry.plan_id),
      plan_title: nullableString(entry.plan_title),
      action_count: Array.isArray(entry.actions) ? entry.actions.length : 0,
    }];
  });
}

function itemSummariesFromProjection(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const flowState = isRecord(state.weekly_flow_state)
    ? state.weekly_flow_state
    : {};
  const corrections = normalizeActionStatusCorrections(
    flowState.user_corrected_action_statuses,
  );
  const transformations = Array.isArray(projection.transformations)
    ? projection.transformations
    : [];
  const baseItems = transformations.flatMap((entry: any) => {
    const actions = Array.isArray(entry?.actions) ? entry.actions : [];
    return actions.slice(0, 8).flatMap((action: any) => {
      if (!action || typeof action !== "object") return [];
      return [{
        plan_id: nullableString(action.plan_id ?? entry?.plan_id),
        plan_title: nullableString(action.plan_title ?? entry?.plan_title),
        plan_item_id: nullableString(action.plan_item_id),
        occurrence_id: nullableString(action.occurrence_id),
        title: nullableString(action.title),
        family: nullableString(action.family),
        status: nullableString(
          action.deviation ?? action.current_week_status ?? action.status,
        ),
        evidence: action.daily_evidence ?? null,
      }];
    });
  }).slice(0, 12);
  if (!corrections.length) return baseItems;
  return baseItems.map((item) => {
    const correction = corrections.find((candidate) => {
      if (
        candidate.occurrence_id &&
        candidate.occurrence_id === nullableString(item.occurrence_id)
      ) return true;
      if (
        candidate.plan_item_id &&
        candidate.plan_item_id === nullableString(item.plan_item_id)
      ) return true;
      if (!candidate.plan_item_id && !candidate.occurrence_id) {
        const title = cleanText(item.title).toLowerCase();
        return Boolean(
          title && title === cleanText(candidate.title).toLowerCase(),
        );
      }
      return false;
    });
    if (!correction) return item;
    return {
      ...item,
      status: correction.corrected_status,
      user_corrected_status: correction.corrected_status,
      user_correction_evidence: correction.user_evidence,
      status_source: "user_weekly_correction",
    };
  });
}

function knownActionGapsFromItems(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return items.filter((item) => {
    const status = cleanText(item.status).toLowerCase();
    return status && status !== "completed" && status !== "done" &&
      status !== "ok";
  }).slice(0, 6);
}

function currentActionFocus(
  detour: WeeklyReviewDetourCandidate,
  items: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  const target = cleanText(detour.target_action_or_plan).toLowerCase();
  if (!target) return null;
  return items.find((item) => {
    const title = cleanText(item.title).toLowerCase();
    const id = cleanText(item.plan_item_id).toLowerCase();
    return title && target.includes(title) || id && target.includes(id);
  }) ?? {
    label: detour.target_action_or_plan,
    source: "detour_candidate",
  };
}

function nextRequiredWeeklyStep(
  flow: WeeklyReviewLocalFlowState,
): WeeklyReviewVisibleTaskKind | null {
  const gates = flow.weekly_gates;
  if (
    flow.child_flow.status === "completed" &&
    (flow.child_flow.result_details as any)?.return_acknowledged !== true &&
    gates.synthesis_status !== "complete"
  ) {
    return "return_from_child_flow";
  }
  if (gates.week_experience_status === "missing") return "ask_week_experience";
  if (
    gates.action_review_status === "missing" ||
    gates.action_review_status === "needs_deeper"
  ) {
    return "review_action_gaps";
  }
  if (
    gates.action_review_status === "captured" && flow.stage === "action_blocker"
  ) {
    return "explore_action_blocker";
  }
  if (
    gates.global_progress_status === "missing" ||
    gates.felt_progress_status === "missing"
  ) {
    return "ask_global_progress_feeling";
  }
  if (
    gates.global_progress_status === "needs_deeper" ||
    gates.felt_progress_status === "needs_deeper"
  ) {
    return "deepen_global_progress";
  }
  if (
    flow.detour_candidate.kind !== "none" &&
    flow.detour_candidate.readiness !== "user_confirmed"
  ) {
    return flow.detour_candidate.kind === "attack_card" ||
        flow.detour_candidate.kind === "defense_card"
      ? "qualify_attack_or_defense_fit"
      : "qualify_solution_fit";
  }
  if (gates.synthesis_status !== "complete") return "weekly_synthesis";
  if (gates.closure_status !== "complete") return "weekly_closure";
  return null;
}

function weeklyActiveActionCandidates(
  state: Record<string, unknown>,
): ActiveActionCandidateForDirectEffects[] {
  return itemSummariesFromProjection(state).flatMap((item: any) => {
    const planItemId = nullableString(item.plan_item_id);
    const title = nullableString(item.title);
    if (!planItemId || !title) return [];
    return [{
      plan_item_id: planItemId,
      title,
      status: nullableString(item.status) ?? "active",
      plan_id: nullableString(item.plan_id),
      tracking_type: "weekly_review",
      dimension: nullableString(item.family),
      aliases: [],
      occurrence_id: nullableString(item.occurrence_id),
    }];
  });
}

function humanStrategyLabel(value: unknown): string | null {
  const text = cleanText(value);
  switch (text) {
    case "bridge_week":
      return "semaine plus legere";
    case "repeat_week":
      return "reprendre la meme semaine";
    case "advance":
      return "continuer a avancer";
    case "level_review":
      return "revoir le niveau";
    default:
      return text || null;
  }
}

function buildWeeklyConversationContext(args: {
  weeklyState: Record<string, unknown>;
  output: WeeklyReviewLocalDispatcherOutput;
  reducedState: Record<string, unknown> | null;
  handoffSummary: string | null;
  visibleTask: WeeklyReviewVisibleTaskKind;
}): WeeklyReviewConversationContext {
  const sourceState = args.reducedState ?? args.weeklyState;
  const flow = defaultWeeklyFlowState(sourceState);
  const review = isRecord(sourceState.weekly_adaptive_review)
    ? sourceState.weekly_adaptive_review
    : {};
  const strategy = isRecord(review.week_strategy) ? review.week_strategy : {};
  const evidence = isRecord(review.evidence) ? review.evidence : {};
  const handoffScope = args.output.handoff_updates.scope;
  const itemSummaries = itemSummariesFromProjection(sourceState);
  const actionGaps = knownActionGapsFromItems(itemSummaries);
  const detour = args.output.detour_candidate.kind === "none"
    ? flow.detour_candidate
    : args.output.detour_candidate;
  const childRevisionSummary = nullableString(
    (flow.child_flow.result_details as any)?.revision_summary,
  );
  const gates = mergeWeeklyGates(flow.weekly_gates, args.output.weekly_gates);
  const actionReviewComplete = gates.action_review_status === "complete";
  const nextFlowForStep: WeeklyReviewLocalFlowState = {
    ...flow,
    weekly_gates: gates,
    detour_candidate: detour,
  };
  const missing: string[] = [];
  if (args.output.visible_task.kind === "clarify_human_signal") {
    missing.push("signal_humain_weekly");
  }
  if (gates.week_experience_status === "missing") {
    missing.push("experience_de_la_semaine");
  }
  if (
    gates.action_review_status === "missing" ||
    gates.action_review_status === "needs_deeper"
  ) {
    missing.push("verification_actions_gaps");
  }
  if (gates.global_progress_status === "missing") {
    missing.push("avancee_objectif_global");
  }
  if (gates.felt_progress_status === "missing") {
    missing.push("ressenti_avancee_objectif_global");
  }
  if (handoffScope.needs_scope_clarification) {
    missing.push("scope_plan_ou_action");
  }
  if (args.output.forgotten_progress.status === "needs_target") {
    missing.push("progression_oubliee_cible");
  }
  return {
    state_summary: args.output.weekly_intent.summary ||
      flow.last_visible_summary ||
      "Point weekly actif.",
    user_words: stringArray(
      (args.output.note_information as any)?.user_words,
      4,
    ),
    week_window: weekWindowFromState(sourceState),
    field_or_stage: args.visibleTask,
    known_values: {
      human_signals: flow.human_signals,
      felt_progress: flow.felt_progress,
      weekly_gates: gates,
      action_review_complete: actionReviewComplete,
      action_review_before_global_progress_required:
        gates.action_review_status !== "complete",
      partial_statuses_must_remain_partial: true,
      detour_candidate: detour,
      next_required_weekly_step: nextRequiredWeeklyStep(nextFlowForStep),
      validation_unlock_status: flow.validation_unlock_status,
      proposal_status: flow.proposal_status,
      child_flow: flow.child_flow,
      child_flow_result_details: flow.child_flow.result_details ?? null,
      user_corrected_action_statuses: flow.user_corrected_action_statuses,
      dominant_blocker_confirmation:
        args.output.human_signal_updates.dominant_blocker_confirmation,
    },
    missing_or_weak_values: missing,
    weekly_strategy: {
      strategy_label_human: humanStrategyLabel(strategy.decision),
      reason_human: nullableString(strategy.reason),
      confidence: args.output.confidence,
    },
    plan_contexts: planContextsFromProjection(sourceState),
    item_summaries: itemSummaries,
    handoff_data: {
      summary: args.handoffSummary,
      platform_destination: args.output.handoff_updates.platform_destination,
      scope: args.output.handoff_updates.scope,
      requested_adjustment_summary:
        args.output.handoff_updates.requested_adjustment_summary,
      revision_summary: args.output.handoff_updates.revision_summary ??
        childRevisionSummary,
    },
    forgotten_progress: {
      ...args.output.forgotten_progress,
      no_plan_adjustment: true,
    },
    inline_result: {},
    weekly_gates: gates,
    detour_candidate: detour,
    current_action_focus: currentActionFocus(detour, itemSummaries),
    known_action_gaps: actionGaps,
    global_objective_signal: {
      objective_delta: flow.human_signals.objective_delta,
      status: gates.global_progress_status,
    },
    felt_progress_signal: {
      felt_progress: flow.felt_progress,
      felt_state: flow.human_signals.felt_state,
      status: gates.felt_progress_status,
    },
    child_flow_return_summary: flow.child_flow.result_summary,
    next_required_weekly_step: nextRequiredWeeklyStep(nextFlowForStep),
    tone_constraints: [
      "compact",
      "one_question_max_when_asking",
      "human_language",
      "prefer_gender_neutral_wording_when_not_certain",
      "do_not_use_gendered_adjectives_unless_conversation_context_confirms_gender",
    ],
    do_not_say: [
      "bridge_week",
      "carry_over",
      "repeat_week",
      "level_review",
      "item_decision",
      "dominant_blocker",
      "applique",
      "modifie le plan",
      "valide le plan",
      "enregistre le plan",
      "j'ai une carte",
      "carte disponible",
      "carte prete",
      "nouvel outil",
      "j'ai modifie le plan",
      "j'ai cree un rappel",
      "j'ai cree une potion",
      "tu as ete rigoureux",
      "tu as ete rigoureuse",
      "reussite pleine pour une action partielle",
    ],
    context_summary: nullableString(evidence.reason) ??
      nullableString(flow.last_visible_summary),
    evidence_used: [
      ...args.output.evidence,
      ...stringArray((evidence as any).dominant_blockers, 4),
    ].slice(0, 10),
  };
}

function dispatcherChangeRequiresNote(action: WeeklyReviewLocalFlowAction) {
  return action === "exit_to_global_dispatcher" ||
    action === "safety_preempt" ||
    action === "handoff_to_local_flow" ||
    action === "inline_tool_roundtrip";
}

function detourKindForTarget(
  target: NoteInformationTargetDispatcher | "none",
): WeeklyReviewDetourKind {
  switch (target) {
    case "prepare_attack_card":
      return "attack_card";
    case "prepare_defense_card":
      return "defense_card";
    case "adjust_plan_item":
      return "adjust_plan_item";
    case "select_state_potion":
      return "select_state_potion";
    case "create_one_shot_reminder":
      return "create_one_shot_reminder";
    case "create_recurring_reminder":
      return "create_recurring_reminder";
    case "product_help":
      return "product_help";
    case "status_recap":
      return "status_recap";
    default:
      return "none";
  }
}

function childHandoffGuard(output: WeeklyReviewLocalDispatcherOutput): {
  reason_code: string;
  visible_task: WeeklyReviewVisibleTaskKind;
  stage: WeeklyReviewLocalFlowState["stage"];
} | null {
  if (output.flow_action !== "handoff_to_local_flow") return null;
  const targetKind = detourKindForTarget(output.target_dispatcher);
  const detour = output.detour_candidate.kind === "none"
    ? { ...output.detour_candidate, kind: targetKind }
    : output.detour_candidate;
  if (targetKind === "none") {
    return {
      reason_code: "weekly_review_child_handoff_unknown_target",
      visible_task: "qualify_solution_fit",
      stage: "solution_fit",
    };
  }
  if (
    detour.readiness !== "user_confirmed" ||
    detour.user_consent !== true
  ) {
    return {
      reason_code: "weekly_review_child_handoff_requires_user_confirmed_fit",
      visible_task: detour.kind === "attack_card" ||
          detour.kind === "defense_card"
        ? "qualify_attack_or_defense_fit"
        : "offer_child_detour",
      stage: detour.kind === "attack_card" || detour.kind === "defense_card"
        ? "action_blocker"
        : "solution_fit",
    };
  }
  if (
    (detour.kind === "attack_card" || detour.kind === "defense_card") &&
    !detour.target_action_or_plan
  ) {
    return {
      reason_code: "weekly_review_card_handoff_requires_action_focus",
      visible_task: "explore_action_blocker",
      stage: "action_blocker",
    };
  }
  if (
    detour.kind === "adjust_plan_item" &&
    (output.handoff_updates.scope.kind === "none" ||
      output.handoff_updates.scope.kind === "ambiguous" ||
      output.handoff_updates.scope.needs_scope_clarification)
  ) {
    return {
      reason_code: "weekly_review_adjust_plan_detour_requires_clear_scope",
      visible_task: "qualify_solution_fit",
      stage: "solution_fit",
    };
  }
  return null;
}

function completionGuard(output: WeeklyReviewLocalDispatcherOutput): {
  reason_code: string;
  visible_task: WeeklyReviewVisibleTaskKind;
  stage: WeeklyReviewLocalFlowState["stage"];
} | null {
  if (
    output.flow_action !== "complete_flow" &&
    output.flow_action !== "complete_weekly_no_change"
  ) return null;
  if (output.weekly_gates.synthesis_status !== "complete") {
    return {
      reason_code: "weekly_review_completion_requires_synthesis",
      visible_task: "weekly_synthesis",
      stage: "synthesis",
    };
  }
  if (
    output.weekly_gates.closure_status !== "complete" ||
    output.visible_task.kind !== "weekly_closure"
  ) {
    return {
      reason_code: "weekly_review_completion_requires_closure",
      visible_task: "weekly_closure",
      stage: "closure",
    };
  }
  return null;
}

function weeklyStageForVisibleTask(
  task: WeeklyReviewVisibleTaskKind,
): WeeklyReviewLocalFlowState["stage"] {
  switch (task) {
    case "ask_week_experience":
      return "week_experience";
    case "review_action_gaps":
      return "action_review";
    case "explore_action_blocker":
    case "qualify_attack_or_defense_fit":
      return "action_blocker";
    case "ask_global_progress_feeling":
    case "deepen_global_progress":
      return "global_progress";
    case "qualify_solution_fit":
    case "offer_child_detour":
      return "solution_fit";
    case "return_from_child_flow":
    case "weekly_synthesis":
      return "synthesis";
    case "weekly_closure":
      return "closure";
    default:
      return "strategy_ready";
  }
}

function weeklyGateOrderGuard(args: {
  previousFlow: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
  nextGates: WeeklyReviewGates;
  nextDetour: WeeklyReviewDetourCandidate;
}): {
  reason_code: string;
  visible_task: WeeklyReviewVisibleTaskKind;
  stage: WeeklyReviewLocalFlowState["stage"];
} | null {
  const action = args.output.flow_action;
  if (
    action === "defer_flow" ||
    action === "exit_to_global_dispatcher" ||
    action === "safety_preempt" ||
    action === "handoff_to_local_flow" ||
    action === "inline_tool_roundtrip"
  ) return null;
  const task = args.output.visible_task.kind;
  const guardedTasks = new Set<WeeklyReviewVisibleTaskKind>([
    "qualify_solution_fit",
    "offer_child_detour",
    "weekly_synthesis",
    "weekly_closure",
  ]);
  if (!guardedTasks.has(task)) return null;
  const flowForStep: WeeklyReviewLocalFlowState = {
    ...args.previousFlow,
    weekly_gates: args.nextGates,
    detour_candidate: args.nextDetour,
  };
  const required = nextRequiredWeeklyStep(flowForStep);
  if (
    required === "ask_week_experience" ||
    required === "review_action_gaps" ||
    required === "explore_action_blocker" ||
    required === "ask_global_progress_feeling" ||
    required === "deepen_global_progress" ||
    required === "return_from_child_flow"
  ) {
    return {
      reason_code: `weekly_review_gate_order_requires_${required}`,
      visible_task: required,
      stage: weeklyStageForVisibleTask(required),
    };
  }
  return null;
}

export function reduceWeeklyReviewLocalDispatcherOutput(args: {
  previousWeeklyState: Record<string, unknown>;
  output: WeeklyReviewLocalDispatcherOutput;
}): WeeklyReviewReducerResult {
  const previousFlow = defaultWeeklyFlowState(args.previousWeeklyState);
  const output = args.output;
  const summary = summarizeOutput(output);
  const now = new Date().toISOString();
  const nextSignals: WeeklyHumanSignals = {
    objective_delta: output.human_signal_updates.objective_delta ??
      previousFlow.human_signals.objective_delta,
    felt_state: output.human_signal_updates.felt_state ??
      previousFlow.human_signals.felt_state,
  };
  const nextFeltProgress = output.human_signal_updates.felt_progress ??
    previousFlow.felt_progress;
  const nextGatesBase = mergeWeeklyGates(
    previousFlow.weekly_gates,
    output.weekly_gates,
  );
  const visibleClosureShouldComplete =
    output.visible_task.kind === "weekly_closure" &&
    nextGatesBase.synthesis_status === "complete" &&
    output.weekly_intent.kind === "weekly_confirmation" &&
    (
      output.flow_action === "confirm_weekly_diagnostic" ||
      output.flow_action === "answer_weekly_question" ||
      output.flow_action === "recap_weekly"
    );
  const nextGates: WeeklyReviewGates = visibleClosureShouldComplete
    ? { ...nextGatesBase, closure_status: "complete" }
    : nextGatesBase;
  const nextActionStatusCorrections = mergeActionStatusCorrections(
    previousFlow.user_corrected_action_statuses,
    output.action_status_updates,
  );
  const nextDetour = output.detour_candidate.kind === "none"
    ? previousFlow.detour_candidate
    : output.detour_candidate;
  const handoffSummary = buildHandoffSummary(output, previousFlow);
  const childFlowForTurn = childFlowWithRevision(
    previousFlow.child_flow,
    output.handoff_updates.revision_summary,
  );
  const turnCount = previousFlow.turn_count +
    output.state_updates.turn_count_increment;
  const maxTurns = previousFlow.max_turns || 6;
  const turnLimitReached = turnCount >= maxTurns &&
    output.flow_action !== "exit_to_global_dispatcher" &&
    output.flow_action !== "safety_preempt" &&
    output.flow_action !== "handoff_to_local_flow" &&
    output.flow_action !== "inline_tool_roundtrip";
  const turnLimitCloseAllowed = turnLimitReached &&
    nextGates.synthesis_status === "complete" &&
    nextGates.closure_status === "complete" &&
    output.visible_task.kind === "weekly_closure";

  if (dispatcherChangeRequiresNote(output.flow_action)) {
    if (!output.note_information) {
      const blockedFlow = {
        ...previousFlow,
        turn_count: turnCount,
        updated_at: now,
      };
      return {
        status: "blocked",
        reason_code: "weekly_review_note_information_required",
        weekly_state: {
          ...args.previousWeeklyState,
          status: "open",
          weekly_flow_state: blockedFlow,
          updated_at: now,
        },
        visible_task: "exit_or_cancel",
        exit_to_global_dispatcher: false,
        tool_execution: "blocked",
        handoff_summary: handoffSummary,
        answer_summary: null,
        target_dispatcher: output.target_dispatcher,
        note_information: null,
        conversation_context: buildWeeklyConversationContext({
          weeklyState: args.previousWeeklyState,
          output,
          reducedState: args.previousWeeklyState,
          handoffSummary,
          visibleTask: "exit_or_cancel",
        }),
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: "note_information_required",
        }],
        evidence: output.evidence,
      };
    }
  }

  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "weekly_review_local_exit_to_global_dispatcher",
      weekly_state: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: "global",
      note_information: output.note_information,
      conversation_context: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "safety_preempt" || output.risk_score >= 7) {
    return {
      status: "safety",
      reason_code: "weekly_review_safety_preempt",
      weekly_state: null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: "safety_crisis",
      note_information: output.note_information,
      conversation_context: null,
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }

  const childGuard = childHandoffGuard(output);
  if (childGuard) {
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: childGuard.stage,
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: nextGates,
      detour_candidate: nextDetour,
      user_corrected_action_statuses: nextActionStatusCorrections,
      child_flow: childFlowForTurn,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedFlow,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: childGuard.reason_code,
      weekly_state: guardedState,
      visible_task: childGuard.visible_task,
      exit_to_global_dispatcher: false,
      tool_execution: "blocked",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: childGuard.visible_task,
      }),
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: childGuard.reason_code,
      }],
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "handoff_to_local_flow") {
    return {
      status: "handoff_to_local_flow",
      reason_code: "weekly_review_local_handoff_to_local_flow",
      weekly_state: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: output.target_dispatcher,
      note_information: output.note_information,
      conversation_context: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "inline_tool_roundtrip") {
    return {
      status: "inline_tool_roundtrip",
      reason_code: "weekly_review_local_inline_tool_roundtrip",
      weekly_state: args.previousWeeklyState,
      visible_task: "inline_tool_return",
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: output.target_dispatcher,
      note_information: output.note_information,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: args.previousWeeklyState,
        handoffSummary,
        visibleTask: "inline_tool_return",
      }),
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  const gateOrderGuard = weeklyGateOrderGuard({
    previousFlow: {
      ...previousFlow,
      child_flow: childFlowForTurn,
    },
    output,
    nextGates,
    nextDetour,
  });
  if (gateOrderGuard) {
    const guardedChildFlow = gateOrderGuard.visible_task ===
        "return_from_child_flow"
      ? childFlowWithReturnAcknowledged(childFlowForTurn)
      : childFlowForTurn;
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: gateOrderGuard.stage,
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: nextGates,
      detour_candidate: nextDetour,
      child_flow: guardedChildFlow,
      user_corrected_action_statuses: nextActionStatusCorrections,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedFlow,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: gateOrderGuard.reason_code,
      weekly_state: guardedState,
      visible_task: gateOrderGuard.visible_task,
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: gateOrderGuard.visible_task,
      }),
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: gateOrderGuard.reason_code,
      }],
      evidence: output.evidence,
    };
  }

  const finishGuard = completionGuard(output);
  const continuationGuard = finishGuard;
  if (continuationGuard) {
    const guardedGates = finishGuard?.visible_task === "weekly_synthesis"
      ? {
        ...nextGates,
        synthesis_status: nextGates.synthesis_status === "complete"
          ? "complete"
          : "captured" as WeeklyReviewGateStatus,
      }
      : nextGates;
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: continuationGuard.stage,
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: guardedGates,
      detour_candidate: nextDetour,
      child_flow: childFlowForTurn,
      user_corrected_action_statuses: nextActionStatusCorrections,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedFlow,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: continuationGuard.reason_code,
      weekly_state: guardedState,
      visible_task: continuationGuard.visible_task,
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: continuationGuard.visible_task,
      }),
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  const closeAfterVisible = output.state_updates.close_after_visible ||
    visibleClosureShouldComplete ||
    turnLimitCloseAllowed ||
    output.flow_action === "complete_weekly_no_change" ||
    output.flow_action === "complete_flow" ||
    output.flow_action === "defer_flow";
  const nextStatus = output.flow_action === "defer_flow"
    ? "stopped"
    : closeAfterVisible
    ? "completed"
    : output.state_updates.status;
  const validationUnlockStatus = nextStatus === "completed"
    ? "available"
    : output.state_updates.validation_unlock_status;
  const nextFlow: WeeklyReviewLocalFlowState = {
    ...previousFlow,
    stage: closeAfterVisible ? "closing" : output.state_updates.weekly_stage,
    proposal_status: output.handoff_updates.status === "requested" ||
        output.handoff_updates.status === "ready" ||
        output.handoff_updates.status === "delivered"
      ? "detour_discussed"
      : output.flow_action === "defer_flow"
      ? "cancelled"
      : previousFlow.proposal_status,
    validation_unlock_status: validationUnlockStatus,
    human_signals: nextSignals,
    felt_progress: nextFeltProgress,
    weekly_gates: nextGates,
    detour_candidate: nextDetour,
    child_flow: output.visible_task.kind === "return_from_child_flow"
      ? childFlowWithReturnAcknowledged(childFlowForTurn)
      : childFlowForTurn,
    user_corrected_action_statuses: nextActionStatusCorrections,
    last_user_signal: output.human_signal_updates.user_summary ??
      previousFlow.last_user_signal,
    last_visible_summary: summary || previousFlow.last_visible_summary,
    last_handoff_summary: handoffSummary,
    turn_count: turnCount,
    max_turns: maxTurns,
    updated_at: now,
  };
  const nextAdaptiveReview = maybeRecomputeWeeklyReview({
    previousReview: args.previousWeeklyState.weekly_adaptive_review,
    projection: args.previousWeeklyState.weekly_progress_review,
    humanSignals: nextSignals,
    actionStatusCorrections: nextActionStatusCorrections,
    action: output.flow_action,
  });
  const nextWeeklyState: Record<string, unknown> = {
    ...args.previousWeeklyState,
    status: nextStatus === "completed" || nextStatus === "stopped"
      ? nextStatus
      : "open",
    weekly_adaptive_review: nextAdaptiveReview,
    weekly_flow_state: nextFlow,
    validation_unlock: validationUnlockStatus === "available"
      ? {
        status: "available",
        meaning:
          "La validation de la semaine suivante est disponible apres conclusion du point weekly.",
      }
      : args.previousWeeklyState.validation_unlock,
    updated_at: now,
  };
  const visibleTask = output.flow_action === "defer_flow"
    ? "stop_or_cancel"
    : (output.flow_action === "complete_flow" ||
        output.flow_action === "complete_weekly_no_change") &&
        output.visible_task.kind === "weekly_closure"
    ? "weekly_closure"
    : output.visible_task.kind;
  const conversationContext = buildWeeklyConversationContext({
    weeklyState: args.previousWeeklyState,
    output,
    reducedState: nextWeeklyState,
    handoffSummary,
    visibleTask,
  });
  return {
    status: closeAfterVisible ? "closed" : "answered",
    reason_code: `weekly_review_local_${output.flow_action}`,
    weekly_state: nextWeeklyState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    tool_execution: "none",
    handoff_summary: handoffSummary,
    answer_summary: summary,
    target_dispatcher: "none",
    note_information: null,
    conversation_context: conversationContext,
    blocked_effects: [],
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow weekly_adaptive_review_v1.",
    "Contexte: Sophia a envoye un point weekly de fin de semaine. Le weekly lit les preuves daily/dashboard, mene un bilan coaching, qualifie les detours utiles, revient au weekly apres tout detour, puis produit une synthese et une cloture.",
    "Le weekly ne modifie jamais le plan depuis le chat.",
    "Frontiere chat/outils: Sophia n'a jamais deja une carte, une potion, un rappel ou un ajustement Plan disponible depuis le chat; elle peut seulement proposer ou lancer un detour local qui prepare un handoff plateforme ou un flow dedie.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "",
    "Actions possibles: answer_weekly_question, confirm_weekly_diagnostic, reject_weekly_diagnostic, clarify_human_signal, recap_weekly, explain_weekly_reasoning, forgotten_progress_correction, clarify_forgotten_progress, complete_weekly_no_change, complete_flow, exit_to_global_dispatcher, defer_flow, inline_tool_roundtrip, handoff_to_local_flow, safety_preempt.",
    "",
    "Regles:",
    ...directEffectLocalDispatcherPromptLines(),
    "- Ne fais aucune regex metier.",
    "- Ne decide pas par mot-cle isole.",
    "- Interprete le message par rapport au weekly actif.",
    "- Ne recalcule pas la projection factuelle.",
    "- Ne dis jamais qu'un changement de plan est applique.",
    "- Ordre sain obligatoire: ask_week_experience -> review_action_gaps -> explore_action_blocker si necessaire -> ask_global_progress_feeling/deepen_global_progress -> qualify_solution_fit -> offer_child_detour/handoff_to_local_flow si confirme -> return_from_child_flow si detour -> weekly_synthesis -> weekly_closure.",
    "- Sophia mene le weekly: ne laisse pas le user conduire directement vers un outil si les gates obligatoires sont manquants.",
    "- Tant que global_progress_status ou felt_progress_status est missing, ne choisis pas qualify_solution_fit, offer_child_detour, weekly_synthesis ou weekly_closure. Utilise ask_global_progress_feeling ou deepen_global_progress, sauf si le message courant donne deja clairement le ressenti d'avancee vers l'objectif global.",
    "- Le weekly est un flow parent de bilan strategique: il comprend l'objectif global, l'avancee ressentie, l'energie, les actions et les blocages avant de conclure.",
    "- Fais de la resistance: une mention de carte, potion, rappel ou Plan est d'abord une hypothese de solution dans le weekly; ne lance un child flow que si le fit est qualifie et que le user consent explicitement.",
    "- Si un child flow est lance, il est un detour au service du weekly: il doit revenir au weekly ensuite pour synthese et cloture.",
    "- Si le user demande un ajustement Plan, traite adjust_plan_item comme un child flow/detour avec scope clair, pas comme une fin du weekly ni une execution directe.",
    "- Fatigue ou frustration ne suffit jamais a ajuster le Plan. Il faut demande explicite et perimetre clair.",
    "- Carte d'attaque/defense: action precise obligatoire. Attaque = aider a demarrer, franchir une friction d'execution ou produire l'action choisie. Defense = proteger un moment critique, une pulsion, un derapage probable, un contexte a risque, une fatigue qui fait relacher, ou une fenetre a proteger. En cas de fatigue/soir/risque de relache, penche defense ou clarifie; ne choisis pas attack_card par facilite.",
    "- Potion: seulement si l'etat emotionnel/energie est le sujet principal. Rappel: seulement si le probleme est rythme, relance ou cadre externe.",
    "- Si plusieurs plans/actions sont dans le weekly, preserve toujours le contexte plan/action.",
    "- Si le scope plan/action est ambigu, clarifie au lieu de melanger les plans.",
    "- Si le user corrige une progression oubliee, ne l'assimile pas a un ajustement Plan.",
    "- Si le user mentionne une progression passee, par exemple une action faite jeudi, stocke-la comme correction weekly a clarifier/valider; ne dis pas que c'est corrige sans commit dedie.",
    "- Si le user revise une formulation ou un champ apres un child flow livre, reste dans le weekly, mets handoff_updates.status=delivered ou revised, remplis handoff_updates.revision_summary, puis utilise return_from_child_flow avant une synthese finale.",
    "- Child flows autorises seulement comme detours: adjust_plan_item, prepare_attack_card, prepare_defense_card, select_state_potion, create_one_shot_reminder, create_recurring_reminder.",
    "- Si le user pose une question produit temporaire pendant le weekly, retourne inline_tool_roundtrip target_dispatcher=product_help.",
    "- Si le user pose une question DB/status temporaire pendant le weekly, retourne inline_tool_roundtrip target_dispatcher=status_recap.",
    "- Si le user change de sujet sans dispatcher local cible clair, retourne exit_to_global_dispatcher target_dispatcher=global.",
    "- Si le user veut arreter le weekly, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global. Le message est ensuite réanalysé par le dispatcher global.",
    "- Si le user veut seulement reporter le weekly sans changer de dispatcher, retourne defer_flow.",
    "- Pour handoff_to_local_flow, inline_tool_roundtrip, safety_preempt ou exit_to_global_dispatcher, fournis note_information canonique.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Choisis une action de continuation weekly si le user repond au bilan, parle de son objectif global, de son ressenti d'avancee, d'une action, d'un blocage, d'une hypothese de solution, demande un recap ou corrige une progression. Choisis exit_to_global_dispatcher si le user arrete le weekly, quitte vraiment le weekly ou demande un sujet hors bilan. Choisis defer_flow seulement pour reporter localement. Choisis safety_preempt pour safety reelle. Choisis handoff_to_local_flow seulement pour lancer un child flow utile et suffisamment clair, avec retour weekly attendu. Choisis inline_tool_roundtrip seulement pour une question produit/status temporaire pendant le weekly. Ne base jamais l'action sur l'etat precedent seul.",
    "- confidence: high si l'intention du message courant est claire et compatible avec le weekly; medium si probable mais incomplete; low si clarification ou prudence necessaire. N'utilise pas high pour masquer un scope Plan ambigu.",
    "- risk_score: score local 0-10. Reste bas pour fatigue, hesitation ou frustration ordinaire. N'invente pas de safety. Si le message contient un vrai risque safety, augmente le score et choisis safety_preempt avec note_information target_dispatcher=safety_crisis.",
    "- target_dispatcher: none pour toute continuation weekly, defer_flow ou completion. global uniquement avec exit_to_global_dispatcher. safety_crisis uniquement avec safety_preempt. product_help/status_recap uniquement avec inline_tool_roundtrip. adjust_plan_item, prepare_attack_card, prepare_defense_card, select_state_potion, create_one_shot_reminder ou create_recurring_reminder uniquement avec handoff_to_local_flow comme child flow avec retour weekly. N'utilise pas track_progress_plan_item pour une correction retrospective datee sans contrat de date explicite.",
    "- weekly_intent: resume l'intention weekly du message courant. kind doit suivre flow_action: weekly_answer pour reponse au bilan, weekly_confirmation/rejection pour validation ou rejet, detour_request/detour_revision pour piste outil, forgotten_progress pour correction retrospective, stop/off_topic/explicit_tool_request/safety/unclear selon le cas. summary doit rester court et ne pas inventer de fait.",
    "- human_signal_updates: remplis seulement les signaux humains explicitement fournis ou fortement confirmes dans ce tour. objective_delta = avancee par rapport a l'objectif global. felt_progress = ressenti subjectif sur cette avancee (aligned, encouraged, neutral, frustrated, disconnected, worried, unclear, unknown). felt_state = energie/charge. Mets null quand le message ne parle pas de progression, energie, blocage ou ressenti weekly. Ne transforme pas une hypothese du bilan en fait confirme.",
    "- handoff_updates: utilise status none si aucun detour Plan n'est en jeu. requested/ready pour preparer le contexte a donner a adjust_plan_item, revised pour modifier la proposition, delivered seulement si le child flow cible indique un retour livre, cancelled si le user refuse ce detour. platform_destination vaut Plan seulement pour adjust_plan_item. scope doit rester none ou ambiguous si le plan/action cible n'est pas clair; ne fabrique pas d'id.",
    "- forgotten_progress: none par defaut. candidate si le user mentionne une progression oubliee sans cible suffisante. needs_target si la cible manque. ready_for_progress_tool seulement si la cible et l'issue sont assez claires pour le reducer. blocked si la correction est contradictoire ou impossible. Ne confonds pas correction retrospective et ajustement de plan futur.",
    "- action_status_updates: liste les corrections utilisateur action par action quand le user contredit ou precise la projection DB. Utilise plan_item_id/occurrence_id depuis le contexte si disponible, sinon title exact; corrected_status completed/partial/missed/unknown; user_evidence reprend les mots du user. Laisse [] si aucune correction. Ces corrections battent la projection dans item_summaries et la synthese visible. N'en fais pas un ajustement Plan.",
    "- weekly_gates: etat de progression du weekly. week_experience_status capture comment la semaine a ete vecue. action_review_status capture la verification actions/gaps. global_progress_status capture le lien a l'objectif global. felt_progress_status capture le ressenti sur cette avancee. solution_fit_status capture la qualification d'une solution. synthesis_status et closure_status doivent etre complete avant completion. Utilise missing si absent, captured si compris, needs_deeper si une precision coaching est necessaire, complete si le gate est suffisamment stable.",
    "- detour_candidate: hypothese d'outil au service du weekly. kind none par defaut; attack_card/defense_card seulement avec action cible; adjust_plan_item seulement avec demande explicite et scope; select_state_potion pour etat emotionnel/energie; create_one_shot_reminder/create_recurring_reminder pour rappel/cadre. readiness none/explore_fit/offer/user_confirmed. user_consent true seulement si le user accepte clairement de lancer le detour. return_focus doit rappeler que le weekly reprend apres.",
    "- state_updates: patch d'etat weekly, pas profil global. weekly_stage suit la suite logique du flow: opening, week_experience, action_review, action_blocker, global_progress, solution_fit, child_detour, synthesis, closure, ou anciennes valeurs de compatibilite. status open/completed/stopped/deferred/handoff_to_local_flow/exit_to_global/safety doit correspondre a flow_action. validation_unlock_status devient available seulement apres weekly_closure. close_after_visible true seulement pour stop/defer ou completion apres synthesis+closure.",
    "- visible_task.kind: stage visible exact pour le prochain prompt local. Priorise ask_week_experience, review_action_gaps, explore_action_blocker, qualify_attack_or_defense_fit, ask_global_progress_feeling, deepen_global_progress, qualify_solution_fit, offer_child_detour, return_from_child_flow, weekly_synthesis, weekly_closure. En defer, utilise stop_or_cancel. En safety, utilise safety_transition ou safety. En transition dispatcher, le message visible source est normalement vide ou exit_or_cancel selon reducer. Si le user confirme la cloture apres une synthese complete, utilise weekly_closure avec weekly_intent.kind=weekly_confirmation.",
    "- visible_task.instruction: instruction courte au prompt visible, sans texte final utilisateur. Ne construis jamais la reponse visible ici.",
    "- visible_task.conversation_context: ce champ existe dans le contrat mais le reducer weekly reconstruit la version finale visible-agent-safe. Si tu le fournis, garde-le compact et filtre: contraintes, valeurs connues, incertitudes, ton, limites. Pas de DB brute, memoire brute, note_information brute, ids inventes, ni decision a refaire par l'agent visible.",
    "- note_information: obligatoire pour exit_to_global_dispatcher, safety_preempt, handoff_to_local_flow et inline_tool_roundtrip. Elle est consommee par le dispatcher cible, jamais transmise brute au prompt visible. Garde strictement la structure source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. structured_context doit etre succinct et non vide avec etat weekly utile, acquis, contraintes, incertitudes et recommended_next_focus. Ne mets pas source_flow_state_summary, target_local_dispatcher_hint, risk_score ou committed_effects dans la note.",
    "- exit_memo: champ secondaire de compatibilite runtime. Ne l'utilise jamais a la place de note_information. needed false et reason none pour continuation/defer/completion. Si transition, garde-le coherent avec note_information mais ne mets pas de decision visible dedans.",
    "- evidence: indices semantiques vraiment utilises depuis le message courant ou le contexte weekly. Pas de pseudo-preuves, pas de mots-cles isoles sans interpretation.",
    "",
    "Transition Rules:",
    "- defer_flow: le user reporte le weekly sans changement de dispatcher; target_dispatcher none; visible_task.kind stop_or_cancel.",
    "- exit_to_global_dispatcher: le user arrete le weekly, apporte un nouveau sujet hors weekly ou quitte le flow; target_dispatcher global; note_information obligatoire.",
    "- safety_preempt: safety prioritaire; target_dispatcher safety_crisis; note_information obligatoire; le global normal ne reprend pas.",
    "- handoff_to_local_flow: seulement si le contrat cible est autorise par target_dispatcher, detour_candidate.readiness=user_confirmed, user_consent=true, et les preconditions de scope/action sont satisfaites; note_information obligatoire; explique dans structured_context ce qui est acquis, pourquoi le detour aide le weekly, et quel resume doit revenir au weekly pour conclure.",
    "- inline_tool_roundtrip: seulement product_help ou status_recap temporaire; note_information obligatoire; conserve l'etat weekly parent.",
    "- complete_flow ou complete_weekly_no_change: seulement apres weekly_synthesis puis weekly_closure. Le reducer bloque toute completion prematuree.",
    "",
    "Exemple JSON 1 - continuation normale non visible:",
    '{"flow_action":"confirm_weekly_diagnostic","confidence":"high","risk_score":0,"target_dispatcher":"none","weekly_intent":{"kind":"weekly_confirmation","summary":"Le user confirme le diagnostic et se sent fatigue mais d accord."},"human_signal_updates":{"objective_delta":"slight_progress","felt_progress":"encouraged","felt_state":"tired_but_ok","dominant_blocker_confirmation":"confirmed","user_summary":"fatigue mais progression legere"},"handoff_updates":{"status":"none","requested_adjustment_summary":null,"revision_summary":null,"platform_destination":null,"scope":{"kind":"none","plan_id":null,"plan_title":null,"plan_item_ids":[],"scope_summary":null,"needs_scope_clarification":false}},"forgotten_progress":{"status":"none","target_hint":null,"outcome_hint":null,"evidence":null},"action_status_updates":[{"plan_item_id":"item-1","occurrence_id":null,"title":"rangement","corrected_status":"partial","user_evidence":"je l ai fait trois jours puis j ai relache","source_turn_summary":"rangement partiel"}],"weekly_gates":{"week_experience_status":"captured","action_review_status":"captured","global_progress_status":"captured","felt_progress_status":"captured","solution_fit_status":"missing","synthesis_status":"missing","closure_status":"missing"},"detour_candidate":{"kind":"none","source_stage":null,"target_action_or_plan":null,"fit_hypothesis":null,"readiness":"none","user_consent":false,"scope":{},"return_focus":null},"state_updates":{"status":"open","weekly_stage":"global_progress","validation_unlock_status":"locked_until_weekly_complete","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"qualify_solution_fit","instruction":"Reformuler le diagnostic weekly et qualifier la prochaine piste sans lancer d outil.","conversation_context":{"state_summary":"Diagnostic confirme, fatigue presente.","known_values":{"felt_state":"tired_but_ok","felt_progress":"encouraged"},"missing_or_weak_values":[],"tone_constraints":["compact"],"do_not_say":["applique","modifie le plan"]}},"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"global_progress","week_strategy":null,"last_weekly_question":null,"last_visible_summary":null,"last_handoff_summary":null,"validation_unlock_status":"locked_until_weekly_complete","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":null,"constraints":[]}},"note_information":null,"evidence":["confirme le diagnostic","fatigue mais progression"]}',
    "Exemple JSON 2 - transition critique non visible:",
    '{"flow_action":"handoff_to_local_flow","confidence":"high","risk_score":0,"target_dispatcher":"adjust_plan_item","weekly_intent":{"kind":"detour_request","summary":"Le user confirme que modifier l action du matin aiderait a conclure le weekly."},"human_signal_updates":{"objective_delta":null,"felt_progress":"frustrated","felt_state":"tired_but_ok","dominant_blocker_confirmation":"confirmed","user_summary":"avancee reelle mais action du matin trop fragile"},"handoff_updates":{"status":"requested","requested_adjustment_summary":"Alleger l action du matin pour garder le cap sans surcharger la semaine.","revision_summary":null,"platform_destination":"Plan","scope":{"kind":"specific_item","plan_id":"plan-1","plan_title":"Plan principal","plan_item_ids":["item-1"],"scope_summary":"action du matin","needs_scope_clarification":false}},"forgotten_progress":{"status":"none","target_hint":null,"outcome_hint":null,"evidence":null},"action_status_updates":[],"weekly_gates":{"week_experience_status":"complete","action_review_status":"complete","global_progress_status":"complete","felt_progress_status":"complete","solution_fit_status":"complete","synthesis_status":"missing","closure_status":"missing"},"detour_candidate":{"kind":"adjust_plan_item","source_stage":"solution_fit","target_action_or_plan":"action du matin","fit_hypothesis":"Le user demande explicitement d alleger cette action pour garder le cap.","readiness":"user_confirmed","user_consent":true,"scope":{"kind":"specific_item","plan_item_ids":["item-1"],"scope_summary":"action du matin"},"return_focus":"Revenir au weekly pour synthese et cloture."},"state_updates":{"status":"handoff_to_local_flow","weekly_stage":"child_detour","validation_unlock_status":"locked_until_weekly_complete","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"exit_or_cancel","instruction":"Lancer le detour Plan, puis revenir au weekly.","conversation_context":{"state_summary":"Detour Plan utile avant synthese weekly.","known_values":{"return_to_weekly":true},"missing_or_weak_values":[],"tone_constraints":["compact"],"do_not_say":["applique","modifie le plan"]}},"exit_memo":{"needed":true,"reason":"explicit_tool_request","user_intent_summary":"ajuster l action du matin","local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"child_detour","week_strategy":null,"last_weekly_question":null,"last_visible_summary":"avancee mais charge trop couteuse","last_handoff_summary":null,"validation_unlock_status":"locked_until_weekly_complete","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"adjust_plan_item","why":"detour Plan utile pour conclure le weekly","constraints":["Return to weekly after child flow.","Weekly did not apply a plan change from chat."]}},"note_information":{"source_flow_id":"weekly_adaptive_review_v1","handoff_reason":"bridge","target_dispatcher":"adjust_plan_item","handoff_context_for_next_dispatcher":"Prepare a Plan adjustment as a child flow, then return to weekly synthesis.","user_words":["alleger l action du matin"],"structured_context":{"user_message_summary":"detour Plan demande","active_flow_summary":"weekly parent remains active","collected_state":{"return_to_weekly":true,"weekly_stage":"child_detour"},"unresolved_questions":[],"recommended_next_focus":"prepare adjust_plan_item child flow then return weekly"},"confidence":"high"},"evidence":["action du matin fragile","demande d ajustement Plan"]}',
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_weekly_question|confirm_weekly_diagnostic|reject_weekly_diagnostic|clarify_human_signal|recap_weekly|explain_weekly_reasoning|forgotten_progress_correction|clarify_forgotten_progress|complete_weekly_no_change|complete_flow|exit_to_global_dispatcher|defer_flow|inline_tool_roundtrip|handoff_to_local_flow|safety_preempt","confidence":"low|medium|high","risk_score":0,"target_dispatcher":"none|global|safety_crisis|product_help|status_recap|adjust_plan_item|prepare_attack_card|prepare_defense_card|select_state_potion|create_one_shot_reminder|create_recurring_reminder","weekly_intent":{"kind":"weekly_answer|weekly_confirmation|weekly_rejection|weekly_recap|weekly_explain|detour_request|detour_revision|forgotten_progress|stop|off_topic|explicit_tool_request|safety|unclear","summary":"string"},"human_signal_updates":{"objective_delta":"clear_progress|slight_progress|stable|regression|unclear|unknown|null","felt_progress":"aligned|encouraged|neutral|frustrated|disconnected|worried|unclear|unknown|null","felt_state":"energized|stable|tired_but_ok|frustrated|overloaded|lost|unknown|null","dominant_blocker_confirmation":"confirmed|rejected|unclear|null","user_summary":"string|null"},"handoff_updates":{"status":"none|requested|ready|delivered|revised|cancelled","requested_adjustment_summary":"string|null","revision_summary":"string|null","platform_destination":"Plan|null","scope":{"kind":"whole_week|specific_plan|specific_item|ambiguous|none","plan_id":"string|null","plan_title":"string|null","plan_item_ids":[],"scope_summary":"string|null","needs_scope_clarification":false}},"forgotten_progress":{"status":"none|candidate|needs_target|ready_for_progress_tool|blocked","target_hint":"string|null","outcome_hint":"completed|partial|unknown|null","evidence":"string|null"},"action_status_updates":[{"plan_item_id":"string|null","occurrence_id":"string|null","title":"string|null","corrected_status":"completed|partial|missed|unknown","user_evidence":"string|null","source_turn_summary":"string|null"}],"weekly_gates":{"week_experience_status":"missing|captured|needs_deeper|complete","action_review_status":"missing|captured|needs_deeper|complete","global_progress_status":"missing|captured|needs_deeper|complete","felt_progress_status":"missing|captured|needs_deeper|complete","solution_fit_status":"missing|captured|needs_deeper|complete","synthesis_status":"missing|captured|needs_deeper|complete","closure_status":"missing|captured|needs_deeper|complete"},"detour_candidate":{"kind":"none|attack_card|defense_card|adjust_plan_item|select_state_potion|create_one_shot_reminder|create_recurring_reminder|product_help|status_recap","source_stage":"string|null","target_action_or_plan":"string|null","fit_hypothesis":"string|null","readiness":"none|explore_fit|offer|user_confirmed","user_consent":false,"scope":{},"return_focus":"string|null"},"state_updates":{"status":"open|proposal_discussed|handoff_ready|completed|stopped|deferred|handoff_to_local_flow|exit_to_global|safety","weekly_stage":"opening|week_experience|action_review|action_blocker|global_progress|solution_fit|child_detour|synthesis|closure|collecting_human_signal|strategy_ready|closing","validation_unlock_status":"locked_until_weekly_complete|available","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"ask_week_experience|review_action_gaps|explore_action_blocker|qualify_attack_or_defense_fit|ask_global_progress_feeling|deepen_global_progress|qualify_solution_fit|offer_child_detour|return_from_child_flow|weekly_synthesis|weekly_closure|answer_weekly_question|clarify_human_signal|weekly_recap|explain_reasoning|forgotten_progress_clarify|forgotten_progress_ack|forgotten_progress_blocked|stop_or_cancel|inline_tool_return|exit_or_cancel|safety_transition|safety","instruction":"string","conversation_context":{}},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"string|null","week_strategy":"string|null","last_weekly_question":"string|null","last_visible_summary":"string|null","last_handoff_summary":"string|null","validation_unlock_status":"string|null","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|create_one_shot_reminder|create_recurring_reminder|update_coach_preferences|status_recap|adjust_plan_item|product_help|normal_coaching|unknown","why":"string|null","constraints":[]}},"note_information":{"source_flow_id":"weekly_adaptive_review_v1","handoff_reason":"topic_change|safety|inline_tool|bridge|explicit_user_request","target_dispatcher":"global|safety_crisis|product_help|status_recap|adjust_plan_item|prepare_attack_card|prepare_defense_card|select_state_potion|create_one_shot_reminder|create_recurring_reminder","handoff_context_for_next_dispatcher":"string","user_words":["string"],"structured_context":{},"confidence":"low|medium|high"},"evidence":["string"]}',
  ].join("\n");
}

export function weeklyReviewLocalDispatcherSystemPromptForTest(): string {
  return dispatcherSystemPrompt();
}

type WeeklyReviewDispatcherFailureKind =
  | "timeout"
  | "invalid_json"
  | "provider_error"
  | "null_output"
  | "unknown";

function weeklyReviewDispatcherFailure(error: unknown): {
  kind: WeeklyReviewDispatcherFailureKind;
  error_name: string | null;
  error_message: string | null;
} {
  const name = nullableString((error as any)?.name);
  const message = nullableString((error as any)?.message ?? error);
  const haystack = `${name ?? ""} ${message ?? ""}`.toLowerCase();
  let kind: WeeklyReviewDispatcherFailureKind = "unknown";
  if (/timeout|timed out|abort|aborted/.test(haystack)) {
    kind = "timeout";
  } else if (
    /not_json|not_object|json|unexpected token|unexpected non-whitespace/.test(
      haystack,
    )
  ) {
    kind = "invalid_json";
  } else if (message) {
    kind = "provider_error";
  }
  return { kind, error_name: name, error_message: message };
}

export async function runWeeklyReviewLocalDispatcher(input: {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  weekly_state: Record<string, unknown>;
}): Promise<WeeklyReviewLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_weekly_adaptive_review_local_flow",
    weekly_state_json: input.weekly_state,
    weekly_progress_review_summary_json:
      input.weekly_state.weekly_progress_review ?? null,
    weekly_adaptive_review_json: input.weekly_state.weekly_adaptive_review ??
      null,
    user_message: input.user_message,
    conversation_excerpt: input.recent_messages,
    platform_context: withDirectEffectLocalContext(
      {},
      null,
      weeklyActiveActionCandidates(input.weekly_state),
    ),
  });
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
      source: "weekly_adaptive_review.local_dispatcher",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeWeeklyReviewLocalDispatcherOutput(raw);
}

function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function exitMemoForTempMemory(args: {
  reduced: WeeklyReviewReducerResult;
  output: WeeklyReviewLocalDispatcherOutput;
  previousWeeklyState: Record<string, unknown>;
}): Record<string, unknown> {
  const flow = defaultWeeklyFlowState(args.previousWeeklyState);
  return {
    ...args.output.exit_memo,
    at: new Date().toISOString(),
    reducer_reason_code: args.reduced.reason_code,
    flow_summary: args.output.weekly_intent.summary || null,
    note_information: args.reduced.note_information,
    local_flow_context: {
      ...args.output.exit_memo.local_flow_context,
      weekly_stage: args.output.exit_memo.local_flow_context.weekly_stage ??
        flow.stage,
      week_strategy: args.output.exit_memo.local_flow_context.week_strategy ??
        (cleanText(
          (args.previousWeeklyState.weekly_adaptive_review as any)
            ?.week_strategy?.decision,
        ) || null),
      last_visible_summary:
        args.output.exit_memo.local_flow_context.last_visible_summary ??
          flow.last_visible_summary,
      last_handoff_summary:
        args.output.exit_memo.local_flow_context.last_handoff_summary ??
          flow.last_handoff_summary,
      validation_unlock_status:
        args.output.exit_memo.local_flow_context.validation_unlock_status ??
          flow.validation_unlock_status,
    },
  };
}

function nextMemoryAfterWeeklyReduction(args: {
  tempMemory: unknown;
  reduced: WeeklyReviewReducerResult;
  output: WeeklyReviewLocalDispatcherOutput;
}): Record<string, unknown> {
  let next = args.reduced.weekly_state
    ? writeWeeklyReviewState(args.tempMemory, args.reduced.weekly_state)
    : clearWeeklyReviewState(args.tempMemory);
  if (args.reduced.weekly_state?.status === "completed") {
    next.__last_weekly_adaptive_review_summary = {
      source: "weekly_adaptive_review_v1",
      created_at: new Date().toISOString(),
      internal_summary: args.reduced.answer_summary,
      handoff_summary: args.reduced.handoff_summary,
      user_visible: false,
    };
  }
  return next;
}

function fallbackWeeklyVisibleMessage(args: {
  visibleTask: WeeklyReviewVisibleTaskKind;
  handoffSummary: string | null;
}): string {
  void args;
  return "Je garde le point weekly, mais je n'arrive pas a formuler correctement ce tour. Reessaie dans un instant.";
}

export async function runWeeklyReviewLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: unknown;
  activeSkillState?: unknown;
  userMessage: string;
  history?: unknown;
  requestId?: string | null;
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId?: string | null;
  dispatcher?: typeof runWeeklyReviewLocalDispatcher;
  visibleAgent?: typeof runWeeklyReviewVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const weeklyState = readWeeklyReviewState({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!isRecord(weeklyState)) return null;
  const dispatcher = args.dispatcher ?? runWeeklyReviewLocalDispatcher;
  let dispatcherFailure: {
    kind: WeeklyReviewDispatcherFailureKind;
    error_name: string | null;
    error_message: string | null;
  } | null = null;
  let output: WeeklyReviewLocalDispatcherOutput | null = null;
  try {
    output = await dispatcher({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      user_message: args.userMessage,
      recent_messages: recentMessagesFromHistory(args.history),
      weekly_state: weeklyState,
    });
    if (!output) {
      dispatcherFailure = {
        kind: "null_output",
        error_name: null,
        error_message: null,
      };
    }
  } catch (error) {
    dispatcherFailure = weeklyReviewDispatcherFailure(error);
    console.warn("[WeeklyReview] local dispatcher failed", {
      kind: dispatcherFailure.kind,
      error_name: dispatcherFailure.error_name,
      error_message: dispatcherFailure.error_message,
    });
  }
  if (!output) {
    const blockedReason = dispatcherFailure?.kind === "timeout"
      ? "local_dispatcher_timeout"
      : dispatcherFailure?.kind === "invalid_json"
      ? "local_dispatcher_invalid_json"
      : "local_dispatcher_failed";
    console.warn("weekly_review.visible_fallback_used", {
      reason_code: "weekly_review_local_dispatcher_failed",
      dispatcher_failure_kind: dispatcherFailure?.kind ?? "unknown",
      visible_fallback_used: true,
      qa_green_eligible: false,
    });
    return {
      content:
        "Je garde le point weekly, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "weekly_adaptive_review_v1",
        status: "blocked",
        reason_code: "weekly_review_local_dispatcher_failed",
        dispatcher_failure_kind: dispatcherFailure?.kind ?? "unknown",
        dispatcher_error_name: dispatcherFailure?.error_name ?? null,
        dispatcher_error_message: dispatcherFailure?.error_message ?? null,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        visible_fallback_used: true,
        qa_green_eligible: false,
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: blockedReason,
        }],
      },
    };
  }
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState,
    output,
  });
  if (
    reduced.exit_to_global_dispatcher ||
    reduced.status === "safety" ||
    reduced.status === "handoff_to_local_flow"
  ) {
    const nextTempMemory: Record<string, unknown> = {
      ...clearWeeklyReviewState(args.tempMemory),
      [WEEKLY_REVIEW_EXIT_MEMO_KEY]: exitMemoForTempMemory({
        reduced,
        output,
        previousWeeklyState: weeklyState,
      }),
    };
    if (reduced.status === "handoff_to_local_flow") {
      nextTempMemory.__suspended_flow_v1 = {
        owner: "conversation_skill",
        state_snapshot: weeklyStateForSuspendedChildFlow({
          previousWeeklyState: weeklyState,
          output,
          handoffSummary: reduced.handoff_summary,
        }),
        suspended_by: "weekly_review_local_handoff_to_local_flow",
        resume_policy: "return_after_child_flow",
        target_flow: reduced.target_dispatcher,
        note_information: reduced.note_information,
        turn_ttl: 8,
        created_at: new Date().toISOString(),
      };
    }
    return {
      content: "",
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "weekly_adaptive_review_v1",
        status: reduced.status === "safety"
          ? "safety"
          : reduced.status === "handoff_to_local_flow"
          ? "handoff_to_local_flow"
          : "exit_to_global",
        reason_code: reduced.reason_code,
        flow_action: output.flow_action,
        visible_task: reduced.visible_task,
        target_dispatcher: reduced.target_dispatcher,
        note_information: reduced.note_information,
        exit_memo: nextTempMemory[WEEKLY_REVIEW_EXIT_MEMO_KEY],
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
      },
    };
  }

  let nextTempMemory = nextMemoryAfterWeeklyReduction({
    tempMemory: args.tempMemory,
    reduced,
    output,
  });
  const visibleTask = reduced.visible_task;
  const conversationContext = reduced.conversation_context ??
    buildWeeklyConversationContext({
      weeklyState,
      output,
      reducedState: reduced.weekly_state ?? weeklyState,
      handoffSummary: reduced.handoff_summary,
      visibleTask,
    });
  const visibleAgent = args.visibleAgent ?? runWeeklyReviewVisibleAgent;
  const visible = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: visibleTask,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    conversation_context: conversationContext,
  });
  const visibleText = cleanText(visible);
  const visibleFallbackUsed = !visibleText;
  if (visibleFallbackUsed) {
    console.warn("weekly_review.visible_fallback_used", {
      reason_code: reduced.reason_code,
      visible_task: visibleTask,
      visible_fallback_used: true,
      qa_green_eligible: false,
    });
  }
  const content = visibleText ||
    fallbackWeeklyVisibleMessage({
      visibleTask,
      handoffSummary: reduced.handoff_summary,
    });
  const toolExecution = reduced.tool_execution;
  const selectedHandler = "weekly_adaptive_review_v1";
  return {
    content,
    nextTempMemory,
    toolExecution,
    executedTools: [],
    toolSkillRun: {
      selected_handler: selectedHandler,
      operation_type: selectedHandler,
      status: reduced.status,
      reason_code: reduced.reason_code,
      flow_action: output.flow_action,
      visible_task: visibleTask,
      confidence: output.confidence,
      risk_score: output.risk_score,
      weekly_intent: output.weekly_intent,
      handoff_updates: output.handoff_updates,
      forgotten_progress: output.forgotten_progress,
      local_flow_state: reduced.weekly_state?.weekly_flow_state ?? null,
      target_dispatcher: reduced.target_dispatcher,
      note_information: reduced.note_information,
      conversation_context: conversationContext,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      visible_fallback_used: visibleFallbackUsed,
      qa_green_eligible: !visibleFallbackUsed,
      no_durable_plan_mutation: true,
      evidence: reduced.evidence,
      toolExecution,
      executedTools: [],
    },
  };
}

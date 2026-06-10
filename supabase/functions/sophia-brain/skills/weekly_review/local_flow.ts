import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  WeeklyHumanSignals,
  WeeklyReviewDecision,
} from "../../../_shared/weekly_review/contract.ts";
import { reduceWeeklyReview } from "../../../_shared/weekly_review/reducer.ts";
import type { WeeklyProgressReviewV2 } from "../../../_shared/weekly_progress_review.ts";
import type { ActiveTransformationRuntime } from "../../../_shared/v2-runtime.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import {
  clearWeeklyReviewState,
  readWeeklyReviewState,
  writeWeeklyReviewState,
} from "./state.ts";
import { maybeLogWeeklyForgottenProgressParallel } from "./evidence.ts";
import { runWeeklyReviewVisibleAgent } from "./visible_agent.ts";

export const WEEKLY_REVIEW_EXIT_MEMO_KEY =
  "__last_weekly_adaptive_review_exit_memo";

export type WeeklyReviewLocalFlowAction =
  | "answer_weekly_question"
  | "confirm_weekly_reading"
  | "reject_weekly_reading"
  | "clarify_human_signal"
  | "recap_weekly"
  | "explain_weekly_reasoning"
  | "prepare_plan_handoff"
  | "revise_plan_handoff"
  | "repeat_plan_handoff"
  | "apply_attempt"
  | "forgotten_progress_correction"
  | "clarify_forgotten_progress"
  | "complete_weekly_no_change"
  | "complete_flow"
  | "stop_local_no_handoff"
  | "defer_flow"
  | "inline_tool_roundtrip"
  | "handoff_to_local_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type WeeklyReviewVisibleTaskKind =
  | "answer_weekly_question"
  | "clarify_human_signal"
  | "weekly_reading"
  | "weekly_recap"
  | "explain_reasoning"
  | "plan_handoff_ready"
  | "revise_plan_handoff"
  | "repeat_plan_handoff"
  | "apply_attempt"
  | "forgotten_progress_clarify"
  | "forgotten_progress_ack"
  | "forgotten_progress_blocked"
  | "complete_no_change"
  | "stop_close"
  | "stop_or_cancel"
  | "inline_tool_return"
  | "exit_or_cancel"
  | "safety";

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
  weekly_reading: {
    strategy_label_human: string | null;
    reason_human: string | null;
    confidence: "low" | "medium" | "high";
  };
  plan_contexts: Array<Record<string, unknown>>;
  item_summaries: Array<Record<string, unknown>>;
  handoff_data: Record<string, unknown>;
  forgotten_progress: Record<string, unknown>;
  inline_result: Record<string, unknown>;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type WeeklyReviewLocalFlowState = {
  stage:
    | "opening"
    | "collecting_human_signal"
    | "strategy_ready"
    | "plan_handoff"
    | "closing";
  proposal_status:
    | "none"
    | "discussed_not_applied"
    | "handoff_delivered"
    | "apply_attempt"
    | "cancelled";
  validation_unlock_status: "locked_until_weekly_complete" | "available";
  human_signals: WeeklyHumanSignals;
  last_user_signal: string | null;
  last_visible_summary: string | null;
  last_handoff_summary: string | null;
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
      | "plan_handoff_request"
      | "plan_handoff_revision"
      | "apply_attempt"
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
      | "apply_attempt"
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
  "confirm_weekly_reading",
  "reject_weekly_reading",
  "clarify_human_signal",
  "recap_weekly",
  "explain_weekly_reasoning",
  "prepare_plan_handoff",
  "revise_plan_handoff",
  "repeat_plan_handoff",
  "apply_attempt",
  "forgotten_progress_correction",
  "clarify_forgotten_progress",
  "complete_weekly_no_change",
  "complete_flow",
  "stop_local_no_handoff",
  "defer_flow",
  "inline_tool_roundtrip",
  "handoff_to_local_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
];

const VISIBLE_TASKS: WeeklyReviewVisibleTaskKind[] = [
  "answer_weekly_question",
  "clarify_human_signal",
  "weekly_reading",
  "weekly_recap",
  "explain_reasoning",
  "plan_handoff_ready",
  "revise_plan_handoff",
  "repeat_plan_handoff",
  "apply_attempt",
  "forgotten_progress_clarify",
  "forgotten_progress_ack",
  "forgotten_progress_blocked",
  "complete_no_change",
  "stop_close",
  "stop_or_cancel",
  "inline_tool_return",
  "exit_or_cancel",
  "safety",
];

const WEEKLY_INTENTS: WeeklyReviewLocalDispatcherOutput["weekly_intent"][
  "kind"
][] = [
  "weekly_answer",
  "weekly_confirmation",
  "weekly_rejection",
  "weekly_recap",
  "weekly_explain",
  "plan_handoff_request",
  "plan_handoff_revision",
  "apply_attempt",
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
    action === "safety_preempt";
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
    source_flow_state_summary: buildWeeklySourceStateSummary({
      exitMemo: args.exitMemo,
      intentSummary: args.intentSummary,
    }),
    handoff_reason: noteReasonForWeekly({
      action: args.action,
      targetDispatcher: target,
      exitMemo: args.exitMemo,
    }),
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    target_local_dispatcher_hint: target === "global"
      ? null
      : `Consume weekly source context, then run ${target} from its own dispatcher contract.`,
    user_words: args.userWords,
    structured_context: structuredContext,
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
          "apply_attempt",
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
        action === "stop_local_no_handoff" ? "stopped" : "open",
      ),
      weekly_stage: enumValue(
        state.weekly_stage,
        [
          "opening",
          "collecting_human_signal",
          "strategy_ready",
          "plan_handoff",
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
        action === "prepare_plan_handoff"
          ? "plan_handoff_ready"
          : action === "stop_local_no_handoff" || action === "defer_flow"
          ? "stop_or_cancel"
          : action === "complete_weekly_no_change"
          ? "complete_no_change"
          : "weekly_reading",
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
        "collecting_human_signal",
        "strategy_ready",
        "plan_handoff",
        "closing",
      ],
      "opening",
    ),
    proposal_status: enumValue(
      raw.proposal_status,
      [
        "none",
        "discussed_not_applied",
        "handoff_delivered",
        "apply_attempt",
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
    last_user_signal: nullableString(raw.last_user_signal),
    last_visible_summary: nullableString(raw.last_visible_summary),
    last_handoff_summary: nullableString(
      raw.last_handoff_summary ?? raw.last_proposal_summary,
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
  action: WeeklyReviewLocalFlowAction;
}): unknown {
  if (
    args.action !== "answer_weekly_question" &&
    args.action !== "confirm_weekly_reading" &&
    args.action !== "reject_weekly_reading"
  ) return args.previousReview;
  if (!isRecord(args.projection)) return args.previousReview;
  try {
    return reduceWeeklyReview(
      args.projection as WeeklyProgressReviewV2,
      args.humanSignals,
      args.action === "reject_weekly_reading"
        ? "answer_weekly_question"
        : "answer_weekly_question",
    );
  } catch {
    return args.previousReview;
  }
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
  const transformations = Array.isArray(projection.transformations)
    ? projection.transformations
    : [];
  return transformations.flatMap((entry: any) => {
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
  const missing: string[] = [];
  if (args.output.visible_task.kind === "clarify_human_signal") {
    missing.push("signal_humain_weekly");
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
      validation_unlock_status: flow.validation_unlock_status,
      proposal_status: flow.proposal_status,
      dominant_blocker_confirmation:
        args.output.human_signal_updates.dominant_blocker_confirmation,
    },
    missing_or_weak_values: missing,
    weekly_reading: {
      strategy_label_human: humanStrategyLabel(strategy.decision),
      reason_human: nullableString(strategy.reason),
      confidence: args.output.confidence,
    },
    plan_contexts: planContextsFromProjection(sourceState),
    item_summaries: itemSummariesFromProjection(sourceState),
    handoff_data: {
      summary: args.handoffSummary,
      platform_destination: args.output.handoff_updates.platform_destination,
      scope: args.output.handoff_updates.scope,
      requested_adjustment_summary:
        args.output.handoff_updates.requested_adjustment_summary,
      revision_summary: args.output.handoff_updates.revision_summary,
      no_chat_mutation: true,
    },
    forgotten_progress: {
      ...args.output.forgotten_progress,
      no_plan_adjustment: true,
    },
    inline_result: {},
    tone_constraints: [
      "compact",
      "one_question_max_when_asking",
      "human_language",
    ],
    do_not_say: [
      "bridge_week",
      "carry_over",
      "repeat_week",
      "level_review",
      "plan_patch",
      "item_decision",
      "dominant_blocker",
      "applique",
      "modifie le plan",
      "valide le plan",
      "enregistre le plan",
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
  const handoffSummary = buildHandoffSummary(output, previousFlow);
  const turnCount = previousFlow.turn_count +
    output.state_updates.turn_count_increment;
  const maxTurns = previousFlow.max_turns || 6;
  const turnLimitReached = turnCount >= maxTurns &&
    output.flow_action !== "exit_to_global_dispatcher" &&
    output.flow_action !== "safety_preempt" &&
    output.flow_action !== "handoff_to_local_flow" &&
    output.flow_action !== "inline_tool_roundtrip";

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

  const closeAfterVisible = output.state_updates.close_after_visible ||
    turnLimitReached ||
    output.flow_action === "complete_weekly_no_change" ||
    output.flow_action === "complete_flow" ||
    output.flow_action === "stop_local_no_handoff" ||
    output.flow_action === "defer_flow";
  const nextStatus = output.flow_action === "stop_local_no_handoff"
    ? "stopped"
    : output.flow_action === "defer_flow"
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
    proposal_status: output.flow_action === "apply_attempt"
      ? "apply_attempt"
      : output.handoff_updates.status === "ready" ||
          output.handoff_updates.status === "delivered" ||
          output.flow_action === "prepare_plan_handoff"
      ? "handoff_delivered"
      : output.flow_action === "stop_local_no_handoff" ||
          output.flow_action === "defer_flow"
      ? "cancelled"
      : previousFlow.proposal_status,
    validation_unlock_status: validationUnlockStatus,
    human_signals: nextSignals,
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
  const handoffAction = output.flow_action === "prepare_plan_handoff" ||
    output.flow_action === "revise_plan_handoff" ||
    output.flow_action === "repeat_plan_handoff" ||
    output.flow_action === "apply_attempt";
  const visibleTask = output.flow_action === "stop_local_no_handoff" ||
      output.flow_action === "defer_flow"
    ? "stop_or_cancel"
    : output.flow_action === "complete_flow"
    ? "complete_no_change"
    : output.visible_task.kind;
  const conversationContext = buildWeeklyConversationContext({
    weeklyState: args.previousWeeklyState,
    output,
    reducedState: nextWeeklyState,
    handoffSummary,
    visibleTask,
  });
  return {
    status: closeAfterVisible
      ? "closed"
      : handoffAction
      ? "handoff"
      : "answered",
    reason_code: `weekly_review_local_${output.flow_action}`,
    weekly_state: nextWeeklyState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    tool_execution: handoffAction ? "platform_handoff" : "none",
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
    "Contexte: Sophia a envoye un point weekly de fin de semaine. Le weekly lit les preuves daily/dashboard, produit une lecture strategique, et peut preparer un handoff Plan si la semaine suivante doit etre ajustee.",
    "Le weekly ne modifie jamais le plan depuis le chat.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "",
    "Actions possibles: answer_weekly_question, confirm_weekly_reading, reject_weekly_reading, clarify_human_signal, recap_weekly, explain_weekly_reasoning, prepare_plan_handoff, revise_plan_handoff, repeat_plan_handoff, apply_attempt, forgotten_progress_correction, clarify_forgotten_progress, complete_flow, stop_local_no_handoff, defer_flow, inline_tool_roundtrip, handoff_to_local_flow, exit_to_global_dispatcher, safety_preempt.",
    "",
    "Regles:",
    "- Ne fais aucune regex metier.",
    "- Ne decide pas par mot-cle isole.",
    "- Interprete le message par rapport au weekly actif.",
    "- Ne recalcule pas la projection factuelle.",
    "- Ne dis jamais qu'un changement de plan est applique.",
    "- Si le user demande un ajustement Plan, prepare un handoff Plan, pas une execution.",
    "- Si plusieurs plans/actions sont dans le weekly, preserve toujours le contexte plan/action.",
    "- Si le scope plan/action est ambigu, clarifie au lieu de melanger les plans.",
    "- Si le user dit ok applique pendant un handoff, c'est apply_attempt.",
    "- Si le user corrige une progression oubliee, ne l'assimile pas a un ajustement Plan.",
    "- Si le user demande une carte d'attaque, retourne handoff_to_local_flow avec target_dispatcher=prepare_attack_card.",
    "- Si le user demande une carte de defense, retourne handoff_to_local_flow avec target_dispatcher=prepare_defense_card.",
    "- Si le user demande une potion ou une preference coach durable, retourne handoff_to_local_flow avec le dispatcher cible.",
    "- Si le user pose une question produit temporaire pendant le weekly, retourne inline_tool_roundtrip target_dispatcher=product_help.",
    "- Si le user pose une question DB/status temporaire pendant le weekly, retourne inline_tool_roundtrip target_dispatcher=status_recap.",
    "- Si le user change de sujet sans dispatcher local cible clair, retourne exit_to_global_dispatcher target_dispatcher=global.",
    "- Si le user veut juste arreter ou reporter le weekly, retourne stop_local_no_handoff ou defer_flow. Ne route pas global.",
    "- Pour handoff_to_local_flow, inline_tool_roundtrip, safety_preempt ou exit_to_global_dispatcher, fournis note_information canonique.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Choisis une action de continuation weekly si le user repond au bilan, pose une question weekly, confirme/rejette la lecture, demande un recap ou corrige une progression. Choisis stop_local_no_handoff/defer_flow si le user veut seulement arreter ou reporter. Choisis exit_to_global_dispatcher uniquement pour un nouveau sujet clair sans dispatcher local cible. Choisis safety_preempt pour safety reelle. Choisis handoff_to_local_flow seulement pour un flow local cible autorise. Choisis inline_tool_roundtrip seulement pour une question produit/status temporaire pendant le weekly. Ne base jamais l'action sur l'etat precedent seul.",
    "- confidence: high si l'intention du message courant est claire et compatible avec le weekly; medium si probable mais incomplete; low si clarification ou prudence necessaire. N'utilise pas high pour masquer un scope Plan ambigu.",
    "- risk_score: score local 0-10. Reste bas pour fatigue, hesitation ou frustration ordinaire. N'invente pas de safety. Si le message contient un vrai risque safety, augmente le score et choisis safety_preempt avec note_information target_dispatcher=safety_crisis.",
    "- target_dispatcher: none pour toute continuation weekly, stop local, completion ou handoff Plan interne. global uniquement avec exit_to_global_dispatcher. safety_crisis uniquement avec safety_preempt. product_help/status_recap uniquement avec inline_tool_roundtrip. prepare_attack_card, prepare_defense_card, adjust_plan_item, select_state_potion, track_progress_plan_item ou update_coach_preferences uniquement avec handoff_to_local_flow.",
    "- weekly_intent: resume l'intention weekly du message courant. kind doit suivre flow_action: weekly_answer pour reponse au bilan, weekly_confirmation/rejection pour validation ou rejet, plan_handoff_request/revision pour proposition Plan, apply_attempt quand le user tente d'appliquer depuis chat, forgotten_progress pour correction retrospective, stop/off_topic/explicit_tool_request/safety/unclear selon le cas. summary doit rester court et ne pas inventer de fait.",
    "- human_signal_updates: remplis seulement les signaux humains explicitement fournis ou fortement confirmes dans ce tour. Mets null quand le message ne parle pas de progression, energie, blocage ou ressenti weekly. Ne transforme pas une hypothese du bilan en fait confirme.",
    "- handoff_updates: utilise status none si aucune proposition Plan n'est en jeu. requested/ready pour preparer une proposition a reprendre dans Plan, revised pour modifier la proposition, delivered quand elle est prete a afficher, apply_attempt quand le user veut l'appliquer depuis chat, cancelled si le user refuse ce handoff. platform_destination vaut Plan seulement pour handoff Plan. scope doit rester none ou ambiguous si le plan/action cible n'est pas clair; ne fabrique pas d'id.",
    "- forgotten_progress: none par defaut. candidate si le user mentionne une progression oubliee sans cible suffisante. needs_target si la cible manque. ready_for_progress_tool seulement si la cible et l'issue sont assez claires pour le reducer. blocked si la correction est contradictoire ou impossible. Ne confonds pas correction retrospective et ajustement de plan futur.",
    "- state_updates: patch d'etat weekly, pas profil global. weekly_stage suit la suite logique du flow. status open/proposal_discussed/handoff_ready/completed/stopped/deferred/handoff_to_local_flow/exit_to_global/safety doit correspondre a flow_action. validation_unlock_status devient available seulement quand le weekly est vraiment termine sans attente. turn_count_increment vaut 1 sauf reprise technique evidente; close_after_visible true seulement si le flow doit fermer apres le message visible.",
    "- visible_task.kind: stage visible exact pour le prochain prompt local. Evite un stage generique quand weekly_reading, clarify_human_signal, plan_handoff_ready, revise_plan_handoff, repeat_plan_handoff, apply_attempt, forgotten_progress_clarify, complete_no_change, stop_or_cancel, inline_tool_return, exit_or_cancel ou safety convient. En stop/defer, utilise stop_or_cancel. En safety, utilise safety. En transition dispatcher, le message visible source est normalement vide ou exit_or_cancel selon reducer.",
    "- visible_task.instruction: instruction courte au prompt visible, sans texte final utilisateur. Ne construis jamais la reponse visible ici.",
    "- visible_task.conversation_context: ce champ existe dans le contrat mais le reducer weekly reconstruit la version finale visible-agent-safe. Si tu le fournis, garde-le compact et filtre: contraintes, valeurs connues, incertitudes, ton, limites. Pas de DB brute, memoire brute, note_information brute, ids inventes, ni decision a refaire par l'agent visible.",
    "- note_information: obligatoire pour exit_to_global_dispatcher, safety_preempt, handoff_to_local_flow et inline_tool_roundtrip. Elle est consommee par le dispatcher cible, jamais transmise brute au prompt visible. Elle doit inclure source_flow_id=weekly_adaptive_review_v1, resume de l'etat weekly, raison du handoff, target_dispatcher, mots utiles du user, structured_context avec acquis/incertitudes/recommended_next_focus, risk_score et no_chat_mutation false partout.",
    "- exit_memo: champ secondaire de compatibilite runtime. Ne l'utilise jamais a la place de note_information. needed false et reason none pour continuation/stop/completion. Si transition, garde-le coherent avec note_information mais ne mets pas de decision visible dedans.",
    "- evidence: indices semantiques vraiment utilises depuis le message courant ou le contexte weekly. Pas de pseudo-preuves, pas de mots-cles isoles sans interpretation.",
    "",
    "Transition Rules:",
    "- stop_local_no_handoff/defer_flow: le user arrete ou reporte le weekly sans nouveau sujet clair; target_dispatcher none; pas de global sur le meme tour; visible_task.kind stop_or_cancel.",
    "- exit_to_global_dispatcher: nouveau sujet clair hors weekly et hors flow local cible autorise; target_dispatcher global; note_information obligatoire.",
    "- safety_preempt: safety prioritaire; target_dispatcher safety_crisis; note_information obligatoire; le global normal ne reprend pas.",
    "- handoff_to_local_flow: seulement si le contrat cible est autorise par target_dispatcher; note_information obligatoire; explique dans structured_context ce qui est acquis et ce que le dispatcher cible doit regarder ensuite.",
    "- inline_tool_roundtrip: seulement product_help ou status_recap temporaire; note_information obligatoire; conserve l'etat weekly parent.",
    "",
    "Exemple JSON 1 - continuation normale non visible:",
    '{"flow_action":"confirm_weekly_reading","confidence":"high","risk_score":0,"target_dispatcher":"none","weekly_intent":{"kind":"weekly_confirmation","summary":"Le user confirme la lecture et se sent fatigue mais d accord."},"human_signal_updates":{"objective_delta":"slight_progress","felt_state":"tired_but_ok","dominant_blocker_confirmation":"confirmed","user_summary":"fatigue mais progression legere"},"handoff_updates":{"status":"none","requested_adjustment_summary":null,"revision_summary":null,"platform_destination":null,"scope":{"kind":"none","plan_id":null,"plan_title":null,"plan_item_ids":[],"scope_summary":null,"needs_scope_clarification":false}},"forgotten_progress":{"status":"none","target_hint":null,"outcome_hint":null,"evidence":null},"state_updates":{"status":"open","weekly_stage":"strategy_ready","validation_unlock_status":"locked_until_weekly_complete","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"weekly_reading","instruction":"Reformuler la lecture weekly et demander au maximum une precision.","conversation_context":{"state_summary":"Lecture confirmee, fatigue presente.","known_values":{"felt_state":"tired_but_ok"},"missing_or_weak_values":[],"tone_constraints":["compact"],"do_not_say":["applique","modifie le plan"]}},"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"strategy_ready","week_strategy":null,"last_weekly_question":null,"last_visible_summary":null,"last_handoff_summary":null,"validation_unlock_status":"locked_until_weekly_complete","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":null,"constraints":[]}},"note_information":null,"evidence":["confirme la lecture","fatigue mais progression"]}',
    "Exemple JSON 2 - transition critique non visible:",
    '{"flow_action":"handoff_to_local_flow","confidence":"high","risk_score":0,"target_dispatcher":"prepare_attack_card","weekly_intent":{"kind":"explicit_tool_request","summary":"Le user veut preparer une carte d attaque depuis le point weekly."},"human_signal_updates":{"objective_delta":null,"felt_state":null,"dominant_blocker_confirmation":null,"user_summary":null},"handoff_updates":{"status":"none","requested_adjustment_summary":null,"revision_summary":null,"platform_destination":null,"scope":{"kind":"none","plan_id":null,"plan_title":null,"plan_item_ids":[],"scope_summary":null,"needs_scope_clarification":false}},"forgotten_progress":{"status":"none","target_hint":null,"outcome_hint":null,"evidence":null},"state_updates":{"status":"handoff_to_local_flow","weekly_stage":"closing","validation_unlock_status":"locked_until_weekly_complete","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"exit_or_cancel","instruction":"Ne pas traiter la carte dans le message weekly source.","conversation_context":{"state_summary":"Weekly quitte vers carte d attaque.","known_values":{},"missing_or_weak_values":[],"tone_constraints":["compact"],"do_not_say":["applique","modifie le plan"]}},"exit_memo":{"needed":true,"reason":"explicit_tool_request","user_intent_summary":"preparer une carte d attaque","local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"strategy_ready","week_strategy":null,"last_weekly_question":null,"last_visible_summary":null,"last_handoff_summary":null,"validation_unlock_status":"locked_until_weekly_complete","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card","why":"demande explicite de carte","constraints":["Weekly did not apply a plan change from chat."]}},"note_information":{"source_flow_id":"weekly_adaptive_review_v1","source_flow_state_summary":"Weekly actif, lecture deja discutee.","handoff_reason":"bridge","target_dispatcher":"prepare_attack_card","handoff_context_for_next_dispatcher":"User asks to prepare an attack card from weekly context.","target_local_dispatcher_hint":"Run prepare_attack_card from its own local contract.","user_words":["fais moi une carte d attaque"],"structured_context":{"active_flow_summary":"weekly reading discussed","collected_state":{"weekly_stage":"strategy_ready"},"unresolved_questions":[],"recommended_next_focus":"identify attack card target and blocker"},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"evidence":["demande explicite de carte d attaque"]}',
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_weekly_question|confirm_weekly_reading|reject_weekly_reading|clarify_human_signal|recap_weekly|explain_weekly_reasoning|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|apply_attempt|forgotten_progress_correction|clarify_forgotten_progress|complete_flow|stop_local_no_handoff|defer_flow|inline_tool_roundtrip|handoff_to_local_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"target_dispatcher":"none|global|safety_crisis|product_help|status_recap|prepare_attack_card|prepare_defense_card|adjust_plan_item|select_state_potion|track_progress_plan_item|update_coach_preferences","weekly_intent":{"kind":"weekly_answer|weekly_confirmation|weekly_rejection|weekly_recap|weekly_explain|plan_handoff_request|plan_handoff_revision|apply_attempt|forgotten_progress|stop|off_topic|explicit_tool_request|safety|unclear","summary":"string"},"human_signal_updates":{"objective_delta":"clear_progress|slight_progress|stable|regression|unclear|unknown|null","felt_state":"energized|stable|tired_but_ok|frustrated|overloaded|lost|unknown|null","dominant_blocker_confirmation":"confirmed|rejected|unclear|null","user_summary":"string|null"},"handoff_updates":{"status":"none|requested|ready|delivered|revised|apply_attempt|cancelled","requested_adjustment_summary":"string|null","revision_summary":"string|null","platform_destination":"Plan|null","scope":{"kind":"whole_week|specific_plan|specific_item|ambiguous|none","plan_id":"string|null","plan_title":"string|null","plan_item_ids":[],"scope_summary":"string|null","needs_scope_clarification":false}},"forgotten_progress":{"status":"none|candidate|needs_target|ready_for_progress_tool|blocked","target_hint":"string|null","outcome_hint":"completed|partial|unknown|null","evidence":"string|null"},"state_updates":{"status":"open|proposal_discussed|handoff_ready|completed|stopped|deferred|handoff_to_local_flow|exit_to_global|safety","weekly_stage":"opening|collecting_human_signal|strategy_ready|plan_handoff|closing","validation_unlock_status":"locked_until_weekly_complete|available","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"answer_weekly_question|clarify_human_signal|weekly_reading|weekly_recap|explain_reasoning|plan_handoff_ready|revise_plan_handoff|repeat_plan_handoff|apply_attempt|forgotten_progress_clarify|forgotten_progress_ack|forgotten_progress_blocked|complete_no_change|stop_or_cancel|inline_tool_return|exit_or_cancel|safety","instruction":"string","conversation_context":{}},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"string|null","week_strategy":"string|null","last_weekly_question":"string|null","last_visible_summary":"string|null","last_handoff_summary":"string|null","validation_unlock_status":"string|null","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|adjust_plan_item|product_help|normal_coaching|unknown","why":"string|null","constraints":[]}},"note_information":{"source_flow_id":"weekly_adaptive_review_v1","source_flow_state_summary":"string","handoff_reason":"topic_change|safety|inline_tool|bridge|explicit_user_request","target_dispatcher":"global|safety_crisis|product_help|status_recap|prepare_attack_card|prepare_defense_card|adjust_plan_item|select_state_potion|track_progress_plan_item|update_coach_preferences","handoff_context_for_next_dispatcher":"string","target_local_dispatcher_hint":"string|null","user_words":["string"],"structured_context":{},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"evidence":["string"]}',
  ].join("\n");
}

export function weeklyReviewLocalDispatcherSystemPromptForTest(): string {
  return dispatcherSystemPrompt();
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
        source: "weekly_adaptive_review.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeWeeklyReviewLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[WeeklyReview] local dispatcher failed", error);
    return null;
  }
}

function recentMessagesFromHistory(
  history: unknown,
): Array<{ role: "user" | "assistant"; content: string }> {
  return Array.isArray(history)
    ? history.flatMap((message) => {
      const role = String((message as any)?.role ?? "");
      const content = String((message as any)?.content ?? "").trim();
      if ((role === "user" || role === "assistant") && content) {
        return [{ role: role as "user" | "assistant", content }];
      }
      return [];
    }).slice(-8)
    : [];
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
  const output = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    weekly_state: weeklyState,
  });
  if (!output) {
    console.warn("weekly_review.visible_fallback_used", {
      reason_code: "weekly_review_local_dispatcher_failed",
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
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        visible_fallback_used: true,
        qa_green_eligible: false,
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: "local_dispatcher_failed",
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
    const nextTempMemory = {
      ...clearWeeklyReviewState(args.tempMemory),
      [WEEKLY_REVIEW_EXIT_MEMO_KEY]: exitMemoForTempMemory({
        reduced,
        output,
        previousWeeklyState: weeklyState,
      }),
    };
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
  let progressRuntime:
    | Awaited<ReturnType<typeof maybeLogWeeklyForgottenProgressParallel>>
    | null = null;
  if (output.flow_action === "forgotten_progress_correction") {
    progressRuntime = await maybeLogWeeklyForgottenProgressParallel({
      supabase: args.supabase,
      userId: args.userId,
      tempMemory: nextTempMemory,
      activeSkillState: reduced.weekly_state ?? weeklyState,
      v2Runtime: args.v2Runtime ?? null,
      loggedMessageId: args.loggedMessageId ?? null,
      userMessage: args.userMessage,
    });
  }
  const visibleTask = output.flow_action === "forgotten_progress_correction"
    ? progressRuntime?.toolExecution === "success"
      ? "forgotten_progress_ack"
      : progressRuntime?.toolExecution === "blocked" ||
          progressRuntime?.toolExecution === "failed"
      ? "forgotten_progress_blocked"
      : output.visible_task.kind
    : reduced.visible_task;
  const conversationContext = reduced.conversation_context ??
    buildWeeklyConversationContext({
      weeklyState,
      output,
      reducedState: reduced.weekly_state ?? weeklyState,
      handoffSummary: reduced.handoff_summary,
      visibleTask,
    });
  if (
    progressRuntime?.toolSkillRun?.committed_effects &&
    isRecord(conversationContext.forgotten_progress)
  ) {
    conversationContext.forgotten_progress = {
      ...conversationContext.forgotten_progress,
      committed_effects: progressRuntime.toolSkillRun.committed_effects,
    };
  }
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
  const committedEffects = Array.isArray(
      progressRuntime?.toolSkillRun?.committed_effects,
    )
    ? progressRuntime?.toolSkillRun?.committed_effects
    : [];
  const toolExecution = progressRuntime?.toolExecution &&
      progressRuntime.toolExecution !== "none"
    ? progressRuntime.toolExecution
    : reduced.tool_execution;
  const selectedHandler = progressRuntime?.toolExecution &&
      progressRuntime.toolExecution !== "none"
    ? "track_progress_plan_item"
    : "weekly_adaptive_review_v1";
  return {
    content,
    nextTempMemory,
    toolExecution,
    executedTools: progressRuntime?.executedTools ?? [],
    toolSkillRun: {
      selected_handler: selectedHandler,
      operation_type: reduced.tool_execution === "platform_handoff"
        ? "adjust_plan_item"
        : selectedHandler,
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
      requested_effects: progressRuntime?.toolSkillRun?.requested_effects ?? [],
      allowed_effects: progressRuntime?.toolSkillRun?.allowed_effects ?? [],
      committed_effects: committedEffects,
      blocked_effects: progressRuntime?.toolSkillRun?.blocked_effects ??
        reduced.blocked_effects,
      visible_fallback_used: visibleFallbackUsed,
      qa_green_eligible: !visibleFallbackUsed,
      platform_handoff: reduced.tool_execution === "platform_handoff"
        ? {
          operation_type: "adjust_plan_item",
          status: "delivered",
          surface_id: "plan",
          reason_code: reduced.reason_code,
          no_chat_mutation: true,
          handoff_summary: reduced.handoff_summary,
          scope: output.handoff_updates.scope,
        }
        : undefined,
      no_chat_mutation: true,
      no_durable_plan_mutation: true,
      evidence: reduced.evidence,
      toolExecution,
      executedTools: progressRuntime?.executedTools ?? [],
    },
  };
}

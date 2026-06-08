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
  | "stop_weekly"
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
  | "exit_or_cancel"
  | "safety";

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
      | "exit_to_global"
      | "safety";
    weekly_stage: WeeklyReviewLocalFlowState["stage"];
    validation_unlock_status: "locked_until_weekly_complete" | "available";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: WeeklyReviewVisibleTaskKind;
    instruction: string;
  };
  exit_memo: WeeklyReviewExitMemo;
  evidence: string[];
};

export type WeeklyReviewReducerResult = {
  status:
    | "answered"
    | "handoff"
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
  "stop_weekly",
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

export function normalizeWeeklyReviewLocalDispatcherOutput(
  raw: unknown,
): WeeklyReviewLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const action = enumValue<WeeklyReviewLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_human_signal",
  );
  const intent = isRecord(root.weekly_intent) ? root.weekly_intent : {};
  const human = isRecord(root.human_signal_updates)
    ? root.human_signal_updates
    : {};
  const handoff = isRecord(root.handoff_updates)
    ? root.handoff_updates
    : {};
  const scope = isRecord(handoff.scope) ? handoff.scope : {};
  const forgotten = isRecord(root.forgotten_progress)
    ? root.forgotten_progress
    : {};
  const state = isRecord(root.state_updates) ? root.state_updates : {};
  const visible = isRecord(root.visible_task) ? root.visible_task : {};
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    weekly_intent: {
      kind: enumValue(intent.kind, WEEKLY_INTENTS, "unclear"),
      summary: cleanText(intent.summary),
    },
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
        ["none", "candidate", "needs_target", "ready_for_progress_tool", "blocked"],
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
          "exit_to_global",
          "safety",
        ],
        action === "stop_weekly" ? "stopped" : "open",
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
        action === "complete_weekly_no_change" ? "available" : "locked_until_weekly_complete",
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
          : action === "complete_weekly_no_change"
          ? "complete_no_change"
          : "weekly_reading",
      ),
      instruction: cleanText(visible.instruction),
    },
    exit_memo: normalizeExitMemo(root.exit_memo, action),
    evidence: stringArray(root.evidence, 10),
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
    output.flow_action !== "safety_preempt";

  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.exit_memo.needed || output.exit_memo.reason === "none") {
      const blockedFlow = {
        ...previousFlow,
        turn_count: turnCount,
        updated_at: now,
      };
      return {
        status: "blocked",
        reason_code: "weekly_review_exit_memo_required",
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
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: "exit_memo_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "exit",
      reason_code: "weekly_review_local_exit_to_global_dispatcher",
      weekly_state: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
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
      exit_to_global_dispatcher: true,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }

  const closeAfterVisible = output.state_updates.close_after_visible ||
    turnLimitReached ||
    output.flow_action === "complete_weekly_no_change" ||
    output.flow_action === "stop_weekly";
  const nextStatus = output.flow_action === "stop_weekly"
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
      : output.flow_action === "stop_weekly"
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
  return {
    status: closeAfterVisible ? "closed" : handoffAction ? "handoff" : "answered",
    reason_code: `weekly_review_local_${output.flow_action}`,
    weekly_state: nextWeeklyState,
    visible_task: output.visible_task.kind,
    exit_to_global_dispatcher: false,
    tool_execution: handoffAction ? "platform_handoff" : "none",
    handoff_summary: handoffSummary,
    answer_summary: summary,
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
    "Actions possibles: answer_weekly_question, confirm_weekly_reading, reject_weekly_reading, clarify_human_signal, recap_weekly, explain_weekly_reasoning, prepare_plan_handoff, revise_plan_handoff, repeat_plan_handoff, apply_attempt, forgotten_progress_correction, clarify_forgotten_progress, complete_weekly_no_change, stop_weekly, exit_to_global_dispatcher, safety_preempt.",
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
    "- Si le user demande une carte/potion/preference/status/product help, sors vers le dispatcher global avec likely_intent.",
    "- Si tu sors, l'exit_memo doit expliquer ou en etait le weekly.",
    'Retourne exactement ce JSON: {"flow_action":"answer_weekly_question|confirm_weekly_reading|reject_weekly_reading|clarify_human_signal|recap_weekly|explain_weekly_reasoning|prepare_plan_handoff|revise_plan_handoff|repeat_plan_handoff|apply_attempt|forgotten_progress_correction|clarify_forgotten_progress|complete_weekly_no_change|stop_weekly|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"weekly_intent":{"kind":"weekly_answer|weekly_confirmation|weekly_rejection|weekly_recap|weekly_explain|plan_handoff_request|plan_handoff_revision|apply_attempt|forgotten_progress|stop|off_topic|explicit_tool_request|safety|unclear","summary":"string"},"human_signal_updates":{"objective_delta":"clear_progress|slight_progress|stable|regression|unclear|unknown|null","felt_state":"energized|stable|tired_but_ok|frustrated|overloaded|lost|unknown|null","dominant_blocker_confirmation":"confirmed|rejected|unclear|null","user_summary":"string|null"},"handoff_updates":{"status":"none|requested|ready|delivered|revised|apply_attempt|cancelled","requested_adjustment_summary":"string|null","revision_summary":"string|null","platform_destination":"Plan|null","scope":{"kind":"whole_week|specific_plan|specific_item|ambiguous|none","plan_id":"string|null","plan_title":"string|null","plan_item_ids":[],"scope_summary":"string|null","needs_scope_clarification":false}},"forgotten_progress":{"status":"none|candidate|needs_target|ready_for_progress_tool|blocked","target_hint":"string|null","outcome_hint":"completed|partial|unknown|null","evidence":"string|null"},"state_updates":{"status":"open|proposal_discussed|handoff_ready|completed|stopped|exit_to_global|safety","weekly_stage":"opening|collecting_human_signal|strategy_ready|plan_handoff|closing","validation_unlock_status":"locked_until_weekly_complete|available","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"answer_weekly_question|clarify_human_signal|weekly_reading|weekly_recap|explain_reasoning|plan_handoff_ready|revise_plan_handoff|repeat_plan_handoff|apply_attempt|forgotten_progress_clarify|forgotten_progress_ack|forgotten_progress_blocked|complete_no_change|stop_close|exit_or_cancel|safety","instruction":"string"},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"weekly_adaptive_review_v1","weekly_stage":"string|null","week_strategy":"string|null","last_weekly_question":"string|null","last_visible_summary":"string|null","last_handoff_summary":"string|null","validation_unlock_status":"string|null","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|adjust_plan_item|product_help|normal_coaching|unknown","why":"string|null","constraints":["Weekly did not apply a plan change from chat.","If the user asks to adjust the plan, route to adjust_plan_item as platform_handoff, not execution."]}},"evidence":["string"]}',
  ].join("\n");
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
    weekly_adaptive_review_json:
      input.weekly_state.weekly_adaptive_review ?? null,
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
  switch (args.visibleTask) {
    case "apply_attempt":
      return `Je ne peux pas appliquer ce changement de plan depuis le chat. Reprends-le dans Plan${
        args.handoffSummary ? `: ${args.handoffSummary}` : "."
      }`;
    case "plan_handoff_ready":
    case "repeat_plan_handoff":
    case "revise_plan_handoff":
      return `A reprendre dans Plan: ${
        args.handoffSummary ??
          "la proposition weekly, sans modification appliquee depuis le chat."
      }`;
    case "complete_no_change":
      return "Point weekly termine. Je ne change rien au plan depuis le chat.";
    case "stop_close":
      return "Ok, on laisse le point weekly de cote pour l'instant.";
    case "forgotten_progress_blocked":
      return "Je vois la correction de progression, mais il me manque la cible exacte pour la noter proprement.";
    case "forgotten_progress_ack":
      return "C'est corrige pour la progression oubliee. Je ne modifie pas le plan weekly depuis ce message.";
    case "safety":
      return "";
    default:
      return "Je garde le point weekly actif, mais je n'arrive pas a formuler ce tour correctement. Dis-moi en une phrase ce que tu veux faire avec ce bilan.";
  }
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
  if (reduced.exit_to_global_dispatcher) {
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
        status: "exit_to_global",
        reason_code: reduced.reason_code,
        flow_action: output.flow_action,
        visible_task: reduced.visible_task,
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
  const visibleAgent = args.visibleAgent ?? runWeeklyReviewVisibleAgent;
  const visible = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: visibleTask,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    weekly_state: reduced.weekly_state ?? weeklyState,
    weekly_progress_review: (reduced.weekly_state ?? weeklyState)
      .weekly_progress_review ?? null,
    weekly_adaptive_review: (reduced.weekly_state ?? weeklyState)
      .weekly_adaptive_review ?? null,
    dispatcher_output: output,
    handoff_summary: reduced.handoff_summary,
    committed_effect: progressRuntime?.toolSkillRun?.committed_effects ?? null,
  });
  const content = cleanText(visible) ||
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
      requested_effects: progressRuntime?.toolSkillRun?.requested_effects ?? [],
      allowed_effects: progressRuntime?.toolSkillRun?.allowed_effects ?? [],
      committed_effects: committedEffects,
      blocked_effects: progressRuntime?.toolSkillRun?.blocked_effects ??
        reduced.blocked_effects,
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

import { generateWithGemini } from "../gemini.ts";
import {
  DAILY_ACTION_REVIEW_SOURCE,
  type DailyActionMissingSlot,
  type DailyActionReviewActionIntelligence,
  dailyActionReviewFocusTargets,
  type DailyActionReviewSkillResult,
  type DailyActionReviewState,
  type DailyActionReviewTarget,
  isAppliedDailyOutcome,
  stateFromUnknown,
} from "../daily_action_review.ts";
import type {
  DailyReviewDecision,
  DailyReviewEffectsResult,
  DailyReviewIntent,
  DailyReviewItemUpdate,
  DailyReviewMissingSlot,
  DailyReviewStatus,
} from "./contract.ts";
import { DAILY_REVIEW_DEFAULT_CONSTRAINTS } from "./contract.ts";
import { reduceDailyReviewState } from "./reducer.ts";

export type DailyActionReviewLocalFlowAction =
  | "answer_review"
  | "missing_info"
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_completion_level"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "correction"
  | "revise"
  | "recap_daily_state"
  | "repeat_current_question"
  | "user_stopped"
  | "stop_local_no_handoff"
  | "cancel_flow"
  | "defer_flow"
  | "inline_product_help"
  | "inline_status_recap"
  | "handoff_to_local_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type DailyActionReviewVisibleTaskKind =
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_completion_level"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "recap_daily_state"
  | "repeat_question"
  | "stop_close"
  | "commit_success"
  | "commit_failed"
  | "exit_or_cancel"
  | "safety";

export type DailyActionReviewNoteInformation = {
  source_flow_id: "daily_action_review_v1";
  source_flow_presentation: string;
  source_flow_state_summary: string;
  handoff_reason:
    | "topic_change"
    | "safety"
    | "inline_tool"
    | "bridge"
    | "flow_interruption"
    | "explicit_user_request";
  target_dispatcher:
    | "global"
    | "safety_crisis"
    | "product_help"
    | "status_recap"
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "select_state_potion"
    | "update_coach_preferences"
    | "other_local";
  handoff_context_for_next_dispatcher: string;
  target_local_dispatcher_hint: string | null;
  user_words: string[];
  structured_context: Record<string, unknown>;
  risk_score: number;
  no_chat_mutation: {
    db_write_committed: boolean;
    potion_session_created: boolean;
    scheduled_checkin_created: boolean;
    recurring_reminder_created: boolean;
    executable_confirmation_generated: boolean;
  };
};

export type DailyActionReviewExitMemo = {
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
    skill_id: "daily_action_review_v1";
    targets: unknown[];
    current_daily_state: string | null;
    collected_updates_summary: string | null;
    missing_slots: string[];
    committed_effects: unknown[];
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent:
      | "prepare_attack_card"
      | "prepare_defense_card"
      | "select_state_potion"
      | "update_coach_preferences"
      | "status_recap"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string | null;
    constraints: string[];
  };
  note_information?: DailyActionReviewNoteInformation | null;
};

export type DailyActionReviewConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown> | null;
  handoff_data: Record<string, unknown> | null;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type DailyActionReviewLocalDispatcherOutput = {
  flow_action: DailyActionReviewLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  target_resolution: {
    resolved_occurrence_ids: string[];
    ambiguous: boolean;
    why: string;
  };
  item_updates: Record<string, {
    update_mode: "set" | "revise" | "clear" | "none";
    outcome: "completed" | "partial" | "missed" | "unclear" | null;
    reason_category:
      | "fatigue"
      | "forgot"
      | "external"
      | "too_hard"
      | "not_relevant"
      | "emotional"
      | "no_need"
      | "other"
      | "unclear"
      | "none"
      | null;
    reason_text: string | null;
    still_relevant: boolean | "unknown";
    evidence_text: string | null;
    matched_user_text: string | null;
    confidence: "high" | "medium" | "low";
    missing_slots: DailyReviewMissingSlot[];
  }>;
  daily_intent: {
    kind:
      | "daily_answer"
      | "daily_clarification"
      | "daily_correction"
      | "daily_recap"
      | "stop"
      | "off_topic"
      | "explicit_tool_request"
      | "safety"
      | "unclear";
    summary: string;
  };
  state_updates: {
    status_hint:
      | "collecting"
      | "needs_clarification"
      | "complete"
      | "stopped"
      | "blocked";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: DailyActionReviewVisibleTaskKind;
    instruction: string;
    conversation_context: DailyActionReviewConversationContext;
  };
  note_information: DailyActionReviewNoteInformation | null;
  exit_memo: DailyActionReviewExitMemo;
  evidence: string[];
};

export type DailyActionReviewLocalFlowResult = DailyActionReviewSkillResult & {
  dispatcherOutput: DailyActionReviewLocalDispatcherOutput;
  exitToGlobalDispatcher: boolean;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  let cleaned = cleanText(raw);
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("daily_action_review_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("daily_action_review_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "low" || value === "medium"
    ? value
    : "medium";
}

function boundedRiskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function nullableString(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "null" ? text : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function flowAction(value: unknown): DailyActionReviewLocalFlowAction {
  const raw = cleanText(value);
  return [
      "answer_review",
      "missing_info",
      "clarify_which_action",
      "clarify_outcome",
      "clarify_completion_level",
      "clarify_reason",
      "clarify_still_relevant",
      "correction",
      "revise",
      "recap_daily_state",
      "repeat_current_question",
      "user_stopped",
      "stop_local_no_handoff",
      "cancel_flow",
      "defer_flow",
      "inline_product_help",
      "inline_status_recap",
      "handoff_to_local_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as DailyActionReviewLocalFlowAction
    : "clarify_outcome";
}

function visibleTaskKind(value: unknown): DailyActionReviewVisibleTaskKind {
  const raw = cleanText(value);
  return [
      "clarify_which_action",
      "clarify_outcome",
      "clarify_completion_level",
      "clarify_reason",
      "clarify_still_relevant",
      "recap_daily_state",
      "repeat_question",
      "stop_close",
      "commit_success",
      "commit_failed",
      "exit_or_cancel",
      "safety",
    ].includes(raw)
    ? raw as DailyActionReviewVisibleTaskKind
    : "clarify_outcome";
}

function reasonCategory(
  value: unknown,
): DailyActionReviewLocalDispatcherOutput["item_updates"][string][
  "reason_category"
] {
  const raw = cleanText(value);
  return [
      "fatigue",
      "forgot",
      "external",
      "too_hard",
      "not_relevant",
      "emotional",
      "no_need",
      "other",
      "unclear",
      "none",
    ].includes(raw)
    ? raw as NonNullable<
      DailyActionReviewLocalDispatcherOutput["item_updates"][string][
        "reason_category"
      ]
    >
    : null;
}

function outcome(
  value: unknown,
): DailyActionReviewLocalDispatcherOutput["item_updates"][string]["outcome"] {
  const raw = cleanText(value);
  return raw === "completed" || raw === "partial" || raw === "missed" ||
      raw === "unclear"
    ? raw
    : null;
}

function missingSlots(value: unknown): DailyReviewMissingSlot[] {
  const allowed = new Set([
    "outcome",
    "reason",
    "still_relevant",
    "which_action",
    "completion_level",
  ]);
  return stringArray(value).filter((slot) =>
    allowed.has(slot)
  ) as DailyReviewMissingSlot[];
}

function statusFromHint(
  value: unknown,
  action: DailyActionReviewLocalFlowAction,
): DailyReviewStatus {
  if (
    action === "user_stopped" || action === "stop_local_no_handoff" ||
    action === "cancel_flow" || action === "defer_flow"
  ) return "stopped";
  if (action === "safety_preempt") return "stopped";
  const raw = cleanText(value);
  if (raw === "complete" || raw === "collecting" || raw === "stopped") {
    return raw;
  }
  return "needs_clarification";
}

function intentFromAction(
  action: DailyActionReviewLocalFlowAction,
): DailyReviewIntent {
  if (action === "answer_review") return "answer_review";
  if (action === "clarify_reason") return "clarify_reason";
  if (action === "clarify_still_relevant") return "clarify_still_relevant";
  if (
    action === "missing_info" ||
    action === "clarify_outcome" || action === "clarify_which_action" ||
    action === "clarify_completion_level" ||
    action === "repeat_current_question"
  ) return "clarify_outcome";
  if (action === "correction" || action === "revise") return "correction";
  if (action === "recap_daily_state") return "recap";
  if (
    action === "user_stopped" || action === "stop_local_no_handoff" ||
    action === "cancel_flow" || action === "defer_flow"
  ) return "user_stopped";
  if (action === "safety_preempt") return "safety";
  if (
    action === "exit_to_global_dispatcher" ||
    action === "handoff_to_local_flow" ||
    action === "inline_product_help" ||
    action === "inline_status_recap"
  ) return "off_topic";
  return "unclear";
}

function normalizeExitMemo(
  raw: unknown,
  action: DailyActionReviewLocalFlowAction,
): DailyActionReviewExitMemo {
  const root = recordOrEmpty(raw);
  const local = recordOrEmpty(root.local_flow_context);
  const handoff = recordOrEmpty(root.handoff_hint_for_global_dispatcher);
  const needs = action === "exit_to_global_dispatcher" ||
    action === "safety_preempt" || action === "handoff_to_local_flow" ||
    action === "inline_product_help" || action === "inline_status_recap";
  const memo: DailyActionReviewExitMemo = {
    needed: needs,
    reason: [
        "topic_change",
        "explicit_tool_request",
        "product_help",
        "status_question",
        "preference_update",
        "normal_coaching",
        "safety",
        "unknown",
        "none",
      ].includes(cleanText(root.reason))
      ? cleanText(root.reason) as DailyActionReviewExitMemo["reason"]
      : needs
      ? action === "safety_preempt" ? "safety" : "unknown"
      : "none",
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "daily_action_review_v1",
      targets: Array.isArray(local.targets) ? local.targets.slice(0, 8) : [],
      current_daily_state: nullableString(local.current_daily_state),
      collected_updates_summary: nullableString(
        local.collected_updates_summary,
      ),
      missing_slots: stringArray(local.missing_slots).slice(0, 12),
      committed_effects: Array.isArray(local.committed_effects)
        ? local.committed_effects.slice(0, 8)
        : [],
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: [
          "prepare_attack_card",
          "prepare_defense_card",
          "select_state_potion",
          "update_coach_preferences",
          "status_recap",
          "product_help",
          "normal_coaching",
          "unknown",
        ].includes(cleanText(handoff.likely_intent))
        ? cleanText(handoff.likely_intent) as DailyActionReviewExitMemo[
          "handoff_hint_for_global_dispatcher"
        ]["likely_intent"]
        : "unknown",
      why: nullableString(handoff.why),
      constraints: stringArray(handoff.constraints).slice(0, 8),
    },
  };
  memo.note_information = normalizeDailyActionReviewNoteInformation({
    raw: root.note_information,
    action,
    exitMemo: memo,
  });
  return memo;
}

function targetDispatcherForDailyAction(params: {
  action: DailyActionReviewLocalFlowAction;
  reason: DailyActionReviewExitMemo["reason"];
  likelyIntent: DailyActionReviewExitMemo["handoff_hint_for_global_dispatcher"][
    "likely_intent"
  ];
}): DailyActionReviewNoteInformation["target_dispatcher"] {
  if (params.action === "safety_preempt" || params.reason === "safety") {
    return "safety_crisis";
  }
  if (
    params.action === "inline_product_help" || params.reason === "product_help"
  ) {
    return "product_help";
  }
  if (
    params.action === "inline_status_recap" ||
    params.reason === "status_question"
  ) {
    return "status_recap";
  }
  if (params.action === "handoff_to_local_flow") {
    if (params.likelyIntent === "prepare_attack_card") {
      return "prepare_attack_card";
    }
    if (params.likelyIntent === "prepare_defense_card") {
      return "prepare_defense_card";
    }
    if (params.likelyIntent === "select_state_potion") {
      return "select_state_potion";
    }
    if (params.likelyIntent === "update_coach_preferences") {
      return "update_coach_preferences";
    }
    return "other_local";
  }
  return "global";
}

function handoffReasonForDailyAction(params: {
  action: DailyActionReviewLocalFlowAction;
  reason: DailyActionReviewExitMemo["reason"];
}): DailyActionReviewNoteInformation["handoff_reason"] {
  if (params.action === "safety_preempt" || params.reason === "safety") {
    return "safety";
  }
  if (
    params.action === "inline_product_help" ||
    params.action === "inline_status_recap"
  ) return "inline_tool";
  if (params.action === "handoff_to_local_flow") return "bridge";
  if (
    params.reason === "explicit_tool_request" ||
    params.reason === "product_help" ||
    params.reason === "status_question" ||
    params.reason === "preference_update"
  ) return "explicit_user_request";
  return "topic_change";
}

function normalizeDailyActionReviewNoteInformation(params: {
  raw: unknown;
  action: DailyActionReviewLocalFlowAction;
  exitMemo: DailyActionReviewExitMemo;
}): DailyActionReviewNoteInformation | null {
  const needs = params.exitMemo.needed || params.action === "safety_preempt";
  if (!needs) return null;
  const root = recordOrEmpty(params.raw);
  const targetDispatcher = targetDispatcherForDailyAction({
    action: params.action,
    reason: params.exitMemo.reason,
    likelyIntent: params.exitMemo.handoff_hint_for_global_dispatcher
      .likely_intent,
  });
  const structuredContext = recordOrEmpty(root.structured_context);
  const fallbackStructuredContext = {
    source_flow: "daily_action_review_v1",
    user_intent_summary: params.exitMemo.user_intent_summary,
    local_flow_context: params.exitMemo.local_flow_context,
    handoff_hint_for_global_dispatcher:
      params.exitMemo.handoff_hint_for_global_dispatcher,
  };
  const sourceSummary = cleanText(root.source_flow_state_summary) ||
    params.exitMemo.local_flow_context.current_daily_state ||
    params.exitMemo.local_flow_context.collected_updates_summary ||
    params.exitMemo.user_intent_summary ||
    "Daily action review exited before completing the current collection.";
  const contextForNext = cleanText(root.handoff_context_for_next_dispatcher) ||
    JSON.stringify(fallbackStructuredContext);
  return {
    source_flow_id: "daily_action_review_v1",
    source_flow_presentation: cleanText(root.source_flow_presentation) ||
      "Collects daily evidence for one or two targeted actions. It may commit a daily review entry only after reducer/executor validation.",
    source_flow_state_summary: sourceSummary,
    handoff_reason: handoffReasonForDailyAction({
      action: params.action,
      reason: params.exitMemo.reason,
    }),
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: contextForNext,
    target_local_dispatcher_hint: nullableString(
      root.target_local_dispatcher_hint,
    ) ||
      (targetDispatcher === "safety_crisis"
        ? "Safety owns the next turn; daily_action_review must not continue or commit."
        : targetDispatcher !== "global"
        ? "Run the target local dispatcher with this note as source context."
        : null),
    user_words: stringArray(root.user_words).length
      ? stringArray(root.user_words).slice(0, 4)
      : params.exitMemo.user_intent_summary
      ? [params.exitMemo.user_intent_summary]
      : [],
    structured_context: Object.keys(structuredContext).length
      ? structuredContext
      : fallbackStructuredContext,
    risk_score: boundedRiskScore(root.risk_score),
    no_chat_mutation: {
      db_write_committed: false,
      potion_session_created: false,
      scheduled_checkin_created: false,
      recurring_reminder_created: false,
      executable_confirmation_generated: false,
    },
  };
}

function targetSummary(
  target: DailyActionReviewTarget,
): Record<string, unknown> {
  return {
    occurrence_id: target.occurrence_id,
    plan_item_id: target.plan_item_id,
    title: target.title,
    dimension: target.dimension ?? null,
    kind: target.kind ?? null,
    planned_day: target.planned_day ?? null,
    week_start_date: target.week_start_date ?? null,
    reviewed_local_date: (target as any).reviewed_local_date ?? null,
  };
}

function stateSummaryForConversation(
  state: DailyActionReviewState,
  targets: DailyActionReviewTarget[],
): string {
  const parts = targets.map((target) => {
    const item = state.items[target.occurrence_id];
    const outcome = cleanText(item?.outcome) || "unknown";
    const missing = Array.isArray(item?.missing_slots)
      ? item.missing_slots.join(",")
      : "";
    return `${target.title}: outcome=${outcome}${
      missing ? ` missing=${missing}` : ""
    }`;
  });
  return parts.length ? parts.join(" | ") : `Daily status=${state.status}`;
}

function normalizeConversationContext(
  raw: unknown,
): Partial<DailyActionReviewConversationContext> {
  const root = recordOrEmpty(raw);
  return {
    state_summary: cleanText(root.state_summary),
    user_words: stringArray(root.user_words).slice(0, 4),
    field_or_stage: nullableString(root.field_or_stage),
    known_values: recordOrEmpty(root.known_values),
    missing_or_weak_values: stringArray(root.missing_or_weak_values).slice(
      0,
      8,
    ),
    selected_candidate: Object.keys(recordOrEmpty(root.selected_candidate))
        .length
      ? recordOrEmpty(root.selected_candidate)
      : null,
    handoff_data: Object.keys(recordOrEmpty(root.handoff_data)).length
      ? recordOrEmpty(root.handoff_data)
      : null,
    tone_constraints: stringArray(root.tone_constraints).slice(0, 8),
    do_not_say: stringArray(root.do_not_say).slice(0, 10),
    context_summary: nullableString(root.context_summary),
    evidence_used: stringArray(root.evidence_used).slice(0, 8),
  };
}

function buildDailyActionReviewConversationContext(params: {
  kind: DailyActionReviewVisibleTaskKind;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  committedEffects?: DailyReviewEffectsResult["committed_effects"];
  failedEffects?: DailyReviewEffectsResult["failed_effects"];
  currentDailyQuestion?: string | null;
}): DailyActionReviewConversationContext {
  const outputContext = normalizeConversationContext(
    params.dispatcherOutput?.visible_task.conversation_context,
  );
  const targetIds =
    params.dispatcherOutput?.target_resolution.resolved_occurrence_ids.length
      ? params.dispatcherOutput.target_resolution.resolved_occurrence_ids
      : params.state.next_question_targets.length
      ? params.state.next_question_targets
      : params.state.current_focus_occurrence_ids;
  const currentTargets = params.targets.filter((target) =>
    targetIds.includes(target.occurrence_id)
  );
  const selectedTargets = currentTargets.length
    ? currentTargets
    : dailyActionReviewFocusTargets(params.targets, params.state);
  const missingValues = [
    ...new Set(
      selectedTargets.flatMap((target) => {
        const item = params.state.items[target.occurrence_id];
        return Array.isArray(item?.missing_slots) ? item.missing_slots : [];
      }),
    ),
  ];
  const itemValues = Object.fromEntries(
    selectedTargets.map((target) => {
      const item = params.state.items[target.occurrence_id] ?? {};
      return [
        target.occurrence_id,
        {
          title: target.title,
          outcome: item.outcome ?? null,
          reason_category: item.reason_category ?? null,
          reason_text: item.reason_text ?? null,
          still_relevant: item.still_relevant ?? "unknown",
          evidence_text: item.evidence_text ?? null,
          confidence: item.confidence ?? "low",
          missing_slots: item.missing_slots ?? [],
        },
      ];
    }),
  );
  const base: DailyActionReviewConversationContext = {
    state_summary: outputContext.state_summary ||
      stateSummaryForConversation(params.state, params.targets),
    user_words: outputContext.user_words?.length
      ? outputContext.user_words
      : params.dispatcherOutput?.daily_intent.summary
      ? [params.dispatcherOutput.daily_intent.summary]
      : [],
    field_or_stage: outputContext.field_or_stage || params.kind,
    known_values: Object.keys(outputContext.known_values ?? {}).length
      ? outputContext.known_values ?? {}
      : {
        status: params.state.status,
        targets: selectedTargets.map(targetSummary),
        items: itemValues,
        current_daily_question: params.currentDailyQuestion ??
          params.state.next_question ?? null,
        committed_effects: params.committedEffects ?? [],
        failed_effects: params.failedEffects ?? [],
      },
    missing_or_weak_values: outputContext.missing_or_weak_values?.length
      ? outputContext.missing_or_weak_values
      : missingValues,
    selected_candidate: outputContext.selected_candidate ??
      (selectedTargets[0] ? targetSummary(selectedTargets[0]) : null),
    handoff_data: outputContext.handoff_data ??
      (params.dispatcherOutput?.note_information
        ? {
          note_information: params.dispatcherOutput.note_information,
        }
        : null),
    tone_constraints: outputContext.tone_constraints?.length
      ? outputContext.tone_constraints
      : ["short", "non_judgmental", "one_main_question_max"],
    do_not_say: outputContext.do_not_say?.length ? outputContext.do_not_say : [
      "do not mention dispatcher, reducer, JSON, flow, prompt, or commit",
      "do not propose cards, potions, reminders, plan changes, or coaching",
      "do not say noted/registered unless committed_effects are provided",
    ],
    context_summary: outputContext.context_summary ||
      params.dispatcherOutput?.daily_intent.summary ||
      null,
    evidence_used: outputContext.evidence_used?.length
      ? outputContext.evidence_used
      : params.dispatcherOutput?.evidence ?? [],
  };
  return base;
}

export function sanitizeDailyActionReviewLocalDispatcherOutput(params: {
  raw: unknown;
  targets: DailyActionReviewTarget[];
}): DailyActionReviewLocalDispatcherOutput {
  const root = parseJsonObject(params.raw);
  const action = flowAction(root.flow_action);
  const targetIds = new Set(
    params.targets.map((target) => target.occurrence_id),
  );
  const targetResolution =
    root.target_resolution && typeof root.target_resolution === "object"
      ? root.target_resolution as Record<string, unknown>
      : {};
  const rawUpdates = root.item_updates && typeof root.item_updates === "object"
    ? root.item_updates as Record<string, unknown>
    : {};
  const itemUpdates: DailyActionReviewLocalDispatcherOutput["item_updates"] =
    {};
  for (const [occurrenceId, value] of Object.entries(rawUpdates)) {
    if (!targetIds.has(occurrenceId)) continue;
    const update = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const mode = cleanText(update.update_mode);
    itemUpdates[occurrenceId] = {
      update_mode: mode === "revise" || mode === "clear" || mode === "none"
        ? mode
        : "set",
      outcome: outcome(update.outcome),
      reason_category: reasonCategory(update.reason_category),
      reason_text: nullableString(update.reason_text),
      still_relevant: update.still_relevant === true ||
          update.still_relevant === false
        ? update.still_relevant
        : "unknown",
      evidence_text: nullableString(update.evidence_text),
      matched_user_text: nullableString(update.matched_user_text),
      confidence: confidence(update.confidence),
      missing_slots: missingSlots(update.missing_slots),
    };
  }
  const visible = root.visible_task && typeof root.visible_task === "object"
    ? root.visible_task as Record<string, unknown>
    : {};
  const stateUpdates =
    root.state_updates && typeof root.state_updates === "object"
      ? root.state_updates as Record<string, unknown>
      : {};
  const dailyIntent = root.daily_intent && typeof root.daily_intent === "object"
    ? root.daily_intent as Record<string, unknown>
    : {};

  const exitMemo = normalizeExitMemo(root.exit_memo, action);
  const visibleConversationContext = normalizeConversationContext(
    visible.conversation_context,
  );
  const normalized: DailyActionReviewLocalDispatcherOutput = {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: boundedRiskScore(root.risk_score),
    target_resolution: {
      resolved_occurrence_ids: stringArray(
        targetResolution.resolved_occurrence_ids,
      ).filter((id) => targetIds.has(id)),
      ambiguous: targetResolution.ambiguous === true,
      why: cleanText(targetResolution.why),
    },
    item_updates: itemUpdates,
    daily_intent: {
      kind: [
          "daily_answer",
          "daily_clarification",
          "daily_correction",
          "daily_recap",
          "stop",
          "off_topic",
          "explicit_tool_request",
          "safety",
          "unclear",
        ].includes(cleanText(dailyIntent.kind))
        ? cleanText(dailyIntent.kind) as DailyActionReviewLocalDispatcherOutput[
          "daily_intent"
        ]["kind"]
        : "unclear",
      summary: cleanText(dailyIntent.summary),
    },
    state_updates: {
      status_hint: [
          "collecting",
          "needs_clarification",
          "complete",
          "stopped",
          "blocked",
        ].includes(cleanText(stateUpdates.status_hint))
        ? cleanText(
          stateUpdates.status_hint,
        ) as DailyActionReviewLocalDispatcherOutput[
          "state_updates"
        ]["status_hint"]
        : "collecting",
      turn_count_increment: Number.isFinite(
          Number(stateUpdates.turn_count_increment),
        )
        ? Math.max(0, Math.min(3, Number(stateUpdates.turn_count_increment)))
        : 1,
      close_after_visible: stateUpdates.close_after_visible === true,
    },
    visible_task: {
      kind: visibleTaskKind(visible.kind),
      instruction: cleanText(visible.instruction),
      conversation_context: {
        state_summary: visibleConversationContext.state_summary || "",
        user_words: visibleConversationContext.user_words ?? [],
        field_or_stage: visibleConversationContext.field_or_stage ?? null,
        known_values: visibleConversationContext.known_values ?? {},
        missing_or_weak_values:
          visibleConversationContext.missing_or_weak_values ?? [],
        selected_candidate: visibleConversationContext.selected_candidate ??
          null,
        handoff_data: visibleConversationContext.handoff_data ?? null,
        tone_constraints: visibleConversationContext.tone_constraints ?? [],
        do_not_say: visibleConversationContext.do_not_say ?? [],
        context_summary: visibleConversationContext.context_summary ?? null,
        evidence_used: visibleConversationContext.evidence_used ?? [],
      },
    },
    note_information: exitMemo.note_information ?? null,
    exit_memo: exitMemo,
    evidence: stringArray(root.evidence).slice(0, 8),
  };
  return normalized;
}

function updateFromDispatcherItem(
  update: DailyActionReviewLocalDispatcherOutput["item_updates"][string],
): DailyReviewItemUpdate {
  if (update.update_mode === "clear") {
    return {
      outcome: null,
      reason_category: null,
      reason_text: null,
      still_relevant: "unknown",
      evidence_text: null,
      matched_user_text: null,
      confidence: "low",
      missing_slots: ["outcome"],
    };
  }
  const appliedOutcome = update.outcome;
  return {
    outcome: appliedOutcome,
    reason_category: update.reason_category ??
      (appliedOutcome === "completed" ? "none" : null),
    reason_text: update.reason_text,
    still_relevant: appliedOutcome === "missed"
      ? update.still_relevant
      : "unknown",
    evidence_text: update.evidence_text,
    matched_user_text: update.matched_user_text,
    confidence: update.confidence,
    missing_slots: update.missing_slots,
  };
}

export function dailyReviewDecisionFromLocalDispatcher(params: {
  output: DailyActionReviewLocalDispatcherOutput;
  state: DailyActionReviewState;
  targets: DailyActionReviewTarget[];
}): DailyReviewDecision {
  const targetIds = new Set(
    params.targets.map((target) => target.occurrence_id),
  );
  const item_updates: Record<string, DailyReviewItemUpdate> = {};
  for (
    const [occurrenceId, update] of Object.entries(
      params.output.item_updates,
    )
  ) {
    if (!targetIds.has(occurrenceId) || update.update_mode === "none") continue;
    item_updates[occurrenceId] = updateFromDispatcherItem(update);
  }
  const target_occurrence_ids =
    params.output.target_resolution.resolved_occurrence_ids.length > 0
      ? params.output.target_resolution.resolved_occurrence_ids
      : params.state.current_focus_occurrence_ids;
  const status = statusFromHint(
    params.output.state_updates.status_hint,
    params.output.flow_action,
  );
  return {
    skill_id: "daily_action_review_v1",
    intent: intentFromAction(params.output.flow_action),
    status,
    target_occurrence_ids,
    item_updates,
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    next_question: null,
    next_question_targets: target_occurrence_ids,
    generated_user_message: null,
    should_apply_effects: false,
    stop_reason: params.output.flow_action === "safety_preempt"
      ? "safety"
      : params.output.flow_action === "user_stopped" ||
          params.output.flow_action === "stop_local_no_handoff" ||
          params.output.flow_action === "cancel_flow" ||
          params.output.flow_action === "defer_flow"
      ? "user_stopped"
      : null,
    effect_plan: { allowed: false, effects: [] },
  };
}

function resultFromState(
  state: DailyActionReviewState,
): DailyActionReviewSkillResult {
  const missingOccurrenceIds = Object.values(state.items)
    .filter((item) =>
      !isAppliedDailyOutcome(item.outcome) || item.missing_slots.length > 0
    )
    .map((item) => item.occurrence_id);
  const stillRelevantByOccurrenceId: Record<string, boolean | null> = {};
  for (const item of Object.values(state.items)) {
    stillRelevantByOccurrenceId[item.occurrence_id] =
      item.still_relevant === "unknown" ? null : item.still_relevant;
  }
  return {
    state,
    missingOccurrenceIds,
    stillRelevantByOccurrenceId,
    nextQuestion: state.next_question,
    generatedUserMessage: state.generated_user_message,
    shouldApplyEffects: state.should_apply_effects,
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow daily_action_review_v1.",
    "Sophia a envoye une question daily sur une ou deux actions ciblees. Le user vient de repondre.",
    "Le daily collecte une preuve du jour: action faite, faite en partie, ou manquee.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "",
    "Actions possibles: answer_review, missing_info, clarify_which_action, clarify_outcome, clarify_completion_level, clarify_reason, clarify_still_relevant, correction, revise, recap_daily_state, repeat_current_question, user_stopped, stop_local_no_handoff, cancel_flow, defer_flow, inline_product_help, inline_status_recap, handoff_to_local_flow, exit_to_global_dispatcher, safety_preempt.",
    "",
    "Regles:",
    "- Ne fais aucune regex metier et ne decide pas par mot-cle isole.",
    "- Analyse la reponse par rapport aux targets daily.",
    "- Le selector a deja choisi les actions. Tu ne changes pas la liste de targets.",
    "- Si deux targets sont presentes et que le user dit seulement qu'il l'a fait, ne devine pas: clarify_which_action.",
    "- Si le user dit qu'il a fait les deux, mets a jour les deux targets.",
    "- Pour completed, reason_category peut etre none.",
    "- Pour partial, il faut une evidence de ce qui a ete fait et une raison si necessaire pour comprendre le partiel.",
    "- Pour missed, il faut une raison et savoir si l'action reste pertinente.",
    "- Ne propose pas de solution, carte, potion ou ajustement pendant la collecte.",
    "- Si le user veut seulement arreter/refuser le daily sans nouveau sujet: stop_local_no_handoff, cancel_flow ou defer_flow. Pas de global.",
    "- Si le user change clairement de sujet sans dispatcher local cible: exit_to_global_dispatcher avec note_information.",
    "- Si le user demande une carte, potion, preference ou autre flow local clair: handoff_to_local_flow avec note_information.",
    "- Si le user pose une question produit ou status temporaire: inline_product_help ou inline_status_recap avec note_information.",
    "- Si safety est present: safety_preempt avec note_information.target_dispatcher=safety_crisis.",
    "- Ne dis jamais que quelque chose est note ou enregistre.",
    "- Le commit sera decide uniquement par le reducer/executor.",
    "- visible_task.conversation_context doit contenir uniquement le contexte filtre utile au prompt visible, jamais un dump DB ou memoire brute.",
    "- note_information est obligatoire pour exit_to_global_dispatcher, handoff_to_local_flow, inline_product_help, inline_status_recap et safety_preempt.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Elle doit refleter le message actuel, pas seulement l'etat precedent. Utilise answer_review pour une reponse daily exploitable, les clarify_* pour les slots daily manquants, recap_daily_state pour un recap du daily courant, repeat_current_question pour redire la question, stop_local_no_handoff/cancel_flow/defer_flow pour arret local sans nouveau sujet, exit_to_global_dispatcher pour nouveau sujet global clair, handoff_to_local_flow pour autre flow local clair, inline_product_help/inline_status_recap pour question temporaire produit/status, safety_preempt pour safety.",
    "- confidence: high si l'intention et les targets sont claires; medium si probable mais incomplete; low si clarification ou prudence necessaire. Ne gonfle pas la confiance pour masquer une ambiguite.",
    "- risk_score: score de risque utile au flow. 0 si pas de risque. Ne fabrique pas de safety; si le message contient un vrai signal safety, utilise safety_preempt et une note_information vers safety_crisis.",
    "- target_resolution: decrit uniquement quelles occurrences daily le message permet de relier. resolved_occurrence_ids contient seulement des occurrence_id des targets. ambiguous=true quand le user parle d'une action sans dire laquelle. why explique le raisonnement semantique court.",
    "- item_updates: etat metier local propose au reducer, par occurrence_id connu seulement. Mets update_mode=none ou laisse l'objet absent si aucune valeur metier n'est stabilisee. Ne transforme jamais une hypothese en fait. Pour partial/missed, renseigne les missing_slots restants au lieu d'inventer une raison ou un niveau.",
    "- item_updates.outcome: completed, partial ou missed seulement si le message le supporte. unclear ou null si le slot outcome reste ouvert.",
    "- item_updates.reason_category/reason_text: none/null pour completed sauf si le user donne spontanement un contexte utile; pour partial ou missed, renseigne la raison seulement si elle est dite ou clairement proche, sinon missing_slots inclut reason.",
    "- item_updates.still_relevant: true/false seulement si le user le dit ou si la pertinence est evidente dans son message; unknown sinon, surtout pour missed.",
    "- item_updates.evidence_text/matched_user_text: evidence courte tiree des mots du user. Pas de pseudo-preuves, pas de resume invente.",
    "- daily_intent: classification locale du message. daily_answer/daily_clarification/daily_correction/daily_recap restent dans le flow. stop reste local. off_topic ou explicit_tool_request doit mener a exit/handoff/inline selon le contrat. safety doit mener a safety_preempt.",
    "- state_updates: status_hint aide le reducer. collecting si le flow continue, needs_clarification si un slot manque, complete si les updates suffisent au commit, stopped si arret local, blocked si safety ou transition bloque le daily. turn_count_increment vaut normalement 1; close_after_visible=true seulement pour stop/cancel/defer local.",
    "- visible_task.kind: stage visible exact. Evite un stage generique si un stage precis existe. Pour stop/cancel/defer utilise stop_close. Pour exit ou handoff utilise exit_or_cancel. Pour safety utilise safety. Pour une reponse complete, le reducer/executor peut finir; ne promets pas toi-meme un commit visible.",
    "- visible_task.instruction: consigne courte pour le prompt visible stage-specific; jamais une reponse visible complete.",
    "- visible_task.conversation_context: seul contexte que l'agent visible pourra utiliser. Inclure state_summary, user_words, field_or_stage, known_values, missing_or_weak_values, selected_candidate, tone_constraints, do_not_say et evidence_used utiles. Ne jamais y mettre DB brute, memoire brute, note_information brute ou decision a refaire.",
    "- note_information: null pour continuation daily et stop_local_no_handoff. Obligatoire pour exit_to_global_dispatcher, handoff_to_local_flow, inline_product_help, inline_status_recap et safety_preempt. Elle est consommee par le dispatcher cible et ne doit jamais etre un message visible.",
    "- exit_memo: needed=false pour continuation daily et stop local. needed=true pour exit/handoff/inline/safety. Remplis reason, user_intent_summary, local_flow_context et handoff_hint_for_global_dispatcher avec l'etat daily acquis, les slots non resolus et les contraintes no-chat-mutation.",
    "- evidence: indices semantiques reellement utilises pour la decision. Court, lie aux mots du user ou a l'etat daily. Pas de pseudo-preuve.",
    "",
    "Transition rules:",
    "- stop_local_no_handoff/cancel_flow/defer_flow: le user veut arreter ou repousser le daily sans nouveau sujet clair. Pas de note_information, pas de dispatcher global sur ce tour, visible_task.kind=stop_close.",
    "- exit_to_global_dispatcher: le user change clairement de sujet vers coaching general ou demande non locale. note_information obligatoire, target_dispatcher=global.",
    "- safety_preempt: safety prioritaire. note_information obligatoire, target_dispatcher=safety_crisis, aucune continuation daily.",
    "- handoff_to_local_flow: seulement si le message cible clairement un flow local autorise par ce contrat: prepare_attack_card, prepare_defense_card, select_state_potion ou update_coach_preferences. note_information obligatoire.",
    "- inline_product_help/inline_status_recap: seulement pour une question produit/status temporaire; note_information obligatoire et le daily ne doit pas perdre son etat.",
    "- Anti-faux-positif exit: si le user repond encore au daily, meme avec hesitation ou nuance, reste dans le daily et clarifie au lieu de sortir.",
    "",
    "Exemples JSON non visibles (decision structuree seulement):",
    '{"flow_action":"answer_review","confidence":"high","risk_score":0,"target_resolution":{"resolved_occurrence_ids":["occ-1"],"ambiguous":false,"why":"Single target and user reports doing it."},"item_updates":{"occ-1":{"update_mode":"set","outcome":"completed","reason_category":"none","reason_text":null,"still_relevant":true,"evidence_text":"je l ai fait 20 minutes","matched_user_text":"Oui, je l ai fait 20 minutes.","confidence":"high","missing_slots":[]}},"daily_intent":{"kind":"daily_answer","summary":"User completed the selected action."},"state_updates":{"status_hint":"complete","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"commit_success","instruction":"Let reducer/executor handle commit before visible confirmation.","conversation_context":{"state_summary":"Selected action appears completed.","user_words":["Oui, je l ai fait 20 minutes."],"field_or_stage":"commit_success","known_values":{"occurrence_id":"occ-1","outcome":"completed"},"missing_or_weak_values":[],"selected_candidate":{"occurrence_id":"occ-1"},"handoff_data":null,"tone_constraints":["short"],"do_not_say":["noted before commit"],"context_summary":"Daily answer complete for one target.","evidence_used":["je l ai fait 20 minutes"]}},"note_information":null,"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":{"skill_id":"daily_action_review_v1","targets":[],"current_daily_state":"complete","collected_updates_summary":"completed occ-1","missing_slots":[],"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":null,"constraints":[]}},"evidence":["single target completed"]}',
    '{"flow_action":"safety_preempt","confidence":"high","risk_score":8,"target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false,"why":"Safety concern overrides daily collection."},"item_updates":{},"daily_intent":{"kind":"safety","summary":"User signals immediate self-harm risk."},"state_updates":{"status_hint":"blocked","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"safety","instruction":"Do not continue daily; hand off to safety.","conversation_context":{"state_summary":"Safety preempts daily review.","user_words":["je risque de me faire du mal"],"field_or_stage":"safety","known_values":{},"missing_or_weak_values":[],"selected_candidate":null,"handoff_data":{"target_dispatcher":"safety_crisis"},"tone_constraints":["calm","direct"],"do_not_say":["daily recap","commit"],"context_summary":"Daily paused because safety owns the next turn.","evidence_used":["je risque de me faire du mal"]}},"note_information":{"source_flow_id":"daily_action_review_v1","source_flow_presentation":"Daily review collects evidence for targeted actions.","source_flow_state_summary":"Daily interrupted by safety signal before commit.","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Safety owns next turn; daily review did not commit anything.","target_local_dispatcher_hint":"Safety owns the next turn; daily_action_review must not continue or commit.","user_words":["je risque de me faire du mal"],"structured_context":{"source_flow":"daily_action_review_v1","committed_effects":[]},"risk_score":8,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"exit_memo":{"needed":true,"reason":"safety","user_intent_summary":"User signals immediate self-harm risk.","local_flow_context":{"skill_id":"daily_action_review_v1","targets":[],"current_daily_state":"blocked","collected_updates_summary":null,"missing_slots":[],"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":"Safety dispatcher must own the next turn.","constraints":["Daily has not mutated anything unless committed_effects is non-empty."]}},"evidence":["self-harm risk words"]}',
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_review|missing_info|clarify_which_action|clarify_outcome|clarify_completion_level|clarify_reason|clarify_still_relevant|correction|revise|recap_daily_state|repeat_current_question|user_stopped|stop_local_no_handoff|cancel_flow|defer_flow|inline_product_help|inline_status_recap|handoff_to_local_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false,"why":"string"},"item_updates":{"occurrence_id":{"update_mode":"set|revise|clear|none","outcome":"completed|partial|missed|unclear|null","reason_category":"fatigue|forgot|external|too_hard|not_relevant|emotional|no_need|other|unclear|none|null","reason_text":"string|null","still_relevant":true,"evidence_text":"string|null","matched_user_text":"string|null","confidence":"high|medium|low","missing_slots":["outcome|reason|still_relevant|which_action|completion_level"]}},"daily_intent":{"kind":"daily_answer|daily_clarification|daily_correction|daily_recap|stop|off_topic|explicit_tool_request|safety|unclear","summary":"string"},"state_updates":{"status_hint":"collecting|needs_clarification|complete|stopped|blocked","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"clarify_which_action|clarify_outcome|clarify_completion_level|clarify_reason|clarify_still_relevant|recap_daily_state|repeat_question|stop_close|commit_success|commit_failed|exit_or_cancel|safety","instruction":"string","conversation_context":{"state_summary":"string","user_words":[],"field_or_stage":"string|null","known_values":{},"missing_or_weak_values":[],"selected_candidate":{},"handoff_data":{},"tone_constraints":[],"do_not_say":[],"context_summary":"string|null","evidence_used":[]}},"note_information":{"source_flow_id":"daily_action_review_v1","source_flow_presentation":"string","source_flow_state_summary":"string","handoff_reason":"topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request","target_dispatcher":"global|safety_crisis|product_help|status_recap|prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|other_local","handoff_context_for_next_dispatcher":"string","target_local_dispatcher_hint":"string|null","user_words":[],"structured_context":{},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"potion_session_created":false,"scheduled_checkin_created":false,"recurring_reminder_created":false,"executable_confirmation_generated":false}},"exit_memo":{"needed":true,"reason":"topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"daily_action_review_v1","targets":[],"current_daily_state":"string|null","collected_updates_summary":"string|null","missing_slots":[],"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|product_help|normal_coaching|unknown","why":"string|null","constraints":["Do not mark daily as completed unless daily_action_review later commits an entry.","Daily has not mutated anything unless committed_effects is non-empty."]}},"evidence":["string"]}',
  ].join("\n");
}

function dispatcherUserPrompt(params: {
  userMessage: string;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  recentMessages?: Array<{ role: string; content: string }>;
  noteInformationInbound?: Record<string, unknown> | null;
  dbContextPack?: Record<string, unknown> | null;
  microMemoryContext?: Record<string, unknown> | null;
  platformContext?: Record<string, unknown> | null;
}) {
  const focusTargets = dailyActionReviewFocusTargets(
    params.targets,
    params.state,
  );
  return JSON.stringify({
    current_user_message: params.userMessage,
    recent_messages: (params.recentMessages ?? []).slice(-8),
    active_flow_state: params.state,
    note_information_inbound: params.noteInformationInbound ?? null,
    db_context_pack: params.dbContextPack ?? {
      source: "daily_action_review.pending_payload",
      freshness: "current_pending",
      confidence: "high",
      targets: focusTargets,
    },
    micro_memory_context: params.microMemoryContext ?? {
      items: [],
      exclusions: ["No raw memory loaded for this turn."],
      budget: {
        max_items: 4,
        reason: "Daily review only needs action-linked memory if present.",
      },
    },
    platform_context: params.platformContext ?? {
      channel: "whatsapp",
    },
    risk_context: {},
    available_inline_tools: ["product_help", "status_recap"],
    parent_flow_context: null,
    timezone: String((params.dbContextPack as any)?.timezone ?? ""),
    channel: String((params.platformContext as any)?.channel ?? "whatsapp"),
  });
}

export async function runDailyActionReviewLocalDispatcher(params: {
  text: string;
  targets: DailyActionReviewTarget[];
  previousState?: unknown;
  actionIntelligenceByOccurrenceId?: Record<
    string,
    DailyActionReviewActionIntelligence
  >;
  recentMessages?: Array<{ role: string; content: string }>;
  noteInformationInbound?: Record<string, unknown> | null;
  dbContextPack?: Record<string, unknown> | null;
  microMemoryContext?: Record<string, unknown> | null;
  platformContext?: Record<string, unknown> | null;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewLocalDispatcherOutput> {
  const state = stateFromUnknown(
    params.previousState ?? {
      action_intelligence_by_occurrence_id:
        params.actionIntelligenceByOccurrenceId,
    },
    params.targets,
  );
  const systemPrompt = dispatcherSystemPrompt();
  const userPrompt = dispatcherUserPrompt({
    userMessage: params.text,
    targets: params.targets,
    state,
    recentMessages: params.recentMessages,
    noteInformationInbound: params.noteInformationInbound,
    dbContextPack: params.dbContextPack,
    microMemoryContext: params.microMemoryContext,
    platformContext: params.platformContext,
  });
  const raw = params.llmRunner
    ? await params.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        source: "daily_action_review.local_dispatcher",
        model: "gemini-3-flash-preview",
        forceRealAi: true,
        userId: params.userId,
      },
    );
  return sanitizeDailyActionReviewLocalDispatcherOutput({
    raw,
    targets: params.targets,
  });
}

function visiblePromptLines(kind: DailyActionReviewVisibleTaskKind): string {
  const common = [
    "Tu ecris un message visible Sophia pour daily_action_review_v1.",
    "Tu recois uniquement visible_task.conversation_context.",
    "Tu n'as pas le droit de remplir un champ metier, choisir une route, appeler un outil, lire la DB brute ou lire la memoire brute.",
    "Utilise seulement conversation_context pour formuler le message.",
    "Retourne uniquement le message visible, sans JSON, sans guillemets englobants.",
    "Une question principale max quand tu poses une question.",
    "Ne propose pas de solution, carte, potion, rappel ou ajustement.",
    "Ne culpabilise pas.",
    "Ne parle pas de dispatcher, reducer, commit, JSON, prompt ou flow.",
  ];
  const byKind: Record<DailyActionReviewVisibleTaskKind, string[]> = {
    clarify_which_action: [
      "Stage: clarify_which_action.",
      "La reponse est ambigue avec plusieurs actions. Demande de quelle action le user parle.",
      "Cite seulement les targets presentes dans conversation_context.known_values.targets.",
      "Ne marque rien comme fait.",
    ],
    clarify_outcome: [
      "Stage: clarify_outcome.",
      "On ne sait pas si l'action est faite, faite en partie, ou manquee.",
      "Clarifie seulement l'outcome. Ne demande pas encore une raison.",
    ],
    clarify_completion_level: [
      "Stage: clarify_completion_level.",
      "Le user indique du partiel mais pas assez ce qui a ete fait.",
      "Demande ce qui a ete fait ou quel niveau de completion est juste, factuellement.",
    ],
    clarify_reason: [
      "Stage: clarify_reason.",
      "L'action est faite en partie ou manquee, mais la raison manque ou reste trop floue.",
      "Demande une raison utile pour le bilan, sans jugement et sans explication longue.",
    ],
    clarify_still_relevant: [
      "Stage: clarify_still_relevant.",
      "Une action est manquee et il faut savoir si elle reste pertinente.",
      "Demande si elle reste pertinente. Ne propose pas de report ou de modification de plan.",
    ],
    recap_daily_state: [
      "Stage: recap_daily_state.",
      "Le user demande le recap de ce qui est compris dans ce daily.",
      "Ne fais pas un status DB global. Ne dis pas enregistre si conversation_context ne contient pas committed_effects.",
    ],
    repeat_question: [
      "Stage: repeat_question.",
      "Le user demande de redire la question daily courante.",
      "Redonne la question depuis conversation_context.known_values.current_daily_question, simplement, sans coaching.",
    ],
    stop_close: [
      "Stage: stop_close.",
      "Le user demande d'arreter le daily ou refuse la collecte.",
      "Ferme sans commit, sans question finale, sans proposer autre chose. Reponse courte.",
    ],
    commit_success: [
      "Stage: commit_success.",
      "Le writer DB a produit des committed_effects dans conversation_context.known_values.committed_effects.",
      "Tu peux dire que c'est note seulement pour ces effets. Reste court.",
    ],
    commit_failed: [
      "Stage: commit_failed.",
      "Le writer DB n'a pas tout commit.",
      "Ne dis pas que tout est note. Si une partie est commit, dis-le prudemment. Reste clair et court.",
    ],
    exit_or_cancel: [
      "Stage: exit_or_cancel.",
      "Le runtime ferme localement sans seconde passe globale.",
      "Ferme proprement sans commit et sans proposer autre chose.",
    ],
    safety: [
      "Stage: safety_transition.",
      "Signal safety. Ne continue pas le daily.",
      "Reste minimal, sans conseil clinique. N'essaie pas de resoudre le daily.",
    ],
  };
  return [...common, ...byKind[kind]].join("\n");
}

function visibleSystemPrompt(kind: DailyActionReviewVisibleTaskKind): string {
  return visiblePromptLines(kind);
}

export function sanitizeDailyActionReviewVisibleText(
  raw: unknown,
): string | null {
  let text = cleanText(raw);
  if (!text || text === "null") return null;
  const parsed = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (typeof parsed === "string") {
    text = cleanText(parsed);
  } else if (
    parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>).message === "string"
  ) {
    text = cleanText((parsed as Record<string, unknown>).message);
  }
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    const inner = text.slice(1, -1).trim();
    if (inner) text = inner;
  }
  return text || null;
}

export async function runDailyActionReviewVisibleAgent(params: {
  kind: DailyActionReviewVisibleTaskKind;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  committedEffects?: DailyReviewEffectsResult["committed_effects"];
  failedEffects?: DailyReviewEffectsResult["failed_effects"];
  currentDailyQuestion?: string | null;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<string | null> {
  const systemPrompt = visibleSystemPrompt(params.kind);
  const conversationContext = buildDailyActionReviewConversationContext({
    kind: params.kind,
    targets: params.targets,
    state: params.state,
    dispatcherOutput: params.dispatcherOutput,
    committedEffects: params.committedEffects,
    failedEffects: params.failedEffects,
    currentDailyQuestion: params.currentDailyQuestion,
  });
  const userPrompt = JSON.stringify({
    visible_task: {
      ...(params.dispatcherOutput?.visible_task ?? {
        kind: params.kind,
        instruction: "",
      }),
      kind: params.kind,
      conversation_context: conversationContext,
    },
  });
  const raw = params.llmRunner
    ? await params.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.2,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        source: `daily_action_review.visible.${params.kind}`,
        model: "gemini-3-flash-preview",
        forceRealAi: true,
        userId: params.userId,
      },
    );
  return sanitizeDailyActionReviewVisibleText(raw);
}

export async function runDailyActionReviewLocalFlow(params: {
  text: string;
  targets: DailyActionReviewTarget[];
  previousState?: unknown;
  recentMessages?: Array<{ role: string; content: string }>;
  noteInformationInbound?: Record<string, unknown> | null;
  dbContextPack?: Record<string, unknown> | null;
  microMemoryContext?: Record<string, unknown> | null;
  platformContext?: Record<string, unknown> | null;
  requestId?: string;
  userId?: string;
  dispatcherRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
  visibleRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewLocalFlowResult> {
  const previousState = stateFromUnknown(params.previousState, params.targets);
  const dispatcherOutput = await runDailyActionReviewLocalDispatcher({
    text: params.text,
    targets: params.targets,
    previousState,
    recentMessages: params.recentMessages,
    noteInformationInbound: params.noteInformationInbound,
    dbContextPack: params.dbContextPack,
    microMemoryContext: params.microMemoryContext,
    platformContext: params.platformContext,
    requestId: params.requestId,
    userId: params.userId,
    llmRunner: params.dispatcherRunner,
  });
  const decision = dailyReviewDecisionFromLocalDispatcher({
    output: dispatcherOutput,
    state: previousState,
    targets: params.targets,
  });
  const nextState = reduceDailyReviewState(
    previousState,
    decision,
    params.targets,
  );
  nextState.intent = decision.intent;
  nextState.last_user_text = params.text;
  const transfersOwnership =
    dispatcherOutput.flow_action === "exit_to_global_dispatcher" ||
    dispatcherOutput.flow_action === "handoff_to_local_flow" ||
    dispatcherOutput.flow_action === "inline_product_help" ||
    dispatcherOutput.flow_action === "inline_status_recap" ||
    dispatcherOutput.flow_action === "safety_preempt";
  const localStop = dispatcherOutput.flow_action === "user_stopped" ||
    dispatcherOutput.flow_action === "stop_local_no_handoff" ||
    dispatcherOutput.flow_action === "cancel_flow" ||
    dispatcherOutput.flow_action === "defer_flow";
  const shouldRenderBeforeCommit = !transfersOwnership &&
    (!nextState.should_apply_effects ||
      dispatcherOutput.flow_action === "recap_daily_state" ||
      dispatcherOutput.flow_action === "repeat_current_question" ||
      localStop);
  if (shouldRenderBeforeCommit) {
    const visible = await runDailyActionReviewVisibleAgent({
      kind: dispatcherOutput.visible_task.kind,
      targets: params.targets,
      state: nextState,
      dispatcherOutput,
      currentDailyQuestion: previousState.next_question,
      requestId: params.requestId,
      userId: params.userId,
      llmRunner: params.visibleRunner,
    });
    nextState.generated_user_message = visible;
    nextState.next_question = nextState.status === "needs_clarification"
      ? visible
      : null;
  }
  return {
    ...resultFromState(nextState),
    dispatcherOutput,
    exitToGlobalDispatcher:
      dispatcherOutput.flow_action === "exit_to_global_dispatcher" ||
      dispatcherOutput.flow_action === "handoff_to_local_flow" ||
      dispatcherOutput.flow_action === "inline_product_help" ||
      dispatcherOutput.flow_action === "inline_status_recap" ||
      dispatcherOutput.flow_action === "safety_preempt",
  };
}

export function buildDailyActionReviewLastExitMemo(params: {
  output: DailyActionReviewLocalDispatcherOutput;
  at?: string;
}): Record<string, unknown> {
  return {
    ...params.output.exit_memo,
    at: params.at ?? new Date().toISOString(),
    flow_summary: params.output.daily_intent.summary || null,
    handoff_hint_for_global_dispatcher:
      params.output.exit_memo.handoff_hint_for_global_dispatcher,
  };
}

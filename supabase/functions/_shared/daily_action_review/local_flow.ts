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
  DailyReviewStateMutationAudit,
  DailyReviewStatus,
} from "./contract.ts";
import { DAILY_REVIEW_DEFAULT_CONSTRAINTS } from "./contract.ts";
import { reduceDailyReviewState } from "./reducer.ts";
import {
  dailyTargetsToActiveActionCandidates,
  directEffectLocalDispatcherPromptLines,
  directEffectTimeContextFromUnknown,
  withDirectEffectLocalContext,
} from "../../sophia-brain/router/direct_effect_local_context.ts";
import {
  LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
  localOneShotDirectEffectPromptLines,
  type LocalOneShotDirectEffectRequest,
  normalizeLocalOneShotDirectEffectRequest,
} from "../../sophia-brain/router/one_shot_local_direct_effect.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../sophia-brain/router/response_style_policy.ts";
import {
  dailyActionReviewVisibleAgentSpec,
  dailyActionReviewVisibleSystemPrompt,
} from "./visible_agents.ts";
import type {
  LocalChildFlowHandoff,
  LocalChildFlowReturnToParent,
} from "../local_child_flow_handoff.ts";
import type {
  DailyActionCoachingHandoffContext,
} from "../../sophia-brain/skills/daily_action_coaching_recommendation/contract.ts";

export type DailyActionReviewLocalFlowAction =
  | "answer_review"
  | "missing_info"
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "explain_target"
  | "correction"
  | "revise"
  | "recap_daily_state"
  | "clarify_daily_question"
  | "handoff_to_child_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type DailyActionReviewVisibleTaskKind =
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "explain_target"
  | "recap_daily_state"
  | "clarify_daily_question"
  | "commit_success";

export type DailyActionReviewNoteInformation = {
  source_flow_id: "daily_action_review_v1";
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
    | "coaching_recommendation"
    | "product_help";
  handoff_context_for_next_dispatcher: string;
  user_words: string[];
  structured_context: Record<string, unknown>;
  confidence?: "low" | "medium" | "high";
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
      | "coaching_recommendation"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string | null;
  };
  note_information?: DailyActionReviewNoteInformation | null;
};

export type DailyActionReviewConversationContext = {
  state_summary: string;
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown> | null;
  handoff_data: Record<string, unknown> | null;
  affect_context: DailyActionReviewAffectContext;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type DailyActionReviewAffectContext = {
  emotional_intensity: "none" | "low" | "medium" | "high";
  fragile_signal: boolean;
  suggested_tone:
    | "neutral"
    | "gentle"
    | "supportive_investigate"
    | "calm";
  evidence: string[];
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
      | "action_question"
      | "daily_correction"
      | "daily_recap"
      | "stop"
      | "off_topic"
      | "explicit_tool_request"
      | "safety"
      | "unclear";
    summary: string;
  };
  direct_effect_request: LocalOneShotDirectEffectRequest;
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
  child_flow: "daily_action_coaching_recommendation_v1" | null;
  return_to_parent: LocalChildFlowReturnToParent | null;
  child_flow_context: DailyActionCoachingHandoffContext | null;
  note_information: DailyActionReviewNoteInformation | null;
  exit_memo: DailyActionReviewExitMemo;
  state_change_intent: {
    modified_fields: string[];
    clear_fields: string[];
  };
  evidence: string[];
};

export type DailyActionReviewLocalFlowResult = DailyActionReviewSkillResult & {
  dispatcherOutput: DailyActionReviewLocalDispatcherOutput;
  exitToGlobalDispatcher: boolean;
  childFlowHandoff: LocalChildFlowHandoff | null;
  stateMutationAudit?: DailyReviewStateMutationAudit;
  diagnosis: {
    flow_action: DailyActionReviewLocalFlowAction;
    visible_task: DailyActionReviewVisibleTaskKind;
    selected_targets: string[];
    pending_state_present: boolean;
    direct_handoff_flag: boolean;
    candidate_summary: Array<{
      occurrence_id: string;
      plan_item_id: string;
      title: string;
    }>;
    stabilization_ready: boolean;
    blocked_effects: unknown[];
    state_mutation_audit?: DailyReviewStateMutationAudit;
  };
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

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
}

function legacyToken(...parts: string[]): string {
  return parts.join("_");
}

function flowAction(value: unknown): DailyActionReviewLocalFlowAction {
  const raw = cleanText(value);
  if (
    raw === legacyToken("handoff", "to", "local", "flow") ||
    raw === legacyToken("inline", "status", "recap") ||
    raw === "inline_product_help" ||
    raw === "user_stopped" ||
    raw === "cancel_flow" ||
    raw === "defer_flow"
  ) {
    return "exit_to_global_dispatcher";
  }
  if (raw === "clarify_completion_level") return "clarify_outcome";
  if (raw === "repeat_current_question") return "clarify_daily_question";
  return [
      "answer_review",
      "missing_info",
      "clarify_which_action",
      "clarify_outcome",
      "clarify_reason",
      "clarify_still_relevant",
      "explain_target",
      "correction",
      "revise",
      "recap_daily_state",
      "clarify_daily_question",
      "handoff_to_child_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as DailyActionReviewLocalFlowAction
    : "clarify_outcome";
}

function visibleTaskKind(value: unknown): DailyActionReviewVisibleTaskKind {
  const raw = cleanText(value);
  if (raw === "clarify_completion_level") return "clarify_outcome";
  if (raw === "repeat_question") return "clarify_daily_question";
  return [
      "clarify_which_action",
      "clarify_outcome",
      "clarify_reason",
      "clarify_still_relevant",
      "explain_target",
      "recap_daily_state",
      "clarify_daily_question",
      "commit_success",
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
  if (raw === "partial") return "completed";
  return raw === "completed" || raw === "missed" ||
      raw === "unclear"
    ? raw
    : null;
}

function missingSlots(
  value: unknown,
  normalizedOutcome?: DailyActionReviewLocalDispatcherOutput["item_updates"][
    string
  ]["outcome"],
): DailyReviewMissingSlot[] {
  if (normalizedOutcome === "completed") return [];
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

function affectContext(
  value: unknown,
): DailyActionReviewAffectContext | null {
  const root = recordOrEmpty(value);
  if (!Object.keys(root).length) return null;
  const intensity = cleanText(root.emotional_intensity);
  const tone = cleanText(root.suggested_tone);
  return {
    emotional_intensity:
      intensity === "low" || intensity === "medium" || intensity === "high" ||
        intensity === "none"
        ? intensity
        : "none",
    fragile_signal: root.fragile_signal === true,
    suggested_tone: tone === "gentle" || tone === "supportive_investigate" ||
        tone === "calm" || tone === "neutral"
      ? tone
      : "neutral",
    evidence: stringArray(root.evidence).slice(0, 6),
  };
}

function uniqueStringArray(values: string[], max = 12): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function declaredStateChangeIntent(value: unknown): {
  modified_fields: string[];
  clear_fields: string[];
} {
  const raw = recordOrEmpty(value);
  return {
    modified_fields: stringArray(raw.modified_fields).slice(0, 16),
    clear_fields: stringArray(raw.clear_fields).slice(0, 16),
  };
}

function statusFromHint(
  value: unknown,
  action: DailyActionReviewLocalFlowAction,
): DailyReviewStatus {
  if (action === "explain_target") return "needs_clarification";
  if (action === "safety_preempt") return "stopped";
  if (action === "handoff_to_child_flow") return "collecting";
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
    action === "explain_target" ||
    action === "clarify_daily_question"
  ) return "clarify_outcome";
  if (action === "correction" || action === "revise") return "correction";
  if (action === "recap_daily_state") return "recap";
  if (action === "safety_preempt") return "safety";
  if (
    action === "exit_to_global_dispatcher" || action === "handoff_to_child_flow"
  ) return "off_topic";
  return "unclear";
}

function normalizeExitMemo(
  raw: unknown,
  action: DailyActionReviewLocalFlowAction,
  targets: DailyActionReviewTarget[],
  rawNoteInformation?: unknown,
): DailyActionReviewExitMemo {
  const root = recordOrEmpty(raw);
  const local = recordOrEmpty(root.local_flow_context);
  const handoff = recordOrEmpty(root.handoff_hint_for_global_dispatcher);
  const needs = action === "exit_to_global_dispatcher" ||
    action === "safety_preempt";
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
          "product_help",
          "coaching_recommendation",
          "normal_coaching",
          "unknown",
        ].includes(cleanText(handoff.likely_intent))
        ? cleanText(handoff.likely_intent) as DailyActionReviewExitMemo[
          "handoff_hint_for_global_dispatcher"
        ]["likely_intent"]
        : "unknown",
      why: nullableString(handoff.why),
    },
  };
  memo.note_information = normalizeDailyActionReviewNoteInformation({
    raw: root.note_information ?? rawNoteInformation,
    action,
    exitMemo: memo,
    targets,
  });
  if (memo.note_information?.target_dispatcher === "coaching_recommendation") {
    memo.handoff_hint_for_global_dispatcher = {
      ...memo.handoff_hint_for_global_dispatcher,
      likely_intent: "coaching_recommendation",
    };
  }
  return memo;
}

function targetDispatcherForDailyAction(params: {
  action: DailyActionReviewLocalFlowAction;
  reason: DailyActionReviewExitMemo["reason"];
  likelyIntent: DailyActionReviewExitMemo["handoff_hint_for_global_dispatcher"][
    "likely_intent"
  ];
  rawTargetDispatcher?: unknown;
}): DailyActionReviewNoteInformation["target_dispatcher"] {
  if (params.action === "safety_preempt" || params.reason === "safety") {
    return "safety_crisis";
  }
  if (cleanText(params.rawTargetDispatcher) === "coaching_recommendation") {
    return "coaching_recommendation";
  }
  if (params.likelyIntent === "coaching_recommendation") {
    return "coaching_recommendation";
  }
  return "global";
}

function confidenceNumberFromBand(
  confidence: "low" | "medium" | "high",
): number {
  if (confidence === "high") return 0.86;
  if (confidence === "medium") return 0.68;
  return 0.45;
}

function targetForDailyCoachingBridge(
  raw: unknown,
  targets: DailyActionReviewTarget[],
): DailyActionReviewTarget | null {
  const root = recordOrEmpty(raw);
  const context = recordOrEmpty(root.structured_context);
  const actionContext = recordOrEmpty(context.action_context);
  const ids = [
    actionContext.occurrence_id,
    context.occurrence_id,
    context.target_occurrence_id,
    ...(Array.isArray(context.resolved_occurrence_ids)
      ? context.resolved_occurrence_ids
      : []),
  ].map((value) => cleanText(value)).filter(Boolean);
  const selected = targets.find((target) =>
    ids.includes(target.occurrence_id) || ids.includes(target.plan_item_id)
  );
  return selected ?? targets[0] ?? null;
}

function returnToDailyAfterCoaching(): LocalChildFlowReturnToParent {
  return {
    parent_flow_id: "daily_action_review_v1",
    return_focus: "resume_daily_after_action_coaching",
    preserve_parent_state: true,
  };
}

function actionTypeFromTarget(
  target: DailyActionReviewTarget,
): DailyActionCoachingHandoffContext["action_context"]["action_type"] {
  if (target.kind === "habit" || target.dimension === "habits") {
    return "habit";
  }
  if (target.kind === "task" || target.dimension === "missions") {
    return "mission";
  }
  if (target.kind === "framework" || target.dimension === "clarifications") {
    return "clarification";
  }
  return "other";
}

function dailyActionCoachingContextFromTarget(params: {
  target: DailyActionReviewTarget;
  stateItem?: DailyActionReviewState["items"][string] | null;
  confidence: "low" | "medium" | "high";
  helpRequestSummary: string;
  affectContext?: Record<string, unknown> | null;
}): DailyActionCoachingHandoffContext {
  const item = params.stateItem ?? null;
  return {
    source_flow_id: "daily_action_review_v1",
    parent_flow_id: "daily_action_review_v1",
    return_focus: "resume_daily_after_action_coaching",
    action_context: {
      occurrence_id: params.target.occurrence_id,
      plan_item_id: params.target.plan_item_id,
      plan_id: params.target.plan_id || null,
      title: params.target.title,
      description: cleanText(params.target.description) || null,
      action_type: actionTypeFromTarget(params.target),
      outcome: item?.outcome === "completed" || item?.outcome === "missed"
        ? item.outcome
        : null,
      reason_category: cleanText(item?.reason_category) || null,
      reason_text: cleanText(item?.reason_text) || null,
    },
    help_request_summary: params.helpRequestSummary ||
      "User asks for help succeeding with this daily action.",
    affect_context: params.affectContext ?? null,
    confidence: confidenceNumberFromBand(params.confidence),
  };
}

function normalizedDailyChildFlowContext(params: {
  root: Record<string, unknown>;
  action: DailyActionReviewLocalFlowAction;
  exitMemo: DailyActionReviewExitMemo;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  confidence: "low" | "medium" | "high";
}): DailyActionCoachingHandoffContext | null {
  if (params.action !== "handoff_to_child_flow") return null;
  const rawContext = recordOrEmpty(params.root.child_flow_context);
  const actionContext = recordOrEmpty(rawContext.action_context);
  const requestedIds = [
    actionContext.occurrence_id,
    actionContext.plan_item_id,
    params.root.target_resolution &&
    recordOrEmpty(params.root.target_resolution).resolved_occurrence_ids,
  ].flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => cleanText(value))
    .filter(Boolean);
  const selectedTarget = requestedIds.length > 0
    ? params.targets.find((target) =>
      requestedIds.includes(target.occurrence_id) ||
      requestedIds.includes(target.plan_item_id)
    ) ?? null
    : targetForDailyCoachingBridge(params.root.note_information ?? params.root, params.targets);
  if (!selectedTarget) return null;
  const userIntentSummary = params.exitMemo.user_intent_summary ||
    cleanText(rawContext.help_request_summary) ||
    cleanText(rawContext.reason) ||
    cleanText(
      recordOrEmpty(params.root.note_information)
        .handoff_context_for_next_dispatcher,
    ) ||
    "Daily action review detected a coaching recommendation need.";
  return dailyActionCoachingContextFromTarget({
    target: selectedTarget,
    stateItem: params.state.items[selectedTarget.occurrence_id] ?? null,
    confidence: params.confidence,
    helpRequestSummary: userIntentSummary,
    affectContext: recordOrEmpty(
      recordOrEmpty(params.root.visible_task).conversation_context,
    ).affect_context as Record<string, unknown> | null,
  });
}

function handoffReasonForDailyAction(params: {
  action: DailyActionReviewLocalFlowAction;
  reason: DailyActionReviewExitMemo["reason"];
}): DailyActionReviewNoteInformation["handoff_reason"] {
  if (params.action === "safety_preempt" || params.reason === "safety") {
    return "safety";
  }
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
  targets: DailyActionReviewTarget[];
}): DailyActionReviewNoteInformation | null {
  const needs = params.exitMemo.needed || params.action === "safety_preempt";
  if (!needs) return null;
  const root = recordOrEmpty(params.raw);
  const targetDispatcher = targetDispatcherForDailyAction({
    action: params.action,
    reason: params.exitMemo.reason,
    likelyIntent: params.exitMemo.handoff_hint_for_global_dispatcher
      .likely_intent,
    rawTargetDispatcher: root.target_dispatcher,
  });
  const structuredContext = withoutLegacyPayloadFields(
    recordOrEmpty(root.structured_context),
  );
  const fallbackStructuredContext = {
    source_flow: "daily_action_review_v1",
    user_intent_summary: params.exitMemo.user_intent_summary,
    local_flow_context: params.exitMemo.local_flow_context,
    handoff_hint_for_global_dispatcher:
      params.exitMemo.handoff_hint_for_global_dispatcher,
  };
  const contextForNext = cleanText(root.handoff_context_for_next_dispatcher) ||
    JSON.stringify(fallbackStructuredContext);
  return {
    source_flow_id: "daily_action_review_v1",
    handoff_reason: handoffReasonForDailyAction({
      action: params.action,
      reason: params.exitMemo.reason,
    }),
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: contextForNext,
    user_words: params.exitMemo.user_intent_summary
      ? [params.exitMemo.user_intent_summary]
      : [],
    structured_context: Object.keys(structuredContext).length
      ? structuredContext
      : fallbackStructuredContext,
    confidence: cleanText(root.confidence) === "low" ||
        cleanText(root.confidence) === "medium" ||
        cleanText(root.confidence) === "high"
      ? cleanText(root.confidence) as "low" | "medium" | "high"
      : undefined,
  };
}

function targetSummary(
  target: DailyActionReviewTarget,
): Record<string, unknown> {
  return {
    occurrence_id: target.occurrence_id,
    plan_item_id: target.plan_item_id,
    title: target.title,
    description: target.description ?? null,
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

function compactActionIntelligenceForVisible(
  intelligence: DailyActionReviewActionIntelligence | undefined,
): Record<string, unknown> | null {
  if (!intelligence) return null;
  return {
    recent_observations: intelligence.recent_observations.slice(0, 2),
    recurring_patterns: intelligence.recurring_patterns.slice(0, 2),
    last_weekly_interpretation: intelligence.last_weekly_interpretation,
    freshness_summary: intelligence.freshness_summary,
    suggested_tone: intelligence.suggested_tone,
    risk_of_overcoaching: intelligence.risk_of_overcoaching,
  };
}

function affectContextFromSignals(params: {
  outputContext: Partial<DailyActionReviewConversationContext>;
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  state: DailyActionReviewState;
  selectedTargets: DailyActionReviewTarget[];
}): DailyActionReviewAffectContext {
  const explicitAffect = params.outputContext.affect_context;
  if (
    explicitAffect &&
    (explicitAffect.fragile_signal ||
      explicitAffect.emotional_intensity !== "none" ||
      explicitAffect.suggested_tone !== "neutral" ||
      explicitAffect.evidence.length > 0)
  ) {
    return explicitAffect;
  }
  const selectedIds = params.selectedTargets.map((target) =>
    target.occurrence_id
  );
  const selectedItems = selectedIds.map((id) => params.state.items[id])
    .filter(Boolean);
  const selectedIntelligence = selectedIds.map((id) =>
    params.state.action_intelligence_by_occurrence_id[id]
  ).filter(Boolean);
  const evidence = uniqueStringArray([
    ...selectedItems.flatMap((item) =>
      item?.reason_category === "emotional"
        ? [item.reason_text || "reason_category=emotional"]
        : []
    ),
    ...selectedIntelligence.flatMap((item) => [
      ...item.recurring_patterns.slice(0, 2),
      ...item.recent_observations.slice(0, 2),
      item.risk_of_overcoaching !== "low"
        ? `overcoaching=${item.risk_of_overcoaching}`
        : "",
      item.suggested_tone !== "neutral" ? `tone=${item.suggested_tone}` : "",
    ]),
    ...(params.dispatcherOutput?.risk_score
      ? [`risk_score=${params.dispatcherOutput.risk_score}`]
      : []),
  ], 6);
  const hasEmotionalReason = selectedItems.some((item) =>
    item?.reason_category === "emotional"
  );
  const hasSupportTone = selectedIntelligence.some((item) =>
    item.suggested_tone === "gentle" ||
    item.suggested_tone === "supportive_investigate"
  );
  const hasOvercoachingRisk = selectedIntelligence.some((item) =>
    item.risk_of_overcoaching === "medium" ||
    item.risk_of_overcoaching === "high"
  );
  const riskScore = params.dispatcherOutput?.risk_score ?? 0;
  const emotionalIntensity: DailyActionReviewAffectContext[
    "emotional_intensity"
  ] = riskScore >= 7 ||
      selectedIntelligence.some((item) => item.risk_of_overcoaching === "high")
    ? "high"
    : hasEmotionalReason || hasOvercoachingRisk || riskScore >= 4
    ? "medium"
    : hasSupportTone || riskScore > 0
    ? "low"
    : "none";
  const suggestedTone: DailyActionReviewAffectContext["suggested_tone"] =
    emotionalIntensity === "high"
      ? "calm"
      : selectedIntelligence.some((item) =>
          item.suggested_tone === "supportive_investigate"
        )
      ? "supportive_investigate"
      : emotionalIntensity === "medium" || emotionalIntensity === "low"
      ? "gentle"
      : "neutral";
  return {
    emotional_intensity: emotionalIntensity,
    fragile_signal: emotionalIntensity === "medium" ||
      emotionalIntensity === "high",
    suggested_tone: suggestedTone,
    evidence,
  };
}

function toneConstraintsForVisible(params: {
  outputConstraints: string[];
  affect: DailyActionReviewAffectContext;
}): string[] {
  const base = params.outputConstraints.length
    ? params.outputConstraints
    : ["short", "non_judgmental", "one_main_question_max"];
  const affectConstraints = params.affect.fragile_signal
    ? ["gentle", "low_pressure", "emotionally_safe"]
    : params.affect.suggested_tone === "supportive_investigate"
    ? ["supportive_investigate", "low_pressure"]
    : params.affect.suggested_tone === "gentle"
    ? ["gentle", "low_pressure"]
    : [];
  return uniqueStringArray([...base, ...affectConstraints], 10);
}

function normalizeConversationContext(
  raw: unknown,
): Partial<DailyActionReviewConversationContext> {
  const root = recordOrEmpty(raw);
  return {
    state_summary: cleanText(root.state_summary),
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
    affect_context: affectContext(root.affect_context) ?? undefined,
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
  const resolvedIds =
    params.dispatcherOutput?.target_resolution.resolved_occurrence_ids ?? [];
  const targetIds = (params.kind === "clarify_outcome" ||
      params.kind === "clarify_reason" ||
      params.kind === "clarify_still_relevant" ||
      params.kind === "clarify_daily_question") &&
      params.state.next_question_targets.length
    ? params.state.next_question_targets
    : resolvedIds.length
    ? resolvedIds
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
  const actionIntelligence = Object.fromEntries(
    selectedTargets.flatMap((target) => {
      const intelligence = compactActionIntelligenceForVisible(
        params.state.action_intelligence_by_occurrence_id[
          target.occurrence_id
        ],
      );
      return intelligence ? [[target.occurrence_id, intelligence]] : [];
    }),
  );
  const commitSummary = buildVisibleCommitSummary({
    kind: params.kind,
    targets: params.targets,
    state: params.state,
    committedEffects: params.committedEffects ?? [],
  });
  const recentCollectedUpdate = recentCollectedUpdateForVisible({
    dispatcherOutput: params.dispatcherOutput,
    targets: params.targets,
  });
  const computedKnownValues = {
    status: params.state.status,
    targets: selectedTargets.map(targetSummary),
    items: itemValues,
    action_intelligence_by_occurrence_id: actionIntelligence,
    current_daily_question: params.currentDailyQuestion ??
      params.state.next_question ?? null,
    committed_effects: params.committedEffects ?? [],
    failed_effects: params.failedEffects ?? [],
    commit_summary: commitSummary,
    recent_collected_update: recentCollectedUpdate,
  };
  const outputKnownValues = outputContext.known_values ?? {};
  const mergedKnownValues = Object.keys(outputKnownValues).length
    ? { ...computedKnownValues, ...outputKnownValues }
    : computedKnownValues;
  const runtimeOwnedKnownValues = {
    ...mergedKnownValues,
    committed_effects: params.committedEffects ?? [],
    failed_effects: params.failedEffects ?? [],
    commit_summary: commitSummary,
    recent_collected_update: recentCollectedUpdate,
  };
  const affect = affectContextFromSignals({
    outputContext,
    dispatcherOutput: params.dispatcherOutput,
    state: params.state,
    selectedTargets,
  });
  const base: DailyActionReviewConversationContext = {
    state_summary: outputContext.state_summary ||
      stateSummaryForConversation(params.state, params.targets),
    field_or_stage: outputContext.field_or_stage || params.kind,
    known_values: runtimeOwnedKnownValues,
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
    affect_context: affect,
    tone_constraints: toneConstraintsForVisible({
      outputConstraints: outputContext.tone_constraints ?? [],
      affect,
    }),
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

function recentCollectedUpdateForVisible(params: {
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  targets: DailyActionReviewTarget[];
}): Record<string, unknown> | null {
  const updates = Object.entries(params.dispatcherOutput?.item_updates ?? {})
    .filter(([, update]) =>
      update?.update_mode === "set" || update?.update_mode === "revise"
    )
    .filter(([, update]) =>
      update?.outcome === "completed" || update?.outcome === "missed"
    );
  if (!updates.length) return null;
  const [occurrenceId, update] = updates[updates.length - 1];
  const target = params.targets.find((item) =>
    item.occurrence_id === occurrenceId
  );
  return {
    occurrence_id: occurrenceId,
    title: target?.title ?? null,
    outcome: update.outcome,
    reason_category: update.reason_category ?? null,
    reason_text: update.reason_text ?? null,
    transition_hint: update.outcome === "missed"
      ? "acknowledge_briefly_then_continue_daily"
      : "continue_daily",
  };
}

function buildVisibleCommitSummary(params: {
  kind: DailyActionReviewVisibleTaskKind;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  committedEffects: DailyReviewEffectsResult["committed_effects"];
}): Record<string, unknown> {
  const occurrenceIds = new Set<string>();
  const planItemIds = new Set<string>();
  for (const effect of params.committedEffects) {
    const occurrenceId = cleanText(effect.occurrence_id);
    const planItemId = cleanText(effect.plan_item_id);
    if (occurrenceId) occurrenceIds.add(occurrenceId);
    if (planItemId) planItemIds.add(planItemId);
  }
  const committedTargets = params.targets.filter((target) =>
    occurrenceIds.has(target.occurrence_id) ||
    planItemIds.has(target.plan_item_id)
  );
  const committedTargetIds = new Set(
    committedTargets.map((target) => target.occurrence_id),
  );
  for (const occurrenceId of occurrenceIds) {
    if (occurrenceId) committedTargetIds.add(occurrenceId);
  }
  const planIds = new Set(
    committedTargets
      .map((target) => cleanText(target.plan_id))
      .filter(Boolean),
  );
  const committedTargetsCount = committedTargetIds.size;
  return {
    committed_effects_count: params.committedEffects.length,
    committed_targets_count: committedTargetsCount,
    plans_count: planIds.size,
    is_multi_target_commit: committedTargetsCount > 1 ||
      params.committedEffects.length > 1,
    is_final_daily_commit: params.kind === "commit_success" &&
      params.committedEffects.length > 0 &&
      params.state.status === "complete",
  };
}

export function sanitizeDailyActionReviewLocalDispatcherOutput(params: {
  raw: unknown;
  targets: DailyActionReviewTarget[];
  state?: DailyActionReviewState;
}): DailyActionReviewLocalDispatcherOutput {
  const root = parseJsonObject(params.raw);
  let action = flowAction(root.flow_action);
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
    const normalizedOutcome = outcome(update.outcome);
    itemUpdates[occurrenceId] = {
      update_mode: mode === "revise" || mode === "clear" || mode === "none"
        ? mode
        : "set",
      outcome: normalizedOutcome,
      reason_category: reasonCategory(update.reason_category),
      reason_text: nullableString(update.reason_text),
      still_relevant: update.still_relevant === true ||
          update.still_relevant === false
        ? update.still_relevant
        : "unknown",
      evidence_text: nullableString(update.evidence_text),
      matched_user_text: nullableString(update.matched_user_text),
      confidence: confidence(update.confidence),
      missing_slots: missingSlots(update.missing_slots, normalizedOutcome),
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

  const exitMemo = normalizeExitMemo(
    root.exit_memo,
    action,
    params.targets,
    root.note_information,
  );
  const childFlowContext = normalizedDailyChildFlowContext({
    root,
    action,
    exitMemo,
    targets: params.targets,
    state: params.state ?? stateFromUnknown(undefined, params.targets),
    confidence: confidence(root.confidence),
  });
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
          "action_question",
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
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
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
        field_or_stage: visibleConversationContext.field_or_stage ?? null,
        known_values: visibleConversationContext.known_values ?? {},
        missing_or_weak_values:
          visibleConversationContext.missing_or_weak_values ?? [],
        selected_candidate: visibleConversationContext.selected_candidate ??
          null,
        handoff_data: visibleConversationContext.handoff_data ?? null,
        affect_context: visibleConversationContext.affect_context ?? {
          emotional_intensity: "none",
          fragile_signal: false,
          suggested_tone: "neutral",
          evidence: [],
        },
        tone_constraints: visibleConversationContext.tone_constraints ?? [],
        do_not_say: visibleConversationContext.do_not_say ?? [],
        context_summary: visibleConversationContext.context_summary ?? null,
        evidence_used: visibleConversationContext.evidence_used ?? [],
      },
    },
    child_flow: action === "handoff_to_child_flow"
      ? "daily_action_coaching_recommendation_v1"
      : null,
    return_to_parent: action === "handoff_to_child_flow"
      ? returnToDailyAfterCoaching()
      : null,
    child_flow_context: action === "handoff_to_child_flow"
      ? childFlowContext
      : null,
    note_information: exitMemo.note_information ?? null,
    exit_memo: exitMemo,
    state_change_intent: declaredStateChangeIntent(root.state_change_intent),
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
  const item_update_modes: NonNullable<
    DailyReviewDecision["item_update_modes"]
  > = {};
  for (
    const [occurrenceId, update] of Object.entries(
      params.output.item_updates,
    )
  ) {
    if (!targetIds.has(occurrenceId) || update.update_mode === "none") continue;
    item_updates[occurrenceId] = updateFromDispatcherItem(update);
    item_update_modes[occurrenceId] = update.update_mode;
  }
  const target_occurrence_ids =
    params.output.target_resolution.resolved_occurrence_ids.length > 0
      ? params.output.target_resolution.resolved_occurrence_ids
      : params.state.next_question_targets.length > 0
      ? params.state.next_question_targets
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
    item_update_modes,
    state_change_intent: params.output.state_change_intent,
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    next_question: null,
    next_question_targets: target_occurrence_ids,
    generated_user_message: null,
    should_apply_effects: false,
    stop_reason: params.output.flow_action === "safety_preempt"
      ? "safety"
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
    stateMutationAudit: state.state_mutation_audit,
  };
}

function missingOccurrenceIdsForState(
  state: DailyActionReviewState,
): string[] {
  return Object.values(state.items)
    .filter((item) =>
      !isAppliedDailyOutcome(item.outcome) || item.missing_slots.length > 0
    )
    .map((item) => item.occurrence_id);
}

function preferredVisibleKindForState(
  state: DailyActionReviewState,
): DailyActionReviewVisibleTaskKind | null {
  const items = Object.values(state.items);
  if (
    items.some((item) =>
      item.missing_slots.includes("outcome") ||
      item.missing_slots.includes("which_action") ||
      item.missing_slots.includes("completion_level")
    )
  ) return "clarify_outcome";
  if (
    items.some((item) =>
      item.outcome === "missed" && item.missing_slots.includes("reason")
    )
  ) return "clarify_reason";
  if (
    items.some((item) =>
      item.outcome === "missed" &&
      item.missing_slots.includes("still_relevant")
    )
  ) return "clarify_still_relevant";
  return null;
}

function visibleKindBeforeCommit(params: {
  dispatcherOutput: DailyActionReviewLocalDispatcherOutput;
  nextState: DailyActionReviewState;
}): DailyActionReviewVisibleTaskKind {
  const missingIds = missingOccurrenceIdsForState(params.nextState);
  const preferredKind = preferredVisibleKindForState(params.nextState);
  if (
    !params.nextState.should_apply_effects &&
    params.dispatcherOutput.visible_task.kind === "commit_success"
  ) {
    params.nextState.next_question_targets = params.nextState
        .next_question_targets.length
      ? params.nextState.next_question_targets
      : missingIds.length
      ? missingIds
      : params.nextState.current_focus_occurrence_ids;
    return preferredKind ?? "clarify_outcome";
  }
  if (
    !params.nextState.should_apply_effects &&
    params.dispatcherOutput.visible_task.kind.startsWith("clarify_") &&
    preferredKind
  ) {
    return preferredKind;
  }
  return params.dispatcherOutput.visible_task.kind;
}

function childFlowHandoffFromDailyOutput(
  output: DailyActionReviewLocalDispatcherOutput,
): LocalChildFlowHandoff | null {
  if (
    output.flow_action !== "handoff_to_child_flow" ||
    output.child_flow !== "daily_action_coaching_recommendation_v1" ||
    !output.return_to_parent ||
    !output.child_flow_context
  ) return null;
  return {
    flow_action: "handoff_to_child_flow",
    child_flow: "daily_action_coaching_recommendation_v1",
    return_to_parent: {
      parent_flow_id: "daily_action_review_v1",
      return_focus: "resume_daily_after_action_coaching",
      preserve_parent_state: true,
    },
    child_flow_context: output.child_flow_context,
  };
}

function buildDailyActionReviewDiagnosis(params: {
  dispatcherOutput: DailyActionReviewLocalDispatcherOutput;
  decision: DailyReviewDecision;
  state: DailyActionReviewState;
  targets: DailyActionReviewTarget[];
  previousStatePresent: boolean;
  transfersOwnership: boolean;
}): DailyActionReviewLocalFlowResult["diagnosis"] {
  return {
    flow_action: params.dispatcherOutput.flow_action,
    visible_task: params.dispatcherOutput.visible_task.kind,
    selected_targets: params.decision.target_occurrence_ids,
    pending_state_present: params.previousStatePresent,
    direct_handoff_flag: params.transfersOwnership,
    candidate_summary: params.targets.slice(0, 6).map((target) => ({
      occurrence_id: target.occurrence_id,
      plan_item_id: target.plan_item_id,
      title: target.title,
    })),
    stabilization_ready: params.state.effect_plan.allowed,
    blocked_effects: params.state.blocked_effects ?? [],
    state_mutation_audit: params.state.state_mutation_audit,
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow daily_action_review_v1.",
    "Sophia a envoye une question daily sur une ou deux actions ciblees. Le user vient de repondre.",
    "Le daily collecte une preuve du jour pour chaque target: action faite ou pas faite.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "",
    "Actions possibles: answer_review, missing_info, clarify_which_action, clarify_outcome, clarify_reason, clarify_still_relevant, explain_target, correction, revise, recap_daily_state, clarify_daily_question, exit_to_global_dispatcher, safety_preempt.",
    "",
    "Regles:",
    ...directEffectLocalDispatcherPromptLines(),
    ...localOneShotDirectEffectPromptLines("le daily"),
    "- Ne fais aucune regex metier et ne decide pas par mot-cle isole.",
    "- Analyse la reponse par rapport aux targets daily.",
    "- Utilise le titre, la description, le type, le contexte d'action et les formulations proches pour relier semantiquement les mots du user aux targets. Ne te limite pas au titre.",
    "- Le selector a deja choisi les actions. Tu ne changes pas la liste de targets.",
    "- Chaque target du pending doit finir avec un outcome stabilise: completed si quelque chose a ete fait, missed si rien n'a ete fait.",
    "- Si active_flow_state.next_question_targets contient exactement une target, et que le user repond a la question courante par fait/pas fait, une raison ou la pertinence, rattache cette reponse a cette target meme si le user ne repete pas son titre. C'est le scope prioritaire de la reponse suivante.",
    "- Si active_flow_state.next_question_targets contient plusieurs targets et que la reponse courte ne permet pas de savoir laquelle est visee, demande clarify_which_action ou clarify_outcome selon le slot manquant; ne devine pas.",
    "- Si un meme message contient des preuves distinctes pour plusieurs targets, mets a jour toutes les targets reconnues dans le meme tour. Cette regle vaut pour 1, 2, 3 targets ou plus.",
    "- Ne demande clarify_which_action que si le meme fragment reste vraiment compatible avec plusieurs targets ou si aucune target ne peut etre reliee avec confiance. Si le mapping est clair par titre, description, synonyme, paraphrase ou intention d'action, resous la target.",
    "- Si le user donne une reponse exploitable pour une target presente dans active_flow_state.items ou db_context_pack.targets mais hors current_focus_occurrence_ids, mets aussi cette target a jour au lieu d'ignorer l'evidence.",
    "- Si une target presente dans active_flow_state.items ou db_context_pack.targets n'a jamais ete demandee ou n'a pas d'outcome, ne declare pas le daily complete: demande son outcome.",
    "- Si current_focus_occurrence_ids est complet mais remaining_occurrence_ids n'est pas vide, utilise clarify_outcome pour la prochaine target restante. Ne retourne pas commit_success.",
    "- Si deux targets sont presentes et que le user dit seulement qu'il l'a fait, ne devine pas: clarify_which_action.",
    "- Si le user dit qu'il a fait les deux, mets a jour les deux targets.",
    "- Si le user indique qu'il a fait seulement une partie concrete d'une target, classe cette target en completed: le daily retient qu'il y a eu action.",
    "- Si le user demande ce que veut dire une target daily, pourquoi elle est la, ou a quoi correspond une action ciblee, reste dans daily avec flow_action=explain_target et visible_task.kind=explain_target. Explique uniquement depuis les targets, le contexte filtre et l'intelligence d'action disponible; ne mute rien; repose ensuite la question faite ou pas faite.",
    "- Pour completed, omets reason_category, reason_text et still_relevant sauf si le user donne spontanement une information utile.",
    "- Pour missed, il faut une raison, une reason_category canonique et savoir si l'action reste pertinente.",
    "- Pour missed, si une raison est connue, reason_text et reason_category doivent etre renseignes ensemble. N'envoie pas seulement reason_text.",
    "- Mapping reason_category: fatigue/epuise/HS => fatigue; oubli/zappe/pas pense => forgot; imprevu/travail/famille/temps/rdv => external; trop dur/difficile/lourd/impossible => too_hard; stress/angoisse/honte/peur/envie trop forte/craquage/rechute/joint/fume => emotional; plus utile/pas pertinent/pas besoin => not_relevant; raison claire mais hors mapping => other; raison trop floue => unclear.",
    "- Ne propose pas de solution, carte, potion ou ajustement pendant la collecte.",
    "- Si le user veut arreter/refuser le daily: exit_to_global_dispatcher avec note_information vers global avant toute reprise globale.",
    "- Si le user change clairement de sujet, demande une carte, potion, preference, status, ajustement ou autre capacite non daily: exit_to_global_dispatcher avec note_information target_dispatcher=global.",
    "- Si le user repond encore au daily, reste dans daily.",
    "- Si le user donne seulement une raison d'echec, une difficulte, un oubli, un blocage ou une action trop dure, reste dans daily: collecte missed, reason_category, reason_text et still_relevant. Ne bridge pas sans demande d'aide explicite.",
    "- Si le user demande explicitement de l'aide, une solution, un levier Sophia ou quoi faire pour reussir une action daily identifiable, utilise flow_action=handoff_to_child_flow, child_flow=daily_action_coaching_recommendation_v1, return_to_parent daily, et child_flow_context au contrat daily_action_coaching.",
    "- Le child_flow_context daily_action_coaching contient source_flow_id=daily_action_review_v1, parent_flow_id=daily_action_review_v1, return_focus=resume_daily_after_action_coaching, action_context, help_request_summary et affect_context si utile.",
    "- action_context doit venir de la target daily identifiee: occurrence_id, plan_item_id, plan_id si disponible, title, description si disponible, action_type, outcome si deja connu, reason_category et reason_text si deja connus. N'invente jamais d'id.",
    "- Si le user demande de l'aide mais que l'action daily ciblee est ambigue, reste dans daily avec clarify_which_action; ne lance pas de child flow ambigu.",
    "- Si le user pose une question produit explicite sur Sophia ou une fonctionnalite: exit_to_global_dispatcher avec note_information target_dispatcher=global et handoff_hint_for_global_dispatcher.likely_intent=product_help. Le global decidera product_help; le daily ne lance aucun sous-flow produit.",
    "- Si safety est present: safety_preempt avec note_information.target_dispatcher=safety_crisis.",
    "- Ne dis jamais que quelque chose est note ou enregistre.",
    "- Le commit sera decide uniquement par le reducer/executor.",
    "- visible_task.conversation_context doit contenir uniquement le contexte filtre utile au prompt visible, jamais un dump DB ou memoire brute.",
    "- Si le message montre une fragilite emotionnelle non safety ou une charge forte, remplis visible_task.conversation_context.affect_context avec emotional_intensity, fragile_signal, suggested_tone et evidence; ajoute des tone_constraints comme gentle, low_pressure ou emotionally_safe. Si safety, utilise safety_preempt.",
    "- note_information est obligatoire pour exit_to_global_dispatcher et safety_preempt. Garde la structure simplifiee: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, structured_context, confidence si utile. Ne fournis pas user_words. structured_context est succinct et non vide avec etat daily utile, commits deja faits ou non, incertitudes et recommended_next_focus. Ne mets pas constraints, source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint ou risk_score dans la note.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Elle doit refleter le message actuel, pas seulement l'etat precedent. Utilise answer_review pour une reponse daily exploitable, les clarify_* pour les slots daily manquants, explain_target pour expliquer une action ciblee sans mutation, recap_daily_state pour un recap du daily courant, clarify_daily_question pour clarifier ou reformuler la question daily courante, handoff_to_child_flow pour une demande explicite d'aide Sophia sur une action daily, exit_to_global_dispatcher pour arret du daily, nouveau sujet global clair ou question produit explicite, safety_preempt pour safety.",
    "- confidence: high si l'intention et les targets sont claires; medium si probable mais incomplete; low si clarification ou prudence necessaire. Ne gonfle pas la confiance pour masquer une ambiguite.",
    "- risk_score: optionnel. Omettre quand il vaut 0. Ne le renseigne que pour safety ou fragilite utile au routing/ton. Ne fabrique pas de safety; si le message contient un vrai signal safety, utilise safety_preempt et une note_information vers safety_crisis.",
    "- target_resolution: decrit uniquement quelles occurrences daily le message permet de relier. resolved_occurrence_ids contient seulement des occurrence_id des targets. ambiguous=true quand le user parle d'une action sans dire laquelle. why est optionnel et reserve au debug/trace.",
    "- item_updates: etat metier local propose au reducer, par occurrence_id connu seulement. Mets update_mode=none ou laisse l'objet absent si aucune valeur metier n'est stabilisee. Ne transforme jamais une hypothese en fait. Pour missed, renseigne les champs necessaires et les missing_slots restants au lieu d'inventer une raison.",
    "- item_updates.outcome: completed ou missed seulement si le message le supporte. unclear ou null si le slot outcome reste ouvert.",
    "- item_updates.reason_category/reason_text: optionnels pour completed; pour missed, si la raison est dite ou clairement proche, renseigne reason_text et reason_category avec une categorie canonique; sinon missing_slots inclut reason.",
    "- item_updates.still_relevant: optionnel. Utile surtout pour missed; true/false seulement si le user le dit ou si la pertinence est evidente dans son message.",
    "- item_updates.missing_slots: optionnel quand vide; utile seulement pour signaler outcome, reason, still_relevant ou which_action manquant.",
    "- item_updates.evidence_text: evidence courte tiree des mots du user. matched_user_text est optionnel et reserve a l'audit fin. Pas de pseudo-preuves, pas de resume invente.",
    "- daily_intent: kind est utile pour classer localement le message. summary est optionnel/debug et ne doit pas repeter flow_action ou evidence.",
    "- direct_effect_request: present seulement si le user demande explicitement un rappel ponctuel pendant le daily. Pour un rappel recurrent ou une demande produit/outillage non ponctuelle, sors via exit_to_global_dispatcher. Ce champ ne permet jamais au visible de confirmer un rappel avant commit runtime.",
    "- direct_effect_request est independant de flow_action: si le meme message remplit les slots daily et demande explicitement un rappel ponctuel, retourne flow_action=answer_review avec item_updates daily ET direct_effect_request complet. Ne laisse jamais commit_success, answer_review ou clarify_* absorber ou faire disparaitre le rappel ponctuel.",
    "- direct_effect_request est aussi valable quand le message ne repond pas encore au daily: si le user demande seulement un rappel ponctuel pendant le pending daily, expose direct_effect_request complet et continue le daily avec le visible_task de clarification adapte.",
    "- state_updates: optionnel. status_hint peut aider mais le reducer derive l'etat depuis les slots et la coverage. Ne renseigne pas turn_count_increment: c'est runtime-owned. close_after_visible doit etre absent sauf si true.",
    "- visible_task.kind: stage visible exact uniquement si daily continue ou si commit_success est vise apres commit runtime. Kinds visibles autorises: clarify_which_action, clarify_outcome, clarify_reason, clarify_still_relevant, explain_target, recap_daily_state, clarify_daily_question, commit_success. Pas de visible_task daily pour stop, report, exit, handoff, safety ou incident commit.",
    "- visible_task.instruction: optionnel; a eviter sauf si le stage a besoin d'une consigne non derivable par le runtime.",
    "- visible_task.conversation_context: sparse. Inclure seulement tone_constraints, do_not_say, affect_context et evidence_used quand ils ajoutent de l'information utile. Le runtime construit state_summary, field_or_stage, known_values, selected_candidate, handoff_data et context_summary depuis l'etat valide. Ne jamais y mettre user_words, constraints, DB brute, memoire brute, note_information brute ou decision a refaire.",
    "- child_flow/return_to_parent/child_flow_context: presents uniquement avec flow_action=handoff_to_child_flow. child_flow=daily_action_coaching_recommendation_v1. return_to_parent.parent_flow_id=daily_action_review_v1, return_focus=resume_daily_after_action_coaching, preserve_parent_state=true. child_flow_context suit exactement le contrat daily_action_coaching.",
    "- note_information: absent pour continuation daily sans changement de dispatcher et pour handoff_to_child_flow. Obligatoire uniquement pour exit_to_global_dispatcher et safety_preempt. Elle est consommee par le dispatcher cible et ne doit jamais etre un message visible. Elle doit porter le sens du handoff, pas des champs runtime historiques.",
    "- exit_memo: absent pour continuation daily normale et commit_success local. Obligatoire seulement pour exit_to_global_dispatcher et safety_preempt. Ne retourne jamais handoff_hint_for_global_dispatcher quand il n'y a pas de handoff.",
    "- evidence: indices semantiques reellement utilises pour la decision. Court, lie aux mots du user ou a l'etat daily. Pas de pseudo-preuve.",
    "",
    "Transition rules:",
    "- exit_to_global_dispatcher: le user veut arreter le daily, refuse la collecte, reporte, ou apporte un nouveau sujet clair. note_information obligatoire vers global avant toute reprise globale. Le daily ne produit pas de message visible dans ce cas.",
    "- handoff_to_child_flow: le user demande explicitement une aide/recommandation Sophia pour reussir une action daily. Ne passe jamais par exit_to_global_dispatcher pour ce cas.",
    "- exit_to_global_dispatcher: le user change clairement de sujet, demande non daily ou pose une question produit/status/preference hors daily. note_information obligatoire vers global sauf safety_crisis.",
    "- safety_preempt: safety prioritaire. note_information obligatoire, target_dispatcher=safety_crisis, aucune continuation daily.",
    "- Les demandes de carte, potion, preference, status, ajustement de plan ou rappel recurrent sortent vers global sauf si le message demande explicitement le bon levier Sophia pour une action daily, auquel cas utilise handoff_to_child_flow vers daily_action_coaching_recommendation_v1.",
    "- Anti-faux-positif exit: si le user repond encore au daily, meme avec hesitation ou nuance, reste dans le daily et clarifie au lieu de sortir.",
    "",
    "Exemples JSON non visibles (decision structuree seulement):",
    '{"flow_action":"answer_review","confidence":"high","target_resolution":{"resolved_occurrence_ids":["occ-1"],"ambiguous":false},"item_updates":{"occ-1":{"update_mode":"set","outcome":"completed","evidence_text":"je l ai fait 20 minutes","confidence":"high"}},"daily_intent":{"kind":"daily_answer"},"visible_task":{"kind":"commit_success","conversation_context":{"tone_constraints":["short"],"do_not_say":["dire que c est enregistre avant le commit runtime"],"evidence_used":["je l ai fait 20 minutes"]}},"evidence":["single target completed"]}',
    '{"flow_action":"answer_review","confidence":"high","target_resolution":{"resolved_occurrence_ids":["occ-1","occ-2"],"ambiguous":false},"item_updates":{"occ-1":{"update_mode":"set","outcome":"completed","evidence_text":"le bloc sans telephone est fait","confidence":"high"},"occ-2":{"update_mode":"set","outcome":"completed","evidence_text":"le rangement est a moitie fait","reason_text":"disperse","reason_category":"other","confidence":"medium"}},"daily_intent":{"kind":"daily_answer","summary":"Le user donne son bilan daily et demande un rappel ponctuel."},"direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","payload_hint":{"raw_text":"Rappelle-moi dans 37 minutes de finir les dix minutes de rangement","when_hint":"dans 37 minutes","UTC_time":"2026-06-26T13:10:00.000Z","local_label":"dans 37 minutes","instruction_hint":"finir les dix minutes de rangement"},"reason":"demande explicite de rappel ponctuel avec delai exploitable"},"visible_task":{"kind":"commit_success","conversation_context":{"tone_constraints":["short"],"evidence_used":["bilan daily","rappel ponctuel explicite"]}},"evidence":["bloc fait","rangement a moitie","Rappelle-moi dans 37 minutes"]}',
    '{"flow_action":"clarify_outcome","confidence":"medium","target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false},"item_updates":{},"daily_intent":{"kind":"daily_clarification","summary":"Le user demande un rappel avant de repondre au bilan."},"direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","payload_hint":{"raw_text":"rappelle-moi dans 42 minutes de finir le rangement","when_hint":"dans 42 minutes","UTC_time":"2026-06-26T13:20:00.000Z","local_label":"dans 42 minutes","instruction_hint":"finir le rangement"},"reason":"demande explicite de rappel ponctuel pendant le daily"},"visible_task":{"kind":"clarify_outcome","conversation_context":{"tone_constraints":["short"],"evidence_used":["rappel ponctuel explicite","outcome daily encore manquant"]}},"evidence":["rappelle-moi dans 42 minutes","avant de repondre au bilan"]}',
    '{"flow_action":"clarify_outcome","confidence":"medium","target_resolution":{"resolved_occurrence_ids":["occ-2"],"ambiguous":false},"item_updates":{"occ-2":{"update_mode":"none","outcome":"unclear","confidence":"medium","missing_slots":["outcome"]}},"daily_intent":{"kind":"daily_clarification"},"visible_task":{"kind":"clarify_outcome","conversation_context":{"tone_constraints":["short","low_pressure"]}},"evidence":["outcome missing for occ-2"]}',
    '{"flow_action":"safety_preempt","confidence":"high","risk_score":8,"target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false,"why":"Safety concern overrides daily collection."},"item_updates":{},"daily_intent":{"kind":"safety"},"state_updates":{"status_hint":"blocked","close_after_visible":true},"note_information":{"source_flow_id":"daily_action_review_v1","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Safety owns next turn; daily review did not commit anything.","structured_context":{"source_flow_id":"daily_action_review_v1","recommended_next_focus":"safety_crisis"},"confidence":"high"},"exit_memo":{"needed":true,"reason":"safety","user_intent_summary":"User signals immediate self-harm risk.","local_flow_context":{"skill_id":"daily_action_review_v1","current_daily_state":"blocked","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":"Safety dispatcher must own the next turn."}},"evidence":["self-harm risk words"]}',
    "",
    JSON.stringify({
      expected_direct_effect_request_shape:
        LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
    }),
    'Schema minimal attendu: {"flow_action":"answer_review|missing_info|clarify_which_action|clarify_outcome|clarify_reason|clarify_still_relevant|explain_target|correction|revise|recap_daily_state|clarify_daily_question|handoff_to_child_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false,"why":"string optionnel"},"item_updates":{"occurrence_id":{"update_mode":"set|revise|clear|none","outcome":"completed|missed|unclear|null","evidence_text":"string optionnel","confidence":"high|medium|low","reason_category":"categorie canonique requise pour missed quand reason_text est connue","reason_text":"raison user requise pour missed quand elle est connue","still_relevant":"true|false seulement si utile","missing_slots":["outcome|reason|still_relevant|which_action"]}},"daily_intent":{"kind":"daily_answer|daily_clarification|action_question|daily_correction|daily_recap|stop|off_topic|explicit_tool_request|safety|unclear","summary":"optionnel"},"direct_effect_request":{"requested":false,"effect_type":"create_one_shot_reminder|null","explicitness":"explicit|implied|weak|none","target_status":"identified|ambiguous|missing|none","confidence_band":"low|medium|high","payload_hint":{"raw_text":"string|null","when_hint":"string|null","UTC_time":"string|null","local_label":"string|null","instruction_hint":"string|null"},"reason":"string|null"},"child_flow":"daily_action_coaching_recommendation_v1|null","return_to_parent":{"parent_flow_id":"daily_action_review_v1","return_focus":"resume_daily_after_action_coaching","preserve_parent_state":true},"child_flow_context":{"source_flow_id":"daily_action_review_v1","parent_flow_id":"daily_action_review_v1","return_focus":"resume_daily_after_action_coaching","action_context":{"occurrence_id":"string","plan_item_id":"string","plan_id":"string|null","title":"string","description":"string|null","action_type":"habit|mission|clarification|other|null","outcome":"missed|completed|null","reason_category":"string|null","reason_text":"string|null"},"help_request_summary":"string","affect_context":{}},"visible_task":{"kind":"clarify_which_action|clarify_outcome|clarify_reason|clarify_still_relevant|explain_target|recap_daily_state|clarify_daily_question|commit_success","conversation_context":{"tone_constraints":[],"do_not_say":[],"affect_context":"optionnel","evidence_used":[]}},"evidence":["string"]}. Omettre visible_task pour handoff_to_child_flow, exit_to_global_dispatcher et safety_preempt. Ajoute direct_effect_request seulement si rappel ponctuel detecte. Ajoute risk_score seulement si non nul. Ajoute state_updates seulement si indispensable, sans turn_count_increment. Ajoute note_information et exit_memo seulement pour exit_to_global_dispatcher ou safety_preempt.',
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
  const focusAffect = affectContextFromSignals({
    outputContext: {},
    dispatcherOutput: null,
    state: params.state,
    selectedTargets: focusTargets,
  });
  return JSON.stringify({
    current_user_message: params.userMessage,
    recent_messages: (params.recentMessages ?? []).slice(-8),
    active_flow_state: params.state,
    note_information_inbound: params.noteInformationInbound ?? null,
    db_context_pack: params.dbContextPack ?? {
      source: "daily_action_review.pending_payload",
      freshness: "current_pending",
      confidence: "high",
      targets: params.targets.map(targetSummary),
    },
    micro_memory_context: params.microMemoryContext ?? {
      items: [],
      exclusions: ["No raw memory loaded for this turn."],
      budget: {
        max_items: 4,
        reason: "Daily review only needs action-linked memory if present.",
      },
    },
    platform_context: withDirectEffectLocalContext(
      params.platformContext ?? {
        channel: "whatsapp",
      },
      null,
      dailyTargetsToActiveActionCandidates(focusTargets),
      directEffectTimeContextFromUnknown(params.platformContext),
    ),
    risk_context: {
      source: "daily_action_review_action_intelligence",
      affect_context: focusAffect,
      safety_memory_loaded: false,
      note:
        "Use as tone and routing context only. Safety still requires explicit current-message safety evidence.",
    },
    available_inline_tools: [],
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
    state,
  });
}

function recentUserMessagesForVisible(
  recentMessages?: Array<
    { role: string; content: string; created_at?: string }
  >,
) {
  return (recentMessages ?? [])
    .filter((message) => cleanText(message.role).toLowerCase() === "user")
    .map((message) => ({
      role: "user",
      content: cleanText(message.content),
      ...(cleanText(message.created_at)
        ? { created_at: cleanText(message.created_at) }
        : {}),
    }))
    .filter((message) => message.content)
    .slice(-5);
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
    Array.isArray(parsed) &&
    parsed.length === 1 &&
    typeof parsed[0] === "string"
  ) {
    text = cleanText(parsed[0]);
  } else if (
    parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
    (typeof (parsed as Record<string, unknown>).message === "string" ||
      typeof (parsed as Record<string, unknown>).content === "string")
  ) {
    const record = parsed as Record<string, unknown>;
    text = cleanText(
      typeof record.message === "string" ? record.message : record.content,
    );
  }
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    const inner = text.slice(1, -1).trim();
    if (inner) text = inner;
  }
  text = sanitizeDailyVisibleOutcomeWording(text);
  return text || null;
}

function sanitizeDailyVisibleOutcomeWording(text: string): string {
  let next = text;
  next = next.replace(
    /\b(fait|faite)\s*,\s*pas\s+(fait|faite)\s*,?\s*ou\s+en\s+partie\b/gi,
    (_match, done: string, missed: string) => `${done} ou pas ${missed}`,
  );
  next = next.replace(
    /\b(fait|faite)\s*,\s*pas\s+(fait|faite)\s*,?\s*ou\s+partiellement\b/gi,
    (_match, done: string, missed: string) => `${done} ou pas ${missed}`,
  );
  next = next.replace(/\bpartiel(?:le)?s?\b/gi, "").replace(
    /\bpartiellement\b/gi,
    "",
  ).replace(/\ben\s+partie\b/gi, "");
  next = next.replace(
    /\bFaisable aujourd'hui\s*\?/gi,
    "Est-ce que tu l'as faite aujourd'hui ?",
  );
  next = next.replace(
    /\bFaisable aujourd’hui\s*\?/gi,
    "Est-ce que tu l'as faite aujourd'hui ?",
  );
  next = next.replace(
    /\btu\s+le\s+consid[eè]res\s+plut[oô]t\s+fait\s+ou\s+pas\s+fait\s*\?/gi,
    "est-ce que tu l'as fait aujourd'hui ?",
  );
  next = next.replace(
    /\btu\s+la\s+consid[eè]res\s+plut[oô]t\s+faite\s+ou\s+pas\s+faite\s*\?/gi,
    "est-ce que tu l'as faite aujourd'hui ?",
  );
  return next.replace(/[ \t]{2,}/g, " ").replace(/\s+\?/g, " ?").trim();
}

export async function runDailyActionReviewVisibleAgent(params: {
  kind: DailyActionReviewVisibleTaskKind;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  committedEffects?: DailyReviewEffectsResult["committed_effects"];
  failedEffects?: DailyReviewEffectsResult["failed_effects"];
  currentDailyQuestion?: string | null;
  recentMessages?: Array<
    { role: string; content: string; created_at?: string }
  >;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<string | null> {
  const visibleAgent = dailyActionReviewVisibleAgentSpec(params.kind);
  const systemPrompt = dailyActionReviewVisibleSystemPrompt(params.kind);
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
    visible_runtime_context: {
      style_rules: VISIBLE_OUTPUT_STYLE_RULES,
      recent_user_messages: recentUserMessagesForVisible(
        params.recentMessages,
      ),
    },
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
      false,
      [],
      "auto",
      {
        requestId: params.requestId,
        source: visibleAgent.source,
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
  const directEffectConfirmationContext = recordOrEmpty(
    recordOrEmpty(params.platformContext).direct_effect_confirmation_context,
  );
  if (Object.keys(directEffectConfirmationContext).length > 0) {
    dispatcherOutput.visible_task.conversation_context.known_values = {
      ...dispatcherOutput.visible_task.conversation_context.known_values,
      direct_effect_confirmation_context: directEffectConfirmationContext,
    };
    dispatcherOutput.visible_task.conversation_context.do_not_say = [
      ...new Set([
        ...dispatcherOutput.visible_task.conversation_context.do_not_say,
        "Ne dis pas que le rappel est programme si direct_effect_confirmation_context.has_committed_one_shot_reminder n'est pas true.",
      ]),
    ];
  }
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
    dispatcherOutput.flow_action === "handoff_to_child_flow" ||
    dispatcherOutput.flow_action === "exit_to_global_dispatcher" ||
    dispatcherOutput.flow_action === "safety_preempt";
  const childFlowHandoff = childFlowHandoffFromDailyOutput(dispatcherOutput);
  const diagnosis = buildDailyActionReviewDiagnosis({
    dispatcherOutput,
    decision,
    state: nextState,
    targets: params.targets,
    previousStatePresent: params.previousState !== undefined &&
      params.previousState !== null,
    transfersOwnership,
  });
  const shouldRenderBeforeCommit = !transfersOwnership &&
    (!nextState.should_apply_effects ||
      dispatcherOutput.flow_action === "recap_daily_state" ||
      dispatcherOutput.flow_action === "clarify_daily_question");
  if (shouldRenderBeforeCommit) {
    const visibleKind = visibleKindBeforeCommit({
      dispatcherOutput,
      nextState,
    });
    const visible = await runDailyActionReviewVisibleAgent({
      kind: visibleKind,
      targets: params.targets,
      state: nextState,
      dispatcherOutput,
      currentDailyQuestion: previousState.next_question,
      recentMessages: params.recentMessages,
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
      dispatcherOutput.flow_action === "safety_preempt",
    childFlowHandoff,
    stateMutationAudit: nextState.state_mutation_audit,
    diagnosis,
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

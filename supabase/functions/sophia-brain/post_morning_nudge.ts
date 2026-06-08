import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import type {
  MorningNudgePayloadV2,
  PostMorningNudgeFlowKind,
  PostMorningNudgeStatus,
} from "./morning_nudge_contract.ts";
import { isPostMorningNudgeFlowKind } from "./morning_nudge_contract.ts";

export type PostMorningNudgeLocalAssessment = {
  action_readiness:
    | "ready"
    | "hesitant"
    | "blocked"
    | "overloaded"
    | "not_today"
    | "wants_minimal"
    | "wants_full"
    | "needs_support"
    | "unclear"
    | "not_applicable"
    | "wants_direction"
    | "unknown";
  motivation_need: "none" | "light" | "medium" | "high" | "unknown";
  emotional_load: "low" | "medium" | "high" | "unknown";
  user_wants_conversation: boolean;
  target_action_reference?: string | null;
  main_friction?: string | null;
  next_step_candidate?: string | null;
  scope_reduction_candidate?: string | null;
  suppression_still_valid?: boolean;
  main_need?:
    | "rest"
    | "support"
    | "minimal_progress"
    | "clarity"
    | "space"
    | "unknown";
  minimal_save_candidate?: string | null;
  reopen_step_candidate?: string | null;
  support_need?:
    | "none"
    | "listen"
    | "soft_next_step"
    | "reactivation"
    | "space"
    | "clarity"
    | "unknown";
  main_emotion_or_context?: string | null;
  soft_next_step_candidate?: string | null;
  reactivation_candidate?: string | null;
};

export type PostMorningNudgeActiveState = {
  skill_id: "post_morning_nudge";
  flow_kind: PostMorningNudgeFlowKind;
  status: PostMorningNudgeStatus;
  source_nudge: MorningNudgePayloadV2;
  local_assessment: PostMorningNudgeLocalAssessment;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
};

export type PostMorningNudgeVisibleTaskKind =
  | "quick_close"
  | "gentle_boost"
  | "choose_first_step"
  | "reduce_scope"
  | "blocker_help"
  | "not_today_protective_close"
  | "meaning_reconnect"
  | "ask_action_clarification"
  | "repeat_context"
  | "negative_feedback_close"
  | "exit_or_cancel"
  | "action_followup"
  | "suppressed_action_support"
  | "emotional_presence"
  | "close"
  | "safety"
  | "exit";

export type PostMorningNudgeExitMemo = {
  needed: boolean;
  reason:
    | "topic_change"
    | "explicit_tool_request"
    | "new_goal"
    | "product_help"
    | "status_question"
    | "preference_update"
    | "safety"
    | "unknown";
  user_intent_summary: string;
  local_flow_context: {
    skill_id: "post_morning_nudge";
    flow_kind: PostMorningNudgeFlowKind;
    source_nudge_summary: string;
    target_action_titles: string[];
    suppressed_action_titles: string[];
    suppression_reason: string | null;
    last_local_assessment: string;
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent:
      | "prepare_attack_card"
      | "prepare_defense_card"
      | "select_state_potion"
      | "update_coach_preferences"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string;
    constraints: string[];
  };
};

export type PostMorningNudgeFlowAction =
  | "continue_local"
  | "close_local"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PostMorningNudgeDispatcherOutput = {
  dispatcher_id:
    | "post_morning_nudge.action_dispatcher"
    | "post_morning_nudge.suppressed_action_dispatcher"
    | "post_morning_nudge.emotional_presence_dispatcher";
  flow_action: PostMorningNudgeFlowAction;
  visible_task: {
    kind: PostMorningNudgeVisibleTaskKind;
  };
  local_assessment?: Partial<PostMorningNudgeLocalAssessment>;
  exit_memo?: PostMorningNudgeExitMemo | null;
  no_durable_mutation: {
    action_created: false;
    card_created: false;
    potion_created: false;
    reminder_created: false;
    scheduled_checkin_created: false;
    preference_written: false;
    plan_patch_written: false;
  };
};

export type PostMorningNudgeRuntimeResult = {
  content: string;
  nextTempMemory: Record<string, unknown>;
  toolExecution: "none" | "blocked";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

export type PostMorningNudgeActionFlowAction =
  | "quick_close_ready"
  | "motivate_light"
  | "choose_first_step"
  | "reduce_scope"
  | "handle_blocker"
  | "support_not_today"
  | "meaning_reconnect"
  | "ask_action_clarification"
  | "repeat_nudge_context"
  | "negative_nudge_feedback"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PostMorningNudgeActionVisibleTaskKind =
  | "quick_close"
  | "gentle_boost"
  | "choose_first_step"
  | "reduce_scope"
  | "blocker_help"
  | "not_today_protective_close"
  | "meaning_reconnect"
  | "ask_action_clarification"
  | "repeat_context"
  | "negative_feedback_close"
  | "exit_or_cancel"
  | "safety";

export type PostMorningNudgeActionExitMemo = {
  needed: boolean;
  reason: PostMorningNudgeExitMemo["reason"] | "none";
  user_intent_summary: string | null;
  local_flow_context: {
    skill_id: "post_morning_nudge";
    flow_kind: "action";
    source_nudge_summary: string | null;
    target_action_titles: string[];
    suppressed_action_titles: string[];
    suppression_reason: null;
    last_local_assessment: string | null;
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent: PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"];
    why: string | null;
    constraints: string[];
  };
};

export type PostMorningNudgeActionDispatcherOutput = {
  flow_action: PostMorningNudgeActionFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  local_assessment: PostMorningNudgeLocalAssessment;
  state_updates: {
    status: PostMorningNudgeStatus;
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: PostMorningNudgeActionVisibleTaskKind;
    instruction: string;
    data: {
      target_action_titles: string[];
      target_item_titles: string[];
      main_friction: string | null;
      next_step_candidate: string | null;
      scope_reduction_candidate: string | null;
    };
  };
  exit_memo: PostMorningNudgeActionExitMemo;
  evidence: string[];
};

export type PostMorningNudgeActionDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
};

export type PostMorningNudgeActionVisibleInput = {
  user_id: string;
  request_id?: string | null;
  state: PostMorningNudgeActiveState;
  decision: PostMorningNudgeActionDispatcherOutput;
};

export type PostMorningNudgeActionDispatcher = (
  input: PostMorningNudgeActionDispatcherInput,
) => Promise<PostMorningNudgeActionDispatcherOutput | null>;

export type PostMorningNudgeActionVisibleAgent = (
  input: PostMorningNudgeActionVisibleInput,
) => Promise<string | null>;

export type PostMorningNudgeSuppressedActionFlowAction =
  | "protective_close"
  | "support_emotion"
  | "offer_minimal_save"
  | "confirm_no_action_today"
  | "reopen_action_gently"
  | "ask_suppressed_action_clarification"
  | "repeat_protective_context"
  | "negative_nudge_feedback"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PostMorningNudgeSuppressedActionVisibleTaskKind =
  | "protective_close"
  | "soft_support"
  | "offer_minimal_save"
  | "confirm_no_action_today"
  | "reopen_action_gently"
  | "ask_suppressed_action_clarification"
  | "repeat_protective_context"
  | "negative_feedback_close"
  | "exit_or_cancel"
  | "safety";

export type PostMorningNudgeSuppressedActionExitMemo = {
  needed: boolean;
  reason: PostMorningNudgeExitMemo["reason"] | "none";
  user_intent_summary: string | null;
  local_flow_context: {
    skill_id: "post_morning_nudge";
    flow_kind: "suppressed_action";
    source_nudge_summary: string | null;
    target_action_titles: string[];
    suppressed_action_titles: string[];
    suppression_reason: string | null;
    last_local_assessment: string | null;
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent: PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"];
    why: string | null;
    constraints: string[];
  };
};

export type PostMorningNudgeSuppressedActionDispatcherOutput = {
  flow_action: PostMorningNudgeSuppressedActionFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  local_assessment: PostMorningNudgeLocalAssessment;
  state_updates: {
    status: PostMorningNudgeStatus;
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: PostMorningNudgeSuppressedActionVisibleTaskKind;
    instruction: string;
    data: {
      suppressed_action_titles: string[];
      target_action_titles: string[];
      suppression_reason: string | null;
      main_need: string | null;
      minimal_save_candidate: string | null;
      reopen_step_candidate: string | null;
    };
  };
  exit_memo: PostMorningNudgeSuppressedActionExitMemo;
  evidence: string[];
};

export type PostMorningNudgeSuppressedActionDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
};

export type PostMorningNudgeSuppressedActionVisibleInput = {
  user_id: string;
  request_id?: string | null;
  state: PostMorningNudgeActiveState;
  decision: PostMorningNudgeSuppressedActionDispatcherOutput;
};

export type PostMorningNudgeSuppressedActionDispatcher = (
  input: PostMorningNudgeSuppressedActionDispatcherInput,
) => Promise<PostMorningNudgeSuppressedActionDispatcherOutput | null>;

export type PostMorningNudgeSuppressedActionVisibleAgent = (
  input: PostMorningNudgeSuppressedActionVisibleInput,
) => Promise<string | null>;

export type PostMorningNudgeEmotionalPresenceFlowAction =
  | "presence_ack_close"
  | "hold_space_support"
  | "ask_support_preference"
  | "offer_soft_next_step"
  | "reactivate_gently"
  | "clarify_emotional_need"
  | "repeat_presence_context"
  | "negative_nudge_feedback"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PostMorningNudgeEmotionalPresenceVisibleTaskKind =
  | "presence_close"
  | "hold_space"
  | "ask_support_preference"
  | "offer_soft_next_step"
  | "reactivate_gently"
  | "clarify_emotional_need"
  | "repeat_presence_context"
  | "negative_feedback_close"
  | "exit_or_cancel"
  | "safety";

export type PostMorningNudgeEmotionalPresenceExitMemo = {
  needed: boolean;
  reason: PostMorningNudgeExitMemo["reason"] | "none";
  user_intent_summary: string | null;
  local_flow_context: {
    skill_id: "post_morning_nudge";
    flow_kind: "emotional_presence";
    source_nudge_summary: string | null;
    target_action_titles: [];
    suppressed_action_titles: [];
    suppression_reason: null;
    last_local_assessment: string | null;
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent: PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"];
    why: string | null;
    constraints: string[];
  };
};

export type PostMorningNudgeEmotionalPresenceDispatcherOutput = {
  flow_action: PostMorningNudgeEmotionalPresenceFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  local_assessment: PostMorningNudgeLocalAssessment;
  state_updates: {
    status: PostMorningNudgeStatus;
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: PostMorningNudgeEmotionalPresenceVisibleTaskKind;
    instruction: string;
    data: {
      source_nudge_summary: string | null;
      main_emotion_or_context: string | null;
      soft_next_step_candidate: string | null;
      reactivation_candidate: string | null;
      coach_intent: string | null;
    };
  };
  exit_memo: PostMorningNudgeEmotionalPresenceExitMemo;
  evidence: string[];
};

export type PostMorningNudgeEmotionalPresenceDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: PostMorningNudgeActiveState;
};

export type PostMorningNudgeEmotionalPresenceVisibleInput = {
  user_id: string;
  request_id?: string | null;
  state: PostMorningNudgeActiveState;
  decision: PostMorningNudgeEmotionalPresenceDispatcherOutput;
};

export type PostMorningNudgeEmotionalPresenceDispatcher = (
  input: PostMorningNudgeEmotionalPresenceDispatcherInput,
) => Promise<PostMorningNudgeEmotionalPresenceDispatcherOutput | null>;

export type PostMorningNudgeEmotionalPresenceVisibleAgent = (
  input: PostMorningNudgeEmotionalPresenceVisibleInput,
) => Promise<string | null>;

export const POST_MORNING_NUDGE_TEMP_MEMORY_KEY =
  "__post_morning_nudge_active_state_v1";
export const LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY =
  "__last_post_morning_nudge_exit_memo";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, 12)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = cleanText(raw);
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("post_morning_nudge_action_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("post_morning_nudge_action_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
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

function actionFlowAction(value: unknown): PostMorningNudgeActionFlowAction {
  const raw = cleanText(value);
  return [
      "quick_close_ready",
      "motivate_light",
      "choose_first_step",
      "reduce_scope",
      "handle_blocker",
      "support_not_today",
      "meaning_reconnect",
      "ask_action_clarification",
      "repeat_nudge_context",
      "negative_nudge_feedback",
      "cancel_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as PostMorningNudgeActionFlowAction
    : "ask_action_clarification";
}

function actionVisibleTaskKind(
  value: unknown,
): PostMorningNudgeActionVisibleTaskKind {
  const raw = cleanText(value);
  return [
      "quick_close",
      "gentle_boost",
      "choose_first_step",
      "reduce_scope",
      "blocker_help",
      "not_today_protective_close",
      "meaning_reconnect",
      "ask_action_clarification",
      "repeat_context",
      "negative_feedback_close",
      "exit_or_cancel",
      "safety",
    ].includes(raw)
    ? raw as PostMorningNudgeActionVisibleTaskKind
    : "ask_action_clarification";
}

function postMorningStatus(value: unknown): PostMorningNudgeStatus {
  const raw = cleanText(value);
  return [
      "active",
      "closing",
      "closed",
      "exit_to_global",
      "safety",
    ].includes(raw)
    ? raw as PostMorningNudgeStatus
    : "active";
}

function actionReadiness(
  value: unknown,
): PostMorningNudgeLocalAssessment["action_readiness"] {
  const raw = cleanText(value);
  return [
      "ready",
      "hesitant",
      "blocked",
      "overloaded",
      "not_today",
      "wants_minimal",
      "wants_full",
      "needs_support",
      "unclear",
      "not_applicable",
      "wants_direction",
      "unknown",
    ].includes(raw)
    ? raw as PostMorningNudgeLocalAssessment["action_readiness"]
    : "unknown";
}

function motivationNeed(
  value: unknown,
): PostMorningNudgeLocalAssessment["motivation_need"] {
  const raw = cleanText(value);
  return ["none", "light", "medium", "high", "unknown"].includes(raw)
    ? raw as PostMorningNudgeLocalAssessment["motivation_need"]
    : "unknown";
}

function emotionalLoad(
  value: unknown,
): PostMorningNudgeLocalAssessment["emotional_load"] {
  const raw = cleanText(value);
  return ["low", "medium", "high", "unknown"].includes(raw)
    ? raw as PostMorningNudgeLocalAssessment["emotional_load"]
    : "unknown";
}

function nullableString(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "null" ? text : null;
}

function actionLocalAssessment(
  raw: unknown,
): PostMorningNudgeLocalAssessment {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    action_readiness: actionReadiness(root.action_readiness),
    motivation_need: motivationNeed(root.motivation_need),
    emotional_load: emotionalLoad(root.emotional_load),
    user_wants_conversation: root.user_wants_conversation === true,
    target_action_reference: nullableString(root.target_action_reference),
    main_friction: nullableString(root.main_friction),
    next_step_candidate: nullableString(root.next_step_candidate),
    scope_reduction_candidate: nullableString(root.scope_reduction_candidate),
  };
}

function suppressedActionFlowAction(
  value: unknown,
): PostMorningNudgeSuppressedActionFlowAction {
  const raw = cleanText(value);
  return [
      "protective_close",
      "support_emotion",
      "offer_minimal_save",
      "confirm_no_action_today",
      "reopen_action_gently",
      "ask_suppressed_action_clarification",
      "repeat_protective_context",
      "negative_nudge_feedback",
      "cancel_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as PostMorningNudgeSuppressedActionFlowAction
    : "ask_suppressed_action_clarification";
}

function suppressedActionVisibleTaskKind(
  value: unknown,
): PostMorningNudgeSuppressedActionVisibleTaskKind {
  const raw = cleanText(value);
  return [
      "protective_close",
      "soft_support",
      "offer_minimal_save",
      "confirm_no_action_today",
      "reopen_action_gently",
      "ask_suppressed_action_clarification",
      "repeat_protective_context",
      "negative_feedback_close",
      "exit_or_cancel",
      "safety",
    ].includes(raw)
    ? raw as PostMorningNudgeSuppressedActionVisibleTaskKind
    : "ask_suppressed_action_clarification";
}

function mainNeed(
  value: unknown,
): NonNullable<PostMorningNudgeLocalAssessment["main_need"]> {
  const raw = cleanText(value);
  return ["rest", "support", "minimal_progress", "clarity", "space", "unknown"]
      .includes(raw)
    ? raw as NonNullable<PostMorningNudgeLocalAssessment["main_need"]>
    : "unknown";
}

function suppressedActionLocalAssessment(
  raw: unknown,
): PostMorningNudgeLocalAssessment {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    action_readiness: actionReadiness(root.action_readiness),
    motivation_need: motivationNeed(root.motivation_need),
    emotional_load: emotionalLoad(root.emotional_load),
    user_wants_conversation: root.user_wants_conversation === true,
    suppression_still_valid: root.suppression_still_valid !== false,
    target_action_reference: nullableString(root.target_action_reference),
    main_need: mainNeed(root.main_need),
    minimal_save_candidate: nullableString(root.minimal_save_candidate),
    reopen_step_candidate: nullableString(root.reopen_step_candidate),
  };
}

function emotionalPresenceFlowAction(
  value: unknown,
): PostMorningNudgeEmotionalPresenceFlowAction {
  const raw = cleanText(value);
  return [
      "presence_ack_close",
      "hold_space_support",
      "ask_support_preference",
      "offer_soft_next_step",
      "reactivate_gently",
      "clarify_emotional_need",
      "repeat_presence_context",
      "negative_nudge_feedback",
      "cancel_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as PostMorningNudgeEmotionalPresenceFlowAction
    : "clarify_emotional_need";
}

function emotionalPresenceVisibleTaskKind(
  value: unknown,
): PostMorningNudgeEmotionalPresenceVisibleTaskKind {
  const raw = cleanText(value);
  return [
      "presence_close",
      "hold_space",
      "ask_support_preference",
      "offer_soft_next_step",
      "reactivate_gently",
      "clarify_emotional_need",
      "repeat_presence_context",
      "negative_feedback_close",
      "exit_or_cancel",
      "safety",
    ].includes(raw)
    ? raw as PostMorningNudgeEmotionalPresenceVisibleTaskKind
    : "clarify_emotional_need";
}

function supportNeed(
  value: unknown,
): NonNullable<PostMorningNudgeLocalAssessment["support_need"]> {
  const raw = cleanText(value);
  return [
      "none",
      "listen",
      "soft_next_step",
      "reactivation",
      "space",
      "clarity",
      "unknown",
    ].includes(raw)
    ? raw as NonNullable<PostMorningNudgeLocalAssessment["support_need"]>
    : "unknown";
}

function emotionalPresenceLocalAssessment(
  raw: unknown,
): PostMorningNudgeLocalAssessment {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    action_readiness: actionReadiness(root.action_readiness),
    motivation_need: motivationNeed(root.motivation_need),
    emotional_load: emotionalLoad(root.emotional_load),
    user_wants_conversation: root.user_wants_conversation !== false,
    support_need: supportNeed(root.support_need),
    main_emotion_or_context: nullableString(root.main_emotion_or_context),
    soft_next_step_candidate: nullableString(root.soft_next_step_candidate),
    reactivation_candidate: nullableString(root.reactivation_candidate),
  };
}

function normalizeEmotionalPresenceExitMemo(args: {
  raw: unknown;
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  flowAction: PostMorningNudgeEmotionalPresenceFlowAction;
}): PostMorningNudgeEmotionalPresenceExitMemo {
  const root = args.raw && typeof args.raw === "object" &&
      !Array.isArray(args.raw)
    ? args.raw as Record<string, unknown>
    : {};
  const reasonRaw = cleanText(root.reason);
  const reason = [
      "topic_change",
      "explicit_tool_request",
      "new_goal",
      "product_help",
      "status_question",
      "preference_update",
      "safety",
      "unknown",
      "none",
    ].includes(reasonRaw)
    ? reasonRaw as PostMorningNudgeEmotionalPresenceExitMemo["reason"]
    : args.flowAction === "safety_preempt"
    ? "safety"
    : args.flowAction === "exit_to_global_dispatcher"
    ? "unknown"
    : "none";
  const hint = root.handoff_hint_for_global_dispatcher &&
      typeof root.handoff_hint_for_global_dispatcher === "object"
    ? root.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const likelyIntentRaw = cleanText(hint.likely_intent);
  const likelyIntent = [
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
      "product_help",
      "normal_coaching",
      "unknown",
    ].includes(likelyIntentRaw)
    ? likelyIntentRaw as PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"]
    : "unknown";
  return {
    needed: args.flowAction === "exit_to_global_dispatcher" ||
      args.flowAction === "safety_preempt",
    reason,
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "emotional_presence",
      source_nudge_summary: summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: [],
      suppressed_action_titles: [],
      suppression_reason: null,
      last_local_assessment: JSON.stringify(args.assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: likelyIntent,
      why: nullableString(hint.why),
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
        "Remember that the source nudge had no hidden target action.",
      ],
    },
  };
}

export function normalizePostMorningNudgeEmotionalPresenceDispatcherOutput(
  raw: unknown,
  state: PostMorningNudgeActiveState,
): PostMorningNudgeEmotionalPresenceDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = emotionalPresenceFlowAction(root.flow_action);
  const assessment = emotionalPresenceLocalAssessment(root.local_assessment);
  const stateUpdates = root.state_updates && typeof root.state_updates ===
      "object" &&
      !Array.isArray(root.state_updates)
    ? root.state_updates as Record<string, unknown>
    : {};
  const visibleTask = root.visible_task && typeof root.visible_task ===
      "object" &&
      !Array.isArray(root.visible_task)
    ? root.visible_task as Record<string, unknown>
    : {};
  const visibleData = visibleTask.data && typeof visibleTask.data ===
      "object" &&
      !Array.isArray(visibleTask.data)
    ? visibleTask.data as Record<string, unknown>
    : {};
  const output: PostMorningNudgeEmotionalPresenceDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: boundedRiskScore(root.risk_score),
    local_assessment: assessment,
    state_updates: {
      status: postMorningStatus(stateUpdates.status),
      turn_count_increment: Math.max(
        1,
        Math.floor(Number(stateUpdates.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateUpdates.close_after_visible === true,
    },
    visible_task: {
      kind: emotionalPresenceVisibleTaskKind(visibleTask.kind),
      instruction: cleanText(visibleTask.instruction),
      data: {
        source_nudge_summary: nullableString(
          visibleData.source_nudge_summary,
        ) ?? summarizeSourceNudge(state.source_nudge),
        main_emotion_or_context: nullableString(
          visibleData.main_emotion_or_context,
        ) ?? assessment.main_emotion_or_context ?? null,
        soft_next_step_candidate: nullableString(
          visibleData.soft_next_step_candidate,
        ) ?? assessment.soft_next_step_candidate ?? null,
        reactivation_candidate: nullableString(
          visibleData.reactivation_candidate,
        ) ?? assessment.reactivation_candidate ?? null,
        coach_intent: nullableString(visibleData.coach_intent) ??
          nullableString(state.source_nudge.coach_intent),
      },
    },
    exit_memo: normalizeEmotionalPresenceExitMemo({
      raw: root.exit_memo,
      state,
      assessment,
      flowAction,
    }),
    evidence: stringArray(root.evidence),
  };
  if (
    (flowAction === "exit_to_global_dispatcher" ||
      flowAction === "safety_preempt") && !output.exit_memo.needed
  ) {
    throw new Error(
      "post_morning_nudge_emotional_presence_exit_memo_required",
    );
  }
  if (
    flowAction === "exit_to_global_dispatcher" &&
    output.exit_memo.reason === "none"
  ) {
    throw new Error(
      "post_morning_nudge_emotional_presence_exit_memo_reason_required",
    );
  }
  return output;
}

function normalizeSuppressedActionExitMemo(args: {
  raw: unknown;
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  flowAction: PostMorningNudgeSuppressedActionFlowAction;
}): PostMorningNudgeSuppressedActionExitMemo {
  const root = args.raw && typeof args.raw === "object" &&
      !Array.isArray(args.raw)
    ? args.raw as Record<string, unknown>
    : {};
  const reasonRaw = cleanText(root.reason);
  const reason = [
      "topic_change",
      "explicit_tool_request",
      "new_goal",
      "product_help",
      "status_question",
      "preference_update",
      "safety",
      "unknown",
      "none",
    ].includes(reasonRaw)
    ? reasonRaw as PostMorningNudgeSuppressedActionExitMemo["reason"]
    : args.flowAction === "safety_preempt"
    ? "safety"
    : args.flowAction === "exit_to_global_dispatcher"
    ? "unknown"
    : "none";
  const hint = root.handoff_hint_for_global_dispatcher &&
      typeof root.handoff_hint_for_global_dispatcher === "object"
    ? root.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const likelyIntentRaw = cleanText(hint.likely_intent);
  const likelyIntent = [
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
      "product_help",
      "normal_coaching",
      "unknown",
    ].includes(likelyIntentRaw)
    ? likelyIntentRaw as PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"]
    : "unknown";
  return {
    needed: args.flowAction === "exit_to_global_dispatcher" ||
      args.flowAction === "safety_preempt",
    reason,
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "suppressed_action",
      source_nudge_summary: summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: stringArray(
        args.state.source_nudge.target_action_titles,
      ),
      suppressed_action_titles: stringArray(
        args.state.source_nudge.suppressed_action_titles,
      ),
      suppression_reason: args.state.source_nudge.suppression_reason,
      last_local_assessment: JSON.stringify(args.assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: likelyIntent,
      why: nullableString(hint.why),
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
        "Remember that the source nudge intentionally suppressed an action instead of pushing it.",
      ],
    },
  };
}

export function normalizePostMorningNudgeSuppressedActionDispatcherOutput(
  raw: unknown,
  state: PostMorningNudgeActiveState,
): PostMorningNudgeSuppressedActionDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = suppressedActionFlowAction(root.flow_action);
  const assessment = suppressedActionLocalAssessment(root.local_assessment);
  const stateUpdates = root.state_updates && typeof root.state_updates ===
      "object" &&
      !Array.isArray(root.state_updates)
    ? root.state_updates as Record<string, unknown>
    : {};
  const visibleTask = root.visible_task && typeof root.visible_task ===
      "object" &&
      !Array.isArray(root.visible_task)
    ? root.visible_task as Record<string, unknown>
    : {};
  const visibleData = visibleTask.data && typeof visibleTask.data ===
      "object" &&
      !Array.isArray(visibleTask.data)
    ? visibleTask.data as Record<string, unknown>
    : {};
  const suppressedTitles = stringArray(
    state.source_nudge.suppressed_action_titles,
  );
  const targetTitles = stringArray(state.source_nudge.target_action_titles);
  const output: PostMorningNudgeSuppressedActionDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: boundedRiskScore(root.risk_score),
    local_assessment: assessment,
    state_updates: {
      status: postMorningStatus(stateUpdates.status),
      turn_count_increment: Math.max(
        1,
        Math.floor(Number(stateUpdates.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateUpdates.close_after_visible === true,
    },
    visible_task: {
      kind: suppressedActionVisibleTaskKind(visibleTask.kind),
      instruction: cleanText(visibleTask.instruction),
      data: {
        suppressed_action_titles:
          stringArray(visibleData.suppressed_action_titles).length > 0
            ? stringArray(visibleData.suppressed_action_titles)
            : suppressedTitles,
        target_action_titles: stringArray(visibleData.target_action_titles)
            .length > 0
          ? stringArray(visibleData.target_action_titles)
          : targetTitles,
        suppression_reason: nullableString(visibleData.suppression_reason) ??
          state.source_nudge.suppression_reason,
        main_need: nullableString(visibleData.main_need) ??
          assessment.main_need ?? null,
        minimal_save_candidate: nullableString(
          visibleData.minimal_save_candidate,
        ) ?? assessment.minimal_save_candidate ?? null,
        reopen_step_candidate: nullableString(
          visibleData.reopen_step_candidate,
        ) ?? assessment.reopen_step_candidate ?? null,
      },
    },
    exit_memo: normalizeSuppressedActionExitMemo({
      raw: root.exit_memo,
      state,
      assessment,
      flowAction,
    }),
    evidence: stringArray(root.evidence),
  };
  if (
    (flowAction === "exit_to_global_dispatcher" ||
      flowAction === "safety_preempt") && !output.exit_memo.needed
  ) {
    throw new Error("post_morning_nudge_suppressed_exit_memo_required");
  }
  if (
    flowAction === "exit_to_global_dispatcher" &&
    output.exit_memo.reason === "none"
  ) {
    throw new Error("post_morning_nudge_suppressed_exit_memo_reason_required");
  }
  return output;
}

function normalizeActionExitMemo(args: {
  raw: unknown;
  state: PostMorningNudgeActiveState;
  assessment: PostMorningNudgeLocalAssessment;
  flowAction: PostMorningNudgeActionFlowAction;
}): PostMorningNudgeActionExitMemo {
  const root = args.raw && typeof args.raw === "object" &&
      !Array.isArray(args.raw)
    ? args.raw as Record<string, unknown>
    : {};
  const reasonRaw = cleanText(root.reason);
  const reason = [
      "topic_change",
      "explicit_tool_request",
      "new_goal",
      "product_help",
      "status_question",
      "preference_update",
      "safety",
      "unknown",
      "none",
    ].includes(reasonRaw)
    ? reasonRaw as PostMorningNudgeActionExitMemo["reason"]
    : args.flowAction === "safety_preempt"
    ? "safety"
    : args.flowAction === "exit_to_global_dispatcher"
    ? "unknown"
    : "none";
  const hint = root.handoff_hint_for_global_dispatcher &&
      typeof root.handoff_hint_for_global_dispatcher === "object"
    ? root.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const likelyIntentRaw = cleanText(hint.likely_intent);
  const likelyIntent = [
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
      "product_help",
      "normal_coaching",
      "unknown",
    ].includes(likelyIntentRaw)
    ? likelyIntentRaw as PostMorningNudgeExitMemo[
      "handoff_hint_for_global_dispatcher"
    ]["likely_intent"]
    : "unknown";
  return {
    needed: args.flowAction === "exit_to_global_dispatcher" ||
      args.flowAction === "safety_preempt",
    reason,
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "action",
      source_nudge_summary: summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: stringArray(
        args.state.source_nudge.target_action_titles,
      ),
      suppressed_action_titles: [],
      suppression_reason: null,
      last_local_assessment: JSON.stringify(args.assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: likelyIntent,
      why: nullableString(hint.why),
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
      ],
    },
  };
}

export function normalizePostMorningNudgeActionDispatcherOutput(
  raw: unknown,
  state: PostMorningNudgeActiveState,
): PostMorningNudgeActionDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = actionFlowAction(root.flow_action);
  const assessment = actionLocalAssessment(root.local_assessment);
  const stateUpdates = root.state_updates && typeof root.state_updates ===
      "object" &&
      !Array.isArray(root.state_updates)
    ? root.state_updates as Record<string, unknown>
    : {};
  const visibleTask = root.visible_task && typeof root.visible_task ===
      "object" &&
      !Array.isArray(root.visible_task)
    ? root.visible_task as Record<string, unknown>
    : {};
  const visibleData = visibleTask.data && typeof visibleTask.data ===
      "object" &&
      !Array.isArray(visibleTask.data)
    ? visibleTask.data as Record<string, unknown>
    : {};
  const output: PostMorningNudgeActionDispatcherOutput = {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: boundedRiskScore(root.risk_score),
    local_assessment: assessment,
    state_updates: {
      status: postMorningStatus(stateUpdates.status),
      turn_count_increment: Math.max(
        1,
        Math.floor(Number(stateUpdates.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateUpdates.close_after_visible === true,
    },
    visible_task: {
      kind: actionVisibleTaskKind(visibleTask.kind),
      instruction: cleanText(visibleTask.instruction),
      data: {
        target_action_titles: stringArray(visibleData.target_action_titles)
            .length > 0
          ? stringArray(visibleData.target_action_titles)
          : stringArray(state.source_nudge.target_action_titles),
        target_item_titles: stringArray(visibleData.target_item_titles)
            .length > 0
          ? stringArray(visibleData.target_item_titles)
          : stringArray(state.source_nudge.target_item_titles),
        main_friction: nullableString(visibleData.main_friction) ??
          assessment.main_friction ?? null,
        next_step_candidate: nullableString(visibleData.next_step_candidate) ??
          assessment.next_step_candidate ?? null,
        scope_reduction_candidate: nullableString(
          visibleData.scope_reduction_candidate,
        ) ?? assessment.scope_reduction_candidate ?? null,
      },
    },
    exit_memo: normalizeActionExitMemo({
      raw: root.exit_memo,
      state,
      assessment,
      flowAction,
    }),
    evidence: stringArray(root.evidence),
  };
  if (
    (flowAction === "exit_to_global_dispatcher" ||
      flowAction === "safety_preempt") && !output.exit_memo.needed
  ) {
    throw new Error("post_morning_nudge_action_exit_memo_required");
  }
  if (
    flowAction === "exit_to_global_dispatcher" &&
    output.exit_memo.reason === "none"
  ) {
    throw new Error("post_morning_nudge_action_exit_memo_reason_required");
  }
  return output;
}

function defaultLocalAssessment(): PostMorningNudgeLocalAssessment {
  return {
    action_readiness: "unknown",
    motivation_need: "unknown",
    emotional_load: "unknown",
    user_wants_conversation: false,
  };
}

export function createPostMorningNudgeActiveState(args: {
  sourceNudge: MorningNudgePayloadV2;
  nowIso?: string | null;
  maxTurns?: number | null;
}): PostMorningNudgeActiveState | null {
  if (
    !args.sourceNudge.opens_local_flow ||
    !isPostMorningNudgeFlowKind(args.sourceNudge.intended_followup_flow)
  ) {
    return null;
  }
  const nowIso = cleanText(args.nowIso) || new Date().toISOString();
  const maxTurns = Math.max(1, Math.floor(Number(args.maxTurns ?? 3) || 3));
  return {
    skill_id: "post_morning_nudge",
    flow_kind: args.sourceNudge.intended_followup_flow,
    status: "active",
    source_nudge: args.sourceNudge,
    local_assessment: defaultLocalAssessment(),
    turn_count: 0,
    max_turns: maxTurns,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function readPostMorningNudgeActiveState(
  tempMemory: unknown,
): PostMorningNudgeActiveState | null {
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  const raw = temp[POST_MORNING_NUDGE_TEMP_MEMORY_KEY] ??
    temp.__active_skill_state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.skill_id !== "post_morning_nudge") return null;
  if (!isPostMorningNudgeFlowKind(record.flow_kind)) return null;
  const status = cleanText(record.status);
  if (
    !["active", "closing", "closed", "exit_to_global", "safety"].includes(
      status,
    )
  ) return null;
  if (status !== "active" && status !== "closing") return null;
  const source = record.source_nudge;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  return {
    skill_id: "post_morning_nudge",
    flow_kind: record.flow_kind,
    status: status as PostMorningNudgeStatus,
    source_nudge: source as MorningNudgePayloadV2,
    local_assessment: {
      ...defaultLocalAssessment(),
      ...((record.local_assessment && typeof record.local_assessment ===
            "object")
        ? record.local_assessment as Partial<PostMorningNudgeLocalAssessment>
        : {}),
    },
    turn_count: Math.max(0, Math.floor(Number(record.turn_count ?? 0) || 0)),
    max_turns: Math.max(1, Math.floor(Number(record.max_turns ?? 3) || 3)),
    created_at: cleanText(record.created_at) || new Date().toISOString(),
    updated_at: cleanText(record.updated_at) || new Date().toISOString(),
  };
}

export function writePostMorningNudgeActiveState(
  tempMemory: unknown,
  state: PostMorningNudgeActiveState,
): Record<string, unknown> {
  return {
    ...((tempMemory ?? {}) as Record<string, unknown>),
    [POST_MORNING_NUDGE_TEMP_MEMORY_KEY]: state,
    __active_skill_state: state,
    active_skill_state: state,
  };
}

export function clearPostMorningNudgeActiveState(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  delete next[POST_MORNING_NUDGE_TEMP_MEMORY_KEY];
  const active = next.__active_skill_state as any;
  if (active?.skill_id === "post_morning_nudge") {
    delete next.__active_skill_state;
  }
  const legacy = next.active_skill_state as any;
  if (legacy?.skill_id === "post_morning_nudge") {
    delete next.active_skill_state;
  }
  return next;
}

export function resolvePostMorningNudgeDispatcher(
  state: PostMorningNudgeActiveState,
): PostMorningNudgeDispatcherOutput["dispatcher_id"] {
  if (state.flow_kind === "action") {
    return "post_morning_nudge.action_dispatcher";
  }
  if (state.flow_kind === "suppressed_action") {
    return "post_morning_nudge.suppressed_action_dispatcher";
  }
  return "post_morning_nudge.emotional_presence_dispatcher";
}

function summarizeSourceNudge(source: MorningNudgePayloadV2): string {
  const titles = [
    ...stringArray(source.target_action_titles),
    ...stringArray(source.suppressed_action_titles),
  ].slice(0, 3);
  return [
    `nudge_kind=${source.nudge_kind}`,
    `posture=${source.posture}`,
    titles.length > 0 ? `titles=${titles.join(" | ")}` : "",
  ].filter(Boolean).join("; ");
}

export function buildPostMorningNudgeExitMemo(args: {
  state: PostMorningNudgeActiveState;
  reason?: PostMorningNudgeExitMemo["reason"];
  userIntentSummary?: string | null;
  likelyIntent?: PostMorningNudgeExitMemo[
    "handoff_hint_for_global_dispatcher"
  ]["likely_intent"];
  why?: string | null;
}): PostMorningNudgeExitMemo {
  return {
    needed: true,
    reason: args.reason ?? "unknown",
    user_intent_summary: cleanText(args.userIntentSummary) ||
      "User message needs global dispatcher routing outside post morning nudge.",
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: args.state.flow_kind,
      source_nudge_summary: summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: stringArray(
        args.state.source_nudge
          .target_action_titles,
      ),
      suppressed_action_titles: stringArray(
        args.state.source_nudge
          .suppressed_action_titles,
      ),
      suppression_reason: args.state.source_nudge.suppression_reason,
      last_local_assessment: JSON.stringify(args.state.local_assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: args.likelyIntent ?? "unknown",
      why: cleanText(args.why) ||
        "Local post morning nudge dispatcher explicitly exited.",
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
      ],
    },
  };
}

function actionDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.action.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type action_nudge. Le user vient de repondre a ce nudge.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: determiner si le user est pret, hesite, a besoin d'une premiere marche, d'une reduction de scope, d'une aide sur bloqueur, d'un soutien pas-aujourd'hui, d'une reconnexion au sens, ou si le message doit sortir vers le dispatcher global.",
    "Actions possibles: quick_close_ready, motivate_light, choose_first_step, reduce_scope, handle_blocker, support_not_today, meaning_reconnect, ask_action_clarification, repeat_nudge_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec exit_memo utile.",
    "Si flow_action=quick_close_ready, state_updates.close_after_visible=true. Si flow_action=cancel_flow, ferme le flow. Si flow_action=exit_to_global_dispatcher, exit_memo.needed=true est obligatoire et aucun message local ne sera emis.",
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeActionDispatcher(
  input: PostMorningNudgeActionDispatcherInput,
): Promise<PostMorningNudgeActionDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_action_dispatcher",
    source_nudge_json: input.active_state.source_nudge,
    post_morning_nudge_state_json: input.active_state,
    user_message: input.user_message,
    conversation_excerpt: input.recent_messages,
    turn_count: input.active_state.turn_count,
    max_turns: input.active_state.max_turns,
    action_context: {
      target_action_titles: input.active_state.source_nudge
        .target_action_titles,
      target_item_titles: input.active_state.source_nudge.target_item_titles,
      source_reason: input.active_state.source_nudge.source_reason,
      source_grounding: input.active_state.source_nudge.source_grounding,
    },
    required_json_shape: {
      flow_action:
        "quick_close_ready|motivate_light|choose_first_step|reduce_scope|handle_blocker|support_not_today|meaning_reconnect|ask_action_clarification|repeat_nudge_context|negative_nudge_feedback|cancel_flow|exit_to_global_dispatcher|safety_preempt",
      confidence: "low|medium|high",
      risk_score: 0,
      local_assessment: {
        action_readiness: "ready|hesitant|blocked|overloaded|not_today|unknown",
        motivation_need: "none|light|medium|high|unknown",
        emotional_load: "low|medium|high|unknown",
        user_wants_conversation: true,
        target_action_reference: "string|null",
        main_friction: "string|null",
        next_step_candidate: "string|null",
        scope_reduction_candidate: "string|null",
      },
      state_updates: {
        status: "active|closing|closed|exit_to_global|safety",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind:
          "quick_close|gentle_boost|choose_first_step|reduce_scope|blocker_help|not_today_protective_close|meaning_reconnect|ask_action_clarification|repeat_context|negative_feedback_close|exit_or_cancel|safety",
        instruction: "string",
        data: "object",
      },
      exit_memo: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      actionDispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "post_morning_nudge.action_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePostMorningNudgeActionDispatcherOutput(
      raw,
      input.active_state,
    );
  } catch (error) {
    console.warn("[PostMorningNudge] action dispatcher failed", error);
    return null;
  }
}

function visibleSystemPrompt(
  kind: PostMorningNudgeActionVisibleTaskKind,
): string {
  const base = [
    "Tu ecris le prochain message visible de Sophia.",
    "Tu ne remplis pas l'etat, tu ne routes pas, tu ne crees aucun effet durable.",
    "Ne dis pas qu'une action, carte, potion, rappel, preference ou modification de plan a ete creee.",
    "Retourne uniquement le message visible.",
  ];
  const byKind: Record<PostMorningNudgeActionVisibleTaskKind, string> = {
    quick_close:
      "Le user est pret apres le nudge d'action. Reponds court, soutiens l'elan et ferme sans nouvelle question.",
    gentle_boost:
      "Le user hesite legerement. Donne un boost court, concret, lie a l'action cible, sans culpabilisation.",
    choose_first_step:
      "Le user ne sait pas par ou commencer. Propose une seule premiere marche simple, sans modifier le plan.",
    reduce_scope:
      "Le user trouve l'action trop lourde. Aide a viser une version plus petite, sans dire que le plan est modifie.",
    blocker_help:
      "Le user donne un bloqueur concret. Reconnais-le en une phrase maximum et donne une seule piste praticable.",
    not_today_protective_close:
      "Le user dit qu'il ne peut pas aujourd'hui. Baisse la pression, ne pousse pas l'action, ferme proprement.",
    meaning_reconnect:
      "Le user doute du sens. Reconnecte brievement l'action a son sens sans ouvrir une potion ni un long travail de clarte.",
    ask_action_clarification:
      "La reponse est vague. Pose une seule question naturelle centree sur l'action du matin.",
    repeat_context:
      "Le user demande de redire le cap. Rappelle tres court le contexte du nudge.",
    negative_feedback_close:
      "Le user reagit negativement au nudge. Reconnais le retour, baisse la pression, ferme sans insister.",
    exit_or_cancel:
      "Le user annule le followup sans autre demande a router. Ferme le flow local proprement.",
    safety:
      "Signal safety. Ne fais pas de coaching action; reponse courte et prudente orientee soutien immediat.",
  };
  return [...base, byKind[kind]].join("\n");
}

export async function runPostMorningNudgeActionVisiblePrompt(
  input: PostMorningNudgeActionVisibleInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_action_visible_prompt",
    visible_task_kind: input.decision.visible_task.kind,
    visible_task_instruction: input.decision.visible_task.instruction,
    source_nudge_summary: summarizeSourceNudge(input.state.source_nudge),
    target_action_titles: input.decision.visible_task.data
      .target_action_titles,
    target_item_titles: input.decision.visible_task.data.target_item_titles,
    main_friction: input.decision.visible_task.data.main_friction,
    next_step_candidate: input.decision.visible_task.data.next_step_candidate,
    scope_reduction_candidate: input.decision.visible_task.data
      .scope_reduction_candidate,
    emotional_load: input.decision.local_assessment.emotional_load,
  });
  try {
    const raw = await generateWithGemini(
      visibleSystemPrompt(input.decision.visible_task.kind),
      userPrompt,
      0.35,
      false,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source:
          `post_morning_nudge.action_visible.${input.decision.visible_task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return cleanText(raw) || null;
  } catch (error) {
    console.warn("[PostMorningNudge] action visible prompt failed", error);
    return null;
  }
}

function suppressedActionDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.suppressed_action.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type suppressed_action_nudge: il y avait une action prevue, mais Sophia a choisi de ne pas la pousser a cause de l'etat du user.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: preserver la protection initiale, soutenir sans pression, proposer une micro-version uniquement si le user veut sauver quelque chose, ou sortir vers le global si le message quitte ce followup.",
    "Actions possibles: protective_close, support_emotion, offer_minimal_save, confirm_no_action_today, reopen_action_gently, ask_suppressed_action_clarification, repeat_protective_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "Ne pousse pas l'action par defaut. Ne dis jamais que le plan est modifie, reporte, allege ou supprime.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec exit_memo utile.",
    "Si le user veut quand meme sauver une micro-version ou avancer, reste dans le flow local avec offer_minimal_save ou reopen_action_gently.",
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeSuppressedActionDispatcher(
  input: PostMorningNudgeSuppressedActionDispatcherInput,
): Promise<PostMorningNudgeSuppressedActionDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_suppressed_action_dispatcher",
    source_nudge_json: input.active_state.source_nudge,
    post_morning_nudge_state_json: input.active_state,
    user_message: input.user_message,
    conversation_excerpt: input.recent_messages,
    turn_count: input.active_state.turn_count,
    max_turns: input.active_state.max_turns,
    suppressed_action_titles: input.active_state.source_nudge
      .suppressed_action_titles,
    suppression_reason: input.active_state.source_nudge.suppression_reason,
    action_context: {
      target_action_titles: input.active_state.source_nudge
        .target_action_titles,
      target_item_titles: input.active_state.source_nudge.target_item_titles,
      source_reason: input.active_state.source_nudge.source_reason,
      source_grounding: input.active_state.source_nudge.source_grounding,
    },
    required_json_shape: {
      flow_action:
        "protective_close|support_emotion|offer_minimal_save|confirm_no_action_today|reopen_action_gently|ask_suppressed_action_clarification|repeat_protective_context|negative_nudge_feedback|cancel_flow|exit_to_global_dispatcher|safety_preempt",
      confidence: "low|medium|high",
      risk_score: 0,
      local_assessment: {
        action_readiness:
          "wants_minimal|wants_full|not_today|needs_support|unclear|unknown",
        motivation_need: "none|light|medium|high|unknown",
        emotional_load: "low|medium|high|unknown",
        user_wants_conversation: true,
        suppression_still_valid: true,
        target_action_reference: "string|null",
        main_need: "rest|support|minimal_progress|clarity|space|unknown",
        minimal_save_candidate: "string|null",
        reopen_step_candidate: "string|null",
      },
      state_updates: {
        status: "active|closing|closed|exit_to_global|safety",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind:
          "protective_close|soft_support|offer_minimal_save|confirm_no_action_today|reopen_action_gently|ask_suppressed_action_clarification|repeat_protective_context|negative_feedback_close|exit_or_cancel|safety",
        instruction: "string",
        data: "object",
      },
      exit_memo: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      suppressedActionDispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "post_morning_nudge.suppressed_action_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePostMorningNudgeSuppressedActionDispatcherOutput(
      raw,
      input.active_state,
    );
  } catch (error) {
    console.warn(
      "[PostMorningNudge] suppressed action dispatcher failed",
      error,
    );
    return null;
  }
}

function suppressedVisibleSystemPrompt(
  kind: PostMorningNudgeSuppressedActionVisibleTaskKind,
): string {
  const base = [
    "Tu ecris le prochain message visible de Sophia.",
    "Tu ne remplis pas l'etat, tu ne routes pas, tu ne crees aucun effet durable.",
    "Ne pousse pas l'action par defaut. Ne dis pas que le plan est modifie, reporte ou allege.",
    "Ne dis pas qu'une action, carte, potion, rappel, preference ou modification de plan a ete creee.",
    "Retourne uniquement le message visible.",
  ];
  const byKind: Record<
    PostMorningNudgeSuppressedActionVisibleTaskKind,
    string
  > = {
    protective_close:
      "Le user accepte ou accuse reception du nudge protecteur. Confirme doucement qu'on ne force pas ce matin, puis ferme sans relancer.",
    soft_support:
      "Le user exprime fatigue, charge emotionnelle ou saturation. Soutiens sans ramener l'action au centre.",
    offer_minimal_save:
      "Le user aimerait sauver une petite partie de l'action. Propose une seule micro-version non culpabilisante.",
    confirm_no_action_today:
      "Le user dit clairement qu'il ne peut pas ou ne veut pas faire l'action aujourd'hui. Confirme que Sophia ne pousse pas.",
    reopen_action_gently:
      "Le user veut quand meme avancer. Aide a rouvrir doucement une premiere marche simple sans nier la charge initiale.",
    ask_suppressed_action_clarification:
      "La reponse est vague. Pose une seule question naturelle, sans remettre de pression.",
    repeat_protective_context:
      "Le user demande pourquoi Sophia n'a pas pousse l'action. Rappelle court le contexte protecteur.",
    negative_feedback_close:
      "Le user reagit negativement au nudge protecteur. Reconnais le retour, baisse la pression, ferme sans insister.",
    exit_or_cancel:
      "Le user annule le followup sans autre demande a router. Ferme le flow local proprement.",
    safety:
      "Signal safety. Ne continue pas le coaching action; reste minimal et laisse la pipeline safety reprendre.",
  };
  return [...base, byKind[kind]].join("\n");
}

export async function runPostMorningNudgeSuppressedActionVisiblePrompt(
  input: PostMorningNudgeSuppressedActionVisibleInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_suppressed_action_visible_prompt",
    visible_task_kind: input.decision.visible_task.kind,
    visible_task_instruction: input.decision.visible_task.instruction,
    source_nudge_summary: summarizeSourceNudge(input.state.source_nudge),
    suppressed_action_titles: input.decision.visible_task.data
      .suppressed_action_titles,
    target_action_titles: input.decision.visible_task.data
      .target_action_titles,
    suppression_reason: input.decision.visible_task.data.suppression_reason,
    main_need: input.decision.visible_task.data.main_need,
    minimal_save_candidate: input.decision.visible_task.data
      .minimal_save_candidate,
    reopen_step_candidate: input.decision.visible_task.data
      .reopen_step_candidate,
    emotional_load: input.decision.local_assessment.emotional_load,
  });
  try {
    const raw = await generateWithGemini(
      suppressedVisibleSystemPrompt(input.decision.visible_task.kind),
      userPrompt,
      0.35,
      false,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source:
          `post_morning_nudge.suppressed_action_visible.${input.decision.visible_task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return cleanText(raw) || null;
  } catch (error) {
    console.warn("[PostMorningNudge] suppressed visible prompt failed", error);
    return null;
  }
}

function emotionalPresenceDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow post_morning_nudge.emotional_presence.",
    "Sophia a envoye ce matin un morning_nudge_v2 de type emotional_presence_nudge: l'objectif etait une presence emotionnelle ou une porte ouverte, sans action cible cachee.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "But: reconnaitre une reception simple, tenir un espace d'ecoute, demander la preference de soutien, proposer un point d'appui tres doux si le user le demande, reactiver doucement un cap si le user le demande, clarifier le besoin emotionnel, ou sortir vers le global si le message quitte ce followup.",
    "Actions possibles: presence_ack_close, hold_space_support, ask_support_preference, offer_soft_next_step, reactivate_gently, clarify_emotional_need, repeat_presence_context, negative_nudge_feedback, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Ne fais aucune regex metier, aucun mot-cle isole, aucune creation ou modification durable, aucune confirmation executable, aucun token de confirmation.",
    "N'invente jamais d'action cible. Ne revele aucun target action cache, car ce flow n'en a pas. Ne pousse pas l'execution, la responsabilisation ou un plan.",
    "Si le user demande explicitement une carte, potion, rappel, preference, modification de plan, aide produit, status, nouvel objectif ou autre sujet, retourne exit_to_global_dispatcher avec exit_memo utile.",
    "Si le user demande 'c'etait quoi l'action' ou equivalent, reste local avec repeat_presence_context et explique qu'il n'y avait pas d'action cachee dans ce nudge.",
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runPostMorningNudgeEmotionalPresenceDispatcher(
  input: PostMorningNudgeEmotionalPresenceDispatcherInput,
): Promise<PostMorningNudgeEmotionalPresenceDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_emotional_presence_dispatcher",
    source_nudge_json: input.active_state.source_nudge,
    post_morning_nudge_state_json: input.active_state,
    user_message: input.user_message,
    conversation_excerpt: input.recent_messages,
    turn_count: input.active_state.turn_count,
    max_turns: input.active_state.max_turns,
    emotional_presence_context: {
      source_reason: input.active_state.source_nudge.source_reason,
      source_grounding: input.active_state.source_nudge.source_grounding,
      coach_intent: input.active_state.source_nudge.coach_intent,
      posture: input.active_state.source_nudge.posture,
      target_action_titles: [],
      suppressed_action_titles: [],
    },
    required_json_shape: {
      flow_action:
        "presence_ack_close|hold_space_support|ask_support_preference|offer_soft_next_step|reactivate_gently|clarify_emotional_need|repeat_presence_context|negative_nudge_feedback|cancel_flow|exit_to_global_dispatcher|safety_preempt",
      confidence: "low|medium|high",
      risk_score: 0,
      local_assessment: {
        emotional_load: "low|medium|high|unknown",
        support_need:
          "none|listen|soft_next_step|reactivation|space|clarity|unknown",
        user_wants_conversation: true,
        action_readiness: "not_applicable|wants_direction|not_today|unknown",
        main_emotion_or_context: "string|null",
        soft_next_step_candidate: "string|null",
        reactivation_candidate: "string|null",
      },
      state_updates: {
        status: "active|closing|closed|exit_to_global|safety",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind:
          "presence_close|hold_space|ask_support_preference|offer_soft_next_step|reactivate_gently|clarify_emotional_need|repeat_presence_context|negative_feedback_close|exit_or_cancel|safety",
        instruction: "string",
        data: {
          source_nudge_summary: "string|null",
          main_emotion_or_context: "string|null",
          soft_next_step_candidate: "string|null",
          reactivation_candidate: "string|null",
          coach_intent: "string|null",
        },
      },
      exit_memo: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      emotionalPresenceDispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "post_morning_nudge.emotional_presence_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePostMorningNudgeEmotionalPresenceDispatcherOutput(
      raw,
      input.active_state,
    );
  } catch (error) {
    console.warn(
      "[PostMorningNudge] emotional presence dispatcher failed",
      error,
    );
    return null;
  }
}

function emotionalPresenceVisibleSystemPrompt(
  kind: PostMorningNudgeEmotionalPresenceVisibleTaskKind,
): string {
  const base = [
    "Tu ecris le prochain message visible de Sophia.",
    "Tu ne remplis pas l'etat, tu ne routes pas, tu ne crees aucun effet durable.",
    "Ne dis pas qu'une action, carte, potion, rappel, preference ou modification de plan a ete creee.",
    "N'invente aucune action cible et ne mets aucune pression d'execution.",
    "Retourne uniquement le message visible.",
  ];
  const byKind: Record<
    PostMorningNudgeEmotionalPresenceVisibleTaskKind,
    string
  > = {
    presence_close:
      "Le user accuse reception ou remercie. Reponds tres court, chaleureux, et ferme sans relancer.",
    hold_space:
      "Le user partage une charge ou un malaise. Tiens l'espace en une ou deux phrases, sans ramener a une action.",
    ask_support_preference:
      "Le user ne sait pas quoi faire de l'ouverture. Demande une seule preference de soutien, naturellement.",
    offer_soft_next_step:
      "Le user demande un petit point d'appui. Propose une seule micro-orientation douce, non executable comme une obligation.",
    reactivate_gently:
      "Le user veut reprendre un petit cap. Aide a retrouver une direction douce sans creer de plan ni carte.",
    clarify_emotional_need:
      "Le besoin emotionnel est flou. Pose une seule question claire et douce.",
    repeat_presence_context:
      "Le user demande pourquoi Sophia a envoye ce nudge ou quelle action etait visee. Rappelle que c'etait une porte ouverte sans action cachee.",
    negative_feedback_close:
      "Le user rejette le nudge. Reconnais le retour, baisse la presence, ferme sans insister.",
    exit_or_cancel:
      "Le user annule le followup sans autre demande a router. Ferme le flow local proprement.",
    safety:
      "Signal safety. Ne continue pas le coaching; reste minimal et laisse la pipeline safety reprendre.",
  };
  return [...base, byKind[kind]].join("\n");
}

export async function runPostMorningNudgeEmotionalPresenceVisiblePrompt(
  input: PostMorningNudgeEmotionalPresenceVisibleInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "post_morning_nudge_emotional_presence_visible_prompt",
    visible_task_kind: input.decision.visible_task.kind,
    visible_task_instruction: input.decision.visible_task.instruction,
    source_nudge_summary: input.decision.visible_task.data
      .source_nudge_summary,
    main_emotion_or_context: input.decision.visible_task.data
      .main_emotion_or_context,
    soft_next_step_candidate: input.decision.visible_task.data
      .soft_next_step_candidate,
    reactivation_candidate: input.decision.visible_task.data
      .reactivation_candidate,
    coach_intent: input.decision.visible_task.data.coach_intent,
    emotional_load: input.decision.local_assessment.emotional_load,
    support_need: input.decision.local_assessment.support_need,
    action_readiness: input.decision.local_assessment.action_readiness,
  });
  try {
    const raw = await generateWithGemini(
      emotionalPresenceVisibleSystemPrompt(input.decision.visible_task.kind),
      userPrompt,
      0.35,
      false,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source:
          `post_morning_nudge.emotional_presence_visible.${input.decision.visible_task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return cleanText(raw) || null;
  } catch (error) {
    console.warn(
      "[PostMorningNudge] emotional presence visible prompt failed",
      error,
    );
    return null;
  }
}

function mergeAssessment(
  current: PostMorningNudgeLocalAssessment,
  patch: Partial<PostMorningNudgeLocalAssessment> | undefined,
): PostMorningNudgeLocalAssessment {
  return {
    ...current,
    ...(patch ?? {}),
  };
}

export function reducePostMorningNudgeTurn(args: {
  state: PostMorningNudgeActiveState;
  dispatcherOutput: PostMorningNudgeDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  exitMemo: PostMorningNudgeExitMemo | null;
} {
  const nowIso = cleanText(args.nowIso) || new Date().toISOString();
  const turnCount = args.state.turn_count + 1;
  const baseState: PostMorningNudgeActiveState = {
    ...args.state,
    local_assessment: mergeAssessment(
      args.state.local_assessment,
      args.dispatcherOutput.local_assessment,
    ),
    turn_count: turnCount,
    updated_at: nowIso,
  };

  if (args.dispatcherOutput.flow_action === "exit_to_global_dispatcher") {
    return {
      nextState: null,
      exitMemo: args.dispatcherOutput.exit_memo ??
        buildPostMorningNudgeExitMemo({ state: baseState }),
    };
  }
  if (args.dispatcherOutput.flow_action === "safety_preempt") {
    return {
      nextState: { ...baseState, status: "safety" },
      exitMemo: null,
    };
  }
  if (
    args.dispatcherOutput.flow_action === "close_local" ||
    turnCount >= args.state.max_turns
  ) {
    return {
      nextState: { ...baseState, status: "closed" },
      exitMemo: null,
    };
  }
  return {
    nextState: baseState,
    exitMemo: null,
  };
}

function exitMemoFromActionOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeActionDispatcherOutput;
}): PostMorningNudgeExitMemo {
  return {
    needed: true,
    reason: args.output.exit_memo.reason === "none"
      ? "unknown"
      : args.output.exit_memo.reason,
    user_intent_summary: cleanText(args.output.exit_memo.user_intent_summary) ||
      "User message needs global dispatcher routing outside post morning nudge action followup.",
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "action",
      source_nudge_summary: args.output.exit_memo.local_flow_context
        .source_nudge_summary ?? summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: stringArray(
        args.output.exit_memo.local_flow_context.target_action_titles,
      ),
      suppressed_action_titles: [],
      suppression_reason: null,
      last_local_assessment: args.output.exit_memo.local_flow_context
        .last_local_assessment ?? JSON.stringify(args.output.local_assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: args.output.exit_memo.handoff_hint_for_global_dispatcher
        .likely_intent,
      why: cleanText(
        args.output.exit_memo.handoff_hint_for_global_dispatcher
          .why,
      ) || "Action followup dispatcher explicitly exited.",
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
      ],
    },
  };
}

export function reducePostMorningNudgeActionTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeActionDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  exitMemo: PostMorningNudgeExitMemo | null;
  closeAfterVisible: boolean;
} {
  if (args.state.flow_kind !== "action") {
    throw new Error("post_morning_nudge_action_reducer_requires_action_flow");
  }
  const nowIso = cleanText(args.nowIso) || new Date().toISOString();
  const turnIncrement = Math.max(
    1,
    Math.floor(
      Number(args.output.state_updates.turn_count_increment ?? 1) || 1,
    ),
  );
  const turnCount = args.state.turn_count + turnIncrement;
  const baseState: PostMorningNudgeActiveState = {
    ...args.state,
    local_assessment: mergeAssessment(
      args.state.local_assessment,
      args.output.local_assessment,
    ),
    turn_count: turnCount,
    updated_at: nowIso,
  };

  if (
    args.output.flow_action === "exit_to_global_dispatcher" ||
    args.output.flow_action === "safety_preempt"
  ) {
    return {
      nextState: null,
      exitMemo: exitMemoFromActionOutput({
        state: baseState,
        output: args.output,
      }),
      closeAfterVisible: true,
    };
  }

  const closeAfterVisible = args.output.state_updates.close_after_visible ||
    args.output.state_updates.status === "closed" ||
    args.output.state_updates.status === "closing" ||
    args.output.flow_action === "quick_close_ready" ||
    args.output.flow_action === "support_not_today" ||
    args.output.flow_action === "negative_nudge_feedback" ||
    args.output.flow_action === "cancel_flow" ||
    turnCount >= args.state.max_turns;

  if (closeAfterVisible) {
    return {
      nextState: { ...baseState, status: "closed" },
      exitMemo: null,
      closeAfterVisible: true,
    };
  }

  return {
    nextState: {
      ...baseState,
      status: args.output.state_updates.status === "active"
        ? "active"
        : "closing",
    },
    exitMemo: null,
    closeAfterVisible: false,
  };
}

function exitMemoFromSuppressedActionOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeSuppressedActionDispatcherOutput;
}): PostMorningNudgeExitMemo {
  return {
    needed: true,
    reason: args.output.exit_memo.reason === "none"
      ? "unknown"
      : args.output.exit_memo.reason,
    user_intent_summary: cleanText(args.output.exit_memo.user_intent_summary) ||
      "User message needs global dispatcher routing outside post morning nudge suppressed action followup.",
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "suppressed_action",
      source_nudge_summary: args.output.exit_memo.local_flow_context
        .source_nudge_summary ?? summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: stringArray(
        args.output.exit_memo.local_flow_context.target_action_titles,
      ),
      suppressed_action_titles: stringArray(
        args.output.exit_memo.local_flow_context.suppressed_action_titles,
      ),
      suppression_reason: args.output.exit_memo.local_flow_context
        .suppression_reason,
      last_local_assessment: args.output.exit_memo.local_flow_context
        .last_local_assessment ?? JSON.stringify(args.output.local_assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: args.output.exit_memo.handoff_hint_for_global_dispatcher
        .likely_intent,
      why: cleanText(
        args.output.exit_memo.handoff_hint_for_global_dispatcher
          .why,
      ) || "Suppressed action followup dispatcher explicitly exited.",
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
        "Remember that the source nudge intentionally suppressed an action instead of pushing it.",
      ],
    },
  };
}

export function reducePostMorningNudgeSuppressedActionTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeSuppressedActionDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  exitMemo: PostMorningNudgeExitMemo | null;
  closeAfterVisible: boolean;
} {
  if (args.state.flow_kind !== "suppressed_action") {
    throw new Error(
      "post_morning_nudge_suppressed_reducer_requires_suppressed_flow",
    );
  }
  const nowIso = cleanText(args.nowIso) || new Date().toISOString();
  const turnIncrement = Math.max(
    1,
    Math.floor(
      Number(args.output.state_updates.turn_count_increment ?? 1) || 1,
    ),
  );
  const turnCount = args.state.turn_count + turnIncrement;
  const baseState: PostMorningNudgeActiveState = {
    ...args.state,
    local_assessment: mergeAssessment(
      args.state.local_assessment,
      args.output.local_assessment,
    ),
    turn_count: turnCount,
    updated_at: nowIso,
  };

  if (
    args.output.flow_action === "exit_to_global_dispatcher" ||
    args.output.flow_action === "safety_preempt"
  ) {
    return {
      nextState: null,
      exitMemo: exitMemoFromSuppressedActionOutput({
        state: baseState,
        output: args.output,
      }),
      closeAfterVisible: true,
    };
  }

  const closeAfterVisible = args.output.state_updates.close_after_visible ||
    args.output.state_updates.status === "closed" ||
    args.output.state_updates.status === "closing" ||
    args.output.flow_action === "protective_close" ||
    args.output.flow_action === "confirm_no_action_today" ||
    args.output.flow_action === "negative_nudge_feedback" ||
    args.output.flow_action === "cancel_flow" ||
    turnCount >= args.state.max_turns;

  if (closeAfterVisible) {
    return {
      nextState: { ...baseState, status: "closed" },
      exitMemo: null,
      closeAfterVisible: true,
    };
  }

  return {
    nextState: {
      ...baseState,
      status: args.output.state_updates.status === "active"
        ? "active"
        : "closing",
    },
    exitMemo: null,
    closeAfterVisible: false,
  };
}

function exitMemoFromEmotionalPresenceOutput(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeEmotionalPresenceDispatcherOutput;
}): PostMorningNudgeExitMemo {
  return {
    needed: true,
    reason: args.output.exit_memo.reason === "none"
      ? "unknown"
      : args.output.exit_memo.reason,
    user_intent_summary: cleanText(args.output.exit_memo.user_intent_summary) ||
      "User message needs global dispatcher routing outside post morning nudge emotional presence followup.",
    local_flow_context: {
      skill_id: "post_morning_nudge",
      flow_kind: "emotional_presence",
      source_nudge_summary: args.output.exit_memo.local_flow_context
        .source_nudge_summary ?? summarizeSourceNudge(args.state.source_nudge),
      target_action_titles: [],
      suppressed_action_titles: [],
      suppression_reason: null,
      last_local_assessment: args.output.exit_memo.local_flow_context
        .last_local_assessment ?? JSON.stringify(args.output.local_assessment),
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: args.output.exit_memo.handoff_hint_for_global_dispatcher
        .likely_intent,
      why: cleanText(
        args.output.exit_memo.handoff_hint_for_global_dispatcher
          .why,
      ) || "Emotional presence followup dispatcher explicitly exited.",
      constraints: [
        "Do not treat this as post_morning_nudge continuation unless selected again.",
        "Remember that the source nudge had no hidden target action.",
      ],
    },
  };
}

export function reducePostMorningNudgeEmotionalPresenceTurn(args: {
  state: PostMorningNudgeActiveState;
  output: PostMorningNudgeEmotionalPresenceDispatcherOutput;
  nowIso?: string | null;
}): {
  nextState: PostMorningNudgeActiveState | null;
  exitMemo: PostMorningNudgeExitMemo | null;
  closeAfterVisible: boolean;
} {
  if (args.state.flow_kind !== "emotional_presence") {
    throw new Error(
      "post_morning_nudge_emotional_presence_reducer_requires_emotional_presence_flow",
    );
  }
  const nowIso = cleanText(args.nowIso) || new Date().toISOString();
  const turnIncrement = Math.max(
    1,
    Math.floor(
      Number(args.output.state_updates.turn_count_increment ?? 1) || 1,
    ),
  );
  const turnCount = args.state.turn_count + turnIncrement;
  const baseState: PostMorningNudgeActiveState = {
    ...args.state,
    local_assessment: mergeAssessment(
      args.state.local_assessment,
      args.output.local_assessment,
    ),
    turn_count: turnCount,
    updated_at: nowIso,
  };

  if (
    args.output.flow_action === "exit_to_global_dispatcher" ||
    args.output.flow_action === "safety_preempt"
  ) {
    return {
      nextState: null,
      exitMemo: exitMemoFromEmotionalPresenceOutput({
        state: baseState,
        output: args.output,
      }),
      closeAfterVisible: true,
    };
  }

  const closeAfterVisible = args.output.state_updates.close_after_visible ||
    args.output.state_updates.status === "closed" ||
    args.output.state_updates.status === "closing" ||
    args.output.flow_action === "presence_ack_close" ||
    args.output.flow_action === "negative_nudge_feedback" ||
    args.output.flow_action === "cancel_flow" ||
    turnCount >= args.state.max_turns;

  if (closeAfterVisible) {
    return {
      nextState: { ...baseState, status: "closed" },
      exitMemo: null,
      closeAfterVisible: true,
    };
  }

  return {
    nextState: {
      ...baseState,
      status: args.output.state_updates.status === "active"
        ? "active"
        : "closing",
    },
    exitMemo: null,
    closeAfterVisible: false,
  };
}

function visibleTaskForFlow(
  flowKind: PostMorningNudgeFlowKind,
): PostMorningNudgeVisibleTaskKind {
  if (flowKind === "action") return "action_followup";
  if (flowKind === "suppressed_action") return "suppressed_action_support";
  return "emotional_presence";
}

function stubVisibleContent(state: PostMorningNudgeActiveState): string {
  if (state.flow_kind === "action") {
    return "Je te suis sur le cap de ce matin. On le garde simple: vise juste le prochain petit pas, sans te mettre de pression.";
  }
  if (state.flow_kind === "suppressed_action") {
    return "Je garde l'intention douce de ce matin: aujourd'hui, on ne force pas. Tu peux proteger ton energie et ne sauver qu'un tout petit morceau si tu en as vraiment envie.";
  }
  return "Je reste avec toi dans l'ouverture de ce matin. Pas besoin de revenir tout de suite a l'action; dis-moi juste ce qui est la pour toi maintenant.";
}

export async function runPostMorningNudgeLocalRuntime(args: {
  tempMemory: unknown;
  userId?: string | null;
  userMessage?: string | null;
  history?: Array<{ role?: string; content?: string }> | null;
  requestId?: string | null;
  dispatcher?: (
    state: PostMorningNudgeActiveState,
  ) => Promise<PostMorningNudgeDispatcherOutput>;
  actionDispatcher?: PostMorningNudgeActionDispatcher;
  actionVisibleAgent?: PostMorningNudgeActionVisibleAgent;
  suppressedActionDispatcher?: PostMorningNudgeSuppressedActionDispatcher;
  suppressedActionVisibleAgent?: PostMorningNudgeSuppressedActionVisibleAgent;
  emotionalPresenceDispatcher?: PostMorningNudgeEmotionalPresenceDispatcher;
  emotionalPresenceVisibleAgent?: PostMorningNudgeEmotionalPresenceVisibleAgent;
  nowIso?: string | null;
}): Promise<PostMorningNudgeRuntimeResult | null> {
  const state = readPostMorningNudgeActiveState(args.tempMemory);
  if (!state) return null;
  const dispatcherId = resolvePostMorningNudgeDispatcher(state);
  if (state.flow_kind === "action" && !args.dispatcher) {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const actionDispatcher = args.actionDispatcher ??
      runPostMorningNudgeActionDispatcher;
    const actionOutput = await actionDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
    });
    if (!actionOutput) return null;
    const reduced = reducePostMorningNudgeActionTurn({
      state,
      output: actionOutput,
      nowIso: args.nowIso,
    });
    let nextTempMemory = clearPostMorningNudgeActiveState(args.tempMemory);
    if (
      reduced.nextState?.status === "active" ||
      reduced.nextState?.status === "closing"
    ) {
      nextTempMemory = writePostMorningNudgeActiveState(
        nextTempMemory,
        reduced.nextState,
      );
    }
    if (reduced.exitMemo) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY] = {
        ...reduced.exitMemo,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = actionOutput.flow_action ===
        "exit_to_global_dispatcher" ||
      actionOutput.flow_action === "safety_preempt";
    const visibleAgent = args.actionVisibleAgent ??
      runPostMorningNudgeActionVisiblePrompt;
    const visibleContent = exitToGlobal ? "" : await visibleAgent({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      state,
      decision: actionOutput,
    });
    if (!exitToGlobal && !cleanText(visibleContent)) return null;
    return {
      content: exitToGlobal ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.action_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "action",
        status: exitToGlobal ? "exit_to_global" : reduced.nextState?.status ??
          "closed",
        reason_code: exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_action_local_dispatcher",
        "post_morning_nudge.action_dispatcher_called": true,
        flow_action: actionOutput.flow_action,
        confidence: actionOutput.confidence,
        risk_score: actionOutput.risk_score,
        visible_task: actionOutput.visible_task,
        local_assessment: actionOutput.local_assessment,
        state_updates: actionOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        exit_memo: reduced.exitMemo,
        no_chat_mutation: true,
        no_durable_mutation: {
          action_created: false,
          card_created: false,
          potion_created: false,
          reminder_created: false,
          scheduled_checkin_created: false,
          preference_written: false,
          plan_patch_written: false,
        },
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        ai_call_count: exitToGlobal ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.action_dispatcher",
          event: actionOutput.flow_action,
          "post_morning_nudge.flow_kind": "action",
          flow_action: actionOutput.flow_action,
          "visible_task.kind": actionOutput.visible_task.kind,
          "local_assessment.action_readiness": actionOutput.local_assessment
            .action_readiness,
          "local_assessment.motivation_need": actionOutput.local_assessment
            .motivation_need,
          "state_updates.status": actionOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal,
          "exit_to_global_dispatcher": exitToGlobal,
          "exit_memo.reason": reduced.exitMemo?.reason ?? null,
        }],
      },
    };
  }
  if (state.flow_kind === "suppressed_action" && !args.dispatcher) {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const suppressedDispatcher = args.suppressedActionDispatcher ??
      runPostMorningNudgeSuppressedActionDispatcher;
    const suppressedOutput = await suppressedDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
    });
    if (!suppressedOutput) return null;
    const reduced = reducePostMorningNudgeSuppressedActionTurn({
      state,
      output: suppressedOutput,
      nowIso: args.nowIso,
    });
    let nextTempMemory = clearPostMorningNudgeActiveState(args.tempMemory);
    if (
      reduced.nextState?.status === "active" ||
      reduced.nextState?.status === "closing"
    ) {
      nextTempMemory = writePostMorningNudgeActiveState(
        nextTempMemory,
        reduced.nextState,
      );
    }
    if (reduced.exitMemo) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY] = {
        ...reduced.exitMemo,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = suppressedOutput.flow_action ===
        "exit_to_global_dispatcher" ||
      suppressedOutput.flow_action === "safety_preempt";
    const visibleAgent = args.suppressedActionVisibleAgent ??
      runPostMorningNudgeSuppressedActionVisiblePrompt;
    const visibleContent = exitToGlobal ? "" : await visibleAgent({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      state,
      decision: suppressedOutput,
    });
    if (!exitToGlobal && !cleanText(visibleContent)) return null;
    return {
      content: exitToGlobal ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.suppressed_action_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "suppressed_action",
        status: exitToGlobal ? "exit_to_global" : reduced.nextState?.status ??
          "closed",
        reason_code: exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_suppressed_action_local_dispatcher",
        "post_morning_nudge.suppressed_action_dispatcher_called": true,
        flow_action: suppressedOutput.flow_action,
        confidence: suppressedOutput.confidence,
        risk_score: suppressedOutput.risk_score,
        visible_task: suppressedOutput.visible_task,
        local_assessment: suppressedOutput.local_assessment,
        state_updates: suppressedOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        exit_memo: reduced.exitMemo,
        no_chat_mutation: true,
        no_durable_mutation: {
          action_created: false,
          card_created: false,
          potion_created: false,
          reminder_created: false,
          scheduled_checkin_created: false,
          preference_written: false,
          plan_patch_written: false,
        },
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        ai_call_count: exitToGlobal ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.suppressed_action_dispatcher",
          event: suppressedOutput.flow_action,
          "post_morning_nudge.flow_kind": "suppressed_action",
          flow_action: suppressedOutput.flow_action,
          "visible_task.kind": suppressedOutput.visible_task.kind,
          "local_assessment.action_readiness": suppressedOutput
            .local_assessment.action_readiness,
          "local_assessment.suppression_still_valid": suppressedOutput
            .local_assessment.suppression_still_valid ?? true,
          "local_assessment.main_need": suppressedOutput.local_assessment
            .main_need ?? null,
          "state_updates.status": suppressedOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal,
          "exit_to_global_dispatcher": exitToGlobal,
          "exit_memo.reason": reduced.exitMemo?.reason ?? null,
        }],
      },
    };
  }
  if (state.flow_kind === "emotional_presence" && !args.dispatcher) {
    const recentMessages = (args.history ?? []).slice(-8).map((message) => ({
      role: message?.role === "assistant"
        ? "assistant" as const
        : "user" as const,
      content: cleanText(message?.content),
    })).filter((message) => message.content);
    const emotionalDispatcher = args.emotionalPresenceDispatcher ??
      runPostMorningNudgeEmotionalPresenceDispatcher;
    const emotionalOutput = await emotionalDispatcher({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      user_message: cleanText(args.userMessage),
      recent_messages: recentMessages,
      active_state: state,
    });
    if (!emotionalOutput) return null;
    const reduced = reducePostMorningNudgeEmotionalPresenceTurn({
      state,
      output: emotionalOutput,
      nowIso: args.nowIso,
    });
    let nextTempMemory = clearPostMorningNudgeActiveState(args.tempMemory);
    if (
      reduced.nextState?.status === "active" ||
      reduced.nextState?.status === "closing"
    ) {
      nextTempMemory = writePostMorningNudgeActiveState(
        nextTempMemory,
        reduced.nextState,
      );
    }
    if (reduced.exitMemo) {
      nextTempMemory[LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY] = {
        ...reduced.exitMemo,
        at: cleanText(args.nowIso) || new Date().toISOString(),
      };
    }
    const exitToGlobal = emotionalOutput.flow_action ===
        "exit_to_global_dispatcher" ||
      emotionalOutput.flow_action === "safety_preempt";
    const visibleAgent = args.emotionalPresenceVisibleAgent ??
      runPostMorningNudgeEmotionalPresenceVisiblePrompt;
    const visibleContent = exitToGlobal ? "" : await visibleAgent({
      user_id: cleanText(args.userId) || "unknown",
      request_id: args.requestId ?? null,
      state,
      decision: emotionalOutput,
    });
    if (!exitToGlobal && !cleanText(visibleContent)) return null;
    return {
      content: exitToGlobal ? "" : cleanText(visibleContent),
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "post_morning_nudge.emotional_presence_dispatcher",
        skill_id: "post_morning_nudge",
        flow_kind: "emotional_presence",
        status: exitToGlobal ? "exit_to_global" : reduced.nextState?.status ??
          "closed",
        reason_code: exitToGlobal
          ? "post_morning_nudge_local_exit_to_global_dispatcher"
          : "post_morning_nudge_emotional_presence_local_dispatcher",
        "post_morning_nudge.emotional_presence_dispatcher_called": true,
        flow_action: emotionalOutput.flow_action,
        confidence: emotionalOutput.confidence,
        risk_score: emotionalOutput.risk_score,
        visible_task: emotionalOutput.visible_task,
        local_assessment: emotionalOutput.local_assessment,
        state_updates: emotionalOutput.state_updates,
        close_after_visible: reduced.closeAfterVisible,
        exit_memo: reduced.exitMemo,
        no_chat_mutation: true,
        no_durable_mutation: {
          action_created: false,
          card_created: false,
          potion_created: false,
          reminder_created: false,
          scheduled_checkin_created: false,
          preference_written: false,
          plan_patch_written: false,
        },
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        ai_call_count: exitToGlobal ? 1 : 2,
        runtime_trace: [{
          component: "post_morning_nudge.emotional_presence_dispatcher",
          event: emotionalOutput.flow_action,
          "post_morning_nudge.flow_kind": "emotional_presence",
          flow_action: emotionalOutput.flow_action,
          "visible_task.kind": emotionalOutput.visible_task.kind,
          "local_assessment.emotional_load": emotionalOutput.local_assessment
            .emotional_load,
          "local_assessment.support_need": emotionalOutput.local_assessment
            .support_need ?? null,
          "local_assessment.action_readiness": emotionalOutput.local_assessment
            .action_readiness,
          "state_updates.status": emotionalOutput.state_updates.status,
          close_after_visible: reduced.closeAfterVisible,
          "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal,
          "exit_to_global_dispatcher": exitToGlobal,
          "exit_memo.reason": reduced.exitMemo?.reason ?? null,
        }],
      },
    };
  }
  const dispatcherOutput = args.dispatcher ? await args.dispatcher(state) : {
    dispatcher_id: dispatcherId,
    flow_action: state.turn_count + 1 >= state.max_turns
      ? "close_local"
      : "continue_local",
    visible_task: { kind: visibleTaskForFlow(state.flow_kind) },
    no_durable_mutation: {
      action_created: false,
      card_created: false,
      potion_created: false,
      reminder_created: false,
      scheduled_checkin_created: false,
      preference_written: false,
      plan_patch_written: false,
    },
  } satisfies PostMorningNudgeDispatcherOutput;
  const reduced = reducePostMorningNudgeTurn({
    state,
    dispatcherOutput,
    nowIso: args.nowIso,
  });
  let nextTempMemory = clearPostMorningNudgeActiveState(args.tempMemory);
  if (
    reduced.nextState?.status === "active" ||
    reduced.nextState?.status === "closing"
  ) {
    nextTempMemory = writePostMorningNudgeActiveState(
      nextTempMemory,
      reduced.nextState,
    );
  }
  if (reduced.exitMemo) {
    nextTempMemory[LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY] = {
      ...reduced.exitMemo,
      at: cleanText(args.nowIso) || new Date().toISOString(),
    };
  }
  const exitToGlobal = dispatcherOutput.flow_action ===
    "exit_to_global_dispatcher";
  return {
    content: exitToGlobal ? "" : stubVisibleContent(state),
    nextTempMemory,
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: dispatcherId,
      skill_id: "post_morning_nudge",
      flow_kind: state.flow_kind,
      status: exitToGlobal ? "exit_to_global" : reduced.nextState?.status ??
        "closed",
      reason_code: exitToGlobal
        ? "post_morning_nudge_local_exit_to_global_dispatcher"
        : "post_morning_nudge_local_dispatcher",
      flow_action: dispatcherOutput.flow_action,
      visible_task: dispatcherOutput.visible_task,
      exit_memo: reduced.exitMemo,
      no_chat_mutation: true,
      no_durable_mutation: dispatcherOutput.no_durable_mutation,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      runtime_trace: [{
        component: dispatcherId,
        event: dispatcherOutput.flow_action,
        "post_morning_nudge.flow_kind": state.flow_kind,
        "global_dispatcher_skipped_due_post_morning_nudge": !exitToGlobal,
        "exit_to_global_dispatcher": exitToGlobal,
        "exit_memo.reason": reduced.exitMemo?.reason ?? null,
      }],
    },
  };
}
